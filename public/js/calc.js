// נוסחאות החישוב — הועתקו כמו שהן מהתוכנה המקורית (app.html), בלי שום שינוי בלוגיקה.
// כל שינוי בנוסחה כספית או בכלל חלוקה דורש אישור מראש של בעל התוכנה.
// מקור: r2/sum/num שורות 1843-1863, calcMorning 1991-2002, calcCollectors 2008-2028, prevMorning 1938-1950, mRp 9844.
export const r2=x=>Math.round((x+Number.EPSILON)*100)/100;
export const sum=a=>r2(a.reduce((t,x)=>t+(+x||0),0));
export function num(v){
  if(typeof v==='number') return isFinite(v)?v:0;
  let s=String(v==null?'':v).replace(/[₪\s‎‏ ]/g,'').replace(/[−–]/g,'-').replace(/\(/g,'-').replace(/\)/g,'');
  const dec=ch=>{const k=s.lastIndexOf(ch);return s.slice(0,k).replace(/[.,]/g,'')+'.'+s.slice(k+1).replace(/[.,]/g,'');};
  const lc=s.lastIndexOf(','), ld=s.lastIndexOf('.');
  if(lc>=0&&ld>=0) s=dec(lc>ld?',':'.');
  else if(lc>=0) s=/,\d{1,2}$/.test(s)?dec(','):s.replace(/,/g,'');
  else if(ld>=0&&s.indexOf('.')!==ld) s=/\.\d{1,2}$/.test(s)?dec('.'):s.replace(/\./g,'');
  const n=parseFloat(s); return isFinite(n)?n:0;
}
export const normName=s=>String(s==null?'':s).replace(/[‎‏"'׳״]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
export function mRp(a){ const v=a&&a.rp; if(v===undefined||v===null||v==='') return 25; const n=+v; return isFinite(n)?Math.min(100,Math.max(0,Math.round(n*100)/100)):25; }
/* ---- calcMorning (app.html 1991-2002), verbatim ---- */
export function calcMorning(a){
  const rows=a.rows||[];
  const iRows=rows.filter(r=>r.i), pRows=rows.filter(r=>r.p);
  const interest=sum(iRows.map(r=>r.i)), principal=sum(pRows.map(r=>r.p));
  const rp=mRp(a), robi=rp===25?r2(interest*0.25):r2(interest*rp/100), line=r2(interest-robi);
  const courier=r2(+a.courier||0), keren=r2(+a.keren||0);
  const lineRem=r2(line-courier);
  const kerenTotal=r2(principal+lineRem+keren);
  const loans=a.loans||[]; const loansTotal=sum(loans.map(l=>l.a));
  const final=r2(kerenTotal-loansTotal);
  return {iRows,pRows,interest,principal,robi,line,courier,keren,lineRem,kerenTotal,loans,loansTotal,final,rp,lp:r2(100-rp)};
}
/* ---- calcCollectors (app.html 2008-2028), verbatim ---- */
export const NOC='ללא גובה';
export function calcCollectors(entries){
  const groups=new Map();
  for(const e of entries){
    const c=(e.c||'').trim()||NOC;
    if(!groups.has(c)) groups.set(c,{c,debts:[],exps:[]});
    (e.k==='e'?groups.get(c).exps:groups.get(c).debts).push({n:e.n||'(ללא שם)',a:num(e.a)});
  }
  const list=[...groups.values()].sort((x,y)=>(x.c===NOC)-(y.c===NOC)||x.c.localeCompare(y.c,'he'));
  for(const g of list){
    g.debts.sort((x,y)=>x.n.localeCompare(y.n,'he'));
    g.exps.sort((x,y)=>x.n.localeCompare(y.n,'he'));
    g.debtTotal=sum(g.debts.map(d=>d.a)); g.expTotal=sum(g.exps.map(d=>d.a)); g.net=r2(g.debtTotal-g.expTotal);
  }
  const byName=new Map();
  for(const g of list) for(const d of g.debts){
    const k=normName(d.n); if(!k) continue;
    if(!byName.has(k)) byName.set(k,{n:d.n,cs:new Set()}); byName.get(k).cs.add(g.c);
  }
  const dups=[...byName.values()].filter(x=>x.cs.size>1).map(x=>({n:x.n,cs:[...x.cs]}));
  return {groups:list,totalDebts:sum(list.map(g=>g.debtTotal)),totalExp:sum(list.map(g=>g.expTotal)),totalNet:sum(list.map(g=>g.net)),dups,noCollector:groups.has(NOC)};
}
export function prevMorning(list,date,excludeId){
  const cur=excludeId?list.find(x=>x&&x.id===excludeId):null;
  const curT=cur?(cur.createdAt||0):Infinity;
  let best=null;
  for(const a of list){
    if(!a||a.kind!=='morning'||a.id===excludeId||!a.date) continue;
    if(a.date>date) continue;
    if(a.date===date&&!((a.createdAt||0)<curT)) continue;
    if(!best||a.date>best.date||(a.date===best.date&&(a.createdAt||0)>(best.createdAt||0))) best=a;
  }
  return best?{id:best.id,date:best.date,final:r2(calcMorning(best).final)}:null;
}

// ---- פיצול ואיסוף יום — הועתק כמו שהוא מהתוכנה המקורית ----
// מקור: שורה 2498
export function normTime(s){
  const t=String(s==null?'':s).replace(/[^\d:.\s]/g,' ').trim(); let m,h,mi;
  if((m=/(\d{1,2})\s*[:.]\s*(\d{2})/.exec(t))){h=+m[1];mi=+m[2];}
  else if((m=/^(\d{1,2})(\d{2})$/.exec(t))){h=+m[1];mi=+m[2];}
  else if((m=/(\d{1,2})/.exec(t))){h=+m[1];mi=0;}
  else return '';
  if(h>23||mi>59) return '';
  return String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0');
}
// מקור: שורה 2507
export const timeMin=t=>{const m=/^(\d{2}):(\d{2})$/.exec(normTime(t));return m?(+m[1])*60+(+m[2]):Infinity;};
// מקור: שורה 2509
export const ST_PASS='לעבור', ST_GOT='נאסף', ST_NOT='לא נאסף', ST_NA='לא ענו';
// מקור: שורה 2510
export function normStatus(s){
  const t=String(s==null?'':s);
  if(/לא\s*ענ/.test(t)) return ST_NA;
  if(/לא\s*נאס[פף]/.test(t)) return ST_NOT;
  if(/נאס[פף]/.test(t)) return ST_GOT;
  if(/לעבור/.test(t)) return ST_PASS;
  return '';
}
// מקור: שורה 4319
export function waPhone(v){
  let d=String(v==null?'':v).split(/[\/,;|]/)[0].replace(/\D/g,''); if(!d) return '';
  if(d.startsWith('00')) d=d.slice(2);
  if(d.startsWith('972')) return d.length>=11&&d.length<=12?d:'';       // Israeli, international form
  if(d[0]==='0') return d.length>=9&&d.length<=10?'972'+d.slice(1):'';   // Israeli, local form (one digit too many/few = invalid)
  if(d.length===9&&d[0]==='5') return '972'+d;
  return d.length>=10&&d.length<=15?d:'';                                // foreign number
}
// מקור: שורה 2533
export function phShow(v){
  const w=waPhone(v); if(!w) return '';
  if(w.startsWith('972')){ const l='0'+w.slice(3); return l.length===10?l.slice(0,3)+'-'+l.slice(3):(l.length===9?l.slice(0,2)+'-'+l.slice(2):l); }
  return '+'+w;
}
// מקור: שורה 2525
export function cleanPh(v){
  const s=String(v==null?'':v).replace(/[\u200e\u200f\u202a-\u202e]/g,'').trim();
  if(!s) return '';
  if(s.length<=40&&/^[\d\s\-+()\/,;|.]+$/.test(s)) return s;
  const m=/(?:\+?972[\s-]?|0)(?:5\d|[2-9])[\s-]?\d{3}[\s-]?\d{4}/.exec(s);
  if(m) return phShow(m[0])||m[0].trim();
  const d=/\+?\d[\d\s-]{7,16}\d/.exec(s); return d?d[0].trim():'';
}
// מקור: שורה 2603
export const normHard=v=>v==='קשה'||v==='לא קשה'?v:'';
// מקור: שורה 2624
export const stripInv=v=>String(v==null?'':v).replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g,'').replace(/\s+/g,' ').trim();
// מקור: שורה 2625
export const cleanColl=v=>{const t=stripInv(v); return collKey(t)==='טאייה'?'טאייה':t;};
// מקור: שורה 2643
export function calcWork(entries){
  const rows=entries.map((e,i)=>{const s=normStatus(e.s);return {n:e.n||'(ללא שם)',a:num(e.a),t:s?'':normTime(e.t),s,p:cleanPh(e.p),c:cleanColl(e.c),h:normHard(e.h),pp:e.pp||'',ga:(s===ST_GOT&&e.ga!==undefined&&e.ga!==null&&e.ga!=='')?num(e.ga):null,i};});
  const rank=r=>r.s===ST_NA?-1:(r.s===ST_GOT?4:(r.s===ST_NOT?3:(r.s===ST_PASS?1:(r.t?0:2))));
  rows.sort((x,y)=>(rank(x)-rank(y))||(rank(x)===0?timeMin(x.t)-timeMin(y.t):0)||(x.i-y.i));
  const noAns=rows.filter(r=>r.s===ST_NA), timed=rows.filter(r=>rank(r)===0), pass=rows.filter(r=>r.s===ST_PASS), noTime=rows.filter(r=>rank(r)===2), notGot=rows.filter(r=>r.s===ST_NOT), got=rows.filter(r=>r.s===ST_GOT);
  const total=sum(rows.map(r=>r.a)), gotTotal=sum(got.map(r=>r.ga!==null?r.ga:r.a)), notTotal=sum(notGot.map(r=>r.a));
  return {rows,noAns,timed,pass,noTime,notGot,got,total,gotTotal,notTotal,left:r2(total-gotTotal),count:rows.length};
}
// מקור: שורה 2653
export const wExpList=acc=>(acc.expenses||[]).filter(x=>x&&(x.n||x.a)).map(x=>({n:String(x.n||'').trim()||'(ללא שם)',a:num(x.a),c:cleanColl(x.c)}));
// מקור: שורה 2654
export function workGroups(entries,expenses){
  const es=(entries||[]).filter(e=>e&&(e.n||e.a)), xs=expenses||[], cn=v=>cleanColl(v.c), kn=v=>collKey(cn(v));
  /* אותו גובה נספר פעם אחת גם אם נכתב עם תו נסתר או הבדל קטן באיות */
  const disp=new Map();
  es.concat(xs).forEach(v=>{ const k=kn(v); if(k&&!disp.has(k)) disp.set(k,cn(v)); });
  if(!es.some(e=>kn(e))) return null;
  const keys=Array.from(disp.keys()).sort((x,y)=>disp.get(x).localeCompare(disp.get(y),'he'));
  const mk=(name,list,xl)=>{ const calc=calcWork(list), expTotal=sum(xl.map(x=>x.a)); return {name,calc,exp:xl,expTotal,net:r2(calc.total-expTotal)}; };
  const g=keys.map(k=>mk(disp.get(k),es.filter(e=>kn(e)===k),xs.filter(x=>kn(x)===k)));
  const rest=es.filter(e=>!kn(e)), restX=xs.filter(x=>!kn(x));
  if(rest.length||restX.length) g.push(mk(NOC_SP,rest,restX));
  return g;
}
// מקור: שורה 3248
export const CHANGE='לשנות', NOC_SP='ללא גובה';
// מקור: שורה 3265
export const collKey=v=>{const k=normName(v);return k==='טאיה'?'טאייה':k;};
// מקור: שורה 3307
export const isSagi=n=>normName(n)==='שגיא ברי';
// מקור: שורה 3374
export const cmpRec=(x,y)=>String(x.n).localeCompare(String(y.n),'he')||String(x.note||'').localeCompare(String(y.note||''),'he');
// מקור: שורה 3375
export function calcSplit(recs){
  const real=recs.filter(r=>num(r.a)||r.n);
  const active=real.filter(r=>!r.side), sides=real.filter(r=>r.side);
  const groups=new Map();
  for(const r of active){const c=String(r.c||'').trim();const key=c===CHANGE?CHANGE:(c||NOC_SP);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  const ord=k=>k===CHANGE?2:(k===NOC_SP?1:0);
  const names=Array.from(groups.keys()).sort((x,y)=>ord(x)-ord(y)||x.localeCompare(y,'he'));
  const blocks=names.map(c=>{
    const rows=groups.get(c).slice().sort(cmpRec);
    const hasHard=c==='סמיילי'&&rows.some(r=>r.h);
    let sections;
    if(hasHard) sections=[{t:'קשה',cls:'hard',rows:rows.filter(r=>r.h==='קשה')},{t:'לא קשה',cls:'easy',rows:rows.filter(r=>r.h==='לא קשה')},{t:'ללא סימון',cls:'',rows:rows.filter(r=>!r.h)}].filter(x=>x.rows.length);
    else sections=[{t:'',cls:'',rows}];
    sections.forEach(x=>{x.total=sum(x.rows.map(r=>num(r.a)));});
    return {c,sections,total:sum(rows.map(r=>num(r.a))),count:rows.length,special:c===CHANGE||c===NOC_SP};
  });
  const grand=sum(blocks.filter(b=>!b.special).map(b=>b.total));
  const specialTotal=sum(blocks.filter(b=>b.special).map(b=>b.total));
  const sideRows=sides.slice().sort(cmpRec), sideTotal=sum(sideRows.map(r=>num(r.a)));
  const byName=new Map();
  for(const r of active){
    const c=String(r.c||'').trim(); if(!c||c===CHANGE||r.note||r.pg||isSagi(r.n)) continue;
    const k=normName(r.n); if(!k) continue;
    if(!byName.has(k)) byName.set(k,{n:r.n,cs:new Set()}); byName.get(k).cs.add(c);
  }
  const dups=Array.from(byName.values()).filter(x=>x.cs.size>1).map(x=>({n:x.n,cs:Array.from(x.cs)}));
  return {blocks,sides:sideRows,sideTotal,grand,specialTotal,all:r2(grand+sideTotal+specialTotal),dups};
}

// ---- הלוואות (לוח סילוקין) — הועתק כמו שהוא מהתוכנה המקורית ----
// מקור: שורה 1870
export function todayISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// מקור: שורה 6513
export const lnR2=n=>Math.round(n*100)/100;
// מקור: שורה 6517
export const lnIso=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?String(s):todayISO();
// מקור: שורה 6519
export function lnAddPeriod(iso,type,k){
  const [y,m,d]=lnIso(iso).split('-').map(Number);
  let dt;
  if(type==='week'){dt=new Date(y,m-1,d+7*k)}
  else{const last=new Date(y,m-1+k+1,0).getDate();dt=new Date(y,m-1+k,Math.min(d,last))}
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}
// מקור: שורה 6527
export function lnSchedule(L){
  if(L.mode==='pay')return lnSchedulePay(L);
  const P=+L.amount, r=(+L.rate)/100, n=Math.round(+L.n);
  if(!(P>0)||!(n>=1)||r<0) return null;
  const pay=r===0?lnR2(P/n):lnR2(P*r/(1-Math.pow(1+r,-n)));
  const rows=[];let bal=P;
  for(let i=1;i<=n;i++){
    const interest=lnR2(bal*r);
    let principal=lnR2(pay-interest), payment=pay;
    if(i===n){principal=lnR2(bal);payment=lnR2(principal+interest)}
    const close=lnR2(bal-principal);
    rows.push({i,date:lnAddPeriod(L.date,L.type,i),open:lnR2(bal),payment,interest,principal,close:Math.max(0,close)});
    bal=close;
  }
  const tot=rows.reduce((a,x)=>({pay:a.pay+x.payment,int:a.int+x.interest}),{pay:0,int:0});
  return {pay,rows,totalPay:lnR2(tot.pay),totalInt:lnR2(tot.int)};
}
// מקור: שורה 6545
export function lnSchedulePay(L){
  const P=+L.amount, r=(+L.rate)/100, pay=lnR2(+L.payAmt);
  if(!(P>0)||!(pay>0)||r<0) return null;
  if(pay<=lnR2(P*r)) return null;
  const rows=[];let bal=lnR2(P);
  for(let i=1;bal>0.004&&i<=2000;i++){
    const interest=lnR2(bal*r);
    let principal=lnR2(pay-interest), payment=pay;
    if(lnR2(bal+interest)<=pay){principal=bal;payment=lnR2(bal+interest)}
    const close=lnR2(bal-principal);
    rows.push({i,date:lnAddPeriod(L.date,L.type,i),open:bal,payment,interest,principal,close:Math.max(0,close)});
    bal=close;
  }
  if(bal>0.004) return null;
  const tot=rows.reduce((a,x)=>({pay:a.pay+x.payment,int:a.int+x.interest}),{pay:0,int:0});
  return {pay,rows,totalPay:lnR2(tot.pay),totalInt:lnR2(tot.int)};
}
// מקור: שורה 6714
export function lnPart(L,i){
  const list=(L.part&&Array.isArray(L.part[i]))?L.part[i]:[];
  return {list,a:lnR2(list.reduce((s,x)=>s+(+x.a||0),0)),p:lnR2(list.reduce((s,x)=>s+(+x.p||0),0)),ii:lnR2(list.reduce((s,x)=>s+(+x.ii||0),0))};
}
// מקור: שורה 6719
export function lnPartTot(L,s){
  const paid=L.paid||{}; let a=0,p=0,ii=0,n=0;
  s.rows.forEach(x=>{ if(paid[x.i]) return; const q=lnPart(L,x.i); if(q.list.length){ a+=q.a; p+=q.p; ii+=q.ii; n++; } });
  return {a:lnR2(a),p:lnR2(p),ii:lnR2(ii),n};
}
// מקור: שורה 6631
export function lnStatus(L){
  const s=lnSchedule(L);if(!s)return {cls:'',txt:'',s,late:0,paidN:0};
  const paid=L.paid||{}, paidN=s.rows.filter(x=>paid[x.i]).length, t=todayISO();
  const late=s.rows.filter(x=>!paid[x.i]&&x.date<t).length;
  if(paidN>=s.rows.length)return {cls:'ok',txt:'סולקה',s,late,paidN};
  if(late)return {cls:'err',txt:late+' בפיגור',s,late,paidN};
  return {cls:'act',txt:'פעילה',s,late,paidN};
}
// מקור: שורה 5615
export function lnSum(L){
  const st=lnStatus(L), s=st.s; if(!s) return null;
  const paid=L.paid||{}, t=todayISO(), pr=s.rows.filter(x=>paid[x.i]), PT=lnPartTot(L,s);
  const paidPrin=r2(pr.reduce((a,x)=>a+x.principal,0)+PT.p), paidInt=r2(pr.reduce((a,x)=>a+x.interest,0)+PT.ii);
  const lateRows=s.rows.filter(x=>!paid[x.i]&&x.date<t);
  return {st,s,remain:r2((+L.amount||0)-paidPrin),paidSum:r2(pr.reduce((a,x)=>a+x.payment,0)+PT.a),paidPrin,paidInt,
    next:s.rows.find(x=>!paid[x.i])||null,lateRows,lateAmt:r2(lateRows.reduce((a,x)=>a+x.payment-lnPart(L,x.i).a,0)),closed:st.cls==='ok'};
}
