# Case 029: MOPH Alert config ราย H-Code สำหรับระบบกลาง

> ถูกแทนที่โดย Case 030: หลังทบทวนพบว่า `hospital_code` คือ H-Code ที่มีอยู่ในห้องแล้ว จึงไม่ควรสร้าง credential/config ราย H-Code หากระบบใช้บัญชี MOPH Alert กลาง

## ผลลัพธ์

เปลี่ยน MOPH Alert จาก credential global ใน ENV เป็น config ราย H-Code ที่เลือกจาก `room.ownerHcode` ทุกครั้งที่ส่ง

## การเปลี่ยนแปลง

- เพิ่ม `moph_alert_configs` ใน memory, SQLite และ PostgreSQL store
- credential, password hash, token URL, API base URL และ CID ผู้รับถูกเข้ารหัส AES-256-GCM ก่อนบันทึก
- เก็บ master key เฉพาะ `MOPH_ALERT_CONFIG_ENCRYPTION_KEY` ใน ENV; ไม่มี credential โรงพยาบาลใน ENV
- เพิ่ม Admin API:
  - `GET /api/admin/moph-alert-configs`
  - `PUT /api/admin/moph-alert-configs/:hcode`
  - `DELETE /api/admin/moph-alert-configs/:hcode`
- API ตอบกลับเฉพาะ metadata: H-Code, enabled, hospital code, จำนวนผู้รับ และเวลาแก้ไข
- การสร้างห้องประชุมเลือก CID ผู้รับจาก config H-Code นั้น; การเชิญผู้ป่วยใช้ CID ผู้ป่วย แต่ยังเลือก credential ตาม H-Code เจ้าของห้อง
- หากไม่มี config, H-Code ห้อง หรือ master key จะไม่ส่ง และไม่ fallback ไปใช้ credential ของโรงพยาบาลอื่น
- เพิ่ม proxy ใน web app เพื่อให้ Admin ใช้ Admin API ผ่าน session cookie ได้

## ข้อจำกัดด้านความปลอดภัย

endpoint compatibility สำหรับ HIS ที่ยังไม่มี authentication ยังคงไม่สั่งส่ง MOPH Alert เพื่อป้องกันการส่งข้อความถึง CID โดยผู้เรียกที่ไม่ได้รับอนุญาต

## การตรวจสอบ

- syntax check สำหรับ API, encryption vault และ store ทั้งสามผ่าน
- `git diff --check` ผ่าน
- mock test MOPH client ผ่าน: ขอ JWT และส่ง `datas`/`messages`
- encryption test ผ่าน: secret ไม่ปรากฏใน ciphertext หรือ API-safe representation
- SQLite temp-store test ผ่าน
- memory-server smoke test ผ่าน: Admin บันทึก/อ่าน config H-Code ได้ และผลลัพธ์ไม่เปิดเผย username, password hash หรือ CID
