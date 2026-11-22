// ״שמור שינויים״: מנגנון שמירה אחיד לכל מסך שאפשר לערוך בו.
// כל מסך (או חלק במסך) רושם ״ספק שמירה״: isDirty() — האם יש שינוי שלא נשמר, save() — שומר ומחזיר true/false.
// הכפתור שומר את כל הספקים של המסך הנוכחי בלחיצה אחת (אחרי שהערך האחרון שהוקלד נכנס — blur לשדה הפעיל).
// הסטטוס מוצג ליד כל כפתור [data-savest]: ״יש שינויים שטרם נשמרו״ / ״שומר…״ / ״נשמר בשעה 10:32״ / ״השמירה נכשלה — נסה שוב״.
// מעבר מסך / תאריך / יום חדש כשיש שינויים — ״שמור והמשך״ / ״המשך בלי לשמור״ / ״הישאר במסך״.
import { $, $$, esc, openSheet, toast } from './ui.js';

const providers = new Map();
const afterSave = new Set(); // נקראים אחרי כל שמירה מוצלחת (ידנית או אוטומטית) — לרענון ״עדכון אחרון / שמירה אחרונה״ // key -> provider (רישום חוזר באותו מפתח מחליף, כך שציור מחדש של המסך לא מכפיל)
let state = 'idle', savedAt = 0, busy = null, skipGuard = false;
const hhmm = (t) => new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });

