/**
 * Build a self-contained HTML page that loads the Jitsi External API
 * and auto-joins without the prejoin screen.
 *
 * Used as:
 *   - `<iframe srcdoc={html}>` on web
 *   - `<WebView source={{ html }}>` on native
 *
 * The page posts `{ name: 'readyToClose' }` to the parent when the user leaves.
 */
export function buildJitsiEmbedHtml(opts: {
  domain: string;
  room: string;
  jwt: string;
  displayName?: string;
  email?: string;
}): string {
  const { domain, room, jwt, displayName = 'Guest', email = '' } = opts;

  // JSON-encode each value so it's safely embedded in a JS string literal
  const jDomain = JSON.stringify(domain);
  const jRoom   = JSON.stringify(room);
  const jJwt    = JSON.stringify(jwt);
  const jName   = JSON.stringify(displayName);
  const jEmail  = JSON.stringify(email);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <style>
    html, body, #meet { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000; }
    #loading { position:absolute; inset:0; display:flex; flex-direction:column;
               align-items:center; justify-content:center; background:#1b7a43; color:#fff;
               font-family:sans-serif; font-size:16px; gap:12px; z-index:99; }
    #loading.hidden { display:none; }
    .spinner { width:40px; height:40px; border:4px solid rgba(255,255,255,.3);
               border-top-color:#fff; border-radius:50%; animation:spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
    <span>กำลังเชื่อมต่อห้องประชุม...</span>
  </div>
  <div id="meet"></div>
  <script src="https://${domain}/external_api.js" onerror="showError()"></script>
  <script>
    function showError() {
      document.getElementById('loading').innerHTML =
        '<span>ไม่สามารถเชื่อมต่อห้องประชุมได้</span>';
    }

    function notifyParent(name, data) {
      try {
        var msg = JSON.stringify({ name: name, data: data || {} });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(msg);
        } else {
          window.parent.postMessage(msg, '*');
        }
      } catch(e) {}
    }

    window.addEventListener('load', function() {
      if (typeof JitsiMeetExternalAPI === 'undefined') { showError(); return; }

      var api = new JitsiMeetExternalAPI(${jDomain}, {
        roomName:   ${jRoom},
        jwt:        ${jJwt},
        parentNode: document.getElementById('meet'),
        width:      '100%',
        height:     '100%',
        userInfo: {
          displayName: ${jName},
          email:       ${jEmail},
        },
        configOverwrite: {
          prejoinPageEnabled:      false,
          startWithAudioMuted:     true,
          startWithVideoMuted:     true,
          disableInviteFunctions:  true,
          enableWelcomePage:       false,
          disableDeepLinking:      true,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK:       false,
          SHOW_WATERMARK_FOR_GUESTS:  false,
          TOOLBAR_BUTTONS: [
            'microphone','camera','closedcaptions','desktop',
            'chat','raisehand','videoquality','filmstrip',
            'tileview','hangup',
          ],
        },
      });

      api.addEventListener('videoConferenceJoined', function() {
        document.getElementById('loading').classList.add('hidden');
        notifyParent('videoConferenceJoined');
      });

      api.addEventListener('readyToClose', function() {
        notifyParent('readyToClose');
      });

      api.addEventListener('errorOccurred', function(e) {
        notifyParent('errorOccurred', e);
      });
    });
  </script>
</body>
</html>`;
}
