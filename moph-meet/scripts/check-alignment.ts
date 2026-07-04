// Feature: mobile-sdk53-upgrade
//
// Task 11.2 — Alignment check + Fresco `.so` verification (design.md Component
// B4 usage + Error Handling "16KB alignment", Req 7.4, 7.5, 7.6, 8.3, 8.4).
//
// After building the APK/AAB (task 11.1) we inspect every native library
// (`.so`) with APK Analyzer / `readelf` and confirm each one's LOAD-segment
// alignment is a multiple of the 16KB page size Google Play mandates. This
// script:
//   1. Parses APK-Analyzer / readelf style text into `SoEntry[]`
//      (`parseSoEntries` — pure).
//   2. Feeds it to `aggregateAlignment` (from ./alignment — NOT modified here).
//   3. Verifies the Fresco decoders that were disabled in task 10.1
//      (`libgifimage.so`, `libstatic-webp.so`) are ABSENT from the bundle
//      (`checkFrescoAbsence` — pure) and reports any remaining Fresco libs.
//   4. If anything is misaligned, prints the offending names and exits
//      non-zero. It NEVER rewrites a `.so` — fixing alignment is a human
//      decision (disable a flag / bump a lib), per Req 7.6 & 8.4.
//
// The pure logic (parser, Fresco check, verdict assembly) is split from the
// CLI I/O (reading the file arg + `process.exit`) which is guarded by
// `require.main === module`, so the logic is unit/property testable.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

import { readFileSync } from 'fs';

import { aggregateAlignment } from './alignment';
import { PAGE_16KB } from './types';
import type { SoEntry, AlignmentReport } from './types';

// ---------------------------------------------------------------------------
// Fresco libraries (design.md "Fresco_Libs", Req 7.4)
// ---------------------------------------------------------------------------

/** The gif decoder Fresco ships; present only when `expo.gif.enabled=true`. */
export const LIB_GIF = 'libgifimage.so';
/** The static webp decoder; present only when `expo.webp.enabled=true`. */
export const LIB_STATIC_WEBP = 'libstatic-webp.so';

/**
 * Known Fresco native libraries whose presence we surface in the report. The
 * gif/webp decoders above are gated behind the media flags (disabled in task
 * 10.1); the others are Fresco's core image pipeline and may legitimately
 * remain — we only report their status, we do not fail on them.
 */
export const KNOWN_FRESCO_LIBS: readonly string[] = [
  LIB_GIF,
  LIB_STATIC_WEBP,
  'libimagepipeline.so',
  'libnative-imagetranscoder.so',
  'libnative-filters.so',
  'libnativewebp.so',
];

// ---------------------------------------------------------------------------
// Pure parsing helpers
// ---------------------------------------------------------------------------

/** Reduce a possibly path-qualified name (`lib/arm64-v8a/libfoo.so`) to its file part. */
function baseName(name: string): string {
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1].toLowerCase();
}

/** Parse an alignment token that may be hex (`0x4000`) or decimal (`16384`). */
function parseAlignmentToken(token: string): number {
  return token.toLowerCase().startsWith('0x')
    ? parseInt(token, 16)
    : parseInt(token, 10);
}

/**
 * Find a load-segment alignment value within a fragment of text.
 *
 * Priority:
 *  1. an explicit `align=` / `align:` key (APK-Analyzer style),
 *  2. otherwise the LAST hex token (readelf LOAD rows put `Align` last, after
 *     the hex Offset/VirtAddr columns),
 *  3. otherwise the LAST decimal token.
 *
 * Returns `null` when no numeric alignment is present (e.g. a header row).
 */
function findAlignment(text: string): number | null {
  const keyed = text.match(/align\s*[=:]\s*(0x[0-9a-fA-F]+|\d+)/i);
  if (keyed) return parseAlignmentToken(keyed[1]);

  const hex = text.match(/0x[0-9a-fA-F]+/g);
  if (hex && hex.length > 0) return parseInt(hex[hex.length - 1], 16);

  const dec = text.match(/\b\d+\b/g);
  if (dec && dec.length > 0) return parseInt(dec[dec.length - 1], 10);

  return null;
}

