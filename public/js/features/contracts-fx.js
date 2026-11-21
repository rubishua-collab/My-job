// חוזים לחתימה: סריקת ת״ז ועוזר המילוי (העתק של app.html שורות 7976-8573).
// סריקת ת״ז של הלקוח (צד קדמי, ואם רוצים גם הספח), טופס קצר לאישור הפרטים, ועוזר שמוצא בחוזה אחר את המקומות למילוי
// וממלא בהם את פרטי הת״ז. שום מילה אחרת בחוזה לא משתנה. כל חוזה חדש מתחיל בלי שום פרט מהלקוח הקודם.
// קריאה מתמונה ושיחה עם העוזר עוברות דרך POST /api/ai/extract (של יכולת ה-AI). בלי חיבור ל-Claude (503): הקלדה ידנית,
// וזיהוי השדות נעשה בכללים קבועים (בלי ניחוש של Claude).
import { esc, sgFmtNum } from './contracts-core.js';
import { toast, openSheet } from '../ui.js';

export const AI_OFF = 'קריאת תמונות דורשת חיבור ל-Claude — הגדרות';
// קריאה ל-AI. מחזיר את data (אובייקט) או זורק {code}
// שמות המשימות בשרת (server/features/ai.js): משימה שאין לה הנחיה קבועה בשרת נשלחת כ-custom, והטקסט הוא ההנחיה המלאה
const AI_TASK = { id_card: 'id_card', contract_import: 'contract_import', contract_review: 'contract_review', ocr: 'contract_ocr', contract_ocr: 'contract_ocr', contract_detect: 'contract_detect' };
export async function aiAsk(task, text, images, schema) {
  task = AI_TASK[task] || 'custom';
  let r;
  try { r = await fetch('/api/ai/extract', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, text, images: images || [], schema }) }); }
  catch (e) { throw { code: 'network' }; }
  if (r.status === 503 || r.status === 404) throw { code: 'no_ai' };
  let j = null; try { j = await r.json(); } catch { /* */ }
  if (r.status === 429) throw { code: 'rate_limited' };
  if (!r.ok || !j) throw { code: 'failed', message: j && j.error };
  let d = j.data !== undefined ? j.data : j;
  if (typeof d === 'string') { const t = d, a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) { try { d = JSON.parse(t.slice(a, b + 1)); } catch { d = { text: t }; } } else d = { text: t }; }
  return d;
}
export function sampleErr(e) {
  const c = e && e.code;
  if (c === 'no_ai') return AI_OFF;
  if (c === 'rate_limited') return 'יותר מדי בקשות כרגע. נסה שוב בעוד כמה דקות.';
  if (c === 'invalid_json') return 'לא הצלחתי לקרוא את התוצאה. נסה שוב או פצל את הצילום.';
  if (c === 'image_rejected') return 'הצילום לא התקבל. נסה קובץ PNG או JPG אחר.';
  if (c === 'network') return 'אין חיבור לשרת.';
  return 'הקריאה נכשלה. נסה שוב.' + (e && e.message ? ' (' + e.message + ')' : '');
}
let aiOk = true; // מתעדכן אחרי תשובת 503 — כדי להציג הקלדה ידנית במקום כפתורי זיהוי
export const aiAvailable = () => aiOk;
export const markAi = (e) => { if (e && e.code === 'no_ai') aiOk = false; };

const FX_ID = ['fullName', 'firstName', 'lastName', 'idNumber', 'birthDate', 'address'];
const FX_ALL = new Set(FX_ID.concat(['phone', 'email', 'date', 'amount', 'signature', 'other']));
const FX_HE = { fullName: 'שם מלא', firstName: 'שם פרטי', lastName: 'שם משפחה', idNumber: 'מספר ת״ז', birthDate: 'תאריך לידה', address: 'כתובת', phone: 'טלפון', email: 'אימייל', date: 'תאריך', amount: 'סכום', signature: 'חתימה', other: 'פרט להשלמה' };
export const FX = { seq: 0, busy: false, busyId: false, st: null, client: null, draft: null, form: false, idNew: { front: null, back: null }, idSaved: { front: null, back: null }, idList: [], recId: null, edit: null, askFree: false, sheet: null };
const fx$ = id => document.getElementById('sg-fx' + id);
// חיבור לטופס: H = {SG, sgF, onTemplateChange, schedulePrep, refreshDefault}
let H = null;
export const fxBind = (h) => { H = h; };
const fxTa = () => H.sgF('fText');

/* מספר ת״ז ישראלי: 9 ספרות, ספרת ביקורת לפי משקלים 1,2,1,2… */
const fxDigits = v => String(v || '').replace(/\D/g, '');
export function fxIdValid(v) {
  v = fxDigits(v); if (!v || v.length > 9) return false;
  v = v.padStart(9, '0'); let s = 0;
  for (let i = 0; i < 9; i++) { let d = Number(v[i]) * ((i % 2) + 1); if (d > 9) d -= 9; s += d; }
  return s % 10 === 0;
}
function fxNormDate(s) {
  const t = String(s || '').trim(), m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return t;
  let y = m[3]; if (y.length === 2) y = (Number(y) > 30 ? '19' : '20') + y;
  return m[1].padStart(2, '0') + '.' + m[2].padStart(2, '0') + '.' + y;
}
function fxVal(cl, f) {
  if (!cl || !cl.ok) return '';
  if (f === 'fullName') return [cl.firstName, cl.lastName].map(x => String(x || '').trim()).filter(Boolean).join(' ');
  if (f === 'idNumber') { const d = fxDigits(cl.idNumber); return d ? d.padStart(9, '0') : ''; }
  return String(cl[f] || '').trim();
}

/* ---------- מציאת המקומות הריקים בטקסט (קבוע, בלי ניחוש) ---------- */
export function fxFind(t) {
  const out = [];
  const add = (s, e, kind) => {
    if (e < s) return;
    if (out.some(o => (s < o.e && e > o.s) || (s === e && s >= o.s && s <= o.e) || (o.s === o.e && o.s >= s && o.s <= e))) return;
    out.push({ s, e, kind });
  };
  let m;
  const reU = /[_‗＿]{3,}/g; while ((m = reU.exec(t))) add(m.index, m.index + m[0].length, 'line');
  const reD = /(?:\.[ \t]?){5,}|…{2,}/g;
  while ((m = reD.exec(t))) { let e = m.index + m[0].length; while (e > m.index && /[ \t]/.test(t[e - 1])) e--; add(m.index, e, 'dots'); }
  const reL = /[:：]([ \t]*)(?=\n|$)/g;
  while ((m = reL.exec(t))) { const p = t[m.index - 1] || ''; if (!p || /[\s\d]/.test(p)) continue; const s = m.index + 1; add(s, s + m[1].length, 'after'); }
  let ls = 0;
  for (const line of t.split('\n')) {
    if (line.indexOf('|') >= 0) {
      const parts = line.split('|'); let p = 0;
      parts.forEach((cell, ci) => {
        const cs = ls + p, edge = (ci === 0 || ci === parts.length - 1) && cell.length === 0;
        if (!edge && !cell.trim()) add(cs, cs + cell.length, 'cell');
        p += cell.length + 1;
      });
    }
    ls += line.length + 1;
  }
  out.sort((a, b) => a.s - b.s);
  return out.slice(0, 400).map((x, i) => Object.assign(x, { id: 'S' + (i + 1), orig: t.slice(x.s, x.e) }));
}
const fxMark = (t, slots) => { let o = '', p = 0; slots.forEach(sl => { o += t.slice(p, sl.s) + '⟦' + sl.id + '⟧'; p = sl.e; }); return o + t.slice(p); };
function fxAnchor(t, slots, x) {
  const a = String((x && x.after) || ''); if (a.length < 3 || a.length > 60) return null;
  const i = t.indexOf(a); if (i < 0 || t.indexOf(a, i + 1) >= 0) return null;
  const s = i + a.length; let e = s; while (e < t.length && /[ \t]/.test(t[e])) e++;
  if (slots.some(o => s <= o.e && e >= o.s)) return null;
  return { s, e, kind: 'after', orig: t.slice(s, e) };
}
const fxRenum = slots => { slots.sort((a, b) => a.s - b.s); slots.forEach((sl, i) => { sl.id = 'S' + (i + 1); }); return slots; };

