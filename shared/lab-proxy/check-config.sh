#!/bin/sh
# Guards the lab-proxy config: a STATIC proxy_pass to a container DNS name makes nginx refuse to
# start when that lab's container is down, which takes the shelf and EVERY lab offline (seen 2026-11-06).
# Every proxy_pass must go through a runtime-resolved variable (set $x host:port; proxy_pass http://$x)
# or the $lab_upstream map, so the proxy boots regardless of which labs are running.
# Usage: ./check-config.sh [nginx.conf]
set -e
CONF="${1:-$(dirname "$0")/nginx.conf}"
BAD=$(grep -nE 'proxy_pass\s+http://[A-Za-z0-9._-]+:' "$CONF" | grep -vE 'proxy_pass\s+http://(\$|host\.docker\.internal|127\.0\.0\.1|localhost)' || true)
if [ -n "$BAD" ]; then
  echo "FAIL: static proxy_pass to a container name (nginx will not start while that container is down):" >&2
  echo "$BAD" >&2
  exit 1
fi
echo "ok: every proxy_pass resolves at request time"
