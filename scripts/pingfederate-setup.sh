#!/bin/bash
# Sets up PingFederate for the standalone apps.
#   - If PingFederate already answers on the admin port, ask for its admin login, check it, and save it.
#   - Otherwise install the official image in Docker, bound to 127.0.0.1 only, with the default
#     administrator login, and save the login.
# Admin credentials are written only to ~/.config/demo-kit/provisioning.json (mode 600), never to the shared .env.
# Environment overrides: PF_ADMIN_PORT (4731), PF_ENGINE_PORT (4732), PF_CONTAINER (pingfederate-lab),
#   PF_IMAGE (pingidentity/pingfederate:latest), PF_LICENSE_FILE (~/Documents/pingfederate.lic),
#   PF_ACCEPT_EULA=YES to skip the EULA prompt.
set -u

ADMIN_PORT="${PF_ADMIN_PORT:-4731}"
ENGINE_PORT="${PF_ENGINE_PORT:-4732}"
NAME="${PF_CONTAINER:-pingfederate-lab}"
IMAGE="${PF_IMAGE:-pingidentity/pingfederate:latest}"
LICENSE="${PF_LICENSE_FILE:-$HOME/Documents/pingfederate.lic}"
DEFAULT_USER="administrator"
DEFAULT_PASSWORD="2FederateM0re"   # the official image's documented default; change it for anything beyond local use
PROVISIONING="$HOME/.config/demo-kit/provisioning.json"
BASE="https://127.0.0.1:$ADMIN_PORT/pf-admin-api/v1"

fail() { echo "ERROR: $*" >&2; exit 1; }

# HTTP status of the version endpoint with no login ("000" means nothing is listening).
probe() { curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/version" 2>/dev/null || true; }

# Login check without putting the password on the command line.
login_status() {
  printf 'user = "%s:%s"\n' "$1" "$2" | curl -sk -K - -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/version" 2>/dev/null || true
}

save_creds() {
  mkdir -p "$(dirname "$PROVISIONING")"
  PF_URL="https://127.0.0.1:$ADMIN_PORT" PF_USER="$1" PF_PASS="$2" PROV="$PROVISIONING" node -e '
    const fs = require("fs");
    const file = process.env.PROV;
    let data = {};
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    data.pingfederate = { adminUrl: process.env.PF_URL, username: process.env.PF_USER, password: process.env.PF_PASS, note: "Local PingFederate admin login. Read only by the provisioning scripts." };
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  ' || fail "could not write $PROVISIONING"
  echo "Saved the admin login to $PROVISIONING (mode 600)."
}

code="$(probe)"
if [ -n "$code" ] && [ "$code" != "000" ]; then
  echo "PingFederate answers on https://127.0.0.1:$ADMIN_PORT (HTTP $code). Using the existing install."
  read -r -p "Admin username: " user
  read -r -s -p "Admin password: " pass; echo
  status="$(login_status "$user" "$pass")"
  [ "$status" = "200" ] || fail "login refused (HTTP $status). Nothing was saved."
  save_creds "$user" "$pass"
  echo "Existing PingFederate verified."
  exit 0
fi

echo "No PingFederate on port $ADMIN_PORT. Installing the official image."
command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install OrbStack or Docker Desktop, then run this again."
docker info >/dev/null 2>&1 || fail "Docker is not running. Open OrbStack and run this again."
[ -f "$LICENSE" ] || fail "No license at $LICENSE. Put pingfederate.lic there, or set PF_LICENSE_FILE."
if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  fail "a container named $NAME already exists. Remove it, or set PF_CONTAINER to another name."
fi
for p in "$ADMIN_PORT" "$ENGINE_PORT"; do
  if lsof -iTCP:"$p" -sTCP:LISTEN -n -P >/dev/null 2>&1; then fail "port $p is taken. Pick another with PF_ADMIN_PORT or PF_ENGINE_PORT."; fi
done

if [ "${PF_ACCEPT_EULA:-}" != "YES" ]; then
  echo "PingFederate is licensed by Ping. Read the terms: https://www.pingidentity.com/en/legal.html"
  read -r -p "Accept the PingFederate terms and install? Type YES to continue: " answer
  [ "$answer" = "YES" ] || fail "not accepted. Nothing was installed."
fi

docker pull "$IMAGE" >/dev/null || fail "could not pull $IMAGE"
docker run -d --name "$NAME" --restart unless-stopped \
  -p "127.0.0.1:$ADMIN_PORT:9999" -p "127.0.0.1:$ENGINE_PORT:9031" \
  -e PING_IDENTITY_ACCEPT_EULA=YES \
  -e ROOT_USER="$DEFAULT_USER" \
  -e PING_IDENTITY_PASSWORD="$DEFAULT_PASSWORD" \
  -v "$LICENSE:/opt/out/instance/server/default/conf/pingfederate.lic:ro" \
  "$IMAGE" >/dev/null || fail "docker could not start $NAME"
echo "Started $NAME. Waiting for the admin API (this can take a few minutes)..."

for _ in $(seq 1 90); do
  code="$(probe)"
  if [ -n "$code" ] && [ "$code" != "000" ]; then break; fi
  sleep 2
done
status="$(login_status "$DEFAULT_USER" "$DEFAULT_PASSWORD")"
[ "$status" = "200" ] || fail "the new install did not accept the default login (HTTP $status). Check: docker logs $NAME"
save_creds "$DEFAULT_USER" "$DEFAULT_PASSWORD"
echo "PingFederate is up."
echo "  Admin console and API: https://127.0.0.1:$ADMIN_PORT"
echo "  Runtime (engine):      https://127.0.0.1:$ENGINE_PORT"
echo "  Login: $DEFAULT_USER / $DEFAULT_PASSWORD (change it for anything beyond local use)"
