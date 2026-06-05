#!/usr/bin/env node
/**
 * backfill-usage-logs.js — one-time backfill of dashboard dimension columns
 * on an existing usage_logs.db.
 *
 * Safe by design:
 *   - Additive only: ALTER TABLE ADD COLUMN (never drops/rewrites existing data).
 *   - Idempotent: re-running produces the same result.
 *   - --dry-run (default): reports what WOULD change, writes nothing.
 *   - --apply: performs the writes inside a single transaction.
 *
 * What it backfills:
 *   1. platform = 'web' for all existing rows (mobile app not launched yet).
 *   2. duration_sec for room_created / reserved_room_created rows, computed from
 *      meta.startTime / meta.endTime (endTime - startTime, in seconds).
 *   Province/region are NOT backfilled: historical rows have no service-unit
 *   hcode, so area can't be derived. New rows capture it going forward.
 *
 * Usage:
 *   node scripts/backfill-usage-logs.js <usage_logs.db> [--apply]
 */

const path = require('path');
const Database = require(path.join(__dirname, '../node_modules/better-sqlite3'));

const dbPath = process.argv[2];
const APPLY  = process.argv.includes('--apply');
if (!dbPath) { console.error('Usage: node backfill-usage-logs.js <usage_logs.db> [--apply]'); process.exit(1); }

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 1) Ensure columns exist (idempotent).
const cols = new Set(db.prepare('PRAGMA table_info(usage_logs)').all().map(c => c.name));
let columnsReady = true; // false in dry-run when a column is still missing
const ensure = (name, type) => {
  if (!cols.has(name)) {
    if (APPLY) { db.exec(`ALTER TABLE usage_logs ADD COLUMN ${name} ${type}`); cols.add(name); }
    else columnsReady = false;
    console.log(`${APPLY ? 'ADDED' : 'WOULD ADD'} column ${name} ${type}`);
  }
};
ensure('platform',     "TEXT DEFAULT 'web'");
ensure('unit_hcode',   'TEXT');
ensure('province',     'TEXT');
ensure('region',       'INTEGER');
ensure('duration_sec', 'INTEGER');

// 2) platform backfill (rows where platform is NULL/empty → 'web')
// In dry-run before the column exists, every row would be set → report total rows.
const platCount = cols.has('platform') && columnsReady
  ? db.prepare("SELECT COUNT(*) n FROM usage_logs WHERE platform IS NULL OR platform = ''").get().n
  : db.prepare("SELECT COUNT(*) n FROM usage_logs").get().n;
console.log(`platform: ${platCount} rows ${APPLY ? 'will be' : 'would be'} set to 'web'`);

// 3) duration backfill from meta for room-creation events lacking duration_sec.
// If duration_sec column doesn't exist yet (dry-run), all room-creation rows are candidates.
const candidates = columnsReady
  ? db.prepare(`
      SELECT id, meta FROM usage_logs
      WHERE event IN ('room_created','reserved_room_created')
        AND (duration_sec IS NULL)
        AND meta IS NOT NULL
    `).all()
  : db.prepare(`
      SELECT id, meta FROM usage_logs
      WHERE event IN ('room_created','reserved_room_created')
        AND meta IS NOT NULL
    `).all();

let durOk = 0, durSkip = 0;

const apply = db.transaction(() => {
  const durUpdate = db.prepare('UPDATE usage_logs SET duration_sec = ? WHERE id = ?');
  if (platCount) db.prepare("UPDATE usage_logs SET platform = 'web' WHERE platform IS NULL OR platform = ''").run();
  for (const row of candidates) {
    try {
      const m = JSON.parse(row.meta);
      if (!m.startTime || !m.endTime) { durSkip++; continue; }
      const sec = Math.round((new Date(m.endTime) - new Date(m.startTime)) / 1000);
      if (!Number.isFinite(sec) || sec < 0) { durSkip++; continue; }
      durUpdate.run(sec, row.id);
      durOk++;
    } catch (_) { durSkip++; }
  }
});

// Dry-run: just measure how many duration rows are computable.
if (!APPLY) {
  for (const row of candidates) {
    try {
      const m = JSON.parse(row.meta);
      if (!m.startTime || !m.endTime) { durSkip++; continue; }
      const sec = Math.round((new Date(m.endTime) - new Date(m.startTime)) / 1000);
      if (!Number.isFinite(sec) || sec < 0) { durSkip++; continue; }
      durOk++;
    } catch (_) { durSkip++; }
  }
  console.log(`duration_sec: ${durOk} rows computable, ${durSkip} skipped (of ${candidates.length} candidates)`);
  console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
  process.exit(0);
}

apply();
console.log(`duration_sec: updated ${durOk} rows, skipped ${durSkip} (of ${candidates.length})`);
console.log('\nAPPLIED. Backfill complete.');
