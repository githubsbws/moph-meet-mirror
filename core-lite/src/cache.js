const NodeCache = require('node-cache');

// Token TTL: 6 hours
const tokenStorage = new NodeCache({
  stdTTL: 6 * 60 * 60,
  deleteOnExpire: true,
  checkperiod: 120,
  useClones: false,
});

module.exports = { tokenStorage };
