// יומן גובים ושליחים — מסך החיפוש, הקבוצות, הסיכומים וחלונות העריכה. הועתק כמו שהוא מהתוכנה המקורית (app.html 10100-10627),
// עם מספרי שורות. הותאמו רק נקודות המגע עם הסביבה: שמירה לשרת (lgCommit, lgTrSave), חלון העריכה (ddOpen/ddClose → openSheet),
// ורענון אחרי שינוי (lgDirty). החישובים עצמם ב-ledger-calc.js.
import { get, save } from '../api.js';
import { toast, openSheet, closeSheet } from '../ui.js';
import { App } from '../app.js';
import { r2, num, normTime, normStatus, ST_GOT, ST_NOT, ST_PASS, ST_NA, stripInv, cleanColl, collKey, NOC } from '../calc.js';
import { S, LG, buildLedger, fmtOrig as fmt, isoLabel, weekday, addDays, lgUi, lgView, lgLedger, lgRange, lgText, lgByNorm, lgPlan, lgRunOps, lgFind, lgHasV, LG_SELF, LG_PMT, LG_ST, LG_TST, LG_STL, lgRcLabel } from './ledger-calc.js';

// ---- סביבה (במקום הפונקציות הכלליות של המקור) ----
const $ = (s, r) => (r || document).querySelector(s);                                   // app.html 1840
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));                    // app.html 1841
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); // app.html 1842
const uid = () => Math.random().toString(36).slice(2, 9);                                // app.html 1864
const todayISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* */ }
  try { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); document.body.removeChild(a); return ok; } catch { return false; }
}
let COLLS = [];
const knownCollectors = () => COLLS;
Object.assign(LG, { t: {}, dirtyTab: { w: true, c: true }, busy: false, built: {}, shown: {}, dlg: null, bk: true });
let SHEET = null;
function ddOpen(title, sub, html) {
  SHEET = openSheet(`<div class="hd"><div><h2>${esc(title)}</h2>${sub ? `<div class="small muted">${esc(sub)}</div>` : ''}</div><button class="x" data-close aria-label="סגירה">×</button></div><div id="dd-body">${html}</div>`, { onClose: () => { SHEET = null; } });
  const dd = $('#dd-body'); if (!dd) return;
  lgBindDd(dd);
  $$('[data-dd="close"]', dd).forEach(b => b.addEventListener('click', ddClose)); // כפתורי ״ביטול״ של המקור
}
function ddClose() { if (SHEET) { const s = SHEET; SHEET = null; s.close(); } else closeSheet(); }
const sheetOpen = () => !!document.querySelector('#sheet:not([hidden])');

// ---- טעינת הנתונים מהשרת (במקום S.s.list ו-settings/transfers של המקור) ----
let TRV = null;
export async function lgLoad() {
  const d = await get('/api/ledger/data');
  COLLS = d.collectors || [];
  TRV = d.transfers ? d.transfers._version : null;
  LG.trAt = d.transfers ? (+d.transfers.at || 0) : 0;
  buildLedger(d.accounts, d.transfers ? d.transfers.list : []);
  return d;
}
function lgDirty() { LG.cache = null; LG.ver++; lgSchedule('w'); }

