# SkillHub Project Instructions

## Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS, Zustand.
- Desktop/backend: Tauri 2, Rust, rusqlite with bundled SQLite.
- Package manager: pnpm (`pnpm-lock.yaml` is authoritative).

## Main Directories

- `src/`: React application, store, pages, components, and i18n.
- `src-tauri/src/`: Tauri commands, SQLite access, models, and categorization.
- `../总结/`: phase verification notes and known risks.

## Required Checks

- Frontend type check: `pnpm exec tsc --noEmit`
- Frontend production build: `pnpm run build`
- Frontend lint: `pnpm run lint`
- Backend build: `cargo build --manifest-path src-tauri/Cargo.toml`
- Backend tests: `cargo test --manifest-path src-tauri/Cargo.toml`

## Conventions

- Preserve the 10-column `skills` table contract.
- Keep `Layout` structure and `navItems` stable unless a task explicitly changes them.
- Do not change categorizer concurrency or retry behavior without an approved specification.
- Database writes spanning audit history and current state must use rusqlite transactions.
- Tauri command payloads use explicit request structs for multi-item operations.
- Keep frontend TypeScript strict and do not introduce `any`.

## Verification

- Bug fixes require a focused regression test when practical.
- Database conflict behavior must cover empty history, conflict detection, manual resolution, ordering, and rollback.
- UI changes must pass type check and production build; perform runtime visual checks when the desktop runtime is available.
