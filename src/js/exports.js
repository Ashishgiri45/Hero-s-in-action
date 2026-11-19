'use strict';
/* ================= export centre =================
   Each export builds sheets from the same functions the screens use, so files match what is shown.
   "Current view" = the filter bar (Zone / ASM / SE / State / Category / data date).
   "All records"  = the same data date with every filter cleared. */

function withScope(all, fn) {
  if (!all) return fn();
  const keep = { zone: ST.zone, asm: ST.asm, se: ST.se, st: ST.st, cat: ST.cat };
  Object.assign(ST, { rsm: '', zone: '', asm: '', se: '', st: '', dist: '', cat: '' });
  try { return fn(); } finally { Object.assign(ST, keep); }
}
const stamp = () => `${DB.y}-${String(DB.m).padStart(2, '0')}-${String(ST.day).padStart(2, '0')}`;
const metaRows = (all, extra = []) => [['Scope', all ? 'All records' : scopeLbl()], ['Data to', `${dLabel(ST.day)} ${DB.y}`], ['Source', DB.source === 'upload' ? DB.srcName : (SEED.meta.src || {}).billing || 'reference pack'], ...extra, ['Generated', new Date().toLocaleString('en-IN')]];

/* ---------- column sets for sheets ---------- */
const perfSheetCols = lvl => [
  { h: 'Rank (by pace)', v: r => r.rank || null, w: 9, fmt: 'int' },
  { h: lvl, k: 'name', w: 24 }, ...(lvl === 'SE' ? [{ h: 'ASM', k: 'asm', w: 22 }, { h: 'SE code', k: 'code', w: 10 }] : []), { h: 'Zone', k: 'zone', w: 9 },
  ...(lvl === 'ASM' ? [{ h: 'SEs', v: r => r.team.length, w: 7, fmt: 'int' }, { h: 'SEs on track', v: r => teamCounts(r.team).ok, w: 9, fmt: 'int' }, { h: 'SEs needing improvement', v: r => teamCounts(r.team).under, w: 12, fmt: 'int' }] : []),
  { h: 'Target (month plan, units)', v: r => r.p.plan || null, w: 12, fmt: 'int' },
  { h: 'Achieved MTD (units)', v: r => r.p.mtd, w: 12, fmt: 'int' },
  { h: 'Achievement % of plan', v: r => r.p.ach, w: 11, fmt: 'pct' },
  { h: 'Expected by data date', v: r => r.p.plan ? Math.round(r.p.expected) : null, w: 11, fmt: 'int' },
  { h: 'Vs pace %', v: r => r.p.pace, w: 9, fmt: 'pct' },
  { h: 'Gap to plan (units)', v: r => r.p.gap, w: 10, fmt: 'int' },
  { h: 'Needed per working day', v: r => r.p.need, w: 11, fmt: 'int' },
  { h: 'Run rate per working day', v: r => r.p.rr, w: 11, fmt: 'int' },
  { h: 'Status', v: r => PSTAT[r.p.status].l, w: 10 },
  { h: 'Trend', v: r => r.p.trend.l, w: 16 }, { h: 'Trend basis', v: r => r.p.trend.basis, w: 34 },
  { h: 'Active dealers', v: r => r.p.active, w: 9, fmt: 'int' },
  { h: 'Billing points', v: r => r.p.r.k[6].a, w: 9, fmt: 'int' }, { h: 'Billing point target', v: r => r.p.r.k[6].t, w: 9, fmt: 'int' }, { h: 'Billing point %', v: r => r.p.r.k[6].p, w: 9, fmt: 'pct' },
  { h: '16-point composite (of 100)', v: r => r.p.r.comp == null ? null : Math.round(r.p.r.comp * 100), w: 11, fmt: 'int' },
  { h: 'DJP visits planned (W1–W2)', v: r => (pjpOf(lvl === 'ASM' ? 'ASM' : 'SE', r.name) || {}).p ?? null, w: 11, fmt: 'int' },
  { h: 'DJP visits made', v: r => (pjpOf(lvl === 'ASM' ? 'ASM' : 'SE', r.name) || {}).a ?? null, w: 10, fmt: 'int' },
  { h: 'DJP adherence %', v: r => (pjpOf(lvl === 'ASM' ? 'ASM' : 'SE', r.name) || {}).pct ?? null, w: 10, fmt: 'pct' },
  { h: 'Daily plan status', v: r => planStatus('daily', lvl, r.name, dPeriod()).l, w: 16 },
  { h: 'Weekly plan status', v: r => planStatus('weekly', lvl, r.name, wPeriod()).l, w: 16 },
];
function weekLong(rows) {
  const out = []; for (const r of rows) for (const w of r.p.wk) out.push({ r, w }); return out;
}
const weekCols = lvl => [
  { h: lvl, v: o => o.r.name, w: 24 }, ...(lvl === 'SE' ? [{ h: 'ASM', v: o => o.r.asm, w: 22 }] : []), { h: 'Zone', v: o => o.r.zone, w: 9 },
  { h: 'Week', v: o => o.w.label, w: 7 }, { h: 'Dates', v: o => o.w.range, w: 12 }, { h: 'Complete?', v: o => o.w.complete ? 'Yes' : `Partial (to ${o.w.to})`, w: 13 },
  { h: 'Working days (elapsed)', v: o => o.w.wdTo, w: 10, fmt: 'int' }, { h: 'Working days (week)', v: o => o.w.wd, w: 10, fmt: 'int' },
  { h: 'Target to date (pro-rata)', v: o => o.w.tTo, w: 11, fmt: 'int' }, { h: 'Units billed', v: o => o.w.units, w: 10, fmt: 'int' },
  { h: 'Achievement %', v: o => o.w.pct, w: 11, fmt: 'pct' }, { h: 'Status', v: o => PSTAT[paceStatus(o.w.pct)].l, w: 10 },
  { h: 'No-billing working days', v: o => o.w.zero, w: 11, fmt: 'int' }, { h: 'Best day units', v: o => o.w.best, w: 10, fmt: 'int' }, { h: 'New billing points', v: o => o.w.bpNew, w: 10, fmt: 'int' },
];
const planCols = [
  { h: 'Plan type', v: o => o.pl.type === 'daily' ? 'Daily' : 'Weekly', w: 8 }, { h: 'Plan for', v: o => o.pl.periodLabel, w: 22 }, { h: 'Data to', v: o => o.pl.dataTo, w: 12 },
  { h: 'Zone', v: o => o.pl.zone, w: 9 }, { h: 'ASM', v: o => o.pl.asm, w: 20 }, { h: 'Level', v: o => o.pl.level, w: 7 }, { h: 'Name', v: o => o.pl.name, w: 22 },
  { h: 'Performance status', v: o => PSTAT[o.pl.p.status].l, w: 11 }, { h: 'Target', v: o => o.pl.p.plan || null, w: 10, fmt: 'int' }, { h: 'Achieved MTD', v: o => o.pl.p.mtd, w: 10, fmt: 'int' },
  { h: 'Remaining gap', v: o => o.pl.p.gap, w: 10, fmt: 'int' }, { h: 'Day target', v: o => o.pl.p.need ? Math.ceil(o.pl.p.need) : null, w: 9, fmt: 'int' },
  { h: '#', v: o => o.n, w: 4, fmt: 'int' }, { h: 'Priority', v: o => o.it.priority, w: 8 },
  { h: 'Performance gap', v: o => o.it.issue, w: 36, wrap: true }, { h: 'Evidence', v: o => o.it.evidence, w: 50, wrap: true }, { h: 'Basis', v: o => o.it.basis, w: 16 },
  { h: 'Action required', v: o => (o.rec ? o.rec.text : o.it.action), w: 60, wrap: true }, { h: 'Latest recommendation (if changed)', v: o => o.rec && o.rec.latest || '', w: 30, wrap: true },
  { h: 'Expected outcome', v: o => o.it.outcome, w: 34, wrap: true }, { h: 'Suggested deadline', v: o => o.it.deadline, w: 22 }, { h: 'Due date', v: o => o.it.dueISO, w: 12, fmt: 'date' },
  { h: 'Responsible person', v: o => o.it.owner, w: 20 }, { h: 'Follow-up requirement', v: o => o.it.follow, w: 30, wrap: true },
  { h: 'Status', v: o => o.rec ? o.rec.status : 'Not generated', w: 12 }, { h: 'Remarks', v: o => o.rec ? o.rec.remarks : '', w: 30, wrap: true },
  { h: 'Confirmed by manager', v: o => o.rec ? (o.rec.confirmed ? 'Yes' : 'No') : '', w: 10 },
  { h: 'Last updated', v: o => o.rec && o.rec.updated ? new Date(o.rec.updated) : null, w: 14, fmt: 'date' },
];
function planRows(plans) {
  const out = [];
  for (const pl of plans) pl.items.forEach((it, i) => out.push({ pl, it, n: i + 1, rec: TRK[trkId(pl.type, pl.level, pl.name, pl.period, it.key)] }));
  return out;
}
const trackCols = [
  { h: 'Type', k: 'type', w: 8 }, { h: 'Period', v: r => r.periodLabel || r.period, w: 22 }, { h: 'Level', k: 'level', w: 7 }, { h: 'Name', k: 'name', w: 22 }, { h: 'ASM', k: 'asm', w: 20 }, { h: 'Zone', k: 'zone', w: 9 },
  { h: 'Priority', k: 'priority', w: 8 }, { h: 'Performance gap', k: 'issue', w: 36, wrap: true }, { h: 'Evidence', k: 'evidence', w: 44, wrap: true }, { h: 'Basis', k: 'basis', w: 16 },
  { h: 'Agreed action', k: 'text', w: 56, wrap: true }, { h: 'Latest recommendation (if changed)', v: r => r.latest || '', w: 30, wrap: true },
  { h: 'Expected outcome', k: 'outcome', w: 30, wrap: true }, { h: 'Owner', k: 'owner', w: 20 }, { h: 'Due date', k: 'due', w: 12, fmt: 'date' }, { h: 'Follow-up', k: 'follow', w: 28, wrap: true },
  { h: 'Status', k: 'status', w: 12 }, { h: 'Overdue', v: r => isOverdue(r) ? 'Yes' : '', w: 8 }, { h: 'Remarks', k: 'remarks', w: 30, wrap: true }, { h: 'Confirmed by manager', v: r => r.confirmed ? 'Yes' : 'No', w: 10 },
  { h: 'Generated', v: r => r.created ? new Date(r.created) : null, w: 13, fmt: 'date' }, { h: 'Last updated', v: r => r.updated ? new Date(r.updated) : null, w: 13, fmt: 'date' },
];
const allPlans = type => (type === 'daily' ? asmRows().map(x => dailyASM(x.name)).concat(rseRows().map(x => dailyRSE(x.name)))
  : asmRows().map(x => weeklyASM(x.name, ST.week)).concat(rseRows().map(x => weeklyRSE(x.name, ST.week))));

