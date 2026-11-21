// פקודה לתוכנה (פקודה חופשית): ההנחיה ל-Claude, צורת התשובה והחלת השינויים על מסמך החשבון.
// הועתק מהתוכנה המקורית app.html שורות 5936-6055 (AI_TABS, aiRd, aiWr, aiShow, aiData, aiPrompt, aiNew, aiFix, aiApply).
// ההבדל היחיד: במקור השינויים הוחלו על מצב הדף (S.w / S.sp / S.c / S.m); כאן הם מוחלים על עותק של מסמך החשבון השמור,
// בצורה שבה הוא נשמר (wAcc / cAcc / mAcc), והמשתמש מאשר לפני שמירה. דפי הלוואות / חוזים / בקשות (custom) לא כאן.
import { num, r2, normTime, normStatus, normHard, cleanColl, cleanPh, CHANGE, NOC_SP } from '../../../public/js/calc.js';

// 5937-5955 (בלי loans / sign / req)
export const AI_TABS={
  work:{label:'איסוף יומי',ex:'למשל: כל מי שרשום אצל סנטה יעבור לבן, סנטה לא עובד היום',
    notes:'s (סטטוס) הוא אחד מ: "" (רגיל, לפי שעה), "לעבור", "נאסף", "לא נאסף", "לא ענו". כשקובעים שעה לשורה, שים גם s:"". c הוא שם הגובה שאוסף מהחייב.',
    lists:{entries:{d:'רשימת החייבים לאיסוף',f:{n:['str','שם'],a:['num','סכום'],t:['time','שעה'],s:['status','סטטוס'],p:['str','טלפון'],c:['str','גובה'],h:['hard','קשה / לא קשה']}},
           expenses:{d:'הוצאות של גובים',f:{n:['str','הוצאה'],a:['num','סכום'],c:['str','גובה']}}}},
  split:{label:'פיצול',ex:'למשל: כל השורות של שילו עוברות לגובאני',
    notes:'c הוא הגובה: "" = ללא גובה, "לשנות" = לשנות במערכת. side=true = לא נגבה היום. done=true = ההערה טופלה. na=true = לא ענו (בלי שעה). t = שעת איסוף, להעברה לאיסוף יומי.',
    lists:{records:{d:'שורות הפיצול',f:{n:['str','שם'],note:['str','הערה'],ph:['str','טלפון'],a:['num','סכום'],c:['str','גובה'],side:['bool','לא נגבה היום'],done:['bool','הערה טופלה'],h:['hard','קשה / לא קשה'],t:['time','שעה'],na:['bool','לא ענו']}}}},
  collectors:{label:'חשבון גובים',ex:'למשל: ההוצאות של טאייה עוברות לעידן',
    notes:'k הוא "d" לחוב או "e" להוצאה. c הוא הגובה.',
    lists:{entries:{d:'חובות והוצאות',f:{k:['kind','סוג'],n:['str','שם'],a:['num','סכום'],c:['str','גובה']}}}},
  morning:{label:'חשבון בוקר',ex:'למשל: תמחק את ההלוואה של משה ותשנה את המשלוחים ל-200',
    notes:'rows הן שורות דו״ח ההכנסות: p תשלום קרן, i תשלום ריבית. loans הן ההלוואות שניתנו היום. keren היא הקרן הקיימת, courier הם המשלוחים (שניהם ב-scalars).',
    lists:{rows:{d:'שורות דו״ח ההכנסות',f:{n:['str','לקוח'],p:['num','תשלום קרן'],i:['num','תשלום ריבית']}},loans:{d:'הלוואות שניתנו היום',f:{n:['str','שם'],a:['num','סכום']}}},
    sc:{keren:['num','קרן קיימת'],courier:['num','משלוחים']}},
};
// 1856 (fmt המקורי, לא של ui.js)
function fmt(n){
  n=r2(+n||0); const neg=n<0;
  const s=Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2});
  return (neg?'−':'')+s;
}
// 1871-1872
const isoLabel=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?m[3]+'.'+m[2]+'.'+m[1]:(iso||'');};
const weekday=iso=>{try{return new Date(iso+'T12:00:00').toLocaleDateString('he-IL',{weekday:'long'});}catch(e){return '';}};
// 3514
const isRealColl=c=>!!c&&c!==CHANGE&&c!==NOC_SP;
export const aiOk=k=>!!AI_TABS[k];
// 5960-5962
export function aiRd(ty,v){ if(ty==='num') return num(v); if(ty==='time') return normTime(v)||''; if(ty==='status') return normStatus(v); if(ty==='hard') return normHard(v); if(ty==='bool') return !!v; if(ty==='kind') return v==='e'?'e':'d'; return String(v==null?'':v).trim(); }
export function aiWr(ty,v){ if(ty==='num') return num(v); if(ty==='time') return v?normTime(v):''; if(ty==='status') return v?normStatus(v):''; if(ty==='hard') return normHard(v); if(ty==='bool') return v===true||v==='true'||v===1||v==='כן'; if(ty==='kind') return (v==='e'||v==='הוצאה')?'e':'d'; return String(v==null?'':v).trim(); }
const aiShow=(ty,v)=>ty==='bool'?(v?'כן':'לא'):(ty==='kind'?(v==='e'?'הוצאה':'חוב'):(ty==='num'?fmt(v):(v===''||v==null?'—':String(v))));
const list=(doc,ln)=>Array.isArray(doc&&doc[ln])?doc[ln]:[];
// 5964-5970
export function aiData(kind,doc){
  const T=AI_TABS[kind], out={};
  Object.keys(T.lists).forEach(ln=>{ const F=T.lists[ln].f;
    out[ln]=list(doc,ln).map((r,idx)=>{ const o={idx}; Object.keys(F).forEach(k=>{ const v=aiRd(F[k][0],r&&r[k]); if(v!==''&&v!==0&&v!==false) o[k]=v; }); return o; }).filter(o=>Object.keys(o).length>1); });
  if(T.sc) Object.keys(T.sc).forEach(k=>{ out[k]=num(doc[k]); });
  return out;
}
// 5971-5999. thread = [{r:'u'|'a', t}], collectors = שמות הגובים המוכרים, today = YYYY-MM-DD
export function aiPrompt(kind,doc,thread,{collectors=[],today}={}){
  const T=AI_TABS[kind], lns=Object.keys(T.lists);
  const fl=lns.map(ln=>'- '+ln+' ('+T.lists[ln].d+'): '+Object.keys(T.lists[ln].f).map(k=>k+' = '+T.lists[ln].f[k][1]).join(', ')).join('\n')+(T.sc?'\n- scalars: '+Object.keys(T.sc).map(k=>k+' = '+T.sc[k][1]).join(', '):'');
  return [
    'אתה מבצע פקודות בתוך תוכנת ניהול גבייה בעברית, בדף "'+T.label+'". רובי, בעל התוכנה, כותב בשפה חופשית מה לעשות בדף, ואתה מחזיר את השינויים בנתונים של הדף.',
    'היום: '+weekday(today)+' '+isoLabel(today)+'. תאריך הדף: '+isoLabel(doc.date||today)+'.',
    'גובים מוכרים: '+collectors.join(', ')+'.',
    'הרשימות והשדות:', fl, T.notes,
    'הנתונים של הדף (JSON). לכל שורה יש idx, המספר שלה ברשימה. שדה ריק, 0 או false לא מופיע:',
    JSON.stringify(aiData(kind,doc)),
    'השיחה עם רובי:',
    thread.map(m=>(m.r==='u'?'רובי: ':'אתה שאלת: ')+m.t).join('\n'),
    'החזר JSON בלבד, בלי הסבר, בדיוק בצורה הזו:',
    '{"question":"","summary":"","changes":[{"list":"'+lns[0]+'","op":"update","idx":3,"set":{"c":"שם"}},{"list":"'+lns[0]+'","op":"delete","idx":5},{"list":"'+lns[0]+'","op":"add","set":{"n":"שם","a":100}}],"scalars":{}}',
    'כללים:',
    '- בצע בדיוק את מה שרובי ביקש לפי כל השיחה, ורק את זה. אל תשנה שורות או שדות שלא קשורים לבקשה.',
    '- update: רק השדות שמשתנים, בתוך set. idx הוא המספר של השורה בנתונים שקיבלת. delete: idx בלבד. add: שורה חדשה בתוך set. list הוא שם הרשימה.',
    '- התאם שמות גם כשיש הבדל קטן באיות, ברווח או באות (למשל טאיה וטאייה). מותר שם גובה חדש שלא ברשימת הגובים המוכרים.',
    '- אם לא ברור לאילו שורות הכוונה, אם הבקשה יכולה להתפרש בכמה דרכים שנותנות תוצאה שונה, או שחסר נתון (שם, סכום, שעה, גובה), אל תשנה כלום: כתוב שאלה אחת קצרה וברורה בעברית ב-question, והשאר changes ריק.',
    '- כשיש question השאר summary ריק. כשאין שאלה השאר question ריק.',
    '- אם הבקשה היא משהו שהדף לא עושה (שמירה, שליחה, PDF, דף אחר), אל תשנה כלום והסבר ב-summary בקצרה.',
    '- אם אין שורות שמתאימות לבקשה, החזר changes ריק והסבר ב-summary.',
    '- summary: משפט או שניים בעברית פשוטה, מה שינית ובכמה שורות.',
    '- סכום הוא מספר בלבד. שעה בפורמט HH:MM. true או false לשדות כן/לא.'
  ].join('\n');
}
// צורת התשובה (structured outputs). במקור התשובה נקראה כ-JSON חופשי; כאן אותה צורה בדיוק, נאכפת ע״י ה-API
export function aiSchema(kind){
  const T=AI_TABS[kind], lns=Object.keys(T.lists), props={};
  const jt=ty=>ty==='num'?'number':ty==='bool'?'boolean':'string';
  lns.forEach(ln=>{ const F=T.lists[ln].f; Object.keys(F).forEach(k=>{ props[k]={type:jt(F[k][0]),description:F[k][1]}; }); });
  const p={ question:{type:'string'}, summary:{type:'string'},
    changes:{type:'array',items:{type:'object',additionalProperties:false,required:['list','op'],properties:{
      list:{type:'string',enum:lns}, op:{type:'string',enum:['update','delete','add']}, idx:{type:'integer'},
      set:{type:'object',additionalProperties:false,properties:props}}}} };
  const req=['question','summary','changes'];
  if(T.sc){ const sp={}; Object.keys(T.sc).forEach(k=>{ sp[k]={type:'number',description:T.sc[k][1]}; }); p.scalars={type:'object',additionalProperties:false,properties:sp}; }
  return {type:'object',additionalProperties:false,required:req,properties:p};
}
// 6008-6014: שורה חדשה בצורה שבה היא נשמרת (wAcc/cAcc/mAcc), בלי שדות התצוגה (id, src, u, pm, cm, hm)
function aiNew(kind,ln){
  if(kind==='work') return ln==='expenses'?{n:'',a:0}:{n:'',a:0,t:'',s:'',p:''};
  if(kind==='split') return {fn:'',ln:'',n:'',note:'',ph:'',a:0,c:'',side:false,h:'',cnt:1};
  if(kind==='collectors') return {k:'d',n:'',a:0,c:''};
  return ln==='loans'?{n:'',a:0}:{n:'',p:0,i:0};
}
/* 6015-6020: מה שהתוכנה עושה גם כשמשנים ידנית: גובה מנוקה, טלפון מנוקה, שעה מבטלת "לא ענו".
   סימוני ״שויך ידנית״ (cm/pm/hm/u) היו רק בטיוטת הדף ולא נשמרים בחשבון, ולכן לא כאן; שדה ריק לא נשמר באיסוף יומי (כמו wAcc) */
