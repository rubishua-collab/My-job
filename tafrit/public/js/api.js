// תקשורת עם השרת. באתר: עוגיית סשן HttpOnly. באפליקציה המותקנת: אסימון (Bearer) שנשמר במכשיר ונמחק בהתנתקות.
// כל שמירה מקבלת מזהה חד-פעמי, כך שניסיון חוזר לא נרשם פעמיים.
import { toast } from './ui.js';
import { API_BASE, APP_BUILD } from './config.js';
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, '');
export const isApp = () => APP_BUILD || !!window.Capacitor?.isNativePlatform?.();
export const apiUrl = p => (API_BASE || '') + p;
const TOKEN_KEY = 'tafrit-token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function req(method, url, body) {
  const headers = {}; if (body) headers['Content-Type'] = 'application/json';
  const t = isApp() ? getToken() : null; if (t) headers.Authorization = 'Bearer ' + t;
  const r = await fetch(apiUrl(url), { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: isApp() ? 'omit' : 'same-origin' });
  let data = null; try { data = await r.json(); } catch {}
  if (r.status === 401 && !url.startsWith('/api/auth/') && url !== '/api/session') { onUnauthorized(); }
  if (!r.ok) { const e = new Error(data?.error || `שגיאה ${r.status}`); e.status = r.status; throw e; }
  return data;
}
export const get = url => req('GET', url);
export const del = url => req('DELETE', url);
/** שמירה עם ניסיון חוזר על בעיית רשת (אותו opId) */
export async function save(method, url, body = {}, { quiet } = {}) {
  const payload = { ...body, opId: body.opId || uid() };
  for (let i = 0; i < 3; i++) {
    try { const r = await req(method, url, payload); netOk(); return r; }
    catch (e) {
      if (e.status) { if (!quiet) toast(e.message, 4000); throw e; }
      netDown(); await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  const e = new Error('אין חיבור. השינוי לא נשמר — נסה שוב.'); if (!quiet) toast(e.message, 4000); throw e;
}
function netDown() { let n = document.getElementById('net'); if (!n) { n = document.createElement('div'); n.id = 'net'; n.className = 'net'; document.body.appendChild(n); } n.textContent = 'אין חיבור לשרת — מנסה שוב…'; n.hidden = false; }
function netOk() { const n = document.getElementById('net'); if (n) n.hidden = true; }
