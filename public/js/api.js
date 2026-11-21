// תקשורת עם השרת. כל פעולת שמירה מקבלת מזהה פעולה (opId) קבוע, כך שניסיון חוזר אחרי בעיית קליטה לא רושם פעמיים.
const PKEY = 'yh_pending_ops';
const listeners = new Set();
export const onNet = (fn) => listeners.add(fn);
const emit = (s) => listeners.forEach(f => f(s));

export class ApiError extends Error { constructor(msg, status, extra) { super(msg); this.status = status; Object.assign(this, extra || {}); } }
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

async function raw(method, url, body, { timeout = 20000, rawBody = false } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    r = await fetch(url, { method, credentials: 'same-origin', headers: body && !rawBody ? { 'Content-Type': 'application/json' } : {}, body: body ? (rawBody ? body : JSON.stringify(body)) : undefined, signal: ctl.signal });
  } catch (e) {
    throw new ApiError(navigator.onLine === false ? 'אין חיבור לאינטרנט' : 'אין תשובה מהשרת (בעיית קליטה)', 0, { network: true });
  } finally { clearTimeout(t); }
  let j = null; const ct = r.headers.get('content-type') || '';
  if (ct.includes('json')) { try { j = await r.json(); } catch { /* */ } }
  if (r.status === 401 && !url.endsWith('/api/login')) { location.hash = '#/login'; throw new ApiError('צריך להתחבר', 401); }
  if (!r.ok) throw new ApiError((j && j.error) || 'שגיאה ' + r.status, r.status, { network: r.status >= 500 || r.status === 0, current: j && j.current });
  return j;
}

export const get = (url) => raw('GET', url);

// פעולת שמירה: אם נכשלה בגלל קליטה — נשמרת בתור ומנסים שוב עם אותו מזהה
export async function save(method, url, body = {}, { label = 'שמירה', queue = true } = {}) {
  const op = { id: body.opId || uid(), method, url, body: { ...body }, label, at: Date.now() };
  op.body.opId = op.id;
  try {
    const out = await raw(method, url, op.body);
    removePending(op.id); emit({ ok: true });
    return out;
  } catch (e) {
    if (e.network && queue) { addPending(op); emit({ failed: true, label, error: e.message }); }
    throw e;
  }
}
const pending = () => { try { return JSON.parse(localStorage.getItem(PKEY) || '[]'); } catch { return []; } };
const setPending = (l) => { try { localStorage.setItem(PKEY, JSON.stringify(l)); } catch { /* */ } };
function addPending(op) { const l = pending().filter(x => x.id !== op.id); l.push(op); setPending(l); }
function removePending(id) { setPending(pending().filter(x => x.id !== id)); }
export const pendingOps = pending;
export async function retryPending() {
  const l = pending(); let ok = 0, fail = 0, conflict = [];
  for (const op of l) {
    try { await raw(op.method, op.url, op.body); removePending(op.id); ok++; }
    catch (e) { if (e.network) fail++; else { removePending(op.id); conflict.push(op.label + ': ' + e.message); } }
  }
  emit(fail ? { failed: true, label: 'ניסיון חוזר', error: 'עדיין אין קליטה' } : { ok: true, retried: ok, conflict });
  return { ok, fail, conflict };
}
window.addEventListener('online', () => { if (pending().length) retryPending(); });
