require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createHash, randomInt } = require('crypto');
const { sequelize } = require('./database');
const { tokenStorage } = require('./cache');
const { auth } = require('./middlewares/auth');
const { User, UserAuth, RoleMap } = require('./models/user');
const { Meet, MeetInvite } = require('./models/meeting');
const { Op } = require('sequelize');

const PORT = process.env.APP_PORT || 3500;

const PROVIDER_ID_CLIENT_ID     = process.env.PROVIDER_ID_CLIENT_ID;
const PROVIDER_ID_CLIENT_SECRET = process.env.PROVIDER_ID_CLIENT_SECRET;
const PROVIDER_ID_REDIRECT_URI  = process.env.PROVIDER_ID_REDIRECT_URI;
const PROVIDER_SERVICE_CLIENT_ID  = process.env.PROVIDER_SERVICE_CLIENT_ID;
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
  try {
    const { code } = req.body;
    console.log('[ProviderID] exchanging code:', code);

    // Step 1 – exchange code → HealthID access_token
    const oauthPayload = {
      grant_type: 'authorization_code',
      client_id: PROVIDER_ID_CLIENT_ID,
      client_secret: PROVIDER_ID_CLIENT_SECRET,
      code,
      redirect_uri: PROVIDER_ID_REDIRECT_URI,
    };

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

    // Step 4 – upsert user in DB
    let user = await User.findOne({
      where: { username: profile.data.account_id },
      include: [{ model: RoleMap, attributes: ['roleName'] }],
    });

    if (!user) {
      const newUser = await User.create({
        username: profile.data.account_id,
        display: profile.data.name_th || profile.data.account_id,
        isOnline: true,
      });
      await RoleMap.create({ userUid: newUser.dataValues.uid, roleName: 'staff' });
      user = await User.findOne({
        where: { username: profile.data.account_id },
        include: [{ model: RoleMap, attributes: ['roleName'] }],
      });
    } else {
      await user.update({ isOnline: true });
    }

    const token = createHash('sha256')
      .update(new Date().toISOString() + JSON.stringify(user.toJSON()) + randomInt(1000))
      .digest('hex');

    tokenStorage.set(token, user);

    return res.json({
      data: {
        token,
        user: { ...user.toJSON(), roleMaps: user.dataValues.roleMaps },
        providerID: providerToken.data,
        providerIDProfile: profile.data,
      },
    });
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

app.post('/api/logout', async (req, res, next) => {
  try {
    const user = tokenStorage.get(req.body.token);
    if (!user) return res.status(401).json({ error: 401, message: 'invalidToken' });
    // Only update DB if it's a real Sequelize model instance
    if (typeof user.update === 'function') {
      await user.update({ isOnline: false });
    }
    tokenStorage.del(req.body.token);
    res.json({ token: req.body.token });
  } catch (err) {
    next(err);
  }
});

// ── Meets ──────────────────────────────────────────────────────────────────────
app.get('/api/meets', auth(), async (req, res, next) => {
  try {
    const uid = res.locals.user?.dataValues?.uid;
    const meets = await Meet.findAll({
      where: {
        userUid: uid,
        endtime: { [Op.gte]: new Date() },
      },
      include: [MeetInvite],
      order: [['starttime', 'ASC']],
    });
    res.json(meets);
  } catch (err) {
    next(err);
  }
});

app.get('/api/meets/:id', auth(), async (req, res, next) => {
  try {
    const meet = await Meet.findByPk(req.params.id, { include: [MeetInvite] });
    if (!meet) return res.status(404).json({ error: 404, message: 'notFound' });
    res.json(meet);
  } catch (err) {
    next(err);
  }
});

app.get('/api/exam/:id', auth(), async (req, res, next) => {
  try {
    const meet = await Meet.findByPk(req.params.id, { include: [MeetInvite] });
    if (!meet) return res.status(404).json({ error: 404, message: 'notFound' });
    res.json(meet);
  } catch (err) {
    next(err);
  }
});

// ── User search ────────────────────────────────────────────────────────────────
app.get('/api/user/:keyword', auth(), async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: { display: { [Op.like]: `%${req.params.keyword}%` } },
      include: [{ model: RoleMap, attributes: ['roleName'] }],
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
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
async function main() {
  try {
    await sequelize.authenticate();
    console.log('DB connected');
    app.listen(PORT, () => {
      console.log(`core-lite running on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

main();
