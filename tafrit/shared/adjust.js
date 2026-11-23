// סיכום שבועי והתאמת יעדים לפי ההתקדמות. לא מסיקים משקילה יחידה, ויום שלא תועד במלואו לא נחשב "אפס".
import { weekStart, addDays, weekDates } from './dates.js';
import { recentWeeks, compareWeeks } from './weights.js';
import { nutrients } from './foods.js';
import { targetFor, computeTargets, KCAL_PER_KG, LOSS_RATES, GAIN_RATES, round } from './nutrition.js';
import { COMPONENTS } from './catalog.js';
import { makeItem } from './planner.js';

export const MIN_WEIGHINS = 3; // החלטת תוכנה: מינימום שקילות בשבוע כדי שהשבוע ישמש להשוואה
export const MIN_LOGGED_DAYS = 4; // החלטת תוכנה: מינימום ימים מתועדים במלואם לממוצע אכילה מייצג

/** ממוצע אכילה בשבוע — רק מימים שסומנו "מתועד במלואו", ורק ממה שסומן "אכלתי" */
export function weekIntake(start, days, entries, foods) {
  const dates = weekDates(start);
  const complete = dates.filter(d => days[d]?.complete);
  const perDay = complete.map(d => {
    const t = { kcal: 0, protein: 0 };
    for (const e of entries.filter(e => e.date === d && e.status === 'eaten')) {
      const f = foods.get(e.foodId) || e.snapshot; if (!f) continue;
      const n = nutrients(f, e.eatenGrams ?? e.grams); t.kcal += n.kcal; t.protein += n.protein;
    }
    return { date: d, ...t };
  });
  const n = perDay.length;
  return {
    nDays: n, days: perDay,
    avgKcal: n ? Math.round(perDay.reduce((a, b) => a + b.kcal, 0) / n) : null,
    avgProtein: n ? Math.round(perDay.reduce((a, b) => a + b.protein, 0) / n) : null,
    untracked: dates.filter(d => !days[d]?.complete),
  };
}

export function expectedWeekly(profile, avgKg, tgt) {
  if (tgt?.expectedWeekly != null && profile.goal !== 'maintain') return tgt.expectedWeekly;
  if (profile.goal === 'lose') return -((LOSS_RATES[profile.rate] ?? 0.75) / 100) * avgKg;
  if (profile.goal === 'recomp') return -0.0025 * avgKg;
  if (profile.goal === 'gain') return (GAIN_RATES[profile.rate] ?? GAIN_RATES.slow) / 100 * avgKg;
  return 0;
}

