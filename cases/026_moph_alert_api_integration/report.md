# Case 026: MOPH Alert API integration แบบตั้งค่าได้

## สิ่งที่ทำ

- เพิ่ม `core-lite/src/moph-alert.js` เป็น client สำหรับ MOPH Alert API โดยแยกจาก LINE Messaging API
- ขอ JWT จาก MOPH Account Center แล้ว cache ตามอายุ token
- ส่งข้อความทันทีด้วย endpoint `POST /api/v2/send-message/send-now` ตาม spec
- ไม่บันทึก CID, password hash หรือ access token ลง log หรือฐานข้อมูล
- แจ้ง MOPH Alert เมื่อสร้างห้องประชุม (CID ผู้รับจาก config) และเมื่อเจ้าหน้าที่ที่ยืนยันตัวตนสร้างคำเชิญผู้ป่วย

## Configuration

ตัวอย่างอยู่ที่ `core-lite/.env.example`

- `MOPH_ALERT_ENABLED=true`
- `MOPH_ALERT_USERNAME`
- `MOPH_ALERT_PASSWORD_HASH`
- `MOPH_ALERT_HOSPITAL_CODE`
- `MOPH_ALERT_TOKEN_URL` และ `MOPH_ALERT_API_BASE_URL` มีค่า production ตามคู่มือเป็นค่าเริ่มต้น
- `MOPH_ALERT_RECIPIENT_CIDS` เป็น CID คั่นด้วย comma สำหรับรับแจ้งเมื่อสร้างห้องประชุม

## มาตรการความปลอดภัย

ไม่เปิดให้ endpoint compatibility `/api/meet/reserved/token` ส่ง MOPH Alert เพราะ endpoint นี้ยังไม่มี authentication; การส่งจากจุดนี้อาจถูกนำไปใช้แจ้งเตือนถึง CID ที่ไม่ได้รับอนุญาต

## การตรวจสอบ

- `node --check src/moph-alert.js` และ `node --check src/index.js` ผ่าน
- `git diff --check` ผ่าน
- mock test ยืนยันว่า client ขอ token หนึ่งครั้ง, ส่งข้อความสองครั้งโดยใช้ token cache และ payload มี `datas` + `messages`
- test แบบปิด config ยืนยันว่าไม่เกิด network request
