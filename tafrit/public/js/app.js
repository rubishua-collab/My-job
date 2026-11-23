// נקודת הכניסה: ניתוב, תפריט תחתון, כניסה/יציאה וטעינה
import { D, refresh } from './data.js';
import { get, save, setToken, setUnauthorizedHandler, isApp } from './api.js';
import { $, esc, closeAllSheets } from './ui.js';

const routes = {};
export function route(name, fn) { routes[name] = fn; }
const TABS = [['today', 'היום', '🍽️'], ['weight', 'שקילה', '⚖️'], ['chat', 'מלווה', '💬'], ['week', 'שבוע', '📈'], ['more', 'עוד', '☰']];
const OPEN = new Set(['welcome', 'signup', 'verify', 'login', 'forgot']); // מסכים בלי חשבון

export const view = () => $('#app');
/** מחליף את #app באלמנט חדש — כך מאזינים של מסך קודם לא מצטברים */
export function freshView() { const old = view(); const el = old.cloneNode(false); old.replaceWith(el); return el; }
export function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

let cleanup = null;
export async function render() {
  closeAllSheets();
  const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  const signed = !!D.session?.user;
  if (!signed && !OPEN.has(name)) return go('#/welcome');
  if (signed && OPEN.has(name)) return go('#/today');
  if (signed && name !== 'onboarding' && D.state && !D.state.profile?.onboarding?.done) return go('#/onboarding');
  const fn = routes[name] || routes.today;
  if (signed && D.state) { try { await refresh(); } catch {} } // נתונים עדכניים בכל מעבר מסך (גם ממכשיר אחר)
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.r === name));
  $('#tabbar').hidden = !signed || name === 'onboarding';
  if (typeof cleanup === 'function') cleanup();
  cleanup = await fn(freshView(), args.map(decodeURIComponent));
  window.scrollTo(0, 0);
}

/** ניקוי מלא של מידע מקומי של המשתמש (התנתקות / החלפת חשבון / מחיקה) */
export async function wipeLocal() {
  setToken(null);
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('tafrit')) localStorage.removeItem(k); } catch {}
  try { sessionStorage.clear(); } catch {}
  try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch {}
  D.state = null; D.foods = null; if (D.session) D.session.user = null;
}
export async function logout({ all = false } = {}) {
  try { await save('POST', all ? '/api/auth/logout-all' : '/api/auth/logout', {}, { quiet: true }); } catch {}
  await wipeLocal();
  location.hash = '#/welcome'; location.reload();
}

function tabbar() { $('#tabbar').innerHTML = TABS.map(([r, l, i]) => `<a href="#/${r}" data-r="${r}"><span class="i" aria-hidden="true">${i}</span>${esc(l)}</a>`).join(''); }

// שדות קוד (אימות דוא״ל / אימות דו-שלבי): מדביקים גם "123 456" או "123-456" — נשארות רק 6 ספרות
document.addEventListener('input', e => {
  const i = e.target; if (!(i instanceof HTMLInputElement) || i.autocomplete !== 'one-time-code') return;
  const v = i.value.replace(/\D/g, '').slice(0, 6); if (v !== i.value) i.value = v;
});

async function boot() {
  tabbar();
  setUnauthorizedHandler(async () => { if (D.session?.user) { await wipeLocal(); go('#/login'); } });
  try {
    D.session = await get('/api/session');
    // משתמש אחר נכנס במכשיר הזה? מנקים כל שארית מקומית של הקודם
    try { const last = localStorage.getItem('tafrit-last-user'); const cur = D.session.user?.id || ''; if (last && cur && last !== cur) { for (const k of Object.keys(localStorage)) if (k.startsWith('tafrit') && k !== 'tafrit-token') localStorage.removeItem(k); } if (cur) localStorage.setItem('tafrit-last-user', cur); } catch {}
    if (D.session.user) await refresh();
  } catch (e) { view().innerHTML = `<div class="note err" style="margin-top:20vh">לא הצלחתי להתחבר לשרת: ${esc(e.message)}<br><button class="btn" id="retry">נסה שוב</button></div>`; $('#retry').addEventListener('click', () => location.reload()); return; }
  await import('./screens/index.js');
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator && !isApp()) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();
