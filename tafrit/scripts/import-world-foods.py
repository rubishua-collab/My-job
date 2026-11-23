#!/usr/bin/env python3
# ייבוא מאגרי מזון עולמיים ל-data/foods-world.json:
#   USDA FoodData Central — Foundation Foods + SR Legacy (ארה״ב, נחלת הכלל)
#   CoFID 2021 — McCance & Widdowson's Composition of Foods Integrated Dataset (בריטניה, Open Government Licence)
# לכל פריט: מקור, מדינה, ערכים ל-100 ג׳, מנות ויחידות ביתיות (ב-USDA), מצב נא/מבושל, שם באנגלית ושם עברי בתרגום אוטומטי.
# המזהים קבועים (u<fdcId>, k<code>) — ייבוא חוזר מעדכן פריטים קיימים ולא יוצר כפילויות.
# שימוש: python3 -I scripts/import-world-foods.py <תיקייה עם קבצי ההורדה>
import json, os, re, sys, glob, datetime

src_dir = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'data', 'foods-world.json')

# ---- מילון לתרגום תיאורים (מילה/צירוף → עברית). צירופים ארוכים קודם ----
HE = {
 'chicken': 'עוף', 'broilers or fryers': '', 'broiler or fryers': '', 'broilers': '', 'fryers': '', 'roasting': 'לצלייה', 'stewing': 'לבישול',
 'turkey': 'הודו', 'beef': 'בקר', 'veal': 'עגל', 'lamb': 'כבש', 'pork': 'חזיר', 'ham': 'חזיר מעושן (המ)', 'bacon': 'בייקון', 'duck': 'ברווז', 'goose': 'אווז',
 'fish': 'דג', 'salmon': 'סלמון', 'tuna': 'טונה', 'cod': 'בקלה', 'sardine': 'סרדין', 'sardines': 'סרדינים', 'trout': 'פורל', 'tilapia': 'אמנון', 'mackerel': 'מקרל', 'herring': 'הרינג', 'sea bass': 'לברק', 'haddock': 'הדוק', 'halibut': 'הליבוט', 'shrimp': 'שרימפס', 'prawns': 'שרימפס', 'crab': 'סרטן', 'squid': 'קלמרי',
 'egg': 'ביצה', 'eggs': 'ביצים', 'whole': 'שלם', 'white': 'לבן', 'yolk': 'חלמון',
 'milk': 'חלב', 'cheese': 'גבינה', 'cottage': 'קוטג׳', 'cream': 'שמנת', 'sour cream': 'שמנת חמוצה', 'yogurt': 'יוגורט', 'yoghurt': 'יוגורט', 'greek': 'יווני', 'butter': 'חמאה', 'margarine': 'מרגרינה', 'feta': 'פטה', 'mozzarella': 'מוצרלה', 'cheddar': 'צ׳דר', 'parmesan': 'פרמזן', 'ricotta': 'ריקוטה', 'cream cheese': 'גבינת שמנת', 'ice cream': 'גלידה', 'whey': 'מי גבינה',
 'bread': 'לחם', 'pita': 'פיתה', 'bagel': 'בייגל', 'bagels': 'בייגל', 'roll': 'לחמניה', 'rolls': 'לחמניות', 'tortilla': 'טורטייה', 'tortillas': 'טורטייה', 'crackers': 'קרקרים', 'cracker': 'קרקר', 'biscuits': 'ביסקוויטים', 'cookies': 'עוגיות', 'cookie': 'עוגייה', 'cake': 'עוגה', 'muffins': 'מאפינס', 'muffin': 'מאפין', 'pancakes': 'פנקייק', 'waffles': 'וופל', 'croissants': 'קרואסון', 'croissant': 'קרואסון', 'pastry': 'מאפה', 'pie': 'פאי', 'pizza': 'פיצה', 'sandwich': 'כריך', 'burger': 'המבורגר', 'hamburger': 'המבורגר', 'cheeseburger': 'צ׳יזבורגר', 'hot dog': 'נקניקייה', 'frankfurter': 'נקניקייה', 'sausage': 'נקניק', 'sausages': 'נקניקיות', 'meatballs': 'קציצות', 'patty': 'קציצה', 'nuggets': 'נאגטס',
 'rice': 'אורז', 'brown': 'חום', 'wild rice': 'אורז בר', 'pasta': 'פסטה', 'spaghetti': 'ספגטי', 'macaroni': 'מקרוני', 'noodles': 'אטריות', 'couscous': 'קוסקוס', 'bulgur': 'בורגול', 'quinoa': 'קינואה', 'oats': 'שיבולת שועל', 'oatmeal': 'דייסת שיבולת שועל', 'oat': 'שיבולת שועל', 'barley': 'שעורה', 'buckwheat': 'כוסמת', 'corn': 'תירס', 'cornflakes': 'קורנפלקס', 'cereal': 'דגני בוקר', 'cereals': 'דגני בוקר', 'granola': 'גרנולה', 'flour': 'קמח', 'wheat': 'חיטה', 'whole wheat': 'חיטה מלאה', 'wholemeal': 'מקמח מלא', 'whole-wheat': 'חיטה מלאה', 'rye': 'שיפון', 'bran': 'סובין',
 'potato': 'תפוח אדמה', 'potatoes': 'תפוחי אדמה', 'sweet potato': 'בטטה', 'sweet potatoes': 'בטטה', 'french fries': 'צ׳יפס', 'chips': 'צ׳יפס',
 'beans': 'שעועית', 'bean': 'שעועית', 'kidney': 'אדומה', 'lentils': 'עדשים', 'chickpeas': 'גרגרי חומוס', 'garbanzo': 'גרגרי חומוס', 'peas': 'אפונה', 'pea': 'אפונה', 'soybeans': 'פולי סויה', 'tofu': 'טופו', 'hummus': 'חומוס', 'falafel': 'פלאפל', 'edamame': 'אדממה',
 'tomato': 'עגבנייה', 'tomatoes': 'עגבניות', 'cucumber': 'מלפפון', 'cucumbers': 'מלפפונים', 'carrot': 'גזר', 'carrots': 'גזר', 'onion': 'בצל', 'onions': 'בצל', 'garlic': 'שום', 'peppers': 'פלפלים', 'pepper': 'פלפל', 'sweet pepper': 'פלפל מתוק', 'lettuce': 'חסה', 'cabbage': 'כרוב', 'broccoli': 'ברוקולי', 'cauliflower': 'כרובית', 'spinach': 'תרד', 'kale': 'קייל', 'zucchini': 'קישוא', 'courgette': 'קישוא', 'eggplant': 'חציל', 'aubergine': 'חציל', 'mushrooms': 'פטריות', 'mushroom': 'פטרייה', 'beets': 'סלק', 'beetroot': 'סלק', 'celery': 'סלרי', 'asparagus': 'אספרגוס', 'squash': 'דלעת', 'pumpkin': 'דלעת', 'radish': 'צנונית', 'avocado': 'אבוקדו', 'avocados': 'אבוקדו', 'olives': 'זיתים', 'salad': 'סלט', 'vegetables': 'ירקות', 'vegetable': 'ירק', 'green beans': 'שעועית ירוקה', 'artichoke': 'ארטישוק', 'leek': 'כרישה', 'leeks': 'כרישה',
 'apple': 'תפוח', 'apples': 'תפוחים', 'banana': 'בננה', 'bananas': 'בננה', 'orange': 'תפוז', 'oranges': 'תפוזים', 'grapes': 'ענבים', 'grape': 'ענבים', 'strawberries': 'תותים', 'strawberry': 'תות', 'blueberries': 'אוכמניות', 'raspberries': 'פטל', 'cherries': 'דובדבנים', 'peach': 'אפרסק', 'peaches': 'אפרסקים', 'pear': 'אגס', 'pears': 'אגסים', 'plum': 'שזיף', 'plums': 'שזיפים', 'apricot': 'משמש', 'apricots': 'משמשים', 'mango': 'מנגו', 'pineapple': 'אננס', 'watermelon': 'אבטיח', 'melon': 'מלון', 'melons': 'מלון', 'kiwi': 'קיווי', 'kiwifruit': 'קיווי', 'lemon': 'לימון', 'lime': 'ליים', 'grapefruit': 'אשכולית', 'pomegranate': 'רימון', 'pomegranates': 'רימון', 'dates': 'תמרים', 'figs': 'תאנים', 'raisins': 'צימוקים', 'cranberries': 'חמוציות', 'fruit': 'פרי', 'tangerines': 'קלמנטינות', 'mandarin': 'מנדרינה', 'persimmons': 'אפרסמון', 'guavas': 'גויאבה', 'coconut': 'קוקוס',
 'nuts': 'אגוזים', 'almonds': 'שקדים', 'walnuts': 'אגוזי מלך', 'peanuts': 'בוטנים', 'peanut butter': 'חמאת בוטנים', 'pistachio': 'פיסטוק', 'pistachios': 'פיסטוקים', 'cashew': 'קשיו', 'hazelnuts': 'אגוזי לוז', 'pecans': 'פקאן', 'seeds': 'זרעים', 'sesame': 'שומשום', 'tahini': 'טחינה', 'sunflower': 'חמנייה', 'chia': 'צ׳יה', 'flaxseed': 'פשתן', 'pumpkin seeds': 'גרעיני דלעת',
 'oil': 'שמן', 'olive': 'זית', 'canola': 'קנולה', 'mayonnaise': 'מיונז', 'ketchup': 'קטשופ', 'mustard': 'חרדל', 'honey': 'דבש', 'sugar': 'סוכר', 'jam': 'ריבה', 'chocolate': 'שוקולד', 'candies': 'ממתקים', 'syrup': 'סירופ', 'sauce': 'רוטב', 'soup': 'מרק', 'juice': 'מיץ', 'coffee': 'קפה', 'tea': 'תה', 'water': 'מים', 'beverages': 'משקאות', 'cola': 'קולה', 'beer': 'בירה', 'wine': 'יין', 'popcorn': 'פופקורן', 'pretzels': 'בייגלה', 'snacks': 'חטיפים', 'dressing': 'רוטב לסלט', 'vinegar': 'חומץ', 'salt': 'מלח', 'spices': 'תבלינים',
 'breast': 'חזה', 'thigh': 'ירך', 'thighs': 'ירכיים', 'leg': 'שוק', 'drumstick': 'שוק', 'wing': 'כנף', 'wings': 'כנפיים', 'liver': 'כבד', 'ground': 'טחון', 'steak': 'סטייק', 'fillet': 'פילה', 'fillets': 'פילה', 'tenderloin': 'פילה', 'ribs': 'צלעות', 'brisket': 'חזה בקר', 'meat only': 'בשר בלבד', 'meat and skin': 'בשר ועור', 'skinless': 'בלי עור', 'boneless': 'בלי עצם', 'lean': 'רזה', 'fat': 'שומן', 'light meat': 'בשר לבן', 'dark meat': 'בשר כהה',
 'raw': 'נא', 'cooked': 'מבושל', 'boiled': 'מבושל במים', 'roasted': 'צלוי', 'baked': 'אפוי', 'fried': 'מטוגן', 'grilled': 'על האש', 'broiled': 'צלוי', 'stewed': 'מבושל', 'braised': 'מבושל', 'steamed': 'מאודה', 'microwaved': 'במיקרוגל', 'pan-fried': 'מטוגן במחבת', 'smoked': 'מעושן', 'canned': 'משומר', 'drained': 'מסונן', 'dried': 'מיובש', 'dry': 'יבש', 'frozen': 'קפוא', 'fresh': 'טרי', 'plain': 'טבעי', 'unsalted': 'בלי מלח', 'salted': 'מלוח', 'sweetened': 'ממותק', 'unsweetened': 'לא ממותק', 'low fat': 'דל שומן', 'lowfat': 'דל שומן', 'nonfat': 'ללא שומן', 'fat free': 'ללא שומן', 'reduced fat': 'מופחת שומן', 'skimmed': 'רזה', 'semi-skimmed': 'מופחת שומן', 'whole milk': 'חלב מלא', 'homemade': 'ביתי', 'prepared': 'מוכן', 'with': 'עם', 'without': 'בלי', 'and': 'ו', 'cheese and': 'גבינה ו', 'white bread': 'לחם לבן', 'brown bread': 'לחם חום', 'casseroled': 'מבושל בתבשיל', 'barbecued': 'על האש',
 'in unsalted water': '', 'in salted water': '', 'in water': 'במים', 'in oil': 'בשמן', 'flesh and skin': 'עם הקליפה', 'flesh only': 'בלי קליפה', 'solids and liquids': 'כולל הנוזל', 'with salt': 'עם מלח', 'without salt': 'בלי מלח', 'skin': 'עור', 'bone-in': 'עם עצם', 'cutlets': 'קציצות',
}
# סדר חשוב: "cooked, boiled, drained" הוא מבושל (ולא "מסונן"); "dry mix" הוא יבש
STATE = [('cooked', 'cooked'), ('boiled', 'cooked'), ('roasted', 'cooked'), ('baked', 'cooked'), ('fried', 'cooked'), ('grilled', 'cooked'), ('broiled', 'cooked'), ('stewed', 'cooked'), ('braised', 'cooked'), ('steamed', 'cooked'), ('microwaved', 'cooked'), ('toasted', 'cooked'), ('casseroled', 'cooked'), ('barbecued', 'cooked'),
         ('raw', 'raw'), ('uncooked', 'raw'), ('drained', 'drained'), ('dried', 'dried'), ('dry', 'dry')]
