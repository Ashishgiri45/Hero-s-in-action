# 16-Point Evaluation Tracker — SEs & ASMs

## Version 3 (29-Oct-2026)

* **Official figures**: targets, MTD orders, billing, balance and run rates come from the workbook's
  **Dashboard RSE** and **Dashboard ASM** sheets (zone / All India = sum of ASM rows). Rules as in the
  workbook: balance = target − MTD orders; required run rate = balance ÷ calendar days left;
  current run rate = orders ÷ days gone. The date of these figures is the last day with billing in
  **Date ASM Wise Billing** (28-Oct). Plans are for the next day (29-Oct).
* **Daily target in messages** = required run rate (e.g. Amarjeet Kanaujiya 550/day, Hemant Tiwari
  663/day). New action: ordered units not yet billed. Billing points and MBD use the dashboard's own targets.
* **Logins**: admin (`admin` + admin password) sees everything; each ASM / SE signs in with the work
  email from **Contacts** and password = first name in lower case + `@hero` (e.g. `amarjeet@hero`).
  ASMs see only their team, SEs only their own dealers — each login's data is encrypted separately
  with that person's password. Login list: `private-data/Logins_2026-10-28.xlsx` (admin only).
  **These passwords are easy to guess** for anyone who knows a colleague's email and first name.
* **Publishing an update**: admin signs in → Upload data (new workbook) → Method & data → Publish
  update (admin password) → replace `js/data.js` in the Netlify upload folder → redeploy.
  People without an email in Contacts get no login (see the "No login yet" sheet).

## Version 2 (28-Oct-2026)

* **Name**: 16-Point Evaluation Tracker · Sales Executives (SE) & Area Sales Managers (ASM). "SE" is used
  throughout (was RSE).
* **Data built in, password-protected**: the published site carries the latest data in `js/data.js`,
  encrypted (AES-256-GCM, key from the team password via PBKDF2-SHA256, 310,000 rounds). Visitors enter
  the team password once ("Remember on this device"). Without the password the file is unreadable.
  Team password: `private-data/TEAM_PASSWORD.txt` — share it only with the team.
* **Updating the published data (admin)**: open the site → Upload data → the new master workbook →
  Method & data → **Publish update** → enter the team password → `data.js` downloads. Replace
  `js/data.js` in `DJP_Dashboard_Netlify_Upload` and drag the folder to Netlify again.
  (Or with Python: `python build.py --publish PACK.json --password-file private-data/TEAM_PASSWORD.txt`.)
* **Name & theme**: the project is the **16-Point KPI Tracker**; its theme line is **Heroes in Action** (sidebar, banner, login, cards).
* **Layout (Nov 2026 redesign, presentation only)**: left sidebar with groups — Home · Overview (Business,
  Zone, ASM, SE, Month-wise) · Plans & Execution (Daily, Weekly, Monthly, Action tracking) · Dealer Analytics
  (Dealer focus, Drill-down) · Distribution & Productivity (16-KPI scorecard) · Sales & Performance (Trends) ·
  Reports & Downloads (Export centre) · Data Management (Upload & Publish, Data checks & Method). The site opens
  on Home; upload lives under Data Management. Files: `css/shell.css`, `js/shell.js`. The pages themselves and
  every calculation are unchanged (checked: identical output before/after). Previous version:
  `backup/src-before-redesign-2026-11-03/`.
* **Monthly plan tab**: reads the optional sheets “ASM wise <mon> target” and “RSE wise <mon> target”
  (Zone, code, name, Target, one column per date). Upload the workbook while it still holds the month
  that just ended: its Dashboard RSE / ASM and billing become “last month” — report card, what worked,
  learnings. Each person's 9:16 card, WhatsApp / email / zip of all cards or Outlook drafts; “Sent” is
  recorded per person in that browser. Learnings are kept when the new month's data is uploaded later.
* **WhatsApp**: every daily / weekly plan has a **WhatsApp card** — a 1080×1920 (9:16) PNG with the
  pace ring, status, 16-point score, four key numbers, KPI chips and the top actions, plus a short
  caption. Desktop: the card is copied and WhatsApp opens on the person's number — paste (Ctrl+V) and
  send. Phone: "Share image" opens the share sheet → WhatsApp.
* **Email**: per person (opens your mail app with subject and short plan; the card downloads to attach)
  and **Bulk send**: a zip of Outlook drafts (`.eml`, card attached, To: filled) — double-click, Send.
  Bulk WhatsApp: a zip of all cards + `_messages.txt` with captions and wa.me links.
