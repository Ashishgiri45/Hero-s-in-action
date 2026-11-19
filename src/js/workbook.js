'use strict';
/* ================= master workbook → data =================
   Builds the dashboard's whole data set from ONE file: the "SE Evaluation Dashboard - MMM-YY.xlsx"
   master workbook. Sheets read (by name, any order):
     Dealer master            dealer list, zone / ASM / SE mapping, status, category
     Billing                  Cycle_Billing lines → daily units, value, models, NPD, premium
     Dealer_Vol1              Jul–Sep units (MBD/plan fall-backs), OD amount, open complaints
     Dealer_Val1              value-growth and ASP-growth flags for the month (H_ValGrew / H_ASPGrew)
     Dealer-MBD1              model target per dealer
     GSB & ISB, google rating, DPL - PLS, NPD SKU List
     MTD DJP SUMMARY MONTH WISE   DJP planned vs made visits, productive calls (ASM and SE)
     Dashboard SE / ASM       official targets, orders, billing (older files: “Dashboard RSE”; RSE and SE headers are both read)
     Secondary + Index        sub-dealer billing points per distributor
     KPI Config               month, as-of date, SE / ASM roster
     <any sheet with "Plan" in its name>  optional dealer-wise volume plan (Dealer Code + Plan/Target)
   The dealer-wise volume plan is not part of the SE Evaluation workbook. Without a plan sheet the
   plan already loaded for the same month is kept; otherwise targets show "No target". */

