#!/usr/bin/env python3
"""GAME-284: пробна сцена Мюллерталя за правилами гри: y-sort за базою, предмети стоять на землі, сліди твердих не перетинаються,
розміри за 28 px/м (GAME-222). Пише layout.json (його перевіряє scripts/art/check_placement.py) і знімки 2x.

    python3 research/game-284/compose.py
"""
import json
import os
import sys
import tempfile
from PIL import Image
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(R, 'scripts', 'palette'))
from check import load_palette  # noqa: E402
from quantize import quantize  # noqa: E402
A = lambda n: Image.open(os.path.join(R, 'assets/tiles', n)).convert('RGBA')
S, O, M, ATL = A('ch2_muellerthal.png'), A('ch2_objects.png'), A('ch2_monument.png'), A('base_out_atlas.png')


def cut(im, r):
    c = im.crop((r[0], r[1], r[0] + r[2], r[1] + r[3]))
    return c.crop(c.getchannel('A').getbbox())


def shrink(im, k):
    """Зменшення BOX із поверненням на палітру основи (кущ LPC 3 м завширшки задалеко для куща; 0,5x ≈ 1,7 м)."""
    sm = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)
    with tempfile.TemporaryDirectory() as wd:
        sm.save(os.path.join(wd, 'a.png'))
        quantize(os.path.join(wd, 'a.png'), os.path.join(wd, 'b.png'), load_palette(os.path.join(R, 'art/palette/lpc.json'))[1])
        return Image.open(os.path.join(wd, 'b.png')).convert('RGBA')


T7 = Image.open(os.path.join(R, 'research/packs/pack-lpc-terrains/pack/lpc-terrains/terrain-v7.png')).convert('RGBA')
grass = S.crop((576 + 32, 288 + 32, 576 + 64, 288 + 64)); sand = S.crop((192 + 32, 288 + 32, 192 + 64, 288 + 64))
meadow = [T7.crop((608 + i * 32, 1824, 640 + i * 32, 1856)) for i in range(3)]      # LPC Terrains: трава з польовими квітами
dark = [T7.crop((704 + i * 32, 1824, 736 + i * 32, 1856)) for i in range(3)]         # трава темніша (під деревами)
pond_blk = S.crop((384, 288, 480, 384))                                              # ставок із берегом і травою (LPC Terrains, 96x96)
W, H, PXM = 480, 440, 28
import random
rnd = random.Random(11)
MEADOW = [(96, 352, 160, 384), (320, 288, 384, 352)]                                 # лука біля каменів: тут ростуть орхідеї
ground = Image.new('RGBA', (W, H))
for y in range(0, H, 32):
    for x in range(0, W, 32):
        in_m = any(a <= x < c and b <= y < d for a, b, c, d in MEADOW)
        on_path = 160 <= x < 320 and y >= 288
        t = rnd.choice(meadow) if in_m or (not on_path and rnd.random() < 0.07) else grass       # польові квіти розсипом і купками біля каменів
        ground.paste(t, (x, y))
for x in range(160, 320, 32):
    for y in range(288, H, 32): ground.paste(sand, (x, y))
PX0, PY0 = 192, 178
ground.paste(pond_blk, (PX0, PY0), pond_blk)
POND = (PX0 + 17, PY0 + 14, PX0 + 80, PY0 + 80)                                      # власне вода (без берега)

cliff = cut(S, (170, 10, 80, 135))
tan = cliff.crop((24, 12, 56, 44)); face = cliff.crop((24, 85, 56, 117))
wall = Image.new('RGBA', (224, 135))                                                   # 320 px: суцільний уступ скелі, тут же «спечені» верхній потік, верхній падіння й полиця
for i in range(7):
    wall.paste(tan, (i * 32, 0)); wall.paste(tan, (i * 32, 18)); wall.paste(face, (i * 32, 50)); wall.paste(face, (i * 32, 82)); wall.paste(face, (i * 32, 103))