/* ---------- registry ---------- */
const EXPORTS = [
  { key: 'exec', label: 'Executive summary', desc: 'Scope totals, 16 KPIs, zone comparison and weekly performance.', build: all => {
    const f = curF(), p = perfOf(f), r = p.r, rs = rseRows(), tc = teamCounts(rs);
    const sum = [{ m: 'Volume target (units)', v: p.plan || null }, { m: 'Achieved MTD (units)', v: p.mtd }, { m: 'Achievement % of plan', v: p.ach, f: 'pct' }, { m: 'Vs pace %', v: p.pace, f: 'pct' }, { m: 'Gap to plan (units)', v: p.gap },
      { m: 'Needed per working day', v: p.need }, { m: 'Working days gone / total', v: `${p.wdGone} / ${DB.wdTotal}` }, { m: 'ASMs', v: asmRows().length }, { m: 'SEs', v: rs.length },
      { m: `SEs meeting benchmark (≥ ${fP(CFG.onTrack)} of pace)`, v: tc.ok }, { m: `SEs needing improvement (< ${fP(CFG.watch)})`, v: tc.under }, { m: '16-point composite (of 100)', v: r.comp == null ? null : Math.round(r.comp * 100) }, { m: 'Trend', v: p.trend.l }];
    return { name: 'Executive_Summary', sheets: [
      { name: 'Summary', title: 'Executive summary', meta: metaRows(all), cols: [{ h: 'Measure', k: 'm', w: 44 }, { h: 'Value', v: o => o.v, w: 16, fmt: null }], rows: sum.map(o => Object.assign(o, { v: o.f === 'pct' && o.v != null ? Math.round(o.v * 1000) / 10 + '%' : o.v })) },
      { name: '16 KPIs', title: '16-point KPIs', meta: metaRows(all), cols: [{ h: '#', k: 'id', w: 5 }, { h: 'KPI', k: 'name', w: 40 }, { h: 'Target', v: k => r.k[k.id].has ? r.k[k.id].t : 'No data', w: 10, fmt: 'num2' }, { h: 'Achievement', v: k => r.k[k.id].has ? r.k[k.id].a : 'No data', w: 12, fmt: 'num2' }, { h: 'Ach %', v: k => r.k[k.id].p, w: 9, fmt: 'pct' }, { h: 'Weight', v: k => k.w, w: 8, fmt: 'pct' }, { h: 'Source', k: 'src', w: 8 }], rows: KPI },
      { name: 'Zones', title: 'Zone comparison', meta: metaRows(all), cols: perfSheetCols('Zone').filter(c => !/plan status|DJP/.test(c.h)), rows: rankRows(zoneRows()) },
      { name: 'Weekly', title: 'Weekly performance (scope)', meta: metaRows(all), cols: weekCols('Scope'), rows: p.wk.map(w => ({ r: { name: scopeLbl(), zone: ST.zone || 'All', asm: '' }, w })) },
    ] };
  } },
  { key: 'zones', label: 'Zonal performance', desc: 'Each zone with its ASMs and SEs.', build: all => ({ name: 'Zonal_Performance', sheets: [
    { name: 'Zones', title: 'Zonal performance', meta: metaRows(all), cols: perfSheetCols('Zone').filter(c => !/plan status|DJP/.test(c.h)), rows: rankRows(zoneRows()) },
    { name: 'ASMs by zone', title: 'ASMs', meta: metaRows(all), cols: perfSheetCols('ASM'), rows: rankRows(asmRows()), freezeCols: 2 },
    { name: 'SEs by zone', title: 'SEs', meta: metaRows(all), cols: perfSheetCols('SE'), rows: rankRows(rseRows()), freezeCols: 2 }] }) },
  { key: 'asm', label: 'ASM performance', desc: 'ASM comparison with team counts, plus ASM weekly figures.', build: all => ({ name: 'ASM_Performance', sheets: [
    { name: 'ASM performance', title: 'ASM performance', meta: metaRows(all), cols: perfSheetCols('ASM'), rows: rankRows(asmRows()), freezeCols: 2 },
    { name: 'ASM weekly', title: 'ASM weekly performance', meta: metaRows(all), cols: weekCols('ASM'), rows: weekLong(asmRows()) }] }) },
  { key: 'rse', label: 'SE performance', desc: 'SE comparison, plus SE weekly figures.', build: all => ({ name: 'SE_Performance', sheets: [
    { name: 'SE performance', title: 'SE performance', meta: metaRows(all), cols: perfSheetCols('SE'), rows: rankRows(rseRows()), freezeCols: 2 },
    { name: 'SE weekly', title: 'SE weekly performance', meta: metaRows(all), cols: weekCols('SE'), rows: weekLong(rseRows()) }] }) },
  { key: 'daily', label: 'Daily performance', desc: 'Day by day for the scope, and units per day for every SE.', build: all => {
    const f = curF(), s = series(f, ST.day), p = perfOf(f), rs = rseRows(), days = []; for (let d = 1; d <= ST.day; d++) days.push(d);
    return { name: 'Daily_Performance', sheets: [
      { name: 'Day-wise', title: 'Day-wise performance', meta: metaRows(all), cols: [{ h: 'Date', v: o => isoD(dayDate(o.d)), w: 12, fmt: 'date' }, { h: 'Sunday', v: o => o.sun ? 'Yes' : '', w: 7 }, { h: 'Units (day)', k: 'du', w: 10, fmt: 'int' }, { h: 'Daily target', v: () => p.dailyT, w: 10, fmt: 'int' }, { h: 'Value (day) ₹', v: o => Math.round(o.dv), w: 13, fmt: 'inr' }, { h: 'Units MTD', k: 'units', w: 10, fmt: 'int' }, { h: 'Pro-rata plan to date', v: o => p.plan ? Math.round(p.plan * DB.wd[o.d] / DB.wdTotal) : null, w: 12, fmt: 'int' }, { h: 'New billing points', k: 'newB', w: 10, fmt: 'int' }, { h: 'Billing points', k: 'billed', w: 10, fmt: 'int' }, { h: 'NPD counters', k: 'npd', w: 9, fmt: 'int' }, { h: 'Premium dealers', k: 'prem', w: 9, fmt: 'int' }, { h: 'MBD', k: 'mbd', w: 7, fmt: 'num1' }, { h: 'Premium share', k: 'ps', w: 9, fmt: 'pct1' }, { h: 'Orders booked (day) ₹', v: o => Math.round(o.ov), w: 14, fmt: 'inr' }], rows: s },
      { name: 'SE units by day', title: 'Units per day by SE', meta: metaRows(all), freezeCols: 3, cols: [{ h: 'SE', k: 'name', w: 22 }, { h: 'ASM', k: 'asm', w: 20 }, { h: 'Zone', k: 'zone', w: 8 }, { h: 'Daily target', v: r => r.p.dailyT, w: 9, fmt: 'int' }, ...days.map(d => ({ h: `${d} ${MON[DB.m - 1]}${DB.sun(d) ? ' (Sun)' : ''}`, v: r => r.p.du[d], w: 8, fmt: 'int' })), { h: 'MTD', v: r => r.p.mtd, w: 9, fmt: 'int' }], rows: rs }] };
  } },
  { key: 'weekly', label: 'Weekly performance', desc: 'Every ASM and SE by week (W1–W5) against pro-rata targets.', build: all => ({ name: 'Weekly_Performance', sheets: [
    { name: 'ASM weekly', title: 'ASM weekly performance', meta: metaRows(all), cols: weekCols('ASM'), rows: weekLong(asmRows()) },
    { name: 'SE weekly', title: 'SE weekly performance', meta: metaRows(all), cols: weekCols('SE'), rows: weekLong(rseRows()) }] }) },
  { key: 'monthly', label: 'Monthly trend (MTD)', desc: 'Cumulative month-to-date vs pro-rata plan. Earlier months are not in the data pack.', build: all => {
    const p = perfOf(curF()), rows = []; for (let d = 1; d <= ST.day; d++) rows.push({ d, cum: p.cum[d], t: p.plan ? p.plan * DB.wd[d] / DB.wdTotal : null, bp: p.bp[d] });
    return { name: 'Monthly_Trend', sheets: [{ name: 'MTD trend', title: `Month-to-date trend · ${MON[DB.m - 1]} ${DB.y}`, meta: metaRows(all, [['Note', 'Only the current month is in the data pack; month-on-month comparison needs earlier months’ billing.']]),
      cols: [{ h: 'Date', v: o => isoD(dayDate(o.d)), w: 12, fmt: 'date' }, { h: 'Units MTD', k: 'cum', w: 11, fmt: 'int' }, { h: 'Pro-rata plan to date', k: 't', w: 12, fmt: 'int' }, { h: 'Vs pace %', v: o => o.t ? o.cum / o.t : null, w: 9, fmt: 'pct' }, { h: 'Billing points', k: 'bp', w: 10, fmt: 'int' }], rows }] };
  } },
  { key: 'dASM', label: 'Daily ASM action plans', desc: 'One row per action, every ASM in scope.', build: all => ({ name: 'Daily_ASM_Action_Plans', sheets: [{ name: 'ASM Daily Plan', title: `ASM daily action plans · ${planDate(ST.day).label}`, meta: metaRows(all), cols: planCols, rows: planRows(asmRows().map(x => dailyASM(x.name))), freezeCols: 0 }] }) },
  { key: 'dRSE', label: 'Daily SE action plans', desc: 'One row per action, every SE in scope.', build: all => ({ name: 'Daily_SE_Action_Plans', sheets: [{ name: 'SE Daily Plan', title: `SE daily action plans · ${planDate(ST.day).label}`, meta: metaRows(all), cols: planCols, rows: planRows(rseRows().map(x => dailyRSE(x.name))) }] }) },
  { key: 'wASM', label: 'Weekly ASM action plans', desc: 'Plans for the week after the selected reporting week.', build: all => ({ name: 'Weekly_ASM_Action_Plans', sheets: [{ name: 'ASM Weekly Plan', title: `ASM weekly action plans · ${weekCtx(ST.week, ST.day).label}`, meta: metaRows(all, [['Reporting week', `W${ST.week}`]]), cols: planCols, rows: planRows(asmRows().map(x => weeklyASM(x.name, ST.week))) }] }) },
  { key: 'wRSE', label: 'Weekly SE action plans', desc: 'Plans for the week after the selected reporting week.', build: all => ({ name: 'Weekly_SE_Action_Plans', sheets: [{ name: 'SE Weekly Plan', title: `SE weekly action plans · ${weekCtx(ST.week, ST.day).label}`, meta: metaRows(all, [['Reporting week', `W${ST.week}`]]), cols: planCols, rows: planRows(rseRows().map(x => weeklyRSE(x.name, ST.week))) }] }) },
  { key: 'under', label: 'Underperformer details', desc: `ASMs and SEs below the Watch threshold, with their plan items.`, build: all => {
    const ua = rankRows(asmRows()).filter(x => x.p.status === 'behind' || x.p.status === 'crit'), ur = rankRows(rseRows()).filter(x => x.p.status === 'behind' || x.p.status === 'crit');
    return { name: 'Underperformers', sheets: [
      { name: 'ASMs below benchmark', title: 'ASMs needing improvement', meta: metaRows(all), cols: perfSheetCols('ASM'), rows: ua },
      { name: 'SEs below benchmark', title: 'SEs needing improvement', meta: metaRows(all), cols: perfSheetCols('SE'), rows: ur },
      { name: 'Their daily actions', title: 'Daily actions for underperformers', meta: metaRows(all), cols: planCols, rows: planRows(ua.map(x => dailyASM(x.name)).concat(ur.map(x => dailyRSE(x.name)))) }] };
  } },
  { key: 'improve', label: 'Improvement analysis', desc: 'Trend category per ASM and SE from the last two complete weeks.', build: all => {
    const cols = lvl => [{ h: lvl, k: 'name', w: 24 }, ...(lvl === 'SE' ? [{ h: 'ASM', k: 'asm', w: 20 }] : []), { h: 'Zone', k: 'zone', w: 9 }, ...weeks().filter(w => w.s <= ST.day).map(w => ({ h: `${w.label} %${w.e > ST.day ? ' (partial)' : ''}`, v: r => (r.p.wk.find(x => x.n === w.n) || {}).pct, w: 10, fmt: 'pct' })),
      { h: 'Change (pts, last 2 complete weeks)', v: r => r.p.trend.d == null ? null : Math.round(r.p.trend.d * 100), w: 12, fmt: 'int' }, { h: 'Classification', v: r => r.p.trend.l, w: 18 }, { h: 'Basis', v: r => r.p.trend.basis, w: 36 }, { h: 'MTD vs pace %', v: r => r.p.pace, w: 10, fmt: 'pct' }];
    return { name: 'Improvement_Analysis', sheets: [{ name: 'ASMs', title: 'Improvement analysis — ASMs', meta: metaRows(all, [['Rule', `Last two complete weeks; change beyond ±${Math.round(CFG.stable * 100)} points = improved/declined`]]), cols: cols('ASM'), rows: asmRows() },
      { name: 'SEs', title: 'Improvement analysis — SEs', meta: metaRows(all), cols: cols('SE'), rows: rseRows() }] };
  } },
  { key: 'curASM', label: 'Individual ASM plan', desc: 'Selected ASM: performance, team, daily and weekly plans.', person: 'ASM', build: (all, name) => personBook('ASM', name) },
  { key: 'curRSE', label: 'Individual SE plan', desc: 'Selected SE: performance, dealer focus, daily and weekly plans.', person: 'SE', build: (all, name) => personBook('SE', name) },
  { key: 'tracking', label: 'Action tracking', desc: 'Tracked actions with status, remarks and confirmations. Current view = Tracking filters.', build: all => ({ name: 'Action_Tracking', sheets: [{ name: 'Action Plan Status', title: 'Action tracking', meta: [['Records', all ? 'All' : 'Tracking filters applied'], ['Stored', 'This browser only (Phase 1)'], ['Generated', new Date().toLocaleString('en-IN')]], cols: trackCols, rows: all ? Object.values(TRK) : trackRows() }] }) },
  { key: 'allPlans', label: 'Consolidated action-plan workbook', desc: 'ASM/SE daily and weekly plans, performance summary and action status in one file.', build: all => ({ name: 'Action_Plans_Consolidated', sheets: [
    { name: 'ASM Daily Plan', title: `ASM daily plans · ${planDate(ST.day).label}`, meta: metaRows(all), cols: planCols, rows: planRows(asmRows().map(x => dailyASM(x.name))) },
    { name: 'SE Daily Plan', title: `SE daily plans · ${planDate(ST.day).label}`, meta: metaRows(all), cols: planCols, rows: planRows(rseRows().map(x => dailyRSE(x.name))) },
    { name: 'ASM Weekly Plan', title: `ASM weekly plans · ${weekCtx(ST.week, ST.day).label}`, meta: metaRows(all), cols: planCols, rows: planRows(asmRows().map(x => weeklyASM(x.name, ST.week))) },
    { name: 'SE Weekly Plan', title: `SE weekly plans · ${weekCtx(ST.week, ST.day).label}`, meta: metaRows(all), cols: planCols, rows: planRows(rseRows().map(x => weeklyRSE(x.name, ST.week))) },
    { name: 'Performance Summary', title: 'Performance summary — SEs', meta: metaRows(all), cols: perfSheetCols('SE'), rows: rankRows(rseRows()), freezeCols: 2 },
    { name: 'ASM Summary', title: 'Performance summary — ASMs', meta: metaRows(all), cols: perfSheetCols('ASM'), rows: rankRows(asmRows()), freezeCols: 2 },
    { name: 'Action Plan Status', title: 'Action tracking', meta: [['Stored', 'This browser only (Phase 1)']], cols: trackCols, rows: Object.values(TRK).filter(r => all || ((!ST.zone || r.zone === ST.zone) && (!ST.asm || r.asm === ST.asm) && (!ST.se || r.name === ST.se))) }] }) },
  { key: 'kpi16', label: '16-KPI board', desc: 'Every SE/SE and ASM with target, achievement and Ach % for all 16 KPIs.', build: all => {
    const sh = lvl => { const rows = lbBoard(lvl).slice().sort((a, b) => (a.rank || 999) - (b.rank || 999)); return { name: `${lvl === 'SE' ? 'SE' : 'ASM'} 16 KPIs`, title: `16-KPI board — ${lvl === 'SE' ? 'SEs' : 'ASMs'}`, meta: metaRows(all), freezeCols: 2,
      cols: [{ h: 'Rank', v: x => x.rank || null, w: 6, fmt: 'int' }, { h: lvl === 'SE' ? 'SE' : 'ASM', k: 'name', w: 22 }, { h: 'ASM', k: 'asm', w: 20 }, { h: 'Zone', k: 'z', w: 8 }, { h: 'Composite', v: x => x.r.comp == null ? null : Math.round(x.r.comp * 100), w: 9, fmt: 'int' },
        ...KPI.flatMap(k => [{ h: `K${k.id} target`, v: x => x.r.k[k.id].has ? x.r.k[k.id].t : null, w: 8, fmt: k.ratio ? 'pct1' : k.avg ? 'num1' : 'int' }, { h: `K${k.id} ach`, v: x => x.r.k[k.id].has ? x.r.k[k.id].a : null, w: 8, fmt: k.ratio ? 'pct1' : k.avg ? 'num1' : 'int' }, { h: `K${k.id} %`, v: x => x.r.k[k.id].p, w: 7, fmt: 'pct' }])], rows }; };
    return { name: '16_KPI_Board', sheets: [sh('SE'), sh('ASM')] };
  } },
  { key: 'dealers', label: 'Dealer details', desc: 'Every dealer in scope with billing, plan and KPI flags.', build: all => {
    const r = scopeCalc(curF(), ST.day), ds = dayState(ST.day), D = DB.D;
    return { name: 'Dealers', sheets: [{ name: 'Dealers', title: 'Dealer details', meta: metaRows(all), freezeCols: 2, rows: r.idx.filter(listedDealer),
      cols: [{ h: 'Code', v: i => D.c[i], w: 9 }, { h: 'Dealer', v: i => D.n[i], w: 30 }, { h: 'City', v: i => D.city[i], w: 14 }, { h: 'State', v: i => D.st[i], w: 13 }, { h: 'Zone', v: i => D.z[i], w: 8 }, { h: 'ASM', v: i => D.asm[i], w: 20 }, { h: 'SE', v: i => D.se[i], w: 20 }, { h: 'Status', v: i => D.s[i] === 'A' ? 'Active' : D.s[i] === 'I' ? 'Inactive' : D.s[i] === 'N' ? 'Not in Dealer_Vol1' : 'Closed', w: 8 },
        { h: 'MTD units', v: i => ds.qty[i], w: 9, fmt: 'int' }, { h: 'MTD value ₹', v: i => Math.round(ds.val[i]), w: 12, fmt: 'inr' }, { h: 'Plan', v: i => D.pl[i] || null, w: 8, fmt: 'int' }, { h: 'Jul–Sep avg', v: i => D.l3[i], w: 9, fmt: 'int' }, { h: 'Billed', v: i => ds.qty[i] > 0 ? 'Y' : 'N', w: 6 }, { h: 'NPD', v: i => ds.nq[i] > 0 ? 'Y' : 'N', w: 5 }, { h: 'Premium units', v: i => ds.pq[i], w: 8, fmt: 'int' }, { h: 'Models', v: i => ds.mc[i], w: 7, fmt: 'int' }, { h: 'MBD target', v: i => D.mt[i], w: 8, fmt: 'num1' }, { h: 'OD ₹', v: i => D.od[i], w: 10, fmt: 'inr' }, { h: 'Open complaints', v: i => D.cp[i], w: 9, fmt: 'int' }] }] };
  } },
  { key: 'legacy', label: 'Full tracker workbook (original format)', desc: 'The reference dashboard’s original export: summary, scorecards, day-wise, insights, action plan, dealers.', legacy: true },
];

