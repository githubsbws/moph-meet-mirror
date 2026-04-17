# MOPH Meet — Pending Patches & Notes

> อัปเดตล่าสุด: 17 เมษายน 2569

---

## 🔲 รอ Patch — ระบบการจัดห้องตรวจใหม่

- [ ] ปรับโครงสร้างการสร้างและจัดการห้องตรวจ
- [ ] อัปเดต API + Frontend

## 🔲 รอ Patch — Dynamic User Data

- [ ] ระบบข้อมูลผู้ใช้แบบ dynamic
- [ ] ต้องทำก่อน IOT/PHR เพราะ user data จะเปลี่ยน

## 🔲 รอ Patch — PWA / Offline

- [ ] Service Worker + Offline caching

## 🔲 รอ Patch — Mobile App (iOS + Android)

- [ ] รอ Patch API ให้พร้อมก่อน
- [ ] นำส่งศูนย์คอมพิวเตอร์เพื่อขึ้น App Store / Play Store
- [ ] Expo SDK 52 + React Native 0.76 (`moph-meet/`)
- [ ] WebView-based Jitsi integration
- [ ] ProviderID login flow ในแอป
- [ ] อัปเดตเอกสาร `moph-meet-v1.1.html` → เปลี่ยนสถานะ Mobile App จาก "รอ Patch" → "✅"

## ❌ ไม่ทำ — WebSocket Realtime Queue

- ~~WebSocket real-time queue~~ — ตัดออกจากแผนงาน

## 🔲 รอ Patch — เชื่อมต่อ IOT และ PHR

- [ ] ปรับเป็นรูปแบบการใช้งานผ่าน MOPH กลางแทน
- [ ] รอ Patch ส่วนอื่นก่อน (โดยเฉพาะ Dynamic User Data) แล้วจะ patch ส่วนนี้
- [ ] เหตุผล: user data จะเปลี่ยน ต้องรอให้ stable ก่อน

## 🔲 รอ Patch — AI Summary ปรับระบบแสดงผล

- [x] เชื่อมต่อ ABS backend แล้ว ✅
- [ ] ปรับ UI แสดงผลสรุปการตรวจ

---

## ✅ Completed (v1.1 — เม.ย. 2569)

- [x] JWT no-expiry สำหรับลิงก์ผู้ป่วย/แพทย์จากห้องตรวจปกติ
- [x] JWT time-based (endTime + 24hr) สำหรับ /api/meet/reserved
- [x] Room TTL = endtime + 25hr
- [x] Usage logging (SQLite) + Dashboard สาธารณะ
- [x] CID/Account ID optional สำหรับ HIS API
- [x] AI Summary — เชื่อมต่อ ABS backend
- [x] เอกสาร `moph-meet-v1.1.html` (2 ภาษา)

---

### Notes

- WebSocket Realtime Queue ตัดออกจากแผนงานแล้ว
- IOT/PHR ต้องรอ Dynamic User Data เสร็จก่อน เพราะ user data จะเปลี่ยน
- Mobile App รอ API patch เสร็จก่อน แล้วส่งศูนย์คอมฯ ขึ้น Store
- AI Summary backend (ABS) ต่อแล้ว เหลือแค่ปรับ UI แสดงผล
- เอกสารไม่ลงรายละเอียด source code เพื่อป้องกันการ clone
