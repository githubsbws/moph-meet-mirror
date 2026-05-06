import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, SafeAreaView,
  StatusBar, TouchableOpacity, BackHandler, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { loadToken, loadUser } from '../../constants/storage';
import { API_BASE, MEETING_DOMAIN } from '../../constants/api';
import { buildJitsiEmbedHtml } from '../../constants/jitsiEmbed';

const WebView = Platform.OS !== 'web'
  ? require('react-native-webview').default
  : null;

const GREEN = '#1b7a43';
const POLL_INTERVAL = 5000;

type QueueStatus = {
  roomName?: string;
  position?: number;
  total?: number;
  status?: 'waiting' | 'admitted';
  jwtToken?: string;
};

export default function QueueScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const [token, setToken]               = useState<string | null>(null);
  const [user, setUser]                 = useState<any>(null);
  const [queue, setQueue]               = useState<QueueStatus>({});
  const [admitted, setAdmitted]           = useState(false);
  const [jitsiHtml, setJitsiHtml]         = useState<string | null>(null);
  const [loadingJitsi, setLoadingJitsi]   = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const tok = await loadToken();
      const usr = await loadUser();
      if (!tok) { router.replace('/'); return; }
      setToken(tok);
      setUser(usr);
    })();
  }, []);

  // Start polling once we have a token
  useEffect(() => {
    if (!token || !id) return;
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, id]);

  // Android back
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleLeave(); return true;
    });
    return () => handler.remove();
  }, []);

  async function poll() {
    if (!token || !id) return;
    try {
      const r = await fetch(`${API_BASE}/api/exam/${id}/queue?jwt=${encodeURIComponent(token)}`);
      if (!r.ok) return;
      const d: QueueStatus = await r.json();
      setQueue(d);
      if (d.status === 'admitted' && !admitted) {
        setAdmitted(true);
        if (pollRef.current) clearInterval(pollRef.current);
        openJitsi(d.jwtToken || token);
      }
    } catch (_) {}
  }

  function openJitsi(jwtToken: string) {
    setLoadingJitsi(true);
    setJitsiHtml(buildJitsiEmbedHtml({
      domain:      MEETING_DOMAIN,
      room:        String(id),
      jwt:         jwtToken,
      displayName: user?.display || user?.username || 'Guest',
      email:       user?.providerIDProfile?.email || '',
    }));
  }

  function handleLeave() {
    if (pollRef.current) clearInterval(pollRef.current);
    router.replace('/dashboard');
  }

  // Listen for Jitsi postMessage (web) — readyToClose or videoConferenceJoined
  const handleMessage = (e: any) => {
    try {
      const data = typeof e.nativeEvent?.data === 'string'
        ? JSON.parse(e.nativeEvent.data)
        : (typeof e.data === 'string' ? JSON.parse(e.data) : e.data);
      if (data?.name === 'readyToClose') router.replace('/dashboard');
      if (data?.name === 'videoConferenceJoined') setLoadingJitsi(false);
    } catch (_) {}
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const h = (e: MessageEvent) => handleMessage(e);
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);

  // ── Jitsi embed (admitted) ────────────────────────────────────────────────
  if (jitsiHtml) {
    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1 }}>
          {loadingJitsi && (
            <View style={styles.jitsiLoader}>
              <ActivityIndicator size="large" color={GREEN} />
              <Text style={{ color: GREEN, marginTop: 8 }}>กำลังเชื่อมต่อห้องตรวจ...</Text>
            </View>
          )}
          <iframe
            srcDoc={jitsiHtml}
            style={{ flex: 1, width: '100%', height: '100%', border: 'none' } as any}
            allow="camera; microphone; display-capture; fullscreen"
          />
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor={GREEN} />
        {loadingJitsi && (
          <View style={styles.jitsiLoader}>
            <ActivityIndicator size="large" color={GREEN} />
            <Text style={{ color: GREEN, marginTop: 8 }}>กำลังเชื่อมต่อห้องตรวจ...</Text>
          </View>
        )}
        <WebView
          source={{ html: jitsiHtml, baseUrl: `https://${MEETING_DOMAIN}` }}
          style={{ flex: 1 }}
          onMessage={handleMessage}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          mediaCapturePermissionGrantType="grant"
        />
      </View>
    );
  }

  // ── Queue waiting view ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.bg}>
      <StatusBar barStyle="dark-content" backgroundColor="#f0faf4" />
      <View style={styles.queueCard}>
        <Text style={styles.logo}>🏥</Text>
        <Text style={styles.title}>คิวรอตรวจ</Text>
        <Text style={styles.roomName}>{queue.roomName || 'กำลังโหลด…'}</Text>

        {/* Queue number box */}
        <View style={styles.numBox}>
          <Text style={styles.numLabel}>ลำดับของคุณ</Text>
          <Text style={styles.numVal}>
            {admitted ? '✅' : (queue.position != null ? String(queue.position) : '—')}
          </Text>
          {queue.total != null && (
            <Text style={styles.numTotal}>จากทั้งหมด {queue.total} คน</Text>
          )}
        </View>

        {admitted ? (
          <View style={styles.admittedRow}>
            <ActivityIndicator color={GREEN} />
            <Text style={styles.admittedLabel}>ถึงคิวของคุณแล้ว! กำลังเข้าห้องตรวจ…</Text>
          </View>
        ) : (
          <View style={styles.waitRow}>
            <ActivityIndicator color={GREEN} />
            <Text style={styles.pollNote}>ระบบตรวจสอบคิวทุก 5 วินาที</Text>
          </View>
        )}

        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <Text style={styles.leaveText}>← ออกจากคิว</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg:            { flex: 1, backgroundColor: '#f0faf4', justifyContent: 'center', alignItems: 'center' },
  queueCard:     { backgroundColor: '#fff', borderRadius: 16, padding: 28, width: '88%', maxWidth: 380, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  logo:          { fontSize: 48, marginBottom: 8 },
  title:         { fontSize: 20, fontWeight: '700', color: GREEN, marginBottom: 4 },
  roomName:      { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  numBox:        { backgroundColor: '#f0fdf4', borderWidth: 2, borderColor: GREEN, borderRadius: 12, padding: 16, width: '100%', alignItems: 'center', marginBottom: 16 },
  numLabel:      { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  numVal:        { fontSize: 48, fontWeight: '800', color: GREEN, lineHeight: 56 },
  numTotal:      { fontSize: 13, color: '#6b7280', marginTop: 4 },
  waitRow:       { alignItems: 'center', gap: 6, marginBottom: 20 },
  pollNote:      { fontSize: 12, color: '#9ca3af' },
  admittedRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  admittedLabel: { fontSize: 14, fontWeight: '700', color: GREEN },
  leaveBtn:      { marginTop: 8 },
  leaveText:     { fontSize: 14, color: '#6b7280' },
  admittedBanner:{ backgroundColor: GREEN, paddingHorizontal: 16, paddingVertical: 10 },
  admittedText:  { color: '#fff', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  jitsiLoader:   { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
});
