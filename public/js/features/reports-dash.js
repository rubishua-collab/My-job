// לוח בקרה, התראות, חיפוש בחשבונות שמורים — הועתק מהתוכנה המקורית (app.html 6327-6508, 5238-5371).
// הבדלים מהמקור: אין טיוטות מקומיות (כל חשבון נשמר בשרת), ולכן ״טיוטה לא שמורה״ הוחלף בפעולות שממתינות לשליחה בגלל קליטה.
import { calcMorning, calcCollectors, num, r2, sum, normName, cleanColl, collKey, normStatus, ST_GOT, ST_NOT, ST_PASS, ST_NA, NOC_SP, todayISO } from '../calc.js';
import { esc, fmt, money, isoLabel, weekday, pctS, KL, KC, headline, linesOf } from './reports-print.js';
import { S, LN, AN, anMorning, anStale, chartBars, kpi, kpiRaw, delta, addDays, byDateAsc, isoOf, hlData, hlSum } from './reports-an.js';

const pad2=n=>String(n).padStart(2,'0');

/* collection progress of a daily list: per collector and in total — app.html 6344 */
export function progData(entries){
  const es=(entries||[]).filter(e=>e&&(String(e.n||'').trim()||num(e.a)));
  const mk=c=>({c,n:0,a:0,got:0,gotA:0,not:0,notA:0,pass:0,passA:0,na:0});
  const by=new Map(), all=mk('כל הרשימה');
  const add=(x,e)=>{const a=num(e.a),s=normStatus(e.s);x.n++;x.a=r2(x.a+a);
    if(s===ST_GOT){x.got++;x.gotA=r2(x.gotA+((e.ga!==undefined&&e.ga!==null&&e.ga!=='')?num(e.ga):a));}else if(s===ST_NOT){x.not++;x.notA=r2(x.notA+a);}else if(s===ST_PASS){x.pass++;x.passA=r2(x.passA+a);}else if(s===ST_NA)x.na++;};
  es.forEach(e=>{const c=cleanColl(e.c)||NOC_SP, k=collKey(c)||c; if(!by.has(k)) by.set(k,mk(c)); add(by.get(k),e); add(all,e);});
  return {all,list:Array.from(by.values()).sort((x,y)=>String(x.c).localeCompare(String(y.c),'he'))};
}
function progBar(x,cls){
  const pct=v=>x.a>0?Math.max(0,Math.min(100,100*v/x.a)):0, rate=x.a>0?Math.round(100*x.gotA/x.a):0;
  return '<div class="pg'+(cls?' '+cls:'')+'"><div class="pg-h"><b>'+esc(x.c)+'</b><span>נאסף '+money(x.gotA)+' מתוך '+money(x.a)+' · '+rate+'% · '+x.got+'/'+x.n+' חייבים</span></div>'+
    '<div class="pbar" role="img" aria-label="'+esc(x.c)+': נאסף '+rate+' אחוז מהסכום"><i class="g" style="width:'+pct(x.gotA).toFixed(2)+'%"></i><i class="p" style="width:'+pct(x.passA).toFixed(2)+'%"></i><i class="n" style="width:'+pct(x.notA).toFixed(2)+'%"></i></div></div>';
}
function progHTML(d){
  if(!d.all.n) return '';
  const legend='<div class="legend"><span style="--c:var(--seg-got)">נאסף</span><span style="--c:var(--seg-pass)">לעבור</span><span style="--c:var(--seg-not)">לא נאסף</span><span style="--c:var(--seg-open)">עוד לא סומן</span></div>';
  return (d.list.length>1?progBar(d.all,'all')+d.list.map(x=>progBar(x)).join(''):progBar(d.all,'all'))+legend;
}

const ofKind=(list,k)=>list.filter(a=>a&&a.kind===k&&a.date);
const lastOf=arr=>arr.slice().sort(byDateAsc).pop()||null;
const tsOf=a=>(a._version>1?a._updatedAt:0)||a.updatedAt||a.createdAt||a._updatedAt||0;

