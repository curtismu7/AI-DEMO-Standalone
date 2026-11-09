#!/usr/bin/env bash
# Make a WRITE-ONLY Elasticsearch API key for this collector and save it as PING_LOGS_ES_APIKEY in its own .env. Run it yourself in a terminal:
# nothing else (and no agent) creates a credential for you.
#
# The key can only create documents (and create the index or data stream) in ping-logs-* and demo-logs-*: it cannot read, update or delete.
# The password of an Elasticsearch user that may create API keys is typed hidden, or read from a cluster Secret in your own shell; it is never
# stored or printed, and goes to curl on stdin so it is not in the process list. The old .env is kept as .env.bak.<time>. The old key keeps
# working until you invalidate it in Elasticsearch.
#
#   ./make-write-key.sh --find                                list candidate Secrets (names only)
#   ES_SECRET=<name> ES_SECRET_KEY=<key> ./make-write-key.sh  read the password from the cluster Secret
#   ./make-write-key.sh [elastic-user-name]                   or type it (default user: elastic)
# Settings: ES_LOCAL_URL (default http://localhost:9200, the port-forward), ENV_FILE (default ./.env beside this script), KEY_EXPIRY (default 90d),
#           ES_NS / ES_KUBE_CONTEXT (default ping-devops-curtismuir / us).
set -euo pipefail
ES="${ES_LOCAL_URL:-http://localhost:9200}"
USER_NAME="${1:-elastic}"; [ "$USER_NAME" = "--find" ] && USER_NAME=elastic
HERE="$(cd "$(dirname "$0")" && pwd)"
FILE="${ENV_FILE:-$HERE/.env}"
EXPIRY="${KEY_EXPIRY:-90d}"
NS="${ES_NS:-ping-devops-curtismuir}"; CTX="${ES_KUBE_CONTEXT:-us}"

if [ "${1:-}" = "--find" ]; then
  echo "Secrets in $NS that look like Elasticsearch ones, with their key NAMES (no values):"
  kubectl --context "$CTX" -n "$NS" get secrets -o name | grep -iE "elastic|siem" | sed 's#^secret/##' | while read -r n; do
    printf '  %s -> ' "$n"; kubectl --context "$CTX" -n "$NS" get secret "$n" -o go-template='{{range $k,$v := .data}}{{$k}} {{end}}'; echo
  done
  echo "Then run:  ES_SECRET=<secret name> ES_SECRET_KEY=<key name> ./make-write-key.sh"
  exit 0
fi

[ -f "$FILE" ] || { echo "missing $FILE (copy .env.example to .env first)" >&2; exit 1; }
curl -s -m 5 -o /dev/null "$ES/" || { echo "cannot reach $ES (is the Elasticsearch port-forward running?)" >&2; exit 1; }

if [ -n "${ES_SECRET:-}" ]; then
  PW=$(kubectl --context "$CTX" -n "$NS" get secret "$ES_SECRET" -o "jsonpath={.data.${ES_SECRET_KEY:-elastic}}" | base64 -d)
  [ -n "$PW" ] || { echo "that secret/key is empty or missing (try --find)" >&2; exit 1; }
  if [ -z "${1:-}" ]; then U=$(kubectl --context "$CTX" -n "$NS" get secret "$ES_SECRET" -o 'jsonpath={.data.username}' 2>/dev/null | base64 -d 2>/dev/null || true); [ -n "$U" ] && USER_NAME="$U"; fi
else
  read -r -s -p "Password for Elasticsearch user '$USER_NAME' (hidden): " PW; echo
  [ -n "$PW" ] || { echo "no password given" >&2; exit 1; }
fi

BODY=$(printf '{"name":"ping-log-collector-writer","expiration":"%s","role_descriptors":{"writer":{"indices":[{"names":["ping-logs-*","demo-logs-*"],"privileges":["create_doc","create_index","auto_configure"]}]}}}' "$EXPIRY")
esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
RESP=$(printf 'user = "%s:%s"\n' "$(esc "$USER_NAME")" "$(esc "$PW")" | curl -s -m 20 -w '\n%{http_code}' -K - -H 'Content-Type: application/json' -X POST "$ES/_security/api_key" -d "$BODY") || true
unset PW
CODE=${RESP##*$'\n'}; JSON=${RESP%$'\n'*}
if [ "$CODE" != "200" ]; then echo "Elasticsearch answered HTTP $CODE (no key written):"; printf '%s\n' "$JSON" | head -c 400; echo; exit 1; fi

ENCODED=$(printf '%s' "$JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["encoded"])')
[ -n "$ENCODED" ] || { echo "no key in the answer" >&2; exit 1; }
cp "$FILE" "$FILE.bak.$(date +%s)"
python3 - "$FILE" "$ENCODED" <<'PY'
import sys
path, enc = sys.argv[1], sys.argv[2]
lines, out, done = open(path).read().splitlines(), [], False
for l in lines:
    if l.startswith("PING_LOGS_ES_APIKEY="):
        out.append("PING_LOGS_ES_APIKEY=" + enc); done = True
    else:
        out.append(l)
if not done: out.append("PING_LOGS_ES_APIKEY=" + enc)
open(path, "w").write("\n".join(out) + "\n")
PY
chmod 600 "$FILE"
echo "Done: a write-only key (expires in $EXPIRY) is saved in $FILE; the old file is kept as a .bak next to it."
echo "Restart the collector so it uses it:  docker --context orbstack compose up -d --force-recreate"
