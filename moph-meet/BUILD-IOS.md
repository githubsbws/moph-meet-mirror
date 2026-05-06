# MOPH Meet — iOS Build & Test Manual

> Version **1.1.0** · Expo SDK **~52** · React Native **0.76.9**  
> Bundle ID: `th.go.moph.meet` · Scheme: `mophmeet://` · Min iOS: **15.1**

---

## ข้อกำหนดระบบ (Requirements)

| รายการ | เวอร์ชัน |
|--------|---------|
| macOS | 13 Ventura หรือสูงกว่า |
| Xcode | 15.x หรือสูงกว่า |
| Node.js | 18.x หรือสูงกว่า (แนะนำ 22.x ผ่าน nvm) |
| CocoaPods | 1.14.x หรือสูงกว่า |
| Ruby | 3.x (ใช้ `rbenv` หรือ `rvm` แนะนำ) |

---

## 1. ติดตั้ง Dependencies

```bash
# Clone หรือแตกไฟล์ source
cd moph-meet

# ติดตั้ง Node packages
npm install

# ติดตั้ง iOS pods
cd ios
pod install
cd ..
```

---

## 2. Prebuild (ถ้ายังไม่มีโฟลเดอร์ `ios/`)

หากโฟลเดอร์ `ios/` ไม่มีอยู่ ให้รัน:

```bash
npx expo prebuild --platform ios --clean
cd ios && pod install && cd ..
```

> ⚠️ ต้องมี Apple Developer Account และ Provisioning Profile ก่อน

---

## 3. Build ด้วย Xcode

### วิธีที่ 1 — Xcode GUI (แนะนำสำหรับ Test บน Device)

1. เปิดไฟล์ `ios/MOPHMeet.xcworkspace` ด้วย Xcode
2. เลือก Team ที่ถูกต้องใน **Signing & Capabilities**
3. เลือก Target Device (Simulator หรือ Physical iPhone)
4. กด **▶ Run** (⌘R) เพื่อ Build และรัน

### วิธีที่ 2 — Command Line (xcodebuild)

```bash
# Build สำหรับ Simulator
cd ios
xcodebuild \
  -workspace MOPHMeet.xcworkspace \
  -scheme MOPHMeet \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 15,OS=latest' \
  build

# Build สำหรับ Physical Device (ต้องมี Provisioning Profile)
xcodebuild \
  -workspace MOPHMeet.xcworkspace \
  -scheme MOPHMeet \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/MOPHMeet.xcarchive \
  archive
```

---

## 4. Export IPA (สำหรับแจกจ่าย)

```bash
cd ios

# Export Archive เป็น IPA (ต้องมี ExportOptions.plist)
xcodebuild \
  -exportArchive \
  -archivePath build/MOPHMeet.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/IPA/
```

ตัวอย่าง `ExportOptions.plist` สำหรับ Ad Hoc:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>ad-hoc</string>
  <key>teamID</key>
  <string>YOUR_TEAM_ID</string>
  <key>compileBitcode</key>
  <false/>
</dict>
</plist>
```

---

## 5. Test บน Simulator

### รัน Expo Dev Server
```bash
cd moph-meet
export PATH=$HOME/.nvm/versions/node/v22.16.0/bin:$PATH
npx expo start --ios
```

### Test E2E (Playwright — Web)
```bash
cd tests/moph-meet
npm install
node e2e.test.js
# รายงาน HTML จะอยู่ที่ test-results/[timestamp]/report.html
```

---

## 6. การตั้งค่า Environment

แอปใช้ค่าคงที่จาก `constants/api.ts`:

```typescript
// constants/api.ts
export const API_BASE  = 'https://moph-meeting.moph.go.th';   // API Server
export const JITSI_URL = 'moph-meetingroom.moph.go.th';        // Jitsi Domain
export const AUTH_URL  = 'https://moph-meeting.moph.go.th/api/auth/hie';
```

> สำหรับ Test ให้ใช้ค่าที่มีอยู่ หรือสร้างไฟล์ `.env.local` เพื่อ Override

---

## 7. Deep Link (OAuth Callback)

แอปรับ deep link ในรูปแบบ:
```
mophmeet://auth?token=<JWT_TOKEN>&user=<JSON_ENCODED_USER>
```

ตัวอย่างสำหรับ test บน Simulator:
```bash
xcrun simctl openurl booted \
  "mophmeet://auth?token=test-token-123&user=%7B%22name%22%3A%22Test%20User%22%7D"
```

---

## 8. โครงสร้าง Source Code

```
moph-meet/
├── app/                    # Expo Router screens
│   ├── index.tsx           # Login / OAuth entry
│   ├── dashboard.tsx       # Main dashboard
│   ├── meet/[id].tsx       # Jitsi meeting room
│   └── exam/[id].tsx       # Patient queue → meeting
├── constants/
│   ├── api.ts              # API endpoints
│   ├── jitsiEmbed.ts       # Jitsi External API HTML builder
│   └── storage.ts          # SecureStore helpers
├── assets/images/          # App icons & splash
├── android/                # Android prebuild (reference)
└── app.json                # Expo config
```

---

## 9. ข้อมูลสำคัญ

| รายการ | ค่า |
|--------|-----|
| App Name | MOPH Meet |
| Bundle ID (iOS) | `th.go.moph.meet` |
| Package (Android) | `th.go.moph.meet` |
| URL Scheme | `mophmeet://` |
| Jitsi Domain | `moph-meetingroom.moph.go.th` |
| Prejoin Page | **ปิด** (ข้ามเข้าห้องทันที) |
| Mic/Camera Default | Mute ทั้งคู่เมื่อเข้าห้อง |

---

## 10. ผลการทดสอบล่าสุด (Android Emulator Reference)

| Feature | ผล |
|---------|-----|
| App Launch & Login Screen | ✅ 4/5 (User logged in จาก session ก่อน) |
| OAuth Deep Link → Dashboard | ✅ 3/3 |
| Native UI Screenshot Tour | ✅ 3/3 |
| Web (3 devices × 5 features) | ✅ 84/84 |

รายงาน E2E ฉบับเต็ม: `test-results/20260506-2336/report.html`

---

*สร้างโดย: MOPH Telemedicine Team · May 2026*
