// מנוע ההמלצות: מרכיב ארוחות מתוך COMPONENTS/TEMPLATES, מחשב כמויות מעשיות מול המאגר, ומדרג לפי טעם, זמן, אלרגיות ומה שנשאר.
import { COMPONENTS, TEMPLATES, componentsInText, ALLERGENS } from './catalog.js';
import { nutrients, sumNutrients, unitGrams, isVegFruit, fmtQty, unitsFor } from './foods.js';
import { mealWeights } from './nutrition.js';

// ---- משפחות חלבון: חביתה, פיתה עם ביצים וביצים קשות הן אותו מקור ----
export const MEAT_FAMS = new Set(['chicken', 'pargit', 'turkey', 'turkeyDeli', 'beef']);
export const FAM_LABEL = { egg: 'ביצים', dairy: 'מוצרי חלב', fish: 'דגים', chicken: 'עוף', pargit: 'פרגית', turkey: 'הודו', turkeyDeli: 'פסטרמה', beef: 'בקר', legumes: 'קטניות', tofu: 'טופו' };
const COMP_BY_FOOD = new Map(Object.entries(COMPONENTS).map(([k, c]) => [c.id, k]));
/** מקור החלבון העיקרי של ארוחה = הרכיב שנותן לה הכי הרבה חלבון (ביצה בציפוי לא הופכת ארוחה ל"ארוחת ביצים") */
export function mainFamily(items) {
  let best = null, bp = 0;
  for (const it of items) {
    const key = it.comp || COMP_BY_FOOD.get(it.foodId); const c = COMPONENTS[key];
    if (!c?.fam) continue;
    const p = it.protein ?? 0;
    if (p > bp) { bp = p; best = c.fam; }
  }
  return best;
}
/** מה כבר שובץ: משפחות החלבון באותו יום (בלי הארוחה הנוכחית) ובשישת הימים הקודמים */
export function familyContext({ entries = [], foods, date, slot }) {
  const byMeal = new Map();
  for (const e of entries) {
    const key = e.date + '|' + e.meal; const f = foods.get?.(e.foodId) || e.snapshot; if (!f) continue;
    if (!byMeal.has(key)) byMeal.set(key, []);
    byMeal.get(key).push({ comp: e.comp, foodId: e.foodId, protein: nutrients(f, e.grams).protein });
  }
  const dayFams = new Map(), weekFams = new Map();
  const d0 = new Date(date + 'T12:00:00Z');
  for (const [key, items] of byMeal) {
    const [d, meal] = key.split('|'); const fam = mainFamily(items); if (!fam) continue;
    if (d === date) { if (meal !== slot) dayFams.set(fam, (dayFams.get(fam) || 0) + 1); continue; }
    const diff = (d0 - new Date(d + 'T12:00:00Z')) / 864e5;
    if (diff >= 1 && diff <= 6) weekFams.set(fam, (weekFams.get(fam) || 0) + 1);
  }
  return { dayFams, weekFams };
}

/** קבוצה לתכנון: עוף (חזה, פרגית, קציצות הודו) / דג / בקר רזה / אחר */
export const famGroup = fam => ['chicken', 'pargit', 'turkey'].includes(fam) ? 'poultry' : fam === 'fish' ? 'fish' : fam === 'beef' ? 'beef' : fam ? 'other' : null;
/** קבוצת מקור חלבון לגיוון ולרשימת התחליפים. ביצה קשה, חביתה וביצים מקושקשות = מקור אחד */
export const protGroup = fam => famGroup(fam) !== 'other' ? famGroup(fam) : fam === 'egg' ? 'egg' : fam === 'dairy' ? 'dairy' : ['legumes', 'tofu'].includes(fam) ? 'plant' : fam === 'turkeyDeli' ? 'deli' : 'other';
export const GROUP_LABEL = { poultry: 'עוף', fish: 'דג', beef: 'בקר רזה', egg: 'ביצים', dairy: 'מוצרי חלב', plant: 'צמחי', deli: 'נקניק' };
const MAIN_GROUPS = ['poultry', 'fish', 'beef'];
/** אילו מבין עוף/דג/בקר רזה מותרים לפרופיל (אלרגיות, צמחונות, מה שלא אוכל) */
export function mainGroupsFor(profile, foods) {
  const filt = profileFilter(profile);
  return MAIN_GROUPS.filter(g => Object.keys(COMPONENTS).some(k => COMPONENTS[k].role === 'protein' && !COMPONENTS[k].noSwap && famGroup(COMPONENTS[k].fam) === g && filt.allowed(k) && foods.get(COMPONENTS[k].id)));
}
/** למה עוף/דג/בקר לא מוצעים: סוג תזונה, אלרגיה או מילה ברשימת ההימנעות (בלי העדפות התפריט) */
export function mainBlockers(profile = {}) {
  const base = { ...profile, menuPrefs: { ...(profile.menuPrefs || {}), dailyMain: [] } };
  const f = profileFilter(base); const out = {};
  const DIET = { vegetarian: 'צמחוני', vegan: 'טבעוני', pescatarian: 'בלי בשר' };
  for (const g of MAIN_GROUPS) {
    const keys = Object.keys(COMPONENTS).filter(k => COMPONENTS[k].role === 'protein' && !COMPONENTS[k].noSwap && famGroup(COMPONENTS[k].fam) === g);
    if (keys.some(k => f.allowed(k))) continue;
    const c = COMPONENTS[keys[0]];
    if ((profile.allergies || []).some(a => c.allergens.includes(a))) out[g] = 'אלרגיה';
    else if (DIET[profile.diet]) out[g] = `סוג תזונה: ${DIET[profile.diet]}`;
    else out[g] = `רשימת "להימנע מ-": ${(profile.avoid || []).join(', ')}`;
  }
  return out;
}
/** העדפת "בכל יום לפחות מנה עיקרית אחת של…" (ברירת מחדל: עוף או דג), רק מה שמותר לפרופיל */
export function requiredGroups(profile, foods) {
  const want = profile?.menuPrefs?.dailyMain ?? ['poultry', 'fish'];
  const ok = mainGroupsFor(profile, foods);
  return want.filter(g => ok.includes(g));
}
/** מתכונים שכבר שובצו: באותו יום (ארוחות אחרות) ובשישת הימים הקודמים, ושיטת ההכנה/הרוטב של אתמול */
export function recipeContext({ entries = [], date, slot }) {
  const dayT = new Set(), weekT = new Map(), yMethods = new Set(), ySauces = new Set();
  const seen = new Set(); const d0 = new Date(date + 'T12:00:00Z');
  for (const e of entries) {
    if (!e.recipe) continue; const key = e.date + '|' + e.meal + '|' + e.recipe; if (seen.has(key)) continue; seen.add(key);
    if (e.date === date) { if (e.meal !== slot) dayT.add(e.recipe); continue; }
    const diff = (d0 - new Date(e.date + 'T12:00:00Z')) / 864e5;
    if (diff >= 1 && diff <= 6) weekT.set(e.recipe, (weekT.get(e.recipe) || 0) + 1);
    if (diff === 1) { const t = TEMPLATES.find(x => x.id === e.recipe); if (t?.method && t.method !== 'raw') yMethods.add(t.method); if (t?.sauce && t.sauce !== 'none') ySauces.add(t.sauce); }
  }
  return { dayT, weekT, yMethods, ySauces };
}
const eggCount = items => items.reduce((a, i) => a + (COMPONENTS[i.comp]?.fam === 'egg' ? (i.qty || Math.round(i.grams / 58)) : 0), 0);
const groupUse = (fams, g) => fams ? [...fams.entries()].reduce((a, [f, n]) => a + (famGroup(f) === g ? n : 0), 0) : 0;
const MAIN_SLOTS = ['lunch', 'dinner'];