* **Contacts**: add a sheet **Contacts** (Name, Role, Email, WhatsApp) to the master workbook —
  `private-data/Contacts_template.xlsx` is prefilled with all 73 SEs and ASMs. Nothing is sent
  automatically; WhatsApp does not allow automatic bulk sending from a web page.
* **Look**: brighter theme, zone colours (East teal, North blue, South purple, West orange), status bars
  on plan lists, coloured KPI strip.

---

# Phase 1 notes

An upgrade of the existing **16-Point SE & ASM Tracker** (`backup/SE_ASM_16_Point_Tracker.ORIGINAL.html`).
The original engine — dealer master, 16-KPI scoring, day-wise billing, dealer action list, WhatsApp text,
dump upload — is kept unchanged in `src/js/core.js`. New modules add Zone / ASM / RSE performance,
daily and weekly action plans for every ASM and RSE, action tracking, an export centre and a
Netlify-ready build with **no company data inside it**.

RSE = SE in the source data (the SE Evaluation workbook calls the block "RSE (SE)").

## Folder layout

```
src/                 source (plain HTML/CSS/JS — no framework, no build tools needed)
  index.html
  css/app.css        reference dashboard styles      css/extra.css   new module styles
  js/core.js         reference engine (data model, 16 KPIs, day-wise, dealer actions, dump parser)
  js/perf.js         volume vs plan, pace, weeks, trends, ASM/RSE/zone rows
  js/plans.js        rule-based daily & weekly action plans (ASM and RSE)
  js/track.js        action status / remarks store (this browser), backup & restore
  js/xlexport.js     real .xlsx writer (ExcelJS; SheetJS fallback)
  js/exports.js      export centre — every export, current view / all records
  js/views.js        screens: overview strip, zones, ASM, RSE, plans, trends, tracking, settings, data checks
  js/main.js         start-up: data pack loading, wiring
dist/                built site for Netlify (created by build.py — contains NO data)
local/               DJP_Dashboard_LOCAL.html — single file with the data pack embedded (private)
private-data/        reference-pack-YYYY-MM.json (private — do not publish)
backup/              the original reference dashboard, untouched
netlify.toml         Netlify settings + security headers (also copied to dist/_headers)
build.py             builds dist/ and the local file
```

## Daily use

1. Open the dashboard (Netlify link, or `local/DJP_Dashboard_LOCAL.html` on your own PC).
2. **Upload data** → your master workbook **SE Evaluation Dashboard - MMM-YY.xlsx** (one file — about
   10–60 seconds for 30 MB). It rebuilds everything and is remembered in that browser.
   (A daily *Dashboard Dump* .xlsb or a JSON data pack is still accepted.)
4. Set the **Reporting date** (data to) in the filter bar, and Zone / ASM / RSE if you want a subset.
5. **Daily action plan** → *Generate daily action plans* → review each ASM / RSE → *Download*.
6. **Weekly action plan** → pick the reporting week → *Generate weekly action plans* → *Download*.
7. Update status and remarks in the plan or in **Action tracking**.

Every screen has Excel buttons; **Export centre** lists all exports with *Current view* and *All records*.

## What the dashboard reads from the master workbook (`src/js/workbook.js`)

| Sheet | Used for |
|---|---|
| Dealer master | dealers, city/district/state, zone, ASM, RSE, category |
| Dealer_Vol1 | Active status and RSE used by the KPIs, Jul–Sep units, OD amount, open complaints, GSB, ISB. Dealers missing here are left out of KPI counts, as in the workbook |
| Billing | daily units, value, models, NPD and premium flags (current month) |
| Dealer_Val1 | value-growth and ASP-growth flags (`H_ValGrew` / `H_ASPGrew` for the month) |
| Dealer-MBD1 | model target per dealer |
| google rating, DPL - PLS, NPD SKU List | KPIs 12, 15, 16 and the NPD list |
| MTD DJP SUMMARY MONTH WISE | DJP planned (MTD plan) vs made visits and productive calls, ASM and RSE blocks of the month |
| Secondary + Index | sub-dealer billing points (KPI 3, per RSE) |
| KPI Config | current month, as-of date, SE / ASM roster |
| a sheet with "Plan" in its name (optional) | **dealer-wise volume plan** — columns `Dealer Code` and `Plan` |

