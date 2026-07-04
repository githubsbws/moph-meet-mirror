# Requirements Document

## Introduction

เอกสารนี้กำหนดข้อกำหนด (requirements) สำหรับงานอัปเกรด Expo SDK ของแอป **MOPH Meet** (โฟลเดอร์ `moph-meet/`) จาก SDK 52 ไปเป็น SDK 53 แบบ manual โดยมีเป้าหมายหลักคือแก้ปัญหาที่ Google Play ปฏิเสธแอป เนื่องจากไลบรารี native (`.so`) ยังไม่รองรับขนาดหน่วยความจำแบบ 16KB page size บน Android

การอัปเกรดครอบคลุมการยก React 18.3.1 → 19.0.0, React Native 0.76.9 → 0.79.x, NDK 26 → r27+/r28, และการเปิดใช้ New Architecture เป็นค่าเริ่มต้น งานนี้อ้างอิงและทำให้เป็นทางการตามแผน manual upgrade ที่มีอยู่แล้วที่ `docs/mobile-sdk53-upgrade-plan.md`

ขอบเขตงานจำกัดอยู่เฉพาะ `moph-meet/` เท่านั้น ตาม steering `mobile-app.md` และ `lite-only.md` โดยห้ามย้าย business logic เข้ามาในแอป และห้ามแก้ไข `core/` หรือ `user-app/` งานทั้งหมดทำบน git branch `update/expo-sdk53` ซึ่ง base จาก `delivery/mobile-parity` (branch เดียวที่มี Cookie-auth 401 fix ใน `constants/api.ts`)

นอกจากการอัปเกรดเอง เอกสารนี้ยังครอบคลุม: การวิเคราะห์ช่องว่าง (gap analysis) ระหว่างสถานะปัจจุบันและเป้าหมาย, การจัดการ breaking changes และ dependency mapping, การจัดการ conflict ของ native config, การแก้ bug ไอคอนแอป, การ verify ว่าฟีเจอร์เดิมไม่ regress, และเกณฑ์การยอมรับด้าน 16KB page size และ `targetSdkVersion 35`

## Glossary

- **Mobile_App**: แอป MOPH Meet ในโฟลเดอร์ `moph-meet/` (Expo / React Native WebView wrapper)
- **Upgrade_Process**: กระบวนการอัปเกรด Expo SDK 52 → 53 แบบ manual ตามแผน `docs/mobile-sdk53-upgrade-plan.md`
- **Gap_Analysis**: การวิเคราะห์ความแตกต่างระหว่างสถานะปัจจุบัน (SDK 52 / RN 0.76.9 / NDK 26 / React 18) และเป้าหมาย (SDK 53 / RN 0.79 / NDK r27+/28 / React 19)
- **Dependency_Map**: ตารางแมป dependency แต่ละตัวจากเวอร์ชันปัจจุบันไปเวอร์ชันเป้าหมาย พร้อม breaking changes
- **Native_Config**: การตั้งค่า native ของแอป ได้แก่โฟลเดอร์ `android/`, bundle identifiers, permissions, และ `gradle.properties` (หมายเหตุ: config plugin `plugins/withFmtFix.js` เดิมถูกลบออกแล้ว และไม่ถือเป็นส่วนหนึ่งของ Native_Config อีกต่อไป)
- **Prebuild**: คำสั่ง `npx expo prebuild --clean` ที่ regenerate native project จาก config ของ Expo
- **Icon_Assets**: ไฟล์ไอคอนแอปใน `assets/images/` ได้แก่ `icon.png`, `adaptive-icon.png` และไฟล์ที่เกี่ยวข้อง
- **Adaptive_Icon**: ไอคอน Android แบบ adaptive ที่ประกอบด้วย foreground image และ backgroundColor ตาม `app.json`
- **Cookie_Auth**: กลไกการส่ง token ผ่าน HTTP header `Cookie: token=...` พร้อม `credentials: 'include'` ใน `constants/api.ts` (fix ของ bug 401 case 016)
- **WebView_Feature**: ฟีเจอร์ WebView ใน `app/_layout.tsx` ครอบคลุม camera/mic, `ALLOWED_HOSTS`, ปุ่ม back ของ Android, และหน้าจอ offline
- **Login_Feature**: ฟีเจอร์ login ใน `app/index.tsx` ครอบคลุม ProviderID OAuth และ username/password
- **Page_Size_16KB**: ข้อกำหนดของ Google Play ที่ไลบรารี native `.so` ทุกตัวต้อง align ที่ขนาด 16KB
- **SO_Library**: ไลบรารี native แบบ shared object (`.so`) ที่ถูกบรรจุใน APK/AAB
- **Fresco_Libs**: ไลบรารีถอดรหัสรูปกลุ่ม Fresco ที่เสี่ยง ได้แก่ `libgifimage.so`, `libstatic-webp.so`, `libimagepipeline.so`, `libnative-filters.so`, `libnative-imagetranscoder.so`
- **Alignment_Check**: การตรวจสอบ ELF alignment ของ `.so` แต่ละตัวผ่าน APK Analyzer หรือเครื่องมือตรวจ alignment
- **Emulator_16KB**: Android emulator ที่ใช้ system image รองรับ 16KB page size (`adb shell getconf PAGE_SIZE` = 16384)
- **Smoke_Test**: การทดสอบเบื้องต้นตาม checklist เพื่อยืนยันว่าฟีเจอร์หลักทำงานปกติ
- **Case_Report**: เอกสารสรุปงานภาษาไทยที่ `cases/[NNN]_.../report.md` ตาม steering `case-reports.md`
- **Definition_Of_Done**: เกณฑ์ที่ต้องครบทั้งหมดจึงจะถือว่างานอัปเกรดเสร็จสมบูรณ์

