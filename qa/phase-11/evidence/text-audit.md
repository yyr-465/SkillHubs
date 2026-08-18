# Phase 11 Text Audit

## Source-level findings

- Bilingual diagnostic labels exist in `src/i18n/en.json` and `src/i18n/zh.json` and are rendered by `src/pages/Settings/index.tsx`.
- Backend diagnostic assembly exists in `src-tauri/src/lib.rs`; the frontend receives structured checks rather than parsing operating-system error strings.
- Execution allowlist and preparation code exist under `src-tauri/src/execution/`.

## Runtime evidence

Real Desktop evidence now covers the required failure messages and actions:

- missing `git.exe` is blocked before execution and shown bilingually;
- missing allowlisted executable is blocked before execution and shown bilingually;
- directory-not-found, unreadable-directory, invalid-SKILL, and database-write
  failures show distinct actionable messages;
- updater-unreachable is shown bilingually with network/proxy guidance.

The Git preflight screenshot is archived as
`04-git-missing-preflight.png`. The execution modal contains no raw operating
system error, stack trace, command argument, or absolute path.

Runtime text audit: **PASS** for the Phase 11 failure paths exercised here.

## Sensitive evidence rule

Do not archive screenshots containing API keys, usernames, absolute paths, database paths, command arguments, stack traces, or environment variables.