/* ---------- הרכבת הטקסט: המקור + הערכים במקומות הריקים ---------- */
function fxSlotStr(base, sl) {
  if (!sl.value) return sl.orig;
  const v = sl.value;
  if (sl.kind === 'line' || sl.kind === 'dots') return v;
  if (sl.kind === 'cell') return ' ' + v + ' ';
  const prev = base[sl.s - 1] || '', next = base[sl.e] || '';
  return (!prev || /\s/.test(prev) ? '' : ' ') + v + (!next || /\s/.test(next) ? '' : ' ');
}
const fxCompose = st => { let o = '', p = 0; st.slots.forEach(sl => { o += st.base.slice(p, sl.s) + fxSlotStr(st.base, sl); p = sl.e; }); return o + st.base.slice(p); };
function fxApplyText() { const ta = fxTa(); ta.value = fxCompose(FX.st); H.SG.textTouched = true; H.onTemplateChange(); H.schedulePrep(); }
function fxPvHTML() {
  const st = FX.st; let h = '', p = 0;
  st.slots.forEach(sl => {
    h += esc(st.base.slice(p, sl.s)); p = sl.e;
    const lab = sl.label || FX_HE[sl.field] || 'להשלמה';
    if (sl.value) {
      const str = fxSlotStr(st.base, sl), i = str.indexOf(sl.value);
      h += esc(str.slice(0, i)) + '<button type="button" class="fx-f ok" data-slot="' + sl.id + '" title="' + esc(lab) + '">' + esc(sl.value) + '</button>' + esc(str.slice(i + sl.value.length));
    } else if (sl.field === 'signature') h += '<button type="button" class="fx-f sig" data-slot="' + sl.id + '">' + esc(lab) + '</button>';
    else h += '<button type="button" class="fx-f miss" data-slot="' + sl.id + '">' + esc(lab) + '</button>';
  });
  return h + esc(st.base.slice(p));
}
function fxCounts() {
  const st = FX.st; if (!st) return { filled: 0, missing: 0, labels: [] };
  const filled = st.slots.filter(s => s.value).length, miss = st.slots.filter(s => !s.value && s.field !== 'signature'), labels = [];
  miss.forEach(s => { const l = s.label || FX_HE[s.field]; if (l && labels.indexOf(l) < 0) labels.push(l); });
  return { filled, missing: miss.length, labels };
}
function fxPartyName(key) { const p = ((FX.st && FX.st.parties) || []).find(x => x.key === key); return p ? (p.name + (p.role && p.role !== p.name ? ' (' + p.role + ')' : '')) : ''; }
function fxApplyClient() {
  const st = FX.st; if (!st) return 0;
  const multi = (st.parties || []).length > 1; let n = 0;
  st.slots.forEach(sl => {
    if (FX_ID.indexOf(sl.field) < 0 || sl.src === 'manual') return;
    const mine = !multi || (st.clientParty && sl.party === st.clientParty);
    const v = mine ? fxVal(FX.client, sl.field) : '';
    if (v) { sl.value = v; sl.src = 'id'; n++; } else if (sl.src === 'id') { sl.value = ''; sl.src = ''; }
  });
  return n;
}
function fxSummary() {
  const st = FX.st, k = fxCounts(); let t = '';
  if (!(FX.client && FX.client.ok)) t += 'כדי למלא את פרטי הלקוח, סרוק את תעודת הזהות שלו למעלה. ';
  else if (st.parties.length > 1 && st.clientParty) t += 'הלקוח: ' + fxPartyName(st.clientParty) + '. ';
  t += k.filled ? 'מולאו ' + sgFmtNum(k.filled) + ' מקומות.' : 'עוד לא מולא אף מקום.';
  if (k.missing) t += ' ' + sgFmtNum(k.missing) + ' מסומנים באדום להשלמה ידנית: ' + k.labels.slice(0, 6).join(', ') + (k.labels.length > 6 ? ' ועוד' : '') + '.';
  return t + ' לחיצה על כל שדה פותחת עריכה.';
}
function fxSay(text, opts) { if (!FX.st) return; FX.st.msgs.push({ who: 'bot', text, opts: opts || null }); if (FX.st.msgs.length > 60) FX.st.msgs.splice(0, FX.st.msgs.length - 60); }
const fxReask = () => FX.st && FX.st.parties.length > 1 ? [{ label: 'הלקוח בצד אחר', act: 'reask' }] : null;
function fxAskParty() { const st = FX.st; fxSay('בחוזה יש ' + sgFmtNum(st.parties.length) + ' צדדים. לאיזה צד שייך הלקוח?', st.parties.map(p => ({ label: fxPartyName(p.key), act: 'party', val: p.key }))); }
function fxSetParty(key) {
  const st = FX.st; if (!st || !st.parties.some(p => p.key === key)) return;
  st.clientParty = key; st.msgs.push({ who: 'me', text: fxPartyName(key) });
  fxApplyClient(); fxApplyText();
  fxSay(fxSummary(), fxReask()); fxRender();
}

