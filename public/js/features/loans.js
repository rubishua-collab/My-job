// הלוואות: רשימה, הלוואה חדשה (לפי מספר תשלומים או לפי החזר קבוע), לוח סילוקין, רישום תשלום מלא/חלקי וביטול עם סיבה,
// יומן תשלומים, מחיקה עם אישור, טלפון, PDF ללקוח ושליחה בוואטסאפ; ולוח בקרה של תיק ההלוואות במסך ״היום״.
// מקור: app.html — לשונית 1454-1491, קוד 6509-7087, לוח בקרה 5699-5845. נוסחאות הכסף מיובאות מ-calc.js כמו שהן.
// כל שמירה עוברת דרך /api/docs/loans (גרסה + מזהה פעולה), כך שלחיצה כפולה או ניסיון חוזר לא רושמים פעמיים, וכל שינוי נרשם ביומן השינויים.
import { termsFieldsHTML, termsOutHTML, mountTerms } from './loan-terms.js';
import { get, save } from '../api.js';
import { $, $$, esc, fmt, money, dmy, todayISO, toast, openSheet } from '../ui.js';
import { App, onLive } from '../app.js';
import { route, more, todayPanel } from '../registry.js';
import { r2, lnR2, lnSchedule, lnStatus, lnSum, lnPart, lnPartTot } from '../calc.js';
import { lnFmt, lnMoney, lnD, lnWaNumber, lnBuildPdf } from './loans-pdf.js';
import './loans-req.js';

const isoLabel = dmy;
// מקור: שורות 4880-4882
const pad2 = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

const LN = { list: [], sel: null, type: 'month', mode: 'n', state: 'wait', delFor: null, pdf: null, phoneDraft: null, busy: {}, q: {}, pay: null };
const canW = () => !!App.can.finance;
const isOwner = () => App.me && App.me.role === 'owner';
const lnNOf = (L, s) => s ? s.rows.length : L.n;
const lnGet = id => LN.list.find(x => x.id === id) || null;
const META = ['id', '_version', '_updatedAt', '_updatedBy'];
function lnDocOf(L) { const o = Object.assign({}, L); META.forEach(k => delete o[k]); return o; }
const failMsg = (e) => e && e.status === 409 ? 'ההלוואה עודכנה ממכשיר אחר. הנתונים רועננו — בדוק ונסה שוב.'
  : e && e.network ? 'לא נשמר — בעיית קליטה. הפעולה תישלח שוב אוטומטית (פס למעלה), ושום דבר לא יירשם פעמיים.'
  : ((e && e.message) || 'שגיאה');

async function lnReloadOne(id) {
  try { const d = await get('/api/docs/loans/' + encodeURIComponent(id)); const i = LN.list.findIndex(x => x.id === id); if (i >= 0) LN.list[i] = d; else LN.list.push(d); }
  catch (e) { if (e.status === 404) LN.list = LN.list.filter(x => x.id !== id); }
}
// כתיבה של כל המסמך, אחת בכל פעם לכל הלוואה (כמו lnPut המקורי, שורה 6571), עם גרסה למניעת דריסה
function lnPut(L, upd, { action, note } = {}) {
  const id = L.id;
  const run = async () => {
    const cur = lnGet(id) || L; const doc = Object.assign(lnDocOf(cur), upd);
    try {
      const out = await save('PUT', '/api/docs/loans/' + encodeURIComponent(id), { data: doc, baseVersion: cur._version, action, note }, { label: action || 'עדכון הלוואה' });
      const c = lnGet(id); if (c) { Object.assign(c, upd); if (out && out.version) c._version = out.version; }
      return out;
    } catch (e) { if (e.status === 409) await lnReloadOne(id); throw e; }
  };
  const p = (LN.q[id] || Promise.resolve()).catch(() => {}).then(run);
  LN.q[id] = p; return p;
}

// ---------------- עיצוב (מקור: שורות 483-522, 658-665) ----------------
const CSS = `
.ln-seg{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--field)}
.ln-seg button{appearance:none;flex:1;border:0;background:transparent;color:var(--muted);padding:8px 10px;font-weight:600;cursor:pointer;min-height:44px;white-space:nowrap}
.ln-seg button+button{border-inline-start:1px solid var(--line)}
.ln-seg button[aria-pressed="true"]{background:var(--accent);color:var(--accent-fg)}
.ln-fld{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--muted);min-width:0}
.ln-prev{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;background:var(--accent-soft);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:12px 0}
.ln-prev div{display:flex;flex-direction:column;gap:1px;min-width:0}
.ln-prev span{font-size:12px;color:var(--muted);font-weight:600}
.ln-prev b{font-size:18px;font-weight:700}
.ln-prev .msg{grid-column:1/-1;font-size:13.5px;color:var(--fg);font-weight:500}
.ln-prev .msg.bad{color:var(--err-fg);font-weight:600}
.ln-items{display:flex;flex-direction:column;gap:8px}
.ln-item{appearance:none;width:100%;text-align:start;display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px;cursor:pointer;color:var(--fg);font:inherit;min-height:56px}
.ln-item:hover{border-color:var(--accent)}
.ln-item[aria-current="true"]{border-color:var(--accent);box-shadow:inset -4px 0 0 var(--accent)}
.ln-item .nm{font-weight:700;font-size:16px}
.ln-item .meta{grid-column:1/-1;color:var(--muted);font-size:13px}
.pill.act{background:var(--accent-soft);color:var(--accent-ink)}
.ln-dh{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.ln-dh h2{font-size:21px;font-weight:700;margin:0}
.ln-dh .sub{color:var(--muted);font-size:13.5px;margin-top:2px}
#ln-detail{display:flex;flex-direction:column;gap:12px}
#ln-detail .kpis{margin-bottom:0}
.ln-kpi{cursor:default}
.ln-kpi .v{font-size:19px}
.ln-prog{display:flex;flex-direction:column;gap:6px}
.ln-prog .bar i{background:var(--ok-fg)}
.ln-sched{max-height:60vh;overflow:auto}
table.ln-tbl{width:100%;border-collapse:collapse;font-size:14px;min-width:680px}
.ln-tbl th{position:sticky;top:0;z-index:1;border-bottom:1px solid var(--line)}
.ln-tbl td{white-space:nowrap}
.ln-tbl tfoot td{font-weight:700;background:var(--surface2);border-top:2px solid var(--accent)}
.ln-tbl tr.paid td{color:var(--muted)}
.ln-tbl tr.late td{background:var(--err-bg)}
.ln-pb{appearance:none;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:13px;padding:3px 12px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;min-height:36px;white-space:nowrap}
.ln-pb:hover{border-color:var(--accent)}
.ln-pb.on{background:var(--ok-bg);border-color:var(--ok-fg);color:var(--ok-fg)}
.ln-pb.late{border-color:var(--err-fg);color:var(--err-fg);font-weight:700}
.ln-pb.part{background:var(--warn-bg);color:var(--warn-fg);border-color:var(--warn-fg)}
.ln-pb:disabled{opacity:.6;cursor:not-allowed}
.ln-send{border:1px solid color-mix(in srgb,var(--wa) 40%,var(--line));border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;background:color-mix(in srgb,var(--wa) 7%,var(--surface))}
.ln-send .row{align-items:flex-end}
.ln-send .row .ln-fld{flex:1 1 200px}
.ln-confirm{display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:var(--err-bg);color:var(--err-fg);border-radius:10px;padding:10px 12px;font-weight:600}
.ln-payask{border:2px solid var(--accent);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;background:var(--accent-soft)}
.ln-payask.undo{border-color:var(--neg);background:var(--err-bg)}
.ln-payask .kpi{background:var(--surface)}
.ln-payask .row .kpi{flex:1 1 150px}
.ln-payask .kpis{margin:0}
.ln-hist summary{font-weight:700;margin-bottom:6px}
.ln-parts{display:flex;flex-direction:column;gap:4px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--surface)}
.ln-part{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.ln-g2{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}
.ln-pk .kpi{cursor:pointer}
.ln-pk .kpi:hover{border-color:var(--accent)}
.ln-pk .kgo{font-size:11.5px;font-weight:700;color:var(--accent-ink);margin-top:3px}
.ln-pk .kpi .v{font-size:20px}
.ln-task{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
`;
let cssDone = false;
export function lnCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

