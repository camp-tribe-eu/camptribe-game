#!/usr/bin/env python3
"""Bring-to-palette pipeline (GAME-22): map every visible pixel to the nearest palette colour.

    python3 scripts/palette/quantize.py IN.png OUT.png [--palette art/palette/lpc.json]

  * alpha becomes binary: alpha >= 128 -> 255, alpha < 128 -> 0 (pixel cleared to 0,0,0,0);
  * each remaining pixel takes the nearest palette colour (Euclidean RGB).
This is a mechanical first pass: it guarantees the guard is green, not that the result looks
good. A human still checks outline, light direction and scale.
"""
import argparse
import os
import sys

from PIL import Image

sys.dont_write_bytecode = True  # no __pycache__ litter in the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check import load_palette, nearest  # noqa: E402

ALPHA_THRESHOLD = 128


def quantize(src, dst, palette):
    im = Image.open(src).convert('RGBA')
    data = bytearray(im.tobytes())
    cache = {}
    changed = 0
    for i in range(0, len(data), 4):
        if data[i + 3] < ALPHA_THRESHOLD:
            data[i:i + 4] = b'\x00\x00\x00\x00'
            continue
        rgb = (data[i], data[i + 1], data[i + 2])
        if rgb not in cache:
            cache[rgb] = nearest(rgb, palette)[0]
        new = cache[rgb]
        if new != rgb:
            changed += 1
        data[i:i + 4] = bytes((new[0], new[1], new[2], 255))
    Image.frombytes('RGBA', im.size, bytes(data)).save(dst)
    return changed


def main(argv=None):
    ap = argparse.ArgumentParser(description='Map a sprite onto the base palette.')
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--palette', default='art/palette/lpc.json')
    a = ap.parse_args(argv)
    name, palette = load_palette(a.palette)
    changed = quantize(a.src, a.dst, palette)
    print(f'quantize: {a.src} -> {a.dst}: {changed} px recoloured onto palette {name} ({len(palette)} colours)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
