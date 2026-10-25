#!/usr/bin/env python3
"""GAME-93 · збирає кемпінг біля озера з тайлів LPC: public/maps/camp-lake.tmj + похідні PNG реквізиту.

    python3 scripts/maps/build_camp_lake.py [--preview out.png] [--check]

Що робить:
  * assets/tiles/camp_tent.png, camp_car.png, assets/sprites/campfire.png — намет, авто й вогнище з
    research/packs/ (пробні набори GAME-68), доведені до палітри основи (scripts/palette/quantize.py);
    намет збільшено ×2 (NEAREST), авто зменшено до висоти 64 px (було ~30 % завелике, NEAREST), вогнище
    лише квантоване. Це похідні файли: рядки в assets/CREDITS.csv і docs/LICENSE_REGISTER.md;
  * public/maps/camp-lake.tmj — та сама логічна мапа, що була (20×12, ті самі заблоковані клітинки:
    рядки 0 і 11 та стовпець 10; точка появи, вогнище й Еліза в тих самих клітинках), але тайли 32 px.
    Координати об'єктів у пікселях подвоєно разом із тайлом.
  * --preview — склеює шари (без персонажів) у PNG для ока; --check — лише перевірити, що файли збігаються.

Шари мапи (знизу вгору): ground (трава, стежка, ставок) · decor (без колізій) · walls (колізії; стовбури,
намети, кущі) · above (верхівки дерев, дах намету) · objects (точки появи, тригери, NPC).
Сцена сама розбиває walls і above за «базовим» рядком об'єкта й сортує за y, тож персонаж ЗА деревом
закритий кроною, а ПЕРЕД деревом — ні (3/4).
"""
import json
import os
import random
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'palette'))
from check import load_palette  # noqa: E402
from quantize import quantize  # noqa: E402

T = 32
W, H = 20, 12
TERRAIN = os.path.join(ROOT, 'assets/tiles/terrain_atlas.png')
TENT = os.path.join(ROOT, 'assets/tiles/camp_tent.png')
CAR = os.path.join(ROOT, 'assets/tiles/camp_car.png')
FIRE = os.path.join(ROOT, 'assets/sprites/campfire.png')
MAP = os.path.join(ROOT, 'public/maps/camp-lake.tmj')
PACK = os.path.join(ROOT, 'research/packs')

# Тайлсети: (ім'я в сцені, файл від public/maps/, ширина в тайлах, кількість тайлів, firstgid).
TILESETS = [
    ('lpc-terrain', '../../assets/tiles/terrain_atlas.png', 32, 1024, 1),
    ('camp-tent', '../../assets/tiles/camp_tent.png', 3, 6, 1025),
    ('camp-car', '../../assets/tiles/camp_car.png', 4, 8, 1031),
]


