// בדיקת יכולת Claude (server/features/ai.js + public/js/features/ai.js) מול שרת Claude מדומה — לא נשלחת אף בקשה ל-API האמיתי.
// הרצה: BACKUP=path/to/backup.json node test/feature-ai.cjs   (פורט 8308; שרת בלי מפתח 8309; Claude מדומה 8311)
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.AI_PORT || 8308, NOKEY = PORT + 1, FAKE = PORT + 3, URL = 'http://localhost:' + PORT;
const BACKUP = process.env.BACKUP;
const results = [];
const step = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); console.log('✓', name); } catch (e) { results.push({ name, ok: false }); console.log('✗', name, '\n   ', String(e.message).split('\n').slice(0, 3).join('\n    ')); } };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const SECRET_ID = '039337423';

// ---- Claude מדומה ----
const reqs = [];
function reply(body) {
  const content = body.messages[0].content; const text = content.find(c => c.type === 'text').text;
  const json = (o, stop = 'end_turn') => ({ id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: JSON.stringify(o) }], stop_reason: stop, usage: { input_tokens: 10, output_tokens: 5 } });
  if (text.includes('REFUSE-ME')) return { id: 'm', type: 'message', content: [], stop_reason: 'refusal', usage: {} };
  if (text.includes('רשימת גבייה')) return json({ debts: [{ name: 'משה כהן', amount: 1200, collector: '', uncertain: false }, { name: 'סה״כ', amount: 1200, collector: '', uncertain: false }], expenses: [{ name: 'דלק', amount: 100, collector: 'עידן', uncertain: true }], note: 'בדיקה' });
  if (text.includes('Israeli identity card')) return json({ firstName: 'ישראל', lastName: 'ישראלי', idNumber: '03933742-3', birthDate: '1/2/85', address: 'הרצל 1 תל אביב', notes: '' });
  if (text.includes('אתה מבצע פקודות')) {
    if (text.includes('שאלה-בדיקה') && !text.includes('רובי: עידן')) return json({ question: 'למי להעביר?', summary: '', changes: [] });
    if (text.includes('חשבון בוקר')) return json({ question: '', summary: 'המשלוחים שונו', changes: [], scalars: { courier: 200 } });
    return json({ question: '', summary: 'עודכנו 2 שורות', changes: [{ list: 'entries', op: 'update', idx: 0, set: { c: 'עידן', a: 6100 } }, { list: 'entries', op: 'delete', idx: 1 }, { list: 'entries', op: 'add', set: { k: 'e', n: 'הוצאת בדיקה', a: 50, c: 'עידן' } }, { list: 'entries', op: 'update', idx: 9999, set: { c: 'x' } }] });
  }
  return json({});
}
const fake = http.createServer((req, res) => {
  let b = ''; req.on('data', d => b += d); req.on('end', () => {
    const body = JSON.parse(b); reqs.push({ path: req.url, headers: req.headers, body });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(reply(body)));
  });
});

function start(port, env) {
  const p = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'yoman-ai-')), PORT: String(port), COOKIE_SECURE: '0', OWNER_USERNAME: 'owner', OWNER_PASSWORD: 'Owner-pass-1', ANTHROPIC_API_KEY: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.log = ''; p.stdout.on('data', d => p.log += d); p.stderr.on('data', d => p.log += d);
  return p;
}
const ready = async (p) => { for (let i = 0; i < 100 && !p.log.includes('פועל'); i++) await new Promise(r => setTimeout(r, 200)); if (!p.log.includes('פועל')) throw new Error('server did not start: ' + p.log); };

