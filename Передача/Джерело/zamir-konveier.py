import numpy as np
from PIL import Image

TILE = 32

def wrap_vs_inner(a):
    a = a.astype(np.int16)
    lr = np.abs(a[:,0,:3]-a[:,-1,:3]).mean()
    tb = np.abs(a[0,:,:3]-a[-1,:,:3]).mean()
    m = a.shape[1]//2
    ilr = np.abs(a[:,m,:3]-a[:,m+1,:3]).mean()
    m = a.shape[0]//2
    itb = np.abs(a[m,:,:3]-a[m+1,:,:3]).mean()
    return lr, tb, ilr, itb

def border_bias(a):
    e = np.concatenate([a[:2,:,:].reshape(-1,3), a[-2:,:,:].reshape(-1,3),
                        a[:,:2,:].reshape(-1,3), a[:,-2:,:].reshape(-1,3)])
    c = a[a.shape[0]//4:-a.shape[0]//4, a.shape[1]//4:-a.shape[1]//4, :].reshape(-1,3)
    return c.mean() - e.mean()

def show(tag, a):
    lr, tb, ilr, itb = wrap_vs_inner(a)
    cols = len(np.unique(a.reshape(-1,3), axis=0))
    bb = border_bias(a)
    ok = lr <= ilr*1.5 and tb <= itb*1.5 and abs(bb) < 8
    print(f"{tag:<34} кольорів={cols:>7}  шов={lr:5.1f}/{tb:5.1f}  "
          f"внутр={ilr:5.1f}/{itb:5.1f}  рамка={bb:+6.1f}  {'OK' if ok else 'ПОГАНО'}")
    return ok

img = Image.open("raw.png").convert("RGB")
a = np.array(img)
print("КРОК 0"); show("сира генерація 1024px", a)

# 1. зрізати темну рамку (12% з кожного боку)
h, w, _ = a.shape
m = int(h*0.12)
a1 = a[m:h-m, m:w-m, :]
print("\nКРОК 1 — зрізано рамку"); show(f"обрізано до {a1.shape[1]}px", a1)

# 2. звести на точну сітку 32x32 усередненням блоку (box), не інтерполяцією
im2 = Image.fromarray(a1).resize((TILE, TILE), Image.BOX)
a2 = np.array(im2)
print("\nКРОК 2 — на сітку 32x32"); show("box-downscale 32x32", a2)

# 3. палітра: 16 кольорів
im3 = im2.quantize(colors=16, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
a3 = np.array(im3)
print("\nКРОК 3 — палітра 16 кольорів"); show("quantize 16", a3)

# 4. примусово зшити краї: перенести половину різниці
a4 = a3.astype(np.int16).copy()
for _ in range(2):
    d = (a4[:,0,:] - a4[:,-1,:]) // 2
    a4[:,0,:] -= d; a4[:,-1,:] += d
    d = (a4[0,:,:] - a4[-1,:,:]) // 2
    a4[0,:,:] -= d; a4[-1,:,:] += d
a4 = np.clip(a4, 0, 255).astype(np.uint8)
print("\nКРОК 4 — примусове зшивання країв"); good = show("edge-wrap forced", a4)

Image.fromarray(a4).resize((TILE*8, TILE*8), Image.NEAREST).save("tile_final_zoom.png")

# 5. викласти 3x3 і подивитись на шви очима
grid = np.tile(a4, (3, 3, 1))
Image.fromarray(grid).resize((TILE*3*6, TILE*3*6), Image.NEAREST).save("tile_3x3.png")
print("\nЗбережено: tile_final_zoom.png і tile_3x3.png")

# негативний контроль на фінальному замірі
bad = a4.copy(); bad[:, -1, :] = 255 - bad[:, -1, :]
print("\nНЕГАТИВНИЙ КОНТРОЛЬ (зіпсував праву колонку):")
show("навмисно зламаний тайл", bad)
