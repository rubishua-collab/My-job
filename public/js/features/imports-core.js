// קליטת קבצים — פונקציות טהורות שהועתקו כמו שהן מהתוכנה המקורית (app.html). מספרי השורות במקור מצוינים ליד כל פונקציה.
// השינויים היחידים: מצב גלובלי (S.m / S.sp / store) הוחלף בפרמטרים, וטעינת SheetJS נעשית מהעותק המקומי.
import { num, r2, sum, normName, normTime, cleanPh, waPhone, phShow, cleanColl, collKey, CHANGE, NOC_SP, isSagi } from '../calc.js';
import { loadVendor } from '../registry.js';

export const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
// מקור: 1890
export const TOTAL_RE=/^(סה["״]?כ|סך הכל|סיכום|total)/i;
const fmt = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ====================== morning: reading the income report (מקור 2115-2273) ====================== */
export function parseSpreadsheetML(xml){
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('הקובץ אינו XML תקין');
  const NS='urn:schemas-microsoft-com:office:spreadsheet';
  const els=(p,n)=>{const a=p.getElementsByTagNameNS(NS,n);return a.length?Array.from(a):Array.from(p.getElementsByTagName(n));};
  const at=(e,n)=>e.getAttributeNS(NS,n)||e.getAttribute('ss:'+n)||'';
  const out=[];
  for(const ws of els(doc,'Worksheet')){
    const rows=[];
    for(const row of els(ws,'Row')){
      const ri=at(row,'Index'); if(ri) while(rows.length<(+ri)-1) rows.push([]);
      const arr=[]; let col=0;
      for(const cell of els(row,'Cell')){
        const ci=at(cell,'Index'); if(ci) col=(+ci)-1;
        const d=els(cell,'Data')[0];
        arr[col]=d?d.textContent:'';
        col+=1+(+at(cell,'MergeAcross')||0);
      }
      rows.push(arr);
    }
    out.push(rows);
  }
  return out;
}
export function parseHtmlTables(text){
  const doc=new DOMParser().parseFromString(text,'text/html');
  return Array.from(doc.querySelectorAll('table')).map(t=>Array.from(t.querySelectorAll('tr')).map(tr=>{
    const arr=[]; Array.from(tr.children).forEach(td=>{arr.push(td.textContent);for(let k=1;k<(+td.getAttribute('colspan')||1);k++)arr.push('');}); return arr;}));
}
// file = File/Blob. תוספת: קובץ CSV (טקסט פשוט) מפוענח כ-UTF-8 (או windows-1255) לפני SheetJS, כדי שעברית לא תשתבש
export async function readTables(file){
  const buf=await file.arrayBuffer(); const u8=new Uint8Array(buf);
  const isZip=u8[0]===0x50&&u8[1]===0x4b, isOle=u8[0]===0xD0&&u8[1]===0xCF;
  const head=new TextDecoder('windows-1252').decode(u8.slice(0,500));
  if(!isZip&&!isOle&&/<\?xml|<Workbook|<html|<table|<!DOCTYPE/i.test(head)){
    const m=head.match(/encoding\s*=\s*["']([\w-]+)["']/i)||head.match(/charset\s*=\s*["']?([\w-]+)/i);
    let text; try{text=new TextDecoder((m&&m[1])||'utf-8').decode(u8);}catch(e){text=new TextDecoder('utf-8').decode(u8);}
    if(/<Workbook|urn:schemas-microsoft-com:office:spreadsheet|<Worksheet/i.test(text.slice(0,6000))) return parseSpreadsheetML(text);
    return parseHtmlTables(text);
  }
  await loadVendor('xlsx.full.min.js');
  if(!isZip&&!isOle&&!u8.slice(0,4096).includes(0)) return readCsvText(decodeText(u8));
  const wb=window.XLSX.read(buf,{type:'array'});
  return wb.SheetNames.map(n=>window.XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''}));
}
function decodeText(u8){
  try{ return new TextDecoder('utf-8',{fatal:true}).decode(u8); }catch(e){ return new TextDecoder('windows-1255').decode(u8); }
}
// טקסט CSV (מקובץ או מגיליון Google) → טבלאות, באותו מבנה כמו readTables
export async function readCsvText(text){
  await loadVendor('xlsx.full.min.js');
  const wb=window.XLSX.read(String(text).replace(/^﻿/,''),{type:'string',raw:false});
  return wb.SheetNames.map(n=>window.XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''}));
}
export const cell=v=>String(v==null?'':v).replace(/[‎‏]/g,'').replace(/\s+/g,' ').trim();
export function findHeader(rows){
  for(let r=0;r<Math.min(rows.length,60);r++){
    const cs=Array.from(rows[r]||[],cell);
    const ip=cs.findIndex(c=>c.includes('תשלום ריבית')), pp=cs.findIndex(c=>c.includes('תשלום קרן'));
    if(ip>=0&&pp>=0){
      let n=cs.findIndex(c=>/שם/.test(c)); if(n<0) n=cs.findIndex(c=>/לקוח/.test(c));
      if(n<0||n===ip||n===pp) n=cs.findIndex((c,i)=>c&&i!==ip&&i!==pp);
      n=Math.max(0,n);
      /* separate surname + first-name columns: n = surname, n2 = first name; the full name is "פרטי משפחה" */
      const lnI=cs.findIndex(c=>/שם משפחה/.test(c)), fnI=cs.findIndex(c=>/שם פרטי/.test(c));
      let n2=-1;
      if(lnI>=0&&fnI>=0&&lnI!==fnI&&lnI!==ip&&lnI!==pp&&fnI!==ip&&fnI!==pp){ n=lnI; n2=fnI; }
      return {r,ip,pp,n,n2};
    }
  }
  return null;
}
export function extractRows(raw,hdrRow,map){
  /* A row with money is never dropped silently: a row without a name counts as a client
     ("(ללא שם)") unless it is recognisably a totals row (equals the running sum, or is the very
     last money row after the last named client). */
  const lnOf=row=>cell(row[map.n]), fnOf=row=>map.n2>=0?cell(row[map.n2]):'';
  const nameOf=row=>[fnOf(row),lnOf(row)].filter(Boolean).join(' ');
  const isTotName=row=>TOTAL_RE.test(lnOf(row))||TOTAL_RE.test(fnOf(row));
  const P=row=>map.p>=0?num(row[map.p]):0, I=row=>map.i>=0?num(row[map.i]):0;
  const out=[]; let fileTotals=null, unnamed=0, lastNamed=-1, lastMoney=-1;
  for(let r=hdrRow+1;r<raw.length;r++){
    const row=raw[r]||[]; if(!(P(row)||I(row))) continue;
    lastMoney=r; if(nameOf(row)&&!isTotName(row)) lastNamed=r;
  }
  let gP=0,gI=0,aP=0,aI=0;
  const same=(p,i,x,y)=>Math.abs(p-x)<0.01&&Math.abs(i-y)<0.01&&(x||y);
  for(let r=hdrRow+1;r<raw.length;r++){
    const row=raw[r]||[]; const name=nameOf(row), p=P(row), i=I(row);
    if(!p&&!i) continue;
    if(name&&isTotName(row)){ fileTotals={p,i}; gP=0;gI=0; continue; }
    if(!name){
      if(same(p,i,aP,aI)){ fileTotals={p,i}; gP=0;gI=0; continue; }
      if(same(p,i,gP,gI)){ gP=0;gI=0; continue; }
      if(r===lastMoney&&r>lastNamed){ fileTotals={p,i}; continue; }
      out.push({n:'(ללא שם)',p,i}); unnamed++; gP+=p; gI+=i; aP+=p; aI+=i; continue;
    }
    out.push({n:name,p,i}); gP+=p; gI+=i; aP+=p; aI+=i;
  }
  return {rows:out,unnamed,fileTotals};
}
// מקור: mCheckMsg 2186 (ft = S.m.fileTotals)
export function mCheckMsg(acc,ft){
  if(!ft||!acc.rows.length) return '';
  const pS=sum(acc.rows.map(r=>r.p)), iS=sum(acc.rows.map(r=>r.i)), dp=r2(ft.p-pS), di=r2(ft.i-iS);
  if(Math.abs(dp)<0.01&&Math.abs(di)<0.01) return '';
  return '⚠ הסכומים לא תואמים לשורת הסיכום שבקובץ. '+
    (Math.abs(dp)>=0.01?'קרן: בקובץ '+fmt(ft.p)+' ₪, בחשבון '+fmt(pS)+' ₪ (הפרש '+fmt(dp)+' ₪). ':'')+
    (Math.abs(di)>=0.01?'ריבית: בקובץ '+fmt(ft.i)+' ₪, בחשבון '+fmt(iS)+' ₪ (הפרש '+fmt(di)+' ₪). ':'')+
    'בדוק את שורות הקובץ לפני שמירה.';
}
// מקור: applyExtraction 2207 — הודעת המצב אחרי קריאת הקובץ. m = {raw,hdrRow,map,otherSheets}
export function morningStatus(m){
  const ex=extractRows(m.raw,m.hdrRow,m.map);
  const pS=sum(ex.rows.map(r=>r.p)), iS=sum(ex.rows.map(r=>r.i));
  let html='נקראו <b>'+ex.rows.length+'</b> לקוחות · ריבית <b class="num">'+fmt(iS)+' ₪</b> · קרן <b class="num">'+fmt(pS)+' ₪</b>';
  let cls='ok';
  if(ex.unnamed){cls='warn';html+='<br>⚠ '+ex.unnamed+' שורות עם סכום אבל בלי שם נכללו בחשבון בשם ״(ללא שם)״. אפשר להשלים להן שם בחלון ״שורות הקובץ״.';}
  if(ex.fileTotals){
    const okI=Math.abs(ex.fileTotals.i-iS)<0.01||m.map.i<0, okP=Math.abs(ex.fileTotals.p-pS)<0.01||m.map.p<0;
    if(okI&&okP) html+='<br>✓ הסכומים תואמים לשורת הסיכום שבקובץ.';
    else {cls='err';html+='<br>⚠ שורת הסיכום בקובץ: ריבית <b class="num">'+fmt(ex.fileTotals.i)+' ₪</b>, קרן <b class="num">'+fmt(ex.fileTotals.p)+' ₪</b>. זה שונה ממה שחושב כאן, ולכן הסכומים בחשבון לא סופיים. בדוק את העמודות והשורות.';}
  } else html+='<br>בקובץ לא נמצאה שורת סיכום להשוואה.';
  if(m.otherSheets){cls=cls==='err'?cls:'warn';html+='<br>⚠ בקובץ יש עוד '+m.otherSheets+' גיליונות עם עמודות קרן וריבית. נקרא רק הגיליון הראשון.';}
  if(m.map.p<0||m.map.i<0){cls='warn';html+='<br>לא נבחרה עמודה לאחד הסכומים. אפשר לבחור בחלון ״שורות הקובץ״.';}
  return {ex,cls,html};
}
// מקור: onMFile 2243 — בחירת הגיליון והעמודות
export function morningFromTables(tables){
  let found=null,ti=0; let otherSheets=0;
  for(let t=0;t<tables.length;t++){const h=findHeader(tables[t]);if(h){if(!found){found=h;ti=t;}else otherSheets++;}}
  if(found) return {raw:tables[ti],hdrRow:found.r,map:{n:found.n,p:found.pp,i:found.ip,n2:found.n2},otherSheets,found:true};
  const raw=tables.reduce((b,t)=>t.length>b.length?t:b,[]);
  if(!raw.length) throw new Error('הקובץ ריק');
  let hr=raw.findIndex(r=>(r||[]).filter(x=>cell(x)).length>=3); if(hr<0) hr=0;
  return {raw,hdrRow:hr,map:{n:0,p:-1,i:-1,n2:-1},otherSheets,found:false};
}
// מקור: mAcc 1929 — צורת השורות בחשבון השמור
export const mRowsOf=rows=>rows.map(r=>({n:String(r.n||'').trim(),p:num(r.p),i:num(r.i)})).filter(r=>r.n||r.p||r.i);

