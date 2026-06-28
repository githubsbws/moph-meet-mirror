require('dotenv').config();
// Allow self-signed / incomplete-chain certs on outbound calls to moph.id.th & provider.id.th
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const { createHash, randomInt } = require('crypto');
const NodeCache = require('node-cache');
const jwt = require('jsonwebtoken');
const { tokenStorage, roomStore, profileStore, logStore, vitalStore } = require('./store');
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

function parseManualAccounts() {
    const fallback = [
        {
            username: 'Admin',
            password: 'Admin123@',
            display: 'App Reviewer (Temporary)',
            roles: ['admin', 'staff'],
            roleMaps: [{ roleName: 'admin' }, { roleName: 'staff' }],
            isReviewAccount: true,
        },
        {
            username: 'test',
            password: 'test@1234',
            display: 'Test User',
            roles: ['admin', 'staff'],
            roleMaps: [{ roleName: 'admin' }, { roleName: 'staff' }],
            isReviewAccount: false,
        },
    ];
    if (!process.env.MANUAL_LOGIN_ACCOUNTS) return fallback;
    try {
        const parsed = JSON.parse(process.env.MANUAL_LOGIN_ACCOUNTS);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
    } catch (_) {
        return fallback;
    }
}

const MANUAL_LOGIN_ENABLED = process.env.MANUAL_LOGIN_ENABLED !== 'false';
const MANUAL_LOGIN_ACCOUNTS = parseManualAccounts();

function buildManualUser(account) {
    const roles = Array.isArray(account.roles) && account.roles.length > 0 ? account.roles : ['staff'];
    return {
        username: account.username,
        display: account.display || account.username,
        roles,
        roleMaps: roles.map(roleName => ({ roleName })),
        organization: null,
        providerIDProfile: null,
        isReviewAccount: Boolean(account.isReviewAccount),
        authMode: 'manual',
    };
}


// ── LINE OA Notification helper (TOR 4.11.1) ─────────────────────────────────
// Non-blocking: failure is logged, never delays room creation.
// Set LINE_CHANNEL_TOKEN + LINE_TARGET (userId or groupId) in env to enable.

const LINE_CHANNEL_TOKEN = process.env.LINE_CHANNEL_TOKEN || '';
const LINE_TARGET        = process.env.LINE_TARGET        || '';

