/**
 * Doctor exam control — parity with user-app-lite meet.html (doctor side).
 * Features: live queue, invite patient (get link), call next patient, enter video.
 * APIs: GET /api/exam/:id/doctor · POST /api/exam/:id/invite · POST /api/exam/:id/next
 */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, StatusBar, Alert, ActivityIndicator, Modal, Share,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { loadToken } from '../../constants/storage';
import { apiFetch, API_BASE } from '../../constants/api';

const GREEN = '#1b7a43';
const POLL = 5000;

type QueueEntry = { key?: string; token?: string; patientName?: string; status?: string; joinedAt?: string };
type Room = { id: string; name?: string; queue?: QueueEntry[]; currentPatientToken?: string | null };

export default function DoctorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [room, setRoom]   = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  // invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState('');
  const [invCid, setInvCid]   = useState('');
  const [invLink, setInvLink] = useState('');
  const [inviting, setInviting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const tok = await loadToken();
      if (!tok) { router.replace('/'); return; }
      setToken(tok);
      await fetchRoom(tok);
      setLoading(false);
      pollRef.current = setInterval(() => fetchRoom(tok), POLL);
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  async function fetchRoom(tok: string) {
    try {
      const r = await apiFetch(`/api/exam/${id}/doctor`, tok);
      if (r.ok) setRoom(await r.json());
    } catch (_) {}
  }

  async function callNext() {
    if (!token || calling) return;
    setCalling(true);
    try {
      const r = await apiFetch(`/api/exam/${id}/next`, token, { method: 'POST' });
      const d = await r.json();
      Alert.alert('เรียกคิว', d.admitted ? `เรียก: ${d.admitted}` : 'ไม่มีผู้ป่วยในคิว');
      await fetchRoom(token);
    } catch (e: any) {
      Alert.alert('ผิดพลาด', e.message || 'network');
    } finally {
      setCalling(false);
    }
  }

  async function doInvite() {
    if (!token) return;
    setInviting(true);
    try {
      const r = await apiFetch(`/api/exam/${id}/invite`, token, {
        method: 'POST',
        body: JSON.stringify({ displayName: invName.trim(), cid: invCid.trim() }),
      });
      if (!r.ok) { Alert.alert('สร้างลิงก์ไม่สำเร็จ', `รหัส ${r.status}`); return; }
      const d = await r.json();
      const link = d.patientJoinUrl?.startsWith('http') ? d.patientJoinUrl : `${API_BASE}${d.patientJoinUrl}`;
      setInvLink(link);
      await fetchRoom(token);
    } catch (e: any) {
      Alert.alert('ผิดพลาด', e.message || 'network');
    } finally {
      setInviting(false);
    }
  }

  function shareLink() {
    if (invLink) Share.share({ message: `ลิงก์เข้าคิวตรวจ MOPH Meet:\n${invLink}` }).catch(() => {});
  }

  function resetInvite() {
    setInviteOpen(false); setInvName(''); setInvCid(''); setInvLink('');
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  const queue = room?.queue || [];
  const waiting = queue.filter(q => q.status === 'waiting');
  const admitted = queue.find(q => q.status === 'admitted');

  return (
    <SafeAreaView style={s.bg}>
      <StatusBar barStyle="light-content" backgroundColor={GREEN} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← กลับ</Text></TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>🏥 {room?.name || 'ห้องตรวจ'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Actions */}
        <View style={s.actionRow}>
          <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => router.push(`/meet/${id}`)}>
            <Text style={s.btnText}>🎥 เข้าห้องวิดีโอ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setInviteOpen(true)}>
            <Text style={s.btnOutlineText}>➕ เชิญผู้ป่วย</Text>
          </TouchableOpacity>
        </View>

        {/* Current patient */}
        {admitted && (
          <View style={s.admitBox}>
            <Text style={s.admitLabel}>กำลังตรวจ</Text>
            <Text style={s.admitName}>{admitted.patientName || 'ผู้ป่วย'}</Text>
          </View>
        )}

        {/* Call next */}
        <TouchableOpacity style={[s.callBtn, (calling || waiting.length === 0) && s.btnDis]} onPress={callNext} disabled={calling || waiting.length === 0}>
          {calling ? <ActivityIndicator color="#fff" /> : <Text style={s.callText}>▶ เรียกผู้ป่วยคนถัดไป ({waiting.length})</Text>}
        </TouchableOpacity>

        {/* Queue */}
        <Text style={s.section}>คิวผู้ป่วย ({queue.length})</Text>
        {queue.length === 0 ? (
          <Text style={s.empty}>ยังไม่มีผู้ป่วยในคิว</Text>
        ) : (
          queue.map((p, i) => (
            <View key={(p.key || p.token || i).toString()} style={s.qRow}>
              <View style={[s.qBadge, p.status === 'admitted' ? s.qBadgeActive : p.status === 'done' ? s.qBadgeDone : s.qBadgeWait]}>
                <Text style={s.qBadgeText}>
                  {p.status === 'admitted' ? 'ตรวจ' : p.status === 'done' ? 'เสร็จ' : `#${i + 1}`}
                </Text>
              </View>
              <Text style={s.qName}>{p.patientName || 'ผู้ป่วย'}</Text>
              <Text style={s.qTime}>{p.joinedAt ? new Date(p.joinedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Invite modal */}
      <Modal visible={inviteOpen} transparent animationType="slide" onRequestClose={resetInvite}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>เชิญผู้ป่วย</Text>
            {!invLink ? (
              <>
                <TextInput style={s.input} value={invName} onChangeText={setInvName} placeholder="ชื่อผู้ป่วย (ถ้ามี)" placeholderTextColor="#9ca3af" />
                <TextInput style={s.input} value={invCid} onChangeText={setInvCid} placeholder="เลขบัตร ปชช. (ถ้ามี)" placeholderTextColor="#9ca3af" keyboardType="number-pad" />
                <View style={s.modalActions}>
                  <TouchableOpacity style={s.modalCancel} onPress={resetInvite}><Text style={s.modalCancelText}>ยกเลิก</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.modalOk, inviting && s.btnDis]} onPress={doInvite} disabled={inviting}>
                    {inviting ? <ActivityIndicator color="#fff" /> : <Text style={s.modalOkText}>สร้างลิงก์</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={s.linkLabel}>ลิงก์สำหรับผู้ป่วย:</Text>
                <Text style={s.linkText} selectable>{invLink}</Text>
                <View style={s.modalActions}>
                  <TouchableOpacity style={s.modalCancel} onPress={resetInvite}><Text style={s.modalCancelText}>ปิด</Text></TouchableOpacity>
                  <TouchableOpacity style={s.modalOk} onPress={shareLink}><Text style={s.modalOkText}>📤 แชร์ลิงก์</Text></TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bg:     { flex: 1, backgroundColor: '#f0faf4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: GREEN, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back:   { color: '#fff', fontSize: 14 },
  title:  { color: '#fff', fontWeight: '700', fontSize: 15, flex: 1, textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  btn:    { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: GREEN },
  btnOutline: { borderWidth: 1, borderColor: GREEN, backgroundColor: '#fff' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnOutlineText: { color: GREEN, fontWeight: '700', fontSize: 14 },
  admitBox: { backgroundColor: '#f0fdf4', borderWidth: 2, borderColor: GREEN, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12 },
  admitLabel: { fontSize: 12, color: '#6b7280' },
  admitName: { fontSize: 18, fontWeight: '700', color: GREEN, marginTop: 2 },
  callBtn: { backgroundColor: GREEN, borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginBottom: 20 },
  btnDis: { opacity: 0.5 },
  callText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  section: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  empty:  { color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  qRow:   { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  qBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, minWidth: 44, alignItems: 'center' },
  qBadgeWait: { backgroundColor: '#e5e7eb' },
  qBadgeActive: { backgroundColor: GREEN },
  qBadgeDone: { backgroundColor: '#cbd5e1' },
  qBadgeText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  qName:  { flex: 1, fontSize: 14, color: '#1e293b' },
  qTime:  { fontSize: 11, color: '#9ca3af' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1e293b', marginBottom: 14 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111', marginBottom: 10 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancel: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f1f5f9' },
  modalCancelText: { color: '#475569', fontWeight: '600' },
  modalOk: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center', backgroundColor: GREEN },
  modalOkText: { color: '#fff', fontWeight: '700' },
  linkLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  linkText: { fontSize: 13, color: GREEN, backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8, marginBottom: 4 },
});
