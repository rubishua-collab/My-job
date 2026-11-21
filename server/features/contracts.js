// חוזים לחתימה (היתר עסקה / חוזה אחר / טופס הזמנה): ניהול לבעלים ולמנהל, ודף חתימה ציבורי ללקוח.
// הלקוח נכנס מקישור עם אסימון אקראי שאי אפשר לנחש (pt), ומאמת את עצמו במספר הטלפון ובקוד האימות (vcode) שבעל התוכנה שלח לו.
// הלקוח רואה רק את החוזה שלו. החתימה, צילומי ת.ז. וקובץ ה-PDF החתום נשמרים בטבלת הקבצים (owner_col='contracts').
// גיבוי ל-Google Drive: רק אם הוגדרה כתובת Apps Script (הגדרות או CONTRACTS_GAS_URL). אחרת הקבצים נשארים באפליקציה בלבד.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { clientIndex } from '../data.js';
import { fmtPhone } from '../../public/js/phone.js';

const STAT = ['draft', 'sent', 'signed'];
const MB = 1024 * 1024;
const LIM = { pdf: 12 * MB, id: 5 * MB, sig: 1 * MB, k: 150000, body: 250000 };

// ---- כלים (העתק של כלי התוכנה המקורית, שורות 7296-7310) ----
const sgNormPhone = s => String(s || '').replace(/\D/g, '').replace(/^(00)?972/, '').replace(/^0+/, '');
const shaHex = s => crypto.createHash('sha256').update(s).digest('hex');
const sgSha = s => shaHex(s).slice(0, 12); // 6 בתים ראשונים, כמו sgSha
function sgFingerprint(d) { // 7302
  if (d && d.kd === 'o') return sgSha(JSON.stringify(['o', d.nm || '', d.i || '', d.o || '', d.d || '', d.k || '', d.q || ''])).slice(0, 10).toUpperCase();
  return sgSha(JSON.stringify([d.i, d.o, d.d || '', d.a, d.c, d.p, d.t, d.r, d.l || '', d.k || '', d.q || '', JSON.stringify(d.f || {}), d.n || 1, d.mo || 0, d.fq || 'm'])).slice(0, 10).toUpperCase();
}
function sgRandId() { const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; return Array.from(crypto.randomBytes(16), x => ch[x % 62]).join('') + Date.now().toString(36); }
const sgRandCode = () => String(crypto.randomInt(100000, 1000000));
const newToken = () => crypto.randomBytes(24).toString('base64url');
const sgNm = d => String((d && d.nm) || '').trim();
const sgTitle = d => sgNm(d) || (d && d.kd === 'o' ? 'חוזה' : 'היתר עסקה');
const safeName = s => String(s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'לקוח';
const fileBase = d => String(sgTitle(d)).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'חוזה';
const sameStr = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function sniff(u) {
  if (u.length < 12) return '';
  if (u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) return 'application/pdf';
  if (u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) return 'image/jpeg';
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4E && u[3] === 0x47) return 'image/png';
  if (u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45) return 'image/webp';
  return '';
}
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// הגבלת קצב פשוטה בזיכרון
function limiter(max, windowMs) {
  const m = new Map();
  return {
    hit(k) { const t = Date.now(); let a = m.get(k); if (!a || t - a.t > windowMs) { a = { n: 0, t }; m.set(k, a); } a.n++; if (m.size > 20000) m.clear(); return a.n <= max; },
    over(k) { const a = m.get(k); return !!a && Date.now() - a.t <= windowMs && a.n >= max; },
    reset(k) { m.delete(k); },
  };
}

