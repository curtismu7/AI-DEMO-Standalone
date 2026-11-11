#!/bin/bash
# Thin wrapper for scripts/check-ui-patterns.mjs (the per-page checker).
# Kept so anything that still calls this script keeps working. All real
# logic lives in the .mjs; this only maps the old --strict flag.
#   scripts/check-ui-patterns.sh [app-dir ...] [--strict]
set -u
here="$(cd "$(dirname "$0")" && pwd)"
args=()
strict=0
for a in "$@"; do
  if [ "$a" = "--strict" ]; then strict=1; else args+=("$a"); fi
done
if [ "$strict" = 1 ]; then
  # Old --strict meant "fail on any DRIFT": the new equivalent is --strict
  # (enforce every page), which is stricter than the old grep-based check.
  exec node "$here/check-ui-patterns.mjs" --strict "${args[@]}"
fi
exec node "$here/check-ui-patterns.mjs" "${args[@]}"
