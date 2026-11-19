'use strict';
/* ================= action-plan engine (rule based) =================
   Every action carries: the issue, the evidence from the data, the owner, the action, the expected
   outcome, a deadline and a follow-up. `basis` says whether the cause is shown by the data
   ("Observed in data"), still has to be found ("Cause needs investigation") or the data is missing
   ("Data limitation"). Priority: Critical/Behind → High, Watch/No target → Medium, On track → Low
   (thresholds in Settings). Dealer names come only from the dealer master; nothing is invented. */

const BASIS = { obs: 'Observed in data', inv: 'Cause needs investigation', lim: 'Data limitation' };
const dName = i => `${DB.D.n[i]} (#${DB.D.c[i]})`;
const dList = (arr, n = 3) => arr.slice(0, n).map(x => dName(x.i)).join('; ');
const ceilPos = v => Math.max(0, Math.ceil(v || 0));
function act(o) { return Object.assign({ basis: BASIS.obs }, o); }
function sortItems(items, max) {
  // the volume / daily-target action always leads; a serious visit, market-hours or pending-order gap comes right after it
  const rank = x => /^w?vol$/.test(x.key) ? -1 : /^(pjp|hrs|pend|cov)$/.test(x.key) && x.priority === 'High' ? -0.5 : PRIO_RANK[x.priority];
  return items.map((x, n) => ({ x, n })).sort((a, b) => rank(a.x) - rank(b.x) || a.n - b.n).map(o => o.x).slice(0, max);
}
function momentum(p) {
  const d = p.day; if (d < 8) return null;
  let l7 = 0, p7 = 0; for (let x = d - 6; x <= d; x++) l7 += p.du[x] || 0; for (let x = d - 13; x <= d - 7; x++) if (x >= 1) p7 += p.du[x] || 0;
  return p7 > 0 ? { l7, p7, g: (l7 - p7) / p7 } : null;
}

/* billing points: the workbook dashboard's target/achievement when present, else KPI 1 */
const bpOf = p => p.official && p.official.bpT ? { has: true, t: p.official.bpT, a: p.official.bpA } : p.r.o[1];

/* ---------- how the plan's numbers are worked out, step by step with the person's own figures ---------- */
function calcSteps(p) {
  const o = p.official;
  if (!o) return p.plan ? [
    ['Target', 'Month plan for the mapped dealers', fN(p.plan)],
    ['Achieved', 'Units billed this month', `${fN(p.mtd)} = ${fP(p.ach)} of target`],
    ['Gap', `Target − achieved = ${fN(p.plan)} − ${fN(p.mtd)}`, fN(p.gap)],
    ['Day target', `Gap ÷ working days left = ${fN(p.gap)} ÷ ${p.wdLeft}`, fN(Math.ceil(p.need || 0))],
    ['Status', `Achieved ÷ target due so far (${fP(p.share)} of working days gone)`, `${fP(p.pace)} → ${PSTAT[p.status].l}`]] : [];
  const gone = o.daysGone, dim = DB.dim, need = o.balance > 0 ? Math.ceil(o.reqRR) : 0;
  return [
    ['Target', 'Month target from Dashboard SE / ASM', fN(o.target)],
    ['Achieved (orders)', `Orders booked 1–${gone} ${MON[DB.m - 1]} ÷ target = ${fN(o.orderAch)} ÷ ${fN(o.target)}`, fP(o.orderPct)],
    ['Billed', `Units billed ÷ target = ${fN(o.billVol)} ÷ ${fN(o.target)}`, fP(o.billPct)],
    ['Balance', `Target − orders = ${fN(o.target)} − ${fN(o.orderAch)}`, fN(Math.max(0, o.balance))],
    ['Days left', `Days in month − days gone = ${dim} − ${gone}`, String(o.daysLeft)],
    ['Day target (need / day)', o.balance > 0 ? `Balance ÷ days left = ${fN(o.balance)} ÷ ${o.daysLeft} (rounded up)` : 'Target already covered by orders', fN(need)],
    ['Current run rate', `Orders ÷ days gone = ${fN(o.orderAch)} ÷ ${gone} (as in the dashboard)`, `${fN(o.curRR)}/day`],
    ['Status', `Orders ÷ target due by today = ${fN(o.orderAch)} ÷ (${fN(o.target)} × ${gone}/${dim}). On track ≥ ${fP(CFG.onTrack)}, Watch ≥ ${fP(CFG.watch)}, Behind ≥ ${fP(CFG.behind)}, else Critical`, `${fP(p.pace)} → ${PSTAT[p.status].l}`]];
}

