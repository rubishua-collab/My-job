// בדיקות יחידה לחישובים (node --test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bmrMifflin, computeTargets, tdee, targetFor, proteinPerMeal, eligibility } from '../../shared/nutrition.js';
import { weekSummary, uniqueByDate, compareWeeks, parseWeightText } from '../../shared/weights.js';
import { weekStart, addDays, israelDate } from '../../shared/dates.js';
import { FoodIndex, nutrients, unitsFor, recipeFood, isVegFruit } from '../../shared/foods.js';
import { suggestMeals, swapItem, makeItem, dayTotals, budgetForSlot, planDay } from '../../shared/planner.js';
import { componentsInText, COMPONENTS } from '../../shared/catalog.js';
import { weeklyReview, weekIntake } from '../../shared/adjust.js';

const foods = new FoodIndex(JSON.parse(fs.readFileSync(new URL('../../data/foods.json', import.meta.url))).foods);
const P = { sex: 'male', age: 38, heightCm: 180, goal: 'lose', rate: 'moderate', job: 'sitting', strength: { perWeek: 3, minutes: 60, intensity: 'moderate' }, cardio: { perWeek: 0, minutes: 0 }, meals: 3, kosher: true, allergies: ['nuts'], avoid: ['סלמון'] };

test('Mifflin–St Jeor: גבר ואישה', () => {
  assert.equal(bmrMifflin({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 }), 800 + 1125 - 150 + 5);
  assert.equal(bmrMifflin({ sex: 'female', weightKg: 60, heightCm: 165, age: 40 }), 600 + 1031.25 - 200 - 161);
});

test('אימונים לא נספרים פעמיים ברמת פעילות כללית', () => {
  const comp = tdee({ ...P, activityMode: 'components' }, 120);
  const gen = tdee({ ...P, activityMode: 'general', generalLevel: 1.55 }, 120);
  assert.ok(comp.exercise > 0);
  assert.equal(gen.exercise, 0);
  assert.equal(Math.round(gen.total), Math.round(gen.bmr * 1.55));
});

test('יעד קלוריות: מעוגל ל-50, גירעון עד 25%, לא מתחת לרצפה', () => {
  const t = computeTargets({ ...P, rate: 'fast' }, 120);
  assert.equal(t.kcal % 50, 0);
  assert.ok(t.tdee - t.kcalExact <= t.tdee * 0.25 + 1);
  const small = computeTargets({ ...P, sex: 'female', age: 60, heightCm: 150, rate: 'fast', strength: { perWeek: 0 } }, 50);
  assert.ok(small.kcal >= 1200 && small.kcal >= small.bmr - 25);
});

test('חלבון: BMI≥30 → משקל ייחוס, טווח 1.6–2.2 עם אימוני כוח', () => {
  const t = computeTargets(P, 120);
  assert.ok(t.refWeight.kg < 120);
  assert.equal(t.proteinRange[0], Math.round(1.6 * t.refWeight.kg / 5) * 5);
  assert.equal(t.proteinPerMeal ?? t.perMeal.reduce((a, b) => a + b.g, 0), t.protein);
  const cur = computeTargets({ ...P, refWeightMode: 'current' }, 120);
  assert.equal(cur.refWeight.kg, 120);
});

test('מחלת כליה בלי יעד מקצועי → לא מחשב; עם יעד מקצועי → משתמש בו', () => {
  assert.equal(computeTargets({ ...P, medical: { kidney: true } }, 120).mode, 'blocked');
  const pro = computeTargets({ ...P, medical: { kidney: true }, proTargets: { kcal: 2000, protein: 70, by: 'דיאטנית' } }, 120);
  assert.equal(pro.mode, 'professional'); assert.equal(pro.protein, 70);
  assert.equal(eligibility({ age: 16 }).ok, false);
});

test('יעד לפי תאריך: יעד חדש לא משנה ימים קודמים', () => {
  const h = [{ effectiveFrom: '2026-01-01', kcal: 2300, createdAt: 1 }, { effectiveFrom: '2026-02-01', kcal: 2200, createdAt: 2 }];
  assert.equal(targetFor(h, '2026-01-31').kcal, 2300);
  assert.equal(targetFor(h, '2026-02-01').kcal, 2200);
  assert.equal(targetFor(h, '2025-12-31'), null);
});

