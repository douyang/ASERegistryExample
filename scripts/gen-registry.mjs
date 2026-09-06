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
// Vendors are anonymised for the same reason products are: these are generated numbers, and a
// simulated per-vendor difference must not read as a finding about a named manufacturer.
const VENDORS = ['Vendor A', 'Vendor B', 'Vendor C', 'Vendor D'];
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
    case 'disease-detection':
      // One task per finding. Severe AS, cardiac amyloidosis and CAD on stress echo are different
      // detection problems with different prevalences and references; a pooled AUC is meaningless.
      if (/amyloid/.test(tags)) return 'amyloid';
      if (/hfpef|heart failure/.test(tags)) return 'hfpef';
      // Aortic stenosis wins before the coronary test: "cadx" is the FDA product-code term for
      // computer-assisted diagnostic software and sits on the AS products too, so it names no task.
      if (/aortic stenosis/.test(tags)) return 'as';
      if (/stress echo|coronary artery disease/.test(tags)) return 'cad';
      return 'other-detection';
    case 'hf-status-indicator': return 'hfpef';
    case 'amyloid-indicator': return 'amyloid';
    case 'acquisition-guidance': return 'acquisition';
    case 'image-quality': return 'quality';
    case 'fetal-echo': return 'not-evaluable-fetal';
    case 'interventional-guidance': return 'not-evaluable-procedural';
    default: return 'not-evaluable-other';
  }
}

