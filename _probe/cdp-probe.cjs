const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  let page = null;
  for (const c of contexts) {
    for (const p of c.pages()) {
      if (p.url().includes('tauri.localhost')) page = p;
    }
  }
  if (!page) {
    console.log('NO PAGE FOUND');
    await browser.close();
    return;
  }
  console.log('PAGE URL:', page.url());

  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} :: ${r.failure()?.errorText}`));

  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(6000);

  console.log('\n===== CONSOLE =====');
  console.log(logs.length ? logs.join('\n') : '(empty)');

  console.log('\n===== ENV =====');
  const env = await page.evaluate(async () => {
    const out = {};
    out.tauriInternals = typeof window.__TAURI_INTERNALS__;
    out.tauriKeys = window.__TAURI_INTERNALS__ ? Object.keys(window.__TAURI_INTERNALS__).slice(0, 12) : null;
    out.href = location.href;
    try {
      const mod = await import('/assets/index.js').catch(() => null);
      out.dynImport = mod ? 'ok' : 'fail';
    } catch (e) { out.dynImport = String(e); }
    return out;
  }).catch((e) => ({ err: String(e) }));
  console.log(JSON.stringify(env, null, 2));

  console.log('\n===== ASSET PROTOCOL TEST =====');
  const assetTest = await page.evaluate(async () => {
    const p = 'C:\\Users\\yel\\AppData\\Roaming\\kuro-cat-pet\\skins\\idle.png';
    const variants = [
      'http://asset.localhost/' + encodeURIComponent(p),
      'https://asset.localhost/' + encodeURIComponent(p),
      'http://asset.localhost/' + p.replace(/\\/g, '/'),
    ];
    const results = [];
    for (const u of variants) {
      try {
        const r = await fetch(u);
        results.push({ url: u, status: r.status, len: (await r.arrayBuffer()).byteLength });
      } catch (e) {
        results.push({ url: u, error: String(e) });
      }
    }
    return results;
  }).catch((e) => ({ err: String(e) }));
  console.log(JSON.stringify(assetTest, null, 2));

  console.log('\n===== ASSET SCOPE FILES =====');
  const fsTest = await page.evaluate(async () => {
    const tries = [
      'C:\\Users\\yel\\AppData\\Roaming\\kuro-cat-pet\\skins\\idle.png',
      'C:\\Users\\yel\\AppData\\Roaming\\kuro-cat-pet\\skins\\skin.json',
    ];
    const out = [];
    for (const p of tries) {
      try {
        const r = await window.__TAURI_INTERNALS__.invoke('plugin:fs|read_file', { path: p });
        out.push({ p, ok: true, bytes: r?.length ?? null });
      } catch (e) {
        out.push({ p, ok: false, err: String(e).slice(0, 200) });
      }
    }
    return out;
  }).catch((e) => ({ err: String(e) }));
  console.log(JSON.stringify(fsTest, null, 2));

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
