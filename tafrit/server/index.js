// תפריט יומי רובי — שרת האפליקציה (Node 22). רב-משתמשים: כל בקשה מזוהה לפי הסשן, וכל נתון מסונן לפי המשתמש המחובר.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as S from './store.js';
import * as A from './auth.js';
import { db, once, chatList, chatClear, docHistory, audit, auditList, countDocs, kvGet, now, KEY_SOURCE } from './db.js';
import { chat, aiEnabled, MODEL } from './ai.js';
import { usdaSearch } from './usda.js';
import { mailEnabled, mailDev, devOutbox } from './mail.js';
import { scheduleBackups, createBackup, legacyPending } from './backup.js';
import { isISO } from '../shared/dates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 8080;
const PROD = process.env.NODE_ENV === 'production';
const SECURE = process.env.COOKIE_SECURE === '1' || (process.env.PUBLIC_URL || '').startsWith('https');
// מקורות של האפליקציה המותקנת (Capacitor): iOS = capacitor://localhost, Android = https://localhost
const APP_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'ionic://localhost', ...(process.env.EXTRA_ORIGINS || '').split(',').filter(Boolean)]);

const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  ...(SECURE ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const err = (status, message) => Object.assign(new Error(message), { status });

function cors(req) {
  const o = req.headers.origin;
  return o && APP_ORIGINS.has(o) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Max-Age': '600', Vary: 'Origin' } : {};
}
function send(req, res, status, body, extra = {}) {
  const json = JSON.stringify(body);
  const gz = json.length > 2048 && /gzip/.test(req.headers['accept-encoding'] || '');
  res.writeHead(status, { ...HEADERS, ...cors(req), 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store', ...(gz ? { 'Content-Encoding': 'gzip' } : {}), ...extra });
  res.end(gz ? zlib.gzipSync(json) : json);
}
async function readBody(req) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 5e6) throw err(413, 'הבקשה גדולה מדי'); chunks.push(c); }
  if (!n) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw err(400, 'JSON לא תקין'); }
}

// ---- קבצים סטטיים ----
const staticCache = new Map();
function serveFile(req, res, file) {
  const ext = path.extname(file); let c = staticCache.get(file);
  try {
    const st = fs.statSync(file); if (!st.isFile()) return false;
    if (!c || c.mtime !== st.mtimeMs) { const raw = fs.readFileSync(file); c = { raw, gz: zlib.gzipSync(raw), mtime: st.mtimeMs, etag: '"' + createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"' }; staticCache.set(file, c); }
  } catch { return false; }
  if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, { ETag: c.etag }); res.end(); return true; }
  const gz = /gzip/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[ext] || 'application/octet-stream', ETag: c.etag, 'Cache-Control': ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(gz ? c.gz : c.raw); return true;
}
function staticPath(p) {
  if (p === '/' || p === '') return path.join(ROOT, 'public', 'index.html');
  if (p === '/data/foods.json') return S.FOODS_FILE;
  if (p === '/privacy' || p === '/privacy/') return path.join(ROOT, 'public', 'privacy.html');
  if (p === '/delete-account' || p === '/delete-account/') return path.join(ROOT, 'public', 'delete-account.html');
  if (p === '/terms') return path.join(ROOT, 'public', 'terms.html');
  const base = p.startsWith('/shared/') ? path.join(ROOT, 'shared') : path.join(ROOT, 'public');
  const rel = p.startsWith('/shared/') ? p.slice('/shared'.length) : p;
  const f = path.normalize(path.join(base, decodeURIComponent(rel)));
  return f.startsWith(base + path.sep) ? f : null;
}

// ---- זיהוי המשתמש ----
const cookieOf = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(x => x[0]));
function tokenOf(req) { const h = req.headers.authorization || ''; if (h.startsWith('Bearer ')) return h.slice(7).trim(); return cookieOf(req).sid || null; }
const ipOf = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
function sessionCookie(tok, maxAge) { return `sid=${tok}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${SECURE ? '; Secure' : ''}`; }
const clearCookie = `sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${SECURE ? '; Secure' : ''}`;
/** תשובת כניסה: לאפליקציה מחזירים אסימון (Bearer); לדפדפן — עוגייה HttpOnly בלבד */
function loginReply(r, kind) {
  if (!r.token) return r;
  const { token, maxAge, ...rest } = r;
  return kind === 'bearer' ? { ...rest, token } : { ...rest, _cookie: sessionCookie(token, maxAge) };
}

