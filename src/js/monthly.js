'use strict';
/* ================= monthly plan: next month's targets + last month's learnings =================
   Data: SEED.monthly (built from the “ASM wise <mon> target” / “SE wise <mon> target” sheets, see
   workbook.js). Per person: target, daily phasing → 4 weeks, per-day need; last month's report card,
   what worked, what to do better. Card = 1080×1920 PNG (same style as the daily / weekly cards).
   “Sent” is recorded in this browser when a card goes out by WhatsApp / email or is marked by hand. */

const MSENT_KEY = 'djp.msent.v1';
let MSENT = {}; try { MSENT = JSON.parse(store.get(MSENT_KEY) || '{}') || {}; } catch (e) { MSENT = {}; }
const msentId = (m, lvl, n) => `${m.ym}|${lvl}|${n}`;
function markSent(m, lvl, n, via) { MSENT[msentId(m, lvl, n)] = { at: new Date().toISOString(), via }; store.set(MSENT_KEY, JSON.stringify(MSENT)); }
function unmarkSent(m, lvl, n) { delete MSENT[msentId(m, lvl, n)]; store.set(MSENT_KEY, JSON.stringify(MSENT)); }
const sentOf = (m, lvl, n) => MSENT[msentId(m, lvl, n)] || null;
const sentLbl = s => s ? `Sent ${new Date(s.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${s.via}` : 'Not sent';

const MWK = [[1, 7], [8, 14], [15, 21], [22, 31]];
const monLong = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }); };
const monShort = ym => MON[Number(ym.slice(5, 7)) - 1];

