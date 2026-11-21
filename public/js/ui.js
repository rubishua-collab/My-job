// כלי עזר לממשק
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const money = (n) => `<span class="money${(+n || 0) < 0 ? ' neg' : ''}">${fmt(n)} ₪</span>`;
export const dmy = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ''); };
export const weekday = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'long' }); } catch { return ''; } };
export const todayISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
export const when = (ms) => ms ? new Date(ms).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

let toastT;
export function toast(msg, ms = 3200) {
  const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>`; clearTimeout(toastT); toastT = setTimeout(() => { t.innerHTML = ''; }, ms);
}

export function openSheet(html, { onClose } = {}) {
  const s = $('#sheet'); s.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`; s.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  const close = () => { s.hidden = true; s.innerHTML = ''; document.documentElement.style.overflow = ''; onClose && onClose(); };
  s.onclick = (e) => { if (e.target === s || e.target.closest('[data-close]')) close(); };
  return { el: $('.box', s), close };
}
export const closeSheet = () => { const s = $('#sheet'); if (!s.hidden) { s.hidden = true; s.innerHTML = ''; document.documentElement.style.overflow = ''; } };

// שמירת סינון ומיקום גלילה לכל מסך, כדי שחזרה מכרטיס לקוח תחזיר לאותו מקום
export const viewState = {
  get(k) { try { return JSON.parse(sessionStorage.getItem('vs:' + k) || '{}'); } catch { return {}; } },
  set(k, v) { try { sessionStorage.setItem('vs:' + k, JSON.stringify({ ...viewState.get(k), ...v })); } catch { /* */ } },
};

export const ICON = {
  today: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><circle cx="12" cy="15" r="2"/></svg>',
  acc: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  clients: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.3.2 3.9 1.8 4.5 4.5"/></svg>',
  wa: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c.3 2 2.5 4.2 4.5 4.5l1.2-1.2 2 1-.5 1.5c-3.5.3-7.5-3.7-7.2-7.2l1.5-.5 1 2z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  loans: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
};