/* התראות — app.html 6427-6440. t = התאריך שמוצג; pd = התקדמות האיסוף של אותו יום */
export function alertsOf(t,pd,pendingN){
  const al=[];
  const ST=anStale();
  if(ST&&ST.rows.length){
    const top=ST.rows.slice(0,4).map(r=>esc(r.n)+' ('+(r.since===null?'אין תשלום בחשבונות':r.since+' ימים')+')').join(' · ');
    al.push({lv:'hi',t:ST.rows.length+' לקוחות מהפיצול האחרון לא שילמו '+AN.stale+' ימים ומעלה',s:'יתרה '+money(ST.total)+' · '+top,go:'#/analytics?sec=stale',b:'לפירוט'});
  }
  const wAcc=lastOf(ofKind(S.s.list,'work').filter(a=>a.date===t));
  if(pd.all.not) al.push({lv:'hi',t:pd.all.not+' חייבים סומנו ״לא נאסף״ היום',s:'סה״כ '+money(pd.all.notA),go:wAcc?'#/acc/'+wAcc.id:'',b:'לרשימה'});
  if(pd.all.na) al.push({lv:'mid',t:pd.all.na+' לקוחות לא ענו',s:'הם בבלוק ״לא ענו״ בראש רשימת האיסוף',go:wAcc?'#/acc/'+wAcc.id:'',b:'לרשימה'});
  const sp=lastOf(ofKind(S.s.list,'split'));
  const notes=sp?(sp.records||[]).filter(r=>r&&r.note&&!r.done&&!r.xd&&!r.side).length:0;
  if(notes) al.push({lv:'mid',t:notes+' הערות פתוחות בפיצול',s:'הערה שלא סומנה ״הערה טופלה״ עוברת לחשבון הבא',go:'#/acc/'+sp.id,b:'לפיצול'});
  if(pendingN) al.push({lv:'lo',t:pendingN+' פעולות שלא נשמרו עדיין בשרת',s:'נשמרו במכשיר הזה בגלל בעיית קליטה, וישלחו שוב כשיחזור החיבור',go:'',b:''});
  return al;
}
export const alertsHTML=al=>al.length?al.map(a=>'<div class="al '+a.lv+'"><span class="sev" aria-hidden="true"></span><div><div class="at">'+a.t+'</div><div class="as">'+a.s+'</div></div>'+(a.go?'<a class="btn plain sm" href="'+a.go+'">'+a.b+'</a>':'<span></span>')+'</div>').join(''):'<div class="empty small">אין התראות כרגע.</div>';

const hlSplit=x=>'<span>קרן '+money(x.p)+' · ריבית '+money(x.i)+'</span>';
const hlTile=(key,l,v,sub,cls)=>'<a href="#/loans" class="kpi kpi-btn'+(cls?' '+cls:'')+'" data-hl="'+key+'"><span class="kl">'+esc(l)+'</span><b class="kv num'+(v<0?' neg':'')+'">'+fmt(v)+' ₪</b>'+(sub?'<span class="ks">'+sub+'</span>':'')+'<span class="kgo">פירוט ›</span></a>';
function hlHTML(){
  if(!LN.list.length) return {n:'',html:'<div class="empty small">אין עדיין הלוואות בלשונית הלוואות.</div>'};
  const D=hlData(), td_=hlSum(D.today), wk=hlSum(D.week), lt=hlSum(D.late), pm=hlSum(D.paidM);
  const openP=r2(D.open.reduce((a,o)=>a+o.s.remain,0));
  return {n:D.open.length+' פעילות מתוך '+D.n,html:
    hlTile('open','יתרת קרן פתוחה',openP,'<span>'+D.open.length+' הלוואות פעילות</span>')+
    hlTile('today','לתשלום היום',td_.a,td_.n?'<span>'+td_.n+' תשלומים</span>'+hlSplit(td_):'<span>אין תשלומים להיום</span>')+
    hlTile('week','ב-7 הימים הבאים',wk.a,'<span>'+wk.n+' תשלומים</span>'+(wk.n?hlSplit(wk):''))+
    hlTile('late','בפיגור',lt.a,lt.n?'<span>'+lt.n+' תשלומים ב-'+lt.loans+' הלוואות</span>'+hlSplit(lt):'<span>אין פיגורים</span>',lt.n?'bad':'good')+
    hlTile('paid','שולם החודש',pm.a,pm.n?'<span>'+pm.n+' תשלומים סומנו</span>'+hlSplit(pm):'<span>עוד לא סומנו תשלומים החודש</span>')};
}

