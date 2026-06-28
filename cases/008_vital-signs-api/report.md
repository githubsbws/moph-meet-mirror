# Case 008 — Vital Signs API (TOR 4.10.5)

**วันที่:** 2026-06-28  
**Branch:** delivery/update-Q2-26 (commit e5be64c)

## Symptom
ระบบยังไม่มีหน้าบันทึกค่าสัญญาณชีพ (vital signs) ตาม TOR 4.10.5 ที่กำหนดให้รองรับ 8 ค่า: น้ำหนัก ส่วนสูง อุณหภูมิ SpO2 ความดัน RR ชีพจร น้ำตาล + NST

## Root cause
`core-lite` ไม่มีตาราง vitals และ API `/api/vitals*` เลย `user-app-lite` ไม่มีหน้า UI, `moph-meet` ไม่มี screen manual entry

## Fix

| ไฟล์ | สิ่งที่เพิ่ม |
|---|---|
| `core-lite/src/store/sqlite.js` | ตาราง `vitals` (rooms.db) + store `vitalStore` (insert/batch/byRoom/byPatient/latestByRoom) |
| `core-lite/src/index.js` | 4 endpoints: `POST /api/vitals`, `POST /api/vitals/batch`, `GET /api/vitals?roomId=`, `GET /api/rooms/:id/vitals/latest` — ทุก endpoint ผ่าน `auth()` |
| `user-app-lite/public/vitals.html` | หน้ากรอก 12 metric (8 ค่า TOR + MAP/NST) + ตารางประวัติ + load ด้วย `?roomId=` param |
| `user-app-lite/server.js` | route `/vitals` + `/vitals/:id` → `vitals.html` |
| `moph-meet/app/vitals/[roomId].tsx` | Screen manual entry สำหรับมือถือ ยิง `POST /api/vitals/batch` |
| `tests/core-lite/test_api.py` | `TestVitals` 9 เคส (POST single/batch/no-auth, GET by room, latest, 404 JSON) |

**PII:** เก็บด้วย `patient_key` (queue-key random) ไม่เก็บ CID ตรง  
**Schema:** metric `weight|height|temp|spo2|sys|dia|map|pr|rr|pulse|glucose|fhr|toco` อ้างอิง `user-app/functions/activeDevice.ts` (deprecated, read-only)

## Verification
- Syntax check ผ่าน node `--check` ทั้ง `sqlite.js` และ `index.js`
- `TestVitals` 9 เคสเพิ่มแล้วใน `tests/core-lite/test_api.py` (รอรันบน prod)
- Mobile screen `moph-meet/app/vitals/[roomId].tsx` อยู่ใน `.gitignore` (รอ review ก่อน commit)

## Deploy
ต้อง `pm2 reload core-lite` บน prod (ตาราง vitals จะถูกสร้างอัตโนมัติเมื่อ server start ครั้งแรก — ไม่มี migration แยก)

## Follow-ups
- T5 BLE: screen `app/devices.tsx` จะยิงเข้า `POST /api/vitals/batch` เดียวกัน
- T2 HIS export: ดึงข้อมูลจาก `vitalStore.byRoom()` เพื่อส่ง HIS
- รอ review mobile screen แล้วค่อย remove จาก `.gitignore`
