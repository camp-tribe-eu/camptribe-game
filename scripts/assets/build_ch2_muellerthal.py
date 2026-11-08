#!/usr/bin/env python3
"""GAME-284 · Розділ 2, Мюллерталь: assets/tiles/ch2_muellerthal.png (ландшафт) і ch2_objects.png (орхідеї, пляшка з половинкою медальйона).

    python3 scripts/assets/build_ch2_muellerthal.py [--check]

Усе — вирізки LPC з research/packs/ (першоджерела OGA, ліцензії в docs/LICENSE_REGISTER.md); ШІ тайлів не малював.
  ch2_muellerthal.png: скелі-урвища (LPC Base Assets mountains.png), водоспад (waterfall.png), валун (rock.png), 6 автотайл-блоків 96x96 із
    [LPC] Terrains terrain-v7.png (пісковик, сірий камінь, бура земля, ставок, два лісових відтінки трави), дерева/кущі з LPC Tile Atlas.
  ch2_objects.png: 3 поодинокі квітки (LPC Base Object Kit, Flowers.png — орхідеї як окремий предмет) + мала скляна пляшка того ж набору
    з дорисованою половинкою медальйона (кілька пікселів, квантування на палітру основи).
Квантування на палітру (scripts/palette/quantize.py): сторож палітри має допуск 0.
"""
import os
import sys
import tempfile

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'palette'))
from check import load_palette  # noqa: E402
from quantize import quantize  # noqa: E402

P = os.path.join(ROOT, 'research/packs')
BASE = os.path.join(P, 'pack-lpc-base/pack/LPC Base Assets/tiles')
T7 = os.path.join(P, 'pack-lpc-terrains/pack/lpc-terrains/terrain-v7.png')
ATLAS = os.path.join(P, 'pack-lpc-atlas/base_out_atlas.png')
FLOWERS = os.path.join(P, 'pack-lpc-base-object-kit/pack/Objects/Decoration/Flowers.png')
OUT1 = os.path.join(ROOT, 'assets/tiles/ch2_muellerthal.png')
OUT2 = os.path.join(ROOT, 'assets/tiles/ch2_objects.png')
PAL = os.path.join(ROOT, 'art/palette/lpc.json')

# (ім'я, файл, прямокутник джерела x,y,w,h, місце на аркуші x,y)
LAND = [
    ('cliffs', os.path.join(BASE, 'mountains.png'), None, (0, 0)),
    ('waterfall', os.path.join(BASE, 'waterfall.png'), None, (384, 0)),
    ('boulders', os.path.join(BASE, 'rock.png'), None, (480, 0)),
    ('grey-stone', T7, (0, 1312, 96, 96), (0, 288)),
    ('white-cobble', T7, (96, 1312, 96, 96), (96, 288)),
    ('sandstone', T7, (192, 1312, 96, 96), (192, 288)),
    ('brown-dirt', T7, (480, 1312, 96, 96), (288, 288)),
    ('pond', T7, (576, 1312, 96, 96), (384, 288)),
    ('forest-grass', T7, (0, 1088, 96, 96), (480, 288)),
    ('forest-grass-2', T7, (96, 1088, 96, 96), (576, 288)),
    ('trees', ATLAS, (768, 384, 192, 224), (0, 384)),
    ('trunks', ATLAS, (832, 600, 128, 88), (64, 608)),
]
FLOWER_CELLS = [5, 6, 8]          # пурпурова, рожева, біла — поодинокі (рядок 0, клітинки 32 px)
BOTTLE_CELL = (3, 2)


def paste(dst, path, rect, at):
    im = Image.open(path).convert('RGBA')
    if rect:
        x, y, w, h = rect
        im = im.crop((x, y, x + w, y + h))
    dst.alpha_composite(im, at)


def build(wd):
    pal = load_palette(PAL)[1]
    s1 = Image.new('RGBA', (672, 688))
    for _, f, r, at in LAND:
        paste(s1, f, r, at)
    s1.save(os.path.join(wd, 'a.png'))
    quantize(os.path.join(wd, 'a.png'), os.path.join(wd, 'ch2_muellerthal.png'), pal)
    fl = Image.open(FLOWERS).convert('RGBA')
    s2 = Image.new('RGBA', (32 * 4, 32))
    for i, c in enumerate(FLOWER_CELLS):
        s2.alpha_composite(fl.crop((c * 32, 0, c * 32 + 32, 32)), (i * 32, 0))
    bx, by = BOTTLE_CELL
    b = fl.crop((bx * 32, by * 32, bx * 32 + 32, by * 32 + 32))
    bb = b.getchannel('A').getbbox()
    # половинка медальйона: охристий півдиск 3x2 px у нижній третині пляшки, один блік світліше
    cx, y0 = (bb[0] + bb[2]) // 2, bb[3] - 6
    for dx, dy, col in [(-1, 0, (214, 170, 52)), (0, 0, (214, 170, 52)), (1, 0, (214, 170, 52)), (-1, 1, (160, 112, 32)), (0, 1, (160, 112, 32)), (-2, 0, (80, 56, 24))]:
        b.putpixel((cx + dx, y0 + dy), col + (255,))
    s2.alpha_composite(b, (96, 0))
    s2.save(os.path.join(wd, 'b.png'))
    quantize(os.path.join(wd, 'b.png'), os.path.join(wd, 'ch2_objects.png'), pal)
    return [os.path.join(wd, 'ch2_muellerthal.png'), os.path.join(wd, 'ch2_objects.png')], [OUT1, OUT2]


def main(argv):
    with tempfile.TemporaryDirectory() as wd:
        built, dst = build(wd)
        for b, d in zip(built, dst):
            if '--check' in argv:
                same = os.path.exists(d) and open(d, 'rb').read() == open(b, 'rb').read()
                print(os.path.basename(d) + ': ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ'))
                if not same:
                    return 1
            else:
                open(d, 'wb').write(open(b, 'rb').read())
                print('записано', d)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
