import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Alert, RefreshControl,
  StatusBar, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { loadToken, loadUser, clearAuth } from '../constants/storage';
import { apiFetch, API_BASE, MEETING_DOMAIN } from '../constants/api';
import MiniCalendar from '../components/MiniCalendar';

const GREEN = '#1b7a43';

type Meet = {
  id: string;
  name?: string;
  title?: string;
  type: string;
  starttime?: string;
  endtime?: string;
  status?: string;
};

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}
function formatTime(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export default function DashboardScreen() {
  const [user, setUser]       = useState<any>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [meets, setMeets]     = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const tok = await loadToken();
        const usr = await loadUser();
        if (!tok) { router.replace('/'); return; }
        setToken(tok);
        setUser(usr);
        await fetchMeets(tok);
      } catch {
        router.replace('/');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function fetchMeets(tok: string) {
    try {
      const r = await apiFetch('/api/meets', tok);
      if (r.status === 401) { await handleLogout(); return; }
      if (r.ok) setMeets(await r.json());
    } catch (_) {}
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (token) await fetchMeets(token);
    setRefreshing(false);
  }, [token]);

  async function handleLogout() {
    if (token) {
      apiFetch('/api/logout', token, { method: 'POST' }).catch(() => {});
    }
    await clearAuth();
    router.replace('/');
  }

  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  async function createRoom(type: 'exam' | 'meet') {
    if (!token || creating) return;
    setCreating(true);
    try {
      const r = await apiFetch('/api/rooms', token, {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      if (r.status === 401) { await handleLogout(); return; }
      if (!r.ok) { Alert.alert('สร้างห้องไม่สำเร็จ', `รหัส ${r.status}`); return; }
      const d = await r.json();
      const roomId = d.room?.id;
      if (!roomId) { Alert.alert('สร้างห้องไม่สำเร็จ', 'ไม่ได้รับรหัสห้อง'); return; }
      if (type === 'exam' && d.patientJoinUrl) {
        const link = d.patientJoinUrl.startsWith('http') ? d.patientJoinUrl : `${API_BASE}${d.patientJoinUrl}`;
        Alert.alert(
          'สร้างห้องตรวจแล้ว',
          `ลิงก์สำหรับผู้ป่วย:\n${link}`,
          [{ text: 'เข้าห้องตรวจ', onPress: () => router.push(`/doctor/${roomId}`) }]
        );
      } else {
        router.push(`/meet/${roomId}`);
      }
    } catch (e: any) {
      Alert.alert('เกิดข้อผิดพลาด', e.message || 'network');
    } finally {
      setCreating(false);
    }
  }

  function joinRoom(meet: Meet) {
    if (meet.type === 'exam') {
      router.push(`/doctor/${meet.id}`);
    } else {
      router.push(`/meet/${meet.id}`);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  const org = user?.organization?.[0] || {};
  const pid = user?.providerIDProfile || {};
  const initials = ((user?.display || user?.username || 'U')[0]).toUpperCase();

  const upcoming = meets.filter(m => m.status !== 'ended');
  const past     = meets.filter(m => m.status === 'ended');
  const markedDates = new Set(meets.map(m => (m.starttime ? m.starttime.slice(0, 10) : '')).filter(Boolean));
  const q = search.trim().toLowerCase();
  const filteredUpcoming = upcoming.filter(m => {
    if (q && !(m.name || m.title || m.id || '').toLowerCase().includes(q)) return false;
    if (selectedDate && (m.starttime || '').slice(0, 10) !== selectedDate) return false;
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={GREEN} />

      {/* Navbar */}
      <View style={styles.navbar}>
        <Text style={styles.navTitle}>MOPH Meet</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>ออกจากระบบ</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
      >
        {/* User card */}
        <View style={styles.card}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName}>
                  {pid.title_th || ''} {user?.display || user?.username || 'ผู้ใช้'}
                </Text>
              </View>
              {(org.position || org.hname_th) && (
                <Text style={styles.orgText}>
                  {[org.position, org.hname_th].filter(Boolean).join(' · ')}
                </Text>
              )}
              {(pid.email || org.email) && (
                <Text style={styles.detailText}>✉ {pid.email || org.email}</Text>
              )}
            </View>
          </View>
          {/* hcode / clinic chips (parity with web Data Hub) */}
          {(user?.hcode5 || user?.hcode9 || user?.clinicCode || user?.gender || user?.dateOfBirth) && (
            <View style={styles.chipsRow}>
              {user?.hcode5 ? <Text style={styles.chip}>🏥 HCode5: {user.hcode5}</Text> : null}
              {user?.hcode9 ? <Text style={styles.chip}>🏥 HCode9: {user.hcode9}</Text> : null}
              {user?.clinicCode ? <Text style={styles.chip}>🩺 Clinic: {user.clinicCode}</Text> : null}
              {user?.gender ? <Text style={styles.chip}>🧑 {user.gender}</Text> : null}
              {user?.dateOfBirth ? <Text style={styles.chip}>🎂 {user.dateOfBirth}</Text> : null}
            </View>
          )}
          <TouchableOpacity style={styles.editProfileBtn} onPress={() => router.push('/profile')}>
            <Text style={styles.editProfileText}>✏️ แก้ไขข้อมูลเพิ่มเติม</Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>เริ่มใช้งาน</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionPrimary, creating && styles.actionDisabled]}
              onPress={() => createRoom('exam')}
              disabled={creating}
            >
              <Text style={styles.actionIcon}>🏥</Text>
              <Text style={styles.actionLabel}>สร้างห้องตรวจ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionPrimary, creating && styles.actionDisabled]}
              onPress={() => createRoom('meet')}
              disabled={creating}
            >
              <Text style={styles.actionIcon}>🖥️</Text>
              <Text style={styles.actionLabel}>สร้างห้องประชุม</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={() => router.push('/devices')}>
              <Text style={styles.actionIcon}>🩺</Text>
              <Text style={styles.actionLabelDark}>บันทึกสัญญาณชีพ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={() => router.push('/devices')}>
              <Text style={styles.actionIcon}>📡</Text>
              <Text style={styles.actionLabelDark}>อุปกรณ์การแพทย์</Text>
            </TouchableOpacity>
          </View>
          {creating && (
            <View style={styles.creatingRow}>
              <ActivityIndicator color={GREEN} size="small" />
              <Text style={styles.creatingText}>กำลังสร้างห้อง…</Text>
            </View>
          )}
        </View>

        {/* Calendar */}
        <View style={styles.calCard}>
          <Text style={styles.calTitle}>📅 ปฏิทินนัดหมาย</Text>
          <MiniCalendar marked={markedDates} selected={selectedDate} onSelect={setSelectedDate} />
        </View>

        {/* Upcoming meets */}
        <Text style={styles.sectionTitle}>นัดหมายที่กำลังจะถึง</Text>
        {upcoming.length > 0 && (
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="🔍 ค้นหานัดหมาย…"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
          />
        )}
        {filteredUpcoming.length === 0 ? (
          <Text style={styles.emptyText}>{q || selectedDate ? 'ไม่พบนัดหมายตามเงื่อนไข' : 'ยังไม่มีนัดหมาย'}</Text>
        ) : (
          filteredUpcoming.map(meet => (
            <View key={meet.id} style={styles.meetCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.meetName}>{meet.name || meet.title || meet.id}</Text>
                {meet.starttime && (
                  <Text style={styles.meetTime}>
                    📅 {formatDate(meet.starttime)}  🕐 {formatTime(meet.starttime)}
                  </Text>
                )}
                <View style={styles.typeBadge}>
                  <Text style={styles.typeText}>
                    {meet.type === 'exam' ? '🏥 ห้องตรวจ' : '🖥️ ห้องประชุม'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.joinBtn} onPress={() => joinRoom(meet)}>
                <Text style={styles.joinText}>เข้าร่วม</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Past meets */}
        {past.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 8 }]}>ประวัติการประชุม</Text>
            {past.map(meet => (
              <View key={meet.id} style={[styles.meetCard, styles.meetCardPast]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.meetName, { color: '#6b7280' }]}>{meet.name || meet.title || meet.id}</Text>
                  {meet.starttime && (
                    <Text style={styles.meetTime}>📅 {formatDate(meet.starttime)}</Text>
                  )}
                </View>
                <Text style={styles.pastLabel}>สิ้นสุดแล้ว</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0faf4' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navbar: {
    backgroundColor: GREEN, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  navTitle:   { color: '#fff', fontWeight: '700', fontSize: 18, flex: 1 },
  logoutBtn:  { borderWidth: 1, borderColor: 'rgba(255,255,255,.6)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  logoutText: { color: '#fff', fontSize: 13 },
  scroll: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  userRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar:     { width: 52, height: 52, borderRadius: 26, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  nameRow:    { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 2 },
  displayName:{ fontWeight: '700', fontSize: 16, color: '#1e293b' },
  badge:      { backgroundColor: '#d1fae5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:  { color: GREEN, fontSize: 11, fontWeight: '600' },
  orgText:    { fontSize: 13, color: '#64748b', marginBottom: 2 },
  detailText: { fontSize: 12, color: '#9ca3af' },
  chipsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip:       { fontSize: 11, color: '#475569', backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  editProfileBtn: { marginTop: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: GREEN, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editProfileText: { color: GREEN, fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  calCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  calTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 10 },
  actionsCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  actionsTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: GREEN },
  actionSecondary: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  actionDisabled: { opacity: 0.6 },
  actionIcon: { fontSize: 24, marginBottom: 4 },
  actionLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionLabelDark: { color: GREEN, fontWeight: '600', fontSize: 13 },
  creatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  creatingText: { color: GREEN, fontSize: 13 },
  emptyText:  { fontSize: 14, color: '#9ca3af', marginBottom: 16 },
  searchInput:{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111', marginBottom: 10 },
  meetCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  meetCardPast: { opacity: 0.7 },
  meetName:   { fontWeight: '600', fontSize: 15, color: '#1e293b', marginBottom: 4 },
  meetTime:   { fontSize: 12, color: '#64748b', marginBottom: 4 },
  typeBadge:  { alignSelf: 'flex-start' },
  typeText:   { fontSize: 11, color: '#64748b' },
  joinBtn:    { backgroundColor: GREEN, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginLeft: 8 },
  joinText:   { color: '#fff', fontWeight: '600', fontSize: 13 },
  pastLabel:  { fontSize: 12, color: '#9ca3af', marginLeft: 8 },
});
