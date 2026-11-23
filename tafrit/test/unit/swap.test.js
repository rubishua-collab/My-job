// מנות עם אופי, עוף/דג/בקר רזה, החלפת רכיב ו"הצע מנה אחרת"
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFoods, OMNI, VEG, simulateWeek } from '../week-sim.mjs';
import { planDay, suggestMeals, budgetForSlot, swapChoices, applySwap, substituteFood, famGroup, otherMeal } from '../../shared/planner.js';
import { computeTargets } from '../../shared/nutrition.js';
import { COMPONENTS } from '../../shared/catalog.js';

const foods = loadFoods();
const tgt = (p, kg) => { const t = computeTargets(p, kg); return { kcal: t.kcal, protein: t.protein }; };
const day = (p, kg, extra = {}) => planDay({ profile: p, target: tgt(p, kg), foods, entries: [], history: [], date: '2026-11-23', locked: [], recent: new Map(), maxPrep: 15, ...extra });
const MAIN = ['poultry', 'fish', 'beef'];
const FISHY = /סלמון|אמנון|דניס|לברק|בקלה|טונה|דג/;
const NOFISH = { ...OMNI, allergies: ['fish'] };
const sumItems = o => Math.round(o.items.reduce((a, i) => a + i.kcal, 0));

test('יום שלם לאוכל-כול: צהריים עוף או בקר, ערב קבוצה אחרת (דג), שמות מנה עם אופי', () => {
  const plan = day(OMNI, 118);
  const lunch = plan.find(x => x.slot === 'lunch').option, dinner = plan.find(x => x.slot === 'dinner').option;
  assert.ok(['poultry', 'beef'].includes(famGroup(lunch.fam)), lunch.name);
  assert.ok(MAIN.includes(famGroup(dinner.fam)) && famGroup(dinner.fam) !== famGroup(lunch.fam), dinner.name);
  assert.match(lunch.name, / (ב|על|עם) /, 'שם שמתאר מנה: ' + lunch.name);
  for (const x of plan) assert.ok(Math.abs(sumItems(x.option) - x.option.totals.kcal) <= 3, 'הסיכום כולל שמן, טחינה ורטבים');
});

test('ארוחה עיקרית אחת: בחירה בין עוף, דג ובקר', () => {
  const m = day({ ...OMNI, meals: 2 }, 118).find(x => x.alts);
  assert.ok(m); assert.deepEqual(m.alts.map(a => famGroup(a.fam)).sort(), ['beef', 'fish', 'poultry']);
});

test('"החלף חלבון" בצהריים: עוף, דג ובקר רזה בשלוש האפשרויות הראשונות, ביצים בשורה אחת עם צורות הכנה', () => {
  const lunch = day(OMNI, 118).find(x => x.slot === 'lunch').option;
  const j = lunch.items.findIndex(i => i.role === 'protein');
  const ch = swapChoices(lunch, j, { foods, profile: OMNI });
  assert.deepEqual(ch.slice(0, 3).map(c => c.group).sort(), ['beef', 'fish', 'poultry']);
  const eggs = ch.filter(c => c.group === 'egg');
  assert.equal(eggs.length, 1, 'ביצים — שורה אחת');
  assert.ok(eggs[0].variants.length >= 3 && eggs[0].variants.some(v => v.label === 'חביתה') && eggs[0].variants.some(v => v.label === 'קשות'));
  for (const c of ch) assert.ok(c.meal.kcal > 0 && 'protein' in c.meal && 'carbs' in c.meal && 'fat' in c.meal, 'סיכום הארוחה אחרי ההחלפה');
  // עוף → דג: התוספות נשארות, הכמות לפי חלבון, השם מתעדכן
  const fish = ch.find(c => c.group === 'fish');
  assert.ok(Math.abs(fish.item.protein - lunch.items[j].protein) <= 8);
  const n = applySwap(lunch, j, fish.item);
  assert.deepEqual(n.items.filter((_, i) => i !== j).map(i => i.comp), lunch.items.filter((_, i) => i !== j).map(i => i.comp));
  assert.match(n.name, FISHY); assert.equal(n.totals.kcal, fish.meal.kcal);
});

test('בשר בארוחה עם מוצר חלב (כשר): מוצר החלב יוצא ומסומן', () => {
  const b = budgetForSlot({ profile: OMNI, target: tgt(OMNI, 118), entries: [], foods, slot: 'lunch' });
  const o = suggestMeals({ foods, slot: 'lunch', profile: { ...OMNI, likes: ['ביצים', 'קוטג׳'] }, recent: new Map(), pantry: ['egg', 'pita', 'cottage'] }, b, 1)[0];
  const j = o.items.findIndex(i => i.comp === 'egg'); assert.ok(j >= 0, o.name);
  const ch = swapChoices({ ...o, slot: 'lunch' }, j, { foods, profile: OMNI });
  const meat = ch.find(c => c.group === 'poultry'); assert.ok(meat, 'עוף נגיש');
  assert.match(meat.note, /קוטג/);
  const n = applySwap(o, j, meat.item, { drop: meat.drops });
  assert.ok(!n.items.some(i => i.comp === 'cottage'));
});

