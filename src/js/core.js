'use strict';
/* ================= helpers ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NF = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const fN = v => (v == null || !isFinite(v)) ? '–' : NF.format(Math.round(v));
const f1 = v => (v == null || !isFinite(v)) ? '–' : (Math.round(v * 10) / 10).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fP = v => (v == null || !isFinite(v)) ? '–' : Math.round(v * 100) + '%';
const fP1 = v => (v == null || !isFinite(v)) ? '–' : (Math.round(v * 1000) / 10).toFixed(1) + '%';
const inr = v => { v = v || 0; const a = Math.abs(v); return a >= 1e7 ? '₹' + (v / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? '₹' + (v / 1e5).toFixed(1) + ' L' : '₹' + NF.format(Math.round(v)); };
const plural = (n, w, p) => fN(n) + ' ' + (n === 1 ? w : (p || w + 's'));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); }

/* ================= KPI catalogue (mirrors KPI Config sheet of SE Evaluation workbook) ================= */
const KPI = [
  { id: 1, name: '% Dealers billed / month', short: 'Billing points (BP)', grp: 'Coverage', w: .1, mult: .9, src: 'live', unit: 'dealers',
    def: 'Dealers of the scope with net cycle billing > 0 this month.', tgt: 'ROUND(active dealers × 0.9)' },
  { id: 2, name: '% Dealers covered per PJP', short: 'PJP adherence', grp: 'Coverage', w: .1, src: 'pjp', unit: 'visits',
    def: 'Actual PJP visits vs MTD planned visits (SE own plan; ASM own plan at ASM level).', tgt: 'MTD planned visits (direct pull)' },
  { id: 3, name: '% Sub-dealers billed', short: 'Sub-dealer billing points', grp: 'Coverage', w: .1, mult: .75, src: 'sub', unit: 'sub-dealers',
    def: 'Unique sub-dealers billed by the SE’s distributors, Oct MTD.', tgt: 'ROUND(mapped sub-dealers × 0.75)' },
  { id: 4, name: '% Dealers growing value', short: 'Value-growth dealers', grp: 'Growth & range', w: .1, mult: .75, src: 'mis', unit: 'dealers',
    def: 'Active dealers whose YTD 26-27 value is above the period-matched YTD 23-24 base.', tgt: 'ROUND(active dealers × 0.75)' },
  { id: 5, name: '% Counters with NPD placement', short: 'NPD placement', grp: 'Growth & range', w: .1, mult: .5, src: 'live', unit: 'dealers',
    def: 'Billed dealers with net billing of any SKU on the NPD SKU list this month.', tgt: 'ROUND(active dealers × 0.5)' },
  { id: 6, name: 'MBD – models per dealer', short: 'Models per dealer (MBD)', grp: 'Growth & range', w: .1, src: 'live', unit: 'models', avg: true,
    def: 'Average distinct models (Segment+Model) per billed dealer this month.', tgt: 'Average of dealer targets: L3M avg 0→7; <7→7; 7–9→+3; 10–15→+2; >15→+1' },
  { id: 7, name: '% Dealers improving ASP', short: 'ASP-growth dealers', grp: 'Growth & range', w: .1, mult: .75, src: 'mis', unit: 'dealers',
    def: 'Dealers whose YTD 26-27 ASP is above the YTD 23-24 base ASP.', tgt: 'ROUND(active dealers × 0.75)' },
  { id: 8, name: '% Dealers billing premium', short: 'Premium dealers', grp: 'Premium mix', w: .1, mult: .75, src: 'live', unit: 'dealers',
    def: 'Billed dealers with net premium billing (Premium flag = Y) this month.', tgt: 'ROUND(active dealers × 0.75)' },
  { id: 9, name: 'Premium share of volume', short: 'Premium share', grp: 'Premium mix', w: .1, src: 'live', unit: 'share', ratio: true, fixed: .06,
    def: 'Premium units ÷ total cycle units billed this month.', tgt: '6% (fixed)' },
  { id: 10, name: '% Dealers with no overdue (OD)', short: 'No-overdue dealers', grp: 'Dealer health', w: .1, mult: .9, src: 'od', unit: 'dealers',
    def: 'Active dealers with no OD above ₹10,000 (legal cases excluded), latest OD snapshot.', tgt: 'ROUND(active dealers × 0.9)' },
  { id: 11, name: '% Dealers with no pending complaints', short: 'No open complaints', grp: 'Dealer health', w: 0, mult: .9, src: 'snap', unit: 'dealers',
    def: 'Active dealers with no complaint whose SAP status is not CL.', tgt: 'ROUND(active dealers × 0.9)' },
  { id: 12, name: '% Dealers > 4.0 Google rating', short: 'Google rating > 4.0', grp: 'Dealer health', w: 0, mult: .3, src: 'snap', unit: 'dealers',
    def: 'Dealers with an average Google rating above 4.0.', tgt: 'ROUND(active dealers × 0.3)' },
  { id: 13, name: '% Dealers having GSB', short: 'GSB installed', grp: 'Visibility & market', w: 0, mult: .5, src: 'snap', unit: 'dealers',
    def: 'Active dealers with a glow sign board.', tgt: 'ROUND(active dealers × 0.5)' },
  { id: 14, name: '% Dealers having ISB', short: 'In-shop branding', grp: 'Visibility & market', w: 0, mult: .5, src: 'snap', unit: 'dealers',
    def: 'Active dealers with in-shop branding.', tgt: 'ROUND(active dealers × 0.5)' },
  { id: 15, name: '% Dealers in districts ≥ State PLS', short: 'District PLS ≥ State', grp: 'Visibility & market', w: 0, mult: .6, src: 'snap', unit: 'dealers',
    def: 'Dealers in districts whose population-linked share is at or above the state, with FY26-27 YTD sales > 0.', tgt: 'ROUND(active dealers × 0.6)' },
  { id: 16, name: '% Dealers in districts ≥ State DPL', short: 'District DPL ≥ State', grp: 'Visibility & market', w: 0, mult: .6, src: 'snap', unit: 'dealers',
    def: 'Dealers in districts whose dealers-per-lakh is at or above the state, with FY26-27 YTD sales > 0.', tgt: 'ROUND(active dealers × 0.6)' },
];
const CAP = 1.2;
const GROUPS = ['Coverage', 'Growth & range', 'Premium mix', 'Dealer health', 'Visibility & market'];
function band(p) {
  if (p == null || !isFinite(p)) return { k: 'nd', l: 'No data' };
  if (p >= 1) return { k: 'good', l: 'Achieved' };
  if (p >= .8) return { k: 'warn', l: 'Close' };
  if (p >= .5) return { k: 'serious', l: 'Behind' };
  return { k: 'crit', l: 'Critical' };
}
function scoreBand(s) {
  if (s == null) return { k: 'nd', l: 'No data' };
  if (s >= .9) return { k: 'good', l: 'Strong' };
  if (s >= .75) return { k: 'warn', l: 'Steady' };
  if (s >= .5) return { k: 'serious', l: 'At risk' };
  return { k: 'crit', l: 'Critical' };
}
const HEAT = { good: 'var(--good-bg)', warn: 'var(--warn-bg)', serious: 'var(--serious-bg)', crit: 'var(--crit-bg)', nd: 'transparent' };
const HEATC = { good: 'var(--good)', warn: 'var(--warn)', serious: 'var(--serious)', crit: 'var(--crit)', nd: 'var(--ink-3)' };

/* ================= data runtime ================= */
let SEED = null;   // reference data pack — set by main.js (embedded, saved in this browser, or loaded by the user)
let DB = null;
const UPKEY = 'tracker16.upload.v1';

function buildDB(seed, up) {
  const D = {}; for (const k in seed.dealers) D[k] = seed.dealers[k].slice();
  const db = { D, n: D.c.length, meta: seed.meta, ses: seed.ses, asms: seed.asms, pjpSE: seed.pjpSE, pjpASM: seed.pjpASM, dists: seed.dists,
    npd: new Set(seed.npd), models: seed.models.slice(), modelLabel: seed.modelLabel.slice(), facts: seed.facts, orders: seed.orders, rejModels: seed.rejModels,
    asOf: seed.meta.asOf, month: seed.meta.month, seedMonth: seed.meta.month, source: 'seed', srcName: seed.meta.src.billing, lines: null };
  db.codeIdx = new Map(D.c.map((c, i) => [c, i]));
  if (up) {
    for (const nd of up.newDealers || []) {
      if (db.codeIdx.has(nd.c)) continue;
      addDealer(db, nd);
    }
    db.models = up.models; db.modelLabel = up.modelLabel; db.facts = up.facts; db.orders = up.orders; db.rejModels = up.rejModels;
    db.asOf = up.asOf; db.month = up.month; db.source = 'upload'; db.srcName = up.fileName; db.lines = up.lines; db.uploadedAt = up.at;
  }
  const [y, m] = db.month.split('-').map(Number);
  db.y = y; db.m = m; db.dim = new Date(y, m, 0).getDate();
  db.maxDay = Number(db.asOf.slice(8, 10));
  db.sun = d => new Date(y, m - 1, d).getDay() === 0;
  db.wd = []; let c = 0; for (let d = 0; d <= db.dim; d++) { if (d > 0 && !db.sun(d)) c++; db.wd[d] = c; }
  db.wdTotal = db.wd[db.dim];
  db.sameMonth = db.month === db.seedMonth;           // Oct plan, PJP and sub-dealer data belong to the seed month
  // indices
  db.seIdx = new Map(); db.asmIdx = new Map();
  for (let i = 0; i < db.n; i++) {
    const s = D.se[i]; if (s) { if (!db.seIdx.has(s)) db.seIdx.set(s, []); db.seIdx.get(s).push(i); }
  }
  db.seInfo = new Map(db.ses.map(s => [s.n, s]));
  db.seByCode = new Map(db.ses.filter(s => s.code).map(s => [s.code, s.n]));
  // orders by dealer
  db.ord = new Map();
  for (const o of db.orders) { const r = db.ord.get(o[0]) || { ov: 0, open: 0, rej: 0, byDay: [] }; r.ov += o[2]; r.open += o[3]; r.rej += o[4]; r.byDay.push(o); db.ord.set(o[0], r); }
  db.cache = new Map();
  return db;
}
function addDealer(db, nd) {
  const D = db.D; const defs = { c: nd.c, n: nd.n || ('Dealer ' + nd.c), city: nd.city || '', dist: '', st: nd.st || '', z: nd.z || '', asm: nd.asm || '', se: nd.se || '', s: 'A', cat: '-', club: nd.c,
    vg: null, ag: null, mt: 7, l3: 0, od: 0, cp: 0, gr: null, gsb: 0, isb: 0, pls: 0, dpl: 0, pl: 0 };
  for (const k in D) D[k].push(defs[k] !== undefined ? defs[k] : null);
  db.codeIdx.set(nd.c, D.c.length - 1); db.n = D.c.length;
}

/* per-dealer state as of day d (cached) */
function dayState(d) {
  const key = 'ds' + d; if (DB.cache.has(key)) return DB.cache.get(key);
  const n = DB.n, qty = new Float64Array(n), val = new Float64Array(n), pq = new Float64Array(n), nq = new Float64Array(n), dq = new Float64Array(n), dv = new Float64Array(n);
  const mm = new Map();
  for (const f of DB.facts) {
    if (f[1] > d) continue;
    const i = f[0]; qty[i] += f[3]; val[i] += f[4]; if (f[5]) pq[i] += f[3]; if (f[6]) nq[i] += f[3];
    if (f[1] === d) { dq[i] += f[3]; dv[i] += f[4]; }
    const k = i * 8192 + f[2]; mm.set(k, (mm.get(k) || 0) + f[3]);
  }
  const mc = new Uint16Array(n), ms = new Array(n);
  for (const [k, q] of mm) if (q > 0) { const i = Math.floor(k / 8192); mc[i]++; (ms[i] || (ms[i] = [])).push(k % 8192); }
  const s = { qty, val, pq, nq, dq, dv, mc, ms };
  DB.cache.set(key, s); return s;
}

/* ================= state & filters ================= */
const ST = { rsm: '', zone: '', asm: '', se: '', st: '', dist: '', cat: '', day: 1, tab: 'overview', lb: 'SE', lbSort: { k: 'score', dir: -1 }, ds: 'all', dq: '', dAll: false, apAll: false };
try { const saved = JSON.parse(store.get('tracker16.ui') || '{}'); if (saved.lb) ST.lb = saved.lb; } catch (e) {}

function dealerPass(i, f) {
  const D = DB.D;
  if (f.rsm && rsmOf(D.asm[i]) !== f.rsm) return false;
  if (f.dist && D.dist[i] !== f.dist) return false;
  if (f.zone && D.z[i] !== f.zone) return false;
  if (f.asm && D.asm[i] !== f.asm) return false;
  if (f.se && D.se[i] !== f.se) return false;
  if (f.st && D.st[i] !== f.st) return false;
  if (f.cat && D.cat[i] !== f.cat) return false;
  return true;
}
function idxFor(f) {
  const out = [];
  const pool = f.se ? (DB.seIdx.get(f.se) || []) : null;
  if (pool) { for (const i of pool) if (dealerPass(i, f)) out.push(i); return out; }
  for (let i = 0; i < DB.n; i++) if (dealerPass(i, f)) out.push(i);
  return out;
}
function curF() { return { rsm: ST.rsm, zone: ST.zone, asm: ST.asm, se: ST.se, st: ST.st, dist: ST.dist, cat: ST.cat }; }
// RSM over each ASM (from the RSM column of the journey-plan sheets)
function rsmOf(asm) { return ((SEED && SEED.jplan && SEED.jplan.rsm) || {})[asm] || ''; }
function rsmList() { return [...new Set(DB.asms.map(a => rsmOf(a.n)).filter(Boolean))].sort(); }
function level(f) { return f.se ? 'SE' : f.asm ? 'ASM' : f.zone ? 'Zone' : f.rsm ? 'RSM' : 'National'; }
function scopeName(f) { return f.se || f.asm || (f.zone ? f.zone + ' zone' : f.rsm ? 'RSM ' + f.rsm : 'All India'); }

