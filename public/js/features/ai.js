// פקודה לתוכנה (פקודה חופשית) — במקור app.html 5936-6117 (AI_TABS, aiRun, renderAiBox, initAi).
// כותבים בשפה חופשית מה לעשות בחשבון, Claude (בשרת) מחזיר רשימת שינויים, והתוכנה מציגה אותם לאישור.
// שום דבר לא נשמר בלי לחיצה על ״אשר ושמור״. השמירה עצמה: PUT /api/accounts/:id עם baseVersion ו-opId (נרשם ביומן).
// אחרי שמירה אפשר ״בטל את השינוי״ (מחזיר את החשבון למה שהיה, שוב באישור).
// קריאת צילומים לשאר היכולות: ai-client.js.
import { accountPanel } from '../registry.js';
import { App } from '../app.js';
import { save, uid } from '../api.js';
import { $, esc, toast } from '../ui.js';
import { post, aiStatus } from './ai-client.js';

// 5937-5955: שם הדף ודוגמה לכל סוג חשבון
const TABS = {
  work: { label: 'איסוף יומי', ex: 'למשל: כל מי שרשום אצל סנטה יעבור לבן, סנטה לא עובד היום' },
  split: { label: 'פיצול', ex: 'למשל: כל השורות של שילו עוברות לגובאני' },
  collectors: { label: 'חשבון גובים', ex: 'למשל: ההוצאות של טאייה עוברות לעידן' },
  morning: { label: 'חשבון בוקר', ex: 'למשל: תמחק את ההלוואה של משה ותשנה את המשלוחים ל-200' },
};
const ST = new Map(); // id חשבון → מצב הפקודה (נשמר גם כשהמסך מצויר מחדש)
const st = (id) => { if (!ST.has(id)) ST.set(id, { busy: false, thread: [], first: '', res: null, undo: null, draft: '' }); return ST.get(id); };

// 6056-6057 פקודות אחרונות — לכל משתמש בנפרד
const recKey = () => 'yh_ai_rec:' + (App.me?.id || '');
function aiRecent(k) { try { const o = JSON.parse(localStorage.getItem(recKey()) || 'null'); return o && Array.isArray(o[k]) ? o[k] : []; } catch { return []; } }
function aiRemember(k, txt) { txt = String(txt || '').trim(); if (!txt) return; try { const o = JSON.parse(localStorage.getItem(recKey()) || 'null') || {}; const l = (Array.isArray(o[k]) ? o[k] : []).filter(x => x !== txt); l.unshift(txt); o[k] = l.slice(0, 6); localStorage.setItem(recKey(), JSON.stringify(o)); } catch { /* */ } }

const clean = (a) => { const d = { ...a }; ['id', '_version', '_updatedAt', '_updatedBy', 'prev'].forEach(k => delete d[k]); return d; };

let styled = false;
function style() {
  if (styled) return; styled = true;
  const s = document.createElement('style');
  s.textContent = `.ai-cmd{border-color:color-mix(in srgb,var(--accent,#2b6) 45%,var(--line,#ddd));display:flex;flex-direction:column;gap:10px}
.ai-cmd h3{display:flex;align-items:center;gap:8px;margin:0}.ai-cmd h3::before{content:"✦";color:var(--gold,#c90)}
#ai-in{min-height:64px;width:100%}.ai-det ol{margin:6px 0 0;padding-inline-start:22px;display:flex;flex-direction:column;gap:3px;font-size:14px}
.ai-rec .chip{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ai-out{display:flex;flex-direction:column;gap:8px}#ai-out:empty{display:none}.ai-cmd .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}`;
  document.head.appendChild(s);
}

