require('dotenv').config();
const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');
const fetch        = require('node-fetch');
const https        = require('https');
const multer       = require('multer');
const FormData     = require('form-data');

const _insecureAgent = new https.Agent({ rejectUnauthorized: false });

const app  = express();
const PORT = process.env.PORT || 3001;

const CORE_BASE              = process.env.CORE_BASE || process.env.API_BASE || 'http://localhost:3500';
const AI_SUMMARY_URL         = process.env.AI_SUMMARY_URL || 'http://localhost:3600';
const MEETING_URL            = process.env.MEETING_URL;
const MEETING_DOMAIN         = process.env.MEETING_DOMAIN;
const PROVIDER_ID_CLIENT_ID  = process.env.PROVIDER_ID_CLIENT_ID;
const PROVIDER_ID_REDIRECT_URI = process.env.PROVIDER_ID_REDIRECT_URI;
const MANUAL_LOGIN_ENABLED   = process.env.MANUAL_LOGIN_ENABLED !== 'false';

function apiFetch(url, opts = {}) {
  if (url && url.startsWith('https://')) opts = { ...opts, agent: _insecureAgent };
  return fetch(url, opts);
}

// multer.none() parses multipart text fields only – no file buffers in memory
const _uploadNone = multer().none();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ── Cookie helpers ─────────────────────────────────────────────────────────────
// Build a compact user object (strip the huge ProviderID JWT/profile & full org
// array). Used for both the web cookie and the mobile deep-link redirect — the
// full user object is large and, when packed into the mobile redirect URL,
// overflows nginx's proxy_buffer_size → 502. Keep only fields the apps read.
function compactUser(user) {
  const u = user || {};
  const org0 = u.organization?.[0] || {};
  const pid  = u.providerIDProfile  || {};
  return {
    username: u.username, display: u.display, roles: u.roles,
    hcode5: u.hcode5, hcode9: u.hcode9, clinicCode: u.clinicCode,
    dateOfBirth: u.dateOfBirth, gender: u.gender,
    providerIDProfile: pid.provider_id ? {
      title_th: pid.title_th, email: pid.email,
      provider_id: pid.provider_id, cid: pid.cid,
    } : undefined,
    organization: org0.hcode ? [{
      position: org0.position, hname_th: org0.hname_th,
      hcode: org0.hcode, department: org0.department,
    }] : undefined,
  };
}

function setAuthCookies(res, token, user) {
  const cookieOpts = { httpOnly: false, sameSite: 'lax', maxAge: 86400000 };
  res.cookie('token', token, cookieOpts);
  try {
    const str = JSON.stringify(compactUser(user));
    if (str.length <= 3800) res.cookie('user_json', str, cookieOpts);
  } catch (_) {}
}

function getUserFromCookie(req) {
  try { return JSON.parse(req.cookies?.user_json || '{}'); } catch (_) { return {}; }
}

// ── Public config ──────────────────────────────────────────────────────────────
app.get('/config', (_req, res) => {
  res.json({
    providerIdClientId:    PROVIDER_ID_CLIENT_ID,
    providerIdRedirectUri: PROVIDER_ID_REDIRECT_URI,
    meetingDomain:         MEETING_DOMAIN,
    meetingUrl:            MEETING_URL,
    manualLoginEnabled:    MANUAL_LOGIN_ENABLED,
  });
});

// ── GET /api/auth/me ── validate token cookie, return user ────────────────────
app.get('/api/auth/me', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  try {
    const r = await apiFetch(`${CORE_BASE}/api/auth/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!r.ok) {
      res.clearCookie('token'); res.clearCookie('user_json');
      return res.status(401).json({ error: 'invalid token' });
    }
    const data = await r.json();
    return res.json(data.user || {});
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

// ── POST /login/manual ─────────────────────────────────────────────────────────
app.post('/login/manual', async (req, res) => {
  if (!MANUAL_LOGIN_ENABLED) return res.redirect('/login.html?error=manual_disabled');
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.redirect('/login.html?error=invalid');
  try {
    const r = await apiFetch(`${CORE_BASE}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) return res.redirect('/login.html?error=invalid');
    const data = await r.json();
    setAuthCookies(res, data.token, data.user);
    return res.redirect('/');
  } catch (err) {
    console.error('[manual-login]', err.message);
    return res.redirect('/login.html?error=server');
  }
});

