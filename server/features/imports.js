// קליטה וייצוא: נתונים מלאים של חשבונות (לספר הטלפונים, להעברת הערות ולדוחות Excel)
// וקריאת גיליון Google שפורסם/שותף בקישור (הדפדפן לא יכול לפנות לאתר חיצוני בגלל מדיניות האבטחה, ולכן השרת קורא אותו).
const KINDS = new Set(['morning', 'split', 'collectors', 'work']);
const MAX_SHEET = 10 * 1024 * 1024;

// מקבל קישור לגיליון Google ומחזיר את כתובת הייצוא כ-CSV, או null אם הקישור לא של Google Sheets
export function gsheetCsvUrl(raw) {
  let u; try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null;
  const gid = (/[#&?]gid=(\d+)/.exec(u.hash + '&' + u.search) || [])[1];
  let m = /^\/spreadsheets\/d\/e\/([\w-]+)\//.exec(u.pathname);
  if (m) { // פורסם לאינטרנט
    const out = new URL(`https://docs.google.com/spreadsheets/d/e/${m[1]}/pub`); out.searchParams.set('output', 'csv');
    if (gid) out.searchParams.set('gid', gid); else if (u.searchParams.get('gid')) out.searchParams.set('gid', u.searchParams.get('gid'));
    if (u.searchParams.get('single')) out.searchParams.set('single', 'true');
    return out.toString();
  }
  m = /^\/spreadsheets\/d\/([\w-]+)/.exec(u.pathname);
  if (m) { // שיתוף ״כל מי שיש לו את הקישור״
    const out = new URL(`https://docs.google.com/spreadsheets/d/${m[1]}/export`); out.searchParams.set('format', 'csv');
    if (gid) out.searchParams.set('gid', gid);
    return out.toString();
  }
  return null;
}
const okHost = (h) => h === 'docs.google.com' || /^[\w-]+\.googleusercontent\.com$/.test(h);

export async function register(ctx) {
  const { r, err, need, can, listDocs } = ctx;

  // כל החשבונות המלאים (או של סוג אחד) — רק למי שרואה כספים
  r.get('/api/imports/accounts', (req, res, { user, q }) => {
    need(can.finance(user));
    const kind = q.get('kind');
    if (kind && !KINDS.has(kind)) throw err(400, 'סוג חשבון לא מוכר');
    return listDocs('accounts').map(x => ({ id: x.id, ...x.data })).filter(a => !kind || a.kind === kind);
  });

  // קריאת גיליון Google כ-CSV
  r.post('/api/imports/gsheet', async (req, res, { user, body }) => {
    need(can.finance(user));
    let url = gsheetCsvUrl(body && body.url);
    if (!url) throw err(400, 'הקישור לא נראה כמו קישור לגיליון Google (docs.google.com/spreadsheets/…)');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      let resp;
      for (let hop = 0; hop < 5; hop++) {
        resp = await fetch(url, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'yoman-import' } });
        if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
          const next = new URL(resp.headers.get('location'), url);
          if (next.protocol !== 'https:' || !okHost(next.hostname)) throw err(400, 'הגיליון הפנה לכתובת לא מוכרת');
          url = next.toString(); continue;
        }
        break;
      }
      const ct = resp.headers.get('content-type') || '';
      if (resp.status === 401 || resp.status === 403 || resp.status === 404 || /text\/html/.test(ct)) throw err(400, 'אין גישה לגיליון. בגיליון: קובץ ← שיתוף ← פרסום באינטרנט (CSV), או שיתוף ״כל מי שיש לו את הקישור״, ונסה שוב.');
      if (!resp.ok) throw err(502, 'קריאת הגיליון נכשלה (' + resp.status + ')');
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > MAX_SHEET) throw err(413, 'הגיליון גדול מדי');
      return { csv: buf.toString('utf8') };
    } catch (e) {
      if (e.status) throw e;
      throw err(502, e.name === 'AbortError' ? 'הגיליון לא ענה בזמן. נסה שוב.' : 'לא הצלחתי לקרוא את הגיליון: ' + (e.message || 'שגיאה'));
    } finally { clearTimeout(t); }
  });
}
