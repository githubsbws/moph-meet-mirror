# 001 — สร้างห้องตรวจแล้วขึ้น error JSON / "string did not match"

วันที่: 2026-06-04

## อาการ (Symptom)
กดสร้างห้องตรวจบน `moph-meet.moph.go.th` แล้วขึ้น error แดง 2 แบบตามเบราว์เซอร์:
- Chrome: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
- iOS/Safari: `The string did not match the expected pattern.`
เป็น error เดียวกัน (พยายาม `res.json()` กับหน้า HTML) คนละถ้อยคำตามเบราว์เซอร์

## Root cause
`user-app-lite/server.js` — proxy ทั่วไป `app.use('/api', ...)` สร้าง upstream URL จาก
`req.path` ซึ่ง Express ตัด mount path `/api` ออกไปแล้ว → forward เป็น
`http://localhost:3500/rooms` (หาย `/api`) core-lite ไม่มี route นี้ และไม่มี JSON 404
handler เลยตอบกลับเป็นหน้า HTML 404 default → frontend เอาไป `.json()` พัง

หมายเหตุ: คำแนะนำเรื่อง date/time normalization เป็น red herring — `<input type=date>`
ส่งค่า `YYYY-MM-DD` เสมอ และ `<input type=time>` ส่ง `HH:MM` เสมอ ไม่ว่าหน้าจอจะโชว์ภาษาไทย

## Fix
- `user-app-lite/server.js` — เปลี่ยน proxy ให้ใช้ `req.originalUrl` (คง `/api` + query) แทน `req.path`
- `core-lite/src/index.js` — เพิ่ม JSON 404 handler ก่อน error handler เพื่อให้ API ไม่มีทางคืน HTML อีก

## Verification
- รัน test จำลอง proxy: `/api/rooms` → upstream `/api/rooms`, content-type `application/json`, `res.json()` สำเร็จ
- ทดสอบจริงผ่าน Playwright: login → สร้างห้องตรวจ → ขึ้น "สร้างห้องสำเร็จแล้ว!" + ได้ลิงก์คิว
- network: `POST /api/rooms` → HTTP 200, `content-type: application/json`

## Deploy
- ผู้ใช้ deploy เอง (scp 2 ไฟล์ + `pm2 reload`) — ไม่ต้อง npm install (เป็น runtime JS ล้วน)
- ผลพลอยได้: `/api/meets`, `/api/exam/:id/*` ที่ผ่าน proxy ตัวเดียวกันกลับมาทำงาน

## Follow-ups / risks
- `NODE_TLS_REJECT_UNAUTHORIZED=0` และ `rejectUnauthorized:false` เปิดอยู่ — เสี่ยงถ้าหลุด production (ยังไม่แก้)