/* ---------- volume actions from the workbook's own dashboard (orders, balance, run rates) ---------- */
function officialVol(p, who, pd, due, follow, team) {
  const o = p.official, out = [], st = p.status, need = Math.ceil(o.balance > 0 ? o.reqRR : 0), isA = !!team;
  const head = `Target ${fN(o.target)} · ordered ${fN(o.orderAch)} (${fP(o.orderPct)}) · billed ${fN(o.billVol)} (${fP(o.billPct)})`;
  if (o.balance > 0 && o.daysLeft > 0) {
    const split = isA ? team.filter(x => x.p.official && x.p.official.balance > 0).sort((a, b) => b.p.official.reqRR - a.p.official.reqRR).slice(0, 5) : [];
    out.push(act({ key: 'vol', priority: prioOf(st), issue: `${isA ? 'Team orders' : 'Orders'} ${fP(o.orderPct)} of target — balance ${fN(o.balance)}`,
      evidence: `${head}. Current run rate ${fN(o.curRR)}/day; required ${fN(o.reqRR)}/day for the ${plural(o.daysLeft, 'day')} left.`,
      action: `Book at least ${fN(need)} units of orders every day until month end (balance ${fN(o.balance)} over ${plural(o.daysLeft, 'day')}).` + (split.length ? ` Day targets: ${split.map(x => `${x.name} ${fN(Math.ceil(x.p.official.reqRR))}`).join(', ')}.` : ' Prioritise dealers with Jul–Sep history that have not ordered this month.'),
      outcome: `≥ ${fN(need)} units ordered on ${pd.label}; balance down to ${fN(Math.max(0, o.balance - need))}.`, owner: who, follow, ...due }));
  } else out.push(act({ key: 'vol', priority: 'Low', issue: `${isA ? 'Team target' : 'Target'} covered by orders (${fP(o.orderPct)})`, evidence: `${head}.`,
    action: 'Keep booking at the current run rate and convert every pending order to billing before month end.', outcome: 'Orders stay at or above target.', owner: who, follow, ...due }));
  if (o.pending > 0) out.push(act({ key: 'bill', priority: o.billPct < CFG.behind * p.share ? 'High' : 'Medium', issue: `${fN(o.pending)} ordered units not yet billed`,
    evidence: `Ordered ${fN(o.orderAch)} vs billed ${fN(o.billVol)} this month — billing is ${fP(o.billPct)} of target.`,
    action: `Chase dispatch and billing of pending orders with the depot; confirm stock and dealer credit so they bill by ${pd.label}.`, outcome: `Billing moves towards ${fN(o.orderAch)} units.`, owner: who, follow: 'Depot / billing team', ...due }));
  return out;
}

/* ---------- shared KPI actions (SE level, dealer evidence) ---------- */
function kpiActions(p, owner, pd, follow) {
  const r = p.r, K = r.o, out = [], acts = actionsFor(r.idx, p.day), wl = Math.max(1, p.official ? p.daysLeft : p.wdLeft), dl = p.official ? 'days' : 'working days';
  const due = { deadline: `${pd.label}, ${CFG.checkTime}`, dueISO: pd.iso };
  const k1 = bpOf(p);
  if (k1.has && k1.a < k1.t) {
    const gap = k1.t - k1.a, n = Math.max(1, Math.ceil(gap / wl));
    const unb = acts.filter(x => x.rs[0].k === 'bp'), hist = unb.filter(x => x.l3 > 0);
    out.push(act({ key: 'bp', priority: prioOf(paceStatus(p.bpPace)), issue: `Billing points ${fN(k1.a)} of ${fN(k1.t)} — ${fN(gap)} short`,
      evidence: `${plural(unb.length, 'active dealer')} not billed this month; ${hist.length} of them bought in Jul–Sep. ${wl} ${dl} left → ${f1(gap / wl)} new dealers per day needed.`,
      action: unb.length ? `Get first orders this month from ${plural(n, 'dealer')} — best candidates (bought in Jul–Sep or plan): ${dList(hist.length ? hist : unb, Math.max(3, n + 1))}.` : 'All active dealers are billed — add billing points from inactive dealers with recent history.',
      outcome: `+${n} billing point${n > 1 ? 's' : ''} (BP ${fN(k1.a + n)} of ${fN(k1.t)}).`, owner, follow, ...due }));
  }
  const k5 = K[5];
  if (k5.has && k5.a < k5.t) {
    const gap = k5.t - k5.a, n = Math.max(1, Math.ceil(gap / wl)), noNpd = acts.filter(x => x.rs.some(y => y.k === 'npd'));
    out.push(act({ key: 'npd', priority: prioOf(paceStatus(p.share ? k5.a / (k5.t * p.share) : null)), issue: `NPD placed at ${fN(k5.a)} of ${fN(k5.t)} counters`,
      evidence: `${plural(noNpd.length, 'billed dealer')} took no NPD SKU this month.`,
      action: noNpd.length ? `Add one NPD SKU to the next order at ${plural(n, 'dealer')} — candidates: ${dList(noNpd, Math.max(2, n + 1))}.` : 'Place NPD with the next newly billed dealers.',
      outcome: `+${n} NPD counter${n > 1 ? 's' : ''}.`, owner, follow, ...due }));
  }
  const k6 = p.official && p.official.mbdT ? { has: true, t: p.official.mbdT, a: p.official.mbdA, p: p.official.mbdA / p.official.mbdT } : K[6];
  if (k6.has && k6.p < 1) {
    const low = acts.filter(x => x.rs.some(y => y.k === 'mbd'));
    out.push(act({ key: 'mbd', priority: prioOf(paceStatus(k6.p)), issue: `Range ${f1(k6.a)} models per billed dealer vs ${f1(k6.t)} target`,
      evidence: `${plural(low.length, 'billed dealer')} below their own model target (MIS L3M rule).`,
      action: low.length ? `Add missing models at ${dList(low, 2)} — ${low[0].rs.find(y => y.k === 'mbd').a}.` : 'Widen the range at billed dealers.',
      outcome: `Range per dealer moves towards ${f1(k6.t)}.`, owner, follow, ...due }));
  }
  const k9 = K[9];
  if (k9.has && k9.a < .06) {
    const units = ceilPos(.06 * r.totQ - r.premQ);
    out.push(act({ key: 'prem', priority: prioOf(paceStatus(k9.p)), issue: `Premium share ${fP1(k9.a)} vs 6% target`,
      evidence: `${fN(r.premQ)} premium units of ${fN(r.totQ)} billed; ${fN(Math.max(0, r.billed - K[8].a))} billed dealers took no premium model.`,
      action: `Pitch premium models at the larger billed dealers — ${fN(units)} more premium units reach 6% at today's volume.`,
      outcome: `${fN(units)} premium units added over the remaining days.`, owner, follow, ...due }));
  }
  const k10 = K[10];
  if (k10.has && k10.a < r.base) {
    const od = r.idx.filter(i => DB.D.s[i] === 'A' && DB.D.od[i] > 0).sort((a, b) => DB.D.od[b] - DB.D.od[a]);
    const amt = od.reduce((s, i) => s + DB.D.od[i], 0);
    out.push(act({ key: 'od', priority: 'Medium', issue: `${plural(od.length, 'active dealer')} with overdue above ₹10k (${inr(amt)})`,
      evidence: `OD snapshot dated ${DB.meta.odSnap.split('-').reverse().join('-')} — may be out of date.`,
      action: `Confirm and collect overdue: ${od.slice(0, 3).map(i => `${dName(i)} ${inr(DB.D.od[i])}`).join('; ')}.`,
      outcome: 'Overdue cleared or a payment date agreed.', owner, follow, basis: BASIS.lim, ...due }));
  }
  return out;
}

