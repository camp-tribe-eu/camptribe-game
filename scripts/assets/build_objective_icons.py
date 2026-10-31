#!/usr/bin/env python3
"""GAME-201: атлас іконок цілей (assets/icons/objective_icons.png) + таблиця клітинок (src/content/objective-icon-atlas.json).

FAL-піктограми (CC-BY-SA 3.0, похідні від LPC, ART-031) + власна робота CampTribe (CC0) для відхилених ключів: піксельні 14x14 малюнки нижче, навколо кожного скрипт кладе 1-піксельний темний контур
(виходить 16x16, читається на будь-якому ґрунті), кольори — найближчі з палітри основи (art/palette/lpc.json).

    python3 scripts/assets/build_objective_icons.py
"""
import colorsys
import json
import os
import sys
from collections import deque

from PIL import Image

sys.dont_write_bytecode = True
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'palette'))
from check import load_palette, nearest  # noqa: E402

# літера -> бажаний колір (потім притягується до палітри)
INK = (0x1b, 0x1f, 0x23)
COL = {'k': INK, 'w': (0xf4, 0xef, 0xe6), 'g': (0x8a, 0x8f, 0x94), 'l': (0xcf, 0xd3, 0xd6), 'r': (0xc8, 0x43, 0x2b), 'o': (0xe0, 0x8a, 0x3a),
       'y': (0xf2, 0xd2, 0x5a), 'G': (0x4f, 0x9a, 0x45), 'b': (0x4a, 0x86, 0xc5), 's': (0x6e, 0xc1, 0xff), 'n': (0x8a, 0x5a, 0x2b), 't': (0xd9, 0xa4, 0x41), 'p': (0xe8, 0x8f, 0xa0)}

