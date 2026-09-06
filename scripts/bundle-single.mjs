#!/usr/bin/env node
// Bundles index.html + assets + data into one self-contained HTML file (dist/ai-echo-central.html)
// for sharing as a single file or publishing as a preview. Google Fonts links are kept.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let html = read('index.html');
const inlineScript = (src) => `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`;
html = html.replace('<link rel="stylesheet" href="assets/style.css">', `<style>\n${read('assets/style.css')}\n</style>`);
for (const src of ['data/products.js', 'data/registry.js', 'assets/app.js']) html = html.replace(`<script src="${src}"></script>`, inlineScript(src));
if (/src="(assets|data)\//.test(html) || /href="assets\//.test(html)) throw new Error('unresolved local reference remains');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'ai-echo-central.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
