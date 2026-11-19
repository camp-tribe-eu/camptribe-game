#!/usr/bin/env python3
"""GAME-304 · аркуш assets/tiles/home_storage.png — контейнери дому: комора, холодильник, скринька Мії.

    python3 scripts/assets/build_home_storage.py [--check]

Аркуш 128×96 (4 колонки × 3 рядки тайлів 32 px). Предмети ставляться низом до нижньої межі своєї колонки (стоять на підлозі):
  колонка 0 — комора: висока шафа з чотирма дверцятами з LPC Base Object Kit (Storage/Cabinets.png, Lanea Zimmerman; перефарбування — Eliza Wyatt), 32×69, без змін;
  колонка 1 — холодильник 22×52: намальований програмно (PIL, палітра LPC) — у наборах LPC сучасного стилю його немає (PR #65 прибрав чужий). Біло-сталева шафа з морозилкою
              зверху, двома вертикальними ручками й магнітами; світло зліва згори, контур і тінь основи;
  колонка 2, рядок 2 — скринька Мії: мала замкнена скриня з того ж набору (Storage/Chests.png, 28×27), без змін.
Усі пікселі проходять scripts/palette/quantize.py (519 кольорів основи). Масштаб 28 px/м (OD-026): холодильник 0,8×1,85 м, комора 1,1×2,4 м, скринька 1,0×0,95 м — рядки в art/world-scale.json.
"""
import os
import sys
import tempfile

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'palette'))
from check import load_palette  # noqa: E402
from quantize import quantize  # noqa: E402

KIT = os.path.join(ROOT, 'research/packs/pack-lpc-base-object-kit/pack/Objects/Storage')
DST = os.path.join(ROOT, 'assets/tiles/home_storage.png')
OUTLINE = (52, 56, 72)
STEEL = (118, 126, 140)
BODY, BODY_HI, BODY_LO, BODY_DK = (226, 229, 228), (246, 246, 242), (190, 197, 202), (160, 168, 178)


def fridge():
    im = Image.new('RGBA', (32, 96), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    top, bot = 44, 96                                   # 52 px ≈ 1,85 м, ширина 22 px ≈ 0,8 м (OD-026)
    d.rectangle((5, top, 26, bot - 1), fill=BODY, outline=OUTLINE)
    d.rectangle((6, top + 1, 25, top + 3), fill=BODY_HI)             # верхня грань: світла смужка
    d.line((6, top + 4, 25, top + 4), fill=BODY_LO)
    d.line((6, top + 5, 6, bot - 4), fill=BODY_HI)                   # світло зліва
    d.line((25, top + 5, 25, bot - 4), fill=BODY_LO)                 # тінь справа
    d.line((6, bot - 3, 25, bot - 3), fill=BODY_LO)                  # цоколь
    d.line((6, bot - 2, 25, bot - 2), fill=BODY_DK)
    seam = top + 17                                                  # морозилка зверху, холодильна камера знизу
    d.line((6, seam, 25, seam), fill=OUTLINE)
    d.line((7, seam + 1, 24, seam + 1), fill=BODY_HI)
    for y0, y1 in ((top + 7, top + 13), (seam + 5, seam + 16)):      # вертикальні ручки справа
        d.rectangle((22, y0, 23, y1), fill=STEEL, outline=OUTLINE)
        d.point((22, y0 + 1), fill=BODY_HI)
    for x, y, c in ((8, seam + 6, (200, 70, 60)), (11, seam + 9, (236, 196, 70)), (8, seam + 12, (90, 150, 205))):   # магніти й аркуш
        d.rectangle((x, y, x + 1, y + 1), fill=c, outline=OUTLINE)
    d.rectangle((12, seam + 4, 16, seam + 8), fill=(244, 238, 214), outline=OUTLINE)
    d.line((13, seam + 6, 15, seam + 6), fill=(120, 110, 100))
    return im


def build():
    sheet = Image.new('RGBA', (128, 96), (0, 0, 0, 0))
    cab = Image.open(os.path.join(KIT, 'Cabinets.png')).convert('RGBA').crop((32, 5, 64, 74))       # 4-дверна висока шафа
    sheet.paste(cab, (0, 96 - cab.height))
    sheet.paste(fridge(), (32, 0))
    chest = Image.open(os.path.join(KIT, 'Chests.png')).convert('RGBA').crop((66, 0, 94, 27))        # мала замкнена скриня
    sheet.paste(chest, (64 + 2, 64 + 32 - chest.height))
    return sheet


def main(argv):
    with tempfile.TemporaryDirectory() as wd:
        raw, dst = os.path.join(wd, 'raw.png'), os.path.join(wd, 'out.png')
        build().save(raw)
        quantize(raw, dst, load_palette(os.path.join(ROOT, 'art/palette/lpc.json'))[1])
        if '--check' in argv:
            same = os.path.exists(DST) and open(DST, 'rb').read() == open(dst, 'rb').read()
            print('home_storage.png: ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ'))
            return 0 if same else 1
        open(DST, 'wb').write(open(dst, 'rb').read())
        print('записано', DST)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
