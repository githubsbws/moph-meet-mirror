// Feature: mobile-sdk53-upgrade
//
// B4. Alignment Verdict Aggregator (design.md Component B4, Req 7.5, 7.6, 8.3, 8.4)
//
// Pure functions that classify native library (`.so`) entries parsed from ELF /
// APK Analyzer output against Google Play's mandated 16KB page size. Used after
// build to decide whether every `.so` is 16KB aligned; if any is misaligned the
// 16KB gate fails and the misaligned names are reported. These functions NEVER
// modify `.so` files — the decision to fix (disable a flag / bump a lib) is left
// to a human (Req 7.6, 8.4).
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

import { PAGE_16KB } from './types';
import type { SoEntry, AlignmentReport } from './types';

/**
 * Whether a single `.so` entry's load-segment alignment is a multiple of the
 * 16KB page size (Req 7.5, 8.3).
 *
 * Pure function: output depends only on `entry.loadAlignment`.
 */
export function isAligned16k(entry: SoEntry): boolean {
  return entry.loadAlignment % PAGE_16KB === 0;
}

/**
 * Aggregate a 16KB alignment verdict over a set of `.so` entries.
 *
 * Rules (Req 7.5, 7.6, 8.3, 8.4):
 *  - `aligned` is true iff EVERY entry is 16KB aligned.
 *  - `misaligned` is the list of names of the entries that are NOT 16KB
 *    aligned, preserved in input order.
 *
 * Pure function: does not read or modify any `.so` file.
 */
export function aggregateAlignment(entries: SoEntry[]): AlignmentReport {
  const misaligned = entries
    .filter((entry) => !isAligned16k(entry))
    .map((entry) => entry.name);

  return {
    aligned: misaligned.length === 0,
    misaligned,
  };
}
