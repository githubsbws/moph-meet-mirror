// Feature: mobile-sdk53-upgrade
//
// B3. Gradle Media Flag Decider (design.md Component B3, Req 7.2, 7.3)
//
// Pure function that maps a native media scan result to the Fresco media flags
// written back to android/gradle.properties (`expo.gif.enabled`,
// `expo.webp.enabled`). No native usage detected -> flag is false.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

import type { MediaScanResult, GradleMediaFlags } from './types';

/**
 * Decide the Gradle Fresco media flags from a native media scan result.
 *
 * Rules (Req 7.2, 7.3):
 *  - `gifEnabled === scan.hasNativeGif`
 *  - `webpEnabled === scan.hasNativeWebp`
 *
 * Pure function: output depends only on the input scan result.
 */
export function decideMediaFlags(scan: MediaScanResult): GradleMediaFlags {
  return {
    gifEnabled: scan.hasNativeGif,
    webpEnabled: scan.hasNativeWebp,
  };
}
