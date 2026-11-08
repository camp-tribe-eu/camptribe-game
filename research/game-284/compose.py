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


grass = S.crop((576 + 32, 288 + 32, 576 + 64, 288 + 64)); sand = S.crop((192 + 32, 288 + 32, 192 + 64, 288 + 64))
water = ATL.crop((320, 448, 352, 480))
W, H, PXM = 480, 440, 28
ground = Image.new('RGBA', (W, H))
for y in range(0, H, 32):
    for x in range(0, W, 32): ground.paste(grass, (x, y))
for x in range(160, 320, 32):
    for y in range(256, H, 32): ground.paste(sand, (x, y))
POND = (176, 170, 304, 234)                                  # вода: нижче підніжжя водоспаду, «внизу»
for x in range(POND[0], POND[2], 32):
    for y in range(POND[1], POND[3], 32): ground.paste(water, (x, y))

cliff, wf = cut(S, (170, 10, 80, 135)), cut(S, (384, 25, 96, 135))      # водоспад обрізано до висоти скель: вода тече зі краю скелі вниз
bush = shrink(cut(S, (0, 384, 96, 90)), 0.5)
rock, pebble = cut(S, (480, 0, 36, 32)), cut(S, (518, 2, 20, 14))
pine, trunk = cut(S, (0, 480, 96, 100)), cut(S, (64, 608, 48, 80))
tree = Image.new('RGBA', (96, pine.height + 40)); tree.alpha_composite(trunk, ((96 - trunk.width) // 2, tree.height - trunk.height)); tree.alpha_composite(pine, ((96 - pine.width) // 2, 0))
tree = tree.crop(tree.getchannel('A').getbbox())
mon = M.crop(M.getchannel('A').getbbox())
person = Image.new('RGBA', (14, 47), (110, 110, 120, 255))   # лінійка: дорослий ≈ 1,7 м ≈ 47 px
orch = [cut(O, (i * 32, 0, 32, 32)) for i in range(3)]
bottle = cut(O, (96, 0, 32, 32))
# (id, kind, спрайт, x центр бази, y база, слід [w,h], твердий, справжня висота м)
P = [
    ('cliff-l', 'cliff', cliff, 150, 170, [80, 14], True, None), ('cliff-r', 'cliff', cliff, 330, 170, [80, 14], True, None),
    ('waterfall', 'waterfall', wf, 240, 170, [96, 6], False, None),
    ('pine-1', 'tree', tree, 40, 330, [14, 8], True, 4.5), ('pine-2', 'tree', tree, 440, 340, [14, 8], True, 4.5), ('pine-3', 'tree', tree, 60, 245, [14, 8], True, 4.5),
    ('pine-4', 'tree', tree, 430, 250, [14, 8], True, 4.5),
    ('bush-1', 'bush', bush, 110, 330, [36, 10], True, 1.6), ('bush-2', 'bush', bush, 380, 360, [36, 10], True, 1.6),
    ('rock-1', 'rock', rock, 150, 345, [26, 8], True, 1.0), ('rock-2', 'rock', rock, 350, 300, [26, 8], True, 1.0),
    ('pebble-1', 'pebble', pebble, 140, 300, [10, 4], False, None),
    ('monument', 'monument', mon, 240, 330, [mon.width - 6, 14], True, 2.5),
    ('orchid-1', 'orchid', orch[0], 190, 395, [6, 3], False, 0.46), ('orchid-2', 'orchid', orch[1], 205, 400, [6, 3], False, 0.46), ('orchid-3', 'orchid', orch[2], 300, 398, [6, 3], False, 0.46),
    ('bottle', 'bottle', bottle, 272, 372, [6, 3], False, 0.46), ('person', 'person', person, 215, 372, [10, 6], False, 1.7),
]
objs = []
for i, (n, k, im, x, y, ft, solid, rh) in enumerate(sorted(P, key=lambda p: (p[4], p[3]))):   # y-sort: нижче на екрані = пізніше = поверх
    o = {'id': n, 'kind': k, 'x': x, 'y': y, 'w': im.width, 'h': im.height, 'foot': ft, 'solid': solid, 'z': i}
    if rh: o['real_h_m'] = rh
    objs.append(o)
objs.append({'id': 'pond', 'kind': 'water', 'x': (POND[0] + POND[2]) // 2, 'y': POND[3], 'w': POND[2] - POND[0], 'h': POND[3] - POND[1],
             'foot': [POND[2] - POND[0], POND[3] - POND[1]], 'solid': False, 'water': True})
json.dump({'px_per_m': PXM, 'objects': objs}, open(os.path.join(R, 'research/game-284/layout.json'), 'w'), indent=1, ensure_ascii=False)
img = {p[0]: p[2] for p in P}
w = ground.copy()
for o in sorted([o for o in objs if not o.get('water')], key=lambda o: o['z']):
    im = img[o['id']]; w.alpha_composite(im, (o['x'] - im.width // 2, o['y'] - im.height))
for name, (vw, vh) in {'scene-390x844.png': (195, 422), 'scene-932x430.png': (466, 215)}.items():
    cx, cy = (W - vw) // 2, H - vh
    w.crop((cx, cy, cx + vw, cy + vh)).resize((vw * 2, vh * 2), Image.NEAREST).convert('RGB').save(os.path.join(R, 'research/game-284', name))
w.convert('RGB').resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(R, 'research/game-284/scene-full.png'))
print('layout.json:', len(objs), 'об\'єктів')
