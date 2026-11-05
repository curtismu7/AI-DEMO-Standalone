#!/usr/bin/env bash
# setup.sh — the ONE command for the standalone labs family.
#
#   scripts/setup.sh                     full first-time setup (was bootstrap.sh)
#   scripts/setup.sh teardown [--dry-run]  delete the PingOne demo environment
#   scripts/setup.sh <bootstrap flags>     --app X, --start Y, --skip-install, ...
#
# Everything else (bootstrap.sh, pingone-setup.sh, pingone-teardown.sh) still
# exists and stays runnable by hand; this wrapper just means nobody has to
# remember more than one entry point.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"

sub="${1:-}"
case "$sub" in
  teardown)
    shift
    exec "$root/scripts/pingone-teardown.sh" "$@"
    ;;
  setup)
    shift
    exec "$root/scripts/pingone-setup.sh" "$@"
    ;;
  -h|--help|help)
    cat <<'USAGE'
setup.sh — the one command for the standalone labs family.

Usage:
  scripts/setup.sh                       First-time setup: prerequisites,
                                         submodules, shelf, lab-proxy, PingOne.
  scripts/setup.sh --app <lab-dir>       Set up only one lab.
  scripts/setup.sh --start <lab-dir>     Set up, then start one lab.
  scripts/setup.sh --start-all           Set up, then start every lab.
  scripts/setup.sh --skip-install        Set up without npm install/build.
  scripts/setup.sh setup [flags]         Re-run PingOne setup alone
                                         (e.g. setup pingone --region com ...)
  scripts/setup.sh teardown [--dry-run]  Delete the PingOne demo environment
                                         (reads the admin creds saved by setup;
                                         --dry-run shows what it would delete).

After setup, open the shelf: https://local.ping-devops.com:8443
USAGE
    exit 0
    ;;
  *)
    exec "$root/scripts/bootstrap.sh" "$@"
    ;;
esac
