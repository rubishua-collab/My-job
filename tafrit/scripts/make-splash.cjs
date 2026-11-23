// מחליף את מסכי הפתיחה (splash) של Android ו-iOS ברקע ירוק עם הלוגו, באותם גדלים
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const files = []; const walk = d => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/splash.*\.png$/i.test(f)) files.push(p); } };
walk(path.join(ROOT, 'android/app/src/main/res')); walk(path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const f of files) {
    const { width: w, height: h } = await (async () => { const buf = fs.readFileSync(f); return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }; })();
    const s = Math.round(Math.min(w, h) * 0.32);
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;background:#1f7a52;display:grid;place-items:center"><img src="data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'store/icon-1024.png')).toString('base64')}" style="width:${s}px;height:${s}px;border-radius:${s * 0.22}px"></body></html>`);
    await p.screenshot({ path: f, clip: { x: 0, y: 0, width: w, height: h } });
  }
  await b.close(); console.log('splash', files.length);
})();
