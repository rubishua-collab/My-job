// יומן גובים ושליחים, העברות כספים והודעות בוקר — חישובים בלבד (בלי DOM). משמש גם את הדפדפן וגם את השרת והבדיקות.
// כל הפונקציות כאן הועתקו כמו שהן מהתוכנה המקורית (app.html), עם מספרי השורות. אין לשנות נוסחה כספית בלי אישור בעל התוכנה.
// ההתאמה היחידה: במקום משתני המצב הגלובליים של התוכנה המקורית (S, LG, todayISO) יש כאן אובייקטי מצב מקומיים
// שהעטיפות buildLedger / morningRecipients ממלאות מנתוני השרת. גוף הפונקציות לא השתנה.
import { r2, sum, num, normName, normTime, timeMin, normStatus, ST_GOT, ST_NOT, ST_PASS, ST_NA, waPhone, phShow, cleanPh, stripInv, cleanColl, collKey, CHANGE, NOC_SP, NOC } from '../calc.js';

// ---- מצב (במקום S ו-LG הגלובליים של המקור, app.html 1866) ----
// אין טיוטות פתוחות בטאב באפליקציה החדשה: כל החשבונות שמורים בשרת, ולכן S.w/S.c ריקים ו-lgSources מחזיר רק חשבונות שמורים.
export const S = { s: { list: [] }, w: { entries: [], expenses: [], editId: null, date: '', stale: false }, c: { entries: [], editId: null, date: '' }, sp: { records: [], xstash: [], date: '' } };
export const LG = { tr: [], trAt: 0, ver: 1, cache: null, cacheVer: 0, ui: {}, seq: 0 };
let TODAY = '';
const todayISO = () => TODAY || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });

/* ---- app.html 1856-1860 (verbatim) ---- */
function fmt(n){
  n=r2(+n||0); const neg=n<0;
  const s=Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2});
  return (neg?'−':'')+s;
}
/* ---- app.html 1871-1872 (verbatim) ---- */
function isoLabel(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?m[3]+'.'+m[2]+'.'+m[1]:(iso||'');}
function weekday(iso){try{return new Date(iso+'T12:00:00').toLocaleDateString('he-IL',{weekday:'long'});}catch(e){return '';}}
/* ---- app.html 2522-2523 (verbatim) ---- */
const nmTokens=s=>normName(s).replace(/[-–—.,()\[\]_\/\\]/g,' ').split(/\s+/).filter(Boolean);
const nmKey=t=>t.slice().sort().join(' ');
/* ---- app.html 3017-3017 (verbatim) ---- */
const wStamp=a=>(a&&(a.updatedAt||a.createdAt))||0;
/* ---- app.html 4879-4881 (verbatim) ---- */
const pad2=n=>String(n).padStart(2,'0');
const isoOf=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return isoOf(d);};

