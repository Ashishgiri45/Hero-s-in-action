'use strict';
/* ================= start-up: data pack, wiring, theme =================
   Data never ships with the hosted site. The reference data pack (dealer master, plans, MIS, journey
   plan, snapshots — a .json file kept privately) is loaded once per browser and stored there; the
   daily Dashboard Dump is uploaded on top. A local build may embed the pack (<script id="seed">). */

const TABS = ['home', 'data', 'overview','zones', 'asm', 'rse', 'daily', 'weekly', 'monthly', 'monthwise', 'daywise', 'tracking', 'export', 'leaderboard', 'actions', 'dealers', 'method'];
const PACK_KEY = 'djp.pack.v1';
const PACK_VERSION = 4;   // bump when the data built from the workbook changes shape or rules (4: month-wise history, SE names)
let BOOTED = false, PACK_SRC = '';

function validPack(j) {
  return j && j.meta && j.meta.month && j.dealers && Array.isArray(j.dealers.c) && Array.isArray(j.ses) && Array.isArray(j.asms) && Array.isArray(j.facts) && Array.isArray(j.models);
}
/* embedded data (local build) or the last upload saved in this browser — whichever is newer */
function findPack() {
  let emb = null, sav = null;
  const el = document.getElementById('seed');
  if (el && el.textContent.trim().charAt(0) === '{') { try { const j = JSON.parse(el.textContent); if (validPack(j)) emb = { pack: j, src: 'embedded in this file' }; } catch (e) { console.error(e); } }
  const s = store.get(PACK_KEY);
  if (s) { try { const j = JSON.parse(s);
    // a copy saved by an older version of the dashboard is dropped, so stale data never shows
    if (validPack(j) && (j.meta.v || 0) >= PACK_VERSION) sav = { pack: j, src: j.meta.fromWorkbook ? `from ${j.meta.fromWorkbook} · saved in this browser` : 'saved in this browser' }; else store.del(PACK_KEY);
  } catch (e) { store.del(PACK_KEY); } }
  if (emb && sav) return (sav.pack.meta.asOf || '') > (emb.pack.meta.asOf || '') || (sav.pack.meta.asOf === emb.pack.meta.asOf && (sav.pack.meta.built || '') > (emb.pack.meta.built || '')) ? sav : emb;
  return sav || emb;
}
async function handlePack(file) {
  const msg = t => { const p = BOOTED ? $('#upProg') : $('#obProg'); if (p) p.textContent = t; };
  msg(`Reading ${file.name}…`);
  try {
    const j = JSON.parse(await file.text());
    if (!validPack(j)) throw new Error('This file is not a DJP reference data pack (expected dealers, ses, asms, facts, meta).');
    const saved = store.set(PACK_KEY, JSON.stringify(j));
    if (BOOTED) {
      if (saved) { location.reload(); return; }
      SEED = j; PACK_SRC = 'loaded for this session only'; DB = buildDB(SEED); ST.day = DB.maxDay; $('#upOverlay').hidden = true; renderAll();
    } else { SEED = j; PACK_SRC = saved ? 'saved in this browser' : 'loaded for this session only'; startApp(); }
    toast(`Data pack loaded: ${j.meta.month} · ${fN(j.dealers.c.length)} dealers${saved ? '' : ' · could not be saved in this browser (storage full) — load it again next time'}`, 6000);
  } catch (e) { console.error(e); msg('Could not use this file: ' + (e.message || e)); }
}
function forgetData() {
  if (!confirm('Remove the data pack, uploaded dump and settings from this browser? Action-tracking records are kept unless you also clear them in Tracking.')) return;
  store.del(PACK_KEY); store.del(UPKEY); store.del(CFG_KEY); location.reload();
}

function comboExport(keys, name) {
  try {
    if (!ST.week) ST.week = defaultWeek();
    const sheets = keys.flatMap(k => EXPORTS.find(e => e.key === k).build(false).sheets);
    return downloadWorkbook(`${name}_${scopeLbl()}_${stamp()}`, sheets);
  } catch (e) { console.error(e); toast(e.message || 'Export failed.'); }
}

