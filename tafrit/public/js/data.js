// מצב האפליקציה בצד הלקוח: הנתונים מהשרת + אינדקס המזון (אותו קוד חישוב כמו בשרת)
import { get } from './api.js';
import { FoodIndex, customFood, recipeFood, nutrients, isVegFruit } from '/shared/foods.js';
import { COMMON_IDS } from '/shared/catalog.js';
import { israelDate, addDays } from '/shared/dates.js';
import { targetFor, mealSlots, withTraining, waterGoalMl, CUP_ML } from '/shared/nutrition.js';
export { waterGoalMl, CUP_ML };
import { profileOn, planFor, planPeriods } from '/shared/plans.js';

export const D = { state: null, foods: null, meta: null, session: null };

export async function loadFoods() {
  if (D.foods) return D.foods;
  const r = await fetch('/data/foods.json');
  const j = await r.json();
  D.meta = j.meta; D.foods = new FoodIndex(j.foods);
  return D.foods;
}
export async function refresh() {
  const [st] = await Promise.all([get('/api/state'), loadFoods()]);
  D.state = st;
  for (const f of D.foods.list.filter(f => f.src === 'custom' || f.src === 'recipe')) D.foods.remove(f.id);
  D.foods.add(st.custom.map(customFood));
  D.foods.add(st.recipes.map(r => recipeFood(r, D.foods)));
  return st;
}
export const today = () => israelDate();
/** הפרופיל האפקטיבי לתאריך (פרטים קבועים + התוכנית שבתוקף באותו יום) */
export const profile = (date = today()) => profileOn(D.state?.profile || null, D.state?.plans || [], date);
export const baseProfile = () => D.state?.profile || null;
export const planOn = (date = today()) => planFor(D.state?.plans || [], date);
export const plans = () => planPeriods(D.state?.plans || []);
export const food = id => D.foods?.get(id) || null;
export const foodOf = e => D.foods.get(e.foodId) || { ...e.snapshot, id: e.foodId };
export const favorites = () => new Set((D.state?.favorites || []).map(f => f.id));
export const searchFoods = (q, limit = 40) => D.foods.search(q, { limit, boost: favorites(), common: COMMON_IDS });
/** היעד שבתוקף בתאריך — כולל תוספת יום אימון אם סומן (כמו ביומן הקודם: +150 קק״ל כפחמימה) */
export const targetOn = date => withTraining(targetFor(D.state?.targets || [], date), D.state?.days?.[date]);
export const baseTargetOn = date => targetFor(D.state?.targets || [], date);
export const slots = (date = today()) => { const p = profile(date); return mealSlots(p?.meals || 3, p?.mealTimes); };
export const entriesOn = date => (D.state?.entries || []).filter(e => e.date === date);
export const dayDoc = date => D.state?.days?.[date] || { locked: [], complete: false };

/** סיכום יום: נאכל בפועל (רק "אכלתי"), מתוכנן, יעד */
export function dayTotals(date) {
  const t = { eaten: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, vf: 0 }, planned: { kcal: 0, protein: 0, carbs: 0, fat: 0 } };
  for (const e of entriesOn(date)) {
    const f = foodOf(e); const n = nutrients(f, e.grams);
    if (e.status === 'eaten') { t.eaten.kcal += n.kcal; t.eaten.protein += n.protein; t.eaten.carbs += n.carbs; t.eaten.fat += n.fat; t.eaten.fiber += n.fiber; if (isVegFruit(f)) t.eaten.vf += e.grams; }
    else { t.planned.kcal += n.kcal; t.planned.protein += n.protein; t.planned.carbs += n.carbs; t.planned.fat += n.fat; }
  }
  return t;
}
/** פריטים שנאכלו בשבוע האחרון (לגיוון) */
export function recentComps(date) {
  const m = new Map(); const from = addDays(date, -6);
  for (const e of D.state.entries) if (e.date >= from && e.date <= date && e.comp) m.set(e.comp, (m.get(e.comp) || 0) + 1);
  return m;
}
