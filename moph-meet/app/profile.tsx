/**
 * Profile / Data Hub edit — parity with user-app-lite profile modal.
 * PATCH /api/auth/profile { hcode5, hcode9, clinicCode, dateOfBirth, gender }
 */
import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { loadToken, loadUser, saveAuth } from '../constants/storage';
import { apiFetch } from '../constants/api';

const GREEN = '#1b7a43';
const GENDERS = ['ชาย', 'หญิง', 'อื่น ๆ'];

export default function ProfileScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser]   = useState<any>(null);
  const [hcode5, setHcode5]         = useState('');
  const [hcode9, setHcode9]         = useState('');
  const [clinicCode, setClinicCode] = useState('');
  const [dob, setDob]               = useState('');
  const [gender, setGender]         = useState('');
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    (async () => {
      const tok = await loadToken();
      const usr = await loadUser();
      if (!tok) { router.replace('/'); return; }
      setToken(tok);
      setUser(usr);
      setHcode5(usr?.hcode5 || '');
      setHcode9(usr?.hcode9 || '');
      setClinicCode(usr?.clinicCode || '');
      setDob(usr?.dateOfBirth || '');
      setGender(usr?.gender || '');
    })();
  }, []);

  async function save() {
    if (!token) return;
    if (hcode5 && !/^\d{5}$/.test(hcode5)) { Alert.alert('ข้อมูลไม่ถูกต้อง', 'HCode 5 หลัก ต้องเป็นตัวเลข 5 หลัก'); return; }
    if (hcode9 && !/^\d{9}$/.test(hcode9)) { Alert.alert('ข้อมูลไม่ถูกต้อง', 'HCode 9 หลัก ต้องเป็นตัวเลข 9 หลัก'); return; }
    setSaving(true);
    try {
      const r = await apiFetch('/api/auth/profile', token, {
        method: 'PATCH',
        body: JSON.stringify({ hcode5, hcode9, clinicCode, dateOfBirth: dob, gender }),
      });
      if (!r.ok) { Alert.alert('บันทึกไม่สำเร็จ', `รหัส ${r.status}`); return; }
      const d = await r.json();
      if (d.user) await saveAuth(token, d.user);
      Alert.alert('บันทึกแล้ว', 'อัปเดตข้อมูลเรียบร้อย', [{ text: 'ตกลง', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('เกิดข้อผิดพลาด', e.message || 'network');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.bg}>
      <StatusBar barStyle="light-content" backgroundColor={GREEN} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← กลับ</Text></TouchableOpacity>
        <Text style={s.title}>✏️ แก้ไขข้อมูลเพิ่มเติม</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.note}>Data Hub — ข้อมูลสถานพยาบาลและข้อมูลส่วนตัว</Text>

        <Text style={s.label}>HCode 5 หลัก (รหัสสถานพยาบาล)</Text>
        <TextInput style={s.input} value={hcode5} onChangeText={setHcode5} keyboardType="number-pad" maxLength={5} placeholder="เช่น 12345" placeholderTextColor="#9ca3af" />

        <Text style={s.label}>HCode 9 หลัก</Text>
        <TextInput style={s.input} value={hcode9} onChangeText={setHcode9} keyboardType="number-pad" maxLength={9} placeholder="เช่น 123456789" placeholderTextColor="#9ca3af" />

        <Text style={s.label}>Clinic Code 5 หลัก (รหัสคลินิก)</Text>
        <TextInput style={s.input} value={clinicCode} onChangeText={setClinicCode} keyboardType="number-pad" maxLength={5} placeholder="เช่น 54321" placeholderTextColor="#9ca3af" />

        <Text style={s.label}>วันเดือนปีเกิด (YYYY-MM-DD)</Text>
        <TextInput style={s.input} value={dob} onChangeText={setDob} maxLength={10} placeholder="2530-01-31" placeholderTextColor="#9ca3af" />

        <Text style={s.label}>เพศ</Text>
        <View style={s.genderRow}>
          {GENDERS.map(g => (
            <TouchableOpacity key={g} style={[s.genderChip, gender === g && s.genderChipActive]} onPress={() => setGender(g)}>
              <Text style={[s.genderText, gender === g && s.genderTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[s.saveBtn, saving && s.saveDis]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>💾 บันทึก</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bg:      { flex: 1, backgroundColor: '#f0faf4' },
  header:  { backgroundColor: GREEN, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back:    { color: '#fff', fontSize: 14 },
  title:   { color: '#fff', fontWeight: '700', fontSize: 16 },
  scroll:  { padding: 16, paddingBottom: 40 },
  note:    { fontSize: 12, color: '#6b7280', marginBottom: 16 },
  label:   { fontSize: 13, color: '#374151', marginBottom: 4, marginTop: 10, fontWeight: '600' },
  input:   { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111' },
  genderRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  genderChip: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  genderChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  genderText: { color: '#374151', fontSize: 14 },
  genderTextActive: { color: '#fff', fontWeight: '700' },
  saveBtn: { backgroundColor: GREEN, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveDis: { opacity: 0.6 },
  saveText:{ color: '#fff', fontWeight: '700', fontSize: 16 },
});
