#!/usr/bin/env bash
# mirror-to-github.sh — mirror the standalone family to another GitHub account/org.
#
# Usage:
#   scripts/mirror-to-github.sh <target-owner> [--account <gh-account>]
#
# Creates <target-owner>/<repo> (public) for every registered submodule + pushes
# all branches and tags, then rewrites the meta-repo's submodule URLs.
# Works for ANY owner (curtismu7, an org) — the same script either way. (ping-sandbox is gone, 2026-11.)
set -euo pipefail

target="${1:?usage: mirror-to-github.sh <target-owner> [--account <gh-account>]}"
account=""
[[ "${2:-}" == "--account" ]] && account="${3:-}"

if [[ -n "$account" ]]; then
  gh auth switch --user "$account"
fi
me="$(gh api user --jq .login)"
echo "Mirroring to $target as $me"

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# 1. create the target repos (public; skip existing)
while read -r sub; do
  name="${sub##*/}"
  if ! gh repo view "$target/$name" --json name --jq .name > /dev/null 2>&1; then
    gh repo create "$target/$name" --public > /dev/null && echo "created: $name"
  else
    echo "exists: $name"
  fi
done < <(git config -f .gitmodules --get-regexp '\.url' | awk '{print $2}' | sed 's|https://github.com/||; s|\.git$||' | sort -u)

# 2. mirror-push every submodule (all branches + tags), then the meta-repo itself
while read -r sub; do
  name="${sub##*/}"
  [ -e "$sub/.git" ] || { echo "SKIP (not checked out): $sub"; continue; }
  git -C "$sub" remote add mirror "https://github.com/$target/$name.git" 2>/dev/null || \
    git -C "$sub" remote set-url mirror "https://github.com/$target/$name.git"
  git -C "$sub" push --all mirror 2>&1 | tail -1 | sed "s|^|  $name: |"
  git -C "$sub" push --tags mirror 2>&1 | tail -1 | sed "s|^|  $name(tags): |"
# The target repo name comes from the submodule's REMOTE URL (repo may be named
# differently from its checkout dir, e.g. checkout jev-lab-LAB <- repo jev-lab).
done < <(git config -f .gitmodules --get-regexp '\.path' | awk '{print $2}' | while read -r sub; do
  url=$(git config -f .gitmodules --get "submodule.$sub.url")
  basename "$url" .git
done)

# 3. the meta-repo itself
git remote add mirror "https://github.com/$target/AI-DEMO-Standalone.git" 2>/dev/null || \
  git remote set-url mirror "https://github.com/$target/AI-DEMO-Standalone.git"
gh repo create "$target/AI-DEMO-Standalone" --public > /dev/null 2>&1 || true
git push --all mirror 2>&1 | tail -1
git push --tags mirror 2>&1 | tail -1

echo "Done."
