// WhatsApp Business Platform (Cloud API) — שליחה מצד השרת, תבניות מאושרות, הסכמה/הסרה, סטטוס מסירה לפי Webhook
import crypto from 'node:crypto';
import { db, now, newId, kvGet, kvSet, logAudit, bus } from './db.js';
import { normPhone, phoneProblem, normName } from '../public/js/phone.js';

const cfg = () => ({
  graph: (process.env.WA_GRAPH_URL || 'https://graph.facebook.com/v21.0').replace(/\/$/, ''),
  token: process.env.WA_TOKEN || '',
  phoneId: process.env.WA_PHONE_NUMBER_ID || '',
  wabaId: process.env.WA_BUSINESS_ACCOUNT_ID || '',
  appSecret: process.env.WA_APP_SECRET || '',
  verifyToken: process.env.WA_VERIFY_TOKEN || '',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  rate: Math.max(1, +process.env.WA_RATE_PER_SEC || 10),
});

// מה חסר כדי להפעיל שליחה אמיתית — מוצג במסך ״חיבור וואטסאפ״
export async function waStatus({ live = true } = {}) {
  const c = cfg();
  const items = [
    { key: 'WA_TOKEN', ok: !!c.token, label: 'אסימון גישה קבוע (System User Token) עם הרשאות whatsapp_business_messaging ו-whatsapp_business_management' },
    { key: 'WA_PHONE_NUMBER_ID', ok: !!c.phoneId, label: 'מזהה מספר הטלפון (Phone number ID) של המספר העסקי' },
    { key: 'WA_BUSINESS_ACCOUNT_ID', ok: !!c.wabaId, label: 'מזהה החשבון העסקי בוואטסאפ (WhatsApp Business Account ID)' },
    { key: 'WA_APP_SECRET', ok: !!c.appSecret, label: 'App Secret של אפליקציית Meta — לאימות דיווחי המסירה' },
    { key: 'WA_VERIFY_TOKEN', ok: !!c.verifyToken, label: 'סיסמת אימות ל-Webhook (מחרוזת שתבחר ותזין גם ב-Meta)' },
    { key: 'PUBLIC_URL', ok: !!c.publicUrl, label: 'כתובת ציבורית של האפליקציה (https) — כדי ש-Meta תוכל לדווח על מסירה' },
  ];
  // תבניות מסונכרנות אוטומטית מ-Meta אם עוד לא סונכרנו בעשר הדקות האחרונות
  if (c.token && c.wabaId) {
    const last = db.prepare('SELECT MAX(synced_at) t FROM wa_templates').get().t || 0;
    if (now() - last > 10 * 60e3) { try { await syncTemplates(); } catch { /* מוצג בבדיקת החיבור */ } }
  }
  const out = { configured: items.every(i => i.ok), items, webhookUrl: c.publicUrl ? c.publicUrl + '/webhooks/whatsapp' : '', lastWebhookAt: kvGet('wa_last_webhook', null), phone: null, error: null,
    templates: db.prepare('SELECT name,language,status,category,body,synced_at FROM wa_templates ORDER BY name').all() };
  if (live && c.token && c.phoneId) {
    try {
      const r = await graph('GET', `/${c.phoneId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status,messaging_limit_tier`);
      out.phone = r;
    } catch (e) { out.error = 'בדיקת החיבור מול Meta נכשלה: ' + e.message; }
  }
  return out;
}

