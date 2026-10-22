import sys,random
from PIL import Image
P=sys.argv[1]; CH=sys.argv[2]; out=sys.argv[3]
random.seed(7)
A=Image.open(f'{P}/pack-lpc-atlas/terrain_atlas.png').convert('RGBA')
car=Image.open(f'{P}/pack-lpc-car/carsskorpiosall_1.png').convert('RGBA').crop((5,352,188,447))
fire=Image.open(f'{P}/pack-lpc-campfire/CampFireFinished.png').convert('RGBA').crop((64,0,128,64))
tent=Image.open(f'{P}/pack-lpc-tent/Tent_1.png').convert('RGBA')
T=32; W,H=20,12
im=Image.new('RGBA',(W*T,H*T))
grass=[A.crop((x,160,x+32,192)) for x in (672,704,736)]
dirt=A.crop((640,160,672,192))
for x in range(W):
    for y in range(H): im.alpha_composite(random.choice(grass),(x*T,y*T))
for x in range(W): im.alpha_composite(dirt,(x*T,7*T))
for y in range(7,H): im.alpha_composite(dirt,(9*T,y*T))
im.alpha_composite(A.crop((192,352,288,448)),(13*T,1*T))          # ставок
pine=A.crop((960,0,1024,160)); oak=A.crop((928,896,1024,1024)); bush=A.crop((768,384,864,448))
objs=[(pine,0,-1),(pine,2,0),(pine,17,-1),(pine,18,2),(pine,0,3),(pine,1,8),(pine,17,8),(oak,4,-1),(oak,11,-1),(bush,3,3),(bush,16,5),(bush,4,10)]
tent2=tent.resize((tent.width*2,tent.height*2),Image.NEAREST)        # 🔴 прогалина: намет LPC-масштабу не знайдено
chars=[Image.open(f'{CH}/{n}.png').convert('RGBA').crop((0,128,64,192)) for n in ('george','victoria','matthew')]
layer=[(o,x*T,y*T) for o,x,y in objs]+[(tent2,5*T,4*T),(tent2,9*T,3*T),(fire,7*T+16,5*T),(car,12*T,8*T-8)]
layer+=[(chars[0],6*T,5*T-8),(chars[1],8*T+20,5*T-8),(chars[2],5*T,6*T-16)]
for o,x,y in sorted(layer,key=lambda t:t[2]+t[0].height): im.alpha_composite(o,(x,y))
im.save(out)
