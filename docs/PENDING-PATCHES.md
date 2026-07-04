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

- [x] **Expo SDK 53 + RN 0.79 + React 19** (`moph-meet/`) — อัปเกรดจาก SDK 52 เสร็จ (branch `update/expo-sdk53`, ดู case 017)
- [x] **16KB page size** — verify แล้วทั้ง static (`.so` 17 ตัว align `0x4000`) และ runtime (`getconf PAGE_SIZE`=16384 บน 16KB emulator)
- [x] config plugin ใหม่ 2 ตัว: `withUnsafeOkHttp` (กู้ OkHttp SSL workaround), `withFrescoFlags` (ปิด gif/webp → เอา `libgifimage.so`/`libstatic-webp.so` ออก)
- [x] `targetSdkVersion 35` ตั้งผ่าน `expo-build-properties` (ตั้งใน `app.json` ตรงๆ ไม่ได้แล้วใน SDK 53)
- [x] ลบ plugin `withFmtFix.js` (เป็นการแก้ที่ผิด)
- [ ] **Interactive smoke ยังค้าง:** login ProviderID/manual, สร้างห้องไม่เจอ 401, วิดีโอ camera/mic, back/offline — ต้องมี credential + backend จริง (dev เดินบน device/emulator)
- [ ] **iOS build ค้าง:** push branch `update/expo-sdk53` → build บน Mac (Xcode/EAS)
- [ ] **SECURITY ก่อน production/VA:** `UnsafeOkHttpClientFactory` ปิด TLS verify ทั้งหมด (MITM) → ยกระดับเป็น cert allow-list / pinning
- [ ] Windows build: ต้องใช้ short path + SDK path ไม่มีช่องว่าง (env เท่านั้น ไม่แตะโค้ด)
- [ ] รอ Patch API ให้พร้อม + นำส่งศูนย์คอมพิวเตอร์เพื่อขึ้น App Store / Play Store
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
