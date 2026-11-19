"""Build the 16-Point Evaluation Tracker.

  python build.py                                  -> dist/  (Netlify; includes src/js/data.js if present)
  python build.py --publish PACK.json --password-file PW.txt
                                                   -> src/js/data.js: the data, AES-256-GCM encrypted with
                                                      the team password (safe to publish), then dist/
  python build.py --publish-users BUNDLE.json --password-file PW.txt
                                                   -> src/js/data.js with admin + per-person logins (as “Publish update”)
  python build.py --firebase                       -> dist/ for Firebase Hosting (never includes data.js)
  python build.py --local PACK.json              -> local/Tracker_LOCAL.html (plain data embedded;
                                                      for your own computer only — never publish it)
"""
import base64, gzip, hashlib, json, os, re, shutil, sys, time

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, DIST, LOCAL = (os.path.join(ROOT, d) for d in ('src', 'dist', 'local'))
DATA_JS = os.path.join(SRC, 'js', 'data.js')
SKIP = {'_markup_original.html'}
ITER = 310000


def encrypt_pack(pack_path, pw):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    pack = json.load(open(pack_path, encoding='utf-8'))
    raw = gzip.compress(json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), mtime=0)
    salt, iv = os.urandom(16), os.urandom(12)
    key = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, ITER, 32)
    ct = AESGCM(key).encrypt(iv, raw, None)            # ciphertext || tag, as WebCrypto expects
    b = lambda x: base64.b64encode(x).decode()
    env = {'v': 1, 'iter': ITER, 'salt': b(salt), 'iv': b(iv), 'ct': b(ct), 'asOf': pack['meta']['asOf'], 'month': pack['meta']['month']}
    open(DATA_JS, 'w', encoding='utf-8').write(f"/* 16-Point Evaluation Tracker — encrypted data ({env['asOf']}). */\nwindow.ENC_DATA = {json.dumps(env)};\n")
    print('encrypted data:', DATA_JS, os.path.getsize(DATA_JS), 'bytes (data to', env['asOf'] + ')')


