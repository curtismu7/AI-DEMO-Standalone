#!/bin/bash
# lab-proxy-watchdog: keep the one-domain launcher usable without the user caring.
#   1. start any lab containers that exited (a Mac/OrbStack restart leaves them down)
#   2. start the lab-proxy (or recreate it, so nginx DNS re-resolves against the now-running labs)
#   3. verify https://local.ping-devops.com:8443 answers; retry once
# Safe to run any number of times: every step is idempotent. Exits 0 when the proxy serves, 1 otherwise.
set -u
PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
root="$(cd "$(dirname "$0")/.." && pwd)"

# Keep the shelf's start agent alive too: Start/Stop buttons in the shelf need it
# (the containerised shelf cannot run docker on the host by itself). Loopback only.
agent_dir="$root/standalone/demo-shelf-LAB"
if [ -d "$agent_dir" ] && ! lsof -iTCP:4405 -sTCP:LISTEN > /dev/null 2>&1; then
  (cd "$agent_dir" && nohup npm run agent > /tmp/standalone-demo-shelf-agent.log 2>&1 &)
fi
# Prefer OrbStack; fall back to whatever Docker engine answers (Docker Desktop, etc.).
docker_ctx="${DOCKER_CONTEXT:-orbstack}"
docker_ok() { docker --context "$docker_ctx" info >/dev/null 2>&1; }
if ! docker_ok && docker info >/dev/null 2>&1; then
  docker_ctx="default"
fi

# SHELF_URL for the labs' compose files (the header "Shelf" button): the one shared settings file is the source.
env_file="${STANDALONE_ENV:-$HOME/Development/.env}"
if [ -z "${SHELF_URL:-}" ] && grep -q "^SHELF_URL=" "$env_file" 2>/dev/null; then
  SHELF_URL="$(grep -E "^SHELF_URL=" "$env_file" | tail -1 | cut -d= -f2-)"
  export SHELF_URL
fi

if ! docker_ok; then
  # OrbStack starts on demand; give it one nudge and a short wait.
  open -a OrbStack 2>/dev/null || true
  for _ in 1 2 3 4 5 6; do docker_ok && break; sleep 2; done
fi
if ! docker_ok; then echo "lab-proxy-watchdog: Docker (OrbStack) is not running"; exit 1; fi

# Skip list: container-name globs (one per line, # comments) that step 1 never auto-starts, so a
# lab you stopped on purpose stays stopped. No file = no skips (the default for every user).
# Only step 1 reads it: the proxy (step 2) and the shelf start agent are always kept up.
skip_file="${WATCHDOG_SKIP_FILE:-$HOME/.config/demo-kit/watchdog-skip}"
is_skipped() {  # is_skipped <container> — does it match a pattern in the skip file?
  [ -r "$skip_file" ] || return 1
  while IFS= read -r pat || [ -n "$pat" ]; do
    pat=$(printf '%s' "${pat%%#*}" | tr -d '[:space:]')
    [ -z "$pat" ] && continue
    case "$1" in $pat) return 0 ;; esac
  done < "$skip_file"
  return 1
}

# 1. every lab container that exited starts again (only ones with a compose label: never stray containers)
started=0
skipped=0
for c in $(docker --context "$docker_ctx" ps -a --format '{{.Names}}\t{{.Status}}' | awk '$2 ~ /Exited/ {print $1}'); do
  if is_skipped "$c"; then skipped=$((skipped + 1)); continue; fi
  labels=$(docker --context "$docker_ctx" inspect "$c" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null)
  [ -n "$labels" ] && docker --context "$docker_ctx" start "$c" >/dev/null 2>&1 && started=$((started + 1))
done
[ "$started" -gt 0 ] && echo "lab-proxy-watchdog: started $started stopped container(s)"
[ "$skipped" -gt 0 ] && echo "lab-proxy-watchdog: left $skipped stopped container(s) alone (skip list: $skip_file)"

# 1b. attach the proxy to every running lab's compose network (idempotent): nginx
# resolves lab container names through these networks; a recreated proxy loses them,
# so this runs AFTER proxy_up below, and nginx reloads when anything was attached.
proxy_net_attached() {  # proxy_net_attached <network> — is the proxy already on it?
  docker --context "$docker_ctx" network inspect "$1" --format '{{range $k,$v := .Containers}}{{$v.Name}} {{end}}' 2>/dev/null | grep -qw lab-proxy-lab-proxy-1
}
attach_lab_networks() {
  attached=0
  for c in $(docker --context "$docker_ctx" ps --format '{{.Names}}'); do
    # a container can sit on several networks (e.g. its own + ping-shared): attach to each
    for net in $(docker --context "$docker_ctx" inspect "$c" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null); do
      case "$net" in bridge|host|none) continue ;; esac
      proxy_net_attached "$net" && continue
      docker --context "$docker_ctx" network connect "$net" lab-proxy-lab-proxy-1 >/dev/null 2>&1 && attached=$((attached + 1))
    done
  done
  [ "$attached" -gt 0 ] && echo "lab-proxy-watchdog: attached proxy to $attached lab network(s)" && return 0
  return 1
}

# 2. the proxy itself: up -d (no-op when healthy and config unchanged), recreate when the config changed
proxy_up() {
  docker --context "$docker_ctx" compose -p lab-proxy -f "$root/shared/lab-proxy/docker-compose.yml" up -d >/dev/null 2>&1
}
proxy_ok() {
  curl -sk -o /dev/null --max-time 4 "https://local.ping-devops.com:8443/api/health" 2>/dev/null
}

# proxy_up: plain up -d — recreates only when config/image changed, so manual network
# attaches (step 1b) survive a run where nothing changed.
proxy_up
if ! proxy_ok; then sleep 3; proxy_up; fi
# New networks mean new DNS interfaces for nginx: reload when the attach pass added any.
attach_lab_networks && docker --context "$docker_ctx" exec lab-proxy-lab-proxy-1 nginx -s reload >/dev/null 2>&1
if proxy_ok; then
  echo "lab-proxy-watchdog: https://local.ping-devops.com:8443 is serving"
  exit 0
fi
echo "lab-proxy-watchdog: the proxy is still not serving; run 'docker logs lab-proxy-lab-proxy-1' for why"
exit 1
