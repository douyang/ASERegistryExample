#!/usr/bin/env node
// Serves the site locally, renders it headless (desktop + mobile), exercises the UI,
// fails on console/page errors, and refreshes docs/screenshots/*.png.
// Run: node scripts/validate.cjs   (needs playwright + chromium; PLAYWRIGHT_MODULE overrides the module path)
const path = require('path');
const http = require('http');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.csv': 'text/csv' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(root, p);
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await pw.chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  const shots = path.join(root, 'docs', 'screenshots'); fs.mkdirSync(shots, { recursive: true });
  async function page(vp) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    pg.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g(oogleapis|static)|ERR_NAME_NOT_RESOLVED|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`); });
    pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    pg.on('requestfailed', (r) => { if (/127\.0\.0\.1/.test(r.url())) errors.push(`request failed: ${r.url()}`); });
    return pg;
  }
  const expect = (cond, msg) => { if (!cond) errors.push(`assert: ${msg}`); };
  const data = (() => { const vm = require('vm'); const w = {}; vm.runInNewContext(fs.readFileSync(path.join(root, 'data', 'products.js'), 'utf8'), { window: w }); return w.AIECHO_PRODUCTS; })();

  // ---- desktop
  const d = await page({ width: 1400, height: 900 });
  await d.goto(base + 'index.html#products', { waitUntil: 'load' }); await d.waitForTimeout(600);
  const nCards = await d.locator('#cards .card').count();
  expect(nCards === data.families.length, `cards ${nCards} != families ${data.families.length}`);
  await d.screenshot({ path: path.join(shots, 'products-desktop.png'), fullPage: false });
  // filter interaction: first category checkbox
  const firstCb = d.locator('#filters input[type=checkbox]').first();
  await firstCb.check(); await d.waitForTimeout(150);
  const nFiltered = await d.locator('#cards .card').count();
  expect(nFiltered > 0 && nFiltered <= nCards, `filter yields ${nFiltered}`);
  await d.locator('#clear-filters').click(); await d.waitForTimeout(150);
  expect((await d.locator('#cards .card').count()) === nCards, 'clear filters restores all');
  // search
  await d.fill('#search', 'ultromics'); await d.waitForTimeout(300);
  const nSearch = await d.locator('#cards .card').count(); expect(nSearch > 0 && nSearch < nCards, `search ultromics -> ${nSearch}`);
  await d.fill('#search', ''); await d.waitForTimeout(300);
  // open panel
  await d.locator('#cards .card').first().click(); await d.waitForTimeout(200);
  expect(!(await d.locator('#panel').isHidden()), 'panel opens');
  expect((await d.locator('#panel-title').textContent()).trim().length > 0, 'panel has title');
  expect(/#product\//.test(await d.evaluate(() => location.hash)), 'hash routes to product');
  await d.screenshot({ path: path.join(shots, 'product-detail-desktop.png'), fullPage: false });
  await d.keyboard.press('Escape'); await d.waitForTimeout(150);
  expect(await d.locator('#panel').isHidden(), 'Escape closes panel');
  // table view
  await d.locator('.view-toggle button[data-view=table]').click(); await d.waitForTimeout(150);
  expect((await d.locator('#table tbody tr').count()) === nCards, 'table rows match');
  expect((await d.locator('#cards').evaluate((el) => el.offsetHeight)) === 0, 'card grid hidden in table view');
  expect(await d.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal page scroll (desktop table view)');
  await d.setViewportSize({ width: 1024, height: 900 }); await d.waitForTimeout(150);
  expect(await d.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal page scroll (1024px table view)');
  await d.setViewportSize({ width: 1400, height: 900 }); await d.waitForTimeout(150);
  await d.screenshot({ path: path.join(shots, 'products-table-desktop.png'), fullPage: false });
  await d.locator('.view-toggle button[data-view=cards]').click();
  // registry
  await d.goto(base + 'index.html#registry', { waitUntil: 'load' }); await d.waitForTimeout(600);
  expect(!(await d.locator('#registry').isHidden()), 'registry tab visible');
  const nRows = await d.locator('#reg-charts svg .row').count(); expect(nRows > 0, `registry chart rows ${nRows}`);
  expect((await d.locator('#reg-detail table.endpoints tbody tr').count()) > 0, 'registry detail endpoints');
  await d.locator('#reg-charts svg .row').nth(1).click(); await d.waitForTimeout(150);
  expect((await d.locator('#reg-charts svg .row.sel').count()) >= 1, 'chart row selection');
  await d.locator('#reg-charts svg .row').nth(0).hover(); await d.waitForTimeout(100);
  expect(!(await d.locator('#tooltip').isHidden()), 'tooltip shows on hover');
  await d.screenshot({ path: path.join(shots, 'registry-desktop.png'), fullPage: true });
  // methods
  await d.goto(base + 'index.html#methods', { waitUntil: 'load' }); await d.waitForTimeout(400);
  expect((await d.locator('#excluded tr').count()) > 0, 'excluded table populated');
  expect((await d.locator('#product-codes tr').count()) > 0, 'product codes populated');
  await d.screenshot({ path: path.join(shots, 'methods-desktop.png'), fullPage: false });
  // horizontal overflow check
  const over = await d.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(!over, 'no horizontal page scroll (desktop)');

  // ---- mobile
  const m = await page({ width: 390, height: 844 });
  await m.goto(base + 'index.html#products', { waitUntil: 'load' }); await m.waitForTimeout(600);
  expect((await m.locator('#cards .card').count()) === nCards, 'mobile cards');
  expect(await m.locator('#rail').isHidden(), 'rail hidden on mobile by default');
  await m.locator('#rail-toggle').click(); await m.waitForTimeout(100);
  expect(!(await m.locator('#rail').isHidden()), 'rail opens on mobile');
  await m.locator('#rail-toggle').click();
  const overM = await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(!overM, 'no horizontal page scroll (mobile)');
  await m.screenshot({ path: path.join(shots, 'products-mobile.png'), fullPage: false });
  await m.locator('#cards .card').first().click(); await m.waitForTimeout(200);
  await m.screenshot({ path: path.join(shots, 'product-detail-mobile.png'), fullPage: false });
  await m.keyboard.press('Escape');
  await m.goto(base + 'index.html#registry', { waitUntil: 'load' }); await m.waitForTimeout(500);
  const overR = await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(!overR, 'no horizontal page scroll (mobile registry)');
  await m.screenshot({ path: path.join(shots, 'registry-mobile.png'), fullPage: false });

  // ---- single-file bundle, wrapped the way the artifact host wraps it
  const bundlePath = path.join(root, 'dist', 'ai-echo-central.html');
  if (fs.existsSync(bundlePath)) {
    const inner = fs.readFileSync(bundlePath, 'utf8')
      .replace(/<!DOCTYPE html>\s*/i, () => '').replace(/<\/?html[^>]*>\s*/gi, () => '')
      .replace(/<\/?head>\s*/gi, () => '').replace(/<\/?body>\s*/gi, () => '');
    const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>\n${inner}\n</body></html>`;
    fs.writeFileSync(path.join(root, 'dist', '.bundle-check.html'), wrapped);
    const bp = await page({ width: 1280, height: 900 });
    const bundleErrors = [];
    bp.on('pageerror', (e) => bundleErrors.push(e.message));
    await bp.goto(base + 'dist/.bundle-check.html', { waitUntil: 'load' }); await bp.waitForTimeout(800);
    expect(bundleErrors.length === 0, `bundle runs without script errors (${bundleErrors[0] || ''})`);
    expect((await bp.locator('#cards .card').count()) === nCards, 'bundle renders every product card');
    await bp.fill('#search', 'echogo'); await bp.waitForTimeout(300);
    const nSearch = await bp.locator('#cards .card').count();
    expect(nSearch > 0 && nSearch < nCards, 'bundle search narrows the list');
    await bp.fill('#search', ''); await bp.waitForTimeout(300);
    await bp.locator('.view-toggle button[data-view=table]').click(); await bp.waitForTimeout(200);
    expect((await bp.locator('#table tbody tr').count()) === nCards, 'bundle table view works');
    await bp.locator('.tabs a[data-tab=registry]').click(); await bp.waitForTimeout(500);
    expect(!(await bp.locator('#registry').isHidden()), 'bundle tab switching works');
    fs.unlinkSync(path.join(root, 'dist', '.bundle-check.html'));
  } else {
    errors.push('dist/ai-echo-central.html missing; run node scripts/bundle-single.mjs');
  }

  await browser.close(); server.close();
  if (errors.length) { console.error('VALIDATION FAILED'); for (const e of errors) console.error(' -', e); process.exit(1); }
  console.log(`VALIDATION OK: ${nCards} products, ${nRows} registry rows; screenshots in docs/screenshots`);
})().catch((e) => { console.error('validate crashed:', e); process.exit(2); });
