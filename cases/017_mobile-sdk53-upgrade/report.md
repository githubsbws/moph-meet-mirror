# Case 017 — Mobile app อัปเกรด Expo SDK 52 → 53 + รองรับ 16KB page size

วันที่: 2026-07-03
Branch: `update/expo-sdk53` (base จาก `delivery/mobile-parity`)
ขอบเขตงาน: เฉพาะใน `moph-meet/` + เอกสาร allowlist (`cases/017.../report.md`, `docs/PENDING-PATCHES.md`, `docs/kiro-handover.md`)

---

## 1. อาการ (Symptom)

- Google Play ปฏิเสธแอป เพราะ native library (`.so`) ไม่รองรับ **16KB page size** (บังคับสำหรับ Android 15 / targetSdk 35)
- ต้องยกระดับจาก **Expo SDK 52 → 53** (React Native 0.79 / React 19) ให้ตรงเงื่อนไข toolchain ปัจจุบัน

## 2. Root cause (สาเหตุ)

- Toolchain ของ SDK 52 (NDK 26) สร้าง native lib ที่ align แบบเก่า (ไม่ใช่ 16KB / `0x4000`)
- ของเดิมเคยแก้ชั่วคราวด้วย `android.ndk.maxPageSize=16384` + cmake flag `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` ซึ่งเป็น workaround ไม่ใช่ทางแก้จริง
- ทางแก้ถาวรคือขึ้น NDK r27 (มากับ SDK 53 / RN 0.79) ที่ align 16KB โดย default แล้วเอา workaround ออก

## 3. Fix (แก้อะไรบ้าง — ทั้งหมดใน `moph-meet/`)

### 3.1 Dependency migration → Expo SDK 53
- `package.json`: `expo` ~53.0.0, `react`/`react-dom` 19.0.0, `react-native` 0.79.6, `expo-router` ~5.1.0, `react-native-reanimated` ~3.17.4, `jest-expo` ~53, `@types/react` ~19
- เพิ่ม `.npmrc` (`legacy-peer-deps=true`)
- เพิ่ม `react-native-ble-plx` ^3.5.1 (เดิมมีการอ้างถึงแต่ยังไม่ได้ติดตั้ง)
- ยก major ครั้งเดียว 52 → 53 (ไม่ข้าม 54+)

### 3.2 Native config reconciliation (`expo prebuild --clean`)
- NDK r27 (27.1.12297006)
- `targetSdkVersion 35` ย้ายไปตั้งใน plugin `expo-build-properties` (ใน SDK 53 ตั้ง `android.targetSdkVersion` ใน `app.json` ไม่ได้แล้ว)
- คงค่าเดิม: permissions 8 รายการ, bundle identifier / package name, `newArchEnabled=true`
- ลบ workaround 16KB เดิม (`android.ndk.maxPageSize` และ `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES`)

### 3.3 Breaking-change remediation + static gate
- reanimated / expo-router / react-native-webview / React 19: ไม่ต้องแก้โค้ด (compatible กับ SDK 53 อยู่แล้ว)
- Static gate ผ่าน: `tsc --noEmit` 0 error, `expo lint` 0 error (ตั้ง eslint flat config)

### 3.4 Cookie auth คงไว้ (ไม่ regress — อ้างอิง case 016)
- `constants/api.ts` ยังส่ง `Cookie: token=...` + `credentials:'include'` ไม่มี `Authorization: Bearer`
- แยกส่วนสร้าง request options เป็น `buildApiRequestInit` (ทดสอบได้)
- แยก host whitelist ไป `constants/hostWhitelist.ts` และ wire เข้า `app/meet/[id].tsx` + `app/exam/[id].tsx` (เดิม `originWhitelist ['*']` ไม่มี host gating → ตอนนี้ปลอดภัยขึ้น)

### 3.5 Media libs (Fresco)
- ไม่พบการใช้ gif/webp แบบ native (แอปเป็น WebView wrapper) → ตั้ง `expo.gif.enabled=false` / `expo.webp.enabled=false`
- ทำแบบคงทนผ่าน config plugin `plugins/withFrescoFlags.js` (ไม่หายทุกครั้งที่ prebuild) → `libgifimage.so` / `libstatic-webp.so` หลุดออกจาก APK

### 3.6 Icon
- แก้ launcher adaptive icon: logo อยู่ใน safe-zone 66% + transparent padding + upscale เป็น 1024
- adaptive icon background เปลี่ยนเป็น **ขาว (`#ffffff`)**
- login icon คงเดิม

### 3.7 OkHttp (direct-login SSL workaround)
- กู้ `UnsafeOkHttpClientFactory` (ถูก prebuild ล้าง) กลับมาแบบคงทนผ่าน config plugin `plugins/withUnsafeOkHttp.js`