/* working hours (Check In Check out): too little time in the market → an action; needs 2+ days of check-ins */
function hoursAction(lvl, name, day, due, follow) {
  const f = fieldOf(lvl, name, day); if (!f || !f.days || f.days < 2 || f.span == null || f.span >= CFG.minField * 60) return [];
  return [act({ key: 'hrs', priority: f.span < (CFG.minField - 2) * 60 ? 'High' : 'Medium', issue: `${hrs(f.span)} a day in the market (target ${CFG.minField} h)`,
    evidence: `${plural(f.days, 'day')} with check-ins this month: first check-in ~${hhmm(f.firstIn)}, last check-out ~${hhmm(f.lastOut)}; ${hrs(f.atDealer)} a day at dealers over ${f.calls} visits.`,
    action: `Start the first dealer visit by ${CFG.startBy} and stay in the market at least ${CFG.minField} hours; check in and out at every dealer.`,
    outcome: `${CFG.minField}+ hours in the market today.`, owner: name, follow, ...due })];
}

/* pending orders: dealer-wise from Cycle_Order (status per dealer), else the dashboard's open-order total */
function pendAction(lvl, name, due) {
  const pe = pendOf(lvl, name); if (!pe || !pe.units) return [];
  if (pe.src === 'cycle') return [act({ key: 'pend', priority: pe.rej > 0 || pe.units >= 200 ? 'High' : 'Medium', issue: `${fN(pe.units)} ordered units pending at ${plural(pe.list.length, 'dealer')}`,
    evidence: `${fN(pe.wait)} awaiting dispatch · ${fN(pe.disp)} dispatched, invoice pending · ${fN(pe.rej)} rejected for stock (Cycle_Order, this and last month).`,
    action: `Chase dispatch with the depot: ${pe.list.slice(0, 3).map(x => `${dName(x.i)} ${fN(x.bal)} units (${x.st})`).join('; ')}.${pe.rej ? ' Offer in-stock models for the rejected lines.' : ''}`,
    outcome: 'Pending orders dispatched and billed.', owner: name, follow: 'Depot / billing team', ...due })];
  return [act({ key: 'pend', priority: 'Medium', issue: `${fN(pe.units)} units in open orders (CM+LM)`, evidence: `Dashboard ${lvl}${pe.cancel ? ` · ${fN(pe.cancel)} cancelled this month` : ''}. Dealer-wise status needs the Cycle_Order sheet.`,
    action: 'Chase dispatch of open orders with the depot; check dealer credit and stock so they bill.', outcome: 'Open orders billed.', owner: name, follow: 'Depot / billing team', ...due })];
}
/* coverage: active mapped dealers not visited yet this month, when coverage trails the working days gone */
function coverageAction(name, day, due, follow) {
  const f = fieldOf('SE', name, day); if (!f || !f.cov || f.cov.t < 5) return [];
  const fd = Math.min(fieldDay(day), DB.dim), share = DB.wd[fd] / DB.wdTotal, r = f.cov.a / f.cov.t; if (r >= share * .8 || f.cov.a >= f.cov.t) return [];
  const left = f.cov.t - f.cov.a, perDay = Math.max(1, Math.ceil(left / Math.max(1, DB.wdTotal - DB.wd[fd])));
  const best = f.cov.not.slice().sort((a, b) => (DB.D.l3[b] || 0) - (DB.D.l3[a] || 0));
  return [act({ key: 'cov', priority: r < share * .5 ? 'High' : 'Medium', issue: `${fN(f.cov.a)} of ${fN(f.cov.t)} active dealers visited this month`,
    evidence: `${plural(left, 'dealer')} not visited yet; ${fP(share)} of working days gone.`, action: `Add ${plural(perDay, 'unvisited dealer')} a day to the journey plan, starting with ${best.slice(0, 3).map(dName).join('; ')}.`,
    outcome: 'Every active dealer visited at least once this month.', owner: name, follow, ...due, best })];
}

