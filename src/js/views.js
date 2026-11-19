'use strict';
/* ================= views: executive strip, zones, ASM, SE, daily & weekly plans, trends, tracking ================= */

Object.assign(ST, { asmSel: '', rseSel: '', pcat: '', planF: '', planLvl: { daily: 'SE', weekly: 'SE' }, planSel: { daily: {}, weekly: {} }, week: 0, sorts: {},
  tf: { type: '', level: '', status: '', zone: '', overdue: false, q: '' } });

const pillH = (k, l) => `<span class="pill s-${k}">${esc(l)}</span>`;
const stPill = st => pillH(PSTAT[st].k, PSTAT[st].l);
const trPill = t => pillH(TREND_CLS[t.k], t.l);
const heatP = v => { const st = paceStatus(v); return `<span class="heat" style="background:${HEAT[PSTAT[st].k]};color:var(--ink)">${v == null ? '–' : fP(v)}</span>`; };
const dPeriod = () => planDate(ST.day).iso;
const wPeriod = () => weekCtx(ST.week, ST.day).iso;
const scopeLbl = () => { const u = SEED && SEED.meta && SEED.meta.user; return ST.se ? 'SE ' + ST.se : ST.asm ? 'ASM ' + ST.asm : ST.zone ? ST.zone + ' zone' : u && u.role === 'ASM' ? 'Team ' + u.name : u && u.role === 'SE' ? u.name : 'All India'; };
const bigNum = (lab, v, sub, extra = '') => `<div class="card stat${extra}"><div class="eyebrow">${lab}</div><div class="big num">${v}</div>${sub ? `<div class="kv"><span>${sub}</span></div>` : ''}</div>`;
function defaultWeek() { const D0 = effDay(ST.day), wk = weeks().filter(w => w.s <= D0); const done = wk.filter(w => w.e <= D0); return (done.length ? done[done.length - 1] : wk[wk.length - 1] || { n: 1 }).n; }

