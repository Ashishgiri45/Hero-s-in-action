"""Month-wise summary (frozen values) for the last 3 months of the SE Evaluation workbook.

python -I tools/month_summary.py WORKBOOK.xlsx OUT.xlsx
Builds one sheet "Month Summary Aug-Oct 26" (zone / ASM / SE) from:
  Dealer_Vol1 / Dealer_Val1 / Dealer-MBD1 month columns  → units, value, ASP, billing points, models per dealer
  MTD DJP SUMMARY MONTH WISE month blocks                 → DJP visits planned vs made
  Dashboard RSE / Dashboard ASM                           → official target, ordered, billed (latest month only)
The OUT file is copied into the workbook with Excel (see tools/add_summary.ps1), so nothing else is touched.
"""
import sys, re, datetime as dt
from collections import defaultdict
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L

src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
H = lambda s: re.sub(r'[^a-z0-9+]', '', str(s or '').lower())
num = lambda v: v if isinstance(v, (int, float)) else 0

def rows(s): return [list(r) for r in wb[s].iter_rows(values_only=True)]
def month_cols(hdr):
    return {(h.year, h.month): j for j, h in enumerate(hdr) if isinstance(h, dt.datetime)}

vol, val, mbd = rows('Dealer_Vol1'), rows('Dealer_Val1'), rows('Dealer-MBD1')
mv, ma, mm = month_cols(vol[0]), month_cols(val[0]), month_cols(mbd[0])
last = max(mv)                                    # latest month column (Oct-26)
MONTHS = sorted(mv)[-3:]                          # Aug, Sep, Oct
LBL = [dt.date(y, m, 1).strftime('%b-%y') for y, m in MONTHS]

# dealer → zone / ASM / SE from Dealer_Vol1 (the KPI base)
hv = [H(h) for h in vol[0]]
iZ, iA, iS, iE, iJ = hv.index('zone'), hv.index('asm'), hv.index('rsedse'), hv.index('dealercode'), hv.index('activeinactive')
clean = lambda s: str(s or '').strip() or '(not mapped)'
deal = {}
for r in vol[1:]:
    if r[iE] is None: continue
    se = clean(r[iS]); se = '(not mapped)' if re.search(r'not found|^-$|^0$', se, re.I) else se
    deal[r[iE]] = dict(z=clean(r[iZ]).title(), a=clean(r[iA]), s=se, act=str(r[iJ] or '').lower().startswith('active'),
                       u=[num(r[mv[m]]) for m in MONTHS])
def by_code(rs, mc):
    h = [H(x) for x in rs[0]]; e = h.index('dealercode'); return {r[e]: [num(r[mc[m]]) if m in mc else 0 for m in MONTHS] for r in rs[1:] if r[e] is not None}
vval, vmbd = by_code(val, ma), by_code(mbd, mm)

def agg(key):
    g = defaultdict(lambda: dict(act=0, u=[0] * 3, v=[0] * 3, bp=[0] * 3, md=[0] * 3, mdn=[0] * 3, dealers=0))
    for c, d in deal.items():
        o = g[key(d)]; o['dealers'] += 1; o['act'] += d['act']
        vv, mdl = vval.get(c, [0] * 3), vmbd.get(c, [0] * 3)
        for i in range(3):
            o['u'][i] += d['u'][i]; o['v'][i] += vv[i]
            if d['u'][i] > 0: o['bp'][i] += 1
            if mdl[i] > 0: o['md'][i] += mdl[i]; o['mdn'][i] += 1
    return g

