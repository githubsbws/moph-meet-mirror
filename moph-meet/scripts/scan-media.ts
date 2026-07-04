// Feature: mobile-sdk53-upgrade
//
// Task 10.1 runner: walk the MOPH Meet source tree, feed every .ts/.tsx source
// file into `scanNativeMedia` (B2) and `decideMediaFlags` (B3), and print the
// scan result + decided Fresco gradle media flags. This is a thin side-effect
// wrapper around the pure functions — it performs the filesystem read that the
// pure scanner intentionally avoids, then delegates all logic to them.
//
// Usage: transpile with tsc and run with node (see task notes). It only reads
// files and writes to stdout; it does NOT modify gradle.properties itself.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

import * as fs from 'fs';
import * as path from 'path';

import { scanNativeMedia } from './media-scanner';
import { decideMediaFlags } from './media-flags';
import type { SourceFile } from './types';

// Directories that are never app runtime source (generated/native/deps output),
// plus `scripts/` which is dev/build tooling (Component B pure functions + their
// tests). Tooling is not bundled into the app, and the scanner's own doc-comments
// contain `<Image>` + `require('...gif')` examples that would otherwise register
// as false-positive native media usage. Fresco flags concern what the app bundle
// actually loads at runtime, so tooling is out of scope for this scan.
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'android',
  'ios',
  '.expo',
  'dist',
  '.git',
  'scripts',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Recursively collect .ts/.tsx source files under `dir`, skipping excludes. */
function collectSourceFiles(dir: string, acc: SourceFile[]): SourceFile[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      collectSourceFiles(path.join(dir, entry.name), acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;

    const filePath = path.join(dir, entry.name);
    acc.push({ path: filePath, content: fs.readFileSync(filePath, 'utf8') });
  }
  return acc;
}

function main(): void {
  // moph-meet/ root is the parent of this scripts/ directory.
  const mophMeetRoot = path.resolve(__dirname, '..');

  const sourceFiles = collectSourceFiles(mophMeetRoot, []);
  const scan = scanNativeMedia(sourceFiles);
  const flags = decideMediaFlags(scan);

  const result = {
    scannedFileCount: sourceFiles.length,
    scan,
    decidedFlags: flags,
    gradleProperties: {
      'expo.gif.enabled': flags.gifEnabled,
      'expo.webp.enabled': flags.webpEnabled,
    },
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main();
