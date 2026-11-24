#!/usr/bin/env bash
# Local proof (OrbStack) that the Cribl config works: renders the config with render-config.sh, starts Cribl in front of a
# mock Elasticsearch, posts a SIEM-style _bulk request with secrets in it, and checks what reaches Elasticsearch.
# Usage: test/run-local.sh        (needs docker context orbstack; pulls cribl/cribl and python:3-alpine)
set -euo pipefail
cd "$(dirname "$0")/.."
IMG=${CRIBL_IMAGE:-cribl/cribl:4.13.0}
NET=cribl-siem-test; TMP=$(mktemp -d); PORT=${PORT:-19200}
cleanup() { docker rm -f cribl-siem-test mock-es-test >/dev/null 2>&1 || true; docker network rm $NET >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
basic() { printf 'Authorization: Basic %s' "$(printf '%s:%s' "$1" "$2" | base64 | tr -d '\n')"; }
mkdir -p "$TMP/local" "$TMP/data"; : > "$TMP/data/received.ndjson"
docker network create $NET >/dev/null

# A password with characters that break naive templating: ' & \ $ and a space
IN_USER=privilege; IN_PASS="in'p&ss\\w \$rd"; OUT_PASS="out'p&ss\\w \$rd"
docker run --rm --network $NET --entrypoint sh \
  -e IN_USER="$IN_USER" -e IN_PASS="$IN_PASS" -e OUT_USER=ingest -e OUT_PASS="$OUT_PASS" -e ES_URL=http://mock-es-test:9200/_bulk \
  -e CFG=/cfg -e CRIBL_LOCAL=/opt/cribl/local \
  -v "$PWD/config:/cfg:ro" -v "$PWD/render-config.sh:/render-config.sh:ro" -v "$TMP/local:/opt/cribl/local" \
  "$IMG" /render-config.sh

docker run -d --name mock-es-test --network $NET -v "$TMP/data:/data" -v "$PWD/test/mock_es.py:/m.py:ro" python:3-alpine python /m.py >/dev/null
docker run -d --name cribl-siem-test --network $NET -p 127.0.0.1:$PORT:9200 -v "$TMP/local:/opt/cribl/local" "$IMG" >/dev/null

echo "waiting for Cribl on :$PORT ..."
for i in $(seq 1 60); do
  [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' -H "$(basic "$IN_USER" "$IN_PASS")" http://127.0.0.1:$PORT/ || true)" = 200 ] && break
  sleep 2; [ "$i" = 60 ] && { echo "FAIL: Cribl did not answer"; docker logs cribl-siem-test 2>&1 | tail -20; exit 1; }
done

fail=0; ok() { echo "PASS: $1"; }; bad() { echo "FAIL: $1"; fail=1; }
post_status() { curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST --data '{}' "$@" http://127.0.0.1:$PORT/_bulk; }
[ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/_bulk -X POST -d '{}')" = 401 ] && ok "no credentials is refused (401)" || bad "no credentials was accepted"
[ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' -H "$(basic "$IN_USER" wrong)" http://127.0.0.1:$PORT/_bulk -X POST -d '{}')" = 401 ] && ok "wrong password is refused (401)" || bad "wrong password was accepted"

# Built from pieces so secret scanners do not flag this fake token
JWT="eyJ""hbGciOiJIUzI1NiJ9.eyJ""zdWIiOiJ1LTEyMyJ9.abcDEF123456xyz"
python3 - "$JWT" > "$TMP/bulk.ndjson" <<'PY'
import json, sys
data = json.dumps({"name": "a1", "password": "hunter2", "virtualKey": "sk-ant-abcdefghijklmnop1234", "apiKeyValue": "zzz", "note": "keep me", "jwt": sys.argv[1]})
doc = {"@timestamp": "2026-11-23T22:00:00Z", "Message": "HTTP PUT Request x/api/agentaccesskeys/k1 Bearer abcdefgh12345678", "Status": "HTTP Status Code 200", "Module": "apigw", "User": {"Name": "u-123"}, "Data": data, "DataText": data, "Resources": [{"Kind": "X", "Spec": {"Token": "sk-ant-abcdefghijklmnop1234", "Name": "keep"}}]}
print(json.dumps({"index": {"_index": "audit-log"}})); print(json.dumps(doc))
PY
curl -s -m 5 -H "$(basic "$IN_USER" "$IN_PASS")" -X POST http://127.0.0.1:$PORT/_bulk -H 'Content-Type: application/x-ndjson' --data-binary @"$TMP/bulk.ndjson" >/dev/null
for i in $(seq 1 30); do [ -s "$TMP/data/received.ndjson" ] && break; sleep 2; done

python3 - "$TMP/data/received.ndjson" "$OUT_PASS" <<'PY' || fail=1
import json, sys, base64
rows = [json.loads(l) for l in open(sys.argv[1])]
def check(name, cond):
    print(("PASS: " if cond else "FAIL: ") + name); return cond
if not check("an event reached Elasticsearch", len(rows) >= 1): sys.exit(1)
r = rows[0]; lines = r["body"].splitlines(); action = json.loads(lines[0]); doc = json.loads(lines[1])
good = [check("sent to /_bulk", r["path"].endswith("/_bulk")),
        check("uses the ingestion user's credentials", base64.b64decode(r["authorization"].split()[1]).decode() == "ingest:" + sys.argv[2]),
        check("index is forced to ping-siem-events-v2 even though Privilege sends audit-log", action.get("create", action.get("index", {})).get("_index") == "ping-siem-events-v2"),
        check("Data.password masked", '"password": "***"' in doc["Data"] and "hunter2" not in doc["Data"]),
        check("Data.virtualKey masked", "sk-ant-abcdefghijklmnop1234" not in doc["Data"]),
        check("Data.apiKeyValue masked", '"apiKeyValue": "***"' in doc["Data"]),
        check("JWT masked", "eyJhbGci" not in doc["Data"]),
        check("Bearer in Message masked", "abcdefgh12345678" not in doc["Message"] and "Bearer ***" in doc["Message"]),
        check("DataText masked too", "hunter2" not in doc["DataText"] and "sk-ant-abcdefghijklmnop1234" not in doc["DataText"]),
        check("nested Resources masked, other values kept", "sk-ant-abcdefghijklmnop1234" not in json.dumps(doc["Resources"]) and doc["Resources"][0]["Spec"]["Name"] == "keep"),
        check("harmless field kept", '"note": "keep me"' in doc["Data"]),
        check("original fields kept", doc["@timestamp"] == "2026-11-23T22:00:00Z" and doc["User"]["Name"] == "u-123" and doc["Module"] == "apigw"),
        check("Cribl's _time removed", "_time" not in doc)]
sys.exit(0 if all(good) else 1)
PY
[ $fail = 0 ] && echo "ALL PASSED" || { echo "SOME FAILED"; docker logs cribl-siem-test 2>&1 | tail -15 | cut -c1-300; exit 1; }
