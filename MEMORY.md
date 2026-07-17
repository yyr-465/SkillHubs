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
