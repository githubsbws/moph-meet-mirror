const NodeCache = require('node-cache');

// Token TTL: 6 hours
const tokenStorage = new NodeCache({
  stdTTL: 6 * 60 * 60,
  deleteOnExpire: true,
  checkperiod: 120,
  useClones: false,
});

tokenStorage.on('set', (key, user) => {
  console.log(`[auth] session created for "${user?.username}"`);
});

tokenStorage.on('del', (key, user) => {
  console.log(`[auth] session removed for "${user?.username}"`);
});

module.exports = { tokenStorage };
