# Requirements Document

## Introduction

หน้าจอ **อุปกรณ์ทางการแพทย์** ของแอป **MOPH Meet mobile** (`moph-meet/app/devices.tsx`)
ทำหน้าที่บันทึกค่าสัญญาณชีพ (vital signs) ตาม **TOR 4.10.5** และเชื่อมต่ออุปกรณ์
Bluetooth (BLE) อย่างน้อย 5 ชนิดตาม **TOR 4.10.6** แล้วส่งค่าไปยัง
`POST /api/vitals/batch`.

จากการตรวจสอบโค้ด พบว่าฟีเจอร์นี้อยู่ในระดับ **demo/proof-of-concept** — โครงสร้าง UI
และ fallback การกรอกค่าเองมีครบ แต่มีข้อบกพร่อง 5 จุดที่ทำให้ **การใช้งานจริงล้มเหลว**
ทั้งเส้นทางกรอกเองและเส้นทาง Bluetooth:

1. **Auth regression** — `devices.tsx` เรียก `fetch` ตรงพร้อม `Authorization: Bearer`
   แทนที่จะใช้ helper `apiFetch` (Cookie auth) ตาม case-016 → การบันทึกค่าโดน 401
   ผ่าน proxy (กระทบทั้ง manual + BLE).
2. **ไม่มีการขอ runtime permission** — Android 12+ บังคับขอ `BLUETOOTH_SCAN`/
   `BLUETOOTH_CONNECT`, ต่ำกว่านั้นต้อง `ACCESS_FINE_LOCATION` → `startDeviceScan`
   ล้มเหลว สแกนไม่พบอุปกรณ์.
3. **ไม่รอ adapter พร้อม (PoweredOn)** — สแกนทันทีหลังสร้าง `BleManager` อาจล้มเหลว
   ถ้า Bluetooth ปิด/ยังไม่พร้อม.
4. **`Buffer` ไม่มี polyfill** — `parseGATT()` ใช้ `Buffer.from()` แต่ React Native
   ไม่มี global `Buffer` → throw ถูก try/catch กลืน → คืน `[]` เสมอ → ตกไป manual
   ทุกครั้งแม้เชื่อมอุปกรณ์ได้.
5. **อ่านค่าแบบ READ อย่างเดียว** — อุปกรณ์การแพทย์ส่วนใหญ่ส่งค่าผ่าน
   NOTIFY/INDICATE ไม่ใช่ read → เชื่อมได้แต่ไม่ได้ค่า.

เป้าหมายของ feature นี้คือแก้ทั้ง 5 จุดให้การบันทึกสัญญาณชีพ (manual) ทำงานได้จริง
และการเชื่อม Bluetooth อ่านค่าจากอุปกรณ์มาตรฐานได้ โดย **ไม่ regress** ข้อกำหนดเดิม.

### Scope และขอบเขต (ตาม steering `lite-only.md` + `mobile-app.md`)

- การเปลี่ยนแปลงทั้งหมดอยู่ใน `moph-meet/` เท่านั้น (ไฟล์หลัก: `app/devices.tsx`,
  `constants/ble.ts`, และอาจเพิ่ม helper ใน `constants/`).
- **Cookie auth ไม่ใช่ Bearer** — ทุก API call ต้องผ่าน `apiFetch`/`buildApiRequestInit`
  (`Cookie: token=...` + `credentials: 'include'`). ห้าม regress กลับ Bearer (case-016).
- **ห้ามย้าย business logic เข้าแอป** — `core-lite/` เป็นเจ้าของ `/api/*`. Endpoint
  `POST /api/vitals/batch` มีอยู่แล้วและรับ array ของ `{ metric, value, ... }` →
  **ไม่ต้องแก้ backend**.
- ต้องคง fallback **manual entry เสมอ** (TOR: "ตามที่ สธ กำหนด") แม้ BLE ใช้ไม่ได้.
- ต้องไม่กระทบ app icon / login logo / splash ที่แก้ไปก่อนหน้า.

## Glossary

- **Devices_Screen**: หน้าจอ `moph-meet/app/devices.tsx` (route `/devices`).
- **Vitals_Batch_API**: endpoint `POST /api/vitals/batch` ของ Core_API รับ array ของ
  record ที่มีอย่างน้อย `metric` + `value`.
