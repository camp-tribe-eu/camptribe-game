# raw FAL image -> sprite: key out magenta-ish background, crop, downscale to target width (LPC 32px grid)
import sys, numpy as np
from PIL import Image
src, dst, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
a = np.array(Image.open(src).convert('RGB')).astype(np.int16)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
bg = (r > g + 60) & (b > g + 20)       # pink background + its purple drop shadow
ys, xs = np.where(~bg)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
rgba = np.dstack([a, np.where(bg, 0, 255)]).astype(np.uint8)[y0:y1, x0:x1]
h = round((y1 - y0) * width / (x1 - x0))
im = Image.fromarray(rgba, 'RGBA').resize((width, h), Image.BOX)
im.save(dst)
print(f'bg {bg.mean():.1%}, bbox {x1-x0}x{y1-y0} -> {width}x{h}')
