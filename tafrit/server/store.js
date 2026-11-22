// לוגיקת הנתונים: פרופיל, שקילות, יומן, יעדים, מוצרים אישיים ומתכונים. גם הצ׳אט וגם המסכים עוברים דרך כאן.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDoc, listDocs, putDoc, deleteDoc, docHistory, newId, now, tx } from './db.js';
import { FoodIndex, customFood, recipeFood, nutrients } from '../shared/foods.js';
import { israelDate, isISO, addDays } from '../shared/dates.js';
import { computeTargets, targetFor } from '../shared/nutrition.js';
import { uniqueByDate } from '../shared/weights.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FOODS_FILE = path.join(ROOT, 'data', 'foods.json');
const foodsData = JSON.parse(fs.readFileSync(FOODS_FILE, 'utf8'));
export const FOODS_META = foodsData.meta;

export const err = (status, message) => Object.assign(new Error(message), { status });
const today = () => israelDate();

// ---- אינדקס מזון: מאגר לאומי + מוצרים אישיים + מתכונים ----
export const foods = new FoodIndex(foodsData.foods);
export function refreshPersonalFoods() {
  for (const f of foods.list.filter(f => f.src !== 'moh')) foods.remove(f.id);
  foods.add(listDocs('custom').map(customFood));
  // מתכונים יכולים להכיל מוצרים אישיים — בונים אחרי שהם נטענו
  foods.add(listDocs('recipes').map(r => recipeFood(r, foods)));
}
refreshPersonalFoods();

// ---- פרופיל ----
export function getProfile() { return getDoc('profile', 'me'); }
export function saveProfile(p) {
  if (!p || typeof p !== 'object') throw err(400, 'פרופיל חסר');
  const clean = { ...p }; delete clean.id;
  return putDoc('profile', 'me', clean);
}

// ---- שקילות: אחת לכל תאריך (לפי שעון ישראל) ----
export function upsertWeight({ date, kg, note }) {
  date = date || today();
  if (!isISO(date)) throw err(400, 'תאריך לא תקין');
  if (date > today()) throw err(400, 'אי אפשר לרשום שקילה בתאריך עתידי');
  kg = Math.round(parseFloat(String(kg).replace(',', '.')) * 100) / 100;
  if (!(kg >= 30 && kg <= 350)) throw err(400, 'משקל לא סביר — בדוק את המספר');
  const prev = getDoc('weights', date);
  const w = putDoc('weights', date, { date, kg, note: note || prev?.note || '' }, prev ? 'update' : 'create');
  return { weight: w, existed: !!prev, previous: prev ? prev.kg : null };
}
export function deleteWeight(date) { return deleteDoc('weights', date); }
export function weights() { return uniqueByDate(listDocs('weights')); }
export function latestWeight(onOrBefore = today()) { const l = weights().filter(w => w.date <= onOrBefore); return l[l.length - 1] || null; }

// ---- יעדים: כל יעד חל מתאריך, וההיסטוריה נשמרת ----
export function targets() { return listDocs('targets').sort((a, b) => a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : a.createdAt - b.createdAt); }
export function addTarget(t) {
  const effectiveFrom = isISO(t.effectiveFrom) ? t.effectiveFrom : today();
  const kcal = Math.round(+t.kcal); const protein = Math.round(+t.protein);
  if (!(kcal >= 800 && kcal <= 6000)) throw err(400, 'יעד קלוריות לא סביר');
  if (!(protein >= 20 && protein <= 400)) throw err(400, 'יעד חלבון לא סביר');
  return putDoc('targets', newId('t'), { effectiveFrom, kcal, protein, fiber: +t.fiber || null, reason: t.reason || '', source: t.source || 'manual', mode: t.mode || 'auto', details: t.details || null, expectedWeekly: t.expectedWeekly ?? null });
}
export function currentTarget(date = today()) { return targetFor(targets(), date); }
/** מחשב יעדים מהפרופיל ומהשקילה האחרונה (לא שומר) */
export function previewTargets(profile = getProfile(), kg) {
  const w = kg || latestWeight()?.kg || profile?.weightKg;
  if (!profile || !w) return null;
  return computeTargets(profile, +w);
}

