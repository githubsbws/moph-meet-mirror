const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ── Disk-backed token store using better-sqlite3 ──────────────────────────────
// Survives process restarts. TTL enforced on read (lazy expiry).

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'sessions.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_expires ON sessions(expires_at);
`);

// Purge expired rows on startup, then every 5 minutes
const purge = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
purge.run(Date.now());
setInterval(() => purge.run(Date.now()), 5 * 60 * 1000).unref();

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const stmtGet = db.prepare('SELECT value, expires_at FROM sessions WHERE key = ?');
const stmtSet = db.prepare('INSERT OR REPLACE INTO sessions (key, value, expires_at) VALUES (?, ?, ?)');
const stmtDel = db.prepare('DELETE FROM sessions WHERE key = ?');

const tokenStorage = {
  /** @param {string} key @param {any} value @param {number} [ttlSeconds] */
  set(key, value, ttlSeconds) {
    const ttl = (ttlSeconds ?? DEFAULT_TTL_MS / 1000) * 1000;
    stmtSet.run(key, JSON.stringify(value), Date.now() + ttl);
    console.log(`[auth] session saved to disk for "${value?.username || key}"`);
  },

  /** @param {string} key @returns {any|undefined} */
  get(key) {
    const row = stmtGet.get(key);
    if (!row) return undefined;
    if (row.expires_at < Date.now()) {
      stmtDel.run(key);
      return undefined;
    }
    return JSON.parse(row.value);
  },

  /** @param {string} key @returns {boolean} */
  has(key) {
    return this.get(key) !== undefined;
  },

  /** @param {string} key */
  del(key) {
    stmtDel.run(key);
  },
};

module.exports = { tokenStorage };
