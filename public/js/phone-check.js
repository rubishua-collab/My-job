// בדיקת מספרי טלפון מדוח הלקוחות — משותף לשרת ולדפדפן.
// כל מספר נבדק בנפרד (גם כשיש כמה בתא). לא מנחשים ספרות חסרות ולא חותכים עודפות — רק מסמנים את הבעיה והסיבה.
// חריג יחיד: תא מספרי באקסל מוחק את ה-0 שבהתחלה (502123456) — מחזירים אותו רק כשהמספר המתקבל תקין לגמרי.

const SPLIT = /\s*(?:[,;\/|\n]|\s{2,}|\sאו\s)\s*/;
export function splitPhones(cell) {
  return String(cell == null ? '' : cell).split(SPLIT).map(s => s.trim()).filter(Boolean);
}
// raw: מחרוזת אחת. wasNumber: הערך הגיע כתא מספרי מהאקסל
export function checkPhone(raw, wasNumber = false) {
  const orig = String(raw == null ? '' : raw).trim();
  const out = { raw: orig, ok: false, type: '', local: '', why: '' };
  if (!orig) { out.why = 'ריק'; return out; }
  let s = orig.replace(/[\s\-–—.()‎‏]/g, '');
  const bad = s.replace(/^\+/, '').match(/[^\d]/g);
  if (bad) { out.why = 'מכיל תווים לא חוקיים: ' + [...new Set(bad)].join(' '); return out; }
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^972\d{8,9}$/.test(s)) s = '+' + s;
  if (s.startsWith('+')) {
    const d = s.slice(1);
    if (d.startsWith('972')) { s = '0' + d.slice(3).replace(/^0/, ''); }
    else { if (d.length < 8) { out.why = 'קצר מדי למספר בינלאומי (' + d.length + ' ספרות)'; return out; } if (d.length > 15) { out.why = 'ארוך מדי למספר בינלאומי (' + d.length + ' ספרות)'; return out; } return { ...out, ok: true, type: 'בינלאומי', local: '+' + d }; }
  }
  if (wasNumber && !s.startsWith('0') && (/^5\d{8}$/.test(s) || /^[2-489]\d{7}$/.test(s) || /^7\d{8}$/.test(s))) s = '0' + s; // ה-0 שאקסל מחק
  if (/^1[78]00\d{6}$/.test(s)) return { ...out, ok: true, type: 'מספר שירות', local: s };
  if (!s.startsWith('0')) { out.why = 'לא מתחיל ב-0 או בקידומת מדינה (' + s.length + ' ספרות)'; return out; }
  const need = /^05/.test(s) || /^07/.test(s) ? 10 : /^0[2-489]/.test(s) ? 9 : 0;
  if (!need) { out.why = 'קידומת לא מוכרת (' + s.slice(0, 3) + ')'; return out; }
  if (s.length < need) { out.why = 'קצר מדי — ' + s.length + ' ספרות במקום ' + need; return out; }
  if (s.length > need) { out.why = 'ארוך מדי — ' + s.length + ' ספרות במקום ' + need; return out; }
  return { ...out, ok: true, type: /^05/.test(s) ? 'נייד' : /^07/.test(s) ? 'קווי (07)' : 'קווי', local: s };
}
export const phoneDigits = (p) => String(p && p.local || '').replace(/\D/g, '');
