// Feature: mobile-sdk53-upgrade
//
// Base-branch Guard (design.md "Error Handling — Branch / scope guard";
// Requirements 1.3, 1.4)
//
// Pure function that decides whether the SDK 53 upgrade is allowed to start
// from a given base branch. Only `delivery/mobile-parity` is valid: it is the
// branch that carries the Cookie-auth 401 fix in `constants/api.ts` (case 016).
// Basing off `allow-user-login` (or any other branch) would regress that fix
// back to `Authorization: Bearer`, so the guard stops the migration.
//
// SCOPE (Requirement 10): support tooling lives inside `moph-meet/` only.

/** The only base branch that carries the Cookie-auth 401 fix. */
const VALID_BASE_BRANCH = 'delivery/mobile-parity';

/**
 * Result of a base-branch check.
 *  - `{ allowed: true }`  when the base branch is safe to upgrade from.
 *  - `{ allowed: false, message }` when it is not, with a human-readable reason.
 */
export type BranchGuardResult =
  | { allowed: true }
  | { allowed: false; message: string };

/**
 * Return whether it is safe to base the SDK 53 upgrade on `baseBranch`.
 *
 * Allowed only when `baseBranch === 'delivery/mobile-parity'`. Any other branch
 * returns `{ allowed: false, message }` explaining that the base is invalid and
 * must be `delivery/mobile-parity`, and that proceeding risks regressing the
 * Cookie-auth 401 fix back to Bearer auth.
 *
 * Pure function: no I/O, no git access. The caller supplies the branch name.
 *
 * @param baseBranch the branch the upgrade would be based on
 */
export function checkBaseBranch(baseBranch: string): BranchGuardResult {
  if (baseBranch === VALID_BASE_BRANCH) {
    return { allowed: true };
  }

  return {
    allowed: false,
    message:
      `Invalid base branch "${baseBranch}": the SDK 53 upgrade must be based on ` +
      `"${VALID_BASE_BRANCH}". That is the only branch containing the Cookie-auth ` +
      `401 fix in constants/api.ts; basing off any other branch (e.g. ` +
      `"allow-user-login") would regress it back to Authorization: Bearer. ` +
      `Stopping migration.`,
  };
}
