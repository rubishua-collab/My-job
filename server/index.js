// יומן חשבון בוקר — שרת האפליקציה
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bus, db, getDoc, listDocs, putDoc, deleteDoc, once, newId, now, logAudit, kvGet, kvSet, DATA_DIR } from './db.js';
import { Router, parseCookies, readBody, send, serveStatic, SECURITY_HEADERS } from './http.js';
import { login, logout, sessionUser, createUser, can, ROLES, hashPassword, publicUser } from './auth.js';
import { listAccounts, filterForUser, search, clientCard, today, loansView, knownCollectors, clientIndex, KIND_NAMES } from './data.js';
import { importBackup } from './importer.js';
import { reconcile, metrics, dbCols, dbFiles } from './reconcile.js';
import * as wa from './wa.js';
import { calcMorning, prevMorning, normStatus, collKey, cleanColl, ST_GOT, r2, normName } from '../public/js/calc.js';
import { normPhone } from '../public/js/phone.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = +process.env.PORT || 8080;
const SECURE = process.env.COOKIE_SECURE !== '0' && !!process.env.PUBLIC_URL?.startsWith('https');
const r = new Router();
const err = (status, message) => Object.assign(new Error(message), { status });
const need = (ok, msg = 'אין לך הרשאה לפעולה הזו') => { if (!ok) throw err(403, msg); };