// ── GET /auth/providerid/callback ──────────────────────────────────────────────
app.get('/auth/providerid/callback', async (req, res) => {
  const { code, state } = req.query;
  const isMobile = state === 'mobile';
  if (!code) return res.redirect('/login.html?error=no_code');
  try {
    const r = await apiFetch(`${CORE_BASE}/api/auth/providerID`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const rawText = await r.text();
    if (!r.ok) { console.error('[ProviderID] auth failed:', rawText); return res.redirect('/login.html?error=providerid_fail'); }
    let data;
    try { data = JSON.parse(rawText); } catch (_) { return res.redirect('/login.html?error=providerid_fail'); }
    if (!data.data) return res.redirect('/login.html?error=providerid_no_data');
    if (isMobile) {
      // Send a COMPACT user — the full user object overflows nginx's proxy
      // buffer when URL-encoded into the redirect Location header → 502.
      const token = encodeURIComponent(data.data.token);
      const user  = encodeURIComponent(JSON.stringify(compactUser(data.data.user)));
      return res.redirect(`mophmeet://auth?token=${token}&user=${user}`);
    }
    const user = { ...data.data.user, roles: ['admin', 'staff'] };
    setAuthCookies(res, data.data.token, user);
    return res.redirect('/');
  } catch (err) {
    console.error('[ProviderID] error:', err.message);
    return res.redirect('/login.html?error=server');
  }
});

// ── GET /guest ─────────────────────────────────────────────────────────────────
app.get('/guest', async (req, res) => {
  const { token: gToken } = req.query;
  if (!gToken) return res.redirect('/login.html?error=no_token');
  try {
    const r = await apiFetch(`${CORE_BASE}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: gToken }),
    });
    if (!r.ok) return res.redirect('/login.html?error=invalid_token');
    const data = await r.json();
    setAuthCookies(res, data.token, { ...data.user, roles: ['guest'] });
    return res.redirect('/meet/' + data.meetId);
  } catch (_) { return res.redirect('/login.html?error=server'); }
});

// ── POST /logout ───────────────────────────────────────────────────────────────
app.post('/logout', async (req, res) => {
  const token = req.cookies?.token;
  try {
    if (token) await apiFetch(`${CORE_BASE}/api/logout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    });
  } catch (_) {}
  res.clearCookie('token'); res.clearCookie('user_json');
  return res.redirect('/login.html');
});