// Detection tasks are scored separately. Pooling their AUCs would compare a 1.2% prevalence problem
// with an 11.4% one.
const DETECTION_TYPES = ['as', 'amyloid', 'hfpef', 'cad', 'other-detection'];

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
  if (DETECTION_TYPES.includes(type)) {
    const refs = {
      as: 'Registry-reported severe aortic stenosis (valve area, mean gradient)',
      hfpef: 'Registry diastolic function grade ≥ 2 with linked HF diagnosis',
      amyloid: 'Registry-linked confirmed cardiac amyloidosis diagnosis',
      cad: 'Registry-linked obstructive coronary artery disease after stress echocardiography',
      'other-detection': 'Registry-reported finding for the product’s cleared indication',
    };
    const auc = R(U(0.82, 0.95), 3); e.push({ id: 'auc', label: 'AUC', unit: '', value: auc, ci: ci(auc, half * 0.012, 3), direction: 'higher', reference: refs[type], primary: true });
    const sens = R(U(78, 94)); e.push({ id: 'sens', label: 'Sensitivity', unit: '%', value: sens, ci: ci(sens, half * 1.2), direction: 'higher', reference: refs[type] });
    const spec = R(U(80, 95)); e.push({ id: 'spec', label: 'Specificity', unit: '%', value: spec, ci: ci(spec, half * 0.8), direction: 'higher', reference: refs[type] });
    const prev = { as: 3.1, hfpef: 11.4, amyloid: 1.2, cad: 8.7, 'other-detection': 5.0 }[type]; const ppv = R(100 * (sens / 100 * prev / 100) / (sens / 100 * prev / 100 + (1 - spec / 100) * (1 - prev / 100)));
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

// Benchmarking runs are one-off analyses against a dated, frozen registry extract, not a live feed.
// Every evaluation therefore states which extract it used and when it was run, because two products
// scored against different extracts are not directly comparable.
const EXTRACTS = [
  { id: 'e2025h2', label: 'Adult TTE extract 2025-H2', extract_date: '2025-08-14', study_period: '2025-01-01 to 2025-06-30', n_registry_studies: 141200 },
  { id: 'e2026h1', label: 'Adult TTE extract 2026-H1', extract_date: '2026-02-11', study_period: '2025-01-01 to 2025-12-31', n_registry_studies: 268400 },
  { id: 'e2026h2', label: 'Adult TTE extract 2026-H2', extract_date: '2026-07-15', study_period: '2025-01-01 to 2026-06-30', n_registry_studies: 379600 },
];
const ANALYSIS_NOTE = 'One-off point-in-time analysis. A product is scored once against a frozen extract; the result is not refreshed as new studies arrive. Re-scoring requires a new run against a newer extract.';
const INCLUSION = 'Consecutive adult transthoracic studies with a finalized clinical report in the extract, excluding studies with no interpretable images and studies outside the product’s cleared indication.';
const RUN_DATE = { e2025h2: '2025-09-02', e2026h1: '2026-03-04', e2026h2: '2026-08-20' };

// Anonymous by design: simulated scores must not sit next to a real product's name. The catalog order
// is shuffled with the seeded RNG first, so the label numbering does not leak the catalog ordering, and
// no identifying field (family id, product name, company) is written to the output.
const anonOrder = shuffle(families.filter((f) => !evalType(f).startsWith('not-evaluable')));
const label = new Map(anonOrder.map((f, i) => [f, `Product ${String(i + 1).padStart(2, '0')}`]));
const products = [];
let nNotEvaluable = 0;
for (const f of families) {
  const type = evalType(f);
  if (type.startsWith('not-evaluable')) { nNotEvaluable++; continue; }
  const base = { id: `p${String(anonOrder.indexOf(f) + 1).padStart(2, '0')}`, label: label.get(f), evaluation_type: type };
  const n_studies = Math.round(U(1800, 24000) / 10) * 10;
  const n_sites = Math.min(8, Math.max(3, Math.round(U(3, 8))));
  const sites = shuffle(SITES).slice(0, n_sites);
  const vendors = shuffle(VENDORS).slice(0, Math.max(2, Math.round(U(2, 4))));
  const endpoints = endpointsFor(type, n_studies);
  const primary = endpoints.find((e) => e.primary) || null;
  // No monthly series: an evaluation is a single analysis of a frozen extract, so a month-by-month
  // trend would imply a continuously refreshed measurement that never happens.
  const extract = EXTRACTS[Math.min(EXTRACTS.length - 1, Math.floor(U(0, EXTRACTS.length)))];
  products.push({
    ...base,
    cohort: { n_studies, n_sites, sites, vendors, period: extract.study_period, module: 'Adult TTE (phase 1)' },
    dataset: { id: extract.id, label: extract.label, extract_date: extract.extract_date, study_period: extract.study_period, n_registry_studies: extract.n_registry_studies, inclusion: INCLUSION },
    analysis: { type: 'One-off point-in-time analysis', run_date: RUN_DATE[extract.id], protocol_version: 'v1.0', note: ANALYSIS_NOTE },
    endpoints, primary_endpoint_id: primary ? primary.id : null, subgroups: subgroupsFor(type, primary),
  });
}
products.sort((a, b) => a.label.localeCompare(b.label));

// ---------- per-site quality control ----------
// Sites are anonymised for the same reason products are. The nine metrics are the nine that the
// registry reports as live (REGISTRY.quality_metrics); the numbers under them are generated.
// Generated after the product loop so the product draws above keep the same values for a given seed.
const QC_METRICS = [
  { id: 'tat', code: 'TAT', status: 'live', source: 'JASE 2025 (PMC11779749)', section: 'Timeliness', label: 'Report turnaround time', short: 'Turnaround time', unit: 'h', direction: 'lower', num: 'Hours from study to finalized report (median)', denom: 'All finalized studies', lo: 3, hi: 34, benchmark: 24 },
  { id: 'study_completeness', code: 'STU', status: 'live', source: 'JASE 2025 (PMC11779749)', section: 'Study and report completeness', label: 'Study completeness', short: 'Study completeness', unit: '%', direction: 'higher', num: 'Studies with all protocol views acquired', denom: 'All studies', lo: 76, hi: 98, benchmark: 90 },
  { id: 'report_completeness', code: 'RPT', status: 'live', source: 'JASE 2025 (PMC11779749)', section: 'Study and report completeness', label: 'Report completeness', short: 'Report completeness', unit: '%', direction: 'higher', num: 'Reports with all required fields populated', denom: 'All finalized reports', lo: 74, hi: 99, benchmark: 90 },
  { id: 'quant_completeness', code: 'QNT', status: 'live', source: 'JASE 2025 (PMC11779749)', section: 'Study and report completeness', label: 'Quantitative report completeness', short: 'Quantitative completeness', unit: '%', direction: 'higher', num: 'Reports with all required measurements', denom: 'All finalized reports', lo: 62, hi: 95, benchmark: 85 },
  { id: 'qual_completeness', code: 'QAL', status: 'live', source: 'JASE 2025 (PMC11779749)', section: 'Study and report completeness', label: 'Qualitative report completeness', short: 'Qualitative completeness', unit: '%', direction: 'higher', num: 'Reports with all required descriptive fields', denom: 'All finalized reports', lo: 70, hi: 97, benchmark: 88 },
  { id: 'gradients', code: 'GRD', status: 'live', source: 'JASE 2025 (PMC11779749)', section: 'Valvular disease reporting', label: 'Mean and peak gradients for valvular disease', short: 'Valve gradients', unit: '%', direction: 'higher', num: 'Studies reporting mean and peak gradients', denom: 'Studies with valvular disease', lo: 58, hi: 96, benchmark: 85 },
  { id: 'valve_areas', code: 'ARE', status: 'live', source: 'JASE 2025 (PMC11779749)', section: 'Valvular disease reporting', label: 'Valve areas for stenotic lesions', short: 'Valve areas', unit: '%', direction: 'higher', num: 'Studies reporting a valve area', denom: 'Studies with a stenotic lesion', lo: 52, hi: 94, benchmark: 80 },
  { id: 'regurg', code: 'REG', status: 'live', source: 'JASE 2025 (PMC11779749)', section: 'Valvular disease reporting', label: 'Regurgitation severity reporting', short: 'Regurgitation severity', unit: '%', direction: 'higher', num: 'Studies grading regurgitation severity', denom: 'Studies with regurgitation', lo: 66, hi: 98, benchmark: 90 },
  { id: 'strain_util', code: 'STR', status: 'live', source: 'JASE 2025 (PMC11779749)', section: 'Advanced imaging utilization', label: 'Strain utilization for chemotherapy, heart failure, or cardiomyopathy', short: 'Strain utilization', unit: '%', direction: 'higher', num: 'Eligible studies reporting strain', denom: 'Eligible chemotherapy, HF or cardiomyopathy studies', lo: 14, hi: 78, benchmark: 50 },
];
// Proposed, NOT among the registry's nine live metrics. Direction is neutral on purpose: a lab that
// accepts every AI value has not improved, it has changed what its signature means, and a lab with no AI
// cannot be scored at all. Colour therefore encodes distance from a reference, never better or worse.
// The reference values are illustrative placeholders, not derived from any measurement.
const AI_SECTION = 'AI-assisted reporting (proposed)';
const AI_METRICS = [
  { id: 'ai_use', code: 'AIU', status: 'proposed', source: 'Proposed by this project', section: AI_SECTION, label: 'AI-assisted report rate', short: 'AI-assisted reports', unit: '%', direction: 'neutral', basis: 'report',
    num: 'Finalized reports carrying at least one AI-derived value with recorded algorithm provenance', denom: 'All finalized adult TTE reports', reference: 40,
    note: 'Counts documented AI provenance in the signed report, not AI activity in the lab. A site that cannot export per-element provenance reads as not submitted, never as zero.' },
  { id: 'ai_accept', code: 'AIA', status: 'proposed', source: 'Proposed by this project', section: AI_SECTION, label: 'AI values accepted unedited', short: 'AI accepted', unit: '%', direction: 'neutral', basis: 'value',
    num: 'AI candidate values that reached the signed report unchanged, within the field’s rounding tolerance', denom: 'AI candidate values with a recorded disposition', reference: 70,
    note: 'A rate near 100% is the automation-bias case to look at, not the top performer.' },
  { id: 'ai_edit', code: 'AIM', status: 'proposed', source: 'Proposed by this project', section: AI_SECTION, label: 'AI values edited', short: 'AI edited', unit: '%', direction: 'neutral', basis: 'value',
    num: 'AI candidate values kept but corrected beyond the field’s rounding tolerance', denom: 'AI candidate values with a recorded disposition', reference: 22,
    note: 'The common interaction is neither taking nor discarding the AI result but correcting it, so accept and reject alone would not sum to 100.' },
  { id: 'ai_reject', code: 'AIR', status: 'proposed', source: 'Proposed by this project', section: AI_SECTION, label: 'AI values rejected', short: 'AI rejected', unit: '%', direction: 'neutral', basis: 'value',
    num: 'AI candidate values discarded, replaced by an independent measurement, or left out of the signed report', denom: 'AI candidate values with a recorded disposition', reference: 8,
    note: 'A record of what a reader did with a number in a draft. It is not an AI error rate: no adjudicated truth exists on either side, and the AI value anchors the reader.' },
];
const AI_DISPOSITION = ['ai_accept', 'ai_edit', 'ai_reject'];

const QUARTERS = [...new Set(MONTHS.map((m) => { const [y, mm] = m.split('-'); return `${y}-Q${Math.ceil(Number(mm) / 3)}`; }))];
const SETTINGS = ['Academic medical center', 'Community hospital', 'Integrated health system', 'Outpatient cardiology network'];

// A per-site skill offset shared across metrics, so a strong lab reads as strong on most rows
// instead of every cell being independent noise.
const siteSkill = new Map(SITES.map((s) => [s, U(-1, 1)]));
// Every month draws a disposition composition that sums exactly to its denominator, so accepted, edited
// and rejected close at 100% in every cell, every roll-up and every pooled total. Pooling is by summed
// numerators rather than by averaging rates, which is what keeps the identity exact.
function aiSeries(capture, nStudies, i) {
  if (capture === 'none') return AI_METRICS.map((m) => ({ id: m.id, value: null, n: null, d: null, not_submitted: true, monthly: MONTHS.map((mo) => ({ month: mo, value: null, n: null, d: 0 })) }));
  const useLevel = 0.12 + rnd() * 0.72;                       // deployment penetration varies widely
  const acc = 0.5 + rnd() * 0.42;                             // acceptance is the dominant share
  const rej = 0.02 + rnd() * 0.16;
  const edit = Math.max(0.02, 1 - acc - rej);
  const shares = { ai_accept: acc / (acc + edit + rej), ai_edit: edit / (acc + edit + rej), ai_reject: rej / (acc + edit + rej) };
  const perMonth = MONTHS.map((mo, k) => {
    const reports = Math.round(nStudies / MONTHS.length * U(0.8, 1.2));
    const drift = Math.sin((k + i * 2.1) / 4.3) * 0.06;
    const useN = Math.round(reports * Math.min(0.97, Math.max(0.01, useLevel * (1 + drift))));
    // Candidate values, not studies: one study offers several automated fields.
    const cand = Math.round(useN * U(3.2, 7.4));
    const a = Math.round(cand * Math.min(0.94, Math.max(0.02, shares.ai_accept * (1 + U(-0.08, 0.08)))));
    // Cap rejected by what is left, so accepted + edited + rejected equals the denominator exactly and
    // the three shares still close at 100% after rounding.
    const r = Math.min(cand - a, Math.round(cand * Math.min(0.4, Math.max(0.005, shares.ai_reject * (1 + U(-0.2, 0.2))))));
    const e = cand - a - r;
    return { month: mo, reports, useN, cand, ai_accept: a, ai_edit: e, ai_reject: r };
  });
  const out = [];
  for (const m of AI_METRICS) {
    if (capture === 'persisted_only' && AI_DISPOSITION.includes(m.id)) {
      out.push({ id: m.id, value: null, n: null, d: null, not_submitted: true, monthly: MONTHS.map((mo) => ({ month: mo, value: null, n: null, d: 0 })) });
      continue;
    }
    const monthly = perMonth.map((p) => {
      const d = m.basis === 'report' ? p.reports : p.cand;
      const n = m.basis === 'report' ? p.useN : p[m.id];
      return { month: p.month, n, d, value: d ? R(100 * n / d) : null };
    });
    const nT = monthly.reduce((t, x) => t + x.n, 0), dT = monthly.reduce((t, x) => t + x.d, 0);
    out.push({ id: m.id, value: dT ? R(100 * nT / dT) : null, n: nT, d: dT, monthly });
  }
  return out;
}
const qcSites = SITES.map((name, i) => {
  const skill = siteSkill.get(name);
  const nStudies = Math.round(U(9000, 68000) / 100) * 100;
  const metrics = QC_METRICS.map((m, mi) => {
    const span = m.hi - m.lo;
    const good = m.direction === 'lower' ? m.lo + span * (0.5 - skill * 0.32) : m.lo + span * (0.5 + skill * 0.32);
    const value = R(Math.min(m.hi, Math.max(m.lo, good + U(-1, 1) * span * 0.13)), m.unit === 'h' ? 1 : 1);
    const nDenom = Math.round(nStudies * (m.id === 'strain_util' ? U(0.05, 0.14) : m.id === 'valve_areas' ? U(0.04, 0.11) : m.id === 'gradients' ? U(0.1, 0.22) : m.id === 'regurg' ? U(0.3, 0.55) : 1));
    // Every interval carries its own numerator and denominator, so the metric table can show the
    // value over N / D the way the reference registry report does.
    const monthly = MONTHS.map((mo, k) => {
      // Each metric gets its own phase and period. A single site-indexed wave would move all nine
      // metrics in lockstep, which reads as a site-wide trend that nothing in the model produces.
      const wave = Math.sin((k + i * 1.7 + mi * 2.9) / (2.6 + (mi % 4) * 0.7)) * (0.02 + (mi % 3) * 0.012);
      const v = R(Math.min(m.hi, Math.max(m.lo, value * (1 + wave + U(-0.035, 0.035)))), 1);
      const d = Math.round(nDenom / MONTHS.length * U(0.72, 1.28));
      return { month: mo, value: v, d, n: m.unit === '%' ? Math.round(d * v / 100) : null };
    });
    const nNum = m.unit === '%' ? Math.round(nDenom * value / 100) : null;
    return { id: m.id, value, n: nNum, d: nDenom, monthly };
  });
  const poor = R(100 * U(0.03, 0.15) * (1 - skill * 0.3)); const adequate = R(100 * U(0.26, 0.4)); const good = R(100 - poor - adequate);
  // Not every site can export what these metrics need. 'none' means no per-element AI provenance at all;
  // 'persisted_only' means discarded candidates are invisible, so a disposition rate cannot be computed.
  // Those sites are reported as not submitted rather than scored zero, which would read as "uses no AI".
  const aiCapture = i === 3 ? 'none' : i === 6 ? 'persisted_only' : 'full_disposition';
  const aiMetrics = aiSeries(aiCapture, nStudies, i);
  return {
    id: `s${i + 1}`, label: name, setting: pick(SETTINGS),
    n_studies: nStudies, n_labs: Math.max(1, Math.round(U(1, 6))), n_sonographers: Math.round(U(8, 46)), n_readers: Math.round(U(5, 28)),
    image_quality: [{ level: 'Good', pct: good }, { level: 'Adequate', pct: adequate }, { level: 'Poor', pct: poor }],
    ai_capture: aiCapture,
    metrics: metrics.concat(aiMetrics),
  };
});
// Registry-wide reference for each metric: the median across sites, weighted by nothing — a plain
// median, which is what a site wants to be compared against on a scorecard.
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : R((a[h - 1] + a[h]) / 2); };
const ALL_METRICS = [...QC_METRICS, ...AI_METRICS];
const qcMetrics = ALL_METRICS.map((m) => {
  const vals = qcSites.map((s) => s.metrics.find((x) => x.id === m.id).value).filter((v) => v != null);
  return { ...m, benchmark: m.benchmark != null ? m.benchmark : m.reference, median: vals.length ? median(vals) : null, min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null };
});
// Live metrics get the diverging band: four steps worse, a within-benchmark band, four steps better.
// A neutral metric has no better or worse side, so it gets an unsigned distance step instead, which the
// page paints with a sequential ramp. Scoring acceptance as higher-is-better would reward a lab that
// stopped checking its AI.
function band(value, benchmark, direction) {
  if (value == null || benchmark == null) return { rel_pct: null, band: null };
  const rel = benchmark === 0 ? 0 : (value - benchmark) / Math.abs(benchmark);
  if (direction === 'neutral') {
    const a = Math.abs(rel) * 100;
    return { rel_pct: R(rel * 100), band: 0, distance: a < 1 ? 0 : a < 10 ? 1 : a < 25 ? 2 : a < 50 ? 3 : 4 };
  }
  const better = direction === 'lower' ? -rel : rel; // positive = better than benchmark
  const a = Math.abs(better) * 100;
  const step = a < 1 ? 0 : a < 10 ? 1 : a < 25 ? 2 : a < 50 ? 3 : 4;
  return { rel_pct: R(better * 100), band: step === 0 ? 0 : (better > 0 ? step : -step) };
}
for (const s of qcSites) {
  for (const mv of s.metrics) {
    const m = qcMetrics.find((x) => x.id === mv.id);
    mv.delta = mv.value != null && m.median != null ? R(mv.value - m.median, 1) : null;
    Object.assign(mv, band(mv.value, m.benchmark, m.direction));
    for (const mo of mv.monthly) Object.assign(mo, band(mo.value, m.benchmark, m.direction));
    // A neutral metric has no best site, so it carries no rank rather than a misleading one.
    if (m.direction === 'neutral' || mv.value == null) { mv.rank = null; continue; }
    const ordered = [...qcSites].sort((a, b) => { const av = a.metrics.find((x) => x.id === mv.id).value, bv = b.metrics.find((x) => x.id === mv.id).value; return m.direction === 'lower' ? av - bv : bv - av; });
    mv.rank = ordered.findIndex((x) => x.id === s.id) + 1;
  }
  // Both tallies count the nine live metrics only: a neutral metric has no "below".
  const scored = s.metrics.filter((mv) => { const m = qcMetrics.find((x) => x.id === mv.id); return m && m.status === 'live'; });
  s.n_scored_metrics = scored.length;
  s.n_below_median = scored.filter((mv) => mv.rank && mv.rank > qcSites.length / 2).length;
  s.n_below_benchmark = scored.filter((mv) => mv.band < 0).length;
}
// Registry-level roll-up. Pooled from summed numerators where a numerator exists, so the accepted,
// edited and rejected shares still close at 100% after pooling.
for (const m of qcMetrics) {
  const rows = qcSites.map((s) => s.metrics.find((x) => x.id === m.id)).filter((r) => r.value != null);
  const dTot = rows.reduce((n, r) => n + r.d, 0);
  const nTot = rows.reduce((n, r) => n + (r.n || 0), 0);
  const pooled = m.unit === '%' && nTot ? 100 * nTot / dTot : rows.reduce((n, r) => n + r.value * r.d, 0) / dTot;
  m.registry_value = dTot ? R(pooled, 1) : null;
  m.n = nTot || null;
  m.d = dTot;
  m.n_sites_reporting = rows.length;
  Object.assign(m, band(m.registry_value, m.benchmark, m.direction));
  m.n_sites_below = m.direction === 'neutral' ? null : rows.filter((r) => r.band < 0).length;
  m.monthly = MONTHS.map((mo, k) => {
    const cells = rows.map((r) => r.monthly[k]).filter((c) => c.value != null);
    const d = cells.reduce((n, c) => n + c.d, 0);
    const n = cells.reduce((t, c) => t + (c.n || 0), 0);
    const v = d ? R(m.unit === '%' && n ? 100 * n / d : cells.reduce((t, c) => t + c.value * c.d, 0) / d, 1) : null;
    return { month: mo, value: v, d, n: m.unit === '%' ? n : null, ...band(v, m.benchmark, m.direction) };
  });
}