KEYS = sorted(HE, key=len, reverse=True)
WORD = re.compile(r"[a-z]+(?:[- ][a-z]+)*")

def tr_segment(seg):
    """מתרגם קטע (בין פסיקים) רק אם כל המילים בו מוכרות; אחרת None"""
    s = seg.lower().strip()
    if not s: return ''
    outw, i = [], 0
    while i < len(s):
        if s[i] in ' -/()&': i += 1; continue
        m = next((k for k in KEYS if s.startswith(k, i) and (i + len(k) == len(s) or not s[i + len(k)].isalpha())), None)
        if not m: return None
        if HE[m]: outw.append((HE[m], ' ' in m))
        i += len(m)
    # באנגלית התיאור לפני שם העצם ("white bread", "tomato sauce"), בעברית אחריו: "לחם לבן", "רוטב עגבנייה"
    words = [w for w, _ in outw]
    if len(words) > 1 and not any(w in ('עם', 'בלי', 'ו', 'במים', 'בשמן') for w in words): words = words[::-1]
    return ' '.join(words).replace(' ו ', ' ו')

def hebrew(desc):
    """(שם עברי מלא או None, ראש עברי). שם מלא רק אם כל הקטעים (עד 5) תורגמו — כדי לא להסתיר פרט חשוב"""
    segs = [x for x in desc.split(',')][:6]
    tr = [tr_segment(x) for x in segs]
    head = tr[0] or None
    if all(t is not None for t in tr) and len(desc.split(',')) <= 6:
        return ', '.join(dict.fromkeys(t for t in tr if t)), head
    return None, head

