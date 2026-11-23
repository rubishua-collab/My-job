// סימולציה של שבעה ימים עם "בנה לי יום שלם": כל יום נבנה בהינתן מה שתוכנן בימים הקודמים.
// מייצא simulateWeek לשימוש בבדיקות; בהרצה ישירה מדפיס את השבוע.  node test/week-sim.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FoodIndex } from '../shared/foods.js';
import { planDay, mainFamily, FAM_LABEL } from '../shared/planner.js';
import { computeTargets } from '../shared/nutrition.js';

const root = new URL('..', import.meta.url);
export function loadFoods() {
  const idx = new FoodIndex(JSON.parse(fs.readFileSync(new URL('data/foods.json', root), 'utf8')).foods);
  const w = new URL('data/foods-world.json', root); if (fs.existsSync(w)) idx.add(JSON.parse(fs.readFileSync(w, 'utf8')).foods);
  return idx;
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function simulateWeek(profile, weightKg, start = '2026-11-22', foods = loadFoods()) {
  const t = computeTargets(profile, weightKg); const target = { kcal: t.kcal, protein: t.protein };
  const history = []; const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const recent = new Map(); for (const e of history.filter(e => e.date >= addDays(date, -6))) if (e.comp) recent.set(e.comp, (recent.get(e.comp) || 0) + 1);
    const plan = planDay({ profile, target, foods, entries: [], history, date, locked: [], recent, maxPrep: +profile.prepMinutes || 0 });
    const meals = plan.map(p => ({ slot: p.slot, name: p.option.name, fam: p.option.fam || mainFamily(p.option.items), items: p.option.items, totals: p.option.totals, why: p.option.why }));
    for (const p of plan) p.option.items.forEach(it => history.push({ date, meal: p.slot, foodId: it.foodId, comp: it.comp, grams: it.grams, status: 'planned' }));
    const tot = meals.reduce((a, m) => { a.kcal += m.totals.kcal; a.protein += m.totals.protein; return a; }, { kcal: 0, protein: 0 });
    days.push({ date, meals, tot, target });
  }
  return days;
}

export const OMNI = { sex: 'male', age: 36, heightCm: 186, goal: 'lose', rate: 'moderate', job: 'sitting', steps: 6000, strength: { perWeek: 3, minutes: 60 }, meals: 4, prepMinutes: 15, kosher: true, diet: 'none', allergies: [], likes: ['ביצים', 'עוף', 'הודו', 'בשר בקר', 'אורז', 'סלט ירקות', 'יוגורט', 'שיבולת שועל', 'פירות', 'לחם'] };
export const VEG = { sex: 'female', age: 34, heightCm: 165, goal: 'lose', rate: 'moderate', job: 'mixed', steps: 7000, strength: { perWeek: 2, minutes: 45 }, meals: 4, prepMinutes: 15, kosher: true, diet: 'vegetarian', allergies: [], likes: ['ביצים', 'קוטג׳', 'עדשים וקטניות', 'טופו', 'יוגורט', 'סלט ירקות', 'פירות'] };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [label, prof, kg] of [['אוכל הכול (אוהב ביצים, עוף, הודו, בקר)', OMNI, 118], ['צמחוני', VEG, 72]]) {
    console.log(`\n===== ${label} =====`);
    for (const d of simulateWeek(prof, kg)) {
      console.log(`${d.date}: ${Math.round(d.tot.kcal)}/${d.target.kcal} קק״ל · ${Math.round(d.tot.protein)}/${d.target.protein} ג׳ חלבון`);
      for (const m of d.meals) console.log(`   ${m.slot.padEnd(9)} [${FAM_LABEL[m.fam] || '—'}] ${m.name}: ${m.items.map(i => `${i.name} ${i.qty ? i.qty + '×' : ''}${i.grams}ג׳`).join(' + ')}  ·  ${m.why.join(' | ')}`);
    }
  }
}
