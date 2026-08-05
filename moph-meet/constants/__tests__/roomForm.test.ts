import fc from 'fast-check';
import { buildCreateRoomBody, selectResultLinks, toDatetimeString, toFullUrl, validateCreateRoomInput } from '../roomForm';
import type { CreateRoomResponse, RoomType } from '../roomForm';

// Feature: mobile-room-creation-parity
// Property tests สำหรับ pure logic ใน constants/roomForm.ts

// ── generators ──────────────────────────────────────────────────────────────
const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** วันที่รูปแบบ 'YYYY-MM-DD' (ค่าถูกต้องเชิงรูปแบบ). */
const dateArb = fc
  .record({
    year: fc.integer({ min: 0, max: 9999 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day }) => `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);

/** เวลารูปแบบ 'HH:mm'. */
const timeArb = fc
  .record({
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ hour, minute }) => `${pad(hour, 2)}:${pad(minute, 2)}`);

// ── Property 1: Datetime composition ตรงรูปแบบเว็บ ────────────────────────────
describe('toDatetimeString', () => {
  // Feature: mobile-room-creation-parity, Property 1: Datetime composition ตรงรูปแบบเว็บ
  // Validates: Requirements 1.4
  it('Property 1: result === `${date}T${time}:00` และตรง pattern YYYY-MM-DDTHH:mm:00', () => {
    fc.assert(
      fc.property(dateArb, timeArb, (date, time) => {
        const result = toDatetimeString(date, time);
        // ตรงกับสูตรของเว็บเป๊ะ: date + 'T' + time + ':00'
        expect(result).toBe(`${date}T${time}:00`);
        // ตรง pattern ของ Start_Datetime / End_Datetime
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/);
      }),
      { numRuns: 100 },
    );
  });
});

/** ชนิดห้อง. */
const roomTypeArb: fc.Arbitrary<RoomType> = fc.constantFrom('exam', 'meet');

/** CreateRoomInput ที่ครบถ้วน (รูปแบบถูกต้อง). */
const createRoomInputArb = fc.record({
  type: roomTypeArb,
  name: fc.constant('ห้องทดสอบ'),
  date: dateArb,
  startTime: timeArb,
  endTime: timeArb,
});

// ── Property 2 + 7: buildCreateRoomBody ──────────────────────────────────────
describe('buildCreateRoomBody', () => {
  // Feature: mobile-room-creation-parity, Property 2: Payload parity กับเว็บ (type + datetime)
  // Validates: Requirements 1.3, 2.2, 8.1
  it('Property 2: { type, starttime, endtime } ตรงกับ input และรูปแบบ `${date}T${time}:00`', () => {
    fc.assert(
      fc.property(createRoomInputArb, (input) => {
        const body = buildCreateRoomBody(input);
        // type เท่ากับ input
        expect(body.type).toBe(input.type);
        // starttime / endtime = date + 'T' + time + ':00' (เท่ากับเว็บ)
        expect(body.starttime).toBe(`${input.date}T${input.startTime}:00`);
        expect(body.endtime).toBe(`${input.date}T${input.endTime}:00`);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mobile-room-creation-parity, Property 7: Platform hint
  // Validates: Requirements 9.1
  it('Property 7: opts={platform:"mobile"} → platform==="mobile"; ไม่มี opts → ไม่มี field platform', () => {
    fc.assert(
      fc.property(createRoomInputArb, (input) => {
        // มี opts → platform === 'mobile'
        const withHint = buildCreateRoomBody(input, { platform: 'mobile' });
        expect(withHint.platform).toBe('mobile');
        // ไม่มี opts → ต้องไม่มี field platform เลย
        const withoutHint = buildCreateRoomBody(input);
        expect('platform' in withoutHint).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 3 + 4: validateCreateRoomInput ──────────────────────────────────

/** string ที่เป็น whitespace ล้วน หรือว่างเปล่า (นับเป็น "ว่าง" หลัง trim). */
const blankArb = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r', '\v', '\f'), {
  minLength: 0,
  maxLength: 5,
});

/** ชื่อ field ที่จะถูกทำให้ว่าง (อย่างน้อยหนึ่งช่อง). */
const blankFieldsArb = fc.subarray(['date', 'startTime', 'endTime'] as const, {
  minLength: 1,
  maxLength: 3,
});

describe('validateCreateRoomInput', () => {
  // Feature: mobile-room-creation-parity, Property 3: Validation ระงับเมื่อมีช่องว่าง
  // Validates: Requirements 4.1
  it('Property 3: ช่อง date/startTime/endTime ว่างหรือ whitespace ล้วนอย่างน้อยหนึ่งช่อง → ok:false', () => {
    fc.assert(
      fc.property(
        createRoomInputArb,
        blankFieldsArb,
        fc.array(blankArb, { minLength: 3, maxLength: 3 }),
        (validInput, blankFields, blanks) => {
          // เริ่มจาก input ที่ครบถ้วน แล้วแทนที่ช่องที่เลือกด้วย whitespace-only/ว่าง
          const input = { ...validInput };
          const blankMap: Record<string, string> = {
            date: blanks[0],
            startTime: blanks[1],
            endTime: blanks[2],
          };
          for (const field of blankFields) {
            (input as any)[field] = blankMap[field];
          }
          const result = validateCreateRoomInput(input);
          // มีช่องว่างอย่างน้อยหนึ่งช่อง → ต้องระงับการส่ง
          expect(result.ok).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: mobile-room-creation-parity, Property 4: Validation ระงับเมื่อ End ไม่หลัง Start
  // Validates: Requirements 4.2
  it('Property 4: End <= Start → ok:false; End > Start → ok:true', () => {
    fc.assert(
      fc.property(dateArb, timeArb, timeArb, (date, t1, t2) => {
        const input = { type: 'exam' as RoomType, name: 'ห้องตรวจทดสอบ', date, startTime: t1, endTime: t2 };
        const result = validateCreateRoomInput(input);
        // date เดียวกัน → เทียบ datetime ที่ประกอบแล้วลดรูปเป็นเทียบเวลา
        const start = toDatetimeString(date, t1);
        const end = toDatetimeString(date, t2);
        if (end > start) {
          expect(result.ok).toBe(true);
        } else {
          expect(result.ok).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  // positive case: ทุกช่องครบและ End > Start → ok:true
  it('positive: input ครบถ้วนและ End > Start → ok:true', () => {
    const result = validateCreateRoomInput({
      type: 'meet',
      date: '2025-02-01',
      startTime: '09:00',
      endTime: '10:30',
    });
    expect(result.ok).toBe(true);
  });

  it('exam: ชื่อห้องตรวจว่าง → ok:false', () => {
    expect(validateCreateRoomInput({ type: 'exam', name: '  ', date: '2025-02-01', startTime: '09:00', endTime: '10:30' }))
      .toEqual({ ok: false, message: 'กรุณากรอกชื่อห้องตรวจ' });
  });
});

// ── Property 5: URL prefixing (relative → เต็มด้วย API_BASE) ─────────────────

/** apiBase ตัวอย่าง (origin หรือ origin + path). */
const apiBaseArb = fc.constantFrom(
  'https://api.example.com',
  'https://meet.moph.go.th',
  'http://localhost:3500',
  'https://api.example.com/',
  'https://host:8443/base',
);

/** relative path ที่ไม่ขึ้นต้นด้วย 'http' (รวม non-ASCII/special chars). */
const relativePathArb = fc
  .oneof(
    // path ปกติ เช่น '/exam/123'
    fc.tuple(
      fc.constantFrom('/exam/', '/meet/', '/queue/', '/room/', '/'),
      fc.string({ minLength: 0, maxLength: 20 }),
    ).map(([prefix, rest]) => prefix + rest),
    // non-ASCII / special chars ใน path
    fc.constantFrom(
      '/ห้อง/ตรวจ',
      '/queue?token=abc&x=1',
      '/room/ทดสอบ#frag',
      '/path with space',
      '/emoji/😀/end',
      '/%E0%B8%81',
    ),
  )
  // กันกรณี fc.string สุ่มได้ค่าที่บังเอิญขึ้นต้น 'http' → บังคับให้เป็น relative
  .filter((p) => !p.startsWith('http'));

/** absolute URL ที่ขึ้นต้นด้วย 'http' (http/https). */
const absoluteUrlArb = fc
  .tuple(
    fc.constantFrom('http://', 'https://'),
    fc.constantFrom('example.com', 'meet.moph.go.th', 'localhost:3500', 'a.b.c/path?x=1'),
  )
  .map(([scheme, rest]) => scheme + rest);

describe('toFullUrl', () => {
  // Feature: mobile-room-creation-parity, Property 5: URL prefixing (relative → เต็มด้วย API_BASE)
  // Validates: Requirements 1.6, 2.4
  it('Property 5: empty/null/undefined → null; absolute (http...) → เดิม; relative → apiBase + path', () => {
    fc.assert(
      fc.property(
        apiBaseArb,
        fc.oneof(
          // null / undefined / '' → null
          fc.constantFrom(null, undefined, ''),
          // absolute (http/https) → ผ่านตรง ๆ
          absoluteUrlArb,
          // relative path (รวม non-ASCII/special chars) → apiBase + path
          relativePathArb,
        ),
        (apiBase, p) => {
          const result = toFullUrl(p, apiBase);

          if (p === null || p === undefined || p === '') {
            // empty/null/undefined → null
            expect(result).toBeNull();
          } else if (p.startsWith('http')) {
            // absolute → คืนค่าเดิมไม่เปลี่ยนแปลง
            expect(result).toBe(p);
          } else {
            // relative → apiBase + path (ขึ้นต้นด้วย apiBase และลงท้ายด้วย path)
            expect(result).toBe(apiBase + p);
            expect(result!.startsWith(apiBase)).toBe(true);
            expect(result!.endsWith(p)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // edge cases (example-based) — ยืนยันพฤติกรรมชัด ๆ ตาม design
  it('edge: null/undefined/empty string → null', () => {
    expect(toFullUrl(null, 'https://api.example.com')).toBeNull();
    expect(toFullUrl(undefined, 'https://api.example.com')).toBeNull();
    expect(toFullUrl('', 'https://api.example.com')).toBeNull();
  });

  it('edge: absolute http/https → คืนค่าเดิม', () => {
    expect(toFullUrl('http://x.com/a', 'https://api.example.com')).toBe('http://x.com/a');
    expect(toFullUrl('https://x.com/a', 'https://api.example.com')).toBe('https://x.com/a');
  });

  it('edge: relative path → apiBase + path (รวม non-ASCII)', () => {
    expect(toFullUrl('/exam/123', 'https://api.example.com')).toBe('https://api.example.com/exam/123');
    expect(toFullUrl('/ห้อง/ตรวจ', 'https://api.example.com')).toBe('https://api.example.com/ห้อง/ตรวจ');
  });
});

// ── Property 6: Result link selection ตามชนิดห้อง ────────────────────────────

/** room.id ที่อาจมี/ขาด/ผิดชนิด (defensive). */
const roomIdArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 12 }),
  fc.constantFrom(undefined),
);

/** room.name รวม non-ASCII / special chars และกรณีขาด. */
const roomNameArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 20 }),
  fc.constantFrom('ห้องตรวจ 01', 'ประชุม-😀', 'A/B\tC', 'ชื่อ#1&x=2', ''),
  fc.constantFrom(undefined),
);

/** ค่า URL field ที่อาจเป็น relative / absolute / null / undefined / ''. */
const urlFieldArb = fc.oneof(
  fc.constantFrom(null, undefined, ''),
  fc.constantFrom('/queue/abc', '/meet/xyz', '/ห้อง/ตรวจ?token=1', '/path with space'),
  fc.constantFrom('http://x.com/a', 'https://meet.moph.go.th/join'),
);

/** room object ที่อาจเป็น null หรือมี field ขาด. */
const roomArb = fc.oneof(
  fc.constantFrom(null, undefined),
  fc.record(
    { id: roomIdArb, name: roomNameArb },
    { requiredKeys: [] },
  ),
);

/**
 * CreateRoomResponse ที่ครอบกรณี field ขาด/null และ "แนบ field ตรงข้าม" มาด้วย
 * (ทั้ง patientNotification และ meetJoinUrl พร้อมกัน) เพื่อทดสอบ no cross-type leakage.
 */
const responseArb: fc.Arbitrary<CreateRoomResponse> = fc.record(
  {
    room: roomArb as fc.Arbitrary<CreateRoomResponse['room']>,
    patientNotification: fc.constantFrom(null, { channel: 'mophAlert', status: 'sent' as const }, { channel: 'mophAlert', status: 'failed' as const }),
    meetJoinUrl: urlFieldArb,
  },
  { requiredKeys: [] },
);

const apiBaseForLinksArb = fc.constantFrom(
  'https://api.example.com',
  'https://meet.moph.go.th',
  'http://localhost:3500',
  'https://host:8443/base',
);

describe('selectResultLinks', () => {
  // Feature: mobile-room-creation-parity, Property 6: Result link selection ตามชนิดห้อง (mutual exclusivity + ไม่ข้ามชนิด + ไม่ throw)
  // Validates: Requirements 1.5, 2.3, 5.3, 5.4, 8.2, 8.3
  it('Property 6: mutual exclusivity ตามชนิดห้อง, ไม่ข้ามชนิด, roomName เป็น string เสมอ, ไม่ throw', () => {
    fc.assert(
      fc.property(roomTypeArb, responseArb, apiBaseForLinksArb, (type, resp, apiBase) => {
        // ต้องไม่ throw แม้ field ขาด/null
        const links = selectResultLinks(type, resp, apiBase);

        // roomName เป็น string เสมอ ('' เมื่อไม่มี room.name)
        expect(typeof links.roomName).toBe('string');
        const room = resp.room ?? null;
        const expectedName = typeof room?.name === 'string' ? room.name : '';
        expect(links.roomName).toBe(expectedName);

        // roomId = room.id ?? null
        const expectedId = room?.id ?? null;
        expect(links.roomId).toBe(expectedId);

        if (type === 'exam') {
          // exam → meet* ต้องเป็น null (ไม่ข้ามชนิด)
          expect(links.meetLink).toBeNull();
          expect(links.meetRoute).toBeNull();
          // ลิงก์ผู้ป่วยส่งผ่าน MOPH Alert จึงไม่แสดงในแอป
          expect(links.patientLink).toBeNull();
          expect(links.patientNotification).toEqual(resp.patientNotification ?? null);
          // doctorRoute = '/doctor/{id}' เมื่อมี roomId, ไม่งั้น null
          expect(links.doctorRoute).toBe(expectedId ? `/doctor/${expectedId}` : null);
        } else {
          // meet → patient*/doctor* ต้องเป็น null (ไม่ข้ามชนิด)
          expect(links.patientLink).toBeNull();
          expect(links.doctorRoute).toBeNull();
          // meetLink = full URL ของ meetJoinUrl (null เมื่อ field ขาด/ว่าง)
          expect(links.meetLink).toBe(toFullUrl(resp.meetJoinUrl, apiBase));
          // meetRoute = '/meet/{id}' เมื่อมี roomId, ไม่งั้น null
          expect(links.meetRoute).toBe(expectedId ? `/meet/${expectedId}` : null);
        }
      }),
      { numRuns: 100 },
    );
  });

  // edge: resp เป็น object ว่าง / room เป็น null → empty panel ไม่ throw ไม่ error
  it('edge: response ว่าง/room null → roomName="" , roomId=null, ทุก link/route = null', () => {
    for (const type of ['exam', 'meet'] as RoomType[]) {
      const links = selectResultLinks(type, {}, 'https://api.example.com');
      expect(links.roomName).toBe('');
      expect(links.roomId).toBeNull();
      expect(links.patientLink).toBeNull();
      expect(links.patientNotification).toBeNull();
      expect(links.meetLink).toBeNull();
      expect(links.doctorRoute).toBeNull();
      expect(links.meetRoute).toBeNull();
    }
    const nullRoom = selectResultLinks('exam', { room: null }, 'https://api.example.com');
    expect(nullRoom.roomName).toBe('');
    expect(nullRoom.roomId).toBeNull();
    expect(nullRoom.doctorRoute).toBeNull();
  });

  // edge: opposite-type field แนบมาด้วย → ต้องไม่รั่วข้ามชนิด (Req 8.3)
  it('edge: opposite-type field แนบมา → ไม่แสดงข้ามชนิด', () => {
    const resp: CreateRoomResponse = {
      room: { id: 'r1', name: 'ห้องตรวจ' },
      patientNotification: { channel: 'mophAlert', status: 'sent' },
      meetJoinUrl: '/meet/abc', // opposite-type field สำหรับ exam
    };
    const exam = selectResultLinks('exam', resp, 'https://api.example.com');
    expect(exam.patientLink).toBeNull();
    expect(exam.patientNotification).toEqual({ channel: 'mophAlert', status: 'sent' });
    expect(exam.doctorRoute).toBe('/doctor/r1');
    expect(exam.meetLink).toBeNull();
    expect(exam.meetRoute).toBeNull();

    const meet = selectResultLinks('meet', resp, 'https://api.example.com');
    expect(meet.meetLink).toBe('https://api.example.com/meet/abc');
    expect(meet.meetRoute).toBe('/meet/r1');
    expect(meet.patientLink).toBeNull();
    expect(meet.patientNotification).toBeNull();
    expect(meet.doctorRoute).toBeNull();
  });

  // edge: absolute URL ไม่ถูก prefix; roomName non-ASCII คงค่า
  it('edge: absolute join URL คงค่า, roomName non-ASCII คงค่า', () => {
    const resp: CreateRoomResponse = {
      room: { id: 'r2', name: 'ประชุม-😀' },
      meetJoinUrl: 'https://meet.moph.go.th/join',
    };
    const meet = selectResultLinks('meet', resp, 'https://api.example.com');
    expect(meet.meetLink).toBe('https://meet.moph.go.th/join');
    expect(meet.roomName).toBe('ประชุม-😀');
    expect(meet.meetRoute).toBe('/meet/r2');
  });
});
