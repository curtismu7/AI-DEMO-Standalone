#!/usr/bin/env bash
# CI check: the lab's Postman collection must stay green against the lab's own
# server. Boots the server on a spare port, waits healthy, runs newman with the
# committed placeholder environment, tears down.
#
# Usage (from a lab repo root):
#   bash ../../shared/postman/ci-check.sh <slug> <health-path> [start-cmd...]
#
#   slug        collection slug: postman/<slug>.postman_collection.json
#   health-path health endpoint relative to the server root (e.g. /api/health)
#   start-cmd   command that starts the server (default: `npm start`).
#               Receives PORT and LAB_BASE env vars; the script kills it on exit.
#
# The server must honour PORT. Mock-only labs need no environment; if the lab
# needs settings, the workflow sets them as env vars before calling this.

set -euo pipefail

SLUG="${1:?usage: ci-check.sh <slug> <health-path> [start-cmd...]}"
HEALTH="${2:?usage: ci-check.sh <slug> <health-path> [start-cmd...]}"
shift 2
START_CMD=("$@")
[ ${#START_CMD[@]} -eq 0 ] && START_CMD=(npm start)

COLLECTION="postman/${SLUG}.postman_collection.json"
ENV_FILE="postman/${SLUG}.live.environment.example.json"
[ -f "$COLLECTION" ] || { echo "missing $COLLECTION (generate it with shared/postman/generator.mjs)" >&2; exit 1; }

# Port: the collection spec's baseUrl knows the lab's real port (the runner is
# fresh, so it is free). CI_CHECK_PORT overrides.
if [ -n "${CI_CHECK_PORT:-}" ]; then
  PORT="$CI_CHECK_PORT"
else
  # The collection spec's baseUrl knows the lab's real port (the runner is
  # fresh, so it is free).
  PORT=$(node -e "const fs=require('fs'); try { console.log(new URL(JSON.parse(fs.readFileSync('postman/spec.json','utf8')).baseUrl).port || 80); } catch { console.log(5910); }")
fi
export PORT
# Some labs honour their own port variable instead of PORT (e.g. token-workbench's
# TW_PORT); setting both is harmless where PORT already works.
export TW_PORT="$PORT"
export MOCKAZ_PORT="$PORT"
export MGLAB_PORT="$PORT"
export LAB_BASE="http://localhost:${PORT}"

cleanup() { [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "[ci-check] starting server: ${START_CMD[*]} (PORT=${PORT})"
"${START_CMD[@]}" &
SERVER_PID=$!

for i in $(seq 1 30); do
  if curl -sf -m 2 "http://localhost:${PORT}${HEALTH}" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then echo "[ci-check] server exited during startup" >&2; exit 1; fi
  sleep 1
  [ "$i" = 30 ] && { echo "[ci-check] server not healthy after 30s" >&2; exit 1; }
done
echo "[ci-check] server healthy"

# Real-mode-only requests in a collection must tolerate the lab's own refusal:
# the committed placeholder environment has no tenant settings, so a 409 answer
# is the lab correctly reporting "not configured" — the collection's tests
# accept those statuses. newman exits non-zero on any assertion failure.
# --env-var LAB_BASE overrides the collection's baked-in base URL so the
# collection runs against the CI port, not the port the URL was written for.
npx -y newman@6 run "$COLLECTION" -e "$ENV_FILE" --env-var "LAB_BASE=http://localhost:${PORT}" --reporters cli
echo "[ci-check] collection green"
