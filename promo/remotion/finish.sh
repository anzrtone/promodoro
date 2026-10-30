#!/usr/bin/env bash
# After `render.mjs video`: mux the SFX stem, make the click preview, the contact sheet and the
# sync-point grabs, and print the checks. No music anywhere: that is mixed in locally afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
SILENT=out/frames/video-silent.mp4
FINAL=out/promodoro-trailer-9x16.mp4
PREVIEW=out/preview-with-click.mp4

# Remotion's render comes out full range (yuvj420p, from its JPEG frames). Convert to standard
# limited-range yuv420p, H.264 High at ~20 Mbps (two passes), then add the SFX stem only.
VIDEO=out/frames/video-yuv420p.mp4
X264=(-c:v libx264 -profile:v high -preset slow -b:v 20M -maxrate 26M -bufsize 40M -g 120 -vf "scale=in_range=pc:out_range=tv,format=yuv420p" -color_range tv -an)
ffmpeg -loglevel error -y -i "$SILENT" "${X264[@]}" -pass 1 -passlogfile out/frames/x264 -f mp4 /dev/null
ffmpeg -loglevel error -y -i "$SILENT" "${X264[@]}" -pass 2 -passlogfile out/frames/x264 "$VIDEO"
ffmpeg -loglevel error -y -i "$VIDEO" -i out/sfx.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -ar 48000 -t 33 -movflags +faststart "$FINAL"
# Sync preview: the same with the guide click mixed under the SFX (previews only).
ffmpeg -loglevel error -y -i "$VIDEO" -i out/sfx.wav -i audio/guide-click.wav -filter_complex "[2:a]volume=0.35[c];[1:a][c]amix=inputs=2:normalize=0[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k -ar 48000 -t 33 -movflags +faststart "$PREVIEW"

# Contact sheet: one frame every 0.5 s (66 frames).
ffmpeg -loglevel error -y -i "$FINAL" -vf "fps=2,scale=216:-2,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='%{eif\:t\:d}.%{eif\:mod(t*10\,10)\:d}s':x=6:y=6:fontsize=16:fontcolor=0xEE6B6E:box=1:boxcolor=white@0.8,tile=12x6:padding=4:color=white" -frames:v 1 out/contact-sheet.png

# Sync points: the frame before and the frame itself.
for f in 330 331 1323 1324 1737 1738; do
  ffmpeg -loglevel error -y -i "$FINAL" -vf "select=eq(n\,$f),scale=360:-2,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='frame $f':x=8:y=8:fontsize=22:fontcolor=0xEE6B6E:box=1:boxcolor=white@0.85" -frames:v 1 "out/frames/sync-$f.png"
done
ffmpeg -loglevel error -y $(for f in 330 331 1323 1324 1737 1738; do echo -i out/frames/sync-$f.png; done) -filter_complex hstack=inputs=6 out/sync-check.png

echo "--- $FINAL"
ffprobe -v error -show_entries stream=codec_name,profile,width,height,r_frame_rate,pix_fmt,bit_rate,nb_frames,sample_rate,channels:format=duration,bit_rate -of default=nw=1 "$FINAL"
