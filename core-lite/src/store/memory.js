/**
 * In-memory storage backend — all data lives in process memory.
 * Suitable for dev/testing. Data is lost on restart.
 */

const NodeCache = require('node-cache');
const { areaOf } = require('../data/area');

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
const _rooms = new NodeCache({ stdTTL: 0, checkperiod: 0 });

const roomStore = {
  get(id) { return _rooms.get(id); },
  set(id, value, _ttlIgnored) { _rooms.set(id, value, 0); },
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

// ── Telemedicine consent ─────────────────────────────────────────────────────
const _consents = new Map();
const _consentEvents = [];
const consentStore = {
  get(username) { return _consents.get(username) || {}; },
  record(username, { version, decision }) {
    const recordedAt = new Date().toISOString();
    const record = { version, decision, recordedAt };
    _consents.set(username, record);
    _consentEvents.push({ username, ...record });
    return record;
  },
};

// ── Provider Directory ───────────────────────────────────────────────────────
const _providers = new Map();

const providerStore = {
  get(providerId) { return _providers.get(providerId); },
  upsertSeen({ providerId, displayName, role = 'staff', hcode = '' }) {
    if (!providerId) return undefined;
    const previous = _providers.get(providerId);
    const provider = {
      providerId,
      displayName: displayName || providerId,
      role: previous?.role || role,
      hcode: String(hcode || '').trim() || previous?.hcode || '',
      active: true,
      updatedAt: new Date().toISOString(),
    };
    _providers.set(providerId, provider);
    return provider;
  },
  update(providerId, { role, hcode, active }) {
    const previous = _providers.get(providerId);
    if (!previous) return undefined;
    const provider = { ...previous, role, hcode: String(hcode || '').trim(), active: Boolean(active), updatedAt: new Date().toISOString() };
    _providers.set(providerId, provider);
    return provider;
  },
  search({ hcode, role = '', query = '', limit = 20 }) {
    const needle = query.trim().toLowerCase();
    return [..._providers.values()]
      .filter(p => p.active && (!hcode || p.hcode === String(hcode).trim()))
      .filter(p => !role || p.role === role)
      .filter(p => !needle || p.displayName.toLowerCase().includes(needle) || p.providerId.includes(needle))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, Math.min(Math.max(limit, 1), 100));
  },
};

// ── Holiday calendar cache ───────────────────────────────────────────────────
const _holidayYears = new Map();
const holidayStore = {
  getYear(year) { return _holidayYears.get(year); },
  setYear(year, holidays, source) {
    const value = { year, holidays, source, syncedAt: new Date().toISOString() };
    _holidayYears.set(year, value);
    return value;
  },
};

// ── Usage-Log Storage ──────────────────────────────────────────────────────────
const _logs = [];

function _dateStr(iso) { return iso.slice(0, 10); }
function _monthStr(iso) { return iso.slice(0, 7); }
function _localISO() { return new Date().toLocaleString('sv-SE').replace(' ', 'T'); }
function _inDashboardRange(log, { from, to, hourFrom, hourTo, hcode } = {}) {
  const day = _dateStr(log.ts);
  if (from && day < from) return false;
  if (to && day > to) return false;
  const hour = Number(log.ts.slice(11, 13));
  if (hourFrom != null && hourTo != null && (hour < Number(hourFrom) || hour > Number(hourTo))) return false;
  return !hcode || log.unitHcode === hcode;
}
function _isRoomEvent(event) { return event === 'room_created' || event === 'reserved_room_created'; }

