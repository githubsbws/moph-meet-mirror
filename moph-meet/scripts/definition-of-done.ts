// Feature: mobile-sdk53-upgrade
//
// Definition of Done predicate (design.md "DefinitionOfDone", Req 9.1-9.3)
//
// Pure functions that decide whether the SDK 52 -> 53 upgrade has met its final
// acceptance criteria. The upgrade is "done" only when every criterion holds:
//   - the smoke-test checklist passed          (Req 9.1)
//   - the resolved Android targetSdk is 35      (Req 9.2)
//   - every native `.so` is 16KB aligned        (Req 9.3)
//   - the verification emulator reports a 16KB page size (must equal 16384)
//
// These functions consume already-collected boolean/number facts (fed in from
// build output, alignment verdict, and `adb shell getconf PAGE_SIZE`); they do
// NOT run builds or touch the device themselves.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

import { PAGE_16KB } from './types';
import type { DefinitionOfDone } from './types';

/**
 * Whether the upgrade satisfies the Definition of Done (Req 9.1-9.3).
 *
 * done = smokeTestPassed && targetSdk35 && all16kAligned
 *        && emulatorPageSize === PAGE_16KB
 *
 * Pure function: output depends only on the fields of `dod`.
 */
export function isDone(dod: DefinitionOfDone): boolean {
  return (
    dod.smokeTestPassed &&
    dod.targetSdk35 &&
    dod.all16kAligned &&
    dod.emulatorPageSize === PAGE_16KB
  );
}

/**
 * List the human-readable criteria that are NOT yet met, in a stable order, for
 * reporting when `isDone` is false. Returns an empty array when the upgrade is
 * done.
 *
 * Pure function: does not read or modify any external state.
 */
export function unmetCriteria(dod: DefinitionOfDone): string[] {
  const unmet: string[] = [];

  if (!dod.smokeTestPassed) {
    unmet.push('smoke test ยังไม่ผ่าน (Req 9.1)');
  }
  if (!dod.targetSdk35) {
    unmet.push('targetSdkVersion ยังไม่เป็น 35 (Req 9.2)');
  }
  if (!dod.all16kAligned) {
    unmet.push('ยังมี .so ที่ไม่ align ที่ 16KB (Req 9.3)');
  }
  if (dod.emulatorPageSize !== PAGE_16KB) {
    unmet.push(
      `emulator page size = ${dod.emulatorPageSize} (ต้องเป็น ${PAGE_16KB})`
    );
  }

  return unmet;
}
