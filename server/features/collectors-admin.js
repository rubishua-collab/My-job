// ניהול רשימת הגובים: הוספה, תיקון שם (בכל מקום שהגובה מופיע), סימון כלא פעיל / החזרה לפעילות, והעברת גביות פתוחות.
// הרשימה נשמרת במסמך settings/coll: coll = גובים ברשימה, off = לא פעילים (נשארים בהיסטוריה, לא מוצעים לשיוך חדש), del = נמחקו.
// כל שינוי נשמר במסמך — העדכון החי (SSE) מעדכן את הרשימה בכל הלשוניות והמכשירים בלי רענון.
import { cleanColl, collKey, normStatus, ST_GOT, CHANGE, NOC_SP } from '../../public/js/calc.js';

const ISO = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });

export async function register(ctx) {
  const { r, err, need, can, db, getDoc, listDocs, putDoc, once, now, logAudit } = ctx;
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; } };
  const S = () => { const d = getDoc('settings', 'coll'); return { ...(d && d.data || {}) }; };
  const putS = (data, user, action, note) => putDoc('settings', 'coll', { ...data, at: Date.now() }, { user, action, note });
  const valid = (v) => { const c = cleanColl(v); if (!c || c === CHANGE || c === NOC_SP || c.length > 40) throw err(400, 'שם גובה לא תקין'); return c; };
  // כל השמות: מהרשימה השמורה ומכל החשבונות (כמו /api/collectors), כולל לא פעילים
  const allNames = () => {
    const s = S(), m = new Map(), del = new Set((s.del || []).map(collKey));
    for (const c of s.coll || []) m.set(collKey(c), cleanColl(c));
    for (const c of s.off || []) if (!m.has(collKey(c))) m.set(collKey(c), cleanColl(c));
    for (const d of listDocs('accounts')) for (const x of [...(d.data.entries || []), ...(d.data.records || []), ...(d.data.expenses || [])]) if (x && x.c) { const k = collKey(cleanColl(x.c)); const c = cleanColl(x.c); if (k && c !== CHANGE && c !== NOC_SP && !m.has(k)) m.set(k, c); }
    for (const k of del) m.delete(k);
    return m;
  };
  const isOff = (s, c) => (s.off || []).some(x => collKey(x) === collKey(c));

  r.get('/api/collectors/all', (req, res, { user }) => {
    need(can.finance(user));
    const s = S(); return [...allNames().values()].sort((a, b) => a.localeCompare(b, 'he')).map(c => ({ name: c, active: !isOff(s, c) }));
  });

  // הוספה. שם שכבר קיים (גם בכתיב מעט שונה) — מחזירים את הקיים במקום ליצור כפילות; לא פעיל — חוזר לפעילות
  r.post('/api/collectors/add', (req, res, { user, body }) => {
    need(can.finance(user), 'רק בעלים או מנהל יכולים להוסיף גובה');
    return tx(() => once(body.opId, user, () => {
      const c = valid(body.name), s = S(), hit = allNames().get(collKey(c));
      const coll = (s.coll || []).filter(x => collKey(x) !== collKey(c)).concat([hit || c]);
      const wasOff = isOff(s, c);
      putS({ ...s, coll, off: (s.off || []).filter(x => collKey(x) !== collKey(c)), del: (s.del || []).filter(x => collKey(x) !== collKey(c)) }, user, 'הוספת גובה', hit || c);
      logAudit({ user, action: hit ? (wasOff ? 'החזרת גובה לפעילות' : 'גובה קיים נבחר') : 'הוספת גובה', col: 'settings', doc_id: 'coll', item: hit || c });
      return { ok: true, name: hit || c, existed: !!hit, reactivated: wasOff };
    }));
  });

  // תיקון שם: בכל החשבונות (גביות, שורות פיצול, הוצאות, ״אסף בפועל״, בחירות שמורות), בבקשות הלוואה, במשתמשי הגובים וברשימה
  r.post('/api/collectors/rename', (req, res, { user, body }) => {
    need(can.finance(user), 'רק בעלים או מנהל יכולים לתקן שם גובה');
    return tx(() => once(body.opId, user, () => {
      const from = valid(body.from), to = valid(body.to), kf = collKey(from), kt = collKey(to);
      if (kf === kt && from === to) return { ok: true, name: to, changed: 0 };
      const names = allNames();
      if (kf !== kt && names.has(kt)) { const e = err(409, `השם ״${names.get(kt)}״ כבר קיים ברשימה`); e.exists = names.get(kt); throw e; }
      const same = (v) => v && collKey(cleanColl(v)) === kf;
      let docs = 0, rows = 0;
      for (const d of listDocs('accounts')) {
        const data = JSON.parse(JSON.stringify(d.data)); let n = 0;
        for (const f of ['entries', 'records', 'expenses', 'xstash', 'xman', 'xmstash']) for (const x of data[f] || []) {
          if (!x) continue;
          if (same(x.c)) { x.c = to; n++; }
          if (x.by && x.by !== '@' && same(x.by)) { x.by = to; n++; }
        }
        if (data.consC) for (const k of Object.keys(data.consC)) if (same(data.consC[k])) { data.consC[k] = to; n++; }
        if (n) { putDoc('accounts', d.id, data, { user, action: 'תיקון שם גובה', note: from + ' ← ' + to }); docs++; rows += n; }
      }
      for (const q of listDocs('loan_requests')) if (q.data.given && same(q.data.given.c)) putDoc('loan_requests', q.id, { ...q.data, given: { ...q.data.given, c: to } }, { user, action: 'תיקון שם גובה' });
      try { for (const u of db.prepare('SELECT id, collector_name FROM users WHERE collector_name IS NOT NULL').all()) if (same(u.collector_name)) db.prepare('UPDATE users SET collector_name=? WHERE id=?').run(to, u.id); } catch { /* */ }
      const s = S(), rep = (L) => (L || []).map(x => collKey(x) === kf ? to : x);
      putS({ ...s, coll: rep(s.coll).concat((s.coll || []).some(x => collKey(x) === kf) ? [] : [to]), off: rep(s.off), sel: rep(s.sel), del: (s.del || []).filter(x => collKey(x) !== kt) }, user, 'תיקון שם גובה', from + ' ← ' + to);
      logAudit({ user, action: 'תיקון שם גובה', col: 'settings', doc_id: 'coll', item: to, before: { name: from }, after: { name: to }, note: `${docs} חשבונות · ${rows} שורות` });
      return { ok: true, name: to, docs, rows };
    }));
  });

  // גביות פתוחות של גובה (לפני סימון כלא פעיל): שורות איסוף יום שלא סומנו ״נאסף״ ושורות פיצול שעוד לא הועברו — מהשבוע האחרון והלאה
  const openOf = (name) => {
    const k = collKey(cleanColl(name)), from = ISO(new Date(Date.now() - 7 * 864e5)), out = [];
    for (const d of listDocs('accounts')) {
      if (String(d.data.date || '') < from) continue;
      if (d.data.kind === 'work') for (const e of d.data.entries || []) if (e && (e.n || e.a) && collKey(cleanColl(e.c)) === k && normStatus(e.s) !== ST_GOT) out.push({ id: d.id, kind: 'work', key: e._k, n: e.n, a: +e.a || 0, date: d.data.date, t: e.t || '', s: normStatus(e.s) || '' });
      if (d.data.kind === 'split') for (const e of d.data.records || []) if (e && (e.n || e.a) && !e.side && !e.xd && collKey(cleanColl(e.c)) === k) out.push({ id: d.id, kind: 'split', key: e._k, n: e.n, a: +e.a || 0, date: d.data.date, t: e.t || '', s: '' });
    }
    return out.sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(x.n).localeCompare(String(y.n), 'he'));
  };
  r.get('/api/collectors/open', (req, res, { user, q }) => { need(can.finance(user)); return openOf(q.get('name') || ''); });

  // לא פעיל / חזרה לפעילות. אפשר להעביר באותה פעולה גביות פתוחות שנבחרו לגובה אחר (פעיל)
  r.post('/api/collectors/active', (req, res, { user, body }) => {
    need(can.finance(user), 'רק בעלים או מנהל יכולים לשנות סטטוס של גובה');
    return tx(() => once(body.opId, user, () => {
      const c = valid(body.name), s = S(), active = !!body.active;
      let moved = 0;
      if (!active && Array.isArray(body.move) && body.move.length) {
        const to = valid(body.to); if (collKey(to) === collKey(c)) throw err(400, 'בחר גובה אחר להעברה');
        if (isOff(s, to)) throw err(400, `${to} לא פעיל — בחר גובה פעיל`);
        const want = new Map(); body.move.forEach(m => { if (m && m.id && m.key) { if (!want.has(m.id)) want.set(m.id, new Set()); want.get(m.id).add(m.key); } });
        for (const [id, keys] of want) {
          const d = getDoc('accounts', id); if (!d || d.deleted) continue;
          const data = JSON.parse(JSON.stringify(d.data)); let n = 0;
          for (const f of ['entries', 'records']) for (const x of data[f] || []) if (x && keys.has(x._k) && collKey(cleanColl(x.c)) === collKey(c) && normStatus(x.s) !== ST_GOT) { x.c = to; n++; }
          if (n) { data.updatedAt = now(); putDoc('accounts', id, data, { user, action: 'העברת גביות מגובה לא פעיל', note: c + ' ← ' + to + ' · ' + n }); moved += n; }
        }
      }
      const off = (s.off || []).filter(x => collKey(x) !== collKey(c)).concat(active ? [] : [allNames().get(collKey(c)) || c]);
      const coll = (s.coll || []).some(x => collKey(x) === collKey(c)) ? s.coll : (s.coll || []).concat([c]);
      putS({ ...s, coll, off }, user, active ? 'החזרת גובה לפעילות' : 'סימון גובה כלא פעיל', c);
      logAudit({ user, action: active ? 'החזרת גובה לפעילות' : 'סימון גובה כלא פעיל', col: 'settings', doc_id: 'coll', item: c, note: moved ? `הועברו ${moved} גביות ל${body.to}` : '' });
      return { ok: true, name: c, active, moved };
    }));
  });
}
