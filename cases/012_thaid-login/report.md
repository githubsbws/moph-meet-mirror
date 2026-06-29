# Case 012 — ThaID Login Scaffold (TOR 4.6)

**วันที่:** 2026-06-28  
**Branch:** delivery/update-Q2-26 (commit cd732bc)

## Symptom
ขาดช่องทาง login ที่ 3 (ThaID) ตาม TOR 4.6 ที่กำหนดให้รองรับ User/Pass + ProviderID + ThaID

## Root cause
ยังไม่มี credentials จาก สธ + ยังไม่มีโครงโค้ด

## Fix

| ไฟล์ | สิ่งที่เพิ่ม |
|---|---|
| `core-lite/src/index.js` | `POST /api/auth/thaiD` — exchange code → ThaID token → profile (bora.dopa.go.th) → session token ในรูปแบบเดียวกับ `/api/auth/providerID` |
| `user-app-lite/server.js` | env `THAID_*`, `/auth/thaid/callback` route (เหมือน `/auth/providerid/callback`), เพิ่ม `thaidClientId/redirectUri/authUrl` ใน `/config` |
| `user-app-lite/public/login.html` | ปุ่ม "เข้าสู่ระบบด้วย ThaID" (ซ่อนไว้ จะแสดงเมื่อ config มี `thaidClientId`) |

## Behavior เมื่อยังไม่มี credentials
- ปุ่มใน login.html ซ่อน (display:none จนกว่า config จะมี `thaidClientId`)
- endpoint `/api/auth/thaiD` คืน `503 thaiDNotConfigured` (JSON ชัดเจน ไม่ 502/HTML)

## Verification
- Syntax check ผ่าน
- flow ProviderID/manual เดิมไม่พัง (เพิ่มใหม่ทั้งหมด ไม่แก้ของเดิม)

## Deploy + Follow-ups
1. รับ `THAID_CLIENT_ID`, `THAID_CLIENT_SECRET`, `THAID_REDIRECT_URI` จาก สธ
2. เพิ่มใน `.env` ของ core-lite + user-app-lite
3. `pm2 reload core-lite user-app-lite`
4. ทดสอบ flow จริงกับ imauth.bora.dopa.go.th
