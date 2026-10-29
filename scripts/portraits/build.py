#!/usr/bin/env python3
"""GAME-49 · портрети NPC для вікна діалогу: референси зі спрайтів, запит на FAL, постобробка.

    python3 scripts/portraits/build.py refs  OUTDIR            # референс-спрайти (кадр «вниз», x8) у OUTDIR
    python3 scripts/portraits/build.py req   OUTDIR NAME.json [id ...]   # art/requests/NAME.json (картинки data:-URI)
    python3 scripts/portraits/build.py post  RAWDIR OUTDIR    # ключ фону, зменшення до 96x96, палітра LPC+шкіра -> PNG

Шари й кольори — ті самі, що в src/view/world/art.ts (спрайт і портрет мусять збігатися).
Постобробка квантує на палітру art/palette/portraits.json (LPC + кілька відтінків шкіри; правило — у ній).
"""
import base64, json, os, sys
import numpy as np
from PIL import Image, ImageOps

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'palette'))
from check import load_palette  # noqa: E402

C = 'assets/characters/'
P = {
    'bodyMale': 'body/bodies/male', 'bodyFemale': 'body/bodies/female', 'bodyTeen': 'body/bodies/teen',
    'headMale': 'head/heads/human/male', 'headFemale': 'head/heads/human/female', 'headTeen': 'head/heads/human/male_small',
    'shoesMale': 'feet/shoes/basic/male', 'shoesThin': 'feet/shoes/basic/thin',
    'pantsMale': 'legs/pants/male', 'pantsThin': 'legs/pants/thin',
    'shirtMale': 'torso/clothes/longsleeve/longsleeve/male', 'shirtFemale': 'torso/clothes/longsleeve/longsleeve/female',
    'tshirtTeen': 'torso/clothes/shortsleeve/shortsleeve/teen',
    'hairPlain': 'hair/plain/adult', 'pb': 'hair/ponytail/adult/bg', 'pf': 'hair/ponytail/adult/fg',
    'pixie': 'hair/pixie/adult', 'messy': 'hair/messy1/adult',
}
def pony(c, shoes, pants, shirt, hair): return [('pb', hair), ('bodyFemale', None), ('headFemale', None), ('shoesThin', shoes), ('pantsThin', pants), ('shirtFemale', shirt), ('pf', hair)]
def fem(hairlayer, shoes, pants, shirt, hair): return [('bodyFemale', None), ('headFemale', None), ('shoesThin', shoes), ('pantsThin', pants), ('shirtFemale', shirt), (hairlayer, hair)]
LOOKS = {  # як у src/view/world/art.ts
    'npc.george': [('bodyMale', None), ('headMale', None), ('shoesMale', (70, 50, 40)), ('pantsMale', (60, 80, 120)), ('shirtMale', (70, 120, 80)), ('hairPlain', (90, 60, 35))],
    'npc.victoria': pony(0, (120, 60, 60), (70, 70, 90), (200, 110, 90), (150, 90, 40)),
    'npc.matthew': [('bodyTeen', None), ('headTeen', None), ('shoesThin', (220, 220, 220)), ('pantsThin', (50, 60, 90)), ('tshirtTeen', (150, 50, 60)), ('messy', (60, 40, 25))],
    'npc.elise': pony(0, (80, 60, 50), (90, 70, 60), (195, 150, 50), (35, 28, 28)),
    'npc.nora': pony(0, (50, 50, 55), (80, 60, 50), (95, 185, 230), (100, 55, 35)),
    'npc.luc': [('bodyMale', None), ('headMale', None), ('shoesMale', (60, 45, 35)), ('pantsMale', (70, 70, 75)), ('shirtMale', (205, 90, 40)), ('hairPlain', (150, 150, 150))],
    'npc.ingrid': fem('pixie', (90, 70, 60), (90, 80, 70), (130, 90, 160), (225, 225, 225)),
    'npc.sarah': pony(0, (70, 50, 40), (60, 60, 70), (70, 100, 190), (225, 190, 90)),
    'npc.claire': fem('messy', (60, 60, 60), (110, 100, 90), (45, 55, 110), (170, 80, 50)),
    'npc.amina': pony(0, (40, 40, 50), (60, 60, 80), (225, 225, 215), (50, 30, 28)),
    'animal.cat': None,  # кішка: кадр із assets/sprites/cat_mia.png
}
DESC = {
    'npc.george': 'a man about 42 years old with short brown hair, a kind careful expression, wearing a forest-green sweater; square jaw, light stubble',
    'npc.victoria': 'a slim woman about 42 years old with an oval face, long auburn ginger-brown hair in a ponytail resting over one shoulder, a dry witty half-smile, wearing a coral salmon-pink sweater',
    'npc.matthew': 'a 15-year-old teenage boy with messy dark brown hair, a shy grin hiding excitement, wearing a maroon dark-red short-sleeved t-shirt',
    'npc.elise': 'a sturdy older woman about 55 years old with a rounder, fuller face, smile lines and crow\'s feet, black hair with a few silver strands pulled back, warm tired kind eyes, wearing a mustard-yellow sweater',
    'npc.nora': 'a woman about 33 years old with a sporty tanned look, brown ponytail, wearing a bright sky-blue sweater',
    'npc.luc': 'a man about 47 years old with short grey hair, calm focused face, wearing an orange sweater',
    'npc.ingrid': 'an elderly woman about 68 years old with short white pixie-cut hair, thin face with wrinkles, wise eyes, wearing a purple sweater',
    'npc.sarah': 'a cheerful woman about 29 years old with blonde ponytail, talkative open smile, wearing a blue sweater',
    'npc.claire': 'a woman about 38 years old with messy ginger-red hair, kind reassuring smile, wearing a navy-blue sweater',
    'npc.amina': 'a woman about 31 years old with dark brown hair in a ponytail, friendly attentive look, wearing a white-cream sweater',
    'animal.cat': 'a cute grey Scottish Fold cat with small folded ears, round face and big round eyes, head and chest portrait, no human features',
}
PROMPT = ("Redraw this exact game character as a head-and-shoulders portrait bust for a video game dialogue box, facing the viewer in a slight three-quarter view. "
          "Keep the same face shape, hair, hair colour and clothing colours as the reference. Fictional person. {d}. "
          "Style: Stardew Valley-like character portrait, painted pixel art with soft pixel shading and highlights, slightly larger expressive eyes, warm colours, visible pixel grid, no smooth blur. "
          "Natural peach-beige skin tones with soft rosy cheeks, not yellow. Plain solid flat magenta #FF00FF background, no text, no frame, no logo.")
