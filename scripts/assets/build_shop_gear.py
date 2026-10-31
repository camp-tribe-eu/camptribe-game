#!/usr/bin/env python3
"""GAME-204 · аркуш assets/tiles/shop_gear.png — 11 предметів крамниці (масштаб — справжня ширина × 28 px/м, OD-026) туристичного спорядження, згенерованих fal-ai/flux-pro/kontext
за референсом assets/tiles/home_furniture.png (CC-BY-SA 3.0), тека art/out/shop-items-1/.

    python3 scripts/assets/build_shop_gear.py [--check]

Постобробка: ключ фону (заливка від країв по пурпуровому; фон — градієнт біля #FF00FF), дрібні відокремлені плями (розтяжки намету) прибрано,
обрізка до видимого, зменшення BOX у рамку «клітинки предмета» зі збереженням пропорцій, низом до низу клітинки (предмет стоїть на підлозі),
квантування на палітру LPC (scripts/palette/quantize.py). shop-window (зовнішня вітрина) в аркуш не входить.
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
PX_PER_M = 28                                          # art/world-scale.json: px_per_m (OD-026)
OUT = os.path.join(ROOT, 'art/out')
DST = os.path.join(ROOT, 'assets/tiles/shop_gear.png')
LAYOUT = os.path.join(ROOT, 'art/shop_gear_layout.json')   # (колонка, рядок, ширина, висота) у тайлах — читає scripts/maps/build_home.py
COLS = 11
# GAME-204 / OD-026: кожен предмет масштабується до СПРАВЖНЬОЇ ширини × 28 px/м (рівно ті числа, що в art/world-scale.json), а не «вписується в клітинки».
# (файл без _0.webp, справжня ширина, м, каталоги джерела від найновішого). Клітинки аркуша виходять із розміру спрайта.
ITEMS = [
    ('checkout', 2.0, ['shop-items-1']), ('fridge', 0.9, ['shop-items-1']), ('backpack-wall', 2.2, ['shop-items-1']),
    ('rods-rack', 1.5, ['shop-items-2', 'shop-items-1']), ('shop-door', 1.7, ['shop-items-3', 'shop-items-1']), ('dome-tent', 2.4, ['shop-items-1']),
    ('boots-rack', 1.1, ['shop-items-4', 'shop-items-2', 'shop-items-1']), ('sleeping-bags', 1.1, ['shop-items-1']), ('chairs-display', 1.8, ['shop-items-1']),
    ('gas-shelf', 1.1, ['shop-items-2', 'shop-items-1']), ('lantern-display', 1.0, ['shop-items-1']),
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


def source(name, dirs):
    for d in dirs:
        p = os.path.join(OUT, d, f'{name}_0.webp')
        if os.path.exists(p):
            return p
    raise SystemExit(f'немає джерела для {name}: {dirs}')


def sprite(name, real_w, dirs):
    im = Image.open(source(name, dirs))
    im = drop_small(decontaminate(key_out(im), name in STRICT))
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v >= 128 else 0).getbbox())
    k = real_w * PX_PER_M / im.width
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)


def build(workdir):
    sprites = [(n, sprite(n, w, d)) for n, w, d in ITEMS]
    layout, x, y, rowh = {}, 0, 0, 0
    for n, s in sprites:
        wt, ht = -(-s.width // T), -(-s.height // T)
        if x + wt > COLS:
            x, y, rowh = 0, y + rowh, 0
        layout[n] = (x, y, wt, ht)
        x, rowh = x + wt, max(rowh, ht)
    rows = y + rowh
    sheet = Image.new('RGBA', (COLS * T, rows * T))
    for n, s in sprites:
        c, r, w, h = layout[n]
        sheet.alpha_composite(s, (c * T + (w * T - s.width) // 2, (r + h) * T - s.height))
    raw = os.path.join(workdir, 'raw.png')
    sheet.save(raw)
    dst = os.path.join(workdir, 'shop_gear.png')
    quantize(raw, dst, load_palette(os.path.join(ROOT, 'art/palette/lpc.json'))[1])
    return dst, layout, {n: s.size for n, s in sprites}, rows


def main(argv):
    with tempfile.TemporaryDirectory() as wd:
        built, layout, sizes, rows = build(wd)
        import json
        lay = json.dumps({'cols': COLS, 'rows': rows, 'cells': layout, 'sprite_px': sizes}, indent=1)
        if '--check' in argv:
            same = os.path.exists(DST) and open(DST, 'rb').read() == open(built, 'rb').read() and os.path.exists(LAYOUT) and open(LAYOUT).read() == lay
            print('shop_gear.png: ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ'))
            return 0 if same else 1
        open(DST, 'wb').write(open(built, 'rb').read())
        open(LAYOUT, 'w').write(lay)
        print(sizes, 'рядків', rows)
        print('записано', DST)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
