# Phase 8 — FTS5 Full-text Search & Search History / Recent Views

## Direction A: FTS5 Full-text Search

- **Architecture**: External content FTS5 virtual table (`skills_fts`) referencing `skills` table via `rowid`.
- **Tokenization**: `unicode61` — works well for both English and Chinese text.
- **Sync Strategy**: Rebuild entire index after bulk operations (`replace_all_skills`, `import_skills_from_json`). Rebuild also after individual `update_skill`. No per-row DELETE/INSERT — external content FTS5 does not support individual row manipulation reliably via `DELETE`.
- **`rebuild_fts_index()`**: Calls only `INSERT INTO skills_fts(skills_fts) VALUES('rebuild')` — no preceding `DELETE`, which caused SQLITE_CORRUPT on external content tables.
- **`query_skills`**: Search condition changed from `name LIKE ? OR description LIKE ?` to `skills.rowid IN (SELECT rowid FROM skills_fts WHERE skills_fts MATCH ?)`.
- **`search_suggestions`**: New Tauri command returning top-N matching skills for auto-complete.
- **Keyword Highlighting**: `highlightText()` utility in `lib/utils.ts` returns HTML with `<mark>` tags. Used in `SkillCard` via `dangerouslySetInnerHTML`. Source data is local files so XSS risk is acceptable.

## Direction B: Search History / Recent Views

- **Tables**: `search_history` (id, query, created_at) with max 50 entries. `recent_views` (id, skill_id FK, viewed_at) with max 30 entries.
- **`add_recent_view`**: Uses upsert pattern — if same `skill_id` exists, update `viewed_at`; otherwise INSERT.
- **`Dashboard`**: "Recently Viewed" section appears between favorites card and breakdown cards. Shows up to 6 mini-cards.
- **`SearchBar`**: Dropdown merges suggestions (top section) and search history (bottom section), separated by a divider. Glass effect via `backdrop-blur-xl`.
- **Entry Points**: Search history recorded on Enter key or suggestion/history click. Recent views recorded in `SkillDetail` via `useEffect` on `skill?.id`.

## FTS5 Caveats

- `rusqlite` needs both `bundled` and `vtab` features for FTS5 virtual table support.
- FTS5 MATCH syntax supports advanced operators (`"phrase"`, `+word`, `-word`, `AND`, `OR`).
- Simple word queries work directly. For very short single letters, FTS5 may return empty results — `unicode61` tokenizer min token size is 1 by default.
- Tests use in-memory FTS5 setup without the initial rebuild (rebuild happens via `replace_all_skills`).

# Phase 8.2 — Tag System

- **Tables**: \	ags\ (id, name UNIQUE, color, created_at) + \skill_tags\ (skill_id, tag_id, PRIMARY KEY). Created in \init_db()\ after FTS5 tables.
- **Backend**: 6 new db functions (create_tag, delete_tag, get_all_tags, assign_tag, remove_tag, get_skill_tags) + 6 new Tauri Commands (registered in \generate_handler![]\, now 31 total).
- **\SkillQuery\**: Extended with \	ag_ids: Option<Vec<i64>>\ — OR-logic filtering via subquery on \skill_tags\.
- **Frontend**: TagBadge (colored pill), TagManager (dialog for assign/remove/create), tag cloud on Dashboard, tag filter in FilterBar dropdown, batch tag add in BatchOperationBar.
- **Skills table unchanged** (10 columns) — tags stored in separate association table.
- **i18n**: 15 new keys in both en.json and zh.json for tag-related UI text.

## Phase 8.2 Pitfalls

### 1. SQLite schema 初始化问题
- **execute_batch 拆分**：多语句 execute_batch 在某些 rusqlite 版本上有解析问题，改为独立的 conn.execute() 更可靠。
- **CREATE INDEX 必须在列创建之后**：idx_skills_favorite 建在 avorite 列被 ALTER TABLE ADD COLUMN 之前，删库重建时会崩溃。所有依赖后期 ADD COLUMN 的索引必须移到 ADD COLUMN 之后。

### 2. 数据库列名被污染
- skill_tags 表不知什么原因混进了 	ag 列（而非 	ag_id），导致 INSERT 报 NOT NULL constraint failed: skill_tags.tag。
- 解决：在 init_db 中加 has_bad_tag 检测，发现 	ag 列存在时直接 DROP TABLE 重建。

### 3. Tauri v2 参数名转换
- Tauri v2 命令参数名默认要求 camelCase（前端），Rust 端用 snake_case 会被自动转换。
- 例如：Rust skill_id: String → 前端发 { skillId } 而不是 { skill_id }。
- struct 字段（如 AssignTagRequest { skill_id, tag_id }）保持 snake_case。