/* ---------- העוזר: זיהוי השדות ---------- */
function fxDetectPrompt(marked) {
  return ['You help fill in a contract. Below is the full text of the contract, exactly as written. Every place the program found that might need to be filled in is marked ⟦S1⟧, ⟦S2⟧ and so on: blank lines (____), dotted lines, empty table cells, or a label that ends with a colon and has nothing after it.',
    '',
    '1. Identify the parties of the contract (for example צד א׳ / צד ב׳, המלווה / הלווה, המשכיר / השוכר, המוכר / הקונה). For each party give a short key ("A", "B", "C"…), the name the contract uses for it (in Hebrew, as written) and its role if the contract states one. If the contract does not name parties, return an empty list.',
    '2. For EVERY marker decide what should be written there:',
    '   - field: one of fullName, firstName, lastName, idNumber, birthDate, address, phone, email, date, amount, signature, other, none. Use fullName for a place that asks for a person\'s name (שם, שם מלא); firstName and lastName only when the contract asks for them separately. "none" means it is not a place to fill in, for example a heading that ends with a colon.',
    '   - party: the key of the party this place belongs to, or "" if it does not belong to one party (contract date, amount, place of signing…). In a table of the parties\' details, use the row and the column header.',
    '   - label: a short Hebrew description of what goes there, for example "שם המשכיר", "ת.ז. השוכר", "תאריך החוזה", "סכום ההלוואה".',
    '3. Optionally list up to 20 more places to fill in that have NO marker, for example "ת.ז. מס׳" followed directly by other text. For each give "after": the exact text from the contract, copied character for character, 4 to 40 characters long and appearing only once in the contract, that comes right before the empty place; plus field, party and label.',
    '',
    'Rules: do not assume what kind of contract this is, do not add clauses, and do not suggest changing any wording.',
    'Reply with only JSON in this shape:',
    '{"parties":[{"key":"A","name":"","role":""}],"slots":[{"id":"S1","field":"","party":"","label":""}],"extra":[{"after":"","field":"","party":"","label":""}]}',
    '', 'CONTRACT:', '<<<', marked, '>>>'].join('\n');
}
function fxCleanInfo(x, keys) {
  const f = String((x && x.field) || '');
  return { field: f === 'none' ? 'none' : (FX_ALL.has(f) ? f : 'other'), party: keys.has(String((x && x.party) || '')) ? String(x.party) : '', label: String((x && x.label) || '').trim().slice(0, 60) };
}
// בלי Claude: שם השדה והסוג נלקחים מהמילים שלפני המקום הריק (כללים קבועים)
function fxGuess(base, sl) {
  const ls = base.lastIndexOf('\n', sl.s - 1) + 1; let pre = base.slice(ls, sl.s);
  if (sl.kind === 'cell') { const cells = pre.split('|').map(x => x.trim()).filter(Boolean); pre = cells[0] || ''; }
  pre = pre.replace(/[_‗＿.…]{2,}.*$/, '').split(/[|]| {3,}/).pop().replace(/[:：\s]+$/, '').trim();
  const l = pre.split(/\s+/).slice(-6).join(' ');
  const field = /חתימ/.test(l) ? 'signature' : /תאריך לידה/.test(l) ? 'birthDate' : /(ת\.?\s?ז|ת"ז|ת״ז|תעודת זהות|מס[׳'] זהות)/.test(l) ? 'idNumber' : /(טלפון|נייד|פלאפון|טל[׳'])/.test(l) ? 'phone'
    : /(דוא"ל|דוא״ל|אימייל|מייל|e-?mail)/i.test(l) ? 'email' : /כתובת/.test(l) ? 'address' : /תאריך/.test(l) ? 'date' : /שם פרטי/.test(l) ? 'firstName' : /שם משפחה/.test(l) ? 'lastName'
      : /(^|\s)שם/.test(l) ? 'fullName' : /(סכום|₪|מחיר|תשלום|מקדמה|יתרה|סה"כ|סה״כ)/.test(l) ? 'amount' : 'other';
  return { field, party: '', label: (l || FX_HE[field]).slice(0, 60) };
}
export async function fxDetect() {
  const SG = H.SG;
  if (FX.busy || SG.kd !== 'o') return;
  if (SG.os.busy) { toast('חכה שסריקת החוזה תסתיים, ואז זהה את השדות.'); return; }
  const prev = FX.st && FX.st.active ? FX.st : null, base = prev ? prev.base : fxTa().value;
  if (!base.trim()) { toast('אין עדיין נוסח חוזה. כתוב, הדבק או סרוק אותו, ואז זהה את השדות.'); return; }
  const found = fxFind(base), seq = FX.seq;
  FX.st = prev || { active: true, base, slots: [], parties: [], clientParty: '', msgs: [] };
  FX.busy = true; FX.askFree = false;
  FX.st.msgs.push({ who: 'bot', text: 'קורא את החוזה ומחפש את המקומות שצריך למלא…', wait: true });
  fxRender();
  let r = null, offline = false;
  try {
    if (aiOk) { try { r = await aiAsk('contract_fields', fxDetectPrompt(fxMark(base, found))); } catch (e) { markAi(e); if (e.code !== 'no_ai') throw e; } }
    if (seq !== FX.seq) return;
    if (!r) { offline = true; r = { parties: [], slots: found.map(sl => ({ id: sl.id, ...fxGuess(base, sl) })), extra: [] }; }
    const parties = (Array.isArray(r && r.parties) ? r.parties : []).filter(p => p && p.key).slice(0, 6)
      .map(p => ({ key: String(p.key).slice(0, 4), name: String(p.name || p.key).trim().slice(0, 60), role: String(p.role || '').trim().slice(0, 60) }));
    const keys = new Set(parties.map(p => p.key)), byId = {};
    (Array.isArray(r && r.slots) ? r.slots : []).forEach(x => { if (x && x.id) byId[String(x.id)] = x; });
    const slots = found.filter(sl => byId[sl.id]).map(sl => Object.assign({}, sl, fxCleanInfo(byId[sl.id], keys), { value: '', src: '' })).filter(sl => sl.field !== 'none');
    (Array.isArray(r && r.extra) ? r.extra : []).slice(0, 20).forEach(x => {
      const info = fxCleanInfo(x, keys); if (info.field === 'none') return;
      const a = fxAnchor(base, slots, x); if (a) slots.push(Object.assign(a, info, { value: '', src: '' }));
    });
    fxRenum(slots);
    if (prev) slots.forEach(sl => { const o = prev.slots.find(q => q.s === sl.s && q.e === sl.e && q.src === 'manual'); if (o) { sl.value = o.value; sl.src = 'manual'; } });
    const st = FX.st;
    st.msgs = st.msgs.filter(m => !m.wait);
    st.active = true; st.base = base; st.slots = slots; st.parties = parties;
    if (parties.length <= 1) st.clientParty = parties.length ? parties[0].key : '';
    else if (!keys.has(st.clientParty)) st.clientParty = '';
    fxApplyClient(); fxApplyText();
    if (offline) fxSay('זיהוי בסיסי בלי Claude: נמצאו המקומות הריקים לפי קווים, נקודות וסימני ״:״. ' + AI_OFF + '.');
    if (!slots.length) fxSay('לא מצאתי בחוזה מקומות ריקים למילוי. אם יש מקום כזה, כתוב לי איפה, למשל: אחרי ״ת.ז. מס׳״ צריך את מספר הת״ז.');
    else {
      fxSay('מצאתי ' + sgFmtNum(slots.length) + ' מקומות למילוי' + (parties.length > 1 ? ', ובחוזה יש כמה צדדים.' : '.'));
      if (parties.length > 1 && !st.clientParty) fxAskParty();
      else fxSay(fxSummary(), fxReask());
    }
  } catch (e) {
    if (seq !== FX.seq) return;
    if (FX.st) FX.st.msgs = FX.st.msgs.filter(m => !m.wait);
    if (!prev) FX.st = null;
    toast(sampleErr(e));
  } finally {
    if (seq === FX.seq) { FX.busy = false; fxRender(); }
  }
}

/* ---------- העוזר: שיחה ---------- */
function fxCtxOf(base, sl, n) { const a = Math.max(0, sl.s - n), b = Math.min(base.length, sl.e + n); return (base.slice(a, sl.s) + '▢' + base.slice(sl.e, b)).replace(/\s+/g, ' ').trim(); }
function fxChatPrompt(msg) {
  const st = FX.st, c = FX.client, cl = c && c.ok ? { firstName: c.firstName, lastName: c.lastName, idNumber: fxVal(c, 'idNumber'), birthDate: c.birthDate, address: c.address } : null;
  const withText = st.base.length <= 60000, ph = H.sgF('fClientPhone').value.trim();
  const lines = st.slots.slice(0, 250).map(sl => [sl.id, sl.label || FX_HE[sl.field], sl.field, sl.party || '-', JSON.stringify(sl.value || ''), JSON.stringify(fxCtxOf(st.base, sl, 45))].join(' | '));
  return ['You are the assistant that helps the owner fill in a contract on his phone. You only set the values of the fill-in places listed below' + (withText ? ', or add a missing place when the owner points to one' : '') + '. You never change any other wording of the contract, never assume what kind of contract it is, and never add clauses.',
    '',
    'Parties: ' + JSON.stringify(st.parties),
    'The client\'s party: ' + (st.clientParty || '(not chosen yet)'),
    'Client details from the ID card: ' + (cl ? JSON.stringify(cl) : '(not scanned yet)'),
    'Client WhatsApp number in the form: ' + (ph || '(empty)'),
    '',
    'Fill-in places (id | what goes there | field | party | current value | text around it, ▢ marks the place):',
    lines.join('\n') || '(none)',
    withText ? '\nCONTRACT TEXT:\n<<<\n' + st.base + '\n>>>' : '',
    '',
    'The owner wrote: """' + msg + '"""',
    '',
    'Reply with only JSON: {"reply":"","set":[{"id":"","value":""}],"clientParty":"","add":[{"after":"","field":"","party":"","label":"","value":""}]}',
    '- reply: a short, friendly answer in Hebrew saying what you did, or one short question if the request is unclear.',
    '- set: only the places the owner asked to fill or change. value "" clears a place. Use only ids from the list.',
    '- clientParty: a party key if the owner said which party the client is; otherwise "".',
    '- add: only if the owner points to an empty place that is not in the list. "after" is the exact text from the contract, 4 to 40 characters and appearing only once, right before that place.'].join('\n');
}
async function fxChat() {
  const inp = fx$('ChatIn'), msg = inp.value.trim();
  if (!msg || FX.busy || !FX.st || !FX.st.active) return;
  const st = FX.st, seq = FX.seq;
  inp.value = ''; st.msgs.push({ who: 'me', text: msg }); st.msgs.push({ who: 'bot', text: 'חושב…', wait: true });
  FX.busy = true; fxRender();
  try {
    const r = await aiAsk('contract_fill_chat', fxChatPrompt(msg));
    if (seq !== FX.seq) return;
    st.msgs = st.msgs.filter(m => !m.wait);
    const keys = new Set(st.parties.map(p => p.key)); let changed = 0;
    if (r && r.clientParty && keys.has(String(r.clientParty)) && r.clientParty !== st.clientParty) { st.clientParty = String(r.clientParty); fxApplyClient(); changed++; }
    if (r && Array.isArray(r.add)) r.add.slice(0, 10).forEach(x => {
      const info = fxCleanInfo(x, keys); if (info.field === 'none') return;
      const a = fxAnchor(st.base, st.slots, x); if (!a) return;
      const v = String(x.value == null ? '' : x.value).trim();
      st.slots.push(Object.assign(a, info, { value: v, src: v ? 'manual' : '' })); fxRenum(st.slots); changed++;
    });
    if (r && Array.isArray(r.set)) r.set.slice(0, 100).forEach(x => {
      const sl = st.slots.find(q => q.id === String(x && x.id)); if (!sl) return;
      const v = String(x.value == null ? '' : x.value).trim(); sl.value = v; sl.src = v ? 'manual' : ''; changed++;
    });
    if (changed) fxApplyText();
    fxSay(String((r && r.reply) || (changed ? 'עודכן.' : 'לא הבנתי מה לשנות. אפשר גם ללחוץ על שדה ולערוך אותו.')).slice(0, 700));
  } catch (e) {
    markAi(e);
    if (seq !== FX.seq) return;
    st.msgs = st.msgs.filter(m => !m.wait);
    fxSay(e && e.code === 'no_ai' ? 'העוזר בשיחה דורש חיבור ל-Claude (הגדרות). אפשר ללחוץ על כל שדה ולערוך אותו ידנית.' : sampleErr(e));
  } finally {
    if (seq === FX.seq) { FX.busy = false; fxRender(); }
  }
}

/* ---------- עריכת שדה בלחיצה ---------- */
function fxLine(base, sl) {
  const a = base.lastIndexOf('\n', sl.s - 1) + 1, bi = base.indexOf('\n', sl.e), b = bi < 0 ? base.length : bi;
  let t = base.slice(a, sl.s) + '▢' + base.slice(sl.e, b);
  if (t.length > 160) { const i = t.indexOf('▢'); t = (i > 70 ? '…' : '') + t.slice(Math.max(0, i - 70), i + 80) + (i + 80 < t.length ? '…' : ''); }
  return t.trim();
}
function fxEditChk() {
  const sl = FX.edit, el = fx$('SlotChk'); if (!el) return; if (!sl || sl.field !== 'idNumber') { el.textContent = ''; el.className = 'small'; return; }
  const d = fxDigits(fx$('SlotIn').value), ok = d && d.length <= 9 && fxIdValid(d);
  el.textContent = !d ? '' : (ok ? '✓ מספר ת״ז תקין' : '✗ מספר ת״ז לא תקין לפי ספרת הביקורת');
  el.className = 'small ' + (!d ? '' : (ok ? 'fx-good' : 'fx-bad'));
}
function fxEditOpen(id) {
  const st = FX.st, sl = st && st.slots.find(x => x.id === id); if (!sl || FX.busy) return;
  FX.edit = sl;
  FX.sheet = openSheet(`<div class="hd"><b id="sg-fxSlotLbl">${esc(sl.label || FX_HE[sl.field] || 'שדה')}</b><button class="x" data-close aria-label="סגירה">×</button></div>
    <p class="small fx-ctx" dir="auto">${esc(fxLine(st.base, sl))}</p>
    ${sl.field === 'signature' ? '<p class="note info small">זה מקום לחתימה. הלקוח חותם בדף החתימה. אפשר בכל זאת לכתוב כאן טקסט.</p>' : ''}
    <input class="in" id="sg-fxSlotIn" type="text" autocomplete="off" aria-labelledby="sg-fxSlotLbl" inputmode="${sl.field === 'idNumber' ? 'numeric' : (sl.field === 'phone' ? 'tel' : 'text')}" dir="${sl.field === 'idNumber' || sl.field === 'phone' || sl.field === 'email' ? 'ltr' : 'auto'}">
    <span class="small" id="sg-fxSlotChk"></span>
    <div class="row" style="margin-top:10px"><button type="button" class="btn" id="sg-fxSlotSave">שמירה</button><button type="button" class="btn plain sm" id="sg-fxSlotClear">ניקוי השדה</button><button type="button" class="btn plain sm" data-close>ביטול</button></div>`, { onClose: () => { FX.edit = null; FX.sheet = null; } });
  const inp = fx$('SlotIn'); inp.value = sl.value || '';
  inp.addEventListener('input', fxEditChk);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fxEditSave(false); } else if (e.key === 'Escape') { e.preventDefault(); fxEditClose(); } });
  fx$('SlotSave').addEventListener('click', () => fxEditSave(false));
  fx$('SlotClear').addEventListener('click', () => fxEditSave(true));
  fxEditChk();
  setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { /* */ } }, 40);
}
function fxEditClose() { const s = FX.sheet; FX.edit = null; FX.sheet = null; if (s) s.close(); }
function fxEditSave(clear) {
  const sl = FX.edit; if (!sl || !FX.st) { fxEditClose(); return; }
  const v = clear ? '' : fx$('SlotIn').value.trim();
  sl.value = v; sl.src = v ? 'manual' : '';
  fxEditClose(); fxApplyText(); fxRender();
}
function fxFreeEdit() { FX.seq++; FX.busy = false; FX.st = null; FX.askFree = false; fxRender(); setTimeout(() => { try { fxTa().focus(); } catch (e) { /* */ } }, 40); }