/* ---------- generic sortable table ---------- */
function gridTable(el, cols, rows0, sk, onRow) {
  // SE / ASM lists open in rank order (#1 first); other tables keep their natural order
  const s = ST.sorts[sk] || (ST.sorts[sk] = sk === 'rse' || sk === 'asm' ? { k: 'rank', d: -1 } : { k: null, d: -1 });
  let rows = rows0;
  if (s.k) { const c = cols.find(c => c.k === s.k); if (c && c.val) rows = rows0.slice().sort((a, b) => { const va = c.val(a), vb = c.val(b); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * s.d; }); }
  el.innerHTML = `<thead><tr>${cols.map(c => `<th class="${c.cls || ''}${c.val ? ' sortable' : ''}${c.sticky ? ' sticky-col' : ''}" data-k="${c.k}">${c.h}${s.k === c.k ? (s.d < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr${onRow ? ' class="click"' : ''} data-i="${i}">${cols.map(c => `<td class="${c.cls || ''}${c.sticky ? ' sticky-col' : ''}">${c.html(r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">No records for this selection.</td></tr>`}</tbody>`;
  el.querySelectorAll('th.sortable').forEach(th => th.onclick = () => { const k = th.dataset.k; if (s.k === k) s.d *= -1; else { s.k = k; s.d = cols.find(c => c.k === k).asc ? 1 : -1; } gridTable(el, cols, rows0, sk, onRow); });
  if (onRow) el.querySelectorAll('tbody tr.click').forEach(tr => tr.onclick = e => { if (e.target.closest('select,input,button,a,textarea')) return; onRow(rows[+tr.dataset.i]); });
}

/* ---------- column sets ---------- */
const C = {
  rank: { k: 'rank', h: '#', cls: 'r num', html: r => r.rank || '–', val: r => r.rank == null ? null : -r.rank },
  name: lvl => ({ k: 'name', h: lvl, sticky: true, asc: true, html: r => `<b>${esc(r.name)}</b>`, val: r => r.name }),
  asm: { k: 'asm', h: 'ASM', asc: true, html: r => esc(r.asm || '–'), val: r => r.asm },
  zone: { k: 'zone', h: 'Zone', asc: true, html: r => esc(r.zone), val: r => r.zone },
  rsm: { k: 'rsm', h: 'RSM', asc: true, html: r => esc(rsmOf(r.asm) || '–'), val: r => rsmOf(r.asm) },
  plan: { k: 'plan', h: 'Target', cls: 'r num', html: r => r.p.plan ? fN(r.p.plan) : '<span class="na">–</span>', val: r => r.p.plan || null },
  mtd: { k: 'mtd', h: 'Billed', cls: 'r num', html: r => fN(r.p.mtd), val: r => r.p.mtd },
  ord: { k: 'ord', h: 'Ordered', cls: 'r num', html: r => r.p.orders == null ? '<span class="na">–</span>' : fN(r.p.orders), val: r => r.p.orders },
  ordp: { k: 'ordp', h: 'Order %', cls: 'c', html: r => r.p.orderPct == null ? '–' : heatP(r.p.orderPct / (ST.day / DB.dim)).replace(/>[^<]*<\/span>$/, '>' + fP(r.p.orderPct) + '</span>'), val: r => r.p.orderPct },
  ach: { k: 'ach', h: 'Billed %', cls: 'r num', html: r => fP(r.p.ach), val: r => r.p.ach },
  pace: { k: 'pace', h: 'Vs pace', cls: 'c', html: r => heatP(r.p.pace), val: r => r.p.pace },
  gap: { k: 'gap', h: 'Balance', cls: 'r num', html: r => r.p.gap == null ? '–' : fN(r.p.gap), val: r => r.p.gap },
  need: { k: 'need', h: 'Need/day', cls: 'r num', html: r => r.p.need == null ? '–' : fN(r.p.need), val: r => r.p.need },
  status: { k: 'status', h: 'Status', html: r => stPill(r.p.status), val: r => ['crit', 'behind', 'watch', 'ok', 'nd'].indexOf(r.p.status) },
  trend: { k: 'trend', h: 'Trend', html: r => trPill(r.p.trend), val: r => r.p.trend.d },
  bp: { k: 'bp', h: 'Billing pts', cls: 'r num', html: r => r.p.r.k[1].has ? `${fN(r.p.r.k[1].a)}/${fN(r.p.r.k[1].t)}` : '–', val: r => r.p.r.k[1].p },
  score: { k: 'score', h: '16-pt score', cls: 'c', html: r => { const sb = scoreBand(r.p.r.comp); return `<span class="heat" style="background:${HEAT[sb.k]};color:var(--ink)">${r.p.r.comp == null ? '–' : Math.round(r.p.r.comp * 100)}</span>`; }, val: r => r.p.r.comp },
  pjp: lvl => ({ k: 'pjp', h: 'DJP visits', cls: 'r num', html: r => { const j = pjpOf(lvl === 'ASM' ? 'ASM' : 'SE', r.name); return j ? `${fN(j.a)}/${fN(j.p)}` : '<span class="na">–</span>'; }, val: r => { const j = pjpOf(lvl === 'ASM' ? 'ASM' : 'SE', r.name); return j ? j.pct : null; } }),
  team: { k: 'team', h: 'SEs', cls: 'r num', html: r => r.team.length, val: r => r.team.length },
  under: { k: 'under', h: 'SEs behind', cls: 'r num', html: r => { const n = teamCounts(r.team).under; return n ? `<b style="color:var(--crit)">${n}</b>` : '0'; }, val: r => teamCounts(r.team).under },
  dps: lvl => ({ k: 'dps', h: 'Daily plan', html: r => { const s = planStatus('daily', lvl, r.name, dPeriod()); return pillH(s.k, s.l); }, val: r => planStatus('daily', lvl, r.name, dPeriod()).done }),
  wps: lvl => ({ k: 'wps', h: 'Weekly plan', html: r => { const s = planStatus('weekly', lvl, r.name, wPeriod()); return pillH(s.k, s.l); }, val: r => planStatus('weekly', lvl, r.name, wPeriod()).done }),
};
const asmCols = () => [C.rank, C.name('ASM'), C.zone, ...(rsmList().length ? [C.rsm] : []), C.plan, C.ord, C.ordp, C.mtd, C.ach, C.pace, C.gap, C.status, C.trend, C.team, C.under, C.bp, C.score, C.pjp('ASM'), C.dps('ASM'), C.wps('ASM')];
const rseCols = () => [C.rank, C.name('SE'), C.asm, C.zone, ...(rsmList().length ? [C.rsm] : []), C.plan, C.ord, C.ordp, C.mtd, C.ach, C.pace, C.gap, C.need, C.status, C.trend, C.bp, C.score, C.pjp('SE'), C.dps('SE'), C.wps('SE')];
function catFilter(rows) {
  if (ST.pcat === 'under') rows = rows.filter(x => x.p.status === 'behind' || x.p.status === 'crit');
  else if (ST.pcat) rows = rows.filter(x => x.p.status === ST.pcat);
  if (ST.planF) rows = rows.filter(x => { const s = planStatus('daily', x.lvl, x.name, dPeriod()); return ST.planF === 'nd' ? s.k === 'nd' : ST.planF === 'open' ? s.k !== 'nd' && s.k !== 'good' : s.k === 'good'; });
  return rows;
}
function catChips(el, rerender) {
  const opts = [['', 'All'], ['ok', 'On track'], ['watch', 'Watch'], ['under', 'Needs improvement'], ['behind', 'Behind'], ['crit', 'Critical'], ['nd', 'No target']];
  const pl = [['', 'Any plan status'], ['nd', 'Plan not generated'], ['open', 'Plan open'], ['done', 'Plan completed']];
  el.innerHTML = `<div class="seg" role="group" aria-label="Performance category">${opts.map(([k, l]) => `<button type="button" data-pc="${k}" aria-pressed="${ST.pcat === k}">${l}</button>`).join('')}</div>
    <select class="mini" data-pf aria-label="Daily plan status">${pl.map(([k, l]) => `<option value="${k}"${ST.planF === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  el.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { ST.pcat = b.dataset.pc; rerender(); });
  el.querySelector('[data-pf]').onchange = e => { ST.planF = e.target.value; rerender(); };
}

/* ---------- executive strip (overview) ---------- */
function renderExec() {
  const f = curF(), p = perfOf(f), rses = rseRows(), asms = asmRows(), tc = teamCounts(rses);
  const share = fP(p.share);
  const card = (lab, v, sub, go, cls = '') => `<div class="card stat x${go ? ' click' : ''}${cls}"${go ? ` data-go="${go}" role="button" tabindex="0"` : ''}><div class="eyebrow">${lab}</div><div class="big num">${v}</div><div class="small muted">${sub}</div></div>`;
  const pjps = DB.sameMonth ? rses.map(x => pjpOf('SE', x.name)).filter(Boolean) : [];
  const pj = pjps.length ? { p: pjps.reduce((s, x) => s + x.p, 0), a: pjps.reduce((s, x) => s + x.a, 0) } : null;
  $('#execStrip').innerHTML =
    card('Volume target', p.plan ? fN(p.plan) : '–', p.plan ? `${MON[DB.m - 1]} plan · ${scopeLbl()}` : 'No plan for this month in the data')
    + (p.official ? card('Ordered MTD', fN(p.orders), `${fP(p.orderPct)} of target · ${fP(ST.day / DB.dim)} of month gone`) : '')
    + card('Billed MTD', fN(p.mtd), `${fP(p.ach)} of target${p.official ? '' : ' · ' + share + ' of working days gone'}`)
    + card('Vs pace', p.pace == null ? '–' : fP(p.pace), `${PSTAT[p.status].l} · ${p.need ? fN(p.need) + '/day needed' : 'no daily need'}`, '', ' st-' + PSTAT[p.status].k)
    + card(p.official ? 'Balance (orders)' : 'Gap to plan', p.gap == null ? '–' : fN(p.gap), p.official ? `Need ${fN(p.need)}/day · now ${fN(p.rr)}/day · ${p.daysLeft} days left` : p.gap ? `${p.wdLeft} working days left` : 'Plan met or no plan')
    + card('ASMs', fN(asms.length), `${asms.filter(x => x.p.status === 'ok').length} on track · click to compare`, 'tab:asm')
    + card('SEs', fN(rses.length), `${tc.ok} on track · ${tc.watch} watch`, 'tab:rse')
    + card('Meeting benchmark', `${fN(tc.ok)}<small>${rses.length ? fP(tc.ok / rses.length) : ''}</small>`, `SEs at ≥ ${fP(CFG.onTrack)} of pace`, 'rse:ok', ' st-good')
    + card('Need improvement', `${fN(tc.under)}<small>${rses.length ? fP(tc.under / rses.length) : ''}</small>`, `SEs below ${fP(CFG.watch)} of pace · click for list`, 'rse:under', tc.under ? ' st-crit' : '')
    + card('DJP visits', pj ? `${fN(pj.a)}<small>/ ${fN(pj.p)}</small>` : '–', pj ? `${fP(pj.p ? pj.a / pj.p : null)} of planned · Journey Plan W1–W2` : 'No journey-plan data for this month');
  const zr = zoneRows();
  $('#execZones').innerHTML = zr.map(z => `<div class="hb click" data-go="zone:${esc(z.name)}" role="button" tabindex="0"><span class="nm">${esc(z.name)}</span><span class="tr"><i style="width:${Math.min(100, (z.p.pace || 0) / 1.3 * 100)}%;background:${HEATC[PSTAT[z.p.status].k]}"></i><u style="left:${100 / 1.3}%"></u></span><span class="v">${fP(z.p.pace)}</span></div>`).join('')
    + `<p class="small muted" style="margin:8px 0 0">Achieved vs pro-rata plan to ${dLabel(ST.day)} · line = 100% · click a zone to drill down.</p>`
    + (() => { const rr = typeof rsmRows === 'function' && !(SEED.meta.user && SEED.meta.user.role && SEED.meta.user.role !== 'admin') ? rsmRows() : []; if (!rr.length) return '';
      return `<h4 class="small" style="margin:14px 0 6px;letter-spacing:.06em;text-transform:uppercase;opacity:.75">By RSM</h4>` + rr.map(z => `<div class="hb click${ST.rsm === z.name ? ' sel' : ''}" data-go="rsm:${esc(z.name)}" role="button" tabindex="0" title="${esc(z.zone)} · ${z.asms.length} ASMs · ${z.team.length} SEs"><span class="nm">${esc(z.name)} <small>${esc(z.zone)}</small></span><span class="tr"><i style="width:${Math.min(100, (z.p.pace || 0) / 1.3 * 100)}%;background:${HEATC[PSTAT[z.p.status].k]}"></i><u style="left:${100 / 1.3}%"></u></span><span class="v">${fP(z.p.pace)}</span></div>`).join('')
        + `<p class="small muted" style="margin:8px 0 0">Click an RSM to see their ASMs ranked.</p>`; })();
  $('#execWeeks').innerHTML = p.wk.length ? p.wk.map(w => `<div class="hb"><span class="nm">${w.label} <small>${w.range}${w.complete ? '' : ' · to ' + w.to}</small></span><span class="tr"><i style="width:${Math.min(100, (w.pct || 0) / 1.3 * 100)}%;background:${HEATC[PSTAT[paceStatus(w.pct)].k]}"></i><u style="left:${100 / 1.3}%"></u></span><span class="v">${fP(w.pct)}</span></div>`).join('')
    + `<p class="small muted" style="margin:8px 0 0">Week units vs pro-rata week target · trend: <b>${esc(p.trend.l)}</b>${p.trend.basis ? ' (' + esc(p.trend.basis) + ')' : ''}.</p>` : '<p class="muted">No week started yet.</p>';
}

/* ---------- zones ---------- */
function renderZones() {
  const zr = zoneRows(), all = rseRows(scopeF()), aa = asmRows(scopeF());
  $('#zoneCards').innerHTML = zr.map(z => {
    const rs = all.filter(x => x.zone === z.name), as = aa.filter(x => x.zone === z.name), tc = teamCounts(rs);
    const gen = rs.filter(x => planStatus('daily', 'SE', x.name, dPeriod()).k !== 'nd').length, done = rs.filter(x => planStatus('daily', 'SE', x.name, dPeriod()).k === 'good').length;
    return `<div class="card zone-card${ST.zone === z.name ? ' sel' : ''}" data-go="zone:${esc(z.name)}" role="button" tabindex="0">
      <div class="zc-h"><h3>${esc(z.name)}</h3>${stPill(z.p.status)}</div>
      <div class="big num">${fP(z.p.pace)}<small>of pace</small></div>
      <div class="meter"><i style="width:${Math.min(100, (z.p.ach || 0) * 100)}%;background:${HEATC[PSTAT[z.p.status].k]}"></i><u style="left:${z.p.share * 100}%"></u></div>
      <div class="kv"><span>Achieved / target</span><b class="num">${fN(z.p.mtd)} / ${fN(z.p.plan)}</b></div>
      <div class="kv"><span>Gap · need per day</span><b class="num">${fN(z.p.gap)} · ${fN(z.p.need)}</b></div>
      <div class="kv"><span>ASMs · SEs</span><b>${as.length} · ${rs.length}</b></div>
      <div class="kv"><span>SEs on track / need action</span><b><span style="color:var(--good)">${tc.ok}</span> / <span style="color:var(--crit)">${tc.under}</span></b></div>
      <div class="kv"><span>Daily plans (${planDate(ST.day).label.slice(0, 10)})</span><b>${gen ? `${gen}/${rs.length} generated · ${done} done` : 'not generated'}</b></div>
      <div class="kv"><span>Trend</span>${trPill(z.p.trend)}</div>
      <div class="wkbars">${z.p.wk.map(w => `<span title="${w.label}: ${fP(w.pct)}"><i style="height:${Math.min(100, (w.pct || 0) / 1.3 * 100)}%;background:${HEATC[PSTAT[paceStatus(w.pct)].k]}"></i><b>${w.label}</b></span>`).join('')}</div></div>`;
  }).join('');
  const det = $('#zoneDetail');
  if (!ST.zone) { det.hidden = true; return; }
  det.hidden = false;
  $('#zdTitle').textContent = `${ST.zone} zone — ASMs and SEs`;
  const za = rankRows(asmRows(scopeF({ zone: ST.zone }))), zrse = rankRows(rseRows(scopeF({ zone: ST.zone })));
  gridTable($('#zdAsm'), asmCols(), za, 'zda', r => openProfile('ASM', r.name));
  gridTable($('#zdRse'), rseCols(), zrse, 'zdr', r => openProfile('SE', r.name));
  const strong = zrse.filter(x => x.p.status === 'ok').sort((a, b) => b.p.pace - a.p.pace), weak = zrse.filter(x => x.p.status === 'behind' || x.p.status === 'crit').sort((a, b) => a.p.pace - b.p.pace);
  $('#zdStrong').innerHTML = strong.length ? strong.slice(0, 8).map(x => `<div class="kv click" data-go="p:SE:${esc(x.name)}"><span>${esc(x.name)} <span class="muted small">${esc(x.asm)}</span></span><b style="color:var(--good)">${fP(x.p.pace)}</b></div>`).join('') : '<p class="muted small">No SE at pace yet.</p>';
  $('#zdWeak').innerHTML = weak.length ? weak.slice(0, 10).map(x => `<div class="kv click" data-go="p:SE:${esc(x.name)}"><span>${esc(x.name)} <span class="muted small">${esc(x.asm)} · −${fN(x.p.gap)} units</span></span><b style="color:var(--crit)">${fP(x.p.pace)}</b></div>`).join('') : '<p class="muted small">No SE below the benchmark.</p>';
}

/* ---------- ASM / SE lists and profiles ---------- */
function openProfile(lvl, name) {
  if ((lvl === 'ASM' ? ST.asmSel : ST.rseSel) !== name && typeof navPush === 'function') navPush();
  if (lvl === 'ASM') { ST.asmSel = name; onTab('asm'); } else { ST.rseSel = name; onTab('rse'); }
  setTimeout(() => { const el = $(lvl === 'ASM' ? '#asmProfile' : '#rseProfile'); if (el && !el.hidden) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
}
/* “Search by name” box above the ASM / SE tables — filters the rows as you type (name, ASM, zone or RSM) */
const NQ = { asm: '', rse: '' };
function nameBox(chips, key, rerender) {
  if (!chips) return; let box = chips.parentNode.querySelector(`.name-q[data-k="${key}"]`);
  if (!box) {
    box = document.createElement('div'); box.className = 'name-q'; box.dataset.k = key;
    box.innerHTML = `<input type="search" placeholder="Search by name…" aria-label="Search ${key === 'asm' ? 'ASM' : 'SE'} by name" autocomplete="off"><span class="small muted"></span>`;
    chips.parentNode.insertBefore(box, chips);
    let t; box.querySelector('input').oninput = e => { NQ[key] = e.target.value; clearTimeout(t); t = setTimeout(rerender, 120); };
  }
}
const nameFilter = (rows, key) => { const q = NQ[key].trim().toLowerCase(); if (!q) return rows; return rows.filter(x => [x.name, x.asm, x.zone, rsmOf(x.asm)].join(' ').toLowerCase().includes(q)); };
function renderAsm() {
  catChips($('#asmChips'), renderAsm); nameBox($('#asmChips'), 'asm', renderAsm);
  const rows = nameFilter(catFilter(rankRows(asmRows())), 'asm');
  $('#asmNote').textContent = `${rows.length} ASM${rows.length === 1 ? '' : 's'} · ${scopeLbl()} · data to ${dLabel(ST.day)} · Ach % = team units ÷ team plan; "Vs pace" compares with the plan pro-rata to working days gone. Click a row for the ASM profile.`;
  gridTable($('#asmTable'), asmCols(), rows, 'asm', r => openProfile('ASM', r.name));
  const prof = $('#asmProfile');
  if (!ST.asmSel || !DB.asms.some(a => a.n === ST.asmSel)) { prof.hidden = true; return; }
  prof.hidden = false; prof.innerHTML = profileHTML('ASM', ST.asmSel);
  wireProfile(prof, 'ASM', ST.asmSel);
}
function renderRse() {
  catChips($('#rseChips'), renderRse); nameBox($('#rseChips'), 'rse', renderRse);
  const rows = nameFilter(catFilter(rankRows(rseRows())), 'rse');
  $('#rseNote').textContent = `${rows.length} SE${rows.length === 1 ? '' : 's'} · ${scopeLbl()} · data to ${dLabel(ST.day)}. Click a row for the SE profile and action plans.`;
  gridTable($('#rseTable'), rseCols(), rows, 'rse', r => openProfile('SE', r.name));
  const prof = $('#rseProfile');
  if (!ST.rseSel || !DB.seInfo.has(ST.rseSel)) { prof.hidden = true; return; }
  prof.hidden = false; prof.innerHTML = profileHTML('SE', ST.rseSel);
  wireProfile(prof, 'SE', ST.rseSel);
}
function profileHTML(lvl, name) {
  const isA = lvl === 'ASM', info = isA ? (DB.asms.find(a => a.n === name) || {}) : (DB.seInfo.get(name) || {});
  const p = perfOf(scopeF(isA ? { asm: name } : { se: name })), team = isA ? rankRows(teamOf(name)) : null;
  const peers = rankRows(isA ? asmRows(scopeF()) : rseRows(scopeF())), me = peers.find(x => x.name === name);
  const dp = isA ? dailyASM(name) : dailyRSE(name), wp = isA ? weeklyASM(name, ST.week) : weeklyRSE(name, ST.week);
  const pj = pjpOf(isA ? 'ASM' : 'SE', name), tc = team ? teamCounts(team) : null;
  const ds = planStatus('daily', lvl, name, dp.period), ws = planStatus('weekly', lvl, name, wp.period);
  const items = pl => pl.items.map((x, n) => `<div class="pi"><span class="pr pr-${x.priority}">${x.priority}</span><div><b>${n + 1}. ${esc(x.issue)}</b><div class="small">${esc(x.action)}</div><div class="small muted">Expect: ${esc(x.outcome)} · by ${esc(x.deadline)}</div></div></div>`).join('');
  return `<div class="card prof-head"><div class="ph-l"><div class="eyebrow">${lvl} profile${isA ? '' : ' · ASM ' + esc(info.asm || '–')} · ${esc(info.z || '')} zone${info.code ? ' · code ' + info.code : ''}</div>
      <h2>${esc(name)}</h2><div class="toolbar">${stPill(p.status)}${trPill(p.trend)}${me && me.rank ? `<span class="tag">Rank ${me.rank} of ${me.of} ${lvl}s by pace</span>` : ''}<span class="tag">Data to ${dLabel(ST.day)}</span></div></div>
      <div class="toolbar"><button class="btn sm wa" data-pa="wa">WhatsApp card</button><button class="btn sm mail" data-pa="mail">Email</button><button class="btn sm" data-pa="daily">Daily plan</button><button class="btn sm" data-pa="weekly">Weekly plan</button><button class="btn sm primary" data-pa="xls">⬇ Excel: ${lvl} plan</button><button class="btn sm" data-pa="close">Close</button></div></div>
    <div class="grid4">
      ${bigNum('Target · achieved', `${fN(p.mtd)}<small>/ ${p.plan ? fN(p.plan) : '–'}</small>`, `${fP(p.ach)} of ${MON[DB.m - 1]} plan`)}
      ${bigNum('Vs pace', p.pace == null ? '–' : fP(p.pace), `Expected by now ${fN(p.expected)} · run rate ${fN(p.rr)}/day`)}
      ${bigNum('Gap', p.gap == null ? '–' : fN(p.gap), p.need ? `${fN(p.need)}/day over ${p.wdLeft} working days` : 'No daily need')}
      ${isA ? bigNum('Team', `${tc.n}<small>SEs</small>`, `<span style="color:var(--good)">${tc.ok} on track</span> · ${tc.watch} watch · <span style="color:var(--crit)">${tc.under} need improvement</span>`)
        : bigNum('Billing points · DJP', `${fN(p.r.k[1].a)}<small>/ ${fN(p.r.k[1].t)}</small>`, pj ? `DJP visits ${fN(pj.a)}/${fN(pj.p)} (${fP(pj.pct)}) · W1–W2` : 'No journey-plan record this month')}
    </div>
    ${fieldCardHTML(lvl, name)}
    <div class="grid2">
      <div class="card"><div class="card-h"><h3>Units per day vs required daily rate</h3><span class="muted small">${p.need ? 'Line = remaining gap ÷ working days left (' + fN(p.need) + '/day)' : p.plan ? 'Plan met or month closed' : 'No plan'}</span></div><div class="chart" id="${lvl}Ch"></div></div>
      <div class="card"><div class="card-h"><h3>Weekly performance</h3><span class="muted small">Recent movement: ${esc(p.trend.basis || p.trend.l)}</span></div>
        <div class="tbl-wrap"><table><thead><tr><th>Week</th><th>Dates</th><th class="r">Work days</th><th class="r">Target</th><th class="r">Units</th><th class="c">Ach %</th><th class="r">No-billing days</th><th class="r">New BPs</th></tr></thead><tbody>
        ${p.wk.map(w => `<tr><td><b>${w.label}</b>${w.complete ? '' : ' <span class="tag">partial</span>'}</td><td>${w.range}</td><td class="r num">${w.wdTo}/${w.wd}</td><td class="r num">${fN(w.tTo)}</td><td class="r num">${fN(w.units)}</td><td class="c">${heatP(w.pct)}</td><td class="r num">${w.zero}</td><td class="r num">${fN(w.bpNew)}</td></tr>`).join('')}</tbody></table></div></div>
    </div>
    ${isA ? `<div class="card"><div class="card-h"><h3>Team — SEs reporting to ${esc(name)}</h3><span class="muted small">Click an SE for their profile</span></div><div class="tbl-wrap"><table id="profTeam"></table></div></div>` : ''}
    <div class="grid2">
      <div class="card"><div class="card-h"><h3>Daily plan · ${esc(dp.periodLabel)}</h3>${pillH(ds.k, ds.l)}</div><div class="card-b"><div class="plist-mini">${items(dp)}</div></div></div>
      <div class="card"><div class="card-h"><h3>Weekly plan · ${esc(wp.periodLabel)}</h3>${pillH(ws.k, ws.l)}</div><div class="card-b"><div class="plist-mini">${items(wp)}</div></div></div>
    </div>
    ${!isA && dp.dealers.length ? `<div class="card"><div class="card-h"><h3>Dealer focus list</h3><span class="muted small">Top dealers by gap · from the dealer master and billing</span></div><div class="card-b"><div class="dl">${dp.dealers.slice(0, 8).map((x, n) => `<div class="dl-row"><div class="rank num">${n + 1}</div><div style="min-width:0"><h4>${esc(DB.D.n[x.i])} <span class="muted small">#${DB.D.c[x.i]} · ${esc(DB.D.city[x.i] || '')}</span></h4><div class="reasons">${x.rs.map(y => `<div class="reason"><span class="rk ${y.k}">${RK_LABEL[y.k]}</span><span><b style="font-weight:600;color:var(--ink)">${esc(y.t)}</b> — ${esc(y.a)}</span></div>`).join('')}</div></div><div class="pot"><b class="num">${fN(x.q)}</b>MTD units</div></div>`).join('')}</div></div></div>` : ''}`;
}
/* field work on the profile: visits (PJP sheets), hours and attendance (Check In Check out / Attendance) */
function fieldCardHTML(lvl, name) {
  const f = fieldOf(lvl, name), t = lvl === 'ASM' ? teamFieldOf(name) : null, k = contestOf(lvl, name); if (!f && !t && !k) return '';
  const att = f && f.att ? Object.entries(f.att).sort((a, b) => b[1] - a[1]) : [];
  const miss = f ? [...new Map(f.missed.map(r => [r[1], r])).values()] : [];
  const cells = [];
  if (f && (f.plan || f.adhoc)) cells.push(bigNum('Visits · planned vs done', `${fN(f.done)}<small>/ ${fN(f.plan)}</small>`, `${f.pct == null ? '–' : fP(f.pct)} done · ${plural(miss.length, 'dealer')} missed${miss.length ? ': ' + esc(miss.slice(0, 3).map(r => r[2]).join(', ')) : ''}`),
    bigNum('Normal · Ad-hoc visits', `${fN(f.done)}<small> normal · ${fN(f.adhoc)} ad-hoc</small>`, 'Normal = planned PJP visits made; ad-hoc = unplanned visits logged'));
  if (f && f.days) cells.push(bigNum('Time in the market', hrs(f.span) + '<small>/day</small>', `first check-in ~${hhmm(f.firstIn)} · last check-out ~${hhmm(f.lastOut)} · ${hrs(f.atDealer)}/day at dealers · ${plural(f.days, 'day')}`));
  if (att.length) cells.push(bigNum('Attendance', `${fN(f.att.P || 0)}<small> days present</small>`, att.map(([k, v]) => `${esc(k)} ${v}`).join(' · ')));
  if (t) cells.push(bigNum('Team visits', `${fN(t.done)}<small>/ ${fN(t.plan)}</small>`, `${fP(t.pct)} done · ${fN(t.adhoc)} ad-hoc${t.span != null ? ' · avg ' + hrs(t.span) + '/day in market' : ''}${t.low ? ' · lowest ' + esc(t.low.n) + ' ' + fP(t.low.f.pct) : ''}`));
  if (k) cells.push(bigNum('Display contest · audits', `${fN(k.done)}<small>/ ${fN(k.plan)}</small>`,
    `R${k.round} due ${k.due} ${MON[DB.m - 1]}: ${plural(k.left, 'outlet')} left · ${fN(k.q)} of ${fN(k.o)} qualified${k.sc != null ? ' · avg score ' + fP(k.sc) : ''}${lvl === 'SE' ? (k.trained === 1 ? ' · trained' : ' · not trained yet') : ` · ${k.trained}/${k.ses} SEs trained${k.unmapped ? ' · ' + k.unmapped + ' outlets unmapped' : ''}`}`));
  return cells.length ? `<div class="card"><div class="card-h"><h3>Field work · month to date</h3><span class="muted small">Visits from the PJP sheets · hours from Check In Check out · to ${dLabel(fieldDay())}</span></div><div class="card-b"><div class="grid4">${cells.join('')}</div></div></div>` : '';
}
function wireProfile(el, lvl, name) {
  const p = perfOf(scopeF(lvl === 'ASM' ? { asm: name } : { se: name }));
  const s = []; for (let d = 1; d <= ST.day; d++) s.push(d);
  barChart(el.querySelector(`#${lvl}Ch`), { label: 'Units per day', x: s.map(String), v: s.map(d => p.du[d]), sun: s.map(d => DB.sun(d)), ref: p.need,
    tip: i => `<b>${dLabel(s[i])}</b><br>${fN(p.du[s[i]])} units${p.dailyT ? `<br>Plan average ${fN(p.dailyT)}/working day` : ''}` });
  if (lvl === 'ASM') gridTable(el.querySelector('#profTeam'), rseCols().filter(c => !['asm', 'zone'].includes(c.k)), rankRows(teamOf(name)), 'pteam', r => openProfile('SE', r.name));
  el.querySelectorAll('[data-pa]').forEach(b => b.onclick = () => {
    const a = b.dataset.pa;
    if (a === 'close') { if (lvl === 'ASM') ST.asmSel = ''; else ST.rseSel = ''; renderTab(ST.tab); }
    else if (a === 'xls') runExport(lvl === 'ASM' ? 'curASM' : 'curRSE', false, name);
    else if (a === 'wa' || a === 'mail') { const pl = lvl === 'ASM' ? dailyASM(name) : dailyRSE(name); openShare(pl).then(() => { if (a === 'mail') $('#shMail').click(); }); }
    else { ST.planLvl[a] = lvl; ST.planSel[a][lvl] = name; onTab(a); }
  });
}

/* ---------- plan modules (daily / weekly) ---------- */
function plansFor(type, lvl) {
  if (type === 'daily') return lvl === 'ASM' ? asmRows().map(x => dailyASM(x.name)) : rseRows().map(x => dailyRSE(x.name));
  return lvl === 'ASM' ? asmRows().map(x => weeklyASM(x.name, ST.week)) : rseRows().map(x => weeklyRSE(x.name, ST.week));
}
const STAT_ORDER = { crit: 0, behind: 1, watch: 2, nd: 3, ok: 4 };
function renderPlans(type) {
  const pre = type === 'daily' ? 'd' : 'w', lvl = ST.planLvl[type];
  if (type === 'weekly') {
    if (!ST.week || !weeks().some(w => w.n === ST.week && w.s <= effDay(ST.day))) ST.week = defaultWeek();
    const W = weeks().filter(w => w.s <= effDay(ST.day));
    $('#wWeeks').innerHTML = W.map(w => `<button type="button" data-wk="${w.n}" aria-pressed="${w.n === ST.week}">${w.label} · ${w.range}${w.e > effDay(ST.day) ? ' (partial)' : ''}</button>`).join('');
    $$('#wWeeks [data-wk]').forEach(b => b.onclick = () => { ST.week = +b.dataset.wk; renderPlans('weekly'); });
  }
  $$(`[data-${pre}lvl]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[pre + 'lvl'] === lvl)));
  const plans = plansFor(type, lvl).sort((a, b) => STAT_ORDER[a.p.status] - STAT_ORDER[b.p.status] || (b.p.gap || 0) - (a.p.gap || 0));
  const nA = asmRows().length, nR = rseRows().length;
  const head = type === 'daily' ? `Daily action plans for <b>${esc(planDate(ST.day).label)}</b>` : `Weekly action plans for <b>${esc(weekCtx(ST.week, ST.day).label)}</b> · based on ${esc(weeks().find(w => w.n === ST.week).label)}`;
  $(`#${pre}Head`).innerHTML = `${head} · data to ${dLabel(effDay(ST.day))}<br><span class="muted small">Output covers <b>${esc(scopeLbl())}</b>: ${plural(nA, 'ASM plan')} and ${plural(nR, 'SE plan')}. Change Zone / ASM / SE in the filter bar to narrow it.</span>`;
  if (type === 'weekly') {
    const c = weekCtx(ST.week, ST.day);
    $('#wWarn').hidden = !c.partial;
    if (c.partial) $('#wWarn').innerHTML = `<b>${c.w.label} is still in progress</b> — data to ${dLabel(ST.day)} (${DB.wd[Math.min(c.w.e, ST.day)] - DB.wd[c.w.s - 1]} of ${c.w.wd} working days). Week percentages compare units with the pro-rata target for the days elapsed, so they stay comparable with earlier weeks, but the week can still change. Pick the last complete week for a settled plan.`;
    renderReview();
  }
  const sel = ST.planSel[type][lvl] && plans.some(x => x.name === ST.planSel[type][lvl]) ? ST.planSel[type][lvl] : (plans[0] || {}).name;
  ST.planSel[type][lvl] = sel;
  $(`#${pre}List`).innerHTML = plans.map(pl => { const ps = planStatus(type, lvl, pl.name, pl.period), hi = pl.items.filter(x => x.priority === 'High').length;
    return `<button type="button" class="pcard${pl.name === sel ? ' on' : ''}" data-pn="${esc(pl.name)}"><span class="pc-t"><b>${esc(pl.name)}</b>${stPill(pl.p.status)}</span><span class="small muted">${esc(pl.zone)}${lvl === 'SE' ? ' · ' + esc(pl.asm) : ''} · pace ${fP(pl.p.pace)}</span><span class="pc-t small"><span>${pl.items.length} actions${hi ? ` · <b style="color:var(--crit)">${hi} high</b>` : ''}</span>${pillH(ps.k, ps.l)}</span></button>`; }).join('') || '<p class="muted">Nobody in this scope.</p>';
  $$(`#${pre}List [data-pn]`).forEach(b => b.onclick = () => { ST.planSel[type][lvl] = b.dataset.pn; renderPlans(type); });
  const pl = plans.find(x => x.name === sel);
  $(`#${pre}Detail`).innerHTML = pl ? planDetailHTML(pl) : '';
  if (pl) wirePlanDetail($(`#${pre}Detail`), pl, type);
}
function planDetailHTML(pl) {
  const p = pl.p, recs = trkFor(pl.type, pl.level, pl.name, pl.period), gen = recs.length > 0;
  const recOf = it => TRK[trkId(pl.type, pl.level, pl.name, pl.period, it.key)];
  const o = p.official, steps = pl.type === 'daily' ? calcSteps(p) : [];
  const calc = steps.length ? `<details class="calc" open><summary>How these numbers are calculated</summary><table class="calc-tbl"><tbody>${steps.map(s => `<tr><th>${esc(s[0])}</th><td class="muted">${esc(s[1])}</td><td class="num"><b>${esc(s[2])}</b></td></tr>`).join('')}</tbody></table><p class="small muted" style="margin:6px 0 0">Source: Dashboard ${pl.level === 'ASM' ? 'ASM' : 'SE'} sheet of ${esc(SEED.meta.fromWorkbook || 'the master workbook')}, figures to ${esc(dLabel(effDay(ST.day)))}.</p></details>` : '';
  const metrics = pl.type === 'daily' && o
    ? `<span class="tag">Target ${fN(o.target)}</span><span class="tag">Ordered ${fN(o.orderAch)} (${fP(o.orderPct)})</span><span class="tag">Billed ${fN(o.billVol)} (${fP(o.billPct)})</span><span class="tag">Balance ${fN(Math.max(0, o.balance))}</span><span class="tag">Day target ${fN(o.balance > 0 ? Math.ceil(o.reqRR) : 0)}</span>`
    : pl.type === 'daily'
    ? `<span class="tag">Target ${p.plan ? fN(p.plan) : '–'}</span><span class="tag">Achieved ${fN(p.mtd)} (${fP(p.ach)})</span><span class="tag">Gap ${p.gap == null ? '–' : fN(p.gap)}</span><span class="tag">Day target ${p.need ? fN(Math.ceil(p.need)) : '–'}</span>`
    : `<span class="tag">Week target ${pl.wk ? fN(pl.wk.tTo) : '–'}</span><span class="tag">Week achieved ${pl.wk ? fN(pl.wk.units) : '–'} (${pl.wk ? fP(pl.wk.pct) : '–'})</span><span class="tag">Previous week ${pl.prev ? fP(pl.prev.pct) : '–'}</span>${trPill(pl.trend)}`;
  return `<div class="pd-h"><div><div class="eyebrow">${pl.level} ${pl.type} plan · ${esc(pl.zone)} zone${pl.level === 'SE' ? ' · ASM ' + esc(pl.asm || '–') : ''}</div><h2>${esc(pl.name)}</h2>
      <div class="toolbar">${stPill(p.status)}${metrics}</div></div>
      <div class="toolbar"><button class="btn sm wa" data-pd="wa">WhatsApp card</button><button class="btn sm mail" data-pd="mail">Email</button><button class="btn sm primary" data-pd="gen">${gen ? 'Refresh plan' : 'Generate plan'}</button><button class="btn sm" data-pd="xls">⬇ Excel</button><button class="btn sm" data-pd="prof">Profile</button></div></div>
    ${calc}
    ${gen ? '' : '<p class="hint">Draft — generate the plan to start tracking status and remarks. Generating never overwrites updates you have already made.</p>'}
    <div class="tbl-wrap"><table class="plan-tbl"><thead><tr><th>#</th><th>Performance gap &amp; evidence</th><th>Action required → expected outcome</th><th>Deadline · owner · follow-up</th><th>Status &amp; remarks</th></tr></thead><tbody>
    ${pl.items.map((x, n) => { const r = recOf(x); return `<tr><td class="num">${n + 1}<div style="margin-top:6px"><span class="pr pr-${x.priority}">${x.priority}</span></div></td>
      <td class="wrap-cell"><b>${esc(x.issue)}</b><div class="small muted">${esc(x.evidence)}</div><span class="basis b-${x.basis === BASIS.obs ? 'obs' : x.basis === BASIS.inv ? 'inv' : 'lim'}">${esc(x.basis)}</span></td>
      <td class="wrap-cell">${esc(r ? r.text : x.action)}${r && r.latest ? `<div class="small" style="color:var(--warn)">Latest recommendation: ${esc(r.latest)}</div>` : ''}<div class="small outc">→ ${esc(x.outcome)}</div></td>
      <td class="wrap-cell small nar"><b>${esc(x.deadline)}</b><br>${esc(x.owner)}<div class="muted">${esc(x.follow)}</div></td>
      <td class="nar">${r ? `<select class="mini st-sel" data-id="${esc(r.id)}">${STATUSES.map(s => `<option${s === r.status ? ' selected' : ''}>${s}</option>`).join('')}</select>${isOverdue(r) ? '<div class="small" style="color:var(--crit)">Overdue</div>' : ''}<input class="mini rm-in" data-id="${esc(r.id)}" value="${esc(r.remarks)}" placeholder="Add remark" style="margin-top:6px">` : '<span class="muted small">Draft — generate to track</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function wirePlanDetail(el, pl, type) {
  el.querySelectorAll('[data-pd]').forEach(b => b.onclick = async () => {
    const a = b.dataset.pd;
    if (a === 'gen') { const r = commitPlans([pl], type, pl.period, `${pl.level} ${pl.name}`); toast(`${pl.level} ${pl.name}: ${r.added} new action${r.added === 1 ? '' : 's'} recorded, ${r.kept} kept with their status.`); renderPlans(type); }
    else if (a === 'xls') runExport(pl.level === 'ASM' ? 'curASM' : 'curRSE', false, pl.name);
    else if (a === 'wa') openShare(pl);
    else if (a === 'mail') { await openShare(pl); $('#shMail').click(); }
    else if (a === 'prof') openProfile(pl.level, pl.name);
  });
  el.querySelectorAll('.st-sel').forEach(s => s.onchange = () => { trkUpdate(s.dataset.id, { status: s.value }); toast('Status saved in this browser.'); renderPlans(type); });
  el.querySelectorAll('.rm-in').forEach(i => i.onchange = () => { trkUpdate(i.dataset.id, { remarks: i.value }); toast('Remark saved in this browser.'); });
}
function generateAll(type) {
  const per = type === 'daily' ? dPeriod() : wPeriod();
  const plans = plansFor(type, 'ASM').concat(plansFor(type, 'SE'));
  const r = commitPlans(plans, type, per, scopeLbl());
  toast(`${type === 'daily' ? 'Daily' : 'Weekly'} plans generated for ${scopeLbl()}: ${plans.length} plans, ${r.items} actions (${r.added} new, ${r.kept} already tracked — their status was kept).`, 6500);
  renderPlans(type);
}
function renderReview() {
  const v = weeklyReview(ST.week), wl = `W${ST.week}`;
  const li = (arr, fmt) => arr.length ? arr.slice(0, 6).map(fmt).join('') : '<p class="muted small">None.</p>';
  const mvl = o => `<div class="kv click" data-go="p:${o.x.lvl}:${esc(o.x.name)}"><span>${esc(o.x.name)} <span class="muted small">${fP(o.pw.pct)} → ${fP(o.w.pct)}</span></span><b class="${o.d >= 0 ? 'up' : 'down'}">${o.d >= 0 ? '+' : ''}${Math.round(o.d * 100)} pts</b></div>`;
  $('#wReview').innerHTML = `
    <div class="rv"><h4>What went well</h4>${li(v.onTarget.sort((a, b) => b.w.pct - a.w.pct), o => `<div class="kv"><span>${esc(o.x.name)} hit ${fP(o.w.pct)} of the ${wl} target</span></div>`)}</div>
    <div class="rv"><h4>What did not go well</h4>${li(v.below.sort((a, b) => a.w.pct - b.w.pct), o => `<div class="kv click" data-go="p:SE:${esc(o.x.name)}"><span>${esc(o.x.name)} at ${fP(o.w.pct)} of the ${wl} target</span></div>`)}</div>
    <div class="rv"><h4>ASMs improved / declined</h4>${li(v.asmUp, mvl)}${li(v.asmDown, mvl)}</div>
    <div class="rv"><h4>SEs improved</h4>${li(v.rseUp, mvl)}</div>
    <div class="rv"><h4>SEs declined</h4>${li(v.rseDown, mvl)}</div>
    <div class="rv"><h4>Unresolved gaps (below ${fP(CFG.behind)} two weeks running)</h4>${li(v.unresolved, o => `<div class="kv click" data-go="p:SE:${esc(o.x.name)}"><span>${esc(o.x.name)}</span><b style="color:var(--crit)">${fP(o.pw.pct)} → ${fP(o.w.pct)}</b></div>`)}</div>
    <div class="rv"><h4>Actions to continue into next week</h4>${v.cont.length ? `<p class="small">${plural(v.cont.length, 'open action')} from ${wl} plans (${v.cont.filter(isOverdue).length} overdue). They appear as carried-forward items in next week's plans.</p>` : '<p class="muted small">No open tracked actions from this week.</p>'}</div>
    <p class="small muted" style="grid-column:1/-1;margin:0">Comparisons use whole-week totals against pro-rata week targets (${wl} vs W${ST.week - 1}); a single strong day does not count as a trend. Movement under ±${Math.round(CFG.stable * 100)} points is treated as stable.</p>`;
}

/* ---------- trends extras ---------- */
function renderTrendsExtra() {
  const f = curF(), p = perfOf(f);
  $('#trWeekScope').innerHTML = `<thead><tr><th>Week</th><th>Dates</th><th class="r">Working days</th><th class="r">Target (pro-rata)</th><th class="r">Units</th><th class="c">Ach %</th><th>Status</th><th class="r">Best day</th><th class="r">No-billing days</th><th class="r">New billing points</th></tr></thead><tbody>
    ${p.wk.map(w => `<tr><td><b>${w.label}</b>${w.complete ? '' : ' <span class="tag">partial</span>'}</td><td>${w.range}</td><td class="r num">${w.wdTo}/${w.wd}</td><td class="r num">${fN(w.tTo)}</td><td class="r num">${fN(w.units)}</td><td class="c">${heatP(w.pct)}</td><td>${stPill(paceStatus(w.pct))}</td><td class="r num">${w.bestD ? fN(w.best) + ' · ' + w.bestD : '–'}</td><td class="r num">${w.zero}</td><td class="r num">${fN(w.bpNew)}</td></tr>`).join('')}</tbody>`;
  const W = weeks().filter(w => w.s <= effDay(ST.day));
  const rows = rankRows(rseRows()).concat([]), asms = rankRows(asmRows());
  const wkCols = lvl => [C.name(lvl), ...(lvl === 'SE' ? [C.asm] : []), C.zone, ...W.map(w => ({ k: 'w' + w.n, h: `${w.label}${w.e > ST.day ? '*' : ''}`, cls: 'c', html: r => heatP((r.p.wk.find(x => x.n === w.n) || {}).pct), val: r => (r.p.wk.find(x => x.n === w.n) || {}).pct })),
    { k: 'chg', h: 'Change (last 2 complete)', cls: 'r num', html: r => r.p.trend.d == null ? '–' : `<span class="${r.p.trend.d >= 0 ? 'up' : 'down'}">${r.p.trend.d >= 0 ? '+' : ''}${Math.round(r.p.trend.d * 100)} pts</span>`, val: r => r.p.trend.d }, C.trend, C.pace];
  gridTable($('#trImpAsm'), wkCols('ASM'), asms, 'tia', r => openProfile('ASM', r.name));
  gridTable($('#trImpRse'), wkCols('SE'), rows, 'tir', r => openProfile('SE', r.name));
  const cnt = k => rows.filter(x => x.p.trend.k === k).length;
  $('#trImpSum').innerHTML = [['strong', 'Strong & consistent'], ['up', 'Improving'], ['flat', 'Stable'], ['down', 'Declining'], ['low', 'Consistently low'], ['insufficient', 'Insufficient data']].map(([k, l]) => `<div class="sumchip"><b class="num">${cnt(k)}</b><span>${l}</span></div>`).join('');
}

/* ---------- tracking ---------- */
function renderTracking() {
  const t = ST.tf, all = Object.values(TRK);
  const zones = [...new Set(all.map(r => r.zone).filter(Boolean))].sort();
  $('#tfZone').innerHTML = '<option value="">All zones</option>' + zones.map(z => `<option${z === t.zone ? ' selected' : ''}>${esc(z)}</option>`).join('');
  const rows = trackRows();
  const c = s => all.filter(r => r.status === s).length;
  $('#trkChips').innerHTML = `<div class="sumchip"><b class="num">${all.length}</b><span>Tracked actions</span></div>` + STATUSES.map(s => `<div class="sumchip"><b class="num">${c(s)}</b><span>${s}</span></div>`).join('')
    + `<div class="sumchip"><b class="num" style="color:var(--crit)">${all.filter(isOverdue).length}</b><span>Overdue</span></div><div class="sumchip"><b class="num">${all.filter(r => r.confirmed).length}</b><span>Confirmed by manager</span></div>`;
  $('#trkNote').textContent = `${rows.length} of ${all.length} actions shown · stored in this browser only (see Method → Data & security) · overdue = not completed and past its due date.`;
  const cols = [
    { k: 'period', h: 'Period', html: r => `${esc(r.periodLabel || r.period)}<div class="small muted">${r.type}</div>`, val: r => r.periodEnd || r.period },
    { k: 'name', h: 'Person', sticky: true, asc: true, html: r => `<b>${esc(r.name)}</b><div class="small muted">${r.level} · ${esc(r.zone)}${r.level === 'SE' ? ' · ' + esc(r.asm) : ''}</div>`, val: r => r.name },
    { k: 'priority', h: 'Priority', html: r => `<span class="pr pr-${r.priority}">${r.priority}</span>`, val: r => PRIO_RANK[r.priority] },
    { k: 'issue', h: 'Gap', cls: 'wrap-cell', html: r => esc(r.issue), val: r => r.issue },
    { k: 'text', h: 'Agreed action', cls: 'wrap-cell', html: r => esc(r.text) + (r.latest ? `<div class="small" style="color:var(--warn)">Latest recommendation: ${esc(r.latest)}</div>` : ''), val: null },
    { k: 'owner', h: 'Owner', html: r => esc(r.owner), val: r => r.owner },
    { k: 'due', h: 'Due', html: r => `${esc(r.due || '')}${isOverdue(r) ? '<div class="small" style="color:var(--crit)">Overdue</div>' : ''}`, val: r => r.due },
    { k: 'status', h: 'Status', html: r => `<select class="mini st-sel" data-id="${esc(r.id)}">${STATUSES.map(s => `<option${s === r.status ? ' selected' : ''}>${s}</option>`).join('')}</select>`, val: r => STATUSES.indexOf(r.status) },
    { k: 'remarks', h: 'Remarks', html: r => `<input class="mini rm-in" data-id="${esc(r.id)}" value="${esc(r.remarks)}" placeholder="Add update">`, val: null },
    { k: 'conf', h: 'Confirmed', cls: 'c', html: r => `<input type="checkbox" class="cf-in" data-id="${esc(r.id)}"${r.confirmed ? ' checked' : ''} aria-label="Confirmed by manager">`, val: r => r.confirmed ? 1 : 0 },
    { k: 'updated', h: 'Last updated', html: r => r.updated ? new Date(r.updated).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '<span class="muted small">never</span>', val: r => r.updated || '' },
  ];
  if (!ST.sorts.trk) ST.sorts.trk = { k: 'period', d: -1 };
  gridTable($('#trkTable'), cols, rows, 'trk', null);
  const tb = $('#trkTable');
  tb.querySelectorAll('.st-sel').forEach(s => s.onchange = () => { trkUpdate(s.dataset.id, { status: s.value }); renderTracking(); });
  tb.querySelectorAll('.rm-in').forEach(i => i.onchange = () => trkUpdate(i.dataset.id, { remarks: i.value }));
  tb.querySelectorAll('.cf-in').forEach(i => i.onchange = () => trkUpdate(i.dataset.id, { confirmed: i.checked }));
  $('#trkLog').innerHTML = GEN.length ? `<thead><tr><th>Generated</th><th>Type</th><th>Period</th><th>Scope</th><th class="r">Plans</th><th class="r">Actions</th><th class="r">New</th><th class="r">Kept</th></tr></thead><tbody>${GEN.slice(-15).reverse().map(g => `<tr><td>${new Date(g.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${g.type}</td><td>${esc(g.period)}</td><td>${esc(g.scope)}</td><td class="r num">${g.plans}</td><td class="r num">${g.items}</td><td class="r num">${g.added}</td><td class="r num">${g.kept}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="muted">No plans generated yet in this browser.</td></tr></tbody>';
}
function trackRows() {
  const t = ST.tf, q = t.q.trim().toLowerCase();
  return Object.values(TRK).filter(r => (!t.type || r.type === t.type) && (!t.level || r.level === t.level) && (!t.status || r.status === t.status) && (!t.zone || r.zone === t.zone) && (!t.overdue || isOverdue(r))
    && (!q || (r.name + ' ' + r.asm + ' ' + r.issue + ' ' + r.text + ' ' + r.remarks).toLowerCase().includes(q)));
}

/* ---------- method extras: settings & data checks ---------- */
function renderMethodExtra() {
  const f = (k, lab, step, hint) => `<label class="cfg"><span>${lab}</span><input type="number" step="${step}" data-cfg="${k}" value="${k === 'maxDaily' || k === 'maxWeekly' ? CFG[k] : Math.round(CFG[k] * 100)}"><small>${hint}</small></label>`;
  $('#cfgForm').innerHTML = f('onTrack', 'On track at ≥ (% of pace)', 1, 'Benchmark for “meeting target”')
    + f('watch', 'Watch at ≥ (% of pace)', 1, 'Below this = needs improvement')
    + f('behind', 'Behind at ≥ (% of pace)', 1, 'Below this = Critical')
    + f('stable', 'Stable band (± points)', 1, 'Week-on-week change treated as no change')
    + f('maxDaily', 'Max actions per daily plan', 1, 'Highest priority first')
    + f('maxWeekly', 'Max actions per weekly plan', 1, '')
    + `<label class="cfg"><span>Day-end check time</span><input type="text" data-cfg="checkTime" value="${esc(CFG.checkTime)}"><small>Used as the daily deadline</small></label>
    <div class="toolbar" style="grid-column:1/-1"><button class="btn sm primary" id="cfgSave">Save settings</button><button class="btn sm" id="cfgReset">Restore defaults</button><span class="muted small">Defaults: 100 / 90 / 70% of pace, ±5 points, 6 actions. These are dashboard defaults, not company policy — set them to your business rules.</span></div>`;
  $('#cfgSave').onclick = () => { $$('#cfgForm [data-cfg]').forEach(i => { const k = i.dataset.cfg; if (k === 'checkTime') CFG[k] = i.value || CFG_DEFAULT.checkTime; else { const v = parseFloat(i.value); if (isFinite(v)) CFG[k] = k === 'maxDaily' || k === 'maxWeekly' ? Math.max(1, Math.round(v)) : v / 100; } }); saveCfg(); toast('Settings saved in this browser.'); renderAll(); };
  $('#cfgReset').onclick = () => { CFG = Object.assign({}, CFG_DEFAULT); saveCfg(); renderAll(); toast('Settings restored to defaults.'); };
  $('#dataChecks').innerHTML = `<thead><tr><th>Check</th><th class="r">Result</th><th>What it affects</th><th>Examples</th></tr></thead><tbody>${dataChecks().map(c => `<tr><td><b>${esc(c.h)}</b></td><td class="r num">${c.n === 0 ? '<span class="yes">0 ✓</span>' : `<b style="color:${c.sev === 'info' ? 'var(--ink)' : 'var(--crit)'}">${fN(c.n)}</b>`}</td><td class="wrap-cell small">${esc(c.impact)}</td><td class="wrap-cell small muted">${esc(c.ex || '')}</td></tr>`).join('')}</tbody>`;
}
function dataChecks() {
  const D = DB.D, out = [], seed = SEED.dealers.c.length;
  const noSe = []; const noAsm = []; const codes = new Map(); let neg = 0; const negL = [];
  const ds = dayState(ST.day);
  for (let i = 0; i < DB.n; i++) { if (!D.se[i]) noSe.push(i); if (!D.asm[i]) noAsm.push(i); codes.set(D.c[i], (codes.get(D.c[i]) || 0) + 1); if (ds.qty[i] < 0) { neg++; negL.push(i); } }
  const dup = [...codes].filter(x => x[1] > 1);
  out.push({ h: 'Dealers without an SE mapping', n: noSe.length, impact: 'Counted in zone and ASM totals but in no SE’s numbers or plan.', ex: noSe.slice(0, 4).map(dName).join('; ') });
  out.push({ h: 'Dealers without an ASM mapping', n: noAsm.length, impact: 'Missing from every ASM’s team total.', ex: noAsm.slice(0, 4).map(dName).join('; ') });
  out.push({ h: 'Duplicate dealer codes in the master', n: dup.length, impact: 'Could double-count dealers.', ex: dup.slice(0, 5).map(x => '#' + x[0]).join(', ') });
  const mism = DB.ses.map(s => ({ s, n: (DB.seIdx.get(s.n) || []).filter(i => D.asm[i] && D.asm[i] !== s.asm).length })).filter(x => x.n > 0);
  out.push({ h: 'SEs whose dealers sit under a different ASM', n: mism.length, impact: 'ASM team totals (by dealer) and team lists (by SE roster) can differ.', ex: mism.slice(0, 4).map(x => `${x.s.n} (${x.n} dealers)`).join('; ') });
  const noDeal = DB.ses.filter(s => !(DB.seIdx.get(s.n) || []).length);
  out.push({ h: 'SEs in the roster with no mapped dealers', n: noDeal.length, impact: 'Left out of SE views and plans.', ex: noDeal.slice(0, 6).map(s => s.n).join(', ') });
  const noPlan = rseRows(scopeF()).filter(x => !(x.p.plan > 0));
  out.push({ h: 'SEs with dealers but no volume plan', n: noPlan.length, impact: 'No target: status “No target”, plan item asks to validate the plan.', ex: noPlan.slice(0, 6).map(x => x.name).join(', ') });
  const noPjp = DB.sameMonth ? rseRows(scopeF()).filter(x => !pjpOf('SE', x.name)) : [];
  out.push({ h: 'SEs without a journey-plan (DJP/PJP) record', n: noPjp.length, impact: 'DJP visits shown as “–”; KPI 2 not scored for them.', ex: noPjp.slice(0, 6).map(x => x.name).join(', ') });
  out.push({ h: 'Dealers with net negative billing MTD (returns)', n: neg, impact: 'Reduce achievement; not treated as billing points.', ex: negL.slice(0, 4).map(dName).join('; ') });
  out.push({ h: 'Dealers in the uploaded dump but not in the master', n: Math.max(0, DB.n - seed), impact: 'Added with the SE from the dump’s SE code; no plan or MIS history.', sev: 'info' });
  out.push({ h: 'Billing month differs from the reference pack month', n: DB.sameMonth ? 0 : 1, impact: 'Plan, journey-plan and sub-dealer data are hidden: targets show “No target”.', ex: DB.sameMonth ? '' : `Billing ${DB.month}, pack ${SEED.meta.month}` });
  if (SEED.meta.fromWorkbook) {
    out.push({ h: 'Volume plan source', n: SEED.meta.planSrc === 'none' ? 1 : 0, impact: SEED.meta.planSrc === 'none' ? 'No plan: add a “Volume Plan” sheet (Dealer Code, Plan) to the workbook.' : 'Plan: ' + SEED.meta.planSrc, ex: '' });
    for (const w of SEED.meta.warnings || []) out.push({ h: 'Workbook note', n: 1, impact: w, sev: 'info' });
  }
  return out;
}

/* ---------- tab router (called by core onTab / renderAll) ---------- */
function renderTab(t) {
  if (!DB) return;
  if (!ST.week || !weeks().some(w => w.n === ST.week && w.s <= effDay(ST.day))) ST.week = defaultWeek();
  if (t === 'home') renderHome();
  else if (t === 'data') renderData();
  else if (t === 'overview') renderExec();
  else if (t === 'zones') renderZones();
  else if (t === 'asm') renderAsm();
  else if (t === 'rse') renderRse();
  else if (t === 'daily') renderPlans('daily');
  else if (t === 'weekly') renderPlans('weekly');
  else if (t === 'monthly') renderMonthly();
  else if (t === 'monthwise') renderMonthwise();
  else if (t === 'daywise') renderTrendsExtra();
  else if (t === 'tracking') renderTracking();
  else if (t === 'export') renderExportCentre();
  else if (t === 'method') renderMethodExtra();
}
