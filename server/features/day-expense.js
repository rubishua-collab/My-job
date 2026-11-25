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

  // כל ההוצאות של תאריך (לכרטיס ״הוצאות של גובה״): ההוצאות המשותפות מרשימות האיסוף, ושורות הוצאה שנרשמו רק בחשבון הגובים
  r.get('/api/day-expense', (req, res, { user, q }) => {
    need(can.finance(user));
    const date = ISO.test(q.get('date') || '') ? q.get('date') : null; if (!date) throw err(400, 'חסר תאריך');
    const docs = listDocs('accounts').filter(x => x.data.date === date);
    const shared = [], keys = new Set();
    for (const w of docs.filter(x => x.data.kind === 'work')) for (const x of w.data.expenses || []) if (x && (x.n || x.a)) { shared.push({ key: x._k, n: x.n, a: num(x.a), c: cleanColl(x.c), t: x.t || '', at: x.at || 0, by: x.by || '' }); keys.add(x._k); }
    const collOnly = [];
    for (const d of docs.filter(x => x.data.kind === 'collectors')) for (const e of d.data.entries || []) if (e && e.k === 'e' && (e.n || e.a) && !(e.xk && keys.has(e.xk))) collOnly.push({ key: e.xk || e._k, n: e.n, a: num(e.a), c: cleanColl(e.c), t: e.t || '', only: 'חשבון גובים' });
    return { date, items: shared.concat(collOnly) };
  });

  // הסרת הוצאה משותפת: מרשימת האיסוף (expenses._k) ומחשבון הגובים (entries.xk) של אותו תאריך — יחד
  r.post('/api/day-expense/remove', (req, res, { user, body }) => {
    need(can.finance(user));
    return tx(() => once(body.opId, user, () => {
      const date = ISO.test(body.date || '') ? body.date : null, key = String(body.key || ''); if (!date || !key) throw err(400, 'חסרים פרטים');
      let n = 0;
      for (const d of listDocs('accounts').filter(x => x.data.date === date && (x.data.kind === 'work' || x.data.kind === 'collectors'))) {
        const data = { ...d.data };
        if (d.data.kind === 'work') { const before = (data.expenses || []).length; data.expenses = (data.expenses || []).filter(x => !(x && x._k === key)); if (data.expenses.length === before) continue; }
        else { const before = (data.entries || []).length; data.entries = (data.entries || []).filter(x => !(x && (x.xk === key || x._k === key))); if (data.entries.length === before) continue; }
        data.updatedAt = now(); putDoc('accounts', d.id, data, { user, action: 'הסרת הוצאה' }); n++;
      }
      // הוצאת ״מתן הלוואה״ שהוסרה — הבקשה חוזרת ל״ממתינה למסירה״
      if (key.startsWith('xL')) { const q = getDoc('loan_requests', key.slice(2)); if (q && !q.deleted && q.data.given && q.data.given.xk === key) { const data = { ...q.data }; delete data.given; putDoc('loan_requests', q.id, data, { user, action: 'ביטול אישור מסירה', item: data.name, note: 'ההוצאה הוסרה' }); } }
      return { ok: true, removed: n };
    }));
  });

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
      // אותה הוצאה גם בחשבון הגובים של התאריך (אם יש) — עותק מקושר (xk = מזהה ההוצאה), באותה טרנזקציה
      let collId = null;
      const colls = listDocs('accounts').filter(d => d.data.kind === 'collectors' && d.data.date === date).sort((p, q) => (q.data.updatedAt || q.data.createdAt || 0) - (p.data.updatedAt || p.data.createdAt || 0));
      const C = (body.collId && colls.find(d => d.id === body.collId)) || colls[0];
      if (C) {
        const data = { ...C.data, entries: (C.data.entries || []).concat([{ k: 'e', n, a, c, t: x.t, xk: x._k }]) }; data.updatedAt = t;
        putDoc('accounts', C.id, data, { user, action: 'הוספת הוצאה', item: c + ' · ' + n, note: a + ' ₪' }); collId = C.id;
      }
      return { ok: true, workId, created, collId, expense: x };
    }));
  });
}