async function graph(method, path, body) {
  const c = cfg();
  const r = await fetch(c.graph + path, {
    method, headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  let j = null; try { j = await r.json(); } catch { /* */ }
  if (!r.ok || (j && j.error)) {
    const err = (j && j.error) || {};
    const e = new Error(heError(err.code, err.message || ('HTTP ' + r.status)));
    e.code = String(err.code || r.status); e.http = r.status; e.raw = err; throw e;
  }
  return j;
}

const ERR = {
  131030: 'המספר לא נמצא ברשימת הנמענים המאושרים של מספר הבדיקה — הוסף אותו ב-Meta (Step 1 ← Recipient ← Manage phone number list)',
  131026: 'ההודעה לא נמסרה — המספר אינו בוואטסאפ או שלא ניתן למסור אליו',
  131047: 'עברו יותר מ-24 שעות מההודעה האחרונה של הלקוח — חובה לשלוח בתבנית מאושרת',
  131050: 'הלקוח ביקש לא לקבל הודעות שיווקיות מהעסק',
  131051: 'סוג הודעה לא נתמך',
  131056: 'יותר מדי הודעות לאותו מספר בזמן קצר — ננסה שוב',
  130429: 'הגעת למגבלת קצב השליחה — ננסה שוב',
  131049: 'Meta לא מסרה את ההודעה כדי לשמור על חוויית המשתמש (מגבלת הודעות שיווק)',
  132000: 'מספר המשתנים לא תואם לתבנית המאושרת',
  132001: 'התבנית לא קיימת או לא מאושרת בשפה הזו',
  132005: 'הטקסט אחרי מילוי המשתנים ארוך מדי',
  132012: 'פורמט משתנה לא תקין (אין להכניס שורות חדשות או טאבים למשתנה)',
  132015: 'התבנית מושהית בגלל איכות נמוכה',
  132016: 'התבנית בוטלה',
  133010: 'המספר העסקי לא רשום בפלטפורמה',
  190: 'אסימון הגישה פג תוקף או לא תקין',
  100: 'פרמטר לא תקין בבקשה',
  10: 'אין הרשאה לפעולה — בדוק את הרשאות האסימון',
  368: 'החשבון חסום זמנית על ידי Meta',
};
export const heError = (code, msg) => (ERR[code] ? ERR[code] + ` (קוד ${code})` : (msg || 'שגיאה לא ידועה'));
const RETRYABLE = new Set(['130429', '131056', '131000', '500', '502', '503', '504', 'timeout']);

// ---- תבניות ----
export async function syncTemplates() {
  const c = cfg(); if (!c.token || !c.wabaId) throw Object.assign(new Error('חסר חיבור לחשבון העסקי'), { status: 400 });
  let url = `/${c.wabaId}/message_templates?fields=name,language,status,category,components&limit=100`; const all = [];
  for (let i = 0; i < 20 && url; i++) {
    const j = await graph('GET', url); all.push(...(j.data || []));
    url = j.paging && j.paging.next ? j.paging.next.replace(cfg().graph, '') : '';
  }
  db.exec('DELETE FROM wa_templates');
  const ins = db.prepare('INSERT OR REPLACE INTO wa_templates(name,language,status,category,body,components,synced_at) VALUES(?,?,?,?,?,?,?)');
  for (const t of all) {
    const body = (t.components || []).find(x => x.type === 'BODY');
    ins.run(t.name, t.language, t.status, t.category, body ? body.text : '', JSON.stringify(t.components || []), now());
  }
  return all.length;
}

// רישום המספר העסקי בפלטפורמה (פותר שגיאה 133010). ה-PIN הוא קוד אימות דו-שלבי בן 6 ספרות שבעל העסק בוחר
export async function registerPhone(pin) {
  const c = cfg();
  if (!c.token || !c.phoneId) throw Object.assign(new Error('חסר חיבור לחשבון העסקי'), { status: 400 });
  if (!/^\d{6}$/.test(String(pin || ''))) throw Object.assign(new Error('קוד ה-PIN צריך להיות בדיוק 6 ספרות'), { status: 400 });
  await graph('POST', `/${c.phoneId}/register`, { messaging_product: 'whatsapp', pin: String(pin) });
  return { ok: true };
}

// רישום אוטומטי לדיווחי וואטסאפ (messages = סטטוס מסירה והודעות נכנסות כמו ״הסר״), במקום לחפש את המסך ב-Meta
export async function subscribeWebhooks() {
  const c = cfg();
  if (!c.token || !c.wabaId || !c.appSecret || !c.verifyToken || !c.publicUrl) throw Object.assign(new Error('חסרים פרטי חיבור — השלם קודם את כל השורות במסך החיבור'), { status: 400 });
  const app = await graph('GET', '/app?fields=id,name');
  const appToken = app.id + '|' + c.appSecret;
  const body = new URLSearchParams({ object: 'whatsapp_business_account', callback_url: c.publicUrl + '/webhooks/whatsapp', verify_token: c.verifyToken, fields: 'messages', include_values: 'true', access_token: appToken });
  const r1 = await fetch(`${c.graph}/${app.id}/subscriptions`, { method: 'POST', body, signal: AbortSignal.timeout(30000) });
  const j1 = await r1.json().catch(() => ({}));
  if (!r1.ok || j1.error) throw Object.assign(new Error('הרישום לדיווחים נכשל: ' + heError(j1.error?.code, j1.error?.message || ('HTTP ' + r1.status))), { status: 502 });
  // מחבר את האפליקציה לחשבון הוואטסאפ העסקי, כדי שהדיווחים של החשבון יגיעו אליה
  await graph('POST', `/${c.wabaId}/subscribed_apps`);
  return webhookStatus(app);
}
export async function webhookStatus(app) {
  const c = cfg();
  app = app || await graph('GET', '/app?fields=id,name');
  const r = await fetch(`${c.graph}/${app.id}/subscriptions?access_token=${encodeURIComponent(app.id + '|' + c.appSecret)}`, { signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  const w = (j.data || []).find(x => x.object === 'whatsapp_business_account');
  const fields = (w?.fields || []).map(f => f.name || f);
  return { callback: w?.callback_url || '', fields, messages: fields.includes('messages') };
}

// הגשת תבנית חדשה לאישור Meta. הטקסט כולל שמות משתנים בעברית בסוגריים מסולסלים: {שם} {סכום} ...
export const VARS = { 'שם פרטי': 'first', 'שם': 'name', 'סכום': 'amount', 'תאריך': 'date', 'שעה': 'time', 'פירוט': 'details', 'גובה': 'collector' };
export function compileTemplate(text) {
  const order = []; const body = String(text || '').replace(/\{([^{}]+)\}/g, (m, k) => {
    k = k.trim(); if (!VARS[k]) throw Object.assign(new Error('משתנה לא מוכר: {' + k + '}. אפשר: ' + Object.keys(VARS).map(x => '{' + x + '}').join(' ')), { status: 400 });
    order.push(VARS[k]); return '{{' + order.length + '}}';
  });
  return { body, order };
}
export async function submitTemplate({ name, language = 'he', category = 'UTILITY', text, user }) {
  const c = cfg(); if (!c.token || !c.wabaId) throw Object.assign(new Error('חסר חיבור לחשבון העסקי'), { status: 400 });
  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw Object.assign(new Error('שם תבנית: אותיות באנגלית קטנות, ספרות וקו תחתון בלבד'), { status: 400 });
  const { body, order } = compileTemplate(text);
  const example = order.map(k => ({ first: 'ישראל', name: 'ישראל ישראלי', amount: '1,250 ₪', date: '21.11.2026', time: '18:30', details: '800 ₪ + 450 ₪', collector: 'בן' }[k]));
  const comp = [{ type: 'BODY', text: body, ...(order.length ? { example: { body_text: [example] } } : {}) },
    { type: 'FOOTER', text: 'להסרה מרשימת התפוצה השיבו "הסר"' }];
  const j = await graph('POST', `/${c.wabaId}/message_templates`, { name, language, category, components: comp });
  const maps = kvGet('wa_template_maps', {}); maps[name + ':' + language] = { order, text }; kvSet('wa_template_maps', maps);
  logAudit({ user, action: 'הגשת תבנית וואטסאפ לאישור', note: name + ' — ' + (j.status || '') });
  return j;
}
export function templateOrder(name, language) {
  const maps = kvGet('wa_template_maps', {}); const m = maps[name + ':' + language];
  if (m) return m.order;
  // תבנית שנוצרה ישירות ב-Meta: אם לא הוגדר מיפוי, ברירת המחדל לפי הסדר: שם, סכום, תאריך, שעה, פירוט
  const t = db.prepare('SELECT body FROM wa_templates WHERE name=? AND language=?').get(name, language);
  const n = t ? (t.body.match(/\{\{\d+\}\}/g) || []).length : 0;
  return ['name', 'amount', 'date', 'time', 'details', 'collector'].slice(0, n);
}
export function setTemplateOrder(name, language, order) {
  const maps = kvGet('wa_template_maps', {}); maps[name + ':' + language] = { ...(maps[name + ':' + language] || {}), order }; kvSet('wa_template_maps', maps);
}

// ---- בניית רשימת נמענים ותצוגה מקדימה ----
const fmtMoney = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 }) + ' ₪';
const oneLine = (s) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();

// items: [{name, phone, amount, time, collector, date, ref}] — שורות שנבחרו. merge: איחוד שורות של אותו לקוח להודעה אחת
export function buildRecipients({ items, merge = true, phoneIndex }) {
  const groups = new Map(); const skipped = [];
  for (const it of items) {
    const prob = phoneProblem(it.phone);
    if (prob) { skipped.push({ ...it, reason: it.reasonHint || prob }); continue; }
    const phone = normPhone(it.phone);
    const key = merge ? phone + '|' + normName(it.name) : phone + '|' + normName(it.name) + '|' + it.ref;
    if (!groups.has(key)) groups.set(key, { phone, name: String(it.name || '').trim(), lines: [], refs: [] });
    const g = groups.get(key); g.lines.push(it); g.refs.push(it.ref); if (it.resolved) g.resolved = true;
  }
  // אותו מספר אצל שני לקוחות שונים — עוצרים את השליחה למספר הזה עד בדיקת השיוך
  const byPhone = new Map();
  for (const g of groups.values()) { if (!byPhone.has(g.phone)) byPhone.set(g.phone, []); byPhone.get(g.phone).push(g); }
  const confirmed = kvGet('phone_owner_ok', {});
  const consent = new Map(db.prepare('SELECT phone,status FROM wa_consent').all().map(r => [r.phone, r.status]));
  const requireOptIn = kvGet('wa_require_opt_in', true);
  const recipients = []; const blocked = [];
  for (const [phone, gs] of byPhone) {
    const names = new Set(gs.map(g => normName(g.name)));
    const globalNames = phoneIndex ? (phoneIndex.get(phone) || new Set()) : new Set();
    const allNames = new Set([...names, ...globalNames]);
    const okName = confirmed[phone];
    if (allNames.size > 1 && !(okName && [...names].every(n => n === okName))) {
      blocked.push({ phone, names: [...new Set([...gs.map(g => g.name), ...globalNames])], reason: 'אותו מספר משויך ליותר מלקוח אחד — בדוק את השיוך', refs: gs.flatMap(g => g.refs) });
      continue;
    }
    for (const g of gs) {
      const total = g.lines.reduce((t, l) => t + (+l.amount || 0), 0);
      const times = g.lines.map(l => l.time).filter(Boolean).sort();
      const details = g.lines.length > 1 ? g.lines.map(l => fmtMoney(l.amount) + (l.time ? ' (' + l.time + ')' : '')).join(' + ') : fmtMoney(total);
      const c = consent.get(phone);
      recipients.push({
        phone, name: g.name, refs: g.refs, count: g.lines.length, resolved: !!g.resolved,
        vars: { first: oneLine(String(g.name).split(' ')[0]), name: oneLine(g.name), amount: fmtMoney(total), date: oneLine(g.lines[0].date || ''), time: times[0] || '', details: oneLine(details), collector: oneLine(g.lines[0].collector || '') },
        consent: c || 'unknown', optOut: c === 'opt_out', needsOptIn: requireOptIn && c !== 'opt_in',
      });
    }
  }
  return { recipients, skipped, blocked, requireOptIn };
}

export function renderBody(body, order, vars) {
  return String(body || '').replace(/\{\{(\d+)\}\}/g, (m, i) => { const k = order[+i - 1]; return k ? (vars[k] || '—') : m; });
}

// ---- יצירת משלוח: מזהה המשלוח נוצר במכשיר, ולכן לחיצה כפולה או ניסיון חוזר לא יוצרים משלוח נוסף ----
export function createBatch({ batchId, template, language, recipients, source, user }) {
  if (!batchId || !/^[\w-]{8,64}$/.test(batchId)) throw Object.assign(new Error('מזהה משלוח חסר'), { status: 400 });
  const ex = db.prepare('SELECT id FROM wa_batches WHERE id=?').get(batchId);
  if (ex) return { id: batchId, existing: true };
  const t = db.prepare('SELECT * FROM wa_templates WHERE name=? AND language=?').get(template, language);
  if (!t) throw Object.assign(new Error('התבנית לא נמצאה. סנכרן תבניות ממסך החיבור'), { status: 400 });
  if (t.status !== 'APPROVED') throw Object.assign(new Error('אפשר לשלוח רק בתבנית שאושרה על ידי Meta (מצב נוכחי: ' + t.status + ')'), { status: 400 });
  const order = templateOrder(template, language);
  const tm = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO wa_batches(id,created_at,created_by,template_name,language,source_col,source_id,source_title,total) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(batchId, tm, user?.name || '', template, language, source?.col || null, source?.id || null, source?.title || null, recipients.length);
    const ins = db.prepare('INSERT OR IGNORE INTO wa_messages(id,batch_id,phone,client_name,params,preview,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
    for (const r of recipients) {
      const params = order.map(k => r.vars[k] || '—');
      ins.run(newId('m_'), batchId, r.phone, r.name, JSON.stringify(params), renderBody(t.body, order, r.vars), 'queued', tm, tm);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  logAudit({ user, action: 'משלוח וואטסאפ', note: `${recipients.length} נמענים · תבנית ${template}` + (source?.title ? ' · ' + source.title : '') });
  kick();
  return { id: batchId, existing: false };
}

export function batchSummary(id) {
  const b = db.prepare('SELECT * FROM wa_batches WHERE id=?').get(id); if (!b) return null;
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM wa_messages WHERE batch_id=? GROUP BY status').all(id).map(r => [r.status, r.n]));
  return { ...b, counts };
}
export function retryFailed(id, user) {
  const r = db.prepare("UPDATE wa_messages SET status='queued', error_code=NULL, error_text=NULL, updated_at=? WHERE batch_id=? AND status IN ('failed','unknown')").run(now(), id);
  logAudit({ user, action: 'ניסיון חוזר להודעות שנכשלו', note: `${r.changes} הודעות` });
  kick(); return r.changes;
}

// ---- תור השליחה ----
let running = false; let timer = null;
export function kick() { if (!timer) timer = setTimeout(pump, 50); }
async function pump() {
  timer = null; if (running) return; running = true;
  try {
    const c = cfg();
    if (!c.token || !c.phoneId) return;
    const batch = db.prepare("SELECT m.*, b.template_name, b.language FROM wa_messages m JOIN wa_batches b ON b.id=m.batch_id WHERE m.status='queued' AND (m.updated_at<=? OR m.attempts=0) ORDER BY m.created_at LIMIT ?").all(now(), c.rate);
    await Promise.all(batch.map(sendOne));
    if (batch.length) timer = setTimeout(pump, 1000);
  } finally { running = false; }
}
async function sendOne(m) {
  // לפני השליחה: בקשת הסרה מבטלת את ההודעה
  const cs = db.prepare('SELECT status FROM wa_consent WHERE phone=?').get(m.phone);
  if (cs && cs.status === 'opt_out') { setMsg(m.id, 'skipped', null, 'optout', 'הלקוח ביקש הסרה — ההודעה לא נשלחה'); return; }
  const upd = db.prepare("UPDATE wa_messages SET status='sending', attempts=attempts+1, updated_at=? WHERE id=? AND status='queued'").run(now(), m.id);
  if (!upd.changes) return; // הודעה שכבר נלקחה לשליחה לא נשלחת שוב
  try {
    const params = JSON.parse(m.params || '[]');
    const j = await graph('POST', `/${cfg().phoneId}/messages`, {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: m.phone, type: 'template',
      template: { name: m.template_name, language: { code: m.language }, components: params.length ? [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: t })) }] : [] },
    });
    const wamid = j && j.messages && j.messages[0] && j.messages[0].id;
    if (!wamid) throw Object.assign(new Error('השירות לא החזיר מזהה הודעה'), { code: 'noid' });
    // ״נשלח״ רק לפי תשובת השירות. נמסר/נקרא/נכשל — רק לפי דיווח ה-Webhook
    db.prepare("UPDATE wa_messages SET status=CASE WHEN status='sending' THEN 'sent' ELSE status END, wamid=?, updated_at=? WHERE id=?").run(wamid, now(), m.id);
    applyPendingEvents(wamid);
  } catch (e) {
    const code = String(e.code || (e.name === 'TimeoutError' ? 'timeout' : 'net'));
    if (code === 'timeout' || code === 'net') {
      // לא ידוע אם ההודעה יצאה. לא שולחים שוב אוטומטית כדי לא לשלוח פעמיים
      setMsg(m.id, 'unknown', null, code, 'אין תשובה מהשירות — לא ידוע אם נשלחה. בדוק לפני ניסיון חוזר');
    } else if (RETRYABLE.has(code) && m.attempts < 4) {
      db.prepare("UPDATE wa_messages SET status='queued', error_code=?, error_text=?, updated_at=? WHERE id=?").run(code, e.message, now() + 5000 * (m.attempts + 1), m.id);
      kick();
    } else setMsg(m.id, 'failed', null, code, e.message);
  }
}
function setMsg(id, status, wamid, code, text) {
  db.prepare('UPDATE wa_messages SET status=?, wamid=COALESCE(?,wamid), error_code=?, error_text=?, updated_at=? WHERE id=?').run(status, wamid, code, text, now(), id);
}
// אחרי הפעלה מחדש: הודעות שנתקעו ״בשליחה״ מסומנות ״לא ידוע״ ולא נשלחות שוב לבד
export function recoverOnStart() {
  db.prepare("UPDATE wa_messages SET status='unknown', error_text='השרת הופעל מחדש באמצע שליחה — לא ידוע אם נשלחה. בדוק לפני ניסיון חוזר' WHERE status='sending'").run();
  kick();
}