/* לוח בקרה — renderHome, app.html 6366 */
export function dashHTML(pendingN){
  const t=todayISO(), list=S.s.list||[];
  const savedToday=k=>ofKind(list,k).filter(a=>a.date===t);
  const mToday=lastOf(savedToday('morning'));
  const mSrc=mToday, cm=mSrc?calcMorning(mSrc):null;
  const kAcc=mSrc||lastOf(ofKind(list,'morning')), kVal=kAcc?calcMorning(kAcc).final:null;
  const wSaved=lastOf(savedToday('work'));
  const wEntries=wSaved?wSaved.entries||[]:[];
  const pd=progData(wEntries), left=r2(pd.all.a-pd.all.gotA);
  const A=anMorning(addDays(t,-29),t).tot, P=anMorning(addDays(t,-59),addDays(t,-30)).tot;
  const ln=s=>'<span>'+s+'</span>';
  let k='';
  k+=kVal===null?kpiRaw('קרן נוכחית','—',ln('אין עדיין חשבון בוקר')):kpi('קרן נוכחית',kVal,ln('לפי חשבון '+esc(isoLabel(kAcc.date))));
  k+=cm?kpi('ריבית היום',cm.interest,ln('רובי '+pctS(cm.rp)+': '+money(cm.robi))+ln('קו '+pctS(cm.lp)+': '+money(cm.line))):kpiRaw('ריבית היום','—',ln('חשבון הבוקר של היום עוד לא נעשה'));
  k+=pd.all.n?kpi('נאסף היום',pd.all.gotA,ln('מתוך '+money(pd.all.a))+ln((pd.all.a?Math.round(100*pd.all.gotA/pd.all.a):0)+'% מהסכום · '+pd.all.got+'/'+pd.all.n+' חייבים'),pd.all.a>0&&left<=0?'good':''):kpiRaw('נאסף היום','—',ln('אין עדיין רשימת איסוף להיום'));
  k+=cm?kpi('הלוואות שניתנו היום',cm.loansTotal,ln(cm.loans.length+' הלוואות')):kpiRaw('הלוואות שניתנו היום','—',ln('לפי חשבון הבוקר'));
  k+=A.n?kpi('ממוצע ריבית ליום',A.avgInterest,ln('30 הימים האחרונים · '+A.n+' חשבונות')+(P.n?delta(A.avgInterest,P.avgInterest).replace('לעומת התקופה הקודמת','לעומת 30 הימים שלפני'):'')):kpiRaw('ממוצע ריבית ליום','—',ln('30 הימים האחרונים'));

  /* day close: the four daily accounts in their working order */
  const subOf={
    m:a=>cm?'ריבית '+money(cm.interest)+' · קרן '+money(cm.principal)+' · '+(mSrc.rows||[]).length+' לקוחות':'העלה את דו״ח ההכנסות של היום',
    sp:a=>{const rs=((a&&a.records)||[]).filter(r=>!r.side); if(!rs.length) return 'העלה את קובץ החייבים של היום'; const cs=new Set(rs.map(r=>String(r.c||'').trim()).filter(Boolean)); return rs.length+' לווים · '+cs.size+' גובים';},
    w:a=>pd.all.n?'נאסף '+pd.all.got+' מתוך '+pd.all.n+' חייבים · נותר '+money(left):'העבר מהפיצול או העלה צילום של הרשימה',
    c:a=>{const es=(a&&a.entries)||[]; if(!es.length) return 'בסוף היום: ״העבר לחשבון גובים״ מהאיסוף היומי'; try{return 'נטו '+money(calcCollectors(es).totalNet);}catch(e){return es.length+' שורות';}}
  };
  const defs=[{k:'m',t:'חשבון בוקר',kind:'morning'},{k:'sp',t:'פיצול לגובים',kind:'split'},{k:'w',t:'איסוף יומי',kind:'work'},{k:'c',t:'חשבון גובים',kind:'collectors'}];
  let done=0;
  const steps=defs.map((d,i)=>{
    const acc=lastOf(savedToday(d.kind)), sv=!!acc;
    let cls='', pill;
    if(sv){cls='ok';pill='<span class="pill ok">נשמר היום</span>';done++;}
    else pill='<span class="pill">טרם בוצע</span>';
    let sub=''; try{ sub=subOf[d.k](acc); }catch(e){}
    return '<li class="step '+cls+'"><span class="sn">'+(cls==='ok'?'✓':(i+1))+'</span><span class="stt">'+d.t+'</span><span class="sts">'+sub+'</span><span class="sta">'+pill+'<a class="btn plain sm" href="'+(acc?'#/acc/'+acc.id:'#/new/'+d.kind+'?date='+t)+'">'+(acc?'פתח':'התחל')+'</a></span></li>';
  }).join('');

  const D=anMorning(addDays(t,-13),t).days;
  const chart=D.length?chartBars(D.map(d=>({l:isoLabel(d.date).slice(0,5),v:d.interest,sub:weekday(d.date)})),{title:'ריבית יומית ב־14 הימים האחרונים',h:200}):'<div class="empty small">אין חשבונות בוקר שמורים בשבועיים האחרונים.</div>';
  const al=alertsOf(t,pd,pendingN);
  const rec=list.slice().sort((x,y)=>tsOf(y)-tsOf(x)).slice(0,6);
  const recent=rec.length?rec.map(a=>{
    let h={label:'',val:0}; try{h=headline(a);}catch(e){}
    const ts=tsOf(a), w=ts?new Date(ts):null;
    const when=w?((a._version>1||a.updatedAt)?'נערך ':'נשמר ')+isoLabel(isoOf(w)).slice(0,5)+' '+pad2(w.getHours())+':'+pad2(w.getMinutes()):'';
    return '<a class="rc" href="#/report/'+encodeURIComponent(a.id)+'"><span class="kind '+(KC[a.kind]||'')+'">'+esc(KL[a.kind]||'חשבון')+'</span><span class="rcn">'+esc(weekday(a.date))+' · '+esc(isoLabel(a.date))+'</span><span class="rcm">'+esc(h.label)+(when?' · '+when:'')+'</span><span class="rcv">'+money(h.val)+'</span></a>';
  }).join(''):'<div class="empty small">עוד לא נשמרו חשבונות. כל חשבון שתשמור יופיע כאן.</div>';
  const L=hlHTML();
  return '<div class="panel"><div class="dash-head"><div><h2>לוח בקרה</h2><p id="h-sub">'+esc(weekday(t)+' · '+isoLabel(t)+' · קרן, גבייה, טיוטות פתוחות והתראות במבט אחד.')+'</p></div>'+
      '<div class="qa"><button class="btn sm" type="button" data-go="morning">חשבון בוקר</button><button class="btn ghost sm" type="button" data-go="split">פיצול</button><button class="btn ghost sm" type="button" data-go="work">איסוף יומי</button><button class="btn ghost sm" type="button" data-go="collectors">חשבון גובים</button></div></div>'+
      '<div class="hq" role="search"><input class="in" id="h-q" type="search" dir="rtl" placeholder="חיפוש לקוח: שם או טלפון…" aria-label="חיפוש לקוח לפי שם או טלפון" autocomplete="off" enterkeyhint="search"></div></div>'+
    '<div class="kpis dash" id="h-kpis">'+k+'</div>'+
    '<div class="panel" id="h-lp"><div class="phd"><h3>תיק ההלוואות</h3><span class="small">'+esc(L.n)+'</span></div><div class="kpis dash" id="h-lkpis">'+L.html+'</div><p class="small muted" style="margin:0">מחושב מלוחות הסילוקין בלשונית הלוואות, בהפרדה בין קרן לריבית. הקרן הנוכחית שלמעלה מגיעה מחשבון הבוקר, בנפרד. לחיצה על כל נתון פותחת את ההלוואות.</p></div>'+
    '<div class="dash-grid">'+
      '<div class="panel"><div class="phd"><h3>סגירת יום</h3><span class="small">'+done+' מתוך 4 נשמרו היום</span></div><ol class="steps" id="h-steps">'+steps+'</ol></div>'+
      '<div class="panel"><div class="phd"><h3>התקדמות הגבייה היום</h3><span class="small">'+(pd.all.n?'נותר '+money(left):'')+'</span></div><div id="h-prog" class="prog">'+(pd.all.n?progHTML(pd):'<div class="empty small">אין עדיין רשימת איסוף להיום. אחרי ״העברה לאיסוף יומי״ מהפיצול, ההתקדמות של כל גובה מופיעה כאן.</div>')+'</div></div>'+
      '<div class="panel"><div class="phd"><h3>ריבית ב־14 הימים האחרונים</h3><span class="small">'+(D.length?'סה״כ '+money(sum(D.map(d=>d.interest))):'')+'</span></div><div id="h-chart">'+chart+'</div></div>'+
      '<div class="panel"><div class="phd"><h3>התראות</h3><span class="small">'+(al.length?al.length+' פריטים':'')+'</span></div><div id="h-alerts" class="alerts">'+alertsHTML(al)+'</div></div>'+
    '</div>'+
    '<div class="panel"><div class="phd"><h3>פעילות אחרונה</h3><a class="btn plain sm" href="#/saved">לכל השמורים</a></div><div id="h-recent" class="recent">'+recent+'</div></div>';
}

