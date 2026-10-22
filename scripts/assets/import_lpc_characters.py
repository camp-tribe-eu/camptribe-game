#!/usr/bin/env python3
"""Import LPC character walk layers into assets/characters/ with their credits (GAME-21).

    python3 scripts/assets/import_lpc_characters.py            # fetch layers + rewrite their CREDITS rows
    python3 scripts/assets/import_lpc_characters.py --offline  # rewrite rows from a saved upstream CREDITS.csv

Source: the Universal LPC Spritesheet Character Generator on raw.githubusercontent.com (reachable
from a session; opengameart.org is not). For every layer in LAYERS:
  * spritesheets/<path>/walk.png -> assets/characters/<path>/walk.png, bytes unchanged;
  * the generator's CREDITS.csv row for <path>/walk.png -> a row of assets/CREDITS.csv.
Rows of assets/CREDITS.csv that are not under characters/ are kept as they are.

Licence choice: the generator offers several licences per layer; we take the most permissive one
(CC0 > OGA-BY > CC-BY > CC-BY-SA > GPL). A layer with no upstream row is an error, not a skip.
Upstream fields carry trailing spaces after the closing quote; they are stripped.
After running: node scripts/assets/check-assets.mjs --write-json && node scripts/assets/check-assets.mjs
"""
import argparse
import csv
import io
import os
import sys
import urllib.request

REPO = 'LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator'
RAW = f'https://raw.githubusercontent.com/{REPO}/master'
HOME = f'https://github.com/{REPO}'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CREDITS = os.path.join(ROOT, 'assets', 'CREDITS.csv')
HEADER = ['file', 'authors', 'licence', 'licences_offered', 'source_urls', 'origin', 'notes']

# The 17 layers of the art spike (research/art-spike/compose_chars.py, OD-013).
LAYERS = [
    'body/bodies/male', 'body/bodies/female', 'body/bodies/teen',
    'head/heads/human/male', 'head/heads/human/female', 'head/heads/human/male_small',
    'hair/plain/adult', 'hair/messy1/adult', 'hair/ponytail/adult/fg', 'hair/ponytail/adult/bg',
    'torso/clothes/longsleeve/longsleeve/male', 'torso/clothes/longsleeve/longsleeve/female',
    'torso/clothes/longsleeve/longsleeve/teen',
    'legs/pants/male', 'legs/pants/thin',
    'feet/shoes/basic/male', 'feet/shoes/basic/thin',
]

RANK = ['CC0', 'OGA-BY', 'CC-BY', 'CC-BY-SA', 'GPL']


def family(lic):
    """'CC-BY-SA 3.0' -> 'CC-BY-SA'; unknown -> None."""
    name = lic.split(' ')[0]
    return name if name in RANK else None


def most_permissive(offered):
    known = [o for o in offered if family(o)]
    if not known:
        raise ValueError(f'no known licence in {offered}')
    # Within one family prefer a versioned name ("CC-BY 3.0") over a bare one ("CC-BY").
    return min(known, key=lambda o: (RANK.index(family(o)), ' ' not in o))


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--offline', metavar='UPSTREAM_CREDITS_CSV')
    a = ap.parse_args(argv)
    raw = open(a.offline, 'rb').read() if a.offline else get(f'{RAW}/CREDITS.csv')
    upstream = {}
    for r in csv.DictReader(io.StringIO(raw.decode('utf-8'))):
        upstream[r['filename'].strip()] = {k: (v or '').strip() for k, v in r.items()}

    rows = []
    for layer in LAYERS:
        name = f'{layer}/walk.png'
        u = upstream.get(name)
        if not u:
            print(f'import: ERROR — no upstream CREDITS row for {name}', file=sys.stderr)
            return 1
        if not a.offline:
            dst = os.path.join(ROOT, 'assets', 'characters', name)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, 'wb') as f:
                f.write(get(f'{RAW}/spritesheets/{name}'))
        offered = [x.strip() for x in u['licenses'].split(',') if x.strip()]
        urls = [x.strip() for x in u['urls'].split(',') if x.strip()]
        notes = u['notes']
        if not urls:
            urls = [HOME]
            notes = (notes + '; ' if notes else '') + 'upstream CREDITS.csv names no source page'
        rows.append({
            'file': f'characters/{name}',
            'authors': '; '.join(x.strip() for x in u['authors'].split(',') if x.strip()),
            'licence': most_permissive(offered),
            'licences_offered': ' | '.join(offered),
            'source_urls': ' '.join(urls),
            'origin': f'{RAW}/spritesheets/{name}',
            'notes': notes,
        })

    kept = []
    if os.path.exists(CREDITS):
        with open(CREDITS, encoding='utf-8', newline='') as f:
            kept = [r for r in csv.DictReader(f) if not r['file'].startswith('characters/')]
    with open(CREDITS, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=HEADER, lineterminator='\n')
        w.writeheader()
        for r in sorted(kept + rows, key=lambda r: r['file']):
            w.writerow(r)
    print(f'import: {len(rows)} character rows, {len(kept)} other rows kept -> assets/CREDITS.csv')
    return 0


if __name__ == '__main__':
    sys.exit(main())
