'use strict';
/* ================= weekly review: one page per ASM + Hero of the week (one card per zone) =================
   ASM review page (1080×1920 PNG, for the Monday review): team ranking, who improved week on week, who to coach (and why),
   top 5 dealers to fix. Hero of the week (1080×1350 PNG, for the zone's team group): best pace, best visit-to-order
   conversion, best dealer coverage, most improved. Week % = units billed vs pro-rata target for the calendar week (W1 1–7 …);
   the latest week with 2+ working days of data is compared with the week before it. */

const notVacant = x => !/^(vacant|tba)\b/i.test(x.name);
const firstName = n => String(n).split(/\s+/)[0];
function reviewWeeks(p) {
  const w = p.wk.filter(x => x.complete || x.wdTo >= 2);
  return { cur: w[w.length - 1] || null, prev: w.length > 1 ? w[w.length - 2] : null };
}
const weekLbl = w => w ? `${w.label} (${w.s}–${w.to} ${MON[DB.m - 1]}${w.complete ? '' : ', so far'})` : '–';
/* one SE's week-on-week and field figures */
function seWeek(x, day) {
  const { cur, prev } = reviewWeeks(x.p), f = fieldOf('SE', x.name, day);
  return { x, cur, prev, d: cur && prev && cur.pct != null && prev.pct != null ? cur.pct - prev.pct : null, f, conv: f && f.calls ? f.orders / f.calls : null };
}
function coachWhy(t) {
  const r = [], f = t.f;
  if (f && f.pct != null && f.pct < CFG.watch) r.push(`visits ${fP(f.pct)} of plan`);
  if (f && f.span != null && f.span < CFG.minField * 60) r.push(`${hrs(f.span)}/day in market`);
  if (t.conv != null && t.conv < .3) r.push(`orders at ${f.orders} of ${f.calls} visits`);
  if (t.d != null && t.d < -CFG.stable) r.push(`week down ${Math.round(-t.d * 100)} pts`);
  if (!r.length) r.push(`${fP(t.x.p.pace)} of pace`);
  return r.slice(0, 2).join(' · ');
}
function coachDo(t) {
  const f = t.f;
  if (f && f.span != null && f.span < (CFG.minField - 2) * 60) return 'Daily 10:30 check-in call; joint market day';
  if (t.conv != null && t.conv < .3) return 'Joint visits: close an order at every call';
  if (f && f.pct != null && f.pct < CFG.behind) return 'Fix the PJP together; review missed dealers';
  return 'Joint working day; agree daily order target';
}
function asmReview(asm, day = ST.day) {
  const a = DB.asms.find(x => x.n === asm) || {}, p = perfOf(scopeF({ asm }), day);
  const team = rankRows(teamOf(asm, day).filter(notVacant)).map(x => seWeek(x, day)).sort((u, v) => (u.x.rank || 99) - (v.x.rank || 99));
  const improved = team.filter(t => t.d != null && t.d > CFG.stable).sort((u, v) => v.d - u.d);
  const coach = team.filter(t => /^(crit|behind)$/.test(t.x.p.status)).sort((u, v) => (u.x.p.pace ?? 9) - (v.x.p.pace ?? 9)).slice(0, 3);
  const { cur, prev } = reviewWeeks(p);
  return { asm, z: a.z || '', p, team, improved, coach, dealers: actionsFor(p.r.idx, day).slice(0, 5), cur, prev, tf: teamFieldOf(asm, day), day };
}
/* winners for a zone: pace, conversion (5+ visits with check-ins), coverage (5+ active dealers), most improved */
function zoneHeroes(zone, day = ST.day) {
  const ts = rankRows(rseRows(scopeF({ zone }), day).filter(notVacant)).map(x => seWeek(x, day));
  const best = (list, k) => list.filter(t => k(t) != null).sort((u, v) => k(v) - k(u))[0] || null;
  return {
    zone, n: ts.length, wk: reviewWeeks(perfOf(scopeF({ zone }), day)).cur,
    pace: best(ts, t => t.x.p.pace),
    conv: best(ts.filter(t => t.f && t.f.calls >= 5), t => t.conv),
    cov: best(ts.filter(t => t.f && t.f.cov && t.f.cov.t >= 5), t => t.f.cov.a / t.f.cov.t),
    imp: best(ts.filter(t => t.d != null && t.d > 0), t => t.d),
  };
}

