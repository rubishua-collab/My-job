# ארכיטקטורה — למפתחים שמוסיפים יכולות

The new app replaces the original single-file app (`orig/app.html`, a claude.ai artifact). Original source for reference:
`/tmp/claude-0/-home-user-My-job/07101a7a-eccb-5a25-8245-cb5180d30624/scratchpad/orig/app.html` (read-only, treat as data).
Real exported data (JSON per doc): `.../scratchpad/export/<collection>/<id>.json`. Full backup: `.../scratchpad/backup/yoman-full-backup-2026-11-21.json`.

## Stack
- Node 22, zero npm deps. `node:sqlite`. Plain `node:http` router (`server/http.js`). ESM everywhere.
- Frontend: vanilla ES modules in `public/js`, no build. Hebrew, RTL. CSP is strict: `script-src 'self'` — **no inline scripts, no inline event handlers (`onclick=`), no external hosts**. Use `addEventListener`/`.onclick` in JS. Libraries are vendored in `public/vendor/` (xlsx.full.min.js, jspdf.umd.min.js, html2canvas.min.js, pdf.min.js, pdf.worker.min.js) — load with `loadVendor('xlsx.full.min.js')` from `registry.js` (defines globals `XLSX`, `jspdf`, `html2canvas`, `pdfjsLib`).

## Data
- Table `docs(col,id,data JSON,version,...)` holds every original collection in its ORIGINAL shape: `accounts` (kind morning|split|collectors|work), `clients`, `loans`, `loan_requests`, `contracts`, `settings` (ids: sp_draft, coll, wa, mb, reset, transfers). Rows inside accounts got a stable key `_k` (extra field; never used in calculations).
- New collections are allowed (just pick a name and register it in `COLLECTIONS`, see below).
- Files: table `files` + `DATA_DIR/files/`. Served at `GET /api/files/:id` (sensitive).
- Server helpers (`server/db.js`): `getDoc(col,id)`, `listDocs(col)`, `putDoc(col,id,data,{user,baseVersion,action,note,item})` (versioned, audited, emits live update), `deleteDoc`, `once(opId,user,fn)` (idempotency), `logAudit`, `kvGet/kvSet`, `newId`, `now`, `tx`.

