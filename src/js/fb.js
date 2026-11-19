'use strict';
/* ================= Firebase: sign-in + data from Firestore =================
   Used when the site runs on Firebase Hosting (it serves /__/firebase/init.json). Elsewhere (local file,
   python http.server, the old Netlify site) the app keeps its previous behaviour.

   Sign-in: email + password that each person sets themselves ("First time? Set your password"), then a
   verification email. Spark (free) plan only allows 5 sign-in-LINK emails a day, so links are not used.
   Data in Firestore (written by the admin's "Publish to team" button, see fbPublish):
     access/{email}              { role: 'admin'|'ASM'|'SE', name, asOf, b }      who may sign in
     packs/{email | _admin}      { role, name, asOf, month, built, b, n }          one pack per person
     packs/{id}/chunks/{i}       { b, i, d }   d = base64( gzip( JSON pack ) ), split in < 900 KB parts
   firestore.rules: a verified email reads only its own access + pack; admins read and write everything. */

const FB_VER = '10.14.1';
const FB_CHUNK = 700000;                 // base64 characters per chunk document (Firestore limit is 1 MiB)
const FB_ADMIN_ID = '_admin';
const FB_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

function fbScript(src) {
  return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load ' + src)); document.head.appendChild(s); });
}
/* Firebase Hosting (and its emulator) serve the project config here; anywhere else -> null (old mode) */
async function fbInit() {
  if (location.protocol === 'file:') return null;
  let cfg = null;
  try { const r = await fetch('/__/firebase/init.json', { cache: 'no-store' }); if (r.ok) cfg = await r.json(); } catch (e) { return null; }
  if (!cfg || !cfg.projectId) return null;
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
  await fbScript(base + 'firebase-app-compat.js');
  await Promise.all([fbScript(base + 'firebase-auth-compat.js'), fbScript(base + 'firebase-firestore-compat.js')]);
  const app = firebase.initializeApp(cfg), auth = app.auth(), db = app.firestore();
  if (FB_LOCAL && cfg.projectId.startsWith('demo-')) {            // local test with the emulators
    auth.useEmulator('http://127.0.0.1:9099'); db.useEmulator('127.0.0.1', 8080);
  }
  window.FB = { app, auth, db, cfg };
  return window.FB;
}

/* ---------- pack storage ---------- */
const fbB64 = buf => b64(buf);
const fbUnb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const fbStream = async (bytes, tr) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(tr)).arrayBuffer());
async function fbPackOut(pack) { return fbB64(await fbStream(new TextEncoder().encode(JSON.stringify(pack)), new CompressionStream('gzip'))); }
async function fbPackIn(s) { return JSON.parse(new TextDecoder().decode(await fbStream(fbUnb64(s), new DecompressionStream('gzip')))); }

async function fbReadPack(id) {
  const ref = FB.db.collection('packs').doc(id);
  for (let attempt = 0; attempt < 4; attempt++) {
    const m = await ref.get();
    if (!m.exists) return null;
    const meta = m.data();
    const cs = await ref.collection('chunks').where('b', '==', meta.b).get();
    if (cs.size === meta.n) {
      const parts = cs.docs.map(d => d.data()).sort((a, b) => a.i - b.i).map(c => c.d);
      return fbPackIn(parts.join(''));
    }
    await new Promise(r => setTimeout(r, 2000));         // a publish is running: wait and read again
  }
  throw new Error('The data is being updated right now - refresh the page in a minute.');
}
async function fbWritePack(id, pack, info, b) {
  const s = await fbPackOut(pack), n = Math.max(1, Math.ceil(s.length / FB_CHUNK)), ref = FB.db.collection('packs').doc(id);
  for (let i = 0; i < n; i++) await ref.collection('chunks').doc(String(i)).set({ b, i, d: s.slice(i * FB_CHUNK, (i + 1) * FB_CHUNK) });
  await ref.set(Object.assign({ asOf: pack.meta.asOf, month: pack.meta.month, built: new Date().toISOString(), b, n }, info));
  const old = await ref.collection('chunks').get();      // parts left over from a bigger earlier pack
  for (const d of old.docs) if (d.data().b !== b) await d.ref.delete();
  return s.length;
}
async function fbDeletePack(id) {
  const ref = FB.db.collection('packs').doc(id), cs = await ref.collection('chunks').get();
  for (const d of cs.docs) await d.ref.delete();
  await ref.delete();
}