### 4. Store actions 的 async 错误处理
- Store action 内部 catch 后 set({ error }) 再 	hrow e，这样调用方可以 catch 并显示错误。
- 如果只 set({ error }) 不 throw，调用方会以为操作成功。
- TagManager 的 onClick={async () => { try { await onAssign() } catch(e) { showError(e) } }} 模式是推荐的。

## Phase 8.3b — Categorization Conflict Remediation

- Categorization history and `skills.category` are written through `rusqlite::Transaction`; a missing skill produces an error and automatic rollback instead of leaving an open transaction.
- Conflict list and count use the same `ROW_NUMBER()` CTE, ordered by `created_at DESC, id DESC`, so Dashboard totals and list contents share one rule.
- The Tauri contract is `resolve_conflicts(ResolveConflictsRequest)`; the frontend sends all selected resolutions in one invoke call while the backend commits each skill independently.
- Dashboard refreshes conflict count on mount and immediately after AI categorization finishes, keeping both the conflict card and sidebar glow current without reloading.
- Focused database coverage includes empty history, conflict detection, manual resolution, rollback, audit ordering, and a 5,000-skill performance scenario.
- Live DeepSeek end-to-end verification still requires runtime API configuration; no secret values belong in project files or memory.
- A conflict is resolved by any history entry newer than the latest AI result, even when the manual choice keeps that same AI category. Comparing only `skills.category` cannot distinguish “unreviewed” from “confirmed new.”
- Historical reasons are immutable audit text. The conflict UI suppresses legacy reasons that do not match the current UI language and shows a localized explanation; new reasons follow `settings.language` at categorization time.
- `idx_categorization_history_skill_order` supports both latest-history checks and the 5,000-skill conflict performance target.

### 5. 获取 skill tags 改用本地 state 操作
- get_skill_tags 有 SQL 子查询问题，改为在 ssignTag 中用 get() 读取 llTags 找到对应 tag 对象，手动追加到 skillTags 数组。

### Phase 8.5A — Safe Skill Execution Foundation
- `parser.rs` accepts only explicit `execution` YAML front matter; Markdown code blocks are never inferred as commands.
- Execution declarations validate command, string args, relative non-traversing working directory, 1–3600 second timeout, and mandatory confirmation.
- `prepare_skill_execution` returns a non-executable preview. Real process execution remains disabled until an allowlist and minimal capability policy are defined.

### Phase 8.5B — Custom Theme Foundation
- Custom themes reuse `custom_primary` and `custom_background`; no settings migration or dependency was added.
- `src/lib/theme.ts` validates six-digit hex colors, computes luminance/foreground colors, and defines six static presets.
- Settings changes apply immediately for preview; only `saveSettings` persists them. Switching away from custom removes inline CSS overrides.

### Phase 8.5C — Updater Preparation
- Official Tauri v2 updater API was checked; the required plugin is not installed because repository URL, signed endpoint, public key, and release permissions are not confirmed.
- Settings now shows the running version and an explicit unavailable state instead of pretending an update check succeeded.
- No updater permission, endpoint, signing key, workflow, or release upload was added.