const out = {
  simulated: true,
  notice: 'SIMULATED DATA. Every score in this file is generated by scripts/gen-registry.mjs from a fixed seed. No product has been evaluated on the ImageGuideEcho Registry. Products are labelled anonymously so no simulated score is attached to a real device. Facts under "registry" are real and sourced.',
  seed: SEED, generated: GENERATED, registry: REGISTRY,
  n_catalog_products: families.length, n_not_evaluable: nNotEvaluable,
  extracts: EXTRACTS, analysis_note: ANALYSIS_NOTE,
  detection_tasks: [
    { id: 'as', label: 'Severe aortic stenosis', reference: 'Registry-reported severe aortic stenosis (valve area, mean gradient)', prevalence: 3.1 },
    { id: 'amyloid', label: 'Cardiac amyloidosis', reference: 'Registry-linked confirmed cardiac amyloidosis diagnosis', prevalence: 1.2 },
    { id: 'hfpef', label: 'Heart failure with preserved ejection fraction', reference: 'Registry diastolic function grade ≥ 2 with linked HF diagnosis', prevalence: 11.4 },
    { id: 'cad', label: 'Obstructive coronary artery disease on stress echo', reference: 'Registry-linked obstructive coronary artery disease after stress echocardiography', prevalence: 8.7 },
  ],
  min_products_per_chart: 2,
  products,
  quality: { metrics: qcMetrics, sites: qcSites, n_live_metrics: qcMetrics.filter((m) => m.status === 'live').length, n_proposed_metrics: qcMetrics.filter((m) => m.status === 'proposed').length, months: MONTHS, quarters: QUARTERS, benchmark_source: 'Registry-wide target for the metric (illustrative)', n_metrics: qcMetrics.length, period: `${MONTHS[0]} to ${MONTHS[MONTHS.length - 1]}`, module: 'Adult TTE (phase 1)' },
};
fs.writeFileSync(path.join(root, 'data', 'registry.js'), `// Generated by scripts/gen-registry.mjs — PLACEHOLDER, SYNTHETIC DATA. Do not edit by hand.\nwindow.AIECHO_REGISTRY = ${JSON.stringify(out, null, 1)};\n`);
console.log(`registry simulation: ${products.length} anonymised products of ${families.length} catalog families, ${qcSites.length} anonymised sites x ${qcMetrics.filter((m) => m.status === 'live').length} live + ${qcMetrics.filter((m) => m.status === 'proposed').length} proposed metrics, seed ${SEED}`);
