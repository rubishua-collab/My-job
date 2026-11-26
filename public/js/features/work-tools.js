// איסוף יום — כלים נוספים (מקור: app.html 1312-1396 ו-2497-3246):
// טקסט/PDF/וואטסאפ לכל גובה, הוצאה מהירה לגובה, עמלת שליח מקושרת (lk), העברה לחשבון גובים בסוף היום,
// מילוי טלפון/גובה/קשה מספר הטלפונים, ניקוי כפילויות, הוספה מטקסט ומצילום מסך; מאגר לקוחות והקמת לקוח מתוך פיצול.
// אין כאן נוסחה כספית חדשה: כל הסיכומים מ-calcWork/workGroups (calc.js), הטקסט וה-PDF הועתקו מהמקור.
import { route, more, accountAction, accountPanel, editorAction, R } from '../registry.js';
import { get, save, uid } from '../api.js';
import { givenOf } from './loans-box.js';
import { $, $$, esc, toast, openSheet } from '../ui.js';
import { num, r2, sum, normName, normTime, normStatus, cleanColl, collKey, workGroups, wExpList, calcWork, ST_GOT, NOC_SP } from '../calc.js';
import { BOOK, bookSize, knownCollectors, fillFromBook, workText, wCollText, wCollAcc, workHTML, parseWorkText, PROMPT_W, normalizeW, wDupKey, wSameKey, wDupInfo, lgx, LGF_W, LGF_X, fmt } from './work-tools-lib.js';
import { ensureStyle, sharePdf, resave } from './work-tools-pdf.js';
import { loadBook, splitClientSheet, renderClientsDb } from './work-tools-clients.js';
import { App } from '../app.js';

const fin = (App) => !!(App.can && App.can.finance);

// מקור: copyText (שורה 4309)
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* */ }
  try { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return !!ok; } catch (e) { return false; }
}
// החשבון בצורה שהמקור שמר (wAcc, שורה 2638): רק שורות עם שם או סכום
const accOf = (a) => ({ kind: 'work', date: a.date, entries: (a.entries || []).filter(e => e && (e.n || e.a)), expenses: (a.expenses || []).filter(x => x && (x.n || x.a)) });
const hasContent = (a) => a.entries.length > 0 || !!(a.expenses && a.expenses.length);

// שמירת שינוי בחשבון שמור: קוראים את הגרסה העדכנית, משנים, שומרים. התנגשות (409) — ניסיון אחד נוסף על הגרסה החדשה
async function putAcc(id, mutate, label, opId = uid()) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await get('/api/accounts/' + id);
    const out = mutate(a); if (out === false) return null;
    const data = { ...a }; ['prev', '_version', '_updatedAt', '_updatedBy', 'id'].forEach(k => delete data[k]);
    try { await save('PUT', '/api/accounts/' + id, { data, baseVersion: a._version, opId: opId + ':' + attempt, note: label }, { label, queue: false }); return out; }
    catch (e) { if (e.status !== 409 || attempt) throw e; }
  }
}
const errMsg = (e) => e.network ? 'לא נשמר בגלל בעיית קליטה. נסה שוב — הפעולה לא תירשם פעמיים.' : e.message;

