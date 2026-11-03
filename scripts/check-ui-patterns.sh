#!/bin/bash
# Checks an app's markup/CSS against shared/STANDALONE-UI-PATTERNS.md (the layout
# patterns shown in shared/ui-standard-mock.html). Advisory: reports PASS / DRIFT /
# INFO per pattern; exits 1 only on --strict.
# Usage: scripts/check-ui-patterns.sh [app-dir ...] [--strict]
set -u
DEV="$HOME/Development"
CANON="$DEV/AI-DEMO-Standalone"
strict=0
apps=()
for a in "$@"; do
  [ "$a" = "--strict" ] && strict=1 || apps+=("$a")
done
# Default: every submodule checkout in this repo (owner 2026-11-03: apps live here, not in loose ~/Development clones).
if [ ${#apps[@]} -eq 0 ]; then
  for d in "$CANON"/standalone/*-LAB; do [ -d "$d" ] && apps+=("$d"); done
fi
fail=0

report() { # $2 label, $3 status, $4 detail
  echo "  $3  $2${4:+ — $4}"
  [ "$3" = "DRIFT" ] && fail=1
  return 0
}

for app in "${apps[@]}"; do
  [ -d "$app" ] || { echo "MISSING $app"; fail=1; continue; }
  name=$(basename "$app")
  echo "== $name"
  # Search markup (jsx/html) and CSS for the pattern landmarks.
  markup=$(find "$app" \( -name '*.jsx' -o -name '*.html' \) -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/__tests__/*' 2>/dev/null)
  css=$(find "$app" -name '*.css' -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' -not -name 'standalone-ui.css' 2>/dev/null)
  # Headless apps (no UI at all) are exempt: banner, chips, cards and the vendored
  # stylesheet do not apply. mcp-resource-server-LAB: recorded per its PR #1.
  # deploy-test-LAB: owner-exempted 2026-11-03 — a throwaway that only exercises the
  # shelf's one-click Deploy; not held to the full app standard. Remove when it gains a UI.
  case "$name" in
    mcp-resource-server-LAB|deploy-test-LAB)
      if [ -z "$markup" ] && [ -z "$css" ]; then
        echo "  SKIP  headless app (no UI; banner/stylesheet patterns do not apply)"
        continue
      fi
      ;;
  esac
  grep_m() { grep -l -E "$1" $markup 2>/dev/null | head -1; }
  grep_c() { grep -l -E "$1" $css 2>/dev/null | head -1; }

  # P1 app shell: dark bar or legacy topbar
  if grep_m 'shell-bar|className="shell' >/dev/null 2>&1 || [ -n "$(grep_m 'shell-bar|className=\"shell')" ]; then
    report "$name" "P1 app shell (shell-bar)" "PASS"
  elif [ -n "$(grep_m '<header class=\"topbar\"|class=\"topbar\"|topbar')" ]; then
    report "$name" "P1 app shell (legacy .topbar; migrate to .shell-bar)" "DRIFT"
  elif [ -n "$(grep_m 'inspector-shell-topbar|InspectorShell')" ]; then
    report "$name" "P1 app shell (InspectorShell component)" "PASS"
  else
    report "$name" "P1 app shell" "INFO" "no shell markup found (may be a single-page tool)"
  fi

  # P2 banner: the shared .banner class, or an app's own ModeBanner/HostedBanner component
  # (role="note" is the contract; the class name is per-app).
  if [ -n "$(grep_m 'class=\"banner\"|className=\"banner|\"banner |ModeBanner|HostedBanner|role=\"note\"')" ] || grep -q 'banner' <<<"$(cat $css 2>/dev/null)"; then
    report "$name" "P2 simulation banner" "PASS"
  else
    report "$name" "P2 simulation banner" "DRIFT" "no .banner in markup"
  fi

  # P4 cards with accent top edge (or panel equivalent)
  if [ -n "$(grep_c '\.card|card-grid|\.panel')" ]; then
    if grep -q -E 'border-top:\s*(3|4)px solid var\(--(accent|border|status)' $css 2>/dev/null; then
      report "$name" "P4 cards with accent top edge" "PASS"
    else
      report "$name" "P4 cards" "INFO" "panels present, no accent top edge (optional)"
    fi
  else
    report "$name" "P4 cards" "INFO" "none found"
  fi

  # P6 inspector layout
  if [ -n "$(grep_m 'InspectorShell|inspector-layout|class=\"inspector|className=\"inspector')" ]; then
    report "$name" "P6 inspector layout" "PASS"
  else
    report "$name" "P6 inspector layout" "INFO" "not used (fine for Demo-tier pages)"
  fi

  # P7 chips/pills semantic state
  if [ -n "$(grep_c '\.chip|\.pill')" ]; then
    if grep -q -E 'var\(--status-(ok|warn|info)|--danger-text' $css 2>/dev/null; then
      report "$name" "P7 status chips (semantic tokens)" "PASS"
    else
      report "$name" "P7 status chips" "DRIFT" "chip/pill styled without semantic tokens"
    fi
  else
    report "$name" "P7 status chips" "INFO" "none found"
  fi

  # Vendored shared stylesheet present and current
  vendored=$(find "$app" -name 'standalone-ui.css' -not -path '*/node_modules/*' 2>/dev/null | head -1)
  if [ -n "$vendored" ]; then
    if cmp -s "$CANON/shared/standalone-ui.css" "$vendored"; then
      report "$name" "vendored standalone-ui.css" "PASS"
    else
      report "$name" "vendored standalone-ui.css" "DRIFT" "differs from canonical (run check-drift.sh)"
    fi
  else
    report "$name" "vendored standalone-ui.css" "DRIFT" "not found"
  fi
done

if [ "$strict" -eq 1 ] && [ "$fail" -eq 1 ]; then
  echo "FAIL (strict)"; exit 1
fi
echo "done (advisory; use --strict to fail on DRIFT)"
exit 0
