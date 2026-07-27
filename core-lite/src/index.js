require('dotenv').config();
// Allow self-signed / incomplete-chain certs on outbound calls to moph.id.th & provider.id.th
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const { createHash, randomInt, randomUUID } = require('crypto');
const NodeCache = require('node-cache');
const jwt = require('jsonwebtoken');
const { tokenStorage, roomStore, profileStore, consentStore, providerStore, holidayStore, logStore, vitalStore } = require('./store');
const { auth } = require('./middlewares/auth');
const { createMophAlertClient } = require('./moph-alert');

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_jwt_secret';
const TELEMED_CONSENT_VERSION = process.env.TELEMED_CONSENT_VERSION || 'telemed-consent-v1';

// Short-lived cache for ProviderID code exchange (handles slow-network retries)
const codeCache = new NodeCache({ stdTTL: 10, checkperiod: 5 });

const PORT = process.env.APP_PORT || 3500;

const PROVIDER_ID_CLIENT_ID = process.env.PROVIDER_ID_CLIENT_ID;
const PROVIDER_ID_CLIENT_SECRET = process.env.PROVIDER_ID_CLIENT_SECRET;
const PROVIDER_ID_REDIRECT_URI = process.env.PROVIDER_ID_REDIRECT_URI;
const PROVIDER_SERVICE_CLIENT_ID = process.env.PROVIDER_SERVICE_CLIENT_ID;
const PROVIDER_SERVICE_SECRET_KEY = process.env.PROVIDER_SERVICE_SECRET_KEY;
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, ''); // e.g. https://moph-meet.moph.go.th
const HOLIDAY_API_BASE = (process.env.HOLIDAY_API_BASE || 'https://thailandformats.com/api/v1/holidays').replace(/\/$/, '');
const HOLIDAY_SOURCE = 'thailandformats.com/api/v1/holidays';

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
        hcode5: String(account.hcode5 || account.hcode || '').trim(),
        isReviewAccount: Boolean(account.isReviewAccount),
        authMode: 'manual',
    };
}

function hcodeOf(user) {
    return String(user?.organization?.[0]?.hcode || user?.hcode5 || '').trim();
}

function isAdmin(user) {
    return Array.isArray(user?.roles) && user.roles.includes('admin');
}

async function syncProvider(user) {
    if (!user?.username || !providerStore?.upsertSeen) return undefined;
    return providerStore.upsertSeen({
        providerId: user.username,
        displayName: user.display || user.username,
        role: isAdmin(user) ? 'admin' : 'staff',
        hcode: hcodeOf(user),
    });
}

function isValidThaiCid(cid) {
    if (!/^\d{13}$/.test(cid)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += Number(cid[i]) * (13 - i);
    return (11 - (sum % 11)) % 10 === Number(cid[12]);
}

function cidHash(cid) {
    return createHash('sha256').update(`${JWT_SECRET}:${cid}`).digest('hex');
}

function makeInvitationId() {
    return randomUUID().replace(/-/g, '');
}

function validHolidayYear(value) {
    const year = Number(value || new Date().getFullYear());
    return Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : null;
}

function expandHoliday({ title, start_date: startDate, end_date: endDate, type, slug }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || startDate || '')) return [];
    const from = new Date(`${startDate}T00:00:00.000Z`);
    const until = new Date(`${endDate || startDate}T00:00:00.000Z`);
    if (until < from || until - from > 31 * 86400000) return [];
    const days = [];
    for (let date = from; date <= until; date = new Date(date.getTime() + 86400000)) {
        days.push({ date: date.toISOString().slice(0, 10), name: String(title || 'วันหยุดราชการ').slice(0, 200), type: String(type || 'holiday'), slug: String(slug || '').slice(0, 100) });
    }
    return days;
}

