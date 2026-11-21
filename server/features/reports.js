// דוחות וניתוחים: כל החשבונות המלאים בקריאה אחת (רק למורשי כספים — בעלים/מנהל).
// הניתוחים עצמם מחושבים בדפדפן מאותן פונקציות חישוב מקוריות (calc.js), כמו בתוכנה המקורית.
export async function register(ctx) {
  const { r, need, can, listDocs } = ctx;
  r.get('/api/reports/accounts', (req, res, { user, q }) => {
    need(can.finance(user), 'אין הרשאה לדוחות');
    const from = q.get('from') || '', to = q.get('to') || '';
    return listDocs('accounts')
      .filter(x => (!from || String(x.data.date || '') >= from) && (!to || String(x.data.date || '') <= to))
      .map(x => ({ ...x.data, id: x.id, _version: x.version, _updatedAt: x.updated_at, _updatedBy: x.updated_by }));
  });
}
