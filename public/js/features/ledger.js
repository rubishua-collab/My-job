// יומן גובים ושליחים, העברות כספים, הודעות בוקר.
// מקור: app.html 9875-10653 (חיפוש איסופים לפי גובה ושליח) ו-9616-9841 (הודעות בוקר).
// חישובים: ledger-calc.js · מסך היומן: ledger-ui.js · הודעות בוקר: ledger-morning.js · שרת: server/features/ledger.js
import { route, more, todayPanel, accountAction } from '../registry.js';
import { esc } from '../ui.js';
import { onLive } from '../app.js';
import { lgLoad, lgMount, lgDirty, sheetOpen } from './ledger-ui.js';
import { renderMorning } from './ledger-morning.js';

// עיצוב: הועתק מהמקור (app.html 899-1003, ״חיפוש איסופים לפי גובה ושליח״), עם המשתנים של האפליקציה החדשה
const CSS = `
.lg{display:flex;flex-direction:column;gap:12px}
.lg .phd{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.lg .lg-h{font-size:18px;font-weight:700;margin:0}
.lg .grow,.lg-acts .grow{flex:1}
.lg .field{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--muted);min-width:0}
.lg .grid2,#dd-body .grid2{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr))}
#dd-body .field{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--muted);min-width:0}
.ln-seg{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--field)}
.ln-seg button{appearance:none;flex:1;border:0;background:transparent;color:var(--muted);padding:8px 12px;font-weight:600;cursor:pointer;min-height:44px;white-space:nowrap}
.ln-seg button+button{border-inline-start:1px solid var(--line)}
.ln-seg button[aria-pressed="true"]{background:var(--accent);color:var(--accent-fg)}
.chip-ck{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--line);border-radius:16px;background:var(--bg);cursor:pointer;font-size:14px;min-height:40px}
.chip-ck input{margin:0;width:20px;height:20px}
.sg-search{display:flex;flex-direction:column;gap:8px}
.sg-sbar{display:flex;align-items:center;background:var(--field);border:2px solid var(--accent);border-radius:12px}
.sg-sbar:focus-within{background:var(--surface);box-shadow:0 0 0 4px var(--accent-soft)}
.sg-sico{flex:none;color:var(--accent);margin-inline-start:14px}
.sg-sin{flex:1;min-width:0;border:0;background:transparent;color:var(--fg);font:inherit;font-size:17px;font-weight:600;padding:12px 10px;min-height:52px;outline:none;text-align:right;direction:rtl;-webkit-appearance:none;appearance:none}
.sg-sin::-webkit-search-cancel-button{display:none}
.sg-sclr{flex:none;appearance:none;border:0;background:var(--surface2);color:var(--fg);width:40px;height:40px;border-radius:999px;margin-inline-end:8px;font-size:23px;line-height:1;cursor:pointer}
.lg-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.lg-chips:empty{display:none}
.lg-chip{appearance:none;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;min-height:36px}
.lg-chip:hover{border-color:var(--accent);background:var(--accent-soft)}
.lg-chip.on{background:var(--accent);border-color:var(--accent);color:var(--accent-fg);cursor:default}
.lg-chip.on button{appearance:none;border:0;background:rgba(255,255,255,.22);color:inherit;width:28px;height:28px;border-radius:999px;font-size:17px;line-height:1;cursor:pointer;padding:0}
.lg-dates{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.lg-dates .lg-seg{flex:0 0 auto}
.lg-dates .lg-df{flex:0 1 170px}
.lg .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.lg-quick .btn[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink)}
.lg-flt{border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:var(--bg)}
.lg-flt[open]{display:flex;flex-direction:column;gap:10px}
.lg-flt summary{display:flex;align-items:center;gap:8px;min-height:40px;cursor:pointer}
.lg-out{display:flex;flex-direction:column;gap:12px;min-width:0}
.lg-cap{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;padding-top:4px;border-top:1px solid var(--line)}
.lg-cap b{font-size:16px}
.lg-kpis{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));margin:0}
.lg-kpis .kpi{cursor:default;display:flex;flex-direction:column;gap:2px}
.lg-kpis .kl{font-size:13px;color:var(--muted);font-weight:600}
.lg-kpis .kv{font-size:19px;font-weight:800}
.lg-kpis .ks{font-size:12px;color:var(--muted);display:flex;flex-direction:column}
.lg-kpis .lg-k-in{border-color:var(--accent);background:var(--accent-soft)}
.lg-kpis .lg-k-in .kv{color:var(--accent-ink)}
.lg-kpis .lg-k-net{border-color:var(--ok-fg);background:var(--ok-bg)}
.lg-kpis .lg-k-net .kv{color:var(--ok-fg)}
.lg-kpis .lg-k-tr{border-style:dashed;border-color:var(--gold)}
.lg-kpis .lg-k-held{border-color:var(--warn-fg);background:var(--warn-bg)}
.lg-kpis .lg-k-held .kv,.lg-kpis .lg-k-held .ks{color:var(--warn-fg)}
.lg-kpis .lg-k-bal .kv{color:var(--neg)}
.lg-where{display:flex;flex-direction:column;gap:6px}
.lg-w{display:inline-flex;align-items:baseline;gap:8px;border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--surface);font-size:13.5px}
.lg-w>span:first-child{color:var(--muted);font-weight:600}
.lg-w.cour{border-color:var(--warn-fg)}
.lg-w.unk{border-style:dashed}
.lg-b{border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}
.lg-b.open{box-shadow:var(--shadow)}
.lg-bh,.lg-gh{appearance:none;width:100%;display:flex;align-items:center;gap:10px;border:0;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer;padding:12px 14px;min-height:52px}
.lg-bh{background:linear-gradient(160deg,var(--band2),var(--band));color:var(--band-fg)}
.lg-bh .muted{color:var(--band-muted)}
.lg-bh b{font-size:16px}
.lg-car{flex:none;display:inline-block;font-size:20px;line-height:1;transition:transform .15s;transform:rotate(180deg)}
[aria-expanded="true"]>.lg-car{transform:rotate(90deg)}
.lg-bt,.lg-gt{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.lg-bs,.lg-gs{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;justify-content:flex-end;font-weight:700;white-space:nowrap}
.lg-bb{display:flex;flex-direction:column;gap:10px;padding:12px}
.lg-g{border:1px solid var(--line);border-radius:8px;background:var(--bg)}
.lg-g-self{border-inline-start:4px solid var(--accent)}
.lg-g-cour{border-inline-start:4px solid var(--gold)}
.lg-g-unk{border-inline-start:4px dashed var(--muted)}
.lg-gh{min-height:48px;padding:10px 12px}
.lg-gb{display:flex;flex-direction:column;gap:10px;padding:0 12px 12px}
.lg-rl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:8px;background:var(--surface);overflow:hidden}
.lg-r{display:flex;align-items:flex-start;gap:10px;padding:9px 10px;border-bottom:1px solid var(--line)}
.lg-r:last-child{border-bottom:0}
.lg-r.lg-part{background:var(--warn-bg)}
.lg-r.lg-not,.lg-r.lg-plan,.lg-r.lg-pass,.lg-r.lg-na{opacity:.85}
.lg-i{flex:none;min-width:24px;height:24px;border-radius:999px;background:var(--surface2);color:var(--muted);font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}
.lg-rm{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.lg-r1{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
.lg-n{font-size:15px}
.lg-amt{margin-inline-start:auto;font-weight:700;font-size:15px}
.lg-r2{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;font-size:12.5px;color:var(--muted)}
.lg-r2 .pill{font-size:11.5px}
.lg-dot{opacity:.6}
.lg-nt{color:var(--fg);font-style:italic}
.lg-src{margin-inline-start:auto;font-size:11.5px;opacity:.8}
.lg-mt{font-size:11px;font-weight:700;border-radius:6px;padding:0 6px;line-height:18px}
.lg-mt-n{background:var(--surface2);color:var(--fg)}
.lg-mt-rc{background:var(--accent-soft);color:var(--accent-ink)}
.lg-mt-by{background:var(--warn-bg);color:var(--warn-fg)}
.lg-ed{flex:none;appearance:none;border:1px solid var(--line);background:var(--surface);color:var(--accent-ink);width:44px;height:44px;border-radius:8px;font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}
.lg-ed:hover{border-color:var(--accent);background:var(--accent-soft)}
.lg-ed.sm{width:40px;height:40px;font-size:14px}
.lg-sub{display:flex;flex-direction:column;gap:6px}
.lg-xl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.lg-xl li{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:13.5px}
.lg-xl li>span:first-child{flex:1;min-width:0}
.lg-xa{font-weight:700;white-space:nowrap}
.lg-gsum{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,118px),1fr));gap:6px}
.lg-gsum>div{display:flex;flex-direction:column;gap:1px;border:1px solid var(--line);border-radius:6px;padding:6px 9px;background:var(--surface)}
.lg-gsum>div>span{font-size:11.5px;color:var(--muted);font-weight:600}
.lg-gsum>div>b{font-size:15px}
.lg-gsum>div.hl{background:var(--ok-bg);border-color:var(--ok-fg)}
.lg-gsum>div.warn{background:var(--warn-bg);border-color:var(--warn-fg)}
.lg-notes{line-height:1.7}
.lg-form{display:flex;flex-direction:column;gap:12px}
.lg-fs{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:0;display:flex;flex-direction:column;gap:8px;min-width:0}
.lg-fs legend{font-size:12.5px;font-weight:700;color:var(--muted);padding:0 4px}
.lg-bym{align-self:flex-start}
.lg-form .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.lg-form .grow{flex:1}
output.lg-out-bal{display:block;background:var(--surface2);font-weight:700}
.btn.armed{background:var(--neg);color:#fff}
.lg-ro .lg-ed,.lg-ro [data-lg-tradd],.lg-ro [data-lg-bulk]{display:none!important}
@media (max-width:640px){.lg-bh,.lg-gh{flex-wrap:wrap}.lg-bs,.lg-gs{width:100%;justify-content:flex-start;padding-inline-start:30px}}
`;
let styled = false;
const style = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };

