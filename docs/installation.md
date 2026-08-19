# Installation

SkillHub is a Windows x64 desktop application. This guide covers installing,
updating, and uninstalling it, and explains where your data lives.

> **Release status:** SkillHub is pre-1.0 software. Installers on the
> [Releases](https://github.com/yyr-465/SkillHubs/releases) page are
> updater-signed but are not yet Authenticode-signed. Treat them as test builds
> until the production code-signing gate is complete. See the
> [Code signing policy](../CODE_SIGNING_POLICY.md).

## System requirements

- Windows 10 or Windows 11, 64-bit (x64).
- No administrator rights are required to run the application.

## Install

1. Open the [Releases](https://github.com/yyr-465/SkillHubs/releases) page.
2. Download the installer for the latest version. Two formats are provided:
   - **NSIS installer** (`.exe`) — recommended for most users.
   - **MSI installer** (`.msi`) — for managed deployment.
3. Run the installer and follow the on-screen steps.

Pre-release builds are labeled **QA** and are visibly distinguishable from
production builds. Do not distribute unsigned QA builds as a public release.

## First launch

On first launch SkillHub creates its data directory automatically and shows the
onboarding screen. You do not need to edit any file by hand. See
[Getting started](getting-started.md) for the first-use walkthrough.

## Update

SkillHub checks for updates from GitHub Releases:

- When an update is available, **Settings → Updates** shows it with download
  progress and an explicit **Install and restart** action.
- Updates are signature-verified with the updater public key before they are
  offered. A mismatched signature is rejected.
- If the update check cannot reach the network, you will see a localized,
  actionable message instead of a raw error.

## Uninstall

Use **Windows Settings → Apps → Installed apps → SkillHub → Uninstall**.

Your data is stored in the user profile directory, **outside** the application
installation directory, and is intentionally **not** removed by the uninstaller.
Uninstalling and reinstalling later keeps your Skills, categories, tags,
favorites, settings, history, and audit records.

## Data directory

All mutable user data lives in a single directory outside the install path:

| Platform | Path |
| --- | --- |
| Windows | `%USERPROFILE%\.skillhub\` |

It contains `skills.db` (SQLite database) and `settings.json` (language,
theme, skill directory, and the optional DeepSeek API key). The application
shows the exact path under **Settings → Backup & Restore → Data directory**.

The full data-location and migration reference is in
[Data directory & backup reference](../DATA_DIRECTORY.md).

## Installer contents (production release)

A production release includes:

- Authenticode-signed NSIS and MSI installers
- Tauri updater signatures (`.sig`)
- `latest.json` (update manifest)
- `SHA256SUMS.txt` (checksums)
- Release notes
