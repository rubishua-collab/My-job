// עזרי ממשק: בחירת אלמנטים, עיצוב מספרים, הודעות קופצות וחלון תחתון
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const n0 = x => x == null || isNaN(x) ? '—' : Math.round(x).toLocaleString('he-IL');
export const n1 = x => x == null || isNaN(x) ? '—' : (Math.round(x * 10) / 10).toLocaleString('he-IL', { maximumFractionDigits: 1 });
export const kg = x => x == null ? '—' : (+x).toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
export const sign = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toLocaleString('he-IL', { maximumFractionDigits: 2 });

let toastTimer;
export function toast(msg, ms = 2600) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/** חלון תחתון: openSheet({title, body, foot}) → {el, close, body}. כפתור "סגור" ונגיעה ברקע סוגרים */
const stack = [];
export function openSheet({ title, body = '', foot = '', onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div><div class="sh"><h2>${esc(title)}</h2><button class="iconbtn" data-x aria-label="סגור">✕</button></div><div class="sb">${body}</div>${foot ? `<div class="sf">${foot}</div>` : ''}</div>`;
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const close = () => { wrap.remove(); stack.splice(stack.indexOf(api), 1); if (!stack.length) document.body.style.overflow = ''; onClose?.(); };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-x]')) close(); });
  const api = { el: wrap, body: $('.sb', wrap), foot: $('.sf', wrap), close, set(html) { $('.sb', wrap).innerHTML = html; }, setFoot(html) { const f = $('.sf', wrap); if (f) f.innerHTML = html; } };
  stack.push(api);
  return api;
}
export function closeAllSheets() { while (stack.length) stack[stack.length - 1].close(); }

export function confirmSheet(title, html, yes = 'אישור', no = 'ביטול') {
  return new Promise(res => {
    let done = false;
    const s = openSheet({ title, body: html, foot: `<button class="btn plain" data-no>${esc(no)}</button><button class="btn" data-yes>${esc(yes)}</button>`, onClose: () => { if (!done) res(false); } });
    s.el.addEventListener('click', e => { if (e.target.closest('[data-yes]')) { done = true; s.close(); res(true); } else if (e.target.closest('[data-no]')) { done = true; s.close(); res(false); } });
  });
}

export function meter(label, eaten, planned, target, unit) {
  const t = target || 0; const over = Math.max(0, eaten - t);
  const pe = t ? Math.min(100, eaten / t * 100) : 0; const pp = t ? Math.max(0, Math.min(100 - pe, planned / t * 100)) : 0;
  const rem = t - eaten;
  return `<div class="meter"><div class="lab"><span>${esc(label)}</span><span><b class="num">${n0(eaten)}</b> / <span class="num">${n0(t)}</span> ${unit}</span></div>
    <div class="bar" role="img" aria-label="${esc(label)}: אכלתי ${n0(eaten)} מתוך ${n0(t)}"><i class="e" style="width:${pe}%"></i><i class="p" style="width:${pp}%"></i>${over ? `<i class="o" style="width:${Math.min(20, over / t * 100)}%"></i>` : ''}</div>
    <div class="foot"><span class="remain">${rem >= 0 ? `נשארו <span class="num">${n0(rem)}</span> ${unit}` : `מעל היעד ב-<span class="num">${n0(-rem)}</span> ${unit}`}</span><span>${planned > 0.5 ? `מתוכנן עוד <span class="num">${n0(planned)}</span>` : ''}</span></div></div>`;
}

export function on(el, sel, ev, fn) { el.addEventListener(ev, e => { const t = e.target.closest(sel); if (t && el.contains(t)) fn(e, t); }); }
