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
DST = os.path.join(ROOT, 'assets/tiles/camp_props.png')
SCALE_JSON = os.path.join(ROOT, 'art/world-scale.json')
PX_PER_M = 28           # OD-026: дорослий LPC ≈ 47 px ≈ 1,7 м
COLS = 14
# (ім'я, id у world-scale.json, тека джерела, файл-варіант). GAME-205 (друга черга): предмети, що провалили сторож (WORLD_ISO/WORLD_SCALE),
# перемальовані ортогонально (camp-items-2); решта лишається з camp-items-1, але тепер масштабується до справжньої ширини.
ITEMS = [
    ('caravan', 'caravan', 'camp-items-2', 0), ('motorhome', 'motorhome', 'camp-items-2', 1),
    ('sanitary', 'sanitary-block', 'camp-items-2', 0), ('reception', 'reception-hut', 'camp-items-2', 0),
    ('clothesline', 'clothesline', 'camp-items-1', 0), ('bins', 'recycling-bins', 'camp-items-1', 0), ('barrier', 'barrier', 'camp-items-2', 1),
    ('table', 'camp-table', 'camp-items-1', 0), ('bikes', 'bicycles', 'camp-items-1', 0),
    ('hookup', 'hookup-post', 'camp-items-2', 1), ('lamp', 'lamp-post', 'camp-items-2', 0), ('tap', 'water-tap', 'camp-items-2', 1),
]
SRC_FILE = {'sanitary': 'sanitary-block', 'reception': 'reception-hut', 'bins': 'recycling-bins', 'bikes': 'bicycles', 'table': 'camp-table-chairs',
            'hookup': 'hookup-post', 'lamp': 'lamp-post', 'tap': 'water-tap'}


def real_widths():
    """-> {id: ('w'|'h', метри)}: тонкі предмети (measure: height) масштабуються за висотою, решта — за шириною."""
    import json
    out = {}
    for e in json.load(open(SCALE_JSON, encoding='utf8'))['entries']:
        out[e['id']] = ('h', e['real_height_m']) if e.get('measure') == 'height' else ('w', e['real_width_m'])
    return out


def is_bg(p):
    r, g, b = p
    return r > 140 and g < 130 and b > 80 and r - g > 90 and b - g > 40


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
            if px[x, y][3] and px[x, y][0] > 110 and px[x, y][2] > 60 and px[x, y][2] - px[x, y][1] > 22 and px[x, y][0] - px[x, y][1] > 30 and abs(px[x, y][0] - px[x, y][2]) < 150:
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


def sprite(name, src, variant, target):
    im = Image.open(os.path.join(ROOT, 'art/out', src, f'{SRC_FILE.get(name, name)}_{variant}.webp'))
    im = key_out(im)
    for _ in range(2):                                   # пурпурова кайма: два проходи (друга знімає рожеві «тіні» під першою)
        im = decontaminate(im, True)
    im = drop_small(im)
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v >= 128 else 0).getbbox())
    axis, px = target
    k = px / (im.width if axis == 'w' else im.height)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)


def layout(sprites):
    """Шельфове пакування у клітинки 32 px: -> {ім'я: (col, row, w_tiles, h_tiles, x_off, y_off)}, висота аркуша в рядках."""
    pos, col, row, rowh = {}, 0, 0, 0
    for name, s in sprites.items():
        wt, ht = -(-s.width // T), -(-s.height // T)
        if col + wt > COLS:
            col, row, rowh = 0, row + rowh, 0
        pos[name] = (col, row, wt, ht)
        col += wt
        rowh = max(rowh, ht)
    return pos, row + rowh


def build(workdir):
    rw = real_widths()
    sprites = {n: sprite(n, src, v, (rw[i][0], round(rw[i][1] * PX_PER_M))) for n, i, src, v in ITEMS}
    pos, rows = layout(sprites)
    sheet = Image.new('RGBA', (COLS * T, rows * T))
    crops = {}
    for (name, i, _, _), s in zip(ITEMS, sprites.values()):
        c, r, wt, ht = pos[name]
        x, y = c * T + (wt * T - s.width) // 2, (r + ht) * T - s.height
        sheet.alpha_composite(s, (x, y))
        crops[i] = [c * T, r * T, wt * T, ht * T]
    raw = os.path.join(workdir, 'raw.png')
    sheet.save(raw)
    dst = os.path.join(workdir, 'camp_props.png')
    quantize(raw, dst, load_palette(os.path.join(ROOT, 'art/palette/lpc.json'))[1])
    return dst, pos, rows, crops


def write_scale(crops):
    import json
    d = json.load(open(SCALE_JSON, encoding='utf8'))
    for e in d['entries']:
        if e['id'] in crops:
            e['crop'] = crops[e['id']]
    open(SCALE_JSON, 'w', encoding='utf8').write(json.dumps(d, indent=1, ensure_ascii=False) + '\n')


def prop_sheet():
    """Для build_camp_lake.py: {ім'я: (col, row, w_tiles, h_tiles)}; рядків аркуша."""
    rw = real_widths()
    sprites = {n: sprite(n, src, v, (rw[i][0], round(rw[i][1] * PX_PER_M))) for n, i, src, v in ITEMS}
    pos, rows = layout(sprites)
    return pos, rows


def main(argv):
    with tempfile.TemporaryDirectory() as wd:
        built, pos, rows, crops = build(wd)
        if '--check' in argv:
            same = os.path.exists(DST) and open(DST, 'rb').read() == open(built, 'rb').read()
            print('camp_props.png: ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ'))
            return 0 if same else 1
        open(DST, 'wb').write(open(built, 'rb').read())
        write_scale(crops)
        print('аркуш', COLS * T, 'x', rows * T, pos)
        print('записано', DST)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
