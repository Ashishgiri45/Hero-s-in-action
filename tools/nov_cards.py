"""November monthly plan cards (1080x1920 PNG) for every ASM and SE, with October learnings.

python -I tools/nov_cards.py nov.json OUT_DIR
Writes OUT_DIR/ASM/*.png, OUT_DIR/SE/*.png, OUT_DIR/WhatsApp_messages.txt and OUT_DIR/Nov_Plan_Summary.csv
"""
import csv, json, os, re, sys
from PIL import Image, ImageDraw, ImageFont

data, OUT = json.load(open(sys.argv[1], encoding='utf8')), sys.argv[2]
W, H = 1080, 1920
F = 'C:/Windows/Fonts/'
def font(sz, w='r'): return ImageFont.truetype(F + {'r': 'segoeui.ttf', 's': 'seguisb.ttf', 'b': 'segoeuib.ttf', 'k': 'seguibl.ttf'}[w], sz)
fN = lambda v: f'{round(v):,}'.replace(',', '_').replace('_', ',') if v is not None else '–'
def fIN(v):   # Indian grouping 2,26,798
    v = round(v); s = str(abs(v)); h, t = s[:-3], s[-3:]
    while len(h) > 2: t = h[-2:] + ',' + t; h = h[:-2]
    return ('-' if v < 0 else '') + (h + ',' + t if h else t)
fP = lambda v: '–' if v is None else f'{round(v * 100)}%'
GOOD, WARN, BAD, MUTE = '#16a34a', '#d97706', '#e11d48', '#64748b'
band = lambda v, g, w: MUTE if v is None else GOOD if v >= g else WARN if v >= w else BAD
WK_LBL = ['1–7 Nov', '8–14 Nov', '15–21 Nov', '22–30 Nov']

