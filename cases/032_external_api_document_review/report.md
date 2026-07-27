# Case 032: ตรวจเอกสาร API Gateway และ AI-Telemedicine

## 1. เอกสาร API Gateway (18 หน้า)

เกี่ยวข้องกับ MOPH Meet โดยตรงในฐานะเอกสารสถาปัตยกรรมและ API ของระบบเดิม/เป้าหมาย:

- ระบุ Core API, Call Service, Web Cluster, PostgreSQL และ Redis
- ระบุ API MOPH-Meet สำหรับ auth, ตรวจ token, logout, รายการ/รายละเอียด meeting และข้อมูลผู้ป่วย/IoT
- ไม่ระบุ Calling API ของหมอพร้อม, endpoint สร้างสาย, payload Telemed หรือ callback สถานะสาย

## 2. API-docs_AI-Telemedicine (11 หน้า)

เกี่ยวข้องโดยตรงกับการประมวลผลหลังจบการตรวจ ไม่ใช่การสร้าง Video Call:

- `POST https://ai-telemedicine.abs.co.th/api/media` อัปโหลด audio/video พร้อมข้อมูลนัดหมาย, Health ID, Provider ID, H-Code และ clinic codes
- `GET /api/media/status` ตรวจสถานะประมวลผล
- `GET /api/media/transcript` ดึง transcript/summary
- ใช้ `Authorization: Bearer Provider_ID_Token`

## ความสัมพันธ์กับโค้ดปัจจุบัน

web app มี flow อัปโหลดไป `https://ai-telemedicine.abs.co.th/api/media` และกรอกฟิลด์หลักที่อยู่ในเอกสารแล้ว จึงเป็น integration ที่เกี่ยวข้องจริง แต่ไม่พบ integration สำหรับ status/transcript endpoint ตามเอกสาร

## ข้อควรแก้ไขด้านความปลอดภัย

พบ credential สำหรับ AI-Telemedicine ฝังใน `user-app-lite/server.js` และส่งต่อให้ browser. ต้องหมุน credential และย้ายไป environment/credential service ก่อน production; ไม่บันทึกค่า credential ในรายงานนี้

## ข้อสรุป

เอกสารทั้งสองไม่ใช่ MOPH Calling API spec. Calling API ยังต้องขอเอกสารเฉพาะจากทีมหมอพร้อม Station; AI-Telemedicine เป็นงาน upload/AI summary หลังจบการตรวจ
