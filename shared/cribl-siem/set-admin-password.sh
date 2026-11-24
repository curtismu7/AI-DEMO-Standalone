#!/bin/sh
# Sidecar loop: makes sure Cribl's admin login uses $ADMIN_PASS, not the default admin/admin.
# Cribl rebuilds its config from the ConfigMap on every pod start (the users file is regenerated with the default), so this
# runs for the life of the pod and re-applies the password if it is ever back to the default. $ADMIN_PASS must be URL/JSON safe
# (the Secret is random hex plus -Aa, which also meets Cribl's 3-character-class policy). Env: ADMIN_PASS, optional API (default http://127.0.0.1:9000/api/v1).
set -u
API=${API:-http://127.0.0.1:9000/api/v1}
[ -n "${ADMIN_PASS:-}" ] || { echo "ADMIN_PASS is not set" >&2; exit 1; }
login() { # prints the HTTP code; the token body is left in /tmp/login.json
  curl -s -m 8 -o /tmp/login.json -w '%{http_code}' -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"admin\",\"password\":\"$1\"}" 2>/dev/null || echo 000
}
while true; do
  code=$(login "$ADMIN_PASS")
  if [ "$code" = 200 ]; then
    sleep 300; continue
  fi
  if [ "$code" = 429 ]; then sleep 2; continue; fi
  code=$(login admin)
  if [ "$code" = 200 ]; then
    token=$(sed -E 's/.*"token":"([^"]+)".*/\1/' /tmp/login.json)
    out=$(curl -s -m 8 -o /dev/null -w '%{http_code}' -X PATCH "$API/system/users/admin" \
      -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
      -d "{\"id\":\"admin\",\"username\":\"admin\",\"first\":\"admin\",\"last\":\"admin\",\"email\":\"admin\",\"roles\":[\"admin\"],\"password\":\"$ADMIN_PASS\"}")
    echo "admin password set from Secret (HTTP $out)"
    # 400 = Cribl's password policy (3 of: lower, upper, digit, symbol; length). Do not hammer the API.
    [ "$out" = 200 ] && sleep 3 || sleep 120
    continue
  fi
  sleep 5   # Cribl not up yet (or still starting)
done
