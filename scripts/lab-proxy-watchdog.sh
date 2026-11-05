#!/bin/bash
# lab-proxy-watchdog: keep the one-domain launcher usable without the user caring.
#   1. start any lab containers that exited (a Mac/OrbStack restart leaves them down)
#   2. start the lab-proxy (or recreate it, so nginx DNS re-resolves against the now-running labs)
#   3. verify https://local.ping-devops.com:8443 answers; retry once
# Safe to run any number of times: every step is idempotent. Exits 0 when the proxy serves, 1 otherwise.
set -u
PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
root="$(cd "$(dirname "$0")/.." && pwd)"
docker_ctx="orbstack"

docker_ok() { docker --context "$docker_ctx" info >/dev/null 2>&1; }

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

# 1. every lab container that exited starts again (only ones with a compose label: never stray containers)
started=0
for c in $(docker --context "$docker_ctx" ps -a --format '{{.Names}}\t{{.Status}}' | awk '$2 ~ /Exited/ {print $1}'); do
  labels=$(docker --context "$docker_ctx" inspect "$c" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null)
  [ -n "$labels" ] && docker --context "$docker_ctx" start "$c" >/dev/null 2>&1 && started=$((started + 1))
done
[ "$started" -gt 0 ] && echo "lab-proxy-watchdog: started $started stopped container(s)"

# 2. the proxy itself: up -d (no-op when healthy and config unchanged), recreate when the config changed
proxy_up() {
  docker --context "$docker_ctx" compose -p lab-proxy -f "$root/shared/lab-proxy/docker-compose.yml" up -d --force-recreate >/dev/null 2>&1
}
proxy_ok() {
  curl -sk -o /dev/null --max-time 4 "https://local.ping-devops.com:8443/api/health" 2>/dev/null
}

# Even with compose up -d, nginx exits at boot if a lab's DNS misses. Force-recreate re-reads config
# now that every lab container is running.
proxy_up
if ! proxy_ok; then sleep 3; proxy_up; fi
if proxy_ok; then
  echo "lab-proxy-watchdog: https://local.ping-devops.com:8443 is serving"
  exit 0
fi
echo "lab-proxy-watchdog: the proxy is still not serving; run 'docker logs lab-proxy-lab-proxy-1' for why"
exit 1