/* ====================== saved accounts + search — app.html 5291-5352 ====================== */
export const SV={q:{name:'',amount:'',type:''},kind:''};
export function savedHTML(){
  const q=SV.q, toks=normName(q.name).split(' ').filter(Boolean), hasAmt=String(q.amount).trim()!=='', amt=num(q.amount);
  const list=(S.s.list||[]).slice().sort((x,y)=>String(y.date).localeCompare(String(x.date))||((y.createdAt||0)-(x.createdAt||0)));
  if(toks.length||hasAmt){
    const groups=[]; let total=0;
    for(const acc of list){
      if(SV.kind&&acc.kind!==SV.kind) continue;
      const hits=[];
      for(const ln of linesOf(acc)){
        if(q.type&&ln.t!==q.type) continue;
        if(toks.length){const nn=normName(ln.n+' '+(ln.note||'')); if(!toks.every(t=>nn.includes(t))) continue;}
        if(hasAmt&&Math.abs(num(ln.a)-amt)>=0.005) continue;
        hits.push(ln);
      }
      if(hits.length){groups.push({acc,hits});total+=hits.length;}
    }
    const status=total?('נמצאו '+total+' תוצאות ב-'+groups.length+' חשבונות'):'לא נמצאו תוצאות';
    return {status,html:total?groups.map(g=>'<div class="hg"><div class="hg-h"><span>'+esc(KL[g.acc.kind]||'')+' · '+esc(isoLabel(g.acc.date))+'</span></div>'+
      g.hits.slice(0,50).map(h=>'<a class="hitrow" href="#/report/'+encodeURIComponent(g.acc.id)+'?hn='+encodeURIComponent(normName(h.n))+'&ha='+encodeURIComponent(h.a)+'"><span>'+esc(h.n||'(ללא שם)')+(h.c?' <span class="muted small">· '+esc(h.c)+'</span>':'')+(h.note?' <span class="muted small">· '+esc(h.note)+'</span>':'')+'</span><span class="chip">'+esc(h.t)+'</span><span class="num">'+fmt(h.a)+' ₪</span></a>').join('')+'</div>').join(''):
      '<div class="empty"><b>אין התאמה</b>בדוק את האיות או נסה חלק קצר יותר מהשם.</div>'};
  }
  if(!list.length) return {status:'',html:'<div class="empty"><b>עוד לא נשמרו חשבונות</b>חשבון ששמרת יופיע כאן, אפשר יהיה לחפש בו לקוח וסכום.</div>'};
  const shown=SV.kind?list.filter(a=>a.kind===SV.kind):list;
  if(!shown.length) return {status:'',html:'<div class="empty"><b>אין חשבונות מהסוג הזה</b></div>'};
  return {status:'',html:shown.map(a=>{const h=headline(a);const n=linesOf(a).length;
    return '<a class="acc" href="#/report/'+encodeURIComponent(a.id)+'"><span class="kind '+(KC[a.kind]||'')+'">'+esc(KL[a.kind]||'')+'</span><b>'+esc(isoLabel(a.date))+'</b><span class="tot">'+esc(h.label)+' <span class="num'+(h.val<0?' neg':'')+'">'+fmt(h.val)+' ₪</span></span><span class="meta">'+esc(weekday(a.date))+' · '+n+' שורות</span></a>';}).join('')};
}