function personBook(lvl, name) {
  if (!name) throw new Error(`Select an ${lvl} first (open a profile or a plan).`);
  const isA = lvl === 'ASM', row = (isA ? asmRows(scopeF()) : rseRows(scopeF())).find(x => x.name === name);
  if (!row) throw new Error(`${name} has no mapped dealers in this data.`);
  const dp = isA ? dailyASM(name) : dailyRSE(name), wp = isA ? weeklyASM(name, ST.week) : weeklyRSE(name, ST.week);
  const meta = [['Name', name], ['Level', lvl], ['Zone', row.zone], ...(isA ? [] : [['ASM', row.asm]]), ['Data to', `${dLabel(ST.day)} ${DB.y}`], ['Generated', new Date().toLocaleString('en-IN')]];
  const sheets = [
    { name: 'Performance', title: `${lvl} performance — ${name}`, meta, cols: perfSheetCols(lvl), rows: [row] },
    { name: 'Weekly', title: 'Weekly performance', meta, cols: weekCols(lvl), rows: weekLong([row]) },
    { name: 'Daily plan', title: `Daily action plan · ${dp.periodLabel}`, meta, cols: planCols, rows: planRows([dp]) },
    { name: 'Weekly plan', title: `Weekly action plan · ${wp.periodLabel}`, meta, cols: planCols, rows: planRows([wp]) },
  ];
  if (isA) sheets.push({ name: 'Team', title: `SEs reporting to ${name}`, meta, cols: perfSheetCols('SE'), rows: rankRows(teamOf(name)) });
  else sheets.push({ name: 'Dealer focus', title: 'Dealer focus list', meta, rows: dp.dealers, cols: [{ h: '#', v: x => dp.dealers.indexOf(x) + 1, w: 4 }, { h: 'Code', v: x => DB.D.c[x.i], w: 9 }, { h: 'Dealer', v: x => DB.D.n[x.i], w: 30 }, { h: 'City', v: x => DB.D.city[x.i], w: 14 }, { h: 'MTD units', v: x => x.q, w: 9, fmt: 'int' }, { h: 'Jul–Sep avg', v: x => x.l3, w: 9, fmt: 'int' }, { h: 'Gaps and actions', v: x => x.rs.map(y => `${y.t}: ${y.a}`).join(' | '), w: 90, wrap: true }] });
  return { name: `${lvl}_Plan_${name}`, sheets };
}

