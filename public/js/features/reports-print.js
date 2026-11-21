// חשבון מודפס (דוח), טקסט לשיתוף, השוואה לחשבון הקודם, PDF ושיתוף — הועתק מהתוכנה המקורית (app.html).
// הפונקציות שמייצרות את הדוח הועתקו כמו שהן; כל הסכומים מגיעים מפונקציות החישוב המקוריות ב-calc.js.
import { calcMorning, calcCollectors, calcSplit, calcWork, workGroups, wExpList, num, r2, sum, normName, cleanPh, ST_GOT, ST_NOT, ST_NA, ST_PASS, CHANGE, NOC_SP } from '../calc.js';
import { loadVendor } from '../registry.js';

// ---- עזרים מקוריים (app.html 1842, 1856-1862, 1871-1872, 9845, 1923-1924) ----
export const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function fmt(n){
  n=r2(+n||0); const neg=n<0;
  const s=Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2});
  return (neg?'−':'')+s;
}
export const RSEAL='<span class="rseal" aria-hidden="true"><span>₪</span></span>';
export const money=n=>'<span class="num'+(n<0?' neg':'')+'">'+fmt(n)+' ₪</span>';
export function isoLabel(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?m[3]+'.'+m[2]+'.'+m[1]:(iso||'');}
export function weekday(iso){try{return new Date(iso+'T12:00:00').toLocaleDateString('he-IL',{weekday:'long'});}catch(e){return '';}}
export const pctS=n=>String(Math.round(n*100)/100)+'%';
export const KL={morning:'חשבון בוקר',collectors:'חשבון גובים',split:'פיצול',work:'איסוף יומי'};
export const KC={morning:'',collectors:'c',split:'s',work:'w'};
// app.html 4814
export const origView=a=>a.kind==='split'?Object.assign({},a,{records:a.orig}):Object.assign({},a,a.orig);

