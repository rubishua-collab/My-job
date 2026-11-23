// "אוכל בחוץ": מנות כפי שמזמינים אותן — בסיס + בחירות (לחם/צלחת, גודל, תוספות) — כל רכיב הוא מזון אמיתי במאגר ונספר פעם אחת.
// kind: 'official' = ערכים שפרסמה הרשת (כרגע: הערכים שפורסמו בארה״ב — אין נתונים רשמיים ישראליים שאפשר לייבא);
//       'estimate' = מנה כללית ממסעדה: הערכה לפי מזונות במאגר, ואפשר לערוך את הכמות.
// פריט: { id: מזהה במאגר, g: גרמים (במזון ל-100 ג׳) או qty: מספר מנות (במזון "למנה" — pp) }
import { nutrients } from './foods.js';

const BREAD_SH = [
  { id: 'pita', label: 'בפיתה', items: [{ id: 'y29', g: 90, label: 'פיתה' }] },
  { id: 'lafa', label: 'בלאפה', items: [{ id: 'y30', g: 140, label: 'לאפה' }] },
  { id: 'plate', label: 'בצלחת', items: [{ id: 'y127', g: 120, label: 'סלט ירקות (תוספת בצלחת)' }] },
];
const EXTRAS = (chipsG = 70) => [
  { id: 'salad', label: 'סלט ירקות', on: true, items: [{ id: 'y127', g: 60, label: 'ירקות' }] },
  { id: 'tahini', label: 'טחינה', on: true, items: [{ id: 'y152', g: 30, label: 'טחינה' }] },
  { id: 'hummus', label: 'חומוס', items: [{ id: 'y101', g: 40, label: 'חומוס' }] },
  { id: 'chips', label: 'צ׳יפס בפנים / בצד', items: [{ id: 'y22', g: chipsG, label: 'צ׳יפס' }] },
  { id: 'pickles', label: 'חמוצים', items: [{ id: 'y129', g: 30, label: 'חמוצים' }] },
];
const DRINK = [
  { id: 'none', label: 'בלי שתייה', items: [] },
  { id: 'water', label: 'מים / דיאט', items: [] },
  { id: 'cola330', label: 'פחית קולה', items: [{ id: 'y182', g: 330, label: 'קולה 330 מ״ל' }] },
  { id: 'cola500', label: 'קולה 500 מ״ל', items: [{ id: 'y182', g: 500, label: 'קולה 500 מ״ל' }] },
];

function chainMeal(id, name, sandwichId, words, friesSizes, chain) {
  return {
    id, name, cat: 'chains', kind: 'official', chain, words,
    base: [{ id: sandwichId, qty: 1, label: name }],
    groups: [
      { id: 'meal', label: 'הזמנה', type: 'one', choices: [{ id: 'only', label: 'כריך בלבד', items: [] }, ...friesSizes.map(([fid, lab]) => ({ id: fid, label: `ארוחה עם ${lab}`, items: [{ id: fid, qty: 1, label: lab }] }))] },
      { id: 'drink', label: 'שתייה', type: 'one', choices: chain === 'מקדונלד׳ס' ? [{ id: 'none', label: 'בלי / דיאט', items: [] }, { id: 'ff26', label: 'קולה קטנה', items: [{ id: 'ff26', qty: 1, label: 'קולה קטנה' }] }, { id: 'ff27', label: 'קולה בינונית', items: [{ id: 'ff27', qty: 1, label: 'קולה בינונית' }] }, { id: 'ff28', label: 'קולה גדולה', items: [{ id: 'ff28', qty: 1, label: 'קולה גדולה' }] }] : DRINK },
    ],
  };
}
const MCD_FRIES = [['ff16', 'צ׳יפס קטן'], ['ff17', 'צ׳יפס בינוני'], ['ff18', 'צ׳יפס גדול']];
const BK_FRIES = [['ff49', 'צ׳יפס בינוני'], ['ff50', 'טבעות בצל']];