### 3.8 อื่นๆ
- ลบ plugin `withFmtFix.js` ออก (เป็นการแก้ที่ผิด/ไม่จำเป็น)
- Support tooling ใน `moph-meet/scripts/`: icon-validator, media-scanner, media-flags, alignment, scope-guard, gap-analysis, new-arch-validator, branch-guard, definition-of-done, check-icons, check-alignment, scan-media

## 4. Verification (ผลการยืนยัน)

- **Android release build: SUCCESS** — build จาก short path `C:\src\moph` ผ่าน SDK junction `C:\android-sdk` (เลี่ยง Windows MAX_PATH + ปัญหา NDK libc++ link ที่พังเพราะ path มีช่องว่าง) — เป็นการปรับ **environment เท่านั้น ไม่แตะโค้ดใน repo**
- **16KB static:** `scripts/check-alignment.ts` → `.so` ทั้ง 17 ตัว align 16KB (`0x4000`); `libgifimage.so` / `libstatic-webp.so` ABSENT
- **16KB runtime:** 16KB emulator (`system-images;android-35;google_apis_ps16k;x86_64`, AVD `Emulator_16KB`) → `adb shell getconf PAGE_SIZE` = **16384**
- **Launch:** แอปเปิดบน emulator ไม่ crash (RN New Arch Bridgeless + WebView Chromium 124) ถึงหน้า login
- **OkHttp:** Kotlin compile ผ่านภายใต้ RN 0.79

## 5. Deploy

- **ยังไม่ deploy อะไร**
- Android: ได้ APK `build-artifacts/app-release.apk`
- iOS: **ยังไม่ build** (ต้อง Mac)
- ยังไม่ git push

## 6. Follow-ups / ความเสี่ยง (สำคัญ)

- **INTERACTIVE SMOKE ยังค้าง (Req 8.6):** login ProviderID, manual login, สร้างห้องโดยไม่เจอ 401, วิดีโอ camera/mic, back/offline — ต้องมี credential + backend จริง ให้ dev เดินบน device/emulator
- **iOS build ค้าง:** ต้อง push branch `update/expo-sdk53` แล้ว build บน Mac
- **SECURITY:** `UnsafeOkHttpClientFactory` ปิดการตรวจ TLS ทั้งหมด (MITM risk) — ต้องยกระดับเป็น cert allow-list / pinning ก่อน production / VA (มี note ใน `kiro-handover.md` แล้ว)
- **Windows build:** ต้องใช้ short path + SDK path ที่ไม่มีช่องว่าง (แจ้ง dev ให้ทราบ)

---

## ภาคผนวก — หลักฐานการทดสอบ 16KB + targetSdk 35 (จาก APK จริง)

APK: `moph-meet/build-artifacts/app-release.apk` (v1.1.0, `th.go.moph.meet`)

**targetSdk 35 / compileSdk 35 (จาก `aapt2 dump badging`):**
```
package: name='th.go.moph.meet' versionCode='1' versionName='1.1.0' platformBuildVersionName='15' platformBuildVersionCode='35'
compileSdkVersion='35' compileSdkVersionCodename='15'
minSdkVersion:'24'  targetSdkVersion:'35'
native-code: 'arm64-v8a' 'armeabi-v7a' 'x86' 'x86_64'
```

**16KB alignment — static (ELF LOAD segment):** `scripts/check-alignment.ts` กับ `build-artifacts/so-alignment.txt` (llvm-readelf -l, NDK r27) → `.so` ทั้ง 17 ตัว LOAD align = `0x4000` (16384) ครบทุกตัว; `libgifimage.so`/`libstatic-webp.so` ABSENT → **gate PASS**

**16KB page size — runtime:** บน emulator 16KB (`system-images;android-35;google_apis_ps16k;x86_64`, AVD `Emulator_16KB`)
```
$ adb shell getconf PAGE_SIZE
16384
```
+ ติดตั้ง APK (x86_64) สำเร็จ, launch ไม่ crash (RN New Arch + WebView Chromium 124) ถึงหน้า login

**สรุป:** ยืนยันครบทั้ง static (ELF 0x4000) + runtime (PAGE_SIZE=16384) + targetSdk 35 → APK ที่อัปโหลดผ่านเงื่อนไข Google Play 16KB / Android 15 ได้

**Smoke (บน 16KB emulator):** direct login + สร้างห้อง/วิดีโอ/back/offline (ข้อ 2–6) ผ่าน; ProviderID รอ SA ทดสอบร่วม (ถือรหัส)

**Icon (final):** launcher adaptive icon = โลโก้ 36% ของ canvas + padding, พื้นขาว, ไม่ตกขอบ mask; store listing icon 512×512 ที่ `moph-meet/store-assets/play-store-icon-512.png`