const WB_SHEETS = ['Dealer master', 'Billing', 'Dealer_Vol1', 'Dealer_Val1', 'Dealer-MBD1', 'GSB & ISB', 'google rating', 'DPL - PLS', 'NPD SKU List', 'KPI Config', 'MTD DJP SUMMARY MONTH WISE', 'Secondary', 'Index', 'Contacts', 'Dashboard SE', 'Dashboard ASM', 'Date ASM Wise Billing'];
const isMasterWorkbook = names => names.some(n => H(n) === 'dealermaster') && names.some(n => H(n) === 'billing');
/* yield so progress text can paint; a MessageChannel is not slowed down when the tab is in the background */
const tick = () => new Promise(r => { if (!document.hidden) return setTimeout(r, 30); const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
const MONL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const serialYM = v => { const d = toDate(v); return d ? [d.getFullYear(), d.getMonth()] : null; };

async function packFromWorkbook(buf, fileName, say) {
  const XL = window.XLSX;
  const names = XL.read(buf, { type: 'array', bookSheets: true }).SheetNames;
  const seN = s => H(s).replace(/rse/g, 'se');   // “Dashboard RSE” = “Dashboard SE”
  const pick = w => names.find(n => H(n) === H(w)) || names.find(n => seN(n) === seN(w));
  const planName = names.find(n => /plan/i.test(n) && !/djp|summary|journey/i.test(n));
  const monthSheets = { asm: names.find(n => isMonthSheet(n) && /^asm/i.test(n.trim())), se: names.find(n => isMonthSheet(n) && /^(rse|se)\b/i.test(n.trim())) };
  const pjpSheets = names.filter(isPjpSheet), fieldSheets = names.filter(isFieldSheet), orderSheet = names.find(n => /cycle.?order/i.test(n));
  const contestSheets = { tracker: names.find(n => /display.*contest.*se.?tracker/i.test(n)), rules: names.find(n => /rules.*display|display.*rules/i.test(n)) };
  const want = WB_SHEETS.map(pick).filter(Boolean).concat(planName ? [planName] : [], Object.values(monthSheets).filter(Boolean), pjpSheets, fieldSheets, orderSheet ? [orderSheet] : [], Object.values(contestSheets).filter(Boolean));
  for (const need of ['Dealer master', 'Billing']) if (!pick(need)) throw new Error(`The workbook has no “${need}” sheet.`);
  say(`Reading ${want.length} sheets from ${fileName} — about 20–60 seconds for a 30 MB file…`); await tick();
  const wb = XL.read(buf, { type: 'array', sheets: want, dense: true });
  const rows = w => { const n = typeof w === 'string' && wb.Sheets[w] ? w : pick(w); return n && wb.Sheets[n] ? XL.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) : null; };
  const warn = [];
  const T = s => s == null ? '' : String(s).trim();
  const code = v => { const x = Math.round(numv(v)); return x > 0 ? x : 0; };

  /* ---- period: KPI Config, else latest billing month ---- */
  say('Reading KPI Config and dealer master…'); await tick();
  const cfg = rows('KPI Config') || [];
  const cfgVal = label => { for (const r of cfg) { if (!r) continue; const i = r.findIndex(c => typeof c === 'string' && c.startsWith(label)); if (i >= 0) return r[i + 1]; } return null; };
  let ym = serialYM(cfgVal('Current Month Start'));

  /* ---- dealer master ---- */
  const dm = rows('Dealer master'); const dh = findHeader(dm, ['code', 'dealername']);
  if (dh < 0) throw new Error('Dealer master: header row with “Code” and “Dealer Name” not found.');
  const c = colMap(dm[dh]), g = (r, k) => c[k] !== undefined ? r[c[k]] : null;
  const D = { c: [], n: [], city: [], dist: [], st: [], z: [], asm: [], se: [], s: [], cat: [], club: [], vg: [], ag: [], mt: [], l3: [], od: [], cp: [], gr: [], gsb: [], isb: [], pls: [], dpl: [], pl: [] };
  const idx = new Map(), rseCodes = new Map();
  const add = o => { const i = D.c.length; for (const k in D) D[k].push(o[k] !== undefined ? o[k] : null); idx.set(o.c, i); return i; };
  for (let i = dh + 1; i < dm.length; i++) {
    const r = dm[i]; if (!r) continue; const cd = code(g(r, 'code')); if (!cd || idx.has(cd)) continue;
    const st = T(g(r, 'activeinactive')).toLowerCase(), se = T(g(r, 'rse'));
    const rse = se && se !== '-' && !/^0$/.test(se) ? se : '';
    if (rse && g(r, 'rsecode')) rseCodes.set(rse, code(g(r, 'rsecode')));
    add({ c: cd, n: T(g(r, 'dealername')), city: T(g(r, 'city')), dist: T(g(r, 'district')), st: T(g(r, 'state')), z: tcase(g(r, 'zone')), asm: T(g(r, 'asmname')), se: rse,
      s: st.startsWith('active') ? 'A' : st.startsWith('inactive') ? 'I' : 'C', cat: T(g(r, 'category')) || '-', club: code(g(r, 'clubcode')) || cd,
      vg: null, ag: null, mt: 7, l3: 0, od: 0, cp: 0, gr: null, gsb: 0, isb: 0, pls: 0, dpl: 0, pl: 0 });
  }
  if (!D.c.length) throw new Error('Dealer master has no dealer rows.');

  /* ---- billing → facts ---- */
  say(`Reading Billing (${fN(D.c.length)} dealers in the master)…`); await tick();
  const bl = rows('Billing'); const bh = findHeader(bl, ['customer', 'billdate', 'quantity']);
  if (bh < 0) throw new Error('Billing: header row with Customer, Bill Date, Quantity not found.');
  const b = colMap(bl[bh]), bi = k => b[k] !== undefined ? b[k] : -1;
  const iC = bi('customer'), iDt = bi('billdate'), iQ = bi('quantity'), iV = bi('finalvalue') >= 0 ? bi('finalvalue') : bi('amount'), iMat = bi('material'), iSM = bi('seg+model'), iSeg = bi('seg1'), iMod = bi('model'), iPr = bi('premium'), iNpd = bi('npd'),
    iNm = bi('customername'), iCity = bi('city'), iZ = bi('zone'), iAsm = bi('asmname'), iRse = bi('rsecode'), iSt = bi('regdesc');
  if (!ym) { let mx = null; for (let i = bh + 1; i < bl.length; i++) { const r = bl[i]; const d = r && toDate(r[iDt]); if (d && (!mx || d > mx)) mx = d; } if (mx) ym = [mx.getFullYear(), mx.getMonth()]; }
  if (!ym) throw new Error('Could not work out the month (KPI Config “Current Month Start” or Billing dates).');
  const [Y, M] = ym, month = `${Y}-${String(M + 1).padStart(2, '0')}`, monLbl = `${MON[M]}-${String(Y).slice(2)}`;
  const npdSheet = rows('NPD SKU List') || []; const npd = [];
  for (let i = 1; i < npdSheet.length; i++) { const v = T((npdSheet[i] || [])[0]); if (v && /^[A-Z0-9]{8,}$/i.test(v)) npd.push(v); }
  const npdSet = new Set(npd), seByCode = new Map([...rseCodes].map(([n, cd]) => [cd, n]));
  const models = [], mIdx = new Map(), mLab = [], agg = new Map(); let lines = 0, maxDay = 0, added = 0;
  for (let i = bh + 1; i < bl.length; i++) {
    const r = bl[i]; if (!r) continue; const cd = code(r[iC]); if (!cd) continue;
    const dt = toDate(r[iDt]); if (!dt || dt.getFullYear() !== Y || dt.getMonth() !== M) continue;
    const q = numv(r[iQ]), v = iV >= 0 ? numv(r[iV]) : 0; lines++;
    let di = idx.get(cd);
    if (di === undefined) { di = add({ c: cd, n: tcase(iNm >= 0 ? r[iNm] : 'Dealer ' + cd), city: tcase(iCity >= 0 ? r[iCity] : ''), dist: '', st: tcase(iSt >= 0 ? r[iSt] : ''), z: tcase(iZ >= 0 ? r[iZ] : ''), asm: tcase(iAsm >= 0 ? r[iAsm] : ''), se: seByCode.get(code(iRse >= 0 ? r[iRse] : 0)) || '', s: 'A', cat: '-', club: cd, vg: null, ag: null, mt: 7, l3: 0, od: 0, cp: 0, gr: null, gsb: 0, isb: 0, pls: 0, dpl: 0, pl: 0 }); added++; }
    const mname = iMod >= 0 ? T(r[iMod]) : ''; let mk = iSM >= 0 ? T(r[iSM]) : ''; if (!mk) mk = (iSeg >= 0 ? T(r[iSeg]) : '') + mname; if (!mk) mk = iMat >= 0 ? T(r[iMat]) : '-';
    let mi = mIdx.get(mk); if (mi === undefined) { mi = models.length; models.push(mk); mLab.push(mname || mk); mIdx.set(mk, mi); }
    let prem = 0;
    if (iPr >= 0 && T(r[iPr]) !== '') prem = T(r[iPr]).toUpperCase() === 'Y' ? 1 : 0;
    else { const unit = q ? v / q : 0, seg = iSeg >= 0 ? T(r[iSeg]).toUpperCase() : ''; prem = (seg === 'KIDS' ? unit > 3500 : unit > 5600) ? 1 : 0; }
    const isN = iNpd >= 0 && T(r[iNpd]) !== '' ? (/^(y|yes|1)$/i.test(T(r[iNpd])) ? 1 : 0) : npdSet.has(iMat >= 0 ? T(r[iMat]) : '') ? 1 : 0;
    const day = dt.getDate(); if (day > maxDay) maxDay = day;
    const key = di + '|' + day + '|' + mi + '|' + prem + '|' + isN, a = agg.get(key);
    if (a) { a[3] += q; a[4] += v; } else agg.set(key, [di, day, mi, q, v, prem, isN]);
  }
  const facts = []; for (const a of agg.values()) { if (a[3] === 0 && a[4] === 0) continue; a[3] = Math.round(a[3]); a[4] = Math.round(a[4]); facts.push(a); }
  if (!facts.length) throw new Error(`Billing has no lines for ${MON[M]} ${Y}.`);
  if (added) warn.push(`${added} billed dealers were not in the Dealer master and were added from Billing.`);

  /* ---- dealer KPI inputs ---- */
  say('Reading MIS, OD, complaints, rating, branding…'); await tick();
  const byDealer = (w, need, fn) => { const rs = rows(w); if (!rs) { warn.push(`Sheet “${w}” not found — its KPI shows no data.`); return; } const h = findHeader(rs, need); if (h < 0) { warn.push(`Sheet “${w}”: header not found.`); return; } const m = colMap(rs[h]); for (let i = h + 1; i < rs.length; i++) { const r = rs[i]; if (!r) continue; const di = idx.get(code(r[m[need[0]]])); if (di !== undefined) fn(di, r, m, rs[h]); } };
  // Dealer_Vol1: Jul–Sep style average of the 3 months before the current one, OD amount, open complaints
  const inVol = new Set(); let volGsb = false;
  byDealer('Dealer_Vol1', ['dealercode'], (di, r, m, hdr) => {
    inVol.add(di);
    if (!byDealer.l3cols) { byDealer.l3cols = []; hdr.forEach((h, j) => { const d = typeof h === 'number' ? toDate(h) : null; if (d) { const k = (Y * 12 + M) - (d.getFullYear() * 12 + d.getMonth()); if (k >= 1 && k <= 3) byDealer.l3cols.push(j); } }); }
    const cols = byDealer.l3cols; if (cols.length) D.l3[di] = Math.round(cols.reduce((s, j) => s + numv(r[j]), 0) / cols.length * 10) / 10;
    // the workbook's KPIs take Active status and the SE from Dealer_Vol1 (KPI Config: COUNTIFS(Dealer_Vol1!J,"Active",C,SE))
    if (m.activeinactive !== undefined && T(r[m.activeinactive])) { const st = T(r[m.activeinactive]).toLowerCase(); D.s[di] = st.startsWith('active') ? 'A' : st.startsWith('inactive') ? 'I' : 'C'; }
    if (m.rsedse !== undefined) { const se = T(r[m.rsedse]); if (se && se !== '-' && !/not found/i.test(se)) D.se[di] = se; }
    if (m.od !== undefined) D.od[di] = Math.max(0, Math.round(numv(r[m.od])));
    if (m.gsb !== undefined) { volGsb = true; D.gsb[di] = /^y/i.test(T(r[m.gsb])) ? 1 : 0; }
    if (m.isb !== undefined) { volGsb = true; D.isb[di] = /^y/i.test(T(r[m.isb])) ? 1 : 0; }
    if (m.activecomplaint !== undefined) D.cp[di] = Math.max(0, Math.round(numv(r[m.activecomplaint])));
  });
  if (inVol.size) {   // as in the workbook: a dealer missing from Dealer_Vol1 is not in any KPI base
    let n = 0, na = 0; for (let i = 0; i < D.c.length; i++) if (!inVol.has(i)) { if (D.s[i] === 'A') na++; D.s[i] = 'N'; n++; }
    if (n) warn.push(`${n} dealers (${na} of them Active in Dealer master) are not in Dealer_Vol1; like the workbook, they are left out of the KPI counts — their units still count in volume (status “Not in Dealer_Vol1”).`);
  }
  const vgK = H('H_ValGrew ' + monLbl), agK = H('H_ASPGrew ' + monLbl);
  byDealer('Dealer_Val1', ['dealercode'], (di, r, m) => {
    if (m[vgK] !== undefined && r[m[vgK]] !== null && r[m[vgK]] !== '') D.vg[di] = numv(r[m[vgK]]) > 0 ? 1 : 0;
    if (m[agK] !== undefined && r[m[agK]] !== null && r[m[agK]] !== '') D.ag[di] = numv(r[m[agK]]) > 0 ? 1 : 0;
  });
  // model target: only dealers listed in Dealer-MBD1 carry one (the workbook averages over these)
  if (rows('Dealer-MBD1')) for (let i = 0; i < D.c.length; i++) D.mt[i] = null;
  byDealer('Dealer-MBD1', ['dealercode', 'target'], (di, r, m) => { const t = numv(r[m.target]); if (t > 0) D.mt[di] = t; });
  // GSB / ISB: Dealer_Vol1 columns (what the workbook's KPIs use); the “GSB & ISB” sheet only if those are missing
  if (!volGsb) byDealer('GSB & ISB', ['dealercode', 'gsb', 'isb'], (di, r, m) => { if (/^y/i.test(T(r[m.gsb]))) D.gsb[di] = 1; if (/^y/i.test(T(r[m.isb]))) D.isb[di] = 1; });
  byDealer('google rating', ['dealercodenum', 'averagerating'], (di, r, m) => { const v = numv(r[m.averagerating]); if (v > 0) D.gr[di] = v; });
  byDealer('DPL - PLS', ['dealercode', 'plsdist>=state', 'dpldist>=state'].map(H), (di, r, m) => {
    const sales = m.fy2627ytdsales !== undefined ? numv(r[m.fy2627ytdsales]) : 1;
    if (numv(r[m[H('PLS Dist >= State?')]]) === 1 && sales > 0) D.pls[di] = 1;
    if (numv(r[m[H('DPL Dist >= State?')]]) === 1 && sales > 0) D.dpl[di] = 1;
  });

  /* ---- volume plan (optional) ---- */
  let planSrc = 'none';
  if (planName) {
    const pr = rows(planName); const ph = pr ? pr.findIndex((r, i) => i < 15 && r && r.some(h => /dealer\s*code|^code$/i.test(T(h)))) : -1;
    if (ph >= 0) {
      const hdr = pr[ph].map(T), ci = hdr.findIndex(h => /dealer\s*code|^code$/i.test(h)), pi = hdr.findIndex(h => /plan|target|qty|volume/i.test(h) && !/code/i.test(h));
      let n = 0; if (ci >= 0 && pi >= 0) for (let i = ph + 1; i < pr.length; i++) { const r = pr[i]; if (!r) continue; const di = idx.get(code(r[ci])); if (di !== undefined) { D.pl[di] = Math.max(0, Math.round(numv(r[pi]))); n++; } }
      if (n) planSrc = `sheet “${planName}” (${n} dealers)`; else warn.push(`Sheet “${planName}” found, but no Dealer Code + Plan columns matched.`);
    }
  }
  if (planSrc === 'none') {
    const prev = [SEED, (() => { try { return JSON.parse(store.get(PACK_KEY) || 'null'); } catch (e) { return null; } })()].find(p => p && p.meta && p.meta.month === month && p.dealers && p.dealers.pl);
    if (prev) { let n = 0; prev.dealers.c.forEach((cd, j) => { const di = idx.get(cd); if (di !== undefined && prev.dealers.pl[j]) { D.pl[di] = prev.dealers.pl[j]; n++; } }); if (n) planSrc = `kept from the ${month} plan already loaded (${n} dealers)`; }
  }
  if (planSrc === 'none') warn.push(`No dealer-wise volume plan for ${MON[M]} ${Y}: add a sheet named “Volume Plan” with columns Dealer Code and Plan. Until then volume targets show “No target”.`);

  /* ---- roster: SEs / ASMs ---- */
  say('Reading DJP summary and roster…'); await tick();
  const ses = new Map(), asms = new Map();
  const rh = cfg.findIndex(r => r && r.some(h => H(h) === 'seroster'));
  if (rh >= 0) { const m = colMap(cfg[rh]); for (let i = rh + 1; i < cfg.length; i++) { const r = cfg[i]; if (!r) continue; const n = T(r[m.seroster]); if (n && !ses.has(n)) ses.set(n, { n, asm: T(r[m.seasm]), z: tcase(r[m.sezone]) }); const a = T(r[m.asmroster]); if (a && !asms.has(a)) asms.set(a, { n: a, z: tcase(r[m.asmzone]) }); } }
  for (let i = 0; i < D.c.length; i++) {
    if (D.asm[i] && !asms.has(D.asm[i])) asms.set(D.asm[i], { n: D.asm[i], z: D.z[i] });
    if (D.se[i] && !ses.has(D.se[i])) ses.set(D.se[i], { n: D.se[i], asm: D.asm[i], z: D.z[i] });
  }
  for (const s of ses.values()) { s.code = rseCodes.get(s.n) || null; s.act = 0; }
  for (let i = 0; i < D.c.length; i++) { const s = ses.get(D.se[i]); if (s && D.s[i] === 'A') s.act++; }

  /* ---- DJP (journey plan): current month block ---- */
  const pjpSE = {}, pjpASM = {}; const dj = rows('MTD DJP SUMMARY MONTH WISE');
  if (dj) {
    const mName = MONL[M]; let aCol = -1, rCol = -1;
    for (let ri = 0; ri < 4 && (aCol < 0 || rCol < 0); ri++) (dj[ri] || []).forEach((v, j) => { const s = T(v).toUpperCase(); if (s.includes(mName) && s.includes(String(Y)) || s.startsWith(mName)) { if (/ASM WISE/.test(s) && !/\bR?SE WISE/.test(s)) aCol = j; if (/\bR?SE WISE/.test(s) && !/ASM WISE/.test(s)) rCol = j; } });
    // fallback: block titles missing or shifted (seen in the Nov-26 file) — find blocks by a “Start Date” cell dated this month, then tell ASM / SE apart by the header row
    if (aCol < 0 || rCol < 0) {
      const inMonth = v => { const d = v instanceof Date ? v : typeof v === 'number' && v > 20000 ? new Date(Date.UTC(1899, 11, 30) + v * 864e5) : null; return d && d.getUTCFullYear() === Y && d.getUTCMonth() === M; };
      for (let ri = 0; ri < 8; ri++) (dj[ri] || []).forEach((v, j) => {
        if (T(v).toLowerCase() !== 'start date' || !inMonth((dj[ri] || [])[j + 1])) return;
        const hr = dj.findIndex((r, i) => i > ri && i < ri + 8 && r && T(r[j]).toLowerCase() === 'zone'); if (hr < 0) return;
        const hs = (dj[hr] || []).slice(j, j + 15).map(H);
        if (hs.includes('sename') || hs.includes('rsename')) { if (rCol < 0) rCol = j; } else if (hs.includes('asmname') && aCol < 0) aCol = j;
      });
      // SE block with no dated Start Date: it sits just right of this month's ASM block (every month is laid out ASM | SE)
      if (rCol < 0 && aCol >= 0) for (let ri = 0; ri < 12 && rCol < 0; ri++) for (let j = aCol + 1; j <= aCol + 20 && rCol < 0; j++)
        if (T((dj[ri] || [])[j]).toLowerCase() === 'zone') { const hs = (dj[ri] || []).slice(j, j + 15).map(H); if (hs.includes('sename') || hs.includes('rsename')) rCol = j; }
    }
    const readBlock = (start, nameHdr, out) => {
      if (start < 0) return 0; const hr = dj.findIndex((r, i) => i < 12 && r && T(r[start]).toLowerCase() === 'zone'); if (hr < 0) return 0;
      const hm = {}; for (let j = start; j < start + 15; j++) { const h = H(dj[hr][j]); if (h && hm[h] === undefined) hm[h] = j; }
      if (hm[nameHdr] === undefined && nameHdr === 'rsename' && hm.sename !== undefined) nameHdr = 'sename';   // newer blocks say “SE Name”
      let n = 0; for (let i = hr + 1; i < dj.length; i++) { const r = dj[i]; if (!r) continue; const nm = T(r[hm[nameHdr]]); if (!nm || /total/i.test(T(r[start]))) continue;
        out[nm] = { p: numv(r[hm.mtdplan]), a: numv(r[hm.mtdacht]), pc: numv(r[hm.productivecalls]) }; n++; }
      return n;
    };
    const na = readBlock(aCol, 'asmname', pjpASM), nr = readBlock(rCol, 'rsename', pjpSE);
    if (!nr) warn.push(`DJP summary: no ${MON[M]} SE block found — DJP visits show no data.`);
    else for (const [n, x] of Object.entries(pjpSE)) if (!ses.has(n)) warn.push(`DJP summary lists “${n}”, who is not in the roster or dealer master.`);
    void na;
  } else warn.push('Sheet “MTD DJP SUMMARY MONTH WISE” not found — DJP visits show no data.');

  /* ---- sub-dealers: the workbook's KPI 3 rule, per SE ----
     mapped  = Σ Index “Active & Approved” where Index SE = SE
     billed  = Σ Secondary “Billing Point” where SE (or RSE) = SE and Month = current month (same days last month for comparison) */
  say('Reading sub-dealer billing (Secondary)…'); await tick();
  const dists = []; const ix = rows('Index'), sc = rows('Secondary');
  if (ix && sc) {
    const per = new Map(); const get = se => per.get(se) || per.set(se, { m: 0, mtd: 0, lm: 0, w: [0, 0, 0, 0, 0], sq: 0, sql: 0, nd: new Set() }).get(se);
    const ih = findHeader(ix, ['distributorcode', 'se']);
    if (ih >= 0) { const im = colMap(ix[ih]); for (let i = ih + 1; i < ix.length; i++) { const r = ix[i]; if (!r) continue; const se = T(r[im.se]); if (!se || /not found/i.test(se) || se === '-') continue; const v = numv(r[im.activeapproved]); if (v > 0) { const o = get(se); o.m += v; o.nd.add(code(r[im.distributorcode])); } } }
    const sh = findHeader(sc, ['month', 'billingpoint', 'rse']);
    if (sh >= 0) {
      const sm = colMap(sc[sh]), prevLbl = `${MON[(M + 11) % 12]}-${String(M ? Y : Y - 1).slice(2)}`;
      for (let i = sh + 1; i < sc.length; i++) {
        const r = sc[i]; if (!r) continue; const se = T(r[sm.rse]); if (!se) continue; const lbl = T(r[sm.month]); const bp = numv(r[sm.billingpoint]), q = numv(r[sm.quantity]);
        if (lbl === monLbl) { const o = get(se); o.mtd += bp; o.sq += q; const wk = /W(\d)/i.exec(T(r[sm.week])); if (wk) o.w[Math.min(4, +wk[1] - 1)] += bp; }
        else if (lbl === prevLbl) { const dd = sm.salesdate !== undefined ? toDate(r[sm.salesdate]) : null; if (!dd || dd.getDate() <= maxDay) { const o = get(se); o.lm += bp; o.sql += q; } }
      }
    }
    for (const [se, o] of per) { const s = ses.get(se) || {}; if (o.m > 0) dists.push({ c: 0, n: `Distributors of ${se}`, city: '', st: '', se, asm: s.asm || '', z: s.z || '', m: o.m, w: o.w, mtd: o.mtd, lm: o.lm, sq: o.sq, sql: o.sql }); }
  } else warn.push('Sheets “Secondary” / “Index” not found — sub-dealer KPI shows no data.');

  /* ---- official SE / ASM dashboards (Dashboard SE, Dashboard ASM): targets, orders, balance, run rates ---- */
  const dash = { SE: {}, ASM: {} };
  for (const [sheet, lvl, nameH] of [['Dashboard SE', 'SE', 'sename'], ['Dashboard ASM', 'ASM', 'asmname']]) {
    const ds = rows(sheet); if (!ds) { warn.push(`Sheet “${sheet}” not found — targets fall back to the dealer-wise plan.`); continue; }
    const hr = ds.findIndex((r, i) => i < 12 && r && r.some(h => H(h) === nameH) && r.some(h => H(h) === 'target'));
    if (hr < 0) { warn.push(`Sheet “${sheet}”: header row not found.`); continue; }
    const hd = ds[hr].map(H), first = k => hd.indexOf(k), bpi = first('billingpointtarget'), mbi = first('mbdtarget');
    const g = (r, k) => { const j = first(k); return j >= 0 ? r[j] : null; };
    for (let i = hr + 1; i < ds.length; i++) {
      const r = ds[i]; if (!r) continue; let nm = T(r[first(nameH)]); if (!nm || /total/i.test(nm) || /total/i.test(T(r[0]))) continue;
      const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
      if (/^(vacant|tba)$/i.test(nm)) nm = `${/tba/i.test(nm) ? 'TBA' : 'Vacant'} – ${T(g(r, lvl === 'SE' ? 'sehq' : 'asmhq')) || T(g(r, 'asmname'))}`;   // unfilled territories, kept apart by HQ
      dash[lvl][nm] = { z: tcase(g(r, 'zone')), asm: lvl === 'SE' ? T(g(r, 'asmname')) : nm, target: num(g(r, 'target')), billVol: num(g(r, lvl === 'SE' ? 'billingvolume' : 'billingvolach')), mtdPlan: num(g(r, 'mtdplan')), orderAch: num(g(r, 'mtdorderach')),
        balance: num(g(r, 'balance')), curRR: num(g(r, 'currentrunrate')), reqRR: num(g(r, 'requiredrunrate')), dayPunch: num(g(r, 'daypunching')), dayBill: num(g(r, 'daybilling')),
        bpT: bpi >= 0 ? num(r[bpi]) : null, bpA: bpi >= 0 ? num(r[bpi + 1]) : null, mbdT: mbi >= 0 ? num(r[mbi]) : null, mbdA: mbi >= 0 ? num(r[mbi + 1]) : null,
        code: num(g(r, lvl === 'SE' ? 'secode' : 'asmcode')), hq: T(g(r, lvl === 'SE' ? 'sehq' : 'asmhq')),
        open: num(g(r, 'openordercm+lm')), cancel: num(g(r, lvl === 'SE' ? 'cancelledordercm' : 'cancelledorderincm')), prem: num(g(r, 'premiumbiling')),
        lyBill: lvl === 'ASM' ? num(g(r, 'billingvolume')) : null };   // ASM sheet: “Billing Volume” sits under LY MTD Volume
    }
  }
  if (!Object.keys(dash.SE).length && !Object.keys(dash.ASM).length) warn.push('No official targets found (Dashboard SE / Dashboard ASM) — targets use the dealer-wise plan.');
  // the dashboards are the master list: SEs and ASMs (and their ASM / zone) come from them when present
  if (Object.keys(dash.ASM).length) { asms.clear(); for (const [n, x] of Object.entries(dash.ASM)) asms.set(n, { n, z: x.z }); }
  if (Object.keys(dash.SE).length) {
    const before = [...ses.keys()]; ses.clear();
    for (const [n, x] of Object.entries(dash.SE)) ses.set(n, { n, asm: x.asm, z: x.z, code: x.code || rseCodes.get(n) || null, act: 0 });
    for (let i = 0; i < D.c.length; i++) { const s = ses.get(D.se[i]); if (s && D.s[i] === 'A') s.act++; }
    const gone = before.filter(n => !ses.has(n)); if (gone.length) warn.push(`Not in Dashboard SE, so not listed as SEs: ${gone.join(', ')} (their dealers still count in their ASM and zone).`);
  }
  // date of the dashboards = last day with billing in “Date ASM Wise Billing” (their run rates count calendar days to this date)
  let dashDay = 0; const dw = rows('Date ASM Wise Billing');
  if (dw) { const hr = dw.findIndex((r, i) => i < 10 && r && r.some(h => H(h) === 'asmname')); const tot = dw.find((r, i) => i < hr && r && /^total$/i.test(T(r[0])));
    if (hr >= 0 && tot) dw[hr].forEach((h, j) => { const d = typeof h === 'number' ? toDate(h) : null; if (d && d.getFullYear() === Y && d.getMonth() === M && numv(tot[j]) > 0) dashDay = Math.max(dashDay, d.getDate()); }); }

  /* ---- contacts (optional sheet “Contacts”: Name, Role, Email, WhatsApp) ---- */
  const contacts = {}; const ct = rows('Contacts');
  if (ct) {
    const hr = ct.findIndex((r, i) => i < 10 && r && r.some(h => /^name$/i.test(T(h))));
    if (hr >= 0) {
      const hd = ct[hr].map(h => T(h).toLowerCase()), f = rx => hd.findIndex(h => rx.test(h));
      const iN = f(/^name$/), iR = f(/role|designation/), iE = f(/e-?mail/), iW = f(/whats|mobile|phone|contact/);
      for (let i = hr + 1; i < ct.length; i++) { const r = ct[i]; if (!r) continue; const n = T(r[iN]); if (!n) continue;
        let ph = iW >= 0 ? String(r[iW] == null ? '' : r[iW]).replace(/\D/g, '') : ''; if (ph.length === 10) ph = '91' + ph; if (ph.length === 11 && ph[0] === '0') ph = '91' + ph.slice(1);
        contacts[n] = { role: iR >= 0 ? T(r[iR]) : '', email: iE >= 0 ? T(r[iE]) : '', phone: ph.length >= 11 ? ph : '' }; }
      const all = [...ses.keys(), ...asms.keys()], miss = all.filter(n => !contacts[n]);
      if (miss.length) warn.push(`Contacts sheet: no row for ${miss.length} of ${all.length} SEs/ASMs (${miss.slice(0, 6).join(', ')}${miss.length > 6 ? '…' : ''}).`);
    } else warn.push('Contacts sheet found, but no header row with a “Name” column.');
  } else warn.push('No “Contacts” sheet: email and WhatsApp buttons open without a recipient. Add a sheet “Contacts” with Name, Role, Email, WhatsApp.');
  const asOf = `${month}-${String(maxDay).padStart(2, '0')}`;
  const jplan = jplanFromWorkbook(rows, pjpSheets, { Y, M, ses, asms, dash, warn });
  // journey-plan adherence (KPI 2) from the PJP sheets for anyone the DJP summary has no current-month row for
  let pjpFromSheets = 0;
  if (jplan) for (const [lvl, out] of [['SE', pjpSE], ['ASM', pjpASM]]) for (const [n, rs] of Object.entries(jplan.rows[lvl])) {
    if (out[n]) continue; const pl = rs.filter(r => r[0] <= maxDay && !r[7]);
    if (pl.length) { out[n] = { p: pl.length, a: pl.filter(r => r[5]).length, pc: 0, src: 'pjp' }; pjpFromSheets++; }
  }
  if (pjpFromSheets) { const i = warn.findIndex(w => /^DJP summary: no/.test(w)); if (i >= 0) warn.splice(i, 1, `DJP summary has no ${MON[M]} block — planned vs visited is taken from the PJP sheets (${plural(pjpFromSheets, 'person', 'people')}).`); }
  const field = fieldFromWorkbook(rows, fieldSheets, { Y, M, ses, asms, dash, warn });
  const pend = orderSheet ? pendFromWorkbook(rows, orderSheet, { Y, M, warn }) : null;
  const contest = contestSheets.tracker ? contestFromWorkbook(rows, contestSheets, { ses, warn }) : null;
  if (!orderSheet) warn.push('No “Cycle_Order” sheet: pending orders show the Dashboard SE / ASM “Open Order (CM+LM)” totals only. Paste the daily Cycle_Order export as a sheet named “Cycle_Order” for dealer-wise status.');
  const monthly = monthlyFromWorkbook(rows, monthSheets, { Y, M, month, asOf, dash, D, facts, warn });
  say('Saving month-wise history…'); await tick();
  const history = historyFromWorkbook(rows, { Y, M, month, asOf, dash, dj, warn });
  const cfgAsOf = serialYM(cfgVal('As-of Date')) ? toDate(cfgVal('As-of Date')) : null;
  return {
    meta: { v: PACK_VERSION, asOf, month, dashDay: dashDay > maxDay ? dashDay : 0, built: new Date().toISOString(), odSnap: cfgAsOf ? isoD(cfgAsOf) : asOf, planSrc, warnings: warn, fromWorkbook: fileName,
      src: { billing: `${fileName} · Billing`, orders: 'not in the master workbook', master: `${fileName} · Dealer master`, mis: `${fileName} · Dealer_Vol1 / Val1 / ASP1 / MBD1`,
        od: `${fileName} · Dealer_Vol1 OD`, pjp: pjpFromSheets ? `${fileName} · ${pjpSheets.join(' / ')}` : `${fileName} · MTD DJP SUMMARY (${MON[M]} MTD)`, sub: `${fileName} · Secondary + Index`, plan: planSrc === 'none' ? 'no plan sheet' : planSrc, snap: `${fileName} · Complaints, Google rating, GSB & ISB, DPL–PLS` } },
    dealers: D, models, modelLabel: mLab, facts, orders: [], rejModels: [], ses: [...ses.values()].sort((a, b) => a.n.localeCompare(b.n)), asms: [...asms.values()].sort((a, b) => a.n.localeCompare(b.n)),
    pjpSE, pjpASM, dists, npd, lines, contacts, dash, monthly, history, jplan, field, pend, contest,
  };
}

/* ---- display contest (market activity): sheets “display contest(SE tracker)” + “rules display contest” ----
   SE tracker row: Zone, ASM, SE, Outlets in contest, SE trained (Y/N), SE training date, Outlets staff-trained, Launch-ready %,
   R1 audits, R2 audits, Photo sets submitted, Avg display score, Qualified / on track.  “Not mapped - <ASM>” rows = outlets with no SE.
   Rules: qualification threshold, reward per qualifying outlet, audit rounds, the mandatory display models.
   → { thr, reward, rounds, models: [...], rows: [{ z, asm, se, o, tr, st, lr, r1, r2, ph, sc, q, unmapped }] } */
function contestFromWorkbook(rows, sheets, { ses, warn }) {
  const T = s => s == null ? '' : String(s).trim(), R = rows(sheets.tracker) || [];
  const hi = R.findIndex((r, i) => i < 15 && r && r.some(h => H(h) === 'se') && r.some(h => /^outletsincontest/.test(H(h))));
  if (hi < 0) { warn.push(`Sheet “${sheets.tracker}”: header row with SE and Outlets in contest not found — display contest left out.`); return null; }
  const hd = R[hi].map(H), col = k => hd.findIndex(h => h.startsWith(k)), num = v => { const x = numv(v); return isFinite(x) ? x : 0; };
  const c = { z: col('zone'), asm: col('asm'), se: hd.indexOf('se'), o: col('outletsincontest'), tr: col('setrained'), st: col('outletsstafftrained'), lr: col('launchready'),
    r1: col('r1audits'), r2: col('r2audits'), ph: col('photosets'), sc: col('avgdisplayscore'), q: col('qualified') };
  const out = [], miss = [];
  for (let i = hi + 1; i < R.length; i++) {
    const r = R[i]; if (!r || !T(r[c.se]) || /^total$/i.test(T(r[c.z]))) continue;
    const se = T(r[c.se]), unmapped = /^not mapped/i.test(se), o = num(r[c.o]); if (!o) continue;
    if (!unmapped && !ses.has(se)) miss.push(se);
    const sc = r[c.sc] == null || r[c.sc] === '' ? null : numv(r[c.sc]);
    out.push({ z: tcase(T(r[c.z])), asm: T(r[c.asm]), se: unmapped ? '' : se, o, tr: /^y/i.test(T(r[c.tr])) ? 1 : /^n/i.test(T(r[c.tr])) ? 0 : null,
      st: num(r[c.st]), lr: num(r[c.lr]), r1: num(r[c.r1]), r2: num(r[c.r2]), ph: num(r[c.ph]), sc: sc != null && isFinite(sc) ? sc : null, q: num(r[c.q]), unmapped: unmapped ? 1 : 0 });
  }
  // rules: threshold, reward, rounds and the mandatory models
  const RR = rows(sheets.rules) || [], val = rx => { for (const r of RR) { if (!r) continue; const i = r.findIndex(x => rx.test(T(x))); if (i >= 0) return r[i + 1]; } return null; };
  const models = []; const mi = RR.findIndex(r => r && r.some(x => /the \d+ mandatory display models/i.test(T(x))));
  for (let i = Math.max(0, mi) + 1; mi >= 0 && i < RR.length; i++) { const r = RR[i]; if (!r) continue; const k = r.findIndex(x => typeof x === 'number' && x >= 1 && x <= 20 && Number.isInteger(x));
    if (k >= 0 && T(r[k + 1])) models.push(T(r[k + 1])); else if (models.length) break; }
  if (miss.length) warn.push(`Display contest: ${miss.length} SE name(s) not in Dashboard SE (${miss.slice(0, 5).join(', ')}${miss.length > 5 ? '…' : ''}) — shown on their ASM's figures only.`);
  return { thr: numv(val(/^qualification threshold/i)) || .8, reward: numv(val(/^reward per qualifying outlet/i)) || 0, rounds: numv(val(/^audit rounds planned/i)) || 2, models, rows: out };
}

/* ---- pending orders, dealer-wise: sheet “Cycle_Order” (SO lines) ----
   SO Date, Dealer (code), SO Qty, Inv.Qty., SO vs INV Bal Qty., DO vs Inv Bal Qty, Reason
   → d[dealer code] = [SO qty, invoiced qty, pending qty (SO − invoice), dispatched not invoiced, pending on rejected lines (Reason), last SO day]
   Lines from this month and last month (the dashboards' “CM + LM”); only dealers with something pending are kept. */
function pendFromWorkbook(rows, sheet, { Y, M, warn }) {
  const R = rows(sheet) || [], hi = findHeader(R, ['sodate', 'dealer', 'soqty']);
  if (hi < 0) { warn.push(`Sheet “${sheet}”: header row with SO Date, Dealer, SO Qty not found — pending orders show dashboard totals only.`); return null; }
  const m = colMap(R[hi]), g = (r, k) => m[k] !== undefined ? numv(r[m[k]]) : 0, d = {}; let n = 0;
  const pm = M ? [Y, M - 1] : [Y - 1, 11];
  for (let i = hi + 1; i < R.length; i++) {
    const r = R[i]; if (!r) continue; const dt = toDate(r[m.sodate]); if (!dt) continue;
    const ym = [dt.getFullYear(), dt.getMonth()]; if (!(ym[0] === Y && ym[1] === M) && !(ym[0] === pm[0] && ym[1] === pm[1])) continue;
    const c = Math.round(numv(r[m.dealer])); if (!c) continue;
    const bal = Math.max(0, g(r, 'sovsinvbalqty')), x = d[c] || (d[c] = [0, 0, 0, 0, 0, 0]);
    x[0] += g(r, 'soqty'); x[1] += g(r, 'invqty'); x[2] += bal; x[3] += Math.max(0, g(r, 'dovsinvbalqty'));
    if (m.reason !== undefined && String(r[m.reason] || '').trim()) x[4] += bal;
    if (ym[0] === Y && ym[1] === M) x[5] = Math.max(x[5], dt.getDate()); n++;
  }
  for (const c of Object.keys(d)) if (d[c][2] <= 0) delete d[c];
  return { d, lines: n, asOf: Math.max(0, ...Object.values(d).map(x => x[5])) };
}

/* employee → roster name (Dashboard SE / ASM), by employee code first, then by name (case-insensitive) */
function rosterOf(ses, asms, dash) {
  const T = s => s == null ? '' : String(s).trim(), plain = s => T(s).replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const roster = { SE: new Map(), ASM: new Map() };
  for (const s of ses.values()) { if (s.code) roster.SE.set(+s.code, s.n); roster.SE.set(s.n.toLowerCase(), s.n); }
  for (const a of asms.values()) { const c = ((dash.ASM || {})[a.n] || {}).code; if (c) roster.ASM.set(+c, a.n); roster.ASM.set(a.n.toLowerCase(), a.n); }
  return (lvl, emp, code) => { const c = code ? Math.round(numv(code)) : ((/\[\s*(\d+)\s*\]/.exec(T(emp)) || [])[1] | 0);
    return roster[lvl].get(c) || roster[lvl].get(plain(emp).toLowerCase()) || null; };
}

/* ---- working hours & attendance: sheets “Check In Check out” and “Attendance” (sales-app exports) ----
   Check In Check out: one row per dealer visit — EMPLOYEE, EMPLOYEE CODE, ROLE, PJP TYPE, VISIT DATE, CHECK IN, CHECK OUT, HOURS, ORDER
     → [lvl][name].d[day] = [first check-in (min after midnight), last check-out (min), minutes at dealers, visits, visits with an order]
   Attendance: Employee Name, Employee Code, Role, then one column per date (P / A / L / H / WO …)
     → [lvl][name].att[day] = code */
const isFieldSheet = n => /check\s*-?\s*in|^attendance$/i.test(String(n).trim());
function fieldFromWorkbook(rows, sheets, { Y, M, ses, asms, dash, warn }) {
  if (!sheets.length) return null;
  const T = s => s == null ? '' : String(s).trim(), who = rosterOf(ses, asms, dash);
  const lvlOf = r => /asm/i.test(r) ? 'ASM' : /^r?se$/i.test(T(r)) || /\bse\b/i.test(r) ? 'SE' : null;
  const mins = v => { if (v == null || v === '') return null; if (typeof v === 'number') return v < 2 ? Math.round(v * 1440) : null; if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(T(v)); if (!m) return null; let h = +m[1] % (m[3] ? 12 : 24); if (/pm/i.test(m[3] || '')) h += 12; return h * 60 + +m[2]; };
  const out = { SE: {}, ASM: {} }, miss = new Set(); let nv = 0;
  const get = (lvl, n) => out[lvl][n] || (out[lvl][n] = { d: {}, att: {} });
  for (const sh of sheets) {
    const R = rows(sh); if (!R) continue;
    let hi = findHeader(R, ['visitdate', 'checkin', 'checkout']);
    if (hi >= 0) {
      const m = colMap(R[hi]);
      for (let i = hi + 1; i < R.length; i++) {
        const r = R[i]; if (!r) continue; const d = toDate(r[m.visitdate]); if (!d || d.getFullYear() !== Y || d.getMonth() !== M) continue;
        const lvl = lvlOf(T(r[m.role])); if (!lvl) continue;
        const n = who(lvl, r[m.employee], r[m.employeecode]); if (!n) { miss.add(T(r[m.employee])); continue; }
        const a = mins(r[m.checkin]), b = mins(r[m.checkout]); if (a == null) continue;
        let h = m.hours !== undefined ? mins(r[m.hours]) : null; if (h == null && b != null) h = Math.max(0, b - a);
        const o = get(lvl, n).d, x = o[d.getDate()] || (o[d.getDate()] = [a, b, 0, 0, 0]);
        x[0] = Math.min(x[0], a); if (b != null) x[1] = x[1] == null ? b : Math.max(x[1], b); x[2] += h || 0; x[3]++;
        const ord = m.order !== undefined ? T(r[m.order]) : ''; if (ord && !/^(no|0|n|-)$/i.test(ord)) x[4]++;
        nv++;
      }
      continue;
    }
    hi = findHeader(R, ['employeecode', 'role']);
    if (hi >= 0) {   // attendance grid: one column per date
      const m = colMap(R[hi]), days = R[hi].map(h => { const s = T(h), x = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
        const dt = x ? new Date(+x[3], +x[2] - 1, +x[1]) : (typeof h === 'number' ? toDate(h) : null); return dt && dt.getFullYear() === Y && dt.getMonth() === M ? dt.getDate() : 0; });
      for (let i = hi + 1; i < R.length; i++) {
        const r = R[i]; if (!r) continue; const lvl = lvlOf(T(r[m.role])); if (!lvl) continue;
        const n = who(lvl, r[m.employeename], r[m.employeecode]); if (!n) continue;
        const o = get(lvl, n).att; days.forEach((d, j) => { const v = T(r[j]).toUpperCase(); if (d && v) o[d] = v; });
      }
    } else warn.push(`Sheet “${sh}”: no header row with VISIT DATE, CHECK IN, CHECK OUT (or Employee Code, Role for attendance).`);
  }
  if (!Object.keys(out.SE).length && !Object.keys(out.ASM).length) { warn.push(`Working-hours sheets (${sheets.join(', ')}): nothing for ${MON[M]} ${Y}.`); return null; }
  if (miss.size) warn.push(`Check In Check out: ${miss.size} name(s) not in Dashboard SE / ASM, skipped (${[...miss].slice(0, 6).join(', ')}${miss.size > 6 ? '…' : ''}).`);
  out.src = sheets; out.visits = nv;
  out.asOf = Math.max(0, ...['SE', 'ASM'].flatMap(l => Object.values(out[l]).flatMap(x => Object.keys(x.d).map(Number))));   // last day with a check-in
  return out;
}

/* ---- journey plan (PJP) for each day: sheets “ASM wise PJP” / “SE wise PJP” (or the portal's “ASM - MTD” / “RSE - MTD”) ----
   Visit list (DATE, EMPLOYEE “Name [ code ]”, DEALER “Name [ code ]”, CITY, BEAT NAME, VISITED/NOT VISITED, JOIN WITH RSM)
     → rows[lvl][name] = [[day, dealer code, dealer name, city, beat, visited 0/1, joint with RSM 0/1, ad-hoc 0/1 (PJP TYPE)], …]
   Count pivot (REPORTING MANAGER, EMPLOYEE, one column per date) → cnt[lvl][name][day] = planned visits */
const isPjpSheet = n => /\bpjp\b|journey\s*plan|^(asm|r?se)\s*-\s*mtd$/i.test(String(n).trim()) && !/summary/i.test(n);
function jplanFromWorkbook(rows, sheets, { Y, M, ses, asms, dash, warn }) {
  if (!sheets.length) return null;
  const T = s => s == null ? '' : String(s).trim(), codeIn = s => { const m = /\[\s*(\d+)\s*\]/.exec(s); return m ? +m[1] : 0; };
  const plain = s => T(s).replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const who = rosterOf(ses, asms, dash);
  const out = { rows: { SE: {}, ASM: {} }, cnt: { SE: {}, ASM: {} }, src: sheets }, miss = new Set(), rsmTally = {};
  for (const sh of sheets) {
    const R = rows(sh); if (!R) continue; const lvl0 = /asm/i.test(sh) ? 'ASM' : 'SE';
    let hi = findHeader(R, ['date', 'employee', 'dealer']);
    if (hi >= 0) {
      const m = colMap(R[hi]);
      for (let i = hi + 1; i < R.length; i++) {
        const r = R[i]; if (!r) continue; const d = toDate(r[m.date]); if (!d || d.getFullYear() !== Y || d.getMonth() !== M) continue;
        const lvl = m.role !== undefined && T(r[m.role]) ? (/asm/i.test(T(r[m.role])) ? 'ASM' : 'SE') : lvl0, n = who(lvl, T(r[m.employee]));
        if (!n) { miss.add(plain(r[m.employee])); continue; }
        const dl = T(r[m.dealer]);
        // RSM over each ASM (the RSM column of the visit list; the most frequent name wins, test users ignored)
        const rs = m.rsm !== undefined ? T(r[m.rsm]) : '', an = lvl === 'ASM' ? n : ((ses.get(n) || {}).asm || '');
        if (rs && an && !/test/i.test(rs)) { const t = (rsmTally[an] = rsmTally[an] || {}); t[rs] = (t[rs] || 0) + 1; }
        (out.rows[lvl][n] = out.rows[lvl][n] || []).push([d.getDate(), codeIn(dl), tcase(plain(dl)), tcase(T(r[m.city]).split(',')[0]), T(r[m.beatname]),
          /^visited/i.test(T(r[m.visitednotvisited])) ? 1 : 0, /^y/i.test(T(r[m.joinwithrsm])) ? 1 : 0, /ad.?hoc/i.test(T(r[m.pjptype])) ? 1 : 0]);
      }
      continue;
    }
    hi = findHeader(R, ['employee']);
    if (hi >= 0) {   // count pivot: date headers in the employee row
      const ie = R[hi].map(H).indexOf('employee'), days = R[hi].map(h => { const d = toDate(h); return d && d.getFullYear() === Y && d.getMonth() === M ? d.getDate() : 0; });
      for (let i = hi + 1; i < R.length; i++) {
        const r = R[i]; if (!r || !T(r[ie]) || /total/i.test(T(r[ie]))) continue; const n = who(lvl0, T(r[ie])); if (!n) { miss.add(plain(r[ie])); continue; }
        const o = out.cnt[lvl0][n] = out.cnt[lvl0][n] || {}; days.forEach((d, j) => { const v = numv(r[j]); if (d && v > 0) o[d] = (o[d] || 0) + v; });
      }
    } else warn.push(`Journey plan sheet “${sh}”: no header row with DATE, EMPLOYEE, DEALER.`);
  }
  out.rsm = {}; for (const [a, t] of Object.entries(rsmTally)) out.rsm[a] = Object.entries(t).sort((x, y) => y[1] - x[1])[0][0];
  const nSE = Object.keys(out.rows.SE).length + Object.keys(out.cnt.SE).length, nA = Object.keys(out.rows.ASM).length + Object.keys(out.cnt.ASM).length;
  if (!nSE && !nA) { warn.push(`Journey plan sheets (${sheets.join(', ')}): nothing for ${MON[M]} ${Y}.`); return null; }
  if (miss.size) warn.push(`Journey plan: ${miss.size} name(s) not in Dashboard SE / ASM, skipped (${[...miss].slice(0, 6).join(', ')}${miss.size > 6 ? '…' : ''}).`);
  out.asOf = Math.max(0, ...['SE', 'ASM'].flatMap(l => Object.values(out.rows[l]).flat().filter(r => r[5]).map(r => r[0])));   // last day with a visit logged
  return out;
}

/* ---- month-wise history: zone / ASM / SE per month, kept across uploads ----
   From this workbook: the current month and the 2 before it, read from the Dealer_Vol1 / Dealer_Val1 /
   Dealer-MBD1 month columns (units, value, billing points, models), the DJP month blocks and — for the
   current month only — Dashboard SE / ASM (target, ordered, billed). Months already saved by earlier
   uploads are kept; a month is replaced only by data to a later date, and its official figures are kept
   when the new workbook no longer has them. So once October is uploaded, it stays. */
function historyFromWorkbook(rows, ctx) {
  const { Y, M, asOf, dash, dj } = ctx, T = s => s == null ? '' : String(s).trim(), cur = Y * 12 + M;
  const vol = rows('Dealer_Vol1'), val = rows('Dealer_Val1'), mbd = rows('Dealer-MBD1');
  const old = (() => { const p = [SEED, (() => { try { return JSON.parse(store.get(PACK_KEY) || 'null'); } catch (e) { return null; } })()].find(x => x && x.history && x.history.months); return p ? p.history.months : {}; })();
  if (!vol) return { months: old };
  const hv = findHeader(vol, ['dealercode']); if (hv < 0) return { months: old };
  const months = []; const mcol = (hdr, k) => hdr.findIndex(h => { const d = typeof h === 'number' && h > 40000 ? toDate(h) : null; return d && d.getFullYear() * 12 + d.getMonth() === k; });
  for (let k = cur - 2; k <= cur; k++) { const j = mcol(vol[hv], k); if (j >= 0) months.push({ k, j, ym: `${Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}` }); }
  const byCode = rs => { if (!rs) return null; const h = findHeader(rs, ['dealercode']); if (h < 0) return null; const e = colMap(rs[h]).dealercode, map = new Map(); for (let i = h + 1; i < rs.length; i++) if (rs[i] && rs[i][e] != null) map.set(rs[i][e], rs[i]); return { h: rs[h], map }; };
  const VAL = byCode(val), MBD = byCode(mbd), m = colMap(vol[hv]);
  const djpOf = (k, kind) => {   // DJP month block: “<MONTH> <YEAR> – ASM WISE / SE WISE”
    const out = {}; if (!dj) return out; const mn = MONL[k % 12], yr = String(Math.floor(k / 12)); let start = -1;
    for (let ri = 0; ri < 4; ri++) (dj[ri] || []).forEach((v, j) => { const s = T(v).toUpperCase(); if (s.includes(mn) && s.includes(yr) && (kind === 'ASM' ? /ASM WISE/.test(s) && !/\bR?SE WISE/.test(s) : /\bR?SE WISE/.test(s) && !/ASM WISE/.test(s))) start = j; });
    if (start < 0) return out; const hr = dj.findIndex((r, i) => i < 12 && r && T(r[start]).toLowerCase() === 'zone'); if (hr < 0) return out;
    const hm = {}; for (let j = start; j < start + 15; j++) { const h = H(dj[hr][j]); if (h && hm[h] === undefined) hm[h] = j; }
    const nk = kind === 'ASM' ? 'asmname' : hm.sename !== undefined ? 'sename' : 'rsename'; if (hm[nk] === undefined) return out;
    for (let i = hr + 1; i < dj.length; i++) { const r = dj[i]; if (!r) continue; const n = T(r[hm[nk]]); if (!n || /total/i.test(T(r[start]))) continue; out[n] = [numv(r[hm.mtdplan]), numv(r[hm.mtdacht])]; }
    return out;
  };
  const fresh = {};
  for (const mo of months) {
    const jv = MONTH_J(VAL, mo.k), jm = MONTH_J(MBD, mo.k), G = { Z: {}, ASM: {}, SE: {} };
    const add = (lvl, key, base, u, v, md) => { const o = G[lvl][key] || (G[lvl][key] = Object.assign({ d: 0, a: 0, u: 0, v: 0, bp: 0, ms: 0, mn: 0 }, base)); o.d++; if (base._act) o.a++; o.u += u; o.v += v; if (u > 0) o.bp++; if (md > 0) { o.ms += md; o.mn++; } };
    for (let i = hv + 1; i < vol.length; i++) {
      const r = vol[i]; if (!r || r[m.dealercode] == null || r[m.dealercode] === '') continue;
      const z = tcase(r[m.zone]), a = T(r[m.asm]), s0 = T(r[m.rsedse]), s = s0 && !/not found|^-$|^0$/i.test(s0) ? s0 : '';
      const u = numv(r[mo.j]), vr = VAL && VAL.map.get(r[m.dealercode]), mr = MBD && MBD.map.get(r[m.dealercode]);
      const v = vr && jv >= 0 ? numv(vr[jv]) : 0, md = mr && jm >= 0 ? numv(mr[jm]) : 0, act = /^active/i.test(T(r[m.activeinactive]));
      if (z) add('Z', z, { _act: act }, u, v, md);
      if (a) add('ASM', a, { z, _act: act }, u, v, md);
      if (s) add('SE', s, { z, asm: a, _act: act }, u, v, md);
    }
    const dA = djpOf(mo.k, 'ASM'), dS = djpOf(mo.k, 'SE');
    for (const [n, x] of Object.entries(dA)) if (G.ASM[n]) [G.ASM[n].pp, G.ASM[n].pa] = x;
    for (const [n, x] of Object.entries(dS)) if (G.SE[n]) [G.SE[n].pp, G.SE[n].pa] = x;
    for (const z of Object.keys(G.Z)) { const as = Object.values(G.ASM).filter(x => x.z === z && x.pp); if (as.length) { G.Z[z].pp = as.reduce((s, x) => s + x.pp, 0); G.Z[z].pa = as.reduce((s, x) => s + x.pa, 0); } }
    if (mo.k === cur) {   // official figures exist for the workbook's own month only
      const off = x => ({ t: x.target, o: x.orderAch, b: x.billVol, bpT: x.bpT, bpA: x.bpA, mT: x.mbdT, mA: x.mbdA, prem: x.prem, cx: x.cancel });
      for (const [n, x] of Object.entries(dash.SE)) if (G.SE[n] && x.target) G.SE[n].off = off(x);
      for (const [n, x] of Object.entries(dash.ASM)) if (G.ASM[n] && x.target) G.ASM[n].off = off(x);
      for (const z of Object.keys(G.Z)) { const xs = Object.values(dash.ASM).filter(x => x.z === z && x.target); if (xs.length) G.Z[z].off = { t: xs.reduce((s, x) => s + x.target, 0), o: xs.reduce((s, x) => s + (x.orderAch || 0), 0), b: xs.reduce((s, x) => s + (x.billVol || 0), 0), bpT: xs.reduce((s, x) => s + (x.bpT || 0), 0), bpA: xs.reduce((s, x) => s + (x.bpA || 0), 0) }; }
    }
    for (const lv of Object.values(G)) for (const o of Object.values(lv)) { o.md = o.mn ? Math.round(o.ms / o.mn * 100) / 100 : null; o.v = Math.round(o.v); delete o.ms; delete o.mn; delete o._act; }
    const end = new Date(Math.floor(mo.k / 12), mo.k % 12 + 1, 0);
    fresh[mo.ym] = Object.assign(G, { asOf: mo.k === cur ? asOf : isoD(end), closed: mo.k < cur || asOf >= isoD(end) });
  }
  // merge with what earlier uploads saved
  const out = Object.assign({}, old);
  for (const [ym, h] of Object.entries(fresh)) {
    const o = old[ym];
    if (!o || h.asOf >= o.asOf) {
      if (o) for (const lvl of ['Z', 'ASM', 'SE']) for (const [n, x] of Object.entries(o[lvl] || {})) { const y = h[lvl][n]; if (y && !y.off && x.off) y.off = x.off; if (y && y.pp == null && x.pp != null) { y.pp = x.pp; y.pa = x.pa; } }
      out[ym] = h;
    }
  }
  return { months: out };
}
const MONTH_J = (S, k) => S ? S.h.findIndex(h => { const d = typeof h === 'number' && h > 40000 ? toDate(h) : null; return d && d.getFullYear() * 12 + d.getMonth() === k; }) : -1;

/* ---- monthly plan: optional sheets “ASM wise <mon> target” / “SE wise <mon> target” ----
   Zone | (ASM HQ) | code | name | Target | one column per date of the plan month.
   When the plan month is after the data month, the data month is “last month”: its results
   (Dashboard SE / ASM + billing by day) become the learnings. When the plan month is the data month
   (after the month rollover) the learnings saved with the earlier upload are kept. */
const isMonthSheet = n => /^(asm|rse|se)\b.*\btarget\b/i.test(String(n).trim());
function monthlyFromWorkbook(rows, sheets, ctx) {
  const { Y, M, month, asOf, dash, D, facts, warn } = ctx, T = s => s == null ? '' : String(s).trim();
  const read = (sheet, lvl) => {
    const rs = sheet && rows(sheet); if (!rs) return null;
    const hr = rs.findIndex((r, i) => i < 8 && r && r.some(h => /^target/i.test(T(h))));
    if (hr < 0) { warn.push(`Sheet “${sheet}”: no header row with “Target”.`); return null; }
    const hd = rs[hr].map(H), first = rx => hd.findIndex(h => rx.test(h));
    const iN = first(lvl === 'ASM' ? /^asmname$/ : /^(rse|se)name$/), iC = first(lvl === 'ASM' ? /^asmcode$/ : /^(rse|se)code$/), iZ = first(/^zone$/), iH = first(/hq$/), iT = first(/^target/);
    const dates = []; rs[hr].forEach((h, j) => { const d = typeof h === 'number' && h > 40000 ? toDate(h) : null; if (d) dates.push([j, d]); });
    if (iN < 0 || iT < 0 || !dates.length) { warn.push(`Sheet “${sheet}”: name, Target or date columns not found.`); return null; }
    const d0 = dates[0][1], ym = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}`, dim = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
    const out = [];
    for (let i = hr + 1; i < rs.length; i++) {
      const r = rs[i]; if (!r) continue; const n = T(r[iN]), z = T(r[iZ]);
      if (!n || /total/i.test(n) || /total/i.test(z) || /^(vacant|tba)$/i.test(n)) continue;
      const t = numv(r[iT]); if (!(t > 0)) continue;
      const d = new Array(dim).fill(0); for (const [j, dt] of dates) if (dt.getMonth() === d0.getMonth()) d[dt.getDate() - 1] = Math.max(0, numv(r[j]));
      out.push({ n, z: tcase(z), hq: iH >= 0 ? T(r[iH]) : '', code: iC >= 0 ? Math.round(numv(r[iC])) || null : null, t: Math.round(t), d });
    }
    return { ym, rows: out };
  };
  const A = read(sheets.asm, 'ASM'), S = read(sheets.se, 'SE');
  const keepOld = () => {   // no plan sheets now: keep a plan already loaded for this month or later
    const old = [SEED, (() => { try { return JSON.parse(store.get(PACK_KEY) || 'null'); } catch (e) { return null; } })()].find(p => p && p.monthly && p.monthly.ym >= month);
    return old ? old.monthly : null;
  };
  if (!A && !S) return keepOld();
  const ym = (A || S).ym, [py, pm] = ym.split('-').map(Number);
  if (A && S && A.ym !== S.ym) warn.push(`Monthly plan: ASM sheet is for ${A.ym}, SE sheet for ${S.ym} — using ${ym}.`);
  const asm = A ? A.rows : [], se = S ? S.rows : [];
  // last month’s results → learnings
  let prev = null;
  if (ym > month && (Object.keys(dash.SE).length || Object.keys(dash.ASM).length)) {
    const dim = new Date(Y, M + 1, 0).getDate(), by = { SE: new Map(), ASM: new Map() };
    for (const f of facts) { for (const [lvl, nm] of [['SE', D.se[f[0]]], ['ASM', D.asm[f[0]]]]) { if (!nm) continue; const o = by[lvl].get(nm) || by[lvl].set(nm, { t: 0, l: 0 }).get(nm); o.t += f[3]; if (f[1] > dim - 10) o.l += f[3]; } }
    const pick = (lvl, x, n) => { const b = by[lvl].get(n);
      return { target: x.target, bill: x.billVol, order: x.orderAch, open: x.open, cancel: x.cancel, prem: x.prem, bpT: x.bpT, bpA: x.bpA, mbdT: x.mbdT, mbdA: x.mbdA, lyBill: x.lyBill, asm: x.asm, hq: x.hq, z: x.z, last10: b && b.t > 0 ? b.l / b.t : null }; };
    prev = { ym: month, asOf, SE: {}, ASM: {} };
    for (const lvl of ['SE', 'ASM']) for (const [n, x] of Object.entries(dash[lvl])) if (!/^(vacant|tba) –/i.test(n) && x.target) prev[lvl][n] = pick(lvl, x, n);
  } else if (ym === month) { const old = keepOld(); if (old && old.ym === ym) prev = old.prev; }
  // SE → ASM of the plan month: last month’s ASM if still an ASM, else the ASM of most of the SE’s dealers, else the ASM who took over the same HQ
  const asmSet = new Set(asm.map(a => a.n)), hqAsm = new Map(asm.filter(a => a.hq).map(a => [H(a.hq), a.n]));
  const dealerAsm = n => { const c = new Map(); for (let i = 0; i < D.c.length; i++) if (D.se[i] === n && D.asm[i]) c.set(D.asm[i], (c.get(D.asm[i]) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1]).map(x => x[0]).find(a => asmSet.has(a)) || ''; };
  for (const s of se) {
    const p = prev && prev.SE[s.n], was = p ? p.asm : '';
    s.hq = s.hq || (p && p.hq) || '';
    s.asm = asmSet.has(was) ? was : dealerAsm(s.n) || (was && prev.ASM[was] && hqAsm.get(H(prev.ASM[was].hq))) || '';
  }
  for (const a of asm) if (prev && !prev.ASM[a.n]) { const o = Object.entries(prev.ASM).find(([, x]) => H(x.hq) === H(a.hq)); if (o) a.prevOf = o[0]; }   // new ASM: last month of the same HQ
  const lbl = `${MONL[pm - 1].charAt(0)}${MONL[pm - 1].slice(1).toLowerCase()} ${py}`;
  return { ym, label: lbl, sheets: [sheets.asm, sheets.se].filter(Boolean), asm, se, prev, built: new Date().toISOString() };
}

/* load the master workbook: build, save, show */
async function handleMaster(buf, fileName) {
  const out = BOOTED ? $('#upProg') : $('#obProg'); const say = t => { if (out) out.innerHTML = `<span class="spin"></span>${esc(t)}`; };
  try {
    const pack = await packFromWorkbook(buf, fileName, say);
    say('Saving in this browser and building the dashboard…'); await tick();
    const saved = store.set(PACK_KEY, JSON.stringify(pack));
    store.del(UPKEY);                         // billing now comes from the workbook itself
    SEED = pack; PACK_SRC = `from ${fileName}${saved ? ' · saved in this browser' : ' · this session only'}`;
    if (BOOTED) { DB = buildDB(SEED); ST.day = DB.maxDay; $('#upOverlay').hidden = true; $('#packSrc').textContent = `Data ${pack.meta.month} · ${PACK_SRC}`; renderAll(); }
    else startApp();
    const w = pack.meta.warnings;
    toast(`Loaded ${fileName}: ${fN(pack.dealers.c.length)} dealers, ${fN(pack.lines)} billing lines, data to ${pack.meta.asOf}.${w.length ? ` ${w.length} note${w.length > 1 ? 's' : ''} in Method → Data checks.` : ''}${saved ? '' : ' Could not save in this browser — upload again next time.'}`, 8000);
  } catch (e) { console.error(e); if (out) out.innerHTML = `<b style="color:var(--crit)">Could not read this workbook:</b> ${esc(e.message || e)}`; }
}
/* any Excel file: master workbook → handleMaster; daily dump → reference upload path */
async function routeExcel(file) {
  if (!window.XLSX) throw new Error('The Excel reader did not load — check the internet connection and reload.');
  const buf = await file.arrayBuffer();
  const names = window.XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames;
  return { buf, master: isMasterWorkbook(names), names };
}
