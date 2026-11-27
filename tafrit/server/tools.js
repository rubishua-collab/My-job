// הכלים של "מלווה התזונה שלי". כל מספר בתשובה מחושב כאן מול המאגר — כך הכמויות בצ׳אט זהות ליומן.
import * as S from './store.js';
import { israelDate, israelMinutes, addDays, weekStart, dmy, hebDay } from '../shared/dates.js';
import { mealWeights, mealSlots, GOALS } from '../shared/nutrition.js';
import { suggestMeals, budgetForSlot, nextSlot, familyContext } from '../shared/planner.js';
import { componentsInText, COMPONENTS, COMMON_IDS } from '../shared/catalog.js';
import { nutrients, unitsFor, unitGrams, STATE, SRC_LABEL } from '../shared/foods.js';
import { recentWeeks, parseWeightText } from '../shared/weights.js';
import { weeklyReview } from '../shared/adjust.js';
import { SOURCES, sourcesFor } from '../shared/sources.js';
import { newId, listDocs } from './db.js';

const r = x => Math.round(x);
const SLOT_WORDS = [[/בוקר/, 'breakfast'], [/צהר/, 'lunch'], [/ערב/, 'dinner'], [/ביניים|נשנוש|חטיף/, 'snack'], [/לילה/, 'night']];

function slotLabel(profile, id) { return mealSlots(profile?.meals, profile?.mealTimes, profile?.mealIds).find(s => s.id === id)?.label || id; }
function resolveSlot(profile, wanted) {
  const slots = mealSlots(profile?.meals, profile?.mealTimes, profile?.mealIds).map(s => s.id);
  if (wanted && slots.includes(wanted)) return wanted;
  if (wanted === 'snack' && slots.includes('snack1')) return israelMinutes() < 12 * 60 ? 'snack1' : (slots.includes('snack') ? 'snack' : 'snack1');
  if (wanted === 'night' && !slots.includes('night')) return 'dinner';
  if (wanted && !slots.includes(wanted)) return wanted === 'snack' ? (slots.find(s => s.startsWith('snack')) || 'dinner') : slots[slots.length - 1];
  return null;
}
function recentUse(uid, today) {
  const m = new Map();
  for (const e of S.entriesFor(uid, addDays(today, -6), today)) if (e.comp) m.set(e.comp, (m.get(e.comp) || 0) + 1);
  return m;
}

/** מצב היום: יעד, נאכל, מתוכנן, ארוחות */
export function getStatus(uid, { date } = {}) {
  const d = date || israelDate(); const profile = S.profileOnDate(uid, d); const foods = S.foodsFor(uid);
  const sum = S.daySummary(uid, d); const day = S.days(uid, d, d)[d] || {};
  const meals = mealSlots(profile?.meals, profile?.mealTimes, profile?.mealIds).map(s => {
    const es = sum.entries.filter(e => e.meal === s.id);
    return { slot: s.id, label: s.label, time: s.time, locked: (day.locked || []).includes(s.id), items: es.map(e => ({ name: e.snapshot.n, grams: e.grams, status: e.status === 'eaten' ? 'אכלתי' : 'תכננתי', ...pick(nutrients(foods.get(e.foodId) || e.snapshot, e.grams)) })) };
  });
  const lw = S.latestWeight(uid, d);
  const wk = recentWeeks(S.weights(uid), d, 2);
  return {
    date: d, day: hebDay(d), now: israelMinutes(), target: sum.target, eaten: sum.eaten, planned_not_eaten: sum.planned, remaining: sum.remaining,
    note: 'הצריכה בפועל = רק פריטים שסומנו "אכלתי". פריטים מתוכננים לא נספרים.',
    day_marked_complete: !!day.complete, meals,
    active_plan: (() => { const pl = S.activePlan(uid, d); return pl ? { goal: pl.goal, goal_label: GOALS[pl.goal], since: pl.startDate, until: pl.endDate, kind: pl.kind, meals: pl.settings?.meals, targets: pl.targets, weight_range: pl.settings?.weightRange || null } : null; })(),
    profile: profile ? { goal: profile.goal, meals: profile.meals, prepMinutes: profile.prepMinutes, kosher: profile.kosher, likes: profile.likes, avoid: profile.avoid, allergies: profile.allergies, diet: profile.diet, trainingTime: profile.trainingTime, hungerTimes: profile.hungerTimes } : null,
    latest_weight: lw ? { date: lw.date, kg: lw.kg } : null,
    this_week: wk[0] ? { avg: wk[0].avg, weigh_ins: wk[0].label, in_progress: true } : null,
    last_week: wk[1] ? { avg: wk[1].avg, weigh_ins: wk[1].label } : null,
  };
}
const pick = n => ({ kcal: r(n.kcal), protein: Math.round(n.protein * 10) / 10 });

