#!/usr/bin/env python3
# בונה את data/foods.json ממאגר התזונה הלאומי הישראלי (משרד הבריאות, data.gov.il).
# הורדה דרך ה-API הרשמי (datastore_search), כי קבצי ה-CSV חסומים להורדה אוטומטית.
# שימוש: python3 -I scripts/build-foods.py [תיקיית-מטמון]
import json, os, re, sys, urllib.request, urllib.parse
API = 'https://data.gov.il/api/3/action/datastore_search?'
FOODS = 'c3cb0630-0650-46c1-a068-82d575c094b2'
UNITS = '98fb46fe-e8de-4067-94d2-b0a8ea4269da'
UNITW = '755d28c0-75f7-40e1-9c8c-ecdd106f9b2d'
FIELDS = 'Code,smlmitzrach,shmmitzrach,makor,protein,total_fat,carbohydrates,food_energy,total_dietary_fiber,total_sugars,saturated_fat,sodium,english_name,tarich_idkun'
cache = sys.argv[1] if len(sys.argv) > 1 else None
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'data', 'foods.json')

def fetch(rid, name, fields=None):
    if cache and os.path.exists(os.path.join(cache, name)):
        return json.load(open(os.path.join(cache, name)))
    recs, off = [], 0
    while True:
        q = {'resource_id': rid, 'limit': 1000, 'offset': off}
        if fields: q['fields'] = fields
        d = json.load(urllib.request.urlopen(API + urllib.parse.urlencode(q), timeout=120))['result']
        recs += d['records']; off += 1000
        if off >= d['total']: break
    if cache:
        json.dump(recs, open(os.path.join(cache, name), 'w'), ensure_ascii=False)
    return recs

foods = fetch(FOODS, 'foods.json', FIELDS)
units = {u['smlmida']: re.sub(r'\s+', ' ', u['shmmida']).strip() for u in fetch(UNITS, 'units.json')}
byc = {}
for w in fetch(UNITW, 'unitw.json'):
    name = units.get(w['mida'])
    if not name or name in ('גרמים', 'קילוגרם'): continue
    try: g = round(float(w['mishkal']), 1)
    except Exception: continue
    if g <= 0: continue
    lst = byc.setdefault(int(w['mmitzrach']), [])
    if not any(x[0] == name for x in lst): lst.append([name, g])

def num(v):
    if v in (None, ''): return None
    try: return round(float(v), 2)
    except Exception: return None

def state(name, group):
    n = re.sub(r'לא קלוי\S*|ללא תוספת שמן בבישול|ללא תוספת שומן בבישול', '', name)
    if re.search(r'מסונן|מסוננ|משומר במים|ללא נוזלים', n): return 'drained'
    if re.search(r'כולל נוזלים|במארז מיץ|בסירופ', n): return 'liquid'
    if re.search(r'מיובש', n): return 'dried'
    if re.search(r'לא מבושל|לא מבושלת|לא מבושלים|לא מבושלות|תערובת יבשה|, יבש|, יבשה|, יבשים|, יבשות| יבש$| יבשים$| יבשה$', n):
        return 'raw' if group in (2,) else 'dry'
    if re.search(r'מבושל|אפוי|צלוי|מטוגן|בגריל|מאודה|קלוי|מוכן מ|מוכן ל|מוכן,|מוקפץ', n): return 'cooked'
    if re.search(r'מיובש', n): return 'dried'
    return None

res = []
for f in foods:
    name = (f.get('shmmitzrach') or '').strip()
    kcal = num(f.get('food_energy'))
    if not name or kcal is None or name.startswith('FFQ'): continue
    sml = str(f.get('smlmitzrach') or '')
    group = int(sml[0]) if sml[:1].isdigit() else 0
    item = {
        'id': 'm%d' % f['Code'], 'n': re.sub(r'\s+', ' ', name).replace(' ,', ','),
        'e': (f.get('english_name') or '').strip() or None,
        'src': 'moh', 'mk': f.get('makor'), 'g': group,
        'k': kcal, 'p': num(f.get('protein')) or 0, 'f': num(f.get('total_fat')) or 0,
        'c': num(f.get('carbohydrates')) or 0, 'fi': num(f.get('total_dietary_fiber')),
        'su': num(f.get('total_sugars')), 'sf': num(f.get('saturated_fat')), 'na': num(f.get('sodium')),
        'u': byc.get(f['Code'], []), 'st': state(name, group),
        'up': (f.get('tarich_idkun') or '')[:10] or None,
    }
    res.append({k: v for k, v in item.items() if v not in (None, [], '')})
res.sort(key=lambda x: int(x['id'][1:]))
meta = {'source': 'מאגר התזונה הלאומי הישראלי — משרד הבריאות', 'url': 'https://data.gov.il/dataset/nutrition-database',
        'license': 'Other (Open)', 'fetched': __import__('datetime').date.today().isoformat(), 'count': len(res),
        'makor': {'1': 'ארה״ב (USDA NDB/FNDDS)', '2': 'תעשייה, תווית בלבד', '3': 'תעשייה, תווית עם חישובים', '4': 'מתכון', '5': 'אחר', '6': 'ארה״ב (USDA) עם חישוב', '7': 'ערכים משולבים'}}
json.dump({'meta': meta, 'foods': res}, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print('wrote', out, len(res))
