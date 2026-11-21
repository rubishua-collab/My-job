// השוואת ההעברה לפי תאריך ולפי גובה + דוח כפילויות לבדיקה (מוצג במסך ״דוח התאמה״).
import { compareMigration } from '../reconcile.js';
export async function register(ctx) {
  ctx.r.get('/api/migration/compare', (req, res, { user }) => { ctx.need(ctx.can.finance(user)); return compareMigration(); });
}
