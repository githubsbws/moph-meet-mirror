---
inclusion: fileMatch
fileMatchPattern: 'moph-meet/**'
---

# Mobile app (`moph-meet/`) — working rules

`moph-meet/` เป็น **mobile app** (Expo / React Native) ไม่ใช่ `*-lite`. ตาม
`lite-only.md` งานปกติอยู่ที่ `*-lite` แต่ `moph-meet/` **ทำได้** (ไม่อยู่ในลิสต์
deprecated — deprecated มีแค่ `tests/moph-meet/`). อ้างอิงเคส 006.

## สถาปัตยกรรม

```
[Mobile: moph-meet/] --API (Cookie auth)--> [Proxy: user-app-lite/] --/api/*--> [Core: core-lite/]
```

- แอปเป็น **WebView wrapper** เป็นหลัก + native (camera/mic, back button, offline,
  domain whitelist). business logic อยู่ที่เว็บ/แอปฝั่ง lite ไม่ใช่ที่นี่.
- ไฟล์หลัก: `app/_layout.tsx` (WebView, `ALLOWED_HOSTS`, offline), `app/index.tsx`
  (login: ProviderID + username/password), `constants/api.ts` (API calls).

## กฎที่ต้องรักษา

- **Cookie auth ไม่ใช่ Bearer** — `constants/api.ts` ต้องส่ง token ผ่าน
  `Cookie: token=...` + `credentials: 'include'` (proxy อ่านจาก cookie เท่านั้น).
  นี่คือ fix ของ bug 401 ใน case 016 ห้าม regress กลับไปเป็น `Authorization: Bearer`.
- **ขอบเขต:** ห้ามย้าย business logic เข้ามาในแอป — เพิ่ม/แก้ logic ที่ `core-lite/`
  หรือ `user-app-lite/` ตาม `lite-only.md`.
- manual login (username/password) เปิดถาวรในแอป (ไม่มี flag) — ถ้าจะปิดให้แก้ที่
  backend env `MANUAL_LOGIN_ENABLED=false` ไม่ใช่ผูก flag ในแอป.

## Build / test

- **Android:** build ในเครื่องนี้ได้ (มี Android Studio + SDK) แต่ `expo`/EAS build
  บน Windows ไม่เสถียร → ใช้ `npx expo prebuild --platform android` (gen native, รันบน
  Windows ได้) แล้วเปิดโฟลเดอร์ `moph-meet/android` ใน **Android Studio** เพื่อ run/
  build (หรือ `gradlew assembleRelease` สำหรับตรวจ 16KB).
- **iOS:** build บน Windows ไม่ได้ — ต้อง push ขึ้น git แล้วให้เครื่อง **Mac** build
  (Xcode / EAS). หมายเหตุ: config plugin `plugins/withFmtFix.js` (patch Podfile
  ฝั่ง iOS ด้วย `FMT_USE_CONSTEVAL=0`) ถูกลบออกแล้ว เพราะเป็นการแก้ที่ผิด/ไม่จำเป็น.
- **16KB page size:** Google Play บังคับ. ต้อง verify ด้วย 16KB emulator
  (`adb shell getconf PAGE_SIZE` = 16384) + ตรวจ ELF alignment ของ `.so` ทุกตัว
  ก่อนส่ง store. ระวัง lib ที่รู้ว่ามีปัญหา: `expo-image` (Glide/avif),
  gif/webp decoders.
- ข้อจำกัดเครื่องนี้: `npx` ผ่าน CMD บน UNC path `\\wsl.localhost` ใช้ไม่ได้ →
  ถ้ารัน jest/expo ไม่ได้ ให้พึ่ง language-server diagnostics + reasoning แล้ว
  ยืนยันจริงตอน build.

## Upgrade

- upgrade Expo SDK ทีละ major เท่านั้น (เช่น 52 → 53) อย่ากระโดดข้าม.
- SDK 53 = React 19 + RN 0.79 + New Architecture default (แอปเปิด `newArchEnabled`
  อยู่แล้ว). แผน manual upgrade อยู่ที่ `docs/mobile-sdk53-upgrade-plan.md`.
- แยก branch `update/...` ทุกครั้ง ไม่ upgrade บน master/delivery ตรงๆ. base จาก
  `delivery/mobile-parity` (branch เดียวที่มี Cookie 401 fix ใน `api.ts` — ห้าม base
  จาก `allow-user-login` ที่ยังเป็น Bearer).
- โฟลเดอร์ `android/` ถูก commit ไว้ → `expo prebuild --clean` จะ regen, ต้องรีวิว
  diff ว่า custom config (permissions, package name, ndkVersion) ไม่หาย.

## เมื่อทำงานเสร็จ

ทำ case report ที่ `cases/[NNN]_.../report.md` ตาม `case-reports.md` (ภาษาไทย,
ห้ามใส่ secret/ข้อมูลผู้ป่วย) และอัปเดต `docs/PENDING-PATCHES.md` /
`docs/kiro-handover.md` ให้ตรงสถานะ.