/** הסיכום השבועי + המלצה. today = התאריך המקומי בישראל */
export function weeklyReview({ profile, targets, weights, days = {}, entries = [], foods, today, checkins = {} }) {
  const weeks = recentWeeks(weights, today, 6); // [נוכחי, שעבר, ...]
  const done = weeks.filter(w => !w.inProgress); // שבועות שהסתיימו
  const last = done[0]; const prev = done[1]; const prev2 = done[2];
  const tgt = targetFor(targets, today);
  const intake = last ? weekIntake(last.start, days, entries, foods) : null;
  const intakePrev = prev ? weekIntake(prev.start, days, entries, foods) : null;
  const missing = [];
  if (!last || last.n === 0) missing.push('אין שקילות בשבוע שהסתיים.');
  else if (last.n < MIN_WEIGHINS) missing.push(`בשבוע שהסתיים יש רק ${last.n} שקילות. כדי להשוות צריך לפחות ${MIN_WEIGHINS}.`);
  if (!prev || prev.n < MIN_WEIGHINS) missing.push('אין מספיק שקילות בשבוע שלפניו להשוואה.');
  if (intake && intake.nDays < MIN_LOGGED_DAYS) missing.push(`רק ${intake.nDays} ימים סומנו כמתועדים במלואם. ממוצע האכילה מייצג החל מ-${MIN_LOGGED_DAYS} ימים.`);
  const change = compareWeeks(last, prev);
  const change2 = compareWeeks(prev, prev2);
  const checkin = last ? checkins[last.start] : null;
  const res = { weeks, last, prev, change, intake, intakePrev, target: tgt, missing, checkin, status: 'insufficient', proposal: null, notes: [], sources: ['dec_weekavg', 'dec_review', 'hall2011'] };
  if (!tgt || !last?.avg) return res;

  const exp = expectedWeekly(profile, last.avg, tgt); res.expected = Math.round(exp * 100) / 100;
  const tol = Math.max(0.2, 0.0025 * last.avg); res.tolerance = Math.round(tol * 100) / 100;
  const ok = w => w && w.n >= MIN_WEIGHINS;
  if (!(ok(last) && ok(prev))) { res.status = 'insufficient'; return res; }
  const gap1 = change.kg - exp;
  const gap0 = change2 && ok(prev2) ? change2.kg - exp : null;
  res.gap = Math.round(gap1 * 100) / 100;
  const range = profile.goal === 'maintain' && profile.weightRange?.min && profile.weightRange?.max ? profile.weightRange : null;
  if (range) res.range = range;
  // שמירת משקל עם טווח: בתוך הטווח = בסדר גם אם יש תנודה; מחוץ לטווח ובכיוון הלא נכון = כמו פער
  const outside = range ? (last.avg > range.max ? 1 : last.avg < range.min ? -1 : 0) : null;
  const onPace = range ? (outside === 0 || Math.sign(change.kg) === -outside) : Math.abs(gap1) <= tol;
  const feelBad = checkin && (checkin.hunger >= 4 || checkin.energy <= 2 || checkin.performance <= 2);

  if (onPace) {
    res.status = 'on_track';
    if (range) res.notes.push(outside === 0 ? `ממוצע המשקל (${last.avg} ק״ג) בתוך הטווח שבחרת (${range.min}–${range.max}). ההמלצה: להמשיך.` : `ממוצע המשקל מחוץ לטווח, אבל המגמה חוזרת אליו. ההמלצה: להמשיך ולעקוב.`);
    else res.notes.push(feelBad ? 'אתה בקצב שבחרת, אבל דיווחת על רעב או עייפות. אפשר להשאיר את היעד ולהזיז חלבון וסיבים לשעות הרעב, או לשקול תוספת קטנה של 100 קק״ל.' : 'אתה מתקדם בקצב שבחרת. ההמלצה: להמשיך עם אותו יעד.');
  } else if (range) {
    const prevOut = prev.avg > range.max ? 1 : prev.avg < range.min ? -1 : 0;
    if (prevOut !== outside) { res.status = 'watch'; res.notes.push(`ממוצע המשקל (${last.avg} ק״ג) יצא מהטווח שבחרת (${range.min}–${range.max}) בשבוע האחרון. ההמלצה: לעקוב עוד שבוע.`); }
    else {
      const floor = profile.sex === 'female' ? 1200 : 1500; const delta = -outside * 150; const toKcal = Math.max(floor, tgt.kcal + delta);
      res.status = outside > 0 ? 'too_slow' : 'too_fast';
      res.proposal = { from: { kcal: tgt.kcal, protein: tgt.protein }, to: { kcal: toKcal, protein: tgt.protein }, effectiveFrom: today,
        reason: `שבועיים ברציפות ממוצע המשקל ${outside > 0 ? 'מעל' : 'מתחת ל'}טווח שבחרת (${range.min}–${range.max} ק״ג), ובלי מגמה של חזרה אליו. הצעה: ${Math.abs(delta)} קק״ל ${outside > 0 ? 'פחות' : 'יותר'} ביום.` };
    }
  } else if (gap0 == null || Math.sign(gap0) !== Math.sign(gap1) || Math.abs(gap0) <= tol) {
    res.status = 'watch';
    res.notes.push('יש פער מהקצב שבחרת בשבוע האחרון בלבד. שבוע אחד יכול לנבוע ממים, מלח או מחזור. ההמלצה: להמשיך שבוע נוסף ולבדוק שוב.');
  } else {
    // פער עקבי בשני שבועות רצופים
    const meanGap = (gap0 + gap1) / 2;
    const both = intake && intakePrev ? intake.nDays + intakePrev.nDays : 0;
    const logged = both >= MIN_LOGGED_DAYS * 2 - 2 ? Math.round(((intake.avgKcal || 0) * intake.nDays + (intakePrev.avgKcal || 0) * intakePrev.nDays) / both) : null;
    res.loggedAvg = logged;
    if (meanGap > 0 && logged && logged > tgt.kcal * 1.07) {
      res.status = 'adherence';
      res.notes.push(`בממוצע תיעדת ${logged} קק״ל ביום, מעל היעד (${tgt.kcal}). לפני שמורידים יעד, כדאי להתקרב ליעד הנוכחי. אפשר להתחיל בארוחה שבה הכי קל לחסוך.`);
    } else {
      const rawDelta = -meanGap * KCAL_PER_KG / 7 * 0.5;
      const mag = Math.min(200, Math.max(100, round(Math.abs(rawDelta), 50)));
      const delta = Math.sign(rawDelta) * mag;
      const floor = profile.sex === 'female' ? 1200 : 1500;
      const toKcal = Math.max(floor, tgt.kcal + delta);
      if (toKcal !== tgt.kcal) {
        res.status = delta < 0 ? 'too_slow' : 'too_fast';
        res.proposal = {
          from: { kcal: tgt.kcal, protein: tgt.protein }, to: { kcal: toKcal, protein: tgt.protein },
          effectiveFrom: today,
          reason: delta < 0
            ? `בשבועיים האחרונים ${profile.goal === 'gain' ? 'עלית מהר' : 'ירדת לאט'} יותר מהקצב שבחרת (צפוי ${exp.toFixed(2)} ק״ג לשבוע, בפועל ${change2.kg.toFixed(2)} ו-${change.kg.toFixed(2)}). הצעה: ${Math.abs(delta)} קק״ל פחות ביום.`
            : `בשבועיים האחרונים ${profile.goal === 'gain' ? 'עלית לאט' : 'ירדת מהר'} יותר מהקצב שבחרת (צפוי ${exp.toFixed(2)} ק״ג לשבוע, בפועל ${change2.kg.toFixed(2)} ו-${change.kg.toFixed(2)}). הצעה: ${Math.abs(delta)} קק״ל יותר ביום.`,
        };
        if (!logged) res.notes.push('אין מספיק ימים מתועדים במלואם, לכן ההצעה מבוססת רק על מגמת המשקל.');
      } else res.status = 'floor';
    }
  }
  // חלבון: בדיקה נפרדת
  res.protein = proteinReview({ profile, tgt, last, intake, entries, foods, today });
  return res;
}

