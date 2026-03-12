require('dotenv').config();
// Allow self-signed / incomplete-chain certs on outbound calls to moph.id.th & provider.id.th
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const { createHash, randomInt } = require('crypto');
const NodeCache = require('node-cache');
const { tokenStorage } = require('./cache');
const { auth } = require('./middlewares/auth');

// Short-lived cache for ProviderID code exchange (handles slow-network retries)
const codeCache = new NodeCache({ stdTTL: 10, checkperiod: 5 });

const PORT = process.env.APP_PORT || 3500;

const PROVIDER_ID_CLIENT_ID = process.env.PROVIDER_ID_CLIENT_ID;
const PROVIDER_ID_CLIENT_SECRET = process.env.PROVIDER_ID_CLIENT_SECRET;
const PROVIDER_ID_REDIRECT_URI = process.env.PROVIDER_ID_REDIRECT_URI;
const PROVIDER_SERVICE_CLIENT_ID = process.env.PROVIDER_SERVICE_CLIENT_ID;
const PROVIDER_SERVICE_SECRET_KEY = process.env.PROVIDER_SERVICE_SECRET_KEY;

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
            return res.status(401).json({ error: 401, message: 'invalidProviderIDToken' });
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

// ── Meets – proxied from token cache (no DB) ─────────────────────────────────
// Meets are managed by the main core; core-lite only handles auth + guest tokens.
// Return empty list so user-app-lite doesn't break on GET /api/meets.
app.get('/api/meets', auth(), (req, res) => res.json([]));
app.get('/api/meets/:id', auth(), (req, res) => res.status(404).json({ error: 404, message: 'notFound' }));
app.get('/api/exam/:id', auth(), (req, res) => res.status(404).json({ error: 404, message: 'notFound' }));

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

        tokenStorage.set(guestToken, guestSession, ttlSeconds || 24 * 60 * 60); // default 24 h
        res.json({ token: guestToken, meetId });
    } catch (err) {
        next(err);
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
