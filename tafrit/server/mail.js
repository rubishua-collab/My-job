// שליחת דוא״ל (קוד אימות, שחזור סיסמה, אישור מחיקה) דרך Resend.
// בפיתוח/בדיקות (MAIL_DEV=1) הקוד לא נשלח אלא נשמר בזיכרון לבדיקות אוטומטיות בלבד.
const outbox = [];
export const mailDev = () => process.env.MAIL_DEV === '1' && process.env.NODE_ENV !== 'production';
export const mailEnabled = () => !!process.env.RESEND_API_KEY || mailDev();
export function devOutbox() { return mailDev() ? outbox : []; }

const SUBJECT = { verify: 'קוד אימות לתפריט יומי רובי', reset: 'שחזור סיסמה — תפריט יומי רובי', delete: 'אישור מחיקת חשבון — תפריט יומי רובי' };
const LINE = { verify: 'קוד האימות שלך', reset: 'קוד לשחזור הסיסמה', delete: 'קוד לאישור מחיקת החשבון וכל המידע' };

export async function sendCode(to, purpose, code) {
  if (mailDev()) { outbox.push({ to, purpose, code, at: Date.now() }); return { dev: true }; }
  if (!process.env.RESEND_API_KEY) throw Object.assign(new Error('שליחת דוא״ל לא הוגדרה בשרת'), { status: 503 });
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px">${LINE[purpose]}:<p style="font-size:30px;font-weight:bold;letter-spacing:6px">${code}</p><p>הקוד תקף ל-15 דקות. אם לא ביקשת — אפשר להתעלם מההודעה.</p></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'תפריט יומי רובי <onboarding@resend.dev>', to: [to], subject: SUBJECT[purpose], html, text: `${LINE[purpose]}: ${code}` }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) { console.error('[mail] שליחה נכשלה, סטטוס', r.status); throw Object.assign(new Error('לא הצלחנו לשלוח דוא״ל כרגע. נסה שוב בעוד רגע.'), { status: 502 }); }
  return { sent: true };
}
