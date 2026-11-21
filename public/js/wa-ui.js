// וואטסאפ: שליחה מרוכזת, מסך חיבור, תבניות, הסכמות ומעקב מסירה
import { get, save, uid } from './api.js';
import { $, $$, esc, fmt, money, dmy, when, toast, openSheet, closeSheet, viewState } from './ui.js';
import { App, onLive, STATUS, statusPill } from './app.js';
import { fmtPhone } from './phone.js';

const VARS = ['שם פרטי', 'שם', 'סכום', 'תאריך', 'שעה', 'פירוט', 'גובה'];
const VKEY = { 'שם פרטי': 'first', 'שם': 'name', 'סכום': 'amount', 'תאריך': 'date', 'שעה': 'time', 'פירוט': 'details', 'גובה': 'collector' };
const DEF_DRAFT = 'שלום {שם}, תזכורת: התשלום שלך בסך {סכום} לתאריך {תאריך}. הגובה {גובה} יגיע בשעה {שעה}. תודה!';
const draft = () => { try { return localStorage.getItem('yh_wa_draft') || DEF_DRAFT; } catch { return DEF_DRAFT; } };
const fillDraft = (t, v) => String(t).replace(/\{([^{}]+)\}/g, (m, k) => (VKEY[k.trim()] ? (v[VKEY[k.trim()]] || (k.trim() === 'שעה' ? 'במהלך היום' : '—')) : m));