def display(desc):
    full, head = hebrew(desc)
    if full: return full, 1
    if head: return f'{head} · {desc}', 2
    return desc, 0

def state_of(desc):
    d = desc.lower()
    for w, st in STATE:
        if re.search(r'\b' + w + r'\b', d): return st
    return None

UNIT_HE = {'cup': 'כוס', 'tbsp': 'כף', 'tablespoon': 'כף', 'tsp': 'כפית', 'teaspoon': 'כפית', 'slice': 'פרוסה', 'piece': 'יחידה', 'oz': 'אונקיה', 'serving': 'מנה', 'large': 'גדול', 'medium': 'בינוני', 'small': 'קטן', 'fillet': 'פילה', 'breast': 'חזה', 'thigh': 'ירך', 'drumstick': 'שוק', 'wing': 'כנף', 'egg': 'ביצה', 'fruit': 'פרי', 'link': 'נקניקייה', 'patty': 'קציצה', 'stalk': 'גבעול', 'clove': 'שן', 'leaf': 'עלה', 'package': 'אריזה', 'container': 'גביע', 'can': 'קופסה', 'bar': 'חטיף', 'cookie': 'עוגייה', 'muffin': 'מאפין', 'roll': 'לחמנייה', 'bun': 'לחמנייה', 'tortilla': 'טורטייה', 'pita': 'פיתה', 'steak': 'סטייק', 'chop': 'צלע'}
def portion_label(p):
    mu = (p.get('measureUnit') or {}).get('name', '')
    if mu == 'RACC': return None
    raw = mu if mu not in ('undetermined', '') else (p.get('modifier') or '')
    w = next((w for w in re.findall(r'[a-z]+', raw.lower()) if w in UNIT_HE), None)
    if not w: return None
    size = next((UNIT_HE[x] for x in re.findall(r'[a-z]+', (p.get('modifier') or '').lower()) if x in ('large', 'medium', 'small')), '')
    return UNIT_HE[w] + (' ' + size if size and w not in ('large', 'medium', 'small') else '')

