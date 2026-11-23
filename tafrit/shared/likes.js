// השלמה אוטומטית למאכלים אהובים בשאלון: שמות קצרים וקריאים מתוך מאגר המזון של האפליקציה.
import { norm } from './foods.js';

/** מפתח השוואה: נרמול רגיל + כתיב מלא/חסר (עגבנייה = עגבניה, תפוז = תפוז) */
export const likeKey = s => norm(s).replace(/יי/g, 'י').replace(/וו/g, 'ו');

// בלי סוגריים (גם סוגר שנקטע בחיתוך בפסיק הראשון: "עגבניות מרוסקות (Plain")
const clean = s => String(s || '').replace(/\([^)]*\)/g, '').replace(/\(.*$/, '').replace(/\s+/g, ' ').trim();

/**
 * רשימת שמות לבחירה, לפי סדר עדיפות: הכפתורים במסך, רכיבי התפריט, הרשימה הנפוצה מהיומן הקודם,
 * ואז החלק הראשון של שם המזון במאגר משרד הבריאות ("חמאה, ללא מלח" → "חמאה"). כפילויות (גם בכתיב שונה) מוסרות.
 */
export function likeNames({ chips = [], components = [], foods = [] }) {
  const out = []; const seen = new Set();
  const add = (name, prio) => {
    const n = clean(name); if (!n || n.length > 24 || n.split(' ').length > 3) return;
    const k = likeKey(n); if (!k) return;
    if (seen.has(k)) { const x = out.find(o => o.key === k); if (x.prio > 0 && n.length > x.name.length) x.name = n; return; } // כתיב מלא עדיף: עגבנייה
    seen.add(k); out.push({ name: n, key: k, prio: prio === 0 ? 0 : prio <= 2 ? 1 : 2 });
  };
  chips.forEach(n => add(n, 0));
  components.forEach(n => add(n, 1));
  foods.filter(f => f.src === 'yoman').forEach(f => add(f.n, 2));
  foods.filter(f => f.src === 'moh').forEach(f => add(String(f.n).split(',')[0], 3));
  return out;
}

/** הצעות לטקסט שהוקלד: קודם שמות שמתחילים בו, אחר כך מילה שמתחילה בו, ואז כל התאמה. בתוך כל קבוצה: הכפתורים במסך, מזונות נפוצים, ואז השאר — ומהקצר לארוך */
export function suggestLikes(list, q, limit = 8) {
  const k = likeKey(q); if (!k) return [];
  const scored = [];
  for (const x of list) {
    const rank = x.key.startsWith(k) ? 0 : x.key.split(' ').some(w => w.startsWith(k)) ? 1 : x.key.includes(k) ? 2 : -1;
    if (rank >= 0) scored.push([rank, x.prio, x.name.length, x]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return scored.slice(0, limit).map(s => s[3]);
}
