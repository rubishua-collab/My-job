// תפריט יומי רובי — שרת האפליקציה (Node 22, בלי מסגרות)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import * as S from './store.js';
import { once, kvGet, kvSet, chatList, chatClear, putDoc, deleteDoc, getDoc, docHistory } from './db.js';
import { chat, aiEnabled, MODEL } from './ai.js';
import { usdaSearch, usdaEnabled } from './usda.js';
import { isISO } from '../shared/dates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 8080;
const PASSWORD = process.env.APP_PASSWORD || '';
const SECURE = process.env.COOKIE_SECURE === '1' || (process.env.PUBLIC_URL || '').startsWith('https');

const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function send(req, res, status, body, extra = {}) {
  const json = JSON.stringify(body);
  const gz = json.length > 2048 && /gzip/.test(req.headers['accept-encoding'] || '');
  res.writeHead(status, { ...HEADERS, 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store', ...(gz ? { 'Content-Encoding': 'gzip' } : {}), ...extra });
  res.end(gz ? zlib.gzipSync(json) : json);
}
async function readBody(req) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 5e6) throw Object.assign(new Error('הבקשה גדולה מדי'), { status: 413 }); chunks.push(c); }
  if (!n) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('JSON לא תקין'), { status: 400 }); }
}

// ---- קבצים סטטיים (עם gzip ומטמון בזיכרון) ----
const staticCache = new Map();
function serveFile(req, res, file) {
  const ext = path.extname(file);
  let c = staticCache.get(file);
  try {
    const st = fs.statSync(file);
    if (!c || c.mtime !== st.mtimeMs) { const raw = fs.readFileSync(file); c = { raw, gz: zlib.gzipSync(raw), mtime: st.mtimeMs, etag: '"' + createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"' }; staticCache.set(file, c); }
  } catch { return false; }
  if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, { ETag: c.etag }); res.end(); return true; }
  const gz = /gzip/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[ext] || 'application/octet-stream', ETag: c.etag, 'Cache-Control': ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(gz ? c.gz : c.raw);
  return true;
}
function staticPath(p) {
  if (p === '/' || p === '') return path.join(ROOT, 'public', 'index.html');
  if (p === '/data/foods.json') return S.FOODS_FILE;
  const base = p.startsWith('/shared/') ? ROOT : path.join(ROOT, 'public');
  const f = path.normalize(path.join(base, decodeURIComponent(p)));
  if (!f.startsWith(base + path.sep)) return null;
  if (p.startsWith('/shared/') && !f.startsWith(path.join(ROOT, 'shared') + path.sep)) return null;
  return f;
}

// ---- כניסה (אופציונלי: רק אם הוגדרה APP_PASSWORD) ----
const sessions = new Set(kvGet('sessions') || []);
const cookieOf = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(x => x[0]));
function authed(req) { if (!PASSWORD) return true; const t = cookieOf(req).sid; return !!t && sessions.has(createHash('sha256').update(t).digest('hex')); }
const attempts = new Map();

