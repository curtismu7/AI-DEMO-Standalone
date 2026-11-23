#!/bin/sh
# Builds Cribl's local config from /cfg (files) and the environment (secrets), into $CRIBL_LOCAL.
# Runs as the pod's init container; test/run-local.sh runs the same script, so the test covers it.
# Env: IN_USER IN_PASS (what Privilege sends), OUT_USER OUT_PASS and ES_URL (where Cribl writes).
set -eu
CFG=${CFG:-/cfg}
OUT=${CRIBL_LOCAL:-/opt/cribl/local}/cribl
for v in IN_USER IN_PASS OUT_USER OUT_PASS ES_URL; do
  eval "[ -n \"\${$v:-}\" ]" || { echo "missing env $v" >&2; exit 1; }
done
mkdir -p "$OUT/pipelines/siem_mask"
cp "$CFG/cribl.yml" "$OUT/cribl.yml"
cp "$CFG/route.yml" "$OUT/pipelines/route.yml"
cp "$CFG/siem_mask.conf.yml" "$OUT/pipelines/siem_mask/conf.yml"
# Fill the templates. YAML single-quoted values: only ' needs escaping (doubled).
# index()/substr() instead of gsub so that characters such as & and \ in a password stay literal.
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
      l = sub1(l, "__ES_URL__", q(ENVIRON["ES_URL"]))
      print l }' "$1"
}
render "$CFG/inputs.yml.tpl"  > "$OUT/inputs.yml"
render "$CFG/outputs.yml.tpl" > "$OUT/outputs.yml"
chmod 600 "$OUT/inputs.yml" "$OUT/outputs.yml"
echo "cribl config rendered into $OUT"
