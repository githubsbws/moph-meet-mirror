# Case 027: ตรวจสอบขอบเขต H-Code ของ MOPH Alert

## ข้อค้นพบ

โค้ดปัจจุบันอ่าน `MOPH_ALERT_HOSPITAL_CODE` และ credential หนึ่งชุดตอนเริ่ม process แล้วใช้ชุดเดียวกับทุกการส่ง MOPH Alert แต่ห้องในแอปรองรับ `ownerHcode` ตามผู้สร้างห้อง

## ผลกระทบ

- หาก deployment รองรับหลาย H-Code การแจ้งเตือนทุกห้องจะถูกส่งภายใต้ identity ของ hospital code ใน ENV เดียว
- ไม่มีการตรวจว่า `room.ownerHcode` ตรงกับ `MOPH_ALERT_HOSPITAL_CODE`
- `MOPH_ALERT_RECIPIENT_CIDS` เหมาะเพียงรายชื่อรับแจ้งปฏิบัติการของหน่วยบริการเดียว ไม่ใช่รายชื่อผู้ร่วมประชุมตามข้อมูลในแอป
- การเชิญผู้ป่วยใช้ CID ที่กรอกใน request ได้ถูกทิศทางกว่า แต่ยังส่งภายใต้ credential global

## ข้อสรุปเชิงสถาปัตยกรรม

1. **ติดตั้งแยกโรงพยาบาล:** ENV ชุดเดียวใช้ได้ แต่ต้อง validate ให้ H-Code ห้องตรงกับ hospital code ที่ตั้งไว้
2. **ระบบกลางหลายโรงพยาบาล:** ต้องมี registry credential แบบเข้ารหัสที่ผูก `hcode -> MOPH Alert account/config` แล้วเลือก client ตาม `room.ownerHcode`; ห้ามเก็บ credential หลายโรงพยาบาลเป็น ENV แบน ๆ

## สิ่งที่ยังไม่มีในแอป

- mapping Provider ID/ผู้ร่วมประชุมไปยัง CID ที่มีสิทธิส่ง MOPH Alert
- ข้อมูล credential ราย H-Code และหน้าจัดการโดย admin
- กติกายืนยันว่า H-Code ที่มาจาก ProviderID ใช้เป็น `hospital_code` ของ MOPH Account Center ได้โดยตรง

## หลักฐานจาก API

คู่มือ MOPH Alert ระบุว่าการขอ JWT ต้องส่ง `hospital_code` พร้อม user และ password hash และ API ส่งข้อความใช้ JWT ดังกล่าว ดังนั้น hospital code เป็น identity ของหน่วยบริการผู้ส่ง ไม่ใช่เพียง filter ฝั่ง UI