const SO_NAME_RE = /([^\s"']*\.so)\b/;

/**
 * Parse APK-Analyzer / `readelf`-style text describing the `.so` files in an
 * APK/AAB into `SoEntry[]`.
 *
 * Two shapes are understood and may be mixed in the same input:
 *
 *  A. One line per library, name and alignment together:
 *       lib/arm64-v8a/libfoo.so 0x4000
 *       lib/arm64-v8a/libbar.so 16384
 *       lib/x86_64/libbaz.so align=4096
 *
 *  B. A library name on its own line, followed by `readelf -l` program-header
 *     rows whose LOAD segments carry an `Align` value:
 *       lib/arm64-v8a/libfoo.so:
 *         LOAD 0x000000 0x0000000000000000 ... 0x4000
 *         LOAD 0x010000 0x0000000000010000 ... 0x4000
 *
 * For shape B a library's `loadAlignment` is the MINIMUM alignment across its
 * LOAD segments — the smallest is the one most likely to break the 16KB rule,
 * so this is the conservative representative for the whole library.
 *
 * Pure function: depends only on `input`. Order of first appearance is
 * preserved so the downstream `misaligned` list is deterministic.
 */
export function parseSoEntries(input: string): SoEntry[] {
  const order: string[] = [];
  const minAlignment = new Map<string, number>();
  let currentName: string | null = null;

  const record = (name: string, alignment: number): void => {
    const existing = minAlignment.get(name);
    if (existing === undefined) {
      order.push(name);
      minAlignment.set(name, alignment);
    } else if (alignment < existing) {
      minAlignment.set(name, alignment);
    }
  };

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const soMatch = line.match(SO_NAME_RE);
    if (soMatch) {
      const name = soMatch[1];
      const after = line.slice(soMatch.index! + soMatch[0].length);
      const alignment = findAlignment(after);
      if (alignment !== null) {
        // Shape A: name + alignment on the same line.
        record(name, alignment);
      }
      // Either way this name becomes the context for any following LOAD rows.
      currentName = name;
      continue;
    }

    // No name on this line: a readelf LOAD row that belongs to currentName.
    if (currentName !== null && /\bLOAD\b/i.test(line)) {
      const alignment = findAlignment(line);
      if (alignment !== null) record(currentName, alignment);
    }
  }

  return order.map((name) => ({ name, loadAlignment: minAlignment.get(name)! }));
}

// ---------------------------------------------------------------------------
// Fresco absence check (Req 7.4)
// ---------------------------------------------------------------------------

/** Absence verdict for the flag-gated Fresco decoders. */
export type FrescoAbsence = {
  libgifimageAbsent: boolean;
  libstaticwebpAbsent: boolean;
};

/**
 * Check that the flag-gated Fresco decoders are absent from the given library
 * names. `libgifimage.so` and `libstatic-webp.so` must NOT ship once the
 * gif/webp flags are disabled (task 10.1 set both `false`).
 *
 * Pure function: matches on the file part only, case-insensitively, so
 * path-qualified names (`lib/arm64-v8a/libgifimage.so`) are handled.
 */
export function checkFrescoAbsence(names: string[]): FrescoAbsence {
  const bases = names.map(baseName);
  return {
    libgifimageAbsent: !bases.includes(LIB_GIF),
    libstaticwebpAbsent: !bases.includes(LIB_STATIC_WEBP),
  };
}

/** Names of the known Fresco libraries present in the bundle (basename form). */
export function listFrescoLibs(names: string[]): string[] {
  const known = new Set(KNOWN_FRESCO_LIBS);
  const seen = new Set<string>();
  const present: string[] = [];
  for (const name of names) {
    const base = baseName(name);
    if (known.has(base) && !seen.has(base)) {
      seen.add(base);
      present.push(base);
    }
  }
  return present;
}

// ---------------------------------------------------------------------------
// Combined verdict (pure)
// ---------------------------------------------------------------------------

/** Options describing which flag-gated decoders are expected to be absent. */
export type FrescoExpectation = {
  /** gif decoder disabled (default true — task 10.1 set expo.gif.enabled=false) */
  gifDisabled?: boolean;
  /** webp decoder disabled (default true — task 10.1 set expo.webp.enabled=false) */
  webpDisabled?: boolean;
};

/** Structured outcome of the whole alignment + Fresco check. */
export type AlignmentCheckResult = {
  entries: SoEntry[];
  report: AlignmentReport;
  fresco: FrescoAbsence;
  frescoPresent: string[];
  /** true iff every `.so` is 16KB aligned AND disabled decoders are absent */
  ok: boolean;
};

/**
 * Run the full check over raw APK-Analyzer / readelf text. Pure: no file or
 * `process` access, so it is directly unit/property testable.
 *
 * `ok` requires BOTH that every `.so` is 16KB aligned (Req 7.5, 8.3) and that
 * any decoder whose flag is disabled is absent from the bundle (Req 7.4).
 */
export function runAlignmentCheck(
  input: string,
  expectation: FrescoExpectation = {},
): AlignmentCheckResult {
  const { gifDisabled = true, webpDisabled = true } = expectation;

  const entries = parseSoEntries(input);
  const report = aggregateAlignment(entries);
  const names = entries.map((entry) => entry.name);
  const fresco = checkFrescoAbsence(names);
  const frescoPresent = listFrescoLibs(names);

  const gifOk = !gifDisabled || fresco.libgifimageAbsent;
  const webpOk = !webpDisabled || fresco.libstaticwebpAbsent;

  return {
    entries,
    report,
    fresco,
    frescoPresent,
    ok: report.aligned && gifOk && webpOk,
  };
}

// ---------------------------------------------------------------------------
// CLI (side-effecting) — guarded so imports stay pure
// ---------------------------------------------------------------------------

/** Render the check result as human-readable report lines. */
export function formatReport(result: AlignmentCheckResult): string[] {
  const lines: string[] = [];
  lines.push(
    `Scanned ${result.entries.length} native library(ies) against the ${PAGE_16KB}-byte (16KB) page size.`,
  );

  lines.push(
    result.frescoPresent.length > 0
      ? `Fresco libs present: ${result.frescoPresent.join(', ')}`
      : 'Fresco libs present: none',
  );
  lines.push(
    `  ${LIB_GIF}: ${result.fresco.libgifimageAbsent ? 'ABSENT ✓' : 'PRESENT ✗'}`,
  );
  lines.push(
    `  ${LIB_STATIC_WEBP}: ${result.fresco.libstaticwebpAbsent ? 'ABSENT ✓' : 'PRESENT ✗'}`,
  );

  if (result.report.aligned) {
    lines.push('16KB alignment: PASS — every .so is 16KB aligned.');
  } else {
    lines.push('16KB alignment: FAIL — the following .so files are NOT 16KB aligned:');
    for (const name of result.report.misaligned) lines.push(`  ✗ ${name}`);
  }

  return lines;
}

/**
 * CLI entry: read the APK-Analyzer / readelf dump named by the first argument,
 * run the pure check, print the report, and return an exit code. Returns
 * non-zero on any misalignment or when a disabled decoder is still present.
 *
 * This function NEVER modifies a `.so` file (Req 7.6, 8.4) — it only reads the
 * text dump and reports.
 */
export function main(argv: string[]): number {
  const inputPath = argv[2];
  if (!inputPath) {
    console.error('Usage: node check-alignment.js <apk-analyzer-or-readelf-output.txt>');
    console.error('  The input is a text dump of the .so files and their LOAD alignment.');
    return 1;
  }

  let input: string;
  try {
    input = readFileSync(inputPath, 'utf8');
  } catch {
    console.error(`Alignment check FAILED: cannot read input file "${inputPath}".`);
    return 1;
  }

  const result = runAlignmentCheck(input);
  for (const line of formatReport(result)) console.log(line);

  if (!result.ok) {
    console.error(
      'Alignment/Fresco gate FAILED. No .so file was modified — resolve by ' +
        'disabling a media flag or bumping the offending library, then rebuild.',
    );
    return 2;
  }

  console.log('Alignment/Fresco gate PASSED.');
  return 0;
}

// Run only when invoked directly (e.g. `node check-alignment.js dump.txt`),
// not when imported by tests.
if (require.main === module) {
  process.exit(main(process.argv));
}