/* ---------- SE daily ---------- */
function dailyRSE(name, day = ST.day) {
  const s = DB.seInfo.get(name) || {}, p = perfOf(scopeF({ se: name }), day), pd = planDate(day), asm = s.asm || 'ASM not mapped';
  const items = [], due = { deadline: `${pd.label}, ${CFG.checkTime}`, dueISO: pd.iso }, follow = `ASM ${asm} reviews at ${CFG.checkTime}`;
  const ord = ordersOf(p.idx), acts = actionsFor(p.r.idx, day);
  if (p.official) items.push(...officialVol(p, name, pd, due, follow, null));
  else if (p.plan > 0) {
    if (p.wdLeft <= 0) items.push(act({ key: 'vol', priority: prioOf(p.status), issue: `Month closed at ${fP(p.ach)} of plan`, evidence: `${fN(p.mtd)} of ${fN(p.plan)} units.`, action: 'Bill any remaining dispatches dated this month; carry the gap into next month’s plan.', outcome: 'Month-end billing completed.', owner: name, follow, ...due }));
    else {
      const today = Math.ceil(p.need), st = p.status;
      items.push(act({ key: 'vol', priority: prioOf(st),
        issue: st === 'ok' ? `Volume on pace (${fP(p.pace)})` : `Volume ${fP(p.pace)} of pace — ${PSTAT[st].l}`,
        evidence: `MTD ${fN(p.mtd)} of ${fN(p.plan)} plan (${fP(p.ach)}) with ${fP(p.share)} of working days gone. Run rate ${fN(p.rr)}/day; ${fN(p.need)}/day needed over ${plural(p.wdLeft, 'working day')}.`,
        action: st === 'ok' ? `Hold the run rate: bill at least ${fN(today)} units on ${pd.label}.`
          : `Bill at least ${fN(today)} units on ${pd.label}.${ord.list.length ? ` Start with open orders: ${ord.list.slice(0, 3).map(x => `${dName(x.i)} ${inr(x.open)}`).join('; ')}.` : ''} Then unbilled dealers with Jul–Sep history.`,
        outcome: `≥ ${fN(today)} units billed; MTD ${fN(p.mtd + today)} (${fP((p.mtd + today) / p.plan)} of plan).`, owner: name, follow, ...due }));
    }
  } else items.push(act({ key: 'vol', priority: 'Medium', issue: 'No volume plan for this SE', evidence: `None of the ${fN(p.mapped)} mapped dealers carries a ${MON[DB.m - 1]} plan in the reference pack${DB.sameMonth ? '' : ' (the pack is for another month)'}.`,
    action: 'Confirm the dealer-wise plan with sales operations so volume can be tracked.', outcome: 'Plan available in the next reference pack.', owner: asm, follow: 'Sales operations', basis: BASIS.lim, ...due }));
  items.push(...kpiActions(p, name, pd, follow));
  const pj = pjpOf('SE', name);
  if (DB.sameMonth && !pj) items.push(act({ key: 'pjp', priority: 'Medium', issue: 'No journey-plan (DJP/PJP) record', evidence: 'This SE is not in the Journey Plan Update for the month (W1–W2).', action: 'Upload this month’s journey plan and log visits daily.', outcome: 'Visits tracked from the next refresh.', owner: name, follow: `ASM ${asm}`, basis: BASIS.inv, ...due }));
  else if (pj && pj.pct != null && pj.pct < CFG.watch) items.push(act({ key: 'pjp', priority: prioOf(paceStatus(pj.pct)), issue: `Journey-plan adherence ${fP(pj.pct)}`, evidence: `${fN(pj.a)} of ${fN(pj.p)} planned visits made${pj.pc ? `; ${fN(pj.pc)} productive` : ''} (journey plan).`, action: `Complete every planned visit on ${pd.label} and book an order at each dealer with an open gap.`, outcome: 'All planned visits done and logged.', owner: name, follow, ...due }));
  items.push(...hoursAction('SE', name, day, due, follow), ...pendAction('SE', name, due), ...coverageAction(name, day, due, follow));
  const m = momentum(p);
  if (m && m.g < -CFG.stable) items.push(act({ key: 'mom', priority: m.g < -.25 ? 'High' : 'Medium', issue: `Billing down ${fP(-m.g)} on the previous 7 days`, evidence: `${fN(m.l7)} units in the last 7 days vs ${fN(m.p7)} in the 7 before.${ord.rej ? ` ${inr(ord.rej)} of orders were rejected for stock.` : ''}`,
    action: 'Find the reason with the ASM: supply (stock rejections, dispatch) or demand (fewer orders). Record it in Remarks.', outcome: 'Cause identified and a fix agreed.', owner: name, follow: `ASM ${asm}`, basis: BASIS.inv, ...due }));
  if (p.status === 'ok' && items.every(x => x.priority === 'Low')) items.push(act({ key: 'keep', priority: 'Low', issue: 'Performing to plan', evidence: `Pace ${fP(p.pace)}; no KPI gap needs action today.`, action: 'Keep the visit and billing rhythm; share what works with the team.', outcome: 'Pace held at or above plan.', owner: name, follow, ...due }));
  return { type: 'daily', level: 'SE', name, asm: s.asm || '', zone: s.z || '', period: pd.iso, periodLabel: pd.label, periodEnd: pd.iso, dataTo: dLabel(effDay(day)), p, pjp: pj,
    dealers: acts.slice(0, 10), items: sortItems(items, CFG.maxDaily) };
}

