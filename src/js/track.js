'use strict';
/* ================= action tracking =================
   Phase 1 stores action records in this browser only (localStorage). They do not reach other users or
   devices — use Tracking → Backup / Restore to move them. A Phase 2 backend replaces this module.
   A record is created when a plan is generated. Regenerating never overwrites status, remarks or the
   originally agreed action text: a changed recommendation is kept separately as `latest`. */

const TRK_KEY = 'djp.track.v1', GEN_KEY = 'djp.gen.v1';
const STATUSES = ['Pending', 'In Progress', 'Completed', 'Blocked'];
let TRK = (() => { try { return JSON.parse(store.get(TRK_KEY) || '{}'); } catch (e) { return {}; } })();
let GEN = (() => { try { return JSON.parse(store.get(GEN_KEY) || '[]'); } catch (e) { return []; } })();
let TRK_IDX = null;

function trkSave() {
  TRK_IDX = null;
  const ok = store.set(TRK_KEY, JSON.stringify(TRK));
  store.set(GEN_KEY, JSON.stringify(GEN.slice(-300)));
  if (!ok) toast('Could not save action tracking in this browser (storage full or blocked). Export a backup.', 6000);
  return ok;
}
const trkId = (type, lvl, name, period, key) => [type, lvl, name, period, key].join('|');
function trkIndex() {
  if (TRK_IDX) return TRK_IDX;
  TRK_IDX = new Map();
  for (const r of Object.values(TRK)) { const k = [r.type, r.level, r.name, r.period].join('|'); (TRK_IDX.get(k) || TRK_IDX.set(k, []).get(k)).push(r); }
  return TRK_IDX;
}
const trkFor = (type, lvl, name, period) => trkIndex().get([type, lvl, name, period].join('|')) || [];

/* commit generated plans → records; returns counts */
function commitPlans(plans, type, period, scopeLabel) {
  const now = new Date().toISOString(); let added = 0, kept = 0, items = 0;
  for (const p of plans) for (const it of p.items) {
    items++;
    const id = trkId(type, p.level, p.name, period, it.key), ex = TRK[id];
    if (ex) {
      kept++;
      if (ex.text !== it.action) ex.latest = it.action; else delete ex.latest;
      ex.lastGenerated = now;
    } else {
      TRK[id] = { id, type, level: p.level, name: p.name, asm: p.asm, zone: p.zone, period, periodLabel: p.periodLabel, periodEnd: p.periodEnd, key: it.key,
        priority: it.priority, issue: it.issue, evidence: it.evidence, text: it.action, outcome: it.outcome, owner: it.owner,
        due: it.dueISO, deadline: it.deadline, follow: it.follow, basis: it.basis,
        status: 'Pending', remarks: '', confirmed: false, created: now, lastGenerated: now, updated: null };
      added++;
    }
  }
  GEN.push({ type, period, scope: scopeLabel, at: now, plans: plans.length, items, added, kept });
  trkSave();
  return { added, kept, items };
}
function trkUpdate(id, patch) {
  if (!TRK[id]) return;
  Object.assign(TRK[id], patch, { updated: new Date().toISOString() });
  trkSave();
}
/* plan status for one person and period */
function planStatus(type, lvl, name, period) {
  const recs = trkFor(type, lvl, name, period);
  if (!recs.length) return { k: 'nd', l: 'Not generated', n: 0, done: 0 };
  const c = s => recs.filter(r => r.status === s).length, n = recs.length, done = c('Completed');
  if (c('Blocked')) return { k: 'crit', l: `Blocked · ${done}/${n} done`, n, done };
  if (done === n) return { k: 'good', l: 'Completed', n, done };
  if (done || c('In Progress')) return { k: 'warn', l: `In progress · ${done}/${n}`, n, done };
  return { k: 'serious', l: `Pending · 0/${n}`, n, done };
}
const todayISO = () => isoD(new Date());
const isOverdue = r => r.status !== 'Completed' && r.due && r.due < todayISO();

/* open actions about a set of people from plans whose period ended before `beforeISO` (yyyy-mm-dd) */
function carryOver(names, beforeISO) {
  const set = new Set(names);
  return Object.values(TRK).filter(r => set.has(r.name) && r.status !== 'Completed' && (r.periodEnd || '') < beforeISO);
}

function trkBackup() {
  const blob = new Blob([JSON.stringify({ kind: 'djp-action-tracking', exported: new Date().toISOString(), records: TRK, log: GEN }, null, 1)], { type: 'application/json' });
  saveBlob(blob, `DJP_action_tracking_backup_${todayISO()}.json`);
}
async function trkRestore(file) {
  const j = JSON.parse(await file.text());
  if (!j || j.kind !== 'djp-action-tracking' || typeof j.records !== 'object') throw new Error('This is not an action-tracking backup file.');
  let added = 0, newer = 0;
  for (const [id, r] of Object.entries(j.records)) {
    const ex = TRK[id];
    if (!ex) { TRK[id] = r; added++; }
    else if ((r.updated || '') > (ex.updated || '')) { TRK[id] = r; newer++; }
  }
  GEN = GEN.concat(j.log || []);
  trkSave();
  return { added, newer };
}
