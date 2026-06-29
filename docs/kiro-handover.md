# MOPH Meet — Handover Instructions (for Kiro / dev team)

> เอกสารส่งต่องานให้ทีม dev อีกทีม (และ Kiro ของทีมนั้น) — อ่านให้จบก่อนแก้โค้ด
> อัปเดตล่าสุด: 2026-06-30 · งานรอบนี้อยู่บน branch `delivery/update-Q2-26` (merged → master) + `delivery/mobile-parity`

---

## 1. ภาพรวมระบบ

ระบบ Telemedicine/Telepharmacy ของกระทรวงสาธารณสุข (MOPH Meet)

| ส่วน | โฟลเดอร์ | พอร์ต | สแตก | บทบาท |
|---|---|---|---|---|
| Core API | `core-lite/` | 3500 (`APP_PORT`) | Node.js + Express + better-sqlite3 | เจ้าของ `/api/*` + data จริง (rooms, sessions, logs, vitals) |
| Web app | `user-app-lite/` | 3000 (`PORT`) | Express + static HTML + EJS | frontend + proxy ไป core ผ่าน `CORE_BASE` |
| Mobile app | `moph-meet/` | — | Expo / React Native (expo-router) | แอป native iOS/Android |
| VDO Conference | Jitsi | — | external | `moph-meetingroom.moph.go.th` |
| HIS demo | `demo-his/` | 3501 | Express | ปลายทางทดสอบ HIS export |

Production: `moph-meet.moph.go.th` (203.159.95.112), รันด้วย pm2 (fork mode): `core-lite`, `user-app-lite`.
nginx: `/api/` → 3500, อื่น ๆ → 3000.

---

## 2. กฎที่ห้ามพลาด (สำคัญสุด)

1. **ทำงานเฉพาะ `*-lite` + `moph-meet`** เท่านั้น
   - ✅ แก้ได้: `core-lite/`, `user-app-lite/`, `moph-meet/`, `tests/*-lite/`
   - ❌ ห้ามแตะ (deprecated, อ่าน reference ได้): `core/` (TS เดิม), `user-app/` (Nuxt เดิม), `tests/moph-meet/`
   - ดู `.kiro/steering/lite-only.md`
2. **ห้ามแตะ Jitsi** และ **ห้ามแก้ตรรกะ gen token เดิม** — ระบบอื่น gen token ล่วงหน้าไว้ ต้องเข้าได้เหมือนเดิม เพิ่มของใหม่ได้แต่ห้ามทำของเก่าพัง
3. **`core-lite` เป็นเจ้าของ data/`/api/*`; `user-app-lite` เป็น proxy** — รักษาขอบเขตนี้ (อย่าใส่ business logic ใน proxy)
4. **Git hygiene:**
   - commit เมื่อจำเป็น, **ห้าม `git add -A`** — `data/*.db` = ข้อมูลผู้ป่วย, `devserverlist.md` = รหัส prod
   - สแกน diff หา secret ก่อน commit เสมอ
   - feature → branch, push เมื่อพร้อม, **ห้าม push master ตรง ๆ โดยไม่ได้รับอนุญาต**
5. **จบงานแต่ละเคส → เขียน `cases/[NNN]_[ชื่อ]/report.md`** (ภาษาไทย, ห้ามมี PII/secret/token) ดู `.kiro/steering/case-reports.md`
6. **endpoint ที่แตะข้อมูลผู้ป่วยต้องผ่าน `auth()`** (`core-lite/src/middlewares/auth.js`); 404/error ตอบ JSON เสมอ (ห้าม HTML)

---

## 3. ข้อจำกัดสภาพแวดล้อม (เคยเจอ)

- `better-sqlite3` เป็น native module (Linux) → **รัน/migrate/ทดสอบ core-lite บน prod กับสำเนา DB เท่านั้น** (รันบน Windows host ไม่ได้)
- WSL/UNC path ทำให้ `npx`/jest/expo รันในบางสภาพแวดล้อมไม่ได้ → ตรวจ syntax ด้วย `node --check`, ทดสอบจริงบน prod / Playwright
- SSH ไป prod ใช้ plink/pscp (รหัสอยู่ `devserverlist.md` รายการสุดท้าย — อย่า echo/commit)
- ก่อน migrate DB → **backup ก่อนทุกครั้ง**; pm2 fork reload = blip <1s (ไม่ใช่ zero-downtime จริง)

---

## 4. งานที่ทำไปแล้วรอบนี้

### 4.1 Q2-26 features (branch `delivery/update-Q2-26`, merged → master)
ปิด gap ตาม TOR — ดู `docs/tor-gap-analysis-lite-mobile.md` + `docs/tor-completion-plan.md`

