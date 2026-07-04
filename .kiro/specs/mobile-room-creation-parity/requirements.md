# Requirements Document

## Introduction

แอป **MOPH Meet mobile** (`moph-meet/`) สร้าง **ห้องตรวจ (exam room)** และ
**ห้องประชุม (meeting room)** ด้วย flow ที่ "ยังไม่เหมือน version web" — ปัจจุบัน
mobile กดปุ่มแล้ว `POST /api/rooms` ทันทีโดยส่งเพียง `{ type }` ไม่มีการเก็บ
วันเวลานัดหมาย ไม่มีฟอร์มก่อนสร้าง และไม่แสดงลิงก์ผลลัพธ์ให้คัดลอก/แชร์เหมือนเว็บ

เป้าหมายของ feature นี้คือปรับ flow การสร้างห้องบน mobile ให้ **parity กับเว็บ**
(`user-app-lite/`) ซึ่งเป็น source of truth: เก็บ วันที่/เวลาเริ่ม/เวลาสิ้นสุด
ผ่านฟอร์มก่อนสร้าง, ส่งค่าเดียวกันไปที่ `POST /api/rooms`, และแสดง result panel
พร้อมลิงก์เข้าห้อง (meet) / ลิงก์คิวผู้ป่วย (exam) ที่คัดลอก/แชร์ได้

### Scope และขอบเขต (ตาม steering `lite-only.md` + `mobile-app.md`)

- การเปลี่ยนแปลงฝั่ง client ทั้งหมดอยู่ใน `moph-meet/` เท่านั้น (ไฟล์หลัก:
  `app/dashboard.tsx`, `app/doctor/[id].tsx`, `app/meet/[id].tsx`,
  `app/exam/[id].tsx`, `constants/api.ts`).
- **ห้าม**ย้าย business logic เข้ามาในแอป — `core-lite/` เป็นเจ้าของ `/api/*`
  จริง และ `user-app-lite/` เป็น proxy เท่านั้น.
- **Cookie auth ไม่ใช่ Bearer** — คงการส่ง token ผ่าน `Cookie: token=...` +
  `credentials: 'include'` (case-016 fix) ห้าม regress.
- Backend `POST /api/rooms` ปัจจุบัน**รองรับ** `starttime`/`endtime` แบบ optional
  อยู่แล้ว → parity หลักทำได้โดย**ไม่ต้อง**แก้ backend. ส่วนที่ต้องพึ่ง backend
  (การระบุ platform ของห้องที่สร้างจาก mobile) ถูกแยกเป็น Requirement ที่ทำ
  เครื่องหมายว่าเป็น **dependency บน core-lite** อย่างชัดเจน (ดู Requirement 9).

## Glossary

- **Mobile_App**: แอป MOPH Meet (Expo / React Native) ในโฟลเดอร์ `moph-meet/`.
- **Web_App**: เว็บ `user-app-lite/` ที่เป็น source of truth ของ flow การสร้างห้อง.
- **Proxy**: `user-app-lite/` server.js ที่ forward `/api/*` ไปยัง Core_API และอ่าน token จาก cookie.
- **Core_API**: `core-lite/` ที่เป็นเจ้าของ endpoint จริง `/api/*` รวมถึง `POST /api/rooms`.
- **Exam_Room**: ห้องตรวจโรคทางไกล (`type = "exam"`) มีคิวผู้ป่วยและบันทึกวิดีโออัตโนมัติ.
- **Meeting_Room**: ห้องประชุม (`type = "meet"`) สำหรับประชุมทั่วไป ผู้เข้าร่วมต้องล็อกอินด้วย Provider ID.
- **Create_Room_Form**: ฟอร์มบน Mobile_App ที่เก็บ วันที่/เวลาเริ่ม/เวลาสิ้นสุด ก่อนสร้างห้อง (parity กับ modal บนเว็บ).
- **Room_Result_Panel**: ส่วนแสดงผลหลังสร้างห้องสำเร็จ แสดงชื่อห้องและลิงก์ที่เกี่ยวข้อง.
- **Patient_Join_Link**: ลิงก์คิวสำหรับผู้ป่วยของ Exam_Room (JWT ไม่มีวันหมดอายุ) จาก field `patientJoinUrl`.
- **Meet_Join_Link**: ลิงก์เข้าห้องของ Meeting_Room (ต้องล็อกอินด้วย Provider ID) จาก field `meetJoinUrl`.
- **Start_Datetime**: ค่าเวลาเริ่มที่ส่งเป็น string รูปแบบ `YYYY-MM-DDTHH:mm:00` (local, ไม่มี timezone suffix) — ตรงกับที่เว็บสร้าง.
- **End_Datetime**: ค่าเวลาสิ้นสุด รูปแบบเดียวกับ Start_Datetime.
- **Session_Token**: token ของผู้ใช้ที่ล็อกอินแล้ว ใช้ยืนยันตัวตนผ่าน Cookie header.