/* ================= KPI engine ================= */
function computeKPIs(idx, ds, f, lvl) {
  const D = DB.D; let base = 0, billed = 0, npdD = 0, premD = 0, mSum = 0, mtSum = 0, totQ = 0, premQ = 0, totV = 0, vg = 0, vgN = 0, ag = 0, agN = 0, noOD = 0, noCp = 0, gr4 = 0, gsb = 0, isb = 0, pls = 0, dpl = 0, mtAll = 0, mtN = 0;
  for (const i of idx) {
    const A = D.s[i] === 'A';
    if (D.mt[i] != null && D.s[i] !== 'N') { mtAll += D.mt[i]; mtN++; }   // workbook rule: average over every dealer in Dealer-MBD1
    if (A) { base++; mtSum += D.mt[i] || 0; if (D.vg[i] != null) vgN++; if (D.vg[i] === 1) vg++; if (D.od[i] === 0) noOD++; if (D.cp[i] === 0) noCp++; if (D.gsb[i]) gsb++; if (D.isb[i]) isb++; }
    if (D.ag[i] != null) agN++; if (D.ag[i] === 1) ag++;
    if (D.gr[i] != null && D.gr[i] > 4) gr4++;
    if (D.pls[i]) pls++; if (D.dpl[i]) dpl++;
    const q = ds.qty[i]; totQ += q; premQ += ds.pq[i]; totV += ds.val[i];
    if (q > 0 && D.s[i] !== 'N') { billed++; mSum += ds.mc[i]; if (ds.nq[i] > 0) npdD++; if (ds.pq[i] > 0) premD++; }   // 'N' = not in Dealer_Vol1: outside the workbook's KPI counts (units still count)
  }
  const T = m => Math.round(base * m);
  const r = {};
  const put = (id, t, a, has = true, extra = {}) => { const p = has && t > 0 ? a / t : null; r[id] = Object.assign({ id, t, a, p, has: has && t > 0 }, extra); };
  put(1, T(.9), billed);
  // PJP
  let pj = null;
  if (DB.sameMonth) {
    if (lvl === 'ASM' && f.asm) pj = DB.pjpASM[f.asm] || null;
    else {
      const ses = f.se ? [f.se] : DB.ses.filter(s => (!f.zone || s.z === f.zone) && (!f.asm || s.asm === f.asm)).map(s => s.n);
      let p = 0, a = 0, pc = 0, k = 0; for (const s of ses) { const x = DB.pjpSE[s]; if (x) { p += x.p; a += x.a; pc += x.pc; k++; } }
      if (k) pj = { p, a, pc, k };
    }
  }
  put(2, pj ? pj.p : 0, pj ? pj.a : 0, !!pj, { pc: pj ? pj.pc : 0 });
  // sub-dealer billing points
  let sm = 0, sa = 0, sl = 0, sk = 0;
  if (DB.sameMonth) for (const x of DB.dists) {
    if (f.zone && x.z !== f.zone) continue; if (f.asm && x.asm !== f.asm) continue; if (f.se && x.se !== f.se) continue; if (f.st && x.st !== f.st) continue;
    if (f.rsm && rsmOf(x.asm) !== f.rsm) continue; if (f.dist) continue;
    sm += x.m; sa += x.mtd; sl += x.lm; sk++;
  }
  put(3, Math.round(sm * .75), sa, sk > 0, { lm: sl, nd: sk, mapped: sm });
  put(4, T(.75), vg, vgN > 0);
  put(5, T(.5), npdD);
  if (DB.meta.fromWorkbook) put(6, mtN ? mtAll / mtN : 0, billed ? mSum / billed : 0, mtN > 0 && billed > 0);
  else put(6, base ? mtSum / base : 0, billed ? mSum / billed : 0, base > 0 && billed > 0);
  put(7, T(.75), ag, agN > 0);
  put(8, T(.75), premD);
  put(9, .06, totQ > 0 ? premQ / totQ : 0, totQ > 0);
  put(10, T(.9), noOD);
  put(11, T(.9), noCp);
  put(12, T(.3), gr4);
  put(13, T(.5), gsb);
  put(14, T(.5), isb);
  put(15, T(.6), pls);
  put(16, T(.6), dpl);
  let sw = 0, ss = 0, scored = 0;
  for (const k of KPI) { const x = r[k.id]; x.score = x.has && k.w > 0 ? Math.min(x.p, CAP) * k.w : null; if (x.score != null) { sw += k.w; ss += x.score; scored++; } }
  const plan = idx.reduce((s, i) => s + (DB.D.pl[i] || 0), 0);
  return { k: r, comp: sw ? ss / sw : null, scored, base, mapped: idx.length, billed, totQ, premQ, totV, plan: DB.sameMonth ? plan : 0, mSum };
}

function scopeCalc(f, day) {
  const key = 'sc' + JSON.stringify(f) + day; if (DB.cache.has(key)) return DB.cache.get(key);
  const idx = idxFor(f); const lvl = level(f);
  const res = computeKPIs(idx, dayState(day), f, lvl); res.idx = idx; res.lvl = lvl; res.f = f;
  DB.cache.set(key, res); return res;
}

/* leaderboard rows for SEs or ASMs within zone/asm/state/cat filters */
function board(lvlName, day) {
  const f0 = curF(); const key = 'lb' + lvlName + JSON.stringify([f0.zone, f0.asm, f0.st, f0.cat]) + day; if (DB.cache.has(key)) return DB.cache.get(key);
  const rows = [];
  if (lvlName === 'SE') {
    for (const s of DB.ses) {
      if (f0.zone && s.z !== f0.zone) continue; if (f0.asm && s.asm !== f0.asm) continue;
      const f = { zone: '', asm: '', se: s.n, st: f0.st, cat: f0.cat };
      const r = scopeCalc(f, day); if (!r.mapped) continue;
      rows.push({ name: s.n, asm: s.asm, z: s.z, r });
    }
  } else {
    for (const a of DB.asms) {
      if (f0.zone && a.z !== f0.zone) continue; if (f0.asm && a.n !== f0.asm) continue;
      const f = { zone: '', asm: a.n, se: '', st: f0.st, cat: f0.cat };
      const r = scopeCalc(f, day); if (!r.mapped) continue;
      rows.push({ name: a.n, asm: a.n, z: a.z, r });
    }
  }
  const ranked = rows.filter(x => x.r.comp != null).sort((a, b) => b.r.comp - a.r.comp);
  ranked.forEach((x, i) => x.rank = i + 1);
  DB.cache.set(key, rows); return rows;
}
function rankOf(f, day) {
  if (f.se) { const rows = board('SE', day); const me = rows.find(x => x.name === f.se); return me && me.rank ? { rank: me.rank, of: rows.filter(x => x.rank).length, peers: f.asm ? f.asm + '’s team' : (ST.zone ? ST.zone + ' zone SEs' : 'SEs nationally') } : null; }
  if (f.asm) { const saveAsm = ST.asm; ST.asm = ''; const rows = board('ASM', day); ST.asm = saveAsm; const me = rows.find(x => x.name === f.asm); return me && me.rank ? { rank: me.rank, of: rows.filter(x => x.rank).length, peers: ST.zone ? ST.zone + ' zone ASMs' : 'ASMs nationally' } : null; }
  return null;
}

/* day series for a scope */
function series(f, upTo) {
  const idx = idxFor(f); const mask = new Uint8Array(DB.n); for (const i of idx) mask[i] = 1;
  const out = []; let prevBilled = 0;
  for (let d = 1; d <= upTo; d++) {
    const ds = dayState(d); let units = 0, val = 0, du = 0, dv = 0, billed = 0, npd = 0, prem = 0, ms = 0, pq = 0, act = 0;
    for (const i of idx) {
      const q = ds.qty[i]; units += q; val += ds.val[i]; du += ds.dq[i]; dv += ds.dv[i]; pq += ds.pq[i];
      if (q > 0) { billed++; ms += ds.mc[i]; if (ds.nq[i] > 0) npd++; if (ds.pq[i] > 0) prem++; }
    }
    let ov = 0; for (const o of DB.orders) if (o[1] === d && mask[o[0]]) ov += o[2];
    out.push({ d, sun: DB.sun(d), units, val, du, dv, billed, newB: billed - prevBilled, npd, prem, mbd: billed ? ms / billed : 0, ps: units > 0 ? pq / units : 0, ov });
    prevBilled = billed;
  }
  return out;
}

/* zone model popularity for recommendations */
function zoneModels(day) {
  const key = 'zm' + day; if (DB.cache.has(key)) return DB.cache.get(key);
  const z = new Map();
  for (const f of DB.facts) {
    if (f[1] > day) continue; const zone = DB.D.z[f[0]] || '-';
    if (!z.has(zone)) z.set(zone, { all: new Map(), npd: new Map(), prem: new Map() });
    const o = z.get(zone); const lab = DB.modelLabel[f[2]];
    o.all.set(f[2], (o.all.get(f[2]) || 0) + f[3]);
    if (f[6]) o.npd.set(lab, (o.npd.get(lab) || 0) + f[3]);
    if (f[5]) o.prem.set(lab, (o.prem.get(lab) || 0) + f[3]);
  }
  const res = new Map();
  for (const [k, o] of z) {
    res.set(k, { all: [...o.all].sort((a, b) => b[1] - a[1]).map(x => x[0]), npd: [...o.npd].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 3), prem: [...o.prem].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 3) });
  }
  DB.cache.set(key, res); return res;
}

/* ================= action engine ================= */
function actionsFor(idx, day) {
  const D = DB.D, ds = dayState(day), zm = zoneModels(day), list = [];
  for (const i of idx) {
    const A = D.s[i] === 'A'; const q = ds.qty[i]; const o = DB.ord.get(i); const zone = zm.get(D.z[i]) || { all: [], npd: [], prem: [] };
    const rs = []; let sc = 0;
    if (A && q <= 0) {
      const pot = Math.max(D.l3[i] || 0, (D.pl[i] || 0) * .8);
      sc += 50 + Math.min(30, pot / 4);
      rs.push({ k: 'bp', t: 'Not billed this month', a: D.l3[i] > 0 ? `Book an order — averaged ${fN(D.l3[i])} units/month in Jul–Sep${D.pl[i] ? `; ${MON[DB.m - 1]} plan ${fN(D.pl[i])}` : ''}` : D.pl[i] ? `Book the first order — ${MON[DB.m - 1]} plan is ${fN(D.pl[i])} units` : 'Re-activate: get a first order this month' });
      if (o && o.open > 0) { sc += 10; rs.push({ k: 'ord', t: 'Open order ' + inr(o.open), a: 'Chase dispatch with the depot so it bills before month-end' }); }
    }
    if (q > 0 && ds.nq[i] <= 0) { sc += 22 + Math.min(10, (D.l3[i] || 0) / 10); rs.push({ k: 'npd', t: 'No NPD model yet', a: 'Place ' + (zone.npd.slice(0, 2).join(' / ') || 'an NPD model') }); }
    if (q > 0 && ds.mc[i] < D.mt[i]) {
      const gap = Math.ceil(D.mt[i] - ds.mc[i]); const have = new Set(ds.ms[i] || []);
      const sug = []; for (const m of zone.all) { if (!have.has(m)) { const l = DB.modelLabel[m]; if (!sug.includes(l)) sug.push(l); } if (sug.length >= 3) break; }
      sc += Math.min(25, 8 + gap * 2); rs.push({ k: 'mbd', t: `${ds.mc[i]} of ${f1(D.mt[i])} models`, a: `Add ${plural(gap, 'model')}` + (sug.length ? ': ' + sug.join(', ') : '') });
    }
    if (q > 0 && ds.pq[i] <= 0) { sc += 12; rs.push({ k: 'prem', t: 'No premium billed', a: 'Pitch ' + (zone.prem.slice(0, 2).join(' / ') || 'a premium model') }); }
    if (A && D.od[i] > 0) { sc += 15; rs.push({ k: 'od', t: 'Overdue ' + inr(D.od[i]), a: 'Collect before the next dispatch (OD snapshot ' + DB.meta.odSnap.slice(5).split('-').reverse().join('-') + ')' }); }
    if (D.cp[i] > 0) { sc += 8; rs.push({ k: 'cmp', t: plural(D.cp[i], 'open complaint'), a: 'Close with the service team and confirm with the dealer' }); }
    if (A && o && o.rej > 0) { sc += 6; rs.push({ k: 'rej', t: inr(o.rej) + ' rejected — no stock', a: 'Offer in-stock alternates for the rejected lines' }); }
    if (!rs.length) continue;
    list.push({ i, sc, rs, l3: D.l3[i] || 0, q, pot: Math.max(D.l3[i] || 0, D.pl[i] || 0) });
  }
  list.sort((a, b) => b.sc - a.sc || b.pot - a.pot);
  return list;
}
const RK_LABEL = { bp: 'Bill', ord: 'Order', npd: 'NPD', mbd: 'Range', prem: 'Premium', od: 'OD', cmp: 'Complaint', rej: 'Stock' };

