# Require an examination room name

## Delivered

- The mobile and web examination-room forms label the field as `ชื่อห้องตรวจ *` and show an examination-room example.
- A blank examination-room name is blocked in the mobile form, web form, and `POST /api/rooms` API.
- A meeting-room name remains optional and retains the existing automatic-name fallback.
- The entered name continues to use the existing `name` field, so no database schema or environment variable was added.

## Verification

- Empty examination-room name: API returns `400 exam room name required`.
- Named examination room: API creates the room and preserves the submitted name.
