/**
 * Vital Signs Entry Screen — TOR 4.10.5
 * Manual entry for 8 vital types + NST. Sends to POST /api/vitals/batch
 * BLE auto-read is handled by app/devices.tsx (T5).
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, SafeAreaView, StatusBar,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { loadToken } from '../../constants/storage';
import { API_BASE } from '../../constants/api';

const GREEN = '#1b7a43';

type VitalField = {
  key: string; label: string; unit: string; deviceType: string;
  placeholder: string; keyboard: 'decimal-pad' | 'numeric';
};

const VITAL_FIELDS: VitalField[] = [
  { key: 'weight',  label: 'น้ำหนัก',          unit: 'kg',    deviceType: 'scale',          placeholder: '65.5',  keyboard: 'decimal-pad' },
  { key: 'height',  label: 'ส่วนสูง',           unit: 'cm',    deviceType: 'scale',          placeholder: '170',   keyboard: 'decimal-pad' },
  { key: 'temp',    label: 'อุณหภูมิ',          unit: '°C',    deviceType: 'thermometer',    placeholder: '37.0',  keyboard: 'decimal-pad' },
  { key: 'spo2',    label: 'SpO₂',             unit: '%',     deviceType: 'pulseOximeter',  placeholder: '98',    keyboard: 'decimal-pad' },
  { key: 'sys',     label: 'ความดัน SYS',      unit: 'mmHg',  deviceType: 'bloodPressure',  placeholder: '120',   keyboard: 'numeric' },
  { key: 'dia',     label: 'ความดัน DIA',      unit: 'mmHg',  deviceType: 'bloodPressure',  placeholder: '80',    keyboard: 'numeric' },
  { key: 'map',     label: 'MAP',               unit: 'mmHg',  deviceType: 'bloodPressure',  placeholder: '90',    keyboard: 'numeric' },
  { key: 'pr',      label: 'ชีพจร Pulse',       unit: '/min',  deviceType: 'pulseOximeter',  placeholder: '72',    keyboard: 'numeric' },
  { key: 'rr',      label: 'การหายใจ RR',       unit: '/min',  deviceType: 'manual',         placeholder: '16',    keyboard: 'numeric' },
  { key: 'glucose', label: 'น้ำตาล Glucose',   unit: 'mg/dL', deviceType: 'bgm',            placeholder: '90',    keyboard: 'numeric' },
  { key: 'fhr',     label: 'NST FHR',           unit: 'bpm',   deviceType: 'nst',            placeholder: '140',   keyboard: 'numeric' },
  { key: 'toco',    label: 'NST TOCO',          unit: 'mmHg',  deviceType: 'nst',            placeholder: '10',    keyboard: 'numeric' },
];

export default function VitalsScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [token, setToken]   = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadToken().then(t => { if (!t) { router.replace('/'); return; } setToken(t); });
  }, []);

  useEffect(() => {
    if (token && roomId) fetchHistory();
  }, [token, roomId]);

  async function fetchHistory() {
    if (!token || !roomId) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/vitals?roomId=${encodeURIComponent(roomId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setHistory(await r.json());
    } catch (_) {}
    setLoading(false);
  }

  async function save() {
    if (!token) return;
    const records = VITAL_FIELDS
      .filter(f => values[f.key]?.trim())
      .map(f => ({
        roomId: roomId || null,
        deviceType: f.deviceType,
        metric: f.key,
        value: values[f.key].trim(),
        unit: f.unit,
        source: 'manual',
      }));

    if (records.length === 0) {
      Alert.alert('แจ้งเตือน', 'กรุณากรอกอย่างน้อย 1 ค่า');
      return;
    }

    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/vitals/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(records),
      });
      if (r.ok) {
        Alert.alert('สำเร็จ', `บันทึก ${records.length} ค่าเรียบร้อย`);
        setValues({});
        fetchHistory();
      } else {
        const d = await r.json().catch(() => ({}));
        Alert.alert('ผิดพลาด', d.message || String(r.status));
      }
    } catch (e: any) {
      Alert.alert('ผิดพลาด', e.message);
    }
    setSaving(false);
  }

  return (
    <SafeAreaView style={s.bg}>
      <StatusBar barStyle="light-content" backgroundColor={GREEN} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← กลับ</Text>
        </TouchableOpacity>
        <Text style={s.title}>🩺 บันทึกสัญญาณชีพ</Text>
        {roomId ? <Text style={s.roomTag}>{String(roomId).slice(0, 6)}</Text> : <View />}
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.grid}>
          {VITAL_FIELDS.map(f => (
            <View key={f.key} style={s.field}>
              <Text style={s.label}>{f.label}</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  keyboardType={f.keyboard}
                  placeholder={f.placeholder}
                  placeholderTextColor="#9ca3af"
                  value={values[f.key] || ''}
                  onChangeText={v => setValues(prev => ({ ...prev, [f.key]: v }))}
                />
                <Text style={s.unit}>{f.unit}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={[s.btn, saving && s.btnDis]} onPress={save} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>💾 บันทึก</Text>}
        </TouchableOpacity>

        {/* History */}
        <View style={s.histSection}>
          <View style={s.histHeader}>
            <Text style={s.histTitle}>ประวัติค่าที่บันทึก</Text>
            <TouchableOpacity onPress={fetchHistory}>
              <Text style={{ color: GREEN, fontSize: 13 }}>🔄</Text>
            </TouchableOpacity>
          </View>
          {loading && <ActivityIndicator color={GREEN} style={{ marginVertical: 12 }} />}
          {!loading && history.length === 0 && (
            <Text style={s.empty}>ยังไม่มีข้อมูล</Text>
          )}
          {history.slice(0, 30).map(r => (
            <View key={r.id} style={s.histRow}>
              <Text style={s.histMetric}>{r.metric}</Text>
              <Text style={s.histVal}>{r.value} {r.unit || ''}</Text>
              <Text style={s.histTs}>{r.recorded_at ? String(r.recorded_at).slice(0, 16).replace('T', ' ') : '—'}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bg:          { flex: 1, backgroundColor: '#f0faf4' },
  header:      { backgroundColor: GREEN, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back:        { color: '#fff', fontSize: 14 },
  title:       { color: '#fff', fontWeight: '700', fontSize: 16 },
  roomTag:     { backgroundColor: 'rgba(255,255,255,.2)', color: '#fff', fontSize: 11, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  scroll:      { padding: 16, paddingBottom: 40 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field:       { width: '47%' },
  label:       { fontSize: 12, color: '#4b5563', marginBottom: 3 },
  inputRow:    { flexDirection: 'row', alignItems: 'center' },
  input:       { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: '#111' },
  unit:        { marginLeft: 6, fontSize: 12, color: '#6b7280', width: 40 },
  btn:         { backgroundColor: GREEN, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  btnDis:      { opacity: 0.6 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
  histSection: { marginTop: 24 },
  histHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  histTitle:   { fontSize: 15, fontWeight: '600', color: '#374151' },
  empty:       { color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  histRow:     { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  histMetric:  { width: 70, fontSize: 13, fontWeight: '600', color: GREEN },
  histVal:     { flex: 1, fontSize: 14, color: '#111' },
  histTs:      { fontSize: 11, color: '#9ca3af' },
});
