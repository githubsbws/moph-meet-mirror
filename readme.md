# MOPH Meet — ระบบ Telemedicine / Telepharmacy

ระบบประชุมทางไกลและการแพทย์ทางไกลสำหรับกระทรวงสาธารณสุข ประกอบด้วยเว็บแอป (`user-app-lite`),
API กลาง (`core-lite`), แอปมือถือ MOPH Meet (`moph-meet`) และระบบ VDO Conference (Jitsi)

## Installation
1. Run `docker-compose up -d --build` to build and start the services.
2. Access the application at `http://localhost:8080`.
3. Build the Jitsi Meet and copy the `call` into your custom Jitsi Meet instance.
4. Configure the Jitsi Meet instance to use the core service as the backend.
5. Mapping DNS to your server IP address for proper access.

---

## ความสอดคล้องตามขอบเขตงาน (TOR ข้อ 4)

ระบบ **รองรับ** ทุกข้อตาม TOR ดังตารางต่อไปนี้:

| ข้อ | ความต้องการ | สถานะ | รองรับอย่างไร |
|---|---|---|---|
| 4.1.1 | Web Application | ✅ รองรับ | `user-app-lite` (Express + หน้าเว็บ) ใช้งานผ่านเบราว์เซอร์ |
| 4.1.2 | Mobile Application | ✅ รองรับ | แอป native MOPH Meet (`moph-meet`, Expo/React Native) รองรับทั้ง iOS/Android |
| 4.2 | ค้นหาผู้เข้าร่วม (คลินิก/ร้านยา/หน่วยบริการ/hcode/ชื่อ) | ✅ รองรับ | `GET /api/units/search?q=` ค้นหาตามชื่อหน่วยบริการ/hcode/จังหวัด |
| 4.3 | เลือกผู้เข้าร่วมหลายหน่วยบริการ | ✅ รองรับ | ห้องรองรับ `joinedProviders` หลายคน + ค้นหา/เลือกผ่าน unit search |
| 4.4 | สัญลักษณ์ online/offline | ✅ รองรับ | `POST /api/presence/ping` + `GET /api/presence` แสดงสถานะออนไลน์แบบเรียลไทม์ (ping ทุก 20 วิ) |
| 4.5 | เสียงแจ้งเตือน (calling) | ✅ รองรับ | เล่นเสียงแจ้งเตือนเมื่อเรียกผู้ป่วยเข้าตรวจ (WebAudio) |
| 4.6 | Login 3 ช่องทาง (User/Pass, Provider ID, ThaID) | ✅ รองรับ | `/api/auth` (User/Pass), `/api/auth/providerID`, `/api/auth/thaiD` ครบ 3 ช่องทาง |
| 4.7 | บันทึกการรักษา + ส่งออก HIS ผ่าน API | ✅ รองรับ | บันทึก vitals + ห้อง และ `POST /api/his/export` ส่งข้อมูลเข้า HIS endpoint |
| 4.8 | Telemedicine/Telepharmacy + VDO Conference เชื่อมระบบ สธ | ✅ รองรับ | VDO ผ่าน Jitsi (`moph-meetingroom`) + เชื่อม PHR/หมอพร้อม |
| 4.9 | บันทึกภาพนิ่ง/ภาพเคลื่อนไหว | ✅ รองรับ | บันทึกหน้าจอ/วิดีโอผ่าน MediaRecorder ในห้องตรวจ |
| 4.9.1 | ภาพนิ่ง ≥1440×1440 (.jpg/.png) | ✅ รองรับ | จับภาพความละเอียดสูงจากกล้อง/หน้าจอ |
| 4.9.2 | วิดีโอ ≥720×720 (.mp4/.avi) | ✅ รองรับ | บันทึกวิดีโอที่ความละเอียด 1920×1080 (เกินเกณฑ์ขั้นต่ำ) |
| 4.10 | Mobile App ชื่อ "MOPH Meet" | ✅ รองรับ | แอปชื่อ MOPH Meet (`th.go.moph.meet`) |
| 4.10.1 | โหลดจาก Play Store / App Store | ✅ รองรับ | build พร้อมขึ้นสโตร์ (มี checklist ที่ `docs/play-console-checklist.md`) |
| 4.10.2 | iOS ≥12.0, Android ≥7.0.0 | ✅ รองรับ | Expo SDK รองรับ (targetSdk 35) |
| 4.10.3 | เพิ่มผู้ประชุมด้วยการค้นหาจากหน่วยงาน | ✅ รองรับ | ใช้ unit search เดียวกับ 4.2 บนมือถือ |
| 4.10.4 | เชื่อมประวัติผ่าน OTP หมอพร้อม / LINE OA / App หมอพร้อม | ✅ รองรับ | PHR OTP (`/api/phr/*`) + เชื่อม LINE OA/หมอพร้อมผ่าน deep-link |
| 4.10.5 | หน้าบันทึก vital signs (8 ค่า + NST) | ✅ รองรับ | หน้า `/vitals` + `POST /api/vitals` รองรับน้ำหนัก/ส่วนสูง/อุณหภูมิ/SpO2/ความดัน/RR/ชีพจร/น้ำตาล + NST |
| 4.10.6 | เชื่อมต่ออุปกรณ์ Bluetooth ≥5 ชนิด | ✅ รองรับ | BLE (เทอร์โมมิเตอร์/ความดัน/Pulse Ox/ชั่งน้ำหนัก/น้ำตาล) ผ่าน standard GATT + กรอกค่าด้วยตนเองได้ |
| 4.10.7 | ส่งข้อมูลตรวจร่างกายเข้า HIS ผ่าน API | ✅ รองรับ | ค่าจากอุปกรณ์/กรอกมือ → `POST /api/his/export` |
| 4.10.8 | ประชุมออนไลน์ร่วมแพลตฟอร์ม สธ ≥1 | ✅ รองรับ | Jitsi VDO Conference |
| 4.11.1 | สร้างห้องล่วงหน้า/ทันที + Notification + ส่ง Link | ✅ รองรับ | สร้างห้อง instant/reserved + ส่งลิงก์ + แจ้งเตือนผ่าน LINE OA |
| 4.11.2 | ตรวจสอบสิทธิ์เข้าร่วมเฉพาะบุคคลที่กำหนด | ✅ รองรับ | JWT ต่อผู้ป่วย + owner/joinedProviders filter |
| 4.11.3 | ปฏิทินแสดงวันที่มีประชุม | ✅ รองรับ | mini-calendar ใน dashboard |
| 4.11.4 | รายละเอียด + สัญลักษณ์สี | ✅ รองรับ | ปฏิทินแยกสี: ห้องตรวจ (น้ำเงิน) / ห้องประชุม (เขียว) + legend |
| 4.11.5 | ค้นหา/แสดงการประชุมหลายเงื่อนไข | ✅ รองรับ | `/api/meets` + filter + search |
| 4.12 | Dashboard การใช้งาน | ✅ รองรับ | หน้า `/usage-logs` + `/api/logs/*` |
| 4.12.x.1 | ตามวัน + ช่วงเวลาในวัน | ✅ รองรับ | `by-day`, `by-hour` (ระบุช่วงวันที่/ชั่วโมงได้) |
| 4.12.x.2 | ตามเขตสุขภาพ + จังหวัด | ✅ รองรับ | `by-region`, `by-province` (map hcode→เขต/จังหวัด) |
| 4.12.x.3 | Mobile vs Web | ✅ รองรับ | `by-platform` |
| 4.12.x.4 | หน่วยบริการที่เรียก + เวลาเริ่ม/สิ้นสุด | ✅ รองรับ | `by-unit` + ระยะเวลาสนทนา |
| 4.12.2.5 | Top 5 หน่วยงานใช้สูงสุด | ✅ รองรับ | `by-unit?limit=5` |
| 4.12.2.6 | Top 5 ห้องนานที่สุด | ✅ รองรับ | `longest-rooms?limit=5` |
| 4.13 | VA ไม่มีช่องโหว่ Critical/High | ✅ รองรับ | ตั้งกระบวนการ pentest/แก้ก่อน deploy (SonarQube + scan scripts) |
| 4.14 | อบรมผู้ใช้ ≥150 คน (ออนไลน์) | ✅ รองรับ | จัดอบรมออนไลน์ + บันทึกวิดีโอตามงวดงาน |
| 4.15 | อบรมผู้ดูแล ≥10 คน | ✅ รองรับ | จัดอบรมผู้ดูแลระบบ + คู่มือ |
| 4.16 | ดูแล 24 ชม. ≥1 ปี + กู้ DB ใน 24 ชม. | ✅ รองรับ | มีระบบ backup DB + แผน SLA/เวรดูแล |
| 4.17 | ช่องทางแจ้งปัญหา (โทร + OpenChat) | ✅ รองรับ | เปิดสายด่วน + LINE OpenChat |

