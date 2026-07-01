# แผนงาน — Manual Upgrade: Expo SDK 52 → 53 (แก้ Android 16KB Page Size)

> สร้าง: 2 กรกฎาคม 2026
> โปรเจกต์: `moph-meet/` (mobile app — Expo / React Native)
> เป้าหมาย: อัปเกรด Expo SDK 52 → 53 แบบ manual เพื่อให้ผ่านข้อกำหนด 16KB page size ของ Google Play
> วิธี: manual (ไม่ใช้ ATX) — เหตุผลสรุปไว้ท้ายเอกสาร

---

## ทำไม manual (ไม่ใช้ ATX)

- ATX **รันบน Windows native ไม่ได้** ต้องใช้ WSL + ติดตั้ง Linux distro + ตั้ง AWS credentials/region/สิทธิ์ — setup cost สูง
- เคสนี้เป็น **แอปเดียว** เส้นทาง upgrade มีเอกสารทางการชัด (Expo upgrade guide) → manual เป็นวิธีมาตรฐาน
- สิ่งที่แก้ 16KB จริงคือ **ตัว SDK/RN/NDK ใหม่** ไม่ใช่ ATX — ปลายทางเดียวกัน
- ข้อเสีย: ต้องจัดการ breaking change เอง (reanimated, react 19) → เก็บ ATX ไว้เป็นทางสำรองถ้าติดหนัก

---

## เวอร์ชันเป้าหมาย (SDK 53)

| Package | ปัจจุบัน (SDK 52) | เป้าหมาย (SDK 53) | หมายเหตุ |
|---|---|---|---|
| `expo` | ~52.0.46 | ~53.0.x | |
| `react` | 18.3.1 | 19.0.0 | New JSX transform, breaking |
| `react-dom` | 18.3.1 | 19.0.0 | |
| `react-native` | 0.76.9 | 0.79.x | นำ prebuilt .so ที่ align 16KB มา |
| `react-native-reanimated` | ~3.16.1 | ~3.17.x | v4 เป็น optional — คง 3.17 ก่อนเพื่อลดความเสี่ยง |
| `@types/react` | ~18.3.12 | ~19.0.x | |
| `jest-expo` | ~52.0.6 | ~53.0.x | |
| `expo-*` ทั้งหมด | SDK52 range | SDK53 range | ให้ `expo install --fix` จัดการ |

> **หลักการ:** อัปเกรดทีละ major (52 → 53) เท่านั้น อย่ากระโดด 52 → 54/55 ตรงๆ ถ้าจำเป็นต้องไป 54 ให้ทำหลัง 53 ผ่านแล้ว

---

## Step 1 — แยก branch ก่อน upgrade

**Base branch = `delivery/mobile-parity`** — เป็น branch เดียวที่มี Cookie 401 fix
ใน `constants/api.ts` ครบ (`credentials: 'include'` + `Cookie: token=`). อย่า base
จาก `delivery/allow-user-login` เพราะที่นั่น `apiFetch` ยังเป็น `Authorization: Bearer`
(bug 401 จะกลับมา).

> git นี้เป็น **mirror ของ git จริง** ปลอดภัยต่อการทดลอง แต่ยังต้องแยก branch

```bash
git checkout delivery/mobile-parity     # base ที่ถูกต้อง
git status                               # ยืนยันสะอาด
git checkout -b update/expo-sdk53        # branch งาน upgrade (prefix update/)
```

- ห้าม upgrade บน master / delivery โดยตรง
- commit เป็น step ย่อย (dependency bump / prebuild / code fixes แยก commit) เพื่อ rollback ง่าย

---

## Step 2 — รัน manual upgrade

> รันบน Windows เครื่องนี้ได้ (npm/expo ทำงาน native) หรือใน WSL ก็ได้