// ---- כניסה ----
const attempts = new Map();
r.post('/api/login', async (req, res, { body }) => {
  const ip = req.socket.remoteAddress; const a = attempts.get(ip) || { n: 0, t: 0 };
  if (a.n >= 8 && now() - a.t < 10 * 60e3) throw err(429, 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות');
  const s = login(body.username, body.password, req.headers['user-agent']);
  if (!s) { attempts.set(ip, { n: a.n + 1, t: now() }); throw err(401, 'שם משתמש או סיסמה שגויים'); }
  attempts.delete(ip);
  logAudit({ user: s.user, action: 'כניסה' });
  send(res, 200, { user: s.user }, { 'Set-Cookie': `sid=${s.token}; HttpOnly; Path=/; Max-Age=${s.maxAge}; SameSite=Lax${SECURE ? '; Secure' : ''}` });
});
r.post('/api/logout', (req, res, { token }) => { logout(token); send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' }); });
r.get('/api/me', (req, res, { user }) => ({ user, can: { finance: can.finance(user), sensitive: can.sensitive(user), users: can.users(user), restore: can.restore(user), send: can.send(user), waConfig: can.waConfig(user) } }));

// ---- חשבונות ----
r.get('/api/accounts', (req, res, { user, q }) => listAccounts(user, q.get('kind')));
r.get('/api/accounts/:id', (req, res, { user, params }) => {
  const d = getDoc('accounts', params.id); if (!d || d.deleted) throw err(404, 'החשבון לא נמצא');
  const a = filterForUser(user, { id: d.id, ...d.data }); if (!a) throw err(403, 'אין לך הרשאה לחשבון הזה');
  const extra = {};
  if (a.kind === 'morning') { const p = prevMorning(listDocs('accounts').map(x => ({ id: x.id, ...x.data })), a.date, a.id); extra.prev = p; }
  return { ...a, _version: d.version, _updatedAt: d.updated_at, _updatedBy: d.updated_by, ...extra };
});
r.post('/api/accounts', (req, res, { user, body }) => {
  need(can.finance(user));
  return once(body.opId, user, () => {
    const kind = body.kind; if (!KIND_NAMES[kind]) throw err(400, 'סוג חשבון לא מוכר');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);
    const id = newId('a');
    const base = { kind, date, title: KIND_NAMES[kind] + ' ' + date.split('-').reverse().join('.'), createdAt: now(), v: 1 };
    let doc;
    if (kind === 'morning') {
      // הקרן הקיימת = הקרן הסופית של חשבון הבוקר הקודם (כמו בתוכנה המקורית), כדי שהקרן תירשם פעם אחת בלבד
      const prev = prevMorning(listDocs('accounts').map(x => ({ id: x.id, ...x.data })), date, null);
      doc = { ...base, rows: [], loans: [], courier: 0, keren: prev ? prev.final : 0 };
      doc.finalKeren = calcMorning(doc).final;
    } else if (kind === 'collectors') doc = { ...base, entries: [] };
    else if (kind === 'split') doc = { ...base, records: [], phones: ['סמיילי', 'גובאני', 'שילו'] };
    else doc = { ...base, entries: [], expenses: [] };
    putDoc('accounts', id, doc, { user });
    return { id };
  });
});
r.put('/api/accounts/:id', (req, res, { user, params, body }) => {
  need(can.finance(user));
  return once(body.opId, user, () => {
    const d = body.data; if (!d || !KIND_NAMES[d.kind]) throw err(400, 'נתונים חסרים');
    const keyed = ensureKeys(d);
    if (keyed.kind === 'morning') keyed.finalKeren = calcMorning(keyed).final;
    keyed.updatedAt = now(); keyed.edits = (keyed.edits || 0) + 1;
    const out = putDoc('accounts', params.id, keyed, { user, baseVersion: body.baseVersion, note: body.note });
    return { id: params.id, version: out.version };
  });
});
r.del('/api/accounts/:id', (req, res, { user, params }) => { need(user.role === 'owner', 'רק בעל התוכנה יכול למחוק חשבונות'); deleteDoc('accounts', params.id, { user }); return { ok: true }; });
function ensureKeys(d) {
  for (const f of ['rows', 'entries', 'records', 'expenses', 'loans']) if (Array.isArray(d[f])) d[f].forEach(x => { if (x && typeof x === 'object' && !x._k) x._k = f[0] + newId(); });
  return d;
}

// סימון איסוף / תיקון סימון שגוי. כל שינוי נרשם: מי, מתי, מה היה ומה נהיה. שליחת הודעה לא נוגעת כאן ולא משנה יתרה
r.post('/api/accounts/:id/mark', (req, res, { user, params, body }) => once(body.opId, user, () => {
  const d = getDoc('accounts', params.id); if (!d || d.data.kind !== 'work') throw err(404, 'רשימת האיסוף לא נמצאה');
  const e = (d.data.entries || []).find(x => x._k === body.key); if (!e) throw err(404, 'השורה לא נמצאה');
  if (!can.finance(user)) need(collKey(cleanColl(e.c)) === collKey(user.collector_name), 'אפשר לסמן רק איסופים שלך');
  const before = { s: e.s || '', by: e.by || '', ga: e.ga ?? '', pmt: e.pmt || '', nt: e.nt || '' };
  const s = ['', 'נאסף', 'לא נאסף', 'לעבור', 'לא ענו'].includes(body.s) ? body.s : before.s;
  e.s = s;
  if (body.by !== undefined) { if (body.by) e.by = String(body.by).trim(); else delete e.by; }
  if (body.ga !== undefined) { if (body.ga === '' || body.ga == null || s !== 'נאסף') delete e.ga; else e.ga = r2(+body.ga || 0); }
  if (body.pmt !== undefined) { if (body.pmt) e.pmt = String(body.pmt); else delete e.pmt; }
  if (body.nt !== undefined) { if (body.nt) e.nt = String(body.nt); else delete e.nt; }
  e.mk = { u: user.name, at: now() };
  const after = { s: e.s || '', by: e.by || '', ga: e.ga ?? '', pmt: e.pmt || '', nt: e.nt || '' };
  d.data.updatedAt = now();
  const out = putDoc('accounts', params.id, d.data, { user, action: before.s && before.s !== s ? 'תיקון סימון איסוף' : 'סימון איסוף', item: e.n + ' (' + body.key + ')', note: body.reason || '' });
  logAudit({ user, action: 'שינוי סטטוס', col: 'accounts', doc_id: params.id, item: body.key, before, after, note: e.n });
  return { ok: true, version: out.version, entry: e };
}));
r.get('/api/accounts/:id/history', (req, res, { user, params }) => {
  const rows = db.prepare("SELECT id,at,user_name,action,item,before,after,note FROM audit WHERE col='accounts' AND doc_id=? AND action='שינוי סטטוס' ORDER BY id DESC LIMIT 500").all(params.id);
  if (!can.finance(user)) { const d = getDoc('accounts', params.id); const keys = new Set((d?.data?.entries || []).filter(e => collKey(cleanColl(e.c)) === collKey(user.collector_name)).map(e => e._k)); return rows.filter(x => keys.has(x.item)); }
  return rows;
});

// ---- היום, חיפוש, לקוחות ----
r.get('/api/today', (req, res, { user, q }) => today(user, q.get('date') || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' })));
r.get('/api/search', (req, res, { user, q }) => search(user, Object.fromEntries(q)));
r.get('/api/clients/:key', (req, res, { user, params }) => { const c = clientCard(user, params.key); if (!c) throw err(404, 'הלקוח לא נמצא'); return c; });
r.get('/api/collectors', () => knownCollectors());

// ---- הלוואות, בקשות, חוזים, קבצים (מידע רגיש) ----
r.get('/api/loans', (req, res, { user }) => { need(can.finance(user)); return loansView(); });
r.get('/api/loan_requests', (req, res, { user }) => { need(can.finance(user)); return listDocs('loan_requests').map(x => ({ id: x.id, version: x.version, ...x.data })); });
r.get('/api/contracts', (req, res, { user }) => {
  need(can.sensitive(user), 'חוזים ותעודות זהות זמינים רק לבעלים ולמנהל');
  const files = db.prepare('SELECT id,name,mime,size,owner_id,field FROM files').all();
  return listDocs('contracts').map(x => ({ id: x.id, status: x.data.status, created: x.data.created, signedAt: x.data.signedAt, sentAt: x.data.sentAt, d: x.data.d, signer: x.data.signer, gs: x.data.gs, idc: x.data.idc, files: files.filter(f => f.owner_id === x.id) }));
});
r.get('/api/files/:id', (req, res, { user, params }) => {
  need(can.sensitive(user), 'קבצים רגישים זמינים רק לבעלים ולמנהל');
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(params.id); if (!f) throw err(404, 'הקובץ לא נמצא');
  logAudit({ user, action: 'צפייה בקובץ רגיש', item: f.name });
  res.writeHead(200, { 'Content-Type': f.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'Cache-Control': 'private, no-store', ...SECURITY_HEADERS });
  fs.createReadStream(path.join(DATA_DIR, f.path)).pipe(res);
});
r.get('/api/audit', (req, res, { user, q }) => { need(can.finance(user)); return db.prepare('SELECT id,at,user_name,action,col,doc_id,item,note FROM audit ORDER BY id DESC LIMIT ?').all(Math.min(+q.get('limit') || 200, 2000)); });

// ---- גיבוי, ייבוא ודוח התאמה ----
r.get('/api/backup', (req, res, { user }) => {
  need(user.role === 'owner', 'רק בעל התוכנה יכול להוריד גיבוי מלא');
  const cols = {}; for (const x of db.prepare('SELECT col,id,data,version FROM docs WHERE deleted=0').all()) (cols[x.col] ||= []).push({ id: x.id, data: JSON.parse(x.data), version: x.version });
  const files = db.prepare('SELECT * FROM files').all().map(f => ({ sourceId: f.source_id || f.id, source: f.source, owner: (f.owner_col || '') + '/' + (f.owner_id || ''), field: f.field, name: f.name, mime: f.mime, size: f.size, sha256: f.sha256, base64: fs.readFileSync(path.join(DATA_DIR, f.path)).toString('base64') }));
  const extra = { audit: db.prepare('SELECT * FROM audit').all(), wa_consent: db.prepare('SELECT * FROM wa_consent').all(), wa_batches: db.prepare('SELECT * FROM wa_batches').all(), wa_messages: db.prepare('SELECT * FROM wa_messages').all(), kv: db.prepare('SELECT * FROM kv').all() };
  logAudit({ user, action: 'הורדת גיבוי מלא' });
  const name = 'yoman-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  send(res, 200, JSON.stringify({ format: 'yoman-app-backup', formatVersion: 1, createdAt: new Date().toISOString(), collections: cols, files, extra }), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });
});
r.post('/api/backup/import', async (req, res, { user, raw, q }) => {
  need(can.restore(user), 'רק בעל התוכנה יכול לייבא גיבוי');
  return importBackup(raw.toString('utf8'), { user, dryRun: q.get('dry') === '1' });
});
r.get('/api/migration', (req, res, { user }) => {
  need(can.finance(user));
  const runs = db.prepare('SELECT id,at,file_sha256,by,report FROM import_runs ORDER BY at').all().map(x => ({ ...x, report: JSON.parse(x.report) }));
  return { runs, current: metrics(dbCols(), dbFiles()) };
});

// ---- משתמשים ----
r.get('/api/users', (req, res, { user }) => { need(can.users(user)); return db.prepare('SELECT * FROM users ORDER BY created_at').all().map(publicUser); });
r.post('/api/users', (req, res, { user, body }) => { need(can.users(user)); const u = createUser(body); logAudit({ user, action: 'יצירת משתמש', item: u.username, note: ROLES[u.role] }); return u; });
r.patch('/api/users/:id', (req, res, { user, params, body }) => {
  need(can.users(user));
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(params.id); if (!u) throw err(404, 'המשתמש לא נמצא');
  if (body.password) { if (String(body.password).length < 8) throw err(400, 'סיסמה של 8 תווים לפחות'); db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(hashPassword(body.password), u.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id); }
  if (body.disabled !== undefined) { if (u.id === user.id) throw err(400, 'אי אפשר לחסום את עצמך'); db.prepare('UPDATE users SET disabled=? WHERE id=?').run(body.disabled ? 1 : 0, u.id); if (body.disabled) db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id); }
  if (body.collector_name !== undefined) db.prepare('UPDATE users SET collector_name=? WHERE id=?').run(body.collector_name || null, u.id);
  if (body.role && ROLES[body.role] && u.id !== user.id) db.prepare('UPDATE users SET role=? WHERE id=?').run(body.role, u.id);
  logAudit({ user, action: 'עדכון משתמש', item: u.username });
  return publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id));
});

// ---- וואטסאפ ----
r.get('/api/wa/status', async (req, res, { user }) => { need(can.send(user)); return { ...(await wa.waStatus({ live: true })), requireOptIn: kvGet('wa_require_opt_in', true), maps: kvGet('wa_template_maps', {}), vars: wa.VARS }; });
r.post('/api/wa/settings', (req, res, { user, body }) => { need(can.waConfig(user)); if (body.requireOptIn !== undefined) { kvSet('wa_require_opt_in', !!body.requireOptIn); logAudit({ user, action: 'הגדרת חובת הסכמה', note: String(!!body.requireOptIn) }); } return { ok: true }; });
r.post('/api/wa/phone/register', async (req, res, { user, body }) => { need(can.waConfig(user)); const out = await wa.registerPhone(body.pin); logAudit({ user, action: 'רישום המספר העסקי בוואטסאפ' }); return out; });
r.post('/api/wa/webhooks/subscribe', async (req, res, { user }) => { need(can.waConfig(user)); const out = await wa.subscribeWebhooks(); logAudit({ user, action: 'רישום לדיווחי וואטסאפ', note: out.fields.join(',') }); return out; });
r.get('/api/wa/webhooks', async (req, res, { user }) => { need(can.send(user)); try { return await wa.webhookStatus(); } catch (e) { return { error: e.message }; } });
r.post('/api/wa/templates/sync', async (req, res, { user }) => { need(can.send(user)); return { count: await wa.syncTemplates() }; });
r.post('/api/wa/templates', async (req, res, { user, body }) => { need(can.waConfig(user)); return wa.submitTemplate({ ...body, user }); });
r.post('/api/wa/templates/map', (req, res, { user, body }) => { need(can.waConfig(user)); wa.setTemplateOrder(body.name, body.language, body.order || []); return { ok: true }; });
r.post('/api/wa/prepare', (req, res, { user, body }) => {
  need(can.send(user));
  const out = wa.buildRecipients({ items: resolvePhones(body.items), merge: body.merge !== false, phoneIndex: phoneNames() });
  const t = body.template ? db.prepare('SELECT * FROM wa_templates WHERE name=? AND language=?').get(body.template, body.language || 'he') : null;
  if (t) { const order = wa.templateOrder(t.name, t.language); out.recipients.forEach(x => { x.preview = wa.renderBody(t.body, order, x.vars); }); out.template = { ...t, order }; }
  return out;
});
function phoneNames() { const I = clientIndex(); return I.byPhone; }
// שורות בלי טלפון (חשבון בוקר / חשבון גובים): המספר נלקח מהיסטוריית הלקוח רק אם יש לו מספר אחד בלבד
function resolvePhones(items) {
  const I = clientIndex();
  return (items || []).slice(0, 2000).map(it => {
    if (String(it.phone || '').trim()) return it;
    const c = I.byName.get(normName(it.name));
    if (c && c.phones.size === 1) return { ...it, phone: [...c.phones][0], resolved: true };
    return { ...it, phone: '', reasonHint: c && c.phones.size > 1 ? 'ללקוח יש כמה מספרים בהיסטוריה' : '' };
  });
}
r.post('/api/wa/batches', (req, res, { user, body }) => {
  need(can.send(user));
  const prep = wa.buildRecipients({ items: resolvePhones(body.items), merge: body.merge !== false, phoneIndex: phoneNames() });
  const excluded = new Set(body.exclude || []);
  const recips = prep.recipients.filter(x => !x.optOut && !excluded.has(x.phone) && !x.needsOptIn);
  if (!recips.length) throw err(400, 'אין נמענים שאפשר לשלוח אליהם');
  return wa.createBatch({ batchId: body.batchId, template: body.template, language: body.language || 'he', recipients: recips, source: body.source, user });
});
r.get('/api/wa/batches', (req, res, { user }) => { need(can.send(user)); return db.prepare('SELECT id FROM wa_batches ORDER BY created_at DESC LIMIT 100').all().map(b => wa.batchSummary(b.id)); });
r.get('/api/wa/batches/:id', (req, res, { user, params }) => {
  need(can.send(user)); const b = wa.batchSummary(params.id); if (!b) throw err(404, 'המשלוח לא נמצא');
  b.messages = db.prepare('SELECT id,phone,client_name,preview,status,error_code,error_text,attempts,updated_at FROM wa_messages WHERE batch_id=? ORDER BY client_name').all(params.id);
  return b;
});
r.post('/api/wa/batches/:id/retry', (req, res, { user, params, body }) => { need(can.send(user)); return once(body.opId, user, () => ({ requeued: wa.retryFailed(params.id, user) })); });
r.get('/api/wa/consent', (req, res, { user }) => { need(can.send(user)); return db.prepare('SELECT * FROM wa_consent ORDER BY at DESC').all(); });
r.post('/api/wa/consent', (req, res, { user, body }) => {
  need(can.send(user));
  if (!['opt_in', 'opt_out'].includes(body.status)) throw err(400, 'סטטוס לא תקין');
  if (body.status === 'opt_in' && !String(body.source || '').trim()) throw err(400, 'כדי לתעד הסכמה צריך לכתוב איך התקבלה (למשל: אישר בעל-פה / בחוזה)');
  const phones = (body.phones || []).map(normPhone).filter(Boolean);
  for (const p of phones) wa.setConsent(p, body.status, body.source, body.note, user);
  return { count: phones.length };
});
r.post('/api/wa/phone-owner', (req, res, { user, body }) => {
  need(can.send(user)); const p = normPhone(body.phone); if (!p) throw err(400, 'מספר לא תקין');
  const m = kvGet('phone_owner_ok', {}); if (body.name) m[p] = normName(body.name); else delete m[p]; kvSet('phone_owner_ok', m);
  logAudit({ user, action: 'אישור שיוך מספר ללקוח', item: p, note: body.name || 'בוטל' }); return { ok: true };
});

// Webhook של Meta: אימות + דיווחי מסירה + בקשות הסרה
r.get('/webhooks/whatsapp', (req, res, { q }) => { const c = wa.verifyChallenge(q); if (c == null) return send(res, 403, 'forbidden'); send(res, 200, String(c)); });
r.post('/webhooks/whatsapp', (req, res, { raw }) => {
  if (!wa.verifySignature(raw, req.headers['x-hub-signature-256'])) return send(res, 401, 'bad signature');
  try { wa.handleWebhook(JSON.parse(raw.toString('utf8'))); } catch (e) { console.error('webhook', e); }
  send(res, 200, 'ok');
});

// עדכונים חיים: כשמכשיר אחד שומר, המכשירים האחרים מתעדכנים מיד
r.get('/api/events', (req, res, { user }) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const on = (e) => res.write('data: ' + JSON.stringify(e) + '\n\n');
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  bus.on('change', on); req.on('close', () => { bus.off('change', on); clearInterval(ping); });
});
r.get('/api/health', () => ({ ok: true, at: new Date().toISOString() }));