ICONS = {
 'tent': ["..............", "......tt......", ".....tttt.....", "....ttGGtt....", "...ttGGGGtt...", "..ttGGGGGGtt..", ".ttGGGGkkGGtt.", "ttGGGGGkkGGGtt", "GGGGGGGkkGGGGG", "GGGGGGkkkkGGGG", "nnnnnnnnnnnnnn", "..............", "..............", ".............."],
 'bag': ["..............", ".....kkkkkk...", "...kkbbbbbbk..", "..kbbbbbbbbbk.", ".kbbbbsssbbbbk", ".kbbbbbbbbbbbk", ".kbbbbbbbbbbbk", ".kbbbbbbbbbbbk", "..kbbbbbbbbbk.", "..kkbbbbbbbkk.", "....kkkkkkk...", "..............", "..............", ".............."],
 'lantern': ["......kk......", ".....k..k.....", "....kkkkkk....", "...kyyyyyyk...", "...kywwwwyk...", "...kywwwwyk...", "...kywwwwyk...", "...kywwwwyk...", "...kyyyyyyk...", "....kkkkkk....", "..............", "..............", "..............", ".............."],
 'cushion': ["..............", "..............", "..rrrrrrrrrr..", ".rrrooooooorr.", ".rooooyyooorr.", ".rooooyyoooor.", ".rooooooooorr.", ".rrrooooooorr.", "..rrrrrrrrrr..", "..............", "..............", "..............", "..............", ".............."],
 'water': ["..............", ".....kkkk.....", ".....kllk.....", "....kssssk....", "...ksswwssk...", "...kswssssk...", "...kssssssk...", "...kssssssk...", "...kssssssk...", "...kbbbbbbk...", "....kkkkkk....", "..............", "..............", ".............."],
 'snack': ["..............", "....tttttt....", "..tttttttttt..", ".tttnttttttnt.", ".ttttttnttttt.", ".tnttttttttnt.", ".ttttttnttttt.", ".tttntttttttt.", "..tttttttttt..", "....tttttt....", "..............", "..............", "..............", ".............."],
 'dinner': ["..............", "...l..l..l....", "....l..l..l...", "..............", ".gggggggggggg.", ".gGGGGGGGGGGg.", ".gGGGGGGGGGGg.", "..gGGyyGGGGg..", "..gGGGGGGGGg..", "...gggggggg...", "..............", "..............", "..............", ".............."],
 'carrier': ["..............", "....kkkkkk....", "...k......k...", "..kkkkkkkkkk..", "..kooooooook..", "..koyykkyyok..", "..kooooooook..", "..koyykkyyok..", "..kooooooook..", "..kkkkkkkkkk..", "..............", "..............", "..............", ".............."],
 'bowl': ["..............", "..............", "..nn..nn......", ".nnnnnnnn.....", "..............", ".kkkkkkkkkkk..", ".kyyyyyyyyyk..", ".kkyoyoyoykk..", "..kkkkkkkkk...", "...kkkkkkk....", "..............", "..............", "..............", ".............."],
 'blanket': ["..............", "..............", ".kkkkkkkkkkk..", ".krrrrrrrrrrk.", ".kwwwwwwwwwwk.", ".krrrrrrrrrrk.", ".kwwwwwwwwwwk.", ".krrrrrrrrrrk.", ".kkkkkkkkkkkk.", "..............", "..............", "..............", "..............", ".............."],
 'firewood': ["..............", "..............", "....nnnnnnnn..", "...ntnnnnnnnk.", "..nnnnnnnnnnk.", "nnnnnnnnnnnkk.", "ntnttnnnnnnk..", "nnnnnnnnnnnnnn", "ntnnnntnnnntnk", "nnnnnnnnnnnnnn", "..............", "..............", "..............", ".............."],
 'litter': ["..............", "......kk......", "....kkggkk....", "...kggggggk...", "..kggggggggk..", "..kgllgggggk..", "..kgllgggggk..", "..kggggggggk..", "..kggggggggk..", "...kgggggggk..", "....kkkkkkk...", "..............", "..............", ".............."],
 'bird': ["..............", "..............", ".......nnn....", "......nnnnn...", ".....nknnntt..", "..nnnnnnnnt...", ".nnnnnnnnn....", "nnnnllnnn.....", "..nnnnnn......", "...n..n.......", "..............", "..............", "..............", ".............."],
 'chain': ["..............", "..............", "..ggggg.......", ".gkkkkkg......", ".gk...kgggggg.", ".gk...kkkkkkg.", ".gkkkkkg...kg.", "..ggggg.gkkkg.", "........gkkkg.", ".........ggg..", "..............", "..............", "..............", ".............."],
 'camera': ["..............", "..............", "....kkkk......", "..kkkkkkkkkk..", ".kkggggggggkk.", ".kgggkkkkgggk.", ".kggkssskkggk.", ".kggkswskkggk.", ".kggkkssskggk.", ".kgggkkkkgggk.", "..kkkkkkkkkk..", "..............", "..............", ".............."],
 'wire': ["..............", "..............", ".rrrr.........", "....rr........", "....rr........", "....rrrrr.....", "........rr....", "...bbbbbrr....", "..bb..........", "..bb..........", "..bbbbbb......", "..............", "..............", ".............."],
 'star': ["..............", "......yy......", "......yy......", ".....yyyy.....", "yyyyyyyyyyyyyy", ".yyyyyyyyyyyy.", "..yyyyyyyyyy..", "...yyyyyyyy...", "...yyyyyyyy...", "..yyyyyyyyyy..", "..yyyy..yyyy..", "..yy......yy..", "..............", ".............."],
 'apple': ["..............", "......n..GG...", ".....nn.GGG...", "..rrrrnrrrr...", ".rrrwrrrrrrr..", ".rrwrrrrrrrr..", ".rrrrrrrrrrr..", ".rrrrrrrrrrr..", "..rrrrrrrrr...", "...rrr.rrr....", "..............", "..............", "..............", ".............."],
 'car': ["..............", "..............", "....kkkkkk....", "...kssswsskk..", "..ksssswsssk..", "..kbbbbbbbbk..", ".kbbbbbbbbbbk.", ".kbbbbbbbbbbk.", ".kkkkkkkkkkkk.", "..kggk..kggk..", "...kk....kk...", "..............", "..............", ".............."],
 'suitcase': ["..............", "....kkkkkk....", "....k....k....", ".kkkkkkkkkkkk.", ".knnnnnnnnnnk.", ".knnttttttnnk.", ".knnnnyynnnnk.", ".knnnnnnnnnnk.", ".knnnnnnnnnnk.", ".kkkkkkkkkkkk.", "..............", "..............", "..............", ".............."],
 'map': ["..............", "..............", ".kkkkkkkkkkkk.", ".kwwkGGkwwwwk.", ".kwkGGGGkwwwk.", ".kkGGGkkkkwwk.", ".kGGkwwwkkGGk.", ".kwwkwrwwkGGk.", ".kwwwkwwwkwwk.", ".kkkkkkkkkkkk.", "..............", "..............", "..............", ".............."],
 'heart': ["..............", "..............", "..rrr..rrr....", ".rrwrr.rrrr...", ".rwrrrrrrrrr..", ".rrrrrrrrrrr..", "..rrrrrrrrr...", "...rrrrrrr....", "....rrrrr.....", ".....rrr......", "......r.......", "..............", "..............", ".............."],
 'wrench': ["..............", "...ggg..ggg...", "..gg.gggg.gg..", "..g...gggg.g..", "..gg.gggg.gg..", "...gggg.gg....", ".....gg.......", ".....gg.......", ".....gg.......", ".....gg.......", ".....ggg......", "......gg......", "..............", ".............."],
 'tyre': ["..............", "....kkkkkk....", "..kkggggggkk..", ".kggkkkkkkggk.", ".kgkkllllkkgk.", "kggkllkklllgkk", "kggklkyykllgkk", "kggkllkklllgkk", ".kgkkllllkkgk.", ".kggkkkkkkggk.", "..kkggggggkk..", "....kkkkkk....", "..............", ".............."],
 'cat': ["..............", "..g........g..", "..gg......gg..", "..gggggggggg..", ".gggggggggggg.", ".ggkkgggkkggg.", ".ggkyggkyggg..", ".gggggpgggggg.", ".ggggkpkgggg..", "..gggggggggg..", "...gggggggg...", "..............", "..............", ".............."],
 'bike': ["..............", "..............", ".........kk...", "...bbbbbbb....", "..lllbb.blll..", ".l...lbbl...l.", ".l...bl.b...l.", ".l..b.l..b..l.", "..lll...lll...", "..............", "..............", "..............", "..............", ".............."],
 'boots': ["..............", "..............", "..nnnn..nnnn..", "..nnnn..nnnn..", "..nnnn..nnnn..", "..nnnn..nnnn..", "..nnnn..nnnn..", ".nnnnnn.nnnnn.", ".nnnnnn.nnnnn.", ".kkkkkk.kkkkk.", "..............", "..............", "..............", ".............."],
 'flag': ["..............", "..nkk.........", "..nrrrrrr.....", "..nrrrrrrrr...", "..nrrrrrr.....", "..nrr.........", "..n...........", "..n...........", "..n...........", ".nnn..........", "..............", "..............", "..............", ".............."],
 'coins': ["..............", "..............", "..............", "....kkkkkk....", "...kyyyyyyk...", "..kyytyyttyk..", "..kyyyyyyyyk..", "...kkkkkkkk...", "..kyyyyyyyyk..", "..kyttyyttyk..", "...kkkkkkkk...", "..............", "..............", ".............."],
 'line': ["..............", "..............", "kkkkkkkkkkkkkk", "..r..bb..yy...", ".rrr.bbb.yyy..", ".rrr.bbb.yyy..", ".rrr.bbb.yyy..", "..r..bb..yy...", "..............", "..............", "..............", "..............", "..............", ".............."],
 'compass': ["..............", "....kkkkkk....", "..kkwwwwwwkk..", ".kwwwwrwwwwwk.", ".kwwwwrrwwwwk.", ".kwwwrrrrwwwk.", ".kwwwlllllwwk.", ".kwwwwlllwwwk.", ".kwwwwwlwwwwk.", "..kkwwwwwwkk..", "....kkkkkk....", "..............", "..............", ".............."],
}

