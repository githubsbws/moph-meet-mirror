import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { apiFetch } from '../constants/api';
import { clearAuth, loadToken } from '../constants/storage';

const GREEN = '#1b7a43';

export default function ConsentScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => {
    const tok = await loadToken();
    if (!tok) { router.replace('/'); return; }
    setToken(tok);
    try {
      const r = await apiFetch('/api/telemed-consent', tok);
      if (r.ok && (await r.json()).accepted) { router.replace('/dashboard'); return; }
    } catch (_) {}
    setLoading(false);
  })(); }, []);

  async function save(decision: 'accepted' | 'declined') {
    if (!token || saving) return;
    setSaving(true);
    try {
      const r = await apiFetch('/api/telemed-consent', token, { method: 'POST', body: JSON.stringify({ decision, confirmed: decision === 'accepted' }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'บันทึกไม่สำเร็จ');
      if (decision === 'accepted') router.replace('/dashboard');
      else { await clearAuth(); router.replace('/'); }
    } catch (e: any) { Alert.alert('ไม่สามารถบันทึกได้', e.message || 'โปรดลองอีกครั้ง'); }
    finally { setSaving(false); }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={GREEN} size="large" /></View>;
  return <SafeAreaView style={s.bg}><ScrollView contentContainerStyle={s.wrap}>
    <View style={s.card}>
      <View style={s.icon}><Text style={s.iconText}>✓</Text></View>
      <Text style={s.title}>ขอความยินยอมใช้บริการแพทย์ทางไกล</Text>
      <Text style={s.subtitle}>โปรดอ่านรายละเอียดก่อนเข้าสู่ระบบ</Text>
      <View style={s.notice}><Text style={s.noticeText}>การยืนยันมีผลทางอิเล็กทรอนิกส์ ระบบจะบันทึกเวลาและเวอร์ชันเอกสารเป็นหลักฐาน</Text></View>
      <Section title="ข้อมูลที่ประมวลผล" lines={['ข้อมูลทั่วไป: ชื่อ-นามสกุล เลขประจำตัวประชาชน วันเกิด ที่อยู่ เบอร์โทรศัพท์ และข้อมูลติดต่อออนไลน์','ข้อมูลอ่อนไหว: ข้อมูลสุขภาพ อาการเจ็บป่วย ประวัติการรักษา และผลตรวจทางห้องปฏิบัติการ','ข้อมูลภาพและเสียงระหว่างรับบริการแพทย์และเภสัชกรรมทางไกล']} />
      <Section title="วัตถุประสงค์" lines={['วินิจฉัย บำบัดรักษา และให้คำปรึกษาทางการแพทย์ผ่านระบบดิจิทัล','จัดทำประวัติการรักษาเพื่อความต่อเนื่องในการรักษา','เบิกจ่ายค่ารักษากับหน่วยงานที่เกี่ยวข้อง และตรวจสอบคุณภาพบริการกับความปลอดภัย']} />
      <Section title="ระยะเวลาจัดเก็บและสิทธิของท่าน" lines={['จัดเก็บ 10 ปีนับแต่สิ้นสุดการรักษา หรือตามกฎหมายว่าด้วยสถานพยาบาล','ท่านขอถอนความยินยอม เข้าถึง แก้ไข คัดค้าน หรือลบข้อมูลได้ตามสิทธิ การถอนอาจทำให้ใช้บางฟังก์ชันไม่ได้ และไม่มีผลย้อนหลังต่อการประมวลผลที่เสร็จสิ้นแล้ว']} />
      <View style={s.contact}><Text style={s.contactTitle}>ติดต่อสำนักสุขภาพดิจิทัล / DPO</Text><Text style={s.contactText}>โทร. 0 2590 2077 · bdh.moph@moph.go.th{`\n`}DPO: 0 2590 2180 ต่อ 112, 316 หรือ 0 2590 1213 · dpo@moph.go.th</Text></View>
      <View style={s.confirmRow}><Switch value={confirmed} onValueChange={setConfirmed} trackColor={{ false:'#cbd5e1', true:'#8fc6a6' }} thumbColor={confirmed ? GREEN : '#fff'} /><Text style={s.confirmText}>ข้าพเจ้าได้อ่าน เข้าใจ และยินยอมให้ประมวลผลข้อมูลส่วนบุคคลเพื่อใช้บริการแพทย์ทางไกล</Text></View>
      <TouchableOpacity style={[s.accept, (!confirmed || saving) && s.disabled]} disabled={!confirmed || saving} onPress={() => save('accepted')}><Text style={s.acceptText}>{saving ? 'กำลังบันทึก…' : 'ยืนยันและเข้าสู่ระบบ'}</Text></TouchableOpacity>
      <TouchableOpacity disabled={saving} onPress={() => Alert.alert('ไม่ให้ความยินยอม', 'ระบบจะออกจากระบบ คุณต้องการดำเนินการต่อหรือไม่?', [{ text:'กลับ', style:'cancel' }, { text:'ยืนยัน', style:'destructive', onPress:() => save('declined') }])}><Text style={s.decline}>ไม่ให้ความยินยอม</Text></TouchableOpacity>
    </View>
  </ScrollView></SafeAreaView>;
}

function Section({ title, lines }: { title: string; lines: string[] }) { return <View style={s.section}><Text style={s.heading}>{title}</Text>{lines.map(line => <Text style={s.body} key={line}>• {line}</Text>)}</View>; }
const s = StyleSheet.create({ bg:{ flex:1,backgroundColor:'#f0faf4' }, center:{ flex:1,alignItems:'center',justifyContent:'center' }, wrap:{ padding:18 }, card:{ backgroundColor:'#fff',borderRadius:18,padding:20,shadowColor:'#000',shadowOpacity:.08,shadowRadius:16,elevation:3 }, icon:{ width:38,height:38,borderRadius:19,backgroundColor:GREEN,alignSelf:'center',alignItems:'center',justifyContent:'center' }, iconText:{ color:'#fff',fontSize:20,fontWeight:'700' }, title:{ textAlign:'center',fontSize:20,fontWeight:'700',color:'#173126',marginTop:10 }, subtitle:{ textAlign:'center',color:'#64748b',fontSize:13,marginTop:4 }, notice:{ backgroundColor:'#fff8df',borderRadius:9,padding:11,marginTop:17 }, noticeText:{ color:'#6b5612',fontSize:13,lineHeight:19 }, section:{ marginTop:17 }, heading:{ color:GREEN,fontSize:15,fontWeight:'700',marginBottom:4 }, body:{ color:'#334155',fontSize:13,lineHeight:20,marginTop:2 }, contact:{ backgroundColor:'#f0faf4',borderLeftWidth:3,borderLeftColor:'#72b892',padding:10,marginTop:17 }, contactTitle:{ color:GREEN,fontSize:13,fontWeight:'700' }, contactText:{ color:'#475569',fontSize:12,lineHeight:18,marginTop:3 }, confirmRow:{ flexDirection:'row',gap:10,alignItems:'flex-start',marginTop:20 }, confirmText:{ flex:1,color:'#334155',fontSize:13,lineHeight:19 }, accept:{ backgroundColor:GREEN,borderRadius:10,paddingVertical:14,alignItems:'center',marginTop:16 }, acceptText:{ color:'#fff',fontSize:15,fontWeight:'700' }, decline:{ textAlign:'center',color:'#9f1239',fontSize:14,fontWeight:'600',paddingTop:15,paddingBottom:2 }, disabled:{ opacity:.5 } });
