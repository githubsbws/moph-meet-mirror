/**
 * Usage statistics — parity with user-app-lite /usage-logs (TOR 4.12).
 * Read-only; /api/logs/* endpoints are public (PII-safe aggregates).
 */
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView, StatusBar,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { API_BASE } from '../constants/api';

const GREEN = '#1b7a43';

async function getJSON(path: string) {
  try { const r = await fetch(`${API_BASE}${path}`); return r.ok ? await r.json() : null; }
  catch { return null; }
}

export default function StatsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [platform, setPlatform] = useState<any[]>([]);
  const [region, setRegion] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [longest, setLongest] = useState<any[]>([]);

  async function loadAll() {
    const [s, p, rg, u, l] = await Promise.all([
      getJSON('/api/logs/summary'),
      getJSON('/api/logs/by-platform'),
      getJSON('/api/logs/by-region'),
      getJSON('/api/logs/by-unit?limit=5'),
      getJSON('/api/logs/longest-rooms?limit=5'),
    ]);
    setSummary(s); setPlatform(p || []); setRegion(rg || []); setUnits(u || []); setLongest(l || []);
  }

  useEffect(() => { loadAll().finally(() => setLoading(false)); }, []);

  async function onRefresh() { setRefreshing(true); await loadAll(); setRefreshing(false); }

  function fmtDur(sec?: number) {
    if (!sec) return '-';
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m} นาที ${s} วิ` : `${s} วิ`;
  }

  if (loading) return <View style={st.center}><ActivityIndicator size="large" color={GREEN} /></View>;

  return (
    <SafeAreaView style={st.bg}>
      <StatusBar barStyle="light-content" backgroundColor={GREEN} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={st.back}>← กลับ</Text></TouchableOpacity>
        <Text style={st.title}>📊 สถิติการใช้งาน</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}>
        {/* Summary */}
        {summary && (
          <View style={st.statGrid}>
            <Stat label="ห้องทั้งหมด" value={summary.rooms} />
            <Stat label="ผู้ป่วยเข้าคิว" value={summary.patients} />
            <Stat label="ตรวจแล้ว" value={summary.admitted} />
            <Stat label="แพทย์" value={summary.doctors} />
            <Stat label="วันนี้" value={summary.today} />
            <Stat label="เดือนนี้" value={summary.thisMonth} />
          </View>
        )}

        {/* Platform */}
        <Section title="แพลตฟอร์ม (Mobile vs Web)">
          {platform.length === 0 ? <Empty /> : platform.map((p, i) => (
            <Row key={i} left={p.platform === 'mobile' ? '📱 Mobile' : '💻 Web'} right={`${p.total} ครั้ง`} />
          ))}
        </Section>

        {/* Region */}
        <Section title="ตามเขตสุขภาพ">
          {region.length === 0 ? <Empty /> : region.map((r, i) => (
            <Row key={i} left={r.region != null ? `เขต ${r.region}` : 'ไม่ระบุ'} right={`${r.total} ครั้ง`} />
          ))}
        </Section>

        {/* Top units */}
        <Section title="หน่วยบริการใช้สูงสุด (Top 5)">
          {units.length === 0 ? <Empty /> : units.map((u, i) => (
            <Row key={i} left={`${i + 1}. ${u.unit_hcode || 'ไม่ระบุ'}${u.province ? ' · ' + u.province : ''}`} right={`${u.rooms} ห้อง`} />
          ))}
        </Section>

        {/* Longest rooms */}
        <Section title="ห้องที่สนทนานานที่สุด (Top 5)">
          {longest.length === 0 ? <Empty /> : longest.map((r, i) => (
            <Row key={i} left={`${i + 1}. ${r.room_type === 'exam' ? 'ตรวจ' : 'ประชุม'} ${r.room_ref || ''}`} right={fmtDur(r.duration_sec)} />
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const Stat = ({ label, value }: { label: string; value?: number }) => (
  <View style={st.statCard}><Text style={st.statVal}>{value ?? 0}</Text><Text style={st.statLabel}>{label}</Text></View>
);
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={st.section}><Text style={st.sectionTitle}>{title}</Text>{children}</View>
);
const Row = ({ left, right }: { left: string; right: string }) => (
  <View style={st.row}><Text style={st.rowLeft}>{left}</Text><Text style={st.rowRight}>{right}</Text></View>
);
const Empty = () => <Text style={st.empty}>ยังไม่มีข้อมูล</Text>;

const st = StyleSheet.create({
  bg:     { flex: 1, backgroundColor: '#f0faf4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: GREEN, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back:   { color: '#fff', fontSize: 14 },
  title:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  scroll: { padding: 16, paddingBottom: 40 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCard: { width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statVal:  { fontSize: 26, fontWeight: '800', color: GREEN },
  statLabel:{ fontSize: 12, color: '#6b7280', marginTop: 4 },
  section:  { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 10 },
  row:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowLeft:{ fontSize: 13, color: '#334155', flex: 1 },
  rowRight:{ fontSize: 13, color: GREEN, fontWeight: '600' },
  empty:  { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },
});
