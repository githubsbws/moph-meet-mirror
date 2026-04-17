/**
 * SQLite storage backend — current default, uses better-sqlite3.
 * Data persisted to DATA_DIR/*.db files.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Token Storage (sessions.db) ────────────────────────────────────────────────
const _sessDb = new Database(path.join(DATA_DIR, 'sessions.db'));
_sessDb.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_expires ON sessions(expires_at);
`);

const _sessPurge = _sessDb.prepare('DELETE FROM sessions WHERE expires_at < ?');
_sessPurge.run(Date.now());
setInterval(() => _sessPurge.run(Date.now()), 5 * 60 * 1000).unref();

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const _sessGet = _sessDb.prepare('SELECT value, expires_at FROM sessions WHERE key = ?');
const _sessSet = _sessDb.prepare('INSERT OR REPLACE INTO sessions (key, value, expires_at) VALUES (?, ?, ?)');
const _sessDel = _sessDb.prepare('DELETE FROM sessions WHERE key = ?');

const tokenStorage = {
  set(key, value, ttlSeconds) {
    const ttl = (ttlSeconds ?? DEFAULT_TTL_MS / 1000) * 1000;
    _sessSet.run(key, JSON.stringify(value), Date.now() + ttl);
    console.log(`[auth] session saved to disk for "${value?.username || key}"`);
  },
  get(key) {
    const row = _sessGet.get(key);
    if (!row) return undefined;
    if (row.expires_at < Date.now()) { _sessDel.run(key); return undefined; }
    return JSON.parse(row.value);
  },
  has(key) { return tokenStorage.get(key) !== undefined; },
  del(key) { _sessDel.run(key); },
};

// ── Room Storage (rooms.db) ────────────────────────────────────────────────────
const _roomDb = new Database(path.join(DATA_DIR, 'rooms.db'));
_roomDb.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);
const _purgeRooms = _roomDb.prepare('DELETE FROM rooms WHERE expires_at < ?');
_purgeRooms.run(Date.now());
setInterval(() => _purgeRooms.run(Date.now()), 10 * 60 * 1000).unref();

const _roomGet  = _roomDb.prepare('SELECT value, expires_at FROM rooms WHERE id = ?');
const _roomSet  = _roomDb.prepare('INSERT OR REPLACE INTO rooms (id, value, expires_at) VALUES (?, ?, ?)');
const _roomDel  = _roomDb.prepare('DELETE FROM rooms WHERE id = ?');
const _roomKeys = _roomDb.prepare('SELECT id FROM rooms WHERE expires_at > ?');

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const roomStore = {
  get(id) {
    const row = _roomGet.get(id);
    if (!row) return undefined;
    if (row.expires_at < Date.now()) { _roomDel.run(id); return undefined; }
    return JSON.parse(row.value);
  },
  set(id, value, ttlSeconds) {
    const exp = Date.now() + (ttlSeconds ? ttlSeconds * 1000 : ROOM_TTL_MS);
    _roomSet.run(id, JSON.stringify(value), exp);
  },
  del(id) { _roomDel.run(id); },
  keys() { return _roomKeys.all(Date.now()).map(r => r.id); },
};

// ── Profile Storage (user_profiles.db) ─────────────────────────────────────────
const _profileDb = new Database(path.join(DATA_DIR, 'user_profiles.db'));
_profileDb.pragma('journal_mode = WAL');
_profileDb.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    username      TEXT PRIMARY KEY,
    hcode5        TEXT DEFAULT '',
    hcode9        TEXT DEFAULT '',
    clinic_code   TEXT DEFAULT '',
    date_of_birth TEXT DEFAULT '',
    gender        TEXT DEFAULT '',
    updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);
const _profileGet    = _profileDb.prepare('SELECT * FROM user_profiles WHERE username = ?');
const _profileUpsert = _profileDb.prepare(`
  INSERT INTO user_profiles (username, hcode5, hcode9, clinic_code, date_of_birth, gender, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
  ON CONFLICT(username) DO UPDATE SET
    hcode5        = excluded.hcode5,
    hcode9        = excluded.hcode9,
    clinic_code   = excluded.clinic_code,
    date_of_birth = excluded.date_of_birth,
    gender        = excluded.gender,
    updated_at    = datetime('now','localtime')
`);

const profileStore = {
  get(username) {
    const row = _profileGet.get(username);
    if (!row) return {};
    return { hcode5: row.hcode5, hcode9: row.hcode9, clinicCode: row.clinic_code, dateOfBirth: row.date_of_birth, gender: row.gender };
  },
  upsert(username, { hcode5, hcode9, clinicCode, dateOfBirth, gender }) {
    _profileUpsert.run(
      username,
      (hcode5 || '').trim().slice(0, 5),
      (hcode9 || '').trim().slice(0, 9),
      (clinicCode || '').trim().slice(0, 5),
      (dateOfBirth || '').trim().slice(0, 10),
      (gender || '').trim().slice(0, 10)
    );
  },
};

// ── Usage Log Storage (usage_logs.db) ──────────────────────────────────────────
const _logDb = new Database(path.join(DATA_DIR, 'usage_logs.db'));
_logDb.pragma('journal_mode = WAL');
_logDb.exec(`
  CREATE TABLE IF NOT EXISTS usage_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    event        TEXT    NOT NULL,
    room_id      TEXT,
    room_type    TEXT,
    room_name    TEXT,
    doctor_id    TEXT,
    doctor_name  TEXT,
    patient_name TEXT,
    patient_cid  TEXT,
    meta         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_logs_ts     ON usage_logs(ts);
  CREATE INDEX IF NOT EXISTS idx_logs_doctor ON usage_logs(doctor_id);
  CREATE INDEX IF NOT EXISTS idx_logs_event  ON usage_logs(event);
`);

const _logInsert = _logDb.prepare(`
  INSERT INTO usage_logs (ts, event, room_id, room_type, room_name, doctor_id, doctor_name, patient_name, patient_cid, meta)
  VALUES (datetime(?,'localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const logStore = {
  insert(event, data = {}) {
    try {
      _logInsert.run(
        new Date().toISOString(), event,
        data.roomId || null, data.roomType || null, data.roomName || null,
        data.doctorId || null, data.doctorName || null,
        data.patientName || null, data.patientCid || null,
        data.meta ? JSON.stringify(data.meta) : null
      );
    } catch (e) { console.error('[logStore:sqlite]', e.message); }
  },

  summary() {
    return {
      total:     _logDb.prepare('SELECT COUNT(*) as c FROM usage_logs').get().c,
      rooms:     _logDb.prepare("SELECT COUNT(*) as c FROM usage_logs WHERE event IN ('room_created','reserved_room_created')").get().c,
      patients:  _logDb.prepare("SELECT COUNT(*) as c FROM usage_logs WHERE event = 'patient_joined_queue'").get().c,
      admitted:  _logDb.prepare("SELECT COUNT(*) as c FROM usage_logs WHERE event = 'patient_admitted'").get().c,
      doctors:   _logDb.prepare("SELECT COUNT(DISTINCT doctor_id) as c FROM usage_logs WHERE doctor_id IS NOT NULL").get().c,
      today:     _logDb.prepare("SELECT COUNT(*) as c FROM usage_logs WHERE date(ts) = date('now','localtime')").get().c,
      thisMonth: _logDb.prepare("SELECT COUNT(*) as c FROM usage_logs WHERE strftime('%Y-%m', ts) = strftime('%Y-%m', 'now','localtime')").get().c,
    };
  },

  daily(days = 30) {
    return _logDb.prepare(`
      SELECT date(ts) as day,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END) as rooms,
             SUM(CASE WHEN event = 'patient_joined_queue' THEN 1 ELSE 0 END) as patients,
             SUM(CASE WHEN event = 'patient_admitted' THEN 1 ELSE 0 END) as admitted
      FROM usage_logs
      WHERE ts >= datetime('now', '-' || ? || ' days', 'localtime')
      GROUP BY date(ts) ORDER BY day
    `).all(Math.min(days, 365));
  },

  monthly(months = 12) {
    return _logDb.prepare(`
      SELECT strftime('%Y-%m', ts) as month,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END) as rooms,
             SUM(CASE WHEN event = 'patient_joined_queue' THEN 1 ELSE 0 END) as patients,
             SUM(CASE WHEN event = 'patient_admitted' THEN 1 ELSE 0 END) as admitted,
             COUNT(DISTINCT doctor_id) as doctors
      FROM usage_logs
      WHERE ts >= datetime('now', '-' || ? || ' months', 'localtime')
      GROUP BY strftime('%Y-%m', ts) ORDER BY month
    `).all(Math.min(months, 60));
  },

  byDoctor(months = 3) {
    return _logDb.prepare(`
      SELECT doctor_id, doctor_name,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END) as rooms,
             SUM(CASE WHEN event = 'patient_admitted' THEN 1 ELSE 0 END) as admitted,
             SUM(CASE WHEN event = 'invite_generated' THEN 1 ELSE 0 END) as invites,
             COUNT(*) as total_events,
             MIN(ts) as first_seen, MAX(ts) as last_seen
      FROM usage_logs
      WHERE doctor_id IS NOT NULL AND ts >= datetime('now', '-' || ? || ' months', 'localtime')
      GROUP BY doctor_id ORDER BY total_events DESC
    `).all(Math.min(months, 24));
  },

  recent(limit = 50) {
    return _logDb.prepare(`
      SELECT id, ts, event, room_id, room_type, room_name,
             doctor_id, doctor_name, patient_name, patient_cid
      FROM usage_logs ORDER BY id DESC LIMIT ?
    `).all(Math.min(limit, 500));
  },
};

// ── Init (no-op for SQLite, tables already created above) ──────────────────────
async function init() { console.log('[store:sqlite] ready'); }

module.exports = { tokenStorage, roomStore, profileStore, logStore, init };