/* one person's plan: weeks, per-day need, last month, learnings */
function monthPlan(lvl, n) {
  const M = SEED.monthly, r = (lvl === 'ASM' ? M.asm : M.se).find(x => x.n === n); if (!r) return null;
  const [y, mo] = M.ym.split('-').map(Number), dim = r.d.length, sun = d => new Date(y, mo - 1, d).getDay() === 0;
  let d = r.d, phased = d.some(v => v > 0);
  if (!phased) { const wd = d.map((_, i) => sun(i + 1) ? 0 : 1), nwd = wd.reduce((a, b) => a + b, 0); d = wd.map(w => w * r.t / nwd); }
  const weeks = MWK.map(([a, b]) => Math.round(d.slice(a - 1, Math.min(b, dim)).reduce((s, v) => s + v, 0)));
  const days = d.filter(v => v > 0).length;
  const prevName = lvl === 'ASM' ? (r.prevOf || r.n) : r.n, o = M.prev ? M.prev[lvl][prevName] || null : null;
  const p = { lvl, n, z: r.z, hq: r.hq || (o && o.hq) || '', asm: lvl === 'SE' ? r.asm : n, t: r.t, weeks, days, perDay: days ? Math.round(r.t / days) : 0, phased, o, prevOwner: lvl === 'ASM' && r.prevOf ? r.prevOf : null, m: M };
  p.team = lvl === 'ASM' ? M.se.filter(s => s.asm === n).map(s => monthPlan('SE', s.n)) : null;
  Object.assign(p, monthLearn(p));
  return p;
}
function monthLearn(p) {
  const o = p.o, t = p.t, by14 = p.weeks[0] + p.weeks[1], good = [], todo = [], lm = p.m.prev ? MON_FULL(p.m.prev.ym) : 'last month';
  const add = (s, title, text) => todo.push({ s, title, text });
  if (!o) {
    add(9, 'First month in this territory', 'Meet every active dealer in weeks 1–2 with your ASM; note stock, open orders and credit at each.');
    add(8, 'Build the PJP early', 'Fix the beat plan for the month in week 1 so every dealer is visited at least twice.');
    add(7, 'Front-load the month', `Aim for ${fN(by14)} units by the 14th (${fP(t ? by14 / t : null)} of target), not a month-end rush.`);
    add(6, 'Bill every dealer', 'Get at least one order from each active dealer — billing points count every month.');
    add(5, 'Punch clean orders', 'Check stock and dealer credit before punching, so orders turn into billing and nothing is cancelled.');
    add(4, 'Sell the full range', 'Show one premium model at every visit (aim 10%+ of billing) and add 2 missing best-sellers per dealer.');
    add(3, 'Check every Saturday', 'Compare the week’s billing with the week plan; tell your ASM the gap and the fix by Monday.');
    return { good, todo, rc: null };
  }
  const bill = o.bill || 0, order = o.order || 0, ot = o.target || 0;
  const billPct = ot ? bill / ot : null, ordPct = ot ? order / ot : null, conv = order ? bill / order : null, cs = order && o.cancel != null ? o.cancel / order : null;
  const bp = o.bpT ? o.bpA / o.bpT : null, mbd = o.mbdT ? o.mbdA / o.mbdT : null, prem = o.prem, last10 = o.last10;
  const under = p.prevOwner ? ` (under ${p.prevOwner})` : '';
  if (billPct != null && billPct >= 1) good.push([billPct, `Billed ${fP(billPct)} of the ${lm} target${under} — target crossed.`]);
  else if (ordPct != null && ordPct >= 1) good.push([ordPct, `Orders reached ${fP(ordPct)} of target (${fN(order)} units) — booking was strong.`]);
  if (conv != null && conv >= .95) good.push([conv, `${fP(conv)} of orders turned into billing — clean order flow.`]);
  if (bp != null && bp >= 1) good.push([bp + .1, `All ${fN(o.bpT)} billing points billed — full dealer coverage.`]);
  else if (bp != null && bp >= .95) good.push([bp, `${fN(o.bpA)} of ${fN(o.bpT)} billing points billed — near-full coverage.`]);
  if (prem != null && prem >= .15) good.push([prem * 5, `Premium mix at ${fP(prem)} of billing — keep pitching premium.`]);
  if (mbd != null && mbd >= 1) good.push([mbd, `Range target met: ${f1(o.mbdA)} models per dealer.`]);
  if (p.lvl === 'ASM' && o.lyBill) { const g = bill / o.lyBill - 1; if (g >= .05) good.push([1 + g, `Billing ${fP(g)} above the same month last year (${fN(o.lyBill)}).`]); }
  if (cs != null && cs < .05) good.push([.9, `Very few cancellations (${fN(o.cancel)} units).`]);
  if (!good.length && ordPct) good.push([0, `Booked ${fN(order)} units (${fP(ordPct)} of target) — build on the dealers who ordered.`]);
  if (conv != null && conv < .92 && order - bill > 50) add((1 - conv) * 100, 'Turn orders into billing', `Only ${fP(conv)} of ${lm} orders were billed (${fN(order - bill)} units short). Review open orders (${fN(o.open)}) with the depot every 2 days; clear stock and credit holds early.`);
  if (cs != null && cs > .08) add(cs * 100, 'Cut cancellations', `${fN(o.cancel)} units were cancelled in ${lm} (${fP(cs)} of orders). Check stock and dealer credit before punching; no duplicate or speculative orders.`);
  if (billPct != null && billPct < .8) add((1 - billPct) * 80, 'Close the billing gap', `${lm} closed at ${fP(billPct)} of target on billing (${fN(ot - bill)} units short). Track the weekly checkpoints — not just the month-end total.`);
  if (last10 != null && last10 > .4) add((last10 - .3) * 100, 'Start the month faster', `${fP(last10)} of ${lm} billing came in the last 10 days. Get ${fN(by14)} units by the 14th (${fP(t ? by14 / t : null)} of target).`);
  if (bp != null && bp < .9) add((1 - bp) * 80, 'Bill more dealers', `${fN(o.bpA)} of ${fN(o.bpT)} billing points billed (${fP(bp)}). Get at least one order from the ${fN(o.bpT - o.bpA)} dealers left out.`);
  if (prem != null && prem < .10) add((.1 - prem) * 200, 'Lift the premium mix', `Premium was only ${fP(prem)} of billing. Show one premium model at every dealer visit; aim for 10%+.`);
  if (mbd != null && mbd < .8) add((1 - mbd) * 60, 'Widen the range per dealer', `${f1(o.mbdA)} models per dealer vs ${f1(o.mbdT)} target (${fP(mbd)}). Add 2 missing best-sellers at each low-range dealer.`);
  if (bill && t / bill - 1 > .3) add((t / bill - 1) * 40, 'Plan for a bigger month', `The ${MON_FULL(p.m.ym)} target is ${fP(t / bill - 1)} above ${lm} billing (${fN(bill)}). That is ${fN(p.perDay)}/day vs ${fN(bill / 26)}/day billed in ${lm} — build the order pipeline in week 1.`);
  if (p.lvl === 'ASM' && o.lyBill && bill / o.lyBill - 1 < -.05) { const g = bill / o.lyBill - 1; add(-g * 60, 'Recover vs last year', `${lm} billing was ${fP(-g)} below last year (${fN(bill)} vs ${fN(o.lyBill)}). Find the dealers who bought last year and not this year.`); }
  if (bill > t) add(25, 'Stretch beyond the target', `You billed ${fN(bill)} in ${lm}; the ${MON_FULL(p.m.ym)} target is ${fN(t)}. Aim to match ${lm}, not just the target.`);
  if (last10 != null && last10 > .3 && last10 <= .4) add(8, 'Keep the month even', `${fP(last10)} of ${lm} billing came in the last 10 days. Hold each week to the plan.`);
  add(4, 'Check every Saturday', `Compare the week’s billing with the week plan; tell your ${p.lvl === 'ASM' ? 'team' : 'ASM'} the gap and the fix by Monday.`);
  good.sort((a, b) => b[0] - a[0]); todo.sort((a, b) => b.s - a.s);
  const band = (v, g, w) => v == null ? 'nd' : v >= g ? 'good' : v >= w ? 'warn' : 'crit';
  const rc = [['Billed', fP(billPct), `${fN(bill)} units`, band(billPct, 1, .8)], ['Ordered', fP(ordPct), `${fN(order)} units`, band(ordPct, 1, .85)],
    ['Order → bill', fP(conv), 'of orders billed', band(conv, .92, .85)], ['Cancelled', fN(o.cancel), `${fP(cs)} of orders`, band(cs == null ? null : 1 - cs, .92, .85)],
    ['Billing points', o.bpT ? `${fN(o.bpA)}/${fN(o.bpT)}` : '–', fP(bp), band(bp, 1, .9)], ['Premium', fP(prem), 'of billing', band(prem, .12, .08)],
    ['Models / dealer', o.mbdT ? f1(o.mbdA) : '–', o.mbdT ? `vs ${f1(o.mbdT)} target` : '', band(mbd, 1, .8)], ['Last 10 days', fP(last10), 'of month billing', band(last10 == null ? null : 1 - last10, .7, .6)]];
  return { good: good.slice(0, 2).map(g => g[1]), todo, rc };
}
const MON_FULL = ym => monLong(ym).replace(/ \d{4}$/, '');