test('ממוצע שבועי: חלקי מספר השקילות בפועל; תיקון נספר פעם אחת', () => {
  const s = '2026-11-15'; // ראשון
  assert.equal(weekStart('2026-11-21'), s);
  const ws = [{ date: s, kg: 120, updatedAt: 1 }, { date: addDays(s, 1), kg: 119, updatedAt: 1 }, { date: addDays(s, 3), kg: 119.5, updatedAt: 1 }, { date: addDays(s, 4), kg: 118.5, updatedAt: 1 }, { date: addDays(s, 6), kg: 119, updatedAt: 1 },
    { date: addDays(s, 1), kg: 125, updatedAt: 0 }]; // גרסה ישנה של אותו יום
  const w = weekSummary(ws, s, '2026-11-25');
  assert.equal(w.n, 5); assert.equal(w.label, '5 מתוך 7 שקילות');
  assert.equal(w.avg, Math.round((120 + 119 + 119.5 + 118.5 + 119) / 5 * 100) / 100);
  assert.equal(uniqueByDate(ws).length, 5);
  assert.deepEqual(compareWeeks({ avg: 119 }, { avg: 120 }), { kg: -1, pct: -0.83 });
});

test('זיהוי שקילה בטקסט', () => {
  assert.deepEqual(parseWeightText('הבוקר שקלתי 119.8', '2026-11-22'), { kg: 119.8, date: '2026-11-22' });
  assert.deepEqual(parseWeightText('אתמול שקלתי 120,2 קילו', '2026-11-22'), { kg: 120.2, date: '2026-11-21' });
  assert.equal(parseWeightText('אכלתי 150 גרם אורז', '2026-11-22'), null);
});

test('יחידות: ביצה L = 58 ג׳; אורז יבש מול מבושל', () => {
  const egg = foods.get('m1561');
  assert.equal(unitsFor(egg).find(u => u.label === 'ביצה L').g, 58);
  assert.equal(foods.get('m2730').st, 'dry'); assert.equal(foods.get('m2721').st, 'cooked');
  assert.equal(Math.round(nutrients(egg, 116).kcal), 166);
  assert.equal(isVegFruit(foods.get('m3453')), false, 'תפוח אדמה לא נספר כירק');
});

test('מתכון ביתי כולל שמן, לפי החלק שנאכל', () => {
  const r = recipeFood({ id: 'x', name: 'עוף בתנור', items: [{ foodId: 'm805', grams: 500 }, { foodId: 'm4443', grams: 20 }], cookedGrams: 400, servings: 4 }, foods);
  const total = 500 * 1.6 + 20 * 8.84;
  assert.equal(Math.round(r.total.kcal), Math.round(total));
  assert.equal(Math.round(r.k * 4), Math.round(total)); // 400 ג׳ סופי → 100 ג׳ = רבע
  assert.deepEqual(r.u, [['מנה', 100]]);
});

test('מתוכנן לא נספר כנאכל; אכלתי חלקית נספר לפי מה שנאכל', () => {
  const es = [{ foodId: 'm494', grams: 200, status: 'planned' }, { foodId: 'm494', grams: 150, eatenGrams: 150, status: 'eaten' }];
  const t = dayTotals(es, foods);
  assert.equal(Math.round(t.eaten.kcal), Math.round(150 * 0.95));
  assert.equal(Math.round(t.planned.kcal), Math.round(200 * 0.95));
});

test('הצעות: 2–3 אפשרויות, בלי אלרגנים/הימנעויות, בלי בשר+חלב בכשרות', () => {
  const opts = suggestMeals({ foods, slot: 'dinner', profile: P, maxPrep: 30 }, { kcal: 700, protein: 55 }, 3);
  assert.ok(opts.length >= 2 && opts.length <= 3);
  for (const o of opts) {
    const keys = o.items.map(i => i.comp);
    assert.ok(!keys.some(k => COMPONENTS[k].allergens.includes('nuts')));
    assert.ok(!keys.includes('salmon'));
    assert.ok(!(keys.some(k => COMPONENTS[k].kosher === 'meat') && keys.some(k => COMPONENTS[k].kosher === 'dairy')));
    assert.ok(Math.abs(o.totals.kcal - 700) < 200, `${o.name} ${o.totals.kcal}`);
  }
});