/* ================= insight engine ================= */
function insightsFor(f, day) {
  const r = scopeCalc(f, day), K = r.k, out = [];
  const wdLeft = DB.wdTotal - DB.wd[day], wdGone = DB.wd[day], share = wdGone / DB.wdTotal;
  const dateTxt = dLabel(day);
  const name = scopeName(f);
  const rk = rankOf(f, day);
  // 1 composite
  if (r.comp != null) {
    const below = KPI.filter(k => k.w > 0 && K[k.id].has && K[k.id].p < .5).length;
    out.push({ sev: scoreBand(r.comp).k === 'good' ? 'good' : scoreBand(r.comp).k === 'warn' ? 'warn' : scoreBand(r.comp).k === 'serious' ? 'serious' : 'crit', kpi: 0,
      h: `Composite score ${Math.round(r.comp * 100)} of 100${rk ? ` — rank ${rk.rank} of ${rk.of} ${rk.peers}` : ''}`,
      p: `${r.scored} of 10 scored KPIs have data for ${MON[DB.m - 1]}; ${plural(below, 'KPI')} ${below === 1 ? 'is' : 'are'} below 50% of target.`,
      a: below ? 'Work the score-gap list on the right from the top; each fully closed KPI adds up to 10 points.' : 'Hold the pace and push the lowest KPI over its target.' });
  }
  // 2 volume vs plan
  if (r.plan > 0) {
    const ach = r.totQ / r.plan, cur = wdGone ? r.totQ / wdGone : 0, need = wdLeft > 0 ? Math.max(0, r.plan - r.totQ) / wdLeft : 0;
    const mult = cur > 0 ? need / cur : null;
    out.push({ sev: ach >= share ? 'good' : mult != null && mult > 1.6 ? 'crit' : 'serious', kpi: 0,
      h: `Volume at ${fP(ach)} of the ${MON[DB.m - 1]} plan with ${fP(share)} of working days gone`,
      p: `${fN(r.totQ)} of ${fN(r.plan)} units. Current run rate ${fN(cur)}/day; ${wdLeft > 0 ? `required ${fN(need)}/day for the remaining ${plural(wdLeft, 'working day')}` : 'month closed'}${mult && mult > 1.05 ? ` (${f1(mult)}× today’s pace)` : ''}.`,
      a: ach >= share ? 'On pace — protect it by converting open orders first.' : `Close ${fN(Math.max(0, r.plan - r.totQ))} units: bill open orders, then unbilled active dealers with Jul–Sep history.` });
  }
  // 3 billing points
  const k1 = K[1];
  if (k1.has) {
    const gap = Math.max(0, k1.t - k1.a); const acts = actionsFor(r.idx, day);
    const unb = acts.filter(x => x.rs[0].k === 'bp'); const unbHist = unb.filter(x => x.l3 > 0); const potential = unbHist.reduce((s, x) => s + x.l3, 0);
    const openOrd = unb.filter(x => x.rs.some(y => y.k === 'ord')).length;
    out.push({ sev: band(k1.p).k, kpi: 1,
      h: gap ? `Billing points ${fN(k1.a)} of ${fN(k1.t)} — ${plural(gap, 'more dealer')} needed${wdLeft > 0 ? ` (${f1(gap / wdLeft)}/working day)` : ''}` : `Billing points target achieved: ${fN(k1.a)} of ${fN(k1.t)}`,
      p: `${plural(unb.length, 'active dealer')} not billed yet; ${unbHist.length} of them bought in Jul–Sep (≈${fN(potential)} units/month between them)${openOrd ? `, and ${openOrd} already have an open order` : ''}.`,
      a: gap ? `Call the unbilled dealers with open orders first, then the highest Jul–Sep buyers (Action plan tab).` : 'Shift focus to range (MBD) and NPD at billed dealers.' });
  }
  // 4 NPD
  const k5 = K[5];
  if (k5.has) {
    const conv = r.billed - k5.a;
    out.push({ sev: band(k5.p).k, kpi: 5, h: `NPD placed at ${fN(k5.a)} of ${fN(k5.t)} target counters`,
      p: `${plural(conv, 'billed dealer')} ${conv === 1 ? 'has' : 'have'} not taken any NPD SKU this month — the fastest conversions because they are already ordering.`,
      a: k5.a >= k5.t ? 'Target met — push a second NPD SKU at the top counters.' : `Add one NPD SKU to the next order at ${Math.min(conv, Math.max(0, k5.t - k5.a))} of these dealers.` });
  }
  // 5 MBD
  const k6 = K[6];
  if (k6.has) {
    const ds = dayState(day); let below = 0, need = 0;
    for (const i of r.idx) if (ds.qty[i] > 0 && ds.mc[i] < DB.D.mt[i]) { below++; need += Math.ceil(DB.D.mt[i] - ds.mc[i]); }
    out.push({ sev: band(k6.p).k, kpi: 6, h: `Range depth ${f1(k6.a)} models per billed dealer vs target ${f1(k6.t)}`,
      p: `${plural(below, 'billed dealer')} sit below their own MBD target — ${fN(need)} model additions in total would close it.`,
      a: 'Use the zone’s best-selling models the dealer has not taken (listed per dealer in the Action plan).' });
  }
  // 6 premium
  const k8 = K[8], k9 = K[9];
  if (k9.has) {
    const needU = Math.max(0, Math.ceil(.06 * r.totQ - r.premQ));
    out.push({ sev: band(k9.p).k, kpi: 9, h: `Premium share ${fP1(k9.a)} vs 6% target; ${fN(k8.a)} of ${fN(k8.t)} target dealers billed premium`,
      p: needU ? `At today’s volume, ${fN(needU)} more premium units would reach 6%. ${plural(Math.max(0, r.billed - k8.a), 'billed dealer')} took no premium model.` : 'Premium mix is at or above target.',
      a: needU ? 'Pitch the zone’s top premium models at dealers with MTD billing above 20 units.' : 'Hold the mix; widen premium to more counters for KPI 8.' });
  }
  // 7 PJP
  const k2 = K[2];
  if (k2.has) {
    const prod = k2.a ? k2.pc / k2.a : null;
    out.push({ sev: band(k2.p).k === 'good' && prod != null && prod < .2 ? 'warn' : band(k2.p).k, kpi: 2, h: `PJP adherence ${fP(k2.p)} (${fN(k2.a)} of ${fN(k2.t)} planned visits)`,
      p: prod != null ? `Only ${fP(prod)} of visits were productive (order booked). Source covers W1–W2 (to 15-Oct).` : 'Source covers W1–W2 (to 15-Oct).',
      a: prod != null && prod < .25 ? 'Plan visits around dealers with open gaps (Action plan) so each visit ends in an order.' : 'Keep visit discipline; update the Journey Plan for W3–W4.' });
  } else if (DB.sameMonth) {
    out.push({ sev: 'info', kpi: 2, h: 'No PJP record for this scope', p: 'The Journey Plan Update has no planned visits for this person in October (W1–W2).', a: 'Ask the SE/ASM to upload the October PJP so KPI 2 scores.' });
  }
  // 8 sub-dealers
  const k3 = K[3];
  if (k3.has) {
    const g = k3.lm ? (k3.a - k3.lm) / k3.lm : null;
    out.push({ sev: band(k3.p).k, kpi: 3, h: `Sub-dealer billing points ${fN(k3.a)} of ${fN(k3.t)} (${fP(k3.p)})`,
      p: `${plural(k3.nd, 'distributor')}, ${fN(k3.mapped)} mapped sub-dealers.${g != null ? ` Versus the same days of September: ${g >= 0 ? '+' : ''}${fP(g)}.` : ''}`,
      a: 'Review the weakest distributors’ beat plans; target sub-dealers billed in September but not yet in October.' });
  }
  // 9 orders & stock
  const mask = new Set(r.idx); let open = 0, rej = 0, openD = 0;
  for (const i of r.idx) { const o = DB.ord.get(i); if (o) { open += o.open; rej += o.rej; if (o.open > 0) openD++; } }
  if (rej > 0 || open > 0) {
    const nat = f.zone || f.asm || f.se || f.st || f.cat ? '' : ` Top rejected models nationally: ${DB.rejModels.slice(0, 3).map(x => x[0]).join(', ')}.`;
    out.push({ sev: rej > open ? 'serious' : 'warn', kpi: 0, h: `${inr(rej)} of orders rejected for stock; ${inr(open)} still open`,
      p: `Open orders sit with ${plural(openD, 'dealer')}.${nat}`,
      a: 'Escalate rejected lines to supply planning daily; offer in-stock alternates to the same dealers.' });
  }
  // 10 momentum
  if (day >= 8) {
    const s = series(f, day); const l7 = s.slice(-7).reduce((a, x) => a + x.du, 0); const p7 = s.slice(-14, -7).reduce((a, x) => a + x.du, 0);
    if (p7 > 0) {
      const g = (l7 - p7) / p7;
      out.push({ sev: g >= 0 ? 'good' : g < -.2 ? 'serious' : 'warn', kpi: 0, h: `Last 7 days: ${fN(l7)} units, ${g >= 0 ? 'up' : 'down'} ${fP(Math.abs(g))} on the previous 7`,
        p: `Week to ${dateTxt} vs the week before.`, a: g >= 0 ? 'Momentum is with you — keep the dispatch cadence.' : 'Check whether the drop is supply (rejections) or demand (fewer orders) before the next review.' });
    }
  }
  // 11 OD
  const k10 = K[10];
  if (k10.has && k10.a < r.base) {
    let odAmt = 0; for (const i of r.idx) if (DB.D.s[i] === 'A') odAmt += DB.D.od[i];
    out.push({ sev: band(k10.p).k, kpi: 10, h: `${plural(r.base - k10.a, 'active dealer')} carry overdue above ₹10k (${inr(odAmt)})`,
      p: `OD snapshot dated ${DB.meta.odSnap.split('-').reverse().join('-')} — refresh before acting on individual dealers.`, a: 'Tie dispatch release to OD clearance for these dealers.' });
  }
  // 12 peer spread
  if (!f.se) {
    const rows = board('SE', day).filter(x => (!f.asm || x.asm === f.asm) && (!f.zone || x.z === f.zone) && x.r.k[1].has && x.r.base >= 5);
    if (rows.length >= 3) {
      const gapOf = x => Math.max(0, x.r.k[1].t - x.r.k[1].a);
      const byGap = rows.slice().sort((a, b) => gapOf(b) - gapOf(a)); const lo = byGap.slice(0, 3).filter(x => gapOf(x) > 0);
      const hi = rows.slice().sort((a, b) => b.r.k[1].p - a.r.k[1].p)[0];
      const short = lo.reduce((s, x) => s + gapOf(x), 0); const tot = rows.reduce((s, x) => s + gapOf(x), 0);
      if (lo.length) out.push({ sev: 'info', kpi: 1, h: `Largest billing-point gaps: ${lo.map(x => `${x.name} (−${gapOf(x)})`).join(', ')}`,
        p: `These ${lo.length} SEs hold ${fN(short)} of the ${fN(tot)} dealers this scope is short (${fP(tot ? short / tot : null)}). Best in this scope: ${hi.name} at ${fP(hi.r.k[1].p)} of target.`, a: 'Review these SEs’ unbilled dealer lists with them before the next market day.' });
    }
  }
  const order = { crit: 0, serious: 1, warn: 2, info: 3, good: 4, nd: 5 };
  // keep composite first, then by severity
  const first = out.filter(x => x.kpi === 0 && x.h.startsWith('Composite'));
  const rest = out.filter(x => !first.includes(x)).sort((a, b) => order[a.sev] - order[b.sev]);
  return first.concat(rest);
}

/* ================= rendering ================= */
function dLabel(d) { const dt = new Date(DB.y, DB.m - 1, d); return `${DOW[dt.getDay()]} ${d} ${MON[DB.m - 1]}`; }
function nextWorkDay(d) { let x = d + 1; while (x <= DB.dim && DB.sun(x)) x++; if (x > DB.dim) { const nd = new Date(DB.y, DB.m, 1); while (nd.getDay() === 0) nd.setDate(nd.getDate() + 1); return `${DOW[nd.getDay()]} ${nd.getDate()} ${MON[nd.getMonth()]}`; } return dLabel(x); }