// ---------------- טופס הלוואה חדשה (מקור: 6578-6641) ----------------
// תנאי ההלוואה ולוח הסילוקין — הרכיב המשותף (loan-terms.js), אותו רכיב שבבקשות להלוואה
let LNT = null;
function lnSetType(t) { LNT && LNT.setType(t); }
function lnSetMode(m) { LNT && LNT.setMode(m); }
const lnBase = () => ({ name: $('#ln-f-name').value.trim(), phone: $('#ln-f-phone').value.trim(), amount: parseFloat($('#ln-f-amount').value), date: $('#ln-f-date').value || todayISO() });
export function lnFormLoan() { return LNT.loan(); }
function lnPreview() { LNT && LNT.render(); }
function lnFormMsg(t) { const m = $('#ln-form-msg'); m.hidden = !t; m.textContent = t || ''; }
function lnOpenForm() {
  $('#ln-form').hidden = false; ['name', 'phone', 'amount'].forEach(k => { $('#ln-f-' + k).value = ''; }); $('#ln-f-date').value = todayISO(); lnFormMsg('');
  LNT.set({}); $('#ln-f-name').focus();
}
async function lnSave() {
  const L = lnFormLoan();
  if (!L.name) return lnFormMsg('חסר שם לווה.');
  if (!lnSchedule(L) || isNaN(L.rate)) return lnFormMsg(L.mode === 'pay' ? 'בדוק סכום, ריבית והחזר קבוע (ההחזר חייב להיות גבוה מהריבית הראשונה).' : 'בדוק סכום, ריבית ומספר תשלומים.');
  if (!canW()) return lnFormMsg('אין לך הרשאה לשמור הלוואות.');
  const id = 'L' + Date.now().toString(36);
  const doc = Object.assign({}, L, { paid: {}, created: new Date().toISOString() });
  const btn = $('#ln-save'); if (btn.disabled) return; btn.disabled = true;
  try {
    const out = await save('POST', '/api/docs/loans', { id, data: doc }, { label: 'הלוואה חדשה', queue: false });
    LN.list.push(Object.assign({ id: out.id || id, _version: out.version }, doc));
  } catch (e) { return lnFormMsg('השמירה נכשלה: ' + failMsg(e)); }
  finally { btn.disabled = false; }
  LN.sel = id; LN.delFor = null; LN.pdf = null; LN.pay = null; $('#ln-form').hidden = true; toast('ההלוואה נשמרה · אפשר לשלוח ללקוח PDF'); lnRender();
  setTimeout(() => { const s = $('#ln-send'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
}

// ---------------- רשימה ופרטי הלוואה (מקור: 6643-6704) ----------------
function lnRender() {
  const list = $('#ln-list'); if (!list) return;
  $('#ln-n').textContent = LN.list.length ? LN.list.length + ' הלוואות' : '';
  const stEl = $('#ln-state');
  const stMsg = LN.state === 'err' ? 'לא הצלחתי לטעון את ההלוואות. רענן את הדף.' : (!canW() ? 'צפייה בלבד: אין לך הרשאה להוסיף, לסמן תשלומים ולמחוק.' : '');
  stEl.hidden = !stMsg; stEl.className = 'note ' + (LN.state === 'err' ? 'err' : 'info'); stEl.textContent = stMsg;
  if (LN.state === 'wait' && !LN.list.length) { list.innerHTML = '<div class="empty small">טוען הלוואות…</div>'; $('#ln-detail').hidden = true; return; }
  if (!LN.list.length) { list.innerHTML = '<div class="empty"><b>אין עדיין הלוואות</b><br>לחץ על ״+ הלוואה חדשה״ כדי להוסיף את הראשונה.</div>'; $('#ln-detail').hidden = true; return; }
  list.innerHTML = LN.list.slice().sort((a, b) => String(b.created || '').localeCompare(String(a.created || ''))).map(L => {
    const st = lnStatus(L), unit = L.type === 'week' ? 'שבועית' : 'חודשית';
    return '<button class="ln-item" type="button" data-ln-id="' + esc(L.id) + '" aria-current="' + (L.id === LN.sel) + '"><span class="nm">' + esc(L.name) + '</span><span class="pill ' + st.cls + '">' + esc(st.txt) + '</span>' +
      '<span class="meta">' + lnMoney(L.amount) + ' · ' + unit + ' · <span class="num">' + esc(L.rate) + '%</span> · <span class="num">' + (st.paidN || 0) + '/' + lnNOf(L, st.s) + '</span> שולמו · תשלום ' + (st.s ? lnMoney(st.s.pay) : '') + '</span></button>';
  }).join('');
  lnRenderDetail();
}
const kp = (l, v, raw) => '<div class="kpi ln-kpi"><div class="l">' + l + '</div><div class="v' + (raw ? '' : ' num') + '">' + v + '</div></div>';
function lnRenderDetail() {
  const L = lnGet(LN.sel), box = $('#ln-detail'); if (!box) return;
  if (!L) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  const st = lnStatus(L), s = st.s, paid = L.paid || {}, t = todayISO();
  const ph = (LN.phoneDraft && LN.phoneDraft.id === L.id) ? LN.phoneDraft.val : (L.phone || '');
  if (!s) { box.innerHTML = '<div class="ln-dh"><h2>' + esc(L.name) + '</h2></div><div class="note err">לא הצלחתי לחשב את לוח הסילוקין של ההלוואה הזו.</div>' + lnDelHTML(L); return; }
  const paidRows = s.rows.filter(x => paid[x.i]), PT = lnPartTot(L, s);
  const paidSum = lnR2(paidRows.reduce((a, x) => a + x.payment, 0) + PT.a);
  const paidPrin = lnR2(paidRows.reduce((a, x) => a + x.principal, 0) + PT.p);
  const remain = lnR2(L.amount - paidPrin);
  const next = s.rows.find(x => !paid[x.i]);
  const pct = Math.round(100 * paidRows.length / s.rows.length);
  const unit = L.type === 'week' ? 'שבוע' : 'חודש';
  const can = canW(), busy = !!LN.busy[L.id];
  const P = LN.pdf && LN.pdf.id === L.id ? LN.pdf : null;
  box.innerHTML =
    '<div class="ln-dh"><div><h2>' + esc(L.name) + '</h2><div class="sub">ניתנה ב-<span class="num">' + lnD(L.date) + '</span> · ' + lnMoney(L.amount) + ' · <span class="num">' + esc(L.rate) + '%</span> ל' + unit + ' · ' + lnNOf(L, s) + ' תשלומים' + (L.mode === 'pay' ? ' · לפי החזר קבוע' : '') + '</div></div><span class="pill ' + st.cls + '">' + esc(st.txt) + '</span></div>' +
    '<div class="kpis" id="ln-kpis">' + kp('תשלום קבוע', lnFmt(s.pay)) + kp('יתרת קרן', lnFmt(remain)) + kp('שולם עד כה', lnFmt(paidSum)) + kp('נותר לשלם', lnFmt(lnR2(s.totalPay - paidSum))) + kp('התשלום הבא', next ? lnD(next.date) : '—', !next) + '</div>' +
    '<div class="ln-prog"><div class="bar" role="img" aria-label="שולמו ' + pct + ' אחוז מהתשלומים"><i style="width:' + pct + '%"></i></div><div class="small muted">' + paidRows.length + ' מתוך ' + s.rows.length + ' תשלומים שולמו (' + pct + '%)' + (PT.n ? ' · ' + PT.n + ' שולמו חלקית (' + lnFmt(PT.a) + ')' : '') + '</div></div>' +
    lnPayHTML(L, s) + '<div class="tbl-wrap ln-sched"><table class="ln-tbl" id="ln-tbl"><thead><tr><th>#</th><th>תאריך</th><th>יתרת פתיחה</th><th>תשלום</th><th>ריבית</th><th>קרן</th><th>יתרת סגירה</th><th>סטטוס</th></tr></thead><tbody>' +
    s.rows.map(x => {
      const p = paid[x.i], late = !p && x.date < t;
      return '<tr class="' + (p ? 'paid' : (late ? 'late' : '')) + '" data-row="' + x.i + '"><td><span class="num">' + x.i + '</span></td><td><span class="num">' + lnD(x.date) + '</span></td><td>' + lnMoney(x.open) + '</td><td>' + lnMoney(x.payment) + '</td><td>' + lnMoney(x.interest) + '</td><td>' + lnMoney(x.principal) + '</td><td>' + lnMoney(x.close) + '</td>' +
        '<td><button class="ln-pb' + (p ? ' on' : (late ? ' late' : '')) + (!p && lnPart(L, x.i).list.length ? ' part' : '') + '" type="button" data-ln-i="' + x.i + '"' + (can && !busy ? '' : ' disabled') + (p ? ' title="לחיצה פותחת ביטול של התשלום, עם סיבה"' : ' title="לחיצה מציגה את חלוקת התשלום לפני הרישום"') + '>' + (p ? '✓ שולם' : lnPartLbl(L, x, late)) + '</button></td></tr>';
    }).join('') +
    '</tbody><tfoot><tr><td colspan="3">סה״כ</td><td>' + lnMoney(s.totalPay) + '</td><td>' + lnMoney(s.totalInt) + '</td><td>' + lnMoney(L.amount) + '</td><td></td><td></td></tr></tfoot></table></div>' +
    lnHistHTML(L) + '<div class="ln-send" id="ln-send"><b>שליחת לוח הסילוקין ללקוח</b>' +
    '<div class="row"><label class="ln-fld" for="ln-d-phone">טלפון וואטסאפ של הלקוח<input class="in n" id="ln-d-phone" type="tel" inputmode="tel" autocomplete="off" placeholder="050-0000000" value="' + esc(ph) + '"' + (can ? '' : ' disabled') + '></label>' +
    '<button class="btn wa" type="button" id="ln-pdf"' + (P && P.busy ? ' disabled' : '') + '>' + (P && P.busy ? 'יוצר PDF…' : 'צור PDF ושלח בוואטסאפ') + '</button></div>' +
    '<div class="small muted" id="ln-send-msg">' + esc(P && P.msg ? P.msg : 'בטלפון ייפתח חלון שיתוף: בוחרים וואטסאפ ואת הלקוח. במחשב הקובץ יורד, ואז לוחצים ״פתח צ׳אט״ ומצרפים אותו.') + '</div>' +
    (P && (P.url || P.wa) ? '<div class="row">' + (P.canShare ? '<button class="btn ghost" type="button" id="ln-share">שתף את קובץ ה-PDF</button>' : '') + (P.url ? '<a class="btn ghost" id="ln-dl" href="' + esc(P.url) + '" download="' + esc(P.fname) + '">הורד את ה-PDF</a>' : '') + (P.wa ? '<a class="btn wa" id="ln-wa" href="' + esc(P.wa.href) + '" target="_blank" rel="noopener">' + esc(P.wa.label) + '</a>' : '') + '</div>' : '') +
    '</div>' + lnDelHTML(L);
}
function lnDelHTML(L) {
  // מחיקה רק על ידי בעל התוכנה, ורק אחרי אישור "כן, מחק"
  if (!isOwner()) return '';
  if (LN.delFor === L.id) return '<div class="ln-confirm"><span>למחוק את ההלוואה של ' + esc(L.name) + ' לצמיתות?</span><button class="btn danger sm" type="button" id="ln-del-yes">כן, מחק</button><button class="btn plain sm" type="button" id="ln-del-no">ביטול</button></div>';
  return '<div class="row"><button class="btn danger sm" type="button" id="ln-del">מחק הלוואה</button></div>';
}

// ---------------- רישום תשלום (מקור: 6705-6862) ----------------
const LN_UNDO_R = ['טעות ברישום', 'התשלום לא התקבל או חזר', 'תיקון תאריך התשלום', 'אחר'];
function lnPartLbl(L, x, late) {
  const q = lnPart(L, x.i); if (!q.list.length) return late ? 'בפיגור · סמן' : 'סמן כשולם';
  return 'חלקי ' + lnFmt(q.a) + ' מתוך ' + lnFmt(x.payment) + (late ? ' · בפיגור' : '');
}
function lnPayAsk(L, i) {
  if (!canW()) return toast('אין לך הרשאה לסמן תשלומים');
  if (LN.busy[L.id]) return;
  const paid = L.paid || {};
  LN.pay = { id: L.id, i, mode: paid[i] ? 'undo' : 'pay', kind: 'full', d: todayISO(), pi: '', pp: '', r: '', n: '', k: -1, err: '', opId: null };
  lnRenderDetail();
  setTimeout(() => { const p = $('#ln-payask'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 40);
}
function lnRemainNow(L, s) {
  const paid = L.paid || {}, prin = s.rows.filter(r => paid[r.i]).reduce((a, r) => a + r.principal, 0);
  return lnR2(L.amount - prin - lnPartTot(L, s).p);
}
const pk = (l, v) => '<div class="kpi ln-kpi"><div class="l">' + l + '</div><div class="v num">' + v + '</div></div>';
function lnPayHTML(L, s) {
  const P = LN.pay; if (!P || P.id !== L.id) return '';
  const x = s.rows.find(r => r.i === P.i); if (!x) return '';
  const paid = L.paid || {}, busy = !!LN.busy[L.id], q = lnPart(L, P.i), remain = lnRemainNow(L, s), t = todayISO();
  const btns = (ok, okCls, no) => '<div class="row"><button class="btn' + (okCls ? ' ' + okCls : '') + '" type="button" data-lnp="ok"' + (busy ? ' disabled' : '') + '>' + (busy ? 'שומר…' : ok) + '</button><button class="btn plain" type="button" data-lnp="cancel"' + (busy ? ' disabled' : '') + '>' + no + '</button></div>';
  const err = P.err ? '<div class="note err">' + esc(P.err) + '</div>' : '';
  const reasonUI = '<label class="ln-fld" for="ln-undo-r">סיבת הביטול (חובה)<select class="in" id="ln-undo-r"><option value="">בחר סיבה</option>' + LN_UNDO_R.map(r => '<option' + (P.r === r ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label>' +
    '<label class="ln-fld" for="ln-undo-n">הערה' + (P.r === 'אחר' ? ' (חובה)' : '') + '<input class="in" id="ln-undo-n" type="text" maxlength="200" value="' + esc(P.n) + '" placeholder="לדוגמה: הלקוח שילם רק חצי"></label>';
  const partList = q.list.length ? '<div class="ln-parts"><b class="small">תשלומים חלקיים שנרשמו (' + q.list.length + ')</b>' + q.list.map((r, k) => '<div class="ln-part"><span><span class="num">' + esc(lnD(r.d)) + '</span> · ' + lnMoney(r.a) + ' <span class="small muted">(קרן ' + lnFmt(r.p) + ' · ריבית ' + lnFmt(r.ii) + ')</span></span>' + (paid[P.i] ? '' : '<button class="btn plain sm" type="button" data-lnp="pundo" data-k="' + k + '"' + (busy ? ' disabled' : '') + '>ביטול</button>') + '</div>').join('') + '</div>' : '';
  if (P.mode === 'undo') return '<div class="ln-payask undo" id="ln-payask" role="group" aria-label="ביטול תשלום"><b>ביטול התשלום ' + x.i + ' (' + lnFmt(x.payment) + ') שסומן ב-' + lnD(String(paid[P.i]).slice(0, 10)) + '</b>' +
    '<div class="row">' + pk('יתרת קרן עכשיו', lnFmt(remain)) + pk('יתרת קרן אחרי הביטול', lnFmt(lnR2(remain + x.principal - q.p))) + '</div>' +
    (q.list.length ? '<span class="small muted">התשלומים החלקיים שנרשמו לתשלום הזה (' + lnFmt(q.a) + ') נשארים רשומים.</span>' : '') + reasonUI + err + btns('בטל את התשלום', 'danger', 'השאר כשולם') +
    '<span class="small muted">הביטול והסיבה נשמרים ביומן התשלומים של ההלוואה.</span></div>';
  if (P.mode === 'pundo') {
    const r = q.list[P.k]; if (!r) { LN.pay = null; return ''; }
    return '<div class="ln-payask undo" id="ln-payask" role="group" aria-label="ביטול תשלום חלקי"><b>ביטול תשלום חלקי של ' + lnFmt(r.a) + ' מ-' + lnD(r.d) + ' (תשלום ' + x.i + ')</b>' +
      '<div class="row">' + pk('יתרת קרן עכשיו', lnFmt(remain)) + pk('יתרת קרן אחרי הביטול', lnFmt(lnR2(remain + (+r.p || 0)))) + '</div>' + reasonUI + err + btns('בטל את התשלום החלקי', 'danger', 'חזרה') + '</div>';
  }
  const left = lnR2(x.payment - q.a), early = x.date > t;
  const seg = '<div class="ln-seg" role="group" aria-label="סוג התשלום"><button type="button" data-lnp="kfull" aria-pressed="' + (P.kind === 'full') + '">תשלום מלא</button><button type="button" data-lnp="kpart" aria-pressed="' + (P.kind === 'part') + '">תשלום חלקי</button></div>';
  const date = '<label class="ln-fld" for="ln-pay-d" style="flex:0 1 190px">תאריך התשלום<input class="in" id="ln-pay-d" type="date" max="' + t + '" value="' + esc(P.d) + '"></label>';
  let h = '<div class="ln-payask" id="ln-payask" role="group" aria-label="רישום תשלום"><b>רישום תשלום ' + x.i + ' מתוך ' + s.rows.length + ' · מועד ' + lnD(x.date) + (early ? ' · <span class="pill acc">תשלום מוקדם</span>' : '') + '</b>' + seg + partList;
  if (P.kind === 'full') {
    h += '<div class="kpis">' + pk('סכום התשלום', lnFmt(x.payment)) + pk('מזה ריבית', lnFmt(x.interest)) + pk('מזה קרן', lnFmt(x.principal)) + pk('יתרת קרן אחרי הרישום', lnFmt(lnR2(remain + q.p - x.principal))) + '</div>' +
      (q.list.length ? '<div class="note info small">כבר שולמו בחלקים ' + lnFmt(q.a) + '. סימון ״שולם״ סוגר את התשלום במלואו לפי לוח הסילוקין.</div>' : '') +
      (early ? '<div class="note info small">תשלום מוקדם נרשם כשולם, בלי לקצר ובלי להקטין את לוח הסילוקין.</div>' : '') +
      '<div class="row">' + date + '</div>' + err + btns('רשום תשלום', '', 'ביטול') + '<span class="small muted">החלוקה לפי לוח הסילוקין של ההלוואה. הרישום נשמר ביומן התשלומים.</span>';
  } else {
    const pi = +P.pi || 0, pp = +P.pp || 0, tot = lnR2(pi + pp);
    h += '<div class="row">' + pk('התשלום לפי הלוח', lnFmt(x.payment)) + pk('נותר לתשלום הזה', lnFmt(left)) + '</div>' +
      '<div class="ln-g2"><label class="ln-fld" for="ln-pay-i">ריבית ששולמה (₪)<input class="in n" id="ln-pay-i" type="number" inputmode="decimal" min="0" step="any" value="' + esc(P.pi) + '"></label>' +
      '<label class="ln-fld" for="ln-pay-p">קרן ששולמה (₪)<input class="in n" id="ln-pay-p" type="number" inputmode="decimal" min="0" step="any" value="' + esc(P.pp) + '"></label></div>' +
      '<div class="row">' + pk('סה״כ שולם עכשיו', lnFmt(tot)) + pk('יתרת קרן אחרי הרישום', lnFmt(lnR2(remain - pp))) + '</div>' +
      '<span class="small muted">מקלידים את החלוקה לקרן ולריבית כפי שהיא מופיעה בדוח ההכנסות.</span>' +
      '<div class="row">' + date + '</div>' + err + btns('רשום תשלום חלקי', '', 'ביטול');
  }
  return h + '</div>';
}
function lnHistHTML(L) {
  const H = Array.isArray(L.hist) ? L.hist.slice().reverse() : [];
  if (!H.length) return '';
  const w = iso => { try { const d = new Date(iso); return d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const T = { pay: 'רישום תשלום', undo: 'ביטול תשלום', part: 'תשלום חלקי', partundo: 'ביטול תשלום חלקי', offset: 'קוזזה בחידוש' };
  return '<details class="ln-hist" id="ln-hist"' + (H.length <= 6 ? ' open' : '') + '><summary>יומן תשלומים (' + H.length + ')</summary><div class="tbl-wrap"><table class="ln-tbl"><thead><tr><th>מתי</th><th>פעולה</th><th>תשלום</th><th>סכום</th><th>תאריך תשלום</th><th>פירוט / סיבה</th></tr></thead><tbody>' +
    H.map(h => '<tr class="' + (/undo/.test(h.t) ? 'late' : 'paid') + '"><td><span class="num">' + esc(w(h.at)) + '</span></td><td>' + (T[h.t] || esc(h.t)) + (h.e ? ' (מוקדם)' : '') + '</td><td><span class="num">' + esc(h.i) + '</span></td><td>' + lnMoney(h.a) + '</td><td><span class="num">' + esc(lnD(h.d)) + '</span></td><td>' +
      esc([(h.t === 'part' || h.t === 'partundo') ? 'קרן ' + lnFmt(h.p) + ' · ריבית ' + lnFmt(h.ii) : '', h.r, h.n].filter(Boolean).join(' · ')) + '</td></tr>').join('') +
    '</tbody></table></div></details>';
}
async function lnPayCommit(L) {
  const P = LN.pay; if (!P || P.id !== L.id || LN.busy[L.id]) return;
  const st = lnStatus(L), s = st.s; if (!s) return;
  const x = s.rows.find(r => r.i === P.i); if (!x) return;
  const paid = Object.assign({}, L.paid || {}), part = JSON.parse(JSON.stringify(L.part || {})), q = lnPart(L, P.i), now = new Date().toISOString();
  const okDate = () => /^\d{4}-\d{2}-\d{2}$/.test(P.d) && P.d <= todayISO();
  let entry, upd;
  if (P.mode === 'pay' && P.kind === 'full') {
    if (!okDate()) { P.err = 'בחר תאריך תשלום תקין (לא בעתיד).'; return lnRenderDetail(); }
    if (paid[P.i]) { LN.pay = null; lnRenderDetail(); return toast('התשלום הזה כבר רשום'); }
    paid[P.i] = P.d; entry = { t: 'pay', i: P.i, a: x.payment, d: P.d, at: now }; if (x.date > P.d) entry.e = 1; upd = { paid };
  } else if (P.mode === 'pay') {
    const pi = lnR2(+P.pi || 0), pp = lnR2(+P.pp || 0), tot = lnR2(pi + pp), left = lnR2(x.payment - q.a);
    if (!(pi >= 0) || !(pp >= 0) || !(tot > 0)) { P.err = 'הקלד את הריבית ואת הקרן ששולמו (לפחות אחד מהם גדול מ-0).'; return lnRenderDetail(); }
    if (!okDate()) { P.err = 'בחר תאריך תשלום תקין (לא בעתיד).'; return lnRenderDetail(); }
    if (paid[P.i]) { LN.pay = null; lnRenderDetail(); return toast('התשלום הזה כבר מסומן ״שולם״'); }
    if (tot >= left - 0.004) { P.err = 'הסכום מכסה את כל מה שנותר לתשלום הזה (' + lnFmt(left) + '). סמן אותו כ״תשלום מלא״.'; return lnRenderDetail(); }
    const rec = { a: tot, ii: pi, p: pp, d: P.d, at: now };
    part[P.i] = (Array.isArray(part[P.i]) ? part[P.i] : []).concat([rec]);
    entry = { t: 'part', i: P.i, a: tot, ii: pi, p: pp, d: P.d, at: now }; upd = { part };
  } else {
    if (!P.r) { P.err = 'בחר סיבה לביטול.'; return lnRenderDetail(); }
    if (P.r === 'אחר' && !P.n.trim()) { P.err = 'כתוב הערה שמסבירה את הביטול.'; return lnRenderDetail(); }
    if (P.mode === 'undo') {
      if (!paid[P.i]) { LN.pay = null; lnRenderDetail(); return; }
      entry = { t: 'undo', i: P.i, a: x.payment, d: String(paid[P.i]).slice(0, 10), r: P.r, n: P.n.trim(), at: now }; delete paid[P.i]; upd = { paid };
    } else {
      const r = (part[P.i] || [])[P.k]; if (!r) { LN.pay = null; lnRenderDetail(); return; }
      part[P.i].splice(P.k, 1); if (!part[P.i].length) delete part[P.i];
      entry = { t: 'partundo', i: P.i, a: +r.a || 0, ii: +r.ii || 0, p: +r.p || 0, d: r.d, r: P.r, n: P.n.trim(), at: now }; upd = { part };
    }
  }
  upd.hist = (Array.isArray(L.hist) ? L.hist : []).concat([entry]).slice(-500);
  const T = { pay: 'רישום תשלום', undo: 'ביטול תשלום', part: 'תשלום חלקי', partundo: 'ביטול תשלום חלקי' };
  LN.busy[L.id] = true; P.err = ''; lnRenderDetail();
  try {
    // הגיבוי שבמקור (bkEnsure) לפני שינוי מבנה מוחלף כאן ביומן השינויים בשרת: כל גרסה קודמת נשמרת שם במלואה
    await lnPut(L, upd, { action: T[entry.t], note: L.name + ' · תשלום ' + entry.i + ' · ' + lnFmt(entry.a) + (entry.r ? ' · ' + entry.r : '') });
    LN.pay = null;
    toast(entry.t === 'pay' ? 'התשלום נרשם: ' + lnFmt(x.payment) + (entry.e ? ' (מוקדם)' : '') : entry.t === 'part' ? 'התשלום החלקי נרשם: ' + lnFmt(entry.a) + ' (קרן ' + lnFmt(entry.p) + ', ריבית ' + lnFmt(entry.ii) + ')' : 'הביטול נרשם ביומן התשלומים');
  } catch (e) {
    if (e.status === 409) { LN.pay = null; toast(failMsg(e)); }
    else P.err = e.network ? failMsg(e) : 'השמירה נכשלה, ושום דבר לא נרשם: ' + failMsg(e);
  } finally { delete LN.busy[L.id]; lnRender(); }
}
function lnPayOnClick(e) {
  const b = e.target.closest('[data-lnp]'); if (!b || b.disabled) return false;
  const L = lnGet(LN.sel), P = LN.pay; if (!L || !P) return true;
  const a = b.getAttribute('data-lnp');
  if (a === 'cancel') { if (P.mode === 'pundo') { P.mode = 'pay'; P.err = ''; P.r = ''; P.n = ''; } else LN.pay = null; lnRenderDetail(); return true; }
  if (a === 'kfull' || a === 'kpart') { P.kind = a === 'kfull' ? 'full' : 'part'; P.err = ''; lnRenderDetail(); return true; }
  if (a === 'pundo') { P.mode = 'pundo'; P.k = +b.getAttribute('data-k'); P.r = ''; P.n = ''; P.err = ''; lnRenderDetail(); return true; }
  lnPayCommit(L); return true;
}
function lnPayOnInput(e) {
  const P = LN.pay; if (!P) return;
  const t = e.target; if (!t) return;
  if (t.id === 'ln-pay-d') P.d = t.value;
  else if (t.id === 'ln-undo-r') { if (P.r !== t.value) { P.r = t.value; P.err = ''; lnRenderDetail(); } }
  else if (t.id === 'ln-undo-n') P.n = t.value;
  else if (t.id === 'ln-pay-i' || t.id === 'ln-pay-p') { if (t.id === 'ln-pay-i') P.pi = t.value; else P.pp = t.value; lnPayLive(); }
}
// עדכון הסכומים בלי לבנות מחדש את השדות (כדי לא לאבד את הסמן בזמן הקלדה)
function lnPayLive() {
  const P = LN.pay, L = lnGet(LN.sel); if (!P || !L) return;
  const s = lnSchedule(L); if (!s) return;
  const box = $('#ln-payask'); if (!box) return;
  const ks = box.querySelectorAll('.row .kpi .v'); if (ks.length < 4) return;
  const pi = +P.pi || 0, pp = +P.pp || 0;
  ks[2].textContent = lnFmt(lnR2(pi + pp)); ks[3].textContent = lnFmt(lnR2(lnRemainNow(L, s) - pp));
}
async function lnDelete(L) {
  if (!isOwner()) return toast('רק בעל התוכנה יכול למחוק הלוואות');
  try { await save('DELETE', '/api/docs/loans/' + encodeURIComponent(L.id), {}, { label: 'מחיקת הלוואה', queue: false }); }
  catch (e) { return toast('המחיקה נכשלה: ' + failMsg(e)); }
  LN.list = LN.list.filter(x => x.id !== L.id);
  LN.sel = null; LN.delFor = null; LN.pay = null; toast('ההלוואה נמחקה'); lnRender();
}

// ---------------- PDF + וואטסאפ (מקור: 6864-6950) ----------------
async function lnSavePhone(L, phone) {
  if ((L.phone || '') === phone || !canW()) return;
  try { await lnPut(L, { phone }, { action: 'עדכון טלפון', note: L.name }); } catch (e) { toast('שמירת הטלפון נכשלה: ' + failMsg(e)); }
}
async function lnSendPdf(id) {
  const L = lnGet(id); if (!L || (LN.pdf && LN.pdf.busy)) return;
  const inp = $('#ln-d-phone'), phone = inp ? inp.value.trim() : (L.phone || '');
  LN.phoneDraft = null;
  await lnSavePhone(L, phone);
  if (LN.pdf && LN.pdf.url) try { URL.revokeObjectURL(LN.pdf.url); } catch { /* */ }
  LN.pdf = { id: L.id, busy: true, msg: '', wa: null }; lnRenderDetail();
  try {
    const cur = lnGet(id) || L;
    const blob = await lnBuildPdf(cur);
    const fname = 'לוח סילוקין - ' + String(cur.name).replace(/[\\/:*?"<>|]/g, '') + '.pdf';
    const file = new File([blob], fname, { type: 'application/pdf' });
    LN.pdf.file = file; LN.pdf.fname = fname; LN.pdf.url = URL.createObjectURL(blob);
    LN.pdf.canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    const n = lnWaNumber(phone), s = lnSchedule(cur), lastP = s.rows[s.rows.length - 1].payment;
    const text = 'שלום ' + cur.name + ', מצורף לוח הסילוקין שלך. סכום ההלוואה ' + lnFmt(cur.amount) + ', ' + s.rows.length + ' תשלומים של ' + lnFmt(s.pay) + (cur.mode === 'pay' && lastP !== s.pay ? ' (האחרון ' + lnFmt(lastP) + ')' : '') + ', תשלום ראשון ב-' + lnD(s.rows[0].date) + '.';
    LN.pdf.wa = { href: 'https://wa.me/' + (n || '') + '?text=' + encodeURIComponent(text), label: n ? 'פתח צ׳אט וואטסאפ עם ' + cur.name : 'פתח וואטסאפ (בחר איש קשר)' };
    LN.pdf.text = text;
    let shared = false;
    if (LN.pdf.canShare) {
      try { await navigator.share({ files: [file], title: fname }); shared = true; LN.pdf.msg = 'הקובץ שותף. אפשר לשתף שוב או לפתוח את הצ׳אט.'; }
      catch (e) { if (e && e.name === 'AbortError') LN.pdf.msg = 'השיתוף בוטל. אפשר ללחוץ ״שתף את קובץ ה-PDF״.'; }
    }
    if (!shared && !LN.pdf.msg) {
      const a = document.createElement('a'); a.href = LN.pdf.url; a.download = fname; a.hidden = true; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
      LN.pdf.msg = 'הקובץ מוכן. בטלפון: לחץ ״שתף את קובץ ה-PDF״ ובחר וואטסאפ. במחשב: פתח את הצ׳אט וצרף את הקובץ שירד.';
    }
  } catch (e) {
    LN.pdf.msg = 'יצירת ה-PDF נכשלה: ' + ((e && (e.message || e.code)) || 'שגיאה');
  } finally { if (LN.pdf) LN.pdf.busy = false; lnRenderDetail(); }
}
async function lnShareAgain() {
  const P = LN.pdf; if (!P || !P.file) return;
  try { await navigator.share({ files: [P.file], title: P.fname }); } catch (e) { if (!e || e.name !== 'AbortError') toast('השיתוף לא זמין במכשיר הזה. הורד את הקובץ וצרף אותו בצ׳אט.'); }
}

// ---------------- מסך ההלוואות ----------------
async function renderLoansPage(view, args) {
  lnCss();
  LN.state = 'wait'; LN.pay = null; LN.delFor = null; LN.phoneDraft = null;
  if (args && args[0]) LN.sel = args[0];
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">לוח סילוקין בריבית יורדת על יתרת הקרן · תשלום קבוע</div><h1>הלוואות</h1></div>
    ${canW() ? '<button class="btn" id="ln-new" type="button">+ הלוואה חדשה</button>' : ''}</div>
  <div class="card" id="ln-form" hidden>
    <h2>הלוואה חדשה</h2>
    <div class="grid">
      <label class="ln-fld" for="ln-f-name">שם הלווה<input class="in" id="ln-f-name" type="text" autocomplete="off" placeholder="לדוגמה: משה כהן"></label>
      <label class="ln-fld" for="ln-f-phone">טלפון וואטסאפ<input class="in n" id="ln-f-phone" type="tel" inputmode="tel" autocomplete="off" placeholder="050-0000000"></label>
      <label class="ln-fld" for="ln-f-amount">סכום ההלוואה (₪)<input class="in n" id="ln-f-amount" type="number" inputmode="decimal" min="0" step="any"></label>
      ${termsFieldsHTML('ln')}
      <label class="ln-fld" for="ln-f-date">תאריך מתן ההלוואה<input class="in" id="ln-f-date" type="date"></label>
    </div>
    ${termsOutHTML('ln')}
    <div class="row" style="margin-top:10px"><button class="btn" id="ln-save" type="button">שמור הלוואה</button><button class="btn plain" id="ln-cancel" type="button">ביטול</button></div>
    <div class="note err" id="ln-form-msg" hidden></div>
  </div>
  <div class="card"><div class="row sp"><h2>ההלוואות שלי</h2><span class="small muted" id="ln-n"></span></div>
    <div id="ln-state" class="note info" hidden></div>
    <div class="ln-items" id="ln-list"><div class="empty small">טוען הלוואות…</div></div></div>
  <div class="card" id="ln-detail" hidden></div>`;
  LNT = mountTerms(view, 'ln', { base: lnBase });
  ['name', 'amount', 'date'].forEach(k => $('#ln-f-' + k).addEventListener('input', lnPreview));
  const nb = $('#ln-new'); if (nb) nb.onclick = lnOpenForm;
  $('#ln-cancel').onclick = () => { $('#ln-form').hidden = true; };
  $('#ln-save').onclick = lnSave;
  $('#ln-list').addEventListener('click', e => {
    const b = e.target.closest('[data-ln-id]'); if (!b) return;
    if (LN.sel !== b.dataset.lnId) { LN.delFor = null; LN.phoneDraft = null; LN.pay = null; }
    LN.sel = b.dataset.lnId; lnRender();
    const d = $('#ln-detail'); if (d && !d.hidden) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const det = $('#ln-detail');
  det.addEventListener('click', e => {
    const L = lnGet(LN.sel); if (!L) return;
    if (lnPayOnClick(e)) return;
    const pb = e.target.closest('[data-ln-i]'); if (pb) { if (!pb.disabled) lnPayAsk(L, +pb.dataset.lnI); return; }
    if (e.target.closest('#ln-pdf')) { lnSendPdf(L.id); return; }
    if (e.target.closest('#ln-share')) { lnShareAgain(); return; }
    if (e.target.closest('#ln-del')) { LN.delFor = L.id; lnRenderDetail(); return; }
    if (e.target.closest('#ln-del-no')) { LN.delFor = null; lnRenderDetail(); return; }
    if (e.target.closest('#ln-del-yes')) { lnDelete(L); return; }
  });
  det.addEventListener('input', e => { if (e.target && e.target.id === 'ln-d-phone') LN.phoneDraft = { id: LN.sel, val: e.target.value }; });
  det.addEventListener('input', lnPayOnInput); det.addEventListener('change', lnPayOnInput);
  det.addEventListener('change', e => {
    if (!e.target || e.target.id !== 'ln-d-phone') return; const L = lnGet(LN.sel); if (!L) return;
    const v = e.target.value.trim(); lnSavePhone(L, v).then(() => { if (LN.phoneDraft && LN.phoneDraft.id === L.id && LN.phoneDraft.val.trim() === v) LN.phoneDraft = null; });
  });
  try { LN.list = await get('/api/docs/loans'); LN.state = 'on'; } catch (e) { LN.state = 'err'; if (e.status === 401) throw e; }
  if (LN.sel && !lnGet(LN.sel)) LN.sel = null;
  lnRender();
  if (args && args[0] && LN.sel) setTimeout(() => { const d = $('#ln-detail'); if (d && !d.hidden) d.scrollIntoView({ block: 'start' }); }, 60);
  // עדכון חי ממכשיר אחר — לא בזמן רישום תשלום או שמירה
  let tm = null;
  return onLive((ev) => {
    if (ev.col !== 'loans') return;
    clearTimeout(tm); tm = setTimeout(async () => {
      if (LN.pay || Object.keys(LN.busy).length || !$('#ln-list')) return;
      try { LN.list = await get('/api/docs/loans'); if (LN.sel && !lnGet(LN.sel)) LN.sel = null; lnRender(); } catch { /* */ }
    }, 250);
  });
}
route('loans-manage', renderLoansPage);
route('loans', renderLoansPage); // פעיל ברגע שהנתיב הישן של הליבה יוסר
more({ href: '#/loans-manage', label: 'הלוואות — לוח סילוקין, תשלומים ו-PDF', can: A => A.can.finance, order: 10 });

// ---------------- לוח בקרה: תיק ההלוואות ומשימות (מקור: 5699-5845) ----------------
export function hlData(list) {
  const t = todayISO(), w = addDays(t, 7), m = t.slice(0, 7);
  const out = { open: [], today: [], week: [], late: [], paidM: [], n: 0 };
  list.forEach(L => {
    const s = lnSum(L); if (!s) return; out.n++;
    if (!s.closed) out.open.push({ L, s });
    const paid = L.paid || {};
    s.s.rows.forEach(x => {
      if (paid[x.i]) { if (String(paid[x.i]).slice(0, 7) === m) out.paidM.push({ L, x, pd: String(paid[x.i]) }); return; }
      // תשלום ששולם חלקית: נספר מה שנכנס, ובמועד/בפיגור נשאר רק מה שנותר
      const q = lnPart(L, x.i);
      q.list.forEach(r => { if (String(r.d).slice(0, 7) === m) out.paidM.push({ L, x: Object.assign({}, x, { payment: +r.a || 0, principal: +r.p || 0, interest: +r.ii || 0, partA: 1 }), pd: String(r.d) }); });
      const xr = q.list.length ? Object.assign({}, x, { payment: lnR2(x.payment - q.a), principal: lnR2(Math.max(0, x.principal - q.p)), interest: lnR2(Math.max(0, x.interest - q.ii)), partA: q.a }) : x;
      if (x.date === t) out.today.push({ L, x: xr }); else if (x.date > t && x.date <= w) out.week.push({ L, x: xr }); else if (x.date < t) out.late.push({ L, x: xr });
    });
  });
  return out;
}
const hlSum = rows => ({ n: rows.length, a: r2(rows.reduce((s, r) => s + r.x.payment, 0)), p: r2(rows.reduce((s, r) => s + r.x.principal, 0)), i: r2(rows.reduce((s, r) => s + r.x.interest, 0)), loans: new Set(rows.map(r => r.L.id)).size });
const hlSplit = x => '<span>קרן ' + money(x.p) + ' · ריבית ' + money(x.i) + '</span>';
const hlTile = (key, l, v, sub, cls) => '<button type="button" class="kpi' + (cls ? ' ' + cls : '') + '" data-hl="' + key + '"><div class="l">' + esc(l) + '</div><div class="v">' + money(v) + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '<div class="kgo">פירוט ›</div></button>';
const tbl = (head, rows) => '<div class="tbl-wrap"><table><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td colspan="' + head.length + '" class="muted" style="text-align:center">אין נתונים</td></tr>') + '</tbody></table></div>';
const td = v => '<td>' + v + '</td>', tdn = v => '<td class="a">' + money(v) + '</td>';
const ddRow = (l, v, cls) => '<tr class="' + (cls || '') + '"><td>' + l + '</td><td class="a">' + money(v) + '</td></tr>';
const ddTbl = rows => '<div class="tbl-wrap" style="margin-top:8px"><table><tbody>' + rows.join('') + '</tbody></table></div>';
const kpiS = (l, v, sub, cls) => '<div class="kpi ln-kpi' + (cls ? ' ' + cls : '') + '"><div class="l">' + esc(l) + '</div><div class="v">' + money(v) + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
const openBtn = id => '<button class="btn plain sm" type="button" data-dd-loan="' + esc(id) + '">פתח</button>';
function hlRowsTbl(rows, opt) {
  opt = opt || {}; const t = todayISO();
  if (!rows.length) return '<div class="empty small">אין תשלומים ברשימה הזו.</div>';
  const s = hlSum(rows);
  return tbl(['לווה', 'תאריך', 'תשלום', 'סכום', 'קרן', 'ריבית'].concat(opt.late ? ['ימים'] : []).concat(opt.paid ? ['סומן'] : []).concat(['']),
    rows.map(r => '<tr>' + td(esc(r.L.name)) + td('<span class="num">' + esc(isoLabel(r.x.date)) + '</span>') + td('<span class="num">' + r.x.i + '/' + r.L_n + '</span>' + (r.x.partA ? ' <span class="pill warn">חלקי</span>' : '')) + tdn(r.x.payment) + tdn(r.x.principal) + tdn(r.x.interest) +
      (opt.late ? td('<span class="num">' + daysBetween(r.x.date, t) + '</span>') : '') + (opt.paid ? td('<span class="num">' + esc(isoLabel(r.pd)) + '</span>') : '') +
      td(openBtn(r.L.id)) + '</tr>')) +
    ddTbl([ddRow('סה״כ (' + s.n + ' תשלומים)', s.a, 'tot'), ddRow('מזה קרן', s.p), ddRow('מזה ריבית', s.i)]);
}
function ddOpen(title, sub, html) {
  const sh = openSheet(`<div class="hd"><div><h2 style="margin:0">${esc(title)}</h2>${sub ? `<div class="small muted">${esc(sub)}</div>` : ''}</div><button class="x" data-close aria-label="סגור">×</button></div>${html}`);
  sh.el.addEventListener('click', e => { const l = e.target.closest('[data-dd-loan]'); if (l) { sh.close(); location.hash = '#/loans-manage/' + encodeURIComponent(l.getAttribute('data-dd-loan')); } });
  return sh;
}
export function hlOpen(list, key) {
  const D = hlData(list), withN = a => a.map(r => Object.assign({}, r, { L_n: (lnSum(r.L) || { s: { rows: [] } }).s.rows.length })).sort((a, b) => a.x.date.localeCompare(b.x.date) || String(a.L.name).localeCompare(String(b.L.name), 'he'));
  const src = 'לפי לוחות הסילוקין של ההלוואות';
  if (key === 'open') {
    const rows = D.open.slice().sort((a, b) => b.s.remain - a.s.remain);
    const tot = r2(rows.reduce((a, o) => a + o.s.remain, 0));
    ddOpen('יתרת קרן פתוחה', src + ' · ' + rows.length + ' הלוואות פעילות',
      (rows.length ? tbl(['לווה', 'סכום ההלוואה', 'שולמו', 'קרן ששולמה', 'ריבית ששולמה', 'יתרת קרן', 'התשלום הבא', ''], rows.map(o => '<tr>' + td(esc(o.L.name)) + tdn(+o.L.amount || 0) + td('<span class="num">' + o.s.st.paidN + '/' + o.s.s.rows.length + '</span>') + tdn(o.s.paidPrin) + tdn(o.s.paidInt) + tdn(o.s.remain) + td(o.s.next ? '<span class="num">' + esc(isoLabel(o.s.next.date)) + '</span>' : '—') + td(openBtn(o.L.id)) + '</tr>')) +
        ddTbl([ddRow('סה״כ יתרת קרן פתוחה', tot, 'tot')]) : '<div class="empty small">אין הלוואות פעילות.</div>') +
      '<p class="small muted">יתרת הקרן = סכום ההלוואה פחות הקרן שבתשלומים שסומנו ״שולם״.</p>');
  }
  else if (key === 'today') ddOpen('לתשלום היום', src + ' · ' + isoLabel(todayISO()), hlRowsTbl(withN(D.today)));
  else if (key === 'week') ddOpen('לתשלום ב-7 הימים הבאים', src + ' · עד ' + isoLabel(addDays(todayISO(), 7)), hlRowsTbl(withN(D.week)));
  else if (key === 'late') {
    const rows = withN(D.late), t = todayISO(), b = [['1–7 ימים', 1, 7], ['8–30 ימים', 8, 30], ['31 ימים ומעלה', 31, 1e9]].map(([l, a, z]) => { const rs = rows.filter(r => { const d = daysBetween(r.x.date, t); return d >= a && d <= z; }); return { l, ...hlSum(rs) }; });
    ddOpen('תשלומים בפיגור', src + ' · תשלום שמועדו עבר ולא סומן ״שולם״',
      (rows.length ? '<div class="kpis">' + b.map(x => kpiS('פיגור ' + x.l, x.a, '<span>' + x.n + ' תשלומים</span>', x.n && x.l.indexOf('31') === 0 ? 'bad' : '')).join('') + '</div>' : '') + hlRowsTbl(rows, { late: true }));
  }
  else if (key === 'paid') ddOpen('שולם החודש', src + ' · תשלומים שסומנו ״שולם״ החודש', hlRowsTbl(withN(D.paidM), { paid: true }));
}
// משימות לטיפול (מקור: hlAlerts 5817 — החלק של ההלוואות; החוזים שייכים לחוזים)
export function hlTasks(list) {
  const al = [];
  if (list.length) {
    const D = hlData(list), lt = hlSum(D.late), td_ = hlSum(D.today);
    if (lt.n) al.unshift({ lv: 'hi', t: lt.n + ' תשלומי הלוואות בפיגור (' + lt.loans + ' הלוואות)', s: 'סה״כ ' + money(lt.a) + ' · קרן ' + money(lt.p) + ' · ריבית ' + money(lt.i), hl: 'late', b: 'לפירוט' });
    if (td_.n) al.push({ lv: 'mid', t: td_.n + ' תשלומי הלוואות להיום', s: 'סה״כ ' + money(td_.a), hl: 'today', b: 'לפירוט' });
  }
  return al;
}
// כרטיס ״תיק ההלוואות״ — אפשר להטמיע גם בלוח הבקרה של הדוחות: el.innerHTML = loanPortfolioHtml(list); bindLoanPortfolio(el, list)
export function loanPortfolioHtml(list) {
  lnCss();
  if (!list.length) return '<div class="card"><h2>תיק ההלוואות</h2><div class="empty small">אין עדיין הלוואות.</div></div>';
  const D = hlData(list), td_ = hlSum(D.today), wk = hlSum(D.week), lt = hlSum(D.late), pm = hlSum(D.paidM);
  const openP = r2(D.open.reduce((a, o) => a + o.s.remain, 0));
  const tasks = hlTasks(list);
  return '<div class="card" id="ln-port-card"><div class="row sp"><h2>תיק ההלוואות</h2><span class="small muted">' + D.open.length + ' פעילות מתוך ' + D.n + '</span></div>' +
    (tasks.length ? tasks.map(a => '<div class="note ' + (a.lv === 'hi' ? 'err' : a.lv === 'mid' ? 'warn' : 'info') + ' ln-task"><span><b>' + esc(a.t) + '</b><br><span class="small">' + a.s + '</span></span><button class="btn sm ghost" type="button" data-hl="' + a.hl + '">' + a.b + '</button></div>').join('') : '') +
    '<div class="kpis ln-pk">' +
    hlTile('open', 'יתרת קרן פתוחה', openP, '<span>' + D.open.length + ' הלוואות פעילות</span>') +
    hlTile('today', 'לתשלום היום', td_.a, td_.n ? '<span>' + td_.n + ' תשלומים</span> ' + hlSplit(td_) : '<span>אין תשלומים להיום</span>') +
    hlTile('week', 'ב-7 הימים הבאים', wk.a, '<span>' + wk.n + ' תשלומים</span> ' + (wk.n ? hlSplit(wk) : '')) +
    hlTile('late', 'בפיגור', lt.a, lt.n ? '<span>' + lt.n + ' תשלומים ב-' + lt.loans + ' הלוואות</span> ' + hlSplit(lt) : '<span>אין פיגורים</span>', lt.n ? 'bad' : 'good') +
    hlTile('paid', 'שולם החודש', pm.a, pm.n ? '<span>' + pm.n + ' תשלומים סומנו</span> ' + hlSplit(pm) : '<span>עוד לא סומנו תשלומים החודש</span>') +
    '</div><p class="small muted" style="margin:0">מחושב מלוחות הסילוקין של ההלוואות, בהפרדה בין קרן לריבית. הקרן הנוכחית מגיעה מחשבון הבוקר, בנפרד. לחיצה על כל נתון מציגה ממה הוא מורכב. <a href="#/loans-manage">להלוואות ›</a></p></div>';
}
export function bindLoanPortfolio(el, list) {
  el.addEventListener('click', e => { const h = e.target.closest('[data-hl]'); if (h) hlOpen(list, h.getAttribute('data-hl')); });
}
todayPanel((d, A) => {
  if (!A.can.finance) return '';
  setTimeout(async () => {
    const el = document.getElementById('ln-port'); if (!el || el.dataset.done) return; el.dataset.done = '1';
    try { const list = await get('/api/docs/loans'); if (!el.isConnected) return; el.innerHTML = loanPortfolioHtml(list); bindLoanPortfolio(el, list); }
    catch { el.innerHTML = ''; }
  }, 0);
  return '<div id="ln-port"><div class="card"><h2>תיק ההלוואות</h2><div class="empty small">טוען הלוואות…</div></div></div>';
});
