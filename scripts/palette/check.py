#!/usr/bin/env python3
"""Palette guard (GAME-22): every sprite must use only colours of the base set's palette.

    python3 scripts/palette/check.py [DIR] [--palette art/palette/lpc.json] [--tolerance 0] [--allow-missing]

Rules:
  * every *.png under DIR (recursively) is checked; default DIR is assets/;
  * pixels with alpha == 0 are ignored (their RGB is invisible); every pixel with alpha > 0
    is checked by its RGB;
  * a colour is foreign when its RGB distance to the nearest palette colour is > tolerance
    (Euclidean, default 0 = exact match);
  * per file: number of foreign colours, foreign pixel count, up to 10 examples with counts.

Exit codes:
  0  PASS - every checked pixel is in the palette
  0  NOT RUN - DIR missing or holds no PNG, and --allow-missing was given (never printed as PASS)
  1  FAIL - foreign colours found, or DIR missing/empty without --allow-missing,
     or a PNG could not be read
  2  usage error / unreadable palette
"""
import argparse
import json
import os
import sys
from collections import Counter

from PIL import Image

MAX_EXAMPLES = 10


def hex_to_rgb(h):
    h = h.lstrip('#')
    if len(h) != 6:
        raise ValueError(f'bad colour {h!r}')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def rgb_to_hex(c):
    return '#%02x%02x%02x' % c


def load_palette(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    colours = [hex_to_rgb(h) for h in data['colors']]
    if not colours:
        raise ValueError(f'{path}: palette is empty')
    if data.get('count') != len(colours):
        raise ValueError(f'{path}: count {data.get("count")} != {len(colours)} colours listed')
    return data.get('name', os.path.basename(path)), colours


def nearest(rgb, palette):
    """Nearest palette colour and its squared RGB distance."""
    best, best_d2 = None, None
    for p in palette:
        d2 = (rgb[0] - p[0]) ** 2 + (rgb[1] - p[1]) ** 2 + (rgb[2] - p[2]) ** 2
        if best_d2 is None or d2 < best_d2:
            best, best_d2 = p, d2
            if d2 == 0:
                break
    return best, best_d2


def opaque_colours(path):
    """Counter of RGB tuples over pixels with alpha > 0."""
    im = Image.open(path)
    im.load()
    data = im.convert('RGBA').tobytes()
    counts = Counter()
    for i in range(0, len(data), 4):
        if data[i + 3] == 0:
            continue
        counts[(data[i], data[i + 1], data[i + 2])] += 1
    return counts


def check_file(path, palette, tolerance):
    exact = set(palette)
    tol2 = tolerance * tolerance
    foreign = Counter()
    for rgb, n in opaque_colours(path).items():
        d2 = 0 if rgb in exact else nearest(rgb, palette)[1]
        if d2 > tol2:
            foreign[rgb] = n
    return foreign


def find_pngs(root):
    out = []
    for d, _, files in os.walk(root):
        for f in files:
            if f.lower().endswith('.png'):
                out.append(os.path.join(d, f))
    return sorted(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description='Palette guard: sprites must use only the base palette.')
    ap.add_argument('dir', nargs='?', default='assets')
    ap.add_argument('--palette', default='art/palette/lpc.json')
    ap.add_argument('--tolerance', type=float, default=0.0,
                    help='max Euclidean RGB distance to count as in-palette (default 0 = exact)')
    ap.add_argument('--allow-missing', action='store_true',
                    help='missing/empty DIR gives NOT RUN with exit 0 instead of exit 1')
    a = ap.parse_args(argv)
    if a.tolerance < 0:
        print('palette-guard: ERROR — tolerance must be >= 0', file=sys.stderr)
        return 2

    try:
        name, palette = load_palette(a.palette)
    except (OSError, ValueError, KeyError) as e:
        print(f'palette-guard: ERROR — cannot read palette: {e}', file=sys.stderr)
        return 2

    pngs = find_pngs(a.dir) if os.path.isdir(a.dir) else []
    if not pngs:
        why = 'does not exist' if not os.path.isdir(a.dir) else 'holds no PNG'
        status = 'NOT RUN'
        print(f'palette-guard: {status} — {a.dir} {why}; nothing was checked')
        return 0 if a.allow_missing else 1

    bad_files, unreadable = 0, 0
    for p in pngs:
        try:
            foreign = check_file(p, palette, a.tolerance)
        except Exception as e:  # noqa: BLE001 — an unreadable PNG must be red, not skipped
            unreadable += 1
            print(f'ERROR {p}: cannot read PNG: {e}')
            continue
        if foreign:
            bad_files += 1
            px = sum(foreign.values())
            ex = ', '.join(f'{rgb_to_hex(c)} ×{n}' for c, n in
                           sorted(foreign.items(), key=lambda kv: (-kv[1], kv[0]))[:MAX_EXAMPLES])
            print(f'FAIL {p}: {len(foreign)} foreign colour(s), {px} px — {ex}')

    head = f'palette {name}, {len(palette)} colours, tolerance {a.tolerance:g}'
    if bad_files or unreadable:
        print(f'palette-guard: FAIL — {bad_files} of {len(pngs)} file(s) with foreign colours, '
              f'{unreadable} unreadable ({head})')
        return 1
    print(f'palette-guard: PASS — {len(pngs)} file(s), 0 foreign colours ({head})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
