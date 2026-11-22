// השלמות מהתוכנה המקורית שעוד לא היו באפליקציה (ראו docs/PARITY.md):
// 1. איסוף יום: ״סדר לפי גובים״ (app.html 1349-1354, 3172-3191) — אותה חלוקה (arrangeCore) כמו במסך ההעברה, היסטוריה ב-settings/ar_hist.
// 2. הלוואות: ״ייצוא ל-Excel״ (ln-xlsx, app.html 1459, 5886) — גיליונות ההלוואות של הדוח הכללי.
// 3. חשבון גובים: ״PDF נפרד לכל גובה״ (app.html 1179-1183, 2478-2487, 6248).
// 4. מחיקת חשבון שמור — בעל התוכנה בלבד (app.html 5314, 5345-5365). המחיקה ניתנת לשחזור (גיבוי / יומן שינויים).
// אין כאן נוסחה כספית חדשה.
import { R, editorAction, accountAction, accountPanel } from '../registry.js';
import { get, save } from '../api.js';
import { $, $$, esc, fmt, toast, openSheet, todayISO } from '../ui.js';
import { App } from '../app.js';
import { num, normName, normStatus, cleanColl, collKey, calcCollectors, NOC, ST_GOT } from '../calc.js';
import { arrangeCore } from './split-tools.js';
import { xlSheet, xlLoanRows, xlDownload, xlD } from './imports-xl.js';
import { loadVendor } from '../registry.js';
import { reportHTML, shareText, sharePdf } from './reports-print.js';

const fin = (A) => !!(A.can && A.can.finance);

