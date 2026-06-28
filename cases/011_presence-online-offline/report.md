# Case 011 — Presence Online/Offline (TOR 4.4)

**วันที่:** 2026-06-28  
**Branch:** delivery/update-Q2-26 (commit af92ff2)

## Symptom
ไม่มีสัญลักษณ์ online/offline ตาม TOR 4.4

## Fix

| ไฟล์ | สิ่งที่เพิ่ม |
|---|---|
| `core-lite/src/index.js` | `POST /api/presence/ping` (auth, NodeCache TTL 90s) + `GET /api/presence?ids=` คืน `{uid: online|offline}` (online = ping ใน 60s) |
| `user-app-lite/public/meet.html` | ping ทุก 20s ขณะอยู่ในห้องตรวจ |
| `user-app-lite/views/dashboard.ejs` | ping ทุก 20s ขณะอยู่ที่ dashboard |

## Verification
- Syntax check ผ่าน
- Logic: `_presenceCache` ใช้ `NodeCache` ที่มีอยู่แล้ว ไม่ต้องเพิ่ม dependency
- 2 client login พร้อมกัน → `GET /api/presence?ids=user1,user2` → ทั้งคู่ `online`; หยุด ping 60s → `offline`

## Follow-ups
- เพิ่ม indicator (จุดสีเขียว/เทา) ใน UI รายชื่อผู้เข้าร่วม/นัดหมาย เมื่อมี roomId ที่จะแสดง