The SE Evaluation workbook has **no dealer-wise volume plan**. Add a sheet named **Volume Plan**
(columns *Dealer Code*, *Plan*) to get volume targets, pace, day/week targets. Without it the plan
already loaded for the same month is kept (October is built in), otherwise targets show "No target".

Check against the workbook's own **KPI Calc** (Oct-26, data to 26-Oct): 51 RSEs × 14 KPIs =
714 target/achievement figures — **712 identical**; 2 differ by one unit (Shankhadeep Das NPD 0 vs 1;
Ajit Thakur models per dealer 7.154 vs 7.138), from the Billing NPD flag and model counting.

## Calculations (all traceable to the data)

| Measure | Definition |
|---|---|
| Target | Month volume plan: dealer-wise plan in the data pack, summed over the scope's dealers |
| Achievement | Net units billed month-to-date (Cycle_Billing) |
| Ach % | Achievement ÷ target. ASM and zone = Σ achievement ÷ Σ target (never an average of RSE %) |
| Vs pace | Achievement ÷ (target × working days gone ÷ working days in month). Working days exclude Sundays only |
| Daily target | Remaining gap ÷ working days left |
| Weekly target | Plan × working days in the week ÷ working days in the month (pro-rata) |
| Weeks | W1 1–7, W2 8–14, W3 15–21, W4 22–28, W5 29–month end (SE Evaluation workbook, KPI Config §5) |
| Status | On track ≥ 100 %, Watch ≥ 90 %, Behind ≥ 70 %, Critical below; No target if no plan (Settings) |
| Trend | Last two complete weeks: Improving / Declining beyond ±5 pts; Strong & consistent; Consistently low; Stable; Insufficient data |
| DJP visits | Planned vs made visits from the Journey Plan Update in the data pack (W1–W2 only) |
| 16-point score | Unchanged from the reference tracker (KPIs 1–10 at 10 %, capped at 120 %) |

Reconciliation run on the Oct-26 pack (data to 25-Oct): national = Σ zones = Σ ASMs = 1,25,180 units of
2,39,563 plan (identical to the reference engine). Σ RSEs = 1,13,150 — the difference is 1,252 dealers
with no RSE in the dealer master (shown under Method → Data checks).

## Action-plan rules

Rule based, no AI service. Each action states the gap, the evidence, who owns it, what to do, the
expected outcome, the deadline and the follow-up, plus a *basis*: **Observed in data**, **Cause needs
investigation** (gap visible, cause not in the data), or **Data limitation**. Dealer names come only
from the dealer master. Priority: Critical/Behind → High, Watch/No target → Medium, On track → Low.

* **RSE daily**: volume day target and open orders; billing points (named unbilled dealers); NPD; range
  (MBD); premium mix; overdue (snapshot); journey plan; a fall in the last 7 days.
* **ASM daily**: team volume with per-RSE day targets; RSEs behind pace (named, even when the team is on
  pace); team billing points; open orders and stock rejections; journey-plan gaps; open actions from
  earlier plans; recognition of RSEs on pace.
* **Weekly** (plan for the week after the reporting week): week result vs previous week, next-week
  target (remaining days if the week has already started), consistency, the biggest KPI gaps, a
  trend-specific action, carried-forward actions; ASMs also get coaching of named RSEs and decliners.
* **Weekly review**: what went well / not, ASMs and RSEs improved / declined, unresolved gaps,
  actions to continue — whole-week totals only, so one good day is not a trend.

Generating again never overwrites status, remarks or the agreed action text; a changed recommendation
is shown separately as *Latest recommendation*.

## Deploying on Netlify

Netlify hosts the dashboard only. **Company data is never uploaded to Netlify.**

```
python build.py
```

Then either:

* **Drag and drop**: Netlify → *Add new site* → *Deploy manually* → drop the `dist` folder.
  (`dist/_headers` carries the security headers.)
* **Git**: push this folder to a private repository (the `.gitignore` excludes private-data, local,
  backup and Excel files) → Netlify → *Import from Git* → publish directory `dist`, no build command.

Test locally first: open `dist/index.html` through any local web server (for example
`python -m http.server` in the `dist` folder, then http://localhost:8000).

The site needs internet access for fonts and the SheetJS / ExcelJS libraries (cdnjs).

### Monthly data pack

The pack is the reference tracker's data set (dealer master and mapping, month plan, MIS growth and
MBD targets, journey plan, OD and snapshot KPIs, NPD list). It changes when plans or mappings change —
normally monthly — and must be rebuilt for each new month. It was produced for October from the TBR
Oct-26 workbook and the SE Evaluation workbook; the same sources are needed for November.
Upload a dump from a month the pack does not cover and targets show "No target" (Data checks says so).

