# SkillHub

**[Open SkillHub Web](https://yyr-465.github.io/SkillHubs/)**, the final public edition of SkillHub. Browse, search, and read eight sample AI Skills, or choose a local folder to read your own `SKILL.md` files. Access is free and requires no account or API key.

## Use SkillHub Web

1. Browse the sample catalog or search for a Skill by name or description.
2. Open a Skill to read its original README, including Markdown code blocks, and view its risk label. Sample detail links can be shared and opened directly.
3. Choose **Load local Skill folder** to read `SKILL.md` files recursively from a folder you select. Choose **Back to sample catalog** to restore the eight samples.

Selected file contents are held in memory for the current page session. Preferences, favorites, search history, and recent views can persist in browser storage. Remote HTTPS Skill icons and README images may be requested from their hosts. README translation is disabled on the public site.

See the [Web guide](WEB.md) and [Privacy Policy](PRIVACY.md) for details.

## Desktop archive

The [Windows x64 releases](https://github.com/yyr-465/SkillHubs/releases) are historical test builds. The Tauri/Rust source, Windows installers, and desktop documentation remain available for reference. The [Code Signing Policy](CODE_SIGNING_POLICY.md) documents the production signing requirements for desktop builds.

- [Installation and updates](docs/installation.md)
- [Getting started](docs/getting-started.md)
- [Safe execution](docs/safe-execution.md)
- [Backup and restore](docs/backup-restore.md) and [data directory reference](DATA_DIRECTORY.md)
- [Known desktop limitations](docs/known-limitations.md)
- [Former Windows 1.0 release plan](可公开发布的正式版剩余路线.md)

## Development

Build and preview the Web edition with Node.js 22 and pnpm 11.7.0.

```powershell
pnpm install --frozen-lockfile
pnpm run build:web
pnpm preview
```

The Web build generates `public/catalog/` from `web-catalog/skills/` before building `dist/`. Commit the regenerated catalog snapshot alongside any catalog source edit. Pushes to `main` trigger the [Pages workflow](.github/workflows/pages.yml), which checks that snapshot before deploying to GitHub Pages.

See [Contributing](CONTRIBUTING.md) for checks and development setup.

## Support and security

- Report reproducible bugs through [GitHub Issues](https://github.com/yyr-465/SkillHubs/issues). Keep credentials, private files, and sensitive paths out of reports.
- See the [Security Policy](SECURITY.md) for vulnerability reporting.

## License

SkillHub is licensed under the [MIT License](LICENSE).
