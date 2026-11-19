"""Pull October results + November targets from the SE Evaluation workbook into one JSON for the monthly plan cards.

python -I tools/nov_extract.py WORKBOOK.xlsx OUT.json
"""
import json, re, sys, datetime as dt
from collections import defaultdict
import openpyxl

src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, read_only=True, data_only=True)

def rows(s):
    for r in wb[s].iter_rows(values_only=True):
        r = list(r)
        if any(v is not None for v in r): yield r

key = lambda s: re.sub(r'[^a-z]', '', str(s or '').lower())
num = lambda v: float(v) if isinstance(v, (int, float)) else 0.0
DEAD = {'vacant', 'tba', ''}
# October ASM names that changed for November (same territory)
ASM_ALIAS = {'sunilkumar': 'Alok Kumar', 'shaminderyadav': 'Bhupendra Jain'}

# ---------- October: Dashboard RSE / ASM (final, data to 31 Oct) ----------
oct_se, oct_asm = {}, {}
for r in rows('Dashboard RSE'):
    if r[4] != 'SE' or key(r[5]) in DEAD: continue
    oct_se[key(r[5])] = dict(zone=r[0], asm=r[1], hq=r[2], code=r[3], name=r[5], target=num(r[6]), bill=num(r[7]), order=num(r[10]),
        curRR=num(r[13]), open=num(r[18]), cancel=num(r[19]), bpT=num(r[25]), bpA=num(r[26]), perDealer=num(r[28]), prem=num(r[29]),
        mbdT=num(r[30]), mbdA=num(r[31]))
for r in rows('Dashboard ASM'):
    if not isinstance(r[2], (int, float)) or not r[3]: continue
    oct_asm[key(r[3])] = dict(zone=r[0], hq=r[1], code=r[2], name=r[3], target=num(r[4]), bill=num(r[5]), order=num(r[8]), curRR=num(r[11]),
        open=num(r[18]), cancel=num(r[19]), lyBill=num(r[22]), bpT=num(r[32]), bpA=num(r[33]), perDealer=num(r[35]), prem=num(r[36]),
        mbdT=num(r[37]), mbdA=num(r[38]))

# ---------- October billing by date: how much came in the last 10 days ----------
def phase(daily):
    tot = sum(daily.values()) or 1
    return dict(first10=sum(v for d, v in daily.items() if d <= 10) / tot, last10=sum(v for d, v in daily.items() if d >= 22) / tot)
se_daily = defaultdict(lambda: defaultdict(float))
it = wb['Billing'].iter_rows(values_only=True); next(it); hdr = list(next(it))
iq, idt, irse, imon = hdr.index('Quantity'), hdr.index('Bill Date'), hdr.index('RSE Code'), hdr.index('Bill Month')
for r in it:
    d, q = r[idt], r[iq]
    if isinstance(d, dt.datetime) and d.month == 10 and isinstance(q, (int, float)) and r[irse] is not None:
        se_daily[str(r[irse]).split('.')[0]][d.day] += q
asm_daily = {}
for r in rows('Date ASM Wise Billing'):
    if isinstance(r[2], (int, float)) and r[3]:
        asm_daily[key(r[3])] = {i + 1: num(v) for i, v in enumerate(r[4:35])}

# ---------- November targets ----------
NOV = [dt.date(2026, 11, d) for d in range(1, 31)]
WEEKS = [(1, 7), (8, 14), (15, 21), (22, 30)]
def plan(total, daily):
    have = daily and sum(daily) > 0
    if not have:   # no phasing given: spread evenly over Mon–Sat
        wd = [d for d in NOV if d.weekday() != 6]; per = total / len(wd)
        daily = [per if d.weekday() != 6 else 0 for d in NOV]
    wk = [round(sum(daily[a - 1:b])) for a, b in WEEKS]
    days = sum(1 for v in daily if v > 0)
    return dict(target=round(total), weeks=wk, workDays=days, perDay=round(total / days) if days else 0, phased=bool(have))
nov_asm, nov_se = [], []
for r in rows('ASM wise nov target'):
    if isinstance(r[2], (int, float)) and r[3]:
        d = [num(v) for v in (r[5:35] + [None] * 30)[:30]]
        nov_asm.append(dict(zone=r[0], hq=r[1], code=int(r[2]), name=r[3].strip(), **plan(num(r[4]), d)))
for r in rows('RSE wise nov target'):
    if r[0] and not str(r[0]).endswith('Total') and r[2] and key(r[2]) not in DEAD and isinstance(r[3], (int, float)):
        d = [num(v) for v in (r[4:34] + [None] * 30)[:30]]
        nov_se.append(dict(zone=r[0], code=int(r[1]) if r[1] else None, name=r[2].strip(), **plan(num(r[3]), d)))

# ---------- contacts ----------
contacts = {}
for r in rows('Contacts'):
    if r[0] and r[0] != 'Name': contacts[key(r[0])] = dict(email=r[4] or '', phone=re.sub(r'\D', '', str(r[5] or '')))

def octOf(rec, daily):
    if not rec: return None
    o = dict(rec); o.update(phase(daily) if daily and sum(daily.values()) else dict(first10=None, last10=None)); return o

for p in nov_se:
    o = oct_se.get(key(p['name']))
    p['oct'] = octOf(o, se_daily.get(str(o['code'])) if o else None)
    p['asm'] = (ASM_ALIAS.get(key(o['asm']), o['asm']) if o else '')
    p['hq'] = o['hq'] if o else ''
    p['contact'] = contacts.get(key(p['name']), {})
for p in nov_asm:
    o = oct_asm.get(key(p['name']))
    p['octOwner'] = None
    if not o:   # new ASM: show the territory's October (same HQ)
        o = next((v for v in oct_asm.values() if key(v['hq']) == key(p['hq'])), None)
        if o: p['octOwner'] = o['name']
    p['oct'] = octOf(o, asm_daily.get(key(o['name'])) if o else None)
    p['team'] = [s['name'] for s in nov_se if key(s['asm']) == key(p['name'])]
    p['contact'] = contacts.get(key(p['name']), {})

json.dump(dict(asm=nov_asm, se=nov_se, built=dt.datetime.now().isoformat(timespec='minutes')), open(out, 'w', encoding='utf8'), indent=1, default=str)
print(len(nov_asm), 'ASMs,', len(nov_se), 'SEs')
print('SE without Oct:', [p['name'] for p in nov_se if not p['oct']])
print('ASM without Oct:', [p['name'] for p in nov_asm if not p['oct']], ' territory-only:', [(p['name'], p['octOwner']) for p in nov_asm if p['octOwner']])
print('no contact:', [p['name'] for p in nov_asm + nov_se if not p['contact'].get('phone')])
print('Oct SEs not in Nov:', [v['name'] for k, v in oct_se.items() if k not in {key(p['name']) for p in nov_se}])
for p in nov_asm: print(p['name'], p['target'], p['weeks'], p['phased'], p['team'])