(async () => {
  await new Promise(r => fake.listen(FAKE, r));
  const srv = start(PORT, { ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://localhost:' + FAKE, IMPORT_ON_START: BACKUP });
  const nokey = start(NOKEY, {});
  await ready(srv); await ready(nokey);
  const b = await chromium.launch();
  const mk = async (base) => { const c = await b.newContext({ ...devices['iPhone 13'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem', baseURL: base }); return c; };
  const api = async (c, method, url, body) => { const r = await c.request.fetch(url, { method, data: body, headers: { Origin: c._base } }); return { status: r.status(), json: await r.json().catch(() => null) }; };
  const login = async (c, base, u, p) => { c._base = base; const r = await api(c, 'POST', '/api/login', { username: u, password: p }); assert.strictEqual(r.status, 200, 'login ' + u); };
  const owner = await mk(URL); await login(owner, URL, 'owner', 'Owner-pass-1');

  await step('קריאת צילום חשבון גובים: בקשה תקינה ל-API ונתונים מנורמלים', async () => {
    reqs.length = 0;
    const r = await api(owner, 'POST', '/api/ai/extract', { task: 'collectors', images: [PNG], collector: 'רובי' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(r.json.data.entries, [{ k: 'd', n: 'משה כהן', a: 1200, c: 'רובי', u: false }, { k: 'e', n: 'דלק', a: 100, c: 'עידן', u: true }]);
    assert.strictEqual(r.json.data.note, 'בדיקה');
    const q = reqs[0]; assert.strictEqual(q.path, '/v1/messages');
    assert.strictEqual(q.headers['x-api-key'], 'test-key'); assert.strictEqual(q.headers['anthropic-version'], '2023-06-01');
    assert.strictEqual(q.body.model, 'claude-opus-5-5'); assert.ok(!('thinking' in q.body) && !('temperature' in q.body) && !('top_p' in q.body));
    assert.strictEqual(q.body.output_config.effort, 'low'); assert.strictEqual(q.body.output_config.format.type, 'json_schema');
    assert.strictEqual(q.body.max_tokens, 16000);
    const c = q.body.messages[0].content; assert.strictEqual(c[0].type, 'image'); assert.strictEqual(c[0].source.media_type, 'image/png'); assert.strictEqual(c[1].type, 'text');
  });
  await step('ת״ז: מספר ספרות בלבד, תאריך DD.MM.YYYY, בדיקת ספרת ביקורת, ושום פרט לא נרשם ללוג', async () => {
    const r = await api(owner, 'POST', '/api/ai/extract', { task: 'id_card', images: [PNG, PNG] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.idNumber, SECRET_ID); assert.strictEqual(r.json.data.birthDate, '01.02.1985'); assert.strictEqual(r.json.data.idValid, true);
    assert.ok(reqs.at(-1).body.messages[0].content.filter(x => x.type === 'image').length === 2);
    assert.ok(!srv.log.includes(SECRET_ID) && !srv.log.includes('ישראלי'), 'sensitive data in server log');
  });
  await step('סירוב (refusal), תמונה לא תקינה, משימה לא מוכרת', async () => {
    let r = await api(owner, 'POST', '/api/ai/extract', { task: 'collectors', images: [PNG], text: 'REFUSE-ME' });
    assert.strictEqual(r.status, 422); assert.match(r.json.error, /הצילום לא נקרא/);
    r = await api(owner, 'POST', '/api/ai/extract', { task: 'collectors', images: ['data:text/html;base64,AAAA'] }); assert.strictEqual(r.status, 400);
    r = await api(owner, 'POST', '/api/ai/extract', { task: 'collectors', images: [PNG, PNG] }); assert.strictEqual(r.status, 400);
    r = await api(owner, 'POST', '/api/ai/extract', { task: 'nope', images: [PNG] }); assert.strictEqual(r.status, 400);
  });
  await step('בלי ANTHROPIC_API_KEY: 503 עם הודעה בעברית', async () => {
    const c = await mk('http://localhost:' + NOKEY); await login(c, 'http://localhost:' + NOKEY, 'owner', 'Owner-pass-1');
    const r = await api(c, 'POST', '/api/ai/extract', { task: 'collectors', images: [PNG] });
    assert.strictEqual(r.status, 503); assert.strictEqual(r.json.error, 'קריאת תמונות דורשת חיבור ל-Claude: הגדר ANTHROPIC_API_KEY');
    assert.strictEqual((await api(c, 'GET', '/api/ai/status')).json.configured, false);
    assert.strictEqual((await api(c, 'POST', '/api/ai/command', { id: 'x', thread: [{ r: 'u', t: 'x' }] })).status, 503);
    await c.close();
  });
  await step('גובה: 403 לפקודה ולקריאת צילומים', async () => {
    assert.strictEqual((await api(owner, 'POST', '/api/users', { username: 'aiben', password: 'Ben-pass-12', role: 'collector', name: 'בן', collector_name: 'בן' })).status, 200);
    const c = await mk(URL); await login(c, URL, 'aiben', 'Ben-pass-12');
    const n = reqs.length;
    assert.strictEqual((await api(c, 'POST', '/api/ai/command', { id: '1fgu3jvapi2pm0izchsd', thread: [{ r: 'u', t: 'x' }] })).status, 403);
    assert.strictEqual((await api(c, 'POST', '/api/ai/extract', { task: 'collectors', images: [PNG] })).status, 403);
    assert.strictEqual((await api(c, 'POST', '/api/ai/extract', { task: 'id_card', images: [PNG] })).status, 403);
    assert.strictEqual(reqs.length, n, 'Claude נקרא למרות שאין הרשאה');
    await c.close();
  });
  await step('פקודה: שאלה חוזרת כשלא ברור, ובלי שינוי בחשבון', async () => {
    const before = (await api(owner, 'GET', '/api/accounts/1fgu3jvapi2pm0izchsd')).json;
    let r = await api(owner, 'POST', '/api/ai/command', { id: before.id, version: before._version, thread: [{ r: 'u', t: 'שאלה-בדיקה' }] });
    assert.strictEqual(r.json.kind, 'q'); assert.strictEqual(r.json.question, 'למי להעביר?');
    r = await api(owner, 'POST', '/api/ai/command', { id: before.id, version: before._version + 5, thread: [{ r: 'u', t: 'x' }] });
    assert.strictEqual(r.status, 409);
    const q = reqs.at(-1).body; assert.strictEqual(q.output_config.effort, 'medium'); assert.ok(q.output_config.format.schema.properties.changes);
    assert.strictEqual((await api(owner, 'GET', '/api/accounts/1fgu3jvapi2pm0izchsd')).json._version, before._version);
  });
  await step('פקודה בחשבון בוקר: שינוי משלוחים מוצג כ״משלוחים: 3,000 ← 200״', async () => {
    const m = (await api(owner, 'GET', '/api/accounts/0bbpt33xka2wijztw35v')).json;
    const r = await api(owner, 'POST', '/api/ai/command', { id: m.id, version: m._version, thread: [{ r: 'u', t: 'שנה משלוחים ל-200' }] });
    assert.strictEqual(r.json.kind, 'done'); assert.deepStrictEqual(r.json.lines, ['משלוחים: 3,000 ← 200']); assert.strictEqual(r.json.data.courier, 200);
    assert.strictEqual((await api(owner, 'GET', '/api/accounts/' + m.id)).json.courier, 3000, 'נשמר בלי אישור');
  });

  await step('באייפון: פקודה → פירוט שינויים → אישור → החשבון עודכן פעם אחת ונרשם ביומן', async () => {
    const id = '1fgu3jvapi2pm0izchsd';
    const before = (await api(owner, 'GET', '/api/accounts/' + id)).json;
    const p = await owner.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    let putBody = null; p.on('request', rq => { if (rq.method() === 'PUT' && rq.url().includes('/api/accounts/' + id)) putBody = rq.postDataJSON(); });
    await p.goto(URL + '/#/acc/' + id); await p.waitForSelector('#ai-box');
    await p.fill('#ai-in', 'ההוצאות של טאייה עוברות לעידן'); await p.click('#ai-go');
    await p.waitForSelector('.ai-det li');
    const lines = await p.locator('.ai-det li').allInnerTexts();
    assert.strictEqual(lines.length, 3, lines.join('|'));
    assert.ok(lines[0].includes(before.entries[0].n) && lines[0].includes('גובה: ' + before.entries[0].c + ' ← עידן') && lines[0].includes('סכום: 6,000 ← 6,100'), lines[0]);
    assert.ok(lines[1].startsWith('נמחק: ' + before.entries[1].n), lines[1]);
    assert.strictEqual(lines[2], 'נוסף: הוצאת בדיקה · 50 ₪');
    assert.ok(await p.locator('.note', { hasText: 'שינויים לא הובנו' }).count());
    await p.screenshot({ path: path.join(os.tmpdir(), 'ai-diff.png') });
    assert.strictEqual((await api(owner, 'GET', '/api/accounts/' + id)).json._version, before._version, 'נשמר לפני אישור');
    await p.click('#ai-ok'); await p.waitForSelector('.note.ok', { hasText: 'השינוי נשמר' });
    const after = (await api(owner, 'GET', '/api/accounts/' + id)).json;
    assert.strictEqual(after._version, before._version + 1);
    assert.strictEqual(after.entries.length, before.entries.length + 1 - 1);
    assert.strictEqual(after.entries[0].c, 'עידן'); assert.strictEqual(after.entries[0].a, 6100); assert.strictEqual(after.entries[0]._k, before.entries[0]._k);
    assert.ok(!after.entries.some(e => e._k === before.entries[1]._k));
    assert.deepStrictEqual({ ...after.entries.at(-1), _k: undefined }, { k: 'e', n: 'הוצאת בדיקה', a: 50, c: 'עידן', _k: undefined });
    // אותו opId שוב (ניסיון חוזר) → לא נשמר פעמיים
    assert.ok(putBody && putBody.opId);
    const rep = await api(owner, 'PUT', '/api/accounts/' + id, putBody);
    assert.strictEqual(rep.json.replay, true);
    assert.strictEqual((await api(owner, 'GET', '/api/accounts/' + id)).json._version, after._version);
    const audit = (await api(owner, 'GET', '/api/audit?limit=50')).json.filter(x => x.doc_id === id);
    assert.ok(audit.some(x => x.action === 'פקודה ל-Claude' && x.note.includes('טאייה')), 'אין רישום פקודה');
    assert.strictEqual(audit.filter(x => (x.note || '').startsWith('פקודה חופשית:')).length, 1, 'שמירה נרשמה ' + audit.filter(x => (x.note || '').startsWith('פקודה חופשית:')).length + ' פעמים');
    // ביטול השינוי
    p.once('dialog', d => d.accept()); await p.click('#ai-undo'); await p.waitForSelector('.note', { hasText: 'השינוי בוטל' });
    const undone = (await api(owner, 'GET', '/api/accounts/' + id)).json;
    assert.deepStrictEqual(undone.entries, before.entries);
    // פקודות אחרונות
    assert.ok(await p.locator('[data-ai-rec]').count());
    assert.deepStrictEqual(errs, []);
    await p.close();
  });

  await b.close(); srv.kill(); nokey.kill(); fake.close();
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} עברו`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
