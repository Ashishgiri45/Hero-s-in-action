"""KPI & logic reference guide for the 16-Point Evaluation Tracker (PDF).
   python tools/make_guide_pdf.py OUT.pdf"""
import sys
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, KeepTogether, NextPageTemplate)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont('UI', r'C:\Windows\Fonts\segoeui.ttf'))
pdfmetrics.registerFont(TTFont('UIB', r'C:\Windows\Fonts\segoeuib.ttf'))
pdfmetrics.registerFont(TTFont('UII', r'C:\Windows\Fonts\segoeuii.ttf'))
pdfmetrics.registerFontFamily('UI', normal='UI', bold='UIB', italic='UII', boldItalic='UIB')

INK, MUTED, LINE = colors.HexColor('#1e1b4b'), colors.HexColor('#64748b'), colors.HexColor('#e2e8f0')
ACC, ACC2, SOFT = colors.HexColor('#6366f1'), colors.HexColor('#ec4899'), colors.HexColor('#eef2ff')
GOOD, WARN, SER, CRIT = colors.HexColor('#16a34a'), colors.HexColor('#d97706'), colors.HexColor('#ea580c'), colors.HexColor('#e11d48')
GRP = {'Volume': colors.HexColor('#6366f1'), 'Coverage': colors.HexColor('#0ea5e9'), 'Growth & range': colors.HexColor('#10b981'),
       'Premium mix': colors.HexColor('#a855f7'), 'Dealer health': colors.HexColor('#f59e0b'), 'Visibility & market': colors.HexColor('#ec4899')}

S = lambda name, **k: ParagraphStyle(name, fontName=k.pop('font', 'UI'), textColor=k.pop('color', INK), **k)
H1 = S('h1', font='UIB', fontSize=19, leading=24, spaceBefore=2, spaceAfter=4)
H2 = S('h2', font='UIB', fontSize=12.5, leading=16, spaceBefore=8, spaceAfter=4, color=ACC)
P = S('p', fontSize=9, leading=12.6, spaceAfter=4)
PM = S('pm', fontSize=8.5, leading=11.5, color=MUTED, spaceAfter=4)
C = S('c', fontSize=7.9, leading=10.2)
CB = S('cb', font='UIB', fontSize=7.9, leading=10.2)
CH = S('ch', font='UIB', fontSize=8, leading=10, color=colors.white)
F = S('f', fontSize=7.9, leading=10.2, color=colors.HexColor('#3730a3'))

def para(t, st=C): return Paragraph(t, st)

def table(head, rows, widths, group_col=None, zebra=True, styles=()):
    data = [[para(h, CH) for h in head]] + [[c if not isinstance(c, str) else para(c, CB if j == 0 else (F if head[j].startswith('Formula') else C)) for j, c in enumerate(r)] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    st = [('BACKGROUND', (0, 0), (-1, 0), INK), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
          ('LINEBELOW', (0, 1), (-1, -1), .4, LINE), ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5),
          ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]
    if zebra: st += [('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f8fafc')) for i in range(2, len(data), 2)]
    t.setStyle(TableStyle(st + list(styles)))
    return t

