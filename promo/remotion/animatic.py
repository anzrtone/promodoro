"""Animatic sheet: start / middle / end still of every beat, with the time and caption under it.
Safe zones are outlined on each still (bottom 20 %, right 140 px).
Usage: python3 remotion/animatic.py out/frames out/animatic.png  (frames from `render.mjs stills`)"""
import json, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

frames_dir, out = sys.argv[1], sys.argv[2]
beats = json.loads(subprocess.check_output(['node', '-e', "import('./remotion/beats.mjs').then(m=>console.log(JSON.stringify(m.BEATS)))"]))
FPS, TW, TH, PAD = 60, 240, 427, 14
font = lambda s, b=False: ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if b else ''}.ttf", s)

def picks(b):
    a, z = round(b['from'] * FPS), round(b['to'] * FPS)
    return [a + (75 if a == 0 else 12), (a + z) // 2, min(z, 1800) - 12]

cols = len(beats)
sheet = Image.new('RGB', (PAD + cols * (TW + PAD), 70 + 3 * (TH + 34) + 120), '#FDFBF7')
d = ImageDraw.Draw(sheet)
d.text((PAD, 18), 'Promodoro trailer · animatic (start / middle / end of each beat) · red: platform UI safe zones', fill='#2D312E', font=font(24, True))
for c, b in enumerate(beats):
    x = PAD + c * (TW + PAD)
    for r, f in enumerate(picks(b)):
        y = 70 + r * (TH + 34)
        im = Image.open(f'{frames_dir}/f{f:04d}.png').convert('RGB')
        o = ImageDraw.Draw(im, 'RGBA')
        o.rectangle([0, 1536, 1080, 1920], fill=(238, 107, 110, 40), outline=(238, 107, 110, 255), width=4)
        o.rectangle([940, 0, 1080, 1920], fill=(238, 107, 110, 40), outline=(238, 107, 110, 255), width=4)
        sheet.paste(im.resize((TW, TH), Image.LANCZOS), (x, y))
        d.text((x, y + TH + 4), f'f{f}  {f / FPS:.2f}s', fill='#2D312E', font=font(16))
    y = 70 + 3 * (TH + 34)
    d.text((x, y), f"{b['from']:.2f}–{b['to']:.2f}s", fill='#EE6B6E', font=font(17, True))
    d.text((x, y + 24), b['name'], fill='#2D312E', font=font(16, True))
    words, line, ly = f"“{b['caption']}”".split(), '', y + 48
    for w in words:
        if line and d.textlength(line + ' ' + w, font=font(15)) > TW:
            d.text((x, ly), line, fill='#2D312E', font=font(15)); ly += 19; line = ''
        line = (line + ' ' + w).strip()
    d.text((x, ly), line, fill='#2D312E', font=font(15))
sheet.save(out)
print(out, sheet.size)
