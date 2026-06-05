# Scope: `*-lite` projects only

The project owner deprecated the original full apps in favor of the lightweight
rewrites. Always work in the `*-lite` variants. Treat the old ones as read-only
references at most.

## Active (work here)

| Project | Path | Port | Notes |
|---|---|---|---|
| Core API | `core-lite/` | `3500` (`APP_PORT`) | Plain JS, no TS build step. SQLite-backed. |
| Web app | `user-app-lite/` | per `.env` `PORT` | Express + EJS. Talks to core-lite via `CORE_BASE`. |
| Core tests | `tests/core-lite/` | — | `test_api.py` (pytest) + `test_api.test.js` (jest). |
| Web tests | `tests/user-app-lite/` | — | `test_app.py` (pytest) + `test_app.test.js` (jest). |

## Deprecated (do NOT modify)

- `core/` — old TypeScript core API, replaced by `core-lite/`.
- `user-app/` — old web app, replaced by `user-app-lite/`.
- `tests/moph-meet/` — tests for the deprecated apps.

Do not add features, fix bugs, or write tests in these. If a change seems to
belong there, make it in the matching `*-lite` project instead. Only read them
to understand prior behavior, and call it out if you do.

## Rules

- New code, fixes, and tests go in `core-lite/`, `user-app-lite/`, and their
  `tests/*-lite/` suites.
- `user-app-lite` is the frontend/proxy; `core-lite` owns the real `/api/*`
  routes and data. Keep that boundary.
- Don't reintroduce the TypeScript build pipeline from `core/`; core-lite runs
  `node src/index.js` directly.