// ── POST /profile ──────────────────────────────────────────────────────────────
app.post('/profile', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/login.html');
  const { hcode5, hcode9, clinicCode, dateOfBirth, gender } = req.body;
  try {
    const r = await apiFetch(`${CORE_BASE}/api/auth/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hcode5, hcode9, clinicCode, dateOfBirth, gender }),
    });
    if (r.ok) {
      const data = await r.json();
      setAuthCookies(res, token, data.user || { ...getUserFromCookie(req), hcode5, hcode9, clinicCode, dateOfBirth, gender });
    }
  } catch (e) { console.error('[profile]', e.message); }
  res.redirect('/');
});

// ── SPA routes: /login, /room/:id, /exam/:id, /queue/:id ──────────────────────
app.get('/login',     (_req, res) => res.redirect('/login.html'));
app.get('/room/:id',  (_req, res) => res.sendFile(path.join(__dirname, 'public', 'meet.html')));
app.get('/exam/:id',  (_req, res) => res.sendFile(path.join(__dirname, 'public', 'meet.html')));
app.get('/queue/:id', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'queue.html')));
app.get('/usage-logs',(_req, res) => res.sendFile(path.join(__dirname, 'public', 'usage-logs.html')));
app.get('/vitals',    (_req, res) => res.sendFile(path.join(__dirname, 'public', 'vitals.html')));
app.get('/vitals/:id',(_req, res) => res.sendFile(path.join(__dirname, 'public', 'vitals.html')));

// ── ABS upload credentials ─────────────────────────────────────────────────────
app.get('/api/media-upload/credentials', (req, res) => {
  if (!req.cookies?.token) return res.status(401).json({ error: 'unauthenticated' });
  const u = getUserFromCookie(req);
  const doctorCid = u?.providerIDProfile?.cid || u?.username || '';
  res.json({
    url:        'https://ai-telemedicine.abs.co.th/api/media',
    token:      'dP6rcyWhrLVEhjEaxQVRqA2jcBpFVKePfmVWnORSp1I',
    providerCid: doctorCid,
  });
});

// ── AI Summary metadata proxy ──────────────────────────────────────────────────
app.post('/api/exam/:id/submit-summary', _uploadNone, async (req, res) => {
  if (!req.cookies?.token) return res.status(401).json({ error: 'unauthenticated' });
  const u = getUserFromCookie(req);
  const doctorCid = u?.providerIDProfile?.cid || u?.username || '';
  const { patientCid, patientName, roomName, service_start_time, service_end_time } = req.body;
  try {
    const form = new FormData();
    form.append('doctorCid',          doctorCid          || '');
    form.append('patientCid',         patientCid         || '');
    form.append('patientName',        patientName        || '');
    form.append('roomId',             req.params.id      || '');
    form.append('roomName',           roomName           || '');
    form.append('service_start_time', service_start_time || '');
    form.append('service_end_time',   service_end_time   || '');
    const r = await apiFetch(`${AI_SUMMARY_URL}/api/ai-summary`, {
      method: 'POST', headers: form.getHeaders(), body: form,
    });
    res.status(r.status).json(await r.json());
  } catch (err) {
    console.error('[submit-summary] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PHR proxy ──────────────────────────────────────────────────────────────────
app.post('/api/phr/request-otp', async (req, res) => {
  try {
    const r = await apiFetch('https://phr1.moph.go.th/api/RequestTokenv1', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid: req.body.cid }),
    });
    res.status(r.status).json(await r.json().catch(() => ({})));
  } catch (e) { res.status(502).json({ message: 'PHR error: ' + e.message }); }
});

app.post('/api/phr/encounter', async (req, res) => {
  const { cid, otp } = req.body;
  try {
    await apiFetch('https://phr1.moph.go.th/api/WebApp?Action=ValidateOTP', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid, otp }),
    });
    const r = await apiFetch('https://phr1.moph.go.th/api/WebApp?Action=Encounter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid, otp }),
    });
    res.json(await r.json());
  } catch (e) { res.status(502).json({ message: 'PHR error: ' + e.message }); }
});

// ── Usage-logs proxy (path rewrite: /api/usage-logs → /api/logs) ──────────────
app.get('/api/usage-logs/:endpoint', async (req, res) => {
  const allowed = ['summary', 'daily', 'monthly', 'by-doctor', 'recent',
                   'by-day', 'by-hour', 'by-region', 'by-province', 'by-platform', 'by-unit', 'longest-rooms'];
  if (!allowed.includes(req.params.endpoint)) return res.status(404).json({ error: 404 });
  try {
    const qs  = new URLSearchParams(req.query).toString();
    const url = `${CORE_BASE}/api/logs/${req.params.endpoint}${qs ? '?' + qs : ''}`;
    const r   = await apiFetch(url);
    res.status(r.status).json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── General API proxy → core-lite (auth from cookie) ──────────────────────────
app.use('/api', async (req, res) => {
  const token = req.cookies?.token;
  // NOTE: inside app.use('/api', ...) Express strips the mount path, so req.path
  // is '/rooms' not '/api/rooms'. Use req.originalUrl to preserve the '/api'
  // prefix (and query string) when forwarding to core-lite.
  const url   = `${CORE_BASE}${req.originalUrl}`;
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const opts  = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method) && req.body && Object.keys(req.body).length) {
    opts.body = JSON.stringify(req.body);
  }
  try {
    const r  = await apiFetch(url, opts);
    const ct = r.headers.get('content-type') || '';
    res.status(r.status);
    if (ct.includes('application/json')) res.json(await r.json());
    else res.send(await r.text());
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`user-app-lite (static) running on http://localhost:${PORT}`);
});


