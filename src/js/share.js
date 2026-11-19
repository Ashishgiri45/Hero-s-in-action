'use strict';
/* ================= sharing: 9:16 plan cards, WhatsApp, email, bulk =================
   Card  = 1080×1920 PNG drawn on a canvas: name, pace ring, 4 key numbers, top actions.
   WhatsApp: share the PNG (phone: share sheet → WhatsApp) or copy it and open the chat with a short caption.
   Email: mailto with a short plan; bulk = one .eml draft per person (card attached) in a .zip — open in
   Outlook and press Send. Nothing is sent automatically. Recipients come from the workbook's Contacts sheet. */

const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const contactOf = n => ((SEED && SEED.contacts) || {})[n] || null;
const SHORT_DATE = s => String(s || '').replace(/ \d{4}$/, '');

/* today's journey plan (PJP sheets) for one SE / ASM on a plan date (ISO): the dealers planned, each with what to do there.
   { rows: [{ t: dealer, city, s: to-dos, done }], route, n } or null when the workbook has no plan for that day */
const TODO_SHORT = { bp: r => 'Book an order', ord: () => 'Chase open order', npd: r => r.a, mbd: r => r.a, prem: r => r.a, od: r => 'Collect ' + r.t.replace(/^Overdue/, 'OD'), cmp: r => 'Close ' + r.t, rej: () => 'Offer in-stock alternates' };
function pjpToday(lvl, name, iso) {
  const J = SEED && SEED.jplan; if (!J || !iso || iso.slice(0, 7) !== DB.month) return null;
  const day = +iso.slice(8, 10), list = ((J.rows[lvl] || {})[name] || []).filter(r => r[0] === day), cnt = ((J.cnt[lvl] || {})[name] || {})[day] || 0;
  if (!list.length) return cnt ? { rows: [], route: '', n: cnt } : null;
  const idx = list.map(r => DB.codeIdx.get(r[1])).filter(i => i !== undefined), why = new Map(actionsFor(idx, ST.day).map(x => [x.i, x]));
  const rows = list.map(r => { const x = why.get(DB.codeIdx.get(r[1]));
    const todo = x ? x.rs.slice(0, 2).map(q => (TODO_SHORT[q.k] || (q => q.a))(q).replace(/ — .*$/, '')).join(' · ') : '';
    return { t: `${r[2]}${r[3] ? ', ' + r[3] : ''}`, s: [r[5] ? '✓ Visited' : '', todo || (r[5] ? '' : 'Routine visit: take the order'), r[6] ? 'Joint visit with RSM' : ''].filter(Boolean).join(' · '), sc: x ? x.sc : 0, done: r[5] };
  }).sort((a, b) => a.done - b.done || b.sc - a.sc);
  return { rows, route: [...new Set(list.map(r => r[4]).filter(Boolean))].join(' / '), n: list.length };
}

