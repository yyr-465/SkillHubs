# Contributing to SkillHub

Thanks for considering a contribution! SkillHub is a small open-source project, so please keep changes focused and discuss larger designs before starting.

## Development setup

See the [Development](README.md#development) section of the README for prerequisites. In short:

```powershell
pnpm install --frozen-lockfile
pnpm exec tauri dev
```

## What to work on

- Check [GitHub Issues](https://github.com/yyr-465/SkillHubs/issues) for open bugs and feature requests.
- The public roadmap lives in `可公开发布的正式版剩余路线.md` (Chinese); `MEMORY.md` records completed phases and known risks.
- The Web edition's scope, data source, and update flow are documented in [WEB.md](WEB.md).

## Project layout

- `src/` — React 19 + TypeScript + Vite frontend (pages, components, stores, i18n).
- `src-tauri/src/` — Tauri 2 + Rust backend: commands, SQLite access, scanner, execution, backup.
- `web-catalog/skills/<id>/SKILL.md` — committed sources for the example Skills served by the Web catalogue.
- `scripts/` — catalogue generation, local preview, and deploy helpers.
- `qa/` — phase QA reports and evidence.

## Required checks

Before committing, run and pass all of the following:

```powershell
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
cargo build --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Bug fixes should include a focused regression test when practical.

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
