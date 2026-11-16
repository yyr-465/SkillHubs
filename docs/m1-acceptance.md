# M1 execution and acceptance

Baseline: local `3bf4e20`; existing user changes preserved. [Product specification](m1-local-skills-inventory.md) defines scope and count semantics. Baseline README, Catalog, Web identity and theme tests passed on Node 24.18.0.

| Task | Dependencies | Owner / edit boundary | Deliverable and gate | State |
| --- | --- | --- | --- | --- |
| M1.1 | Specification decisions | Lead; `shared/inventory/`, portable schema, shared contract tests, package scripts/config | Closed V1 schema, inferred types, shared validation, schema parity and strict type check | Passed |
| M1.2 | M1.1; expected values freeze before reading production output | QA; `qa/m1/`, `tests/inventory-e2e.test.ts` | Small synthetic example and reproducible 200 valid installations, independently derived expectation and unchanged-source check | Passed; [expected results frozen](../qa/m1/expected.md) |
| M1.3 | M1.1 | CLI; `local-agent/`, `tests/inventory-cli.test.ts` | Injected home/project/custom discovery, containment, links, overlap, budgets, statuses | Passed |
| M1.4 | M1.3 | CLI, same boundary | Bounded strict YAML and original-byte hashes; focused parser and scan checks | Passed |
| M1.5 | M1.1, M1.3–M1.4 | CLI, same boundary; lead owns package entry | Normal command writes a validated V1 manifest exclusively and fails safely; focused CLI tests | Passed |
| M1.6 | M1.1 | Web; `src/pages/Inventory/`, `src/lib/inventory*.ts`, App route, Web dashboard link, i18n, `tests/inventory-web.test.ts` | Local file gate, import/read/clear lifetime, no side effects; synthetic workflow before CLI integration | Passed |
| M1.7 | M1.6 | Web, same boundary | Counts, coverage, evidence, search, pagination, focus and bilingual layouts | Passed |
| M1.8 | M1.2, M1.5–M1.7 | QA, same boundary; lead integrates and signs off | Normal scan → Edge plus boundary and legacy regressions, timing and independent gate record | Passed for synthetic local acceptance; user trial unverified |

User trial remains a separate gate. Automated and browser results do not count as real-inventory feedback.

| Step | Changed files | Reason | Tests / evidence | Risks / limits |
| --- | --- | --- | --- | --- |
| 0: Specify, plan, task | M1 specification, this record | Fix the three denominators, logical source traceability, edit boundaries and gates before coding | Baseline README, Catalog, Web identity and theme tests passed. The QA agent froze expectations before production output. | Existing worktree changes were present before M1. |
| 1: Contract, fixtures, scanner | `shared/inventory/manifest.ts`, `docs/inventory-manifest-v1.schema.json`, `local-agent/{inventory.ts,skill-file.ts,tsconfig.json}`, `qa/m1/{expected.md,example-manifest.json,fixture.ts}`, focused tests | Keep the contract in one place; read only bounded Skill files and retain each legal provenance record | Five contract tests, strict CLI type check, and 200-install fixture assertions (198 raw hashes, 8 scanned sources, 260 locators, 5 diagnostics; 1,082,610 Skill bytes). Real junctions passed after the managed runner denied creating them. | Portable schema documents shape. The shared checker adds canonical timestamps and relations. Exact directory budget cutoff conservatively reports partial. Node 22 execution is unverified. |
| 2: Normal export entry | `local-agent/scan.ts`, `package.json`, `tests/inventory-cli.test.ts`, `tests/inventory-e2e.test.ts` | Validate before writing, preserve source and prior output, and give the user a local root ID legend | Lead ran the normal pnpm entry; E2E invokes the same Node entry with an injected home. Existing file, direct/aliased scan-root destination, Windows special paths, 8 MiB overflow and injected write failure all reject safely. | Node filesystem guards do not provide an atomic walk against concurrent replacement of ancestors. |
| 3: Web import and evidence | App route, Web dashboard link, `src/pages/Inventory/`, `src/lib/inventory.ts`, English/Chinese dictionaries and `tests/inventory-web.test.ts` | Review the three counts, coverage and evidence without mixing inventory with the Catalog | Six Web tests and production build passed. Real Edge first rendered the fixed example at 1440×1000 and 390×844 before loading CLI output. | Existing narrow sidebar remains fixed, so long evidence and paths wrap. Browser acceptance below. |
| 4: Verify | `qa/m1/edge.mjs`, `qa/m1/README.md`, this record and `MEMORY.md` | Independently compare scanner output to the frozen expectation and verify rendered behavior and privacy | Default and translation-configured production builds passed in real Edge. Lead inspected screenshots and reran the 20-test inventory suite with real junction support; all passed and none were skipped. | Native OS directory dialog was not re-exercised; browser directory-input fallback passed. Real user trial is separate. |

