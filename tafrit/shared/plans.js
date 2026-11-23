// תוכניות (תקופות): מטרה + הגדרות + יעדים, מתאריך התחלה. התוכנית הבאה סוגרת את הקודמת.
import { addDays } from './dates.js';
import { GOALS } from './nutrition.js';

/** השדות שיכולים להשתנות בין תוכניות. פרטים קבועים (מין, גובה, אלרגיות, הנחיות רפואיות) נשארים בפרופיל */
export const PLAN_FIELDS = ['goal', 'rate', 'targetWeight', 'weightRange', 'job', 'steps', 'strength', 'cardio', 'restDays', 'activityMode', 'generalLevel',
  'meals', 'mealTimes', 'trainingTime', 'hungerTimes', 'prepMinutes', 'likes', 'avoid', 'favoriteMeals', 'budget'];
export const PLAN_KIND = { initial: 'תוכנית ראשונה', goal_change: 'החלפת מטרה', same_goal: 'תוכנית חדשה לאותה מטרה', weekly: 'התאמה שבועית' };

export function pickPlanFields(p) { const o = {}; for (const k of PLAN_FIELDS) if (p?.[k] !== undefined) o[k] = structuredClone(p[k]); return o; }

/** תוכניות ממוינות לפי תאריך התחלה, עם תאריך סיום מחושב (יום לפני התוכנית הבאה) */
export function planPeriods(plans) {
  const list = [...(plans || [])].filter(p => !p.cancelled).sort((a, b) => a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : (a.createdAt || 0) - (b.createdAt || 0));
  // אם שתי תוכניות מתחילות באותו יום — האחרונה שנשמרה מחליפה את הקודמת
  const dedup = [];
  for (const p of list) { if (dedup.length && dedup[dedup.length - 1].startDate === p.startDate) dedup.pop(); dedup.push(p); }
  return dedup.map((p, i) => ({ ...p, endDate: dedup[i + 1] ? addDays(dedup[i + 1].startDate, -1) : null }));
}
export function planFor(plans, iso) {
  const ps = planPeriods(plans).filter(p => p.startDate <= iso);
  return ps.length ? ps[ps.length - 1] : null;
}
/** הפרופיל האפקטיבי לתאריך: פרטים קבועים מהפרופיל + הגדרות התוכנית שבתוקף באותו יום */
export function profileOn(profile, plans, iso) {
  if (!profile) return null;
  const pl = planFor(plans, iso);
  return pl ? { ...profile, ...pl.settings, goal: pl.goal, planId: pl.id } : profile;
}
export const goalLabel = g => GOALS[g] || g;
