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
  const monthly = MONTHS.map((m, i) => {
    const drift = Math.sin(i / 3.1) * 0.03;
    return { month: m, n: Math.round(n_studies / MONTHS.length * U(0.7, 1.3)), primary: primary ? R(primary.value * (1 + drift + U(-0.05, 0.05)), primary.unit === '' ? 3 : 1) : null, feasibility: R(endpoints[0].value * (1 + U(-0.03, 0.03))) };
  });
  products.push({ ...base, cohort: { n_studies, n_sites, sites, vendors, period: `${MONTHS[0]} to ${MONTHS[MONTHS.length - 1]}`, module: 'Adult TTE (phase 1)' }, endpoints, primary_endpoint_id: primary ? primary.id : null, subgroups: subgroupsFor(type, primary), monthly });
}
products.sort((a, b) => a.label.localeCompare(b.label));

// ---------- per-site quality control ----------
// Sites are anonymised for the same reason products are. The nine metrics are the nine that the
// registry reports as live (REGISTRY.quality_metrics); the numbers under them are generated.
// Generated after the product loop so the product draws above keep the same values for a given seed.
const QC_METRICS = [
  { id: 'tat', code: 'TAT', section: 'Timeliness', label: 'Report turnaround time', short: 'Turnaround time', unit: 'h', direction: 'lower', num: 'Hours from study to finalized report (median)', denom: 'All finalized studies', lo: 3, hi: 34, benchmark: 24 },
  { id: 'study_completeness', code: 'STU', section: 'Study and report completeness', label: 'Study completeness', short: 'Study completeness', unit: '%', direction: 'higher', num: 'Studies with all protocol views acquired', denom: 'All studies', lo: 76, hi: 98, benchmark: 90 },
  { id: 'report_completeness', code: 'RPT', section: 'Study and report completeness', label: 'Report completeness', short: 'Report completeness', unit: '%', direction: 'higher', num: 'Reports with all required fields populated', denom: 'All finalized reports', lo: 74, hi: 99, benchmark: 90 },
  { id: 'quant_completeness', code: 'QNT', section: 'Study and report completeness', label: 'Quantitative report completeness', short: 'Quantitative completeness', unit: '%', direction: 'higher', num: 'Reports with all required measurements', denom: 'All finalized reports', lo: 62, hi: 95, benchmark: 85 },
  { id: 'qual_completeness', code: 'QAL', section: 'Study and report completeness', label: 'Qualitative report completeness', short: 'Qualitative completeness', unit: '%', direction: 'higher', num: 'Reports with all required descriptive fields', denom: 'All finalized reports', lo: 70, hi: 97, benchmark: 88 },
  { id: 'gradients', code: 'GRD', section: 'Valvular disease reporting', label: 'Mean and peak gradients for valvular disease', short: 'Valve gradients', unit: '%', direction: 'higher', num: 'Studies reporting mean and peak gradients', denom: 'Studies with valvular disease', lo: 58, hi: 96, benchmark: 85 },
  { id: 'valve_areas', code: 'ARE', section: 'Valvular disease reporting', label: 'Valve areas for stenotic lesions', short: 'Valve areas', unit: '%', direction: 'higher', num: 'Studies reporting a valve area', denom: 'Studies with a stenotic lesion', lo: 52, hi: 94, benchmark: 80 },
  { id: 'regurg', code: 'REG', section: 'Valvular disease reporting', label: 'Regurgitation severity reporting', short: 'Regurgitation severity', unit: '%', direction: 'higher', num: 'Studies grading regurgitation severity', denom: 'Studies with regurgitation', lo: 66, hi: 98, benchmark: 90 },
  { id: 'strain_util', code: 'STR', section: 'Advanced imaging utilization', label: 'Strain utilization for chemotherapy, heart failure, or cardiomyopathy', short: 'Strain utilization', unit: '%', direction: 'higher', num: 'Eligible studies reporting strain', denom: 'Eligible chemotherapy, HF or cardiomyopathy studies', lo: 14, hi: 78, benchmark: 50 },
];
const QUARTERS = [...new Set(MONTHS.map((m) => { const [y, mm] = m.split('-'); return `${y}-Q${Math.ceil(Number(mm) / 3)}`; }))];
const SETTINGS = ['Academic medical center', 'Community hospital', 'Integrated health system', 'Outpatient cardiology network'];

