// ── Room creation pure logic (parity contract) ──────────────────────────────
// โมดูลฟังก์ชันบริสุทธิ์สำหรับ flow การสร้างห้อง (exam / meet) บน mobile ให้ parity
// กับเว็บ (`user-app-lite/`). ไม่มี side-effect ไม่แตะ network/UI — เป็นชั้น logic ที่
// ทดสอบได้ (input-shaping / response-interpretation) และเป็นเป้าหมายหลักของ
// property-based tests. business logic ของการสร้างห้องจริงยังอยู่ที่ core-lite.
//
// NOTE (task 1.2): ไฟล์นี้ประกาศ types + signatures (stub) เท่านั้น ยังไม่มี logic
// เต็ม — implementation อยู่ใน task 2.x. stub โยน error เพื่อให้ type-correct และ
// compile/import ได้.

/** ชนิดห้อง: 'exam' = ห้องตรวจ, 'meet' = ห้องประชุม. */
export type RoomType = 'exam' | 'meet';

/** ค่าจากฟอร์ม Create_Room_Form (client form state). */
export type CreateRoomInput = {
  type: RoomType;
  name?: string;
  accessMode?: 'public' | 'restricted';
  patientName?: string;
  patientCid?: string;
  date: string;        // 'YYYY-MM-DD'
  startTime: string;   // 'HH:mm'
  endTime: string;     // 'HH:mm'
};

/** payload ของ POST /api/rooms (parity contract กับเว็บ). */
export type CreateRoomBody = {
  type: RoomType;
  name?: string;
  accessMode?: 'public' | 'restricted';
  patientName?: string;
  patientCid?: string;
  starttime: string;   // 'YYYY-MM-DDTHH:mm:00'
  endtime: string;     // 'YYYY-MM-DDTHH:mm:00'
  platform?: 'mobile'; // Requirement 9 (optional platform hint)
};

/** ผลการตรวจสอบฟอร์มก่อนส่ง. */
export type ValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/** รูปแบบการตอบกลับจาก Core_API (เท่ากับที่เว็บตีความ). */
export type CreateRoomResponse = {
  room?: { id?: string; name?: string } | null;
  patientJoinUrl?: string | null;
  meetJoinUrl?: string | null;
};

/** view model ของ Room_Result_Panel (เลือกลิงก์ตามชนิดห้อง). */
export type ResultLinks = {
  roomName: string;              // '' ถ้าไม่มี
  roomId: string | null;
  patientLink: string | null;    // full URL (exam เท่านั้น)
  meetLink: string | null;       // full URL (meet เท่านั้น)
  doctorRoute: string | null;    // '/doctor/{id}' (exam เท่านั้น)
  meetRoute: string | null;      // '/meet/{id}'   (meet เท่านั้น)
};

/** ประกอบ 'YYYY-MM-DDTHH:mm:00' จาก date + time (ตรงกับเว็บ). */
export function toDatetimeString(date: string, time: string): string {
  // ตรงกับสูตรของเว็บ: fd.get('date') + 'T' + fd.get('starttime') + ':00'
  return `${date}T${time}:00`;
}

/** สร้าง body ของ POST /api/rooms ให้ parity กับเว็บ (+ platform hint optional). */
export function buildCreateRoomBody(
  input: CreateRoomInput,
  opts?: { platform?: 'mobile' },
): CreateRoomBody {
  // ประกอบ field ชุดเดียวกับเว็บสำหรับ input เดียวกัน (parity contract):
  // { type, starttime, endtime }.
  const body: CreateRoomBody = {
    type: input.type,
    starttime: toDatetimeString(input.date, input.startTime),
    endtime: toDatetimeString(input.date, input.endTime),
  };
  if (input.name?.trim()) body.name = input.name.trim();
  if (input.accessMode === 'public') body.accessMode = 'public';
  if (input.patientName?.trim()) body.patientName = input.patientName.trim();
  if (input.patientCid?.trim()) body.patientCid = input.patientCid.trim();
  // เพิ่ม platform hint เฉพาะเมื่อร้องขอ 'mobile' (Requirement 9). เมื่อไม่ส่ง opts
  // ต้องไม่มี field `platform` เลย เพื่อคง parity กับเว็บ (backward-compat default
  // 'web' ฝั่ง core).
  if (opts?.platform === 'mobile') {
    body.platform = 'mobile';
  }
  return body;
}

