#!/usr/bin/env bash
# Record every shot (needs `npm run dev` on :1420 in the repo root) and make contact sheets.
# Busy screens (stats, timeline, the share sheet) are filmed slower so no frames drop.
set -euo pipefail
cd "$(dirname "$0")"
for s in countdown forgot desktop idle; do node "shot-$s.mjs"; done
for s in stats timeline montage; do RATE=0.125 node "shot-$s.mjs"; done
./sheets.sh
