#!/usr/bin/env python3
"""GAME-222 / OD-026 · сторож «світ правдивий»: масштаб, порядок розмірів і перспектива не-LPC предметів.

    python3 scripts/art/check_world.py                 # перевірка art/world-scale.json
    python3 scripts/art/check_world.py --self-test     # синтетичні картинки: кожен код має спрацювати
    python3 scripts/art/check_world.py --mutate        # вимикає кожну перевірку по черзі: self-test МУСИТЬ упасти
    python3 scripts/art/check_world.py --override assets/tiles/camp_props.png=/шлях/до/файла.png   # чужа гілка

Коди: WORLD_SCALE (px/м поза 28 ±25 %), WORLD_ORDER (більший у житті — менший на екрані), WORLD_ISO (низ силуету похилий — ізометрія),
WORLD_MISSING_ENTRY (PNG у assets/tiles/ без рядка в JSON і не з білого списку LPC), WORLD_CALIB (дорослий LPC не ≈1,7 м).
Файл відсутній на цій гілці — лише WARN (предмети з інших гілок); але якщо не виміряно жодного предмета — помилка (закон 4).

ORTHO: для стовпців центральних 80 % габариту беремо найнижчий непрозорий піксель, МНК-нахил |dy/dx| ≤ 0,12. Рівний низ (LPC 3/4,
передня грань до екрана) дає ≈0 (колеса й тіні — кілька пікселів шуму); ізометричний ромб — ≈0,5. Поріг 0,12 лишає запас ×4 до ізометрії
і не ловить дрібні нерівності. Вузькі (<24 px) пропускаємо: на 20 px нахил не відрізнити від шуму.
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('WORLD_ROOT') or os.path.dirname(os.path.dirname(HERE))
JSON_PATH = os.path.join(ROOT, 'art/world-scale.json')

ORDER_RATIO = 1.15
SLOPE_MAX = 0.25   # ізометрія ≈ 0,5; складені предмети (стійка + тумба, полиця з балонами) дають до ±0,2 — рецензія PR #136
MIN_ISO_W = 48     # стовпчики й ліхтарі на круглій ніжці вужчі: їхній нерівний низ — не ізометрія
CENTRAL = 0.8
ENABLED = {'scale': True, 'order': True, 'iso': True, 'vee': True, 'missing': True, 'calib': True, 'measure': True, 'thin': True}   # --mutate чіпає саме ці місця


def opaque(px):
    """Непрозорий і не чисто-пурпуровий (ключ фону FAL)."""
    return px[3] > 0 and not (px[0] >= 250 and px[1] <= 5 and px[2] >= 250)


def measure(im, crop):
    """-> (bbox (x0,y0,x1,y1) у координатах кропу, w, h, список «низів» по стовпцях {x: y_max}) або None."""
    x, y, w, h = crop
    c = im.convert('RGBA').crop((x, y, x + w, y + h))
    px = c.load()
    cols = {}
    top = 10 ** 9
    for xx in range(c.width):
        for yy in range(c.height - 1, -1, -1):
            if opaque(px[xx, yy]):
                cols[xx] = yy
                break
        for yy in range(c.height):
            if opaque(px[xx, yy]):
                top = min(top, yy)
                break
    if not cols:
        return None
    x0, x1 = min(cols), max(cols) + 1
    y1 = max(cols.values()) + 1
    return (x0, top, x1, y1), x1 - x0, y1 - top, cols


def bottom_slope(cols, x0, x1):
    """МНК-нахил низу по центральним 80 % ширини."""
    w = x1 - x0
    lo, hi = x0 + w * (1 - CENTRAL) / 2, x1 - w * (1 - CENTRAL) / 2
    pts = [(x, y) for x, y in cols.items() if lo <= x < hi]
    if len(pts) < 3:
        return 0.0
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    den = sum((p[0] - mx) ** 2 for p in pts)
    return sum((p[0] - mx) * (p[1] - my) for p in pts) / den if den else 0.0


HALF_MAX = 0.2   # «V»-низ ізометрії: ліва й права половини низу похилі в різні боки, загальний нахил ≈ 0 (санблок GAME-205)


R2_MIN = 0.9   # «V» ізометрії — прямі ребра; кущ, крона, валун — криві (R² нижче), рецензія PR #136


def _fit(pts):
    """МНК: (нахил, R²) для точок [(x, y)]."""
    n = len(pts)
    if n < 3:
        return 0.0, 0.0
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    sxx = sum((p[0] - mx) ** 2 for p in pts)
    syy = sum((p[1] - my) ** 2 for p in pts)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    if not sxx or not syy:
        return 0.0, 0.0
    return sxy / sxx, sxy * sxy / (sxx * syy)


def v_bottom(cols, x0, x1):
    """Нахил і R² низу лівої й правої половини (крайні 10 % відкинуто); ізометричний кут — дві прямі +s і −s."""
    w = x1 - x0
    mid = (x0 + x1) / 2
    lo, hi = x0 + w * 0.1, x1 - w * 0.1
    left = [(x, y) for x, y in cols.items() if lo <= x < mid]
    right = [(x, y) for x, y in cols.items() if mid <= x < hi]
    return _fit(left), _fit(right)


def evaluate(entries, loader, px_per_m=28, tol=0.25):
    """-> (errors [(code, msg)], warns [msg], rows [dict])."""
    errors, warns, rows = [], [], []
    lo, hi = px_per_m * (1 - tol), px_per_m * (1 + tol)
    for e in entries:
        im = loader(e['file'])
        if im is None:
            warns.append(f"WARN {e['id']}: файлу {e['file']} немає на цій гілці — пропущено (NOT RUN для цього предмета)")
            continue
        m = measure(im, e['crop'])
        if m is None:
            errors.append(('WORLD_SCALE', f"{e['id']}: у кропі {e['crop']} немає жодного видимого пікселя — кроп хибний (порожній ≠ зелений)"))
            continue
        bb, w, h, cols = m
        by_h = ENABLED['measure'] and e.get('measure') == 'height'   # тонкий предмет (ліхтар, стовпчик): силует ширший за тіло — міряємо висоту
        pxm = h / e['real_height_m'] if by_h else w / e['real_width_m']
        if by_h and ENABLED['thin']:
            # рецензія PR #135: «за висотою» — не втеча від ширини. Лише справді тонкий предмет (ширина ≤ ½ висоти),
            # і силует не ширший за 3× тіла (голова ліхтаря, кран) — інакше це завеликий предмет під чужою позначкою.
            if e['real_width_m'] > 0.5 * e['real_height_m']:
                errors.append(('WORLD_SCALE', f"{e['id']}: measure: height лише для тонких (ширина ≤ ½ висоти), а тут {e['real_width_m']}×{e['real_height_m']} м"))
            elif w > 3 * hi * e['real_width_m']:
                errors.append(('WORLD_SCALE', f"{e['id']}: тонкий предмет завширшки {w} px — понад 3× тіла ({3 * hi * e['real_width_m']:.0f} px при {e['real_width_m']} м)"))
        slope = bottom_slope(cols, bb[0], bb[2])
        rows.append(dict(id=e['id'], w=w, h=h, pxm=pxm, pxm_h=h / e['real_height_m'], slope=slope, real_w=e['real_width_m'], entry=e, by_h=by_h))
        if ENABLED['scale'] and not (lo <= pxm <= hi):
            dim, m, px = ('висота', e['real_height_m'], h) if by_h else ('ширина', e['real_width_m'], w)
            want = round(m * px_per_m)
            errors.append(('WORLD_SCALE', f"{e['id']}: {dim} {px} px при {m} м = {pxm:.1f} px/м, треба {lo:.0f}–{hi:.0f} "
                           f"(≈{want} px). Спрайт {'завеликий' if pxm > hi else 'замалий'} у {max(pxm, px_per_m) / min(pxm, px_per_m):.2f} раза"))
        (sl, rl), (sr, rr) = v_bottom(cols, bb[0], bb[2])
        if ENABLED['vee'] and w >= MIN_ISO_W and HALF_MAX < sl < 1.5 and -1.5 < sr < -HALF_MAX and min(rl, rr) >= R2_MIN:   # «V» (низ униз до середини); стовп на ніжці дає >1,5, «Λ» шлагбаума — інший знак
            errors.append(('WORLD_ISO', f"{e['id']}: низ силуету — «V» (ліва половина {sl:+.2f}, права {sr:+.2f}, межа ±{HALF_MAX}) — кут будівлі "
                           f"до глядача, ізометрія; у грі фасад рівно до екрана"))
        if ENABLED['iso'] and w >= MIN_ISO_W and abs(slope) > SLOPE_MAX:
            errors.append(('WORLD_ISO', f"{e['id']}: низ силуету похилий (нахил {slope:+.2f}, межа ±{SLOPE_MAX}) — ізометрія/перспектива, "
                           f"а в грі лише LPC 3/4 ортогонально (передня грань рівно до екрана)"))
    if ENABLED['order']:
        wide = [r for r in rows if not r['by_h']]   # порядок — за шириною; тонкі (за висотою) не порівнюємо
        for a in wide:
            bad = [b for b in wide if a['real_w'] > ORDER_RATIO * b['real_w'] and a['w'] < b['w']]   # рівна ширина — не порушення: тайлова сітка (32 px) не розрізняє 1,0 і 1,2 м
            if bad:
                errors.append(('WORLD_ORDER', f"{a['id']} ({a['real_w']} м) на екрані {a['w']} px, а менші в житті не менші на екрані: "
                               + ', '.join(f"{b['id']} ({b['real_w']} м) = {b['w']} px" for b in sorted(bad, key=lambda b: -b['w'])[:4])
                               + (f" … і ще {len(bad) - 4}" if len(bad) > 4 else '') + " — більше в житті має бути більшим і на екрані"))
    return errors, warns, rows


def check_missing(entries, lpc, files):
    """Кожен PNG з files (шляхи від кореня), не з білого списку, має ≥1 рядок."""
    if not ENABLED['missing']:
        return []
    have = {e['file'] for e in entries} | set(lpc)
    return [('WORLD_MISSING_ENTRY', f"{f}: PNG не з білого списку LPC і без жодного рядка в art/world-scale.json — додай справжні метри "
             f"(або, якщо це оригінал LPC, внеси в lpc_sheets)") for f in sorted(files) if f not in have]


def check_calib(height_px, px_per_m=28, tol=0.25, adult_m=1.7):
    if not ENABLED['calib']:
        return []
    v = height_px / adult_m
    if not (px_per_m * (1 - tol) <= v <= px_per_m * (1 + tol)):
        return [('WORLD_CALIB', f"дорослий LPC {height_px} px / {adult_m} м = {v:.1f} px/м — поза {px_per_m * (1 - tol):.0f}–{px_per_m * (1 + tol):.0f}: "
                 f"калібрування масштабу зламане")]
    return []


CHAR_LAYERS = ['body/bodies/male', 'feet/shoes/basic/male', 'legs/pants/male', 'torso/clothes/longsleeve/longsleeve/male',
               'head/heads/human/male', 'hair/plain/adult']


def adult_frame(root=None):
    """Дорослий LPC: body+feet+legs+torso+head+hair, walk-вниз, кадр 0 (рядок 2, 64×64)."""
    root = root or ROOT
    out = Image.new('RGBA', (64, 64))
    for p in CHAR_LAYERS:
        sheet = Image.open(os.path.join(root, 'assets/characters', p, 'walk.png')).convert('RGBA')
        out.alpha_composite(sheet.crop((0, 128, 64, 192)))
    return out


def load_entries(path=None):
    with open(path or JSON_PATH, encoding='utf-8') as f:
        return json.load(f)


def make_loader(overrides, root=None):
    root = root or ROOT

    def loader(rel):
        p = overrides.get(rel) or os.path.join(root, rel)
        return Image.open(p).convert('RGBA') if os.path.isfile(p) else None
    return loader


def run_real(overrides):
    d = load_entries()
    px_per_m, tol = d['px_per_m'], d['tolerance']
    errors, warns, rows = evaluate(d['entries'], make_loader(overrides), px_per_m, tol)
    tiles = [os.path.relpath(p, ROOT).replace(os.sep, '/') for p in glob.glob(os.path.join(ROOT, 'assets/tiles/**/*.png'), recursive=True)]
    errors += check_missing(d['entries'], d['lpc_sheets'], tiles)
    ch = measure(adult_frame(), [0, 0, 64, 64])
    if ch is None:
        errors.append(('WORLD_CALIB', 'кадр дорослого LPC порожній — шари персонажа не знайдено'))
    else:
        print(f"КАЛІБРУВАННЯ: дорослий LPC (body+feet+legs+torso+head+hair, walk-вниз кадр 0) = {ch[2]} px заввишки, {ch[2] / d['adult_height_m']:.1f} px/м "
              f"(при {d['adult_height_m']} м; ціль {px_per_m} ±{int(tol * 100)} %)")
        errors += check_calib(ch[2], px_per_m, tol, d['adult_height_m'])
    print(f"{'id':22} {'w':>4} {'h':>4} {'px/m(w)':>8} {'px/m(h)':>8} {'нахил':>7}  файл")
    for r in sorted(rows, key=lambda r: r['real_w']):
        print(f"{r['id']:22} {r['w']:4d} {r['h']:4d} {r['pxm']:8.1f} {r['pxm_h']:8.1f} {r['slope']:+7.2f}  {r['entry']['file']}")
    for w in warns:
        print(w)
    if not rows:
        print('WORLD_SCALE: не виміряно жодного предмета — порожній результат це збій, а не зелене (закон 4)')
        return 1
    for code, msg in errors:
        print(f'{code}: {msg}')
    print(f"ПІДСУМОК: виміряно {len(rows)}, пропущено {len(warns)}, помилок {len(errors)} — {'PASS' if not errors else 'FAIL'}")
    return 1 if errors else 0


# ---------------------------------------------------------------- self-test

def box(w, h, color=(120, 90, 60, 255)):
    im = Image.new('RGBA', (w + 8, h + 8))
    for x in range(w):
        for y in range(h):
            im.putpixel((x + 4, y + 4), color)
    return im


def sheared(w, h, slope=0.5):
    """Паралелограм: низ і верх похилі (ізометрія)."""
    drop = int(w * slope)
    im = Image.new('RGBA', (w + 8, h + drop + 8))
    for x in range(w):
        off = int(x * slope)
        for y in range(h):
            im.putpixel((x + 4, y + off + 4), (120, 90, 60, 255))
    return im


def diamond(w, h, slope=0.5):
    """Ізометрична коробка кутом до глядача: низ «V» (з обох боків униз до середини)."""
    drop = int(w / 2 * slope)
    im = Image.new('RGBA', (w + 8, h + drop + 8))
    for x in range(w):
        off = int(min(x, w - 1 - x) * slope)
        for y in range(h):
            im.putpixel((x + 4, y + off + 4), (120, 90, 60, 255))
    return im


def ellipse(w, h):
    """Кущ: овал — низ круглий, не «V»."""
    from PIL import ImageDraw
    im = Image.new('RGBA', (w + 8, h + 8))
    ImageDraw.Draw(im).ellipse((4, 4, w + 3, h + 3), fill=(40, 120, 40, 255))
    return im


def tree(w, h):
    """Дерево: крона-овал + стовбур посередині."""
    from PIL import ImageDraw
    out = Image.new('RGBA', (w + 8, h + 8))
    out.alpha_composite(ellipse(w, int(h * 0.7)), (0, 0))
    ImageDraw.Draw(out).rectangle((w // 2 - 3, int(h * 0.6), w // 2 + 4, h + 3), fill=(90, 60, 30, 255))
    return out


def with_magenta(w, h):
    """Предмет у рамці з чисто-пурпурового фону (ключ FAL), що не став прозорим."""
    im = Image.new('RGBA', (w + 40, h + 40), (255, 0, 255, 255))
    im.alpha_composite(box(w, h), (16, 16))
    return im


def selftest():
    img = {'good': box(126, 42), 'good_small': box(14, 28), 'shear': sheared(126, 42), 'vee': diamond(126, 42), 'bush': ellipse(60, 36), 'post': box(14, 84), 'shortpost': box(14, 40), 'fatpost': box(126, 84), 'tree': tree(84, 110), 'big': box(250, 84), 'small': box(40, 14),
           'magenta': with_magenta(126, 42), 'tiny_ref': box(30, 20)}
    loader = lambda f: img.get(f)
    E = lambda i, f, w, h, crop=None: dict(id=i, file=f, crop=crop or [0, 0, img[f].width, img[f].height], real_width_m=w, real_height_m=h, view='front')
    bad = []

    def case(name, entries, want, extra=None):
        errs, warns, _ = evaluate(entries, loader)
        got = sorted({c for c, _ in errs})
        if extra:
            got = sorted(set(got) | {c for c, _ in extra})
        ok = got == sorted(want)
        print(f"  {'ok ' if ok else 'BAD'} {name}: очікували {sorted(want) or 'нічого'}, є {got or 'нічого'}")
        if not ok:
            bad.append(name)
        return errs, warns

    case('правильна коробка проходить', [E('car', 'good', 4.5, 1.5)], [])
    case('вузький стовпчик проходить (ISO пропущено <24 px)', [E('post', 'good_small', 0.5, 1.0)], [])
    case('ізометрична коробка → WORLD_ISO', [E('car', 'shear', 4.5, 1.5)], ['WORLD_ISO'])
    case('ізометрія кутом до глядача («V»-низ) → WORLD_ISO', [E('car', 'vee', 4.5, 1.5)], ['WORLD_ISO'])
    case('кущ (круглий низ) — не ізометрія', [E('bush', 'bush', 2.0, 1.2)], [])
    case('дерево (крона + стовбур) — не ізометрія', [E('tree', 'tree', 3.0, 4.0)], [])
    case('однакова ширина при 4,5 і 5,4 м — не порушення порядку', [E('a', 'good', 4.5, 1.5), E('b', 'good', 5.4, 1.5)], [])
    case('тонкий ліхтар за висотою (0,3×3 м, 14×84 px) проходить', [dict(E('lamp', 'post', 0.3, 3.0), measure='height')], [])
    case('ліхтар за висотою, але замалий (14×40 px на 3 м) → WORLD_SCALE', [dict(E('lamp', 'shortpost', 0.3, 3.0), measure='height')], ['WORLD_SCALE'])
    case('широке авто під позначкою «за висотою» → WORLD_SCALE', [dict(E('car', 'big', 4.5, 3.0), measure='height')], ['WORLD_SCALE'])
    case('тонкий, але силует уп\'ятеро ширший за тіло → WORLD_SCALE', [dict(E('lamp', 'fatpost', 0.3, 3.0), measure='height')], ['WORLD_SCALE'])
    case('завелика коробка → WORLD_SCALE', [E('car', 'big', 4.5, 1.5)], ['WORLD_SCALE'])
    case('замала коробка → WORLD_SCALE', [E('car', 'small', 4.5, 1.5)], ['WORLD_SCALE'])
    # порядок: кемпер 7 м вужчий за авто 4,5 м; масштаб у межах (мутація SCALE не має його ховати)
    case('перевернутий порядок → WORLD_ORDER', [E('car', 'good', 4.5, 1.5), E('motorhome', 'tiny_ref', 7.0, 3.0, [0, 0, 38, 28])], ['WORLD_ORDER', 'WORLD_SCALE'])
    case('кропом пурпуровий фон не ламає виміри', [E('car', 'magenta', 4.5, 1.5)], [])
    _, w = case('відсутній файл → лише WARN', [E('car', 'good', 4.5, 1.5), dict(E('x', 'good', 4.5, 1.5), file='nope.png')], [])
    if not any(m.startswith('WARN x') for m in w):
        print('  BAD відсутній файл не дав WARN')
        bad.append('warn')
    ms = check_missing([dict(file='a.png')], ['l.png'], ['a.png', 'l.png', 'z.png'])
    ok = [c for c, _ in ms] == ['WORLD_MISSING_ENTRY'] and 'z.png' in ms[0][1]
    print(f"  {'ok ' if ok else 'BAD'} PNG без рядка → WORLD_MISSING_ENTRY")
    if not ok:
        bad.append('missing')
    ok = check_calib(47) == [] and [c for c, _ in check_calib(20)] == ['WORLD_CALIB'] and [c for c, _ in check_calib(90)] == ['WORLD_CALIB']
    print(f"  {'ok ' if ok else 'BAD'} калібрування: 47 px проходить, 20 і 90 → WORLD_CALIB")
    if not ok:
        bad.append('calib')
    print('SELF-TEST: FAILED (' + ', '.join(bad) + ')' if bad else 'SELF-TEST: PASSED')
    return 1 if bad else 0


MUTATIONS = [
    ('SCALE вимкнено', "ENABLED = {'scale': True,", "ENABLED = {'scale': False,"),
    ('ORDER вимкнено', "'order': True,", "'order': False,"),
    ('ISO вимкнено', "'iso': True,", "'iso': False,"),
    ('«V»-ізометрію вимкнено', "'vee': True,", "'vee': False,"),
    ('measure: height ігнорується', "'measure': True,", "'measure': False,"),
    ('межа тонкості вимкнена', "'thin': True}", "'thin': False}"),
    ('«V» без перевірки прямизни ребер', "R2_MIN = 0.9 ", "R2_MIN = 0.0 "),
    ('рівна ширина знову порушення', "and a['w'] < b['w']]", "and not a['w'] > b['w']]"),
    ('MISSING_ENTRY вимкнено', "'missing': True,", "'missing': False,"),
    ('CALIB вимкнено', "'calib': True,", "'calib': False,"),
    ('пурпур не вважається прозорим', "and not (px[0] >= 250 and px[1] <= 5 and px[2] >= 250)", ''),
    ('поріг нахилу розкритий до 0,9', 'SLOPE_MAX = 0.25', 'SLOPE_MAX = 0.9'),
    ('допуск масштабу 100 %', "def evaluate(entries, loader, px_per_m=28, tol=0.25):", "def evaluate(entries, loader, px_per_m=28, tol=1.0):"),
    ('відсутній файл — помилка замість WARN ігнорується разом із виміром (continue зникає)', "            continue\n        m = measure", "            pass\n        m = measure"),
]


def mutate():
    full = open(os.path.abspath(__file__), encoding='utf-8').read()
    cut = full.index('\nMUTATIONS = [')
    head, rest = full[:cut], full[cut:]   # цілі шукаємо лише до самого списку мутацій (інакше список збігається сам із собою)
    res = 0
    for name, old, new in MUTATIONS:
        src = head
        if src.count(old) != 1:
            print(f'MUTATION BAD «{name}»: цілі немає (або не одна) — мутація була б порожньою')
            res = 1
            continue
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, 'check_world_mut.py')
            open(p, 'w', encoding='utf-8').write(src.replace(old, new) + rest)
            r = subprocess.run([sys.executable, '-I', p, '--self-test'], capture_output=True, text=True, env=dict(os.environ, WORLD_ROOT=ROOT))
        out = r.stdout + r.stderr
        tail = [l for l in out.splitlines() if l.startswith('SELF-TEST') or l.strip().startswith('BAD') or 'Traceback' in l]
        caught = r.returncode != 0
        print(f"MUTATION {'RED (спіймано)' if caught else 'GREEN (НЕ спіймано!)'}: {name} → {' | '.join(tail[:3]) or 'без виводу'}")
        if not caught:
            res = 1
    print('MUTATE: ' + ('усі мутації спіймано' if not res else 'ЄСТЬ НЕСПІЙМАНІ МУТАЦІЇ'))
    return res


def parse_overrides(items):
    d = {}
    for it in items or []:
        k, _, v = it.partition('=')
        d[k] = v
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--self-test', action='store_true')
    ap.add_argument('--mutate', action='store_true')
    ap.add_argument('--override', action='append', help='відносний/шлях=локальний файл (спрайт з іншої гілки)')
    a = ap.parse_args()
    if a.self_test:
        return selftest()
    if a.mutate:
        return mutate()
    return run_real(parse_overrides(a.override))


if __name__ == '__main__':
    sys.exit(main())
