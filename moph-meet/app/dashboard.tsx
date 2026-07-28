import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Alert, RefreshControl,
  StatusBar, TextInput, Modal, Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { loadToken, loadUser, clearAuth } from '../constants/storage';
import { apiFetch, API_BASE, MEETING_DOMAIN } from '../constants/api';
import {
  type RoomType,
  type CreateRoomInput,
  type ResultLinks,
  todayDateString,
  validateCreateRoomInput,
  buildCreateRoomBody,
  selectResultLinks,
} from '../constants/roomForm';
import MiniCalendar from '../components/MiniCalendar';
import { Icon } from '../components/Icon';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

const GREEN = '#1b7a43';

// ── date/time <-> string helpers (parity format: 'YYYY-MM-DD' / 'HH:mm') ──────
function pad2(n: number) { return String(n).padStart(2, '0'); }
function fmtDateVal(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fmtTimeVal(d: Date) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function parseDateVal(s?: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
}
function parseTimeVal(s?: string): Date {
  const m = /^(\d{2}):(\d{2})$/.exec(s || '');
  const d = new Date();
  if (m) d.setHours(+m[1], +m[2], 0, 0);
  return d;
}

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

  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // ── Create_Room_Form state (parity flow: เปิดฟอร์ม → ยืนยัน → result panel) ──
  const [formVisible, setFormVisible] = useState(false);
  const [formType, setFormType] = useState<RoomType>('exam');
  const [formInput, setFormInput] = useState<CreateRoomInput>({
    type: 'exam',
    name: '',
    accessMode: 'restricted',
    patientName: '',
    patientCid: '',
    date: '',
    startTime: '',
    endTime: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultLinks | null>(null);
  // ช่องที่กำลังเปิด native picker อยู่ (null = ปิด)
  const [pickerField, setPickerField] = useState<null | 'date' | 'startTime' | 'endTime'>(null);

  /** ค่า Date ที่ใช้ seed picker ตามช่องที่เปิด. */
  function pickerValue(): Date {
    if (pickerField === 'date') return parseDateVal(formInput.date);
    if (pickerField === 'startTime') return parseTimeVal(formInput.startTime);
    if (pickerField === 'endTime') return parseTimeVal(formInput.endTime);
    return new Date();
  }

  /** onChange ของ native picker → แปลงเป็น string parity แล้วเก็บลง formInput. */
  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    const field = pickerField;
    setPickerField(null); // Android: ปิด dialog หลังเลือก/ยกเลิก
    if (event.type === 'dismissed' || !selected || !field) return;
    if (field === 'date') {
      setFormInput((prev) => ({ ...prev, date: fmtDateVal(selected) }));
    } else if (field === 'startTime') {
      setFormInput((prev) => ({ ...prev, startTime: fmtTimeVal(selected) }));
    } else {
      setFormInput((prev) => ({ ...prev, endTime: fmtTimeVal(selected) }));
    }
  }
  // full URL ที่เพิ่งคัดลอก (แสดงข้อความยืนยัน "คัดลอกแล้ว!" ชั่วคราวบนปุ่มนั้น)
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  /**
   * เปิด Create_Room_Form สำหรับชนิดห้องที่เลือก (แทนการยิง POST /api/rooms ทันที).
   * รีเซ็ต error/result, ตั้งค่า default วันที่ = วันนี้ (todayDateString) เมื่อช่อง
   * วันที่ยังว่าง (Req 1.2), แล้วเปิดฟอร์ม (Req 1.1, 2.1).
   */
  function openForm(type: RoomType) {
    setFormType(type);
    setFormError(null);
    setResult(null);
    setFormInput(prev => ({
      ...prev,
      type,
      accessMode: type === 'meet' ? prev.accessMode || 'restricted' : 'restricted',
      patientName: '',
      patientCid: '',
      date: prev.date && prev.date.trim() !== '' ? prev.date : todayDateString(),
    }));
    setFormVisible(true);
  }

  /**
   * ปิด Create_Room_Form โดย **ไม่** ส่งคำขอสร้างห้อง (Req 3.4).
   * ไม่แตะ token/network — เพียงซ่อน modal และล้างข้อความ error.
   */
  function cancelForm() {
    setFormVisible(false);
    setFormError(null);
  }

  /**
   * ยืนยันการสร้างห้องจาก Create_Room_Form (parity flow).
   *
   * ลำดับการทำงาน (ตาม design.md — Error Handling):
   *  1) validate ด้วย `validateCreateRoomInput`; ถ้าไม่ผ่าน → เซ็ต `formError`
   *     และ **ไม่** เรียก API (Req 4.1, 4.2).
   *  2) ตั้ง `submitting = true` เพื่อปิดปุ่มยืนยันกันส่งซ้ำ, reset ใน `finally`
   *     (Req 4.3).
   *  3) ประกอบ body ด้วย `buildCreateRoomBody(input, { platform: 'mobile' })` แล้ว
   *     ยิง `POST /api/rooms` ผ่าน `apiFetch` (Cookie auth, ไม่ตั้ง Authorization —
   *     Req 6.1).
   *  4) จัดการผล: 401 → clearAuth + กลับ login (Req 6.2); non-2xx อื่น → Alert
   *     สร้างห้องไม่สำเร็จ (Req 6.3); สำเร็จแต่ไม่มี `room.id` → Alert ไม่ได้รับ
   *     รหัสห้อง (Req 6.4); network error → Alert; สำเร็จมี `room.id` →
   *     `selectResultLinks` → เซ็ต `result` เพื่อสลับไป Room_Result_Panel (Req 1.3,
   *     1.5, 2.2, 2.3, 7.1, 7.2).
   */
  async function submitCreateRoom() {
    if (!token || submitting) return;

    // 1) Validate ก่อนยิง API — ถ้าไม่ผ่านให้ระงับคำขอและแสดงข้อความ (Req 4.1, 4.2)
    const validation = validateCreateRoomInput(formInput);
    if (!validation.ok) {
      setFormError(validation.message);
      return;
    }
    setFormError(null);

    // 2) ปิดปุ่มยืนยันระหว่างส่ง กันส่งซ้ำ (Req 4.3)
    setSubmitting(true);
    try {
      // 3) body parity กับเว็บ + platform hint 'mobile' (Req 1.3, 2.2, 9.1);
      //    ส่งผ่าน Cookie auth เดิม ไม่ตั้ง Authorization (Req 6.1)
      const body = buildCreateRoomBody(formInput, { platform: 'mobile' });
      const r = await apiFetch('/api/rooms', token, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      // 4a) 401 → ล้าง auth และกลับหน้า login (Req 6.2)
      if (r.status === 401) { await handleLogout(); return; }

      // 4b) non-2xx อื่น → Alert สร้างห้องไม่สำเร็จ (Req 6.3)
      if (!r.ok) {
        Alert.alert('สร้างห้องไม่สำเร็จ', `รหัส ${r.status}`);
        return;
      }

      const data = await r.json();

      // 4c) สำเร็จแต่ไม่มี room.id → Alert ไม่ได้รับรหัสห้อง (Req 6.4)
      if (!data?.room?.id) {
        Alert.alert('สร้างห้องไม่สำเร็จ', 'ไม่ได้รับรหัสห้อง');
        return;
      }

      // 4d) สำเร็จ (มี room.id) → ตีความ/เลือกลิงก์ตามชนิดห้อง แล้วสลับ form-panel →
      //     result-panel ใน modal เดิม (parity กับเว็บ: ซ่อน modal-form-panel แสดง
      //     modal-result-panel). **ไม่** ปิด modal ตรงนี้ — modal ยังเปิดอยู่และ
      //     render Room_Result_Panel แทนฟอร์มเมื่อ `result !== null` (Req 1.5, 2.3).
      setResult(selectResultLinks(formType, data, API_BASE));
    } catch (e: any) {
      // 4e) network error → Alert (Req 6.3 ครอบคลุมความล้มเหลวในการสร้างห้อง)
      Alert.alert('เกิดข้อผิดพลาด', e?.message || 'network');
    } finally {
      // reset เสมอ ไม่ว่าจะสำเร็จหรือล้มเหลว (Req 4.3)
      setSubmitting(false);
    }
  }

  /**
   * คัดลอก full URL ไป clipboard ด้วย expo-clipboard (Req 5.1, 5.2).
   * จับ error เงียบ ๆ ไม่ให้กระทบสถานะ result panel (design: Clipboard/Share fail
   * → swallow). แสดงข้อความยืนยันสั้น ๆ ผ่าน state `copiedLink`.
   */
  async function copyLink(fullUrl: string | null) {
    if (!fullUrl) return;
    try {
      await Clipboard.setStringAsync(fullUrl);
      setCopiedLink(fullUrl);
      setTimeout(() => setCopiedLink(null), 1500);
    } catch (_) {
      // swallow clipboard error เงียบ ๆ (design: ไม่กระทบสถานะ result panel)
    }
  }

  /**
   * แชร์ full URL ผ่าน React Native Share API (Req 5.1). จับ error เงียบ ๆ
   * (รวมกรณีผู้ใช้ยกเลิก share sheet) — ไม่กระทบสถานะ result panel.
   */
  async function shareLink(fullUrl: string | null) {
    if (!fullUrl) return;
    try {
      await Share.share({ message: fullUrl });
    } catch (_) {
      // swallow share error เงียบ ๆ
    }
  }

  /**
   * ปิด Room_Result_Panel: ล้าง result + ปิด modal + reset ช่องเวลาในฟอร์ม
   * (เตรียมฟอร์มให้สะอาดสำหรับการสร้างครั้งถัดไป; คงค่า date default ผ่าน openForm).
   * รีเฟรชรายการนัดหมายเพื่อให้ห้องที่เพิ่งสร้างปรากฏ (parity กับเว็บที่ reload).
   */
  function closeResult() {
    setResult(null);
    setFormVisible(false);
    setFormError(null);
    setFormInput(prev => ({ ...prev, startTime: '', endTime: '' }));
    if (token) fetchMeets(token);
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
  // Calendar is for MOPH Meet telemedicine appointments only, not meetings or
  // any external calendar/holiday source.
  const markedDates = new Set(meets.filter(m => m.type === 'exam').map(m => (m.starttime ? m.starttime.slice(0, 10) : '')).filter(Boolean));
  const q = search.trim().toLowerCase();
  const filteredUpcoming = upcoming.filter(m => {
    if (q && !(m.name || m.title || m.id || '').toLowerCase().includes(q)) return false;
    if (selectedDate && (m.type !== 'exam' || (m.starttime || '').slice(0, 10) !== selectedDate)) return false;
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={GREEN} />

      {/* Navbar */}
      <View style={styles.navbar}>
        <Text style={styles.navTitle}>MOPH Meet</Text>
        <TouchableOpacity onPress={() => router.push('/stats')} style={styles.statsBtn}>
          <Icon name="stats" size={16} color="#fff" />
        </TouchableOpacity>
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
            <Icon name="edit" size={14} color={GREEN} />
            <Text style={styles.editProfileText}> แก้ไขข้อมูลเพิ่มเติม</Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>เริ่มใช้งาน</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={() => openForm('exam')}
            >
              <Icon name="exam" size={24} color="#fff" />
              <Text style={styles.actionLabel}>สร้างห้องตรวจ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={() => openForm('meet')}
            >
              <Icon name="meet" size={24} color="#fff" />
              <Text style={styles.actionLabel}>สร้างห้องประชุม</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={() => router.push('/devices')}>
              <Icon name="vitals" size={24} color={GREEN} />
              <Text style={styles.actionLabelDark}>บันทึกสัญญาณชีพ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={() => router.push('/devices')}>
              <Icon name="device" size={24} color={GREEN} />
              <Text style={styles.actionLabelDark}>อุปกรณ์การแพทย์</Text>
            </TouchableOpacity>
          </View>
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

      {/* ── Create_Room_Form / Room_Result_Panel (Modal) — parity กับ modal บนเว็บ ──
          เว็บสลับ modal-form-panel → modal-result-panel ใน modal เดียวกัน. ที่นี่ก็
          เช่นกัน: modal ยังเปิดอยู่หลังสร้างสำเร็จ และ render Room_Result_Panel แทน
          ฟอร์มเมื่อ `result !== null` (task 5.4). ปุ่ม/back จะปิด modal ผ่าน
          closeResult (result panel) หรือ cancelForm (form). */}
      <Modal
        visible={formVisible}
        transparent
        animationType="fade"
        onRequestClose={result ? closeResult : cancelForm}
      >
        <View style={styles.modalOverlay}>
          {result ? (
            /* ── Room_Result_Panel (task 5.4) ── */
            <View style={styles.modalCard}>
              <View style={styles.resultSuccessAlert}>
                <Text style={styles.resultSuccessText}>สร้างห้องสำเร็จแล้ว!</Text>
              </View>

              {/* ชื่อห้อง — '🏠 ' + roomName (parity กับเว็บ result-room-name).
                  แสดงได้แม้ roomName = '' (empty result panel, ไม่เข้า error: Req 2.3, 8.3) */}
              <Text style={styles.resultRoomName}>🏠 {result.roomName}</Text>

              {/* meet → กล่องเขียวอ่อน: ลิงก์ + ปุ่มคัดลอก inline + ปุ่มเข้าห้องประชุม
                  (mutual exclusivity ตามชนิดห้อง: Req 5.3, 5.4) */}
              {(result.meetLink || result.meetRoute) && (
                <View style={styles.resultLinkWrap}>
                  {result.meetLink && (
                    <>
                      <Text style={styles.resultLinkLabel}>
                        🔗 ลิงก์เข้าห้อง (ต้องล็อกอินด้วย Provider ID)
                      </Text>
                      <View style={styles.resultLinkRow}>
                        <Text style={styles.resultLinkInput} numberOfLines={1} ellipsizeMode="tail" selectable>
                          {result.meetLink}
                        </Text>
                        <TouchableOpacity
                          style={styles.resultCopyBtn}
                          onPress={() => copyLink(result.meetLink)}
                        >
                          <Text style={styles.resultCopyBtnText}>
                            {copiedLink === result.meetLink ? 'คัดลอกแล้ว!' : 'คัดลอก'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                  {result.meetRoute && (
                    <TouchableOpacity
                      style={styles.resultNavBtn}
                      onPress={() => { const route = result.meetRoute!; closeResult(); router.push(route as any); }}
                    >
                      <Text style={styles.resultNavBtnText}>📡 เข้าห้องประชุม</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* exam → ไม่มีลิงก์ผู้ป่วยแบบทั่วไป: ผู้สร้างต้องกรอก CID 13 หลัก
                  ตอนเชิญจากหน้าห้องตรวจ จึงแสดงทางลัดไปหน้าจัดการห้องแทน. */}
              {(result.patientLink || result.doctorRoute) && (
                <View style={styles.resultLinkWrap}>
                  {result.patientLink && (
                    <>
                      <Text style={styles.resultLinkLabel}>
                        👤 ลิงก์คิวสำหรับผู้ป่วยที่ได้รับเชิญ
                      </Text>
                      <View style={styles.resultLinkRow}>
                        <Text style={styles.resultLinkInput} numberOfLines={1} ellipsizeMode="tail" selectable>
                          {result.patientLink}
                        </Text>
                        <TouchableOpacity
                          style={styles.resultCopyBtn}
                          onPress={() => copyLink(result.patientLink)}
                        >
                          <Text style={styles.resultCopyBtnText}>
                            {copiedLink === result.patientLink ? 'คัดลอกแล้ว!' : 'คัดลอก'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                  {result.doctorRoute && (
                    <>
                      {!result.patientLink && (
                        <Text style={styles.resultLinkLabel}>
                          เพื่อความปลอดภัย ให้เชิญผู้ป่วยจากในห้องตรวจพร้อมเลขบัตรประชาชน 13 หลัก
                        </Text>
                      )}
                      <TouchableOpacity
                        style={styles.resultNavBtn}
                        onPress={() => { const route = result.doctorRoute!; closeResult(); router.push(route as any); }}
                      >
                        <Text style={styles.resultNavBtnText}>👨‍⚕️ เข้าห้องตรวจและเชิญผู้ป่วย</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {/* ปิด result panel + modal (reset result/times + refresh รายการ) */}
              <TouchableOpacity
                style={styles.resultDoneBtn}
                onPress={closeResult}
              >
                <Text style={styles.resultDoneBtnText}>เสร็จ</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {formType === 'exam' ? '🦷 สร้างห้องตรวจ' : '📡 สร้างห้องประชุม'}
            </Text>
            <Text style={styles.modalDesc}>
              {formType === 'exam'
                ? 'ตั้งชื่อ เวลา และเชิญผู้ป่วยพร้อมสร้างห้องได้'
                : 'ตั้งชื่อ เวลา และสิทธิ์เข้าร่วมห้องได้'}
            </Text>

            <Text style={styles.fieldLabel}>ชื่อห้อง</Text>
            <TextInput
              style={styles.textFormInput}
              value={formInput.name || ''}
              onChangeText={(name) => setFormInput(prev => ({ ...prev, name }))}
              placeholder="เว้นว่างเพื่อให้ระบบตั้งชื่ออัตโนมัติ"
              placeholderTextColor="#94a3b8"
              maxLength={160}
              editable={!submitting}
            />

            {formType === 'meet' && (
              <>
                <Text style={styles.fieldLabel}>สิทธิ์การเข้าร่วม</Text>
                <View style={styles.accessModeRow}>
                  <TouchableOpacity style={[styles.accessModeBtn, formInput.accessMode !== 'public' && styles.accessModeActive]} onPress={() => setFormInput(prev => ({ ...prev, accessMode: 'restricted' }))}>
                    <Text style={[styles.accessModeText, formInput.accessMode !== 'public' && styles.accessModeTextActive]}>Restricted</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.accessModeBtn, formInput.accessMode === 'public' && styles.accessModeActive]} onPress={() => setFormInput(prev => ({ ...prev, accessMode: 'public' }))}>
                    <Text style={[styles.accessModeText, formInput.accessMode === 'public' && styles.accessModeTextActive]}>Public</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {formType === 'exam' && (
              <View style={styles.patientInviteBox}>
                <Text style={styles.patientInviteTitle}>เชิญผู้ป่วยพร้อมสร้างห้อง</Text>
                <Text style={styles.fieldLabel}>ชื่อผู้ป่วย <Text style={styles.requiredMark}>*</Text></Text>
                <TextInput
                  style={styles.textFormInput}
                  value={formInput.patientName || ''}
                  onChangeText={(patientName) => setFormInput(prev => ({ ...prev, patientName }))}
                  placeholder="กรอกเมื่อต้องการเชิญพร้อมสร้างห้อง"
                  placeholderTextColor="#94a3b8"
                  maxLength={160}
                  editable={!submitting}
                />
                <Text style={styles.fieldLabel}>เลขบัตรประชาชน 13 หลัก <Text style={styles.requiredMark}>*</Text></Text>
                <TextInput
                  style={styles.textFormInput}
                  value={formInput.patientCid || ''}
                  onChangeText={(patientCid) => setFormInput(prev => ({ ...prev, patientCid: patientCid.replace(/\D/g, '') }))}
                  placeholder="กรอก 13 หลักเมื่อต้องการเชิญ"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  maxLength={13}
                  editable={!submitting}
                />
                <Text style={styles.patientInviteHint}>เว้นทั้งสองช่องได้ หากต้องการเชิญผู้ป่วยภายหลัง</Text>
              </View>
            )}

            {/* วันที่ — แตะเพื่อเปิด native date picker (parity กับ <input type="date"> บนเว็บ).
                required เป็น visual hint เท่านั้น ไม่บล็อก submit เอง (Req 3.3) */}
            <Text style={styles.fieldLabel}>
              วันที่ <Text style={styles.requiredMark}>*</Text>
            </Text>
            <TouchableOpacity
              testID="field-date"
              style={styles.formInput}
              onPress={() => setPickerField('date')}
              disabled={submitting}
            >
              <Text style={formInput.date ? styles.formInputText : styles.formInputPlaceholder}>
                {formInput.date || 'YYYY-MM-DD'}
              </Text>
            </TouchableOpacity>

            {/* เวลาเริ่ม — แตะเพื่อเปิด native time picker */}
            <Text style={styles.fieldLabel}>
              เวลาเริ่ม <Text style={styles.requiredMark}>*</Text>
            </Text>
            <TouchableOpacity
              testID="field-startTime"
              style={styles.formInput}
              onPress={() => setPickerField('startTime')}
              disabled={submitting}
            >
              <Text style={formInput.startTime ? styles.formInputText : styles.formInputPlaceholder}>
                {formInput.startTime || 'HH:mm'}
              </Text>
            </TouchableOpacity>

            {/* เวลาสิ้นสุด — แตะเพื่อเปิด native time picker */}
            <Text style={styles.fieldLabel}>
              เวลาสิ้นสุด <Text style={styles.requiredMark}>*</Text>
            </Text>
            <TouchableOpacity
              testID="field-endTime"
              style={styles.formInput}
              onPress={() => setPickerField('endTime')}
              disabled={submitting}
            >
              <Text style={formInput.endTime ? styles.formInputText : styles.formInputPlaceholder}>
                {formInput.endTime || 'HH:mm'}
              </Text>
            </TouchableOpacity>

            {pickerField && (
              <DateTimePicker
                value={pickerValue()}
                mode={pickerField === 'date' ? 'date' : 'time'}
                is24Hour
                // เวลา = spinner (เลื่อนเลขเป็นคอลัมน์ ชม.:นาที ใกล้เว็บ ใช้ง่ายกว่า clock face);
                // วันที่ = calendar ปกติ (กดง่ายอยู่แล้ว)
                display={pickerField === 'date' ? 'default' : 'spinner'}
                onChange={onPickerChange}
              />
            )}

            <Text style={styles.fieldHint}>* ช่องที่ต้องกรอก</Text>

            {formError && <Text style={styles.formErrorText}>{formError}</Text>}

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.formBtn, styles.formBtnCancel]}
                onPress={cancelForm}
                disabled={submitting}
              >
                <Text style={styles.formBtnCancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formBtn, styles.formBtnSubmit, submitting && styles.actionDisabled]}
                onPress={submitCreateRoom}
                disabled={submitting}
              >
                <Text style={styles.formBtnSubmitText}>
                  {formType === 'exam' ? 'สร้างห้องตรวจ' : 'สร้างห้องประชุม'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          )}
        </View>
      </Modal>
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
  statsBtn:   { borderWidth: 1, borderColor: 'rgba(255,255,255,.6)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8 },
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
  editProfileBtn: { marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: GREEN, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editProfileText: { color: GREEN, fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  calCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  calTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 10 },
  actionsCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  actionsTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionPrimary: { backgroundColor: GREEN },
  actionSecondary: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  actionDisabled: { opacity: 0.6 },
  actionIcon: { fontSize: 24, marginBottom: 4 },
  actionLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionLabelDark: { color: GREEN, fontWeight: '600', fontSize: 13 },
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

  // ── Create_Room_Form (Modal) ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 24 },
  modalCard:    { backgroundColor: '#fff', borderRadius: 14, padding: 20, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  modalTitle:   { fontSize: 18, fontWeight: '700', color: GREEN, marginBottom: 6 },
  modalDesc:    { fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 18 },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  requiredMark: { color: '#dc2626', fontWeight: '700' },
  formInput:    { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12, justifyContent: 'center' },
  textFormInput:{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111', marginBottom: 12 },
  accessModeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  accessModeBtn: { flex: 1, borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  accessModeActive: { backgroundColor: GREEN, borderColor: GREEN },
  accessModeText: { color: GREEN, fontWeight: '600', fontSize: 13 },
  accessModeTextActive: { color: '#fff' },
  patientInviteBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, padding: 10, marginBottom: 12 },
  patientInviteTitle: { color: GREEN, fontWeight: '700', fontSize: 13, marginBottom: 8 },
  patientInviteHint: { color: '#64748b', fontSize: 11, marginTop: -4 },
  formInputText:{ fontSize: 14, color: '#111' },
  formInputPlaceholder: { fontSize: 14, color: '#9ca3af' },
  fieldHint:    { fontSize: 11, color: '#9ca3af', marginBottom: 8 },
  formErrorText:{ fontSize: 13, color: '#dc2626', marginBottom: 10 },
  formActions:  { flexDirection: 'row', gap: 10, marginTop: 4 },
  formBtn:      { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  formBtnCancel:{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  formBtnCancelText: { color: GREEN, fontWeight: '600', fontSize: 14 },
  formBtnSubmit:{ backgroundColor: GREEN },
  formBtnSubmitText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Room_Result_Panel ──
  resultSuccessAlert: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  resultSuccessText:  { color: GREEN, fontWeight: '700', fontSize: 14 },
  resultRoomName:     { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 14 },
  resultLinkWrap:     { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#d1fae5', borderRadius: 10, padding: 12, marginBottom: 12 },
  resultLinkLabel:    { fontSize: 12, color: '#64748b', marginBottom: 6 },
  // แถวลิงก์ + ปุ่มคัดลอก inline (ขวา) — parity กับเว็บ
  resultLinkRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultLinkInput:    { flex: 1, fontSize: 12, color: '#111', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 10 },
  resultCopyBtn:      { borderWidth: 1, borderColor: GREEN, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  resultCopyBtnText:  { color: GREEN, fontWeight: '700', fontSize: 13 },
  resultNavBtn:       { backgroundColor: GREEN, borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  resultNavBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  // ปุ่ม "เสร็จ" — เขียวเข้มเต็มความกว้าง (ตามภาพ)
  resultDoneBtn:      { backgroundColor: '#14532d', borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  resultDoneBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
});