// ===================== 1. PDF או העתקה נפרדת לכל גובה (savedWPerHTML שורה 5280, renderWPer 2952) =====================
accountPanel('work', (ctx) => {
  if (!fin(App)) return '';
  const acc = accOf(ctx.a); if (!hasContent(acc)) return '';
  ensureStyle();
  const gs = workGroups(acc.entries, wExpList(acc));
  const list = gs ? gs.map(g => ({ name: g.name, n: g.calc.count, t: g.calc.total })) : [{ name: '', n: calcWork(acc.entries).count, t: 0 }];
  const txt = name => name ? wCollText(acc, name) : workText(acc);
  return `<div class="card no-print" id="wt-per-panel"><div class="row sp"><h2>PDF או העתקה נפרדת לכל גובה</h2><span class="small muted">כל גובה מקבל רק את הרשימה שלו</span></div>
    <p class="small muted" style="margin:0 0 8px">כל גובה מקבל את הבלוק שלו בלבד, עם הרשימה וההוצאות שלו. לחץ על שם הגובה ל־PDF, או על ״העתק״ כדי להעתיק את הבלוק שלו כטקסט ולהדביק לו בוואטסאפ.</p>
    <div class="wt-per">${list.map(g => `<span class="wt-perg"><button class="btn ghost sm" type="button" data-wper="${esc(g.name)}">PDF · ${esc(g.name || 'כל הרשימה')}${g.n ? ' (' + g.n + ')' : ''}</button><button class="btn ghost sm" type="button" data-wcp="${esc(g.name)}" aria-label="העתק את הרשימה של ${esc(g.name || 'כל הרשימה')}">העתק</button><a class="btn wa sm" href="https://wa.me/?text=${encodeURIComponent(txt(g.name))}" target="_blank" rel="noopener" aria-label="שלח בוואטסאפ את הרשימה של ${esc(g.name || 'כל הרשימה')}">וואטסאפ</a></span>`).join('')}</div>
    ${gs ? `<div class="row" style="margin-top:10px"><button class="btn ghost sm" type="button" data-wcp-all="1">העתק רשימה</button><button class="btn ghost sm" type="button" data-wpdf-all="1">PDF לוואטסאפ</button></div>` : ''}
    <div id="wt-share" style="margin-top:8px"></div></div>`;
}, (ctx) => {
  const p = $('#wt-per-panel', ctx.view); if (!p) return;
  const acc = () => accOf(ctx.a); const box = $('#wt-share', p);
  p.addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-wcp]');
    if (cp) { const n = cp.dataset.wcp; toast((await copyText(n ? wCollText(acc(), n) : workText(acc()))) ? (n ? 'הבלוק של ' + n + ' הועתק' : 'הרשימה הועתקה') : 'ההעתקה נחסמה. סמן את הטקסט והעתק ידנית'); return; }
    if (e.target.closest('[data-wcp-all]')) { toast((await copyText(workText(acc()))) ? 'הרשימה הועתקה' : 'ההעתקה נחסמה. סמן את הטקסט והעתק ידנית'); return; }
    const b = e.target.closest('[data-wper]');
    if (b) { const n = b.dataset.wper; const a = n ? wCollAcc(acc(), n) : acc(); await sharePdf(workHTML(a), a, workText(a), box, b); return; }
    const all = e.target.closest('[data-wpdf-all]');
    if (all) { // PDF של כל החשבון: מהנתונים השמורים בשרת, עם ״הלוואות שנמסרו ללקוחות״
      let src = ctx.a; try { src = await get('/api/accounts/' + ctx.a.id); } catch { /* בלי קליטה — מה שמוצג במסך */ }
      const a = { ...accOf(src), loans: givenOf(src) };
      await sharePdf(workHTML(a), a, workText(a), box, all); return;
    }
    if (e.target.closest('[data-wt-resave]')) resave();
  });
});