/* ---------- שמירה וטעינה ---------- */
export function fxSerialize() {
  const st = FX.st; if (!st || !st.active || H.SG.kd !== 'o') return null;
  const full = fxCompose(st), lead = full.length - full.replace(/^\s*\n/, '').length, slots = [];
  let p = 0, o = 0;
  st.slots.forEach(sl => {
    o += sl.s - p; const str = fxSlotStr(st.base, sl);
    slots.push({ at: o - lead, len: str.length, kind: sl.kind, orig: sl.orig, field: sl.field, party: sl.party || '', label: sl.label || '', value: sl.value || '', src: sl.src || '' });
    o += str.length; p = sl.e;
  });
  if (slots.some(x => x.at < 0)) return null;
  return { v: 1, parties: st.parties, clientParty: st.clientParty || '', slots };
}
function fxDeserialize(fill, text) {
  if (!fill || !Array.isArray(fill.slots) || typeof text !== 'string') return null;
  let base = '', p = 0; const slots = [];
  for (const x of fill.slots) {
    const at = +x.at, len = +x.len; if (!(at >= p) || !(len >= 0) || at + len > text.length) return null;
    base += text.slice(p, at); const s = base.length, orig = String(x.orig == null ? '' : x.orig); base += orig; p = at + len;
    slots.push({ s, e: s + orig.length, kind: String(x.kind || 'line'), orig, field: FX_ALL.has(x.field) ? x.field : 'other', party: String(x.party || ''), label: String(x.label || ''), value: String(x.value || ''), src: String(x.src || '') });
  }
  base += text.slice(p);
  fxRenum(slots);
  const st = { active: true, base, slots, parties: Array.isArray(fill.parties) ? fill.parties.slice(0, 6) : [], clientParty: String(fill.clientParty || ''), msgs: [] };
  return fxCompose(st) === text ? st : null;
}
export function fxClientSer() { const c = FX.client; if (!c || !c.ok) return null; return { firstName: c.firstName || '', lastName: c.lastName || '', idNumber: fxVal(c, 'idNumber'), birthDate: c.birthDate || '', address: c.address || '' }; }
// צילומי ת״ז שבעל התוכנה סרק: idImgs [{fileId|assetId, side, at}]. לרשומות מהתוכנה המקורית (assetId) הקובץ נמצא לפי השדה idImgs[i]
export function fxOwnIds(r) {
  const files = (r && r.files) || [];
  return (r && Array.isArray(r.idImgs) ? r.idImgs : []).map((x, i) => {
    if (!x) return null; const f = x.fileId ? files.find(z => z.id === x.fileId) : files.find(z => z.field === 'idImgs[' + i + ']');
    return f ? { fileId: f.id, side: x.side || 'front', at: x.at } : null;
  }).filter(Boolean);
}
// אחרי השמירה של החוזה: צילומים חדשים נשלחים לשרת ונשמרים כקבצים של החוזה
export async function fxUploadNew(id, save) {
  const failed = [];
  for (const side of ['front', 'back']) {
    const x = FX.idNew[side]; if (!x) continue;
    try {
      const image = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(x.blob); });
      const out = await save('POST', '/api/sign/' + encodeURIComponent(id) + '/idimg', { side, image }, { label: 'צילום ת״ז', queue: false });
      const it = { fileId: out.fileId, side, at: Date.now() }; FX.idList.push(it); FX.idSaved[side] = it;
      if (x.url) URL.revokeObjectURL(x.url); FX.idNew[side] = null;
    } catch (e) { failed.push(side === 'front' ? 'צילום הת״ז' : 'צילום הספח'); }
  }
  return failed;
}
export function fxLoadRec(rec) {
  if (!rec) return;
  FX.recId = rec.id || null;
  FX.idList = fxOwnIds(rec).slice();
  ['front', 'back'].forEach(side => { const l = FX.idList.filter(x => x.side === side).pop(); FX.idSaved[side] = l || null; });
  const c = rec.idc; FX.client = c && typeof c === 'object' ? Object.assign({ firstName: '', lastName: '', idNumber: '', birthDate: '', address: '' }, c, { ok: true }) : null;
  if (H.SG.kd === 'o' && rec.fill) { const st = fxDeserialize(rec.fill, fxTa().value); if (st) { FX.st = st; fxSay(fxSummary(), fxReask()); } }
  fxIdRender(); fxRender();
}
const fileUrl = id => '/api/files/' + encodeURIComponent(id);
function fxView() {
  const items = [];
  ['front', 'back'].forEach(s => {
    const n = FX.idNew[s], v = FX.idSaved[s], label = s === 'front' ? 'צד קדמי' : 'ספח';
    if (n) items.push({ label, src: n.url }); else if (v) items.push({ label, src: fileUrl(v.fileId), href: fileUrl(v.fileId) });
  });
  if (!items.length) return;
  const nm = fxVal(FX.client, 'fullName') || H.sgF('fOperator').value.trim();
  openSheet(`<div class="hd"><h2>צילום תעודת הזהות${nm ? ' · ' + esc(nm) : ''}</h2><button class="x" data-close aria-label="סגירה">×</button></div>` +
    items.map(x => `<div style="margin-bottom:12px"><div class="small muted">${esc(x.label)}${x.href ? ` · <a href="${esc(x.href)}" target="_blank" rel="noopener">פתיחה בחלון</a>` : ''}</div><img src="${esc(x.src)}" alt="${esc(x.label)}" style="max-width:100%;border:1px solid var(--line);border-radius:6px"></div>`).join(''));
}

