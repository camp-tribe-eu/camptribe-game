#!/usr/bin/env python3
"""Extract the base set's palette into a JSON file (GAME-22).

    python3 scripts/palette/extract.py                 # LPC base -> art/palette/lpc.json
    python3 scripts/palette/extract.py --check         # red if the committed file is stale
    python3 scripts/palette/extract.py --name kenney --out art/palette/kenney.json SHEET.png ...

Every pixel with alpha > 0 contributes its RGB. Output: sorted hex list, source files with
sha256 and per-file colour count, total count. Base set is configurable through the arguments;
the default is LPC (OD-013).
"""
import argparse
import hashlib
import json
import os
import sys

sys.dont_write_bytecode = True  # no __pycache__ litter in the repo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check import opaque_colours, rgb_to_hex  # noqa: E402

DEFAULT_SOURCES = [
    'research/packs/pack-lpc-atlas/terrain_atlas.png',
    'research/packs/pack-lpc-atlas/base_out_atlas.png',
    # GAME-21: the 17 LPC character-generator walk layers in assets/characters/ are part of the
    # chosen base (OD-013), so they are palette sources too. Listed one by one, never globbed:
    # a new sprite dropped into assets/characters/ must not silently widen the palette.
    'assets/characters/body/bodies/female/walk.png',
    'assets/characters/body/bodies/male/walk.png',
    'assets/characters/body/bodies/teen/walk.png',
    'assets/characters/feet/shoes/basic/male/walk.png',
    'assets/characters/feet/shoes/basic/thin/walk.png',
    'assets/characters/hair/messy1/adult/walk.png',
    'assets/characters/hair/plain/adult/walk.png',
    'assets/characters/hair/ponytail/adult/bg/walk.png',
    'assets/characters/hair/ponytail/adult/fg/walk.png',
    'assets/characters/head/heads/human/female/walk.png',
    'assets/characters/head/heads/human/male/walk.png',
    'assets/characters/head/heads/human/male_small/walk.png',
    'assets/characters/legs/pants/male/walk.png',
    'assets/characters/legs/pants/thin/walk.png',
    'assets/characters/torso/clothes/longsleeve/longsleeve/female/walk.png',
    'assets/characters/torso/clothes/longsleeve/longsleeve/male/walk.png',
    # GAME-147: two more generator layers (Matthew's teen shirt, Anna's hair). Both passed the guard
    # against the 519-colour palette before being listed here, so they widen nothing.
    'assets/characters/torso/clothes/shortsleeve/shortsleeve/teen/walk.png',
    'assets/characters/hair/pixie/adult/walk.png',
]


def build(name, sources):
    colours, meta = set(), []
    for src in sources:
        with open(src, 'rb') as f:
            sha = hashlib.sha256(f.read()).hexdigest()
        c = set(opaque_colours(src))
        if not c:
            raise ValueError(f'{src}: no pixel with alpha > 0 — wrong file?')
        colours |= c
        meta.append({'path': src, 'sha256': sha, 'colors': len(c)})
    hexes = sorted(rgb_to_hex(c) for c in colours)
    return {
        'name': name,
        'generated_by': 'scripts/palette/extract.py',
        'rule': 'RGB of every pixel with alpha > 0',
        'sources': meta,
        'count': len(hexes),
        'colors': hexes,
    }


def dump(data):
    return json.dumps(data, indent=2, ensure_ascii=False) + '\n'


def main(argv=None):
    ap = argparse.ArgumentParser(description='Extract base palette.')
    ap.add_argument('sources', nargs='*', default=DEFAULT_SOURCES)
    ap.add_argument('--name', default='lpc')
    ap.add_argument('--out', default='art/palette/lpc.json')
    ap.add_argument('--check', action='store_true', help='compare with --out instead of writing')
    a = ap.parse_args(argv)
    try:
        data = build(a.name, a.sources)
    except (OSError, ValueError) as e:
        print(f'palette-extract: ERROR — {e}', file=sys.stderr)
        return 2
    text = dump(data)
    if a.check:
        try:
            with open(a.out, encoding='utf-8') as f:
                current = f.read()
        except OSError as e:
            print(f'palette-extract: FAIL — {a.out} unreadable: {e}')
            return 1
        if current != text:
            print(f'palette-extract: FAIL — {a.out} is stale; rerun without --check')
            return 1
        print(f'palette-extract: PASS — {a.out} matches sources ({data["count"]} colours)')
        return 0
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write(text)
    per = ', '.join(f'{m["path"]}={m["colors"]}' for m in data['sources'])
    print(f'palette-extract: {a.out} — {data["count"]} colours ({per})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
