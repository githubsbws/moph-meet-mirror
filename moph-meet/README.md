# MOPH Meet — Mobile App

> แอปมือถือสำหรับระบบแพทย์ทางไกล กระทรวงสาธารณสุข (iOS + Android)

## ภาพรวม

Native mobile wrapper สำหรับ MOPH Meet Web Application โดยใช้ WebView เปิดระบบแพทย์ทางไกลภายในแอป พร้อมรองรับ:

- 📸 กล้องและไมโครโฟนสำหรับวิดีโอคอล
- 🔙 ปุ่ม Back ของ Android ทำงานร่วมกับ WebView
- 📡 หน้า offline/error เมื่อไม่มีอินเทอร์เน็ต
- 🔒 จำกัดการเข้าถึงเฉพาะโดเมน MOPH เท่านั้น

## ความต้องการ

- **Node.js** 18+
- **Expo CLI** (`npm install -g expo-cli`)
- **Xcode** (สำหรับ iOS build)
- **Android Studio** (สำหรับ Android build)

## การติดตั้ง

```bash
cd moph-meet
npm install
```

## การรัน

```bash
# Development
npx expo start

# iOS
npx expo run:ios

# Android
npx expo run:android
```

## Configuration

แก้ไข URL ใน `app/_layout.tsx`:

```typescript
const APP_URL = __DEV__
  ? 'http://192.168.1.100:3001'    // dev — ใส่ IP เครื่องตัวเอง
  : 'https://moph-meet.moph.go.th'; // production
```

## Build สำหรับ Store

```bash
# iOS
eas build --platform ios

# Android
eas build --platform android
```

## License

© 2026 กระทรวงสาธารณสุข — Ministry of Public Health, Thailand