/* ---------- ASM daily ---------- */
function dailyASM(name, day = ST.day) {
  const a = DB.asms.find(x => x.n === name) || {}, p = perfOf(scopeF({ asm: name }), day), pd = planDate(day), team = teamOf(name, day);
  const items = [], due = { deadline: `${pd.label}, ${CFG.checkTime}`, dueISO: pd.iso }, follow = `${name} reviews team billing at ${CFG.checkTime}`;
  const under = team.filter(x => x.p.status === 'behind' || x.p.status === 'crit').sort((x, y) => (y.p.gap || 0) - (x.p.gap || 0));
  const watch = team.filter(x => x.p.status === 'watch');
  if (p.official) items.push(...officialVol(p, name, pd, due, follow, team));
  else if (p.plan > 0 && p.wdLeft > 0) {
    const today = Math.ceil(p.need), split = team.filter(x => x.p.need > 0).sort((x, y) => y.p.need - x.p.need).slice(0, 5);
    items.push(act({ key: 'vol', priority: prioOf(p.status), issue: p.status === 'ok' ? `Team volume on pace (${fP(p.pace)})` : `Team volume ${fP(p.pace)} of pace — ${PSTAT[p.status].l}`,
      evidence: `Team MTD ${fN(p.mtd)} of ${fN(p.plan)} plan (${fP(p.ach)}) with ${fP(p.share)} of working days gone; ${fN(p.need)}/day needed vs run rate ${fN(p.rr)}/day.`,
      action: `Team to bill at least ${fN(today)} units on ${pd.label}.${split.length ? ` Day targets: ${split.map(x => `${x.name} ${fN(Math.ceil(x.p.need))}`).join(', ')}.` : ''}`,
      outcome: `≥ ${fN(today)} team units billed.`, owner: name, follow, ...due }));
  } else if (!(p.plan > 0)) items.push(act({ key: 'vol', priority: 'Medium', issue: 'No volume plan for this ASM', evidence: 'No dealer in the ASM’s scope has a plan in the reference pack.', action: 'Confirm the team plan with sales operations.', outcome: 'Plan in the next reference pack.', owner: name, follow: 'Sales operations', basis: BASIS.lim, ...due }));
  if (under.length) {
    const top = under.slice(0, 3);
    items.push(act({ key: 'rse', priority: under.some(x => x.p.status === 'crit') ? 'High' : 'Medium',
      issue: p.status === 'ok' ? `Team on pace, but ${plural(under.length, 'SE')} behind` : `${plural(under.length, 'SE')} behind pace`,
      evidence: under.slice(0, 5).map(x => `${x.name} ${fP(x.p.pace)} of pace (−${fN(x.p.gap)} units)`).join('; ') + (watch.length ? `. Watch: ${watch.map(x => x.name).join(', ')}.` : '.'),
      action: `Joint working or a review call with ${top.map(x => x.name).join(' and ')} on ${pd.label}: agree day targets (${top.map(x => `${x.name} ${fN(Math.ceil(x.p.need || 0))} units`).join(', ')}) and go through their dealer focus lists.`,
      outcome: 'Each SE reviewed hits the agreed day target.', owner: name, follow: 'Check each reviewed SE’s billing at day end', ...due }));
  }
  const k1 = bpOf(p);
  if (k1.has && k1.a < k1.t) {
    const g = team.map(x => ({ x, g: Math.max(0, bpOf(x.p).t - bpOf(x.p).a) })).filter(o => o.g > 0).sort((u, v) => v.g - u.g);
    const n = Math.max(1, Math.ceil((k1.t - k1.a) / Math.max(1, p.official ? p.daysLeft : p.wdLeft)));
    items.push(act({ key: 'bp', priority: prioOf(paceStatus(p.bpPace)), issue: `Team billing points ${fN(k1.a)} of ${fN(k1.t)}`,
      evidence: g.length ? `Largest gaps: ${g.slice(0, 4).map(o => `${o.x.name} −${o.g}`).join(', ')}.` : 'Gap sits in dealers not mapped to an SE.',
      action: `Push ${plural(n, 'new billing point')} on ${pd.label}; check the SEs with the largest gaps work their unbilled-dealer lists.`,
      outcome: `+${n} team billing point${n > 1 ? 's' : ''}.`, owner: name, follow, ...due }));
  }
  const ord = ordersOf(p.idx);
  if (ord.open > 0 || ord.rej > 0) items.push(act({ key: 'ord', priority: ord.rej > ord.open ? 'High' : 'Medium', issue: `${inr(ord.open)} open orders; ${inr(ord.rej)} rejected for stock`,
    evidence: `Open orders sit with ${plural(ord.list.length, 'dealer')} in the team.`, action: 'Chase dispatch of open orders with the depot and escalate stock rejections to supply planning; offer in-stock alternates.',
    outcome: 'Open orders billed; rejected lines replaced.', owner: name, follow: 'Depot / supply planning', ...due }));
  if (DB.sameMonth) {
    const noPjp = team.filter(x => !pjpOf('SE', x.name)), lowPjp = team.filter(x => { const j = pjpOf('SE', x.name); return j && j.pct != null && j.pct < CFG.watch; });
    if (noPjp.length || lowPjp.length) items.push(act({ key: 'pjp', priority: 'Medium', issue: 'Journey-plan (DJP/PJP) gaps in the team',
      evidence: [noPjp.length ? `No record: ${noPjp.map(x => x.name).join(', ')}` : '', lowPjp.length ? `Below ${fP(CFG.watch)} adherence: ${lowPjp.map(x => `${x.name} ${fP(pjpOf('SE', x.name).pct)}`).join(', ')}` : ''].filter(Boolean).join('. ') + ' (journey plan).',
      action: 'Get the missing journey plans uploaded and review missed visits with each SE.', outcome: 'Every SE has a current plan and logs visits.', owner: name, follow: 'Next refresh', basis: noPjp.length ? BASIS.inv : BASIS.obs, ...due }));
  }
  items.push(...hoursAction('ASM', name, day, due, follow), ...pendAction('ASM', name, due));
  const open = carryOver(team.map(x => x.name).concat(name), pd.iso);
  if (open.length) items.push(act({ key: 'carry', priority: open.some(isOverdue) ? 'High' : 'Medium', issue: `${plural(open.length, 'open action')} from earlier plans`,
    evidence: `${open.filter(isOverdue).length} overdue; ${open.filter(r => r.status === 'Blocked').length} blocked (Action tracking).`, action: 'Follow up each open action with its owner and update its status.', outcome: 'Open actions closed or re-dated.', owner: name, follow: 'Action tracking', ...due }));
  const good = team.filter(x => x.p.status === 'ok');
  if (good.length) items.push(act({ key: 'keep', priority: 'Low', issue: `${plural(good.length, 'SE')} on pace`, evidence: good.map(x => `${x.name} ${fP(x.p.pace)}`).join(', ') + '.', action: 'Recognise them and ask them to share what is working with the team.', outcome: 'Practices shared at the next team call.', owner: name, follow, ...due }));
  return { type: 'daily', level: 'ASM', name, asm: name, zone: a.z || '', period: pd.iso, periodLabel: pd.label, periodEnd: pd.iso, dataTo: dLabel(effDay(day)), p, team, pjp: pjpOf('ASM', name), items: sortItems(items, CFG.maxDaily) };
}

