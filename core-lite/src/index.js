require('dotenv').config();
// Allow self-signed / incomplete-chain certs on outbound calls to moph.id.th & provider.id.th
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const { createHash, randomInt } = require('crypto');
const NodeCache = require('node-cache');
const jwt = require('jsonwebtoken');
const { tokenStorage } = require('./cache');
const { auth } = require('./middlewares/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_jwt_secret';

// Short-lived cache for ProviderID code exchange (handles slow-network retries)
const codeCache = new NodeCache({ stdTTL: 10, checkperiod: 5 });

const PORT = process.env.APP_PORT || 3500;

const PROVIDER_ID_CLIENT_ID = process.env.PROVIDER_ID_CLIENT_ID;
const PROVIDER_ID_CLIENT_SECRET = process.env.PROVIDER_ID_CLIENT_SECRET;
const PROVIDER_ID_REDIRECT_URI = process.env.PROVIDER_ID_REDIRECT_URI;
const PROVIDER_SERVICE_CLIENT_ID = process.env.PROVIDER_SERVICE_CLIENT_ID;
const PROVIDER_SERVICE_SECRET_KEY = process.env.PROVIDER_SERVICE_SECRET_KEY;
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, ''); // e.g. https://moph-meet.moph.go.th

// ── App ────────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors());

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Auth: Provider ID ──────────────────────────────────────────────────────────
app.post('/api/auth/providerID', async (req, res, next) => {
    console.log('[ProviderID] auth request received');
    const { code } = req.body;
    console.log('[ProviderID] exchanging code:', code);

    // Return cached result if same code is retried within 10 s
    const cached = codeCache.get(code);
    if (cached) {
        console.log('[ProviderID] returning cached response for code');
        return res.json(cached);
    }

    try {
        // Step 1 – exchange code → HealthID access_token
        const oauthPayload = {
            grant_type: 'authorization_code',
            client_id: PROVIDER_ID_CLIENT_ID,
            client_secret: PROVIDER_ID_CLIENT_SECRET,
            code,
            redirect_uri: PROVIDER_ID_REDIRECT_URI,
        };
        console.log('[ProviderID] oauth payload:', JSON.stringify(oauthPayload));

        const oauthRes = await fetch('https://moph.id.th/api/v1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(oauthPayload),
        });
        const oauthJson = await oauthRes.json();
        console.log('[ProviderID] moph.id.th token response:', JSON.stringify(oauthJson));

        const healthIDToken = oauthJson?.data?.access_token;
        if (!healthIDToken) {
            // Pass through the exact error from moph.id.th for easier diagnosis
            const providerError = oauthJson?.error || oauthJson?.message || 'invalidProviderIDToken';
            console.error('[ProviderID] moph.id.th refused code – error:', providerError);
            return res.status(401).json({ error: 401, message: providerError, detail: oauthJson });
        }

        // Step 2 – exchange HealthID token → Provider ID service token
        const providerTokenRes = await fetch('https://provider.id.th/api/v1/services/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: PROVIDER_SERVICE_CLIENT_ID,
                secret_key: PROVIDER_SERVICE_SECRET_KEY,
                token_by: 'Health ID',
                token: healthIDToken,
            }),
        });
        const providerToken = await providerTokenRes.json();
        console.log('[ProviderID] provider.id.th token:', JSON.stringify(providerToken));

        // Step 3 – get provider profile
        const profileRes = await fetch(
            'https://provider.id.th/api/v1/services/profile?moph_center_token=1',
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${providerToken.data.access_token}`,
                    'client-id': PROVIDER_SERVICE_CLIENT_ID,
                    'secret-key': PROVIDER_SERVICE_SECRET_KEY,
                },
            }
        );
        const profile = await profileRes.json();
        console.log('[ProviderID] profile:', JSON.stringify(profile?.data));

        if (!profile.data?.account_id) {
            return res.status(401).json({ error: 401, message: 'invalidProviderIDProfile' });
        }

        // Step 4 – build user object from ProviderID profile (no DB)
        const user = {
            username: profile.data.account_id,
            display: profile.data.name_th || profile.data.name_en || profile.data.account_id,
            roles: ['staff'],
            roleMaps: [{ roleName: 'staff' }],
            organization: profile.data.organization || null,
            providerIDProfile: profile.data,
        };

        const token = createHash('sha256')
            .update(new Date().toISOString() + user.username + randomInt(1000))
            .digest('hex');

        tokenStorage.set(token, user);

        const response = {
            data: {
                token,
                user,
                providerID: providerToken.data,
                providerIDProfile: profile.data,
            },
        };

        codeCache.set(code, response);
        console.log('[ProviderID] response cached for 10s');

        return res.json(response);
    } catch (err) {
        console.error('[ProviderID] error:', err);
        next(err);
    }
});

// ── Auth: Guest / temporary token ─────────────────────────────────────────────
app.post('/api/auth/guest', async (req, res, next) => {
    try {
        const { token } = req.body;
        if (!token || !tokenStorage.has(token)) {
            return res.status(401).json({ error: 401, message: 'invalidToken' });
        }
        // Guest tokens are pre-stored lightweight objects (see /api/guest/token)
        const guestSession = tokenStorage.get(token);
        return res.json({
            token,
            user: guestSession.user,
            meetId: guestSession.meetId,
        });
    } catch (err) {
        next(err);
    }
});

// ── Auth: check & logout ───────────────────────────────────────────────────────
app.post('/api/auth/check', (req, res, next) => {
    if (!tokenStorage.has(req.body.token)) {
        return res.status(401).json({ error: 401, message: 'invalidToken' });
    }
    res.json({ token: req.body.token });
});

app.post('/api/logout', (req, res) => {
    tokenStorage.del(req.body.token);
    res.json({ token: req.body.token });
});

// ── Room storage (disk-backed SQLite via roomStore) ───────────────────────────
// roomStore: roomId → { id, type, name, starttime, endtime, ownerId, ownerDisplay,
//                        createdAt, queue: [], currentPatientToken: null }
// ── Disk-backed room store (same SQLite db as tokenStorage) ──────────────────
const { Database: _DB } = (() => { try { return { Database: require('better-sqlite3') }; } catch { return {}; } })();
const _path = require('path');
const _roomDb = new (require('better-sqlite3'))(_path.join(process.env.DATA_DIR || _path.join(__dirname, '../../data'), 'rooms.db'));
_roomDb.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);
const _purgeRooms = _roomDb.prepare('DELETE FROM rooms WHERE expires_at < ?');
_purgeRooms.run(Date.now());
setInterval(() => _purgeRooms.run(Date.now()), 10 * 60 * 1000).unref();

const _roomGet  = _roomDb.prepare('SELECT value, expires_at FROM rooms WHERE id = ?');
const _roomSet  = _roomDb.prepare('INSERT OR REPLACE INTO rooms (id, value, expires_at) VALUES (?, ?, ?)');
const _roomDel  = _roomDb.prepare('DELETE FROM rooms WHERE id = ?');
const _roomKeys = _roomDb.prepare('SELECT id FROM rooms WHERE expires_at > ?');

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

const roomStore = {
    get(id) {
        const row = _roomGet.get(id);
        if (!row) return undefined;
        if (row.expires_at < Date.now()) { _roomDel.run(id); return undefined; }
        return JSON.parse(row.value);
    },
    set(id, value, ttlSeconds) {
        const exp = Date.now() + (ttlSeconds ? ttlSeconds * 1000 : ROOM_TTL_MS);
        _roomSet.run(id, JSON.stringify(value), exp);
    },
    del(id) { _roomDel.run(id); },
    keys() { return _roomKeys.all(Date.now()).map(r => r.id); },
};

// ── Helper: generate a short room ID ──────────────────────────────────────────
function makeRoomId() {
    return createHash('sha256')
        .update(Date.now().toString() + randomInt(999999))
        .digest('hex')
        .slice(0, 12);
}

// ── Helper: generate Thai-style auto room name ────────────────────────────────
function autoRoomName(type, ownerDisplay) {
    const d = new Date();
    const dateStr = d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    if (type === 'exam') return `ตรวจ-${ownerDisplay || 'แพทย์'}-${dateStr}-${timeStr}`;
    return `ประชุม-${ownerDisplay || 'ผู้นัด'}-${dateStr}-${timeStr}`;
}

// ── Meets – proxied from token cache (no DB) ─────────────────────────────────
app.get('/api/meets', auth(), (req, res) => {
    // Return all rooms owned by this user
    const userId = res.locals.user?.username;
    const rooms = [];
    roomStore.keys().forEach(k => {
        const r = roomStore.get(k);
        if (r && r.ownerId === userId) rooms.push(r);
    });
    rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(rooms);
});

// ── POST /api/rooms – create meet or exam room ────────────────────────────────
app.post('/api/rooms', auth(), (req, res) => {
    const { type, starttime, endtime } = req.body;
    if (!['meet', 'exam'].includes(type)) {
        return res.status(400).json({ error: 400, message: 'type must be meet or exam' });
    }

    const user = res.locals.user;
    const id   = makeRoomId();
    const name = autoRoomName(type, user.display);

    const room = {
        id,
        type,
        name,
        starttime: starttime || new Date().toISOString(),
        endtime:   endtime   || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        ownerId:      user.username,
        ownerDisplay: user.display,
        createdAt:    new Date().toISOString(),
        // exam-specific
        queue:               [],   // [{ token, patientName, joinedAt, status:'waiting'|'admitted'|'done' }]
        currentPatientToken: null,
        recording:           type === 'exam',
    };

    roomStore.set(id, room);
    console.log(`[rooms] created ${type} room ${id} for ${user.display}`);

    // Build patient join URL for exam rooms (JWT, 8h TTL)
    let patientJoinUrl = null;
    if (type === 'exam') {
        const jwt_token = jwt.sign(
            { roomId: id, role: 'patient', ownerId: user.username },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        patientJoinUrl = `/queue/${id}?jwt=${jwt_token}`;
    }

    // Meet rooms: join URL uses provider token (already authenticated)
    const meetJoinUrl = type === 'meet' ? `/room/${id}` : null;

    res.json({ room, patientJoinUrl, meetJoinUrl });
});

// ── GET /api/rooms/:id ────────────────────────────────────────────────────────
app.get('/api/rooms/:id', auth(), (req, res) => {
    const room = roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    // Only owner can view full room details
    if (room.ownerId !== res.locals.user?.username) {
        return res.status(403).json({ error: 403, message: 'forbidden' });
    }
    res.json(room);
});

// ── GET /api/exam/:id/queue – patient polls this ──────────────────────────────
// Auth via JWT query param (no session required for patients)
app.get('/api/exam/:id/queue', (req, res) => {
    const { jwt: jwtToken } = req.query;
    if (!jwtToken) return res.status(401).json({ error: 401, message: 'jwt required' });

    let payload;
    try { payload = jwt.verify(jwtToken, JWT_SECRET); }
    catch (e) { return res.status(401).json({ error: 401, message: 'invalid jwt' }); }

    const room = roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'room not found' });

    // Register patient in queue if not already there
    if (!room.queue.find(q => q.token === jwtToken)) {
        const patientName = payload.patientName || 'ผู้ป่วย';
        room.queue.push({ token: jwtToken, patientName, joinedAt: new Date().toISOString(), status: 'waiting' });
        roomStore.set(req.params.id, room);
        console.log(`[exam] patient "${patientName}" joined queue for room ${req.params.id}`);
    }

    const myEntry = room.queue.find(q => q.token === jwtToken);
    const position = room.queue.filter(q => q.status === 'waiting').findIndex(q => q.token === jwtToken) + 1;

    res.json({
        status:   myEntry.status,
        position: myEntry.status === 'waiting' ? position : 0,
        total:    room.queue.filter(q => q.status === 'waiting').length,
        roomName: room.name,
    });
});

// ── POST /api/exam/:id/next – doctor calls next patient ───────────────────────
app.post('/api/exam/:id/next', auth(), (req, res) => {
    const room = roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (room.ownerId !== res.locals.user?.username) return res.status(403).json({ error: 403, message: 'forbidden' });

    // Mark previous current as done
    if (room.currentPatientToken) {
        const prev = room.queue.find(q => q.token === room.currentPatientToken);
        if (prev) prev.status = 'done';
    }

    // Admit next waiting patient
    const next = room.queue.find(q => q.status === 'waiting');
    if (!next) {
        room.currentPatientToken = null;
        roomStore.set(req.params.id, room);
        return res.json({ admitted: null, queueLength: 0 });
    }

    next.status = 'admitted';
    room.currentPatientToken = next.token;
    roomStore.set(req.params.id, room);

    console.log(`[exam] admitted patient "${next.patientName}" for room ${req.params.id}`);
    res.json({
        admitted:    next.patientName,
        queueLength: room.queue.filter(q => q.status === 'waiting').length,
    });
});

// ── GET /api/exam/:id/doctor – room info for doctor ───────────────────────────
app.get('/api/exam/:id/doctor', auth(), (req, res) => {
    const room = roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (room.ownerId !== res.locals.user?.username) return res.status(403).json({ error: 403, message: 'forbidden' });
    res.json(room);
});

// ── POST /api/exam/:id/invite – doctor generates a patient invite ─────────────
// Body: { patientName?, cid?, displayName? }
// Returns: queue link (for queue.ejs flow) + direct Jitsi JWT link (compat)
app.post('/api/exam/:id/invite', auth(), (req, res) => {
    const room = roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (room.ownerId !== res.locals.user?.username) return res.status(403).json({ error: 403, message: 'forbidden' });

    const patientName = (req.body.displayName || req.body.patientName || '').trim() || 'ผู้ป่วย';
    const cid         = (req.body.cid || '').trim();

    const queue_token = jwt.sign(
        { roomId: req.params.id, role: 'patient', ownerId: room.ownerId, patientName, cid },
        JWT_SECRET,
        { expiresIn: '8h' }
    );
    const patientJoinUrl = `/queue/${req.params.id}?jwt=${queue_token}`;

    console.log(`[exam] invite generated for "${patientName}"${cid ? ` (${cid})` : ''} in room ${req.params.id}`);
    res.json({ patientJoinUrl, patientName, cid });
});

// Legacy stubs kept for compatibility
app.get('/api/meets/:id', auth(), (req, res) => res.status(404).json({ error: 404, message: 'notFound' }));

// ── POST /api/meet/reserved – backward-compat: create exam room via API key ───
// Called by appointment system to pre-create a room for a specific doctor.
// Body: { sessionName?, startTime, endTime, cid, displayName, account_id }
//   cid / account_id  — doctor's CID; becomes the room owner so only that doctor
//                       can open the exam room with their ProviderID session.
// Returns: { sessionID, meet: <full doctor URL>, patientJoinUrl: <full patient URL> }
app.post('/api/meet/reserved', auth(), (req, res) => {
    const { sessionName, startTime, endTime, cid, displayName, account_id } = req.body;

    // Doctor identity MUST come from the request body (CID from appointment),
    // not from the API-key caller's session which has no meaningful user context.
    const doctorId      = account_id || cid;
    const doctorDisplay = displayName || doctorId || 'แพทย์';

    if (!doctorId) {
        return res.status(400).json({ error: 400, message: 'cid or account_id required' });
    }

    const id   = makeRoomId();
    const name = sessionName || autoRoomName('exam', doctorDisplay);

    const room = {
        id,
        type: 'exam',
        name,
        starttime:    startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
        endtime:      endTime   ? new Date(endTime).toISOString()   : new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        ownerId:      doctorId,       // doctor's CID — must match their ProviderID login
        ownerDisplay: doctorDisplay,
        createdAt:    new Date().toISOString(),
        queue:               [],
        currentPatientToken: null,
        recording:           true,
    };

    roomStore.set(id, room);
    console.log(`[reserved] created exam room ${id} owner=${doctorId} (${doctorDisplay})`);

    // Doctor link — full absolute URL so doctor can open it directly
    const doctorUrl = `${APP_BASE_URL}/exam/${id}`;

    // Patient link — JWT queue flow, full absolute URL
    const queue_token = jwt.sign(
        { roomId: id, role: 'patient', ownerId: doctorId, patientName: 'ผู้ป่วย', cid: '' },
        JWT_SECRET,
        { expiresIn: '8h' }
    );
    const patientJoinUrl = `${APP_BASE_URL}/queue/${id}?jwt=${queue_token}`;

    res.json({ sessionID: id, meet: doctorUrl, patientJoinUrl });
});

// ── POST /api/meet/reserved/token – backward-compat: generate patient queue link ─
// Accepts: { sessionID, displayName, cid, patientName }
// Returns: { sessionID, meet: patientJoinUrl, patientJoinUrl }
app.post('/api/meet/reserved/token', auth(), (req, res) => {
    const { sessionID, displayName, patientName, cid } = req.body;
    if (!sessionID) return res.status(400).json({ error: 400, message: 'sessionID required' });

    const room = roomStore.get(sessionID);
    if (!room) return res.status(400).json({ error: 400, message: 'invalidSessionID' });

    const name = (displayName || patientName || '').trim() || 'ผู้ป่วย';

    const queue_token = jwt.sign(
        { roomId: sessionID, role: 'patient', ownerId: room.ownerId, patientName: name, cid: cid || '' },
        JWT_SECRET,
        { expiresIn: '8h' }
    );
    const patientJoinUrl = `/queue/${sessionID}?jwt=${queue_token}`;

    console.log(`[reserved/token] queue link issued for "${name}" in room ${sessionID}`);
    res.json({ sessionID, meet: patientJoinUrl, patientJoinUrl });
});

// ── Guest token generator (called by staff to create patient invite links) ─────
app.post('/api/guest/token', auth(), async (req, res, next) => {
    try {
        const { meetId, patientName, ttlSeconds } = req.body;
        if (!meetId) return res.status(400).json({ error: 400, message: 'meetId required' });

        const guestToken = createHash('sha256')
            .update(new Date().toISOString() + meetId + randomInt(9999))
            .digest('hex');

        const guestSession = {
            meetId,
            user: { display: patientName || 'Guest', roles: ['guest'] },
        };

        tokenStorage.set(guestToken, guestSession, ttlSeconds || 24 * 60 * 60);
        res.json({ token: guestToken, meetId });
    } catch (err) {
        next(err);
    }
});

// ── JWT verify endpoint – used by user-app-lite to validate patient JWT ────────
app.post('/api/jwt/verify', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 400, message: 'token required' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        res.json({ valid: true, payload });
    } catch (e) {
        res.status(401).json({ valid: false, message: e.message });
    }
});

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    if (res.statusCode === 200) res.status(400);
    console.error(new Date().toISOString(), err.message);
    res.json({ error: res.statusCode, message: err.message });
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`core-lite running on http://0.0.0.0:${PORT}`);
});
