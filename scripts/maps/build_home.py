#!/usr/bin/env python3
"""GAME-175 · збирає мапи дня 1 «на мапі, а не в панелі»: public/maps/home.tmj (дім + двір з авто) і public/maps/shop.tmj (крамниця).

    python3 scripts/maps/build_home.py [--preview-dir DIR] [--check]

Лише наявна графіка LPC (OD-013): інтер'єр дому — з проби public/maps/trial/home-interior.tmj (GAME-146, тайлсети home-*), двір —
тайли трави/стежки/кущів з terrain_atlas (як у camp-lake), авто — camp_car.png (малюється сценою спрайтом, лише для гравця на авто).
Нових картинок немає. Цілі дій — об'єкти типу trigger у шарі `objects`; їхні імена — єдина мова між мапою й сюжетом:
  step.<квест>        — завершити крок сюжету руками (CompleteQuest)
  pack.<річ>          — покласти в багажник / дістати з нього (PackItem / UnpackItem)
  take.<річ>          — взяти з полиці (Pickup)
  obj.vehicle         — сісти в авто / на велосипед і їхати далі (Visit)
  obj.trunk           — відкрити багажник (сітка пакування GAME-109)
Дім зберігає шар `layout` проби: правила розкладки (GAME-146) далі перевіряє валідатор мап.
"""
import json
import os
import random
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
T = 32
TRIAL = os.path.join(ROOT, 'public/maps/trial/home-interior.tmj')
OUT = {'home': os.path.join(ROOT, 'public/maps/home.tmj'), 'shop': os.path.join(ROOT, 'public/maps/shop.tmj'), 'road': os.path.join(ROOT, 'public/maps/road.tmj')}

# Тайлсети: ім'я в сцені (art.ts), файл від public/maps/, колонок, тайлів, firstgid.
HOME_TS = [
    ('home-walls', '../../assets/tiles/home_walls.png', 4, 12, 1, 128, 96),
    ('home-floor', '../../assets/tiles/home_floor.png', 2, 2, 13, 64, 32),
    ('home-windows-doors', '../../assets/tiles/home_windows_doors.png', 3, 9, 15, 96, 96),
    ('home-furniture', '../../assets/tiles/home_furniture.png', 14, 42, 24, 448, 96),
    ('home-office', '../../assets/tiles/home_office.png', 4, 8, 66, 128, 64),
    ('home-shelf', '../../assets/tiles/home_shelf.png', 2, 6, 74, 64, 96),
]
YARD_TS = [
    ('lpc-terrain', '../../assets/tiles/terrain_atlas.png', 32, 1024, 1025, 1024, 1024),
    ('camp-car', '../../assets/tiles/camp_car.png', 4, 8, 2049, 128, 64),
]
GRASS = [182, 183, 184]      # terrain_atlas (672|704|736, 160): трава, як у camp-lake
DIRT = 181                   # стежка (640, 160)
BUSH = [473, 474, 475]       # кущі (768.., 384): нижня кромка двору, як у camp-lake


def tmj_tilesets(extra):
    out = []
    for name, img, cols, count, first, w, h in extra:
        out.append({'firstgid': first, 'name': name, 'image': img, 'imagewidth': w, 'imageheight': h, 'tilewidth': T, 'tileheight': T,
                    'margin': 0, 'spacing': 0, 'columns': cols, 'tilecount': count})
    return out


def terrain(gid):
    """gid terrain_atlas у camp-lake (firstgid 1) → gid у цій мапі (firstgid 1025)."""
    return gid - 1 + 1025


def blank_layers(w, h):
    return {n: [0] * (w * h) for n in ('ground', 'decor', 'walls', 'above')}


def put(layers, w, h, name, c, r, gid):
    if 0 <= c < w and 0 <= r < h:
        layers[name][r * w + c] = gid


def yard(layers, w, h, top, gap, seed):
    """Двір: рядок `top` — низ будинку з проходом `gap` (колонки), далі трава до кущів у нижньому рядку; стежка від проходу вбік."""
    rnd = random.Random(seed)
    for r in range(top, h):
        for c in range(w):
            put(layers, w, h, 'ground', c, r, terrain(rnd.choice(GRASS)))
    for c in range(w):
        if c not in gap:
            put(layers, w, h, 'walls', c, top, 10)          # home-walls: тайл стіни з плінтусом
        else:
            put(layers, w, h, 'ground', c, top, terrain(DIRT))
    for r in range(top + 1, top + 3):
        for c in gap:
            put(layers, w, h, 'ground', c, r, terrain(DIRT))
    for c in range(w):
        if c >= min(gap):
            put(layers, w, h, 'ground', c, top + 3, terrain(DIRT))   # під'їзд: стежка вздовж двору
    for c in range(w):
        put(layers, w, h, 'walls', c, h - 1, terrain(BUSH[c % 3]))