# DJP: “<MONTH> <YEAR> – ASM WISE / RSE WISE” blocks
djp = rows('MTD DJP SUMMARY MONTH WISE')
def djp_block(y, m, kind, name_h):
    mname = dt.date(y, m, 1).strftime('%B').upper(); start = -1
    for ri in range(4):
        for j, v in enumerate(djp[ri] if ri < len(djp) else []):
            s = str(v or '').upper()
            if mname in s and str(y) in s and f'{kind} WISE' in s and ('RSE' if kind == 'ASM' else 'ASM WISE') not in s.replace(f'{kind} WISE', ''): start = j
    if start < 0: return {}
    hr = next((i for i in range(12) if i < len(djp) and str(djp[i][start] or '').strip().lower() == 'zone'), -1)
    if hr < 0: return {}
    hm = {}
    for j in range(start, start + 15):
        h = H(djp[hr][j]) if j < len(djp[hr]) else ''
        if h and h not in hm: hm[h] = j
    out = {}
    if name_h not in hm and name_h == 'rsename' and 'sename' in hm: name_h = 'sename'   # October block says “SE Name”
    for r in djp[hr + 1:]:
        nm = str(r[hm[name_h]] or '').strip() if name_h in hm else ''
        if not nm or 'total' in str(r[start] or '').lower() or 'total' in nm.lower(): continue
        out[nm] = (num(r[hm.get('mtdplan', -1)]) if 'mtdplan' in hm else 0, num(r[hm.get('mtdacht', -1)]) if 'mtdacht' in hm else 0)
    return out
DJP = {'ASM': [djp_block(y, m, 'ASM', 'asmname') for y, m in MONTHS], 'SE': [djp_block(y, m, 'RSE', 'rsename') for y, m in MONTHS]}

# official dashboards (latest month)
def dash(sheet, name_h, bill_h):
    rs = rows(sheet); hr = next(i for i, r in enumerate(rs[:12]) if any(H(x) == name_h for x in r) and any(H(x) == 'target' for x in r))
    h = [H(x) for x in rs[hr]]; f = lambda k: h.index(k) if k in h else -1
    out = {}
    for r in rs[hr + 1:]:
        nm = str(r[f(name_h)] or '').strip()
        if not nm or 'total' in nm.lower() or 'total' in str(r[0] or '').lower() or re.match(r'^(vacant|tba)$', nm, re.I): continue
        g = lambda k: num(r[f(k)]) if f(k) >= 0 else 0
        bpi, mbi = f('billingpointtarget'), f('mbdtarget')
        out[nm] = dict(t=g('target'), o=g('mtdorderach'), b=g(bill_h), bpT=num(r[bpi]) if bpi >= 0 else 0, bpA=num(r[bpi + 1]) if bpi >= 0 else 0,
                       mT=num(r[mbi]) if mbi >= 0 else 0, mA=num(r[mbi + 1]) if mbi >= 0 else 0, prem=g('premiumbiling'))
    return out
OFF = {'SE': dash('Dashboard RSE', 'sename', 'billingvolume'), 'ASM': dash('Dashboard ASM', 'asmname', 'billingvolach')}

# ---------------- write ----------------
o = openpyxl.Workbook(); ws = o.active; ws.title = f'Month Summary {LBL[0][:3]}-{LBL[2]}'
HF = PatternFill('solid', fgColor='4F46E5'); SF = PatternFill('solid', fgColor='E0E7FF'); TF = PatternFill('solid', fgColor='F1F5F9')
thin = Side(style='thin', color='CBD5E1'); B = Border(bottom=thin)
r = 1
ws.cell(r, 1, f'MONTH-WISE SUMMARY · {LBL[0]} to {LBL[2]} · frozen values').font = Font(bold=True, size=14, color='1E1B4B'); r += 1
ws.cell(r, 1, f'Built {dt.datetime.now():%d-%b-%Y %H:%M} from {sys.argv[3] if len(sys.argv) > 3 else src.split(chr(92))[-1]} — numbers only, no formulas. Units / value / billing points / models: Dealer_Vol1, Dealer_Val1, Dealer-MBD1 month columns. DJP: MTD DJP SUMMARY MONTH WISE. Targets & orders: Dashboard RSE / ASM ({LBL[2]} only — earlier months\' dashboards are not in the workbook).').font = Font(italic=True, color='475569')
r += 2

