#!/usr/bin/env node
// Builds data/products.js from data/research/*.json (agent research, verified copies preferred),
// data/research/openfda_records.json (authoritative dates/codes) and data/research/families.json.
// No network. Run: node scripts/build-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rdir = path.join(root, 'data', 'research');
const read = (f) => JSON.parse(fs.readFileSync(path.join(rdir, f), 'utf8'));
const openfda = read('openfda_records.json');
const seed = read('families.json');
const aiListCsv = fs.readFileSync(path.join(rdir, 'fda_ai_enabled_devices_list.csv'), 'utf8').replace(/^\uFEFF/, '');
// Declared interests. The registry chair maintaining this catalog co-founded InVision Medical
// Technology and is the openFDA contact on both of its clearances, so those records carry a disclosure
// on the card, in the detail panel and in the table. A catalog that rates products cannot stay silent
// about an interest in two of them.
const DECLARED_INTERESTS = {
  'invision-lvef': 'The maintainer of this catalog, ASE ImageGuideEcho Registry chair David Ouyang, co-founded InVision Medical Technology and is the openFDA contact on this clearance.',
  'invision-amyloid': 'The maintainer of this catalog, ASE ImageGuideEcho Registry chair David Ouyang, co-founded InVision Medical Technology and is the openFDA contact on this clearance.',
};

const ON_AI_LIST = new Set(aiListCsv.split(/\r?\n/).slice(1).map((l) => (l.split(',')[1] || '').trim().toUpperCase()).filter(Boolean));
const warnings = [];
const caveats = [];
// Canonical imaging modes. Derived only from the researched modality_scope and tags, never inferred
// from a system's full indications list (those name every probe the machine supports, not the AI's scope).
const MODE_RULES = [
  ['TTE', /\bTTE\b|transthoracic|apical|PLAX|PSAX|parasternal|A4C|4-chamber|4CH/i],
  ['TEE', /\bTEE\b|transesophageal|transoesophageal/i],
  ['POCUS', /POCUS|hand-?held|point[- ]of[- ]care/i],
  ['ICE', /\bICE\b|intracardiac/i],
  ['Fetal echo', /fetal|obstetric|trimester/i],
  ['Stress echo', /stress/i],
];
const modesOf = (fam) => {
  const hay = [...(fam.modality_scope || []), ...(fam.tags || [])].filter((x) => typeof x === 'string');
  return MODE_RULES.filter(([, re]) => hay.some((h) => re.test(h))).map(([name]) => name);
};
const fdaUrl = (k) => {
  const yy = k.startsWith('K') ? k.slice(1, 3) : k.slice(3, 5);
  return `https://www.accessdata.fda.gov/cdrh_docs/pdf${yy}/${k}.pdf`;
};

// ---- 1. Load research outputs. Prefer <batch>.verified.json over <batch>.json.
// addenda-* files load last so their families override earlier batches (used to extend families found by the completeness pass)
const files = fs.readdirSync(rdir).filter((f) => f.endsWith('.json') && !['openfda_records.json', 'families.json'].includes(f)).sort((a, b) => Number(a.startsWith('addenda')) - Number(b.startsWith('addenda')) || a.localeCompare(b));
const batches = new Map();
for (const f of files) {
  const base = f.replace(/\.verified\.json$/, '').replace(/\.json$/, '');
  if (f.startsWith('triage-') || f.startsWith('critic-') || f.startsWith('_')) continue; // triage handled separately; critic/_scratch files are not catalog input
  const cur = batches.get(base);
  const isVerified = f.endsWith('.verified.json');
  if (!cur || (isVerified && !cur.verified)) batches.set(base, { file: f, verified: isVerified });
}
const researched = new Map();
for (const [, b] of batches) {
  let doc;
  try { doc = read(b.file); } catch (e) { warnings.push(`unreadable ${b.file}: ${e.message}`); continue; }
  const fams = Array.isArray(doc) ? doc : doc.families || [];
  for (const fam of fams) {
    if (!fam || !fam.id) { warnings.push(`family without id in ${b.file}`); continue; }
    fam._source_file = b.file;
    fam._verified = b.verified;
    if (researched.has(fam.id) && !b.file.startsWith('addenda')) warnings.push(`duplicate family id ${fam.id} (${b.file} overrides ${researched.get(fam.id)._source_file})`);
    researched.set(fam.id, fam);
  }
}