/** הצעת ארוחה, אופציונלית ממה שיש בבית או בלי בישול */
export function suggestMeal(uid, { slot, pantry_text, no_cook, max_prep_minutes, count = 3, date } = {}, cards) {
  const d = date || israelDate(); const profile = S.profileOnDate(uid, d); const foods = S.foodsFor(uid);
  if (!profile) return { error: 'עוד לא מילאת פרופיל.' };
  const tgt = S.currentTarget(uid, d); if (!tgt) return { error: 'אין עדיין יעד יומי. סיים את השאלון במסך היעדים.' };
  const entries = S.entriesFor(uid, d, d);
  const s = resolveSlot(profile, slot) || nextSlot(profile, entries, israelMinutes()) || 'dinner';
  const pantry = pantry_text ? componentsInText(pantry_text) : null;
  if (pantry_text && !pantry.length) return { error: 'לא זיהיתי מוצרים מהרשימה. נסה לכתוב שמות פשוטים כמו "ביצים, קוטג׳, פיתה".' };
  const budget = budgetForSlot({ profile, target: tgt, entries, foods, slot: s });
  const fc = familyContext({ entries: S.entriesFor(uid, addDays(d, -6), d), foods, date: d, slot: s });
  const opts = suggestMeals({ foods, slot: s, profile, maxPrep: +max_prep_minutes || +profile.prepMinutes || 0, recent: recentUse(uid, d), pantry, noCook: !!no_cook, anySlot: !!pantry, ...fc }, budget, Math.min(3, +count || 3));
  const out = opts.map(o => {
    const card = { type: 'meal', id: newId('s'), date: d, slot: s, slotLabel: slotLabel(profile, s), name: o.name, items: o.items.map(i => ({ foodId: i.foodId, comp: i.comp, name: i.name, grams: i.grams, unit: i.unit, qty: i.qty, approx: i.approx, kcal: i.kcal, protein: i.protein })), totals: o.totals, why: o.why, prep: o.prep };
    cards?.push(card);
    return { card_id: card.id, name: o.name, items: card.items.map(i => `${i.name}: ${i.qty ? i.qty + ' × ' : ''}${i.grams} ג׳ (${i.kcal} קק״ל, ${i.protein} ג׳ חלבון)`), total_kcal: o.totals.kcal, total_protein: o.totals.protein, fiber: o.totals.fiber, veg_fruit_g: o.totals.vegFruitG, prep_minutes: o.prep, why: o.why };
  });
  return { slot: s, slot_label: slotLabel(profile, s), budget_for_meal: { kcal: budget.kcal, protein: budget.protein }, remaining_today: budget.remain, pantry_recognized: pantry?.map(k => COMPONENTS[k].name), options: out, note: 'כל אפשרות מוצגת למשתמש ככרטיס עם כפתור "הוסף לתכנון". אין צורך לחזור על כל הכמויות בטקסט.' };
}

