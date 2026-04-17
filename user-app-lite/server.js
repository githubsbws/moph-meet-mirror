require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fetch = require('node-fetch');
const https  = require('https');

const multer   = require('multer');
const FormData  = require('form-data');

// Agent that skips TLS verification for internal/government servers with
// self-signed or unverifiable certificates (e.g. moph-meet.moph.go.th).
const _insecureAgent = new https.Agent({ rejectUnauthorized: false });

const app = express();
const PORT = process.env.PORT || 3001;

// multer: hold uploaded video in memory before forwarding to AI server
const _upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 h
}));

// ── View Engine ────────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Helpers ────────────────────────────────────────────────────────────────────
const API_BASE       = process.env.API_BASE;
// CORE_BASE: direct URL to core-lite, skipping nginx/internet for time-sensitive calls.
// Falls back to API_BASE so existing behaviour is preserved if not set.
const CORE_BASE      = process.env.CORE_BASE || API_BASE;
const AI_SUMMARY_URL = process.env.AI_SUMMARY_URL || 'http://localhost:3600';
const MEETING_URL    = process.env.MEETING_URL;
const MEETING_DOMAIN = process.env.MEETING_DOMAIN;
const PROVIDER_ID_CLIENT_ID    = process.env.PROVIDER_ID_CLIENT_ID;
const PROVIDER_ID_REDIRECT_URI = process.env.PROVIDER_ID_REDIRECT_URI;

// Wrapper around node-fetch that injects the insecure agent for https URLs
// so that government servers with unverifiable certificates still work.
function apiFetch(url, opts = {}) {
  if (url && url.startsWith('https://')) {
    opts = { ...opts, agent: _insecureAgent };
  }
  return fetch(url, opts);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user && req.session.token) return next();
  return res.redirect('/login');
}