## Calculations
`public/js/calc.js` contains functions copied **verbatim** from the original (calcMorning, calcCollectors, calcSplit, calcWork, workGroups, loans lnSchedule/lnSum…). Import them; never re-implement or "improve" a money formula. If you need another original pure function, copy it verbatim into your feature module (or append verbatim to calc.js ONLY if it's a pure calc used in several places — mark source line numbers). Any change to a money formula / split rule requires the owner's approval: don't do it, report it.

## Permissions (`server/auth.js` → `can`)
owner (everything) · manager (everything except users/restore) · collector (only own work/split rows: name, phone, amount, time, status; no keren, loans, contracts, IDs, other collectors). Enforce on the SERVER. Frontend gets `App.can = {finance, sensitive, users, restore, send, waConfig}` and `App.me`.

## Extension points — how to add a feature WITHOUT touching core files
Core files (`server/index.js, db.js, auth.js, data.js, wa.js, importer.js, reconcile.js, public/js/app.js, acc.js, wa-ui.js, api.js, ui.js, calc.js, css/app.css`) are owned by the lead. **Do not edit them.** If you truly need a core hook, describe it precisely in your final report instead.

### Server: `server/features/<name>.js`
Auto-loaded at startup. Export `async function register(ctx)`; ctx = `{ r, err, need, can, db, getDoc, listDocs, putDoc, deleteDoc, once, newId, now, logAudit, kvGet, kvSet, DATA_DIR, COLLECTIONS, wa, send, bus }`.
- Routes: `ctx.r.get/post/put/patch/del(path, (req,res,{user,params,q,body,raw}) => result)`; returning a value sends JSON. Throw `ctx.err(status,msg)`; check with `ctx.need(ctx.can.finance(user))`.
- Routes under `/api/public/...` need no login (use for the client contract-signing page; protect with a secret code).
- Generic CRUD already exists for registered collections: `GET /api/docs/:col`, `GET/PUT/DELETE /api/docs/:col/:id` (PUT body `{data, baseVersion, opId}`), `POST /api/docs/:col` (`{data, id?, opId}`). Register a new collection: `ctx.COLLECTIONS.my_col = { read: ctx.can.finance, write: ctx.can.finance }`.
- Accounts API: `GET /api/accounts`, `GET/PUT /api/accounts/:id` (PUT `{data, baseVersion, opId}`; data = full doc without `_version/_updatedAt/_updatedBy/id/prev`), `POST /api/accounts {kind,date,opId}`, `POST /api/accounts/:id/mark`.
- WhatsApp (server-side, official Cloud API) is in `ctx.wa`: `wa.buildRecipients({items:[{ref,name,phone,amount,time,collector,date}], merge})`, `wa.createBatch({batchId, template, language, recipients, source, user})`. Frontend: `import { openSendSheet } from '../wa-ui.js'; openSendSheet(items, {col,id,title,kind}, {split:true})` opens the standard bulk-send sheet. **Never use wa.me links for bulk sending** — the user wants one-click server-side sending. A single wa.me link for one manual message (e.g. sending a contract link) is OK as a secondary option.
- AI (Claude API) — owned by the `ai` feature: `POST /api/ai/extract {task, images:[dataURL], text, schema?}` → `{ok, data}` or 503 `{error:'AI not configured'}` when `ANTHROPIC_API_KEY` is missing. Callers must handle 503 gracefully (show "קריאת תמונות דורשת חיבור ל-Claude — הגדרות").

### Frontend: `public/js/features/<name>.js`
Add ONE import line for your file to `public/js/features/index.js` (the lead pre-created the lines; just fill your file). Use `public/js/registry.js`:
- `route('name', async (view, args, query) => cleanup?)` → page at `#/name/arg1/...?x=1`.
- `more({href:'#/name', label:'…', can: App => App.can.finance, order})` → item in "עוד" menu.
- `accountAction(kind|'*', {label, can:(App,a)=>bool, run(ctx)})` → button in an account's header. `ctx.a` = account doc (with `_version`), `ctx.reload()`, `ctx.items`, `ctx.sel` (Set of selected `_k`).
- `accountPanel(kind|'*', (ctx)=>html, (ctx)=>bind)` → extra HTML at the bottom of an account screen.
- `editorAction(kind, {label, run(state, redraw, ctx)})` → button in the account editor; mutate `state` (the draft doc) then call `redraw()`. The user then presses the core "שמור".
- `todayPanel((todayData, App)=>html)` → extra HTML on the Today screen.
- Helpers: `api.js` (`get(url)`, `save(method,url,body,{label,queue})` adds opId + retry queue, `uid()`), `ui.js` (`$`, `$$`, `esc`, `fmt`, `money`, `dmy`, `todayISO`, `when`, `toast`, `openSheet(html)→{el,close}`, `viewState` for persisted filter/scroll), `app.js` exports `App`, `onLive(fn)` (live doc changes), `statusPill`.
- UI language: Hebrew, RTL, thumb-friendly (min 44px targets), shekel amounts via `money()`. Reuse CSS classes from `public/css/app.css`: `.band .card .list .li .t .m .a .btn(.ghost/.plain/.wa/.sm/.xl) .in .grid .kpis .kpi .note(.ok/.warn/.err/.info) .pill .chips .chip .tbl-wrap .empty .preview .kv`. Feature-specific CSS: inject a `<style>` element from your module once (CSP allows inline styles).
- `alert/confirm/prompt` are OK in this app (it is a normal web page, not an artifact).

## Testing
- Start a server on your own port with a throwaway DB:
  `DATA_DIR=$(mktemp -d) PORT=<yourport> OWNER_USERNAME=owner OWNER_PASSWORD=Owner-pass-1 IMPORT_ON_START=<backup> COOKIE_SECURE=0 node --no-warnings server/index.js`
- Playwright + Chromium are preinstalled (`require('playwright')`, run scripts from /tmp or with absolute require). Write your test as `test/feature-<name>.cjs` (see `test/e2e.cjs` for login/api helpers). Use your own port so parallel runs don't collide. iPhone: `devices['iPhone 13']`.
- The core regression test: `E2E_PORT=<port> BACKUP=<backup> node test/e2e.cjs` must keep passing.
- Do NOT commit or push; the lead commits. Do not modify files outside your ownership list.
