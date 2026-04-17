/**
 * Backward-compatibility re-export.
 * All storage is now managed by ./store/index.js
 */
const { tokenStorage } = require('./store');
module.exports = { tokenStorage };
