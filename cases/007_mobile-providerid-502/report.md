# 007 — ProviderID login บน mobile ได้ 502 (เว็บปกติ)

วันที่: 2026-06-28
รายงานโดยลูกค้า: Bangkok Web Solution (อีเมล 24 มิ.ย.)

## อาการ (Symptom)
login ด้วย Provider ID บน **mobile app** ไม่ผ่าน ได้ **502** หลัง moph.id.th redirect กลับมาที่
`moph-meet.moph.go.th/auth/providerid/callback` — แต่บน **เว็บเข้าได้ปกติ**
ทีมลูกค้าให้ AI เช็คแล้วเดาว่าเกิดตอน server เอา code ไป exchange token

## Root cause (ยืนยันจาก nginx error log — ไม่ใช่เรื่อง code exchange)
nginx error.log วันที่ 24 มิ.ย. (วันที่ทีมเทสต์) แสดงชัด:
```
upstream sent too big header while reading response header from upstream
request: "GET /auth/providerid/callback?code=X&state=mobile&..."
upstream: "http://127.0.0.1:3000/auth/providerid/callback..."
```
- callback ฝั่ง mobile (`state=mobile`) redirect ไป `mophmeet://auth?token=...&user=<full user JSON>`
  โดยยัด **user object เต็ม** (มี `providerIDProfile` ทั้งก้อน: access_token, raw_jwt, photo ฯลฯ)
  url-encode ลงใน **Location header** → header ใหญ่เกิน `proxy_buffer_size` ของ nginx (default 4096) → **502**
- เว็บไม่เจอเพราะเก็บ user แบบ **compact** ใน cookie แล้ว redirect ไป `/` (header เล็ก)
- code exchange จริง **สำเร็จ** (เหมือนเว็บ) — ทฤษฎีของทีมไม่ถูก
- สถิติ: callback 502 จำนวน 15 ครั้ง **ทั้งหมดวันที่ 24 มิ.ย.** (วันเทสต์), 708 ครั้งเป็น 302 (เว็บ)

## Fix (ฝั่ง server เท่านั้น — ไม่ต้อง build app ใหม่, ไม่แตะ nginx)
`user-app-lite/server.js`:
- แยกฟังก์ชัน `compactUser()` (เดิม inline อยู่ใน setAuthCookies) ใช้ร่วมกัน
- callback ฝั่ง mobile ส่ง `compactUser(data.data.user)` แทน user เต็ม
- compact เก็บเฉพาะ field ที่ mobile app อ่านจริง: `display, username, providerIDProfile.{email,title_th,provider_id,cid}, organization[0].{position,hname_th,hcode,department}, roles, hcode5/9`
- รูปแบบ deep-link `mophmeet://auth?token=&user=` เหมือนเดิม → **แอปที่ลงไปแล้วใช้ได้ทันที ไม่ต้อง rebuild**

## Verification
- node --check ผ่าน (local + บน server)
- เทียบขนาด Location header กับ user เต็ม worst-case (มี Thai + profile bloat):
  - OLD = 11,196 bytes → เกิน 4096 → 502 (ตรงกับ log)
  - NEW = 1,525 bytes → ต่ำกว่า 4096 → ไม่ 502
  - field ที่แอปอ่าน (display, email, title_th, hname_th) ยังครบ
- deploy แล้ว: user-app-lite reload online, `/config` = 200
- **ยังไม่ได้ E2E จริง** — ต้องให้ทีมลอง login Provider ID บนแอปอีกครั้ง (ต้องใช้ตัวตนจริงที่ moph.id.th)

## Deploy
- scp `user-app-lite/server.js` → `/root/user-app-lite/` → `pm2 reload user-app-lite` (fork mode, blip <1s)
- ไม่แตะ nginx, ไม่แตะ DB, ไม่แตะ mobile app

## Follow-ups / risks
- ทีมต้องทดสอบ login Provider ID บนแอปจริงเพื่อ confirm (ผมทำแทนไม่ได้)
- defense-in-depth (ถ้าต้องการ): เพิ่ม `proxy_buffer_size`/`proxy_buffers` ใน nginx — แต่ fix นี้แก้ที่ต้นเหตุแล้ว ไม่จำเป็น
- fix นี้อยู่บน master (hotfix แยกจาก branch delivery/allow-user-login ที่เป็นเรื่อง username/password ของแอป)
