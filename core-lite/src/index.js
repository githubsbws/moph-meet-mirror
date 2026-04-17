require('dotenv').config();
// Allow self-signed / incomplete-chain certs on outbound calls to moph.id.th & provider.id.th
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const { createHash, randomInt } = require('crypto');
const NodeCache = require('node-cache');
const jwt = require('jsonwebtoken');
const { tokenStorage, roomStore, profileStore, logStore } = require('./store');
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

        // Step 4 – build user object from ProviderID profile + saved extra fields
        const extraProfile = await profileStore.get(profile.data.account_id);
        const user = {
            username: profile.data.account_id,
            display: profile.data.name_th || profile.data.name_en || profile.data.account_id,
            roles: ['staff'],
            roleMaps: [{ roleName: 'staff' }],
            organization: profile.data.organization || null,
            providerIDProfile: profile.data,
            hcode5: extraProfile.hcode5 || '',
            hcode9: extraProfile.hcode9 || '',
            clinicCode: extraProfile.clinicCode || '',
            dateOfBirth: extraProfile.dateOfBirth || '',
            gender: extraProfile.gender || '',
        };

        const token = createHash('sha256')
            .update(new Date().toISOString() + user.username + randomInt(1000))
            .digest('hex');

        await tokenStorage.set(token, user);

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
        if (!token || !(await tokenStorage.has(token))) {
            return res.status(401).json({ error: 401, message: 'invalidToken' });
        }
        const guestSession = await tokenStorage.get(token);
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
app.post('/api/auth/check', async (req, res, next) => {
    if (!(await tokenStorage.has(req.body.token))) {
        return res.status(401).json({ error: 401, message: 'invalidToken' });
    }
    const user = await tokenStorage.get(req.body.token);
    res.json({ token: req.body.token, user });
});

app.post('/api/logout', async (req, res) => {
    await tokenStorage.del(req.body.token);
    res.json({ token: req.body.token });
});

// ── Auth: update extra profile fields ─────────────────────────────────────────
app.patch('/api/auth/profile', auth(), async (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const user = res.locals.user;
    if (!user?.username) return res.status(401).json({ error: 401, message: 'unauthorized' });
    const { hcode5, hcode9, clinicCode, dateOfBirth, gender } = req.body;
    await profileStore.upsert(user.username, { hcode5, hcode9, clinicCode, dateOfBirth, gender });
    // Update in-memory session too
    const updated = { ...user, hcode5: (hcode5 || '').trim(), hcode9: (hcode9 || '').trim(), clinicCode: (clinicCode || '').trim(), dateOfBirth: (dateOfBirth || '').trim(), gender: (gender || '').trim() };
    await tokenStorage.set(token, updated);
    res.json({ ok: true, user: updated });
});

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

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
app.get('/api/meets', auth(), async (req, res) => {
    const userId = res.locals.user?.username;
    const rooms = [];
    const keys = await roomStore.keys();
    for (const k of keys) {
        const r = await roomStore.get(k);
        if (!r) continue;
        const isOwner = r.ownerId === userId;
        const isJoined = Array.isArray(r.joinedProviders) && r.joinedProviders.some(p => p.userId === userId);
        if (isOwner || isJoined) rooms.push(r);
    }
    rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(rooms);
});

// ── POST /api/rooms – create meet or exam room ────────────────────────────────
app.post('/api/rooms', auth(), async (req, res) => {
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
        joinedProviders: [],
        queue:               [],
        currentPatientToken: null,
        recording:           type === 'exam',
    };

    const roomTtlMs = Math.max(ROOM_TTL_MS, new Date(room.endtime).getTime() - Date.now() + 25 * 60 * 60 * 1000);
    await roomStore.set(id, room, roomTtlMs / 1000);
    console.log(`[rooms] created ${type} room ${id} for ${user.display}`);
    await logStore.insert('room_created', { roomId: id, roomType: type, roomName: name, doctorId: user.username, doctorName: user.display });

    // Build patient join URL for exam rooms (JWT, no expiry)
    let patientJoinUrl = null;
    if (type === 'exam') {
        const jwt_token = jwt.sign(
            { roomId: id, role: 'patient', ownerId: user.username },
            JWT_SECRET
        );
        patientJoinUrl = `/queue/${id}?jwt=${jwt_token}`;
    }

    // Meet rooms: join URL uses provider token (already authenticated)
    const meetJoinUrl = type === 'meet' ? `/room/${id}` : null;

    res.json({ room, patientJoinUrl, meetJoinUrl });
});

