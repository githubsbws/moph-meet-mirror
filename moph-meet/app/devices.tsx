/**
 * Medical Device Screen — TOR 4.10.6
 * Connect Bluetooth medical devices (≥5 types via standard GATT).
 * Reads live values → sends to POST /api/vitals/batch.
 *
 * Architecture:
 *  - BLE scan uses react-native-ble-plx (must be installed: expo install react-native-ble-plx)
 *  - On web / platforms without BLE support → falls back to manual entry (always available)
 *  - Standard GATT services covered: thermometer / bloodPressure / pulseOximeter / weightScale / glucose (= 5 types)
 *
 * NOTE: BLE requires a native build (expo run:android / expo run:ios or EAS build).
 *       In Expo Go / web, BLE import will fail gracefully → manual entry only.
 */
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, SafeAreaView, StatusBar, TextInput, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { loadToken } from '../constants/storage';
import { API_BASE } from '../constants/api';
import { BLE_SERVICES, DEVICE_METRICS, DEVICE_LABELS, type DeviceType } from '../constants/ble';

const GREEN = '#1b7a43';

// ── BLE manager (lazy import — graceful fallback if not installed) ─────────────
let BleManager: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { BleManager: BM } = require('react-native-ble-plx');
  BleManager = new BM();
} catch (_) {
  console.warn('[BLE] react-native-ble-plx not available — manual entry only');
}

const BLE_AVAILABLE = !!BleManager && Platform.OS !== 'web';

type ScannedDevice = { id: string; name: string | null; serviceUUIDs: string[] | null };
type VitalReading  = { metric: string; unit: string; label: string; value: string };

/** Attempt to parse a GATT characteristic value (base64) for known services */
function parseGATT(serviceUUID: string, base64Value: string): VitalReading[] {
  try {
    const buf = Buffer.from(base64Value, 'base64');
    // Minimal parsing for demo — real devices use proper GATT parsers
    // thermometer: IEEE-11073 float in bytes 1-4
    if (serviceUUID.startsWith('00001809')) {
      const raw = ((buf[1] | (buf[2] << 8)) & 0x7fff) / 10;
      return [{ metric: 'temp', unit: '°C', label: 'อุณหภูมิ', value: String(raw) }];
    }
    // blood pressure: sys = uint16 bytes 1-2, dia = uint16 bytes 3-4, pr = bytes 14-15
    if (serviceUUID.startsWith('00001810')) {
      const sys = buf[1] | (buf[2] << 8);
      const dia = buf[3] | (buf[4] << 8);
      const pr  = buf[14] | (buf[15] << 8);
      return [
        { metric: 'sys', unit: 'mmHg', label: 'SYS', value: String(sys) },
        { metric: 'dia', unit: 'mmHg', label: 'DIA', value: String(dia) },
        { metric: 'pr',  unit: '/min', label: 'ชีพจร', value: String(pr) },
      ];
    }
    // pulse oximeter: SpO2 byte 3, PR byte 4
    if (serviceUUID.startsWith('00001822')) {
      return [
        { metric: 'spo2', unit: '%',    label: 'SpO₂', value: String(buf[3]) },
        { metric: 'pr',   unit: '/min', label: 'ชีพจร', value: String(buf[4]) },
      ];
    }
    // weight scale: weight uint16 bytes 1-2 × 0.005 kg
    if (serviceUUID.startsWith('0000181d')) {
      const weight = ((buf[1] | (buf[2] << 8)) * 0.005).toFixed(1);
      return [{ metric: 'weight', unit: 'kg', label: 'น้ำหนัก', value: weight }];
    }
    // glucose: concentration bytes 3-4 as mmol/L × 10, convert to mg/dL
    if (serviceUUID.startsWith('00001808')) {
      const mmol = (buf[3] | (buf[4] << 8)) / 10;
      const mgdl = Math.round(mmol * 18.02).toString();
      return [{ metric: 'glucose', unit: 'mg/dL', label: 'น้ำตาล', value: mgdl }];
    }
  } catch (_) {}
  return [];
}

/** Manual entry panel for one device type */
function ManualEntry({
  deviceType, roomId, token, onSaved,
}: { deviceType: DeviceType; roomId: string | null; token: string | null; onSaved: () => void }) {
  const fields = DEVICE_METRICS[deviceType];
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    const records = fields.filter(f => vals[f.metric]?.trim()).map(f => ({
      roomId: roomId || null,
      deviceType,
      metric: f.metric,
      value: vals[f.metric].trim(),
      unit: f.unit,
      source: 'manual',
    }));
    if (!records.length) { Alert.alert('กรุณากรอกอย่างน้อย 1 ค่า'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/vitals/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(records),
      });
      if (r.ok) { Alert.alert('บันทึกแล้ว'); setVals({}); onSaved(); }
      else Alert.alert('ผิดพลาด', String(r.status));
    } catch (e: any) { Alert.alert('ผิดพลาด', e.message); }
    setSaving(false);
  }

  return (
    <View style={s.manualBox}>
      <Text style={s.manualTitle}>กรอกค่าด้วยตนเอง — {DEVICE_LABELS[deviceType]}</Text>
      {fields.map(f => (
        <View key={f.metric} style={s.manualRow}>
          <Text style={s.manualLabel}>{f.label} ({f.unit})</Text>
          <TextInput
            style={s.manualInput}
            keyboardType="decimal-pad"
            value={vals[f.metric] || ''}
            onChangeText={v => setVals(p => ({ ...p, [f.metric]: v }))}
            placeholder={`0`}
            placeholderTextColor="#9ca3af"
          />
        </View>
      ))}
      <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnDis]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>💾 บันทึก</Text>}
      </TouchableOpacity>
    </View>
  );
}