def publish_users(bundle_path, admin_pw):
    """Same output as the site's “Publish update”: window.ENC_USERS with one envelope per login.
    bundle = { asOf, month, admin: pack, users: [{ id, role, name, pack }] } (built in the browser)."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    b = json.load(open(bundle_path, encoding='utf-8'))
    b64 = lambda x: base64.b64encode(x).decode()
    def env(pack, pw):
        raw = gzip.compress(json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), mtime=0)
        salt, iv = os.urandom(16), os.urandom(12)
        key = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, ITER, 32)
        return {'v': 1, 'iter': ITER, 'salt': b64(salt), 'iv': b64(iv), 'ct': b64(AESGCM(key).encrypt(iv, raw, None))}
    id_hash = lambda i: b64(hashlib.sha256(('djp|' + i.strip().lower()).encode('utf-8')).digest())
    pw_rule = lambda n: n.strip().split()[0].lower() + '@hero'           # same rule as users.js
    users = {id_hash('admin'): {'role': 'admin', **env(b['admin'], admin_pw)}}
    for u in b['users']:
        users[id_hash(u['id'])] = {'role': u['role'], **env(u['pack'], pw_rule(u['name']))}
    out = {'v': 2, 'iter': ITER, 'asOf': b['asOf'], 'month': b['month'], 'users': users}
    open(DATA_JS, 'w', encoding='utf-8').write(f"/* 16-Point Evaluation Tracker — encrypted data and logins ({b['asOf']}). Replace js/data.js with this file. */\nwindow.ENC_USERS = {json.dumps(out)};\n")
    print('encrypted data + logins:', DATA_JS, os.path.getsize(DATA_JS), 'bytes · admin +', len(b['users']), 'logins · data to', b['asOf'])


def build_dist(firebase=False):
    """firebase=True: site for Firebase Hosting - never carries data.js (data comes from Firestore after sign-in)."""
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    skip = SKIP | ({'data.js'} if firebase else set())
    shutil.copytree(SRC, DIST, ignore=lambda d, names: [n for n in names if n in skip])
    html = open(os.path.join(DIST, 'index.html'), encoding='utf-8').read()
    assert '<!--SEED-->' in html and '<!--DATA-->' in html
    data_tag = '<script src="js/data.js"></script>' if os.path.exists(DATA_JS) and not firebase else ''
    html = html.replace('<!--SEED-->', '').replace('<!--DATA-->', data_tag)
    # every deploy gets new file URLs, so browsers never keep old code or old data
    ver = time.strftime('%Y%m%d%H%M%S')
    html = re.sub(r'((?:src|href)="(?:js|css)/[^"?]+\.(?:js|css))"', rf'\1?v={ver}"', html)
    open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8').write(html)
    # same headers as netlify.toml, for drag-and-drop deploys of dist/ (where netlify.toml is not read)
    toml = open(os.path.join(ROOT, 'netlify.toml'), encoding='utf-8').read()
    hdrs = [h for h in re.findall(r'^\s+([A-Za-z-]+) = "(.*)"$', toml, re.M) if h[0] not in ('publish', 'for', 'command')]
    open(os.path.join(DIST, '_headers'), 'w', encoding='utf-8').write('/*\n' + ''.join(f'  {k}: {v}\n' for k, v in hdrs) + '/index.html\n  Cache-Control: no-cache\n/\n  Cache-Control: no-cache\n')
    # guard: only the encrypted data file may be large; no plain data may ship
    for d, _, files in os.walk(DIST):
        for f in files:
            p = os.path.join(d, f)
            if f == 'data.js':
                t = open(p, encoding='utf-8').read()
                if not ('window.ENC_DATA' in t or 'window.ENC_USERS' in t) or '"dealers"' in t:
                    raise SystemExit('Refusing to publish js/data.js: it is not encrypted.')
            elif f.endswith('.json') or os.path.getsize(p) > 400_000:
                raise SystemExit(f'Refusing to publish {f}: data files must not be in dist/')
    open(os.path.join(DIST, 'netlify.toml'), 'w', encoding='utf-8').write('# Pre-built static site: nothing to build, publish this folder as is.\n[build]\n  publish = "."\n')
    print('dist/ ready:', sum(len(f) for _, _, f in os.walk(DIST)), 'files', '(with encrypted data)' if data_tag else '(no data — upload mode)')


def build_local(pack_path):
    pack = open(pack_path, encoding='utf-8').read()
    json.loads(pack)  # validate
    html = open(os.path.join(SRC, 'index.html'), encoding='utf-8').read()
    inline_css = lambda m: '<style>\n' + open(os.path.join(SRC, m.group(1)), encoding='utf-8').read() + '\n</style>'
    inline_js = lambda m: '<script>\n' + open(os.path.join(SRC, m.group(1)), encoding='utf-8').read() + '\n</script>'
    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', inline_css, html)
    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)
    seed = '<script id="seed" type="application/json">' + pack.replace('</', '<\\/') + '</script>'
    html = html.replace('<!--SEED-->', seed).replace('<!--DATA-->', '').replace('<title>', '<title>[LOCAL · CONFIDENTIAL] ', 1)
    os.makedirs(LOCAL, exist_ok=True)
    out = os.path.join(LOCAL, 'Tracker_LOCAL.html')
    open(out, 'w', encoding='utf-8').write(html)
    print('local file:', out, os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    a = sys.argv
    if '--publish-users' in a:
        pw = open(a[a.index('--password-file') + 1], encoding='utf-8').read().strip()
        if len(pw) < 8:
            raise SystemExit('Password must be at least 8 characters.')
        publish_users(a[a.index('--publish-users') + 1], pw)
    elif '--publish' in a:
        pw = open(a[a.index('--password-file') + 1], encoding='utf-8').read().strip()
        if len(pw) < 8:
            raise SystemExit('Password must be at least 8 characters.')
        encrypt_pack(a[a.index('--publish') + 1], pw)
    build_dist(firebase='--firebase' in a)
    if '--local' in a:
        build_local(a[a.index('--local') + 1])
