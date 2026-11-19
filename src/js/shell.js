'use strict';
/* ================= application shell: sidebar, page header, Home, Data Management =================
   Presentation only. Pages are the existing views (section#v-<tab>), opened by the existing setTab /
   onTab; the sidebar items are .tab[data-tab] buttons, so the existing wiring drives them. Home and
   Data Management show figures the dashboard already computes (perfOf, teamCounts, insightsFor, the
   loaded data's meta) — nothing is recalculated here. */

const PAGES = {
  home: { g: '', t: 'Home', d: 'Business snapshot, alerts and quick access to every section.' },
  overview: { g: 'Overview', t: 'Business Overview', d: 'Executive summary: volume, orders, billing and pace, the 16-point scorecard, insights and the biggest score gaps for the selected scope.' },
  zones: { g: 'Overview', t: 'Zone-wise Analysis', d: 'Zone performance, ranking and drill-down to the ASMs and SEs of each zone.' },
  asm: { g: 'Overview', t: 'ASM-wise Analysis', d: 'ASM comparison: target, orders, billing, pace, KPIs and team status. Click an ASM for the profile.' },
  rse: { g: 'Overview', t: 'SE-wise Analysis', d: 'Sales executive comparison: target, orders, billing, pace, KPIs and journey plan. Click an SE for the profile.' },
  monthwise: { g: 'Overview', t: 'Month-wise Performance', d: 'Zone, ASM and SE results month by month: units, value, billing points, range, DJP and target achievement.' },
  daily: { g: 'Plans & Execution', t: 'Daily Action Plan', d: 'Generate, review, track and send each ASM and SE’s plan for the reporting date.' },
  weekly: { g: 'Plans & Execution', t: 'Weekly Action Plan', d: 'Weekly plans, the weekly review and week-on-week movement.' },
  monthly: { g: 'Plans & Execution', t: 'Monthly Plan', d: 'Next month’s targets by week with last month’s learnings — cards to send and a sent record.' },
  tracking: { g: 'Plans & Execution', t: 'Action Tracking', d: 'Status, remarks and manager confirmation of every generated action.' },
  actions: { g: 'Dealer Analytics', t: 'Dealer Focus', d: 'Dealers to act on today and why — ready to share on WhatsApp.' },
  dealers: { g: 'Dealer Analytics', t: 'Dealer Drill-down', d: 'Every mapped dealer with its volume, billing, range and KPI inputs.' },
  leaderboard: { g: 'Distribution & Productivity', t: '16-KPI Scorecard', d: 'All 16 KPIs per SE / ASM: orders, billing, run rate, billing points, revenue per dealer, MBD, growth, DJP, productive calls and sell-through.' },
  daywise: { g: 'Sales & Performance', t: 'Trends', d: 'Billing points and units by day, weekly performance, improvement analysis and day-wise progression.' },
  export: { g: 'Reports & Downloads', t: 'Export Centre', d: 'Every report as Excel for the current filters, or for everyone.' },
  data: { g: 'Data Management', t: 'Upload & Publish', d: 'Upload the master workbook or a daily dump, see the refresh status and publish to the website.' },
  method: { g: 'Data Management', t: 'Data Checks & Method', d: 'How every figure is calculated, thresholds, data checks and sources.' },
};
const NAV_KEY = 'djp.nav.v1';
let NAV = { min: false, closed: [] }; try { NAV = Object.assign(NAV, JSON.parse(store.get(NAV_KEY) || '{}')); } catch (e) {}
const saveNav = () => store.set(NAV_KEY, JSON.stringify(NAV));

