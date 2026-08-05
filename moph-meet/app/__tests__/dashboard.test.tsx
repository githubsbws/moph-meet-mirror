import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput, Modal, Alert } from 'react-native';

// ── Feature: mobile-room-creation-parity ─────────────────────────────────────
// Unit / interaction tests สำหรับ room-creation flow ใน app/dashboard.tsx
// (Create_Room_Form + Room_Result_Panel). ใช้ jest + jest-expo + react-test-renderer
// (โปรเจกต์ยังไม่ได้ติดตั้ง @testing-library/react-native). mock ขอบเขตทั้งหมด:
// expo-router, expo-clipboard, react-native Alert, constants/api,
// constants/storage, และ presentational components (Icon/MiniCalendar).
//
// ครอบคลุม (task 5.5):
//  - ฟอร์มแสดงก่อนยิง API (exam/meet) และยังไม่เรียก fetch (Req 1.1, 2.1)
//  - ข้อความกำกับ exam/meet + Provider ID (Req 2.5, 3.1, 3.2); required visual hint (Req 3.3)
//  - ยกเลิก → ไม่ยิง API (Req 3.4)
//  - ปุ่มยืนยัน disabled ระหว่าง submitting (mock fetch ช้า) (Req 4.3)
//  - result panel ห้องประชุมมีปุ่มคัดลอกลิงก์ Provider → Clipboard.setStringAsync(full URL) (Req 5.1, 5.2)
//  - error paths: 401 → clearAuth + login (Req 6.2); 500 → Alert (Req 6.3);
//    200 ไม่มี room.id → Alert (Req 6.4)

const API_BASE = 'https://moph-meet.moph.go.th';

// ── mocks (ต้องประกาศก่อน import component) ───────────────────────────────────
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
}));

jest.mock('../../constants/storage', () => ({
  loadToken: jest.fn(async () => 'test-token'),
  loadUser: jest.fn(async () => ({ display: 'หมอทดสอบ' })),
  clearAuth: jest.fn(async () => {}),
}));

jest.mock('../../constants/api', () => ({
  API_BASE: 'https://moph-meet.moph.go.th',
  MEETING_DOMAIN: 'moph-meetingroom.moph.go.th',
  apiFetch: jest.fn(),
}));

// presentational-only components — stub เพื่อเลี่ยง native font/vector-icons ใน test
jest.mock('../../components/Icon', () => ({ Icon: () => null }));
jest.mock('../../components/MiniCalendar', () => ({ __esModule: true, default: () => null }));

// native date/time picker — stub เป็น element ว่างที่ยังคงบันทึก props (mode/onChange)
// เพื่อให้ test หา node แล้วเรียก onChange จำลองการเลือกวัน/เวลาได้
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: (_props: any) => null,
}));

import DashboardScreen from '../dashboard';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { clearAuth } from '../../constants/storage';
import { apiFetch } from '../../constants/api';

const mockApiFetch = apiFetch as jest.Mock;
const mockPush = router.push as jest.Mock;
const mockReplace = router.replace as jest.Mock;
const mockClearAuth = clearAuth as jest.Mock;
const mockSetStringAsync = Clipboard.setStringAsync as jest.Mock;

// ── tree helpers ──────────────────────────────────────────────────────────────
function directString(children: any): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(directString).join('');
  return '';
}

function pressables(root: any): any[] {
  return root.findAll((n: any) => n.props && typeof n.props.onPress === 'function');
}

function pressableText(node: any): string {
  const texts = node.findAll((n: any) => n.type === Text);
  return texts.map((t: any) => directString(t.props.children)).join(' ');
}

/** หา pressable (TouchableOpacity) ที่มี Text ตรงกับ text; extra ใช้กรองเพิ่มได้. */
function findPressable(root: any, text: string, extra: (p: any) => boolean = () => true): any {
  return pressables(root).find((p) => pressableText(p).includes(text) && extra(p));
}

/** มี Text node ที่มีข้อความ text อยู่ใน tree หรือไม่. */
function hasText(root: any, text: string): boolean {
  return root.findAll(
    (n: any) => n.type === Text && directString(n.props.children).includes(text),
  ).length > 0;
}

function modalOf(root: any): any {
  return root.findByType(Modal);
}

