/**
 * Doctor exam control — parity with user-app-lite meet.html (doctor side).
 * Features: live queue, invite patient through MOPH Alert, call a selected patient, enter video.
 * APIs: GET /api/exam/:id/doctor · POST /api/exam/:id/invite · POST /api/exam/:id/call/:entryId
 */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, StatusBar, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { loadToken } from '../../constants/storage';
import { apiFetch } from '../../constants/api';
import { Icon } from '../../components/Icon';

const GREEN = '#1b7a43';
const POLL = 5000;

type QueueEntry = { key?: string; token?: string; invitationId?: string; patientName?: string; status?: string; joinedAt?: string };
type PatientInvitation = { id: string; patientName?: string; status?: string };
type Room = { id: string; name?: string; queue?: QueueEntry[]; patientInvitations?: PatientInvitation[]; currentPatientToken?: string | null };

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
  const [inviteResult, setInviteResult] = useState<{ invitationId: string; status?: 'sent' | 'failed' } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [patientCallOpen, setPatientCallOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [callingPatientId, setCallingPatientId] = useState<string | null>(null);
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
      Alert.alert('เรียกคิว', d.called ? `เรียก: ${d.called}\nรอผู้ป่วยกดเข้าห้องตรวจ` : 'ไม่มีผู้ป่วยในคิว');
      await fetchRoom(token);
    } catch (e: any) {
      Alert.alert('ผิดพลาด', e.message || 'network');
    } finally {
      setCalling(false);
    }
  }

  async function callPatient(invitation: PatientInvitation) {
    if (!token || callingPatientId) return;
    setCallingPatientId(invitation.id);
    try {
      const r = await apiFetch(`/api/exam/${id}/call/${encodeURIComponent(invitation.id)}`, token, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { Alert.alert('เรียกผู้ป่วยไม่สำเร็จ', d.message || `รหัส ${r.status}`); return; }
      setSelectedPatientId(invitation.id);
      Alert.alert('เรียกผู้ป่วยแล้ว', `เรียก: ${d.called || invitation.patientName || 'ผู้ป่วย'}\nรอผู้ป่วยกดเข้าห้องตรวจ`);
      await fetchRoom(token);
    } catch (e: any) {
      Alert.alert('ผิดพลาด', e.message || 'network');
    } finally {
      setCallingPatientId(null);
    }
  }

  function updateQueueStatus(entry: QueueEntry, status: 'cancelled' | 'no_show') {
    if (!token) return;
    const entryId = entry.invitationId || entry.key || entry.token;
    if (!entryId) return;
    Alert.alert(status === 'no_show' ? 'ไม่มาตามนัด' : 'ยกเลิกคิว', `ยืนยันการ${status === 'no_show' ? 'ระบุว่าไม่มาตามนัด' : 'ยกเลิกคิว'}?`, [
      { text: 'กลับ', style: 'cancel' },
      { text: 'ยืนยัน', style: 'destructive', onPress: async () => {
        const r = await apiFetch(`/api/exam/${id}/queue/${encodeURIComponent(entryId)}`, token, { method: 'PATCH', body: JSON.stringify({ status }) });
        if (!r.ok) { Alert.alert('เปลี่ยนสถานะไม่สำเร็จ', `รหัส ${r.status}`); return; }
        await fetchRoom(token);
      } },
    ]);
  }

  async function doInvite() {
    if (!token) return;
    if (!/^\d{13}$/.test(invCid.trim())) {
      Alert.alert('ข้อมูลไม่ครบ', 'กรุณากรอกเลขบัตรประชาชน 13 หลัก');
      return;
    }
    setInviting(true);
    try {
      const r = await apiFetch(`/api/exam/${id}/invite`, token, {
        method: 'POST',
        body: JSON.stringify({ displayName: invName.trim(), cid: invCid.trim() }),
      });
      if (!r.ok) { Alert.alert('เชิญผู้ป่วยไม่สำเร็จ', `รหัส ${r.status}`); return; }
      const d = await r.json();
      setInviteResult({ invitationId: d.invitationId, status: d.patientNotification?.status || 'failed' });
      await fetchRoom(token);
    } catch (e: any) {
      Alert.alert('ผิดพลาด', e.message || 'network');
    } finally {
      setInviting(false);
    }
  }

  async function retryMophAlert() {
    if (!token || !inviteResult) return;
    if (!/^\d{13}$/.test(invCid.trim())) {
      Alert.alert('ข้อมูลไม่ครบ', 'กรุณากรอกเลขบัตรประชาชน 13 หลักเดิมเพื่อส่งซ้ำ');
      return;
    }
    setInviting(true);
    try {
      const r = await apiFetch(`/api/exam/${id}/invitations/${encodeURIComponent(inviteResult.invitationId)}/notify`, token, {
        method: 'POST', body: JSON.stringify({ cid: invCid.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { Alert.alert('ส่ง MOPH Alert ซ้ำไม่สำเร็จ', d.message || `รหัส ${r.status}`); return; }
      setInviteResult({ invitationId: d.invitationId, status: d.patientNotification?.status || 'failed' });
    } catch (e: any) {
      Alert.alert('ผิดพลาด', e.message || 'network');
    } finally {
      setInviting(false);
    }
  }

  function resetInvite() {
    setInviteOpen(false); setInvName(''); setInvCid(''); setInviteResult(null);
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  const queue = room?.queue || [];
  const invitations = room?.patientInvitations || [];
  const waiting = queue.filter(q => q.status === 'waiting');
  const admitted = queue.find(q => q.status === 'admitted');
  const called = queue.find(q => q.status === 'called');
  const selectedPatient = invitations.find(invitation => invitation.id === selectedPatientId);

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
            <Icon name="video" size={18} color="#fff" />
            <Text style={s.btnText}>เข้าห้องวิดีโอ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setInviteOpen(true)}>
            <Icon name="invite" size={18} color={GREEN} />
            <Text style={s.btnOutlineText}>เชิญผู้ป่วย</Text>
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
        <TouchableOpacity style={[s.callBtn, (calling || waiting.length === 0 || !!called) && s.btnDis]} onPress={callNext} disabled={calling || waiting.length === 0 || !!called}>
          {calling ? <ActivityIndicator color="#fff" /> : (
            <>
              <Icon name="next" size={18} color="#fff" />
              <Text style={s.callText}> เรียกผู้ป่วยคนถัดไป ({waiting.length})</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={s.selectPatientBtn} onPress={() => setPatientCallOpen(true)}>
          <Text style={s.selectPatientText}>📞 เรียกผู้ป่วยตามนัด ({invitations.length})</Text>
        </TouchableOpacity>
        {selectedPatient && <Text style={s.patientCallNote}>เรียก “{selectedPatient.patientName || 'ผู้ป่วย'}” แล้ว — รอผู้ป่วยกดเข้าห้องตรวจ</Text>}

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
              <Text style={s.qTime}>{p.status === 'no_show' ? 'ไม่มาตามนัด' : p.status === 'cancelled' ? 'ยกเลิก' : (p.joinedAt ? new Date(p.joinedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '')}</Text>
              {p.status === 'waiting' && <TouchableOpacity onPress={() => updateQueueStatus(p, 'no_show')}><Text style={s.noShow}>ไม่มา</Text></TouchableOpacity>}
            </View>
          ))
        )}
      </ScrollView>

      {/* Invite modal */}
      <Modal visible={inviteOpen} transparent animationType="slide" onRequestClose={resetInvite}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>เชิญผู้ป่วย</Text>
            {!inviteResult ? (
              <>
                <TextInput style={s.input} value={invName} onChangeText={setInvName} placeholder="ชื่อผู้ป่วย (ถ้ามี)" placeholderTextColor="#9ca3af" />
                <TextInput style={s.input} value={invCid} onChangeText={setInvCid} placeholder="เลขบัตรประชาชน 13 หลัก *" placeholderTextColor="#9ca3af" keyboardType="number-pad" maxLength={13} />
                <View style={s.modalActions}>
                  <TouchableOpacity style={s.modalCancel} onPress={resetInvite}><Text style={s.modalCancelText}>ยกเลิก</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.modalOk, inviting && s.btnDis]} onPress={doInvite} disabled={inviting}>
                    {inviting ? <ActivityIndicator color="#fff" /> : <Text style={s.modalOkText}>ส่ง MOPH Alert</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={s.linkLabel}>{inviteResult.status === 'sent' ? '✅ ส่งลิงก์เข้าคิวให้ผู้ป่วยผ่าน MOPH Alert แล้ว' : '⚠️ ส่ง MOPH Alert ไม่สำเร็จ'}</Text>
                <View style={s.modalActions}>
                  <TouchableOpacity style={s.modalCancel} onPress={resetInvite}><Text style={s.modalCancelText}>ปิด</Text></TouchableOpacity>
                  {inviteResult.status !== 'sent' && <TouchableOpacity style={[s.modalOk, inviting && s.btnDis]} onPress={retryMophAlert} disabled={inviting}>
                    {inviting ? <ActivityIndicator color="#fff" /> : <Text style={s.modalOkText}>ส่งซ้ำ</Text>}
                  </TouchableOpacity>}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={patientCallOpen} transparent animationType="slide" onRequestClose={() => setPatientCallOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>📞 เรียกผู้ป่วยตามนัด</Text>
            <Text style={s.modalHint}>เรียกผู้ป่วยที่พร้อม แล้วผู้ป่วยจะกดเข้าห้องตรวจจากหน้ารอของตนเอง</Text>
            <ScrollView style={s.patientList}>
              {invitations.length === 0 && <Text style={s.empty}>ยังไม่มีผู้ป่วยนัดหมาย</Text>}
              {invitations.map(invitation => {
                const state = patientInvitationState(invitation, queue);
                const selected = invitation.id === selectedPatientId;
                return (
                  <View key={invitation.id} style={[s.patientRow, selected && s.patientRowSelected]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.patientName}>{invitation.patientName || 'ผู้ป่วย'}</Text>
                      <Text style={s.patientStatus}>{state.label}</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.patientCallButton, (!state.canCall || !!callingPatientId) && s.patientCallButtonDisabled]}
                      disabled={!state.canCall || !!callingPatientId}
                      onPress={() => callPatient(invitation)}
                    >
                      <Text style={[s.patientCallButtonText, (!state.canCall || !!callingPatientId) && s.patientCallButtonTextDisabled]}>{callingPatientId === invitation.id ? 'กำลังเรียก…' : state.label === 'กำลังเรียก' ? 'รอเข้าห้อง' : 'เรียกผู้ป่วย'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
            {selectedPatient && <Text style={s.patientCallNote}>เรียก “{selectedPatient.patientName || 'ผู้ป่วย'}” แล้ว — รอผู้ป่วยกดเข้าห้องตรวจ</Text>}
            <TouchableOpacity style={s.closeButton} onPress={() => setPatientCallOpen(false)}><Text style={s.closeButtonText}>ปิด</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function patientInvitationState(invitation: PatientInvitation, queue: QueueEntry[]) {
  const entry = queue.find(item => item.invitationId === invitation.id);
  const status = entry?.status || invitation.status || 'active';
  if (status === 'waiting' || status === 'joined') return { label: 'พร้อม', canCall: true };
  if (status === 'called') return { label: 'กำลังเรียก', canCall: false };
  if (status === 'admitted') return { label: 'กำลังตรวจ', canCall: false };
  if (status === 'done') return { label: 'ตรวจเสร็จ', canCall: false };
  if (status === 'cancelled') return { label: 'ยกเลิกแล้ว', canCall: false };
  if (status === 'no_show') return { label: 'ไม่มาตามนัด', canCall: false };
  // An invitation by itself is not proof that the patient has logged in.
  // Queue/waiting-room entry is the current reliable ready signal.
  return { label: 'ยังไม่เข้าห้องรอ', canCall: false };
}

const s = StyleSheet.create({
  bg:     { flex: 1, backgroundColor: '#f0faf4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: GREEN, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back:   { color: '#fff', fontSize: 14 },
  title:  { color: '#fff', fontWeight: '700', fontSize: 15, flex: 1, textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  btn:    { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnPrimary: { backgroundColor: GREEN },
  btnOutline: { borderWidth: 1, borderColor: GREEN, backgroundColor: '#fff' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnOutlineText: { color: GREEN, fontWeight: '700', fontSize: 14 },
  admitBox: { backgroundColor: '#f0fdf4', borderWidth: 2, borderColor: GREEN, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12 },
  admitLabel: { fontSize: 12, color: '#6b7280' },
  admitName: { fontSize: 18, fontWeight: '700', color: GREEN, marginTop: 2 },
  callBtn: { backgroundColor: GREEN, borderRadius: 10, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginBottom: 20 },
  selectPatientBtn: { borderWidth: 1, borderColor: GREEN, borderRadius: 10, backgroundColor: '#fff', paddingVertical: 13, alignItems: 'center', marginTop: -10, marginBottom: 10 },
  selectPatientText: { color: GREEN, fontWeight: '700', fontSize: 15 },
  patientCallNote: { color: '#64748b', fontSize: 12, lineHeight: 17, marginBottom: 14 },
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
  noShow: { color: '#b45309', fontSize: 11, fontWeight: '700' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1e293b', marginBottom: 14 },
  modalHint: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: -7, marginBottom: 10 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111', marginBottom: 10 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancel: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f1f5f9' },
  modalCancelText: { color: '#475569', fontWeight: '600' },
  modalOk: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center', backgroundColor: GREEN },
  modalOkText: { color: '#fff', fontWeight: '700' },
  linkLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  linkText: { fontSize: 13, color: GREEN, backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8, marginBottom: 4 },
  patientList: { maxHeight: 360 },
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderColor: '#f1f5f9' },
  patientRowSelected: { backgroundColor: '#f0fdf4', marginHorizontal: -8, paddingHorizontal: 8 },
  patientName: { color: '#1e293b', fontSize: 14, fontWeight: '600' },
  patientStatus: { color: '#64748b', fontSize: 12, marginTop: 2 },
  patientCallButton: { backgroundColor: GREEN, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 8 },
  patientCallButtonDisabled: { backgroundColor: '#e5e7eb' },
  patientCallButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  patientCallButtonTextDisabled: { color: '#94a3b8' },
  closeButton: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 12, marginTop: 10 },
  closeButtonText: { color: '#475569', fontWeight: '700' },
});
