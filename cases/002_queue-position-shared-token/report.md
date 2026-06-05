# 002 — ลำดับคิวไม่ขึ้น / ผู้ป่วยเข้าห้องพร้อมกันหมด

วันที่: 2026-06-04

## อาการ (Symptom)
ลูกค้าแจ้ง: "ลำดับคิวไม่ขึ้น ให้เรียกคิวถัดไป แต่ผู้ป่วยเข้ามาในห้องเลยค่ะ"
คือ (1) คิวผู้ป่วยไม่แสดงลำดับที่ถูกต้อง และ (2) พอหมอกด "เรียกคิวถัดไป" ผู้ป่วยทุกคนเข้าห้องพร้อมกัน

## Root cause
ระบบ key คิวด้วยตัว JWT token string (`core-lite/src/index.js` `GET /api/exam/:id/queue`).
ลิงก์คิว/token ถูกสร้างไว้ล่วงหน้า "อันเดียว" แล้วแชร์ให้ผู้ป่วยหลายคน → ทุกคนใช้ token เดียวกัน
→ server เห็นเป็น queue entry เดียว:
- คิวมี entry เดียว ทุกคนได้ "ลำดับ 1 จาก 1" → "ลำดับไม่ขึ้น"
- กด "เรียกถัดไป" → entry เดียวเป็น `admitted` → ผู้ป่วยทุกคนที่ poll เห็น admitted พร้อมกัน → เข้าห้องพร้อมกัน

## Fix (ฝั่ง app ล้วน ไม่แตะ Jitsi ไม่แตะการ gen token)
- `user-app-lite/public/queue.html` — สร้าง `patientId` ต่อ browser เก็บใน localStorage (คงที่เมื่อ refresh) ส่ง `pid` + `name` ไปกับการ poll
- `core-lite/src/index.js` — เปลี่ยน key คิวจาก token → `pid` (fallback เป็น token ถ้าไม่มี pid) เก็บใน field `key`; `/api/exam/:id/next` ใช้ `q.key || q.token` ให้ตรงกัน
- Token เดิมที่ระบบอื่น gen ไว้ล่วงหน้ายังใช้ได้ (ไม่มี pid → fallback เป็น token เหมือนเดิม)

## Verification
- Logic test: ผู้ป่วย 3 คน token เดียว pid ต่างกัน → 3 คิว ลำดับ 1/2/3, กด next เรียกทีละคน, poll ซ้ำไม่ duplicate, back-compat token เก่าผ่าน (12/12 PASS)
- Playwright บน production: 3 pid บน token เดียว → ลำดับ 1/2/3, total 3; next ครั้งที่ 1 admit คนที่ 1 (อีก 2 ยัง waiting), next ครั้งที่ 2 admit คนที่ 2; token เก่าไม่มี pid ยังเข้าคิว+admit ได้; หน้า queue จริงแสดง "ลำดับของคุณ 1"

## Deploy
- ผู้ใช้ deploy เอง: `user-app-lite/public/queue.html` + `core-lite/src/index.js` → `pm2 reload`
- ไม่ต้อง migration / ไม่แตะ DB

## Follow-ups / risks
- ยังไม่มี gate ฝั่ง server/Jitsi กันผู้ป่วยที่มีลิงก์เข้าห้องวิดีโอตรงโดยข้ามคิว (ตกลงไม่แตะ Jitsi) — เป็น privacy risk ควรวางแผนแยก (Jitsi JWT auth)
