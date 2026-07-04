// Feature: mobile-sdk53-upgrade
//
// Icon Build Gate (design.md B1 "ใช้ในขั้น build gate", Error Handling "Icon
// validation", Req 5.6)
//
// Reads the ACTUAL pixel dimensions of the app icon PNGs and runs the pure
// `validateIcon` rule (do NOT reimplement it here — reuse ./icon-validator).
// If any icon is mis-proportioned (`ok:false`) the gate prints the reason
// (NOT_SQUARE / TOO_SMALL), the detail, and the offending file to stderr and
// exits non-zero, so the build cannot proceed with a bad icon.
//
// Design keeps two pure, testable pieces separate from the file/`process`
// side-effects (task 9.3 tests these):
//   - `readPngDimensions(bytes)`  : parse a PNG IHDR header -> {width,height}
//   - `runIconGate(files)`        : apply `validateIcon` over given dimensions
// The CLI entry (`main`) does the I/O: read files -> call the pure pieces ->
// print -> exit.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

import { readFileSync } from 'fs';
import { join } from 'path';

import { validateIcon } from './icon-validator';
import type { IconDimensions, IconValidationResult } from './types';

/** PNG files (relative to the moph-meet app root) checked by the build gate. */
export const ICON_FILES: readonly string[] = [
  'assets/images/icon.png',
  'assets/images/adaptive-icon.png',
];

/** The 8-byte PNG signature that every PNG file starts with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Read a 32-bit big-endian unsigned integer from `bytes` at `offset`. */
function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/**
 * Parse the pixel dimensions out of a PNG's IHDR header.
 *
 * PNG layout: 8-byte signature, then the IHDR chunk whose data begins at byte
 * 16 with width (bytes 16-19, big-endian) and height (bytes 20-23, big-endian).
 *
 * Pure function: depends only on `bytes`. Throws if the input is not a valid
 * PNG (bad signature or too short) so the gate fails loudly rather than reading
 * a bogus size.
 */
export function readPngDimensions(bytes: Uint8Array): IconDimensions {
  if (bytes.length < 24) {
    throw new Error('Not a valid PNG: file is too short to contain an IHDR header.');
  }

  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Not a valid PNG: signature mismatch.');
    }
  }

  const width = readUInt32BE(bytes, 16);
  const height = readUInt32BE(bytes, 20);
  return { width, height };
}

/** A single file's dimensions fed into the gate. */
export type IconFileDimensions = {
  path: string;
  dimensions: IconDimensions;
};

/** One failed icon, pairing the offending file with its validation result. */
export type IconGateFailure = {
  path: string;
  result: Extract<IconValidationResult, { ok: false }>;
};

/** Outcome of running the gate over a set of icon files. */
export type IconGateResult = {
  ok: boolean;
  failures: IconGateFailure[];
};

/**
 * Apply `validateIcon` to each icon file's dimensions and aggregate the result.
 *
 * Pure function: no file or `process` access. `ok` is true iff every file
 * passes; `failures` lists each file that failed together with its reason,
 * preserved in input order (Req 5.6).
 */
export function runIconGate(files: readonly IconFileDimensions[]): IconGateResult {
  const failures: IconGateFailure[] = [];

  for (const file of files) {
    const result = validateIcon(file.dimensions);
    if (!result.ok) {
      failures.push({ path: file.path, result });
    }
  }

  return { ok: failures.length === 0, failures };
}

/** Format a single failure into a human-readable one-line error message. */
export function formatFailure(failure: IconGateFailure): string {
  return `  ✗ ${failure.path}: ${failure.result.reason} — ${failure.result.detail}`;
}

/**
 * CLI entry: read the real icon files from disk, run the gate, print the
 * outcome, and exit with a non-zero status when any icon is mis-proportioned so
 * the build is blocked (Req 5.6).
 *
 * @param rootDir base directory the icon paths are resolved against
 */
export function main(rootDir: string = process.cwd()): number {
  const files: IconFileDimensions[] = [];

  for (const relPath of ICON_FILES) {
    const absPath = join(rootDir, relPath);
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(absPath);
    } catch {
      console.error(`Icon build gate FAILED: cannot read icon file "${relPath}".`);
      return 1;
    }

    try {
      files.push({ path: relPath, dimensions: readPngDimensions(bytes) });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`Icon build gate FAILED: "${relPath}" — ${reason}`);
      return 1;
    }
  }

  const gate = runIconGate(files);

  if (!gate.ok) {
    console.error('Icon build gate FAILED — mis-proportioned icon(s) detected:');
    for (const failure of gate.failures) {
      console.error(formatFailure(failure));
    }
    console.error('Fix the icon assets (square 1:1, ≥ 1024×1024) before building.');
    return 1;
  }

  console.log(
    `Icon build gate PASSED — ${files.length} icon(s) are square and ≥ 1024×1024.`,
  );
  return 0;
}

// Run the gate when this file is invoked directly (e.g. `ts-node check-icons.ts`
// or `node check-icons.js`), but not when imported by tests.
if (require.main === module) {
  process.exit(main());
}