// ---- נתיבים ----
const routes = [];
const route = (method, pattern, fn, opts = {}) => { const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'); routes.push({ method, re, keys, fn, ...opts }); };
const PUBLIC = { public: true };

route('GET', '/api/health', () => ({ ok: true }), PUBLIC);
route('GET', '/api/public/info', () => ({ supportEmail: process.env.SUPPORT_EMAIL || null }), PUBLIC);
route('GET', '/api/session', (req, res, ctx) => ({
  user: ctx.user ? A.publicUser(ctx.user) : null, ai: aiEnabled(), aiProvider: aiEnabled() ? 'Anthropic (Claude)' : null, model: aiEnabled() ? MODEL : null,
  mail: mailEnabled(), privacyVersion: A.PRIVACY_VERSION, adminReady: ctx.user ? A.adminReady(ctx) : false,
}), { ...PUBLIC, optionalAuth: true });

route('POST', '/api/auth/register', async (req, res, { body, ip }) => { A.rateLimit('reg:' + ip, 10, 3600e3); return A.register(body); }, PUBLIC);
route('POST', '/api/auth/resend', async (req, res, { body, ip }) => { A.rateLimit('resend:' + ip, 6, 3600e3); return A.resendVerify(body.email); }, PUBLIC);
route('POST', '/api/auth/verify', (req, res, { body, ip }) => { A.rateLimit('verify:' + ip, 20, 600e3); return loginReply(A.verifyEmail({ ...body, kind: body.kind }), body.kind); }, PUBLIC);
route('POST', '/api/auth/login', async (req, res, { body, ip }) => { A.rateLimit('login:' + ip, 12, 600e3); A.rateLimit('login:' + A.normEmail(body.email), 8, 600e3); return loginReply(await A.login(body), body.kind); }, PUBLIC);
route('POST', '/api/auth/forgot', async (req, res, { body, ip }) => { A.rateLimit('forgot:' + ip, 6, 3600e3); return A.requestReset(body.email); }, PUBLIC);
route('POST', '/api/auth/reset', (req, res, { body, ip }) => { A.rateLimit('reset:' + ip, 20, 600e3); return A.resetPassword(body); }, PUBLIC);
route('POST', '/api/auth/logout', (req, res, { token }) => { A.logout(token); return { ok: true, _cookie: clearCookie }; }, { ...PUBLIC, optionalAuth: true });
route('POST', '/api/auth/logout-all', (req, res, { user }) => { A.logoutAll(user.id); return { ok: true, _cookie: clearCookie }; });
route('POST', '/api/account/password', (req, res, { user, body }) => A.changePassword(user, body));
route('POST', '/api/account/ai-consent', (req, res, { user, body }) => A.setAiConsent(user, !!body.consent));
route('POST', '/api/account/delete', (req, res, { user, body }) => { const r = A.deleteAccount(user, body.password); S.dropUserCache(user.id); return { ...r, _cookie: clearCookie }; });
// בקשת מחיקה מעמוד האינטרנט (בלי להתחבר): קוד לדוא״ל ואז אישור
route('POST', '/api/public/delete-request', async (req, res, { body, ip }) => { A.rateLimit('delreq:' + ip, 5, 3600e3); return A.requestDeletion(body.email); }, PUBLIC);
route('POST', '/api/public/delete-confirm', (req, res, { body, ip }) => { A.rateLimit('delconf:' + ip, 15, 3600e3); return A.confirmDeletion(body); }, PUBLIC);

// ---- הנתונים של המשתמש המחובר בלבד ----
route('GET', '/api/state', (req, res, { user }) => S.state(user.id));
route('PUT', '/api/profile', (req, res, { user, body }) => S.saveProfile(user.id, body.profile));
route('GET', '/api/targets/preview', (req, res, { user, q }) => S.previewTargets(user.id, +q.get('kg') || undefined));
route('POST', '/api/targets', (req, res, { user, body }) => once(user.id, body.opId, () => S.addTarget(user.id, body)));
route('POST', '/api/plans', (req, res, { user, body }) => once(user.id, body.opId, () => S.activatePlan(user.id, body)));
route('DELETE', '/api/plans/:id', (req, res, { user, params }) => S.cancelPlan(user.id, params.id));

route('PUT', '/api/weights/:date', (req, res, { user, params, body }) => once(user.id, body.opId, () => S.upsertWeight(user.id, { date: params.date, kg: body.kg, note: body.note })));
route('DELETE', '/api/weights/:date', (req, res, { user, params }) => ({ ok: S.deleteWeight(user.id, params.date) }));
route('GET', '/api/weights/:date/history', (req, res, { user, params }) => docHistory(user.id, 'weights', params.date));

route('POST', '/api/entries', (req, res, { user, body }) => once(user.id, body.opId, () => S.addEntries(user.id, body.entries || [])));
route('PUT', '/api/entries/:id', (req, res, { user, params, body }) => once(user.id, body.opId, () => S.updateEntry(user.id, params.id, body)));
route('DELETE', '/api/entries/:id', (req, res, { user, params }) => ({ ok: S.deleteEntry(user.id, params.id) }));
route('GET', '/api/entries/:id/history', (req, res, { user, params }) => S.entryHistory(user.id, params.id));
route('PUT', '/api/days/:date', (req, res, { user, params, body }) => S.setDay(user.id, params.date, body));
route('GET', '/api/day/:date', (req, res, { user, params }) => { if (!isISO(params.date)) throw err(400, 'תאריך לא תקין'); return S.daySummary(user.id, params.date); });

route('PUT', '/api/custom', (req, res, { user, body }) => S.saveCustom(user.id, body));
route('DELETE', '/api/custom/:id', (req, res, { user, params }) => ({ ok: S.removePersonal(user.id, 'custom', params.id) }));
route('PUT', '/api/recipes', (req, res, { user, body }) => S.saveRecipe(user.id, body));
route('DELETE', '/api/recipes/:id', (req, res, { user, params }) => ({ ok: S.removePersonal(user.id, 'recipes', params.id) }));
route('PUT', '/api/favorites/:id', (req, res, { user, params }) => S.setFavorite(user.id, params.id, true));
route('DELETE', '/api/favorites/:id', (req, res, { user, params }) => S.setFavorite(user.id, params.id, false));
route('PUT', '/api/fixed-meals', (req, res, { user, body }) => S.saveFixedMeal(user.id, body));
route('DELETE', '/api/fixed-meals/:id', (req, res, { user, params }) => ({ ok: S.removePersonal(user.id, 'fixedMeals', params.id) }));
route('PUT', '/api/checkins/:week', (req, res, { user, params, body }) => S.saveCheckin(user.id, params.week, body));

route('GET', '/api/usda/search', (req, res, { q }) => usdaSearch(q.get('q') || ''));
route('GET', '/api/chat', (req, res, { user }) => chatList(user.id, 200));
route('DELETE', '/api/chat', (req, res, { user }) => { chatClear(user.id); return { ok: true }; });
route('POST', '/api/chat', async (req, res, { user, body }) => { A.rateLimit('chat:' + user.id, 60, 3600e3); return chat(user, body.message); });
route('GET', '/api/export', (req, res, { user }) => S.exportAll(user.id));
route('POST', '/api/import', (req, res, { user, body }) => S.importAll(user.id, body));

// ---- מנהל: רק החשבון שננעל בשרת, ורק אחרי אימות דו-שלבי בסשן הנוכחי ----
const needAdmin = ctx => { if (!A.isAdmin(ctx.user)) throw err(403, 'אין הרשאה'); };
const needAdminMfa = ctx => { needAdmin(ctx); if (!A.adminReady(ctx)) throw err(403, 'נדרש אימות דו-שלבי'); };
route('POST', '/api/admin/2fa/setup', (req, res, ctx) => { needAdmin(ctx); return A.totpSetup(ctx.user); });
route('POST', '/api/admin/2fa/enable', (req, res, ctx) => { needAdmin(ctx); return A.totpEnable(ctx.user, ctx.session, ctx.body.code); });
route('POST', '/api/admin/2fa/verify', (req, res, ctx) => { needAdmin(ctx); return A.totpVerify(ctx.user, ctx.session, ctx.body.code, ctx.ip); });
route('GET', '/api/admin/users', (req, res, ctx) => {
  needAdminMfa(ctx);
  const term = String(ctx.q.get('q') || '').trim().toLowerCase();
  const rows = db.prepare(`SELECT id, email, role, email_verified_at, created_at, last_login_at FROM users ${term ? 'WHERE email LIKE ?' : ''} ORDER BY created_at DESC LIMIT 200`).all(...(term ? [`%${term.replace(/[%_]/g, '')}%`] : []));
  audit(ctx.user.id, 'admin_search_users', null, ctx.ip, term ? { query_len: term.length } : null);
  return { users: rows.map(u => ({ id: u.id, email: u.email, admin: u.id === kvGet('admin_user_id'), verified: !!u.email_verified_at, createdAt: u.created_at, lastLoginAt: u.last_login_at })), total: db.prepare('SELECT COUNT(*) n FROM users').get().n };
});
route('GET', '/api/admin/users/:id', (req, res, ctx) => {
  needAdminMfa(ctx);
  const u = A.getUser(ctx.params.id); if (!u) throw err(404, 'משתמש לא נמצא');
  audit(ctx.user.id, 'admin_view_profile', u.id, ctx.ip); // רק מי, מתי ואיזה פרופיל — בלי תוכן
  return { user: { id: u.id, email: u.email, createdAt: u.created_at, lastLoginAt: u.last_login_at, verified: !!u.email_verified_at }, counts: countDocs(u.id), data: S.adminView(u.id) };
});
route('GET', '/api/admin/audit', (req, res, ctx) => { needAdminMfa(ctx); return auditList({ limit: 300 }); });
route('GET', '/api/admin/system', (req, res, ctx) => { needAdminMfa(ctx); return { migration: kvGet('legacy_migration'), legacyPending: legacyPending(), keySource: KEY_SOURCE, mail: mailEnabled(), ai: aiEnabled() }; });
route('POST', '/api/admin/backup', (req, res, ctx) => { needAdminMfa(ctx); const f = createBackup('manual'); audit(ctx.user.id, 'admin_backup', null, ctx.ip); return { ok: true, file: path.basename(f) }; });
// לבדיקות אוטומטיות בלבד (לא קיים בייצור): קודי הדוא״ל שנשלחו
if (mailDev()) route('GET', '/api/dev/outbox', () => devOutbox(), PUBLIC);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors(req) }); return res.end(); }
      const r = routes.find(r => r.method === req.method && r.re.test(p));
      if (!r) return send(req, res, 404, { error: 'לא נמצא' });
      const token = tokenOf(req); const auth = A.sessionFrom(token);
      if (!r.public && !auth) return send(req, res, 401, { error: 'נדרשת כניסה' });
      // הגנת CSRF לבקשות עם עוגייה: רק מאותו מקור או מהאפליקציה
      if (req.method !== 'GET' && !(req.headers.authorization || '').startsWith('Bearer ')) {
        const o = req.headers.origin; const host = req.headers['x-forwarded-host'] || req.headers.host;
        if (o && !APP_ORIGINS.has(o) && new URL(o).host !== host) return send(req, res, 403, { error: 'מקור לא מורשה' });
      }
      const m = p.match(r.re); const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const ctx = { params, body, q: url.searchParams, token, ip: ipOf(req), user: auth?.user || null, session: auth?.session || null };
      const out = await r.fn(req, res, ctx);
      const extra = {};
      if (out && out._cookie) { extra['Set-Cookie'] = out._cookie; delete out._cookie; }
      return send(req, res, 200, out ?? { ok: true }, extra);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, { error: 'שיטה לא נתמכת' });
    const f = staticPath(p);
    if (f && serveFile(req, res, f)) return;
    if (!path.extname(p)) return serveFile(req, res, path.join(ROOT, 'public', 'index.html'));
    res.writeHead(404, HEADERS); res.end('Not found');
  } catch (e) {
    const status = e.status || 500;
    // דוח שגיאה בלי תוכן הבקשה ובלי נתונים אישיים: רק נתיב, שיטה והודעת השגיאה
    if (status >= 500) console.error(`[error] ${req.method} ${p.replace(/\/[^/]*\d[^/]*/g, '/:id')} — ${e.message}`);
    send(req, res, status, { error: status >= 500 ? 'שגיאה בשרת. הנתונים לא נשמרו — נסה שוב.' : e.message });
  }
});
if (PROD) scheduleBackups();
server.listen(PORT, () => console.log(`תפריט יומי רובי פועל על פורט ${PORT} (AI: ${aiEnabled() ? MODEL : 'מצב בסיסי'}, דוא״ל: ${mailEnabled() ? 'פעיל' : 'לא מוגדר'}, מפתח הצפנה: ${KEY_SOURCE})`));
