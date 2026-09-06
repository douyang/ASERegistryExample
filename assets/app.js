/* AI Echo Central — catalog, detail panel, registry charts. Vanilla JS, no build step. */
(function () {
  'use strict';
  const P = window.AIECHO_PRODUCTS || { families: [], excluded: [], product_codes: {}, build_warnings: [] };
  const R = window.AIECHO_REGISTRY || { evaluations: {}, registry: { facts: [], quality_metrics: [], data_domains: [] } };
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
  const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
  const CAT = {
    'acquisition-guidance': 'Acquisition guidance', 'lv-function-quantification': 'LV function (EF)', 'comprehensive-measurement': 'Multi-parameter measurement',
    'disease-detection': 'Disease detection', 'hf-status-indicator': 'Heart failure indicator', 'amyloid-indicator': 'Cardiac amyloidosis indicator',
    'fetal-echo': 'Fetal echo', 'interventional-guidance': 'Interventional guidance', 'image-quality': 'Image quality', 'system-embedded': 'System-embedded AI', 'other': 'Other',
  };
  const VL = { fda_summary: 'FDA summary', fda_database: 'FDA database', peer_reviewed: 'Peer reviewed', company: 'Company', news: 'News', unverified: 'Unverified', clinicaltrials_gov: 'ClinicalTrials.gov', doi_resolved: 'DOI resolved', pmid_resolved: 'PMID resolved', unresolved: 'Unresolved' };
  const vkey = (v) => String(v || '').split(/[;,]/)[0].trim();
  const vl = (v) => (v ? `<span class="vlevel ${esc(vkey(v))}">${esc(VL[vkey(v)] || vkey(v))}</span>` : '');
  const PLACEHOLDER = R.placeholder !== false;
  const ptag = () => '';
  const dec = (x) => { try { return decodeURIComponent(x); } catch (e) { return x; } };
  const companyShort = (c) => String(c || '').split(' (')[0].trim();
  const fams = P.families;
  const byId = new Map(fams.map((f) => [f.id, f]));

  // ---------- state ----------
  const state = {
    tab: 'products', view: 'cards', q: '', sort: 'latest', sel: {}, regSel: null, openFacet: null, opener: null,
    qcMetrics: new Set(((R.quality || {}).metrics || []).map((m) => m.id)), qcSites: new Set(((R.quality || {}).sites || []).map((s) => s.id)),
    qcInterval: 'quarter', qcFrom: null, qcTo: null, qcBench: 'target', qcND: false, qcSel: null, regExtract: 'all',
  };
  const FILTERS = [
    { key: 'category', label: 'Function', get: (f) => [f.research_pending ? 'pending' : f.category], name: (v) => (v === 'pending' ? 'Research pending' : CAT[v] || v) },
    { key: 'mode', label: 'Imaging mode', get: (f) => f.modes || [], order: ['TTE', 'TEE', 'POCUS', 'ICE', 'Fetal echo', 'Stress echo'] },
    { key: 'pathway', label: 'Regulatory pathway', get: (f) => f.pathways },
    { key: 'evidence', label: 'Evidence', get: (f) => evidenceFlags(f) },
    { key: 'company', label: 'Company', get: (f) => [companyShort(f.company)] },
    { key: 'deployment', label: 'Deployment', get: (f) => f.deployment || [] },
    { key: 'code', label: 'Product code', get: (f) => f.product_codes },
    { key: 'year', label: 'Latest clearance year', get: (f) => [f.latest_cleared.slice(0, 4)] },
  ];
  function evidenceFlags(f) {
    const out = [];
    if (f.n_fda_claims > 0) out.push('FDA summary performance data');
    if (f.n_other_claims > 0) out.push('Published or company performance data');
    if (f.n_papers_resolved > 0) out.push('Peer-reviewed publications');
    if (f.training_data && f.training_data.disclosed) out.push('Training data disclosed');
    if ((f.clinical_trials || []).length) out.push('Registered clinical trial');
    if (f.pathways.some((p) => /PCCP/.test(p))) out.push('PCCP');
    if (f.pathways.includes('De Novo')) out.push('De Novo');
    return out;
  }

  // ---------- filters rail ----------
  function facetValues(F) {
    const counts = new Map();
    for (const f of fams) for (const v of F.get(f)) if (v) counts.set(v, (counts.get(v) || 0) + 0);
    for (const f of fams.filter((x) => matchesFacets(x, F.key) && searchOk(x))) for (const v of F.get(f)) if (v) counts.set(v, (counts.get(v) || 0) + 1);
    const vals = [...counts.keys()].sort((a, b) => (F.order ? F.order.indexOf(a) - F.order.indexOf(b) : F.key === 'year' ? b.localeCompare(a) : a.localeCompare(b)));
    return { counts, vals };
  }
  function renderFilters() {
    const host = $('#filters');
    const act = document.activeElement;
    const focused = act && act.closest && act.closest('#filters input') ? { key: act.dataset.key, value: act.value } : null;
    host.innerHTML = FILTERS.map((F) => {
      const { counts, vals } = facetValues(F);
      const sel = state.sel[F.key] || new Set();
      const open = state.openFacet === F.key;
      return `<details class="f-drop ${sel.size ? 'on' : ''}" data-key="${esc(F.key)}" ${open ? 'open' : ''}><summary>${esc(F.label)}${sel.size ? ` <span class="badge num">${sel.size}</span>` : ''}</summary><div class="f-pop"><ul>${vals.map((v) => {
        const n = counts.get(v); const on = sel.has(v);
        return `<li><label class="${n === 0 && !on ? 'zero' : ''}"><input type="checkbox" data-key="${esc(F.key)}" value="${esc(v)}" ${on ? 'checked' : ''}> <span>${esc(F.name ? F.name(v) : v)}</span><span class="n">${n}</span></label></li>`;
      }).join('')}</ul></div></details>`;
    }).join('');
    if (focused) { const el = host.querySelector(`input[data-key="${CSS.escape(focused.key)}"][value="${CSS.escape(focused.value)}"]`); if (el) el.focus({ preventScroll: true }); }
    if (state.openFacet) placePopover(host.querySelector(`.f-drop[data-key="${CSS.escape(state.openFacet)}"]`));
  }
  // Drop the popover below the whole bar, not just its own pill: the bar wraps to several rows on
  // narrow viewports and an overlay anchored to one pill would cover the pills beneath it. Then clamp
  // it to the viewport, because a pill near either edge would otherwise push the panel off-screen.
  function placePopover(d) {
    if (!d) return;
    const pop = d.querySelector('.f-pop'); if (!pop) return;
    pop.style.top = ''; pop.style.left = '';
    const bar = d.closest('.filter-bar');
    const dr = d.getBoundingClientRect();
    if (bar) pop.style.top = `${Math.round(bar.getBoundingClientRect().bottom - dr.top) + 6}px`;
    const w = pop.getBoundingClientRect().width, vw = document.documentElement.clientWidth, pad = 8;
    const left = Math.min(Math.max(pad, dr.left), Math.max(pad, vw - pad - w));
    pop.style.left = `${Math.round(left - dr.left)}px`;
  }
  function renderActiveFilters() {
    const host = $('#active-filters');
    const out = [];
    for (const F of FILTERS) {
      for (const v of state.sel[F.key] || []) out.push(`<button class="pill" type="button" data-off-key="${esc(F.key)}" data-off-value="${esc(v)}">${esc(F.name ? F.name(v) : v)}<span class="x" aria-hidden="true">✕</span><span class="sr-only">Remove filter</span></button>`);
    }
    if (out.length || state.q) out.push('<button class="pill clear" type="button" id="clear-filters">Clear all</button>');
    host.innerHTML = out.join('');
  }

  function matchesFacets(f, skipKey) {
    for (const F of FILTERS) {
      if (F.key === skipKey) continue;
      const sel = state.sel[F.key];
      if (sel && sel.size) { const vals = F.get(f); if (!vals.some((v) => sel.has(v))) return false; }
    }
    return true;
  }
  function searchOk(f) {
    if (!state.q) return true;
    const hay = [f.product_name, f.company, f.summary, (f.tags || []).join(' '), (f.modes || []).join(' '), (f.modality_scope || []).join(' '), f.clearances.map((c) => c.k_number + ' ' + c.device_name_fda).join(' '), (f.embedded_ai_features || []).map((e) => e.name).join(' ')].join(' ').toLowerCase();
    return state.q.split(/\s+/).every((t) => hay.includes(t));
  }
  const matches = (f) => matchesFacets(f, null) && searchOk(f);
  const SORTS = {
    latest: (a, b) => b.latest_cleared.localeCompare(a.latest_cleared) || a.product_name.localeCompare(b.product_name),
    first: (a, b) => a.first_cleared.localeCompare(b.first_cleared),
    name: (a, b) => a.product_name.localeCompare(b.product_name),
    company: (a, b) => companyShort(a.company).localeCompare(companyShort(b.company)) || a.product_name.localeCompare(b.product_name),
    metrics: (a, b) => b.n_fda_claims - a.n_fda_claims || b.n_performance_claims - a.n_performance_claims || b.latest_cleared.localeCompare(a.latest_cleared),
    papers: (a, b) => b.n_papers_resolved - a.n_papers_resolved || b.n_papers - a.n_papers || b.latest_cleared.localeCompare(a.latest_cleared),
  };

  function render() {
    const visible = fams.filter(matches).sort(SORTS[state.sort] || SORTS.latest);
    renderFilters();
    renderActiveFilters();
    const nSel = Object.values(state.sel).reduce((n, s) => n + s.size, 0);
    $('#count').textContent = `${nSel || state.q ? `${visible.length} of ${fams.length}` : fams.length} AI products${nSel ? ` · ${nSel} filter${nSel > 1 ? 's' : ''}` : ''}${state.q ? ` · “${state.q}”` : ''}`;
    if (state.view === 'cards') { $('#cards').hidden = false; $('#table').hidden = true; renderCards(visible); }
    else { $('#cards').hidden = true; $('#table').hidden = false; renderTable(visible); }
  }

  const shortName = (n) => (n.length > 60 ? n.replace(/\s*\([^)]*\)\s*$/, '') : n);
  function chips(f) {
    const out = [];
    if (f.research_pending) out.push('<span class="chip muted">Research pending</span>');
    if (f.n_fda_claims) out.push(`<span class="chip on">${f.n_fda_claims} FDA summary metric${f.n_fda_claims > 1 ? 's' : ''}</span>`);
    if (f.n_other_claims) out.push(`<span class="chip">${f.n_other_claims} published/company metric${f.n_other_claims > 1 ? 's' : ''}</span>`);
    if (f.n_papers) out.push(`<span class="chip on">${f.n_papers_resolved}/${f.n_papers} paper${f.n_papers > 1 ? 's' : ''} resolved</span>`);
    if (f.training_data && f.training_data.disclosed) out.push('<span class="chip on">Training n disclosed</span>');
    if (f.pathways.some((p) => /PCCP/.test(p))) out.push('<span class="chip flag">PCCP</span>');
    if (f.pathways.includes('De Novo')) out.push('<span class="chip flag">De Novo</span>');
    const seenChip = new Set();
    for (const m of f.modes || []) { seenChip.add(m.toLowerCase()); out.push(`<span class="chip mode">${esc(m)}</span>`); }
    for (const t of f.tags || []) {
      const v = String(t || '').trim(); if (!v || seenChip.has(v.toLowerCase())) continue;
      seenChip.add(v.toLowerCase()); out.push(`<span class="chip">${esc(v)}</span>`);
      if (out.length >= 8) break;
    }
    return out.join('');
  }
  function renderCards(list) {
    const host = $('#cards');
    if (!list.length) { host.innerHTML = '<p class="empty">No AI products match.</p>'; return; }
    host.innerHTML = list.map((f) => `
      <article class="card" data-id="${esc(f.id)}">
        <div class="card-top"><h3><button type="button" data-open="${esc(f.id)}" title="${esc(f.product_name)}">${esc(shortName(f.product_name))}</button></h3><span class="cat ${f.research_pending ? 'pending' : ''}">${f.research_pending ? 'Research pending' : esc(CAT[f.category] || f.category)}</span></div>
        <p class="co">${esc(f.company)}</p>
        ${f.summary ? `<p class="sum">${esc(f.summary)}</p>` : ''}
        <div class="meta">
          <div>Latest clearance<b class="num">${fmtDate(f.latest_cleared)}</b></div>
          <div>Clearances<b class="num">${f.n_clearances} · ${esc(f.pathways.join(', '))}</b></div>
          <div>First cleared<b class="num">${f.first_cleared.slice(0, 4)}</b></div>
          <div>Product code<b>${esc(f.product_codes.join(', '))}</b></div>
        </div>
        <div class="chips">${chips(f)}</div>
      </article>`).join('');
  }
  function trainingCell(d) {
    if (!d || !d.disclosed) return 'Not disclosed';
    const n = d.n_studies != null ? `${fmtN(d.n_studies)} studies` : d.n_patients != null ? `${fmtN(d.n_patients)} patients` : 'described';
    return `${n} ${vl(d.verification)}`;
  }
  function renderTable(list) {
    const host = $('#table');
    if (!list.length) { host.innerHTML = '<p class="empty">No AI products match.</p>'; return; }
    host.innerHTML = `<table><thead><tr><th>AI product</th><th>Company</th><th>Function</th><th>Latest clearance</th><th class="r">Clearances</th><th>Pathway</th><th>Code</th><th class="r">FDA summary metrics</th><th class="r">Papers</th><th>Training set</th></tr></thead><tbody>${list.map((f) => `
      <tr><td><button class="link" type="button" data-open="${esc(f.id)}" title="${esc(f.product_name)}">${esc(shortName(f.product_name))}</button></td><td>${esc(companyShort(f.company))}</td><td>${f.research_pending ? 'Research pending' : esc(CAT[f.category] || f.category)}</td><td class="num">${fmtDate(f.latest_cleared)}</td><td class="r num">${f.n_clearances}</td><td>${esc(f.pathways.join(', '))}</td><td>${esc(f.product_codes.join(', '))}</td><td class="r num">${f.n_fda_claims}</td><td class="r num">${f.n_papers_resolved}/${f.n_papers}</td><td class="num">${trainingCell(f.training_data)}</td></tr>`).join('')}</tbody></table>`;
  }

  // ---------- detail panel ----------
  const INERT = () => [$('#main'), $('.masthead'), $('.site-footer')].filter(Boolean);
  function openPanel(id, push) {
    const f = byId.get(id); if (!f) { closePanelQuiet(); return; }
    state.opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    $('#panel-body').innerHTML = panelHTML(f);
    $('#panel').hidden = false; $('#panel-backdrop').hidden = false; document.body.style.overflow = 'hidden';
    for (const el of INERT()) el.inert = true;
    $('#panel').scrollTop = 0; $('#panel-close').focus();
    if (push !== false) history.replaceState(null, '', `#product/${encodeURIComponent(id)}`);
  }
  function closePanel() {
    closePanelQuiet();
    if (/^#product\//.test(location.hash)) history.replaceState(null, '', '#products');
    if (state.opener && document.contains(state.opener)) state.opener.focus();
  }
  function claimRow(c) {
    const fda = vkey(c.verification) === 'fda_summary';
    const src = fda ? `${esc(c.k_number)}${c.page ? ` p.${c.page}` : ''}` : '';
    return `<tr><td>${esc(c.endpoint)}</td><td><b>${esc(c.value)}</b><br><span class="notice">${esc(c.metric)}</span></td><td>${esc(c.comparator || '—')}</td><td class="num">${[c.n_studies != null ? `${fmtN(c.n_studies)} studies` : '', c.n_patients != null ? `${fmtN(c.n_patients)} patients` : '', c.n_sites != null ? `${c.n_sites} sites` : ''].filter(Boolean).join('<br>') || '—'}</td><td>${src ? src + '<br>' : ''}${vl(c.verification)}${c.quote ? `<details><summary class="quote-toggle">quote</summary><blockquote class="q">${esc(c.quote)}</blockquote>${c.dataset_description ? `<p class="notice">${esc(c.dataset_description)}</p>` : ''}${c.subgroup_notes ? `<p class="notice">${esc(c.subgroup_notes)}</p>` : ''}</details>` : ''}</td></tr>`;
  }
  function dataBlock(label, d, extra) {
    if (!d) return '';
    const n = [d.n_studies != null ? `${fmtN(d.n_studies)} studies` : '', d.n_patients != null ? `${fmtN(d.n_patients)} patients` : '', d.n_sites != null ? `${d.n_sites} sites` : ''].filter(Boolean).join(' · ');
    return `<dt>${esc(label)}</dt><dd>${n || 'Not disclosed'}${extra || ''}${d.description ? `<br><span class="notice">${esc(d.description)}</span>` : ''}${d.source ? `<br><span class="notice">${linkify(d.source)}</span>` : ''} ${vl(d.verification)}</dd>`;
  }
  const linkify = (s) => (/^https?:\/\//.test(s) ? `<a href="${esc(s)}" rel="noopener">${esc(s.replace(/^https?:\/\//, '').slice(0, 60))}</a>` : esc(s));
  function panelChips(f) {
    const seen = new Set(); const out = [];
    const add = (v, cls) => { const k = String(v || '').trim().toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push(`<span class="chip ${cls}">${esc(String(v).trim())}</span>`); };
    for (const m of f.modes || []) add(m, 'mode');
    for (const m of f.modality_scope || []) add(m, '');
    for (const d of f.deployment || []) add(d, '');
    for (const t of (f.tags || []).slice(0, 10)) add(t, 'on');
    return out.join('');
  }
  function panelHTML(f) {
    const latest = f.clearances[f.clearances.length - 1];
    const links = [
      f.product_url ? `<a href="${esc(f.product_url)}" rel="noopener">Product page</a>` : '',
      f.company_website ? `<a href="${esc(f.company_website)}" rel="noopener">Company</a>` : '',
      `<a href="${esc(latest.fda_summary_url)}" rel="noopener">FDA summary (${esc(latest.k_number)})</a>`,
      `<a href="${esc(latest.fda_database_url)}" rel="noopener">FDA database</a>`,
    ].filter(Boolean).join('');
    const feats = (f.embedded_ai_features || []).filter((e) => e && e.name && e.name.trim());
    return `
      <div class="panel-head">
        <span class="cat ${f.research_pending ? 'pending' : ''}" style="justify-self:start">${f.research_pending ? 'Research pending' : esc(CAT[f.category] || f.category)}</span>
        <h2 id="panel-title">${esc(f.product_name)}</h2>
        <p class="co">${esc(f.company)}</p>
        <div class="panel-links">${links}</div>
        <div class="chips">${panelChips(f)}</div>
        ${f.summary ? `<p>${esc(f.summary)}</p>` : ''}
        
      </div>
      ${f.indications_for_use_quote || f.intended_use_quote ? `<section class="psec"><h3>Indications for use <small>FDA summary</small></h3><blockquote class="q">${esc(f.indications_for_use_quote || f.intended_use_quote)}</blockquote></section>` : ''}
      ${feats.length ? `<section class="psec"><h3>Cardiac AI features in these clearances</h3><ul class="papers">${feats.map((e) => `<li><span class="t">${esc(e.name)}</span><span>${esc(e.function)}</span><span class="m">${e.first_k_number ? `First in ${esc(e.first_k_number)}${byId.has(f.id) && !f.clearances.some((c) => c.k_number === e.first_k_number) ? ' (predicate, not in this catalog)' : ''} · ` : ''}${e.quote ? `“${esc(e.quote)}”` : ''}</span></li>`).join('')}</ul></section>` : ''}
      <section class="psec"><h3>Clearance history <small>${f.n_clearances} submission${f.n_clearances > 1 ? 's' : ''} · openFDA</small></h3>
        <ol class="timeline">${f.clearances.map((c) => `<li><span class="d num">${fmtDate(c.decision_date)}</span><span><span class="k"><a href="${esc(c.fda_summary_url)}" rel="noopener">${esc(c.k_number)}</a></span> · ${esc(c.pathway)} · ${esc(c.product_code)}${c.notable_flags && c.notable_flags.length ? ` · ${c.notable_flags.map((x) => `<span class="chip">${esc(x)}</span>`).join(' ')}` : ''}<br><span class="what">${esc(c.device_name_fda)}${c.changes_summary ? ` — ${esc(c.changes_summary)}` : ''}${c.predicates && c.predicates.length ? `<br>Predicates: ${c.predicates.map(esc).join(', ')}` : ''}</span></span></li>`).join('')}</ol>
      </section>
      <section class="psec"><h3>Performance evidence <small>${(f.performance_claims || []).length ? `${f.n_fda_claims} from the FDA summary${f.n_other_claims ? `, ${f.n_other_claims} from publications or the company` : ''}` : 'none extracted'}</small></h3>
        ${(f.performance_claims || []).length ? `<div class="table-wrap"><table class="claims"><thead><tr><th>Endpoint</th><th>Result</th><th>Reference</th><th>n</th><th>Source</th></tr></thead><tbody>${f.performance_claims.map(claimRow).join('')}</tbody></table></div>` : `<p class="notice">No results reported in the FDA summary.</p>`}
      </section>
      <section class="psec"><h3>Training and validation data</h3>
        <dl class="kv">${dataBlock('Training set', f.training_data)}${dataBlock('Validation / test set', f.validation_data, f.validation_data && f.validation_data.independent_of_training === true ? '<br><span class="notice">Independent of the training data</span>' : '')}</dl>
      </section>
      ${(f.prior_validations || []).length ? `<section class="psec"><h3>Prior validations</h3><ul class="papers">${f.prior_validations.map((p) => `<li><span>${esc(p.description)}</span><span class="m">${p.source_url ? linkify(p.source_url) + ' · ' : ''}${vl(p.verification)}</span></li>`).join('')}</ul></section>` : ''}
      <section class="psec"><h3>Publications <small>${f.n_papers ? `${f.n_papers_resolved} of ${f.n_papers} resolved` : 'none found'}</small></h3>
        ${f.n_papers ? `<ol class="papers">${f.papers.map((p) => `<li><span class="t">${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" rel="noopener">${esc(p.title)}</a>` : p.url ? `<a href="${esc(p.url)}" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}</span><span class="m">${[p.first_author ? esc(p.first_author) + ' et al.' : '', p.journal ? esc(p.journal) : '', p.year || ''].filter(Boolean).join(' · ')}${p.pmid ? ` · <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" rel="noopener">PMID ${esc(p.pmid)}</a>` : ''} · <span class="chip">${esc(p.relation)}</span> ${vl(p.verification)}</span>${p.key_result ? `<span>${esc(p.key_result)}${p.n_subjects ? ` (n = ${fmtN(p.n_subjects)})` : ''}</span>` : ''}</li>`).join('')}</ol>` : '<p class="notice">None found.</p>'}
      </section>
      ${(f.clinical_trials || []).length ? `<section class="psec"><h3>Registered trials</h3><ul class="papers">${f.clinical_trials.map((t) => `<li><span class="t"><a href="${esc(t.url)}" rel="noopener">${esc(t.nct_id)}</a> ${esc(t.title)}</span><span class="m">${esc(t.status || '')}</span></li>`).join('')}</ul></section>` : ''}
      ${(f.open_questions || []).length ? `<section class="psec"><h3>Open questions</h3><ul class="oq">${f.open_questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></section>` : ''}
      ${(f.sources || []).length ? `<section class="psec"><details><summary class="quote-toggle">Sources (${f.sources.length})</summary><ul class="oq">${f.sources.map((s) => `<li>${esc(s.fact)} — ${linkify(s.url_or_file)} ${vl(s.verification)}</li>`).join('')}</ul></details></section>` : ''}
`;
  }

  // ---------- registry tab ----------
  const sims = R.products || [];
  const TOP_N = 10;
  function tip(html, x, y) { const t = $('#tooltip'); t.innerHTML = html; t.hidden = false; const w = t.offsetWidth, h = t.offsetHeight; t.style.left = Math.min(x + 14, window.innerWidth - w - 8) + 'px'; t.style.top = Math.max(8, y - h - 12) + 'px'; }
  function hideTip() { $('#tooltip').hidden = true; }

  function chartWidth(wide) {
    const host = $('#reg-charts'); const cw = host ? host.clientWidth : 0;
    const w = wide ? cw : (cw > 900 ? (cw - 20) / 2 : cw);
    return Math.max(360, Math.min(wide ? 1100 : 640, Math.round(w || (wide ? 1100 : 640))));
  }
  function dotRangeChart(rows, o) {
    // rows: [{id,label,value,low,high,n}]; one scale, direct labels, ranges + dots, hover, keyboard focus, click-to-select
    if (!rows.length) return '<p class="not-evaluable">No products of this type.</p>';
    const W = chartWidth(o.wide), narrow = W < 520, L = Math.round(W * (narrow ? 0.4 : 0.3)), Rr = 56, rowH = narrow ? 30 : 26, top = 22, H = top + rows.length * rowH + 28;
    const vals = rows.flatMap((r) => [r.low, r.high]);
    let [dmin, dmax] = o.domain || [Math.min(...vals), Math.max(...vals)];
    const pad = (dmax - dmin) * 0.08 || 1; if (!o.domain) { dmin -= pad; dmax += pad; }
    const x = (v) => L + ((v - dmin) / (dmax - dmin)) * (W - L - Rr);
    const ticks = niceTicks(dmin, dmax, 5);
    const fmt = (v) => (o.decimals != null ? v.toFixed(o.decimals) : String(v));
    return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(o.aria)}">
      <g class="grid">${ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${H - 24}"/>`).join('')}</g>
      <g class="axis">${ticks.map((t) => `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${fmt(t)}${o.unit ? ' ' + esc(o.unit) : ''}</text>`).join('')}</g>
      ${o.refLine != null && o.refLine >= dmin && o.refLine <= dmax ? `<line class="ref" x1="${x(o.refLine)}" x2="${x(o.refLine)}" y1="${top - 6}" y2="${H - 24}"/>` : ''}
      ${rows.map((r, i) => { const y = top + i * rowH + rowH / 2; const sel = r.id === state.regSel; const label = `${r.label}: ${fmt(r.value)}${o.unit ? ' ' + o.unit : ''}, 95% CI ${fmt(r.low)} to ${fmt(r.high)}, ${fmtN(r.n)} TTEs`; return `<g class="row ${sel ? 'sel' : ''}" data-id="${esc(r.id)}" tabindex="0" role="button" aria-label="${esc(label)}" data-tip="${esc(`<b>${esc(r.label)}</b>${fmt(r.value)}${o.unit ? ' ' + esc(o.unit) : ''} (95% CI ${fmt(r.low)} to ${fmt(r.high)})<br>${fmtN(r.n)} TTEs · ${esc(r.company)}`)}">
        <rect class="hit" x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}" rx="3"/>
        <text class="lab ${sel ? 'sel' : ''}" x="${L - 10}" y="${y + 4}" text-anchor="end">${esc(truncate(r.label, narrow ? 22 : o.wide ? 42 : 30))}</text>
        <line class="range" x1="${x(r.low)}" x2="${x(r.high)}" y1="${y}" y2="${y}"/>
        <circle class="dot" cx="${x(r.value)}" cy="${y}" r="5"/>
        <text class="num" x="${W - Rr + 10}" y="${y + 4}">${fmt(r.value)}</text>
      </g>`; }).join('')}
    </svg>`;
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function niceTicks(min, max, n) {
    const span = max - min, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const out = []; for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(Number(t.toFixed(6)));
    return out;
  }

  function renderRegistry() {
    if (!PLACEHOLDER) { const b = $('.placeholder-banner'); if (b) b.hidden = true; for (const t of $$('.placeholder-tag')) t.remove(); }
    const kp = $('#reg-kpis');
    // Scores from different frozen extracts are not directly comparable, so the reader can pin the
    // charts to a single extract instead of only being warned that they are pooled.
    const shown = state.regExtract === 'all' ? sims : sims.filter((e) => (e.dataset || {}).id === state.regExtract);
    const nStudies = shown.reduce((n, e) => n + e.cohort.n_studies, 0);
    const sites = new Set(shown.flatMap((e) => e.cohort.sites)).size;
    const usedExtracts = [...new Set(shown.map((e) => (e.dataset || {}).label).filter(Boolean))];
    const nExtracts = usedExtracts.length;
    const lastRun = shown.map((e) => (e.analysis || {}).run_date).filter(Boolean).sort().pop();
    kp.innerHTML = [
      [shown.length, `of ${R.n_catalog_products || sims.length} AI products scored`], [fmtN(nStudies), 'TTEs simulated'], [sites, 'registry sites'],
      [nExtracts ? `${nExtracts} extract${nExtracts > 1 ? 's' : ''}` : '—', lastRun ? `latest analysis ${lastRun}` : 'registry extracts used'],
    ].map(([v, l]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}${ptag()}</div></div>`).join('');

    const fam = (id) => byId.get(id) || { product_name: id, company: '' };
    const mk = (type, epId) => shown.filter((e) => type.includes(e.evaluation_type)).map((e) => { const ep = e.endpoints.find((x) => x.id === epId); return ep ? { id: e.id, label: e.label, company: '', value: ep.value, low: ep.ci.low, high: ep.ci.high, n: e.cohort.n_studies } : null; }).filter(Boolean);
    // Charts show the leading TOP_N only; the subtitle always states how many were left out.
    const cap = (rows) => rows.slice(0, TOP_N);
    const capNote = (rows) => (rows.length > TOP_N ? ` Top ${TOP_N} of ${rows.length}.` : '');
    // Products are scored against different frozen extracts, so a chart that ranks them across extracts
    // has to say so rather than implying one common denominator.
    const mixNote = nExtracts > 1 ? ` Pooled across ${nExtracts} registry extracts (${esc(usedExtracts.sort().join(', '))}); open a product for the one it used.` : '';
    const lv = mk(['lvef', 'comprehensive'], 'lvef_mae').sort((a, b) => a.value - b.value);
    const det = mk(['detection', 'hfpef', 'amyloid'], 'auc').sort((a, b) => b.value - a.value);
    const acq = mk(['acquisition'], 'diag_quality').sort((a, b) => b.value - a.value);
    const strain = mk(['strain'], 'gls_icc').sort((a, b) => b.value - a.value);
    const qual = mk(['quality'], 'kappa').sort((a, b) => b.value - a.value);
    $('#reg-charts').innerHTML = `
      <section class="chart-block wide"><h2>LVEF agreement with the registry report</h2><p class="chart-sub">Mean absolute error vs reported LVEF, in EF points. Lower is better. Dot = estimate, bar = 95% CI.${capNote(lv)}${mixNote}</p>${dotRangeChart(cap(lv), { unit: '', decimals: 1, wide: true, aria: 'LVEF mean absolute error by product', domain: [0, Math.max(10, ...cap(lv).map((r) => r.high)) * 1.05] })}</section>
      <section class="chart-block"><h2>Detection: area under the ROC curve</h2><p class="chart-sub">Severe aortic stenosis, HFpEF, or cardiac amyloidosis vs the registry reference, higher is better.${capNote(det)}${mixNote}</p>${dotRangeChart(cap(det), { unit: '', decimals: 2, aria: 'AUC by product', domain: [0.5, 1], refLine: 0.5 })}</section>
      <section class="chart-block"><h2>Acquisition guidance: diagnostic-quality studies</h2><p class="chart-sub">Share of guided acquisitions graded diagnostic by the reading physician.${capNote(acq)}${mixNote}</p>${dotRangeChart(cap(acq), { unit: '%', decimals: 1, aria: 'Diagnostic quality by product', domain: [50, 100] })}</section>
      ${strain.length ? `<section class="chart-block"><h2>Strain: ICC vs reported GLS</h2><p class="chart-sub">Where the registry report contains GLS.${capNote(strain)}</p>${dotRangeChart(cap(strain), { unit: '', decimals: 2, aria: 'GLS ICC by product', domain: [0.5, 1] })}</section>` : ''}
      ${qual.length ? `<section class="chart-block"><h2>Image quality: agreement with the sonographer grade</h2><p class="chart-sub">Cohen’s κ vs the registry image-quality field, higher is better.${capNote(qual)}</p>${dotRangeChart(cap(qual), { unit: '', decimals: 2, aria: 'Image-quality kappa by product', domain: [0, 1] })}</section>` : ''}`;

    const ex = $('#reg-extract');
    if (ex) {
      const counts = new Map();
      for (const e of sims) { const d = e.dataset || {}; if (d.id) counts.set(d.id, (counts.get(d.id) || 0) + 1); }
      const list = (R.extracts || []).filter((x) => counts.has(x.id));
      ex.innerHTML = `<option value="all">All extracts (${sims.length} products)</option>` +
        list.map((x) => `<option value="${esc(x.id)}">${esc(x.label)} · ${counts.get(x.id)} products</option>`).join('');
      if (state.regExtract !== 'all' && !counts.has(state.regExtract)) state.regExtract = 'all';
      ex.value = state.regExtract;
      const cur = list.find((x) => x.id === state.regExtract);
      $('#reg-extract-note').textContent = cur
        ? `Extract taken ${cur.extract_date} · studies ${cur.study_period} · ${fmtN(cur.n_registry_studies)} studies in the extract`
        : 'Charts pool products scored against different extracts. Pick one extract to compare like for like.';
    }

    const sel = $('#reg-select');
    sel.innerHTML = shown.map((e) => `<option value="${esc(e.id)}">${esc(e.label)}</option>`).join('');
    if (!state.regSel || !shown.some((e) => e.id === state.regSel)) state.regSel = lv.length ? lv[0].id : (shown[0] ? shown[0].id : null);
    if (state.regSel) sel.value = state.regSel;
    renderRegDetail();
    $('#reg-facts').innerHTML = (R.registry.facts || []).map((f) => `<div class="fact"><b class="num">${esc(f.value)}</b>${esc(f.label)}<br><a href="${esc(f.source)}" rel="noopener">source</a></div>`).join('');
    $('#reg-phase').textContent = R.registry.phase_note || '';
    $('#reg-metrics').innerHTML = (R.registry.quality_metrics || []).map((m) => `<li>${esc(m)}</li>`).join('');
    $('#reg-domains').innerHTML = (R.registry.data_domains || []).map((m) => `<li>${esc(m)}</li>`).join('');
  }
  function heatColor(v, mn, mx, better) {
    // sequential single hue; darker = better outcome so the eye reads "more" as "stronger"
    let t = mx === mn ? 0.5 : (v - mn) / (mx - mn); if (better === 'lower') t = 1 - t; if (better === 'zero') t = 1 - Math.min(1, Math.abs(v) / Math.max(Math.abs(mn), Math.abs(mx), 1e-9));
    const step = 1 + Math.round(t * 6); return { step, hi: step >= 5 };
  }
  const EVAL_LABEL = { lvef: 'LV function', comprehensive: 'Multi-parameter measurement', strain: 'Strain', detection: 'Disease detection', hfpef: 'Heart failure indicator', amyloid: 'Cardiac amyloidosis indicator', acquisition: 'Acquisition guidance', quality: 'Image quality' };
  function renderRegDetail() {
    const host = $('#reg-detail'); const e = sims.find((x) => x.id === state.regSel);
    if (!e) { host.innerHTML = ''; return; }

    const primary = e.endpoints.find((x) => x.id === e.primary_endpoint_id);
    // Which dataset, and when. An evaluation is one analysis of a frozen extract, so the extract and the
    // run date are part of the result, not metadata to bury.
    const D = e.dataset || {}, A = e.analysis || {};
    const ds = `<h3>Dataset and analysis</h3>
      <dl class="kv prov">
        <dt>Dataset</dt><dd>${esc(D.label || '—')}</dd>
        <dt>Extract taken</dt><dd class="num">${esc(D.extract_date || '—')}</dd>
        <dt>Study dates</dt><dd class="num">${esc(D.study_period || '—')}</dd>
        <dt>Analysis</dt><dd>${esc(A.type || '—')}${A.protocol_version ? ` · protocol ${esc(A.protocol_version)}` : ''}</dd>
        <dt>Analysis run</dt><dd class="num">${esc(A.run_date || '—')}</dd>
        <dt>Scored cohort</dt><dd class="num">${fmtN(e.cohort.n_studies)} of ${fmtN(D.n_registry_studies)} studies in the extract · ${e.cohort.n_sites} sites</dd>
        <dt>Inclusion</dt><dd class="notice">${esc(D.inclusion || '—')}</dd>
      </dl>
      <p class="notice">${esc(A.note || '')}</p>`;
    const dims = [...new Set(e.subgroups.map((s) => s.dimension))];
    const vals = e.subgroups.map((s) => s.value); const mn = Math.min(...vals), mx = Math.max(...vals);
    host.innerHTML = `
      <div class="reg-detail-grid">
        <div class="chart-block"><h3>${esc(e.label)} <span class="notice">${esc(EVAL_LABEL[e.evaluation_type] || e.evaluation_type)}</span></h3>
          <dl class="kv"><dt>Module</dt><dd>${esc(e.cohort.module)}</dd><dt>Cohort</dt><dd class="num">${fmtN(e.cohort.n_studies)} TTEs · ${e.cohort.n_sites} sites</dd><dt>Dataset</dt><dd>${esc((e.dataset || {}).label || '—')}</dd><dt>Vendors</dt><dd>${e.cohort.vendors.map(esc).join(', ')}</dd></dl>
          <div class="table-wrap"><table class="endpoints"><thead><tr><th>Endpoint</th><th>Estimate (95% CI)</th><th>Reference</th></tr></thead><tbody>${e.endpoints.map((ep) => `<tr><td>${esc(ep.label)}${ep.primary ? ' <span class="chip on">primary</span>' : ''}</td><td class="num"><b>${ep.value}${ep.unit ? ' ' + esc(ep.unit) : ''}</b> <span class="notice">(${ep.ci.low} to ${ep.ci.high})</span></td><td class="notice">${esc(ep.reference)}</td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="chart-block">
          ${ds}
          ${primary && e.subgroups.length ? `<h3>${esc(primary.label)} by subgroup</h3><p class="chart-sub">Darker = better.</p><div class="heat">${dims.map((d) => { const rows = e.subgroups.filter((s) => s.dimension === d); return `<div class="heat-row"><div class="heat-dim">${esc(d)}</div><div class="heat-cells">${rows.map((s) => { const c = heatColor(s.value, mn, mx, primary.direction); return `<div class="cell ${c.hi ? 'hi' : ''}" style="background:var(--seq-${c.step})" tabindex="0" aria-label="${esc(`${d} ${s.level}: ${s.value}${primary.unit ? ' ' + primary.unit : ''}, n = ${fmtN(s.n)}`)}" data-tip="${esc(`<b>${esc(d)}: ${esc(s.level)}</b>${s.value}${primary.unit ? ' ' + esc(primary.unit) : ''} · n = ${fmtN(s.n)}`)}"><span class="lv">${esc(s.level)}</span><b>${s.value}</b></div>`; }).join('')}</div></div>`; }).join('')}</div>` : ''}
        </div>
      </div>`;
  }

  // ---------- site quality tab ----------
  const Q = R.quality || { metrics: [], sites: [], months: [], quarters: [] };
  const QM = Q.metrics || [], QS = Q.sites || [];
  // Diverging band -> ramp token. Negative = worse than benchmark, 0 = within 1%, positive = better.
  const DV = { '-4': 'w4', '-3': 'w3', '-2': 'w2', '-1': 'w1', 0: '0', 1: 'b1', 2: 'b2', 3: 'b3', 4: 'b4' };
  const dvHi = (b) => Math.abs(b) >= 3;
  const dvStyle = (b) => `background:var(--dv-${DV[b]})`;
  const BAND_LABEL = { 0: 'within 1% of benchmark', 1: '1–10%', 2: '10–25%', 3: '25–50%', 4: '≥ 50%' };
  const qcVal = (v, unit) => `${v}${unit === '%' ? '%' : unit === 'h' ? ' h' : ''}`;

  function qcBenchmark(m) { return state.qcBench === 'median' ? m.median : m.benchmark; }
  // Recompute the band whenever the benchmark source changes, using the same thresholds the
  // generator uses, so switching between target and median re-colours the whole page consistently.
  function qcBand(value, m) {
    const b = qcBenchmark(m); if (!b || value == null) return 0;
    const rel = (value - b) / Math.abs(b), better = m.direction === 'lower' ? -rel : rel, a = Math.abs(better) * 100;
    const step = a < 1 ? 0 : a < 10 ? 1 : a < 25 ? 2 : a < 50 ? 3 : 4;
    return step === 0 ? 0 : (better > 0 ? step : -step);
  }
  // A neutral metric has no better side. It is painted on a one-hue distance ramp so the page never
  // implies that more AI use, or more acceptance, is an improvement.
  const isNeutral = (m) => m.direction === 'neutral';
  function qcDistance(value, m) {
    const b = qcBenchmark(m); if (!b || value == null) return 0;
    const a = Math.abs((value - b) / Math.abs(b)) * 100;
    return a < 1 ? 0 : a < 10 ? 1 : a < 25 ? 2 : a < 50 ? 3 : 4;
  }
  // Neutral metrics use a hueless grey distance scale, never the diverging ramp: a far-from-reference
  // AI tile must not look like a strongly-better quality tile. Each step carries its own ink per theme,
  // so the class does the work rather than a shared "hi" flag.
  function cellStyle(value, m) {
    if (value == null) return { cls: '', style: 'background:var(--bg-2)', hi: false };
    if (isNeutral(m)) return { cls: `nd nd${qcDistance(value, m)}`, style: '', hi: false };
    const b = qcBand(value, m); return { cls: '', style: dvStyle(b), hi: dvHi(b) };
  }
  const compOf = (m) => (isNeutral(m) ? 'ref' : m.direction === 'lower' ? '\u2264' : '\u2265');
  function qcRel(value, m) { const b = qcBenchmark(m); if (!b) return 0; const rel = (value - b) / Math.abs(b); return Math.round((m.direction === 'lower' ? -rel : rel) * 1000) / 10; }

  const qcMetrics = () => QM.filter((m) => state.qcMetrics.has(m.id));
  const qcSites = () => QS.filter((s) => state.qcSites.has(s.id));
  function qcIntervals() {
    const all = state.qcInterval === 'month' ? (Q.months || []) : (Q.quarters || []);
    const a = all.indexOf(state.qcFrom), b = all.indexOf(state.qcTo);
    return all.slice(a < 0 ? 0 : a, (b < 0 ? all.length : b + 1));
  }
  // Monthly rows roll up to a quarter by weighting each month by its own denominator, so a quarter
  // is the real pooled rate and not an average of rates.
  function qcSeries(rows, metric) {
    const byKey = new Map();
    for (const mo of rows) {
      // A month a site did not submit contributes nothing, rather than a zero that would divide out.
      if (mo.value == null || !mo.d) continue;
      const key = state.qcInterval === 'month' ? mo.month : `${mo.month.slice(0, 4)}-Q${Math.ceil(Number(mo.month.slice(5, 7)) / 3)}`;
      const cur = byKey.get(key) || { key, d: 0, n: 0, sum: 0 };
      cur.d += mo.d; cur.n += mo.n || 0; cur.sum += mo.value * mo.d; byKey.set(key, cur);
    }
    const keep = new Set(qcIntervals());
    return [...byKey.values()].filter((c) => keep.has(c.key) && c.d > 0).map((c) => ({ key: c.key, d: c.d, n: metric.unit === '%' ? c.n : null, value: Math.round((c.sum / c.d) * 10) / 10 }));
  }
  // Pool a percentage from summed numerators, not by averaging rates, so the accepted, edited and
  // rejected shares still close at 100% in a quarter, a period total and the registry roll-up.
  const qcTotal = (cells, metric) => {
    const live = (cells || []).filter((c) => c && c.value != null && c.d > 0);
    const d = live.reduce((n, c) => n + c.d, 0); if (!d) return null;
    const n = live.reduce((t, c) => t + (c.n || 0), 0);
    const value = metric.unit === '%' && n ? (100 * n) / d : live.reduce((t, c) => t + c.value * c.d, 0) / d;
    return { d, n: metric.unit === '%' ? n : null, value: Math.round(value * 10) / 10 };
  };
  // A site's value over the selected date range only, so narrowing the range moves the numbers.
  function qcSiteValue(site, m) { const mv = site.metrics.find((x) => x.id === m.id); return qcTotal(qcSeries(mv.monthly, m), m); }

  function qcCell(v, m, extra, cls) {
    if (!v || v.value == null) {
      // A site that cannot export the underlying data reads as not submitted, never as zero, which
      // would be indistinguishable from a lab that uses no AI at all.
      const tip = `<b>${esc(extra || m.short)}</b>Not submitted. This site does not export the data this metric needs.`;
      return `<td class="${cls || ''}"><span class="qc-cell na" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(`${extra || m.short}: not submitted`)}">n/a</span></td>`;
    }
    const rel = qcRel(v.value, m), c = cellStyle(v.value, m);
    const nd = state.qcND && v.d ? `<span class="nd">${v.n == null ? '' : fmtN(v.n) + ' / '}${fmtN(v.d)}</span>` : '';
    const ref = isNeutral(m) ? 'reference' : 'benchmark';
    const pre = m.status === 'proposed' ? 'Proposed metric, not one of the registry’s nine live metrics. ' : '';
    const tip = `<b>${esc(extra || m.short)}</b>${pre}${qcVal(v.value, m.unit)} · ${ref} ${qcVal(qcBenchmark(m), m.unit)} · ${rel >= 0 ? '+' : ''}${rel}%${v.d ? ` · D = ${fmtN(v.d)}` : ''}`;
    return `<td class="${cls || ''}"><span class="qc-cell ${c.cls} ${c.hi ? 'hi' : ''}" style="${c.style}" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(`${extra || m.short}: ${qcVal(v.value, m.unit)}, ${rel >= 0 ? '+' : ''}${rel}% vs ${ref}`)}">${v.value}${nd}</span></td>`;
  }
  function qcKey(metrics) {
    const cells = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((b) => `<span class="k"><i class="sw" style="${dvStyle(b)}"></i>${esc(b === 0 ? '0–1%' : BAND_LABEL[Math.abs(b)])}</span>`).join('');
    let out = `<div class="qc-key"><span class="end">Worse</span>${cells}<span class="end">Better</span></div>`;
    if ((metrics || []).some(isNeutral)) {
      const d = [0, 1, 2, 3, 4].map((i) => `<span class="k"><i class="sw nd nd${i}"></i>${esc(i === 0 ? '0–1%' : BAND_LABEL[i])}</span>`).join('');
      out += `<div class="qc-key"><span class="end">At reference</span>${d}<span class="end">Far from reference</span><span class="key-note">proposed metrics · no better or worse side</span></div>`;
    }
    return out;
  }
  function qcSectionRows(metrics, cols, cell) {
    let sect = '', out = '';
    for (const m of metrics) {
      if (m.section !== sect) { sect = m.section; out += `<tr class="sect${m.status === 'proposed' ? ' proposed' : ''}"><th colspan="${cols + 1}">${esc(sect)}${m.status === 'proposed' ? '<span class="chip-proposed">Proposed</span>' : ''}</th></tr>`; }
      out += cell(m);
    }
    return out;
  }

  function renderQuality() {
    if (!QM.length) return;
    const ms = qcMetrics(), sites = qcSites(), ivs = qcIntervals();
    $('#qc-params-sum').textContent = `${ms.length} of ${QM.length} metrics · ${sites.length} of ${QS.length} sites · ${ivs.length} ${state.qcInterval === 'month' ? 'months' : 'quarters'} · benchmark: ${state.qcBench === 'median' ? 'registry median' : 'registry target'}`;

    // KPIs across the current selection
    const totals = ms.map((m) => ({ m, v: qcTotal(sites.map((s) => qcSiteValue(s, m)).filter(Boolean), m) })).filter((x) => x.v);
    // Only live metrics have a below: a neutral metric has no worse side.
    const scoredTotals = totals.filter((x) => !isNeutral(x.m));
    const nBelow = scoredTotals.filter((x) => qcBand(x.v.value, x.m) < 0).length;
    const studies = sites.reduce((n, s) => n + s.n_studies, 0);
    $('#qc-kpis').innerHTML = [
      [fmtN(sites.length), 'sites reporting'], [fmtN(studies), 'TTEs simulated'], [`${nBelow} of ${scoredTotals.length}`, 'live metrics below benchmark'], [ivs.length ? `${ivs[0]} to ${ivs[ivs.length - 1]}` : '—', 'reporting period'],
    ].map(([v, l]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join('');

    // --- metric x site
    $('#qc-grid-sub').textContent = `Each cell is the site's value over the selected period, coloured by distance from the benchmark. Comp is the direction the metric is scored; ref marks a proposed metric with no better or worse side.`;
    const head = `<tr><th class="rowhead">Metric</th>${sites.map((s) => `<th>${esc(s.label)}</th>`).join('')}<th class="qc-sum">Registry</th><th>Comp</th><th>Benchmark</th></tr>`;
    const body = qcSectionRows(ms, sites.length + 3, (m) => {
      const reg = qcTotal(sites.map((s) => qcSiteValue(s, m)).filter(Boolean), m);
      return `<tr><th>${esc(m.short)}<span class="mdenom">${esc(m.denom)}</span></th>${sites.map((s) => qcCell(qcSiteValue(s, m), m, `${s.label} · ${m.short}`)).join('')}${qcCell(reg, m, `Registry · ${m.short}`, 'qc-sum')}<td class="qc-ref comp">${compOf(m)}</td><td class="qc-ref">${qcVal(qcBenchmark(m), m.unit)}</td></tr>`;
    });
    $('#qc-grid').innerHTML = `<div class="qc-grid-wrap"><table class="qc"><thead>${head}</thead><tbody>${body}</tbody></table></div>${qcKey(ms)}`;

    // --- metric x interval, for the selected sites pooled
    $('#qc-trend-sub').textContent = `Pooled across the ${sites.length} selected site${sites.length === 1 ? '' : 's'}, by ${state.qcInterval === 'month' ? 'month' : 'quarter'}. Total is the whole period.`;
    const head2 = `<tr><th class="rowhead">Metric</th>${ivs.map((k) => `<th>${esc(k)}</th>`).join('')}<th class="qc-sum">Total</th><th>Comp</th><th>Benchmark</th></tr>`;
    const body2 = qcSectionRows(ms, ivs.length + 3, (m) => {
      const per = ivs.map((k) => qcTotal(sites.map((s) => qcSeries(s.metrics.find((x) => x.id === m.id).monthly, m).find((c) => c.key === k)).filter(Boolean), m));
      return `<tr><th>${esc(m.short)}<span class="mdenom">${esc(m.denom)}</span></th>${per.map((c, i) => qcCell(c, m, `${ivs[i]} · ${m.short}`)).join('')}${qcCell(qcTotal(per.filter(Boolean), m), m, `Total · ${m.short}`, 'qc-sum')}<td class="qc-ref comp">${compOf(m)}</td><td class="qc-ref">${qcVal(qcBenchmark(m), m.unit)}</td></tr>`;
    });
    $('#qc-trend').innerHTML = `<div class="qc-grid-wrap"><table class="qc"><thead>${head2}</thead><tbody>${body2}</tbody></table></div>${qcKey(ms)}`;

    renderSiteCards();
    renderQcScorecard();
    renderQcTable();
  }

  function renderQcScorecard() {
    const sel = $('#qc-site-select');
    sel.innerHTML = QS.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('');
    if (!state.qcSel || !QS.some((s) => s.id === state.qcSel)) state.qcSel = QS.length ? QS[0].id : null;
    sel.value = state.qcSel;
    const site = QS.find((s) => s.id === state.qcSel); if (!site) { $('#qc-scorecard').innerHTML = ''; return; }
    const ms = qcMetrics();
    const rows = ms.map((m) => {
      const mv = site.metrics.find((x) => x.id === m.id);
      const tag = m.status === 'proposed' ? ' <span class="chip-proposed">Proposed</span>' : '';
      const v = qcSiteValue(site, m);
      if (!v || v.value == null) return `<tr class="na"><td>${esc(m.label)}${tag}</td><td class="dv" colspan="5">Not submitted</td></tr>`;
      const rel = qcRel(v.value, m), c = cellStyle(v.value, m);
      return `<tr><td>${esc(m.label)}${tag}</td><td class="dv"><b>${qcVal(v.value, m.unit)}</b></td><td class="dv">${qcVal(qcBenchmark(m), m.unit)}</td><td class="dv"><span class="pill-dv ${c.cls} ${c.hi ? 'hi' : ''}" style="${c.style}">${rel >= 0 ? '+' : ''}${rel}%</span></td><td class="dv">${mv.rank ? `${mv.rank} of ${QS.length}` : '—'}</td><td class="dv notice">${v.n == null ? fmtN(v.d) : `${fmtN(v.n)} / ${fmtN(v.d)}`}</td></tr>`;
    }).join('');
    $('#qc-scorecard').innerHTML = `
      <div class="qc-score-grid">
        <div class="chart-block"><h3>${esc(site.label)} <span class="notice">${esc(site.setting)}</span></h3>
          <dl class="qc-profile"><dt>Studies</dt><dd class="num">${fmtN(site.n_studies)} TTEs</dd><dt>Echo labs</dt><dd class="num">${site.n_labs}</dd><dt>Sonographers</dt><dd class="num">${site.n_sonographers}</dd><dt>Reading physicians</dt><dd class="num">${site.n_readers}</dd><dt>Below benchmark</dt><dd class="num">${site.n_below_benchmark} of ${QM.length} metrics</dd></dl>
          <h3>Image quality mix</h3>
          <div class="qbar">${site.image_quality.map((q) => `<span style="flex:${q.pct}" data-tip="${esc(`<b>${q.level}</b>${q.pct}% of studies`)}">${q.pct >= 8 ? esc(q.level) + ' ' + q.pct + '%' : ''}</span>`).join('')}</div>
        </div>
        <div class="chart-block"><h3>Metrics vs benchmark</h3>
          <div class="table-wrap"><table class="scorecard"><thead><tr><th>Metric</th><th>Site</th><th>Benchmark or reference</th><th>Difference</th><th>Rank</th><th>N / D</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>
      </div>`;
  }

  // The metric library output: one value row per metric, with N and D as their own rows when asked,
  // across the selected intervals plus a period total.
  function qcTableModel() {
    const ms = qcMetrics(), ivs = qcIntervals(), sites = qcSites();
    return ms.map((m) => {
      const per = ivs.map((k) => qcTotal(sites.map((s) => qcSeries(s.metrics.find((x) => x.id === m.id).monthly, m).find((c) => c.key === k)).filter(Boolean), m));
      return { m, per, total: qcTotal(per.filter(Boolean), m) };
    });
  }
  function renderQcTable() {
    const ivs = qcIntervals(), model = qcTableModel(), sites = qcSites();
    $('#qc-table-sub').textContent = `${sites.length} site${sites.length === 1 ? '' : 's'} pooled. N is the numerator, D the denominator.`;
    const head = `<tr><th>Metric</th>${ivs.map((k) => `<th class="r">${esc(k)}</th>`).join('')}<th class="r">Total</th></tr>`;
    let sect = '', body = '';
    for (const { m, per, total } of model) {
      if (m.section !== sect) { sect = m.section; body += `<tr><th colspan="${ivs.length + 2}">${esc(sect)}${m.status === 'proposed' ? ' <span class="chip-proposed">Proposed</span>' : ''}</th></tr>`; }
      body += `<tr><td>${esc(m.label)}</td>${per.map((c) => `<td class="r num">${c ? qcVal(c.value, m.unit) : '—'}</td>`).join('')}<td class="r num"><b>${total ? qcVal(total.value, m.unit) : '—'}</b></td></tr>`;
      if (state.qcND) {
        if (m.unit === '%') body += `<tr><td class="notice r">N</td>${per.map((c) => `<td class="r num notice">${c && c.n != null ? fmtN(c.n) : '—'}</td>`).join('')}<td class="r num notice">${total && total.n != null ? fmtN(total.n) : '—'}</td></tr>`;
        body += `<tr><td class="notice r">D</td>${per.map((c) => `<td class="r num notice">${c ? fmtN(c.d) : '—'}</td>`).join('')}<td class="r num notice">${total ? fmtN(total.d) : '—'}</td></tr>`;
      }
    }
    $('#qc-table').innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }
  function qcCsv() {
    const ivs = qcIntervals(), model = qcTableModel();
    const q = (x) => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`;
    const lines = [['Metric', 'Status', 'Unit', 'Comparison', 'Benchmark or reference', ...ivs, 'Total'].map(q).join(',')];
    for (const { m, per, total } of model) {
      lines.push([m.label, m.status === 'proposed' ? 'proposed' : 'live registry metric', m.unit, isNeutral(m) ? 'reference (no better or worse side)' : m.direction === 'lower' ? '<=' : '>=', qcBenchmark(m), ...per.map((c) => (c ? c.value : '')), total ? total.value : ''].map(q).join(','));
      if (state.qcND) {
        if (m.unit === '%') lines.push([m.label + ' — N', '', '', '', '', ...per.map((c) => (c && c.n != null ? c.n : '')), total && total.n != null ? total.n : ''].map(q).join(','));
        lines.push([m.label + ' — D', '', '', '', '', ...per.map((c) => (c ? c.d : '')), total ? total.d : ''].map(q).join(','));
      }
    }
    return lines.join('\n');
  }

  // Two hosts, two mechanisms. A plain anchor download works when the page is served normally
  // (GitHub Pages, a local file). Inside the artifact viewer the frame may not download at all, so
  // the host's own save prompt is used when it is available.
  const FILENAME = 'imageguideecho-site-quality.csv';
  let downloads; // undefined = not asked yet, null = not available here
  async function exportCsv(btn) {
    const csv = qcCsv();
    const say = (t) => { const was = btn.textContent; btn.textContent = t; setTimeout(() => { btn.textContent = was; }, 2200); };
    if (downloads === undefined && window.claude && typeof window.claude.use === 'function') {
      try { downloads = await window.claude.use('downloads'); } catch (e) { downloads = null; }
    }
    if (downloads) {
      try { await downloads.save({ filename: FILENAME, data: csv }); }
      catch (e) { if (e && e.code !== 'declined') say('Export unavailable'); }
      return;
    }
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = FILENAME;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Sites at a glance: one card per site, nine tiles, band-coloured against the benchmark.
  // Tiles encode LEVEL only. The monthly series is generator noise, so shape is deliberately not drawn.
  function renderSiteCards() {
    const host = $('#qc-site-cards'); if (!host || !QS.length) return;
    const live = QM.filter((m) => m.status !== 'proposed'), proposed = QM.filter((m) => m.status === 'proposed');
    const tileFor = (site) => (m) => {
      const mv = site.metrics.find((x) => x.id === m.id);
      const code = esc(m.code || m.short.slice(0, 3));
      if (!mv || mv.value == null) return `<span class="tile na" data-tip="${esc(`<b>${site.label} · ${m.short}</b>Not submitted. This site does not export the data this metric needs.`)}"><i>${code}</i></span>`;
      const rel = qcRel(mv.value, m), c = cellStyle(mv.value, m);
      const pre = m.status === 'proposed' ? 'Proposed metric, not one of the registry’s nine live metrics. ' : '';
      const tip = `<b>${esc(site.label)} · ${esc(m.short)}</b>${pre}${qcVal(mv.value, m.unit)} · ${isNeutral(m) ? 'reference' : 'benchmark'} ${qcVal(qcBenchmark(m), m.unit)} · ${rel >= 0 ? '+' : ''}${rel}%`;
      return `<span class="tile ${c.cls} ${c.hi ? 'hi' : ''}" style="${c.style}" data-tip="${esc(tip)}"><i>${code}</i></span>`;
    };
    host.innerHTML = QS.map((site) => {
      const t = tileFor(site);
      const tiles = live.map(t).join('') +
        (proposed.length ? `<span class="tile-sep" aria-hidden="true"></span><span class="tile-grp">${proposed.map(t).join('')}</span>` : '');
      // Counts the nine live metrics only: a neutral metric has no below.
      const below = site.n_below_benchmark;
      const iq = site.image_quality.map((q) => `<span style="flex:${q.pct}" title="${esc(q.level)} ${q.pct}%"></span>`).join('');
      return `<a class="site-card" href="#quality/${esc(site.id)}">
        <span class="sc-head"><b>${esc(site.label)}</b><i>${esc(site.setting)}</i></span>
        <span class="sc-tiles">${tiles}</span>
        <span class="sc-foot"><span class="num">${fmtN(site.n_studies)} TTEs</span><span class="num">${below} of ${site.n_scored_metrics || live.length} below benchmark</span></span>
        <span class="sc-iq" aria-hidden="true">${iq}</span>
      </a>`;
    }).join('');
  }

  // Views: screenshots of this page, each linking to the live interactive site at the hash it shows.
  // Absolute hrefs on purpose, so the section works from a single-file copy or an embedded document.
  function renderFigures() {
    const host = $('#figures'); if (!host) return;
    const T = window.AIECHO_THUMBS;
    if (!T || !T.views) { host.remove(); return; }
    host.innerHTML = Object.entries(T.views).map(([key, v]) => `
      <a class="fig" href="${esc(v.href)}" rel="noopener">
        <img src="${esc(v.src)}" alt="${esc(v.title)}: ${esc(v.caption)}" loading="lazy" width="${T.width}">
        <span class="fig-b"><b>${esc(v.title)}</b><span>${esc(v.caption)}</span><code>${esc(v.hash)}</code></span>
      </a>`).join('');
  }

  function renderQcPickers() {
    const box = (host, items, set, key) => {
      $(host).innerHTML = `<details class="f-drop" data-key="${key}"><summary>${key === 'qcm' ? 'Metrics' : 'Sites'} <span class="badge">${set.size}</span></summary><div class="f-pop"><ul>${items.map((it) => `<li><label><input type="checkbox" data-qc="${key}" value="${esc(it.id)}"${set.has(it.id) ? ' checked' : ''}> ${esc(it.label)}</label></li>`).join('')}</ul></div></details>`;
    };
    box('#qc-metric-picker', QM.map((m) => ({ id: m.id, label: m.short })), state.qcMetrics, 'qcm');
    box('#qc-site-picker', QS.map((s) => ({ id: s.id, label: s.label })), state.qcSites, 'qcs');
  }
  function renderQcRange(keepSel) {
    const all = state.qcInterval === 'month' ? (Q.months || []) : (Q.quarters || []);
    if (!keepSel || !all.includes(state.qcFrom)) state.qcFrom = all[0];
    if (!keepSel || !all.includes(state.qcTo)) state.qcTo = all[all.length - 1];
    for (const [id, val] of [['#qc-from', state.qcFrom], ['#qc-to', state.qcTo]]) {
      $(id).innerHTML = all.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
      $(id).value = val;
    }
  }

  // ---------- methods tab ----------
  function renderMethods() {
    $('#product-codes').innerHTML = Object.entries(P.product_codes || {}).map(([k, v]) => `<tr><td class="mono">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
    $('#excluded').innerHTML = (P.excluded || []).map((x) => `<tr><td class="num">${fmtDate(x.decision_date)}</td><td class="mono">${esc(x.k_number)}</td><td>${esc(x.device_name)}</td><td>${esc(x.company)}</td><td class="mono">${esc(x.product_code)}</td><td>${esc(x.reason)}</td></tr>`).join('') || '<tr><td colspan="6">None.</td></tr>';
    const nv = fams.filter((f) => f.research_verified).length, np = fams.filter((f) => f.research_pending).length;
    $('#build-info').textContent = `Built ${P.generated}. ${fams.length} product families, ${fams.reduce((n, f) => n + f.n_clearances, 0)} clearances, ${nv} verified. Registry seed ${R.seed}.`;
    $('#build-warnings').innerHTML = (P.build_warnings || []).map((w) => `<li>${esc(w)}</li>`).join('');
    
    $('#footer-build').textContent = `Data as of ${P.generated} · openFDA and FDA’s AI-enabled device list`;
  }

  // Write the current selection into the address bar without adding a history entry and without
  // re-entering route() through hashchange, which would render the same view a second time.
  let hashOwn = null;
  function setHash(h) {
    if (location.hash === `#${h}`) return;
    hashOwn = h;
    history.replaceState(null, '', `#${h}`);
  }

  // ---------- tabs & routing ----------
  // The two tabs whose numbers are generated carry a flat grey wash and a DEMO badge.
  const DEMO_TABS = ['registry', 'quality'];
  function showTab(tab) {
    state.tab = tab;
    for (const a of $$('.tabs a')) { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
    for (const s of $$('.tab-panel')) s.hidden = s.id !== tab;
    const demo = DEMO_TABS.includes(tab);
    $('#demo-wash').hidden = !demo; $('#demo-badge').hidden = !demo;
    window.scrollTo({ top: 0 });
  }
  function route() {
    const h = location.hash.replace(/^#/, '');
    if (h === 'main') { $('#main').focus(); return; }
    if (h.startsWith('product/')) { closePanelQuiet(); showTab('products'); openPanel(dec(h.slice(8)), false); return; }
    if (h.startsWith('registry/')) { closePanelQuiet(); state.regSel = dec(h.slice(9)); showTab('registry'); renderRegistry(); return; }
    if (h.startsWith('quality/')) { closePanelQuiet(); state.qcSel = dec(h.slice(8)); showTab('quality'); renderQuality(); return; }
    if (['products', 'registry', 'quality', 'methods'].includes(h)) { closePanelQuiet(); showTab(h); return; }
    if (h === '') { closePanelQuiet(); showTab('products'); }
  }
  function closePanelQuiet() { $('#panel').hidden = true; $('#panel-backdrop').hidden = true; document.body.style.overflow = ''; for (const el of INERT()) el.inert = false; }

  // ---------- events ----------
  document.addEventListener('click', (ev) => {
    if (ev.target.id === 'qc-export') { exportCsv(ev.target); return; }
    const open = ev.target.closest('[data-open]'); if (open) { openPanel(open.dataset.open); return; }
    const card = ev.target.closest('.card'); if (card && !ev.target.closest('a')) { openPanel(card.dataset.id); return; }
    if (ev.target.closest('#panel-close') || ev.target.closest('#panel-backdrop')) { closePanel(); return; }
    const reg = ev.target.closest('[data-reg]'); if (reg) { closePanelQuiet(); return; }
    const row = ev.target.closest('.chart-block .row'); if (row) { state.regSel = row.dataset.id; $('#reg-select').value = state.regSel; setHash(`registry/${state.regSel}`); renderRegistry(); return; }
    const vb = ev.target.closest('.view-toggle button'); if (vb) { state.view = vb.dataset.view; for (const b of $$('.view-toggle button')) b.setAttribute('aria-pressed', b === vb ? 'true' : 'false'); render(); return; }
    if (ev.target.closest('#clear-filters')) { state.sel = {}; state.q = ''; $('#search').value = ''; state.openFacet = null; render(); return; }
    const off = ev.target.closest('[data-off-key]');
    if (off) { const s2 = state.sel[off.dataset.offKey]; if (s2) { s2.delete(off.dataset.offValue); if (!s2.size) delete state.sel[off.dataset.offKey]; } render(); return; }
    if (!ev.target.closest('#filters') && state.openFacet) { state.openFacet = null; for (const d of $$('#filters .f-drop')) d.open = false; }
  });
  document.addEventListener('change', (ev) => {
    const cb = ev.target.closest('#filters input[type=checkbox]');
    if (cb) { const s = (state.sel[cb.dataset.key] = state.sel[cb.dataset.key] || new Set()); cb.checked ? s.add(cb.value) : s.delete(cb.value); if (!s.size) delete state.sel[cb.dataset.key]; render(); return; }
    if (ev.target.id === 'sort') { state.sort = ev.target.value; render(); return; }
    if (ev.target.id === 'reg-extract') { state.regExtract = ev.target.value; renderRegistry(); return; }
    if (ev.target.id === 'reg-select') { state.regSel = ev.target.value; setHash(`registry/${state.regSel}`); renderRegistry(); return; }
    if (ev.target.dataset && ev.target.dataset.qc) {
      const set = ev.target.dataset.qc === 'qcm' ? state.qcMetrics : state.qcSites;
      if (ev.target.checked) set.add(ev.target.value); else set.delete(ev.target.value);
      // Never let the grid empty out: the last checkbox in a picker stays on.
      if (!set.size) { set.add(ev.target.value); ev.target.checked = true; }
      const badge = ev.target.closest('.f-drop').querySelector('.badge'); if (badge) badge.textContent = set.size;
      renderQuality(); return;
    }
    if (ev.target.id === 'qc-interval') { state.qcInterval = ev.target.value; renderQcRange(false); renderQuality(); return; }
    if (ev.target.id === 'qc-from' || ev.target.id === 'qc-to') {
      state.qcFrom = $('#qc-from').value; state.qcTo = $('#qc-to').value;
      const all = state.qcInterval === 'month' ? (Q.months || []) : (Q.quarters || []);
      if (all.indexOf(state.qcFrom) > all.indexOf(state.qcTo)) { if (ev.target.id === 'qc-from') { state.qcTo = state.qcFrom; $('#qc-to').value = state.qcTo; } else { state.qcFrom = state.qcTo; $('#qc-from').value = state.qcFrom; } }
      renderQuality(); return;
    }
    if (ev.target.id === 'qc-benchmark') { state.qcBench = ev.target.value; renderQuality(); return; }
    if (ev.target.id === 'qc-nd') { state.qcND = ev.target.checked; renderQuality(); return; }
    if (ev.target.id === 'qc-site-select') { state.qcSel = ev.target.value; setHash(`quality/${state.qcSel}`); renderQcScorecard(); return; }
  });
  let qt; $('#search').addEventListener('input', (ev) => { clearTimeout(qt); qt = setTimeout(() => { state.q = ev.target.value.trim().toLowerCase(); render(); }, 120); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !$('#panel').hidden) { closePanel(); return; }
    if (ev.key === 'Escape' && state.openFacet) { const d = $(`#filters .f-drop[data-key="${CSS.escape(state.openFacet)}"]`); state.openFacet = null; if (d) { d.open = false; d.querySelector('summary').focus(); } return; }
    if (ev.key === 'Tab' && !$('#panel').hidden) {
      const f = $$('#panel a[href], #panel button, #panel summary, #panel [tabindex="0"]').filter((el) => el.offsetParent !== null);
      if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); } else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      return;
    }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest && ev.target.closest('.chart-block .row')) { ev.preventDefault(); ev.target.closest('.row').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  document.addEventListener('toggle', (ev) => {
    const d = ev.target && ev.target.closest && ev.target.closest('#filters .f-drop');
    if (!d || !d.dataset.key || !ev.isTrusted) return;
    if (d.open) { state.openFacet = d.dataset.key; for (const o of $$('#filters .f-drop')) if (o !== d) o.open = false; placePopover(d); }
    else if (state.openFacet === d.dataset.key) state.openFacet = null;
  }, true);
  document.addEventListener('mousemove', (ev) => { const t = ev.target.closest('[data-tip]'); if (t) tip(t.dataset.tip, ev.clientX, ev.clientY); else hideTip(); });
  document.addEventListener('focusin', (ev) => { const t = ev.target.closest && ev.target.closest('[data-tip]'); if (t) { const r = t.getBoundingClientRect(); tip(t.dataset.tip, r.left + r.width / 2, r.top); } else hideTip(); });
  document.addEventListener('mouseleave', hideTip);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (state.tab === 'registry') renderRegistry(); }, 150); });
  window.addEventListener('hashchange', () => { const h = location.hash.replace(/^#/, ''); if (h === hashOwn) { hashOwn = null; return; } hashOwn = null; route(); });

  // ---------- init ----------
  const nCl = fams.reduce((n, f) => n + f.n_clearances, 0), nCo = new Set(fams.map((f) => companyShort(f.company))).size;
  const nPapers = fams.reduce((n, f) => n + f.n_papers_resolved, 0), nClaims = fams.reduce((n, f) => n + f.n_fda_claims, 0);
  $('#catalog-stats').innerHTML = [[fams.length, 'AI products'], [nCl, 'FDA clearances'], [nCo, 'companies'], [nClaims, 'FDA summary performance metrics'], [nPapers, 'resolved publications']].map(([v, l]) => `<span><b class="num">${fmtN(v)}</b>${esc(l)}</span>`).join('');
  render(); renderRegistry(); renderQcPickers(); renderQcRange(false); renderQuality(); renderMethods(); renderFigures(); route();
})();