function shellOnTab(t) {
  const p = PAGES[t] || { g: '', t: t, d: '' };
  $('#pgTitle').textContent = p.t; $('#pgDesc').textContent = p.d; $('#pgGroup').textContent = p.g || 'Heroes in Action';
  $('#pgCrumb').innerHTML = p.g ? `<a href="#home" data-go="tab:home">Home</a><span class="sep">›</span>${esc(p.g)}<span class="sep">›</span><b>${esc(p.t)}</b>` : '<b>Home</b>';
  document.body.dataset.page = t; document.title = `${p.t} · 16-Point KPI Tracker`;
  const g = $(`.sidenav .tab[data-tab="${t}"]`); const grp = g && g.closest('.nav-g');
  const ic = (grp ? grp.querySelector('.nav-gh svg') : g && g.querySelector('svg')); $('#pgIc').innerHTML = ic ? ic.outerHTML : '';
  if (grp && grp.classList.contains('shut')) setGroup(grp, true);
  document.body.classList.remove('nav-open'); $('#snScrim').hidden = true;
  window.scrollTo(0, 0);
}
function setGroup(grp, open) {
  grp.classList.toggle('shut', !open); grp.querySelector('.nav-gh').setAttribute('aria-expanded', String(open));
  NAV.closed = NAV.closed.filter(k => k !== grp.dataset.g).concat(open ? [] : [grp.dataset.g]); saveNav();
}
function wireShell() {
  // every page change (core setTab) also updates the header
  const base = setTab; setTab = function (t) { base(t); shellOnTab(t); };   // eslint-disable-line no-global-assign
  $$('.nav-g').forEach(g => { if (NAV.closed.includes(g.dataset.g)) setGroup(g, false); g.querySelector('.nav-gh').onclick = () => {
    if (document.body.classList.contains('nav-min')) { document.body.classList.remove('nav-min'); NAV.min = false; saveNav(); setGroup(g, true); return; }
    setGroup(g, g.classList.contains('shut')); }; });
  document.body.classList.toggle('nav-min', !!NAV.min);
  $('#snCollapse').onclick = () => { NAV.min = !document.body.classList.contains('nav-min'); document.body.classList.toggle('nav-min', NAV.min); saveNav(); };
  $('#snOpen').onclick = () => { document.body.classList.add('nav-open'); $('#snScrim').hidden = false; };
  $('#snScrim').onclick = () => { document.body.classList.remove('nav-open'); $('#snScrim').hidden = true; };
  $$('.sidenav .tab').forEach(b => { const l = b.querySelector('span'); if (l) b.title = l.textContent; });
  wirePalette(); wireSearch();
  window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 4), { passive: true });
  // upload lives on its own page
  $('#btnUpload').onclick = () => onTab('data');
  window.addEventListener('drop', e => { if (!e.target.closest('#drop')) e.preventDefault(); });
  const u = (SEED.meta && SEED.meta.user) || { role: 'admin', name: 'Admin' };
  // profile card (sidebar, bottom-left): always shown; Sign out only on the published site with logins
  $('#whoAv').textContent = String(u.name || 'A').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  $('#whoName').textContent = u.role === 'admin' ? 'Admin' : u.name;
  const zOf = u.role === 'ASM' ? (DB.asms.find(a => a.n === u.name) || {}).z : u.role === 'SE' ? (DB.seInfo.get(u.name) || {}).z : '';
  $('#whoRole').textContent = u.role === 'admin' ? (window.ENC_USERS ? 'Administrator' : 'Administrator · this browser')
    : u.role === 'ASM' ? `ASM${zOf ? ' · ' + zOf + ' zone' : ''}` : `SE${(DB.seInfo.get(u.name) || {}).asm ? ' · ASM ' + DB.seInfo.get(u.name).asm : zOf ? ' · ' + zOf : ''}`;
  $('#who').hidden = false;
  $('#whoAv2').textContent = $('#whoAv').textContent; $('#whoName2').textContent = $('#whoName').textContent; $('#whoRole2').textContent = $('#whoRole').textContent;
  $('.sm-out').hidden = !window.ENC_USERS; $('#whoNote').hidden = !!window.ENC_USERS;
  $$('.sm-admin').forEach(b => b.hidden = u.role !== 'admin');
  wireProfile();
  $('#hmDataBtn').hidden = u.role !== 'admin';
  shellOnTab(ST.tab);
}

/* ---------- profile menu (sidebar, bottom-left) + sign-out confirmation ---------- */
function wireProfile() {
  const btn = $('#whoBtn'), menu = $('#whoMenu'), ov = $('#logoutOv');
  const open = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)); $('#who').classList.toggle('open', on); if (on) { const f = menu.querySelector('.sm-i:not([hidden])'); if (f) f.focus(); } };
  btn.onclick = e => { e.stopPropagation(); open(menu.hidden); };
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('#who')) open(false); });
  menu.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('.sm-i')].filter(b => !b.hidden && !b.closest('[hidden]')), i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { open(false); btn.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
  });
  menu.querySelectorAll('[data-sm]').forEach(b => b.onclick = e => {
    const a = b.dataset.sm; e.stopPropagation(); open(false);
    if (a === 'theme') $('#btnTheme').click();
    else if (a === 'palette') { $('#btnPal').click(); }
    else if (a === 'data') onTab('data');
  });
  // Sign out never happens on one click: it opens this confirmation first
  const closeOv = () => { ov.hidden = true; btn.focus(); };
  $('#btnLogout').onclick = e => { e.stopPropagation(); open(false); $('#loWho').textContent = `${$('#whoName').textContent} (${$('#whoRole').textContent})`; ov.hidden = false; $('#loCancel').focus(); };
  $('#loCancel').onclick = closeOv;
  $('#loOk').onclick = () => { $('#loOk').disabled = true; $('#loOk').textContent = 'Signing out…'; logout(); };
  ov.addEventListener('click', e => { if (e.target === ov) closeOv(); });
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') closeOv(); if (e.key === 'Tab') { const f = [$('#loCancel'), $('#loOk')], i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + 1) % 2].focus(); } });
}

