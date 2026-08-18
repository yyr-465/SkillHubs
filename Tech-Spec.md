# Phase 8.3b Remediation Technical Specification

## Phase 9 Security Closure Addendum (2026-07-19)

### Acceptance focus

- `start_skill_execution` requires an explicit confirmation in the request and revalidates the declaration server-side.
- Execution state is terminal exactly once; stale completion work cannot overwrite cancellation or shutdown state.
- Allowlist and argument/path validation remain default-deny, with no shell invocation.
- Captured output is bounded and exposes truncation through the execution result contract.
- Runtime evidence is reported separately from local compile/test evidence; Windows VM and desktop visual checks are required for `COMPLETE`.

### Known verification boundary

The current workspace can run local Rust/frontend checks, but a packaged Windows x64 VM run and interactive Desktop Visual QA must be performed before declaring the phase complete.

### Phase 9 closure update (2026-07-19)

- `ExecutionManager` now owns the shared SQLite connection used for execution audit writes.
- Each execution record has an internal one-shot audit guard; terminal completion, cancellation, timeout, and application shutdown cannot write duplicate audit rows.
- Audit details are fixed safe summaries and do not include arguments, environment variables, secrets, or filesystem paths.
- The Windows cleanup regression now verifies removal of the specific execution registration instead of asserting that no `git.exe` exists anywhere on the machine.
- Local Rust tests pass (40/40). Packaged Windows x64 runtime and Desktop Visual QA remain the release gate.

### Host verification update (2026-07-26)

- Host TypeScript check, lint, production build, Rust build, and Rust tests all pass.
- Rust test result is 40/40; lint and Rust emit only pre-existing warnings.
- No host-side verification failure remains. The remaining gate is external Windows x64 runtime execution and interactive Desktop Visual QA.
- Narrow execution-panel hardening is implemented: the dialog is constrained to the viewport, horizontal overflow is hidden, preview fields can wrap, and terminal results expose an explicit Retry action that returns to a fresh confirmation preview. VM revalidation is pending.

### Phase 9 final acceptance (2026-07-30)

- Windows x64 runtime QA passed for confirmation preview, success, non-zero exit, timeout, cancellation, and application-exit process cleanup.
- The test execution used `git.exe`; no managed `git.exe` remained after cancellation or application exit.
- Retry creates a distinct execution ID and returns through a fresh confirmation preview.
- Long stderr remains scrollable, and dark, light, full-width, and narrow-window execution views are readable without dialog overflow or obscured actions.
- Focused audit tests verify exactly one terminal audit row and sanitized spawn-failure details without internal paths.
- Frontend checks and production build pass; Rust tests pass 42/42.
- Phase 9 status: `COMPLETE`.

## Phase 10 — Production signing and release gate (2026-07-30)

- The existing Tauri updater public key remains unchanged; the updater private key must be supplied through `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub Actions secrets.
- The earlier local Azure Artifact Signing workflow was a superseded prototype and has been removed from the active release workflow.
- Azure Artifact Signing Public Trust is not an available enrollment path for the current maintainer. SignPath Foundation free OSS code signing is the selected Authenticode provider; the Azure workflow is superseded and must not be used for a production release.
- SignPath integration remains pending project approval and the provider-issued organization, project, signing-policy, artifact-configuration, and API-token configuration. The eventual GitHub Actions workflow must use SignPath's trusted GitHub build integration and require manual release approval.
- Until onboarding is complete, `.github/workflows/release.yml` deliberately fails every production version-tag run before checkout, build, signing, or publication. This fail-closed gate prevents another updater-only installer from being presented as a formal signed release.
- Production workflow must fail before release publication when any updater, SignPath signing, installer, signature, or `latest.json` input is missing or invalid.
- Authenticode signing runs before the final updater signature pass. Because Authenticode changes PE file bytes, the workflow regenerates each NSIS/MSI `.sig` after Authenticode and rewrites the corresponding `latest.json` signatures before verification and publication.
- SignPath API tokens must be stored only in GitHub Actions Secrets. Non-secret SignPath identifiers may be stored as GitHub Actions variables after onboarding.
- Local QA remains unsigned and must not create or publish updater metadata. A formal release requires the protected GitHub Actions workflow and approved SignPath signing resources.
- Local QA uses `pnpm run tauri:build:qa` with `src-tauri/tauri.qa.conf.json`, the product name `SkillHub QA`, the identifier `com.skillhub.app.qa`, and `createUpdaterArtifacts: false`. This keeps QA installable without production secrets while making its artifacts visibly distinct and incapable of producing production updater metadata.
- The verified production artifact set includes NSIS, MSI, their final updater `.sig` files, `latest.json`, release notes, and `SHA256SUMS.txt`. Hashes are generated only after both signature layers are final.
- No secret values, certificates, private keys, or passwords are stored in the repository or project memory.
- Key migration is staged: current clients continue to trust the existing public key; a bridge release must be signed by the existing GitHub Actions private key while embedding the replacement public key; only releases after bridge adoption may use the replacement private key. Directly replacing the public key or GitHub secrets before the bridge release is prohibited.

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
# Phase 11 — First-use onboarding and environment diagnostics

## Acceptance contract

- A first-run user can choose one Skill directory, understand that scanning is recursive and only discovers `SKILL.md`, and see the scan result without editing files or importing JSON.
- Scan failures distinguish unconfigured, missing, empty, unreadable, and invalid Skill directories using actionable bilingual copy without rendering absolute paths.
- Diagnostics report allowlisted executable availability, selected-directory access, database writability, and updater reachability.
- Execution preparation checks the allowlisted executable before process spawn and returns a safe installation/configuration message when it is missing.

## Constraints

- The configured directory is persisted in the existing settings file; the ten-column `skills` table remains unchanged.
- The bundled sample Skill is documentation-only and has no execution declaration or write capability.
- User-facing errors must use stable localized messages; raw OS errors and internal paths stay in logs/backend diagnostics only.

## Narrow-window support contract

- The supported narrow-window target is the application's declared minimum
  width, currently approximately 900px content width (about 939px outer window
  on the verified Windows desktop).
- Narrow-window visual QA must cover this minimum width in light and dark
  themes, with no clipping, overlap, blocked primary action, or horizontal
  overflow.
- A 760px viewport is not a release acceptance requirement unless the product
  minimum width is deliberately lowered and the layout is revalidated.