export const SaveCtl = {
  // מחזיר פונקציה להסרה (נקראת כשעוזבים את המסך)
  register(key, p) { providers.set(key, p); paint(); return () => { if (providers.get(key) === p) providers.delete(key); paint(); }; },
  isDirty() { for (const p of providers.values()) { try { if (p.isDirty()) return true; } catch { /* */ } } return false; },
  // הודעות מספקים ששומרים בעצמם (שמירה אוטומטית)
  dirty() { state = 'dirty'; paint(); },
  saving() { state = 'saving'; paint(); },
  saved() { savedAt = Date.now(); state = 'saved'; paint(); afterSave.forEach(f => { try { f(); } catch { /* */ } }); },
  after(fn) { afterSave.add(fn); return () => afterSave.delete(fn); },
  failed() { state = 'failed'; paint(); },
  reset() { providers.clear(); afterSave.clear(); state = 'idle'; savedAt = 0; paint(); },
  async saveAll() {
    if (busy) return busy;
    const a = document.activeElement; if (a && a.matches && a.matches('input,textarea,select')) a.blur(); // הערך האחרון שהוקלד
    await new Promise(r => setTimeout(r, 0));
    busy = (async () => {
      const list = [...providers.values()].filter(p => { try { return p.isDirty(); } catch { return false; } });
      if (!list.length) {
        // אין שינויים: ״שמור״ מעדכן רק את מועד השמירה (אם המסך תומך)
        const touch = [...providers.values()].filter(p => p.touch);
        if (!touch.length) { state = savedAt ? 'saved' : 'clean'; paint(); return true; }
        state = 'saving'; paint();
        let ok = true; for (const p of touch) { try { if (!(await p.touch())) ok = false; } catch { ok = false; } }
        if (ok) SaveCtl.saved(); else { state = 'failed'; paint(); }
        return ok;
      }
      state = 'saving'; paint();
      let ok = true;
      for (const p of list) { try { if (!(await p.save())) ok = false; } catch { ok = false; } }
      if (ok && !SaveCtl.isDirty()) SaveCtl.saved(); else { state = 'failed'; paint(); }
      return state === 'saved';
    })();
    try { return await busy; } finally { busy = null; }
  },
  // נקרא מהנתב לפני מעבר מסך. מחזיר true אם אפשר לעבור עכשיו
  guard(target, back) {
    if (skipGuard) { skipGuard = false; return true; }
    if (!SaveCtl.isDirty()) return true;
    history.replaceState(null, '', back);
    const s = openSheet(`<div class="hd"><h2>יש שינויים שטרם נשמרו</h2><button class="x" data-close>×</button></div>
      <p>מה לעשות עם השינויים במסך הזה?</p><div id="lverr"></div>
      <div class="grid" style="grid-template-columns:1fr;gap:8px"><button class="btn xl" id="lvsave">שמור והמשך</button><button class="btn ghost" id="lvgo">המשך בלי לשמור</button><button class="btn ghost" id="lvstay" data-close>הישאר במסך</button></div>`);
    const go = () => { skipGuard = true; s.close(); location.hash = target; };
    $('#lvsave', s.el).onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'שומר…';
      const ok = await SaveCtl.saveAll();
      if (ok) go(); else { e.target.disabled = false; e.target.textContent = 'שמור והמשך'; $('#lverr', s.el).innerHTML = '<div class="note err">השמירה נכשלה — נסה שוב. לא עברנו מסך, והערכים שהקלדת נשארו.</div>'; }
    };
    $('#lvgo', s.el).onclick = () => { for (const p of providers.values()) { try { p.discard && p.discard(); } catch { /* */ } } providers.clear(); state = 'idle'; go(); };
    return false;
  },
  // כפתור + סטטוס (משמשים בכותרת המסך ובפס הצף)
  button(extra = '') { return `<button class="btn sm savebtn" data-save ${extra}>שמור שינויים</button><span class="savest small" data-savest role="status" aria-live="polite"></span>`; },
  label() { return text(); },
};
function text() {
  if (state === 'saving') return 'שומר…';
  if (state === 'failed') return 'השמירה נכשלה — נסה שוב';
  if (SaveCtl.isDirty() || state === 'dirty') return 'יש שינויים שטרם נשמרו';
  if (state === 'saved' && savedAt) return 'נשמר בשעה ' + hhmm(savedAt);
  if (state === 'clean') return 'אין שינויים שטרם נשמרו';
  return '';
}
function paint() {
  if (state === 'dirty' && !SaveCtl.isDirty() && !busy) { /* ספק שעדיין בהשהיה ישלח saving/saved בעצמו */ }
  const t = text(), cls = state === 'failed' ? 'neg' : (t.startsWith('יש שינויים') ? 'warn-t' : (state === 'saved' ? 'ok-t' : ''));
  $$('[data-savest]').forEach(el => { el.textContent = t; el.className = 'savest small ' + cls; });
  $$('[data-save]').forEach(b => { b.disabled = state === 'saving'; b.classList.toggle('dirtyb', t.startsWith('יש שינויים') || state === 'failed'); });
  const f = document.getElementById('savefloat'); if (f) f.hidden = !providers.size || !floatWanted;
}
// לחיצה על כל כפתור ״שמור שינויים״
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-save]'); if (!b) return;
  e.preventDefault(); SaveCtl.saveAll().then(ok => { if (!ok) toast('השמירה נכשלה — נסה שוב'); });
});
// לא מאבדים שינויים בסגירה / רענון
addEventListener('beforeunload', (e) => { if (SaveCtl.isDirty()) { e.preventDefault(); e.returnValue = ''; } });
// פס צף בראש המסך כשהכותרת עם הכפתור כבר לא נראית (גלילה)
let floatWanted = false, io = null;
export function watchHeader(el) {
  let f = document.getElementById('savefloat');
  if (!f) { f = document.createElement('div'); f.id = 'savefloat'; f.className = 'savefloat no-print'; f.hidden = true; f.innerHTML = SaveCtl.button(); document.body.appendChild(f); }
  if (io) io.disconnect(); floatWanted = false;
  if (!el || !('IntersectionObserver' in window)) { paint(); return; }
  io = new IntersectionObserver(([en]) => { floatWanted = !en.isIntersecting; paint(); });
  io.observe(el); paint();
}
export function unwatchHeader() { if (io) io.disconnect(); io = null; floatWanted = false; paint(); }
export { paint as paintSave };