// ---- 2. Triage results (vendor system clearances): which K's carry cardiac AI, and exclusions.
const triage = [];
for (const f of files.filter((x) => x.startsWith('triage-'))) {
  try { const t = read(f); for (const r of t.records || []) triage.push({ group: t.group_id, ...r }); } catch (e) { warnings.push(`unreadable ${f}`); }
}

// ---- 3. Seed families that no research file covered get a minimal, openFDA-only record.
const allSeeds = [...(seed.software || [])];
for (const s of allSeeds) {
  if (!researched.has(s.id)) {
    researched.set(s.id, {
      id: s.id, product_name: s.name, company: s.company, company_website: null, product_url: null,
      category: 'other', tags: [], modality_scope: [], deployment: [], summary: '',
      intended_use_quote: null, indications_for_use_quote: null, embedded_ai_features: [],
      clearances: s.ks.map((k) => ({ k_number: k, decision_date: null, pathway: null, product_code: null, predicates: [], changes_summary: null, notable_flags: [], fda_summary_url: null })),
      performance_claims: [], training_data: { disclosed: false, n_studies: null, n_patients: null, n_sites: null, description: null, source: null, verification: 'unverified' },
      validation_data: { n_studies: null, n_patients: null, n_sites: null, description: null, independent_of_training: null, source: null, verification: 'unverified' },
      prior_validations: [], papers: [], clinical_trials: [], open_questions: ['Research not yet run for this family; only openFDA fields shown.'], sources: [],
      _source_file: null, _verified: false, _research_pending: true,
    });
  }
}