/* ====================== printed account (HTML) — app.html 2030-2114 ====================== */
export function morningHTML(acc,opts){
  opts=opts||{}; const hit=opts.hit||(()=>false); const c=calcMorning(acc);
  const H=(n,a)=>hit(n,a)?' class="hit"':'';
  const wd=weekday(acc.date), dl=isoLabel(acc.date);
  const sec=(n,t,inner)=>'<section class="rs"><h3 class="rh"><span class="rn">'+n+'</span>'+esc(t)+'</h3>'+inner+'</section>';
  const coll=(rows,k,tot,tl)=>'<table class="rt"><thead><tr><th class="ix">#</th><th>לקוח</th><th class="a">סכום</th></tr></thead><tbody>'+
    (rows.length?rows.map((r,i)=>'<tr'+H(r.n,r[k])+'><td class="ix">'+(i+1)+'</td><td>'+esc(r.n||'(ללא שם)')+'</td><td class="a">'+money(r[k])+'</td></tr>').join(''):'<tr class="none"><td colspan="3">אין גבייה</td></tr>')+
    '</tbody><tfoot><tr class="tot"><td></td><td>'+tl+'</td><td class="a">'+money(tot)+'</td></tr></tfoot></table>';
  const calc=(rows,cls)=>'<table class="rt '+(cls||'slate')+'"><thead><tr><th>פריט</th><th class="a">סכום</th></tr></thead><tbody>'+
    rows.map(r=>'<tr class="'+(r[2]||'')+'"><td>'+esc(r[0])+'</td><td class="a">'+money(r[1])+'</td></tr>').join('')+'</tbody></table>';
  let h='<header class="rhead">'+RSEAL+'<div class="rht"><span class="rbrand">יומן חשבון בוקר</span><h2 class="rtitle">חשבון בוקר</h2><div class="rsub">'+esc(wd)+' · '+esc(dl)+'</div></div></header>';
  h+=sec(1,'גביית ריבית',coll(c.iRows,'i',c.interest,'סה״כ ריבית'));
  h+=sec(2,'גביית קרן',coll(c.pRows,'p',c.principal,'סה״כ קרן'));
  h+=sec(3,'חלוקת הריבית',calc([
    ['סה״כ ריבית (100%)',c.interest],['חלק רובי ('+pctS(c.rp)+')',c.robi],['חלק הקו ('+pctS(c.lp)+')',c.line],
    ['ניכוי משלוחים',-c.courier],['יתרת הקו לאחר משלוחים',c.lineRem,'hl']]));
  h+=sec(4,'בניית הקרן',calc([
    ['קרן שנגבתה',c.principal],['יתרת הקו לאחר משלוחים',c.lineRem],['קרן קיימת',c.keren],['סה״כ כל הקרנות',c.kerenTotal,'hl']]));
  const loansTbl='<table class="rt brown"><thead><tr><th class="ix">#</th><th>הלוואה</th><th class="a">סכום</th></tr></thead><tbody>'+
    (c.loans.length?c.loans.map((l,i)=>'<tr'+H(l.n,l.a)+'><td class="ix">'+(i+1)+'</td><td>'+esc(l.n||'(ללא שם)')+'</td><td class="a">'+money(l.a)+'</td></tr>').join(''):'<tr class="none"><td colspan="3">אין הלוואות היום</td></tr>')+
    '</tbody><tfoot><tr class="tot"><td></td><td>סה״כ הלוואות</td><td class="a">'+money(c.loansTotal)+'</td></tr></tfoot></table>';
  h+=sec(5,'הלוואות',loansTbl);
  h+=sec(6,'סיכום סופי','<table class="rt slate"><thead><tr><th>פריט</th><th class="a">סכום</th></tr></thead><tbody>'+
    '<tr><td>יתרת הקו לאחר משלוחים</td><td class="a">'+money(c.lineRem)+'</td></tr>'+
    '<tr><td>קרן שנגבתה</td><td class="a">'+money(c.principal)+'</td></tr>'+
    '<tr><td>קרן קיימת</td><td class="a">'+money(c.keren)+'</td></tr>'+
    '<tr class="hl"><td>סה״כ כל הקרנות</td><td class="a">'+money(c.kerenTotal)+'</td></tr>'+
    '<tr><td>ניכוי הלוואות</td><td class="a">'+money(-c.loansTotal)+'</td></tr>'+
    '<tr class="final'+(c.final<0?' negbg':'')+'"><td>סה״כ סופי</td><td class="a">'+money(c.final)+'</td></tr></tbody></table>');
  return h;
}
export function collectorsHTML(acc,opts){
  opts=opts||{}; const hit=opts.hit||(()=>false); const c=calcCollectors(acc.entries);
  const H=(n,a)=>hit(n,a)?' class="hit"':'';
  const wd=weekday(acc.date), dl=isoLabel(acc.date);
  let h='<header class="rhead">'+RSEAL+'<div class="rht"><span class="rbrand">יומן חשבון בוקר</span><h2 class="rtitle">חשבון גובים</h2><div class="rsub">'+esc(wd)+' · '+esc(dl)+'</div></div></header>';
  for(const g of c.groups){
    h+='<section class="cblock"><div class="cband"><span>'+esc(g.c)+'</span><span class="cbs">'+g.debts.length+' חובות'+(g.exps.length?' · '+g.exps.length+' הוצאות':'')+' · נטו '+money(g.net)+'</span></div>';
    h+='<table class="rt"><thead><tr><th class="ix">#</th><th>שם</th><th class="a">סכום</th></tr></thead><tbody>'+
      (g.debts.length?g.debts.map((d,i)=>'<tr'+H(d.n,d.a)+'><td class="ix">'+(i+1)+'</td><td>'+esc(d.n)+'</td><td class="a">'+money(d.a)+'</td></tr>').join(''):'<tr class="none"><td colspan="3">אין חובות</td></tr>')+
      '</tbody><tfoot><tr class="tot"><td></td><td>סה״כ חובות</td><td class="a">'+money(g.debtTotal)+'</td></tr></tfoot></table>';
    if(g.exps.length){
      h+='<table class="rt brown"><thead><tr><th class="ix">#</th><th>הוצאה</th><th class="a">סכום</th></tr></thead><tbody>'+
        g.exps.map((d,i)=>'<tr'+H(d.n,d.a)+'><td class="ix">'+(i+1)+'</td><td>'+esc(d.n)+'</td><td class="a">'+money(d.a)+'</td></tr>').join('')+
        '</tbody><tfoot><tr class="tot"><td></td><td>סה״כ הוצאות</td><td class="a">'+money(g.expTotal)+'</td></tr></tfoot></table>';
    } else h+='<p class="none">אין הוצאות לגובה זה</p>';
    h+='<table class="rt slate"><tbody><tr class="hl"><td>נטו (חובות פחות הוצאות)</td><td class="a">'+money(g.net)+'</td></tr></tbody></table></section>';
  }
  if(!acc.coll) h+='<section class="rs"><h3 class="rh">סיכום כללי</h3><table class="rt slate"><thead><tr><th>גובה</th><th class="a">סה״כ חובות</th><th class="a">נטו</th></tr></thead><tbody>'+
    c.groups.map(g=>'<tr><td>'+esc(g.c)+'</td><td class="a">'+money(g.debtTotal)+'</td><td class="a">'+money(g.net)+'</td></tr>').join('')+
    '</tbody><tfoot><tr class="tot"><td>סה״כ כללי</td><td class="a">'+money(c.totalDebts)+'</td><td class="a">'+money(c.totalNet)+'</td></tr></tfoot></table></section>';
  if(!acc.coll&&c.dups.length) h+='<div class="rnote"><b>שמות שמופיעים אצל יותר מגובה אחד:</b> '+c.dups.map(d=>esc(d.n)+' ('+d.cs.map(esc).join(', ')+')').join(' · ')+'. הסכומים נשארו כפי ששויכו.</div>';
  if(!acc.coll&&c.noCollector) h+='<div class="rnote"><b>יש שורות ללא שם גובה.</b> כדאי להשלים אותן לפני שליחה.</div>';
  return h;
}
export const reportHTML=(acc,opts)=>acc.kind==='morning'?morningHTML(acc,opts):(acc.kind==='split'?splitHTML(acc,opts):(acc.kind==='work'?workHTML(acc,opts):collectorsHTML(acc,opts)));
export function shareText(acc){
  const dl=isoLabel(acc.date);
  if(acc.kind==='work') return workText(acc);
  if(acc.kind==='split'){const sc=calcSplit(acc.records||[]);return 'פיצול '+dl+'\n'+sc.blocks.filter(b=>!b.special).map(b=>b.c+': '+fmt(b.total)+' ₪').join('\n')+'\nסה״כ: '+fmt(sc.grand)+' ₪';}
  if(acc.kind==='morning') return 'חשבון בוקר '+dl+'\nסה״כ סופי: '+fmt(calcMorning(acc).final)+' ₪';
  const c=calcCollectors(acc.entries);
  if(acc.coll&&c.groups.length===1){const g=c.groups[0]; return 'חשבון גובים · '+g.c+' · '+dl+'\nחובות: '+fmt(g.debtTotal)+' ₪\nהוצאות: '+fmt(g.expTotal)+' ₪\nנטו: '+fmt(g.net)+' ₪';}
  return 'חשבון גובים '+dl+'\nסה״כ חובות: '+fmt(c.totalDebts)+' ₪\nנטו: '+fmt(c.totalNet)+' ₪';
}
export function headline(acc){
  if(acc.kind==='work') return {label:'סה״כ',val:calcWork(acc.entries||[]).total};
  if(acc.kind==='split') return {label:'סה״כ גובים',val:calcSplit(acc.records||[]).grand};
  if(acc.kind==='morning') return {label:'סה״כ סופי',val:calcMorning(acc).final};
  return {label:'נטו',val:calcCollectors(acc.entries).totalNet};
}
export function linesOf(acc){
  const out=[];
  if(acc.kind==='split'){ for(const r of acc.records||[]) out.push({n:r.n,a:r.a,t:'פיצול',c:r.c,note:r.note}); return out; }
  if(acc.kind==='work'){ for(const e of acc.entries||[]) out.push({n:e.n,a:e.a,t:'איסוף',c:e.s||e.t||'',note:e.p||''}); for(const x of acc.expenses||[]) out.push({n:x.n,a:x.a,t:'הוצאה',c:x.c||''}); return out; }
  if(acc.kind==='morning'){
    for(const r of acc.rows||[]){ if(r.i) out.push({n:r.n,a:r.i,t:'ריבית'}); if(r.p) out.push({n:r.n,a:r.p,t:'קרן'}); }
    for(const l of acc.loans||[]) out.push({n:l.n,a:l.a,t:'הלוואה'});
  } else {
    for(const e of acc.entries||[]) out.push({n:e.n,a:e.a,t:e.k==='e'?'הוצאה':'חוב',c:e.c});
  }
  return out;
}

