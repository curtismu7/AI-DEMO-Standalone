#!/bin/sh
# Guards the lab-proxy config: a STATIC proxy_pass to a container DNS name makes nginx refuse to
# start when that lab's container is down, which takes the shelf and EVERY lab offline (seen 2026-11-06).
# Every proxy_pass must go through a runtime-resolved variable (set $x host:port; proxy_pass http://$x)
# or the $lab_upstream map, so the proxy boots regardless of which labs are running.
# https:// upstreams count too (2026-11-24: two static https:// /keys routes slipped past an http-only check and made reload.sh's validation fail).
# Usage: ./check-config.sh [nginx.conf]
set -e
CONF="${1:-$(dirname "$0")/nginx.conf}"
BAD=$(grep -nE 'proxy_pass\s+https?://[A-Za-z0-9._-]+:' "$CONF" | grep -vE 'proxy_pass\s+https?://(\$|host\.docker\.internal|127\.0\.0\.1|localhost)' || true)
if [ -n "$BAD" ]; then
  echo "FAIL: static proxy_pass to a container name (nginx will not start while that container is down):" >&2
  echo "$BAD" >&2
  exit 1
fi
# A DNS label is at most 63 characters. A compose container name <project>-<service>-1 is over that for a lab whose name is 33+ characters
# (privilege-bedrock-assume-role-lab, 2026-11-24): Docker DNS answers "Format error" and the lab 502s/hangs. Use the service name instead
# (compose registers it as an alias on the lab's network).
LONG=$(grep -nE '[A-Za-z0-9-]{64,}:[0-9]+' "$CONF" || true)
if [ -n "$LONG" ]; then
  echo "FAIL: an upstream host name is longer than 63 characters (not a valid DNS label); use the compose service name:" >&2
  echo "$LONG" >&2
  exit 1
fi
echo "ok: every proxy_pass resolves at request time"
