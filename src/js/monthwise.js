'use strict';
/* ================= month-wise performance (zone / ASM / SE, month by month) =================
   Data: SEED.history.months = { 'YYYY-MM': { asOf, closed, Z: {}, ASM: {}, SE: {} } } (workbook.js).
   Per name: d dealers, a active, u units, v value ₹, bp billing points, md models per billed dealer,
   pp / pa DJP visits planned / made, off = official target / ordered / billed (months with a Dashboard). */

const MW_METRICS = [
  { k: 'u', l: 'Units billed', f: x => x.u, fmt: v => fN(v), sum: true },
  { k: 'v', l: 'Value (₹ lakh)', f: x => x.v / 1e5, fmt: v => f1(v), sum: true },
  { k: 'asp', l: 'ASP (₹ per unit)', f: x => x.u > 0 ? x.v / x.u : null, fmt: v => fN(v), ratio: (a, b) => b > 0 ? a / b : null, parts: x => [x.v, x.u] },
  { k: 'bp', l: 'Billing points (dealers billed)', f: x => x.bp, fmt: v => fN(v), sum: true },
  { k: 'cov', l: 'Coverage (billed ÷ active dealers)', f: x => x.a ? x.bp / x.a : null, fmt: v => fP(v), pct: true, parts: x => [x.bp, x.a] },
  { k: 'md', l: 'Models per billed dealer', f: x => x.md, fmt: v => v == null ? '–' : f1(v) },
  { k: 'djp', l: 'DJP visits made %', f: x => x.pp ? x.pa / x.pp : null, fmt: v => fP(v), pct: true, parts: x => [x.pa || 0, x.pp || 0] },
  { k: 't', l: 'Target (official)', f: x => x.off ? x.off.t : null, fmt: v => fN(v), sum: true },
  { k: 'bpct', l: 'Billed % of target (official)', f: x => x.off && x.off.t ? x.off.b / x.off.t : null, fmt: v => fP(v), pct: true, parts: x => x.off ? [x.off.b || 0, x.off.t || 0] : [0, 0] },
  { k: 'opct', l: 'Ordered % of target (official)', f: x => x.off && x.off.t ? x.off.o / x.off.t : null, fmt: v => fP(v), pct: true, parts: x => x.off ? [x.off.o || 0, x.off.t || 0] : [0, 0] },
];
const MW = { lvl: 'SE', m: 'u', sel: null, sort: { k: 'name', d: 1 } };
const mwMonths = () => Object.keys(((SEED && SEED.history) || {}).months || {}).sort();
const mwLbl = ym => `${MON[+ym.slice(5, 7) - 1]}-${ym.slice(2, 4)}`;
const LVLK = { Zone: 'Z', ASM: 'ASM', SE: 'SE' };

function mwNames(lvl) {
  const H = SEED.history.months, set = new Map();
  for (const ym of mwMonths()) for (const [n, x] of Object.entries(H[ym][LVLK[lvl]] || {})) set.set(n, Object.assign({}, set.get(n), { z: x.z || (lvl === 'Zone' ? n : ''), asm: x.asm || '' }));
  return [...set].filter(([n, x]) => lvl === 'Zone' ? (!ST.zone || n === ST.zone)
    : lvl === 'ASM' ? (!ST.zone || x.z === ST.zone) && (!ST.asm || n === ST.asm)
    : (!ST.zone || x.z === ST.zone) && (!ST.asm || x.asm === ST.asm) && (!ST.se || n === ST.se)).map(([n, x]) => Object.assign({ n }, x));
}
const mwVal = (met, ym, lvl, n) => { const x = ((SEED.history.months[ym] || {})[LVLK[lvl]] || {})[n]; return x ? met.f(x) : null; };
function mwTotal(met, ym, lvl, names) {
  const xs = names.map(o => ((SEED.history.months[ym] || {})[LVLK[lvl]] || {})[o.n]).filter(Boolean); if (!xs.length) return null;
  if (met.sum) { const vs = xs.map(met.f).filter(v => v != null); return vs.length ? vs.reduce((a, b) => a + b, 0) : null; }
  if (met.parts) { const p = xs.map(met.parts); const a = p.reduce((s, x) => s + (x[0] || 0), 0), b = p.reduce((s, x) => s + (x[1] || 0), 0); return b > 0 ? a / b : null; }
  return null;
}
const mwChg = (met, a, b) => a == null || b == null ? null : met.pct || met.k === 'md' ? a - b : b ? a / b - 1 : null;
const mwChgH = (met, d) => d == null ? '–' : `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${met.pct ? Math.round(d * 100) + ' pts' : met.k === 'md' ? f1(d) : Math.round(d * 100) + '%'}</span>`;