/* ---------- סריקת תעודת זהות ---------- */
function fxIdPrompt(n) {
  return ['The attached image' + (n > 1 ? 's are photos' : ' is a photo') + ' of an Israeli identity card (תעודת זהות)' + (n > 1 ? ': image 1 is the front of the card, image 2 is the appendix (ספח) or the back of the card.' : ', front side.'),
    'Read the details exactly as printed. Never guess: if a detail is not visible or not readable with certainty, leave it empty.',
    'Reply with only JSON: {"firstName":"","lastName":"","idNumber":"","birthDate":"","address":"","notes":""}',
    '- firstName, lastName: in Hebrew, as printed (שם פרטי, שם משפחה).',
    '- idNumber: מספר זהות, digits only, including the check digit and any leading zeros.',
    '- birthDate: תאריך לידה in the Gregorian calendar, as DD.MM.YYYY.',
    '- address: the address (כתובת) from the appendix as printed: street, house number, city. Empty if no address is visible.',
    '- notes: one short Hebrew sentence if something could not be read, otherwise empty.'].join('\n');
}
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
export async function fxCanvas(src, maxDim) {
  const url = src instanceof Blob ? URL.createObjectURL(src) : src;
  try {
    const im = await loadImg(url), w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, k = Math.min(1, maxDim / Math.max(w, h));
    const c = cv(w * k, h * k), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
    return c;
  } finally { if (src instanceof Blob) URL.revokeObjectURL(url); }
}
export const toJpeg = (c, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('jpeg')), 'image/jpeg', q));
const isImg = f => /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(f.name || '');
async function fxPick(side, file) {
  if (!file) return;
  if (!isImg(file)) { toast('בחר תמונה של תעודת הזהות (צילום או צילום מסך).'); return; }
  const seq = FX.seq;
  try {
    const c = await fxCanvas(file, 2400), blob = await toJpeg(c, 0.9); c.width = c.height = 0;
    if (seq !== FX.seq) return;
    const old = FX.idNew[side]; if (old && old.url) URL.revokeObjectURL(old.url);
    FX.idNew[side] = { blob, url: URL.createObjectURL(blob) };
    fx$('IdSt').textContent = side === 'front' ? (aiOk ? 'הצילום נקלט. לחץ ״זיהוי הפרטים מהתעודה״.' : 'הצילום נקלט. הקלד את הפרטים מהתעודה.') : 'הספח נקלט. הכתובת תיקרא ממנו.';
    fxIdRender();
    if (!aiOk && side === 'front' && !FX.form && !(FX.client && FX.client.ok)) fxOpenForm(FX.draft || {});
  } catch (e) { toast('לא הצלחתי לפתוח את התמונה. נסה צילום JPG או PNG.'); }
}
const b2d = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
async function fxRecognize() {
  if (FX.busyId) return;
  if (!FX.idNew.front && !FX.idSaved.front) { toast('צלם או העלה קודם את הצד הקדמי של התעודה.'); return; }
  const seq = FX.seq; FX.busyId = true; fx$('IdSt').textContent = 'קורא את תעודת הזהות…'; fxIdRender();
  try {
    const imgs = [];
    for (const side of ['front', 'back']) {
      const n = FX.idNew[side], v = FX.idSaved[side]; let src = null;
      if (n) src = n.blob; else if (v) { try { const rr = await fetch(fileUrl(v.fileId), { credentials: 'same-origin' }); src = rr.ok ? await rr.blob() : null; } catch (e) { src = null; } }
      if (!src) continue;
      const c = await fxCanvas(src, 1600); const b = await toJpeg(c, 0.88); c.width = c.height = 0; imgs.push(await b2d(b));
    }
    if (seq !== FX.seq) return;
    if (!imgs.length) throw { code: 'image_rejected' };
    const r = await aiAsk('id_card', fxIdPrompt(imgs.length), imgs, { firstName: 'string', lastName: 'string', idNumber: 'string', birthDate: 'string', address: 'string', notes: 'string' });
    if (seq !== FX.seq) return;
    const d = { firstName: String((r && r.firstName) || '').trim(), lastName: String((r && r.lastName) || '').trim(), idNumber: fxDigits(r && r.idNumber).slice(0, 9), birthDate: fxNormDate(r && r.birthDate), address: String((r && r.address) || '').trim() };
    const note = String((r && r.notes) || '').trim();
    fx$('IdSt').textContent = (note ? note + ' ' : '') + 'בדוק את הפרטים מול התעודה, תקן אם צריך ולחץ ״אישור הפרטים״.';
    fxOpenForm(d);
  } catch (e) {
    markAi(e);
    if (seq !== FX.seq) return;
    fx$('IdSt').textContent = sampleErr(e) + '. אפשר להקליד את הפרטים ידנית.';
    fxOpenForm(FX.draft || Object.assign({}, FX.client || {}));
  } finally { if (seq === FX.seq) { FX.busyId = false; fxIdRender(); } }
}
function fxOpenForm(d) {
  FX.draft = d; FX.form = true;
  fx$('First').value = d.firstName || ''; fx$('Last').value = d.lastName || ''; fx$('Num').value = fxDigits(d.idNumber) || '';
  fx$('Birth').value = d.birthDate || ''; fx$('Addr').value = d.address || '';
  fx$('IdErr').hidden = true; fxCheck(); fxIdRender();
  setTimeout(() => { try { fx$('Form').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); fx$('First').focus({ preventScroll: true }); } catch (e) { /* */ } }, 40);
}
function fxCheck() {
  const d = fxDigits(fx$('Num').value), el = fx$('NumChk');
  if (!d) { el.textContent = ''; el.className = 'small'; return; }
  const ok = d.length <= 9 && fxIdValid(d);
  el.textContent = ok ? '✓ ספרת הביקורת תקינה' : '✗ ספרת הביקורת לא תקינה. בדוק את המספר מול התעודה';
  el.className = 'small ' + (ok ? 'fx-good' : 'fx-bad');
}
function fxConfirm() {
  const v = { firstName: fx$('First').value.trim(), lastName: fx$('Last').value.trim(), idNumber: fxDigits(fx$('Num').value), birthDate: fxNormDate(fx$('Birth').value), address: fx$('Addr').value.trim() };
  const err = fx$('IdErr');
  if (v.idNumber && (v.idNumber.length > 9 || !fxIdValid(v.idNumber))) { err.textContent = 'מספר הת״ז לא תקין לפי ספרת הביקורת. בדוק ותקן לפני האישור.'; err.hidden = false; return; }
  if (!v.firstName && !v.lastName && !v.idNumber) { err.textContent = 'אין פרטים לאישור. מלא לפחות שם או מספר ת״ז.'; err.hidden = false; return; }
  if (v.idNumber) v.idNumber = v.idNumber.padStart(9, '0');
  FX.client = Object.assign(v, { ok: true }); FX.form = false; FX.draft = null;
  const full = fxVal(FX.client, 'fullName'), put = [];
  if (full && H.sgF('fOperator').value.trim() !== full) { H.sgF('fOperator').value = full; put.push('השם'); }
  if (v.idNumber && fxDigits(H.sgF('fOpId').value) !== v.idNumber) { H.sgF('fOpId').value = v.idNumber; put.push('מספר הת״ז'); }
  if (put.length) { H.refreshDefault(); H.schedulePrep(); }
  fx$('IdSt').textContent = put.length ? 'הפרטים אושרו. ' + put.join(' ו') + ' של הלקוח בטופס עודכנו מהתעודה.' : 'הפרטים אושרו.';
  fxIdRender();
  if (H.SG.kd === 'o') {
    if (FX.st && FX.st.active) {
      fxApplyClient(); fxApplyText();
      if (FX.st.parties.length > 1 && !FX.st.clientParty) fxAskParty();
      else fxSay('פרטי הלקוח עודכנו. ' + fxSummary(), fxReask());
      fxRender();
    } else if (fxTa().value.trim() && !H.SG.os.busy) fxDetect();
  }
}
export function fxIdRender() {
  if (!fx$('Id')) return;
  const cl = FX.client;
  const src = s => FX.idNew[s] ? FX.idNew[s].url : (FX.idSaved[s] ? fileUrl(FX.idSaved[s].fileId) : '');
  const f = src('front'), b = src('back');
  fx$('ThFront').innerHTML = f ? '<img src="' + esc(f) + '" alt="הצד הקדמי של התעודה">' : '<span>צד קדמי<br><small>חובה</small></span>';
  fx$('ThBack').innerHTML = b ? '<img src="' + esc(b) + '" alt="הספח">' : '<span>ספח<br><small>לא חובה</small></span>';
  fx$('RmBack').hidden = !FX.idNew.back;
  fx$('Read').hidden = !aiOk;
  fx$('Read').disabled = !(FX.idNew.front || FX.idSaved.front) || FX.busyId;
  fx$('Read').textContent = FX.busyId ? 'קורא את התעודה…' : 'זיהוי הפרטים מהתעודה';
  fx$('Form').hidden = !FX.form;
  const sum = fx$('Sum'); sum.hidden = !(cl && cl.ok) || FX.form;
  if (cl && cl.ok) {
    const rows = [['שם', fxVal(cl, 'fullName')], ['ת״ז', fxVal(cl, 'idNumber')], ['תאריך לידה', cl.birthDate], ['כתובת', cl.address]];
    sum.innerHTML = '<dl>' + rows.map(x => '<div><dt>' + x[0] + '</dt><dd>' + (x[1] ? esc(x[1]) : '<span class="muted">לא ידוע</span>') + '</dd></div>').join('') + '</dl><button type="button" class="btn plain sm" data-fx="edit">עריכת הפרטים</button>';
  } else sum.innerHTML = '';
  const st = fx$('IdState');
  st.textContent = cl && cl.ok ? 'הפרטים אושרו' : (FX.form ? 'ממתין לאישור' : (FX.idNew.front || FX.idSaved.front ? 'ממתין לזיהוי' : 'לא נסרקה'));
  st.className = 'fx-chip' + (cl && cl.ok ? ' on' : '');
}
export function fxRender() {
  if (!fx$('Pv')) return;
  const st = FX.st, on = !!(st && st.active) && H.SG.kd === 'o', ta = fxTa(), pv = fx$('Pv');
  fx$('Start').hidden = on; fx$('On').hidden = !on;
  fx$('Detect').disabled = FX.busy || H.SG.os.busy;
  fx$('NoAi').hidden = aiOk;
  ta.hidden = on; pv.hidden = !on;
  ['ChatSend', 'ChatIn', 'Redetect', 'Free'].forEach(r => { fx$(r).disabled = FX.busy; });
  fx$('ChatRow').hidden = !aiOk;
  fx$('FreeAsk').hidden = !FX.askFree; fx$('Free').hidden = FX.askFree;
  const k = fxCounts();
  fx$('Cnt').textContent = on ? sgFmtNum(k.filled) + ' מולאו · ' + sgFmtNum(k.missing) + ' להשלמה' : '';
  pv.innerHTML = on ? fxPvHTML() : '';
  const box = fx$('Chat'), msgs = st ? st.msgs : [];
  box.innerHTML = msgs.map((m, i) => '<div class="fx-msg ' + m.who + '">' + (m.wait ? '<span class="fx-spin" aria-hidden="true"></span>' : '') + '<span>' + esc(m.text) + '</span>' +
    (m.opts && i === msgs.length - 1 && !FX.busy ? '<div class="fx-qr">' + m.opts.map((o, j) => '<button type="button" class="btn ghost sm" data-qr="' + j + '">' + esc(o.label) + '</button>').join('') + '</div>' : '') + '</div>').join('');
  box.scrollTop = box.scrollHeight;
}
export function fxReset() {
  FX.seq++; FX.busy = false; FX.busyId = false;
  ['front', 'back'].forEach(s => { const x = FX.idNew[s]; if (x && x.url) URL.revokeObjectURL(x.url); });
  FX.idNew = { front: null, back: null }; FX.idSaved = { front: null, back: null }; FX.idList = []; FX.recId = null;
  FX.client = null; FX.draft = null; FX.form = false; FX.st = null; FX.askFree = false;
  if (!fx$('Id')) return;
  fxEditClose();
  ['First', 'Last', 'Num', 'Birth', 'Addr', 'ChatIn'].forEach(r => { fx$(r).value = ''; });
  fx$('IdSt').textContent = ''; fx$('IdErr').hidden = true; fxCheck();
  fxTa().hidden = false;
  fxIdRender(); fxRender();
}
export function fxDrop() { if (!FX.st) return; FX.seq++; FX.busy = false; FX.st = null; FX.askFree = false; fxEditClose(); if (fx$('Id')) fxRender(); }
export function fxSync() { if (!FX.st || !FX.st.active) return; if (H.SG.kd !== 'o' || fxCompose(FX.st) !== fxTa().value) fxDrop(); }

