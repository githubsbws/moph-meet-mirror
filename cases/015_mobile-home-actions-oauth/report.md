# Case 015 — Mobile: home ทำอะไรไม่ได้ + เด้งหลุด ProviderID

**วันที่:** 2026-06-30  
**Branch:** delivery/update-Q2-26

## Symptom (จากผู้ใช้จริง — Tact17 EP KalasinHos)
1. "เข้าแล้วทำอะไรไม่ได้เลยครับ" — login ProviderID บนมือถือสำเร็จ ขึ้นหน้า dashboard แต่มีแค่การ์ดโปรไฟล์ + "ยังไม่มีนัดหมาย" ไม่มีปุ่มทำอะไรได้
2. "ตอนผมกดออก เพื่อไป Application อื่น มันเด่งออกจากการ Login providerID" — สลับแอประหว่าง login ProviderID แล้วเด้งหลุด ไม่เข้าระบบ

## Root cause
1. `moph-meet/app/dashboard.tsx` (หน้า home หลัง login) ไม่มีปุ่ม action ใด ๆ — แพทย์สร้างห้อง/เข้าฟีเจอร์ไม่ได้
2. `moph-meet/app/index.tsx` — `handleProviderIdLogin()` เรียก `WebBrowser.openAuthSessionAsync()` แต่**ไม่อ่าน `result.url`** ที่ session คืนมา พึ่ง global `Linking` listener อย่างเดียว แต่ auth session ดัก redirect `mophmeet://` ไว้เอง → listener ไม่ยิง → ถ้าสลับแอป/ปิดเบราว์เซอร์ระหว่าง OAuth จะไม่เข้าระบบ

## Fix

| ไฟล์ | สิ่งที่แก้ |
|---|---|
| `moph-meet/app/dashboard.tsx` | เพิ่มการ์ด "เริ่มใช้งาน" — ปุ่ม สร้างห้องตรวจ / สร้างห้องประชุม (`POST /api/rooms` → เข้าห้อง Jitsi, ห้องตรวจแสดงลิงก์ผู้ป่วยให้แชร์) + ปุ่ม บันทึกสัญญาณชีพ / อุปกรณ์การแพทย์ → `/devices`. จัดให้ตรงกับหน้า home ของ user-app-lite |
| `moph-meet/app/index.tsx` | อ่าน `result.url` จาก `openAuthSessionAsync` มา parse token โดยตรง + handle `Linking.getInitialURL()` ตอน cold start + กัน process ซ้ำด้วย `handledAuth` flag |

## พฤติกรรมหลังแก้
- login (ProviderID/user-pass) → `/dashboard` (= home) ที่มีปุ่มสร้างห้อง + เมนูครบ
- OAuth ProviderID เข้าระบบสำเร็จแม้ผู้ใช้สลับแอประหว่างทาง (อ่านจาก result.url แทนพึ่ง listener)

## Verification
- ตรวจ logic ครบ; flow user/pass login เดิมไม่กระทบ
- ต้อง native build (expo run/EAS) เพื่อทดสอบ deep-link จริงบนเครื่อง

## Follow-ups
- ดู parity เพิ่ม: ปฏิทินนัดหมาย + แก้ไขโปรไฟล์ (Data Hub) ที่ web มี แต่ mobile ยังไม่มี (นอก scope บั๊กนี้)