```bash
cd moph-meet

# 2.1 bump expo
npm install expo@^53.0.0

# 2.2 ให้ expo จัด dependency ที่เหลือให้ตรง SDK 53
npx expo install --fix

# 2.3 ตรวจสุขภาพโปรเจกต์
npx expo-doctor

# 2.4 regen native projects (โปรเจกต์นี้ commit โฟลเดอร์ android/ ไว้)
npx expo prebuild --clean
```

**สิ่งที่ต้องเฝ้าดูใน step นี้:**
- โฟลเดอร์ `android/` ถูก commit ไว้ในโปรเจกต์ → `prebuild --clean` จะ regen ใหม่ ต้องรีวิว diff ว่า config custom (permissions, ndkVersion, package name) ไม่หาย
- **ห้ามแตะ bundle identifier / package name** — ค่าที่ตั้งอยู่ถูกต้องแล้ว:
  iOS `bundleIdentifier` = `th.go.moph.moph-meet` (ลูกค้าแก้มาเอง), Android `package` = `th.go.moph.meet`.
  ถ้า `prebuild --clean` ทำให้ค่าเพี้ยน ต้องแก้กลับให้ตรงเดิม
- custom config plugin `plugins/withFmtFix.js` (แก้ Podfile ฝั่ง iOS) — ตรวจว่ายังจำเป็น/ทำงานกับ RN 0.79 ไหม
- `newArchEnabled: true` อยู่แล้ว → SDK 53 เปิด New Arch เป็น default พอดี แต่ต้องเทสว่า native module ทุกตัวรองรับ New Arch

---

## Step 3 — ตรวจสอบโค้ด + breaking changes ทั้งหมด (หลัง upgrade)

### 3.1 Breaking changes ที่รู้แล้ว ต้องไล่เช็ค

| หัวข้อ | ต้องทำ |
|---|---|
| **React 19** | เช็ค `react-test-renderer` (deprecated ใน React 19), JSX transform, ref-as-prop, การใช้ `useRef`/`forwardRef` |
| **react-native-reanimated 3.17** | เช็ค worklet API, `useAnimatedStyle`, `HapticTab.tsx`, `ParallaxScrollView.tsx`, `HelloWave.tsx` |
| **react-native-webview** | ไฟล์หลัก `app/_layout.tsx` — เช็ค props/behavior ของ WebView บน RN 0.79 (camera/mic, back handler, domain whitelist) |
| **expo-router ~4 → ~5** | typed routes, `app/` structure, deep link scheme `mophmeet://` |
| **expo-secure-store / expo-auth-session** | flow login (ProviderID + manual) ใน `app/index.tsx`, `constants/api.ts`, `constants/storage.ts` |
| **New Architecture** | native module ทุกตัว (webview, gesture-handler, screens, reanimated, blur) ต้องรองรับ Fabric/TurboModules |

### 3.2 ไฟล์ที่ต้องรีวิวเป็นพิเศษ

- `app/_layout.tsx` — WebView config, ALLOWED_HOSTS, offline handling, Android back button
- `app/index.tsx` — login (ProviderID + username/password จาก case 006)
- `app/dashboard.tsx`, `app/exam/`, `app/meet/` — หน้าหลัก
- `constants/api.ts` — มี fix bug 401 (Cookie auth) จาก case 016 → **ต้องไม่หาย**
- `constants/jitsiEmbed.ts` — Jitsi integration

### 3.3 ตรวจแบบ static (ทำบนเครื่องนี้ได้)

```bash
cd moph-meet
npx tsc --noEmit        # type check
npx expo lint           # lint
npm test -- --watchAll=false   # jest-expo (ถ้ารันได้บนเครื่องนี้)
```

> หมายเหตุ: case 006 เคยรัน jest/expo ผ่าน CMD ไม่ได้ (UNC path `\\wsl.localhost`) — ถ้าเจออีก ให้ใช้ language-server diagnostics + reasoning เป็นตัวช่วยตรวจ แล้วยืนยันจริงตอน build