// ---------- גיליון שליחה ----------
export async function openSendSheet(items, source, { split } = {}) {
  const batchId = uid(); // נוצר פעם אחת לכל משלוח: לחיצה כפולה או ניסיון חוזר לא יוצרים משלוח נוסף
  const st = { merge: true, template: viewState.get('wa').template || '', exclude: new Set(), sending: false, sent: false };
  const s = openSheet(`<div class="hd"><h2>שליחה בוואטסאפ</h2><button class="x" data-close>×</button></div><div id="ws">טוען…</div>`);
  let status = null;
  try { status = await get('/api/wa/status'); } catch (e) { $('#ws', s.el).innerHTML = `<div class="note err">${esc(e.message)}</div>`; return; }
  const approved = status.templates.filter(t => t.status === 'APPROVED');
  if (!st.template && approved[0]) st.template = approved[0].name + '|' + approved[0].language;
  const run = async () => {
    const [tn, tl] = (st.template || '|').split('|');
    let p;
    try { p = await get_prepare(items, st.merge, tn, tl); } catch (e) { $('#ws', s.el).innerHTML = `<div class="note err">${esc(e.message)}</div>`; return; }
    const sendable = p.recipients.filter(r => !r.optOut && !r.needsOptIn && !st.exclude.has(r.phone));
    const needs = p.recipients.filter(r => r.needsOptIn && !r.optOut);
    const tpl = p.template;
    const preview = (r) => tpl ? r.preview : fillDraft(draft(), r.vars);
    $('#ws', s.el).innerHTML = `
    ${!status.configured ? `<div class="note warn"><b>החיבור לוואטסאפ העסקי עוד לא הושלם.</b> אפשר לבדוק את הרשימה והתצוגה המקדימה, אבל השליחה תופעל אחרי החיבור. <a href="#/wa" data-close>מה חסר?</a></div>` : ''}
    <div class="grid" style="grid-template-columns:1fr">
      <label class="f">תבנית מאושרת<select class="in" id="wt">${status.templates.length ? status.templates.map(t => `<option value="${esc(t.name + '|' + t.language)}" ${st.template === t.name + '|' + t.language ? 'selected' : ''} ${t.status !== 'APPROVED' ? 'disabled' : ''}>${esc(t.name)} (${esc(t.language)})${t.status !== 'APPROVED' ? ' — ' + esc(t.status) : ''}</option>`).join('') : '<option value="">אין תבניות מאושרות עדיין</option>'}</select></label>
      ${split ? `<label class="row" style="font-weight:600"><input type="checkbox" id="wm" ${st.merge ? 'checked' : ''} style="width:22px;height:22px"> לקוח עם כמה שורות — הודעה אחת עם פירוט וסכום כולל</label>` : ''}
      <div class="row"><button class="btn ghost sm" id="wedit">עריכת נוסח התבנית</button><span class="small muted">${tpl ? 'נוסח מאושר: ' + esc(tpl.body).slice(0, 80) + '…' : 'נוסח טיוטה (לא מאושר עדיין)'}</span></div>
    </div>
    <h3>תצוגה מקדימה לכל נמען (${p.recipients.length})</h3>
    <div class="list">${p.recipients.map(r => `<div class="li"><input type="checkbox" class="ck" data-ex="${r.phone}" ${st.exclude.has(r.phone) || r.optOut || r.needsOptIn ? '' : 'checked'} ${r.optOut || r.needsOptIn ? 'disabled' : ''}><div class="t">${esc(r.name)} ${r.count > 1 ? `<span class="pill acc">${r.count} שורות אוחדו</span>` : ''}${r.optOut ? ' <span class="pill err">ביקש הסרה</span>' : r.needsOptIn ? ' <span class="pill warn">אין הסכמה מתועדת</span>' : ''}${r.resolved ? ' <span class="pill">מספר מההיסטוריה</span>' : ''}</div><div class="a">${esc(r.vars.amount)}</div>
      <div class="m"><span>${esc(fmtPhone(r.phone))}</span>${r.vars.time ? `<span>שעה ${esc(r.vars.time)}</span>` : ''}</div>
      <details style="grid-column:1/-1"><summary class="small">הצג את ההודעה</summary><div class="preview">${esc(preview(r))}</div></details></div>`).join('') || '<div class="empty">אין נמענים תקינים</div>'}</div>
    ${needs.length ? `<div class="note warn"><b>${needs.length} נמענים בלי הסכמה מתועדת לקבל הודעות.</b> Meta מחייבת הסכמה של הלקוח. אם הלקוחות האלה הסכימו (בעל-פה, בחוזה או בהודעה), תעד זאת:
      <div class="row" style="margin-top:6px"><input class="in" id="wsrc" placeholder="איך התקבלה ההסכמה? למשל: אישרו בעל-פה לגובה" style="flex:1;min-width:200px"><button class="btn sm" id="woptin">תעד הסכמה ל-${needs.length}</button></div></div>` : ''}
    ${p.blocked.length ? `<div class="note err"><b>נעצר — אותו מספר משויך ליותר מלקוח אחד (${p.blocked.length}):</b>${p.blocked.map(b => `<div class="row" style="margin-top:6px"><span class="num">${esc(fmtPhone(b.phone))}</span>: ${b.names.map(n => `<button class="btn sm ghost" data-own="${esc(b.phone)}|${esc(n)}">שייך ל-${esc(n)}</button>`).join(' ')}</div>`).join('')}<div class="small">אחרי אישור השיוך המספר יישלח רק לשם שבחרת.</div></div>` : ''}
    ${p.skipped.length ? `<div class="note warn"><b>דולגו — מספר חסר או לא תקין (${p.skipped.length}). לתיקון:</b><ul style="margin:4px 0;padding-inline-start:18px">${p.skipped.map(x => `<li>${esc(x.name)} — ${esc(x.reason)}${x.phone ? ` (${esc(x.phone)})` : ''} ${source && source.id ? `<a href="#/acc/${source.id}?hl=${encodeURIComponent(x.ref)}" data-close>לשורה</a>` : ''}</li>`).join('')}</ul></div>` : ''}
    <div id="werr"></div>
    <div class="actionbar" style="bottom:0"><button class="btn wa xl" id="wgo" ${sendable.length && status.configured && tpl ? '' : 'disabled'}>שלח בוואטסאפ ל־${sendable.length} לקוחות</button>
    ${!tpl && status.configured ? '<div class="small muted">בחר תבנית מאושרת כדי לשלוח</div>' : ''}</div>`;
    const wt = $('#wt', s.el); wt.onchange = () => { st.template = wt.value; viewState.set('wa', { template: wt.value }); run(); };
    const wm = $('#wm', s.el); if (wm) wm.onchange = () => { st.merge = wm.checked; run(); };
    $$('[data-ex]', s.el).forEach(c => c.onchange = () => { c.checked ? st.exclude.delete(c.dataset.ex) : st.exclude.add(c.dataset.ex); const n = p.recipients.filter(r => !r.optOut && !r.needsOptIn && !st.exclude.has(r.phone)).length; $('#wgo', s.el).textContent = `שלח בוואטסאפ ל־${n} לקוחות`; $('#wgo', s.el).disabled = !n || !status.configured || !tpl; });
    $('#wedit', s.el).onclick = () => templateEditor(() => run());
    const oi = $('#woptin', s.el); if (oi) oi.onclick = async () => {
      const src = $('#wsrc', s.el).value.trim(); if (!src) { $('#wsrc', s.el).focus(); return toast('כתוב איך התקבלה ההסכמה'); }
      try { await save('POST', '/api/wa/consent', { phones: needs.map(r => r.phone), status: 'opt_in', source: src }, { queue: false }); toast('ההסכמה תועדה'); run(); } catch (e) { toast(e.message); }
    };
    $$('[data-own]', s.el).forEach(b => b.onclick = async () => { const [phone, name] = b.dataset.own.split('|'); try { await save('POST', '/api/wa/phone-owner', { phone, name: name.trim().toLowerCase().replace(/\s+/g, ' ') }, { queue: false }); toast('השיוך אושר'); run(); } catch (e) { toast(e.message); } });
    $('#wgo', s.el).onclick = async (ev) => {
      if (st.sending) return; st.sending = true; ev.target.disabled = true; ev.target.textContent = 'שולח…';
      try {
        const r = await save('POST', '/api/wa/batches', { batchId, opId: batchId, items: items.map(slim), merge: st.merge, template: tn, language: tl, exclude: [...st.exclude], source }, { queue: false });
        closeSheet(); location.hash = '#/batch/' + r.id;
      } catch (e) {
        st.sending = false; ev.target.disabled = false; ev.target.textContent = `שלח שוב (לא יישלח פעמיים)`;
        $('#werr', s.el).innerHTML = `<div class="note err">${esc(e.network ? 'לא ברור אם הבקשה נקלטה בגלל בעיית קליטה. לחץ שוב — המשלוח לא ייווצר פעמיים.' : e.message)}</div>`;
      }
    };
  };
  run();
}
const slim = (i) => ({ ref: i.ref, name: i.name, phone: i.phone, amount: i.amount, time: i.time, collector: i.collector, date: i.date });
const get_prepare = (items, merge, template, language) => save('POST', '/api/wa/prepare', { items: items.map(slim), merge, template, language }, { queue: false });