/* mCompareHTML — app.html 2291. במקור הרשימה היא S.s.list והחשבון הנערך S.m.editId; כאן הם מועברים כפרמטרים */
export function mCompareHTML(acc,list){
  const prev=(list||[]).filter(a=>a&&a.kind==='morning'&&a.id!==acc.id&&a.date&&a.date<acc.date).sort((x,y)=>String(y.date).localeCompare(String(x.date))||((y.createdAt||0)-(x.createdAt||0)))[0];
  if(!prev) return '';
  const c=calcMorning(acc), p=calcMorning(prev);
  const d=(a,b)=>{const x=r2(a-b);return '<span class="num'+(x<0?' neg':'')+'">'+(x>=0?'+':'')+fmt(x)+' ₪</span>';};
  return '<section class="rs" id="m-yday"><h3 class="rh">לעומת החשבון הקודם ('+esc(isoLabel(prev.date))+')</h3><table class="rt slate"><thead><tr><th>פריט</th><th class="a">היום</th><th class="a">קודם</th><th class="a">הפרש</th></tr></thead><tbody>'+
    [['ריבית',c.interest,p.interest],['קרן שנגבתה',c.principal,p.principal],['הלוואות',c.loansTotal,p.loansTotal],['משלוחים',c.courier,p.courier],['סה״כ סופי',c.final,p.final]].map(r=>'<tr><td>'+r[0]+'</td><td class="a">'+money(r[1])+'</td><td class="a">'+money(r[2])+'</td><td class="a">'+d(r[1],r[2])+'</td></tr>').join('')+
    '</tbody></table></section>';
}