wall = wall.crop((0, 0, 224, 135))
ledge = Image.new('RGBA', (96, 10)); [ledge.paste(tan.crop((0, 0, 32, 10)), (i * 32, 0)) for i in range(3)]
wall.paste(ledge, (64, 70))                                             # полиця пісковика посередині падіння (x світу 192..288 -> x стіни 112..208)
up = cut(S, (384, 60, 96, 22)); wall.alpha_composite(up, (64, 48))
strm = Image.new('RGBA', (64, 24)); [strm.paste(ATL.crop((320, 448, 352, 472)), (i * 32, 0)) for i in range(2)]
wall.alpha_composite(strm, (80, 26))                                                  # потік по верху скелі веде до краю
wf = cut(S, (384, 105, 96, 55))                                                        # нижнє падіння від полиці (y=150) у басейн, із бризками
bush = shrink(cut(S, (0, 384, 96, 90)), 0.5)
thicket = shrink(cut(S, (0, 384, 96, 90)), 0.7)
fern = shrink(cut(S, (0, 384, 96, 90)), 0.3)
rock = cut(S, (480, 0, 33, 32)); pebble = cut(S, (518, 2, 20, 14))
pine, trunk = cut(S, (0, 480, 96, 100)), cut(S, (64, 608, 48, 80))
tree = Image.new('RGBA', (96, pine.height + 40)); tree.alpha_composite(trunk, ((96 - trunk.width) // 2, tree.height - trunk.height)); tree.alpha_composite(pine, ((96 - pine.width) // 2, 0))
tree = tree.crop(tree.getchannel('A').getbbox())
young = shrink(tree, 0.7)                                                              # молодий смерековий підлісок ≈ 3 м
log = cut(S, (72, 612, 18, 56)).rotate(90, expand=True)                                # повалений стовбур
mon = M.crop(M.getchannel('A').getbbox())
orch = [cut(O, (i * 32, 0, 32, 32)) for i in range(3)]
bottle = cut(O, (96, 0, 32, 32))
# (id, kind, спрайт, x центр бази, y база, слід [w,h], твердий, справжня висота м); рівний y — за порядком у списку (стіна раніше за нижнє падіння)
P = [
    ('cliff-l', 'cliff', cliff, 88, 190, [80, 14], True, None), ('cliff-wall', 'cliff', wall, 240, 190, [224, 14], True, None), ('cliff-r', 'cliff', cliff, 392, 190, [80, 14], True, None),
    ('waterfall', 'waterfall', wf, 240, 190, [96, 6], False, None),
    ('pine-1', 'tree', tree, 40, 330, [14, 8], True, 4.5), ('pine-2', 'tree', tree, 440, 340, [14, 8], True, 4.5), ('pine-3', 'tree', tree, 60, 245, [14, 8], True, 4.5),
    ('pine-4', 'tree', tree, 430, 250, [14, 8], True, 4.5), ('pine-5', 'tree', tree, 28, 140, [14, 8], True, 4.5), ('pine-6', 'tree', tree, 452, 150, [14, 8], True, 4.5),
    ('pine-7', 'tree', tree, 20, 420, [14, 8], True, 4.5), ('pine-8', 'tree', tree, 462, 425, [14, 8], True, 4.5),
    ('young-1', 'tree', young, 112, 262, [10, 6], True, 3.0), ('young-2', 'tree', young, 372, 276, [10, 6], True, 3.0), ('young-3', 'tree', young, 140, 425, [10, 6], True, 3.0),
    ('young-4', 'tree', young, 345, 428, [10, 6], True, 3.0), ('young-5', 'tree', young, 90, 200, [10, 6], True, 3.0), ('young-6', 'tree', young, 395, 210, [10, 6], True, 3.0),
    ('bush-1', 'bush', bush, 80, 345, [36, 10], True, 1.6), ('bush-2', 'bush', bush, 395, 375, [36, 10], True, 1.6),
    ('thicket-1', 'bush', thicket, 62, 395, [48, 10], True, None), ('thicket-2', 'bush', thicket, 425, 300, [48, 10], True, None), ('thicket-3', 'bush', thicket, 140, 214, [48, 10], True, None),
    ('rock-1', 'rock', rock, 125, 350, [26, 8], True, 1.0), ('rock-2', 'rock', rock, 350, 325, [26, 8], True, 1.0),
    ('rock-pool-l', 'rock', rock, 184, 272, [26, 8], True, 1.0), ('rock-pool-r', 'rock', rock, 300, 270, [26, 8], True, 1.0),
    ('pebble-pool-1', 'pebble', pebble, 226, 267, [10, 4], False, None), ('pebble-pool-2', 'pebble', pebble, 262, 266, [10, 4], False, None),
    ('log', 'log', log, 335, 238, [log.width - 4, 8], True, None),
    ('monument', 'monument', mon, 240, 330, [mon.width - 6, 14], True, 2.5),
    ('orchid-1', 'orchid', orch[0], 110, 372, [6, 3], False, 0.46), ('orchid-2', 'orchid', orch[1], 126, 378, [6, 3], False, 0.46), ('orchid-3', 'orchid', orch[2], 345, 305, [6, 3], False, 0.46),
    ('bottle', 'bottle', bottle, 212, 336, [6, 3], False, 0.46),
]
VIEW = [0, 0, W, H]
sys.path.insert(0, os.path.join(R, 'scripts', 'art'))
import check_placement as cp  # noqa: E402
def mk(n, k, im, x, y, ft, solid, rh):
    o = {'id': n, 'kind': k, 'x': x, 'y': y, 'w': im.width, 'h': im.height, 'foot': ft, 'solid': solid}
    if rh: o['real_h_m'] = rh
    return o
water_o = {'id': 'pond', 'kind': 'water', 'x': (POND[0] + POND[2]) // 2, 'y': POND[3], 'w': POND[2] - POND[0] + 24, 'h': POND[3] - POND[1] + 24,
           'foot': [POND[2] - POND[0], POND[3] - POND[1]], 'solid': False, 'water': True}
for i in range(80):                                                                   # підлісок і дрібниця там, де вікно 96x96 порожнє (правило «без порожнечі»)
    lay = {'view': VIEW, 'objects': [mk(*p[:1], p[1], p[2], *p[3:]) for p in P] + [water_o]}
    ep = cp.empty_patches(lay)
    if not ep: break
    px, py = ep[0]; x, y = px + 48, py + 80
    if POND[0] - 12 <= x <= POND[2] + 12 and POND[1] - 12 <= y <= POND[3] + 12: y = POND[3] + 14
    on_path = 160 <= x < 320 and y >= 288
    P.append((f'fill-{i}', 'pebble' if on_path else 'fern', pebble if on_path else fern, x, min(y, H - 2), [8, 4], False, None))
objs = []
for i, (n, k, im, x, y, ft, solid, rh) in enumerate(sorted(P, key=lambda p: (p[4], p[3]))):   # y-sort: нижче на екрані = пізніше = поверх
    o = {'id': n, 'kind': k, 'x': x, 'y': y, 'w': im.width, 'h': im.height, 'foot': ft, 'solid': solid, 'z': i}
    if rh: o['real_h_m'] = rh
    objs.append(o)
objs.append(water_o)
json.dump({'px_per_m': PXM, 'view': VIEW, 'objects': objs}, open(os.path.join(R, 'research/game-284/layout.json'), 'w'), indent=1, ensure_ascii=False)
img = {p[0]: p[2] for p in P}
w = ground.copy()
for o in sorted([o for o in objs if not o.get('water')], key=lambda o: o['z']):
    im = img[o['id']]; w.alpha_composite(im, (o['x'] - im.width // 2, o['y'] - im.height))
for name, (vw, vh) in {'scene-390x844.png': (195, 422), 'scene-932x430.png': (466, 215)}.items():
    cx, cy = (W - vw) // 2, H - vh
    w.crop((cx, cy, cx + vw, cy + vh)).resize((vw * 2, vh * 2), Image.NEAREST).convert('RGB').save(os.path.join(R, 'research/game-284', name))
w.convert('RGB').resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(R, 'research/game-284/scene-full.png'))
print('layout.json:', len(objs), 'об\'єктів')
