// לולאת הכלים של המלווה מול שרת Claude מדומה: המודל קורא ל-get_status ול-suggest_meal, והכרטיסים מחושבים בקוד
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

test('Claude tool loop → כרטיסי ארוחה מהמאגר', async () => {
  const calls = [];
  const mock = http.createServer(async (req, res) => {
    let b = ''; for await (const c of req) b += c; const body = JSON.parse(b); calls.push(body);
    const last = body.messages[body.messages.length - 1];
    let content, stop = 'tool_use';
    if (calls.length === 1) content = [{ type: 'tool_use', id: 'tu1', name: 'get_status', input: {} }];
    else if (calls.length === 2) content = [{ type: 'tool_use', id: 'tu2', name: 'suggest_meal', input: { slot: 'dinner' } }];
    else { content = [{ type: 'text', text: 'הנה שלוש אפשרויות לערב.' }]; stop = 'end_turn'; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_' + calls.length, type: 'message', role: 'assistant', model: body.model, content, stop_reason: stop, usage: { input_tokens: 1, output_tokens: 1 } }));
  });
  await new Promise(r => mock.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${mock.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tafrit-ai-'));
  const S = await import('../../server/store.js');
  const { chat } = await import('../../server/ai.js');
  const uid = 'u_test1';
  S.saveProfile(uid, { sex: 'male', age: 38, heightCm: 180, goal: 'lose', rate: 'moderate', job: 'sitting', strength: { perWeek: 3, minutes: 60 }, meals: 3, onboarding: { done: true } });
  S.upsertWeight(uid, { kg: 120 }); S.addTarget(uid, { kcal: 2250, protein: 180 });
  // משתמש אחר עם נתונים שונים — לא אמור להופיע בתשובה
  S.saveProfile('u_other', { sex: 'female', age: 30, heightCm: 160, goal: 'gain', meals: 3, onboarding: { done: true } }); S.upsertWeight('u_other', { kg: 55 });
  const r = await chat({ id: uid, ai_consent_at: Date.now() }, 'מה כדאי לי לאכול הערב?');
  mock.close();
  assert.equal(r.mode, 'ai');
  assert.equal(r.text, 'הנה שלוש אפשרויות לערב.');
  assert.ok(r.cards.filter(c => c.type === 'meal').length >= 2);
  assert.equal(calls[0].model, 'claude-opus-5-5');
  assert.equal(calls[0].output_config.effort, 'low');
  assert.ok(calls[0].tools.some(t => t.name === 'suggest_meal'));
  const toolResult = calls[2].messages.at(-1).content[0];
  assert.equal(toolResult.type, 'tool_result'); assert.equal(toolResult.tool_use_id, 'tu2');
  const out = JSON.parse(toolResult.content); assert.equal(out.slot, 'dinner'); assert.ok(out.options[0].total_kcal > 0);
  // הכמויות בכרטיס זהות לחישוב מול המאגר
  const c = r.cards[0]; const f = S.foodsFor(uid).get(c.items[0].foodId);
  const status = JSON.parse(calls[1].messages.at(-1).content[0].content); assert.equal(status.latest_weight.kg, 120);
  assert.ok(!JSON.stringify(calls).includes('55'), 'אין נתונים של משתמש אחר');
  assert.equal(c.items[0].kcal, Math.round(f.k * c.items[0].grams / 100));
});