## Data & security (Phase 1)

* The built site contains no sales, dealer or employee data; `build.py` refuses to publish JSON or
  large files into `dist/`.
* Data files are read in the user's browser and stored only there (localStorage). Anyone who opens the
  site sees an empty dashboard until they load a data pack they already have.
* **Do not** upload `local/DJP_Dashboard_LOCAL.html` or anything in `private-data/` to Netlify or any
  public place — they contain the full data set.
* Action tracking lives in one browser. It is not shared between users or devices and is lost if the
  browser data is cleared — use Tracking → *Backup (.json)* / *Restore backup*.
* Headers: no indexing, no framing, strict content-security policy (scripts only from this site and
  cdnjs).

## Phase 2 — logins (planned, not built)

Roles: **Admin** (all zones, all plans, user management) and **four Zonal users** (own zone only:
its ASMs, their RSEs, plans and downloads).

Real access control must be enforced on a server — hiding parts of this page in JavaScript would not
protect data, so Phase 1 has no login screen. Recommended design:

1. Frontend stays on Netlify.
2. Authentication: Netlify Identity, Auth0, Azure AD / Microsoft Entra (company SSO) or Supabase Auth.
3. Data service with **row-level security by zone** (e.g. Supabase/Postgres or Azure SQL behind an
   API / Netlify Functions): tables for dealers, plans, billing facts, action records, users and roles.
4. The daily dump is uploaded once by an Admin to the backend (or loaded by a scheduled job); every user
   then reads only the rows their role allows.
5. Action tracking moves to the database (shared, audited, with who-changed-what).
6. Secrets (database keys) only in Netlify environment variables used by server functions — never in
   frontend code.

The frontend is already split so `track.js` (storage) and the data loading in `main.js` can be swapped
for API calls without touching the calculations or screens.

## Testing done (28-Oct-2026, Oct-26 pack, data to 25-Oct)

| Test | Result |
|---|---|
| Local build loads, no console errors | Pass |
| Netlify build starts empty (no data in bundle), loads the pack, survives reload | Pass |
| National / zone / ASM totals equal the reference engine (1,25,180 / 2,39,563) | Pass |
| ASM Ach % = Σ team ÷ Σ plan (e.g. Alok Kumar 58.3 %, not the 42.8 % average) | Pass |
| Zone → ASM / RSE tables → RSE profile → that RSE's daily plan (clicks) | Pass |
| Generate daily plans, all India: 79 plans (17 ASM + 62 RSE), 381 actions | Pass |
| Generate weekly plans: 79 plans, 328 actions | Pass |
| Status + remark kept after regenerating; persisted after reload | Pass |
| Partial-week warning shown only for weeks still in progress | Pass (after fix) |
| All 35 export variants produce .xlsx with expected sheets; header frozen, filters, date format | Pass |
| Exports follow filters (East: 20 RSEs vs 62 for all records) | Pass |
| Upload path: test CSV built from the pack's own billing to 20-Oct → 83,664 units, plans re-dated | Pass |
| Phone width (375 px): no horizontal scroll | Pass |
| Upload of a real Dashboard Dump (.xlsb) in this build | **Not tested** — no dump file available here; the parser is the reference's unchanged code |
| Netlify deployment itself | **Not done** — needs your Netlify account |

## Known limitations and business rules to confirm

1. Thresholds (100 / 90 / 70 %, ±5 pts) are dashboard defaults — set them to company policy in Settings.
2. Working days exclude Sundays only; there is no holiday calendar in the data.
3. Weekly targets are pro-rata by working days (the workbook's own weekly note uses equal weeks).
4. DJP / journey-plan data covers W1–W2 only and is not in the daily dump.
5. Monthly trend is month-to-date only — earlier months' billing is not in the pack.
6. Data checks on the Oct-26 pack: 1,252 dealers have no RSE in the master; 11 RSEs have dealers but
   no volume plan ("No target"); 22 RSEs have no journey-plan record; 12 dealers have net negative
   billing (returns). No duplicate codes, no dealers without an ASM, no RSE/ASM mapping conflicts.
7. "Overdue" uses today's date; OD amounts are from the 14-Sep-2026 snapshot.
8. CSV uploads: dates are now read as day-first (dd.mm.yyyy); the reference read them month-first.
9. Action tracking is per browser until Phase 2.
