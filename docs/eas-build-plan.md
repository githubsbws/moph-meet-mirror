# EAS Build Plan — MOPH Meet (`moph-meet/`)

แผน build ด้วย **EAS Build** สำหรับ Android + iOS ทั้ง profile `preview` และ
`production` พร้อมขั้นตอน verify ให้ Kiro อ่าน/ทำตามได้ระหว่างและหลัง build.

> Context: แอปเป็น Expo SDK 53 (RN 0.79 / React 19, New Architecture). ต้องคง
> Cookie auth (case-016) + config plugin `withUnsafeOkHttp` (trust-all TLS) และ
> `withFrescoFlags`. Android ต้องผ่าน 16KB page size (Google Play).

---

## 0. Prerequisites (ทำครั้งเดียว)

```bash
cd moph-meet
npm i -g eas-cli          # หรือใช้ npx eas-cli
eas login                 # เข้าบัญชี Expo (ต้องมี EAS)
eas whoami                # verify ล็อกอิน
```

- ต้องมี `EXPO_TOKEN` (CI) หรือ interactive login
- iOS: ต้องมี Apple Developer account (EAS จัดการ signing ให้ได้ผ่าน `eas credentials`)
- Android: EAS สร้าง/เก็บ keystore ให้ (managed) — **อย่าใช้ debug keystore สำหรับ production**

> เลี่ยงปม MAX_PATH บนเครื่อง local: EAS build รันบน cloud/Linux → ไม่เจอปัญหา
> path-length ของ reanimated เหมือน build บน Windows local

---

## 1. `eas.json` (profiles)

สร้าง/ตรวจ `moph-meet/eas.json`:

```json
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" },
      "ios": {}
    }
  },
  "submit": { "production": {} }
}
```

- **preview** → APK (Android) / ad-hoc IPA (iOS) สำหรับแจกทดสอบภายใน
- **production** → AAB (Play Store) / IPA (App Store), `autoIncrement` เลข build

---

## 2. คำสั่ง build (4 combinations)

```bash
# Android
eas build --profile preview     --platform android
eas build --profile production  --platform android

# iOS
eas build --profile preview     --platform ios
eas build --profile production  --platform ios

# หรือพร้อมกันสองแพลตฟอร์ม
eas build --profile preview --platform all
```

แนะนำลำดับ: **preview android → verify → preview ios → verify → production ทั้งคู่**

---

## 3. Verify — ให้ Kiro อ่าน/ทำตาม (ก่อน–ระหว่าง–หลัง build)

### 3.1 Pre-build gate (local, ต้องผ่านก่อนสั่ง EAS)
รันใน `moph-meet/`:
```bash
npx tsc --noEmit                         # ต้องไม่มี type error
npx jest --ci --forceExit                # ต้อง 36/36 ผ่าน (5 suites)
npx expo-doctor                          # ตรวจ config/deps ให้เขียว
```
เกณฑ์ผ่าน: tsc ไม่มี error, jest ผ่านทั้งหมด, expo-doctor ไม่มี ❌

### 3.2 ระหว่าง EAS build — อ่าน log หา failure signature
Kiro อ่าน build log (จาก URL ที่ EAS พิมพ์ หรือ `eas build:view`). จับ pattern:

| อาการใน log | สาเหตุ/สิ่งที่ต้องทำ |
|---|---|
| `undefined symbol: std::__ndk1::...` / `ninja: ... mkdir` | reanimated CMake (path/NDK) — บน EAS ไม่ควรเจอ; ถ้าเจอ ตรวจ `ndkVersion` / reanimated เวอร์ชัน |
| `Unable to resolve module` / Metro bundling error | import ผิด/ไฟล์ขาด — ตรวจว่าไฟล์ commit ครบ (`roomForm.ts`, `dashboard.tsx`) |
| `expo-clipboard`/`datetimepicker` autolink fail | เช็ค `package.json` + `app.json` plugins commit แล้ว |
| iOS `code signing` error | `eas credentials -p ios` จัดการ provisioning |
| `Duplicate symbols` / Fresco/Glide | ตรวจ `withFrescoFlags` plugin |
| `16 KB` / page size warning | ตรวจ `android.ndk.maxPageSize`/`experiencesPageSize16kb` (มีใน branch แล้ว) |

ถ้า build ล้ม → อ่าน `- Gradle`/`- Fastlane`/`- Prebuild` phase ที่ FAILED, สรุป root cause,
แก้ที่ `moph-meet/` หรือ config, commit, แล้ว re-run

### 3.3 Post-build smoke test (บน artifact จริง)
**Android (APK/AAB):**
```bash
# preview APK: ติดตั้งบน emulator/เครื่องจริง
adb install -r <artifact>.apk
adb shell monkey -p th.go.moph.meet -c android.intent.category.LAUNCHER 1
# 16KB verify (ต้องใช้ emulator 16KB):
adb shell getconf PAGE_SIZE        # ต้อง = 16384
```
เช็ค checklist (parity flow):
- [ ] login ด้วย Username/Password ได้ (Cookie auth ผ่าน backend จริง)
- [ ] กดสร้างห้องตรวจ/ประชุม → เปิด **ฟอร์ม** (ไม่ยิง API ทันที)
- [ ] แตะวันที่ → date picker; แตะเวลา → **spinner** picker
- [ ] validation: เว้นช่อง/end ≤ start → error ไม่ยิง API
- [ ] สร้างสำเร็จ → result panel (ชื่อห้อง + คัดลอกลิงก์ full URL + เข้าห้อง)
- [ ] ไอคอน launcher = โลโก้ MOPH Meet พื้นขาว สัดส่วนถูก ไม่ยืด
- [ ] ไม่มี crash ใน `adb logcat` (กรอง `FATAL|ReactNativeJS.*Error`)

**iOS (IPA):** ติดตั้งผ่าน TestFlight/ad-hoc แล้วเช็ค checklist เดียวกัน
(โดยเฉพาะ Cookie auth + date/time picker + ไอคอน — iOS icon ต้องทึบ ไม่มี alpha)

### 3.4 Regression guard (ห้าม regress)
- Cookie auth: ต้อง **ไม่มี** header `Authorization` (case-016) — Property 8 test คุ้มไว้แล้ว
- ห้ามย้าย business logic เข้าแอป (lite-only) — `/api/*` เป็นของ core-lite

---

## 4. Submit (หลัง production build ผ่าน + verify)
```bash
eas submit --profile production --platform android   # → Google Play
eas submit --profile production --platform ios       # → App Store Connect
```
- Android: ต้องผ่าน 16KB requirement
- iOS: icon ต้องไม่มี alpha (ใช้ `icon.png` พื้นขาวทึบที่เตรียมไว้)

---

## 5. หมายเหตุความปลอดภัย
- `withUnsafeOkHttp` = **trust-all TLS** (MITM risk) — เป็น workaround ชั่วคราวสำหรับ
  cert ของ backend. TODO: เปลี่ยนเป็น cert pinning / trust เฉพาะ CA ก่อนขึ้น production จริง
- อย่า commit keystore/credentials/`EXPO_TOKEN` ลง git — ให้ EAS จัดการ (managed credentials)