async function runExport(key, all, person) {
  const e = EXPORTS.find(x => x.key === key); if (!e) return;
  if (e.legacy) return withScope(all, () => exportXlsx(false));
  try {
    if (!ST.week) ST.week = defaultWeek();
    const nm = e.person ? (person || (e.person === 'ASM' ? ST.asmSel || ST.planSel.daily.ASM || ST.asm : ST.rseSel || ST.planSel.daily.SE || ST.se)) : null;
    const spec = withScope(all && !e.person, () => e.build(all, nm));
    await downloadWorkbook(`${spec.name}_${all ? 'All' : scopeLbl()}_${stamp()}`, spec.sheets);
  } catch (err) { console.error(err); toast(err.message || 'Export failed.', 6000); }
}

function renderExportCentre() {
  const pa = ST.asmSel || ST.planSel.daily.ASM || ST.asm, pr = ST.rseSel || ST.planSel.daily.SE || ST.se;
  $('#expScope').innerHTML = `Current view = <b>${esc(scopeLbl())}</b>${ST.st ? ' · ' + esc(ST.st) : ''}${ST.cat ? ' · category ' + esc(ST.cat) : ''} · data to ${dLabel(ST.day)} · reporting week W${ST.week || defaultWeek()}. All records = same date, no filters.`;
  $('#expGrid').innerHTML = EXPORTS.map(e => `<div class="card exp"><div><h4>${esc(e.label)}</h4><p class="small muted">${esc(e.desc)}${e.person ? `<br>Selected: <b>${esc((e.person === 'ASM' ? pa : pr) || 'none — open a profile first')}</b>` : ''}</p></div>
    <div class="toolbar">${e.person ? `<button class="btn sm primary" data-x="${e.key}" data-all="0"${(e.person === 'ASM' ? pa : pr) ? '' : ' disabled'}>⬇ Download</button>` : `<button class="btn sm primary" data-x="${e.key}" data-all="0">⬇ Current view</button><button class="btn sm" data-x="${e.key}" data-all="1">⬇ All records</button>`}</div></div>`).join('');
  $$('#expGrid [data-x]').forEach(b => b.onclick = () => runExport(b.dataset.x, b.dataset.all === '1'));
  if (typeof renderReviewPacks === 'function') renderReviewPacks($('#expGrid'));   // weekly ASM review pages + Hero of the week cards
}
