# 005 — Dashboard ต้องไม่แสดง PII (โชว์เฉพาะจำนวน)

วันที่: 2026-06-05

## ความต้องการ (Requirement)
ผู้ใช้: "แสดงเฉพาะจำนวนห้อง แต่ PII ไม่แสดงทั้งหมด"
หน้า Dashboard สถิติ (`/usage-logs`) + `/api/logs/*` เปิด public (ไม่มี auth) จึงต้องไม่รั่ว PII
(ชื่อหมอ ชื่อผู้ป่วย CID) ออกมาเลย

หมายเหตุ: คุยเรื่องล็อกเฉพาะ role admin ด้วย แต่เจอว่า ProviderID login = role `staff`
(เฉพาะ manual Admin/test ที่เป็น admin) — การล็อก admin-only จะทำให้ ProviderID user เข้าไม่ได้
ผู้ใช้จึงเลือกแนวทาง "ซ่อน PII" แทนการล็อก role

## Root cause (จุดที่ PII รั่ว)
- `core-lite/src/store/sqlite.js`:
  - `recent()` SELECT `doctor_name, patient_name, patient_cid, doctor_id`
  - `byDoctor()` SELECT `doctor_id, doctor_name` (ราย identity)
  - `longestRooms()` SELECT `room_name, doctor_name` (room_name อาจมีชื่อหมอ)
- endpoint ทั้งหมดยัง public

## Fix (ตัด PII ที่ query layer — กันที่ต้นทาง ไม่ใช่แค่ซ่อนใน UI)
- `recent()` → คืนแค่ event, ts, room_ref (id ตัด 6 ตัว), room_type, platform, province, region, duration
- `byDoctor()` → aggregate only: {doctors, rooms, admitted, invites} ไม่มี id/ชื่อ
- `longestRooms()` → ตัด room_name/doctor_name, คืน room_ref + type + area + duration
- `user-app-lite/public/usage-logs.html` → ตาราง longest-rooms ใช้ room_ref/ประเภท แทนชื่อ/ผู้สร้าง
- INSERT ยังเก็บข้อมูลเต็มในตาราง (ไม่ลบข้อมูล) — แค่ไม่ expose ผ่าน read API

## Verification (บน production)
- reload core-lite (restart 33→34, online)
- curl บน server: recent/by-doctor/longest-rooms ไม่มี doctor_name/patient_name/patient_cid/doctor_id
- Playwright สแกน 7 endpoint (summary, recent, by-doctor, longest-rooms, by-unit, by-region, by-platform): **PII leak = NONE**
- Dashboard ยังทำงาน: summary แสดง rooms 207,715

## Deploy
- push `core-lite/src/store/sqlite.js` + `user-app-lite/public/usage-logs.html` → `pm2 reload core-lite`
- ไม่แตะ DB, ไม่แตะ nginx

## Follow-ups / risks
- endpoint `/api/logs/*` ยัง public (ไม่ล็อก role) — ตอนนี้ปลอดภัยเพราะไม่มี PII แล้ว แต่ถ้าต้องการจำกัดการเข้าถึงจริงควรเพิ่ม auth ภายหลัง (ProviderID role เป็น staff ต้องปรับ role mapping ก่อน)
- ข้อมูลดิบ (ชื่อ/CID) ยังอยู่ในตาราง usage_logs — เข้าถึงได้เฉพาะระดับ DB/server ไม่ผ่าน API