function wireApp() {
  $('#btnExport').onclick = () => onTab('export');
  $('#btnForget').onclick = forgetData;
  $$('[data-dlvl]').forEach(b => b.onclick = () => { ST.planLvl.daily = b.dataset.dlvl; renderPlans('daily'); });
  $$('[data-wlvl]').forEach(b => b.onclick = () => { ST.planLvl.weekly = b.dataset.wlvl; renderPlans('weekly'); });
  $('#dGen').onclick = () => generateAll('daily');
  $('#wGen').onclick = () => generateAll('weekly');
  $('#dXls').onclick = () => comboExport(['dASM', 'dRSE'], 'Daily_Action_Plans');
  $('#wXls').onclick = () => comboExport(['wASM', 'wRSE'], 'Weekly_Action_Plans');
  $('#dCur').onclick = () => { const l = ST.planLvl.daily; runExport(l === 'ASM' ? 'curASM' : 'curRSE', false, ST.planSel.daily[l]); };
  $('#wCur').onclick = () => { const l = ST.planLvl.weekly; runExport(l === 'ASM' ? 'curASM' : 'curRSE', false, ST.planSel.weekly[l]); };
  $$('[data-allplans]').forEach(b => b.onclick = () => runExport('allPlans', false));
  $$('[data-xp]').forEach(b => b.onclick = () => runExport(b.dataset.xp, b.dataset.xpall === '1'));
  const tf = ST.tf, rt = () => renderTracking();
  $('#tfType').onchange = e => { tf.type = e.target.value; rt(); };
  $('#tfLevel').onchange = e => { tf.level = e.target.value; rt(); };
  $('#tfStatus').onchange = e => { tf.status = e.target.value; rt(); };
  $('#tfZone').onchange = e => { tf.zone = e.target.value; rt(); };
  $('#tfOver').onchange = e => { tf.overdue = e.target.checked; rt(); };
  let tq; $('#tfQ').oninput = e => { tf.q = e.target.value; clearTimeout(tq); tq = setTimeout(rt, 200); };
  $('#trkBackup').onclick = trkBackup;
  $('#trkRestore').onclick = () => $('#trkFile').click();
  $('#trkFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const r = await trkRestore(f); toast(`Backup restored: ${r.added} added, ${r.newer} updated.`); renderTracking(); } catch (err) { toast(err.message || 'Restore failed.', 6000); } };
  // summary → detail navigation
  const go = el => {
    const s = el.dataset.go, i = s.indexOf(':'), kind = s.slice(0, i), rest = s.slice(i + 1);
    if (kind === 'tab') onTab(rest);
    else if (kind === 'rse') { ST.pcat = rest; onTab('rse'); }
    else if (kind === 'rank') { const t = rest === 'ASM' ? 'asm' : 'rse'; ST.pcat = ''; ST.sorts[t] = { k: 'rank', d: -1 }; onTab(t); }
    else if (kind === 'zone') { ST.zone = rest; ST.asm = ''; ST.se = ''; if (ST.tab !== 'zones') setTab('zones'); renderAll(); }
    else if (kind === 'rsm') { ST.rsm = rest; ST.zone = ''; ST.asm = ''; ST.se = ''; ST.sorts.asm = { k: 'rank', d: -1 }; if (ST.tab !== 'asm') setTab('asm'); renderAll(); }
    else if (kind === 'p') { const j = rest.indexOf(':'); openProfile(rest.slice(0, j) === 'ASM' ? 'ASM' : 'SE', rest.slice(j + 1)); }
  };
  document.addEventListener('click', e => { const el = e.target.closest('[data-go]'); if (el && !e.target.closest('select,input')) { navPush(); go(el); } });
  if ($('#btnBack')) $('#btnBack').onclick = () => { if (NAVBACK.length) { try { history.back(); } catch (x) { navBack(); } } };
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-go]')) { e.preventDefault(); go(e.target); } });
  // dragging a file onto the page opens Data Management → Upload (admin only)
  window.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files') && !document.body.classList.contains('role-user')) { e.preventDefault(); if (ST.tab !== 'data') { $('#upProg').textContent = ''; onTab('data'); } } });
}

function startApp() {
  document.body.classList.remove('nodata');
  $('#onboard').hidden = true;
  applyRole();
  boot();
  BOOTED = true;
  $('#btnLogout').onclick = logout;
  ST.week = defaultWeek();
  $('#packSrc').textContent = `Data to ${SEED.meta.asOf} · ${PACK_SRC}`;
  wireApp(); wireShare(); wirePublish(); if (window.FB) fbWirePublish(); wireMonthly(); wireMonthwise(); wireShell();
  $('#dBulk').onclick = () => openBulk('daily'); $('#wBulk').onclick = () => openBulk('weekly');
  $('#bkCards').onclick = () => bulkZip('cards'); $('#bkMails').onclick = () => bulkZip('mails');
  renderTab(ST.tab);
  setTimeout(() => { window.__navReady = true; }, 300);   // Back history starts after the first screen is drawn
}