const roundTo = (x, s) => Math.round(x / s) * s;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** גרמים ליחידה של רכיב (לפי היחידה שמוגדרת לו במאגר) */
function compUnitG(comp, f) { return comp.unit ? unitGrams(f, comp.unit) : null; }

/** פריט בארוחה: רכיב + כמות. qty ביחידות (אם step) או בגרמים (אם stepG) */
export function makeItem(compKey, amount, foods) {
  const comp = COMPONENTS[compKey]; const f = foods.get(comp.id);
  if (!f) return null;
  const ug = compUnitG(comp, f);
  let grams, unit = 'g', qty = null;
  if (comp.step && ug) { qty = amount; grams = amount * ug; unit = comp.unit; }
  else grams = amount;
  const n = nutrients(f, grams);
  const approx = comp.eachG ? `כ-${fmtQty(Math.round(grams / comp.eachG * 2) / 2)} ${grams / comp.eachG > 1 ? comp.each[1] : comp.each[0]}` : !comp.step && ug && comp.unit ? `כ-${fmtQty(Math.round(grams / ug * 4) / 4)} ${unitsFor(f).find(u => u.key === comp.unit)?.label || comp.unit}` : null;
  return { comp: compKey, foodId: f.id, name: comp.name, foodName: f.n, role: comp.role, grams: Math.round(grams), unit, qty, approx, st: comp.st || f.st || null, ...n, vegFruitG: isVegFruit(f) ? grams : 0 };
}

function perAmount(compKey, foods) {
  const comp = COMPONENTS[compKey]; const f = foods.get(comp.id); const ug = compUnitG(comp, f);
  const g = comp.step && ug ? ug : 1;
  return { kcal: f.k * g / 100, protein: f.p * g / 100 };
}
function snap(comp, x) {
  const step = comp.step || comp.stepG;
  return clamp(roundTo(x, step), comp.min, comp.max);
}

