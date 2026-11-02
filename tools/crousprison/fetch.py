"""Liste et télécharge des candidats depuis Wikimedia Commons (licences libres).
usage: python3 -I fetch.py OUTDIR kind Category:Foo [Category:Bar ...]
Écrit OUTDIR/<kind>/NNN.jpg (vignettes 1000 px) + OUTDIR/<kind>/meta.json"""
import sys, json, os, re, urllib.request, urllib.parse, html, time
API='https://commons.wikimedia.org/w/api.php'
UA={'User-Agent':'CrazyGamesCrousPrison/1.0 (https://github.com/YasinMIHCI/Demi-Cercle-Game)'}
OK_LIC=re.compile(r'^(CC0|Public domain|PD|CC BY(-SA)? [1-4]\.0|CC BY(-SA)? 2\.5|CC BY(-SA)? 3\.0)', re.I)
def get(params):
    params.update(format='json')
    req=urllib.request.Request(API+'?'+urllib.parse.urlencode(params), headers=UA)
    for i in range(4):
        try: return json.load(urllib.request.urlopen(req, timeout=40))
        except Exception as e: err=e; time.sleep(2**i)
    raise err
def strip(s): return html.unescape(re.sub(r'<[^>]+>','',s or '')).strip()
def members(cat, depth):
    out=[]; cont={}
    while True:
        r=get(dict(action='query', generator='categorymembers', gcmtitle=cat, gcmtype='file|subcat', gcmlimit='200',
                   prop='imageinfo', iiprop='url|extmetadata|mime|size', iiurlwidth='1000', **cont))
        for p in (r.get('query',{}).get('pages',{}) or {}).values():
            if p['ns']==14:
                if depth>0: out+=members(p['title'], depth-1)
                continue
            ii=(p.get('imageinfo') or [{}])[0]
            if ii.get('mime')!='image/jpeg' or ii.get('width',0)<640: continue
            m=ii.get('extmetadata',{})
            lic=strip(m.get('LicenseShortName',{}).get('value'))
            if not OK_LIC.match(lic): continue
            out.append(dict(title=p['title'], thumb=ii.get('thumburl'), page=ii.get('descriptionurl'), lic=lic,
                by=strip(m.get('Artist',{}).get('value'))[:80], desc=strip(m.get('ImageDescription',{}).get('value'))[:200],
                cats=strip(m.get('Categories',{}).get('value'))[:300]))
        if 'continue' in r: cont=r['continue']
        else: return out
out, kind, cats = sys.argv[1], sys.argv[2], sys.argv[3:]
d=os.path.join(out,kind); os.makedirs(d, exist_ok=True)
seen=set(); items=[]
for c in cats:
    depth=1
    if c.endswith('/0'): c=c[:-2]; depth=0
    for it in members(c, depth):
        if it['title'] in seen: continue
        seen.add(it['title']); items.append(it)
    print(c, len(items), file=sys.stderr)
for i,it in enumerate(items):
    fn=os.path.join(d,'%03d.jpg'%i); it['file']=fn
    if os.path.exists(fn): continue
    try:
        req=urllib.request.Request(it['thumb'], headers=UA)
        open(fn,'wb').write(urllib.request.urlopen(req, timeout=60).read())
    except Exception as e: print('ERR', it['title'], e, file=sys.stderr)
    time.sleep(0.15)
json.dump(items, open(os.path.join(d,'meta.json'),'w'), ensure_ascii=False, indent=1)
print(len(items),'files')