/* ---- app.html 9619-9619 (verbatim) ---- */
const MB_DEF='בוקר טוב {שם}, תזכורת לתשלום היום בסך {סכום} ₪. הגובה {גובה} יגיע בשעה {שעה}. תודה ויום טוב.';
/* ---- app.html 9634-9674 (verbatim) ---- */
const mbColl=c=>{ const x=cleanColl(c); return (x&&x!==CHANGE&&x!==NOC_SP&&x!=='__none')?x:''; };
function mbRecipients(){
  const by=new Map(), order=[];
  const keyOf=(n,ph)=>ph||('n:'+nmKey(nmTokens(n)));
  const put=(k,o)=>{ if(!by.has(k)){ by.set(k,o); order.push(k); } return by.get(k); };
  /* 1. קובץ הפיצול של היום: השורות שעדיין בפיצול וגם אלה שכבר הועברו לאיסוף היומי. כמה חובות על אותו טלפון = הודעה אחת עם הסכום המצטבר */
  const seen=new Set(), rows=[];
  (S.sp.records||[]).concat(S.sp.xstash||[]).forEach(r=>{ if(!r) return; const id=r.id||JSON.stringify([r.n,r.a,r.ph,r.c]); if(seen.has(id)) return; seen.add(id); rows.push(r); });
  rows.forEach(r=>{
    const n=String(r.n||'').trim(), a=num(r.a); if(!n||!(a>0)||r.side) return;
    const ph=waPhone(r.ph), k=keyOf(n,ph);
    const g=put(k,{k,ph,shown:phShow(r.ph)||String(r.ph||''),n,a:0,t:'',c:'',src:'sp'});
    if(g.src==='sp') g.a=r2(g.a+a);
    const t=normTime(r.t); if(t&&(!g.t||t<g.t)) g.t=t;
    const c=mbColl(r.c); if(c&&!g.c) g.c=c;
  });
  /* 2. האיסוף היומי של היום: מעדכן שעה וגובה ללקוחות מהפיצול, ומוסיף לקוחות שאין בפיצול. מי שכבר "נאסף" לא מקבל תזכורת */
  const wDay=S.w.date===todayISO()||S.w.date===S.sp.date;
  if(wDay) (S.w.entries||[]).forEach(e=>{
    if(!e) return; const n=String(e.n||'').trim(), a=num(e.a); if(!n) return;
    const st=normStatus(e.s), ph=waPhone(e.p), k=keyOf(n,ph);
    let g=by.get(k);
    if(!g&&!ph){ const nk='n:'+nmKey(nmTokens(n)); g=by.get(nk); }
    if(!g){ if(st===ST_GOT||!(a>0)) return; g=put(k,{k,ph,shown:phShow(e.p)||String(e.p||''),n,a:0,t:'',c:'',src:'w'}); }
    if(st===ST_GOT){ g.got=true; return; }
    if(g.src==='w') g.a=r2(g.a+a);
    const t=normTime(e.t); if(t&&(!g.wt||t<g.wt)){ g.wt=t; g.t=t; }
    const c=mbColl(e.c); if(c) g.c=c;
    if(!g.ph&&ph){ g.ph=ph; g.shown=phShow(e.p); }
  });
  const all=order.map(k=>by.get(k)).filter(g=>!g.got);
  all.sort((x,y)=>(x.t?0:1)-(y.t?0:1)||String(x.t).localeCompare(String(y.t))||String(x.c).localeCompare(String(y.c),'he')||x.n.localeCompare(y.n,'he'));
  return {list:all.filter(g=>g.ph),noPhone:all.filter(g=>!g.ph)};
}
function mbFill(tpl,g){
  let s=String(tpl||'');
  if(!g.t) s=s.replace(/בשעה\s*\{שעה\}/g,'במהלך היום');
  if(!g.c) s=s.replace(/הגובה\s*\{גובה\}/g,'הגובה שלנו');
  s=s.replace(/\{שם\}/g,g.n).replace(/\{סכום\}/g,fmt(g.a)).replace(/\{שעה\}/g,g.t||'במהלך היום').replace(/\{גובה\}/g,g.c||'');
  return s.replace(/[ \t]{2,}/g,' ').replace(/ +\n/g,'\n').replace(/ ([.,])/g,'$1').trim();
}

/* ---- app.html 9882-10097 (verbatim) ---- */
const LG_SELF='@';
const LG_PMT=['מזומן','העברה בנקאית','ביט','פייבוקס','צ׳ק','אחר'];
const LG_ST=[['done','בוצעו: נאסף ונאסף חלקית'],['full','נאסף במלואו'],['part','נאסף חלקית'],['not','לא נאסף'],['plan','מתוכנן (טרם נאסף)'],['pass','לעבור'],['na','לא ענו'],['all','כל הסטטוסים']];
const LG_TST=[['all','הכל'],['open','נשארה יתרה אצל שליח'],['done','השליח העביר הכל'],['self','הגובה אסף בעצמו'],['unk','לא צוין מי אסף']];
const LG_STL={full:'נאסף',part:'נאסף חלקית',not:'לא נאסף',plan:'מתוכנן',pass:'לעבור',na:'לא ענו'};
const lgHasV=v=>v!==undefined&&v!==null&&v!=='';
const lgT=v=>{ const t=normTime(v); return t==='00:00'?'':t; };
const lgKey=e=>normName(e&&e.n)+'|'+r2(num(e&&e.a));
function lgByNorm(v,rc){ const s=stripInv(v); if(!s) return ''; if(s===LG_SELF) return LG_SELF; if(rc&&collKey(s)===collKey(rc)) return LG_SELF; return s; }
const lgByKey=by=>!by?'':(by===LG_SELF?LG_SELF:normName(by));
const lgByLabel=by=>!by?'לא צוין':(by===LG_SELF?'הגובה עצמו':by);
const lgRcLabel=rc=>rc||NOC;
function lgUi(k){ if(!LG.ui[k]) LG.ui[k]={q:'',pin:null,auto:true,mode:'day',from:'',to:'',rc:'',by:'',st:'done',tst:'all',open:{}}; return LG.ui[k]; }