/* ---- app.html 10100-10262 (verbatim) ---- */
const lgPl=(n,one,many)=>n===1?one:n+' '+many;
const lgMoney=n=>'<span class="num'+(n<0?' neg':'')+'">'+fmt(n)+' ₪</span>';
const LG_ICO='<svg class="sg-sico" aria-hidden="true" viewBox="0 0 24 24" width="21" height="21"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 21 21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
function lgSkeleton(k){
  const sel=(f,opts)=>'<select class="in" data-lg="'+f+'">'+opts+'</select>';
  return '<div class="phd"><h2 class="lg-h">חיפוש איסופים לפי גובה</h2><span class="small">אותן רשומות בטאב איסוף יומי ובטאב חשבון גובים</span></div>'+
    '<div class="sg-search lg-search" role="search" dir="rtl">'+
      '<div class="sg-sbar">'+LG_ICO+'<input class="sg-sin" data-lg="q" type="search" dir="rtl" lang="he" placeholder="הקלד שם גובה, שליח או לקוח… למשל: בן" aria-label="חיפוש איסופים לפי שם לקוח, שם גובה או שם שליח" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">'+
      '<button class="sg-sclr" type="button" data-lg="clear" aria-label="ניקוי החיפוש וחזרה לרשימה המלאה" title="ניקוי החיפוש" hidden>×</button></div>'+
      '<div class="lg-chips" data-lg="chips"></div>'+
    '</div>'+
    '<div class="lg-dates">'+
      '<div class="ln-seg lg-seg" role="group" aria-label="יום או טווח"><button type="button" data-lg-mode="day" aria-pressed="true">יום</button><button type="button" data-lg-mode="range" aria-pressed="false">טווח תאריכים</button></div>'+
      '<label class="field lg-df">מתאריך<input class="in" type="date" data-lg="from"></label>'+
      '<label class="field lg-df" data-lg="towrap" hidden>עד תאריך<input class="in" type="date" data-lg="to"></label>'+
      '<div class="row lg-quick"><button class="btn plain sm" type="button" data-lg-quick="tab">התאריך בטאב</button><button class="btn plain sm" type="button" data-lg-quick="y">אתמול</button><button class="btn plain sm" type="button" data-lg-quick="7">7 ימים</button><button class="btn plain sm" type="button" data-lg-quick="m">החודש</button></div>'+
    '</div>'+
    '<details class="lg-flt" data-lg="flt"><summary>מסננים <span class="pill act" data-lg="fn" hidden></span></summary>'+
      '<div class="grid2 lg-fgrid">'+
        '<label class="field">גובה אחראי'+sel('rc','')+'</label>'+
        '<label class="field">מי אסף בפועל'+sel('by','')+'</label>'+
        '<label class="field">סטטוס איסוף'+sel('st',LG_ST.map(o=>'<option value="'+o[0]+'">'+esc(o[1])+'</option>').join(''))+'</label>'+
        '<label class="field">סטטוס העברת כספים'+sel('tst',LG_TST.map(o=>'<option value="'+o[0]+'">'+esc(o[1])+'</option>').join(''))+'</label>'+
      '</div><div class="row"><button class="btn plain sm" type="button" data-lg="freset">איפוס מסננים</button></div>'+
    '</details>'+
    '<div class="lg-out" data-lg="out" aria-live="polite"></div>';
}
const lgEl=(k,f)=>{ const p=$('#lg-'+k); return p?p.querySelector('[data-lg="'+f+'"]'):null; };
function lgFillSelects(k){
  const u=lgUi(k), L=lgLedger();
  const rcs=new Map(), bys=new Map();
  L.recs.concat(L.exps).forEach(r=>{ if(!rcs.has(r.rck)) rcs.set(r.rck,lgRcLabel(r.rc)); if(r.byk&&r.byk!==LG_SELF&&!bys.has(r.byk)) bys.set(r.byk,r.by); });
  L.trs.forEach(t=>{ if(!rcs.has(t.tok)) rcs.set(t.tok,lgRcLabel(t.to)); if(t.fromk&&!bys.has(t.fromk)) bys.set(t.fromk,t.from); });
  const o=(v,l,cur)=>'<option value="'+esc(v)+'"'+(v===cur?' selected':'')+'>'+esc(l)+'</option>';
  const srt=m=>Array.from(m.entries()).sort((x,y)=>String(x[1]).localeCompare(String(y[1]),'he'));
  const rs=lgEl(k,'rc'), bs=lgEl(k,'by');
  if(rs) rs.innerHTML=o('','כל הגובים',u.rc)+srt(rcs).map(([v,l])=>o(v,l,u.rc)).join('');
  if(bs) bs.innerHTML=o('','כולם',u.by)+o(LG_SELF,'הגובה עצמו',u.by)+o('~','לא צוין',u.by)+srt(bys).map(([v,l])=>o(v,'שליח: '+l,u.by)).join('');
  const st=lgEl(k,'st'); if(st) st.value=u.st; const ts=lgEl(k,'tst'); if(ts) ts.value=u.tst;
  const nf=(u.rc?1:0)+(u.by?1:0)+(u.st!=='done'?1:0)+(u.tst!=='all'?1:0), fn=lgEl(k,'fn');
  if(fn){ fn.hidden=!nf; fn.textContent=nf+' פעילים'; }
}
function lgSyncDates(k){
  const u=lgUi(k), R=lgRange(k), p=$('#lg-'+k); if(!p) return;
  $$('[data-lg-mode]',p).forEach(b=>b.setAttribute('aria-pressed',String((u.auto?'day':u.mode)===b.dataset.lgMode)));
  const f=lgEl(k,'from'), t=lgEl(k,'to'), tw=lgEl(k,'towrap');
  const range=!u.auto&&u.mode==='range';
  if(f&&f!==document.activeElement) f.value=R[0];
  if(t&&t!==document.activeElement) t.value=R[1];
  if(tw) tw.hidden=!range;
  const fl=f&&f.parentNode; if(fl&&fl.firstChild&&fl.firstChild.nodeType===3) fl.firstChild.nodeValue=range?'מתאריך':'תאריך';
  const qb=p.querySelector('[data-lg-quick="tab"]'); if(qb) qb.setAttribute('aria-pressed',String(!!u.auto));
}
const LG_MT={n:'לקוח',rc:'גובה',by:'שליח'};
function lgRecHTML(r,i,V){
  const m=V.mt.get(r.id)||[], part=r.st==='part', bal=Math.max(0,r2(r.due-r.got));
  const stc=r.st==='full'?'ok':(r.st==='part'?'warn':(r.st==='not'?'err':''));
  const meta=[];
  if(r.t) meta.push('<span class="num">'+esc(r.t)+'</span>');
  if(V.multiDay||r.dates.length>1) meta.push(esc(r.dates.map(isoLabel).join(' → ')));
  meta.push('<span class="pill '+stc+'">'+esc(LG_STL[r.st]||r.st)+'</span>');
  if(part||(r.got<0.005&&r.due>0)) meta.push('צריך '+lgMoney(r.due)+(bal>0.004?' · יתרה '+lgMoney(bal):''));
  if(r.pmt) meta.push(esc(r.pmt));
  if(r.fee) meta.push((r.fee.n&&r.fee.n!=='עמלת שליח'?esc(r.fee.n):'עמלה')+' '+lgMoney(r.fee.a));
  if(r.nt) meta.push('<span class="lg-nt">'+esc(r.nt)+'</span>');
  const src=r.srcs.indexOf('c')>=0&&r.srcs.indexOf('w')>=0?'איסוף יומי + חשבון גובים':(r.srcs[0]==='c'?'חשבון גובים':'איסוף יומי');
  return '<li class="lg-r lg-'+r.st+'"><span class="lg-i num">'+i+'</span><div class="lg-rm">'+
    '<div class="lg-r1"><b class="lg-n">'+esc(r.n)+'</b>'+(r.pp?'<span class="spl">חלק <span class="num">'+esc(r.pp)+'</span></span>':'')+
      m.map(f=>'<span class="lg-mt lg-mt-'+f+'" title="נמצא לפי '+LG_MT[f]+'">'+LG_MT[f]+'</span>').join('')+
      '<span class="lg-amt">'+lgMoney(r.got)+'</span></div>'+
    '<div class="lg-r2">'+meta.join('<span class="lg-dot" aria-hidden="true">·</span>')+'<span class="lg-src">'+src+(r.draft?' · טיוטה':'')+'</span></div></div>'+
    '<button class="lg-ed" type="button" data-lg-ed="'+r.id+'" aria-label="עריכת פרטי האיסוף של '+esc(r.n)+'" title="עריכת פרטי האיסוף">✎</button></li>';
}
function lgGroupHTML(G,B,V,open){
  const key='g:'+B.rck+'|'+G.byk, lbl=G.type==='self'?'הגובה עצמו':(G.type==='cour'?'שליח: '+G.by:'לא צוין מי אסף');
  const head='<button class="lg-gh" type="button" data-lg-tg="'+esc(key)+'" aria-expanded="'+open+'"><span class="lg-car" aria-hidden="true">›</span>'+
    '<span class="lg-gt"><b>'+esc(lbl)+'</b><span class="small muted">'+lgPl(G.acts,'פעולה אחת','פעולות')+(G.recs.length>G.acts?' · '+lgPl(G.recs.length,'שורה אחת','שורות'):'')+'</span></span>'+
    '<span class="lg-gs">'+lgMoney(G.coll)+(G.type==='cour'&&G.held!==null?'<span class="pill '+(G.held>0.5?'warn':(G.held<-0.5?'err':'ok'))+'">'+(G.held>0.5?'אצלו '+fmt(G.held)+' ₪':(G.held<-0.5?'הועבר יותר מהנאסף':'הועבר הכל'))+'</span>':'')+'</span></button>';
  if(!open) return '<div class="lg-g lg-g-'+G.type+'">'+head+'</div>';
  let h='<div class="lg-gb">';
  h+=G.recs.length?'<ol class="lg-rl">'+G.recs.map((r,i)=>lgRecHTML(r,i+1,V)).join('')+'</ol>':'<div class="small muted">אין איסופים בקבוצה הזו בטווח שנבחר.</div>';
  if(G.exps.length) h+='<div class="lg-sub"><b>הוצאות</b><ul class="lg-xl">'+G.exps.map(x=>'<li><span>'+esc(x.n)+(x.forRec?' <span class="small muted">(על האיסוף של '+esc(x.forRec.n)+')</span>':'')+(x.nf?' <span class="small muted">· לא מכספי האיסוף</span>':'')+(V.multiDay?' <span class="small muted">· '+esc(isoLabel(x.date))+'</span>':'')+'</span><span class="lg-xa">'+lgMoney(x.a)+'</span><button class="lg-ed sm" type="button" data-lg-ed="'+x.id+'" aria-label="עריכת ההוצאה '+esc(x.n)+'">✎</button></li>').join('')+'</ul></div>';
  if(G.trs.length) h+='<div class="lg-sub"><b>העברות ל'+esc(B.rc)+'</b><ul class="lg-xl">'+G.trs.map(t=>'<li><span>'+esc(isoLabel(t.date))+(t.t?' <span class="num">'+esc(t.t)+'</span>':'')+(t.nt?' · '+esc(t.nt):'')+'</span><span class="lg-xa">'+lgMoney(t.a)+'</span><button class="lg-ed sm" type="button" data-lg-tre="'+esc(t.id)+'" aria-label="עריכת ההעברה">✎</button></li>').join('')+'</ul></div>';
  const cells=[['סך האיסופים',G.coll],['הוצאות',-G.exp],['נטו',G.net]];
  if(G.type==='cour'&&G.held!==null){ cells.push(['הועבר ל'+B.rc,G.trans]); cells.push(['יתרה שטרם הועברה',G.held]); }
  h+='<div class="lg-gsum">'+cells.map(c=>'<div class="'+(c[0]==='נטו'?'hl':(c[0]==='יתרה שטרם הועברה'?(c[1]>0.5?'warn':'ok'):''))+'"><span>'+esc(c[0])+'</span><b>'+lgMoney(c[1])+'</b></div>').join('')+
    (G.type==='self'?'<div><span>הועבר לגובה</span><b class="small">הכסף אצל הגובה</b></div>':'')+(G.type==='unk'?'<div><span>אצל מי הכסף</span><b class="small">לא ידוע</b></div>':'')+(G.type==='cour'&&G.held===null?'<div><span>יתרה אצל השליח</span><b class="small">בחיפוש לפי שם הגובה או השליח</b></div>':'')+'</div>';
  if(G.bal>0.004) h+='<div class="small muted">יתרה שלא נאספה מהלקוחות בקבוצה: '+lgMoney(G.bal)+'</div>';
  h+='<div class="row lg-gact">'+(G.type==='cour'&&G.held!==null?'<button class="btn ghost sm" type="button" data-lg-tradd="'+esc(B.rck)+'|'+esc(G.byk)+'">+ העברה מ'+esc(G.by)+' ל'+esc(B.rc)+'</button>':'')+
    (G.recs.length||G.exps.length?'<button class="btn plain sm" type="button" data-lg-bulk="'+esc(key)+'">שיוך מחדש לכל הקבוצה</button>':'')+'</div>';
  return '<div class="lg-g lg-g-'+G.type+' open">'+head+h+'</div></div>';
}
function lgKpis(t,rc){
  const tile=(l,v,cls,sub)=>'<div class="kpi '+(cls||'')+'"><span class="kl">'+l+'</span><span class="kv num">'+v+'</span>'+(sub?'<span class="ks">'+sub+'</span>':'')+'</div>';
  let h='<div class="kpis lg-kpis">'+
    tile('לקוחות שנאסף מהם',String(t.clients))+tile('פעולות איסוף',String(t.acts),'',t.rows>t.acts?'<span>'+t.rows+' שורות מוצגות</span>':'')+
    tile('נאסף מהלקוחות',fmt(t.coll)+' ₪','lg-k-in')+tile('הוצאות ועמלות שליחים',fmt(t.exp)+' ₪','lg-k-x')+
    tile('נטו אחרי הוצאות',fmt(t.net)+' ₪','lg-k-net')+
    (t.cliOnly?tile('העברות ויתרות שליחים','—','lg-k-tr','<span>מוצגות בחיפוש לפי שם הגובה או השליח</span>'):
    tile('הועבר מהשליחים לגובה',fmt(t.trans)+' ₪','lg-k-tr','<span>העברה פנימית, לא הכנסה</span>')+
    tile('עדיין אצל השליחים',fmt(t.heldSum)+' ₪','lg-k-held',t.held.length?t.held.map(h=>'<span>'+esc(h.by)+': '+fmt(h.held)+' ₪</span>').join(''):'<span>אין יתרות</span>'))+
    (t.bal>0.004?tile('יתרה שלא נאספה',fmt(t.bal)+' ₪','lg-k-bal'):'')+'</div>';
  const where=[];
  if(t.hasSelf||t.trans) where.push('<span class="lg-w"><span>אצל '+esc(rc||'הגובים')+'</span>'+lgMoney(t.atColl)+'</span>');
  t.held.forEach(x=>where.push('<span class="lg-w cour"><span>אצל '+esc(x.by)+'</span>'+lgMoney(x.held)+'</span>'));
  if(Math.abs(t.unk)>0.004) where.push('<span class="lg-w unk"><span>לא צוין מי אסף</span>'+lgMoney(t.unk)+'</span>');
  if(where.length) h+='<div class="lg-where"><b class="small">איפה הכסף שנאסף</b><div class="row">'+where.join('')+'</div></div>';
  return h;
}
function lgRender(k){
  const p=$('#lg-'+k); if(!p) return;
  if(!LG.built[k]){ p.innerHTML=lgSkeleton(k); LG.built[k]=true; }
  LG.dirtyTab[k]=false;
  const u=lgUi(k), V=lgView(k), out=lgEl(k,'out');
  LG.shown=LG.shown||{}; LG.shown[k]=lgLedger();
  lgFillSelects(k); lgSyncDates(k);
  const qi=lgEl(k,'q'); if(qi&&qi!==document.activeElement&&qi.value!==u.q) qi.value=u.q;
  const clr=lgEl(k,'clear'); if(clr) clr.hidden=!(u.q||u.pin);
  const ch=lgEl(k,'chips');
  if(ch){
    if(u.pin) ch.innerHTML='<span class="small muted">מוצג:</span><span class="lg-chip on">'+LG_MT[u.pin.f]+' · '+esc(u.pin.l)+'<button type="button" data-lg-unpin aria-label="ביטול הבחירה">×</button></span>';
    else if(V.q&&V.chips.length) ch.innerHTML='<span class="small muted">בחר כדי לא לערבב:</span>'+V.chips.map(c=>'<button class="lg-chip" type="button" data-lg-pin="'+c.f+'" data-v="'+esc(c.v)+'" data-l="'+esc(c.l)+'">'+LG_MT[c.f]+' · '+esc(c.l)+' <span class="num">('+c.n+')</span></button>').join('');
    else ch.innerHTML='';
  }
  const rl=V.R[0]===V.R[1]?(weekday(V.R[0])+' '+isoLabel(V.R[0])):(isoLabel(V.R[0])+' – '+isoLabel(V.R[1]));
  const title=u.pin?(LG_MT[u.pin.f]+': '+u.pin.l):(V.q?'תוצאות עבור „'+u.q.trim()+'”':'כל האיסופים');
  let h='<div class="lg-cap"><b>'+esc(title)+'</b><span class="small muted">'+esc(rl)+'</span></div>';
  if(!V.blocks.length){
    h+='<div class="empty">'+(V.q||u.pin?'<b>לא נמצאו איסופים</b>אין התאמה לשם שהוזן בתאריכים ובמסננים שנבחרו. נסה טווח תאריכים רחב יותר או סטטוס „כל הסטטוסים”.':'<b>אין איסופים בתאריך הזה</b>בחר יום אחר או טווח תאריכים. שורות שטרם נאספו מוצגות בסטטוס „כל הסטטוסים”.')+'</div>';
    out.innerHTML=h; return;
  }
  const single=V.blocks.length===1?V.blocks[0].rc:'';
  h+=lgKpis(V.tot,single||(V.blocks.length>1?'הגובים':''));
  h+='<div class="row lg-acts"><button class="btn wa sm" type="button" data-lg="copy">העתק סיכום ופירוט לוואטסאפ</button><a class="btn ghost sm" data-lg="wa" target="_blank" rel="noopener" href="'+esc('https://wa.me/?text='+encodeURIComponent(lgText(V)))+'">שלח בוואטסאפ</a><span class="grow"></span><button class="btn ghost sm" type="button" data-lg-tradd="">+ העברה משליח לגובה</button></div>';
  const many=V.blocks.length>1, rows=V.tot.rows;
  h+=V.blocks.map(B=>{
    const bk='b:'+B.rck, bo=lgOpenState(u,bk,!many||V.blocks.length<=3||!!(V.q||u.pin));
    const t=B.tot;
    let s='<section class="lg-b'+(bo?' open':'')+'"><button class="lg-bh" type="button" data-lg-tg="'+esc(bk)+'" aria-expanded="'+bo+'"><span class="lg-car" aria-hidden="true">›</span>'+
      '<span class="lg-bt"><b>'+esc(B.rc)+'</b><span class="small muted">גובה אחראי · '+lgPl(t.clients,'לקוח אחד','לקוחות')+' · '+lgPl(t.acts,'פעולה אחת','פעולות')+'</span></span>'+
      '<span class="lg-bs"><span>נאסף '+lgMoney(t.coll)+'</span><span>נטו '+lgMoney(t.net)+'</span></span></button>';
    if(bo){
      s+='<div class="lg-bb">';
      if(many) s+=lgKpis(t,B.rc);
      s+=B.groups.map(G=>lgGroupHTML(G,B,V,lgOpenState(u,'g:'+B.rck+'|'+G.byk,rows<=60||B.groups.length===1))).join('');
      s+='</div>';
    }
    return s+'</section>';
  }).join('');
  const nt=[], inR=d=>d>=V.R[0]&&d<=V.R[1];
  const pn=V.notes.pair.filter(p=>inR(p.c)||inR(p.w)).reduce((a,b)=>a+b.n,0);
  if(pn) nt.push(pn+' שורות הופיעו גם באיסוף יומי וגם בחשבון גובים שנבנה ממנו, ונספרו פעם אחת.');
  const vd=V.notes.ver.filter(v=>inR(v.date)).map(v=>isoLabel(v.date)).filter((x,i,a)=>a.indexOf(x)===i);
  if(vd.length) nt.push('גרסה נוספת של רשימה לאותו תאריך ('+vd.join(', ')+') זהה ברובה ולא נספרה שוב.');
  if(V.notes.stale&&inR(S.w.date||'')) nt.push(V.notes.stale.n+' שורות בטיוטה של היום זהות לרשימה השמורה מ־'+isoLabel(V.notes.stale.date)+' ולא נספרו שוב.');
  const unk=V.blocks.some(B=>B.groups.some(g=>g.type==='unk'&&g.recs.length));
  if(unk) nt.push('איסופים בלי שם של מי שאסף מסומנים „לא צוין”. אפשר להשלים בלחיצה על ✎ או ב„שיוך מחדש לכל הקבוצה”.');
  if(V.blocks.some(B=>B.groups.some(g=>g.type==='cour'))) nt.push('היתרה אצל שליח מחושבת לפי הטווח שנבחר: נאסף, פחות הוצאות ששולמו מכספי האיסוף, פחות מה שהועבר לגובה.');
  if(nt.length) h+='<div class="note info small lg-notes">'+nt.map(esc).join('<br>')+'</div>';
  out.innerHTML=h;
}
function lgOpenState(u,key,def){ return Object.prototype.hasOwnProperty.call(u.open,key)?!!u.open[key]:!!def; }
function lgSchedule(k){ clearTimeout(LG.t[k]); LG.t[k]=setTimeout(()=>lgRender(k),140); }

