// ניתוחים ומגמות על החשבונות השמורים — הועתק מהתוכנה המקורית (app.html 4877-5178, 5850-5933, 9846, 6372-6410 hlData/hlSum).
// במקור הרשימה היא S.s.list (כל החשבונות המלאים); כאן היא נטענת מהשרת (GET /api/reports/accounts) לתוך אותו מבנה S.
import { calcMorning, num, r2, sum, normName, cleanPh, cleanColl, normStatus, ST_GOT, ST_NOT, ST_PASS, todayISO, lnSum, lnPart, lnR2 } from '../calc.js';
import { esc, fmt, money, RSEAL, isoLabel, weekday, pctS, buildPdf, sharePdf } from './reports-print.js';
import { loadVendor } from '../registry.js';

export const S = { s: { list: [] } };
export const LN = { list: [] };
export const AN={range:'30',from:'',to:'',q:'',client:null,stale:14,coll:'work',dirty:true};

/* ====================== ניתוחים (analytics over saved accounts) — app.html 4877 ====================== */
const pad2=n=>String(n).padStart(2,'0');
export const isoOf=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
export const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return isoOf(d);};
export const daysBetween=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);
const monthLabel=ym=>{const m=/^(\d{4})-(\d{2})$/.exec(ym||'');if(!m)return ym||'';return ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'][+m[2]-1]+' '+m[1];};
const WD=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
export function anRange(){
  const t=todayISO();
  if(AN.range==='7') return [addDays(t,-6),t];
  if(AN.range==='30') return [addDays(t,-29),t];
  if(AN.range==='90') return [addDays(t,-89),t];
  if(AN.range==='mon') return [t.slice(0,8)+'01',t];
  if(AN.range==='pmon'){const d=new Date(t+'T12:00:00');d.setDate(1);d.setDate(0);const last=isoOf(d);return [last.slice(0,8)+'01',last];}
  if(AN.range==='custom'){const f=AN.from||'0000-01-01',e=AN.to||'9999-12-31';return f<=e?[f,e]:[e,f];}
  return ['0000-01-01','9999-12-31'];
}
const rangeLabel=(f,t)=>(f<'0001'?'כל החשבונות':isoLabel(f)+' – '+isoLabel(t));
export const byDateAsc=(x,y)=>String(x.date).localeCompare(String(y.date))||((x.createdAt||0)-(y.createdAt||0));
// app.html 9846
export function rpPart(t,who){ const s=t&&t.rps?Array.from(t.rps):[]; if(s.length>1) return 'לפי כל חשבון'; const rp=s.length?s[0]:25; return pctS(who==='r'?rp:r2(100-rp)); }
/* every morning account in a date range, aggregated into totals, per-day rows, per-client and per-month maps */
export function anMorning(from,to){
  const ms=(S.s.list||[]).filter(a=>a&&a.kind==='morning'&&a.date&&a.date>=from&&a.date<=to).slice().sort(byDateAsc);
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
/* collector performance from daily collection lists (איסוף יומי) and from חשבון גובים */
export function anCollectors(from,to){
  const ws=(S.s.list||[]).filter(a=>a&&a.kind==='work'&&a.date&&a.date>=from&&a.date<=to);
  const cs=(S.s.list||[]).filter(a=>a&&a.kind==='collectors'&&a.date&&a.date>=from&&a.date<=to);
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
  const fin=m=>Array.from(m.values()).map(x=>Object.assign(x,{days:x.lists.size,net:r2(x.total-x.exp),rate:x.n?Math.round(100*x.got/x.n):0})).sort((x,y)=>y.total-x.total);
  return {work:fin(W),coll:fin(C),nw:ws.length,nc:cs.length};
}
/* the newest saved split (פיצול): who owes what today, per collector */
export function anLatestSplit(){
  const sps=(S.s.list||[]).filter(a=>a&&a.kind==='split'&&a.date).sort(byDateAsc);
  return sps.length?sps[sps.length-1]:null;
}
/* clients in the latest split with a balance who have not paid for AN.stale days (or never, in the saved accounts) */
export function anStale(){
  const sp=anLatestSplit(); if(!sp) return null;
  const all=anMorning('0000-01-01','9999-12-31').clients, t=todayISO(), out=[];
  const seen=new Set();
  for(const r of sp.records||[]){
    if(!r||r.side||!num(r.a)||!String(r.n||'').trim()) continue;
    const k=normName(r.n); if(!k||seen.has(k)) continue; seen.add(k);
    const c=all.get(k); const last=c&&c.last?c.last:'';
    const since=last?daysBetween(last,t):null;
    if(since===null||since>=AN.stale) out.push({n:r.n,a:num(r.a),c:String(r.c||'').trim(),ph:cleanPh(r.ph),last,since,lastLoan:c?c.lastLoan:''});
  }
  out.sort((x,y)=>(y.since===null?9999:y.since)-(x.since===null?9999:x.since)||y.a-x.a);
  return {date:sp.date,rows:out,total:sum(out.map(x=>x.a)),n:(sp.records||[]).filter(r=>r&&!r.side&&num(r.a)).length};
}
/* ---------- charts (inline SVG, single series, theme tokens) ---------- */
const svgTxt=(x,y,t,o)=>'<text x="'+x+'" y="'+y+'" font-size="'+(o&&o.fs||11)+'" fill="'+(o&&o.fill||'var(--muted)')+'" text-anchor="'+(o&&o.an||'middle')+'"'+(o&&o.w?' font-weight="'+o.w+'"':'')+'>'+esc(t)+'</text>';
const shortNum=v=>{const a=Math.abs(v);if(a>=1e6)return (v/1e6).toFixed(1).replace(/\.0$/,'')+'M';if(a>=1e4)return Math.round(v/1e3)+'K';if(a>=1e3)return (v/1e3).toFixed(1).replace(/\.0$/,'')+'K';return String(Math.round(v));};
function niceMax(v){if(v<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(v)));const f=v/p;const n=f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10;return n*p;}
export function chartBars(items,o){
  o=o||{}; if(!items.length) return '<div class="empty small">אין נתונים לתקופה</div>';
  const W=440,H=o.h||210,L=40,R=8,T=18,B=o.rot?52:30, iw=W-L-R, ih=H-T-B;
  const vals=items.map(i=>i.v), mx=niceMax(Math.max.apply(null,vals.concat([0]))), mn=Math.min.apply(null,vals.concat([0]));
  const span=mx-(mn<0?mn:0), y0=T+ih*(mx/span), sy=v=>T+ih*((mx-v)/span);
  const bw=Math.max(4,Math.min(48,(iw/items.length)-4)), step=iw/items.length;
  let s='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(o.title||'')+'" preserveAspectRatio="xMidYMid meet">';
  for(let g=0;g<=4;g++){const y=T+ih*g/4;const v=mx-span*g/4;s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)" stroke-width="1"/>'+svgTxt(L-6,y+4,shortNum(v),{an:'end',fs:11});}
  items.forEach((it,i)=>{const x=L+step*i+(step-bw)/2, y=sy(it.v), h=Math.abs(y0-y), top=Math.min(y,y0);
    s+='<g class="bar"><title>'+esc(it.l)+': '+fmt(it.v)+' ₪'+(it.sub?' · '+esc(it.sub):'')+'</title>';
    s+='<rect x="'+x+'" y="'+top+'" width="'+bw+'" height="'+Math.max(h,it.v?2:0)+'" rx="3" fill="'+(it.hl?'var(--accent)':(o.color||'var(--accent)'))+'" opacity="'+(it.dim?0.45:0.95)+'"/>';
    if(o.labels||items.length<=8) s+=svgTxt(x+bw/2,top-4,shortNum(it.v),{fs:11,fill:'var(--fg)'});
    const ev=Math.max(1,Math.ceil(items.length/8));
    if(i%ev===0||i===items.length-1) s+=o.rot?'<text transform="translate('+(x+bw/2)+','+(H-B+12)+') rotate(-45)" font-size="11" fill="var(--muted)" text-anchor="end">'+esc(it.l)+'</text>':svgTxt(x+bw/2,H-B+16,it.l,{fs:12});
    s+='</g>';});
  s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y0+'" y2="'+y0+'" stroke="var(--muted)" stroke-width="1"/>';
  return s+'</svg>';
}
function chartLine(pts,o){
  o=o||{}; if(pts.length<2) return pts.length?'<div class="empty small">צריך לפחות שני ימים בשביל גרף מגמה</div>':'<div class="empty small">אין נתונים לתקופה</div>';
  const W=440,H=o.h||210,L=44,R=12,T=18,B=28, iw=W-L-R, ih=H-T-B;
  const vals=pts.map(p=>p.v), hi=Math.max.apply(null,vals), lo=Math.min.apply(null,vals);
  const st=niceMax((hi-lo)||Math.abs(hi)||1)/4, mn=(o.zero||lo<0)?Math.min(0,Math.floor(lo/st)*st):Math.floor(lo/st)*st, mx=Math.max(Math.ceil(hi/st)*st,mn+st);
  const span=(mx-mn)||1, sx=i=>L+iw*(pts.length>1?i/(pts.length-1):0.5), sy=v=>T+ih*((mx-v)/span);
  let s='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(o.title||'')+'" preserveAspectRatio="xMidYMid meet">';
  for(let g=0;g<=4;g++){const y=T+ih*g/4;const v=mx-span*g/4;s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)"/>'+svgTxt(L-6,y+4,shortNum(v),{an:'end',fs:11});}
  const d=pts.map((p,i)=>(i?'L':'M')+sx(i).toFixed(1)+' '+sy(p.v).toFixed(1)).join(' ');
  s+='<path d="'+d+' L'+sx(pts.length-1).toFixed(1)+' '+(T+ih)+' L'+L+' '+(T+ih)+' Z" fill="var(--accent)" opacity=".12"/>';
  s+='<path d="'+d+'" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  const every=Math.max(1,Math.ceil(pts.length/5));
  pts.forEach((p,i)=>{const x=sx(i),y=sy(p.v);
    s+='<g class="pt"><title>'+esc(p.l)+': '+fmt(p.v)+' ₪</title><circle cx="'+x+'" cy="'+y+'" r="9" fill="transparent"/><circle cx="'+x+'" cy="'+y+'" r="'+(i===pts.length-1||p.v===hi||p.v===lo?4:2.5)+'" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></g>';
    if((i%every===0&&i<pts.length-1-every/2)||i===pts.length-1) s+=svgTxt(x,H-B+16,p.l,{fs:11});
    if(p.v===hi||p.v===lo||i===pts.length-1) s+=svgTxt(x,y-9,shortNum(p.v),{fs:10,fill:'var(--fg)',w:700});});
  return s+'</svg>';
}
/* ---------- rendering ---------- */
export const kpi=(l,v,sub,cls)=>'<div class="kpi'+(cls?' '+cls:'')+'"><span class="kl">'+esc(l)+'</span><b class="kv num'+(v<0?' neg':'')+'">'+fmt(v)+' ₪</b>'+(sub?'<span class="ks">'+sub+'</span>':'')+'</div>';
export const kpiRaw=(l,v,sub,cls)=>'<div class="kpi'+(cls?' '+cls:'')+'"><span class="kl">'+esc(l)+'</span><b class="kv">'+v+'</b>'+(sub?'<span class="ks">'+sub+'</span>':'')+'</div>';
export const delta=(cur,prev)=>{if(!prev)return '';const d=r2(cur-prev), p=Math.round(100*d/Math.abs(prev));return '<span class="'+(d>=0?'up':'dn')+'">'+(d>=0?'▲':'▼')+' '+Math.abs(p)+'% לעומת התקופה הקודמת</span>';};
const tbl=(head,rows,cls)=>'<div class="tbl-wrap"><table class="ed an'+(cls?' '+cls:'')+'"><thead><tr>'+head.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):'<tr><td colspan="'+head.length+'" class="muted" style="text-align:center">אין נתונים</td></tr>')+'</tbody></table></div>';
const td=v=>'<td>'+v+'</td>', tdn=v=>'<td class="a num'+(v<0?' neg':'')+'">'+fmt(v)+' ₪</td>';
function clientBtn(n){return '<button class="lnk" type="button" data-client="'+esc(normName(n))+'">'+esc(n)+'</button>';}
export function anBody(){
  const [from,to]=anRange(); const M=anMorning(from,to), t=M.tot;
  const head=rangeLabel(from,to)+' · '+M.ms.length+' חשבונות בוקר';
  /* previous period of equal length, for the deltas */
  let P=null; if(from>'0001'&&t.n){const len=daysBetween(from,to)+1;P=anMorning(addDays(from,-len),addDays(from,-1)).tot;if(!P.n)P=null;}
  const K=anCollectors(from,to), ST=anStale();
  let h='';
  if(!M.ms.length&&!K.nw&&!K.nc){
    return {head,html:'<div class="empty"><b>אין חשבונות שמורים בתקופה</b>בחר תקופה אחרת, או שמור חשבונות וחזור לכאן.</div>'};
  }
  /* 1. headline numbers */
  h+='<div class="panel" id="an-kpis"><h2>המספרים של התקופה</h2><div class="kpis">'+
    kpi('ריבית שנגבתה',t.interest,delta(t.interest,P&&P.interest)+(M.days.length?'<span>ממוצע ליום גבייה: '+fmt(t.avgInterest)+' ₪</span>':''))+
    kpi('קרן שנגבתה',t.principal,delta(t.principal,P&&P.principal))+
    kpi('חלק רובי ('+rpPart(t,'r')+')',t.robi,delta(t.robi,P&&P.robi))+
    kpi('חלק הקו ('+rpPart(t,'l')+')',t.line,'<span>אחרי משלוחים: '+fmt(r2(t.line-t.courier))+' ₪</span>')+
    kpi('הלוואות שניתנו',t.loans,delta(t.loans,P&&P.loans)+'<span>'+t.loanCount+' הלוואות</span>')+
    kpi('משלוחים',t.courier,delta(t.courier,P&&P.courier))+
    kpi('שינוי בקרן',t.kerenDelta,'<span>מ-'+fmt(t.kerenStart)+' ל-'+fmt(t.kerenEnd)+' ₪</span>',t.kerenDelta<0?'bad':'good')+
    kpiRaw('יחס הלוואות / קרן שנגבתה',(t.principal?Math.round(100*t.loans/t.principal)+'%':'—'),'<span>'+(t.principal?(t.loans>t.principal?'יצא יותר כסף בהלוואות ממה שחזר בקרן':'חזר בקרן יותר ממה שיצא בהלוואות'):'אין גביית קרן בתקופה')+'</span>')+
    '</div>'+
    (M.days.length>=3?'<div class="note info">'+anInsight(M,P)+'</div>':'')+
    '</div>';
  /* 2. trend charts */
  const dayPts=M.days.map(d=>({l:d.date.slice(8,10)+'.'+d.date.slice(5,7),v:r2(d.interest+d.principal)}));
  const kerPts=M.days.map(d=>({l:d.date.slice(8,10)+'.'+d.date.slice(5,7),v:d.final}));
  h+='<div class="panel"><h2>מגמות</h2>'+
    '<h3>גבייה יומית (ריבית + קרן)</h3>'+(dayPts.length>40?chartLine(dayPts,{title:'גבייה יומית'}):chartBars(dayPts,{title:'גבייה יומית',labels:dayPts.length<=10,rot:dayPts.length>8}))+
    '<h3>סה״כ סופי (הקרן בסוף כל יום)</h3>'+chartLine(kerPts,{title:'קרן'})+
    '<h3>ריבית לפי יום בשבוע (ממוצע ליום)</h3>'+chartBars(anWeekday(M.days),{title:'ריבית לפי יום בשבוע',labels:true})+
    '</div>';
  /* 3. months */
  if(M.months.length>1){
    h+='<div class="panel"><h2>חודש מול חודש</h2>'+chartBars(M.months.map(m=>({l:monthLabel(m.k).replace(/ \d{4}$/,''),v:m.interest,sub:'ריבית'})),{title:'ריבית לפי חודש',labels:true})+
      tbl(['חודש','ימי גבייה','ריבית','קרן','הלוואות','משלוחים','קרן בסוף החודש'],M.months.slice().reverse().map(m=>'<tr>'+td(esc(monthLabel(m.k)))+td(m.days.size)+tdn(m.interest)+tdn(m.principal)+tdn(m.loans)+tdn(m.courier)+tdn(m.final)+'</tr>'))+'</div>';
  }
  /* 4. clients */
  const cl=Array.from(M.clients.values());
  const topI=cl.filter(c=>c.interest).sort((x,y)=>y.interest-x.interest).slice(0,10);
  const topP=cl.filter(c=>c.principal).sort((x,y)=>y.principal-x.principal).slice(0,10);
  const topL=cl.filter(c=>c.loans).sort((x,y)=>y.loans-x.loans).slice(0,10);
  const topN=cl.filter(c=>c.pays).sort((x,y)=>y.pays-x.pays).slice(0,10);
  const conc=topI.length&&t.interest?Math.round(100*sum(topI.slice(0,5).map(c=>c.interest))/t.interest):0;
  h+='<div class="panel"><div class="row sp"><h2>לקוחות</h2><span class="small muted">'+cl.length+' לקוחות בתקופה</span></div>'+
    (conc?'<div class="note '+(conc>=60?'warn':'info')+'">5 הלקוחות הגדולים מביאים '+conc+'% מהריבית בתקופה'+(conc>=60?' – ריכוז גבוה: אם אחד מהם מפסיק לשלם, זה מורגש מיד':'')+'.</div>':'')+
    '<div class="grid2 top">'+
    '<div><h3>הכי הרבה ריבית</h3>'+tbl(['#','לקוח','ריבית','תשלומים'],topI.map((c,i)=>'<tr>'+td(i+1)+td(clientBtn(c.n))+tdn(c.interest)+td(c.pays)+'</tr>'))+'</div>'+
    '<div><h3>הכי הרבה קרן</h3>'+tbl(['#','לקוח','קרן'],topP.map((c,i)=>'<tr>'+td(i+1)+td(clientBtn(c.n))+tdn(c.principal)+'</tr>'))+'</div>'+
    '<div><h3>הכי הרבה הלוואות</h3>'+tbl(['#','לקוח','הלוואות','מספר'],topL.map((c,i)=>'<tr>'+td(i+1)+td(clientBtn(c.n))+tdn(c.loans)+td(c.loanN)+'</tr>'))+'</div>'+
    '<div><h3>הכי קבועים (מספר תשלומים)</h3>'+tbl(['#','לקוח','תשלומים','סה״כ'],topN.map((c,i)=>'<tr>'+td(i+1)+td(clientBtn(c.n))+td(c.pays)+tdn(r2(c.interest+c.principal))+'</tr>'))+'</div>'+
    '</div></div>';
  /* 5. stale clients */
  if(ST){
    h+='<div class="panel" id="an-stale"><div class="row sp"><h2>התראות: לא שילמו</h2><span class="small muted">לפי הפיצול של '+esc(isoLabel(ST.date))+' · '+ST.n+' חייבים</span></div>'+
      '<div class="row"><span class="small muted">מציג מי שלא שילם כבר</span>'+[7,14,30,60].map(d=>'<button class="rchip" type="button" data-stale="'+d+'" aria-pressed="'+(AN.stale===d)+'">'+d+' יום</button>').join('')+'</div>'+
      (ST.rows.length?'<div class="note warn">'+ST.rows.length+' לקוחות עם יתרה כוללת של '+fmt(ST.total)+' ₪ לא שילמו '+AN.stale+' יום או יותר (לפי החשבונות השמורים).</div>':'<div class="note ok">כל הלקוחות ברשימת הפיצול שילמו בתוך '+AN.stale+' הימים האחרונים.</div>')+
      tbl(['לקוח','יתרה','גובה','תשלום אחרון','ימים','טלפון'],ST.rows.slice(0,60).map(r=>'<tr class="'+(r.since===null||r.since>=30?'miss':'unc')+'">'+td(clientBtn(r.n))+tdn(r.a)+td(esc(r.c))+td(r.last?esc(isoLabel(r.last)):'<span class="muted">אין תשלום שמור</span>')+td(r.since===null?'—':r.since)+td(r.ph?'<a class="num" href="https://wa.me/'+esc(r.ph.replace(/\D/g,'').replace(/^0/,'972'))+'" target="_blank" rel="noopener">'+esc(r.ph)+'</a>':'')+'</tr>'))+
      (ST.rows.length>60?'<p class="small muted">מוצגים 60 הראשונים.</p>':'')+'</div>';
  }
  /* 6. collectors */
  const KW=AN.coll==='coll'?K.coll:K.work;
  h+='<div class="panel" id="an-colls"><div class="row sp"><h2>גובים</h2><span class="row"><button class="rchip" type="button" data-coll="work" aria-pressed="'+(AN.coll!=='coll')+'">לפי איסוף יומי ('+K.nw+')</button><button class="rchip" type="button" data-coll="coll" aria-pressed="'+(AN.coll==='coll')+'">לפי חשבון גובים ('+K.nc+')</button></span></div>'+
    (KW.length?chartBars(KW.map(x=>({l:x.c,v:x.total,sub:x.n+' חייבים'})),{title:'סה״כ לגובה',labels:true}):'')+
    (AN.coll==='coll'?tbl(['גובה','ימים','חובות','סה״כ','הוצאות','נטו','ממוצע ליום'],KW.map(x=>'<tr>'+td(esc(x.c))+td(x.days)+td(x.n)+tdn(x.total)+tdn(x.exp)+tdn(x.net)+tdn(x.days?r2(x.net/x.days):0)+'</tr>')):
      tbl(['גובה','ימים','חייבים','סה״כ','נאסף','אחוז נאסף','לא נאסף','לעבור','הוצאות','נטו'],KW.map(x=>'<tr>'+td(esc(x.c))+td(x.days)+td(x.n)+tdn(x.total)+tdn(x.gotA)+td('<span class="stl '+(x.rate>=70?'got':(x.rate>=40?'pass':'hard'))+'">'+x.rate+'%</span>')+td(x.ng||0)+td(x.pass)+tdn(x.exp)+tdn(x.net)+'</tr>')))+
    '<p class="small muted" style="margin:0">״נאסף״ נספר רק אם סימנת אותו ברשימת האיסוף לפני השמירה. אם לא מסמנים, האחוז לא אומר כלום.</p></div>';
  /* 7. client card (שמות: לקוחות מחשבונות הבוקר ומהפיצול האחרון; כרטיס הלקוח המלא נמצא במסך ״לקוחות״) */
  const names=new Map(); anMorning('0000-01-01','9999-12-31').clients.forEach(c=>names.set(c.k,c.n)); const lsp=anLatestSplit(); if(lsp)(lsp.records||[]).forEach(r=>{const k=normName(r.n);if(k&&!names.has(k))names.set(k,String(r.n).trim());});
  h+='<div class="panel" id="an-client"><h2>כרטיס לקוח</h2><div class="row"><input class="in" id="an-q" type="search" list="an-names" placeholder="שם הלקוח" autocomplete="off" value="'+esc(AN.q)+'" style="max-width:360px"><datalist id="an-names">'+Array.from(names.values()).map(n=>'<option value="'+esc(n)+'">').join('')+'</datalist></div><div id="an-card">'+(AN.client?clientCard(AN.client):'<p class="small muted" style="margin:0">הקלד שם, או לחץ על שם לקוח בטבלאות למעלה.</p>')+'</div></div>';
  return {head,html:h};
}
function anWeekday(days){
  const acc=WD.map((l,i)=>({l,v:0,n:0}));
  days.forEach(d=>{const i=new Date(d.date+'T12:00:00').getDay();acc[i].v=r2(acc[i].v+d.interest);acc[i].n++;});
  return acc.filter(x=>x.n).map(x=>({l:x.l,v:r2(x.v/x.n),sub:x.n+' ימים'}));
}
function anInsight(M,P){
  const t=M.tot, d=M.days, half=Math.floor(d.length/2);
  const a=sum(d.slice(0,half).map(x=>x.interest))/Math.max(1,half), b=sum(d.slice(half).map(x=>x.interest))/Math.max(1,d.length-half);
  const trend=a?Math.round(100*(b-a)/a):0;
  const best=d.slice().sort((x,y)=>(y.interest+y.principal)-(x.interest+x.principal))[0];
  const wd=anWeekday(d).sort((x,y)=>y.v-x.v);
  const parts=[];
  parts.push(trend>8?'הריבית במחצית השנייה של התקופה גבוהה ב-'+trend+'% מהמחצית הראשונה – מגמת עלייה.':trend<-8?'הריבית במחצית השנייה של התקופה נמוכה ב-'+Math.abs(trend)+'% מהמחצית הראשונה – שים לב לירידה.':'הריבית יציבה לאורך התקופה.');
  if(best) parts.push('היום החזק ביותר: '+isoLabel(best.date)+' ('+fmt(r2(best.interest+best.principal))+' ₪).');
  if(wd.length>=2) parts.push('יום '+wd[0].l+' הוא יום הגבייה החזק ('+fmt(wd[0].v)+' ₪ ריבית בממוצע), ויום '+wd[wd.length-1].l+' החלש ('+fmt(wd[wd.length-1].v)+' ₪).');
  if(t.kerenDelta&&d.length>=2){const perDay=t.kerenDelta/Math.max(1,daysBetween(t.firstDate,t.lastDate)||1);parts.push('בקצב הזה הקרן '+(perDay>=0?'תגדל':'תקטן')+' בכ-'+fmt(r2(Math.abs(perDay)*30))+' ₪ ב-30 הימים הבאים.');}
  return parts.join(' ');
}
/* clientCard — app.html 5099. ccRel/ccSections (הלוואות וחוזים של הלקוח) לא הועתקו: הם במסך ״לקוחות״ של התוכנה החדשה, ויש קישור אליו */
export function clientCard(k){
  const all=anMorning('0000-01-01','9999-12-31'), c=all.clients.get(k);
  const sp=anLatestSplit(); const spRows=sp?(sp.records||[]).filter(r=>r&&normName(r.n)===k):[];
  const bal=sum(spRows.map(r=>num(r.a))), coll=spRows.map(r=>String(r.c||'').trim()).filter(Boolean)[0]||'';
  let ph=spRows.map(r=>cleanPh(r.ph)).filter(Boolean)[0]||'';
  if(!c&&!spRows.length) return '<div class="empty small">לא נמצא לקוח בשם הזה בחשבונות. <a href="#/clients">חיפוש במסך לקוחות</a></div>';
  const name=c?c.n:spRows[0].n, ev=(c?c.events:[]).slice().sort((x,y)=>y.date.localeCompare(x.date));
  const t=todayISO(), since=c&&c.last?daysBetween(c.last,t):null;
  const months=new Map(); ev.forEach(e=>{if(e.t==='הלוואה')return;const m=e.date.slice(0,7);months.set(m,r2((months.get(m)||0)+e.a));});
  const mPts=Array.from(months.entries()).sort((x,y)=>x[0].localeCompare(y[0])).slice(-12).map(x=>({l:monthLabel(x[0]).replace(/ \d{4}$/,''),v:x[1]}));
  let h='<div class="row sp"><h3 style="font-size:18px">'+esc(name)+'</h3><span class="row">'+(coll?'<span class="chip">גובה: '+esc(coll)+'</span>':'')+(ph?'<a class="chip num" href="https://wa.me/'+esc(ph.replace(/\D/g,'').replace(/^0/,'972'))+'" target="_blank" rel="noopener">'+esc(ph)+'</a>':'')+'<a class="chip" href="#/client/'+encodeURIComponent(k)+'">כרטיס לקוח מלא</a></span></div>';
  h+='<div class="kpis">'+
    kpi('יתרה בפיצול האחרון',bal,sp?'<span>'+esc(isoLabel(sp.date))+(spRows.length?'':' · לא ברשימה')+'</span>':'')+
    kpi('ריבית ששילם (סה״כ)',c?c.interest:0,'<span>'+(c?c.pays:0)+' תשלומים</span>')+
    kpi('קרן ששילם (סה״כ)',c?c.principal:0,'')+
    kpi('הלוואות שקיבל',c?c.loans:0,'<span>'+(c?c.loanN:0)+' הלוואות'+(c&&c.lastLoan?' · אחרונה '+esc(isoLabel(c.lastLoan)):'')+'</span>')+
    '</div>';
  h+='<div class="note '+(since===null?'warn':(since>=14?'warn':'ok'))+'">'+(c&&c.last?'תשלום אחרון: '+isoLabel(c.last)+' (לפני '+since+' ימים)':'אין תשלום שמור ללקוח הזה')+(c&&c.loans&&c.principal?' · החזיר '+Math.round(100*c.principal/c.loans)+'% מהקרן שלקח (לפי החשבונות השמורים)':'')+'</div>';
  if(mPts.length>=2) h+='<h3>תשלומים לפי חודש (ריבית + קרן)</h3>'+chartBars(mPts,{title:'תשלומי הלקוח לפי חודש',labels:true});
  const evRow=e=>'<tr>'+td(esc(isoLabel(e.date)))+td('<span class="chip">'+esc(e.t)+'</span>')+tdn(e.a)+'</tr>';
  h+='<h3>היסטוריה ('+ev.length+')</h3>'+tbl(['תאריך','סוג','סכום'],ev.slice(0,12).map(evRow))+(ev.length>12?'<details><summary>עוד '+(ev.length-12)+' שורות</summary>'+tbl(['תאריך','סוג','סכום'],ev.slice(12,200).map(evRow))+'</details>':'');
  return h;
}
/* the period report as a printed document (for PDF to WhatsApp) */
export function anReportHTML(){
  const [from,to]=anRange(); const M=anMorning(from,to), t=M.tot, K=anCollectors(from,to), ST=anStale();
  const row=(l,v,cls)=>'<tr class="'+(cls||'')+'"><td>'+esc(l)+'</td><td class="a">'+money(v)+'</td></tr>';
  let h='<header class="rhead">'+RSEAL+'<div class="rht"><span class="rbrand">יומן חשבון בוקר</span><h2 class="rtitle">דוח תקופה</h2><div class="rsub">'+esc(rangeLabel(from,to))+' · '+M.ms.length+' חשבונות בוקר · '+M.days.length+' ימי גבייה</div></div></header>';
  h+='<section class="rs"><h3 class="rh"><span class="rn">1</span>סיכום</h3><table class="rt slate"><thead><tr><th>פריט</th><th class="a">סכום</th></tr></thead><tbody>'+
    row('ריבית שנגבתה',t.interest)+row('חלק רובי ('+rpPart(t,'r')+')',t.robi)+row('חלק הקו ('+rpPart(t,'l')+')',t.line)+row('ניכוי משלוחים',-t.courier)+row('יתרת הקו לאחר משלוחים',r2(t.line-t.courier),'hl')+
    row('קרן שנגבתה',t.principal)+row('הלוואות שניתנו ('+t.loanCount+')',-t.loans)+row('קרן בתחילת התקופה',t.kerenStart)+row('קרן בסוף התקופה',t.kerenEnd,'hl')+
    '<tr class="final'+(t.kerenDelta<0?' negbg':'')+'"><td>שינוי בקרן</td><td class="a">'+money(t.kerenDelta)+'</td></tr></tbody></table></section>';
  h+='<section class="rs"><h3 class="rh"><span class="rn">2</span>לפי יום</h3><table class="rt"><thead><tr><th>תאריך</th><th class="a">ריבית</th><th class="a">קרן</th><th class="a">הלוואות</th><th class="a">סה״כ סופי</th></tr></thead><tbody>'+
    M.days.map(d=>'<tr><td>'+esc(weekday(d.date))+' '+esc(isoLabel(d.date))+'</td><td class="a">'+money(d.interest)+'</td><td class="a">'+money(d.principal)+'</td><td class="a">'+money(d.loans)+'</td><td class="a">'+money(d.final)+'</td></tr>').join('')+
    '<tr class="tot"><td>סה״כ</td><td class="a">'+money(t.interest)+'</td><td class="a">'+money(t.principal)+'</td><td class="a">'+money(t.loans)+'</td><td></td></tr></tbody></table></section>';
  const cl=Array.from(M.clients.values()), topI=cl.filter(c=>c.interest).sort((x,y)=>y.interest-x.interest).slice(0,15);
  h+='<section class="rs"><h3 class="rh"><span class="rn">3</span>לקוחות בולטים (ריבית)</h3><table class="rt brown"><thead><tr><th class="ix">#</th><th>לקוח</th><th class="a">ריבית</th><th class="a">קרן</th><th class="a">הלוואות</th></tr></thead><tbody>'+
    (topI.length?topI.map((c,i)=>'<tr><td class="ix">'+(i+1)+'</td><td>'+esc(c.n)+'</td><td class="a">'+money(c.interest)+'</td><td class="a">'+money(c.principal)+'</td><td class="a">'+money(c.loans)+'</td></tr>').join(''):'<tr class="none"><td colspan="5">אין</td></tr>')+'</tbody></table></section>';
  if(K.work.length) h+='<section class="rs"><h3 class="rh"><span class="rn">4</span>גובים (איסוף יומי)</h3><table class="rt slate"><thead><tr><th>גובה</th><th class="a">ימים</th><th class="a">חייבים</th><th class="a">סה״כ</th><th class="a">נאסף</th><th class="a">הוצאות</th></tr></thead><tbody>'+
    K.work.map(x=>'<tr><td>'+esc(x.c)+'</td><td class="a">'+x.days+'</td><td class="a">'+x.n+'</td><td class="a">'+money(x.total)+'</td><td class="a">'+money(x.gotA)+'</td><td class="a">'+money(x.exp)+'</td></tr>').join('')+'</tbody></table></section>';
  if(ST&&ST.rows.length) h+='<section class="rs"><h3 class="rh"><span class="rn">5</span>לא שילמו '+AN.stale+' יום ומעלה (פיצול '+esc(isoLabel(ST.date))+')</h3><table class="rt"><thead><tr><th>לקוח</th><th class="a">יתרה</th><th>גובה</th><th>תשלום אחרון</th></tr></thead><tbody>'+
    ST.rows.slice(0,40).map(r=>'<tr><td>'+esc(r.n)+'</td><td class="a">'+money(r.a)+'</td><td>'+esc(r.c)+'</td><td>'+(r.last?esc(isoLabel(r.last)):'—')+'</td></tr>').join('')+'<tr class="tot"><td>סה״כ</td><td class="a">'+money(ST.total)+'</td><td></td><td></td></tr></tbody></table></section>';
  h+='<p class="rnote">הדוח מבוסס על החשבונות השמורים בתוכנה בלבד. יום שלא נשמר לו חשבון בוקר לא נספר.</p>';
  return h;
}
export function anShareText(){const [from,to]=anRange();const t=anMorning(from,to).tot;return 'דוח תקופה '+rangeLabel(from,to)+'\nריבית: '+fmt(t.interest)+' ₪\nקרן: '+fmt(t.principal)+' ₪\nהלוואות: '+fmt(t.loans)+' ₪\nקרן בסוף התקופה: '+fmt(t.kerenEnd)+' ₪';}
export async function anPdf(btn,box){
  const [from,to]=anRange();
  if(!anMorning(from,to).ms.length) return box.innerHTML='<div class="note warn">אין חשבונות בוקר בתקופה</div>';
  return sharePdf(anReportHTML(),{kind:'report',date:to<'9999'?to:todayISO()},anShareText(),box,btn);
}

