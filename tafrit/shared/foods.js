// מאגר המזון: חיפוש בעברית, יחידות מידה, מצב (יבש/מבושל/מסונן) וחישוב ערכים לכמות.

export const SRC_LABEL = {
  moh: 'מאגר התזונה הלאומי (משרד הבריאות)',
  usda: 'USDA FoodData Central (ארה״ב)',
  cofid: 'CoFID — McCance & Widdowson (בריטניה)',
  custom: 'מוצר אישי לפי תווית',
  recipe: 'מתכון ביתי',
  yoman: 'ממוצעי USDA ומוצרים נפוצים (מהיומן הקודם)',
  chain: 'רשת מזון מהיר — ערכים מפורסמים בחו״ל, למנה אחת. המנות בארץ יכולות להיות שונות',
  manual: 'רישום ידני',
};
export const MAKOR_LABEL = { 1: 'נתוני USDA', 2: 'תווית יצרן', 3: 'תווית יצרן עם חישוב', 4: 'מתכון מחושב', 5: 'אחר', 6: 'נתוני USDA עם חישוב', 7: 'ערכים משולבים' };

export const STATE = {
  dry: { short: 'יבש', label: 'יבש — שוקלים לפני הבישול', hint: 'הערכים הם למוצר היבש. אם שקלת בצלחת אחרי בישול, בחר את הגרסה המבושלת.' },
  raw: { short: 'נא', label: 'לא מבושל — שוקלים לפני הבישול', hint: 'הערכים הם למוצר הנא. אם שקלת אחרי בישול, בחר את הגרסה המבושלת.' },
  cooked: { short: 'מבושל', label: 'מבושל — שוקלים בצלחת', hint: 'הערכים הם למוצר אחרי הכנה. שוקלים את מה שבצלחת.' },
  drained: { short: 'מסונן', label: 'מסונן — בלי הנוזלים', hint: 'הערכים הם אחרי סינון הנוזלים.' },
  liquid: { short: 'עם נוזלים', label: 'כולל הנוזלים', hint: 'הערכים כוללים את הנוזל שבאריזה.' },
  dried: { short: 'מיובש', label: 'מיובש', hint: 'פרי או ירק מיובש — מרוכז יותר בקלוריות.' },
};