// ---- יומן ----
const SNAP = f => ({ n: f.n, src: f.src, k: f.k, p: f.p, f: f.f, c: f.c, fi: f.fi ?? null, u: f.u || [], st: f.st || null, g: f.g, vf: f.vf });
export function entriesFor(from, to) { return listDocs('entries').filter(e => e.date >= from && e.date <= to).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt); }
export function addEntries(list) {
  return tx(() => list.map(e => {
    const f = foods.get(e.foodId); if (!f) throw err(400, 'המזון לא נמצא במאגר');
    const date = isISO(e.date) ? e.date : today();
    const grams = Math.round(+e.grams * 10) / 10; if (!(grams > 0 && grams <= 5000)) throw err(400, 'כמות לא תקינה');
    const status = e.status === 'eaten' ? 'eaten' : 'planned';
    return putDoc('entries', newId('e'), {
      date, meal: e.meal || 'breakfast', foodId: f.id, snapshot: SNAP(f), grams, unit: e.unit || 'g', qty: e.qty ?? null,
      status, plannedGrams: status === 'planned' ? grams : (e.plannedGrams ?? null), eatenGrams: status === 'eaten' ? grams : null,
      source: e.source || 'manual', group: e.group || null, comp: e.comp || null, order: e.order ?? now(),
    });
  }));
}
export function updateEntry(id, patch) {
  const e = getDoc('entries', id); if (!e) throw err(404, 'הרישום לא נמצא');
  const next = { ...e };
  if (patch.grams != null) { const g = Math.round(+patch.grams * 10) / 10; if (!(g > 0 && g <= 5000)) throw err(400, 'כמות לא תקינה'); next.grams = g; if (next.status === 'eaten') next.eatenGrams = g; else next.plannedGrams = g; }
  if (patch.unit !== undefined) next.unit = patch.unit; if (patch.qty !== undefined) next.qty = patch.qty;
  if (patch.status === 'eaten') { next.status = 'eaten'; next.eatenGrams = patch.eatenGrams != null ? +patch.eatenGrams : next.grams; next.grams = next.eatenGrams; next.eatenAt = now(); }
  if (patch.status === 'planned') { next.status = 'planned'; next.grams = next.plannedGrams || next.grams; next.eatenGrams = null; }
  if (patch.meal) next.meal = patch.meal;
  if (patch.foodId && patch.foodId !== e.foodId) { const f = foods.get(patch.foodId); if (!f) throw err(400, 'המזון לא נמצא'); next.foodId = f.id; next.snapshot = SNAP(f); next.comp = patch.comp || null; }
  return putDoc('entries', id, next, patch.status ? 'status' : 'update');
}
export function deleteEntry(id) { return deleteDoc('entries', id); }
export function entryHistory(id) { return docHistory('entries', id); }

export function days(from, to) { const o = {}; for (const d of listDocs('days')) if (d.id >= from && d.id <= to) o[d.id] = d; return o; }
export function setDay(date, patch) {
  if (!isISO(date)) throw err(400, 'תאריך לא תקין');
  const d = getDoc('days', date) || { locked: [], complete: false };
  const next = { ...d, ...('complete' in patch ? { complete: !!patch.complete } : {}), ...(Array.isArray(patch.locked) ? { locked: [...new Set(patch.locked)] } : {}), ...('note' in patch ? { note: String(patch.note || '') } : {}) };
  return putDoc('days', date, next);
}

