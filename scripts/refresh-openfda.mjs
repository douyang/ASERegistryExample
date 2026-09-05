#!/usr/bin/env node
// Refreshes data/research/openfda_records.json for every known submission and lists NEW candidate
// clearances (AI-specific product codes + cardiac ultrasound keywords) that are not yet in families.json.
// Network: api.fda.gov only. Run: node scripts/refresh-openfda.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rdir = path.join(root, 'data', 'research');
const recPath = path.join(rdir, 'openfda_records.json');
const records = JSON.parse(fs.readFileSync(recPath, 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(rdir, 'families.json'), 'utf8'));
const known = new Set([...Object.keys(records), ...[...(seed.software || []), ...(seed.triage || [])].flatMap((f) => f.ks), ...(seed.excluded_ecg_based || [])]);
const API = 'https://api.fda.gov/device/510k.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function q(search, limit = 100, skip = 0) {
  const url = `${API}?search=${encodeURIComponent(search)}&limit=${limit}&skip=${skip}`;
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (r.status === 404) return []; if (!r.ok) throw new Error(`${r.status}`); return (await r.json()).results || []; }
    catch (e) { await sleep(1500 * (i + 1)); if (i === 2) { console.error('failed', search, e.message); return []; } }
  }
  return [];
}
// 1. refresh known records in batches of 25
const ks = [...known]; let updated = 0;
for (let i = 0; i < ks.length; i += 25) {
  const res = await q(ks.slice(i, i + 25).map((k) => `k_number:"${k}"`).join(' OR '));
  for (const r of res) { if (JSON.stringify(records[r.k_number]) !== JSON.stringify(r)) updated++; records[r.k_number] = r; }
  await sleep(300);
}
fs.writeFileSync(recPath, JSON.stringify(records, null, 1));
console.log(`refreshed ${ks.length} known submissions (${updated} changed)`);
// 2. sweep for new candidates
const latest = Object.values(records).map((r) => r.decision_date).sort().pop();
const codes = ['QJU', 'QIH', 'QVD', 'QUO', 'SDJ', 'POK', 'LLZ', 'IYN', 'IYO'];
const kw = /echo|cardiac|ventric|ejection|strain|heart|aortic|mitral|valv|amyloid|hfpef|lvef|doppler/i;
const found = new Map();
for (const c of codes) {
  for (let skip = 0; skip < 1000; skip += 100) {
    const res = await q(`product_code:${c} AND decision_date:[${latest} TO 2099-12-31]`, 100, skip);
    for (const r of res) if (!known.has(r.k_number) && (['QJU', 'QVD', 'QUO', 'SDJ'].includes(c) || kw.test(r.device_name) || kw.test(r.applicant))) found.set(r.k_number, r);
    if (res.length < 100) break; await sleep(300);
  }
}
if (!found.size) console.log(`no new candidates since ${latest}`);
else { console.log(`NEW candidates since ${latest} (review, then add to families.json):`); for (const r of [...found.values()].sort((a, b) => a.decision_date.localeCompare(b.decision_date))) console.log(`  ${r.k_number} ${r.decision_date} ${r.product_code} | ${r.applicant} | ${r.device_name}`); }