# GAME-201: де є FAL-малюнок (art/out/objective-icons-1/<key>_0.webp, фон — рожево-малиновий), беремо його; відхилені лишаються програмними.
FAL_DIR = os.path.join(ROOT, 'art', 'out', 'objective-icons-1')
REJECT = set()   # огляд 31.10.2026: 5 нечитабельних із першого прогону перегенеровано (art/requests/objective-icons-2.json) — беруться з FAL_DIR2
FAL_DIR2 = os.path.join(ROOT, 'art', 'out', 'objective-icons-2')   # другий прогін має перевагу: chain, cushion, snack, litter, tyre
CELL = 16


def _is_magenta(rgb, strict):
    h, sat, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    hue = h * 360
    if strict:
        return 285 <= hue <= 340 and sat > 0.5 and v > 0.45
    return 270 <= hue <= 345 and sat > 0.3 and v > 0.2   # тіні й рожева кайма, зв'язані з краєм


def fal_cell(path, pal, ink):
    """FAL webp -> клітинка CELLxCELL RGBA: ключ малинового (+заливка від краю), обрізка за bbox, box-фільтр, <=16 кольорів із палітри, контур."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    clear = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        q.extend(((x, 0), (x, h - 1)))
    for y in range(h):
        q.extend(((0, y), (w - 1, y)))
    while q:                                   # заливка від краю: лише фон, а не червоні/рожеві деталі всередині
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or clear[y][x] or not _is_magenta(px[x, y], False):
            continue
        clear[y][x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    out = Image.new('RGBA', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if not clear[y][x] and not _is_magenta(px[x, y], True):
                op[x, y] = (*px[x, y], 255)
    bbox = out.getchannel('A').point(lambda a: 255 if a > 0 else 0).getbbox()
    assert bbox, path
    out = out.crop(bbox)
    sc = min(CELL / out.width, CELL / out.height)
    nw, nh = max(1, round(out.width * sc)), max(1, round(out.height * sc))
    a = out.getchannel('A').resize((nw, nh), Image.BOX)
    rgb = Image.new('RGB', out.size, (0, 0, 0))
    rgb.paste(out.convert('RGB'), mask=out.getchannel('A'))
    # колір усереднюємо лише по непрозорих пікселях (прем-множення), щоб фон не просочувався
    prem = Image.merge('RGBA', (*[c.point(lambda v: v) for c in rgb.split()], out.getchannel('A')))
    big = prem.resize((nw, nh), Image.BOX)
    cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    cp, ap, bp = cell.load(), a.load(), big.load()
    solid = set()
    ox, oy = (CELL - nw) // 2, CELL - nh - (CELL - nh) // 2
    for y in range(nh):
        for x in range(nw):
            al = ap[x, y]
            if al >= 128:
                r, g, b, aa = bp[x, y]
                k = 255 / max(aa, 1)
                solid.add((x + ox, y + oy))
                cp[x + ox, y + oy] = (min(255, round(r * k)), min(255, round(g * k)), min(255, round(b * k)), 255)
    # <=16 кольорів: медіанний зріз по суцільних пікселях, потім кожен — до найближчого з палітри
    sub = Image.new('RGB', (len(solid) or 1, 1))
    sub.putdata([cp[p][:3] for p in sorted(solid)])
    qimg = sub.quantize(16, method=Image.MEDIANCUT)
    pq = qimg.getpalette()
    for i, p in enumerate(sorted(solid)):
        c = qimg.getpixel((i, 0))
        cp[p] = (*nearest((pq[3 * c], pq[3 * c + 1], pq[3 * c + 2]), pal)[0], 255)
    for (x, y) in solid:                       # контур: крайні темні пікселі -> чорнило, щоб читалось на будь-якому ґрунті
        if any((x + dx, y + dy) not in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            r, g, b, _ = cp[x, y]
            if 0.299 * r + 0.587 * g + 0.114 * b < 110:
                cp[x, y] = (*ink, 255)
    return cell


def build():
    _, pal = load_palette(os.path.join(ROOT, 'art', 'palette', 'lpc.json'))
    keys = list(ICONS)
    cols = 8
    rows = (len(keys) + cols - 1) // cols
    atlas = Image.new('RGBA', (cols * 16, rows * 16), (0, 0, 0, 0))
    cells = {}
    ink = nearest(INK, pal)[0]
    for i, k in enumerate(keys):
        fal2 = os.path.join(FAL_DIR2, k + '_0.webp')
        fal = fal2 if os.path.exists(fal2) else os.path.join(FAL_DIR, k + '_0.webp')
        if k not in REJECT and os.path.exists(fal):
            atlas.paste(fal_cell(fal, pal, ink), ((i % cols) * 16, (i // cols) * 16))
            cells[k] = i
            continue
        art = ICONS[k]
        assert len(art) == 14 and all(len(r) == 14 for r in art), k
        cell = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        px = cell.load()
        solid = set()
        for y, row in enumerate(art):
            for x, ch in enumerate(row):
                if ch != '.':
                    solid.add((x + 1, y + 1))
                    px[x + 1, y + 1] = (*nearest(COL[ch], pal)[0], 255)
        for (x, y) in list(solid):   # зовнішній контур: сусід по 4 напрямках без піктограми
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                p = (x + dx, y + dy)
                if p not in solid and 0 <= p[0] < 16 and 0 <= p[1] < 16:
                    px[p[0], p[1]] = (*ink, 255)
        atlas.paste(cell, ((i % cols) * 16, (i // cols) * 16))
        cells[k] = i
    atlas.save(os.path.join(ROOT, 'assets', 'icons', 'objective_icons.png'))
    with open(os.path.join(ROOT, 'src', 'content', 'objective-icon-atlas.json'), 'w') as f:
        json.dump({'size': 16, 'cols': cols, 'cells': cells}, f, indent=1)
        f.write('\n')
    print(len(keys), 'icons', atlas.size)

if __name__ == '__main__':
    build()