/* ---------- weekly ---------- */
function weekCtx(wn, day) {
  day = effDay(day);
  const W = weeks(), w = W.find(x => x.n === wn), nx = W.find(x => x.n === wn + 1);
  let label, iso, endISO, wdNext;
  if (nx) { label = `W${nx.n} · ${nx.range}`; iso = `${DB.month}-W${nx.n}`; endISO = isoD(dayDate(nx.e)); wdNext = nx.wd; }
  else { const nd = new Date(DB.y, DB.m, 1); label = `W1 · ${MON[nd.getMonth()]} ${nd.getFullYear()}`; iso = `${isoD(nd).slice(0, 7)}-W1`; endISO = isoD(new Date(nd.getFullYear(), nd.getMonth(), 7)); wdNext = 0; }
  const startISO = nx ? isoD(dayDate(nx.s)) : isoD(new Date(DB.y, DB.m, 1));
  // review checkpoints: 3rd working day of the plan week and its last working day
  let mid = null, end = null;
  if (nx) { let c = 0; for (let d = nx.s; d <= nx.e; d++) if (!DB.sun(d)) { c++; if (c === 3) mid = d; end = d; } }
  // the plan week may already be under way (weeks are 1–7, 8–14 … not Mon–Sun): checkpoints never fall before the data date
  const started = !!nx && nx.s <= day, wdRem = nx ? DB.wd[nx.e] - DB.wd[Math.max(day, nx.s - 1)] : 0;
  if (started && mid && mid <= day) { mid = null; for (let d = day + 1; d <= nx.e; d++) if (!DB.sun(d)) { mid = d; break; } if (mid === end) mid = null; }
  return { w, nx, label, iso, startISO, endISO, wdNext, started, wdRem, mid: mid ? longD(dayDate(mid)) : null, end: end ? longD(dayDate(end)) : null, partial: !!w && w.e > day };
}
/* units to bill in the plan week: pro-rata share of the remaining month gap */
function nextWeekTarget(p, wpk, c) {
  if (!c.nx || !(p.plan > 0)) return null;
  if (p.official) {   // workbook rule: required run rate (orders) × calendar days of the plan week still ahead
    const o = p.official, days = Math.max(0, c.nx.e - Math.max(p.day, c.nx.s - 1)), t = (o.balance > 0 ? o.reqRR : 0) * days;
    return { t, wd: days, per: o.balance > 0 ? o.reqRR : 0, sofar: c.started ? ((p.wk.find(x => x.n === c.nx.n) || {}).units || 0) : null, gapAfter: Math.max(0, o.balance - t), orders: true };
  }
  if (c.started) {
    const t = p.wdLeft > 0 ? (p.gap || 0) * c.wdRem / p.wdLeft : 0, sofar = (p.wk.find(x => x.n === c.nx.n) || {}).units || 0;
    return { t, wd: c.wdRem, per: c.wdRem ? t / c.wdRem : 0, sofar, gapAfter: Math.max(0, (p.gap || 0) - t) };
  }
  const gapW = Math.max(0, p.plan - wpk.cumEnd), wlW = DB.wdTotal - DB.wd[wpk.to], t = wlW > 0 ? gapW * c.wdNext / wlW : 0;
  return { t, wd: c.wdNext, per: c.wdNext ? t / c.wdNext : 0, sofar: null, gapAfter: Math.max(0, gapW - t) };
}
const wkWord = c => c.label.split(' ·')[0];
function wkVolAction(nt, c, who) {
  if (!nt) return 'Month ends — close remaining dispatches and carry the gap into next month’s plan.';
  if (nt.orders) return nt.t > 0 ? `${who} to book at least ${fN(nt.t)} units of orders in ${c.label.split(' ·')[0]} (${plural(nt.wd, 'day')} × ${fN(nt.per)}/day required run rate), and get every pending order billed.` : 'Target covered by orders — keep the run rate and convert pending orders to billing.';
  if (nt.sofar != null) return `${wkWord(c)} is already under way (${fN(nt.sofar)} units billed so far): ${who} to bill at least ${fN(nt.t)} more units by ${c.end} — about ${fN(nt.per)} per remaining working day (${nt.wd}).`;
  return `${who} to bill at least ${fN(nt.t)} units in ${c.label} — about ${fN(nt.per)} per working day.`;
}
function weekLine(w) { return w ? `${w.label} ${fN(w.units)} of ${fN(w.tTo)} (${fP(w.pct)})` : '–'; }

