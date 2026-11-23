// חישובי אנרגיה וחלבון. כל מספר שמוצג במסך היעדים או בצ׳אט מגיע מכאן.
import { SOURCES } from './sources.js';

export const round = (x, step = 1) => Math.round(x / step) * step;

// ---- הגדרות ----
export const JOB = {
  sitting: { label: 'עבודה בישיבה', pal: 1.2, palWithSteps: 1.15 },
  mixed: { label: 'עבודה בישיבה ועמידה / תנועה קלה', pal: 1.35, palWithSteps: 1.25 },
  active: { label: 'עבודה פיזית / הרבה תנועה', pal: 1.55, palWithSteps: 1.4 },
};
// רמת פעילות כללית שכבר כוללת אימונים (לא מוסיפים עליה קלוריות אימון)
export const GENERAL = {
  1.375: 'פעילות קלה (1–3 אימונים בשבוע)',
  1.55: 'פעילות בינונית (3–5 אימונים בשבוע)',
  1.725: 'פעילות גבוהה (6–7 אימונים בשבוע)',
};
// MET לפי Compendium 2011: אימון כוח 3.5 (קל) / 5.0 (בינוני) / 6.0 (מאומץ); אירובי 4 / 6 / 8
export const MET = {
  strength: { light: 3.5, moderate: 5.0, vigorous: 6.0 },
  cardio: { light: 4.0, moderate: 6.0, vigorous: 8.0 },
};
export const LOSS_RATES = { slow: 0.5, moderate: 0.75, fast: 1.0 }; // % ממשקל הגוף בשבוע
export const GAIN_RATES = { slow: 0.25, standard: 0.5 }; // % ממשקל הגוף בשבוע (Iraki 2019: ‏0.25–0.5%)
export const GOALS = { lose: 'חיטוב וירידה בשומן', gain: 'עלייה במסת שריר', maintain: 'שמירת משקל', recomp: 'שיפור הרכב הגוף' };
export const GOAL_HINT = { lose: 'גירעון מתון + חלבון גבוה', gain: 'עודף קטן + אימוני כוח', maintain: 'אכילה לפי ההוצאה, בטווח משקל שתבחר', recomp: 'גירעון קטן (כ-10%) + חלבון גבוה + אימוני כוח' };
export const RECOMP_DEFICIT = 0.1;
const STEP_BASE = 3000; // צעדים שכבר כלולים בגורם העבודה
const KCAL_PER_STEP_KG = 0.0004; // ≈0.5 קק״ל לק״ג לק״מ, כ-1,300 צעדים לק״מ (נטו)
export const KCAL_PER_KG = 7700;

