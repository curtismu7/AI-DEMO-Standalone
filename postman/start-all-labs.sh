#!/usr/bin/env bash
# Start every standalone lab that has a Postman collection, so a full
# postman/all-labs run works without touching anything by hand.
#
#   bash postman/start-all-labs.sh            # start whatever is down
#   bash postman/start-all-labs.sh --stop     # stop the docker labs it started
#   bash postman/start-all-labs.sh --check    # only report, start nothing
#
# Docker labs: docker compose up -d (host-run npm labs: started with nohup).
# Ports and expectations come from each lab's postman/spec.json baseUrl.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
STOP=0; CHECK=0
[ "${1:-}" = "--stop" ] && STOP=1
[ "${1:-}" = "--check" ] && CHECK=1

started=0; already=0; failed=0
declare -a STARTED_NPM

labs=()
for d in standalone/*/; do
  d="${d%/}"
  [ -f "$d/postman/spec.json" ] && labs+=("$d")
done

for lab in "${labs[@]}"; do
  name=$(basename "$lab")
  port=$(node -e "const {URL}=require('url');try{console.log(new URL(JSON.parse(require('fs').readFileSync('$lab/postman/spec.json','utf8')).baseUrl).port||80)}catch{console.log('?')}")
  health=$(curl -s -m 1 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port/api/health" 2>/dev/null)
  if [ "$health" = "200" ]; then
    echo "✓ $name already up (: $port)"
    already=$((already+1))
    continue
  fi
  if [ "$CHECK" = "1" ]; then
    echo "✗ $name DOWN (port $port)"
    failed=$((failed+1))
    continue
  fi
  if [ "$STOP" = "1" ]; then
    if [ -f "$lab/docker-compose.yml" ]; then
      (cd "$lab" && docker compose down >/dev/null 2>&1 && echo "stopped $name")
    fi
    continue
  fi
  if [ -f "$lab/docker-compose.yml" ]; then
    if (cd "$lab" && docker compose up -d --build >/dev/null 2>&1); then
      echo "▶ $name (docker) on :$port"
      started=$((started+1))
    else
      echo "✗ $name failed to start (docker)"; failed=$((failed+1))
    fi
  else
    (cd "$lab" && nohup npm start </dev/null >"/tmp/lab-$name.log" 2>&1 & echo $! > "/tmp/lab-$name.pid")
    STARTED_NPM+=("$name")
    echo "▶ $name (npm) on :$port"
    started=$((started+1))
  fi
done

# wait for npm-started labs to come healthy (compose labs are waited per-lab by compose healthchecks)
if [ "${#STARTED_NPM[@]}" -gt 0 ] && [ "$STOP" = "0" ] && [ "$CHECK" = "0" ]; then
  for i in $(seq 1 20); do
    allup=1
    for name in "${STARTED_NPM[@]}"; do
      port=$(node -e "const {URL}=require('url');try{console.log(new URL(JSON.parse(require('fs').readFileSync('standalone/$name/postman/spec.json','utf8')).baseUrl).port||80)}catch{console.log('0')}")
      [ "$(curl -s -m 1 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port/api/health" 2>/dev/null)" = "200" ] || allup=0
    done
    [ "$allup" = "1" ] && break
    sleep 1
  done
fi

if [ "$STOP" = "1" ]; then
  echo "stopped docker labs (host-run labs keep their own lifecycle)"
  exit 0
fi

echo
echo "labs up: $((already+started))/${#labs[@]} (already running: $already, started now: $started, failed: $failed)"
[ "$CHECK" = "1" ] && [ "$failed" -gt 0 ] && exit 1
# final gate: everything the collection expects must answer
final=0
for lab in "${labs[@]}"; do
  name=$(basename "$lab")
  port=$(node -e "const {URL}=require('url');try{console.log(new URL(JSON.parse(require('fs').readFileSync('$lab/postman/spec.json','utf8')).baseUrl).port||80)}catch{console.log('0')}")
  [ "$(curl -s -m 1 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port/api/health" 2>/dev/null)" = "200" ] || { echo "still down: $name"; final=1; }
done
exit $final
