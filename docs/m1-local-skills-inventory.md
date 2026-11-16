# M1 — Local Skills Inventory

Status: implementation specification, 2026-11-16. See the [execution record](m1-acceptance.md) for current implementation and verification status.
Audit baseline: `3bf4e2001123e83b5efb551e0de466dacae8afb3` on local `main`.

## Product scope

A heavy Skills user can run one command, import the resulting file in SkillHub Web, see what was found across the scanned locations, and review possible duplication with evidence. The acceptance journey is **200 installations → inventory JSON → Web overview → review candidates**. An installation is a distinct on-disk `SKILL.md` location; it is not a unique name, an enabled Skill, a package equivalence claim, or a usage event.

M1 covers read-only discovery, metadata extraction, a versioned manifest, and two kinds of duplicate evidence. It does not analyze tool logs, rank value, infer capability gaps, execute Skills, or manage installed files. It needs no service, account, cloud sync, database, or Windows installer. The public sample catalog and browser folder picker remain available.

## Scan and review

Run these commands from the repository root. Use Node.js 22.18 or later on the 22 line and pnpm 11.7.0, as used by the Pages build. If pnpm is missing, install it with `npm install --global pnpm@11.7.0` after setting up Node.js 22.

~~~powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm exec node --version
~~~

**Try the synthetic data.** Use `qa/m1/example-manifest.json` to see both evidence rules with three fictional installations. To generate a larger example through the scanner, run the following commands. The second line prints the JSON path to select in the browser. Expect 200 installation locations, 198 distinct file contents, eight scanned sources, one identical-file group, and two matching-description groups.

~~~powershell
$demo = node qa/m1/fixture.ts | ConvertFrom-Json
$demo.manifest
~~~

**Scan your own Skills.** Replace the sample root with the full path of an existing Skills collection or package. The command reads the selected directory and writes the manifest to a new file in your temporary directory. Choose an output location outside every scanned root.

~~~powershell
$inventory = Join-Path ([IO.Path]::GetTempPath()) "skillhub-inventory-$([guid]::NewGuid()).json"
pnpm run inventory:scan --no-defaults --root 'C:\path\to\skills' --output $inventory
$inventory
~~~

Repeat `--root` to include other directories. Omit `--no-defaults` to include the supported user roots, and add `--project .` to include the supported project roots. Each export needs a new filename. Keep the JSON and CLI source legend on the scanned machine when they contain private metadata or paths.

**Open the production preview.**

~~~powershell
pnpm run build:web
pnpm run preview --host 127.0.0.1
~~~

Open the preview URL printed by Vite. On the dashboard choose **Local inventory** (**本地盘点**), then **Choose inventory file** (**选择盘点清单**) on the inventory page. Select the example or the JSON at the path printed above. The browser reads the selected file into the current page session. Clearing the view, leaving the page, or refreshing it clears the session. Select the file again to resume reviewing it. To mirror the Pages project path, start the preview with `pnpm run preview --host 127.0.0.1 --base /SkillHubs/` and append `#/inventory` to the printed `/SkillHubs/` URL.

**Review evidence.** Start with **Scan coverage** and check the diagnostics for any missing or partial source. **Identical `SKILL.md` files** groups byte-for-byte matches of that file. Compare scripts, references, and dependencies separately before treating installations as interchangeable. **Matching descriptions** groups normalized descriptions shared by installations with different file contents and prompts a manual comparison. A scan can yield zero groups.

For a manifest from your own scan, expand a candidate and select **View installation**. Find its source number in **Scan coverage**, match the full source ID to the CLI's local directory legend, and join that directory with the displayed relative path. An installation can have several locators when roots overlap.

Point each root at a collection of packages or at one package. A regular file named `SKILL.md` marks the package boundary and stops traversal of that package's resources. A grouping directory named `SKILL.md` is traversed under the usual directory rules, along with its siblings. The older browser folder picker still reads nested files using its own rules.

## Read-only architecture audit

