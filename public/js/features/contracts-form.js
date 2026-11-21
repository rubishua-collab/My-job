// חוזים לחתימה: טופס החוזה (היתר עסקה / חוזה אחר). העתק של app.html שורות 1562-1684 (HTML) ו-7547-7975, 8576-8639 (קוד).
// ההבדל העיקרי מהמקור: הקישור ללקוח הוא דף החתימה של האפליקציה (sign.html#אסימון) והחוזה נשמר בשרת, לא בתוך הקישור.
import { save, get } from '../api.js';
import { toast, openSheet, todayISO } from '../ui.js';
import { normName } from '../phone.js';
import {
  esc, SG_BUILTIN, sgPer, sgAddPeriods, sgTokensOf, sgTokenValue, sgMissing, sgPayClause, sgDefaultTemplate, sgPaperHTML, sgFmtNum, sgFmtG,
  sgNm, sgIsOther, sgTitle, sgNormPhone, sgWaLink, sgBuildPdf, sgFileBase, downloadBlob, injectCss, sgSafeName, loadVendor,
} from './contracts-core.js';
import { FX, fxBind, fxReset, fxDrop, fxSync, fxLoadRec, fxInit, fxIdRender, fxRender, fxSerialize, fxClientSer, fxUploadNew, fxIdBoxHTML, fxFillBoxHTML, aiAsk, sampleErr, markAi, aiAvailable, AI_OFF, fxCanvas, toJpeg } from './contracts-fx.js';

export const SG = { base: '', recs: [], kd: '', kbuf: { h: null, o: null }, oDate: '', os: { busy: false, stop: false, seq: 0 }, cur: null, curRec: null, vcode: '', pt: '', newId: null,
  textTouched: false, monthlyTouched: false, repayTouched: false, fq: 'm', cf: {}, issues: [], prep: null, prepSeq: 0, prepT: null, pvT: null, picks: null, pickCache: null, just: null, justSent: false };