### 3.4 16KB verification (สำคัญที่สุด — คือเป้าหมายงาน)

หลัง build ได้ `.aab`/`.apk` แล้ว:
```bash
# เช็ค page size ของ device/emulator
adb shell getconf PAGE_SIZE     # ควรได้ 16384 บน emulator 16KB

# ตรวจ alignment ของ .so ทุกตัวใน apk/aab
# (ใช้ Android Studio > Build > Analyze APK หรือ script ตรวจ ELF alignment)
```

**สิ่งที่ต้องครบถึงจะ align 16KB จริง (ไม่ใช่แค่เลข SDK):**
- React Native 0.79 (มากับ SDK 53) — ship prebuilt `.so` ที่ align 16KB มาแล้ว
- **NDK r27+/r28** — ปัจจุบัน `android/build.gradle` ตั้ง `ndkVersion = "26.1.10909125"` (NDK 26)
  ต้องเช็คว่า `prebuild --clean` ของ SDK53 ขยับเป็นตัวใหม่ **จริง** (16KB เป็น default ตั้งแต่ NDK r28)
- AGP 8.5.1+

**แยกกลุ่มไลบรารีที่ Google แจ้ง (จาก Play Console):**

กลุ่ม A — RN/Expo core → หายจากการอัป 53 (prebuilt aligned + rebuild):
`libreactnative.so`, `libhermes.so`, `libhermestooling.so`, `libjsi.so`, `libfbjni.so`,
`libc++_shared.so`, `libexpo-modules-core.so`, `libappmodules.so`, `libreact_codegen_*.so`,
`libgesturehandler.so`, `libreanimated.so`, `libworklets.so`, `librnscreens.so`

กลุ่ม B — Fresco (ถอดรหัสรูป) → **กลุ่มเสี่ยง ตกค้างบ่อย ต้อง verify**:
`libgifimage.so`, `libstatic-webp.so`, `libimagepipeline.so`, `libnative-filters.so`,
`libnative-imagetranscoder.so`
- มาจาก flag ใน `android/gradle.properties`: `expo.gif.enabled=true`, `expo.webp.enabled=true`
- **แอปนี้เป็น WebView wrapper** — แทบไม่ใช้ native gif/webp decode → พิจารณา **ปิด flag**:
  ```
  expo.gif.enabled=false
  expo.webp.enabled=false
  ```
  จะตัด `libgifimage.so` + `libstatic-webp.so` ออกจาก build ทั้งก้อน (ตัวเสี่ยงที่สุด)
  ⚠️ ก่อนปิด: เช็คว่าไม่มีหน้าไหนใช้ `<Image>` แสดง gif/webp แบบ native

- ไล่หาไลบรารีที่ยัง fail — ที่รู้กันว่ามีปัญหาแม้ SDK ใหม่: `expo-image` (Glide/avif → `libavif_android.so`,
  `libanimation-decoder-gif.so`) *(หมายเหตุ: 2 ตัวนี้ไม่อยู่ในลิสต์ที่ Google แจ้งมา = แอปนี้ยังไม่โดน)*
- **กฎเหล็ก:** ห้ามถือว่า 16KB ผ่าน จนกว่าจะเปิด APK Analyzer / เช็ค ELF alignment ของ `.so`
  **ทุกตัว** หลัง build จริง แล้วไม่เหลือตัวที่ไม่ align

### 3.5 Cleanup workaround เก่า

ตรวจและลบ workaround 16KB ที่ handover บอกว่าไม่มีผล (ถ้ายังเหลือ):
- `android/gradle.properties` → `android.ndk.maxPageSize=16384` *(ตรวจแล้ว ณ วันเขียน: ไม่พบในไฟล์ top-level — เช็ค `android/app/build.gradle` เพิ่ม)*
- `android/app/build.gradle` → cmake `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`

---

## Step 4 — วิธีเทส / build

### บนเครื่องนี้ (Windows + Android Studio)

