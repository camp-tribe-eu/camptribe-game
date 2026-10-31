#!/usr/bin/env python3
"""GAME-222 · «лінійка»: усі предмети з art/world-scale.json поруч із дорослим LPC, 1:1, за справжньою шириною.

    python3 scripts/art/lineup.py [--branch main] [--out research/visual-audit/lineup-main.png] [--override шлях=файл ...]

Предмет, що не пройшов масштаб/ізометрію, підписано червоним. Файл відсутній на цій гілці — предмет пропущено (WARN).
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_world as cw  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--branch', default='main')
    ap.add_argument('--out')
    ap.add_argument('--override', action='append')
    a = ap.parse_args()
    out = a.out or os.path.join(cw.ROOT, f'research/visual-audit/lineup-{a.branch}.png')
    d = cw.load_entries()
    errors, warns, rows = cw.evaluate(d['entries'], cw.make_loader(cw.parse_overrides(a.override)), d['px_per_m'], d['tolerance'])
    bad = {m.split(':')[0].split(' ')[0] for c, m in errors if c in ('WORLD_SCALE', 'WORLD_ISO')}
    loader = cw.make_loader(cw.parse_overrides(a.override))
    items = []
    adult = cw.adult_frame()
    ab = adult.getbbox()
    items.append(('дорослий 1,7 м', adult.crop(ab), 1.7, False, f"{ab[3] - ab[1]} px"))
    for r in sorted(rows, key=lambda r: r['real_w']):
        e = r['entry']
        x, y, w, h = e['crop']
        im = loader(e['file']).crop((x, y, x + w, y + h))
        px = im.load()
        for yy in range(im.height):
            for xx in range(im.width):
                if not cw.opaque(px[xx, yy]):
                    px[xx, yy] = (0, 0, 0, 0)
        im = im.crop(im.getbbox())
        items.append((f"{e['id']} {e['real_width_m']}м", im, e['real_width_m'], e['id'] in bad, f"{r['w']}px {r['pxm']:.0f}px/м"))
    items[1:] = sorted(items[1:], key=lambda t: t[2])
    font = ImageFont.load_default()
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf', '/Library/Fonts/Arial.ttf'):
        if os.path.isfile(f):
            font = ImageFont.truetype(f, 9)   # кирилиця; без неї лишається шрифт за замовчуванням
            break
    pad, lab = 14, 34
    W = sum(max(it[1].width, 96) + pad for it in items) + pad
    H = max(it[1].height for it in items) + lab + 40
    sheet = Image.new('RGBA', (max(W, 200), H), (96, 148, 72, 255))
    dr = ImageDraw.Draw(sheet)
    ground = H - lab - 6
    x = pad
    for name, im, _, isbad, info in items:
        cell = max(im.width, 96)
        sheet.alpha_composite(im, (x + (cell - im.width) // 2, ground - im.height))
        col = (255, 60, 60, 255) if isbad else (255, 255, 255, 255)
        dr.text((x, ground + 4), name, fill=col, font=font)
        dr.text((x, ground + 16), info + (' НЕ ТАК' if isbad else ''), fill=col, font=font)
        x += cell + pad
    dr.line((0, ground, sheet.width, ground), fill=(60, 100, 50, 255))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out)
    print(f'{out}: {sheet.width}×{sheet.height}, предметів {len(items) - 1}, пропущено {len(warns)}, не так {len(bad)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
