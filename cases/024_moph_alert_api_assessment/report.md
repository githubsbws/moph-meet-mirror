# Case 024: ตรวจสอบความหมาย MOPH Alert

## ข้อสรุป

MOPH Alert เป็น API/บริการแยกของแพลตฟอร์มหมอพร้อม ไม่ใช่ LINE Messaging API ของ LINE OA ทั่วไป แม้ข้อความจะไปถึงประชาชนผ่าน LINE OA หมอพร้อมหรือแอปหมอพร้อมได้

## สภาพโค้ดปัจจุบัน

`core-lite/src/index.js` เรียก LINE Messaging API โดยใช้ `LINE_CHANNEL_TOKEN` และ `LINE_TARGET` เพื่อ push ไปยังปลายทางเดียว จึงไม่ถือว่าเชื่อม MOPH Alert ตาม requirement 3.1

## สิ่งที่ต้องมีหากจะเชื่อม MOPH Alert

- สิทธิ์ `MOPH_Alert_API` และบัญชีที่ยืนยัน MOPH Digital ID
- credential เพื่อขอ JWT จาก MOPH Account Center พร้อม hospital code
- CID ของผู้รับ และ payload ข้อความตามมาตรฐาน LINE Flex Message
- เรียก API ส่งทันที หรือ upload CID/message สำหรับการส่งจำนวนมาก

## แหล่งยืนยัน

- หน้า MOPH Alert ของหมอพร้อมระบุว่าเป็นระบบ Alerting สำหรับนักพัฒนาและมีคู่มือ API
- คู่มือ API MOPH Alert (ปรับปรุง 30 สิงหาคม 2567) ระบุขั้นตอนขอสิทธิ์, JWT, CID และ endpoint ส่งข้อความ

## ผลต่อการดำเนินงาน

ต้องเปลี่ยน integration จาก LINE push แบบเดิมเป็น MOPH Alert adapter เมื่อได้รับสิทธิ์และ credential; ไม่ควรเดา token หรือ endpoint production เอง
