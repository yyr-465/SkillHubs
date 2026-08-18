# Unreadable directory runtime record

Date: 2026-08-05 (Asia/Shanghai)

## Operation

1. Created `qa/phase-11/fixtures/unreadable-directory`.
2. Recorded its original ACL and added a deny-read/execute ACL for the current test user.
3. Verified access independently returned `UnauthorizedAccessException`.
4. Started the real Tauri desktop application, selected the QA directory, ran a scan, and ran environment diagnostics.
5. Restored the original ACL with `icacls /reset`, verified readability, and removed the QA fixture.

## Expected

The application should distinguish an unreadable Skill directory from a missing directory, show bilingual actionable guidance, and avoid exposing the full path.

## Actual

Environment diagnostics displayed `Directory cannot be read / 目录不可读取`, `git.exe is available / git.exe 可用`, and `Writable / 可写`. Updater access was reported as available after the Settings check. No full path was shown in the reported diagnostic text.

The user observed that scanning did not display a visible loading spinner or progress bar.

## Result

Functional unreadable-directory handling: **PASS based on real desktop runtime**.

Archive evidence: **PASS**. The sanitized Desktop screenshot is archived as
`05-unreadable-directory-light-wide.png`; it contains the bilingual unreadable
state without a full path, username, database location, or secret. The ACL was
restored and the directory was verified readable afterward. Scan-progress
feedback: **UX follow-up required**.
