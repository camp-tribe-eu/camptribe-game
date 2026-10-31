#!/usr/bin/env python3
"""GAME-204 (ч.3) · аркуш assets/tiles/shop_decor.png — задня стіна крамниці без «шести однакових панелей».

    python3 scripts/assets/build_shop_decor.py [--check]

Панелі 64×64 (2×2 тайли, як `backpack-wall` в assets/tiles/shop_gear.png, 2,2 м):
  0-2  рюкзаки: та сама панель, але кожен рюкзак перефарбовано в інший відтінок (маска — піксель, що відрізняється від дощатої стіни за рядками);
  3    дошка оголошень (пробка, три папірці, піктограма намету) + червона табличка «−20 %» — ЛИШЕ піктограми й цифри, жодного тексту;
  4    два постери 0,6×0,8 м: карта стежок і намет під небом.
Постери й дошку намальовано програмно (PIL, палітра LPC): ШІ не потрібен, чужих логотипів немає. Масштаб 28 px/м (OD-026), передня грань до екрана,
світло зліва згори (тінь — вправо-вниз на 1 px). Квантування — scripts/palette/quantize.py.
"""
import colorsys
import os
import sys
import tempfile

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'palette'))
from check import load_palette  # noqa: E402
from quantize import quantize  # noqa: E402

SRC = os.path.join(ROOT, 'assets/tiles/shop_gear.png')
DST = os.path.join(ROOT, 'assets/tiles/shop_decor.png')
PANEL = (96, 0, 160, 64)          # backpack-wall у shop_gear (колонка 3, рядок 0, 2×2)
OUTLINE, SHADOW = (73, 52, 44), (60, 40, 36)
# цільові відтінки (°) рюкзаків у чвертях: верх-ліво, верх-право, низ-ліво, низ-право; оригінал — 28, 205, 100, 340
HUES = [[0, 50, 270, 175], [175, 28, 215, 100], [330, 130, 45, 215]]


def wall_bg(p):
    """Дощата стіна без рюкзаків: кожен рядок пікселів — медіана крайніх колонок 2–5 (дошки горизонтальні)."""
    bg = p.copy()
    px = p.load()
    for y in range(14, 62):
        cols = sorted((px[x, y] for x in (2, 3, 4, 5)), key=lambda c: sum(c[:3]))
        c = cols[len(cols) // 2]
        for x in range(5, 59):
            bg.putpixel((x, y), c)
    return bg


def recolour(p, bg, hues):
    out = p.copy()
    a, b = p.load(), bg.load()
    for y in range(14, 62):
        for x in range(5, 59):
            if sum(abs(a[x, y][i] - b[x, y][i]) for i in range(3)) < 75:
                continue
            h = hues[(0 if y < 38 else 2) + (0 if x < 32 else 1)] / 360
            r, g, bl = (v / 255 for v in a[x, y][:3])
            _, s, v = colorsys.rgb_to_hsv(r, g, bl)
            out.putpixel((x, y), tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h, s, v)) + (255,))
    return out


def rect(d, box, fill, outline=OUTLINE):
    x0, y0, x1, y1 = box
    d.rectangle((x0 + 1, y0 + 1, x1 + 1, y1 + 1), fill=SHADOW)
    d.rectangle(box, fill=fill, outline=outline)


FONT = {'2': '111001111100111', '0': '111101101101111', '%': '101001010100101', '-': '000000111000000'}