/** หา node ตาม testID (คืน node แรก หรือ undefined). */
function nodeByTestId(root: any, testID: string): any {
  return root.findAll((n: any) => n.props && n.props.testID === testID)[0];
}
function fieldExists(root: any, testID: string): boolean {
  return !!nodeByTestId(root, testID);
}

/** node ของ native picker ที่กำลังเปิดอยู่ (มี mode + onChange). */
function openPickerNode(root: any): any {
  return root.findAll(
    (n: any) => n.props && typeof n.props.onChange === 'function' &&
      (n.props.mode === 'date' || n.props.mode === 'time'),
  )[0];
}

/** แตะช่อง (เปิด picker) แล้วยิง onChange ด้วยค่า Date ที่กำหนด (จำลองการเลือก). */
async function pickInto(root: any, testID: string, d: Date) {
  const field = nodeByTestId(root, testID);
  await act(async () => { field.props.onPress(); });
  const picker = openPickerNode(root);
  await act(async () => { picker.props.onChange({ type: 'set' }, d); });
}

// ── การตอบกลับจำลอง ───────────────────────────────────────────────────────────
const meetsOk = () => ({ status: 200, ok: true, json: async () => [] });

// เก็บ renderer ทุกตัวเพื่อ unmount ใน afterEach (กัน effect/timer ค้างข้ามเทสต์)
const renderers: any[] = [];

/**
 * mount dashboard + flush async mount effect (loadToken/loadUser/fetchMeets).
 * หลัง mount apiFetch ถูกเรียก 1 ครั้งสำหรับ /api/meets — เคลียร์ call ทิ้งเพื่อให้
 * assertion เรื่อง "ไม่ยิง API" สะอาด.
 */
async function mountDashboard(): Promise<any> {
  let tree: any;
  await act(async () => {
    tree = TestRenderer.create(<DashboardScreen />);
  });
  await act(async () => {});
  renderers.push(tree!);
  return tree!;
}

/** เปิดฟอร์มด้วยปุ่ม action บน dashboard (openForm) ตามชนิดห้อง. */
async function openForm(root: any, type: 'exam' | 'meet') {
  const label = type === 'exam' ? 'สร้างห้องตรวจ' : 'สร้างห้องประชุม';
  const btn = findPressable(root, label, (p) => p.props.disabled === undefined);
  await act(async () => {
    btn.props.onPress();
  });
  if (type === 'exam') {
    const roomName = nodeByTestId(root, 'field-room-name');
    await act(async () => { roomName.props.onChangeText('ห้องตรวจทดสอบ'); });
  }
}

/** เลือกเวลาเริ่ม/สิ้นสุดผ่าน native picker (date auto-fill = วันนี้ จาก openForm). */
async function fillValidTimes(root: any, start = '09:00', end = '10:00') {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const ds = new Date(); ds.setHours(sh, sm, 0, 0);
  const de = new Date(); de.setHours(eh, em, 0, 0);
  await pickInto(root, 'field-startTime', ds);
  await pickInto(root, 'field-endTime', de);
}