// ── GET /api/rooms/:id ────────────────────────────────────────────────────────
app.get('/api/rooms/:id', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });

    const userId = res.locals.user?.username;
    if (userId && room.ownerId !== userId) {
        if (!Array.isArray(room.joinedProviders)) room.joinedProviders = [];
        if (!room.joinedProviders.some(p => p.userId === userId)) {
            room.joinedProviders.push({
                userId,
                display: res.locals.user?.display || userId,
                joinedAt: new Date().toISOString()
            });
            await roomStore.set(req.params.id, room);
            console.log(`[rooms] provider ${userId} joined room ${req.params.id}`);
        }
    }

    res.json(room);
});

// ── GET /api/exam/:id/queue – patient polls this ──────────────────────────────
// Auth via JWT query param (no session required for patients)
app.get('/api/exam/:id/queue', async (req, res) => {
    const { jwt: jwtToken } = req.query;
    if (!jwtToken) return res.status(401).json({ error: 401, message: 'jwt required' });

    let payload;
    try { payload = jwt.verify(jwtToken, JWT_SECRET); }
    catch (e) { return res.status(401).json({ error: 401, message: 'invalid jwt' }); }

    let room = await roomStore.get(req.params.id);

    // Auto-recover room from JWT when store lost it (TTL / restart)
    if (!room) {
        console.log(`[exam] room ${req.params.id} not in store — auto-recovering from JWT`);
        room = {
            id:           req.params.id,
            name:         req.params.id,
            type:         'exam',
            ownerId:      payload.ownerId || 'unknown',
            ownerDisplay: payload.ownerId || 'unknown',
            queue:        [],
            starttime:    new Date(payload.iat * 1000).toISOString(),
            endtime:      payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
            createdAt:    new Date().toISOString(),
            recovered:    true,
        };
        const ttl = payload.exp ? Math.max(payload.exp - Math.floor(Date.now() / 1000), 3600) + 90000 : 90000;
        await roomStore.set(req.params.id, room, ttl);
    }

    if (!room.queue) room.queue = [];

    if (!room.queue.find(q => q.token === jwtToken)) {
        const patientName = payload.patientName || 'ผู้ป่วย';
        room.queue.push({ token: jwtToken, patientName, joinedAt: new Date().toISOString(), status: 'waiting' });
        await roomStore.set(req.params.id, room);
        console.log(`[exam] patient "${patientName}" joined queue for room ${req.params.id}`);
        await logStore.insert('patient_joined_queue', { roomId: req.params.id, roomType: room.type, roomName: room.name, doctorId: room.ownerId, doctorName: room.ownerDisplay, patientName, patientCid: payload.cid || '' });
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
app.post('/api/exam/:id/next', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });

    const userId = res.locals.user?.username;
    if (userId && room.ownerId !== userId) {
        if (!Array.isArray(room.joinedProviders)) room.joinedProviders = [];
        if (!room.joinedProviders.some(p => p.userId === userId)) {
            room.joinedProviders.push({ userId, display: res.locals.user?.display || userId, joinedAt: new Date().toISOString() });
            await roomStore.set(req.params.id, room);
        }
    }

    if (room.currentPatientToken) {
        const prev = room.queue.find(q => q.token === room.currentPatientToken);
        if (prev) prev.status = 'done';
    }

    const next = room.queue.find(q => q.status === 'waiting');
    if (!next) {
        room.currentPatientToken = null;
        await roomStore.set(req.params.id, room);
        return res.json({ admitted: null, queueLength: 0 });
    }

    next.status = 'admitted';
    room.currentPatientToken = next.token;
    await roomStore.set(req.params.id, room);

    console.log(`[exam] admitted patient "${next.patientName}" for room ${req.params.id}`);
    await logStore.insert('patient_admitted', { roomId: req.params.id, roomType: room.type, roomName: room.name, doctorId: res.locals.user?.username, doctorName: res.locals.user?.display, patientName: next.patientName });
    res.json({ admitted: next.patientName, queueLength: room.queue.filter(q => q.status === 'waiting').length });
});

