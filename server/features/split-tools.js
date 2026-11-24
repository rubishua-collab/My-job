// פיצול: העברה לאיסוף יומי (פעולה אטומית אחת בשרת) וספר טלפונים לשליפה אוטומטית.
// מקור: app.html doXfer 3714-3766 (העברה), phbIngest/phbGet 2541-2561 (ספר טלפונים).
// ההעברה רצה בתוך טרנזקציה אחת: מוסיפה לרשימת האיסוף של היום ומוציאה מהפיצול את מה שעבר (ל-xstash),
// עם opId (ניסיון חוזר לא רושם פעמיים) ו-baseVersion של הפיצול (לחיצה כפולה / מכשיר אחר → 409, בלי כפילות).
import { num, r2, sum, normName, normTime, normStatus, cleanPh, cleanColl, normHard, phShow } from '../../public/js/calc.js';
import { notesFor, findRec } from '../split-notes.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const todayIL = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
const dmyT = (d) => d.split('-').reverse().join('.');
const wStamp = a => (a && (a.updatedAt || a.createdAt)) || 0;

// השורה כפי שנשמרת ברשימת איסוף (wAcc, app.html 2638-2641)
const workEntry = (e) => ({ n: String(e.n || '').trim(), a: num(e.a), t: normTime(e.t), s: normStatus(e.s), p: cleanPh(e.p), ...(cleanColl(e.c) ? { c: cleanColl(e.c) } : {}), ...(normHard(e.h) ? { h: e.h } : {}), ...(e.pg ? { pg: e.pg, pp: e.pp || '' } : {}) });

// ---- ספר טלפונים (app.html 2523-2561) ----
const nmTokens = s => normName(s).replace(/[-–—.,()\[\]_\/\\]/g, ' ').split(/\s+/).filter(Boolean);
const nmKey = t => t.slice().sort().join(' ');
function phbIngest(m, date, recs, replace) {
  const day = String(date || ''), local = new Map();
  for (const r of recs || []) {
    if (!r) continue; const p = phShow(r.ph); if (!p) continue;
    const toks = nmTokens(r.n); if (!toks.length) continue;
    const k = nmKey(toks); if (!local.has(k)) local.set(k, new Set()); local.get(k).add(p);
  }
  local.forEach((ps, k) => {
    const cur = m.get(k);
    if (!cur || day > cur.d || (replace && day === cur.d)) m.set(k, { d: day, ps });
    else if (day === cur.d) ps.forEach(p => cur.ps.add(p));
  });
}