## Requirements

### Requirement 1: การอัปเกรด Expo SDK 52 → 53

**User Story:** As a mobile developer, I want to upgrade the MOPH Meet app from Expo SDK 52 to SDK 53 manually, so that the app ships prebuilt native libraries that satisfy Google Play's 16KB page size requirement.

#### Acceptance Criteria

1. THE Upgrade_Process SHALL อัปเกรด Mobile_App จาก Expo SDK 52 ไปเป็น Expo SDK 53 โดยยกเวอร์ชัน `expo` เป็น `~53.0.x`, `react` เป็น `19.0.0`, `react-dom` เป็น `19.0.0`, และ `react-native` เป็น `0.79.x`
2. THE Upgrade_Process SHALL อัปเกรด Expo SDK ทีละ major version เท่านั้น (52 → 53) โดยไม่ข้ามไปเวอร์ชัน 54 หรือสูงกว่าในงานนี้
3. WHEN เริ่มงานอัปเกรด THE Upgrade_Process SHALL ดำเนินการบน git branch `update/expo-sdk53` ที่ base จาก branch `delivery/mobile-parity`
4. IF branch งานถูก base จาก branch ที่ไม่ใช่ `delivery/mobile-parity` THEN THE Upgrade_Process SHALL หยุดและแจ้งว่า base branch ไม่ถูกต้องก่อนดำเนินการต่อ
5. THE Upgrade_Process SHALL ใช้ `npx expo install --fix` เพื่อปรับ dependency ที่เหลือให้ตรงกับ SDK 53
6. THE Upgrade_Process SHALL รัน `npx expo-doctor` และรายงานผลการตรวจสุขภาพโปรเจกต์
7. WHEN dependency ถูกปรับครบ THE Upgrade_Process SHALL รัน `npx expo prebuild --clean` เพื่อ regenerate native project

### Requirement 2: การวิเคราะห์ช่องว่าง (Gap Analysis)

**User Story:** As a mobile developer, I want a documented gap analysis between the current and target states, so that every version difference and breaking change is identified before implementation.

#### Acceptance Criteria