/* ---------- מקורות ורשומות ---------- */
function lgSources(){
  const out=[];
  (S.s.list||[]).forEach(a=>{
    if(!a||!a.id||(a.kind!=='work'&&a.kind!=='collectors')) return;
    const k=a.kind==='work'?'w':'c';
    if(S[k].editId===a.id) return; /* פתוח בטאב: הגרסה שבטאב היא החיה */
    out.push({k,id:a.id,date:a.date||'',draft:false,acc:a,stamp:wStamp(a)});
  });
  const has=l=>(l||[]).some(e=>e&&(String(e.n||'').trim()||num(e.a)));
  if(has(S.w.entries)||has(S.w.expenses)) out.push({k:'w',id:S.w.editId||null,date:S.w.date||todayISO(),draft:true,stale:!!S.w.stale&&!S.w.editId,stamp:Date.now()});
  if(has(S.c.entries)) out.push({k:'c',id:S.c.editId||null,date:S.c.date||todayISO(),draft:true,stamp:Date.now()});
  return out;
}
function lgArrays(src){
  if(src.draft) return src.k==='w'?{entries:S.w.entries,expenses:S.w.expenses}:{entries:S.c.entries};
  return src.k==='w'?{entries:src.acc.entries||[],expenses:src.acc.expenses||[]}:{entries:src.acc.entries||[]};
}
function lgStCode(k,e){
  if(k==='c'){ const due=lgHasV(e.due)?num(e.due):num(e.a); return num(e.a)+0.005<due?'part':'full'; }
  const s=normStatus(e.s);
  if(s===ST_GOT) return (lgHasV(e.ga)&&num(e.ga)+0.005<num(e.a))?'part':'full';
  if(s===ST_NOT) return 'not'; if(s===ST_PASS) return 'pass'; if(s===ST_NA) return 'na'; return 'plan';
}
function lgMkRec(e,ref,src){
  const k=src.k, rc=cleanColl(e.c), st=lgStCode(k,e);
  const got=k==='c'?num(e.a):((st==='full'||st==='part')?(lgHasV(e.ga)?num(e.ga):num(e.a)):0);
  const due=k==='c'?(lgHasV(e.due)?num(e.due):num(e.a)):num(e.a), by=lgByNorm(e.by,rc);
  return {id:'r'+(++LG.seq),kind:'rec',refs:[ref],srcs:[k],date:src.date,dates:[src.date],draft:src.draft,
    n:String(e.n||'').trim()||'(ללא שם)',rc,rck:collKey(rc),by,byk:lgByKey(by),t:lgT(e.t),st,got:r2(got),due:r2(due),hasDue:k==='c'&&lgHasV(e.due),
    p:cleanPh(e.p),pmt:String(e.pmt||''),nt:String(e.nt||''),lk:String(e.lk||''),pp:e.pp||'',ord:ref.i};
}
function lgMkExp(x,ref,src){
  const rc=cleanColl(x.c), by=lgByNorm(x.by,rc);
  return {id:'x'+(++LG.seq),kind:'exp',refs:[ref],srcs:[src.k],date:src.date,draft:src.draft,n:String(x.n||'').trim()||'הוצאה',a:r2(num(x.a)),rc,rck:collKey(rc),by,byk:lgByKey(by),lk:String(x.lk||''),nf:!!x.nf,ord:ref.i};
}
function lgBuildSrc(src){
  const A=lgArrays(src); src.recs=[]; src.exps=[];
  (A.entries||[]).forEach((e,i)=>{
    if(!e||(!String(e.n||'').trim()&&!num(e.a))) return;
    const ref={k:src.k,id:src.id,draft:src.draft,arr:'entries',i,eid:e.id||null,key:lgKey(e),date:src.date};
    if(src.k==='c'&&e.k==='e') src.exps.push(lgMkExp(e,ref,src)); else src.recs.push(lgMkRec(e,ref,src));
  });
  (A.expenses||[]).forEach((x,i)=>{
    if(!x||(!String(x.n||'').trim()&&!num(x.a))) return;
    src.exps.push(lgMkExp(x,{k:src.k,id:src.id,draft:src.draft,arr:'expenses',i,eid:x.id||null,key:lgKey(x),date:src.date},src));
  });
  return src;
}
function lgOverlap(A,B){ const m=new Map(); A.forEach(k=>m.set(k,(m.get(k)||0)+1)); let o=0; B.forEach(k=>{ const c=m.get(k)||0; if(c){ o++; m.set(k,c-1); } }); return o; }
/* גרסאות של אותה רשימה לאותו תאריך: נספרת רק אחת (הטיוטה הפתוחה, אחרת הגדולה, אחרת האחרונה) */
function lgVersions(srcs,notes){
  const g=new Map();
  srcs.forEach(s=>{ const key=s.k+'|'+s.date; if(!g.has(key)) g.set(key,[]); g.get(key).push(s); });
  g.forEach(list=>{
    if(list.length<2) return;
    list.forEach(s=>{ s._keys=s.recs.map(r=>normName(r.n)+'|'+r.rck+'|'+(s.k==='w'?r.due:r.got)); });
    list.sort((x,y)=>((y.draft?1:0)-(x.draft?1:0))||(y.recs.length-x.recs.length)||((y.stamp||0)-(x.stamp||0)));
    const kept=[];
    list.forEach(s=>{
      const dup=kept.find(K=>{ const mn=Math.min(K._keys.length,s._keys.length); return mn>0&&lgOverlap(K._keys,s._keys)>=Math.max(1,Math.ceil(mn*0.6)); });
      if(dup){ s.skip=true; notes.ver.push({k:s.k,date:s.date}); } else kept.push(s);
    });
  });
}
/* טיוטה שנשארה מיום קודם: שורות זהות לרשימה השמורה של אותו יום לא נספרות שוב */
function lgStale(srcs,notes){
  const d=srcs.find(s=>s.draft&&s.k==='w'&&s.stale); if(!d) return;
  const prev=srcs.filter(s=>!s.draft&&s.k==='w'&&!s.skip&&s.date<d.date).sort((x,y)=>String(y.date).localeCompare(String(x.date))||((y.stamp||0)-(x.stamp||0)))[0];
  if(!prev) return;
  const m=new Map(), add=k=>m.set(k,(m.get(k)||0)+1), take=k=>{ const c=m.get(k)||0; if(c){ m.set(k,c-1); return true; } return false; };
  prev.recs.forEach(r=>add('r|'+normName(r.n)+'|'+r.rck+'|'+r.due+'|'+r.st));
  prev.exps.forEach(x=>add('x|'+normName(x.n)+'|'+x.rck+'|'+x.a));
  let n=0;
  d.recs.forEach(r=>{ if(take('r|'+normName(r.n)+'|'+r.rck+'|'+r.due+'|'+r.st)){ r.hidden='stale'; n++; } });
  d.exps.forEach(x=>{ if(take('x|'+normName(x.n)+'|'+x.rck+'|'+x.a)){ x.hidden='stale'; n++; } });
  if(n) notes.stale={n,date:prev.date};
}
function lgMerge(c,w){
  w.hidden='pair'; w.pairOf=c; c.pairW=w; c.refs=c.refs.concat(w.refs); c.srcs.push('w'); if(c.dates.indexOf(w.date)<0) c.dates.unshift(w.date);
  if(!c.t) c.t=w.t; if(!c.p) c.p=w.p; if(!c.by&&w.by){ c.by=w.by; c.byk=w.byk; } if(!c.pmt) c.pmt=w.pmt; if(!c.nt) c.nt=w.nt; if(!c.lk) c.lk=w.lk; if(!c.pp) c.pp=w.pp;
  if(!c.hasDue&&w.due>c.due+0.005){ c.due=w.due; c.st='part'; }
}
/* חשבון גובים שנבנה מרשימת איסוף יומי (אותו תאריך או יום קודם): השורות שלהן מתאחדות לרשומה אחת */
function lgPairAll(srcs,notes){
  const ws=srcs.filter(s=>s.k==='w'&&!s.skip), cs=srcs.filter(s=>s.k==='c'&&!s.skip).sort((x,y)=>String(x.date).localeCompare(String(y.date)));
  const nm=r=>normName(r.n), eq=(a,b)=>Math.abs(a-b)<0.005;
  cs.forEach(C=>{
    if(!C.recs.length&&!C.exps.length) return;
    const pd=addDays(C.date,-1), cands=ws.filter(W=>W.date===C.date||W.date===pd);
    let best=null, bs=0;
    cands.forEach(W=>{
      const m=new Map(); W.recs.forEach(r=>{ if(r.hidden) return; const k=nm(r)+'|'+r.rck; m.set(k,(m.get(k)||0)+1); });
      let s=0; C.recs.forEach(r=>{ const k=nm(r)+'|'+r.rck, c=m.get(k)||0; if(c){ s++; m.set(k,c-1); } });
      if(s>bs||(s===bs&&s>0&&W.date===C.date)){ bs=s; best=W; }
    });
    if(!best) return;
    const need=C.recs.length<=3?C.recs.length:Math.max(2,Math.ceil(C.recs.length*0.3));
    if(bs<need) return;
    let pn=0;
    const passes=[(c,w)=>nm(c)===nm(w)&&c.rck===w.rck&&(eq(c.got,w.due)||eq(c.got,w.got)),(c,w)=>nm(c)===nm(w)&&c.rck===w.rck,(c,w)=>nm(c)===nm(w)&&(eq(c.got,w.due)||(w.got>0&&eq(c.got,w.got)))];
    passes.forEach(ok=>C.recs.forEach(c=>{ if(c.pairW) return; const w=best.recs.find(w=>!w.hidden&&ok(c,w)); if(w){ lgMerge(c,w); pn++; } }));
    const xp=[(c,w)=>nm(c)===nm(w)&&c.rck===w.rck&&eq(c.a,w.a),(c,w)=>nm(c)===nm(w)&&eq(c.a,w.a)];
    xp.forEach(ok=>C.exps.forEach(c=>{ if(c.pairW) return; const w=best.exps.find(w=>!w.hidden&&ok(c,w)); if(!w) return;
      w.hidden='pair'; w.pairOf=c; c.pairW=w; c.refs=c.refs.concat(w.refs); c.srcs.push('w'); if(!c.by&&w.by){ c.by=w.by; c.byk=w.byk; } if(!c.lk) c.lk=w.lk; if(w.nf) c.nf=true; pn++; }));
    if(pn) notes.pair.push({c:C.date,w:best.date,n:pn});
  });
}
function lgLedger(){
  if(LG.cache&&LG.cacheVer===LG.ver) return LG.cache;
  LG.seq=0;
  const notes={ver:[],pair:[],stale:null};
  const srcs=lgSources().map(lgBuildSrc);
  lgVersions(srcs,notes); lgStale(srcs,notes); lgPairAll(srcs,notes);
  const recs=[], exps=[];
  srcs.forEach(s=>{ if(s.skip) return; s.recs.forEach(r=>{ if(!r.hidden) recs.push(r); }); s.exps.forEach(x=>{ if(!x.hidden) exps.push(x); }); });
  const byLk=new Map(); exps.forEach(x=>{ if(x.lk&&!byLk.has(x.lk)) byLk.set(x.lk,x); });
  recs.forEach(r=>{ if(r.lk&&byLk.has(r.lk)){ const x=byLk.get(r.lk); if(!x.forRec){ r.fee=x; x.forRec=r; } } });
  const trs=(LG.tr||[]).filter(t=>t&&t.id&&num(t.a)).map(t=>({id:t.id,kind:'tr',date:t.d||'',t:lgT(t.t),from:stripInv(t.from),fromk:normName(t.from),to:cleanColl(t.to),tok:collKey(cleanColl(t.to)),a:r2(num(t.a)),nt:String(t.nt||'')}));
  LG.cache={recs,exps,trs,notes,srcs}; LG.cacheVer=LG.ver;
  return LG.cache;
}