const sg$ = id => document.getElementById(id);
const sgF = id => sg$('sg-' + id);
const SG_FIELDS = ['fInvestor', 'fOperator', 'fOpId', 'fClientPhone', 'fAmount', 'fCur', 'fProfit', 'fDate', 'fRepay', 'fPlace', 'fPhone'];
const SG_O_MAX = 150000;
const SG_MSG_MAX = 60000;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };
function sgRandId() { const a = new Uint8Array(16), ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; crypto.getRandomValues(a); return Array.from(a, x => ch[x % 62]).join('') + Date.now().toString(36); }
function sgRandCode() { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(100000 + (a[0] % 900000)); }
function sgRandToken() { const a = new Uint8Array(24); crypto.getRandomValues(a); let s = ''; a.forEach(x => { s += String.fromCharCode(x); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

/* ---------- הקישור וההודעה ללקוח (8646-8650) ---------- */
export const sgLinkOf = (base, pt) => pt ? (base || location.origin) + '/sign.html#' + pt : '';
export const sgLinkMsg = (d, link, vcode) => 'שלום ' + d.o + ', מצורף ' + (sgNm(d) ? '״' + sgNm(d) + '״' : 'היתר עסקה') + ' לחתימה דיגיטלית מהטלפון:\n' + link + '\n\nקוד אימות: ' + vcode + '\nלפני החתימה תצטרכו תעודת זהות לצילום. אם הקישור נפתח בלי החוזה, פתחו אותו בדפדפן (Chrome או Safari).';

/* ---------- הטופס ---------- */
function sgNum(v) { const n = parseFloat(String(v).replace(/[,\s₪$€]/g, '')); return isFinite(n) ? n : NaN; }
function sgReadForm() {
  const nm = sgF('fName').value.trim();
  if (SG.kd === 'o') return { kd: 'o', nm, i: sgF('fSender').value.trim(), o: sgF('fOperator').value.trim(), d: sgF('fOpId').value.trim(), q: sgF('fClientPhone').value.trim(),
    w: sgF('fPhone').value.trim(), k: sgF('fText').value.replace(/^\s*\n/, '').replace(/\s+$/, ''), t: SG.oDate || todayISO(), m: 'req' };
  return { nm, i: sgF('fInvestor').value.trim(), o: sgF('fOperator').value.trim(), d: sgF('fOpId').value.trim(), q: sgF('fClientPhone').value.trim(),
    a: sgNum(sgF('fAmount').value), c: sgF('fCur').value, p: sgNum(sgF('fProfit').value), t: sgF('fDate').value, r: sgF('fRepay').value,
    l: sgF('fPlace').value.trim(), w: sgF('fPhone').value.trim(), k: sgF('fText').value.trim(), f: Object.assign({}, SG.cf), mo: SG.monthlyTouched ? sgNum(sgF('fMonthly').value) : NaN, fq: SG.fq, n: Math.min(120, Math.max(1, parseInt(sgF('fPayments').value, 10) || 1)), m: 'req' };
}
const sgHasPayClause = t => { const k = sgTokensOf(t); return k.indexOf('מספר תשלומים') >= 0 && (k.indexOf('החזר חודשי') >= 0 || k.indexOf('החזר שבועי') >= 0 || k.indexOf('סכום תשלום') >= 0); };
export function sgValidate(d) {
  if (!sgNm(d)) return 'חסר שם לחוזה. כתוב בשדה ״שם החוזה״ שם שתבחר.';
  if (sgIsOther(d)) {
    if (!d.o) return 'חסר שם הלקוח.';
    if (sgNormPhone(d.q).length < 8) return 'חסר מספר וואטסאפ של הלקוח. בלעדיו אי אפשר לאמת את החותם.';
    if (SG.os.busy) return 'הסריקה עדיין רצה. חכה שתסתיים, או לחץ ״עצירה״.';
    if (!d.k) return 'נוסח החוזה ריק. כתוב, הדבק או סרוק את החוזה.';
    if (d.k.length > SG_O_MAX) return 'החוזה ארוך מדי לשליחה לחתימה: ' + sgFmtNum(d.k.length) + ' תווים, והמקסימום הוא ' + sgFmtNum(SG_O_MAX) + '.';
    return '';
  }
  if (!d.i) return 'חסר שם המשקיע.';
  if (!d.o) return 'חסר שם הלקוח.';
  if (sgNormPhone(d.q).length < 8) return 'חסר מספר וואטסאפ של הלקוח. בלעדיו אי אפשר לאמת את החותם.';
  if (!(d.a > 0)) return 'הסכום חייב להיות מספר גדול מאפס.';
  if (!(d.p >= 0)) return 'חסר סכום הרווח המוסכם. אפשר להזין 0.';
  if (!d.t) return 'חסר תאריך העסקה.';
  if (!d.r) return 'חסר מועד פירעון.';
  if (d.r < d.t) return 'מועד הפירעון מוקדם מתאריך העסקה.';
  if (!d.k) return 'הנוסח ריק.';
  if (!sgHasPayClause(d.k)) return 'בחוזה חייבים להופיע סוג ההחזר, מספר התשלומים והסכום של כל תשלום. לחץ ״הוספת סעיף תשלומים לחוזה״.';
  const miss = sgMissing(d); if (miss.length) return 'חסר ערך לשדות: ' + miss.join(', ') + '.';
  return '';
}
function sgRefreshDefaultText() { if (SG.kd === 'h' && !SG.textTouched) sgF('fText').value = sgDefaultTemplate(sgReadForm()); sgOnTemplateChange(); }
function sgMe() { const o = store.get('yh_iska_me'); return o && typeof o === 'object' ? o : {}; }
function sgFillForm(d, rec, kd) {
  d = d || {};
  fxReset();
  sgOScanAbort(); sgClearAskHide();
  if (kd === undefined) kd = (rec || d.kd || d.i || d.o) ? (d.kd === 'o' ? 'o' : 'h') : '';
  const oth = kd === 'o';
  SG_FIELDS.forEach(f => { sgF(f).value = ''; });
  SG.kbuf = { h: null, o: null }; SG.oDate = oth ? (d.t || '') : '';
  sgF('fName').value = d.nm || ''; sgF('fSender').value = oth ? (d.i || (rec ? '' : (sgMe().name || ''))) : '';
  sgF('fInvestor').value = oth ? '' : (d.i || ''); sgF('fOperator').value = d.o || ''; sgF('fOpId').value = d.d || ''; sgF('fClientPhone').value = d.q || '';
  sgF('fAmount').value = (!oth && d.a != null && isFinite(d.a)) ? d.a : ''; sgF('fCur').value = (!oth && d.c) || '₪'; sgF('fProfit').value = (!oth && d.p != null && isFinite(d.p)) ? d.p : '';
  sgF('fDate').value = (!oth && d.t) || todayISO(); sgF('fRepay').value = oth ? '' : (d.r || ''); sgF('fPlace').value = oth ? '' : (d.l || ''); sgF('fPayments').value = (!oth && d.n) || 1; SG.fq = (!oth && d.fq === 'w') ? 'w' : 'm'; sgUpdateFreqUI();
  SG.repayTouched = !oth && !!d.r; SG.monthlyTouched = !oth && d.mo > 0; sgF('fMonthly').value = (!oth && d.mo > 0) ? d.mo : ''; sgF('fPhone').value = d.w || (kd ? (sgMe().phone || '') : '');
  if (kd === 'h' && !d.i && !rec) sgF('fInvestor').value = sgMe().name || '';
  SG.textTouched = !!d.k; SG.issues = []; sgRenderIssues([]); SG.cf = oth ? {} : Object.assign({}, d.f || {});
  sgF('fText').value = d.k || '';
  sgApplyKind(kd);
  sgRefreshDefaultText();
  sg$('sg-edit-title').textContent = rec ? 'עריכת חוזה: ' + (sgNm(d) || d.o || '') : 'חוזה חדש';
  sgFormErr(''); sg$('sg-pick').value = ''; sg$('sg-pick-res').innerHTML = '';
  sg$('sg-pick-note').textContent = 'בוחרים לקוח, והשם והטלפון שלו מתמלאים לבד.';
  sg$('sg-imp-st').textContent = aiAvailable() ? 'Claude יקרא את החוזה, יפרק אותו לשדות מסודרים ויכניס את הפרטים לקוביות.' : AI_OFF;
  SG.vcode = (rec && rec.vcode) || sgRandCode(); SG.pt = (rec && rec.pt) || sgRandToken(); SG.newId = rec ? null : sgRandId(); sgSchedulePrep();
  fxLoadRec(rec);
}
function sgApplyKind(kd) {
  SG.kd = kd === 'o' || kd === 'h' ? kd : '';
  sg$('sg-edit').setAttribute('data-kd', SG.kd);
  const lock = !!SG.cur;
  sg$('sg-kindSeg').querySelectorAll('[data-kd]').forEach(b => { const k = b.getAttribute('data-kd'); b.setAttribute('aria-checked', String(k === SG.kd)); b.disabled = lock && k !== SG.kd; });
  sg$('sg-kindHint').textContent = !SG.kd ? 'בחר את סוג החוזה. ״חוזה אחר״ נפתח ריק, בלי שום נוסח או שדה של היתר עסקה.' :
    (lock ? 'סוג החוזה נקבע כשהחוזה נשמר.' : (SG.kd === 'o' ? 'חוזה אחר: הנוסח נשאר בדיוק כמו שכתבת או סרקת.' : 'היתר עסקה: הנוסח של היתר עסקה, עם הסכומים והתשלומים.'));
  const ta = sgF('fText'); ta.setAttribute('dir', SG.kd === 'o' ? 'auto' : 'rtl'); ta.setAttribute('aria-label', SG.kd === 'o' ? 'נוסח החוזה' : 'נוסח ההיתר');
  sgUpdateOMeter();
}
function sgSetKind(kd) {
  if (SG.cur || kd === SG.kd || (kd !== 'h' && kd !== 'o')) return;
  fxDrop();
  const ta = sgF('fText'), prev = SG.kd;
  if (prev === 'h') SG.kbuf.h = { t: ta.value, touched: SG.textTouched }; else if (prev === 'o') SG.kbuf.o = ta.value;
  sgOScanAbort();
  sgApplyKind(kd);
  if (kd === 'o') { ta.value = SG.kbuf.o || ''; SG.textTouched = !!ta.value; SG.issues = []; sgRenderIssues([]); if (!SG.oDate) SG.oDate = todayISO(); if (!sgF('fSender').value) sgF('fSender').value = sgMe().name || ''; }
  else { const b = SG.kbuf.h; if (b && b.touched) { ta.value = b.t; SG.textTouched = true; } else SG.textTouched = false; if (!sgF('fInvestor').value) sgF('fInvestor').value = sgMe().name || ''; if (!sgF('fDate').value) sgF('fDate').value = todayISO(); }
  if (!sgF('fPhone').value) sgF('fPhone').value = sgMe().phone || '';
  sgFormErr(''); sgRefreshDefaultText(); sgSchedulePrep();
  setTimeout(() => { try { if (!sgF('fName').value) sgF('fName').focus(); } catch (e) { /* */ } }, 30);
  fxRender();
}
function sgOnTemplateChange() { fxSync(); sgUpdatePayUI(); sgRenderCubes(); sgRefreshPreview(); sgUpdateOMeter(); }
function sgUpdatePayUI() {
  const n = Math.max(1, parseInt(sgF('fPayments').value, 10) || 1), a = sgNum(sgF('fAmount').value), p = sgNum(sgF('fProfit').value);
  const has = sgHasPayClause(sgF('fText').value);
  const tot = (isFinite(a) && isFinite(p)) ? a + p : NaN;
  const t = sgF('fDate').value, P = sgPer(SG.fq);
  sg$('sg-payHint').textContent = ''; sg$('sg-repayHint').textContent = ''; sg$('sg-btnFitRepay').hidden = true;
  if (t) {
    const last = sgAddPeriods(t, n, SG.fq), first = sgAddPeriods(t, 1, SG.fq);
    if (!SG.repayTouched) sgF('fRepay').value = last;
    sg$('sg-payHint').textContent = n > 1 ? (n + ' תשלומים ' + P.adj + ': הראשון ב-' + sgFmtG(first) + ', האחרון ב-' + sgFmtG(last) + '.') : ('תשלום ' + P.word + ' אחד ב-' + sgFmtG(last) + '.');
    const r = sgF('fRepay').value;
    if (SG.repayTouched && r && r !== last) { sg$('sg-repayHint').textContent = 'מועד הפירעון בחוזה (' + sgFmtG(r) + ') לא תואם לתשלום האחרון לפי החישוב (' + sgFmtG(last) + ').'; sg$('sg-btnFitRepay').hidden = false; }
  }
  if (!SG.monthlyTouched) sgF('fMonthly').value = isFinite(tot) ? String(Math.round(tot / n * 100) / 100) : '';
  const mo = sgNum(sgF('fMonthly').value);
  sg$('sg-monthlyHint').textContent = (SG.monthlyTouched && isFinite(mo) && isFinite(tot) && Math.abs(mo * n - tot) > 0.5) ? 'שים לב: ' + n + ' תשלומים של ' + sgFmtNum(mo) + ' הם ' + sgFmtNum(mo * n) + ', והסכום הכולל בחוזה הוא ' + sgFmtNum(tot) + '.' : '';
  sg$('sg-btnPayClause').hidden = has;
}
function sgUpdateFreqUI() {
  const P = sgPer(SG.fq);
  sg$('sg-freqSeg').querySelectorAll('[data-fq]').forEach(b => b.setAttribute('aria-checked', String(b.getAttribute('data-fq') === SG.fq)));
  sg$('sg-lblPayments').textContent = 'מספר תשלומים ' + P.adj;
  sg$('sg-lblMonthly').textContent = 'החזר ' + P.word;
}
function sgSwapFreqText(txt, fq) {
  const from = sgPer(fq === 'w' ? 'm' : 'w'), to = sgPer(fq);
  return txt.split('{{' + from.tok + '}}').join('{{' + to.tok + '}}')
    .split('תשלומים ' + from.adj).join('תשלומים ' + to.adj)
    .split('בתשלום ' + from.word + ' אחד').join('בתשלום ' + to.word + ' אחד')
    .split('כל ' + from.unit + ',').join('כל ' + to.unit + ',')
    .split('כל ' + from.unit + ' ').join('כל ' + to.unit + ' ')
    .split('כל ' + from.unit + '.').join('כל ' + to.unit + '.');
}
function sgSetFreq(fq) {
  if (fq === SG.fq) return;
  SG.fq = fq; SG.monthlyTouched = false; sgUpdateFreqUI();
  if (SG.textTouched) sgF('fText').value = sgSwapFreqText(sgF('fText').value, fq);
  sgRefreshDefaultText();
}
function sgAddPayClause() {
  const ta = sgF('fText'), paras = ta.value.split(/\n\s*\n/).filter(x => x.trim());
  if (sgHasPayClause(ta.value)) return;
  const n = Math.max(1, parseInt(sgF('fPayments').value, 10) || 1);
  const clause = sgPayClause(SG.fq, n, 'המפעיל מתחייב להחזיר את הסכום הכולל, **{{סה"כ}}**,');
  let at = -1; paras.forEach((x, i) => { if (at < 0 && i > 0 && (x.indexOf('{{פירעון}}') >= 0 || x.indexOf('{{סה"כ}}') >= 0)) at = i; });
  if (at < 0) at = Math.max(0, paras.length - 2);
  paras.splice(at + 1, 0, clause); ta.value = paras.join('\n\n'); SG.textTouched = true; sgOnTemplateChange(); sgSchedulePrep();
}
function sgRenderCubes() {
  const toks = sgTokensOf(sgF('fText').value), custom = toks.filter(n => SG_BUILTIN.indexOf(n) < 0);
  sg$('sg-customCubes').innerHTML = custom.map((n, i) => '<label class="f" for="sg-cf' + i + '">' + esc(n) + '<input class="in" id="sg-cf' + i + '" type="text" data-cf="' + esc(n) + '" value="' + esc(SG.cf[n] || '') + '"></label>').join('');
  sg$('sg-tokChips').innerHTML = SG_BUILTIN.filter(n => n !== (SG.fq === 'w' ? 'החזר חודשי' : 'החזר שבועי')).concat(custom).map(n => '<button type="button" class="btn plain sm" data-tok="' + esc(n) + '">' + esc(n) + '</button>').join('');
}
function sgRefreshPreview() { clearTimeout(SG.pvT); const go = () => { const el = sg$('sg-livePaper'); if (el) el.innerHTML = sgPaperHTML(sgReadForm(), null); }; if (SG.kd === 'o' && sgF('fText').value.length > 6000) SG.pvT = setTimeout(go, 500); else go(); }
function sgPutToken(name, val) {
  const ta = sgF('fText'), a = ta.selectionStart || 0, b = ta.selectionEnd || 0, sel = ta.value.slice(a, b), tok = '{{' + name + '}}';
  if (val && sel && SG_BUILTIN.indexOf(name) < 0) SG.cf[name] = sel;
  ta.value = ta.value.slice(0, a) + tok + ta.value.slice(b);
  SG.textTouched = true; sgOnTemplateChange(); ta.focus(); ta.setSelectionRange(a + tok.length, a + tok.length);
}
function sgNewField() { const inp = sg$('sg-newFieldName'), name = inp.value.trim().replace(/[{}]/g, ''); if (!name) { inp.focus(); return; } sgPutToken(name, true); inp.value = ''; }

/* ---------- בחירת לקוח מתוך הלקוחות שבתוכנה (7717-7749). הרשימה נבנית בשרת ---------- */
async function sgRenderPick() {
  const q = sg$('sg-pick').value.trim(), box = sg$('sg-pick-res');
  if (!q) { box.innerHTML = ''; return; }
  if (!SG.picks) { try { SG.picks = await get('/api/sign/clients'); } catch (e) { SG.picks = []; } }
  const extra = SG.recs.filter(r => r && r.d).map(r => ({ n: r.d.o, ph: r.d.q || '', src: 'חוזים' }));
  const qn = normName(q), qd = q.replace(/\D/g, '');
  const seen = new Set(); const all = SG.picks.concat(extra).filter(c => { const k = normName(c.n); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  const hits = all.filter(c => normName(c.n).indexOf(qn) >= 0 || (qd.length >= 3 && String(c.ph).replace(/\D/g, '').indexOf(qd) >= 0))
    .sort((a, b) => (normName(a.n).indexOf(qn) === 0 ? 0 : 1) - (normName(b.n).indexOf(qn) === 0 ? 0 : 1) || a.n.localeCompare(b.n, 'he')).slice(0, 8);
  SG.pickCache = hits;
  box.innerHTML = hits.length ? hits.map((c, i) => '<button type="button" data-pick="' + i + '"><span><b>' + esc(c.n) + '</b> <span class="sg-src">· ' + esc(c.src) + '</span></span><span class="num small">' + esc(c.ph || 'אין טלפון') + '</span></button>').join('') : '<div class="small muted">לא נמצא לקוח בשם הזה בתוכנה. אפשר לכתוב את השם והטלפון ידנית.</div>';
}
function sgPick(i) {
  const c = (SG.pickCache || [])[i]; if (!c) return;
  sgF('fOperator').value = c.n; if (c.ph) sgF('fClientPhone').value = c.ph;
  sg$('sg-pick').value = ''; sg$('sg-pick-res').innerHTML = '';
  sg$('sg-pick-note').textContent = 'נבחר: ' + c.n + (c.ph ? ' · ' + c.ph : ' · אין טלפון שמור, כתוב אותו ידנית');
  sgRefreshDefaultText(); sgSchedulePrep();
  (c.ph ? (SG.kd === 'o' ? sgF('fText') : sgF('fAmount')) : sgF('fClientPhone')).focus();
}

/* ---------- ייבוא היתר עסקה מצילום מסך ובדיקת הנוסח עם Claude (7751-7812) ---------- */
const SG_ISSUE_RULES = 'סימונים בצורה {{...}} הם שדות שמתמלאים אוטומטית מהקוביות, ואין לסמן אותם כחסרים. בדוק את הנוסח וסמן מה צריך לערוך: (1) מקומות ריקים או חסרים, כמו קווים ____ או שם, סכום או תאריך חסרים. (2) סתירות בין הנוסח לבין הפרטים שבטופס. (3) מילים שלא נקראו בבירור וסומנו [?]. (4) סעיפים חסרים בהיתר עסקה: סכום ההשקעה, חלוקת הרווח, מועד פירעון, ומי נאמן לטעון הפסד. (5) ניסוח שנראה כהלוואה בריבית רגילה ולא כעסקה, שכדאי להעביר לרב. (6) אם החוזה לא קובע במפורש בכמה תשלומים משלמים, באיזו תדירות (חודשי או שבועי) ומה סכום כל תשלום, סמן זאת כסעיף חסר. לכל נקודה החזר: quote, קטע מדויק מהנוסח שהועתק מילה במילה (עד שורה אחת), או מחרוזת ריקה אם הבעיה היא סעיף שחסר. problem, משפט קצר בעברית שמסביר מה לא בסדר. fix, הטקסט שיחליף את הקטע, או מחרוזת ריקה אם צריך החלטה של בעל החוזה. עד 12 נקודות, החשובות קודם. אל תמציא פרטים שלא מופיעים. אם הכל תקין, החזר issues ריק.';
const fileToJpegData = async (file, dim = 2000) => { const c = await fxCanvas(file, dim); const b = await toJpeg(c, 0.88); c.width = c.height = 0; return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); };
async function sgOnImport(file) {
  if (!file) return;
  const st = sg$('sg-imp-st'); st.textContent = 'קורא את התמונה… זה לוקח כחצי דקה.'; sg$('sg-imp').disabled = true;
  const prompt = 'התמונה היא צילום מסך של חוזה, שטר או היתר עסקה בעברית. המטרה: להפוך אותו לתבנית שבה כל פרט שמשתנה מלקוח ללקוח מוחלף בשדה. ' +
    '1) העתק את הטקסט המלא במדויק, כפסקאות מופרדות בשורה ריקה. הפסקה הראשונה היא הפתיח, בלי כותרת ובלי מספור פסקאות. ' +
    '2) בכל מקום שיש פרט ספציפי לחוזה הזה, כמו שם, ת.ז., סכום, תאריך, מקום, כתובת, טלפון, אחוז או בטוחה, החלף אותו בשדה בצורה {{שם השדה}}. ' +
    'השתמש בשמות האלה כשהם מתאימים: {{משקיע}} (המלווה או נותן הכסף), {{לקוח}} (המפעיל או הלווה), {{ת.ז. לקוח}}, {{סכום}} (סכום ההשקעה עם המטבע, למשל 10,000 ש"ח, מוחלף כולו בשדה), {{רווח}} (הרווח או התוספת המוסכמת, עם המטבע), {{סה"כ}} (הסכום הכולל להחזר, עם המטבע), {{תאריך}} (תאריך החתימה), {{פירעון}} (מועד הפירעון), {{מספר תשלומים}}, {{החזר חודשי}} (סכום ההחזר החודשי עם המטבע), {{החזר שבועי}} (סכום ההחזר השבועי עם המטבע), {{סכום תשלום}} (סכום תשלום אחד שאינו חודשי), {{מקום}}. ' +
    'פרט אחר מקבל שם קצר בעברית שאתה בוחר, כמו {{כתובת לקוח}} או {{סכום במילים}}, ואותו פרט שחוזר כמה פעמים מקבל את אותו שדה. טקסט קבוע של החוזה נשאר כמו שהוא. ' +
    '3) מילה שלא נקראה בבירור סמן בנוסח כ-[?]. ' +
    'החזר רק JSON בצורה: {"template": string, "builtin": {"investor": string, "operator": string, "operatorId": string, "amount": number|null, "profit": number|null, "currency": "₪"|"$"|"€"|null, "date": "YYYY-MM-DD"|null, "repay": "YYYY-MM-DD"|null, "payments": number|null, "frequency": "monthly"|"weekly"|null, "installment": number|null, "place": string}, "custom": {"שם השדה": "הערך כפי שנקרא"}, "issues": [{"quote": string, "problem": string, "fix": string}]}. ' + SG_ISSUE_RULES;
  try {
    const r = await aiAsk('contract_import', prompt, [await fileToJpegData(file)]);
    const tpl = String((r && r.template) || '').trim();
    if (!tpl) throw { code: 'invalid_json' };
    const b = r.builtin || {}, setV = (id, v) => { if (v != null && v !== '') sgF(id).value = v; };
    setV('fInvestor', b.investor); setV('fOperator', b.operator); setV('fOpId', b.operatorId); setV('fAmount', b.amount); setV('fProfit', b.profit);
    setV('fDate', b.date); setV('fRepay', b.repay); setV('fPlace', b.place); setV('fPayments', b.payments);
    if (b.frequency === 'weekly' || b.frequency === 'monthly') { SG.fq = b.frequency === 'weekly' ? 'w' : 'm'; sgUpdateFreqUI(); }
    const inst = b.installment || b.monthly; if (inst > 0) { sgF('fMonthly').value = inst; SG.monthlyTouched = true; }
    if (b.repay) SG.repayTouched = true;
    if (b.currency === '₪' || b.currency === '$' || b.currency === '€') sgF('fCur').value = b.currency;
    SG.cf = {}; const cu = r.custom || {}; Object.keys(cu).forEach(k => { SG.cf[k] = String(cu[k] == null ? '' : cu[k]); });
    sgF('fText').value = tpl; SG.textTouched = true; sgOnTemplateChange(); sgRenderIssues(r.issues);
    sgSchedulePrep();
    st.textContent = 'החוזה נקרא והפרטים הוכנסו לקוביות. ' + (SG.issues.length ? 'סימנתי ' + SG.issues.length + ' נקודות לבדיקה.' : 'לא נמצאו נקודות לתיקון.') + (sgHasPayClause(tpl) ? '' : ' בחוזה חסר סעיף תשלומים: לחץ ״הוספת סעיף תשלומים לחוזה״.');
  } catch (e) { markAi(e); st.textContent = sampleErr(e); }
  finally { sg$('sg-imp').disabled = false; sg$('sg-imp-file').value = ''; }
}
function sgRenderIssues(list) {
  if (list) SG.issues = (Array.isArray(list) ? list : []).filter(x => x && x.problem).slice(0, 15);
  const box = sg$('sg-reviewBox'), txt = sgF('fText').value;
  box.hidden = !SG.issues.length;
  box.innerHTML = SG.issues.length ? '<div class="note warn"><b>' + SG.issues.length + ' נקודות לבדיקה</b></div>' + SG.issues.map((x, i) => {
    const inText = x.quote && txt.indexOf(x.quote) >= 0;
    return '<div class="sg-issue" data-i="' + i + '"><p>' + esc(x.problem) + '</p>' + (x.quote ? '<p class="q">' + esc(x.quote) + '</p>' : '') + (x.fix ? '<p class="fx">הצעה: ' + esc(x.fix) + '</p>' : '') +
      '<div class="sg-acts">' + (inText ? '<button type="button" class="btn plain sm" data-ia="show">הצג בטקסט</button>' : '') + (inText && x.fix ? '<button type="button" class="btn sm" data-ia="apply">החל תיקון</button>' : '') + '<button type="button" class="btn plain sm" data-ia="skip">התעלם</button></div></div>';
  }).join('') : '';
}
function sgOnIssueClick(ev) {
  const b = ev.target.closest('[data-ia]'); if (!b) return;
  const i = Number(b.closest('[data-i]').getAttribute('data-i')), x = SG.issues[i]; if (!x) return;
  const ta = sgF('fText'), act = b.getAttribute('data-ia'), at = x.quote ? ta.value.indexOf(x.quote) : -1;
  if (act === 'show' && at >= 0) { ta.scrollIntoView({ block: 'center' }); ta.focus(); ta.setSelectionRange(at, at + x.quote.length); }
  else if (act === 'apply' && at >= 0) { ta.value = ta.value.slice(0, at) + x.fix + ta.value.slice(at + x.quote.length); SG.textTouched = true; SG.issues.splice(i, 1); sgRenderIssues(); sgOnTemplateChange(); sgSchedulePrep(); }
  else if (act === 'skip') { SG.issues.splice(i, 1); sgRenderIssues(); }
}
async function sgRunReview() {
  const btn = sg$('sg-btnReview'), st = sg$('sg-imp-st'), d = sgReadForm(), text = d.k; if (!text) return;
  delete d.k; delete d.q; delete d.w; delete d.m;
  btn.disabled = true; btn.textContent = 'בודק…';
  try {
    const r = await aiAsk('contract_review', 'להלן נוסח של היתר עסקה בעברית והפרטים שהוזנו בטופס.\n\nפרטי הטופס:\n' + JSON.stringify(d) + '\n\nהנוסח:\n' + text + '\n\n' + SG_ISSUE_RULES + ' החזר רק JSON בצורה {"issues": [{"quote": string, "problem": string, "fix": string}]}.');
    sgRenderIssues(r && r.issues);
    st.textContent = SG.issues.length ? 'סימנתי ' + SG.issues.length + ' נקודות לבדיקה, מעל הנוסח.' : 'לא נמצאו נקודות לתיקון.';
  } catch (e) { markAi(e); st.textContent = e.code === 'no_ai' ? AI_OFF : 'הבדיקה לא הצליחה. נסה שוב.'; }
  finally { btn.disabled = false; btn.textContent = 'בדיקת הנוסח עם Claude'; }
}

/* ---------- חוזה אחר: סריקה מצילום, צילום מסך או PDF (7814-7966) ---------- */
const SG_OS_HINT = 'הטקסט המלא נכנס לעורך בדיוק כמו שהוא כתוב בחוזה, בלי להוסיף ובלי לשנות סעיפים. אפשר לבחור כמה עמודים יחד, לפי הסדר. אם יש כבר טקסט בעורך, הטקסט הסרוק נוסף אחריו.';
function sgUpdateOMeter() {
  const el = sg$('sg-oMeter'); if (!el) return;
  const n = sgF('fText').value.length;
  el.textContent = n ? (sgFmtNum(n) + ' תווים' + (n > SG_O_MAX ? ' · ארוך מדי לשליחה לחתימה, המקסימום הוא ' + sgFmtNum(SG_O_MAX) : '')) : '';
  el.style.color = n > SG_O_MAX ? 'var(--err-fg)' : '';
}
function sgClearAskHide() { const a = sg$('sg-clearAsk'), b = sg$('sg-btnClear'); if (a) a.hidden = true; if (b) b.hidden = false; }
function sgClearForm() {
  const kd = SG.kd, wasRec = !!SG.cur;
  SG.cur = null; SG.curRec = null;
  sgFillForm({}, null, kd);
  sgF('fInvestor').value = ''; sgF('fSender').value = ''; sgF('fPhone').value = '';
  sgRefreshDefaultText(); sgSchedulePrep();
  toast(wasRec ? 'הטופס נוקה. החוזה השמור נשאר ברשימה בלי שינוי.' : 'הטופס נוקה. חוזים שמורים לא נמחקו.');
  try { sgF('fName').focus(); } catch (e) { /* */ }
}
function sgOScanUi(busy, msg) {
  const b = sg$('sg-oscan'), s = sg$('sg-oscanStop'), st = sg$('sg-oscan-st'), ta = sgF('fText');
  if (b) b.disabled = !!busy; if (s) s.hidden = !busy;
  if (ta) { ta.readOnly = !!busy; ta.classList.toggle('sg-live', !!busy); }
  if (st && msg != null) st.textContent = msg;
}
function sgOScanAbort() { SG.os.seq++; SG.os.stop = false; SG.os.busy = false; sgOScanUi(false, aiAvailable() ? SG_OS_HINT : AI_OFF + '. אפשר להקליד או להדביק את הטקסט.'); }
function sgOsPrompt(idx, total, parts) {
  const where = parts > 1
    ? 'The ' + parts + ' attached images are horizontal strips of ONE page, in order from the top of the page to the bottom. Neighbouring strips overlap by a few lines: transcribe every line exactly once, in page order, and do not repeat lines that appear in two strips.'
    : 'The attached image is one page.';
  return ['Task: exact transcription (OCR) of a scanned document page. ' + where + ' It is page ' + idx + ' of ' + total + ' that the user uploaded for this document.',
    '', 'Transcribe ALL the text on the page exactly as it is written, in its original language or languages. Hebrew is read right to left.', '', 'Rules:',
    '- Output only the text of the page: no introduction, no comments, no explanations, no Markdown (no #, no **, no code fences).',
    '- Copy the wording exactly. Do not translate, summarise, shorten, correct spelling or grammar, reword, complete or add anything.',
    '- Do not assume what kind of document or contract this is. Do not add any clause, term, heading or standard wording that is not visibly written on this page.',
    '- Copy numbers, amounts, dates, ID numbers and phone numbers digit by digit.',
    '- Keep the layout: each heading on its own line, a blank line between paragraphs, clause and sub-clause numbering exactly as printed (1., 1.1, א., (ב) and so on), list items line by line.',
    '- Handwritten text and filled-in details: transcribe them where they appear. An empty fill-in line stays as ______.',
    '- Tables: one row per line, with cells separated by " | ".',
    '- Checkboxes: ☐ for empty, ☒ for marked.',
    '- Text you cannot read with certainty: write [לא קריא] in its place. Never guess.',
    '- A handwritten signature: write [חתימה]. A stamp or seal: write [חותמת], followed by its readable text if there is any.',
    '- Include printed headers, footers and page numbers as they appear.',
    '- If the page has no text at all, output exactly: [עמוד ריק]',
    'Reply with JSON: {"text": "<the page text>"}'].join('\n');
}
function sgOsClean(t) { t = String(t || '').replace(/\r\n?/g, '\n'); t = t.replace(/^\s*```[^\n]*\n/, '').replace(/\n?```\s*$/, ''); return t.replace(/^\s*\n/, '').replace(/\s+$/, ''); }
const sgOsCv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
function sgOsFit(c, maxPx) { const px = c.width * c.height; if (px <= maxPx) return c; const k = Math.sqrt(maxPx / px); const o = sgOsCv(c.width * k, c.height * k), x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, o.width, o.height); return o; }
function sgOsSplit(c, maxCount) {
  const w = c.width, h = c.height, px = w * h;
  let parts = 1;
  if (px > 1.25e6) { parts = px <= 3.5e6 ? 2 : 3; parts = Math.max(parts, Math.ceil((h / w) / 1.6)); }
  parts = Math.max(1, Math.min(parts, maxCount || 1, 5));
  if (parts === 1) return [c];
  const ov = Math.max(48, Math.round(h * 0.035)), step = h / parts, out = [];
  for (let i = 0; i < parts; i++) { const y0 = Math.max(0, Math.round(i * step - ov)), y1 = Math.min(h, Math.round((i + 1) * step + ov)); const s = sgOsCv(w, y1 - y0); s.getContext('2d').drawImage(c, 0, y0, w, y1 - y0, 0, 0, w, y1 - y0); out.push(s); }
  return out;
}
async function sgOsPdfPage(pdf, n) {
  const pg = await pdf.getPage(n), v1 = pg.getViewport({ scale: 1 }), sc = Math.min(4, 2600 / Math.max(v1.width, v1.height)), vp = pg.getViewport({ scale: sc });
  const c = sgOsCv(vp.width, vp.height), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: x, viewport: vp }).promise; try { pg.cleanup(); } catch (e) { /* */ }
  return c;
}
const c2d = async c => { const b = await toJpeg(c, 0.88); return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); };
async function sgOsImages(p) {
  const c = p.pdf ? await sgOsPdfPage(p.pdf, p.n) : await fxCanvas(p.file, 4000), out = [];
  for (const part of sgOsSplit(c, 5)) out.push(await c2d(sgOsFit(part, 1.3e6)));
  c.width = c.height = 0; return out;
}
const sgOsIsPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
const sgOsIsImg = f => /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(f.name || '');
async function sgOScan(files) {
  if (SG.os.busy || SG.kd !== 'o') return;
  fxDrop();
  const seq = ++SG.os.seq; SG.os.busy = true; SG.os.stop = false; sgOScanUi(true, 'פותח את הקבצים…'); sgSchedulePrep();
  const ta = sgF('fText'), pdfs = [], pages = [], bad = [], failed = [];
  let acc = ta.value.replace(/\s+$/, ''), done = 0, end = '';
  try {
    for (const f of files) {
      if (sgOsIsPdf(f)) { try { await loadVendor('pdf.min.js'); const L = window.pdfjsLib; L.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js'; const pdf = await L.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise; pdfs.push(pdf); for (let n = 1; n <= pdf.numPages; n++) pages.push({ pdf, n }); } catch (e) { bad.push(f.name || 'PDF'); } }
      else if (sgOsIsImg(f)) pages.push({ file: f });
      else bad.push(f.name || 'קובץ');
      if (seq !== SG.os.seq) return;
    }
    if (!pages.length) { end = 'לא נמצאו עמודים לסריקה. בחר צילום, צילום מסך או PDF.' + (bad.length ? ' לא נפתח: ' + bad.join(', ') + '.' : ''); return; }
    for (let i = 0; i < pages.length; i++) {
      if (seq !== SG.os.seq) return;
      if (SG.os.stop) { end = 'הסריקה נעצרה. נקראו ' + done + ' מתוך ' + pages.length + ' עמודים.'; break; }
      sgOScanUi(true, 'קורא עמוד ' + (i + 1) + ' מתוך ' + pages.length + '…');
      let imgs; try { imgs = await sgOsImages(pages[i]); } catch (e) { failed.push(i + 1); continue; }
      if (seq !== SG.os.seq) return;
      try {
        const res = await aiAsk('ocr', sgOsPrompt(i + 1, pages.length, imgs.length), imgs, { text: 'string' });
        if (seq !== SG.os.seq) return;
        let t = sgOsClean(typeof res === 'string' ? res : (res && (res.text || res.transcription)) || ''); if (/^\[\s*עמוד ריק\s*\]$/.test(t.trim())) t = '';
        ta.value = t ? (acc ? acc + '\n\n' + t : t) : acc; acc = ta.value.replace(/\s+$/, ''); done++;
      } catch (e) {
        markAi(e);
        if (seq !== SG.os.seq) return;
        if (e.code === 'no_ai' || e.code === 'rate_limited') { end = sampleErr(e) + '. נקראו ' + done + ' מתוך ' + pages.length + ' עמודים.'; break; }
        failed.push(i + 1);
      }
      SG.textTouched = true; sgOnTemplateChange();
    }
    if (!end) end = 'נקראו ' + done + ' מתוך ' + pages.length + ' עמודים. הטקסט נכנס לעורך בדיוק כמו שנקרא. בדוק אותו מול החוזה המקורי לפני השליחה.';
    if (failed.length) end += ' עמודים שלא נקראו: ' + failed.join(', ') + '. אפשר לסרוק אותם שוב.';
    if (bad.length && pages.length) end += ' לא נפתח: ' + bad.join(', ') + '.';
  } finally {
    pdfs.forEach(p => { try { p.destroy(); } catch (e) { /* */ } });
    if (seq === SG.os.seq) { SG.os.busy = false; SG.os.stop = false; sgOScanUi(false, end || SG_OS_HINT); SG.textTouched = !!ta.value; sgOnTemplateChange(); sgSchedulePrep(); }
  }
}

/* ---------- שמירה ושליחה (8576-8639) ---------- */
function sgBuildBody() {
  const d = sgReadForm(), err = sgValidate(d);
  if (err) return { err };
  const link = sgLinkOf(SG.base, SG.pt);
  if (sgIsOther(d)) { const ml = sgLinkMsg(d, link, SG.vcode).length; if (ml > SG_MSG_MAX) return { err: 'ההודעה ארוכה מדי לוואטסאפ.' }; }
  return { d, id: SG.cur || SG.newId || (SG.newId = sgRandId()), link, vcode: SG.vcode };
}
function sgSchedulePrep() { SG.prep = null; const b = sg$('sg-btnSendWa'); if (b) b.setAttribute('href', '#'); clearTimeout(SG.prepT); SG.prepT = setTimeout(sgPrepSend, 150); }
function sgPrepSend() {
  if (!sg$('sg-btnSendWa')) return;
  ++SG.prepSeq; const b = sgBuildBody();
  SG.prep = b;
  sg$('sg-btnSendWa').setAttribute('href', b.err ? '#' : sgWaLink(b.d.q, sgLinkMsg(b.d, b.link, b.vcode)));
}
function sgFormErr(t) { const e = sg$('sg-formErr'); if (!e) return; e.hidden = !t; e.textContent = t || ''; }
async function sgSaveRecord(prepared, sending) {
  const b = prepared || sgBuildBody();
  sgFormErr(b.err || ''); if (b.err) { sg$('sg-formErr').scrollIntoView({ block: 'center' }); return false; }
  const d = b.d; store.set('yh_iska_me', { name: d.i, phone: d.w });
  const rec = SG.curRec;
  const body = { id: SG.cur || b.id, isNew: !SG.cur, baseVersion: rec ? rec._version : undefined, d, send: !!sending, pt: SG.pt, vcode: SG.vcode, idc: fxClientSer() || (rec && rec.idc) || null };
  const f = fxSerialize(); body.fill = f || (SG.kd === 'o' ? null : undefined);
  let out;
  try { out = await save('POST', '/api/sign/save', body, { label: 'שמירת חוזה', queue: false }); }
  catch (e) { sgFormErr(e.status === 409 ? 'החוזה עודכן ממכשיר אחר. חזור לרשימה ופתח אותו מחדש.' : ('השמירה נכשלה: ' + e.message)); return false; }
  const failed = await fxUploadNew(out.id, save);
  if (failed.length) setTimeout(() => toast('החוזה נשמר, אבל ' + failed.join(' ו') + ' לא נשמר. פתח את החוזה, צלם שוב ושמור.'), 400);
  SG.just = out.id; SG.justSent = !!sending; SG.cur = null; SG.curRec = null; SG.newId = null;
  location.hash = '#/contracts-manage';
  return true;
}
function sgOnSendWa(ev) {
  if (!SG.prep || SG.prep.err) {
    ev.preventDefault();
    if (SG.prep && SG.prep.err) { sgFormErr(SG.prep.err); sg$('sg-formErr').scrollIntoView({ block: 'center' }); }
    else sgPrepSend();
    return;
  }
  sgFormErr('');
  sgSaveRecord(SG.prep, true);
}
export async function sgPdfOf(d, name) {
  const busy = busyOn('מכין קובץ PDF…');
  try { const res = await sgBuildPdf(d, null); downloadBlob(res.blob, sgFileBase(d) + ' - ' + sgSafeName(name || 'לקוח') + '.pdf'); }
  catch (e) { toast('לא הצלחנו להכין את הקובץ. נסה שוב.'); }
  finally { busy(); }
}
export function busyOn(t) { const el = document.createElement('div'); el.className = 'sg-busy'; el.textContent = t; document.body.appendChild(el); return () => el.remove(); }
// תצוגה כלקוח (sgShowClient במצב תצוגה מקדימה): מה שהלקוח יראה, בלי אימות
function sgPreview(d) {
  const oth = sgIsOther(d), nm = sgNm(d), P = sgPer(d.fq);
  const sum = oth ? '<div><span>החוזה</span><b>' + esc(nm || 'חוזה') + '</b></div><div><span>שם הלקוח</span><b>' + esc(d.o || '') + '</b></div>'
    : '<div><span>סכום ההשקעה</span><b>' + esc(sgFmtNum(d.a)) + ' ' + esc(d.c) + '</b></div><div><span>מועד הפירעון</span><b>' + esc(sgFmtG(d.r)) + '</b></div><div><span>סוג ההחזר</span><b>' + (d.fq === 'w' ? 'שבועי' : 'חודשי') + '</b></div><div><span>מספר תשלומים</span><b>' + esc(d.n || 1) + '</b></div><div><span>החזר ' + P.word + '</span><b>' + esc(sgTokenValue(P.tok, d)) + '</b></div>';
  openSheet(`<div class="hd"><h2>תצוגה כלקוח</h2><button class="x" data-close aria-label="סגירה">×</button></div>
    <div class="note info">תצוגה מקדימה, האימות מדולג. כך הלקוח יראה את הדף אחרי האימות.</div>
    <h2 style="margin:8px 0 2px">${esc(sgTitle(d))}</h2><p class="small muted" style="margin:0 0 10px">${esc((d.i ? d.i + ' שלח לך ' : 'נשלח לך ') + (nm ? 'את ״' + nm + '״' : (oth ? 'חוזה' : 'היתר עסקה')) + ' לחתימה.')}</p>
    <div class="card sg-summary">${sum}</div><div class="sgp">${sgPaperHTML(d, null)}</div>`);
}

/* ---------- HTML של הטופס (1562-1684) ---------- */
function formHTML() {
  return `<form id="sg-edit" data-kd="" autocomplete="off" novalidate style="display:flex;flex-direction:column;gap:12px">
  <div class="card" style="display:flex;flex-direction:column;gap:10px;margin:0">
    <h2 id="sg-edit-title" style="margin:0">חוזה חדש</h2>
    <div class="f"><span id="sg-kindLbl">סוג החוזה</span>
      <div class="sg-seg" role="radiogroup" aria-labelledby="sg-kindLbl" id="sg-kindSeg"><button type="button" role="radio" aria-checked="false" data-kd="h">היתר עסקה</button><button type="button" role="radio" aria-checked="false" data-kd="o">חוזה אחר</button></div>
      <span class="small muted" id="sg-kindHint" style="font-weight:400"></span></div>
    <label class="f sg-needkind" for="sg-fName">שם החוזה (חובה)<input class="in" id="sg-fName" type="text" maxlength="120" autocomplete="off" placeholder="לדוגמה: הסכם שכירות, רחוב הרצל 12"></label>
    <span class="small muted sg-needkind" style="margin-top:-6px">השם מופיע ברשימה ובחיפוש, והוא הכותרת של החוזה, של דף החתימה שהלקוח מקבל, של הודעת הוואטסאפ ושל קובץ ה-PDF.</span>
    <div class="row sg-needkind"><button type="button" class="btn plain sm" id="sg-btnClear">ניקוי טופס</button><div class="row" id="sg-clearAsk" hidden><span class="small">לנקות את כל מה שכתוב בטופס? חוזים שמורים לא נמחקים.</span><button class="btn danger sm" type="button" id="sg-clearYes">כן, נקה</button><button class="btn plain sm" type="button" id="sg-clearNo">ביטול</button></div></div>
    <div class="sg-box sg-needkind">
      <label class="f" for="sg-pick">בחירת לקוח מהתוכנה<input class="in" id="sg-pick" type="search" placeholder="הקלד שם לקוח מהפיצול, מהאיסוף או מההלוואות" autocomplete="off"></label>
      <div id="sg-pick-res" class="sg-pick-res"></div>
      <span class="small muted" id="sg-pick-note">בוחרים לקוח, והשם והטלפון שלו מתמלאים לבד.</span>
    </div>
    ${fxIdBoxHTML()}
    <div class="sg-box sg-h-only sg-needkind">
      <b>יש כבר חוזה מודפס או בצילום מסך?</b>
      <input id="sg-imp-file" type="file" accept="image/*" hidden>
      <div class="row"><button type="button" class="btn ghost" id="sg-imp">העלאת צילום מסך של חוזה</button></div>
      <span class="small muted" id="sg-imp-st"></span>
    </div>
    <div class="sg-box sg-o-only sg-needkind">
      <b>סריקת חוזה</b>
      <input id="sg-oscan-file" type="file" accept="image/*,application/pdf,.pdf" multiple hidden>
      <div class="row"><button type="button" class="btn ghost" id="sg-oscan">סריקה: צילום, צילום מסך או PDF</button><button type="button" class="btn plain sm" id="sg-oscanStop" hidden>עצירה</button></div>
      <span class="small muted" id="sg-oscan-st"></span>
    </div>
    <div class="grid sg-needkind">
      <label class="f sg-h-only" for="sg-fInvestor">שם המשקיע (המלווה)<input class="in" id="sg-fInvestor" type="text"></label>
      <label class="f sg-o-only" for="sg-fSender">השם שלך (מי ששולח את החוזה)<input class="in" id="sg-fSender" type="text" autocomplete="off"></label>
      <label class="f" for="sg-fOperator"><span>שם הלקוח<span class="sg-h-only"> (המפעיל)</span><span class="sg-o-only"> (מי שחותם)</span></span><input class="in" id="sg-fOperator" type="text"></label>
      <label class="f" for="sg-fOpId">ת.ז. הלקוח (לא חובה)<input class="in n" id="sg-fOpId" type="text" inputmode="numeric"></label>
      <label class="f" for="sg-fClientPhone">וואטסאפ הלקוח (חובה)<input class="in n" id="sg-fClientPhone" type="tel" inputmode="tel" placeholder="050-0000000"></label>
    </div>
    <span class="small muted sg-needkind" style="margin-top:-6px">הלקוח יוכל לחתום רק אחרי שיקליד את המספר הזה ואת קוד האימות שנשלח אליו בוואטסאפ.</span>
    <div class="grid sg-h-only">
      <label class="f" for="sg-fAmount">סכום ההשקעה<input class="in n" id="sg-fAmount" type="text" inputmode="decimal"></label>
      <label class="f" for="sg-fCur">מטבע<select class="in" id="sg-fCur"><option value="₪">₪ שקל</option><option value="$">$ דולר</option><option value="€">€ אירו</option></select></label>
      <label class="f" for="sg-fProfit">סכום הרווח המוסכם<input class="in n" id="sg-fProfit" type="text" inputmode="decimal"></label>
    </div>
    <div class="f sg-h-only"><span id="sg-freqLbl">סוג ההחזר</span>
      <div class="sg-seg" role="radiogroup" aria-labelledby="sg-freqLbl" id="sg-freqSeg"><button type="button" role="radio" aria-checked="true" data-fq="m">חודשי</button><button type="button" role="radio" aria-checked="false" data-fq="w">שבועי</button></div></div>
    <div class="grid sg-h-only">
      <div class="f"><label for="sg-fPayments" id="sg-lblPayments">מספר תשלומים חודשיים</label><input class="in n" id="sg-fPayments" type="text" inputmode="numeric" placeholder="1"><span class="small muted" id="sg-payHint" style="font-weight:400"></span><span class="small" style="color:var(--err-fg)" id="sg-repayHint"></span></div>
      <div class="f"><label for="sg-fMonthly" id="sg-lblMonthly">החזר חודשי</label><input class="in n" id="sg-fMonthly" type="text" inputmode="decimal" placeholder="מחושב אוטומטית"><span class="small muted" style="font-weight:400">מתמלא לבד מהסכום הכולל חלקי מספר התשלומים. אפשר לכתוב סכום אחר.</span><span class="small" style="color:var(--err-fg)" id="sg-monthlyHint"></span></div>
    </div>
    <div class="row sg-h-only"><button type="button" class="btn ghost sm" id="sg-btnFitRepay" hidden>קבע את התשלום האחרון כמועד הפירעון</button><button type="button" class="btn ghost sm" id="sg-btnPayClause" hidden>הוספת סעיף תשלומים לחוזה</button></div>
    <div class="grid sg-needkind">
      <label class="f sg-h-only" for="sg-fDate">תאריך העסקה<input class="in" id="sg-fDate" type="date"></label>
      <label class="f sg-h-only" for="sg-fRepay">מועד הפירעון<input class="in" id="sg-fRepay" type="date"></label>
      <label class="f sg-h-only" for="sg-fPlace">מקום החתימה<input class="in" id="sg-fPlace" type="text"></label>
      <label class="f" for="sg-fPhone">וואטסאפ שלך לקבלת החתום<input class="in n" id="sg-fPhone" type="tel" inputmode="tel"></label>
    </div>
  </div>
  <div class="card sg-needkind" style="display:flex;flex-direction:column;gap:10px;margin:0">
    <div class="sg-o-only"><h2 style="margin:0">נוסח החוזה</h2><p class="small muted" style="margin:4px 0 0">הטקסט נשמר ונשלח בדיוק כמו שהוא כתוב כאן: מה שכתוב הוא מה שהלקוח רואה וחותם עליו. אפשר לכתוב, להדביק או לסרוק.</p></div>
    <div class="sg-h-only"><h2 style="margin:0">נוסח ההיתר</h2><p class="small muted" style="margin:4px 0 0">הנוסח כתוב כתבנית. מה שבסוגריים מסולסלים, כמו {{לקוח}}, הוא שדה שמתמלא מהקוביות. הפסקה הראשונה היא הפתיח וכל פסקה אחריה ממוספרת. הפרד פסקאות בשורה ריקה.</p></div>
    <div id="sg-reviewBox" class="sg-h-only" style="display:flex;flex-direction:column;gap:8px" hidden></div>
    ${fxFillBoxHTML()}
    <textarea id="sg-fText" class="in sg-doc" dir="rtl" aria-label="נוסח ההיתר"></textarea>
    <div id="sg-fxPv" class="fx-pv sg-o-only" dir="auto" aria-label="נוסח החוזה עם השדות למילוי" hidden></div>
    <span class="small muted num sg-o-only" id="sg-oMeter"></span>
    <div class="row sg-h-only"><button type="button" class="btn ghost sm" id="sg-btnReview">בדיקת הנוסח עם Claude</button><button type="button" class="btn plain sm" id="sg-btnResetText">איפוס לנוסח המקורי</button></div>
    <div class="f sg-h-only">
      <span>הוספת שדה לנוסח</span>
      <p class="small muted" style="margin:0;font-weight:400">סמן בנוסח את מה שמשתנה מלקוח ללקוח (שם, כתובת, סכום), הקלד שם לשדה ולחץ ״הפוך לשדה״. הוא יהפוך לקובייה למילוי והחוזה יתעדכן מיד. בלי סימון, השדה ייכנס במקום הסמן.</p>
      <div class="row"><input class="in" id="sg-newFieldName" type="text" placeholder="שם השדה, למשל כתובת לקוח" style="flex:2 1 180px;width:auto"><button type="button" class="btn ghost sm" id="sg-btnNewField">הפוך לשדה</button></div>
      <div id="sg-tokChips" class="sg-chips"></div>
    </div>
    <div id="sg-customCubes" class="grid sg-h-only"></div>
    <div class="sg-box"><h3 style="margin:0">כך ייראה החוזה</h3><div id="sg-livePaper" class="sgp"></div></div>
    <p class="note warn sg-h-only" style="margin:0">הנוסח המקורי הוא נוסח כללי ומקובל. כדאי שרב או דיין יאשרו נוסח לפני שימוש.</p>
  </div>
  <div class="note err" id="sg-formErr" hidden></div>
  <div class="sg-sendbar sg-needkind">
    <a class="btn wa" id="sg-btnSendWa" href="#" target="_blank" rel="noopener">שמירה ושליחה בוואטסאפ ללקוח</a>
    <span class="small muted">נשמר ונפתח וואטסאפ עם הלקוח מהחוזה, ההודעה מוכנה עם הקישור לדף החתימה וקוד האימות. נשאר ללחוץ שלח.</span>
    <div class="row">
      <button type="button" class="btn ghost sm" id="sg-btnSendPdf">שליחת החוזה כקובץ PDF</button>
      <button type="submit" class="btn ghost sm" id="sg-btnSave1">שמירה בלי שליחה</button>
      <button type="button" class="btn ghost sm" id="sg-btnPreview">תצוגה כלקוח</button>
      <a class="btn plain sm" href="#/contracts-manage" id="sg-btnCancelEdit">חזרה לרשימה</a>
    </div>
  </div>
</form>`;
}

/* ---------- עיצוב ---------- */
let cssDone = false;
export function formCss() {
  injectCss(); if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
.sg-box{border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--surface2);display:flex;flex-direction:column;gap:8px}
.sg-seg{display:inline-flex;align-self:flex-start;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--field)}
.sg-seg button{appearance:none;border:0;background:transparent;color:var(--muted);padding:8px 22px;font:inherit;font-weight:600;cursor:pointer;min-height:44px}
.sg-seg button+button{border-inline-start:1px solid var(--line)}
.sg-seg button[aria-checked="true"]{background:var(--accent);color:var(--accent-fg)}
.sg-seg button[disabled]{opacity:.5;cursor:not-allowed}
#sg-edit[data-kd=""] .sg-needkind{display:none!important}
#sg-edit:not([data-kd="h"]) .sg-h-only{display:none!important}
#sg-edit:not([data-kd="o"]) .sg-o-only{display:none!important}
.sg-pick-res{display:flex;flex-direction:column;gap:4px}.sg-pick-res:empty{display:none}
.sg-pick-res button{appearance:none;display:flex;justify-content:space-between;gap:10px;align-items:center;width:100%;text-align:start;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:6px;padding:8px 12px;cursor:pointer;min-height:44px}
.sg-pick-res button:hover{border-color:var(--accent);background:var(--accent-soft)}
.sg-pick-res .sg-src{font-size:12px;color:var(--muted)}
.fx-hd{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.fx-chip{font-size:12.5px;font-weight:700;border-radius:999px;padding:2px 11px;background:var(--surface);color:var(--muted);border:1px solid var(--line);white-space:nowrap}
.fx-chip.on{background:var(--ok-bg);color:var(--ok-fg);border-color:transparent}
.fx-sides{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fx-side{border:1px solid var(--line);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:8px;background:var(--surface);min-width:0}
.fx-side .row{gap:6px}
.fx-th{appearance:none;width:100%;height:112px;border-radius:6px;background:var(--field);display:grid;place-items:center;overflow:hidden;color:var(--muted);font:inherit;font-size:13.5px;line-height:1.35;border:1px dashed var(--line);cursor:pointer;padding:0;text-align:center}
.fx-th img{width:100%;height:100%;object-fit:cover;display:block}
.fx-sr{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;clip:rect(0 0 0 0);pointer-events:none}
.fx-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:10px;border-top:1px solid var(--line)}
.fx-form[hidden],.fx-sum[hidden]{display:none}
.fx-wide{grid-column:1/-1}
.fx-good{color:var(--ok-fg);font-weight:600}.fx-bad{color:var(--err-fg);font-weight:600}
.fx-sum{padding:12px;border-radius:8px;background:var(--ok-bg);display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.fx-sum dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 14px;width:100%}
.fx-sum dl div{display:contents}.fx-sum dt{color:var(--muted);font-size:13px}.fx-sum dd{margin:0;font-weight:600;overflow-wrap:anywhere;color:var(--fg)}
.fx-chat{display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto}.fx-chat:empty{display:none}
.fx-msg{max-width:92%;padding:9px 12px;border-radius:12px;font-size:14.5px;line-height:1.5;overflow-wrap:anywhere}
.fx-msg.bot{align-self:flex-start;background:var(--accent-soft);color:var(--fg);border-start-start-radius:4px}
.fx-msg.me{align-self:flex-end;background:var(--surface);border:1px solid var(--line);border-start-end-radius:4px}
.fx-qr{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.fx-spin{display:inline-block;width:13px;height:13px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;vertical-align:-2px;margin-inline-end:7px;animation:fxspin .8s linear infinite}
@keyframes fxspin{to{transform:rotate(360deg)}}
.fx-chatin{display:flex;gap:8px}.fx-chatin[hidden]{display:none}.fx-chatin .in{flex:1;min-width:0;font-size:16px}
.fx-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--muted)}
.fx-legend i{display:inline-block;width:13px;height:13px;border-radius:3px;border:1.5px solid;vertical-align:-2px;margin-inline-end:5px}
.fx-legend i.ok{background:var(--ok-bg);border-color:var(--ok-fg)}.fx-legend i.miss{background:var(--err-bg);border-color:var(--err-fg)}.fx-legend i.sig{border-style:dashed;border-color:var(--muted)}
.fx-pv{background:var(--field);border:1px solid var(--line);border-radius:6px;padding:12px;min-height:300px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;font-family:"Frank Ruhl Libre","David","Times New Roman",serif;font-size:16.5px;color:var(--fg);text-align:start}
.fx-pv[hidden]{display:none}
.fx-f{font:inherit;line-height:1.3;border-radius:5px;padding:0 5px;margin:0 1px;cursor:pointer;border:1.5px solid;vertical-align:baseline;color:var(--fg)}
.fx-f.ok{background:var(--ok-bg);border-color:var(--ok-fg)}
.fx-f.miss{background:var(--err-bg);border-color:var(--err-fg);color:var(--err-fg);font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;font-size:.82em;font-weight:600}
.fx-f.sig{background:transparent;border-style:dashed;border-color:var(--muted);color:var(--muted);font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;font-size:.82em}
.fx-ctx{background:var(--surface2);border-radius:6px;padding:8px 10px;font-family:"Frank Ruhl Libre","David",serif;font-size:15px;color:var(--fg)!important;overflow-wrap:anywhere}
#sg-fxSlotIn{font-size:16px}
@media (max-width:380px){.fx-form{grid-template-columns:1fr}}
.sg-doc.sg-live{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
textarea.in.sg-doc{min-height:300px;line-height:1.75;font-family:"Frank Ruhl Libre","David","Times New Roman",serif;font-size:16.5px}
textarea.in.sg-doc[hidden]{display:none}
.sg-issue{background:var(--field);border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.sg-issue .q{font-family:"Frank Ruhl Libre",serif;background:var(--warn-bg);color:var(--warn-fg);padding:4px 8px;border-radius:4px;overflow-wrap:anywhere;margin:0}
.sg-issue .fx{color:var(--ok-fg);margin:0}.sg-issue p{margin:0}
.sg-chips{display:flex;flex-wrap:wrap;gap:6px}
.sg-sendbar{position:sticky;bottom:calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 6px);z-index:4;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 -6px 18px rgba(16,32,64,.08)}
.sg-sendbar .btn.wa{min-height:52px;font-size:17px;width:100%}
.sg-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.sg-acts select.in{width:auto;min-width:0;padding:5px 8px;font-size:13px;min-height:36px}
.sg-rec{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;margin-bottom:10px}
.sg-rec.just{border:2px solid var(--accent)}
.sg-rec .sg-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.sg-rec .sg-nm{font-weight:700;font-size:16px;overflow-wrap:anywhere}
.sg-rec .sg-meta{font-size:13px;color:var(--muted);display:flex;gap:4px 14px;flex-wrap:wrap}
.sg-st{font-size:12.5px;font-weight:700;border-radius:999px;padding:2px 11px;white-space:nowrap;border:1px solid transparent}
.sg-st.draft{background:var(--surface2);color:var(--muted);border-color:var(--line)}
.sg-st.sent{background:var(--warn-bg);color:var(--warn-fg)}
.sg-st.signed{background:var(--ok-bg);color:var(--ok-fg)}
.sg-signed{font-size:13px;color:var(--ok-fg);background:var(--ok-bg);border-radius:6px;padding:6px 10px}
.sg-files{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface2)}
.sg-files>div{display:flex;flex-direction:column;gap:4px}
.sg-files img{max-width:min(100%,320px);max-height:220px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px}
.sg-sendnow{border:2px solid var(--accent)}
.sg-qgrp{font-size:12.5px;font-weight:700;color:var(--accent-ink);padding:6px 2px}
.sg-recvbox{border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--accent-soft);display:flex;flex-direction:column;gap:10px;margin-bottom:12px}`;
  document.head.appendChild(s);
}

/* ---------- פתיחת הטופס ---------- */
// rec: חוזה שמור (עריכה) או null. dup: נתוני חוזה לשכפול
export function renderEditor(view, rec, dup) {
  formCss();
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">חוזים לחתימה</div><h1>${rec ? 'עריכת חוזה' : 'חוזה חדש'}</h1></div><a class="btn sm" href="#/contracts-manage">לרשימה</a></div>` + formHTML();
  fxBind({ SG, sgF, onTemplateChange: sgOnTemplateChange, schedulePrep: sgSchedulePrep, refreshDefault: sgRefreshDefaultText });
  bind();
  SG.cur = rec ? rec.id : null; SG.curRec = rec || null;
  if (dup) { sgFillForm(dup, null); sg$('sg-edit-title').textContent = 'עותק של חוזה: ' + (sgNm(dup) || dup.o || ''); }
  else sgFillForm(rec ? rec.d : {}, rec, rec ? undefined : '');
  fxIdRender(); fxRender();
  return () => { clearTimeout(SG.prepT); clearTimeout(SG.pvT); SG.os.seq++; FX.seq++; };
}
function bind() {
  fxInit();
  sg$('sg-pick').addEventListener('input', sgRenderPick);
  sg$('sg-pick-res').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) sgPick(+b.dataset.pick); });
  sgF('fRepay').addEventListener('input', () => { SG.repayTouched = !!sgF('fRepay').value; });
  sg$('sg-freqSeg').addEventListener('click', ev => { const b = ev.target.closest('[data-fq]'); if (b) sgSetFreq(b.getAttribute('data-fq')); });
  sg$('sg-btnFitRepay').addEventListener('click', () => { SG.repayTouched = false; sgRefreshDefaultText(); });
  ['fName', 'fSender', 'fInvestor', 'fOperator', 'fOpId', 'fAmount', 'fCur', 'fProfit', 'fPayments', 'fDate', 'fRepay', 'fPlace'].forEach(f => sgF(f).addEventListener('input', sgRefreshDefaultText));
  sg$('sg-kindSeg').addEventListener('click', ev => { const b = ev.target.closest('[data-kd]'); if (b && !b.disabled) sgSetKind(b.getAttribute('data-kd')); });
  sg$('sg-btnClear').addEventListener('click', () => { sg$('sg-clearAsk').hidden = false; sg$('sg-btnClear').hidden = true; });
  sg$('sg-clearNo').addEventListener('click', sgClearAskHide);
  sg$('sg-clearYes').addEventListener('click', sgClearForm);
  sg$('sg-oscan').addEventListener('click', () => { if (!aiAvailable()) { toast(AI_OFF); } sg$('sg-oscan-file').value = ''; sg$('sg-oscan-file').click(); });
  sg$('sg-oscan-file').addEventListener('change', function () { const fl = Array.from(this.files || []); this.value = ''; if (fl.length) sgOScan(fl); });
  sg$('sg-oscanStop').addEventListener('click', () => { SG.os.stop = true; });
  sgF('fText').addEventListener('input', () => { SG.textTouched = true; if (SG.issues.length) sgRenderIssues(); sgOnTemplateChange(); });
  sgF('fText').addEventListener('keydown', e => { if (SG.os.busy && e.key !== 'Tab') e.preventDefault(); });
  sg$('sg-customCubes').addEventListener('input', ev => { const n = ev.target.getAttribute('data-cf'); if (n == null) return; SG.cf[n] = ev.target.value; sgRefreshPreview(); });
  sg$('sg-tokChips').addEventListener('click', ev => { const b = ev.target.closest('[data-tok]'); if (b) sgPutToken(b.getAttribute('data-tok'), false); });
  sg$('sg-btnNewField').addEventListener('click', sgNewField);
  sg$('sg-btnPayClause').addEventListener('click', sgAddPayClause);
  sgF('fMonthly').addEventListener('input', () => { SG.monthlyTouched = sgF('fMonthly').value.trim() !== ''; sgRefreshPreview(); sgUpdatePayUI(); });
  sg$('sg-btnResetText').addEventListener('click', () => { SG.textTouched = false; sgRefreshDefaultText(); });
  const form = sg$('sg-edit');
  form.addEventListener('submit', ev => { ev.preventDefault(); sgSaveRecord(null, false); });
  form.addEventListener('input', sgSchedulePrep);
  form.addEventListener('change', sgSchedulePrep);
  form.addEventListener('click', ev => { if (ev.target.closest('[data-fq],[data-tok],[data-ia],#sg-btnNewField,#sg-btnPayClause,#sg-btnResetText,#sg-btnFitRepay,[data-pick]')) setTimeout(sgSchedulePrep, 0); });
  sg$('sg-btnSendWa').addEventListener('click', sgOnSendWa);
  sg$('sg-btnSendPdf').addEventListener('click', () => { const d = sgReadForm(), err = sgValidate(d); if (err) { sgFormErr(err); return; } sgPdfOf(d, d.o); });
  sg$('sg-btnPreview').addEventListener('click', () => { const d = sgReadForm(), err = sgValidate(d); sgFormErr(err); if (err) return; sgPreview(d); });
  sg$('sg-imp').addEventListener('click', () => sg$('sg-imp-file').click());
  sg$('sg-btnReview').addEventListener('click', sgRunReview);
  sg$('sg-reviewBox').addEventListener('click', sgOnIssueClick);
  sg$('sg-imp-file').addEventListener('change', function () { sgOnImport(this.files && this.files[0]); });
}
