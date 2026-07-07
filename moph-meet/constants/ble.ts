/**
 * BLE Medical Device Constants — TOR 4.10.6
 * Standard GATT service UUIDs for ≥5 medical device types.
 * References: Bluetooth SIG Assigned Numbers (GATT Services)
 */

/**
 * Decode a base64 string to a byte array without relying on the global `Buffer`
 * (React Native has no global Buffer). Used to parse GATT characteristic values.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const bytes: number[] = [];
  for (let i = 0; i < len; i += 4) {
    const e0 = chars.indexOf(clean[i]);
    const e1 = chars.indexOf(clean[i + 1]);
    const e2 = chars.indexOf(clean[i + 2]);
    const e3 = chars.indexOf(clean[i + 3]);
    const c0 = (e0 << 2) | (e1 >> 4);
    bytes.push(c0 & 0xff);
    if (e2 !== -1 && i + 2 < len) {
      const c1 = ((e1 & 15) << 4) | (e2 >> 2);
      bytes.push(c1 & 0xff);
    }
    if (e3 !== -1 && i + 3 < len) {
      const c2 = ((e2 & 3) << 6) | e3;
      bytes.push(c2 & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

export const BLE_SERVICES = {
  thermometer:   '00001809-0000-1000-8000-00805f9b34fb', // Health Thermometer
  bloodPressure: '00001810-0000-1000-8000-00805f9b34fb', // Blood Pressure
  pulseOximeter: '00001822-0000-1000-8000-00805f9b34fb', // Pulse Oximeter
  weightScale:   '0000181d-0000-1000-8000-00805f9b34fb', // Weight Scale (Body Composition)
  glucose:       '00001808-0000-1000-8000-00805f9b34fb', // Glucose
  heartRate:     '0000180d-0000-1000-8000-00805f9b34fb', // Heart Rate (NST proxy)
} as const;

export type DeviceType = keyof typeof BLE_SERVICES;

/** Map device type → vital metrics it produces */
export const DEVICE_METRICS: Record<DeviceType, { metric: string; unit: string; label: string }[]> = {
  thermometer:   [{ metric: 'temp',    unit: '°C',    label: 'อุณหภูมิ' }],
  bloodPressure: [
    { metric: 'sys', unit: 'mmHg', label: 'ความดัน SYS' },
    { metric: 'dia', unit: 'mmHg', label: 'ความดัน DIA' },
    { metric: 'pr',  unit: '/min', label: 'ชีพจร' },
  ],
  pulseOximeter: [
    { metric: 'spo2', unit: '%',    label: 'SpO₂' },
    { metric: 'pr',   unit: '/min', label: 'ชีพจร' },
  ],
  weightScale:   [
    { metric: 'weight', unit: 'kg', label: 'น้ำหนัก' },
    { metric: 'height', unit: 'cm', label: 'ส่วนสูง' },
  ],
  glucose:       [{ metric: 'glucose', unit: 'mg/dL', label: 'น้ำตาล' }],
  heartRate:     [
    { metric: 'pr',   unit: '/min', label: 'ชีพจร' },
    { metric: 'fhr',  unit: 'bpm',  label: 'FHR (NST)' },
  ],
};

/** Human-readable device type names */
export const DEVICE_LABELS: Record<DeviceType, string> = {
  thermometer:   'เครื่องวัดอุณหภูมิ',
  bloodPressure: 'เครื่องวัดความดัน',
  pulseOximeter: 'Pulse Oximeter',
  weightScale:   'เครื่องชั่งน้ำหนัก',
  glucose:       'เครื่องวัดน้ำตาล',
  heartRate:     'Heart Rate / NST',
};

/** One parsed vital reading from a GATT characteristic or manual entry. */
export type VitalReading = { metric: string; unit: string; label: string; value: string };

/**
 * Attempt to parse a GATT characteristic value (base64) for known services.
 * Minimal parsing — real devices may use richer GATT layouts. Returns [] on
 * unknown service or unparseable input (never throws).
 */
export function parseGATT(serviceUUID: string, base64Value: string): VitalReading[] {
  try {
    const buf = base64ToBytes(base64Value);
    // thermometer: IEEE-11073 float in bytes 1-4
    if (serviceUUID.startsWith('00001809')) {
      const raw = ((buf[1] | (buf[2] << 8)) & 0x7fff) / 10;
      return [{ metric: 'temp', unit: '°C', label: 'อุณหภูมิ', value: String(raw) }];
    }
    // blood pressure: sys = uint16 bytes 1-2, dia = uint16 bytes 3-4, pr = bytes 14-15
    if (serviceUUID.startsWith('00001810')) {
      const sys = buf[1] | (buf[2] << 8);
      const dia = buf[3] | (buf[4] << 8);
      const pr  = buf[14] | (buf[15] << 8);
      return [
        { metric: 'sys', unit: 'mmHg', label: 'SYS', value: String(sys) },
        { metric: 'dia', unit: 'mmHg', label: 'DIA', value: String(dia) },
        { metric: 'pr',  unit: '/min', label: 'ชีพจร', value: String(pr) },
      ];
    }
    // pulse oximeter: SpO2 byte 3, PR byte 4
    if (serviceUUID.startsWith('00001822')) {
      return [
        { metric: 'spo2', unit: '%',    label: 'SpO₂', value: String(buf[3]) },
        { metric: 'pr',   unit: '/min', label: 'ชีพจร', value: String(buf[4]) },
      ];
    }
    // weight scale: weight uint16 bytes 1-2 × 0.005 kg
    if (serviceUUID.startsWith('0000181d')) {
      const weight = ((buf[1] | (buf[2] << 8)) * 0.005).toFixed(1);
      return [{ metric: 'weight', unit: 'kg', label: 'น้ำหนัก', value: weight }];
    }
    // glucose: concentration bytes 3-4 as mmol/L × 10, convert to mg/dL
    if (serviceUUID.startsWith('00001808')) {
      const mmol = (buf[3] | (buf[4] << 8)) / 10;
      const mgdl = Math.round(mmol * 18.02).toString();
      return [{ metric: 'glucose', unit: 'mg/dL', label: 'น้ำตาล', value: mgdl }];
    }
  } catch (_) {}
  return [];
}