// ── Auto-session from token (for /api/meet/reserved doctor URLs) ───────────────
// If ?token= is present and no session exists, validate the token against
// core-lite and create a session so the doctor can use the exam room without
// a separate ProviderID login step.
async function autoSessionFromToken(req, res, next) {
  // Already has a session – nothing to do
  if (req.session && req.session.user && req.session.token) return next();

  const qToken = req.query.token;
  if (!qToken) return next(); // no token in URL, fall through to requireAuth

  try {
    const r = await apiFetch(`${CORE_BASE}/api/auth/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: qToken })
    });
    if (!r.ok) return next(); // invalid token, let requireAuth redirect to login

    const data = await r.json();
    req.session.token = qToken;
    req.session.user  = { ...data.user, roles: data.user?.roles || ['staff'] };
    console.log(`[autoSession] created session for ${data.user?.username || 'unknown'} via reserved token`);
  } catch (err) {
    console.warn('[autoSession] token validation failed:', err.message);
  }
  return next();
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET / → dashboard (requires auth)
app.get('/', requireAuth, async (req, res) => {
  const { user, token } = req.session;
  const isProvider = user.roles?.includes('staff') || user.roles?.includes('admin');

  let meets = [];
  try {
    const r = await apiFetch(`${API_BASE}/api/meets`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.ok) meets = await r.json();
  } catch (_) { /* keep empty */ }

  const calendarDates = meets.map(m => ({
    date: m.starttime ? m.starttime.slice(0, 10) : null,
    hasPatient: m.type === 'exam'
  })).filter(m => m.date);

  res.render('dashboard', {
    user,
    meets,
    calendarDates: JSON.stringify(calendarDates),
    isProvider,
    meetingUrl: MEETING_URL,
    formatDate,
    formatTime
  });
});

// ── POST /api/rooms – proxy to core-lite, return room + links ─────────────────
app.post('/api/rooms', requireAuth, async (req, res) => {
  const { token } = req.session;
  try {
    const r = await apiFetch(`${CORE_BASE}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/exam/:id/next – doctor calls next patient ───────────────────────
app.post('/api/exam/:id/next', requireAuth, async (req, res) => {
  const { token } = req.session;
  try {
    const r = await apiFetch(`${CORE_BASE}/api/exam/${req.params.id}/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    res.status(r.status).json(await r.json());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /room/:id – meet room for providers (requires session auth) ───────────
app.get('/room/:id', requireAuth, async (req, res) => {
  const { user, token } = req.session;
  let room = { id: req.params.id, name: req.params.id, type: 'meet' };
  try {
    const r = await apiFetch(`${CORE_BASE}/api/rooms/${req.params.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.ok) room = await r.json();
  } catch (_) {}

  // Auto-join: register this provider as a participant so the room
  // appears in their meeting list (no-op if already owner or joined)
  try {
    await apiFetch(`${CORE_BASE}/api/rooms/${req.params.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
  } catch (_) {}

  res.render('meet', { user, meet: room, meetingDomain: MEETING_DOMAIN, isExam: false });
});

// ── GET /exam/:id – exam room for doctor (requires session auth) ──────────────
// Supports ?token=<doctorToken> from /api/meet/reserved for auto-login.
app.get('/exam/:id', autoSessionFromToken, requireAuth, async (req, res) => {
  const { user, token } = req.session;
  let room = { id: req.params.id, name: req.params.id, type: 'exam' };
  try {
    const r = await apiFetch(`${CORE_BASE}/api/exam/${req.params.id}/doctor`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.ok) room = await r.json();
  } catch (_) {}

  // Auto-join: register this provider as a participant so the room
  // appears in their meeting list (no-op if already owner or joined)
  try {
    await apiFetch(`${CORE_BASE}/api/rooms/${req.params.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
  } catch (_) {}

  res.render('meet', { user, meet: room, meetingDomain: MEETING_DOMAIN, isExam: true });
});

// ── GET /queue/:id – patient waiting room (JWT auth via query param) ──────────
app.get('/queue/:id', async (req, res) => {
  const { jwt: jwtToken } = req.query;
  if (!jwtToken) return res.redirect('/login?error=no_token');

  // Verify JWT via core-lite
  try {
    const r = await apiFetch(`${CORE_BASE}/api/jwt/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: jwtToken })
    });
    const data = await r.json();
    if (!data.valid) return res.redirect('/login?error=invalid_token');
    const payload = data.payload;
    res.render('queue', {
      roomId: req.params.id,
      jwtToken,
      patientName: payload.patientName || 'ผู้ป่วย',
      meetingDomain: MEETING_DOMAIN
    });
  } catch (err) {
    res.redirect('/login?error=server');
  }
});

// ── POST /api/exam/:id/invite – proxy invite link generation ─────────────────
app.post('/api/exam/:id/invite', requireAuth, async (req, res) => {
  const { token } = req.session;
  try {
    const r = await apiFetch(`${CORE_BASE}/api/exam/${req.params.id}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(req.body)
    });
    res.status(r.status).json(await r.json());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/exam/:id/submit-summary – forward metadata to AI summary ────────
// Video is uploaded directly from browser to ABS. This endpoint receives only
// metadata (patientName, patientCid, roomName, service times) + adds doctorCid.
app.post('/api/exam/:id/submit-summary', requireAuth, async (req, res) => {
  const { user } = req.session;
  const doctorCid = user?.providerIDProfile?.cid || user?.username || '';
  const { patientCid, patientName, roomName, service_start_time, service_end_time } = req.body;

  try {
    const form = new FormData();
    form.append('doctorCid',          doctorCid              || '');
    form.append('patientCid',         patientCid             || '');
    form.append('patientName',        patientName            || '');
    form.append('roomId',             req.params.id          || '');
    form.append('roomName',           roomName               || '');
    form.append('service_start_time', service_start_time     || '');
    form.append('service_end_time',   service_end_time       || '');

    const r = await apiFetch(`${AI_SUMMARY_URL}/api/ai-summary`, {
      method  : 'POST',
      headers : form.getHeaders(),
      body    : form,
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('[submit-summary] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/media-upload/credentials – return ABS upload URL + token to client ───
// Client uses these to POST the video directly to ABS without proxying through us.
// Gated behind session auth so the token is never publicly exposed.
app.get('/api/media-upload/credentials', requireAuth, (req, res) => {
  const { user } = req.session;
  const doctorCid = user?.providerIDProfile?.cid || user?.username || '';
  res.json({
    url   : 'https://ai-telemedicine.abs.co.th/api/media',
    token : 'dP6rcyWhrLVEhjEaxQVRqA2jcBpFVKePfmVWnORSp1I',
    providerCid: doctorCid,
  });
});

// ── GET /api/exam/:id/doctor – proxy doctor view (session required) ──────────
app.get('/api/exam/:id/doctor', requireAuth, async (req, res) => {
  try {
    const r = await apiFetch(`${CORE_BASE}/api/exam/${req.params.id}/doctor`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.session.token}`
      }
    });
    res.status(r.status).json(await r.json());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/exam/:id/queue – proxy queue poll (no session needed, JWT-based) ──
app.get('/api/exam/:id/queue', async (req, res) => {
  try {
    const r = await apiFetch(
      `${CORE_BASE}/api/exam/${req.params.id}/queue?jwt=${encodeURIComponent(req.query.jwt || '')}`
    );
    res.status(r.status).json(await r.json());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /login
app.get('/login', (req, res) => {
  if (req.session?.token) return res.redirect('/');
  res.render('login', {
    providerIdClientId: PROVIDER_ID_CLIENT_ID,
    providerIdRedirectUri: PROVIDER_ID_REDIRECT_URI,
    error: req.query.error || null
  });
});

// ── GET /usage-logs – public transparency dashboard (no login required) ────────
app.get('/usage-logs', (_req, res) => {
  res.render('usage-logs');
});

// ── Proxy usage-log API from core-lite (public) ─────────────────────────────────
app.get('/api/usage-logs/:endpoint', async (req, res) => {
  const allowed = ['summary', 'daily', 'monthly', 'by-doctor', 'recent'];
  if (!allowed.includes(req.params.endpoint)) return res.status(404).json({ error: 404 });
  try {
    const qs = new URLSearchParams(req.query).toString();
    const url = `${CORE_BASE}/api/logs/${req.params.endpoint}${qs ? '?' + qs : ''}`;
    const r = await apiFetch(url);
    res.status(r.status).json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/providerid/callback  (ProviderID OAuth2 callback)
app.get('/auth/providerid/callback', async (req, res) => {
  const { code } = req.query;
  console.log('[ProviderID] callback received, code:', code);
  if (!code) {
    console.warn('[ProviderID] no code in query');
    return res.redirect('/login?error=no_code');
  }
  try {
    // Use CORE_BASE (direct localhost:3500) to avoid routing through nginx/internet,
    // which would add latency and risk the short-lived OAuth code expiring in transit.
    const r = await apiFetch(`${CORE_BASE}/api/auth/providerID`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    console.log('[ProviderID] api response status:', r.status);

    const rawText = await r.text();
    console.log('[ProviderID] api response body:', rawText);

    if (!r.ok) {
      console.error('[ProviderID] auth failed, body:', rawText);
      return res.redirect('/login?error=providerid_fail');
    }

    let data;
    try { data = JSON.parse(rawText); } catch (e) {
      console.error('[ProviderID] failed to parse JSON:', e.message);
      return res.redirect('/login?error=providerid_fail');
    }

    if (!data.data) {
      console.warn('[ProviderID] no data field in response:', data);
      return res.redirect('/login?error=providerid_no_data');
    }

    console.log('[ProviderID] token:', data.data.token);
    console.log('[ProviderID] user:', JSON.stringify(data.data.user));

    req.session.token = data.data.token;
    req.session.user  = { ...data.data.user, roles: ['admin', 'staff'] };
    if (data.data?.providerIDProfile?.organization) {
      req.session.organization = data.data.providerIDProfile.organization;
    }
    return res.redirect('/');
  } catch (err) {
    console.error('[ProviderID] unexpected error:', err);
    return res.redirect('/login?error=server');
  }
});

// GET /guest?token=<temporary-token>  (patient / guest login)
app.get('/guest', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/login?error=no_token');
  try {
    const r = await apiFetch(`${API_BASE}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    if (!r.ok) return res.redirect('/login?error=invalid_token');
    const data = await r.json();
    req.session.token = data.token;
    req.session.user  = { ...data.user, roles: ['guest'] };
    return res.redirect('/meet/' + data.meetId);
  } catch (_) {
    return res.redirect('/login?error=server');
  }
});

// POST /profile — update extra user fields (hcode, clinic, dob, gender)
app.post('/profile', requireAuth, async (req, res) => {
  const { token, user } = req.session;
  const { hcode5, hcode9, clinicCode, dateOfBirth, gender } = req.body;
  try {
    const r = await apiFetch(`${API_BASE}/api/auth/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hcode5, hcode9, clinicCode, dateOfBirth, gender })
    });
    if (r.ok) {
      const data = await r.json();
      req.session.user = data.user || { ...user, hcode5, hcode9, clinicCode, dateOfBirth, gender };
    }
  } catch (e) {
    console.error('[profile] update failed:', e.message);
  }
  res.redirect('/');
});

// POST /logout
app.post('/logout', async (req, res) => {
  const token = req.session.token;
  try {
    await apiFetch(`${API_BASE}/api/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
  } catch (_) { /* ignore */ }
  req.session.destroy(() => res.redirect('/login'));
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`user-app-lite running on http://localhost:${PORT}`);
});