// ===================== 2. הוצאות של גובה — הוספה מהירה (xCollOptions 2990, w-x-add 3204) =====================
const NOX = '__none';
function xCollOptions(entries, cur) {
  const used = Array.from(new Set(entries.map(e => String(e.c || '').trim()).filter(Boolean)));
  const list = used.concat(knownCollectors().filter(x => used.indexOf(x) < 0));
  return '<option value="">בחר גובה</option>' + list.map(v => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '<option value="' + NOX + '"' + (cur === NOX ? ' selected' : '') + '>ללא גובה</option>';
}
// ״הוצאות של גובה״ — כרטיס משותף לכל הלשוניות (public/js/expenses-card.js): כמה הוצאות, שמירה בלי לצאת, וכל הוצאות התאריך
const expensesAction = {
  label: 'הוצאות של גובה', can: (App) => fin(App),
  async run(ctx) {
    const isColl = ctx.a.kind === 'collectors';
    const { openExpensesCard } = await import('../expenses-card.js');
    openExpensesCard({ date: ctx.a.date, workId: ctx.a.kind === 'work' ? ctx.a.id : undefined, collId: isColl ? ctx.a.id : undefined, preColl: ctx.coll || '', onChange: () => ctx.reload() });
  },
};
accountAction('work', expensesAction);
(R.accountActions.collectors ||= []).unshift(expensesAction);

// ===================== 3. עמלת שליח / הוצאה מקושרת לאיסוף (lk) — מקור: lgOpenRec 10381, lgSaveRec 10477 (חלק העמלה) =====================
const LG_SELF = '@';
const stripInv = v => String(v == null ? '' : v).replace(/[​-‏‪-‮⁦-⁩﻿­]/g, '').replace(/\s+/g, ' ').trim();
const lgHasV = v => v !== undefined && v !== null && v !== '';
function lgSetOpt(e, k, v) { if (lgHasV(v)) e[k] = v; else delete e[k]; }
function lgByNorm(v, rc) { const s = stripInv(v); if (!s) return ''; if (s === LG_SELF) return LG_SELF; if (rc && collKey(s) === collKey(rc)) return LG_SELF; return s; }
accountAction('work', {
  label: 'עמלת שליח', can: (App) => fin(App),
  run(ctx) {
    const es = (ctx.a.entries || []).filter(e => e && (e.n || e.a));
    if (!es.length) return toast('אין שורות ברשימה');
    const feeOf = (e) => e.lk ? (ctx.a.expenses || []).find(x => x && x.lk === e.lk) : null;
    const s = openSheet(`<div class="hd"><h2>הוצאה או עמלת שליח לאיסוף</h2><button class="x" data-close>×</button></div>
      <label class="f">האיסוף<select class="in" id="fe-e">${es.map(e => `<option value="${esc(e._k)}">${esc(e.n || '(ללא שם)')} · ${fmt(num(e.a))} ₪${cleanColl(e.c) ? ' · ' + esc(cleanColl(e.c)) : ''}${feeOf(e) ? ' · יש עמלה ' + fmt(num(feeOf(e).a)) + ' ₪' : ''}</option>`).join('')}</select></label>
      <div id="fe-info" class="small muted" style="margin:6px 0"></div>
      <div class="grid"><label class="f">סכום<input class="in n" id="fe-a" inputmode="decimal" placeholder="0"></label><label class="f">תיאור<input class="in" id="fe-n" value="עמלת שליח"></label></div>
      <label class="row" style="margin-top:8px;font-weight:600"><input type="checkbox" id="fe-f" class="ck" checked> שולם מתוך כספי האיסוף</label>
      <p class="small muted">ההוצאה נרשמת פעם אחת, בקבוצה של מי שאסף, ויורדת גם מהנטו של הגובה. סכום 0 מסיר עמלה קיימת.</p>
      <div id="fe-err"></div><button class="btn xl" id="fe-save">שמור</button>`);
    const sel = $('#fe-e', s.el);
    const fill = () => {
      const e = es.find(x => x._k === sel.value); const f = e && feeOf(e);
      $('#fe-a', s.el).value = f ? String(num(f.a)) : ''; $('#fe-n', s.el).value = f ? (f.n || 'עמלת שליח') : 'עמלת שליח'; $('#fe-f', s.el).checked = f ? !f.nf : true;
      $('#fe-info', s.el).textContent = e ? ('גובה אחראי: ' + (cleanColl(e.c) || 'ללא גובה') + ' · אסף בפועל: ' + (e.by === '@' ? 'הגובה עצמו' : (e.by || 'לא צוין')) + (f ? ' · עמלה קיימת: ' + fmt(num(f.a)) + ' ₪' : '')) : '';
    };
    sel.onchange = fill; fill();
    const opId = uid();
    $('#fe-save', s.el).onclick = async (ev) => {
      const key = sel.value; const fee = r2(num($('#fe-a', s.el).value)); const feen = stripInv($('#fe-n', s.el).value) || 'עמלת שליח'; const feef = $('#fe-f', s.el).checked;
      if (fee < 0) { $('#fe-err', s.el).innerHTML = '<div class="note err">סכום לא יכול להיות שלילי</div>'; return; }
      ev.target.disabled = true;
      try {
        const res = await putAcc(ctx.a.id, (acc) => {
          const e = (acc.entries || []).find(x => x._k === key); if (!e) throw new Error('האיסוף לא נמצא. נסה שוב');
          const rc = cleanColl(e.c), by = lgByNorm(e.by, rc);
          const cur = e.lk ? (acc.expenses || []).find(x => x && x.lk === e.lk) : null;
          const I = cur ? { fee: num(cur.a), feen: cur.n, feef: !cur.nf } : { fee: 0, feen: 'עמלת שליח', feef: true };
          const feeCh = Math.abs(fee - I.fee) > 0.004 || (fee > 0 && (feen !== I.feen || feef !== I.feef));
          if (!feeCh) return 'לא היו שינויים';
          let lk = e.lk; const needLk = fee > 0 && !cur && !lk; if (needLk) { lk = 'L' + Date.now().toString(36) + uid(); e.lk = lk; }
          if (cur && fee < 0.005) { acc.expenses = acc.expenses.filter(x => x !== cur); delete e.lk; return 'העמלה הוסרה'; }
          if (cur) { cur.n = feen; cur.a = fee; cur.c = rc; lgSetOpt(cur, 'by', by); if (feef) delete cur.nf; else cur.nf = 1; return 'העמלה עודכנה'; }
          if (fee > 0.004) { const o = { n: feen, a: fee, c: rc }; lgSetOpt(o, 'by', by); o.lk = lk; if (!feef) o.nf = 1; (acc.expenses ||= []).push(o); return 'העמלה נרשמה: ' + fmt(fee) + ' ₪'; }
          return 'לא היו שינויים';
        }, 'עמלת שליח', opId);
        s.close(); await ctx.reload(); toast(res || 'נשמר');
      } catch (e) { ev.target.disabled = false; $('#fe-err', s.el).innerHTML = `<div class="note err">${esc(errMsg(e))}</div>`; }
    };
  },
});

// ===================== 4. סיום יום · העברה לחשבון גובים (wTocRows 2967, doToc 2974) =====================
function wTocRows(a, only) {
  const entries = a.entries.map(e => ({ ...e, n: String(e.n || '').trim(), a: num(e.a), t: normTime(e.t), s: normStatus(e.s) }));
  const debts = entries.filter(e => (e.n || e.a) && (!only || e.s === ST_GOT)).map(e => { const part = e.s === ST_GOT && e.ga !== undefined && e.ga !== null && e.ga !== ''; const x = lgx(e, LGF_W); delete x.ga; return Object.assign({ k: 'd', n: e.n || '(ללא שם)', a: part ? num(e.ga) : num(e.a), c: cleanColl(e.c) }, x, part && Math.abs(num(e.ga) - num(e.a)) > 0.004 ? { due: num(e.a) } : {}, normTime(e.t) ? { t: normTime(e.t) } : {}); });
  const exps = (a.expenses || []).map(x => ({ ...x, n: String(x.n || '').trim(), a: num(x.a) })).filter(x => x.n || x.a).map(x => Object.assign({ k: 'e', n: x.n || 'הוצאה', a: num(x.a), c: cleanColl(x.c) }, lgx(x, LGF_X), x._k ? { xk: x._k } : {}, x.t ? { t: x.t } : {}));
  return { debts, exps, date: a.date };
}
accountAction('work', {
  label: 'העבר לחשבון גובים', can: (App) => fin(App),
  async run(ctx) {
    const acc = accOf(ctx.a);
    const s = openSheet(`<div class="hd"><h2>סיום יום · העברה לחשבון גובים</h2><button class="x" data-close>×</button></div>
      <p class="small muted" style="margin:0">בסוף יום האיסוף, לחיצה אחת מעבירה את כל הרשימה לחשבון גובים: כל חייב נכנס כחוב אצל הגובה שלו, וההוצאות נכנסות כהוצאות של אותו גובה. שם משנים מה שצריך ושומרים.</p>
      <label class="row" style="margin-top:10px;font-weight:600"><input type="checkbox" id="w-toc-got" class="ck"> להעביר רק שורות שסומנו ״נאסף״</label>
      <div id="w-toc-n" class="small muted" style="margin:6px 0"></div><div id="w-toc-w"></div>
      <button class="btn xl" id="w-toc">העבר לחשבון גובים</button>`);
    const upd = () => { const r = wTocRows(acc, $('#w-toc-got', s.el).checked); $('#w-toc', s.el).disabled = !r.debts.length && !r.exps.length; $('#w-toc-n', s.el).textContent = (r.debts.length || r.exps.length) ? (r.debts.length + ' חובות · ' + fmt(sum(r.debts.map(e => e.a))) + ' ₪' + (r.exps.length ? ' · ' + r.exps.length + ' הוצאות' : '')) : 'אין שורות להעברה'; };
    $('#w-toc-got', s.el).onchange = upd; upd();
    const same = (await get('/api/accounts?kind=collectors').catch(() => [])).filter(x => x.date === acc.date);
    if (same.length) $('#w-toc-w', s.el).innerHTML = `<div class="note warn">כבר יש חשבון גובים לתאריך הזה: ${same.map(x => `<a href="#/acc/${esc(x.id)}">${esc(x.title)}</a>`).join(', ')}. ההעברה תעדכן את החשבון הקיים — שורות מהעברה קודמת והוצאות משותפות מוחלפות, בלי כפילות. חשבון גובים נוסף.</div>`;
    const opId = uid();
    $('#w-toc', s.el).onclick = async (ev) => {
      const r = wTocRows(acc, $('#w-toc-got', s.el).checked); if (!r.debts.length && !r.exps.length) return toast('אין שורות להעברה');
      ev.target.disabled = true;
      try {
        // חשבון גובים קיים לתאריך — מעדכנים אותו: שורות מהעברה קודמת של הרשימה הזו והוצאות משותפות מוחלפות (לא נספרות פעמיים); שורות ידניות נשארות
        const ex = (await get('/api/accounts?kind=collectors').catch(() => [])).filter(x => x.date === r.date).sort((p, q) => (q.updatedAt || 0) - (p.updatedAt || 0));
        const id = ex.length ? ex[0].id : (await save('POST', '/api/accounts', { kind: 'collectors', date: r.date, opId: opId + ':new' }, { label: 'פתיחת חשבון גובים', queue: false })).id;
        const src = ctx.a.id, keys = new Set(r.exps.map(x => x.xk).filter(Boolean));
        await putAcc(id, (c) => { c.entries = (c.entries || []).filter(e => e && e.wsrc !== src && !(e.xk && keys.has(e.xk))).concat(r.debts.map(d => ({ ...d, wsrc: src })), r.exps.map(x => ({ ...x, wsrc: src }))); }, 'העברה מ' + (ctx.a.title || 'איסוף יום'), opId);
        s.close(); toast('הועברו ' + r.debts.length + ' חובות' + (r.exps.length ? ' ו-' + r.exps.length + ' הוצאות' : '') + ' לחשבון גובים. בדוק ושמור.');
        location.hash = '#/acc/' + id + '?edit=1';
      } catch (e) { ev.target.disabled = false; toast(errMsg(e)); }
    };
  },
});

// ===================== 5. עורך רשימת איסוף: מילוי מספר הטלפונים, כפילויות, טקסט, צילום מסך =====================
editorAction('work', {
  label: 'מילוי טלפון, גובה וקשה מהפיצול',
  async run(state, redraw) {
    try { await loadBook(false); } catch (e) { return toast(e.message); }
    if (!bookSize()) return toast('אין עדיין טלפונים לשליפה. שמור פיצול עם טלפונים, והטלפונים יתמלאו כאן.');
    const n = fillFromBook(state.entries || []); redraw();
    const named = (state.entries || []).filter(e => e && normName(e.n)), withP = named.filter(e => String(e.p || '').trim()).length;
    toast((n.h ? 'קשה / לא קשה הועבר מהפיצול ל-' + n.h + ' שורות · ' : '') + (n.c ? 'גובה ל-' + n.c + ' שורות · ' : '') + 'טלפון נמצא ל-' + withP + ' מתוך ' + named.length + ' שורות' + (n.a ? ' · ' + n.a + ' התאמות חלקיות בשם (כדאי לבדוק)' : '') + (n.amb ? ' · ' + n.amb + ' עם כמה מספרים אפשריים (נשארו ריקות)' : ''), 6000);
  },
});
// מקור: refreshWFlags (2872) — האזהרות ורשימת הכפילויות; ניקוי (3123) והסרת זהות (3140)
function flagsHTML(es) {
  let noT = 0, badT = 0, dup = 0; const di = wDupInfo(es);
  es.forEach(e => {
    const raw = String(e.t || '').trim(), miss = !normStatus(e.s) && !normTime(raw);
    const isDup = (normName(e.n) || num(e.a)) && di.cnt.get(wDupKey(e)) > 1;
    if (miss && (normName(e.n) || num(e.a))) { if (raw) badT++; else noT++; } if (isDup) dup++;
  });
  const parts = [];
  if (dup) parts.push(dup + ' שורות עם אותו שם ואותו סכום – בדוק אם זו כפילות');
  if (noT) parts.push(noT + ' שורות בלי שעה (יופיעו בסוף הרשימה)');
  if (badT) parts.push(badT + ' שורות עם שעה לא תקינה (יופיעו בסוף הרשימה)');
  if (es.some(e => String(e.c || '').trim())) { const nc = es.filter(e => (normName(e.n) || num(e.a)) && !String(e.c || '').trim()).length; if (nc) parts.push(nc + ' שורות בלי גובה (יופיעו ברשימה נפרדת ״ללא גובה״)'); }
  const dg = new Map();
  es.forEach(e => {
    if (!normName(e.n) && !num(e.a)) return; const k = wDupKey(e); if (!(di.cnt.get(k) > 1)) return;
    if (!dg.has(k)) dg.set(k, { n: String(e.n || '').trim(), a: num(e.a), cnt: 0, t: [], c: [] });
    const g = dg.get(k); g.cnt++;
    g.t.push(normStatus(e.s) || normTime(e.t) || 'בלי שעה');
    const cc = String(e.c || '').trim(); if (cc && g.c.indexOf(cc) < 0) g.c.push(cc);
  });
  let wh = parts.map(esc).join(' · ');
  if (dg.size) wh += '<div class="wt-dup"><div style="margin-top:6px"><b>הכפילויות (' + dg.size + '):</b></div><ol>' + Array.from(dg.values()).map(g => '<li><b>' + esc(g.n || '(בלי שם)') + '</b> · <span class="num">' + fmt(g.a) + ' ₪</span> · ' + g.cnt + ' פעמים <span class="small">(' + esc(g.t.join(', ')) + (g.c.length ? ' · ' + esc(g.c.join(', ')) : '') + ')</span></li>').join('') + '</ol></div>';
  let ex = 0; di.cnt.forEach(v => { if (v > 1) ex += v - 1; });
  return { html: wh, ex, removable: di.removable, any: !!parts.length };
}
editorAction('work', {
  label: 'בדיקת כפילויות ושורות חסרות',
  run(state, redraw) {
    ensureStyle();
    let undo = null;
    const s = openSheet('<div class="hd"><h2>שורות לבדיקה</h2><button class="x" data-close>×</button></div><div id="wf"></div>');
    const draw = () => {
      const es = (state.entries ||= []); const f = flagsHTML(es);
      $('#wf', s.el).innerHTML = (f.any ? `<div class="note warn">${f.html}</div>` : '<div class="note ok">לא נמצאו כפילויות או שורות חסרות.</div>') +
        `<div class="row" style="margin-top:10px">${f.ex ? `<button class="btn" id="w-clean">ניקוי כפילויות (${f.ex})</button>` : ''}${f.removable ? `<button class="btn ghost" id="w-dedupe">הסר ${f.removable} כפילויות זהות</button>` : ''}${undo ? '<button class="btn plain" id="w-clean-undo">בטל ניקוי</button>' : ''}</div>
        <p class="small muted">״ניקוי כפילויות״: שורות עם אותו שם ואותו סכום — נשארת השורה עם הכי הרבה פרטים (שעה, טלפון, גובה, קשה). ״הסר כפילויות זהות״: רק שורות זהות גם בשעה/סטטוס — נשארת הראשונה. חלקים של חוב שפוצל אינם כפילות. השינוי נשמר רק אחרי ״שמור״.</p>`;
      const c = $('#w-clean', s.el); if (c) c.onclick = () => {
        const score = e => (normTime(e.t) ? 2 : 0) + (normStatus(e.s) ? 2 : 0) + (String(e.p || '').trim() ? 1 : 0) + (String(e.c || '').trim() ? 1 : 0) + (e.h ? 1 : 0);
        const best = new Map();
        state.entries.forEach(e => { if (!normName(e.n) && !num(e.a)) return; const k = wDupKey(e), b = best.get(k); if (!b || score(e) > score(b)) best.set(k, e); });
        const before = state.entries.slice(); let gone = 0;
        state.entries = state.entries.filter(e => { if (!normName(e.n) && !num(e.a)) return true; if (best.get(wDupKey(e)) === e) return true; gone++; return false; });
        if (!gone) return toast('אין כפילויות');
        undo = before; redraw(); draw(); toast('נוקו ' + gone + ' כפילויות (נשארה השורה עם הכי הרבה פרטים)');
      };
      const d = $('#w-dedupe', s.el); if (d) d.onclick = () => {
        const seen = new Set(), keep = []; let gone = 0; const before = state.entries.slice();
        state.entries.forEach(e => { if (!normName(e.n) && !num(e.a)) { keep.push(e); return; } const k = wSameKey(e); if (seen.has(k)) { gone++; return; } seen.add(k); keep.push(e); });
        if (!gone) return; state.entries = keep; undo = before; redraw(); draw(); toast('הוסרו ' + gone + ' שורות כפולות (נשארה הראשונה מכל אחת)');
      };
      const u = $('#w-clean-undo', s.el); if (u) u.onclick = () => { state.entries = undo; undo = null; redraw(); draw(); toast('הניקוי בוטל'); };
    };
    draw();
  },
});
const newRow = (r) => ({ n: r.n, p: r.p || '', a: r.a, c: r.c || '', t: r.t || '', h: '', s: r.s || '' });
editorAction('work', {
  label: 'הוספה מטקסט',
  run(state, redraw) {
    const s = openSheet(`<div class="hd"><h2>הוספה מטקסט</h2><button class="x" data-close>×</button></div>
      <label class="f">שורה לכל חייב: שם – סכום – שעה (למשל 09:30), או במקום השעה "לעבור" / "נאסף".<textarea class="in" id="w-text" rows="7" placeholder="דוגמה:&#10;שם הלקוח – 1,500 ₪ – 10:30"></textarea></label>
      <button class="btn xl" id="w-parse" style="margin-top:10px">הוסף מהטקסט</button>`);
    loadBook(false).catch(() => {});
    $('#w-parse', s.el).onclick = async () => {
      if (!BOOK.loaded) await loadBook(false).catch(() => {});
      const rows = parseWorkText($('#w-text', s.el).value);
      if (!rows.length) return toast('לא זיהיתי שורות בטקסט');
      const add = rows.map(newRow); fillFromBook(add); (state.entries ||= []).push(...add);
      s.close(); redraw(); toast('נוספו ' + rows.length + ' שורות');
    };
  },
});
// צילום מסך: הקריאה עצמה ביכולת ai (/api/ai/extract); הנוסח (PROMPT_W) והנרמול (normalizeW) מהמקור
const readUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('קריאת הקובץ נכשלה')); r.readAsDataURL(f); });
editorAction('work', {
  label: 'קריאת צילום מסך',
  run(state, redraw) {
    const s = openSheet(`<div class="hd"><h2>צילום מסך של רשימת החייבים</h2><button class="x" data-close>×</button></div>
      <p class="small muted" style="margin:0">העלה צילום מסך של רשימת החייבים. התוכנה קוראת שם, סכום ושעה. שורה שכתוב בה "לעבור", "לא נאסף" או "נאסף" במקום שעה מסומנת בהתאם. אם הצילום ארוך מאוד והכתב קטן, פצל אותו לכמה צילומים. בדוק את השורות מול הצילום לפני שליחה.</p>
      <input type="file" id="w-img" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
      <div class="row" style="margin-top:10px"><button class="btn" id="w-img-pick">העלאת צילום מסך</button></div><div id="w-img-st" style="margin-top:8px"></div>`);
    const st = $('#w-img-st', s.el);
    $('#w-img-pick', s.el).onclick = () => $('#w-img', s.el).click();
    $('#w-img', s.el).onchange = async (e) => {
      const files = Array.from(e.target.files || []); e.target.value = ''; if (!files.length) return;
      if (!BOOK.loaded) await loadBook(false).catch(() => {});
      let added = 0, unc = 0, done = 0; const lines = [];
      for (let i = 0; i < files.length; i++) {
        const im = { no: i + 1 }; lines[i] = 'צילום ' + im.no + ': קורא את הצילום…'; st.innerHTML = lines.map(l => `<div class="small">${esc(l)}</div>`).join('');
        try {
          const url = await readUrl(files[i]);
          const r = await save('POST', '/api/ai/extract', { task: 'work', images: [url] }, { label: 'קריאת צילום', queue: false });
          const rows = normalizeW(r && r.data, im, uid);
          const add = rows.map(x => { const o = newRow(x); return o; }); fillFromBook(add.filter(x => !x.p || !x.c)); (state.entries ||= []).push(...add);
          added += add.length; unc += rows.filter(x => x.u).length; done++;
          lines[i] = 'צילום ' + im.no + ': נקרא: ' + rows.length + ' שורות · סה״כ ' + fmt(sum(rows.map(x => x.a))) + ' ₪' + (r && r.data && r.data.note ? ' · ' + String(r.data.note).slice(0, 120) : '');
        } catch (err) {
          lines[i] = 'צילום ' + im.no + ': ' + (err.status === 503 || err.status === 404 ? 'קריאת תמונות דורשת חיבור ל-Claude — הגדרות' : err.message);
          if (err.status === 503 || err.status === 404) { st.innerHTML = lines.map(l => `<div class="note err small">${esc(l)}</div>`).join(''); break; }
        }
        st.innerHTML = lines.map(l => `<div class="small">${esc(l)}</div>`).join('');
      }
      if (added) { redraw(); toast('נקראו ' + done + ' צילומים · נוספו ' + added + ' שורות' + (unc ? ' · ' + unc + ' לא נקראו בבירור' : '') + '. בדוק את השורות מול הצילום לפני שליחה.', 6000); }
    };
  },
});

// ===================== 6. מאגר לקוחות והקמת לקוח מתוך פיצול =====================
accountAction('split', { label: 'הקמת לקוח חדש', can: (App) => fin(App), run: (ctx) => splitClientSheet(ctx) });
route('clients-db', async (view, args, q) => { await renderClientsDb(view, args, q); });
more({ href: '#/clients-db', label: 'מאגר לקוחות (כרטיסי לקוח)', can: (App) => fin(App), order: 20 });
