# poc-mophmeet-ai-summary — PoC page

This is a small proof-of-concept page that demonstrates three tasks:

- Create a Jitsi meeting room via a quick random button.
- Create/join a room via a form with room name and display name.
- End the embedded meeting using the Jitsi External API `hangup`.

How to use

1. Open `poc-mophmeet-ai-summary/index.html` in a browser (double-click or serve via a static server).
2. Click "Create random Jitsi room" to generate a room and embed a Jitsi meeting.
3. Use the form to join a specific room and set a display name.
4. Click "End meeting" to hang up and remove the embedded meeting.

Notes

- The PoC uses the public `meet.jit.si` deployment via the External API script.
- This is a front-end-only demonstration. For production, host your own Jitsi or secure the meeting lifecycle server-side.
