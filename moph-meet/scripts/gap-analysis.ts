// Feature: mobile-sdk53-upgrade
//
// Gap-analysis data module (Requirement 2.1-2.8).
//
// Encodes the design's gap-analysis tables (design.md "Data Models") as
// exported, machine-checkable data so that completeness/validation tests
// (task 4.2, 4.4) can assert against a single source of truth.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/scripts/`.
//
// NOTE: `ComponentGap`, `DependencyGap`, and `BreakingChange` are defined
// locally here (NOT in ./types) to avoid write conflicts with a concurrent
// task that owns ./types. `NewArchCompatEntry` / `NewArchStatus` are the
// canonical shared types and are re-imported from ./types.

import type { NewArchCompatEntry, NewArchStatus } from './types';

// Re-export the shared New Arch types so downstream consumers can import
// everything gap-analysis-related from this module.
export type { NewArchCompatEntry, NewArchStatus };

// ---------------------------------------------------------------------------
// Local types (Req 2.1-2.7)
// ---------------------------------------------------------------------------

/**
 * High-level platform component version gap (Req 2.1).
 * The 4 headline moving parts of the SDK 52 -> 53 upgrade.
 */
export type ComponentGap = {
  component: 'SDK' | 'RN' | 'NDK' | 'React';
  current: string; // e.g. 'RN 0.76.9'
  target: string; // e.g. 'RN 0.79.x'
};

/**
 * Per-dependency version gap (Req 2.2, 2.3).
 * `mitigation` is required when `target === 'ไม่มีเวอร์ชันรองรับ'`.
 */
export type DependencyGap = {
  name: string; // package name as it appears in package.json
  current: string;
  target: string | 'ไม่มีเวอร์ชันรองรับ';
  mitigation?: string;
};

/**
 * A known breaking change affecting moph-meet (Req 2.4-2.7).
 */
export type BreakingChange = {
  area: 'reanimated' | 'expo-router' | 'react-native-webview' | 'react-19';
  description: string;
  impact: string; // impact on moph-meet, naming affected files
  remediation: string;
};

// ---------------------------------------------------------------------------
// ComponentGap — 4 rows (Req 2.1)
// ---------------------------------------------------------------------------

export const componentGaps: ComponentGap[] = [
  { component: 'SDK', current: '52', target: '53' },
  { component: 'RN', current: '0.76.9', target: '0.79.x' },
  { component: 'NDK', current: '26 (26.1.10909125)', target: 'r27+/r28' },
  { component: 'React', current: '18.3.1', target: '19.0.0' },
];

// ---------------------------------------------------------------------------
// DependencyGap — every dependency + devDependency key in package.json
// plus react-native-ble-plx (referenced by app.json plugin) (Req 2.2, 2.3)
// ---------------------------------------------------------------------------

export const dependencyGaps: DependencyGap[] = [
  // --- dependencies ---
  { name: '@expo/vector-icons', current: '^14.0.2', target: 'SDK53 range' },
  { name: '@react-navigation/bottom-tabs', current: '^7.2.0', target: 'SDK53-compatible' },
  { name: '@react-navigation/native', current: '^7.0.14', target: 'SDK53-compatible' },
  { name: 'expo', current: '~52.0.46', target: '~53.0.x' },
  { name: 'expo-auth-session', current: '~6.0.3', target: 'SDK53 range' },
  { name: 'expo-blur', current: '~14.0.3', target: 'SDK53 range' },
  { name: 'expo-constants', current: '~17.0.8', target: 'SDK53 range' },
  { name: 'expo-crypto', current: '~14.0.2', target: 'SDK53 range' },
  { name: 'expo-font', current: '~13.0.4', target: 'SDK53 range' },
  { name: 'expo-haptics', current: '~14.0.1', target: 'SDK53 range' },
  { name: 'expo-linking', current: '~7.0.5', target: 'SDK53 range' },
  { name: 'expo-router', current: '~4.0.20', target: '~5.0.x' },
  { name: 'expo-secure-store', current: '~14.0.1', target: 'SDK53 range' },
  { name: 'expo-splash-screen', current: '~0.29.24', target: 'SDK53 range' },
  { name: 'expo-status-bar', current: '~2.0.1', target: 'SDK53 range' },
  { name: 'expo-symbols', current: '~0.2.2', target: 'SDK53 range' },
  { name: 'expo-system-ui', current: '~4.0.9', target: 'SDK53 range' },
  { name: 'expo-web-browser', current: '~14.0.2', target: 'SDK53 range' },
  { name: 'react', current: '18.3.1', target: '19.0.0' },
  { name: 'react-dom', current: '18.3.1', target: '19.0.0' },
  { name: 'react-native', current: '0.76.9', target: '0.79.x' },
  { name: 'react-native-gesture-handler', current: '~2.20.2', target: 'SDK53 range (expo install --fix)' },
  { name: 'react-native-reanimated', current: '~3.16.1', target: '~3.17.x' },
  { name: 'react-native-safe-area-context', current: '4.12.0', target: 'SDK53 range' },
  { name: 'react-native-screens', current: '~4.4.0', target: 'SDK53 range' },
  { name: 'react-native-web', current: '~0.19.13', target: 'SDK53 range' },
  { name: 'react-native-webview', current: '^13.12.5', target: 'SDK53-compatible range' },

  // --- devDependencies ---
  { name: '@babel/core', current: '^7.25.2', target: 'SDK53 range (expo install --fix)' },
  { name: '@types/jest', current: '^29.5.12', target: 'คงเดิม (SDK53 range)' },
  { name: '@types/react', current: '~18.3.12', target: '~19.0.x' },
  {
    name: '@types/react-test-renderer',
    current: '^18.3.0',
    target: 'ทบทวน (React 19 deprecate react-test-renderer)',
    mitigation:
      'React 19 deprecate react-test-renderer — ทบทวนว่ายังต้องใช้หรือย้ายไป @testing-library/react-native; ถอดออกได้ถ้าไม่ใช้',
  },
  { name: 'fast-check', current: '^3.23.2', target: 'คงเดิม (property-based test lib)' },
  { name: 'jest', current: '^29.2.1', target: 'SDK53 range (jest-expo peer)' },
  { name: 'jest-expo', current: '~52.0.6', target: '~53.0.x' },
  {
    name: 'react-test-renderer',
    current: '18.3.1',
    target: 'ทบทวน/ถอด (deprecated ใน React 19)',
    mitigation:
      'react-test-renderer ถูก deprecate ใน React 19 — ถอดออกหรือย้ายไป @testing-library/react-native; ถ้าคงไว้ต้องตรง React 19',
  },
  { name: 'typescript', current: '^5.3.3', target: 'SDK53 range' },

  // --- referenced by app.json plugin (transitive / must confirm direct) ---
  {
    name: 'react-native-ble-plx',
    current: 'ไม่พบใน dependencies (อ้างใน app.json plugin + permissions)',
    target: 'SDK53-compatible range',
    mitigation:
      'ถูกอ้างใน app.json plugin/permissions แต่ไม่พบใน dependencies — ตรวจว่ามาจาก transitive หรือต้องประกาศตรง แล้วยืนยัน New Arch compat (Req 2.8)',
  },
];

