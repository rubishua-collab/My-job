// שקילות וממוצע שבועי (ראשון–שבת). יום בלי שקילה לא נכנס לחישוב.
import { weekStart, addDays, weekDates } from './dates.js';

const r2 = x => Math.round(x * 100) / 100;

/** שקילה אחת לכל תאריך: אם יש כפילות (למשל אחרי תיקון) נשארת האחרונה שנשמרה */
export function uniqueByDate(weights) {
  const m = new Map();
  for (const w of weights || []) {
    if (!(+w.kg > 0)) continue;
    const prev = m.get(w.date);
    if (!prev || (w.updatedAt || 0) >= (prev.updatedAt || 0)) m.set(w.date, w);
  }
  return [...m.values()].sort((a, b) => a.date < b.date ? -1 : 1);
}

export function weekSummary(weights, start, today) {
  const dates = weekDates(start); const end = dates[6];
  const list = uniqueByDate(weights).filter(w => w.date >= start && w.date <= end);
  const n = list.length;
  const sum = list.reduce((a, w) => a + +w.kg, 0);
  return {
    start, end, entries: list, n, sum: r2(sum), avg: n ? r2(sum / n) : null,
    inProgress: today >= start && today <= end, future: today < start,
    label: `${n} מתוך 7 שקילות`,
  };
}

/** שבועות אחרונים, מהחדש לישן */
export function recentWeeks(weights, today, count = 8) {
  const out = []; let s = weekStart(today);
  for (let i = 0; i < count; i++) { out.push(weekSummary(weights, s, today)); s = addDays(s, -7); }
  return out;
}

/** השוואה בין שבועות שהסתיימו: שינוי בק״ג ובאחוזים */
export function compareWeeks(cur, prev) {
  if (!cur?.avg || !prev?.avg) return null;
  const kg = r2(cur.avg - prev.avg);
  return { kg, pct: Math.round(kg / prev.avg * 10000) / 100 };
}

/** מגמה: ממוצע נע מעריכי יומי (מחליק תנודות של מים ומלח) */
export function trendLine(weights, alpha = 0.25) {
  const list = uniqueByDate(weights); let t = null;
  return list.map(w => { t = t == null ? +w.kg : t + alpha * (+w.kg - t); return { date: w.date, kg: +w.kg, trend: r2(t) }; });
}

/** זיהוי משקל בטקסט חופשי: "הבוקר שקלתי 119.8", "119,8 קילו", "אתמול 120.2" */
export function parseWeightText(text, today) {
  const t = String(text || '');
  const m = t.match(/(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:ק["״]?ג|קילו|kg)?/i);
  if (!m) return null;
  const kg = parseFloat(m[1].replace(',', '.'));
  if (!(kg >= 30 && kg <= 350)) return null;
  if (!/שקל|משקל|שקילה|נשקל|ק["״]?ג|קילו|kg/i.test(t)) return null;
  let date = today;
  if (/שלשום/.test(t)) date = addDays(today, -2); else if (/אתמול/.test(t)) date = addDays(today, -1);
  return { kg, date };
}
