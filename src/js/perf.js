'use strict';
/* ================= performance layer =================
   Target       = the month's volume plan (dealer-wise plan in the reference pack, summed over the scope).
   Achievement  = net units billed (Cycle_Billing), month to date.
   Daily/weekly targets are pro-rata by working days (Sundays excluded) — the phasing the tracker already
   uses for "needed per day". Weeks follow the SE Evaluation workbook (KPI Config §5):
   W1 = 1–7, W2 = 8–14, W3 = 15–21, W4 = 22–28, W5 = 29–month end.
   ASM / Zone achievement % = Σ achievement ÷ Σ target of the scope (never an average of SE percentages). */

const CFG_KEY = 'djp.cfg.v1';
const CFG_DEFAULT = { onTrack: 1.0, watch: 0.9, behind: 0.7, stable: 0.05, maxDaily: 9, maxWeekly: 6, checkTime: '6:00 pm', minField: 6, startBy: '10:30' };
let CFG = Object.assign({}, CFG_DEFAULT, (() => { try { return JSON.parse(store.get(CFG_KEY) || '{}'); } catch (e) { return {}; } })());
function saveCfg() { store.set(CFG_KEY, JSON.stringify(CFG)); if (DB) DB.cache.clear(); }

const PSTAT = {
  ok: { k: 'good', l: 'On track' }, watch: { k: 'warn', l: 'Watch' }, behind: { k: 'serious', l: 'Behind' },
  crit: { k: 'crit', l: 'Critical' }, nd: { k: 'nd', l: 'No target' },
};
function paceStatus(p) {
  if (p == null || !isFinite(p)) return 'nd';
  if (p >= CFG.onTrack) return 'ok';
  if (p >= CFG.watch) return 'watch';
  if (p >= CFG.behind) return 'behind';
  return 'crit';
}
const prioOf = st => st === 'crit' || st === 'behind' ? 'High' : st === 'watch' || st === 'nd' ? 'Medium' : 'Low';
const PRIO_RANK = { High: 0, Medium: 1, Low: 2 };
const isoD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayDate = d => new Date(DB.y, DB.m - 1, d);
const longD = d => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;

/* next working day after the data date — the day a daily plan is for */
function planDate(day) {
  const x = dayDate(effDay(day) + 1); while (x.getDay() === 0) x.setDate(x.getDate() + 1);
  return { d: x, iso: isoD(x), label: longD(x) };
}

function weeks() {
  const out = [];
  for (let n = 1, s = 1; s <= DB.dim && n <= 5; n++, s += 7) {
    const e = n === 5 ? DB.dim : Math.min(DB.dim, s + 6);
    out.push({ n, s, e, wd: DB.wd[e] - DB.wd[s - 1], label: `W${n}`, range: `${s}–${e} ${MON[DB.m - 1]}` });
  }
  return out;
}
const weekOfDay = d => weeks().find(w => d >= w.s && d <= w.e);

/* units per dealer per day (dealer index × day) */
function dayMatrix() {
  if (DB.cache.has('dm')) return DB.cache.get('dm');
  const Wd = DB.dim + 1, M = new Float64Array(DB.n * Wd);
  for (const f of DB.facts) M[f[0] * Wd + f[1]] += f[3];
  DB.cache.set('dm', M); return M;
}

function trendOf(wk) {
  const done = wk.filter(w => w.complete && w.pct != null && w.wdTo > 0);
  if (done.length < 2) return { k: 'insufficient', l: 'Insufficient data', d: null, basis: done.length ? 'Only one complete week so far' : 'No complete week yet' };
  const a = done[done.length - 2], b = done[done.length - 1], d = b.pct - a.pct;
  const basis = `${b.label} ${fP(b.pct)} vs ${a.label} ${fP(a.pct)} of pro-rata target`;
  if (a.pct >= CFG.onTrack && b.pct >= CFG.onTrack) return { k: 'strong', l: 'Strong & consistent', d, basis };
  if (d > CFG.stable) return { k: 'up', l: 'Improving', d, basis };
  if (d < -CFG.stable) return { k: 'down', l: 'Declining', d, basis };
  if (done.every(w => w.pct < CFG.watch)) return { k: 'low', l: 'Consistently low', d, basis };
  return { k: 'flat', l: 'Stable', d, basis };
}
const TREND_CLS = { strong: 'good', up: 'good', down: 'crit', low: 'serious', flat: 'nd', insufficient: 'nd' };

