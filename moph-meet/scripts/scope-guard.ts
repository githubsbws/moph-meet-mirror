// Feature: mobile-sdk53-upgrade
//
// Scope Guard (design.md "Error Handling — Branch / scope guard"; Property 7;
// Requirements 10.1, 10.3)
//
// Pure function that decides whether a modified file path is inside the
// permitted scope of this upgrade. Work is limited to `moph-meet/` plus a small
// allowlist of documentation/report paths. Anything under `core/`, `user-app/`,
// the `*-lite` projects, or elsewhere is out of scope.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

/** The mobile app folder that is always in scope. */
const SCOPE_ROOT = 'moph-meet';

/** Allowlisted documentation/report file names, keyed by required parent dir. */
const CASE_REPORT_FILE = 'report.md';
const CASE_ROOT = 'cases';
const DOCS_DIR = 'docs';
const ALLOWLISTED_DOC_FILES = ['PENDING-PATCHES.md', 'kiro-handover.md'];

/**
 * Normalize a path into non-empty segments.
 *
 * - Converts Windows-style backslashes to forward slashes so both `a\b` and
 *   `a/b` behave identically.
 * - Drops empty segments (leading/trailing/duplicate slashes) and `.` segments,
 *   so absolute-ish and relative paths compare on their meaningful parts.
 */
function toSegments(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.');
}

/**
 * Return `true` iff `path` is allowed to be modified during the upgrade.
 *
 * Allowed when either:
 *  - the path is under `moph-meet/` (a `moph-meet` segment with something after
 *    it — note `moph-meet-mirror` is a different segment and does NOT match), or
 *  - the path matches the allowlist:
 *      - `cases/**\/report.md`
 *      - `docs/PENDING-PATCHES.md`
 *      - `docs/kiro-handover.md`
 *
 * Any path under `core/`, `user-app/`, or anywhere else returns `false`.
 *
 * @param path a file path (relative or absolute, POSIX or Windows separators)
 */
export function isPathInScope(path: string): boolean {
  const segments = toSegments(path);
  if (segments.length === 0) {
    return false;
  }

  const last = segments[segments.length - 1];

  // Under moph-meet/: a `moph-meet` segment with at least one component after it.
  const scopeIdx = segments.indexOf(SCOPE_ROOT);
  if (scopeIdx !== -1 && scopeIdx < segments.length - 1) {
    return true;
  }

  // Allowlist: cases/**/report.md — a `cases` segment before a `report.md` file.
  const caseIdx = segments.indexOf(CASE_ROOT);
  if (caseIdx !== -1 && caseIdx < segments.length - 1 && last === CASE_REPORT_FILE) {
    return true;
  }

  // Allowlist: docs/PENDING-PATCHES.md and docs/kiro-handover.md.
  if (
    segments.length >= 2 &&
    segments[segments.length - 2] === DOCS_DIR &&
    ALLOWLISTED_DOC_FILES.includes(last)
  ) {
    return true;
  }

  return false;
}
