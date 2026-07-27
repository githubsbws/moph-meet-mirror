import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, BackHandler, Platform, Modal, TextInput, TouchableOpacity, ScrollView, Alert, Share } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { loadToken, loadUser } from '../../constants/storage';
import { apiFetch, API_BASE, MEETING_DOMAIN } from '../../constants/api';
import { buildJitsiEmbedHtml } from '../../constants/jitsiEmbed';
import { shouldAllowNavigation } from '../../constants/hostWhitelist';

// WebView is native-only — import only on native to avoid web crash
const WebView = Platform.OS !== 'web'
  ? require('react-native-webview').default
  : null;

const GREEN = '#1b7a43';

type WaitingParticipant = { id: string; displayName?: string; status: 'active' | 'waiting' | 'approved' | 'rejected' | 'revoked' };

export default function MeetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const webViewRef = useRef<any>(null);
  const [embedHtml, setEmbedHtml] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [showWaitingRoom, setShowWaitingRoom] = useState(false);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [waitingPeople, setWaitingPeople] = useState<WaitingParticipant[]>([]);
  const [guestName, setGuestName] = useState('');
  const [waitingLoading, setWaitingLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const tok = await loadToken();
      const usr = await loadUser();
      if (!tok) { router.replace('/'); return; }
      setToken(tok);

      try {
        const roomResponse = await apiFetch(`/api/rooms/${id}`, tok);
        if (!roomResponse.ok) { router.replace('/dashboard'); return; }
        const room = await roomResponse.json();
        const isManager = room.ownerId === usr?.username || Boolean(usr?.roles?.includes('admin')) ||
          Boolean((room.invitedProviders || []).some((invite: any) => invite.providerId === usr?.username && invite.status === 'accepted'));
        setShowWaitingRoom(room.type === 'meet' && room.accessMode === 'public' && isManager);
      } catch (_) { router.replace('/dashboard'); return; }

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

  async function loadWaitingPeople() {
    if (!token) return;
    setWaitingLoading(true);
    try {
      const response = await apiFetch(`/api/rooms/${id}/waiting-room/participants`, token);
      if (!response.ok) throw new Error('loadFailed');
      const data = await response.json();
      setWaitingPeople(data.participants || []);
    } catch (_) {
      Alert.alert('โหลดห้องรอไม่สำเร็จ', 'โปรดลองอีกครั้ง');
    } finally {
      setWaitingLoading(false);
    }
  }

  async function openWaitingRoom() {
    setWaitingOpen(true);
    await loadWaitingPeople();
  }

  async function createWaitingInvitation() {
    if (!token) return;
    const displayName = guestName.trim() || 'ผู้เข้าร่วม';
    setWaitingLoading(true);
    try {
      const response = await apiFetch(`/api/rooms/${id}/meeting-invitations`, token, {
        method: 'POST', body: JSON.stringify({ displayName }),
      });
      if (!response.ok) throw new Error('createFailed');
      const data = await response.json();
      const link = data.waitingRoomUrl?.startsWith('http') ? data.waitingRoomUrl : `${API_BASE}${data.waitingRoomUrl}`;
      setGuestName('');
      await Share.share({ message: `ลิงก์เข้าห้องรอ MOPH Meet:\n${link}` });
      await loadWaitingPeople();
    } catch (_) {
      Alert.alert('สร้างลิงก์ไม่สำเร็จ', 'โปรดลองอีกครั้ง');
    } finally {
      setWaitingLoading(false);
    }
  }

  async function updateWaitingPerson(invitationId: string, status: 'approved' | 'rejected') {
    if (!token) return;
    setWaitingLoading(true);
    try {
      const response = await apiFetch(`/api/rooms/${id}/waiting-room/${encodeURIComponent(invitationId)}`, token, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('updateFailed');
      await loadWaitingPeople();
    } catch (_) {
      Alert.alert('เปลี่ยนสถานะไม่สำเร็จ', 'โปรดลองอีกครั้ง');
    } finally {
      setWaitingLoading(false);
    }
  }

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
        {showWaitingRoom && <TouchableOpacity style={styles.waitingButton} onPress={openWaitingRoom}><Text style={styles.waitingButtonText}>👥 ห้องรอ</Text></TouchableOpacity>}
        <iframe
          srcDoc={embedHtml}
          style={{ flex: 1, width: '100%', height: '100%', border: 'none' } as any}
          allow="camera; microphone; display-capture; fullscreen"
        />
        <WaitingRoomModal />
      </View>
    );
  }

  // Native: WebView with inline HTML
  return (
    <View style={{ flex: 1 }}>
      {showWaitingRoom && <TouchableOpacity style={styles.waitingButton} onPress={openWaitingRoom}><Text style={styles.waitingButtonText}>👥 ห้องรอ</Text></TouchableOpacity>}
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
      <WaitingRoomModal />
    </View>
  );

  function WaitingRoomModal() {
    return (
      <Modal visible={waitingOpen} transparent animationType="slide" onRequestClose={() => setWaitingOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>👥 ห้องรอผู้เข้าร่วม</Text>
            <Text style={styles.modalHint}>สร้างลิงก์เฉพาะผู้รับ แล้วอนุมัติเมื่อเข้ามารอ</Text>
            <View style={styles.inviteRow}>
              <TextInput value={guestName} onChangeText={setGuestName} placeholder="ชื่อผู้รับลิงก์" placeholderTextColor="#94a3b8" style={styles.input} editable={!waitingLoading} />
              <TouchableOpacity style={[styles.inviteButton, waitingLoading && styles.disabled]} onPress={createWaitingInvitation} disabled={waitingLoading}>
                <Text style={styles.inviteButtonText}>สร้างลิงก์</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.waitingHeading}><Text style={styles.modalHint}>ผู้เข้าร่วม</Text><TouchableOpacity onPress={loadWaitingPeople}><Text style={styles.refresh}>โหลดใหม่</Text></TouchableOpacity></View>
            {waitingLoading ? <ActivityIndicator color={GREEN} style={{ margin: 16 }} /> : (
              <ScrollView style={styles.peopleList}>
                {waitingPeople.length === 0 && <Text style={styles.empty}>ยังไม่มีผู้เข้าร่วม</Text>}
                {waitingPeople.map(person => (
                  <View key={person.id} style={styles.personRow}>
                    <View style={{ flex: 1 }}><Text style={styles.personName}>{person.displayName || 'ผู้เข้าร่วม'}</Text><Text style={styles.personStatus}>{waitingLabel(person.status)}</Text></View>
                    {person.status === 'waiting' && <View style={styles.decisionRow}>
                      <TouchableOpacity style={styles.approve} onPress={() => updateWaitingPerson(person.id, 'approved')}><Text style={styles.decisionText}>อนุมัติ</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.reject} onPress={() => updateWaitingPerson(person.id, 'rejected')}><Text style={styles.rejectText}>ปฏิเสธ</Text></TouchableOpacity>
                    </View>}
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.closeButton} onPress={() => setWaitingOpen(false)}><Text style={styles.closeButtonText}>ปิด</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }
}

function waitingLabel(status: WaitingParticipant['status']) {
  return ({ active: 'ยังไม่เปิดลิงก์', waiting: 'กำลังรอ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธแล้ว', revoked: 'ยกเลิกแล้ว' })[status];
}

const styles = StyleSheet.create({
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  loadingText: { marginTop: 12, color: GREEN, fontSize: 15 },
  waitingButton: { position: 'absolute', zIndex: 10, right: 14, top: Platform.OS === 'web' ? 14 : 48, backgroundColor: '#fff', borderWidth: 1, borderColor: GREEN, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, elevation: 3 },
  waitingButtonText: { color: GREEN, fontWeight: '700', fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, maxHeight: '82%' },
  modalTitle: { color: '#1e293b', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalHint: { color: '#64748b', fontSize: 12, marginBottom: 10 },
  inviteRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, color: '#111' },
  inviteButton: { backgroundColor: GREEN, borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' },
  inviteButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  waitingHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refresh: { color: GREEN, fontWeight: '700', fontSize: 12 },
  peopleList: { maxHeight: 280 },
  empty: { color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
  personRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: '#f1f5f9', paddingVertical: 10 },
  personName: { color: '#1e293b', fontSize: 14, fontWeight: '600' },
  personStatus: { color: '#64748b', fontSize: 12, marginTop: 2 },
  decisionRow: { flexDirection: 'row', gap: 6 },
  approve: { backgroundColor: GREEN, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 },
  reject: { borderWidth: 1, borderColor: '#dc2626', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 },
  decisionText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rejectText: { color: '#dc2626', fontSize: 11, fontWeight: '700' },
  closeButton: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 12, marginTop: 12 },
  closeButtonText: { color: '#475569', fontWeight: '700' },
  disabled: { opacity: .55 },
});
