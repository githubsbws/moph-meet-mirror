// Feature: mobile-sdk53-upgrade
//
// Shared types for the MOPH Meet Expo SDK 52 -> 53 upgrade support tooling
// (Component B in design.md). These types are consumed by the pure-function
// utilities under `moph-meet/scripts/` and their property-based tests under
// `moph-meet/scripts/__tests__/`.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

// ---------------------------------------------------------------------------
// B1. Icon Asset Validator (Req 5.1, 5.6)
// ---------------------------------------------------------------------------

/** Pixel dimensions of an icon asset. */
export type IconDimensions = {
  width: number;
  height: number;
};

/**
 * Result of validating an icon asset.
 * `ok:true` iff the icon is square (1:1) and at least 1024x1024.
 * Otherwise `ok:false` with a reason:
 *  - `NOT_SQUARE`: width !== height
 *  - `TOO_SMALL`: square but width < 1024
 */
export type IconValidationResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_SQUARE' | 'TOO_SMALL'; detail: string };

// ---------------------------------------------------------------------------
// B2. Native Media Scanner (Req 7.1)
// ---------------------------------------------------------------------------

/** Whether the source tree references native .gif / .webp media via <Image>. */
export type MediaScanResult = {
  hasNativeGif: boolean;
  hasNativeWebp: boolean;
};

/** A single source file fed to the native media scanner. */
export type SourceFile = {
  path: string;
  content: string;
};

// ---------------------------------------------------------------------------
// B3. Gradle Media Flag Decider (Req 7.2, 7.3)
// ---------------------------------------------------------------------------

/** Fresco media flags written back to android/gradle.properties. */
export type GradleMediaFlags = {
  gifEnabled: boolean;
  webpEnabled: boolean;
};

// ---------------------------------------------------------------------------
// B4. Alignment Verdict Aggregator (Req 7.5, 7.6, 8.3, 8.4)
// ---------------------------------------------------------------------------

/** Google Play mandated 16KB page size, in bytes. */
export const PAGE_16KB = 16384;

/** A native library entry parsed from ELF / APK Analyzer output. */
export type SoEntry = {
  name: string;
  /** load-segment alignment in bytes */
  loadAlignment: number;
};

/** Aggregate verdict over a set of .so entries. */
export type AlignmentReport = {
  /** true iff every entry is 16KB aligned */
  aligned: boolean;
  /** names of misaligned .so files, in input order */
  misaligned: string[];
};

// ---------------------------------------------------------------------------
// New Architecture compatibility (Req 2.8, 2.9)
// ---------------------------------------------------------------------------

export type NewArchStatus =
  | 'รองรับ'
  | 'ไม่รองรับ'
  | 'ต้องอัปเกรดเวอร์ชัน'
  | 'ไม่ทราบสถานะ';

/**
 * New Architecture compatibility entry for a native module.
 * `mitigation` is required when status is 'ไม่รองรับ' or 'ไม่ทราบสถานะ'.
 */
export type NewArchCompatEntry = {
  module: string;
  status: NewArchStatus;
  mitigation?: string;
};

// ---------------------------------------------------------------------------
// Definition of Done (Req 9.1-9.3)
// ---------------------------------------------------------------------------

/**
 * Final acceptance state for the upgrade.
 * done = smokeTestPassed && targetSdk35 && all16kAligned && emulatorPageSize === 16384
 */
export type DefinitionOfDone = {
  smokeTestPassed: boolean;
  targetSdk35: boolean;
  all16kAligned: boolean;
  /** must equal 16384 */
  emulatorPageSize: number;
};