/* ---------- HTML של התיבות (app.html שורות 1581-1597, 1644-1658) ---------- */
function fxSideHTML(s, t) {
  const id = 'sg-fx' + s;
  return '<div class="fx-side"><button type="button" class="fx-th" id="sg-fxTh' + s + '" aria-label="' + t + '"></button><div class="row">' +
    '<input type="file" accept="image/*" capture="environment" class="fx-sr" id="' + id + 'Cam" data-side="' + s + '"><label class="btn ghost sm" for="' + id + 'Cam">צילום</label>' +
    '<input type="file" accept="image/*" class="fx-sr" id="' + id + 'Up" data-side="' + s + '"><label class="btn ghost sm" for="' + id + 'Up">העלאה</label>' +
    (s === 'Back' ? '<button type="button" class="btn plain sm" id="sg-fxRmBack" hidden>הסרה</button>' : '') + '</div></div>';
}
export const fxIdBoxHTML = () => `<div class="sg-box sg-needkind" id="sg-fxId">
  <div class="fx-hd"><b>סריקת ת״ז</b><span class="fx-chip" id="sg-fxIdState">לא נסרקה</span></div>
  <span class="small muted">צלם או העלה את הצד הקדמי של תעודת הזהות של הלקוח, ואם רוצים גם את הספח בשביל הכתובת. הפרטים יוצגו לאישור לפני שייכנסו לחוזה.</span>
  <div class="fx-sides" id="sg-fxSides">${fxSideHTML('Front', 'הצד הקדמי של התעודה') + fxSideHTML('Back', 'הספח')}</div>
  <div class="row"><button type="button" class="btn" id="sg-fxRead" disabled>זיהוי הפרטים מהתעודה</button><button type="button" class="btn plain sm" id="sg-fxManual">הקלדת הפרטים ידנית</button></div>
  <span class="small muted" id="sg-fxIdSt" aria-live="polite"></span>
  <div class="fx-form" id="sg-fxForm" hidden>
    <label class="f" for="sg-fxFirst">שם פרטי<input class="in" id="sg-fxFirst" type="text" autocomplete="off"></label>
    <label class="f" for="sg-fxLast">שם משפחה<input class="in" id="sg-fxLast" type="text" autocomplete="off"></label>
    <label class="f" for="sg-fxNum">מספר ת״ז<input class="in n" id="sg-fxNum" type="text" inputmode="numeric" maxlength="9" autocomplete="off" dir="ltr"><span class="small" id="sg-fxNumChk"></span></label>
    <label class="f" for="sg-fxBirth">תאריך לידה<input class="in n" id="sg-fxBirth" type="text" placeholder="יום.חודש.שנה" autocomplete="off" dir="ltr"></label>
    <label class="f fx-wide" for="sg-fxAddr">כתובת (מהספח)<input class="in" id="sg-fxAddr" type="text" autocomplete="off"></label>
    <div class="note err fx-wide" id="sg-fxIdErr" hidden></div>
    <div class="row fx-wide"><button type="button" class="btn" id="sg-fxOk">אישור הפרטים</button><button type="button" class="btn plain sm" id="sg-fxCancel">ביטול</button></div>
  </div>
  <div class="fx-sum" id="sg-fxSum" hidden></div>
</div>`;
export const fxFillBoxHTML = () => `<div class="sg-box sg-o-only" id="sg-fxFill">
  <div class="fx-hd"><b>עוזר המילוי</b><span class="small muted num" id="sg-fxCnt"></span></div>
  <div id="sg-fxStart" style="display:flex;flex-direction:column;gap:8px">
    <span class="small muted">העוזר קורא את כל נוסח החוזה ומוצא לבד כל מקום שצריך למלא: קווים ריקים, טבלאות של פרטי הצדדים, ״שם:״, ״ת.ז.:״, ״כתובת:״, ״טלפון:״, ״תאריך:״ ו״חתימה:״. פרטי הלקוח מהת״ז נכנסים לכל המקומות שלו, ושום מילה אחרת בחוזה לא משתנה.</span>
    <div class="row"><button type="button" class="btn ghost" id="sg-fxDetect">זיהוי השדות למילוי</button></div>
    <span class="small muted" id="sg-fxNoAi" hidden>בלי חיבור ל-Claude הזיהוי בסיסי (לפי קווים ריקים ו״:״), וכל שדה נערך ידנית.</span>
  </div>
  <div id="sg-fxOn" style="display:flex;flex-direction:column;gap:8px" hidden>
    <div class="fx-chat" id="sg-fxChat" aria-live="polite"></div>
    <div class="fx-chatin" id="sg-fxChatRow"><input class="in" id="sg-fxChatIn" type="text" placeholder="כתוב לעוזר, למשל: הטלפון של הלקוח 050-1234567" autocomplete="off" enterkeyhint="send" aria-label="הודעה לעוזר המילוי"><button type="button" class="btn" id="sg-fxChatSend">שליחה</button></div>
    <div class="fx-legend"><span><i class="ok"></i>מולא</span><span><i class="miss"></i>להשלמה ידנית</span><span><i class="sig"></i>מקום לחתימה</span><span>לחיצה על שדה פותחת עריכה</span></div>
    <div class="row"><button type="button" class="btn plain sm" id="sg-fxRedetect">זיהוי השדות מחדש</button><button type="button" class="btn plain sm" id="sg-fxFree">עריכת הטקסט החופשי</button></div>
    <div class="note warn" id="sg-fxFreeAsk" hidden><div>הסימונים הירוקים והאדומים יוסרו, וכל מה שכבר מולא יישאר בטקסט. אחר כך אפשר לערוך את החוזה כמו טקסט רגיל ולזהות את השדות שוב.</div><div class="row" style="margin-top:8px"><button type="button" class="btn sm" id="sg-fxFreeYes">מעבר לעריכה חופשית</button><button type="button" class="btn plain sm" id="sg-fxFreeNo">ביטול</button></div></div>
  </div>
</div>`;
export function fxInit() {
  const idBox = fx$('Id'); if (!idBox) return;
  idBox.addEventListener('change', e => {
    const inp = e.target.closest('input[type=file][data-side]'); if (!inp) return;
    e.stopPropagation();
    const f = inp.files && inp.files[0]; inp.value = ''; fxPick(inp.getAttribute('data-side') === 'Back' ? 'back' : 'front', f);
  });
  idBox.addEventListener('click', e => {
    const th = e.target.closest('.fx-th'); if (th) { const side = th.id === 'sg-fxThBack' ? 'back' : 'front'; if (FX.idNew[side] || FX.idSaved[side]) fxView(side); else fx$(th.id === 'sg-fxThBack' ? 'BackCam' : 'FrontCam').click(); return; }
    if (e.target.closest('[data-fx="edit"]')) fxOpenForm(Object.assign({}, FX.client || {}));
  });
  fx$('RmBack').addEventListener('click', () => { const x = FX.idNew.back; if (x && x.url) URL.revokeObjectURL(x.url); FX.idNew.back = null; fxIdRender(); });
  fx$('Read').addEventListener('click', fxRecognize);
  fx$('Manual').addEventListener('click', () => fxOpenForm(FX.draft || Object.assign({}, FX.client || {})));
  fx$('Num').addEventListener('input', fxCheck);
  fx$('Ok').addEventListener('click', fxConfirm);
  fx$('Cancel').addEventListener('click', () => { FX.form = false; fx$('IdErr').hidden = true; fxIdRender(); });
  fx$('Form').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fxConfirm(); } });
  fx$('Detect').addEventListener('click', fxDetect);
  fx$('Redetect').addEventListener('click', fxDetect);
  fx$('Free').addEventListener('click', () => { FX.askFree = true; fxRender(); });
  fx$('FreeNo').addEventListener('click', () => { FX.askFree = false; fxRender(); });
  fx$('FreeYes').addEventListener('click', fxFreeEdit);
  fx$('ChatSend').addEventListener('click', fxChat);
  fx$('ChatIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fxChat(); } });
  fx$('Chat').addEventListener('click', e => {
    const b = e.target.closest('[data-qr]'); if (!b || !FX.st) return;
    const last = FX.st.msgs[FX.st.msgs.length - 1], o = last && last.opts && last.opts[Number(b.getAttribute('data-qr'))]; if (!o) return;
    if (o.act === 'party') fxSetParty(o.val); else if (o.act === 'reask') { fxAskParty(); fxRender(); }
  });
  fx$('Pv').addEventListener('click', e => { const b = e.target.closest('[data-slot]'); if (b) fxEditOpen(b.getAttribute('data-slot')); });
}
