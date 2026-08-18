# SkillHub

SkillHub is an open-source Windows desktop application for discovering, organizing, searching, reviewing, and safely running locally installed AI skills.

It scans user-selected directories for `SKILL.md` files and builds a local catalog with categories, tags, favorites, full-text search, recent history, import/export, and optional AI-assisted categorization.

## Try it online

A free, read-only **Web edition** of the Skill catalogue is live at **<https://yyr-465.github.io/SkillHubs/>**. Browse, search, view details, and share example Skills in your browser with English/Chinese and light/dark themes — no account, no API key, and nothing is uploaded. The Web edition serves a static catalogue of example Skills; local scanning, dependency checks, and safe execution remain desktop-only.

> **Release status:** SkillHub is currently pre-1.0 software. Existing public installers are updater-signed but are not yet Authenticode-signed. The production signing and release gate must be completed before the installers are presented as a trusted public release. Since 2026-08-17 the free Web edition above is live; the desktop 1.0.0 public release remains gated on production code signing (see [Code signing policy](#code-signing-policy)).

## Features

- Scan user-selected directories for explicit `SKILL.md` files.
- Browse, search, filter, tag, categorize, and favorite skills.
- Store catalog data locally in SQLite with full-text search.
- Import and export skill metadata.
- Optionally categorize skills through the DeepSeek API.
- Preview and run only explicitly declared skill executions.
- Require confirmation and enforce a narrow executable allowlist without invoking a shell.
- Cancel or time out managed executions and clean up their Windows process trees.
- Check, download, verify, and install signed application updates.
- Use English, Chinese, dark, light, system, or custom themes.

## Platform

- Windows x64
- Tauri 2 and Rust backend
- React, TypeScript, and Vite frontend
- SQLite local data storage

## Installation

Pre-release installers are available from [GitHub Releases](https://github.com/yyr-465/SkillHubs/releases).

Until the production code-signing gate is complete, these installers must be treated as test builds. A production release will include:

- Authenticode-signed NSIS and MSI installers
- Tauri updater signatures
- `latest.json`
- `SHA256SUMS.txt`
- release notes

To uninstall SkillHub, use **Windows Settings → Apps → Installed apps → SkillHub → Uninstall**. User data under `%USERPROFILE%\.skillhub` is intentionally kept outside the application installation directory and is not intentionally removed by the uninstaller.

## Data and network behavior

SkillHub has no analytics or developer-operated telemetry service. Catalog data, settings, history, and execution audit records are stored locally.

Network access can occur in these cases:

- The user explicitly starts AI categorization, which sends skill names and descriptions to the DeepSeek API.
- The user explicitly checks for or downloads an update from GitHub Releases.
- A skill provides a remote icon URL, which the application WebView may request when displaying that skill.

Read the complete [Privacy Policy](PRIVACY.md) before using optional network features.

## Safe execution model

SkillHub does not infer commands from Markdown code blocks. A skill must contain an explicit execution declaration, and the user must review and confirm it before execution.

The backend validates the executable, arguments, working directory, and timeout; starts the program without a shell; bounds captured output; records a sanitized audit result; and manages process-tree cleanup.

This is a deliberately narrow safety boundary, not a general-purpose terminal or sandbox.

## Development

Prerequisites:

- Node.js 22
- pnpm 10
- Rust stable
- Windows build tools required by Tauri

Install dependencies and run the desktop application:

```powershell
pnpm install --frozen-lockfile
pnpm exec tauri dev
```

Run the required checks:

```powershell
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
cargo build --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Build a visibly labeled unsigned local QA installer without production updater metadata:

```powershell
pnpm run tauri:build:qa
```

## Web edition (build & deploy)

The Web edition is a static build of the same frontend. Its catalogue is generated from committed sources under `web-catalog/skills/<id>/SKILL.md`:

```powershell
node scripts/generate-catalog.mjs   # writes public/catalog/index.json + public/catalog/skills/<id>.md
pnpm run build                      # vite output to dist/
```

Preview locally (`scripts/serve-web.py` serves `.js` with the correct MIME type, unlike a plain `python -m http.server`):

```powershell
pnpm preview
# or: python scripts/serve-web.py
```

Deployment is automatic: pushing to `main` triggers `.github/workflows/pages.yml`, which requires the GitHub Pages source to be set to "GitHub Actions". A manual fallback builds locally and force-pushes `dist/` to the `gh-pages` branch:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-gh-pages.ps1
```

See [WEB.md](WEB.md) for the Web edition's scope, data source, and security notes.

## Code signing policy

SkillHub's [Code signing policy](CODE_SIGNING_POLICY.md) defines release provenance, approvals, Authenticode signing, updater signing, verification, and maintainer roles. The [Privacy Policy](PRIVACY.md) documents all current network behavior.

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Support and security

- Report reproducible bugs through [GitHub Issues](https://github.com/yyr-465/SkillHubs/issues).
- Do not include API keys, tokens, private keys, personal files, or sensitive paths in an issue.
- For a suspected security vulnerability, open a minimal issue requesting a private contact channel without publishing exploit details.

## License

SkillHub is licensed under the [MIT License](LICENSE).
