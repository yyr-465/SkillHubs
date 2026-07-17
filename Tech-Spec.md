# Phase 8.3b Remediation Technical Specification

## Goal

Make categorization conflict detection, batch resolution, audit history, and conflict UI satisfy the Phase 8.3b contract and pass production checks.

## Scope

- Use rusqlite transactions so failed history/category writes roll back automatically.
- Use one window-function conflict query as the source for both list and count.
- Expose `resolve_conflicts(ResolveConflictsRequest)` and send selected resolutions in one frontend request.
- Refresh conflict count when Dashboard loads and when AI categorization finishes.
- Remove unused frontend bindings that block strict TypeScript builds.
- Add focused database regression tests and representative performance checks.

## Constraints

- Do not change the `skills` schema, `Layout` structure, `navItems`, categorizer concurrency, retry behavior, or add dependencies.
- Each selected skill is committed in its own transaction, matching the original phase contract.
- Existing unrelated user changes must be preserved.

## Acceptance Criteria

- Backend build and all tests pass without Phase 8.3b dead-code warnings.
- Frontend type check and production build pass.
- Conflict list and count return matching results.
- Failed categorization write leaves no audit row and no open transaction.
- Batch resolution records `manual` history, updates categories, and clears resolved conflicts.
- Dashboard refreshes conflict count after categorization completes.
- Tauri command count remains 38.

## Risks

- Live DeepSeek verification still requires user-provided runtime configuration.
- Pixel-level desktop verification depends on the Tauri runtime being launchable in the current environment.

## Conflict Resolution Follow-up

- A conflict remains unresolved only while the latest history entry is the latest AI result. A later `manual` entry resolves it even when the user keeps the new AI category.
- AI reason generation follows `settings.language` at categorization time.
- Historical reasons remain immutable audit data. If a legacy reason uses a different language than the current UI, the UI shows a localized legacy-language notice instead of leaking mismatched text.
