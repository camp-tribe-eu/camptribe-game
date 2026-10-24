#!/usr/bin/env python3
"""GAME-146 · перший сучасний набір LPC: інтер'єр дому Les Tilleuls (Намюр) з наборів OGA у research/packs/.

    python3 scripts/assets/build_home_interior.py [--preview out.png] [--check]

Що робить:
  * вирізає з першоджерел (research/packs/pack-lpc-*) лише потрібні тайли і доводить їх до палітри основи
    (scripts/palette/quantize.py, art/palette/lpc.json): один PNG на одне джерело, бо сторож ліцензій тримає
    «файл → рівно один рядок реєстру → одна ліцензія». Усе — похідні файли: рядки в assets/CREDITS.csv і
    docs/LICENSE_REGISTER.md, колонка modified описує обрізку й квантування;
  * збирає пробну мапу public/maps/trial/home-interior.tmj (14×10, тайли 32 px): підлога, стіна з вікнами й
    дверима, кухня (шафа, стіл, стільці, кавоварка, ноутбук), вітальня (диван, полиця, картина, вазон),
    спальня (ліжко). Мапа лежить у підтеці trial/: валідатор мап читає підтеки (npm run validate
    --dir public/maps), а тест GAME-32 (src/view/world/map-content.test.ts) бере лише public/maps/*.tmj — він
    вимагає тайлсети сцени й NPC контенту, а ця мапа в гру ще не підключена;
  * --preview — склеює шари в PNG для ока; --check — лише перевірити, що файли збігаються байт у байт.

Сторож палітри (scripts/palette/check.py, допуск 0, docs/PALETTE-GUARD.md): кожен піксель із alpha > 0 кожного
PNG в assets/ мусить бути з 519 кольорів основи. Ціна хибно-червоного — один прогін quantize.py і погляд на
результат (хвилини); ціна хибно-зеленого при допуску > 0 — змішані набори в грі (закон 5). Нові файли тут
квантовані, тому для них сторож зелений; мутація «чужий піксель у копії файлу» мусить дати FAIL.

Шари мапи (знизу вгору): ground (підлога) · decor (порожній: сцена малює його ПІД walls, тож на стіну він не
ляже) · walls (колізії: стіна, меблі) · above (вікна, двері, картина поверх стіни; верх меблів; предмети на
столі) · objects (точка появи).
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
W, H = 14, 10
PACK = os.path.join(ROOT, 'research/packs')
MAP = os.path.join(ROOT, 'public/maps/trial/home-interior.tmj')
OUT = os.path.join(ROOT, 'assets/tiles')

# Похідні PNG: ім'я тайлсету → (файл у assets/tiles/, джерело, список вирізок (sx, sy, w, h, dx, dy) у px,
# розмір полотна (w, h) у px). Один файл — одне першоджерело — одна ліцензія.
SHEETS = [
    ('home-walls', 'home_walls.png', 'pack-lpc-walls/pack/lpc-walls/walls.png',
     [(0, 1024, 96, 96, 0, 0)], (96, 96)),                                   # світло-блакитна стіна 3×3 (ряди 32–34)
    ('home-floor', 'home_floor.png', 'pack-lpc-floors/pack/lpc-floors/floors.png',
     [(256, 1216, 32, 32, 0, 0)], (32, 32)),                                 # дубова дошка (8,38)
    ('home-windows-doors', 'home_windows_doors.png', 'pack-lpc-windows-doors/pack/lpc-windows-doors-v2/windows-doors.png',
     [(352, 288, 32, 64, 0, 0), (576, 512, 32, 64, 32, 0)], (64, 64)),       # вікно зі шторою (11,9–10), білі двері (18,16–17)
    ('home-furniture', 'home_furniture.png', None,
     [], (192, 96)),                                                         # складається нижче з кількох аркушів набору
    ('home-office', 'home_office.png', None, [], (128, 64)),
    ('home-shelf', 'home_shelf.png', 'pack-lpc-shelves/bookshelf-brown_0.png',
     [(0, 0, 64, 96, 0, 0)], (64, 96)),                                      # книжкова полиця 2×3
]
# Холодильник із [LPC] Simple Modern Furniture прибрано після рецензії PR #65: без темного контуру LPC і світла
# зліва-згори він виглядав чужим (правило гармонії CLAUDE.md). Замість нього — висока шафа з того ж Base Object Kit.
KIT = 'pack-lpc-base-object-kit/pack/Objects'
# Меблі з [LPC Revised] Base Object Kit (одна сторінка OGA → один файл), полотно 6×3 тайли:
# стовпець 0 — вазон 1×3; (1–2,0) — диван 2×1 (один диван, вид спереду); (1,1) — картина; (2,1), (2,2) — два
# стільці 1×1; стовпці 3–4 — ліжко 2×3, складене з узголів'я, подушок і матраца з ковдрою; стовпець 5 — шафа 1×3.
FURNITURE = [
    (f'{KIT}/Decoration/Planters.png', (64, 0, 32, 96), (0, 0)),
    (f'{KIT}/Furniture/Sofas, Casual.png', (128, 32, 64, 32), (32, 0)),
    (f'{KIT}/Decoration/Paintings.png', (160, 0, 32, 32), (32, 32)),
    (f'{KIT}/Furniture/Chairs, Dining.png', (128, 256, 32, 32), (64, 32)),
    (f'{KIT}/Furniture/Chairs, Dining.png', (128, 288, 32, 32), (64, 64)),
    (f'{KIT}/Furniture/Beds, Double Headboards.png', (0, 224, 64, 32), (96, 0)),   # пласке узголів'я, середнє дерево
    (f'{KIT}/Furniture/Beds, Double.png', (256, 64, 64, 64), (96, 32)),             # синій матрац із ковдрою й бильцем
    (f'{KIT}/Furniture/Beds, Double.png', (256, 0, 64, 32), (96, 6)),               # сині подушки — поверх краю матраца
    (f'{KIT}/Storage/Cabinets.png', (0, 0, 32, 96), (160, 0)),                      # висока шафа з карнизом
]
# The Office (Eliza Wyatt, OGA-BY 3.0): кухонний стіл 3×2 (бежевий), ноутбук, кавоварка.
OFFICE = [
    ('pack-lpc-office/pack/Card Table.png', (0, 128, 96, 64), (0, 0)),
    ('pack-lpc-office/pack/Laptop.png', (96, 0, 32, 32), (96, 0)),
    ('pack-lpc-office/pack/Coffee Maker.png', (0, 0, 32, 32), (96, 32)),
]


def compose(canvas_size, parts):
    sheet = Image.new('RGBA', canvas_size)
    for src, box, at in parts:
        x, y, w, h = box
        sheet.alpha_composite(Image.open(os.path.join(PACK, src)).convert('RGBA').crop((x, y, x + w, y + h)), at)
    return sheet


def build_sheets(workdir):
    """Вирізки → квантування на палітру основи → assets/tiles/home_*.png. Повертає {ім'я: (шлях, cols, count)}."""
    _, palette = load_palette(os.path.join(ROOT, 'art/palette/lpc.json'))
    os.makedirs(OUT, exist_ok=True)
    out = {}
    for name, fname, src, crops, size in SHEETS:
        if name == 'home-furniture':
            sheet = compose(size, FURNITURE)
        elif name == 'home-office':
            sheet = compose(size, OFFICE)
        else:
            sheet = compose(size, [(src, (sx, sy, w, h), (dx, dy)) for sx, sy, w, h, dx, dy in crops])
        raw = os.path.join(workdir, f'raw-{fname}')
        sheet.save(raw)
        dst = os.path.join(OUT, fname)
        quantize(raw, dst, palette)
        out[name] = (dst, size[0] // T, (size[0] // T) * (size[1] // T))
    return out


# Тайл у тайлсеті — (ім'я тайлсету, стовпець, рядок).
WALL = lambda c, r: ('home-walls', c, r)  # noqa: E731
FLOOR = ('home-floor', 0, 0)
WINDOW = [('home-windows-doors', 0, 0), ('home-windows-doors', 0, 1)]
DOOR = [('home-windows-doors', 1, 0), ('home-windows-doors', 1, 1)]


class Grid:
    def __init__(self, sheets):
        self.layers = {n: [0] * (W * H) for n in ('ground', 'decor', 'walls', 'above')}
        self.first = {}
        self.cols = {}
        self.images = {}
        gid = 1
        for name, _, _, _, _ in SHEETS:
            path, cols, count = sheets[name]
            self.first[name], self.cols[name] = gid, cols
            self.images[name] = Image.open(path).convert('RGBA')
            gid += count
        self.tilesets = [{'firstgid': self.first[n], 'name': n, 'image': f'../../../assets/tiles/{f}',
                          'imagewidth': size[0], 'imageheight': size[1], 'tilewidth': T, 'tileheight': T,
                          'margin': 0, 'spacing': 0, 'columns': size[0] // T, 'tilecount': (size[0] // T) * (size[1] // T)}
                         for n, f, _, _, size in SHEETS]

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

    def stamp(self, name, sc, sr, w, h, c, r, layer_of):
        """Шматок w×h тайлів з (sc, sr) тайлсету → мапа з лівим верхнім кутом (c, r); layer_of(j) — шар рядка j."""
        for j in range(h):
            for i in range(w):
                self.put(layer_of(j), c + i, r + j, (name, sc + i, sr + j))


def build_grid(sheets):
    g = Grid(sheets)
    solid = lambda j: 'walls'  # noqa: E731
    top_above = lambda j: 'above' if j == 0 else 'walls'  # noqa: E731
    # Підлога — усюди під стіною (рядки 3–9).
    for r in range(3, H):
        for c in range(W):
            g.put('ground', c, r, FLOOR)
    # Стіна: 3 ряди (карниз, площина, плінтус), крайні стовпці — краї блоку стіни.
    for c in range(W):
        sc = 0 if c == 0 else 2 if c == W - 1 else 1
        for r in range(3):
            g.put('walls', c, r, WALL(sc, r))
    # Вікна, двері й картина — поверх стіни (шар above: decor малюється ПІД walls), без власної колізії:
    # стіна під ними вже блокує.
    for c in (3, 10):
        g.put('above', c, 1, WINDOW[0]); g.put('above', c, 2, WINDOW[1])
    g.put('above', 7, 1, DOOR[0]); g.put('above', 7, 2, DOOR[1])
    g.put('above', 8, 1, ('home-furniture', 1, 2))                          # картина
    # Кухня (ліворуч): шафа 1×3 біля стіни, стіл 3×2, стільці, кавоварка й ноутбук на столі.
    g.stamp('home-furniture', 5, 0, 1, 3, 0, 2, top_above)
    g.stamp('home-office', 0, 0, 3, 2, 1, 5, solid)
    g.put('above', 2, 5, ('home-office', 3, 1))                             # кавоварка
    g.put('above', 3, 5, ('home-office', 3, 0))                             # ноутбук
    g.put('walls', 0, 5, ('home-furniture', 2, 1))                          # стілець (спинкою до гравця)
    g.put('walls', 4, 5, ('home-furniture', 2, 2))                          # стілець (обличчям)
    # Вітальня: полиця 2×3 біля стіни, диван 2×1, вазон 1×3 у кутку.
    g.stamp('home-shelf', 0, 0, 2, 3, 5, 2, top_above)
    g.stamp('home-furniture', 1, 0, 2, 1, 8, 5, solid)
    g.stamp('home-furniture', 0, 0, 1, 3, 13, 2, top_above)
    # Спальня: ліжко 2×3 у правому нижньому куті.
    g.stamp('home-furniture', 3, 0, 2, 3, 11, 6, solid)
    walls = g.layers['walls']
    for name, c, r in (('spawn', 7, 3), ('перед диваном', 8, 7), ('біля ліжка', 10, 8), ('біля столу', 2, 7)):
        assert not walls[r * W + c], f'{name} у клітинці ({c},{r}) замуровано'
    return g


def objects():
    return [{'id': 1, 'name': 's.home', 'type': 'spawn', 'x': 7 * T + 16, 'y': 4 * T, 'width': 0, 'height': 0,
             'point': True, 'rotation': 0, 'visible': True}]


def tile_layer(i, name, data, props=None):
    layer = {'id': i, 'name': name, 'type': 'tilelayer', 'width': W, 'height': H, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'data': data}
    if props:
        layer['properties'] = props
    return layer


def tmj(g):
    return {
        'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'width': W, 'height': H, 'tilewidth': T, 'tileheight': T, 'infinite': False, 'nextlayerid': 6, 'nextobjectid': 2,
        'layers': [
            tile_layer(1, 'ground', g.layers['ground']),
            tile_layer(2, 'decor', g.layers['decor']),
            tile_layer(3, 'walls', g.layers['walls'], [{'name': 'collides', 'type': 'bool', 'value': True}]),
            tile_layer(4, 'above', g.layers['above']),
            {'id': 5, 'name': 'objects', 'type': 'objectgroup', 'draworder': 'topdown', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0, 'objects': objects()},
        ],
        'tilesets': g.tilesets,
        'properties': [{'name': 'locationId', 'type': 'string', 'value': 'loc.home.les-tilleuls'},
                       {'name': 'trial', 'type': 'string', 'value': 'GAME-146: проба набору, у гру не підключено'}],
    }


def preview(g, path):
    im = Image.new('RGBA', (W * T, H * T), (24, 24, 24, 255))
    for name in ('ground', 'decor', 'walls', 'above'):
        for k, gid in enumerate(g.layers[name]):
            if gid:
                im.alpha_composite(g.tile_img(gid), ((k % W) * T, (k // W) * T))
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
        g = build_grid(sheets)
        os.makedirs(os.path.dirname(MAP), exist_ok=True)
        text = json.dumps(tmj(g), ensure_ascii=False, indent=1) + '\n'
        with open(MAP, 'w', encoding='utf-8') as f:
            f.write(text)
        if '--preview' in argv:
            preview(g, argv[argv.index('--preview') + 1])
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
