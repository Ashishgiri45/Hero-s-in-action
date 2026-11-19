'use strict';
/* ================= logins: admin, ASM, SE =================
   js/data.js sets window.ENC_USERS = { v: 2, iter, asOf, month, users: { <id hash>: { role, salt, iv, ct } } }.
   Each user's envelope holds only their slice of the data, encrypted with a key from their password:
     admin → everything · ASM → their team's dealers and SEs · SE → their own dealers.
   Login id = work email from the Contacts sheet (admin: "admin"). Default password rule (as requested):
   first name in lower case + "@hero", e.g. Amarjeet Kanaujiya → amarjeet@hero. This is easy to guess —
   see README → Logins. */

const pwRule = name => String(name).trim().split(/\s+/)[0].toLowerCase() + '@hero';
const idHash = async id => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('djp|' + String(id).trim().toLowerCase()))));

/* slice the data pack for one ASM or SE */
function scopePack(pack, role, name) {
  const P = pack, D = P.dealers, keep = [];
  for (let i = 0; i < D.c.length; i++) if (role === 'ASM' ? D.asm[i] === name : D.se[i] === name) keep.push(i);
  const map = new Map(keep.map((i, j) => [i, j])), nd = {};
  for (const k in D) nd[k] = keep.map(i => D[k][i]);
  const ses = role === 'ASM' ? P.ses.filter(s => s.asm === name) : P.ses.filter(s => s.n === name);
  const seNames = new Set(ses.map(s => s.n)), asmName = role === 'ASM' ? name : (ses[0] || {}).asm;
  const pick = (obj, ok) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => ok(k)));
  return Object.assign({}, P, {
    meta: Object.assign({}, P.meta, { user: { role, name } }),
    dealers: nd,
    facts: P.facts.filter(f => map.has(f[0])).map(f => [map.get(f[0]), ...f.slice(1)]),
    orders: (P.orders || []).filter(o => map.has(o[0])).map(o => [map.get(o[0]), ...o.slice(1)]),
    ses, asms: P.asms.filter(a => a.n === asmName),
    pjpSE: pick(P.pjpSE, n => seNames.has(n)), pjpASM: role === 'ASM' ? pick(P.pjpASM, n => n === name) : {},
    dists: (P.dists || []).filter(d => seNames.has(d.se)),
    contacts: pick(P.contacts, n => seNames.has(n) || n === name),
    dash: P.dash ? { SE: pick(P.dash.SE, n => seNames.has(n)), ASM: role === 'ASM' ? pick(P.dash.ASM, n => n === name) : {} } : undefined,
    monthly: P.monthly ? monthlySlice(P.monthly, role, name) : undefined,
    contest: P.contest ? Object.assign({}, P.contest, { rows: P.contest.rows.filter(r => role === 'ASM' ? r.asm === name : r.se === name) }) : undefined,
    pend: P.pend ? Object.assign({}, P.pend, { d: pick(P.pend.d, c => nd.c.includes(+c)) }) : undefined,
    field: P.field ? Object.assign({}, P.field, { SE: pick(P.field.SE, n => seNames.has(n)), ASM: role === 'ASM' ? pick(P.field.ASM, n => n === name) : {} }) : undefined,
    jplan: P.jplan ? Object.assign({}, P.jplan, Object.fromEntries(['rows', 'cnt'].map(k => [k, { SE: pick(P.jplan[k].SE, n => seNames.has(n)), ASM: role === 'ASM' ? pick(P.jplan[k].ASM, n => n === name) : {} }]))) : undefined,
    history: P.history ? { months: Object.fromEntries(Object.entries(P.history.months).map(([ym, h]) => [ym, Object.assign({}, h, {
      Z: {}, ASM: role === 'ASM' ? pick(h.ASM, n => n === name) : {},
      SE: pick(h.SE, n => role === 'ASM' ? (h.SE[n].asm === name || seNames.has(n)) : n === name) })])) } : undefined,
  });
}
/* the monthly plan for one ASM (own row + team) or SE (own row) */
function monthlySlice(m, role, name) {
  const se = m.se.filter(s => role === 'ASM' ? s.asm === name : s.n === name), asm = role === 'ASM' ? m.asm.filter(a => a.n === name) : [];
  const keep = new Set(se.map(s => s.n)), pa = new Set(asm.map(a => a.prevOf || a.n));
  const prev = m.prev ? { ym: m.prev.ym, asOf: m.prev.asOf, SE: Object.fromEntries(Object.entries(m.prev.SE).filter(([n]) => keep.has(n))), ASM: Object.fromEntries(Object.entries(m.prev.ASM).filter(([n]) => pa.has(n))) } : null;
  return Object.assign({}, m, { se, asm, prev });
}
/* everyone who can log in: admin + every ASM / SE with an email in Contacts */
function loginList(pack) {
  const out = [], seen = new Set(), asms = new Set(pack.asms.map(a => a.n)), ses = new Set(pack.ses.map(s => s.n));
  for (const [name, c] of Object.entries(pack.contacts || {})) {
    if (!c.email || seen.has(c.email.toLowerCase())) continue;
    const role = /asm/i.test(c.role) || (asms.has(name) && !ses.has(name)) ? 'ASM' : 'SE';
    if (role === 'ASM' ? !asms.has(name) : !ses.has(name)) continue;
    seen.add(c.email.toLowerCase()); out.push({ id: c.email.trim(), name, role, pw: pwRule(name) });
  }
  return out;
}
async function encryptFor(pack, pw) { return encryptPack(pack, pw); }
/* build window.ENC_USERS for the whole team (admin password = team password) */
async function buildUsers(pack, adminPw, say = () => {}) {
  const list = loginList(pack), users = {};
  say(`Encrypting for admin…`); users[await idHash('admin')] = Object.assign({ role: 'admin' }, await encryptFor(Object.assign({}, pack, { meta: Object.assign({}, pack.meta, { user: { role: 'admin', name: 'Admin' } }) }), adminPw));
  for (const [i, u] of list.entries()) { say(`Encrypting ${i + 1} of ${list.length}: ${u.name}…`); await tick(); users[await idHash(u.id)] = Object.assign({ role: u.role }, await encryptFor(scopePack(pack, u.role, u.name), u.pw)); }
  for (const v of Object.values(users)) { delete v.asOf; delete v.month; }
  return { env: { v: 2, iter: ENC_ITER, asOf: pack.meta.asOf, month: pack.meta.month, users }, list };
}

