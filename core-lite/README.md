# MOPH Meet — Core API

> ระบบ API กลางสำหรับแพลตฟอร์มแพทย์ทางไกล กระทรวงสาธารณสุข

## ภาพรวม

Core API ทำหน้าที่เป็นศูนย์กลางจัดการห้องตรวจ, คิวผู้ป่วย, การยืนยันตัวตน และ Usage Logging สำหรับระบบ MOPH Meet ทั้งหมด

## ความต้องการของระบบ

- **Node.js** 18+ (แนะนำ 20 LTS)
- **npm** 9+

## การติดตั้ง

```bash
cd core-lite
npm install
```

## ตัวแปรสภาพแวดล้อม (.env)

| ตัวแปร | คำอธิบาย | ค่าเริ่มต้น |
|---|---|---|
| `APP_PORT` | พอร์ตที่ API ทำงาน | `3500` |
| `JWT_SECRET` | Secret key สำหรับ JWT | `change_me_jwt_secret` |
| `APP_BASE_URL` | URL หลักของระบบ เช่น `https://moph-meet.moph.go.th` | — |
| `DATA_DIR` | โฟลเดอร์เก็บฐานข้อมูล SQLite | `../../data` |
| `PROVIDER_ID_CLIENT_ID` | Client ID สำหรับ ProviderID OAuth | — |
| `PROVIDER_ID_CLIENT_SECRET` | Client Secret สำหรับ ProviderID OAuth | — |
| `PROVIDER_ID_REDIRECT_URI` | Redirect URI หลัง OAuth | — |
| `PROVIDER_SERVICE_CLIENT_ID` | Client ID สำหรับ Provider Service | — |
| `PROVIDER_SERVICE_SECRET_KEY` | Secret Key สำหรับ Provider Service | — |

## การรัน

```bash
# Development
npm run dev

# Production
npm start
```

## โครงสร้างโปรเจค

```
core-lite/
├── src/
│   ├── index.js          # Main API server (routes, logic)
│   ├── cache.js          # Token storage (in-memory + disk)
│   ├── database.js       # SQLite database setup
│   ├── middlewares/
│   │   └── auth.js       # Authentication middleware
│   └── models/
│       ├── meeting.js    # Meeting/room model
│       └── user.js       # User model
├── package.json
└── .env                  # Environment variables (ไม่ commit)
```

## API Endpoints

### Health
| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| GET | `/api/health` | — | Health check |

### Authentication
| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| POST | `/api/auth/providerID` | — | OAuth login ผ่าน ProviderID |
| POST | `/api/auth/guest` | — | Guest token verification |
| POST | `/api/auth/check` | — | ตรวจสอบ token |
| POST | `/api/logout` | — | Logout |

### Rooms & Exam
| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| GET | `/api/meets` | ✅ | รายการห้องตรวจของตนเอง |
| POST | `/api/rooms` | ✅ | สร้างห้องตรวจ/ห้องประชุม |
| GET | `/api/rooms/:id` | ✅ | ข้อมูลห้องตรวจ |
| POST | `/api/rooms/:id/join` | ✅ | เข้าร่วมห้องตรวจ (provider) |
| GET | `/api/exam/:id/queue` | JWT | ผู้ป่วยตรวจสอบสถานะคิว |
| POST | `/api/exam/:id/next` | ✅ | แพทย์เรียกผู้ป่วยถัดไป |
| GET | `/api/exam/:id/doctor` | ✅ | ข้อมูลห้องตรวจสำหรับแพทย์ |
| POST | `/api/exam/:id/invite` | ✅ | สร้างลิงก์เชิญผู้ป่วย |

### HIS Integration (Reserved)
| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| POST | `/api/meet/reserved` | — | สร้างห้องตรวจล่วงหน้า (สำหรับ HIS) |
| POST | `/api/meet/reserved/token` | — | ออกลิงก์ผู้ป่วยเพิ่ม |

### JWT & Guest
| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| POST | `/api/jwt/verify` | — | ตรวจสอบ JWT |
| POST | `/api/guest/token` | — | สร้าง guest token |

### Usage Logs
| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| GET | `/api/logs/summary` | — | สรุปสถิติรวม |
| GET | `/api/logs/daily` | — | สถิติรายวัน |
| GET | `/api/logs/monthly` | — | สถิติรายเดือน |
| GET | `/api/logs/by-doctor` | — | สถิติรายแพทย์ |
| GET | `/api/logs/recent` | — | เหตุการณ์ล่าสุด |

## ฐานข้อมูล

ระบบใช้ **SQLite** สร้างฐานข้อมูลอัตโนมัติ 2 ไฟล์:

- `rooms.db` — ข้อมูลห้องตรวจ (ลบอัตโนมัติหลัง endtime + 25 ชม.)
- `usage_logs.db` — บันทึกการใช้งาน (เก็บถาวร)

รองรับการเปลี่ยนเป็นฐานข้อมูลอื่นผ่าน ORM (PostgreSQL, MySQL, MariaDB, MSSQL)

## License

© 2026 กระทรวงสาธารณสุข — Ministry of Public Health, Thailand