- **Cookie_Auth**: การส่ง session token ผ่าน `Cookie: token=<token>` +
  `credentials: 'include'` ผ่าน helper `apiFetch` (case-016). ตรงข้ามกับ Bearer.
- **BLE_Manager**: instance ของ `react-native-ble-plx` `BleManager`.
- **BLE_Permission**: สิทธิ์ Android runtime สำหรับสแกน/เชื่อม BLE — API ≥ 31 ใช้
  `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT`; API < 31 ใช้ `ACCESS_FINE_LOCATION`.
- **Adapter_State**: สถานะของ Bluetooth adapter (`PoweredOn`, `PoweredOff`, ...).
- **GATT_Reading**: ค่าที่ decode จาก characteristic (base64) → `{ metric, unit, label, value }`.
- **Manual_Entry**: การกรอกค่าสัญญาณชีพเองบนหน้าจอ (fallback ที่มีเสมอ).
- **Notifiable_Characteristic**: characteristic ที่รองรับ NOTIFY หรือ INDICATE.

## Requirements

### Requirement 1 — บันทึกค่าผ่าน Cookie auth (แก้ auth regression)

**User Story:** ในฐานะเจ้าหน้าที่ ฉันต้องการให้การบันทึกค่าสัญญาณชีพจากมือถือสำเร็จ
(ไม่โดน 401) เพื่อให้ค่าที่กรอก/อ่านได้ถูกเก็บเข้าระบบจริง.

#### Acceptance Criteria
1. WHEN Devices_Screen ส่งค่าไป Vitals_Batch_API (ทั้งจาก Manual_Entry และจาก BLE)
   THEN request SHALL ถูกสร้างผ่าน `apiFetch`/`buildApiRequestInit` ที่แนบ
   `Cookie: token=<token>` และ `credentials: 'include'`.
2. WHEN สร้าง request ดังกล่าว THEN request SHALL NOT มี header `Authorization`.
3. WHERE ยังไม่มี token (ยังไม่ล็อกอิน) THE Devices_Screen SHALL ไม่ส่ง request และ
   นำผู้ใช้กลับหน้า login (คงพฤติกรรมเดิม `router.replace('/')`).
4. WHEN Vitals_Batch_API ตอบ 2xx THEN ระบบ SHALL แจ้ง "บันทึกแล้ว" และเพิ่มตัวนับ saved.
5. WHEN Vitals_Batch_API ตอบไม่ใช่ 2xx THEN ระบบ SHALL แสดงข้อความผิดพลาดพร้อม status
   และ SHALL NOT ล้างค่าที่กรอก.

### Requirement 2 — ขอ runtime permission ก่อนสแกน BLE (Android)

**User Story:** ในฐานะเจ้าหน้าที่บน Android ฉันต้องการให้แอปขอสิทธิ์ Bluetooth ให้ถูกต้อง
เพื่อให้สแกนพบอุปกรณ์จริง.

#### Acceptance Criteria
1. WHEN ผู้ใช้กด "สแกนอุปกรณ์" บน Android API ≥ 31 THEN แอป SHALL ขอ
   `BLUETOOTH_SCAN` และ `BLUETOOTH_CONNECT` ผ่าน `PermissionsAndroid` ก่อนเริ่มสแกน.
2. WHEN ผู้ใช้กด "สแกนอุปกรณ์" บน Android API < 31 THEN แอป SHALL ขอ
   `ACCESS_FINE_LOCATION` ก่อนเริ่มสแกน.
3. IF ผู้ใช้ปฏิเสธสิทธิ์ที่จำเป็น THEN แอป SHALL ไม่เริ่มสแกน, SHALL แสดงข้อความอธิบาย,
   และ SHALL แสดง Manual_Entry ให้กรอกแทน.
4. WHERE platform เป็น iOS หรือ web THE flow SHALL ข้ามการขอ permission แบบ Android
   (iOS จัดการผ่าน Info.plist usage description ที่มีอยู่แล้ว).
5. WHEN สิทธิ์ทั้งหมดได้รับอนุญาต THEN แอป SHALL ดำเนินการต่อไปยังการตรวจ Adapter_State
   (Requirement 3).

### Requirement 3 — รอ Bluetooth adapter พร้อมก่อนสแกน

