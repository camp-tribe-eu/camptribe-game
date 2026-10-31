#!/usr/bin/env python3
"""GAME-204 · аркуші для крамниці туристичного спорядження (замість домашньої книжкової полиці).

    python3 scripts/assets/build_shop_outdoor.py [--check]

Три аркуші, бо сторож ліцензій тримає «файл → рівно один рядок реєстру → одна ліцензія» (закон 5 не дозволяє змішати піксели
різних наборів в одному файлі): assets/tiles/shop_woodshop.png (OGA-BY 3.0), shop_tailor.png (CC-BY 3.0), shop_decor.png
(CC-BY-SA 3.0). Кожна вирізка обрізається до видимих пікселів і ставиться в клітинку(и) 32 px: по центру, низом до низу —
тож предмет стоїть на лінії підлоги. Далі — бектик quantize.py на палітру основи (як ART-013/ART-015).
Намет із decorations-medieval (126×155) зменшено вдвічі (BOX) до ~63×78, щоб бути більшим за людину лише зверху.
--check — лише перевірити, що файли в репозиторії збігаються зі збіркою байт у байт.
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

T = 32
PACK = os.path.join(ROOT, 'research/packs')
OUT = os.path.join(ROOT, 'assets/tiles')
WOOD = 'pack-lpc-woodshop/pack/lpc-woodshop/woodshop.png'
TAIL = 'pack-lpc-tailor/pack/lpc-tailor/tailor.png'
DECO = 'pack-lpc-village-decor/pack/decoration_medieval/decorations-medieval.png'

# (джерело, (x0,y0,x1,y1) у px першоджерела, (col,row,w_tiles,h_tiles) у аркуші, масштаб)
SHEETS = {
    'shop_woodshop.png': ((8, 3), [
        (WOOD, (96, 0, 192, 64), (0, 0, 3, 2), 1),          # довгий верстак → каса-прилавок
        (WOOD, (0, 224, 64, 256), (0, 2, 2, 1), 1),         # три настінні панелі з інструментом (мультитул, ножі, пили)
        (WOOD, (64, 224, 128, 256), (2, 2, 2, 1), 1),
        (WOOD, (128, 224, 224, 256), (4, 2, 3, 1), 1),      # третя панель — 96 px, 3 тайли
    ]),
    'shop_tailor.png': ((10, 2), [
        (TAIL, (0, 320, 64, 384), (0, 0, 2, 2), 1),         # три вішаки з одягом
        (TAIL, (64, 320, 128, 384), (2, 0, 2, 2), 1),
        (TAIL, (192, 320, 256, 384), (4, 0, 2, 2), 1),
        (TAIL, (192, 256, 224, 320), (6, 0, 1, 2), 1),      # чотири кошики зі згортками (дрібниці біля каси)
        (TAIL, (224, 256, 256, 320), (7, 0, 1, 2), 1),
        (TAIL, (256, 256, 288, 320), (8, 0, 1, 2), 1),
        (TAIL, (288, 256, 320, 320), (9, 0, 1, 2), 1),
    ]),
    'shop_decor.png': ((8, 3), [
        (DECO, (384, 1728, 512, 1888), (0, 0, 2, 3), 0.5),  # намет, ×0.5
        (DECO, (416, 64, 448, 96), (2, 0, 1, 1), 1),        # три ліхтарі
        (DECO, (448, 64, 480, 96), (3, 0, 1, 1), 1),
        (DECO, (480, 64, 512, 96), (4, 0, 1, 1), 1),
        (DECO, (352, 656, 384, 688), (2, 1, 1, 1), 1),      # дві купи дров (пакет у кемпінг)
        (DECO, (384, 672, 416, 704), (3, 1, 1, 1), 1),
        (DECO, (352, 768, 416, 800), (4, 2, 2, 1), 1),      # ящик
        (DECO, (256, 0, 288, 32), (5, 0, 1, 1), 1),         # вивіски: каструля (кухня), торба (рюкзаки), інструмент
        (DECO, (320, 0, 352, 32), (6, 0, 1, 1), 1),
        (DECO, (320, 32, 352, 64), (7, 0, 1, 1), 1),
    ]),
}


def trim(im):
    a = im.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    return im.crop(a.getbbox())


def largest_blob(im):
    """Лишає найбільшу зв'язну пляму (8 сусідів): вирізка намету зачепила кілька пікселів сусіднього."""
    w, h = im.size
    px = im.load()
    seen, best = set(), []
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0][3] < 128 or (x0, y0) in seen:
                continue
            comp, stack = [], [(x0, y0)]
            seen.add((x0, y0))
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        n = (x + dx, y + dy)
                        if 0 <= n[0] < w and 0 <= n[1] < h and n not in seen and px[n][3] >= 128:
                            seen.add(n)
                            stack.append(n)
            if len(comp) > len(best):
                best = comp
    out = Image.new('RGBA', im.size)
    for x, y in best:
        out.putpixel((x, y), px[x, y])
    return out


def compose(size, parts):
    sheet = Image.new('RGBA', (size[0] * T, size[1] * T))
    for src, box, (c, r, w, h), scale in parts:
        spr = Image.open(os.path.join(PACK, src)).convert('RGBA').crop(box)
        if scale != 1:
            spr = largest_blob(spr)
        spr = trim(spr)
        if scale != 1:
            spr = spr.resize((round(spr.width * scale), round(spr.height * scale)), Image.BOX)
        if spr.width > w * T or spr.height > h * T:
            raise SystemExit(f'{src} {box}: {spr.size} не лізе в {w}x{h} тайлів')
        x = c * T + (w * T - spr.width) // 2
        y = (r + h) * T - spr.height
        sheet.alpha_composite(spr, (x, y))
    return sheet


def build(workdir):
    _, palette = load_palette(os.path.join(ROOT, 'art/palette/lpc.json'))
    out = {}
    for name, (size, parts) in SHEETS.items():
        raw = os.path.join(workdir, 'raw_' + name)
        compose((size[0], size[1]), parts).save(raw)
        dst = os.path.join(workdir, name)
        quantize(raw, dst, palette)
        out[name] = dst
    return out


def main(argv):
    with tempfile.TemporaryDirectory() as wd:
        built = build(wd)
        bad = False
        for name, path in built.items():
            target = os.path.join(OUT, name)
            if '--check' in argv:
                same = os.path.exists(target) and open(target, 'rb').read() == open(path, 'rb').read()
                print(f'{name}: ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ'))
                bad = bad or not same
            else:
                open(target, 'wb').write(open(path, 'rb').read())
                print('записано', target)
        return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
