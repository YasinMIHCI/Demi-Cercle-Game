"""Réduit les candidats (700 px, JPEG q75) pour les renvoyer dans le dépôt.
usage: python3 shrink.py WORKDIR OUTDIR"""
import sys, os, json
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
for kind in ('prison', 'crous'):
    d = os.path.join(src, kind)
    if not os.path.isdir(d): continue
    o = os.path.join(dst, kind); os.makedirs(o, exist_ok=True)
    meta = json.load(open(os.path.join(d, 'meta.json')))
    for i, it in enumerate(meta):
        f = os.path.join(d, '%03d.jpg' % i)
        if not os.path.exists(f): continue
        try:
            im = Image.open(f).convert('RGB'); im.thumbnail((700, 700))
            im.save(os.path.join(o, '%03d.jpg' % i), quality=75, optimize=True)
        except Exception as e: print('skip', f, e)
        it.pop('file', None)
    json.dump(meta, open(os.path.join(o, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
