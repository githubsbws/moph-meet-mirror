# Case 028: ประเมินขอบเขตระบบกลางหลายโรงพยาบาล

## ข้อสรุป

ในระดับผลิตภัณฑ์ ระบบนี้ถูกออกแบบให้เป็น API กลางที่รองรับหลายโรงพยาบาล/หลายหน่วยบริการ แต่ core-lite ปัจจุบันยังไม่มี multi-tenant configuration และ data isolation ครบทุก resource

## หลักฐานว่าเป็นระบบกลางหลายโรงพยาบาล

- README เรียก `core-lite` ว่า API กลางของ MOPH Meet
- รองรับค้นหาหน่วยบริการด้วยชื่อ/H-Code/จังหวัด และเลือกผู้เข้าร่วมหลายหน่วยบริการ
- ห้องมี `ownerHcode`; provider directory และ usage logs เก็บ H-Code
- Dashboard ของ admin ดูข้อมูลรวม และผู้ใช้ทั่วไปถูก scope ด้วย H-Code
- มีสถิติตามเขตสุขภาพ จังหวัด และ Top หน่วยบริการ

## ข้อจำกัดของ implementation ปัจจุบัน

- deployment เอกสารหลักเป็น core service เดียวและ SQLite; ไม่มี tenant table หรือ credential registry ราย H-Code
- room store ไม่มี query-level H-Code isolation; การเข้าถึงห้องใช้ owner/invitation เป็นหลัก
- endpoint compatibility HIS บางตัวรับ H-Code จาก body โดยไม่มี integration authentication
- MOPH Alert config ที่เพิ่มเป็น ENV ชุดเดียว จึงมี identity ผู้ส่งเพียงโรงพยาบาลเดียว

## ผลต่อ MOPH Alert

จึงไม่ควรใช้ config global หนึ่งชุดกับทุกห้อง หากใช้ deployment กลาง ต้องเพิ่ม config ที่ผูกกับ H-Code และเลือก credential ตาม `room.ownerHcode`; ถ้าเลือกติดตั้งแยกต่อโรงพยาบาลจึงใช้ ENV ชุดเดียวได้พร้อม validation H-Code