| Acceptance item | Result | Evidence | Next step |
| --- | --- | --- | --- |
| Multi-tool read-only scan and export | Pass | 200 installs across shared, Codex, Claude Code, Cursor and custom directories; 198 hashes, 8 scanned or partial roots of 10, 260 locators, 5 diagnostics. Fixture before/after file lists and hashes match. Exclusive output, junction and alias containment, path/entry/file/YAML limits, and >8 MiB rejection passed. | None for synthetic acceptance. |
| Shared V1 and Web import boundary | Pass | 20 inventory tests cover unknown version, closed records, illegal paths, duplicate identities/locators, dangling root references, strict UTF-8 and both byte limits. In Edge invalid imports retain prior data; clear, route exit and reload discard it. | None for V1. |
| Edge overview, evidence and controls | Pass | Empty page, zero installations, fixed partial example, unsupported and oversized files, and actual 200-record CLI exports. One identical-file group and two description groups matched the independent member lists. Search, source filter, pagination, keyboard chooser and evidence-to-installation focus passed. Desktop and narrow screenshot review passed, including Chinese labels at 390 px. | Existing sidebar takes 160 px in the narrow view; long paths and hashes wrap. |
| No requests or persistence from inventory | Pass | In both builds, import, inspect, and clear caused zero page network requests and zero observed storage operations. Local/session storage, IndexedDB, Cache Storage and cookie snapshots remained unchanged; URL-shaped metadata rendered as text. Configured build showed the existing translation action on a Catalog detail. | None for synthetic acceptance. |
| Build and legacy regression | Pass | Strict CLI type check, README/Catalog/Web identity/theme/Worker tests, Worker type check, lint (19 existing warnings), production Web build, and diff check passed. Catalog source and eight-item generated snapshot match the baseline. Edge loaded all eight samples, searched, rendered the detail README, and loaded five Skills using the directory fallback before restoring eight. | Native OS directory dialog was not re-exercised in this run. |
| Windows and Edge latency | Pass | Three runs per build; worst observed CLI 415 ms, Edge 48 ms. See timings below. | None for this host and fixture. |
| Node 22 runtime smoke | Passed in M1.9 | The M1.8 run used Node 24. See the [Node 22 execution evidence](#m19-node-22-execution). | Covered on `v22.23.2`. |
| Real user trial | Pass | Both real sources returned one installation each, for two distinct locations in total. The operator confirmed the expected counts and reported no known misses. See the [M1.10 trial record](#m110-real-user-trial-2026-11-16). | Use the sign-off as evidence for the release decision. |

Windows performance, 2026-11-16: Dell G16 7630, Intel Core i7-13650HX (20 logical processors), 15.7 GiB RAM, Windows 11 Home x64 build 26300, Node 24.18.0, Edge 157.0.4341.60. CLI times include process launch and validated export using the normal Node entry with only the home location injected. Edge times start at the file input change after selection and end on the first rendered overview, using Edge in headless mode with a fresh profile.

| Production build | CLI, target ≤5 s | Edge, target ≤1 s |
| --- | --- | --- |
| Default | 364, 415, 349 ms | 42, 48, 48 ms |
| Translation configured | 395, 367, 326 ms | 26, 41, 40 ms |

The managed shell blocked localhost DevTools and junction creation. Both passed when rerun on the same Windows host with the necessary local permissions. During harness debugging, raw keyboard events initially omitted Enter's character event, and a legacy assertion initially required a translation-only label in the default build. The harness now sends the intended key event and verifies the actual Catalog Markdown and the translation control appropriate to each build. No shipping code change was needed for either harness issue.

Reproduce from the repository:

~~~powershell
pnpm run test:inventory
pnpm run typecheck:inventory
pnpm run test:readme
pnpm run test:catalog
node --test tests/web-regressions.test.ts tests/theme.test.ts
pnpm run test:worker
pnpm run typecheck:worker
pnpm run lint
pnpm run build:web
git diff --check
git diff --exit-code -- public/catalog web-catalog
git ls-files --others --exclude-standard -- public/catalog web-catalog
node qa/m1/edge.mjs --synthetic
node qa/m1/edge.mjs
~~~

For the separate translation-configured build, screenshot flags and synthetic export generator, see the [QA instructions](../qa/m1/README.md).

## Follow-up audit (2026-11-16)

- Independent rerun on Node 24.18.0 passed the 200-installation scan, CLI type check and tracked diff check. The inventory suite had 19 passes and one skip because this process could not create a synthetic directory link. The Windows and Edge runs above record the earlier acceptance environment.
- Open scanner issue: a directory named `SKILL.md` at a scan root shadows valid Skills in sibling directories. A two-directory fixture produced zero installations with `invalid_file` and a partial root. Removing only the `SKILL.md` directory produced the expected one installation. The package boundary in `local-agent/inventory.ts` currently checks the entry name before checking its type. Add a regression case and make regular `SKILL.md` files the package boundary before release.
- Node 22.18+ runtime verification and the real-inventory trial remain open. During the trial, record which known locations the scanner covered, whether each available candidate can be located on disk, and any missed overlaps the user can identify. A trial report can contain counts and observations alone.

## M1.9 local verification (2026-11-16)

| Step | Changed files | Reason | Tests and evidence | Risks and limits |
| --- | --- | --- | --- | --- |
| 0. Baseline and specification | `docs/m1-local-skills-inventory.md`, `tests/inventory-cli.test.ts` | Define regular-file package boundaries and freeze the expected V1 locator before changing the scanner. | QA created an empty `SKILL.md/` and a sibling `kept/SKILL.md`. The old CLI exported a valid V1 manifest with 0 installations. The focused test exited 1 with expected 1. | Synthetic baseline uses an explicitly selected root. |
| 1. Scanner fix | `local-agent/inventory.ts`, `tests/inventory-cli.test.ts` | Restrict package detection and filename ambiguity to matching regular files. Keep diagnostics for same-name directories and links in grouping folders. | Independent QA and the lead recovered `kept/SKILL.md`. Mixed-case file spelling and package resource skipping passed. On Windows, QA simulated a case-sensitive listing. A directory case variant kept the valid file, and two regular-file variants resulted in `ambiguous_filename`. The real junction test covered `SKILL.md` and generic escape names. | Multiple case variants were exercised through a simulated listing. The existing concurrent filesystem replacement limit still applies. |
| 2. CLI export | — | Exercise the normal CLI with the V1 contract and independent 200-installation expectations. | The lead ran `pnpm run inventory:scan --no-defaults --root <fixture-root> --output <new-file>` and checked V1, the root ID and `kept/SKILL.md`. The existing 200-fixture test and standalone export yielded 200 locations, 198 distinct hashes, 8 scanned sources, 260 locators and 5 diagnostics. The test matched original hashes, source paths and before/after byte snapshots. | The 200-installation output used the synthetic test home. |
| 3. Web import | `qa/m1/edge.mjs` | Check that the recovered installation and duplicate evidence can be reached through the shipped page. | Edge `157.0.4341.60` used the file chooser to import the repaired export and showed `kept/SKILL.md` with counts 1 / 1 / 1. The unchanged 200 fixture still produced one identical-file group and two matching-description groups. One sample from each group focused its corresponding installation at 390 px. Browser checks observed 0 inventory requests and 0 storage operations. Across three 200-fixture runs, CLI export took 428 / 418 / 493 ms and Edge import took 26 / 31 / 25 ms. | Browser automation used a local production build and synthetic files. See the user trial below. |
| 4. Sign-off | This record, `MEMORY.md` | Record the local repair, runtime compatibility and real trial independently. | The lead reran `pnpm run test:inventory`, `pnpm run typecheck:inventory`, `pnpm run lint`, `pnpm run build` and `git diff --check`. The Node 22 rerun passed 21 tests with no skips. Lint had 19 pre-existing warnings. | Real user trial is unverified. |

### M1.9 Node 22 execution

**Passed** on Windows 11 Home x64 (`10.0.26300`) with `v22.23.2`, using the installed RStudio `resources/app/bin/node/node.exe`. The runtime directory was prepended to `PATH` for the verification shell. QA logged `process.version` and `process.execPath` at process startup with a temporary preload. The test workers and all observed scanner subprocesses reported the same version and executable, including the separate 200-fixture export. The lead verified the resolved runtime through `pnpm exec node` and reran the suite and Edge checks on that binary.

The managed run passed 20 tests and skipped the junction test. It also reported that the fixture could not create its output-parent junction. With local junction creation available, independent QA and lead reruns each passed 21 tests with 0 failures and 0 skips, including the output-parent check. The 200-fixture test scanned 1,082,610 `SKILL.md` bytes and checked the paths and hashes again after export. The managed Edge connection to localhost was denied. The local rerun completed the import and evidence checks.

To rerun with a selected Node 22 executable, replace the sample path and run from the repository root. Use a terminal that can create fixture junctions and connect to the local Edge preview.

~~~powershell
$node22 = 'C:\path\to\node22\node.exe'
$env:Path = (Split-Path -Parent $node22) + ';' + $env:Path
pnpm exec node -p 'process.version + " " + process.execPath'
pnpm run test:inventory
pnpm run typecheck:inventory
pnpm run lint
pnpm run build
git diff --check
& $node22 qa/m1/fixture.ts
& $node22 qa/m1/edge.mjs
~~~

## M1.9 real user trial

M1.9 finished with the real user trial pending. M1.10 continues that gate.

## M1.10 real user trial (2026-11-16)

**Passed.** The operator confirmed the independently counted expectations of one valid installation in each of two different package directories, for two distinct locations in total. The rerun matched all three counts and the operator reported no known missed installations or candidates.

### Trial steps

1. Label two familiar, distinct physical directories A and B. For each source independently, count readable, valid `SKILL.md` installations reached from that root before running the scanner. A grouping directory can contain packages. A regular `SKILL.md` establishes the package boundary, even if its metadata is invalid. Count the installation when the file meets the [M1 scan requirements](m1-local-skills-inventory.md#cli-and-discovery). Skip links, junctions, `.git`, `node_modules`, and resources inside packages. Record the union of the two sets as the expected total. Count distinct locations with identical bytes separately. Two ordinary, valid single-package sibling directories are sufficient for a small trial with counts `1 / 1 / 2`.
2. In PowerShell at the repository root, prepend the verified Node `v22.23.2` executable's directory to `PATH`. Replace both sample roots and keep the new output file in an existing directory outside both scan roots.

~~~powershell
$node22 = 'C:\path\to\node22\node.exe'
$env:Path = (Split-Path -Parent $node22) + ';' + $env:Path
$nodeVersion = pnpm exec node -p 'process.version'
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne 'v22.23.2') { throw 'Expected Node v22.23.2.' }
$nodeVersion
$trialOutput = Join-Path ([System.IO.Path]::GetTempPath()) "skillhub-trial-$([guid]::NewGuid()).json"
pnpm run inventory:scan --no-defaults --root 'C:\path\to\skills-a' --root 'D:\path\to\skills-b' --output $trialOutput
if ($LASTEXITCODE -ne 0) { throw 'Inventory scan failed.' }
$trialOutput
~~~

3. If `dist` is stale or its provenance is uncertain, run `pnpm run build:web` and confirm it succeeds. Run `pnpm run preview --host 127.0.0.1` and open the local URL printed by Vite. On the dashboard use **Local inventory → Choose inventory file** to import the exported JSON. Match A and B to **Scan coverage** using the full source IDs from the CLI legend. Source rows are sorted by ID. Check each source's count, status and diagnostics, then read **Installation locations** for the combined count. A successful export can include missing or partial roots.
4. Sample one group from each candidate type present. Follow **View installation** and confirm the sampled group's original files on disk. Use each displayed source number to find the full ID under **Scan coverage**, then join its CLI root directory with the displayed relative path. Verify at least two distinct member installations per sampled group and record how many were located. If a type is absent, record that observation and cite the [synthetic candidate evidence](../qa/m1/expected.md) and [M1.9 Edge results](#m19-local-verification-2026-11-16).

### Anonymous feedback

~~~text
Node version:
Preview file chooser import: succeeded / failed / untried
A expected / observed, scan status, diagnostic types and counts:
B expected / observed, scan status, diagnostic types and counts:
Deduplicated total expected / observed:
Identical files: absent / sampled and located n/n / locating failed / untried
Matching descriptions: absent / sampled and located n/n / locating failed / untried
Known missed installation, candidate or count difference (category and observation only):
~~~

Keep the manifest, paths, source IDs, screenshots and file contents on the scanned machine.

### Trial observations

- First run: the preview file chooser imported the inventory. One custom source was missing and showed zero installations. The other was scanned and showed one. The overall count was one with one reported diagnostic. Both candidate types had zero groups. The two source observations had not yet been mapped to A and B.
- Retry: the operator was guided to copy each intended directory's full address from File Explorer, check both with `Test-Path -LiteralPath <path> -PathType Container`, export to a fresh output, and import that file. The normal preview chooser succeeded. Both sources were scanned with zero diagnostics. The initial difference is explained by an unresolved root on the first attempt. The retry resolved both roots, and the reason the original path failed to resolve was undetermined.

| Measure | Expected | Observed on retry |
| --- | ---: | ---: |
| Source A installation locations | 1 | 1, scanned |
| Source B installation locations | 1 | 1, scanned |
| Deduplicated installation locations | 2 | 2 |

- The overview showed two different file contents. Both real candidate types had zero groups. Evidence for locating both types comes from the [frozen fixture](../qa/m1/expected.md) and the synthetic Edge results below. The 200-installation fixture covers overlapping roots and both candidate rules.
- The lead verified `pnpm exec node` on `v22.23.2` before handoff and pinned the trial command to that version. The operator's UI observations do not include a separate runtime readout.

### Verification and sign-off

- The lead and an independent read-only QA reviewer checked the command, counting rules, source mapping and feedback fields against the specification and fixtures. QA counted two installations in each populated source of the small V1 fixture and three in the union.
- On Node `v22.23.2`, the normal PowerShell scan with two fixture roots produced A `50`, B `10`, overall `50`, both roots scanned, and zero diagnostics. The lead verified the CLI legend against both V1 sources. The inventory suite passed all 21 tests with zero skips, and the inventory type check passed. The Edge `157.0.4341.60` run with the existing production build imported the synthetic exports and checked one identical-file group and two matching-description groups. It observed zero inventory requests and storage operations. Worst of three fixture runs was 513 ms for the CLI and 27 ms for Edge import.
- For a count difference, check the root mapping, the package boundary, the scan status and diagnostics before classifying a missed installation. For a known duplicate omission, check that two distinct installed files satisfy the byte-hash rule or the normalized-description rule. Record the expected behavior, actual behavior, user impact and a minimal reproduction with a synthetic fixture for each confirmed defect.
- Sign off as **Passed** when the file chooser import succeeds, all three counts match or have verifiable explanations consistent with the specification, and the sampled members of each observed candidate type can be located. Use **Issues found** for observed behavior that violates the specification. Use **Unverified** while evidence or attribution is pending.

**M1 sign-off for release decisions.** The local technical acceptance and the real user trial passed. The independent QA reviewer confirmed the sign-off against the anonymous observations and frozen fixture evidence. The retry produced no reproducible defect requiring a repair task.
