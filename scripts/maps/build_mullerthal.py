#!/usr/bin/env python3
"""GAME-295 · кемпінг Мюллерталь: public/maps/mullerthal.tmj із тайлів LPC (GAME-284: ch2_muellerthal.png, ch2_objects.png) і реквізиту кемпінгу (camp_props.png).

    python3 scripts/maps/build_mullerthal.py [--preview out.png] [--check]

Місце: галявина кемпінгу в долині з пісковиком і лісом. Північ — уступ пісковикових скель із водоспадом, під ним заводь; з заводі на південь тече струмок
(місток на головній стежці). На захід від струмка — рецепція (господиня), стоянка авто, санблок; на схід — ділянки (намет, караван, кемпер).
Три виходи на стежки (вказівники): схід — офіційна, захід — забута, північний схід — інша. Довкола щільний ліс; порожніх ділянок 3×3 тайли немає
(scripts/art/check_placement.py читає сліди з art/placement/mullerthal.json).
Референси: research/game-295/REFERENCE.md (фото переглянуто лише онлайн, не збережено).
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
W, H = 36, 26
MAP = os.path.join(ROOT, 'public/maps/mullerthal.tmj')
PLACE = os.path.join(ROOT, 'art/placement/mullerthal.json')   # сліди предметів для scripts/art/check_placement.py (у .tmj їм не місце: валідатор мап і сцена знають лише точки)
PROP_POS, PROP_ROWS = build_camp_props.prop_sheet()
PC = build_camp_props.COLS
# (ім'я, файл від public/maps/, стовпців, рядків-тайлів, firstgid); ch2_muellerthal.png 672×688 — 21 стовпець, 21 повний рядок (останні 16 px порожні)
SETS = [
    ('lpc-terrain', 'terrain_atlas.png', 32, 32, 1),
    ('camp-tent', 'camp_tent.png', 3, 2, 1025),
    ('camp-car', 'camp_car.png', 4, 2, 1031),
    ('camp-props', 'camp_props.png', PC, PROP_ROWS, 1039),
]
nxt = 1039 + PC * PROP_ROWS
SETS += [('ch2-muellerthal', 'ch2_muellerthal.png', 21, 21, nxt), ('ch2-objects', 'ch2_objects.png', 4, 1, nxt + 441)]
FIRST = {n: f for n, _, _, _, f in SETS}
IMG = {n: Image.open(os.path.join(ROOT, 'assets/tiles', f)).convert('RGBA') for n, f, _, _, _ in SETS}
COLS = {n: c for n, _, c, _, _ in SETS}


def gid(sheet, col, row):
    return FIRST[sheet] + row * COLS[sheet] + col


def blank(sheet, col, row):
    return IMG[sheet].crop((col * T, row * T, col * T + T, row * T + T)).getchannel('A').getbbox() is None


class Grid:
    def __init__(self):
        self.L = {n: [0] * (W * H) for n in ('ground', 'decor', 'walls', 'above')}
        self.occ = set()        # клітинки, зайняті слідом твердого предмета
        self.ab = set()         # клітинки шару above (крони, дахи): стампи не накладаються — інакше вирізає шматки
        self.bare = set()       # клітинки без рослинності (стежки, майданчики, місток, вода): квіти там не ростуть
        self.wet = set()        # з них вода (заводь, струмок): каміння в воді — природне (валуни біля водоспаду), на сухій стежці — ні (GAME-296)
        self.keep = set()       # клітинки, які мають лишатись вільними (стежки, цілі, підходи)
        self.plants = set()     # індекси objs-рослин
        self.objs = []          # сліди для check_placement: (name, type, x, y, w, h, sw, sh)

    def put(self, layer, c, r, sheet, col, row):
        if 0 <= c < W and 0 <= r < H and not blank(sheet, col, row):
            self.L[layer][r * W + c] = gid(sheet, col, row)

    def free(self, cells):
        return all(0 <= c < W and 0 <= r < H and (c, r) not in self.occ and (c, r) not in self.keep for c, r in cells)

    def dry_bare(self):
        return self.bare - self.wet

    def rock(self, c, r):
        """Камінь (GAME-296): лише на траві — не на стежці, майданчику, містку (dry_bare) і не під кроною дерева (ab); сторож PLACE_PATH у scripts/art/check_placement.py."""
        return (c, r) not in self.dry_bare() and (c, r) not in self.ab and self.stamp('rock', 'ch2-muellerthal', 15, 0, 1, 1, c, r)

    def stamp(self, name, sheet, col, row, w, h, c, r, solid=True, force=False):
        """Шматок w×h тайлів (col,row) → (c,r); низ — у walls і слід, решта — above. Повертає False, якщо слід не вільний."""
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
    rnd = random.Random(295)
    g = Grid()
    grass = [(21, 5), (22, 5), (23, 5)]                       # атлас: трава (як у camp-lake)
    DIRT = (20, 5)
    for r in range(H):
        for c in range(W):
            g.put('ground', c, r, 'lpc-terrain', *rnd.choice(grass))

    for r in range(0, 5):
        for c in range(W):
            g.put('ground', c, r, 'ch2-muellerthal', 16, 10)
    # --- шляхи й місця, що лишаються вільними
    for c in range(0, W):
        for r in (15, 16):
            g.keep.add((c, r))
    for r in range(5, 16):                                    # стежка від водоспаду до головної: західний берег струмка
        g.keep |= {(12, r), (13, r)}
    for r in range(16, 23):
        g.keep |= {(12, r), (13, r)}
    for r in range(8, 15):                                    # стежка «інша» на північний схід
        g.keep |= {(29, r), (30, r)}
    dirt = set(g.keep)
    g.bare |= dirt
    for (c, r) in dirt:
        g.put('ground', c, r, 'lpc-terrain', *DIRT)

    # --- скелі: уступ пісковика на півночі, водоспад над заводдю
    CL = ('cliff', 'ch2-muellerthal', 5, 0, 3, 5)
    for c in (0, 3, 6, 9, 12, 18, 21, 24, 27, 30, 33):
        g.stamp(CL[0], CL[1], CL[2], CL[3], CL[4], CL[5], c, 0)
    g.stamp('waterfall', 'ch2-muellerthal', 12, 0, 3, 5, 15, 0)

    # --- заводь і струмок (вода: ground + walls; на містку лише ground)
    PB = (12, 9)                                              # блок ставка 3×3 у ch2: (12..14, 9..11)
    def water(c, r, col, row, wall=True):
        g.put('ground', c, r, 'ch2-muellerthal', col, row)
        g.bare.add((c, r))
        g.wet.add((c, r))
        if wall:
            g.put('walls', c, r, 'ch2-muellerthal', col, row)
            g.occ.add((c, r))
    for r in range(5, 9):
        for c in range(14, 19):
            col = 12 if c == 14 else 14 if c == 18 else 13
            row = 9 if r == 5 else 11 if r == 8 else 10
            water(c, r, col, row)
    for r in range(9, H):
        bridge = r in (15, 16)
        water(16, r, 12, 10, wall=not bridge)
        water(17, r, 14, 10, wall=not bridge)
    PLANK = [(16, 20), (17, 20), (18, 20)]
    for r in (15, 16):
        for c, (pc, pr) in zip((15, 16, 17, 18), [PLANK[0], PLANK[1], PLANK[1], PLANK[2]]):
            g.put('decor', c, r, 'lpc-terrain', pc, pr)
            g.bare.add((c, r))
            g.wet.discard((c, r))                              # місток: під ним вода, але стоїмо на дошках
    for r in (15, 16):
        for c in (15, 18):
            g.keep.add((c, r))

    # --- будівлі й ділянки
    def prop(name, c, rb, solid=True):
        col, row, w, h = PROP_POS[name]
        return g.stamp(name, 'camp-props', col, row, w, h, c, rb - h + 1, solid)
    def pad(c0, r0, c1, r1):
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                g.put('ground', c, r, 'ch2-muellerthal', 7, 10)
                g.bare.add((c, r))
    def tent(c, rb):
        return g.stamp('tent', 'camp-tent', 0, 0, 3, 2, c, rb - 1)

    pad(3, 11, 7, 13); pad(3, 17, 7, 20); pad(18, 17, 25, 20); pad(26, 17, 34, 20)
    ok = [
        prop('reception', 7, 12),                              # рецепція: 7..10 × 9..12
        prop('sanitary', 21, 11),                              # санблок: 21..27 × 10..11
        prop('lamp', 11, 14), prop('bins', 24, 13), prop('tap', 20, 13),
        tent(4, 13),                                           # ділянка 4 (північний захід)
        tent(4, 19),                                           # ділянка 1 (захід)
        prop('table', 6, 20),
        prop('bikes', 4, 17),                                  # велосипеди родини при ділянці 1 (GAME-296: каміння зі стежки замінено справжніми предметами)
        prop('tap', 18, 17),                                   # кран біля містка — ближче до ділянок 2–3
        prop('caravan', 19, 19),                               # ділянка 2: караван
        prop('hookup', 25, 19),
        prop('motorhome', 27, 19),                             # ділянка 3: кемпер
        prop('barrier', 9, 21),                                # шлагбаум парковки
        g.stamp('car', 'camp-car', 0, 0, 4, 2, 4, 24),         # парковка: два авто в південно-західному куті
        g.stamp('car2', 'camp-car', 0, 0, 4, 2, 9, 24),
        g.stamp('closed-trail', 'ch2-muellerthal', 10, 4, 2, 3, 31, 12),   # огородження закритої офіційної стежки (V-бар'єр)
    ]
    assert all(ok), ok
    blank_gid = gid('ch2-muellerthal', 20, 20)
    assert blank('ch2-muellerthal', 20, 20)
    for r in (11, 12):                                         # рецепція — будівля: прохід між стовпами закритий (прозорий тайл із колізією)
        for c in range(7, 11):
            if not g.L['walls'][r * W + c]:
                g.L['walls'][r * W + c] = blank_gid
            g.occ.add((c, r))
    for c in range(3, 14):
        for r in (22, 23, 24, 25):
            g.keep.add((c, r))
    for n, t, c, r in SPOTS:
        for dc in (-1, 0, 1):
            for dr in (0, 1):
                g.keep.add((c + dc, r + dr))
    for c, r in [(15, 10), (18, 12), (15, 13), (19, 14), (15, 20), (19, 22), (28, 14), (21, 24)]:   # GAME-296: лише на траві (g.rock відмовляє на стежці й майданчику)
        assert g.rock(c, r), (c, r)

    # --- ліс: сосни й підлісок (випадково, по лісових зонах, без накладання крон)
    def forest(c, r):
        if r <= 9 and not (11 <= c <= 14):
            return True
        return c <= 2 or c >= 33 or r >= 22
    def pine(c, rb):
        return g.stamp('pine', 'lpc-terrain', 30, 0, 2, 5, c, rb - 4)
    def thicket(c, rb):
        return g.stamp('thicket', 'ch2-muellerthal', 0, 12, 3, 3, c, rb - 2)
    cells = [(c, r) for r in range(5, H) for c in range(W) if forest(c, r) and (c, r) not in g.keep and (c, r) not in g.bare]   # GAME-296: ні дерева, ні каміння на стежках і майданчиках
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
    rnd = random.Random(7)
    small = [('orchid', 'ch2-objects', 0, 0), ('orchid', 'ch2-objects', 1, 0), ('orchid', 'ch2-objects', 2, 0), ('pebble', 'ch2-muellerthal', 16, 0)]
    view = [0, 5 * T, W * T, H * T]                           # північ (рядки 0–4) — глухий уступ скель
    def lay():
        objs = [{'id': n, 'solid': t == 'solid', 'x': x + w / 2, 'y': y + h, 'foot': [w, h], 'w': sw, 'h': sh} for n, t, x, y, w, h, sw, sh in g.objs]
        return {'view': view, 'objects': objs}
    for n, t, c, r in SPOTS:                                   # кадри дня 1: на місці кадру — справжня орхідея на траві (не на стежці й не на майданчику)
        if n in PHOTO_SPOTS:
            assert (c, r) not in g.bare and not g.L['walls'][r * W + c] and not g.L['decor'][r * W + c], n
            g.put('decor', c, r, 'ch2-objects', 0, 0)
            g.objs.append(('orchid', 'prop', c * T + 12, r * T + 20, 8, 4, 32, 32))
            g.plants.add(len(g.objs) - 1)
    for _ in range(400):
        ep = cp.empty_patches(lay())
        if not ep:
            break
        px, py = ep[0]
        cells = [(px // T + i, py // T + j) for j in range(3) for i in range(3)]
        cands = [c for c in cells if g.free([c]) and c not in g.dry_bare() and not g.L['walls'][c[1] * W + c[0]] and not g.L['decor'][c[1] * W + c[0]]]
        if not cands:
            cands = [c for c in cells if (c not in g.occ) and c not in g.dry_bare() and not g.L['walls'][c[1] * W + c[0]]]   # GAME-296: стежка й майданчик — не місце для каміння
        wet = [c for c in cells if c in g.wet]                 # вікно лише з води й стежки: камінчик у воді (заводь), але не на стежці
        assert cands or wet, f'порожнє вікно {px},{py} без трави й води: потрібен справжній предмет у build() (GAME-296)'
        c, r = cands[len(cands) // 2] if cands else wet[len(wet) // 2]
        n, sh, col, row = rnd.choice(small)
        if (c, r) in g.bare:
            n, sh, col, row = small[3]                         # у воді й на дошках — лише камінчик, не квітка
        g.put('decor', c, r, sh, col, row)
        g.objs.append((f'{n}', 'prop', c * T + 12, r * T + 20, 8, 4, 32, 32))
        if n == 'orchid':
            g.plants.add(len(g.objs) - 1)
    return lay


SPOTS = [  # (id, name, type, cell c, r)
    ('s.start', 'spawn', 12, 17), ('s.car', 'spawn', 12, 22),
    ('npc.host-mullerthal', 'npc', 9, 14),
    ('obj.vehicle', 'trigger', 13, 22), ('obj.reception-desk', 'anchor', 10, 14),
    ('obj.pitch-1', 'trigger', 3, 17), ('obj.pitch-2', 'trigger', 23, 17), ('obj.pitch-3', 'trigger', 28, 17), ('obj.pitch-4', 'trigger', 22, 14),
    ('obj.sanitary-door', 'anchor', 24, 12),
    ('exit.trail.official', 'trigger', 33, 15), ('exit.trail.forgotten', 'trigger', 2, 15), ('exit.trail.other', 'trigger', 29, 8),
    # GAME-287 · кадри дня 1 розділу 2 (src/content/photos.ts CH2_PHOTOS): суха погода — орхідея на краю лісу біля виходу на офіційну стежку, дощ — орхідея під навісом рецепції.
    ('obj.photo-orchid', 'anchor', 33, 13), ('obj.photo-drops', 'anchor', 8, 13),
    # GAME-288 · вечеря дня 1 розділу 2: стіл на ділянці 1 (src/content/ch2-dinner.ts); якір (як кадри) живий лише ввечері дня 1, поки вечері ще не було.
    ('obj.dinner', 'anchor', 6, 21),
]
PHOTO_SPOTS = ('obj.photo-orchid', 'obj.photo-drops')


def tmj(g):
    ts = [{'firstgid': f, 'name': n, 'image': f'../../assets/tiles/{img}', 'imagewidth': IMG[n].width, 'imageheight': IMG[n].height, 'tilewidth': T, 'tileheight': T,
           'margin': 0, 'spacing': 0, 'columns': cols, 'tilecount': cols * rows} for n, img, cols, rows, f in SETS]
    pts = [{'id': 1 + i, 'name': n, 'type': t, 'x': c * T + 16, 'y': r * T + 16, 'width': 0, 'height': 0, 'point': True, 'rotation': 0, 'visible': True} for i, (n, t, c, r) in enumerate(SPOTS)]
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
            'tilesets': ts, 'properties': [{'name': 'locationId', 'type': 'string', 'value': 'loc.camp.mullerthal'}]}


def placement(g):
    objs = [{'id': o[0], 'solid': o[1] == 'solid', 'x': o[2] + o[4] / 2, 'y': o[3] + o[5], 'foot': [o[4], o[5]], 'w': o[6], 'h': o[7], **({'plant': True} if i in g.plants else {}), **({'loose': True} if o[0] in ('rock', 'pebble') else {})} for i, o in enumerate(g.objs)]
    box = lambda cells: [[c * T, r * T, c * T + T, r * T + T] for c, r in sorted(cells, key=lambda k: (k[1], k[0]))]
    return json.dumps({'view': [0, 5 * T, W * T, H * T], 'bare': box(g.bare), 'wet': box(g.wet), 'objects': objs}, ensure_ascii=False, indent=0) + '\n'


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
        print('mullerthal.tmj: ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ від генератора'))
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