export const EATOUT = [
  // ---- מנות ממסעדה (הערכה) ----
  { id: 'shawarma', name: 'שווארמה', cat: 'street', kind: 'estimate', words: ['שווארמה', 'שוארמה', 'שווארמה בפיתה', 'שווארמה בלאפה'],
    base: [{ id: 'y47', g: 150, label: 'שווארמה הודו (בשר)' }],
    groups: [
      { id: 'bread', label: 'איך מגישים', type: 'one', choices: BREAD_SH },
      { id: 'size', label: 'גודל מנה', type: 'one', choices: [{ id: 'reg', label: 'רגילה (150 ג׳ בשר)', mult: 1 }, { id: 'big', label: 'גדולה (200 ג׳ בשר)', mult: 4 / 3 }] },
      { id: 'extras', label: 'תוספות', type: 'many', choices: EXTRAS(70) },
      { id: 'drink', label: 'שתייה', type: 'one', choices: DRINK },
    ] },
  { id: 'falafel', name: 'פלאפל', cat: 'street', kind: 'estimate', words: ['פלאפל', 'פלאפל בפיתה'],
    base: [{ id: 'y108', g: 85, label: 'כדורי פלאפל', unit: 'כדור', unitG: 17 }],
    groups: [
      { id: 'bread', label: 'איך מגישים', type: 'one', choices: BREAD_SH },
      { id: 'balls', label: 'כמה כדורים', type: 'count', min: 2, max: 12, def: 5, scales: 'y108', unitG: 17 },
      { id: 'extras', label: 'תוספות', type: 'many', choices: EXTRAS(60) },
      { id: 'drink', label: 'שתייה', type: 'one', choices: DRINK },
    ] },
  { id: 'schnitzel', name: 'שניצל', cat: 'street', kind: 'estimate', words: ['שניצל', 'שניצל בבגט', 'שניצל בפיתה'],
    base: [{ id: 'y44', g: 150, label: 'שניצל עוף מטוגן' }],
    groups: [
      { id: 'bread', label: 'איך מגישים', type: 'one', choices: [{ id: 'baguette', label: 'בחצי בגט', items: [{ id: 'y34', g: 120, label: 'חצי בגט' }] }, ...BREAD_SH] },
      { id: 'extras', label: 'תוספות', type: 'many', choices: [...EXTRAS(80).filter(x => x.id !== 'tahini'), { id: 'mayo', label: 'מיונז', items: [{ id: 'y161', g: 15, label: 'מיונז' }] }, { id: 'tahini', label: 'טחינה', items: [{ id: 'y152', g: 30, label: 'טחינה' }] }] },
      { id: 'drink', label: 'שתייה', type: 'one', choices: DRINK },
    ] },
  { id: 'burger', name: 'המבורגר במסעדה', cat: 'street', kind: 'estimate', words: ['המבורגר', 'בורגר', 'המבורגר במסעדה'],
    base: [{ id: 'y32', g: 80, label: 'לחמניה' }],
    groups: [
      { id: 'patty', label: 'גודל הקציצה', type: 'one', choices: [{ id: '160', label: '160 ג׳', items: [{ id: 'y59', g: 160, label: 'קציצת בקר 160 ג׳' }] }, { id: '220', label: '220 ג׳', items: [{ id: 'y59', g: 220, label: 'קציצת בקר 220 ג׳' }] }, { id: '300', label: '300 ג׳', items: [{ id: 'y59', g: 300, label: 'קציצת בקר 300 ג׳' }] }] },
      { id: 'extras', label: 'תוספות', type: 'many', choices: [{ id: 'veg', label: 'חסה ועגבנייה', on: true, items: [{ id: 'y127', g: 40, label: 'ירקות' }] }, { id: 'sauce', label: 'רוטב / מיונז', items: [{ id: 'y161', g: 15, label: 'מיונז' }] }, { id: 'ketchup', label: 'קטשופ', items: [{ id: 'y162', g: 20, label: 'קטשופ' }] }, { id: 'chips', label: 'צ׳יפס בצד', items: [{ id: 'y22', g: 150, label: 'צ׳יפס' }] }] },
      { id: 'drink', label: 'שתייה', type: 'one', choices: DRINK },
    ] },
  { id: 'pizza', name: 'פיצה', cat: 'pizza', kind: 'estimate', words: ['פיצה', 'משולש פיצה', 'פיצה משפחתית'],
    base: [],
    groups: [
      { id: 'size', label: 'גודל המגש', type: 'one', choices: [{ id: 'S', label: 'אישית / קטנה', items: [{ id: 'y171', g: 80, label: 'משולש פיצה קטנה' }] }, { id: 'L', label: 'משפחתית', items: [{ id: 'y171', g: 115, label: 'משולש פיצה משפחתית' }] }, { id: 'XL', label: 'ענקית', items: [{ id: 'y171', g: 145, label: 'משולש פיצה ענקית' }] }] },
      { id: 'slices', label: 'כמה משולשים', type: 'count', min: 1, max: 8, def: 2, scalesGroup: 'size' },
      { id: 'drink', label: 'שתייה', type: 'one', choices: DRINK },
    ] },
  // ---- רשתות (ערכים רשמיים של הרשת, כפי שפורסמו בארה״ב) ----
  chainMeal('mcd_bigmac', 'ביג מק', 'ff5', ['ביג מק', 'מקדונלדס'], MCD_FRIES, 'מקדונלד׳ס'),
  chainMeal('mcd_qp', 'קוורטר פאונדר עם גבינה', 'ff6', ['קוורטר', 'מקדונלדס'], MCD_FRIES, 'מקדונלד׳ס'),
  chainMeal('mcd_crispy', 'מק קריספי', 'ff10', ['מק קריספי', 'מקדונלדס'], MCD_FRIES, 'מקדונלד׳ס'),
  chainMeal('mcd_chicken', 'מקצ׳יקן', 'ff9', ['מקציקן', 'מקדונלדס'], MCD_FRIES, 'מקדונלד׳ס'),
  chainMeal('mcd_nuggets', 'נאגטס 10 יח׳', 'ff14', ['נאגטס', 'מקדונלדס'], MCD_FRIES, 'מקדונלד׳ס'),
  chainMeal('mcd_hamburger', 'המבורגר', 'ff1', ['המבורגר', 'מקדונלדס'], MCD_FRIES, 'מקדונלד׳ס'),
  chainMeal('bk_whopper', 'וופר', 'ff40', ['וופר', 'בורגר קינג'], BK_FRIES, 'בורגר קינג'),
  chainMeal('bk_whopperjr', 'וופר ג׳וניור', 'ff38', ['וופר', 'בורגר קינג'], BK_FRIES, 'בורגר קינג'),
  chainMeal('bk_royal', 'רויאל קריספי צ׳יקן', 'ff44', ['רויאל', 'בורגר קינג'], BK_FRIES, 'בורגר קינג'),
  { id: 'dominos', name: 'פיצה דומינוס (משולש)', cat: 'chains', kind: 'official', chain: 'דומינוס', words: ['דומינוס', 'פיצה'],
    base: [],
    groups: [
      { id: 'type', label: 'סוג', type: 'one', choices: [['ff53', 'גבינה'], ['ff54', 'פפרוני'], ['ff55', 'דלוקס'], ['ff56', 'האוואי'], ['ff58', 'בשר']].map(([id, l]) => ({ id, label: l, items: [{ id, qty: 1, label: `פיצה ${l} (דומינוס)` }] })) },
      { id: 'slices', label: 'כמה משולשים', type: 'count', min: 1, max: 8, def: 2, scalesGroup: 'type' },
      { id: 'drink', label: 'שתייה', type: 'one', choices: DRINK },
    ] },
];
export const EATOUT_CATS = { chains: 'רשתות', street: 'שווארמה, פלאפל, שניצל והמבורגר', pizza: 'פיצה' };
export const eatoutById = id => EATOUT.find(d => d.id === id) || null;