## Requirements

### Requirement 1: สร้างห้องตรวจบน Mobile ให้ parity กับเว็บ

**User Story:** ในฐานะแพทย์ที่ใช้แอปมือถือ ฉันต้องการสร้างห้องตรวจโดยระบุวันที่และ
ช่วงเวลานัดหมายได้เหมือนบนเว็บ เพื่อให้ห้องตรวจที่สร้างจากมือถือมีข้อมูลนัดหมายครบเท่ากับเว็บ

#### Acceptance Criteria

1. WHEN ผู้ใช้เลือกสร้างห้องตรวจบน Mobile_App, THE Mobile_App SHALL แสดง Create_Room_Form ที่มีช่อง วันที่, เวลาเริ่ม และ เวลาสิ้นสุด ก่อนส่งคำขอสร้างห้อง
2. WHERE ช่องวันที่ยังไม่มีค่า, THE Mobile_App SHALL กำหนดค่าเริ่มต้นของช่องวันที่เป็นวันปัจจุบัน (ตรงกับพฤติกรรมเว็บ)
3. WHEN ผู้ใช้ยืนยันการสร้างห้องตรวจด้วยค่าที่ครบถ้วน, THE Mobile_App SHALL ส่ง `POST /api/rooms` โดยมี body ที่ประกอบด้วย `type = "exam"`, `starttime` เท่ากับ Start_Datetime และ `endtime` เท่ากับ End_Datetime
4. THE Mobile_App SHALL สร้าง Start_Datetime และ End_Datetime ในรูปแบบ `YYYY-MM-DDTHH:mm:00` โดยรวมค่าวันที่กับค่าเวลาที่ผู้ใช้กรอก ให้ตรงกับรูปแบบที่ Web_App ส่ง
5. WHEN Core_API ตอบสำเร็จสำหรับการสร้างห้องตรวจ, THE Mobile_App SHALL แสดง Room_Result_Panel ที่สามารถแสดงข้อมูลห้อง (ชื่อห้อง `room.name` และ Patient_Join_Link) เมื่อมีค่าดังกล่าว
6. WHERE Core_API ตอบกลับพร้อม `patientJoinUrl` แบบ relative path, THE Mobile_App SHALL แปลง Patient_Join_Link ให้เป็น URL เต็มโดยเติม `API_BASE` เป็น prefix

### Requirement 2: สร้างห้องประชุมบน Mobile ให้ parity กับเว็บ

**User Story:** ในฐานะผู้ใช้แอปมือถือ ฉันต้องการสร้างห้องประชุมโดยระบุวันที่และ
ช่วงเวลาได้เหมือนบนเว็บ และได้รับลิงก์เข้าห้องเพื่อแชร์ให้ผู้เข้าร่วม

#### Acceptance Criteria