export function searchFood(uid, { query, limit = 8 }) {
  const fav = new Set(listDocs(uid, 'favorites').map(f => f.id));
  return S.foodsFor(uid).search(query, { limit: Math.min(15, +limit || 8), boost: fav, common: COMMON_IDS }).map(f => ({ id: f.id, name: f.n, source: SRC_LABEL[f.src], state: f.st ? STATE[f.st].label : null, per100g: { kcal: f.k, protein: f.p, fat: f.f, carbs: f.c, fiber: f.fi }, units: unitsFor(f).filter(u => u.key !== 'g').map(u => `${u.label} = ${u.g} ג׳`) }));
}
export function portion(uid, { food_id, grams, unit, qty }) {
  const f = S.foodsFor(uid).get(food_id); if (!f) return { error: 'מזון לא נמצא' };
  let g = +grams;
  if (!g && unit) { const ug = unitGrams(f, unit) ?? unitsFor(f).find(u => u.label === unit)?.g; if (!ug) return { error: 'היחידה לא ידועה למזון הזה', units: unitsFor(f).map(u => u.label) }; g = ug * (+qty || 1); }
  const n = nutrients(f, g);
  return { food: f.n, grams: Math.round(g), kcal: r(n.kcal), protein: Math.round(n.protein * 10) / 10, fat: Math.round(n.fat * 10) / 10, carbs: Math.round(n.carbs * 10) / 10, fiber: Math.round(n.fiber * 10) / 10, state: f.st ? STATE[f.st].label : null };
}

/** רישום שקילה. אם כבר יש שקילה לאותו יום — לא דורס בלי אישור, ומציג כרטיס עדכון */
export function logWeight(uid, { kg, date, confirm_update }, cards) {
  const d = date || israelDate();
  const existing = S.weights(uid).find(w => w.date === d);
  if (existing && !confirm_update && Math.abs(existing.kg - kg) > 0.001) {
    cards?.push({ type: 'weight', date: d, kg: +kg, existed: true, previous: existing.kg, saved: false });
    return { saved: false, exists: true, date: d, previous: existing.kg, message: `כבר רשומה שקילה ל-${dmy(d)}: ${existing.kg} ק״ג. המשתמש יכול לאשר עדכון בכרטיס.` };
  }
  const res = S.upsertWeight(uid, { date: d, kg });
  const wk = recentWeeks(S.weights(uid), israelDate(), 1)[0];
  cards?.push({ type: 'weight', date: d, kg: res.weight.kg, existed: res.existed, previous: res.previous, saved: true, weekAvg: wk.avg, weekLabel: wk.label });
  return { saved: true, date: d, kg: res.weight.kg, updated_existing: res.existed, previous: res.previous, week_avg_so_far: wk.avg, week_weigh_ins: wk.label, tip: 'כדאי להישקל בתנאים דומים: בבוקר, אחרי השירותים ולפני אוכל.' };
}

export function weekly(uid) {
  const today = israelDate(); const profile = S.profileOnDate(uid, addDays(weekStart(today), -1));
  const st = S.state(uid); const plan = S.activePlan(uid, today);
  const rv = weeklyReview({ profile, targets: st.targets, weights: st.weights, days: st.days, entries: st.entries, foods: S.foodsFor(uid), today, checkins: st.checkins });
  return {
    last_completed_week: rv.last ? { from: rv.last.start, to: rv.last.end, avg_kg: rv.last.avg, weigh_ins: rv.last.label } : null,
    week_before: rv.prev ? { avg_kg: rv.prev.avg, weigh_ins: rv.prev.label } : null,
    change: rv.change, expected_weekly_change_kg: rv.expected, tolerance_kg: rv.tolerance,
    intake_on_fully_logged_days: rv.intake ? { days: rv.intake.nDays, avg_kcal: rv.intake.avgKcal, avg_protein: rv.intake.avgProtein } : null,
    status: rv.status, notes: rv.notes, missing: rv.missing, proposal: rv.proposal, protein: rv.protein, current_target: rv.target ? { kcal: rv.target.kcal, protein: rv.target.protein, since: rv.target.effectiveFrom } : null,
    active_goal: plan ? { goal: plan.goal, label: GOALS[plan.goal], since: plan.startDate, weight_range: plan.settings?.weightRange || null } : null,
    rules: SOURCES.dec_review.supports,
  };
}