// ---- אוספים כלליים: יכולות נוספות שומרות מסמכים דרך כאן, עם הרשאה לכל אוסף ----
export const COLLECTIONS = {
  loans: { read: can.finance, write: can.finance }, loan_requests: { read: can.finance, write: can.finance },
  clients: { read: can.finance, write: can.finance }, contracts: { read: can.sensitive, write: can.sensitive },
  settings: { read: can.finance, write: can.finance },
};
const colRule = (col, mode, user) => { const c = COLLECTIONS[col]; if (!c) throw err(404, 'אוסף לא מוכר'); need(c[mode](user)); };
r.get('/api/docs/:col', (req, res, { user, params }) => { colRule(params.col, 'read', user); return listDocs(params.col).map(x => ({ id: x.id, _version: x.version, _updatedAt: x.updated_at, _updatedBy: x.updated_by, ...x.data })); });
r.get('/api/docs/:col/:id', (req, res, { user, params }) => { colRule(params.col, 'read', user); const d = getDoc(params.col, params.id); if (!d || d.deleted) throw err(404, 'לא נמצא'); return { id: d.id, _version: d.version, ...d.data }; });
r.put('/api/docs/:col/:id', (req, res, { user, params, body }) => { colRule(params.col, 'write', user); return once(body.opId, user, () => { const data = { ...body.data }; ['id', '_version', '_updatedAt', '_updatedBy'].forEach(k => delete data[k]); const out = putDoc(params.col, params.id, data, { user, baseVersion: body.baseVersion, note: body.note, action: body.action }); return { id: params.id, version: out.version }; }); });
r.post('/api/docs/:col', (req, res, { user, params, body }) => { colRule(params.col, 'write', user); return once(body.opId, user, () => { const id = body.id || newId(params.col[0].toUpperCase()); const data = { ...body.data }; delete data.id; const out = putDoc(params.col, id, data, { user }); return { id, version: out.version }; }); });
r.del('/api/docs/:col/:id', (req, res, { user, params }) => { colRule(params.col, 'write', user); need(user.role === 'owner', 'רק בעל התוכנה יכול למחוק'); deleteDoc(params.col, params.id, { user }); return { ok: true }; });

