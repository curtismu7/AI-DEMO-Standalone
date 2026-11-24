#!/bin/sh
# Builds Cribl's local config from /cfg (files) and the environment (secrets), into $CRIBL_LOCAL.
# Runs as the pod's init container; test/run-local.sh runs the same script, so the test covers it.
# Env: GW_USER GW_PASS (the gateways' login on POST /<index>/_doc), OS_URL (OpenSearch _bulk URL), GW_OPENSEARCH (true|false, default false: send gateway events to OpenSearch too).
# Env: IN_USER IN_PASS (Privilege's basic login) and IN_APIKEY (Privilege's API key), OUT_USER OUT_PASS and ES_URL (where Cribl writes).
# Also writes nginx's default.conf into $NGINX_CONF (default /nginx-conf).
set -eu
CFG=${CFG:-/cfg}
OUT=${CRIBL_LOCAL:-/opt/cribl/local}/cribl
for v in IN_USER IN_PASS IN_APIKEY GW_USER GW_PASS OUT_USER OUT_PASS ES_URL OS_URL; do
  eval "[ -n \"\${$v:-}\" ]" || { echo "missing env $v" >&2; exit 1; }
done
mkdir -p "$OUT/pipelines/siem_mask" "$OUT/pipelines/gateway_mask"
cp "$CFG/cribl.yml" "$OUT/cribl.yml"
cp "$CFG/route.yml" "$OUT/pipelines/route.yml"
cp "$CFG/siem_mask.conf.yml" "$OUT/pipelines/siem_mask/conf.yml"
cp "$CFG/gateway_mask.conf.yml" "$OUT/pipelines/gateway_mask/conf.yml"
# Fill the templates. YAML single-quoted values: only ' needs escaping (doubled).
# index()/substr() instead of gsub so that characters such as & and \ in a password stay literal.
case "${GW_OPENSEARCH:-false}" in true|false) ;; *) echo "GW_OPENSEARCH must be true or false" >&2; exit 1;; esac
export GW_OPENSEARCH="${GW_OPENSEARCH:-false}"
render() {
  awk '
    function q(s) { gsub(/\047/, "\047\047", s); return s }
    function sub1(line, key, val,   i) {
      while ((i = index(line, key)) > 0) line = substr(line, 1, i - 1) val substr(line, i + length(key))
      return line
    }
    { l = $0
      l = sub1(l, "__IN_USER__", q(ENVIRON["IN_USER"]));   l = sub1(l, "__IN_PASS__", q(ENVIRON["IN_PASS"]))
      l = sub1(l, "__OUT_USER__", q(ENVIRON["OUT_USER"])); l = sub1(l, "__OUT_PASS__", q(ENVIRON["OUT_PASS"]))
      l = sub1(l, "__ES_URL__", q(ENVIRON["ES_URL"])); l = sub1(l, "__OS_URL__", q(ENVIRON["OS_URL"]))
      l = sub1(l, "__GW_OPENSEARCH__", ENVIRON["GW_OPENSEARCH"])
      print l }' "$1"
}
render "$CFG/inputs.yml.tpl"  > "$OUT/inputs.yml"
render "$CFG/outputs.yml.tpl" > "$OUT/outputs.yml"
chmod 600 "$OUT/inputs.yml" "$OUT/outputs.yml"

# nginx: the basic credential is compared as the base64 of user:password, the API key as given. The API key must be base64-style
# (letters, digits, + / = - _) so it can sit inside the nginx map; the Secret is generated that way.
case "$IN_APIKEY" in *[!A-Za-z0-9+/=_-]*) echo "IN_APIKEY has characters outside A-Za-z0-9+/=_-" >&2; exit 1;; esac
NGINX_CONF=${NGINX_CONF:-/nginx-conf}; mkdir -p "$NGINX_CONF"
BASIC=$(printf '%s:%s' "$IN_USER" "$IN_PASS" | base64 | tr -d '\n')
GWBASIC=$(printf '%s:%s' "$GW_USER" "$GW_PASS" | base64 | tr -d '\n')
awk -v basic="$BASIC" -v gwbasic="$GWBASIC" -v key="$IN_APIKEY" '
  function sub1(line, k, val,   i) { while ((i = index(line, k)) > 0) line = substr(line, 1, i - 1) val substr(line, i + length(k)); return line }
  { l = sub1($0, "__BASIC__", basic); l = sub1(l, "__GWBASIC__", gwbasic); l = sub1(l, "__APIKEY__", key); print l }' "$CFG/nginx.conf.tpl" > "$NGINX_CONF/default.conf"
chmod 600 "$NGINX_CONF/default.conf"
echo "cribl config rendered into $OUT"
