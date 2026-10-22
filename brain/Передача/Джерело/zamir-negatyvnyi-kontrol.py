import numpy as np
from PIL import Image

def wrap(a):
    a = a.astype(np.int16)
    return (np.abs(a[:,0,:3]-a[:,-1,:3]).mean(), np.abs(a[0,:,:3]-a[-1,:,:3]).mean())

a = np.array(Image.open("raw.png").convert("RGB"))

# 1. Чи є темна рамка — відомий артефакт, який ОБМАНЮЄ мій замір
edge = np.concatenate([a[:4,:,:].reshape(-1,3), a[-4:,:,:].reshape(-1,3),
                       a[:,:4,:].reshape(-1,3), a[:,-4:,:].reshape(-1,3)])
core = a[200:-200, 200:-200, :].reshape(-1,3)
print(f"яскравість краю   : {edge.mean():6.2f}")
print(f"яскравість центру : {core.mean():6.2f}")
print(f"край темніший на  : {core.mean()-edge.mean():6.2f}  <- артефакт темної рамки")

# 2. НЕГАТИВНИЙ КОНТРОЛЬ: зображення, яке точно НЕ стикується
h,w,_ = a.shape
grad = np.zeros_like(a)
for x in range(w):
    grad[:,x,:] = int(255*x/w)          # зліва чорне, справа біле — шов максимальний
print(f"\nнегативний контроль (градієнт, шов очевидний):")
lr,tb = wrap(grad); print(f"  шов ліво↔право = {lr:.2f}  (має бути ~255)")

# 3. Другий контроль: склеїти ліву половину з ЧУЖОЇ картинки
flip = a[:, ::-1, :].copy()
mix = a.copy(); mix[:, :w//2, :] = flip[:, :w//2, :]
lr,tb = wrap(mix); print(f"  шов на склейці двох різних = {lr:.2f}")
