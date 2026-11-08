#!/usr/bin/env python3
"""GAME-263 · атлас assets/icons/item_icons.png — іконки речей 32×32 (показ у рюкзаку 2× = 64 px, у картці «взято» теж 2×) + src/content/item-icon-atlas.json.

    python3 scripts/assets/build_item_icons.py [--check]

Джерела (ART-033):
  * berries, pine-cone — вирізані 1:1 з LPC Foods (fruits-veggies.png, bluecarrot16 та ін., CC-BY-SA 3.0), research/packs/pack-lpc-food/; змін немає, лише обрізка клітинки;
  * firewood — купка колод з LPC Woodshop (CC-BY-SA 3.0), research/packs/pack-lpc-woodshop/; лише обрізка;
  * tent, bag, lantern, documents, wallet, phone, first-aid, clothes — у вільних наборах немає (LPC: «намет у стилі LPC — не знайдено», решти нема):
    fal-ai/flux-pro/kontext за референсом home_furniture.png (art/requests/item-icons-1.json → art/out/item-icons-1/), ключ пурпурового, обрізка, BOX-зменшення до 28 px,
    квантування на палітру основи (scripts/palette/quantize.py).
"""
import json
import os
import sys
import tempfile

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'assets'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'palette'))
from build_shop_gear import decontaminate, drop_small, key_out  # noqa: E402
from check import load_palette  # noqa: E402
from quantize import quantize  # noqa: E402

C = 32
BOX = 28
FOOD = os.path.join(ROOT, 'research/packs/pack-lpc-food/pack/lpc-food-v2/fruits-veggies.png')
WOOD = os.path.join(ROOT, 'research/packs/pack-lpc-woodshop/pack/lpc-woodshop/woodshop.png')
FAL = os.path.join(ROOT, 'art/out/item-icons-1')
DST = os.path.join(ROOT, 'assets/icons/item_icons.png')
JSON_DST = os.path.join(ROOT, 'src/content/item-icon-atlas.json')
# (ключ, джерело): ('lpc', файл, x, y) — клітинка 32×32 як є; ('fal', файл без розширення)
ITEMS = [
    ('tent', ('fal', 'tent_0')), ('bag', ('fal', 'bag_0')), ('lantern', ('fal', 'lantern_1')), ('firewood', ('lpc', WOOD, 448, 336)),
    ('pine-cone', ('lpc', FOOD, 544, 1152)), ('berries', ('lpc', FOOD, 224, 1152)), ('documents', ('fal', 'documents_1')), ('wallet', ('fal', 'wallet_0')),
    ('phone', ('fal', 'phone_0')), ('first-aid', ('fal', 'firstaid_0')), ('clothes', ('fal', 'clothes_1')),
]


def fal_cell(name):
    im = drop_small(decontaminate(key_out(Image.open(os.path.join(FAL, f'{name}.webp')))))
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v >= 128 else 0).getbbox())
    k = BOX / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)
    cell = Image.new('RGBA', (C, C))
    cell.paste(im, ((C - im.width) // 2, C - 2 - im.height))   # низом до низу клітинки
    return cell


def lpc_cell(path, x, y):
    cell = Image.open(path).convert('RGBA').crop((x, y, x + C, y + C))
    box = cell.getchannel('A').getbbox()
    out = Image.new('RGBA', (C, C))
    out.paste(cell.crop(box), ((C - (box[2] - box[0])) // 2, C - 2 - (box[3] - box[1])))
    return out


def build():
    sheet = Image.new('RGBA', (C * len(ITEMS), C))
    for i, (key, src) in enumerate(ITEMS):
        sheet.alpha_composite(fal_cell(src[1]) if src[0] == 'fal' else lpc_cell(*src[1:]), (i * C, 0))
    with tempfile.TemporaryDirectory() as t:
        a, b = os.path.join(t, 'a.png'), os.path.join(t, 'b.png')
        sheet.save(a)
        quantize(a, b, load_palette(os.path.join(ROOT, 'art/palette/lpc.json'))[1])
        return Image.open(b).convert('RGBA')


def main(argv):
    sheet = build()
    meta = json.dumps({'size': C, 'cols': len(ITEMS), 'cells': {k: i for i, (k, _) in enumerate(ITEMS)}}, indent=1) + '\n'
    if '--check' in argv:
        ok = os.path.exists(DST) and Image.open(DST).convert('RGBA').tobytes() == sheet.tobytes() and open(JSON_DST).read() == meta
        print('item_icons.png: ' + ('збігається' if ok else 'ВІДРІЗНЯЄТЬСЯ від генератора'))
        return 0 if ok else 1
    sheet.save(DST, optimize=True)
    open(JSON_DST, 'w').write(meta)
    print(DST, sheet.size)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
