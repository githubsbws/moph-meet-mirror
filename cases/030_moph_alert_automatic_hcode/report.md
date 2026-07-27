# Case 030: ใช้ H-Code ของห้องอัตโนมัติกับ MOPH Alert

## ข้อสรุป

`hospital_code` ใน MOPH Alert คือ H-Code ที่มีอยู่แล้วในข้อมูลผู้สร้างห้อง (`room.ownerHcode`) จึงไม่ต้องมี `MOPH_ALERT_HOSPITAL_CODE` หรือ config ราย H-Code เพิ่ม

## การแก้ไข

- ยกเลิก registry credential ราย H-Code, storage table, Admin API และ master encryption key ที่เพิ่มไว้ใน Case 029
- คืนเป็น credential MOPH Alert ของระบบกลางหนึ่งชุดใน ENV:
  - `MOPH_ALERT_ENABLED`
  - `MOPH_ALERT_USERNAME`
  - `MOPH_ALERT_PASSWORD_HASH`
  - `MOPH_ALERT_TOKEN_URL`
  - `MOPH_ALERT_API_BASE_URL`
- ทุกครั้งที่ส่ง ระบบใช้ `room.ownerHcode` เป็น `hospital_code` ตอนขอ JWT
- cache JWT แยกตาม H-Code เพื่อไม่ใช้ token ของ H-Code หนึ่งกับอีก H-Code
- CID ผู้ป่วยยังมาจาก invitation ที่ผ่าน validation; ไม่มี CID recipient คงที่ใน ENV

## ข้อจำกัดที่เปิดเผย

ห้องประชุมที่ไม่มี CID ผู้รับจะไม่สามารถส่ง MOPH Alert รายบุคคลได้ เพราะ API ต้องมี CID ปลายทาง การเชิญผู้ป่วยห้องตรวจส่งได้จาก CID ที่มีอยู่แล้ว

## การตรวจสอบ

- `node --check` สำหรับ core API, MOPH client, storage และ web server ผ่าน
- `git diff --check` ผ่าน
- mock test ยืนยันว่า H-Code `12345` และ `54321` ถูกส่งเป็น `hospital_code` ของการขอ tokenคนละรายการ และ token cache แยกตาม H-Code