/* ---------- colour palette (per viewer, saved in this browser; theme.js applies it before paint) ---------- */
const PALETTES = [
  ['royal', 'Royal', 'Indigo & violet', 'linear-gradient(135deg,#7C6CF6,#4B36D1 55%,#EC4899)'],
  ['ocean', 'Ocean', 'Corporate blue', 'linear-gradient(135deg,#4C9CF0,#1D63B8 60%,#0E9F9A)'],
  ['emerald', 'Emerald', 'Teal & green', 'linear-gradient(135deg,#20BFA5,#0B7A6B 60%,#38BDF8)'],
  ['sunset', 'Sunset', 'Coral & plum', 'linear-gradient(135deg,#FF7A59,#D3305C 55%,#7B1D54)'],
];
function wirePalette() {
  const pop = $('#palPop'), btn = $('#btnPal'), cur = () => document.documentElement.getAttribute('data-palette') || 'royal';
  const draw = () => { pop.innerHTML = '<h4>Colour palette</h4>' + PALETTES.map(([k, l, s, g]) => `<button type="button" class="pal-opt" data-pal="${k}" aria-pressed="${cur() === k}"><span class="pal-sw" style="background:${g}"></span><span><b>${l}</b><small>${s}</small></span></button>`).join('');
    pop.querySelectorAll('[data-pal]').forEach(b => b.onclick = () => { document.documentElement.setAttribute('data-palette', b.dataset.pal); store.set('djp.palette', b.dataset.pal); draw(); }); };
  btn.onclick = e => { e.stopPropagation(); const open = pop.hidden; if (open) draw(); pop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('.pal')) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
}

/* ---------- global search: ASM / SE by name, zone or HQ → their sections ----------
   People come from the loaded data (an ASM / SE login only has their own scope). The shortcuts open the
   existing pages with that person selected; if the filter bar hides them, the filters are cleared first. */
