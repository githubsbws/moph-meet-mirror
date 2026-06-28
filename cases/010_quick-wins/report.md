# Case 010 — Quick Wins: Unit Search / Queue Ring / Calendar Color / Media Resolution

**วันที่:** 2026-06-28  
**Branch:** delivery/update-Q2-26 (commit d4822cf)

## รายการที่แก้ (T7)

| TOR | สิ่งที่ทำ | ไฟล์ |
|---|---|---|
| 4.2/4.3/4.10.3 | `GET /api/units/search?q=` ค้นหาหน่วยบริการ/hcode ผ่าน hcode map | `core-lite/src/index.js` |
| 4.5 | `playAdmitRing()` — เล่นเสียง 2 ตัวโน้ต (880Hz + 1100Hz) เมื่อเรียกผู้ป่วยเข้าตรวจ | `user-app-lite/public/meet.html` |
| 4.11.4 | ปฏิทิน: `.has-exam` (สีน้ำเงิน) สำหรับห้องตรวจ, `.has-meet` (สีเขียว) สำหรับห้องประชุม + legend CSS | `user-app-lite/public/js/dashboard.js`, `public/css/app.css` |
| 4.9.2 | ปรับ video ideal resolution: `1280×720` → `1920×1080` (ตาม TOR ≥720×720) | `user-app-lite/public/meet.html` |

## Verification
- `node --check` ผ่าน
- unit search: ถ้ายังไม่ gen `hcode-to-area.js` จะ return `[]` อย่างสุภาพ (ไม่ throw)
- ring: ใช้ WebAudioAPI ไม่มี dependency ใหม่

## Follow-ups
- gen `hcode-to-area.js` จาก TSV รพ. เพื่อให้ unit search ทำงานจริง
- 4.9.1 canvas capture ≥1440×1440 jpg/png — ต้องเพิ่ม canvas snapshot ใน screenshot flow ใน meet.html