function fillSelect(sel, opts, val, allLabel) {
  sel.innerHTML = `<option value="">${allLabel}</option>` + opts.map(o => `<option value="${esc(o)}"${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('');
  if (val && !opts.includes(val)) sel.value = '';
}
function renderFilters() {
  const D = DB.D;
  const rsms = rsmList(); if (ST.rsm && !rsms.includes(ST.rsm)) ST.rsm = '';
  if ($('#fRsm')) fillSelect($('#fRsm'), rsms, ST.rsm, 'All RSMs');
  const zones = [...new Set(DB.asms.filter(a => !ST.rsm || rsmOf(a.n) === ST.rsm).map(a => a.z))].filter(Boolean).sort();
  fillSelect($('#fZone'), zones, ST.zone, 'All zones');
  const asms = DB.asms.filter(a => (!ST.zone || a.z === ST.zone) && (!ST.rsm || rsmOf(a.n) === ST.rsm)).map(a => a.n);
  if (ST.asm && !asms.includes(ST.asm)) ST.asm = '';
  fillSelect($('#fAsm'), asms, ST.asm, 'All ASMs');
  const ses = DB.ses.filter(s => (!ST.zone || s.z === ST.zone) && (!ST.asm || s.asm === ST.asm) && (!ST.rsm || rsmOf(s.asm) === ST.rsm) && s.act > 0).map(s => s.n);
  if (ST.se && !ses.includes(ST.se)) ST.se = '';
  fillSelect($('#fSe'), ses, ST.se, ST.asm ? 'All SEs of ASM' : 'All SEs');
  const stSet = new Set(), catSet = new Set(), dSet = new Set();
  for (let i = 0; i < DB.n; i++) { if ((ST.rsm && rsmOf(D.asm[i]) !== ST.rsm) || (ST.zone && D.z[i] !== ST.zone) || (ST.asm && D.asm[i] !== ST.asm) || (ST.se && D.se[i] !== ST.se)) continue; if (D.st[i]) stSet.add(D.st[i]); if (D.cat[i] && D.cat[i] !== '-') catSet.add(D.cat[i]); if (D.dist[i] && (!ST.st || D.st[i] === ST.st)) dSet.add(D.dist[i]); }
  const sts = [...stSet].sort(); if (ST.st && !sts.includes(ST.st)) ST.st = '';
  fillSelect($('#fSt'), sts, ST.st, 'All states');
  const dists = [...dSet].sort(); if (ST.dist && !dists.includes(ST.dist)) ST.dist = '';
  if ($('#fDist')) fillSelect($('#fDist'), dists, ST.dist, 'All areas');
  const cats = [...catSet].sort(); if (ST.cat && !cats.includes(ST.cat)) ST.cat = '';
  fillSelect($('#fCat'), cats, ST.cat, 'All categories');
  const r = $('#fDay'); r.max = DB.maxDay; r.value = ST.day; $('#dLab').textContent = dLabel(ST.day) + (ST.day === DB.maxDay ? ' · latest' : '');
}

function renderHeader() {
  const up = DB.source === 'upload';
  $('#srcDot').className = 'dot' + (up ? ' up' : '');
  $('#srcTxt').innerHTML = SEED.meta.dashDay ? `Targets &amp; orders to <b>${dLabel(SEED.meta.dashDay)}</b> · billing lines to ${dLabel(DB.maxDay)}`
    : `Data to <b>${dLabel(DB.maxDay)} ${DB.y}</b> · ${up ? 'your upload' : SEED.meta.fromWorkbook ? 'master workbook' : 'Dashboard Dump'}`;
  $('#subline').textContent = `SE & ASM 16-point evaluation · ${MON[DB.m - 1]}-${String(DB.y).slice(2)} · working day ${DB.wd[DB.maxDay]} of ${DB.wdTotal}`;
  const b = $('#uploadBanner');
  if (up) { b.hidden = false; b.innerHTML = `<span>Showing your uploaded dump <b>${esc(DB.srcName)}</b>${DB.lines ? ` · ${fN(DB.lines)} billing lines` : ''}${DB.sameMonth ? '' : ` · PJP, sub-dealer and plan data are for ${SEED.meta.month} and are hidden for this month`}.</span><button class="btn" type="button" id="btnRevert">Back to the data pack's billing</button>`; $('#btnRevert').onclick = () => { store.del(UPKEY); DB = buildDB(SEED); ST.day = DB.maxDay; renderAll(); toast('Back to the built-in data set.'); }; }
  else b.hidden = true;
}

function ringSVG(v, k) {
  const R = 44, C = 2 * Math.PI * R, p = Math.max(0, Math.min(1, v || 0));
  return `<svg viewBox="0 0 104 104" aria-hidden="true"><circle cx="52" cy="52" r="${R}" fill="none" stroke="var(--sunken)" stroke-width="10"/><circle cx="52" cy="52" r="${R}" fill="none" stroke="${HEATC[k]}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}"/></svg>`;
}

function renderOverview() {
  const f = curF(), day = ST.day, r = scopeCalc(f, day), K = r.k;
  const sb = scoreBand(r.comp), rk = rankOf(f, day);
  const lvl = r.lvl; const asmOf = f.se ? (DB.seInfo.get(f.se) || {}).asm : '';
  $('#scoreCard').innerHTML = `<div class="ring">${ringSVG(r.comp, sb.k)}<div class="val"><div><b class="num">${r.comp == null ? '–' : Math.round(r.comp * 100)}</b><span>of 100</span></div></div></div>
    <div style="min-width:0"><div class="eyebrow">${lvl} scorecard</div><h2>${esc(scopeName(f))}</h2>
    <div class="meta-line">${asmOf ? 'ASM ' + esc(asmOf) + ' · ' : ''}${fN(r.base)} active of ${fN(r.mapped)} mapped dealers</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px"><span class="pill s-${sb.k}">${sb.l}</span>${rk ? `<span class="tag">Rank ${rk.rank}/${rk.of} · ${esc(rk.peers)}</span>` : ''}<span class="tag">${r.scored}/10 KPIs scored</span></div></div>`;
  // volume card
  const wdGone = DB.wd[day], wdLeft = DB.wdTotal - wdGone, share = wdGone / DB.wdTotal;
  if (r.plan > 0) {
    const ach = r.totQ / r.plan, need = wdLeft > 0 ? Math.max(0, r.plan - r.totQ) / wdLeft : 0, cur = wdGone ? r.totQ / wdGone : 0;
    $('#volCard').innerHTML = `<div class="eyebrow">Volume vs ${MON[DB.m - 1]} plan</div><div class="big num">${fN(r.totQ)}<small>/ ${fN(r.plan)}</small></div>
      <div class="meter" title="Achievement vs plan; marker = expected by today"><i style="width:${Math.min(100, ach * 100)}%;background:${ach >= share ? 'var(--good)' : 'var(--series)'}"></i><u style="left:${share * 100}%"></u></div>
      <div class="kv"><span>${fP(ach)} achieved</span><span>pace mark ${fP(share)}</span></div>
      <div class="kv"><span>Run rate now</span><b class="num">${fN(cur)}/day</b></div><div class="kv"><span>Needed (${wdLeft} days)</span><b class="num" style="color:${need > cur * 1.05 ? 'var(--crit)' : 'var(--good)'}">${fN(need)}/day</b></div>`;
  } else {
    $('#volCard').innerHTML = `<div class="eyebrow">Volume MTD</div><div class="big num">${fN(r.totQ)}<small>units</small></div><div class="kv"><span>Value</span><b>${inr(r.totV)}</b></div><div class="kv"><span>Plan</span><span class="muted">No ${MON[DB.m - 1]} plan in data</span></div>`;
  }
  // BP card
  const k1 = K[1]; const bpNeed = wdLeft > 0 ? Math.max(0, k1.t - k1.a) / wdLeft : 0;
  $('#bpCard').innerHTML = `<div class="eyebrow">Billing points</div><div class="big num">${fN(k1.a)}<small>/ ${fN(k1.t)}</small></div>
    <div class="meter"><i style="width:${Math.min(100, (k1.p || 0) * 100)}%;background:${HEATC[band(k1.p).k]}"></i><u style="left:${share * 100}%"></u></div>
    <div class="kv"><span>${fP(k1.p)} of target</span><span class="pill s-${band(k1.p).k}">${band(k1.p).l}</span></div>
    <div class="kv"><span>New dealers needed / day</span><b class="num">${wdLeft > 0 ? f1(bpNeed) : '–'}</b></div>`;
  // Day card
  const s = series(f, day); const today = s[s.length - 1] || { du: 0, dv: 0, newB: 0 };
  const l7 = s.slice(-7).reduce((a, x) => a + x.du, 0), p7 = s.slice(-14, -7).reduce((a, x) => a + x.du, 0);
  const g = p7 > 0 ? (l7 - p7) / p7 : null;
  $('#dayCard').innerHTML = `<div class="eyebrow">On ${dLabel(day)}</div><div class="big num">${fN(today.du)}<small>units billed</small></div>
    <div class="kv"><span>Value billed</span><b>${inr(today.dv)}</b></div>
    <div class="kv"><span>Dealers billed for the first time this month</span><b class="num">${today.newB >= 0 ? '+' : ''}${fN(today.newB)}</b></div>
    <div class="kv"><span>Last 7 days vs prior 7</span><b class="num" style="color:${g == null ? 'var(--ink-3)' : g >= 0 ? 'var(--good)' : 'var(--crit)'}">${g == null ? '–' : (g >= 0 ? '+' : '') + fP(g)}</b></div>`;
  // insights
  const ins = insightsFor(f, day);
  $('#insCount').textContent = plural(ins.length, 'insight');
  $('#insList').innerHTML = ins.map(x => `<div class="ins ${x.sev}"><div class="stripe"></div><div><h4>${esc(x.h)}</h4><p>${esc(x.p)}</p><div class="act"><b>Action</b><span>${esc(x.a)}</span></div></div></div>`).join('');
  // gaps
  const gaps = KPI.filter(k => k.w > 0 && K[k.id].has).map(k => ({ k, lost: k.w * (1 - Math.min(1, K[k.id].p)) })).filter(x => x.lost > 0.0001).sort((a, b) => b.lost - a.lost);
  const nd = KPI.filter(k => k.w > 0 && !K[k.id].has);
  $('#gapList').innerHTML = (gaps.length ? gaps.map(x => `<div class="gap-row"><span class="nm">${x.k.id}. ${esc(x.k.short)}</span><span class="pts num">−${(x.lost * 100).toFixed(1)} pts</span><div class="meter"><i style="width:${x.lost * 1000}%"></i></div></div>`).join('') : '<p class="muted">All scored KPIs at or above target.</p>')
    + (nd.length ? `<p class="small muted" style="margin:6px 0 0">Not scored (no data for this scope): ${nd.map(k => k.id + '. ' + esc(k.short)).join(', ')}. The composite is re-weighted over the KPIs that have data.</p>` : '');
  // tiles
  const prevDay = Math.max(1, day - 1); const rPrev = day > 1 ? scopeCalc(f, prevDay) : null;
  const one = tileNotes(r, day);
  $('#tileGroups').innerHTML = `<div class="grp-h"><h3>The 16 KPIs</h3><span class="muted small">1–10 scored at 10% each · 11–16 tracked, not in the composite</span></div>
    <div class="tiles">${KPI.map(k => tileHTML(k, K[k.id], rPrev ? rPrev.k[k.id] : null, one[k.id])).join('')}</div>`;
}
function srcTag(k) {
  const m = { live: [`Live · ${dLabel(ST.day).slice(4)}`, 'live'], pjp: ['PJP to 15-Oct', ''], sub: ['Distributor MIS · 25-Oct', ''], mis: ['MIS Sep-26 YTD', ''], od: ['OD snapshot ' + DB.meta.odSnap.slice(5).split('-').reverse().join('-'), ''], snap: ['Snapshot · Sep-26', ''] }[k.src];
  return `<span class="tag ${m[1]}">${m[0]}</span>`;
}
function fmtKV(k, v) { return k.ratio ? fP1(v) : k.avg ? f1(v) : fN(v); }
function tileHTML(k, x, prev, note) {
  const b = band(x.p);
  let delta = '';
  if (prev && k.src === 'live' && x.has && prev.has) {
    const dlt = x.a - prev.a;
    if (k.ratio) { if (Math.abs(dlt) >= .0005) delta = `${dlt > 0 ? '+' : ''}${(dlt * 100).toFixed(1)} pp vs prev day`; }
    else if (k.avg) { if (Math.abs(dlt) >= .05) delta = `${dlt > 0 ? '+' : ''}${f1(dlt)} vs prev day`; }
    else if (dlt) delta = `${dlt > 0 ? '+' : ''}${fN(dlt)} vs prev day`;
  }
  return `<div class="card tile b-${b.k}${x.has ? '' : ' nodata'}">
    <div class="top"><div style="min-width:0"><div class="eyebrow" style="margin-bottom:2px">${esc(k.grp)}</div><h4><span class="kid">${String(k.id).padStart(2, '0')}</span>${esc(k.name)}</h4></div><span class="pill s-${b.k}">${b.l}</span></div>
    <div class="fig"><b class="num">${x.has ? fmtKV(k, x.a) : '–'}</b><span>${x.has ? '/ ' + fmtKV(k, x.t) + ' target' : 'no data'}</span><span class="pc num">${x.has ? fP(x.p) : ''}</span></div>
    <div class="meter" aria-hidden="true"><i style="width:${x.has ? Math.min(100, x.p * 100) : 0}%;background:${HEATC[b.k]}"></i></div>
    <div class="one">${esc(note || '')}</div>
    <div class="foot">${srcTag(k)}<span class="wt">${k.w ? 'Weight 10%' : 'Tracked'}</span>${delta ? `<span class="delta" style="color:${delta.startsWith('-') ? 'var(--crit)' : 'var(--good)'}">${delta}</span>` : ''}</div></div>`;
}
function tileNotes(r, day) {
  const K = r.k, D = DB.D, ds = dayState(day), n = {};
  const wdLeft = DB.wdTotal - DB.wd[day];
  let unbA = 0, unbH = 0, mbdB = 0, noNpd = 0, noPrem = 0, od = 0, cp = 0, noG = 0, noI = 0;
  for (const i of r.idx) {
    const A = D.s[i] === 'A', q = ds.qty[i];
    if (A && q <= 0) { unbA++; if (D.l3[i] > 0) unbH++; }
    if (q > 0) { if (ds.mc[i] < D.mt[i]) mbdB++; if (ds.nq[i] <= 0) noNpd++; if (ds.pq[i] <= 0) noPrem++; }
    if (A) { if (D.od[i] > 0) od++; if (D.cp[i] > 0) cp++; if (!D.gsb[i]) noG++; if (!D.isb[i]) noI++; }
  }
  const gap = id => Math.max(0, K[id].t - K[id].a);
  n[1] = gap(1) ? `${plural(gap(1), 'dealer')} short — ${f1(wdLeft ? gap(1) / wdLeft : gap(1))}/day. ${unbH} of ${unbA} unbilled active dealers bought in Jul–Sep.` : `Target met. ${unbA} active dealers still unbilled.`;
  n[2] = K[2].has ? `${fN(K[2].pc)} productive calls = ${fP(K[2].a ? K[2].pc / K[2].a : null)} of visits. W1–W2 only.` : 'No October PJP record for this scope.';
  n[3] = K[3].has ? `${plural(K[3].nd, 'distributor')} · same period Sep: ${fN(K[3].lm)} (${K[3].lm ? ((K[3].a - K[3].lm) / K[3].lm >= 0 ? '+' : '') + fP((K[3].a - K[3].lm) / K[3].lm) : '–'}).` : 'No distributor in the October distributor MIS for this scope.';
  n[4] = K[4].has ? `${plural(gap(4), 'dealer')} to convert. YTD value vs FY23-24 same months (MIS to Sep).` : 'No MIS history for these dealers.';
  n[5] = `${plural(noNpd, 'billed dealer')} without NPD — quickest wins.`;
  n[6] = `${plural(mbdB, 'billed dealer')} below their own model target.`;
  n[7] = K[7].has ? `${plural(gap(7), 'dealer')} to lift ASP above the FY23-24 base.` : 'No MIS ASP history for these dealers.';
  n[8] = `${plural(noPrem, 'billed dealer')} took no premium model.`;
  n[9] = K[9].has ? (K[9].a < .06 ? `${fN(Math.max(0, Math.ceil(.06 * r.totQ - r.premQ)))} more premium units reach 6% at today’s volume.` : 'At or above the 6% mix.') : 'No billing yet.';
  n[10] = `${plural(od, 'active dealer')} with overdue above ₹10k.`;
  n[11] = `${plural(cp, 'active dealer')} with an open complaint.`;
  n[12] = `${plural(gap(12), 'more dealer')} rated above 4.0 needed.`;
  n[13] = `${plural(noG, 'active dealer')} without a glow sign board.`;
  n[14] = `${plural(noI, 'active dealer')} without in-shop branding.`;
  n[15] = 'Annual FY measure — moves with district share, not daily sales.';
  n[16] = 'Annual FY measure — moves with district dealer density.';
  return n;
}

/* ---------- leaderboard ---------- */
function renderLeaderboard() {
  const rows = board(ST.lb, ST.day).slice();
  const { k: sk, dir } = ST.lbSort;
  const val = x => sk === 'score' ? (x.r.comp == null ? -1 : x.r.comp) : sk === 'name' ? x.name : sk === 'base' ? x.r.base : sk === 'vol' ? (x.r.plan ? x.r.totQ / x.r.plan : -1) : (x.r.k[sk].has ? x.r.k[sk].p : -1);
  rows.sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * dir; });
  $('#lbTitle').textContent = (ST.lb === 'SE' ? 'SE' : 'ASM') + ' leaderboard';
  $$('[data-lb]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lb === ST.lb)));
  $('#lbNote').textContent = `${rows.length} ${ST.lb === 'SE' ? 'SEs' : 'ASMs'} · as of ${dLabel(ST.day)} · composite = weighted Ach % of KPIs 1–10 (capped at ${CAP * 100}%), re-weighted over KPIs with data. Cells show Ach % vs target.`;
  const arrow = k => ST.lbSort.k === k ? (ST.lbSort.dir < 0 ? ' ↓' : ' ↑') : '';
  const lbPlan = rows.some(x => x.r.plan > 0);   // “Vol vs plan” only when a dealer volume plan is loaded
  const head = `<thead><tr><th class="r">#</th><th class="sticky-col sortable" data-s="name">${ST.lb}${arrow('name')}</th>${ST.lb === 'SE' ? '<th>ASM</th>' : ''}<th>Zone</th><th class="r sortable" data-s="base">Active${arrow('base')}</th><th class="c sortable" data-s="score">Score${arrow('score')}</th>${lbPlan ? `<th class="c sortable" data-s="vol">Vol vs plan${arrow('vol')}</th>` : ''}
    ${KPI.map(k => `<th class="c sortable" data-s="${k.id}" title="${esc(k.name)}">${k.id}${arrow(String(k.id)) || arrow(k.id)}<br><span style="font-weight:500;text-transform:none;letter-spacing:0">${esc(k.short.split(' ')[0])}</span></th>`).join('')}</tr></thead>`;
  const cell = (p, has) => { const b = band(has ? p : null); return `<td class="c"><span class="heat" style="background:${HEAT[b.k]};color:${b.k === 'nd' ? 'var(--ink-3)' : 'var(--ink)'}"${has ? '' : ' title="No data for this KPI (e.g. no sub-dealers)"'}>${has ? fP(p) : 'NA'}</span></td>`; };
  const body = rows.map(x => {
    const sb = scoreBand(x.r.comp); const vp = x.r.plan ? x.r.totQ / x.r.plan : null;
    return `<tr class="click" data-name="${esc(x.name)}"><td class="r num muted">${x.rank || '–'}</td><td class="sticky-col"><b>${esc(x.name)}</b></td>${ST.lb === 'SE' ? `<td>${esc(x.asm)}</td>` : ''}<td>${esc(x.z)}</td><td class="r num">${fN(x.r.base)}</td>
      <td class="c"><span class="heat" style="background:${HEAT[sb.k]};color:var(--ink)">${x.r.comp == null ? 'NA' : Math.round(x.r.comp * 100)}</span></td>${lbPlan ? cell(vp, vp != null) : ''}
      ${KPI.map(k => cell(x.r.k[k.id].p, x.r.k[k.id].has)).join('')}</tr>`;
  }).join('');
  $('#lbTable').innerHTML = head + '<tbody>' + body + '</tbody>';
  $$('#lbTable th.sortable').forEach(th => th.onclick = () => { const k = th.dataset.s; const key = isNaN(+k) ? k : +k; if (ST.lbSort.k === key) ST.lbSort.dir *= -1; else ST.lbSort = { k: key, dir: key === 'name' ? 1 : -1 }; renderLeaderboard(); });
  $$('#lbTable tr.click').forEach(tr => tr.onclick = () => {
    const nm = tr.dataset.name;
    if (ST.lb === 'SE') { const s = DB.seInfo.get(nm); ST.se = nm; ST.asm = s ? s.asm : ''; ST.zone = s ? s.z : ''; }
    else { const a = DB.asms.find(a => a.n === nm); ST.asm = nm; ST.se = ''; ST.zone = a ? a.z : ''; }
    setTab('overview'); renderAll();
  });
}

