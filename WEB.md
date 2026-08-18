# SkillHub Web MVP

A free, read-only web edition of SkillHub. Users can browse, search, and read
Skill details — including safety notes — with English/Chinese language support
and light/dark themes. It runs on free static hosting and shares the desktop
app's frontend through a small data-layer abstraction.

## Scope

The Web build intentionally exposes only what is safe to publish:

- Browse and search the catalogue
- Filter by category, risk, and source; sort and switch grid/list view
- Read Skill details (Markdown) with syntax highlighting
- See risk badges and a read-only safety note
- Share a Skill via a copyable URL
- Favourites, search history, and recently viewed (local to the browser)
- English / Chinese and light / dark theme (persisted in `localStorage`)

The Web build **never** provides local scanning, dependency checks, process
execution, import/export, backup, AI categorization, or tags. Those remain
desktop-only and their UI is hidden in the Web build. Execution, scan,
categorize, and backup commands fail closed in the Web data layer.

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

The Web edition is backed by a **static catalogue**, not a database or API:

- `public/catalog/index.json` — Skill metadata list
- `public/catalog/skills/<id>.md` — Markdown body per Skill

The catalogue is generated from the committed source skills under
`web-catalog/skills/<id>/SKILL.md` (single-line YAML front matter: `name`,
`description`, `category`, `risk`, `date_added`, `icon`; the Markdown body
becomes the detail content). To add or edit a Skill:

```powershell
# 1. Edit web-catalog/skills/<id>/SKILL.md (or add a new folder)
# 2. Regenerate the catalogue
node scripts/generate-catalog.mjs
# 3. Rebuild and redeploy the static site
pnpm run build
```

`execution` front matter is intentionally ignored: the Web edition never
publishes execution declarations.

## Live site

The Web MVP is published at **https://yyr-465.github.io/SkillHubs/**
(GitHub Pages, `gh-pages` branch). To refresh it after a rebuild, re-run
`scripts/deploy-gh-pages.ps1`.

## Build & deploy

```powershell
pnpm install
pnpm run build      # emits ./dist
pnpm preview        # local smoke test (recommended)
```

Local preview options:

- `pnpm preview` — Vite preview server, correct MIME types.
- `python scripts/serve-web.py` — dependency-free static server on
  `http://localhost:8080/` with correct MIME types.
- ⚠️ Avoid plain `python -m http.server`: Python 3.14 serves `.js` as
  `text/plain`, which browsers reject for `<script type="module">` and render a
  blank page.

`vite.config.ts` uses a relative `base`, so `dist/` deploys unchanged to any
static host, including sub-path hosting:

- **GitHub Pages** — push `dist/` to a `gh-pages` branch or use a Pages action
- **Cloudflare Pages** — build command `pnpm run build`, output `dist`
- **Vercel** — framework "Vite", build `pnpm run build`, output `dist`

### GitHub Pages (step-by-step)

Quickest path (publishes the already-built `dist/` without committing source):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-gh-pages.ps1
```

Then enable Pages once: **Settings → Pages → Source: "Deploy from a branch" →
`gh-pages` → `/ (root)` → Save**. Site URL:
`https://yyr-465.github.io/SkillHubs/`.

For automatic deploys on every push to `main`, commit
`.github/workflows/pages.yml` and set Pages Source to "GitHub Actions".

No API keys, backend, or custom domain are required.

## Known limitations

- **Local loading counts SKILL.md files**: "Load local Skill folder"
  recursively counts files named `SKILL.md` (case-insensitive). It does not read
  the desktop app's database, so skills that only exist in the database
  (AI-categorized, manually edited, or imported) and are not on disk will not
  appear.
- **No AI categorization**: categories shown on the Web come from each Skill's
  `category:` front matter, with an offline keyword-rule fallback
  (`src/lib/categorize.ts`) for Skills that have none. The desktop app's
  DeepSeek-based AI categorization writes to its local database and never
  reaches the static Web build, which cannot hold an API key without leaking
  it. This is an intentional scope boundary, not a bug.

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
- **No filesystem / execution** — the Web data layer has no access to local
  files or processes.

## Keeping the desktop app working

The desktop app is unchanged functionally: it keeps the Tauri IPC bridge, the
full Dashboard/Settings/Error Log/Conflicts routes, scanning, execution, tags,
import/export, backup, and updater. The Web layer is additive. Desktop
Required Checks (`tsc`, `build`, `lint`, `cargo build`, `cargo test`) remain
part of the release gate.
