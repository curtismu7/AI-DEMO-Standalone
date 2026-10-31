#!/bin/bash
# Drift check for the standalone apps. Run it against local clones (any branch):
#   scripts/check-drift.sh <app-dir> [<app-dir> ...]
# For each app dir it checks:
#   1. the vendored shared stylesheet is byte-identical to shared/standalone-ui.css in this repo
#   2. the vendored PingFederate installer (if present) is byte-identical to scripts/pingfederate-setup.sh
#   2b. the vendored shelf-register helper (if present) is byte-identical to scripts/shelf-register.mjs
#   3. the README meets the README standard checklist (title, tier, repo URL, port section, run-from-clone, no internal names)
#   4. scripts/check-css.sh reports no FAIL
#   5. package.json requires Node 26 and CI uses Node 26 only
# Exit 1 if any app fails. Prints one line per check. No secret values are read.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
canon_css="$root/shared/standalone-ui.css"
canon_pf="$root/scripts/pingfederate-setup.sh"
canon_shelf="$root/scripts/shelf-register.mjs"
status=0

for app in "$@"; do
  [ -d "$app" ] || { echo "skip (missing): $app"; continue; }
  app="$(cd "$app" && pwd)"
  name="$(basename "$app")"
  fails=0
  say() { printf '  %-5s %s\n' "$1" "$2"; if [ "$1" = "FAIL" ]; then fails=$((fails+1)); fi; return 0; }
  echo "== $name ($(git -C "$app" rev-parse --abbrev-ref HEAD 2>/dev/null) $(git -C "$app" rev-parse --short HEAD 2>/dev/null))"

  # 1. vendored stylesheet
  found=0
  while IFS= read -r f; do
    found=1
    if cmp -s "$f" "$canon_css"; then say ok "stylesheet identical: ${f#$app/}"; else say FAIL "stylesheet differs from canonical: ${f#$app/}"; fi
  done < <(find "$app" -name 'standalone-ui.css' -not -path '*/node_modules/*' -not -path '*/dist/*' 2>/dev/null)
  [ $found -eq 0 ] && say note "no vendored stylesheet (app has no UI, or has not adopted it yet)"

  # 2. vendored PingFederate installer
  if [ -f "$app/scripts/pingfederate-setup.sh" ]; then
    if cmp -s "$app/scripts/pingfederate-setup.sh" "$canon_pf"; then say ok "pingfederate-setup.sh identical"; else say FAIL "pingfederate-setup.sh differs from canonical"; fi
  fi

  # 2b. vendored shelf-register helper
  if [ -f "$app/scripts/shelf-register.mjs" ]; then
    if cmp -s "$app/scripts/shelf-register.mjs" "$canon_shelf"; then say ok "shelf-register.mjs identical"; else say FAIL "shelf-register.mjs differs from canonical"; fi
  else
    say note "no shelf-register.mjs (the app will not add itself to the shelf)"
  fi

  # 3. README checklist
  r="$app/README.md"
  if [ ! -f "$r" ]; then say FAIL "README.md missing"; else
    head -1 "$r" | grep -q -E '^# .* LAB$' && say ok "title ends in LAB" || say FAIL "title does not end in LAB: $(head -1 "$r" | cut -c1-60)"
    grep -q -E '^Tier: (Demo|Tester|Tool)' "$r" && say ok "tier line" || say FAIL "no Tier: line"
    grep -q -E '^Repo: https://github.com/ping-sandbox/[A-Za-z0-9._-]+-LAB' "$r" && say ok "repo URL under ping-sandbox" || say FAIL "no Repo: URL under ping-sandbox ending -LAB"
    grep -q -i 'what to do if the port is taken' "$r" && say ok "port-taken section" || say FAIL "no port-taken section"
    grep -q -i 'run from a clone' "$r" && say ok "run-from-a-clone section" || say FAIL "no Run from a clone section"
    grep -q -i -E 'doctor' "$r" && say ok "mentions doctor" || say note "README does not mention doctor"
    grep -q -i -E 'api/health' "$r" && say ok "mentions /api/health" || say note "README does not mention /api/health"
    if grep -q -i -E 'ping-devops|cmuir|curtismu' "$r"; then say FAIL "README mentions an internal host or personal name"; else say ok "no internal names in README"; fi
  fi
  [ -f "$app/CLAUDE.md" ] && say ok "CLAUDE.md present" || say FAIL "CLAUDE.md missing"

  # 4. CSS check
  out="$("$root/scripts/check-css.sh" "$app" 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then say ok "check-css.sh clean"; else say FAIL "check-css.sh: $(echo "$out" | grep -c FAIL) failing check(s)"; fi

  # 5. Node 26
  if [ -f "$app/package.json" ]; then
    node -e "const p=require('$app/package.json');process.exit(/>=\s*26/.test((p.engines||{}).node||'')?0:1)" 2>/dev/null && say ok "engines.node >=26" || say FAIL "package.json does not require Node 26"
  fi
  if ls "$app"/.github/workflows/*.yml >/dev/null 2>&1; then
    if grep -h -E 'node(-version)?:' "$app"/.github/workflows/*.yml | grep -q -E '\b(18|20|22|24)\b'; then say FAIL "CI mentions a Node version other than 26"; else say ok "CI is Node 26 only"; fi
    if grep -q -E 'self-hosted' "$app"/.github/workflows/*.yml; then say FAIL "CI uses a self-hosted runner"; else say ok "CI uses hosted runners"; fi
  else
    say FAIL "no CI workflow"
  fi

  [ $fails -gt 0 ] && status=1
  echo "  -> $name: $fails failing check(s)"
done
exit $status