/* ---------- canvas helpers (same look as the daily cards) ---------- */
const RV = { D: '"Space Grotesk", "Segoe UI", sans-serif', B: '"Plus Jakarta Sans", "Segoe UI", sans-serif' };
function rvBackground(c, W, H) {
  const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0b1030'); bg.addColorStop(.5, '#1e1b5c'); bg.addColorStop(1, '#3b0f5c'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  const glow = (x, y, r, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
  glow(W - 80, 40, 420, 'rgba(14,165,233,.35)'); glow(40, H * .3, 380, 'rgba(236,72,153,.2)');
}
const rvText = (c, t, x, y, font, col, maxW) => { c.font = font; c.fillStyle = col; c.fillText(maxW ? clip(c, wrap(c, String(t), maxW), 1, maxW)[0] || '' : String(t), x, y); };
const rvColor = v => v == null ? '#94a3b8' : v >= CFG.watch ? '#22c55e' : v >= CFG.behind ? '#f59e0b' : '#f43f5e';

/* ---------- ASM weekly review page ---------- */
async function drawAsmReview(R) {
  await fontsReady();
  const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'), D = RV.D, B = RV.B;
  rvBackground(c, W, H);
  const o = R.p.official;
  rvText(c, `WEEKLY REVIEW  ·  ${weekLbl(R.cur).toUpperCase()}  ·  DATA TO ${dLabel(R.day).toUpperCase()}`, 60, 78, `700 24px ${B}`, '#7dd3fc', W - 120);
  rvText(c, R.asm, 60, 148, `700 58px ${D}`, '#fff', 760);
  rvText(c, `ASM · ${R.z} zone · ${plural(R.team.length, 'SE')}`, 60, 192, `500 27px ${B}`, 'rgba(255,255,255,.75)');
  const st = PSTAT[R.p.status]; c.font = `800 26px ${B}`; const sw = c.measureText(st.l.toUpperCase()).width + 44;
  rr(c, W - 60 - sw, 106, sw, 52, 26); c.fillStyle = CC[st.k]; c.fill(); rvText(c, st.l.toUpperCase(), W - 60 - sw + 22, 141, `800 26px ${B}`, '#0b1030');
  // summary tiles
  const ty = 226, th = 150; rr(c, 40, ty, W - 80, th, 24); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill();
  const onTrack = R.team.filter(t => t.x.p.status === 'ok').length, d = R.cur && R.prev && R.cur.pct != null && R.prev.pct != null ? R.cur.pct - R.prev.pct : null;
  const tiles = [
    ['ORDERED MTD', o ? fP(o.orderPct) : fP(R.p.ach), o ? `${fN(o.orderAch)} of ${fN(o.target)}` : 'of target', rvColor(R.p.pace)],
    ['THIS WEEK', R.cur && R.cur.pct != null ? fP(R.cur.pct) : '–', d != null ? `${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))} pts vs ${R.prev.label}` : 'of week target', rvColor(R.cur && R.cur.pct)],
    ['TEAM VISITS', R.tf && R.tf.pct != null ? fP(R.tf.pct) : '–', R.tf ? `${fN(R.tf.done)} of ${fN(R.tf.plan)} planned` : 'no journey plan', rvColor(R.tf && R.tf.pct)],
    ['SEs ON TRACK', `${onTrack}/${R.team.length}`, 'at or above pace', rvColor(R.team.length ? onTrack / R.team.length : null)],
  ];
  const tw = (W - 120) / 4;
  tiles.forEach(([l, v, s, col], i) => { const x = 60 + i * tw;
    if (i) { c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(x - 2, ty + 22, 2, th - 44); }
    c.fillStyle = col; c.fillRect(x + 12, ty + 26, 5, 28);
    rvText(c, l, x + 26, ty + 48, `800 17px ${B}`, 'rgba(255,255,255,.75)');
    rvText(c, v, x + 14, ty + 100, `700 42px ${D}`, '#fff');
    rvText(c, s, x + 14, ty + 128, `600 17px ${B}`, 'rgba(255,255,255,.7)', tw - 24); });
  // white body
  const by = ty + th + 22, bh = H - by - 64; rr(c, 40, by, W - 80, bh, 30); c.fillStyle = '#fff'; c.fill();
  const X = 84, R2 = W - 84; let y = by + 60;
  const head = (t, sub) => { rvText(c, t, X, y, `800 26px ${B}`, '#4f46e5'); if (sub) { c.textAlign = 'right'; rvText(c, sub, R2, y, `600 20px ${B}`, '#64748b'); c.textAlign = 'left'; } y += 44; };
  // team ranking
  head('TEAM RANKING', 'by pace · week % = units vs week target');
  const cols = [[X, '#'], [X + 50, 'SE'], [X + 430, 'PACE'], [X + 560, 'WEEK'], [X + 680, 'Δ'], [X + 770, 'VISITS'], [X + 880, 'HRS']];
  cols.forEach(([x, t]) => rvText(c, t, x, y, `800 17px ${B}`, '#94a3b8')); y += 12; c.fillStyle = '#e2e8f0'; c.fillRect(X, y, R2 - X, 2); y += 34;
  for (const t of R.team.slice(0, 8)) {
    const p = t.x.p, f = t.f;
    rvText(c, t.x.rank || '–', X, y, `700 22px ${D}`, '#64748b');
    rvText(c, t.x.name, X + 50, y, `700 23px ${B}`, '#0e1530', 360);
    rvText(c, fP(p.pace), X + 430, y, `700 23px ${B}`, rvColor(p.pace));
    rvText(c, t.cur && t.cur.pct != null ? fP(t.cur.pct) : '–', X + 560, y, `600 22px ${B}`, '#0e1530');
    rvText(c, t.d == null ? '–' : `${t.d >= 0 ? '+' : '−'}${Math.abs(Math.round(t.d * 100))}`, X + 680, y, `700 22px ${B}`, t.d == null ? '#94a3b8' : t.d >= 0 ? '#059669' : '#e11d48');
    rvText(c, f && f.pct != null ? fP(f.pct) : '–', X + 770, y, `600 22px ${B}`, '#0e1530');
    rvText(c, f && f.span != null ? (f.span / 60).toFixed(1) : '–', X + 880, y, `600 22px ${B}`, '#0e1530');
    y += 42;
  }
  if (R.team.length > 8) { rvText(c, `+ ${R.team.length - 8} more SEs in the tracker`, X + 50, y, `600 20px ${B}`, '#64748b'); y += 34; }
  y += 22; c.fillStyle = '#e2e8f0'; c.fillRect(X, y - 30, R2 - X, 2);
  // improved
  head('IMPROVED THIS WEEK', R.prev ? `vs ${R.prev.label}` : '');
  rvText(c, R.improved.length ? R.improved.slice(0, 4).map(t => `${firstName(t.x.name)} +${Math.round(t.d * 100)} pts`).join('   ·   ') : (R.prev ? 'No SE improved week on week — set this week’s targets in the review' : 'First week of the month — no earlier week to compare'),
    X, y, `700 24px ${B}`, R.improved.length ? '#047857' : '#64748b', R2 - X); y += 54;
  c.fillStyle = '#e2e8f0'; c.fillRect(X, y - 30, R2 - X, 2);
  // who to coach
  head('WHO TO COACH', 'most behind first');
  if (!R.coach.length) { rvText(c, 'Nobody behind pace — keep the rhythm', X, y, `600 23px ${B}`, '#64748b'); y += 44; }
  for (const t of R.coach) {
    c.fillStyle = '#e11d48'; c.beginPath(); c.arc(X + 10, y - 8, 9, 0, Math.PI * 2); c.fill();
    rvText(c, `${t.x.name} · ${fP(t.x.p.pace)} of pace`, X + 32, y, `700 24px ${B}`, '#0e1530', R2 - X - 32);
    rvText(c, `${coachWhy(t)}  →  ${coachDo(t)}`, X + 32, y + 32, `600 21px ${B}`, '#0f766e', R2 - X - 32); y += 78;
  }
  y += 6; c.fillStyle = '#e2e8f0'; c.fillRect(X, y - 30, R2 - X, 2);
  // top 5 dealers to fix
  head('TOP 5 DEALERS TO FIX', 'biggest gap first');
  for (const [i, a] of R.dealers.entries()) {
    if (y + 60 > by + bh - 20) break;
    const D0 = DB.D, rs = a.rs.slice(0, 2), s = DB.seInfo.get(D0.se[a.i]);
    rvText(c, `${i + 1}`, X, y, `700 22px ${D}`, '#4f46e5');
    rvText(c, `${D0.n[a.i]}${D0.city[a.i] ? ', ' + D0.city[a.i] : ''}${D0.se[a.i] ? '  ·  SE ' + firstName(D0.se[a.i]) : ''}`, X + 32, y, `700 23px ${B}`, '#0e1530', R2 - X - 32);
    rvText(c, rs.map(r => r.k === 'bp' ? 'No order yet' + (D0.l3[a.i] ? ` (avg ${fN(D0.l3[a.i])}/month)` : '') : r.t).join(' · ') + '  →  ' + (a.rs[0].a || '').replace(/ — .*$/, ''), X + 32, y + 32, `500 20px ${B}`, '#475569', R2 - X - 32);
    y += 72; void s;
  }
  rvText(c, '16-Point KPI Tracker · Heroes in Action · Weekly review', 60, H - 26, `500 22px ${B}`, 'rgba(255,255,255,.55)');
  return cv;
}