function weeklyRSE(name, wn, day = ST.day) {
  const s = DB.seInfo.get(name) || {}, p = perfOf(scopeF({ se: name }), day), c = weekCtx(wn, day), asm = s.asm || 'ASM not mapped';
  const w = c.w, prev = p.wk.find(x => x.n === wn - 1), wpk = p.wk.find(x => x.n === wn), items = [];
  const due = { deadline: c.end || c.label, dueISO: c.endISO }, follow = `Checkpoints: ${c.mid || 'mid-week'} and ${c.end || 'week end'} with ASM ${asm}`;
  const pd = { label: c.end || c.label, iso: c.endISO };
  if (p.plan > 0 && wpk) {
    const st = paceStatus(wpk.pct), nt = nextWeekTarget(p, wpk, c);
    items.push(act({ key: 'wvol', priority: prioOf(st), issue: `${wpk.label} at ${fP(wpk.pct)} of its target${c.partial ? ' (week in progress)' : ''}`,
      evidence: `${weekLine(wpk)}; previous week ${prev ? fP(prev.pct) : 'n/a'}. Best day ${wpk.bestD ? dLabel(wpk.bestD) + ' ' + fN(wpk.best) + ' units' : '–'}. Month gap now: ${fN(p.gap)} units.`,
      action: wkVolAction(nt, c, 'SE'),
      outcome: nt ? `${wkWord(c)} at ≥ 100% of its pro-rata target; month gap down to ${fN(nt.gapAfter)}.` : 'Month closed.', owner: name, follow, ...due }));
    if (wpk.zero >= 2) items.push(act({ key: 'wcons', priority: 'Medium', issue: `No billing on ${wpk.zero} of ${wpk.wdTo} working days`, evidence: `Daily pattern in ${wpk.label} (${wpk.range}).`, action: 'Plan visits so every working day ends with an order to dispatch.', outcome: 'Billing on every working day.', owner: name, follow, ...due }));
  } else items.push(act({ key: 'wvol', priority: 'Medium', issue: 'No volume plan for this SE', evidence: 'No dealer plan in the reference pack.', action: 'Confirm the dealer-wise plan with sales operations.', outcome: 'Plan available next refresh.', owner: asm, follow: 'Sales operations', basis: BASIS.lim, ...due }));
  // biggest live-KPI gap (billing points, NPD, range, premium) for the coming week
  const ka = kpiActions(p, name, pd, follow).filter(x => x.key !== 'od').map(x => Object.assign(x, { key: 'w' + x.key }));
  items.push(...ka.slice(0, 2));
  const t = p.trend;
  const tAct = { down: ['High', 'Performance declining week on week', 'Root-cause review with the ASM: supply, dealer demand or visit coverage. Record the cause in Remarks.', BASIS.inv],
    low: ['High', 'Consistently below target', 'Weekly coaching plan with the ASM: day-wise targets and a joint visit.', BASIS.obs],
    up: ['Medium', 'Improving but keep going', 'Continue the actions that worked last week; close the remaining gap.', BASIS.obs],
    strong: ['Low', 'Strong and consistent', 'Sustain; share what works at the team review.', BASIS.obs],
    flat: ['Medium', 'No clear change week on week', 'Pick one KPI gap and close it this week.', BASIS.obs],
    insufficient: ['Medium', 'Not enough complete weeks to judge a trend', 'Track daily billing against the day target; trend shows after two complete weeks.', BASIS.lim] }[t.k];
  items.push(act({ key: 'wtrend', priority: tAct[0], issue: t.k === 'up' ? 'Trend improving — keep the momentum' : t.k === 'strong' ? 'Strong and consistent — sustain' : `Trend: ${tAct[1].charAt(0).toLowerCase() + tAct[1].slice(1)}`, evidence: t.basis || 'Weekly totals vs pro-rata targets.', action: tAct[2], outcome: 'Trend improves in the next complete week.', owner: name, follow, basis: tAct[3], ...due }));
  const open = carryOver([name], c.startISO);
  if (open.length) items.push(act({ key: 'wcarry', priority: open.some(isOverdue) ? 'High' : 'Medium', issue: `${plural(open.length, 'open action')} carried forward`, evidence: open.slice(0, 3).map(r => r.issue).join('; ') + '.', action: 'Close or re-date each carried action in the first two days of the week.', outcome: 'No carried action left open.', owner: name, follow: 'Action tracking', ...due }));
  return { type: 'weekly', level: 'SE', name, asm: s.asm || '', zone: s.z || '', period: c.iso, periodLabel: c.label, periodEnd: c.endISO, dataTo: dLabel(effDay(day)), p, ctx: c, wk: wpk, prev, trend: t, items: sortItems(items, CFG.maxWeekly) };
}

