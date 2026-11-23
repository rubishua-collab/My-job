// ״ייבוא ועדכון לקוחות מקובץ״ — דוח ״טבלת לקוחות״ מתוכנת המחשב → מאגר הלקוחות (collection clients) בלבד.
// לא נוצר שום חוב, גבייה או שורה בחשבון יומי.
// זיהוי: ״מס׳ לקוח״ (extId) — מזהה קבוע. בלי extId בכרטיס: ת.ז. שם דומה / טלפון משותף / כמה התאמות → ממתין להכרעה.
// תא ריק בדוח לא מוחק מידע שמור. שדה שתוקן ידנית (manual) ושונה בדוח → מוצג ההבדל ובוחרים איזה ערך לשמור.
// לקוח שנעדר מהדוח נשאר במאגר. קישור שאושר נזכר (extId נכתב לכרטיס).
import { checkPhone, splitPhones } from '../../public/js/phone-check.js';
import { normName } from '../../public/js/calc.js';

const FIELDS = [['name', 'שם הלקוח'], ['tz', 'ת.ז'], ['address', 'כתובת'], ['city', 'עיר'], ['email', 'מייל'], ['fax', 'פקס'], ['srcNote', 'הערה (מהדוח)']];
const ilMonth = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' }).slice(0, 7);
const str = (v) => String(v == null ? '' : v).trim();
const nm = (s) => normName(s).replace(/[ךםןףץ]/g, c => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' })[c]);
const phoneKey = (p) => p.ok ? p.local : p.raw;
const phonesOf = (d) => Array.isArray(d.phones) ? d.phones : splitPhones(d.phone).map(r => ({ ...checkPhone(r), src: 'טלפון' }));
const phonesText = (ps) => (ps || []).map(p => p.ok ? p.local : p.raw).join(' · ');
const srcKeyOf = (row) => nm(row.name) + '|' + (row.phones || []).map(phoneKey).sort().join(',');

// שורת דוח (מהדפדפן) → שורה מנורמלת עם בדיקת טלפונים
function normRow(r, i) {
  const phones = [];
  for (const p of r.phonesRaw || []) for (const one of splitPhones(p.raw)) phones.push({ ...checkPhone(one, !!p.num && splitPhones(p.raw).length === 1), src: p.src || 'טלפון' });
  const extra = {}; for (const [k, v] of Object.entries(r.extra || {})) if (str(v)) extra[k] = str(v);
  return { i, extId: str(r.extId), name: str(r.name), tz: str(r.tz), address: str(r.address), city: str(r.city), email: str(r.email), fax: str(r.fax), srcNote: str(r.srcNote), extra, phones };
}
// כמה שורות עם אותו מס׳ לקוח בדוח — שורה אחת (ערכים לא ריקים מהשורה המאוחרת גוברים)
function dedupe(rows) {
  const by = new Map(), out = [];
  for (const r of rows) {
    if (!r.extId) { out.push(r); continue; }
    const o = by.get(r.extId); if (!o) { by.set(r.extId, r); out.push(r); continue; }
    for (const [f] of FIELDS) if (r[f]) o[f] = r[f];
    if (r.phones.length) o.phones = r.phones; Object.assign(o.extra, r.extra);
  }
  return out;
}
// השוואת שורה לכרטיס קיים: אילו שדות ישתנו, ואילו מתנגשים בתיקון ידני
function diffOf(row, d) {
  const out = []; const man = d.manual || {};
  for (const [f, label] of FIELDS) {
    const neu = row[f], old = str(d[f]);
    if (!neu || neu === old) continue; // תא ריק בדוח לא מוחק
    out.push({ f, label, old, neu, conflict: !!man[f] && !!old });
  }
  if (row.phones.length) {
    const a = phonesOf(d).map(phoneKey).sort().join(','), b = row.phones.map(phoneKey).sort().join(',');
    if (a !== b) out.push({ f: 'phones', label: 'טלפונים', old: phonesText(phonesOf(d)), neu: phonesText(row.phones), conflict: !!man.phones && phonesOf(d).length > 0 });
  }
  for (const [k, v] of Object.entries(row.extra)) { const old = str((d.extra || {})[k]); if (v !== old) out.push({ f: 'x:' + k, label: k, old, neu: v, conflict: false }); }
  return out;
}
const issuesOf = (phones) => (phones || []).filter(p => !p.ok).map(p => ({ raw: p.raw, why: p.why, src: p.src }));

export async function register(ctx) {
  const { r, err, need, can, db, listDocs, getDoc, putDoc, once, newId, now, kvGet, kvSet, logAudit } = ctx;
  const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; } };
  const clients = () => listDocs('clients').map(x => ({ id: x.id, version: x.version, d: x.data }));

  function analyze(rawRows) {
    const rows = dedupe((rawRows || []).map(normRow).filter(r => r.name || r.extId));
    const all = clients(); const byExt = new Map(), byTz = new Map(), byKey = new Map();
    for (const c of all) { if (c.d.extId) byExt.set(str(c.d.extId), c); if (c.d.tz) { const k = str(c.d.tz).replace(/^0+/, ''); (byTz.get(k) || byTz.set(k, []).get(k)).push(c); } if (c.d.srcKey) byKey.set(c.d.srcKey, c); }
    const res = { news: [], changed: [], same: [], pending: [], phoneIssues: [], rows };
    const phoneOwners = new Map(); for (const c of all) for (const p of phonesOf(c.d)) if (p.ok) (phoneOwners.get(p.local) || phoneOwners.set(p.local, []).get(p.local)).push(c);
    for (const row of rows) {
      const iss = issuesOf(row.phones);
      if (!row.phones.length || iss.length) res.phoneIssues.push({ i: row.i, name: row.name, extId: row.extId, missing: !row.phones.length, issues: iss });
      let hit = row.extId ? byExt.get(row.extId) : null, how = 'מס׳ לקוח';
      if (!hit && row.tz) { const cs = (byTz.get(row.tz.replace(/^0+/, '')) || []).filter(c => !c.d.extId || c.d.extId === row.extId); if (cs.length === 1) { hit = cs[0]; how = 'ת.ז'; } else if (cs.length > 1) { res.pending.push({ i: row.i, row: summ(row), why: 'כמה כרטיסים עם אותה ת.ז', cands: cs.map(card) }); continue; } }
      if (!hit && !row.extId && byKey.has(srcKeyOf(row))) { hit = byKey.get(srcKeyOf(row)); how = 'ייבוא קודם'; }
      if (hit) {
        const diffs = diffOf(row, hit.d);
        (diffs.length ? res.changed : res.same).push({ i: row.i, id: hit.id, name: row.name || hit.d.name, extId: row.extId, how, diffs });
        continue;
      }
      // אין מזהה תואם: שם דומה או טלפון משותף (רק כרטיסים שעוד אין להם מס׳ לקוח אחר) → הכרעה ידנית
      const free = (c) => !c.d.extId || !row.extId;
      const cands = new Map();
      for (const c of all) if (free(c) && row.name && nm(c.d.name) === nm(row.name)) cands.set(c.id, c);
      for (const p of row.phones) if (p.ok) for (const c of phoneOwners.get(p.local) || []) if (free(c)) cands.set(c.id, c);
      if (cands.size) res.pending.push({ i: row.i, row: summ(row), why: [...cands.values()].some(c => nm(c.d.name) === nm(row.name)) ? 'שם זהה לכרטיס קיים' : 'טלפון משותף עם כרטיס קיים', cands: [...cands.values()].map(card) });
      else res.news.push({ i: row.i, name: row.name, extId: row.extId, phones: phonesText(row.phones) });
    }
    return res;
  }
  const summ = (row) => ({ name: row.name, extId: row.extId, tz: row.tz, phones: phonesText(row.phones), city: row.city, address: row.address });
  const card = (c) => ({ id: c.id, name: c.d.name, extId: c.d.extId || '', tz: c.d.tz || '', phones: phonesText(phonesOf(c.d)), city: c.d.city || '', address: c.d.address || '' });
  const counts = (a) => ({ news: a.news.length, changed: a.changed.length, same: a.same.length, pending: a.pending.length, phoneIssues: a.phoneIssues.length, rows: a.rows.length });

  r.get('/api/clients-import/state', (req, res, { user }) => {
    need(can.finance(user));
    const last = kvGet('clients_import_last', null), month = ilMonth();
    return { last, map: kvGet('clients_import_map', {}), month, done: !!(last && last.month === month) };
  });
  r.post('/api/clients-import/map', (req, res, { user, body }) => { need(can.finance(user)); kvSet('clients_import_map', body.map && typeof body.map === 'object' ? body.map : {}); return { ok: true }; });
  r.post('/api/clients-import/preview', (req, res, { user, body }) => {
    need(can.finance(user));
    const a = analyze(body.rows); return { counts: counts(a), news: a.news, changed: a.changed, same: a.same, pending: a.pending, phoneIssues: a.phoneIssues };
  });
  r.post('/api/clients-import/apply', (req, res, { user, body }) => {
    need(can.finance(user));
    return tx(() => once(body.opId, user, () => {
      const a = analyze(body.rows); const rowBy = new Map(a.rows.map(x => [x.i, x]));
      const dec = body.decisions || {}, choice = body.choices || {}; const t = now(); const iso = new Date(t).toISOString();
      const file = str(body.fileName).slice(0, 200); let added = 0, updated = 0, linked = 0, skipped = 0, unchanged = a.same.length;
      const writeRow = (row, base, keepManual) => {
        const d = { ...(base || {}) };
        for (const [f] of FIELDS) { if (!row[f]) continue; if (keepManual && keepManual(f)) continue; d[f] = row[f]; }
        if (row.phones.length && !(keepManual && keepManual('phones'))) { d.phones = row.phones; const ok = row.phones.find(p => p.ok); d.phone = ok ? ok.local : (d.phone || ''); }
        d.extra = { ...(d.extra || {}) }; for (const [k, v] of Object.entries(row.extra)) if (!(keepManual && keepManual('x:' + k))) d.extra[k] = v;
        if (row.extId) d.extId = row.extId; else d.srcKey = srcKeyOf(row);
        d.imp = { file, at: t }; d.updated = iso; if (!d.created) d.created = iso; return d;
      };
      for (const c of a.news) { const row = rowBy.get(c.i); const id = 'C' + newId(); putDoc('clients', id, writeRow(row, null), { user, action: 'לקוח חדש מדוח הלקוחות', item: row.name }); added++; }
      for (const c of a.changed) {
        const row = rowBy.get(c.i), cur = getDoc('clients', c.id); const ch = choice[c.i] || {};
        const conflicts = new Set(c.diffs.filter(x => x.conflict).map(x => x.f));
        const keep = (f) => conflicts.has(f) && ch[f] !== 'file'; // בהתנגשות עם תיקון ידני — ברירת המחדל: לשמור את הערך שתוקן
        const d = writeRow(row, cur.data, keep);
        if (JSON.stringify({ ...d, imp: 0, updated: 0 }) === JSON.stringify({ ...cur.data, imp: 0, updated: 0 })) { unchanged++; continue; }
        for (const f of conflicts) if (ch[f] === 'file') { d.manual = { ...(d.manual || {}) }; delete d.manual[f]; }
        putDoc('clients', c.id, d, { user, baseVersion: cur.version, action: 'עדכון מדוח הלקוחות', item: d.name, note: c.diffs.map(x => x.label).join(', ') }); updated++;
      }
      for (const p of a.pending) {
        const row = rowBy.get(p.i), x = dec[p.i] || {};
        if (x.a === 'link' && p.cands.some(c => c.id === x.id)) { const cur = getDoc('clients', x.id); putDoc('clients', x.id, writeRow(row, cur.data, (f) => !!(cur.data.manual || {})[f] && !!str(f === 'phones' ? phonesText(phonesOf(cur.data)) : cur.data[f])), { user, baseVersion: cur.version, action: 'קישור לקוח לדוח הלקוחות', item: row.name }); linked++; }
        else if (x.a === 'new') { putDoc('clients', 'C' + newId(), writeRow(row, null), { user, action: 'לקוח חדש מדוח הלקוחות', item: row.name }); added++; }
        else skipped++;
      }
      const result = { at: t, month: ilMonth(t), file, counts: { added, updated, linked, skipped, unchanged, rows: a.rows.length, phoneIssues: a.phoneIssues.length } };
      kvSet('clients_import_last', result);
      logAudit({ user, action: 'ייבוא דוח לקוחות', col: 'clients', item: file, after: result.counts });
      return result;
    }));
  });
  // ״טלפונים לטיפול״: כרטיסים בלי טלפון או עם מספר שגוי
  r.get('/api/clients-import/issues', (req, res, { user }) => {
    need(can.finance(user));
    const out = [];
    for (const c of clients()) { const ps = phonesOf(c.d); const iss = issuesOf(ps); if (!ps.length || iss.length) out.push({ id: c.id, name: c.d.name, extId: c.d.extId || '', missing: !ps.length, issues: iss, phones: ps.map((p, idx) => ({ idx, raw: p.raw, ok: p.ok, why: p.why, type: p.type, local: p.local, src: p.src })) }); }
    return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'he'));
  });
  // תיקון / הוספת מספר — נבדק מחדש מיד, ומסומן כתיקון ידני (בדוח הבא: מוצג הבדל לבחירה)
  r.post('/api/clients-import/phone', (req, res, { user, body }) => {
    need(can.finance(user));
    return once(body.opId, user, () => {
      const cur = getDoc('clients', str(body.id)); if (!cur || cur.deleted) throw err(404, 'הלקוח לא נמצא');
      const ps = phonesOf(cur.data).slice(); const v = str(body.value); if (!v) throw err(400, 'כתוב מספר טלפון');
      const chk = { ...checkPhone(v), src: 'תיקון ידני' };
      const idx = Number.isInteger(body.idx) && body.idx >= 0 && body.idx < ps.length ? body.idx : -1;
      if (idx >= 0) ps[idx] = { ...chk, src: ps[idx].src || 'טלפון' }; else ps.push(chk);
      const ok = ps.find(p => p.ok);
      const d = { ...cur.data, phones: ps, phone: ok ? ok.local : '', manual: { ...(cur.data.manual || {}), phones: true }, updated: new Date().toISOString() };
      putDoc('clients', cur.id, d, { user, baseVersion: cur.version, action: 'תיקון טלפון', item: d.name, note: v });
      return { ok: chk.ok, why: chk.why, phones: ps };
    });
  });
}