/* ---------- Hero of the week card (one per zone) ---------- */
async function drawZoneHero(Z) {
  await fontsReady();
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'), D = RV.D, B = RV.B;
  rvBackground(c, W, H);
  rvText(c, `HEROES IN ACTION  ·  ${weekLbl(Z.wk).toUpperCase()}`, 60, 82, `700 26px ${B}`, '#7dd3fc', W - 120);
  rvText(c, 'Hero of the week', 60, 160, `700 68px ${D}`, '#fff');
  rvText(c, `${Z.zone} zone · ${plural(Z.n, 'SE')}`, 60, 210, `600 30px ${B}`, 'rgba(255,255,255,.78)');
  const awards = [
    ['🏆', 'BEST PACE', Z.pace, t => fP(t.x.p.pace), t => 'of month pace', '#fbbf24'],
    ['🎯', 'BEST CONVERSION', Z.conv, t => fP(t.conv), t => `orders at ${t.f.orders} of ${t.f.calls} visits`, '#34d399'],
    ['🗺️', 'BEST COVERAGE', Z.cov, t => fP(t.f.cov.a / t.f.cov.t), t => `${t.f.cov.a} of ${t.f.cov.t} dealers visited`, '#38bdf8'],
    ['🚀', 'MOST IMPROVED', Z.imp, t => `+${Math.round(t.d * 100)} pts`, t => `${t.prev.label} ${fP(t.prev.pct)} → ${t.cur.label} ${fP(t.cur.pct)}`, '#f472b6'],
  ];
  const gx = 40, gy = 260, gw = (W - 80 - 24) / 2, gh = 430;
  awards.forEach(([ic, lab, t, val, sub, col], i) => {
    const x = gx + (i % 2) * (gw + 24), y = gy + Math.floor(i / 2) * (gh + 24);
    rr(c, x, y, gw, gh, 28); c.fillStyle = 'rgba(255,255,255,.09)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = col; c.fillRect(x + 28, y + 34, 6, 34);
    rvText(c, lab, x + 46, y + 62, `800 24px ${B}`, col);
    rvText(c, ic, x + gw - 76, y + 70, `44px ${B}`, '#fff');
    if (!t) { rvText(c, 'No winner yet this week', x + 32, y + 200, `600 28px ${B}`, 'rgba(255,255,255,.6)', gw - 60); return; }
    const ini = t.x.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    c.fillStyle = col; c.beginPath(); c.arc(x + 76, y + 160, 44, 0, Math.PI * 2); c.fill();
    c.textAlign = 'center'; rvText(c, ini, x + 76, y + 175, `800 34px ${D}`, '#0b1030'); c.textAlign = 'left';
    rvText(c, t.x.name, x + 136, y + 152, `700 32px ${D}`, '#fff', gw - 160);
    rvText(c, `ASM ${t.x.asm || '–'}`, x + 136, y + 190, `500 22px ${B}`, 'rgba(255,255,255,.7)', gw - 160);
    rvText(c, val(t), x + 32, y + 310, `700 76px ${D}`, '#fff');
    rvText(c, sub(t), x + 32, y + 360, `600 23px ${B}`, 'rgba(255,255,255,.8)', gw - 64);
  });
  rvText(c, 'Well done, heroes! Keep the wheels turning.', 60, H - 70, `700 30px ${B}`, '#fff', W - 120);
  rvText(c, '16-Point KPI Tracker · Heroes in Action · Hero Cycles', 60, H - 26, `500 22px ${B}`, 'rgba(255,255,255,.55)');
  return cv;
}