// ---- טעינת יכולות נוספות מהתיקייה server/features ----
export const featureCtx = { r, err, need, can, db, getDoc, listDocs, putDoc, deleteDoc, once, newId, now, logAudit, kvGet, kvSet, DATA_DIR, COLLECTIONS, wa, send, bus };
const FDIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'features');
if (fs.existsSync(FDIR)) for (const f of fs.readdirSync(FDIR).filter(f => f.endsWith('.js')).sort()) {
  const m = await import(path.join(FDIR, f)); if (m.register) await m.register(featureCtx);
}

// ---- שרת ----
const PUBLIC_API = new Set(['/api/login', '/api/health', '/webhooks/whatsapp']);
export const isPublic = (p) => PUBLIC_API.has(p) || p.startsWith('/api/public/');
export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/webhooks/')) {
      const m = r.match(req.method, url.pathname); if (!m) return send(res, 404, { error: 'לא נמצא' });
      const token = parseCookies(req).sid; const user = sessionUser(token);
      if (!user && !isPublic(url.pathname)) return send(res, 401, { error: 'צריך להתחבר' });
      if (req.method !== 'GET' && !url.pathname.startsWith('/webhooks/')) {
        // הגנה מ-CSRF: בקשות שינוי רק מאותו מקור
        const origin = req.headers.origin; if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'מקור לא מורשה' });
      }
      const raw = req.method === 'GET' ? Buffer.alloc(0) : await readBody(req);
      let body = {}; if (raw.length && !url.pathname.startsWith('/webhooks/') && url.pathname !== '/api/backup/import') { try { body = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, { error: 'בקשה לא תקינה' }); } }
      const out = await m.handler(req, res, { user, token, params: m.params, q: url.searchParams, body, raw });
      if (out !== undefined && !res.headersSent) send(res, 200, out);
      return;
    }
    if (serveStatic(req, res, ROOT, url.pathname)) return;
    serveStatic(req, res, ROOT, '/index.html') || send(res, 404, 'not found');
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : 'שגיאה בשרת. הפעולה לא נשמרה — אפשר לנסות שוב', current: e.current });
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // משתמש ראשון: נוצר מהגדרות הסביבה אם אין עדיין משתמשים
  if (!db.prepare('SELECT COUNT(*) n FROM users').get().n && process.env.OWNER_USERNAME && process.env.OWNER_PASSWORD) {
    createUser({ username: process.env.OWNER_USERNAME, name: process.env.OWNER_NAME || 'בעל התוכנה', role: 'owner', password: process.env.OWNER_PASSWORD });
    console.log('נוצר משתמש בעלים:', process.env.OWNER_USERNAME);
  }
  if (process.env.IMPORT_ON_START && fs.existsSync(process.env.IMPORT_ON_START)) {
    const rep = importBackup(fs.readFileSync(process.env.IMPORT_ON_START, 'utf8'), {});
    console.log('ייבוא בהפעלה:', JSON.stringify(Object.fromEntries(Object.entries(rep.cols).map(([k, v]) => [k, v.added + '+/' + v.same + '=']))), 'diffs:', rep.reconcile.diffs.length);
  }
  wa.recoverOnStart();
  server.listen(PORT, () => console.log(`יומן חשבון בוקר פועל על http://localhost:${PORT}`));
}