NUM = {'208': 'k', '957': 'k2', '958': 'k3', '203': 'p', '204': 'f', '205': 'c', '291': 'fi', '307': 'na', '269': 'su'}
def usda_item(x):
    n = {}
    for fn in x.get('foodNutrients', []):
        num = str((fn.get('nutrient') or {}).get('number', ''))
        if num in NUM and fn.get('amount') is not None and NUM[num] not in n: n[NUM[num]] = fn['amount']
    k = n.get('k', n.get('k2', n.get('k3')))
    if k is None or 'p' not in n or 'f' not in n: return None
    desc = x['description']
    u = []
    for p in x.get('foodPortions', []):
        g, amt = p.get('gramWeight'), p.get('amount') or p.get('value') or 1
        lab = portion_label(p)
        if g and lab and amt and 0 < g / amt < 3000 and lab not in [a for a, _ in u]: u.append([lab, round(g / amt, 1)])
    nm, he = display(desc)
    item = {'id': 'u%d' % x['fdcId'], 'n': nm, 'e': desc, 'he': he, 'src': 'usda', 'cc': 'US',
            'ds': x.get('dataType', ''), 'k': round(k), 'p': round(n['p'], 1), 'f': round(n['f'], 1), 'c': round(n.get('c', 0) or 0, 1)}
    if n.get('fi') is not None: item['fi'] = round(n['fi'], 1)
    if n.get('na') is not None: item['na'] = round(n['na'])
    if n.get('su') is not None: item['su'] = round(n['su'], 1)
    st = state_of(desc)
    if st: item['st'] = st
    if u: item['u'] = u[:6]
    return item

