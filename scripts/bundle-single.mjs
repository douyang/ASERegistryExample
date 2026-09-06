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
// Replacement callbacks, never replacement strings: file contents contain $$, $' and $& sequences,
// which String.replace would otherwise interpret ($$ collapses to $, $' splices in the tail).
const put = (marker, content) => {
  if (!html.includes(marker)) throw new Error(`marker not found: ${marker}`);
  html = html.replace(marker, () => content);
};
put('<link rel="stylesheet" href="assets/style.css">', `<style>\n${read('assets/style.css')}\n</style>`);
for (const src of ['data/products.js', 'data/registry.js', 'assets/app.js']) put(`<script src="${src}"></script>`, inlineScript(src));
for (const src of ['assets/app.js', 'assets/style.css']) {
  const body = read(src);
  const marker = body.slice(0, 40);
  if (!html.includes(marker)) throw new Error(`inlined ${src} does not appear verbatim in the bundle`);
}
if (!html.includes('const $$ = ')) throw new Error('bundle mangled: $$ helper missing');
if (/src="(assets|data)\//.test(html) || /href="assets\//.test(html)) throw new Error('unresolved local reference remains');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'ai-echo-central.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);

// Artifact-ready fragment: the same page without the document skeleton, which the artifact host supplies.
const fragment = html
  .replace(/<!DOCTYPE html>\s*/i, () => '')
  .replace(/<\/?html[^>]*>\s*/gi, () => '')
  .replace(/<\/?head>\s*/gi, () => '')
  .replace(/<\/?body>\s*/gi, () => '')
  .replace(/<meta charset="utf-8">\s*/i, () => '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, () => '');
if (/<!DOCTYPE|<html[\s>]|<\/html>|<head[\s>]|<\/head>|<body[\s>]|<\/body>/i.test(fragment)) throw new Error('fragment still carries document skeleton tags');
if (!fragment.includes('const $$ = ')) throw new Error('fragment mangled: $$ helper missing');
const frag = path.join(root, 'dist', 'ai-echo-central.fragment.html');
fs.writeFileSync(frag, fragment);
console.log(`wrote ${frag} (${(fs.statSync(frag).size / 1024).toFixed(0)} KB)`);