/* official figures from the workbook's Dashboard SE / Dashboard ASM sheets (as of the data date).
   SE → its own row; ASM → its row; zone / all → sum of the ASM rows. Not used with state/category
   filters or when looking at an earlier day. Balance and run rates are ORDER based, as in the workbook:
   balance = target − MTD orders; required run rate = balance ÷ calendar days left; current = orders ÷ days gone. */
/* the dashboards' own date (may be later than the Billing sheet) */
const offDay = () => Math.max(DB.maxDay, (SEED && SEED.meta && SEED.meta.dashDay) || 0);
const effDay = day => day === DB.maxDay && SEED && SEED.dash ? offDay() : day;
function officialOf(f, day) {
  const dash = SEED && SEED.dash; if (!dash || f.st || f.dist || f.cat || day !== DB.maxDay) return null;
  let rows;
  if (f.se) rows = dash.SE[f.se] ? [dash.SE[f.se]] : null;
  else if (f.asm) rows = dash.ASM[f.asm] ? [dash.ASM[f.asm]] : null;
  else { const as = DB.asms.filter(a => (!f.zone || a.z === f.zone) && (!f.rsm || rsmOf(a.n) === f.rsm)).map(a => dash.ASM[a.n]).filter(Boolean); rows = as.length ? as : null; }
  if (!rows || !rows.some(r => r.target || r.orderAch || r.billVol)) return null;
  const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const o = { target: sum('target'), billVol: sum('billVol'), mtdPlan: sum('mtdPlan'), orderAch: sum('orderAch'), balance: sum('balance'),
    curRR: sum('curRR'), reqRR: sum('reqRR'), open: sum('open'), cancel: rows.some(r => r.cancel != null) ? sum('cancel') : null, dayPunch: sum('dayPunch'), bpT: sum('bpT'), bpA: sum('bpA'), daysLeft: DB.dim - offDay(), daysGone: offDay() };
  if (rows.length === 1) { o.mbdT = rows[0].mbdT; o.mbdA = rows[0].mbdA; o.reqRR = rows[0].reqRR; o.curRR = rows[0].curRR; }
  else { const ok = rows.filter(r => r.balance > 0); o.reqRR = o.daysLeft > 0 ? ok.reduce((s, r) => s + r.balance, 0) / o.daysLeft : 0; }
  if (!(o.reqRR > 0)) o.reqRR = o.balance > 0 && o.daysLeft > 0 ? o.balance / o.daysLeft : 0;
  o.billPct = o.target ? o.billVol / o.target : null; o.orderPct = o.target ? o.orderAch / o.target : null;
  o.pending = Math.max(0, o.orderAch - o.billVol);
  return o;
}