const NIQQUD = /[\u0591-\u05C7]/g;
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
export function norm(s) {
  return String(s || '').toLowerCase().replace(NIQQUD, '').replace(/[ךםןףץ]/g, c => FINALS[c])
    .replace(/[׳'"״`’]/g, '').replace(/[^\p{L}\p{N}%.]+/gu, ' ').trim();
}
// מילים נרדפות נפוצות → המונח שבמאגר (אחרי נרמול: אותיות סופיות הופכות לרגילות)
const SYN = { 'ביצימ': 'ביצה', 'עגבניות': 'עגבניה', 'פיתות': 'פיתה', 'קוטגי': 'קוטג', 'תפוא': 'תפוחי אדמה', 'קוואקר': 'שיבולת שועל', 'פרוסות': 'פרוסה', 'מלפפונימ': 'מלפפונ', 'תפוחימ': 'תפוח', 'בננות': 'בננה', 'שקדימ': 'שקדימ', 'אגוזימ': 'אגוזי' };
export function normQuery(q) { return norm(q).split(' ').filter(Boolean).map(w => SYN[w] || w).join(' '); }

export class FoodIndex {
  constructor(foods = []) { this.byId = new Map(); this.list = []; this.add(foods); }
  add(foods) {
    for (const f of foods) {
      const item = { ...f, _n: norm(f.n + ' ' + (f.brand || '') + ' ' + (f.e || '')) };
      if (this.byId.has(f.id)) this.list = this.list.filter(x => x.id !== f.id);
      this.byId.set(f.id, item); this.list.push(item);
    }
  }
  remove(id) { this.byId.delete(id); this.list = this.list.filter(x => x.id !== id); }
  get(id) { return this.byId.get(id) || null; }
  /** חיפוש: כל המילים חייבות להופיע; דירוג לפי התאמה לתחילת השם, אורך, מועדפים ומזונות בסיסיים */
  search(q, { limit = 40, boost = new Set(), common = new Set() } = {}) {
    const words = normQuery(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const f of this.list) {
      const n = f._n;
      if (!words.every(w => n.includes(w))) continue;
      const head = norm(f.n).split(' ')[0];
      let s = 0;
      if (n.startsWith(words[0])) s += 30;
      if (head === words[0]) s += 15;
      if (words.length > 1 && n.includes(words.join(' '))) s += 10;
      s -= Math.min(30, f.n.length / 3);
      if (f.src === 'custom' || f.src === 'recipe') s += 25; // אישי / מתכון
      else if (f.src === 'yoman') s += 12; // הרשימה הנפוצה מהיומן הקודם — לפני הווריאציות הנדירות במאגר
      else if (f.src === 'chain') s -= 5;
      else if (f.src === 'usda' || f.src === 'cofid') s -= f.he === 1 ? 8 : 14; // מאגרים עולמיים: אחרי הישראלי
      if (f.mk === 1 || f.mk === 6) s += 4; // ערכי בסיס
      if (f.mk === 4) s -= 2;
      if (boost.has(f.id)) s += 40;
      if (common.has(f.id)) s += 20;
      out.push([s, f]);
    }
    out.sort((a, b) => b[0] - a[0]);
    return out.slice(0, limit).map(x => x[1]);
  }
}

// ---- יחידות ----
const EGG_SIZE = { 'יחידה קטנה': 'ביצה S', 'יחידה בינונית': 'ביצה M', 'יחידה גדולה': 'ביצה L', 'יחידה גדולה מאד': 'ביצה XL' };
export function isEgg(f) { return f && f.src === 'moh' && f.g === 3 && /^ביצה (שלמה|קשה|רכה)/.test(f.n); }
/** יחידות מידה זמינות למזון: גרמים + יחידות עם משקל ידוע */
export function unitsFor(f) {
  if (f.pp) return [{ key: f.pp, label: f.pp, g: 100 }];
  const list = [{ key: 'g', label: 'גרם', g: 1 }];
  for (const [name, g] of f.u || []) {
    if (!(g > 0)) continue;
    const label = isEgg(f) && EGG_SIZE[name] ? `${EGG_SIZE[name]}` : name;
    list.push({ key: name, label, g });
  }
  return list;
}
export function unitGrams(f, unitKey) {
  if (!unitKey || unitKey === 'g') return 1;
  const u = (f.u || []).find(x => x[0] === unitKey);
  return u ? u[1] : null;
}
/** יחידה מועדפת להצגה (לביצה: L; לפיתה: יחידה; ללחם: פרוסה בינונית) */
export function defaultUnit(f) {
  if (f.pp) return [f.pp, 100];
  const u = f.u || [];
  const pick = names => names.map(n => u.find(x => x[0] === n)).find(Boolean);
  if (isEgg(f)) return pick(['יחידה גדולה', 'יחידה']);
  return pick(['יחידה', 'פרוסה בינונית', 'פרוסה', 'גביע', 'יחידה בינונית']) || null;
}

export const r1 = x => Math.round(x * 10) / 10;
export function nutrients(f, grams) {
  const k = grams / 100;
  return {
    kcal: (f.k || 0) * k, protein: (f.p || 0) * k, fat: (f.f || 0) * k, carbs: (f.c || 0) * k,
    fiber: (f.fi || 0) * k, sugars: f.su != null ? f.su * k : null, sodium: f.na != null ? f.na * k : null,
  };
}
export function sumNutrients(list) {
  const t = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, vegFruitG: 0 };
  for (const x of list) {
    t.kcal += x.kcal || 0; t.protein += x.protein || 0; t.fat += x.fat || 0; t.carbs += x.carbs || 0; t.fiber += x.fiber || 0;
    t.vegFruitG += x.vegFruitG || 0;
  }
  return t;
}
/** טקסט "ל-100 ג׳" או "למנה" לפי סוג המזון */
export const perLabel = f => f.pp ? `ל-1 ${f.pp}` : 'ל-100 ג׳';
/** רישום ידני / ממצלמה: מזון "וירטואלי" שנשמר רק ברישום עצמו (snapshot). per: '100g' או 'portion' */
export function manualFood({ name, k, p, c, f, per, unitName, unitGrams }) {
  const base = { n: String(name || '').trim().slice(0, 80), src: 'manual', k: +k || 0, p: +p || 0, c: +c || 0, f: +f || 0, fi: null, st: null };
  if (per === 'portion') return { ...base, pp: 'מנה', u: [['מנה', 100]] };
  return { ...base, u: +unitGrams > 0 ? [[String(unitName || 'יחידה').slice(0, 20), +unitGrams]] : [] };
}

/** ירק או פרי (לפי קוד הקבוצה במאגר: 6 = פירות, 7 = ירקות), בלי מיצים */
export function isVegFruit(f) {
  if (f.vf != null) return !!f.vf;
  return f.src === 'moh' && (f.g === 6 || f.g === 7) && !/מיץ|נקטר|משקה|מיובש|צ׳יפס|צ'יפס|מטוגן|ריבה|מסוכר|תפוחי אדמה|תפוח אדמה|בטטה|פירה/.test(f.n);
}
/** כמות בטקסט קריא: "2 ביצה L (116 ג׳)" */
// רבים ליחידות נפוצות: "4 פרוסות", "3 ביצים L", "2 גביעים"
const PLURAL = { 'פרוסה': 'פרוסות', 'יחידה': 'יחידות', 'ביצה': 'ביצים', 'כוס': 'כוסות', 'כף': 'כפות', 'כפית': 'כפיות', 'גביע': 'גביעים', 'קציצה': 'קציצות', 'המבורגר': 'המבורגרים', 'מנה': 'מנות', 'פיתה': 'פיתות', 'כריך': 'כריכים', 'כוס': 'כוסות', 'משולש': 'משולשים', 'אריזה': 'אריזות', 'חטיף': 'חטיפים', 'קונוס': 'קונוסים', 'פאי': 'פאים', 'פרוסות': 'פרוסות', 'מקמאפין': 'מקמאפינים', 'ארוחה': 'ארוחות', 'עוגה': 'עוגות' };
const ADJ_PL = { 'קטנה': 'קטנות', 'בינונית': 'בינוניות', 'גדולה': 'גדולות', 'דקה': 'דקות', 'קטן': 'קטנים', 'בינוני': 'בינוניים', 'גדול': 'גדולים', 'מאד': 'מאד', 'אישית': 'אישיות' };
export function plural(label, n) {
  if (!(n > 1)) return label;
  const w = String(label).split(' ');
  if (PLURAL[w[0]]) w[0] = PLURAL[w[0]]; else return label;
  for (let i = 1; i < w.length; i++) if (ADJ_PL[w[i]]) w[i] = ADJ_PL[w[i]];
  return w.join(' ');
}
export function qtyText(f, grams, unitKey, qty) {
  const g = Math.round(grams);
  if (f.pp) { const q = unitKey === f.pp && qty ? qty : grams / 100; return `${fmtQty(q)} ${plural(f.pp, q)}`; }
  if (unitKey && unitKey !== 'g' && qty) {
    const u = unitsFor(f).find(x => x.key === unitKey);
    if (u) return qty === 1 ? `${u.label} (${g} ג׳)` : `${fmtQty(qty)} ${plural(u.label, qty)}, ${g} גרם בסך הכול`;
  }
  return `${g} ג׳`;
}
export function fmtQty(q) {
  const w = Math.floor(q); const fr = Math.round((q - w) * 4) / 4;
  const frs = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[fr] || '';
  if (!w && frs) return frs;
  return `${w || ''}${frs ? ' ' + frs : ''}`.trim() || '0';
}

/** מתכון ביתי: ערכים ל-100 גרם מתוך הרכיבים (כולל שמן ורטבים) והמשקל הסופי */
export function recipeFood(recipe, index) {
  let totals = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }; let raw = 0; const missing = [];
  for (const it of recipe.items || []) {
    const f = index.get(it.foodId);
    if (!f) { missing.push(it.foodId); continue; }
    const n = nutrients(f, +it.grams || 0);
    for (const k of Object.keys(totals)) totals[k] += n[k] || 0;
    raw += +it.grams || 0;
  }
  const finalG = +recipe.cookedGrams || raw || 1;
  const per = x => x / finalG * 100;
  const servings = +recipe.servings || 0;
  const u = [];
  if (servings > 0) u.push(['מנה', Math.round(finalG / servings)]);
  return {
    id: 'r:' + recipe.id, n: recipe.name, src: 'recipe', st: 'cooked',
    k: r1(per(totals.kcal)), p: r1(per(totals.protein)), f: r1(per(totals.fat)), c: r1(per(totals.carbs)), fi: r1(per(totals.fiber)),
    u, rawGrams: raw, finalGrams: finalG, missing, total: totals,
  };
}
/** מוצר אישי לפי תווית: ערכים ל-100 גרם, ואם יש — משקל יחידה/מנה */
export function customFood(c) {
  const u = [];
  if (+c.unitGrams > 0) u.push([c.unitName || 'יחידה', +c.unitGrams]);
  return { id: 'c:' + c.id, n: c.name, brand: c.brand || '', src: 'custom', k: +c.k || 0, p: +c.p || 0, f: +c.f || 0, c: +c.c || 0, fi: c.fi != null && c.fi !== '' ? +c.fi : null, na: c.na != null && c.na !== '' ? +c.na : null, u, st: c.st || null, vf: c.vf ? 1 : null };
}