// ── GET /api/exam/:id/doctor – room info for doctor ───────────────────────────
app.get('/api/exam/:id/doctor', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    res.json(room);
});

// ── POST /api/exam/:id/invite – doctor generates a patient invite ─────────────
// Body: { patientName?, cid?, displayName? }
// Returns: queue link (for queue.ejs flow) + direct Jitsi JWT link (compat)
app.post('/api/exam/:id/invite', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });

    const userId = res.locals.user?.username;
    if (userId && room.ownerId !== userId) {
        if (!Array.isArray(room.joinedProviders)) room.joinedProviders = [];
        if (!room.joinedProviders.some(p => p.userId === userId)) {
            room.joinedProviders.push({ userId, display: res.locals.user?.display || userId, joinedAt: new Date().toISOString() });
            await roomStore.set(req.params.id, room);
        }
    }

    const patientName = (req.body.displayName || req.body.patientName || '').trim() || 'ผู้ป่วย';
    const cid         = (req.body.cid || '').trim();

    const queue_token = jwt.sign(
        { roomId: req.params.id, role: 'patient', ownerId: room.ownerId, patientName, cid },
        JWT_SECRET
    );
    const patientJoinUrl = `/queue/${req.params.id}?jwt=${queue_token}`;

    console.log(`[exam] invite generated for "${patientName}"${cid ? ` (${cid})` : ''} in room ${req.params.id}`);
    await logStore.insert('invite_generated', { roomId: req.params.id, roomType: room.type, roomName: room.name, doctorId: res.locals.user?.username, doctorName: res.locals.user?.display, patientName, patientCid: cid });
    res.json({ patientJoinUrl, patientName, cid });
});

// Legacy stubs kept for compatibility
app.get('/api/meets/:id', auth(), (req, res) => res.status(404).json({ error: 404, message: 'notFound' }));

// ── POST /api/rooms/:id/join – explicitly join a room as a provider ───────────
// Called when a logged-in provider opens a room link that was shared with them.
app.post('/api/rooms/:id/join', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });

    const userId = res.locals.user?.username;
    if (!userId) return res.status(401).json({ error: 401, message: 'unauthorized' });
    if (room.ownerId === userId) return res.json({ joined: false, reason: 'owner', room });

    if (!Array.isArray(room.joinedProviders)) room.joinedProviders = [];
    if (!room.joinedProviders.some(p => p.userId === userId)) {
        room.joinedProviders.push({ userId, display: res.locals.user?.display || userId, joinedAt: new Date().toISOString() });
        await roomStore.set(req.params.id, room);
    }

    res.json({ joined: true, room });
});

// ── POST /api/meet/reserved – backward-compat: create exam room via API key ───
// Called by appointment system to pre-create a room for a specific doctor.
// Body: { sessionName?, startTime, endTime, cid?, displayName?, account_id? }
// Returns: { sessionID, meet: <full doctor URL>, patientJoinUrl: <full patient URL> }
// Auth: open temporarily (no key required) for 3rd-party onboarding
app.post('/api/meet/reserved', async (req, res) => {
    const { sessionName, startTime, endTime, cid, displayName, account_id } = req.body;

    // Doctor identity is optional for lite — fallback to anonymous room
    const doctorId      = account_id || cid || `anon_${Date.now()}`;
    const doctorDisplay = displayName || (account_id || cid ? doctorId : 'แพทย์');

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
        joinedProviders: [],
        queue:               [],
        currentPatientToken: null,
        recording:           true,
    };

    // Room TTL = endtime + 25 hr buffer (so room stays alive until well after session ends)
    const roomTtlMs = Math.max(ROOM_TTL_MS, new Date(room.endtime).getTime() - Date.now() + 25 * 60 * 60 * 1000);
    await roomStore.set(id, room, roomTtlMs / 1000);

    const doctorUser = {
        username: doctorId,
        display:  doctorDisplay,
        roles:    ['staff'],
        roleMaps: [{ roleName: 'staff' }],
    };
    const doctorToken = createHash('sha256')
        .update(new Date().toISOString() + doctorId + randomInt(1000))
        .digest('hex');
    await tokenStorage.set(doctorToken, doctorUser);

    console.log(`[reserved] created exam room ${id} owner=${doctorId} (${doctorDisplay})`);
    await logStore.insert('reserved_room_created', { roomId: id, roomType: 'exam', roomName: name, doctorId, doctorName: doctorDisplay, meta: { startTime: room.starttime, endTime: room.endtime } });

    // Full absolute URLs – include token so 3rd-party apps that only use the
    // `meet` URL can auto-authenticate the doctor without a separate login step.
    const doctorUrl = `${APP_BASE_URL}/exam/${id}?token=${doctorToken}`;

    // exp = 24 hr after session end (iat = now, so token is valid immediately)
    const reservedExp = Math.floor(new Date(room.endtime).getTime() / 1000) + 86400;
    const queue_token = jwt.sign(
        { roomId: id, role: 'patient', ownerId: doctorId, patientName: 'ผู้ป่วย', cid: '', exp: reservedExp },
        JWT_SECRET
    );
    const patientJoinUrl = `${APP_BASE_URL}/queue/${id}?jwt=${queue_token}`;

    res.json({ sessionID: id, meet: doctorUrl, patientJoinUrl, doctorToken });
});