/* full performance picture for any scope f = {zone, asm, se, st, cat} as of `day` */
function perfOf(f, day = ST.day) {
  const key = 'pf' + JSON.stringify(f) + '|' + day; if (DB.cache.has(key)) return DB.cache.get(key);
  const idx = idxFor(f), Wd = DB.dim + 1, M = dayMatrix(), D = DB.D;
  const du = new Array(Wd).fill(0), bp = new Array(Wd).fill(0);
  let plan = 0, active = 0;
  for (const i of idx) {
    plan += D.pl[i] || 0; if (D.s[i] === 'A') active++;
    let c = 0; for (let d = 1; d <= day; d++) { const q = M[i * Wd + d]; du[d] += q; c += q; if (c > 0) bp[d]++; }
  }
  if (!DB.sameMonth) plan = 0;
  const off = officialOf(f, day);
  if (off) plan = off.target;
  const cum = [0]; for (let d = 1; d <= day; d++) cum[d] = cum[d - 1] + du[d];
  const r = scopeCalc(f, day);
  const wdGone = DB.wd[day], wdLeft = DB.wdTotal - wdGone, share = DB.wdTotal ? wdGone / DB.wdTotal : 0;
  const mtd = cum[day], expected = plan * share;
  const pace = plan > 0 && expected > 0 ? mtd / expected : null;
  const ach = plan > 0 ? mtd / plan : null;
  const gap = plan > 0 ? Math.max(0, plan - mtd) : null;
  const need = plan > 0 && wdLeft > 0 ? gap / wdLeft : null;
  const rr = wdGone ? mtd / wdGone : null;
  const dailyT = plan > 0 ? plan / DB.wdTotal : null;
  const wk = weeks().filter(w => w.s <= day).map(w => {
    const e = Math.min(w.e, day), wdTo = DB.wd[e] - DB.wd[w.s - 1];
    let units = 0, zero = 0, best = 0, bestD = 0;
    for (let d = w.s; d <= e; d++) { units += du[d]; if (!DB.sun(d) && du[d] <= 0) zero++; if (du[d] > best) { best = du[d]; bestD = d; } }
    const tFull = plan > 0 ? plan * w.wd / DB.wdTotal : null, tTo = plan > 0 ? plan * wdTo / DB.wdTotal : null;
    return { ...w, to: e, wdTo, complete: w.e <= day, units, tFull, tTo, pct: tTo ? units / tTo : null, zero, best, bestD, bpNew: bp[e] - (w.s > 1 ? bp[w.s - 1] : 0), cumEnd: cum[e] };
  });
  const k1 = r.o[1];
  const res = {
    f, day, idx, plan, active, du, bp, cum, mtd, expected, pace, ach, gap, need, rr, dailyT, wdGone, wdLeft, share, wk,
    trend: trendOf(wk), r, status: paceStatus(pace), bpPace: k1.has && share > 0 ? k1.a / (k1.t * share) : null, mapped: idx.length,
  };
  if (off) {   // the workbook's own numbers win: orders vs target, order-based balance and run rates
    const cal = offDay() / DB.dim;
    Object.assign(res, { official: off, plan: off.target, mtd: off.billVol, ach: off.billPct, orders: off.orderAch, orderPct: off.orderPct,
      gap: Math.max(0, off.balance), need: off.balance > 0 ? off.reqRR : 0, rr: off.curRR, expected: off.target * cal, daysLeft: off.daysLeft,
      pace: off.target ? off.orderAch / (off.target * cal) : null });
    res.status = paceStatus(res.pace);
    if (off.bpT) res.bpPace = off.bpA / (off.bpT * cal);
  }
  DB.cache.set(key, res); return res;
}