/* ---------- charts ---------- */
function lineChart(el, cfg) {
  const W = 640, H = 240, L = 44, R = 14, T = 16, B = 28;
  const n = cfg.x.length; const max = Math.max(1, ...cfg.series.flatMap(s => s.v.filter(v => v != null))) * 1.08;
  const xs = i => L + (n <= 1 ? 0 : i * (W - L - R) / (n - 1)); const ys = v => T + (H - T - B) * (1 - v / max);
  const ticks = niceTicks(max, 4);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.label)}">`;
  for (const t of ticks) svg += `<line class="gl" x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text class="ax" x="${L - 6}" y="${ys(t) + 3.5}" text-anchor="end">${fN(t)}</text>`;
  cfg.x.forEach((d, i) => { if (n <= 16 || i % 2 === 0 || i === n - 1) svg += `<text class="ax" x="${xs(i)}" y="${H - 9}" text-anchor="middle">${d}</text>`; });
  for (const s of cfg.series) {
    const pts = s.v.map((v, i) => v == null ? null : `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).filter(Boolean);
    svg += `<polyline fill="none" stroke="${s.c}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"/>`;
    if (!s.dash) { const li = s.v.length - 1; svg += `<circle cx="${xs(li)}" cy="${ys(s.v[li])}" r="4.5" fill="${s.c}" stroke="var(--surface)" stroke-width="2"/><text class="lbl" x="${xs(li) - 8}" y="${ys(s.v[li]) - 9}" text-anchor="end">${fN(s.v[li])}</text>`; }
  }
  svg += `<line id="${el.id}-x" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--ink-3)" stroke-width="1" opacity="0"/>`;
  cfg.x.forEach((d, i) => { const w = (W - L - R) / Math.max(1, n - 1); svg += `<rect data-i="${i}" x="${xs(i) - w / 2}" y="${T}" width="${w}" height="${H - T - B}" fill="transparent"/>`; });
  svg += '</svg>';
  el.innerHTML = svg; bindTip(el, cfg, i => xs(i));
}
function barChart(el, cfg) {
  const W = 640, H = 240, L = 44, R = 14, T = 16, B = 28;
  const n = cfg.x.length; const max = Math.max(1, cfg.ref || 0, ...cfg.v) * 1.1; const bw = (W - L - R) / n;
  const ys = v => T + (H - T - B) * (1 - Math.max(0, v) / max);
  const ticks = niceTicks(max, 4);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.label)}">`;
  for (const t of ticks) svg += `<line class="gl" x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text class="ax" x="${L - 6}" y="${ys(t) + 3.5}" text-anchor="end">${fN(t)}</text>`;
  if (cfg.ref) svg += `<line x1="${L}" x2="${W - R}" y1="${ys(cfg.ref)}" y2="${ys(cfg.ref)}" stroke="var(--pace)" stroke-width="1.5" stroke-dasharray="5 4"/><text class="ax" x="${W - R}" y="${ys(cfg.ref) - 5}" text-anchor="end">needed ${fN(cfg.ref)}/day</text>`;
  cfg.v.forEach((v, i) => {
    const x = L + i * bw + 2, w = Math.max(2, bw - 4), y = ys(v), h = Math.max(0, H - B - y);
    const c = i === n - 1 ? 'var(--series-2)' : cfg.sun[i] ? 'var(--line-2)' : 'var(--series)';
    if (h > 0) svg += `<path d="M${x},${H - B} V${y + Math.min(4, h)} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H - B} Z" fill="${c}"/>`;
    if (n <= 16 || i % 2 === 0 || i === n - 1) svg += `<text class="ax" x="${x + w / 2}" y="${H - 9}" text-anchor="middle">${cfg.x[i]}</text>`;
  });
  svg += `<line id="${el.id}-x" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="transparent"/>`;
  cfg.v.forEach((v, i) => svg += `<rect data-i="${i}" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>`);
  svg += '</svg>'; el.innerHTML = svg; bindTip(el, cfg, i => L + i * bw + bw / 2);
}
function niceTicks(max, k) { const raw = max / k, mag = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw; const out = []; for (let v = 0; v <= max; v += st) out.push(v); return out; }
function bindTip(el, cfg, xpos) {
  const tip = $('#tip'); const svg = el.querySelector('svg'); const xl = el.querySelector(`#${el.id}-x`);
  el.querySelectorAll('rect[data-i]').forEach(rc => {
    rc.addEventListener('mousemove', () => {
      const i = +rc.dataset.i; const box = svg.getBoundingClientRect(); const sc = box.width / 640;
      tip.innerHTML = cfg.tip(i); tip.hidden = false;
      const host = el.getBoundingClientRect(); const page = document.documentElement.getBoundingClientRect();
      tip.style.left = (host.left - page.left + (xpos(i) * sc) + (box.left - host.left)) + 'px';
      tip.style.top = (box.top - page.top + 14) + 'px';
      if (xl) { xl.setAttribute('x1', xpos(i)); xl.setAttribute('x2', xpos(i)); xl.setAttribute('opacity', '.5'); }
    });
    rc.addEventListener('mouseleave', () => { tip.hidden = true; if (xl) xl.setAttribute('opacity', '0'); });
  });
}

/* ---------- day-wise ---------- */
function renderDaywise() {
  const f = curF(), day = ST.day, s = series(f, day), r = scopeCalc(f, day), t = r.k[1].t;
  const x = s.map(o => String(o.d));
  const pace = s.map(o => Math.round(t * DB.wd[o.d] / DB.wdTotal));
  $('#lg1').innerHTML = `<span><i style="background:var(--series)"></i>Dealers billed (cumulative)</span><span><i class="dash"></i>Required pace to reach ${fN(t)} by ${DB.dim} ${MON[DB.m - 1]}</span>`;
  lineChart($('#ch1'), { label: 'Cumulative billing points vs pace', x, series: [{ v: pace, c: 'var(--pace)', dash: true }, { v: s.map(o => o.billed), c: 'var(--series)' }],
    tip: i => `<b>${dLabel(s[i].d)}</b><br>Billed: ${fN(s[i].billed)} dealers (+${fN(Math.max(0, s[i].newB))})<br>Pace: ${fN(pace[i])}` });
  const wdLeft = DB.wdTotal - DB.wd[day]; const need = r.plan > 0 && wdLeft > 0 ? Math.max(0, r.plan - r.totQ) / wdLeft : null;
  $('#lg2').innerHTML = `<span><i style="background:var(--series)"></i>Units per day</span><span><i style="background:var(--series-2)"></i>Selected day</span><span><i style="background:var(--line-2)"></i>Sunday</span>${need ? '<span><i class="dash"></i>Required daily run rate</span>' : ''}`;
  barChart($('#ch2'), { label: 'Units billed per day', x, v: s.map(o => o.du), sun: s.map(o => o.sun), ref: need,
    tip: i => `<b>${dLabel(s[i].d)}</b><br>${fN(s[i].du)} units · ${inr(s[i].dv)}<br>Orders booked: ${inr(s[i].ov)}` });
  // what changed
  const t0 = s[s.length - 1], t1 = s[s.length - 2];
  $('#chgTitle').textContent = `What changed on ${dLabel(day)}`;
  const ch = [];
  if (t0) {
    ch.push({ sev: t0.du > 0 ? 'info' : 'warn', h: `${fN(t0.du)} units (${inr(t0.dv)}) billed on the day`, p: t1 ? `Previous day: ${fN(t1.du)} units.` : 'First day of the month.' });
    ch.push({ sev: t0.newB > 0 ? 'good' : 'warn', h: `${t0.newB >= 0 ? '+' : ''}${fN(t0.newB)} dealers added to billing points`, p: `Now ${fN(t0.billed)} of ${fN(t)} target (${fP(t ? t0.billed / t : null)}).` });
    if (t1) {
      const dm = t0.mbd - t1.mbd; ch.push({ sev: 'info', h: `NPD counters ${fN(t0.npd)} (${t0.npd - t1.npd >= 0 ? '+' : ''}${t0.npd - t1.npd}) · premium dealers ${fN(t0.prem)} (${t0.prem - t1.prem >= 0 ? '+' : ''}${t0.prem - t1.prem})`, p: `MBD ${f1(t0.mbd)} (${dm >= 0 ? '+' : ''}${f1(dm)}) · premium share ${fP1(t0.ps)}.` });
    }
    if (!f.se) {
      const ds = dayState(day); const per = new Map();
      for (const i of r.idx) { const se = DB.D.se[i] || 'Unassigned'; per.set(se, (per.get(se) || 0) + ds.dq[i]); }
      const ses = [...per].filter(x => x[0] !== 'Unassigned').sort((a, b) => b[1] - a[1]);
      const zero = ses.filter(x => x[1] <= 0).map(x => x[0]);
      if (ses.length) ch.push({ sev: zero.length ? 'warn' : 'good', h: `Top SE on the day: ${ses[0][0]} (${fN(ses[0][1])} units)`, p: zero.length ? `No billing on the day: ${zero.slice(0, 8).join(', ')}${zero.length > 8 ? ` +${zero.length - 8} more` : ''}.` : 'Every SE in scope billed on the day.' });
    }
  }
  $('#chgList').innerHTML = ch.map(x => `<div class="ins ${x.sev}"><div class="stripe"></div><div><h4>${esc(x.h)}</h4><p>${esc(x.p)}</p></div></div>`).join('');
  // table
  const head = `<thead><tr><th>Date</th><th class="r">Units (day)</th><th class="r">Value (day)</th><th class="r">Units MTD</th><th class="r">New BP (day)</th><th class="r">Billing points</th><th class="r">BP % of target</th><th class="r">NPD counters</th><th class="r">Premium dealers</th><th class="r">MBD</th><th class="r">Premium share</th><th class="r">Orders booked (day)</th></tr></thead>`;
  const rows = s.slice().reverse().map(o => `<tr${o.sun ? ' style="color:var(--ink-3)"' : ''}><td>${dLabel(o.d)}${o.sun ? ' · Sun' : ''}</td><td class="r num">${fN(o.du)}</td><td class="r num">${inr(o.dv)}</td><td class="r num">${fN(o.units)}</td><td class="r num">${o.newB ? (o.newB > 0 ? '+' : '') + fN(o.newB) : '–'}</td><td class="r num"><b>${fN(o.billed)}</b></td><td class="r num">${fP(t ? o.billed / t : null)}</td><td class="r num">${fN(o.npd)}</td><td class="r num">${fN(o.prem)}</td><td class="r num">${f1(o.mbd)}</td><td class="r num">${fP1(o.ps)}</td><td class="r num">${inr(o.ov)}</td></tr>`).join('');
  $('#dayTable').innerHTML = head + '<tbody>' + rows + '</tbody>';
}

