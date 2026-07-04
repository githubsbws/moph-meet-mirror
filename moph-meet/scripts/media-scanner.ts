// Feature: mobile-sdk53-upgrade
//
// B2. Native Media Scanner (design.md B2; Requirement 7.1)
//
// Pure function that scans source files for `<Image>` components that load
// native `.gif` / `.webp` resources (via require / import / uri). The result
// drives the Fresco gradle media flags (see media-flags.ts / decideMediaFlags):
// when the app does not actually use native gif/webp, the corresponding Fresco
// decoders can be disabled. Types are shared from `./types` (do NOT redefine).
//
// This is a pure function operating only on the provided in-memory data — it
// performs NO filesystem access.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

import type { MediaScanResult, SourceFile } from './types';

/**
 * Matches a JSX `<Image` opening tag (react-native or expo-image). The design
 * scopes the scan to media loaded by `<Image>`, so a resource reference only
 * counts when the same file also renders an Image.
 */
const IMAGE_TAG = /<Image[\s/>]/;

/**
 * Build a regex that detects a native resource reference for the given file
 * extension. Covers the three loading forms called out in the design:
 *  - `require('...x.gif')`
 *  - `import x from '...x.gif'` / `import '...x.gif'`
 *  - `uri: '...x.gif'`
 *
 * The quoted path must end with the extension (optionally followed by a query
 * or hash fragment), so `.gifsomething` or `.gif.png` do not match.
 *
 * @param ext file extension without the leading dot (e.g. `gif`, `webp`)
 */
function resourceReferenceRegex(ext: string): RegExp {
  // A quoted string literal whose path ends with `.<ext>` (allowing ?query / #hash).
  const pathLiteral = `['"][^'"]*\\.${ext}(?:[?#][^'"]*)?['"]`;

  return new RegExp(
    '(?:' +
      // require('....ext')
      `require\\s*\\(\\s*${pathLiteral}` +
      // import ... from '....ext'  (default / named / namespace imports)
      `|from\\s+${pathLiteral}` +
      // bare side-effect import: import '....ext'
      `|import\\s+${pathLiteral}` +
      // image source object: { uri: '....ext' }
      `|uri\\s*:\\s*${pathLiteral}` +
      ')',
    'i',
  );
}

const GIF_REFERENCE = resourceReferenceRegex('gif');
const WEBP_REFERENCE = resourceReferenceRegex('webp');

/**
 * A file references a native resource of the given kind when it both renders an
 * `<Image>` and contains a require/import/uri reference to that extension.
 */
function fileReferencesNative(content: string, referenceRegex: RegExp): boolean {
  return IMAGE_TAG.test(content) && referenceRegex.test(content);
}

/**
 * Scan the provided source files for `<Image>` components that load native
 * `.gif` / `.webp` resources.
 *
 * `hasNativeGif` is `true` iff at least one file references a native `.gif`
 * resource; `hasNativeWebp` is `true` iff at least one file references a native
 * `.webp` resource. Otherwise both are `false`.
 *
 * @param sourceFiles in-memory source files (path + content) to scan
 */
export function scanNativeMedia(sourceFiles: SourceFile[]): MediaScanResult {
  let hasNativeGif = false;
  let hasNativeWebp = false;

  for (const file of sourceFiles) {
    const { content } = file;

    if (!hasNativeGif && fileReferencesNative(content, GIF_REFERENCE)) {
      hasNativeGif = true;
    }
    if (!hasNativeWebp && fileReferencesNative(content, WEBP_REFERENCE)) {
      hasNativeWebp = true;
    }

    if (hasNativeGif && hasNativeWebp) {
      break;
    }
  }

  return { hasNativeGif, hasNativeWebp };
}