function aiFix(kind,ln,r,set){
  if(kind==='work'&&ln==='entries'){ if('c' in set){ r.c=cleanColl(r.c); if(!r.c) delete r.c; } if('p' in set) r.p=cleanPh(r.p); if('h' in set&&!r.h) delete r.h; if('t' in set&&r.t&&!('s' in set)) r.s=''; }
  else if(kind==='work'){ if('c' in set){ r.c=cleanColl(r.c); if(!r.c) delete r.c; } }
  else if(kind==='split'){ if('c' in set){ const cc=r.c===CHANGE?CHANGE:cleanColl(r.c); r.c=cc; if(isRealColl(cc)) r.xs=true; else delete r.xs; } if('ph' in set) r.ph=cleanPh(r.ph); if('t' in set&&r.t) r.na=false; if('na' in set&&r.na) r.t=''; }
  else if(kind==='collectors'){ if('c' in set) r.c=cleanColl(r.c); }
}
/* 6021-6055: מחיל את השינויים על עותק של החשבון ומחזיר את החשבון החדש + פירוט השינויים (lines) להצגה לפני אישור.
   החשבון המקורי לא משתנה. */
export function aiApply(kind,doc0,changes,sc){
  const T=AI_TABS[kind], doc=JSON.parse(JSON.stringify(doc0)), lines=[], lns=Object.keys(T.lists);
  let up=0,del=0,add=0,sk=0;
  const lists={}; lns.forEach(ln=>{ if(!Array.isArray(doc[ln])) doc[ln]=[]; lists[ln]=doc[ln]; });
  const dels={}, adds=[], nm=r=>String(r&&r.n||'').trim()||'(ללא שם)';
  (Array.isArray(changes)?changes:[]).forEach(c=>{
    if(!c||typeof c!=='object'){ sk++; return; }
    const ln=lists[c.list]?c.list:(lns.length===1?lns[0]:null); if(!ln){ sk++; return; }
    const F=T.lists[ln].f, set=c.set&&typeof c.set==='object'?c.set:{}, clean={};
    Object.keys(set).forEach(k=>{ if(F[k]) clean[k]=aiWr(F[k][0],set[k]); });
    if(c.op==='add'){ if(Object.keys(clean).length) adds.push({ln,clean}); else sk++; return; }
    const idx=+c.idx, r=lists[ln][idx];
    if(!Number.isInteger(idx)||!r){ sk++; return; }
    if(c.op==='delete'){ (dels[ln]=dels[ln]||new Set()).add(idx); return; }
    const diff=[], did={};
    Object.keys(clean).forEach(k=>{ const ty=F[k][0], old=aiRd(ty,r[k]); if(String(old)===String(clean[k])) return; diff.push(F[k][1]+': '+aiShow(ty,old)+' ← '+aiShow(ty,clean[k])); r[k]=clean[k]; did[k]=clean[k]; });
    if(!diff.length) return;
    aiFix(kind,ln,r,did);
    up++; lines.push(nm(r)+' · '+diff.join(' · '));
  });
  Object.keys(dels).forEach(ln=>{ const s=dels[ln]; lists[ln].forEach((r,i)=>{ if(s.has(i)){ del++; lines.push('נמחק: '+nm(r)+(num(r.a)?' · '+fmt(num(r.a))+' ₪':'')); } }); doc[ln]=lists[ln].filter((r,i)=>!s.has(i)); });
  adds.forEach(o=>{
    const r=aiNew(kind,o.ln); Object.assign(r,o.clean); aiFix(kind,o.ln,r,o.clean);
    if(kind==='morning'&&o.ln==='loans') doc.loans=doc.loans.filter(l=>String(l.n||'').trim()||num(l.a));
    doc[o.ln].push(r); add++; lines.push('נוסף: '+nm(r)+(num(r.a)?' · '+fmt(num(r.a))+' ₪':''));
  });
  if(T.sc) Object.keys(sc&&typeof sc==='object'?sc:{}).forEach(k=>{ if(!T.sc[k]) return; const v=r2(num(sc[k])), old=num(doc[k]); if(v===old&&String(doc[k]??'').trim()!=='') return; doc[k]=v; up++; lines.push(T.sc[k][1]+': '+fmt(old)+' ← '+fmt(v)); });
  return {doc,up,del,add,sk,lines};
}
