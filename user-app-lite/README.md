# MOPH Meet — Web Application

> แอปพลิเคชันแพทย์ทางไกล กระทรวงสาธารณสุข

## ภาพรวม

Web Application สำหรับแพทย์และผู้ป่วย รองรับทั้งเบราว์เซอร์และมือถือ ประกอบด้วย:

- 🔐 **Login** — เข้าสู่ระบบด้วย ProviderID (Health ID)
- 📋 **Dashboard** — จัดการห้องตรวจและห้องประชุม
- 🩺 **ห้องตรวจ** — วิดีโอคอลพร้อมระบบคิวผู้ป่วย
- 📊 **สถิติ** — Dashboard แสดงข้อมูลการใช้งาน
- ⏳ **คิวผู้ป่วย** — หน้ารอตรวจสำหรับผู้ป่วย (ไม่ต้อง login)

## ความต้องการของระบบ

- **Node.js** 18+ (แนะนำ 20 LTS)
- **npm** 9+
- **Core API** ต้องรันอยู่ที่ port 3500

## การติดตั้ง

```bash
cd user-app-lite
npm install
```

## ตัวแปรสภาพแวดล้อม (.env)

| ตัวแปร | คำอธิบาย | ค่าเริ่มต้น |
|---|---|---|
| `PORT` | พอร์ตที่แอปทำงาน | `3001` |
| `CORE_URL` | URL ของ Core API | `http://localhost:3500` |
| `SESSION_SECRET` | Secret สำหรับ session | `change_me` |
| `PROVIDER_ID_CLIENT_ID` | Client ID สำหรับ ProviderID | — |
| `PROVIDER_ID_REDIRECT_URI` | Redirect URI | — |
| `CALL_URL` | URL ของ Media Server | — |
| `ABS_API_URL` | URL ของ AI Summary Service | — |

## การรัน

```bash
# Development
npm run dev

# Production
npm start
```

## โครงสร้างโปรเจค

```
user-app-lite/
├── server.js              # Main Express server (routes, proxy, session)
├── views/
│   ├── login.ejs          # หน้า login (ProviderID)
│   ├── dashboard.ejs      # หน้า dashboard (สร้างห้อง, ดูรายการ)
│   ├── meet.ejs           # หน้าวิดีโอคอล (embed media server)
│   ├── queue.ejs          # หน้าคิวผู้ป่วย (รอเรียกตรวจ)
│   ├── usage-logs.ejs     # หน้าสถิติการใช้งาน (Chart.js)
│   └── partials/
│       ├── head.ejs       # HTML head + meta tags
│       └── foot.ejs       # Footer + scripts
├── public/
│   ├── css/               # Stylesheets
│   ├── js/                # Client-side JavaScript
│   ├── images/            # Static images
│   ├── manifest.json      # PWA manifest
│   └── sw.js              # Service Worker (PWA)
├── package.json
└── .env
```

## หน้าจอหลัก

| หน้า | URL | Auth | คำอธิบาย |
|---|---|---|---|
| Login | `/` | — | เข้าสู่ระบบด้วย ProviderID |
| Dashboard | `/dashboard` | ✅ | สร้างห้องตรวจ/ประชุม, ดูรายการ |
| ห้องตรวจ | `/exam/:id` | ✅ | วิดีโอคอลสำหรับแพทย์ + จัดการคิว |
| ห้องประชุม | `/room/:id` | ✅ | วิดีโอคอลสำหรับประชุม |
| คิวผู้ป่วย | `/queue/:id?jwt=...` | JWT | ผู้ป่วยรอตรวจ (ไม่ต้อง login) |
| สถิติ | `/usage-logs` | — | Dashboard สถิติการใช้งาน |

## การ Deploy

### PM2 (Production)

```bash
pm2 start server.js --name moph-meet-web
```

### Docker

```bash
docker build -t moph-meet-web .
docker run -p 3001:3001 moph-meet-web
```

## Mobile App

แอปรองรับการใช้งานบนมือถือผ่าน:

1. **PWA** — เพิ่มลงหน้าจอหลักผ่านเบราว์เซอร์
2. **Native App** — ดูที่โฟลเดอร์ `moph-meet/` สำหรับ iOS/Android app

## License

© 2026 กระทรวงสาธารณสุข — Ministry of Public Health, Thailand
