// נקודת הכניסה: ניתוב, תפריט תחתון וטעינה
import { D, refresh, profile } from './data.js';
import { get, save } from './api.js';
import { $, esc, toast, closeAllSheets } from './ui.js';

const routes = {};
export function route(name, fn) { routes[name] = fn; }
const TABS = [['today', 'היום', '🍽️'], ['weight', 'שקילה', '⚖️'], ['chat', 'מלווה', '💬'], ['week', 'שבוע', '📈'], ['more', 'עוד', '☰']];

export const view = () => $('#app');
/** מחליף את #app באלמנט חדש — כך מאזינים של מסך קודם לא מצטברים */
export function freshView() { const old = view(); const el = old.cloneNode(false); old.replaceWith(el); return el; }
export function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

let cleanup = null;
export async function render() {
  closeAllSheets();
  const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  if (D.session?.needsPassword && !D.session.authed && name !== 'login') return go('#/login');
  if (name !== 'login' && name !== 'onboarding' && D.state && !profile()?.onboarding?.done) return go('#/onboarding');
  const fn = routes[name] || routes.today;
  if (D.state && name !== 'login') { try { await refresh(); } catch {} } // נתונים עדכניים בכל מעבר מסך (גם ממכשיר אחר)
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.r === name));
  $('#tabbar').hidden = name === 'onboarding' || name === 'login';
  if (typeof cleanup === 'function') cleanup();
  cleanup = await fn(freshView(), args.map(decodeURIComponent));
  window.scrollTo(0, 0);
}

function tabbar() {
  const nav = $('#tabbar');
  nav.innerHTML = TABS.map(([r, l, i]) => `<a href="#/${r}" data-r="${r}"><span class="i" aria-hidden="true">${i}</span>${esc(l)}</a>`).join('');
}

route('login', async (el) => {
  el.innerHTML = `<div class="stack" style="padding-top:12vh"><h1>תפריט יומי רובי</h1><p class="muted">הכנס סיסמה כדי לפתוח את היומן שלך.</p>
  <form id="lf" class="stack"><input class="in" type="password" id="pw" autocomplete="current-password" placeholder="סיסמה" required><button class="btn block xl">כניסה</button></form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    try { await save('POST', '/api/login', { password: $('#pw').value }); D.session.authed = true; await refresh(); go('#/today'); } catch {}
  };
});

async function boot() {
  tabbar();
  try {
    D.session = await get('/api/session');
    if (!D.session.needsPassword || D.session.authed) await refresh();
  } catch (e) { view().innerHTML = `<div class="note err">לא הצלחתי לטעון: ${esc(e.message)}</div>`; return; }
  await import('./screens/index.js');
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();
