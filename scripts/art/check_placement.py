#!/usr/bin/env python3
"""GAME-284 · сторож розстановки «фізика і глибина»: пробні сцени (research/game-284/layout.json) і шари об'єктів мап (public/maps/*.tmj).

    python3 scripts/art/check_placement.py              # перевірка
    python3 scripts/art/check_placement.py --self-test  # фікстури: кожен код МУСИТЬ спрацювати на своєму дефекті
    python3 scripts/art/check_placement.py --mutate     # вимикає кожну перевірку: self-test МУСИТЬ упасти

Коди: PLACE_OVERLAP (сліди двох твердих предметів перетинаються: камінь у кущі), PLACE_ORDER (предмет намальовано поверх іншого, але його
база вище на екрані: порушено y-sort), PLACE_WATER (твердий предмет стоїть у воді), PLACE_SIZE (висота спрайта поза ±40 % від справжньої,
28 px/м), PLACE_PATCH (у видимій сцені layout['view']=[x0,y0,x1,y1] є вікно 96x96 px, яке не перетинає жодного предмета: порожнеча), PLACE_EMPTY (не перевірено жодного предмета: тиша — не факт, закон 4).
Формат layout.json: {"px_per_m":28,"objects":[{id,kind,x,y(база),w,h(спрайт),foot:[w,h],solid,z,real_h_m?,water?}]}; слід — прямокутник foot, центр по x, низ у y.
Мапи: об'єкти objectgroup із type 'solid'/'prop' і width>0 — це сліди (x,y — лівий верх, як у Tiled).
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PXM = 28
SIZE_TOL = 0.4
ENABLED = {'overlap': True, 'order': True, 'water': True, 'size': True, 'empty': True, 'patches': True}
PATCH = 96   # 3x3 тайли


def foot(o):
    w, h = o['foot']
    return (o['x'] - w / 2, o['y'] - h, o['x'] + w / 2, o['y'])


def inter(a, b):
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def sprite_rect(o):
    return (o['x'] - o['w'] / 2, o['y'] - o['h'], o['x'] + o['w'] / 2, o['y'])


def empty_patches(layout, size=PATCH, step=16):
    """Верхні-ліві кути вікон size x size у layout['view'], що не перетинають спрайт жодного предмета (вода теж предмет: берег і брижі)."""
    x0, y0, x1, y1 = layout['view']
    rects = [sprite_rect(o) for o in layout['objects']]
    res = []
    for y in range(y0, y1 - size + 1, step):
        for x in range(x0, x1 - size + 1, step):
            win = (x, y, x + size, y + size)
            if not any(inter(win, r) for r in rects):
                res.append((x, y))
    return res


def check(layout, name='layout'):
    out = []
    objs = layout.get('objects', [])
    solid = [o for o in objs if o.get('solid')]
    water = [o for o in objs if o.get('water')]
    if ENABLED['empty'] and not [o for o in objs if not o.get('water')]:
        out.append(('PLACE_EMPTY', name, 'жодного предмета для перевірки'))
    if ENABLED['overlap']:
        for i, a in enumerate(solid):
            for b in solid[i + 1:]:
                if inter(foot(a), foot(b)):
                    out.append(('PLACE_OVERLAP', name, f"{a['id']} і {b['id']}: сліди перетинаються"))
    if ENABLED['water']:
        for a in solid:
            for w in water:
                if inter(foot(a), foot(w)):
                    out.append(('PLACE_WATER', name, f"{a['id']} стоїть у воді {w['id']}"))
    if ENABLED['order']:
        for a in objs:
            for b in objs:
                if a is b or a.get('water') or b.get('water') or 'z' not in a or 'z' not in b:
                    continue
                if a['z'] > b['z'] and inter(sprite_rect(a), sprite_rect(b)) and a['y'] < b['y']:
                    out.append(('PLACE_ORDER', name, f"{a['id']} (база y={a['y']}) намальовано поверх {b['id']} (база y={b['y']}): нижчий на екрані має бути попереду"))
    if ENABLED['patches'] and layout.get('view'):
        ep = empty_patches(layout)
        if len(ep) > layout.get('max_empty_patches', 0):
            out.append(('PLACE_PATCH', name, f'{len(ep)} порожніх вікон {PATCH}x{PATCH} px (перше {ep[0]}), дозволено {layout.get("max_empty_patches", 0)}'))
    if ENABLED['size']:
        for o in objs:
            if o.get('real_h_m'):
                exp = o['real_h_m'] * layout.get('px_per_m', PXM)
                if abs(o['h'] - exp) > SIZE_TOL * exp:
                    out.append(('PLACE_SIZE', name, f"{o['id']}: {o['h']} px проти {exp:.0f} px для {o['real_h_m']} м"))
    return out


def maps_layouts():
    res = []
    for f in sorted(glob.glob(os.path.join(ROOT, 'public/maps/*.tmj'))):
        d = json.load(open(f, encoding='utf8'))
        objs = []
        for l in d['layers']:
            for o in l.get('objects', []) if l.get('type') == 'objectgroup' else []:
                if o.get('type') in ('solid', 'prop') and o.get('width', 0) > 0:
                    objs.append({'id': f"{o.get('name') or o['id']}", 'solid': True, 'x': o['x'] + o['width'] / 2, 'y': o['y'] + o['height'],
                                 'foot': [o['width'], o['height']], 'w': o['width'], 'h': o['height']})
        side = os.path.join(ROOT, 'art/placement', os.path.basename(f)[:-4] + '.json')   # GAME-295: сліди й вікно «без порожнечі» мапи, що збирається скриптом (у .tmj лише точки)
        if os.path.exists(side):
            lay = json.load(open(side, encoding='utf8'))
        else:
            lay = {'objects': objs}
        res.append((os.path.basename(f), lay))
    return res


def ob(i, x, y, w, h, foot_, solid=True, z=None, **kw):
    d = {'id': i, 'kind': 'x', 'x': x, 'y': y, 'w': w, 'h': h, 'foot': foot_, 'solid': solid}
    if z is not None:
        d['z'] = z
    d.update(kw)
    return d


GOOD = {'px_per_m': 28, 'objects': [ob('bush', 80, 100, 48, 45, [36, 10], z=0, real_h_m=1.6), ob('rock', 140, 110, 34, 28, [28, 8], z=1, real_h_m=1.0),
                                     ob('pond', 100, 200, 128, 64, [128, 64], solid=False, water=True)]}
BAD = {
    'PLACE_OVERLAP': {'px_per_m': 28, 'objects': [ob('bush', 80, 100, 48, 45, [36, 10], z=0), ob('rock', 82, 100, 34, 28, [28, 8], z=1)]},
    'PLACE_ORDER': {'px_per_m': 28, 'objects': [ob('bush', 80, 120, 48, 45, [36, 10], z=0), ob('rock', 90, 100, 34, 28, [28, 8], z=1)]},   # камінь вище на екрані, але поверх куща
    'PLACE_WATER': {'px_per_m': 28, 'objects': [ob('rock', 100, 200, 34, 28, [28, 8], z=0), ob('pond', 100, 200, 128, 64, [128, 64], solid=False, water=True)]},
    'PLACE_SIZE': {'px_per_m': 28, 'objects': [ob('bush', 80, 100, 96, 90, [36, 10], z=0, real_h_m=1.0)]},
    'PLACE_EMPTY': {'px_per_m': 28, 'objects': []},
    'PLACE_PATCH': {'px_per_m': 28, 'view': [0, 0, 300, 200], 'objects': [ob('bush', 40, 60, 48, 45, [36, 10], z=0)]},   # праворуч порожнеча
}


def self_test():
    bad = []
    got = {c for c, *_ in check(GOOD, 'good')}
    if got:
        bad.append(f'добра фікстура червоніє: {got}')
    for code, lay in BAD.items():
        if code not in {c for c, *_ in check(lay, code)}:
            bad.append(f'{code}: дефект не пійманий')
    for b in bad:
        print('SELF-TEST FAIL', b)
    print('self-test:', 'FAIL' if bad else f'OK ({len(BAD)} кодів, фікстура зелена)')
    return 1 if bad else 0


def mutate():
    miss = []
    for k in ENABLED:
        ENABLED[k] = False
        if self_test_quiet():
            miss.append(k)
        ENABLED[k] = True
    print('mutate:', 'FAIL — перевірка без наслідку: ' + ', '.join(miss) if miss else f'OK (вимкнення будь-якої з {len(ENABLED)} перевірок валить self-test)')
    return 1 if miss else 0


def self_test_quiet():
    """True, якщо self-test усе одно зелений (мутація вижила)."""
    if {c for c, *_ in check(GOOD)}:
        return False
    return all(code in {c for c, *_ in check(lay)} for code, lay in BAD.items())


def main(argv):
    if '--self-test' in argv:
        return self_test()
    if '--mutate' in argv:
        return mutate()
    srcs = []
    p = os.path.join(ROOT, 'research/game-284/layout.json')
    if os.path.exists(p):
        srcs.append(('game-284/layout.json', json.load(open(p, encoding='utf8'))))
    srcs += maps_layouts()
    errs, n = [], 0
    for name, lay in srcs:
        n += len(lay['objects'])
        if name.endswith('.tmj') and not lay['objects']:
            continue   # мапа без твердих предметів-слідів — нічого міряти; загальна порожнеча ловиться нижче
        errs += check(lay, name)
    if n == 0:
        errs.append(('PLACE_EMPTY', 'усе', 'жодного предмета ні в layout.json, ні в мапах'))
    for c, nm, m in errs:
        print(f'{c} {nm}: {m}')
    print(f'placement: {len(srcs)} джерел, {n} предметів, помилок {len(errs)} — ' + ('FAIL' if errs else 'PASS'))
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