function templateEditor(done) {
  const s = openSheet(`<div class="hd"><h2>נוסח ההודעה</h2><button class="x" data-close>×</button></div>
    <p class="small muted">משתנים: ${VARS.map(v => `<button class="chip" data-v="${v}">{${v}}</button>`).join(' ')}</p>
    <textarea class="in" id="td" style="min-height:140px">${esc(draft())}</textarea>
    <div class="preview" id="tp"></div>
    <div class="note info small">וואטסאפ עסקי מאפשר לשלוח ללקוחות הודעה יזומה רק בנוסח שאושר מראש על ידי Meta. שינוי נוסח = תבנית חדשה שנשלחת לאישור (בדרך כלל דקות עד שעות). המשתנים יכולים להשתנות לכל לקוח בלי אישור חדש.</div>
    ${App.can.waConfig ? `<div class="grid"><label class="f">שם התבנית באנגלית (אותיות קטנות וקו תחתון)<input class="in" id="tn" value="collection_reminder_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}" dir="ltr"></label>
    <label class="f">סוג<select class="in" id="tc"><option value="UTILITY">שירות / תזכורת תשלום (UTILITY)</option><option value="MARKETING">שיווקי (MARKETING)</option></select></label></div>
    <div id="terr"></div><div class="row" style="margin-top:10px"><button class="btn" id="tsub">שמור ושלח לאישור Meta</button><button class="btn ghost" id="tsave">שמור טיוטה בלבד</button></div>` : '<button class="btn" id="tsave">שמור טיוטה</button>'}`);
  const upd = () => { $('#tp', s.el).textContent = fillDraft($('#td', s.el).value, { first: 'ישראל', name: 'ישראל ישראלי', amount: '1,250 ₪', date: '21.11.2026', time: '18:30', details: '800 ₪ + 450 ₪', collector: 'בן' }); };
  $('#td', s.el).oninput = upd; upd();
  $$('[data-v]', s.el).forEach(b => b.onclick = () => { const t = $('#td', s.el); const p = t.selectionStart; t.value = t.value.slice(0, p) + '{' + b.dataset.v + '}' + t.value.slice(t.selectionEnd); upd(); t.focus(); });
  $('#tsave', s.el).onclick = () => { try { localStorage.setItem('yh_wa_draft', $('#td', s.el).value); } catch { /* */ } toast('הטיוטה נשמרה'); s.close(); done && done(); };
  const sub = $('#tsub', s.el); if (sub) sub.onclick = async () => {
    sub.disabled = true;
    try { localStorage.setItem('yh_wa_draft', $('#td', s.el).value); await save('POST', '/api/wa/templates', { name: $('#tn', s.el).value.trim(), category: $('#tc', s.el).value, language: 'he', text: $('#td', s.el).value }, { queue: false }); toast('נשלח לאישור Meta'); await save('POST', '/api/wa/templates/sync', {}, { queue: false }).catch(() => {}); s.close(); done && done(); }
    catch (e) { sub.disabled = false; $('#terr', s.el).innerHTML = `<div class="note err">${esc(e.message)}</div>`; }
  };
}

