// מנוע ההמלצות: מרכיב ארוחות מתוך COMPONENTS/TEMPLATES, מחשב כמויות מעשיות מול המאגר, ומדרג לפי טעם, זמן, אלרגיות ומה שנשאר.
import { COMPONENTS, TEMPLATES, componentsInText, ALLERGENS } from './catalog.js';
import { nutrients, sumNutrients, unitGrams, isVegFruit, fmtQty, unitsFor } from './foods.js';
import { mealWeights } from './nutrition.js';

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

function scoreOption(items, keys, tpl, budget, ctx, filt) {
  const tot = sumNutrients(items);
  const why = [];
  let s = 100;
  const kErr = Math.abs(tot.kcal - budget.kcal) / Math.max(budget.kcal, 150);
  s -= kErr * 120;
  if (budget.protein > 0) {
    const short = Math.max(0, budget.protein - tot.protein) / budget.protein;
    s -= short * 90;
    if (short < 0.1) why.push('עומד ביעד החלבון לארוחה');
  }
  s += Math.min(10, tot.fiber * 0.8);
  s += Math.min(8, tot.vegFruitG / 40);
  if (tot.vegFruitG >= 150) why.push('כולל ירקות או פרי');
  if (tot.fiber >= 6) why.push(`${Math.round(tot.fiber)} ג׳ סיבים`);
  const satiety = tot.kcal > 0 ? (tot.protein * 4 + tot.fiber * 2) / tot.kcal * 100 : 0; // חלבון וסיבים ל-100 קק״ל
  s += Math.min(10, satiety / 4);
  const prep = Math.max(...keys.map(k => COMPONENTS[k].prep || 0)) + (keys.length > 3 ? 3 : 0);
  if (ctx.maxPrep && prep > ctx.maxPrep) s -= 25 + (prep - ctx.maxPrep);
  else if (prep <= 5) why.push('מוכן תוך כמה דקות');
  for (const k of keys) {
    const lk = filt.liked(k); if (lk) { s += 7 * lk; }
    const rec = ctx.recent?.get?.(k) || 0; s -= rec * (COMPONENTS[k].role === 'protein' ? 6 : 2.5);
    if (COMPONENTS[k].budget === 'high' && filt.budget === 'low') s -= 10;
  }
  if (keys.some(k => filt.liked(k))) why.unshift('מבוסס על מה שאתה אוהב');
  const mainP = keys.find(k => COMPONENTS[k].role === 'protein');
  if (mainP && !(ctx.recent?.get?.(mainP))) why.push('מגוון לעומת השבוע');
  return { score: s, totals: tot, prep, why };
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
      const sc = scoreOption(items, keys, tpl, budget, ctx, filt);
      cands.push({ key: tpl.id + ':' + keys.join('+'), templateId: tpl.id, name: tpl.name, slot, items, keys, ...sc });
    }
  }
  if (pantry && !cands.length) { const adhoc = pantryAdhoc(ctx, budget, filt); if (adhoc) cands.push(adhoc); }
  cands.sort((a, b) => b.score - a.score);
  const out = []; const usedT = new Set(); const usedP = new Set();
  for (const c of cands) {
    const mainP = c.keys.find(k => COMPONENTS[k].role === 'protein');
    if (usedT.has(c.templateId) || (mainP && usedP.has(mainP))) continue;
    out.push(finalize(c)); usedT.add(c.templateId); if (mainP) usedP.add(mainP);
    if (out.length >= n) break;
  }
  return out;
}

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
    key: c.key, templateId: c.templateId, name: c.name, slot: c.slot, prep: c.prep, why: c.why.slice(0, 3),
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
  const plan = [];
  for (const slot of toFill) {
    const open = toFill.filter(s => !plan.some(p => p.slot === s));
    const b = budgetForSlot({ profile, target, entries: [...kept, ...plan.flatMap(p => p.items.map(i => ({ meal: p.slot, foodId: i.foodId, grams: i.grams, status: 'planned' })))], foods, slot, openSlots: open });
    const opt = suggestMeals({ ...ctx, slot, recent }, b, 1)[0];
    if (opt) { plan.push({ slot, option: opt, items: opt.items }); for (const k of opt.items.map(i => i.comp)) recent.set(k, (recent.get(k) || 0) + 2); }
  }
  return plan.map(p => ({ slot: p.slot, option: p.option }));
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