def table(title, level, groups, keyfmt):
    global r
    ws.cell(r, 1, title).font = Font(bold=True, size=12, color='4F46E5'); r += 1
    head = [*keyfmt[0], 'Dealers mapped', 'Active dealers',
            *[f'Units {m}' for m in LBL], f'Units {LBL[2]} vs {LBL[1]}',
            *[f'Value {m} (₹ lakh)' for m in LBL], *[f'ASP {m} (₹)' for m in LBL],
            *[f'Billing points {m}' for m in LBL], *[f'Models / billed dealer {m}' for m in LBL],
            *[f'DJP visits {m} (made/plan)' for m in LBL], *[f'DJP % {m}' for m in LBL],
            f'{LBL[2]} target', f'{LBL[2]} ordered', f'{LBL[2]} billed (dashboard)', f'{LBL[2]} billed % of target', f'{LBL[2]} billing pts (dashboard)', f'{LBL[2]} MBD ach / target', f'{LBL[2]} premium %']
    for j, h in enumerate(head, 1):
        c = ws.cell(r, j, h); c.font = Font(bold=True, color='FFFFFF'); c.fill = HF; c.alignment = Alignment(wrap_text=True, vertical='center')
    ws.row_dimensions[r].height = 46; hdr_row = r; r += 1
    tot = None
    for key, g, label, djpkey in groups:
        u, v = g['u'], g['v']
        dj = [DJP[level][i].get(djpkey, (0, 0)) if level in ('SE', 'ASM') and djpkey else (0, 0) for i in range(3)]
        if level == 'Zone': dj = [(sum(DJP['ASM'][i].get(a, (0, 0))[0] for a in g['asms']), sum(DJP['ASM'][i].get(a, (0, 0))[1] for a in g['asms'])) for i in range(3)]
        off = OFF.get(level, {}).get(djpkey) if level in ('SE', 'ASM') else g.get('off')
        row = [*label, g['dealers'], g['act'], *u, (u[2] / u[1] - 1) if u[1] else None,
               *[x / 1e5 for x in v], *[(v[i] / u[i]) if u[i] > 0 else None for i in range(3)],
               *g['bp'], *[(g['md'][i] / g['mdn'][i]) if g['mdn'][i] else None for i in range(3)],
               *[f'{fmt(d[1])}/{fmt(d[0])}' if d[0] else '' for d in dj], *[(d[1] / d[0]) if d[0] else None for d in dj],
               *(([off['t'], off['o'], off['b'], (off['b'] / off['t']) if off['t'] else None, f"{fmt(off['bpA'])}/{fmt(off['bpT'])}" if off['bpT'] else '', f"{off['mA']:.1f} / {off['mT']:.1f}" if off['mT'] else '', off['prem'] or None]) if off else [None] * 7)]
        for j, x in enumerate(row, 1):
            c = ws.cell(r, j, x); c.border = B
            if key == '__total__': c.font = Font(bold=True); c.fill = SF
        r += 1
    # formats
    nk = len(keyfmt[0])
    fmts = {}
    base = nk + 2
    for i in range(3): fmts[base + 1 + i] = '#,##0'
    fmts[base + 4] = '+0%;-0%;0%'
    for i in range(3): fmts[base + 5 + i] = '#,##0.0'
    for i in range(3): fmts[base + 8 + i] = '#,##0'
    for i in range(3): fmts[base + 11 + i] = '#,##0'
    for i in range(3): fmts[base + 14 + i] = '0.0'
    for i in range(3): fmts[base + 20 + i] = '0%'
    for k, f in ((base + 23, '#,##0'), (base + 24, '#,##0'), (base + 25, '#,##0'), (base + 26, '0%'), (base + 29, '0.0%')): fmts[k] = f
    for rr in range(hdr_row + 1, r):
        for col, f in fmts.items(): ws.cell(rr, col).number_format = f
    r += 2
fmt = lambda x: f'{round(x):,}'

