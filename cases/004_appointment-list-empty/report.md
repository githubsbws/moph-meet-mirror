# 004 — สร้างห้องสำเร็จแต่ไม่ขึ้นใน "รายการนัดหมาย"

วันที่: 2026-06-05

## อาการ (Symptom)
ลูกค้าแจ้ง (พร้อมคลิป): "สร้างห้องตรวจเสร็จแล้ว ห้องตรวจไม่ขึ้นในรายการนัดหมายข้างล่างค่ะ"
หน้า dashboard โชว์ "ไม่มีนัดหมาย" ทั้งที่เพิ่งสร้างห้องสำเร็จ

## Root cause (บั๊กซ้อน 2 ชั้น)
1. **`/api/meets` โหลดทุกห้อง ไม่กรอง owner + ไม่มี limit** (`core-lite/src/index.js`)
   `rooms.db` มี 197,771 ห้อง (ส่วนใหญ่ reserved จาก HIS) → loop โหลดทั้งหมดเข้า memory แล้วคืนทุกห้อง → response ใหญ่/ช้า
2. **nginx route `/api/` → core-lite `:3500` ตรง ข้าม proxy** (ตัวที่ทำให้ 401)
   `location /api/` ใน nginx proxy ตรงไป `:3500/api/` ข้าม user-app-lite (`:3000`) ที่แปลง cookie→Bearer
   → core-lite `auth()` อ่านได้แค่ Bearer header แต่ browser ส่ง cookie → ไม่เห็น token → 401 tokenExpired
   → frontend fallback เป็น `[]` → "ไม่มีนัดหมาย"
   (อธิบายว่าทำไม `/api/auth/me` ผ่าน แต่ `/api/meets` ไม่ผ่าน — คนละ location ใน nginx)

## Fix (ไม่แตะ nginx ไม่แตะ DB)
- `core-lite/src/store/sqlite.js` — เพิ่ม `roomStore.byOwner()` query ด้วย SQL JSON1 กรองเฉพาะห้องของ user (owner หรือ joinedProviders) + limit
- `core-lite/src/index.js` — `/api/meets` ใช้ `byOwner(username)` (มี fallback bounded scan สำหรับ backend อื่น)
- `core-lite/src/middlewares/auth.js` — `auth()` อ่าน token จาก cookie ได้ด้วย (fallback) นอกจาก Bearer header → ทำงานไม่ว่า nginx จะ route ทางไหน, ไม่กระทบ HIS endpoints (เป็น open route)

## Verification
- byOwner บน DB จริง 197k ห้อง: owner ที่มี 44k ห้อง คืน 200 แถวใน ~390ms; Admin คืน 5 ห้องใน ~255ms (เรียงใหม่สุดก่อน)
- หลัง reload: `/api/meets` cookie-only → 200 (เดิม 401), no-auth → ยัง 401 (security ปกติ)
- Playwright บน production: login → `/api/meets` คืน 5 ห้องของตัวเอง → สร้างห้องใหม่ → ขึ้นในรายการทันที (count 6, อยู่บนสุด); UI เรนเดอร์ 6 การ์ด, ไม่ขึ้น "ไม่มีนัดหมาย", console error 0

## Deploy
- push `auth.js`, `sqlite.js`, `index.js` → `/root/core-lite`; `pm2 reload core-lite` (restart 31→33)
- ไม่แตะ nginx, ไม่แตะ DB

## Follow-ups / risks
- nginx `location /api/` → `:3500` ตรง ยังอยู่ (แก้ที่ core ให้ทนทั้ง cookie+Bearer แล้ว) — ถ้าอยากให้ traffic /api/* ผ่าน proxy สม่ำเสมอ ควรแก้ nginx เป็น `:3000` (ต้องตัดสินใจ เพราะแตะ prod nginx)
- การกรองใช้ `ownerId === user.username`; ProviderID login เซ็ต username = account_id → ห้องที่สร้างเองในเว็บเห็นแน่นอน, ห้อง HIS เห็นต่อเมื่อ account_id ตรงกัน
- เครื่องลูกค้าที่มี service worker เก่าอาจ cache 401 — แนะนำ hard refresh; ถ้าแพร่หลายควร bump เวอร์ชัน SW
- ห้องทดสอบบน Admin ที่สร้างระหว่าง verify ยังค้างอยู่ (เช่น `67c7f0dc8adf`)