/* ---------- packs (zip of PNGs) and the Reports page card ---------- */
const cvBlob = cv => new Promise(r => cv.toBlob(r, 'image/png'));
async function buildReviewZip(kind, say = () => {}) {
  const JZ = await loadJSZip(), zip = new JZ(), wk = reviewWeeks(perfOf(scopeF({}))).cur, tag = wk ? wk.label : 'week';
  if (kind === 'asm') {
    const list = DB.asms.map(a => a.n).filter(n => teamOf(n).filter(notVacant).length);
    for (const [i, n] of list.entries()) { say(`Building ${i + 1} of ${list.length}: ${n}…`); await tick(); zip.file(safeFile(`${String(i + 1).padStart(2, '0')} ASM review ${n} ${tag}`) + '.png', await cvBlob(await drawAsmReview(asmReview(n)))); }
  } else {
    const zones = [...new Set(DB.ses.map(s => s.z))].filter(Boolean).sort();
    for (const [i, z] of zones.entries()) { say(`Building ${z}…`); await tick(); zip.file(safeFile(`Hero of the week ${z} ${tag}`) + '.png', await cvBlob(await drawZoneHero(zoneHeroes(z)))); }
  }
  return { blob: await zip.generateAsync({ type: 'blob' }), name: `${kind === 'asm' ? 'ASM weekly review' : 'Hero of the week'} ${tag} ${stamp()}.zip` };
}
function renderReviewPacks(grid) {
  const role = ((SEED.meta.user || {}).role) || 'admin'; if (role === 'SE') return;
  grid.insertAdjacentHTML('afterbegin', `<div class="card exp"><div><h4>Weekly review packs (Monday)</h4><p class="small muted">One review page per ASM — team ranking, who improved, who to coach, top 5 dealers to fix — and a Hero of the week card per zone (best pace, conversion, coverage, most improved) for the team groups. PNG images in a zip.</p><p class="small" id="rvProg" style="margin:4px 0 0"></p></div>
    <div class="toolbar"><button class="btn sm primary" type="button" data-rv="asm">⬇ ASM review pages</button><button class="btn sm" type="button" data-rv="hero">⬇ Hero of the week cards</button></div></div>`);
  grid.querySelectorAll('[data-rv]').forEach(b => b.onclick = async () => {
    const prog = $('#rvProg'); b.disabled = true;
    try { const z = await buildReviewZip(b.dataset.rv, t => prog.textContent = t); saveBlob(z.blob, z.name); prog.textContent = `Downloaded ${z.name}`; }
    catch (e) { console.error(e); prog.textContent = e.message || 'Could not build the pack.'; } finally { b.disabled = false; }
  });
}
