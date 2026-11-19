'use strict';
/* ================= built-in data, encrypted =================
   js/data.js sets window.ENC_DATA = { v, iter, salt, iv, ct, asOf, month }.
   ct = AES-256-GCM( gzip( JSON data ) ), key = PBKDF2-SHA256(team password, salt, iter).
   Without the password the file is unreadable; build.py (Python) and "Publish update" (browser) write
   the same format. "Remember on this device" keeps the derived key in this browser only. */

const KEY_STORE = 'djp.key.v1';
const ENC_ITER = 310000;
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pw, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
const streamBytes = async (bytes, tr) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(tr)).arrayBuffer());
async function decryptEnv(env, key) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(env.iv) }, key, ub64(env.ct));
  return JSON.parse(new TextDecoder().decode(await streamBytes(new Uint8Array(pt), new DecompressionStream('gzip'))));
}
async function encryptPack(pack, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pw, salt, ENC_ITER);
  const gz = await streamBytes(new TextEncoder().encode(JSON.stringify(pack)), new CompressionStream('gzip'));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, gz));
  return { v: 1, iter: ENC_ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct), asOf: pack.meta.asOf, month: pack.meta.month };
}
async function rememberKey(key, env) { try { store.set(KEY_STORE, JSON.stringify({ salt: env.salt, k: b64(await crypto.subtle.exportKey('raw', key)) })); } catch (e) {} }
async function rememberedKey(env) {
  try { const s = JSON.parse(store.get(KEY_STORE) || 'null'); if (!s || s.salt !== env.salt) return null;
    return await crypto.subtle.importKey('raw', ub64(s.k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); } catch (e) { return null; }
}

/* lock screen for the published site */
async function unlockFlow(env, onOpen) {
  document.body.classList.add('nodata'); $('#lock').hidden = false; $('#onboard').hidden = true;
  $('#lockAsOf').textContent = `data to ${env.asOf}`;
  const prog = $('#lockProg');
  const k0 = await rememberedKey(env);
  if (k0) { try { prog.innerHTML = '<span class="spin"></span>Opening…'; return onOpen(await decryptEnv(env, k0)); } catch (e) { store.del(KEY_STORE); prog.textContent = ''; } }
  $('#lockPw').focus();
  $('#lockForm').onsubmit = async e => {
    e.preventDefault(); prog.innerHTML = '<span class="spin"></span>Checking password…';
    try {
      const key = await deriveKey($('#lockPw').value, ub64(env.salt), env.iter || ENC_ITER);
      const pack = await decryptEnv(env, key);
      if ($('#lockRemember').checked) await rememberKey(key, env); else store.del(KEY_STORE);
      $('#lockPw').value = ''; onOpen(pack);
    } catch (err) { prog.innerHTML = '<b style="color:var(--crit)">Wrong password.</b> Ask your admin for the team password.'; }
  };
}

/* admin: publish the currently loaded data as a new encrypted js/data.js */
function wirePublish() {
  $('#btnPublish').onclick = () => { $('#pubAsOf').textContent = `data to ${SEED.meta.asOf}${SEED.meta.fromWorkbook ? ' · ' + SEED.meta.fromWorkbook : ''}`; $('#pubProg').textContent = ''; $('#pubOv').hidden = false; $('#pubPw').focus(); };
  $('#pubClose').onclick = () => $('#pubOv').hidden = true;
  $('#pubForm').onsubmit = async e => {
    e.preventDefault(); const prog = $('#pubProg');
    try {
      if (SEED.meta.user && SEED.meta.user.role !== 'admin') { prog.innerHTML = '<b style="color:var(--crit)">Only the admin can publish.</b>'; return; }
      const adm = window.ENC_USERS && window.ENC_USERS.users[await idHash('admin')];
      if (adm) { try { await decryptEnv(adm, await deriveKey($('#pubPw').value, ub64(adm.salt), window.ENC_USERS.iter)); }
        catch (x) { prog.innerHTML = '<b style="color:var(--crit)">This is not the current admin password.</b> Use the same password so the admin login keeps working.'; return; } }
      const pw = $('#pubPw').value;
      const { env, list } = await buildUsers(SEED, pw, t => prog.innerHTML = `<span class="spin"></span>${esc(t)}`);
      saveBlob(new Blob([`/* 16-Point KPI Tracker — encrypted data and logins (${env.asOf}). Replace js/data.js with this file. */\nwindow.ENC_USERS = ${JSON.stringify(env)};\n`], { type: 'text/javascript' }), 'data.js');
      await downloadWorkbook(`Logins_${env.asOf}`, [{ name: 'Logins', title: '16-Point KPI Tracker — logins', meta: [['Data to', env.asOf], ['Admin login', 'admin (admin password)'], ['Rule', 'Login id = work email · password = first name in lower case + @hero']],
        cols: [{ h: 'Name', k: 'name', w: 26 }, { h: 'Role', k: 'role', w: 8 }, { h: 'Login id (email)', k: 'id', w: 36 }, { h: 'Password', k: 'pw', w: 18 }], rows: list }]);
      $('#pubPw').value = ''; prog.innerHTML = `<b>data.js downloaded</b> (data to ${esc(env.asOf)}; admin + ${list.length} logins). Put it in the <code>js</code> folder of DJP_Dashboard_Netlify_Upload, replacing the old one, then drag that folder to Netlify. The login list (Excel) is for you only.`;
    } catch (err) { console.error(err); prog.textContent = 'Could not encrypt: ' + (err.message || err); }
  };
}
