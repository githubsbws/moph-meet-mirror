/**
 * core-lite API tests – JavaScript (Jest + axios)
 * Run: npx jest tests/core-lite/test_api.test.js --verbose
 */
const axios = require('axios');

const BASE_URL = process.env.CORE_LITE_URL || 'http://localhost:3500';
const api = axios.create({ baseURL: BASE_URL, validateStatus: () => true });

let reservedRoom = {};     // { sessionID, meet, patientJoinUrl, doctorToken }
let authHeaders = {};
let examRoomId = '';

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Wait for server
  for (let i = 0; i < 30; i++) {
    try {
      const r = await api.get('/api/health');
      if (r.status === 200) break;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
  }

  // Create a reserved room to get auth token
  const r = await api.post('/api/meet/reserved', {
    cid: 'jest-doctor-001',
    displayName: 'Dr. Jest',
    startTime: '2026-03-17T09:00:00Z',
    endTime: '2026-03-17T12:00:00Z',
  });
  reservedRoom = r.data;
  authHeaders = { Authorization: `Bearer ${reservedRoom.doctorToken}` };
  examRoomId = reservedRoom.sessionID;
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. HEALTH
// ═════════════════════════════════════════════════════════════════════════════
describe('Health', () => {
  test('GET /api/health returns 200', async () => {
    const r = await api.get('/api/health');
    expect(r.status).toBe(200);
  });

  test('returns status ok', async () => {
    const r = await api.get('/api/health');
    expect(r.data.status).toBe('ok');
  });

  test('includes timestamp', async () => {
    const r = await api.get('/api/health');
    expect(r.data.timestamp).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. AUTH
// ═════════════════════════════════════════════════════════════════════════════
describe('Auth', () => {
  test('POST /api/auth/check – valid token', async () => {
    const r = await api.post('/api/auth/check', { token: reservedRoom.doctorToken });
    expect(r.status).toBe(200);
    expect(r.data.user).toBeDefined();
  });

  test('POST /api/auth/check – invalid token', async () => {
    const r = await api.post('/api/auth/check', { token: 'bad-token' });
    expect(r.status).toBe(401);
  });

  test('POST /api/auth/guest – invalid token', async () => {
    const r = await api.post('/api/auth/guest', { token: 'bad-guest' });
    expect(r.status).toBe(401);
  });

  test('POST /api/logout – invalidates token', async () => {
    // Create a disposable token
    const rr = await api.post('/api/meet/reserved', { cid: 'logout-jest' });
    const tok = rr.data.doctorToken;
    // Works before logout
    expect((await api.post('/api/auth/check', { token: tok })).status).toBe(200);
    // Logout
    await api.post('/api/logout', { token: tok });
    // Gone after logout
    expect((await api.post('/api/auth/check', { token: tok })).status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. ROOMS
// ═════════════════════════════════════════════════════════════════════════════
describe('Rooms', () => {
  test('POST /api/rooms – create meet room', async () => {
    const r = await api.post('/api/rooms', { type: 'meet' }, { headers: authHeaders });
    expect(r.status).toBe(200);
    expect(r.data.room.type).toBe('meet');
    expect(r.data.meetJoinUrl).toBeTruthy();
  });

  test('POST /api/rooms – create exam room', async () => {
    const r = await api.post('/api/rooms', { type: 'exam' }, { headers: authHeaders });
    expect(r.status).toBe(200);
    expect(r.data.room.type).toBe('exam');
    expect(r.data.patientJoinUrl).toBeTruthy();
  });

  test('POST /api/rooms – invalid type', async () => {
    const r = await api.post('/api/rooms', { type: 'bad' }, { headers: authHeaders });
    expect(r.status).toBe(400);
  });

  test('POST /api/rooms – no auth', async () => {
    const r = await api.post('/api/rooms', { type: 'meet' });
    expect(r.status).toBe(401);
  });

  test('GET /api/meets – lists rooms', async () => {
    const r = await api.get('/api/meets', { headers: authHeaders });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
  });

  test('GET /api/rooms/:id – fetch room', async () => {
    const cr = await api.post('/api/rooms', { type: 'meet' }, { headers: authHeaders });
    const id = cr.data.room.id;
    const r = await api.get(`/api/rooms/${id}`, { headers: authHeaders });
    expect(r.status).toBe(200);
    expect(r.data.id).toBe(id);
  });

  test('GET /api/rooms/:id – not found', async () => {
    const r = await api.get('/api/rooms/nonexistent', { headers: authHeaders });
    expect(r.status).toBe(404);
  });

  test('GET /api/rooms/:id – non-owner can join (multi-doctor)', async () => {
    const rA = await api.post('/api/meet/reserved', { cid: 'js-doc-A' });
    const rB = await api.post('/api/meet/reserved', { cid: 'js-doc-B' });
    const r = await api.get(`/api/rooms/${rA.data.sessionID}`, {
      headers: { Authorization: `Bearer ${rB.data.doctorToken}` }
    });
    expect(r.status).toBe(200);
    expect(r.data.joinedProviders).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. EXAM / QUEUE
// ═════════════════════════════════════════════════════════════════════════════
describe('Exam Queue', () => {
  test('GET /api/exam/:id/doctor – view room', async () => {
    const r = await api.get(`/api/exam/${examRoomId}/doctor`, { headers: authHeaders });
    expect(r.status).toBe(200);
    expect(r.data.queue).toBeDefined();
  });

  test('POST /api/exam/:id/invite', async () => {
    const r = await api.post(`/api/exam/${examRoomId}/invite`, {
      patientName: 'Jest Patient', cid: '1111111111111'
    }, { headers: authHeaders });
    expect(r.status).toBe(200);
    expect(r.data.patientJoinUrl).toBeTruthy();
  });

  test('GET /api/exam/:id/queue – valid JWT', async () => {
    const inv = await api.post(`/api/exam/${examRoomId}/invite`, {
      patientName: 'Queue Jest'
    }, { headers: authHeaders });
    const jwt = inv.data.patientJoinUrl.split('jwt=')[1];
    const r = await api.get(`/api/exam/${examRoomId}/queue?jwt=${jwt}`);
    expect(r.status).toBe(200);
    expect(r.data.status).toBe('waiting');
  });

  test('GET /api/exam/:id/queue – no JWT', async () => {
    const r = await api.get(`/api/exam/${examRoomId}/queue`);
    expect(r.status).toBe(401);
  });

  test('POST /api/exam/:id/next – admit patient', async () => {
    const inv = await api.post(`/api/exam/${examRoomId}/invite`, {
      patientName: 'Next Jest'
    }, { headers: authHeaders });
    const jwt = inv.data.patientJoinUrl.split('jwt=')[1];
    // Register in queue
    await api.get(`/api/exam/${examRoomId}/queue?jwt=${jwt}`);
    // Admit
    const r = await api.post(`/api/exam/${examRoomId}/next`, {}, { headers: authHeaders });
    expect(r.status).toBe(200);
    expect(r.data).toHaveProperty('admitted');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. RESERVED
// ═════════════════════════════════════════════════════════════════════════════
describe('Reserved', () => {
  test('POST /api/meet/reserved – create', async () => {
    const r = await api.post('/api/meet/reserved', { cid: 'jest-res-01', displayName: 'Jest Res' });
    expect(r.status).toBe(200);
    expect(r.data.sessionID).toBeTruthy();
    expect(r.data.doctorToken).toBeTruthy();
  });

  test('POST /api/meet/reserved – missing cid uses anon fallback', async () => {
    const r = await api.post('/api/meet/reserved', { displayName: 'No CID' });
    expect(r.status).toBe(200);
    expect(r.data.sessionID).toBeDefined();
  });

  test('POST /api/meet/reserved/token', async () => {
    const r = await api.post('/api/meet/reserved/token', {
      sessionID: reservedRoom.sessionID, patientName: 'Jest Token Patient'
    });
    expect(r.status).toBe(200);
    expect(r.data.patientJoinUrl).toBeTruthy();
  });

  test('POST /api/meet/reserved/token – invalid session', async () => {
    const r = await api.post('/api/meet/reserved/token', { sessionID: 'nope' });
    expect(r.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. GUEST TOKEN
// ═════════════════════════════════════════════════════════════════════════════
describe('Guest Token', () => {
  test('POST /api/guest/token – create', async () => {
    const r = await api.post('/api/guest/token', { meetId: 'jest-room', patientName: 'Guest Jest' });
    expect(r.status).toBe(200);
    expect(r.data.token).toBeTruthy();
  });

  test('POST /api/guest/token – missing meetId', async () => {
    const r = await api.post('/api/guest/token', { patientName: 'No Meet' });
    expect(r.status).toBe(400);
  });

  test('guest token works with /api/auth/guest', async () => {
    const cr = await api.post('/api/guest/token', { meetId: 'g-room', patientName: 'GuestCheck' });
    const r = await api.post('/api/auth/guest', { token: cr.data.token });
    expect(r.status).toBe(200);
    expect(r.data.user.display).toBe('GuestCheck');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. JWT VERIFY
// ═════════════════════════════════════════════════════════════════════════════
describe('JWT Verify', () => {
  test('valid JWT', async () => {
    const inv = await api.post(`/api/exam/${examRoomId}/invite`, {
      patientName: 'JWT Jest'
    }, { headers: authHeaders });
    const jwt = inv.data.patientJoinUrl.split('jwt=')[1];
    const r = await api.post('/api/jwt/verify', { token: jwt });
    expect(r.status).toBe(200);
    expect(r.data.valid).toBe(true);
  });

  test('invalid JWT', async () => {
    const r = await api.post('/api/jwt/verify', { token: 'not.valid.jwt' });
    expect(r.status).toBe(401);
  });

  test('missing token', async () => {
    const r = await api.post('/api/jwt/verify', {});
    expect(r.status).toBe(400);
  });
});
