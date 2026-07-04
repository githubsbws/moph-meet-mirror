import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, BackHandler, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { loadToken, loadUser } from '../../constants/storage';
import { apiFetch, MEETING_DOMAIN } from '../../constants/api';
import { buildJitsiEmbedHtml } from '../../constants/jitsiEmbed';
import { shouldAllowNavigation } from '../../constants/hostWhitelist';

// WebView is native-only — import only on native to avoid web crash
const WebView = Platform.OS !== 'web'
  ? require('react-native-webview').default
  : null;

const GREEN = '#1b7a43';

export default function MeetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const webViewRef = useRef<any>(null);
  const [embedHtml, setEmbedHtml] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const tok = await loadToken();
      const usr = await loadUser();
      if (!tok) { router.replace('/'); return; }

      try { await apiFetch(`/api/rooms/${id}/join`, tok, { method: 'POST' }); } catch (_) {}

      setEmbedHtml(buildJitsiEmbedHtml({
        domain:      MEETING_DOMAIN,
        room:        String(id),
        jwt:         tok,
        displayName: usr?.display || usr?.username || 'Guest',
        email:       usr?.providerIDProfile?.email || '',
      }));
    })();
  }, [id]);

  // Listen for readyToClose / videoConferenceJoined from Jitsi embed
  const handleMessage = (e: any) => {
    try {
      const data = typeof e.nativeEvent?.data === 'string'
        ? JSON.parse(e.nativeEvent.data)
        : (typeof e.data === 'string' ? JSON.parse(e.data) : e.data);
      if (data?.name === 'readyToClose') router.replace('/dashboard');
    } catch (_) {}
  };

  // Web: listen for postMessage from the srcdoc iframe
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const h = (e: MessageEvent) => handleMessage(e);
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);

  // Android hardware back
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/dashboard'); return true;
    });
    return () => handler.remove();
  }, []);

  if (!embedHtml) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadingText}>กำลังเชื่อมต่อห้องประชุม...</Text>
      </View>
    );
  }

  // Web: srcdoc iframe — Jitsi External API runs inside
  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1 }}>
        <iframe
          srcDoc={embedHtml}
          style={{ flex: 1, width: '100%', height: '100%', border: 'none' } as any}
          allow="camera; microphone; display-capture; fullscreen"
        />
      </View>
    );
  }

  // Native: WebView with inline HTML
  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webViewRef}
        source={{ html: embedHtml, baseUrl: `https://${MEETING_DOMAIN}` }}
        style={{ flex: 1 }}
        onMessage={handleMessage}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={shouldAllowNavigation}
        mediaCapturePermissionGrantType="grant"
        allowsBackForwardNavigationGestures={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  loadingText: { marginTop: 12, color: GREEN, fontSize: 15 },
});
