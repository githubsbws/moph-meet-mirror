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
- Android: **โปรเจกต์นี้เคย EAS build + ขึ้นสโตร์แล้ว** → keystore ถูกเก็บที่ EAS
  (managed credentials) ผูกกับ `projectId 2ba5fef6-62ca-4a4b-ac91-5775592a4df6`
  (slug `moph-meet`) — **EAS จะ reuse keystore เดิมอัตโนมัติ ไม่ gen ใหม่** ตราบใดที่
  login ด้วยบัญชี Expo เดิมที่เป็นเจ้าของ project
  - ⚠️ ถ้า EAS ถามให้สร้าง keystore ใหม่ = แปลว่า login ผิดบัญชี/ผิด project → **อย่าตอบ yes**
    (keystore ใหม่จะเซ็นคนละลายเซ็น → อัปเดตทับบน Play Store ไม่ได้) ให้ตรวจ `eas whoami`
    + `projectId` ให้ตรงก่อน
  - production update: versionCode จัดการอัตโนมัติด้วย `autoIncrement` (profile production,
    `appVersionSource: remote`) — ต้องสูงกว่าตัวที่อยู่บน Play เสมอ

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

---

## 6. Mac Handover — สำหรับ Kiro บนเครื่อง Mac (โฟกัส iOS)

โค้ดถูก push แล้วที่ branch **`update/expo-sdk53`** (commits: `de3811c` feature +
`8b54632` sdk53 sync). Windows build เจอปม MAX_PATH — บน Mac ไม่มีปัญหานี้.

### 6.1 Setup บน Mac
```bash
git clone https://github.com/githubsbws/moph-meet-mirror.git
cd moph-meet-mirror && git checkout update/expo-sdk53
cd moph-meet && npm install

# prerequisites
xcode-select --install                 # Xcode Command Line Tools
sudo gem install cocoapods             # CocoaPods (สำหรับ iOS pods)
brew install watchman                  # แนะนำสำหรับ Metro
npm i -g eas-cli && eas login
```
> `data/*.db` ไม่ได้ถูก push (runtime/มี session token) — ไม่จำเป็นต่อ mobile build.
> `ios/` folder ยังไม่ถูก commit → ต้อง gen ด้วย prebuild (ข้อ 6.2).

### 6.2 สร้าง native iOS project
```bash
cd moph-meet
npx expo prebuild -p ios     # gen ios/ จาก app.json + config plugins
cd ios && pod install && cd ..
```
ตรวจหลัง prebuild:
- [ ] `ios/` ถูกสร้าง, `Podfile.lock` มี
- [ ] bundle id / display name ถูกต้อง (`th.go.moph.meet` / MOPH Meet)
- [ ] icon: iOS ใช้ `assets/images/icon.png` (พื้นขาวทึบ ไม่มี alpha — เตรียมไว้แล้ว) ✓

### 6.3 ⚠️ iOS TLS — จุดที่ต้องจัดการ (สำคัญ)
บน **Android** เราแก้ปัญหา cert ของ backend (self-signed/private CA) ด้วย config
plugin `withUnsafeOkHttp` (trust-all OkHttp). **plugin นี้เป็น Android เท่านั้น** —
บน iOS (NSURLSession) จะ **ไม่ trust cert อัตโนมัติ** → `directLogin`/`apiFetch` อาจล้ม
เหมือนตอนรัน Expo Go บน Android.

ทางแก้บน iOS (เลือกอย่างใดอย่างหนึ่ง):
1. **แนะนำ**: ให้ backend ใช้ cert ที่ trust ได้จริง (public CA) → ไม่ต้อง trust-all
2. ชั่วคราว/เทสต์: เพิ่ม **ATS exception** ใน `Info.plist`
   (`NSAppTransportSecurity` → `NSExceptionDomains` ของโดเมน backend) ผ่าน config
   plugin ฝั่ง iOS (เช่น `withInfoPlist`) — **ยังไม่มีในโปรเจกต์ ต้องสร้างเพิ่ม**
3. ทำ native module trust-all ฝั่ง iOS (ไม่แนะนำ — security risk เท่า Android)

> Action สำหรับ Kiro บน Mac: ก่อน verify login บน iOS ให้เช็คว่า TLS ต่อ backend ได้
> ถ้าล้มด้วย SSL error → เพิ่ม ATS exception (ข้อ 2) แล้ว rebuild. อย่า ship trust-all
> ขึ้น production (ทั้ง iOS/Android) — ดูหมายเหตุความปลอดภัยข้อ 5

### 6.4 Build iOS
```bash
# ทางเลือก A: local (เร็ว, ใช้ simulator/เครื่องต่อสาย)
npx expo run:ios                       # debug บน simulator
# หรือเปิด ios/*.xcworkspace ใน Xcode แล้ว Run

# ทางเลือก B: EAS (แนะนำสำหรับ preview/production + signing อัตโนมัติ)
eas build --profile preview    --platform ios
eas build --profile production --platform ios
eas credentials -p ios                 # จัดการ provisioning/cert ถ้าติด signing
```

### 6.5 Verify บน iOS (checklist)
รัน pre-build gate เดิม (`tsc`, `jest 36/36`, `expo-doctor`) ก่อน แล้วบน artifact/simulator:
- [ ] แอปเปิดไม่ crash (ดู Xcode console / `npx expo run:ios` log)
- [ ] **login Username/Password ผ่าน** (ถ้าล้ม → iOS TLS ข้อ 6.3)
- [ ] สร้างห้อง exam/meet → ฟอร์ม → date/time picker (iOS แสดง picker แบบ iOS)
- [ ] validation (ช่องว่าง/end ≤ start) ระงับการยิง API
- [ ] result panel: คัดลอกลิงก์ (Clipboard) + แชร์ (iOS share sheet) + เข้าห้อง
- [ ] ไอคอนแอปพื้นขาว สัดส่วนถูก (iOS ไม่โชว์ alpha)
- [ ] Cookie auth: ไม่มี header Authorization (Property 8)

### 6.6 หมายเหตุ cross-platform
- date/time picker: iOS render เป็น native iOS style เอง (spinner ที่ตั้งไว้เป็น
  behavior ของ Android; iOS ใช้ UIDatePicker) — ไม่ต้องแก้โค้ด
- `Share` / `Clipboard`: ใช้ได้ทั้งสอง platform (expo-clipboard + RN Share)
- ถ้า EAS build iOS ล้มที่ pods → `cd ios && pod repo update && pod install`
