# SkillHub Web

[Open SkillHub Web](https://yyr-465.github.io/SkillHubs/), the final public edition of SkillHub. The default Catalog contains eight sample Skills. Browse, search, and read Skill details, including safety notes, in English or Chinese UI with light and dark themes. The Windows desktop app is available as a [historical test release](../README.md#desktop-archive).

## Scope

The Web build intentionally exposes only what is safe to publish:

- Browse and search the catalogue
- Filter by category, risk, and source; sort and switch grid/list view
- Read Skill details (Markdown) with syntax highlighting
- See risk badges and a read-only safety note
- Share sample Skill details through a copyable URL that works after a refresh
- Favourites, search history, and recently viewed (local to the browser)
- English / Chinese and light / dark theme (persisted in `localStorage`)
- Read `SKILL.md` files from a local folder you select

The Web build does not automatically scan the desktop Skill directory or persist scans in SQLite. It does not provide dependency checks, process execution, import/export, backup, AI categorization, or tags. Those remain desktop-only and their UI is hidden in the Web build. Execution, scan, categorize, and backup commands fail closed in the Web data layer.

## How it works

`src/lib/runtime.ts` detects the runtime (`__TAURI_INTERNALS__`) and routes
every command either to the Tauri IPC bridge (desktop, unchanged) or to
`src/lib/webApi.ts` (Web). Both stores (`skillStore`, `settingsStore`) call
the unified `invoke` helper, so the same components render in both builds.

`src/main.tsx` selects `HashRouter` on the Web (shareable deep links on static
hosts without rewrites) and `BrowserRouter` in Tauri, and injects a Web-only
CSP meta tag. `App.tsx` mounts `WebDashboard` instead of the desktop
`Dashboard` on the Web and drops the Settings / Error Log / Conflicts routes.

## Data source & updates

The default Web Catalog is **static**, without a database or catalog API:

- `public/catalog/index.json` — Skill metadata list
- `public/catalog/skills/<id>.md` — Markdown body per Skill

The eight-Skill Catalog is generated from the committed source skills under
`web-catalog/skills/<id>/SKILL.md` (single-line YAML front matter: `name`,
`description`, `category`, `risk`, `date_added`, `icon`; the Markdown body
becomes the detail content). `web-catalog/skills/` is the sole editable source. `public/catalog/` is a committed generated snapshot used for review and local preview. To add or edit a Skill:

```powershell
# 1. Edit web-catalog/skills/<id>/SKILL.md (or add a new folder)
# 2. Regenerate the catalogue and build the Web site
pnpm run build:web
# 3. Commit the updated public/catalog snapshot with the source edit
```

`execution` front matter is intentionally ignored: the Web edition never
publishes execution declarations.

The generator rejects empty sources, invalid folder IDs, missing or malformed `SKILL.md` files, and Skills without a name, description, or Markdown body. It removes stale generated Markdown and verifies the index count and IDs. Pages regenerates the Catalog and fails if `public/catalog/` differs from the committed snapshot.

## Local folders and browser storage

Choose **Load local Skill folder** and select the folder in the browser's directory picker or folder input. The browser reads `SKILL.md` files recursively, reports skipped files, and keeps the parsed contents in memory. Local details are available while that folder is loaded. Reload the page or select **Back to sample catalog** to clear the local Catalog.

Browser storage can retain favorites, recent views, search history, language, theme, and view mode. A local detail link includes an encoded relative path with the selected folder name. The link depends on the local folder being loaded in that browser session. See the [Privacy Policy](../PRIVACY.md).

GitHub Pages serves the site and the sample Catalog. Folder loading reads selected files in the browser without uploading their contents. Remote HTTPS icons and README images may send requests to their hosts when rendered, including for local Skills.

## Live site

[GitHub Pages](https://yyr-465.github.io/SkillHubs/) hosts the Web edition. Pushes to `main` trigger the [Pages workflow](../.github/workflows/pages.yml). The Pages source is GitHub Actions.

## Build & deploy

```powershell
pnpm install --frozen-lockfile
pnpm run build:web  # regenerates public/catalog and emits ./dist
pnpm preview
```

Local preview options:

- `pnpm preview` — Vite preview server, correct MIME types.
- `python scripts/serve-web.py` — dependency-free static server on
  `http://localhost:8080/` with correct MIME types.
- ⚠️ Avoid plain `python -m http.server`: Python 3.14 serves `.js` as
  `text/plain`, which browsers reject for `<script type="module">` and render a
  blank page.

The relative Vite base lets `dist/` run under the `/SkillHubs/` project path. Pages installs from the frozen pnpm lockfile, then runs lint, README, Catalog and Worker tests, Worker type checking, the Web build, and the generated Catalog check before deploying `dist/`. Run the [local Web checks](../CONTRIBUTING.md#web-checks) before pushing.

## Known limitations

- **Original README** is available on the public site. With
  `VITE_TRANSLATION_API_URL` unset, the translation action is hidden. The
  translation client, IndexedDB cache, and Worker source are retained for reference.
- **Local loading reads SKILL.md files**: "Load local Skill folder"
  recursively reads files named `SKILL.md` (case-insensitive), displays valid
  Skills, and reports skipped invalid files. It does not read
  the desktop app's database, so skills that only exist in the database
  (AI-categorized, manually edited, or imported) and are not on disk will not
  appear.
- **No AI categorization**: categories shown on the Web come from each Skill's
  `category:` front matter, with an offline keyword-rule fallback
  (`src/lib/categorize.ts`) for Skills that have none. The desktop app's
  DeepSeek-based AI categorization writes to its local database and never
  reaches the static Web build.

## Security baseline

- **CSP** — a conservative policy is injected on the Web (see `src/main.tsx`);
  the desktop app keeps the equivalent policy from `tauri.conf.json`.
- **No raw HTML** — `react-markdown` renders Markdown only (raw HTML is not
  passed through) and code blocks use `react-syntax-highlighter`, which
  escapes content.
- **Highlighting** — `highlightText` escapes input before any
  `dangerouslySetInnerHTML` use, so search-term highlighting cannot inject
  markup.
- **SVG icons** — rendered through an inert `<img>` data URI so SVG markup from
  front matter cannot execute script or load external resources.
- **No secrets** — the Web build stores nothing secret; settings never persist
  an API key, and the catalogue contains no credentials.
- **Local files / execution** — only user-selected local folders are read in
  the browser; the Web data layer cannot execute processes.

## Desktop archive

The Tauri runtime and desktop test builds are documented in the [desktop archive](../README.md#desktop-archive). See the [desktop checks](../CONTRIBUTING.md#desktop-checks) for changes to that runtime.