/* ---------- תצוגה: טווח, חיפוש, מסננים, קיבוץ וסיכומים ---------- */
function lgRange(k){
  const u=lgUi(k);
  if(u.auto){ const d=S[k].date||todayISO(); return [d,d]; }
  const f=u.from||S[k].date||todayISO(); if(u.mode!=='range') return [f,f];
  const t=u.to||f; return f<=t?[f,t]:[t,f];
}
const lgStOk=(r,st)=>st==='all'?true:(st==='done'?r.got>0.005:r.st===st);
const lgSortRec=(x,y)=>String(x.dates[0]).localeCompare(String(y.dates[0]))||((x.t?timeMin(x.t):1e9)-(y.t?timeMin(y.t):1e9))||(x.ord-y.ord);
function lgGCalc(G){
  G.recs.sort(lgSortRec); G.exps.sort((x,y)=>String(x.date).localeCompare(String(y.date))||(x.ord-y.ord)); G.trs.sort((x,y)=>String(x.date).localeCompare(String(y.date))||((x.t?timeMin(x.t):1e9)-(y.t?timeMin(y.t):1e9)));
  G.coll=sum(G.recs.map(r=>r.got)); G.exp=sum(G.exps.map(x=>x.a)); G.expF=sum(G.exps.filter(x=>!x.nf).map(x=>x.a));
  G.net=r2(G.coll-G.exp); G.trans=sum(G.trs.map(t=>t.a)); G.bal=sum(G.recs.map(r=>Math.max(0,r2(r.due-r.got))));
  G.acts=G.recs.filter(r=>r.got>0.005).length;
  G.type=G.byk===LG_SELF?'self':(G.byk?'cour':'unk');
  G.held=G.type==='cour'?r2(G.coll-G.expF-G.trans):null;
  G.tst=G.type==='cour'?(G.held>0.5?'open':'done'):G.type;
  return G;
}
function lgTot(groups){
  const recs=[].concat(...groups.map(g=>g.recs));
  const t={coll:sum(groups.map(g=>g.coll)),exp:sum(groups.map(g=>g.exp)),trans:sum(groups.map(g=>g.trans)),bal:sum(groups.map(g=>g.bal)),acts:sum(groups.map(g=>g.acts)),rows:recs.length};
  t.net=r2(t.coll-t.exp);
  t.clients=new Set(recs.filter(r=>r.got>0.005).map(r=>normName(r.n))).size;
  t.held=groups.filter(g=>g.type==='cour'&&g.held!==null&&Math.abs(g.held)>0.004).map(g=>({by:g.by,held:g.held}));
  t.heldSum=sum(t.held.map(h=>h.held));
  const self=groups.filter(g=>g.type==='self'), unk=groups.filter(g=>g.type==='unk');
  t.atColl=r2(sum(self.map(g=>g.coll-g.expF))+t.trans);
  t.unk=r2(sum(unk.map(g=>g.coll-g.expF)));
  t.hasSelf=self.some(g=>g.recs.length||g.exps.length); t.hasCour=groups.some(g=>g.type==='cour');
  t.cliOnly=t.hasCour&&groups.filter(g=>g.type==='cour').every(g=>g.held===null);
  return t;
}
function lgView(k){
  const L=lgLedger(), u=lgUi(k), R=lgRange(k), inR=d=>d>=R[0]&&d<=R[1];
  let recs=L.recs.filter(r=>r.dates.some(inR)&&lgStOk(r,u.st)), exps=L.exps.filter(x=>inR(x.date)), trs=L.trs.filter(t=>inR(t.date));
  if(u.rc){ recs=recs.filter(r=>r.rck===u.rc); exps=exps.filter(x=>x.rck===u.rc); trs=trs.filter(t=>t.tok===u.rc); }
  if(u.by){ const bk=u.by==='~'?'':u.by; recs=recs.filter(r=>r.byk===bk); exps=exps.filter(x=>x.byk===bk); trs=(bk&&bk!==LG_SELF)?trs.filter(t=>t.fromk===bk):[]; }
  const q=normName(u.q), pin=u.pin, mt=new Map(); let chips=[], rcSet=null, bySet=null;
  if(pin){
    rcSet=new Set(pin.f==='rc'?[pin.v]:[]); bySet=new Set(pin.f==='by'?[pin.v]:[]);
    if(pin.f==='rc'){ recs=recs.filter(r=>r.rck===pin.v); exps=exps.filter(x=>x.rck===pin.v); trs=trs.filter(t=>t.tok===pin.v); recs.forEach(r=>mt.set(r.id,['rc'])); }
    else if(pin.f==='by'){ recs=recs.filter(r=>r.byk===pin.v); exps=exps.filter(x=>x.byk===pin.v); trs=trs.filter(t=>t.fromk===pin.v); recs.forEach(r=>mt.set(r.id,['by'])); }
    else { recs=recs.filter(r=>normName(r.n)===pin.v); exps=exps.filter(x=>x.forRec&&normName(x.forRec.n)===pin.v); trs=[]; recs.forEach(r=>mt.set(r.id,['n'])); }
  } else if(q){
    const rcHit=new Map(), byHit=new Map(), nHit=new Map();
    recs.concat(exps).forEach(r=>{ if(normName(r.rc).indexOf(q)>=0&&!rcHit.has(r.rck)) rcHit.set(r.rck,{v:r.rck,l:lgRcLabel(r.rc),n:0}); if(r.byk&&r.byk!==LG_SELF&&r.byk.indexOf(q)>=0&&!byHit.has(r.byk)) byHit.set(r.byk,{v:r.byk,l:r.by,n:0}); });
    trs.forEach(t=>{ if(normName(t.to).indexOf(q)>=0&&!rcHit.has(t.tok)) rcHit.set(t.tok,{v:t.tok,l:lgRcLabel(t.to),n:0}); if(t.fromk.indexOf(q)>=0&&!byHit.has(t.fromk)) byHit.set(t.fromk,{v:t.fromk,l:t.from,n:0}); });
    recs=recs.filter(r=>{
      const f=[]; if(normName(r.n).indexOf(q)>=0){ f.push('n'); const nk=normName(r.n); if(!nHit.has(nk)) nHit.set(nk,{v:nk,l:r.n,n:0}); nHit.get(nk).n++; }
      if(rcHit.has(r.rck)){ f.push('rc'); rcHit.get(r.rck).n++; }
      if(r.byk&&byHit.has(r.byk)){ f.push('by'); byHit.get(r.byk).n++; }
      if(f.length) mt.set(r.id,f); return f.length>0;
    });
    exps=exps.filter(x=>rcHit.has(x.rck)||(x.byk&&byHit.has(x.byk))||(x.forRec&&mt.has(x.forRec.id)));
    trs=trs.filter(t=>rcHit.has(t.tok)||byHit.has(t.fromk));
    rcSet=new Set(rcHit.keys()); bySet=new Set(byHit.keys());
    const srt=a=>Array.from(a.values()).sort((x,y)=>(y.n-x.n)||String(x.l).localeCompare(String(y.l),'he'));
    chips=srt(rcHit).map(c=>Object.assign({f:'rc'},c)).concat(srt(byHit).map(c=>Object.assign({f:'by'},c)),srt(nHit).slice(0,10).map(c=>Object.assign({f:'n'},c)));
  }
  const blocks=new Map();
  const blk=(rck,rc)=>{ if(!blocks.has(rck)) blocks.set(rck,{rck,rc:lgRcLabel(rc),g:new Map()}); return blocks.get(rck); };
  const grp=(B,byk,by)=>{ if(!B.g.has(byk)) B.g.set(byk,{byk,by,rck:B.rck,rc:B.rc,recs:[],exps:[],trs:[]}); return B.g.get(byk); };
  recs.forEach(r=>grp(blk(r.rck,r.rc),r.byk,r.by).recs.push(r));
  exps.forEach(x=>grp(blk(x.rck,x.rc),x.byk,x.by).exps.push(x));
  trs.forEach(t=>grp(blk(t.tok,t.to),t.fromk,t.from).trs.push(t));
  const gOrd=g=>g.type==='self'?0:(g.type==='cour'?1:2);
  let list=Array.from(blocks.values()).map(B=>{
    let gs=Array.from(B.g.values()).map(lgGCalc);
    /* קבוצה שהגיעה רק דרך שם לקוח: ההעברות והיתרה של השליח שייכות לכל האיסופים שלו, ולכן לא מוצגות כאן */
    if(rcSet) gs.forEach(G=>{ G.cli=!(rcSet.has(B.rck)||(G.byk&&bySet.has(G.byk))); if(G.cli&&G.type==='cour'){ G.held=null; G.tst='cli'; } });
    if(u.tst!=='all') gs=gs.filter(g=>g.tst===u.tst);
    gs.sort((x,y)=>(gOrd(x)-gOrd(y))||String(x.by).localeCompare(String(y.by),'he'));
    return {rck:B.rck,rc:B.rc,groups:gs,tot:lgTot(gs)};
  }).filter(B=>B.groups.length);
  list.sort((x,y)=>((x.rck==='')-(y.rck===''))||(y.tot.coll-x.tot.coll)||x.rc.localeCompare(y.rc,'he'));
  const allG=[].concat(...list.map(B=>B.groups));
  return {k,u,R,q,pin,chips,mt,blocks:list,tot:lgTot(allG),notes:L.notes,multiDay:R[0]!==R[1]};
}

