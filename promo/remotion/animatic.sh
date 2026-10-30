#!/usr/bin/env bash
# Review sheet: start / middle / end still of every beat → out/animatic.png
set -euo pipefail
cd "$(dirname "$0")/.."
FR=$(node -e "import('./remotion/beats.mjs').then(m=>console.log(m.BEATS.flatMap(b=>{const a=Math.round(b.from*60),z=Math.round(b.to*60);return [a+(a===0?18:12),Math.floor((a+z)/2),Math.min(z,1800)-12]}).join(' ')))")
node --experimental-strip-types remotion/render.mjs stills $FR
python3 remotion/animatic.py out/frames out/animatic.png
