# Design Document — mobile-ble-vitals-fix

## Overview

แก้ `moph-meet/app/devices.tsx` (และเพิ่ม helper ใน `moph-meet/constants/`) ให้การบันทึก
สัญญาณชีพและการเชื่อม BLE ทำงานได้จริง โดยแก้ 5 ข้อบกพร่อง และคง fallback manual entry.
ไม่แตะ backend (endpoint `POST /api/vitals/batch` พร้อมใช้อยู่แล้ว).

สถาปัตยกรรมคงเดิม:
```
[Devices_Screen] --apiFetch (Cookie auth)--> [user-app-lite proxy] --/api/*--> [core-lite]
       │
       └── react-native-ble-plx (native build เท่านั้น) → GATT read/notify
```

## Components & Changes

### C1. Auth — ใช้ `apiFetch` แทน raw fetch + Bearer  (Req 1)
- **ไฟล์:** `app/devices.tsx`
- ลบ `Authorization: Bearer` ออกทั้ง 2 จุด (`ManualEntry.save`, `connectDevice`).
- เปลี่ยนเป็นเรียก `apiFetch('/api/vitals/batch', token, { method: 'POST', body: JSON.stringify(records) })`
  จาก `constants/api.ts` (แนบ `Cookie: token=...` + `credentials:'include'`, ตั้ง
  `Content-Type` ให้แล้ว).
- ไม่ต้องส่ง absolute URL — `apiFetch` เติม `API_BASE` เอง ผ่าน `buildApiUrl`.

### C2. Runtime permissions (Android)  (Req 2)
- **ไฟล์ใหม่:** `constants/blePermissions.ts`
- export `async function ensureBlePermissions(): Promise<boolean>`:
  - `if (Platform.OS !== 'android') return true;`
  - `if (Platform.Version >= 31)` → `PermissionsAndroid.requestMultiple([
    BLUETOOTH_SCAN, BLUETOOTH_CONNECT ])` (และรวม FINE_LOCATION เผื่อ OEM ที่ยังต้องใช้).
  - `else` → `PermissionsAndroid.request(ACCESS_FINE_LOCATION)`.
  - คืน `true` ก็ต่อเมื่อสิทธิ์ที่จำเป็นได้ `granted` ทั้งหมด.
- `startScan` เรียก `ensureBlePermissions()` ก่อน; ถ้า `false` → `setShowManual(true)` +
  Alert อธิบาย แล้ว return.

### C3. Adapter state gate  (Req 3)
- **ไฟล์:** `app/devices.tsx`
- ก่อนสแกน: `const state = await BleManager.state();` ถ้า ≠ `'PoweredOn'` →
  ใช้ `BleManager.onStateChange(cb, true)` รอสั้นๆ หรือแจ้งผู้ใช้ให้เปิด Bluetooth แล้ว return.
- เก็บ subscription ใน `useRef` และ `remove()` ใน cleanup (มี `scanSub` อยู่แล้ว → เพิ่ม `stateSub`).

### C4. base64 → bytes โดยไม่พึ่ง Buffer  (Req 4)
- **ไฟล์:** `constants/ble.ts` (เพิ่ม util) หรือ inline ใน `devices.tsx`.
- เพิ่ม `export function base64ToBytes(b64: string): Uint8Array` ใช้ decoder ที่ปลอดภัย
  บน RN:
  - ตัวเลือก A (แนะนำ): ใช้ `Buffer` จาก package `buffer` ที่ import ชัดเจน
    (`import { Buffer } from 'buffer'`) — เพิ่ม dep `buffer` (มี type, เสถียร).
  - ตัวเลือก B: implement atob-style decode เอง (ตาราง base64) → ไม่มี dep เพิ่ม.
  - **เลือก A** เพื่อความถูกต้อง/อ่านง่าย และ pin เวอร์ชัน.
- `parseGATT` เปลี่ยนจาก `Buffer.from(v,'base64')` เป็นอ่านจาก `Uint8Array` (index/bit ops เดิมใช้ได้).

### C5. NOTIFY/INDICATE support  (Req 5)
- **ไฟล์:** `app/devices.tsx` (`connectDevice`)
- หลัง `discoverAllServicesAndCharacteristics()` วนแต่ละ known service:
  - อ่าน `characteristicsForService(svc)`.
  - ถ้า `c.isReadable` → `await c.read()` แล้ว `parseGATT`.
  - ถ้า `c.isNotifiable || c.isIndicatable` → `d.monitorCharacteristicForService(svc, cUUID, cb)`
    รวบค่าแรกที่ parse ได้.
- ใช้ `Promise.race([firstReading, timeout(15s)])`; ได้ค่า → ส่งผ่าน `apiFetch`; timeout →
  ยกเลิก monitor + Alert + `setShowManual(true)`.
- ใน `finally` → `cancelDeviceConnection` + remove monitors.

## Data / API Contract (ไม่เปลี่ยน)
- `POST /api/vitals/batch` รับ **array** ของ `{ metric, value, unit?, roomId?, deviceType?, source? }`;
  บังคับ `metric` + `value`. ตอบ `201 { ok, count }`. Auth ผ่าน Cookie.

## Testable Properties (design-by-contract)
- **P1 (auth):** สำหรับทุก `(token, records)` request ที่สร้างมี header `Cookie: token=<token>`,
  `credentials:'include'`, และ **ไม่มี** `Authorization`. (unit test บน buildApiRequestInit เดิมครอบ + เพิ่ม guard)
- **P2 (permission gate):** ถ้า `ensureBlePermissions()` คืน false → ไม่มีการเรียก
  `startDeviceScan`.
- **P3 (decode):** สำหรับ vector ทดสอบของแต่ละ service, `parseGATT` คืนค่าตามสูตร (temp/
  bp/spo2/weight/glucose) และคืน `[]` เมื่อ input ผิด/ไม่รู้จัก โดยไม่ throw.
- **P4 (state gate):** ถ้า Adapter_State ≠ PoweredOn → ไม่ scan.
- **P5 (no-regress):** manual entry ส่งได้ทุก platform; ไม่มี Authorization header ในโค้ด
  (`grep`), และไฟล์ icon/login/splash ไม่ถูกแตะ.

## Testing Strategy
- **Static:** `npx tsc --noEmit`; `grep -R "Authorization" app/ constants/` ต้องไม่พบใน
  โค้ดที่เกี่ยว.
- **Unit (jest):** ทดสอบ `parseGATT`/`base64ToBytes` ด้วย byte vectors (pure functions);
  ทดสอบ `ensureBlePermissions` โดย mock `PermissionsAndroid`.
- **On-device (manual, ทำตอน build):** ต้อง native build (EAS/Android Studio) แล้วทดสอบ
  สแกน+เชื่อมอุปกรณ์จริง — ระบุใน checklist ของ build plan. (ยืนยันไม่ได้จาก static analysis)

## Risks / Notes
- BLE ทดสอบเต็มรูปแบบต้องมีอุปกรณ์จริง + native build → ส่วนที่ยืนยันได้ตอนนี้คือ auth,
  permission logic, decode (pure). ระบุความไม่แน่นอนนี้ให้ชัด.
- เพิ่ม dep `buffer` ต้อง pin เวอร์ชันและ `npm install` (กระทบ package.json/lock — commit แยก).
- ไม่แตะ `app.json` permissions (ประกาศครบแล้ว) และไม่แตะ backend.
