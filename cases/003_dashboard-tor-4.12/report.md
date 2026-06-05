# 003 — Dashboard สถิติการใช้งานตาม TOR ข้อ 4.12

วันที่: 2026-06-04

## อาการ / ความต้องการ (Requirement)
TOR ข้อ 4.12 ต้องการ Dashboard 2 ส่วน (4.12.1 บริการรักษา, 4.12.2 งานทั่วไป) แสดง:
- 4.12.x.1 ปริมาณการใช้งานตามวัน + ช่วงเวลาในวัน (กำหนดช่วงได้)
- 4.12.x.2 แบ่งตามเขตสุขภาพและจังหวัด
- 4.12.x.3 แบ่งตาม Mobile vs Web
- 4.12.x.4 หน่วยบริการที่ถูกเรียก + เวลาเริ่ม/สิ้นสุดการสนทนา
- 4.12.2.5 Top 5 หน่วยบริการใช้งานสูงสุด
- 4.12.2.6 Top 5 ห้องประชุมที่ใช้งานนานสุด

## Root cause / Gap analysis
ตาราง `usage_logs` เดิมเก็บแค่ event/room/doctor/patient — ขาด platform, hcode, จังหวัด, เขต,
และ duration การสนทนา จึงต้องเพิ่ม schema + logging + reference data + query + UI

ข้อจำกัดที่ตัดสินใจร่วมกับผู้ใช้:
- เวลาเริ่ม/จบ ใช้ `starttime`/`endtime` ของห้อง (ไม่แตะ Jitsi) → duration = endtime − starttime
- Mobile/Web: mobile app ยังไม่ขึ้น → log เป็น `web` ทั้งหมด, backfill ของเก่าเป็น web
- เขต/จังหวัด ของเก่า backfill ไม่ได้ (logs เดิมไม่มี hcode) → ของใหม่เก็บจาก org.hcode / HIS payload

## Fix
- `core-lite/src/data/health-regions.js` — แผนที่จังหวัด → เขตสุขภาพ ครบ 13 เขต
- `core-lite/src/data/area.js` — resolver hcode → {province, region, hospital} (fallback "ไม่ระบุ")
- `core-lite/scripts/build-hcode-map.js` — generator สร้าง hcode-to-area.js จากไฟล์ export รพ. (ยังไม่ได้รัน — รอไฟล์ TSV)
- `core-lite/src/store/sqlite.js` — migration เพิ่มคอลัมน์ `platform, unit_hcode, province, region, duration_sec` (additive, idempotent) + query ใหม่: byDay, byHour, byRegion, byProvince, byPlatform, byUnit, longestRooms
- `core-lite/src/index.js` — log platform/unitHcode/durationSec ตอนสร้างห้อง (room_created, reserved_room_created) + endpoints `/api/logs/by-{day,hour,region,province,platform,unit}`, `/longest-rooms`
- `user-app-lite/server.js` — ขยาย proxy allowlist สำหรับ endpoint ใหม่
- `user-app-lite/public/usage-logs.html` — Dashboard UI 2 แท็บ (4.12.1/4.12.2) + filter วัน/ช่วงเวลา + กราฟ region/platform + ตารางจังหวัด/หน่วยบริการ/ห้องนานสุด
- `core-lite/scripts/backfill-usage-logs.js` — backfill platform='web' + duration_sec จาก meta (dry-run/apply, idempotent)

## Verification
- โหลด store module + migration บน server ผ่าน DB copy: 5 คอลัมน์เพิ่มสำเร็จ, ทุก query method คืนค่าถูก
- backfill --apply บน DB copy: platform 271,524 = web, duration 203,406 แถว (skip 0), min 60s/max 27h/avg ~2.9h
- หลัง deploy: migration auto-run บน live (16 คอลัมน์), backfill live 203,427 แถว, endpoint ใหม่ทั้ง 8 ตัวคืน 200

## Deploy
- push `src/data/`, `scripts/`, `index.js`, `sqlite.js` → `/root/core-lite`; `server.js`, `usage-logs.html` → `/root/user-app-lite`
- backup DB: `usage_logs.db.bak-<timestamp>` (92MB)
- `pm2 reload all` (fork mode → blip <1s, ไม่ใช่ zero แท้); backfill `--apply` บน live DB

## Follow-ups / risks
- ยังไม่ได้ gen `hcode-to-area.js` — รอไฟล์ export รพ. แบบ TSV จากผู้ใช้ → จังหวัด/เขต ตอนนี้แสดง "ไม่ระบุ"
- HIS reserved payload ยังไม่ส่ง hcode → ต้องประสานทีม HIS (เผื่อ field hcode/hospitalCode/account_hcode ไว้แล้ว)
- เขต/จังหวัด ของข้อมูลเก่า backfill ไม่ได้ (ไม่มี hcode)
- pm2 fork mode ไม่ใช่ zero-downtime จริง — ถ้าต้องการต้องเปลี่ยนเป็น cluster mode (แยกงาน)
