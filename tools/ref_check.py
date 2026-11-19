"""Count broken references (#REF!) in formulas and cached error values, per sheet (reads the .xlsx XML, no Excel)."""
import re, sys, zipfile
from xml.etree import ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
z = zipfile.ZipFile(sys.argv[1])
wb = ET.fromstring(z.read('xl/workbook.xml'))
tgt = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
tot_f = tot_v = 0
for s in wb.find('m:sheets', NS):
    t = tgt[s.get('{%s}id' % NS['r'])].lstrip('/')
    xml = z.read(t if t.startswith('xl/') else 'xl/' + t).decode('utf-8', 'ignore')
    f = sum('#REF!' in x for x in re.findall(r'<f[^>]*>(.*?)</f>', xml, re.S))
    v = len(re.findall(r't="e"[^>]*>(?:<f[^>]*>.*?</f>|<f[^>]*/>)?<v>#REF!</v>', xml, re.S))
    tot_f += f; tot_v += v
    if f or v: print(f"  {s.get('name')}: {f} formulas with #REF!, {v} cells showing #REF!")
dn = wb.find('m:definedNames', NS)
bad = [d.get('name') for d in (dn if dn is not None else []) if '#REF!' in (d.text or '')]
print(f"TOTAL: {tot_f} formulas with #REF!, {tot_v} cells showing #REF!, broken names: {bad or 'none'}")