/* ---- איסוף יומי: טקסט ודוח — app.html 2667-2745 ---- */
const expLines=(xl,lines,withC)=>xl.forEach(x=>lines.push('• '+x.n+' – '+fmt(x.a)+' ₪'+(withC&&x.c?' – '+x.c:'')));
function workLines(c,lines){
  c.rows.forEach((r,i)=>{ if(c.noAns&&c.noAns.length){ if(i===0) lines.push('— לא ענו —'); else if(i===c.noAns.length) lines.push('— לפי שעה —'); } lines.push((i+1)+'. '+r.n+(r.pp?' (חלק '+r.pp+')':'')+' – '+fmt(r.a)+' ₪'+(r.s?' – '+r.s+(r.ga!==null&&r.ga!==undefined&&Math.abs(r.ga-r.a)>0.004?' '+fmt(r.ga)+' ₪ (חלקי)':''):(r.t?' – '+r.t:''))+(r.p?' – '+r.p:'')+(r.h?' – '+(r.h==='קשה'?'🔴 קשה':'🟢 לא קשה'):''));});
}
export function workText(acc){
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
  const row=r=>{n++;const cl=(r.s===ST_GOT?'done':'')+(opts&&opts.hit&&opts.hit(r.n,r.a)?' hit':'');return '<tr'+(cl.trim()?' class="'+cl.trim()+'"':'')+'><td class="ix">'+n+'</td><td>'+esc(r.n)+(r.pp?' <span class="stl part">חלק <span class="num">'+esc(r.pp)+'</span></span>':'')+(r.h?' <span class="stl '+(r.h==='קשה'?'hard':'easy')+'">'+esc(r.h)+'</span>':'')+(r.p?'<div class="phl"><span class="num">'+esc(r.p)+'</span></div>':'')+'</td><td class="a">'+money(r.a)+'</td><td class="a">'+lbl(r)+'</td></tr>';};
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
export function workHTML(acc,opts){
  const es=acc.entries||[], xs=wExpList(acc), xt=sum(xs.map(x=>x.a)), c=calcWork(es), gs=workGroups(es,xs);
  let h='<header class="rhead">'+RSEAL+'<div class="rht"><span class="rbrand">יומן חשבון בוקר</span><h2 class="rtitle">רשימת חייבים · איסוף יומי</h2><div class="rsub">'+esc(weekday(acc.date))+' · '+esc(isoLabel(acc.date))+'</div></div></header>';
  if(!gs) return h+(c.count?'<section class="rs">'+workTableHTML(c,opts)+'</section>':'')+(xs.length?'<section class="rs">'+expTableHTML(xs,xt,c.count?r2(c.total-xt):null,true)+'</section>':'');
  h+=gs.map(g=>'<section class="cblock"><div class="cband"><span>'+esc(g.name)+'</span>'+(g.calc.count?'<span class="cbs">'+g.calc.count+' חייבים · '+money(g.calc.total)+'</span>':'')+'</div>'+(g.calc.count?workTableHTML(g.calc,opts):'')+(g.exp.length?expTableHTML(g.exp,g.expTotal,g.calc.count?g.net:null,false):'')+'</section>').join('');
  h+='<section class="rs"><table class="rt"><tbody><tr class="tot"><td>סה״כ כללי ('+c.count+' חייבים)</td><td class="a">'+money(c.total)+'</td></tr>'+
    (c.notGot.length?'<tr class="tot2"><td>לא נאסף ('+c.notGot.length+')</td><td class="a">'+money(c.notTotal)+'</td></tr>':'')+
    (c.got.length?'<tr class="tot2"><td>נאסף ('+c.got.length+')</td><td class="a">'+money(c.gotTotal)+'</td></tr><tr class="tot2"><td>נותר לאסוף ('+(c.count-c.got.length)+')</td><td class="a">'+money(c.left)+'</td></tr>':'')+
    (xs.length?'<tr class="tot2"><td>סה״כ הוצאות ('+xs.length+')</td><td class="a">'+money(xt)+'</td></tr><tr class="tot2"><td>נטו כללי (סה״כ חובות פחות הוצאות)</td><td class="a">'+money(r2(c.total-xt))+'</td></tr>':'')+'</tbody></table></section>';
  return h;
}

/* ---- פיצול: דוח — app.html 3403-3404, 3831, 3430-3456 ---- */
const blockTitle=b=>b.c===CHANGE?'לשנות במערכת':(b.c===NOC_SP?'ללא גובה (להשלים)':b.c);
const partChip=pp=>pp?' <span class="spl" title="חלק של חוב שפוצל">חלק <span class="num">'+esc(pp)+'</span></span>':'';
function lineParts(r,wp){const ph=cleanPh(r.ph);return esc(r.n)+partChip(r.pp)+' – '+money(num(r.a))+(wp&&ph?' – <span class="num">'+esc(ph)+'</span>':'')+(r.note?' – '+esc(r.note):'');}
export function splitHTML(acc,opts){
  opts=opts||{}; const hit=opts.hit||(()=>false); const c=calcSplit(acc.records||[]), phones=acc.phones||[];
  let h='<header class="rhead">'+RSEAL+'<div class="rht"><span class="rbrand">יומן חשבון בוקר</span><h2 class="rtitle">פיצול גובים</h2><div class="rsub">'+esc(weekday(acc.date))+' · '+esc(isoLabel(acc.date))+'</div></div></header>';
  for(const b of c.blocks){
    const wp=phones.indexOf(b.c)>=0;
    h+='<section class="cblock"><div class="cband"><span>'+esc(blockTitle(b))+'</span><span class="cbs">'+b.count+' שורות · '+money(b.total)+'</span></div>';
    for(const x of b.sections){
      if(x.t) h+='<div class="rgrp '+x.cls+'">'+esc(x.t)+'</div>';
      h+=x.rows.map((r,i)=>'<div class="rl'+(hit(r.n,r.a)?' hit':'')+'">'+(i+1)+'. '+lineParts(r,wp)+'</div>').join('');
      if(b.sections.length>1) h+='<div class="rl tot2">סה״כ '+esc(x.t)+': '+money(x.total)+'</div>';
    }
    h+='<div class="rl tot">סה״כ '+esc(blockTitle(b))+': '+money(b.total)+'</div></section>';
  }
  if(c.sides.length){
    h+='<section class="cblock"><div class="cband brown"><span>לא נגבים היום</span><span class="cbs">'+c.sides.length+' שורות</span></div>'+
      c.sides.map((r,i)=>'<div class="rl'+(hit(r.n,r.a)?' hit':'')+'">'+(i+1)+'. '+esc(r.n)+' – '+money(num(r.a))+(r.c?' ('+esc(r.c)+')':'')+(r.note?' – '+esc(r.note):'')+'</div>').join('')+
      '<div class="rl tot">סה״כ '+money(c.sideTotal)+'</div></section>';
  }
  h+='<section class="rs"><h3 class="rh">סיכום</h3><table class="rt slate"><thead><tr><th>גובה</th><th class="a">סה״כ</th></tr></thead><tbody>'+
    c.blocks.filter(b=>!b.special).map(b=>'<tr><td>'+esc(b.c)+'</td><td class="a">'+money(b.total)+'</td></tr>').join('')+
    '</tbody><tfoot><tr class="tot"><td>סה״כ כללי (גובים)</td><td class="a">'+money(c.grand)+'</td></tr>'+
    ((c.sides.length||c.specialTotal)?'<tr><td>סה״כ כולל צדדיים, שורות לשינוי ושורות בלי גובה</td><td class="a">'+money(c.all)+'</td></tr>':'')+
    '</tfoot></table></section>';
  if(c.dups.length) h+='<div class="rnote"><b>שמות שמפוצלים בין כמה גובים:</b> '+c.dups.map(d=>esc(d.n)+' ('+d.cs.map(esc).join(', ')+')').join(' · ')+'. הסכומים נשארו כפי שנכתבו.</div>';
  return h;
}

/* ====================== PDF + WhatsApp — app.html 5179-5237 ====================== */
function stageEl(){ let s=document.getElementById('pdf-stage'); if(!s){ s=document.createElement('div'); s.id='pdf-stage'; document.body.appendChild(s); } return s; }
export async function buildPdf(html,acc){
  await Promise.all([loadVendor('html2canvas.min.js'),loadVendor('jspdf.umd.min.js')]);
  const stage=stageEl(); stage.innerHTML='<article class="report">'+html+'</article>';
  try{
    try{ await document.fonts.ready; }catch(e){}
    const W=794, sRect=stage.getBoundingClientRect(), totalH=Math.ceil(stage.scrollHeight);
    const cand=[];
    stage.querySelectorAll('tbody tr, tfoot tr, .rl').forEach(tr=>cand.push(tr.getBoundingClientRect().bottom-sRect.top));
    stage.querySelectorAll('.rs, .cblock').forEach(s=>cand.push(s.getBoundingClientRect().top-sRect.top));
    cand.sort((a,b)=>a-b);
    const scale=Math.max(1,Math.min(2,Math.sqrt(14e6/(W*totalH))));
    const canvas=await window.html2canvas(stage,{scale,backgroundColor:'#ffffff',useCORS:true,logging:false});
    const k=canvas.width/W, pageH=W*(277/190);
    const slices=[]; let y=0;
    while(y<totalH-1){
      const limit=y+pageH;
      if(limit>=totalH){slices.push([y,totalH]);break;}
      let b=0; for(const c of cand){ if(c>y+pageH*0.35&&c<=limit) b=c; }
      if(!b) b=limit; slices.push([y,b]); y=b;
    }
    const {jsPDF}=window.jspdf; const pdf=new jsPDF({unit:'mm',format:'a4',orientation:'p'});
    slices.forEach((s,i)=>{
      const sy=Math.round(s[0]*k), sh=Math.max(1,Math.round((s[1]-s[0])*k));
      const pc=document.createElement('canvas'); pc.width=canvas.width; pc.height=sh;
      const ctx=pc.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,pc.width,sh); ctx.drawImage(canvas,0,sy,canvas.width,sh,0,0,canvas.width,sh);
      if(i) pdf.addPage();
      pdf.addImage(pc.toDataURL('image/jpeg',0.92),'JPEG',10,10,190,(s[1]-s[0])*(190/W));
    });
    const name=(acc.kind==='morning'?'חשבון-בוקר-':(acc.kind==='report'?'דוח-תקופה-':(acc.kind==='split'?'פיצול-גובים-':(acc.kind==='work'?'איסוף-יומי-'+(acc.coll?String(acc.coll).replace(/[\\\/:*?"<>|\s]+/g,'-')+'-':''):'חשבון-גובים-'+(acc.coll?String(acc.coll).replace(/[\\\/:*?"<>|\s]+/g,'-')+'-':'')))))+isoLabel(acc.date)+'.pdf';
    return {blob:pdf.output('blob'),name};
  } finally { stage.innerHTML=''; }
}
let lastPdf=null;
function download(blob,name){ const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),30000); }
function shareHelp(name,text,saved,msg){
  return '<div class="note '+(saved?'ok':'info')+'">'+esc(msg||(saved?'הקובץ '+name+' נשמר.':'הקובץ מוכן.'))+' כדי לשלוח בוואטסאפ: פתח את השיחה וצרף את הקובץ.</div>'+
    '<div class="row"><a class="btn wa" href="https://wa.me/?text='+encodeURIComponent(text)+'" target="_blank" rel="noopener">פתח וואטסאפ עם ההודעה</a>'+
    '<button class="btn ghost" type="button" data-resave="1">שמור את ה-PDF שוב</button></div>';
}
// במקור: שיתוף מערכת אם אפשר, אחרת שמירת קובץ דרך יכולת ההורדה של Claude; כאן: הורדה רגילה מהדפדפן
export async function sharePdf(html,acc,text,box,btn){
  const prev=btn.textContent; btn.disabled=true; btn.textContent='מכין PDF…'; box.innerHTML='';
  try{
    const {blob,name}=await buildPdf(html,acc);
    lastPdf={blob,name,text};
    const file=new File([blob],name,{type:'application/pdf'});
    try{
      if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file],text}); box.innerHTML='<div class="note ok">נפתח חלון השיתוף.</div>'; return; }
    }catch(e){ if(e&&e.name==='AbortError') return; }
    download(blob,name); box.innerHTML=shareHelp(name,text,true);
    const rb=box.querySelector('[data-resave]'); if(rb) rb.onclick=()=>{ if(lastPdf) download(lastPdf.blob,lastPdf.name); };
  }catch(e){
    box.innerHTML='<div class="note err">לא הצלחתי ליצור PDF. '+esc(e&&e.message||'')+'</div>';
  }finally{ btn.disabled=false; btn.textContent=prev; }
}