export default function DevicesScreen() {
  const { roomId: _roomId } = useLocalSearchParams<{ roomId?: string }>();
  const roomId = _roomId || null;
  const [token, setToken]             = useState<string | null>(null);
  const [scanning, setScanning]       = useState(false);
  const [devices, setDevices]         = useState<ScannedDevice[]>([]);
  const [connected, setConnected]     = useState<string | null>(null);
  const [readings, setReadings]       = useState<VitalReading[]>([]);
  const [selectedType, setSelectedType] = useState<DeviceType>('thermometer');
  const [showManual, setShowManual]   = useState(!BLE_AVAILABLE);
  const [saved, setSaved]             = useState(0);
  const scanSub = useRef<any>(null);

  useEffect(() => {
    loadToken().then(t => { if (!t) { router.replace('/'); return; } setToken(t); });
    return () => { scanSub.current?.remove(); };
  }, []);

  async function startScan() {
    if (!BleManager) { setShowManual(true); return; }
    setScanning(true);
    setDevices([]);
    const allServiceUUIDs = Object.values(BLE_SERVICES);
    BleManager.startDeviceScan(allServiceUUIDs, null, (err: any, device: any) => {
      if (err) { console.warn('[BLE]', err); setScanning(false); return; }
      if (device) {
        setDevices(prev => {
          if (prev.find(d => d.id === device.id)) return prev;
          return [...prev, { id: device.id, name: device.name, serviceUUIDs: device.serviceUUIDs }];
        });
      }
    });
    setTimeout(() => { BleManager?.stopDeviceScan(); setScanning(false); }, 10000);
  }

  async function connectDevice(dev: ScannedDevice) {
    if (!BleManager || !token) return;
    try {
      const d = await BleManager.connectToDevice(dev.id);
      await d.discoverAllServicesAndCharacteristics();
      setConnected(dev.id);

      // Try to read from all known services
      const newReadings: VitalReading[] = [];
      for (const [type, svcUUID] of Object.entries(BLE_SERVICES)) {
        try {
          const chars = await d.characteristicsForService(svcUUID);
          for (const c of chars) {
            if (!c.isReadable) continue;
            const cr = await c.read();
            if (cr.value) newReadings.push(...parseGATT(svcUUID, cr.value));
          }
        } catch (_) {}
      }

      if (newReadings.length > 0) {
        setReadings(newReadings);
        // Auto-send to /api/vitals/batch
        const records = newReadings.map(r => ({
          roomId,
          deviceId: dev.id,
          deviceType: (dev.serviceUUIDs || []).includes(BLE_SERVICES.bloodPressure) ? 'bloodPressure' : 'ble',
          metric: r.metric,
          value: r.value,
          unit: r.unit,
          source: 'ble',
        }));
        await fetch(`${API_BASE}/api/vitals/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(records),
        });
        setSaved(p => p + records.length);
        Alert.alert('บันทึกแล้ว', `อ่านค่า ${newReadings.length} รายการ จากอุปกรณ์ "${dev.name || dev.id}"`);
      } else {
        Alert.alert('ไม่พบข้อมูล', 'ไม่มีค่าที่อ่านได้จากอุปกรณ์นี้ กรุณากรอกเอง');
        setShowManual(true);
      }

      await BleManager.cancelDeviceConnection(dev.id);
      setConnected(null);
    } catch (e: any) {
      Alert.alert('เชื่อมต่อล้มเหลว', e.message + '\nกรุณากรอกค่าด้วยตนเอง');
      setShowManual(true);
      setConnected(null);
    }
  }

  return (
    <SafeAreaView style={s.bg}>
      <StatusBar barStyle="light-content" backgroundColor={GREEN} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← กลับ</Text>
        </TouchableOpacity>
        <Text style={s.title}>📡 อุปกรณ์ทางการแพทย์</Text>
        {saved > 0 && <Text style={s.savedBadge}>✅ {saved}</Text>}
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* BLE scan section */}
        {BLE_AVAILABLE ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>เชื่อมต่อผ่าน Bluetooth (≥5 ชนิด)</Text>
            <Text style={s.sectionSub}>รองรับ: เทอร์โมมิเตอร์ · ความดัน · Pulse Ox · ชั่งน้ำหนัก · น้ำตาล</Text>
            <TouchableOpacity style={[s.scanBtn, scanning && s.scanBtnDis]} onPress={startScan} disabled={scanning}>
              {scanning
                ? <><ActivityIndicator color="#fff" /><Text style={s.scanBtnText}> กำลังสแกน… (10s)</Text></>
                : <Text style={s.scanBtnText}>🔍 สแกนอุปกรณ์</Text>}
            </TouchableOpacity>

            {devices.map(dev => (
              <TouchableOpacity
                key={dev.id}
                style={[s.deviceCard, connected === dev.id && s.deviceCardActive]}
                onPress={() => connectDevice(dev)}
                disabled={!!connected}
              >
                <Text style={s.deviceName}>{dev.name || '(ไม่มีชื่อ)'}</Text>
                <Text style={s.deviceId}>{dev.id.slice(0, 17)}</Text>
                {connected === dev.id && <ActivityIndicator color={GREEN} style={{ marginTop: 4 }} />}
              </TouchableOpacity>
            ))}

            {!scanning && devices.length === 0 && (
              <Text style={s.empty}>ยังไม่พบอุปกรณ์ — กด "สแกน" เพื่อค้นหา</Text>
            )}

            {readings.length > 0 && (
              <View style={s.readingsBox}>
                <Text style={s.readingsTitle}>ค่าที่อ่านได้ล่าสุด</Text>
                {readings.map((r, i) => (
                  <Text key={i} style={s.readingRow}>• {r.label}: <Text style={s.readingVal}>{r.value} {r.unit}</Text></Text>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={s.bleNotice}>
            <Text style={s.bleNoticeText}>
              {Platform.OS === 'web'
                ? '⚠️ Bluetooth ไม่รองรับบนเว็บ — กรอกค่าด้วยตนเองได้ด้านล่าง'
                : '⚠️ ต้องติดตั้ง react-native-ble-plx และทำ native build ก่อนใช้ BLE'}
            </Text>
          </View>
        )}

        {/* Manual fallback (always available per TOR requirement) */}
        <View style={s.section}>
          <View style={s.manualToggleRow}>
            <Text style={s.sectionTitle}>กรอกค่าด้วยตนเอง (fallback)</Text>
            <TouchableOpacity onPress={() => setShowManual(p => !p)}>
              <Text style={{ color: GREEN }}>{showManual ? '▲ ซ่อน' : '▼ แสดง'}</Text>
            </TouchableOpacity>
          </View>

          {showManual && (
            <>
              {/* Device type selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {(Object.keys(BLE_SERVICES) as DeviceType[]).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[s.typeChip, selectedType === type && s.typeChipActive]}
                    onPress={() => setSelectedType(type)}
                  >
                    <Text style={[s.typeChipText, selectedType === type && s.typeChipTextActive]}>
                      {DEVICE_LABELS[type]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <ManualEntry
                deviceType={selectedType}
                roomId={roomId}
                token={token}
                onSaved={() => setSaved(p => p + 1)}
              />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bg:              { flex: 1, backgroundColor: '#f0faf4' },
  header:          { backgroundColor: GREEN, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back:            { color: '#fff', fontSize: 14 },
  title:           { color: '#fff', fontWeight: '700', fontSize: 16 },
  savedBadge:      { backgroundColor: 'rgba(255,255,255,.25)', color: '#fff', fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  scroll:          { padding: 16, paddingBottom: 40 },
  section:         { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  sectionTitle:    { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  sectionSub:      { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  scanBtn:         { backgroundColor: GREEN, borderRadius: 10, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  scanBtnDis:      { opacity: 0.6 },
  scanBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  deviceCard:      { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, marginTop: 10 },
  deviceCardActive:{ borderColor: GREEN },
  deviceName:      { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  deviceId:        { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  empty:           { color: '#9ca3af', textAlign: 'center', paddingVertical: 12, fontSize: 13 },
  readingsBox:     { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 12, marginTop: 12 },
  readingsTitle:   { fontSize: 13, fontWeight: '700', color: GREEN, marginBottom: 6 },
  readingRow:      { fontSize: 13, color: '#374151', marginBottom: 2 },
  readingVal:      { fontWeight: '700', color: GREEN },
  bleNotice:       { backgroundColor: '#fef3c7', borderRadius: 10, padding: 14, marginBottom: 16 },
  bleNoticeText:   { fontSize: 13, color: '#92400e' },
  manualToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeChip:        { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  typeChipActive:  { backgroundColor: GREEN, borderColor: GREEN },
  typeChipText:    { fontSize: 12, color: '#374151' },
  typeChipTextActive: { color: '#fff', fontWeight: '600' },
  manualBox:       { marginTop: 4 },
  manualTitle:     { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  manualRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  manualLabel:     { width: 140, fontSize: 12, color: '#4b5563' },
  manualInput:     { flex: 1, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: '#111' },
  saveBtn:         { backgroundColor: GREEN, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  saveBtnDis:      { opacity: 0.6 },
  saveBtnText:     { color: '#fff', fontWeight: '700' },
});
