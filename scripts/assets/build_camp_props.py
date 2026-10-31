#!/usr/bin/env python3
"""GAME-205 · аркуш assets/tiles/camp_props.png — 12 предметів європейського кемпінгу (каравани, стовпчик електрики, баки сортування, меблі, мотузка,
шлагбаум, рецепція, санблок, велосипеди, ліхтар, кран), згенерованих fal-ai/flux-pro/kontext за референсом assets/tiles/home_furniture.png
(CC-BY-SA 3.0), тека art/out/camp-items-1/. Малювали за research/refs/NOTES.md (фото кемпінгів).

    python3 scripts/assets/build_camp_props.py [--check]

Постобробка та сама, що в build_shop_gear.py: ключ фону, прибрано дрібні плями й пурпурову кайму, обрізка, зменшення BOX у рамку клітинок
(низом до низу), квантування на палітру LPC.
"""
import os
import sys
import tempfile
from collections import deque

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'palette'))
from check import load_palette  # noqa: E402
from quantize import quantize  # noqa: E402

T = 32
SRC = os.path.join(ROOT, 'art/out/camp-items-1')
DST = os.path.join(ROOT, 'assets/tiles/camp_props.png')
COLS, ROWS = 12, 7
# (файл без _0.webp, (col, row, w_tiles, h_tiles))
ITEMS = [
    ('caravan', (0, 0, 5, 2)), ('motorhome', (5, 0, 5, 2)), ('hookup-post', (10, 0, 1, 2)), ('lamp-post', (11, 0, 1, 3)), ('water-tap', (10, 2, 1, 1)),
    ('clothesline', (0, 2, 4, 2)), ('camp-table-chairs', (4, 2, 2, 1)), ('recycling-bins', (7, 2, 3, 1)), ('bicycles', (7, 3, 2, 1)),
    ('barrier', (0, 4, 3, 1)), ('reception-hut', (3, 4, 3, 2)), ('sanitary-block', (6, 4, 5, 3)),
]


def is_bg(p):
    r, g, b = p
    return r > 150 and g < 120 and b > 70 and r - g > 110 and b - g > 40


def key_out(im):
    im = im.convert('RGB')
    w, h = im.size
    px = im.load()
    bg = bytearray(w * h)
    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or bg[y * w + x] or not is_bg(px[x, y]):
            continue
        bg[y * w + x] = 1
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    out = Image.new('RGBA', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if not bg[y * w + x] and not (r > 150 and b > 95 and g < 110 and b - g > 75):   # і замкнені «вікна» фону всередині предмета
                op[x, y] = px[x, y] + (255,)
    return out


def drop_small(im, frac=0.06):
    w, h = im.size
    px = im.load()
    seen = set()
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0][3] < 128 or (x0, y0) in seen:
                continue
            comp, st = [], [(x0, y0)]
            seen.add((x0, y0))
            while st:
                x, y = st.pop()
                comp.append((x, y))
                for dx in (-2, -1, 0, 1, 2):
                    for dy in (-2, -1, 0, 1, 2):
                        n = (x + dx, y + dy)
                        if 0 <= n[0] < w and 0 <= n[1] < h and n not in seen and px[n][3] >= 128:
                            seen.add(n)
                            st.append(n)
            comps.append(comp)
    big = max(len(c) for c in comps)
    out = Image.new('RGBA', im.size)
    for c in comps:
        if len(c) >= big * frac:
            for x, y in c:
                out.putpixel((x, y), px[x, y])
    return out


def decontaminate(im, strict=False):
    """Знімає пурпурову кайму: піксель із пурпуровим відтінком поруч із прозорим стає прозорим."""
    w, h = im.size
    px = im.load()
    kill = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and px[x, y][0] > 120 and px[x, y][2] > 70 and px[x, y][2] - px[x, y][1] > 35 and abs(px[x, y][0] - px[x, y][2]) < 150:
                near = any(0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0 for dx in (-2, -1, 0, 1, 2) for dy in (-2, -1, 0, 1, 2))
                if near:
                    kill.append((x, y))
    for x, y in kill:
        px[x, y] = (0, 0, 0, 0)
    # GAME-204 (рецензія 3): лише для strict-предметів (стійка взуття) рожево-бордові залишки напівпрозорої кайми (r > g + 25 і b > g + 8) зникають у всьому предметі;
    # дерево має b < g, а на касі темні шви шафи цього кольору — тому не для всіх.
    for _ in range(2 if strict else 0):
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a and r > g + 25 and b > g + 8:
                    px[x, y] = (0, 0, 0, 0)
    return im


STRICT = {'boots-rack'}


def sprite(name, w_tiles, h_tiles):
    im = Image.open(os.path.join(SRC, f'{name}_0.webp'))
    im = drop_small(decontaminate(key_out(im), name in STRICT))
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v >= 128 else 0).getbbox())
    k = min(w_tiles * T / im.width, h_tiles * T / im.height)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)


def build(workdir):
    sheet = Image.new('RGBA', (COLS * T, ROWS * T))
    for name, (c, r, w, h) in ITEMS:
        s = sprite(name, w, h)
        sheet.alpha_composite(s, (c * T + (w * T - s.width) // 2, (r + h) * T - s.height))
    raw = os.path.join(workdir, 'raw.png')
    sheet.save(raw)
    dst = os.path.join(workdir, 'camp_props.png')
    quantize(raw, dst, load_palette(os.path.join(ROOT, 'art/palette/lpc.json'))[1])
    return dst


def main(argv):
    with tempfile.TemporaryDirectory() as wd:
        built = build(wd)
        if '--check' in argv:
            same = os.path.exists(DST) and open(DST, 'rb').read() == open(built, 'rb').read()
            print('camp_props.png: ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ'))
            return 0 if same else 1
        open(DST, 'wb').write(open(built, 'rb').read())
        print('записано', DST)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