/* ---------- admin: publish the data loaded now to everyone ---------- */
async function fbPublish(say) {
  const pack = SEED, b = Date.now().toString(36), list = loginList(pack);
  if (!list.length) throw new Error('No ASM / SE has an email in the Contacts sheet, so nobody else could sign in.');
  say('Saving the full data for admins…');
  await fbWritePack(FB_ADMIN_ID, Object.assign({}, pack, { meta: Object.assign({}, pack.meta, { user: { role: 'admin', name: 'Admin' } }) }), { role: 'admin', name: 'Admin' }, b);
  const acc = await FB.db.collection('access').get(), cur = new Map(acc.docs.map(d => [d.id, d.data()]));
  const keep = new Set();
  for (const [i, u] of list.entries()) {
    const id = u.id.trim().toLowerCase(); keep.add(id);
    say(`Saving ${i + 1} of ${list.length}: ${u.name}…`); await tick();
    await fbWritePack(id, scopePack(pack, u.role, u.name), { role: u.role, name: u.name }, b);
    const was = cur.get(id);
    if (!(was && was.role === 'admin')) await FB.db.collection('access').doc(id).set({ role: u.role, name: u.name, asOf: pack.meta.asOf, b });
  }
  let removed = 0;                                        // people no longer in Contacts lose access
  for (const [id, a] of cur) if (!keep.has(id) && a.role !== 'admin') { say(`Removing ${a.name || id}…`); await FB.db.collection('access').doc(id).delete(); await fbDeletePack(id).catch(() => {}); removed++; }
  return { n: list.length, removed, list };
}

function fbWirePublish() {
  $('#btnPublish').textContent = 'Publish to team';
  if ($('#dmPubTxt')) $('#dmPubTxt').innerHTML = '<b>Publish to team</b> saves the data loaded now to the database: admins get everything, each ASM / SE with an email in the <b>Contacts</b> sheet gets only their own part. Everyone sees it when they open or refresh the site. No file to download, no redeploy.';
  if ($('#dmPubStep')) $('#dmPubStep').innerHTML = 'When the team should see it: <b>Publish to team</b>.';
  $('#pubTitle').textContent = 'Publish to team';
  $('#pubTxt').innerHTML = 'Saves the data loaded now (<span id="pubAsOf"></span>) for admins and for every ASM / SE with an email in the Contacts sheet. People who are no longer in Contacts lose access. Takes about a minute.';
  const pw = $('#pubPw'); pw.hidden = true; pw.required = false;
  $('#pubGo').textContent = 'Publish now';
  $('#btnPublish').onclick = () => { $('#pubAsOf').textContent = `data to ${SEED.meta.asOf}${SEED.meta.fromWorkbook ? ' · ' + SEED.meta.fromWorkbook : ''}`; $('#pubProg').textContent = ''; $('#pubOv').hidden = false; $('#pubGo').focus(); };
  $('#pubForm').onsubmit = async e => {
    e.preventDefault(); const prog = $('#pubProg'), go = $('#pubGo');
    if (SEED.meta.user && SEED.meta.user.role !== 'admin') { prog.innerHTML = '<b style="color:var(--crit)">Only an admin can publish.</b>'; return; }
    go.disabled = true;
    try {
      const r = await fbPublish(t => prog.innerHTML = `<span class="spin"></span>${esc(t)}`);
      prog.innerHTML = `<b>Published</b> - data to ${esc(SEED.meta.asOf)} for admins + ${r.n} ASM / SE logins${r.removed ? ` (${r.removed} removed)` : ''}.`;
      await downloadWorkbook(`Access_list_${SEED.meta.asOf}`, [{ name: 'Access', title: '16-Point KPI Tracker - who can sign in', meta: [['Data to', SEED.meta.asOf], ['How to sign in', 'Open the site > First time? Set your password > use the work email below']],
        cols: [{ h: 'Name', k: 'name', w: 26 }, { h: 'Role', k: 'role', w: 8 }, { h: 'Work email', k: 'id', w: 36 }], rows: r.list.map(u => ({ name: u.name, role: u.role, id: u.id })) }]).catch(() => {});
    } catch (err) { console.error(err); prog.innerHTML = `<b style="color:var(--crit)">Not published:</b> ${esc(err.message || err)}`; }
    go.disabled = false;
  };
}