1. WHEN ผู้ใช้เลือกสร้างห้องประชุมบน Mobile_App, THE Mobile_App SHALL แสดง Create_Room_Form ที่มีช่อง วันที่, เวลาเริ่ม และ เวลาสิ้นสุด ก่อนส่งคำขอสร้างห้อง
2. WHEN ผู้ใช้ยืนยันการสร้างห้องประชุมด้วยค่าที่ครบถ้วน, THE Mobile_App SHALL ส่ง `POST /api/rooms` โดยมี body ที่ประกอบด้วย `type = "meet"`, `starttime` เท่ากับ Start_Datetime และ `endtime` เท่ากับ End_Datetime
3. WHEN Core_API ตอบสำเร็จสำหรับการสร้างห้องประชุม, THE Mobile_App SHALL แสดง Room_Result_Panel ที่มีชื่อห้อง (`room.name`) และ Meet_Join_Link; IF การตอบกลับที่สำเร็จไม่มีชื่อห้องหรือ Meet_Join_Link, THEN THE Mobile_App SHALL แสดง Room_Result_Panel ตามข้อมูลที่มีอยู่ (empty result panel) โดยไม่เข้าสู่สถานะข้อผิดพลาดหรือบังคับให้ลองใหม่
4. WHERE Core_API ตอบกลับพร้อม `meetJoinUrl` แบบ relative path, THE Mobile_App SHALL แปลง Meet_Join_Link ให้เป็น URL เต็มโดยเติม `API_BASE` เป็น prefix
5. THE Mobile_App SHALL แสดงข้อความกำกับว่าผู้เข้าร่วมห้องประชุมต้องล็อกอินด้วย Provider ID (ตรงกับข้อความบนเว็บ) โดยข้อความดังกล่าว SHALL สามารถแสดงแบบถาวรใน UI ของ Mobile_App ได้ ไม่จำกัดเฉพาะระหว่าง flow การสร้างห้อง

### Requirement 3: การแสดง Create_Room_Form และข้อความกำกับ

**User Story:** ในฐานะผู้ใช้แอปมือถือ ฉันต้องการเห็นฟอร์มและคำอธิบายเดียวกับเว็บ
ก่อนสร้างห้อง เพื่อเข้าใจว่าห้องที่สร้างจะมีพฤติกรรมอย่างไร

#### Acceptance Criteria

1. WHILE Create_Room_Form ของห้องตรวจแสดงอยู่, THE Mobile_App SHALL แสดงข้อความกำกับว่าชื่อห้องถูกสร้างอัตโนมัติและระบบจะบันทึกวิดีโออัตโนมัติ
2. WHILE Create_Room_Form ของห้องประชุมแสดงอยู่, THE Mobile_App SHALL แสดงข้อความกำกับว่าชื่อห้องถูกสร้างอัตโนมัติและผู้เข้าร่วมต้องล็อกอินด้วย Provider ID
3. THE Mobile_App SHALL ทำเครื่องหมายช่อง วันที่, เวลาเริ่ม และ เวลาสิ้นสุด ว่าเป็นช่องที่ต้องกรอก (required); IF การทำเครื่องหมายช่องที่ต้องกรอกไม่ทำงาน, THEN THE Mobile_App SHALL ยังอนุญาตให้ส่งฟอร์มได้ โดยไม่บล็อกการส่งเพียงเพราะไม่มีการทำเครื่องหมาย required (การตรวจสอบค่าจริงตาม Requirement 4 ยังคงมีผลบังคับ)
4. WHEN ผู้ใช้ยกเลิก Create_Room_Form, THE Mobile_App SHALL ปิดฟอร์มโดยไม่ส่งคำขอสร้างห้อง

### Requirement 4: การตรวจสอบความถูกต้องของข้อมูลก่อนสร้าง

**User Story:** ในฐานะผู้ใช้แอปมือถือ ฉันต้องการให้แอปตรวจสอบข้อมูลนัดหมายก่อนส่ง
เพื่อไม่ให้สร้างห้องด้วยข้อมูลที่ไม่ถูกต้อง

#### Acceptance Criteria

1. IF ช่องวันที่ หรือ เวลาเริ่ม หรือ เวลาสิ้นสุด ช่องใดช่องหนึ่งว่างเมื่อผู้ใช้กดยืนยัน, THEN THE Mobile_App SHALL แสดงข้อความแจ้งเตือน และด้วยเหตุนั้น SHALL ระงับ (ระงับ) การส่ง `POST /api/rooms` โดยการระงับคำขอเป็นผลจากการตรวจสอบที่ไม่ผ่านและเกิดขึ้นพร้อมกัน
2. IF End_Datetime อยู่ก่อน Start_Datetime เมื่อผู้ใช้กดยืนยัน, THEN THE Mobile_App SHALL แสดงข้อความแจ้งเตือนและระงับการส่ง `POST /api/rooms`
3. WHILE คำขอสร้างห้องกำลังดำเนินการอยู่, THE Mobile_App SHALL ปิดการทำงานของปุ่มยืนยันเพื่อป้องกันการส่งซ้ำ

