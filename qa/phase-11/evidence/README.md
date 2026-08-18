# Phase 11 Evidence Index

No new screenshots are stored yet. The available desktop captures at repository root are historical and are not admissible because visual inspection found sensitive desktop/path context. A valid capture must be produced by a real SkillHub desktop process, named by state/theme/window size, and checked before saving for usernames, absolute paths, secrets, database locations, command arguments, stack traces, and environment variables.

Captured evidence:

- `01-directory-not-found-light-wide.png` is a sanitized real desktop capture showing the bilingual missing-directory warning and reselect action.
- `01-directory-not-found-dark-wide.png` is the matching dark-theme capture; warning contrast and actions remain legible.
- `01-directory-not-found-dark-min-width.png` confirms the currently enforced 900px desktop minimum has no clipping, overlap, or horizontal overflow.
- `01-directory-not-found-light-min-width.png` confirms the same result in light theme.
- `02-empty-directory-light-wide.png` is a sanitized real desktop capture at the current wide light-theme window size. It shows 0 Skills with no not-found or invalid-SKILL warning.
- `03-invalid-skill-light-min-width.png` shows the bilingual invalid-front-matter warning and 0 Skills without path leakage.
- `04-skill-tool-missing-preflight.png` shows the pre-spawn missing-dependency error with an unreadable blurred backdrop and no path leakage.
- `00-restored-unconfigured-light-wide.png` confirms the final restored onboarding state with 0 Skills and no configured directory.

Required future files include:

- `01-directory-not-found-light-wide.png`
- `02-empty-directory-dark-narrow.png`
- `03-invalid-skill-light-wide.png`
- `04-git-missing-preflight.png`
- `05-database-not-writable.png`
- `06-updater-unreachable.png`
- `07-clean-vm-first-skill.png`

Each capture needs a same-stem `.md` operation record containing steps, expected result, actual result, dimensions, theme, timestamp, and PASS/FAIL.
