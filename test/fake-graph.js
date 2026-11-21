// שרת דמה של WhatsApp Cloud API — לבדיקות בלבד. מחקה את תשובות Meta ושולח Webhook חתום לאפליקציה.
// מספרים שמסתיימים ב-99 נכשלים במסירה (131026); מספרים שמסתיימים ב-98 נדחים מיד בשליחה (131026).
import http from 'node:http';
import crypto from 'node:crypto';

export function startFakeGraph({ port = 8099, appUrl, appSecret, phoneId = 'PN1', wabaId = 'WABA1', onSend } = {}) {
  const templates = [
    { name: 'collection_reminder', language: 'he', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'שלום {{1}}, תזכורת: התשלום שלך בסך {{2}} לתאריך {{3}}. הגובה יגיע בשעה {{4}}. תודה!' }, { type: 'FOOTER', text: 'להסרה השיבו "הסר"' }] },
    { name: 'split_details', language: 'he', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'שלום {{1}}, פירוט החוב לתאריך {{2}}: {{3}}. סה״כ {{4}}.' }] },
    { name: 'pending_one', language: 'he', status: 'PENDING', category: 'UTILITY', components: [{ type: 'BODY', text: 'בדיקה {{1}}' }] },
  ];
  const sent = []; let subs = [];
  const hook = async (status, wamid, to, errors) => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: wabaId, changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: phoneId }, statuses: [{ id: wamid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: to, ...(errors ? { errors } : {}) }] } }] }] });
    const sig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');
    await fetch(appUrl + '/webhooks/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig }, body }).catch(() => {});
  };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); let b = ''; for await (const c of req) b += c;
    const j = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/APP1/subscriptions') { if (req.method === 'POST') { const f = new URLSearchParams(b); subs = f.get('fields').split(','); return j(200, { success: true }); } return j(200, { data: subs.length ? [{ object: 'whatsapp_business_account', callback_url: appUrl + '/webhooks/whatsapp', fields: subs.map(name => ({ name, version: 'v21.0' })) }] : [] }); }
    if (req.headers.authorization !== 'Bearer TEST_TOKEN') return j(401, { error: { code: 190, message: 'Invalid OAuth access token' } });
    if (req.method === 'GET' && u.pathname === '/' + phoneId) return j(200, { display_phone_number: '+972 50-000-0000', verified_name: 'בדיקה (דמה)', quality_rating: 'GREEN', messaging_limit_tier: 'TIER_1K', id: phoneId });
    if (req.method === 'GET' && u.pathname === `/${wabaId}/message_templates`) return j(200, { data: templates });
    if (req.method === 'POST' && u.pathname === `/${wabaId}/message_templates`) { const t = JSON.parse(b); templates.push({ ...t, status: 'PENDING' }); return j(200, { id: 'T' + templates.length, status: 'PENDING', category: t.category }); }
    if (req.method === 'GET' && u.pathname === '/app') return j(200, { id: 'APP1', name: 'Yoman' });
    if (req.method === 'POST' && u.pathname === `/${wabaId}/subscribed_apps`) return j(200, { success: true });
    if (req.method === 'POST' && u.pathname === `/${phoneId}/messages`) {
      const m = JSON.parse(b); const to = m.to;
      const t = templates.find(x => x.name === m.template?.name && x.language === m.template?.language?.code);
      if (!t || t.status !== 'APPROVED') return j(400, { error: { code: 132001, message: 'Template name does not exist in the translation' } });
      const need = (t.components.find(c => c.type === 'BODY').text.match(/\{\{\d+\}\}/g) || []).length;
      const got = (m.template.components?.[0]?.parameters || []).length;
      if (need !== got) return j(400, { error: { code: 132000, message: 'Number of parameters does not match' } });
      if (to.endsWith('98')) return j(400, { error: { code: 131026, message: 'Message Undeliverable' } });
      const wamid = 'wamid.' + crypto.randomBytes(8).toString('hex');
      sent.push({ to, wamid, params: m.template.components?.[0]?.parameters?.map(p => p.text) || [] }); onSend && onSend(sent[sent.length - 1]);
      j(200, { messaging_product: 'whatsapp', contacts: [{ input: to, wa_id: to }], messages: [{ id: wamid }] });
      setTimeout(() => hook('sent', wamid, to), 150);
      if (to.endsWith('99')) setTimeout(() => hook('failed', wamid, to, [{ code: 131026, title: 'Message undeliverable' }]), 400);
      else { setTimeout(() => hook('delivered', wamid, to), 400); if (to.endsWith('0')) setTimeout(() => hook('read', wamid, to), 700); }
      return;
    }
    j(404, { error: { code: 100, message: 'Unknown path ' + u.pathname } });
  });
  return new Promise(r => srv.listen(port, () => r({ srv, sent, templates, close: () => srv.close() })));
}
