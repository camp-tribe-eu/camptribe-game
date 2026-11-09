#!/usr/bin/env python3
"""GAME-291 · Шенген, пам'ятник трьом країнам: public/maps/schengen.tmj із тайлів LPC (GAME-284: ch2_muellerthal.png, ch2_objects.png, ch2_monument.png) і реквізиту кемпінгу (camp_props.png).

    python3 scripts/maps/build_schengen.py [--preview out.png] [--check]

Місце: набережна Мозеля. Східний край — річка (три країни сходяться на воді), на захід від неї — вимощена площадка з пам'ятником (три сталеві стовпи на плінтусі, 3×3 тайли), поруч
інформаційний павільйон (у дощ сцена йде під його дахом — лише текст), пікніковий стіл, ліхтарі, три баки для відходів, кран. Пляшка з половинкою медальйона —
біля плінтуса. Авто стоїть на парковці внизу (obj.vehicle), стежка від парковки — до площадки; довкола щільний ліс, порожніх ділянок 3×3 тайли немає
(scripts/art/check_placement.py читає сліди з art/placement/schengen.json). Референси: research/game-291/REFERENCE.md (фото переглянуто лише онлайн, не збережено).
"""
import json
import os
import random
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'assets'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'art'))
import build_camp_props  # noqa: E402
import check_placement as cp  # noqa: E402

T = 32
W, H = 30, 26
MAP = os.path.join(ROOT, 'public/maps/schengen.tmj')
PLACE = os.path.join(ROOT, 'art/placement/schengen.json')
PROP_POS, PROP_ROWS = build_camp_props.prop_sheet()
PC = build_camp_props.COLS
SETS = [
    ('lpc-terrain', 'terrain_atlas.png', 32, 32, 1),
    ('camp-car', 'camp_car.png', 4, 2, 1025),
    ('camp-props', 'camp_props.png', PC, PROP_ROWS, 1033),
]
nxt = 1033 + PC * PROP_ROWS
SETS += [('ch2-muellerthal', 'ch2_muellerthal.png', 21, 21, nxt), ('ch2-objects', 'ch2_objects.png', 4, 1, nxt + 441), ('ch2-monument', 'ch2_monument.png', 3, 3, nxt + 441 + 4)]
FIRST = {n: f for n, _, _, _, f in SETS}
IMG = {n: Image.open(os.path.join(ROOT, 'assets/tiles', f)).convert('RGBA') for n, f, _, _, _ in SETS}
COLS = {n: c for n, _, c, _, _ in SETS}

RIVER = (25, 26, 27, 28)                                      # стовпці води: берег · дві глибини · берег
PLAZA = (9, 10, 15, 14)                                        # вимощена площадка: c0, r0, c1, r1 (включно)
MON = (11, 10)                                                # пам'ятник 3×3: лівий верхній тайл; слід — нижній ряд (рядок 12)
START = (13.625, 12)                                              # герой з'являється одразу праворуч від плінтуса (x = 452 px) на рівні його основи: камера 2× бачить усі три стовпи і в 9:16 (півширини 97 px), і в 16:9 (піввисоти 107 px); рамка розмови (низ екрана) їх не закриває
PATH = [(c, r) for r in (14, 15) for c in range(16, 21)]      # стежка від площадки (її східний край) до авто


def gid(sheet, col, row):
    return FIRST[sheet] + row * COLS[sheet] + col


def blank(sheet, col, row):
    return IMG[sheet].crop((col * T, row * T, col * T + T, row * T + T)).getchannel('A').getbbox() is None


