// ייצוא ל-Excel. הדוח הכללי (מקור 5846-5935 ״ייצוא דוחות ל-Excel״) הועתק כמו שהוא, כולל פונקציות הניתוח שהוא משתמש בהן
// (anRange 4885, anMorning 4898, anCollectors 4925, anStale 4948, hlData 5703, hlSum 5721). S.s.list / LN.list / AN הוחלפו בפרמטרים.
import { calcMorning, calcCollectors, calcSplit, calcWork, workGroups, wExpList, num, r2, sum, normName, normStatus, normTime, cleanColl, cleanPh, ST_GOT, ST_PASS, ST_NOT, lnSum, lnPart, lnR2, todayISO, mRp } from '../calc.js';
import { loadVendor } from '../registry.js';
import { isoLabel } from './imports-core.js';

const fmt = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const XL_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const xlD=iso=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||'')); return m?new Date(+m[1],+m[2]-1,+m[3]):''; };
export function xlSheet(X,wb,name,head,rows,widths,money){
  const ws=X.utils.aoa_to_sheet([head].concat(rows),{cellDates:true,dateNF:'dd/mm/yyyy'});
  const R=X.utils.decode_range(ws['!ref']||'A1');
  for(let r=1;r<=R.e.r;r++) for(let c=0;c<=R.e.c;c++){
    const cell=ws[X.utils.encode_cell({r,c})]; if(!cell) continue;
    if(cell.t==='n'&&money.includes(c)) cell.z='#,##0.00';
    if(cell.t==='d') cell.z='dd/mm/yyyy';
  }
  ws['!cols']=widths.map(w=>({wch:w}));
  ws['!views']=[{RTL:true}];
  if(R.e.r>=1) ws['!autofilter']={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:R.e.r,c:R.e.c}})};
  X.utils.book_append_sheet(wb,ws,name);
}