async function syncHolidayCalendar(year) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(`${HOLIDAY_API_BASE}/${year}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`holidaySourceStatus:${response.status}`);
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.holidays)) throw new Error('holidaySourceInvalidPayload');
        const holidays = payload.holidays.flatMap(expandHoliday);
        if (holidays.length === 0) throw new Error('holidaySourceEmpty');
        return holidayStore.setYear(year, holidays, HOLIDAY_SOURCE);
    } finally {
        clearTimeout(timeout);
    }
}

function canManageRoom(room, user) {
    if (!room || !user?.username) return false;
    if (isAdmin(user) || room.ownerId === user.username) return true;
    return (room.invitedProviders || []).some(inv => inv.providerId === user.username && inv.status === 'accepted');
}

function canOpenRoom(room, user) {
    if (!room || !user?.username) return false;
    if (isAdmin(user) || room.ownerId === user.username) return true;
    return (room.invitedProviders || []).some(inv => inv.providerId === user.username && inv.status !== 'revoked') ||
        (room.joinedProviders || []).some(provider => provider.userId === user.username);
}


// ── LINE OA Notification helper (TOR 4.11.1) ─────────────────────────────────
// Non-blocking: failure is logged, never delays room creation.
// Set LINE_CHANNEL_TOKEN + LINE_TARGET (userId or groupId) in env to enable.

const LINE_CHANNEL_TOKEN = process.env.LINE_CHANNEL_TOKEN || '';
const LINE_TARGET        = process.env.LINE_TARGET        || '';
const mophAlert = createMophAlertClient();

function validHcode(value) {
    return /^\d{5}$/.test(String(value || '').trim()) ? String(value).trim() : null;
}

function uniqueValidCids(values) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map(value => String(value || '').trim())
        .filter(isValidThaiCid))];
}

function appUrl(path) {
    return APP_BASE_URL ? `${APP_BASE_URL}${path}` : path;
}

async function notifyMophAlert(hcode, cids, text, event) {
    try {
        const normalizedHcode = validHcode(hcode);
        if (!normalizedHcode) return { skipped: true, reason: 'roomHcodeMissing' };
        const result = await mophAlert.sendText({ hospitalCode: normalizedHcode, cids: uniqueValidCids(cids), text });
        if (result.sent) console.log(`[notify] MOPH Alert sent (${event})`);
        else if (result.reason === 'notConfigured') mophAlert.logConfigurationHint();
        else if (result.reason === 'noRecipients') console.log(`[notify] MOPH Alert skipped (${event}): no recipients`);
        return result;
    } catch (error) {
        console.warn(`[notify] MOPH Alert failed (${event}):`, error.message);
        return { skipped: true, reason: 'sendFailed' };
    }
}

function meetingMophAlertText(room) {
    return `📅 สร้างห้องประชุม: ${room.name}\nวันเวลา: ${room.starttime} – ${room.endtime}\nลิงก์: ${appUrl(`/room/${room.id}`)}`;
}

function patientMophAlertText(room, patientJoinUrl) {
    return `📅 คุณมีนัดหมายห้องตรวจ: ${room.name}\nวันเวลา: ${room.starttime} – ${room.endtime}\nเข้าห้องรอคิว: ${appUrl(patientJoinUrl)}`;
}

async function notifyLine(message) {
    if (!LINE_CHANNEL_TOKEN || !LINE_TARGET) {
        console.log('[notify] LINE not configured — skip. Set LINE_CHANNEL_TOKEN + LINE_TARGET to enable.');
        return;
    }
    try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
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
        if (!response.ok) throw new Error(`LINE response ${response.status}`);
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
    await syncProvider(user);
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

        await syncProvider(user);

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
        await syncProvider(user);
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

// ── Telemedicine consent ─────────────────────────────────────────────────────
// Consent text is rendered by the web/mobile clients. This endpoint stores the
// user's affirmative or declined decision with a versioned audit record.
app.get('/api/telemed-consent', auth(), async (req, res) => {
    const consent = await consentStore.get(res.locals.user.username);
    const accepted = consent.decision === 'accepted' && consent.version === TELEMED_CONSENT_VERSION;
    res.json({ version: TELEMED_CONSENT_VERSION, accepted, decision: consent.decision || null, recordedAt: consent.recordedAt || null });
});

app.post('/api/telemed-consent', auth(), async (req, res) => {
    const decision = String(req.body?.decision || '');
    if (!['accepted', 'declined'].includes(decision)) return res.status(400).json({ error: 400, message: 'invalidConsentDecision' });
    if (decision === 'accepted' && req.body?.confirmed !== true) {
        return res.status(400).json({ error: 400, message: 'consentConfirmationRequired' });
    }
    const consent = await consentStore.record(res.locals.user.username, { version: TELEMED_CONSENT_VERSION, decision });
    res.json({ ok: true, ...consent });
});

// ── Auth: update extra profile fields ─────────────────────────────────────────
app.patch('/api/auth/profile', auth(), async (req, res) => {
    const token = res.locals.token;
    const user = res.locals.user;
    if (!user?.username) return res.status(401).json({ error: 401, message: 'unauthorized' });
    const { hcode5, hcode9, clinicCode, dateOfBirth, gender } = req.body;
    await profileStore.upsert(user.username, { hcode5, hcode9, clinicCode, dateOfBirth, gender });
    // Update in-memory session too
    const updated = { ...user, hcode5: (hcode5 || '').trim(), hcode9: (hcode9 || '').trim(), clinicCode: (clinicCode || '').trim(), dateOfBirth: (dateOfBirth || '').trim(), gender: (gender || '').trim() };
    await tokenStorage.set(token, updated);
    await syncProvider(updated);
    res.json({ ok: true, user: updated });
});

// ── Personnel directory (local MOPH Meet data) ───────────────────────────────
// Personnel are created/updated when they sign in. A regular user searches only
// their H-Code; a system admin may search the aggregate or pass ?hcode=xxxxx.
// A regular user without an H-Code gets an empty result rather than an API error
// because no safe hospital scope can be inferred yet.
app.get('/api/providers', auth(), async (req, res) => {
    const caller = res.locals.user;
    const hcode = isAdmin(caller)
        ? String(req.query.hcode || '').trim()
        : hcodeOf(caller);
    if (!isAdmin(caller) && !hcode) return res.json([]);
    const role = ['doctor', 'nurse', 'staff', 'admin'].includes(req.query.role) ? req.query.role : '';
    const query = String(req.query.q || '');
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    res.json(await providerStore.search({ hcode, role, query, limit }));
});

// Only a local administrator can classify personnel as doctor/nurse or correct
// their H-Code. ProviderID is used for sign-in only, not for this local role.
app.patch('/api/providers/:providerId', auth(), async (req, res) => {
    if (!isAdmin(res.locals.user)) return res.status(403).json({ error: 403, message: 'adminRequired' });
    const role = String(req.body?.role || '');
    const hcode = String(req.body?.hcode || '').trim();
    const active = req.body?.active !== false;
    if (!['doctor', 'nurse', 'staff', 'admin'].includes(role) || !hcode) {
        return res.status(400).json({ error: 400, message: 'role and hcode are required' });
    }
    const provider = await providerStore.update(req.params.providerId, { role, hcode, active });
    if (!provider) return res.status(404).json({ error: 404, message: 'providerNotFound' });
    res.json({ provider });
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

// Creates a revocable, PII-safe patient invitation. The CID is validated by
// callers and persisted only as a hash; the signed queue link carries neither
// the CID nor the patient's name.
function addPatientInvitation(room, { patientName, cid, createdBy }) {
    const invitationId = makeInvitationId();
    const exp = Math.floor(new Date(room.endtime).getTime() / 1000) + 86400;
    const queueToken = jwt.sign({ roomId: room.id, role: 'patient', invitationId, exp }, JWT_SECRET);
    const createdAt = new Date().toISOString();
    room.patientInvitations = room.patientInvitations || [];
    room.patientInvitations.push({
        id: invitationId,
        patientName: patientName || 'ผู้ป่วย',
        cidHash: cidHash(cid),
        status: 'active',
        createdAt,
        createdBy,
        expiresAt: new Date(exp * 1000).toISOString(),
    });
    return { patientJoinUrl: `/queue/${room.id}?jwt=${queueToken}`, invitationId, expiresAt: new Date(exp * 1000).toISOString() };
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
            (Array.isArray(r.joinedProviders) && r.joinedProviders.some(p => p.userId === userId)) ||
            (Array.isArray(r.invitedProviders) && r.invitedProviders.some(p => p.providerId === userId && p.status !== 'revoked'));
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
    const accessMode = req.body.accessMode || 'restricted';
    if (!['public', 'restricted'].includes(accessMode)) {
        return res.status(400).json({ error: 400, message: 'accessMode must be public or restricted' });
    }
    // Platform hint from client (allow-list); default 'web' for backward compatibility.
    const platform = ['web', 'mobile'].includes(req.body.platform) ? req.body.platform : 'web';

    const user = res.locals.user;
    const id   = makeRoomId();
    const requestedName = String(req.body.name || '').trim();
    if (requestedName.length > 160) return res.status(400).json({ error: 400, message: 'room name is too long' });
    const name = requestedName || autoRoomName(type, user.display);
    const ownerHcode = hcodeOf(user);
    const requestedPatientName = String(req.body.patientName || req.body.displayName || '').trim();
    const requestedPatientCid = String(req.body.patientCid || req.body.cid || '').trim();
    const hasPatientInvitation = Boolean(requestedPatientName || requestedPatientCid);
    if (type !== 'exam' && hasPatientInvitation) {
        return res.status(400).json({ error: 400, message: 'patient invitation requires an exam room' });
    }
    if (hasPatientInvitation && !isValidThaiCid(requestedPatientCid)) {
        return res.status(400).json({ error: 400, message: 'valid 13-digit cid required' });
    }
    const invitedProviders = [];
    const requestedProviderIds = Array.isArray(req.body.providerIds) ? [...new Set(req.body.providerIds.map(String).map(v => v.trim()).filter(Boolean))] : [];
    for (const providerId of requestedProviderIds) {
        if (providerId === user.username) continue;
        const provider = await providerStore.get(providerId);
        if (!provider || !provider.active) {
            return res.status(400).json({ error: 400, message: `providerNotFound:${providerId}` });
        }
        invitedProviders.push({
            providerId,
            display: provider.displayName,
            hcode: provider.hcode,
            role: provider.role,
            status: 'pending',
            invitedAt: new Date().toISOString(),
            invitedBy: user.username,
        });
    }

    const room = {
        id,
        type,
        name,
        starttime: starttime || new Date().toISOString(),
        endtime:   endtime   || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        ownerId:      user.username,
        ownerDisplay: user.display,
        ownerHcode,
        accessMode,
        createdAt:    new Date().toISOString(),
        invitedProviders,
        joinedProviders: [],
        queue:               [],
        patientInvitations:  [],
        meetingInvitations:  [],
        currentPatientToken: null,
        calledPatientToken:  null,
        recording:           type === 'exam',
    };

    // Nurse/staff can create the room and invite the patient in the same
    // request, alongside the provider invitations above.
    const patientInvitation = hasPatientInvitation
        ? addPatientInvitation(room, { patientName: requestedPatientName, cid: requestedPatientCid, createdBy: user.username })
        : null;

    await roomStore.set(id, room);
    console.log(`[rooms] created ${type} room ${id} for ${user.display}`);
    if (type === 'meet') {
        const link = `${APP_BASE_URL}/room/${id}`;
        notifyLine(`📅 สร้างห้องประชุม: ${name}\nวันเวลา: ${room.starttime} – ${room.endtime}\nประเภท: ${accessMode === 'public' ? 'Public (เชิญผ่านลิงก์)' : 'Restricted (Provider ID)'}\nลิงก์: ${link}`).catch(() => {});
        notifyMophAlert(ownerHcode, [], meetingMophAlertText(room), 'meetingCreated').catch(() => {});
    }
    if (patientInvitation) {
        notifyMophAlert(ownerHcode, [requestedPatientCid], patientMophAlertText(room, patientInvitation.patientJoinUrl), 'patientInvitation').catch(() => {});
    }
    // Service unit (hcode) from the provider's ProviderID org, when present.
    const unitHcode = ownerHcode || null;
    const durationSec = Math.max(0, Math.round((new Date(room.endtime) - new Date(room.starttime)) / 1000)) || null;
    await logStore.insert('room_created', { roomId: id, roomType: type, roomName: name, doctorId: user.username, doctorName: user.display, platform, unitHcode, durationSec, meta: { startTime: room.starttime, endTime: room.endtime } });
    if (patientInvitation) {
        await logStore.insert('invite_generated', { roomId: id, roomType: type, roomName: name, doctorId: user.username, doctorName: user.display, patientName: requestedPatientName || 'ผู้ป่วย', unitHcode });
    }

    // Exam invitations must be created with a verified 13-digit CID.  A generic
    // patient link is intentionally no longer emitted at room creation.
    const patientJoinUrl = patientInvitation?.patientJoinUrl || null;
    // Meet rooms: the provider URL remains authenticated. Public/restricted
    // guest invitations are created explicitly and are never guessable room IDs.
    const meetJoinUrl = type === 'meet' ? `/room/${id}` : null;

    res.json({ room, patientJoinUrl, patientInvitationId: patientInvitation?.invitationId || null, meetJoinUrl });
});

// ── PATCH /api/rooms/:id – edit room details ─────────────────────────────────
app.patch('/api/rooms/:id', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });

    if (req.body.name !== undefined) {
        const name = String(req.body.name || '').trim();
        if (!name || name.length > 160) return res.status(400).json({ error: 400, message: 'invalid room name' });
        room.name = name;
    }
    if (req.body.starttime !== undefined) {
        const date = new Date(req.body.starttime);
        if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 400, message: 'invalid starttime' });
        room.starttime = date.toISOString();
    }
    if (req.body.endtime !== undefined) {
        const date = new Date(req.body.endtime);
        if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 400, message: 'invalid endtime' });
        room.endtime = date.toISOString();
    }
    if (new Date(room.endtime) <= new Date(room.starttime)) return res.status(400).json({ error: 400, message: 'endtime must be after starttime' });
    if (req.body.accessMode !== undefined) {
        if (!['public', 'restricted'].includes(req.body.accessMode)) return res.status(400).json({ error: 400, message: 'invalid accessMode' });
        room.accessMode = req.body.accessMode;
    }
    room.updatedAt = new Date().toISOString();
    await roomStore.set(room.id, room);
    res.json({ room });
});

// ── GET /api/rooms/:id ────────────────────────────────────────────────────────
app.get('/api/rooms/:id', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });

    const userId = res.locals.user?.username;
    if (!canOpenRoom(room, res.locals.user)) {
        return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
    }
    if (userId && room.ownerId !== userId) {
        const invitation = (room.invitedProviders || []).find(item => item.providerId === userId && item.status !== 'revoked');
        if (invitation && invitation.status === 'pending') invitation.status = 'accepted';
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

// ── Provider invitations ─────────────────────────────────────────────────────
// Cross-H-Code access is possible only through this explicit invitation record.
app.post('/api/rooms/:id/providers', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });

    const providerId = String(req.body?.providerId || '').trim();
    if (!providerId) return res.status(400).json({ error: 400, message: 'providerId required' });
    if (providerId === room.ownerId) return res.status(400).json({ error: 400, message: 'ownerAlreadyHasAccess' });
    const provider = await providerStore.get(providerId);
    if (!provider || !provider.active) return res.status(404).json({ error: 404, message: 'providerNotFound' });

    room.invitedProviders = room.invitedProviders || [];
    const existing = room.invitedProviders.find(item => item.providerId === providerId);
    if (existing) {
        existing.status = 'pending';
        existing.invitedAt = new Date().toISOString();
        existing.invitedBy = res.locals.user.username;
    } else {
        room.invitedProviders.push({
            providerId,
            display: provider.displayName,
            hcode: provider.hcode,
            role: provider.role,
            status: 'pending',
            invitedAt: new Date().toISOString(),
            invitedBy: res.locals.user.username,
        });
    }
    await roomStore.set(room.id, room);
    res.status(201).json({ invitation: room.invitedProviders.find(item => item.providerId === providerId) });
});

app.delete('/api/rooms/:id/providers/:providerId', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
    const invitation = (room.invitedProviders || []).find(item => item.providerId === req.params.providerId);
    if (!invitation) return res.status(404).json({ error: 404, message: 'invitationNotFound' });
    invitation.status = 'revoked';
    invitation.revokedAt = new Date().toISOString();
    room.joinedProviders = (room.joinedProviders || []).filter(item => item.userId !== req.params.providerId);
    await roomStore.set(room.id, room);
    res.json({ ok: true });
});

// ── Meeting invitation + waiting room ────────────────────────────────────────
// A "public" meeting still requires this opaque, signed invitation link. A
// restricted meeting does not create guest links: its participants must use a
// ProviderID session and an explicit provider invitation above.
app.post('/api/rooms/:id/meeting-invitations', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (room.type !== 'meet') return res.status(400).json({ error: 400, message: 'meeting invitation requires a meeting room' });
    if (room.accessMode !== 'public') return res.status(400).json({ error: 400, message: 'guest links are only allowed for public rooms' });
    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });

    const invitationId = makeInvitationId();
    const exp = Math.floor(new Date(room.endtime).getTime() / 1000) + 86400;
    const guestName = String(req.body?.displayName || 'ผู้เข้าร่วม').trim().slice(0, 160) || 'ผู้เข้าร่วม';
    const token = jwt.sign({ roomId: room.id, role: 'meeting_guest', invitationId, exp }, JWT_SECRET);
    room.meetingInvitations = room.meetingInvitations || [];
    room.meetingInvitations.push({
        id: invitationId,
        displayName: guestName,
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: res.locals.user.username,
        expiresAt: new Date(exp * 1000).toISOString(),
    });
    await roomStore.set(room.id, room);
    res.status(201).json({
        invitationId,
        waitingRoomUrl: `${APP_BASE_URL}/waiting/${room.id}?jwt=${token}`,
        expiresAt: new Date(exp * 1000).toISOString(),
    });
});

// Guest uses the signed link to register and poll. This endpoint deliberately
// returns only their own status and never exposes the participant list.
app.get('/api/rooms/:id/waiting-room', async (req, res) => {
    const token = String(req.query.jwt || '');
    if (!token) return res.status(401).json({ error: 401, message: 'jwt required' });
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch (_) { return res.status(401).json({ error: 401, message: 'invalid jwt' }); }
    if (payload.roomId !== req.params.id || payload.role !== 'meeting_guest') {
        return res.status(403).json({ error: 403, message: 'invitationMismatch' });
    }
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'room not found' });
    const invitation = (room.meetingInvitations || []).find(item => item.id === payload.invitationId);
    if (!invitation || invitation.status === 'revoked') return res.status(403).json({ error: 403, message: 'invitationInactive' });
    if (invitation.status === 'active') {
        invitation.status = 'waiting';
        invitation.waitingAt = new Date().toISOString();
        await roomStore.set(room.id, room);
    }
    res.json({ roomName: room.name, status: invitation.status, displayName: invitation.displayName });
});

app.get('/api/rooms/:id/waiting-room/participants', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
    const participants = (room.meetingInvitations || []).map(({ id, displayName, status, createdAt, waitingAt, approvedAt, rejectedAt }) => ({
        id, displayName, status, createdAt, waitingAt, approvedAt, rejectedAt,
    }));
    res.json(participants);
});

app.patch('/api/rooms/:id/waiting-room/:invitationId', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
    const status = String(req.body?.status || '');
    if (!['approved', 'rejected', 'revoked'].includes(status)) return res.status(400).json({ error: 400, message: 'invalid waiting-room status' });
    const invitation = (room.meetingInvitations || []).find(item => item.id === req.params.invitationId);
    if (!invitation) return res.status(404).json({ error: 404, message: 'invitationNotFound' });
    invitation.status = status;
    invitation[`${status}At`] = new Date().toISOString();
    invitation.decidedBy = res.locals.user.username;
    await roomStore.set(room.id, room);
    res.json({ id: invitation.id, status: invitation.status });
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

    const invitationId = payload.invitationId;
    const invitation = invitationId && (room.patientInvitations || []).find(item => item.id === invitationId);
    // New invitations are revocable and do not expose a CID in the JWT/query.
    // Retain legacy JWT support so existing appointment links are not broken.
    if (invitationId && (!invitation || !['active', 'joined'].includes(invitation.status))) {
        return res.status(403).json({ error: 403, message: 'invitationInactive' });
    }

    // Multiple patients may share ONE pre-generated token. Key each queue entry by
    // a per-patient id (from the queue page) so they stay distinct; fall back to
    // the token for older links that don't send a pid. The token is still fully
    // verified above — this only changes how we de-duplicate queue entries.
    const pid      = (req.query.pid || '').trim();
    const entryKey = invitationId || pid || jwtToken;

    if (!room.queue.find(q => (q.key || q.token) === entryKey)) {
        const patientName = invitation?.patientName || (req.query.name || '').trim() || payload.patientName || 'ผู้ป่วย';
        room.queue.push({
            key: entryKey,
            invitationId: invitationId || null,
            token: jwtToken,
            patientName,
            cidHash: invitation?.cidHash || null,
            joinedAt: new Date().toISOString(),
            status: 'waiting',
        });
        if (invitation?.status === 'active') {
            invitation.status = 'joined';
            invitation.joinedAt = new Date().toISOString();
        }
        await roomStore.set(req.params.id, room);
        console.log(`[exam] patient "${patientName}" joined queue for room ${req.params.id}`);
        await logStore.insert('patient_joined_queue', { roomId: req.params.id, roomType: room.type, roomName: room.name, doctorId: room.ownerId, doctorName: room.ownerDisplay, patientName, unitHcode: room.ownerHcode || null });
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

// ── POST /api/exam/:id/call/:entryId – doctor calls a ready patient ──────────
// This is an internal queue-state API, not an external Calling API. The patient
// stays on the queue page until they explicitly press "enter examination room".
app.post('/api/exam/:id/call/:entryId', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
    if (room.currentPatientToken) return res.status(409).json({ error: 409, message: 'examinationInProgress' });

    const entry = (room.queue || []).find(item =>
        (item.key || item.token) === req.params.entryId || item.invitationId === req.params.entryId
    );
    if (!entry) return res.status(404).json({ error: 404, message: 'queueEntryNotFound' });
    const entryToken = entry.key || entry.token;
    if (entry.status !== 'waiting' && !(entry.status === 'called' && room.calledPatientToken === entryToken)) {
        return res.status(409).json({ error: 409, message: 'patientNotReady' });
    }

    // Only one patient can be waiting to enter at a time. Calling another ready
    // patient returns the previously called patient to the ordinary waiting queue.
    const previouslyCalled = (room.queue || []).find(item => (item.key || item.token) === room.calledPatientToken);
    if (previouslyCalled && previouslyCalled !== entry && previouslyCalled.status === 'called') {
        previouslyCalled.status = 'waiting';
        previouslyCalled.callCancelledAt = new Date().toISOString();
    }
    entry.status = 'called';
    entry.calledAt = new Date().toISOString();
    entry.calledBy = res.locals.user.username;
    room.calledPatientToken = entryToken;
    await roomStore.set(room.id, room);
    await logStore.insert('patient_called', { roomId: room.id, roomType: room.type, roomName: room.name, doctorId: res.locals.user.username, doctorName: res.locals.user.display, patientName: entry.patientName, unitHcode: room.ownerHcode || null });
    res.json({ called: entry.patientName, queueLength: (room.queue || []).filter(item => item.status === 'waiting').length });
});

// ── POST /api/exam/:id/queue/enter – patient accepts the doctor's call ────────
// Auth is the patient invitation JWT, supplied in the request body. A patient
// cannot enter until the doctor has selected their waiting queue entry.
app.post('/api/exam/:id/queue/enter', async (req, res) => {
    const jwtToken = String(req.body?.jwt || '');
    if (!jwtToken) return res.status(401).json({ error: 401, message: 'jwt required' });

    let payload;
    try { payload = jwt.verify(jwtToken, JWT_SECRET); }
    catch (e) { return res.status(401).json({ error: 401, message: 'invalid jwt' }); }
    if (payload.roomId !== req.params.id || payload.role !== 'patient') {
        return res.status(403).json({ error: 403, message: 'queueAccessDenied' });
    }

    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'room not found' });
    const invitationId = payload.invitationId;
    const entryKey = invitationId || String(req.body?.pid || '').trim() || jwtToken;
    const entry = (room.queue || []).find(item => (item.key || item.token) === entryKey);
    if (!entry) return res.status(404).json({ error: 404, message: 'queueEntryNotFound' });
    if (entry.status !== 'called' || room.calledPatientToken !== (entry.key || entry.token)) {
        return res.status(409).json({ error: 409, message: 'patientNotCalled' });
    }
    if (room.currentPatientToken) return res.status(409).json({ error: 409, message: 'examinationInProgress' });

    entry.status = 'admitted';
    entry.admittedAt = new Date().toISOString();
    room.currentPatientToken = entry.key || entry.token;
    room.calledPatientToken = null;
    await roomStore.set(room.id, room);
    await logStore.insert('patient_admitted', { roomId: room.id, roomType: room.type, roomName: room.name, doctorId: room.ownerId, doctorName: room.ownerDisplay, patientName: entry.patientName, unitHcode: room.ownerHcode || null });
    res.json({ admitted: true, patientName: entry.patientName });
});

// ── POST /api/exam/:id/next – doctor calls the first ready patient ───────────
app.post('/api/exam/:id/next', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });

    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });

    if (room.currentPatientToken) {
        const prev = room.queue.find(q => (q.key || q.token) === room.currentPatientToken);
        if (prev) {
            prev.status = 'done';
            prev.completedAt = new Date().toISOString();
        }
    }

    const previouslyCalled = room.queue.find(q => (q.key || q.token) === room.calledPatientToken);
    if (previouslyCalled?.status === 'called') previouslyCalled.status = 'waiting';
    const next = room.queue.find(q => q.status === 'waiting');
    if (!next) {
        room.currentPatientToken = null;
        room.calledPatientToken = null;
        await roomStore.set(req.params.id, room);
        return res.json({ called: null, queueLength: 0 });
    }

    next.status = 'called';
    next.calledAt = new Date().toISOString();
    next.calledBy = res.locals.user.username;
    room.currentPatientToken = null;
    room.calledPatientToken = next.key || next.token;
    await roomStore.set(req.params.id, room);

    console.log(`[exam] called patient "${next.patientName}" for room ${req.params.id}`);
    await logStore.insert('patient_called', { roomId: req.params.id, roomType: room.type, roomName: room.name, doctorId: res.locals.user?.username, doctorName: res.locals.user?.display, patientName: next.patientName, unitHcode: room.ownerHcode || null });
    res.json({ called: next.patientName, queueLength: room.queue.filter(q => q.status === 'waiting').length });
});

// ── GET /api/exam/:id/doctor – room info for doctor ───────────────────────────
app.get('/api/exam/:id/doctor', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (!canOpenRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
    res.json(room);
});

// ── POST /api/exam/:id/invite – doctor generates a patient invite ─────────────
// Body: { patientName?, cid?, displayName? }
// Returns: queue link (for queue.ejs flow) + direct Jitsi JWT link (compat)
app.post('/api/exam/:id/invite', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (room.type !== 'exam') return res.status(400).json({ error: 400, message: 'patient invitations require an exam room' });
    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });

    const patientName = (req.body.displayName || req.body.patientName || '').trim() || 'ผู้ป่วย';
    const cid         = (req.body.cid || '').trim();
    if (!isValidThaiCid(cid)) return res.status(400).json({ error: 400, message: 'valid 13-digit cid required' });
    const invitation = addPatientInvitation(room, { patientName, cid, createdBy: res.locals.user.username });
    await roomStore.set(room.id, room);

    notifyMophAlert(room.ownerHcode, [cid], patientMophAlertText(room, invitation.patientJoinUrl), 'patientInvitation').catch(() => {});

    console.log(`[exam] invite generated for "${patientName}" in room ${req.params.id}`);
    await logStore.insert('invite_generated', { roomId: req.params.id, roomType: room.type, roomName: room.name, doctorId: res.locals.user?.username, doctorName: res.locals.user?.display, patientName, unitHcode: room.ownerHcode || null });
    res.status(201).json({ patientJoinUrl: invitation.patientJoinUrl, patientName, invitationId: invitation.invitationId, expiresAt: invitation.expiresAt });
});

// ── PATCH queue status – cancellation / no-show ──────────────────────────────
app.patch('/api/exam/:id/queue/:entryId', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'notFound' });
    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
    const status = String(req.body?.status || '');
    if (!['cancelled', 'no_show'].includes(status)) return res.status(400).json({ error: 400, message: 'status must be cancelled or no_show' });
    const entry = (room.queue || []).find(item => (item.key || item.token) === req.params.entryId || item.invitationId === req.params.entryId);
    const invitation = (room.patientInvitations || []).find(item => item.id === req.params.entryId || item.id === entry?.invitationId);
    if (!entry && !invitation) return res.status(404).json({ error: 404, message: 'queueEntryNotFound' });
    const changedAt = new Date().toISOString();
    if (entry) { entry.status = status; entry.statusChangedAt = changedAt; entry.statusChangedBy = res.locals.user.username; }
    if (invitation) { invitation.status = status; invitation.statusChangedAt = changedAt; }
    if (room.currentPatientToken === (entry?.key || entry?.token)) room.currentPatientToken = null;
    if (room.calledPatientToken === (entry?.key || entry?.token)) room.calledPatientToken = null;
    await roomStore.set(room.id, room);
    await logStore.insert(`patient_${status}`, { roomId: room.id, roomType: room.type, roomName: room.name, doctorId: res.locals.user.username, doctorName: res.locals.user.display, patientName: entry?.patientName || invitation?.patientName, unitHcode: room.ownerHcode || null });
    res.json({ ok: true, status });
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
    if (!canOpenRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });

    const invitation = (room.invitedProviders || []).find(item => item.providerId === userId && item.status !== 'revoked');
    if (invitation && invitation.status === 'pending') invitation.status = 'accepted';
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
// Returns: { sessionID, meet: <full doctor URL>, patientJoinUrl: null }
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
        ownerHcode:   (req.body.hcode || req.body.hospitalCode || req.body.account_hcode || '').toString().trim(),
        accessMode:   'restricted',
        createdAt:    new Date().toISOString(),
        invitedProviders: [],
        joinedProviders: [],
        queue:               [],
        patientInvitations:  [],
        meetingInvitations:  [],
        currentPatientToken: null,
        calledPatientToken:  null,
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

    // A patient invitation is issued only after a valid CID is supplied through
    // /api/meet/reserved/token. Never create a reusable generic patient link.
    res.json({ sessionID: id, meet: doctorUrl, patientJoinUrl: null, doctorToken });
});

// ── POST /api/meet/reserved/token – generate patient queue link (same as doctor invite)
// Body: { sessionID, displayName?, patientName?, cid? }
// Returns: { sessionID, meet: patientJoinUrl, patientJoinUrl }
// Auth: open – called from 3rd-party appointment systems (no session required)
// CID is required and stored only as a hash. The JWT contains no patient PII.
app.post('/api/meet/reserved/token', async (req, res) => {
    const { sessionID, displayName, patientName, cid } = req.body;
    if (!sessionID) return res.status(400).json({ error: 400, message: 'sessionID required' });

    const room = await roomStore.get(sessionID);
    if (!room) return res.status(400).json({ error: 400, message: 'invalidSessionID' });

    const name       = (displayName || patientName || '').trim() || 'ผู้ป่วย';
    const patientCid = (cid || '').trim();
    if (!isValidThaiCid(patientCid)) return res.status(400).json({ error: 400, message: 'valid 13-digit cid required' });

    const reservedExp = Math.floor(new Date(room.endtime).getTime() / 1000) + 86400;
    const invitationId = makeInvitationId();
    const queue_token = jwt.sign(
        { roomId: sessionID, role: 'patient', invitationId, exp: reservedExp },
        JWT_SECRET
    );
    const patientJoinUrl = `${APP_BASE_URL}/queue/${sessionID}?jwt=${queue_token}`;

    room.patientInvitations = room.patientInvitations || [];
    room.patientInvitations.push({
        id: invitationId,
        patientName: name,
        cidHash: cidHash(patientCid),
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: 'appointment-system',
        expiresAt: new Date(reservedExp * 1000).toISOString(),
    });
    await roomStore.set(room.id, room);
    // This compatibility endpoint is currently unauthenticated for third-party
    // appointment onboarding. Do not let it trigger an MOPH Alert send: that
    // would allow an untrusted caller to message arbitrary CIDs. Trusted HIS
    // integrations can use the authenticated room/invite flow instead.
    console.log(`[reserved/token] queue link issued for room ${sessionID}`);
    await logStore.insert('reserved_token_issued', { roomId: sessionID, roomType: room.type, roomName: room.name, doctorId: room.ownerId, doctorName: room.ownerDisplay, patientName: name, unitHcode: room.ownerHcode || null });
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

// ── Official holiday calendar ─────────────────────────────────────────────────
// Data is fetched from the configured free source once per year, then served
// from local storage. This avoids making normal calendar views dependent on an
// external service and gives administrators an explicit re-sync control.
app.get('/api/holidays', auth(), async (req, res) => {
    const year = validHolidayYear(req.query.year);
    if (!year) return res.status(400).json({ error: 400, message: 'year must be between 2020 and 2100' });
    const cached = await holidayStore.getYear(year);
    if (cached) return res.json({ ...cached, cached: true });
    try {
        const synced = await syncHolidayCalendar(year);
        res.json({ ...synced, cached: false });
    } catch (error) {
        console.warn('[holidays] initial sync failed:', error.message);
        res.status(503).json({ error: 503, message: 'holidaySyncUnavailable' });
    }
});

app.post('/api/holidays/sync', auth(), async (req, res) => {
    if (!isAdmin(res.locals.user)) return res.status(403).json({ error: 403, message: 'adminRequired' });
    const year = validHolidayYear(req.body?.year);
    if (!year) return res.status(400).json({ error: 400, message: 'year must be between 2020 and 2100' });
    try {
        const synced = await syncHolidayCalendar(year);
        console.log(`[holidays] synced ${synced.holidays.length} dates for ${year}`);
        res.json({ ...synced, cached: false });
    } catch (error) {
        console.warn('[holidays] sync failed:', error.message);
        res.status(502).json({ error: 502, message: 'holidaySyncFailed' });
    }
});

// ── Usage Log API ─────────────────────────────────────────────────────────────
// Dashboard figures are scoped to a regular caller's H-Code. System admins may
// view the aggregate, or explicitly choose one H-Code with ?hcode=xxxxx.
function dashboardOptions(req, res) {
    const caller = res.locals.user;
    if (isAdmin(caller)) {
        const requestedHcode = String(req.query.hcode || '').trim();
        return { ...rangeParams(req.query), hcode: requestedHcode || undefined };
    }
    const hcode = hcodeOf(caller);
    if (!hcode) {
        res.status(400).json({ error: 400, message: 'hcodeRequired' });
        return null;
    }
    return { ...rangeParams(req.query), hcode };
}

// GET /api/logs/summary – H-Code-scoped overall stats
app.get('/api/logs/summary', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    res.json(await logStore.summary(opts.hcode));
});

// GET /api/logs/daily?days=30 – events per day
app.get('/api/logs/daily', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    res.json(await logStore.daily(parseInt(req.query.days) || 30, opts.hcode));
});

// GET /api/logs/monthly?months=12 – events per month
app.get('/api/logs/monthly', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    res.json(await logStore.monthly(parseInt(req.query.months) || 12, opts.hcode));
});

// GET /api/logs/by-doctor?months=3 – usage grouped by doctor
app.get('/api/logs/by-doctor', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    res.json(await logStore.byDoctor(parseInt(req.query.months) || 3, opts.hcode));
});

// GET /api/logs/recent?limit=50 – recent event log
app.get('/api/logs/recent', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    res.json(await logStore.recent(parseInt(req.query.limit) || 50, opts.hcode));
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
app.get('/api/logs/by-day', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    res.json(await logStore.byDay(opts));
});

// 4.12.x.1 — usage by hour of day
app.get('/api/logs/by-hour', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    res.json(await logStore.byHour(opts));
});

// 4.12.x.2 — usage by health region (เขตสุขภาพ)
app.get('/api/logs/by-region', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    res.json(await logStore.byRegion(opts));
});

// 4.12.x.2 — usage by province (จังหวัด); optional ?region=N
app.get('/api/logs/by-province', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    if (req.query.region != null && req.query.region !== '') opts.region = parseInt(req.query.region, 10);
    res.json(await logStore.byProvince(opts));
});

// 4.12.x.3 — usage by platform (mobile vs web)
app.get('/api/logs/by-platform', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    res.json(await logStore.byPlatform(opts));
});

// 4.12.x.4 / 4.12.2.5 — service units called (top N via ?limit=)
app.get('/api/logs/by-unit', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
    if (req.query.limit) opts.limit = parseInt(req.query.limit, 10);
    res.json(await logStore.byUnit(opts));
});

// 4.12.2.6 — top N rooms by conversation duration (?limit=, default 5)
app.get('/api/logs/longest-rooms', auth(), async (req, res) => {
    const opts = dashboardOptions(req, res);
    if (!opts) return;
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
    if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });

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
    Promise.resolve(roomStore.get(roomId)).then(room => {
        if (!room) return res.status(404).json({ error: 404, message: 'room not found' });
        if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
        vitalStore.insert({ roomId, patientKey, deviceId, deviceType, metric, value, unit, source, organization, recordedAt });
        return res.status(201).json({ ok: true });
    }).catch(err => res.status(500).json({ error: 500, message: err.message }));
});

// POST /api/vitals/batch — record multiple readings at once (BLE device dump)
app.post('/api/vitals/batch', auth(), async (req, res) => {
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
    const roomIds = [...new Set(records.map(record => record.roomId).filter(Boolean))];
    if (roomIds.length === 0) return res.status(400).json({ error: 400, message: 'each record needs roomId' });
    for (const roomId of roomIds) {
        const room = await roomStore.get(roomId);
        if (!room) return res.status(404).json({ error: 404, message: 'room not found' });
        if (!canManageRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
    }
    vitalStore.insertBatch(records);
    res.status(201).json({ ok: true, count: records.length });
});

// GET /api/vitals?roomId= — list vitals for a room
app.get('/api/vitals', auth(), async (req, res) => {
    const { roomId, patientKey } = req.query;
    if (!roomId && !patientKey) {
        return res.status(400).json({ error: 400, message: 'roomId or patientKey required' });
    }
    if (!roomId) return res.status(400).json({ error: 400, message: 'roomId required' });
    const room = await roomStore.get(roomId);
    if (!room) return res.status(404).json({ error: 404, message: 'room not found' });
    if (!canOpenRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
    const rows = vitalStore.byRoom(roomId);
    res.json(rows);
});

// GET /api/rooms/:id/vitals/latest — latest value per metric for a room
app.get('/api/rooms/:id/vitals/latest', auth(), async (req, res) => {
    const room = await roomStore.get(req.params.id);
    if (!room) return res.status(404).json({ error: 404, message: 'room not found' });
    if (!canOpenRoom(room, res.locals.user)) return res.status(403).json({ error: 403, message: 'roomAccessDenied' });
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
