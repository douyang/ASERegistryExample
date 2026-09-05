#!/usr/bin/env node
// PLACEHOLDER DATA GENERATOR. Produces data/registry.js: a deterministic, seeded, synthetic
// "evaluation on the ASE ImageGuideEcho Registry" for every product family in data/products.js.
// Nothing here is a measurement. No product has been evaluated on the registry by this project.
// Run: node scripts/gen-registry.mjs   (re-running with the same seed reproduces the same numbers)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = Number(process.env.REGISTRY_SEED || 20260905);
const GENERATED = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data', 'products.js'), 'utf8'), ctx);
const families = ctx.window.AIECHO_PRODUCTS.families;

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const U = (lo, hi) => lo + (hi - lo) * rnd();
const R = (x, d = 1) => Number(x.toFixed(d));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Real registry facts (for context on the page). Sources: ASE ImageGuideEcho pages and JASE 2025 (PMC11779749).
const REGISTRY = {
  name: 'ASE ImageGuideEcho Registry',
  url: 'https://www.asecho.org/practice-clinical-resources/imageguideecho-registry/',
  facts: [
    { label: 'Enrolled sites (JASE 2025)', value: '8', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11779749/' },
    { label: 'TTEs in registry (JASE 2025)', value: '319,051', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11779749/' },
    { label: 'Adult TTE data elements', value: '193', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11779749/' },
    { label: 'Quality metrics live', value: '9', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11779749/' },
  ],
  quality_metrics: [
    'Report turnaround time', 'Study completeness', 'Report completeness', 'Quantitative report completeness',
    'Mean and peak gradients for valvular disease', 'Valve areas for stenotic lesions', 'Regurgitation severity reporting',
    'Qualitative report completeness', 'Strain utilization for chemotherapy, heart failure, or cardiomyopathy',
  ],
  data_domains: ['Demographics and study characteristics', 'Image quality and technical difficulty', 'LV function (EF, dimensions)', 'RV function', 'Valvular assessment (stenosis/regurgitation severity, valve areas)', 'Pulmonary artery systolic pressure', 'Pericardial disease', 'Regional wall motion', 'Diastolic function and filling pressures', 'Strain utilization'],
  phase_note: 'Phase 1 collects site profiles, demographics and adult transthoracic echocardiography (TTE). Stress echo, TEE, pediatric and congenital modules are future phases.',
};

const SITES = ['Site A', 'Site B', 'Site C', 'Site D', 'Site E', 'Site F', 'Site G', 'Site H'];
const VENDORS = ['GE HealthCare', 'Philips', 'Siemens Healthineers', 'Canon Medical'];
const MONTHS = []; for (let y = 2025, m = 1; !(y === 2026 && m > 6); m++) { if (m > 12) { m = 1; y++; } MONTHS.push(`${y}-${String(m).padStart(2, '0')}`); }

function evalType(f) {
  const tags = (f.tags || []).join(' ').toLowerCase();
  let category = f.category;
  if ((!category || category === 'other') && f.research_pending) {
    // Provisional build only (research not yet merged): infer from the product name.
    const n = (f.product_name || '').toLowerCase();
    category = /guidance|heartfocus/.test(n) ? 'acquisition-guidance' : /amyloid/.test(n) ? 'amyloid-indicator' : /heart failure/.test(n) ? 'hf-status-indicator'
      : /aortic|aisap|echosolv/.test(n) ? 'disease-detection' : /fetal|fetoly/.test(n) ? 'fetal-echo' : /iqs/.test(n) ? 'image-quality' : /pvad/.test(n) ? 'interventional-guidance'
      : /ejection|lvef|auto ef|autoef/.test(n) ? 'lv-function-quantification' : /us2|ligence|echoconfidence|sonix|echomeasure|lvivo|echopac|workspace|tomtec|echogo core|echogo pro|exo|kosmos|cardiovision|libby|vms/.test(n) ? 'comprehensive-measurement' : 'other';
  }
  switch (category) {
    case 'lv-function-quantification': return 'lvef';
    case 'comprehensive-measurement': return 'comprehensive';
    case 'system-embedded': return /strain|gls/.test(tags) && !/ef|ejection/.test(tags) ? 'strain' : 'lvef';
    case 'disease-detection': return /amyloid/.test(tags) ? 'amyloid' : /hfpef|heart failure/.test(tags) ? 'hfpef' : 'detection';
    case 'hf-status-indicator': return 'hfpef';
    case 'amyloid-indicator': return 'amyloid';
    case 'acquisition-guidance': return 'acquisition';
    case 'image-quality': return 'quality';
    case 'fetal-echo': return 'not-evaluable-fetal';
    case 'interventional-guidance': return 'not-evaluable-procedural';
    default: return 'not-evaluable-other';
  }
}

function ci(v, half, d = 1) { return { low: R(v - half, d), high: R(v + half, d) }; }
function endpointsFor(type, n) {
  const half = Math.max(0.15, 3.2 / Math.sqrt(n / 100));
  const e = [];
  const feas = R(U(72, 96)); e.push({ id: 'feasibility', label: 'Feasibility (studies with an AI output)', unit: '%', value: feas, ci: ci(feas, half * 0.6), direction: 'higher', reference: 'All eligible registry TTEs' });
  if (type === 'lvef' || type === 'comprehensive') {
    const mae = R(U(3.6, 7.4)); e.push({ id: 'lvef_mae', label: 'LVEF mean absolute error', unit: '% EF', value: mae, ci: ci(mae, half * 0.12, 2), direction: 'lower', reference: 'Registry-reported LVEF (finalized clinical report)', primary: true });
    const bias = R(U(-2.4, 2.4)); e.push({ id: 'lvef_bias', label: 'LVEF bias (AI minus reported)', unit: '% EF', value: bias, ci: ci(bias, half * 0.15, 2), direction: 'zero', reference: 'Registry-reported LVEF' });
    const loa = R(U(8.5, 15.5)); e.push({ id: 'lvef_loa', label: '95% limits of agreement (half-width)', unit: '% EF', value: loa, ci: ci(loa, half * 0.2), direction: 'lower', reference: 'Bland-Altman vs reported LVEF' });
    const icc = R(U(0.78, 0.94), 3); e.push({ id: 'lvef_icc', label: 'ICC, AI vs reported LVEF', unit: '', value: icc, ci: ci(icc, half * 0.01, 3), direction: 'higher', reference: 'Two-way mixed, absolute agreement' });
    const sens = R(U(82, 96)); const spec = R(U(85, 97));
    e.push({ id: 'ef40_sens', label: 'LVEF ≤ 40%: sensitivity', unit: '%', value: sens, ci: ci(sens, half), direction: 'higher', reference: 'Reported LVEF ≤ 40%' });
    e.push({ id: 'ef40_spec', label: 'LVEF ≤ 40%: specificity', unit: '%', value: spec, ci: ci(spec, half * 0.7), direction: 'higher', reference: 'Reported LVEF > 40%' });
  }
  if (type === 'comprehensive') {
    const edv = R(U(12, 28)); e.push({ id: 'edv_mae', label: 'LV end-diastolic volume MAE', unit: 'mL', value: edv, ci: ci(edv, half * 0.8), direction: 'lower', reference: 'Registry-reported LVEDV' });
    const gls = R(U(-1.6, 1.6), 2); e.push({ id: 'gls_bias', label: 'GLS bias (AI minus reported)', unit: '%', value: gls, ci: ci(gls, half * 0.1, 2), direction: 'zero', reference: 'Registry-reported GLS where present' });
    const ee = R(U(0.72, 0.9), 3); e.push({ id: 'ee_icc', label: 'E/e′ ICC', unit: '', value: ee, ci: ci(ee, half * 0.012, 3), direction: 'higher', reference: 'Registry-reported E/e′' });
    const mg = R(U(0.8, 0.93), 3); e.push({ id: 'avmg_icc', label: 'AV mean gradient ICC', unit: '', value: mg, ci: ci(mg, half * 0.012, 3), direction: 'higher', reference: 'Registry metric: mean and peak gradients for valvular disease' });
  }
  if (type === 'strain') {
    const gls = R(U(-1.6, 1.6), 2); e.push({ id: 'gls_bias', label: 'GLS bias (AI minus reported)', unit: '%', value: gls, ci: ci(gls, half * 0.1, 2), direction: 'zero', reference: 'Registry-reported GLS where present', primary: true });
    const icc = R(U(0.74, 0.92), 3); e.push({ id: 'gls_icc', label: 'GLS ICC', unit: '', value: icc, ci: ci(icc, half * 0.012, 3), direction: 'higher', reference: 'Registry-reported GLS' });
    const util = R(U(28, 64)); e.push({ id: 'strain_util', label: 'Strain utilization in eligible studies', unit: '%', value: util, ci: ci(util, half), direction: 'higher', reference: 'Registry metric: strain utilization for chemotherapy, HF, cardiomyopathy' });
  }
  if (type === 'detection' || type === 'hfpef' || type === 'amyloid') {
    const refs = { detection: 'Registry-reported severe aortic stenosis (valve area, gradients)', hfpef: 'Registry diastolic function grade ≥ 2 with linked HF diagnosis', amyloid: 'Registry-linked confirmed cardiac amyloidosis diagnosis' };
    const auc = R(U(0.82, 0.95), 3); e.push({ id: 'auc', label: 'AUC', unit: '', value: auc, ci: ci(auc, half * 0.012, 3), direction: 'higher', reference: refs[type], primary: true });
    const sens = R(U(78, 94)); e.push({ id: 'sens', label: 'Sensitivity', unit: '%', value: sens, ci: ci(sens, half * 1.2), direction: 'higher', reference: refs[type] });
    const spec = R(U(80, 95)); e.push({ id: 'spec', label: 'Specificity', unit: '%', value: spec, ci: ci(spec, half * 0.8), direction: 'higher', reference: refs[type] });
    const prev = { detection: 3.1, hfpef: 11.4, amyloid: 1.2 }[type]; const ppv = R(100 * (sens / 100 * prev / 100) / (sens / 100 * prev / 100 + (1 - spec / 100) * (1 - prev / 100)));
    e.push({ id: 'ppv', label: `PPV at registry prevalence (${prev}%)`, unit: '%', value: ppv, ci: ci(ppv, half * 1.5), direction: 'higher', reference: 'Derived from sensitivity, specificity and cohort prevalence' });
  }
  if (type === 'acquisition') {
    const dq = R(U(74, 95)); e.push({ id: 'diag_quality', label: 'Diagnostic-quality acquisitions', unit: '%', value: dq, ci: ci(dq, half), direction: 'higher', reference: 'Reading physician image-quality grade', primary: true });
    const comp = R(U(78, 97)); e.push({ id: 'completeness', label: 'Study completeness', unit: '%', value: comp, ci: ci(comp, half * 0.8), direction: 'higher', reference: 'Registry metric: study completeness' });
    const t = R(U(6, 18)); e.push({ id: 'protocol_time', label: 'Median time to complete protocol', unit: 'min', value: t, ci: ci(t, half * 0.4), direction: 'lower', reference: 'Acquisition timestamps' });
    const tat = R(U(4, 30)); e.push({ id: 'tat', label: 'Report turnaround time (median)', unit: 'h', value: tat, ci: ci(tat, half * 0.9), direction: 'lower', reference: 'Registry metric: report turnaround time' });
  }
  if (type === 'quality') {
    const k = R(U(0.55, 0.82), 2); e.push({ id: 'kappa', label: 'Agreement with sonographer quality grade (κ)', unit: '', value: k, ci: ci(k, half * 0.02, 2), direction: 'higher', reference: 'Registry image-quality / technical-difficulty field', primary: true });
    const fl = R(U(4, 15)); e.push({ id: 'flagged', label: 'Studies flagged non-diagnostic', unit: '%', value: fl, ci: ci(fl, half * 0.5), direction: 'neutral', reference: 'AI flag rate' });
  }
  return e;
}

function subgroupsFor(type, primary) {
  if (!primary) return [];
  const dims = [
    ['Sex', ['Female', 'Male']], ['Age', ['< 50', '50–69', '≥ 70']], ['BMI', ['< 30', '≥ 30']],
    ['Image quality', ['Good', 'Adequate', 'Poor']], ['Vendor', VENDORS],
  ];
  const rows = [];
  for (const [dim, levels] of dims) {
    for (const lv of levels) {
      let delta = U(-0.12, 0.12);
      if (dim === 'Image quality' && lv === 'Poor') delta += primary.direction === 'lower' ? 0.28 : -0.14;
      if (dim === 'BMI' && lv === '≥ 30') delta += primary.direction === 'lower' ? 0.1 : -0.05;
      const v = primary.direction === 'zero' ? primary.value + delta * 4 : primary.value * (1 + delta);
      rows.push({ dimension: dim, level: lv, value: R(v, primary.unit === '' ? 3 : 1), n: Math.round(U(180, 4200) / 10) * 10 });
    }
  }
  return rows;
}

const evaluations = {};
for (const f of families) {
  const type = evalType(f);
  const base = { family_id: f.id, product_name: f.product_name, company: f.company, evaluation_type: type };
  if (type.startsWith('not-evaluable')) {
    const why = { 'not-evaluable-fetal': 'Fetal echocardiography is outside the registry’s adult TTE module (phase 1).', 'not-evaluable-procedural': 'Procedural / TEE guidance is not captured by the registry’s TTE data elements.', 'not-evaluable-other': 'No registry data element maps to this product’s output.' }[type];
    evaluations[f.id] = { ...base, evaluable: false, reason: why };
    continue;
  }
  const n_studies = Math.round(U(1800, 24000) / 10) * 10;
  const n_sites = Math.min(8, Math.max(3, Math.round(U(3, 8))));
  const sites = shuffle(SITES).slice(0, n_sites);
  const vendors = shuffle(VENDORS).slice(0, Math.max(2, Math.round(U(2, 4))));
  const endpoints = endpointsFor(type, n_studies);
  const primary = endpoints.find((e) => e.primary) || null;
  const monthly = MONTHS.map((m, i) => {
    const drift = Math.sin(i / 3.1) * 0.03;
    return { month: m, n: Math.round(n_studies / MONTHS.length * U(0.7, 1.3)), primary: primary ? R(primary.value * (1 + drift + U(-0.05, 0.05)), primary.unit === '' ? 3 : 1) : null, feasibility: R(endpoints[0].value * (1 + U(-0.03, 0.03))) };
  });
  evaluations[f.id] = { ...base, evaluable: true, cohort: { n_studies, n_sites, sites, vendors, period: `${MONTHS[0]} to ${MONTHS[MONTHS.length - 1]}`, module: 'Adult TTE (phase 1)' }, endpoints, primary_endpoint_id: primary ? primary.id : null, subgroups: subgroupsFor(type, primary), monthly };
}

const out = {
  placeholder: true,
  notice: 'PLACEHOLDER DATA. Every number in this file is synthetic, generated by scripts/gen-registry.mjs from a fixed seed. No product has been evaluated on the ImageGuideEcho Registry by this project. Registry facts listed under "registry" are real and sourced.',
  seed: SEED, generated: GENERATED, registry: REGISTRY, evaluations,
};
fs.writeFileSync(path.join(root, 'data', 'registry.js'), `// Generated by scripts/gen-registry.mjs — PLACEHOLDER, SYNTHETIC DATA. Do not edit by hand.\nwindow.AIECHO_REGISTRY = ${JSON.stringify(out, null, 1)};\n`);
const ev = Object.values(evaluations);
console.log(`registry placeholder: ${ev.length} families, ${ev.filter((e) => e.evaluable).length} evaluable, seed ${SEED}`);