# zone
zg = agg(lambda d: d['z']); za = defaultdict(set)
for d in deal.values(): za[d['z']].add(d['a'])
def zone_off(z):
    xs = [x for n, x in OFF['ASM'].items() if any(n == a for a in za[z])]
    if not xs: return None
    s = {k: sum(x[k] for x in xs) for k in ('t', 'o', 'b', 'bpT', 'bpA')}; s.update(mT=0, mA=0, prem=0); return s
def total(gs):
    t = dict(act=0, u=[0] * 3, v=[0] * 3, bp=[0] * 3, md=[0] * 3, mdn=[0] * 3, dealers=0)
    for g in gs:
        for k in ('act', 'dealers'): t[k] += g[k]
        for k in ('u', 'v', 'bp', 'md', 'mdn'): t[k] = [a + b for a, b in zip(t[k], g[k])]
    return t
zones = sorted(z for z in zg if z != '(Not Mapped)')
groups = [(z, dict(zg[z], asms=za[z], off=zone_off(z)), [z], None) for z in zones]
T = total([zg[z] for z in zones]); T['asms'] = set().union(*[za[z] for z in zones]); offs = [zone_off(z) for z in zones if zone_off(z)]
T['off'] = {k: sum(x[k] for x in offs) for k in ('t', 'o', 'b', 'bpT', 'bpA')} | dict(mT=0, mA=0, prem=0)
groups.append(('__total__', T, ['All India'], None))
table('1. ZONE-WISE', 'Zone', groups, (['Zone'],))
# ASM
ag = agg(lambda d: (d['z'], d['a']))
groups = [(k, ag[k], [k[0], k[1]], k[1]) for k in sorted(ag) if k[1] != '(not mapped)']
table('2. ASM-WISE', 'ASM', groups, (['Zone', 'ASM'],))
# SE
sg = agg(lambda d: (d['z'], d['a'], d['s']))
groups = [(k, sg[k], [k[0], k[1], k[2]], k[2]) for k in sorted(sg) if k[2] != '(not mapped)']
nm = [k for k in sg if k[2] == '(not mapped)']
if nm: groups.append(('__total__', total([sg[k] for k in nm]), ['', '', 'Dealers without an SE'], None))
table('3. SE-WISE', 'SE', groups, (['Zone', 'ASM', 'SE'],))

ws.cell(r, 1, 'Notes').font = Font(bold=True)
for t in ['Units / value = Dealer_Vol1 / Dealer_Val1 month columns (same basis as the workbook’s L3M and YTD).',
          f'Billing points = dealers with units > 0 in the month. Models / billed dealer = average of Dealer-MBD1 for dealers with models > 0.',
          'DJP % = visits made ÷ visits planned (MTD DJP SUMMARY month block). Zone DJP = sum of its ASMs.',
          f'{LBL[2]} target / ordered / billed = Dashboard RSE / ASM (official). These use cycle billing and can differ from Dealer_Vol1 units.',
          'Mapping (zone / ASM / SE) is today’s Dealer_Vol1 mapping, applied to all three months.']:
    r += 1; ws.cell(r, 1, '• ' + t).font = Font(color='475569')
widths = {1: 12, 2: 22, 3: 26}
for j in range(1, 45): ws.column_dimensions[L(j)].width = widths.get(j, 12)
ws.freeze_panes = 'D6'
o.save(out)
print('months', LBL, '| zones', zones, '| ASMs', len([k for k in ag if k[1] != '(not mapped)']), '| SEs', len([k for k in sg if k[2] != '(not mapped)']))
print('All India units', T['u'], 'value lakh', [round(x / 1e5) for x in T['v']], 'BP', T['bp'])
print('DJP months found ASM', [len(x) for x in DJP['ASM']], 'SE', [len(x) for x in DJP['SE']], '| official SE', len(OFF['SE']), 'ASM', len(OFF['ASM']))
print('Oct official national', T['off'])