// ===================== 1. סדר לפי גובים (איסוף יום, בעורך) =====================
editorAction('work', {
  label: 'סדר לפי גובים',
  async run(state, redraw) {
    const ents = (state.entries ||= []);
    const used = [...new Set(ents.map(e => cleanColl(e.c)).filter(c => c && c !== NOC))];
    let hist = {}, histVer = null;
    try { const d = await get('/api/docs/settings/ar_hist'); hist = d.h || {}; histVer = d._version; } catch { /* עוד אין היסטוריה */ }
    const s = openSheet(`<div class="hd"><h2>סידור אוטומטי לפי גובים</h2><button class="x" data-close>×</button></div>
      <p class="small muted" style="margin:0">התוכנה מחלקת את החייבים בין הגובים בסדר אקראי. קודם כל מספר החייבים של כל גובה שווה, ובהפרש של לכל היותר חייב אחד. המאזן נשמר מיום ליום, כך שאם אתמול גובה אחד אסף יותר חייבים, היום החייב העודף עובר לגובה השני. בתוך זה הסכומים של הגובים קרובים ככל האפשר. כשכמה חייבים של אותו גובה באותה שעה, היא מפוזרת ברבע שעה. מי שכבר סומן ״נאסף״ לא זז.</p>
      <label class="f" style="margin-top:8px">הגובים (מופרדים בפסיק)<input class="in" id="ar-names" value="${esc((used.length >= 2 ? used : ['עידן', 'טאייה']).join(', '))}" autocomplete="off"></label>
      <div class="row" style="margin-top:10px"><button class="btn" id="ar-run" type="button">סדר לפי גובים</button><button class="btn plain" id="ar-undo" type="button" hidden>בטל את הסידור</button></div>
      <div id="ar-note" class="note ok" hidden style="margin-top:8px"></div>
      <p class="small muted">אחרי הסידור לחץ ״שמור״ בעורך כדי לשמור את הרשימה.</p>`);
    let undo = null, histPrev = null;
    const note = (t, cls) => { const n = $('#ar-note', s.el); n.hidden = false; n.className = 'note ' + (cls || 'ok'); n.textContent = t; };
    const saveHist = async (h) => {
      try { const o = await save('PUT', '/api/docs/settings/ar_hist', { data: { h, at: Date.now() }, baseVersion: histVer, action: 'איזון חלוקה בין ימים' }, { queue: false, label: 'איזון בין ימים' }); histVer = o.version; }
      catch (e) { if (e.status === 409) { try { const d = await get('/api/docs/settings/ar_hist'); histVer = d._version; const o = await save('PUT', '/api/docs/settings/ar_hist', { data: { h: { ...(d.h || {}), [state.date]: h[state.date] }, at: Date.now() }, baseVersion: histVer }, { queue: false }); histVer = o.version; } catch { /* */ } } }
    };
    $('#ar-run', s.el).onclick = async () => {
      const names = Array.from(new Set($('#ar-names', s.el).value.split(/[,;،\n]+/).map(x => cleanColl(x)).filter(Boolean)));
      if (names.length < 2) return note('כתוב לפחות שני גובים, מופרדים בפסיק.', 'warn');
      const valid = state.entries.filter(e => normName(e.n) || num(e.a));
      const pool = valid.filter(e => normStatus(e.s) !== ST_GOT);
      if (!pool.length) return note('אין שורות לסידור. הוסף חייבים לרשימה קודם.', 'warn');
      undo = state.entries.map(e => ({ e, c: e.c, cm: e.cm, u: e.u, t: e.t, had: { cm: 'cm' in e, u: 'u' in e } }));
      histPrev = JSON.parse(JSON.stringify(hist));
      const date = state.date || todayISO();
      const Rr = arrangeCore(valid, pool, names, date, hist), best = Rr.best, cum = Rr.cum, moved = Rr.moved;
      // שדות העזר של המסך המקורי (cm/u) לא נשמרים ברשימה השמורה (wAcc)
      undo.forEach(o => { if (!o.had.cm) delete o.e.cm; if (!o.had.u) delete o.e.u; });
      const finN = names.map(nm => valid.filter(e => cleanColl(e.c) === nm).length);
      const rec = {}; names.forEach((nm, k) => { rec[nm] = finN[k]; }); hist[date] = rec;
      const ks = Object.keys(hist).sort(); while (ks.length > 60) delete hist[ks.shift()];
      saveHist(hist);
      redraw();
      $('#ar-undo', s.el).hidden = false;
      const per = names.map((nm, k) => nm + ': ' + finN[k] + ' חייבים · ' + fmt(best.load[k]) + ' ₪').join(' · ');
      const mn = Math.min(...best.load), ratio = mn > 0 ? Math.max(...best.load) / mn : 0;
      const cumTxt = names.map((nm, k) => nm + ' ' + (cum[k] + finN[k])).join(' · ');
      note('הרשימה חולקה. ' + per + ' · הפרש בסכום: ' + fmt(best.g) + ' ₪' + (ratio ? ' (יחס ' + ratio.toFixed(2) + ')' : '') + (moved ? ' · ' + moved + ' שעות הוזזו ברבעי שעה' : '') + (Object.keys(hist).length > 1 ? ' · סה״כ מצטבר לאיזון בין הימים: ' + cumTxt : ''));
      toast('הרשימה חולקה בין הגובים');
    };
    $('#ar-undo', s.el).onclick = () => {
      if (!undo) return;
      undo.forEach(o => { o.e.c = o.c; o.e.t = o.t; if (o.had.cm) o.e.cm = o.cm; else delete o.e.cm; if (o.had.u) o.e.u = o.u; else delete o.e.u; if (o.c === undefined) delete o.e.c; if (o.t === undefined) delete o.e.t; });
      if (histPrev) { hist = histPrev; saveHist(hist); histPrev = null; }
      undo = null; $('#ar-undo', s.el).hidden = true; $('#ar-note', s.el).hidden = true; redraw(); toast('הסידור בוטל');
    };
  },
});