/* login screen */
async function loginFlow(env, onOpen) {
  document.body.classList.add('nodata'); $('#lock').hidden = false; $('#onboard').hidden = true;
  $('#lockAsOf').textContent = `data to ${env.asOf}`;
  const prog = $('#lockProg');
  try { const s = JSON.parse(store.get(KEY_STORE) || 'null'); const u = s && env.users[s.id];
    if (u && s.salt === u.salt) { prog.innerHTML = '<span class="spin"></span>Opening…'; const key = await crypto.subtle.importKey('raw', ub64(s.k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); return onOpen(await decryptEnv(u, key)); } } catch (e) { store.del(KEY_STORE); prog.textContent = ''; }
  $('#lockId').focus();
  $('#lockForm').onsubmit = async e => {
    e.preventDefault(); prog.innerHTML = '<span class="spin"></span>Checking…';
    const id = await idHash($('#lockId').value), u = env.users[id];
    if (!u) { prog.innerHTML = '<b style="color:var(--crit)">This login id is not registered.</b> Use your work email (as in the Contacts sheet).'; return; }
    try {
      const key = await deriveKey($('#lockPw').value, ub64(u.salt), env.iter || ENC_ITER), pack = await decryptEnv(u, key);
      if ($('#lockRemember').checked) store.set(KEY_STORE, JSON.stringify({ id, salt: u.salt, k: b64(await crypto.subtle.exportKey('raw', key)) })); else store.del(KEY_STORE);
      $('#lockPw').value = ''; onOpen(pack);
    } catch (err) { prog.innerHTML = '<b style="color:var(--crit)">Wrong password.</b>'; }
  };
}
async function logout() { store.del(KEY_STORE); store.del(PACK_KEY); store.del(UPKEY); if (window.FB) { try { await FB.auth.signOut(); } catch (e) {} } location.reload(); }
/* role-based view: admins see everything; ASM / SE see their own slice and no admin tools */
function applyRole() {
  const u = (SEED.meta && SEED.meta.user) || { role: 'admin', name: 'Admin' };
  document.body.classList.toggle('role-se', u.role === 'SE'); document.body.classList.toggle('role-asm', u.role === 'ASM'); document.body.classList.toggle('role-user', u.role !== 'admin');
  $('#who').hidden = !window.ENC_USERS && !window.FB; $('#whoName').textContent = `${u.name} · ${u.role === 'admin' ? 'Admin' : u.role}`;
  if (u.role === 'SE') { ST.rseSel = u.name; ST.planLvl.daily = 'SE'; ST.planLvl.weekly = 'SE'; }
  if (u.role === 'ASM') { ST.asmSel = u.name; }
}