function renderMonthwise() {
  const el = $('#mwBody'), months = mwMonths();
  if (!months.length) { $('#mwHead').innerHTML = '<b>No month-wise history yet.</b>'; el.innerHTML = '<div class="card"><div class="card-b prose"><p>Upload the master workbook once (with its Dealer_Vol1 / Dealer_Val1 month columns). Each upload keeps the current month and the two before it; months saved earlier stay, so they never need uploading again.</p></div></div>'; return; }
  const role = (SEED.meta.user || {}).role || 'admin';
  if (role !== 'admin' && MW.lvl === 'Zone') MW.lvl = role === 'SE' ? 'SE' : 'ASM';
  $$('[data-mwl]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.mwl === MW.lvl)); b.hidden = role !== 'admin' && b.dataset.mwl === 'Zone'; });
  $('#mwMetric').innerHTML = MW_METRICS.map(m => `<option value="${m.k}"${m.k === MW.m ? ' selected' : ''}>${esc(m.l)}</option>`).join('');
  const met = MW_METRICS.find(m => m.k === MW.m), lvl = MW.lvl, names = mwNames(lvl), last = months[months.length - 1], prev = months[months.length - 2];
  const H = SEED.history.months;
  $('#mwHead').innerHTML = `<b>Month-wise performance</b> · ${months.map(mwLbl).join(' → ')} · ${plural(names.length, lvl === 'Zone' ? 'zone' : lvl)} in ${esc(scopeLbl())}<br><span class="muted small">${months.map(ym => `${mwLbl(ym)}: ${H[ym].closed ? 'full month' : 'month to date, data to ' + esc(H[ym].asOf)}`).join(' · ')}. Units, value, billing points and models come from the dealer sheets (Dealer_Vol1 / Val1 / MBD1); targets and billed % only for months whose Dashboard SE / ASM was uploaded.</span>`;
  let rows = names.map(o => ({ o, vals: months.map(ym => mwVal(met, ym, lvl, o.n)) }));
  rows.forEach(r => { r.chg = prev ? mwChg(met, r.vals[months.length - 1], r.vals[months.length - 2]) : null; });
  const s = MW.sort, key = r => s.k === 'name' ? r.o.n : s.k === 'chg' ? r.chg : r.vals[+s.k];
  rows.sort((a, b) => { const x = key(a), y = key(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * s.d; });
  const th = (k, l, cls = '') => `<th class="${cls} sortable" data-mws="${k}">${l}${s.k === k ? (s.d > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const tot = months.map(ym => mwTotal(met, ym, lvl, names));
  $('#mwTable').innerHTML = `<thead><tr>${th('name', lvl)}${lvl !== 'Zone' ? '<th>Zone</th>' : ''}${lvl === 'SE' ? '<th>ASM</th>' : ''}${months.map((ym, i) => th(String(i), mwLbl(ym) + (H[ym].closed ? '' : ' (MTD)'), 'r'))}${prev ? th('chg', `${mwLbl(last)} vs ${mwLbl(prev)}`, 'r') : ''}</tr></thead><tbody>
    ${rows.map(r => `<tr class="click${r.o.n === MW.sel ? ' on' : ''}" data-mwn="${esc(r.o.n)}"><td><b>${esc(r.o.n)}</b></td>${lvl !== 'Zone' ? `<td class="small">${esc(r.o.z)}</td>` : ''}${lvl === 'SE' ? `<td class="small">${esc(r.o.asm)}</td>` : ''}${r.vals.map(v => `<td class="r num">${met.pct ? heatP(v) : met.fmt(v)}</td>`).join('')}${prev ? `<td class="r num">${mwChgH(met, r.chg)}</td>` : ''}</tr>`).join('') || `<tr><td class="muted">Nobody in this scope.</td></tr>`}
    ${rows.length > 1 && tot.some(v => v != null) ? `<tr class="tot"><td><b>Total shown</b></td>${lvl !== 'Zone' ? '<td></td>' : ''}${lvl === 'SE' ? '<td></td>' : ''}${tot.map(v => `<td class="r num"><b>${met.fmt(v)}</b></td>`).join('')}${prev ? `<td class="r num"><b>${mwChgH(met, mwChg(met, tot[months.length - 1], tot[months.length - 2]))}</b></td>` : ''}</tr>` : ''}</tbody>`;
  $$('#mwTable [data-mws]').forEach(t => t.onclick = () => { const k = t.dataset.mws; MW.sort = { k, d: MW.sort.k === k ? -MW.sort.d : (k === 'name' ? 1 : -1) }; renderMonthwise(); });
  $$('#mwTable [data-mwn]').forEach(t => t.onclick = () => { MW.sel = t.dataset.mwn; renderMonthwise(); $('#mwDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  if (!names.some(o => o.n === MW.sel)) MW.sel = names.length === 1 ? names[0].n : null;
  $('#mwDetail').hidden = !MW.sel;
  if (MW.sel) {
    const o = names.find(x => x.n === MW.sel);
    $('#mwDetail').innerHTML = `<div class="card-h"><h3>${esc(MW.sel)} · all measures by month</h3><span class="muted small">${lvl}${o.z && lvl !== 'Zone' ? ' · ' + esc(o.z) : ''}${o.asm ? ' · ASM ' + esc(o.asm) : ''}</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Measure</th>${months.map(ym => `<th class="r">${mwLbl(ym)}${H[ym].closed ? '' : ' (MTD)'}</th>`).join('')}${prev ? `<th class="r">${mwLbl(last)} vs ${mwLbl(prev)}</th>` : ''}</tr></thead><tbody>
      ${MW_METRICS.map(m => { const vs = months.map(ym => mwVal(m, ym, lvl, MW.sel)); return `<tr><td>${esc(m.l)}</td>${vs.map(v => `<td class="r num">${m.pct ? heatP(v) : m.fmt(v)}</td>`).join('')}${prev ? `<td class="r num">${mwChgH(m, mwChg(m, vs[vs.length - 1], vs[vs.length - 2]))}</td>` : ''}</tr>`; }).join('')}
      <tr><td>Dealers mapped / active</td>${months.map(ym => { const x = ((H[ym] || {})[LVLK[lvl]] || {})[MW.sel]; return `<td class="r num">${x ? `${fN(x.d)} / ${fN(x.a)}` : '–'}</td>`; }).join('')}${prev ? '<td></td>' : ''}</tr>
      <tr><td>DJP visits made / planned</td>${months.map(ym => { const x = ((H[ym] || {})[LVLK[lvl]] || {})[MW.sel]; return `<td class="r num">${x && x.pp ? `${fN(x.pa)} / ${fN(x.pp)}` : '–'}</td>`; }).join('')}${prev ? '<td></td>' : ''}</tr>
      </tbody></table></div>`;
  }
}
function mwExport() {
  const months = mwMonths(), lvl = MW.lvl, names = mwNames(lvl);
  const cols = [{ h: lvl, k: 'n', w: 26 }, ...(lvl !== 'Zone' ? [{ h: 'Zone', k: 'z', w: 10 }] : []), ...(lvl === 'SE' ? [{ h: 'ASM', k: 'asm', w: 22 }] : []),
    ...MW_METRICS.flatMap(m => months.map(ym => ({ h: `${m.l} · ${mwLbl(ym)}`, v: r => { const v = mwVal(m, ym, lvl, r.n); return v; }, w: 13, fmt: m.pct ? 'pct' : m.k === 'md' ? 'num1' : m.k === 'v' ? 'num1' : 'int' })))];
  downloadWorkbook(`Month_wise_${lvl}_${months.map(mwLbl).join('_')}_${scopeLbl()}`, [{ name: `Month-wise ${lvl}`, title: `Month-wise performance · ${lvl} · ${months.map(mwLbl).join(', ')}`, meta: [['Scope', scopeLbl()], ['Months', months.map(ym => `${mwLbl(ym)} (${SEED.history.months[ym].closed ? 'full month' : 'to ' + SEED.history.months[ym].asOf})`).join(', ')]], cols, rows: names, freezeCols: 1 }]);
}
function wireMonthwise() {
  $$('[data-mwl]').forEach(b => b.onclick = () => { MW.lvl = b.dataset.mwl; MW.sel = null; renderMonthwise(); });
  $('#mwMetric').onchange = e => { MW.m = e.target.value; renderMonthwise(); };
  $('#mwXls').onclick = mwExport;
}