// ---- יומן גובים ושליחים ----
route('ledger', async (view, args, q) => {
  style();
  view.innerHTML = `<div class="band"><div class="grow"><div class="eyebrow">איסוף יומי + חשבון גובים</div><h1>יומן גובים ושליחים</h1></div></div><div id="lg-host"><div class="empty">טוען…</div></div>`;
  await lgLoad();
  lgMount(view.querySelector('#lg-host'), { date: q.get('d') || '' });
  let t;
  return onLive((e) => {
    if (!(e.col === 'accounts' || (e.col === 'settings' && e.id === 'transfers'))) return;
    clearTimeout(t); t = setTimeout(async () => { if (sheetOpen()) return; try { await lgLoad(); lgDirty(); } catch { /* */ } }, 400);
  });
});
more({ href: '#/ledger', label: 'יומן גובים ושליחים · העברות כספים', can: App => App.can.finance, order: 20 });
for (const kind of ['work', 'collectors']) accountAction(kind, { label: 'חיפוש לפי גובה ושליח', can: (App) => App.can.finance, run: (ctx) => { location.hash = '#/ledger?d=' + encodeURIComponent(ctx.a.date || ''); } });

// ---- הודעות בוקר ----
route('morning-msgs', async (view, args, q) => { style(); return renderMorning(view, args, q); });
more({ href: '#/morning-msgs', label: 'הודעות בוקר בוואטסאפ', can: App => App.can.send, order: 21 });
todayPanel((d, App) => App.can.send ? `<a class="btn wa" id="mb-today" href="#/morning-msgs?date=${esc(d.date)}">הודעות בוקר</a> ` : '');
