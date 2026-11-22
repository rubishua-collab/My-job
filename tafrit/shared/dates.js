// תאריכים לפי שעון ישראל. כל רישום נשמר לפי התאריך המקומי בישראל (YYYY-MM-DD).
export const TZ = 'Asia/Jerusalem';

const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/** התאריך המקומי בישראל של רגע נתון (ברירת מחדל: עכשיו) */
export function israelDate(at = new Date()) { return fmtDate.format(at); }
/** השעה המקומית בישראל כ-HH:MM */
export function israelTime(at = new Date()) { return fmtTime.format(at).replace(/^24/, '00'); }
/** דקות מתחילת היום לפי שעון ישראל */
export function israelMinutes(at = new Date()) { const [h, m] = israelTime(at).split(':').map(Number); return h * 60 + m; }

export const isISO = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));

// חשבון ימים על תאריך "קלנדרי" (ללא אזור זמן) — UTC בצהריים כדי להימנע ממעברי שעון
const toUTC = iso => new Date(iso + 'T12:00:00Z');
const fromUTC = d => d.toISOString().slice(0, 10);
export function addDays(iso, n) { const d = toUTC(iso); d.setUTCDate(d.getUTCDate() + n); return fromUTC(d); }
export function dayOfWeek(iso) { return toUTC(iso).getUTCDay(); } // 0 = ראשון
export function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 864e5); }
/** יום ראשון של השבוע (ראשון–שבת) */
export function weekStart(iso) { return addDays(iso, -dayOfWeek(iso)); }
export function weekEnd(iso) { return addDays(weekStart(iso), 6); }
export function weekDates(start) { return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export function dmy(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${+d}.${+m}.${y.slice(2)}`; }
export function dm(iso) { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${+d}.${+m}`; }
export function hebDay(iso) { return 'יום ' + DAY_NAMES[dayOfWeek(iso)]; }
/** זמן שמירה קריא (חותמת זמן במילישניות) לפי שעון ישראל */
export function savedAt(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${dmy(israelDate(d))} ${israelTime(d)}`;
}
export function age(birthISO, onISO) {
  if (!isISO(birthISO)) return null;
  const [by, bm, bd] = birthISO.split('-').map(Number); const [y, m, d] = onISO.split('-').map(Number);
  return y - by - ((m < bm || (m === bm && d < bd)) ? 1 : 0);
}