// ---- נתיבים ----
const routes = [];
const route = (method, pattern, fn) => { const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'); routes.push({ method, re, keys, fn }); };

route('GET', '/api/health', () => ({ ok: true }));
route('GET', '/api/session', req => ({ authed: authed(req), needsPassword: !!PASSWORD, ai: aiEnabled(), model: aiEnabled() ? MODEL : null, usda: usdaEnabled() }));
route('POST', '/api/login', (req, res, { body }) => {
  if (!PASSWORD) return { ok: true };
  const ip = req.socket.remoteAddress; const a = attempts.get(ip) || { n: 0, t: 0 };
  if (a.n >= 8 && Date.now() - a.t < 10 * 60e3) throw Object.assign(new Error('יותר מדי ניסיונות. נסה שוב בעוד כמה דקות'), { status: 429 });
  const given = Buffer.from(String(body.password || '')); const want = Buffer.from(PASSWORD);
  if (given.length !== want.length || !timingSafeEqual(given, want)) { attempts.set(ip, { n: a.n + 1, t: Date.now() }); throw Object.assign(new Error('סיסמה שגויה'), { status: 401 }); }
  attempts.delete(ip);
  const tok = randomBytes(24).toString('hex'); sessions.add(createHash('sha256').update(tok).digest('hex')); kvSet('sessions', [...sessions].slice(-20));
  return { ok: true, _cookie: `sid=${tok}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${SECURE ? '; Secure' : ''}` };
});

route('GET', '/api/state', () => S.state());
route('PUT', '/api/profile', (req, res, { body }) => S.saveProfile(body.profile));
route('GET', '/api/targets/preview', (req, res, { q }) => S.previewTargets(S.getProfile(), +q.get('kg') || undefined));
route('POST', '/api/targets', (req, res, { body }) => once(body.opId, () => S.addTarget(body)));

route('PUT', '/api/weights/:date', (req, res, { params, body }) => once(body.opId, () => S.upsertWeight({ date: params.date, kg: body.kg, note: body.note })));
route('DELETE', '/api/weights/:date', (req, res, { params }) => ({ ok: S.deleteWeight(params.date) }));
route('GET', '/api/weights/:date/history', (req, res, { params }) => docHistory('weights', params.date));

route('POST', '/api/entries', (req, res, { body }) => once(body.opId, () => S.addEntries(body.entries || [])));
route('PUT', '/api/entries/:id', (req, res, { params, body }) => once(body.opId, () => S.updateEntry(params.id, body)));
route('DELETE', '/api/entries/:id', (req, res, { params }) => ({ ok: S.deleteEntry(params.id) }));
route('GET', '/api/entries/:id/history', (req, res, { params }) => S.entryHistory(params.id));
route('PUT', '/api/days/:date', (req, res, { params, body }) => S.setDay(params.date, body));
route('GET', '/api/day/:date', (req, res, { params }) => { if (!isISO(params.date)) throw Object.assign(new Error('תאריך לא תקין'), { status: 400 }); return S.daySummary(params.date); });

route('PUT', '/api/custom', (req, res, { body }) => S.saveCustom(body));
route('DELETE', '/api/custom/:id', (req, res, { params }) => ({ ok: S.removePersonal('custom', params.id) }));
route('PUT', '/api/recipes', (req, res, { body }) => S.saveRecipe(body));
route('DELETE', '/api/recipes/:id', (req, res, { params }) => ({ ok: S.removePersonal('recipes', params.id) }));
route('PUT', '/api/favorites/:id', (req, res, { params }) => putDoc('favorites', decodeURIComponent(params.id), { foodId: decodeURIComponent(params.id) }));
route('DELETE', '/api/favorites/:id', (req, res, { params }) => ({ ok: deleteDoc('favorites', decodeURIComponent(params.id)) }));
route('PUT', '/api/fixed-meals', (req, res, { body }) => { if (!body.name || !Array.isArray(body.items) || !body.items.length) throw Object.assign(new Error('חסר שם או רכיבים'), { status: 400 }); return putDoc('fixedMeals', body.id || 'f' + randomBytes(6).toString('hex'), { name: body.name, items: body.items.map(i => ({ foodId: i.foodId, grams: +i.grams, unit: i.unit || 'g', qty: i.qty ?? null, comp: i.comp || null })) }); });
route('DELETE', '/api/fixed-meals/:id', (req, res, { params }) => ({ ok: deleteDoc('fixedMeals', params.id) }));
route('PUT', '/api/checkins/:week', (req, res, { params, body }) => { if (!isISO(params.week)) throw Object.assign(new Error('תאריך לא תקין'), { status: 400 }); const c = (k) => body[k] == null ? null : Math.max(1, Math.min(5, +body[k])); return putDoc('checkins', params.week, { hunger: c('hunger'), energy: c('energy'), performance: c('performance'), note: String(body.note || '').slice(0, 500) }); });

route('GET', '/api/usda/search', async (req, res, { q }) => usdaSearch(q.get('q') || ''));
route('GET', '/api/chat', () => chatList(200));
route('DELETE', '/api/chat', () => { chatClear(); return { ok: true }; });
route('POST', '/api/chat', async (req, res, { body }) => chat(body.message));

route('GET', '/api/export', () => S.exportAll());
route('POST', '/api/import', (req, res, { body }) => S.importAll(body));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      const r = routes.find(r => r.method === req.method && r.re.test(p));
      if (!r) return send(req, res, 404, { error: 'לא נמצא' });
      const open = p === '/api/health' || p === '/api/session' || p === '/api/login';
      if (!open && !authed(req)) return send(req, res, 401, { error: 'נדרשת כניסה' });
      const m = p.match(r.re); const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const out = await r.fn(req, res, { params, body, q: url.searchParams });
      const extra = {};
      if (out && out._cookie) { extra['Set-Cookie'] = out._cookie; delete out._cookie; }
      return send(req, res, 200, out ?? { ok: true }, extra);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, { error: 'שיטה לא נתמכת' });
    const f = staticPath(p);
    if (f && serveFile(req, res, f)) return;
    // ניתוב צד-לקוח: כל נתיב אחר מחזיר את האפליקציה
    if (!path.extname(p)) return serveFile(req, res, path.join(ROOT, 'public', 'index.html'));
    res.writeHead(404, HEADERS); res.end('Not found');
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    send(req, res, status, { error: status >= 500 ? 'שגיאה בשרת. הנתונים לא נשמרו — נסה שוב.' : e.message });
  }
});
server.listen(PORT, () => console.log(`תפריט יומי רובי פועל: http://localhost:${PORT}  (AI: ${aiEnabled() ? MODEL : 'מצב בסיסי'})`));