### Phase 8.5C — GitHub Release configuration
- Repository confirmed as `https://github.com/yyr-465/SkillHubs`; production target is Windows x64 stable releases.
- Tauri updater public key and GitHub Releases `latest.json` endpoint are configured in `src-tauri/tauri.conf.json`.
- Updater signing uses `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub Actions secrets; secret values are not stored in the repository.
- `.github/workflows/release.yml` builds signed Windows artifacts on `v*.*.*` tags with `contents: write` permission.
- The updater plugin is enabled in both Rust and frontend. Real release verification still requires pushing the workflow and publishing a tagged GitHub Release.

### Project Progress Prompt
- `PROJECT_PROGRESS_PROMPT.md` consolidates completed capabilities, architectural reasoning, unresolved risks, priorities, and a reusable Phase X development prompt.
- The document distinguishes configured update infrastructure from real release verification and keeps safe skill execution disabled until an allowlist and capability policy exist.

### Phase 8.5A — Exit Cleanup

- `RunEvent::ExitRequested` invokes `ExecutionManager::kill_all()` through `AppState`.
- Windows managed processes are assigned to a native Job Object by PID; termination therefore covers descendants such as `git cat-file --batch` and helper processes.
- Cleanup emits start, per-process, and finished messages to stderr for runtime verification.
- Cargo checks and all 37 backend tests pass; real desktop exit verification still requires running the packaged app and checking `tasklist`.

## Phase 9 — Safe Skill Execution Minimum Loop

- Added an explicit `execute_skill` request requiring user confirmation; Markdown code blocks remain non-executable.
- The first execution policy is intentionally narrow: only `echo`, `python`, `python3`, and `node` are accepted, shell metacharacters are rejected, and commands are started without a shell.
- Working directories are limited to the Skill source directory or a validated single-level relative child; process timeout follows the declaration and stdout/stderr are capped at 16 KiB in the returned result.
- Every completed or timed-out execution writes an `execution_audit` row. Start failures and user cancellation do not execute a process and are returned as explicit errors.
- Skill detail now exposes the action after a confirmation preview. This is a minimum closed loop, not a general shell runner; broader capabilities still require a reviewed allowlist and policy.

### Phase 9 — Execution Process Ownership Fix

- `ExecutionManager` retains each `ManagedProcess` in its registry after the worker finishes; only the child handle may be consumed by normal output collection.
- `ManagedProcess` retains its `ProcessGroup` until `kill_all()` clears the registry, and cleanup safely handles processes whose child handle was already consumed.
- Regression coverage verifies a finished execution remains registered until cleanup and is then removed.

### Phase 8.5A — Async lock contention fix

- `ExecutionHandle` owns `ManagedProcess` directly; process waiting no longer holds a manager-level async mutex across `await`.
- `ManagedProcess` extracts its child from a short-lived async mutex before waiting, while `kill_all()` terminates the retained Windows Job Object directly.
- Regression tests cover cleanup during a long-running execution and Windows job-tree cleanup; Rust checks and 40 backend tests pass.

### Phase 8.5A — Final Exit Cleanup Status: COMPLETE

- Real Windows desktop QA passed with Tauri 2.11.4 using `pnpm tauri dev`.
- Test skill: `qa-execution-git-long`.
- Three `git.exe` processes were observed while the skill was running.
- Closing the Tauri application triggered `ExitRequested` cleanup and terminated the complete process tree through the Windows Job Object.
- `tasklist | findstr git.exe` returned no remaining process.
- Phase 8.5A Release Gate is complete; no remaining issues are recorded.

### Phase 8.5B — Theme Hardening

- `src/lib/theme.ts` accepts only normalized hex, rgb, and hsl colors; CSS keywords, variables, URLs, and injection strings are rejected.
- Custom theme preview rejects invalid color input, exposes a user-visible error, validates primary contrast before persistence, and supports restoring the saved baseline through cancel.
- Custom mode injects the complete theme variable set and removes all custom overrides when switching to system, light, or dark.
- Frontend type check, production build, and focused theme parser/contrast tests pass. Lint remains warning-only due to pre-existing project warnings.
- Real Tauri window QA completed on Windows: system, light, dark, and custom modes were exercised; all six presets were visible; Settings was checked at normal and 760px narrow window sizes. No overflow, cutoff, overlap, broken border, or unreadable text was observed. The dev process tree was closed after verification.
### Phase 8.5C — Updater Hardening

- Added the exact frontend and Rust process plugin version `2.3.1` to support relaunch after update installation.
- Update handling now models checking, availability, downloading, ready-to-install, installing, installed, cancelled, and failed states, with coarse network/signature/download error classification.
- Settings exposes download progress and an explicit install-and-restart action. Signature verification remains enabled through the configured Tauri updater public key and endpoint.
- Release workflow now pins `tauri-apps/tauri-action@v2`; signing inputs remain GitHub Actions secret references only.
- Verification passed for TypeScript, production build, Rust check, and 40 Rust tests. Real GitHub Release publication, signed artifact verification, clean-machine upgrade, and data-preservation QA remain pending.

### Phase 8.5C — v0.1.2 no-update copy fix

- `settings.updateUnavailable` now means the updater check returned no available release: English uses `You are using the latest version.` and Chinese uses `当前已是最新版本`.
- The fix release version is `0.1.2`, aligned across package, Cargo, Cargo lock, and Tauri configuration.
- This change does not alter updater endpoints, signing configuration, versions, database behavior, or release artifacts.
- Local TypeScript, lint, production build, Rust build, and 40 Rust tests pass. Windows VM failure-mode testing and public Release verification remain external QA tasks.

### Phase 8.5C — v0.1.3 network error UX

- Update-check connection failures are classified as `network`; download failures remain `download_interrupted`.
- Settings displays localized, actionable messages instead of raw updater errors and changes the check action to `Retry` after failure or cancellation.
- The version is aligned at `0.1.3`; TypeScript, lint, production build, Rust build, and 40 Rust tests pass before release.

### Phase 8.5C — v0.1.4 updater failure QA

- An isolated QA app identifier and manifest exercise a real mismatched-signature failure without changing the production endpoint or public key.
- Update download and install failures now use localized actionable messages instead of raw plugin errors.
- Downloading exposes a cancel action that freezes progress, closes updater resources, records `cancelled`, and prevents transition to install. The upstream updater API has no native abort token, so transport-level cancellation remains a plugin limitation.
- `v0.1.5` is a version-only signed QA target used to test the `v0.1.4` interruption and cancellation behavior.
