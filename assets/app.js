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
    'acquisition-guidance': 'Acquisition guidance', 'lv-function-quantification': 'LV function (EF)', 'comprehensive-measurement': 'Comprehensive measurement',
    'disease-detection': 'Disease detection', 'hf-status-indicator': 'Heart failure indicator', 'amyloid-indicator': 'Cardiac amyloidosis indicator',
    'fetal-echo': 'Fetal echo', 'interventional-guidance': 'Interventional guidance', 'image-quality': 'Image quality', 'system-embedded': 'System-embedded AI', 'other': 'Other',
  };
  const VL = { fda_summary: 'FDA summary', fda_database: 'FDA database', peer_reviewed: 'Peer reviewed', company: 'Company', news: 'News', unverified: 'Unverified', doi_resolved: 'DOI resolved', pmid_resolved: 'PMID resolved', unresolved: 'Unresolved' };
  const vl = (v) => (v ? `<span class="vlevel ${esc(v)}">${esc(VL[v] || v)}</span>` : '');
  const companyShort = (c) => String(c || '').split(' (')[0].trim();
  const fams = P.families;
  const byId = new Map(fams.map((f) => [f.id, f]));

  // ---------- state ----------
  const state = { tab: 'products', view: 'cards', q: '', sort: 'latest', sel: {}, regSel: null };
  const FILTERS = [
    { key: 'category', label: 'Function', get: (f) => [f.research_pending ? 'pending' : f.category], name: (v) => (v === 'pending' ? 'Research pending' : CAT[v] || v) },
    { key: 'pathway', label: 'Regulatory pathway', get: (f) => f.pathways },
    { key: 'evidence', label: 'Evidence', get: (f) => evidenceFlags(f) },
    { key: 'company', label: 'Company', get: (f) => [companyShort(f.company)] },
    { key: 'modality', label: 'Modality', get: (f) => f.modality_scope || [] },
    { key: 'deployment', label: 'Deployment', get: (f) => f.deployment || [] },
    { key: 'code', label: 'Product code', get: (f) => f.product_codes },
    { key: 'year', label: 'Latest clearance year', get: (f) => [f.latest_cleared.slice(0, 4)] },
  ];
  function evidenceFlags(f) {
    const out = [];
    if (f.n_performance_claims > 0) out.push('FDA performance data');
    if (f.n_papers_resolved > 0) out.push('Peer-reviewed publications');
    if (f.training_data && f.training_data.disclosed) out.push('Training data disclosed');
    if ((f.clinical_trials || []).length) out.push('Registered clinical trial');
    if (f.pathways.some((p) => /PCCP/.test(p))) out.push('PCCP');
    if (f.pathways.includes('De Novo')) out.push('De Novo');
    return out;
  }

  // ---------- filters rail ----------
  function renderFilters(visible) {
    const host = $('#filters');
    host.innerHTML = FILTERS.map((F) => {
      const counts = new Map();
      for (const f of fams) for (const v of F.get(f)) if (v) counts.set(v, (counts.get(v) || 0) + 0);
      for (const f of visible) for (const v of F.get(f)) if (v) counts.set(v, (counts.get(v) || 0) + 1);
      const vals = [...counts.keys()].sort((a, b) => (F.key === 'year' ? b.localeCompare(a) : a.localeCompare(b)));
      const sel = state.sel[F.key] || new Set();
      const open = sel.size > 0 || ['category', 'pathway', 'evidence'].includes(F.key);
      return `<details class="filter-group" ${open ? 'open' : ''}><summary>${esc(F.label)}</summary><ul>${vals.map((v) => {
        const n = counts.get(v); const on = sel.has(v);
        return `<li><label class="${n === 0 && !on ? 'zero' : ''}"><input type="checkbox" data-key="${esc(F.key)}" value="${esc(v)}" ${on ? 'checked' : ''}> <span>${esc(F.name ? F.name(v) : v)}</span><span class="n num">${n}</span></label></li>`;
      }).join('')}</ul></details>`;
    }).join('');
  }

  // ---------- filtering / sorting ----------
  function matches(f) {
    for (const F of FILTERS) {
      const sel = state.sel[F.key];
      if (sel && sel.size) { const vals = F.get(f); if (!vals.some((v) => sel.has(v))) return false; }
    }
    if (state.q) {
      const hay = [f.product_name, f.company, f.summary, (f.tags || []).join(' '), (f.modality_scope || []).join(' '), f.clearances.map((c) => c.k_number + ' ' + c.device_name_fda).join(' '), (f.embedded_ai_features || []).map((e) => e.name).join(' ')].join(' ').toLowerCase();
      if (!state.q.split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  }
  const SORTS = {
    latest: (a, b) => b.latest_cleared.localeCompare(a.latest_cleared) || a.product_name.localeCompare(b.product_name),
    first: (a, b) => a.first_cleared.localeCompare(b.first_cleared),
    name: (a, b) => a.product_name.localeCompare(b.product_name),
    company: (a, b) => companyShort(a.company).localeCompare(companyShort(b.company)) || a.product_name.localeCompare(b.product_name),
    metrics: (a, b) => b.n_performance_claims - a.n_performance_claims || b.latest_cleared.localeCompare(a.latest_cleared),
    papers: (a, b) => b.n_papers_resolved - a.n_papers_resolved || b.n_papers - a.n_papers || b.latest_cleared.localeCompare(a.latest_cleared),
  };

  function render() {
    const visible = fams.filter(matches).sort(SORTS[state.sort] || SORTS.latest);
    renderFilters(visible);
    const nSel = Object.values(state.sel).reduce((n, s) => n + s.size, 0);
    $('#count').textContent = `${visible.length} of ${fams.length} products${nSel ? ` · ${nSel} filter${nSel > 1 ? 's' : ''}` : ''}${state.q ? ` · “${state.q}”` : ''}`;
    $('#rail-toggle').textContent = nSel ? `Filters (${nSel})` : 'Filters';
    if (state.view === 'cards') { $('#cards').hidden = false; $('#table').hidden = true; renderCards(visible); }
    else { $('#cards').hidden = true; $('#table').hidden = false; renderTable(visible); }
  }

  function chips(f) {
    const out = [];
    if (f.research_pending) out.push('<span class="chip muted">Research pending</span>');
    if (f.n_performance_claims) out.push(`<span class="chip on">${f.n_performance_claims} FDA metric${f.n_performance_claims > 1 ? 's' : ''}</span>`);
    if (f.n_papers) out.push(`<span class="chip on">${f.n_papers_resolved}/${f.n_papers} paper${f.n_papers > 1 ? 's' : ''} resolved</span>`);
    if (f.training_data && f.training_data.disclosed) out.push('<span class="chip on">Training n disclosed</span>');
    if (f.pathways.some((p) => /PCCP/.test(p))) out.push('<span class="chip flag">PCCP</span>');
    if (f.pathways.includes('De Novo')) out.push('<span class="chip flag">De Novo</span>');
    for (const t of (f.tags || []).slice(0, 4)) if (t && t.trim()) out.push(`<span class="chip">${esc(t.trim())}</span>`);
    return out.join('');
  }
  function renderCards(list) {
    const host = $('#cards');
    if (!list.length) { host.innerHTML = '<p class="empty">No products match. Clear a filter or change the search.</p>'; return; }
    host.innerHTML = list.map((f) => `
      <article class="card" data-id="${esc(f.id)}">
        <div class="card-top"><h3><button type="button" data-open="${esc(f.id)}">${esc(f.product_name)}</button></h3><span class="cat ${f.research_pending ? 'pending' : ''}">${f.research_pending ? 'Research pending' : esc(CAT[f.category] || f.category)}</span></div>
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
  function renderTable(list) {
    const host = $('#table');
    if (!list.length) { host.innerHTML = '<p class="empty">No products match.</p>'; return; }
    host.innerHTML = `<table><thead><tr><th>Product</th><th>Company</th><th>Function</th><th>Latest clearance</th><th class="r">Clearances</th><th>Pathway</th><th>Code</th><th class="r">FDA metrics</th><th class="r">Papers</th><th>Training n</th></tr></thead><tbody>${list.map((f) => `
      <tr><td><button class="link" type="button" data-open="${esc(f.id)}">${esc(f.product_name)}</button></td><td>${esc(companyShort(f.company))}</td><td>${esc(CAT[f.category] || f.category)}</td><td class="num">${fmtDate(f.latest_cleared)}</td><td class="r num">${f.n_clearances}</td><td>${esc(f.pathways.join(', '))}</td><td>${esc(f.product_codes.join(', '))}</td><td class="r num">${f.n_performance_claims}</td><td class="r num">${f.n_papers_resolved}/${f.n_papers}</td><td class="num">${f.training_data && f.training_data.disclosed ? fmtN(f.training_data.n_studies || f.training_data.n_patients) : '—'}</td></tr>`).join('')}</tbody></table>`;
  }

  // ---------- detail panel ----------
  function openPanel(id, push) {
    const f = byId.get(id); if (!f) return;
    $('#panel-body').innerHTML = panelHTML(f);
    $('#panel').hidden = false; $('#panel-backdrop').hidden = false; document.body.style.overflow = 'hidden';
    $('#panel').scrollTop = 0; $('#panel-close').focus();
    if (push !== false) history.replaceState(null, '', `#product/${encodeURIComponent(id)}`);
  }
  function closePanel() {
    $('#panel').hidden = true; $('#panel-backdrop').hidden = true; document.body.style.overflow = '';
    if (/^#product\//.test(location.hash)) history.replaceState(null, '', '#products');
  }
  function claimRow(c) {
    const src = `${esc(c.k_number)}${c.page ? ` p.${c.page}` : ''}`;
    return `<tr><td>${esc(c.endpoint)}</td><td><b>${esc(c.value)}</b><br><span class="notice">${esc(c.metric)}</span></td><td>${esc(c.comparator || '—')}</td><td class="num">${[c.n_studies != null ? `${fmtN(c.n_studies)} studies` : '', c.n_patients != null ? `${fmtN(c.n_patients)} patients` : '', c.n_sites != null ? `${c.n_sites} sites` : ''].filter(Boolean).join('<br>') || '—'}</td><td>${src}<br>${vl(c.verification)}${c.quote ? `<details><summary class="quote-toggle">quote</summary><blockquote class="q">${esc(c.quote)}</blockquote>${c.dataset_description ? `<p class="notice">Dataset: ${esc(c.dataset_description)}</p>` : ''}${c.subgroup_notes ? `<p class="notice">Subgroups: ${esc(c.subgroup_notes)}</p>` : ''}</details>` : ''}</td></tr>`;
  }
  function dataBlock(label, d, extra) {
    if (!d) return '';
    const n = [d.n_studies != null ? `${fmtN(d.n_studies)} studies` : '', d.n_patients != null ? `${fmtN(d.n_patients)} patients` : '', d.n_sites != null ? `${d.n_sites} sites` : ''].filter(Boolean).join(' · ');
    return `<dt>${esc(label)}</dt><dd>${n || (d.disclosed === false ? 'Not disclosed' : '—')}${extra || ''}${d.description ? `<br><span class="notice">${esc(d.description)}</span>` : ''}${d.source ? `<br><span class="notice">Source: ${linkify(d.source)}</span>` : ''} ${vl(d.verification)}</dd>`;
  }
  const linkify = (s) => (/^https?:\/\//.test(s) ? `<a href="${esc(s)}" rel="noopener">${esc(s.replace(/^https?:\/\//, '').slice(0, 60))}</a>` : esc(s));
  function panelChips(f) {
    const seen = new Set(); const out = [];
    const add = (v, cls) => { const k = String(v || '').trim().toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push(`<span class="chip ${cls}">${esc(String(v).trim())}</span>`); };
    for (const m of f.modality_scope || []) add(m, '');
    for (const d of f.deployment || []) add(d, '');
    for (const t of (f.tags || []).slice(0, 10)) add(t, 'on');
    return out.join('');
  }
  function panelHTML(f) {
    const latest = f.clearances[f.clearances.length - 1];
    const reg = R.evaluations[f.id];
    const links = [
      f.product_url ? `<a href="${esc(f.product_url)}" rel="noopener">Product page</a>` : '',
      f.company_website ? `<a href="${esc(f.company_website)}" rel="noopener">Company</a>` : '',
      `<a href="${esc(latest.fda_summary_url)}" rel="noopener">FDA summary (${esc(latest.k_number)})</a>`,
      `<a href="${esc(latest.fda_database_url)}" rel="noopener">FDA database</a>`,
    ].filter(Boolean).join('');
    const feats = (f.embedded_ai_features || []).filter((e) => e && e.name && e.name.trim());
    const primaryReg = reg && reg.evaluable ? reg.endpoints.find((e) => e.id === reg.primary_endpoint_id) : null;
    return `
      <div class="panel-head">
        <span class="cat ${f.research_pending ? 'pending' : ''}" style="justify-self:start">${f.research_pending ? 'Research pending' : esc(CAT[f.category] || f.category)}</span>
        <h2 id="panel-title">${esc(f.product_name)}</h2>
        <p class="co">${esc(f.company)}</p>
        <div class="panel-links">${links}</div>
        <div class="chips">${panelChips(f)}</div>
        ${f.summary ? `<p>${esc(f.summary)}</p>` : ''}
        ${f.research_pending ? '<p class="notice">Research for this product has not been merged yet. Only openFDA fields are shown.</p>' : ''}
      </div>
      ${f.indications_for_use_quote || f.intended_use_quote ? `<section class="psec"><h3>Indications for use <small>FDA summary</small></h3><blockquote class="q">${esc(f.indications_for_use_quote || f.intended_use_quote)}</blockquote></section>` : ''}
      ${feats.length ? `<section class="psec"><h3>Cardiac AI features in these clearances</h3><ul class="papers">${feats.map((e) => `<li><span class="t">${esc(e.name)}</span><span>${esc(e.function)}</span><span class="m">${e.first_k_number ? `First in ${esc(e.first_k_number)} · ` : ''}${e.quote ? `“${esc(e.quote)}”` : ''}</span></li>`).join('')}</ul></section>` : ''}
      <section class="psec"><h3>Clearance history <small>${f.n_clearances} submission${f.n_clearances > 1 ? 's' : ''} · openFDA</small></h3>
        <ol class="timeline">${f.clearances.map((c) => `<li><span class="d num">${fmtDate(c.decision_date)}</span><span><span class="k"><a href="${esc(c.fda_summary_url)}" rel="noopener">${esc(c.k_number)}</a></span> · ${esc(c.pathway)} · ${esc(c.product_code)}${c.notable_flags && c.notable_flags.length ? ` · ${c.notable_flags.map((x) => `<span class="chip">${esc(x)}</span>`).join(' ')}` : ''}<br><span class="what">${esc(c.device_name_fda)}${c.changes_summary ? ` — ${esc(c.changes_summary)}` : ''}${c.predicates && c.predicates.length ? `<br>Predicates: ${c.predicates.map(esc).join(', ')}` : ''}</span></span></li>`).join('')}</ol>
      </section>
      <section class="psec"><h3>Performance evidence <small>${(f.performance_claims || []).length ? `${f.performance_claims.length} reported metrics` : 'none extracted'}</small></h3>
        ${(f.performance_claims || []).length ? `<div class="table-wrap"><table class="claims"><thead><tr><th>Endpoint</th><th>Result</th><th>Reference</th><th>n</th><th>Source</th></tr></thead><tbody>${f.performance_claims.map(claimRow).join('')}</tbody></table></div>` : `<p class="notice">${f.research_pending ? 'Pending.' : 'The FDA summary for these clearances reports no quantitative performance results, or the filing is a 510(k) statement.'}</p>`}
      </section>
      <section class="psec"><h3>Training and validation data</h3>
        <dl class="kv">${dataBlock('Training set', f.training_data)}${dataBlock('Validation / test set', f.validation_data, f.validation_data && f.validation_data.independent_of_training != null ? `<br><span class="notice">${f.validation_data.independent_of_training ? 'Stated independent of training data' : 'Not stated to be independent of training data'}</span>` : '')}</dl>
      </section>
      ${(f.prior_validations || []).length ? `<section class="psec"><h3>Prior validations</h3><ul class="papers">${f.prior_validations.map((p) => `<li><span>${esc(p.description)}</span><span class="m">${p.source_url ? linkify(p.source_url) + ' · ' : ''}${vl(p.verification)}</span></li>`).join('')}</ul></section>` : ''}
      <section class="psec"><h3>Publications <small>${f.n_papers ? `${f.n_papers_resolved} of ${f.n_papers} resolved` : 'none found'}</small></h3>
        ${f.n_papers ? `<ol class="papers">${f.papers.map((p) => `<li><span class="t">${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" rel="noopener">${esc(p.title)}</a>` : p.url ? `<a href="${esc(p.url)}" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}</span><span class="m">${[p.first_author ? esc(p.first_author) + ' et al.' : '', p.journal ? esc(p.journal) : '', p.year || ''].filter(Boolean).join(' · ')}${p.pmid ? ` · <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" rel="noopener">PMID ${esc(p.pmid)}</a>` : ''} · <span class="chip">${esc(p.relation)}</span> ${vl(p.verification)}</span>${p.key_result ? `<span>${esc(p.key_result)}${p.n_subjects ? ` (n = ${fmtN(p.n_subjects)})` : ''}</span>` : ''}</li>`).join('')}</ol>` : '<p class="notice">No product-specific peer-reviewed publication was found during extraction.</p>'}
      </section>
      ${(f.clinical_trials || []).length ? `<section class="psec"><h3>Registered trials</h3><ul class="papers">${f.clinical_trials.map((t) => `<li><span class="t"><a href="${esc(t.url)}" rel="noopener">${esc(t.nct_id)}</a> ${esc(t.title)}</span><span class="m">${esc(t.status || '')}</span></li>`).join('')}</ul></section>` : ''}
      <section class="psec"><h3>ASE registry performance <span class="placeholder-tag">Placeholder</span></h3>
        ${reg && reg.evaluable ? `<dl class="kv"><dt>Cohort</dt><dd class="num">${fmtN(reg.cohort.n_studies)} TTEs · ${reg.cohort.n_sites} sites · ${esc(reg.cohort.period)}</dd>${primaryReg ? `<dt>${esc(primaryReg.label)}</dt><dd class="num">${primaryReg.value}${primaryReg.unit ? ' ' + esc(primaryReg.unit) : ''} (95% CI ${primaryReg.ci.low} to ${primaryReg.ci.high})</dd>` : ''}<dt>Feasibility</dt><dd class="num">${reg.endpoints[0].value}%</dd></dl><p class="notice">Synthetic values. <a href="#registry/${esc(f.id)}" data-reg="${esc(f.id)}">Open the registry tab for this product.</a></p>` : `<p class="not-evaluable">${reg ? esc(reg.reason) : 'Not evaluated.'}</p>`}
      </section>
      ${(f.open_questions || []).length ? `<section class="psec"><h3>Open questions</h3><ul class="oq">${f.open_questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></section>` : ''}
      ${(f.sources || []).length ? `<section class="psec"><details><summary class="quote-toggle">Sources (${f.sources.length})</summary><ul class="oq">${f.sources.map((s) => `<li>${esc(s.fact)} — ${linkify(s.url_or_file)} ${vl(s.verification)}</li>`).join('')}</ul></details></section>` : ''}
      <p class="notice">Research file: ${esc(f._source_file || 'none')}${f.research_verified ? ' · adversarially verified' : ''}</p>`;
  }

  // ---------- registry tab ----------
  const evals = Object.values(R.evaluations || {});
  const evaluable = evals.filter((e) => e.evaluable);
  function tip(html, x, y) { const t = $('#tooltip'); t.innerHTML = html; t.hidden = false; const w = t.offsetWidth, h = t.offsetHeight; t.style.left = Math.min(x + 14, window.innerWidth - w - 8) + 'px'; t.style.top = Math.max(8, y - h - 12) + 'px'; }
  function hideTip() { $('#tooltip').hidden = true; }

  function dotRangeChart(rows, o) {
    // rows: [{id,label,value,low,high,n}]; one scale, direct labels, ranges + dots, hover, click-to-select
    if (!rows.length) return '<p class="not-evaluable">No products of this type.</p>';
    const W = o.wide ? 1100 : 640, L = o.wide ? 290 : 210, Rr = 64, rowH = 26, top = 22, H = top + rows.length * rowH + 28;
    const vals = rows.flatMap((r) => [r.low, r.high]);
    let [dmin, dmax] = o.domain || [Math.min(...vals), Math.max(...vals)];
    const pad = (dmax - dmin) * 0.08 || 1; if (!o.domain) { dmin -= pad; dmax += pad; }
    const x = (v) => L + ((v - dmin) / (dmax - dmin)) * (W - L - Rr);
    const ticks = niceTicks(dmin, dmax, 5);
    const fmt = (v) => (o.decimals != null ? v.toFixed(o.decimals) : String(v));
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}">
      <g class="grid">${ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${H - 24}"/>`).join('')}</g>
      <g class="axis">${ticks.map((t) => `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${fmt(t)}${o.unit ? ' ' + esc(o.unit) : ''}</text>`).join('')}</g>
      ${o.refLine != null && o.refLine >= dmin && o.refLine <= dmax ? `<line class="ref" x1="${x(o.refLine)}" x2="${x(o.refLine)}" y1="${top - 6}" y2="${H - 24}"/>` : ''}
      ${rows.map((r, i) => { const y = top + i * rowH + rowH / 2; const sel = r.id === state.regSel; return `<g class="row ${sel ? 'sel' : ''}" data-id="${esc(r.id)}" data-tip="${esc(`<b>${r.label}</b>${fmt(r.value)}${o.unit ? ' ' + o.unit : ''} (95% CI ${fmt(r.low)} to ${fmt(r.high)})<br>${fmtN(r.n)} TTEs · ${r.company}`)}">
        <rect class="hit" x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}" rx="3"/>
        <text class="lab ${sel ? 'sel' : ''}" x="${L - 10}" y="${y + 4}" text-anchor="end">${esc(truncate(r.label, o.wide ? 42 : 30))}</text>
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
  function sparkline(series, o) {
    const W = 460, H = 96, l = 8, r = 12, t = 14, b = 20;
    const pts = series.filter((p) => p.v != null); if (pts.length < 2) return '';
    const vs = pts.map((p) => p.v); let mn = Math.min(...vs), mx = Math.max(...vs); if (mn === mx) { mn -= 1; mx += 1; }
    const pad = (mx - mn) * 0.15; mn -= pad; mx += pad;
    const x = (i) => l + (i / (pts.length - 1)) * (W - l - r), y = (v) => t + (1 - (v - mn) / (mx - mn)) * (H - t - b);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}"><g class="grid"><line x1="${l}" x2="${W - r}" y1="${H - b}" y2="${H - b}"/></g><path class="spark-area" d="${d} L${x(pts.length - 1).toFixed(1)},${H - b} L${l},${H - b} Z"/><path class="spark-line" d="${d}"/><circle class="spark-end" cx="${x(pts.length - 1)}" cy="${y(last.v)}" r="4"/><text x="${l}" y="${H - 5}">${esc(pts[0].m)}</text><text x="${W - r}" y="${H - 5}" text-anchor="end">${esc(last.m)}</text><text class="lab" x="${x(pts.length - 1) - 8}" y="${y(last.v) - 8}" text-anchor="end">${last.v}${o.unit ? ' ' + esc(o.unit) : ''}</text></svg>`;
  }

  function renderRegistry() {
    const kp = $('#reg-kpis');
    const nStudies = evaluable.reduce((n, e) => n + e.cohort.n_studies, 0);
    const sites = new Set(evaluable.flatMap((e) => e.cohort.sites)).size;
    kp.innerHTML = [
      [evaluable.length, `products evaluable of ${evals.length}`], [fmtN(nStudies), 'synthetic TTEs scored'], [sites, 'registry sites (synthetic subset)'], [evaluable.length ? evaluable[0].cohort.period : '—', 'evaluation window'],
    ].map(([v, l]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)} <span class="placeholder-tag">Placeholder</span></div></div>`).join('');

    const fam = (id) => byId.get(id) || { product_name: id, company: '' };
    const mk = (type, epId) => evaluable.filter((e) => type.includes(e.evaluation_type)).map((e) => { const ep = e.endpoints.find((x) => x.id === epId); return ep ? { id: e.family_id, label: fam(e.family_id).product_name, company: companyShort(fam(e.family_id).company), value: ep.value, low: ep.ci.low, high: ep.ci.high, n: e.cohort.n_studies } : null; }).filter(Boolean);
    const lv = mk(['lvef', 'comprehensive'], 'lvef_mae').sort((a, b) => a.value - b.value);
    const det = mk(['detection', 'hfpef', 'amyloid'], 'auc').sort((a, b) => b.value - a.value);
    const acq = mk(['acquisition'], 'diag_quality').sort((a, b) => b.value - a.value);
    const strain = mk(['strain'], 'gls_icc').sort((a, b) => b.value - a.value);
    $('#reg-charts').innerHTML = `
      <section class="chart-block wide"><h2>LVEF agreement with the registry report</h2><p class="chart-sub">Mean absolute error vs reported LVEF, % EF points, lower is better. Dot = point estimate, bar = 95% CI. Click a product for detail.</p>${dotRangeChart(lv, { unit: '', decimals: 1, wide: true, aria: 'LVEF mean absolute error by product', domain: [0, Math.max(10, ...lv.map((r) => r.high)) * 1.05] })}</section>
      <section class="chart-block"><h2>Detection: area under the ROC curve</h2><p class="chart-sub">Severe aortic stenosis, HFpEF, or cardiac amyloidosis vs the registry reference, higher is better.</p>${dotRangeChart(det, { unit: '', decimals: 2, aria: 'AUC by product', domain: [0.5, 1], refLine: 0.5 })}</section>
      <section class="chart-block"><h2>Acquisition guidance: diagnostic-quality studies</h2><p class="chart-sub">Share of guided acquisitions graded diagnostic by the reading physician.</p>${dotRangeChart(acq, { unit: '%', decimals: 1, aria: 'Diagnostic quality by product', domain: [50, 100] })}</section>
      ${strain.length ? `<section class="chart-block"><h2>Strain: ICC vs reported GLS</h2><p class="chart-sub">Where the registry report contains GLS.</p>${dotRangeChart(strain, { unit: '', decimals: 2, aria: 'GLS ICC by product', domain: [0.5, 1] })}</section>` : ''}`;

    const sel = $('#reg-select');
    sel.innerHTML = evals.slice().sort((a, b) => a.product_name.localeCompare(b.product_name)).map((e) => `<option value="${esc(e.family_id)}">${esc(e.product_name)}${e.evaluable ? '' : ' (not evaluable)'}</option>`).join('');
    if (!state.regSel || !R.evaluations[state.regSel]) state.regSel = lv.length ? lv[0].id : (evaluable[0] ? evaluable[0].family_id : null);
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
  function renderRegDetail() {
    const host = $('#reg-detail'); const e = R.evaluations[state.regSel]; const f = byId.get(state.regSel);
    if (!e) { host.innerHTML = ''; return; }
    if (!e.evaluable) { host.innerHTML = `<p class="not-evaluable">${esc(e.product_name)} — ${esc(e.reason)}</p>`; return; }
    const primary = e.endpoints.find((x) => x.id === e.primary_endpoint_id);
    const dims = [...new Set(e.subgroups.map((s) => s.dimension))];
    const vals = e.subgroups.map((s) => s.value); const mn = Math.min(...vals), mx = Math.max(...vals);
    host.innerHTML = `
      <div class="reg-detail-grid">
        <div class="chart-block"><h3>${esc(e.product_name)} <span class="notice">${esc(f ? CAT[f.category] || f.category : '')}</span></h3>
          <dl class="kv"><dt>Module</dt><dd>${esc(e.cohort.module)}</dd><dt>Cohort</dt><dd class="num">${fmtN(e.cohort.n_studies)} TTEs · ${e.cohort.n_sites} sites · ${esc(e.cohort.period)}</dd><dt>Vendors</dt><dd>${e.cohort.vendors.map(esc).join(', ')}</dd></dl>
          <div class="table-wrap"><table class="endpoints"><thead><tr><th>Endpoint</th><th>Estimate (95% CI)</th><th>Reference</th></tr></thead><tbody>${e.endpoints.map((ep) => `<tr><td>${esc(ep.label)}${ep.primary ? ' <span class="chip on">primary</span>' : ''}</td><td class="num"><b>${ep.value}${ep.unit ? ' ' + esc(ep.unit) : ''}</b> <span class="notice">(${ep.ci.low} to ${ep.ci.high})</span></td><td class="notice">${esc(ep.reference)}</td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="chart-block">
          ${primary ? `<h3>${esc(primary.label)} by month</h3><p class="chart-sub">${esc(primary.direction === 'lower' ? 'Lower is better.' : primary.direction === 'zero' ? 'Closer to zero is better.' : 'Higher is better.')} Synthetic monthly estimate.</p>${sparkline(e.monthly.map((m) => ({ m: m.month, v: m.primary })), { unit: primary.unit, aria: primary.label + ' by month' })}` : ''}
          <h3>Feasibility by month</h3>${sparkline(e.monthly.map((m) => ({ m: m.month, v: m.feasibility })), { unit: '%', aria: 'Feasibility by month' })}
          ${primary && e.subgroups.length ? `<h3>${esc(primary.label)} by subgroup</h3><p class="chart-sub">Darker = better. Cells show the estimate and subgroup n.</p><div class="heat">${dims.map((d) => { const rows = e.subgroups.filter((s) => s.dimension === d); return `<div class="heat-row"><div class="heat-dim">${esc(d)}</div><div class="heat-cells">${rows.map((s) => { const c = heatColor(s.value, mn, mx, primary.direction); return `<div class="cell ${c.hi ? 'hi' : ''}" style="background:var(--seq-${c.step})" data-tip="${esc(`<b>${d}: ${s.level}</b>${s.value}${primary.unit ? ' ' + primary.unit : ''} · n = ${fmtN(s.n)}`)}"><span class="lv">${esc(s.level)}</span><b>${s.value}</b></div>`; }).join('')}</div></div>`; }).join('')}</div>` : ''}
        </div>
      </div>`;
  }

  // ---------- methods tab ----------
  function renderMethods() {
    $('#product-codes').innerHTML = Object.entries(P.product_codes || {}).map(([k, v]) => `<tr><td class="mono">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
    $('#excluded').innerHTML = (P.excluded || []).map((x) => `<tr><td class="num">${fmtDate(x.decision_date)}</td><td class="mono">${esc(x.k_number)}</td><td>${esc(x.device_name)}</td><td>${esc(x.company)}</td><td class="mono">${esc(x.product_code)}</td><td>${esc(x.reason)}</td></tr>`).join('') || '<tr><td colspan="6">None.</td></tr>';
    const nv = fams.filter((f) => f.research_verified).length, np = fams.filter((f) => f.research_pending).length;
    $('#build-info').textContent = `Data built ${P.generated}. ${fams.length} product families, ${fams.reduce((n, f) => n + f.n_clearances, 0)} clearances; ${nv} families adversarially verified, ${np} pending research. Registry placeholder seed ${R.seed}, generated ${R.generated}.`;
    $('#build-warnings').innerHTML = (P.build_warnings || []).map((w) => `<li>${esc(w)}</li>`).join('');
    $('#footer-build').textContent = `Data as of ${P.generated} · openFDA and FDA AI-enabled device list · registry tab is placeholder data`;
  }

  // ---------- tabs & routing ----------
  function showTab(tab) {
    state.tab = tab;
    for (const a of $$('.tabs a')) a.setAttribute('aria-selected', a.dataset.tab === tab ? 'true' : 'false');
    for (const s of $$('.tab-panel')) s.hidden = s.id !== tab;
    window.scrollTo({ top: 0 });
  }
  function route() {
    const h = location.hash.replace(/^#/, '');
    if (h.startsWith('product/')) { showTab('products'); openPanel(decodeURIComponent(h.slice(8)), false); return; }
    if (h.startsWith('registry/')) { state.regSel = decodeURIComponent(h.slice(9)); showTab('registry'); renderRegistry(); return; }
    if (['products', 'registry', 'methods'].includes(h)) { closePanelQuiet(); showTab(h); return; }
    showTab('products');
  }
  function closePanelQuiet() { $('#panel').hidden = true; $('#panel-backdrop').hidden = true; document.body.style.overflow = ''; }

  // ---------- events ----------
  document.addEventListener('click', (ev) => {
    const open = ev.target.closest('[data-open]'); if (open) { openPanel(open.dataset.open); return; }
    const card = ev.target.closest('.card'); if (card && !ev.target.closest('a')) { openPanel(card.dataset.id); return; }
    if (ev.target.closest('#panel-close') || ev.target.closest('#panel-backdrop')) { closePanel(); return; }
    const reg = ev.target.closest('[data-reg]'); if (reg) { closePanelQuiet(); return; }
    const row = ev.target.closest('.chart-block .row'); if (row) { state.regSel = row.dataset.id; $('#reg-select').value = state.regSel; renderRegistry(); return; }
    const vb = ev.target.closest('.view-toggle button'); if (vb) { state.view = vb.dataset.view; for (const b of $$('.view-toggle button')) b.setAttribute('aria-pressed', b === vb ? 'true' : 'false'); render(); return; }
    if (ev.target.closest('#rail-toggle')) { const r = $('#rail'), b = $('#rail-toggle'); const o = !r.classList.contains('open'); r.classList.toggle('open', o); b.setAttribute('aria-expanded', String(o)); return; }
    if (ev.target.closest('#clear-filters')) { state.sel = {}; state.q = ''; $('#search').value = ''; render(); return; }
  });
  document.addEventListener('change', (ev) => {
    const cb = ev.target.closest('#filters input[type=checkbox]');
    if (cb) { const s = (state.sel[cb.dataset.key] = state.sel[cb.dataset.key] || new Set()); cb.checked ? s.add(cb.value) : s.delete(cb.value); if (!s.size) delete state.sel[cb.dataset.key]; render(); return; }
    if (ev.target.id === 'sort') { state.sort = ev.target.value; render(); return; }
    if (ev.target.id === 'reg-select') { state.regSel = ev.target.value; renderRegistry(); return; }
  });
  let qt; $('#search').addEventListener('input', (ev) => { clearTimeout(qt); qt = setTimeout(() => { state.q = ev.target.value.trim().toLowerCase(); render(); }, 120); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#panel').hidden) closePanel(); });
  document.addEventListener('mousemove', (ev) => { const t = ev.target.closest('[data-tip]'); if (t) tip(t.dataset.tip, ev.clientX, ev.clientY); else hideTip(); });
  document.addEventListener('mouseleave', hideTip);
  window.addEventListener('hashchange', route);

  // ---------- init ----------
  const nCl = fams.reduce((n, f) => n + f.n_clearances, 0), nCo = new Set(fams.map((f) => companyShort(f.company))).size;
  const nPapers = fams.reduce((n, f) => n + f.n_papers_resolved, 0), nClaims = fams.reduce((n, f) => n + f.n_performance_claims, 0);
  $('#catalog-stats').innerHTML = [[fams.length, 'products'], [nCl, 'FDA clearances'], [nCo, 'companies'], [nClaims, 'FDA performance metrics'], [nPapers, 'resolved publications']].map(([v, l]) => `<span><b class="num">${fmtN(v)}</b>${esc(l)}</span>`).join('');
  render(); renderRegistry(); renderMethods(); route();
})();