async function notifyLine(message) {
    if (!LINE_CHANNEL_TOKEN || !LINE_TARGET) {
        console.log('[notify] LINE not configured — skip. Set LINE_CHANNEL_TOKEN + LINE_TARGET to enable.');
        return;
    }
    try {
        await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${LINE_CHANNEL_TOKEN}`,
            },
            body: JSON.stringify({
                to: LINE_TARGET,
                messages: [{ type: 'text', text: message }],
            }),
        });
        console.log('[notify] LINE push sent');
    } catch (e) {
        console.warn('[notify] LINE push failed:', e.message);
    }
}

// ── App ────────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors());

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Auth: Manual username/password ────────────────────────────────────────────
app.post('/api/auth', async (req, res) => {
    if (!MANUAL_LOGIN_ENABLED) {
        return res.status(403).json({ error: 403, message: 'manualLoginDisabled' });
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const account = MANUAL_LOGIN_ACCOUNTS.find(item => item.username === username && item.password === password);

    if (!account) {
        return res.status(401).json({ error: 401, message: 'invalidUsernameOrPassword' });
    }

    const user = buildManualUser(account);
    const token = createHash('sha256')
        .update(new Date().toISOString() + user.username + randomInt(1000))
        .digest('hex');

    await tokenStorage.set(token, user);
    return res.json({ token, user });
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


// ── Auth: ThaID (TOR 4.6 — ช่องทางที่ 3) ─────────────────────────────────────
// TODO: เมื่อได้ THAID_* credentials จาก สธ ให้กรอก env และเอา TODO notice ออก
// โครงเดียวกับ POST /api/auth/providerID — exchange code → token → profile → session
const THAID_CLIENT_ID    = process.env.THAID_CLIENT_ID    || '';
const THAID_CLIENT_SECRET= process.env.THAID_CLIENT_SECRET|| '';
const THAID_REDIRECT_URI = process.env.THAID_REDIRECT_URI || '';
const THAID_TOKEN_URL    = process.env.THAID_TOKEN_URL    || 'https://imauth.bora.dopa.go.th/api/v2/oauth2/token/';
const THAID_PROFILE_URL  = process.env.THAID_PROFILE_URL  || 'https://imauth.bora.dopa.go.th/api/v2/oauth2/userinfo/';

app.post('/api/auth/thaiD', async (req, res, next) => {
    // If credentials not configured yet, return a clear error (not 502/HTML)
    if (!THAID_CLIENT_ID || !THAID_CLIENT_SECRET || !THAID_REDIRECT_URI) {
        return res.status(503).json({
            error: 503,
            message: 'thaiDNotConfigured',
            detail: 'Set THAID_CLIENT_ID / THAID_CLIENT_SECRET / THAID_REDIRECT_URI env vars to enable ThaID login'
        });
    }

    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 400, message: 'code required' });

    try {
        // Step 1 — exchange code → ThaID access token
        const tokenRes = await fetch(THAID_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type:    'authorization_code',
                client_id:     THAID_CLIENT_ID,
                client_secret: THAID_CLIENT_SECRET,
                code,
                redirect_uri:  THAID_REDIRECT_URI,
            }).toString(),
        });
        const tokenJson = await tokenRes.json();
        const accessToken = tokenJson?.access_token;
        if (!accessToken) {
            return res.status(401).json({ error: 401, message: tokenJson?.error || 'thaiDTokenFailed', detail: tokenJson });
        }

        // Step 2 — get user info / profile
        const profileRes = await fetch(THAID_PROFILE_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const profile = await profileRes.json();
        if (!profile?.pid && !profile?.sub) {
            return res.status(401).json({ error: 401, message: 'thaiDProfileFailed' });
        }

        // Step 3 — build session (use pid/sub as username; ThaID users are 'staff')
        const uid  = profile.pid || profile.sub;
        const name = [profile.title_th, profile.fname, profile.lname].filter(Boolean).join('') || uid;
        const user = {
            username: uid,
            display:  name,
            roles:    ['staff'],
            roleMaps: [{ roleName: 'staff' }],
            organization: null,
            thaiDProfile: { pid: profile.pid, name_th: name },
            authMode: 'thaiD',
        };
        const token = require('crypto').createHash('sha256')
            .update(new Date().toISOString() + uid + require('crypto').randomInt(1000))
            .digest('hex');
        await tokenStorage.set(token, user);

        return res.json({ token, user });
    } catch (err) {
        next(err);
    }
});

// Redirect helper: /auth/thaid/callback → handled by user-app-lite server.js
// (same pattern as /auth/providerid/callback)

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

// Rooms are persistent in SQL — no TTL expiry

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
    const limit  = Math.min(parseInt(req.query.limit) || 200, 1000);

    // Prefer an owner-filtered SQL query (scales to 100k+ rooms). Fall back to a
    // bounded scan only if the backend doesn't implement byOwner.
    if (typeof roomStore.byOwner === 'function') {
        return res.json(await roomStore.byOwner(userId, limit));
    }

    const rooms = [];
    const keys = await roomStore.keys();
    for (const k of keys) {
        const r = await roomStore.get(k);
        if (!r) continue;
        const mine = r.ownerId === userId ||
            (Array.isArray(r.joinedProviders) && r.joinedProviders.some(p => p.userId === userId));
        if (mine) rooms.push(r);
    }
    rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(rooms.slice(0, limit));
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

    await roomStore.set(id, room);
    console.log(`[rooms] created ${type} room ${id} for ${user.display}`);
    // Service unit (hcode) from the provider's ProviderID org, when present.
    const unitHcode = user.organization?.[0]?.hcode || user.hcode5 || null;
    const durationSec = Math.max(0, Math.round((new Date(room.endtime) - new Date(room.starttime)) / 1000)) || null;
    await logStore.insert('room_created', { roomId: id, roomType: type, roomName: name, doctorId: user.username, doctorName: user.display, platform: 'web', unitHcode, durationSec, meta: { startTime: room.starttime, endTime: room.endtime } });

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

    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'room not found' });
    if (!room.queue) room.queue = [];

    // Multiple patients may share ONE pre-generated token. Key each queue entry by
    // a per-patient id (from the queue page) so they stay distinct; fall back to
    // the token for older links that don't send a pid. The token is still fully
    // verified above — this only changes how we de-duplicate queue entries.
    const pid      = (req.query.pid || '').trim();
    const entryKey = pid || jwtToken;

    if (!room.queue.find(q => (q.key || q.token) === entryKey)) {
        const patientName = (req.query.name || '').trim() || payload.patientName || 'ผู้ป่วย';
        room.queue.push({ key: entryKey, token: jwtToken, patientName, joinedAt: new Date().toISOString(), status: 'waiting' });
        await roomStore.set(req.params.id, room);
        console.log(`[exam] patient "${patientName}" joined queue for room ${req.params.id}`);
        await logStore.insert('patient_joined_queue', { roomId: req.params.id, roomType: room.type, roomName: room.name, doctorId: room.ownerId, doctorName: room.ownerDisplay, patientName, patientCid: payload.cid || '' });
    }

    const myEntry  = room.queue.find(q => (q.key || q.token) === entryKey);
    const position = room.queue.filter(q => q.status === 'waiting').findIndex(q => (q.key || q.token) === entryKey) + 1;

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
        const prev = room.queue.find(q => (q.key || q.token) === room.currentPatientToken);
        if (prev) prev.status = 'done';
    }

    const next = room.queue.find(q => q.status === 'waiting');
    if (!next) {
        room.currentPatientToken = null;
        await roomStore.set(req.params.id, room);
        return res.json({ admitted: null, queueLength: 0 });
    }

    next.status = 'admitted';
    room.currentPatientToken = next.key || next.token;
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

    await roomStore.set(id, room);

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
    // hcode may come from the HIS payload (hcode/hospitalCode/account_hcode); null if not sent.
    const reservedHcode = (req.body.hcode || req.body.hospitalCode || req.body.account_hcode || '').toString().trim() || null;
    const reservedDuration = Math.max(0, Math.round((new Date(room.endtime) - new Date(room.starttime)) / 1000)) || null;
    // TOR 4.11.1 — notify LINE OA (non-blocking)
    const _reservedLink = `${APP_BASE_URL}/exam/${id}`;
    notifyLine(`📅 จองห้องตรวจ: ${name}\nแพทย์: ${doctorDisplay}\nลิงก์: ${_reservedLink}`).catch(() => {});
    await logStore.insert('reserved_room_created', { roomId: id, roomType: 'exam', roomName: name, doctorId, doctorName: doctorDisplay, platform: 'web', unitHcode: reservedHcode, durationSec: reservedDuration, meta: { startTime: room.starttime, endTime: room.endtime } });

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

// ── Dashboard API (TOR 4.12.x) ─────────────────────────────────────────────────
// Shared optional query params on all endpoints below:
//   from, to       — date range (YYYY-MM-DD)
//   hourFrom,hourTo — time-of-day window (0-23), "ช่วงเวลาในวัน"
function rangeParams(q) {
    const opts = {};
    if (q.from) opts.from = String(q.from);
    if (q.to)   opts.to   = String(q.to);
    if (q.hourFrom != null && q.hourFrom !== '' && q.hourTo != null && q.hourTo !== '') {
        opts.hourFrom = parseInt(q.hourFrom, 10);
        opts.hourTo   = parseInt(q.hourTo, 10);
    }
    return opts;
}

// 4.12.x.1 — usage per day (date range + time-of-day window)
app.get('/api/logs/by-day', async (req, res) => {
    res.json(await logStore.byDay(rangeParams(req.query)));
});

// 4.12.x.1 — usage by hour of day
app.get('/api/logs/by-hour', async (req, res) => {
    res.json(await logStore.byHour(rangeParams(req.query)));
});

// 4.12.x.2 — usage by health region (เขตสุขภาพ)
app.get('/api/logs/by-region', async (req, res) => {
    res.json(await logStore.byRegion(rangeParams(req.query)));
});

// 4.12.x.2 — usage by province (จังหวัด); optional ?region=N
app.get('/api/logs/by-province', async (req, res) => {
    const opts = rangeParams(req.query);
    if (req.query.region != null && req.query.region !== '') opts.region = parseInt(req.query.region, 10);
    res.json(await logStore.byProvince(opts));
});

// 4.12.x.3 — usage by platform (mobile vs web)
app.get('/api/logs/by-platform', async (req, res) => {
    res.json(await logStore.byPlatform(rangeParams(req.query)));
});

// 4.12.x.4 / 4.12.2.5 — service units called (top N via ?limit=)
app.get('/api/logs/by-unit', async (req, res) => {
    const opts = rangeParams(req.query);
    if (req.query.limit) opts.limit = parseInt(req.query.limit, 10);
    res.json(await logStore.byUnit(opts));
});

// 4.12.2.6 — top N rooms by conversation duration (?limit=, default 5)
app.get('/api/logs/longest-rooms', async (req, res) => {
    const opts = rangeParams(req.query);
    opts.limit = req.query.limit ? parseInt(req.query.limit, 10) : 5;
    res.json(await logStore.longestRooms(opts));
});





// ── Presence API (TOR 4.4) — online/offline indicator ────────────────────────
// Uses NodeCache (already imported) — last-seen per user, TTL 90s.
// online = ping received within PRESENCE_ONLINE_WINDOW_MS.
const _presenceCache = new NodeCache({ stdTTL: 90, checkperiod: 30 });
const PRESENCE_ONLINE_WINDOW_MS = 60 * 1000; // 60s

// POST /api/presence/ping — call every ~20s while logged in
app.post('/api/presence/ping', auth(), (req, res) => {
    const uid = res.locals.user?.username;
    if (!uid) return res.status(401).json({ error: 401, message: 'unauthorized' });
    _presenceCache.set(uid, Date.now());
    res.json({ ok: true });
});

// GET /api/presence?ids=a,b,c — check online status for a list of user IDs
app.get('/api/presence', auth(), (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0 || ids.length > 50) {
        return res.status(400).json({ error: 400, message: 'ids param required (comma-separated, max 50)' });
    }
    const now = Date.now();
    const result = {};
    for (const id of ids) {
        const lastSeen = _presenceCache.get(id);
        result[id] = (lastSeen && (now - lastSeen) < PRESENCE_ONLINE_WINDOW_MS) ? 'online' : 'offline';
    }
    res.json(result);
});

// ── Unit Search API (TOR 4.2 / 4.3 / 4.10.3) ────────────────────────────────
// GET /api/units/search?q=<text>&limit=20
// Searches hospital name / hcode using the hcode map (area.js).
// If hcode-to-area.js is not generated, returns empty list gracefully.

app.get('/api/units/search', auth(), (req, res) => {
    const q     = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    if (!q) return res.json([]);

    // Try to access HCODE_TO_AREA via the area module
    let map = {};
    try { ({ HCODE_TO_AREA: map } = require('./data/hcode-to-area')); } catch (_) {}

    const results = [];
    for (const [hcode, info] of Object.entries(map)) {
        const hospital = (info.hospital || '').toLowerCase();
        const province = (info.province || '').toLowerCase();
        if (hospital.includes(q) || hcode.includes(q) || province.includes(q)) {
            results.push({ hcode, hospital: info.hospital, province: info.province, region: info.region });
            if (results.length >= limit) break;
        }
    }
    res.json(results);
});

// ── HIS Export API (TOR 4.7 + 4.10.7) ───────────────────────────────────────
// POST /api/his/export { roomId } → aggregate vitals + room data → POST to HIS
// HIS_ENDPOINT env (default = demo-his at localhost:3501)
// Non-blocking: failure is logged but never breaks room flow.

const HIS_ENDPOINT = (process.env.HIS_ENDPOINT || 'http://localhost:3501').replace(/\/$/, '');

app.post('/api/his/export', auth(), async (req, res) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 400, message: 'roomId required' });

    const room = await roomStore.get(roomId);
    if (!room) return res.status(404).json({ error: 404, message: 'room not found' });

    const vitals = vitalStore.byRoom(roomId);
    if (!vitals || vitals.length === 0) {
        return res.status(400).json({ error: 400, message: 'no vitals recorded for this room' });
    }

    // Build export payload — field names follow สธ HL7-FHIR-lite schema
    // (adjust mapping per สธ spec when available; comment shows intent)
    const payload = {
        sessionId:    room.id,
        sessionName:  room.name,
        sessionType:  room.type,
        startTime:    room.starttime,
        endTime:      room.endtime,
        doctorId:     room.ownerId,
        doctorName:   room.ownerDisplay,
        vitals: vitals.map(v => ({
            metric:      v.metric,
            value:       v.value,
            unit:        v.unit,
            deviceType:  v.device_type,
            source:      v.source,
            recordedAt:  v.recorded_at,
        })),
        exportedAt: new Date().toISOString(),
    };

    let success = false;
    let hisStatus = null;
    try {
        const hisRes = await fetch(`${HIS_ENDPOINT}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        hisStatus = hisRes.status;
        success = hisRes.ok;
    } catch (e) {
        console.error('[HIS] export failed:', e.message);
    }

    // Log the result regardless
    await logStore.insert('his_exported', {
        roomId, roomType: room.type, roomName: room.name,
        doctorId: room.ownerId, doctorName: room.ownerDisplay,
        meta: { success, hisStatus, vitalCount: vitals.length },
    });

    if (success) {
        return res.json({ ok: true, vitalCount: vitals.length, hisStatus });
    }
    return res.status(502).json({ error: 502, message: 'HIS endpoint unreachable or returned error', hisStatus });
});

