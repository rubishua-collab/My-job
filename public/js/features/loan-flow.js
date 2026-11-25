// ״בקשות הלוואה״ בפיצול ובאיסוף היום: בקשה שהועברה מ״בקשות להלוואה״ מוצגת כאן מתוך הבקשה עצמה (a._lreq מהשרת),
// ולכן היא לא נספרת בגביות או בהוצאות עד אישור המסירה. באיסוף היום: ״איזה גובה מסר את הכסף?״ + ״אשר שההלוואה ניתנה ללקוח״
// — השרת רושם הוצאה אחת ״מתן הלוואה״ לפי מזהה הבקשה (server/features/loan-flow.js).
import { save, uid } from '../api.js';
import { $, $$, esc, fmt, money, dmy, toast } from '../ui.js';
import { accountPanel } from '../registry.js';
import { collectorsList } from '../expense-form.js';
import { num } from '../calc.js';

const ST = new Map(); // מזהה בקשה -> { c, op, busy, err }
let COLLS = null;
const st = (id) => { if (!ST.has(id)) ST.set(id, { c: '', op: uid(), busy: false, err: '' }); return ST.get(id); };

export const lreqStatus = (q) => q.given
  ? `<span class="pill ok">אושרה ונמסרה ללקוח</span> <span class="small">גובה: <b>${esc(q.given.c)}</b> · שעת מסירה <span class="num">${esc(q.given.t || '')}</span></span>`
  : '<span class="pill warn">ממתינה למסירה</span>';

const CSS = `.lrq-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0;background:var(--surface)}
.lrq-item.given{border-color:var(--ok-fg)}
.lrq-nm{font-weight:700;font-size:16px;overflow-wrap:anywhere}.lrq-amt{font-weight:700;font-size:17px;white-space:nowrap}
.lrq-full{grid-column:1/-1}.lrq-note{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px;background:var(--field);border:1px solid var(--line);border-radius:6px;padding:6px 10px}
.lrq-give{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}.lrq-give label{flex:1 1 180px}.lrq-give .btn{flex:1 1 200px}`;
let cssDone = false;
const css = () => { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };

function itemHTML(q, work) {
  const s = st(q.id);
  const give = work && !q.given ? `<div class="lrq-full lrq-give no-print">
      <label class="f">איזה גובה מסר את הכסף?<select class="in" data-lrc="${esc(q.id)}" ${s.busy ? 'disabled' : ''}><option value="">בחר גובה…</option>${(COLLS || []).map(c => `<option ${s.c === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}${s.c && COLLS && !COLLS.includes(s.c) ? `<option selected>${esc(s.c)}</option>` : ''}</select></label>
      <button class="btn" data-lrok="${esc(q.id)}" ${!s.c || s.busy ? 'disabled' : ''}>${s.busy ? 'שומר…' : 'אשר שההלוואה ניתנה ללקוח'}</button>
      ${s.err ? `<div class="note err lrq-full" role="alert" style="flex-basis:100%">${esc(s.err)} לחץ שוב ״אשר שההלוואה ניתנה ללקוח״ — ההוצאה לא תירשם פעמיים.</div>` : ''}</div>` : '';
  return `<div class="lrq-item${q.given ? ' given' : ''}" data-lrq="${esc(q.id)}"><span class="lrq-nm">${esc(q.name)}</span><span class="lrq-amt">${money(num(q.amount))}</span>
    <div class="lrq-full small muted">${work ? 'סכום המסירה' : 'סכום ההלוואה'}: <b>${money(num(q.amount))}</b> · תאריך הבקשה: <span class="num">${esc(dmy(q.date))}</span>${q.phone ? ` · <a href="tel:${esc(q.phone)}">${esc(q.phone)}</a>` : ''}</div>
    ${String(q.note || '').trim() ? `<div class="lrq-full lrq-note">${esc(q.note)}</div>` : ''}
    <div class="lrq-full lrq-st">${lreqStatus(q)}</div>${give}</div>`;
}
function panel(ctx, work) {
  const L = ctx.a._lreq || []; if (!L.length) return '';
  css();
  return `<div class="card" id="lrq-panel"><div class="row sp"><h2>בקשות הלוואה</h2><span class="small muted">${L.length === 1 ? 'בקשה אחת' : L.length + ' בקשות'}</span></div>
    <p class="small muted" style="margin:0">${work ? 'הסכום לא נכלל בגביות. אחרי אישור המסירה נרשמת הוצאה אחת ״מתן הלוואה״ על שם הגובה שמסר.' : 'מוצג גם ב״איסוף יום״ של אותו תאריך. לא נכלל בסכומי הפיצול, בגביות או בהוצאות.'}</p>
    ${L.map(q => itemHTML(q, work)).join('')}</div>`;
}
function repaint(ctx) { const el = $('#lrq-panel', ctx.view); if (!el) return; el.outerHTML = panel(ctx, true); bindWork(ctx); }
function bindWork(ctx) {
  const box = $('#lrq-panel', ctx.view); if (!box) return;
  if (!COLLS && (ctx.a._lreq || []).some(q => !q.given)) collectorsList().then(l => { COLLS = l; repaint(ctx); });
  $$('[data-lrc]', box).forEach(sel => sel.onchange = () => { const s = st(sel.dataset.lrc); s.c = sel.value; s.err = ''; repaint(ctx); });
  $$('[data-lrok]', box).forEach(b => b.onclick = async () => {
    const id = b.dataset.lrok, s = st(id); if (s.busy || !s.c) return;
    s.busy = true; s.err = ''; repaint(ctx);
    try {
      const r = await save('POST', '/api/loan-req/give', { id, c: s.c, opId: s.op }, { queue: false, label: 'אישור מסירת הלוואה' });
      const q = (ctx.a._lreq || []).find(x => x.id === id); if (q) q.given = r.given;
      ST.delete(id);
      toast(`אושר: ההלוואה נמסרה ע״י ${r.given.c} · נרשמה הוצאה ${fmt(num(r.given.a))} ₪`);
      await ctx.reload(); // ההוצאה החדשה, הנטו של הגובה וסיכומי היום — מהשרת
    } catch (e) {
      s.busy = false; s.err = 'האישור לא נשמר: ' + (e.network ? 'אין תשובה מהשרת (בעיית קליטה).' : e.message); repaint(ctx);
    }
  });
}
accountPanel('split', (ctx) => panel(ctx, false));
accountPanel('work', (ctx) => panel(ctx, true), bindWork);
