"""Liste et télécharge des candidats depuis Wikimedia Commons (licences libres).
usage: python3 -I fetch.py OUTDIR kind Category:Foo[/N] [Category:Bar ...]
  /N = profondeur de sous-catégories explorées (1 par défaut)
Écrit OUTDIR/<kind>/NNN.jpg (vignettes 1000 px) + OUTDIR/<kind>/meta.json.
Volontairement lent : Wikimedia limite fort le débit des requêtes anonymes
(erreur 429), on espace donc les appels et on respecte « Retry-After ».
CAP=n (variable d'environnement) limite le nombre de fichiers téléchargés."""
import sys, json, os, re, time, html, urllib.request, urllib.parse, urllib.error
API = 'https://commons.wikimedia.org/w/api.php'
UA = {'User-Agent': 'CrazyGamesCrousPrison/1.0 (https://github.com/YasinMIHCI/Demi-Cercle-Game)'}
CAP = int(os.environ.get('CAP', '400'))
API_GAP, FILE_GAP = 4.0, 1.5
OK_LIC = re.compile(r'^(CC0|Public domain|PD|CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0))', re.I)
_last = [0.0]

def log(*a): print(*a, file=sys.stderr, flush=True)

def fetch(url, gap, binary=False):
    pause = 30
    for _ in range(12):
        wait = _last[0] + gap - time.time()
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
            return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            ra = int(e.headers.get('Retry-After') or 0)
            w = max(ra, pause); pause = min(pause * 2, 300)
            log('  HTTP', e.code, '- pause', w, 's'); time.sleep(w)
        except Exception as e:
            log('  erreur', e, '- pause', pause, 's'); time.sleep(pause)
    raise RuntimeError('abandon: ' + url)

def api(**p):
    p['format'] = 'json'
    return fetch(API + '?' + urllib.parse.urlencode(p), API_GAP)

def strip(s): return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()

def walk(cat, depth, files, seen_cats):
    if cat in seen_cats: return
    seen_cats.add(cat)
    cont = {}
    while True:
        r = api(action='query', list='categorymembers', cmtitle=cat, cmtype='file|subcat', cmlimit='500', **cont)
        subs = []
        for m in r.get('query', {}).get('categorymembers', []):
            if m['ns'] == 6: files.setdefault(m['title'], cat)
            elif m['ns'] == 14: subs.append(m['title'])
        if depth > 0:
            for s in subs: walk(s, depth - 1, files, seen_cats)
        if 'continue' in r: cont = {'cmcontinue': r['continue']['cmcontinue']}
        else: break
    log(cat, '->', len(files), 'fichiers au total')

def infos(titles):
    out = []
    for i in range(0, len(titles), 50):
        r = api(action='query', titles='|'.join(titles[i:i+50]), prop='imageinfo',
                iiprop='url|extmetadata|mime|size', iiurlwidth='1000',
                iiextmetadatafilter='LicenseShortName|Artist|ImageDescription')
        for p in (r.get('query', {}).get('pages', {}) or {}).values():
            ii = (p.get('imageinfo') or [{}])[0]
            if ii.get('mime') != 'image/jpeg' or ii.get('width', 0) < 640: continue
            m = ii.get('extmetadata', {})
            lic = strip(m.get('LicenseShortName', {}).get('value'))
            if not OK_LIC.match(lic): continue
            out.append(dict(title=p['title'], thumb=ii.get('thumburl'), page=ii.get('descriptionurl'), lic=lic,
                            by=strip(m.get('Artist', {}).get('value'))[:80],
                            desc=strip(m.get('ImageDescription', {}).get('value'))[:200]))
        log('  infos', min(i + 50, len(titles)), '/', len(titles), '->', len(out), 'retenus')
    return out

out, kind, cats = sys.argv[1], sys.argv[2], sys.argv[3:]
d = os.path.join(out, kind); os.makedirs(d, exist_ok=True)
files, seen = {}, set()
meta_path = os.path.join(d, 'meta.json')
if os.environ.get('RESUME') and os.path.exists(meta_path): cats = []   # reprise : liste déjà faite
for c in cats:
    depth = 1
    m = re.match(r'(.*)/(\d)$', c)
    if m: c, depth = m.group(1), int(m.group(2))
    walk(c, depth, files, seen)
if cats or not os.path.exists(meta_path):
    items = infos(sorted(files))
    for it in items: it['cat'] = files.get(it['title'], '')
    items = items[:CAP]
    json.dump(items, open(meta_path, 'w'), ensure_ascii=False, indent=1)
else:
    items = json.load(open(meta_path))
for i, it in enumerate(items):
    fn = os.path.join(d, '%03d.jpg' % i); it['file'] = fn
    if os.path.exists(fn): continue
    # les vignettes sont aussi servies par upload.wikimedia.org (thumb.wikimedia.org peut être bloqué)
    url = re.sub(r'^https://thumb\.wikimedia\.org/', 'https://upload.wikimedia.org/', it['thumb']).split('?')[0]
    try: open(fn, 'wb').write(fetch(url, FILE_GAP, binary=True))
    except Exception as e: log('ERR', it['title'], e)
    if i % 20 == 0: log('  photos', i, '/', len(items))
json.dump(items, open(os.path.join(d, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
print(len(items), 'fichiers')
