import fc from 'fast-check';
import { buildApiRequestInit } from '../api';

// Feature: mobile-room-creation-parity
// Regression-guard property test สำหรับ constants/api.ts (Cookie auth, ไม่ Bearer).
// buildApiRequestInit ถูก implement อยู่แล้ว — ไฟล์นี้ป้องกัน case-016 regress เท่านั้น.

// ── helpers ──────────────────────────────────────────────────────────────────

/** ดึง headers ของ RequestInit ออกมาเป็น plain record (case ตามที่ฟังก์ชันเซ็ต). */
function headersOf(init: RequestInit): Record<string, string> {
  return (init.headers as Record<string, string>) ?? {};
}

/** หา header key แบบไม่สนตัวพิมพ์ (defensive: ป้องกัน Authorization ในทุก casing). */
function hasHeaderKey(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === target);
}

// ── generators ────────────────────────────────────────────────────────────────

/** token string รวม edge cases: ว่าง, ช่องว่าง, non-ASCII และอักขระพิเศษ. */
const tokenArb = fc.oneof(
  fc.string(),
  fc.constantFrom(
    '',
    ' ',
    'abc.def.ghi',
    'token=with=equals',
    'ห้องตรวจ-😀',
    'a;b=c d\te',
    '"quoted"',
    'Bearer xyz', // ค่า token ที่บังเอิญมีคำว่า Bearer ต้องไม่ถูกตีความเป็น Authorization
  ),
);

/**
 * opts ทั่วไป/ว่าง ที่ผู้เรียกส่งเข้ามา — จงใจ **ไม่** ใส่ header Authorization/Cookie
 * เพื่อยืนยันว่า "ตัวฟังก์ชันเอง" ไม่เคย emit Authorization และเซ็ต Cookie ให้เสมอ.
 */
const safeHeaderKeyArb = fc.constantFrom('Accept', 'X-Trace-Id', 'Accept-Language', 'X-Custom');
const optsArb = fc.record(
  {
    method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
    body: fc.oneof(fc.string(), fc.constant(undefined)),
    headers: fc.oneof(
      fc.constant(undefined),
      fc.constant({} as Record<string, string>),
      fc.dictionary(safeHeaderKeyArb, fc.string(), { maxKeys: 4 }),
    ),
  },
  { requiredKeys: [] },
);

// ── Property 8: Cookie auth request init (ไม่ Bearer) ─────────────────────────
describe('buildApiRequestInit', () => {
  // Feature: mobile-room-creation-parity, Property 8: Cookie auth request init (ไม่ Bearer)
  // Validates: Requirements 6.1
  it('Property 8: Cookie: token=<token> + credentials:"include" และไม่มี header Authorization', () => {
    fc.assert(
      fc.property(tokenArb, optsArb, (token, opts) => {
        const init = buildApiRequestInit(token, opts as RequestInit);
        const headers = headersOf(init);

        // ส่ง token ผ่าน Cookie header ตรงรูปแบบเว็บ
        expect(headers['Cookie']).toBe(`token=${token}`);
        // credentials ต้องเป็น 'include' เสมอ (proxy อ่าน cookie)
        expect(init.credentials).toBe('include');
        // case-016: ต้องไม่มี Authorization header (ทุก casing)
        expect(hasHeaderKey(headers, 'Authorization')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // edge case (example-based) — ยืนยันพฤติกรรมชัด ๆ ตาม design
  it('edge: opts ว่าง → Cookie/credentials ถูกตั้ง, ไม่มี Authorization', () => {
    const init = buildApiRequestInit('tkn-123');
    const headers = headersOf(init);
    expect(headers['Cookie']).toBe('token=tkn-123');
    expect(init.credentials).toBe('include');
    expect(hasHeaderKey(headers, 'Authorization')).toBe(false);
  });

  it('edge: token ว่าง → Cookie: token= (ยังคงไม่มี Authorization)', () => {
    const init = buildApiRequestInit('');
    const headers = headersOf(init);
    expect(headers['Cookie']).toBe('token=');
    expect(hasHeaderKey(headers, 'Authorization')).toBe(false);
  });
});