// ---- סינון לפי פרופיל ----
export function profileFilter(profile = {}) {
  const allergies = new Set(profile.allergies || []);
  const avoidWords = [...(profile.avoid || []), ...String(profile.allergyOther || '').split(/[,،]+/)].map(s => String(s).replace(/[׳'"״]/g, '').trim()).filter(Boolean);
  const likeWords = (profile.likes || []).map(s => String(s).replace(/[׳'"״]/g, '').trim()).filter(Boolean);
  const fav = new Set((profile.favoriteMeals || []).flatMap(t => componentsInText(t)));
  const diet = profile.diet || 'none';
  const noAuto = new Set(profile.menuPrefs?.noAuto || []);
  const has = (c, words) => words.some(w => c.name.replace(/[׳'"״]/g, '').includes(w) || c.words.some(x => x.replace(/[׳'"״]/g, '').includes(w) || w.includes(x.replace(/[׳'"״]/g, ''))));
  // "להימנע מ-": רק אם המילה מופיעה בשם הרכיב ("דג מלוח" לא חוסם סלמון, "עוף שמן" לא חוסם חזה עוף)
  const avoids = c => avoidWords.some(w => c.name.replace(/[׳'"״]/g, '').includes(w) || c.words.some(x => x.replace(/[׳'"״]/g, '') === w));
  // מה שהמשתמש בחר במפורש ב"העדפות התפריט" (בכל יום עוף/דג/בקר) גובר על סוג התזונה ועל רשימת ההימנעות — לא על אלרגיה
  const forced = new Set(profile.menuPrefs?.dailyMain || []);
  return {
    allowed(key) {
      const c = COMPONENTS[key];
      if (c.allergens.some(a => allergies.has(a))) return false;
      if (c.role === 'protein' && c.fam && forced.has(famGroup(c.fam))) return true;
      if (avoids(c)) return false;
      if (diet === 'vegan' && (c.kosher === 'meat' || c.kosher === 'dairy' || c.allergens.includes('fish') || c.allergens.includes('egg'))) return false;
      if (diet === 'vegetarian' && (c.kosher === 'meat' || c.allergens.includes('fish'))) return false;
      if (diet === 'pescatarian' && c.kosher === 'meat') return false;
      return true;
    },
    likeWords,
    liked(key) { const c = COMPONENTS[key]; return (has(c, likeWords) ? 1 : 0) + (fav.has(key) ? 1 : 0); },
    likedFams() { return new Set(Object.keys(COMPONENTS).filter(k => COMPONENTS[k].fam && has(COMPONENTS[k], likeWords)).map(k => COMPONENTS[k].fam)); },
    /** מותר בהצעות אוטומטיות (העדפות התפריט: "לא להציע לי" — למשל טופו) */
    auto(key) { const c = COMPONENTS[key]; return !(c.role === 'protein' && c.fam && noAuto.has(c.fam)); },
    kosher: !!profile.kosher, budget: profile.budget || 'mid',
  };
}

function* combos(parts, i = 0, acc = []) {
  if (i === parts.length) { yield acc; return; }
  const p = parts[i];
  const alts = Array.isArray(p) ? p : p.opt;
  if (!Array.isArray(p)) yield* combos(parts, i + 1, acc); // חלק אופציונלי — גם בלעדיו
  for (const a of alts) yield* combos(parts, i + 1, [...acc, a]);
}

/** בונה ארוחה מרשימת רכיבים ומתאים כמויות לתקציב (קלוריות וחלבון) */
export function sizeMeal(keys, budget, foods) {
  const amt = Object.fromEntries(keys.map(k => [k, COMPONENTS[k].def]));
  const proteins = keys.filter(k => COMPONENTS[k].role === 'protein');
  const carbs = keys.filter(k => COMPONENTS[k].role === 'carb');
  const totals = () => keys.reduce((t, k) => { const p = perAmount(k, foods); t.kcal += p.kcal * amt[k]; t.protein += p.protein * amt[k]; return t; }, { kcal: 0, protein: 0 });
  // 1) חלבון: הרכיב הראשי משלים את החסר; אם הגיע למקסימום — רכיבי החלבון הנוספים משלימים
  if (proteins.length && budget.protein > 0) {
    for (const k of proteins) {
      const others = totals().protein - perAmount(k, foods).protein * amt[k];
      const need = Math.max(0, budget.protein - others);
      amt[k] = snap(COMPONENTS[k], need / perAmount(k, foods).protein);
      if (totals().protein >= budget.protein * 0.95) break;
    }
  }
  // 2) פחמימה: ממלאת את הקלוריות שנשארו
  if (carbs.length) {
    const c = carbs[0];
    const rest = totals().kcal - perAmount(c, foods).kcal * amt[c];
    amt[c] = snap(COMPONENTS[c], (budget.kcal - rest) / perAmount(c, foods).kcal);
  }
  // 3) אם עדיין חורג משמעותית — מקטינים שומן ואז חלבון משני
  let t = totals();
  if (t.kcal > budget.kcal * 1.12) {
    for (const k of keys.filter(k => COMPONENTS[k].role === 'fat' || (COMPONENTS[k].role === 'protein' && k !== proteins[0]))) {
      amt[k] = COMPONENTS[k].min; t = totals(); if (t.kcal <= budget.kcal * 1.12) break;
    }
  }
  return keys.map(k => makeItem(k, amt[k], foods)).filter(Boolean);
}

/** שם הארוחה לפי מה שבאמת בצלחת: שם התבנית רק אם נבחרו הרכיבים שהיא מתארת, אחרת "פרגית, בורגול ושעועית ירוקה" */
const SHORT = { 'אורז לבן מבושל': 'אורז', 'אורז מלא מבושל': 'אורז מלא', 'בורגול מבושל': 'בורגול', 'קוסקוס מבושל': 'קוסקוס', 'פתיתים מבושלים': 'פתיתים', 'קינואה מבושלת': 'קינואה', 'פסטה מבושלת': 'פסטה', 'תפוח אדמה אפוי': 'תפוח אדמה אפוי', 'סלט ירקות ישראלי': 'סלט', 'פרגית (ירך עוף בלי עור)': 'פרגית', 'לחם מחיטה מלאה': 'לחם מלא', 'לחם קל מחיטה מלאה': 'לחם קל' };
// המילה שמייצגת רכיב בשם הארוחה ("פרגית, אורז וסלט" + בורגול → "פרגית, בורגול וסלט")
const WORD = { bread: 'לחם', lightBread: 'לחם קל', pita: 'פיתה', wwPita: 'פיתה מלאה', tortilla: 'טורטייה', riceCakes: 'פריכיות', rice: 'אורז', brownRice: 'אורז מלא', bulgur: 'בורגול', couscous: 'קוסקוס', ptitim: 'פתיתים', quinoa: 'קינואה', pasta: 'פסטה', potato: 'תפוח אדמה', sweetPotato: 'בטטה',
  salad: 'סלט', broccoli: 'ברוקולי', greenBeans: 'שעועית ירוקה', zucchini: 'קישואים', mushrooms: 'פטריות', cucumber: 'מלפפון', tomato: 'עגבנייה', pepper: 'פלפל', carrot: 'גזר',
  cottage: 'קוטג׳', whiteCheese: 'גבינה לבנה', salmon: 'סלמון', tilapia: 'אמנון', dennis: 'דניס', seaBass: 'לברק', cod: 'בקלה', chicken: 'חזה עוף', thigh: 'פרגית', turkeyPatty: 'קציצות הודו', schnitzel: 'שניצל', steak: 'סטייק', tofu: 'טופו', lentils: 'עדשים', chickpeas: 'חומוס', tuna: 'טונה', banana: 'בננה', apple: 'תפוח', strawberry: 'תותים', clementine: 'קלמנטינה', egg: 'ביצים', hardEgg: 'ביצה קשה' };
function mealName(tpl, keys, items) {
  if (tpl.title) return fillTitle(tpl.title, items);
  let name = tpl.name;
  for (const part of (tpl.parts || []).filter(Array.isArray)) {
    const first = part[0]; const chosen = part.find(k => keys.includes(k));
    if (!chosen || chosen === first) continue;
    if (COMPONENTS[first].role === 'protein') { // מקור החלבון התחלף (למשל גבינה לבנה במקום קוטג׳)
      const w = WORD[first]; if (w && name.includes(w)) { name = name.replace(w, WORD[chosen] || COMPONENTS[chosen].name); continue; }
      const pick = role => items.find(i => i.role === role);
      return joinHe([pick('protein'), pick('carb'), pick('veg') || pick('fruit')].filter(Boolean).map(i => SHORT[i.name] || i.name));
    }
    const from = WORD[first], to = WORD[chosen] || COMPONENTS[chosen].name;
    if (from && name.includes(from)) name = name.replace(from, to);
  }
  return name;
}
// שמות לשם המנה (בתוך משפט): "פילה דניס בתנור עם תפוחי אדמה, שום ולימון"
const P_WORD = { chicken: 'חזה עוף', thigh: 'פרגית', turkeyPatty: 'קציצות הודו', schnitzel: 'שניצל עוף', steak: 'סטייק בקר', leanBeef: 'קציצות בקר רזה', sirloin: 'רצועות סינטה מוקפצות', beef: 'בקר טחון',
  salmon: 'סלמון', tilapia: 'פילה אמנון', dennis: 'פילה דניס', seaBass: 'פילה לברק', cod: 'פילה בקלה', tuna: 'טונה', tofu: 'טופו', lentils: 'עדשים', chickpeas: 'גרגרי חומוס',
  egg: 'ביצים', hardEgg: 'ביצים קשות', omelet: 'חביתה', scrambled: 'ביצים מקושקשות', cottage: 'קוטג׳', whiteCheese: 'גבינה לבנה', yogurt: 'יוגורט', yellowCheese: 'גבינה צהובה', turkey: 'פסטרמת הודו' };
const C_WORD = { potato: 'תפוחי אדמה', sweetPotato: 'בטטה', rice: 'אורז', brownRice: 'אורז מלא', bulgur: 'בורגול', couscous: 'קוסקוס', ptitim: 'פתיתים', quinoa: 'קינואה', pasta: 'פסטה', riceNoodles: 'אטריות אורז', majadra: 'מג׳דרה', pita: 'פיתה', wwPita: 'פיתה מלאה', bread: 'לחם', lightBread: 'לחם קל', tortilla: 'טורטייה', riceCakes: 'פריכיות', oats: 'שיבולת שועל' };
const V_WORD = { salad: 'סלט ירקות', broccoli: 'ברוקולי', greenBeans: 'שעועית ירוקה', zucchini: 'קישואים', mushrooms: 'פטריות', cucumber: 'מלפפון', tomato: 'עגבניות', pepper: 'פלפלים', carrot: 'גזר' };
const wordOf = (it, map) => map[it.comp] || SHORT[it.name] || String(it.name).split(/[,(]/)[0].trim();
/** שם מנה מתבנית עם אופי: {p} {c} {v} לפי מה שבאמת בצלחת */
function fillTitle(title, items) {
  const by = role => items.find(i => i.role === role);
  const pRole = by('protein'), c = by('carb'), v = by('veg');
  return title.replace('{p}', pRole ? wordOf(pRole, P_WORD) : 'מנה').replace('{c}', c ? wordOf(c, C_WORD) : '').replace('{v}', v ? wordOf(v, V_WORD) : '')
    .replace(/ עם ,/, ' עם').replace(/ ו$/, '').replace(/\s+/g, ' ').trim();
}
const joinHe = xs => xs.length <= 1 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' ו' + xs[xs.length - 1];
/**
 * ניקוד ארוחה. כל משקל מבוסס על הנחיה או מחקר (ראו SOURCES): חלבון למנה ושובע (dhillon2016), סיבים (clark2013),
 * ירקות וצפיפות קלורית (rolls2009), גיוון מקורות חלבון לפי צלחת האוכל הבריא (moh_guidelines), וכללי הגיוון של האפליקציה (dec_variety).
 * ההסבר בכרטיס נבנה מהמספרים בפועל.
 */
function scoreOption(items, keys, tpl, budget, ctx, filt) {
  const tot = sumNutrients(items);
  const why = [];
  let s = 100;
  const kErr = Math.abs(tot.kcal - budget.kcal) / Math.max(budget.kcal, 150);
  s -= kErr * 120;
  if (budget.protein > 0) {
    const short = Math.max(0, budget.protein - tot.protein) / budget.protein;
    s -= short * 90;
  }
  s += Math.min(10, tot.fiber * 0.8);
  s += Math.min(8, tot.vegFruitG / 40);
  const satiety = tot.kcal > 0 ? (tot.protein * 4 + tot.fiber * 2) / tot.kcal * 100 : 0; // חלבון וסיבים ל-100 קק״ל
  s += Math.min(10, satiety / 4);
  // זמן הכנה: מנה עיקרית שאפשר לבשל מראש (עוף, קציצות, עדשים) לא נפסלת בצהריים/ערב בגלל זמן הבישול
  const main = ['lunch', 'dinner'].includes(ctx.slot) && tpl?.parts && keys.some(k => COMPONENTS[k].cookAhead);
  const prep = Math.max(...keys.map(k => COMPONENTS[k].prep || 0)) + (keys.length > 3 ? 3 : 0);
  if (ctx.maxPrep && prep > ctx.maxPrep) s -= main ? 6 : 25 + (prep - ctx.maxPrep);
  for (const k of keys) {
    const lk = filt.liked(k); if (lk) { s += 7 * lk; }
    const rec = ctx.recent?.get?.(k) || 0; s -= rec * (COMPONENTS[k].role === 'protein' ? 3 : 2.5);
    if (COMPONENTS[k].budget === 'high' && filt.budget === 'low') s -= 10;
  }
  // גיוון לפי מקור החלבון העיקרי
  const fam = mainFamily(items);
  const day = ctx.dayFams?.get?.(fam) || 0, week = ctx.weekFams?.get?.(fam) || 0;
  if (fam && day) s -= 35;
  else if (MAIN_GROUPS.includes(famGroup(fam)) && groupUse(ctx.dayFams, famGroup(fam))) s -= 30; // פרגית אחרי חזה עוף באותו יום = שוב עוף
  if (fam) s -= week * 6;
  const likedFams = ctx.likedFams || filt.likedFams();
  const likesMeat = [...likedFams].some(f => MEAT_FAMS.has(f));
  if (ctx.slot === 'lunch' && likesMeat && !ctx.wantGroup) { if (MEAT_FAMS.has(fam) && fam !== 'turkeyDeli') s += 22; else if (fam === 'egg' || fam === 'dairy') s -= 20; }
  // "יום שלם": עוף בארוחה עיקרית אחת ודג בשנייה (כשהפרופיל מאפשר)
  if (ctx.wantGroup) { if ([].concat(ctx.wantGroup).includes(famGroup(fam))) s += 45; else if (MAIN_SLOTS.includes(ctx.slot)) s -= 12; }
  // מנה עיקרית עם שם ואופי (תבלין, רוטב, שיטת הכנה) עדיפה על "חלבון, פחמימה וסלט"
  if (tpl?.title && MAIN_SLOTS.includes(ctx.slot)) s += 8;
  // גיוון ברמת המתכון: אותו מתכון בשבוע האחרון, ושיטת הכנה/רוטב כמו אתמול או כמו המנה שמחליפים
  if (tpl) {
    s -= (ctx.weekT?.get?.(tpl.id) || 0) * 25;
    if (tpl.method && ctx.yMethods?.has?.(tpl.method)) s -= 4;
    if (tpl.sauce && ctx.ySauces?.has?.(tpl.sauce)) s -= 4;
    if (ctx.avoidMethod && tpl.method === ctx.avoidMethod) s -= 10;
    if (ctx.avoidSauce && tpl.sauce === ctx.avoidSauce && tpl.sauce !== 'none') s -= 10;
    // הטעם מוביל: מתכון שמופיע במאכלים שאני אוהב (שווארמה, שניצל, סלמון…)
    const likeW = (filt.likeWords || []); const text = (tpl.title || tpl.name || '') + ' ' + (tpl.desc || '');
    if (likeW.some(w => w.length > 2 && text.includes(w))) s += 8;
  }
  // הסבר מהמספרים בפועל
  if (tot.protein >= 12) why.push(`מספק ${Math.round(tot.protein)} ג׳ חלבון למנה`);
  const plants = items.filter(i => ['veg', 'fruit'].includes(i.role) || COMPONENTS[i.comp]?.fam === 'legumes').map(i => i.name);
  if (plants.length) why.push(`כולל ${joinHe(plants)}`);
  if (tot.fiber >= 6) why.push(`${Math.round(tot.fiber)} ג׳ סיבים`);
  const liked = keys.filter(k => filt.liked(k)).map(k => COMPONENTS[k].name);
  if (liked.length) why.unshift(`מה שאתה אוהב: ${joinHe(liked)}`);
  if (fam && !week && !day && ctx.weekFams) why.push(`גיוון: ${FAM_LABEL[fam]} לא הוצעו בששת הימים האחרונים`);
  if (prep <= 5) why.push('מוכן תוך כמה דקות');
  return { score: s, totals: tot, prep, why, fam };
}

/** הצעות לארוחה: 2–3 אפשרויות שונות */
export function suggestMeals(ctx, budget, n = 3) {
  const { foods, slot, profile } = ctx;
  const filt = profileFilter(profile);
  const pantry = ctx.pantry ? new Set(ctx.pantry) : null;
  const slotKey = slot === 'night' ? 'snack' : slot;
  const cands = [];
  const tpls = TEMPLATES.filter(t => t.slots.includes(slotKey) || (ctx.anySlot && budget.kcal > 250));
  for (const tpl of tpls) {
    for (const keys0 of combos(tpl.parts)) {
      let keys = [...new Set(keys0)];
      if (!keys.every(k => filt.allowed(k))) continue;
      if (!pantry && !keys.every(k => filt.auto(k))) continue;
      if (ctx.dayT?.has?.(tpl.id)) continue; // אותה מנה לא פעמיים באותו יום
      if (!keys.every(k => foods.get(COMPONENTS[k].id))) continue; // רכיב ממאגר שעוד לא נטען (USDA ברקע) — מדלגים בלי לקרוס
      if (filt.kosher && keys.some(k => COMPONENTS[k].kosher === 'meat') && keys.some(k => COMPONENTS[k].kosher === 'dairy')) continue;
      if (pantry) {
        const core = keys.filter(k => ['protein', 'carb'].includes(COMPONENTS[k].role));
        if (!core.every(k => pantry.has(k))) continue;
        keys = keys.filter(k => pantry.has(k) || COMPONENTS[k].role === 'fat' && k === 'oliveOil'); // שמן לטיגון — מניחים שיש
        if (keys.filter(k => pantry.has(k)).length < Math.min(2, pantry.size)) continue;
      }
      if (ctx.noCook && keys.some(k => !COMPONENTS[k].nocook && COMPONENTS[k].role !== 'fat')) continue;
      const items = sizeMeal(keys, budget, foods);
      if (items.length !== keys.length) continue;
      // לכל היותר ארוחה אחת ביום שמבוססת על ביצים (אלא אם המשתמש מחפש במפורש לפי מה שיש בבית)
      if (!pantry && ctx.dayFams?.get?.('egg') && mainFamily(items) === 'egg') continue;
      if (!pantry && ctx.dayEggs && ctx.dayEggs + eggCount(items) > 4) continue; // לא יותר מ-4 ביצים ביום
      const sc = scoreOption(items, keys, tpl, budget, ctx, filt);
      cands.push({ key: tpl.id + ':' + keys.join('+'), templateId: tpl.id, title: tpl.title || null, tpl, name: mealName(tpl, keys, items), slot, items, keys, ...sc });
    }
  }
  if (pantry && !cands.length) { const adhoc = pantryAdhoc(ctx, budget, filt); if (adhoc) cands.push(adhoc); }
  cands.sort((a, b) => b.score - a.score);
  // "חובה" (יום שלם / הארוחה העיקרית האחרונה בלי עוף ודג / החלפת המנה היחידה): רק מהקבוצות המבוקשות
  if (ctx.strict && ctx.wantGroup) { const want = [].concat(ctx.wantGroup); const only = cands.filter(c => want.includes(famGroup(c.fam))); if (only.length) cands.splice(0, cands.length, ...only); }
  // ההצעות שונות זו מזו: תבנית שונה ומקור חלבון עיקרי שונה (לא שלוש גרסאות של ביצים)
  const out = []; const usedT = new Set(); const usedF = new Set(); const usedCarb = new Set(); const usedFat = new Set();
  const take = c => { out.push(finalize(c)); usedT.add(c.templateId); if (c.fam) usedF.add(c.fam); const cb = c.keys.find(k => COMPONENTS[k].role === 'carb'); if (cb) usedCarb.add(cb); const ft = c.keys.find(k => COMPONENTS[k].role === 'fat'); if (ft) usedFat.add(ft); };
  // "הצע לי": בארוחה עיקרית — אפשרות עוף, אפשרות דג ואפשרות ממקור אחר, עם תוספות ושומן שונים
  if (ctx.diverse && MAIN_SLOTS.includes(slot) && !pantry) {
    // קודם הקבוצות שעוד לא הופיעו היום (אחרי עוף בצהריים — דג ובקר בערב), ואז לפי השבוע
    const groups = (ctx.strict && ctx.wantGroup ? [].concat(ctx.wantGroup) : [...MAIN_GROUPS]).sort((a, b) => groupUse(ctx.dayFams, a) - groupUse(ctx.dayFams, b) || groupUse(ctx.weekFams, a) - groupUse(ctx.weekFams, b));
    for (const g of ctx.strict && ctx.wantGroup ? [...groups, ...groups] : [...groups, 'other']) {
      if (out.length >= n) break;
      const ok = c => (g === 'other' ? !MAIN_GROUPS.includes(famGroup(c.fam)) : famGroup(c.fam) === g) && !ctx.exclude?.has?.(c.templateId) && !usedT.has(c.templateId) && !usedF.has(c.fam);
      const fresh = c => !c.keys.some(k => (COMPONENTS[k].role === 'carb' && usedCarb.has(k)) || (COMPONENTS[k].role === 'fat' && usedFat.has(k)));
      const c = cands.find(c => ok(c) && fresh(c) && c.score > -60) || cands.find(c => ok(c) && c.score > -60);
      if (c) take(c);
    }
  }
  for (const c of cands) {
    if (out.length >= n) break;
    if (usedT.has(c.templateId) || (c.fam && usedF.has(c.fam)) || ctx.exclude?.has?.(c.templateId)) continue;
    take(c);
  }
  return out;
}
export const PLANNER_SOURCES = ['moh_guidelines', 'dhillon2016', 'clark2013', 'rolls2009', 'dec_variety', 'dec_portions'];

function pantryAdhoc(ctx, budget, filt) {
  const keys = ctx.pantry.filter(k => filt.allowed(k));
  if (!keys.length) return null;
  const items = sizeMeal(keys, budget, ctx.foods);
  const sc = scoreOption(items, keys, null, budget, ctx, filt);
  return { key: 'pantry:' + keys.join('+'), templateId: 'pantry', name: 'ארוחה ממה שיש בבית: ' + keys.map(k => COMPONENTS[k].name).join(', '), slot: ctx.slot, items, keys, ...sc };
}

const r1 = x => Math.round(x * 10) / 10;
function shapeItem({ comp, foodId, name, foodName, role, grams, unit, qty, approx, st, kcal, protein, fat, carbs, fiber, vegFruitG }) {
  return { comp: comp || null, foodId, name, foodName, role, grams, unit, qty, approx, st: st || null, kcal: Math.round(kcal), protein: r1(protein), fat: r1(fat), carbs: r1(carbs), fiber: r1(fiber || 0), vegFruitG: Math.round(vegFruitG || 0) };
}
function finalize(c) {
  const t = c.totals; const tpl = c.tpl || TEMPLATES.find(x => x.id === c.templateId);
  return {
    key: c.key, templateId: c.templateId, title: c.title || null, name: c.name, slot: c.slot, prep: tpl?.time || c.prep, why: c.why.slice(0, 4), fam: c.fam || null,
    descT: tpl?.desc || null, stepsT: tpl?.steps || null, method: tpl?.method || null, sauce: tpl?.sauce || null,
    desc: tpl?.desc ? fillTitle(tpl.desc, c.items) : null, steps: (tpl?.steps || []).map(x => fillTitle(x, c.items)),
    items: c.items.map(shapeItem),
    totals: { kcal: Math.round(t.kcal), protein: Math.round(t.protein), fat: Math.round(t.fat), carbs: Math.round(t.carbs), fiber: Math.round(t.fiber), vegFruitG: Math.round(t.vegFruitG) },
  };
}

// ---- תקציב לפי מה שנשאר ----
/** entries: רשומות היום. item נחשב "תפוס" בארוחה אם נאכל או תוכנן. */
export function dayTotals(entries, foods) {
  const eaten = []; const planned = [];
  for (const e of entries) {
    const f = foods.get(e.foodId) || e.snapshot;
    if (!f) continue;
    if (e.status === 'eaten') eaten.push({ ...nutrients(f, e.eatenGrams ?? e.grams), vegFruitG: isVegFruit(f) ? (e.eatenGrams ?? e.grams) : 0 });
    else planned.push({ ...nutrients(f, e.grams), vegFruitG: isVegFruit(f) ? e.grams : 0 });
  }
  return { eaten: sumNutrients(eaten), planned: sumNutrients(planned) };
}

/** כמה קלוריות וחלבון להקצות לארוחה, לפי היתרה היומית והארוחות שעדיין פתוחות */
export function budgetForSlot({ profile, target, entries, foods, slot, openSlots }) {
  const weights = mealWeights(profile);
  const slotsWithItems = new Set(entries.map(e => e.meal));
  const open = (openSlots || weights.filter(w => !slotsWithItems.has(w.id) || w.id === slot).map(w => w.id));
  const used = { kcal: 0, protein: 0 };
  for (const e of entries) {
    if (e.meal === slot && e.status !== 'eaten') continue; // את התכנון של הארוחה הזו מחליפים
    const f = foods.get(e.foodId) || e.snapshot; if (!f) continue;
    const n = nutrients(f, e.status === 'eaten' ? (e.eatenGrams ?? e.grams) : e.grams);
    used.kcal += n.kcal; used.protein += n.protein;
  }
  const remain = { kcal: Math.max(0, (target?.kcal || 0) - used.kcal), protein: Math.max(0, (target?.protein || 0) - used.protein) };
  const shares = weights.filter(w => open.includes(w.id));
  const tot = shares.reduce((a, b) => a + b.share, 0) || 1;
  const me = weights.find(w => w.id === slot)?.share || 0.3;
  const frac = open.includes(slot) ? me / tot : 1;
  const kcal = Math.max(slot.startsWith('snack') || slot === 'night' ? 120 : 250, Math.round(remain.kcal * frac));
  return { kcal, protein: Math.round(remain.protein * frac), remain, frac, open };
}

/** "בנה לי יום שלם": ממלא את כל הארוחות הפתוחות (שלא ננעלו ואין בהן אוכל שנאכל) */
export function planDay(ctx) {
  const { profile, target, foods } = ctx;
  const entries = [...(ctx.entries || [])];
  const locked = new Set(ctx.locked || []);
  const weights = mealWeights(profile);
  const fixed = new Set(entries.filter(e => locked.has(e.meal) || e.status === 'eaten').map(e => e.meal));
  const toFill = weights.filter(w => !fixed.has(w.id)).map(w => w.id);
  const kept = entries.filter(e => fixed.has(e.meal));
  const recent = new Map(ctx.recent || []);
  // מה כבר יש היום (רק ארוחות שנשארות: נעולות/שנאכלו) ובשבוע האחרון — לגיוון
  const hist = ctx.history || entries;
  const fc = ctx.date ? familyContext({ entries: hist.filter(e => e.date !== ctx.date || fixed.has(e.meal)), foods, date: ctx.date, slot: null }) : { dayFams: new Map(), weekFams: ctx.weekFams || new Map() };
  const dayFams = new Map(fc.dayFams); const weekFams = ctx.weekFams || fc.weekFams;
  const rc = ctx.date ? recipeContext({ entries: hist.filter(e => e.date !== ctx.date || fixed.has(e.meal)), date: ctx.date, slot: null }) : { dayT: new Set(), weekT: new Map(), yMethods: new Set(), ySauces: new Set() };
  const dayT = new Set(rc.dayT); let dayEggs = 0;
  const filt0 = profileFilter(profile); const likedFams = filt0.likedFams();
  // עוף, דג ובקר רזה: בצהריים מנה בשרית (עוף או בקר), בערב קבוצה אחרת (בדרך כלל דג). מה שכבר נאכל היום יוצא,
  // ובין הימים מתחלפים לפי מה שהופיע בשבוע האחרון. ארוחה עיקרית אחת → בחירה בין הקבוצות.
  // העדפת הפרופיל "בכל יום לפחות עוף או דג": אחת הארוחות העיקריות היא מהקבוצות האלה — כבר בתפריט הראשון.
  const groups = mainGroupsFor(profile, foods); const req = requiredGroups(profile, foods);
  const haveReq = req.some(g => groupUse(dayFams, g));
  const order = gs => gs.filter(g => !groupUse(dayFams, g)).sort((a, b) => groupUse(weekFams, a) - groupUse(weekFams, b) || MAIN_GROUPS.indexOf(a) - MAIN_GROUPS.indexOf(b));
  const mainsOpen = toFill.filter(s => MAIN_SLOTS.includes(s));
  const want = {};
  const free = order(groups);
  if (mainsOpen.length >= 2 && free.length) {
    // עלות לקבוצה: כמה הופיעה השבוע; מה שחובה בפרופיל (עוף/דג) קודם; בקר — לא יותר מפעמיים-שלוש בשבוע
    const cost = g => groupUse(weekFams, g) - (req.includes(g) ? 0.5 : 0) + (g === 'beef' ? 1.5 : 0);
    const sorted = [...free].sort((a, b) => cost(a) - cost(b) || MAIN_GROUPS.indexOf(a) - MAIN_GROUPS.indexOf(b));
    const first = (mainsOpen[0] === 'lunch' && sorted.find(g => g !== 'fish')) || sorted[0];
    want[mainsOpen[0]] = first;
    const second = sorted.find(g => g !== first);
    if (second) want[mainsOpen[1]] = second;
    if (req.length && !haveReq && !mainsOpen.some(s => req.includes(want[s]))) {
      const g = order(req)[0] || req[0]; want[mainsOpen[1]] = g; if (want[mainsOpen[0]] === g) want[mainsOpen[0]] = free.find(x => x !== g) || g;
    }
  } else if (mainsOpen.length === 1 && free.length >= 2) want[mainsOpen[0]] = 'choose';
  else if (mainsOpen.length === 1 && free.length === 1) want[mainsOpen[0]] = free[0];
  // בחירה בארוחה עיקרית אחת: קודם מה שחובה (עוף/דג), אחר כך השאר
  const chooseOrder = [...free].sort((a, b) => (haveReq ? 0 : (req.includes(b) ? 1 : 0) - (req.includes(a) ? 1 : 0)));
  const plan = [];
  for (const slot of toFill) {
    const open = toFill.filter(s => !plan.some(p => p.slot === s));
    const b = budgetForSlot({ profile, target, entries: [...kept, ...plan.flatMap(p => p.items.map(i => ({ meal: p.slot, foodId: i.foodId, grams: i.grams, status: 'planned' })))], foods, slot, openSlots: open });
    const base = { ...ctx, slot, recent, dayFams, weekFams, likedFams, dayT, dayEggs, weekT: rc.weekT, yMethods: rc.yMethods, ySauces: rc.ySauces };
    let opt, alts = null;
    if (want[slot] === 'choose') {
      alts = chooseOrder.map(g => suggestMeals({ ...base, wantGroup: g, strict: true }, b, 1)[0]).filter((o, i) => o && famGroup(o.fam) === chooseOrder[i]);
      opt = alts[0] || suggestMeals(base, b, 1)[0];
      if (alts.length < 2) alts = null;
    } else opt = suggestMeals({ ...base, wantGroup: want[slot], strict: !!want[slot] }, b, 1)[0];
    if (opt) {
      plan.push({ slot, option: opt, items: opt.items, budget: b, alts });
      for (const k of opt.items.map(i => i.comp)) recent.set(k, (recent.get(k) || 0) + 1);
      if (opt.fam) dayFams.set(opt.fam, (dayFams.get(opt.fam) || 0) + 1);
      dayT.add(opt.templateId); dayEggs += eggCount(opt.items);
    }
  }
  topUpProtein(plan, kept, ctx);
  return plan.map(p => ({ slot: p.slot, option: p.option, alts: p.alts ? p.alts.map((a, i) => i === 0 || a.key === p.option.key ? (a.key === p.alts[0].key ? p.option : a) : a) : null, budget: p.budget }));
}

/** חסר חלבון ביום? קודם מגדילים את מנת החלבון של הארוחה העיקרית (עוף/בשר/דג/קטניות) — לא מוסיפים עוד ביצים או קוטג׳ */
function topUpProtein(plan, kept, ctx) {
  const { target, foods } = ctx; if (!target?.protein) return;
  const keptP = kept.reduce((a, e) => { const f = foods.get(e.foodId) || e.snapshot; return a + (f ? nutrients(f, e.grams).protein : 0); }, 0);
  const keptK = kept.reduce((a, e) => { const f = foods.get(e.foodId) || e.snapshot; return a + (f ? nutrients(f, e.grams).kcal : 0); }, 0);
  const sum = () => plan.reduce((a, p) => { a.p += p.option.totals.protein; a.k += p.option.totals.kcal; return a; }, { p: keptP, k: keptK });
  // סבב 1: מנות עיקריות (עוף/בשר/דג/קטניות/טופו). סבב 2 (רק אם עדיין חסר): מוצר החלב שכבר בארוחה. ארוחת ביצים נוספת — אף פעם.
  const order = [['lunch', 'dinner', 'breakfast', 'snack', 'snack1', 'night'], ['breakfast', 'dinner', 'snack', 'snack1', 'night', 'lunch']];
  for (const [round, slots] of order.entries()) for (const slot of slots) {
    const t = sum(); const deficit = target.protein - t.p;
    if (deficit <= target.protein * 0.05) return;
    const p = plan.find(x => x.slot === slot); if (!p || p.option.fam === 'egg' || (round === 0 && p.option.fam === 'dairy') || (round === 1 && p.option.fam !== 'dairy')) continue;
    const keys = p.option.items.map(i => i.comp);
    const items = sizeMeal(keys, { kcal: p.option.totals.kcal, protein: p.option.totals.protein + deficit }, foods);
    if (items.length !== keys.length) continue;
    const nt = sumNutrients(items);
    if (t.k - p.option.totals.kcal + nt.kcal > target.kcal * 1.06) continue; // לא חורגים מהקלוריות
    const gained = Math.round(nt.protein - p.option.totals.protein); if (gained < 3) continue;
    const opt = finalize({ ...p.option, keys, items, totals: nt, why: [`מספק ${Math.round(nt.protein)} ג׳ חלבון למנה`, `המנה הוגדלה ב-${gained} ג׳ חלבון כדי להשלים את יעד היום`, ...p.option.why.filter(w => !w.startsWith('מספק'))] });
    opt.fam = p.option.fam; p.option = opt; p.items = opt.items;
  }
}

/** "הצע לי את הארוחה הבאה": הארוחה הראשונה שעוד לא נאכלה ושעת היעד שלה לא עברה מזמן */
export function nextSlot(profile, entries, nowMinutes) {
  const weights = mealWeights(profile);
  const eatenSlots = new Set(entries.filter(e => e.status === 'eaten').map(e => e.meal));
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const open = weights.filter(w => !eatenSlots.has(w.id));
  if (!open.length) return null;
  return (open.find(w => toMin(w.time) >= nowMinutes - 75) || open[open.length - 1]).id;
}

/** החלפת רכיב אחד: חלבון מוחלף לפי חלבון, השאר לפי קלוריות. מחזיר פריט חדש ואת השינוי */
export function swapItem(oldItem, newCompKey, foods) {
  const comp = COMPONENTS[newCompKey]; const f = foods.get(comp.id); const of = foods.get(oldItem.foodId) || oldItem.snapshot;
  const old = nutrients(of, oldItem.grams);
  const per = perAmount(newCompKey, foods);
  const byProtein = comp.role === 'protein' && (COMPONENTS[oldItem.comp]?.role === 'protein' || old.protein >= 10);
  const raw = byProtein ? old.protein / per.protein : old.kcal / per.kcal;
  const amt = clamp(roundTo(raw, comp.step || comp.stepG), comp.step || comp.stepG, comp.max * 1.5);
  const item = makeItem(newCompKey, amt, foods);
  return { item, delta: { kcal: Math.round(item.kcal - old.kcal), protein: Math.round((item.protein - old.protein) * 10) / 10 }, matchedBy: byProtein ? 'חלבון' : 'קלוריות', old: { kcal: Math.round(old.kcal), protein: Math.round(old.protein * 10) / 10 } };
}

// ---- החלפת רכיב בתוך ארוחה מוצעת ----
export const SWAP_LABEL = { protein: 'החלף חלבון', carb: 'החלף פחמימה', fat: 'החלף שומן', veg: 'החלף ירק', fruit: 'החלף פרי', extra: 'החלף' };
const MATCH = { protein: ['protein', 'p'], carb: ['carbs', 'c'], fat: ['fat', 'f'] };
/**
 * כמות לתחליף: מנה שמתקרבת לערך העיקרי של הרכיב המקורי לפי הערכים במאגר —
 * חלבון לפי גרמי חלבון, פחמימה לפי גרמי פחמימה, שומן לפי גרמי שומן, ירק/פרי לפי משקל.
 * הערכים המוצגים מחושבים מכל רכיבי המזון (למשל גם השומן שבסלמון).
 */
function amountFor(old, f, comp) {
  const m = MATCH[old.role]; let grams;
  if (m && old[m[0]] > 0.5 && f[m[1]] > 0.5) grams = old[m[0]] / (f[m[1]] / 100);
  else if (old.role === 'veg' || old.role === 'fruit') grams = old.grams;
  else grams = old.kcal / Math.max(1, f.k / 100);
  if (comp) {
    const ug = compUnitG(comp, f);
    if (comp.step && ug) return clamp(roundTo(grams / ug, comp.step), comp.min, comp.max);
    return clamp(roundTo(grams, comp.stepG || 10), comp.min, comp.max);
  }
  return clamp(roundTo(grams, grams > 60 ? 10 : 5), 5, 600);
}
/** פריט ממזון שאינו רכיב מוגדר (נבחר מהמאגר המלא) */
export function itemFromFood(f, grams, role) {
  return { comp: null, foodId: f.id, name: f.n.split(',')[0], foodName: f.n, role, grams: Math.round(grams), unit: 'g', qty: null, approx: null, st: f.st || null, ...nutrients(f, grams), vegFruitG: isVegFruit(f) ? grams : 0 };
}
export function substituteFor(old, newKey, foods) {
  const comp = COMPONENTS[newKey]; const f = foods.get(comp.id); if (!f) return null;
  return makeItem(newKey, amountFor(old, f, comp), foods);
}
export function substituteFood(old, f) { return itemFromFood(f, amountFor(old, f, null), old.role); }

const sumT = items => { const t = sumNutrients(items); return { kcal: Math.round(t.kcal), protein: Math.round(t.protein), fat: Math.round(t.fat), carbs: Math.round(t.carbs), fiber: Math.round(t.fiber), vegFruitG: Math.round(t.vegFruitG) }; };
// צורות הכנה של ביצים — שורה אחת ברשימה, ואחרי הבחירה בוחרים איך
const EGG_FORMS = [['omelet', 'חביתה'], ['scrambled', 'מקושקשות'], ['hardEgg', 'קשות'], ['egg', 'ביצים']];
/**
 * תחליפים לרכיב בארוחה: אותו תפקיד, מותר בפרופיל, לא כבר בארוחה.
 * חלבון בצהריים ובערב: קודם עוף, דג ובקר רזה (המתאים ביותר מכל קבוצה), ואז השאר. ביצים מקובצות לשורה אחת עם צורות הכנה.
 * בשר בארוחה שיש בה מוצר חלב (בפרופיל כשר): מוצר החלב יוצא מהמנה — רשום ב-drops ובהערה.
 * לכל אפשרות: הפריט החדש ו-meal — סיכום הארוחה אחרי ההחלפה.
 */
export function swapChoices(option, idx, { foods, profile, dayFams, weekFams } = {}) {
  const old = option.items[idx]; const filt = profileFilter(profile || {});
  const main = MAIN_SLOTS.includes(option.slot);
  const others = option.items.map((it, i) => ({ it, i })).filter(x => x.i !== idx);
  const inMeal = new Set(others.map(x => x.it.comp));
  const kindOf = it => COMPONENTS[it.comp]?.kosher;
  const raw = [];
  for (const k of Object.keys(COMPONENTS)) {
    const c = COMPONENTS[k];
    if (c.role !== old.role || c.noSwap || k === old.comp || inMeal.has(k) || !filt.allowed(k) || !filt.auto(k) || !foods.get(c.id)) continue;
    let drops = [];
    if (filt.kosher && c.kosher !== 'parve') {
      const clash = others.filter(x => (c.kosher === 'meat' && kindOf(x.it) === 'dairy') || (c.kosher === 'dairy' && kindOf(x.it) === 'meat'));
      if (clash.length) { if (!(main && c.kosher === 'meat' && clash.every(x => x.it.role !== 'carb'))) continue; drops = clash.map(x => x.i); }
    }
    const item = substituteFor(old, k, foods); if (!item) continue;
    const g = protGroup(c.fam);
    const used = (dayFams?.get?.(c.fam) ? 8 : 0) + (weekFams?.get?.(c.fam) || 0) * 1.5;
    const rank = filt.liked(k) * 10 - used - Math.abs(item.kcal - old.kcal) / 60 + (c.lean ? 2 : 0);
    const items = option.items.map((it, i) => i === idx ? item : it).filter((_, i) => !drops.includes(i));
    raw.push({ key: k, item: shapeItem(item), rank, group: old.role === 'protein' ? g : null, drops, note: drops.length ? `בלי ${joinHe(drops.map(i => option.items[i].name))} (בשר וחלב)` : '', meal: sumT(items) });
  }
  raw.sort((a, b) => b.rank - a.rank);
  // ביצים: שורה אחת (הצורה המועדפת ראשונה), צורות ההכנה האחרות כ-variants
  let out = raw;
  const eggs = raw.filter(x => x.group === 'egg');
  if (eggs.length > 1) {
    const byKey = new Map(eggs.map(x => [x.key, x]));
    const forms = EGG_FORMS.filter(([k]) => byKey.has(k)).map(([k, label]) => ({ ...byKey.get(k), label }));
    const head = { ...eggs[0], variants: forms };
    out = raw.filter(x => x.group !== 'egg' || x === eggs[0]).map(x => x === eggs[0] ? head : x);
  }
  // צהריים/ערב: עוף, דג ובקר רזה בראש הרשימה (מה שלא הופיע היום קודם)
  if (old.role === 'protein' && main) {
    const gs = [...MAIN_GROUPS].sort((a, b) => groupUse(dayFams, a) - groupUse(dayFams, b) || MAIN_GROUPS.indexOf(a) - MAIN_GROUPS.indexOf(b));
    const heads = gs.map(g => out.find(x => x.group === g)).filter(Boolean);
    out = [...heads, ...out.filter(x => !heads.includes(x))];
  }
  return out;
}
/** מחליף פריט אחד ומחשב מחדש: שם המנה, הסיכום וההסבר. שאר הרכיבים נשארים (חוץ מ-drop — מוצר חלב שיוצא מארוחה בשרית) */
export function applySwap(option, idx, newItem, { drop = [] } = {}) {
  const items = option.items.map((it, i) => i === idx ? shapeItem(newItem) : it).filter((_, i) => !drop.includes(i));
  const o = option.items[idx]; const word = i => WORD[i.comp] || SHORT[i.name] || String(i.name).split(',')[0];
  const pick = role => items.find(i => i.role === role);
  let name;
  if (option.title) name = fillTitle(option.title, items);
  else {
    // "חזה עוף, אורז וסלט" → "חזה עוף, בטטה וסלט"
    const ow = [WORD[o.comp], SHORT[o.name], o.name].filter(Boolean).find(w => option.name.includes(w));
    name = ow ? option.name.replace(ow, word(newItem))
      : ['fat', 'extra', 'sauce'].includes(o.role) ? option.name
      : joinHe([pick('protein'), pick('carb'), pick('veg') || pick('fruit')].filter(Boolean).map(word));
  }
  const t = sumNutrients(items);
  const plants = items.filter(i => ['veg', 'fruit'].includes(i.role) || COMPONENTS[i.comp]?.fam === 'legumes').map(i => i.name);
  const why = [...(t.protein >= 12 ? [`מספק ${Math.round(t.protein)} ג׳ חלבון למנה`] : []), ...(plants.length ? [`כולל ${joinHe(plants)}`] : []), ...(t.fiber >= 6 ? [`${Math.round(t.fiber)} ג׳ סיבים`] : []), `הוחלף: ${o.name} ← ${newItem.name}`, ...(drop.length ? [`${joinHe(drop.map(i => option.items[i].name))} הוצא מהמנה (בשר וחלב)`] : [])];
  return { ...option, name, items, fam: mainFamily(items), why, totals: sumT(items), ...(option.descT ? { desc: fillTitle(option.descT, items) } : {}), ...(option.stepsT ? { steps: option.stepsT.map(x => fillTitle(x, items)) } : {}) };
}
/** "הצע מנה אחרת": מנה חדשה לאותה ארוחה ולאותו יעד, שלא הוצעה עדיין (exclude — תבניות שכבר הוצגו) */
export function otherMeal(ctx, budget, exclude = new Set()) {
  const opts = suggestMeals({ ...ctx, diverse: false, exclude }, budget, 1);
  if (opts.length) return opts[0];
  return suggestMeals({ ...ctx, diverse: false }, budget, 4).find(o => !exclude.has(o.templateId)) || null;
}

/** חלופות מתאימות להחלפה (אותו תפקיד בארוחה) */
export function swapCandidates(compKey, profile) {
  const role = COMPONENTS[compKey]?.role; if (!role) return [];
  const filt = profileFilter(profile);
  return Object.keys(COMPONENTS).filter(k => k !== compKey && COMPONENTS[k].role === role && filt.allowed(k));
}

export function allergyText(keys) { return keys.map(k => ALLERGENS[k] || k).join(', '); }