/* עיצוב לוח הבקרה והשמורים — app.html 316-327, 419-479 (בתוך .rpx) */
export const DASH_CSS=`
.rpx{--seg-got:#2f8a5f;--seg-not:#c2453b;--seg-pass:#d39a2c;--seg-open:#c9d2df}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .rpx{--seg-got:#4fbf8a;--seg-not:#ef7a70;--seg-pass:#e6b552;--seg-open:#33425c}}
:root[data-theme="dark"] .rpx{--seg-got:#4fbf8a;--seg-not:#ef7a70;--seg-pass:#e6b552;--seg-open:#33425c}
.rpx .dash-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 16px}
.rpx .dash-head h2{font-size:21px;font-weight:700}
.rpx .dash-head p{margin:2px 0 0;color:var(--muted);font-size:13.5px}
.rpx .qa{display:flex;flex-wrap:wrap;gap:8px}
.rpx .dash-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:16px;align-items:start}
.rpx .phd{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}
.rpx .phd h3{font-size:16px}
.rpx .phd .small{color:var(--muted)}
.rpx .steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.rpx .step{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:2px 12px;align-items:center;padding:11px 0;border-top:1px solid var(--line)}
.rpx .step:first-child{border-top:0;padding-top:2px}
.rpx .step .sn{grid-row:span 2;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;background:var(--surface2);color:var(--muted)}
.rpx .step.ok .sn{background:var(--ok-bg);color:var(--ok-fg)}
.rpx .step.warn .sn{background:var(--warn-bg);color:var(--warn-fg)}
.rpx .step .stt{font-weight:700}
.rpx .step .sts{grid-column:2;font-size:12.5px;color:var(--muted);min-width:0}
.rpx .step .sta{grid-column:3;grid-row:1 / span 2;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.rpx .prog{display:flex;flex-direction:column;gap:14px}
.rpx .pg{display:flex;flex-direction:column;gap:6px}
.rpx .pg-h{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap}
.rpx .pg-h b{font-weight:700}
.rpx .pg-h span{font-size:12.5px;color:var(--muted)}
.rpx .pbar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--seg-open)}
.rpx .pbar i{display:block;height:100%}
.rpx .pbar .g{background:var(--seg-got)}
.rpx .pbar .n{background:var(--seg-not)}
.rpx .pbar .p{background:var(--seg-pass)}
.rpx .pg.all .pbar{height:16px;border-radius:8px}
.rpx .legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted)}
.rpx .legend span::before{content:"";display:inline-block;width:9px;height:9px;border-radius:2px;margin-inline-end:5px;vertical-align:-1px;background:var(--c)}
.rpx .alerts,.rpx .recent{display:flex;flex-direction:column}
.rpx .al{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 0;border-top:1px solid var(--line)}
.rpx .al:first-child{border-top:0;padding-top:2px}
.rpx .al .sev{width:10px;height:10px;border-radius:50%;margin-top:6px;background:var(--seg-pass)}
.rpx .al.hi .sev{background:var(--seg-not)}
.rpx .al.lo .sev{background:var(--accent)}
.rpx .al .at{font-weight:600}
.rpx .al .as{font-size:12.5px;color:var(--muted);margin-top:2px}
.rpx .rc{width:100%;border-top:1px solid var(--line);text-align:start;padding:10px 6px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 12px;align-items:center;cursor:pointer;color:inherit;text-decoration:none;min-height:44px}
.rpx .rc:first-child{border-top:0}
.rpx .rc:hover{background:var(--accent-soft)}
.rpx .rc .kind,.rpx .acc .kind{grid-row:span 2;font-size:12px;font-weight:700;border-radius:10px;padding:1px 9px;background:var(--accent-soft);color:var(--accent-ink);white-space:nowrap}
.rpx .rc .rcn{font-weight:600}
.rpx .rc .rcm{grid-column:2;font-size:12.5px;color:var(--muted)}
.rpx .rc .rcv{grid-column:3;grid-row:1 / span 2;font-weight:700}
.rpx .kind.c{background:var(--warn-bg)!important;color:var(--warn-fg)!important}
.rpx .kind.w{background:var(--ok-bg)!important;color:var(--ok-fg)!important}
.rpx .kind.s{background:var(--surface2)!important;color:var(--fg)!important}
.rpx a.kpi{text-decoration:none;color:inherit;cursor:pointer}
.rpx .kpi .kgo{font-size:12px;color:var(--accent-ink);font-weight:600;margin-top:2px}
.rpx .hq{margin-top:4px}
.rpx .acc{width:100%;text-align:start;display:grid;grid-template-columns:auto 1fr auto;gap:4px 12px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px 14px;cursor:pointer;color:inherit;text-decoration:none}
.rpx .acc:hover{border-color:var(--accent)}
.rpx .acc .kind{grid-row:auto}
.rpx .acc b{font-size:16px}
.rpx .acc .tot{font-weight:600;font-variant-numeric:tabular-nums}
.rpx .acc .meta{grid-column:1/-1;color:var(--muted);font-size:13px}
.rpx .list{display:flex;flex-direction:column;gap:8px}
.rpx .hg{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface)}
.rpx .hg-h{background:var(--surface2);padding:8px 12px;font-weight:600;font-size:13px;display:flex;justify-content:space-between;gap:8px}
.rpx .hitrow{width:100%;border-top:1px solid var(--line);text-align:start;padding:10px 12px;display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;cursor:pointer;color:inherit;text-decoration:none;min-height:44px}
.rpx .hitrow:hover{background:var(--accent-soft)}
.rpx .rbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.rpx .rbar .grow{flex:1}
.rpx .ish{display:flex;flex-direction:column;gap:10px;border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--surface2)}
@media (max-width:520px){
  .rpx .step{grid-template-columns:28px minmax(0,1fr)}
  .rpx .step .sta{grid-column:2;grid-row:auto;flex-direction:row;align-items:center;justify-content:space-between;margin-top:6px}
}
/* סרגל חלוקת הריבית — app.html 876-887 */
.ish{display:flex;flex-direction:column;gap:10px;border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--surface2)}
.ish h3{margin:0}
.ish .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ish .row.sp{justify-content:space-between}
.ish .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.ish-bar{display:flex;direction:ltr;align-items:center;gap:12px}
.ish-bar>span{direction:rtl;white-space:nowrap;font-weight:600;font-size:14px;min-width:78px}
.ish-bar>span.ish-r{text-align:right}
.ish-bar .ish-l b{color:var(--gold)}
.ish-bar .ish-r b{color:var(--accent-ink)}
.ish input[type=range]{-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:10px;border-radius:5px;margin:10px 0;background:linear-gradient(to right,var(--gold) 0,var(--gold) var(--p,25%),var(--accent) var(--p,25%),var(--accent) 100%);cursor:pointer}
.ish input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:50%;background:var(--surface);border:2px solid var(--accent);box-shadow:0 1px 4px rgba(0,0,0,.25);cursor:grab}
.ish input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--surface);border:2px solid var(--accent);box-shadow:0 1px 4px rgba(0,0,0,.25);cursor:grab}
.ish input[type=range]:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
.rep-alerts .al{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 0;border-top:1px solid var(--line)}
.rep-alerts .al:first-child{border-top:0;padding-top:2px}
.rep-alerts .al .sev{width:10px;height:10px;border-radius:50%;margin-top:6px;background:#d39a2c}
.rep-alerts .al.hi .sev{background:#c2453b}
.rep-alerts .al.lo .sev{background:var(--accent)}
.rep-alerts .al .at{font-weight:600}
.rep-alerts .al .as{font-size:12.5px;color:var(--muted);margin-top:2px}
.rep-alerts .empty.small{padding:14px;font-size:13px}
`;
