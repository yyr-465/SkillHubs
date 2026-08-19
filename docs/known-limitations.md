# Known limitations

SkillHub is pre-1.0 software. This page lists the limitations we are aware of
and their current disposition. It is updated as the project progresses.

## Release & signing

- **Installers are not yet Authenticode-signed.** Existing public installers
  are updater-signed but not publisher-signed. The production signing and
  release gate must complete before installers are presented as a trusted
  public release (see [Code signing policy](../CODE_SIGNING_POLICY.md)).
  Until then, treat installers as test builds.

## Desktop application

- **Keyboard accessibility is partial.** There are local `Escape`/keyboard
  handlers (search suggestions, tag manager), but dialog-level `Escape` and
  full focus management are not uniformly implemented. A dedicated
  accessibility pass is planned.
- **No explicit multi-threaded concurrency stress test.** Database access,
  categorization, and execution are serialized by design (single mutex,
  atomic guards, managed process registry), so risk is low; a dedicated stress
  test may be added later.
- **AI categorization quality varies.** Categorization uses the DeepSeek API
  when configured; if the model does not follow the requested `Reason:`
  format, the category is still saved but the reason field is empty
  (graceful degradation).
- **DeepSeek end-to-end verification** requires a runtime API configuration;
  the project's automated tests never read or store an API key.
- **Search edge cases:** very short single-letter queries may return empty
  results with the full-text tokenizer.
- **Execution allowlist is deliberately narrow:** only `echo`, `python`,
  `python3`, and `node` are accepted, without a shell. General shell
  features are not supported (see [Safe execution](safe-execution.md)).
- **Legacy `execute_skill` is deprecated:** use the confirmation-based
  `start_skill_execution` flow.

## Export

- **CSV files include a UTF-8 BOM** for Excel compatibility; code that parses
  CSV should expect the first column name to carry the BOM (a no-BOM option
  may be added later).
- **Markdown report descriptions are truncated to 80 characters** as a table
  display tradeoff.
- **Package export requires a writable folder:** by default the frontend file
  access is limited to Desktop, Documents, and Downloads; the folder picker
  grants access to the folder you choose for the export.

## Web edition

The Web edition is read-only. Known constraints (see [WEB.md](../WEB.md)):

- It serves a static catalogue of example Skills; local scanning, dependency
  checks, AI categorization, and execution are desktop-only.
- "Load local folder" counts `SKILL.md` files found recursively and does not
  read the desktop database, so desktop-only skills (AI-categorized,
  manually-edited, or imported) do not appear.
- AI categorization is desktop-only; the Web edition uses an offline
  keyword-rule categorizer for local skills without an explicit `category`.

## Supply chain

- The remaining `pnpm audit` findings (nanoid, postcss) are build-time
  transitive dependencies of the toolchain (vite/tailwindcss) and do not enter
  the runtime artifact; they will be cleared on the next toolchain refresh.

## Pending desktop verification

The following were verified by automated checks but still need real-desktop
confirmation in a Tauri environment:

- CSP runtime behavior after the security hardening.
- Machine-migration re-point flow (change directory → re-scan) in the UI.
- Theme, minimum-window, and keyboard visual QA on a real desktop.
