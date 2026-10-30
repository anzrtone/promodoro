"""Guide click for previews only (never in the final file): a soft click every beat (87 BPM), an
accent on every bar, and a bell on each sync point. 48 kHz stereo, exactly 33.0 s.
Usage: python3 audio/guide-click.py audio/guide-click.wav"""
import math, struct, sys, wave

SR, DUR = 48000, 33.0
BEAT = 60 / 87
SYNC = [5.52, 13.79, 22.07, 28.97]
n = int(SR * DUR)
buf = [0.0] * n

def add(at, f, dec, amp, partials=((1, 1),)):
    s = int(round(at * SR))
    for i in range(int(dec * 6 * SR)):
        if s + i >= n: break
        t = i / SR
        buf[s + i] += amp * math.exp(-t / dec) * sum(a * math.sin(2 * math.pi * f * r * t) for r, a in partials)

k = 0
while k * BEAT < DUR:
    bar = k % 4 == 0
    add(k * BEAT, 1600 if bar else 1100, 0.012, 0.5 if bar else 0.3)
    k += 1
for t in SYNC:
    add(t, 880, 0.5, 0.35, ((1, 1), (2.76, 0.4), (5.4, 0.2)))
peak = max(abs(v) for v in buf)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<hh', v, v) for v in (int(x / peak * 0.8 * 32767) for x in buf)))
print(sys.argv[1], n / SR, 's')