/* ---------- action plan ---------- */
function planData() {
  const f = curF(), day = ST.day, r = scopeCalc(f, day);
  const acts = actionsFor(r.idx, day);
  const cnt = k => acts.filter(x => x.rs.some(y => y.k === k)).length;
  return { f, day, r, acts, cnt };
}
function renderActions() {
  const { f, day, r, acts, cnt } = planData();
  $('#actCnt').textContent = fN(acts.length);
  $('#apTitle').textContent = `Action plan · ${scopeName(f)}`;
  $('#apSub').textContent = `For ${nextWorkDay(day)} · based on data to ${dLabel(day)}`;
  const chips = [['bp', 'Active dealers to bill'], ['ord', 'With open orders'], ['npd', 'Billed, no NPD'], ['mbd', 'Below MBD target'], ['prem', 'No premium yet'], ['od', 'Overdue to collect']];
  $('#apChips').innerHTML = chips.map(([k, l]) => `<div class="sumchip"><b class="num">${fN(cnt(k))}</b><span>${l}</span></div>`).join('');
  const lim = ST.apAll ? acts.length : (f.se ? 15 : 30);
  const D = DB.D;
  $('#apList').innerHTML = acts.length ? acts.slice(0, lim).map((x, n) => {
    const i = x.i; const o = DB.ord.get(i);
    return `<div class="dl-row"><div class="rank num">${n + 1}</div><div style="min-width:0"><h4>${esc(D.n[i])} <span class="muted small">#${D.c[i]}</span></h4>
      <div class="sub">${esc([D.city[i], D.st[i]].filter(Boolean).join(', '))}${f.se ? '' : ' · SE ' + esc(D.se[i] || 'unassigned')} · ${D.s[i] === 'A' ? 'Active' : D.s[i] === 'I' ? 'Inactive' : D.s[i] === 'N' ? 'Not in Dealer_Vol1' : 'Closed'} · cat ${esc(D.cat[i])}</div>
      <div class="reasons">${x.rs.map(y => `<div class="reason"><span class="rk ${y.k}">${RK_LABEL[y.k]}</span><span><b style="font-weight:600;color:var(--ink)">${esc(y.t)}</b> — ${esc(y.a)}</span></div>`).join('')}</div></div>
      <div class="pot"><b class="num">${fN(x.q)}</b>MTD units<br><span class="num">${fN(x.l3)}</span>/mo Jul–Sep${D.pl[i] ? `<br><span class="num">${fN(D.pl[i])}</span> plan` : ''}</div></div>`;
  }).join('') : '<p class="muted">No open actions for this scope — every dealer is billed, ranged and clean.</p>';
  $('#apMore').hidden = acts.length <= lim; $('#apMore').textContent = `Show all ${fN(acts.length)} dealers`;
  const txt = waMessage({ f, day, r, acts });
  $('#waText').textContent = txt;
  $('#waLink').href = 'https://wa.me/?text=' + encodeURIComponent(txt);
}
function waMessage({ f, day, r, acts }) {
  const K = r.k, wdLeft = DB.wdTotal - DB.wd[day];
  const L = [];
  L.push(`*Daily Action Plan – ${nextWorkDay(day)}*`);
  if (f.se) { const s = DB.seInfo.get(f.se) || {}; L.push(`SE: ${f.se} | ASM: ${s.asm || '-'}`); }
  else L.push(`${level(f)}: ${scopeName(f)}`);
  const rk = rankOf(f, day);
  L.push(`Score ${r.comp == null ? '-' : Math.round(r.comp * 100)}/100${rk ? ` · Rank ${rk.rank}/${rk.of}` : ''} · data to ${dLabel(day)}`);
  L.push(`BP ${K[1].a}/${K[1].t} · NPD ${K[5].a}/${K[5].t} · MBD ${f1(K[6].a)}/${f1(K[6].t)} · Premium ${fP1(K[9].a)}/6%`);
  if (r.plan > 0) L.push(`Volume ${fN(r.totQ)}/${fN(r.plan)} (${fP(r.totQ / r.plan)})` + (r.totQ >= r.plan ? ' · plan achieved' : wdLeft ? ` · need ${fN((r.plan - r.totQ) / wdLeft)}/day` : ''));
  L.push('');
  if (!f.se) {
    const rows = board('SE', day).filter(x => (!f.asm || x.asm === f.asm) && (!f.zone || x.z === f.zone)).sort((a, b) => (a.r.comp ?? 9) - (b.r.comp ?? 9));
    if (rows.length && rows.length <= 12) {
      L.push('*SE status (lowest score first)*');
      rows.forEach(x => { const g = Math.max(0, x.r.k[1].t - x.r.k[1].a); L.push(`• ${x.name}: ${x.r.comp == null ? '-' : Math.round(x.r.comp * 100)} · BP ${x.r.k[1].a}/${x.r.k[1].t}${g ? ` (−${g})` : ''} · NPD ${x.r.k[5].a}/${x.r.k[5].t}`); });
      L.push('');
    }
  }
  const top = acts.slice(0, f.se ? 12 : 10);
  if (top.length) {
    L.push(`*Focus dealers (${top.length})*`);
    top.forEach((x, n) => { const i = x.i; const main = x.rs[0]; const extra = x.rs.slice(1, 3).map(y => RK_LABEL[y.k]).join(', ');
      L.push(`${n + 1}. ${DB.D.n[i]}, ${DB.D.city[i] || ''} (${DB.D.c[i]})${f.se ? '' : ' – ' + (DB.D.se[i] || 'unassigned')}\n   ${main.t}: ${main.a}${extra ? ` | also: ${extra}` : ''}`); });
    L.push('');
  }
  const g1 = Math.max(0, K[1].t - K[1].a), g5 = Math.max(0, K[5].t - K[5].a), g8 = Math.max(0, K[8].t - K[8].a);
  const goals = [];
  if (g1) goals.push(`Bill ${plural(g1, 'more dealer')}${wdLeft ? ` (${f1(g1 / wdLeft)}/day)` : ''}`);
  if (g5) goals.push(`Place NPD at ${plural(g5, 'more counter')}`);
  if (g8) goals.push(`Premium at ${plural(g8, 'more dealer')}`);
  const pu = Math.max(0, Math.ceil(.06 * r.totQ - r.premQ)); if (pu) goals.push(`${fN(pu)} more premium units for 6% mix`);
  if (goals.length) { L.push(`*To close by ${DB.dim} ${MON[DB.m - 1]}*`); goals.forEach(g => L.push('• ' + g)); }
  return L.join('\n');
}