export async function register(ctx) {
  const { r, err, need, can, db, getDoc, listDocs, putDoc, deleteDoc, once, newId, now, logAudit, kvGet, kvSet, DATA_DIR } = ctx;
  const sens = u => need(can.sensitive(u), 'חוזים ותעודות זהות זמינים רק לבעלים ולמנהל');
  const ipOf = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  const baseUrl = req => (process.env.PUBLIC_URL || '').replace(/\/$/, '') || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  const linkOf = (req, data) => data && data.pt ? baseUrl(req) + '/sign.html#' + data.pt : '';
  const CLIENT = { name: 'הלקוח (דף החתימה)' };

  // ---- קבצים ----
  function parseData(du, allow, max, what) {
    const m = /^data:([\w/+.-]+)(;base64)?,(.*)$/s.exec(String(du || ''));
    if (!m || !m[2]) throw err(400, 'קובץ לא תקין: ' + what);
    const buf = Buffer.from(m[3], 'base64');
    if (!buf.length) throw err(400, 'קובץ ריק: ' + what);
    if (buf.length > max) throw err(413, `${what} גדול מדי (מקסימום ${Math.round(max / MB)}MB)`);
    const mime = sniff(buf);
    if (!allow.includes(mime)) throw err(400, 'סוג קובץ לא נתמך: ' + what);
    return { buf, mime };
  }
  function storeFile(cid, field, { buf, mime }, name) {
    const id = newId('f_'); const rel = path.join('files', id + '.' + (EXT[mime] || 'bin'));
    fs.writeFileSync(path.join(DATA_DIR, rel), buf);
    db.prepare('INSERT INTO files(id,sha256,name,mime,size,owner_col,owner_id,field,source,source_id,path,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, crypto.createHash('sha256').update(buf).digest('hex'), name, mime, buf.length, 'contracts', cid, field, 'sign', null, rel, now());
    return id;
  }
  const filesOf = cid => db.prepare("SELECT id,name,mime,size,field,source,created_at FROM files WHERE owner_col='contracts' AND owner_id=? ORDER BY created_at").all(cid);
  function dropFiles(cid) {
    for (const f of db.prepare("SELECT id,path FROM files WHERE owner_col='contracts' AND owner_id=?").all(cid)) {
      try { fs.unlinkSync(path.join(DATA_DIR, f.path)); } catch { /* */ }
      db.prepare('DELETE FROM files WHERE id=?').run(f.id);
    }
  }
  const latest = (cid, field) => db.prepare("SELECT * FROM files WHERE owner_col='contracts' AND owner_id=? AND field=? ORDER BY created_at DESC LIMIT 1").get(cid, field);

  // ---- אימות נתוני חוזה שנשלחים מהטופס ----
  const str = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
  function cleanD(x) {
    if (!x || typeof x !== 'object') throw err(400, 'חסרים פרטי החוזה');
    const d = {}; const oth = x.kd === 'o';
    if (oth) d.kd = 'o';
    d.nm = str(x.nm, 120); d.i = str(x.i, 120); d.o = str(x.o, 120); d.d = str(x.d, 20); d.q = str(x.q, 30); d.w = str(x.w, 30);
    d.k = String(x.k == null ? '' : x.k).slice(0, LIM.k); d.t = /^\d{4}-\d{2}-\d{2}$/.test(x.t) ? x.t : new Date().toISOString().slice(0, 10); d.m = 'req';
    if (!oth) {
      const num = v => (v === null || v === '' || v === undefined || !isFinite(+v)) ? NaN : +v;
      d.a = num(x.a); d.c = ['₪', '$', '€'].includes(x.c) ? x.c : '₪'; d.p = num(x.p);
      d.r = /^\d{4}-\d{2}-\d{2}$/.test(x.r) ? x.r : ''; d.l = str(x.l, 120);
      d.f = {}; if (x.f && typeof x.f === 'object') for (const [k, v] of Object.entries(x.f).slice(0, 60)) d.f[str(k, 60)] = str(v, 500);
      d.mo = num(x.mo); d.fq = x.fq === 'w' ? 'w' : 'm'; d.n = Math.min(120, Math.max(1, parseInt(x.n, 10) || 1));
    }
    if (!d.nm) throw err(400, 'חסר שם לחוזה.');
    if (!d.o) throw err(400, 'חסר שם הלקוח.');
    if (sgNormPhone(d.q).length < 8) throw err(400, 'חסר מספר וואטסאפ של הלקוח. בלעדיו אי אפשר לאמת את החותם.');
    if (!d.k.trim()) throw err(400, 'נוסח החוזה ריק.');
    if (!oth) {
      if (!d.i) throw err(400, 'חסר שם המשקיע.');
      if (!(d.a > 0)) throw err(400, 'הסכום חייב להיות מספר גדול מאפס.');
      if (!d.r) throw err(400, 'חסר מועד פירעון.');
    }
    // JSON לא שומר NaN: נשמר כמו במקור (null)
    return JSON.parse(JSON.stringify(d));
  }
  function cleanIdc(c) {
    if (!c || typeof c !== 'object') return null;
    return { firstName: str(c.firstName, 60), lastName: str(c.lastName, 60), idNumber: str(c.idNumber, 9).replace(/\D/g, ''), birthDate: str(c.birthDate, 20), address: str(c.address, 200) };
  }
  const getC = id => { const x = getDoc('contracts', id); if (!x || x.deleted) throw err(404, 'החוזה לא נמצא'); return x; };
  const view = (req, x) => ({ id: x.id, _version: x.version, ...x.data, link: linkOf(req, x.data), files: filesOf(x.id) });

  // ---- בעלים ומנהל ----
  r.get('/api/sign/list', (req, res, { user }) => { sens(user); return { items: listDocs('contracts').filter(x => x.data && x.data.d).map(x => view(req, x)), base: baseUrl(req), drive: !!gasCfg().url }; });
  r.get('/api/sign/item/:id', (req, res, { user, params }) => { sens(user); return view(req, getC(params.id)); });

  r.post('/api/sign/save', (req, res, { user, body }) => {
    sens(user);
    return once(body.opId, user, () => {
      const d = cleanD(body.d);
      let id = body.id ? String(body.id) : '';
      // חוזה חדש: המזהה, האסימון וקוד האימות נוצרים בדפדפן (כמו במקור), כדי שכפתור הוואטסאפ יהיה מוכן לפני הלחיצה
      const ex = id ? getDoc('contracts', id) : null;
      if (id && body.isNew && !ex) { if (!/^[A-Za-z0-9]{16,40}$/.test(id)) throw err(400, 'מזהה חוזה לא תקין'); }
      else if (id && body.isNew && ex) throw err(409, 'חוזה עם המזהה הזה כבר קיים');
      const cur = id && !body.isNew ? getC(id) : null;
      if (!id) id = sgRandId();
      const old = cur ? cur.data : {};
      if (old.d && (old.d.kd === 'o') !== (d.kd === 'o')) throw err(400, 'סוג החוזה נקבע כשהחוזה נשמר.');
      const ptOk = p => /^[A-Za-z0-9_-]{32}$/.test(String(p || '')) && !listDocs('contracts').some(z => z.data && z.data.pt === p);
      const vcode = old.vcode || (/^\d{6}$/.test(String(body.vcode || '')) ? String(body.vcode) : sgRandCode());
      const pt = old.pt || (ptOk(body.pt) ? body.pt : newToken());
      d.vh = sgSha(vcode + '|iska');
      const t = new Date().toISOString(), send = !!body.send;
      const data = { ...old, d, lv: 2, vcode, pt,
        status: send ? (old.status === 'signed' ? 'signed' : 'sent') : (old.status || 'draft'),
        created: old.created || t, updated: t, sentAt: send ? t : (old.sentAt || ''), signedAt: old.signedAt || '', pdfId: old.pdfId || '' };
      if (body.idc !== undefined) { const c = cleanIdc(body.idc); if (c) data.idc = c; else delete data.idc; }
      if (body.fill !== undefined) { if (body.fill && typeof body.fill === 'object' && JSON.stringify(body.fill).length < LIM.body) data.fill = body.fill; else delete data.fill; }
      if (JSON.stringify(data).length > LIM.k + LIM.body) throw err(413, 'החוזה ארוך מדי לשמירה. קצר את הטקסט.');
      const out = putDoc('contracts', id, data, { user, baseVersion: cur ? body.baseVersion : undefined, action: 'עדכון חוזה', item: d.nm });
      return { id, version: out.version, link: linkOf(req, data), vcode, pt };
    });
  });

  // קישור חתימה לחוזה ישן (שנשלח מהתוכנה המקורית דרך Google): נוצר אסימון חדש. regen=1 מבטל את הקישור הקודם וקוד האימות
  r.post('/api/sign/:id/link', (req, res, { user, params, body }) => {
    sens(user);
    const x = getC(params.id); const data = { ...x.data };
    if (data.pt && !body.regen) return { link: linkOf(req, data), vcode: data.vcode };
    data.pt = newToken(); if (!data.vcode || body.regen) data.vcode = sgRandCode();
    data.d = { ...data.d, vh: sgSha(data.vcode + '|iska') }; data.lv = 2;
    putDoc('contracts', x.id, data, { user, action: body.regen ? 'קישור חתימה חדש (הקודם בוטל)' : 'יצירת קישור חתימה', item: data.d.nm || data.d.o });
    return { link: linkOf(req, data), vcode: data.vcode };
  });

  r.post('/api/sign/:id/status', (req, res, { user, params, body }) => {
    sens(user);
    const x = getC(params.id); const st = body.status; if (!STAT.includes(st)) throw err(400, 'סטטוס לא תקין');
    const data = { ...x.data }, t = new Date().toISOString();
    // כמו sgOnListChange (שורה 8794)
    data.status = st;
    if (st === 'sent' && !data.sentAt) data.sentAt = t;
    if (st === 'signed' && !data.signedAt) data.signedAt = t;
    if (st !== 'signed' && data.signedAt && !data.pdfId && !data.signer) data.signedAt = '';
    const out = putDoc('contracts', x.id, data, { user, action: 'שינוי סטטוס חוזה', item: data.d?.nm || data.d?.o, note: st });
    return { ok: true, version: out.version };
  });
  // לחיצה על ״שליחה בוואטסאפ״: חוזה שעוד לא נשלח מסומן ״נשלח״ (כמו act==='sent' בשורה 8773)
  r.post('/api/sign/:id/sent', (req, res, { user, params }) => {
    sens(user);
    const x = getC(params.id); if (x.data.status && x.data.status !== 'draft') return { ok: true };
    const data = { ...x.data, status: 'sent', sentAt: new Date().toISOString() };
    putDoc('contracts', x.id, data, { user, action: 'סימון נשלח', item: data.d?.nm || data.d?.o });
    return { ok: true };
  });
  r.del('/api/sign/:id', (req, res, { user, params }) => {
    sens(user); need(user.role === 'owner', 'רק בעל התוכנה יכול למחוק חוזים');
    const x = getC(params.id);
    const n = db.prepare("SELECT COUNT(*) n FROM files WHERE owner_col='contracts' AND owner_id=?").get(x.id).n;
    dropFiles(x.id); // מחיקה לצמיתות של צילומי ת.ז., החתימה וה-PDF, כמו במקור (שורה 8784)
    deleteDoc('contracts', x.id, { user, note: `נמחקו גם ${n} קבצים` });
    return { ok: true };
  });

  // צילום ת״ז שבעל התוכנה סרק (idImgs, כמו fxAttach בשורה 8315)
  r.post('/api/sign/:id/idimg', (req, res, { user, params, body }) => {
    sens(user);
    return once(body.opId, user, () => {
      const x = getC(params.id); const side = body.side === 'back' ? 'back' : 'front';
      const f = parseData(body.image, ['image/jpeg', 'image/png', 'image/webp'], LIM.id, 'צילום ת״ז');
      const list = Array.isArray(x.data.idImgs) ? x.data.idImgs.slice() : [];
      const nm = safeName(x.data.d?.o);
      const fid = storeFile(x.id, 'idImgs[' + list.length + ']', f, 'תעודת זהות - ' + nm + (side === 'back' ? ' - ספח' : '') + '.' + EXT[f.mime]);
      list.push({ fileId: fid, side, at: now() });
      const out = putDoc('contracts', x.id, { ...x.data, idImgs: list }, { user, action: 'צילום ת״ז נשמר', item: nm });
      return { fileId: fid, version: out.version };
    });
  });

  // קבלת חוזה חתום מקובץ PDF שהלקוח שלח (sgReceive, שורה 9190). פרטי החתימה נקראים מהקובץ בדפדפן
  r.post('/api/sign/:id/receive', (req, res, { user, params, body }) => {
    sens(user); need(user.role === 'owner', 'רק בעל התוכנה יכול לקבל חוזים חתומים.');
    return once(body.opId, user, () => {
      const x = getC(params.id); const s = body.signer || {};
      const pdf = parseData(body.pdf, ['application/pdf'], LIM.pdf, 'PDF');
      const nm = safeName(s.name || x.data.d?.o);
      const pdfId = storeFile(x.id, 'pdf', pdf, fileBase(x.data.d) + ' חתום - ' + nm + '.pdf');
      if (body.sig) storeFile(x.id, 'sig', parseData(body.sig, ['image/png', 'image/jpeg'], LIM.sig, 'חתימה'), 'חתימה - ' + nm + '.png');
      (Array.isArray(body.ids) ? body.ids : []).slice(0, 2).forEach((du, i) => { const f = parseData(du, ['image/jpeg', 'image/png', 'image/webp'], LIM.id, 'צילום ת״ז'); storeFile(x.id, 'id' + (i + 1), f, (i ? 'תעודת זהות צד אחורי - ' : 'תעודת זהות - ') + nm + '.' + EXT[f.mime]); });
      const signer = { name: str(s.name, 120), id: str(s.id, 12), phone: str(s.phone, 30), when: str(s.when, 40), tz: str(s.tz, 64), fp: str(s.fp, 20) };
      const data = { ...x.data, status: 'signed', signedAt: signer.when || new Date().toISOString(), signer, sd: str(body.sd, LIM.k + 5000), recvAt: new Date().toISOString(), pdfId };
      putDoc('contracts', x.id, data, { user, action: 'קבלת חוזה חתום מקובץ', item: x.data.d?.nm || x.data.d?.o });
      setImmediate(() => driveBackup(x.id).catch(() => {}));
      return { ok: true };
    });
  });

  // בחירת לקוח מהתוכנה: פיצול, איסוף, הלוואות, חוזים ומאגר לקוחות (sgClients, שורה 7718). הטלפון האחרון שנרשם
  const SRC = { split: 'פיצול', work: 'איסוף יומי', loan: 'הלוואות', loan_request: 'בקשות', contract: 'חוזים', client: 'מאגר לקוחות', morning: 'חשבון בוקר', collectors: 'חשבון גובים' };
  r.get('/api/sign/clients', (req, res, { user }) => {
    sens(user);
    const m = new Map();
    for (const x of clientIndex().rows) {
      if (!x.nk || x.exp) continue;
      const ph = x.phone ? fmtPhone(x.phone) : ''; const day = String(x.date || '');
      const c = m.get(x.nk);
      if (!c) { m.set(x.nk, { n: String(x.n).trim(), ph, src: SRC[x.kind] || '', day }); continue; }
      if (ph && (!c.ph || day >= c.day)) { c.ph = ph; c.day = day; c.src = SRC[x.kind] || c.src; c.n = String(x.n).trim(); }
    }
    return [...m.values()];
  });

  // ---- הגדרות: כתובת ציבורית וגיבוי ל-Google Drive ----
  function gasCfg() {
    const k = kvGet('contracts_gas', {}) || {};
    return { url: process.env.CONTRACTS_GAS_URL || k.url || '', secret: process.env.CONTRACTS_GAS_SECRET || k.secret || '', fromEnv: !!process.env.CONTRACTS_GAS_URL };
  }
  r.get('/api/sign/settings', (req, res, { user }) => {
    sens(user); const c = gasCfg();
    return { publicUrl: process.env.PUBLIC_URL || '', base: baseUrl(req), gasUrl: c.url, hasSecret: !!c.secret, fromEnv: c.fromEnv, owner: user.role === 'owner' };
  });
  r.put('/api/sign/settings', (req, res, { user, body }) => {
    sens(user); need(user.role === 'owner', 'רק בעל התוכנה משנה את ההגדרה הזו');
    const url = String(body.gasUrl || '').trim();
    if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) throw err(400, 'הכתובת צריכה להיות כתובת Apps Script: https://script.google.com/macros/s/…/exec');
    const cur = kvGet('contracts_gas', {}) || {};
    kvSet('contracts_gas', { url, secret: body.gasSecret !== undefined ? String(body.gasSecret || '').slice(0, 200) : (cur.secret || '') });
    logAudit({ user, action: 'הגדרת גיבוי חוזים ל-Google Drive', note: url ? 'הוגדר' : 'בוטל' });
    return { ok: true };
  });
  r.post('/api/sign/:id/drive', async (req, res, { user, params }) => {
    sens(user); getC(params.id);
    if (!gasCfg().url) throw err(400, 'לא הוגדרה כתובת Apps Script לגיבוי. הקבצים שמורים באפליקציה.');
    return await driveBackup(params.id);
  });

  // שליחת הקבצים החתומים ל-Apps Script. פרוטוקול: POST JSON {action:'upload', secret, contractId, field, name, mimeType, base64} → {ok, url|id}
  const driveBusy = new Set();
  async function driveBackup(id) {
    const cfg = gasCfg(); if (!cfg.url || driveBusy.has(id)) return { ok: false, skipped: true };
    driveBusy.add(id);
    try {
      const x0 = getDoc('contracts', id); if (!x0 || x0.deleted) return { ok: false };
      const gs = { ...(x0.data.gs || {}) }; let errs = [];
      for (const field of ['pdf', 'sig', 'id1', 'id2']) {
        const f = latest(id, field); if (!f) continue;
        if (gs[field] && gs[field + 'F'] === f.id) continue;
        try {
          const payload = JSON.stringify({ action: 'upload', secret: cfg.secret, contractId: id, field, name: f.name, mimeType: f.mime, base64: fs.readFileSync(path.join(DATA_DIR, f.path)).toString('base64') });
          const rr = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload, redirect: 'follow', signal: AbortSignal.timeout(90000) });
          const j = await rr.json().catch(() => null);
          const url = j && j.ok ? (j.url || (j.id ? `https://drive.google.com/file/d/${j.id}/view` : '')) : '';
          if (!/^https:\/\/(drive|docs)\.google\.com\//.test(url)) throw new Error((j && j.error) || ('תשובה לא צפויה ' + rr.status));
          gs[field] = url; gs[field + 'F'] = f.id;
        } catch (e) { errs.push(field + ': ' + String(e.message || e).slice(0, 120)); }
      }
      gs.at = new Date().toISOString();
      const x = getDoc('contracts', id); if (!x || x.deleted) return { ok: false };
      const data = { ...x.data, gs }; if (errs.length) data.gsErr = errs.join(' · '); else delete data.gsErr;
      putDoc('contracts', id, data, { user: { name: 'גיבוי Google Drive' }, action: 'גיבוי ל-Google Drive', note: errs.length ? errs.join(' · ') : 'הצליח' });
      return { ok: !errs.length, errors: errs, gs };
    } finally { driveBusy.delete(id); }
  }

  // ---- דף החתימה הציבורי (בלי כניסה) ----
  const ipGet = limiter(200, 10 * 60e3), ipBad = limiter(40, 30 * 60e3), tokBad = limiter(8, 30 * 60e3), tokSubmit = limiter(6, 60 * 60e3);
  function byToken(req, token) {
    if (!ipGet.hit(ipOf(req))) throw err(429, 'יותר מדי בקשות. נסו שוב בעוד כמה דקות.');
    const t = String(token || '');
    if (!/^[A-Za-z0-9_-]{24,64}$/.test(t)) throw err(404, 'הקישור לא תקין או שבוטל. בקשו קישור חדש ממי ששלח לכם את המסמך.');
    const h = shaHex(t);
    const x = listDocs('contracts').find(z => z.data && z.data.pt && z.data.d && sameStr(shaHex(z.data.pt), h));
    if (!x) throw err(404, 'הקישור לא תקין או שבוטל. בקשו קישור חדש ממי ששלח לכם את המסמך.');
    return x;
  }
  // אימות: מספר הטלפון שאליו נשלח המסמך + קוד האימות. ניסיונות שגויים ננעלים
  function verify(req, x, phone, code) {
    const ip = ipOf(req), tk = x.id;
    if (tokBad.over(tk) || ipBad.over(ip)) throw err(429, 'יותר מדי ניסיונות שגויים. נסו שוב בעוד חצי שעה.');
    const typed = sgNormPhone(phone), want = sgNormPhone(x.data.d.q);
    const okPhone = typed.length >= 8 && (!want || typed === want);
    const okCode = /^\d{6}$/.test(String(code || '')) && sameStr(String(code), String(x.data.vcode || ''));
    if (!okPhone || !okCode) {
      tokBad.hit(tk); ipBad.hit(ip);
      throw err(403, !okPhone ? 'המספר לא תואם למספר שאליו נשלח המסמך.' : 'קוד האימות שגוי.');
    }
    tokBad.reset(tk);
  }
  const pubD = d => { const o = JSON.parse(JSON.stringify(d || {})); delete o.m; delete o.vh; return o; };

  r.get('/api/public/sign/:token', (req, res, { params }) => {
    const x = byToken(req, params.token); const d = x.data.d;
    return { title: sgTitle(d), kind: d.kd === 'o' ? 'o' : 'h', sender: d.i || '', signed: x.data.status === 'signed' };
  });
  r.post('/api/public/sign/:token/open', (req, res, { params, body }) => {
    const x = byToken(req, params.token); verify(req, x, body.phone, body.code);
    return { c: x.id, d: pubD(x.data.d), fp: sgFingerprint(x.data.d), signed: x.data.status === 'signed', signedAt: x.data.status === 'signed' ? x.data.signedAt : '' };
  });
  r.post('/api/public/sign/:token/submit', (req, res, { params, body }) => {
    const x = byToken(req, params.token); verify(req, x, body.phone, body.code);
    if (!tokSubmit.hit(x.id)) throw err(429, 'יותר מדי ניסיונות שליחה. נסו שוב מאוחר יותר.');
    if (x.data.status === 'signed') throw err(409, 'המסמך כבר נחתם. אם צריך לחתום שוב, בקשו קישור חדש.');
    const name = str(body.name, 120), idn = String(body.id || '').replace(/\D/g, '');
    if (name.length < 2) throw err(400, 'חסר שם מלא.');
    if (idn.length < 5 || idn.length > 9) throw err(400, 'מספר ת.ז. לא תקין.');
    if (body.agree !== true) throw err(400, 'חסר אישור הקריאה.');
    const sig = parseData(body.sig, ['image/png'], LIM.sig, 'החתימה');
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter(Boolean).slice(0, 2).map((du, i) => parseData(du, ['image/jpeg', 'image/png', 'image/webp'], LIM.id, i ? 'צילום הספח' : 'צילום ת.ז.'));
    if (!ids.length) throw err(400, 'חסר צילום ת.ז.');
    const pdf = parseData(body.pdf, ['application/pdf'], LIM.pdf, 'המסמך החתום');
    const d = x.data.d, nm = safeName(name), fp = sgFingerprint(d);
    // זמן החתימה: מהמכשיר של הלקוח (כפי שמופיע ב-PDF), רק אם הוא קרוב לשעון השרת
    const cw = Date.parse(body.when); const when = isFinite(cw) && Math.abs(cw - now()) < 15 * 60e3 ? new Date(cw).toISOString() : new Date().toISOString();
    const tz = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(String(body.tz || '')) ? String(body.tz) : '';
    const pdfId = storeFile(x.id, 'pdf', pdf, fileBase(d) + ' חתום - ' + nm + '.pdf');
    storeFile(x.id, 'sig', sig, 'חתימה - ' + nm + '.png');
    ids.forEach((f, i) => storeFile(x.id, 'id' + (i + 1), f, (i ? 'תעודת זהות צד אחורי - ' : 'תעודת זהות - ') + nm + '.' + EXT[f.mime]));
    const signer = { name, id: idn, phone: str(body.phone, 30), when, tz, fp };
    const sent = { ...d }; delete sent.m;
    const data = { ...x.data, status: 'signed', signedAt: when, signer, sd: JSON.stringify(sent), recvAt: new Date().toISOString(), pdfId, ua: str(req.headers['user-agent'], 200), ip: ipOf(req) };
    putDoc('contracts', x.id, data, { user: CLIENT, action: 'חתימת לקוח בדף החתימה', item: d.nm || d.o, note: name + ' · ' + signer.phone });
    setImmediate(() => driveBackup(x.id).catch(() => {}));
    return { ok: true, fp, when };
  });
}
