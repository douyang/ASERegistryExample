#!/usr/bin/env node
/* Renders each view of the site and writes small JPEG thumbnails.
   Output: data/thumbs.js (data URIs, so the page works identically when served, opened as a file, or
   inlined into the single-file bundle where external image URLs are blocked) and docs/thumbs/*.jpg.
   Run: node scripts/make-thumbs.cjs   (needs PLAYWRIGHT_MODULE or a local playwright) */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const THUMB_W = 560;      // rendered width of the stored image
const QUALITY = 0.72;
const SITE = 'https://douyang.github.io/ASERegistryExample/';

// Each thumbnail names the live hash route it shows, so the caption can link straight to it.
const VIEWS = [
  { key: 'products', hash: '#products', title: 'AI product catalog',
    caption: 'Every FDA-cleared AI echocardiography product, filterable by function, imaging mode, pathway and evidence.' },
  { key: 'product-detail', hash: '#products', title: 'AI product detail',
    caption: 'Clearance history, performance quoted from the FDA summary, training and validation data, and linked publications.',
    // Returns the hash of the product it actually opened, so the figure always links to the product in
    // the picture even after the catalog is rebuilt and the first card changes.
    after: async (p) => {
      const id = await p.locator('#cards .card [data-open]').first().getAttribute('data-open');
      await p.locator('#cards .card').first().click();
      await p.waitForTimeout(400);
      return id ? `#product/${id}` : null;
    } },
  { key: 'registry', hash: '#registry', title: 'AI benchmarking',
    caption: 'Simulated scoring of cleared products against the registry’s adult TTE module.' },
  { key: 'quality', hash: '#quality', title: 'Site quality: metric by site',
    caption: 'Nine live registry quality metrics for every enrolled site, coloured by distance from benchmark.',
    after: async (p) => { await p.evaluate(() => { const el = document.querySelector('#qc-grid'); if (el) el.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(250); } },
  { key: 'quality-scorecard', hash: '#quality', title: 'Site scorecard',
    caption: 'One site against the registry: profile, image-quality mix, and every metric with its rank.',
    after: async (p) => { await p.evaluate(() => { const el = document.querySelector('#qc-scorecard'); if (el) el.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(250); } },
  { key: 'methods', hash: '#methods', title: 'Methods',
    caption: 'Inclusion and exclusion rules, sources, verification levels, and how the quality metrics are defined.' },
];

(async () => {
  const srv = http.createServer((q, r) => {
    const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
    try {
      const b = fs.readFileSync(p);
      r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html' });
      r.end(b);
    } catch (e) { r.writeHead(404); r.end('x'); }
  });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}/`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  // A second page does the downscale: Chromium's canvas resampling beats anything hand-rolled here,
  // and it keeps the whole pipeline dependency-free.
  const shrink = await browser.newPage();
  await shrink.goto('about:blank');

  const out = {};
  const thumbDir = path.join(root, 'docs', 'thumbs');
  fs.mkdirSync(thumbDir, { recursive: true });

  for (const v of VIEWS) {
    await page.goto(base + 'index.html' + v.hash, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    let hash = v.hash;
    if (v.after) { const h = await v.after(page); if (h) hash = h; }
    const png = await page.screenshot({ type: 'png' });
    const dataUrl = await shrink.evaluate(async ({ b64, w, q }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
      const scale = w / img.width;
      const c = document.createElement('canvas');
      c.width = w; c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    }, { b64: png.toString('base64'), w: THUMB_W, q: QUALITY });

    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(thumbDir, `${v.key}.jpg`), bytes);
    out[v.key] = { title: v.title, caption: v.caption, hash, href: SITE + hash, src: dataUrl };
    console.log(`${v.key.padEnd(18)} ${(bytes.length / 1024).toFixed(0)} KB`);
  }

  await browser.close();
  srv.close();

  const total = Object.values(out).reduce((n, t) => n + t.src.length, 0);
  fs.writeFileSync(path.join(root, 'data', 'thumbs.js'),
    `// Generated by scripts/make-thumbs.cjs — do not edit by hand.\n// Screenshots of this site's own views, stored as data URIs so they render when served, opened as a\n// file, or inlined into the single-file bundle. Each carries the live hash route it shows.\nwindow.AIECHO_THUMBS = ${JSON.stringify({ site: SITE, width: THUMB_W, views: out }, null, 1)};\n`);
  console.log(`wrote data/thumbs.js (${(total / 1024).toFixed(0)} KB of base64) and docs/thumbs/*.jpg`);
})();
