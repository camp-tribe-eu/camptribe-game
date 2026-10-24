#!/usr/bin/env python3
"""GAME-146 · перший сучасний набір LPC: інтер'єр дому Les Tilleuls (Намюр) з наборів OGA у research/packs/.

    python3 scripts/assets/build_home_interior.py [--preview out.png [--grid]] [--check]

Що робить:
  * вирізає з першоджерел (research/packs/pack-lpc-*) лише потрібні тайли і доводить їх до палітри основи
    (scripts/palette/quantize.py, art/palette/lpc.json): один PNG на одне джерело, бо сторож ліцензій тримає
    «файл → рівно один рядок реєстру → одна ліцензія». Усе — похідні файли: рядки в assets/CREDITS.csv і
    docs/LICENSE_REGISTER.md, колонка modified описує обрізку, зсув і квантування;
  * збирає пробну мапу public/maps/trial/home-interior.tmj (27×10, тайли 32 px) за docs/LAYOUT_RULES.md:
    три кімнати вздовж задньої стіни — вітальня (диван спинкою до стіни, журнальний столик перед ним,
    картина над диваном, торшер, книжкова полиця), кухня-їдальня (стільниця з верхніми полицями, кавоваркою
    й дошкою, стіл на 4 стільці), спальня (двоспальне ліжко узголів'ям до стіни з двома тумбами, шафа,
    письмовий стіл із ноутбуком). Перегородки — колонки «верху стіни» з прорізом на лінії підлоги; двері
    стоять на лінії підлоги; вікна великі (2–3 тайли). Кожна кімната й кожні меблі — прямокутник у шарі
    об'єктів `layout`, який перевіряє сторож розкладки (scripts/maps/checks.mjs, коди LAYOUT_*);
  * --preview — склеює шари в PNG для ока (--grid — із сіткою тайлів); --check — лише перевірити, що файли
    в репозиторії збігаються зі збіркою байт у байт.

Мапа лежить у підтеці trial/: валідатор мап читає підтеки (npm run validate --dir public/maps), а тест GAME-32
(src/view/world/map-content.test.ts) бере лише public/maps/*.tmj — мапа в гру ще не підключена.

Сторож палітри (scripts/palette/check.py, допуск 0, docs/PALETTE-GUARD.md): кожен піксель із alpha > 0 кожного
PNG в assets/ мусить бути з 519 кольорів основи. Ціна хибно-червоного — один прогін quantize.py і погляд на
результат (хвилини); ціна хибно-зеленого при допуску > 0 — змішані набори в грі (закон 5). Нові файли тут
квантовані, тому для них сторож зелений; мутація «чужий піксель у копії файлу» мусить дати FAIL.

Чого в наборах НЕМАЄ в сучасному стилі (лишено порожнім, а не змішано): телевізор (The Office має лише
3×2-тайловий екран ≈ 2,7 м — завеликий для вітальні), холодильник (прибрано після рецензії PR #65 як чужий),
кухонна мийка й плита (у Base Object Kit — лише кам'яний таз із помпою та чавунна піч), килим-доріжка.

Шари мапи (знизу вгору): ground (підлога) · decor (порожній: сцена малює його ПІД walls) · walls (колізії:
стіна, верх перегородок, опора меблів) · above (вікна, двері, картина, верхні полиці поверх стіни; верх високих
меблів; предмети на стільниці та столі) · objects (точка появи) · layout (кімнати й меблі для сторожа).
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'palette'))
from check import load_palette  # noqa: E402
from quantize import quantize  # noqa: E402

T = 32
W, H = 27, 10
PACK = os.path.join(ROOT, 'research/packs')
MAP = os.path.join(ROOT, 'public/maps/trial/home-interior.tmj')
OUT = os.path.join(ROOT, 'assets/tiles')

KIT = 'pack-lpc-base-object-kit/pack/Objects'
WD = 'pack-lpc-windows-doors/pack/lpc-windows-doors-v2/windows-doors.png'
OFFICE = 'pack-lpc-office/pack'

# Вирізка: (джерело, (sx, sy, w, h) у px, (dx, dy) у px на полотні). Один файл — одне першоджерело — одна ліцензія.
# Полотна описані в тайлах; нижче кожна вирізка підписана тим, що з неї береться.
SHEETS = [
    # [LPC] Walls, CC-BY-SA 3.0. Стовпці 0–2: світло-блакитна стіна 3×3 (лівий край, середина, правий край; рядки:
    # верх, площина, плінтус). Стовпець 3: верх перегородки кремовий — рядок 0 верхній торець, 1 середина, 2 нижній.
    ('home-walls', 'home_walls.png', (4, 3), [
        ('pack-lpc-walls/pack/lpc-walls/walls.png', (0, 1024, 96, 96), (0, 0)),
        ('pack-lpc-walls/pack/lpc-walls/walls.png', (96, 448, 32, 96), (96, 0)),
    ]),
    # [LPC] Floors, CC-BY-SA 4.0. (0,0) дубова дошка (8,38); (1,0) кремова плитка з ромбами (3,51) — кухня.
    ('home-floor', 'home_floor.png', (2, 1), [
        ('pack-lpc-floors/pack/lpc-floors/floors.png', (256, 1216, 32, 32), (0, 0)),
        ('pack-lpc-floors/pack/lpc-floors/floors.png', (96, 1632, 32, 32), (32, 0)),
    ]),
    # LPC Windows & Doors, CC-BY-SA 3.0. Стовпці 0–1: біле вікно 2 тайли завширшки, 44 px заввишки (аркуш: x 16–80 px,
    # рядки 3–5 — у джерелі воно зсунуте на півтайла, тому вирізка з x=16; ширших білих вікон у наборі немає, широке
    # вікно вітальні складено з двох поруч); стовпець 2, рядки 0–1: білі двері (18, 18–19), опущені на 16 px, щоб
    # стояти на лінії підлоги (у джерелі полотно 48 px високе й притиснуте до верху клітинки — так двері «висіли» в PR #65).
    ('home-windows-doors', 'home_windows_doors.png', (3, 3), [
        (WD, (16, 96, 64, 96), (0, 0)),
        (WD, (576, 576, 32, 64), (64, 16)),
    ]),
    # [LPC Revised] Base Object Kit, CC-BY-SA 3.0 — меблі (полотно 14×3 тайли):
    # ст. 0: вазон 1×3 · ст. 1–2 р. 0: диван 2×1 синій · (1,1) стілець обличчям, (2,1) стілець спинкою ·
    # ст. 1–2 р. 2: журнальний столик 2×1 · ст. 3–4: ліжко 2×3 (узголів'я + подушки + матрац) · ст. 5: шафа 1×3 ·
    # ст. 6–7 р. 0: накритий обідній стіл 2×1 · (6,2) тумба · (7,2) настінна полиця · ст. 8–10 р. 0–1: стільниця 3×2 ·
    # (8,2) пляшки, (9,2) дошка з зеленню · ст. 11 р. 0–1: торшер 1×2 (аркуш Lighting стовпець 1, рядки 1–2; рядок 0 там —
    # окремий абажур, не частина торшера — через нього в v2 лампа мала два абажури) · ст. 12–13 р. 0: картина 2×1.
    ('home-furniture', 'home_furniture.png', (14, 3), [
        (f'{KIT}/Decoration/Planters.png', (64, 0, 32, 96), (0, 0)),
        (f'{KIT}/Furniture/Sofas, Casual.png', (128, 32, 64, 32), (32, 0)),
        (f'{KIT}/Furniture/Chairs, Dining.png', (256, 288, 32, 32), (32, 32)),
        (f'{KIT}/Furniture/Chairs, Dining.png', (256, 256, 32, 32), (64, 32)),
        (f'{KIT}/Furniture/Tables.png', (0, 32, 64, 32), (32, 64)),
        (f'{KIT}/Furniture/Beds, Double Headboards.png', (0, 224, 64, 32), (96, 0)),
        (f'{KIT}/Furniture/Beds, Double.png', (256, 64, 64, 64), (96, 32)),
        (f'{KIT}/Furniture/Beds, Double.png', (256, 0, 64, 32), (96, 6)),
        (f'{KIT}/Storage/Cabinets.png', (0, 0, 32, 96), (160, 0)),
        (f'{KIT}/Furniture/Tables.png', (32, 96, 64, 32), (192, 0)),
        (f'{KIT}/Storage/Cabinets.png', (128, 0, 32, 32), (192, 64)),
        (f'{KIT}/Storage/Cabinets.png', (128, 64, 32, 32), (224, 64)),
        (f'{KIT}/Furniture/Countertops.png', (96, 128, 96, 64), (256, 0)),
        (f'{KIT}/Decoration/Clutter.png', (160, 64, 32, 32), (256, 64)),
        (f'{KIT}/Decoration/Clutter.png', (96, 64, 32, 32), (288, 64)),
        (f'{KIT}/Lighting & Fire/Lighting.png', (32, 32, 32, 64), (352, 0)),
        (f'{KIT}/Decoration/Paintings.png', (192, 0, 64, 32), (384, 0)),
    ]),
    # [LPC Revised] The Office, OGA-BY 3.0: ст. 0–2: письмовий стіл 3×2 (Desk, Ornate рядки 2–3); (3,0) ноутбук;
    # (3,1) кавоварка.
    ('home-office', 'home_office.png', (4, 2), [
        (f'{OFFICE}/Desk, Ornate.png', (0, 64, 96, 64), (0, 0)),
        (f'{OFFICE}/Laptop.png', (96, 0, 32, 32), (96, 0)),
        (f'{OFFICE}/Coffee Maker.png', (0, 0, 32, 32), (96, 32)),
    ]),
    # LPC Shelves Rework, CC-BY-SA 3.0: книжкова полиця 2×3.
    ('home-shelf', 'home_shelf.png', (2, 3), [
        ('pack-lpc-shelves/bookshelf-brown_0.png', (0, 0, 64, 96), (0, 0)),
    ]),
]


def compose(size_tiles, parts):
    sheet = Image.new('RGBA', (size_tiles[0] * T, size_tiles[1] * T))
    for src, box, at in parts:
        x, y, w, h = box
        sheet.alpha_composite(Image.open(os.path.join(PACK, src)).convert('RGBA').crop((x, y, x + w, y + h)), at)
    return sheet


def build_sheets(workdir):
    """Вирізки → квантування на палітру основи → assets/tiles/home_*.png. Повертає {ім'я: шлях}."""
    _, palette = load_palette(os.path.join(ROOT, 'art/palette/lpc.json'))
    os.makedirs(OUT, exist_ok=True)
    out = {}
    for name, fname, size, parts in SHEETS:
        raw = os.path.join(workdir, f'raw-{fname}')
        compose(size, parts).save(raw)
        dst = os.path.join(OUT, fname)
        quantize(raw, dst, palette)
        out[name] = dst
    return out


class Grid:
    def __init__(self, sheets):
        self.layers = {n: [0] * (W * H) for n in ('ground', 'decor', 'walls', 'above')}
        self.first, self.cols, self.images = {}, {}, {}
        gid = 1
        for name, _, (cols, rows), _ in SHEETS:
            self.first[name], self.cols[name] = gid, cols
            self.images[name] = Image.open(sheets[name]).convert('RGBA')
            gid += cols * rows
        self.tilesets = [{'firstgid': self.first[n], 'name': n, 'image': f'../../../assets/tiles/{f}',
                          'imagewidth': c * T, 'imageheight': r * T, 'tilewidth': T, 'tileheight': T,
                          'margin': 0, 'spacing': 0, 'columns': c, 'tilecount': c * r}
                         for n, f, (c, r), _ in SHEETS]

    def tile_img(self, gid):
        name = max(self.first, key=lambda n: self.first[n] if self.first[n] <= gid else -1)
        idx = gid - self.first[name]
        cols = self.cols[name]
        x, y = (idx % cols) * T, (idx // cols) * T
        return self.images[name].crop((x, y, x + T, y + T))

    def put(self, layer, c, r, tile):
        name, tc, tr = tile
        rows = self.images[name].height // T
        if not (0 <= tc < self.cols[name] and 0 <= tr < rows):
            # Валідатор мап цього не зловить: gid за межею тайлсету потрапляє в НАСТУПНИЙ тайлсет і виглядає законним.
            raise ValueError(f'{name}: тайл ({tc},{tr}) поза аркушем {self.cols[name]}×{rows}')
        gid = self.first[name] + tr * self.cols[name] + tc
        if not (0 <= c < W and 0 <= r < H):
            raise ValueError(f'({c},{r}) поза мапою')
        if self.tile_img(gid).getchannel('A').getbbox() is None:
            return                                                          # порожній тайл не блокує клітинку
        self.layers[layer][r * W + c] = gid

    def stamp(self, name, sc, sr, w, h, c, r, solid_rows):
        """Шматок w×h тайлів з (sc, sr) тайлсету → мапа з лівим верхнім кутом (c, r).
        solid_rows — рядки шматка (j), що стають опорою (walls, колізія); решта — above (без колізії)."""
        for j in range(h):
            for i in range(w):
                self.put('walls' if j in solid_rows else 'above', c + i, r + j, (name, sc + i, sr + j))


FLOOR_OAK, FLOOR_TILE = ('home-floor', 0, 0), ('home-floor', 1, 0)
WALL = lambda c, r: ('home-walls', c, r)  # noqa: E731
TOP_CAP, TOP_MID, TOP_END = WALL(3, 0), WALL(3, 1), WALL(3, 2)
F = 'home-furniture'

# Кімнати (x0, ширина) у тайлах; перегородки — колонки між ними; підлога — рядки 3–9; проріз — рядок 5.
LIVING, KITCHEN, BEDROOM = (0, 10), (11, 7), (19, 8)
PARTITIONS = (10, 18)
DOORWAY_ROW = 5
FLOOR_ROW = 3


def build_grid(sheets):
    g = Grid(sheets)
    layout = []  # прямокутники шару layout: (type, name, x, y, w, h)

    def item(kind, name, x, y, w=1, h=1):
        layout.append((kind, name, x, y, w, h))

    # Підлога: дуб у вітальні й спальні, плитка на кухні; під перегородками — дуб (торці прозорі по кутах).
    for r in range(FLOOR_ROW, H):
        for c in range(W):
            g.put('ground', c, r, FLOOR_TILE if KITCHEN[0] <= c < KITCHEN[0] + KITCHEN[1] else FLOOR_OAK)
    # Задня стіна: 3 ряди (верх, площина, плінтус); крайні стовпці — краї блоку.
    for c in range(W):
        sc = 0 if c == 0 else 2 if c == W - 1 else 1
        for r in range(3):
            g.put('walls', c, r, WALL(sc, r))
    # Перегородки: верх стіни колонкою від задньої стіни до низу, проріз у рядку DOORWAY_ROW (1 тайл ≈ 0,9 м).
    for x in PARTITIONS:
        for r in range(H):
            if r == DOORWAY_ROW:
                item('doorway', f'doorway.{x}', x, r)
                continue
            tile = TOP_END if r in (DOORWAY_ROW - 1, H - 1) else TOP_CAP if r == DOORWAY_ROW + 1 else TOP_MID
            g.put('walls', x, r, tile)
    for (x0, w), name in zip((LIVING, KITCHEN, BEDROOM), ('living', 'kitchen', 'bedroom')):
        layout.append(('room', name, x0, 0, w, H))

    # ---- Вітальня (x 0–9): диван під картиною, торшер біля дивана, широке вікно з двох, двері, книжкова полиця;
    #      журнальний столик перед диваном на відстані кроку.
    WIN = ('home-windows-doors', 0, 0, 2, 3)
    g.stamp(F, 1, 0, 2, 1, 0, 3, {0});                 item('sofa', 'sofa', 0, 3, 2, 1)
    g.stamp(F, 12, 0, 2, 1, 0, 1, set());              item('painting', 'painting.river', 0, 1, 2, 1)
    g.stamp(F, 11, 0, 1, 2, 2, 2, {1});                item('lamp', 'lamp.floor', 2, 3)
    g.stamp(*WIN, 3, 0, set()); g.stamp(*WIN, 5, 0, set()); item('window', 'window.living', 3, 0, 4, 3)
    g.stamp('home-windows-doors', 2, 0, 1, 2, 7, 1, set()); item('door', 'door.front', 7, 1, 1, 2)
    g.stamp('home-shelf', 0, 0, 2, 3, 8, 1, {2});      item('shelf', 'bookshelf', 8, 3, 2, 1)
    g.stamp(F, 1, 2, 2, 1, 0, 5, {0});                 item('coffee_table', 'coffee', 0, 5, 2, 1)

    # ---- Кухня-їдальня (x 11–17): стільниця з полицями над нею, пляшки, дошка й кавоварка на ній; вікно; вазон;
    #      обідній стіл 2×1 на чотирьох із стільцями з двох боків.
    g.stamp(F, 8, 0, 3, 2, 11, 2, {1});                item('counter', 'counter', 11, 3, 3, 1)
    g.put('above', 11, 1, (F, 7, 2)); g.put('above', 12, 1, (F, 7, 2)); item('wall_shelf', 'shelf.kitchen', 11, 1, 2, 1)
    g.put('above', 11, 2, (F, 8, 2))                                     # пляшки на стільниці
    g.put('above', 12, 2, (F, 9, 2))                                     # дошка з зеленню
    g.put('above', 13, 2, ('home-office', 3, 1))                         # кавоварка
    g.stamp(*WIN, 15, 0, set());                       item('window', 'window.kitchen', 15, 0, 2, 3)
    g.stamp(F, 0, 0, 1, 3, 17, 1, {2});                item('plant', 'plant.kitchen', 17, 3)
    g.stamp(F, 6, 0, 2, 1, 14, 5, {0});                item('table', 'table.dining', 14, 5, 2, 1)
    for c in (14, 15):
        g.put('walls', c, 4, (F, 1, 1)); item('chair', f'chair.n{c}', c, 4)   # обличчям до столу (видно спереду)
        g.put('walls', c, 6, (F, 2, 1)); item('chair', f'chair.s{c}', c, 6)   # спиною до гравця

    # ---- Спальня (x 19–26): шафа, тумба, ліжко узголів'ям до стіни під вікном, тумба, письмовий стіл з ноутбуком.
    g.stamp(F, 5, 0, 1, 3, 19, 1, {2});                item('wardrobe', 'wardrobe', 19, 3)
    g.put('walls', 20, 3, (F, 6, 2));                  item('nightstand', 'nightstand.w', 20, 3)
    g.stamp(F, 3, 0, 2, 3, 21, 3, {0, 1, 2});          item('bed', 'bed.double', 21, 3, 2, 3)
    g.stamp(*WIN, 21, 0, set());                       item('window', 'window.bedroom', 21, 0, 2, 3)
    g.put('walls', 23, 3, (F, 6, 2));                  item('nightstand', 'nightstand.e', 23, 3)
    g.stamp('home-office', 0, 0, 3, 2, 24, 2, {1});    item('desk', 'desk', 24, 3, 3, 1)
    g.put('above', 25, 2, ('home-office', 3, 0))                         # ноутбук на столі
    g.put('walls', 25, 4, (F, 2, 1));                  item('chair', 'chair.desk', 25, 4)

    walls = g.layers['walls']
    for name, c, r in (('spawn', 7, 4), ('перед диваном', 0, 4), ('прохід у кухню', 10, 5), ('прохід у спальню', 18, 5),
                       ('біля ліжка ліворуч', 20, 4), ('біля ліжка праворуч', 23, 4), ('перед стільницею', 12, 4)):
        assert not walls[r * W + c], f'{name} у клітинці ({c},{r}) замуровано'
    return g, layout


def objects():
    return [{'id': 1, 'name': 's.home', 'type': 'spawn', 'x': 7 * T + 16, 'y': 4 * T + 16, 'width': 0, 'height': 0,
             'point': True, 'rotation': 0, 'visible': True}]


def layout_objects(layout):
    out = []
    for n, (kind, name, x, y, w, h) in enumerate(layout, start=10):
        o = {'id': n, 'name': name, 'type': kind, 'x': x * T, 'y': y * T, 'width': w * T, 'height': h * T, 'rotation': 0, 'visible': True}
        if kind == 'room':
            o['properties'] = [{'name': 'room', 'type': 'string', 'value': name}]
        out.append(o)
    return out


def tile_layer(i, name, data, props=None):
    layer = {'id': i, 'name': name, 'type': 'tilelayer', 'width': W, 'height': H, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'data': data}
    if props:
        layer['properties'] = props
    return layer


def tmj(g, layout):
    return {
        'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'width': W, 'height': H, 'tilewidth': T, 'tileheight': T, 'infinite': False, 'nextlayerid': 7, 'nextobjectid': 10 + len(layout),
        'layers': [
            tile_layer(1, 'ground', g.layers['ground']),
            tile_layer(2, 'decor', g.layers['decor']),
            tile_layer(3, 'walls', g.layers['walls'], [{'name': 'collides', 'type': 'bool', 'value': True}]),
            tile_layer(4, 'above', g.layers['above']),
            {'id': 5, 'name': 'objects', 'type': 'objectgroup', 'draworder': 'topdown', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0, 'objects': objects()},
            {'id': 6, 'name': 'layout', 'type': 'objectgroup', 'draworder': 'topdown', 'opacity': 1, 'visible': False, 'x': 0, 'y': 0, 'objects': layout_objects(layout)},
        ],
        'tilesets': g.tilesets,
        'properties': [{'name': 'locationId', 'type': 'string', 'value': 'loc.home.les-tilleuls'},
                       {'name': 'trial', 'type': 'string', 'value': 'GAME-146: проба набору, у гру не підключено'}],
    }


def preview(g, path, grid=False, scale=1):
    im = Image.new('RGBA', (W * T, H * T), (24, 24, 24, 255))
    for name in ('ground', 'decor', 'walls', 'above'):
        for k, gid in enumerate(g.layers[name]):
            if gid:
                im.alpha_composite(g.tile_img(gid), ((k % W) * T, (k // W) * T))
    if scale != 1:
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    if grid:
        from PIL import ImageDraw
        d = ImageDraw.Draw(im)
        s = T * scale
        for c in range(W + 1):
            d.line([(c * s, 0), (c * s, im.height)], fill=(255, 255, 255, 70))
        for r in range(H + 1):
            d.line([(0, r * s), (im.width, r * s)], fill=(255, 255, 255, 70))
        for c in range(W):
            d.text((c * s + 2, 1), str(c), fill=(255, 255, 0, 255))
        for r in range(H):
            d.text((2, r * s + 1), str(r), fill=(255, 255, 0, 255))
    im.save(path)


def main(argv):
    import tempfile
    check = '--check' in argv
    with tempfile.TemporaryDirectory() as work:
        if check:
            # Будуємо в тимчасову теку й порівнюємо байти з тим, що в репозиторії.
            global OUT, MAP
            real_out, real_map = OUT, MAP
            OUT, MAP = os.path.join(work, 'tiles'), os.path.join(work, 'home-interior.tmj')
        sheets = build_sheets(work)
        g, layout = build_grid(sheets)
        os.makedirs(os.path.dirname(MAP), exist_ok=True)
        text = json.dumps(tmj(g, layout), ensure_ascii=False, indent=1) + '\n'
        with open(MAP, 'w', encoding='utf-8') as f:
            f.write(text)
        if '--preview' in argv:
            preview(g, argv[argv.index('--preview') + 1], grid='--grid' in argv, scale=2 if '--x2' in argv else 1)
        if check:
            bad = []
            # Відсутній закомічений файл — чистий FAIL із назвою, а не traceback (рецензія PR #65).
            pairs = [(os.path.join(OUT, f), os.path.join(real_out, f), f'assets/tiles/{f}') for _, f, *_ in SHEETS]
            pairs.append((MAP, real_map, 'public/maps/trial/home-interior.tmj'))
            for built, committed, label in pairs:
                if not os.path.isfile(committed):
                    bad.append(f'{label} (відсутній)')
                elif open(built, 'rb').read() != open(committed, 'rb').read():
                    bad.append(label)
            if bad:
                print('home-interior: FAIL — відрізняються від збірки: ' + ', '.join(bad))
                return 1
            print(f'home-interior: PASS — {len(SHEETS)} PNG і мапа збігаються зі збіркою')
            return 0
    print(f'home-interior: записано {len(SHEETS)} PNG у assets/tiles/ і {os.path.relpath(MAP, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