/* hierarchy rows (SE = SE in the source data) */
const scopeF = (o = {}) => Object.assign({ rsm: ST.rsm, zone: '', asm: '', se: '', st: ST.st, dist: ST.dist, cat: ST.cat }, o);
function rseRows(fz = curF(), day = ST.day) {
  return DB.ses.filter(s => (!fz.zone || s.z === fz.zone) && (!fz.asm || s.asm === fz.asm) && (!fz.se || s.n === fz.se) && (!fz.rsm || rsmOf(s.asm) === fz.rsm))
    .map(s => ({ lvl: 'SE', name: s.n, asm: s.asm, zone: s.z, code: s.code, p: perfOf(scopeF({ se: s.n }), day) }))
    .filter(x => x.p.mapped > 0 || x.p.official);
}
function teamOf(asm, day = ST.day) { return rseRows(scopeF({ asm }), day); }
function asmRows(fz = curF(), day = ST.day) {
  const se = fz.se ? DB.seInfo.get(fz.se) : null;
  return DB.asms.filter(a => (!fz.zone || a.z === fz.zone) && (!fz.asm || a.n === fz.asm) && (!se || a.n === se.asm) && (!fz.rsm || rsmOf(a.n) === fz.rsm))
    .map(a => { const team = teamOf(a.n, day); return { lvl: 'ASM', name: a.n, asm: a.n, zone: a.z, p: perfOf(scopeF({ asm: a.n }), day), team }; })
    .filter(x => x.p.mapped > 0 || x.p.official);
}
function zoneRows(day = ST.day) {
  return [...new Set(DB.asms.filter(a => !ST.rsm || rsmOf(a.n) === ST.rsm).map(a => a.z))].filter(Boolean).sort().map(z => ({ lvl: 'Zone', name: z, zone: z, p: perfOf(scopeF({ zone: z }), day) }));
}
// RSM-wise rows: each RSM with the ASMs and SEs under them (RSM taken from the journey-plan sheets)
function rsmRows(day = ST.day) {
  return rsmList().map(n => { const as = DB.asms.filter(a => rsmOf(a.n) === n);
    return { lvl: 'RSM', name: n, zone: [...new Set(as.map(a => a.z))].filter(Boolean).join(', '), asms: as.map(a => a.n), p: perfOf(scopeF({ rsm: n }), day), team: rseRows(scopeF({ rsm: n }), day) }; });
}
/* ranks by pace among rows that have a target */
function rankRows(rows) {
  rows.filter(x => x.p.pace != null).sort((a, b) => b.p.pace - a.p.pace).forEach((x, i, arr) => { x.rank = i + 1; x.of = arr.length; });
  return rows;
}
const teamCounts = team => ({ n: team.length, ok: team.filter(x => x.p.status === 'ok').length, watch: team.filter(x => x.p.status === 'watch').length,
  under: team.filter(x => x.p.status === 'behind' || x.p.status === 'crit').length, nd: team.filter(x => x.p.status === 'nd').length });

/* PJP / DJP visit adherence for a person: the PJP sheets (planned vs visited, to their latest day) when present, else the DJP summary */
function pjpOf(lvl, name) {
  if (!DB.sameMonth) return null;
  const f = fieldOf(lvl, name); if (f && f.plan) return { p: f.plan, a: f.done, pc: f.calls || 0, pct: f.pct };
  const x = lvl === 'ASM' ? DB.pjpASM[name] : DB.pjpSE[name];
  return x ? { p: x.p, a: x.a, pc: x.pc, pct: x.p ? x.a / x.p : null } : null;
}

/* field work for one SE / ASM up to `day`, from the PJP sheets (visits) and Check In Check out / Attendance (hours):
   { plan, done, pct, adhoc, missed: [rows], days, span, atDealer, firstIn, lastOut, last: [day, in, out, mins, visits, orders], att: { P: n, … } }
   plan / done = Normal (planned) visits; adhoc = Ad-hoc visits made; span = first check-in → last check-out, in minutes */