export function explainTargets(uid) {
  const p = S.profileOnDate(uid); if (!p) return { error: 'אין פרופיל' };
  const t = S.previewTargets(uid, null, p); const cur = S.currentTarget(uid);
  if (!t) return { error: 'חסר משקל בוקר' };
  return {
    active_target: cur ? { kcal: cur.kcal, protein: cur.protein, since: cur.effectiveFrom, reason: cur.reason } : null,
    calculation: t.mode === 'auto' ? { bmr: t.bmr, tdee: t.tdee, tdee_range: t.tdeeRange, steps: t.tdeeLines.map(l => `${l.label}: ${Math.round(l.v)} קק״ל — ${l.how}`), goal: t.goalLine, caps: t.capped, kcal_target: t.kcal, protein: t.protein, protein_range: t.proteinRange, protein_per_kg: t.proteinPerKg, reference_weight: t.refWeight, protein_why: t.proteinWhy, per_meal: t.perMeal } : { mode: t.mode, note: t.note, reasons: t.eligibility?.reasons },
    sources: sourcesFor(t.sources || []).map(s => ({ id: s.id, kind: s.kind, title: s.title, year: s.year, url: s.url, supports: s.supports })),
  };
}

export function sourcesTool({ ids } = {}, cards) {
  const list = (ids?.length ? sourcesFor(ids) : sourcesFor(Object.keys(SOURCES)));
  cards?.push({ type: 'sources', items: list.map(s => s.id) });
  return list.map(s => ({ id: s.id, kind: s.kind === 'decision' ? 'החלטת תוכנה' : 'מקור מקצועי', title: s.title, year: s.year, url: s.url, supports: s.supports }));
}

