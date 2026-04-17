/**
 * Storage factory – reads STORAGE env var and returns the correct backend.
 *
 *   STORAGE=memory   → NodeCache / Map  (dev, testing)
 *   STORAGE=sqlite   → better-sqlite3   (default, current)
 *   STORAGE=pg       → PostgreSQL via 'pg' pool
 *
 * Exports: { tokenStorage, roomStore, profileStore, logStore, init }
 */

const mode = (process.env.STORAGE || 'sqlite').toLowerCase();

let backend;
switch (mode) {
  case 'memory':
    backend = require('./memory');
    break;
  case 'pg':
  case 'postgres':
  case 'postgresql':
    backend = require('./pg');
    break;
  case 'sqlite':
  default:
    backend = require('./sqlite');
    break;
}

console.log(`[store] storage backend: ${mode}`);

module.exports = backend;
