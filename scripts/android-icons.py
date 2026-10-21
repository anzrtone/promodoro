#!/usr/bin/env python3
"""Generate Android launcher icons + splash screens from assets/ (run from repo root).

  assets/icon-1024.png             full icon (legacy + round launcher icons)
  assets/icon-foreground-1024.png  transparent Pomo for adaptive icons
"""
import glob
import os
from PIL import Image, ImageDraw

RES = 'android/app/src/main/res'
CREME = (253, 251, 247, 255)
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

icon = Image.open('assets/icon-1024.png').convert('RGBA')
fg = Image.open('assets/icon-foreground-1024.png').convert('RGBA')

for d, k in DENS.items():
    out = f'{RES}/mipmap-{d}'
    os.makedirs(out, exist_ok=True)
    s = round(48 * k)
    icon.resize((s, s), Image.LANCZOS).save(f'{out}/ic_launcher.png')
    r = icon.resize((s, s), Image.LANCZOS)
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    round_icon = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    round_icon.paste(r, (0, 0), mask)
    round_icon.save(f'{out}/ic_launcher_round.png')
    f = round(108 * k)
    fg.resize((f, f), Image.LANCZOS).save(f'{out}/ic_launcher_foreground.png')

with open(f'{RES}/values/ic_launcher_background.xml', 'w') as fh:
    fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FDFBF7</color>\n</resources>\n')

# Splash: cream notebook page with Pomo centred, matching every existing size.
for path in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(path).size
    img = Image.new('RGBA', (w, h), CREME)
    dr = ImageDraw.Draw(img)
    step = max(24, w // 22)
    for y in range(step * 2, h, step):
        dr.line((0, y, w, y), fill=(229, 223, 209, 255), width=max(1, w // 480))
    mx = max(30, w // 9)
    dr.line((mx, 0, mx, h), fill=(244, 162, 162, 255), width=max(2, w // 320))
    size = int(min(w, h) * 0.42)
    p = fg.resize((size, size), Image.LANCZOS)
    img.alpha_composite(p, ((w - size) // 2, (h - size) // 2))
    img.convert('RGB').save(path)

print('android icons + splash written')