// ── POST /api/meet/reserved/token – generate patient queue link (same as doctor invite)
// Body: { sessionID, displayName?, patientName?, cid? }
// Returns: { sessionID, meet: patientJoinUrl, patientJoinUrl }
// Auth: open – called from 3rd-party appointment systems (no session required)
// Note: cid is optional — works without it
app.post('/api/meet/reserved/token', async (req, res) => {
    const { sessionID, displayName, patientName, cid } = req.body;
    if (!sessionID) return res.status(400).json({ error: 400, message: 'sessionID required' });

    const room = await roomStore.get(sessionID);
    if (!room) return res.status(400).json({ error: 400, message: 'invalidSessionID' });

    const name       = (displayName || patientName || '').trim() || 'ผู้ป่วย';
    const patientCid = (cid || '').trim();

    const reservedExp = Math.floor(new Date(room.endtime).getTime() / 1000) + 86400;
    const queue_token = jwt.sign(
        { roomId: sessionID, role: 'patient', ownerId: room.ownerId, patientName: name, cid: patientCid, exp: reservedExp },
        JWT_SECRET
    );
    const patientJoinUrl = `${APP_BASE_URL}/queue/${sessionID}?jwt=${queue_token}`;

    console.log(`[reserved/token] queue link issued for "${name}"${patientCid ? ` (${patientCid})` : ''} in room ${sessionID}`);
    await logStore.insert('reserved_token_issued', { roomId: sessionID, roomType: room.type, roomName: room.name, doctorId: room.ownerId, doctorName: room.ownerDisplay, patientName: name, patientCid });
    res.json({ sessionID, meet: patientJoinUrl, patientJoinUrl });
});

// ── Guest token generator (called by staff to create patient invite links) ─────
app.post('/api/guest/token', /*auth(),*/ async (req, res, next) => {
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

        await tokenStorage.set(guestToken, guestSession, ttlSeconds || 24 * 60 * 60);
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

// ── Usage Log API (public – for transparency dashboard) ────────────────────────

// GET /api/logs/summary – overall stats
app.get('/api/logs/summary', async (_req, res) => {
    res.json(await logStore.summary());
});

// GET /api/logs/daily?days=30 – events per day
app.get('/api/logs/daily', async (req, res) => {
    res.json(await logStore.daily(parseInt(req.query.days) || 30));
});

// GET /api/logs/monthly?months=12 – events per month
app.get('/api/logs/monthly', async (req, res) => {
    res.json(await logStore.monthly(parseInt(req.query.months) || 12));
});

// GET /api/logs/by-doctor?months=3 – usage grouped by doctor
app.get('/api/logs/by-doctor', async (req, res) => {
    res.json(await logStore.byDoctor(parseInt(req.query.months) || 3));
});

// GET /api/logs/recent?limit=50 – recent event log
app.get('/api/logs/recent', async (req, res) => {
    res.json(await logStore.recent(parseInt(req.query.limit) || 50));
});

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    if (res.statusCode === 200) res.status(400);
    console.error(new Date().toISOString(), err.message);
    res.json({ error: res.statusCode, message: err.message });
});

// ── Start ──────────────────────────────────────────────────────────────────────
(async () => {
    const { init } = require('./store');
    await init();
    app.listen(PORT, () => {
        console.log(`core-lite running on http://0.0.0.0:${PORT}`);
    });
})();