| Existing code | Finding | M1 decision |
| --- | --- | --- |
| [`src/lib/runtime.ts`](../src/lib/runtime.ts), [`src/App.tsx`](../src/App.tsx), [`src/main.tsx`](../src/main.tsx) | Web and Tauri share the React shell. Web uses a hash router and a Content Security Policy. | Add a Web-only inventory route linked from the [Web dashboard](../src/pages/WebDashboard/index.tsx). Keep the desktop routes and shared navigation stable. |
| [`src/lib/localSkills.ts`](../src/lib/localSkills.ts), [`src/lib/localSkillId.ts`](../src/lib/localSkillId.ts) | Folder picking is opt-in and browser-bound. The handwritten parser treats a folded YAML value such as `description: >-` as a single line. Its IDs encode a path relative to one picked folder. | Keep the existing picker flow. Reuse the ideas of a relative locator and explicit skipped entries, not the parser or ID format. The installed `js-yaml` 5.3.0 handles folded and literal YAML. |
| [`scripts/generate-catalog.mjs`](../scripts/generate-catalog.mjs) | Public generator uses a second single-line parser and intentionally fails the build for invalid curated data. | Leave the catalog format, generator, IDs, and committed assets alone. User scans must tolerate invalid neighbors. |
| [`src/lib/webApi.ts`](../src/lib/webApi.ts), [`src/store/skillStore.ts`](../src/store/skillStore.ts), [`src/pages/SkillList/index.tsx`](../src/pages/SkillList/index.tsx) | Web has reusable search, filter, sort, and query pagination patterns. The existing list actually requests up to 10,000 rows on Web and renders them in a grid. Its `Skill` has one source, desktop fields, and browser history integration; the README lookup can fall through to a fetch. | Reuse existing visual components, translations infrastructure, and list behavior where applicable; keep inventory data in its own page state. Paginate the inventory at 50 rows. Avoid forcing several source locations into the desktop-shaped `Skill` model or the legacy catalog override. |
| [`src/components/SkillIcon/index.tsx`](../src/components/SkillIcon/index.tsx), [`src/pages/SkillDetail/index.tsx`](../src/pages/SkillDetail/index.tsx) | Existing details can load remote icons or Markdown images and can opt into translation in a configured build. | Show imported metadata as text with a local icon; show comparison details on the inventory page. No imported README, links, external icons, translation, or visits tracked in the existing store. |
| [`src-tauri/src/scanner.rs`](../src-tauri/src/scanner.rs), [`src-tauri/src/parser.rs`](../src-tauri/src/parser.rs) | Current Rust scan searches one configured directory, uses leaf folder names as IDs, and follows directory checks through links. Its YAML parser is coupled to desktop execution declarations. | Keep the desktop scanner and persistence stable. The CLI must not depend on Tauri, SQLite, IPC, or parser execution rules. |
| [`package.json`](../package.json), [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) | pnpm, TypeScript, Node's test runner and YAML are already available. Pages builds on Node 22 and checks the generated catalog snapshot. | Keep one package and lockfile. Make the CLI and its pure modules directly runnable on Node 22.18+ and verify the Web build without changing deployment triggers. |

Audit verification: local `main` and cached `origin/main` agreed at the baseline; there were four pre-existing untracked files and no tracked changes before this document. The catalog, Web identity/language, and README regression checks passed on Node 24. An isolated probe of the installed YAML parser decoded a folded scalar and rejected aliases, duplicate keys, custom tags, and excessive depth using the settings below. Direct live GitHub and Pages checks were unavailable, so the audit does not establish current remote HEAD or formal browser E2E acceptance. The existing browser QA and deployment records in [project memory](../MEMORY.md) are historical evidence.

## CLI and discovery

