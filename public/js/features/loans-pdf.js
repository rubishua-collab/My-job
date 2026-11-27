// לוח סילוקין להדפסה / PDF ללקוח — העתק של lnSheetPages / lnBuildPdf (app.html 6873-6917) ושל עיצוב .ln-sheet (שורות 577-596).
// עמוד A4 בגודל 794x1123 פיקסלים, 20 שורות בעמוד הראשון ו-30 בכל עמוד המשך. המספרים מחושבים ב-lnSchedule בלבד.
import { esc, todayISO } from '../ui.js';
import { lnSchedule, lnPart } from '../calc.js';
import { loadVendor } from '../registry.js';

// מקור: שורות 6514-6516
export function lnFmt(n){ return (Math.round((+n||0)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₪'; }
export const lnMoney=n=>'<span class="num">'+lnFmt(n)+'</span>';
export const lnD=iso=>{ const p=String(iso||'').split('-'); return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(iso||''); };
// מקור: שורה 6872
export function lnWaNumber(p){let d=String(p||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);if(d.startsWith('0'))d='972'+d.slice(1);return d}

const CSS = `
#ln-sheet-host{position:fixed;top:0;left:-20000px;pointer-events:none}
.ln-sheet{width:794px;height:1123px;box-sizing:border-box;padding:46px 46px 40px;background:#fff;color:#16223a;font-family:"IBM Plex Sans Hebrew","IBM Plex Sans","Noto Sans Hebrew","Arial Hebrew",Arial,sans-serif;line-height:1.35;display:flex;flex-direction:column;gap:18px;direction:rtl;overflow:hidden}
.ln-sheet .hd{display:flex;justify-content:space-between;align-items:center;gap:14px;background:linear-gradient(160deg,#183560,#0f2444 65%);color:#fff;border-radius:8px;padding:16px 20px;border-bottom:3px solid #b8913f}
.ln-sheet .hd h3{font-size:28px;margin:0;color:#fff;font-weight:700;line-height:1.2}
.ln-sheet .hd.cont h3{font-size:19px}
.ln-sheet .hd .dt{font-size:13px;color:#c3cfe2}
.ln-sheet .hd .who{text-align:left}
.ln-sheet .hd .who b{font-size:20px;color:#fff}
.ln-sheet .info{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.ln-sheet .info div{border:1px solid #cfd6df;border-radius:6px;padding:7px 10px;display:flex;flex-direction:column}
.ln-sheet .info>div>span{font-size:11px;color:#5a6678}
.ln-sheet .info b{font-size:15px;color:#16223a}
.ln-sheet table{width:100%;border-collapse:collapse;font-size:12.5px}
.ln-sheet th{background:#e9eff7;color:#1d3f6e;font-size:11.5px;font-weight:700;text-align:right;padding:6px 8px;border-bottom:2px solid #1d3f6e}
.ln-sheet td{padding:5px 8px;border-bottom:1px solid #e1e6ee;border-top:0;text-align:right;color:#16223a}
.ln-sheet tbody tr:nth-child(even) td{background:#f4f6fa}
.ln-sheet tfoot td{background:#e9eff7;font-weight:700;border-top:2px solid #1d3f6e;border-bottom:0}
.ln-sheet td.pd{color:#17603f;font-weight:700}
.ln-sheet .num{font-family:"IBM Plex Sans","IBM Plex Sans Hebrew",Arial,sans-serif;font-variant-numeric:normal}
.ln-sheet .ft{margin-top:auto;display:flex;justify-content:space-between;font-size:11px;color:#7a8698;border-top:1px solid #cfd6df;padding-top:8px}
`;
let cssDone = false;
function ensureCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
function host() {
  ensureCss();
  let h = document.getElementById('ln-sheet-host');
  if (!h) { h = document.createElement('div'); h.id = 'ln-sheet-host'; h.dir = 'rtl'; h.lang = 'he'; h.setAttribute('aria-hidden', 'true'); document.body.appendChild(h); }
  return h;
}

// מקור: lnSheetPages, שורות 6873-6900 (ללא שינוי)
// opts.title — כותרת (״הצעת הלוואה ולוח תשלומים״ לפני מסירה); opts.extra — [[תווית, ערך]] נוספים (חידוש: קיזוז וסכום למסירה)
export function lnSheetPages(L,opts={}){
  const s=lnSchedule(L), unit=L.type==='week'?'שבוע':'חודש', paid=L.paid||{};
  const first=20, rest=30, chunks=[s.rows.slice(0,first)];
  for(let i=first;i<s.rows.length;i+=rest)chunks.push(s.rows.slice(i,i+rest));
  const head='<thead><tr><th>#</th><th>תאריך תשלום</th><th>יתרת פתיחה</th><th>תשלום</th><th>ריבית</th><th>קרן</th><th>יתרת סגירה</th><th>סטטוס</th></tr></thead>';
  const m=n=>'<span class="num">'+lnFmt(n)+'</span>';
  return chunks.map((rows,pi)=>{
    const last=pi===chunks.length-1;
    return '<div class="ln-sheet">'+
      (pi===0?'<div class="hd"><div><h3>'+esc(opts.title||'לוח סילוקין')+'</h3><div class="dt">הופק ב-<span class="num">'+lnD(todayISO())+'</span></div></div><div class="who"><div class="dt">לווה</div><b>'+esc(L.name)+'</b></div></div>'+
      '<div class="info">'+
        '<div><span>סכום ההלוואה</span><b>'+m(L.amount)+'</b></div>'+
        '<div><span>ריבית ל'+unit+'</span><b class="num">'+esc(L.rate)+'%</b></div>'+
        '<div><span>מספר תשלומים</span><b>'+s.rows.length+' ('+(L.type==='week'?'שבועיים':'חודשיים')+')</b></div>'+
        (opts.title?'':'<div><span>תאריך מתן</span><b class="num">'+lnD(L.date)+'</b></div>')+'<div><span>תשלום ראשון</span><b class="num">'+lnD(s.rows[0].date)+'</b></div>'+
        '<div><span>תשלום קבוע</span><b>'+m(s.pay)+'</b></div>'+
        '<div><span>סה״כ ריבית</span><b>'+m(s.totalInt)+'</b></div>'+
        '<div><span>סה״כ להחזר</span><b>'+m(s.totalPay)+'</b></div>'+
        '<div><span>תשלום אחרון</span><b class="num">'+lnD(s.rows[s.rows.length-1].date)+'</b></div>'+(opts.extra||[]).map(([l,v])=>'<div><span>'+esc(l)+'</span><b>'+m(v)+'</b></div>').join('')+
      '</div>':'<div class="hd cont"><h3>'+esc(opts.title||'לוח סילוקין')+' · '+esc(L.name)+' (המשך)</h3></div>')+
      '<table>'+head+'<tbody>'+rows.map(x=>'<tr><td><span class="num">'+x.i+'</span></td><td><span class="num">'+lnD(x.date)+'</span></td><td>'+m(x.open)+'</td><td>'+m(x.payment)+'</td><td>'+m(x.interest)+'</td><td>'+m(x.principal)+'</td><td>'+m(x.close)+'</td><td class="pd">'+(paid[x.i]?'שולם':(lnPart(L,x.i).a>0?'חלקי '+lnFmt(lnPart(L,x.i).a):''))+'</td></tr>').join('')+'</tbody>'+
      (last?'<tfoot><tr><td colspan="3">סה״כ</td><td>'+m(s.totalPay)+'</td><td>'+m(s.totalInt)+'</td><td>'+m(L.amount)+'</td><td></td><td></td></tr></tfoot>':'')+'</table>'+
      '<div class="ft"><span>חישוב בריבית יורדת על יתרת הקרן</span><span>עמוד '+(pi+1)+' מתוך '+chunks.length+'</span></div>'+
    '</div>';
  });
}

// מקור: lnBuildPdf, שורות 6901-6917. הספריות נטענות מקומית (public/vendor)
export async function lnBuildPdf(L,opts={}){
  await Promise.all([loadVendor('html2canvas.min.js'), loadVendor('jspdf.umd.min.js')]);
  if(!window.html2canvas||!window.jspdf) throw new Error('ספריית ה-PDF לא נטענה');
  try{ await document.fonts.ready; }catch(e){}
  const h=host(), pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
  const pages=lnSheetPages(L,opts);
  try{
    for(let i=0;i<pages.length;i++){
      h.innerHTML=pages[i];
      const c=await window.html2canvas(h.firstElementChild,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false});
      if(i) pdf.addPage();
      pdf.addImage(c.toDataURL('image/jpeg',0.92),'JPEG',0,0,210,297);
    }
  } finally { h.innerHTML=''; }
  return pdf.output('blob');
}