class Grid:
    def __init__(self):
        self.L = {n: [0] * (W * H) for n in ('ground', 'decor', 'walls', 'above')}
        self.occ = set()
        self.ab = set()
        self.bare = set()
        self.wet = set()
        self.keep = set()
        self.plants = set()
        self.objs = []
        self.real_h = {}                                       # індекс сліду → справжня висота, м (сторож PLACE_SIZE)

    def put(self, layer, c, r, sheet, col, row):
        if 0 <= c < W and 0 <= r < H and not blank(sheet, col, row):
            self.L[layer][r * W + c] = gid(sheet, col, row)

    def free(self, cells):
        return all(0 <= c < W and 0 <= r < H and (c, r) not in self.occ and (c, r) not in self.keep for c, r in cells)

    def dry_bare(self):
        return self.bare - self.wet

    def rock(self, c, r):
        return (c, r) not in self.dry_bare() and (c, r) not in self.ab and self.stamp('rock', 'ch2-muellerthal', 15, 0, 1, 1, c, r)

    def stamp(self, name, sheet, col, row, w, h, c, r, solid=True, force=False):
        foot = [(c + i, r + h - 1) for i in range(w) if not blank(sheet, col + i, row + h - 1)]
        top = {(c + i, r + j) for j in range(h - 1 if solid else h) for i in range(w) if not blank(sheet, col + i, row + j)}
        if solid and not force and (not foot or not self.free(foot) or top & self.ab or top & self.occ or top & self.keep):
            return False
        self.ab |= top
        for j in range(h):
            for i in range(w):
                self.put('walls' if (j == h - 1 and solid) else 'above', c + i, r + j, sheet, col + i, row + j)
        if solid:
            self.occ |= set(foot)
            bb = IMG[sheet].crop((col * T, (row + h - 1) * T, (col + w) * T, (row + h) * T)).getchannel('A').getbbox()
            self.objs.append((name, 'solid', c * T + bb[0], (r + h - 1) * T + bb[1], bb[2] - bb[0], bb[3] - bb[1], w * T, h * T))
        return True


def build():
    rnd = random.Random(291)
    g = Grid()
    grass = [(21, 5), (22, 5), (23, 5)]
    DIRT = (20, 5)
    for r in range(H):
        for c in range(W):
            g.put('ground', c, r, 'lpc-terrain', *rnd.choice(grass))

    # --- шляхи й місця, що лишаються вільними: площадка, стежка від парковки, підходи до цілей
    pc0, pr0, pc1, pr1 = PLAZA
    for c in range(pc0, pc1 + 1):                                 # прохід уздовж фронту площадки
        g.keep.add((c, pr1))
    for r in range(MON[1] + 3, pr1 + 1):                          # підхід до пам'ятника й пляшки від стежки
        g.keep |= {(12, r), (13, r), (14, r), (15, r)}
    g.keep |= {(c, r) for c in range(int(START[0]) - 1, int(START[0]) + 2) for r in range(START[1], START[1] + 2)}
    g.keep |= set(PATH)
    dirt = set(PATH)
    g.bare |= dirt
    for (c, r) in dirt:
        g.put('ground', c, r, 'lpc-terrain', *DIRT)
    for r in range(pr0, pr1 + 1):
        for c in range(pc0, pc1 + 1):
            g.put('ground', c, r, 'ch2-muellerthal', 7, 10)   # вимощення (як майданчики Мюллерталя)
            g.bare.add((c, r))

    # --- Мозель: берег · глибина · глибина · берег; уся висота мапи, на воді стоїмо не можна
    def water(c, r, col, row):
        g.put('ground', c, r, 'ch2-muellerthal', col, row)
        g.put('walls', c, r, 'ch2-muellerthal', col, row)
        g.bare.add((c, r))
        g.wet.add((c, r))
        g.occ.add((c, r))
    for r in range(H):
        for c, col in zip(RIVER, (12, 13, 13, 14)):
            water(c, r, col, 10)

    # --- пам'ятник трьом країнам: слід — нижній ряд (на плінтусі), знімок на 28 px/м = 2,5 м
    assert g.stamp('monument', 'ch2-monument', 0, 0, 3, 3, MON[0], MON[1], force=True)
    g.occ |= {(MON[0] + i, MON[1] + 2) for i in range(3)}
    g.real_h[len(g.objs) - 1] = 2.5

    # --- павільйон, меблі набережної, баки (скло/папір/решта), кран
    def prop(name, c, rb, solid=True):
        col, row, w, h = PROP_POS[name]
        return g.stamp(name, 'camp-props', col, row, w, h, c, rb - h + 1, solid)
    ok = [
        prop("reception", 21, 13),                             # павільйон: 18..21 × 10..13 праворуч від площадки
        prop("table", 7, 13), prop("table", 7, 16),            # пікнікові столи ліворуч від площадки
        prop("lamp", 9, 12), prop("lamp", 15, 10),             # ліхтарі біля площадки (другий не на місці появи)
        prop("bins", 6, 11),                                   # баки: скло, папір, решта (у сцені Метью несе пляшку в бак для скла)
        prop("tap", 22, 14),
        prop('bikes', 5, 16),
        g.stamp('car', 'camp-car', 0, 0, 4, 2, 17, 16),        # авто родини на парковці під стежкою
    ]
    assert all(ok), ok
    for n, t, c, r in SPOTS:
        for dc in (-1, 0, 1):
            for dr in (0, 1):
                g.keep.add((c + dc, r + dr))
    for c, r in [(5, 6), (21, 15), (3, 18), (22, 19), (6, 21), (21, 22), (7, 4), (23, 4)]:
        g.rock(c, r)

    # --- ліс: сосни, підлісок, каміння по лісових зонах
    def forest(c, r):
        return r <= 7 or c <= 3 or (c >= 23 and r >= 8) or c >= 24 or r >= 19
    def pine(c, rb):
        return g.stamp('pine', 'lpc-terrain', 30, 0, 2, 5, c, rb - 4)
    def thicket(c, rb):
        return g.stamp('thicket', 'ch2-muellerthal', 0, 12, 3, 3, c, rb - 2)
    cells = [(c, r) for r in range(1, H) for c in range(W) if forest(c, r) and (c, r) not in g.keep and (c, r) not in g.bare and c < min(RIVER)]
    for kind in range(3):
        rnd.shuffle(cells)
        for c, r in cells:
            if kind == 0 and r >= 4:
                pine(c, r)
            elif kind == 1:
                thicket(c, r)
            elif kind == 2 and rnd.random() < 0.08:
                g.rock(c, r)
    return g


