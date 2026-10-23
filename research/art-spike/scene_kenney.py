import sys
from PIL import Image
sheet=Image.open(sys.argv[1]).convert('RGBA'); out=sys.argv[2]
T=16
def tile(c,r,w=1,h=1):
    return sheet.crop((c*17,r*17,c*17+w*17-1,r*17+h*17-1))
W,H=20,12
im=Image.new('RGBA',(W*T,H*T))
# Kenney має 1px проміжок між тайлами: багатотайлові об'єкти склеюємо потайлово
def put(c,r,x,y,w=1,h=1):
    for dx in range(w):
        for dy in range(h):
            im.alpha_composite(tile(c+dx,r+dy),((x+dx)*T,(y+dy)*T))
for x in range(W):
    for y in range(H): put(5,0,x,y)
for x in range(W): put(6,0,x,7)            # дорога/стежка
for y in range(7,H): put(6,0,9,y)
put(2,0,13,1,3,3)                          # ставок
for x,y in [(0,0),(2,1),(17,0),(18,3),(0,4),(1,9),(17,9),(5,0)]: put(16,10,x,y,1,2)
for x,y in [(3,3),(11,0),(16,5),(4,10)]: put(13,9,x,y)
put(46,10,5,3,2,2)                         # намет зелений
put(48,10,9,2,2,2)                         # намет бежевий
put(15,8,8,5)                              # вогнище
for x in range(12,18): put(46,23,x,10)     # паркан
put(54,19,12,4)                            # камінь
im.save(out)
# --- персонажі й авто (додано після появи наборів)
ch=Image.open(sys.argv[3]).convert('RGBA'); city=Image.open(sys.argv[4]).convert('RGBA')
def chr_(c,r): return ch.crop((c*17,r*17,c*17+16,r*17+16))
for (c,r),(x,y) in zip([(0,5),(0,7),(1,9)],[(6*T,5*T),(9*T,5*T),(7*T,6*T)]): im.alpha_composite(chr_(c,r),(x,y))
car=city.crop((31*16,262,34*16,290)); im.alpha_composite(car,(12*T,8*T))
im.save(out)