/* ====================== split (פיצול) — קליטת קובץ החייבים (מקור 3247-3512) ====================== */
export const NOTE_PHRASES=['רובי שילם','לנסוע לבית','בדיקה','חוב של','מקבל חידוש','מקבל כסף','הלוואה מהבנק','לבדוק מה עושים','של מנדי להתחשבן','שייק של אמא'];
const NOTE_WORDS=new Set(['שילם','שילמה','להתחשבן','לבדוק','לנסוע','מקבל','מקבלת','הלוואה','חוב','בדיקה','שייק','לשנות','להחזיר','לחכות']);
const store={get(k){try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
const nw=(function(){const d=store.get('yh_nw');return {yes:new Set((d&&d.yes)||[]),no:new Set((d&&d.no)||[])};})();
const saveNw=()=>store.set('yh_nw',{yes:Array.from(nw.yes),no:Array.from(nw.no)});
export function learnNote(ln,isNote){const k=normName(ln);if(!k)return;if(isNote){nw.yes.add(k);nw.no.delete(k);}else{nw.no.add(k);nw.yes.delete(k);}saveNw();}
export function looksLikeNote(ln){
  const k=normName(ln); if(!k) return false;
  if(nw.no.has(k)) return false; if(nw.yes.has(k)) return true;
  if(NOTE_PHRASES.some(p=>k.startsWith(normName(p)))) return true;
  if(/\d/.test(k)) return true;
  const toks=k.split(' ');
  return toks.length>=3||toks.some(t=>NOTE_WORDS.has(t));
}
// מקור 3263 (בשם אחר, כי normPhone בתוכנה החדשה הוא נרמול לוואטסאפ)
export function spNormPhone(v){let t=String(v==null?'':v).replace(/[\s‎‏]/g,'');if(/^\d{9}$/.test(t)&&t[0]==='5')t='0'+t;return t;}
export function hardVal(v){const t=cell(v);if(!t)return '';if(/לא/.test(t))return 'לא קשה';if(/קשה/.test(t))return 'קשה';return '';}
// known = רשימת הגובים המוכרים (במקור knownCollectors(): גובים קבועים + גובים שנשמרו + מהקובץ)
export const DEF_COLL=['רובי','סמיילי','גובאני','שילו','טל','גלעד','אושר','עידן','טאייה'];
function collNameSet(known){return new Set((known||DEF_COLL).concat(['עידן','טאייה']).map(collKey).filter(Boolean));}
function agFilled(rows,hr,col){let n=0;for(let r=hr+1;r<rows.length&&r<hr+400;r++){if(cell((rows[r]||[])[col]))n++;}return n>0;}
function detectCollCol(rows,hr,map,known){
  const names=collNameSet(known), skip=new Set([map.fn,map.ln,map.bal,map.ph,map.hd]); let best=-1,bestN=0,width=0;
  for(let r=hr+1;r<rows.length&&r<hr+400;r++) width=Math.max(width,(rows[r]||[]).length);
  for(let col=0;col<width;col++){
    if(skip.has(col)) continue; let n=0;
    for(let r=hr+1;r<rows.length&&r<hr+400;r++){const v=cell((rows[r]||[])[col]); if(v&&names.has(collKey(v))) n++;}
    if(n>bestN){bestN=n;best=col;}
  }
  return bestN>=1?best:-1;
}
export function findSplitHeader(rows,known){
  for(let r=0;r<Math.min(rows.length,60);r++){
    const cs=Array.from(rows[r]||[],cell);
    const bal=cs.findIndex(c=>/יתרה/.test(c)), fn=cs.findIndex(c=>/שם פרטי/.test(c)), ln=cs.findIndex(c=>/שם משפחה/.test(c));
    if(bal>=0&&(fn>=0||ln>=0)){
      let ph=cs.findIndex(c=>/טלפון נייד/.test(c)); if(ph<0) ph=cs.findIndex(c=>/נייד|טלפון/.test(c));
      const map={fn,ln,bal,ag:cs.findIndex(c=>/סוכן/.test(c)),ph,hd:cs.findIndex(c=>/קשה/.test(c))};
      let byContent=false;
      if(map.ag<0||!agFilled(rows,r,map.ag)){const g=detectCollCol(rows,r,map,known); if(g>=0){map.ag=g;byContent=true;}}
      return {r,map,byContent};
    }
  }
  return null;
}
export function extractSplit(raw,hdrRow,map){
  const recs=[]; let skipped=0, read=0;
  for(let r=hdrRow+1;r<raw.length;r++){
    const row=raw[r]||[]; const g=i=>i>=0?cell(row[i]):'';
    const fn=g(map.fn), ln=g(map.ln), a=map.bal>=0?num(row[map.bal]):0;
    if(!fn&&!ln) continue;
    if(TOTAL_RE.test(fn)||(!fn&&TOTAL_RE.test(ln))){skipped++;continue;}
    if(!a){skipped++;continue;}
    read++;
    let c=g(map.ag); if(normName(c)==='חמודי') c='רובי'; if(normName(c)==='טאיה') c='טאייה';
    const isNote=!!fn&&!!ln&&looksLikeNote(ln);
    recs.push({id:uid(),fn,ln,n:isNote?fn:(fn&&ln?fn+' '+ln:(fn||ln)),note:isNote?ln:'',ph:spNormPhone(map.ph>=0?row[map.ph]:''),a:r2(a),c,side:false,h:map.hd>=0?hardVal(row[map.hd]):'',cnt:1});
  }
  return {recs,skipped,read};
}
export function mergeRecords(recs){
  const out=[], byKey=new Map(), drop=new Set();
  for(const r of recs){
    if(r.note||r.pg||isSagi(r.n)){out.push(r);continue;}
    const k=normName(r.n)+'|'+normName(r.c)+'|'+(r.side?1:0);
    const hit=byKey.get(k);
    if(hit){hit.a=r2(num(hit.a)+num(r.a));hit.cnt=(hit.cnt||1)+(r.cnt||1);if(!hit.ph&&r.ph)hit.ph=r.ph;if(!hit.h&&r.h)hit.h=r.h;if(!hit.t&&r.t)hit.t=r.t;continue;}
    byKey.set(k,r);out.push(r);
  }
  const groups=new Map();
  for(const r of out){
    if(r.note||r.pg||isSagi(r.n)||!r.ph) continue;
    const pd=String(r.ph).replace(/\D/g,''); if(pd.length<7) continue;
    const k=pd+'|'+normName(r.c)+'|'+(r.side?1:0);
    if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r);
  }
  const tok=n=>new Set(normName(n).split(' ').filter(Boolean));
  const sub=(A,B)=>Array.from(A).every(x=>B.has(x));
  let byPhone=0;
  for(const g of groups.values()){
    const kept=[];
    for(const r of g){
      const A=tok(r.n); let m=null;
      for(const kk of kept){const B=tok(kk.n); if(sub(A,B)||sub(B,A)){m=kk;break;}}
      if(!m){kept.push(r);continue;}
      if(A.size>tok(m.n).size){m.n=r.n;m.fn=r.fn;m.ln=r.ln;}
      m.a=r2(num(m.a)+num(r.a));if(!m.t&&r.t)m.t=r.t;m.cnt=(m.cnt||1)+(r.cnt||1);m.byPhone=true;drop.add(r);byPhone++;
    }
  }
  return {recs:out.filter(r=>!drop.has(r)),byPhone};
}
/* מקור 3340. איחוד חובות של אותו לווה לשורה אחת: סכום מצטבר, וההערות שנרשמו בכל אחד מהחובות נשמרות (מחוברות בשורה אחת).
   שינוי מבני בלבד: במקום S.sp.records ומזהי id — רשימה שמתקבלת כפרמטר, וזיהוי שורה לפי האובייקט עצמו. scope = Set של שורות להגבלה */
export function mergeDebts(recs,scope){
  const groups=new Map();
  recs.forEach(r=>{
    if(!r||(scope&&!scope.has(r))) return;
    /* חלקים של חוב שפוצל בכוונה לא מתאחדים כאן. ״אחד בחזרה את החלקים״ בחלון הפיצול מאחד אותם */
    const nm=normName(r.n); if(!nm||isSagi(r.n)||r.pg) return;
    const k=nm+'|'+(r.side?1:0);
    if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r);
  });
  let people=0, removed=0, split=[]; const gone=new Set();
  groups.forEach(g=>{
    if(g.length<2) return;
    const main=g.reduce((m,r)=>num(r.a)>num(m.a)?r:m,g[0]);
    const seen=new Set(), notes=[];
    g.forEach(r=>{ const t=String(r.note||'').trim(); const key=normName(t); if(t&&!seen.has(key)){ seen.add(key); notes.push(t); } });
    const colls=Array.from(new Set(g.map(r=>String(r.c||'').trim()).filter(Boolean)));
    const openNote=g.some(r=>String(r.note||'').trim()&&!r.done);
    main.a=r2(sum(g.map(r=>num(r.a))));
    main.note=notes.join(' · ');
    main.done=!!notes.length&&!openNote;
    if(!String(main.ph||'').trim()){ const p=g.find(r=>String(r.ph||'').trim()); if(p) main.ph=p.ph; }
    if(!main.h){ const h=g.find(r=>r.h); if(h) main.h=h.h; }
    if(g.some(r=>r.h==='קשה')) main.h='קשה';
    if(!normTime(main.t)){ const t=g.find(r=>normTime(r.t)); if(t) main.t=t.t; }
    main.cnt=g.reduce((t,r)=>t+(r.cnt||1),0);
    g.forEach(r=>{ if(r!==main) gone.add(r); });
    people++; removed+=g.length-1;
    if(colls.length>1) split.push(String(main.n).trim()+' נשאר אצל '+(String(main.c||'').trim()||'ללא גובה'));
  });
  if(!removed) return {recs,people:0,removed:0,split:[]};
  return {recs:recs.filter(r=>!gone.has(r)),people,removed,split};
}
// מקור 3456
export const compactRec=r=>({n:String(r.n||'').trim(),note:String(r.note||'').trim(),ph:cleanPh(r.ph),a:num(r.a),c:String(r.c||'').trim(),side:!!r.side,h:r.h||'',fn:r.fn||'',ln:r.ln||'',cnt:r.cnt||1,...(r.done?{done:true}:{}),...(r.px?{px:true}:{}),...(r.xs?{xs:true}:{}),...(r.xd?{xd:true}:{}),...(r.na?{na:true}:{}),...(r.pg?{pg:r.pg,pp:r.pp||''}:{}),...(normTime(r.t)?{t:normTime(r.t)}:{})});
// מקור 4052
export const normQ=s=>String(s||'').toLowerCase().replace(/["'״׳`]/g,'').replace(/\s+/g,' ').trim();
/* מקור 3467 carrySpNotes: open notes: a note written in the split stays with the borrower in the next account until it is marked as handled.
   list = כל החשבונות השמורים (מלאים), records = השורות של היום, date = תאריך החשבון, excludeId = החשבון שנערך */
export function carrySpNotes(list,records,date,excludeId){
  const prev=(list||[]).filter(a=>a&&a.kind==='split'&&a.id!==excludeId&&Array.isArray(a.records)&&String(a.date||'')<String(date||''))
    .sort((x,y)=>String(y.date).localeCompare(String(x.date))||((y.updatedAt||y.createdAt||0)-(x.updatedAt||x.createdAt||0)))[0];
  const out={n:0,lost:[],added:[],from:prev?prev.date:''};
  if(!prev) return out;
  prev.records.filter(r=>r.note&&!r.done).forEach(p=>{
    const cur=records.find(r=>normQ(r.n)===normQ(p.n));
    /* a borrower who is not in today's file is considered handled: not added to the split and no warning */
    if(!cur) return;
    if(!cur.note){cur.note=p.note;cur.carried=true;out.n++;}
    else if(normQ(cur.note).indexOf(normQ(p.note))<0){cur.note=cur.note+' · '+p.note;cur.carried=true;out.n++;}
  });
  return out;
}
// מקור applySpExtraction 3483 — הודעת המצב. ex/m/cy = תוצאות extractSplit/mergeRecords/carrySpNotes
export function splitStatus(ex,m,cy,map,agByContent){
  const notes=m.recs.filter(r=>r.note).length, chg=m.recs.filter(r=>r.c===CHANGE).length;
  let html='נקראו <b>'+ex.read+'</b> שורות · אחרי איחוד <b>'+m.recs.length+'</b>'+(notes?' · '+notes+' הערות':'')+(chg?' · '+chg+' לשינוי':'')+(ex.skipped?' · דולגו '+ex.skipped+' שורות בלי יתרה או שורות סיכום':'')+'.';
  let cls='ok';
  if(cy.n) html+='<br>הועברו <b>'+cy.n+'</b> הערות פתוחות מהחשבון של '+esc(isoLabel(cy.from))+'. כשהערה טופלה, סמן ״הערה טופלה״ והיא לא תועבר הלאה.';
  if(cy.added&&cy.added.length) html+='<br>נוספו לרשימה (סכום 0) כי ״בדיקה״ עדיין לא נבדקה: '+cy.added.map(esc).join(' · ');
  if(cy.lost.length){cls='warn';html+='<br>הערות פתוחות מהחשבון הקודם בלי לווה כזה בקובץ היום (לא הועברו): '+cy.lost.map(esc).join(' · ');}
  if(m.byPhone){html+='<br>'+m.byPhone+' שורות אוחדו לפי אותו טלפון ושמות דומים (מסומנות בצהוב בטבלה).';}
  if(map.ag>=0&&agByContent) html+='<br>שם הגובה נקרא מהעמודה שליד כל לקוח, והרשימות מתפצלות לפי הגובה.';
  if(map.ag<0){cls='warn';html+='<br>לא נמצאה עמודת סוכן, ולכן כל השורות בלי גובה. אפשר לבחור עמודה בחלון ״עריכת שורות״.';}
  return {cls,html};
}
// מקור 1871
export function isoLabel(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?m[3]+'.'+m[2]+'.'+m[1]:(iso||'');}

/* ====================== ספר טלפונים מהפיצולים הקודמים (מקור 2522-2581) ====================== */
export const nmTokens=s=>normName(s).replace(/[-–—.,()\[\]_\/\\]/g,' ').split(/\s+/).filter(Boolean);
export const nmKey=t=>t.slice().sort().join(' ');
export function phbIngest(m,date,recs,replace){
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
// מקור phbGet 2551. list = החשבונות השמורים, cur = {date,records} של החשבון שנערך, clients = כרטיסי הלקוחות
export function phbBuild(list,cur,clients){
  const m=new Map();
  (list||[]).filter(a=>a&&a.kind==='split'&&Array.isArray(a.records)&&(!cur||a.id!==cur.id)).sort((x,y)=>String(x.date||'').localeCompare(String(y.date||''))).forEach(a=>phbIngest(m,a.date,a.records,false));
  if(cur&&cur.records&&cur.records.length) phbIngest(m,cur.date,cur.records,true);
  (clients||[]).forEach(c=>{ if(c&&c.phone) phbIngest(m,String(c.updated||c.created||'').slice(0,10),[{n:c.name,ph:c.phone}],false); });
  return m;
}
/* x = same name, a = partial name match (to be checked), amb = several different numbers (left empty) */
export function phLookup(name,book){
  const toks=nmTokens(name); if(!toks.length) return {p:'',pm:''};
  if(!book.size) return {p:'',pm:''};
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

/* ====================== collectors: reading pasted text (מקור 2315-2329). קריאת צילומים: ai-client.js ====================== */
export function parseText(text){
  const out=[]; let mode='d';
  for(let line of String(text).split(/\r?\n/)){
    line=line.replace(/[‎‏‪-‮]/g,'').trim(); if(!line) continue;
    if(/^הוצאות\s*[:\-–]?\s*$/.test(line)){mode='e';continue;}
    if(/^(חובות|חייבים|רשימת חייבים)\s*[:\-–]?\s*$/.test(line)){mode='d';continue;}
    line=line.replace(/^\s*\d+\s*[.)]\s+/,'');
    const m=line.match(/^(.*?)[\s\-–—:]*(-?\d[\d,]*(?:\.\d+)?)\s*(?:₪|ש"ח|שח|ש״ח)?[\s\-–—:]*([^\d]*)$/);
    if(!m) continue;
    const name=m[1].replace(/[\s\-–—:]+$/,'').trim(), amount=num(m[2]), coll=m[3].replace(/^[\s\-–—:]+|[\s\-–—:]+$/g,'').trim();
    if(!name||TOTAL_RE.test(name)) continue;
    out.push({k:mode,n:name,a:amount,c:coll});
  }
  return out;
}
// מקור cAcc 2005 — צורת השורה בחשבון גובים השמור
export const cEntryOf=e=>Object.assign({k:e.k==='e'?'e':'d',n:String(e.n||'').trim(),a:num(e.a),c:String(e.c||'').trim()},normTime(e.t)?{t:normTime(e.t)}:{});
export { waPhone, cleanColl, NOC_SP };
