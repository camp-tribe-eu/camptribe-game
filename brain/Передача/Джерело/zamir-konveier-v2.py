import numpy as np
from PIL import Image
import sys

TILE=32
def wrap_vs_inner(a):
    a=a.astype(np.int16)
    lr=np.abs(a[:,0,:3]-a[:,-1,:3]).mean(); tb=np.abs(a[0,:,:3]-a[-1,:,:3]).mean()
    m=a.shape[1]//2; ilr=np.abs(a[:,m,:3]-a[:,m+1,:3]).mean()
    m=a.shape[0]//2; itb=np.abs(a[m,:,:3]-a[m+1,:,:3]).mean()
    return lr,tb,ilr,itb
def bbias(a):
    e=np.concatenate([a[:2,:,:].reshape(-1,3),a[-2:,:,:].reshape(-1,3),a[:,:2,:].reshape(-1,3),a[:,-2:,:].reshape(-1,3)])
    c=a[a.shape[0]//4:-a.shape[0]//4,a.shape[1]//4:-a.shape[1]//4,:].reshape(-1,3)
    return c.mean()-e.mean()
def show(t,a):
    lr,tb,ilr,itb=wrap_vs_inner(a); print(f"{t:<30} кольорів={len(np.unique(a.reshape(-1,3),axis=0)):>7} шов={lr:5.1f}/{tb:5.1f} внутр={ilr:5.1f}/{itb:5.1f} рамка={bbias(a):+6.1f}")

src=sys.argv[1]
a=np.array(Image.open(src).convert("RGB")); show(f"сира {src}",a)
h,w,_=a.shape; m=int(h*0.10); a1=a[m:h-m,m:w-m,:]
im2=Image.fromarray(a1).resize((TILE,TILE),Image.BOX)
im3=im2.quantize(colors=12,method=Image.MEDIANCUT,dither=Image.NONE).convert("RGB")
a4=np.array(im3).astype(np.int16)
for _ in range(2):
    d=(a4[:,0,:]-a4[:,-1,:])//2; a4[:,0,:]-=d; a4[:,-1,:]+=d
    d=(a4[0,:,:]-a4[-1,:,:])//2; a4[0,:,:]-=d; a4[-1,:,:]+=d
a4=np.clip(a4,0,255).astype(np.uint8)
# перезвести палітру ПІСЛЯ зшивання — інакше палітра розповзається
a4=np.array(Image.fromarray(a4).quantize(colors=12,method=Image.MEDIANCUT,dither=Image.NONE).convert("RGB"))
show("після конвеєра",a4)
Image.fromarray(np.tile(a4,(3,3,1))).resize((TILE*3*6,TILE*3*6),Image.NEAREST).save(sys.argv[2])
print("->",sys.argv[2])