/* ---- עיצוב החשבון המודפס — app.html 241-291, 365, 377-383, 405-407, 418, 891-897. נשאר בהיר בשני מצבי התצוגה, זה מסמך ---- */
export const REPORT_CSS=`
.report,#pdf-stage{--paper:#ffffff;--ink:#16223a;--ink-muted:#5a6678;--rline:#cfd6df;--zebra:#f4f6fa;
  --r-blue:#1d3f6e;--r-brown:#7a4a1c;--r-slate:#3a4a60;--r-green:#17603f;--r-hl:#fbf1d6;--r-neg:#b3261e;--r-hit:#ffd978;
  --r-band:#0f2444;--r-band2:#183560;--r-band-fg:#ffffff;--r-band-muted:#c3cfe2;--r-gold:#b8913f;--r-note-fg:#4d3a08;
  --r-tint:#e9eff7;--r-tint-slate:#eceff4;--r-tint-brown:#f5ece2;--ff-ui:var(--ff);--ff-display:var(--ff);--ff-num:var(--ff)}
.report{background:var(--paper);color:var(--ink);border:1px solid var(--rline);border-radius:10px;padding:20px 20px 16px;font-family:var(--ff-ui);font-size:14px;line-height:1.45;direction:rtl;min-width:0;box-shadow:var(--shadow);display:flow-root}
.report *{box-sizing:border-box}
.report .rhead{display:flex;align-items:center;gap:14px;background:linear-gradient(160deg,var(--r-band2),var(--r-band) 65%);color:var(--r-band-fg);border-radius:8px;padding:16px 18px;border-bottom:3px solid var(--r-blue)}
.report .rseal{flex:none;width:46px;height:46px;border-radius:50%;border:1.5px solid var(--r-gold);display:flex;align-items:center;justify-content:center}
.report .rseal span{width:36px;height:36px;border-radius:50%;border:1px dashed var(--r-gold);display:flex;align-items:center;justify-content:center;color:var(--r-gold);font-family:var(--ff-num);font-weight:600;font-size:18px;line-height:1}
.report .rht{display:flex;flex-direction:column;gap:2px;min-width:0}
.report .rbrand{font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--r-gold)}
.report .rtitle{font-family:var(--ff-display);font-weight:700;font-size:26px;margin:0;line-height:1.15;color:var(--r-band-fg)}
.report .rsub{color:var(--r-band-muted);font-size:13.5px}
.report:has(.rhead)::after{content:"יומן חשבון בוקר · מסמך פנימי";display:block;margin-top:20px;padding-top:8px;border-top:1px solid var(--rline);font-size:11px;letter-spacing:.04em;color:var(--ink-muted);text-align:center}
.report .rs{margin-top:22px}
.report .rh{display:flex;align-items:center;gap:8px;font-family:var(--ff-display);font-size:17px;font-weight:700;margin:0 0 8px;color:var(--r-blue)}
.report .rn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--r-blue);color:var(--r-band-fg);font-family:var(--ff-num);font-size:12.5px;font-weight:700}
.report table.rt{width:100%;border-collapse:collapse;font-size:14px;color:var(--ink)}
.report .rt th{background:var(--r-tint);color:var(--r-blue);font-weight:700;font-size:12.5px;padding:8px 10px;text-align:right;border-bottom:2px solid var(--r-blue)}
.report .rt.slate th{background:var(--r-tint-slate);color:var(--r-slate);border-bottom-color:var(--r-slate)}
.report .rt.brown th{background:var(--r-tint-brown);color:var(--r-brown);border-bottom-color:var(--r-brown)}
.report .rt td{padding:7px 10px;border-bottom:1px solid var(--rline);background:var(--paper)}
.report .rt tbody tr:nth-child(even):not(.hl):not(.final):not(.tot):not(.hit) td{background:var(--zebra)}
.report .rt .ix{width:38px;text-align:center;color:var(--ink-muted);font-family:var(--ff-num);font-size:12.5px}
.report .rt th.a,.report .rt td.a{text-align:left;white-space:nowrap}
.report .rt tr.tot td{font-weight:700;border-top:2px solid var(--r-blue);border-bottom:0;background:var(--r-tint)}
.report .rt.brown tr.tot td{border-top-color:var(--r-brown);background:var(--r-tint-brown)}
.report .rt.slate tr.tot td{border-top-color:var(--r-slate);background:var(--r-tint-slate)}
.report .rt tbody tr.hl td{background:var(--r-hl);color:var(--ink);font-weight:700;border-top:1px solid var(--r-gold);border-bottom:1px solid var(--r-gold)}
.report .rt tbody tr.final td{background:var(--r-green);color:#fff;font-weight:700;font-size:17px;border-bottom:0}
.report .rt tbody tr.final.negbg td{background:var(--r-neg)}
.report .rt tr.hit td{background:var(--r-hit)!important;font-weight:700}
.report .rt tr.none td{text-align:center;color:var(--ink-muted)}
.report .rt tbody tr.done td{color:var(--ink-muted)}
.report .rt .phl{font-size:12px;color:var(--ink-muted);line-height:1.25;max-width:22ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.report .rt tr.tot2 td{font-weight:700;border-top:1px solid var(--rline);background:var(--zebra)}
.report .rt .stl{display:inline-block;font-weight:700;font-size:12px;border-radius:10px;padding:1px 10px;white-space:nowrap}
.report .rt .stl.pass{background:#fff1bd;color:#4d3a08}
.report .rt .stl.got{background:#dcefe6;color:#14573f}
.report .rt .stl.hard{background:#fbe0dd;color:#8c1d16}
.report .rt .stl.easy{background:#dcefe6;color:#14573f}
.report .rt .stl.na{background:#dde7f5;color:#1f3f6e}
.report .rt .stl.part{background:#e1e9f6;color:#163e73}
.report .num{direction:ltr;unicode-bidi:isolate;display:inline-block;font-variant-numeric:tabular-nums;font-family:var(--ff-num)}
.report .num.neg{color:var(--r-neg)}
.report .rt tbody tr.final .num,.report .rt tbody tr.final .num.neg{color:#fff}
.report .cblock{margin-top:26px}
.report .cband{display:flex;align-items:center;justify-content:space-between;gap:4px 12px;flex-wrap:wrap;color:var(--r-blue);font-family:var(--ff-display);font-weight:700;font-size:20px;line-height:1.2;padding:0 2px 7px;border-bottom:2px solid var(--r-blue)}
.report .cband>span:first-child{display:flex;align-items:center;gap:9px}
.report .cband>span:first-child::before{content:"";flex:none;width:10px;height:10px;border-radius:50%;background:var(--r-gold)}
.report .cband .cbs{font-family:var(--ff-ui);font-size:13px;font-weight:600;color:var(--ink-muted)}
.report .cband.brown{color:var(--r-brown);border-bottom-color:var(--r-brown)}
.report .cblock table.rt{margin-top:10px}
.report .cblock p.none{margin:8px 0 0;color:var(--ink-muted);font-size:13px}
.report .rnote{border:1px solid var(--r-gold);border-radius:6px;background:var(--r-hl);color:var(--r-note-fg);padding:8px 12px;font-size:13px;margin-top:16px}
.report .rnote b{font-weight:700}
.report .spl{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:700;border-radius:10px;padding:0 8px;background:#e1e9f6;color:#163e73;white-space:nowrap;line-height:1.7;vertical-align:middle}
.report .rl{padding:4px 2px;border-bottom:1px dotted var(--rline);color:var(--ink);font-variant-numeric:tabular-nums}
.report .rl.tot{font-weight:700;border-bottom:0;border-top:2px solid var(--r-blue);margin-top:4px;padding-top:6px}
.report .rl.tot2{font-weight:600;color:var(--ink-muted)}
.report .rl.hit{background:var(--r-hit);font-weight:700}
.report .rgrp{font-weight:700;margin-top:10px;color:var(--ink)}
.report .rgrp.hard{color:var(--r-neg)}
.report .rgrp.easy{color:var(--r-green)}
.report #m-yday{margin-top:22px}
#pdf-stage{position:absolute;left:-10000px;top:0;width:794px;background:#fff;direction:rtl}
#pdf-stage .report{border:0;border-radius:0;box-shadow:none;padding:26px 28px;width:794px}
#pdf-stage .num{font-variant-numeric:normal}
@media (max-width:520px){
  .report{padding:16px 12px}
  .report .rtitle{font-size:21px}
  .report .rhead{padding:14px;gap:10px}
  .report .rseal{width:40px;height:40px}
  .report .rseal span{width:31px;height:31px;font-size:16px}
  .report .rt td,.report .rt th{padding:6px 7px}
}
@media print{.report{box-shadow:none;border:0;padding:0}}
`;