/* ---- תיק ההלוואות — app.html hlData/hlSum ---- */
export function hlData(){
  const t=todayISO(), w=addDays(t,7), m=t.slice(0,7);
  const out={open:[],today:[],week:[],late:[],paidM:[],n:0};
  LN.list.forEach(L=>{
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

/* ---- ייצוא ל-Excel — app.html 5850-5933 ---- */
const XL_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const xlD=iso=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||'')); return m?new Date(+m[1],+m[2]-1,+m[3]):''; };
function xlSheet(X,wb,name,head,rows,widths,money){
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
function xlLoanRows(){
  const t=todayISO(), loans=[], inst=[], flow=new Map();
  const fm=k=>{ if(!flow.has(k)) flow.set(k,{k,ea:0,ep:0,ei:0,ra:0,rp:0,ri:0}); return flow.get(k); };
  LN.list.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'he')).forEach(L=>{
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
export async function xlExport(btn,toast){
  const prev=btn?btn.textContent:''; if(btn){ btn.disabled=true; btn.textContent='מכין קובץ Excel…'; }
  try{
    await loadVendor('xlsx.full.min.js'); const X=window.XLSX; if(!X) throw new Error('xlsx');
    const [from,to]=anRange(), M=anMorning(from,to), t=M.tot, K=anCollectors(from,to), ST=anStale(), LR=xlLoanRows();
    const D=LN.list.length?hlData():null, hs=a=>a?hlSum(a):{a:0,p:0,i:0,n:0};
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
    const out=X.write(wb,{bookType:'xlsx',type:'array',cellDates:true});
    const name='דוח '+(from<'0001'?'כל החשבונות':isoLabel(from)+'-'+isoLabel(to)).replace(/[\\/:*?"<>|]/g,'.')+'.xlsx';
    const u=URL.createObjectURL(new Blob([out],{type:XL_MIME})); const a=document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),30000);
    toast('קובץ ה-Excel נשמר');
  }catch(e){ toast(/טעינת רכיב נכשלה/.test(e&&e.message||'')?'רכיב ה-Excel לא נטען. בדוק את החיבור ונסה שוב.':'יצירת קובץ ה-Excel נכשלה. נסה שוב.'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent=prev; } }
}

/* ---- עיצוב (app.html 102-110, 175-178, 202-203, 385-410) — בתוך .rpx בלבד, כדי לא להשפיע על שאר המסכים ---- */
export const AN_CSS=`
.rpx{display:flex;flex-direction:column;gap:16px}
.rpx .panel{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:14px;min-width:0}
.rpx .panel>h2,.rpx .panel>.row>h2{font-size:18px;font-weight:700;color:var(--fg)}
.rpx .panel>h2{padding-bottom:10px;border-bottom:1px solid var(--line)}
.rpx .panel h3{font-size:15px;font-weight:700}
.rpx .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}
.rpx .grid2.top{align-items:start}
.rpx .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.rpx .row.sp{justify-content:space-between}
.rpx .rchip{appearance:none;border:1px solid var(--line);background:var(--bg);color:var(--muted);border-radius:16px;padding:5px 12px;font-size:13px;font-weight:600;cursor:pointer;min-height:36px}
.rpx .rchip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}
.rpx .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0}
.rpx .kpi{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;min-width:0;cursor:default;box-shadow:none}
.rpx .kpi.good{border-color:var(--ok-fg)}
.rpx .kpi.bad{border-color:var(--neg)}
.rpx .kpi .kl{font-size:12px;color:var(--muted);font-weight:600}
.rpx .kpi .kv{font-size:20px;font-weight:700;line-height:1.2}
.rpx .kpi .ks{font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:1px}
.rpx .kpi .up{color:var(--ok-fg);font-weight:600}
.rpx .kpi .dn{color:var(--neg);font-weight:600}
.rpx .kpis.dash{grid-template-columns:repeat(auto-fit,minmax(min(100%,168px),1fr))}
.rpx .kpis.dash .kpi{background:var(--surface);box-shadow:var(--shadow);padding:12px 14px}
.rpx .kpis.dash .kpi .kv{font-size:22px}
.rpx svg.chart{width:100%;max-width:720px;height:auto;display:block;margin:4px auto 10px;direction:ltr}
.rpx svg.chart .bar:hover rect,.rpx svg.chart .pt:hover circle:last-child{opacity:1;filter:brightness(1.15)}
.rpx .lnk{appearance:none;border:0;background:none;padding:0;color:var(--accent);font-weight:600;cursor:pointer;text-align:start;text-decoration:underline;text-underline-offset:3px;min-height:28px}
.rpx table.ed{width:100%;border-collapse:collapse;font-size:14px}
.rpx table.ed th{background:var(--surface2);font-weight:700;text-align:start;padding:8px 8px;font-size:12px;color:var(--muted);white-space:nowrap;border-bottom:1px solid var(--line)}
.rpx table.ed td{padding:6px 8px;border-top:1px solid var(--line);vertical-align:middle;white-space:nowrap}
.rpx table.ed td.a{text-align:left;direction:ltr}
.rpx tr.unc td{background:var(--warn-bg)}
.rpx tr.miss td{background:var(--err-bg)}
.rpx .empty.small{padding:14px;font-size:13px}
.rpx .empty b{display:block;color:var(--fg);font-size:18px;margin-bottom:4px}
.rpx .stl{display:inline-block;font-weight:700;font-size:12px;border-radius:10px;padding:1px 10px;white-space:nowrap}
.rpx .stl.pass{background:var(--warn-bg);color:var(--warn-fg)}
.rpx .stl.got{background:var(--ok-bg);color:var(--ok-fg)}
.rpx .stl.hard{background:var(--err-bg);color:var(--err-fg)}
.rpx .chip{font-size:12px;font-weight:600;background:var(--surface2);border-radius:10px;padding:1px 9px;white-space:nowrap;text-decoration:none;color:inherit;border:0;min-height:0}
.rpx .note{margin:0}
.rpx .sharebox:empty{display:none}
.rpx .sharebox{display:flex;flex-direction:column;gap:8px}
`;