accountPanel('*', (ctx) => {
  const T = TABS[ctx.a.kind]; if (!T || !App.can.finance) return '';
  style();
  const S = st(ctx.id);
  return `<div class="card ai-cmd no-print" id="ai-box">
    <h3>פקודה לתוכנה · ${esc(T.label)}</h3>
    <p class="small muted" style="margin:0">כתוב במילים שלך מה לעשות בחשבון הזה. התוכנה מציעה את השינויים, ואם משהו לא ברור היא שואלת אותך קודם. שום דבר לא נשמר לפני שתאשר.</p>
    <textarea class="in" id="ai-in" rows="2" aria-label="פקודה לתוכנה" placeholder="${esc(T.ex)}">${esc(S.draft)}</textarea>
    <div class="row"><button class="btn" id="ai-go" type="button">בצע</button><button class="btn plain sm" id="ai-undo" type="button" hidden>בטל את השינוי</button><span class="small muted" id="ai-st"></span></div>
    <div id="ai-out" aria-live="polite"></div></div>`;
}, (ctx) => {
  const box = $('#ai-box', ctx.view); if (!box) return;
  const S = st(ctx.id), kind = ctx.a.kind;
  const inp = $('#ai-in', box), go = $('#ai-go', box), out = $('#ai-out', box), undo = $('#ai-undo', box), stt = $('#ai-st', box);
  let off = false;
  const render = () => {
    go.disabled = off || S.busy; go.textContent = S.busy ? 'מבצע…' : 'בצע';
    undo.hidden = !S.undo || S.busy || !!S.res?.data;
    let h = '';
    const r = S.res;
    if (S.busy) h = '<div class="note info">קורא את החשבון ומכין את השינויים…</div>';
    else if (r) {
      if (r.kind === 'q') h = `<div class="note info"><b>שאלה:</b> ${esc(r.question)}</div><div class="row"><input class="in" id="ai-ans" placeholder="התשובה שלך" autocomplete="off" aria-label="התשובה שלך" style="flex:1 1 200px;width:auto"><button class="btn" type="button" data-ai="ans">שלח תשובה</button><button class="btn plain sm" type="button" data-ai="cancel">בטל</button></div>`;
      else if (r.kind === 'err') h = `<div class="note err">${esc(r.msg)}</div>`;
      else if (r.kind === 'info') h = `<div class="note ${r.ok ? 'ok' : 'info'}">${esc(r.msg)}</div>`;
      else {
        const n = r.up + r.del + r.add, cnt = [r.up ? r.up + ' עודכנו' : '', r.del ? r.del + ' נמחקו' : '', r.add ? r.add + ' נוספו' : ''].filter(Boolean).join(' · ');
        h = `<div class="note ${n ? 'warn' : 'info'}">${esc(r.summary || (n ? 'אלה השינויים המוצעים.' : 'לא בוצע שום שינוי.'))}${cnt ? ` <b>(${cnt})</b>` : ''}${r.sk ? ' · ' + r.sk + ' שינויים לא הובנו ולא יבוצעו' : ''}</div>` +
          (r.lines.length ? `<details class="ai-det" open><summary>פירוט השינויים (${r.lines.length})</summary><ol>${r.lines.slice(0, 300).map(l => '<li>' + esc(l) + '</li>').join('')}</ol></details>` : '') +
          (n && r.data ? `<p class="small muted" style="margin:0">השינוי עוד לא נשמר. בדוק את הפירוט ולחץ ״אשר ושמור״.</p><div class="row"><button class="btn" type="button" data-ai="ok" id="ai-ok">אשר ושמור</button><button class="btn plain" type="button" data-ai="drop">לא לשמור</button></div>` : '');
      }
    }
    const rec = aiRecent(kind);
    if (rec.length && !S.busy) h += `<div class="row ai-rec"><span class="small muted">פקודות אחרונות:</span>${rec.map((x, i) => `<button class="chip" type="button" data-ai-rec="${i}" title="${esc(x)}">${esc(x.length > 40 ? x.slice(0, 40) + '…' : x)}</button>`).join('')}</div>`;
    out.innerHTML = h;
    if (r?.kind === 'q') $('#ai-ans', out)?.focus();
  };
  // 6058-6077
  const run = async () => {
    S.busy = true; S.res = null; render();
    try {
      const j = await post('/api/ai/command', { id: ctx.id, version: ctx.a._version, thread: S.thread });
      S.busy = false;
      if (j.kind === 'q') { S.thread.push({ r: 'a', t: j.question }); S.res = { kind: 'q', question: j.question }; }
      else { S.res = { ...j, opId: uid() }; aiRemember(kind, S.first); S.thread = []; }
    } catch (e) {
      S.busy = false;
      S.res = { kind: 'err', msg: e.status === 409 ? 'החשבון עודכן ממכשיר אחר. רענן את הדף ושלח את הפקודה שוב.' : e.message };
    }
    render();
  };
  const send = () => { if (S.busy || off) return; const v = inp.value.trim(); if (!v) return toast('כתוב מה לעשות בדף'); S.thread = [{ r: 'u', t: v }]; S.first = v; run(); };
  const answer = () => { const i = $('#ai-ans', out), v = i ? i.value.trim() : ''; if (!v) return toast('כתוב תשובה'); if (S.busy) return; S.thread.push({ r: 'u', t: v }); run(); };
  const confirmSave = async (btn) => {
    const r = S.res; if (!r?.data) return;
    btn.disabled = true; btn.textContent = 'שומר…';
    const before = clean(ctx.a);
    try {
      const o = await save('PUT', '/api/accounts/' + ctx.id, { data: r.data, baseVersion: r.version, opId: r.opId, note: 'פקודה חופשית: ' + S.first.slice(0, 300) }, { label: 'פקודה חופשית', queue: false });
      S.undo = { data: before, version: o.version };
      S.res = { kind: 'info', ok: true, msg: 'השינוי נשמר. ' + [r.up ? r.up + ' עודכנו' : '', r.del ? r.del + ' נמחקו' : '', r.add ? r.add + ' נוספו' : ''].filter(Boolean).join(' · ') };
      S.draft = ''; toast('השינוי נשמר');
      await ctx.reload();
    } catch (e) {
      S.res = { kind: 'err', msg: e.status === 409 ? 'החשבון עודכן ממכשיר אחר בזמן הפקודה. השינוי לא נשמר — שלח את הפקודה שוב.' : 'השינוי לא נשמר: ' + e.message };
      render();
    }
  };
  const doUndo = async () => {
    if (!S.undo || S.busy) return;
    if (!confirm('להחזיר את החשבון למה שהיה לפני הפקודה?')) return;
    try {
      await save('PUT', '/api/accounts/' + ctx.id, { data: S.undo.data, baseVersion: S.undo.version, opId: uid(), note: 'ביטול פקודה חופשית' }, { label: 'ביטול פקודה', queue: false });
      S.undo = null; S.res = { kind: 'info', msg: 'השינוי בוטל והחשבון חזר למה שהיה לפני הפקודה.' }; toast('השינוי בוטל');
      await ctx.reload();
    } catch (e) { S.res = { kind: 'err', msg: e.status === 409 ? 'החשבון השתנה מאז הפקודה, ולכן אי אפשר לבטל אוטומטית. תקן ידנית בעריכה.' : e.message }; render(); }
  };
  go.onclick = send;
  inp.oninput = () => { S.draft = inp.value; };
  inp.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
  undo.onclick = doUndo;
  out.onclick = (e) => {
    const b = e.target.closest('[data-ai]');
    if (b) { const a = b.dataset.ai; if (a === 'ans') answer(); else if (a === 'ok') confirmSave(b); else { S.thread = []; S.res = null; render(); } return; }
    const rc = e.target.closest('[data-ai-rec]'); if (rc) { const v = aiRecent(kind)[+rc.dataset.aiRec]; if (v) { inp.value = v; S.draft = v; inp.focus(); } }
  };
  out.onkeydown = (e) => { if (e.key === 'Enter' && e.target && e.target.id === 'ai-ans') { e.preventDefault(); answer(); } };
  render();
  aiStatus().then(s => { if (!s.configured) { off = true; stt.textContent = 'הפקודות דורשות חיבור ל-Claude — הגדרות (ANTHROPIC_API_KEY בשרת).'; render(); } });
});
