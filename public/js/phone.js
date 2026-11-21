// נרמול מספרי טלפון ושמות. משותף לשרת ולדפדפן.
import { waPhone } from './calc.js';
// אותו נרמול כמו בתוכנה המקורית (waPhone): מחזיר 972XXXXXXXXX או ריק
export const normPhone = (raw) => waPhone(raw);
// נייד ישראלי תקין לוואטסאפ: 9725XXXXXXXX
export const isMobile = (p) => /^9725\d{8}$/.test(p);
export function phoneProblem(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return 'אין מספר טלפון';
  const p = normPhone(s);
  if (!p) return 'מספר לא תקין';
  if (p.startsWith('972') && !isMobile(p)) return 'לא מספר נייד';
    return '';
}
export function fmtPhone(p) {
  const n = normPhone(p);
  if (isMobile(n)) return '0' + n.slice(3, 5) + '-' + n.slice(5);
  return String(p || '');
}
export const normName = (s) => String(s == null ? '' : s).replace(/[‎‏"'׳״]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