function weeklyASM(name, wn, day = ST.day) {
  const a = DB.asms.find(x => x.n === name) || {}, p = perfOf(scopeF({ asm: name }), day), c = weekCtx(wn, day), team = teamOf(name, day);
  const wpk = p.wk.find(x => x.n === wn), prev = p.wk.find(x => x.n === wn - 1), items = [];
  const due = { deadline: c.end || c.label, dueISO: c.endISO }, follow = `Team review on ${c.end || 'the last working day'}`;
  const tw = team.map(x => ({ x, w: x.p.wk.find(y => y.n === wn), pw: x.p.wk.find(y => y.n === wn - 1) })).filter(o => o.w && o.w.pct != null);
  const under = tw.filter(o => o.w.pct < CFG.watch).sort((u, v) => u.w.pct - v.w.pct);
  if (p.plan > 0 && wpk) {
    const nt = nextWeekTarget(p, wpk, c);
    items.push(act({ key: 'wvol', priority: prioOf(paceStatus(wpk.pct)), issue: `Team ${wpk.label} at ${fP(wpk.pct)} of its target${c.partial ? ' (week in progress)' : ''}`,
      evidence: `${weekLine(wpk)}; previous week ${prev ? fP(prev.pct) : 'n/a'}. ${tw.filter(o => o.w.pct >= CFG.onTrack).length} of ${tw.length} SEs at or above their week target.`,
      action: wkVolAction(nt, c, 'Team') + (nt ? ' Give each SE a written number for the week.' : ''),
      outcome: nt ? `Team ${wkWord(c)} at ≥ 100% of its pro-rata target; month gap down to ${fN(nt.gapAfter)}.` : 'Month closed.', owner: name, follow, ...due }));
  }
  if (under.length) items.push(act({ key: 'wcoach', priority: under.some(o => o.w.pct < CFG.behind) ? 'High' : 'Medium',
    issue: (wpk && wpk.pct >= CFG.onTrack ? 'Team at target, but ' : '') + `${plural(under.length, 'SE')} below ${fP(CFG.watch)} of week target`,
    evidence: under.map(o => `${o.x.name} ${fP(o.w.pct)}${o.pw && o.pw.pct != null ? ` (prev ${fP(o.pw.pct)})` : ''}`).join('; ') + '.',
    action: `Coaching and joint working with ${under.slice(0, 3).map(o => o.x.name).join(', ')}: agree day-wise targets for ${c.label.split(' ·')[0]} and review their dealer focus lists.`,
    outcome: 'Each coached SE reaches ≥ 90% of the next week target.', owner: name, follow: `Checkpoints ${c.mid || 'mid-week'} and ${c.end || 'week end'}`, ...due }));
  const dec = tw.filter(o => o.pw && o.pw.pct != null && o.w.complete && o.w.pct - o.pw.pct < -CFG.stable);
  if (dec.length) items.push(act({ key: 'wdec', priority: 'Medium', issue: `${plural(dec.length, 'SE')} declined week on week`, evidence: dec.map(o => `${o.x.name} ${fP(o.pw.pct)} → ${fP(o.w.pct)}`).join('; ') + '.', action: 'Ask each one for the reason (supply, demand, coverage) and log it in Remarks.', outcome: 'Causes recorded and fixes agreed.', owner: name, follow, basis: BASIS.inv, ...due }));
  const k1 = p.r.o[1];
  if (k1.has && k1.a < k1.t && c.wdNext) {
    const n = Math.max(1, Math.ceil((k1.t - k1.a) * (c.started ? c.wdRem : c.wdNext) / Math.max(1, p.wdLeft)));
    items.push(act({ key: 'wbp', priority: prioOf(paceStatus(p.bpPace)), issue: `Team billing points ${fN(k1.a)} of ${fN(k1.t)}`, evidence: `${wpk ? fN(wpk.bpNew) + ' new billing points in ' + wpk.label + '.' : ''}`, action: `Add ${plural(n, 'new billing point')} in ${c.label.split(' ·')[0]}, split across the SEs with the largest gaps.`, outcome: `BP ${fN(k1.a + n)} of ${fN(k1.t)}.`, owner: name, follow, ...due }));
  }
  const open = carryOver(team.map(x => x.name).concat(name), c.startISO);
  if (open.length) items.push(act({ key: 'wcarry', priority: open.some(isOverdue) ? 'High' : 'Medium', issue: `${plural(open.length, 'open action')} in the team carried forward`, evidence: `${open.filter(isOverdue).length} overdue (Action tracking).`, action: 'Review every carried action at the start of the week; close or re-date it.', outcome: 'Carried actions closed.', owner: name, follow: 'Action tracking', ...due }));
  const strong = tw.filter(o => o.w.pct >= CFG.onTrack);
  if (strong.length) items.push(act({ key: 'wkeep', priority: 'Low', issue: `${plural(strong.length, 'SE')} at or above week target`, evidence: strong.map(o => `${o.x.name} ${fP(o.w.pct)}`).join(', ') + '.', action: 'Recognise them in the team review; ask one to share their approach.', outcome: 'Practice shared with the team.', owner: name, follow, ...due }));
  return { type: 'weekly', level: 'ASM', name, asm: name, zone: a.z || '', period: c.iso, periodLabel: c.label, periodEnd: c.endISO, dataTo: dLabel(effDay(day)), p, ctx: c, wk: wpk, prev, trend: p.trend, team: tw, items: sortItems(items, CFG.maxWeekly) };
}

/* ---------- weekly review for the current scope ---------- */
function weeklyReview(wn, day = ST.day) {
  const cmp = rows => rows.map(x => ({ x, w: x.p.wk.find(y => y.n === wn), pw: x.p.wk.find(y => y.n === wn - 1) })).filter(o => o.w && o.w.pct != null);
  const A = cmp(asmRows()), R = cmp(rseRows());
  const mv = arr => arr.filter(o => o.pw && o.pw.pct != null).map(o => Object.assign(o, { d: o.w.pct - o.pw.pct }));
  const Am = mv(A), Rm = mv(R);
  const up = arr => arr.filter(o => o.d > CFG.stable).sort((a, b) => b.d - a.d), down = arr => arr.filter(o => o.d < -CFG.stable).sort((a, b) => a.d - b.d);
  const unresolved = R.filter(o => o.pw && o.pw.pct != null && o.w.pct < CFG.behind && o.pw.pct < CFG.behind);
  const c = weekCtx(wn, day);
  const cont = Object.values(TRK).filter(r => r.status !== 'Completed' && (r.periodEnd || '') <= c.startISO && (r.periodEnd || '') >= isoD(dayDate(c.w.s)));
  return { wn, c, A, R, asmUp: up(Am), asmDown: down(Am), rseUp: up(Rm), rseDown: down(Rm), unresolved,
    onTarget: R.filter(o => o.w.pct >= CFG.onTrack), below: R.filter(o => o.w.pct < CFG.behind), cont };
}

/* ---------- plain-text plan for sharing (WhatsApp / email) ---------- */
function planText(pl) { return captionOf(pl); }   // short WhatsApp-style text (share.js)