1. THE Gap_Analysis SHALL ระบุความแตกต่างระหว่างสถานะปัจจุบัน (SDK 52 / RN 0.76.9 / NDK 26 / React 18.3.1) และสถานะเป้าหมาย (SDK 53 / RN 0.79.x / NDK r27+/r28 / React 19.0.0) โดยแต่ละรายการต้องระบุชื่อ component, ค่าเวอร์ชันปัจจุบัน, และค่าเวอร์ชันเป้าหมายครบทั้ง 4 component (SDK, RN, NDK, React)
2. THE Dependency_Map SHALL แสดงเวอร์ชันปัจจุบันและเวอร์ชันเป้าหมายของ dependency แต่ละตัว ได้แก่ `expo`, `react`, `react-dom`, `react-native`, `react-native-reanimated`, `expo-router`, `react-native-webview`, `@types/react`, `jest-expo`, และ `expo-*` packages ทั้งหมด โดยทุก dependency ที่ประกาศไว้ใน `package.json` ต้องปรากฏในตารางและไม่มีรายการใดถูกละเว้น
3. WHERE dependency ตัวใดตัวหนึ่งไม่มีเวอร์ชันเป้าหมายที่รองรับ SDK 53 / RN 0.79.x, THE Gap_Analysis SHALL ระบุสถานะ "ไม่มีเวอร์ชันรองรับ" พร้อมแนวทางทดแทนหรือ mitigation สำหรับ dependency นั้น
4. THE Gap_Analysis SHALL ระบุ breaking changes ของ `react-native-reanimated` จาก `~3.16.1` ไปเป็น `~3.17.x` โดยแต่ละ breaking change ต้องระบุคำอธิบาย, ผลกระทบต่อ Mobile_App, และแนวทางแก้ไข (remediation)
5. THE Gap_Analysis SHALL ระบุ breaking changes ของ `expo-router` จากเวอร์ชัน 4 ไปเป็นเวอร์ชัน 5 โดยแต่ละ breaking change ต้องระบุคำอธิบาย, ผลกระทบต่อ Mobile_App, และแนวทางแก้ไข (remediation)
6. THE Gap_Analysis SHALL ระบุ breaking changes ของ `react-native-webview` บน React Native 0.79 โดยแต่ละ breaking change ต้องระบุคำอธิบาย, ผลกระทบต่อ Mobile_App, และแนวทางแก้ไข (remediation)
7. THE Gap_Analysis SHALL ระบุ breaking changes ของ React 19 ที่กระทบ Mobile_App ได้แก่ JSX transform, ref-as-prop, และ `react-test-renderer` โดยแต่ละรายการต้องระบุผลกระทบต่อ Mobile_App และแนวทางแก้ไข (remediation)
8. THE Gap_Analysis SHALL ระบุสถานะความเข้ากันได้กับ New Architecture (Fabric / TurboModules) ของ native module แต่ละตัว ได้แก่ `react-native-webview`, `react-native-gesture-handler`, `react-native-screens`, `react-native-reanimated`, `expo-blur`, และ `react-native-ble-plx` โดยสถานะของแต่ละ module ต้องเป็นหนึ่งในค่าต่อไปนี้: "รองรับ", "ไม่รองรับ", "ต้องอัปเกรดเวอร์ชัน", หรือ "ไม่ทราบสถานะ"
9. IF native module ตัวใดมีสถานะความเข้ากันได้กับ New Architecture เป็น "ไม่รองรับ" หรือ "ไม่ทราบสถานะ", THEN THE Gap_Analysis SHALL ระบุแนวทาง mitigation หรือทางเลือกทดแทนสำหรับ module นั้น

### Requirement 3: การจัดการ Breaking Changes และการตรวจสอบโค้ดแบบ static

**User Story:** As a mobile developer, I want all known breaking changes resolved and static checks passing, so that the codebase compiles and lints correctly under SDK 53.

#### Acceptance Criteria

1. WHEN พบ breaking change ที่กระทบไฟล์ในโค้ด THE Upgrade_Process SHALL แก้ไขไฟล์ที่ได้รับผลกระทบ และยืนยันความถูกต้องด้วยการทำให้ `npx tsc --noEmit` และ `npx expo lint` จบด้วย exit code 0 โดยไม่มี error รายงานออกมา
2. THE Upgrade_Process SHALL รีวิวและแก้ไขไฟล์ที่ใช้ reanimated ได้แก่ `HapticTab.tsx`, `ParallaxScrollView.tsx`, และ `HelloWave.tsx` ให้คอมไพล์ผ่าน `npx tsc --noEmit` โดยไม่มี type error ที่เกี่ยวข้องกับ API ของ reanimated `~3.17.x`
3. WHEN รัน `npx tsc --noEmit` THE Upgrade_Process SHALL ทำให้คำสั่งจบด้วย exit code 0 โดยไม่มี type error รายงานออกมาแม้แต่รายการเดียว
4. WHEN รัน `npx expo lint` THE Upgrade_Process SHALL ทำให้คำสั่งจบด้วย exit code 0 โดยไม่มี lint ระดับ error รายงานออกมาแม้แต่รายการเดียว
5. IF ไม่สามารถรัน jest หรือ expo ผ่าน CMD ได้เนื่องจากข้อจำกัด UNC path THEN THE Upgrade_Process SHALL ใช้ language-server diagnostics เป็นเครื่องมือตรวจแทนและบันทึกจำนวน diagnostics ที่พบ (ต้องเป็น 0 รายการระดับ error) และ SHALL ถือว่าผลการตรวจยังไม่ได้รับการยืนยันจนกว่าจะรัน build จริงสำเร็จโดยไม่มี compile error
6. WHERE ยังมี workaround 16KB เดิมหลงเหลืออยู่ THE Upgrade_Process SHALL ลบ `android.ndk.maxPageSize=16384` ใน `gradle.properties` และ cmake flag `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` ใน `android/app/build.gradle` ออก และยืนยันว่าไม่มีทั้งสองรายการเหลืออยู่ในไฟล์หลังแก้ไข