หมายเหตุ: `expo`/EAS build บน Windows ทำงานไม่ครบ/ไม่เสถียร → ใช้ **Android Studio**
build native project ที่ `expo prebuild` gen ออกมาแทน

```bash
cd moph-meet
# 1) gen native android project (คำสั่งนี้รันบน Windows ได้)
npx expo prebuild --clean --platform android
```
```
2) เปิด Android Studio → Open → เลือกโฟลเดอร์ moph-meet/android
3) Sync Gradle → เลือก device/emulator → Run  (smoke test)
4) release build เพื่อตรวจ 16KB:
   Android Studio → Build > Generate Signed Bundle/APK
   หรือ CLI: cd android ; .\gradlew assembleRelease  (ได้ .apk)
```

- ใช้ **Android 16KB emulator image** (Android Studio → Device Manager → เลือก system image ที่รองรับ 16KB) เพื่อเทส page size จริง
- Smoke test checklist: เปิดแอป → login (ProviderID + manual) → สร้างห้อง (ยืนยัน bug 401 ไม่กลับมา) → เข้าห้อง video (camera/mic) → back button → offline screen

### iOS build

- **build iOS บนเครื่อง Windows ไม่ได้** → ต้อง push ขึ้น git → ให้เครื่อง **Mac** เป็นคน build (Xcode / EAS)
- workflow: `git push` branch `upgrade/expo-sdk53` → Mac pull → `npx expo prebuild --platform ios` → `pod install` → build/archive
- ตรวจ config plugin `withFmtFix.js` ว่ายังทำงานกับ RN 0.79 (fmt/RCT-Folly patch)

### EAS build (ทางเลือก cloud)

```bash
npx eas build --platform android --profile preview       # APK ตรวจ 16KB
npx eas build --platform android --profile production     # AAB ส่ง Play
npx eas build --platform ios --profile production         # iOS (ไม่ต้องมี Mac)
```

---

## Step 5 — หลังผ่านทุกอย่าง: ทำ report

เมื่อ upgrade + เทสผ่าน (โดยเฉพาะ 16KB verified):
- เขียน case report ที่ `cases/[NNN]_mobile-sdk53-upgrade/report.md` ตาม steering `case-reports.md`
- เนื้อหา: Symptom (16KB reject) → Root cause (SDK52/RN0.76 prebuilt .so 4KB) → Fix (upgrade 53) → Verification (16KB emulator + alignment check + smoke test) → Deploy (build/store) → Follow-ups
- อัปเดต `docs/PENDING-PATCHES.md` (Mobile App: รอ Patch → ✅) และ `docs/kiro-handover.md` (TASK 2 เสร็จ)
- ห้ามใส่ secret/credential/ข้อมูลผู้ป่วยใน report

---

## Rollback

- ทุกอย่างอยู่บน branch `upgrade/expo-sdk53` — ถ้าเจ๊งกลับ branch เดิมได้ทันที
- ไม่ merge เข้า master/delivery จนกว่า 16KB จะ verified ผ่านจริงบน build

---

## Checklist สรุป

- [ ] Step 1: สร้าง branch `upgrade/expo-sdk53`
- [ ] Step 2: `expo@53` + `expo install --fix` + `expo-doctor` + `prebuild --clean`
- [ ] Step 3.1–3.2: ไล่ breaking changes + รีวิวไฟล์สำคัญ (โดยเฉพาะ fix 401 ใน `api.ts` ต้องอยู่)
- [ ] Step 3.3: tsc / lint / test ผ่าน
- [ ] Step 3.4: **16KB verified** (emulator + .so alignment)
- [ ] Step 3.5: ลบ workaround เก่าที่ไม่มีผล
- [ ] Step 4: Android build ในเครื่องผ่าน + push ให้ Mac build iOS
- [ ] Step 5: report.md + อัปเดต PENDING-PATCHES / kiro-handover