// ===================== 2. הלוואות: ייצוא ל-Excel =====================
async function loansXlsx(btn) {
  const prev = btn.textContent; btn.disabled = true; btn.textContent = 'מכין קובץ Excel…';
  try {
    const [list] = await Promise.all([get('/api/docs/loans'), loadVendor('xlsx.full.min.js')]);
    const X = window.XLSX; if (!X) throw new Error('xlsx');
    const LR = xlLoanRows(list);
    const wb = X.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    xlSheet(X, wb, 'הלוואות', ['לווה', 'טלפון', 'תאריך מתן', 'סכום', 'סוג', 'ריבית %', 'תשלומים', 'שולמו', 'קרן ששולמה', 'ריבית ששולמה', 'יתרת קרן', 'תשלומים בפיגור', 'סכום בפיגור', 'התשלום הבא', 'סטטוס'],
      LR.loans, [20, 13, 12, 12, 9, 8, 9, 8, 13, 13, 13, 13, 13, 12, 12], [3, 8, 9, 10, 12]);
    xlSheet(X, wb, 'תשלומי הלוואות', ['לווה', 'מספר תשלום', 'מועד', 'תשלום צפוי', 'קרן צפויה', 'ריבית צפויה', 'סטטוס', 'תאריך תשלום', 'שולם בפועל', 'קרן בפועל', 'ריבית בפועל', 'נותר'],
      LR.inst, [20, 11, 12, 13, 13, 13, 14, 13, 13, 12, 12, 12], [3, 4, 5, 8, 9, 10, 11]);
    xlSheet(X, wb, 'תזרים הלוואות', ['חודש', 'צפוי לפי הלוח', 'מזה קרן', 'מזה ריבית', 'התקבל בפועל', 'מזה קרן', 'מזה ריבית', 'פער (צפוי פחות בפועל)'],
      LR.fl, [14, 15, 13, 13, 15, 13, 13, 20], [1, 2, 3, 4, 5, 6, 7]);
    xlDownload(wb, 'הלוואות ' + todayISO().split('-').reverse().join('.') + '.xlsx');
    toast('קובץ ה-Excel נשמר');
  } catch (e) { toast(/טעינת רכיב נכשלה/.test(e && e.message || '') ? 'רכיב ה-Excel לא נטען. בדוק את החיבור ונסה שוב.' : 'יצירת קובץ ה-Excel נכשלה. נסה שוב.'); }
  finally { btn.disabled = false; btn.textContent = prev; }
}
for (const name of ['loans-manage', 'loans']) {
  const orig = R.routes[name]; if (!orig) continue;
  R.routes[name] = async (view, args, q) => {
    const out = await orig(view, args, q);
    const band = $('.band', view);
    if (band && fin(App) && !$('#ln-xlsx', view)) {
      const b = document.createElement('button'); b.className = 'btn ghost'; b.type = 'button'; b.id = 'ln-xlsx'; b.textContent = 'ייצוא ל-Excel';
      b.onclick = () => loansXlsx(b);
      const nb = $('#ln-new', band); if (nb) band.insertBefore(b, nb); else band.appendChild(b);
    }
    return out;
  };
}

// ===================== 3. חשבון גובים: PDF נפרד לכל גובה =====================
// cCollAcc (app.html 2479): החובות וההוצאות של גובה אחד בלבד
const cCollAcc = (acc, name) => { const pick = e => { const c = String(e.c || '').trim(); return name === NOC ? !c : c === name; }; return { kind: 'collectors', date: acc.date, coll: name, entries: (acc.entries || []).filter(pick) }; };
accountPanel('collectors', (ctx) => {
  if (!fin(App)) return '';
  const gs = (ctx.a.entries || []).length ? calcCollectors(ctx.a.entries).groups : [];
  if (!gs.length) return '';
  return `<div class="card no-print" id="c-per-panel"><h2>PDF נפרד לכל גובה</h2><p class="small muted" style="margin:0 0 8px">כל גובה מקבל קובץ PDF משלו, עם רשימת החייבים וההוצאות שלו בלבד, והנטו שלו. לחץ על שם הגובה ושלח לו את הקובץ בוואטסאפ.</p>
    <div class="row" id="c-per">${gs.map(g => `<button class="btn ghost" type="button" data-cper="${esc(g.c)}">PDF · ${esc(g.c)} (${g.debts.length})</button>`).join('')}</div><div id="c-share" style="margin-top:8px"></div></div>`;
}, (ctx) => {
  const p = $('#c-per-panel', ctx.view); if (!p) return;
  p.addEventListener('click', (e) => { const b = e.target.closest('[data-cper]'); if (!b) return; const a = cCollAcc(ctx.a, b.dataset.cper); sharePdf(reportHTML(a), a, shareText(a), $('#c-share', p), b); });
});

// ===================== 4. מחיקת חשבון שמור (בעל התוכנה) =====================
accountAction('*', {
  label: 'מחיקת רישום',
  can: (A) => A.me && A.me.role === 'owner',
  async run(ctx) {
    // אותה פעולה כמו ״מחיקת רישום״ במסך ״חשבונות״: מחיקה + ביטול ההשפעה על הקרן, בטרנזקציה אחת
    const { openRemoveSheet } = await import('../acc-remove.js');
    openRemoveSheet(ctx.a.id, () => { location.hash = '#/accounts'; });
  },
});
