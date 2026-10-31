#!/usr/bin/env python3
"""GAME-201: атлас іконок цілей (assets/icons/objective_icons.png) + таблиця клітинок (src/content/objective-icon-atlas.json).

Власна робота CampTribe (CC0): піксельні 14x14 малюнки нижче, навколо кожного скрипт кладе 1-піксельний темний контур
(виходить 16x16, читається на будь-якому ґрунті), кольори — найближчі з палітри основи (art/palette/lpc.json).

    python3 scripts/assets/build_objective_icons.py
"""
import json
import os
import sys

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

def build():
    _, pal = load_palette(os.path.join(ROOT, 'art', 'palette', 'lpc.json'))
    keys = list(ICONS)
    cols = 8
    rows = (len(keys) + cols - 1) // cols
    atlas = Image.new('RGBA', (cols * 16, rows * 16), (0, 0, 0, 0))
    cells = {}
    ink = nearest(INK, pal)[0]
    for i, k in enumerate(keys):
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
