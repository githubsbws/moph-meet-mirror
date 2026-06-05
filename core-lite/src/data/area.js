/**
 * area.js — resolve a service unit code (hcode) to { province, region, hospital }.
 *
 * Uses the generated hcode-to-area.js when available (run
 * scripts/build-hcode-map.js to produce it from the MOPH hospital export).
 * Falls back gracefully so the API never throws if the map is missing or the
 * hcode is unknown — the dashboard just shows "ไม่ระบุ" buckets instead.
 */

const { regionOf } = require('./health-regions');

let HCODE_TO_AREA = {};
try {
  ({ HCODE_TO_AREA } = require('./hcode-to-area'));
} catch (_) {
  console.warn('[area] hcode-to-area.js not found — run scripts/build-hcode-map.js. Province/region will be "ไม่ระบุ".');
}

const UNKNOWN = { province: 'ไม่ระบุ', region: null, hospital: '' };

/**
 * Resolve an hcode (5- or 9-digit; first 5 used) to area info.
 * @param {string} hcode
 * @returns {{ province: string, region: number|null, hospital: string }}
 */
function areaOf(hcode) {
  const code5 = String(hcode || '').trim().slice(0, 5);
  if (!code5) return { ...UNKNOWN };
  const hit = HCODE_TO_AREA[code5];
  if (hit) {
    return {
      province: hit.province || 'ไม่ระบุ',
      region:   hit.region ?? regionOf(hit.province),
      hospital: hit.hospital || '',
    };
  }
  return { ...UNKNOWN };
}

module.exports = { areaOf };