> หมายเหตุการเชื่อมต่อภายนอก (ThaID, LINE OA, HIS) เปิดใช้งานได้ทันทีเมื่อกรอก credential
> ที่ออกโดยหน่วยงานเจ้าของระบบลงใน `.env` — โครงสร้างโค้ดพร้อมรองรับครบแล้ว

---

## Features เพิ่มเติม (นอกเหนือ TOR)

- **AI Summary** — สรุปบทสนทนาการตรวจอัตโนมัติด้วย Bedrock (Claude) จากวิดีโอ/บันทึกห้องตรวจ
- **ระบบคิวผู้ป่วย** — ผู้ป่วยหลายคนเข้าคิวด้วยลิงก์เดียว แพทย์กดเรียกทีละคน (รองรับ token ที่ระบบอื่น gen ล่วงหน้า)
- **PWA** — เว็บแอปติดตั้งบนมือถือได้ (manifest + service worker)
- **Reserved Room API** — ระบบนัดหมายภายนอกสร้างห้องตรวจล่วงหน้าผ่าน API ได้
- **Health-region resolver** — แปลง hcode → จังหวัด → เขตสุขภาพ สำหรับสถิติ
- **PII-safe dashboard** — แสดงสถิติแบบรวม/ปกปิดข้อมูลส่วนบุคคล
- **OpenAPI + Postman** — เอกสาร API ครบที่ `core-lite/docs/`

## โครงสร้างโปรเจกต์ (active)

| ส่วน | โฟลเดอร์ | พอร์ต | หมายเหตุ |
|---|---|---|---|
| Core API | `core-lite/` | 3500 | Node.js + SQLite |
| Web app | `user-app-lite/` | 3000 | Express + หน้าเว็บ, proxy ไป core |
| Mobile app | `moph-meet/` | — | Expo/React Native |
| VDO Conference | Jitsi | — | `moph-meetingroom.moph.go.th` |
