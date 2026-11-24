#!/usr/bin/env bash
# Local proof (OrbStack) that the Cribl config works: renders the config with render-config.sh, starts Cribl + nginx in front of a
# mock Elasticsearch and a mock OpenSearch, posts a SIEM-style _bulk request and gateway log lines (POST /<index>/_doc) with secrets in them,
# and checks what reaches each. Gateway events are checked twice: OpenSearch route off (phase 1), then on (cut-over).
# Usage: test/run-local.sh        (needs docker context orbstack; pulls cribl/cribl and python:3-alpine)
set -euo pipefail
cd "$(dirname "$0")/.."
IMG=${CRIBL_IMAGE:-cribl/cribl:4.13.0}
NET=cribl-siem-test; TMP=$(mktemp -d); PORT=${PORT:-19200}
cleanup() { docker rm -f cribl-siem-test nginx-siem-test mock-es-test mock-os-test >/dev/null 2>&1 || true; docker network rm $NET >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
basic() { printf 'Authorization: Basic %s' "$(printf '%s:%s' "$1" "$2" | base64 | tr -d '\n')"; }
mkdir -p "$TMP/local" "$TMP/data" "$TMP/osdata" "$TMP/nginx"; : > "$TMP/data/received.ndjson"; : > "$TMP/osdata/received.ndjson"
docker network create $NET >/dev/null

# A password with characters that break naive templating: ' & \ $ and a space
APIKEY=$(printf 'testid:%s' "$(openssl rand -hex 16)" | base64 | tr -d '\n=')
IN_USER=privilege; IN_PASS="in'p&ss\\w \$rd"; OUT_PASS="out'p&ss\\w \$rd"
GW_USER=gateway; GW_PASS="gw'p&ss\\w \$rd"
render_cfg() { # render_cfg <GW_OPENSEARCH true|false>
  docker run --rm --network $NET --entrypoint sh \
    -e IN_USER="$IN_USER" -e IN_PASS="$IN_PASS" -e IN_APIKEY="$APIKEY" -e GW_USER="$GW_USER" -e GW_PASS="$GW_PASS" -e GW_OPENSEARCH="$1" \
    -e NGINX_CONF=/nginx-conf -e OUT_USER=ingest -e OUT_PASS="$OUT_PASS" -e ES_URL=http://mock-es-test:9200/_bulk -e OS_URL=http://mock-os-test:9200/_bulk \
    -e CFG=/cfg -e CRIBL_LOCAL=/opt/cribl/local \
    -v "$PWD/config:/cfg:ro" -v "$PWD/render-config.sh:/render-config.sh:ro" -v "$TMP/local:/opt/cribl/local" -v "$TMP/nginx:/nginx-conf" \
    "$IMG" /render-config.sh
}
render_cfg false

docker run -d --name mock-es-test --network $NET -v "$TMP/data:/data" -v "$PWD/test/mock_es.py:/m.py:ro" python:3-alpine python /m.py >/dev/null
docker run -d --name mock-os-test --network $NET -v "$TMP/osdata:/data" -v "$PWD/test/mock_es.py:/m.py:ro" python:3-alpine python /m.py >/dev/null
docker run -d --name cribl-siem-test --network $NET -p 127.0.0.1:$PORT:9200 -v "$TMP/local:/opt/cribl/local" "$IMG" >/dev/null
# nginx shares Cribl's network namespace, like the two containers in the pod (nginx on :9200, Cribl on 127.0.0.1:9201)
docker run -d --name nginx-siem-test --network container:cribl-siem-test -v "$TMP/nginx:/etc/nginx/conf.d:ro" nginx:1.27-alpine >/dev/null

wait_ready() {
  echo "waiting for Cribl on :$PORT ..."
  for i in $(seq 1 60); do
    [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' -H "$(basic "$IN_USER" "$IN_PASS")" http://127.0.0.1:$PORT/ || true)" = 200 ] && return 0
    sleep 2
  done
  echo "FAIL: Cribl did not answer"; docker logs cribl-siem-test 2>&1 | tail -8 | cut -c1-250; echo "--- nginx"; docker logs nginx-siem-test 2>&1 | tail -12; exit 1
}
wait_ready

fail=0; ok() { echo "PASS: $1"; }; bad() { echo "FAIL: $1"; fail=1; }
post_status() { curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST --data '{}' "$@" http://127.0.0.1:$PORT/_bulk; }
[ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/_bulk -X POST -d '{}')" = 401 ] && ok "no credentials is refused (401)" || bad "no credentials was accepted"
[ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' -H "$(basic "$IN_USER" wrong)" http://127.0.0.1:$PORT/_bulk -X POST -d '{}')" = 401 ] && ok "wrong password is refused (401)" || bad "wrong password was accepted"

# Built from pieces so secret scanners do not flag this fake token
[ "$(post_status -H "Authorization: ApiKey wrong$APIKEY")" = 401 ] && ok "wrong API key is refused (401)" || bad "wrong API key was accepted"
[ "$(post_status -H "Authorization: Bearer $APIKEY")" = 401 ] && ok "API key under the wrong scheme (Bearer) is refused (401)" || bad "Bearer scheme was accepted"
[ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' -H "Authorization: ApiKey $APIKEY" http://127.0.0.1:$PORT/)" = 200 ] && ok "valid API key: GET / is 200" || bad "valid API key refused on GET /"
# From a second container on the same network (not the host): Cribl's no-auth port must refuse connections, and nginx's port must demand credentials
[ "$(docker run --rm --network $NET --entrypoint curl "$IMG" -s -m 5 -o /dev/null -w '%{http_code}' http://cribl-siem-test:9201/ 2>/dev/null || true)" != 200 ] && ok "Cribl's own port (9201) is not reachable from another container" || bad "Cribl port 9201 is reachable inside the network"
[ "$(docker run --rm --network $NET --entrypoint curl "$IMG" -s -m 5 -o /dev/null -w '%{http_code}' http://cribl-siem-test:9200/ 2>/dev/null)" = 401 ] && ok "nginx (9200) without credentials is 401 from another container" || bad "nginx 9200 did not return 401 to an anonymous client"
[ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' -H "Authorization: apikey $APIKEY" http://127.0.0.1:$PORT/)" = 200 ] && ok "scheme name is case-insensitive (apikey)" || bad "lowercase apikey scheme refused"
[ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' -H "Authorization: BASIC $(printf '%s:%s' "$IN_USER" "$IN_PASS" | base64 | tr -d '\n')" http://127.0.0.1:$PORT/)" = 200 ] && ok "scheme name is case-insensitive (BASIC)" || bad "uppercase BASIC scheme refused"
[ "$(curl -s -m 5 -D - -o /dev/null http://127.0.0.1:$PORT/ | grep -ci '^content-type:')" = 1 ] && ok "the 401 carries exactly one Content-Type header" || bad "the 401 has duplicate or missing Content-Type"

JWT="eyJ""hbGciOiJIUzI1NiJ9.eyJ""zdWIiOiJ1LTEyMyJ9.abcDEF123456xyz"
python3 - "$JWT" > "$TMP/bulk.ndjson" <<'PY'
import json, sys
data = json.dumps({"name": "a1", "password": "hunter2", "virtualKey": "sk-ant-abcdefghijklmnop1234", "apiKeyValue": "zzz", "note": "keep me", "jwt": sys.argv[1]})
doc = {"@timestamp": "2026-11-23T22:00:00Z", "Message": "HTTP PUT Request x/api/agentaccesskeys/k1 Bearer abcdefgh12345678", "Status": "HTTP Status Code 200", "Module": "apigw", "User": {"Name": "u-123"}, "Data": data, "DataText": data, "Resources": [{"Kind": "X", "Spec": {"Token": "sk-ant-abcdefghijklmnop1234", "Name": "keep"}}]}
print(json.dumps({"index": {"_index": "audit-log"}})); print(json.dumps(doc))
PY
curl -s -m 5 -H "$(basic "$IN_USER" "$IN_PASS")" -X POST http://127.0.0.1:$PORT/_bulk -H 'Content-Type: application/x-ndjson' --data-binary @"$TMP/bulk.ndjson" >/dev/null
for i in $(seq 1 30); do [ -s "$TMP/data/received.ndjson" ] && break; sleep 2; done
curl -s -m 5 -H "Authorization: ApiKey $APIKEY" -X POST http://127.0.0.1:$PORT/_bulk -H 'Content-Type: application/x-ndjson' --data-binary @"$TMP/bulk.ndjson" >/dev/null
for i in $(seq 1 30); do [ "$(wc -l < "$TMP/data/received.ndjson")" -ge 2 ] && break; sleep 2; done

# A runtime event as Privilege's own SIEM feed sends it (Index policy-decision-log, payload in the Data OBJECT, headers present)
python3 - > "$TMP/policy.ndjson" <<'PY'
import json
doc = {"@timestamp": "2026-11-24T12:43:05Z", "Message": "AIPolicyDecision", "Index": "policy-decision-log", "Level": "info",
       "Data": {"AgentKey": "lab-banking-" + "full-" + "key", "App": "opensearch-hitl2", "Decision": "hitl", "Event": "policy_approval_required", "Flow": "mcp", "Method": "tools/call",
                "PolicyIDs": ["pol-1", "pol-2"], "Principal": "User::abc", "PrincipalKind": "User", "Reason": "PingID HITL test", "RequestID": "req-9", "Stage": "pre_guard",
                "Target": "SearchIndexTool", "Tenant": "t-1", "User": "u-42",
                "Headers": {"Authorization": "Bearer abcdefgh12345678", "Cookie": "sid=zzz", "Set-Cookie": "sid=yyy", "X-Api-" + "Key": "k-123", "Proxy-Authorization": "Basic Zm9v",
                            "User-Agent": "curl/8", "X-Request-Id": "r-1"}}}
print(json.dumps({"index": {"_index": "audit-log"}})); print(json.dumps(doc))
PY
curl -s -m 5 -H "$(basic "$IN_USER" "$IN_PASS")" -X POST http://127.0.0.1:$PORT/_bulk -H 'Content-Type: application/x-ndjson' --data-binary @"$TMP/policy.ndjson" >/dev/null
for i in $(seq 1 30); do [ "$(grep -c . "$TMP/data/received.ndjson")" -ge 3 ] && break; sleep 2; done

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
        check("Cribl's _time removed", "_time" not in doc),
        check("the API-key write also reached Elasticsearch, with the writer's credentials", len(rows) >= 2 and base64.b64decode(rows[1]["authorization"].split()[1]).decode() == "ingest:" + sys.argv[2]),
        check("the API-key write was masked too", len(rows) >= 2 and "hunter2" not in rows[1]["body"])]
if len(rows) >= 3:
    pd = json.loads(rows[2]["body"].splitlines()[1]); hd = pd["Data"]["Headers"]
    good += [check("runtime event: user, agent key, policy, decision promoted to gw_* fields",
                   pd.get("gw_user") == "u-42" and pd.get("gw_agent_key") == "lab-banking-full-key" and pd.get("gw_policy_ids") == ["pol-1", "pol-2"] and pd.get("gw_decision") == "hitl"
                   and pd.get("gw_decision_reason") == "PingID HITL test" and pd.get("gw_target") == "SearchIndexTool" and pd.get("gw_app") == "opensearch-hitl2" and pd.get("gw_request_id") == "req-9"),
             check("runtime event: Data is left intact", pd["Data"]["User"] == "u-42" and pd["Data"]["Decision"] == "hitl"),
             check("runtime event: Authorization, Cookie, Set-Cookie, X-Api-Key, Proxy-Authorization headers removed", not any(k in hd for k in ("Authorization", "Cookie", "Set-Cookie", "X-Api-Key", "Proxy-Authorization")) and "abcdefgh12345678" not in json.dumps(pd)),
             check("runtime event: harmless headers kept", hd.get("User-Agent") == "curl/8" and hd.get("X-Request-Id") == "r-1"),
             check("runtime event: keys that are absent stay absent (no empty gw_path / gw_control_id)", "gw_path" not in pd and "gw_control_id" not in pd and "gw_host" not in pd),
             check("console event (Data as text) is not given gw_* fields", not any(k.startswith("gw_") for k in json.loads(rows[0]["body"].splitlines()[1])))]
else:
    good += [check("runtime event reached Elasticsearch", False)]
sys.exit(0 if all(good) else 1)
PY

# ---------------- gateway events: POST /<index>/_doc with the gateways' own login ----------------
# Fixtures are generated here (key-shaped values built from pieces) so secret scanners do not flag fake keys in the file.
python3 - "$TMP" <<'PY'
import json, sys
tmp = sys.argv[1]; pre = "sk-" + "orion-"
full = pre + "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + "1234"
lines = {
  "gw": {"time": "2026-11-24T12:00:00.123Z", "level": "info", "msg": "LLM request", "Provider": "openai", "Model": "gpt-x", "HTTPStatus": 200, "TotalTokens": 12,
         "VirtualKeyID": full, "User": "u-1", "Headers": {"Authorization": "Bearer abcdefgh" + "12345678"}, "Note": "called with Bearer zzzzzzzz" + "9999 ok", "keep": "me"},
  # lines that have no VirtualKeyID (the A2A ones, and an AIGuard verdict) and keys that are short or already in prefix...last4 form
  "gw2": {"time": "2026-11-24T12:00:05Z", "msg": "A2A policy denied", "Principal": "agent-7", "App": "orders", "Reason": "principal does not have access"},
  "gw3": {"time": "2026-11-24T12:00:06Z", "msg": "AIGuard", "Event": "llm_request_blocked", "Category": "prompt_injection", "VirtualKeyID": pre + "..." + "1234", "User": "u-1"},
  "gw4": {"time": "2026-11-24T12:00:07Z", "msg": "AIGuard", "Event": "llm_request_alert", "VirtualKeyID": pre + "1234" + "5678", "User": "u-2"},
}
for name, doc in lines.items():
    open("%s/%s.json" % (tmp, name), "w").write(json.dumps(doc) + "\n")
PY
gw_post() { curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary @"$TMP/gw.json" "$@" http://127.0.0.1:$PORT/gateway-events/_doc; }
[ "$(gw_post)" = 401 ] && ok "gateway path: no credential is refused (401)" || bad "gateway path accepted no credential"
[ "$(gw_post -H "$(basic "$GW_USER" wrong)")" = 401 ] && ok "gateway path: wrong password is refused (401)" || bad "gateway path accepted a wrong password"
[ "$(gw_post -H "$(basic "$IN_USER" "$IN_PASS")")" = 401 ] && ok "gateway path: the Privilege login is refused (401)" || bad "gateway path accepted the Privilege login"
[ "$(gw_post -H "Authorization: ApiKey $APIKEY")" = 401 ] && ok "gateway path: the Privilege API key is refused (401)" || bad "gateway path accepted the API key"
[ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST -H "$(basic "$GW_USER" "$GW_PASS")" --data '{}' http://127.0.0.1:$PORT/_bulk)" = 401 ] && ok "the gateway login is refused on /_bulk (401)" || bad "gateway login works on /_bulk"
[ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' -H "$(basic "$GW_USER" "$GW_PASS")" http://127.0.0.1:$PORT/gateway-events/_doc)" = 403 ] && ok "GET on the gateway path is refused (403)" || bad "GET on the gateway path was allowed"
[ "$(gw_post -H "$(basic "$GW_USER" "$GW_PASS")")" = 200 ] && ok "gateway login: POST /gateway-events/_doc is accepted" || bad "gateway login refused on its own path"
for f in gw2 gw3 gw4; do curl -s -m 5 -o /dev/null -X POST -H 'Content-Type: application/json' -H "$(basic "$GW_USER" "$GW_PASS")" --data-binary @"$TMP/$f.json" http://127.0.0.1:$PORT/gateway-events/_doc; done
# wait until all four events are in Elasticsearch, then give a wrongly-routed OpenSearch copy time to show up before asserting it is absent
python3 - "$TMP/data/received.ndjson" <<'PY'
import json, sys, time
for _ in range(40):
    n = 0
    for l in open(sys.argv[1]):
        n += sum(1 for m in ("LLM request", "A2A policy denied", "AIGuard") if m in json.loads(l)["body"])
    if n >= 4: break
    time.sleep(2)
PY
sleep 6
python3 - "$TMP/data/received.ndjson" "$TMP/osdata/received.ndjson" "phase 1: OpenSearch route off" 0 <<'PY' || fail=1
import json, sys
def docs(path):
    out = []
    for l in open(path):
        r = json.loads(l); ls = r["body"].splitlines()
        for i in range(0, len(ls) - 1, 2): out.append((json.loads(ls[i]), json.loads(ls[i + 1]), r))
    return out
def check(name, cond):
    print(("PASS: " if cond else "FAIL: ") + name); return cond
es = [d for d in docs(sys.argv[1]) if d[1].get("msg") == "LLM request"]; osd = [d for d in docs(sys.argv[2]) if d[1].get("msg") == "LLM request"]
if not check("[%s] exactly one gateway event reached Elasticsearch" % sys.argv[3], len(es) == 1): sys.exit(1)
a, d, r = es[0]
good = [check("index gateway-events", a.get("create", a.get("index", {})).get("_index") == "gateway-events"),
        check("@timestamp set from time", d.get("@timestamp") == "2026-11-24T12:00:00.123Z"),
        check("long VirtualKeyID shortened to prefix...last4", d.get("VirtualKeyID") == "sk-orion-...1234"),
        check("Headers removed", "Headers" not in d and "abcdefgh12345678" not in json.dumps(d)),
        check("Bearer in Note masked, text kept", "zzzzzzzz9999" not in d.get("Note", "") and d.get("Note") == "called with Bearer *** ok"),
        check("other fields kept, _time removed", d.get("keep") == "me" and d.get("Model") == "gpt-x" and "_time" not in d),
        check("[%s] OpenSearch copies: %d (expected %s)" % (sys.argv[3], len(osd), sys.argv[4]), len(osd) == int(sys.argv[4]))]
by = {d[1]["msg"] + ":" + d[1].get("User", d[1].get("Principal", "")): d for d in docs(sys.argv[1]) if d[1].get("msg") in ("A2A policy denied", "AIGuard", "LLM request")}
a2a = by.get("A2A policy denied:agent-7"); ag = by.get("AIGuard:u-1"); short = by.get("AIGuard:u-2")
good += [check("A2A line without VirtualKeyID arrives intact (no empty field added)", a2a is not None and "VirtualKeyID" not in a2a[1] and a2a[1].get("App") == "orders" and a2a[1].get("@timestamp") == "2026-11-24T12:00:05Z"),
         check("AIGuard line with an already-shortened key is left as is", ag is not None and ag[1].get("VirtualKeyID") == "sk-orion-...1234"),
         check("a short unshortened key (16 chars) is still reduced to prefix...last4", short is not None and short[1].get("VirtualKeyID") == "sk-orion-...5678")]
sys.exit(0 if all(good) else 1)
PY

# ---------------- cut-over: switch the OpenSearch route on, restart, post again ----------------
render_cfg true
docker restart cribl-siem-test nginx-siem-test >/dev/null; wait_ready
: > "$TMP/data/received.ndjson"; : > "$TMP/osdata/received.ndjson"
[ "$(gw_post -H "$(basic "$GW_USER" "$GW_PASS")")" = 200 ] && ok "cut-over: gateway login accepted" || bad "cut-over: gateway post refused"
for i in $(seq 1 30); do [ -s "$TMP/data/received.ndjson" ] && [ -s "$TMP/osdata/received.ndjson" ] && break; sleep 2; done
python3 - "$TMP/data/received.ndjson" "$TMP/osdata/received.ndjson" "phase 2: OpenSearch route on" 1 <<'PY' || fail=1
import json, sys
def docs(path):
    out = []
    for l in open(path):
        r = json.loads(l); ls = r["body"].splitlines()
        for i in range(0, len(ls) - 1, 2): out.append((json.loads(ls[i]), json.loads(ls[i + 1]), r))
    return out
def check(name, cond):
    print(("PASS: " if cond else "FAIL: ") + name); return cond
es = [d for d in docs(sys.argv[1]) if d[1].get("msg") == "LLM request"]; osd = [d for d in docs(sys.argv[2]) if d[1].get("msg") == "LLM request"]
good = [check("[%s] one copy in Elasticsearch" % sys.argv[3], len(es) == 1),
        check("[%s] one copy in OpenSearch, same shape, no credentials sent" % sys.argv[3], len(osd) == 1 and osd[0][2]["authorization"] == "" and osd[0][1].get("VirtualKeyID") == "sk-orion-...1234" and osd[0][0].get("create", osd[0][0].get("index", {})).get("_index") == "gateway-events")]
sys.exit(0 if all(good) else 1)
PY
[ $fail = 0 ] && echo "ALL PASSED" || { echo "SOME FAILED"; docker logs cribl-siem-test 2>&1 | grep -E '"level":"(warn|error)"|in_gateway|gateway|pipe:' | grep -v -E "MetricsStore|Cloud domain" | tail -12 | cut -c1-400; exit 1; }
