/**
 * SQLite storage backend — current default, uses better-sqlite3.
 * Data persisted to DATA_DIR/*.db files.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { areaOf } = require('../data/area');

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

// ── Room Storage (rooms.db) — persistent, no expiry ───────────────────────────
const _roomDb = new Database(path.join(DATA_DIR, 'rooms.db'));
_roomDb.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id    TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
// Migration: drop expires_at if it exists (old schema)
try { _roomDb.exec('ALTER TABLE rooms DROP COLUMN expires_at'); } catch (_) {}

const _roomGet  = _roomDb.prepare('SELECT value FROM rooms WHERE id = ?');
const _roomSet  = _roomDb.prepare('INSERT OR REPLACE INTO rooms (id, value) VALUES (?, ?)');
const _roomDel  = _roomDb.prepare('DELETE FROM rooms WHERE id = ?');
const _roomKeys = _roomDb.prepare('SELECT id FROM rooms');

// Filter rooms by owner directly in SQL (JSON1) so we never load the whole
// table (can be 100k+ reserved rooms) into JS. Includes rooms the user owns OR
// has joined as a provider. Most-recent first, capped by limit.
const _roomByOwner = _roomDb.prepare(`
  SELECT value FROM rooms
  WHERE json_extract(value, '$.ownerId') = ?
     OR EXISTS (
       SELECT 1 FROM json_each(json_extract(value, '$.joinedProviders'))
       WHERE json_extract(json_each.value, '$.userId') = ?
     )
  ORDER BY json_extract(value, '$.createdAt') DESC
  LIMIT ?
`);

const roomStore = {
  get(id) {
    const row = _roomGet.get(id);
    if (!row) return undefined;
    return JSON.parse(row.value);
  },
  set(id, value, _ttlIgnored) {
    _roomSet.run(id, JSON.stringify(value));
  },
  del(id) { _roomDel.run(id); },
  keys() { return _roomKeys.all().map(r => r.id); },
  byOwner(ownerId, limit = 200) {
    return _roomByOwner.all(ownerId, ownerId, Math.min(limit, 1000)).map(r => JSON.parse(r.value));
  },
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

// ── Migration: add dashboard dimension columns (additive, idempotent) ─────────
// Required for TOR 4.12.x: platform (mobile/web), service unit + area
// (hcode→province→health region), and conversation duration.
(function migrateUsageLogs() {
  const existing = new Set(_logDb.prepare('PRAGMA table_info(usage_logs)').all().map(c => c.name));
  const addCol = (name, type) => {
    if (!existing.has(name)) {
      _logDb.exec(`ALTER TABLE usage_logs ADD COLUMN ${name} ${type}`);
      console.log(`[store:sqlite] migrated usage_logs: +${name}`);
    }
  };
  addCol('platform',     "TEXT DEFAULT 'web'"); // mobile not launched yet → all web
  addCol('unit_hcode',   'TEXT');
  addCol('province',     'TEXT');
  addCol('region',       'INTEGER');
  addCol('duration_sec', 'INTEGER');
  _logDb.exec('CREATE INDEX IF NOT EXISTS idx_logs_region   ON usage_logs(region)');
  _logDb.exec('CREATE INDEX IF NOT EXISTS idx_logs_province ON usage_logs(province)');
  _logDb.exec('CREATE INDEX IF NOT EXISTS idx_logs_platform ON usage_logs(platform)');
})();

const _logInsert = _logDb.prepare(`
  INSERT INTO usage_logs (ts, event, room_id, room_type, room_name, doctor_id, doctor_name, patient_name, patient_cid, meta, platform, unit_hcode, province, region, duration_sec)
  VALUES (datetime(?,'localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const logStore = {
  insert(event, data = {}) {
    try {
      // Derive area (province + health region) from the service unit hcode.
      const hcode = data.unitHcode || null;
      const area  = hcode ? areaOf(hcode) : null;
      _logInsert.run(
        new Date().toISOString(), event,
        data.roomId || null, data.roomType || null, data.roomName || null,
        data.doctorId || null, data.doctorName || null,
        data.patientName || null, data.patientCid || null,
        data.meta ? JSON.stringify(data.meta) : null,
        data.platform || 'web',
        hcode,
        area ? area.province : (data.province || null),
        area ? area.region   : (data.region   ?? null),
        data.durationSec ?? null
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

  // PII-safe: number of distinct doctors active per period + their aggregate
  // activity counts — but NO doctor identities (no id/name). The dashboard shows
  // "how many doctors / how active", not who.
  byDoctor(months = 3) {
    const row = _logDb.prepare(`
      SELECT COUNT(DISTINCT doctor_id) as doctors,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END) as rooms,
             SUM(CASE WHEN event = 'patient_admitted' THEN 1 ELSE 0 END) as admitted,
             SUM(CASE WHEN event = 'invite_generated' THEN 1 ELSE 0 END) as invites
      FROM usage_logs
      WHERE doctor_id IS NOT NULL AND ts >= datetime('now', '-' || ? || ' months', 'localtime')
    `).get(Math.min(months, 24));
    return row || { doctors: 0, rooms: 0, admitted: 0, invites: 0 };
  },

  // PII-safe recent activity: event type + time + masked room ref + area only.
  // No doctor/patient names or CIDs (dashboard shows counts, not identities).
  recent(limit = 50) {
    const rows = _logDb.prepare(`
      SELECT id, ts, event, room_id, room_type,
             platform, province, region, duration_sec
      FROM usage_logs ORDER BY id DESC LIMIT ?
    `).all(Math.min(limit, 500));
    return rows.map(r => ({
      id: r.id,
      ts: r.ts,
      event: r.event,
      room_ref: r.room_id ? String(r.room_id).slice(0, 6) : '—',
      room_type: r.room_type,
      platform: r.platform,
      province: r.province,
      region: r.region,
      duration_sec: r.duration_sec,
    }));
  },

  // ── Dashboard queries (TOR 4.12.x) ──────────────────────────────────────────
  // Shared WHERE builder: optional [from,to] date range (YYYY-MM-DD) and an
  // optional hourFrom/hourTo "ช่วงเวลาในวัน" window (0-23). Returns { clause, params }.
  _range({ from, to, hourFrom, hourTo } = {}) {
    const where = [];
    const params = [];
    if (from) { where.push("date(ts) >= date(?)"); params.push(from); }
    if (to)   { where.push("date(ts) <= date(?)"); params.push(to); }
    if (hourFrom != null && hourTo != null) {
      // CAST hour to int; supports normal (8-17) windows.
      where.push("CAST(strftime('%H', ts) AS INTEGER) BETWEEN ? AND ?");
      params.push(parseInt(hourFrom, 10), parseInt(hourTo, 10));
    }
    return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
  },

  // 4.12.x.1 — usage per day, within an optional date range + time-of-day window
  byDay(opts = {}) {
    const { clause, params } = this._range(opts);
    return _logDb.prepare(`
      SELECT date(ts) as day,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END) as rooms,
             SUM(CASE WHEN event = 'patient_joined_queue' THEN 1 ELSE 0 END) as patients,
             SUM(CASE WHEN event = 'patient_admitted' THEN 1 ELSE 0 END) as admitted
      FROM usage_logs ${clause}
      GROUP BY date(ts) ORDER BY day
    `).all(...params);
  },

  // 4.12.x.1 — usage by hour of day (the "ช่วงวัน" distribution)
  byHour(opts = {}) {
    const { clause, params } = this._range(opts);
    return _logDb.prepare(`
      SELECT CAST(strftime('%H', ts) AS INTEGER) as hour,
             COUNT(*) as total,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END) as rooms
      FROM usage_logs ${clause}
      GROUP BY hour ORDER BY hour
    `).all(...params);
  },

  // 4.12.x.2 — usage by health region (เขตสุขภาพ)
  byRegion(opts = {}) {
    const { clause, params } = this._range(opts);
    return _logDb.prepare(`
      SELECT region,
             COUNT(*) as total,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END) as rooms,
             SUM(CASE WHEN event = 'patient_admitted' THEN 1 ELSE 0 END) as admitted
      FROM usage_logs ${clause}
      GROUP BY region ORDER BY (region IS NULL), region
    `).all(...params);
  },

  // 4.12.x.2 — usage by province (จังหวัด), optionally within one region
  byProvince(opts = {}) {
    const { clause, params } = this._range(opts);
    const regionFilter = opts.region != null
      ? (clause ? ' AND region = ?' : 'WHERE region = ?')
      : '';
    const p = [...params];
    if (opts.region != null) p.push(parseInt(opts.region, 10));
    return _logDb.prepare(`
      SELECT province, region,
             COUNT(*) as total,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END) as rooms,
             SUM(CASE WHEN event = 'patient_admitted' THEN 1 ELSE 0 END) as admitted
      FROM usage_logs ${clause}${regionFilter}
      GROUP BY province ORDER BY total DESC
    `).all(...p);
  },

  // 4.12.x.3 — usage split by platform (mobile vs web)
  byPlatform(opts = {}) {
    const { clause, params } = this._range(opts);
    return _logDb.prepare(`
      SELECT COALESCE(platform,'web') as platform, COUNT(*) as total,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END) as rooms
      FROM usage_logs ${clause}
      GROUP BY COALESCE(platform,'web') ORDER BY total DESC
    `).all(...params);
  },

  // 4.12.x.4 / 4.12.2.5 — service units called, with conversation start/end span.
  // limit param drives "top N" (5 by default for 4.12.2.5).
  byUnit(opts = {}) {
    const { clause, params } = this._range(opts);
    const limit = Math.min(opts.limit || 100, 500);
    return _logDb.prepare(`
      SELECT unit_hcode, province, region,
             COUNT(*) as total,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END) as rooms,
             MIN(ts) as first_used, MAX(ts) as last_used,
             SUM(COALESCE(duration_sec,0)) as total_duration_sec
      FROM usage_logs ${clause}${clause ? ' AND' : 'WHERE'} unit_hcode IS NOT NULL
      GROUP BY unit_hcode ORDER BY total DESC LIMIT ?
    `).all(...params, limit);
  },

  // 4.12.2.6 — top N rooms by conversation duration (longest first).
  // PII-safe: returns NO room name / doctor name — only an opaque room ref,
  // type, area (province/region) and duration.
  longestRooms(opts = {}) {
    const { clause, params } = this._range(opts);
    const limit = Math.min(opts.limit || 5, 100);
    const rows = _logDb.prepare(`
      SELECT room_id, room_type, province, region,
             MAX(duration_sec) as duration_sec,
             MIN(ts) as created_at
      FROM usage_logs ${clause}${clause ? ' AND' : 'WHERE'} duration_sec IS NOT NULL
      GROUP BY room_id ORDER BY duration_sec DESC LIMIT ?
    `).all(...params, limit);
    // Mask the room id to a short non-identifying ref (room ids are random
    // hashes, but we still avoid exposing the full join key).
    return rows.map(r => ({
      room_ref: r.room_id ? String(r.room_id).slice(0, 6) : '—',
      room_type: r.room_type,
      province: r.province,
      region: r.region,
      duration_sec: r.duration_sec,
      created_at: r.created_at,
    }));
  },
};

// ── Init (no-op for SQLite, tables already created above) ──────────────────────
async function init() { console.log('[store:sqlite] ready'); }


// ── Vital Signs Storage (rooms.db — new table) ────────────────────────────────
// TOR 4.10.5: น้ำหนัก ส่วนสูง อุณหภูมิ SpO2 BP RR Pulse น้ำตาล + NST
// PII: ผูกด้วย patient_key (queue-key random) ไม่เก็บ CID ตรง
_roomDb.exec(`
  CREATE TABLE IF NOT EXISTS vitals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id      TEXT,
    patient_key  TEXT,
    device_id    TEXT,
    device_type  TEXT NOT NULL,
    metric       TEXT NOT NULL,
    value        TEXT NOT NULL,
    unit         TEXT,
    source       TEXT NOT NULL DEFAULT 'manual',
    organization TEXT,
    recorded_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_vitals_room     ON vitals(room_id);
  CREATE INDEX IF NOT EXISTS idx_vitals_patient  ON vitals(patient_key);
  CREATE INDEX IF NOT EXISTS idx_vitals_recorded ON vitals(recorded_at);
`);

const _vitalInsert = _roomDb.prepare(
  `INSERT INTO vitals (room_id, patient_key, device_id, device_type, metric, value, unit, source, organization, recorded_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const _vitalByRoom    = _roomDb.prepare('SELECT * FROM vitals WHERE room_id = ? ORDER BY recorded_at DESC LIMIT 500');
const _vitalByPatient = _roomDb.prepare('SELECT * FROM vitals WHERE patient_key = ? ORDER BY recorded_at DESC LIMIT 200');
const _vitalLatest    = _roomDb.prepare(
  `SELECT v.* FROM vitals v
   INNER JOIN (SELECT metric, MAX(recorded_at) as maxts FROM vitals WHERE room_id = ? GROUP BY metric) m
     ON v.metric = m.metric AND v.recorded_at = m.maxts AND v.room_id = ?
   ORDER BY v.metric`
);

const vitalStore = {
  insert({ roomId, patientKey, deviceId, deviceType, metric, value, unit, source, organization, recordedAt }) {
    _vitalInsert.run(
      roomId || null, patientKey || null, deviceId || null,
      deviceType || 'manual', metric, String(value),
      unit || null, source || 'manual', organization || null,
      recordedAt || new Date().toISOString()
    );
  },
  insertBatch(records) {
    _roomDb.transaction(() => { for (const r of records) vitalStore.insert(r); })();
  },
  byRoom(roomId)        { return _vitalByRoom.all(roomId); },
  byPatient(patientKey) { return _vitalByPatient.all(patientKey); },
  latestByRoom(roomId)  { return _vitalLatest.all(roomId, roomId); },
};

module.exports = { tokenStorage, roomStore, profileStore, logStore, vitalStore, init };
