# Case 013 — LINE OA Notification (TOR 4.11.1)

**วันที่:** 2026-06-28  
**Branch:** delivery/update-Q2-26 (commit 7bba6e8)

## Symptom
ไม่มีการส่ง notification หมอพร้อม/LINE OA เมื่อสร้างห้อง ตาม TOR 4.11.1

## Fix

| ไฟล์ | สิ่งที่เพิ่ม |
|---|---|
| `core-lite/src/index.js` | `notifyLine(message)` helper ยิง LINE Messaging API push (push message ไปยัง `LINE_TARGET`) เรียก non-blocking; hook ใน `POST /api/rooms` + `POST /api/meet/reserved` |

## Behavior เมื่อยังไม่มี credentials
- ถ้าไม่ตั้ง `LINE_CHANNEL_TOKEN` / `LINE_TARGET` = log + skip สุภาพ ไม่ทำ room creation ล้ม/ช้า

## Deploy + Follow-ups
1. ตั้ง env `LINE_CHANNEL_TOKEN` (channel access token) + `LINE_TARGET` (userId หรือ groupId) ใน `.env` ของ core-lite
2. `pm2 reload core-lite`
3. ทดสอบ: สร้างห้อง → เช็ค LINE