/* ---------- dealers ---------- */
function renderDealers() {
  const f = curF(), day = ST.day, r = scopeCalc(f, day), ds = dayState(day), D = DB.D;
  const q = ST.dq.trim().toLowerCase();
  let idx = r.idx;
  if (ST.ds === 'active') idx = idx.filter(i => D.s[i] === 'A');
  if (ST.ds === 'unbilled') idx = idx.filter(i => D.s[i] === 'A' && ds.qty[i] <= 0);
  if (q) idx = idx.filter(i => (D.n[i] + ' ' + D.c[i] + ' ' + D.city[i] + ' ' + D.se[i] + ' ' + D.dist[i]).toLowerCase().includes(q));
  idx = idx.slice().sort((a, b) => ds.qty[b] - ds.qty[a] || D.l3[b] - D.l3[a]);
  $$('[data-ds]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ds === ST.ds)));
  const lim = ST.dAll ? idx.length : 250;
  $('#dNote').textContent = `${fN(idx.length)} dealers · sorted by MTD units · ✓ = achieved, ✗ = gap, NA = not applicable (e.g. not billed yet)`;
  const yn = (v, app = true) => !app ? '<span class="na" title="Not applicable">NA</span>' : v ? '<span class="yes">✓</span>' : '<span class="no">✗</span>';
  const hasPl = idx.some(i => D.pl[i] > 0);   // dealer volume plan: column only when the workbook has one
  const head = `<thead><tr><th class="sticky-col">Dealer</th><th>Code</th><th>SE</th><th>City</th><th>Status</th><th class="r">MTD units</th><th class="r">Jul–Sep avg</th>${hasPl ? `<th class="r">${MON[DB.m - 1]} plan</th>` : ''}<th class="c">Billed</th><th class="c">NPD</th><th class="c">Premium</th><th class="r">Models / target</th><th class="c">Value gr.</th><th class="c">ASP gr.</th><th class="r">OD</th><th class="c">Complaints</th><th class="r">Rating</th><th class="c">GSB</th><th class="c">ISB</th></tr></thead>`;
  const rows = idx.slice(0, lim).map(i => { const b = ds.qty[i] > 0; return `<tr><td class="sticky-col"><b>${esc(D.n[i])}</b></td><td class="num">${D.c[i]}</td><td>${D.se[i] ? esc(D.se[i]) : '<span class="na">Unassigned</span>'}</td><td>${esc(D.city[i])}</td><td>${D.s[i] === 'A' ? 'Active' : D.s[i] === 'I' ? 'Inactive' : D.s[i] === 'N' ? 'Not in Dealer_Vol1' : 'Closed'}</td>
    <td class="r num"><b>${fN(ds.qty[i])}</b></td><td class="r num">${fN(D.l3[i])}</td>${hasPl ? `<td class="r num">${D.pl[i] ? fN(D.pl[i]) : '0'}</td>` : ''}<td class="c">${yn(b, D.s[i] === 'A' || b)}</td><td class="c">${yn(ds.nq[i] > 0, b)}</td><td class="c">${yn(ds.pq[i] > 0, b)}</td>
    <td class="r num">${b ? `<span class="${ds.mc[i] >= D.mt[i] ? 'yes' : 'no'}">${ds.mc[i]}</span> / ${f1(D.mt[i])}` : '<span class="na">0 / ' + f1(D.mt[i]) + '</span>'}</td>
    <td class="c">${yn(D.vg[i] === 1, D.vg[i] != null)}</td><td class="c">${yn(D.ag[i] === 1, D.ag[i] != null)}</td><td class="r num">${D.od[i] ? '<span class="no">' + inr(D.od[i]) + '</span>' : '<span class="yes">Nil</span>'}</td><td class="c">${D.cp[i] ? '<span class="no">' + D.cp[i] + '</span>' : '<span class="yes">0</span>'}</td><td class="r num">${D.gr[i] != null ? D.gr[i].toFixed(1) : '<span class="na">No rating</span>'}</td><td class="c">${yn(D.gsb[i])}</td><td class="c">${yn(D.isb[i])}</td></tr>`; }).join('');
  $('#dTable').innerHTML = head + '<tbody>' + rows + '</tbody>';
  $('#dMore').hidden = idx.length <= lim; $('#dMore').textContent = `Show all ${fN(idx.length)}`;
}

/* ---------- method ---------- */
function renderMethod() {
  $('#defTable').innerHTML = `<thead><tr><th>#</th><th>KPI</th><th>Achievement</th><th>Target</th><th>Weight</th><th>Source &amp; refresh</th></tr></thead><tbody>` +
    KPI.map(k => `<tr><td class="num">${k.id}</td><td><b>${esc(k.name)}</b></td><td>${esc(k.def)}</td><td>${esc(k.tgt)}</td><td>${k.w ? '10%' : 'Tracked'}</td><td>${{ live: 'Daily dump (updates on upload)', pjp: 'TBR Journey Plan Update', sub: 'TBR Distribution (distributor MIS)', mis: 'MIS Sep-26 (monthly)', od: 'OD snapshot (SE Evaluation workbook)', snap: 'SE Evaluation workbook snapshot' }[k.src]}</td></tr>`).join('') + '</tbody>';
  const s = SEED.meta.src;
  $('#srcList').innerHTML = `<p><b>Billing &amp; orders (live KPIs 1, 5, 6, 8, 9, volume, day-wise):</b> ${esc(DB.source === 'upload' ? DB.srcName + ' (your upload)' : s.billing + ' and ' + s.orders)} — month ${MON[DB.m - 1]}-${DB.y}, bills to ${dLabel(DB.maxDay)}.</p>
    <p><b>Dealer master, SE/ASM mapping, active status:</b> ${esc(s.master)}. Each dealer counts for the SE named in the master.</p>
    <p><b>Volume plan:</b> ${esc(s.plan)} (club level, attached to the club’s lead dealer).</p>
    <p><b>KPI 2 (PJP):</b> ${esc(s.pjp)}. <b>KPI 3:</b> ${esc(s.sub)}; distributor → SE from the SE Evaluation Index.</p>
    <p><b>KPI 4 &amp; 7 (YTD growth), MBD targets, Jul–Sep dealer averages:</b> ${esc(s.mis)}.</p>
    <p><b>KPI 10:</b> ${esc(s.od)}. <b>KPI 11–16:</b> ${esc(s.snap)}.</p>
    <p><b>NPD SKU list:</b> ${DB.npd.size} SKUs from the SE Evaluation workbook. <b>Premium:</b> the dump’s Premium flag (KIDS &gt; ₹3,500 or ASP &gt; ₹5,600 when the flag is missing).</p>`;
  $('#assumeList').innerHTML = `<p>1. <b>Weights:</b> KPIs 1–10 at 10% each, KPIs 11–16 tracked but unweighted, as in the KPI Config sheet (marked placeholder there). Achievement capped at ${CAP * 100}% before weighting.</p>
    <p>2. <b>Rating bands</b> (not defined in the workbook): Strong ≥ 90, Steady 75–89, At risk 50–74, Critical &lt; 50. KPI tiles: Achieved ≥ 100%, Close 80–99%, Behind 50–79%, Critical &lt; 50%.</p>
    <p>3. <b>Live KPIs compare month-to-date achievement with the full-month target</b>, so scores rise through the month. The pace marker on meters shows the share of working days gone (Sundays excluded).</p>
    <p>4. <b>KPI 1 counts any billed dealer of the scope</b>, including inactive codes that billed (the workbook’s existing logic); the base counts only Active dealers.</p>
    <p>5. <b>PJP data covers W1–W2 only</b> (W3–W4 were zero in the TBR sheet). SEs absent from the Journey Plan Update show “No data” and are excluded from their composite.</p>
    <p>6. <b>Premium share target 6%</b> as used in the tracker sheets (the original SE Dashboard showed 10%) — please confirm.</p>
    <p>7. Action priorities are a ranking rule, not a forecast: unbilled active dealer 50 pts (+ up to 30 for Jul–Sep volume, +10 with an open order), billed without NPD 22+, below MBD 8–25, overdue 15, no premium 12, complaint 8, stock rejection 6.</p>`;
}

/* ---------- AI briefing (sample capability) ---------- */
let SAMPLE = null, DOWNLOADS = null;
async function initCaps() {
  if (!window.claude || typeof window.claude.use !== 'function') return;
  try { SAMPLE = await window.claude.use('sample'); } catch (e) { SAMPLE = null; }
  $('#btnAI').hidden = !SAMPLE;
  try { DOWNLOADS = await window.claude.use('downloads'); } catch (e) { DOWNLOADS = null; }
}
async function runAI() {
  if (!SAMPLE) return;
  const f = curF(), day = ST.day, r = scopeCalc(f, day), out = $('#aiOut'), btn = $('#btnAI');
  const acts = actionsFor(r.idx, day).slice(0, 10).map(x => ({ dealer: DB.D.n[x.i], code: DB.D.c[x.i], city: DB.D.city[x.i], se: DB.D.se[x.i], mtdUnits: x.q, julSepAvg: x.l3, gaps: x.rs.map(y => y.t + ' -> ' + y.a) }));
  const data = { scope: scopeName(f), level: r.lvl, dataTo: dLabel(day) + ' ' + DB.y, workingDaysLeft: DB.wdTotal - DB.wd[day], compositeOf100: r.comp == null ? null : Math.round(r.comp * 100), rank: rankOf(f, day),
    kpis: KPI.map(k => ({ id: k.id, kpi: k.name, weight: k.w, target: r.k[k.id].has ? +r.k[k.id].t.toFixed(3) : null, achievement: r.k[k.id].has ? +r.k[k.id].a.toFixed(3) : null, achPct: r.k[k.id].has ? Math.round(r.k[k.id].p * 100) : null, source: k.src })),
    volume: { mtdUnits: r.totQ, plan: r.plan || null, value: Math.round(r.totV) }, ruleInsights: insightsFor(f, day).map(x => x.h + '. ' + x.p), topActionDealers: acts };
  const prompt = `You are a sales performance analyst for Hero Cycles' domestic dealer network. Write a short daily briefing for the ${r.lvl} scope "${scopeName(f)}" using ONLY the JSON data below. Do not invent numbers. Audience: the SE/ASM and their manager, read on a phone.
Format exactly (plain text, no markdown headings, max 180 words):
SUMMARY: one sentence with the composite score and the single biggest issue.
INSIGHTS:
- three bullets, each citing a number from the data and saying what it means for the business
ACTIONS FOR ${nextWorkDay(day).toUpperCase()}:
1. three numbered actions naming dealers or counts and the KPI each one moves
RISK: one line on what could stop the month closing on target, or a data caveat.

DATA:
${JSON.stringify(data)}`;
  btn.disabled = true; out.hidden = false; out.textContent = 'Thinking…';
  try {
    const res = await SAMPLE(prompt, { onText: ({ text }) => { out.textContent = text; } });
    out.textContent = res.text + (res.truncated ? '\n…' : '');
  } catch (e) {
    if (e && (e.code === 'not_granted')) { out.textContent = 'AI briefing was not allowed for this page. The rule-based insights above still apply.'; $('#btnAI').hidden = true; }
    else if (e && e.code === 'rate_limited') out.textContent = 'Too many requests right now — try again in a minute.';
    else out.textContent = (e && e.text) ? e.text : 'The AI briefing could not be generated. The insights above are unaffected.';
  } finally { btn.disabled = false; }
}

/* ---------- Excel export ---------- */
function kpiRowVals(r, k) { const x = r.k[k.id]; return x.has ? [k.ratio ? +x.t.toFixed(4) : k.avg ? +x.t.toFixed(2) : x.t, k.ratio ? +x.a.toFixed(4) : k.avg ? +x.a.toFixed(2) : x.a, +(x.p).toFixed(4)] : ['No data', 'No data', 'No data']; }
function buildWorkbook(onlyActions) {
  const XL = window.XLSX; const wb = XL.utils.book_new();
  const f = curF(), day = ST.day, r = scopeCalc(f, day);
  const add = (name, aoa, widths) => { const ws = XL.utils.aoa_to_sheet(aoa); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); XL.utils.book_append_sheet(wb, ws, name); };
  const acts = actionsFor(r.idx, day);
  const actRows = [['Priority', 'Dealer code', 'Dealer', 'City', 'State', 'SE', 'ASM', 'Status', 'MTD units', 'Jul–Sep avg units', 'Oct plan', 'Score', 'Gap 1', 'Action 1', 'Gap 2', 'Action 2', 'Gap 3', 'Action 3']];
  acts.forEach((x, n) => { const i = x.i, D = DB.D; const row = [n + 1, D.c[i], D.n[i], D.city[i], D.st[i], D.se[i], D.asm[i], D.s[i] === 'A' ? 'Active' : D.s[i] === 'I' ? 'Inactive' : D.s[i] === 'N' ? 'Not in Dealer_Vol1' : 'Closed', x.q, x.l3, D.pl[i] || 0, Math.round(x.sc)]; x.rs.slice(0, 3).forEach(y => row.push(y.t, y.a)); actRows.push(row); });
  if (!onlyActions) {
    const sum = [['16-Point SE & ASM Tracker'], ['Scope', scopeName(f)], ['Level', r.lvl], ['Data to', dLabel(day) + ' ' + DB.y], ['Source', DB.source === 'upload' ? DB.srcName : SEED.meta.src.billing], ['Composite score (of 100)', r.comp == null ? 'No data' : Math.round(r.comp * 100)], ['Active dealers', r.base], ['Mapped dealers', r.mapped], ['Units MTD', r.totQ], ['Value MTD (₹)', Math.round(r.totV)], ['Oct plan (units)', r.plan || 'n/a'], [], ['#', 'KPI', 'Target', 'Achievement', 'Ach %', 'Weight', 'Score pts', 'Source']];
    KPI.forEach(k => { const v = kpiRowVals(r, k); sum.push([k.id, k.name, ...v, k.w, r.k[k.id].score == null ? '' : +(r.k[k.id].score * 100).toFixed(2), k.src]); });
    add('Summary', sum, [8, 44, 12, 12, 10, 8, 10, 10]);
    for (const lv of ['SE', 'ASM']) {
      const rows = board(lv, day); const hdr = ['Rank', lv, 'ASM', 'Zone', 'Active dealers', 'Score (of 100)', 'Units MTD', 'Oct plan']; KPI.forEach(k => hdr.push(`K${k.id} Target`, `K${k.id} Ach`, `K${k.id} Ach%`));
      const aoa = [hdr]; rows.slice().sort((a, b) => (a.rank || 999) - (b.rank || 999)).forEach(x => { const row = [x.rank || '', x.name, x.asm, x.z, x.r.base, x.r.comp == null ? '' : Math.round(x.r.comp * 100), x.r.totQ, x.r.plan || '']; KPI.forEach(k => row.push(...kpiRowVals(x.r, k))); aoa.push(row); });
      add(lv + ' Scorecard', aoa, [6, 24, 22, 8, 10, 10, 10, 10]);
    }
    const s = series(f, day); const t = r.k[1].t;
    add('Day-wise', [['Date', 'Units (day)', 'Value (day) ₹', 'Units MTD', 'New BP (day)', 'Billing points', 'BP % of target', 'NPD counters', 'Premium dealers', 'MBD', 'Premium share', 'Orders booked (day) ₹']].concat(s.map(o => [dLabel(o.d), o.du, Math.round(o.dv), o.units, o.newB, o.billed, t ? +(o.billed / t).toFixed(4) : '', o.npd, o.prem, +o.mbd.toFixed(2), +o.ps.toFixed(4), Math.round(o.ov)])), [12, 10, 14, 10, 10, 12, 12, 12, 14, 8, 12, 16]);
    add('Insights', [['Severity', 'Insight', 'Detail', 'Action']].concat(insightsFor(f, day).map(x => [x.sev, x.h, x.p, x.a])), [10, 60, 80, 70]);
  }
  add('Action Plan', actRows, [8, 10, 32, 16, 14, 22, 20, 9, 9, 10, 9, 7, 26, 50, 26, 50, 26, 50]);
  if (!onlyActions) {
    const ds = dayState(day), D = DB.D;
    const aoa = [['Code', 'Dealer', 'City', 'District', 'State', 'Zone', 'ASM', 'SE', 'Status', 'Category', 'MTD units', 'MTD value ₹', 'Jul–Sep avg', 'Oct plan', 'Billed', 'NPD', 'Premium units', 'Models', 'MBD target', 'Value growth vs base', 'ASP growth vs base', 'OD ₹', 'Open complaints', 'Google rating', 'GSB', 'ISB', 'PLS ≥ State', 'DPL ≥ State']];
    r.idx.forEach(i => aoa.push([D.c[i], D.n[i], D.city[i], D.dist[i], D.st[i], D.z[i], D.asm[i], D.se[i], D.s[i], D.cat[i], ds.qty[i], Math.round(ds.val[i]), D.l3[i], D.pl[i], ds.qty[i] > 0 ? 'Y' : 'N', ds.nq[i] > 0 ? 'Y' : 'N', ds.pq[i], ds.mc[i], D.mt[i], D.vg[i] == null ? '' : D.vg[i] ? 'Y' : 'N', D.ag[i] == null ? '' : D.ag[i] ? 'Y' : 'N', D.od[i], D.cp[i], D.gr[i] == null ? '' : D.gr[i], D.gsb[i] ? 'Y' : 'N', D.isb[i] ? 'Y' : 'N', D.pls[i] ? 'Y' : 'N', D.dpl[i] ? 'Y' : 'N']));
    add('Dealers', aoa, [8, 30, 14, 14, 14, 7, 20, 20, 7, 7, 9, 11, 9, 8]);
  }
  return wb;
}
async function exportXlsx(onlyActions) {
  if (!window.XLSX) { toast('The Excel library did not load — check the connection and reload.'); return; }
  const wb = buildWorkbook(onlyActions);
  const f = curF(); const nm = (onlyActions ? 'Action_Plan_' : 'SE_Tracker_') + scopeName(f).replace(/[^A-Za-z0-9]+/g, '_') + '_' + DB.maxDay + MON[DB.m - 1] + '.xlsx';
  const buf = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  if (DOWNLOADS) {
    try { await DOWNLOADS.save({ filename: nm, data: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) }); toast('Excel file saved: ' + nm); return; }
    catch (e) { if (e && e.code === 'declined') { toast('Download cancelled.'); return; } if (e && e.code === 'rate_limited') { toast('A save prompt is already open.'); return; } }
  }
  try { window.XLSX.writeFile(wb, nm); toast('Excel file downloading: ' + nm); } catch (e) { toast('This view blocks downloads. Open the dashboard file in a browser to export.'); }
}

