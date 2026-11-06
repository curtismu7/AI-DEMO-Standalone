#!/bin/bash
# Drift guard: every *-LAB / *-lab repo under the owner's GitHub account must be
# a submodule of this meta-repo (owner rule 2026-11-06 — labs live ONLY as
# submodules of AI-DEMO-Standalone, never as loose top-level repos).
#
# Modes:
#   scripts/check-gh-labs.sh          — local run; needs `gh` signed in
#   scripts/check-gh-labs.sh --ci     — CI run; FAILS on any unaccounted lab
#                                       (local default is warn-only so a failed
#                                       run never blocks the owner's shell)
#
# A lab repo "accounts for itself" by appearing as a submodule URL in
# .gitmodules (case-insensitive compare; e.g. dir cimd-LAB vs repo cimd-lab).
# Repos that are not labs (AI-DEMO2, claude-config, ...) are ignored — only
# names matching the lab pattern are checked.
set -u
ci=0
[ "${1:-}" = "--ci" ] && ci=1
root="$(cd "$(dirname "$0")/.." && pwd)"
owner="$(git -C "$root" config --get remote.origin.url | sed 's|.*github.com[:/]||; s|/.*||')"
[ -n "$owner" ] || { echo "check-gh-labs: not inside the family git checkout (no origin)"; exit 2; }

command -v gh >/dev/null 2>&1 || { echo "check-gh-labs: gh CLI missing"; exit 2; }
gh auth status >/dev/null 2>&1 || { echo "check-gh-labs: gh not signed in (gh auth login)"; exit 2; }

# Only *-lab / *-LAB suffixed repos are in scope.
gh repo list "$owner" --limit 400 --json name --jq '.[].name' | grep -iE -- '-lab$' > /tmp/gh-labs.$$ || true

# Submodule repo names from .gitmodules (strip owner/, .git; lowercase).
git -C "$root" config --file .gitmodules --get-regexp 'submodule\..*\.url' \
  | awk '{print $2}' | sed -E 's|https://github\.com/[^/]+/||; s|git@github\.com:[^/]+/||; s|\.git$||' | tr '[:upper:]' '[:lower:]' | sort -u > /tmp/sub-urls.$$

orphans=$(comm -23 <(tr '[:upper:]' '[:lower:]' < /tmp/gh-labs.$$ | sort -u) /tmp/sub-urls.$$)

status=0
if [ -n "$orphans" ]; then
  echo "FAIL — lab repo(s) on GitHub under $owner that are NOT submodules of this meta-repo:"
  printf '%s\n' "$orphans" | sed 's/^/  /'
  cat <<'FIX'

  Fix each one (from the lab's local clone, after pushing its work):
    cd <lab-dir>
    git add -A && git commit -m "..." && git push
    cd <meta-repo>
    git submodule add https://github.com/<owner>/<lab>.git standalone/<lab>-LAB
    git commit -m "pin: <lab>"
  Then re-run this check.
FIX
  status=1
else
  echo "OK — every lab repo under $owner is a submodule of this meta-repo"
fi
rm -f /tmp/gh-labs.$$ /tmp/sub-urls.$$
[ "$ci" = 1 ] && exit $status
# local: warn-only, but surface the failure in the exit line for scripts that look
[ "$status" = 1 ] && { echo "(local mode: warn-only; CI enforces this)"; exit 0; }
exit 0