/* rows in the current Zone / ASM / SE filter */
function monthRows(lvl) {
  const M = SEED.monthly; if (!M) return [];
  return (lvl === 'ASM' ? M.asm : M.se).filter(r => (!ST.zone || r.z === ST.zone) && (!ST.asm || (lvl === 'ASM' ? r.n === ST.asm : r.asm === ST.asm)) && (!ST.se || (lvl === 'SE' ? r.n === ST.se : r.n === ST.asm)))
    .map(r => monthPlan(lvl, r.n)).filter(Boolean);
}

/* ---------- view ---------- */
const MST = { lvl: 'SE', sel: { ASM: '', SE: '' }, urls: {} };
function renderMonthly() {
  const M = SEED.monthly, el = $('#mBody');
  if ((SEED.meta.user || {}).role === 'SE') MST.lvl = 'SE';
  if (!M) {
    $('#mHead').innerHTML = '<b>No monthly plan in the data yet.</b>';
    el.innerHTML = `<div class="card"><div class="card-b prose"><p>Add two sheets to the master workbook and upload it again:</p><ul><li><b>ASM wise &lt;mon&gt; target</b> — Zone, ASM HQ, ASM Code, ASM Name, Target-&lt;Mon&gt;, then one column per date of the month (daily phasing).</li><li><b>SE wise &lt;mon&gt; target</b> — Zone, SE Code, SE Name, Target-&lt;Mon&gt;, then one column per date.</li></ul><p class="small muted">Upload the workbook while it still holds the month that just ended: its Dashboard SE / ASM become “last month” for the learnings. The learnings are kept when you later upload the new month’s data.</p></div></div>`;
    return;
  }
  const lvl = MST.lvl, rows = monthRows(lvl).sort((a, b) => b.t - a.t), all = monthRows('ASM').concat(monthRows('SE'));
  const nSent = all.filter(p => sentOf(M, p.lvl, p.n)).length;
  $$('[data-mlvl]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mlvl === lvl)));
  const tot = rows.reduce((s, p) => s + p.t, 0);
  $('#mHead').innerHTML = `<b>${esc(M.label)} plan</b> · ${plural(rows.length, lvl === 'ASM' ? 'ASM' : 'SE')} in ${esc(scopeLbl())} · target ${fN(tot)} units`
    + `<br><span class="muted small">${M.prev ? `Learnings from ${esc(monLong(M.prev.ym))} (data to ${esc(M.prev.asOf)})` : 'No last-month results saved — upload the workbook of the month that just ended (with these target sheets) to add learnings.'} · From ${esc(M.sheets.join(' + ') || 'saved plan')} · <b>${nSent} of ${all.length}</b> sent (this browser)</span>`;
  const sel = rows.some(p => p.n === MST.sel[lvl]) ? MST.sel[lvl] : (rows[0] || {}).n; MST.sel[lvl] = sel;
  $('#mList').innerHTML = rows.map(p => { const s = sentOf(M, lvl, p.n), bp = p.o && p.o.target ? p.o.bill / p.o.target : null;
    return `<button type="button" class="pcard${p.n === sel ? ' on' : ''}" data-mn="${esc(p.n)}"><span class="pc-t"><b>${esc(p.n)}</b><span class="num"><b>${fN(p.t)}</b></span></span><span class="small muted">${esc(p.z)}${lvl === 'SE' && p.asm ? ' · ' + esc(p.asm) : ''} · ${p.o ? `${monShort(M.prev.ym)} billed ${fP(bp)}` : 'new / no history'}</span><span class="pc-t small"><span>${p.todo.length} learnings</span>${s ? pillH('good', '✓ Sent') : pillH('nd', 'Not sent')}</span></button>`; }).join('') || '<p class="muted">Nobody in this scope.</p>';
  $$('#mList [data-mn]').forEach(b => b.onclick = () => { MST.sel[lvl] = b.dataset.mn; renderMonthly(); });
  const p = rows.find(x => x.n === sel);
  $('#mDetail').innerHTML = p ? monthDetailHTML(p) : '';
  if (p) wireMonthDetail(p);
}
function monthDetailHTML(p) {
  const M = p.m, s = sentOf(M, p.lvl, p.n), o = p.o, lm = M.prev ? monLong(M.prev.ym) : 'Last month';
  const wk = p.weeks.map((v, i) => `<div class="mwk"><span class="small muted">W${i + 1} · ${MWK[i][0]}–${i === 3 ? (M.se[0] || M.asm[0]).d.length : MWK[i][1]}</span><b class="num">${fN(v)}</b><span class="small muted">by end ${fP(p.t ? p.weeks.slice(0, i + 1).reduce((a, b) => a + b, 0) / p.t : null)}</span></div>`).join('');
  const rc = p.rc ? `<div class="eyebrow" style="margin-top:4px">${esc(lm)} report card${p.prevOwner ? ` · territory under ${esc(p.prevOwner)}` : ''}</div><div class="mrc">${p.rc.map(x => `<div class="mrc-i mrc-${x[3]}"><span class="small muted">${x[0]}</span><b class="num">${esc(x[1])}</b><span class="small muted">${esc(x[2])}</span></div>`).join('')}</div>` : '<p class="hint">New in this role — no last-month results. The plan below is a getting-started checklist.</p>';
  const good = p.good.length ? `<div class="eyebrow" style="color:var(--ok)">What worked</div><ul class="mlist">${p.good.map(g => `<li>✔ ${esc(g)}</li>`).join('')}</ul>` : '';
  const todo = `<div class="eyebrow" style="color:var(--crit)">${o ? 'Learnings → what to do better' : 'How to start the month'}</div><ol class="mlist">${p.todo.map(x => `<li><b>${esc(x.title)}</b><br><span class="small">${esc(x.text)}</span></li>`).join('')}</ol>`;
  const team = p.team && p.team.length ? `<div class="eyebrow">Team ${esc(M.label)} targets</div><div class="tbl-wrap"><table><thead><tr><th>SE</th><th class="r">Target</th><th class="r">W1</th><th class="r">W2</th><th class="r">W3</th><th class="r">W4</th><th class="c">${monShort((M.prev || M).ym)} billed</th><th>Sent</th></tr></thead><tbody>${p.team.map(t => `<tr><td><b>${esc(t.n)}</b></td><td class="r num">${fN(t.t)}</td>${t.weeks.map(v => `<td class="r num">${fN(v)}</td>`).join('')}<td class="c">${t.o && t.o.target ? heatP(t.o.bill / t.o.target) : '–'}</td><td class="small">${sentOf(M, 'SE', t.n) ? '✓' : '–'}</td></tr>`).join('')}</tbody></table></div>` : '';
  const ct = contactOf(p.n);
  return `<div class="pd-h"><div><div class="eyebrow">${p.lvl} monthly plan · ${esc(M.label)} · ${esc(p.z)} zone${p.hq ? ' · ' + esc(p.hq) : ''}${p.lvl === 'SE' && p.asm ? ' · ASM ' + esc(p.asm) : ''}</div><h2>${esc(p.n)}</h2>
      <div class="toolbar"><span class="tag">Target ${fN(p.t)}</span><span class="tag">${fN(p.perDay)}/day · ${p.days} billing days</span>${o ? `<span class="tag">${monShort(M.prev.ym)} billed ${fN(o.bill)} of ${fN(o.target)}</span>` : '<span class="tag">New this month</span>'}${pillH(s ? 'good' : 'nd', sentLbl(s))}</div></div>
      <div class="toolbar"><button class="btn sm wa" data-md="wa">WhatsApp card</button><button class="btn sm mail" data-md="mail">Email</button><button class="btn sm" data-md="dl">⬇ Card</button><button class="btn sm" data-md="copy">Copy text</button><button class="btn sm" data-md="mark">${s ? 'Mark not sent' : 'Mark as sent'}</button></div></div>
    <p class="small muted" style="margin:0">To: ${ct ? `WhatsApp <b>${ct.phone ? '+' + esc(ct.phone) : 'no number'}</b> · Email <b>${esc(ct.email || 'no email')}</b>` : `<span style="color:var(--warn)">no contact for ${esc(p.n)} in the Contacts sheet</span>`}</p>
    <div class="mgrid"><div class="mcol">
      <div class="eyebrow">Week-by-week plan ${p.phased ? '(from the target sheet)' : '(even split Mon–Sat — no daily phasing given)'}</div><div class="mwks">${wk}</div>
      ${rc}${good}${todo}${team}
    </div><div class="mcard"><img id="mImg" alt="Monthly plan card"><span class="small muted" id="mImgNote">Building card…</span></div></div>`;
}
async function wireMonthDetail(p) {
  const blob = await monthCardBlob(p), url = URL.createObjectURL(blob), img = $('#mImg');
  if (MST.urls.cur) URL.revokeObjectURL(MST.urls.cur); MST.urls.cur = url;
  if (img) { img.src = url; $('#mImgNote').textContent = 'This is the card that is sent.'; }
  const name = monthCardName(p), cap = monthCaption(p), ct = contactOf(p.n) || {}, done = via => { markSent(p.m, p.lvl, p.n, via); renderMonthly(); };
  $$('#mDetail [data-md]').forEach(b => b.onclick = async () => {
    const a = b.dataset.md;
    if (a === 'dl') { saveBlob(blob, name); }
    else if (a === 'copy') { try { await navigator.clipboard.writeText(cap); toast('Message copied.'); } catch (e) { toast('Copy blocked.'); } }
    else if (a === 'mark') { if (sentOf(p.m, p.lvl, p.n)) unmarkSent(p.m, p.lvl, p.n); else markSent(p.m, p.lvl, p.n, 'marked'); renderMonthly(); }
    else if (a === 'wa') {
      if (await waSend([{ blob, name }], cap, ct.phone, p.n)) done('WhatsApp');
    } else if (a === 'mail') {
      saveBlob(blob, name); const m = monthMail(p);
      location.href = `mailto:${encodeURIComponent(ct.email || '')}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body + '\n\n(Plan card attached)')}`;
      toast('Email opened; the card was downloaded — attach it before sending.', 6000); done('email');
    }
  });
}

/* ---------- text ---------- */
function monthCaption(p) {
  const o = p.o, M = p.m;
  return [`*${p.n} · ${M.label} plan*`, `🎯 Target ${fN(p.t)} units · ${fN(p.perDay)}/day over ${p.days} days`, `📅 ${p.weeks.map((v, i) => `W${i + 1} ${fN(v)}`).join(' | ')}`,
    o ? `📊 ${monShort(M.prev.ym)}: billed ${fN(o.bill)} of ${fN(o.target)} (${fP(o.target ? o.bill / o.target : null)}), ordered ${fN(o.order)}` : null,
    p.good[0] ? `✅ ${p.good[0]}` : null, 'Focus this month:', ...p.todo.slice(0, 3).map((x, i) => `${['1️⃣', '2️⃣', '3️⃣'][i]} ${x.title}`)].filter(Boolean).join('\n');
}
function monthMail(p) {
  const o = p.o, M = p.m;
  const body = [`Hi ${p.n.split(' ')[0]},`, '', `Your plan for ${M.label}:`, '', `• Target: ${fN(p.t)} units (${fN(p.perDay)} per billing day, ${p.days} days)`,
    ...p.weeks.map((v, i) => `• Week ${i + 1} (${MWK[i][0]}–${i === 3 ? 'end' : MWK[i][1]}): ${fN(v)}`),
    ...(o ? ['', `${monLong(M.prev.ym)} results: billed ${fN(o.bill)} of ${fN(o.target)} (${fP(o.target ? o.bill / o.target : null)}), ordered ${fN(o.order)}.`] : []),
    ...(p.good.length ? ['', 'What worked:', ...p.good.map(g => `• ${g}`)] : []),
    '', o ? 'Learnings — what to do better this month:' : 'How to start the month:', ...p.todo.slice(0, 5).map((x, i) => `${i + 1}. ${x.title}: ${x.text}`),
    '', '— 16-Point KPI Tracker · Heroes in Action'].join('\n');
  return { subject: `${M.label} plan – ${p.n}`, body };
}
const monthCardName = p => safeFile(`${p.lvl} ${p.n} ${p.m.label} plan`) + '.png';

/* ---------- 9:16 card ---------- */
async function monthCardBlob(p) { const cv = await drawMonthCard(p); return new Promise(r => cv.toBlob(r, 'image/png')); }
async function drawMonthCard(p) {
  await fontsReady();
  const W = CARD_W, Hh = CARD_H, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const c = cv.getContext('2d');
  const D = '"Space Grotesk", "Segoe UI", sans-serif', B = '"Plus Jakarta Sans", "Segoe UI", sans-serif', M = p.m, o = p.o;
  const COL = { good: '#16a34a', warn: '#d97706', crit: '#e11d48', nd: '#64748b' };
  const bg = c.createLinearGradient(0, 0, W, Hh); bg.addColorStop(0, '#0b1030'); bg.addColorStop(.5, '#1e1b5c'); bg.addColorStop(1, '#3b0f5c'); c.fillStyle = bg; c.fillRect(0, 0, W, Hh);
  const glow = (x, y, r, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
  glow(1000, 40, 420, 'rgba(14,165,233,.38)'); glow(40, 420, 380, 'rgba(236,72,153,.22)');
  const fit = (txt, w, size, wt, fam) => { c.font = `${wt} ${size}px ${fam}`; while (size > 18 && c.measureText(txt).width > w) { size -= 2; c.font = `${wt} ${size}px ${fam}`; } };
  // header
  c.fillStyle = '#7dd3fc'; c.font = `700 25px ${B}`; c.fillText(`${M.label.toUpperCase()}  ·  MONTHLY PLAN${M.prev ? `  ·  ${MON_FULL(M.prev.ym).toUpperCase()} LEARNINGS` : ''}`, 60, 78);
  c.fillStyle = '#fff'; fit(p.n, 690, 62, 700, D); c.fillText(p.n, 60, 152);
  c.fillStyle = 'rgba(255,255,255,.75)'; const sub = `${p.lvl} · ${p.z} zone${p.hq ? ' · ' + p.hq : ''}${p.lvl === 'SE' && p.asm ? ' · ASM ' + p.asm : ''}`; fit(sub, 960, 27, 500, B); c.fillText(sub, 60, 198);
  let tag = 'NEW THIS MONTH', tcol = '#a78bfa';
  if (o && o.bill) { const up = p.t / o.bill - 1; tag = `${up >= 0 ? '+' : '−'}${Math.abs(Math.round(up * 100))}% vs ${monShort(M.prev.ym).toUpperCase()} BILLED`; tcol = up > .3 ? '#fbbf24' : up <= .1 ? '#34d399' : '#38bdf8'; }
  c.font = `800 25px ${B}`; const tw = c.measureText(tag).width + 44; rr(c, W - 60 - tw, 106, tw, 54, 27); c.fillStyle = tcol; c.fill(); c.fillStyle = '#0b1030'; c.fillText(tag, W - 60 - tw + 22, 142);
  // target strip
  const y0 = 236; rr(c, 40, y0, W - 80, 210, 26); c.fillStyle = 'rgba(255,255,255,.09)'; c.fill();
  c.fillStyle = 'rgba(255,255,255,.72)'; c.font = `600 22px ${B}`; c.fillText(`${MON_FULL(M.ym).toUpperCase()} TARGET`, 80, y0 + 50);
  c.fillStyle = '#fff'; fit(fN(p.t), 320, 92, 700, D); c.fillText(fN(p.t), 80, y0 + 150); c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `500 21px ${B}`; c.fillText('units (cycles)', 80, y0 + 186);
  const tiles = [['Per billing day', fN(p.perDay), `${p.days} billing days`, '#38bdf8'],
    [`${o ? monShort(M.prev.ym) : 'Last month'} target`, o ? fN(o.target) : '–', o && o.target ? `now ${p.t >= o.target ? '+' : '−'}${fP(Math.abs(p.t / o.target - 1))}` : 'new this month', '#a78bfa'],
    [`${o ? monShort(M.prev.ym) : 'Last month'} billed`, o ? fN(o.bill) : '–', o && o.target ? `${fP(o.bill / o.target)} of target` : 'no history', '#fb7185']];
  tiles.forEach(([l, v, s, col], i) => { const x = 420 + i * 205; c.fillStyle = col; c.fillRect(x, y0 + 40, 5, 130);
    c.fillStyle = 'rgba(255,255,255,.72)'; c.font = `600 21px ${B}`; c.fillText(l, x + 18, y0 + 62); c.fillStyle = '#fff'; fit(v, 175, 46, 700, D); c.fillText(v, x + 18, y0 + 118); c.fillStyle = col; fit(s, 180, 20, 600, B); c.fillText(s, x + 18, y0 + 158); });
  // weeks
  const y1 = y0 + 232; rr(c, 40, y1, W - 80, 250, 26); c.fillStyle = 'rgba(255,255,255,.09)'; c.fill();
  c.fillStyle = 'rgba(255,255,255,.72)'; c.font = `600 22px ${B}`; c.fillText('WEEK-BY-WEEK PLAN', 80, y1 + 46);
  c.textAlign = 'right'; c.font = `500 19px ${B}`; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText(p.phased ? 'from the target sheet' : 'even split Mon–Sat', W - 80, y1 + 46); c.textAlign = 'left';
  const mx = Math.max(...p.weeks, 1), wc = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185'], dim = (M.se[0] || M.asm[0]).d.length; let cum = 0;
  p.weeks.forEach((v, i) => { cum += v; const x = 80 + i * 232, bw = 200, bh = Math.max(8, 62 * v / mx);
    rr(c, x, y1 + 166 - bh, bw, bh, 10); c.fillStyle = wc[i]; c.fill();
    c.fillStyle = '#fff'; c.font = `700 30px ${D}`; c.textAlign = 'center'; c.fillText(fN(v), x + bw / 2, y1 + 156 - bh); c.textAlign = 'left';
    c.font = `600 21px ${B}`; c.fillText(`W${i + 1} · ${MWK[i][0]}–${i === 3 ? dim : MWK[i][1]} ${monShort(M.ym)}`, x, y1 + 198);
    c.fillStyle = 'rgba(255,255,255,.65)'; c.font = `500 19px ${B}`; c.fillText(`by end: ${fN(cum)} (${fP(p.t ? cum / p.t : null)})`, x, y1 + 226); });
  // white panel
  const y2 = y1 + 272, X = 84, R = W - 84; rr(c, 40, y2, W - 80, Hh - 70 - y2, 30); c.fillStyle = '#fff'; c.fill();
  let y = y2 + 62;
  if (p.rc) {
    c.fillStyle = '#4f46e5'; c.font = `800 25px ${B}`; c.fillText(`${MON_FULL(M.prev.ym).toUpperCase()} REPORT CARD${p.prevOwner ? '  ·  under ' + p.prevOwner : ''}`, X, y); y += 22;
    const cw = (R - X) / 4;
    p.rc.forEach(([l, v, s, k], i) => { const cx = X + (i % 4) * cw, cy = y + Math.floor(i / 4) * 112, col = COL[k];
      rr(c, cx, cy, cw - 14, 100, 14); c.fillStyle = '#f1f5f9'; c.fill(); c.fillStyle = col; c.fillRect(cx, cy + 14, 5, 72);
      c.fillStyle = '#64748b'; c.font = `600 19px ${B}`; c.fillText(l, cx + 18, cy + 28); c.fillStyle = k === 'nd' ? '#0e1530' : col; fit(v, cw - 40, 34, 700, D); c.fillText(v, cx + 18, cy + 66);
      c.fillStyle = '#64748b'; fit(s, cw - 40, 18, 500, B); c.fillText(s, cx + 18, cy + 90); });
    y += 252;
  }
  if (p.good.length) {
    c.fillStyle = COL.good; c.font = `800 23px ${B}`; c.fillText(`WHAT WORKED IN ${MON_FULL(M.prev.ym).toUpperCase()}`, X, y); y += 40;
    for (const g of p.good) { c.font = `500 24px ${B}`; const ls = clip(c, wrap(c, g, R - X - 40), 2, R - X - 40); ls.forEach((l, j) => { if (!j) { c.fillStyle = COL.good; c.fillText('✓', X, y); } c.fillStyle = '#0e1530'; c.fillText(l, X + 38, y); y += 33; }); y += 6; }
    y += 6;
  }
  if (o) { c.fillStyle = '#e2e8f0'; c.fillRect(X, y - 18, R - X, 2); y += 18; }
  c.fillStyle = COL.crit; c.font = `800 23px ${B}`; c.fillText(o ? `LEARNINGS → WHAT TO DO BETTER IN ${MON_FULL(M.ym).toUpperCase()}` : `HOW TO START ${MON_FULL(M.ym).toUpperCase()} (NEW IN THIS ROLE)`, X, y); y += 50;
  const team = p.team && p.team.length ? p.team.slice(0, 6) : null, stop = Hh - 110 - (team ? 60 + 44 * team.length : 0);
  for (const [i, x] of p.todo.entries()) {
    c.font = `500 23px ${B}`; const ls = clip(c, wrap(c, x.text, R - X - 56), 3, R - X - 56);
    if (y + 40 + ls.length * 31 > stop) break;
    c.fillStyle = '#4f46e5'; c.beginPath(); c.arc(X + 19, y - 8, 19, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = `800 22px ${D}`; c.textAlign = 'center'; c.fillText(String(i + 1), X + 19, y); c.textAlign = 'left';
    c.fillStyle = '#0e1530'; c.font = `700 27px ${B}`; c.fillText(x.title, X + 56, y); y += 38;
    c.fillStyle = '#334155'; c.font = `500 23px ${B}`; ls.forEach(l => { c.fillText(l, X + 56, y); y += 31; }); y += 18;
  }
  if (team) {
    y = Math.max(y, stop) + 4; c.fillStyle = '#e2e8f0'; c.fillRect(X, y, R - X, 2); y += 40;
    c.fillStyle = '#4f46e5'; c.font = `800 22px ${B}`; c.fillText(`TEAM ${MON_FULL(M.ym).toUpperCase()} TARGETS`, X, y);
    c.textAlign = 'right'; c.fillStyle = '#64748b'; c.font = `600 19px ${B}`; c.fillText(`Target  ·  ${M.prev ? monShort(M.prev.ym) + ' billed' : ''}`, R, y); c.textAlign = 'left'; y += 44;
    for (const t of team) { const bp = t.o && t.o.target ? t.o.bill / t.o.target : null;
      c.fillStyle = bp == null ? COL.nd : bp >= 1 ? COL.good : bp >= .8 ? COL.warn : COL.crit; c.beginPath(); c.arc(X + 8, y - 8, 8, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0e1530'; fit(t.n, 520, 24, 600, B); c.fillText(t.n, X + 28, y);
      c.textAlign = 'right'; c.font = `700 24px ${B}`; c.fillText(`${fN(t.t)}  ·  ${t.o ? fP(bp) : 'new'}`, R, y); c.textAlign = 'left'; y += 44; }
  }
  c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `500 21px ${B}`; c.fillText(`${M.label} plan · 16-Point KPI Tracker · Heroes in Action · internal`, 60, Hh - 30);
  return cv;
}

/* ---------- bulk: all cards + messages, or email drafts (zip) ---------- */
async function monthBulk(kind) {
  const prog = $('#mProg'), list = monthRows('ASM').concat(monthRows('SE'));
  if (!list.length) { toast('Nobody in this scope.'); return; }
  try {
    const JZ = await loadJSZip(), zip = new JZ(), caps = [], csv = [['Level', 'Zone', 'ASM', 'Name', 'Target', 'W1', 'W2', 'W3', 'W4', 'Per day', 'Last month target', 'Last month billed', 'Top learnings', 'WhatsApp', 'Email', 'Sent']];
    for (const [i, p] of list.entries()) {
      prog.textContent = `Building ${i + 1} of ${list.length}: ${p.n}…`; await tick();
      const png = await monthCardBlob(p), ct = contactOf(p.n) || {}, nm = monthCardName(p);
      if (kind === 'cards') { zip.file(`${p.lvl}/${nm}`, png); caps.push(`${p.lvl} · ${p.n}${ct.phone ? ' (+' + ct.phone + ')' : ' (no number)'}\nCard: ${p.lvl}/${nm}\n${ct.phone ? 'https://wa.me/' + ct.phone + '\n' : ''}\n${monthCaption(p)}\n`); }
      else { const m = monthMail(p), bd = 'mp' + Math.random().toString(36).slice(2);
        zip.file(safeFile(`${p.lvl} ${p.n}`) + '.eml', ['To: ' + (ct.email || ''), `Subject: =?UTF-8?B?${b64u(m.subject)}?=`, 'X-Unsent: 1', 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${bd}"`, '',
          `--${bd}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', lines76(b64u(m.body)), '',
          `--${bd}`, `Content-Type: image/png; name="${nm}"`, `Content-Disposition: attachment; filename="${nm}"`, 'Content-Transfer-Encoding: base64', '', lines76(b64(await png.arrayBuffer())), '', `--${bd}--`, ''].join('\r\n')); }
      csv.push([p.lvl, p.z, p.asm || '', p.n, p.t, ...p.weeks, p.perDay, p.o ? p.o.target : '', p.o ? p.o.bill : '', p.todo.slice(0, 4).map(x => x.title).join(' | '), ct.phone || '', ct.email || '', sentLbl(sentOf(p.m, p.lvl, p.n))]);
    }
    if (kind === 'cards') zip.file('_WhatsApp_messages.txt', caps.join('\n----------------\n'));
    else zip.file('_README.txt', 'Open each .eml file (double-click): Outlook opens it as a draft with the plan card attached. Check and press Send.\nPeople without an email in the Contacts sheet have an empty To: line.');
    zip.file('_Summary.csv', '﻿' + csv.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\r\n'));
    prog.textContent = 'Zipping…'; await tick();
    saveBlob(await zip.generateAsync({ type: 'blob' }), safeFile(`${SEED.monthly.label} plan ${kind === 'cards' ? 'WhatsApp cards' : 'email drafts'} ${scopeLbl()}`) + '.zip');
    prog.textContent = `Done: ${list.length} ${kind === 'cards' ? 'cards' : 'email drafts'} downloaded. Mark each person as sent once it has gone out.`;
  } catch (e) { console.error(e); prog.textContent = 'Could not build the zip: ' + (e.message || e); }
}
function monthMarkAll() {
  const M = SEED.monthly, list = monthRows('ASM').concat(monthRows('SE')).filter(p => !sentOf(M, p.lvl, p.n));
  if (!list.length) { toast('Everyone in this scope is already marked as sent.'); return; }
  if (!confirm(`Mark ${list.length} people in ${scopeLbl()} as sent?`)) return;
  list.forEach(p => markSent(M, p.lvl, p.n, 'marked')); renderMonthly();
}
function wireMonthly() {
  $$('[data-mlvl]').forEach(b => b.onclick = () => { MST.lvl = b.dataset.mlvl; renderMonthly(); });
  $('#mCards').onclick = () => monthBulk('cards'); $('#mMails').onclick = () => monthBulk('mails'); $('#mMarkAll').onclick = monthMarkAll;
}
