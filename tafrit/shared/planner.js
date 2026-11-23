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
  const approx = !comp.step && ug && comp.unit ? `כ-${fmtQty(Math.round(grams / ug * 4) / 4)} ${unitsFor(f).find(u => u.key === comp.unit)?.label || comp.unit}` : null;
  return { comp: compKey, foodId: f.id, name: comp.name, foodName: f.n, role: comp.role, grams: Math.round(grams), unit, qty, approx, ...n, vegFruitG: isVegFruit(f) ? grams : 0 };
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
  const has = (c, words) => words.some(w => c.name.replace(/[׳'"״]/g, '').includes(w) || c.words.some(x => x.replace(/[׳'"״]/g, '').includes(w) || w.includes(x.replace(/[׳'"״]/g, ''))));
  return {
    allowed(key) {
      const c = COMPONENTS[key];
      if (c.allergens.some(a => allergies.has(a))) return false;
      if (has(c, avoidWords)) return false;
      if (diet === 'vegan' && (c.kosher === 'meat' || c.kosher === 'dairy' || c.allergens.includes('fish') || c.allergens.includes('egg'))) return false;
      if (diet === 'vegetarian' && (c.kosher === 'meat' || c.allergens.includes('fish'))) return false;
      if (diet === 'pescatarian' && c.kosher === 'meat') return false;
      return true;
    },
    liked(key) { const c = COMPONENTS[key]; return (has(c, likeWords) ? 1 : 0) + (fav.has(key) ? 1 : 0); },
    likedFams() { return new Set(Object.keys(COMPONENTS).filter(k => COMPONENTS[k].fam && has(COMPONENTS[k], likeWords)).map(k => COMPONENTS[k].fam)); },
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
  cottage: 'קוטג׳', whiteCheese: 'גבינה לבנה', banana: 'בננה', apple: 'תפוח', strawberry: 'תותים', clementine: 'קלמנטינה', egg: 'ביצים', hardEgg: 'ביצה קשה' };
function mealName(tpl, keys, items) {
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
  if (fam) s -= week * 6;
  const likedFams = ctx.likedFams || filt.likedFams();
  const likesMeat = [...likedFams].some(f => MEAT_FAMS.has(f));
  if (ctx.slot === 'lunch' && likesMeat) { if (MEAT_FAMS.has(fam) && fam !== 'turkeyDeli') s += 22; else if (fam === 'egg' || fam === 'dairy') s -= 20; }
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
      const sc = scoreOption(items, keys, tpl, budget, ctx, filt);
      cands.push({ key: tpl.id + ':' + keys.join('+'), templateId: tpl.id, name: mealName(tpl, keys, items), slot, items, keys, ...sc });
    }
  }
  if (pantry && !cands.length) { const adhoc = pantryAdhoc(ctx, budget, filt); if (adhoc) cands.push(adhoc); }
  cands.sort((a, b) => b.score - a.score);
  // ההצעות שונות זו מזו: תבנית שונה ומקור חלבון עיקרי שונה (לא שלוש גרסאות של ביצים)
  const out = []; const usedT = new Set(); const usedF = new Set();
  for (const c of cands) {
    if (usedT.has(c.templateId) || (c.fam && usedF.has(c.fam))) continue;
    out.push(finalize(c)); usedT.add(c.templateId); if (c.fam) usedF.add(c.fam);
    if (out.length >= n) break;
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

function finalize(c) {
  const t = c.totals;
  return {
    key: c.key, templateId: c.templateId, name: c.name, slot: c.slot, prep: c.prep, why: c.why.slice(0, 4), fam: c.fam || null,
    items: c.items.map(({ comp, foodId, name, foodName, role, grams, unit, qty, approx, kcal, protein, fat, carbs, fiber, vegFruitG }) => ({ comp, foodId, name, foodName, role, grams, unit, qty, approx, kcal: Math.round(kcal), protein: Math.round(protein * 10) / 10, fat: Math.round(fat * 10) / 10, carbs: Math.round(carbs * 10) / 10, fiber: Math.round(fiber * 10) / 10, vegFruitG: Math.round(vegFruitG) })),
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
  // מה כבר יש היום (ארוחות נעולות/שנאכלו) ובשבוע האחרון — לגיוון
  const fc = ctx.date ? familyContext({ entries: ctx.history || entries, foods, date: ctx.date, slot: null }) : { dayFams: new Map(), weekFams: ctx.weekFams || new Map() };
  const dayFams = new Map(fc.dayFams); const weekFams = ctx.weekFams || fc.weekFams;
  const likedFams = profileFilter(profile).likedFams();
  const plan = [];
  for (const slot of toFill) {
    const open = toFill.filter(s => !plan.some(p => p.slot === s));
    const b = budgetForSlot({ profile, target, entries: [...kept, ...plan.flatMap(p => p.items.map(i => ({ meal: p.slot, foodId: i.foodId, grams: i.grams, status: 'planned' })))], foods, slot, openSlots: open });
    const opt = suggestMeals({ ...ctx, slot, recent, dayFams, weekFams, likedFams }, b, 1)[0];
    if (opt) {
      plan.push({ slot, option: opt, items: opt.items, budget: b });
      for (const k of opt.items.map(i => i.comp)) recent.set(k, (recent.get(k) || 0) + 1);
      if (opt.fam) dayFams.set(opt.fam, (dayFams.get(opt.fam) || 0) + 1);
    }
  }
  topUpProtein(plan, kept, ctx);
  return plan.map(p => ({ slot: p.slot, option: p.option }));
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

/** חלופות מתאימות להחלפה (אותו תפקיד בארוחה) */
export function swapCandidates(compKey, profile) {
  const role = COMPONENTS[compKey]?.role; if (!role) return [];
  const filt = profileFilter(profile);
  return Object.keys(COMPONENTS).filter(k => k !== compKey && COMPONENTS[k].role === role && filt.allowed(k));
}

export function allergyText(keys) { return keys.map(k => ALLERGENS[k] || k).join(', '); }
