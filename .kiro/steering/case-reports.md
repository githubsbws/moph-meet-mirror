# Case reports — close every finished job with a report

When a task/case is finished (bug fixed, feature delivered, deployed/verified),
create a report under `cases/` before considering the work done.

## Location & naming
- Path: `cases/[NNN]_[Name]/report.md`
- `NNN` = zero-padded sequence number (001, 002, ...), increment from the
  highest existing case folder.
- `Name` = short kebab-case slug of the problem (e.g. `create-room-json-error`).

## Report contents (keep it tight, facts over prose)
1. **Title & date**
2. **Symptom** — what the user/customer reported (quote if available).
3. **Root cause** — the actual technical cause, with file:line references.
4. **Fix** — what changed, which files, and why.
5. **Verification** — how it was confirmed (tests, Playwright, prod checks) with results.
6. **Deploy** — what was deployed where, and any DB migration/backfill.
7. **Follow-ups / risks** — anything left open or worth watching.

## Rules
- Reports are documentation of completed work — write them in the user's language
  when the case was discussed in that language (Thai here).
- Never put secrets, credentials, patient data (CID, names), or raw tokens in a
  report. Reference counts/ranges instead.
- Scope of code work stays within the `*-lite` projects per `lite-only.md`.