/* ---- app.html 10357-10358 (verbatim) ---- */
function lgSetOpt(e,k,v){ if(lgHasV(v)) e[k]=v; else delete e[k]; }
function lgSavedMsg(res){ return res.draft&&!res.saved?'עודכן ברשימה הפתוחה בטאב. לשמירה קבועה לחץ „שמור” בטאב':(res.draft?'נשמר. בטאב הפתוח לחץ „שמור” כדי לשמור גם שם':'השינוי נשמר'); }

/* ---- app.html 10360-10564 (verbatim) ---- */
/* ---------- חלונות עריכה ---------- */
function lgDl(){
  const L=lgLedger(), rc=new Set(knownCollectors()), by=new Set();
  L.recs.concat(L.exps).forEach(r=>{ if(r.rc) rc.add(r.rc); if(r.by&&r.by!==LG_SELF) by.add(r.by); });
  L.trs.forEach(t=>{ if(t.from) by.add(t.from); if(t.to) rc.add(t.to); });
  const o=s=>Array.from(s).sort((a,b)=>a.localeCompare(b,'he')).map(v=>'<option value="'+esc(v)+'"></option>').join('');
  return '<datalist id="lg-dl-rc">'+o(rc)+'</datalist><datalist id="lg-dl-by">'+o(by)+'</datalist>';
}
const lgF=(l,inner,cls)=>'<label class="field'+(cls?' '+cls:'')+'">'+l+inner+'</label>';
const lgNumV=v=>v===0||v?String(r2(v)):'';
function lgByPicker(by){
  const mode=!by?'':(by===LG_SELF?'self':'c');
  return '<fieldset class="lg-fs"><legend>מי אסף בפועל</legend><div class="ln-seg lg-bym" role="group">'+
    [['','לא צוין'],['self','הגובה עצמו'],['c','שליח']].map(([v,l])=>'<button type="button" data-lg-bym="'+v+'" aria-pressed="'+(mode===v)+'">'+l+'</button>').join('')+'</div>'+
    '<input class="in" name="byn" list="lg-dl-by" placeholder="שם השליח, למשל דוד" value="'+esc(mode==='c'?by:'')+'" aria-label="שם השליח"'+(mode==='c'?'':' hidden')+'></fieldset>';
}
/* הלחיצה מחפשת ברשומות שצוירו על המסך (ולא בבנייה חדשה שאולי מספרה אחרת), והכתיבה עצמה מאמתת את השורה לפי שם וסכום */
function lgFindById(k,id){
  const L=LG.shown&&LG.shown[k]||lgLedger();
  return L.recs.find(r=>r.id===id)||L.exps.find(x=>x.id===id)||null;
}
function lgOpenRec(r){
  if(!r) return toast('האיסוף לא נמצא. נסה שוב');
  const hasW=r.srcs.indexOf('w')>=0, hasC=r.srcs.indexOf('c')>=0;
  const srcTxt=r.refs.map(f=>(f.k==='w'?'איסוף יומי':'חשבון גובים')+' '+isoLabel(f.date)+(f.draft?' (פתוח בטאב)':' (שמור)')).join(' + ');
  const init={n:r.n==='(ללא שם)'?'':r.n,rc:r.rc,by:r.by,t:r.t,due:r.due,got:r.got,pmt:r.pmt,nt:r.nt,st:r.st,fee:r.fee?r.fee.a:0,feen:r.fee?r.fee.n:'עמלת שליח',feef:r.fee?!r.fee.nf:true};
  LG.dlg={type:'rec',refs:r.refs.slice(),fee:r.fee?{refs:r.fee.refs.slice()}:null,lk:r.lk||'',init,hasW,hasC,date:r.dates[0]};
  const stSel=hasC?'<input class="in" value="'+esc(LG_STL[r.st]||'נאסף')+' (חשבון גובים)" disabled aria-label="סטטוס">':
    '<select class="in" name="st">'+[['plan','מתוכנן'],['pass','לעבור'],['na','לא ענו'],['not','לא נאסף'],['full','נאסף']].map(([v,l])=>'<option value="'+v+'"'+((r.st===v||(v==='full'&&r.st==='part'))?' selected':'')+'>'+l+'</option>').join('')+'</select>';
  const html='<form class="lg-form" data-lg-form="rec" novalidate>'+lgDl()+
    '<div class="note info small">מקור: '+esc(srcTxt)+'. השינוי נכתב לשורה המקורית, בלי למחוק ובלי ליצור איסוף נוסף.</div>'+
    lgF('שם הלקוח','<input class="in" name="n" value="'+esc(init.n)+'" autocomplete="off">')+
    '<div class="grid2">'+lgF('גובה אחראי','<input class="in" name="rc" list="lg-dl-rc" value="'+esc(init.rc)+'" placeholder="ללא גובה" autocomplete="off">')+
      lgF('תאריך','<input class="in" value="'+esc(r.dates.map(isoLabel).join(' → '))+'" disabled>')+
      lgF('שעת האיסוף','<input class="in num" name="t" inputmode="numeric" placeholder="18:30" value="'+esc(init.t)+'">')+'</div>'+
    lgByPicker(init.by)+
    '<div class="grid2">'+lgF('הסכום שהיה צריך להיאסף','<input class="in num" name="due" inputmode="decimal" value="'+lgNumV(init.due)+'">')+
      lgF('הסכום שנאסף בפועל','<input class="in num" name="got" inputmode="decimal" value="'+lgNumV(init.got)+'"><span class="row lg-qa"><button class="btn plain sm" type="button" data-lg-got="full">כל הסכום</button><button class="btn plain sm" type="button" data-lg-got="0">לא נאסף</button></span>')+
      lgF('יתרה שלא נאספה','<output class="in num lg-out-bal" name="bal">'+fmt(Math.max(0,r2(init.due-init.got)))+' ₪</output>')+'</div>'+
    '<div class="grid2">'+lgF('אמצעי תשלום','<select class="in" name="pmt"><option value="">לא צוין</option>'+LG_PMT.concat(init.pmt&&LG_PMT.indexOf(init.pmt)<0?[init.pmt]:[]).map(v=>'<option'+(v===init.pmt?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select>')+
      lgF('סטטוס האיסוף',stSel)+'</div>'+
    '<fieldset class="lg-fs"><legend>הוצאה או עמלת שליח לאיסוף הזה</legend><div class="grid2">'+
      lgF('סכום','<input class="in num" name="fee" inputmode="decimal" placeholder="0" value="'+(init.fee?lgNumV(init.fee):'')+'">')+
      lgF('תיאור','<input class="in" name="feen" value="'+esc(init.feen)+'">')+'</div>'+
      '<label class="chip-ck"><input type="checkbox" name="feef"'+(init.feef?' checked':'')+'> שולם מתוך כספי האיסוף</label>'+
      '<span class="small muted">ההוצאה נרשמת פעם אחת, בקבוצה של מי שאסף, ויורדת גם מהנטו של הגובה בטאב.</span></fieldset>'+
    lgF('הערות','<textarea class="in" name="nt" rows="2">'+esc(init.nt)+'</textarea>')+
    '<div class="row"><button class="btn" type="submit">שמור</button><button class="btn plain" type="button" data-dd="close">ביטול</button></div></form>';
  ddOpen('פרטי איסוף · '+(init.n||'ללא שם'),isoLabel(r.dates[0])+(r.rc?' · '+r.rc:''),html);
}
function lgOpenExp(x){
  if(!x) return toast('ההוצאה לא נמצאה. נסה שוב');
  const init={n:x.n,a:x.a,rc:x.rc,by:x.by,nf:!!x.nf};
  LG.dlg={type:'exp',refs:x.refs.slice(),init,lk:x.lk||''};
  const srcTxt=x.refs.map(f=>(f.k==='w'?'איסוף יומי':'חשבון גובים')+' '+isoLabel(f.date)+(f.draft?' (פתוח בטאב)':' (שמור)')).join(' + ');
  const html='<form class="lg-form" data-lg-form="exp" novalidate>'+lgDl()+
    '<div class="note info small">מקור: '+esc(srcTxt)+(x.forRec?' · משויכת לאיסוף של '+esc(x.forRec.n):'')+'</div>'+
    '<div class="grid2">'+lgF('הוצאה','<input class="in" name="n" value="'+esc(init.n)+'">')+lgF('סכום','<input class="in num" name="a" inputmode="decimal" value="'+lgNumV(init.a)+'">')+
    lgF('גובה אחראי','<input class="in" name="rc" list="lg-dl-rc" value="'+esc(init.rc)+'" placeholder="ללא גובה">')+'</div>'+
    lgByPicker(init.by).replace('מי אסף בפועל','של מי ההוצאה')+
    '<label class="chip-ck"><input type="checkbox" name="feef"'+(init.nf?'':' checked')+'> שולם מתוך כספי האיסוף</label>'+
    '<div class="row"><button class="btn" type="submit">שמור</button><button class="btn plain" type="button" data-dd="close">ביטול</button></div></form>';
  ddOpen('הוצאה · '+init.n,isoLabel(x.date)+(x.rc?' · '+x.rc:''),html);
}
function lgOpenTr(id,preset){
  const t=id?(LG.tr||[]).find(x=>x&&x.id===id):null;
  const k=S.tab==='collectors'?'c':'w', R=lgRange(k);
  const init=t?{d:t.d||R[1],t:t.t||'',from:t.from||'',to:t.to||'',a:num(t.a),nt:t.nt||''}:Object.assign({d:R[1],t:'',from:'',to:'',a:0,nt:''},preset||{});
  LG.dlg={type:'tr',id:t?t.id:null};
  const html='<form class="lg-form" data-lg-form="tr" novalidate>'+lgDl()+
    '<div class="note info small">העברה משליח לגובה היא כסף שכבר נאסף. היא לא מגדילה את סך האיסופים, רק מעדכנת אצל מי הכסף נמצא.</div>'+
    '<div class="grid2">'+lgF('מהשליח','<input class="in" name="from" list="lg-dl-by" value="'+esc(init.from)+'" placeholder="שם השליח" autocomplete="off">')+
      lgF('לגובה','<input class="in" name="to" list="lg-dl-rc" value="'+esc(init.to)+'" placeholder="שם הגובה" autocomplete="off">')+
      lgF('סכום שהועבר','<input class="in num" name="a" inputmode="decimal" value="'+(init.a?lgNumV(init.a):'')+'">')+
      lgF('תאריך','<input class="in" type="date" name="d" value="'+esc(init.d)+'">')+
      lgF('שעה','<input class="in num" name="t" inputmode="numeric" placeholder="20:00" value="'+esc(init.t)+'">')+
      lgF('הערה','<input class="in" name="nt" value="'+esc(init.nt)+'">')+'</div>'+
    '<div class="row"><button class="btn" type="submit">שמור העברה</button><button class="btn plain" type="button" data-dd="close">ביטול</button><span class="grow"></span>'+
      (t?'<button class="btn danger sm" type="button" data-lg-trdel>מחיקת ההעברה</button>':'')+'</div></form>';
  ddOpen(t?'עריכת העברה':'העברה משליח לגובה','',html);
}
function lgOpenBulk(k,key){
  const V=lgView(k), m=/^g:(.*)\|(.*)$/.exec(key||''); if(!m) return;
  const B=V.blocks.find(b=>b.rck===m[1]), G=B&&B.groups.find(g=>g.byk===m[2]); if(!G) return toast('הקבוצה לא נמצאה');
  LG.dlg={type:'bulk',recs:G.recs.map(r=>({refs:r.refs.slice(),rc:r.rc,by:r.by,fee:r.fee?r.fee.refs.slice():null})),exps:G.exps.filter(x=>!x.forRec).map(x=>({refs:x.refs.slice()}))};
  const lbl=G.type==='self'?'הגובה עצמו':(G.type==='cour'?'שליח: '+G.by:'לא צוין מי אסף');
  const html='<form class="lg-form" data-lg-form="bulk" novalidate>'+lgDl()+
    '<div class="note info small">'+G.recs.length+' איסופים'+(G.exps.length?' ו־'+G.exps.length+' הוצאות':'')+' של '+esc(B.rc)+' · '+esc(lbl)+', בטווח שנבחר. השיוך משתנה בשורות המקוריות, בלי למחוק ובלי לשנות סכומים.</div>'+
    lgF('גובה אחראי','<input class="in" name="rc" list="lg-dl-rc" value="'+esc(B.rck?B.rc:'')+'" placeholder="ללא גובה" autocomplete="off">')+
    lgByPicker(G.by)+
    (G.exps.length?'<label class="chip-ck"><input type="checkbox" name="wx" checked> לשייך גם את ההוצאות של הקבוצה</label>':'')+
    '<div class="row"><button class="btn" type="submit">שייך '+G.recs.length+' איסופים</button><button class="btn plain" type="button" data-dd="close">ביטול</button></div></form>';
  ddOpen('שיוך מחדש · '+B.rc,lbl,html);
}
function lgFormBy(form){
  const b=form.querySelector('[data-lg-bym][aria-pressed="true"]'), mode=b?b.dataset.lgBym:'';
  if(mode==='self') return LG_SELF;
  if(mode==='c') return stripInv(form.elements.byn&&form.elements.byn.value);
  return '';
}
function lgFormSync(form){
  if(!form||form.dataset.lgForm!=='rec') return;
  const E=form.elements, due=num(E.due.value), got=num(E.got.value), bal=Math.max(0,r2(due-got));
  if(E.bal) E.bal.textContent=fmt(bal)+' ₪';
}
async function lgSubmit(form){
  if(LG.busy) return; const D=LG.dlg; if(!D) return;
  const E=form.elements, btn=form.querySelector('[type="submit"]');
  const go=async fn=>{ LG.busy=true; if(btn){ btn.disabled=true; btn.dataset.l=btn.textContent; btn.textContent='שומר…'; }
    try{ const res=await fn(); ddClose(); if(res) toast(typeof res==='string'?res:lgSavedMsg(res)); }
    catch(e){ toast(e&&e.msg?e.msg:(e&&(e.code==='permission_denied'||e.code==='forbidden')?'רק בעל התוכנה יכול לשמור':'השמירה נכשלה. נסה שוב')); if(btn){ btn.disabled=false; btn.textContent=btn.dataset.l||'שמור'; } }
    finally{ LG.busy=false; } };
  if(D.type==='rec') return go(()=>lgSaveRec(D,E,form));
  if(D.type==='exp') return go(()=>lgSaveExp(D,E,form));
  if(D.type==='tr') return go(()=>lgSaveTr(D,E));
  if(D.type==='bulk') return go(()=>lgSaveBulk(D,E,form));
}
async function lgSaveRec(D,E,form){
  const I=D.init, F={n:stripInv(E.n.value),rc:cleanColl(E.rc.value),t:normTime(E.t.value),due:r2(num(E.due.value)),got:r2(num(E.got.value)),pmt:E.pmt.value,nt:String(E.nt.value||'').trim(),fee:r2(num(E.fee.value)),feen:stripInv(E.feen.value)||'עמלת שליח',feef:!!E.feef.checked};
  F.by=lgByNorm(lgFormBy(form),F.rc);
  if(!F.n&&!F.due&&!F.got) throw {msg:'חסר שם או סכום'};
  if(String(E.t.value||'').trim()&&!F.t) throw {msg:'השעה לא תקינה. כתוב למשל 18:30'};
  if(F.got<0||F.due<0||F.fee<0) throw {msg:'סכום לא יכול להיות שלילי'};
  let st=E.st?E.st.value:I.st; if(E.st&&F.got>0.005&&st!=='full') st='full'; if(E.st&&st==='full'&&F.got<0.005) st='not';
  const ch=f=>{ if(f==='n') return F.n!==I.n; if(f==='rc') return collKey(F.rc)!==collKey(I.rc)||F.rc!==I.rc; if(f==='by') return F.by!==I.by; if(f==='t') return F.t!==I.t;
    if(f==='due') return Math.abs(F.due-I.due)>0.004; if(f==='got') return Math.abs(F.got-I.got)>0.004; if(f==='pmt') return F.pmt!==I.pmt; if(f==='nt') return F.nt!==I.nt;
    if(f==='st') return E.st?(st!==(I.st==='part'?'full':I.st)):false; return false; };
  const feeCh=Math.abs(F.fee-I.fee)>0.004||(F.fee>0&&(F.feen!==I.feen||F.feef!==I.feef));
  const amtCh=ch('due')||ch('got')||ch('st');
  let lk=D.lk; const needLk=F.fee>0&&!D.fee&&!lk; if(needLk) lk='L'+Date.now().toString(36)+uid();
  const anyCh=['n','rc','by','t','pmt','nt'].some(ch)||amtCh||feeCh;
  if(!anyCh) return 'לא היו שינויים';
  const P=lgPlan();
  const SM={plan:'',pass:ST_PASS,na:ST_NA,not:ST_NOT,full:ST_GOT};
  D.refs.forEach(ref=>P.add(ref,{op:'set',fn:(e,k,draft)=>{
    if(ch('n')) e.n=F.n;
    if(ch('rc')){ e.c=F.rc; if(k==='w'&&draft) e.cm='m'; }
    if(ch('by')) lgSetOpt(e,'by',F.by);
    if(ch('t')) e.t=F.t;
    if(ch('pmt')) lgSetOpt(e,'pmt',F.pmt);
    if(ch('nt')) lgSetOpt(e,'nt',F.nt);
    if(needLk) e.lk=lk;
    if(amtCh){
      if(k==='w'){
        if(ch('due')) e.a=F.due;
        const s=D.hasC?(F.got>0.005?ST_GOT:(normStatus(e.s)===ST_GOT?ST_NOT:e.s||'')):SM[st];
        e.s=s; if(draft) e.u=false;
        if(s===ST_GOT&&Math.abs(F.got-num(e.a))>0.004) e.ga=F.got; else delete e.ga;
      } else {
        e.a=F.got; if(Math.abs(F.due-F.got)>0.004) e.due=F.due; else delete e.due;
      }
    }
  }}));
  if(feeCh){
    const mkX=(k,draft)=>{ const o={n:F.feen,a:F.fee,c:F.rc}; lgSetOpt(o,'by',F.by); o.lk=lk; if(!F.feef) o.nf=1; if(k==='c') o.k='e'; if(draft){ o.id=uid(); if(k==='c'){ o.src='ידני'; o.u=false; } } return o; };
    if(D.fee&&F.fee<0.005) D.fee.refs.forEach(ref=>P.add(ref,{op:'del'}));
    else if(D.fee) D.fee.refs.forEach(ref=>P.add(ref,{op:'set',fn:(x)=>{ x.n=F.feen; x.a=F.fee; x.c=F.rc; lgSetOpt(x,'by',F.by); if(F.feef) delete x.nf; else x.nf=1; }}));
    else if(F.fee>0.004){
      const prim=D.refs.find(r=>r.k==='c')||D.refs[0];
      P.add({k:prim.k,id:prim.id,draft:prim.draft,arr:prim.k==='c'?'entries':'expenses'},{op:'add',mk:mkX});
    }
  } else if(D.fee&&(ch('rc')||ch('by'))){
    D.fee.refs.forEach(ref=>P.add(ref,{op:'set',fn:(x)=>{ x.c=F.rc; lgSetOpt(x,'by',F.by); }}));
  }
  return lgCommit(P);
}
async function lgSaveExp(D,E,form){
  const I=D.init, F={n:stripInv(E.n.value)||'הוצאה',a:r2(num(E.a.value)),rc:cleanColl(E.rc.value),nf:!E.feef.checked};
  F.by=lgByNorm(lgFormBy(form),F.rc);
  if(F.a<0) throw {msg:'סכום לא יכול להיות שלילי'};
  if(F.n===I.n&&Math.abs(F.a-I.a)<0.005&&F.rc===I.rc&&F.by===I.by&&F.nf===I.nf) return 'לא היו שינויים';
  const P=lgPlan();
  D.refs.forEach(ref=>P.add(ref,{op:'set',fn:(x,k,draft)=>{ x.n=F.n; x.a=F.a; x.c=F.rc; lgSetOpt(x,'by',F.by); if(F.nf) x.nf=1; else delete x.nf; if(draft&&k==='c') x.u=false; }}));
  return lgCommit(P);
}
async function lgSaveTr(D,E){
  const F={d:E.d.value||todayISO(),t:normTime(E.t.value),from:stripInv(E.from.value),to:cleanColl(E.to.value),a:r2(num(E.a.value)),nt:String(E.nt.value||'').trim()};
  if(!F.from) throw {msg:'כתוב מאיזה שליח הועבר הכסף'};
  if(!F.to) throw {msg:'כתוב לאיזה גובה הועבר הכסף'};
  if(collKey(F.from)===collKey(F.to)) throw {msg:'השליח והגובה הם אותו אדם'};
  if(!(F.a>0)) throw {msg:'כתוב את הסכום שהועבר'};
  const list=(LG.tr||[]).slice();
  if(D.id){ const j=list.findIndex(x=>x&&x.id===D.id); if(j<0) throw {msg:'ההעברה לא נמצאה'}; list[j]=Object.assign({},list[j],F,{up:Date.now()}); }
  else list.push(Object.assign({id:'T'+Date.now().toString(36)+uid(),at:Date.now()},F));
  await lgTrSave(list);
  return D.id?'ההעברה עודכנה':'ההעברה נשמרה: '+fmt(F.a)+' ₪ מ'+F.from+' ל'+F.to;
}
async function lgSaveBulk(D,E,form){
  const rc=cleanColl(E.rc.value), byRaw=lgFormBy(form), wx=!E.wx||E.wx.checked;
  const P=lgPlan(); let n=0;
  D.recs.forEach(r=>{ const by=lgByNorm(byRaw,rc); if(collKey(r.rc)===collKey(rc)&&r.rc===rc&&r.by===by) return; n++;
    r.refs.forEach(ref=>P.add(ref,{op:'set',fn:(e,k,draft)=>{ e.c=rc; if(k==='w'&&draft) e.cm='m'; lgSetOpt(e,'by',by); }}));
    if(r.fee) r.fee.forEach(ref=>P.add(ref,{op:'set',fn:(x)=>{ x.c=rc; lgSetOpt(x,'by',by); }})); });
  if(wx) D.exps.forEach(x=>x.refs.forEach(ref=>P.add(ref,{op:'set',fn:(o)=>{ o.c=rc; lgSetOpt(o,'by',lgByNorm(byRaw,rc)); }})));
  if(!n&&!(wx&&D.exps.length)) return 'לא היו שינויים';
  const res=await lgCommit(P);
  return 'השיוך עודכן ל־'+n+' איסופים'+(res.draft&&!res.saved?'. לשמירה קבועה לחץ „שמור” בטאב':'');
}
async function lgTrDel(btn){
  const D=LG.dlg; if(!D||D.type!=='tr'||!D.id) return;
  if(btn.dataset.armed!=='1'){ btn.dataset.armed='1'; btn.textContent='כן, מחק'; btn.classList.add('armed'); setTimeout(()=>{ if(btn.isConnected){ btn.dataset.armed='0'; btn.textContent='מחיקת ההעברה'; btn.classList.remove('armed'); } },4500); return; }
  try{ await lgTrSave((LG.tr||[]).filter(x=>x&&x.id!==D.id)); ddClose(); toast('ההעברה נמחקה'); }
  catch(e){ toast(e&&e.msg?e.msg:'המחיקה נכשלה. נסה שוב'); }
}


/* ---- app.html 10590-10627 (verbatim) ---- */
function lgOpenAny(o){ if(!o) return toast('השורה ריקה. כתוב שם וסכום קודם'); if(o.kind==='exp') lgOpenExp(o); else lgOpenRec(o); }
function lgBind(k){
  const p=$('#lg-'+k); if(!p) return;
  const u=lgUi(k);
  p.addEventListener('input',e=>{
    const f=e.target.dataset.lg;
    if(f==='q'){ u.q=e.target.value; u.pin=null; lgSchedule(k); const c=lgEl(k,'clear'); if(c) c.hidden=!u.q; }
    else if(f==='from'||f==='to'){ const v=e.target.value; if(!v) return; const R=lgRange(k); if(u.auto){ u.auto=false; u.mode='day'; u.from=R[0]; u.to=R[1]; } u[f]=v; if(u.mode!=='range') u.to=u.from; lgSchedule(k); }
  });
  p.addEventListener('change',e=>{
    const f=e.target.dataset.lg;
    if(f==='rc'||f==='by'||f==='st'||f==='tst'){ u[f]=e.target.value; lgRender(k); }
  });
  p.addEventListener('keydown',e=>{ if(e.key==='Escape'&&e.target.dataset.lg==='q'&&(u.q||u.pin)){ e.preventDefault(); u.q=''; u.pin=null; e.target.value=''; lgRender(k); } });
  p.addEventListener('click',e=>{
    const t=e.target;
    let b=t.closest('[data-lg="clear"]'); if(b){ u.q=''; u.pin=null; const qi=lgEl(k,'q'); if(qi){ qi.value=''; qi.focus(); } lgRender(k); return; }
    b=t.closest('[data-lg-pin]'); if(b){ u.pin={f:b.dataset.lgPin,v:b.dataset.v,l:b.dataset.l}; lgRender(k); return; }
    b=t.closest('[data-lg-unpin]'); if(b){ u.pin=null; lgRender(k); return; }
    b=t.closest('[data-lg-mode]'); if(b){ const R=lgRange(k); u.mode=b.dataset.lgMode; u.auto=false; u.from=R[0]; u.to=u.mode==='range'?R[1]:R[0]; lgRender(k); return; }
    b=t.closest('[data-lg-quick]'); if(b){ const q=b.dataset.lgQuick, td=todayISO();
      if(q==='tab'){ u.auto=true; u.mode='day'; }
      else if(q==='y'){ u.auto=false; u.mode='day'; u.from=u.to=addDays(S[k].date||td,-1); }
      else if(q==='7'){ u.auto=false; u.mode='range'; u.to=S[k].date||td; u.from=addDays(u.to,-6); }
      else if(q==='m'){ u.auto=false; u.mode='range'; const d=S[k].date||td; u.from=d.slice(0,8)+'01'; u.to=d; }
      lgRender(k); return; }
    b=t.closest('[data-lg="freset"]'); if(b){ u.rc='';u.by='';u.st='done';u.tst='all'; lgRender(k); return; }
    b=t.closest('[data-lg-tg]'); if(b){ const key=b.dataset.lgTg; u.open[key]=b.getAttribute('aria-expanded')!=='true'; lgRender(k); return; }
    b=t.closest('[data-lg-ed]'); if(b){ lgOpenAny(lgFindById(k,b.dataset.lgEd)); return; }
    b=t.closest('[data-lg-tre]'); if(b){ lgOpenTr(b.dataset.lgTre); return; }
    b=t.closest('[data-lg-tradd]'); if(b){ const v=b.dataset.lgTradd, V=lgView(k); let pre={};
      if(v){ const [rck,byk]=v.split('|'); const B=V.blocks.find(x=>x.rck===rck), G=B&&B.groups.find(g=>g.byk===byk); if(G) pre={from:G.by,to:B.rc===NOC?'':B.rc,a:Math.max(0,G.held||0)}; }
      else if(V.blocks.length===1&&V.blocks[0].rck) pre={to:V.blocks[0].rc};
      lgOpenTr(null,pre); return; }
    b=t.closest('[data-lg-bulk]'); if(b){ lgOpenBulk(k,b.dataset.lgBulk); return; }
    b=t.closest('[data-lg="copy"]'); if(b){ copyText(lgText(lgView(k))).then(ok=>toast(ok?'הסיכום והפירוט הועתקו. הדבק בוואטסאפ':'ההעתקה נכשלה')); return; }
  });
}

/* ---- app.html 10462-10479: אירועי חלון העריכה (במקור על #dd-body הקבוע; כאן לכל חלון שנפתח) ---- */
function lgBindDd(dd){
    dd.addEventListener('submit',e=>{ const f=e.target.closest('[data-lg-form]'); if(!f) return; e.preventDefault(); lgSubmit(f); });
    dd.addEventListener('input',e=>{ const f=e.target.closest('[data-lg-form]'); if(f) lgFormSync(f); });
    dd.addEventListener('change',e=>{
      const f=e.target.closest('[data-lg-form="rec"]'); if(!f) return; const E=f.elements;
      if(e.target.name==='st'&&E.got){ if(e.target.value==='full'&&num(E.got.value)<0.005) E.got.value=lgNumV(num(E.due.value)); else if(e.target.value!=='full') E.got.value='0'; lgFormSync(f); }
      if(e.target.name==='got'&&E.st){ const g=num(E.got.value); if(g>0.005) E.st.value='full'; else if(E.st.value==='full') E.st.value='not'; }
    });
    dd.addEventListener('click',e=>{
      const f=e.target.closest('[data-lg-form]'); if(!f) return;
      const bm=e.target.closest('[data-lg-bym]');
      if(bm){ $$('[data-lg-bym]',f).forEach(x=>x.setAttribute('aria-pressed',String(x===bm))); const bn=f.elements.byn; if(bn){ bn.hidden=bm.dataset.lgBym!=='c'; if(!bn.hidden) bn.focus(); } return; }
      const g=e.target.closest('[data-lg-got]');
      if(g){ const E=f.elements; E.got.value=g.dataset.lgGot==='full'?lgNumV(num(E.due.value)):'0'; if(E.st) E.st.value=g.dataset.lgGot==='full'?'full':(E.st.value==='full'?'not':E.st.value); lgFormSync(f); return; }
      if(e.target.closest('[data-lg-trdel]')) lgTrDel(e.target.closest('[data-lg-trdel]'));
    });
}

/* ---- app.html 10330-10356 lgCommit, מותאם לשרת: כל חשבון נקרא מחדש מהשרת (עם הגרסה שלו), השינוי מוחל על השורה המקורית
   באותה lgRunOps של המקור, ונשמר עם baseVersion כדי ששינוי ממכשיר אחר לא יידרס. אין טיוטות פתוחות באפליקציה החדשה.
   (גיבוי לפני שינוי — bkEnsure במקור — לא נדרש: השרת שומר גרסאות ויומן שינויים עם המצב הקודם) ---- */
async function lgCommit(P){
  const plans=Array.from(P.m.values()), saved=plans.filter(p=>!p.src.draft);
  if(saved.length){
    if(!App.can.finance) throw {msg:'רק בעל התוכנה או מנהל יכולים לשנות חשבונות שמורים'};
    for(const p of saved){
      const old=await get('/api/accounts/'+encodeURIComponent(p.src.id)); if(!old) throw {msg:'החשבון השמור לא נמצא'};
      const base=old._version;
      const doc=JSON.parse(JSON.stringify(old)); ['id','_version','_updatedAt','_updatedBy','prev'].forEach(k=>delete doc[k]);
      if(!Array.isArray(doc.entries)) doc.entries=[];
      const A={entries:doc.entries}; if(p.src.k==='w'){ if(!Array.isArray(doc.expenses)) doc.expenses=[]; A.expenses=doc.expenses; }
      lgRunOps(A,p.ops,p.src.k,false);
      if(p.src.k==='w'&&!doc.expenses.length) delete doc.expenses;
      doc.v=1;
      const o=old.orig||{entries:old.entries}; if(o!==undefined) doc.orig=JSON.parse(JSON.stringify(o)); // origOf, app.html 4813
      try{ await save('PUT','/api/accounts/'+encodeURIComponent(p.src.id),{data:doc,baseVersion:base,note:'עדכון מיומן הגובים'},{label:'עדכון פרטי איסוף',queue:false}); }
      catch(e){ throw {msg:e.status===409?'החשבון עודכן ממכשיר אחר. סגור, פתח שוב ונסה':(e.message||'השמירה נכשלה')}; }
    }
  }
  await lgLoad(); lgDirty();
  return {saved:saved.length,draft:false};
}
/* ---- app.html 10567-10572 lgTrSave, מותאם לשרת: settings/transfers {list,at} עם baseVersion ---- */
async function lgTrSave(list){
  if(!App.can.finance) throw {msg:'רק בעל התוכנה או מנהל יכולים לשמור העברות'};
  const at=Date.now();
  try{ await save('PUT','/api/docs/settings/transfers',{data:{list,at},baseVersion:TRV==null?undefined:TRV,action:'עדכון העברות'},{label:'שמירת העברה',queue:false}); }
  catch(e){ if(e.status===409){ await lgLoad(); lgDirty(); throw {msg:'ההעברות עודכנו ממכשיר אחר. הרשימה רועננה — נסה שוב'}; } throw {msg:e.message||'השמירה נכשלה'}; }
  await lgLoad(); lgDirty();
}

// ---- הצגת המסך ----
export function lgMount(el, { date } = {}) {
  LG.built = {}; LG.shown = {}; S.w.date = date || todayISO();
  const u = lgUi('w'); if (date) { u.auto = true; u.mode = 'day'; }
  el.innerHTML = `<section class="lg card${App.can.finance ? '' : ' lg-ro'}" id="lg-w"></section>`;
  lgBind('w'); lgRender('w');
}
export { lgRender, lgDirty, sheetOpen };