const GS = { items: [], act: 0, q: '' };
const gsNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function gsPeople() {
  if (GS.people && GS.people.at === DB) return GS.people.list;
  const all = { zone: '', asm: '', se: '', st: '', cat: '' }, st = new Map();
  try { for (const x of asmRows(all)) st.set('ASM|' + x.name, x.p.status); for (const x of rseRows(all)) st.set('SE|' + x.name, x.p.status); } catch (e) {}
  const dash = SEED.dash || { SE: {}, ASM: {} };
  const list = DB.asms.map(a => ({ lvl: 'ASM', n: a.n, z: a.z || '', hq: (dash.ASM[a.n] || {}).hq || '', asm: '' }))
    .concat(DB.ses.map(s => ({ lvl: 'SE', n: s.n, z: s.z || '', hq: (dash.SE[s.n] || {}).hq || '', asm: s.asm || '' })));
  // RSMs (admin view only): open their ASM / SE teams
  if (!(SEED.meta.user && SEED.meta.user.role && SEED.meta.user.role !== 'admin')) try { for (const r of rsmRows()) { list.unshift({ lvl: 'RSM', n: r.name, z: r.zone, hq: plural(r.asms.length, 'ASM') + ' · ' + plural(r.team.length, 'SE'), asm: '' }); st.set('RSM|' + r.name, r.p.status); } } catch (e) {}
  for (const p of list) { p.status = st.get(p.lvl + '|' + p.n) || null; p.key = gsNorm([p.n, p.z, p.hq, p.asm, p.lvl === 'RSM' ? 'rsm' : ''].join(' ')); p.nk = gsNorm(p.n); }
  GS.people = { at: DB, list }; return list;
}
function gsFind(q) {
  const t = gsNorm(q).trim(); if (!t) return [];
  const words = t.split(/\s+/);
  return gsPeople().map(p => {
    if (!words.every(w => p.key.includes(w))) return null;
    const s = p.nk.startsWith(t) ? 0 : p.nk.split(/\s+/).some(w => w.startsWith(words[0])) ? 1 : p.nk.includes(t) ? 2 : 3;
    return { p, s };
  }).filter(Boolean).sort((a, b) => a.s - b.s || ({ RSM: 0, ASM: 1, SE: 2 }[a.p.lvl] - { RSM: 0, ASM: 1, SE: 2 }[b.p.lvl]) || a.p.n.localeCompare(b.p.n)).slice(0, 8).map(x => x.p);
}
const gsHi = (txt, q) => { const t = gsNorm(q).trim(); if (!t) return esc(txt); const i = gsNorm(txt).indexOf(t); return i < 0 ? esc(txt) : esc(txt.slice(0, i)) + '<mark>' + esc(txt.slice(i, i + t.length)) + '</mark>' + esc(txt.slice(i + t.length)); };
function gsActions(p) {
  if (p.lvl === 'RSM') return [['rsmAsm', 'ASM team'], ['rsmSe', 'SE team'], ['rsmOv', 'Overview']];
  const a = [['profile', 'Profile'], ['daily', 'Daily plan'], ['weekly', 'Weekly plan']];
  if (SEED.monthly && (p.lvl === 'ASM' ? SEED.monthly.asm : SEED.monthly.se).some(x => x.n === p.n)) a.push(['monthly', 'Monthly plan']);
  if (SEED.history && Object.values(SEED.history.months || {}).some(h => (h[p.lvl] || {})[p.n])) a.push(['monthwise', 'Month-wise']);
  a.push(['actions', 'Dealer focus']);
  return a;
}
function gsRender() {
  const pop = $('#gsPop'), q = GS.q;
  if (!q.trim()) { pop.hidden = true; $('#gsIn').setAttribute('aria-expanded', 'false'); return; }
  GS.items = gsFind(q); if (GS.act >= GS.items.length) GS.act = 0;
  pop.innerHTML = GS.items.length ? GS.items.map((p, i) => {
    const ini = p.n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(), sk = p.status ? PSTAT[p.status] : null;
    return `<div class="gs-it${i === GS.act ? ' on' : ''}" role="option" aria-selected="${i === GS.act}" data-gi="${i}">
      <span class="gs-av ${p.lvl === 'ASM' ? 'asm' : ''}">${esc(ini)}</span>
      <div class="gs-main"><div class="gs-n"><b>${gsHi(p.n, q)}</b><span class="gs-lv">${p.lvl}</span>${sk ? `<span class="pill s-${sk.k}">${sk.l}</span>` : ''}</div>
        <small>${[p.z && p.z + ' zone', p.hq, p.lvl === 'SE' && p.asm ? 'ASM ' + p.asm : ''].filter(Boolean).map(esc).join(' · ')}</small>
        <div class="gs-acts">${gsActions(p).map(([k, l]) => `<button type="button" data-ga="${k}" data-gi="${i}">${l}</button>`).join('')}</div></div></div>`;
  }).join('') + `<div class="gs-foot"><span>↑↓ move · Enter open profile · Esc close</span><span>${plural(GS.items.length, 'match', 'matches')}</span></div>`
    : `<div class="gs-empty">No ASM or SE matches “${esc(q)}”.</div>`;
  pop.hidden = false; $('#gsIn').setAttribute('aria-expanded', 'true');
}
function gsGo(p, what) {
  navPush();   // remember where the search started, so Back returns there
  if (p.lvl === 'RSM') {   // an RSM: filter the whole site to their team, then open the page asked for
    Object.assign(ST, { rsm: p.n, zone: '', asm: '', se: '', st: '', dist: '', cat: '' });
    const t = what === 'rsmSe' ? 'rse' : what === 'rsmOv' ? 'overview' : 'asm'; if (t !== 'overview') ST.sorts[t] = { k: 'rank', d: -1 };
    renderAll(); onTab(t); GS.q = ''; $('#gsIn').value = ''; $('#gsIn').blur(); gsRender(); toast(`RSM ${p.n} · ${(PAGES[t] || {}).t || ''}`); return;
  }
  // make sure the person is inside the current filters
  const inScope = (p.lvl === 'ASM' ? asmRows() : rseRows()).some(x => x.name === p.n);
  if (!inScope) { Object.assign(ST, { rsm: '', zone: '', asm: '', se: '', st: '', dist: '', cat: '' }); renderAll(); }
  const lv = p.lvl;
  if (what === 'profile') openProfile(lv, p.n);
  else if (what === 'daily' || what === 'weekly') { ST.planLvl[what] = lv; ST.planSel[what][lv] = p.n; onTab(what); }
  else if (what === 'monthly') { MST.lvl = lv; MST.sel[lv] = p.n; onTab('monthly'); }
  else if (what === 'monthwise') { MW.lvl = lv; MW.sel = p.n; onTab('monthwise'); }
  else if (what === 'actions') { if (lv === 'SE') { const s = DB.seInfo.get(p.n) || {}; Object.assign(ST, { se: p.n, asm: s.asm || '', zone: s.z || '' }); } else { const a = DB.asms.find(x => x.n === p.n) || {}; Object.assign(ST, { se: '', asm: p.n, zone: a.z || '' }); } renderAll(); onTab('actions'); }
  GS.q = ''; $('#gsIn').value = ''; $('#gsIn').blur(); gsRender();
  toast(`${lv} ${p.n} · ${(PAGES[what === 'profile' ? (lv === 'ASM' ? 'asm' : 'rse') : what] || {}).t || ''}`);
}
/* ---------- “See the 16 KPIs of …” box on the Overview: pick a person, the 16 KPI cards switch to them ---------- */
const KQ = { items: [], act: 0 };
function kqSync() {
  const f = curF(), who = f.se ? 'SE ' + f.se : f.asm ? 'ASM ' + f.asm : f.rsm && !f.zone ? 'RSM ' + f.rsm : f.zone ? f.zone + ' zone' : '';
  if ($('#kqNow')) $('#kqNow').innerHTML = who ? `Showing <b>${esc(who)}</b>` : 'Showing <b>everyone in your view</b>';
  if ($('#kqClear')) $('#kqClear').hidden = !who || ((SEED.meta.user || {}).role && SEED.meta.user.role !== 'admin' && !f.se);
}
function kqPick(p) {
  navPush();
  const base = { rsm: '', zone: '', asm: '', se: '', st: '', dist: '', cat: '' };
  if (p.lvl === 'RSM') Object.assign(ST, base, { rsm: p.n });
  else if (p.lvl === 'ASM') { const a = DB.asms.find(x => x.n === p.n) || {}; Object.assign(ST, base, { asm: p.n, zone: a.z || '' }); }
  else { const s = DB.seInfo.get(p.n) || {}; Object.assign(ST, base, { se: p.n, asm: s.asm || '', zone: s.z || '' }); }
  const inp = $('#kqIn'); inp.value = ''; $('#kqPop').hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.blur();
  renderAll(); if (ST.tab !== 'overview') onTab('overview');
  setTimeout(() => { const t = $('#tileGroups'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  toast(`16 KPIs · ${p.lvl} ${p.n}`);
}
function kqRender() {
  const inp = $('#kqIn'), pop = $('#kqPop'), q = inp.value;
  if (!q.trim()) { pop.hidden = true; inp.setAttribute('aria-expanded', 'false'); return; }
  KQ.items = gsFind(q); if (KQ.act >= KQ.items.length) KQ.act = 0;
  pop.innerHTML = KQ.items.length ? KQ.items.map((p, i) => { const sk = p.status ? PSTAT[p.status] : null;
    return `<div class="kq-it${i === KQ.act ? ' on' : ''}" role="option" aria-selected="${i === KQ.act}" data-ki="${i}"><b>${gsHi(p.n, q)}</b><span class="gs-lv">${p.lvl}</span>${sk ? `<span class="pill s-${sk.k}">${sk.l}</span>` : ''}<small>${esc([p.z && p.z + ' zone', p.lvl === 'SE' && p.asm ? 'ASM ' + p.asm : ''].filter(Boolean).join(' · '))}</small></div>`; }).join('')
    : `<div class="gs-empty">No RSM, ASM or SE matches “${esc(q)}”.</div>`;
  pop.hidden = false; inp.setAttribute('aria-expanded', 'true');
}
function wireKq() {
  const inp = $('#kqIn'), pop = $('#kqPop'); if (!inp) return;
  inp.oninput = () => { KQ.act = 0; kqRender(); };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!KQ.items.length) return; KQ.act = (KQ.act + (e.key === 'ArrowDown' ? 1 : KQ.items.length - 1)) % KQ.items.length; kqRender(); }
    else if (e.key === 'Enter') { e.preventDefault(); const p = KQ.items[KQ.act]; if (p) kqPick(p); }
    else if (e.key === 'Escape') { inp.value = ''; kqRender(); }
  };
  pop.addEventListener('mousedown', e => e.preventDefault());
  pop.addEventListener('click', e => { const it = e.target.closest('[data-ki]'); if (it && KQ.items[+it.dataset.ki]) kqPick(KQ.items[+it.dataset.ki]); });
  document.addEventListener('click', e => { if (!e.target.closest('#kq')) pop.hidden = true; });
  $('#kqClear').onclick = () => { navPush(); Object.assign(ST, { rsm: '', zone: '', asm: '', se: '', st: '', dist: '', cat: '' }); renderAll(); };
  kqSync();
}
function wireSearch() {
  wireKq();
  const inp = $('#gsIn'), pop = $('#gsPop');
  inp.oninput = () => { GS.q = inp.value; GS.act = 0; gsRender(); };
  inp.onfocus = () => { if (GS.q.trim()) gsRender(); };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!GS.items.length) return; GS.act = (GS.act + (e.key === 'ArrowDown' ? 1 : GS.items.length - 1)) % GS.items.length; gsRender(); }
    else if (e.key === 'Enter') { e.preventDefault(); const p = GS.items[GS.act]; if (p) gsGo(p, p.lvl === 'RSM' ? 'rsmAsm' : 'profile'); }
    else if (e.key === 'Escape') { inp.value = ''; GS.q = ''; gsRender(); inp.blur(); }
  };
  pop.addEventListener('mousedown', e => e.preventDefault());   // keep focus in the box while clicking
  pop.addEventListener('click', e => {
    const b = e.target.closest('[data-ga]'), it = e.target.closest('[data-gi]'); if (!it) return;
    const p = GS.items[+it.dataset.gi]; if (p) gsGo(p, b ? b.dataset.ga : p.lvl === 'RSM' ? 'rsmAsm' : 'profile');
  });
  document.addEventListener('click', e => { if (!e.target.closest('#gSearch')) pop.hidden = true; });
  document.addEventListener('keydown', e => {
    const typing = e.target.matches && e.target.matches('input,select,textarea');
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); inp.focus(); inp.select(); }
  });
}