/* ---------- sign-in screen ---------- */
function fbLockMode(mode) {
  const f = $('#lockForm'); f.dataset.mode = mode;
  $('#lockPw').hidden = mode === 'reset'; $('#lockPw').required = mode !== 'reset';
  $('#lockPw2').hidden = mode !== 'signup'; $('#lockPw2').required = mode === 'signup';
  $('#lockPw').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('#lockGo').textContent = { signin: 'Sign in', signup: 'Set password', reset: 'Send reset email' }[mode];
  $('#lockLinks').innerHTML = mode === 'signin'
    ? '<a href="#" data-lm="signup">First time? Set your password</a> · <a href="#" data-lm="reset">Forgot password?</a>'
    : '<a href="#" data-lm="signin">Back to sign in</a>';
  $$('#lockLinks [data-lm]').forEach(a => a.onclick = e => { e.preventDefault(); $('#lockProg').textContent = ''; fbLockMode(a.dataset.lm); });
}
const fbErr = e => ({
  'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.', 'auth/user-not-found': 'No password set for this email yet - use “First time? Set your password”.',
  'auth/email-already-in-use': 'This email already has a password - sign in, or use “Forgot password?”.', 'auth/weak-password': 'Use at least 8 characters.',
  'auth/invalid-email': 'This is not a valid email address.', 'auth/too-many-requests': 'Too many tries - wait a few minutes and try again.', 'auth/network-request-failed': 'No internet connection.'
}[e && e.code] || (e && e.message) || String(e));

function fbSignIn(onOpen, fail) {
  const { auth } = FB, prog = $('#lockProg');
  document.body.classList.add('nodata'); $('#lock').hidden = false; $('#onboard').hidden = true;
  $('#lockAsOf').textContent = 'latest';
  $('#lockRemember').closest('label').hidden = false;
  fbLockMode('signin');
  let opening = false;
  auth.onAuthStateChanged(async user => {
    if (!user || opening) return;
    if (!user.emailVerified) {
      prog.innerHTML = `<b style="color:var(--crit)">Please verify your email first.</b> Open the link we sent to ${esc(user.email)}, then sign in again. <a href="#" id="fbResend">Send the link again</a>`;
      $('#fbResend').onclick = async e => { e.preventDefault(); try { await user.sendEmailVerification({ url: location.origin + '/' }); prog.innerHTML = 'Link sent again - check your inbox (and Spam).'; } catch (x) { prog.innerHTML = esc(fbErr(x)); } await auth.signOut(); };
      return;
    }
    opening = true; prog.innerHTML = '<span class="spin"></span>Opening your data…';
    try {
      // a token issued before the email was verified still says "not verified" to the database rules - get a fresh one
      if (!(await user.getIdTokenResult()).claims.email_verified) await user.getIdToken(true);
      const email = user.email.toLowerCase();
      let me = null;
      try { const a = await FB.db.collection('access').doc(email).get(); me = a.exists ? a.data() : null; } catch (x) { me = null; }
      const admin = await FB.db.collection('packs').doc(FB_ADMIN_ID).get().then(() => true, () => false);
      const pack = admin ? await fbReadPack(FB_ADMIN_ID) : (me ? await fbReadPack(email) : null);   // admin before the first publish: null
      if (!pack && !admin) {
        prog.innerHTML = `<b style="color:var(--crit)">${esc(user.email)} is not on the access list yet.</b> Ask your admin to add your email to the Contacts sheet and publish again.`;
        opening = false; await auth.signOut(); return;
      }
      $('#lock').hidden = true;
      onOpen(pack, { email, admin, name: (me && me.name) || user.email });
    } catch (x) { console.error(x); opening = false; prog.innerHTML = `<b style="color:var(--crit)">Could not open the data:</b> ${esc(x.message || x)}`; }
  });
  $('#lockForm').onsubmit = async e => {
    e.preventDefault();
    const mode = $('#lockForm').dataset.mode, email = $('#lockId').value.trim(), pw = $('#lockPw').value;
    try {
      await auth.setPersistence($('#lockRemember').checked ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
      if (mode === 'reset') { prog.innerHTML = '<span class="spin"></span>Sending…'; await auth.sendPasswordResetEmail(email, { url: location.origin + '/' }); prog.innerHTML = 'If this email can sign in, a reset link is on its way - check your inbox (and Spam).'; return; }
      if (mode === 'signup') {
        if (pw.length < 8) { prog.innerHTML = '<b style="color:var(--crit)">Use at least 8 characters.</b>'; return; }
        if (pw !== $('#lockPw2').value) { prog.innerHTML = '<b style="color:var(--crit)">The two passwords are different.</b>'; return; }
        prog.innerHTML = '<span class="spin"></span>Setting your password…';
        const c = await auth.createUserWithEmailAndPassword(email, pw);
        await c.user.sendEmailVerification({ url: location.origin + '/' });
        await auth.signOut();
        $('#lockPw').value = $('#lockPw2').value = ''; fbLockMode('signin');
        prog.innerHTML = `<b>Almost done.</b> We sent a link to ${esc(email)} - open it to confirm your email (check Spam too), then sign in here.`;
        return;
      }
      prog.innerHTML = '<span class="spin"></span>Signing in…';
      await auth.signInWithEmailAndPassword(email, pw);
      $('#lockPw').value = '';
    } catch (x) { prog.innerHTML = `<b style="color:var(--crit)">${esc(fbErr(x))}</b>`; }
  };
}