// ── Vital Signs API (TOR 4.10.5) ────────────────────────────────────────────
// Metrics: weight|height|temp|spo2|sys|dia|map|pr|rr|pulse|glucose|fhr|toco
// Source:  manual | ble

// POST /api/vitals — record a single vital sign reading
app.post('/api/vitals', auth(), (req, res) => {
    const { roomId, patientKey, deviceId, deviceType, metric, value, unit, source, organization, recordedAt } = req.body;
    if (!metric || value === undefined || value === null || value === '') {
        return res.status(400).json({ error: 400, message: 'metric and value are required' });
    }
    vitalStore.insert({ roomId, patientKey, deviceId, deviceType, metric, value, unit, source, organization, recordedAt });
    res.status(201).json({ ok: true });
});

// POST /api/vitals/batch — record multiple readings at once (BLE device dump)
app.post('/api/vitals/batch', auth(), (req, res) => {
    const records = req.body;
    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 400, message: 'body must be a non-empty array' });
    }
    if (records.length > 200) {
        return res.status(400).json({ error: 400, message: 'batch limit 200 records' });
    }
    for (const r of records) {
        if (!r.metric || r.value === undefined || r.value === null || r.value === '') {
            return res.status(400).json({ error: 400, message: 'each record needs metric + value' });
        }
    }
    vitalStore.insertBatch(records);
    res.status(201).json({ ok: true, count: records.length });
});

// GET /api/vitals?roomId= — list vitals for a room
app.get('/api/vitals', auth(), (req, res) => {
    const { roomId, patientKey } = req.query;
    if (!roomId && !patientKey) {
        return res.status(400).json({ error: 400, message: 'roomId or patientKey required' });
    }
    const rows = roomId ? vitalStore.byRoom(roomId) : vitalStore.byPatient(patientKey);
    res.json(rows);
});

// GET /api/rooms/:id/vitals/latest — latest value per metric for a room
app.get('/api/rooms/:id/vitals/latest', auth(), (req, res) => {
    res.json(vitalStore.latestByRoom(req.params.id));
});

// ── 404 handler – always JSON (never HTML, so clients can safely res.json()) ──
app.use((req, res) => {
    res.status(404).json({ error: 404, message: `Cannot ${req.method} ${req.originalUrl}` });
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
