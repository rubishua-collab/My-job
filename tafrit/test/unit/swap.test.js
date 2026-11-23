// החלפת רכיב בארוחה מוצעת + עוף ודג ביום שלם
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFoods, OMNI, VEG } from '../week-sim.mjs';
import { planDay, suggestMeals, budgetForSlot, swapChoices, applySwap, substituteFood, famGroup } from '../../shared/planner.js';
import { computeTargets } from '../../shared/nutrition.js';

const foods = loadFoods();
const tgt = (p, kg) => { const t = computeTargets(p, kg); return { kcal: t.kcal, protein: t.protein }; };
const day = (p, kg) => planDay({ profile: p, target: tgt(p, kg), foods, entries: [], history: [], date: '2026-11-23', locked: [], recent: new Map(), maxPrep: 15 });

test('יום שלם לאוכל עוף ודגים: מנת עוף ומנת דג', () => {
  const plan = day(OMNI, 118);
  const groups = plan.map(x => famGroup(x.option.fam));
  assert.ok(groups.includes('poultry'), 'יש מנת עוף'); assert.ok(groups.includes('fish'), 'יש מנת דג');
});

test('ארוחה עיקרית אחת: בחירה בין עוף לדג', () => {
  const plan = day({ ...OMNI, meals: 2 }, 118);
  const m = plan.find(x => x.alts);
  assert.ok(m, 'יש בחירה'); assert.deepEqual(m.alts.map(a => famGroup(a.fam)).sort(), ['fish', 'poultry']);
});

test('צמחוני: אין עוף ודג בהצעות ובתחליפים', () => {
  const plan = day(VEG, 72);
  for (const x of plan) {
    assert.ok(!['poultry', 'fish'].includes(famGroup(x.option.fam)));
    x.option.items.forEach((it, j) => { if (it.role === 'protein') for (const c of swapChoices(x.option, j, { foods, profile: VEG })) assert.ok(!['poultry', 'fish'].includes(famGroup(c.item.fam || null)) && !/עוף|דג|סלמון|טונה|הודו|בקר/.test(c.item.name), c.item.name); });
  }
});

test('החלפת אורז בבטטה בצהריים: רק הפחמימה משתנה, הכמות לפי הפחמימות והסיכום מתעדכן', () => {
  const plan = day(OMNI, 118);
  const lunch = plan.find(x => x.slot === 'lunch').option;
  let j = lunch.items.findIndex(i => i.comp === 'rice');
  let o = lunch;
  if (j < 0) { j = lunch.items.findIndex(i => i.role === 'carb'); const r = swapChoices(o, j, { foods, profile: OMNI }).find(c => c.key === 'rice'); o = applySwap(o, j, r.item); }
  const ch = swapChoices(o, j, { foods, profile: OMNI });
  assert.ok(ch.length >= 5, 'לפחות 5 תחליפי פחמימה');
  const sp = ch.find(c => c.key === 'sweetPotato'); assert.ok(sp, 'בטטה ברשימה');
  const old = o.items[j];
  assert.ok(Math.abs(sp.item.carbs - old.carbs) <= Math.max(8, old.carbs * 0.2), `פחמימות דומות: ${sp.item.carbs} מול ${old.carbs}`);
  const n = applySwap(o, j, sp.item);
  assert.equal(n.items[j].comp, 'sweetPotato');
  n.items.forEach((it, k) => { if (k !== j) assert.deepEqual(it, o.items[k]); });
  const sum = n.items.reduce((a, i) => a + i.kcal, 0);
  assert.ok(Math.abs(n.totals.kcal - sum) <= 2, 'סיכום הארוחה מחושב מחדש');
  assert.match(n.name, /בטטה/); assert.ok(n.why.some(w => w.startsWith('הוחלף')));
});

test('החלפת חלבון לסלמון: כמות לפי חלבון, השומן של הסלמון נספר', () => {
  const plan = day(OMNI, 118); const o = plan.find(x => x.slot === 'lunch').option;
  const j = o.items.findIndex(i => i.role === 'protein');
  const s = swapChoices(o, j, { foods, profile: OMNI }).find(c => c.key === 'salmon'); assert.ok(s);
  assert.ok(Math.abs(s.item.protein - o.items[j].protein) <= 8);
  const n = applySwap(o, j, s.item); assert.ok(n.totals.fat > o.totals.fat, 'השומן עולה');
});

test('הצע לי ארוחה: עוף, דג ואפשרות אחרת, עם תוספות שונות; תחליף מהמאגר עובד', () => {
  const b = budgetForSlot({ profile: OMNI, target: tgt(OMNI, 118), entries: [], foods, slot: 'lunch' });
  const opts = suggestMeals({ foods, slot: 'lunch', profile: OMNI, maxPrep: 15, recent: new Map(), diverse: true }, b, 3);
  const g = opts.map(o => famGroup(o.fam));
  assert.ok(g.includes('poultry') && g.includes('fish'), g.join(','));
  const carbs = opts.map(o => o.items.find(i => i.role === 'carb')?.comp).filter(Boolean);
  assert.ok(new Set(carbs).size === carbs.length, 'פחמימות שונות: ' + carbs);
  const o = opts[0]; const j = o.items.findIndex(i => i.role === 'carb');
  const f = foods.search('קינואה')[0]; const it = substituteFood(o.items[j], f);
  const n = applySwap(o, j, it); assert.equal(n.items[j].foodId, f.id);
  assert.ok(Math.abs(it.carbs - o.items[j].carbs) <= 10);
});