export function proteinReview({ profile, tgt, last, intake, entries, foods }) {
  if (!tgt?.protein || !last?.avg) return null;
  const out = { target: tgt.protein, notes: [], tips: [] };
  if (tgt.mode !== 'professional') {
    const fresh = computeTargets(profile, last.avg);
    if (fresh.protein && Math.abs(fresh.protein - tgt.protein) / tgt.protein >= 0.05) {
      out.recompute = { from: tgt.protein, to: fresh.protein, reason: `המשקל הרלוונטי לחישוב השתנה (${fresh.refWeight.kg} ק״ג). לפי ${fresh.proteinPerKg} ג׳ לק״ג, היעד המעודכן הוא ${fresh.protein} ג׳.` };
    }
  }
  if (intake && intake.nDays >= MIN_LOGGED_DAYS && intake.avgProtein < tgt.protein * 0.9) {
    out.notes.push(`בממוצע אכלת ${intake.avgProtein} ג׳ חלבון ביום מתוך ${tgt.protein}. היעד מתאים, אז קודם ננסה שינוי קטן בארוחה שאתה כבר אוכל.`);
    out.tips = proteinTips(entries.filter(e => e.status === 'eaten' && e.date >= last.start && e.date <= last.end), foods, profile, tgt.protein - intake.avgProtein);
  }
  return out;
}

/** תוספת מעשית לארוחה קיימת: הארוחה שאכלת הכי הרבה פעמים + רכיב חלבון מתאים */
export function proteinTips(eaten, foods, profile, gap) {
  const bySlot = new Map();
  for (const e of eaten) bySlot.set(e.meal, (bySlot.get(e.meal) || 0) + 1);
  const slots = [...bySlot.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const ideas = {
    breakfast: [['cottage', 125], ['egg', 1], ['yogurt', 1]], snack1: [['yogurt', 1], ['cottage', 100]], snack: [['cottage', 125], ['hardEgg', 2]],
    lunch: [['tuna', 80], ['chicken', 50], ['chickpeas', 100]], dinner: [['cottage', 125], ['egg', 1], ['tuna', 80]], night: [['yogurt', 1], ['cottage', 100]],
  };
  const tips = [];
  for (const s of slots.length ? slots : ['breakfast', 'dinner']) {
    for (const [k, amt] of ideas[s] || []) {
      const c = COMPONENTS[k];
      if ((profile.allergies || []).some(a => c.allergens.includes(a))) continue;
      const it = makeItem(k, amt, foods); if (!it) continue;
      tips.push({ slot: s, comp: k, item: it, text: `להוסיף ${it.qty ? it.qty + ' ' : ''}${c.name}${it.qty ? '' : ` (${it.grams} ג׳)`} ל${s === 'breakfast' ? 'ארוחת הבוקר' : s === 'lunch' ? 'ארוחת הצהריים' : s === 'dinner' ? 'ארוחת הערב' : 'ארוחת הביניים'}: +${Math.round(it.protein)} ג׳ חלבון, +${Math.round(it.kcal)} קק״ל` });
      break;
    }
    if (tips.length >= 2) break;
  }
  return tips;
}