Implement `local-agent/scan.ts` as one Node entry point in the existing package, exposed as `pnpm run inventory:scan`. Use `node:util.parseArgs`, `node:fs`, `node:path`, `node:os`, and `node:crypto`; use erasure-only TypeScript with relative `.ts` imports and a strict Node type check. The [Node 22 TypeScript docs](https://nodejs.org/docs/latest-v22.x/api/typescript.html) explain why the CLI cannot depend on Vite aliases or runtime TS transforms.

```powershell
pnpm run inventory:scan --output .\skillhub-inventory.json
pnpm run inventory:scan --project . --root .\extra-skills --output .\skillhub-inventory.json
pnpm run inventory:scan --no-defaults --root .\qa\fixtures\local-skill-folder --output .\skillhub-fixture-inventory.json
```

The two examples using the same output name are alternatives. `--output` is required and must name a new file outside all scanned roots. Resolve the output parent before checking containment; create the file exclusively without overwriting an existing file. Write a validated UTF-8 manifest only after scanning. A successful write exits zero, including an empty or partial report with diagnostics. Invalid flags, invalid output locations, size limits that prevent a valid export, or write failures exit nonzero. Report that the export failed and remove an incomplete file created by this invocation when safe. No other product files are written.

| Source kind | User roots, by default | Under one explicit `--project` |
| --- | --- | --- |
| Shared | `~/.agents/skills` | `.agents/skills` |
| Codex | `${CODEX_HOME}/skills` when set; otherwise `~/.codex/skills` | — |
| Claude Code | `~/.claude/skills` | `.claude/skills` |
| Cursor | `~/.cursor/skills` | `.cursor/skills` |
| Custom | A named directory for each repeatable `--root` | — |

Read only the single environment variable used to locate Codex Skills and the OS home directory location. `--no-defaults` skips home roots and requires an explicit project or custom root. The project flag checks the three listed locations directly under the supplied folder, without parent or monorepo discovery. Shared describes **one location** supported by Codex and Cursor; it does not mean both are installed or that a particular session can use a Skill. See [Codex Skills](https://learn.chatgpt.com/docs/build-skills), the [Codex installer source](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/skill-installer/scripts/list-skills.py), [Claude Code Skills](https://code.claude.com/docs/en/skills), and [Cursor Skills](https://cursor.com/docs/skills). Do not discover additional system, vendor plugin or cloud roots. Bundled or synced files already present in a scanned root are counted as files at that location; do not infer their origin or activation. A known local supplier directory can be selected explicitly. Do not read caches, tool settings, credentials, or logs to resolve discovery or activation.

- Walk selected roots and grouping directories only. Only a regular file whose name matches `SKILL.md` case-insensitively establishes a package boundary. Retain the actual filename spelling in provenance. Multiple matching regular-file case variants in the same directory yield `ambiguous_filename` and the package is skipped. In a grouping directory, a matching non-regular entry yields `invalid_file`, or `link_skipped` for a link or junction, without blocking traversal of ordinary subdirectories. Non-regular entries do not count toward filename ambiguity. Ignore `.git`, `node_modules`, and ancillary package files.
- Skip symbolic links, Windows junctions, and non-regular files. Use `lstat` and canonical containment checks before reads, including roots and candidates; do not walk into a linked entry. Bound reads to 1 MiB per file, tree depth to 32, and total inspected directory entries to 25,000. Directory or budget failures yield diagnostics and a visibly incomplete scan. Continue across inaccessible or malformed entries when budget allows; report missing default roots separately from unreadable roots.
- Deduplicate overlapping roots by canonical file location and retain all root-relative locators. Read each unique file at most once. Domain-separate installation IDs and root IDs, and derive them with SHA-256 from their canonical location (root ID also includes kind and scope; for missing roots use their resolved requested path). Do not lower-case all Windows paths. IDs are stable for the same paths on the same machine, including after edits, but may change after a move. Do not use identifiers as credentials or claim their hashes anonymize the inventory.
- Decode strict UTF-8, accept a UTF-8 BOM and either LF or CRLF, and parse at most 32 KiB of YAML front matter. Reuse `js-yaml` with `FAILSAFE_SCHEMA`, no aliases, nesting limit 16, and duplicate key errors. Copy only allowlisted own scalar strings. A valid mapping with non-empty `name` and `description` is required; a bad mapping or missing/invalid required field yields a skipped-file diagnostic. Optional invalid metadata is omitted. This is inventory validation, not a claim of compliance with every [Agent Skills rule](https://agentskills.io/specification) or a tool's eligibility rules.
- Compute the file digest from the original bytes, including front matter and Markdown body. Export only the fields below. Discard raw Markdown, arbitrary YAML, execution declarations and icons. Do not emit raw exceptions, absolute paths, or file contents in diagnostics. Relative paths and author-provided metadata can themselves contain private names or text; warn users before sharing a manifest.

## Local Agent → Web contract

Use a closed JSON Schema with `schemaVersion: 1` in `shared/inventory/manifest.ts`. Use that definition to infer the TypeScript types and generate the [portable JSON Schema](inventory-manifest-v1.schema.json) with `pnpm run inventory:schema`. The implementation interprets the small set of keywords used by V1; the initially proposed TypeBox package is absent from the local store and the package registry is unreachable in this checkout. No runtime code generation or new dependency is needed. Both the CLI and Web apply the same schema and cross-record checks; do not interpret a schema supplied by an imported file. The 8 MiB limit is a transport check applied before a Web file is read and before the CLI writes the serialized output.

| Record | V1 fields and constraints |
| --- | --- |
| Manifest | `schemaVersion` exactly `1`; `generatedAt` a canonical UTC ISO timestamp; `roots` 1–32 records; `installations` up to 2,000 records; `diagnostics` up to 1,000 records; `omittedDiagnostics` a nonnegative integer count. Size limit: 8 MiB of UTF-8 JSON in both runtimes. |
| Root | `id`: 64 lower-case hex characters; `kind`: `shared\|codex\|claude-code\|cursor\|custom`; `scope`: `user\|project\|custom`; `status`: `scanned\|partial\|missing\|unreadable\|skipped_link`. Each logical source keeps its own status. |
| Installation | `id` and `skillMdSha256`: 64 lower-case hex characters; `name`: trimmed, 1–128 characters; `description`: trimmed, 1–2,048; optional `compatibility`: trimmed, 1–512; `locations`: 1–32 entries, each with `rootId` and `relativePath` (max 1,024 characters, slash-separated under that root, ending in `SKILL.md` case-insensitively). |
| Diagnostic | `rootId`, `code` from a fixed enum, and optional relative path using the same path rules without the filename constraint. Codes: `root_unavailable`, `directory_unreadable`, `link_skipped`, `invalid_file`, `ambiguous_filename`, `invalid_front_matter`, `limit_reached`. |

Reject extra properties, duplicate record IDs, duplicate locators, unknown root references, incompatible kind/scope combinations, and locators under roots marked missing, unreadable or skipped. Reject absolute, drive/UNC, empty-segment, backslash, colon, control-character and dot-segment paths. Paths are display text, not browser URLs or filesystem instructions. Use plain data from the validated object without coercion and never resolve untrusted paths. Sort CLI arrays deterministically; only `generatedAt` changes between scans of an unchanged fixture. Derive counts from validated records; never trust a supplied total, risk, usage, or duplicate label. An unsupported version produces a specific message and leaves the existing view intact. The manifest is a local snapshot without signatures; it does not establish the truth of claims in arbitrary third-party imports.

The three overview counts have independent denominators:

| Label | Calculation |
| --- | --- |
| Installation locations | Number of distinct installation records. Multiple root-relative locators on one record count once. |
| Distinct file contents | Number of distinct `skillMdSha256` values across installations. |
| Scanned sources | Number of logical root records with `scanned` or `partial` status. The same physical directory may have multiple root records. |

All roots still appear in coverage, including missing, unreadable and skipped links. A skipped invalid file marks its root partial while valid neighbors remain. An individual location is identified by the logical root (kind, scope and root ID) and its relative path; the manifest cannot resolve an absolute location on another machine. The CLI can show a local console legend joining root IDs to selected directories for on-machine review; the legend is separate from the manifest and diagnostics. A diagnostic may refer to any known root, but an installation locator must refer to a scanned or partial root. A locator pair is unique across the whole file.

The traversal limits apply even when roots overlap: cache inspection results for the duration of one scan; each unique candidate file is opened for content at most once. Unrepresentable relative paths are diagnosed without exporting the invalid string. The entry/depth budget produces partial coverage; exceeding the installation or serialized manifest limits is an export failure, never a silent truncation of installations. Diagnostics may be capped with an omitted count. Link and containment checks are designed for normal read-only inventory; Node does not provide a portable directory-relative handle for an atomic walk under concurrently replaced Windows ancestors.

## Web workflow and review rules

1. In `#/inventory`, accept a file selected by the user. Check byte size before reading, parse and validate it locally, then replace the active in-memory snapshot in one step. Cancel or invalid input preserves the last valid snapshot. Leaving the page, clearing it, or reloading discards the snapshot; state the lifetime in the UI.
2. Show the three counts above, per-source coverage, a search by name/description/relative path, a logical source filter, and a paged installation list. A multi-source installation can appear in each applicable source count; the overall count is distinct. Show scan time, missing or partial roots, skipped diagnostics, and a separate empty state. Provide English and Chinese strings following the existing app conventions. Use the existing Web dashboard and list styling as the visual source; validate the static and synthetic states before the real CLI integration. Nothing derived from an inventory is transmitted, saved to browser storage, or written to the current Catalog/desktop store.
3. Compute suggestions in the browser from the validated installation rows:
   - **Identical `SKILL.md` files:** group two or more installations by the raw SHA-256 digest. Show locations and the common digest. Equal digest establishes matching file bytes for inventories from a trusted scan, not identical scripts, references, dependencies or packages. LF and CRLF variants may fall into the next rule instead.
   - **Matching descriptions — review:** normalize each description with Unicode NFKC, lower-case, collapse whitespace and trim. Group matching normalized descriptions with at least 32 Unicode letters/numbers and at least two distinct file digests. Show the shared description and the differing documents. The length floor suppresses short labels; it is a starting rule to verify on real inventories. Matching names alone are insufficient. This rule can miss paraphrases and can group generic copied descriptions.

Each suggestion shows its rule and points to the original installation rows, names, scopes, relative locations, and declared compatibility when known. A group with more than one digest can contain an exact subgroup; labels and counts distinguish the two rules. Offer a neutral review prompt to compare intended inputs/outputs, scripts, dependencies and tool scope. No deletion, disable, low-value, or replacement recommendation.

## Delivery sequence and acceptance

1. **Contract and fixtures:** define the closed schema first. Create a checked-in synthetic example and a repeatable 200-installation fixture covering four tool/shared kinds plus custom. Establish expected counts and groups independently of the implementation.
2. **Local Agent:** implement discovery, safe scan, parse, stable identity, validation and exclusive export. Cover default roots via an injected test home, one explicit project root, nested and overlapping roots, same name at distinct paths, CRLF/BOM, multiline YAML, malformed/missing metadata, missing/unreadable paths, excessive file size, and link/junction escapes. Confirm source bytes and file lists are unchanged and output cannot overwrite an input or existing output.
3. **Web boundary:** validate the generated file with the same schema. Reject unsupported version, oversized data, absolute and traversal paths, duplicate IDs, dangling root references and unknown fields without clearing a prior good import. Verify no browser storage writes or network requests caused by import, review or clear, including in a Web build with translation configuration. Never load remote resources from imported metadata.
4. **Overview and evidence:** implement the Web import and review flow with automatic checks for identical bytes across locations, description matches with different hashes, same-name false positives, same physical path discovered twice, and non-ASCII metadata. Exercise empty, partial, invalid and 200-row states in a real Windows browser; check keyboard use and layout at desktop and narrow widths. Confirm the original 8 public examples, search, detail, and manual folder import still work. A Pages deploy job by itself is not browser acceptance.
5. **Release gate:** run focused inventory tests, strict CLI type checking, lint, the existing Web tests and `pnpm run build:web`; confirm no catalog snapshot diff. On an ordinary Windows developer machine use the 200-valid-file fixture (`SKILL.md` bytes totaling at most 2 MiB) plus neighbouring invalid files, target ≤5 s from CLI start to export and ≤1 s from file selection to initial results in Edge, and record actual timings and environment. A real user trial must verify the count, usable evidence, and where the exact-description rule misses. The browser and real inventory validation are future M1 gates, not results of this audit.
