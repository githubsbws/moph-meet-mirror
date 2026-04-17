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

function auth() {
  return async (req, res, next) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
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