### Requirement 5: Room_Result_Panel และการคัดลอก/แชร์ลิงก์

**User Story:** ในฐานะผู้ใช้แอปมือถือ ฉันต้องการคัดลอกหรือแชร์ลิงก์ห้องหลังสร้างเสร็จ
เพื่อส่งให้ผู้ป่วยหรือผู้เข้าร่วมได้ เหมือนปุ่มคัดลอกบนเว็บ

#### Acceptance Criteria

1. WHEN Room_Result_Panel แสดงลิงก์ (Patient_Join_Link หรือ Meet_Join_Link), THE Mobile_App SHALL แสดงตัวควบคุมสำหรับคัดลอกหรือแชร์ลิงก์นั้น
2. WHEN ผู้ใช้เลือกคัดลอกลิงก์, THE Mobile_App SHALL คัดลอกค่าลิงก์เต็มไปยัง clipboard
3. WHERE ห้องที่สร้างเป็นห้องตรวจ AND การนำทางไปยัง (`/doctor/{roomId}`) พร้อมใช้งาน, THE Mobile_App SHALL แสดงปุ่ม "เข้าห้องตรวจ" ใน Room_Result_Panel ที่นำผู้ใช้ไปยังหน้าควบคุมห้องตรวจของแพทย์ (`/doctor/{roomId}`) และ SHALL ปิดการทำงานหรือซ่อนตัวเลือกการนำทางเข้าห้องประชุม (การนำทางห้องตรวจและห้องประชุมเป็น mutually exclusive ตามชนิดห้อง)
4. WHERE ห้องที่สร้างเป็นห้องประชุม, THE Mobile_App SHALL แสดงตัวเลือกเข้าห้องประชุมที่นำผู้ใช้ไปยัง (`/meet/{roomId}`)

### Requirement 6: การจัดการข้อผิดพลาดและการยืนยันตัวตน

**User Story:** ในฐานะผู้ใช้แอปมือถือ ฉันต้องการเห็นข้อความที่ชัดเจนเมื่อสร้างห้อง
ไม่สำเร็จ และให้ระบบจัดการ session หมดอายุอย่างถูกต้อง

#### Acceptance Criteria

1. THE Mobile_App SHALL ส่ง Session_Token ในคำขอ `POST /api/rooms` ผ่าน header `Cookie: token=<Session_Token>` พร้อม `credentials: 'include'` และ SHALL ไม่ตั้ง header `Authorization`
2. IF Core_API ตอบกลับด้วยสถานะ 401 ระหว่างสร้างห้อง, THEN THE Mobile_App SHALL ล้างข้อมูลการล็อกอินและนำผู้ใช้กลับไปหน้าเข้าสู่ระบบ
3. IF Core_API ตอบกลับด้วยสถานะที่ไม่สำเร็จอื่นระหว่างสร้างห้อง, THEN THE Mobile_App SHALL แสดงข้อความแจ้งเตือนที่ระบุความล้มเหลวในการสร้างห้อง
4. IF การตอบกลับที่สำเร็จไม่มีรหัสห้อง (`room.id`), THEN THE Mobile_App SHALL แสดงข้อความแจ้งเตือนว่าไม่ได้รับรหัสห้อง

### Requirement 7: รักษาขอบเขตสถาปัตยกรรม lite-only

**User Story:** ในฐานะผู้ดูแลระบบ ฉันต้องการให้การเปลี่ยนแปลงคงขอบเขต client/proxy/core
ตามกฎ lite-only เพื่อไม่ให้เกิด business logic ซ้ำซ้อนในแอป

#### Acceptance Criteria

