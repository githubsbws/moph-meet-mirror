/**
 * BLE Medical Device Constants — TOR 4.10.6
 * Standard GATT service UUIDs for ≥5 medical device types.
 * References: Bluetooth SIG Assigned Numbers (GATT Services)
 */

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