// ---------------------------------------------------------------------------
// BreakingChange — reanimated / expo-router / react-native-webview / react-19
// (Req 2.4-2.7)
// ---------------------------------------------------------------------------

export const breakingChanges: BreakingChange[] = [
  {
    area: 'reanimated',
    description:
      'react-native-reanimated 3.17 (SDK53) — API/worklet + babel plugin changes บน RN 0.79 / New Architecture',
    impact:
      'กระทบ animation components: components/HelloWave.tsx, components/ParallaxScrollView.tsx, components/HapticTab.tsx',
    remediation:
      'อัปเป็น ~3.17.x, ยืนยัน react-native-reanimated/plugin ใน babel.config, ทดสอบ worklet/animation ให้ทำงานบน New Arch',
  },
  {
    area: 'expo-router',
    description:
      'expo-router 5 (SDK53) — breaking changes ใน routing/typed-routes + peer กับ @react-navigation 7',
    impact:
      'กระทบ layout/entry: app/_layout.tsx, app/index.tsx (main = expo-router/entry)',
    remediation:
      'อัปเป็น ~5.0.x, ตรวจ config/typed routes, ยืนยัน navigation + login flow (ProviderID + manual) ยังทำงาน',
  },
  {
    area: 'react-native-webview',
    description:
      'react-native-webview ต้องเป็นเวอร์ชันที่รองรับ RN 0.79 / New Architecture (Fabric)',
    impact:
      'กระทบ WebView wrapper หลัก: app/_layout.tsx (ALLOWED_HOSTS, offline, Cookie auth), constants/api.ts, constants/jitsiEmbed.ts',
    remediation:
      'อัปเป็นช่วงที่ SDK53 รองรับ, ยืนยัน Cookie auth (credentials include) + domain whitelist + camera/mic บน Fabric ไม่ regress',
  },
  {
    area: 'react-19',
    description:
      'React 19.0.0 — JSX transform, ref-as-prop, และ react-test-renderer ถูก deprecate',
    impact:
      'กระทบทั้งโปรเจกต์ (JSX/ref usage) + @types/react ~19, และ test setup ที่ใช้ react-test-renderer',
    remediation:
      'อัป react/react-dom เป็น 19.0.0 + @types/react ~19.0.x, ปรับ ref-as-prop, ทบทวน/ถอด react-test-renderer',
  },
];

// ---------------------------------------------------------------------------
// NewArchCompat — 6 native modules (Req 2.8, 2.9)
// mitigation required when status is 'ไม่รองรับ' or 'ไม่ทราบสถานะ'
// ---------------------------------------------------------------------------

export const newArchCompat: NewArchCompatEntry[] = [
  { module: 'react-native-webview', status: 'รองรับ' },
  { module: 'react-native-gesture-handler', status: 'รองรับ' },
  { module: 'react-native-screens', status: 'รองรับ' },
  { module: 'react-native-reanimated', status: 'รองรับ' },
  { module: 'expo-blur', status: 'รองรับ' },
  {
    module: 'react-native-ble-plx',
    status: 'ไม่ทราบสถานะ',
    mitigation:
      'ไม่พบใน dependencies โดยตรง + ยังไม่ยืนยัน New Arch (Fabric/TurboModule) support — ตรวจเวอร์ชันที่รองรับ RN 0.79 New Arch ก่อน build; ถ้าไม่รองรับให้พิจารณาปิด/แทนที่ฟีเจอร์ BLE',
  },
];