| TOR | ฟีเจอร์ | ไฟล์หลัก | API ใหม่ |
|---|---|---|---|
| 4.10.5 | Vital signs | `core-lite/src/store/sqlite.js` (ตาราง `vitals`), `index.js`, `user-app-lite/public/vitals.html` | `POST /api/vitals`, `/api/vitals/batch`, `GET /api/vitals?roomId=`, `GET /api/rooms/:id/vitals/latest` |
| 4.7/4.10.7 | HIS export | `core-lite/src/index.js`, `docs/openapi.yaml` | `POST /api/his/export {roomId}` → POST ไป `HIS_ENDPOINT` |
| 4.4 | Presence | `core-lite/src/index.js` | `POST /api/presence/ping`, `GET /api/presence?ids=` |
| 4.6 | ThaID login (scaffold) | `core-lite/src/index.js`, `user-app-lite/server.js`+`login.html` | `POST /api/auth/thaiD`, `/auth/thaid/callback` |
| 4.11.1 | LINE OA notify | `core-lite/src/index.js` (`notifyLine()`) | hook ใน create room |
| 4.2/4.5/4.11.4/4.9 | unit search / queue ring / calendar color / media res | `index.js`, `meet.html`, `dashboard.js`, `app.css` | `GET /api/units/search?q=` |
| 4.10.6 | Bluetooth ≥5 | `moph-meet/app/devices.tsx`, `constants/ble.ts`, `app.json` | (ใช้ /api/vitals) |

### 4.2 Mobile parity (branch `delivery/mobile-parity`)
ทำ `moph-meet` ให้ feature เท่า `user-app-lite`:
- `app/index.tsx` — ThaID button + OAuth robust (อ่าน result.url + getInitialURL)
- `app/profile.tsx` — แก้ไขโปรไฟล์ (Data Hub) → `PATCH /api/auth/profile`
- `app/dashboard.tsx` — home: สร้างห้อง, ค้นหา, ปฏิทิน, ลิงก์สถิติ, การ์ดโปรไฟล์
- `app/doctor/[id].tsx` — หมอคุมห้องตรวจ: คิว/เชิญ/เรียกคิว/เข้าวิดีโอ
- `app/stats.tsx` — สถิติ (TOR 4.12)
- `app/vitals/[roomId].tsx` — บันทึก vital
- `components/MiniCalendar.tsx`, `components/Icon.tsx`

---

## 5. วิธีรัน / ทดสอบ

```bash
# core-lite (บน Linux/prod)
cd core-lite && npm install && node src/index.js     # หรือ pm2

# user-app-lite
cd user-app-lite && npm install && node server.js     # หรือ pm2

# demo-his (ทดสอบ HIS export)
cd demo-his && node index.js                           # port 3501

# tests (pytest + jest) — รันบน Linux
cd tests/core-lite && pytest                            # test_api.py
cd tests/user-app-lite && pytest

# mobile
cd moph-meet && npm install && npx expo start
# BLE ต้อง native build: npx expo run:android / EAS build
```

ตรวจ syntax เร็ว ๆ: `node --check core-lite/src/index.js`

---

## 6. Deploy (ทำเมื่อได้รับอนุญาต)

```
# scp ไฟล์ที่แก้ → prod (203.159.95.112, รหัสใน devserverlist.md รายการสุดท้าย)
# แล้ว reload:
pm2 reload core-lite
pm2 reload user-app-lite
# ตาราง vitals สร้างอัตโนมัติเมื่อ core-lite start ครั้งแรก (backup DB ก่อนเสมอ)
```

---

## 7. งานค้าง / ต้องทำต่อ (สำคัญ)

1. **VA (TOR 4.13) — เร่งด่วน:** เอา trust-all TLS ออกก่อนทำ VA
   - `core-lite/src/index.js` บรรทัดต้น: `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'`
   - `user-app-lite/server.js`: `rejectUnauthorized: false` (`_insecureAgent`)
   - `moph-meet/.../OkHttpClientFactory.kt`: UnsafeOkHttpClient (ปิด TLS verify ทั้งหมด = MITM risk)
   - แก้เป็น cert allow-list ไม่งั้น VA เจอ Critical/High
2. **Credentials ที่ยังต้องกรอกใน `.env`** (โครงโค้ดพร้อมแล้ว):
   - ThaID: `THAID_CLIENT_ID/SECRET/REDIRECT_URI/TOKEN_URL/PROFILE_URL` (จาก DOPA/สธ)
   - LINE OA: `LINE_CHANNEL_TOKEN`, `LINE_TARGET`
   - HIS: `HIS_ENDPOINT` (default = demo-his)
3. **BLE (4.10.6):** ต้อง `npm i react-native-ble-plx` ถ้าจะใช้ของจริง + native build; GATT parser ใน `devices.tsx` เป็นตัวอย่าง ต้อง validate กับ firmware จริง
4. **hcode-to-area.js:** ยัง gen ไม่ครบ — รัน `core-lite/scripts/build-hcode-map.js` จากไฟล์ รพ. (TSV) ให้ province/region + unit search ทำงานเต็ม
5. **Mobile UI verify:** งาน mobile-parity ยังไม่ได้รัน expo/tsc ในเครื่องที่ทำ — ทีมต้อง build ตรวจ UI จริง
6. **Icon:** ใช้ `@expo/vector-icons` (mdi). ถ้าต้องการ Iconify จริง (set อื่น) เปลี่ยนที่ `components/Icon.tsx` ไฟล์เดียว + ลง `react-native-iconify` + babel plugin + rebuild

---

## 8. ที่อยู่เอกสารอ้างอิง
- `docs/tor-gap-analysis-lite-mobile.md` — เทียบ TOR รายข้อ (internal)
- `docs/tor-completion-plan.md` — แผน task + สัญญา API + acceptance
- `core-lite/docs/openapi.yaml` + `postman_collection.json` — API spec
- `cases/001..015/report.md` — บันทึกแต่ละเคสที่แก้
- `.kiro/steering/lite-only.md`, `.kiro/steering/case-reports.md` — กฎ