PROMPT_CAT = ("Redraw this exact game cat as a cute head-and-chest portrait for a video game dialogue box, facing the viewer. Keep the same grey fur and tan inner ears. {d}. "
              "Style: Stardew Valley-like painted pixel art with soft pixel shading and highlights, visible pixel grid, no smooth blur. Plain solid flat magenta #FF00FF background, no text, no frame, no logo.")


def tint(im, rgb):
    g = ImageOps.grayscale(im.convert('RGB'))
    c = ImageOps.colorize(g, (0, 0, 0), rgb, mid=tuple(int(x * 0.75) for x in rgb))
    c.putalpha(im.getchannel('A'))
    return c


def sprite(npc):
    if LOOKS[npc] is None:
        return Image.open('assets/sprites/cat_mia.png').convert('RGBA').crop((32, 64, 64, 96))
    out = Image.new('RGBA', (576, 256))
    for n, t in LOOKS[npc]:
        im = Image.open(C + P[n] + '/walk.png').convert('RGBA')
        out.alpha_composite(tint(im, t) if t else im)
    return out.crop((0, 128, 64, 192))


def refs(outdir):
    os.makedirs(outdir, exist_ok=True)
    for k in LOOKS:
        s = sprite(k)
        s.save(f'{outdir}/sprite-{k}.png')
        bg = Image.new('RGBA', s.size, (122, 160, 110, 255)); bg.alpha_composite(s)
        bg.resize((512, 512), Image.NEAREST).convert('RGB').save(f'{outdir}/ref-{k}.png')