1. THE Mobile_App SHALL เรียกใช้เฉพาะ endpoint `/api/*` ที่มีอยู่แล้วสำหรับการสร้างห้อง AND SHALL เรียกใช้งานผ่าน Proxy AND SHALL ไม่ประมวลผล business logic ของการสร้างห้องภายในแอป โดยเงื่อนไขทั้งสามข้อนี้ SHALL เป็นจริงพร้อมกันเสมอ
2. THE Mobile_App SHALL ใช้ค่าชื่อห้อง (`room.name`) ที่ Core_API สร้างให้ โดยไม่สร้างชื่อห้องเองภายในแอป
3. WHERE จำเป็นต้องเพิ่ม logic ฝั่ง server เพื่อรองรับ parity, THE logic ดังกล่าว SHALL ถูกเพิ่มใน `core-lite/` (หรือ proxy ที่ `user-app-lite/`) ไม่ใช่ใน `moph-meet/`

### Requirement 8: ความสอดคล้องของค่าที่ส่ง (parity contract)

**User Story:** ในฐานะผู้พัฒนา ฉันต้องการให้ payload และการตีความผลลัพธ์ของ mobile
ตรงกับเว็บ เพื่อให้ห้องที่สร้างจากทั้งสองช่องทางมีข้อมูลสอดคล้องกัน

#### Acceptance Criteria

1. WHEN Mobile_App และ Web_App สร้างห้องชนิดเดียวกันด้วย วันที่/เวลาเริ่ม/เวลาสิ้นสุด เดียวกัน, THE Mobile_App SHALL ส่ง body ของ `POST /api/rooms` ที่มี field `type`, `starttime`, `endtime` ตรงกับที่ Web_App ส่งสำหรับค่าอินพุตเดียวกัน
2. THE Mobile_App SHALL ตีความ field `room`, `patientJoinUrl` และ `meetJoinUrl` จากการตอบกลับของ Core_API ด้วยความหมายเดียวกับ Web_App โดยการตีความความหมายของแต่ละ field SHALL เหมือนกับ Web_App เสมอ แม้ว่าการนำเสนอบน Mobile_App อาจแตกต่างจาก Web_App ในเชิงภาพ (UI)
3. WHERE Core_API ตอบกลับ field ที่ไม่เกี่ยวข้องกับชนิดห้องที่สร้าง (เช่น `meetJoinUrl` สำหรับห้องตรวจ), THE Mobile_App SHALL ไม่แสดง field นั้นใน Room_Result_Panel

### Requirement 9: การระบุ platform ของห้องที่สร้างจาก Mobile (Dependency บน core-lite)

**User Story:** ในฐานะผู้ดูแลสถิติการใช้งาน ฉันต้องการให้ห้องที่สร้างจากมือถือถูก
บันทึกว่าเป็น platform "mobile" เพื่อให้รายงาน by-platform สะท้อนการใช้งานจริง

> หมายเหตุ dependency: ปัจจุบัน Core_API (`core-lite/src/index.js` route
> `POST /api/rooms`) hardcode `platform: 'web'` ในการบันทึก log `room_created`
> การแยก platform "mobile" ต้องแก้ที่ **`core-lite/`** ให้รับค่า platform hint
> จาก client (เช่น body field หรือ header) — งานนี้อยู่นอกโฟลเดอร์ `moph-meet/`
> ตาม `lite-only.md` และควรยืนยันกับเจ้าของ spec ก่อนทำ. ข้อกำหนดนี้เป็น
> **optional** ต่อ parity หลัก (Requirement 1–8 ทำได้โดยไม่ต้องแก้ backend)

#### Acceptance Criteria

1. WHERE รองรับการระบุ platform ของ client, THE Mobile_App SHALL ส่งค่าบ่งชี้ว่า client เป็น "mobile" ไปกับคำขอสร้างห้อง
2. WHERE Mobile_App ส่งค่าบ่งชี้ platform "mobile", THE Core_API SHALL บันทึก log `room_created` ด้วย `platform = "mobile"` แทนค่า default "web"
3. IF ไม่มีค่าบ่งชี้ platform มากับคำขอ, THEN THE Core_API SHALL คงพฤติกรรมเดิมโดยบันทึก `platform = "web"`
