# Historical Windows installation

This guide covers installing, updating, and uninstalling the historical
Windows x64 desktop test builds. [SkillHub Web](https://yyr-465.github.io/SkillHubs/)
is the final public edition.

> The [historical test installers](https://github.com/yyr-465/SkillHubs/releases)
> use Tauri updater signatures and predate Windows Authenticode signing.
> The [Code Signing Policy](desktop/code-signing-policy.md) documents the
> production signing requirements.

## System requirements

- Windows 10 or Windows 11, 64-bit (x64).
- No administrator rights are required to run the application.

## Install

1. Open the [Releases](https://github.com/yyr-465/SkillHubs/releases) page.
2. Select the historical version you want to inspect. Its installers come in two formats.
   - **NSIS installer** (`.exe`) — recommended for most users.
   - **MSI installer** (`.msi`) — for managed deployment.
3. Run the installer and follow the on-screen steps.

The local QA packaging command labels its builds **QA**. They are intended
for local testing.

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
[Data directory & backup reference](desktop/data-directory.md).

## Installer contents (production release)

A production release includes:

- Authenticode-signed NSIS and MSI installers
- Tauri updater signatures (`.sig`)
- `latest.json` (update manifest)
- `SHA256SUMS.txt` (checksums)
- Release notes
