#!/usr/bin/env bash
# A 12-frame contact sheet per clip: promo/footage/sheets/<shot>.png
set -euo pipefail
cd "$(dirname "$0")/../footage"
mkdir -p sheets
for f in *.mp4; do
  n=$(ffprobe -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 "$f")
  step=$(( n / 12 > 0 ? n / 12 : 1 ))
  w=$([[ $f == desktop.mp4 ]] && echo 640 || echo 300)
  ffmpeg -loglevel error -y -i "$f" -vf "select='not(mod(n\,$step))',scale=$w:-2,tile=6x2:padding=6:color=white" -frames:v 1 -fps_mode vfr "sheets/${f%.mp4}.png"
done
ls sheets
