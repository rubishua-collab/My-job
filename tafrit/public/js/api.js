// תקשורת עם השרת. כל שמירה מקבלת מזהה חד-פעמי, כך שניסיון חוזר לא נרשם פעמיים.
import { toast } from './ui.js';
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, '');

async function req(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let data = null; try { data = await r.json(); } catch {}
  if (r.status === 401 && !url.includes('/login')) { location.hash = '#/login'; throw new Error('נדרשת כניסה'); }
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
  const e = new Error('אין חיבור. השינוי לא נשמר — נסה שוב.'); toast(e.message, 4000); throw e;
}
function netDown() { let n = document.getElementById('net'); if (!n) { n = document.createElement('div'); n.id = 'net'; n.className = 'net'; document.body.appendChild(n); } n.textContent = 'אין חיבור לשרת — מנסה שוב…'; n.hidden = false; }
function netOk() { const n = document.getElementById('net'); if (n) n.hidden = true; }