def build_props(workdir):
    """Реквізит: сира заготовка → квантування на палітру основи. Повертає {шлях: PNG-байти-образ}."""
    _, palette = load_palette(os.path.join(ROOT, 'art/palette/lpc.json'))
    out = {}
    raw = os.path.join(workdir, 'raw.png')

    tent = Image.open(f'{PACK}/pack-lpc-tent/Tent_1.png').convert('RGBA')
    big = tent.resize((tent.width * 2, tent.height * 2), Image.NEAREST)          # 68×52
    sheet = Image.new('RGBA', (96, 64))
    sheet.alpha_composite(big, ((96 - big.width) // 2, 64 - big.height))
    sheet.save(raw)
    quantize(raw, TENT, palette)

    car = Image.open(f'{PACK}/pack-lpc-car/carsskorpiosall_1.png').convert('RGBA').crop((5, 352, 188, 447))
    car = car.crop(car.getchannel('A').getbbox())                                  # без порожніх країв
    h = 64
    small = car.resize((round(car.width * h / car.height), h), Image.NEAREST)      # ≈ 0,67 — було ~30 % завелике
    sheet = Image.new('RGBA', (128, 64))
    sheet.alpha_composite(small, ((128 - small.width) // 2, 0))
    sheet.save(raw)
    quantize(raw, CAR, palette)

    os.makedirs(os.path.dirname(FIRE), exist_ok=True)
    Image.open(f'{PACK}/pack-lpc-campfire/CampFireFinished.png').convert('RGBA').save(raw)
    quantize(raw, FIRE, palette)
    return out


class Grid:
    def __init__(self):
        self.layers = {n: [0] * (W * H) for n in ('ground', 'decor', 'walls', 'above')}
        self.atlas = Image.open(TERRAIN).convert('RGBA')
        self.sheets = {1: self.atlas, 1025: Image.open(TENT).convert('RGBA'), 1031: Image.open(CAR).convert('RGBA')}
        self.cols = {1: 32, 1025: 3, 1031: 4}

    def blank(self, first, ox, oy):
        """Тайл повністю прозорий — у шар не кладемо (інакше він би блокував порожню клітинку)."""
        return self.sheets[first].crop((ox, oy, ox + T, oy + T)).getchannel('A').getbbox() is None

    def put(self, layer, c, r, first, ox, oy):
        if not (0 <= c < W and 0 <= r < H) or self.blank(first, ox, oy):
            return
        gid = first + (oy // T) * self.cols[first] + ox // T
        self.layers[layer][r * W + c] = gid

    def stamp(self, first, ox, oy, w, h, c, r, mode='tree', rows=None):
        """Ставить шматок тайлсета w×h тайлів з лівим верхнім кутом (c, r).
        mode 'tree' — нижній ряд у walls (стовбур/низ), решта в above; 'solid' — усе в walls (недосяжна зона);
        rows — підмножина рядків шматка (для країв мапи: видно лише низ дерева)."""
        for j in range(h):
            if rows is not None and j not in rows:
                continue
            layer = 'walls' if mode == 'solid' or j == h - 1 else 'above'
            for i in range(w):
                self.put(layer, c + i, r + j - (min(rows) if rows else 0), first, ox + i * T, oy + j * T)


def build_grid():
    g = Grid()
    rnd = random.Random(7)
    grass = [(672, 160), (704, 160), (736, 160)]
    dirt = (640, 160)
    for r in range(H):
        for c in range(W):
            g.put('ground', c, r, 1, *rnd.choice(grass))
    for c in range(W):
        g.put('ground', c, 7, 1, *dirt)                                  # стежка (рядок 7)
    for j in range(3):                                                   # ставок (східна, недосяжна зона)
        for i in range(3):
            g.put('ground', 13 + i, 1 + j, 1, 192 + i * T, 352 + j * T)

    PINE = (1, 960, 0, 2, 5)
    BUSH = (1, 768, 384, 3, 3)
    TENT_S = (1025, 0, 0, 3, 2)
    CAR_S = (1031, 0, 0, 4, 2)

    # Верхня кромка: стовбури, крони за межею кадру (як на пробі scene-B-lpc.png).
    for c in list(range(0, 10, 2)) + list(range(12, 20, 2)):
        g.stamp(*PINE, c, 0, 'solid', rows=[4])
    # Східна стіна (стовпець 10): дерево, кущ і низ третього дерева; усе недосяжне, тож усе в walls.
    g.stamp(*PINE, 10, 0, 'solid')
    g.stamp(*PINE, 10, 8, 'solid', rows=[1, 2, 3, 4])
    g.stamp(*BUSH, 10, 5, 'solid')
    # Нижня кромка: кущі ліворуч (Еліза стоїть вище, її крона не заступає), сосни — від стежки.
    g.stamp(*BUSH, 0, 9)
    g.stamp(*BUSH, 3, 9)
    for c in (6, 8):
        g.stamp(*PINE, c, 7)
    for c in (12, 14, 16, 18):
        g.stamp(*PINE, c, 7, 'solid')
    # Два намети над вогнищем: дах — above, низ — walls (непрохідний).
    g.stamp(*TENT_S, 0, 2)
    g.stamp(*TENT_S, 5, 2)
    # Східна зона: авто й сосни.
    g.stamp(*CAR_S, 13, 5, 'solid')
    g.stamp(*PINE, 17, 1, 'solid')
    walls = g.layers['walls']
    old = {r * W + c for r in range(H) for c in range(W) if r in (0, 11) or c == 10}   # заблоковані клітинки до GAME-93
    lost = sorted(k for k in old if not walls[k])
    assert not lost, f'стіни старої мапи без колізії: {[(k % W, k // W) for k in lost]}'
    for name, c, r in (('spawn', 6, 5), ('вогнище', 3, 4), ('Еліза', 2, 8), *((n, x // 32, y // 32) for n, x, y in TASK_SPOTS)):
        assert not walls[r * W + c], f'{name} у клітинці ({c},{r}) замуровано'
    return g


# GAME-170 зріз 2 (W4 «Вечір на трьох фронтах»): цілі справ і добра справа — точки на прохідних клітинках лівої галявини.
# task.<справа> закриває справу хвилі дотиком; obj.litter — чужі пакети біля води (очерет озера починається з x=10).
# Мія (task.find-mia) — під лавкою (1,6): від вогнища (3,4) ≥ 2 клітинки, від води — 8; валідатор мап доводить досяжність пішки.
# Зріз 3, W3 «Встигнути до зливи» (день 1, приїзд): ділянка (1,4) ліворуч від вогнища, намет (4,2) між двома наметами,
# навіс (6,6) під точкою появи, авто для Мії (5,8) — від води 5+ клітинок, від вогнища 4; усі ≥ 2 клітинки від інших цілей.
TASK_SPOTS = [
    ('task.dinner', 144, 240),      # (4,7) стіл біля Елізи
    ('task.firewood', 272, 80),     # (8,2) купа дров
    ('task.find-mia', 48, 208),     # (1,6) лавка
    ('task.cover-bikes', 272, 144), # (8,4) велонавіс
    ('obj.litter', 304, 208),       # (9,6) пакети біля води
    ('task.pick-spot', 48, 144),    # (1,4) ділянка
    ('task.pitch-tent', 144, 80),   # (4,2) місце намету
    ('task.gear-shelter', 208, 208),# (6,6) навіс
    ('task.mia-car', 176, 272),     # (5,8) авто (сухе місце для Мії)
]


def objects():
    # Центри клітинок (піксель = тайл × 32 + 16 по x; по y — ноги персонажа на нижньому краї рядка-центра).
    # Було (16 px): spawn (104, 88), вогнище (56, 72), Еліза (40, 136) — подвоєно: клітинки ті самі.
    pts = [(1, 's.camp', 'spawn', 208, 176), (2, 'obj.campfire', 'trigger', 112, 144), (3, 'npc.elise', 'npc', 80, 272),
           *((4 + i, n, 'trigger', x, y) for i, (n, x, y) in enumerate(TASK_SPOTS))]
    return [{'id': i, 'name': n, 'type': t, 'x': x, 'y': y, 'width': 0, 'height': 0, 'point': True, 'rotation': 0, 'visible': True}
            for i, n, t, x, y in pts]


def tile_layer(i, name, data, props=None):
    layer = {'id': i, 'name': name, 'type': 'tilelayer', 'width': W, 'height': H, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'data': data}
    if props:
        layer['properties'] = props
    return layer


def tmj(g):
    ts = [{'firstgid': f, 'name': n, 'image': img, 'imagewidth': cols * T, 'imageheight': (count // cols) * T, 'tilewidth': T, 'tileheight': T,
           'margin': 0, 'spacing': 0, 'columns': cols, 'tilecount': count} for n, img, cols, count, f in TILESETS]
    return {
        'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'width': W, 'height': H, 'tilewidth': T, 'tileheight': T, 'infinite': False, 'nextlayerid': 7, 'nextobjectid': 4,
        'layers': [
            tile_layer(1, 'ground', g.layers['ground']),
            tile_layer(2, 'decor', g.layers['decor']),
            tile_layer(3, 'walls', g.layers['walls'], [{'name': 'collides', 'type': 'bool', 'value': True}]),
            tile_layer(4, 'above', g.layers['above']),
            {'id': 5, 'name': 'objects', 'type': 'objectgroup', 'draworder': 'topdown', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0, 'objects': objects()},
        ],
        'tilesets': ts,
        'properties': [{'name': 'locationId', 'type': 'string', 'value': 'loc.camp.lake'}],
    }


def preview(g, path):
    im = Image.new('RGBA', (W * T, H * T))
    for name in ('ground', 'decor', 'walls', 'above'):
        for k, gid in enumerate(g.layers[name]):
            if not gid:
                continue
            first = max(f for _, _, _, _, f in TILESETS if f <= gid)
            idx = gid - first
            cols = g.cols[first]
            tile = g.sheets[first].crop(((idx % cols) * T, (idx // cols) * T, (idx % cols) * T + T, (idx // cols) * T + T))
            im.alpha_composite(tile, ((k % W) * T, (k // W) * T))
    im.save(path)


def main(argv):
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        build_props(tmp)
    g = build_grid()
    text = json.dumps(tmj(g), indent=1, ensure_ascii=False) + '\n'
    if '--check' in argv:
        same = os.path.exists(MAP) and open(MAP, encoding='utf8').read() == text
        print('camp-lake.tmj: ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ від генератора'))
        return 0 if same else 1
    with open(MAP, 'w', encoding='utf8') as f:
        f.write(text)
    if '--preview' in argv:
        preview(g, argv[argv.index('--preview') + 1])
    print(f'{MAP}: {sum(1 for v in g.layers["walls"] if v)} клітинок walls, {sum(1 for v in g.layers["above"] if v)} above')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