// ---------- מסך וואטסאפ: חיבור, תבניות, הסכמות, משלוחים ----------
export async function renderWa(view) {
  const [st, batches, consent] = await Promise.all([get('/api/wa/status'), get('/api/wa/batches'), get('/api/wa/consent')]);
  const ph = st.phone;
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">WhatsApp Business Platform</div><h1>וואטסאפ עסקי</h1></div></div>
  <div class="card"><div class="row sp"><h2>חיבור החשבון העסקי</h2>${st.configured && !st.error ? '<span class="pill ok">מחובר</span>' : '<span class="pill warn">לא הושלם</span>'}</div>
    ${ph ? `<dl class="kv"><dt>מספר עסקי</dt><dd class="num">${esc(ph.display_phone_number)}</dd><dt>שם מאומת</dt><dd>${esc(ph.verified_name || '')}</dd><dt>איכות</dt><dd>${esc(ph.quality_rating || '')}</dd>${ph.messaging_limit_tier ? `<dt>מכסת שליחה</dt><dd>${esc(ph.messaging_limit_tier)}</dd>` : ''}</dl>` : ''}
    ${st.error ? `<div class="note err">${esc(st.error)}</div>` : ''}
    <ul style="list-style:none;padding:0;margin:8px 0">${st.items.map(i => `<li style="padding:6px 0;border-top:1px solid var(--line)">${i.ok ? '✅' : '⬜'} <b dir="ltr">${esc(i.key)}</b> — ${esc(i.label)}</li>`).join('')}</ul>
    ${!st.configured ? `<details><summary>מה צריך לעשות כדי לחבר?</summary><ol class="small" style="padding-inline-start:20px">
      <li>ב-Meta Business Suite: צור/בחר חשבון WhatsApp Business ורשום מספר טלפון עסקי (מספר שאינו פעיל באפליקציית וואטסאפ רגילה).</li>
      <li>ב-developers.facebook.com: צור אפליקציה מסוג Business והוסף את המוצר WhatsApp.</li>
      <li>ב-Business Settings ← System Users: צור משתמש מערכת, שייך אותו לאפליקציה ולחשבון הוואטסאפ, והפק אסימון קבוע עם ההרשאות whatsapp_business_messaging ו-whatsapp_business_management.</li>
      <li>העתק מתוך WhatsApp ← API Setup את Phone number ID ואת WhatsApp Business Account ID, ומתוך App Settings ← Basic את ה-App Secret.</li>
      <li>הזן את הערכים בהגדרות השרת (משתני סביבה) והפעל מחדש.</li>
      <li>ב-WhatsApp ← Configuration הגדר Webhook לכתובת <b dir="ltr">${esc(st.webhookUrl || 'https://<הכתובת-שלך>/webhooks/whatsapp')}</b> עם אותה סיסמת אימות, וסמן את השדה messages.</li></ol></details>` : ''}
    ${st.webhookUrl ? `<p class="small">כתובת ה-Webhook: <b dir="ltr">${esc(st.webhookUrl)}</b> · דיווח אחרון: ${st.lastWebhookAt ? when(st.lastWebhookAt) : 'עוד לא התקבל'}</p>` : ''}</div>
  <div class="card"><div class="row sp"><h2>תבניות (${st.templates.length})</h2><div class="row"><button class="btn ghost sm" id="tsync" ${st.configured ? '' : 'disabled'}>סנכרון מ-Meta</button><button class="btn sm" id="tnew">נוסח חדש</button></div></div>
    ${st.templates.length ? `<div class="list">${st.templates.map(t => `<div class="li noc"><div class="t">${esc(t.name)} <span class="pill ${t.status === 'APPROVED' ? 'ok' : t.status === 'REJECTED' ? 'err' : 'warn'}">${esc({ APPROVED: 'מאושרת', PENDING: 'ממתינה לאישור', REJECTED: 'נדחתה', PAUSED: 'מושהית' }[t.status] || t.status)}</span></div><div class="a small">${esc(t.language)}</div><div class="m"><span>${esc(t.body)}</span></div>
      ${App.can.waConfig ? `<div class="m">משתנים לפי הסדר: <input class="in" style="min-height:32px;max-width:340px" data-map="${esc(t.name + '|' + t.language)}" value="${esc(((st.maps[t.name + ':' + t.language] || {}).order || []).map(k => Object.entries(VKEY).find(([, v]) => v === k)?.[0] || k).join(', '))}" placeholder="שם, סכום, תאריך, שעה"></div>` : ''}</div>`).join('')}</div>` : '<div class="empty">אין תבניות עדיין. צור נוסח ושלח לאישור Meta.</div>'}</div>
  <div class="card"><h2>הסכמה והסרה</h2>
    ${App.can.waConfig ? `<label class="row" style="font-weight:600"><input type="checkbox" id="reqopt" ${st.requireOptIn ? 'checked' : ''} style="width:22px;height:22px"> לשלוח רק ללקוחות שההסכמה שלהם מתועדת (מומלץ, לפי דרישות Meta)</label>` : ''}
    <p class="small muted">לקוח שמשיב ״הסר״ / ״הסרה״ / STOP מוסר אוטומטית ולא יקבל הודעות. לקוח שמשיב ״הרשמה״ נרשם כמסכים.</p>
    <div class="row"><input class="in" id="ooph" placeholder="מספר להסרה ידנית" style="max-width:220px" inputmode="tel"><button class="btn ghost sm" id="oobtn">הסר מהודעות</button></div>
    ${consent.length ? `<details style="margin-top:8px"><summary>${consent.filter(c => c.status === 'opt_out').length} הוסרו · ${consent.filter(c => c.status === 'opt_in').length} הסכימו</summary><div class="list">${consent.map(c => `<div class="li noc"><div class="t num">${esc(fmtPhone(c.phone))}</div><div class="a">${c.status === 'opt_out' ? '<span class="pill err">הוסר</span>' : '<span class="pill ok">הסכים</span>'}</div><div class="m"><span>${esc(c.source || '')}</span><span>${when(c.at)}</span><span>${esc(c.by || '')}</span></div></div>`).join('')}</div></details>` : ''}</div>
  <div class="card"><h2>משלוחים אחרונים</h2>${batches.length ? `<div class="list">${batches.map(b => `<a class="li noc link" href="#/batch/${b.id}" style="text-decoration:none;color:inherit"><div class="t">${esc(b.source_title || 'משלוח')} · ${b.total} נמענים</div><div class="a small">${when(b.created_at)}</div><div class="m">${countsLine(b.counts)}</div></a>`).join('')}</div>` : '<div class="empty">עוד לא נשלחו הודעות</div>'}</div>`;
  const ts = $('#tsync'); ts.onclick = async () => { ts.disabled = true; try { const r = await save('POST', '/api/wa/templates/sync', {}, { queue: false }); toast(r.count + ' תבניות סונכרנו'); renderWa(view); } catch (e) { toast(e.message); ts.disabled = false; } };
  $('#tnew').onclick = () => templateEditor(() => renderWa(view));
  const ro = $('#reqopt'); if (ro) ro.onchange = async () => { await save('POST', '/api/wa/settings', { requireOptIn: ro.checked }, { queue: false }); toast('נשמר'); };
  $('#oobtn').onclick = async () => { const p = $('#ooph').value; if (!p) return; try { await save('POST', '/api/wa/consent', { phones: [p], status: 'opt_out', source: 'הסרה ידנית' }, { queue: false }); toast('הוסר'); renderWa(view); } catch (e) { toast(e.message); } };
  $$('[data-map]', view).forEach(inp => inp.onchange = async () => {
    const [name, language] = inp.dataset.map.split('|');
    const order = inp.value.split(/[,،]/).map(x => x.trim()).filter(Boolean).map(x => VKEY[x] || x);
    if (order.some(k => !Object.values(VKEY).includes(k))) return toast('משתנה לא מוכר. אפשר: ' + VARS.join(', '));
    await save('POST', '/api/wa/templates/map', { name, language, order }, { queue: false }); toast('המיפוי נשמר');
  });
}
const countsLine = (c) => {
  const q = (c.queued || 0) + (c.sending || 0), s = c.sent || 0, d = (c.delivered || 0) + (c.read || 0), f = (c.failed || 0) + (c.unknown || 0);
  return `<span>ממתינות ${q}</span><span>נשלחו ${s}</span><span>נמסרו ${d}</span><span class="${f ? 'neg' : ''}">נכשלו ${f}</span>${c.skipped ? `<span>דולגו ${c.skipped}</span>` : ''}`;
};

export async function renderBatch(view, [id]) {
  let timer = null; let filter = viewState.get('batch:' + id).f || '';
  const draw = async () => {
    const b = await get('/api/wa/batches/' + id);
    const c = b.counts; const q = (c.queued || 0) + (c.sending || 0), s = c.sent || 0, d = (c.delivered || 0) + (c.read || 0), f = (c.failed || 0) + (c.unknown || 0), k = c.skipped || 0, T = b.total || 1;
    const groups = { '': () => true, q: m => ['queued', 'sending'].includes(m.status), s: m => m.status === 'sent', d: m => ['delivered', 'read'].includes(m.status), f: m => ['failed', 'unknown'].includes(m.status), k: m => m.status === 'skipped' };
    const ms = b.messages.filter(groups[filter] || groups['']);
    view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">משלוח וואטסאפ · ${when(b.created_at)}</div><h1>${esc(b.source_title || 'משלוח')}</h1><div class="small" style="color:var(--band-muted)">תבנית ${esc(b.template_name)} · ${b.total} נמענים · ע״י ${esc(b.created_by)}</div></div></div>
    <div class="kpis">${[['q', 'ממתינות', q, ''], ['s', 'נשלחו', s, ''], ['d', 'נמסרו', d, 'good'], ['f', 'נכשלו', f, f ? 'bad' : ''], ...(k ? [['k', 'דולגו (הסרה)', k, '']] : [])].map(([key, l, n, cls]) => `<button class="kpi ${cls}" data-f="${key}" aria-pressed="${filter === key}"><div class="l">${l}</div><div class="v">${n}</div></button>`).join('')}</div>
    <div class="card"><div class="bar"><i style="width:${d / T * 100}%;background:var(--ok-fg)"></i><i style="width:${s / T * 100}%;background:var(--accent)"></i><i style="width:${f / T * 100}%;background:var(--neg)"></i></div>
    <div class="legend" style="margin-top:6px"><span style="--c:var(--ok-fg)">נמסרו/נקראו</span><span style="--c:var(--accent)">נשלחו (ממתין לאישור מסירה)</span><span style="--c:var(--neg)">נכשלו</span></div>
    <p class="small muted">״נשלחה״ מוצג רק אחרי ש-Meta אישרה את קבלת ההודעה. ״נמסרה״ ו״נקראה״ מתעדכנים לפי הדיווח שמגיע מ-Meta. אפשר לסגור את המסך ולחזור מאוחר יותר.</p>
    ${f ? `<button class="btn danger" id="retry">נסה שוב רק את ${f} שנכשלו</button>` : ''}</div>
    <div class="card"><div class="row sp"><h2>${filter ? 'מסונן' : 'כל ההודעות'} (${ms.length})</h2>${filter ? '<button class="btn ghost sm" data-f="">הצג הכול</button>' : ''}</div>
    <div class="list">${ms.map(m => `<div class="li noc"><div class="t">${esc(m.client_name)}</div><div class="a">${statusPill(m.status)}</div><div class="m"><span class="num">${esc(fmtPhone(m.phone))}</span>${m.error_text ? `<span class="neg">${esc(m.error_text)}</span>` : ''}${m.attempts > 1 ? `<span>${m.attempts} ניסיונות</span>` : ''}</div><details style="grid-column:1/-1"><summary class="small">ההודעה</summary><div class="preview">${esc(m.preview)}</div></details></div>`).join('')}</div></div>`;
    $$('[data-f]', view).forEach(x => x.onclick = () => { filter = x.dataset.f; viewState.set('batch:' + id, { f: filter }); draw(); });
    const rb = $('#retry', view); if (rb) { const op = uid(); rb.onclick = async () => { rb.disabled = true; try { const r = await save('POST', `/api/wa/batches/${id}/retry`, { opId: op }, { queue: false }); toast(r.requeued + ' הודעות חזרו לתור'); draw(); } catch (e) { rb.disabled = false; toast(e.message); } }; }
    clearTimeout(timer); if (q || s) timer = setTimeout(draw, q ? 2000 : 6000);
  };
  await draw();
  return () => clearTimeout(timer);
}
