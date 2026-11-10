# Contributing to SkillHub

Thanks for considering a contribution! SkillHub is a small open-source project, so please keep changes focused and discuss larger designs before starting.

## Development setup

See the [Development section](README.md#development) for the Web prerequisites.

```powershell
pnpm install --frozen-lockfile
pnpm run dev
```

## What to work on

- Check [GitHub Issues](https://github.com/yyr-465/SkillHubs/issues) for open bugs and feature requests.
- The current public edition's scope, data source, and update flow are documented in [WEB.md](WEB.md).
- The [Windows 1.0 release roadmap](可公开发布的正式版剩余路线.md) is a historical plan. [Project memory](MEMORY.md) records prior decisions and verification.

## Project layout

- `src/` — React 19 + TypeScript + Vite frontend (pages, components, stores, i18n).
- `src-tauri/src/` — Tauri 2 + Rust backend: commands, SQLite access, scanner, execution, backup.
- `web-catalog/skills/<id>/SKILL.md` — committed sources for the example Skills served by the Web catalogue.
- `public/catalog/` — committed generated snapshot; regenerate with `pnpm run build:web` after editing Catalog sources and commit the updated output.
- `scripts/` — catalogue generation, local preview, and deploy helpers.
- `qa/` — phase QA reports and evidence.

## Web checks

Run these checks before committing Web changes.

```powershell
pnpm run lint
pnpm run test:readme
pnpm run test:catalog
pnpm run test:worker
pnpm run typecheck:worker
node --test tests/web-regressions.test.ts
pnpm run build:web
git diff --check
```

Pages checks that regenerated `public/catalog/` matches what is committed. Include the generated snapshot when Catalog sources change. Bug fixes should include a focused regression test when practical.

## Desktop checks

Desktop development requires Rust and the Windows build tools for Tauri. Use `pnpm exec tauri dev` to run the desktop app. For desktop changes, run the Web checks and the following commands.

```powershell
pnpm run build
cargo build --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## Commit guidelines

- Keep each commit focused on one change.
- Use Conventional-Commits style prefixes (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`) with an optional scope, for example `feat(backup): ...`.
- Do not commit generated build output (`dist/`, `src-tauri/target/`) or TypeScript build info (`*.tsbuildinfo`).

## Security and privacy

- Never commit secrets: API keys, tokens, private keys, or `.env` files.
- Do not include local machine paths (for example `C:\Users\...` or drive-letter paths) in code, docs, tests, or QA evidence.
- Database writes that span audit history and current state must use rusqlite transactions.
- External input is validated at trust boundaries; dangerous operations are disabled by default or require explicit confirmation.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