### Requirement 4: การจัดการ Native Config และการตรวจจับ Conflict

**User Story:** As a mobile developer, I want native configuration conflicts from prebuild detected and resolved, so that custom configuration and identifiers are preserved after regeneration.

#### Acceptance Criteria

1. WHEN Prebuild regenerate โฟลเดอร์ `android/` THE Upgrade_Process SHALL รีวิว diff และยืนยันว่า custom config ได้แก่ permissions, package name, และ `ndkVersion` ไม่หายไป
2. THE Upgrade_Process SHALL คง iOS `bundleIdentifier` ไว้เป็น `th.go.moph.moph-meet` โดยไม่เปลี่ยนแปลง
3. THE Upgrade_Process SHALL คง Android `package` ไว้เป็น `th.go.moph.meet` โดยไม่เปลี่ยนแปลง
4. IF Prebuild ทำให้ bundle identifier หรือ package name เปลี่ยนไปจากค่าเดิม THEN THE Upgrade_Process SHALL แก้ไขกลับให้ตรงกับค่าเดิม
5. THE Upgrade_Process SHALL ยืนยันว่า config plugin `plugins/withFmtFix.js` ถูกลบออกจากโค้ดเบสแล้ว และไม่มีการอ้างอิง `"./plugins/withFmtFix"` เหลืออยู่ใน array `plugins` ของ `app.json` และ SHALL ยืนยันว่า iOS build ทำงานได้สำเร็จบน React Native 0.79 โดยไม่ต้องใช้ plugin นี้ (plugin เดิม patch `Podfile` ด้วย `FMT_USE_CONSTEVAL=0` สำหรับ target `fmt`/`RCT-Folly` ซึ่งไม่จำเป็นอีกต่อไป)
6. THE Upgrade_Process SHALL ยืนยันว่า `newArchEnabled` ยังคงเป็น `true` หลังการอัปเกรด
7. THE Upgrade_Process SHALL คง Android permissions ทั้งหมดใน `app.json` ได้แก่ `CAMERA`, `RECORD_AUDIO`, `INTERNET`, `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, และ `ACCESS_FINE_LOCATION`

### Requirement 5: การแก้ Bug ไอคอนแอป

**User Story:** As a MOPH Meet user, I want the app icon to display correctly, so that the icon is not squished, over-zoomed, or shown with a wrong background.

#### Acceptance Criteria

1. THE Icon_Assets SHALL มีภาพต้นฉบับ (`icon.png` และ `adaptive-icon.png` ในโฟลเดอร์ `assets/images/`) เป็นรูปสี่เหลี่ยมจัตุรัสอัตราส่วน 1:1 ขนาดไม่น้อยกว่า 1024 x 1024 พิกเซล และแสดงผลโดยคงอัตราส่วน 1:1 เดิมไว้ (ไม่ยืด/บีบจนภาพผิดสัดส่วน และไม่ซูมเข้าจนเนื้อหาไอคอนถูกตัดขอบ)
2. THE Adaptive_Icon SHALL กำหนด `foregroundImage` บนพื้นที่ 108 x 108 dp โดยจัดเนื้อหาหลักของไอคอน (โลโก้/สัญลักษณ์) ให้อยู่ภายใน safe-zone วงกลมเส้นผ่านศูนย์กลาง 66 dp ที่กึ่งกลาง และเว้น padding รอบนอกไม่น้อยกว่า 18 dp ต่อด้าน เพื่อไม่ให้เนื้อหาถูกตัดขอบเมื่อระบบ Android ครอบด้วยรูปทรง (mask) แบบวงกลม สี่เหลี่ยมมน หรือ squircle
3. THE Adaptive_Icon SHALL ใช้ `backgroundColor` เป็นสี MOPH green `#1b7a43`
4. THE Icon_Assets SHALL ถูกจัดเก็บในโฟลเดอร์ `assets/images/`
5. WHEN แอปถูกติดตั้งบนอุปกรณ์ Android THE Mobile_App SHALL แสดงไอคอนที่คงอัตราส่วน 1:1 โดยเนื้อหาไม่ถูกบีบอัดและไม่ถูกซูมเกินจนถูกตัดขอบ และแสดงพื้นหลังเป็นสี MOPH green `#1b7a43`
6. IF `foregroundImage` มีอัตราส่วนไม่เท่ากับ 1:1 หรือมีขนาดเล็กกว่า 1024 x 1024 พิกเซล THEN THE Mobile_App SHALL ให้ขั้นตอน build หยุดล้มเหลว พร้อมแสดงข้อความ error ที่ระบุว่าไฟล์ไอคอนไม่ตรงตามข้อกำหนดสัดส่วน/ขนาด และไม่สร้าง artifact ที่ใช้ไอคอนผิดสัดส่วน

