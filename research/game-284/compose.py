#!/usr/bin/env python3
"""GAME-284: пробна сцена Мюллерталя з нових аркушів, 2x: research/game-284/scene-390x844.png і scene-932x430.png."""
import os
import random
from PIL import Image
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
A = lambda n: Image.open(os.path.join(R, 'assets/tiles', n)).convert('RGBA')
S, O, M = A('ch2_muellerthal.png'), A('ch2_objects.png'), A('ch2_monument.png')
def cut(im, r):
    c = im.crop((r[0], r[1], r[0] + r[2], r[1] + r[3])); return c.crop(c.getchannel('A').getbbox())
grass = S.crop((576 + 32, 288 + 32, 576 + 64, 288 + 64)); sand = S.crop((192 + 32, 288 + 32, 192 + 64, 288 + 64))
stone = S.crop((32, 288 + 32, 64, 288 + 64)); pond = S.crop((384 + 32, 288 + 32, 384 + 64, 288 + 64))
W, H = 480, 440
w = Image.new('RGBA', (W, H))
for y in range(0, H, 32):
    for x in range(0, W, 32): w.paste(grass, (x, y))
for x in range(160, 320, 32):                       # стежка з пісковика
    for y in range(250, H, 32): w.paste(sand, (x, y))
def put(im, x, y): w.alpha_composite(im, (x - im.width // 2, y - im.height))   # низ предмета в точці
cliff, big, wf = cut(S, (170, 10, 80, 135)), cut(S, (95, 140, 195, 135)), cut(S, (384, 0, 96, 160))
put(big, 110, 190); put(cliff, 40, 190); put(cliff, 420, 195); put(cut(S, (15, 15, 70, 125)), 470, 200)
put(wf, 250, 170)
for x in range(224, 288, 32):
    for y in (170, 202): w.paste(pond, (x, y))
rnd = random.Random(7)
pine, trunk, bush = cut(S, (0, 480, 96, 100)), cut(S, (64, 608, 48, 80)), cut(S, (0, 384, 96, 90))
for x, y in [(40, 300), (430, 310), (60, 400), (440, 420), (20, 240), (470, 250)]:
    put(trunk, x, y + 8); put(pine, x, y - 24)
for x, y in [(120, 330), (380, 360), (100, 430)]: put(bush, x, y)
put(cut(S, (480, 0, 64, 32)), 330, 330); put(cut(S, (480, 0, 64, 32)), 150, 270)
for i, x in enumerate([200, 215, 300, 312, 190]): put(cut(O, ((i % 3) * 32, 0, 32, 32)), x, 380 + (i * 7) % 20)
put(cut(O, (96, 0, 32, 32)), 270, 360)
put(M.crop(M.getchannel('A').getbbox()), 250, 330)
hero = 47
for i in range(2): w.paste((220, 40, 40, 255), (330 + i * 6, 400 - hero, 334 + i * 6, 400)) if i == 0 else None   # лінійка: дорослий ≈ 47 px
os.makedirs(os.path.join(R, 'research/game-284'), exist_ok=True)
for name, (vw, vh) in {'scene-390x844.png': (195, 422), 'scene-932x430.png': (466, 215)}.items():
    cx, cy = (W - vw) // 2, H - vh
    w.crop((cx, cy, cx + vw, cy + vh)).resize((vw * 2, vh * 2), Image.NEAREST).convert('RGB').save(os.path.join(R, 'research/game-284', name))
w.convert('RGB').resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(R, 'research/game-284/scene-full.png'))
