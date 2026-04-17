/**
 * In-memory storage backend — all data lives in process memory.
 * Suitable for dev/testing. Data is lost on restart.
 */

const NodeCache = require('node-cache');

const DEFAULT_TTL = 24 * 60 * 60; // 24 h in seconds

// ── Token Storage ──────────────────────────────────────────────────────────────
const _tokens = new NodeCache({ stdTTL: DEFAULT_TTL, checkperiod: 60 });

const tokenStorage = {
  set(key, value, ttlSeconds) {
    _tokens.set(key, value, ttlSeconds || DEFAULT_TTL);
  },
  get(key) { return _tokens.get(key); },
  has(key) { return _tokens.has(key); },
  del(key) { _tokens.del(key); },
};

// ── Room Storage ───────────────────────────────────────────────────────────────
const _rooms = new NodeCache({ stdTTL: DEFAULT_TTL, checkperiod: 120 });

const roomStore = {
  get(id) { return _rooms.get(id); },
  set(id, value, ttlSeconds) { _rooms.set(id, value, ttlSeconds || DEFAULT_TTL); },
  del(id) { _rooms.del(id); },
  keys() { return _rooms.keys(); },
};

// ── Profile Storage ────────────────────────────────────────────────────────────
const _profiles = new Map();

const profileStore = {
  get(username) { return _profiles.get(username) || {}; },
  upsert(username, data) {
    const prev = _profiles.get(username) || {};
    _profiles.set(username, { ...prev, ...data, updatedAt: new Date().toISOString() });
  },
};

// ── Usage-Log Storage ──────────────────────────────────────────────────────────
const _logs = [];

function _dateStr(iso) { return iso.slice(0, 10); }
function _monthStr(iso) { return iso.slice(0, 7); }
function _localISO() { return new Date().toLocaleString('sv-SE').replace(' ', 'T'); }

const logStore = {
  insert(event, data = {}) {
    _logs.push({
      id: _logs.length + 1,
      ts: _localISO(),
      event,
      roomId: data.roomId || null,
      roomType: data.roomType || null,
      roomName: data.roomName || null,
      doctorId: data.doctorId || null,
      doctorName: data.doctorName || null,
      patientName: data.patientName || null,
      patientCid: data.patientCid || null,
      meta: data.meta ? JSON.stringify(data.meta) : null,
    });
  },

  summary() {
    const now = new Date();
    const todayStr = now.toLocaleDateString('sv-SE');
    const monthStr = todayStr.slice(0, 7);
    const roomEvents = ['room_created', 'reserved_room_created'];
    return {
      total: _logs.length,
      rooms: _logs.filter(l => roomEvents.includes(l.event)).length,
      patients: _logs.filter(l => l.event === 'patient_joined_queue').length,
      admitted: _logs.filter(l => l.event === 'patient_admitted').length,
      doctors: new Set(_logs.filter(l => l.doctorId).map(l => l.doctorId)).size,
      today: _logs.filter(l => _dateStr(l.ts) === todayStr).length,
      thisMonth: _logs.filter(l => _monthStr(l.ts) === monthStr).length,
    };
  },

  daily(days = 30) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const map = {};
    for (const l of _logs) {
      if (l.ts < cutoff) continue;
      const day = _dateStr(l.ts);
      if (!map[day]) map[day] = { day, rooms: 0, patients: 0, admitted: 0 };
      if (['room_created', 'reserved_room_created'].includes(l.event)) map[day].rooms++;
      if (l.event === 'patient_joined_queue') map[day].patients++;
      if (l.event === 'patient_admitted') map[day].admitted++;
    }
    return Object.values(map).sort((a, b) => a.day.localeCompare(b.day));
  },

  monthly(months = 12) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString();
    const map = {};
    for (const l of _logs) {
      if (l.ts < cutoffStr) continue;
      const month = _monthStr(l.ts);
      if (!map[month]) map[month] = { month, rooms: 0, patients: 0, admitted: 0, doctors: new Set() };
      if (['room_created', 'reserved_room_created'].includes(l.event)) map[month].rooms++;
      if (l.event === 'patient_joined_queue') map[month].patients++;
      if (l.event === 'patient_admitted') map[month].admitted++;
      if (l.doctorId) map[month].doctors.add(l.doctorId);
    }
    return Object.values(map).map(m => ({ ...m, doctors: m.doctors.size })).sort((a, b) => a.month.localeCompare(b.month));
  },

  byDoctor(months = 3) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString();
    const map = {};
    for (const l of _logs) {
      if (l.ts < cutoffStr || !l.doctorId) continue;
      if (!map[l.doctorId]) map[l.doctorId] = { doctor_id: l.doctorId, doctor_name: l.doctorName, rooms: 0, admitted: 0, invites: 0, total_events: 0, first_seen: l.ts, last_seen: l.ts };
      const d = map[l.doctorId];
      d.total_events++;
      if (['room_created', 'reserved_room_created'].includes(l.event)) d.rooms++;
      if (l.event === 'patient_admitted') d.admitted++;
      if (l.event === 'invite_generated') d.invites++;
      if (l.ts < d.first_seen) d.first_seen = l.ts;
      if (l.ts > d.last_seen) d.last_seen = l.ts;
    }
    return Object.values(map).sort((a, b) => b.total_events - a.total_events);
  },

  recent(limit = 50) {
    return _logs.slice(-limit).reverse().map(l => ({
      id: l.id, ts: l.ts, event: l.event, room_id: l.roomId, room_type: l.roomType,
      room_name: l.roomName, doctor_id: l.doctorId, doctor_name: l.doctorName,
      patient_name: l.patientName, patient_cid: l.patientCid,
    }));
  },
};

// ── Init (no-op for memory) ────────────────────────────────────────────────────
async function init() { console.log('[store:memory] ready'); }

module.exports = { tokenStorage, roomStore, profileStore, logStore, init };
