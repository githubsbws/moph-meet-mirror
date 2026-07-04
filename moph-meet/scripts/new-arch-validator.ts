// Feature: mobile-sdk53-upgrade
//
// New Architecture gap completeness validator (Component B, design.md Property 8).
// Pure function — no side effects, no I/O. Used to formalize acceptance
// criterion Req 2.9: every native module whose New Arch compatibility is
// negative or unknown must carry a non-empty mitigation.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

import type { NewArchCompatEntry, NewArchStatus } from './types';

/**
 * Statuses that REQUIRE a mitigation to be present (Req 2.9).
 * A module that is unsupported or of unknown status must document how the
 * upgrade copes with it.
 */
const STATUSES_REQUIRING_MITIGATION: ReadonlySet<NewArchStatus> = new Set<NewArchStatus>([
  'ไม่รองรับ',
  'ไม่ทราบสถานะ',
]);

/** Result of validating a set of New Arch compatibility entries. */
export type NewArchGapValidation = {
  /** true iff every entry requiring a mitigation has a non-empty one */
  valid: boolean;
  /** module names that require but lack a mitigation, in input order */
  missingMitigation: string[];
};

/**
 * Validate that every entry whose status is 'ไม่รองรับ' or 'ไม่ทราบสถานะ'
 * has a non-empty (non-whitespace) `mitigation` field.
 *
 * @param entries New Architecture compatibility entries to validate.
 * @returns `{ valid, missingMitigation }` where `valid` is true iff all such
 *          entries have a non-empty mitigation, and `missingMitigation` lists
 *          the offending module names in input order.
 */
export function validateNewArchGaps(
  entries: NewArchCompatEntry[]
): NewArchGapValidation {
  const missingMitigation: string[] = [];

  for (const entry of entries) {
    if (!STATUSES_REQUIRING_MITIGATION.has(entry.status)) {
      continue;
    }

    const mitigation = entry.mitigation;
    const hasMitigation =
      typeof mitigation === 'string' && mitigation.trim().length > 0;

    if (!hasMitigation) {
      missingMitigation.push(entry.module);
    }
  }

  return {
    valid: missingMitigation.length === 0,
    missingMitigation,
  };
}