/* ---------- concise wording ---------- */
function briefOf(it, pl) {
  const k = it.key.replace(/^w/, ''), act = String(it.action || '');
  const n = (/at least ([\d,]+)/.exec(act) || [])[1];
  const bk = /book at least ([\d,]+) units of orders/i.exec(act);
  if (k === 'vol' && bk) return `Book ≥ ${bk[1]} units of orders ${pl.type === 'daily' ? 'today (required run rate)' : 'this week'}`;
  if (k === 'bill') return `Get ${it.issue.replace(' ordered units not yet billed', '')} pending ordered units billed`;
  if (k === 'vol' && n) return `Bill ≥ ${n} units ${pl.type === 'daily' ? 'today' : 'this week'}`;
  const prem = /([\d,]+) more premium units/.exec(act); if (k === 'prem' && prem) return `Sell ${prem[1]} more premium units (6% mix)`;
  let s = act.split(/(?<=\.)\s/)[0].replace(/\.$/, '').replace(/\s*\(#\d+\)/g, '').replace(/₹[\d.,]+\s*(L|Cr)?/g, '');
  s = s.replace(/ on (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+ \d{4}/, '').replace(/ — best candidates \([^)]*\)/, ':').replace(/ — candidates/, ':').replace(/ this month/, '');
  const SHORTEN = [[/^Add one NPD SKU to the next order at/, 'Place NPD at'], [/^Add missing models at/, 'Add models at'], [/^Get first orders from/, 'Get first order from'],
    [/^Confirm and collect overdue/, 'Collect overdue'], [/^Joint working or a review call with/, 'Review with'], [/^Chase dispatch of open orders.*/, 'Chase open orders & stock rejections'],
    [/^Complete every planned visit.*/, 'Complete all planned DJP visits'], [/^Upload this month’s journey plan.*/, 'Upload journey plan; log visits daily'],
    [/: agree day targets.*$/, ': agree day targets'], [/^Push (\d+) new billing points?.*/, 'Add $1 new billing points across the team'], [/^Add (\d+) new billing points? in.*/, 'Add $1 new billing points this week'],
    [/^Recognise them.*/, 'Recognise on-track SEs; share what works'], [/^Follow up each open action.*/, 'Close open actions from earlier plans'],
    [/^Get the missing journey plans uploaded.*/, 'Get missing DJP plans uploaded'], [/^Coaching and joint working with/, 'Coach'], [/^Ask each one for the reason.*/, 'Find reasons for week-on-week drops'],
    [/^Plan visits so every working day.*/, 'Take orders every working day'], [/^Find the reason with the ASM.*/, 'Find cause of the sales drop with ASM'],
    [/^Keep booking at the current run rate.*/, 'Keep booking orders at the current run rate']];
  for (const [rx, to] of SHORTEN) s = s.replace(rx, to);
  s = s.replace(/ — .*$/, '').replace(/::/g, ':').replace(/;\s+[a-z].*$/, '');
  const i = s.indexOf(': ');
  if (i > 0) { const names = s.slice(i + 2).split(/;|,(?= [A-Z])/).map(x => x.trim()).filter(Boolean).slice(0, 2); s = s.slice(0, i) + (names.length ? ': ' + names.join(', ') : ''); }
  return s.length > 80 ? s.slice(0, 78).replace(/\s+\S*$/, '') + '…' : s;
}
/* ---------- field tiles: market visits planned vs actual, working hours, display contest (market activity) ----------
   [label, value, sub-line, colour, progress 0–1 | null]; null when there is neither visit nor contest data */
function fieldTiles(pl) {
  const f = fieldOf(pl.level, pl.name, pl.p.day), k = contestOf(pl.level, pl.name, pl.p.day); if (!f && !k) return null;
  const pc = v => v == null ? '#94a3b8' : v >= CFG.watch ? '#34d399' : v >= CFG.behind ? '#fbbf24' : '#fb7185', fd = fieldDay(pl.p.day), t = [];
  if (f) t.push(['MARKET VISITS', f.plan ? `${fN(f.done)}/${fN(f.plan)}` : '–', f.pct != null ? `${fP(f.pct)} of planned${fd > pl.p.day ? ` · to ${fd} ${MON[DB.m - 1]}` : ''}` : 'no journey plan', pc(f.pct), f.pct],
    ['WORKING HOURS', f.span != null ? hrs(f.span) : '–', '', '#34d399', null]);   // just the time (average a day in the market)
  if (k) t.push(['DISPLAY CONTEST', `${fN(k.done)}/${fN(k.plan)}`, `audits · ${fN(k.q)} qualified`, pc(k.plan ? k.done / k.plan : null), k.plan ? k.done / k.plan : null]);
  return t;
}
/* ---------- field work lines under the tiles (today's plan, coverage, productivity, hours, team), shared by the card, WhatsApp and email ----------
   [label, text] pairs; empty when the workbook has no PJP / Check In Check out data for this person */
function fieldLines(pl) {
  const lvl = pl.level, f = fieldOf(lvl, pl.name, pl.p.day); if (!f) return [];
  const jp = pl.type === 'daily' ? pjpToday(lvl, pl.name, pl.period) : null, out = [];
  const today = [jp ? `${plural(jp.n, 'visit')} planned` : null, f.cov ? `${fN(f.cov.a)} of ${fN(f.cov.t)} dealers visited this month` : null, f.calls ? `orders at ${fN(f.orders)} of ${fN(f.calls)} visits` : null].filter(Boolean);
  if (today.length) out.push([jp ? 'TODAY' : 'COVERAGE', today.join(' · ')]);
  return out;   // working hours are a tile now (just the time)   // only this person's own figures (no team lines on an individual's card or message)
}

/* ---------- daily task wording: DO (verb + number) · WHERE (dealers / SEs, today's route first) · WHY (the figure behind it) ----------
   Built from the same figures as the plan item; falls back to briefOf for anything else (and for weekly plans). */
function taskCtx(pl) {
  if (pl._tc) return pl._tc;
  const jp = pl.type === 'daily' ? pjpToday(pl.level, pl.name, pl.period) : null;
  const route = new Set(jp ? ((SEED.jplan.rows[pl.level] || {})[pl.name] || []).filter(r => r[0] === +pl.period.slice(8, 10)).map(r => DB.codeIdx.get(r[1])).filter(i => i !== undefined) : []);
  const acts = actionsFor(pl.p.r.idx, pl.p.day);   // the person's own dealers (an ASM's = their area's dealers)
  return (pl._tc = { jp, route, acts });
}
function taskOf(it, pl) {
  const k = it.key, p = pl.p, o = p.official, isA = pl.level === 'ASM', T = pl.type === 'daily' ? 'today' : 'this week';
  if (pl.type !== 'daily') return { what: briefOf(it, pl), where: '', why: it.issue };
  const { jp, route, acts } = taskCtx(pl), nm = i => DB.D.n[i];
  // dealers for a reason kind: today's route first, then the rest by priority
  const pickD = (kind, n) => { const l = acts.filter(x => x.rs.some(r => r.k === kind)), on = l.filter(x => route.has(x.i)), off = l.filter(x => !route.has(x.i));
    return on.length ? `On today's route: ${on.slice(0, n).map(x => nm(x.i)).join(', ')}` : off.length ? `Start with: ${off.slice(0, n).map(x => nm(x.i)).join(', ')}` : ''; };
  const days = o ? o.daysLeft : p.wdLeft, perDay = gap => Math.max(1, Math.ceil(gap / Math.max(1, days)));
  // dealers with no order yet this month: today's route first, then the biggest buyers of the last 3 months
  const firstOrderDealers = () => acts.filter(a => a.rs[0].k === 'bp').map(a => a.i).sort((a, b) => (route.has(b) - route.has(a)) || (DB.D.l3[b] || 0) - (DB.D.l3[a] || 0));
  switch (k) {
    case 'vol': {
      if (o) {
        const need = o.balance > 0 ? Math.ceil(o.daysLeft > 0 ? o.reqRR : o.balance) : 0, split = isA && pl.team ? pl.team.filter(x => x.p.official && x.p.official.balance > 0).sort((a, b) => b.p.official.reqRR - a.p.official.reqRR).slice(0, 4) : [];
        if (!need) return { what: `Keep booking: ${fN(Math.round(o.curRR))} units of orders ${T}`, where: isA ? 'Every SE keeps their daily order rhythm' : 'Visit every dealer on today’s route and take the order', why: `Target ${fN(o.target)} already covered — ordered ${fN(o.orderAch)} (${fP(o.orderPct)})` };
        return { what: `${isA ? 'Team: book' : 'Book'} ${fN(need)} units of orders ${T}`,
          where: split.length ? 'Day targets: ' + split.map(x => `${x.name.split(' ')[0]} ${fN(Math.ceil(x.p.official.daysLeft > 0 ? x.p.official.reqRR : x.p.official.balance))}`).join(' · ') : (pickD('bp', 3) || 'Take an order at every dealer you visit'),
          why: o.daysLeft > 0 ? `Balance ${fN(o.balance)} in ${plural(o.daysLeft, 'day')} · now ${fN(o.curRR)}/day` : `Balance ${fN(o.balance)} on the last day · now ${fN(o.curRR)}/day` };
      }
      if (p.plan > 0 && p.need > 0) return { what: `${isA ? 'Team: sell' : 'Sell'} ${fN(Math.ceil(p.need))} units ${T}`, where: pickD('bp', 3), why: `${fN(p.mtd)} of ${fN(p.plan)} done · ${plural(p.wdLeft, 'working day')} left` };
      break;
    }
    case 'bp': {
      const b = bpOf(p), gap = b.t - b.a, n = perDay(gap);
      return { what: `Get a first order from ${plural(n, 'more dealer')} ${T}`, where: isA ? (pl.team || []).map(x => ({ x, g: Math.max(0, bpOf(x.p).t - bpOf(x.p).a) })).filter(z => z.g > 0).sort((u, v) => v.g - u.g).slice(0, 3).map(z => `${z.x.name.split(' ')[0]} −${z.g}`).join(' · ').replace(/^(.)/, 'Biggest gaps: $1') : pickD('bp', 3),
        why: `${fN(b.a)} of ${fN(b.t)} dealers have ordered this month — ${fN(gap)} to go` };
    }
    case 'ins': {   // business insight: what happened till date → how to improve from here
      const f = fieldOf(pl.level, pl.name, p.day);
      const need = o ? (o.balance > 0 ? Math.ceil(o.daysLeft > 0 ? o.reqRR : o.balance) : 0) : Math.ceil(p.need || 0), rr = o ? o.curRR : p.rr;
      const done = o ? `ordered ${fN(o.orderAch)} of ${fN(o.target)} (${fP(o.orderPct)})` : `${fN(p.mtd)} of ${fN(p.plan)} (${fP(p.ach)})`;
      const noOrd = acts.filter(a => a.rs[0].k === 'bp').length, npd = p.r.o[5], prem = p.r.o[9];
      const happened = [rr != null ? `run rate ${fN(rr)}/day${need ? (rr >= need ? ', on pace' : `, needs ${fN(need)}/day`) : ''}` : null,
        f && f.calls ? `orders at ${fN(f.orders)} of ${fN(f.calls)} visits` : null, f && f.cov ? `${fN(f.cov.a)} of ${fN(f.cov.t)} dealers visited` : null].filter(Boolean);
      const fix = [need && rr != null && rr < need ? `+${fN(need - rr)} orders/day` : null,
        noOrd ? `first orders from ${fN(noOrd)} dealers` : null,
        f && f.calls && f.orders / f.calls < .5 ? 'order at every visit' : null,
        f && f.cov && f.cov.a / f.cov.t < .5 ? `visit ${fN(f.cov.t - f.cov.a)} unseen dealers` : null,
        npd.has && npd.a < npd.t ? `NPD at ${fN(npd.t - npd.a)} more counters` : null,
        prem.has && prem.a < .06 ? 'premium to 6%' : null].filter(Boolean).slice(0, 2);
      return { what: `${o ? `Ordered ${fP(o.orderPct)} of target` : `Done ${fP(p.ach)} of target`}${need ? ` · need ${fN(need)}/day` : ' · target covered'}`,
        where: fix.length ? `Fix: ${fix.join(' · ')}` : 'Keep the same pace',
        why: happened.length ? `What happened: ${happened.join(' · ')}` : it.issue };
    }
    case 'dsp': {   // display contest: audits due this round, training first, reward at stake for the dealers
      const k = contestOf(pl.level, pl.name, p.day), due = `${k.due} ${MON[DB.m - 1]}`, thr = Math.round(k.thr * 100);
      const stake = k.atStake ? `₹${fN(k.atStake)} dealer rewards at ≥${thr}%` : `qualify at ≥${thr}% score`;
      const why = `Audits ${fN(k.done)}/${fN(k.plan)} · photos ${fN(k.ph)} · ${fN(k.q)} qualified${k.sc != null ? ` · avg score ${fP(k.sc)}` : ''}${k.models.length ? ` · must-display: ${k.models.join(', ')}` : ''}`;
      if (isA) return { what: `Display contest: ${fN(k.done)}/${fN(k.plan)} audits, R${k.round} due ${due}`,
        where: k.unmapped ? `Assign SEs to ${plural(k.unmapped, 'unmapped outlet')} · ${k.trained}/${k.ses} SEs trained` : `${k.trained}/${k.ses} SEs trained · review ${fN(k.ph)} photo sets`, why };
      if (!k.left) return { what: `Display R${k.round} done — keep displays ≥${thr}%`, where: `${fN(k.q)}/${fN(k.o)} outlets qualified · ${stake}`, why };
      if (k.trained !== 1 && !k.r1) return { what: `Display contest: train staff at ${plural(k.o, 'outlet')}`, where: `Then audit R1 by ${due} (${k.perDay}/day) · ${stake}`, why };
      return { what: `Display audit R${k.round}: ${plural(k.left, 'outlet')} by ${due} (${k.perDay}/day)`, where: `Photo at every audit · ${stake}`, why };
    }
    case 'npd': {   // where to push NPD: dealers (today's route first) and which NPD models
      const k5 = p.r.o[5], l = acts.filter(a => a.rs.some(r => r.k === 'npd')).sort((a, b) => route.has(b.i) - route.has(a.i));
      if (!l.length) {   // nobody billed yet this month: put NPD into the first orders
        const c = firstOrderDealers(), zm = c.length ? zoneModels(p.day).get(DB.D.z[c[0]]) : null, ms = zm && zm.npd.length ? zm.npd.slice(0, 2).join(' / ') : '';
        return { what: `Put NPD in ${plural(Math.min(2, c.length), 'first order')}${ms ? `: ${ms}` : ''}`, where: c.slice(0, 2).map(nm).join(', '),
          why: `NPD at ${fN(k5.a)} of ${fN(k5.t)} counters · ${plural(c.length, 'dealer')} yet to order this month` }; }
      const models = ((l[0] && l[0].rs.find(r => r.k === 'npd').a) || '').replace(/^Place\s*/, '').replace(/^an NPD model$/, ''), n = Math.min(l.length, Math.max(1, perDay(k5.t - k5.a)));
      return { what: `Push NPD at ${plural(Math.min(2, l.length), 'dealer')}${models ? `: ${models}` : ''}`, where: l.slice(0, 2).map(a => nm(a.i)).join(', '),
        why: `NPD at ${fN(k5.a)} of ${fN(k5.t)} counters · ${plural(l.length, 'billed dealer')} without NPD` }; }
    case 'mbd': {   // where models can be increased: dealers below their model target, with models to add
      const l = acts.filter(a => a.rs.some(r => r.k === 'mbd')).sort((a, b) => route.has(b.i) - route.has(a.i));
      if (!l.length) {   // nobody billed yet this month: book the full model range in the first orders
        const c = firstOrderDealers().filter(i => DB.D.mt[i] > 0), zm = c.length ? zoneModels(p.day).get(DB.D.z[c[0]]) : null;
        const top = zm ? zm.all.slice(0, 2).map(m => DB.modelLabel[m]).join(', ') : '';
        return { what: `Full range in first orders${top ? `: ${top}` : ''}`, where: c.slice(0, 2).map(i => `${nm(i)} ${Math.ceil(DB.D.mt[i])} models`).join(' · '),
          why: `${o && o.mbdT ? `Model target ${f1(o.mbdT)} per dealer · ` : ''}${plural(c.length, 'dealer')} yet to order this month` }; }
      // each dealer spelled out: “S K Traders: add 6 models (RIDE ON, BOOMER)” — the number is how many more models that dealer needs to reach the model target
      const one = a => { const s = a.rs.find(r => r.k === 'mbd'), g = +String((/Add ([\d,]+)/.exec(s.a) || [])[1] || '0').replace(/,/g, ''), m = ((s.a.split(': ')[1]) || '').split(', ').filter(Boolean).slice(0, Math.max(1, Math.min(2, g))).join(', ');
        return `${nm(a.i)}: add ${plural(g, 'model')}${m ? ` (${m})` : ''}`; };
      return { what: `Add more models at ${plural(Math.min(2, l.length), 'dealer')}`, where: l.slice(0, 2).map(one).join(' · '),
        why: `${o && o.mbdT ? `Models per dealer ${o.mbdA == null ? '–' : f1(o.mbdA)} vs ${f1(o.mbdT)} target · ` : ''}${plural(l.length, 'dealer')} below their model target` }; }
    case 'prem': return { what: `Sell ${fN(ceilPos(.06 * p.r.totQ - p.r.premQ))} more premium units`, where: pickD('prem', 3), why: `Premium share ${fP1(p.r.o[9].a)} vs 6% target` };
    case 'od': { const od = p.r.idx.filter(i => DB.D.s[i] === 'A' && DB.D.od[i] > 0).sort((a, b) => (route.has(b) - route.has(a)) || DB.D.od[b] - DB.D.od[a]);
      return { what: `Collect overdue ${inr(od.reduce((s, i) => s + DB.D.od[i], 0))}`, where: od.slice(0, 3).map(i => `${nm(i)} ${inr(DB.D.od[i])}`).join(' · '), why: `${plural(od.length, 'dealer')} overdue above ₹10k` }; }
    case 'pjp': {
      if (isA) { const t = teamFieldOf(pl.name, p.day), noPlan = /No record/.test(it.evidence);
        return { what: noPlan ? 'Get every SE’s journey plan uploaded' : 'Push the team to complete planned visits', where: it.evidence.replace(/\s*\(Journey Plan.*$/, '').slice(0, 110),
          why: t ? `Team visits ${fN(t.done)} of ${fN(t.plan)} planned (${fP(t.pct)}) · ${fN(t.adhoc)} ad-hoc` : 'Visits must be planned and logged daily' }; }
      const f = fieldOf('SE', pl.name, p.day), miss = f ? [...new Map(f.missed.map(r => [r[1], r])).values()].slice(0, 3).map(r => r[2]) : [];
      return { what: jp ? `Complete all ${plural(jp.n, 'planned visit')} ${T}` : f && f.plan ? `Add ${T}'s visits to the PJP — none planned` : 'Upload your journey plan and log every visit',
        where: miss.length ? `Also revisit missed: ${miss.join(', ')}` : jp && jp.route ? 'Route: ' + jp.route : '',
        why: f && f.plan ? `Visits ${fN(f.done)} of ${fN(f.plan)} planned (${fP(f.pct)}) · ${fN(f.adhoc)} ad-hoc` : pl.pjp ? `Visits done ${fN(pl.pjp.a)} of ${fN(pl.pjp.p)} planned this month` : 'No journey plan on record' };
    }
    case 'vis': {   // market visits: today's planned visits, missed dealers, planned vs actual
      const f = fieldOf(pl.level, pl.name, p.day), miss = f ? [...new Map(f.missed.map(r => [r[1], r])).values()].slice(0, 3).map(r => r[2]) : [];
      return { what: jp ? `Visit all ${plural(jp.n, 'planned dealer')} ${T}` : `Plan ${T}'s visits in the PJP — none planned`,
        where: miss.length ? `Also revisit missed: ${miss.join(', ')}` : jp && jp.route ? `Route: ${jp.route}` : 'Check in and out at every dealer',
        why: `Visits ${fN(f.done)}/${fN(f.plan)} planned (${f.pct == null ? '–' : fP(f.pct)}) · Normal ${fN(f.done)} · Ad-hoc ${fN(f.adhoc)}` };
    }
    case 'pend': { const pe = pendOf(pl.level, pl.name);
      if (pe.src === 'cycle') return { what: `Get ${fN(pe.units)} pending order units dispatched`, where: pe.list.slice(0, 3).map(x => `${nm(x.i)} ${fN(x.bal)} (${x.st})`).join(' · '),
        why: `${fN(pe.wait)} awaiting dispatch · ${fN(pe.disp)} invoice pending · ${fN(pe.rej)} rejected` };
      return { what: `Get ${fN(pe.units)} pending order units dispatched`, where: 'Call the depot: dispatch dates, stock and dealer credit', why: `Open orders CM+LM${pe.cancel ? ` · ${fN(pe.cancel)} cancelled this month` : ''}` }; }
    case 'cov': { const f = fieldOf('SE', pl.name, p.day), on = it.best.filter(i => route.has(i)), list = (on.length ? on : it.best).slice(0, 3).map(nm), k = it.action.match(/Add ([\d,]+)/)[1];
      return { what: `Add ${k} new dealer${k === '1' ? '' : 's'} to ${T}'s route`, where: `Not visited this month: ${list.join(', ')}`, why: `${fN(f.cov.a)} of ${fN(f.cov.t)} dealers visited this month` }; }
    case 'hrs': { const f = fieldOf(pl.level, pl.name, p.day), att = f.att || {}, ok = f.span >= CFG.minField * 60;
      const top = f.top && f.top[0];
      return { what: `${ok ? 'Keep' : 'Do'} ${CFG.minField}+ hrs in market, start by ${CFG.startBy}`,
        where: `Avg check-in ${hhmm(f.firstIn)}${top && top.c > 1 ? ` · most visited: ${top.n} (${top.c})` : ''}`,
        why: `Avg ${hrs(f.span)}/day${att.P ? ` · checked in ${f.days} of ${att.P} days present` : ''} · check in and out at every dealer` }; }
    case 'mom': { const m = momentum(p); return { what: 'Call your ASM: find why sales dropped', where: 'Check stock rejections, dispatch and dealer demand', why: m ? `Last 7 days ${fN(m.l7)} units vs ${fN(m.p7)} the week before` : it.issue }; }
    case 'rse': { const u = (pl.team || []).filter(x => (x.p.status === 'behind' || x.p.status === 'crit') && !/^(vacant|tba)\b/i.test(x.name)).sort((x, y) => (y.p.gap || 0) - (x.p.gap || 0)).slice(0, 3);
      if (!u.length) return { what: 'Plan cover for the vacant territories', where: 'Assign their dealers’ visits to nearby SEs', why: it.issue };
      const vis = x => { const f = fieldOf('SE', x.name, p.day); return f && f.pct != null ? fP(f.pct) : 'no PJP'; };
      return { what: `Joint work / review call with ${u.map(x => x.name.split(' ')[0]).join(', ')}`, where: 'Visits done: ' + u.map(x => `${x.name.split(' ')[0]} ${vis(x)}`).join(' · '), why: `${it.issue} · check their PJP and missed dealers` }; }
    case 'ord': return { what: 'Chase open orders with the depot', where: 'Offer in-stock alternates for rejected lines', why: it.issue };
    case 'carry': return { what: `Close ${it.issue.replace(' from earlier plans', '')}`, where: 'Action Tracking: update each one’s status', why: it.evidence.replace(/\s*\(Action tracking\)\.?/, '') };
    case 'keep': return { what: isA ? 'Recognise the SEs on pace' : 'Keep your visit and order rhythm', where: isA ? it.evidence.replace(/\.$/, '') : '', why: 'Share what works with the team' };
  }
  return { what: briefOf(it, pl), where: '', why: it.issue };
}
function headline(pl) {
  const p = pl.p, r = p.r, o = p.official, bp = bpOf(p);
  const team = pl.level === 'ASM' && pl.team ? `SEs on track ${pl.team.filter(x => (x.p ? x.p.status : x.x && x.x.p.status) === 'ok').length}/${pl.team.length}` : null;
  if (o) {   // workbook dashboard figures: orders vs target, order-based balance and run rates
    const daily = pl.type === 'daily', nt = pl.type === 'weekly' && pl.ctx ? nextWeekTarget(p, pl.wk, pl.ctx) : null;
    return { pace: p.pace, ring: o.orderPct, ringLbl: 'ordered', status: p.status, score: r.comp == null ? null : Math.round(r.comp * 100), official: o,
      tiles: daily ? [['Target', fN(o.target)], ['Ordered', fN(o.orderAch)], ['Balance', fN(Math.max(0, o.balance))], ['Need / day', fN(o.balance > 0 ? Math.ceil(o.reqRR) : 0)]]
        : [['Target', fN(o.target)], ['Ordered', fN(o.orderAch)], ['Balance', fN(Math.max(0, o.balance))], ['This week', nt ? fN(Math.ceil(nt.t)) : '–']],
      chips: [`Run rate ${fN(o.curRR)}/day`, o.mbdT ? `MBD ${f1(o.mbdA)}/${f1(o.mbdT)}` : null, pl.pjp && !fieldOf(pl.level, pl.name, p.day) ? `DJP ${fN(pl.pjp.a)}/${fN(pl.pjp.p)}` : null].filter(Boolean) };
  }
  return { pace: p.pace, ring: p.pace, ringLbl: 'of pace', status: p.status, score: r.comp == null ? null : Math.round(r.comp * 100),
    tiles: pl.type === 'daily'
      ? [['Target', p.plan ? fN(p.plan) : '–'], ['Achieved', fN(p.mtd)], ['Gap', p.gap == null ? '–' : fN(p.gap)], ['Today’s target', p.need ? fN(Math.ceil(p.need)) : '–']]
      : [['Week target', pl.wk ? fN(pl.wk.tTo) : '–'], ['Week achieved', pl.wk ? fN(pl.wk.units) : '–'], ['Week %', pl.wk ? fP(pl.wk.pct) : '–'], ['Prev. week', pl.prev ? fP(pl.prev.pct) : '–']],
    chips: [pl.pjp ? `DJP ${fN(pl.pjp.a)}/${fN(pl.pjp.p)}` : null,
      r.o[5].has ? `NPD ${fN(r.o[5].a)}/${fN(r.o[5].t)}` : null].filter(Boolean) };
}
/* what the SE / ASM must do. Daily: 1 business insight (till date → how to improve), 2 hours in market, 3 where to add models (MBD),
   4 where to push NPD, then the remaining KPI actions. Visits, pending orders and coverage are in the tiles, not steps.
   Left off the card and messages (all stay in the tracker): the order-volume target (numbers strip), billing follow-ups,
   billing points, and the ASM's team items — a card is about one person only. */
function cardItems(pl) {
  const base = pl.items.filter(it => !/^(bill|bp|vol)$/.test(it.key.replace(/^w/, '')));
  if (pl.type !== 'daily') return base;
  if (pl._ci) return pl._ci;
  const f = fieldOf(pl.level, pl.name, pl.p.day), acts = taskCtx(pl).acts, has = k => acts.some(a => a.rs.some(r => r.k === k)), first = [];
  first.push({ key: 'ins', priority: /^(crit|behind)$/.test(pl.p.status) ? 'High' : pl.p.status === 'watch' ? 'Medium' : 'Low', issue: 'Business insight' });
  // display contest (market activity): audits behind plan, or SE not trained yet, is urgent inside the round window
  const k = contestOf(pl.level, pl.name, pl.p.day);
  if (k) first.push({ key: 'dsp', priority: k.left && (k.trained === 0 || k.trained === null || k.perDay >= 2) ? 'High' : k.left ? 'Medium' : 'Low', issue: 'Display contest' });
  if (f && f.days && f.span != null) first.push({ key: 'hrs', priority: f.span < (CFG.minField - 2) * 60 ? 'High' : f.span < CFG.minField * 60 ? 'Medium' : 'Low', issue: 'Hours in market' });
  // MBD and NPD: billed dealers below target, or — when dealers have not ordered yet this month — their first orders
  if (has('mbd') || has('bp')) first.push(base.find(x => x.key === 'mbd') || { key: 'mbd', priority: 'Medium', issue: 'Range (MBD)' });
  if (has('npd') || has('bp')) first.push(base.find(x => x.key === 'npd') || { key: 'npd', priority: 'Medium', issue: 'NPD placement' });
  const rest = base.filter(x => !/^(hrs|pend|cov|pjp|rse|keep|carry|mbd|npd|ord)$/.test(x.key));
  return (pl._ci = first.concat(rest));
}
function captionOf(pl) {
  const h = headline(pl), o = h.official, top = cardItems(pl).slice(0, 5), num = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
  const nums = o
    ? [`📊 Target ${fN(o.target)} · Ordered ${fN(o.orderAch)} (${fP(o.orderPct)})`,
       o.balance > 0 ? `🎯 Balance ${fN(o.balance)} · Need ${fN(Math.ceil(o.reqRR))}/day for ${plural(o.daysLeft, 'day')} · Now ${fN(o.curRR)}/day` : `✅ Target covered by orders · Now ${fN(o.curRR)}/day`]
    : [`📊 Pace ${fP(h.pace)} · ${h.tiles.map(t => `${t[0]} ${t[1]}`).slice(1, 4).join(' · ')}`];
  const jp = pl.type === 'daily' ? pjpToday(pl.level, pl.name, pl.period) : null;
  const route = jp ? [`🗺️ Today's PJP (${jp.n})${jp.rows.length ? ': ' + jp.rows.slice(0, 6).map(r => r.t.split(',')[0]).join(', ') + (jp.rows.length > 6 ? '…' : '') : ''}`] : [];
  const tl = Object.fromEntries((fieldTiles(pl) || []).map(t => [t[0], t])), mv = tl['MARKET VISITS'], wh = tl['WORKING HOURS'], dc = tl['DISPLAY CONTEST'];
  const fl = [mv ? `🚶 Market visits ${mv[1]} (${mv[2]})${wh ? ` · ⏱️ Working hours ${wh[1]}` : ''}` : null, dc ? `🏆 Display contest ${dc[1]} ${dc[2]}` : null].filter(Boolean)
    .concat(fieldLines(pl).map(([k, v]) => `${{ TODAY: '📍 Today', COVERAGE: '📍 Coverage', HOURS: '⏱️ Hours', TEAM: '👥 Team' }[k] || k}: ${v}`));
  return [`*${pl.name} · ${pl.type === 'daily' ? 'Daily' : 'Weekly'} plan · ${SHORT_DATE(pl.periodLabel)}*`, ...nums, ...fl, ...top.map((x, i) => { const t = taskOf(x, pl); return `${num[i]} *${t.what}*${t.where ? '\n     ' + (x.key === 'mbd' ? t.where.split(' · ').join('\n     ') : t.where) : ''}`; })].join('\n');
}
function journeyLines(pl) {
  const jp = pl.type === 'daily' ? pjpToday(pl.level, pl.name, pl.period) : null; if (!jp) return [];
  return ['', `Today's journey plan (${plural(jp.n, 'visit')}${jp.route ? ' · ' + jp.route : ''}):`, ...(jp.rows.length ? jp.rows.map(r => `• ${r.t}${r.s ? ' — ' + r.s : ''}`) : [`• ${plural(jp.n, 'dealer visit')} planned`])];
}
function mailOf(pl) {
  const h = headline(pl), o = h.official;
  const subject = `${pl.type === 'daily' ? 'Daily' : 'Weekly'} action plan – ${pl.name} – ${SHORT_DATE(pl.periodLabel)}`;
  const figs = o ? [`• Target: ${fN(o.target)}`, `• Ordered MTD: ${fN(o.orderAch)} (${fP(o.orderPct)})`,
      `• Balance (on orders): ${fN(Math.max(0, o.balance))}`, `• Required run rate: ${fN(o.balance > 0 ? Math.ceil(o.reqRR) : 0)}/day for ${plural(o.daysLeft, 'day')} · current ${fN(o.curRR)}/day`]
    : [...h.tiles.map(t => `• ${t[0]}: ${t[1]}`), `• Vs pace: ${fP(h.pace)} (${PSTAT[h.status].l})`];
  const how = pl.type === 'daily' && o ? ['', 'How these are calculated:', ...calcSteps(pl.p).slice(1, 7).filter(s => !/^Billed/.test(s[0])).map(s => `• ${s[0]}: ${s[1]} = ${s[2]}`)] : [];
  const ft = fieldTiles(pl), fl = fieldLines(pl), pe = pendOf(pl.level, pl.name);
  const tl = Object.fromEntries((ft || []).map(t => [t[0], t])), mv = tl['MARKET VISITS'], wh = tl['WORKING HOURS'], dc = tl['DISPLAY CONTEST'];
  const field = ft ? ['', 'Field work & market activity (month to date):', ...(mv ? [`• Market visits, planned vs actual: ${mv[1]} (${mv[2]})`] : []), ...(wh ? [`• Working hours: ${wh[1]}`] : []),
    ...(dc ? [`• Display contest audits, planned vs done: ${dc[1]} (${dc[2]})`] : []),
    ...fl.map(([k, v]) => `• ${{ TODAY: 'Today', COVERAGE: 'Coverage', HOURS: 'Hours in market', TEAM: 'Team' }[k] || k}: ${v}`)] : [];
  const body = [`Hi ${pl.name.split(' ')[0]},`, '', `Your ${pl.type} plan for ${pl.periodLabel} (data to ${pl.dataTo}):`, '', ...figs, ...field, ...how, '', 'Priority actions:',
    ...cardItems(pl).slice(0, 5).flatMap((x, i) => { const t = taskOf(x, pl); return [`${i + 1}. [${x.priority}] ${t.what}`, t.where ? `   ${t.where}` : null, t.why ? `   Why: ${t.why}` : null].filter(Boolean); }), '', 'Please update the status by day end.', '', '— 16-Point KPI Tracker · Heroes in Action'].join('\n');
  return { subject, body };
}

/* ---------- 9:16 card (v2: compact numbers, detailed actions) ---------- */
const CARD_W = 1080, CARD_H = 1920;
const CC = { good: '#22c55e', warn: '#f59e0b', serious: '#fb923c', crit: '#f43f5e', nd: '#94a3b8' };
async function fontsReady() { try { await Promise.all(['700 60px "Space Grotesk"', '700 32px "Plus Jakarta Sans"', '500 28px "Plus Jakarta Sans"'].map(f => document.fonts.load(f))); } catch (e) {} }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function wrap(ctx, text, maxW) { const words = String(text).split(' '), lines = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; }
function clip(ctx, lines, n, maxW) { if (lines.length <= n) return lines; const out = lines.slice(0, n); let l = out[n - 1]; while (l && ctx.measureText(l + '…').width > maxW) l = l.replace(/\s*\S+$/, ''); out[n - 1] = l + '…'; return out; }
/* the full action, cleaned for reading on a phone: names kept, dealer codes and repeated dates removed */
function detailOf(it) {
  let s = String(it.action || '').replace(/\s*\(#\d+\)/g, '').replace(/ on (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+ \d{4}/g, '')
    .replace(/ — best candidates \(bought in Jul–Sep or plan\)/, '').replace(/\s+/g, ' ').trim();
  return s;
}
async function drawCard(pl) {
  await fontsReady();
  const cv = document.createElement('canvas'); cv.width = CARD_W; cv.height = CARD_H; const c = cv.getContext('2d');
  const h = headline(pl), sc = CC[PSTAT[h.status].k], D = '"Space Grotesk", "Segoe UI", sans-serif', B = '"Plus Jakarta Sans", "Segoe UI", sans-serif';
  const bg = c.createLinearGradient(0, 0, CARD_W, CARD_H); bg.addColorStop(0, '#0b1030'); bg.addColorStop(.5, '#1e1b5c'); bg.addColorStop(1, '#3b0f5c'); c.fillStyle = bg; c.fillRect(0, 0, CARD_W, CARD_H);
  const glow = (x, y, r, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
  glow(1000, 40, 420, 'rgba(14,165,233,.38)'); glow(40, 420, 380, 'rgba(236,72,153,.22)');
  // header
  c.fillStyle = '#7dd3fc'; c.font = `700 25px ${B}`;
  c.fillText(`${pl.type === 'daily' ? 'DAILY' : 'WEEKLY'} ACTION PLAN  ·  ${pl.type === 'daily' ? 'FOR' : 'WEEK'} ${SHORT_DATE(pl.periodLabel).toUpperCase()}  ·  DATA TO ${String(pl.dataTo).toUpperCase()}`, 60, 78);
  c.fillStyle = '#fff'; c.font = `700 60px ${D}`; while (c.measureText(pl.name).width > 700) c.font = c.font.replace(/\d+px/, m => (parseInt(m) - 3) + 'px'); c.fillText(pl.name, 60, 150);
  c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `500 27px ${B}`; c.fillText(`${pl.level} · ${pl.zone} zone${pl.level === 'SE' && pl.asm ? ' · ASM ' + pl.asm : ''}`, 60, 196);
  c.font = `800 28px ${B}`; const st = PSTAT[h.status].l.toUpperCase(), sw = c.measureText(st).width + 48;
  rr(c, CARD_W - 60 - sw, 106, sw, 56, 28); c.fillStyle = sc; c.fill(); c.fillStyle = '#0b1030'; c.fillText(st, CARD_W - 60 - sw + 24, 144);
  // compact numbers strip
  const py = 226, ph = 196; rr(c, 40, py, CARD_W - 80, ph, 26); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill();
  const cx = 138, cy = py + ph / 2, R = 64, p = Math.max(0, Math.min(1, h.ring || 0));
  c.lineWidth = 16; c.lineCap = 'round'; c.strokeStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = sc; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); c.stroke();
  c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = `700 38px ${D}`; c.fillText(h.ring == null ? '–' : Math.round(h.ring * 100) + '%', cx, cy + 8);
  c.font = `600 18px ${B}`; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText(h.ringLbl, cx, cy + 34); c.textAlign = 'left';
  const colX = [240, 440, 640, 840], tcol = ['#38bdf8', '#34d399', '#fb7185', '#fbbf24'];
  h.tiles.forEach((t, i) => { const x = colX[i]; c.fillStyle = tcol[i]; c.fillRect(x, py + 34, 5, 92);
    c.fillStyle = 'rgba(255,255,255,.72)'; c.font = `600 22px ${B}`; c.fillText(t[0], x + 18, py + 62); c.fillStyle = '#fff'; c.font = `700 44px ${D}`; c.fillText(t[1], x + 18, py + 116); });
  c.fillStyle = '#ddd6fe'; c.font = `600 22px ${B}`;
  { const parts = [h.score == null ? null : `Score ${h.score}/100`, ...h.chips, pl.trend ? `Trend: ${pl.trend.l}` : null].filter(Boolean); let line = '';
    for (const s of parts) { const t = line ? line + '  ·  ' + s : s; if (c.measureText(t).width > CARD_W - 60 - 240) break; line = t; }   // keep to one line inside the panel
    c.fillText(line, 240, py + 168); }
  // field & orders: 4 tiles (market visits planned vs actual, normal, ad-hoc, pending orders) + short lines (today, coverage, hours, team)
  const ft = fieldTiles(pl), fl = ft ? fieldLines(pl) : [], fy = py + ph + 16, th = ft ? 132 : 0, fh = ft ? th + (fl.length ? 8 + fl.length * 38 : 0) + 8 : 0;
  if (ft) {
    rr(c, 40, fy, CARD_W - 80, fh, 24); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill();
    const tw = (CARD_W - 120) / ft.length;
    ft.forEach(([lab, val, sub, col, bar], i) => { const x = 60 + i * tw;
      if (i) { c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(x - 2, fy + 22, 2, th - 40); }
      c.fillStyle = col; c.fillRect(x + 12, fy + 24, 5, 30);
      c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `800 18px ${B}`; c.fillText(lab, x + 26, fy + 46);
      c.fillStyle = '#fff'; c.font = `700 42px ${D}`; c.fillText(val, x + 14, fy + 96);
      if (bar != null) { rr(c, x + 14, fy + 104, tw - 40, 6, 3); c.fillStyle = 'rgba(255,255,255,.15)'; c.fill(); rr(c, x + 14, fy + 104, Math.max(6, (tw - 40) * Math.min(1, bar)), 6, 3); c.fillStyle = col; c.fill(); }
      if (sub) { c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `600 17px ${B}`; c.fillText(clip(c, wrap(c, sub, tw - 24), 1, tw - 24)[0], x + 14, fy + (bar != null ? 131 : 122)); } });
    fl.forEach(([k, v], i) => { const yy = fy + th + 30 + i * 38;
      if (!i) { c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(64, fy + th, CARD_W - 128, 2); }
      c.fillStyle = '#7dd3fc'; c.font = `800 18px ${B}`; c.fillText(k, 70, yy);
      c.fillStyle = '#fff'; c.font = `600 22px ${B}`; c.fillText(clip(c, wrap(c, v, CARD_W - 80 - 206), 1, CARD_W - 80 - 206)[0], 206, yy); });
  }
  // actions — at most 5 steps, each one bold line (what to do) + one short line (where / how)
  const items = cardItems(pl).slice(0, 5);
  const ay = py + ph + 22 + (ft ? fh + 4 : 0), ah = CARD_H - ay - 70; rr(c, 40, ay, CARD_W - 80, ah, 30); c.fillStyle = '#fff'; c.fill();
  c.fillStyle = '#4f46e5'; c.font = `800 28px ${B}`; c.fillText(`WHAT TO DO ${pl.type === 'daily' ? 'TODAY' : 'THIS WEEK'}`, 84, ay + 58);
  c.fillStyle = '#64748b'; c.font = `600 22px ${B}`; c.textAlign = 'right'; c.fillText('priority order', CARD_W - 84, ay + 58); c.textAlign = 'left';
  const PC = { High: '#e11d48', Medium: '#d97706', Low: '#059669' }, X = 140, W = CARD_W - X - 84, bottom = ay + ah - 30;
  let y = ay + 120, shown = 0;
  for (const [i, it] of items.entries()) {
    const t = taskOf(it, pl);
    c.font = `800 32px ${B}`; const line = clip(c, wrap(c, t.what, W - 130), 1, W - 130)[0];
    // “where” line; the add-models step gets one line per dealer so every dealer name and model count is readable
    c.font = `600 26px ${B}`; const whs = !t.where ? [] : it.key === 'mbd' ? t.where.split(' · ').slice(0, 2).map(s => clip(c, wrap(c, s, W), 1, W)[0]) : [clip(c, wrap(c, t.where, W), 1, W)[0]];
    const wh = whs.length ? whs[0] : '', extra = Math.max(0, whs.length - 1) * 36;
    if (y + 41 + (wh ? 36 : 0) + extra > bottom) break;
    if (shown) { c.fillStyle = '#e2e8f0'; c.fillRect(X, y - 46, W, 2); }
    c.fillStyle = PC[it.priority] || '#4f46e5'; c.beginPath(); c.arc(98, y - 10, 24, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = `800 26px ${D}`; c.textAlign = 'center'; c.fillText(String(i + 1), 98, y - 1); c.textAlign = 'left';
    c.fillStyle = '#0e1530'; c.font = `800 32px ${B}`; c.fillText(line, X, y);
    c.font = `800 18px ${B}`; const pw = c.measureText(it.priority.toUpperCase()).width + 22; rr(c, CARD_W - 84 - pw, y - 26, pw, 32, 16); c.fillStyle = PC[it.priority] || '#4f46e5'; c.globalAlpha = .14; c.fill(); c.globalAlpha = 1;
    c.fillStyle = PC[it.priority] || '#4f46e5'; c.fillText(it.priority.toUpperCase(), CARD_W - 84 - pw + 11, y - 4);
    if (wh) { c.fillStyle = '#0f766e'; c.font = `600 26px ${B}`; whs.forEach((s, k) => c.fillText(s, X, y + 40 + k * 36)); }
    y += (wh ? 40 : 0) + extra + 96; shown++;
  }
  // spare space: the person's own dealers to focus on — never other SEs / ASMs
  if (shown === items.length && bottom - y > 140) {
    const head = 'DEALERS TO FOCUS ON';
    const rows = (pl.dealers || actionsFor(pl.p.r.idx, pl.p.day)).slice(0, 4).map(x => ({ dot: x.rs[0].k === 'bp' ? '#e11d48' : '#d97706',
      t: `${DB.D.n[x.i]}${DB.D.city[x.i] ? ', ' + DB.D.city[x.i] : ''}`, s: x.rs.slice(0, 3).map(r => r.k === 'bp' ? 'No order yet this month' : r.t).join(' · ') }));
    if (rows.length) {
      y -= 6; c.fillStyle = '#e2e8f0'; c.fillRect(84, y - 30, CARD_W - 168, 2);
      c.fillStyle = '#4f46e5'; c.font = `800 24px ${B}`; c.fillText(head, 84, y + 10); y += 52;
      for (const r of rows) {
        if (y + 56 > bottom) break;
        c.fillStyle = r.dot; c.beginPath(); c.arc(96, y - 9, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#0e1530'; c.font = `700 25px ${B}`; c.fillText(clip(c, [r.t], 1, W + 30)[0], 120, y);
        c.fillStyle = '#64748b'; c.font = `500 22px ${B}`; c.fillText(clip(c, wrap(c, r.s, W + 30), 1, W + 30)[0], 120, y + 30);
        y += 66;
      }
    }
  }
  c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `500 22px ${B}`; c.fillText('16-Point KPI Tracker · Heroes in Action · Hero Cycles', 60, CARD_H - 26);
  return cv;
}
const cardBlob = async pl => { const cv = await drawCard(pl); return new Promise(r => cv.toBlob(r, 'image/png')); };
const cardName = pl => safeFile(`${pl.level} ${pl.name} ${pl.type} plan ${SHORT_DATE(pl.periodLabel)}`) + '.png';

/* ---------- WhatsApp with the card attached ----------
   A wa.me link can only carry text. Phone: the share menu attaches the PNG (pick WhatsApp, then the person).
   Computer: the card is copied, the person's chat opens with the message typed, and a guide stays on screen
   until the card has been pasted (Ctrl+V). blobs = [{ blob, name }]. Returns false if the user cancelled. */
const isPhone = () => matchMedia('(pointer: coarse)').matches && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
async function waSend(blobs, caption, phone, who) {
  const files = blobs.map(b => new File([b.blob], b.name, { type: 'image/png' }));
  if (isPhone() && navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, text: caption }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const chat = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(caption)}` : `https://wa.me/?text=${encodeURIComponent(caption)}`;
  const copy = async () => { if (blobs.length > 1) return false; try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobs[0].blob })]); return true; } catch (e) { return false; } };
  const dl = () => blobs.forEach(b => saveBlob(b.blob, b.name));
  const copied = await copy(); if (!copied) dl();
  window.open(chat, '_blank', 'noopener');
  const g = $('#waGuide'), to = phone ? `${esc(who)} (+${esc(phone)})` : `${esc(who)} — <b>no number in Contacts</b>, choose the chat yourself`;
  $('#wgSteps').innerHTML = (copied
    ? [`WhatsApp opens the chat with ${to}, with the message already typed. If it asks, click <b>Continue to chat</b> / <b>Open WhatsApp</b>.`,
       '<b>Click in the message box and press Ctrl+V</b> — the card appears in a preview.',
       '<b>Press Enter</b> to send the card, then press Enter again to send the message.']
    : [`WhatsApp opens the chat with ${to}, with the message already typed.`,
       `The card${blobs.length > 1 ? 's were' : ' was'} <b>downloaded</b> (this browser cannot copy pictures): in the chat click <b>📎 / +</b> → <b>Photos &amp; videos</b> → pick <b>${blobs.map(b => esc(b.name)).join('</b> and <b>')}</b> from Downloads.`,
       'Press Enter to send.']).map(s => `<li>${s}</li>`).join('');
  const url = URL.createObjectURL(blobs[0].blob); $('#wgImg').src = url;
  $('#wgOpen').onclick = () => window.open(chat, '_blank', 'noopener');
  $('#wgCopy').hidden = blobs.length > 1;
  $('#wgCopy').onclick = async () => toast(await copy() ? 'Card copied — press Ctrl+V in the WhatsApp chat.' : 'This browser cannot copy pictures — use Download.');
  $('#wgDl').onclick = dl;
  $('#wgClose').onclick = () => { g.hidden = true; URL.revokeObjectURL(url); };
  g.onclick = e => { if (e.target === g) $('#wgClose').click(); };
  g.hidden = false;
  return true;
}

/* ---------- single share dialog: daily, weekly or both ---------- */
const SH = { name: '', lvl: 'SE', mode: 'daily', plans: {}, blobs: {} };
const planOf = (lvl, name, type) => type === 'daily' ? (lvl === 'ASM' ? dailyASM(name) : dailyRSE(name)) : (lvl === 'ASM' ? weeklyASM(name, ST.week || defaultWeek()) : weeklyRSE(name, ST.week || defaultWeek()));
const shTypes = () => SH.mode === 'both' ? ['daily', 'weekly'] : [SH.mode];
const shCaption = () => shTypes().map(t => captionOf(SH.plans[t])).join('\n\n');
const shFiles = () => shTypes().map(t => new File([SH.blobs[t]], cardName(SH.plans[t]), { type: 'image/png' }));
async function openShare(pl, mode) {
  SH.name = pl.name; SH.lvl = pl.level; SH.mode = mode || pl.type; SH.plans = { [pl.type]: pl }; SH.blobs = {};
  $('#shareOv').hidden = false;
  const ct = contactOf(pl.name);
  $('#shTo').innerHTML = ct ? `WhatsApp <b>${ct.phone ? '+' + esc(ct.phone) : 'no number'}</b> · Email <b>${esc(ct.email || 'no email')}</b>` : `<span style="color:var(--warn)">No contact for ${esc(pl.name)} — add them to the “Contacts” sheet. You can still pick the person in WhatsApp / Outlook.</span>`;
  await renderShare();
}
async function renderShare() {
  $$('#shMode [data-shm]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shm === SH.mode)));
  $('#shTitle').textContent = `${SH.lvl} ${SH.name} · ${SH.mode === 'both' ? 'daily + weekly' : SH.mode} plan`;
  const types = shTypes(), imgs = [$('#shImg'), $('#shImg2')];
  $('.sh-img2').hidden = types.length < 2; $('.sh-grid').classList.toggle('two', types.length > 1);
  imgs.forEach(i => { i.removeAttribute('src'); i.alt = 'Building card…'; });
  for (const t of types) { if (!SH.plans[t]) SH.plans[t] = planOf(SH.lvl, SH.name, t); if (!SH.blobs[t]) SH.blobs[t] = await cardBlob(SH.plans[t]); }
  types.forEach((t, i) => { imgs[i].src = URL.createObjectURL(SH.blobs[t]); imgs[i].alt = `${t} plan card`; });
  $('#shText').textContent = shCaption();
  $('#shWa').textContent = types.length > 1 ? 'WhatsApp — download both cards & open chat' : 'WhatsApp — copy card & open chat';
  $('#shDl').textContent = types.length > 1 ? '⬇ Download both cards' : '⬇ Download card (PNG)';
  $('#shCopy').hidden = types.length > 1;
  $('#shNative').hidden = !(navigator.canShare && navigator.canShare({ files: shFiles() }));
}
function wireShare() {
  $('#shClose').onclick = () => $('#shareOv').hidden = true;
  $('#shareOv').addEventListener('click', e => { if (e.target.id === 'shareOv') $('#shareOv').hidden = true; });
  $$('#shMode [data-shm]').forEach(b => b.onclick = () => { SH.mode = b.dataset.shm; renderShare(); });
  const dlAll = () => shTypes().forEach(t => saveBlob(SH.blobs[t], cardName(SH.plans[t])));
  $('#shDl').onclick = dlAll;
  $('#shCopy').onclick = async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': SH.blobs[SH.mode] })]); toast('Card copied — paste it into the WhatsApp chat (Ctrl+V).'); } catch (e) { toast('This browser cannot copy images — use Download.'); } };
  $('#shNative').onclick = async () => { try { await navigator.share({ files: shFiles(), text: shCaption() }); } catch (e) { if (e.name !== 'AbortError') toast('Sharing was blocked — use Download.'); } };
  $('#shWa').onclick = async () => {
    const ct = contactOf(SH.name) || {};
    if (await waSend(shTypes().map(t => ({ blob: SH.blobs[t], name: cardName(SH.plans[t]) })), shCaption(), ct.phone, SH.name)) $('#shareOv').hidden = true;
  };
  $('#shMail').onclick = () => {
    const ct = contactOf(SH.name), ms = shTypes().map(t => mailOf(SH.plans[t]));
    const subject = ms.length > 1 ? `Daily & weekly action plan – ${SH.name}` : ms[0].subject;
    dlAll(); location.href = `mailto:${encodeURIComponent(ct && ct.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(ms.map(m => m.body).join('\n\n— — —\n\n') + '\n\n(Plan card' + (ms.length > 1 ? 's' : '') + ' attached)')}`;
    toast('Email opened; the card' + (ms.length > 1 ? 's were' : ' was') + ' downloaded — attach before sending.', 6000);
  };
  $('#shTextCopy').onclick = async () => { try { await navigator.clipboard.writeText(shCaption()); toast('Text copied.'); } catch (e) { toast('Copy blocked.'); } };
  $('#bkClose').onclick = () => $('#bulkOv').hidden = true;
  $('#bulkOv').addEventListener('click', e => { if (e.target.id === 'bulkOv') $('#bulkOv').hidden = true; });
}

/* ---------- bulk ---------- */
let _jszip = null;
function loadJSZip() { if (window.JSZip) return Promise.resolve(window.JSZip); if (_jszip) return _jszip; _jszip = new Promise((res, rej) => { const s = document.createElement('script'); s.src = JSZIP_URL; s.onload = () => res(window.JSZip); s.onerror = () => { _jszip = null; rej(new Error('Zip library could not load (internet needed).')); }; document.head.appendChild(s); }); return _jszip; }
const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const b64u = txt => b64(new TextEncoder().encode(txt));
const lines76 = s => s.replace(/(.{76})/g, '$1\r\n');
async function emlOf(pls, pngs) {
  const ct = contactOf(pls[0].name), ms = pls.map(mailOf), bd = 'djp' + Math.random().toString(36).slice(2);
  const subject = pls.length > 1 ? `Daily & weekly action plan – ${pls[0].name}` : ms[0].subject, body = ms.map(m => m.body).join('\n\n— — —\n\n');
  const parts = ['To: ' + (ct && ct.email || ''), `Subject: =?UTF-8?B?${b64u(subject)}?=`, 'X-Unsent: 1', 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${bd}"`, '',
    `--${bd}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', lines76(b64u(body)), ''];
  for (const [i, pl] of pls.entries()) parts.push(`--${bd}`, `Content-Type: image/png; name="${cardName(pl)}"`, `Content-Disposition: attachment; filename="${cardName(pl)}"`, 'Content-Transfer-Encoding: base64', '', lines76(b64(await pngs[i].arrayBuffer())), '');
  parts.push(`--${bd}--`, '');
  return parts.join('\r\n');
}
/* bulk: people of the open plan module; cards = daily, weekly or both */
let BULK = [];
function openBulk(type) {
  const lvl = ST.planLvl[type]; ST.bulkType = type; ST.bulkLvl = lvl; if (!ST.bulkMode) ST.bulkMode = type;
  const plans = plansFor(type, lvl); BULK = plans;
  const withPh = plans.filter(p => (contactOf(p.name) || {}).phone).length, withEm = plans.filter(p => (contactOf(p.name) || {}).email).length;
  $('#bkTitle').textContent = `Bulk send · ${plans.length} ${lvl}s · ${scopeLbl()}`;
  $$('#bkMode [data-bkm]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.bkm === ST.bulkMode)); b.onclick = () => { ST.bulkMode = b.dataset.bkm; $$('#bkMode [data-bkm]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }; });
  $('#bkInfo').innerHTML = `${withPh} have a WhatsApp number, ${withEm} an email (Contacts sheet). WhatsApp cannot send to many people automatically: use <b>All cards (zip)</b> and send from your phone, or click <b>WhatsApp</b> on each row.`;
  $('#bkList').innerHTML = `<thead><tr><th>${lvl}</th><th>Zone</th><th>Status</th><th>WhatsApp</th><th>Email</th><th></th></tr></thead><tbody>${plans.map((pl, i) => { const c = contactOf(pl.name) || {};
    return `<tr><td><b>${esc(pl.name)}</b></td><td>${esc(pl.zone)}</td><td>${stPill(pl.p.status)}</td><td class="small">${c.phone ? '+' + esc(c.phone) : '<span class="muted">–</span>'}</td><td class="small">${esc(c.email || '–')}</td>
      <td><div class="toolbar"><button class="btn sm" data-bk="wa" data-i="${i}">WhatsApp</button><button class="btn sm" data-bk="mail" data-i="${i}">Email</button><button class="btn sm" data-bk="card" data-i="${i}">Cards</button></div></td></tr>`; }).join('')}</tbody>`;
  $$('#bkList [data-bk]').forEach(b => b.onclick = async () => { const pl = BULK[+b.dataset.i]; await openShare(pl, ST.bulkMode); if (b.dataset.bk === 'wa') $('#shWa').click(); else if (b.dataset.bk === 'mail') $('#shMail').click(); b.closest('tr').classList.add('sent'); });
  $('#bulkOv').hidden = false;
}
async function bulkZip(kind) {
  const prog = $('#bkProg'), types = ST.bulkMode === 'both' ? ['daily', 'weekly'] : [ST.bulkMode || ST.bulkType];
  try {
    const JZ = await loadJSZip(), zip = new JZ(); const caps = [];
    for (const [i, p0] of BULK.entries()) {
      prog.textContent = `Building ${i + 1} of ${BULK.length}: ${p0.name}…`; await tick();
      const pls = types.map(t => t === p0.type ? p0 : planOf(p0.level, p0.name, t)), pngs = [];
      for (const pl of pls) pngs.push(await cardBlob(pl));
      if (kind === 'cards') { pls.forEach((pl, j) => zip.file(cardName(pl), pngs[j])); const c = contactOf(p0.name) || {}; caps.push(`${p0.name}${c.phone ? ' (+' + c.phone + ')' : ''}\n${pls.map(captionOf).join('\n\n')}\n${c.phone ? 'https://wa.me/' + c.phone : ''}\n`); }
      else zip.file(safeFile(`${p0.level} ${p0.name}`) + '.eml', await emlOf(pls, pngs));
    }
    if (kind === 'cards') zip.file('_messages.txt', caps.join('\n----------------\n'));
    else zip.file('_README.txt', 'Open each .eml file (double-click): Outlook opens it as a draft with the plan card(s) attached. Check and press Send.\nPeople without an email in the Contacts sheet have an empty To: line.');
    prog.textContent = 'Zipping…'; await tick();
    const blob = await zip.generateAsync({ type: 'blob' });
    saveBlob(blob, safeFile(`${kind === 'cards' ? 'WhatsApp_cards' : 'Email_drafts'}_${types.join('+')}_${scopeLbl()}_${stamp()}`) + '.zip');
    prog.textContent = `Done: ${BULK.length} ${kind === 'cards' ? 'people’s cards' : 'email drafts'} (${types.join(' + ')}) downloaded as a zip.`;
  } catch (e) { console.error(e); prog.textContent = 'Could not build the zip: ' + (e.message || e); }
}