/** ตรวจสอบฟอร์มก่อนส่ง: ห้ามมีช่องว่าง และ end ต้องไม่อยู่ก่อน start. */
export function validateCreateRoomInput(input: CreateRoomInput): ValidationResult {
  // 1) ช่องใดว่างหลัง trim (whitespace-only นับเป็นว่าง) → ระงับการส่ง (Req 4.1)
  const date = input.date?.trim() ?? '';
  const startTime = input.startTime?.trim() ?? '';
  const endTime = input.endTime?.trim() ?? '';

  if (date === '' || startTime === '' || endTime === '') {
    return { ok: false, message: 'กรุณากรอกวันที่ เวลาเริ่ม และเวลาสิ้นสุดให้ครบถ้วน' };
  }

  // 2) End ต้องหลัง Start (Req 4.2). เทียบ datetime ที่ประกอบแล้วในรูปแบบคงที่
  // 'YYYY-MM-DDTHH:mm:00' — string comparison ใช้ได้เพราะรูปแบบเรียงจากหน่วยใหญ่
  // ไปเล็กและมีความกว้างคงที่.
  const startDatetime = toDatetimeString(date, startTime);
  const endDatetime = toDatetimeString(date, endTime);

  if (endDatetime <= startDatetime) {
    return { ok: false, message: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม' };
  }

  const patientName = input.patientName?.trim() ?? '';
  const patientCid = input.patientCid?.trim() ?? '';
  if ((patientName || patientCid) && !patientName) {
    return { ok: false, message: 'กรุณากรอกชื่อผู้ป่วยก่อนเชิญผู้ป่วย' };
  }
  if ((patientName || patientCid) && !isValidThaiCid(patientCid)) {
    return { ok: false, message: 'กรุณากรอกเลขบัตรประชาชนผู้ป่วย 13 หลักให้ถูกต้อง' };
  }

  return { ok: true };
}

/** ตรวจรูปแบบเลขบัตรประชาชน 13 หลัก (ใช้เมื่อออกคำเชิญผู้ป่วย). */
export function isValidThaiCid(cid: string): boolean {
  return /^\d{13}$/.test(cid);
}

/** แปลง relative path เป็น URL เต็มด้วย API_BASE (absolute ผ่านตรง ๆ). */
export function toFullUrl(pathOrUrl: string | null | undefined, apiBase: string): string | null {
  // null / undefined / '' → null (ไม่มีลิงก์ให้แสดง)
  if (pathOrUrl === null || pathOrUrl === undefined || pathOrUrl === '') {
    return null;
  }
  // ขึ้นต้นด้วย 'http' → absolute อยู่แล้ว คืนค่าเดิมไม่เปลี่ยนแปลง (mirror ของเว็บ:
  // d.patientJoinUrl.startsWith('http') ? d.patientJoinUrl : API_BASE + d.patientJoinUrl)
  if (pathOrUrl.startsWith('http')) {
    return pathOrUrl;
  }
  // อื่น ๆ (relative path) → เติม API_BASE เป็น prefix
  return apiBase + pathOrUrl;
}

/** เลือก/แปลงลิงก์ที่จะแสดงใน Room_Result_Panel ตามชนิดห้อง. */
export function selectResultLinks(
  type: RoomType,
  resp: CreateRoomResponse,
  apiBase: string,
): ResultLinks {
  // defensive access: resp / resp.room อาจเป็น null/undefined หรือ field ขาด
  // → ต้องไม่ throw (Req 8.2/8.3). ตีความ field ให้ความหมายเดียวกับเว็บ.
  const room = resp?.room ?? null;

  // roomName เป็น string เสมอ ('' เมื่อไม่มี room.name)
  const roomName = typeof room?.name === 'string' ? room.name : '';
  // roomId = room.id ?? null
  const roomId = room?.id ?? null;

  if (type === 'exam') {
    // exam → เซ็ตเฉพาะ patientLink + doctorRoute; meet* = null (mutual exclusivity)
    return {
      roomName,
      roomId,
      patientLink: toFullUrl(resp?.patientJoinUrl, apiBase),
      meetLink: null,
      // route ต้องเป็น null เมื่อไม่มี roomId
      doctorRoute: roomId ? `/doctor/${roomId}` : null,
      meetRoute: null,
    };
  }

  // meet → เซ็ตเฉพาะ meetLink + meetRoute; patient*/doctor* = null (mutual exclusivity)
  return {
    roomName,
    roomId,
    patientLink: null,
    meetLink: toFullUrl(resp?.meetJoinUrl, apiBase),
    doctorRoute: null,
    meetRoute: roomId ? `/meet/${roomId}` : null,
  };
}

/** ค่าวันที่ปัจจุบันในรูปแบบ 'YYYY-MM-DD' (ค่า default ของช่องวันที่). */
export function todayDateString(now?: Date): string {
  // parity กับเว็บ (`user-app-lite/`): `new Date().toISOString().slice(0, 10)`.
  // ใช้ semantics เดียวกันเป๊ะ (UTC-based) เพื่อไม่ให้ค่า default ต่างจากเว็บ
  // ที่ขอบเขตเที่ยงคืน UTC — parity เป็นเป้าหมายหลักของฟีเจอร์นี้.
  return (now ?? new Date()).toISOString().slice(0, 10);
}
