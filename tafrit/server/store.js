// לוגיקת הנתונים. כל פונקציה מקבלת uid של המשתמש המחובר, וכל קריאה/כתיבה ב-DB מסוננת לפיו.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDoc, listDocs, putDoc, deleteDoc, docHistory, newId, now, tx } from './db.js';
import { FoodIndex, customFood, recipeFood, nutrients, manualFood } from '../shared/foods.js';
import { israelDate, isISO, addDays } from '../shared/dates.js';
import { computeTargets, targetFor, withTraining } from '../shared/nutrition.js';
import { uniqueByDate } from '../shared/weights.js';
import { planPeriods, planFor, profileOn, pickPlanFields, PLAN_FIELDS } from '../shared/plans.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FOODS_FILE = path.join(ROOT, 'data', 'foods.json');
const foodsData = JSON.parse(fs.readFileSync(FOODS_FILE, 'utf8'));
export const FOODS_META = foodsData.meta;
export const err = (status, message) => Object.assign(new Error(message), { status });
const today = () => israelDate();

// ---- מאגר המזון: משותף לכולם; מוצרים אישיים ומתכונים — לכל משתמש בנפרד ----
export const globalFoods = new FoodIndex(foodsData.foods);
// מאגרים עולמיים (USDA FoodData Central, CoFID) — קובץ נפרד, כדי שהאפליקציה תיטען מהר ותוסיף אותם ברקע
export const WORLD_FILE = path.join(ROOT, 'data', 'foods-world.json');
export const WORLD_META = fs.existsSync(WORLD_FILE) ? (() => { const w = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8')); globalFoods.add(w.foods); return w.meta; })() : null;
const personal = new Map(); // uid → FoodIndex של המוצרים והמתכונים שלו
/** תצוגת מזון של משתמש: המאגר הכללי + הפריטים האישיים שלו בלבד */
export function foodsFor(uid) {
  if (!personal.has(uid)) refreshPersonalFoods(uid);
  const mine = personal.get(uid);
  return {
    get: id => (id?.startsWith('c:') || id?.startsWith('r:')) ? mine.get(id) : globalFoods.get(id),
    search(q, opts = {}) {
      const a = mine.search(q, opts); const b = globalFoods.search(q, opts);
      return [...a, ...b].slice(0, opts.limit || 40);
    },
    personal: () => mine.list,
  };
}
export function refreshPersonalFoods(uid) {
  const idx = new FoodIndex([]);
  idx.add(listDocs(uid, 'custom').map(customFood));
  const view = { get: id => idx.get(id) || globalFoods.get(id) };
  idx.add(listDocs(uid, 'recipes').map(r => recipeFood(r, view)));
  personal.set(uid, idx);
}
export function dropUserCache(uid) { personal.delete(uid); }

// ---- פרופיל ותוכניות ----
export function getProfile(uid) { return getDoc(uid, 'profile', 'me'); }
export function saveProfile(uid, p) {
  if (!p || typeof p !== 'object') throw err(400, 'פרופיל חסר');
  const clean = { ...p }; delete clean.id; delete clean.createdAt; delete clean.updatedAt; delete clean.planId;
  return putDoc(uid, 'profile', 'me', clean);
}
export function plans(uid) { return listDocs(uid, 'plans'); }
export function activePlan(uid, date = today()) { return planFor(plans(uid), date); }
export function profileOnDate(uid, date = today()) { return profileOn(getProfile(uid), plans(uid), date); }

/**
 * הפעלת תוכנית: שומר תקופה חדשה + יעד מאותו תאריך. ההיסטוריה (תוכניות ויעדים קודמים) לא משתנה.
 * היעדים מחושבים מחדש בשרת מהפרופיל + ההגדרות החדשות, ולא נלקחים כמו שהם מהלקוח (חוץ מיעדים מקצועיים).
 */
export function activatePlan(uid, body) {
  const profile = getProfile(uid); if (!profile) throw err(400, 'אין פרופיל');
  const startDate = isISO(body.startDate) ? body.startDate : today();
  if (startDate < today() && body.kind !== 'initial') throw err(400, 'אפשר להתחיל תוכנית מהיום או מתאריך עתידי');
  const goal = ['lose', 'gain', 'maintain', 'recomp'].includes(body.goal) ? body.goal : null; if (!goal) throw err(400, 'מטרה לא תקינה');
  const settings = pickPlanFields(body.settings || {});
  delete settings.goal;
  const eff = { ...profile, ...settings, goal };
  const w = +(body.weightKg) || latestWeight(uid)?.kg; if (!w) throw err(400, 'חסר משקל בוקר');
  const t = computeTargets(eff, w);
  if (t.mode === 'blocked') throw err(400, t.eligibility.reasons.join(' '));
  const targets = { kcal: t.kcal, protein: t.protein, carbs: t.carbs ?? null, fat: t.fat ?? null, fiber: t.fiber ?? null };
  return tx(() => {
    const planId = newId('p');
    const plan = putDoc(uid, 'plans', planId, {
      kind: body.kind || 'goal_change', goal, settings, startDate, targets, menuMode: body.menuMode || 'keep',
      sampleDay: Array.isArray(body.sampleDay) ? body.sampleDay.slice(0, 8) : [], basedOn: body.basedOn || null, reason: String(body.reason || '').slice(0, 300),
      weightAtStart: w, mode: t.mode,
    });
    const target = putDoc(uid, 'targets', newId('t'), { effectiveFrom: startDate, ...targets, reason: body.reason || 'הפעלת תוכנית', source: 'plan', planId, mode: t.mode, expectedWeekly: t.expectedWeekly ?? null });
    return { plan, target };
  });
}
/** ביטול תוכנית עתידית שעוד לא התחילה */
export function cancelPlan(uid, planId) {
  const p = getDoc(uid, 'plans', planId); if (!p) throw err(404, 'התוכנית לא נמצאה');
  if (p.startDate <= today()) throw err(400, 'אפשר לבטל רק תוכנית שעוד לא התחילה');
  return tx(() => {
    for (const t of listDocs(uid, 'targets').filter(t => t.planId === planId)) deleteDoc(uid, 'targets', t.id);
    deleteDoc(uid, 'plans', planId); return { ok: true };
  });
}

// ---- שקילות: אחת לכל תאריך (שעון ישראל) ----
export function upsertWeight(uid, { date, kg, note }) {
  date = date || today();
  if (!isISO(date)) throw err(400, 'תאריך לא תקין');
  if (date > today()) throw err(400, 'אי אפשר לרשום שקילה בתאריך עתידי');
  kg = Math.round(parseFloat(String(kg).replace(',', '.')) * 100) / 100;
  if (!(kg >= 30 && kg <= 350)) throw err(400, 'משקל לא סביר — בדוק את המספר');
  const prev = getDoc(uid, 'weights', date);
  const w = putDoc(uid, 'weights', date, { date, kg, note: note || prev?.note || '' }, prev ? 'update' : 'create');
  return { weight: w, existed: !!prev, previous: prev ? prev.kg : null };
}
export function deleteWeight(uid, date) { return deleteDoc(uid, 'weights', date); }
export function weights(uid) { return uniqueByDate(listDocs(uid, 'weights')); }
export function latestWeight(uid, onOrBefore = today()) { const l = weights(uid).filter(w => w.date <= onOrBefore); return l[l.length - 1] || null; }

// ---- יעדים ----
export function targets(uid) { return listDocs(uid, 'targets').sort((a, b) => a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : a.createdAt - b.createdAt); }
export function addTarget(uid, t) {
  const effectiveFrom = isISO(t.effectiveFrom) ? t.effectiveFrom : today();
  const kcal = Math.round(+t.kcal); const protein = Math.round(+t.protein);
  if (!(kcal >= 800 && kcal <= 6000)) throw err(400, 'יעד קלוריות לא סביר');
  if (!(protein >= 20 && protein <= 400)) throw err(400, 'יעד חלבון לא סביר');
  const plan = activePlan(uid, effectiveFrom);
  return putDoc(uid, 'targets', newId('t'), { effectiveFrom, kcal, protein, carbs: +t.carbs || null, fat: +t.fat || null, fiber: +t.fiber || null, reason: t.reason || '', source: t.source || 'manual', mode: t.mode || 'auto', details: t.details || null, expectedWeekly: t.expectedWeekly ?? null, planId: plan?.id || null });
}
export function currentTarget(uid, date = today()) { return withTraining(targetFor(targets(uid), date), getDoc(uid, 'days', date)); }
export function previewTargets(uid, kg, profile) {
  const p = profile || profileOnDate(uid);
  const w = kg || latestWeight(uid)?.kg;
  if (!p || !w) return null;
  return computeTargets(p, +w);
}

// ---- יומן ----
const SNAP = f => ({ n: f.n, src: f.src, k: f.k, p: f.p, f: f.f, c: f.c, fi: f.fi ?? null, u: f.u || [], st: f.st || null, g: f.g, vf: f.vf, ...(f.pp ? { pp: f.pp } : {}) });
export function entriesFor(uid, from, to) { return listDocs(uid, 'entries').filter(e => e.date >= from && e.date <= to).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt); }
export function addEntries(uid, list) {
  const foods = foodsFor(uid);
  if (!Array.isArray(list) || list.length > 40) throw err(400, 'רשימה לא תקינה');
  return tx(() => list.map(e => {
    const f = e.manual ? manualSnap(e.manual) : foods.get(e.foodId); if (!f) throw err(400, 'המזון לא נמצא במאגר');
    const date = isISO(e.date) ? e.date : today();
    const grams = Math.round(+e.grams * 10) / 10; if (!(grams > 0 && grams <= 5000)) throw err(400, 'כמות לא תקינה');
    const status = e.status === 'eaten' ? 'eaten' : 'planned';
    return putDoc(uid, 'entries', newId('e'), {
      date, meal: String(e.meal || 'breakfast').slice(0, 20), foodId: e.manual ? newId('q:') : f.id, snapshot: SNAP(f), grams, unit: e.unit || 'g', qty: e.qty ?? null,
      status, plannedGrams: status === 'planned' ? grams : (e.plannedGrams ?? null), eatenGrams: status === 'eaten' ? grams : null,
      source: e.source || 'manual', comp: e.comp || null, order: e.order ?? now(), ...(e.label ? { label: String(e.label).slice(0, 80) } : {}), ...(e.group ? { group: String(e.group).slice(0, 40) } : {}), ...(e.recipe ? { recipe: String(e.recipe).slice(0, 40) } : {}),
    });
  }));
}
/** רישום ידני (שם + ערכים) או ערכים שנקראו מתמונה — בלי מוצר במאגר. הערכים נשמרים ברישום עצמו */
function manualSnap(m) {
  const f = manualFood(m || {});
  if (!f.n) throw err(400, 'חסר שם למנה');
  const max = f.pp ? 5000 : 900;
  for (const k of ['k', 'p', 'c', 'f']) if (!(f[k] >= 0 && f[k] <= max)) throw err(400, f.pp ? 'ערכים לא סבירים למנה' : 'ערכים לא סבירים ל-100 ג׳');
  return f;
}
export function updateEntry(uid, id, patch) {
  const e = getDoc(uid, 'entries', id); if (!e) throw err(404, 'הרישום לא נמצא');
  const next = { ...e };
  if (patch.grams != null) { const g = Math.round(+patch.grams * 10) / 10; if (!(g > 0 && g <= 5000)) throw err(400, 'כמות לא תקינה'); next.grams = g; if (next.status === 'eaten') next.eatenGrams = g; else next.plannedGrams = g; }
  if (patch.unit !== undefined) next.unit = patch.unit; if (patch.qty !== undefined) next.qty = patch.qty;
  if (patch.status === 'eaten') { next.status = 'eaten'; next.eatenGrams = patch.eatenGrams != null ? +patch.eatenGrams : next.grams; next.grams = next.eatenGrams; next.eatenAt = now(); }
  if (patch.status === 'planned') { next.status = 'planned'; next.grams = next.plannedGrams || next.grams; next.eatenGrams = null; }
  if (patch.meal) next.meal = String(patch.meal).slice(0, 20);
  if (patch.foodId && patch.foodId !== e.foodId) { const f = foodsFor(uid).get(patch.foodId); if (!f) throw err(400, 'המזון לא נמצא'); next.foodId = f.id; next.snapshot = SNAP(f); next.comp = patch.comp || null; }
  return putDoc(uid, 'entries', id, next, patch.status ? 'status' : 'update');
}
export function deleteEntry(uid, id) { if (!getDoc(uid, 'entries', id)) throw err(404, 'הרישום לא נמצא'); return deleteDoc(uid, 'entries', id); }
export function entryHistory(uid, id) { if (!getDoc(uid, 'entries', id)) throw err(404, 'הרישום לא נמצא'); return docHistory(uid, 'entries', id); }

export function days(uid, from, to) { const o = {}; for (const d of listDocs(uid, 'days')) if (d.id >= from && d.id <= to) o[d.id] = d; return o; }
export function setDay(uid, date, patch) {
  if (!isISO(date)) throw err(400, 'תאריך לא תקין');
  const d = getDoc(uid, 'days', date) || { locked: [], complete: false };
  const next = { ...d, ...('cups' in patch ? { cups: Math.max(0, Math.min(60, Math.round(+patch.cups) || 0)) } : {}), ...('train' in patch ? { train: !!patch.train } : {}), ...('complete' in patch ? { complete: !!patch.complete } : {}), ...(Array.isArray(patch.locked) ? { locked: [...new Set(patch.locked)].slice(0, 8) } : {}), ...('note' in patch ? { note: String(patch.note || '').slice(0, 500) } : {}) };
  return putDoc(uid, 'days', date, next);
}

// ---- מוצרים אישיים, מתכונים, מועדפים, ארוחות קבועות ----
export function saveCustom(uid, c) {
  if (!c.name) throw err(400, 'חסר שם מוצר');
  for (const k of ['k', 'p', 'f', 'c']) if (!(+c[k] >= 0)) throw err(400, 'חסרים ערכים ל-100 גרם');
  if (+c.k > 900) throw err(400, 'יותר מ-900 קק״ל ל-100 גרם — בדוק את התווית');
  const id = c.id && getDoc(uid, 'custom', c.id) ? c.id : newId('c');
  const barcode = normBarcode(c.barcode);
  if (barcode) { const dup = findByBarcode(uid, barcode); if (dup && dup.id !== id) throw err(400, `הברקוד הזה כבר שמור על "${dup.name}"`); }
  const d = putDoc(uid, 'custom', id, { barcode: barcode || null, name: String(c.name).slice(0, 120), brand: String(c.brand || '').slice(0, 80), k: +c.k, p: +c.p, f: +c.f, c: +c.c, fi: c.fi === '' || c.fi == null ? null : +c.fi, na: c.na === '' || c.na == null ? null : +c.na, unitName: String(c.unitName || '').slice(0, 40), unitGrams: +c.unitGrams || null, st: c.st || null, origin: c.origin === 'usda' ? 'usda' : 'label', fdcId: c.fdcId || null, vf: !!c.vf });
  refreshPersonalFoods(uid); return { ...d, food: foodsFor(uid).get('c:' + id) };
}
export const normBarcode = s => String(s || '').replace(/\D/g, '').slice(0, 20);
const bcKey = s => normBarcode(s).replace(/^0+/, '');
/** מוצר אישי לפי ברקוד (מתעלם מאפסים מובילים: UPC-A מול EAN-13) */
export function findByBarcode(uid, code) { const k = bcKey(code); return k ? listDocs(uid, 'custom').find(c => c.barcode && bcKey(c.barcode) === k) || null : null; }
export function linkBarcode(uid, customId, code) {
  const c = getDoc(uid, 'custom', customId); if (!c) throw err(404, 'המוצר לא נמצא');
  const bc = normBarcode(code); if (bc.length < 6) throw err(400, 'ברקוד קצר מדי');
  const dup = findByBarcode(uid, bc); if (dup && dup.id !== customId) throw err(400, `הברקוד הזה כבר שמור על "${dup.name}"`);
  const { id, createdAt, updatedAt, ...rest } = c; const d = putDoc(uid, 'custom', customId, { ...rest, barcode: bc }); refreshPersonalFoods(uid); return d;
}
export function saveRecipe(uid, r) {
  if (!r.name) throw err(400, 'חסר שם מתכון');
  if (!Array.isArray(r.items) || !r.items.length || r.items.length > 60) throw err(400, 'הוסף לפחות רכיב אחד');
  const foods = foodsFor(uid);
  for (const it of r.items) if (!foods.get(it.foodId) || !(+it.grams > 0)) throw err(400, 'רכיב לא תקין במתכון');
  const id = r.id && getDoc(uid, 'recipes', r.id) ? r.id : newId('r');
  const d = putDoc(uid, 'recipes', id, { name: String(r.name).slice(0, 120), items: r.items.map(i => ({ foodId: i.foodId, grams: +i.grams })), cookedGrams: +r.cookedGrams || null, servings: +r.servings || null, note: String(r.note || '').slice(0, 500) });
  refreshPersonalFoods(uid); return { ...d, food: foodsFor(uid).get('r:' + id) };
}
export function removePersonal(uid, col, id) { if (!getDoc(uid, col, id)) throw err(404, 'לא נמצא'); const ok = deleteDoc(uid, col, id); refreshPersonalFoods(uid); return ok; }
export function setFavorite(uid, foodId, on) {
  if (on) { if (!foodsFor(uid).get(foodId)) throw err(400, 'המזון לא נמצא'); return putDoc(uid, 'favorites', foodId, { foodId }); }
  return { ok: deleteDoc(uid, 'favorites', foodId) };
}
export function saveFixedMeal(uid, body) {
  if (!body.name || !Array.isArray(body.items) || !body.items.length) throw err(400, 'חסר שם או רכיבים');
  const id = body.id && getDoc(uid, 'fixedMeals', body.id) ? body.id : newId('f');
  const foods = foodsFor(uid);
  const items = body.items.slice(0, 20).map(i => {
    if (!(+i.grams > 0 && +i.grams <= 5000)) throw err(400, 'כמות לא תקינה בארוחה');
    if (i.manual) { const m = manualSnap(i.manual); return { foodId: 'q', manual: { name: m.n, k: m.k, p: m.p, c: m.c, f: m.f, per: m.pp ? 'portion' : '100g' }, grams: +i.grams, unit: i.unit || 'g', qty: i.qty ?? null, comp: null }; }
    if (!foods.get(i.foodId)) throw err(400, 'מזון לא נמצא בארוחה');
    return { foodId: i.foodId, grams: +i.grams, unit: i.unit || 'g', qty: i.qty ?? null, comp: i.comp || null };
  });
  return putDoc(uid, 'fixedMeals', id, { name: String(body.name).slice(0, 80), items });
}
export function saveCheckin(uid, week, body) {
  if (!isISO(week)) throw err(400, 'תאריך לא תקין');
  const c = k => body[k] == null ? null : Math.max(1, Math.min(5, +body[k]));
  return putDoc(uid, 'checkins', week, { hunger: c('hunger'), energy: c('energy'), performance: c('performance'), note: String(body.note || '').slice(0, 500) });
}

/** משתמש קיים בלי תוכניות (נתונים מהגרסה הקודמת): יוצרים "תוכנית ראשונה" מהפרופיל, מהתאריך של היעד הראשון.
 *  לא יוצרים יעד חדש — היעדים הקיימים נשארים כמו שהם, ולכן ההיסטוריה לא משתנה. */
export function ensureInitialPlan(uid) {
  const profile = getProfile(uid);
  if (!profile?.onboarding?.done || plans(uid).length) return null;
  const ts = targets(uid); if (!ts.length) return null;
  const first = ts[0];
  return putDoc(uid, 'plans', newId('p'), { kind: 'initial', goal: profile.goal || 'maintain', settings: pickPlanFields(profile), startDate: first.effectiveFrom, targets: { kcal: first.kcal, protein: first.protein, carbs: first.carbs || null, fat: first.fat || null }, menuMode: 'keep', sampleDay: [], reason: 'התוכנית שהייתה בתוקף לפני הוספת התוכניות', migrated: true });
}

/** כל מה שהמסכים צריכים — של המשתמש המחובר בלבד */
export function state(uid) {
  ensureInitialPlan(uid);
  const t = today(); const from = addDays(t, -150);
  return {
    today: t, profile: getProfile(uid), plans: planPeriods(plans(uid)), weights: weights(uid), targets: targets(uid),
    entries: entriesFor(uid, from, addDays(t, 30)), days: days(uid, from, addDays(t, 30)),
    custom: listDocs(uid, 'custom'), recipes: listDocs(uid, 'recipes').map(r => ({ ...r, food: foodsFor(uid).get('r:' + r.id) })),
    favorites: listDocs(uid, 'favorites'), fixedMeals: listDocs(uid, 'fixedMeals'), checkins: Object.fromEntries(listDocs(uid, 'checkins').map(c => [c.id, c])),
    foodsMeta: { ...FOODS_META, world: WORLD_META },
  };
}
const COLS = ['profile', 'plans', 'weights', 'entries', 'days', 'targets', 'custom', 'recipes', 'favorites', 'fixedMeals', 'checkins'];
export function exportAll(uid) {
  return { app: 'tafrit-yomi-robi', version: 2, exportedAt: new Date().toISOString(), data: Object.fromEntries(COLS.map(c => [c, listDocs(uid, c)])) };
}
export function importAll(uid, dump) {
  if (dump?.app !== 'tafrit-yomi-robi' || !dump.data) throw err(400, 'קובץ גיבוי לא מוכר');
  let n = 0;
  tx(() => { for (const [col, docs] of Object.entries(dump.data)) { if (!COLS.includes(col) || !Array.isArray(docs)) continue; for (const d of docs) { if (!d?.id) continue; putDoc(uid, col, String(d.id), d, 'import'); n++; } } });
  refreshPersonalFoods(uid);
  return { imported: n };
}

/** סיכום יום: נאכל בפועל / מתוכנן / יעד / נשאר — לפי היעד שבתוקף באותו יום */
export function daySummary(uid, date = today()) {
  const es = entriesFor(uid, date, date); const tgt = currentTarget(uid, date); const foods = foodsFor(uid);
  const eaten = { kcal: 0, protein: 0, fiber: 0 }; const planned = { kcal: 0, protein: 0 };
  for (const e of es) {
    const f = foods.get(e.foodId) || e.snapshot; const n = nutrients(f, e.grams);
    if (e.status === 'eaten') { eaten.kcal += n.kcal; eaten.protein += n.protein; eaten.fiber += n.fiber; } else { planned.kcal += n.kcal; planned.protein += n.protein; }
  }
  const r = x => Math.round(x);
  const plan = activePlan(uid, date);
  return { date, plan: plan ? { id: plan.id, goal: plan.goal, startDate: plan.startDate, endDate: plan.endDate } : null, target: tgt ? { kcal: tgt.kcal, protein: tgt.protein, carbs: tgt.carbs, fat: tgt.fat, since: tgt.effectiveFrom } : null, eaten: { kcal: r(eaten.kcal), protein: r(eaten.protein), fiber: r(eaten.fiber) }, planned: { kcal: r(planned.kcal), protein: r(planned.protein) }, remaining: tgt ? { kcal: r(tgt.kcal - eaten.kcal), protein: r(tgt.protein - eaten.protein) } : null, entries: es };
}

/** נתונים לצפיית מנהל (קריאה בלבד) */
export function adminView(uid) { const s = state(uid); return { profile: s.profile, plans: s.plans, targets: s.targets, weights: s.weights, entries: s.entries.slice(-150), days: s.days, checkins: s.checkins, counts: { custom: s.custom.length, recipes: s.recipes.length, favorites: s.favorites.length } }; }
export { PLAN_FIELDS };
