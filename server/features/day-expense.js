// ״הוסף הוצאה״ מ״פיצול״ ומ״איסוף יום״: הוצאה של גובה נשמרת פעם אחת בלבד — ברשימת איסוף היום של התאריך הפתוח
// (נוצרת אם עוד אין, בלי גביות). הפיצול מציג את אותן הוצאות מתוך רשימת האיסוף, כך שמעבר בין הלשוניות, רענון
// או ״העברה לאיסוף יומי״ (שמוסיפה רק גביות) מקזזים כל הוצאה פעם אחת. opId: לחיצה כפולה לא רושמת פעמיים.
import { num, r2, cleanColl, collKey, workGroups, wExpList, CHANGE, NOC_SP } from '../../public/js/calc.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const hhmmIL = (t) => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
const wStamp = a => (a && (a.updatedAt || a.createdAt)) || 0;

// רשימת האיסוף ״הראשית״ של תאריך — אותו כלל של ההעברה מהפיצול (הגדולה ביותר, ואז העדכנית)
export function mainWork(listDocs, date) {
  const works = listDocs('accounts').filter(x => x.data.kind === 'work' && x.data.date === date);
  return works.sort((x, y) => ((y.data.entries || []).length - (x.data.entries || []).length) || (wStamp(y.data) - wStamp(x.data)))[0] || null;
}
// מה שהפיצול מציג לכל גובה מתוך איסוף היום: הוצאות (עם שעה ותיאור), נגבה בפועל, סה״כ הוצאות ונטו למסירה
export function dayInfo(listDocs, date) {
  const works = listDocs('accounts').filter(x => x.data.kind === 'work' && x.data.date === date);
  const exp = [], got = {};
  for (const w of works) {
    (w.data.expenses || []).filter(x => x && (x.n || x.a)).forEach(x => exp.push({ ...x, work: w.id }));
    const gs = workGroups(w.data.entries || [], wExpList(w.data)) || [];
    gs.forEach(g => { const k = collKey(g.name); got[k] = r2((got[k] || 0) + g.calc.gotTotal); });
  }
  return { works: works.map(w => w.id), exp, got };
}

export async function register(ctx) {
  const { r, err, need, can, db, getDoc, listDocs, putDoc, once, newId, now } = ctx;
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; } };

  r.post('/api/day-expense', (req, res, { user, body }) => {
    need(can.finance(user), 'רק בעלים או מנהל יכולים לרשום הוצאה');
    return tx(() => once(body.opId, user, () => {
      const date = ISO.test(body.date || '') ? body.date : null; if (!date) throw err(400, 'חסר תאריך');
      const c = cleanColl(body.c); if (!c || c === CHANGE || c === NOC_SP) throw err(400, 'בחר גובה מהרשימה');
      const a = r2(num(body.a)); if (!(a > 0)) throw err(400, 'חסר סכום להוצאה');
      const n = String(body.n || '').trim() || 'הוצאה';
      let W = body.workId ? getDoc('accounts', String(body.workId)) : null;
      if (W && (W.deleted || W.data.kind !== 'work' || W.data.date !== date)) W = null;
      if (!W) W = mainWork(listDocs, date);
      const t = now(); const x = { _k: 'x' + newId(), n, a, c, t: hhmmIL(t), at: t, by: user.name };
      let workId, created = false;
      if (W) {
        const data = { ...W.data, expenses: (W.data.expenses || []).concat([x]) }; data.updatedAt = t;
        putDoc('accounts', W.id, data, { user, action: 'הוספת הוצאה', item: c + ' · ' + n, note: a + ' ₪' });
        workId = W.id;
      } else {
        workId = newId('a'); created = true;
        putDoc('accounts', workId, { kind: 'work', date, title: 'איסוף יום ' + date.split('-').reverse().join('.'), createdAt: t, v: 1, entries: [], expenses: [x] }, { user, action: 'הוספת הוצאה', item: c + ' · ' + n });
      }
      return { ok: true, workId, created, expense: x };
    }));
  });
}