/* ---- app.html 10269-10307 (verbatim) ---- */
/* ---------- טקסט לוואטסאפ ---------- */
function lgText(V){
  const u=V.u, L=[], rl=V.R[0]===V.R[1]?(weekday(V.R[0])+' '+isoLabel(V.R[0])):(isoLabel(V.R[0])+' – '+isoLabel(V.R[1]));
  const ttl=u.pin?u.pin.l:(V.q?u.q.trim():'כל הגובים');
  L.push('*סיכום איסופים – '+ttl+'*'); L.push(rl);
  const fl=[]; if(u.rc) fl.push('גובה: '+(V.blocks[0]?V.blocks[0].rc:u.rc)); if(u.by) fl.push('מי אסף: '+(u.by==='~'?'לא צוין':(u.by===LG_SELF?'הגובה עצמו':u.by)));
  if(u.st!=='done') fl.push('סטטוס: '+(LG_ST.find(o=>o[0]===u.st)||['',''])[1]); if(u.tst!=='all') fl.push((LG_TST.find(o=>o[0]===u.tst)||['',''])[1]);
  if(fl.length) L.push('מסננים: '+fl.join(' · '));
  const sumLines=(t,rc)=>{
    L.push('לקוחות: '+t.clients+' · פעולות איסוף: '+t.acts);
    L.push('נאסף מהלקוחות: '+fmt(t.coll)+' ₪');
    L.push('הוצאות ועמלות שליחים: '+fmt(t.exp)+' ₪');
    L.push('*נטו אחרי הוצאות: '+fmt(t.net)+' ₪*');
    if(t.hasCour||t.trans){ L.push('הועבר מהשליחים לגובה: '+fmt(t.trans)+' ₪'); }
    if(t.held.length) L.push('עדיין אצל השליחים: '+t.held.map(h=>h.by+' '+fmt(h.held)+' ₪').join(' · '));
    if(t.bal>0.004) L.push('יתרה שלא נאספה: '+fmt(t.bal)+' ₪');
  };
  L.push(''); sumLines(V.tot);
  V.blocks.forEach(B=>{
    L.push('','━━ '+B.rc+' ━━');
    if(V.blocks.length>1) sumLines(B.tot,B.rc);
    B.groups.forEach(G=>{
      const lbl=G.type==='self'?B.rc+' בעצמו':(G.type==='cour'?'שליח: '+G.by:'לא צוין מי אסף');
      L.push('','▪️ '+lbl+' ('+G.acts+')');
      G.recs.forEach((r,i)=>{
        const bal=Math.max(0,r2(r.due-r.got));
        L.push((i+1)+'. '+(r.t?r.t+' · ':'')+((V.multiDay||r.dates.length>1)?isoLabel(r.dates[0])+' · ':'')+r.n+' – '+fmt(r.got)+' ₪'+
          (r.st==='part'?' (חלקי מתוך '+fmt(r.due)+', יתרה '+fmt(bal)+')':(r.got<0.005?' ('+(LG_STL[r.st]||'')+', '+fmt(r.due)+' ₪)':''))+
          (r.pmt?' · '+r.pmt:'')+(r.fee?' · עמלה '+fmt(r.fee.a)+' ₪':'')+(r.nt?' · '+r.nt:''));
      });
      const fx=G.exps.filter(x=>!x.forRec);
      if(fx.length){ L.push('הוצאות:'); fx.forEach(x=>L.push('• '+x.n+' – '+fmt(x.a)+' ₪')); }
      if(G.trs.length){ L.push('העברות ל'+B.rc+':'); G.trs.forEach(t=>L.push('• '+isoLabel(t.date)+(t.t?' '+t.t:'')+' – '+fmt(t.a)+' ₪'+(t.nt?' · '+t.nt:''))); }
      L.push('סה״כ: '+fmt(G.coll)+' ₪ · הוצאות: '+fmt(G.exp)+' ₪ · נטו: '+fmt(G.net)+' ₪');
      if(G.type==='cour'&&G.held!==null) L.push('הועבר ל'+B.rc+': '+fmt(G.trans)+' ₪ · *יתרה אצל '+G.by+': '+fmt(G.held)+' ₪*');
    });
  });
  return L.join('\n');
}

