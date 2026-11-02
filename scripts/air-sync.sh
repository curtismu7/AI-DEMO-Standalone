#!/bin/bash
# Update the standalone parent on the Air to the pushed main. Run from this Mac after you push.
# Usage: scripts/air-sync.sh   (AIR_HOST and AIR_DIR override the defaults)
set -eu
host="${AIR_HOST:-curtismuir@Curtiss-MacBook-Air.local}"
dir="${AIR_DIR:-Development/AI-DEMO-Standalone}"
ssh -o BatchMode=yes "$host" "zsh -lc 'cd ~/$dir && git pull --ff-only && git submodule update --init --recursive && git log --oneline -1'"
