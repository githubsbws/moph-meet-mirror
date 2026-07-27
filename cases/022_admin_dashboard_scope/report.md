# รายงานการปรับสิทธิ์ Dashboard สำหรับ Admin

## การเปลี่ยนแปลง

- Admin ที่ไม่มี H-Code ในโปรไฟล์เปิด Dashboard ได้และเห็นข้อมูลรวมทุก H-Code
- Admin กรองเฉพาะหน่วยบริการได้ด้วยช่อง H-Code บนหน้า Dashboard
- ผู้ใช้ทั่วไปยังใช้ H-Code จากโปรไฟล์ตนเองเสมอ และไม่สามารถส่ง query เพื่อข้ามการแยกข้อมูลได้
- เพิ่ม Dashboard query ชุดเดียวกันให้ storage แบบ memory เพื่อให้ development/test ไม่ล้มเมื่อเรียกกราฟ Dashboard

## การตรวจสอบ

- ตรวจ syntax และ `git diff --check`
- ทดสอบ Admin แบบไม่มี H-Code กับ Dashboard endpoints: summary, by-day, by-hour, by-region, by-province, by-platform, by-unit และ longest-rooms ตอบ `200` ครบ