test('ממה שיש בבית: ביצים, קוטג׳ ופיתה', () => {
  assert.deepEqual(componentsInText('יש לי בבית ביצים, קוטג׳ ופיתה').sort(), ['cottage', 'egg', 'pita']);
  const o = suggestMeals({ foods, slot: 'dinner', profile: P, pantry: ['egg', 'cottage', 'pita'] }, { kcal: 650, protein: 45 }, 3);
  assert.ok(o.length >= 1);
  for (const opt of o) assert.ok(opt.items.every(i => ['egg', 'cottage', 'pita', 'oliveOil'].includes(i.comp)));
});

test('החלפה: אורז → פיתה לפי קלוריות, בחצאי פיתה', () => {
  const rice = makeItem('rice', 200, foods);
  const s = swapItem(rice, 'pita', foods);
  assert.equal(s.matchedBy, 'קלוריות'); assert.equal(s.item.qty % 0.5, 0);
  assert.ok(Math.abs(s.delta.kcal) <= 70);
  const ch = swapItem(makeItem('chicken', 150, foods), 'tuna', foods);
  assert.equal(ch.matchedBy, 'חלבון');
});

test('תקציב לארוחה מחושב ממה שנשאר, ויום שלם לא נוגע בארוחה נעולה', () => {
  const target = { kcal: 2200, protein: 180 };
  const entries = [{ meal: 'breakfast', foodId: 'm494', grams: 250, status: 'eaten', eatenGrams: 250 }];
  const b = budgetForSlot({ profile: P, target, entries, foods, slot: 'lunch' });
  assert.equal(Math.round(b.remain.kcal), Math.round(2200 - 250 * 0.95));
  const plan = planDay({ profile: P, target, foods, entries, locked: [] });
  assert.ok(!plan.some(p => p.slot === 'breakfast'));
  assert.equal(plan.length, 2);
});

test('סיכום שבועי: יום לא מתועד לא נחשב כאפס; פער עקבי → הצעה מתונה', () => {
  const today = '2026-11-25'; const s0 = weekStart(today);
  const weights = []; const mk = (start, arr) => arr.forEach((kg, i) => kg && weights.push({ date: addDays(start, i), kg, updatedAt: 1 }));
  mk(addDays(s0, -21), [120.3, 120.2, 120.3, 120.1, 120.2, 120.1, 120.0]);
  mk(addDays(s0, -14), [120.1, 120.0, null, 120.1, 120.0, null, 119.9]);
  mk(addDays(s0, -7), [120.0, null, 120.0, 119.9, 119.9, null, 120.0]);
  const lw = addDays(s0, -7);
  const days = {}; const entries = [];
  for (let i = 0; i < 5; i++) { const d = addDays(lw, i); entries.push({ date: d, meal: 'lunch', foodId: 'm805', grams: 700, status: 'eaten' }); if (i < 4) days[d] = { complete: true }; }
  const intake = weekIntake(lw, days, entries, foods);
  assert.equal(intake.nDays, 4); assert.equal(intake.avgKcal, 1120);
  const rv = weeklyReview({ profile: { ...P, rate: 'moderate' }, targets: [{ effectiveFrom: '2026-01-01', kcal: 2250, protein: 160 }], weights, days, entries, foods, today });
  assert.equal(rv.last.label, '5 מתוך 7 שקילות');
  assert.equal(rv.status, 'too_slow');
  assert.ok(rv.proposal.to.kcal < 2250 && 2250 - rv.proposal.to.kcal <= 200 && 2250 - rv.proposal.to.kcal >= 100);
});

test('שבוע אחד בלבד עם פער → לא משנים יעד', () => {
  const today = '2026-11-25'; const s0 = weekStart(today); const weights = [];
  for (let i = 0; i < 7; i++) { weights.push({ date: addDays(s0, -14 + i), kg: 120 - i * 0.1, updatedAt: 1 }); weights.push({ date: addDays(s0, -7 + i), kg: 119.5, updatedAt: 1 }); }
  const rv = weeklyReview({ profile: P, targets: [{ effectiveFrom: '2026-01-01', kcal: 2250, protein: 160 }], weights, foods, today });
  assert.equal(rv.proposal, null);
  assert.ok(['watch', 'on_track'].includes(rv.status));
});

