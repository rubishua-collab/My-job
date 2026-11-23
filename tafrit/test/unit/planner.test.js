// מחולל התפריטים: שבוע לדוגמה לשני פרופילים — גיוון, ביצים, מנה בשרית בצהריים, צמחונות
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateWeek, loadFoods, OMNI, VEG } from '../week-sim.mjs';
import { MEAT_FAMS } from '../../shared/planner.js';
import { COMPONENTS } from '../../shared/catalog.js';

const foods = loadFoods();
const eggMains = d => d.meals.filter(m => m.fam === 'egg').length;

test('אוהב ביצים, עוף, הודו ובקר: ביצים לכל היותר פעם ביום, מנה בשרית בצהריים, גיוון בשבוע', () => {
  const week = simulateWeek(OMNI, 118, '2026-11-22', foods);
  for (const d of week) {
    assert.ok(eggMains(d) <= 1, `${d.date}: ${eggMains(d)} ארוחות ביצים`);
    const eggs = d.meals.flatMap(m => m.items).filter(i => COMPONENTS[i.comp]?.fam === 'egg').reduce((a, i) => a + (i.qty || 0), 0);
    assert.ok(eggs <= 4, `${d.date}: ${eggs} ביצים ביום`);
    assert.ok(Math.abs(d.tot.kcal - d.target.kcal) <= d.target.kcal * 0.08, `${d.date}: קלוריות ${d.tot.kcal}`);
    assert.ok(d.tot.protein >= d.target.protein * 0.92, `${d.date}: חלבון ${d.tot.protein}`);
  }
  const lunches = week.map(d => d.meals.find(m => m.slot === 'lunch'));
  const meatLunch = lunches.filter(l => MEAT_FAMS.has(l.fam) && l.fam !== 'turkeyDeli').length;
  assert.ok(meatLunch >= 6, `מנה בשרית בצהריים ב-${meatLunch}/7 ימים`);
  assert.ok(new Set(lunches.map(l => l.fam)).size >= 3, 'לפחות 3 מקורות חלבון שונים בצהריים בשבוע');
  assert.ok(new Set(lunches.map(l => l.name)).size >= 5, 'לפחות 5 ארוחות צהריים שונות בשבוע');
  for (let i = 1; i < 7; i++) assert.notEqual(lunches[i].name, lunches[i - 1].name, 'אותה ארוחת צהריים לא חוזרת יומיים ברצף');
  assert.ok(week.every(d => d.meals.every(m => m.why.some(w => /^מספק \d+ ג׳ חלבון למנה$/.test(w)) || m.totals.protein < 12)), 'ההסבר מציין חלבון אמיתי למנה');
});

test('פרופיל צמחוני: בלי בשר ודגים, ביצים לכל היותר פעם ביום, גיוון מקורות', () => {
  const week = simulateWeek(VEG, 72, '2026-11-22', foods);
  for (const d of week) {
    for (const m of d.meals) for (const i of m.items) { const c = COMPONENTS[i.comp]; assert.ok(c.kosher !== 'meat' && !c.allergens.includes('fish'), `${d.date}: ${c.name} בפרופיל צמחוני`); }
    assert.ok(eggMains(d) <= 1, `${d.date}: ${eggMains(d)} ארוחות ביצים`);
  }
  const fams = new Set(week.flatMap(d => d.meals.map(m => m.fam)).filter(Boolean));
  assert.ok(['legumes', 'tofu', 'dairy', 'egg'].every(f => fams.has(f)), `מקורות: ${[...fams]}`);
});