export function bmrMifflin({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

/** האם החישוב האוטומטי מתאים, או שנדרשים יעדים מקצועיים */
export function eligibility(p) {
  const m = p.medical || {};
  const reasons = [];
  if (p.age != null && p.age < 18) reasons.push('הנוסחה מיועדת למבוגרים (18+). בגיל צעיר יותר כדאי לקבוע יעדים עם דיאטן או רופא.');
  if (m.pregnancy) reasons.push('בהריון או בהנקה הצרכים משתנים. כדאי לקבוע יעדים עם דיאטן או רופא.');
  if (m.kidney) reasons.push('במחלת כליה כמות החלבון והאנרגיה נקבעת באופן אישי (KDIGO 2024). הזן את היעדים שקבעו לך.');
  if (m.eatingDisorder) reasons.push('כשיש או הייתה הפרעת אכילה, מומלץ לעבוד לפי יעדים שנקבעו בליווי מקצועי. אפשר להזין אותם כאן ולהשתמש ביומן בלי ספירת גירעון.');
  return { ok: reasons.length === 0, reasons };
}

export function exerciseKcalPerDay(p, weightKg) {
  const s = p.strength || {}; const c = p.cardio || {};
  const sMet = MET.strength[s.intensity || 'moderate']; const cMet = MET.cardio[c.intensity || 'moderate'];
  const sWeek = (+s.perWeek || 0) * (+s.minutes || 0) / 60 * (sMet - 1) * weightKg;
  const cWeek = (+c.perWeek || 0) * (+c.minutes || 0) / 60 * (cMet - 1) * weightKg;
  return { strength: sWeek / 7, cardio: cWeek / 7, strengthWeek: sWeek, cardioWeek: cWeek, sMet, cMet };
}

/** הוצאה אנרגטית יומית משוערת, עם פירוט שלב אחרי שלב */
export function tdee(p, weightKg) {
  const bmr = bmrMifflin({ sex: p.sex, weightKg, heightCm: +p.heightCm, age: +p.age });
  const lines = [];
  lines.push({ k: 'bmr', label: 'הוצאה במנוחה (Mifflin–St Jeor)', v: bmr, how: `${p.sex === 'female' ? 'אישה' : 'גבר'}: 10×${weightKg} + 6.25×${p.heightCm} − 5×${p.age} ${p.sex === 'female' ? '− 161' : '+ 5'}` });
  let total; let exercise = 0; let steps = 0; let palUsed;
  if (p.activityMode === 'general') {
    palUsed = +p.generalLevel || 1.375;
    total = bmr * palUsed;
    lines.push({ k: 'pal', label: `רמת פעילות כללית: ${GENERAL[palUsed] || palUsed}`, v: bmr * (palUsed - 1), how: `${Math.round(bmr)} × ${palUsed}. האימונים כבר כלולים ברמה הזו, ולכן קלוריות האימון לא מתווספות שוב.` });
    lines.push({ k: 'ex', label: 'אימונים', v: 0, how: 'כלולים ברמת הפעילות הכללית — לא נספרים פעמיים.' });
  } else {
    const job = JOB[p.job] || JOB.sitting;
    const hasSteps = +p.steps > 0;
    palUsed = hasSteps ? job.palWithSteps : job.pal;
    const daily = bmr * palUsed;
    lines.push({ k: 'pal', label: `פעילות יומיומית: ${job.label}`, v: daily - bmr, how: `${Math.round(bmr)} × ${palUsed}${hasSteps ? ' (מופחת, כי ההליכה נספרת לפי הצעדים)' : ' (כולל הליכה רגילה של יום עבודה)'}` });
    if (hasSteps) {
      steps = Math.max(0, +p.steps - STEP_BASE) * KCAL_PER_STEP_KG * weightKg;
      lines.push({ k: 'steps', label: `צעדים: ${(+p.steps).toLocaleString('he-IL')} ביום`, v: steps, how: `(${p.steps} − ${STEP_BASE}) × ${KCAL_PER_STEP_KG} × ${weightKg} ק״ג. ‏${STEP_BASE.toLocaleString('he-IL')} הצעדים הראשונים כבר כלולים בפעילות היומיומית.` });
    }
    const ex = exerciseKcalPerDay(p, weightKg);
    exercise = ex.strength + ex.cardio;
    if (ex.strengthWeek) lines.push({ k: 'str', label: `אימוני כוח: ${p.strength.perWeek}×${p.strength.minutes} דק׳ בשבוע`, v: ex.strength, how: `(MET ${ex.sMet} − 1) × ${weightKg} ק״ג × ${(p.strength.perWeek * p.strength.minutes / 60).toFixed(1)} שעות בשבוע ÷ 7 ימים` });
    if (ex.cardioWeek) lines.push({ k: 'car', label: `אירובי: ${p.cardio.perWeek}×${p.cardio.minutes} דק׳ בשבוע`, v: ex.cardio, how: `(MET ${ex.cMet} − 1) × ${weightKg} ק״ג × ${(p.cardio.perWeek * p.cardio.minutes / 60).toFixed(1)} שעות בשבוע ÷ 7 ימים` });
    total = daily + steps + exercise;
  }
  return { bmr, total, palUsed, exercise, steps, lines, range: [round(total * 0.9, 50), round(total * 1.1, 50)] };
}

/** משקל ייחוס לחלבון */
export function referenceWeight(p, weightKg) {
  const h = (+p.heightCm) / 100; const bmi = weightKg / (h * h);
  const at25 = 25 * h * h;
  const mode = p.refWeightMode || 'auto';
  const target = +p.targetWeight || null;
  if (mode === 'current') return { kg: weightKg, bmi, reason: 'בחרת לחשב לפי המשקל הנוכחי.', source: null };
  if (mode === 'target' && target) return { kg: target, bmi, reason: 'בחרת לחשב לפי משקל היעד.', source: 'dec_refweight' };
  if (bmi >= 30) {
    const kg = target && target > at25 && target < weightKg ? target : at25;
    return { kg: round(kg, 0.5), bmi, reason: `ה-BMI שלך ${bmi.toFixed(1)}. במצב כזה החלבון מחושב לפי משקל ייחוס: ${kg === target ? 'משקל היעד שלך' : 'משקל שמתאים ל-BMI 25 בגובה שלך'}, ${round(kg, 0.5)} ק״ג.`, source: 'dec_refweight' };
  }
  return { kg: weightKg, bmi, reason: 'החישוב לפי המשקל הנוכחי (BMI מתחת ל-30).', source: null };
}

export function proteinTarget(p, weightKg) {
  const ref = referenceWeight(p, weightKg);
  const strength = (+p.strength?.perWeek || 0) >= 2;
  const goal = p.goal || 'maintain';
  let lo, hi, per, src = [];
  if (strength) { lo = 1.6; hi = 2.2; per = goal === 'lose' || goal === 'recomp' ? 2.0 : goal === 'gain' ? 1.8 : 1.6; src = ['morton2018', 'issn2017']; if (goal === 'lose' || goal === 'recomp') src.push('helms2014'); }
  else { lo = 1.2; hi = 1.6; per = goal === 'lose' || goal === 'recomp' ? 1.4 : goal === 'gain' ? 1.6 : 1.2; src = ['issn2017']; }
  if (+p.age >= 65) { lo = Math.max(lo, 1.0); per = Math.max(per, 1.2); src.push('protage'); }
  if (ref.source) src.push(ref.source);
  const grams = round(per * ref.kg, 5);
  const why = strength
    ? `אתה מתאמן כוח ${p.strength.perWeek} פעמים בשבוע. הטווח הוא 1.6–2.2 גרם לק״ג${goal === 'lose' ? ', ובגירעון קלורי היעד בחלק העליון (2.0) כדי לשמור על השריר' : ''}.`
    : `בלי אימוני כוח קבועים הטווח הוא 1.2–1.6 גרם לק״ג${goal === 'lose' ? ', ובירידה במשקל היעד גבוה יותר (1.4) כדי לשמור על מסת השריר' : ''}.`;
  return { grams, range: [round(lo * ref.kg, 5), round(hi * ref.kg, 5)], perKg: per, ref, why, sources: src };
}

export function mealSlots(count, times = {}) {
  const n = Math.min(6, Math.max(2, +count || 3));
  const sets = {
    2: [['breakfast', 'ארוחה ראשונה', '10:00'], ['dinner', 'ארוחת ערב', '18:30']],
    3: [['breakfast', 'ארוחת בוקר', '08:00'], ['lunch', 'ארוחת צהריים', '13:00'], ['dinner', 'ארוחת ערב', '19:00']],
    4: [['breakfast', 'ארוחת בוקר', '08:00'], ['lunch', 'ארוחת צהריים', '13:00'], ['snack', 'ארוחת ביניים', '16:30'], ['dinner', 'ארוחת ערב', '19:30']],
    5: [['breakfast', 'ארוחת בוקר', '07:30'], ['snack1', 'ביניים בוקר', '10:30'], ['lunch', 'ארוחת צהריים', '13:30'], ['snack', 'ביניים אחה״צ', '16:30'], ['dinner', 'ארוחת ערב', '19:30']],
    6: [['breakfast', 'ארוחת בוקר', '07:30'], ['snack1', 'ביניים בוקר', '10:00'], ['lunch', 'ארוחת צהריים', '13:00'], ['snack', 'ביניים אחה״צ', '16:00'], ['dinner', 'ארוחת ערב', '19:00'], ['night', 'ארוחת לילה', '21:30']],
  };
  return sets[n].map(([id, label, time]) => ({ id, label, time: /^\d{2}:\d{2}$/.test(times?.[id] || '') ? times[id] : time, snack: /snack|night/.test(id) }));
}

/** משקל יחסי לכל ארוחה (ביניים קטנות יותר, תוספת לשעות הרעב) */
export function mealWeights(p) {
  const slots = mealSlots(p.meals, p.mealTimes);
  const hunger = new Set(p.hungerTimes || []);
  const period = s => s.id === 'breakfast' || s.id === 'snack1' ? 'morning' : s.id === 'lunch' ? 'noon' : s.id === 'snack' ? 'afternoon' : 'evening';
  const w = slots.map(s => (s.snack ? 0.5 : 1) * (hunger.has(period(s)) ? 1.25 : 1));
  const sum = w.reduce((a, b) => a + b, 0);
  return slots.map((s, i) => ({ ...s, share: w[i] / sum }));
}

export function proteinPerMeal(p, grams) {
  const slots = mealWeights(p);
  const out = slots.map(s => ({ id: s.id, label: s.label, g: round(grams * s.share, 5) }));
  const diff = grams - out.reduce((a, b) => a + b.g, 0);
  const big = out.reduce((a, b, i) => (b.g > out[a].g ? i : a), 0);
  out[big].g += diff;
  return out;
}

/** היעדים המלאים: הוצאה, יעד קלוריות, חלבון והסבר */
export function computeTargets(p, weightKg) {
  const el = eligibility(p);
  const pro = p.proTargets;
  if (pro && (pro.kcal || pro.protein)) {
    return {
      mode: 'professional', kcal: +pro.kcal || null, protein: +pro.protein || null, eligibility: el,
      perMeal: pro.protein ? proteinPerMeal(p, +pro.protein) : [],
      note: `יעדים שהוזנו לפי ${pro.by || 'הנחיה מקצועית'}${pro.note ? ' — ' + pro.note : ''}.`, sources: [],
    };
  }
  if (!el.ok) return { mode: 'blocked', eligibility: el, kcal: null, protein: null, sources: el.reasons.some(r => r.includes('כליה')) ? ['kdigo2024'] : [] };
  const t = tdee(p, weightKg);
  const goal = p.goal || 'maintain';
  let kcal = t.total; let goalLine; let weekly = 0;
  const floor = Math.max(t.bmr, p.sex === 'female' ? 1200 : 1500);
  const capped = [];
  if (goal === 'lose') {
    const pct = LOSS_RATES[p.rate] ?? LOSS_RATES.moderate;
    weekly = -(pct / 100) * weightKg;
    let deficit = (-weekly) * KCAL_PER_KG / 7;
    if (deficit > t.total * 0.25) { deficit = t.total * 0.25; capped.push('הגירעון הוגבל ל-25% מההוצאה היומית.'); }
    kcal = t.total - deficit;
    if (kcal < floor) { kcal = floor; capped.push(`היעד הועלה לרף המינימום (${Math.round(floor)} קק״ל).`); }
    goalLine = `קצב ירידה של ${pct}% ממשקל הגוף בשבוע ≈ ${Math.abs(weekly).toFixed(2)} ק״ג. גירעון יומי ≈ ${Math.round(t.total - kcal)} קק״ל (${Math.abs(weekly).toFixed(2)} × ${KCAL_PER_KG} ÷ 7).`;
  } else if (goal === 'gain') {
    const pct = GAIN_RATES[p.rate] ?? GAIN_RATES.slow;
    weekly = (pct / 100) * weightKg;
    const surplus = weekly * KCAL_PER_KG / 7;
    kcal = t.total + surplus;
    goalLine = `קצב עלייה של ${pct}% ממשקל הגוף בשבוע ≈ ${weekly.toFixed(2)} ק״ג. עודף יומי ≈ ${Math.round(surplus)} קק״ל (${weekly.toFixed(2)} × ${KCAL_PER_KG} ÷ 7).`;
  } else if (goal === 'recomp') {
    kcal = t.total * (1 - RECOMP_DEFICIT); weekly = -(t.total * RECOMP_DEFICIT * 7) / KCAL_PER_KG;
    if (kcal < floor) { kcal = floor; capped.push(`היעד הועלה לרף המינימום (${Math.round(floor)} קק״ל).`); }
    goalLine = `שיפור הרכב הגוף: גירעון קטן של ${Math.round(RECOMP_DEFICIT * 100)}% (≈ ${Math.round(t.total * RECOMP_DEFICIT)} קק״ל), עם חלבון גבוה ואימוני כוח. המשקל צפוי לרדת לאט.`;
  } else {
    const r = p.weightRange;
    goalLine = r?.min && r?.max ? `שמירת משקל בטווח ${r.min}–${r.max} ק״ג: היעד שווה להוצאה היומית המשוערת.` : 'שמירת משקל: היעד שווה להוצאה היומית המשוערת.';
  }
  const target = round(kcal, 50);
  const pr = proteinTarget(p, weightKg);
  const mac = macros(round(kcal, 50), pr.grams, pr.ref.kg, goal);
  let etaWeeks = null;
  if (+p.targetWeight && weekly) {
    const w = (+p.targetWeight - weightKg) / weekly;
    if (w > 0) etaWeeks = Math.ceil(w);
  }
  return {
    mode: 'auto', eligibility: el, weightKg,
    bmr: Math.round(t.bmr), tdee: Math.round(t.total), tdeeRange: t.range, tdeeLines: t.lines, activityMode: p.activityMode || 'components',
    kcal: target, kcalExact: Math.round(kcal), goal, goalLine, capped, expectedWeekly: weekly, etaWeeks,
    protein: pr.grams, proteinRange: pr.range, proteinPerKg: pr.perKg, refWeight: pr.ref, proteinWhy: pr.why,
    perMeal: proteinPerMeal(p, pr.grams),
    fiber: p.sex === 'female' ? 25 : 30, carbs: mac.carbs, fat: mac.fat, macroWhy: mac.why,
    sources: [...new Set(['mifflin', 'frankenfield', 'compendium', 'dec_activity', 'dec_floor', ...(goal === 'gain' ? ['iraki2019'] : []), ...(goal === 'recomp' ? ['barakat2020'] : []), 'hall2011', 'iom_macros', 'dec_macros', ...pr.sources])].filter(id => SOURCES[id]),
  };
}

/** פחמימות ושומן: שומן לפי אחוז מהקלוריות (בטווח 20–35% של ה-AMDR) ולא פחות מ-0.6 ג׳ לק״ג; פחמימות = היתרה */
export function macros(kcal, protein, refKg, goal) {
  const pct = goal === 'gain' ? 0.25 : goal === 'maintain' ? 0.3 : 0.28;
  let fat = Math.max(Math.round(kcal * pct / 9 / 5) * 5, Math.round(0.6 * refKg / 5) * 5);
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4 / 5) * 5;
  if (carbs < 50) { carbs = 50; fat = Math.max(20, Math.round((kcal - protein * 4 - carbs * 4) / 9 / 5) * 5); }
  return { carbs, fat, why: `שומן כ-${Math.round(fat * 9 / kcal * 100)}% מהקלוריות (${fat} ג׳), חלבון ${protein} ג׳, והשאר פחמימות (${carbs} ג׳).` };
}

/** היעד שבתוקף בתאריך מסוים, מתוך היסטוריית היעדים */
export function targetFor(history, iso) {
  const list = (history || []).filter(t => t.effectiveFrom <= iso).sort((a, b) => a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : (a.createdAt || 0) - (b.createdAt || 0));
  return list.length ? list[list.length - 1] : null;
}

// ---- מהיומן הקודם: יום אימון ומים ----
/** תוספת ליום אימון כוח: 150 קק״ל, כפחמימה (החלטת תוכנה מהיומן הקודם) */
export const TRAIN_BONUS = 150;
export function withTraining(t, day) {
  if (!t || !day?.train) return t;
  return { ...t, kcal: t.kcal + TRAIN_BONUS, carbs: t.carbs != null ? t.carbs + Math.round(TRAIN_BONUS / 4) : t.carbs, train: TRAIN_BONUS };
}
/** כוס מים בברירת מחדל (מ״ל) — כמו ביומן הקודם */
export const CUP_ML = 132;
/** יעד מים: מה שנקבע בפרופיל, אחרת 33 מ״ל לק״ג מעוגל ל-100, ולא פחות מ-2 ליטר (כמו ביומן הקודם) */
export function waterGoalMl(profile, kg) {
  if (+profile?.waterGoalMl > 0) return +profile.waterGoalMl;
  return kg ? Math.max(2000, Math.round(kg * 33 / 100) * 100) : 2000;
}

// ---- כמות שבועית לכרטיסי הקצב בשאלון ----
/** כמה ק״ג בשבוע מייצג קצב: אחוז ממשקל הגוף (בירידה ובעלייה) */
export function weeklyKg(goal, rate, p, weightKg) {
  if (!(weightKg >= 30 && weightKg <= 350)) return null;
  const pct = (goal === 'gain' ? GAIN_RATES : LOSS_RATES)[rate]; return pct == null ? null : weightKg * pct / 100;
}
/** "600 גרם" מתחת לקילו, "1.2 ק״ג" מקילו ומעלה */
export function fmtWeekly(kg) {
  const g = Math.round(kg * 1000 / 10) * 10;
  if (g < 1000) return `${g} גרם`;
  const k = Math.round(kg * 10) / 10;
  return `${k.toLocaleString('he-IL', { maximumFractionDigits: 1 })} ק״ג`;
}
