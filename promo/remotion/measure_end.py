"""Ink bounds of each end-card element on a rendered frame (for centring checks).
Usage: python3 remotion/measure_end.py out/frames/f1979.png"""
import sys
import numpy as np
from PIL import Image

a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
ink = (r < 120) & (g < 120) & (b < 120)          # caption and small print (ink, never black)
red = (r > 180) & (g < 140) & (b < 140)           # Pomo's body / the wordmark (tomato)

def bounds(mask, y0, y1):
    m = mask.copy(); m[:y0] = False; m[y1:] = False
    ys, xs = np.nonzero(m)
    if not len(xs): return None
    return xs.min(), xs.max(), ys.min(), ys.max()

# Bands come from the rows that hold ink of each kind, top to bottom.
rows_ink = np.nonzero(ink[:, 60:1020].any(1))[0]
rows_red = np.nonzero(red[:, 60:1020].any(1))[0]
def runs(rows, gap=70):
    out, start = [], rows[0]
    for p, q in zip(rows, rows[1:]):
        if q - p > gap: out.append((start, p + 1)); start = q
    out.append((start, rows[-1] + 1))
    return out
ink_runs, red_runs = runs(rows_ink), runs(rows_red)
named = {'caption': ink_runs[0], 'pomo body': red_runs[0], 'wordmark': red_runs[-1], 'small print': ink_runs[-1]}
top, bottom = 1e9, 0
for name, (y0, y1) in named.items():
    x0, x1, yy0, yy1 = bounds(ink if name in ('caption', 'small print') else red, y0, y1)
    top, bottom = min(top, yy0), max(bottom, yy1)
    print(f'{name:12s} x {x0:4d}–{x1:4d}  centre {(x0 + x1) / 2:6.1f} ({(x0 + x1) / 2 - 540:+.1f})  y {yy0}–{yy1}')
print(f'group y {top}–{bottom}: centre {(top + bottom) / 2:.0f} (target 768 = middle of 0–1536), gap above {top}, below {1536 - bottom}')

# With a second frame: does the wordmark there sit exactly where it does in the first (e.g. the
# stamp frame vs the final frame)? Compares the first frame's wordmark pixels only.
if len(sys.argv) > 2:
    y0, y1 = named['wordmark']
    m = red.copy(); m[:y0] = False; m[y1:] = False
    bb = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int)
    same = (np.abs(bb - a).max(-1) <= 12) & m
    print(f'wordmark pixels matching in {sys.argv[2]}: {same.sum() / m.sum() * 100:.1f}%')
