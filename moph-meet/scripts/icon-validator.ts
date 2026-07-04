// Feature: mobile-sdk53-upgrade
//
// B1. Icon Asset Validator (design.md B1; Requirements 5.1, 5.6)
//
// Pure function that validates an icon asset's pixel dimensions. Used at the
// build gate: an icon must be square (1:1) and at least 1024x1024. Types are
// shared from `./types` (do NOT redefine here).
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

import type { IconDimensions, IconValidationResult } from './types';

/** Minimum required side length (px) for an app icon. */
const MIN_ICON_SIZE = 1024;

/**
 * Validate an icon asset's dimensions.
 *
 * Returns `{ ok: true }` iff the icon is square (`width === height`) AND at
 * least 1024x1024. Otherwise returns `{ ok: false, reason, detail }`:
 *  - `NOT_SQUARE` when `width !== height`
 *  - `TOO_SMALL`  when square but `width < 1024`
 *
 * @param dim pixel dimensions of the icon
 */
export function validateIcon(dim: IconDimensions): IconValidationResult {
  const { width, height } = dim;

  if (width !== height) {
    return {
      ok: false,
      reason: 'NOT_SQUARE',
      detail: `Icon must be square (1:1) but got ${width}x${height} (width !== height).`,
    };
  }

  if (width < MIN_ICON_SIZE) {
    return {
      ok: false,
      reason: 'TOO_SMALL',
      detail: `Icon must be at least ${MIN_ICON_SIZE}x${MIN_ICON_SIZE} but got ${width}x${height}.`,
    };
  }

  return { ok: true };
}
