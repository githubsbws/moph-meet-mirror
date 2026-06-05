const { tokenStorage } = require('../store');

// Static API keys (same whitelist as core)
const whitelist = [
  '765237ce-afd7-470b-907e-d21e17e07c0d',
  'demotoken-yg990',
  '24d3996a3fd5895e327f3e078b6d77e4f11dd5bdb935fb65476c57b4e1aa6d92',
  'a5f62c16d3020394bc2611701c32295b953ef9f971ff67b062da6cd9223aeaa6',
  '7ca6cdc86e4518513a4c69d425a893256efe7ed0e997d3104d892641e0f4b728',
  '582d2d5553a081bc23fbd85d3c5aace5bd44fabadb75e6871ce1347135479e95',
];

// Read the auth token from the Authorization header, or fall back to a `token`
// cookie. The cookie fallback matters because nginx routes some /api/ paths
// straight to core-lite (bypassing the user-app-lite proxy that converts the
// cookie into a Bearer header) — without it those routes always 401.
function tokenFromRequest(req) {
  const bearer = req.headers['authorization']?.replace('Bearer ', '').trim();
  if (bearer) return bearer;
  const cookie = req.headers['cookie'];
  if (cookie) {
    const m = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return undefined;
}

function auth() {
  return async (req, res, next) => {
    const token = tokenFromRequest(req);
    if (token && whitelist.includes(token)) return next();
    if (token && await tokenStorage.has(token)) {
      res.locals.user  = await tokenStorage.get(token);
      res.locals.token = token;
      return next();
    }
    return res.status(401).json({ error: 401, message: 'tokenExpired' });
  };
}

module.exports = { auth };