test('ביצים בבוקר → בארוחה העיקרית הבאה אין ביצים; עוף בצהריים → בערב קודם דג או בקר', () => {
  const t = tgt(OMNI, 118);
  const eggs = [{ date: '2026-11-23', meal: 'breakfast', foodId: 'm1561', comp: 'egg', grams: 174, status: 'eaten' }];
  const b = budgetForSlot({ profile: OMNI, target: t, entries: eggs, foods, slot: 'lunch' });
  const dayFams = new Map([['egg', 1]]);
  const opts = suggestMeals({ foods, slot: 'lunch', profile: OMNI, recent: new Map(), dayFams, diverse: true }, b, 3);
  assert.ok(opts.every(o => o.fam !== 'egg'));
  assert.deepEqual(opts.map(o => famGroup(o.fam)).sort(), ['beef', 'fish', 'poultry']);
  const ev = suggestMeals({ foods, slot: 'dinner', profile: OMNI, recent: new Map(), dayFams: new Map([['egg', 1], ['chicken', 1]]), diverse: true }, b, 3);
  assert.ok(['fish', 'beef'].includes(famGroup(ev[0].fam)), ev[0].name);
  assert.equal(famGroup(ev[2].fam) === 'poultry' || !ev.slice(0, 2).some(o => famGroup(o.fam) === 'poultry'), true);
});

test('אלרגיה לדגים: אין דג ביום, בהצעות ובתחליפים', () => {
  const plan = day(NOFISH, 118);
  const all = plan.flatMap(x => [x.option, ...(x.alts || [])]);
  for (const o of all) { assert.ok(!FISHY.test(o.name), o.name); o.items.forEach(i => assert.ok(!(COMPONENTS[i.comp]?.allergens || []).includes('fish'), i.name)); }
  assert.ok(plan.some(x => ['poultry', 'beef'].includes(famGroup(x.option.fam))));
  const b = budgetForSlot({ profile: NOFISH, target: tgt(NOFISH, 118), entries: [], foods, slot: 'dinner' });
  const opts = suggestMeals({ foods, slot: 'dinner', profile: NOFISH, recent: new Map(), diverse: true }, b, 3);
  for (const o of opts) {
    assert.ok(!FISHY.test(o.name));
    o.items.forEach((it, j) => swapChoices(o, j, { foods, profile: NOFISH }).forEach(c => assert.ok(!FISHY.test(c.item.name) && !(COMPONENTS[c.key]?.allergens || []).includes('fish'), c.item.name)));
  }
});

test('צמחוני: אין עוף, דג או בשר בהצעות ובתחליפים', () => {
  for (const x of day(VEG, 72)) x.option.items.forEach((it, j) => { if (it.role === 'protein') for (const c of swapChoices(x.option, j, { foods, profile: VEG })) assert.ok(!['poultry', 'fish', 'beef'].includes(c.group), c.item.name); });
});

test('"הצע מנה אחרת": מנה חדשה שלא הוצגה, קרובה ליעד', () => {
  const b = budgetForSlot({ profile: OMNI, target: tgt(OMNI, 118), entries: [], foods, slot: 'dinner' });
  const ctx = { foods, slot: 'dinner', profile: OMNI, recent: new Map(), maxPrep: 15 };
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const o = otherMeal(ctx, b, seen); assert.ok(o, 'יש מנה'); assert.ok(!seen.has(o.templateId));
    assert.ok(Math.abs(o.totals.kcal - b.kcal) <= b.kcal * 0.2, `${o.name}: ${o.totals.kcal} מול ${b.kcal}`);
    seen.add(o.templateId);
  }
});

test('החלפת פחמימה ותחליף מהמאגר', () => {
  const lunch = day(OMNI, 118).find(x => x.slot === 'lunch').option;
  const j = lunch.items.findIndex(i => i.role === 'carb');
  const sp = swapChoices(lunch, j, { foods, profile: OMNI }).find(c => c.key === 'sweetPotato') || swapChoices(lunch, j, { foods, profile: OMNI })[0];
  assert.ok(Math.abs(sp.item.carbs - lunch.items[j].carbs) <= Math.max(10, lunch.items[j].carbs * 0.2));
  const f = foods.search('קינואה')[0]; const it = substituteFood(lunch.items[j], f);
  assert.equal(applySwap(lunch, j, it).items[j].foodId, f.id);
});

test('שבוע: התפריט משתנה — לפחות 5 מנות צהריים שונות ושלוש קבוצות חלבון בארוחות העיקריות', () => {
  const week = simulateWeek(OMNI, 118);
  const mains = week.flatMap(d => d.meals.filter(m => ['lunch', 'dinner'].includes(m.slot)));
  assert.ok(new Set(week.map(d => d.meals.find(m => m.slot === 'lunch').name)).size >= 5);
  assert.deepEqual([...new Set(mains.map(m => famGroup(m.fam)))].filter(g => MAIN.includes(g)).sort(), ['beef', 'fish', 'poultry']);
});
