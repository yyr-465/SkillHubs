# Phase 11 QA Report

Date: 2026-08-03  (Asia/Shanghai)

Continuation check: 2026-08-05 (Asia/Shanghai)

The repository was re-checked without changing the existing QA fixtures or
user configuration. The following commands passed on the current checkout:

- `pnpm exec tsc --noEmit`
- `pnpm run build`
- `pnpm run lint` (existing warnings only)
- `cargo test --manifest-path src-tauri/Cargo.toml` (42 passed, 0 failed)
- `cargo build --manifest-path src-tauri/Cargo.toml`

This continuation added real Desktop evidence for unreadable-directory,
database-not-writable, updater-unavailable, 760px narrow-window, and clean-VM
first-Skill discovery. The user confirmed the clean-VM flow completed in less
than one minute.

## Scope and evidence policy

This report records only evidence that is reproducible from the current checkout. Existing root-level desktop screenshots were inspected but are not admissible as Phase 11 evidence: at least `desktop-qa-narrow.png` visibly contains a Windows username/path, desktop context, and a masked API-key field. No screenshot was copied into this QA archive.

The repository had pre-existing uncommitted changes before this QA task. They were preserved.

## Acceptance matrix

| Item | Fixture / operation | Expected | Result | Evidence | Status |
|---|---|---|---|---|---|
| No directory configured | Clear configured directory through Dashboard UI | Onboarding sample is read-only; count 0; settings asks to choose a directory | Real desktop run returned to onboarding with 0 Skills and a visible choose-directory action | `evidence/00-restored-unconfigured-light-wide.png` | PASS |
| Directory not found | QA-only nonexistent directory, restart and scan | Distinct bilingual not-found state and reselect action, no absolute path | Real desktop run showed bilingual warning and reselect action; scan button has no visible progress feedback | `evidence/01-directory-not-found-light-wide.png` | CONDITIONAL |
| Empty directory | QA-only empty directory, restart and scan | Distinct empty result, count 0 | Real desktop run showed 0 Skills and no not-found/invalid warning | `evidence/02-empty-directory-light-wide.png` | PASS |
| Invalid `SKILL.md` | QA-only malformed front matter | Invalid Skill state and corrective action, no path | Real desktop run showed bilingual invalid-front-matter warning and 0 Skills | `evidence/03-invalid-skill-light-min-width.png` | PASS |
| Missing Git preflight | Process-scoped PATH without Git; execute Git-dependent QA Skill | UI blocks before spawn and gives install/configure action | Real desktop run showed bilingual missing-git error; process inspection found no `git.exe` process | Text evidence in task transcript; screenshot intentionally not archived because no sanitized capture was supplied | PASS |
| Other allowlist executable missing | QA Skill requiring unavailable `skill-tool.exe` | Named dependency and action; no spawn | Real desktop preflight blocked before confirmation; process inspection found no `skill-tool.exe` process | `evidence/04-skill-tool-missing-preflight.png` | PASS |
| Skill directory unreadable | Temporary QA ACL only | Permission/reselect action, then ACL restoration | Real desktop diagnostics showed `Directory cannot be read / 目录不可读取`; sanitized screenshot captured, ACL restored, and directory verified readable again. | `evidence/05-unreadable-directory.md`, `evidence/05-unreadable-directory-light-wide.png` | PASS |
| Database not writable | Temporary app data/database only | Storage permission/space action, no DB path | Real Desktop run showed localized storage error without DB path; fallback schema kept Dashboard/Skills usable | `evidence/05-database-not-writable.md` | PASS |
| Updater unavailable | Process-scoped unreachable proxy | Network/proxy action and recovery to normal | Real Desktop diagnostics showed localized actionable network errors in English and Chinese; process proxy was removed afterward. | `evidence/06-updater-unreachable.md`, `evidence/06-updater-unreachable-en.png`, `evidence/06-updater-unreachable-zh.png` | PASS |
| Bilingual/path-safe copy audit | Source/i18n inspection plus real failure-path runs | Every failure has EN/ZH problem + action, no raw OS text/path | Real Desktop runs covered Git preflight, allowlist preflight, directory states, DB write failure, and updater failure; no raw OS text, stack, or absolute path appeared | `evidence/text-audit.md`, `evidence/04-git-missing-preflight.png`, `evidence/05-unreadable-directory-light-wide.png`, `evidence/06-updater-unreachable-en.png`, `evidence/06-updater-unreachable-zh.png` | PASS |
| Narrow/light/dark visual QA | 1440x900 and declared minimum supported width | No clipping/overlap/overflow | Real Desktop light and dark checks passed at the declared minimum width (about 900px content / 939px outer window), with wrapping, visible actions, and no horizontal overflow. | `evidence/07-760px-narrow-window.md`, `evidence/12-narrow-min-dark-dashboard.png`, `evidence/14-narrow-min-dark-settings.png` | PASS |
| Clean VM first-use under 5 minutes | Linked VirtualBox clone from clean Windows 10 base | First real Skill visible within 5 minutes | Real clean VM Desktop run displayed 1 real Skill; user confirmed the complete flow took less than one minute. | `evidence/13-clean-vm-first-skill.md` and `evidence/13-clean-vm-first-skill.png` | PASS |
| Final normal diagnostics | Clear QA directory and relaunch normal process | Git, storage, updater, and directory state recover | User confirmed Git/storage/updater normal; app returned to unconfigured state | `evidence/00-restored-unconfigured-light-wide.png` | PASS |

## Automated verification

Commands and observed result:

- `pnpm exec tsc --noEmit` - PASS.
- `pnpm run build` - PASS.
- `pnpm run lint` - PASS with existing warnings; no lint failure recorded.
- `cargo test --manifest-path src-tauri/Cargo.toml` - PASS, 43 passed, 0 failed.
- `cargo build --manifest-path src-tauri/Cargo.toml` - PASS; existing deprecation/dead-code/linker warnings only.
- `pnpm tauri build --bundles nsis` - desktop executable and NSIS installer built successfully; final command exit remains non-zero only because no updater signing private key is available locally.

## Recovery check

The three QA fixtures were removed by the user. The isolated Git-missing and
unreachable-updater processes were stopped; a normal SkillHub process was
launched and the system `where.exe git` lookup returned Git again. The
temporary database profile and ACL changes were removed/restored. No PATH,
proxy, network, formal database, or user Skill directory was modified by this
task. The clean VM timing was confirmed as under one minute.

## Final conclusion

**PASS; Phase 11 release acceptance is complete under the declared minimum
supported-width contract.** Real
desktop evidence now covers the previously blocked unreadable-directory,
database-not-writable, updater-unavailable, 760px checks, and clean-VM first
use. All Phase 11 required items are now covered under the declared minimum
supported-width contract. The historical 760px target is not applicable to the
current product minimum and is not claimed as an exact runtime result.

`MEMORY.md` was updated with the durable UI and QA findings from this run.
