# 018 — Mobile Room Creation Parity (+ date/time picker, ไอคอนแอป)

**วันที่:** 2026-07-05
**Branch:** `update/expo-sdk53`
**Spec:** `.kiro/specs/mobile-room-creation-parity/`

## Symptom / ที่มา
flow การสร้างห้องบนแอปมือถือ (`moph-meet/`) ยังไม่เหมือนเว็บ (`user-app-lite/`):
กดปุ่มแล้ว `POST /api/rooms` ทันทีโดยส่งแค่ `{ type }` — ไม่มีฟอร์มกรอกวันเวลานัด,
ไม่ส่ง `starttime`/`endtime`, ไม่มี result panel ให้คัดลอก/แชร์ลิงก์เหมือนเว็บ

## สิ่งที่ทำ (Fix / Feature)
เพิ่ม flow parity กับเว็บ โดยแยก pure logic ออกมาเป็นโมดูลที่ทดสอบได้:

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `moph-meet/constants/roomForm.ts` (ใหม่) | pure logic: `toDatetimeString`, `todayDateString`, `buildCreateRoomBody`, `validateCreateRoomInput`, `toFullUrl`, `selectResultLinks` — parity contract กับเว็บ |
| `moph-meet/app/dashboard.tsx` | เปลี่ยนปุ่มสร้างห้องให้เปิด Create_Room_Form (modal) ก่อน; validate → `POST /api/rooms` (body `{type,starttime,endtime,platform:'mobile'}`); Room_Result_Panel สลับในโมดัลเดียว พร้อมปุ่มคัดลอก + เข้าห้อง; date/time เป็น native picker (time = spinner) |
| `moph-meet/constants/api.ts` | refactor แยก `buildApiUrl`/`buildApiRequestInit` (พฤติกรรม `apiFetch` เดิม, คง Cookie auth) |
| `core-lite/src/index.js` | `POST /api/rooms` รับ `platform` hint (allow-list `['web','mobile']`, default `web`) ใช้ใน log `room_created` |
| `moph-meet/app.json`, `package.json` | + `expo-clipboard`, `@react-native-community/datetimepicker` |
| `moph-meet/assets/images/icon.png`, `adaptive-icon.png` | ไอคอนใหม่จาก `icon-moph-meet.png` พื้นขาว คงสัดส่วน (เดิมยืดเต็มเฟรมจนเพี้ยน); สำรองเดิมที่ `_icon_backup/` |

ขอบเขต: client อยู่ใน `moph-meet/`, server อยู่ใน `core-lite/` ตาม `lite-only.md`;
ไม่ regress Cookie auth (case-016) — คง `Cookie: token=...` + `credentials:'include'`

## Verification
- **Unit/PBT (jest + fast-check):** 36 tests / 5 suites ผ่านหมด
  - `roomForm.test.ts` Property 1–7 (datetime, payload parity, validation, URL prefixing, result-link selection, platform hint)
  - `api.test.ts` Property 8 (Cookie auth, ไม่มี Authorization)
  - `dashboard.test.tsx` 12 interaction tests (ฟอร์มก่อนยิง API, validation, error 401/500/no-room.id, copy full URL, picker)
- **core-lite integration** (`tests/core-lite/test_api.test.js`): platform hint 3 เคส (mobile/web/invalid) + suite เดิม 33 ผ่าน
- **`tsc --noEmit`:** ไม่มี error
- **บนเครื่อง (emulator Android 16KB, release build):** login (Cookie auth), สร้างห้อง exam/meet, ฟอร์ม, picker, result panel, คัดลอก, เข้าห้อง — ผ่านจริง

## Deploy / Build note (สำคัญ)
- **path-length (MAX_PATH):** build ที่ repo path ยาว (`C:\Users\...\Desktop\moph-meet-mirror`) ทำ `react-native-reanimated` CMake ล้ม (object path เกิน 260 / `ninja mkdir error`).
  → ต้อง build ที่ **path สั้น** เช่น `C:\src\moph` (สำเนา build เท่านั้น ไม่ใช่ git repo). subst drive ไม่ช่วยเพราะ gradle/node canonicalize กลับ real path
- release build เซ็นด้วย debug keystore (พอสำหรับทดสอบ emulator); production ใช้ EAS (ดู `docs/eas-build-plan.md`)
- ไอคอน launcher regenerate ผ่าน `npx expo prebuild -p android` (config plugin `withUnsafeOkHttp` re-apply idempotent — ยืนยัน `setOkHttpClientFactory` ยังอยู่ใน MainApplication.kt)

## Follow-ups / ความเสี่ยง
- Task 9 (platform hint ที่ core-lite) เป็น optional — ทำแล้วแต่ควรให้เจ้าของ spec ยืนยัน behavior ของ log by-platform
- iOS: ยังไม่ได้ build/ทดสอบบนเครื่องจริง (Windows build ไม่ได้) — ต้อง EAS/Mac (ดูแผน)
- `@react-native-community/datetimepicker` เป็น native module — ต้อง prebuild/EAS build ใหม่ทุกครั้งที่เพิ่ม (Expo Go ใช้ไม่ได้กับ flow นี้เพราะไม่มี OkHttp trust-all + Cookie jar)
