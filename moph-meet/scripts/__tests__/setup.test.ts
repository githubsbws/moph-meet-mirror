// Feature: mobile-sdk53-upgrade
//
// Scaffold / convention test for the support-tooling test suite.
//
// This file documents and exercises the testing convention used by every
// property-based test in this folder:
//
//   1. Tag each property test with a comment in the form:
//        // Feature: mobile-sdk53-upgrade, Property {n}: {property text}
//   2. Drive property tests with `fast-check` (fc.assert + fc.property).
//   3. Run at least 100 iterations per property via `{ numRuns: 100 }`.
//
// The concrete pure functions (validateIcon, scanNativeMedia, decideMediaFlags,
// aggregateAlignment, isPathInScope, ...) and their real property tests are
// implemented in later tasks (2.x, 4.x, 7.x). This file only proves the
// framework wiring so those tasks can drop tests in without further setup.

import fc from 'fast-check';

import { PAGE_16KB } from '../types';
import type { DefinitionOfDone } from '../types';

/**
 * Shared fast-check run config for every property test in this suite.
 *
 * Intentionally left unannotated so its inferred type ({ numRuns: number }) is
 * structurally assignable to `fc.Parameters<Ts>` for any tuple `Ts`. Annotating
 * it as bare `fc.Parameters` would default the generic to `void` and clash with
 * the `fc.assert` overloads (their `examples` field would expect `void[]`).
 */
export const PBT_CONFIG = { numRuns: 100 };

describe('support-tooling test scaffold', () => {
  it('wires fast-check with the shared { numRuns: 100 } convention', () => {
    // Feature: mobile-sdk53-upgrade, Property 0: scaffold sanity — for any
    // non-negative integer n, n + 0 === n (placeholder proving fc.assert runs
    // 100 iterations; replaced by real properties in tasks 2.x/4.x/7.x).
    fc.assert(
      fc.property(fc.nat(), (n) => n + 0 === n),
      PBT_CONFIG,
    );
  });

  it('exposes shared types and constants from ../types', () => {
    expect(PAGE_16KB).toBe(16384);

    const dod: DefinitionOfDone = {
      smokeTestPassed: true,
      targetSdk35: true,
      all16kAligned: true,
      emulatorPageSize: PAGE_16KB,
    };
    const done =
      dod.smokeTestPassed &&
      dod.targetSdk35 &&
      dod.all16kAligned &&
      dod.emulatorPageSize === PAGE_16KB;

    expect(done).toBe(true);
  });
});