**User Story:** ในฐานะเจ้าหน้าที่ ฉันต้องการให้แอปแจ้งเตือนเมื่อ Bluetooth ปิด แทนที่จะ
สแกนล้มเหลวเงียบๆ.

#### Acceptance Criteria
1. WHEN จะเริ่มสแกน THEN แอป SHALL ตรวจ Adapter_State ผ่าน BLE_Manager ก่อน.
2. IF Adapter_State ไม่ใช่ `PoweredOn` THEN แอป SHALL ไม่เริ่มสแกน และ SHALL แจ้งผู้ใช้
   ให้เปิด Bluetooth.
3. WHEN Adapter_State เป็น `PoweredOn` THEN แอป SHALL เริ่ม `startDeviceScan` และหยุด
   อัตโนมัติภายใน 10 วินาที (คงพฤติกรรมเดิม).
4. WHEN ออกจากหน้าจอหรือยกเลิกสแกน THEN แอป SHALL ยกเลิก subscription/สแกนที่ค้างไว้
   (ไม่รั่ว).

### Requirement 4 — decode ค่า GATT โดยไม่พึ่ง Buffer

**User Story:** ในฐานะเจ้าหน้าที่ ฉันต้องการให้แอป decode ค่าจากอุปกรณ์ได้จริงบน React Native.

#### Acceptance Criteria
1. WHEN `parseGATT` แปลงค่า characteristic (base64) THEN การแปลงเป็น bytes SHALL ใช้
   ตัว decoder ที่ทำงานบน React Native ได้ (ไม่พึ่ง global `Buffer`).
2. WHEN decode สำเร็จสำหรับ service ที่รองรับ (thermometer / bloodPressure /
   pulseOximeter / weightScale / glucose) THEN SHALL คืน GATT_Reading ที่มี metric/
   unit/label/value ถูกต้องตามสูตรเดิม.
3. IF ค่าที่ได้ decode ไม่ได้หรือ service ไม่รู้จัก THEN SHALL คืน array ว่างโดยไม่ crash.

### Requirement 5 — รองรับ NOTIFY/INDICATE เมื่ออ่านค่าจากอุปกรณ์

**User Story:** ในฐานะเจ้าหน้าที่ ฉันต้องการให้แอปอ่านค่าจากอุปกรณ์การแพทย์ที่ส่งค่าแบบ
notify ได้ ไม่ใช่แค่ read.

#### Acceptance Criteria
1. WHEN เชื่อมต่ออุปกรณ์และ discover characteristics แล้ว THEN สำหรับ characteristic ที่
   เป็น Notifiable_Characteristic แอป SHALL subscribe (monitor) เพื่อรับค่า.
2. WHEN characteristic เป็น readable (ไม่ใช่ notify) THEN แอป SHALL ใช้ `read()` เหมือนเดิม.
3. WHEN ได้รับค่าที่ decode เป็น GATT_Reading ได้อย่างน้อย 1 ค่า THEN แอป SHALL หยุดรอ,
   แสดงค่าที่อ่านได้ และส่งไป Vitals_Batch_API ผ่าน Cookie_Auth.
4. IF ไม่ได้ค่าใดภายใน timeout (เช่น 15 วินาที) THEN แอป SHALL ยกเลิก monitor, แจ้งผู้ใช้
   ว่าอ่านค่าไม่ได้ และแสดง Manual_Entry.
5. WHEN จบการอ่าน (สำเร็จหรือ timeout) THEN แอป SHALL ยกเลิกการเชื่อมต่ออุปกรณ์และ
   subscription ทั้งหมด.

### Requirement 6 — คงความถูกต้องเดิม (regression guard)

#### Acceptance Criteria
1. THE Manual_Entry SHALL ใช้งานได้เสมอ ทุก platform (รวม iOS/web/Expo Go).
2. THE การเปลี่ยนแปลง SHALL อยู่ใน `moph-meet/` เท่านั้น และ SHALL NOT แก้ `core-lite/`
   หรือ `user-app-lite/`.
3. THE app icon (`icon.png`/`adaptive-icon`/mipmaps), login logo (`login-logo.png`),
   และ splash (`splashscreen_logo`) SHALL ไม่ถูกแก้จาก feature นี้.
4. WHEN รัน `npx tsc --noEmit` THEN SHALL ไม่มี type error ใหม่จากไฟล์ที่แก้.
