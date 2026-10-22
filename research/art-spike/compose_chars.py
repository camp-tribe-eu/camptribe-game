import sys
from PIL import Image, ImageOps
d=sys.argv[1]
def L(n): return Image.open(f'{d}/l/{n}.png').convert('RGBA')
def tint(im,rgb):
    g=ImageOps.grayscale(im.convert('RGB'))
    c=ImageOps.colorize(g,(0,0,0),rgb,mid=tuple(int(x*0.75) for x in rgb))
    c.putalpha(im.getchannel('A')); return c
def char(layers):
    out=Image.new('RGBA',(576,256))
    for n,col in layers:
        im=L(n); im=tint(im,col) if col else im
        out.alpha_composite(im)
    return out
fam={
 'george':[('hair_ponytail_adult_bg',None)][:0]+[('body_bodies_male',None),('head_heads_human_male',None),('feet_shoes_basic_male',(70,50,40)),('legs_pants_male',(60,80,120)),('torso_clothes_longsleeve_longsleeve_male',(70,120,80)),('hair_plain_adult',(90,60,35))],
 'victoria':[('hair_ponytail_adult_bg',(150,90,40)),('body_bodies_female',None),('head_heads_human_female',None),('feet_shoes_basic_thin',(120,60,60)),('legs_pants_thin',(70,70,90)),('torso_clothes_longsleeve_longsleeve_female',(200,110,90)),('hair_ponytail_adult_fg',(150,90,40))],
 'matthew':[('body_bodies_teen',None),('head_heads_human_male_small',None),('feet_shoes_basic_thin',(220,220,220)),('legs_pants_thin',(50,60,90)),('torso_clothes_longsleeve_longsleeve_teen',(230,180,60)),('hair_messy1_adult',(60,40,25))],
}
row=Image.new('RGBA',(64*4*3,64))
for i,(k,v) in enumerate(fam.items()):
    s=char(v); s.save(f'{d}/{k}.png')
    for r in range(4): row.alpha_composite(s.crop((0,r*64,64,r*64+64)),(i*256+r*64,0))
row.resize((row.width*3,row.height*3),Image.NEAREST).save(f'{d}/family_preview.png')
