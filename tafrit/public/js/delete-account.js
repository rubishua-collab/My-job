const $ = s => document.querySelector(s);
const post = async (u, b) => { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'שגיאה'); return j; };
const msg = (t, cls = '') => { $('#msg').innerHTML = `<div class="note ${cls}"></div>`; $('#msg .note').textContent = t; };
document.addEventListener('DOMContentLoaded', () => {
  $('#cd').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
  $('#f1').addEventListener('submit', async e => { e.preventDefault(); try { await post('/api/public/delete-request', { email: $('#em').value }); $('#f2').hidden = false; msg('אם יש חשבון, נשלח קוד לדוא״ל.'); } catch (x) { msg(x.message, 'err'); } });
  $('#f2').addEventListener('submit', async e => { e.preventDefault(); try { await post('/api/public/delete-confirm', { email: $('#em').value, code: $('#cd').value }); $('#f1').hidden = true; $('#f2').hidden = true; msg('החשבון וכל המידע נמחקו.', 'ok'); } catch (x) { msg(x.message, 'err'); } });
});