def req(outdir, name, ids):
    batch = []
    for k in ids or LOOKS:
        uri = 'data:image/png;base64,' + base64.b64encode(open(f'{outdir}/ref-{k}.png', 'rb').read()).decode()
        tpl = PROMPT_CAT if k == 'animal.cat' else PROMPT
        batch.append({'name': k, 'endpoint': 'fal-ai/flux-pro/kontext', 'payload': {
            'prompt': tpl.format(d=DESC[k]), 'image_url': uri, 'num_images': 1, 'output_format': 'png', 'safety_tolerance': '2', 'seed': 20261029}})
    json.dump({'batch': batch}, open(f'art/requests/{name}', 'w'))


def key_mask(im):
    a = np.array(im.convert('RGB')).astype(np.int32)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mag = (R > 130) & (G < 0.45 * R) & (B > 0.4 * R) & (B > G + 40)
    bg = np.zeros_like(mag)
    bg[0] = mag[0]; bg[-1] = mag[-1]; bg[:, 0] = mag[:, 0]; bg[:, -1] = mag[:, -1]
    while True:  # заливка від країв: магента всередині персонажа (напр. рум'янець) фоном не є
        n = bg.copy(); n[1:] |= bg[:-1]; n[:-1] |= bg[1:]; n[:, 1:] |= bg[:, :-1]; n[:, :-1] |= bg[:, 1:]; n &= mag
        if (n == bg).all(): break
        bg = n
    d = bg.copy()
    for _ in range(2):  # бахрома: 2 px навколо фону, але лише магентові
        d2 = d.copy(); d2[1:] |= d[:-1]; d2[:-1] |= d[1:]; d2[:, 1:] |= d[:, :-1]; d2[:, :-1] |= d[:, 1:]; d = d2
    return ~(bg | (d & mag))


def post(src, dst, size=96):
    _, pal = load_palette('art/palette/portraits.json')
    pal_a = np.array(pal, dtype=np.int32)
    im = Image.open(src).convert('RGB')
    a = key_mask(im).astype(np.float32)
    ys, xs = np.where(a > 0.5)
    s = int((max(xs.max() - xs.min(), ys.max() - ys.min()) + 1) * 1.04)
    cx, cy = (xs.min() + xs.max()) // 2, (ys.min() + ys.max()) // 2
    box = (cx - s // 2, cy - s // 2, cx - s // 2 + s, cy - s // 2 + s)
    rs = lambda arr: np.array(Image.fromarray(arr.clip(0, 255).astype(np.uint8)).crop(box).resize((size, size), Image.BOX)).astype(np.float32)
    al = rs(a * 255) / 255
    rgb = np.array(im).astype(np.float32) * a[:, :, None]
    ch = np.stack([rs(rgb[:, :, i]) for i in range(3)], 2)
    out = np.zeros((size, size, 4), np.uint8)
    vis = al >= 0.5
    col = (ch[vis] / al[vis][:, None]).clip(0, 255).astype(np.int32)
    d2 = ((col[:, None, :] - pal_a[None, :, :]) ** 2).sum(2)
    out[vis, :3] = pal_a[d2.argmin(1)].astype(np.uint8)
    out[vis, 3] = 255
    Image.fromarray(out, 'RGBA').save(dst)


if __name__ == '__main__':
    m = sys.argv[1]
    if m == 'refs': refs(sys.argv[2])
    elif m == 'req': req(sys.argv[2], sys.argv[3], sys.argv[4:])
    elif m == 'post':
        os.makedirs(sys.argv[3], exist_ok=True)
        for f in sorted(os.listdir(sys.argv[2])):
            if f.endswith('.webp'):
                post(f'{sys.argv[2]}/{f}', f"{sys.argv[3]}/{f.rsplit('_', 1)[0]}.png")