/* ---------- upload & parse daily dump ---------- */
const H = s => String(s || '').toLowerCase().replace(/[^a-z0-9+]/g, '');
/* “RSE …” and “SE …” headers are the same column (sheets are being renamed RSE → SE) */
const seAlt = k => k.startsWith('rse') ? k.slice(1) : k.startsWith('se') ? 'r' + k : null;
function findHeader(rows, need) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) { const hs = (rows[r] || []).map(H); if (need.every(n => hs.includes(n) || hs.includes(seAlt(n)))) return r; }
  return -1;
}
function colMap(row) {
  const m = {}; row.forEach((h, i) => { const k = H(h); if (k && m[k] === undefined) m[k] = i; });
  for (const k of Object.keys(m)) { const a = seAlt(k); if (a && m[a] === undefined) m[a] = m[k]; }
  return m;
}
function toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  const s = String(v || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/))) return new Date(+m[3], +m[2] - 1, +m[1]);
  if ((m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ](\d{2,4})/))) { const mi = MON.findIndex(x => x.toLowerCase() === m[2].toLowerCase()); if (mi >= 0) return new Date(+(m[3].length === 2 ? '20' + m[3] : m[3]), mi, +m[1]); }
  return null;
}
const numv = v => { if (typeof v === 'number') return v; const x = parseFloat(String(v || '').replace(/,/g, '')); return isFinite(x) ? x : 0; };
const tcase = s => String(s || '').trim().toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
function parseBilling(rows) {
  const hr = findHeader(rows, ['customer', 'billdate', 'quantity']);
  if (hr < 0) throw new Error('Could not find the Cycle_Billing header row (needs Customer, Bill Date, Quantity).');
  const c = colMap(rows[hr]);
  const ci = k => c[k] !== undefined ? c[k] : -1;
  const iC = ci('customer'), iDt = ci('billdate'), iQ = ci('quantity'), iV = ci('finalvalue') >= 0 ? ci('finalvalue') : ci('amount'), iMat = ci('material'), iSM = ci('seg+model'), iSeg = ci('seg1'), iMod = ci('model'), iPr = ci('premium'),
    iNm = ci('customername'), iCity = ci('city'), iZ = ci('zone'), iAsm = ci('asmname'), iRse = ci('rsecode'), iSt = ci('regdesc');
  let maxD = null; const recs = [];
  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue; const code = Math.round(numv(row[iC])); if (!code) continue;
    const dt = toDate(row[iDt]); if (!dt) continue; const q = numv(row[iQ]); const v = iV >= 0 ? numv(row[iV]) : 0;
    if (!maxD || dt > maxD) maxD = dt; recs.push([row, code, dt, q, v]);
  }
  if (!recs.length) throw new Error('No billing rows with a dealer code and bill date were found.');
  const y = maxD.getFullYear(), m = maxD.getMonth();
  const models = [], mIdx = new Map(), mLab = []; const agg = new Map(); const newDealers = []; const seen = new Set();
  const npd = DB.npd; let lines = 0;
  // working copy of code index (seed dealers + new ones)
  const base = buildDB(SEED); const codeIdx = new Map(base.codeIdx); let nextIdx = base.n;
  for (const [row, code, dt, q, v] of recs) {
    if (dt.getFullYear() !== y || dt.getMonth() !== m) continue;
    lines++;
    let di = codeIdx.get(code);
    if (di === undefined) {
      const se = base.seByCode.get(Math.round(numv(row[iRse]))) || '';
      di = nextIdx++; codeIdx.set(code, di);
      newDealers.push({ c: code, n: tcase(row[iNm]), city: tcase(row[iCity]), st: tcase(row[iSt]), z: tcase(row[iZ]), asm: tcase(row[iAsm]), se });
    }
    let mk = iSM >= 0 ? String(row[iSM] || '').trim() : '';
    const mname = iMod >= 0 ? String(row[iMod] || '').trim() : '';
    if (!mk) mk = (iSeg >= 0 ? String(row[iSeg] || '') : '') + mname;
    if (!mk) mk = String(row[iMat] || '');
    let mi = mIdx.get(mk); if (mi === undefined) { mi = models.length; models.push(mk); mLab.push(mname || mk); mIdx.set(mk, mi); }
    let prem = 0;
    if (iPr >= 0 && String(row[iPr]).trim() !== '') prem = String(row[iPr]).trim().toUpperCase() === 'Y' ? 1 : 0;
    else { const unit = q ? v / q : 0; const seg = iSeg >= 0 ? String(row[iSeg]).toUpperCase() : ''; prem = (seg === 'KIDS' ? unit > 3500 : unit > 5600) ? 1 : 0; }
    const isN = npd.has(String(row[iMat] || '').trim()) ? 1 : 0;
    const key = di + '|' + dt.getDate() + '|' + mi + '|' + prem + '|' + isN;
    const a = agg.get(key); if (a) { a[3] += q; a[4] += v; } else agg.set(key, [di, dt.getDate(), mi, q, v, prem, isN]);
  }
  const facts = []; for (const a of agg.values()) { if (a[3] === 0 && a[4] === 0) continue; a[3] = Math.round(a[3]); a[4] = Math.round(a[4]); facts.push(a); }
  // pick the max date within the chosen month
  let md = 0; for (const f of facts) if (f[1] > md) md = f[1];
  const asOf = `${y}-${String(m + 1).padStart(2, '0')}-${String(md).padStart(2, '0')}`;
  return { asOf, month: `${y}-${String(m + 1).padStart(2, '0')}`, models, modelLabel: mLab, facts, newDealers, codeIdx, lines };
}
function parseOrders(rows, codeIdx, month) {
  const hr = findHeader(rows, ['dealer', 'ordervalue']); if (hr < 0) return null;
  const c = colMap(rows[hr]); const g = k => c[k] !== undefined ? c[k] : -1;
  const iD = g('dealer'), iDt = g('date') >= 0 ? g('date') : g('sodate'), iOV = g('ordervalue'), iBal = g('balanceorderval'), iFc = g('fullycancell'), iR = g('reason'), iMod = g('model');
  const agg = new Map(); const rej = new Map();
  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue; const code = Math.round(numv(row[iD])); if (!code) continue; const di = codeIdx.get(code); if (di === undefined) continue;
    const dt = toDate(row[iDt]); if (!dt) continue; const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; if (mk !== month) continue;
    const ov = numv(row[iOV]), bal = iBal >= 0 ? numv(row[iBal]) : 0, canc = iFc >= 0 && String(row[iFc]).trim().toUpperCase() === 'Y';
    const reason = iR >= 0 ? String(row[iR] || '') : ''; const inv = /invent|material not avail/i.test(reason);
    const key = di + '|' + dt.getDate(); const a = agg.get(key) || [di, dt.getDate(), 0, 0, 0];
    a[2] += ov; if (!canc) a[3] += bal; if (canc && inv) { a[4] += bal; const md = iMod >= 0 ? String(row[iMod] || '').trim() : '-'; rej.set(md, (rej.get(md) || 0) + bal); }
    agg.set(key, a);
  }
  const orders = [...agg.values()].map(a => [a[0], a[1], Math.round(a[2]), Math.round(a[3]), Math.round(a[4])]);
  return { orders, rejModels: [...rej].sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => [x[0], Math.round(x[1])]) };
}
async function handleFile(file) {
  if (/\.json$/i.test(file.name)) return handlePack(file);
  const prog = $('#upProg');
  if (!window.XLSX) { prog.textContent = 'The Excel reader did not load. Check the connection and reload the page.'; return; }
  prog.textContent = `Reading ${file.name} (${(file.size / 1048576).toFixed(1)} MB)…`;
  await new Promise(r => setTimeout(r, 30));
  try {
    const buf = await file.arrayBuffer(); const XL = window.XLSX; let billRows, ordRows = null;
    if (/\.csv$/i.test(file.name)) {
      // raw: keep CSV cells as text so toDate() reads dd.mm.yyyy / dd-Mon-yy itself (SheetJS guesses month-first)
      const wb = XL.read(new TextDecoder().decode(buf), { type: 'string', raw: true, dense: true });
      billRows = XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    } else {
      const names = XL.read(buf, { type: 'array', bookSheets: true }).SheetNames;
      if (isMasterWorkbook(names)) return handleMaster(buf, file.name);   // SE Evaluation master workbook → whole data set
      const bName = names.find(n => /cycle.?billing/i.test(n)) || names.find(n => /billing/i.test(n)) || names[0];
      const oName = names.find(n => /cycle.?order/i.test(n));
      prog.textContent = `Parsing sheet “${bName}”${oName ? ` and “${oName}”` : ''}… this can take 10–20 seconds for a full dump.`;
      await new Promise(r => setTimeout(r, 30));
      const wb = XL.read(buf, { type: 'array', sheets: oName ? [bName, oName] : [bName], dense: true, cellDates: true });
      billRows = XL.utils.sheet_to_json(wb.Sheets[bName], { header: 1, raw: true, defval: '' });
      if (oName && wb.Sheets[oName]) ordRows = XL.utils.sheet_to_json(wb.Sheets[oName], { header: 1, raw: true, defval: '' });
    }
    prog.textContent = `Building the dashboard from ${fN(billRows.length)} rows…`;
    await new Promise(r => setTimeout(r, 20));
    const b = parseBilling(billRows);
    const o = ordRows ? parseOrders(ordRows, b.codeIdx, b.month) : null;
    const up = { asOf: b.asOf, month: b.month, models: b.models, modelLabel: b.modelLabel, facts: b.facts, newDealers: b.newDealers, orders: o ? o.orders : [], rejModels: o ? o.rejModels : [], fileName: file.name, lines: b.lines, at: new Date().toISOString() };
    DB = buildDB(SEED, up); ST.day = DB.maxDay;
    const saved = store.set(UPKEY, JSON.stringify(up));
    renderAll();
    $('#upOverlay').hidden = true;
    toast(`Dashboard updated to ${dLabel(DB.maxDay)} · ${fN(b.lines)} billing lines${o ? '' : ' · no Cycle_Order sheet found'}${saved ? '' : ' · not saved in this browser'}`, 5200);
  } catch (e) {
    console.error(e); prog.textContent = 'Could not read this file: ' + (e && e.message ? e.message : e);
  }
}

/* ================= wiring ================= */
function setTab(t) {
  ST.tab = t; $$('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $$('main > section.view').forEach(s => s.hidden = s.id !== 'v-' + t);
  try { if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t); } catch (e) {}
}
function renderAll() {
  renderHeader(); renderFilters();
  renderOverview();
  const t = ST.tab;
  if (t === 'leaderboard') renderLeaderboard();
  if (t === 'daywise') renderDaywise();
  renderActions();
  if (t === 'dealers') renderDealers();
  if (t === 'method') renderMethod();
  renderTab(t);
}
/* ---------- Back: every page / person / filter change made by navigating is remembered; the Back button (and the phone's back key) returns to it ---------- */
const NAVBACK = []; let navRestoring = false, navLast = 0;
function navSnap() { return { tab: ST.tab, f: { rsm: ST.rsm, zone: ST.zone, asm: ST.asm, se: ST.se, st: ST.st, dist: ST.dist, cat: ST.cat }, asmSel: ST.asmSel, rseSel: ST.rseSel, y: window.scrollY }; }
function navPush() {
  if (!window.__navReady || navRestoring || Date.now() - navLast < 80) return; navLast = Date.now();
  NAVBACK.push(navSnap()); if (NAVBACK.length > 30) NAVBACK.shift();
  try { history.pushState({ djpBack: NAVBACK.length }, '', location.hash); } catch (e) {}
  navBtn();
}
function navBtn() { const b = $('#btnBack'); if (b) b.hidden = !NAVBACK.length; }
function navBack() {
  const s = NAVBACK.pop(); navBtn(); if (!s) return;
  navRestoring = true;
  try { Object.assign(ST, s.f, { asmSel: s.asmSel, rseSel: s.rseSel }); renderAll(); onTab(s.tab); } finally { navRestoring = false; }
  setTimeout(() => window.scrollTo(0, s.y || 0), 40);
}
window.addEventListener('popstate', () => { if (NAVBACK.length) navBack(); });
function onTab(t) { if (t !== ST.tab) navPush(); setTab(t); if (t === 'leaderboard') renderLeaderboard(); if (t === 'daywise') renderDaywise(); if (t === 'dealers') renderDealers(); if (t === 'method') renderMethod(); renderTab(t); }

function boot() {
  let up = null; try { up = JSON.parse(store.get(UPKEY) || 'null'); } catch (e) { up = null; }
  if (up && up.asOf && up.asOf < SEED.meta.asOf) up = null;   // built-in data is newer
  try { DB = buildDB(SEED, up); } catch (e) { console.error(e); store.del(UPKEY); DB = buildDB(SEED); }
  ST.day = DB.maxDay;
  const h = (location.hash || '').slice(1); setTab(TABS.includes(h) ? h : 'home');
  $$('.tab').forEach(b => b.onclick = () => onTab(b.dataset.tab));
  $('#fZone').onchange = e => { ST.zone = e.target.value; ST.asm = ''; ST.se = ''; renderAll(); };
  $('#fAsm').onchange = e => { ST.asm = e.target.value; ST.se = ''; if (ST.asm) { const a = DB.asms.find(x => x.n === ST.asm); if (a) ST.zone = a.z; } renderAll(); };
  $('#fSe').onchange = e => { ST.se = e.target.value; if (ST.se) { const s = DB.seInfo.get(ST.se); if (s) { ST.asm = s.asm; ST.zone = s.z; } } renderAll(); };
  $('#fSt').onchange = e => { ST.st = e.target.value; ST.dist = ''; renderAll(); };
  if ($('#fRsm')) $('#fRsm').onchange = e => { ST.rsm = e.target.value; ST.zone = ''; ST.asm = ''; ST.se = ''; renderAll(); };
  if ($('#fDist')) $('#fDist').onchange = e => { ST.dist = e.target.value; renderAll(); };
  $('#fCat').onchange = e => { ST.cat = e.target.value; renderAll(); };
  let dt; $('#fDay').oninput = e => { ST.day = +e.target.value; $('#dLab').textContent = dLabel(ST.day); clearTimeout(dt); dt = setTimeout(renderAll, 120); };
  $('#dPrev').onclick = () => { if (ST.day > 1) { ST.day--; renderAll(); } };
  $('#dNext').onclick = () => { if (ST.day < DB.maxDay) { ST.day++; renderAll(); } };
  $('#btnReset').onclick = () => { Object.assign(ST, { rsm: '', zone: '', asm: '', se: '', st: '', dist: '', cat: '', day: DB.maxDay, apAll: false, dAll: false }); renderAll(); };
  $$('[data-lb]').forEach(b => b.onclick = () => { ST.lb = b.dataset.lb; store.set('tracker16.ui', JSON.stringify({ lb: ST.lb })); renderLeaderboard(); });
  $$('[data-ds]').forEach(b => b.onclick = () => { ST.ds = b.dataset.ds; ST.dAll = false; renderDealers(); });
  let sq; $('#dSearch').oninput = e => { ST.dq = e.target.value; clearTimeout(sq); sq = setTimeout(renderDealers, 150); };
  $('#dMore').onclick = () => { ST.dAll = true; renderDealers(); };
  $('#apMore').onclick = () => { ST.apAll = true; renderActions(); };
  $('#btnExport').onclick = () => exportXlsx(false);
  $('#apXls').onclick = () => exportXlsx(true);
  $('#waCopy').onclick = async () => { const t = $('#waText').textContent; try { await navigator.clipboard.writeText(t); toast('Action plan copied — paste it into WhatsApp.'); } catch (e) { const rg = document.createRange(); rg.selectNodeContents($('#waText')); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); toast('Text selected — press Ctrl+C / Cmd+C to copy.'); } };
  $('#btnAI').onclick = runAI;
  $('#btnUpload').onclick = () => { $('#upProg').textContent = ''; $('#upOverlay').hidden = false; };
  $('#upClose').onclick = () => $('#upOverlay').hidden = true;
  $('#upOverlay').addEventListener('click', e => { if (e.target.id === 'upOverlay') $('#upOverlay').hidden = true; });
  $('#fileIn').onchange = e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; };
  const dz = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#upOverlay').hidden = true; });
  renderAll();
  initCaps();
}