/* ---- app.html 10309-10329 (verbatim) ---- */
/* ---------- כתיבה לשורות המקוריות ---------- */
function lgFind(arr,ref){
  if(ref.eid){ const j=arr.findIndex(e=>e&&e.id===ref.eid); if(j>=0) return j; }
  if(arr[ref.i]&&lgKey(arr[ref.i])===ref.key) return ref.i;
  return arr.findIndex(e=>e&&lgKey(e)===ref.key);
}
function lgPlan(){
  const m=new Map();
  const add=(ref,op)=>{ const key=ref.k+'|'+(ref.draft?'draft':ref.id); if(!m.has(key)) m.set(key,{src:{k:ref.k,id:ref.id,draft:ref.draft},ops:[]}); op.ref=ref; op.arr=op.arr||ref.arr; m.get(key).ops.push(op); };
  return {m,add};
}
function lgRunOps(A,ops,k,draft){
  const dels=[];
  ops.forEach(o=>{
    const arr=A[o.arr]; if(!arr) throw {msg:'הרשימה לא נמצאה'};
    if(o.op==='add'){ arr.push(o.mk(k,draft)); return; }
    const j=lgFind(arr,o.ref); if(j<0) throw {msg:'השורה השתנתה בינתיים. סגור, פתח שוב ונסה'};
    if(o.op==='set') o.fn(arr[j],k,draft); else dels.push({arr,j});
  });
  dels.sort((a,b)=>b.j-a.j).forEach(d=>d.arr.splice(d.j,1));
}

