/**
 * MiniCalendar — month grid marking dates that have meetings.
 * Parity with user-app-lite mini-calendar. Tap a date to filter; tap again to clear.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const GREEN = '#1b7a43';
const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const DAYS_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function iso(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

export default function MiniCalendar({
  marked, selected, onSelect,
}: { marked: Set<string>; selected: string | null; onSelect: (d: string | null) => void }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function prev() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  return (
    <View>
      <View style={s.nav}>
        <TouchableOpacity onPress={prev} style={s.navBtn}><Text style={s.navArrow}>◀</Text></TouchableOpacity>
        <Text style={s.navTitle}>{MONTHS_TH[month]} {year + 543}</Text>
        <TouchableOpacity onPress={next} style={s.navBtn}><Text style={s.navArrow}>▶</Text></TouchableOpacity>
      </View>
      <View style={s.weekRow}>
        {DAYS_TH.map(d => <Text key={d} style={s.weekDay}>{d}</Text>)}
      </View>
      <View style={s.grid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={s.cell} />;
          const dateStr = iso(year, month, d);
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
          const hasMeet = marked.has(dateStr);
          const isSel = selected === dateStr;
          return (
            <TouchableOpacity
              key={i}
              style={[s.cell, isToday && s.today, isSel && s.selected]}
              onPress={() => onSelect(isSel ? null : dateStr)}
            >
              <Text style={[s.cellText, isSel && s.selectedText]}>{d}</Text>
              {hasMeet && <View style={[s.dot, isSel && s.dotSel]} />}
            </TouchableOpacity>
          );
        })}
      </View>
      {selected && (
        <TouchableOpacity onPress={() => onSelect(null)} style={s.clearBtn}>
          <Text style={s.clearText}>ล้างตัวกรองวันที่</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  nav:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn:  { padding: 6 },
  navArrow:{ color: GREEN, fontSize: 16 },
  navTitle:{ fontWeight: '700', color: '#1e293b', fontSize: 14 },
  weekRow: { flexDirection: 'row' },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingVertical: 4 },
  grid:    { flexDirection: 'row', flexWrap: 'wrap' },
  cell:    { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellText:{ fontSize: 13, color: '#334155' },
  today:   { borderWidth: 1, borderColor: GREEN, borderRadius: 8 },
  selected:{ backgroundColor: GREEN, borderRadius: 8 },
  selectedText: { color: '#fff', fontWeight: '700' },
  dot:     { width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN, marginTop: 2 },
  dotSel:  { backgroundColor: '#fff' },
  clearBtn:{ alignSelf: 'center', marginTop: 8 },
  clearText:{ color: GREEN, fontSize: 12 },
});
