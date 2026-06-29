# Case 009 — HIS Export API (TOR 4.7 + 4.10.7)

**วันที่:** 2026-06-28  
**Branch:** delivery/update-Q2-26 (commit 8d834c6)

## Symptom
ไม่มี endpoint ส่งออกข้อมูลการตรวจ (vitals + ห้อง) ไปยัง HIS ตาม TOR 4.7 และ 4.10.7

## Root cause
`core-lite` ไม่มี `/api/his/export` มาก่อน

## Fix

| ไฟล์ | สิ่งที่เพิ่ม |
|---|---|
| `core-lite/src/index.js` | `POST /api/his/export { roomId }` → รวบ vitals + ข้อมูลห้อง → POST ไป `HIS_ENDPOINT` (env, default `http://localhost:3501/` = demo-his); log event `his_exported`; ไม่ทำ room flow พัง |
| `core-lite/docs/openapi.yaml` | เพิ่ม tag `HIS` + path `/api/his/export` พร้อม schema |
| `tests/core-lite/test_api.py` | `TestHisExport` 5 เคส (missing roomId, room not found, no vitals, with vitals, no auth) |

**Non-blocking:** ถ้า HIS ล้ม → ตอบ 502 แต่ไม่ทำ core พัง; log ผลทุกครั้ง  
**Schema:** field map ตาม สธ HL7-FHIR-lite เบื้องต้น + comment บอกว่าปรับได้ตามที่ สธ กำหนดในภายหลัง

## Verification
- Syntax check ผ่าน `node --check`
- `TestHisExport` 5 เคสเพิ่มแล้ว
- ทดสอบกับ `demo-his` ได้โดยรัน `node demo-his/index.js` (port 3501) แล้วเรียก export

## Deploy
`pm2 reload core-lite` — ไม่มี DB migration (ใช้ `usage_logs` เดิมสำหรับ log)

## Follow-ups
- ตกลง schema ชุดข้อมูลการรักษาที่แน่นอนกับ สธ แล้วอัปเดต `payload` ใน endpoint
- เพิ่ม field `hcode` และ `patientId` ตอนที่สธ กำหนด