### Requirement 6: การ Verify ไม่ให้ฟีเจอร์เดิม Regress

**User Story:** As a QA reviewer, I want existing behaviors continuously verified during the upgrade, so that no previously working feature or bug fix regresses.

#### Acceptance Criteria

1. THE Cookie_Auth SHALL ส่ง token ผ่าน `Cookie: token=...` พร้อม `credentials: 'include'` ใน `constants/api.ts` และ SHALL ไม่กลับไปใช้ `Authorization: Bearer`
2. WHEN ผู้ใช้ login ด้วย ProviderID THE Login_Feature SHALL ทำ OAuth flow ผ่าน ProviderID ได้สำเร็จ
3. WHEN ผู้ใช้ login ด้วย username และ password THE Login_Feature SHALL authenticate ผ่าน `/api/auth` ได้สำเร็จ
4. WHEN ผู้ใช้เข้าห้องประชุมวิดีโอ THE WebView_Feature SHALL อนุญาตให้ใช้กล้องและไมโครโฟนได้
5. THE WebView_Feature SHALL จำกัดการเข้าถึงเฉพาะ host ที่กำหนดใน `ALLOWED_HOSTS`
6. WHEN ผู้ใช้กดปุ่ม back บน Android THE WebView_Feature SHALL นำทางย้อนกลับตามพฤติกรรมเดิม
7. WHILE อุปกรณ์ไม่มีการเชื่อมต่ออินเทอร์เน็ต THE WebView_Feature SHALL แสดงหน้าจอ offline
8. WHEN สร้างห้องประชุมหลังการอัปเกรด THE Mobile_App SHALL สร้างห้องได้สำเร็จโดยไม่เกิด error 401

### Requirement 7: การจัดการไลบรารี Native และ Fresco Image Libs

**User Story:** As a mobile developer, I want risky native image libraries reviewed and optionally disabled, so that unaligned `.so` libraries are removed from the build when they are not needed.

#### Acceptance Criteria

1. WHERE Mobile_App เป็น WebView wrapper, WHEN Upgrade_Process เริ่มขั้นตอนตรวจสอบไลบรารีรูปภาพ THE Upgrade_Process SHALL สแกนซอร์สโค้ดของ Mobile_App ทั้งหมด เพื่อระบุการใช้งาน component `<Image>` ที่โหลดไฟล์นามสกุล `.gif` หรือ `.webp` แบบ native และบันทึกผลการสแกนเป็นค่าบูลีน `hasNativeGif` และ `hasNativeWebp`
2. IF ผลการสแกน `hasNativeGif` เป็น false THEN THE Upgrade_Process SHALL ตั้งค่า `expo.gif.enabled=false` ใน `android/gradle.properties`
3. IF ผลการสแกน `hasNativeWebp` เป็น false THEN THE Upgrade_Process SHALL ตั้งค่า `expo.webp.enabled=false` ใน `android/gradle.properties`
4. WHEN `expo.gif.enabled` และ `expo.webp.enabled` ถูกตั้งค่าเป็น false และดำเนินการ build เสร็จสิ้น THE Build_Process SHALL สร้าง APK/AAB ที่ไม่มีไฟล์ `libgifimage.so` และ `libstatic-webp.so` บรรจุอยู่
5. WHEN การ build เสร็จสิ้น THE Upgrade_Process SHALL รายงานสถานะ alignment ของ Fresco_Libs แต่ละไฟล์ที่เหลือใน build โดยระบุว่าแต่ละไฟล์จัดตำแหน่งตรงตามขนาดหน้าหน่วยความจำ 16 KB (16384 bytes) หรือไม่ (aligned/not aligned)
6. IF พบ Fresco_Libs อย่างน้อยหนึ่งไฟล์ที่ไม่ได้จัดตำแหน่งตรงตามขนาดหน้าหน่วยความจำ 16 KB THEN THE Upgrade_Process SHALL แจ้งเตือนผู้พัฒนาโดยระบุรายชื่อไฟล์ที่ไม่ผ่าน และคงผลการ build เดิมไว้โดยไม่แก้ไขไฟล์ `.so` โดยอัตโนมัติ