export async function register(ctx) {
  const { r, err, need, can, db, getDoc, listDocs, putDoc, once, newId, now } = ctx;
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; } };

  r.get('/api/split-tools/phonebook', (req, res, { user }) => {
    need(can.finance(user));
    const m = new Map();
    listDocs('accounts').map(x => x.data).filter(a => a && a.kind === 'split' && Array.isArray(a.records)).sort((x, y) => String(x.date || '').localeCompare(String(y.date || ''))).forEach(a => phbIngest(m, a.date, a.records, false));
    listDocs('clients').map(x => x.data).forEach(c => { if (c && c.phone) phbIngest(m, String(c.updated || c.created || '').slice(0, 10), [{ n: c.name, ph: c.phone }], false); });
    const out = {}; m.forEach((v, k) => { out[k] = [v.d].concat([...v.ps]); });
    return out;
  });

  r.post('/api/split-tools/xfer', (req, res, { user, body }) => {
    need(can.finance(user));
    return tx(() => once(body.opId, user, () => {
      const sd = getDoc('accounts', String(body.splitId || ''));
      if (!sd || sd.deleted || sd.data.kind !== 'split') throw err(404, 'הפיצול לא נמצא');
      if (body.baseVersion != null && sd.version !== body.baseVersion) { const e = err(409, 'הפיצול עודכן בינתיים (אולי ההעברה כבר בוצעה). רענן ובדוק לפני העברה נוספת.'); e.current = sd.version; throw e; }
      const sp = sd.data; const recs = Array.isArray(sp.records) ? sp.records : [];
      const names = Array.isArray(body.names) ? body.names.map(cleanColl).filter(Boolean) : [];
      const ents = (Array.isArray(body.entries) ? body.entries : []).filter(e => e && (String(e.n || '').trim() || num(e.a)));
      if (!ents.length) throw err(400, 'אין שורות עם שעה. רשום שעה ליד הלווים שצריך לאסוף מהם');
      const byK = new Set(recs.map(x => x && x._k).filter(Boolean));
      const xmanIds = new Set((sp.xman || []).map(x => x && x.id).filter(Boolean));
      for (const e of ents) {
        const sid = e.sid ? String(e.sid).replace('#g', '') : '';
        if (sid && !byK.has(sid)) throw err(409, 'שורה ברשימת ההעברה כבר לא נמצאת בפיצול (אולי כבר הועברה). רענן את המסך.');
        if (!sid && e.id && !xmanIds.has(e.id) && e.man) throw err(409, 'שורה ידנית כבר הועברה. רענן את המסך.');
      }
      const date = ISO.test(body.date || '') ? body.date : todayIL();
      // הרשימה השמורה של התאריך: זו שנבחרה, אחרת הגדולה מביניהן (wSavedOf, app.html 3019-3022)
      const works = listDocs('accounts').filter(x => x.data.kind === 'work' && x.data.date === date);
      let W = body.workId ? works.find(x => x.id === body.workId) : null;
      if (!W) W = works.sort((x, y) => ((y.data.entries || []).length - (x.data.entries || []).length) || (wStamp(y.data) - wStamp(x.data)))[0] || null;
      const add = ents.map(e => { const src = e.sid ? findRec(sp, e.sid) : null; const sn = src ? notesFor(sp, src) : []; return { ...workEntry(e), _k: 'e' + newId(), ...(src ? { sid: src._k, spl: sd.id } : {}), ...(sn.length ? { sn } : {}) }; });
      let workId, created = false, all;
      if (W) {
        const data = { ...W.data }; data.entries = (data.entries || []).concat(add); data.updatedAt = now(); data.edits = (data.edits || 0) + 1;
        putDoc('accounts', W.id, data, { user, baseVersion: W.version, action: 'העברה מהפיצול', note: 'נוספו ' + add.length + ' שורות מהפיצול ' + (sp.title || sd.id) });
        workId = W.id; all = data.entries;
      } else {
        workId = newId('a'); created = true;
        const data = { kind: 'work', date, title: 'איסוף יום ' + dmyT(date), createdAt: now(), v: 1, entries: add, expenses: [] };
        putDoc('accounts', workId, data, { user, action: 'העברה מהפיצול', note: 'הועברו ' + add.length + ' שורות מהפיצול ' + (sp.title || sd.id) });
        all = add;
      }
      // מה שהועבר יוצא מהפיצול ונשמר בצד (xstash) בשביל ״אפס העברה״
      const moved = new Set(ents.map(e => e.sid && String(e.sid).replace('#g', '')).filter(Boolean));
      const movedMan = new Set(ents.filter(e => !e.sid && e.id && xmanIds.has(e.id)).map(e => e.id));
      const ns = { ...sp };
      ns.xstash = (sp.xstash || []).concat(recs.filter(x => x && moved.has(x._k)).map(x => ({ ...x })));
      ns.records = recs.filter(x => !(x && moved.has(x._k)));
      if (movedMan.size) { ns.xmstash = (sp.xmstash || []).concat((sp.xman || []).filter(x => x && movedMan.has(x.id)).map(x => ({ ...x }))); ns.xman = (sp.xman || []).filter(x => !(x && movedMan.has(x.id))); }
      ns.xhide = (sp.xhide || []).filter(h => ns.records.some(x => x && x._k === String(h).replace('#g', '')));
      ns.updatedAt = now(); ns.edits = (sp.edits || 0) + 1;
      const so = putDoc('accounts', sd.id, ns, { user, baseVersion: sd.version, action: 'העברה לאיסוף יומי', note: add.length + ' שורות לאיסוף ' + date });
      // מצטבר לאיזון בין הימים, כמו בסידור האוטומטי (app.html 3742-3745). נשמר במסמך settings/ar_hist
      const rec = {}; names.forEach(nm => { rec[nm] = all.filter(e => cleanColl(e.c) === nm).length; });
      if (names.length >= 2 && all.every(e => names.indexOf(cleanColl(e.c)) >= 0)) {
        const hd = getDoc('settings', 'ar_hist'); const hist = { ...((hd && hd.data && hd.data.h) || {}) };
        hist[date] = rec; const ks = Object.keys(hist).sort(); while (ks.length > 60) delete hist[ks.shift()];
        putDoc('settings', 'ar_hist', { h: hist, at: now() }, { user, action: 'איזון חלוקה בין ימים' });
      }
      const summary = names.map(nm => ({ c: nm, n: rec[nm], a: sum(all.filter(e => cleanColl(e.c) === nm).map(e => num(e.a))) }));
      return { workId, created, date, added: add.length, total: all.length, amount: r2(sum(add.map(e => e.a))), summary, splitVersion: so.version };
    }));
  });
}