def tile_layer(i, name, w, h, data, collides=False):
    layer = {'id': i, 'name': name, 'type': 'tilelayer', 'width': w, 'height': h, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'data': data}
    if collides:
        layer['properties'] = [{'name': 'collides', 'type': 'bool', 'value': True}]
    return layer


def point(i, name, typ, cell):
    c, r = cell
    return {'id': i, 'name': name, 'type': typ, 'x': c * T + T // 2, 'y': r * T + T // 2, 'width': 0, 'height': 0, 'point': True, 'rotation': 0, 'visible': True}


# ---------------------------------------------------------------- дім
# Клітинки (колонка, рядок). Кухня — c 11..17, вітальня — c 0..9, спальня — c 19..26; двір — рядки 11..14.
HOME_SPOTS = [
    ('s.start', 'spawn', (7, 4)),
    ('s.car', 'spawn', (11, 12)),
    ('step.PROLOGUE-HOME-001', 'trigger', (16, 5)),   # стіл на кухні: карта, телефон із прогнозом, аркуш «Одна вільна ніч»
    ('step.ST-001', 'trigger', (5, 4)),               # вітальня, під вікном: «озирнись удома»
    ('step.ST-002', 'trigger', (24, 4)),              # спальня, письмовий стіл із ноутбуком: «обери кемпінг»
    ('pack.item.tent', 'trigger', (2, 7)),
    ('pack.item.mia-carrier', 'trigger', (6, 7)),
    ('pack.item.lantern', 'trigger', (9, 5)),
    ('pack.item.lantern-3', 'trigger', (8, 9)),
    ('pack.item.big-cushion', 'trigger', (1, 9)),
    ('pack.item.water', 'trigger', (12, 4)),
    ('pack.item.snacks', 'trigger', (12, 7)),
    ('pack.item.simple-dinner', 'trigger', (16, 7)),
    ('pack.item.mia-bowl-food', 'trigger', (15, 9)),
    ('pack.item.lantern-2', 'trigger', (12, 9)),
    ('pack.item.sleeping-bag', 'trigger', (20, 6)),
    ('pack.item.mia-blanket', 'trigger', (23, 8)),
    ('npc.george', 'npc', (3, 9)),
    ('obj.vehicle', 'trigger', (13, 12)),
    ('obj.trunk', 'trigger', (16, 14)),
    # GAME-183 · решта дому на мапі: справи хвилі W1 «Виїзд о шостій» (task.<справа>), кроки поза основним шляхом, мотузка для сушіння й приймальня. Клітинки ≥ 2 від інших цілей.
    ('task.mia-carrier', 'trigger', (3, 5)),          # вітальня: Мія в переноску
    ('task.map-to-luggage', 'trigger', (14, 7)),      # кухня: карту — в багаж
    ('task.lights-window', 'trigger', (7, 5)),        # вітальня, під вікном: вимкнути світло, зачинити вікно
    ('task.anna-goodbye', 'trigger', (4, 11)),        # двір: попрощатись із сусідкою Анною
    ('step.ST-004', 'trigger', (6, 9)),               # поріг: «У дорогу» (якщо повернувся додому посеред дороги)
    ('step.CH1-D3-HOME-001', 'trigger', (6, 9)),      # поріг: кінець розділу — «Знову вдома»
    ('obj.drying', 'trigger', (8, 13)),               # двір: мотузка (висушити мокре спорядження)
    ('obj.sell', 'trigger', (10, 14)),                # двір: продати спорядження
]


def build_home():
    base = json.load(open(TRIAL, encoding='utf8'))
    W, H = 27, 16
    by = {l['name']: l for l in base['layers']}
    layers = blank_layers(W, H)
    for n in layers:
        layers[n][:27 * 10] = by[n]['data']
    yard(layers, W, H, 10, (6, 7), 11)
    # Ground у верхніх рядках проби порожній (там стіна) — лишаємо як є. Тайли terrain у walls/ground — gid із firstgid 1025.
    objs = [point(i + 1, n, t, c) for i, (n, t, c) in enumerate(HOME_SPOTS)]
    layout = next(l for l in base['layers'] if l['name'] == 'layout')
    layout = dict(layout, id=6)
    return {
        'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'width': W, 'height': H, 'tilewidth': T, 'tileheight': T, 'infinite': False, 'nextlayerid': 8, 'nextobjectid': 40,
        'layers': [tile_layer(1, 'ground', W, H, layers['ground']), tile_layer(2, 'decor', W, H, layers['decor']),
                   tile_layer(3, 'walls', W, H, layers['walls'], True), tile_layer(4, 'above', W, H, layers['above']),
                   {'id': 5, 'name': 'objects', 'type': 'objectgroup', 'draworder': 'topdown', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0, 'objects': objs}, layout],
        'tilesets': tmj_tilesets(HOME_TS + YARD_TS),
        'properties': [{'name': 'locationId', 'type': 'string', 'value': 'loc.home'}],
    }


# ---------------------------------------------------------------- крамниця
# GAME-204 · інтер'єр невеликої європейської крамниці туристичного спорядження за research/refs/NOTES.md (outdoor-shop, shop-checkout):
# 14×12 клітинок, підлога 12×7 (≈ 14×8 м), стіни з усіх боків (LPC home_walls, як у домі), у передній стіні — скляні двері й два вітринні вікна,
# за стінами — темрява. Задня стіна: панелі з рюкзаками + суцільна лінія настінних полиць (спальники | газ | ліхтарі). Зал: гондола з двох рядів
# «спина до спини» (спальники / газ і кухня + ліхтарі), стійки взуття й вудок біля лівої стіни, виставковий намет на малому трав'яному килимку
# (3×2) під вікном, каса біля входу з Lotte за прилавком і холодильник напоїв поруч. Проходи — по 2 клітинки.
# Графіка — assets/tiles/shop_gear.png (GAME-204, scripts/assets/build_shop_gear.py).
_LAY = json.load(open(os.path.join(ROOT, 'art/shop_gear_layout.json')))   # пише scripts/assets/build_shop_gear.py (клітинки = розмір спрайта у справжньому масштабі, OD-026)
SHOP_TS = [
    ('home-walls', '../../assets/tiles/home_walls.png', 4, 12, 1, 128, 96),
    ('home-floor', '../../assets/tiles/home_floor.png', 2, 2, 13, 64, 32),
    ('home-windows-doors', '../../assets/tiles/home_windows_doors.png', 3, 9, 15, 96, 96),
    ('shop-gear', '../../assets/tiles/shop_gear.png', 11, _LAY['cols'] * _LAY['rows'], 24, 352, 32 * _LAY['rows']),
]
GEAR0, GEAR_COLS = 24, _LAY['cols']                    # firstgid і ширина аркуша shop_gear
GEAR = {n: tuple(v) for n, v in _LAY['cells'].items()}  # предмет → (колонка, рядок, ширина, висота) у аркуші, у тайлах
SHOP_W, SHOP_H = 14, 12
SHOP_SPOTS = [
    ('s.start', 'spawn', (6, 8)),
    ('s.car', 'spawn', (7, 8)),
    ('take.item.tent', 'trigger', (4, 8)),            # збоку від намету на килимку, під вікном
    ('take.item.sleeping-bag', 'trigger', (3, 4)),    # у проході перед настінними полицями зі спальниками
    ('take.item.lantern', 'trigger', (11, 4)),        # у проході перед настінними полицями з ліхтарями
    ('step.ST-003', 'trigger', (12, 9)),              # збоку каси з боку покупця (не за прилавком)
    ('npc.cashier', 'npc', (10, 6)),                  # Lotte ЗА прилавком (прилавок у рядках 7–8), обличчям до входу. Говорити — з (11,6)
    ('obj.vehicle', 'trigger', (7, 10)),              # у дверях: вийти до авто (велосипеда) і їхати далі
    ('obj.buy', 'trigger', (10, 9)),                  # GAME-183: каса — купити чи продати; покупець стоїть перед нею
    ('obj.drying', 'trigger', (4, 9)),                # біля входу: мотузка для сушіння
]


def gear(layers, W, H, name, c0, r0, solid=True, wall=False):
    """Ставить предмет аркуша shop_gear, лівий верхній тайл — (c0, r0). Рядки в задній стіні (< 3) — лише поверх стіни (above); нижче —
    колізія (walls), а верхній рядок предмета ще й в above (голова предмета поверх героя, що проходить позаду)."""
    sc, sr, w, h = GEAR[name]
    for dr in range(h):
        for dc in range(w):
            g = GEAR0 + (sr + dr) * GEAR_COLS + sc + dc
            r = r0 + dr
            if r < 3 or wall:
                put(layers, W, H, 'above', c0 + dc, r, g)
            elif solid:
                put(layers, W, H, 'walls', c0 + dc, r, g)
                if dr == 0 or r == 3:
                    put(layers, W, H, 'above', c0 + dc, r, g)
            else:
                put(layers, W, H, 'decor', c0 + dc, r, g)


def build_shop():
    W, H = SHOP_W, SHOP_H
    layers = blank_layers(W, H)
    last = W - 1
    for c in range(W):                                    # задня стіна (рядки 0–2) і передня (рядки 10–11): кути й середина, як у домі
        for r, row in ((0, (1, 2, 3)), (1, (5, 6, 7)), (2, (9, 10, 11)), (10, (5, 6, 7)), (11, (9, 10, 11))):
            put(layers, W, H, 'walls', c, r, row[0] if c == 0 else row[2] if c == last else row[1])
    for r in range(3, 10):                                # бічні стіни: товстий верх стіни з дому (тайл 8)
        put(layers, W, H, 'walls', 0, r, 8)
        put(layers, W, H, 'walls', last, r, 8)
        for c in range(1, last):
            put(layers, W, H, 'ground', c, r, 13)         # дубова підлога
    rnd = random.Random(204)
    for r in (8, 9):
        for c in (1, 2, 3):
            put(layers, W, H, 'ground', c, r, terrain(rnd.choice(GRASS)))   # малий трав'яний килимок під виставковим наметом (ref17)
    for c in (6, 7):                                      # прохід у дверях
        for r in (10, 11):
            put(layers, W, H, 'walls', c, r, 0)
            put(layers, W, H, 'ground', c, r, 6 if r == 10 else 10)   # стіна за дверима, щоб поруч із полотном не просвічувала темрява
    gear(layers, W, H, 'shop-door', 6, 10, solid=False)
    for c0 in (2, 10):                                    # два вітринні вікна у передній стіні (без верхнього карниза: він лише на підлозі)
        for dr, row in ((0, (18, 19)), (1, (21, 22))):
            for dc, g in enumerate(row):
                put(layers, W, H, 'above', c0 + dc, 10 + dr, g)
    # задня стіна: суцільний ряд рюкзаків (панелі 2×2) і під ним полиці по відділах — спальники | газ | ліхтарі
    for c in range(1, last, 2):
        gear(layers, W, H, 'backpack-wall', c, 1)
    for c in range(1, 5):
        gear(layers, W, H, 'sleeping-bags', c, 3)
    for c in range(5, 9):
        gear(layers, W, H, 'gas-shelf', c, 3)
    for c in range(9, last):
        gear(layers, W, H, 'lantern-display', c, 3)
    # біля лівої стіни: взуття й вудки
    gear(layers, W, H, 'boots-rack', 1, 4)
    gear(layers, W, H, 'boots-rack', 2, 4)
    gear(layers, W, H, 'rods-rack', 1, 6)
    # гондола зі спини до спини (рядки 6–7): північний бік — спальники, південний — газ і кухня, ліхтарі
    for c in range(5, 10):
        gear(layers, W, H, 'sleeping-bags', c, 6)
    for c in range(5, 8):
        gear(layers, W, H, 'gas-shelf', c, 7)
    for c in (8, 9):
        gear(layers, W, H, 'lantern-display', c, 7)
    # виставка намету на килимку, каса біля входу, холодильник поруч
    gear(layers, W, H, 'dome-tent', 1, 8)
    gear(layers, W, H, 'checkout', 10, 7)                 # прилавок у рядках 7–8; Lotte за ним, у рядку 6
    gear(layers, W, H, 'fridge', 12, 7)
    objs = [point(i + 1, n, t, c) for i, (n, t, c) in enumerate(SHOP_SPOTS)]
    return {
        'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'width': W, 'height': H, 'tilewidth': T, 'tileheight': T, 'infinite': False, 'nextlayerid': 7, 'nextobjectid': 20,
        'layers': [tile_layer(1, 'ground', W, H, layers['ground']), tile_layer(2, 'decor', W, H, layers['decor']),
                   tile_layer(3, 'walls', W, H, layers['walls'], True), tile_layer(4, 'above', W, H, layers['above']),
                   {'id': 5, 'name': 'objects', 'type': 'objectgroup', 'draworder': 'topdown', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0, 'objects': objs}],
        'tilesets': tmj_tilesets(SHOP_TS + YARD_TS),
        'properties': [{'name': 'locationId', 'type': 'string', 'value': 'loc.shop'}],
    }


# ---------------------------------------------------------------- дорога
# GAME-183 · смуга-сцена «дорога»: герой їде/йде зліва направо, три зупинки зі справами хвилі, крок «У дорогу» і авто в кінці смуги (їхати далі). Лише наявні тайли terrain
# (трава, стежка, кущі) і авто camp_car — нових картинок немає.
ROAD_SPOTS = [
    ('s.start', 'spawn', (1, 5)),
    ('s.car', 'spawn', (2, 6)),
    ('task.fix-luggage', 'trigger', (6, 3)),          # зупинка 1 (авто): поправити багаж / (велосипед) заклеїти колесо
    ('task.patch-tyre', 'trigger', (6, 3)),
    ('task.mia-water-blanket', 'trigger', (12, 3)),   # зупинка 2: вода для Мії / чохли на сумки
    ('task.bag-covers', 'trigger', (12, 3)),
    ('task.check-route', 'trigger', (19, 3)),         # зупинка 3: звірити маршрут / обрати шлях
    ('task.pick-path', 'trigger', (19, 3)),
    ('step.ST-004', 'trigger', (23, 6)),              # кінець дороги: «У дорогу» і подальші кроки
    ('step.ST-005', 'trigger', (23, 6)),
    ('step.CH1-D3-RETURN-001', 'trigger', (23, 6)),
    ('step.CH1-D3-HOME-001', 'trigger', (23, 6)),
    ('obj.drying', 'trigger', (12, 7)),
    ('obj.sell', 'trigger', (16, 7)),
    ('obj.vehicle', 'trigger', (27, 5)),              # авто (велосипед) — їхати далі
]


def build_road():
    W, H = 30, 10
    rnd = random.Random(23)
    layers = blank_layers(W, H)
    for r in range(H):
        for c in range(W):
            put(layers, W, H, 'ground', c, r, terrain(rnd.choice(GRASS)))
    for r in (4, 5):
        for c in range(W):
            put(layers, W, H, 'ground', c, r, terrain(DIRT))      # стежка-дорога через усю смугу
    for c in range(W):
        put(layers, W, H, 'walls', c, 0, terrain(BUSH[c % 3]))    # живопліт зверху й знизу
        put(layers, W, H, 'walls', c, H - 1, terrain(BUSH[(c + 1) % 3]))
    objs = [point(i + 1, n, t, c) for i, (n, t, c) in enumerate(ROAD_SPOTS)]
    return {
        'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'width': W, 'height': H, 'tilewidth': T, 'tileheight': T, 'infinite': False, 'nextlayerid': 7, 'nextobjectid': 30,
        'layers': [tile_layer(1, 'ground', W, H, layers['ground']), tile_layer(2, 'decor', W, H, layers['decor']),
                   tile_layer(3, 'walls', W, H, layers['walls'], True), tile_layer(4, 'above', W, H, layers['above']),
                   {'id': 5, 'name': 'objects', 'type': 'objectgroup', 'draworder': 'topdown', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0, 'objects': objs}],
        'tilesets': tmj_tilesets(HOME_TS + YARD_TS),
        'properties': [{'name': 'locationId', 'type': 'string', 'value': 'loc.road'}],
    }


def main(argv):
    maps = {'home': build_home(), 'shop': build_shop(), 'road': build_road()}
    bad = False
    for name, m in maps.items():
        text = json.dumps(m, indent=1, ensure_ascii=False) + '\n'
        if '--check' in argv:
            same = os.path.exists(OUT[name]) and open(OUT[name], encoding='utf8').read() == text
            print(f'{name}.tmj: ' + ('збігається' if same else 'ВІДРІЗНЯЄТЬСЯ від генератора'))
            bad = bad or not same
        else:
            with open(OUT[name], 'w', encoding='utf8') as f:
                f.write(text)
            print(f'{OUT[name]}: {m["width"]}x{m["height"]}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