function fieldOf(lvl, name, day = ST.day) {
  if (!SEED || SEED.meta.month !== DB.month) return null;
  const latest = day >= DB.maxDay; day = fieldDay(day);
  // MTD DJP SUMMARY row (month to date, kept current by the team) wins over the PJP sheets for planned vs visited on the latest day
  const dj = latest && DB.sameMonth ? ((lvl === 'ASM' ? DB.pjpASM : DB.pjpSE) || {})[name] : null, djp = dj && !dj.src && dj.p ? dj : null;
  const rs = ((SEED.jplan && SEED.jplan.rows[lvl]) || {})[name] || [], f = ((SEED.field || {})[lvl] || {})[name];
  if (!rs.length && !f && !djp) return null;
  const up = rs.filter(r => r[0] <= day), norm = up.filter(r => !r[7]);
  const o = { plan: norm.length, done: norm.filter(r => r[5]).length, adhoc: up.filter(r => r[7] && r[5]).length, missed: norm.filter(r => !r[5]).sort((a, b) => b[0] - a[0]) };
  o.pct = o.plan ? o.done / o.plan : null;
  if (djp) { o.plan = djp.p; o.done = djp.a; o.pct = djp.a / djp.p; o.pc = djp.pc; o.djp = true; }
  // most visited dealers this month (normal + ad-hoc visits logged in the PJP sheets)
  const vc = new Map(); for (const r of up) if (r[5]) { const x = vc.get(r[1]) || { n: r[2], c: 0 }; x.c++; vc.set(r[1], x); }
  o.top = [...vc.values()].sort((a, b) => b.c - a.c);
  if (f) {
    const ds = Object.entries(f.d || {}).map(([d, x]) => [+d, ...x]).filter(x => x[0] <= day).sort((a, b) => a[0] - b[0]), full = ds.filter(x => x[2] != null);
    const avg = (a, k) => a.length ? a.reduce((s, x) => s + k(x), 0) / a.length : null;
    o.days = ds.length; o.span = avg(full, x => Math.max(0, x[2] - x[1])); o.atDealer = avg(ds, x => x[3]); o.firstIn = avg(ds, x => x[1]); o.lastOut = avg(full, x => x[2]);
    o.last = ds[ds.length - 1] || null; o.orders = ds.reduce((s, x) => s + x[5], 0); o.calls = ds.reduce((s, x) => s + x[4], 0);
    o.att = {}; for (const [d, v] of Object.entries(f.att || {})) if (+d <= day) o.att[v] = (o.att[v] || 0) + 1;
  }
  // coverage (SE): active mapped dealers visited at least once this month
  if (lvl === 'SE') { const seen = new Set(up.filter(r => r[5]).map(r => r[1])), own = [];
    for (let i = 0; i < DB.D.c.length; i++) if (DB.D.se[i] === name && DB.D.s[i] === 'A') own.push(i);
    o.cov = own.length ? { a: own.filter(i => seen.has(DB.D.c[i])).length, t: own.length, not: own.filter(i => !seen.has(DB.D.c[i])) } : null; }
  return o;
}
/* display contest (market activity) for one SE / ASM: plan = 2 audits per outlet (R1 in days 1–14, R2 from day 15)
   { o, r1, r2, done, plan, ph, q, sc, trained, st, unmapped, round, due, left, perDay, atStake, thr, models } */
const SHOW_CONTEST = false;   // display contest kept in the data but hidden from cards, messages and profiles for now — set true to show it again
function contestOf(lvl, name, day = ST.day) {
  const C = SEED && SEED.contest; if (!SHOW_CONTEST || !C || SEED.meta.month !== DB.month) return null;
  const rs = C.rows.filter(r => lvl === 'ASM' ? r.asm === name : r.se === name); if (!rs.length) return null;
  const s = k => rs.reduce((t, r) => t + (r[k] || 0), 0), own = rs.filter(r => !r.unmapped), sc = rs.filter(r => r.sc != null);
  const o = { o: s('o'), r1: s('r1'), r2: s('r2'), ph: s('ph'), q: s('q'), st: s('st'), unmapped: rs.filter(r => r.unmapped).reduce((t, r) => t + r.o, 0),
    sc: sc.length ? sc.reduce((t, r) => t + r.sc * r.o, 0) / sc.reduce((t, r) => t + r.o, 0) : null, thr: C.thr, models: C.models,
    trained: lvl === 'SE' ? (own[0] ? own[0].tr : null) : own.filter(r => r.tr === 1).length, ses: own.length };
  o.plan = o.o * (C.rounds || 2); o.done = o.r1 + o.r2;
  const d = fieldDay(day), r1End = Math.min(14, DB.dim);
  o.round = d <= r1End ? 1 : 2; o.due = o.round === 1 ? r1End : DB.dim;
  o.left = Math.max(0, o.o - (o.round === 1 ? o.r1 : o.r2));
  const wdLeft = Math.max(1, DB.wd[o.due] - DB.wd[Math.min(d, DB.dim)]);   // working days from the plan day (day after the data) to the round's due date
  o.daysLeft = wdLeft;
  o.perDay = o.left ? Math.ceil(o.left / wdLeft) : 0;
  o.atStake = (C.reward || 0) * o.o;
  return o;
}