// A per-site skill offset shared across metrics, so a strong lab reads as strong on most rows
// instead of every cell being independent noise.
const siteSkill = new Map(SITES.map((s) => [s, U(-1, 1)]));
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
  return {
    id: `s${i + 1}`, label: name, setting: pick(SETTINGS),
    n_studies: nStudies, n_labs: Math.max(1, Math.round(U(1, 6))), n_sonographers: Math.round(U(8, 46)), n_readers: Math.round(U(5, 28)),
    image_quality: [{ level: 'Good', pct: good }, { level: 'Adequate', pct: adequate }, { level: 'Poor', pct: poor }],
    metrics,
  };
});
// Registry-wide reference for each metric: the median across sites, weighted by nothing — a plain
// median, which is what a site wants to be compared against on a scorecard.
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : R((a[h - 1] + a[h]) / 2); };
const qcMetrics = QC_METRICS.map((m) => {
  const vals = qcSites.map((s) => s.metrics.find((x) => x.id === m.id).value);
  return { ...m, median: median(vals), min: Math.min(...vals), max: Math.max(...vals) };
});
// Bands mirror the reference registry report: four steps worse, a within-benchmark band, four
// steps better, keyed off the percentage difference from the benchmark.
function band(value, benchmark, direction) {
  const rel = benchmark === 0 ? 0 : (value - benchmark) / Math.abs(benchmark);
  const better = direction === 'lower' ? -rel : rel; // positive = better than benchmark
  const a = Math.abs(better) * 100;
  const step = a < 1 ? 0 : a < 10 ? 1 : a < 25 ? 2 : a < 50 ? 3 : 4;
  return { rel_pct: R(better * 100), band: step === 0 ? 0 : (better > 0 ? step : -step) };
}
for (const s of qcSites) {
  for (const mv of s.metrics) {
    const m = qcMetrics.find((x) => x.id === mv.id);
    mv.delta = R(mv.value - m.median, 1);
    Object.assign(mv, band(mv.value, m.benchmark, m.direction));
    for (const mo of mv.monthly) Object.assign(mo, band(mo.value, m.benchmark, m.direction));
    // Rank 1 is the best site on this metric, in the direction the metric is scored.
    const ordered = [...qcSites].sort((a, b) => { const av = a.metrics.find((x) => x.id === mv.id).value, bv = b.metrics.find((x) => x.id === mv.id).value; return m.direction === 'lower' ? av - bv : bv - av; });
    mv.rank = ordered.findIndex((x) => x.id === s.id) + 1;
  }
  s.n_below_median = s.metrics.filter((mv) => mv.rank > qcSites.length / 2).length;
  s.n_below_benchmark = s.metrics.filter((mv) => mv.band < 0).length;
}
// Registry-level roll-up: the denominator-weighted value across every site, which is the number a
// registry-level QI report leads with.
for (const m of qcMetrics) {
  const rows = qcSites.map((s) => s.metrics.find((x) => x.id === m.id));
  const dTot = rows.reduce((n, r) => n + r.d, 0);
  m.registry_value = R(rows.reduce((n, r) => n + r.value * r.d, 0) / dTot, 1);
  m.n = rows.reduce((n, r) => n + (r.n || 0), 0) || null;
  m.d = dTot;
  Object.assign(m, band(m.registry_value, m.benchmark, m.direction));
  m.n_sites_below = rows.filter((r) => r.band < 0).length;
  m.monthly = MONTHS.map((mo, k) => {
    const cells = rows.map((r) => r.monthly[k]);
    const d = cells.reduce((n, c) => n + c.d, 0);
    const v = R(cells.reduce((n, c) => n + c.value * c.d, 0) / d, 1);
    return { month: mo, value: v, d, n: m.unit === '%' ? Math.round(d * v / 100) : null, ...band(v, m.benchmark, m.direction) };
  });
}


const out = {
  simulated: true,
  notice: 'SIMULATED DATA. Every score in this file is generated by scripts/gen-registry.mjs from a fixed seed. No product has been evaluated on the ImageGuideEcho Registry. Products are labelled anonymously so no simulated score is attached to a real device. Facts under "registry" are real and sourced.',
  seed: SEED, generated: GENERATED, registry: REGISTRY,
  n_catalog_products: families.length, n_not_evaluable: nNotEvaluable,
  products,
  quality: { metrics: qcMetrics, sites: qcSites, months: MONTHS, quarters: QUARTERS, benchmark_source: 'Registry-wide target for the metric (illustrative)', n_metrics: qcMetrics.length, period: `${MONTHS[0]} to ${MONTHS[MONTHS.length - 1]}`, module: 'Adult TTE (phase 1)' },
};
fs.writeFileSync(path.join(root, 'data', 'registry.js'), `// Generated by scripts/gen-registry.mjs — PLACEHOLDER, SYNTHETIC DATA. Do not edit by hand.\nwindow.AIECHO_REGISTRY = ${JSON.stringify(out, null, 1)};\n`);
console.log(`registry simulation: ${products.length} anonymised products of ${families.length} catalog families, ${qcSites.length} anonymised sites x ${qcMetrics.length} quality metrics, seed ${SEED}`);