test('תאריך ישראל', () => {
  assert.equal(israelDate(new Date('2026-11-22T22:30:00Z')), '2026-11-23'); // 00:30 בישראל
});

test('תוכניות: תוכנית לפי תאריך, תאריך סיום מחושב, פרופיל אפקטיבי', async () => {
  const { planFor, planPeriods, profileOn } = await import('../../shared/plans.js');
  const plans = [{ id: 'a', goal: 'lose', startDate: '2026-11-01', settings: { meals: 4 }, createdAt: 1 }, { id: 'b', goal: 'maintain', startDate: '2026-11-22', settings: { meals: 3, weightRange: { min: 70, max: 72 } }, createdAt: 2 }];
  assert.equal(planFor(plans, '2026-11-21').goal, 'lose');
  assert.equal(planFor(plans, '2026-11-22').goal, 'maintain');
  assert.equal(planPeriods(plans)[0].endDate, '2026-11-21');
  assert.equal(profileOn({ sex: 'male', goal: 'lose', meals: 5 }, plans, '2026-11-25').meals, 3);
  assert.equal(planFor(plans, '2026-10-01'), null);
});

test('פחמימות ושומן + מטרת שיפור הרכב גוף', () => {
  const t = computeTargets({ ...P, goal: 'recomp' }, 90);
  assert.ok(t.kcal < t.tdee && t.kcal > t.tdee * 0.85);
  assert.equal(t.protein * 4 + t.carbs * 4 + t.fat * 9 <= t.kcal + 40, true);
  assert.ok(t.fat * 9 / t.kcal >= 0.2 && t.fat * 9 / t.kcal <= 0.35);
});

test('הצפנה, סיסמאות ו-TOTP', async () => {
  const C = await import('../../server/crypto.js');
  const key = Buffer.alloc(32, 7);
  const e = C.encrypt('שקילה 72.4', key); assert.ok(e.startsWith('e1:') && !e.includes('72'));
  assert.equal(C.decrypt(e, key), 'שקילה 72.4');
  assert.throws(() => C.decrypt(e, Buffer.alloc(32, 8)));
  const h = C.hashPassword('abcd1234'); assert.ok(C.verifyPassword('abcd1234', h)); assert.ok(!C.verifyPassword('abcd12345', h));
  // RFC 6238 test vector (SHA-1, T=59s): 94287082 → 6 ספרות אחרונות 287082
  const secret = C.base32(Buffer.from('12345678901234567890'));
  assert.equal(C.totp(secret, 59 * 1000), '287082');
  assert.ok(C.verifyTotp(secret, C.totp(secret)) !== null);
  assert.equal(C.verifyTotp(secret, '000000', 59000) === null || C.totp(secret, 59000) === '000000', true);
});

test('עלייה במסה: קצב לפי אחוז ממשקל הגוף (0.25% / 0.5% בשבוע), עקבי בין היעד, השאלון והבדיקה השבועית', async () => {
  const { computeTargets, weeklyKg, fmtWeekly, tdee } = await import('../../shared/nutrition.js');
  const { expectedWeekly } = await import('../../shared/adjust.js');
  const p = { sex: 'male', age: 30, heightCm: 178, goal: 'gain', job: 'sitting' };
  for (const [rate, pct] of [['slow', 0.25], ['standard', 0.5]]) {
    const t = computeTargets({ ...p, rate }, 80);
    assert.equal(+t.expectedWeekly.toFixed(3), +(80 * pct / 100).toFixed(3));
    assert.ok(Math.abs(t.kcalExact - (tdee({ ...p, rate }, 80).total + 80 * pct / 100 * 7700 / 7)) < 1);
    assert.equal(weeklyKg('gain', rate, {}, 80), 80 * pct / 100);
    assert.equal(+expectedWeekly({ ...p, rate }, 80).toFixed(3), +(80 * pct / 100).toFixed(3));
  }
  assert.equal(fmtWeekly(weeklyKg('gain', 'slow', {}, 80)), '200 גרם');
  assert.equal(fmtWeekly(weeklyKg('lose', 'fast', {}, 120)), '1.2 ק״ג');
});
