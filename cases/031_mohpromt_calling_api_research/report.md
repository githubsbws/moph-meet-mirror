# Case 031: ค้นหา spec หมอพร้อม Calling API

## สิ่งที่ยืนยันได้จากเอกสารทางการ

- หมอพร้อม Station มีการแจ้งเตือนแบบ `Telemed` ถึงผู้รับบริการด้วย CID
- ผู้รับบริการเปิดข้อความในแอปหมอพร้อม กด Telemed แล้วเข้าร่วม Video Call แบบ real-time
- ผู้ให้บริการสร้าง Telemed notification ผ่านหน้าเว็บหมอพร้อม Station; มีสถานะส่งและสถานะอ่านข้อความ
- เอกสารการประชุม สธ. ระบุว่ากลุ่มที่มีผู้พัฒนาสามารถเชื่อมโยง Calling กับประชาชนได้

## สิ่งที่ยังไม่พบในเอกสารสาธารณะ

- endpoint Calling/Telemed API
- request/response schema, วิธีสร้าง call session หรือ call link
- webhook/callback สถานะรับสาย/วางสาย
- วิธีผูก MOPH Alert API public กับข้อความชนิด Telemed

## ข้อสรุป

คู่มือ MOPH Alert API ที่เปิดเผยรองรับการส่งข้อความ แต่ยังไม่ใช่ Calling API spec. การใช้งาน Calling จากเอกสารสาธารณะทำผ่านหมอพร้อม Station UI. หากต้องการเชื่อมจาก MOPH Meet โดยตรง ต้องขอเอกสาร Telemed/Calling API, สิทธิ์, sandbox และ callback contract จากทีมหมอพร้อม Station/กองสุขภาพดิจิทัลก่อน
