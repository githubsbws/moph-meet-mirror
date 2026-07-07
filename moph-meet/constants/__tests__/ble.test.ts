import { base64ToBytes, parseGATT, BLE_SERVICES } from '../ble';

/** helper: bytes -> base64 using Node Buffer (canonical encoder for cross-check) */
const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

describe('base64ToBytes', () => {
  it('decodes simple 3-byte sequence', () => {
    expect(Array.from(base64ToBytes('AQID'))).toEqual([1, 2, 3]); // "AQID" -> 1,2,3
  });

  it('handles single padding "=" (2 bytes)', () => {
    expect(Array.from(base64ToBytes('SGk='))).toEqual([72, 105]); // "Hi"
  });

  it('handles double padding "==" (1 byte)', () => {
    expect(Array.from(base64ToBytes('TQ=='))).toEqual([77]); // "M"
  });

  it('round-trips arbitrary bytes against Node Buffer encoder', () => {
    const bytes = [0, 255, 16, 128, 1, 2, 3, 200, 55, 99];
    expect(Array.from(base64ToBytes(b64(bytes)))).toEqual(bytes);
  });

  it('returns empty for empty input', () => {
    expect(Array.from(base64ToBytes(''))).toEqual([]);
  });
});

describe('parseGATT', () => {
  it('thermometer (1809): temp from bytes 1-2', () => {
    // 36.5°C -> raw 365 = 0x016D -> byte1=0x6D, byte2=0x01
    const r = parseGATT(BLE_SERVICES.thermometer, b64([0x00, 0x6d, 0x01]));
    expect(r).toEqual([{ metric: 'temp', unit: '°C', label: 'อุณหภูมิ', value: '36.5' }]);
  });

  it('bloodPressure (1810): sys/dia/pr', () => {
    const bytes = new Array(16).fill(0);
    bytes[1] = 120; // sys
    bytes[3] = 80;  // dia
    bytes[14] = 72; // pr
    const r = parseGATT(BLE_SERVICES.bloodPressure, b64(bytes));
    expect(r.map(x => [x.metric, x.value])).toEqual([
      ['sys', '120'], ['dia', '80'], ['pr', '72'],
    ]);
  });

  it('pulseOximeter (1822): spo2 byte3, pr byte4', () => {
    const r = parseGATT(BLE_SERVICES.pulseOximeter, b64([0, 0, 0, 98, 72]));
    expect(r.map(x => [x.metric, x.value])).toEqual([['spo2', '98'], ['pr', '72']]);
  });

  it('weightScale (181d): weight uint16 x 0.005', () => {
    // 70.0kg -> raw 14000 = 0x36B0 -> byte1=0xB0, byte2=0x36
    const r = parseGATT(BLE_SERVICES.weightScale, b64([0x00, 0xb0, 0x36]));
    expect(r).toEqual([{ metric: 'weight', unit: 'kg', label: 'น้ำหนัก', value: '70.0' }]);
  });

  it('glucose (1808): mmol/L x10 -> mg/dL', () => {
    // 5.5 mmol/L -> raw 55; mg/dL = round(5.5*18.02)=99
    const r = parseGATT(BLE_SERVICES.glucose, b64([0, 0, 0, 55, 0]));
    expect(r).toEqual([{ metric: 'glucose', unit: 'mg/dL', label: 'น้ำตาล', value: '99' }]);
  });

  it('unknown service -> []', () => {
    expect(parseGATT('0000ffff-0000-1000-8000-00805f9b34fb', b64([1, 2, 3]))).toEqual([]);
  });

  it('garbage input does not throw -> array', () => {
    expect(Array.isArray(parseGATT(BLE_SERVICES.thermometer, '!!!'))).toBe(true);
  });
});
