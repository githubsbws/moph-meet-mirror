/**
 * PostgreSQL storage backend — uses 'pg' Pool.
 *
 * Required env vars:
 *   PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE
 *   — OR —
 *   DATABASE_URL=postgres://user:pass@host:port/db
 */

const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false }
    : {
        host:     process.env.PG_HOST     || 'localhost',
        port:     parseInt(process.env.PG_PORT || '5432'),
        user:     process.env.PG_USER     || 'postgres',
        password: process.env.PG_PASSWORD || '',
        database: process.env.PG_DATABASE || 'moph_meet',
        ssl:      process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
      }
);

// ── DDL — run once on init ─────────────────────────────────────────────────────
const DDL = `
  CREATE TABLE IF NOT EXISTS sessions (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    expires_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sess_exp ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS rooms (
    id    TEXT PRIMARY KEY,
    value JSONB NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    username      TEXT PRIMARY KEY,
    hcode5        TEXT DEFAULT '',
    hcode9        TEXT DEFAULT '',
    clinic_code   TEXT DEFAULT '',
    date_of_birth TEXT DEFAULT '',
    gender        TEXT DEFAULT '',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS telemed_consents (
    username TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    decision TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS telemed_consent_events (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    version TEXT NOT NULL,
    decision TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS providers (
    provider_id  TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'staff',
    hcode        TEXT NOT NULL DEFAULT '',
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_providers_hcode_role
    ON providers(hcode, role, active);

  CREATE TABLE IF NOT EXISTS holiday_years (
    year      INTEGER PRIMARY KEY,
    holidays  JSONB NOT NULL,
    source    TEXT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id           SERIAL PRIMARY KEY,
    ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event        TEXT NOT NULL,
    room_id      TEXT,
    room_type    TEXT,
    room_name    TEXT,
    doctor_id    TEXT,
    doctor_name  TEXT,
    patient_name TEXT,
    patient_cid  TEXT,
    meta         JSONB,
    unit_hcode  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_logs_ts     ON usage_logs(ts);
  CREATE INDEX IF NOT EXISTS idx_logs_doctor ON usage_logs(doctor_id);
  CREATE INDEX IF NOT EXISTS idx_logs_event  ON usage_logs(event);
  ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS unit_hcode TEXT;
  CREATE INDEX IF NOT EXISTS idx_logs_unit_hcode ON usage_logs(unit_hcode);
`;

// ── Token Storage ──────────────────────────────────────────────────────────────
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const tokenStorage = {
  async set(key, value, ttlSeconds) {
    const exp = Date.now() + (ttlSeconds ? ttlSeconds * 1000 : DEFAULT_TTL_MS);
    await pool.query(
      `INSERT INTO sessions (key, value, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = $3`,
      [key, JSON.stringify(value), exp]
    );
    console.log(`[auth] session saved for "${value?.username || key}"`);
  },
  async get(key) {
    const { rows } = await pool.query('SELECT value, expires_at FROM sessions WHERE key = $1', [key]);
    if (!rows.length) return undefined;
    if (rows[0].expires_at < Date.now()) { await pool.query('DELETE FROM sessions WHERE key = $1', [key]); return undefined; }
    return typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
  },
  async has(key) { return (await tokenStorage.get(key)) !== undefined; },
  async del(key) { await pool.query('DELETE FROM sessions WHERE key = $1', [key]); },
};

// ── Room Storage ───────────────────────────────────────────────────────────────
const roomStore = {
  async get(id) {
    const { rows } = await pool.query('SELECT value FROM rooms WHERE id = $1', [id]);
    if (!rows.length) return undefined;
    return typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
  },
  async set(id, value, _ttlIgnored) {
    await pool.query(
      `INSERT INTO rooms (id, value) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET value = $2`,
      [id, JSON.stringify(value)]
    );
  },
  async del(id) { await pool.query('DELETE FROM rooms WHERE id = $1', [id]); },
  async keys() {
    const { rows } = await pool.query('SELECT id FROM rooms');
    return rows.map(r => r.id);
  },
};

// ── Profile Storage ────────────────────────────────────────────────────────────
const profileStore = {
  async get(username) {
    const { rows } = await pool.query('SELECT * FROM user_profiles WHERE username = $1', [username]);
    if (!rows.length) return {};
    const r = rows[0];
    return { hcode5: r.hcode5, hcode9: r.hcode9, clinicCode: r.clinic_code, dateOfBirth: r.date_of_birth, gender: r.gender };
  },
  async upsert(username, { hcode5, hcode9, clinicCode, dateOfBirth, gender }) {
    await pool.query(
      `INSERT INTO user_profiles (username, hcode5, hcode9, clinic_code, date_of_birth, gender, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, NOW())
       ON CONFLICT (username) DO UPDATE SET
         hcode5 = $2, hcode9 = $3, clinic_code = $4, date_of_birth = $5, gender = $6, updated_at = NOW()`,
      [username, (hcode5||'').trim().slice(0,5), (hcode9||'').trim().slice(0,9),
       (clinicCode||'').trim().slice(0,5), (dateOfBirth||'').trim().slice(0,10), (gender||'').trim().slice(0,10)]
    );
  },
};