/* ---------- Home ---------- */
const HM_LINKS = [
  ['overview', 'Business Overview', 'Volume, orders, billing, pace and the 16-point scorecard', '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>'],
  ['zones', 'Zone Performance', 'Zones ranked, with their ASMs and SEs', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'],
  ['asm', 'ASM Performance', 'ASM comparison and profiles', '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11l2 2 4-4"/>'],
  ['rse', 'SE Performance', 'Sales executive comparison and profiles', '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
  ['daily', 'Plans & Execution', 'Daily, weekly and monthly plans to send', '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18M8 15l2 2 4-4"/>'],
  ['actions', 'Dealer Analytics', 'Dealers to act on and dealer drill-down', '<path d="M3 9l1.5-5h15L21 9M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8"/>'],
  ['leaderboard', 'Distribution Scorecard', 'All 16 KPIs per SE and ASM', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'],
  ['monthwise', 'Sales Analysis', 'Month-wise performance and trends', '<path d="M3 3v18h18M7 15l4-4 3 3 6-7"/>'],
];
function renderHome() {
  const u = (SEED.meta && SEED.meta.user) || { role: 'admin', name: 'Admin' }, m = SEED.meta;
  const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  $('#hmHello').textContent = `${greet}${u.role === 'admin' ? '' : ', ' + String(u.name).split(' ')[0]}`;
  const built = m.built ? new Date(m.built).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
  $('#hmMeta').innerHTML = [
    ['Reporting period', `${MON[DB.m - 1]} ${DB.y}`, `working day ${DB.wd[DB.maxDay]} of ${DB.wdTotal}`],
    ['Data up to', dLabel(effDay(DB.maxDay)), m.dashDay ? 'targets & orders · billing to ' + dLabel(DB.maxDay) : 'billing lines'],
    ['Last refresh', built, esc(m.fromWorkbook || (DB.source === 'upload' ? DB.srcName : 'data pack'))],
  ].map(([l, v, s]) => `<div class="hm-m"><span>${l}</span><b>${v}</b><small>${s}</small></div>`).join('');
  // snapshot = the same figures as the Overview's executive strip (perfOf / teamCounts for the current filters)
  const f = curF(), p = perfOf(f), rses = rseRows(), tc = teamCounts(rses);
  $('#hmScope').textContent = `· ${scopeLbl()} · to ${dLabel(effDay(ST.day))}`;
  // icon + colour per card (presentation); value and sub-line are the existing figures
  const IC = { target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>', order: '<path d="M6 2l1.5 4h9L18 2M3 6h18l-2 14H5z"/><path d="M9 11h6"/>', bill: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    pace: '<path d="M12 13l4-4"/><path d="M3.5 18a9 9 0 1 1 17 0"/>', bal: '<path d="M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0z"/>', team: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>' };
  const bar = v => v == null ? '' : `<span class="hm-kbar"><i style="width:${Math.max(2, Math.min(100, v * 100))}%"></i></span>`;
  const kpi = (l, v, s, st, go, ic, tone, pct) => `<div class="card hm-k tone-${tone}${st ? ' st-' + st : ''}${go ? ' click' : ''}"${go ? ` data-go="${go}" role="button" tabindex="0"` : ''}><span class="hm-kh"><span class="hm-kic"><svg viewBox="0 0 24 24">${IC[ic]}</svg></span><span class="hm-kl">${l}</span></span><b class="num">${v}</b>${bar(pct)}<span class="hm-ks">${s}</span></div>`;
  $('#hmKpis').innerHTML = kpi('Target', p.plan ? fN(p.plan) : '–', p.plan ? `${MON[DB.m - 1]} volume plan` : 'No plan in the data', '', 'tab:overview', 'target', 'blue')
    + (p.official ? kpi('Ordered MTD', fN(p.orders), `${fP(p.orderPct)} of target`, '', 'tab:overview', 'order', 'indigo', p.orderPct) : '')
    + kpi('Billed MTD', fN(p.mtd), `${fP(p.ach)} of target`, '', 'tab:overview', 'bill', 'teal', p.ach)
    + kpi('Vs pace', p.pace == null ? '–' : fP(p.pace), PSTAT[p.status].l, PSTAT[p.status].k, 'tab:overview', 'pace', 'amber', p.pace)
    + kpi(p.official ? 'Balance' : 'Gap to plan', p.gap == null ? '–' : fN(p.gap), p.official ? `need ${fN(p.need)}/day · ${p.daysLeft} days left` : `${p.wdLeft} working days left`, '', 'tab:overview', 'bal', 'rose')
    + kpi('SEs on track', `${fN(tc.ok)}<small> / ${fN(rses.length)}</small>`, `${fN(tc.under)} need improvement`, tc.under ? 'crit' : 'good', 'tab:rse', 'team', 'green', rses.length ? tc.ok / rses.length : null);
  // heroes in action = the existing ranking (rankRows: by vs pace) within the current filters, top 5 SEs + top 3 ASMs
  const real = x => x.rank && !/^(vacant|tba)\b/i.test(x.name);
  const rk = rankRows(rses.slice()).filter(real).sort((a, b) => a.rank - b.rank), ra = rankRows(asmRows()).filter(real).sort((a, b) => a.rank - b.rank);
  const showA = (SEED.meta.user || {}).role !== 'SE' && ra.length;
  const ini = n => String(n).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hero = (x, lbl, cls) => `<div class="card hm-hero-c ${cls}" data-go="p:${x.lvl}:${esc(x.name)}" role="button" tabindex="0">
      <div class="hh-top"><span class="hh-rank">${lbl}</span>${x.p.status ? `<span class="pill s-${PSTAT[x.p.status].k}">${PSTAT[x.p.status].l}</span>` : ''}</div>
      <div class="hh-who"><span class="hh-av">${esc(ini(x.name))}</span><span><b>${esc(x.name)}</b><small>${esc([x.zone, x.lvl === 'SE' && x.asm ? 'ASM ' + x.asm : x.lvl === 'ASM' ? plural((x.team || []).length, 'SE') : ''].filter(Boolean).join(' · '))}</small></span></div>
      <div class="hh-fig"><b class="num">${fP(x.p.pace)}</b><span>vs pace</span></div>
      <span class="hh-bar"><i style="width:${Math.min(100, (x.p.pace || 0) / 1.5 * 100)}%"></i></span>
      <div class="hh-sub">Billed <b class="num">${fN(x.p.mtd)}</b>${x.p.plan ? ` of ${fN(x.p.plan)}` : ''}${x.p.official ? ` · ordered ${fP(x.p.orderPct)}` : ''}</div></div>`;
  $('#hmHeroNote').textContent = rk.length ? `· top performers by vs pace · ${scopeLbl()} · to ${dLabel(effDay(ST.day))}` : '';
  const medal = (x, i) => `#${x.rank}${i < 3 ? ' ' + ['Gold', 'Silver', 'Bronze'][i] : ''}`;
  const grp = (lvl, list, n, of) => `<div class="hm-hg"><div class="hm-hg-h"><b>Top ${Math.min(n, list.length)} ${lvl}s</b><span class="muted small">of ${fN(of)} ranked</span><button class="btn sm" type="button" data-go="rank:${lvl}">Full ${lvl} ranking →</button></div>
    <div class="hm-heroes n${n}">${list.slice(0, n).map((x, i) => hero(x, medal(x, i), i < 3 ? 'm' + (i + 1) : '')).join('')}</div></div>`;
  $('#hmHeroes').innerHTML = rk.length || showA ? (rk.length ? grp('SE', rk, 5, rk.length) : '') + (showA ? grp('ASM', ra, 3, ra.length) : '')
    : '<p class="muted" style="margin:0">No ranked SEs in this scope yet.</p>';
  // alerts = the Overview's insights (top 4)
  const ins = insightsFor(f, ST.day); $('#hmAlertN').textContent = ins.length ? plural(ins.length, 'insight') : '';
  $('#hmAlerts').innerHTML = ins.length ? ins.slice(0, 4).map(x => `<div class="hm-al ${x.sev}"><i></i><div><b>${esc(x.h)}</b><p>${esc(x.p)}</p></div></div>`).join('') + (ins.length > 4 ? `<button class="btn sm" type="button" data-go="tab:overview">All ${ins.length} insights →</button>` : '') : '<p class="muted">No alerts for this scope.</p>';
  // team status = the SE status counts
  const order = ['ok', 'watch', 'behind', 'crit', 'nd'], cnt = k => rses.filter(x => x.p.status === k).length, tot = rses.length || 1;
  $('#hmTeam').innerHTML = `<div class="hm-bar">${order.map(k => cnt(k) ? `<i class="s-${PSTAT[k].k}" style="flex:${cnt(k)}" title="${PSTAT[k].l}: ${cnt(k)}"></i>` : '').join('')}</div>
    <div class="hm-leg">${order.map(k => `<div class="kv click" data-go="tab:rse"><span><i class="dot s-${PSTAT[k].k}"></i>${PSTAT[k].l}</span><b class="num">${fN(cnt(k))} <small class="muted">${fP(cnt(k) / tot)}</small></b></div>`).join('')}</div>
    ${SEED.monthly && typeof monthRows === 'function' ? (() => { const all = monthRows('ASM').concat(monthRows('SE')), sent = all.filter(x => sentOf(SEED.monthly, x.lvl, x.n)).length; return `<div class="kv click" data-go="tab:monthly" style="margin-top:6px"><span>${esc(SEED.monthly.label)} plan cards sent</span><b class="num">${fN(sent)} / ${fN(all.length)}</b></div>`; })() : ''}`;
  $('#hmLinks').innerHTML = HM_LINKS.filter(([t]) => { const b = $(`.sidenav .tab[data-tab="${t}"]`); return b && getComputedStyle(b).display !== 'none'; })
    .map(([t, l, s, ic]) => `<button type="button" class="card hm-link" data-go="tab:${t}"><span class="hm-ic"><svg viewBox="0 0 24 24">${ic}</svg></span><span><b>${esc(l)}</b><small>${esc(s)}</small></span></button>`).join('');
  $('#hmData').innerHTML = dataStatusHTML(true);
}

/* ---------- Data Management ---------- */
function dataStatusHTML(short) {
  const m = SEED.meta, up = DB.source === 'upload', w = m.warnings || [];
  const built = m.built ? new Date(m.built).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '–';
  const rows = [
    ['Status', `<span class="pill s-good">Loaded</span>${up ? ' <span class="pill s-warn">Daily dump on top</span>' : ''}`],
    ['Source', esc(up ? DB.srcName : (m.fromWorkbook || 'data pack'))],
    ['Data up to', `${dLabel(effDay(DB.maxDay))} ${DB.y}${m.dashDay ? ' (targets & orders) · billing to ' + dLabel(DB.maxDay) : ''}`],
    ['Last refresh', up && DB.uploadedAt ? new Date(DB.uploadedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : built],
    ['Where it comes from', esc(PACK_SRC || '–')],
    ['Dealers · billing lines', `${fN(DB.n)} · ${DB.lines != null ? fN(DB.lines) : SEED.lines != null ? fN(SEED.lines) : '–'}`],
    ['History kept', SEED.history && SEED.history.months ? Object.keys(SEED.history.months).sort().map(mwLbl).join(', ') : '–'],
    ['Data notes', w.length ? `<a href="#method" data-go="tab:method">${plural(w.length, 'note')} in Data checks</a>` : '<span class="yes">none ✓</span>'],
  ];
  return `<div class="dm-kv">${(short ? rows.filter((r, i) => [0, 1, 2, 3, 7].includes(i)) : rows).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
}
function renderData() {
  $('#dataStatus').innerHTML = dataStatusHTML(false);
  const pg = $('#upProg');   // an upload that just finished: replace its last progress line with the result
  if (pg.querySelector('.spin') && SEED.meta.built && Date.now() - Date.parse(SEED.meta.built) < 180000)
    pg.innerHTML = `<b style="color:var(--good)">✓ Loaded ${esc(SEED.meta.fromWorkbook || 'the file')}</b> — data to ${esc(dLabel(effDay(DB.maxDay)))} ${DB.y}. All pages are updated.`;
  const w = SEED.meta.warnings || [];
  $('#dataNotes').innerHTML = w.length ? `<ul class="dm-notes">${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No notes — every expected sheet was read.</p>';
}