# ---------------- learnings ----------------
def learn(p, lvl):
    o, t = p['oct'], p['target']
    good, todo = [], []
    if not o:
        todo += [(9, 'First month in this territory', 'Meet every active dealer in weeks 1–2 with your ASM; note stock, open orders and credit at each.'),
                 (8, 'Build the PJP early', 'Fix the beat plan for the month in week 1 so every dealer is visited at least twice.'),
                 (7, 'Front-load the month', f'Aim for {fIN(sum(p["weeks"][:2]))} units by 14 Nov ({fP(sum(p["weeks"][:2]) / t if t else None)} of target), not a month-end rush.'),
                 (6, 'Bill every dealer', 'Get at least one order from each active dealer — billing points count every month.'),
                 (5, 'Punch clean orders', 'Check stock and dealer credit before punching, so orders turn into billing and nothing is cancelled.'),
                 (4, 'Sell the full range', 'Show one premium model at every visit (aim 10%+ of billing) and add 2 missing best-sellers per dealer.'),
                 (3, 'Check every Saturday', 'Compare the week’s billing with the week plan above; tell your ASM the gap and the fix by Monday.')]
        return [], todo
    bill, order, ot = o['bill'], o['order'], o['target']
    billPct, ordPct = (bill / ot if ot else None), (order / ot if ot else None)
    conv = bill / order if order else None
    cshare = o['cancel'] / order if order else None
    bp = o['bpA'] / o['bpT'] if o['bpT'] else None
    mbd = o['mbdA'] / o['mbdT'] if o['mbdT'] else None
    prem, last10, first10 = o['prem'], o.get('last10'), o.get('first10')
    owner = f" (under {p['octOwner']})" if p.get('octOwner') else ''
    # what worked
    if billPct is not None and billPct >= 1: good.append((billPct, f'Billed {fP(billPct)} of the October target{owner} — target crossed.'))
    elif ordPct is not None and ordPct >= 1: good.append((ordPct, f'Orders reached {fP(ordPct)} of target ({fIN(order)} units) — booking was strong.'))
    if conv is not None and conv >= .95 and order > 0: good.append((conv, f'{fP(conv)} of orders turned into billing — clean order flow.'))
    if bp is not None and bp >= 1: good.append((bp + .1, f'All {fIN(o["bpT"])} billing points billed — full dealer coverage.'))
    elif bp is not None and bp >= .95: good.append((bp, f'{fIN(o["bpA"])} of {fIN(o["bpT"])} billing points billed — near-full coverage.'))
    if prem is not None and prem >= .15: good.append((prem * 5, f'Premium mix at {fP(prem)} of billing — keep pitching premium.'))
    if mbd is not None and mbd >= 1: good.append((mbd, f'Range target met: {o["mbdA"]:.1f} models per dealer.'))
    if lvl == 'ASM' and o.get('lyBill'):
        g = bill / o['lyBill'] - 1
        if g >= .05: good.append((1 + g, f'Billing {fP(g)} above October last year ({fIN(o["lyBill"])}).'))
    if cshare is not None and cshare < .05 and order > 0: good.append((.9, f'Very few cancellations ({fIN(o["cancel"])} units).'))
    if not good and ordPct: good.append((0, f'Booked {fIN(order)} units ({fP(ordPct)} of target) — build on the dealers who ordered.'))
    # do better
    if conv is not None and conv < .92 and order - bill > 50:
        todo.append(((1 - conv) * 100, 'Turn orders into billing', f'Only {fP(conv)} of October orders were billed ({fIN(order - bill)} units short). Review open orders ({fIN(o["open"])}) with the depot every 2 days; clear stock and credit holds early.'))
    if cshare is not None and cshare > .08:
        todo.append((cshare * 100, 'Cut cancellations', f'{fIN(o["cancel"])} units were cancelled in October ({fP(cshare)} of orders). Check stock and dealer credit before punching; no duplicate or speculative orders.'))
    if billPct is not None and billPct < .8:
        todo.append(((1 - billPct) * 80, 'Close the billing gap', f'October closed at {fP(billPct)} of target on billing ({fIN(ot - bill)} units short). Track the weekly checkpoints below — not just the month-end total.'))
    if last10 is not None and last10 > .4:
        todo.append(((last10 - .3) * 100, 'Start the month faster', f'{fP(last10)} of October billing came in the last 10 days. Get {fIN(sum(p["weeks"][:2]))} units by 14 Nov ({fP(sum(p["weeks"][:2]) / t if t else None)} of target).'))
    if bp is not None and bp < .9:
        todo.append(((1 - bp) * 80, 'Bill more dealers', f'{fIN(o["bpA"])} of {fIN(o["bpT"])} billing points billed ({fP(bp)}). Get at least one order from the {fIN(o["bpT"] - o["bpA"])} dealers left out.'))
    if prem is not None and prem < .10:
        todo.append(((.1 - prem) * 200, 'Lift the premium mix', f'Premium was only {fP(prem)} of billing. Show one premium model at every dealer visit; aim for 10%+.'))
    if mbd is not None and mbd < .8:
        todo.append(((1 - mbd) * 60, 'Widen the range per dealer', f'{o["mbdA"]:.1f} models per dealer vs {o["mbdT"]:.1f} target ({fP(mbd)}). Add 2 missing best-sellers at each low-range dealer.'))
    if bill and t / bill - 1 > .3:
        up = t / bill - 1
        todo.append((up * 40, 'Plan for a bigger month', f'November target is {fP(up)} above October billing ({fIN(bill)}). That is {fIN(p["perDay"])}/day vs {fIN(bill / 26)}/day billed in October — build the order pipeline in week 1.'))
    if lvl == 'ASM' and o.get('lyBill') and bill / o['lyBill'] - 1 < -.05:
        g = bill / o['lyBill'] - 1
        todo.append((-g * 60, 'Recover vs last year', f'October billing was {fP(-g)} below last year ({fIN(bill)} vs {fIN(o["lyBill"])}). Find the dealers who bought last year and not this year.'))
    if bill > t:
        todo.append((25, 'Stretch beyond the target', f'You billed {fIN(bill)} in October; the November target is {fIN(t)}. Aim to match October, not just the target.'))
    if last10 is not None and .3 < last10 <= .4:
        todo.append((8, 'Keep the month even', f'{fP(last10)} of October billing came in the last 10 days. Hold each week to the plan above.'))
    todo.append((4, 'Check every Saturday', 'Compare the week’s billing with the week plan above; tell your ' + ('team' if lvl == 'ASM' else 'ASM') + ' the gap and the fix by Monday.'))
    good.sort(key=lambda x: -x[0]); todo.sort(key=lambda x: -x[0])
    return [g[1] for g in good[:2]], todo

# ---------------- drawing helpers ----------------
def grad(img):
    top, mid, bot = (11, 16, 48), (30, 27, 92), (59, 15, 92)
    px = ImageDraw.Draw(img)
    for y in range(H):
        f = y / H
        a, b, k = (top, mid, f * 2) if f < .5 else (mid, bot, (f - .5) * 2)
        px.line([(0, y), (W, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3)))
def glow(img, cx, cy, r, col, alpha):
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for i in range(40, 0, -1):
        rr = r * i / 40; d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col + (int(alpha * (1 - i / 40) ** 1.6 / 6),))
    img.alpha_composite(lay)
