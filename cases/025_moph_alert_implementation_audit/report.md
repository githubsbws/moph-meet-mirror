# Case 025: ตรวจสอบการมีอยู่ของ MOPH Alert API ในโครงการ

## ผลตรวจ

ไม่พบการเรียก MOPH Alert API ใน source code หรือประวัติ Git ของโครงการ

## สิ่งที่พบ

- `core-lite/src/index.js` มี `notifyLine()` ซึ่งเรียก `https://api.line.me/v2/bot/message/push`
- ใช้ environment variable `LINE_CHANNEL_TOKEN` และ `LINE_TARGET`
- การแจ้งเตือนถูกเรียกตอนสร้างห้องประชุมและจองห้องตรวจ

## สิ่งที่ไม่พบ

- การขอ JWT จาก MOPH Account Center
- endpoint MOPH Alert เช่น `morpromt2c.moph.go.th` หรือ `send-message/send-now`
- สิทธิ์ `MOPH_Alert_API`, hospital code หรือ payload ส่งถึง CID
- commit เดิมที่เพิ่มข้อความหรือ endpoint ของ MOPH Alert

## ข้อสรุป

ระบบปัจจุบันมี LINE OA push notification เท่านั้น และยังไม่เคยทำ MOPH Alert integration จริง