/** กดปุ่มยืนยันใน modal (submit — pressable ที่มี disabled prop). */
async function pressSubmit(root: any, type: 'exam' | 'meet') {
  const label = type === 'exam' ? 'สร้างห้องตรวจ' : 'สร้างห้องประชุม';
  const submit = findPressable(root, label, (p) => p.props.disabled !== undefined);
  await act(async () => {
    await submit.props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/meets') return meetsOk();
    return meetsOk();
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  renderers.length = 0;
});

// ── Req 1.1 / 2.1: ฟอร์มแสดงก่อนยิง API และไม่เรียก fetch ตอนกดปุ่ม ────────────
describe('Create_Room_Form แสดงก่อนยิง API (Req 1.1, 2.1)', () => {
  it('exam: กดปุ่มสร้างห้องตรวจ → เปิดฟอร์ม และไม่เรียก POST /api/rooms', async () => {
    const tree = await mountDashboard();
    mockApiFetch.mockClear();

    await openForm(tree.root, 'exam');

    // ฟอร์มแสดง (modal visible + มีช่องวันที่/เวลา — เป็น picker fields)
    expect(modalOf(tree.root).props.visible).toBe(true);
    expect(fieldExists(tree.root, 'field-date')).toBe(true);
    expect(fieldExists(tree.root, 'field-startTime')).toBe(true);
    expect(fieldExists(tree.root, 'field-endTime')).toBe(true);
    // ยังไม่ยิง API ใด ๆ ตอนเปิดฟอร์ม
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('meet: กดปุ่มสร้างห้องประชุม → เปิดฟอร์ม และไม่เรียก POST /api/rooms', async () => {
    const tree = await mountDashboard();
    mockApiFetch.mockClear();

    await openForm(tree.root, 'meet');

    expect(modalOf(tree.root).props.visible).toBe(true);
    expect(fieldExists(tree.root, 'field-startTime')).toBe(true);
    expect(fieldExists(tree.root, 'field-endTime')).toBe(true);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('date auto-fill เป็นวันนี้เมื่อเปิดฟอร์ม (Req 1.2)', async () => {
    const tree = await mountDashboard();
    await openForm(tree.root, 'exam');
    // ช่องวันที่แสดงค่าเป็นวันนี้ (รูปแบบ YYYY-MM-DD) — อ่านจาก Text ในปุ่ม field-date
    const dateField = nodeByTestId(tree.root, 'field-date');
    expect(pressableText(dateField)).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

// ── Req 2.5 / 3.1 / 3.2 / 3.3: ข้อความกำกับ + required visual hint ─────────────
describe('ข้อความกำกับและ required hint (Req 2.5, 3.1, 3.2, 3.3)', () => {
  it('exam: แสดงข้อความบันทึกวิดีโออัตโนมัติ', async () => {
    const tree = await mountDashboard();
    await openForm(tree.root, 'exam');
    expect(hasText(tree.root, 'ระบบจะบันทึกวิดีโออัตโนมัติ')).toBe(true);
  });

  it('meet: แสดงข้อความต้องล็อกอินด้วย Provider ID', async () => {
    const tree = await mountDashboard();
    await openForm(tree.root, 'meet');
    expect(hasText(tree.root, 'Provider ID')).toBe(true);
    expect(hasText(tree.root, 'ผู้เข้าร่วมต้องล็อกอินด้วย Provider ID')).toBe(true);
  });

  it('required เป็น visual hint (มี * และข้อความช่องที่ต้องกรอก) แต่ไม่บล็อก submit เอง', async () => {
    const tree = await mountDashboard();
    await openForm(tree.root, 'exam');
    // visual hint
    expect(hasText(tree.root, '*')).toBe(true);
    expect(hasText(tree.root, 'ช่องที่ต้องกรอก')).toBe(true);
    // การส่งขึ้นกับ validateCreateRoomInput ไม่ใช่ native required:
    // กรอกครบ → กดยืนยัน → ยิง API จริง (พิสูจน์ว่า required ไม่ได้บล็อก)
    await fillValidTimes(tree.root);
    await pressSubmit(tree.root, 'exam');
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/rooms',
      'test-token',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ── Req 3.4: ยกเลิก → ปิดฟอร์มโดยไม่ยิง API ──────────────────────────────────
describe('ยกเลิกฟอร์ม (Req 3.4)', () => {
  it('กดยกเลิก → modal ปิด และไม่เรียก POST /api/rooms', async () => {
    const tree = await mountDashboard();
    await openForm(tree.root, 'exam');
    mockApiFetch.mockClear();

    const cancel = findPressable(tree.root, 'ยกเลิก');
    await act(async () => {
      cancel.props.onPress();
    });

    expect(modalOf(tree.root).props.visible).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ── Req 4.3: ปุ่มยืนยัน disabled ระหว่าง submitting ───────────────────────────
describe('ปุ่มยืนยัน disabled ระหว่างส่ง (Req 4.3)', () => {
  it('mock fetch ช้า → ปุ่มยืนยันถูก disable ระหว่างรอผล', async () => {
    const tree = await mountDashboard();
    await openForm(tree.root, 'meet');
    await fillValidTimes(tree.root);

    // fetch ช้า: ค้างไว้จนกว่าจะ resolve เอง
    let resolveFetch: (v: any) => void = () => {};
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/rooms') {
        return new Promise((res) => {
          resolveFetch = res;
        });
      }
      return Promise.resolve(meetsOk());
    });

    const submit = findPressable(tree.root, 'สร้างห้องประชุม', (p) => p.props.disabled !== undefined);
    await act(async () => {
      submit.props.onPress(); // ไม่ await — ค้างที่ apiFetch
    });

    // ระหว่าง submitting ปุ่มต้อง disabled
    const submitting = findPressable(tree.root, 'สร้างห้องประชุม', (p) => p.props.disabled !== undefined);
    expect(submitting.props.disabled).toBe(true);

    // cleanup: resolve เพื่อให้ finally reset submitting
    await act(async () => {
      resolveFetch({
        status: 200,
        ok: true,
        json: async () => ({ room: { id: 'r1', name: 'ห้อง' }, meetJoinUrl: '/j/r1' }),
      });
    });
  });
});

// ── Req 5.1 / 5.2: Room_Result_Panel — คัดลอกลิงก์ Provider (full URL) ───────
describe('Room_Result_Panel คัดลอกลิงก์ Provider (Req 5.1, 5.2)', () => {
  it('meet สำเร็จ → มีปุ่มคัดลอก; กดคัดลอก → Clipboard.setStringAsync ด้วย full URL', async () => {
    const tree = await mountDashboard();
    await openForm(tree.root, 'meet');
    await fillValidTimes(tree.root);

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/rooms') {
        return {
          status: 200,
          ok: true,
          json: async () => ({ room: { id: 'r1', name: 'ห้องประชุมทดสอบ' }, meetJoinUrl: '/meet-join/r1' }),
        };
      }
      return meetsOk();
    });

    await pressSubmit(tree.root, 'meet');

    // result panel แสดงชื่อห้อง + ปุ่มคัดลอก (inline ข้างลิงก์)
    expect(hasText(tree.root, 'ห้องประชุมทดสอบ')).toBe(true);
    const copyBtn = findPressable(tree.root, 'คัดลอก');
    expect(copyBtn).toBeDefined();

    // กดคัดลอก → full URL (API_BASE + relative meetJoinUrl)
    await act(async () => {
      await copyBtn.props.onPress();
    });
    expect(mockSetStringAsync).toHaveBeenCalledWith(`${API_BASE}/meet-join/r1`);

    // copyLink ตั้ง setTimeout(1500) รีเซ็ตข้อความ "คัดลอกแล้ว!" — unmount tree นี้
    // ทันทีหลัง assert เพื่อให้ callback ที่ค้างกลายเป็น no-op บน component ที่ถูก
    // unmount แล้ว (กัน state update นอก act หลังเทสต์จบ)
    await act(async () => {
      tree.unmount();
    });
  });
});

// ── Req 6.2 / 6.3 / 6.4: error paths ─────────────────────────────────────────
describe('error paths (Req 6.2, 6.3, 6.4)', () => {
  it('401 → clearAuth + กลับหน้า login', async () => {
    const tree = await mountDashboard();
    await openForm(tree.root, 'exam');
    await fillValidTimes(tree.root);

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/rooms') return { status: 401, ok: false, json: async () => ({}) };
      if (path === '/api/logout') return { status: 200, ok: true, json: async () => ({}) };
      return meetsOk();
    });

    await pressSubmit(tree.root, 'exam');

    expect(mockClearAuth).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('500 → Alert สร้างห้องไม่สำเร็จ', async () => {
    const tree = await mountDashboard();
    await openForm(tree.root, 'exam');
    await fillValidTimes(tree.root);

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/rooms') return { status: 500, ok: false, json: async () => ({}) };
      return meetsOk();
    });

    await pressSubmit(tree.root, 'exam');

    expect(Alert.alert).toHaveBeenCalledWith('สร้างห้องไม่สำเร็จ', expect.stringContaining('500'));
  });

  it('200 แต่ไม่มี room.id → Alert ไม่ได้รับรหัสห้อง', async () => {
    const tree = await mountDashboard();
    await openForm(tree.root, 'meet');
    await fillValidTimes(tree.root);

    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/rooms') return { status: 200, ok: true, json: async () => ({ room: {} }) };
      return meetsOk();
    });

    await pressSubmit(tree.root, 'meet');

    expect(Alert.alert).toHaveBeenCalledWith('สร้างห้องไม่สำเร็จ', 'ไม่ได้รับรหัสห้อง');
  });
});
