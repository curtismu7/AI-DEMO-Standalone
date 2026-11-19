#!/bin/bash
# lab-proxy reload: the safe way to restart or reload the lab-proxy after an nginx.conf change.
#
# Why this exists: `docker compose restart lab-proxy` (or a recreate) drops the proxy's manually
# attached lab compose networks — nginx then cannot resolve lab container names and every lab
# 502s until the launchd watchdog's next 5-minute cycle re-attaches them. This script does the
# restart AND the re-attach AND the nginx reload in one go, so there is no outage window.
#
# Usage: shared/lab-proxy/reload.sh [--restart|--config-only]
#   --restart     recreate/restart the proxy container (needed when nginx.conf changed: the
#                 bind mount pins the old file)  — default
#   --config-only just `nginx -s reload` (enough for config changes that survive, rarely used)

set -eu
PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
root="$(cd "$(dirname "$0")/../.." && pwd)"
conf="$root/shared/lab-proxy/nginx.conf"
proxy="lab-proxy-lab-proxy-1"
docker_ctx="${DOCKER_CONTEXT:-orbstack}"
docker() { command docker --context "$docker_ctx" "$@"; }

mode="--restart"; [ "${1:-}" = "--config-only" ] && mode="$1"

if [ "$mode" = "--restart" ]; then
  # validate before touching the running proxy
  docker run --rm -v "$conf":/etc/nginx/conf.d/default.conf:ro \
    -v "$root/shared/tls":/etc/nginx/certs:ro nginx:alpine nginx -t >/dev/null
  docker compose -p lab-proxy -f "$root/shared/lab-proxy/docker-compose.yml" up -d --force-recreate >/dev/null
  sleep 1
fi

# re-attach to every running lab's compose network (what the watchdog's step 1b does),
# then reload so nginx picks up the new DNS interfaces. ONE bulk network inspect instead
# of per-network calls: ~96 networks x 2 docker calls was ~90s, the bulk pass is ~2s.
attached=0
need=""
while read -r net; do
  case "$net" in bridge|host|none) continue ;; esac
  need="$need $net"
done < <(docker network ls --format '{{.Name}}')
while read -r net names; do
  case "$names" in *lab-proxy-lab-proxy-1*) need="${need// $net/}" ;; esac
done < <(docker network inspect $(docker network ls -q) --format '{{.Name}} {{range .Containers}}{{.Name}} {{end}}' 2>/dev/null)
for net in $need; do
  docker network connect "$net" "$proxy" >/dev/null 2>&1 && attached=$((attached + 1))
done
docker exec "$proxy" nginx -s reload >/dev/null 2>&1 || true

# verify
code="$(curl -sk -o /dev/null --max-time 4 -w '%{http_code}' https://local.ping-devops.com:8443/api/health 2>/dev/null || echo 000)"
if [ "$code" = "200" ]; then
  echo "lab-proxy reloaded OK (attached $attached network(s)); https://local.ping-devops.com:8443 is serving"
else
  echo "WARNING: proxy reloaded but /api/health answered $code; check: docker logs $proxy" >&2
  exit 1
fi