def finish(g):
    rnd = random.Random(11)
    small = [('orchid', 'ch2-objects', 0, 0), ('orchid', 'ch2-objects', 1, 0), ('orchid', 'ch2-objects', 2, 0), ('pebble', 'ch2-muellerthal', 16, 0)]
    view = [0, 0, W * T, H * T]
    def lay():
        objs = [{'id': n, 'solid': t == 'solid', 'x': x + w / 2, 'y': y + h, 'foot': [w, h], 'w': sw, 'h': sh, **({'real_h_m': g.real_h[i]} if i in g.real_h else {})} for i, (n, t, x, y, w, h, sw, sh) in enumerate(g.objs)]
        return {'view': view, 'objects': objs}
    # пляшка з половинкою медальйона: на плінтусі, біля південно-східного кута (не на стежці й не в стовпах); тайл (3,0) ch2-objects
    bc, br = MON[0] + 2, MON[1] + 3
    assert (bc, br) not in g.occ and not g.L['walls'][br * W + bc]
    g.put('decor', bc, br, 'ch2-objects', 3, 0)
    g.objs.append(('bottle', 'prop', bc * T + 12, br * T + 22, 8, 4, 32, 32))
    for _ in range(400):
        ep = cp.empty_patches(lay())
        if not ep:
            break
        px, py = ep[0]
        cells = [(px // T + i, py // T + j) for j in range(3) for i in range(3)]
        cands = [c for c in cells if g.free([c]) and c not in g.dry_bare() and not g.L['walls'][c[1] * W + c[0]] and not g.L['decor'][c[1] * W + c[0]]]
        if not cands:
            cands = [c for c in cells if (c not in g.occ) and c not in g.dry_bare() and not g.L['walls'][c[1] * W + c[0]]]
        wet = [c for c in cells if c in g.wet]
        assert cands or wet, f'порожнє вікно {px},{py} без трави й води: потрібен справжній предмет у build()'
        c, r = cands[len(cands) // 2] if cands else wet[len(wet) // 2]
        n, sh, col, row = rnd.choice(small)
        if (c, r) in g.bare:
            n, sh, col, row = small[3]
        g.put('decor', c, r, sh, col, row)
        g.objs.append((f'{n}', 'prop', c * T + 12, r * T + 20, 8, 4, 32, 32))
        if n == 'orchid':
            g.plants.add(len(g.objs) - 1)
    return lay


SPOTS = [  # (id, type, cell c, r)
    ('s.start', 'spawn', START[0], START[1]), ('s.car', 'spawn', START[0], START[1]),
    ('obj.vehicle', 'trigger', 18, 15),
    ('obj.monument', 'anchor', 12, 13), ('obj.bottle', 'anchor', 13, 13),
]


def tmj(g):
    ts = [{'firstgid': f, 'name': n, 'image': f'../../assets/tiles/{img}', 'imagewidth': IMG[n].width, 'imageheight': IMG[n].height, 'tilewidth': T, 'tileheight': T,
           'margin': 0, 'spacing': 0, 'columns': cols, 'tilecount': cols * rows} for n, img, cols, rows, f in SETS]
    pts = [{'id': 1 + i, 'name': n, 'type': t, 'x': int(c * T + 16), 'y': r * T + 16, 'width': 0, 'height': 0, 'point': True, 'rotation': 0, 'visible': True} for i, (n, t, c, r) in enumerate(SPOTS)]
    k = len(pts) + 1
    def tl(i, name, data, props=None):
        d = {'id': i, 'name': name, 'type': 'tilelayer', 'width': W, 'height': H, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'data': data}
        if props:
            d['properties'] = props
        return d
    return {'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal', 'renderorder': 'right-down', 'width': W, 'height': H,
            'tilewidth': T, 'tileheight': T, 'infinite': False, 'nextlayerid': 7, 'nextobjectid': k,
            'layers': [tl(1, 'ground', g.L['ground']), tl(2, 'decor', g.L['decor']), tl(3, 'walls', g.L['walls'], [{'name': 'collides', 'type': 'bool', 'value': True}]),
                       tl(4, 'above', g.L['above']),
                       {'id': 5, 'name': 'objects', 'type': 'objectgroup', 'draworder': 'topdown', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0, 'objects': pts}],
            'tilesets': ts, 'properties': [{'name': 'locationId', 'type': 'string', 'value': 'loc.schengen'}]}


def placement(g):
    objs = [{'id': o[0], 'solid': o[1] == 'solid', 'x': o[2] + o[4] / 2, 'y': o[3] + o[5], 'foot': [o[4], o[5]], 'w': o[6], 'h': o[7], **({'plant': True} if i in g.plants else {}), **({'loose': True} if o[0] in ('rock', 'pebble') else {}),
             **({'real_h_m': g.real_h[i]} if i in g.real_h else {})} for i, o in enumerate(g.objs)]
    box = lambda cells: [[c * T, r * T, c * T + T, r * T + T] for c, r in sorted(cells, key=lambda k: (k[1], k[0]))]
    return json.dumps({'view': [0, 0, W * T, H * T], 'bare': box(g.bare), 'wet': box(g.wet), 'objects': objs}, ensure_ascii=False, indent=0) + '\n'


def preview(g, path):
    im = Image.new('RGBA', (W * T, H * T))
    for name in ('ground', 'decor', 'walls', 'above'):
        for k, v in enumerate(g.L[name]):
            if not v:
                continue
            n = max((s for s in SETS if s[4] <= v), key=lambda s: s[4])
            i = v - n[4]
            cols = n[2]
            im.alpha_composite(IMG[n[0]].crop(((i % cols) * T, (i // cols) * T, (i % cols) * T + T, (i // cols) * T + T)), ((k % W) * T, (k // W) * T))
    im.save(path)


def main(argv):
    g = build()
    finish(g)
    text = json.dumps(tmj(g), indent=1, ensure_ascii=False) + '\n'
    if '--check' in argv:
        same = os.path.exists(MAP) and open(MAP, encoding='utf8').read() == text and os.path.exists(PLACE) and open(PLACE, encoding='utf8').read() == placement(g)
        print('schengen.tmj: ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ від генератора'))
        return 0 if same else 1
    open(MAP, 'w', encoding='utf8').write(text)
    os.makedirs(os.path.dirname(PLACE), exist_ok=True)
    open(PLACE, 'w', encoding='utf8').write(placement(g))
    if '--preview' in argv:
        preview(g, argv[argv.index('--preview') + 1])
    print(MAP, len(g.objs), 'слідів')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