// ---- הגדרות הכלים ל-Claude ----
export const TOOL_DEFS = [
  { name: 'get_status', description: 'מחזיר את מצב היום של המשתמש: יעד קלוריות וחלבון שבתוקף, כמה נאכל בפועל (רק "אכלתי"), מה מתוכנן, יתרה, הארוחות והפריטים, השקילה האחרונה והממוצע השבועי, והעדפות מהפרופיל. קרא לו לפני כל המלצה.', input_schema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD, ברירת מחדל היום בישראל' } }, required: [], additionalProperties: false } },
  { name: 'suggest_meal', description: 'מחשב 2–3 הצעות ארוחה עם כמויות מעשיות מול מאגר המזון, לפי היתרה היומית, הטעם, האלרגיות וזמן ההכנה. כל הצעה מוצגת למשתמש ככרטיס עם "הוסף לתכנון". השתמש בזה לכל המלצה על אוכל — אל תמציא כמויות.', input_schema: { type: 'object', properties: { slot: { type: 'string', enum: ['breakfast', 'snack1', 'lunch', 'snack', 'dinner', 'night'], description: 'הארוחה. בלי ערך = הארוחה הבאה' }, pantry_text: { type: 'string', description: 'מוצרים שיש בבית, בטקסט חופשי, אם המשתמש ציין' }, no_cook: { type: 'boolean', description: 'רק בלי בישול' }, max_prep_minutes: { type: 'integer' }, count: { type: 'integer', description: '1–3' } }, required: [], additionalProperties: false } },
  { name: 'search_food', description: 'חיפוש מזון במאגר (מאגר התזונה הלאומי, מוצרים אישיים ומתכונים). מחזיר ערכים ל-100 ג׳, מצב (יבש/מבושל/מסונן) ויחידות מידה.', input_schema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'], additionalProperties: false } },
  { name: 'portion', description: 'מחשב ערכים תזונתיים לכמות מסוימת של מזון מהמאגר, בגרמים או ביחידה (למשל "יחידה גדולה" לביצה L).', input_schema: { type: 'object', properties: { food_id: { type: 'string' }, grams: { type: 'number' }, unit: { type: 'string' }, qty: { type: 'number' } }, required: ['food_id'], additionalProperties: false } },
  { name: 'log_weight', description: 'רושם שקילת בוקר לפי התאריך המקומי בישראל. אם כבר קיימת שקילה לאותו יום הכלי לא דורס, ומציג למשתמש כרטיס לאישור עדכון. confirm_update=true רק אם המשתמש ביקש במפורש לעדכן.', input_schema: { type: 'object', properties: { kg: { type: 'number' }, date: { type: 'string', description: 'YYYY-MM-DD. "אתמול" = יום קודם' }, confirm_update: { type: 'boolean' } }, required: ['kg'], additionalProperties: false } },
  { name: 'weekly_review', description: 'סיכום השבוע שהסתיים: ממוצע משקל (ראשון–שבת, חלקי מספר השקילות בפועל), שינוי לעומת השבוע הקודם, ממוצע אכילה בימים שסומנו כמתועדים במלואם, סטטוס, נתונים חסרים והצעת התאמה אם יש.', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'explain_targets', description: 'איך חושבו היעדים: הוצאה במנוחה, הוצאה יומית (טווח), יעד קלוריות, חלבון, משקל ייחוס, חלוקה לארוחות ומקורות.', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'get_sources', description: 'מקורות ההמלצות: מחקר/הנחיה (עם קישור ושנה) או החלטת תוכנה. מציג למשתמש כרטיס "על מה מבוססת ההמלצה?".', input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string', enum: Object.keys(SOURCES) } } }, required: [], additionalProperties: false } },
];
export function runTool(uid, name, input, cards) {
  switch (name) {
    case 'get_status': return getStatus(uid, input);
    case 'suggest_meal': return suggestMeal(uid, input, cards);
    case 'search_food': return searchFood(uid, input);
    case 'portion': return portion(uid, input);
    case 'log_weight': return logWeight(uid, input, cards);
    case 'weekly_review': return weekly(uid);
    case 'explain_targets': return explainTargets(uid);
    case 'get_sources': return sourcesTool(input, cards);
    default: return { error: 'כלי לא מוכר' };
  }
}

// ---- מצב בסיסי (בלי מפתח Claude): זיהוי כוונה בקוד ----
export function localReply(uid, text) {
  const cards = []; const t = String(text || '').trim(); const today = israelDate();
  const w = parseWeightText(t, today);
  if (w) {
    const res = logWeight(uid, { kg: w.kg, date: w.date }, cards);
    if (!res.saved) return { text: `כבר רשומה שקילה ל-${dmy(res.date)}: ${res.previous} ק״ג. לעדכן ל-${w.kg}?`, cards };
    return { text: `${res.updated_existing ? 'עדכנתי' : 'רשמתי'} ${res.kg} ק״ג ל-${dmy(res.date)}.${res.week_avg_so_far ? ` הממוצע השבוע עד עכשיו: ${res.week_avg_so_far} ק״ג (${res.week_weigh_ins}).` : ''}\n${res.tip}`, cards };
  }
  if (/יש לי|בבית|במקרר|מה אפשר להכין|מה אני יכול להכין/.test(t) && componentsInText(t).length) {
    const res = suggestMeal(uid, { pantry_text: t, slot: slotIn(t) }, cards);
    if (res.error) return { text: res.error, cards };
    if (!res.options.length) return { text: `זיהיתי: ${res.pantry_recognized.join(', ')}, אבל לא מצאתי ארוחה שמתאימה לפרופיל שלך (אלרגיות או הימנעויות). נסה להוסיף עוד מוצר.`, cards };
    return { text: `זיהיתי: ${res.pantry_recognized.join(', ')}. הנה מה אפשר להכין ל${res.slot_label}, לפי מה שנשאר לך היום (${res.budget_for_meal.kcal} קק״ל, ${res.budget_for_meal.protein} ג׳ חלבון לארוחה):`, cards };
  }
  if (/בלי לבשל|לא לבשל|בלי בישול|מהיר/.test(t) || (/חלבון/.test(t) && /איך|להגיע|להשלים/.test(t))) {
    const res = suggestMeal(uid, { slot: slotIn(t), no_cook: /בלי לבשל|לא לבשל|בלי בישול/.test(t), max_prep_minutes: 5 }, cards);
    if (res.error) return { text: res.error, cards };
    const st = getStatus(uid);
    return { text: `נשארו לך היום ${st.remaining?.protein ?? '?'} ג׳ חלבון ו-${st.remaining?.kcal ?? '?'} קק״ל. אפשרויות בלי בישול ל${res.slot_label}:`, cards };
  }
  if (/למה|מדוע/.test(t) && /קלורי|יעד|השארת|אותן|שינית/.test(t)) {
    const rv = weekly(uid);
    const lines = [rv.notes?.join(' ') || '', rv.missing?.length ? 'חסר: ' + rv.missing.join(' ') : '', rv.change ? `השינוי בשבוע שהסתיים: ${rv.change.kg} ק״ג (${rv.change.pct}%). הצפוי לפי הקצב שבחרת: ${rv.expected_weekly_change_kg} ק״ג.` : '', 'הכלל: ' + rv.rules].filter(Boolean);
    sourcesTool({ ids: ['dec_review', 'dec_weekavg', 'hall2011'] }, cards);
    return { text: lines.join('\n'), cards };
  }
  if (/איך חישבת|כמה אני שורף|הוצאה|BMR|TDEE/i.test(t)) {
    const ex = explainTargets(uid); if (ex.error) return { text: ex.error, cards };
    sourcesTool({ ids: ex.sources.map(s => s.id) }, cards);
    const c = ex.calculation;
    return { text: c.bmr ? `במנוחה: כ-${c.bmr} קק״ל. ביום ממוצע: ${c.tdee_range[0]}–${c.tdee_range[1]} קק״ל. יעד האכילה: ${c.kcal_target} קק״ל, חלבון ${c.protein} ג׳ (טווח ${c.protein_range[0]}–${c.protein_range[1]}).\n${c.goal}\n${c.protein_why}` : c.note || 'יעדים מקצועיים.', cards };
  }
  if (/כמה (נשאר|אכלתי)|מה המצב|סטטוס/.test(t)) {
    const st = getStatus(uid);
    if (!st.target) return { text: 'עוד אין יעד יומי. סיים את השאלון.', cards };
    return { text: `היום אכלת ${st.eaten.kcal} מתוך ${st.target.kcal} קק״ל ו-${st.eaten.protein} מתוך ${st.target.protein} ג׳ חלבון. נשארו ${st.remaining.kcal} קק״ל ו-${st.remaining.protein} ג׳ חלבון.${st.planned_not_eaten.kcal ? ` מתוכננים עוד ${st.planned_not_eaten.kcal} קק״ל שעדיין לא סומנו כ"אכלתי".` : ''}`, cards };
  }
  if (/מה (כדאי|לאכול|אוכל)|הצע|ארוחה|ערב|צהריים|בוקר|ביניים/.test(t)) {
    const res = suggestMeal(uid, { slot: slotIn(t) }, cards);
    if (res.error) return { text: res.error, cards };
    return { text: `ל${res.slot_label} נשארו לך כ-${res.budget_for_meal.kcal} קק״ל ו-${res.budget_for_meal.protein} ג׳ חלבון (מתוך מה שנשאר היום). שלוש אפשרויות:`, cards };
  }
  return { text: 'אפשר לכתוב לי למשל:\n• "הבוקר שקלתי 119.8"\n• "מה כדאי לי לאכול הערב?"\n• "יש לי בבית ביצים, קוטג׳ ופיתה, מה אפשר להכין?"\n• "איך אגיע לחלבון שלי בלי לבשל?"\n• "למה השארת את אותן קלוריות?"', cards };
}
function slotIn(t) { for (const [re, s] of SLOT_WORDS) if (re.test(t)) return s; return undefined; }