def wrap(d, text, f, maxw):
    words, lines, line = str(text).split(), [], ''
    for w_ in words:
        t = (line + ' ' + w_).strip()
        if d.textlength(t, font=f) > maxw and line: lines.append(line); line = w_
        else: line = t
    if line: lines.append(line)
    return lines
def fit(d, text, f_w, size, maxw):
    while size > 20 and d.textlength(text, font=font(size, f_w)) > maxw: size -= 2
    return font(size, f_w)
def pill(d, x, y, text, bg, fg, f, pad=20, h=50, right=False):
    tw = d.textlength(text, font=f); w = tw + pad * 2
    if right: x -= w
    d.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=bg)
    d.text((x + pad, y + h / 2), text, font=f, fill=fg, anchor='lm'); return w

def card(p, lvl):
    img = Image.new('RGBA', (W, H)); grad(img)
    glow(img, 1000, 40, 460, (14, 165, 233), 255); glow(img, 40, 420, 400, (236, 72, 153), 160)
    img = img.convert('RGB'); d = ImageDraw.Draw(img, 'RGBA'); o = p['oct']; t = p['target']   # RGBA mode blends the translucent panels
    good, todo = learn(p, lvl)
    # header
    d.text((60, 62), 'NOVEMBER 2026  ·  MONTHLY PLAN  ·  WITH OCTOBER LEARNINGS', font=font(25, 'b'), fill='#7dd3fc')
    d.text((60, 100), p['name'], font=fit(d, p['name'], 'b', 64, 690), fill='white')
    sub = f"{lvl} · {p['zone']} zone" + (f" · {p['hq']}" if p.get('hq') else '') + (f" · ASM {p['asm']}" if lvl == 'SE' and p.get('asm') else '')
    d.text((60, 186), sub, font=fit(d, sub, 'r', 28, 960), fill=(255, 255, 255, 190))
    tag, tcol = ('NEW THIS MONTH', '#a78bfa') if not o else ('', None)
    if o and o['bill']:
        up = t / o['bill'] - 1; tag = f"{'+' if up >= 0 else '−'}{abs(round(up * 100))}% vs OCT BILLED"; tcol = '#fbbf24' if up > .3 else '#34d399' if up <= .1 else '#38bdf8'
    if tag: pill(d, W - 60, 112, tag, tcol, '#0b1030', font(24, 'k'), right=True, h=54)
    # target strip
    y0 = 236; d.rounded_rectangle([40, y0, W - 40, y0 + 210], radius=26, fill=(255, 255, 255, 22))
    d.text((80, y0 + 30), 'NOVEMBER TARGET', font=font(23, 's'), fill=(255, 255, 255, 185))
    d.text((80, y0 + 60), fIN(t), font=font(92, 'b'), fill='white')
    d.text((80, y0 + 170), 'units (cycles)', font=font(22, 'r'), fill=(255, 255, 255, 160))
    tiles = [('Per working day', fIN(p['perDay']), f"{p['workDays']} billing days", '#38bdf8'),
             ('Oct target', fIN(o['target']) if o else '–', (f"Nov {'+' if t >= o['target'] else '−'}{fP(abs(t / o['target'] - 1))}" if o and o['target'] else 'new in November'), '#a78bfa'),
             ('Oct billed', fIN(o['bill']) if o else '–', (f"{fP(o['bill'] / o['target'])} of target" if o and o['target'] else 'no October data'), '#fb7185')]
    for i, (lb, v, s, c) in enumerate(tiles):
        x = 420 + i * 205
        d.rectangle([x, y0 + 40, x + 5, y0 + 170], fill=c)
        d.text((x + 18, y0 + 38), lb, font=font(21, 's'), fill=(255, 255, 255, 185))
        d.text((x + 18, y0 + 66), v, font=fit(d, v, 'b', 46, 175), fill='white')
        d.text((x + 18, y0 + 132), s, font=fit(d, s, 's', 20, 180), fill=c)
    # week plan
    y1 = y0 + 232; d.rounded_rectangle([40, y1, W - 40, y1 + 250], radius=26, fill=(255, 255, 255, 22))
    d.text((80, y1 + 26), 'WEEK-BY-WEEK PLAN', font=font(23, 's'), fill=(255, 255, 255, 185))
    note = 'from the target sheet' if p['phased'] else 'even split Mon–Sat (no daily phasing given)'
    d.text((W - 80, y1 + 26), note, font=font(20, 'r'), fill=(255, 255, 255, 150), anchor='ra')
    mx = max(p['weeks']) or 1; cum = 0; cols = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185']
    for i, v in enumerate(p['weeks']):
        cum += v; x = 80 + i * 232; bw = 200; bh = max(8, 62 * v / mx)
        d.rounded_rectangle([x, y1 + 166 - bh, x + bw, y1 + 166], radius=10, fill=cols[i])
        d.text((x + bw / 2, y1 + 158 - bh), fIN(v), font=font(30, 'b'), fill='white', anchor='md')
        d.text((x, y1 + 176), f'W{i + 1} · {WK_LBL[i]}', font=font(21, 's'), fill='white')
        d.text((x, y1 + 206), f'by end: {fIN(cum)} ({fP(cum / t if t else None)})', font=font(19, 'r'), fill=(255, 255, 255, 165))
    # white panel
    y2 = y1 + 272; d.rounded_rectangle([40, y2, W - 40, H - 70], radius=30, fill='white')
    X, R = 84, W - 84; y = y2 + 40
    if o:
        hdr = 'OCTOBER REPORT CARD' + (f'  ·  territory under {p["octOwner"]}' if p.get('octOwner') else '')
        d.text((X, y), hdr, font=font(25, 'k'), fill='#4f46e5'); y += 46
        conv = o['bill'] / o['order'] if o['order'] else None; cs = o['cancel'] / o['order'] if o['order'] else None
        bp = o['bpA'] / o['bpT'] if o['bpT'] else None; mbd = o['mbdA'] / o['mbdT'] if o['mbdT'] else None
        m = [('Billed', fP(o['bill'] / o['target']) if o['target'] else '–', f"{fIN(o['bill'])} units", band(o['bill'] / o['target'] if o['target'] else None, 1, .8)),
             ('Ordered', fP(o['order'] / o['target']) if o['target'] else '–', f"{fIN(o['order'])} units", band(o['order'] / o['target'] if o['target'] else None, 1, .85)),
             ('Order→bill', fP(conv), 'of orders billed', band(conv, .92, .85)),
             ('Cancelled', fIN(o['cancel']), f"{fP(cs)} of orders", band(None if cs is None else 1 - cs, .92, .85)),
             ('Billing pts', f"{fIN(o['bpA'])}/{fIN(o['bpT'])}" if o['bpT'] else '–', fP(bp), band(bp, 1, .9)),
             ('Premium', fP(o['prem']), 'of billing', band(o['prem'], .12, .08)),
             ('Models/dealer', f"{o['mbdA']:.1f}" if o['mbdT'] else '–', f"vs {o['mbdT']:.1f} target" if o['mbdT'] else '', band(mbd, 1, .8)),
             ('Last 10 days', fP(o.get('last10')), 'of month billing', band(None if o.get('last10') is None else 1 - o['last10'], .7, .6))]
        cw = (R - X) / 4
        for i, (lb, v, s, c) in enumerate(m):
            cx, cy = X + (i % 4) * cw, y + (i // 4) * 112
            d.rounded_rectangle([cx, cy, cx + cw - 14, cy + 100], radius=14, fill='#f1f5f9')
            d.rectangle([cx, cy + 14, cx + 5, cy + 86], fill=c)
            d.text((cx + 18, cy + 10), lb, font=font(19, 's'), fill='#64748b')
            d.text((cx + 18, cy + 34), v, font=fit(d, v, 'b', 34, cw - 40), fill=c if c != MUTE else '#0e1530')
            d.text((cx + 18, cy + 76), s, font=fit(d, s, 'r', 18, cw - 40), fill='#64748b')
        y += 236
    # what worked
    if good:
        d.text((X, y), 'WHAT WORKED IN OCTOBER', font=font(23, 'k'), fill=GOOD); y += 40
        for g in good:
            for j, ln in enumerate(wrap(d, g, font(24, 'r'), R - X - 40)[:2]):
                if j == 0: d.text((X, y), '✔', font=ImageFont.truetype(F + 'seguisym.ttf', 24), fill=GOOD)
                d.text((X + 38, y), ln, font=font(24, 'r'), fill='#0e1530'); y += 33
            y += 6
        y += 10
    if o: d.line([X, y, R, y], fill='#e2e8f0', width=2); y += 22
    d.text((X, y), 'LEARNINGS → WHAT TO DO BETTER IN NOVEMBER' if o else 'HOW TO START NOVEMBER (NEW IN THIS ROLE)', font=font(23, 'k'), fill=BAD); y += 44
    team = p.get('team') if lvl == 'ASM' else None
    stop = H - 110 - (60 + 44 * min(len(team), 6) if team else 0)
    shown = 0
    for i, (_, title, body) in enumerate(todo):
        lines = wrap(d, body, font(23, 'r'), R - X - 56)[:3]
        if y + 40 + len(lines) * 31 > stop: break
        d.ellipse([X, y + 2, X + 38, y + 40], fill='#4f46e5'); d.text((X + 19, y + 21), str(i + 1), font=font(22, 'b'), fill='white', anchor='mm')
        d.text((X + 56, y), title, font=font(27, 'b'), fill='#0e1530'); y += 40
        for ln in lines: d.text((X + 56, y), ln, font=font(23, 'r'), fill='#334155'); y += 31
        y += 14; shown += 1
    if team:
        y = max(y, stop) + 4; d.line([X, y, R, y], fill='#e2e8f0', width=2); y += 18
        d.text((X, y), 'TEAM NOVEMBER TARGETS', font=font(22, 'k'), fill='#4f46e5')
        d.text((R, y), 'Nov target  ·  Oct billed', font=font(19, 's'), fill='#64748b', anchor='ra'); y += 38
        for nm in team[:6]:
            s = SE_BY[nm]; so = s['oct']; bpct = so['bill'] / so['target'] if so and so['target'] else None
            d.ellipse([X, y + 8, X + 16, y + 24], fill=band(bpct, 1, .8))
            d.text((X + 28, y), nm, font=fit(d, nm, 's', 24, 520), fill='#0e1530')
            d.text((R, y), f"{fIN(s['target'])}  ·  {fP(bpct) if so else 'new'}", font=font(24, 'b'), fill='#0e1530', anchor='ra'); y += 44
    d.text((60, H - 30), 'November plan · 16-Point Evaluation Tracker · Hero Cycles · internal', font=font(21, 'r'), fill=(255, 255, 255, 150), anchor='ls')
    return img.convert('RGB'), good, todo

def caption(p, lvl, good, todo):
    o, t = p['oct'], p['target']
    lines = [f"*{p['name']} · November 2026 plan*", f"Target: {fIN(t)} units · {fIN(p['perDay'])}/day over {p['workDays']} days",
             'Weeks: ' + ' | '.join(f"W{i + 1} {fIN(v)}" for i, v in enumerate(p['weeks']))]
    if o: lines.append(f"October: billed {fIN(o['bill'])} of {fIN(o['target'])} ({fP(o['bill'] / o['target'] if o['target'] else None)}), ordered {fIN(o['order'])}")
    if good: lines.append('✔ ' + good[0])
    lines.append('Focus for November:'); lines += [f"{i + 1}. {x[1]}" for i, x in enumerate(todo[:3])]
    return '\n'.join(lines)

SE_BY = {s['name']: s for s in data['se']}
safe = lambda s: re.sub(r'[^\w\- ]', '', s).strip()
msgs, summary = [], []
for lvl, people in (('ASM', data['asm']), ('SE', data['se'])):
    os.makedirs(os.path.join(OUT, lvl), exist_ok=True)
    for p in people:
        img, good, todo = card(p, lvl)
        fn = f"{lvl} {safe(p['name'])} - Nov-26 plan.png"; img.save(os.path.join(OUT, lvl, fn), optimize=True)
        c = p['contact']; cap = caption(p, lvl, good, todo)
        msgs.append(f"===== {lvl} · {p['name']} · {('+91 ' + c['phone']) if c.get('phone') else 'NO NUMBER in Contacts'} · {c.get('email') or 'no email'}\n"
                    f"Card: {lvl}\\{fn}\n" + (f"Open chat: https://wa.me/91{c['phone']}\n" if c.get('phone') else '') + '\n' + cap + '\n')
        o = p['oct']
        summary.append([lvl, p['zone'], p.get('asm', ''), p['name'], t := p['target'], *p['weeks'], p['perDay'], o and o['target'], o and o['bill'],
                        o and (round(o['bill'] / o['target'] * 100) if o['target'] else None), o and o['order'], ' | '.join(x[1] for x in todo[:4]), c.get('phone', ''), c.get('email', '')])
open(os.path.join(OUT, 'WhatsApp_messages.txt'), 'w', encoding='utf-8-sig').write('\n'.join(msgs))
with open(os.path.join(OUT, 'Nov_Plan_Summary.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f); w.writerow(['Level', 'Zone', 'ASM', 'Name', 'Nov target', 'W1 1-7', 'W2 8-14', 'W3 15-21', 'W4 22-30', 'Per day', 'Oct target', 'Oct billed', 'Oct billed %', 'Oct ordered', 'Top learnings', 'WhatsApp', 'Email']); w.writerows(summary)
print('cards:', len(summary))
