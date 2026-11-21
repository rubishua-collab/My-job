// שרת HTTP קטן בלי תלויות: ניתוב, JSON, עוגיות וקבצים סטטיים
import fs from 'node:fs';
import path from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    this.routes.push({ method, re, keys, handler });
  }
  get(p, h) { this.add('GET', p, h); } post(p, h) { this.add('POST', p, h); }
  put(p, h) { this.add('PUT', p, h); } patch(p, h) { this.add('PATCH', p, h); } del(p, h) { this.add('DELETE', p, h); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname); if (!m) continue;
      const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
    return null;
  }
}

export function parseCookies(req) {
  const o = {}; String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}

export function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((res, rej) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { rej(Object.assign(new Error('הקובץ גדול מדי'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });
}

export function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': isBuf ? 'application/octet-stream' : (typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'),
    'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers,
  });
  res.end(data);
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'",
};

export function serveStatic(req, res, root, pathname) {
  let p = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) return false;
  let st; try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': p === '/sw.js' || ext === '.html' ? 'no-cache' : 'no-cache', ...SECURITY_HEADERS });
  fs.createReadStream(file).pipe(res);
  return true;
}
export { MIME };
