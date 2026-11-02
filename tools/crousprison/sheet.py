"""Planches contact numérotées pour relecture : python3 -I sheet.py DIR"""
import sys, os, glob
from PIL import Image, ImageDraw, ImageFont
d=sys.argv[1]; files=sorted(glob.glob(os.path.join(d,'[0-9][0-9][0-9].jpg')))
W,H,C=300,225,5; per=20
font=ImageFont.load_default(size=28)
for s in range(0,len(files),per):
    chunk=files[s:s+per]; rows=(len(chunk)+C-1)//C
    im=Image.new('RGB',(W*C,H*rows),'black')
    for k,f in enumerate(chunk):
        try: t=Image.open(f).convert('RGB'); t.thumbnail((W-4,H-4))
        except Exception: continue
        x,y=(k%C)*W,(k//C)*H; im.paste(t,(x+2,y+2))
        dr=ImageDraw.Draw(im); n=os.path.basename(f)[:3]
        dr.rectangle([x+2,y+2,x+60,y+34],fill='yellow'); dr.text((x+6,y+2),n,fill='black',font=font)
    im.save(os.path.join(d,'sheet_%02d.jpg'%(s//per)), quality=80)
print('ok')