def box(text, color=ACC, bg=SOFT):
    t = Table([[para(text, S('bx', fontSize=8.6, leading=12))]], colWidths=[None])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), bg), ('LINEBEFORE', (0, 0), (0, -1), 3, color),
                           ('LEFTPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    return t

W, Hh = landscape(A4)
M = 14 * mm
TW = W - 2 * M

def deco(c, d):
    c.saveState()
    c.setFillColor(INK); c.rect(0, Hh - 11 * mm, W, 11 * mm, stroke=0, fill=1)
    c.setFillColor(ACC2); c.rect(0, Hh - 11 * mm, 60 * mm, 1.2 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont('UIB', 9.5); c.drawString(M, Hh - 7.2 * mm, '16-Point Evaluation Tracker · KPI & Logic Reference')
    c.setFont('UI', 8); c.drawRightString(W - M, Hh - 7.2 * mm, 'Hero Cycles · SE / ASM performance · October 2026 data')
    c.setFillColor(MUTED); c.setFont('UI', 7.5)
    c.drawString(M, 7 * mm, 'Internal — for sales team understanding. Examples use the SE Evaluation Dashboard – OCT-26 workbook (data to Wed 28 Oct 2026).')
    c.drawRightString(W - M, 7 * mm, f'Page {d.page}')
    c.restoreState()

def cover(c, d):
    c.saveState()
    c.setFillColor(INK); c.rect(0, 0, W, Hh, stroke=0, fill=1)
    for i, col in enumerate(['#6366f1', '#0ea5e9', '#10b981', '#a855f7', '#f59e0b', '#ec4899']):
        c.setFillColor(colors.HexColor(col)); c.rect(M + i * 34 * mm, Hh * .62, 30 * mm, 2.2 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont('UIB', 34); c.drawString(M, Hh * .5, '16-Point Evaluation Tracker')
    c.setFont('UIB', 20); c.setFillColor(colors.HexColor('#c7d2fe')); c.drawString(M, Hh * .5 - 12 * mm, 'KPI, report & action-plan logic — how every number is calculated')
    c.setFont('UI', 11); c.setFillColor(colors.HexColor('#e0e7ff'))
    y = Hh * .5 - 26 * mm
    for line in ['Every header shown in the tracker, its logic and formula, the workbook sheet it comes from, and a worked example.',
                 'Example SE: Madhav Kumar Singh (West zone, ASM Swapnil Satpute). Example ASM: Swapnil Satpute. Data to Wed 28 Oct 2026.',
                 'Source workbook: SE Evaluation Dashboard – OCT-26.xlsx']:
        c.drawString(M, y, line); y -= 6.5 * mm
    c.setFont('UI', 9); c.setFillColor(colors.HexColor('#a5b4fc')); c.drawString(M, 12 * mm, 'Internal · Hero Cycles sales team')
    c.restoreState()

doc = BaseDocTemplate(sys.argv[1], pagesize=landscape(A4), leftMargin=M, rightMargin=M, topMargin=16 * mm, bottomMargin=13 * mm,
                      title='16-Point Evaluation Tracker – KPI & Logic Reference', author='16-Point Evaluation Tracker')
fr = Frame(M, 13 * mm, TW, Hh - 29 * mm, id='f')
doc.addPageTemplates([PageTemplate('cover', [Frame(0, 0, W, Hh)], onPage=cover), PageTemplate('body', [fr], onPage=deco)])
st = [NextPageTemplate('body'), PageBreak()]

# ---------------- contents ----------------
st += [Paragraph('Contents', H1)]
toc = [('1', 'Data sources & dates', 'Which workbook sheet feeds which number; the data date and calendar used.'),
       ('2', 'Key terms', 'Active dealer, billed dealer, KPI base, days gone / left, working days.'),
       ('3', 'Volume figures (Target → Status)', 'Target, Ordered, Billed, Balance, Day target, run rates, pace and status.'),
       ('4', 'The 16 KPIs', 'Definition, target formula, achievement formula, source sheet and example for each KPI.'),
       ('5', 'Composite score & bands', 'How the 0–100 score and the KPI colours are worked out.'),
       ('6', 'Zone / ASM / SE views', 'How totals roll up from SE to ASM, zone and All India.'),
       ('7', 'Daily action plan', 'Every action type, when it appears, its priority and its numbers.'),
       ('8', 'Weekly action plan', 'Weeks, week targets, week %, trend and next-week target.'),
       ('9', 'Dealer focus list', 'How dealers are scored and ranked for visits.'),
       ('10', 'Tracking, exports, WhatsApp card & email', 'What each output contains and how status is tracked.'),
       ('11', 'Quick reference — thresholds', 'All bands and cut-offs on one page.')]
st += [table(['#', 'Section', 'What it covers'], toc, [12 * mm, 70 * mm, TW - 82 * mm])]
st += [Spacer(1, 8), box('<b>How to read the formula columns:</b> “÷” divide, “×” multiply, “−” minus, “ROUND” nearest whole number, “CEIL” round up. '
                         'Unless stated, “this month” means 1 Oct 2026 up to the data date. Percentages are shown rounded to whole numbers.')]

# ---------------- 1 sources ----------------
st += [PageBreak(), Paragraph('1 · Data sources & dates', H1),
       Paragraph('Everything comes from one master workbook uploaded by the admin. The tracker reads these sheets:', P)]
src = [('Dashboard RSE', 'One row per SE: Zone, ASM Name, SE Name, Target, MTD Order Ach, Billing Volume, Balance, Current Run Rate, Required Run Rate, Billing Point Target / Ach, MBD Target / Ach.', 'Master list of SEs; SE Target, Ordered, Billed, Balance, run rates; billing points and MBD in plans.'),
       ('Dashboard ASM', 'Same figures per ASM (Billing Vol Ach for billed).', 'Master list of ASMs; ASM / zone / All India totals (sum of ASM rows).'),
       ('Date ASM Wise Billing', 'Date-wise billing totals by ASM.', 'Data date of the dashboards = last date with billing > 0 (28 Oct).'),
       ('Billing', 'Invoice lines: customer, bill date, quantity, value, segment, model, Premium flag, NPD flag.', 'Units billed per dealer per day; NPD, premium and model counts (KPIs 1, 5, 6, 8, 9); daily / weekly charts. Runs to 26 Oct.'),
       ('Dealer master', 'Dealer code, name, city, state, zone, ASM, RSE code.', 'Dealer list and mapping to SE / ASM / zone.'),
       ('Dealer_Vol1', 'Active/Inactive status, RSE/DSE, monthly volumes, OD, Active complaint, GSB, ISB.', 'KPI base (Active dealers), Jul–Sep average (L3M), OD (KPI 10), complaints (KPI 11), GSB / ISB (KPI 13, 14).'),
       ('Dealer_Val1', 'H_ValGrew / H_ASPGrew flags for the month.', 'Value-growth (KPI 4) and ASP-growth (KPI 7) dealers.'),
       ('Dealer-MBD1', 'Model target per dealer.', 'MBD target (KPI 6) and dealer range gaps in the focus list.'),
       ('google rating', 'Average rating per dealer.', 'KPI 12 (rating above 4.0).'),
       ('DPL - PLS', 'PLS Dist ≥ State?, DPL Dist ≥ State?, FY26-27 YTD sales.', 'KPI 15 and KPI 16.'),
       ('NPD SKU List', 'Material codes of new products.', 'Marks NPD lines in Billing when the NPD column is empty (KPI 5).'),
       ('MTD DJP SUMMARY MONTH WISE', 'October block: MTD Plan, MTD Ach, Productive calls per RSE and ASM.', 'Journey-plan adherence (KPI 2) and the DJP action.'),
       ('Index / Secondary', 'Sub-dealers “Active & Approved” per SE; secondary billing points by month.', 'Sub-dealer billing points (KPI 3).'),
       ('KPI Config', 'Current month start, as-of date, roster.', 'Which month is being measured.'),
       ('Contacts', 'Name, role, email, phone.', 'Logins (email) and email / WhatsApp sending.')]
st += [table(['Sheet', 'Columns used', 'Used for'], src, [44 * mm, 112 * mm, TW - 156 * mm])]
st += [Spacer(1, 6), box('<b>Two dates.</b> The dashboards (targets and orders) run to <b>Wed 28 Oct</b>; Billing lines run to <b>Mon 26 Oct</b>. '
                         'Target / Ordered / Balance / Day target always use the dashboard date. Day-by-day charts, dealer lists and KPIs from Billing use 26 Oct. '
                         'Plans are made for the next day (<b>Thu 29 Oct</b>).')]

# ---------------- 2 terms ----------------
st += [PageBreak(), Paragraph('2 · Key terms', H1)]
terms = [('Active dealer', 'Dealer marked “Active” in Dealer_Vol1 for that SE.', 'Status column of Dealer_Vol1', 'Madhav: 38 active dealers'),
         ('KPI base', 'Number of active dealers in the scope. Most KPI targets = base × a fixed %.', 'COUNT(active dealers)', '38'),
         ('Billed dealer (billing point)', 'Dealer with net units billed > 0 this month. Dealers not in Dealer_Vol1 are left out of KPI counts (their units still count in volume).', 'COUNT(dealers with units > 0)', '29 billed'),
         ('Mapped dealers', 'All dealers mapped to the SE in Dealer master / Dealer_Vol1 (active + inactive).', '—', '69 mapped'),
         ('Days gone', 'Calendar days from 1st of month to the dashboard date.', 'Dashboard date', '28'),
         ('Days left', 'Calendar days remaining after the dashboard date.', 'Days in month − days gone', '31 − 28 = 3'),
         ('Working days', 'Days excluding Sundays. Used only for weekly pro-rata targets and the older fallback plan.', 'COUNT(Mon–Sat in month)', 'October: 27'),
         ('L3M (Jul–Sep average)', 'Average monthly units of the 3 months before the current month.', '(Jul + Aug + Sep) ÷ 3, Dealer_Vol1', 'Anand Cycle Stores: 136'),
         ('Premium line', 'Billing line with Premium = Y. If blank: unit price > ₹5,600 (Kids segment > ₹3,500).', 'Billing', '—'),
         ('NPD line', 'Billing line flagged NPD, or whose material is on the NPD SKU List.', 'Billing / NPD SKU List', '—'),
         ('Model', 'Distinct Segment + Model combination billed to a dealer.', 'Billing', '—')]
st += [table(['Term', 'Meaning', 'Formula / source', 'Example (Madhav Kumar Singh)'], terms, [44 * mm, 110 * mm, 62 * mm, TW - 216 * mm])]

# ---------------- 3 volume ----------------
st += [PageBreak(), Paragraph('3 · Volume figures — Target, Ordered, Billed, Balance, Day target', H1),
       Paragraph('These headers appear on every SE / ASM view, the daily plan, the WhatsApp card and the email. They are taken from <b>Dashboard RSE</b> (SE) and <b>Dashboard ASM</b> (ASM) and are order based, exactly as in the workbook.', P)]
vol = [('Target', 'Month target for the SE / ASM.', 'Dashboard “Target” column', 'Dashboard RSE / ASM', '6,260'),
       ('Ordered (MTD)', 'Units ordered this month up to the data date.', 'Dashboard “MTD Order Ach”', 'Dashboard RSE / ASM', '2,193'),
       ('Order %  (Achieved)', 'Share of target already ordered.', 'Ordered ÷ Target', 'derived', '2,193 ÷ 6,260 = 35%'),
       ('Billed (MTD)', 'Units actually invoiced this month.', 'Dashboard “Billing Volume” (ASM: “Billing Vol Ach”)', 'Dashboard RSE / ASM', '1,891'),
       ('Billed %', 'Share of target billed.', 'Billed ÷ Target', 'derived', '1,891 ÷ 6,260 = 30%'),
       ('Pending to bill', 'Ordered but not yet invoiced.', 'MAX(0, Ordered − Billed)', 'derived', '2,193 − 1,891 = 302'),
       ('Balance (Gap)', 'Units still to be ordered to reach target.', 'Target − Ordered  (dashboard “Balance”)', 'Dashboard RSE / ASM', '6,260 − 2,193 = 4,067'),
       ('Days left', 'Calendar days remaining.', 'Days in month − days gone', 'Date ASM Wise Billing', '31 − 28 = 3'),
       ('Day target  (Need / day, Required run rate)', 'Orders needed each remaining day to close the balance.', 'CEIL(Balance ÷ Days left)  (dashboard “Required Run Rate”)', 'Dashboard RSE / ASM', '4,067 ÷ 3 = 1,355.7 → 1,356'),
       ('Current run rate', 'Average orders per day so far.', 'Ordered ÷ Days gone (dashboard “Current Run Rate”)', 'Dashboard RSE / ASM', '2,193 ÷ 28 = 78 / day'),
       ('Target due by today', 'How much should have been ordered by now at an even pace.', 'Target × Days gone ÷ Days in month', 'derived', '6,260 × 28 ÷ 31 = 5,654'),
       ('Pace', 'Orders against the target due by today.', 'Ordered ÷ Target due by today', 'derived', '2,193 ÷ 5,654 = 39%'),
       ('Status', 'Band of Pace.', 'On track ≥ 100% · Watch ≥ 90% · Behind ≥ 70% · Critical < 70% · No target', 'derived', '39% → Critical')]
st += [table(['Header', 'Meaning', 'Formula', 'Reference sheet', 'Example (Madhav)'], vol, [46 * mm, 66 * mm, 76 * mm, 38 * mm, TW - 226 * mm],
             styles=[('BACKGROUND', (0, 9), (-1, 9), colors.HexColor('#fef3c7'))])]
st += [Spacer(1, 6), box('<b>Why “Achieved” can look odd next to “Gap”.</b> Gap and Day target are based on <b>orders</b>, not billing. '
                         'So for Madhav the gap is 6,260 − 2,193 (ordered) = 4,067, not 6,260 − 1,891 (billed). The plan shows Ordered and Billed separately to avoid confusion.', WARN, colors.HexColor('#fffbeb')),
       Spacer(1, 4), Paragraph('<b>No target:</b> rows with no target in the dashboard (e.g. Madurai, Andhra Pradesh) show “No target” and no pace. Rows where every figure is zero are left out. “Vacant” / “TBA” rows are shown as “Vacant – HQ” / “TBA – HQ”.', PM)]

# ---------------- 4 KPIs ----------------
st += [PageBreak(), Paragraph('4 · The 16 KPIs', H1),
       Paragraph('Each KPI has a target and an achievement for the scope (SE, ASM, zone or All India). <b>Ach % = Achievement ÷ Target.</b> '
                 'KPIs 1–10 carry 10 points each in the composite score; KPIs 11–16 are tracked but carry no weight. Examples are Madhav Kumar Singh (base = 38 active dealers).', P)]
k = [('1', 'Coverage', '% Dealers billed / month  (Billing points)', 'Dealers with net billing > 0 this month', 'ROUND(base × 90%)', 'COUNT(billed dealers)', 'Billing, Dealer_Vol1', 'T = ROUND(38 × 0.9) = 34; A = 29 → 85%'),
     ('2', 'Coverage', '% Dealers covered per PJP  (DJP adherence)', 'Actual journey-plan visits vs planned', 'MTD planned visits', 'MTD actual visits', 'MTD DJP SUMMARY MONTH WISE', 'T = 55; A = 40 → 73%'),
     ('3', 'Coverage', '% Sub-dealers billed', 'Sub-dealers billed by the SE’s distributors this month', 'ROUND(mapped sub-dealers × 75%)', 'Σ Secondary “Billing Point” (current month)', 'Index, Secondary', 'No sub-dealer data for Madhav → no score'),
     ('4', 'Growth & range', '% Dealers growing value', 'Active dealers whose YTD value beats the base year', 'ROUND(base × 75%)', 'COUNT(H_ValGrew > 0)', 'Dealer_Val1', 'T = ROUND(28.5) = 29; A = 8 → 28%'),
     ('5', 'Growth & range', '% Counters with NPD placement', 'Billed dealers that took any NPD SKU', 'ROUND(base × 50%)', 'COUNT(billed dealers with NPD units > 0)', 'Billing, NPD SKU List', 'T = 19; A = 0 → 0%'),
     ('6', 'Growth & range', 'MBD – models per dealer', 'Average distinct models per billed dealer', 'Average of dealer model targets (Dealer-MBD1)', 'Σ models ÷ billed dealers', 'Dealer-MBD1, Billing', 'T = 9.6; A = 6.6 → 69%  (plan uses dashboard 8.75 / 7.27)'),
     ('7', 'Growth & range', '% Dealers improving ASP', 'Dealers whose average selling price beats the base year', 'ROUND(base × 75%)', 'COUNT(H_ASPGrew > 0)', 'Dealer_Val1', 'T = 29; A = 29 → 100%'),
     ('8', 'Premium mix', '% Dealers billing premium', 'Billed dealers with premium units', 'ROUND(base × 75%)', 'COUNT(billed dealers with premium > 0)', 'Billing', 'T = 29; A = 15 → 52%'),
     ('9', 'Premium mix', 'Premium share of volume', 'Premium units out of all units billed', '6% (fixed)', 'Premium units ÷ total units', 'Billing', 'A = 96 ÷ 1,451 = 6.6% → 110%'),
     ('10', 'Dealer health', '% Dealers with no overdue (OD)', 'Active dealers with no OD above ₹10,000', 'ROUND(base × 90%)', 'COUNT(active, OD = 0)', 'Dealer_Vol1 (OD)', 'T = 34; A = 38 → 112%'),
     ('11', 'Dealer health', '% Dealers with no pending complaints', 'Active dealers with no open complaint', 'ROUND(base × 90%)', 'COUNT(active, complaints = 0)', 'Dealer_Vol1 (Active complaint)', 'T = 34; A = 35 → 103%'),
     ('12', 'Dealer health', '% Dealers > 4.0 Google rating', 'Dealers rated above 4.0', 'ROUND(base × 30%)', 'COUNT(rating > 4.0)', 'google rating', 'T = ROUND(11.4) = 11; A = 4 → 36%'),
     ('13', 'Visibility & market', '% Dealers having GSB', 'Active dealers with a glow sign board', 'ROUND(base × 50%)', 'COUNT(active, GSB = Y)', 'Dealer_Vol1 (GSB)', 'T = 19; A = 10 → 53%'),
     ('14', 'Visibility & market', '% Dealers having ISB', 'Active dealers with in-shop branding', 'ROUND(base × 50%)', 'COUNT(active, ISB = Y)', 'Dealer_Vol1 (ISB)', 'T = 19; A = 15 → 79%'),
     ('15', 'Visibility & market', '% Dealers in districts ≥ State PLS', 'Dealers in districts at or above state population-linked share, with YTD sales', 'ROUND(base × 60%)', 'COUNT(PLS Dist ≥ State = 1 and sales > 0)', 'DPL - PLS', 'T = ROUND(22.8) = 23; A = 13 → 57%'),
     ('16', 'Visibility & market', '% Dealers in districts ≥ State DPL', 'Dealers in districts at or above state dealers-per-lakh, with YTD sales', 'ROUND(base × 60%)', 'COUNT(DPL Dist ≥ State = 1 and sales > 0)', 'DPL - PLS', 'T = 23; A = 30 → 130%')]
rows = [[para(f'<b>{r[0]}</b>', CB), para(f'<font color="{GRP[r[1]].hexval().replace("0x", "#")}"><b>{r[1]}</b></font>'), para(f'<b>{r[2]}</b>'), r[3], r[4], r[5], r[6], r[7]] for r in k]
st += [table(['#', 'Group', 'KPI', 'Logic', 'Formula – target', 'Formula – achievement', 'Reference sheet', 'Example (Madhav, base 38)'], rows,
             [8 * mm, 25 * mm, 46 * mm, 46 * mm, 38 * mm, 40 * mm, 31 * mm, TW - 234 * mm])]
st += [Spacer(1, 4), Paragraph('Weight: KPIs 1–10 = 10% each; KPIs 11–16 = 0% (shown for tracking only). A KPI with no data (target 0 or source missing) shows “No data” and is left out of the score. '
                               'In action plans, Billing points and MBD use the dashboard’s own Billing Point / MBD Target and Ach columns when present (Madhav: billing points 30 of 32, MBD 7.27 of 8.75).', PM)]

# ---------------- 5 composite ----------------
st += [PageBreak(), Paragraph('5 · Composite score & bands', H1)]
st += [table(['Item', 'Formula', 'Example (Madhav)'], [
    ('KPI score', 'MIN(Ach %, 120%) × weight   (achievement above 120% is capped)', 'KPI 10: MIN(112%, 120%) × 10 = 11.2 points'),
    ('Composite score (0–100)', 'Σ KPI scores ÷ Σ weights of KPIs that have data × 100', '(8.5 + 7.3 + 2.8 + 0 + 6.9 + 10 + 5.2 + 11.0 + 11.2) ÷ 90 × 100 = 70  (KPI 3 has no data, so 9 KPIs × 10 = 90)'),
    ('Score band', 'Strong ≥ 90 · Steady ≥ 75 · At risk ≥ 50 · Critical < 50', '70 → At risk'),
    ('KPI colour (Ach % band)', 'Achieved ≥ 100% (green) · Close ≥ 80% (amber) · Behind ≥ 50% (orange) · Critical < 50% (red)', 'KPI 1 85% → Close; KPI 5 0% → Critical'),
    ('Rank', 'SEs (or ASMs) sorted by composite score within the filter; 1 = highest', 'Shown on the leaderboard and profile')],
    [48 * mm, 110 * mm, TW - 158 * mm])]
st += [Spacer(1, 6), box('<b>Volume status vs composite score.</b> “Status” (On track / Watch / Behind / Critical) comes only from volume pace (section 3). '
                         'The composite score measures the 16-KPI quality of the territory. An SE can be Critical on volume and still Steady on the score, or the other way round.')]

# ---------------- 6 roll-up ----------------
st += [Paragraph('6 · Zone / ASM / SE views — how totals roll up', H2)]
st += [table(['View', 'Target / Ordered / Billed / Balance', 'Day target', 'KPIs', 'Example'], [
    ('SE', 'Own row in Dashboard RSE', 'Own “Required Run Rate”', 'Own mapped dealers', 'Madhav: 6,260 / 2,193 / 1,891 / 4,067; 1,356 per day'),
    ('ASM', 'Own row in Dashboard ASM', 'Own “Required Run Rate”', 'All dealers of the ASM', 'Swapnil Satpute: 16,934 / 7,341 ordered / balance 9,593; 3,198 per day; pace 48% → Critical'),
    ('Zone', 'Σ of the zone’s ASM rows', 'Σ positive ASM balances ÷ days left (ASMs ahead of target do not reduce it)', 'All dealers of the zone', '—'),
    ('All India', 'Σ of all ASM rows', 'Same rule as zone', 'All dealers', '2,26,798 target; 1,80,700 ordered (80%); 1,50,114 billed; balance 46,098; 15,714 per day; pace 88% → Behind'),
    ('State / category filter', 'Dashboard figures cannot be split by state or category, so the view uses billing and the dealer plan instead', 'Gap ÷ working days left', 'Filtered dealers', 'Shown with “plan” wording instead of “orders”')],
    [30 * mm, 66 * mm, 62 * mm, 36 * mm, TW - 194 * mm])]

# ---------------- 7 daily ----------------
st += [PageBreak(), Paragraph('7 · Daily action plan', H1),
       Paragraph('Made for the next day after the data date (Thu 29 Oct). Up to <b>6 actions</b> per person; the volume action is always first, then by priority. '
                 '<b>Priority from status:</b> Critical / Behind → High · Watch / No target → Medium · On track → Low. Deadline: plan day, 6:00 pm; follow-up by the ASM.', P)]
daily = [('vol', 'Orders vs target (always)', 'Every SE / ASM with a dashboard row', 'Book CEIL(Balance ÷ Days left) units of orders every day. ASM: also lists the 5 SEs with the highest day targets.', 'Status band', '“Orders 35% of target — balance 4,067” → book ≥ 1,356/day (High)'),
         ('bill', 'Ordered not yet billed', 'Pending = Ordered − Billed > 0', 'Chase dispatch / billing of pending orders with the depot.', 'High if Billed % < 70% × (working days gone ÷ working days); else Medium', '302 units pending (High)'),
         ('bp', 'Billing points short', 'Billing point Ach < Target', 'Get first orders from N = CEIL(gap ÷ days left) dealers; names the best unbilled dealers (bought in Jul–Sep or have a plan).', 'Band of BP pace = Ach ÷ (Target × days gone ÷ days in month)', '30 of 32, 2 short; pace 104% → Low'),
         ('npd', 'NPD counters short', 'KPI 5 Ach < Target', 'Add one NPD SKU at N = CEIL(gap ÷ days left) dealers; names billed dealers with no NPD.', 'Band of Ach ÷ (Target × working-day share)', '0 of 19 (High)'),
         ('mbd', 'Range (models per dealer) low', 'MBD Ach < Target', 'Add missing models at the dealers furthest below their own model target; suggests the zone’s best-selling models they lack.', 'Band of MBD Ach %', '7.3 vs 8.8 = 83% → Behind (High)'),
         ('prem', 'Premium share below 6%', 'KPI 9 < 6%', 'Premium units needed = CEIL(6% × total units − premium units).', 'Band of KPI 9 Ach %', 'Not shown for Madhav (6.6%)'),
         ('od', 'Overdue dealers', 'Any active dealer with OD > ₹10k', 'Collect from the 3 largest OD dealers.', 'Medium (OD snapshot may be dated)', '—'),
         ('pjp', 'Journey-plan (DJP) adherence', 'Adherence = Actual ÷ Planned visits < 90%, or no DJP record', 'Complete every planned visit and log it.', 'Band of adherence', '40 of 55 = 73% → Behind (High)'),
         ('mom', 'Billing slowing down', 'Last 7 days units vs previous 7 days fell by more than 5%', 'Find the cause with the ASM (stock, dispatch, demand).', 'High if fall > 25%, else Medium', 'Madhav up 27% (617 vs 486) → not shown'),
         ('keep', 'Performing to plan', 'Status On track and all actions Low', 'Keep the rhythm; share what works.', 'Low', '—')]
st += [table(['Key', 'Action (issue)', 'Appears when', 'Action & numbers', 'Priority rule', 'Example (Madhav, 29 Oct)'], daily,
             [13 * mm, 38 * mm, 48 * mm, 74 * mm, 52 * mm, TW - 225 * mm])]
st += [Spacer(1, 4), Paragraph('<b>ASM daily plan</b> adds: <b>rse</b> — SEs Behind / Critical, with their pace and gap, and a joint-working call with the 3 largest gaps (High if any SE is Critical); '
                               '<b>bp</b> — team billing points with the SEs having the largest gaps; <b>ord</b> — open orders and stock rejections (High if rejected > open); '
                               '<b>pjp</b> — SEs with no DJP record or below 90%; <b>carry</b> — open actions from earlier plans (High if any overdue); <b>keep</b> — SEs on pace to recognise.', PM)]
st += [box('<b>Madhav’s daily plan for Thu 29 Oct (6 actions):</b> 1 vol (High) Orders 35% of target — balance 4,067 · 2 bill (High) 302 ordered units not billed · '
           '3 npd (High) NPD 0 of 19 · 4 mbd (High) Range 7.3 vs 8.8 · 5 pjp (High) DJP 73% · 6 bp (Low) Billing points 30 of 32.')]

# ---------------- 8 weekly ----------------
st += [PageBreak(), Paragraph('8 · Weekly action plan', H1)]
wk = [('Weeks', 'Fixed calendar blocks, not Mon–Sun', 'W1 1–7 · W2 8–14 · W3 15–21 · W4 22–28 · W5 29–end', '—', 'W5 = 29–31 Oct'),
      ('Week target (pro-rata)', 'Share of the month target for the working days of the week (up to the data date)', 'Target × working days in week ÷ working days in month', 'Dashboard target, calendar', 'W1: 6,260 × 6 ÷ 27 = 1,391'),
      ('Week achieved', 'Units billed in the week', 'Σ daily billed units in the week', 'Billing', 'W3: 450 units'),
      ('Week %', 'Week achieved ÷ week target', 'Units ÷ week target', 'derived', 'W3: 450 ÷ 1,391 = 32%'),
      ('Trend', 'Compares the last two complete weeks', 'Strong: both ≥ 100% · Improving: change > +5 pts · Declining: change < −5 pts · Consistently low: every complete week < 90% · Stable: otherwise · Insufficient: fewer than 2 complete weeks', 'derived', 'W3 32% vs W2 8% → Improving'),
      ('Next-week target', 'Orders to book in the plan week', 'CEIL(Required run rate) × days of the plan week still ahead', 'Dashboard RSE / ASM', 'W5: 3 days × 1,356 = 4,068'),
      ('Checkpoints', 'Mid-week and week-end reviews', '3rd working day of the plan week and its last working day', 'calendar', 'W5: Sat 31 Oct'),
      ('Partial week', 'The reporting week is still in progress', 'Week end > data date; % compares against pro-rata target for days gone', 'calendar', 'W4 (22–28): 601 of 927 = 65%')]
st += [table(['Header', 'Meaning', 'Formula', 'Reference', 'Example (Madhav)'], wk, [36 * mm, 60 * mm, 100 * mm, 34 * mm, TW - 230 * mm])]
st += [Spacer(1, 4), Paragraph('<b>Weekly actions (up to 6):</b> <b>wvol</b> volume for the week (priority from week % band) · <b>wcons</b> no billing on 2 or more working days · '
                               'two largest KPI gaps (billing points, NPD, range, premium) · <b>wtrend</b> action by trend (Declining / Consistently low → High; Improving / Stable / Insufficient → Medium; Strong → Low) · '
                               '<b>wcarry</b> open actions carried forward. ASM weekly plans add the SEs below 90% of their week target.', P)]
st += [box('<b>Madhav’s weekly plan for W5 (29–31 Oct):</b> wvol — book at least 4,068 units of orders (3 days × 1,356/day) and bill every pending order · '
           'wnpd — NPD 0 of 19: add one NPD SKU at 7 dealers · wtrend — Improving, keep the momentum · wbp — billing points 30 of 32.')]

# ---------------- 9 dealer focus ----------------
st += [PageBreak(), Paragraph('9 · Dealer focus list — how dealers are picked', H1),
       Paragraph('Every dealer of the SE gets points for each gap below. The list is sorted by total points (then by potential = MAX(L3M, plan)). '
                 'The top dealers appear in the plan, the profile, the WhatsApp card (“Dealers to focus on”) and the Dealer details export.', P)]
foc = [('Not billed this month', 'Active dealer with 0 units', '50 + MIN(30, potential ÷ 4), potential = MAX(L3M, plan × 0.8)', 'Book an order (shows Jul–Sep average and plan)', 'Billing, Dealer_Vol1'),
       ('Open order', 'Not billed and has an open order', '+10', 'Chase dispatch so it bills before month end', 'Orders'),
       ('No NPD yet', 'Billed, but no NPD units', '22 + MIN(10, L3M ÷ 10)', 'Place the zone’s top NPD models', 'Billing, NPD SKU List'),
       ('Range below target', 'Billed, models < own model target', 'MIN(25, 8 + 2 × missing models)', 'Add N models — suggests zone best-sellers the dealer lacks', 'Dealer-MBD1, Billing'),
       ('No premium billed', 'Billed, no premium units', '+12', 'Pitch the zone’s top premium models', 'Billing'),
       ('Overdue', 'Active dealer with OD > 0', '+15', 'Collect before the next dispatch', 'Dealer_Vol1 (OD)'),
       ('Open complaints', 'Complaints not closed', '+8', 'Close with the service team', 'Dealer_Vol1'),
       ('Rejected for stock', 'Order lines rejected — no stock', '+6', 'Offer in-stock alternates', 'Orders')]
st += [table(['Gap', 'When', 'Points', 'Suggested action', 'Reference sheet'], foc, [44 * mm, 56 * mm, 74 * mm, 66 * mm, TW - 240 * mm])]
st += [Spacer(1, 6), Paragraph('Worked examples — Madhav Kumar Singh’s top 3 dealers', H2)]
st += [table(['Dealer', 'Facts', 'Points calculation', 'Total'], [
    ('S.P. Traders', 'Not billed; L3M 0; Oct plan 1,076', '50 + MIN(30, MAX(0, 1,076 × 0.8) ÷ 4 = 215) = 50 + 30', '80'),
    ('Anand Cycle Stores', 'Billed 2 units; L3M 136; 1 of 11 models; no NPD; no premium', 'NPD 22 + MIN(10, 13.6) = 32 · Range MIN(25, 8 + 2 × 10) = 25 · Premium 12', '69'),
    ('Avinash Traders', 'Billed 26 units; L3M 131; 3 of 16.5 models; no NPD; no premium', 'NPD 22 + 10 = 32 · Range MIN(25, 8 + 2 × 14) = 25 · Premium 12', '69')],
    [42 * mm, 80 * mm, TW - 142 * mm, 20 * mm])]

# ---------------- 10 outputs ----------------
st += [PageBreak(), Paragraph('10 · Tracking, exports, WhatsApp card & email', H1)]
st += [table(['Output', 'What it contains', 'Logic / notes'], [
    ('Action tracking', 'Every generated action with owner, deadline, status and remarks.', 'Status: Pending · In Progress · Completed · Blocked. Overdue = deadline passed and not Completed. Generating again never overwrites status or remarks; open actions carry into the next plan.'),
    ('WhatsApp card (9:16)', 'Name, plan date, status, number tiles, detailed actions, dealers to focus on (SE) or team status (ASM).', 'Daily tiles: Target · Ordered · Balance · Need/day. Weekly tiles: Target · Ordered · Balance · This week (next-week target). Chips: Billed, run rate, billing points, MBD, DJP. Share as Daily, Weekly or Both.'),
    ('WhatsApp text', 'Short caption with the key numbers and top 4 actions.', '“Target · Ordered (%) · Billed (%)” and “Balance · Need/day for N days · Now/day”.'),
    ('Email / bulk email', 'Figures, “How these are calculated” lines (daily), top 5 actions.', 'Bulk: one .eml per person with the card attached, zipped; uses the Contacts sheet emails.'),
    ('Excel exports', 'Executive summary, zone / ASM / SE performance, daily, weekly, monthly, 16-KPI board, dealer details, daily / weekly ASM & SE plans, underperformers, improvement analysis, tracking, consolidated workbook.', 'Every export follows the current Zone / ASM / SE filter; “All” buttons export everyone.'),
    ('Logins', 'Admin sees everything; each ASM sees own team; each SE sees own dealers.', 'Login id = email from the Contacts sheet; password = first name + @hero. Data is encrypted per user on the published site.')],
    [42 * mm, 100 * mm, TW - 142 * mm])]

# ---------------- 11 quick ref ----------------
st += [PageBreak(), Paragraph('11 · Quick reference — thresholds', H1)]
def chip(t, c): return para(f'<font color="{c.hexval().replace("0x", "#")}"><b>{t}</b></font>', C)
st += [table(['Measure', 'Green', 'Amber', 'Orange', 'Red', 'Grey'], [
    ('Volume status (pace)', chip('On track ≥ 100%', GOOD), chip('Watch ≥ 90%', WARN), chip('Behind ≥ 70%', SER), chip('Critical < 70%', CRIT), 'No target'),
    ('KPI Ach % band', chip('Achieved ≥ 100%', GOOD), chip('Close ≥ 80%', WARN), chip('Behind ≥ 50%', SER), chip('Critical < 50%', CRIT), 'No data'),
    ('Composite score', chip('Strong ≥ 90', GOOD), chip('Steady ≥ 75', WARN), chip('At risk ≥ 50', SER), chip('Critical < 50', CRIT), 'No data'),
    ('Action priority', chip('Low — On track', GOOD), chip('Medium — Watch / No target', WARN), '', chip('High — Behind / Critical', CRIT), ''),
    ('Weekly trend', chip('Strong / Improving (> +5 pts)', GOOD), 'Stable (±5 pts)', chip('Consistently low (< 90%)', SER), chip('Declining (< −5 pts)', CRIT), 'Insufficient data')],
    [44 * mm, 50 * mm, 52 * mm, 48 * mm, 50 * mm, TW - 244 * mm])]
st += [Spacer(1, 8), table(['Fixed rule', 'Value'], [
    ('KPI score cap', '120% of target'), ('Premium share target', '6% of units'), ('Premium line (no flag)', 'Unit price > ₹5,600; Kids > ₹3,500'),
    ('OD threshold', '₹10,000 (legal cases excluded)'), ('Rating threshold', 'Above 4.0'), ('DJP action', 'Adherence below 90% or no record'),
    ('Billing momentum action', 'Last 7 days down more than 5% (High above 25%)'), ('Max actions', '6 per daily plan, 6 per weekly plan'),
    ('Plan deadline', 'Plan day, 6:00 pm'), ('Weeks', '1–7, 8–14, 15–21, 22–28, 29–end')], [80 * mm, TW - 80 * mm])]

doc.build(st)
print('ok', sys.argv[1])
