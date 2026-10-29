#!/usr/bin/env python3
"""GAME-93 · збирає кемпінг біля озера з тайлів LPC: public/maps/camp-lake.tmj + похідні PNG реквізиту.

    python3 scripts/maps/build_camp_lake.py [--preview out.png] [--check]

Що робить:
  * assets/tiles/camp_tent.png, camp_car.png, assets/sprites/campfire.png — намет, авто й вогнище з
    research/packs/ (пробні набори GAME-68), доведені до палітри основи (scripts/palette/quantize.py);
    намет збільшено ×2 (NEAREST), авто зменшено до висоти 64 px (було ~30 % завелике, NEAREST), вогнище
    лише квантоване. Це похідні файли: рядки в assets/CREDITS.csv і docs/LICENSE_REGISTER.md;
  * public/maps/camp-lake.tmj — GAME-93: тайли 32 px, мапа 20×12. GAME-172 «Живий кемпінг»: мапа 40×24 (×4 площі) із зонами —
    місця для наметів (старі + південна галявина), вогнище, рецепція, санітарний блок, берег із причалом, лісова стежка й галявина.
    Ліва частина (стовпці 0–9, рядки 0–11) і КОЖЕН об'єкт шару objects — у тих самих клітинках, що були; єдина зміна старої
    частини — східна стіна (стовпець 10–11) отримала прохід у рядках 5–8 (ворота), інакше решта мапи недосяжна.
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
W, H = 40, 24   # GAME-172: було 20×12 (240 клітинок) — тепер 40×24 (960, ×4)
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


PINE = (1, 960, 0, 2, 5)          # сосна 2×5: крона — above, низ стовбура — walls
BUSH = (1, 768, 384, 3, 3)
TENT_S = (1025, 0, 0, 3, 2)
CAR_S = (1031, 0, 0, 4, 2)
BOULDER = (1, 832, 672, 2, 2)     # атлас (26,21): валун 2×2
STUMP = (1, 736, 576, 1, 1)       # атлас (23,18): пень
POND = (6, 11)                    # атлас (6,11): ставок 3×3 з трав'яним берегом; розтягуємо краї → озеро будь-якого розміру
PLANK = [(512, 640), (544, 640), (576, 640)]   # атлас (16..18,20): суцільні дошки причалу

# Зони (клітинки, c0 r0 c1 r1 включно) — їх читає і сторож src/view/world/ambient.test.ts (там — прямокутники та якорі).
LAKE = (28, 1, 39, 12)
PIER_ROW = 7
PIER_COLS = (28, 33)              # настил у воді: стовпці 28..33, рядок 7
PIER_HEAD = (34, 36, 6, 8)        # майданчик на кінці: стовпці 34..36, рядки 6..8


def hut(g, c, r, w, wall_row, back):
    """Будиночок: 2 рядки даху (above — над героєм, коли той позаду) + рядок стіни (walls). wall_row — список (first, ox, oy)."""
    top = [(1, 512, 736)] + [(1, 544, 736)] * (w - 2) + [(1, 576, 736)]
    mid = [(1, 544, 768)] * w
    for i in range(w):
        g.put('above', c + i, r, *top[i])
        g.put('above', c + i, r + 1, *mid[i])
        g.put('decor', c + i, r + 2, *back)             # тло під дверима/вікнами: тайл прозорий по краях
        g.put('walls', c + i, r + 2, *wall_row[i])


def build_grid():
    g = Grid()
    rnd = random.Random(7)
    grass = [(672, 160), (704, 160), (736, 160)]
    dirt = (640, 160)
    for r in range(H):
        for c in range(W):
            g.put('ground', c, r, 1, *rnd.choice(grass))

    # Стежки (ґрунт): головна (рядок 7) від старого табору до берега, лісова стежка (2 клітинки завширшки) на південь,
    # двори перед рецепцією й санітарним блоком.
    for c in range(0, 28):
        g.put('ground', c, 7, 1, *dirt)
    for r in range(8, 21):
        for c in (18, 19):
            g.put('ground', c, r, 1, *dirt)
    for c in range(13, 18):
        g.put('ground', c, 6, 1, *dirt)
    for c in range(21, 26):
        g.put('ground', c, 6, 1, *dirt)
    for r in range(16, 21):                                              # лісова галявина (пласка ґрунтова ділянка)
        for c in range(15, 24):
            g.put('ground', c, r, 1, *dirt)

    # Озеро: ставок 3×3 розтягнуто; вода — і в ground (вигляд), і в walls (непрохідна); причал знімає walls на своїх клітинках.
    c0, r0, c1, r1 = LAKE
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            i = 0 if c == c0 else 2 if c == c1 else 1
            j = 0 if r == r0 else 2 if r == r1 else 1
            g.put('ground', c, r, 1, (POND[0] + i) * T, (POND[1] + j) * T)
            g.put('walls', c, r, 1, (POND[0] + i) * T, (POND[1] + j) * T)
    pier = [(c, PIER_ROW) for c in range(PIER_COLS[0], PIER_COLS[1] + 1)] + [(c, r) for c in range(PIER_HEAD[0], PIER_HEAD[1] + 1) for r in range(PIER_HEAD[2], PIER_HEAD[3] + 1)]
    for k, (c, r) in enumerate(pier):
        g.layers['walls'][r * W + c] = 0
        g.put('decor', c, r, 1, *PLANK[(c + r) % 3])

    # Валун на березі.
    g.stamp(*BOULDER, 26, 1, 'solid')

    # Верхня кромка: стовбури (крони за межею кадру). Стовпці 10–11 — велика сосна (східна стіна старого табору).
    for c in list(range(0, 10, 2)) + list(range(12, 40, 2)):
        g.stamp(*PINE, c, 0, 'solid', rows=[4])
    g.stamp(*PINE, 10, 0, 'solid')
    g.stamp(*BUSH, 10, 9, 'solid')                      # рядки 9–11; ворота — рядки 5–8
    # Старий південний край табору.
    g.stamp(*BUSH, 0, 9)
    g.stamp(*BUSH, 3, 9)
    for c in (6, 8):
        g.stamp(*PINE, c, 7)
    # Два старі намети над вогнищем: дах — above, низ — walls (непрохідний).
    g.stamp(*TENT_S, 0, 2)
    g.stamp(*TENT_S, 5, 2)

    # Рецепція (13..17) і санітарний блок (21..25): дах — сланець, стіна — цегла/камінь; двері й вікна — з атласу.
    BRICK = [(1, 672, 704), (1, 704, 704), (1, 736, 704), (1, 768, 704), (1, 736, 704)]
    hut(g, 13, 3, 5, [BRICK[0], (1, 416, 672), (1, 544, 672), (1, 576, 672), BRICK[3]], BRICK[1])
    STONE = [(1, 512, 832), (1, 544, 832), (1, 544, 832), (1, 544, 832), (1, 576, 832)]
    hut(g, 21, 3, 5, [STONE[0], (1, 544, 704), (1, 576, 704), STONE[3], STONE[4]], STONE[1])

    # Намети й кущі вздовж головної стежки (кемпінг не порожній між зонами).
    g.stamp(*TENT_S, 14, 9)
    g.stamp(*TENT_S, 22, 9)

    # Південна галявина наметів: два ряди наметів і авто (зліва від лісової стежки).
    for c in (1, 6, 11):
        g.stamp(*TENT_S, c, 13)
    for c in (3, 8):
        g.stamp(*TENT_S, c, 17)
    g.stamp(*CAR_S, 12, 17, 'solid')

    # Ліс: два ряди сосен (стовбури в рядках 15 і 20) із проходом для стежки (стовпці 18–19) і галявиною (стовпці 14–25, рядки 16–20).
    for c in range(20, 40, 2):
        g.stamp(*PINE, c, 11, 'tree')
    for c in range(26, 40, 2):
        g.stamp(*PINE, c, 16, 'tree')
    # Південний край: кущі в три ряди — суцільна стіна.
    for c in range(0, 40, 3):
        g.stamp(*BUSH, c, 21, 'solid')
    # Галявина: пень і валун.
    g.stamp(*STUMP, 23, 18, 'solid')
    g.stamp(*BOULDER, 15, 19, 'solid')

    walls = g.layers['walls']
    for name, c, r in (('spawn', 6, 5), ('вогнище', 3, 4), ('Еліза', 2, 8), *((n, x // 32, y // 32) for n, x, y in TASK_SPOTS)):
        assert not walls[r * W + c], f'{name} у клітинці ({c},{r}) замуровано'
    for name, c, r in ANCHORS:
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
    # Чотири цілі дня 3 (GAME-144) були дописані в .tmj руками, без генератора (і з дублями id 9–12). Порядок у файлі збережено
    # (при однаковій відстані сцена бере останній, тож порядок — частина поведінки); id тепер унікальні.
    ('task.walk-site', 112, 272),
    ('task.clean-up', 240, 144),
    ('task.pack-tent', 208, 208),
    ('task.mia-carrier-home', 176, 272),
    ('obj.litter', 304, 208),       # (9,6) пакети біля води
    ('task.pick-spot', 48, 144),    # (1,4) ділянка
    ('task.pitch-tent', 144, 80),   # (4,2) місце намету
    ('task.gear-shelter', 208, 208),# (6,6) навіс
    ('task.mia-car', 176, 272),     # (5,8) авто (сухе місце для Мії)
    # GAME-180 · цілі прохань сусідів (content/requests.json, spot = ім'я об'єкта). Клітинки прохідні, ≥ 2 клітинки одна від одної й від інших цілей,
    # не збігаються зі стоянками мешканців (ambient.ts RESIDENTS).
    ('req.nora-shore.t1', 25 * 32 + 16, 7 * 32 + 16),     # (25,7) сміття на березі
    ('req.nora-shore.t2', 26 * 32 + 16, 10 * 32 + 16),    # (26,10) сміття біля води
    ('req.nora-shore.t3', 23 * 32 + 16, 9 * 32 + 16),     # (23,9) сміття на узбіччі стежки до води
    ('req.ingrid-birds.t1', 35 * 32 + 16, 8 * 32 + 16),   # (35,8) причал: птахи здалеку (не в коридорі причалу: мешканці мусять його проходити)
    ('req.luc-chain.t1', 9 * 32 + 16, 14 * 32 + 16),      # (9,14) велосипед Люка біля південних наметів
    ('req.elise-lantern.t1', 7 * 32 + 16, 10 * 32 + 16),  # (7,10) запасний ліхтар між наметами
    ('req.sarah-snack.t1', 14 * 32 + 16, 8 * 32 + 16),    # (14,8) печиво біля рецепції
    ('req.sarah-snack.t2', 12 * 32 + 16, 5 * 32 + 16),    # (12,5) яблука в ящику
    # GAME-184 · три побічні історії табору (продовження арок сусідів, content/requests.json `after`). Клітинки прохідні, ≥ 2 клітинки від усіх цілей і стоянок мешканців.
    ('req.nora-camera.t1', 17 * 32 + 16, 3 * 32 + 16),     # (17,3) галявина: Мія лежить на Нориній камері
    ('req.ingrid-starmap.t1', 22 * 32 + 16, 4 * 32 + 16),  # (22,4) частина карти біля рецепції
    ('req.ingrid-starmap.t2', 24 * 32 + 16, 13 * 32 + 16), # (24,13) частина карти на стежці до води
    ('req.ingrid-starmap.t3', 30 * 32 + 16, 17 * 32 + 16), # (30,17) частина карти на лісовій галявині
    ('req.ingrid-starmap.t4', 2 * 32 + 16, 13 * 32 + 16),  # (2,13) четверту частину принесла Мія
    ('req.luc-radio.t1', 11 * 32 + 16, 19 * 32 + 16),      # (11,19) дроти радіо Люка
    # GAME-183 · табір без ☰: кожен крок квесту табору й дія, що була кнопкою, — об'єкт на мапі (src/content/map-first.ts MAP_SPOTS.camp; сторож camp-first.test).
    # Місця — на прохідних клітинках, ≥ 2 клітинки від інших цілей і не на стоянках мешканців (ambient.ts RESIDENTS); кроки одного місця живуть по черзі (квест активний
    # лише один), тож збігаються координатами; вогнище — ПЕРЕД кроком вогнища (при однаковій відстані сцена бере останнього: після сцени завершує вечір крок).
    ('step.ST-005', 15 * 32 + 16, 11 * 32 + 16),                # (15,11) свій намет: прибуття, табірний день, дні 3
    ('step.CH1-D2-CAMP-001', 15 * 32 + 16, 11 * 32 + 16),
    ('step.CH1-D3-001', 15 * 32 + 16, 11 * 32 + 16),
    ('step.CH1-D3-GEAR-001', 15 * 32 + 16, 11 * 32 + 16),
    ('step.CH1-D3-RETURN-001', 15 * 32 + 16, 11 * 32 + 16),
    ('step.CH1-D3-HOME-001', 15 * 32 + 16, 11 * 32 + 16),
    ('step.CH1-D2-001', 36 * 32 + 16, 6 * 32 + 16),             # (36,6) край причалу: ранок біля озера
    ('step.CH1-D2-ELISE-001', 4 * 32 + 16, 10 * 32 + 16),       # (4,10) біля Елізи: порада, велозона, прощання
    ('step.q.elise-bike-area', 4 * 32 + 16, 10 * 32 + 16),
    ('step.CH1-D3-ELISE-001', 4 * 32 + 16, 10 * 32 + 16),
    ('step.CH1-D2-FIRE-001', 3 * 32 + 16, 4 * 32 + 16),         # (3,4) вогнище (після сцени)
    ('take.item.firewood', 22 * 32 + 16, 18 * 32 + 16),         # (22,18) купа дров на лісовій галявині
    ('obj.drying', 7 * 32 + 16, 16 * 32 + 16),                  # (7,16) мотузка між південними наметами
    ('obj.sell', 16 * 32 + 16, 6 * 32 + 16),                    # (16,6) рецепція (приймальня уживаного спорядження)
    ('obj.vehicle', 16 * 32 + 16, 18 * 32 + 16),                # (16,18) стоянка: авто (велосипед) — їхати далі
]


# GAME-172: іменовані точки «готові до взаємодії» (type=anchor): сцена їх НЕ робить тригерами — наступний зріз прикріпить до них дії
# за близькістю. Клітинки прохідні й не збігаються зі стоянками мешканців; мешканці їх обходять, як і цілі взаємодії.
ANCHORS = [
    ('obj.pitch-1', 2, 16), ('obj.pitch-2', 7, 16), ('obj.pitch-3', 10, 16),   # вільні місця біля південних наметів
    ('obj.reception-desk', 16, 6), ('obj.sanitary-door', 24, 6),               # двори перед рецепцією й санітарним блоком
    ('obj.firewood-pile', 22, 18),                                             # лісова галявина, біля пенька-колоди
    ('obj.water', 27, 10), ('obj.pier-end', 36, 7),                            # доступ до води з берега й кінець причалу
]


# GAME-173/172: точки дозвілля родини (type=leisure, name leisure.<вид>.<n>, property face). Мапа їх має — тож вони мають перевагу над LEISURE_BY_MAP у leisure.ts.
# Ліва галявина (клітинки ті самі, що були в LEISURE_BY_MAP) + нові зони: лавка біля рецепції, берег біля води, лавка на лісовій галявині.
LEISURE = [
    ('leisure.campfire.1', 2, 4, 'right'), ('leisure.campfire.2', 4, 4, 'left'), ('leisure.campfire.3', 3, 5, 'up'),
    ('leisure.shore.1', 8, 9, 'right'), ('leisure.tent.1', 6, 4, 'up'), ('leisure.bench.1', 8, 6, 'left'),
    ('leisure.bench.2', 14, 7, 'up'), ('leisure.shore.2', 26, 8, 'right'), ('leisure.bench.3', 20, 18, 'right'),
]


def objects():
    # Центри клітинок (піксель = тайл × 32 + 16 по x; по y — ноги персонажа на нижньому краї рядка-центра).
    # Було (16 px): spawn (104, 88), вогнище (56, 72), Еліза (40, 136) — подвоєно: клітинки ті самі.
    pts = [(1, 's.camp', 'spawn', 208, 176), (2, 'obj.campfire', 'trigger', 112, 144), (3, 'npc.elise', 'npc', 80, 272),
           *((4 + i, n, 'trigger', x, y) for i, (n, x, y) in enumerate(TASK_SPOTS))]
    pts += [(4 + len(TASK_SPOTS) + i, n, 'anchor', c * T + 16, r * T + 16) for i, (n, c, r) in enumerate(ANCHORS)]
    base = 4 + len(TASK_SPOTS) + len(ANCHORS)
    pts += [(base + i, n, 'leisure', c * T + 16, r * T + 16) for i, (n, c, r, _f) in enumerate(LEISURE)]
    out = [{'id': i, 'name': n, 'type': t, 'x': x, 'y': y, 'width': 0, 'height': 0, 'point': True, 'rotation': 0, 'visible': True}
           for i, n, t, x, y in pts]
    for o, f in zip(out[-len(LEISURE):], (l[3] for l in LEISURE)):
        o['properties'] = [{'name': 'face', 'type': 'string', 'value': f}]
    return out


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
        'width': W, 'height': H, 'tilewidth': T, 'tileheight': T, 'infinite': False, 'nextlayerid': 7, 'nextobjectid': 4 + len(TASK_SPOTS) + len(ANCHORS) + len(LEISURE),
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
