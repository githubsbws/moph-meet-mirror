# MOPH Meet — Mobile App

> แอปมือถือสำหรับระบบแพทย์ทางไกล กระทรวงสาธารณสุข (iOS + Android)
>
> **Handover document** — from outsource developer to BWS Dev Team

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Project Setup](#project-setup)
5. [Configuration](#configuration)
6. [Running in Development](#running-in-development)
7. [Building for Android (APK / AAB)](#building-for-android)
8. [Building for iOS (IPA)](#building-for-ios)
9. [Publishing to Stores](#publishing-to-stores)
10. [Troubleshooting](#troubleshooting)
11. [Key Files Reference](#key-files-reference)
12. [Contacts & References](#contacts--references)

---

## Overview

This is a **native mobile wrapper** (iOS + Android) for the MOPH Meet telemedicine web application. It uses a **WebView** to load the web app inside a native shell, providing:

- 📸 Camera & microphone permissions for video calls
- 🔙 Android hardware back button integration
- 📡 Offline / error screen with retry
- 🔒 Domain whitelist — only MOPH domains allowed
- 🟢 MOPH green branding on splash screen & status bar

**It does NOT contain business logic** — all logic lives in the web app (`user-app-lite/`) and API (`core-lite/`). This app is purely a WebView container.

---

## Architecture

```
┌─────────────────────────────────────┐
│  Mobile App (this repo: moph-meet/) │
│  Expo SDK 52 + React Native 0.76   │
│  ┌───────────────────────────────┐  │
│  │  WebView                      │  │
│  │  → https://moph-meet.moph.go.th │
│  │  (user-app-lite served here)  │  │
│  └───────────────────────────────┘  │
│  + Camera/Mic permissions           │
│  + Offline handling                 │
│  + Android back button              │
└─────────────────────────────────────┘
```

---

## Prerequisites

### For both platforms

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 18+ (recommend 20 LTS) | https://nodejs.org/ |
| **npm** | 9+ | Comes with Node.js |
| **Expo CLI** | Latest | `npm install -g expo-cli` |
| **EAS CLI** | Latest | `npm install -g eas-cli` |
| **Expo Account** | — | Register at https://expo.dev/ |

### For Android builds

| Tool | Version | Install / Ref |
|---|---|---|
| **Android Studio** | Latest | https://developer.android.com/studio |
| **Android SDK** | API 34+ | Via Android Studio → SDK Manager |
| **Java JDK** | 17 | Via Android Studio or `brew install openjdk@17` |
| **ANDROID_HOME** | Set in env | `export ANDROID_HOME=$HOME/Android/Sdk` (Linux) or `~/Library/Android/sdk` (macOS) |

> **Ref:** https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build&buildEnv=local&platform=android

### For iOS builds (macOS only)

| Tool | Version | Install / Ref |
|---|---|---|
| **macOS** | 13+ (Ventura or later) | Required — cannot build iOS on Windows/Linux |
| **Xcode** | 15+ | Mac App Store → https://developer.apple.com/xcode/ |
| **Xcode Command Line Tools** | — | `xcode-select --install` |
| **CocoaPods** | Latest | `sudo gem install cocoapods` |
| **Apple Developer Account** | Paid ($99/year) | https://developer.apple.com/programs/ |

> **Ref:** https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build&buildEnv=local&platform=ios

---

## Project Setup

```bash
# 1. Navigate to mobile app directory
cd moph-meet

# 2. Install dependencies
npm install

# 3. (First time) Login to Expo account
npx eas login

# 4. (First time) Configure EAS build
npx eas build:configure
```

This generates `eas.json` if it doesn't exist. The default config works for most cases.

---

## Configuration

### Production URL

Edit `app/_layout.tsx` line ~11:

```typescript
const APP_URL = __DEV__
  ? 'http://192.168.1.100:3001'      // dev — replace with YOUR local IP
  : 'https://moph-meet.moph.go.th';  // production — the live web app
```

> ⚠️ **For dev:** Use your machine's LAN IP (not `localhost`), because the phone/emulator needs to reach your dev server. Find it with `ifconfig` or `ipconfig`.

### App Identity (app.json)

| Field | Current Value | Notes |
|---|---|---|
| `expo.name` | `MOPH Meet` | Display name on home screen |
| `expo.version` | `1.1.0` | Bump this before each store release |
| `expo.ios.bundleIdentifier` | `th.go.moph.meet` | Must match Apple Developer portal |
| `expo.android.package` | `th.go.moph.meet` | Must match Google Play Console |
| `expo.scheme` | `mophmeet` | Deep link scheme: `mophmeet://` |

### Domain Whitelist

In `app/_layout.tsx`, the `ALLOWED_HOSTS` array controls which domains the WebView can navigate to:

```typescript
const ALLOWED_HOSTS = [
  'moph-meet.moph.go.th',
  'moph-meetingroom.moph.go.th',
  'moph.id.th',           // ProviderID OAuth
  'provider.id.th',       // Provider service
  'localhost',
  '192.168.',              // local dev
];
```

Add/remove domains here if the infrastructure changes.

---

## Running in Development

### Using Expo Go (fastest, limited features)

```bash
npx expo start
```

Scan the QR code with **Expo Go** app (iOS App Store / Google Play).

> ⚠️ Expo Go may not support all WebView features (camera/mic). Use a development build for full testing.

### Development Build (recommended)

```bash
# Android (requires Android Studio + device/emulator)
npx expo run:android

# iOS (requires Xcode + simulator, macOS only)
npx expo run:ios
```

---

## Building for Android

### Option A: Cloud Build via EAS (recommended)

```bash
# APK (for internal testing / sideloading)
npx eas build --platform android --profile preview

# AAB (for Google Play Store submission)
npx eas build --platform android --profile production
```

> **Ref:** https://docs.expo.dev/build/setup/

The build runs on Expo's cloud servers. Download the APK/AAB from the Expo dashboard when done.

### Option B: Local Build

```bash
# Generate native Android project
npx expo prebuild --platform android

# Open in Android Studio
cd android && ./gradlew assembleRelease

# Output: android/app/build/outputs/apk/release/app-release.apk
```

### Signing the APK/AAB

For Google Play, you need a **keystore**:

```bash
# Generate keystore (first time only)
keytool -genkeypair -v -storetype PKCS12 \
  -keystore moph-meet.keystore \
  -alias moph-meet \
  -keyalg RSA -keysize 2048 -validity 10000

# Store this file securely — losing it means you can't update the app on Play Store
```

Configure signing in `eas.json`:

```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "app-bundle",
        "credentialsSource": "local"
      }
    },
    "preview": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

> **Ref:** https://docs.expo.dev/app-signing/local-credentials/

---

## Building for iOS

> ⚠️ **Requires macOS with Xcode installed. Cannot build iOS on Windows/Linux.**

### Option A: Cloud Build via EAS (recommended)

```bash
npx eas build --platform ios --profile production
```

EAS will prompt for Apple Developer credentials and handle provisioning profiles automatically.

### Option B: Local Build

```bash
# Generate native iOS project
npx expo prebuild --platform ios

# Install CocoaPods dependencies
cd ios && pod install && cd ..

# Open in Xcode
open ios/mophmeet.xcworkspace
```

In Xcode:
1. Select **mophmeet** target
2. Go to **Signing & Capabilities**
3. Select your **Team** (Apple Developer account)
4. Set **Bundle Identifier** to `th.go.moph.meet`
5. Select a real device or **Product → Archive** for store build

### iOS Certificates & Provisioning

| Item | Where | Notes |
|---|---|---|
| **Apple Developer Account** | https://developer.apple.com/ | Paid enrollment required |
| **App ID** | Certificates, IDs & Profiles | Register `th.go.moph.meet` |
| **Provisioning Profile** | Certificates, IDs & Profiles | Distribution profile for App Store |
| **Push Notification** | Not needed | This app doesn't use push (yet) |

> **Ref:** https://docs.expo.dev/build/setup/#configure-ios

### App Store Connect

1. Go to https://appstoreconnect.apple.com/
2. Create new app → Bundle ID: `th.go.moph.meet`
3. Fill in app metadata (Thai language, screenshots, description)
4. Upload IPA via **Transporter** app or `eas submit --platform ios`

---

## Publishing to Stores

### Google Play Store

```bash
# Build AAB
npx eas build --platform android --profile production

# Submit to Google Play (auto)
npx eas submit --platform android
```

Or manually:
1. Download AAB from https://expo.dev/ dashboard
2. Go to https://play.google.com/console/
3. Create app → Upload AAB → Fill metadata → Submit for review

> **Ref:** https://docs.expo.dev/submit/android/

### Apple App Store

```bash
# Build IPA
npx eas build --platform ios --profile production

# Submit to App Store (auto)
npx eas submit --platform ios
```

Or manually:
1. Download IPA from Expo dashboard
2. Open **Transporter** (macOS app) → Upload IPA
3. Go to App Store Connect → Select build → Submit for review

> **Ref:** https://docs.expo.dev/submit/ios/

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `expo: command not found` | `npm install -g expo-cli eas-cli` |
| Android build fails: SDK not found | Set `ANDROID_HOME` env variable |
| iOS build fails: no signing identity | Open Xcode → Preferences → Accounts → Add Apple ID |
| WebView blank screen | Check `APP_URL` is reachable from device. Use LAN IP for dev |
| Camera/mic not working | Must use **development build**, not Expo Go |
| Android back button doesn't work | Already handled in `_layout.tsx` → `BackHandler` |
| `pod install` fails | `sudo gem install cocoapods && cd ios && pod install --repo-update` |
| EAS build timeout | Free tier has queue. Consider EAS paid plan or local build |

---

## Key Files Reference

| File | Purpose |
|---|---|
| `app/_layout.tsx` | **Main file** — WebView config, URL, domain whitelist, offline handling |
| `app.json` | Expo config — app name, version, bundle IDs, splash, permissions |
| `package.json` | Dependencies — Expo SDK 52, React Native 0.76, WebView |
| `eas.json` | EAS Build config — build profiles (preview/production) |
| `assets/images/` | App icon, splash screen, adaptive icon |

### What to change for updates

| Task | File | What to change |
|---|---|---|
| Change target URL | `app/_layout.tsx` | `APP_URL` constant |
| Add allowed domain | `app/_layout.tsx` | `ALLOWED_HOSTS` array |
| Bump version | `app.json` | `expo.version` |
| Change app name | `app.json` | `expo.name` |
| Change splash color | `app.json` | `expo-splash-screen.backgroundColor` |
| Change app icon | `assets/images/` | Replace `icon.png`, `adaptive-icon.png` |

---

## Contacts & References

### Project References

| Resource | URL |
|---|---|
| Expo Documentation | https://docs.expo.dev/ |
| EAS Build Guide | https://docs.expo.dev/build/introduction/ |
| EAS Submit Guide | https://docs.expo.dev/submit/introduction/ |
| React Native WebView | https://github.com/nicecode/react-native-webview |
| Expo Environment Setup | https://docs.expo.dev/get-started/set-up-your-environment/ |
| Apple Developer | https://developer.apple.com/ |
| Google Play Console | https://play.google.com/console/ |

### Project Info

| Item | Value |
|---|---|
| Bundle ID (iOS) | `th.go.moph.meet` |
| Package Name (Android) | `th.go.moph.meet` |
| Production URL | `https://moph-meet.moph.go.th` |
| Media Server | `https://moph-meetingroom.moph.go.th` |
| Expo SDK | 52 |
| React Native | 0.76.9 |

---

## License

© 2026 กระทรวงสาธารณสุข — Ministry of Public Health, Thailand
