# Case 014 — Bluetooth Medical Devices (TOR 4.10.6)

**วันที่:** 2026-06-28  
**Branch:** delivery/update-Q2-26 (commit 3d4219c)

## Symptom
ขาดการเชื่อมต่ออุปกรณ์ Bluetooth ≥5 ชนิด ตาม TOR 4.10.6

## Fix

| ไฟล์ | สิ่งที่เพิ่ม |
|---|---|
| `moph-meet/constants/ble.ts` | GATT service UUIDs 6 ชนิด, metric map, label map |
| `moph-meet/app/devices.tsx` | หน้า BLE scan/connect + auto-read GATT + `parseGATT()` สำหรับ 5 ชนิดมาตรฐาน + **manual entry fallback** (เสมอ) + ส่งค่า → `POST /api/vitals/batch` |
| `moph-meet/app.json` | Android: `BLUETOOTH_SCAN/CONNECT` + `ACCESS_FINE_LOCATION`; iOS: `NSBluetoothAlwaysUsageDescription` + `react-native-ble-plx` plugin |

## Device types (≥5 ตาม TOR)
| ชนิด | GATT Service | ค่า |
|---|---|---|
| เทอร์โมมิเตอร์ | 0x1809 | temp °C |
| ความดัน | 0x1810 | sys/dia/pr mmHg |
| Pulse Oximeter | 0x1822 | SpO2 % + pr |
| ชั่งน้ำหนัก | 0x181D | weight kg |
| น้ำตาล | 0x1808 | glucose mg/dL |

## Graceful fallback
- `BleManager = null` (Expo Go / web / ble-plx ไม่ติดตั้ง) → แสดงเฉพาะหน้า manual entry โดยอัตโนมัติ
- ทุก case มี manual entry fallback ตาม TOR requirement ("ตามที่ สธ กำหนด")

## Deploy (ต้องทำก่อนใช้ BLE จริง)
1. `npx expo install react-native-ble-plx`
2. `npx expo run:android` หรือ EAS build (ต้องมี native build)
3. ทดสอบบน Android ≥7/iOS ≥12 พร้อมอุปกรณ์ BLE

## Follow-ups
- ลบ `moph-meet/app/devices.tsx` + `constants/ble.ts` ออกจาก `.gitignore` หลัง review แล้ว commit
- GATT parser ปัจจุบันเป็น "ตัวอย่าง" — ต้อง validate กับ firmware จริงของอุปกรณ์แต่ละรุ่น