/* ---------- ניתוחים (מקור 4878-4965) ---------- */
const pad2=n=>String(n).padStart(2,'0');
const isoOf=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return isoOf(d);};
const daysBetween=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);
export const monthLabel=ym=>{const m=/^(\d{4})-(\d{2})$/.exec(ym||'');if(!m)return ym||'';return ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'][+m[2]-1]+' '+m[1];};
// AN = {range:'30',from:'',to:'',stale:14}
export function anRange(AN){
  const t=todayISO();
  if(AN.range==='7') return [addDays(t,-6),t];
  if(AN.range==='30') return [addDays(t,-29),t];
  if(AN.range==='90') return [addDays(t,-89),t];
  if(AN.range==='mon') return [t.slice(0,8)+'01',t];
  if(AN.range==='pmon'){const d=new Date(t+'T12:00:00');d.setDate(1);d.setDate(0);const last=isoOf(d);return [last.slice(0,8)+'01',last];}
  if(AN.range==='custom'){const f=AN.from||'0000-01-01',e=AN.to||'9999-12-31';return f<=e?[f,e]:[e,f];}
  return ['0000-01-01','9999-12-31'];
}
export const rangeLabel=(f,t)=>(f<'0001'?'כל החשבונות':isoLabel(f)+' – '+isoLabel(t));
const byDateAsc=(x,y)=>String(x.date).localeCompare(String(y.date))||((x.createdAt||0)-(y.createdAt||0));
export function anMorning(list,from,to){
  const ms=(list||[]).filter(a=>a&&a.kind==='morning'&&a.date&&a.date>=from&&a.date<=to).slice().sort(byDateAsc);
  const tot={interest:0,principal:0,robi:0,line:0,courier:0,loans:0,loanCount:0,payers:0,n:ms.length,rps:new Set()};
  const days=new Map(), clients=new Map(), months=new Map();
  const cl=n=>{const k=normName(n);if(!k)return null;if(!clients.has(k))clients.set(k,{n:String(n).trim(),k,interest:0,principal:0,loans:0,pays:0,loanN:0,events:[],last:'',lastLoan:''});return clients.get(k);};
  const mo=d=>{const k=String(d).slice(0,7);if(!months.has(k))months.set(k,{k,interest:0,principal:0,loans:0,courier:0,robi:0,days:new Set(),final:0});return months.get(k);};
  for(const a of ms){
    const c=calcMorning(a);
    tot.interest=r2(tot.interest+c.interest);tot.principal=r2(tot.principal+c.principal);tot.robi=r2(tot.robi+c.robi);tot.line=r2(tot.line+c.line);tot.rps.add(c.rp);
    tot.courier=r2(tot.courier+c.courier);tot.loans=r2(tot.loans+c.loansTotal);tot.loanCount+=c.loans.length;tot.payers+=(a.rows||[]).length;
    if(!days.has(a.date))days.set(a.date,{date:a.date,interest:0,principal:0,loans:0,courier:0,final:c.final,keren:c.keren,n:0});
    const d=days.get(a.date);d.interest=r2(d.interest+c.interest);d.principal=r2(d.principal+c.principal);d.loans=r2(d.loans+c.loansTotal);d.courier=r2(d.courier+c.courier);d.final=c.final;d.n++;
    const m=mo(a.date);m.interest=r2(m.interest+c.interest);m.principal=r2(m.principal+c.principal);m.loans=r2(m.loans+c.loansTotal);m.courier=r2(m.courier+c.courier);m.robi=r2(m.robi+c.robi);m.days.add(a.date);m.final=c.final;
    for(const r of a.rows||[]){const x=cl(r.n);if(!x)continue;
      if(r.i){x.interest=r2(x.interest+num(r.i));x.events.push({date:a.date,t:'ריבית',a:num(r.i)});}
      if(r.p){x.principal=r2(x.principal+num(r.p));x.events.push({date:a.date,t:'קרן',a:num(r.p)});}
      if(r.i||r.p){x.pays++;if(a.date>x.last)x.last=a.date;}}
    for(const l of a.loans||[]){const x=cl(l.n);if(!x)continue;x.loans=r2(x.loans+num(l.a));x.loanN++;x.events.push({date:a.date,t:'הלוואה',a:num(l.a)});if(a.date>x.lastLoan)x.lastLoan=a.date;}
  }
  tot.collected=r2(tot.interest+tot.principal);
  tot.kerenStart=ms.length?calcMorning(ms[0]).keren:0; tot.kerenEnd=ms.length?calcMorning(ms[ms.length-1]).final:0; tot.kerenDelta=r2(tot.kerenEnd-tot.kerenStart);
  const dl=Array.from(days.values()).sort((x,y)=>x.date.localeCompare(y.date));
  tot.avgInterest=dl.length?r2(tot.interest/dl.length):0; tot.avgCollected=dl.length?r2(tot.collected/dl.length):0;
  tot.firstDate=dl.length?dl[0].date:'';tot.lastDate=dl.length?dl[dl.length-1].date:'';
  return {ms,tot,days:dl,clients,months:Array.from(months.values()).sort((x,y)=>x.k.localeCompare(y.k))};
}
export function anCollectors(list,from,to){
  const ws=(list||[]).filter(a=>a&&a.kind==='work'&&a.date&&a.date>=from&&a.date<=to);
  const cs=(list||[]).filter(a=>a&&a.kind==='collectors'&&a.date&&a.date>=from&&a.date<=to);
  const W=new Map(), C=new Map();
  const g=(m,c)=>{const k=c||'ללא גובה';if(!m.has(k))m.set(k,{c:k,lists:new Set(),n:0,total:0,got:0,gotA:0,pass:0,exp:0});return m.get(k);};
  for(const a of ws){
    for(const e of a.entries||[]){const x=g(W,cleanColl(e.c));x.lists.add(a.date);x.n++;x.total=r2(x.total+num(e.a));
      const s=normStatus(e.s);if(s===ST_GOT){x.got++;x.gotA=r2(x.gotA+((e.ga!==undefined&&e.ga!==null&&e.ga!=='')?num(e.ga):num(e.a)));}else if(s===ST_PASS)x.pass++;else if(s===ST_NOT){x.ng=(x.ng||0)+1;}}
    for(const e of a.expenses||[]){const x=g(W,cleanColl(e.c));x.lists.add(a.date);x.exp=r2(x.exp+num(e.a));}
  }
  for(const a of cs){
    for(const e of a.entries||[]){const x=g(C,cleanColl(e.c));x.lists.add(a.date);
      if(e.k==='e')x.exp=r2(x.exp+num(e.a));else{x.n++;x.total=r2(x.total+num(e.a));}}
  }
  /* ימים בלי חשבון גובים (מעכשיו לא מעבירים — ״סיכום גובים לסוף היום״ באיסוף): מהאיסוף היומי — מה שנגבה בפועל, פחות ההוצאות (נטו למסירה) */
  const cd=new Set(cs.map(a=>a.date)); let nf=0;
  for(const a of ws){
    if(cd.has(a.date)) continue; nf++;
    for(const e of a.entries||[]){ if(normStatus(e.s)!==ST_GOT) continue; const x=g(C,cleanColl(e.c)); x.lists.add(a.date); x.n++; x.total=r2(x.total+((e.ga!==undefined&&e.ga!==null&&e.ga!=='')?num(e.ga):num(e.a))); x.fw=1; }
    for(const e of a.expenses||[]){const x=g(C,cleanColl(e.c));x.lists.add(a.date);x.exp=r2(x.exp+num(e.a));x.fw=1;}
  }
  const fin=m=>Array.from(m.values()).map(x=>Object.assign(x,{days:x.lists.size,net:r2(x.total-x.exp),rate:x.n?Math.round(100*x.got/x.n):0})).sort((x,y)=>y.total-x.total);
  return {work:fin(W),coll:fin(C),nw:ws.length,nc:cs.length+nf,ncf:nf};
}
function anLatestSplit(list){
  const sps=(list||[]).filter(a=>a&&a.kind==='split'&&a.date).sort(byDateAsc);
  return sps.length?sps[sps.length-1]:null;
}
export function anStale(list,staleDays){
  const sp=anLatestSplit(list); if(!sp) return null;
  const all=anMorning(list,'0000-01-01','9999-12-31').clients, t=todayISO(), out=[];
  const seen=new Set();
  for(const r of sp.records||[]){
    if(!r||r.side||!num(r.a)||!String(r.n||'').trim()) continue;
    const k=normName(r.n); if(!k||seen.has(k)) continue; seen.add(k);
    const c=all.get(k); const last=c&&c.last?c.last:'';
    const since=last?daysBetween(last,t):null;
    if(since===null||since>=staleDays) out.push({n:r.n,a:num(r.a),c:String(r.c||'').trim(),ph:cleanPh(r.ph),last,since,lastLoan:c?c.lastLoan:''});
  }
  out.sort((x,y)=>(y.since===null?9999:y.since)-(x.since===null?9999:x.since)||y.a-x.a);
  return {date:sp.date,rows:out,total:sum(out.map(x=>x.a)),n:(sp.records||[]).filter(r=>r&&!r.side&&num(r.a)).length};
}
/* ---------- לוח בקרה: תיק ההלוואות (מקור 5703-5721) ---------- */
export function hlData(loans){
  const t=todayISO(), w=addDays(t,7), m=t.slice(0,7);
  const out={open:[],today:[],week:[],late:[],paidM:[],n:0};
  loans.forEach(L=>{
    const s=lnSum(L); if(!s) return; out.n++;
    if(!s.closed) out.open.push({L,s});
    const paid=L.paid||{};
    s.s.rows.forEach(x=>{
      if(paid[x.i]){ if(String(paid[x.i]).slice(0,7)===m) out.paidM.push({L,x,pd:String(paid[x.i])}); return; }
      /* תשלום ששולם חלקית: נספר מה שנכנס, ובמועד/בפיגור נשאר רק מה שנותר */
      const q=lnPart(L,x.i);
      q.list.forEach(r=>{ if(String(r.d).slice(0,7)===m) out.paidM.push({L,x:Object.assign({},x,{payment:+r.a||0,principal:+r.p||0,interest:+r.ii||0,partA:1}),pd:String(r.d)}); });
      const xr=q.list.length?Object.assign({},x,{payment:lnR2(x.payment-q.a),principal:lnR2(Math.max(0,x.principal-q.p)),interest:lnR2(Math.max(0,x.interest-q.ii)),partA:q.a}):x;
      if(x.date===t) out.today.push({L,x:xr}); else if(x.date>t&&x.date<=w) out.week.push({L,x:xr}); else if(x.date<t) out.late.push({L,x:xr});
    });
  });
  return out;
}
export const hlSum=rows=>({n:rows.length,a:r2(rows.reduce((s,r)=>s+r.x.payment,0)),p:r2(rows.reduce((s,r)=>s+r.x.principal,0)),i:r2(rows.reduce((s,r)=>s+r.x.interest,0)),loans:new Set(rows.map(r=>r.L.id)).size});

/* ---------- ייצוא דוחות ל-Excel (מקור 5846-5935) ---------- */
export function xlLoanRows(LNlist){
  const t=todayISO(), loans=[], inst=[], flow=new Map();
  const fm=k=>{ if(!flow.has(k)) flow.set(k,{k,ea:0,ep:0,ei:0,ra:0,rp:0,ri:0}); return flow.get(k); };
  LNlist.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'he')).forEach(L=>{
    const m=lnSum(L); if(!m) return; const paid=L.paid||{};
    loans.push([L.name||'',L.phone||'',xlD(L.date),+L.amount||0,L.type==='week'?'שבועית':'חודשית',+L.rate||0,m.s.rows.length,m.st.paidN,m.paidPrin,m.paidInt,m.closed?0:m.remain,m.lateRows.length,m.lateAmt,m.next?xlD(m.next.date):'',m.st.txt]);
    m.s.rows.forEach(x=>{
      const q=lnPart(L,x.i), e=fm(x.date.slice(0,7));
      e.ea+=x.payment; e.ep+=x.principal; e.ei+=x.interest;
      let st, pd='', ra=0, rp=0, ri=0;
      if(paid[x.i]){ st=x.date>String(paid[x.i]).slice(0,10)?'שולם (מוקדם)':'שולם'; pd=xlD(paid[x.i]); ra=x.payment; rp=x.principal; ri=x.interest; const r=fm(String(paid[x.i]).slice(0,7)); r.ra+=ra; r.rp+=rp; r.ri+=ri; }
      else{
        st=q.list.length?(x.date<t?'חלקי · בפיגור':'חלקי'):(x.date<t?'בפיגור':(x.date===t?'להיום':'עתידי'));
        if(q.list.length){ ra=q.a; rp=q.p; ri=q.ii; pd=xlD(q.list[q.list.length-1].d); q.list.forEach(r=>{ const f=fm(String(r.d).slice(0,7)); f.ra+=+r.a||0; f.rp+=+r.p||0; f.ri+=+r.ii||0; }); }
      }
      inst.push([L.name||'',x.i,xlD(x.date),x.payment,x.principal,x.interest,st,pd,ra,rp,ri,lnR2(x.payment-ra)]);
    });
  });
  const fl=[...flow.values()].sort((a,b)=>a.k.localeCompare(b.k)).map(f=>[monthLabel(f.k),r2(f.ea),r2(f.ep),r2(f.ei),r2(f.ra),r2(f.rp),r2(f.ri),r2(f.ea-f.ra)]);
  return {loans,inst,fl};
}
// בונה את חוברת הדוחות. list = כל החשבונות השמורים, LNlist = כל ההלוואות, AN = {range,from,to,stale}. מחזיר {wb,name}
export async function xlBuildReport(list,LNlist,AN){
  await loadVendor('xlsx.full.min.js'); const X=window.XLSX; if(!X) throw new Error('xlsx');
  const [from,to]=anRange(AN), M=anMorning(list,from,to), t=M.tot, K=anCollectors(list,from,to), ST=anStale(list,AN.stale), LR=xlLoanRows(LNlist);
  const D=LNlist.length?hlData(LNlist):null, hs=a=>a?hlSum(a):{a:0,p:0,i:0,n:0};
  const wb=X.utils.book_new(); wb.Workbook={Views:[{RTL:true}]};
  const openP=D?r2(D.open.reduce((a,o)=>a+o.s.remain,0)):0, lt=hs(D&&D.late), tdy=hs(D&&D.today), pm=hs(D&&D.paidM);
  xlSheet(X,wb,'סיכום',['פריט','סכום','הערה'],[
    ['תקופה',rangeLabel(from,to),M.ms.length+' חשבונות בוקר · '+M.days.length+' ימי גבייה'],
    ['ריבית שנגבתה',t.interest,'בפועל, לפי חשבונות הבוקר'],['חלק רובי מהריבית',t.robi,''],['חלק הקו מהריבית',t.line,''],['משלוחים',-t.courier,''],['יתרת הקו לאחר משלוחים',r2(t.line-t.courier),''],
    ['קרן שנגבתה',t.principal,'בפועל'],['סה״כ נגבה (ריבית + קרן)',t.collected,'בפועל'],['הלוואות שניתנו',-t.loans,t.loanCount+' הלוואות'],
    ['קרן בתחילת התקופה',t.kerenStart,''],['קרן בסוף התקופה',t.kerenEnd,''],['שינוי בקרן',t.kerenDelta,''],
    ['',null,''],['תיק ההלוואות (לשונית הלוואות, מצב נוכחי)',null,''],
    ['יתרת קרן פתוחה',openP,(D?D.open.length:0)+' הלוואות פעילות'],['לתשלום היום (צפוי)',tdy.a,'קרן '+fmt(tdy.p)+' · ריבית '+fmt(tdy.i)],
    ['בפיגור',lt.a,lt.n+' תשלומים · קרן '+fmt(lt.p)+' · ריבית '+fmt(lt.i)],['שולם החודש (בפועל)',pm.a,'קרן '+fmt(pm.p)+' · ריבית '+fmt(pm.i)],
    ['',null,''],['הופק',xlD(todayISO()),'מבוסס על הנתונים השמורים בתוכנה בלבד']
  ].map(r=>r.map(v=>v===null?'':v)),[38,18,46],[1]);
  xlSheet(X,wb,'לפי יום',['תאריך','ריבית','קרן','סה״כ נגבה','הלוואות שניתנו','משלוחים','קרן בסוף היום'],
    M.days.map(d=>[xlD(d.date),d.interest,d.principal,r2(d.interest+d.principal),d.loans,d.courier||0,d.final]),[13,13,13,14,15,11,15],[1,2,3,4,5,6]);
  xlSheet(X,wb,'לפי חודש',['חודש','ימי גבייה','ריבית','קרן','סה״כ נגבה','הלוואות שניתנו','משלוחים','חלק רובי','קרן בסוף החודש'],
    M.months.map(m=>[monthLabel(m.k),m.days.size,m.interest,m.principal,r2(m.interest+m.principal),m.loans,m.courier,m.robi,m.final]),[14,10,13,13,14,15,11,12,16],[2,3,4,5,6,7,8]);
  xlSheet(X,wb,'לקוחות',['לקוח','ריבית ששילם','קרן ששילם','סה״כ שילם','תשלומים','הלוואות שקיבל','מספר הלוואות','תשלום אחרון'],
    Array.from(M.clients.values()).sort((a,b)=>b.interest-a.interest).map(c=>[c.n,c.interest,c.principal,r2(c.interest+c.principal),c.pays,c.loans,c.loanN,c.last?xlD(c.last):'']),[22,14,14,14,10,15,12,13],[1,2,3,5]);
  xlSheet(X,wb,'גובים - איסוף יומי',['גובה','ימים','חייבים','סה״כ לאיסוף','נאסף בפועל','אחוז נאסף','לא נאסף','לעבור','הוצאות','נטו'],
    K.work.map(x=>[x.c,x.days,x.n,x.total,x.gotA,x.rate/100,x.ng||0,x.pass||0,x.exp,x.net]),[16,8,9,14,14,11,10,9,12,12],[3,4,8,9]);
  xlSheet(X,wb,'גובים - חשבון גובים',['גובה','ימים','חובות','סה״כ','הוצאות','נטו','ממוצע ליום'],
    K.coll.map(x=>[x.c,x.days,x.n,x.total,x.exp,x.net,x.days?r2(x.net/x.days):0]),[16,8,9,14,12,12,13],[3,4,5,6]);
  xlSheet(X,wb,'לא שילמו',['לקוח','יתרה','גובה','טלפון','תשלום אחרון','ימים מאז'],
    ST?ST.rows.map(r=>[r.n,r.a,r.c,r.ph||'',r.last?xlD(r.last):'',r.since===null?'':r.since]):[],[22,13,14,14,13,10],[1]);
  xlSheet(X,wb,'הלוואות',['לווה','טלפון','תאריך מתן','סכום','סוג','ריבית %','תשלומים','שולמו','קרן ששולמה','ריבית ששולמה','יתרת קרן','תשלומים בפיגור','סכום בפיגור','התשלום הבא','סטטוס'],
    LR.loans,[20,13,12,12,9,8,9,8,13,13,13,13,13,12,12],[3,8,9,10,12]);
  xlSheet(X,wb,'תשלומי הלוואות',['לווה','מספר תשלום','מועד','תשלום צפוי','קרן צפויה','ריבית צפויה','סטטוס','תאריך תשלום','שולם בפועל','קרן בפועל','ריבית בפועל','נותר'],
    LR.inst,[20,11,12,13,13,13,14,13,13,12,12,12],[3,4,5,8,9,10,11]);
  xlSheet(X,wb,'תזרים הלוואות',['חודש','צפוי לפי הלוח','מזה קרן','מזה ריבית','התקבל בפועל','מזה קרן','מזה ריבית','פער (צפוי פחות בפועל)'],
    LR.fl,[14,15,13,13,15,13,13,20],[1,2,3,4,5,6,7]);
  /* אחוז נאסף כאחוז */
  const gw=wb.Sheets['גובים - איסוף יומי']; if(gw){ const R=X.utils.decode_range(gw['!ref']); for(let r=1;r<=R.e.r;r++){ const c=gw[X.utils.encode_cell({r,c:5})]; if(c&&c.t==='n') c.z='0%'; } }
  const name='דוח '+(from<'0001'?'כל החשבונות':isoLabel(from)+'-'+isoLabel(to)).replace(/[\\/:*?"<>|]/g,'.')+'.xlsx';
  return {wb,name,M,K,ST,LR};
}

/* ---------- ייצוא חשבון אחד (תוספת: במקור היה רק הדוח הכללי). המספרים מחושבים באותן פונקציות של התוכנה ---------- */
const KIND_NAMES={morning:'חשבון בוקר',split:'פיצול',collectors:'חשבון גובים',work:'איסוף יום'};
export async function xlBuildAccount(a){
  await loadVendor('xlsx.full.min.js'); const X=window.XLSX;
  const wb=X.utils.book_new(); wb.Workbook={Views:[{RTL:true}]};
  if(a.kind==='morning'){
    const c=calcMorning(a), rp=mRp(a);
    xlSheet(X,wb,'סיכום',['פריט','סכום'],[
      ['תאריך',xlD(a.date)],['ריבית',c.interest],['חלק רובי ('+rp+'%)',c.robi],['חלק הקו ('+r2(100-rp)+'%)',c.line],['משלוחים',c.courier],['יתרת הקו לאחר משלוחים',c.lineRem],
      ['קרן שנגבתה',c.principal],['קרן קיימת',c.keren],['סה״כ קרן',c.kerenTotal],['הלוואות שניתנו',c.loansTotal],['קרן סופית',c.final]],[30,16],[1]);
    xlSheet(X,wb,'שורות',['לקוח','תשלום קרן','תשלום ריבית'],(a.rows||[]).map(r=>[r.n||'',num(r.p),num(r.i)]),[26,14,14],[1,2]);
    xlSheet(X,wb,'הלוואות',['לקוח','סכום'],(a.loans||[]).map(l=>[l.n||'',num(l.a)]),[26,14],[1]);
  } else if(a.kind==='collectors'){
    const c=calcCollectors(a.entries||[]);
    xlSheet(X,wb,'סיכום',['גובה','חובות','הוצאות','נטו'],c.groups.map(g=>[g.c,g.debtTotal,g.expTotal,g.net]).concat([['סה״כ',c.totalDebts,c.totalExp,c.totalNet]]),[18,14,14,14],[1,2,3]);
    const rows=[]; c.groups.forEach(g=>{ g.debts.forEach(d=>rows.push([g.c,'חוב',d.n,d.a])); g.exps.forEach(d=>rows.push([g.c,'הוצאה',d.n,d.a])); });
    xlSheet(X,wb,'שורות',['גובה','סוג','שם','סכום'],rows,[18,10,26,14],[3]);
  } else if(a.kind==='split'){
    const c=calcSplit(a.records||[]); const rows=[];
    c.blocks.forEach(b=>b.sections.forEach(x=>x.rows.forEach(r=>rows.push([b.c,x.t||'',r.n||'',num(r.a),cleanPh(r.ph),r.note||'',normTime(r.t)||'',r.h||'']))));
    c.sides.forEach(r=>rows.push(['לא נגבים היום','',r.n||'',num(r.a),cleanPh(r.ph),r.note||'',normTime(r.t)||'',r.h||'']));
    xlSheet(X,wb,'סיכום',['גובה','שורות','סה״כ'],c.blocks.map(b=>[b.c,b.count,b.total]).concat(c.sides.length?[['לא נגבים היום',c.sides.length,c.sideTotal]]:[],[['סה״כ כללי (גובים)','',c.grand],['סה״כ הכול','',c.all]]),[26,10,16],[2]);
    xlSheet(X,wb,'שורות',['גובה','קבוצה','שם','יתרה','טלפון','הערה','שעה','קשה / לא קשה'],rows,[16,10,24,13,14,26,8,12],[3]);
  } else if(a.kind==='work'){
    const es=(a.entries||[]).filter(e=>e&&(e.n||e.a)), xs=wExpList(a), G=workGroups(es,xs)||[{name:'',calc:calcWork(es),exp:xs,expTotal:sum(xs.map(x=>x.a)),net:r2(calcWork(es).total-sum(xs.map(x=>x.a)))}];
    xlSheet(X,wb,'סיכום',['גובה','חייבים','צפוי','נאסף בפועל','לא נאסף','הוצאות','נטו'],G.map(g=>[g.name,g.calc.count,g.calc.total,g.calc.gotTotal,g.calc.notTotal,g.expTotal,g.net]),[16,9,14,14,12,12,12],[2,3,4,5,6]);
    const rows=[]; G.forEach(g=>g.calc.rows.forEach(r=>rows.push([g.name,r.n,r.a,r.t,r.s||'',r.ga!==null?r.ga:'',r.p,r.h])));
    xlSheet(X,wb,'שורות',['גובה','שם','סכום','שעה','סטטוס','נאסף בפועל','טלפון','קשה / לא קשה'],rows,[16,24,13,8,10,13,14,12],[2,5]);
    xlSheet(X,wb,'הוצאות',['גובה','הוצאה','סכום'],xs.map(x=>[x.c,x.n,x.a]),[16,24,13],[2]);
  }
  const name=(KIND_NAMES[a.kind]||'חשבון')+' '+isoLabel(a.date).replace(/[\\/:*?"<>|]/g,'.')+'.xlsx';
  return {wb,name};
}
export function xlDownload(wb,name){
  const out=window.XLSX.write(wb,{bookType:'xlsx',type:'array',cellDates:true});
  const url=URL.createObjectURL(new Blob([out],{type:XL_MIME}));
  const a=document.createElement('a'); a.href=url; a.download=name; a.style.display='none'; document.body.appendChild(a); a.click();
  setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); },30000);
}