// ---- 3b. Rewrite extraction-time local file references to the public FDA document URLs.
const LOCAL_RE = /\/[^\s"')]*\/probe\/(?:txt|pdf)\/(K\d{6}|DEN\d{6})(_review)?\.(?:txt|pdf)/g;
const publicUrl = (k, review) => (review ? `https://www.accessdata.fda.gov/cdrh_docs/reviews/${k}.pdf` : fdaUrl(k));
const LOCAL_ANY = /\/tmp\/[^\s"')]*scratchpad\/[^\s"')]*/g;
const rewrite = (v) => {
  if (typeof v !== 'string') return v;
  return v.replace(LOCAL_RE, (m, k, rev) => publicUrl(k, !!rev)).replace(LOCAL_ANY, (m) => {
    if (/openfda_records\.json/.test(m)) return 'data/research/openfda_records.json (openFDA)';
    const km = m.match(/(K\d{6}|DEN\d{6})(?:_review)?(?:_p(\d+))?/);
    if (km) return publicUrl(km[1], /_review/.test(m)) + (km[2] ? ` (p${km[2]})` : '');
    return m.split('/').pop();
  // Expand a bare KNNNNNN.pdf/.txt reference to the public FDA URL, but leave an already-complete
  // accessdata URL alone: matching its filename again would splice the prefix in twice.
  }).replace(/https:\/\/www\.accessdata\.fda\.gov\/cdrh_docs\/(?:pdf\d{2}|reviews)\/[A-Za-z0-9]+\.pdf|\b(K\d{6}|DEN\d{6})(?:_review)?(?:_p(\d+))?\.(?:txt|pdf|png)\b/g,
    (m, k, pg) => (k ? publicUrl(k, /_review/.test(m)) + (pg ? ` (p${pg})` : '') : m))
    .replace(/\bresearch\/(?:ocr|us2|verify)\/[^\s"')]*/g, (m) => { const km = m.match(/(K\d{6}|DEN\d{6})(?:_p(\d+))?/); return km ? publicUrl(km[1], false) + (km[2] ? ` (p${km[2]})` : '') : ''; });
};
function deepRewrite(x) {
  if (Array.isArray(x)) return x.map(deepRewrite);
  if (x && typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) o[k] = deepRewrite(v); return o; }
  return rewrite(x);
}
for (const [id, fam] of researched) researched.set(id, deepRewrite(fam));

// ---- 4. Normalize each family against openFDA (authoritative for date, product code, applicant, device name).
const pathwayOf = (k, c) => {
  if (k.startsWith('DEN')) return 'De Novo';
  const flags = (c.notable_flags || []).join(' ').toLowerCase();
  if (/pccp|predetermined change/.test(flags) || /pccp/i.test(c.pathway || '')) return '510(k) with PCCP';
  return '510(k)';
};
const families = [];
for (const fam of researched.values()) {
  const cl = [];
  for (const c of fam.clearances || []) {
    const k = String(c.k_number || '').trim().toUpperCase();
    const rec = openfda[k];
    if (!rec) { warnings.push(`${fam.id}: ${k} not in openFDA records`); continue; }
    if (c.decision_date && c.decision_date !== rec.decision_date) warnings.push(`${fam.id}: ${k} date ${c.decision_date} -> openFDA ${rec.decision_date}`);
    if (c.product_code && c.product_code !== rec.product_code) warnings.push(`${fam.id}: ${k} product code ${c.product_code} -> openFDA ${rec.product_code}`);
    cl.push({
      k_number: k,
      decision_date: rec.decision_date,
      pathway: pathwayOf(k, c),
      product_code: rec.product_code,
      device_name_fda: rec.device_name,
      applicant_fda: rec.applicant,
      predicates: c.predicates || [],
      changes_summary: c.changes_summary || null,
      notable_flags: c.notable_flags || [],
      fda_summary_url: c.fda_summary_url || fdaUrl(k),
      fda_database_url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cf${k.startsWith('DEN') ? 'pmn/denovo' : 'pmn/pmn'}.cfm?ID=${k}`,
      on_fda_ai_list: ON_AI_LIST.has(k),
    });
  }
  cl.sort((a, b) => a.decision_date.localeCompare(b.decision_date));
  if (!cl.length) { warnings.push(`${fam.id}: no valid clearances, dropped`); continue; }
  const papers = (fam.papers || []).filter((p) => p && p.title);
  const VLEVELS = new Set(['fda_summary', 'fda_database', 'peer_reviewed', 'company', 'news', 'unverified', 'clinicaltrials_gov']);
  const normV = (v) => { const t = String(v || 'unverified').split(/[;,]/)[0].trim().toLowerCase().replace(/\s+/g, '_'); if (t === 'openfda' || t === 'fda_database_openfda') return 'fda_database'; if (t === 'clinicaltrials.gov' || t === 'clinicaltrials_gov') return 'clinicaltrials_gov'; return VLEVELS.has(t) ? t : 'unverified'; };
  for (const c of fam.performance_claims || []) { const nv = normV(c.verification); if (nv !== c.verification) { if (!VLEVELS.has(String(c.verification || '').split(/[;,]/)[0].trim())) warnings.push(`${fam.id}: claim verification '${c.verification}' -> ${nv}`); c.verification = nv; } }
  for (const x of [...(fam.sources || []), ...(fam.prior_validations || [])]) { const nv = normV(x.verification); if (nv !== x.verification) x.verification = nv; }
  for (const d of [fam.training_data, fam.validation_data]) if (d) { const nv = normV(d.verification); if (nv !== d.verification) d.verification = nv; }
  for (const c of fam.performance_claims || []) {
    const cleaned = String(c.value || '').replace(/9[05](?:\.\d+)?\s*%?\s*CI/gi, ' ').replace(/97\.5\s*%?/g, ' ').replace(/\bp\s*[<>=≤≥]\s*0?\.\d+/gi, ' ');
    const nums = cleaned.match(/\d+(?:\.\d+)?/g) || []; const q = String(c.quote || '').replace(/\s+/g, ' ');
    const missing = nums.filter((n) => !q.includes(n) && !q.replace(/,/g, '').includes(n));
    if (missing.length && c.verification === 'fda_summary') caveats.push(`${fam.id}: ${c.k_number} value numbers ${missing.join(', ')} are not in the displayed quote (${c.endpoint}); check the cited page before relying on them`);
  }
  for (const x of fam.sources || []) if (/\.(txt|png)\b|\bocr\//.test(x.url_or_file || '')) warnings.push(`${fam.id}: residual extraction reference in sources: ${x.url_or_file}`);
  const nFda = (fam.performance_claims || []).filter((c) => c.verification === 'fda_summary').length;
  const modes = modesOf(fam);
  if (!modes.length) warnings.push(`${fam.id}: no imaging mode derived from modality_scope/tags`);
  families.push({
    ...fam,
    clearances: cl,
    papers,
    first_cleared: cl[0].decision_date,
    latest_cleared: cl[cl.length - 1].decision_date,
    n_clearances: cl.length,
    pathways: [...new Set(cl.map((c) => c.pathway))],
    product_codes: [...new Set(cl.map((c) => c.product_code))],
    n_performance_claims: (fam.performance_claims || []).length,
    modes,
    n_fda_claims: nFda,
    n_other_claims: (fam.performance_claims || []).length - nFda,
    n_papers_resolved: papers.filter((p) => /^(doi|pmid)_resolved/.test(String(p.verification || '').trim())).length,
    n_papers: papers.length,
    research_verified: !!fam._verified,
    declared_interest: DECLARED_INTERESTS[fam.id] || null,
    research_pending: !!fam._research_pending,
  });
}
families.sort((a, b) => b.latest_cleared.localeCompare(a.latest_cleared));

// ---- 5. Excluded / adjacent devices for the Methods tab.
const excluded = [];
for (const k of seed.excluded_ecg_based || []) {
  const r = openfda[k]; if (!r) continue;
  excluded.push({ k_number: k, device_name: r.device_name, company: r.applicant, decision_date: r.decision_date, product_code: r.product_code, reason: 'ECG-based estimation of an echo phenotype; input is ECG, not ultrasound', group: 'ecg-based' });
}
for (const x of seed.excluded_other || []) {
  const r = openfda[x.k]; if (!r) { warnings.push(`excluded_other ${x.k} not in openFDA records`); continue; }
  excluded.push({ k_number: x.k, device_name: r.device_name, company: r.applicant, decision_date: r.decision_date, product_code: r.product_code, reason: x.reason, group: x.group });
}
for (const t of triage) {
  if (t.is_cardiac_ultrasound_ai) continue;
  const r = openfda[t.k_number]; if (!r) continue;
  excluded.push({ k_number: t.k_number, device_name: r.device_name, company: r.applicant, decision_date: r.decision_date, product_code: r.product_code, reason: t.exclusion_reason || 'No cardiac ultrasound AI feature identified in the FDA summary', group: 'system-no-cardiac-ai', triage_group: t.group });
}
excluded.sort((a, b) => b.decision_date.localeCompare(a.decision_date));

// ---- 6. Product code dictionary (from openFDA classification, verified 2026-09-05).
const productCodes = {
  QJU: 'Image acquisition and/or optimization guided by artificial intelligence (21 CFR 892.2100)',
  QIH: 'Automated radiological image processing software (21 CFR 892.2050)',
  QVD: 'Radiological machine learning based quantitative imaging software with change control plan (21 CFR 892.2055)',
  QUO: 'Adjunctive heart failure status indicator (21 CFR 870.2200)',
  SDJ: 'Adjunctive cardiac amyloidosis status indicator (21 CFR 870.2200)',
  POK: 'Computer-assisted diagnostic software for lesions suspicious for cancer (21 CFR 892.2060)',
  LLZ: 'System, image processing, radiological (21 CFR 892.2050)',
  IYN: 'System, imaging, pulsed Doppler, ultrasonic (21 CFR 892.1550)',
  IYO: 'System, imaging, pulsed echo, ultrasonic (21 CFR 892.1560)',
  QYE: 'Reduced ejection fraction machine learning-based notification software (21 CFR 870.2380)',
  QXO: 'Cardiovascular machine learning-based notification software (21 CFR 870.2380)',
};

const out = {
  generated: process.env.BUILD_DATE || new Date().toISOString().slice(0, 10),
  sources: {
    fda_ai_list: 'https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices',
    openfda: 'https://open.fda.gov/apis/device/510k/',
    families_seed: 'data/research/families.json',
  },
  product_codes: productCodes,
  families,
  excluded,
  triage_included: triage.filter((t) => t.is_cardiac_ultrasound_ai).map((t) => ({ k: t.k_number, group: t.group, features: (t.ai_features || []).filter((f) => f.cardiac).map((f) => f.name) })),
  build_warnings: warnings,
};
const doubled = JSON.stringify(out).match(/cdrh_docs\/pdf\d{2}\/https/g) || [];
if (doubled.length) throw new Error(`${doubled.length} doubled FDA URLs in output`);
fs.writeFileSync(path.join(root, 'data', 'products.js'), `// Generated by scripts/build-data.mjs — do not edit by hand.\nwindow.AIECHO_PRODUCTS = ${JSON.stringify(out, null, 1)};\n`);
console.log(`caveats: ${caveats.length}`);
console.log(`families: ${families.length} (verified ${families.filter((f) => f.research_verified).length}, pending ${families.filter((f) => f.research_pending).length}); clearances: ${families.reduce((n, f) => n + f.n_clearances, 0)}; excluded: ${excluded.length}; warnings: ${warnings.length}`);
for (const w of warnings) console.log('  warn:', w);
