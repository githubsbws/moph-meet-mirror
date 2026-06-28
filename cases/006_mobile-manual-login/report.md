# 006 — Multi-login (username/password) ใน moph-meet mobile app

วันที่: 2026-06-05
Branch: `delivery/allow-user-login`

## ความต้องการ (Requirement)
ทำ multi login เหมือน user-app-lite (ProviderID + username/password) ใน `moph-meet`
ซึ่งเป็น mobile app (Expo/React Native)

หมายเหตุ scope: steering `lite-only` ปกติให้ทำเฉพาะ `*-lite` แต่ผู้ใช้สั่งทำ `moph-meet`
(mobile app) โดยตรง และ `moph-meet/` ไม่ได้อยู่ใน list deprecated (มีแค่ `tests/moph-meet/`)

## สถานะเดิม
mobile app **มี** username/password login อยู่แล้ว (`directLogin()` → POST `/api/auth`)
แต่ถูกซ่อนหลัง flag `REVIEWER_MODE` ที่ตั้งใจให้เปิดชั่วคราวตอน Apple/Google review
แล้วปิดทิ้ง (UI label "Test Account Login" / "Sign In") — ไม่ใช่ feature ถาวร

## Fix (ทำให้เป็น login ถาวรเหมือน user-app-lite)
- `moph-meet/app/index.tsx` — แสดงฟอร์ม username/password **เสมอ ไม่มี flag** (ทีมจัดการ flag/env ไม่ถนัด
  จึงไม่ผูกกับเงื่อนไขใดๆ ในแอป), relabel UI: "หรือ เข้าสู่ระบบด้วย Username / Password",
  placeholder "Username (เช่น Admin หรือ test)", ปุ่ม "เข้าสู่ระบบด้วย Username / Password"
- `moph-meet/constants/api.ts` — เอา const `MANUAL_LOGIN_ENABLED` ออก (ไม่ใช้แล้ว) คงไว้แค่ `directLogin`
- logic `directLogin` / `handleDirectLogin` เดิมถูกต้องอยู่แล้ว (POST `/api/auth` → `{token, user}` → saveAuth → /dashboard) ไม่ต้องแก้
- **ไม่แตะ backend** — core-lite `MANUAL_LOGIN_ENABLED` env default = เปิด อยู่แล้ว

## Verification
- get_diagnostics: `app/index.tsx`, `constants/api.ts` — No diagnostics (TS clean)
- ยืนยัน backend `core-lite/src/index.js` `POST /api/auth` คืน `{ token, user }` ตรงกับที่ `directLogin` คาดหวัง
- ไม่มี REVIEWER_MODE หลงเหลือในโค้ด
- existing test `startup.test.tsx` ไม่กระทบ (mock api ไม่ export flag → form ซ่อนใน test → assertion ปุ่ม ProviderID ยังผ่าน)
- ข้อจำกัด: รัน jest/expo บนเครื่องนี้ไม่ได้ (npx ผ่าน CMD ใช้ UNC path `\\wsl.localhost` ไม่ได้) — ตรวจด้วย language-server diagnostics + reasoning แทน

## Deploy
- ยังไม่ deploy — เป็น mobile app ต้อง build (Expo/EAS) แล้วส่งขึ้น store/แจกจ่าย ไม่ใช่ scp+pm2 เหมือน lite
- commit อยู่บน branch `delivery/allow-user-login` (ยังไม่ merge เข้า master, ยังไม่ push)

## Follow-ups / risks
- manual login accounts ฝั่ง server เป็น hardcoded fallback (Admin/test) ใน core-lite — production จริงควรตั้ง `MANUAL_LOGIN_ACCOUNTS` env แทน
- ฝั่ง app เปิด manual login เสมอ (ไม่มี flag) — ถ้าภายหลังต้องปิดสำหรับ store build ต้องแก้โค้ด `app/index.tsx` (เอา View ออก) แล้ว build ใหม่ หรือไปปิดที่ backend env `MANUAL_LOGIN_ENABLED=false` (จะทำให้ `/api/auth` คืน 403)
- ต้อง build app ใหม่ (Expo/EAS) การเปลี่ยนแปลงถึงมีผล