### Requirement 8: การ Build และการ Verify 16KB Page Size

**User Story:** As a release engineer, I want the Android and iOS builds produced through the supported toolchains and verified for 16KB alignment, so that the app can be submitted to the stores.

#### Acceptance Criteria

1. THE Upgrade_Process SHALL build Android ในเครื่องผ่าน Android Studio จาก native project ที่ Prebuild สร้างออกมา
2. WHERE ต้อง build iOS THE Upgrade_Process SHALL push branch ขึ้น git เพื่อให้เครื่อง Mac เป็นผู้ build
3. WHEN build APK/AAB สำเร็จ THE Alignment_Check SHALL ตรวจสอบ ELF alignment ของ SO_Library ทุกตัวใน APK/AAB
4. IF SO_Library ตัวใดไม่ align ที่ 16KB THEN THE Upgrade_Process SHALL ระบุไลบรารีที่ยังไม่ align และไม่ถือว่า 16KB ผ่าน
5. THE Upgrade_Process SHALL ยืนยัน 16KB page size บน Emulator_16KB โดยคำสั่ง `adb shell getconf PAGE_SIZE` SHALL คืนค่า `16384`
6. WHEN รัน Smoke_Test THE Mobile_App SHALL ผ่าน checklist ได้แก่ เปิดแอป, login (ProviderID + manual), สร้างห้อง, เข้าห้องวิดีโอ (camera/mic), ปุ่ม back, และหน้าจอ offline

### Requirement 9: Definition of Done และการปิดงานด้วย Case Report

**User Story:** As a project owner, I want an explicit definition of done and a Thai case report, so that the upgrade is only accepted when all criteria are met and the work is documented.

#### Acceptance Criteria

1. THE Definition_Of_Done SHALL ถือว่างานเสร็จสมบูรณ์เฉพาะเมื่อ Smoke_Test ผ่านโดยไม่มี bug
2. THE Definition_Of_Done SHALL ถือว่างานเสร็จสมบูรณ์เฉพาะเมื่อ Mobile_App รองรับ `targetSdkVersion 35`
3. THE Definition_Of_Done SHALL ถือว่างานเสร็จสมบูรณ์เฉพาะเมื่อ SO_Library ทุกตัวใน APK/AAB align ที่ 16KB และยืนยันบน Emulator_16KB แล้ว
4. WHEN ครบเกณฑ์ Definition_Of_Done ทั้งหมด THE Upgrade_Process SHALL สร้าง Case_Report ภาษาไทยที่ `cases/[NNN]_mobile-sdk53-upgrade/report.md` ตาม steering `case-reports.md`
5. THE Case_Report SHALL ไม่มี secret, credential, token, หรือข้อมูลผู้ป่วย (PII)
6. WHEN สร้าง Case_Report เสร็จ THE Upgrade_Process SHALL อัปเดต `docs/PENDING-PATCHES.md` และ `docs/kiro-handover.md` ให้ตรงกับสถานะงาน

### Requirement 10: การรักษาขอบเขตงาน (Scope Guard)

**User Story:** As a project owner, I want the upgrade confined to the mobile app, so that backend business logic and deprecated projects are not affected.

#### Acceptance Criteria

1. THE Upgrade_Process SHALL แก้ไขไฟล์เฉพาะภายในโฟลเดอร์ `moph-meet/` เท่านั้น (ยกเว้นเอกสาร report และ handover ที่กำหนดไว้)
2. THE Upgrade_Process SHALL ไม่ย้าย business logic เข้ามาใน Mobile_App
3. THE Upgrade_Process SHALL ไม่แก้ไขโฟลเดอร์ `core/` และ `user-app/`
4. WHERE ต้องเปิดหรือปิด manual login THE Upgrade_Process SHALL ควบคุมผ่าน backend env `MANUAL_LOGIN_ENABLED` โดยไม่ผูก flag ไว้ใน Mobile_App
