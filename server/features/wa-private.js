// וואטסאפ פרטי: תורי שליחה מהוואטסאפ הרגיל (wa.me / WhatsApp Web) עד לאישור החשבון העסקי.
// כל תור נשמר בשרת (אוסף wa_private), כך שאפשר לסגור את היומן ולחזור לאותו מקום, גם ממכשיר אחר.
import { clientIndex } from '../data.js';
import { normName } from '../../public/js/calc.js';
import { waPhone } from '../../public/js/calc.js';

export async function register(ctx) {
  const { r, need, can, COLLECTIONS } = ctx;
  COLLECTIONS.wa_private = { read: can.send, write: can.send };

  // השלמת מספרי טלפון לשורות בלי טלפון (חשבון בוקר / חשבון גובים): רק כשללקוח יש מספר אחד בהיסטוריה
  r.post('/api/wa-private/resolve', (req, res, { user, body }) => {
    need(can.send(user));
    const I = clientIndex();
    return (body.items || []).slice(0, 3000).map(it => {
      const own = waPhone(it.phone);
      if (own) return { ...it, ph: own };
      const c = I.byName.get(normName(it.name));
      if (c && c.phones.size === 1) return { ...it, ph: [...c.phones][0], resolved: true };
      return { ...it, ph: '', why: c && c.phones.size > 1 ? 'ללקוח יש כמה מספרים — בחר ידנית' : (String(it.phone || '').trim() ? 'מספר לא תקין' : 'אין מספר טלפון') };
    });
  });
}