items = {}
skip = re.compile(r'babyfood|infant formula|\binfant\b|enfamil|similac|gerber', re.I)
for f, key in [('FoodData_Central_foundation_food_json_*.json', 'FoundationFoods'), ('FoodData_Central_sr_legacy_food_json_*.json', 'SRLegacyFoods')]:
    for path in sorted(glob.glob(os.path.join(src_dir, '**', f), recursive=True)):
        for x in json.load(open(path))[key]:
            if skip.search(x['description']): continue
            it = usda_item(x)
            if it: items[it['id']] = it

# ---- CoFID ----
import openpyxl
def num(v):
    try: return float(str(v).strip())
    except Exception: return None
cof = glob.glob(os.path.join(src_dir, '**', '*ofid*2021*.xlsx'), recursive=True) + glob.glob(os.path.join(src_dir, '**', '*Composition_of_Foods_Integrated_Dataset_2021*.xlsx'), recursive=True)
n_cofid = 0
if cof:
    ws = openpyxl.load_workbook(cof[0], read_only=True)['1.3 Proximates']
    rows = list(ws.iter_rows(values_only=True))
    head = [str(h or '') for h in rows[0]]
    col = lambda name: next(i for i, h in enumerate(head) if h.startswith(name))
    ci = {'p': col('Protein'), 'f': col('Fat'), 'c': col('Carbohydrate'), 'k': col('Energy (kcal)'), 'fi': col('AOAC fibre')}
    for r in rows[3:]:
        code, name = r[0], r[1]
        if not code or not name or skip.search(str(name)): continue
        k = num(r[ci['k']]); p = num(r[ci['p']]); fa = num(r[ci['f']])
        if k is None or p is None or fa is None: continue
        nm, he = display(str(name))
        it = {'id': 'k' + str(code).replace('-', '_'), 'n': nm, 'e': str(name), 'he': he, 'src': 'cofid', 'cc': 'GB',
              'k': round(k), 'p': round(p, 1), 'f': round(fa, 1), 'c': round(num(r[ci['c']]) or 0, 1)}
        fi = num(r[ci['fi']])
        if fi is not None: it['fi'] = round(fi, 1)
        st = state_of(str(name))
        if st: it['st'] = st
        items[it['id']] = it; n_cofid += 1

prev = {}
if os.path.exists(out):
    prev = {f['id']: f for f in json.load(open(out)).get('foods', [])}
foods = sorted(items.values(), key=lambda f: f['id'])
meta = {'sources': {
    'usda': {'name': 'USDA FoodData Central — Foundation Foods + SR Legacy', 'country': 'ארה״ב', 'url': 'https://fdc.nal.usda.gov/download-datasets', 'license': 'נחלת הכלל (CC0)', 'count': sum(1 for f in foods if f['src'] == 'usda')},
    'cofid': {'name': "McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID) 2021", 'country': 'בריטניה', 'url': 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid', 'license': 'Open Government Licence v3.0', 'count': n_cofid}},
    'imported': datetime.date.today().isoformat(), 'hebrewNames': 'תרגום אוטומטי מהתיאור באנגלית (מילון מילים); פריט שלא תורגם במלואו מוצג באנגלית',
    'updated': sum(1 for f in foods if f['id'] in prev), 'added': sum(1 for f in foods if f['id'] not in prev)}
json.dump({'meta': meta, 'foods': foods}, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
he = sum(1 for f in foods if f['he'] == 1); hh = sum(1 for f in foods if f['he'] == 2)
print(f"USDA: {meta['sources']['usda']['count']} · CoFID: {n_cofid} · סה״כ {len(foods)} · שם עברי מלא: {he} · עברית+אנגלית: {hh} · באנגלית בלבד: {len(foods) - he - hh} · חדשים {meta['added']}, עודכנו {meta['updated']}")