// ---- מוצרים אישיים, מתכונים, מועדפים, ארוחות קבועות, צ׳ק-אין ----
export function saveCustom(c) {
  if (!c.name) throw err(400, 'חסר שם מוצר');
  for (const k of ['k', 'p', 'f', 'c']) if (!(+c[k] >= 0)) throw err(400, 'חסרים ערכים ל-100 גרם');
  if (+c.k > 900) throw err(400, 'יותר מ-900 קק״ל ל-100 גרם — בדוק את התווית');
  const id = c.id || newId('c');
  const d = putDoc('custom', id, { name: c.name, brand: c.brand || '', k: +c.k, p: +c.p, f: +c.f, c: +c.c, fi: c.fi === '' || c.fi == null ? null : +c.fi, na: c.na === '' || c.na == null ? null : +c.na, unitName: c.unitName || '', unitGrams: +c.unitGrams || null, st: c.st || null, origin: c.origin || 'label', fdcId: c.fdcId || null, vf: !!c.vf });
  refreshPersonalFoods(); return { ...d, food: foods.get('c:' + id) };
}
export function saveRecipe(r) {
  if (!r.name) throw err(400, 'חסר שם מתכון');
  if (!Array.isArray(r.items) || !r.items.length) throw err(400, 'הוסף לפחות רכיב אחד');
  for (const it of r.items) if (!foods.get(it.foodId) || !(+it.grams > 0)) throw err(400, 'רכיב לא תקין במתכון');
  const id = r.id || newId('r');
  const d = putDoc('recipes', id, { name: r.name, items: r.items.map(i => ({ foodId: i.foodId, grams: +i.grams })), cookedGrams: +r.cookedGrams || null, servings: +r.servings || null, note: r.note || '' });
  refreshPersonalFoods(); return { ...d, food: foods.get('r:' + id) };
}
export function removePersonal(col, id) { const ok = deleteDoc(col, id); refreshPersonalFoods(); return ok; }

export function state() {
  const t = today();
  const from = addDays(t, -120);
  return {
    today: t, profile: getProfile(), weights: weights(), targets: targets(),
    entries: entriesFor(from, addDays(t, 14)), days: days(from, addDays(t, 14)),
    custom: listDocs('custom'), recipes: listDocs('recipes').map(r => ({ ...r, food: foods.get('r:' + r.id) })), favorites: listDocs('favorites'), fixedMeals: listDocs('fixedMeals'), checkins: Object.fromEntries(listDocs('checkins').map(c => [c.id, c])),
    foodsMeta: FOODS_META,
  };
}

export function exportAll() {
  const cols = ['profile', 'weights', 'entries', 'days', 'targets', 'custom', 'recipes', 'favorites', 'fixedMeals', 'checkins'];
  return { app: 'tafrit-yomi-robi', version: 1, exportedAt: new Date().toISOString(), data: Object.fromEntries(cols.map(c => [c, listDocs(c)])) };
}
export function importAll(dump) {
  if (dump?.app !== 'tafrit-yomi-robi' || !dump.data) throw err(400, 'קובץ גיבוי לא מוכר');
  let n = 0;
  tx(() => { for (const [col, docs] of Object.entries(dump.data)) for (const d of docs) { putDoc(col, d.id, d, 'import'); n++; } });
  refreshPersonalFoods();
  return { imported: n };
}

/** סיכום יום: נאכל בפועל / מתוכנן / יעד / נשאר */
export function daySummary(date = today()) {
  const es = entriesFor(date, date); const tgt = currentTarget(date);
  const eaten = { kcal: 0, protein: 0, fiber: 0 }; const planned = { kcal: 0, protein: 0 };
  for (const e of es) {
    const f = foods.get(e.foodId) || e.snapshot; const n = nutrients(f, e.grams);
    if (e.status === 'eaten') { eaten.kcal += n.kcal; eaten.protein += n.protein; eaten.fiber += n.fiber; } else { planned.kcal += n.kcal; planned.protein += n.protein; }
  }
  const r = x => Math.round(x);
  return { date, target: tgt ? { kcal: tgt.kcal, protein: tgt.protein, since: tgt.effectiveFrom } : null, eaten: { kcal: r(eaten.kcal), protein: r(eaten.protein), fiber: r(eaten.fiber) }, planned: { kcal: r(planned.kcal), protein: r(planned.protein) }, remaining: tgt ? { kcal: r(tgt.kcal - eaten.kcal), protein: r(tgt.protein - eaten.protein) } : null, entries: es };
}
