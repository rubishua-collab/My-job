// איסוף יום — פונקציות שהועתקו כמו שהן מהתוכנה המקורית (app.html), עם מספרי השורות.
// שינויים מינימליים בלבד במקור הנתונים: במקום S.s.list/CLT.list (נתוני הדפדפן במקור) — BOOK שנטען מהשרת.
// אין כאן שום שינוי בנוסחה כספית: הסיכומים מגיעים מ-calcWork/workGroups שב-calc.js.
import { r2, sum, num, normName, normTime, normStatus, phShow, cleanPh, normHard, cleanColl, collKey, calcWork, wExpList, workGroups, CHANGE, NOC_SP, ST_GOT, ST_NOT, ST_NA, ST_PASS, timeMin } from '../calc.js';
import { esc, weekday, dmy as isoLabel } from '../ui.js';
import { loansBoxHTML as loansGivenHTML } from './loans-box.js';

// ספר טלפונים, גובה ו״קשה״ של כל לקוח: מכל הפיצולים השמורים ומאגר הלקוחות (בשרת)
export const BOOK = { splits: [], clients: [], collectors: [], loaded: false };
export function setBook(b) { Object.assign(BOOK, b, { loaded: true }); PHB.dirty = true; }
// מקור: שורה 3514
const isRealColl=c=>!!c&&c!==CHANGE&&c!==NOC_SP;
// מקור: שורה 3522 (knownCollectors) — כאן מהשרת (/api/collectors)
export const knownCollectors=()=>BOOK.collectors.slice();
// מקור: שורה 3266
function collNameSet(){return new Set(knownCollectors().concat(['עידן','טאייה']).map(collKey).filter(Boolean));}
// מקור: שורה 1862
const money=n=>'<span class="num'+(n<0?' neg':'')+'">'+fmt(n)+' ₪</span>';
// מקור: שורה 2520 + 2551 (phbGet) — מקור הנתונים: פיצולים שמורים ומאגר הלקוחות
const PHB={map:null,dirty:true};
function phbGet(){
  if(PHB.map&&!PHB.dirty) return PHB.map;
  const m=new Map();
  (BOOK.splits||[]).filter(a=>a&&Array.isArray(a.records)).sort((x,y)=>String(x.date||'').localeCompare(String(y.date||''))).forEach(a=>phbIngest(m,a.date,a.records,false));
  (BOOK.clients||[]).forEach(c=>{ if(c&&c.phone) phbIngest(m,String(c.updated||c.created||'').slice(0,10),[{n:c.name,ph:c.phone}],false); });
  PHB.map=m; PHB.dirty=false; return m;
}
export const bookSize=()=>phbGet().size;
// מקור: שורות 2522-2523
const nmTokens=s=>normName(s).replace(/[-–—.,()\[\]_\/\\]/g,' ').split(/\s+/).filter(Boolean);
const nmKey=t=>t.slice().sort().join(' ');
// מקור: שורות 2538-2550
function phbIngest(m,date,recs,replace){
  const day=String(date||''), local=new Map();
  for(const r of recs||[]){
    if(!r) continue; const p=phShow(r.ph); if(!p) continue;
    const toks=nmTokens(r.n); if(!toks.length) continue;
    const k=nmKey(toks); if(!local.has(k)) local.set(k,new Set()); local.get(k).add(p);
  }
  local.forEach((ps,k)=>{
    const cur=m.get(k);
    if(!cur||day>cur.d||(replace&&day===cur.d)) m.set(k,{d:day,ps});
    else if(day===cur.d) ps.forEach(p=>cur.ps.add(p));
  });
}
// מקור: שורות 2563-2622
function phLookup(name){
  const toks=nmTokens(name); if(!toks.length) return {p:'',pm:''};
  const book=phbGet(); if(!book.size) return {p:'',pm:''};
  const hit=book.get(nmKey(toks));
  if(hit) return hit.ps.size===1?{p:Array.from(hit.ps)[0],pm:'x'}:{p:'',pm:'amb',c:Array.from(hit.ps)};
  if(toks.length<2) return {p:'',pm:''};
  const mine=new Set(toks), found=new Set();
  book.forEach((v,key)=>{
    const bt=key.split(' '); if(bt.length<2) return;
    const bs=new Set(bt);
    if(toks.every(x=>bs.has(x))||bt.every(x=>mine.has(x))) v.ps.forEach(p=>found.add(p));
  });
  if(found.size===1) return {p:Array.from(found)[0],pm:'a'};
  return found.size>1?{p:'',pm:'amb',c:Array.from(found)}:{p:'',pm:''};
}
/* collector of each client, taken from the split (פיצול) data: latest split wins */
const CB={for:null,map:null};
function cbGet(){
  const book=phbGet(); if(CB.for===book&&CB.map) return CB.map;
  const m=new Map();
  const ing=(date,recs)=>{ const day=String(date||''); for(const r of recs||[]){
    if(!r) continue; const c=String(r.c||'').trim(); if(!c||c===CHANGE||c===NOC_SP) continue;
    const toks=nmTokens(r.n); if(!toks.length) continue; const k=nmKey(toks), cur=m.get(k);
    if(!cur||day>=cur.d) m.set(k,{d:day,c}); } };
  (BOOK.splits||[]).filter(a=>a&&Array.isArray(a.records)).sort((x,y)=>String(x.date||'').localeCompare(String(y.date||''))).forEach(a=>ing(a.date,a.records));
  (BOOK.clients||[]).forEach(c=>{ const cc=cleanColl(c&&c.coll); if(!isRealColl(cc)) return; const toks=nmTokens(c.name); if(!toks.length) return; const k=nmKey(toks); if(!m.has(k)) m.set(k,{d:'',c:cc}); });
  CB.for=book; CB.map=m; return m;
}
function collLookup(name){
  const toks=nmTokens(name); if(!toks.length) return '';
  const book=cbGet(); if(!book.size) return '';
  const hit=book.get(nmKey(toks)); if(hit) return hit.c;
  if(toks.length<2) return '';
  const mine=new Set(toks), found=new Set();
  book.forEach((v,key)=>{ const bt=key.split(' '); if(bt.length<2) return; const bs=new Set(bt); if(toks.every(x=>bs.has(x))||bt.every(x=>mine.has(x))) found.add(v.c); });
  return found.size===1?Array.from(found)[0]:'';
}
/* hard / not hard of each client, taken from the split (פיצול): the latest split that has the marking decides */
const HB={for:null,map:null};
function hbGet(){
  const book=phbGet(); if(HB.for===book&&HB.map) return HB.map;
  const m=new Map();
  const ing=(date,recs)=>{ recs=recs||[]; if(!recs.some(r=>r&&normHard(r.h))) return; const day=String(date||'');
    for(const r of recs){ if(!r) continue; const toks=nmTokens(r.n); if(!toks.length) continue; const k=nmKey(toks), cur=m.get(k), h=normHard(r.h);
      if(!cur||day>cur.d||(day===cur.d&&!cur.h&&h)) m.set(k,{d:day,h}); } };
  (BOOK.splits||[]).filter(a=>a&&Array.isArray(a.records)).sort((x,y)=>String(x.date||'').localeCompare(String(y.date||''))).forEach(a=>ing(a.date,a.records));
  (BOOK.clients||[]).forEach(c=>{ const h=normHard(c&&c.hard); if(!h) return; const toks=nmTokens(c.name); if(!toks.length) return; const k=nmKey(toks); if(!m.has(k)) m.set(k,{d:'',h}); });
  HB.for=book; HB.map=m; return m;
}
function hardLookup(name){
  const toks=nmTokens(name); if(!toks.length) return '';
  const book=hbGet(); if(!book.size) return '';
  const hit=book.get(nmKey(toks)); if(hit) return hit.h;
  if(toks.length<2) return '';
  const mine=new Set(toks), found=new Set();
  book.forEach((v,key)=>{ if(!v.h) return; const bt=key.split(' '); if(bt.length<2) return; const bs=new Set(bt); if(toks.every(x=>bs.has(x))||bt.every(x=>mine.has(x))) found.add(v.h); });
  return found.size===1?Array.from(found)[0]:'';
// מקור: שורות 2666-2792
}
const expLines=(xl,lines,withC)=>xl.forEach(x=>lines.push('• '+x.n+' – '+fmt(x.a)+' ₪'+(withC&&x.c?' – '+x.c:'')));
function workLines(c,lines){
  c.rows.forEach((r,i)=>{ if(c.noAns&&c.noAns.length){ if(i===0) lines.push('— לא ענו —'); else if(i===c.noAns.length) lines.push('— לפי שעה —'); } lines.push((i+1)+'. '+r.n+(r.pp?' (חלק '+r.pp+')':'')+' – '+fmt(r.a)+' ₪'+(r.s?' – '+r.s+(r.ga!==null&&r.ga!==undefined&&Math.abs(r.ga-r.a)>0.004?' '+fmt(r.ga)+' ₪ (חלקי)':''):(r.t?' – '+r.t:''))+(r.p?' – '+r.p:'')+(r.h?' – '+(r.h==='קשה'?'🔴 קשה':'🟢 לא קשה'):'')); (r.notes||[]).forEach(t=>String(t).split(/\r?\n/).forEach(l=>{ if(l.trim()) lines.push('   ✎ '+l.trim()); }));});
}
function workText(acc){
  const es=acc.entries||[], xs=wExpList(acc), xt=sum(xs.map(x=>x.a)), c=calcWork(es), gs=workGroups(es,xs);
  const lines=['איסוף יומי – '+weekday(acc.date)+' '+isoLabel(acc.date)];
  if(gs){
    gs.forEach(g=>{
      lines.push('', g.name+(g.calc.count?' ('+g.calc.count+')':''));
      if(g.calc.count){
        workLines(g.calc,lines);
        lines.push('סה״כ '+g.name+': '+fmt(g.calc.total)+' ₪');
        if(g.calc.notGot.length) lines.push('לא נאסף: '+fmt(g.calc.notTotal)+' ₪ ('+g.calc.notGot.length+')');
        if(g.calc.got.length){ lines.push('נאסף: '+fmt(g.calc.gotTotal)+' ₪ ('+g.calc.got.length+')'); lines.push('נותר לאסוף: '+fmt(g.calc.left)+' ₪ ('+(g.calc.count-g.calc.got.length)+')'); }
      }
      if(g.exp.length){
        lines.push('הוצאות '+g.name+':'); expLines(g.exp,lines,false);
        lines.push('סה״כ הוצאות: '+fmt(g.expTotal)+' ₪');
        if(g.calc.count) lines.push('נטו '+g.name+': '+fmt(g.net)+' ₪');
      }
    });
    lines.push('', 'סה״כ כללי: '+fmt(c.total)+' ₪');
    if(c.notGot.length) lines.push('לא נאסף: '+fmt(c.notTotal)+' ₪ ('+c.notGot.length+')');
    if(c.got.length){ lines.push('נאסף: '+fmt(c.gotTotal)+' ₪ ('+c.got.length+')'); lines.push('נותר לאסוף: '+fmt(c.left)+' ₪ ('+(c.count-c.got.length)+')'); }
    if(xs.length){ lines.push('סה״כ הוצאות: '+fmt(xt)+' ₪'); lines.push('נטו כללי: '+fmt(r2(c.total-xt))+' ₪'); }
    return lines.join('\n');
  }
  if(c.count){
    workLines(c,lines);
    lines.push('סה״כ: '+fmt(c.total)+' ₪');
    if(c.notGot.length) lines.push('לא נאסף: '+fmt(c.notTotal)+' ₪ ('+c.notGot.length+')');
    if(c.got.length){ lines.push('נאסף: '+fmt(c.gotTotal)+' ₪ ('+c.got.length+')'); lines.push('נותר לאסוף: '+fmt(c.left)+' ₪ ('+(c.count-c.got.length)+')'); }
  }
  if(xs.length){
    lines.push('', 'הוצאות:'); expLines(xs,lines,true);
    lines.push('סה״כ הוצאות: '+fmt(xt)+' ₪');
    if(c.count) lines.push('נטו: '+fmt(r2(c.total-xt))+' ₪');
  }
  return lines.join('\n');
}
function expTableHTML(xl,total,net,withC){
  const rows=xl.map((x,i)=>'<tr><td class="ix">'+(i+1)+'</td><td>'+esc(x.n)+'</td>'+(withC?'<td>'+(x.c?esc(x.c):'—')+'</td>':'')+'<td class="a">'+money(x.a)+'</td></tr>').join('');
  const cs=withC?' colspan="2"':'';
  let foot='<tr class="tot"><td></td><td'+cs+'>סה״כ הוצאות ('+xl.length+')</td><td class="a">'+money(total)+'</td></tr>';
  if(net!=null) foot+='<tr class="tot2"><td></td><td'+cs+'>נטו (סה״כ חובות פחות הוצאות)</td><td class="a">'+money(net)+'</td></tr>';
  return '<h3 class="rh" style="margin:14px 0 6px">הוצאות</h3><table class="rt brown"><thead><tr><th class="ix">#</th><th>הוצאה</th>'+(withC?'<th>גובה</th>':'')+'<th class="a">סכום</th></tr></thead><tbody>'+rows+'</tbody><tfoot>'+foot+'</tfoot></table>';
}
function workTableHTML(c,opts){
  let body='', n=0;
  const lbl=r=>r.s?'<span class="stl '+(r.s===ST_GOT?'got':(r.s===ST_NOT?'hard':(r.s===ST_NA?'na':'pass')))+'">'+esc(r.s)+(r.ga!==null&&r.ga!==undefined&&Math.abs(r.ga-r.a)>0.004?' '+fmt(r.ga)+' ₪ חלקי':'')+'</span>':(r.t?'<span class="num"><b>'+esc(r.t)+'</b></span>':'—');
  const row=r=>{n++;const cl=(r.s===ST_GOT?'done':'')+(opts&&opts.hit&&opts.hit(r.n,r.a)?' hit':'');return '<tr'+(cl.trim()?' class="'+cl.trim()+'"':'')+'><td class="ix">'+n+'</td><td>'+esc(r.n)+((r.notes&&r.notes.length)?'<div class="rnotes">'+r.notes.map(t=>esc(t)).join('<br>').replace(/\n/g,'<br>')+'</div>':'')+(r.pp?' <span class="stl part">חלק <span class="num">'+esc(r.pp)+'</span></span>':'')+(r.h?' <span class="stl '+(r.h==='קשה'?'hard':'easy')+'">'+esc(r.h)+'</span>':'')+(r.p?'<div class="phl"><span class="num">'+esc(r.p)+'</span></div>':'')+'</td><td class="a">'+money(r.a)+'</td><td class="a">'+lbl(r)+'</td></tr>';};
  const sep=t=>n>0?'<tr class="hl"><td colspan="4">'+t+'</td></tr>':'';
  /* "לא ענו": בלוק נפרד בראש הרשימה, לא מתערבב עם מי שיש לו שעה */
  if(c.noAns.length) body+='<tr class="hl"><td colspan="4">'+ST_NA+' ('+c.noAns.length+')</td></tr>'+c.noAns.map(row).join('');
  if(c.noAns.length&&c.timed.length) body+='<tr class="hl"><td colspan="4">לפי שעה</td></tr>';
  body+=c.timed.map(row).join('');
  [[c.pass,ST_PASS],[c.noTime,'ללא שעה'],[c.notGot,ST_NOT],[c.got,ST_GOT]].forEach(g=>{ if(g[0].length) body+=sep(g[1])+g[0].map(row).join(''); });
  let foot='<tr class="tot"><td></td><td>סה״כ ('+c.count+' חייבים)</td><td class="a">'+money(c.total)+'</td><td></td></tr>';
  if(c.notGot.length) foot+='<tr class="tot2"><td></td><td>לא נאסף ('+c.notGot.length+')</td><td class="a">'+money(c.notTotal)+'</td><td></td></tr>';
  if(c.got.length) foot+='<tr class="tot2"><td></td><td>נאסף ('+c.got.length+')</td><td class="a">'+money(c.gotTotal)+'</td><td></td></tr>'+
    '<tr class="tot2"><td></td><td>נותר לאסוף ('+(c.count-c.got.length)+')</td><td class="a">'+money(c.left)+'</td><td></td></tr>';
  return '<table class="rt"><thead><tr><th class="ix">#</th><th>שם</th><th class="a">סכום</th><th class="a">שעה</th></tr></thead><tbody>'+body+'</tbody><tfoot>'+foot+'</tfoot></table>';
}
function workHTML(acc,opts){
  const es=acc.entries||[], xs=wExpList(acc), xt=sum(xs.map(x=>x.a)), c=calcWork(es), gs=workGroups(es,xs);
  let h='<header class="rhead">'+RSEAL+'<div class="rht"><span class="rbrand">יומן חשבון בוקר</span><h2 class="rtitle">רשימת חייבים · איסוף יומי</h2><div class="rsub">'+esc(weekday(acc.date))+' · '+esc(isoLabel(acc.date))+'</div></div></header>';
  if(!gs) return h+(c.count?'<section class="rs">'+workTableHTML(c,opts)+'</section>':'')+(xs.length?'<section class="rs">'+expTableHTML(xs,xt,c.count?r2(c.total-xt):null,true)+'</section>':'')+loansGivenHTML(acc.loans);
  h+=gs.map(g=>'<section class="cblock"><div class="cband"><span>'+esc(g.name)+'</span>'+(g.calc.count?'<span class="cbs">'+g.calc.count+' חייבים · '+money(g.calc.total)+'</span>':'')+'</div>'+(g.calc.count?workTableHTML(g.calc,opts):'')+(g.exp.length?expTableHTML(g.exp,g.expTotal,g.calc.count?g.net:null,false):'')+'</section>').join('');
  h+='<section class="rs"><table class="rt"><tbody><tr class="tot"><td>סה״כ כללי ('+c.count+' חייבים)</td><td class="a">'+money(c.total)+'</td></tr>'+
    (c.notGot.length?'<tr class="tot2"><td>לא נאסף ('+c.notGot.length+')</td><td class="a">'+money(c.notTotal)+'</td></tr>':'')+
    (c.got.length?'<tr class="tot2"><td>נאסף ('+c.got.length+')</td><td class="a">'+money(c.gotTotal)+'</td></tr><tr class="tot2"><td>נותר לאסוף ('+(c.count-c.got.length)+')</td><td class="a">'+money(c.left)+'</td></tr>':'')+
    (xs.length?'<tr class="tot2"><td>סה״כ הוצאות ('+xs.length+')</td><td class="a">'+money(xt)+'</td></tr><tr class="tot2"><td>נטו כללי (סה״כ חובות פחות הוצאות)</td><td class="a">'+money(r2(c.total-xt))+'</td></tr>':'')+'</tbody></table></section>';
  h+=loansGivenHTML(acc.loans);
  return h;
}
function parseWorkText(text){
  const out=[];
  for(let line of String(text).split(/\r?\n/)){
    line=line.replace(/[‎‏‪-‮]/g,'').trim(); if(!line) continue;
    line=line.replace(/^\s*\d+\s*[.)]\s+/,'');
    let ph=''; const pmm=/\b0\d{1,2}[-\s]?\d{7}\b/.exec(line); if(pmm) ph=phShow(pmm[0]);
    line=line.replace(/\b0\d{1,2}[-\s]?\d{7}\b/g,' ');
    let s=''; const sm=/(לעבור|לא\s*נאס[פף][^\s()\[\]]*|נאס[פף][^\s()\[\]]*)/.exec(line);
    if(sm){ s=normStatus(sm[0]); line=(line.slice(0,sm.index)+' '+line.slice(sm.index+sm[0].length)).replace(/\(\s*\)|\[\s*\]/g,' '); }
    let t=''; const tm=/(\d{1,2})\s*:\s*(\d{2})/.exec(line);
    if(tm){ t=normTime(tm[1]+':'+tm[2]); line=line.slice(0,tm.index)+' '+line.slice(tm.index+tm[0].length); }
    let am=Array.from(line.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)); if(!am.length) continue;
    if(!t&&am.length>=2){ /* "450 – 8.30": a last number shaped like H.MM after the amount is a time */
      const lt=am[am.length-1], cand=/^\d{1,2}\.\d{2}$/.test(lt[0])?normTime(lt[0]):'';
      if(cand){ t=cand; line=line.slice(0,lt.index)+' '+line.slice(lt.index+lt[0].length); am=am.slice(0,-1); }
    }
    const last=am[am.length-1];
    const name=(line.slice(0,last.index)+' '+line.slice(last.index+last[0].length)).replace(/₪|ש"ח|שח|ש״ח/g,' ').replace(/[\s\-–—:]+/g,' ').trim();
    if(!name||TOTAL_RE.test(name)) continue;
    let nm=name, col=''; const cset=collNameSet(), ps=nm.split(' ');
    const tail=line.slice(last.index+last[0].length).split(/[\s\-–—:|,()]+/).filter(Boolean), tk=tail.find(x=>cset.has(collKey(x)));
    if(tk&&ps.length>=2){ col=cleanColl(tk); const ix=ps.lastIndexOf(tk); if(ix>0) ps.splice(ix,1); nm=ps.join(' '); }
    else if(ps.length>=2&&cset.has(collKey(ps[ps.length-1]))){ col=cleanColl(ps[ps.length-1]); nm=ps.slice(0,-1).join(' '); }
    out.push({n:nm,a:num(last[0]),t,s,p:ph,c:col});
  }
  return out;
}
const PROMPT_W=[
 'אתה מחלץ נתונים מצילום מסך של רשימת חייבים לאיסוף יומי בעברית. כל שורה כוללת בדרך כלל שם חייב, סכום (₪) ושעת איסוף, ולפעמים גם טלפון והערות.',
 'החזר JSON בלבד, בלי הסבר, בדיוק בצורה הזו:',
 '{"items":[{"name":"שם","amount":1234,"time":"09:30","status":"","phone":"","collector":"","uncertain":false}],"note":""}',
 'כללים:',
 '- העתק כל שורה שמופיעה בתמונה, אחת לאחת ובסדר שבו היא מופיעה. אל תדלג על שורות, אל תאחד שורות ואל תוסיף שורות.',
 '- name הוא שם החייב בלבד, בלי טלפון ובלי הערות או הוראות.',
 '- amount הוא מספר בלבד, בלי ₪ ובלי פסיקים.',
 '- time הוא שעת האיסוף בפורמט 24 שעות HH:MM, למשל 09:30 או 14:00. אם כתוב רק מספר שעה כתוב אותו עם :00. אם כתוב טווח שעות החזר את שעת ההתחלה. אם כתוב בבוקר, בצהריים, אחר הצהריים או בערב המר ל-24 שעות. אם אין שעה בשורה החזר מחרוזת ריקה.',
 '- status הוא סטטוס השורה. אם במקום שעה (או לצד השעה) כתוב "לעבור" החזר בדיוק "לעבור". אם כתוב "נאסף" (או "נאספה") החזר בדיוק "נאסף". אם כתוב "לא נאסף" החזר בדיוק "לא נאסף". בכל מקרה אחר החזר מחרוזת ריקה. אל תכתוב את המילה הזו בתוך name, ואם במקום השעה כתוב מילה כזו החזר time ריק.',
 '- phone הוא מספר הטלפון של החייב אם הוא מופיע בשורה, בספרות בלבד (למשל 0501234567). אם אין טלפון בשורה החזר מחרוזת ריקה. אל תמציא ואל תנחש ספרות.',
 '- collector הוא שם הגובה שאוסף את הכסף מהחייב, אם הוא כתוב ליד החייב באותה שורה (למשל עידן או טאייה). אם אין שם גובה בשורה החזר מחרוזת ריקה. אל תכתוב את שם הגובה בתוך name.',
 '- אל תכלול שורות סיכום כמו "סה״כ".',
 '- אם שם, ספרה או שעה לא ברורים, כתוב את הניחוש הטוב ביותר וסמן uncertain:true. אל תמציא נתונים שלא נראים בתמונה.',
 '- אם אין בתמונה רשימת חייבים, החזר items ריק והסבר ב-note.'
].join('\n');
function normalizeW(res,im,uid){
  const out=[]; if(!res||typeof res!=='object'||!Array.isArray(res.items)) return out;
  for(const x of res.items){ if(!x||typeof x!=='object') continue;
    const n=String(x.name==null?'':x.name).trim(); if(!n||TOTAL_RE.test(n)) continue;
    const p=phShow(x.phone);
    const cc=cleanColl(x.collector); out.push({id:uid(),n,a:num(x.amount),t:normTime(x.time),s:normStatus(x.status)||normStatus(x.time),p,pm:p?'s':'',c:cc,cm:cc?'s':'',src:'צ'+im.no,u:!!x.uncertain}); }
  return out;
}
// מקור: שורות 2864-2871
const wDupKey=e=>normName(e.n)+'|'+num(e.a)+(e.pg?'|'+e.pg+'|'+(e.pp||''):'');
const wSameKey=e=>{const s=normStatus(e.s);return wDupKey(e)+'|'+(s||normTime(e.t));};
function wDupInfo(entries){
  const cnt=new Map(), same=new Map(); let removable=0;
  entries.forEach(e=>{ if(!normName(e.n)&&!num(e.a)) return; const k=wDupKey(e); cnt.set(k,(cnt.get(k)||0)+1); });
  entries.forEach(e=>{ if(!normName(e.n)&&!num(e.a)) return; const k=wSameKey(e); if(same.has(k)) removable++; else same.set(k,1); });
  return {cnt,removable};
}
// מקור: שורות 2931-2951
function wCollAcc(acc,name){
  const cn=v=>collKey(cleanColl(v.c)), pick=v=>name===NOC_SP?!cn(v):cn(v)===collKey(name);
  return {kind:'work',date:acc.date,coll:name,entries:(acc.entries||[]).filter(pick),expenses:(acc.expenses||[]).filter(pick)};
}
/* העתקה נפרדת לכל גובה: הבלוק של גובה אחד בלבד, כטקסט */
function wCollText(acc,name){
  const a=wCollAcc(acc,name), xs=wExpList(a), xt=sum(xs.map(x=>x.a)), c=calcWork((a.entries||[]).filter(e=>e&&(e.n||e.a)));
  const lines=['איסוף יומי – '+weekday(a.date)+' '+isoLabel(a.date), name+(c.count?' ('+c.count+')':'')];
  if(c.count){
    workLines(c,lines);
    lines.push('סה״כ '+name+': '+fmt(c.total)+' ₪');
    if(c.notGot.length) lines.push('לא נאסף: '+fmt(c.notTotal)+' ₪ ('+c.notGot.length+')');
    if(c.got.length){ lines.push('נאסף: '+fmt(c.gotTotal)+' ₪ ('+c.got.length+')'); lines.push('נותר לאסוף: '+fmt(c.left)+' ₪ ('+(c.count-c.got.length)+')'); }
  }
  if(xs.length){
    lines.push('', 'הוצאות '+name+':'); expLines(xs,lines,false);
    lines.push('סה״כ הוצאות: '+fmt(xt)+' ₪');
    if(c.count) lines.push('נטו '+name+': '+fmt(r2(c.total-xt))+' ₪');
  }
  return lines.join('\n');
}
// מקור: שורות 1868-1868
function lgx(e,keys){ const o={}; if(!e) return o; keys.forEach(k=>{ let v=e[k]; if(v===undefined||v===null||v==='') return; if(k==='ga'||k==='due'){ v=Math.round((+v||0)*100)/100; } else if(k==='nf'){ v=1; } else v=String(v).trim(); if(v!=='') o[k]=v; }); return o; }
// מקור: שורות 1867-1867
const LGF_W=['by','ga','pmt','nt','lk'], LGF_C=['by','due','pmt','nt','lk','nf'], LGF_X=['by','lk','nf'];
// מקור: שורות 1890-1890
const TOTAL_RE=/^(סה["״]?כ|סך הכל|סיכום|total)/i;
// מקור: שורות 1861-1861
const RSEAL='<span class="rseal" aria-hidden="true"><span>₪</span></span>';
// מקור: שורות 1856-1860
function fmt(n){
  n=r2(+n||0); const neg=n<0;
  const s=Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2});
  return (neg?'−':'')+s;
}
// מקור: שורה 2626 (wFillPhones) — אותו כלל: טלפון/גובה/קשה שהוזנו ידנית (או נשמרו) לא נדרסים.
// בשורה שמורה אין סימון pm/cm/hm, ולכן (כמו wFromSaved בשורה 3016) ערך קיים נחשב ״נשמר״ ולא מוחלף.
export function fillFromBook(entries){
  let n={p:0,c:0,h:0,amb:0,a:0};
  entries.forEach(e=>{
    if(!e||!normName(e.n)) return;
    if(!String(e.c||'').trim()){ const cc=collLookup(e.n); if(cc){ e.c=cc; n.c++; } }
    if(!normHard(e.h)){ const hh=hardLookup(e.n); if(hh){ e.h=hh; n.h++; } }
    if(String(e.p||'').trim()) return;
    const r=phLookup(e.n);
    if(r.p){ e.p=r.p; n.p++; if(r.pm==='a') n.a++; } else if(r.pm==='amb') n.amb++;
  });
  return n;
}
export { loansGivenHTML, nmTokens, nmKey, phbIngest, phLookup, collLookup, hardLookup, expLines, workLines, workText, expTableHTML, workTableHTML, workHTML, parseWorkText, PROMPT_W, normalizeW, wDupKey, wSameKey, wDupInfo, wCollAcc, wCollText, lgx, LGF_W, LGF_C, LGF_X, TOTAL_RE, RSEAL, fmt, money, isRealColl };