/** בחירת ברירת מחדל: הראשון בכל קבוצת "one", המסומנים ב-on בקבוצת "many", def בקבוצת "count" */
export function defaultChoice(dish) {
  const c = {};
  for (const g of dish.groups) c[g.id] = g.type === 'one' ? g.choices[0].id : g.type === 'many' ? g.choices.filter(x => x.on).map(x => x.id) : g.def;
  return c;
}

/** מנה + בחירות → רשימת פריטים (מזון, גרמים, יחידה, כמות) — כל רכיב פעם אחת */
export function composeDish(dish, choice, foods) {
  const out = [];
  const add = (it, mult = 1) => {
    const f = foods.get(it.id); if (!f) return;
    const qty = it.qty != null ? it.qty * mult : null;
    const g = qty != null ? qty * 100 : Math.round(it.g * mult);
    out.push({ foodId: it.id, grams: g, unit: f.pp ? f.pp : 'g', qty: f.pp ? qty : null, label: it.label, ...nutrients(f, g) });
  };
  const sizeMult = dish.groups.filter(g => g.type === 'one').map(g => g.choices.find(x => x.id === choice[g.id])).find(x => x?.mult)?.mult || 1;
  const counts = Object.fromEntries(dish.groups.filter(g => g.type === 'count').map(g => [g.id, Math.max(g.min, Math.min(g.max, +choice[g.id] || g.def))]));
  for (const it of dish.base) {
    const cg = dish.groups.find(g => g.type === 'count' && g.scales === it.id);
    add(cg ? { ...it, g: cg.unitG * counts[cg.id] } : it, cg ? 1 : sizeMult);
  }
  for (const g of dish.groups) {
    if (g.type === 'count') continue;
    const chosen = g.type === 'one' ? [g.choices.find(x => x.id === choice[g.id]) || g.choices[0]] : g.choices.filter(x => (choice[g.id] || []).includes(x.id));
    const cg = dish.groups.find(x => x.type === 'count' && x.scalesGroup === g.id);
    for (const ch of chosen) for (const it of ch.items || []) add(it, cg ? counts[cg.id] : 1);
  }
  const tot = out.reduce((a, x) => { a.kcal += x.kcal; a.protein += x.protein; a.carbs += x.carbs; a.fat += x.fat; return a; }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return { items: out, totals: tot };
}

/** שם קצר למנה שהורכבה: "שווארמה בלאפה עם טחינה וצ׳יפס" */
export function dishTitle(dish, choice) {
  const one = dish.groups.filter(g => g.type === 'one' && g.id !== 'drink' && g.id !== 'size' && g.id !== 'patty').map(g => g.choices.find(x => x.id === choice[g.id])?.label).filter(l => l && !/בלבד/.test(l));
  const many = dish.groups.filter(g => g.type === 'many').flatMap(g => g.choices.filter(x => (choice[g.id] || []).includes(x.id)).map(x => x.label.split(' / ')[0]));
  const cnt = dish.groups.filter(g => g.type === 'count').map(g => `${choice[g.id] ?? g.def} ${g.id === 'balls' ? 'כדורים' : 'משולשים'}`);
  return [dish.name, ...one, ...cnt].join(' ') + (many.length ? ' עם ' + many.slice(0, -1).join(', ') + (many.length > 1 ? ' ו' : '') + many.at(-1) : '');
}

/** חיפוש מנות בחוץ בעברית */
export function searchEatout(q) {
  const t = String(q || '').replace(/[׳'"״]/g, '').trim(); if (t.length < 2) return [];
  const n = w => String(w).replace(/[׳'"״]/g, '');
  return EATOUT.filter(d => [d.name, ...(d.words || []), d.chain].filter(Boolean).map(n).some(w => w.includes(t) || (w.length >= 3 && t.includes(w))));
}