/* pending orders for one SE / ASM: dealer-wise from Cycle_Order when the workbook has it, else the Dashboard SE / ASM “Open Order (CM+LM)” total
   { src: 'cycle' | 'dash', units, wait (awaiting dispatch), disp (dispatched, invoice pending), rej (rejected – no stock), cancel, list: [{ i, bal, dob, rej, st }] } */
function pendOf(lvl, name) {
  const P = SEED && SEED.pend;
  if (P && P.d) {
    const list = [];
    for (const [c, x] of Object.entries(P.d)) { const i = DB.codeIdx.get(+c); if (i === undefined || (lvl === 'ASM' ? DB.D.asm[i] : DB.D.se[i]) !== name) continue;
      list.push({ i, bal: x[2], dob: x[3], rej: x[4], st: x[4] > 0 ? 'rejected – no stock' : x[3] > 0 ? 'dispatched, invoice pending' : 'awaiting dispatch' }); }
    const s = k => list.reduce((t, x) => t + x[k], 0); list.sort((a, b) => b.bal - a.bal);
    return { src: 'cycle', list, units: s('bal'), disp: s('dob'), rej: s('rej'), wait: Math.max(0, s('bal') - s('dob') - s('rej')) };
  }
  const o = ((SEED && SEED.dash && SEED.dash[lvl]) || {})[name];
  return o && (o.open || o.cancel) ? { src: 'dash', list: [], units: o.open || 0, cancel: o.cancel || 0 } : null;
}
/* visits and check-ins are often more recent than billing: on the latest data date, field figures run to their own last day */
function fieldDay(day = ST.day) {
  const fd = Math.max((SEED && SEED.jplan && SEED.jplan.asOf) || 0, (SEED && SEED.field && SEED.field.asOf) || 0);
  return day >= DB.maxDay ? Math.max(day, Math.min(fd, DB.dim)) : day;
}
/* team totals for an ASM: planned vs visited, ad-hoc, and the SE with the lowest completion */
function teamFieldOf(asm, day = ST.day) {
  const rows = teamOf(asm, day).filter(x => !/^(vacant|tba)\b/i.test(x.name)).map(x => ({ n: x.name, f: fieldOf('SE', x.name, day) })).filter(x => x.f);
  if (!rows.length) return null;
  const t = rows.reduce((s, x) => ({ plan: s.plan + x.f.plan, done: s.done + x.f.done, adhoc: s.adhoc + x.f.adhoc }), { plan: 0, done: 0, adhoc: 0 });
  const span = rows.map(x => x.f.span).filter(v => v != null);
  t.pct = t.plan ? t.done / t.plan : null; t.span = span.length ? span.reduce((a, b) => a + b, 0) / span.length : null;
  t.low = rows.filter(x => x.f.pct != null).sort((a, b) => a.f.pct - b.f.pct)[0] || null; t.n = rows.length;
  return t;
}
const hhmm = m => { if (m == null) return '–'; const r = Math.round(m); return `${Math.floor(r / 60) % 24}:${String(r % 60).padStart(2, '0')}`; };
const hrs = m => m == null ? '–' : `${(m / 60).toFixed(1)} h`;

/* open orders & stock rejections for a set of dealers */
function ordersOf(idx) {
  let open = 0, rej = 0; const list = [];
  for (const i of idx) { const o = DB.ord.get(i); if (o) { open += o.open; rej += o.rej; if (o.open > 0) list.push({ i, open: o.open }); } }
  list.sort((a, b) => b.open - a.open);
  return { open, rej, list };
}
