"""List sheets of a workbook and which other sheets each one's formulas reference (reads XML directly, no Excel)."""
import re, sys, zipfile, collections
from xml.etree import ElementTree as ET

path = sys.argv[1]
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
z = zipfile.ZipFile(path)
wb = ET.fromstring(z.read('xl/workbook.xml'))
rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
tgt = {r.get('Id'): r.get('Target') for r in rels}
sheets = []
for s in wb.find('m:sheets', NS):
    rid = s.get('{%s}id' % NS['r'])
    t = tgt[rid].lstrip('/')
    t = t if t.startswith('xl/') else 'xl/' + t
    sheets.append((s.get('name'), s.get('state') or 'visible', t))
names = [n for n, _, _ in sheets]

def refs_in(text):
    out = set()
    for n in names:
        q = "'" + n.replace("'", "''") + "'!"
        if q in text or (re.fullmatch(r'[A-Za-z_][\w.]*', n) and re.search(r'(?<![\w.\'])' + re.escape(n) + r'!', text)):
            out.add(n)
    return out

uses = collections.defaultdict(set)   # sheet -> sheets its formulas point to
nform = {}
dims = {}
for n, st, t in sheets:
    xml = z.read(t).decode('utf-8', 'ignore')
    fs = re.findall(r'<f[^>]*>(.*?)</f>', xml, re.S)
    nform[n] = len(fs)
    d = re.search(r'<dimension ref="([^"]+)"', xml)
    dims[n] = d.group(1) if d else '?'
    for f in fs:
        uses[n] |= refs_in(f.replace('&apos;', "'").replace('&amp;', '&'))
    uses[n].discard(n)
# defined names
dn = wb.find('m:definedNames', NS)
named = {}
if dn is not None:
    for d in dn:
        named[d.get('name')] = refs_in((d.text or '').replace('&apos;', "'"))
# pivot caches / data validations referencing sheets are also links
used_by = collections.defaultdict(set)
for a, bs in uses.items():
    for b in bs: used_by[b].add(a)
for i, (n, st, t) in enumerate(sheets, 1):
    print(f"{i:2}. {n} [{st}] dim={dims[n]} formulas={nform[n]}")
    print(f"     reads from: {', '.join(sorted(uses[n])) or '-'}")
    print(f"     read by   : {', '.join(sorted(used_by[n])) or '-'}")
print('\nDefined names:')
for k, v in named.items():
    print(f"  {k}: {', '.join(sorted(v)) or '-'}")