def text(d, x, y, s, col):
    for ch in s:
        for i, bit in enumerate(FONT[ch]):
            if bit == '1':
                d.point((x + i % 3, y + i // 3), fill=col)
        x += 4


def map_poster(d, x, y):                                  # 17×22 ≈ 0,6×0,8 м
    rect(d, (x, y, x + 16, y + 21), (236, 224, 190))
    d.rectangle((x + 2, y + 9, x + 14, y + 19), fill=(110, 160, 90))
    d.ellipse((x + 8, y + 12, x + 13, y + 16), fill=(95, 150, 200))
    d.polygon([(x + 3, y + 9), (x + 6, y + 4), (x + 9, y + 9)], fill=(120, 110, 100), outline=OUTLINE)
    d.polygon([(x + 7, y + 9), (x + 11, y + 5), (x + 14, y + 9)], fill=(150, 140, 125), outline=OUTLINE)
    for pt in [(3, 18), (5, 16), (6, 14), (8, 13), (7, 11)]:   # пунктир стежки
        d.point((x + pt[0], y + pt[1]), fill=(190, 60, 50))
    d.rectangle((x + 7, y + 1, x + 9, y + 2), fill=(190, 60, 50))   # кнопка-шпилька вгорі
    d.point((x + 3, y + 2), fill=OUTLINE); d.point((x + 12, y + 2), fill=OUTLINE)   # заголовок-риски


def tent_poster(d, x, y):
    rect(d, (x, y, x + 16, y + 21), (240, 240, 235))
    d.rectangle((x + 1, y + 1, x + 15, y + 20), fill=(120, 180, 225))
    d.ellipse((x + 10, y + 3, x + 13, y + 6), fill=(240, 210, 90))
    d.polygon([(x + 1, y + 20), (x + 1, y + 13), (x + 6, y + 10), (x + 11, y + 16), (x + 15, y + 12), (x + 15, y + 20)], fill=(70, 120, 80))
    d.polygon([(x + 5, y + 20), (x + 9, y + 12), (x + 13, y + 20)], fill=(215, 110, 50), outline=OUTLINE)
    d.polygon([(x + 8, y + 20), (x + 9, y + 16), (x + 10, y + 20)], fill=OUTLINE)
    d.rectangle((x + 7, y + 1, x + 9, y + 2), fill=(190, 60, 50))


def notice_board(d, x, y):                                # 36×22 ≈ 1,3×0,8 м
    rect(d, (x, y, x + 35, y + 21), (110, 70, 40))
    d.rectangle((x + 2, y + 2, x + 33, y + 19), fill=(190, 140, 85))
    for i in range(14):                                   # зерно пробки
        d.point((x + 3 + (i * 7) % 30, y + 3 + (i * 5) % 16), fill=(160, 110, 65))
    for bx, by, w, h, col in ((x + 4, y + 4, 8, 10, (240, 240, 235)), (x + 15, y + 6, 8, 8, (240, 215, 110)), (x + 26, y + 4, 7, 11, (150, 195, 235))):
        d.rectangle((bx, by, bx + w - 1, by + h - 1), fill=col, outline=OUTLINE)
        d.point((bx + w // 2, by + 1), fill=(190, 60, 50))   # кнопка
    d.polygon([(x + 5, y + 12), (x + 8, y + 8), (x + 11, y + 12)], fill=(215, 110, 50))   # піктограма намету на білому папірці
    d.line((x + 17, y + 10, x + 21, y + 10), fill=OUTLINE); d.line((x + 17, y + 12, x + 20, y + 12), fill=OUTLINE)   # рядки «тексту» — риски
    d.line((x + 28, y + 8, x + 31, y + 8), fill=OUTLINE); d.line((x + 28, y + 10, x + 31, y + 10), fill=OUTLINE); d.line((x + 28, y + 12, x + 30, y + 12), fill=OUTLINE)


def sale_sign(d, x, y):                                   # 22×13 ≈ 0,8×0,46 м
    d.line((x + 4, y - 4, x + 4, y), fill=OUTLINE); d.line((x + 17, y - 4, x + 17, y), fill=OUTLINE)   # підвіс
    rect(d, (x, y, x + 21, y + 12), (200, 50, 45), outline=(240, 240, 235))
    text(d, x + 3, y + 4, '-20%', (240, 240, 235))


def build():
    src = Image.open(SRC).convert('RGBA').crop(PANEL)
    bg = wall_bg(src)
    sheet = Image.new('RGBA', (320, 64))
    for i, hues in enumerate(HUES):
        sheet.paste(recolour(src, bg, hues), (i * 64, 0))
    p = bg.copy(); d = ImageDraw.Draw(p)
    notice_board(d, 14, 17); sale_sign(d, 21, 46)
    sheet.paste(p, (3 * 64, 0))
    p = bg.copy(); d = ImageDraw.Draw(p)
    map_poster(d, 9, 20); tent_poster(d, 37, 20)
    sheet.paste(p, (4 * 64, 0))
    return sheet


def main(argv):
    with tempfile.TemporaryDirectory() as wd:
        raw, dst = os.path.join(wd, 'raw.png'), os.path.join(wd, 'out.png')
        build().save(raw)
        quantize(raw, dst, load_palette(os.path.join(ROOT, 'art/palette/lpc.json'))[1])
        if '--check' in argv:
            same = os.path.exists(DST) and open(DST, 'rb').read() == open(dst, 'rb').read()
            print('shop_decor.png: ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ'))
            return 0 if same else 1
        open(DST, 'wb').write(open(dst, 'rb').read())
        print('записано', DST)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