/* before a data pack exists only the pack can be loaded; a dump picked first gets a clear explanation */
async function obFile(f) {
  if (!f) return;
  if (/\.json$/i.test(f.name)) return handlePack(f);
  const p = $('#obProg'); p.innerHTML = `<span class="spin"></span>Opening ${esc(f.name)} (${(f.size / 1048576).toFixed(1)} MB)…`;
  try {
    const r = await routeExcel(f);
    if (r.master) return handleMaster(r.buf, f.name);
    p.innerHTML = `<b style="color:var(--crit)">“${esc(f.name)}” is not the master workbook.</b> Upload the <b>SE Evaluation Dashboard</b> workbook (it needs the “Dealer master” and “Billing” sheets). Daily dumps can be added after that with Upload data.`;
  } catch (e) { p.innerHTML = `<b style="color:var(--crit)">Could not open this file:</b> ${esc(e.message || e)}`; }
}
function wireOnboarding() {
  const inp = $('#obIn'), dz = $('#obDrop');
  inp.onchange = e => { const f = e.target.files[0]; e.target.value = ''; obFile(f); };
  $('#btnUpload').onclick = () => inp.click();
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { obFile(e.dataTransfer.files[0]); });
  // dropping anywhere on the page also works
  window.addEventListener('dragover', e => { if (!BOOTED) e.preventDefault(); });
  window.addEventListener('drop', e => { if (!BOOTED && !e.target.closest('#obDrop')) { e.preventDefault(); obFile(e.dataTransfer.files[0]); } });
}

(async function main() {
  $('#btnTheme').onclick = () => {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const nx = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', nx); store.set('se16-theme', nx);
  };
  const fail = e => { console.error(e); $('main').insertAdjacentHTML('afterbegin', `<div class="banner" style="border-color:var(--crit)">The dashboard could not start: ${esc(e.message)}. <button class="btn sm" id="btnForget2" type="button">Clear saved data</button></div>`); $('#btnForget2').onclick = forgetData; };
  const found = findPack();
  // Firebase Hosting: per-person sign-in, data from Firestore. An admin's newer upload in this browser wins.
  let fb = null;
  try { fb = await fbInit(); } catch (e) { return fail(e); }
  if (fb) {
    return fbSignIn((pack, who) => {
      const newer = p => found && found.src !== 'embedded in this file' && (!p || (found.pack.meta.asOf || '') > (p.meta.asOf || '') || (found.pack.meta.asOf === p.meta.asOf && (found.pack.meta.built || '') > (p.meta.built || '')));
      if (who.admin && newer(pack)) { SEED = found.pack; SEED.meta.user = { role: 'admin', name: who.name }; PACK_SRC = found.src + ' · not published yet'; }
      else if (pack) { SEED = pack; if (who.admin) SEED.meta.user = { role: 'admin', name: who.name }; PACK_SRC = `published data · ${pack.meta.fromWorkbook || ''}`; }
      else { document.body.classList.add('nodata'); $('#onboard').hidden = false; wireOnboarding(); toast('Signed in as admin. No data published yet - upload the master workbook, then Publish to team.', 8000); return; }
      try { startApp(); } catch (e) { fail(e); }
    }, fail);
  }
  // published site with logins: each person opens their own slice; an admin's newer upload in this browser wins
  if (window.ENC_USERS) {
    return loginFlow(window.ENC_USERS, pack => {
      $('#lock').hidden = true; let use = pack, src = 'published data';
      if (pack.meta.user.role === 'admin' && found && found.src !== 'embedded in this file' && ((found.pack.meta.asOf || '') > (pack.meta.asOf || '') || (found.pack.meta.asOf === pack.meta.asOf && (found.pack.meta.built || '') > (pack.meta.built || '')))) { use = found.pack; use.meta.user = pack.meta.user; src = found.src; }
      SEED = use; PACK_SRC = src; try { startApp(); } catch (e) { fail(e); }
    });
  }
  // published site: built-in encrypted data; an admin's newer upload in this browser wins
  if (window.ENC_DATA &&!(found && found.src !== 'embedded in this file' && (found.pack.meta.asOf || '') > (window.ENC_DATA.asOf || ''))) {
    return unlockFlow(window.ENC_DATA, pack => { $('#lock').hidden = true; SEED = pack; PACK_SRC = `published data · ${pack.meta.fromWorkbook || 'built in'}`; try { startApp(); } catch (e) { fail(e); } });
  }
  if (!found) { document.body.classList.add('nodata'); $('#onboard').hidden = false; wireOnboarding(); return; }
  SEED = found.pack; PACK_SRC = found.src;
  try { startApp(); } catch (e) { fail(e); }
})();