// ---- Webhook ----
export function verifySignature(rawBody, header) {
  const secret = cfg().appSecret; if (!secret) return false;
  const want = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const got = String(header || '');
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
export const verifyChallenge = (q) => (q.get('hub.mode') === 'subscribe' && cfg().verifyToken && q.get('hub.verify_token') === cfg().verifyToken) ? q.get('hub.challenge') : null;

const RANK = { queued: 0, sending: 1, unknown: 1, sent: 2, delivered: 3, read: 4, failed: 5 };
const OPT_OUT = /^\s*(הסר|הסרה|להסיר|הסירו|stop|unsubscribe|עצור|די)\s*[.!]*\s*$/i;
const OPT_IN = /^\s*(הרשמה|אני מסכים|מסכים|מסכימה|start)\s*[.!]*\s*$/i;

export function handleWebhook(body) {
  kvSet('wa_last_webhook', now());
  for (const e of body.entry || []) for (const ch of e.changes || []) {
    const v = ch.value || {};
    for (const s of v.statuses || []) {
      db.prepare('INSERT INTO wa_events(at,wamid,kind,status,raw) VALUES(?,?,?,?,?)').run(now(), s.id, 'status', s.status, JSON.stringify(s));
      applyStatus(s);
    }
    for (const m of v.messages || []) {
      db.prepare('INSERT INTO wa_events(at,wamid,kind,status,raw) VALUES(?,?,?,?,?)').run(now(), m.id, 'inbound', m.type, JSON.stringify(m));
      const text = m.type === 'text' ? m.text?.body : m.type === 'button' ? (m.button?.text || m.button?.payload) : m.type === 'interactive' ? (m.interactive?.button_reply?.title || '') : '';
      const phone = normPhone(m.from);
      if (OPT_OUT.test(text || '')) setConsent(phone, 'opt_out', 'בקשת הסרה בוואטסאפ', text, null);
      else if (OPT_IN.test(text || '')) setConsent(phone, 'opt_in', 'הסכמה בוואטסאפ', text, null);
    }
  }
}
function applyStatus(s) {
  const m = db.prepare('SELECT id,status FROM wa_messages WHERE wamid=?').get(s.id);
  if (!m) return; // הדיווח הגיע לפני תשובת השליחה — יוחל כשהתשובה תגיע (applyPendingEvents)
  const next = s.status === 'failed' ? 'failed' : s.status;
  if (RANK[next] == null || (RANK[next] <= RANK[m.status] && next !== 'failed')) return;
  const err = (s.errors || [])[0];
  db.prepare('UPDATE wa_messages SET status=?, error_code=?, error_text=?, updated_at=? WHERE id=?')
    .run(next, err ? String(err.code) : null, err ? heError(err.code, err.title || err.message) : null, now(), m.id);
}
function applyPendingEvents(wamid) {
  for (const ev of db.prepare("SELECT raw FROM wa_events WHERE wamid=? AND kind='status' ORDER BY id").all(wamid)) applyStatus(JSON.parse(ev.raw));
}
export function setConsent(phone, status, source, note, user) {
  if (!phone) return;
  db.prepare('INSERT INTO wa_consent(phone,status,source,note,at,by) VALUES(?,?,?,?,?,?) ON CONFLICT(phone) DO UPDATE SET status=excluded.status, source=excluded.source, note=excluded.note, at=excluded.at, by=excluded.by')
    .run(phone, status, source || '', note || '', now(), user?.name || 'וואטסאפ');
  if (status === 'opt_out') db.prepare("UPDATE wa_messages SET status='skipped', error_code='optout', error_text='הלקוח ביקש הסרה', updated_at=? WHERE phone=? AND status='queued'").run(now(), phone);
  logAudit({ user, action: status === 'opt_out' ? 'הסרה מהודעות וואטסאפ' : 'הסכמה להודעות וואטסאפ', item: phone, note: source });
}