const logStore = {
  insert(event, data = {}) {
    const area = data.unitHcode ? areaOf(data.unitHcode) : null;
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
      unitHcode: data.unitHcode || null,
      platform: data.platform || 'web',
      province: area?.province || data.province || null,
      region: area?.region ?? data.region ?? null,
      durationSec: data.durationSec ?? null,
    });
  },

  summary(hcode) {
    const rows = hcode ? _logs.filter(l => l.unitHcode === hcode) : _logs;
    const now = new Date();
    const todayStr = now.toLocaleDateString('sv-SE');
    const monthStr = todayStr.slice(0, 7);
    const roomEvents = ['room_created', 'reserved_room_created'];
    return {
      total: rows.length,
      rooms: rows.filter(l => roomEvents.includes(l.event)).length,
      patients: rows.filter(l => l.event === 'patient_joined_queue').length,
      admitted: rows.filter(l => l.event === 'patient_admitted').length,
      doctors: new Set(rows.filter(l => l.doctorId).map(l => l.doctorId)).size,
      today: rows.filter(l => _dateStr(l.ts) === todayStr).length,
      thisMonth: rows.filter(l => _monthStr(l.ts) === monthStr).length,
    };
  },

  daily(days = 30, hcode) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const map = {};
    for (const l of _logs) {
      if (l.ts < cutoff || (hcode && l.unitHcode !== hcode)) continue;
      const day = _dateStr(l.ts);
      if (!map[day]) map[day] = { day, rooms: 0, patients: 0, admitted: 0 };
      if (['room_created', 'reserved_room_created'].includes(l.event)) map[day].rooms++;
      if (l.event === 'patient_joined_queue') map[day].patients++;
      if (l.event === 'patient_admitted') map[day].admitted++;
    }
    return Object.values(map).sort((a, b) => a.day.localeCompare(b.day));
  },

  monthly(months = 12, hcode) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString();
    const map = {};
    for (const l of _logs) {
      if (l.ts < cutoffStr || (hcode && l.unitHcode !== hcode)) continue;
      const month = _monthStr(l.ts);
      if (!map[month]) map[month] = { month, rooms: 0, patients: 0, admitted: 0, doctors: new Set() };
      if (['room_created', 'reserved_room_created'].includes(l.event)) map[month].rooms++;
      if (l.event === 'patient_joined_queue') map[month].patients++;
      if (l.event === 'patient_admitted') map[month].admitted++;
      if (l.doctorId) map[month].doctors.add(l.doctorId);
    }
    return Object.values(map).map(m => ({ ...m, doctors: m.doctors.size })).sort((a, b) => a.month.localeCompare(b.month));
  },

  byDoctor(months = 3, hcode) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString();
    const map = {};
    for (const l of _logs) {
      if (l.ts < cutoffStr || !l.doctorId || (hcode && l.unitHcode !== hcode)) continue;
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

  recent(limit = 50, hcode) {
    const rows = hcode ? _logs.filter(l => l.unitHcode === hcode) : _logs;
    return rows.slice(-limit).reverse().map(l => ({
      id: l.id, ts: l.ts, event: l.event, room_id: l.roomId, room_type: l.roomType,
      room_name: l.roomName, doctor_id: l.doctorId, doctor_name: l.doctorName,
      patient_name: l.patientName, patient_cid: l.patientCid,
    }));
  },

  // In-memory equivalents of the SQLite dashboard queries. These keep local
  // development/testing behavior aligned with the production backend.
  byDay(opts = {}) {
    const map = new Map();
    for (const log of _logs.filter(log => _inDashboardRange(log, opts))) {
      const day = _dateStr(log.ts);
      const row = map.get(day) || { day, rooms: 0, patients: 0, admitted: 0 };
      if (_isRoomEvent(log.event)) row.rooms++;
      if (log.event === 'patient_joined_queue') row.patients++;
      if (log.event === 'patient_admitted') row.admitted++;
      map.set(day, row);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  },

  byHour(opts = {}) {
    const map = new Map();
    for (const log of _logs.filter(log => _inDashboardRange(log, opts))) {
      const hour = Number(log.ts.slice(11, 13));
      const row = map.get(hour) || { hour, total: 0, rooms: 0 };
      row.total++; if (_isRoomEvent(log.event)) row.rooms++;
      map.set(hour, row);
    }
    return [...map.values()].sort((a, b) => a.hour - b.hour);
  },

  byRegion(opts = {}) {
    const map = new Map();
    for (const log of _logs.filter(log => _inDashboardRange(log, opts))) {
      const key = log.region ?? null;
      const row = map.get(key) || { region: key, total: 0, rooms: 0, admitted: 0 };
      row.total++; if (_isRoomEvent(log.event)) row.rooms++; if (log.event === 'patient_admitted') row.admitted++;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => (a.region == null) - (b.region == null) || (a.region || 0) - (b.region || 0));
  },

  byProvince(opts = {}) {
    const map = new Map();
    for (const log of _logs.filter(log => _inDashboardRange(log, opts)).filter(log => opts.region == null || log.region === Number(opts.region))) {
      const key = log.province ?? null;
      const row = map.get(key) || { province: key, region: log.region ?? null, total: 0, rooms: 0, admitted: 0 };
      row.total++; if (_isRoomEvent(log.event)) row.rooms++; if (log.event === 'patient_admitted') row.admitted++;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  },

  byPlatform(opts = {}) {
    const map = new Map();
    for (const log of _logs.filter(log => _inDashboardRange(log, opts))) {
      const platform = log.platform || 'web';
      const row = map.get(platform) || { platform, total: 0, rooms: 0 };
      row.total++; if (_isRoomEvent(log.event)) row.rooms++;
      map.set(platform, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  },

  byUnit(opts = {}) {
    const map = new Map();
    for (const log of _logs.filter(log => _inDashboardRange(log, opts)).filter(log => log.unitHcode)) {
      const row = map.get(log.unitHcode) || { unit_hcode: log.unitHcode, province: log.province, region: log.region, total: 0, rooms: 0, first_used: log.ts, last_used: log.ts, total_duration_sec: 0 };
      row.total++; if (_isRoomEvent(log.event)) row.rooms++;
      if (log.ts < row.first_used) row.first_used = log.ts;
      if (log.ts > row.last_used) row.last_used = log.ts;
      row.total_duration_sec += Number(log.durationSec || 0);
      map.set(log.unitHcode, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, Math.min(opts.limit || 100, 500));
  },

  longestRooms(opts = {}) {
    const map = new Map();
    for (const log of _logs.filter(log => _inDashboardRange(log, opts)).filter(log => log.roomId && log.durationSec != null)) {
      const previous = map.get(log.roomId);
      if (!previous || Number(log.durationSec) > previous.duration_sec) {
        map.set(log.roomId, { room_ref: String(log.roomId).slice(0, 6), room_type: log.roomType, province: log.province, region: log.region, duration_sec: Number(log.durationSec), created_at: log.ts });
      }
    }
    return [...map.values()].sort((a, b) => b.duration_sec - a.duration_sec).slice(0, Math.min(opts.limit || 5, 100));
  },
};

// ── Init (no-op for memory) ────────────────────────────────────────────────────
async function init() { console.log('[store:memory] ready'); }

module.exports = { tokenStorage, roomStore, profileStore, consentStore, providerStore, holidayStore, logStore, init };