// ---------- עטיפות: ממלאות את המצב מנתוני השרת וקוראות לפונקציות המקוריות ----------
// accounts: חשבונות work/collectors מלאים ({id,kind,date,entries,expenses,updatedAt,createdAt}); transfers: settings/transfers.list
export function buildLedger(accounts, transfers) {
  S.s.list = accounts || []; LG.tr = Array.isArray(transfers) ? transfers : []; LG.ver++; LG.cache = null;
  return lgLedger();
}
// רשימת הנמענים להודעות הבוקר ליום מסוים, בדיוק כמו mbRecipients (app.html 9635). split = {date,records,xstash}, work = {date,entries}
export function morningRecipients({ date, split, work }) {
  TODAY = date;
  S.sp = { records: (split && split.records) || [], xstash: (split && split.xstash) || [], date: (split && split.date) || '' };
  S.w = { entries: (work && work.entries) || [], expenses: (work && work.expenses) || [], date: (work && work.date) || '', editId: null };
  try { return mbRecipients(); } finally { TODAY = ''; S.sp = { records: [], xstash: [], date: '' }; S.w = { entries: [], expenses: [], editId: null, date: '', stale: false }; }
}
// בחירת קובץ הפיצול והרשימה של היום (במקום הטאב הפתוח במקור): הפיצול השמור של היום (האחרון), ושורות שהועברו לאיסוף (xstash)
// מטיוטת הפיצול (settings/sp_draft) אם היא של אותו יום. הרשימה: איסוף יום של אותו תאריך (האחרון שעודכן).
export function pickMorningSources(accounts, spDraft, date) {
  const last = (k) => (accounts || []).filter(a => a && a.kind === k && a.date === date).sort((x, y) => wStamp(y) - wStamp(x))[0] || null;
  const sp = last('split'), w = last('work'), d = spDraft && spDraft.d && spDraft.d.date === date ? spDraft.d : null;
  let split = null;
  if (sp) split = { id: sp.id, date: sp.date, records: sp.records || [], xstash: d && (!d.editId || d.editId === sp.id) ? (d.xstash || []) : [] };
  else if (d) split = { id: null, date: d.date, records: d.records || [], xstash: d.xstash || [] };
  return { split, work: w ? { id: w.id, date: w.date, entries: w.entries || [], expenses: w.expenses || [] } : null };
}
export { fmt as fmtOrig, isoLabel, weekday, addDays, MB_DEF, mbFill, lgUi, lgView, lgLedger, lgGCalc, lgTot, lgText, lgByNorm, lgPlan, lgRunOps, lgFind, lgKey, lgHasV, lgT, lgRange, LG_SELF, LG_PMT, LG_ST, LG_TST, LG_STL, lgByKey, lgByLabel, lgRcLabel, NOC };