const consentStore = {
  async get(username) {
    const { rows } = await pool.query('SELECT version, decision, recorded_at FROM telemed_consents WHERE username = $1', [username]);
    if (!rows.length) return {};
    return { version: rows[0].version, decision: rows[0].decision, recordedAt: rows[0].recorded_at };
  },
  async record(username, { version, decision }) {
    const recordedAt = new Date().toISOString();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO telemed_consents (username, version, decision, recorded_at) VALUES ($1,$2,$3,$4)
        ON CONFLICT (username) DO UPDATE SET version = EXCLUDED.version, decision = EXCLUDED.decision, recorded_at = EXCLUDED.recorded_at`, [username, version, decision, recordedAt]);
      await client.query('INSERT INTO telemed_consent_events (username, version, decision, recorded_at) VALUES ($1,$2,$3,$4)', [username, version, decision, recordedAt]);
      await client.query('COMMIT');
      return { version, decision, recordedAt };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  },
};

// ── Provider Directory ───────────────────────────────────────────────────────
function providerRow(row) {
  if (!row) return undefined;
  return { providerId: row.provider_id, displayName: row.display_name, role: row.role, hcode: row.hcode, active: row.active, updatedAt: row.updated_at };
}

const providerStore = {
  async get(providerId) {
    const { rows } = await pool.query('SELECT * FROM providers WHERE provider_id = $1', [providerId]);
    return providerRow(rows[0]);
  },
  async upsertSeen({ providerId, displayName, role = 'staff', hcode = '' }) {
    if (!providerId) return undefined;
    await pool.query(
      `INSERT INTO providers (provider_id, display_name, role, hcode, active, updated_at)
       VALUES ($1,$2,$3,$4,TRUE,NOW())
       ON CONFLICT (provider_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         hcode = CASE WHEN EXCLUDED.hcode <> '' THEN EXCLUDED.hcode ELSE providers.hcode END,
         active = TRUE, updated_at = NOW()`,
      [providerId, displayName || providerId, role, String(hcode || '').trim()]
    );
    return providerStore.get(providerId);
  },
  async update(providerId, { role, hcode, active }) {
    const { rows } = await pool.query(
      `UPDATE providers SET role = $1, hcode = $2, active = $3, updated_at = NOW()
       WHERE provider_id = $4 RETURNING *`,
      [role, String(hcode || '').trim(), Boolean(active), providerId]
    );
    return providerRow(rows[0]);
  },
  async search({ hcode, role = '', query = '', limit = 20 }) {
    const { rows } = await pool.query(
      `SELECT * FROM providers
       WHERE active = TRUE
         AND ($1 = '' OR hcode = $1)
         AND ($2 = '' OR role = $2)
         AND ($3 = '' OR lower(display_name) LIKE '%' || lower($3) || '%' OR provider_id LIKE '%' || $3 || '%')
       ORDER BY display_name LIMIT $4`,
      [String(hcode || '').trim(), role, query.trim(), Math.min(Math.max(limit, 1), 100)]
    );
    return rows.map(providerRow);
  },
};

// ── Holiday calendar cache ───────────────────────────────────────────────────
const holidayStore = {
  async getYear(year) {
    const { rows } = await pool.query('SELECT * FROM holiday_years WHERE year = $1', [year]);
    if (!rows.length) return undefined;
    const row = rows[0];
    return { year: row.year, holidays: row.holidays, source: row.source, syncedAt: row.synced_at };
  },
  async setYear(year, holidays, source) {
    const { rows } = await pool.query(
      `INSERT INTO holiday_years (year, holidays, source, synced_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT(year) DO UPDATE SET holidays = EXCLUDED.holidays, source = EXCLUDED.source, synced_at = NOW()
       RETURNING *`,
      [year, JSON.stringify(holidays), source]
    );
    const row = rows[0];
    return { year: row.year, holidays: row.holidays, source: row.source, syncedAt: row.synced_at };
  },
};

// ── Usage Log Storage ──────────────────────────────────────────────────────────
const logStore = {
  async insert(event, data = {}) {
    try {
      await pool.query(
        `INSERT INTO usage_logs (ts, event, room_id, room_type, room_name, doctor_id, doctor_name, patient_name, patient_cid, meta, unit_hcode)
         VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [event, data.roomId||null, data.roomType||null, data.roomName||null,
         data.doctorId||null, data.doctorName||null, data.patientName||null, data.patientCid||null,
         data.meta ? JSON.stringify(data.meta) : null, data.unitHcode || null]
      );
    } catch (e) { console.error('[logStore:pg]', e.message); }
  },

  async summary(hcode) {
    const scoped = (condition = '') => {
      if (!hcode) return condition ? ` WHERE ${condition}` : '';
      return ` WHERE ${condition ? `${condition} AND ` : ''}unit_hcode = $1`;
    };
    const args = hcode ? [hcode] : [];
    const q = (condition = '') => pool.query(`SELECT COUNT(*) as c FROM usage_logs${scoped(condition)}`, args).then(r => r.rows[0].c);
    return {
      total:     +(await q()),
      rooms:     +(await q("event IN ('room_created','reserved_room_created')")),
      patients:  +(await q("event = 'patient_joined_queue'")),
      admitted:  +(await q("event = 'patient_admitted'")),
      doctors:   +(await pool.query(`SELECT COUNT(DISTINCT doctor_id) as c FROM usage_logs${scoped('doctor_id IS NOT NULL')}`, args).then(r => r.rows[0].c)),
      today:     +(await q('ts::date = CURRENT_DATE')),
      thisMonth: +(await q("to_char(ts,'YYYY-MM') = to_char(NOW(),'YYYY-MM')")),
    };
  },

  async daily(days = 30, hcode) {
    const scope = hcode ? ' AND unit_hcode = $2' : '';
    const { rows } = await pool.query(`
      SELECT ts::date as day,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END)::int as rooms,
             SUM(CASE WHEN event = 'patient_joined_queue' THEN 1 ELSE 0 END)::int as patients,
             SUM(CASE WHEN event = 'patient_admitted' THEN 1 ELSE 0 END)::int as admitted
      FROM usage_logs WHERE ts >= NOW() - ($1 || ' days')::interval${scope}
      GROUP BY ts::date ORDER BY day
    `, [Math.min(days, 365), ...(hcode ? [hcode] : [])]);
    return rows;
  },

  async monthly(months = 12, hcode) {
    const scope = hcode ? ' AND unit_hcode = $2' : '';
    const { rows } = await pool.query(`
      SELECT to_char(ts,'YYYY-MM') as month,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END)::int as rooms,
             SUM(CASE WHEN event = 'patient_joined_queue' THEN 1 ELSE 0 END)::int as patients,
             SUM(CASE WHEN event = 'patient_admitted' THEN 1 ELSE 0 END)::int as admitted,
             COUNT(DISTINCT doctor_id)::int as doctors
      FROM usage_logs WHERE ts >= NOW() - ($1 || ' months')::interval${scope}
      GROUP BY to_char(ts,'YYYY-MM') ORDER BY month
    `, [Math.min(months, 60), ...(hcode ? [hcode] : [])]);
    return rows;
  },

  async byDoctor(months = 3, hcode) {
    const scope = hcode ? ' AND unit_hcode = $2' : '';
    const { rows } = await pool.query(`
      SELECT doctor_id, doctor_name,
             SUM(CASE WHEN event IN ('room_created','reserved_room_created') THEN 1 ELSE 0 END)::int as rooms,
             SUM(CASE WHEN event = 'patient_admitted' THEN 1 ELSE 0 END)::int as admitted,
             SUM(CASE WHEN event = 'invite_generated' THEN 1 ELSE 0 END)::int as invites,
             COUNT(*)::int as total_events,
             MIN(ts) as first_seen, MAX(ts) as last_seen
      FROM usage_logs
      WHERE doctor_id IS NOT NULL AND ts >= NOW() - ($1 || ' months')::interval${scope}
      GROUP BY doctor_id, doctor_name ORDER BY total_events DESC
    `, [Math.min(months, 24), ...(hcode ? [hcode] : [])]);
    return rows;
  },

  async recent(limit = 50, hcode) {
    const scope = hcode ? ' WHERE unit_hcode = $2' : '';
    const { rows } = await pool.query(`
      SELECT id, ts, event, room_id, room_type, room_name,
             doctor_id, doctor_name, patient_name, patient_cid
      FROM usage_logs${scope} ORDER BY id DESC LIMIT $1
    `, [Math.min(limit, 500), ...(hcode ? [hcode] : [])]);
    return rows;
  },
};

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  await pool.query(DDL);
  // Purge expired sessions
  await pool.query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]);
  console.log('[store:pg] ready');
}

// Periodic purge
setInterval(async () => {
  try {
    await pool.query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]);
    await pool.query('DELETE FROM rooms WHERE expires_at < $1', [Date.now()]);
  } catch (_) {}
}, 5 * 60 * 1000).unref();

module.exports = { tokenStorage, roomStore, profileStore, consentStore, providerStore, holidayStore, logStore, init };
