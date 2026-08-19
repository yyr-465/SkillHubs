# Getting started

This guide walks through the first minutes with SkillHub: choosing a skills
folder, scanning, browsing, and running your first skill safely.

## 1. Install and launch

Install SkillHub from the [Releases](https://github.com/yyr-465/SkillHubs/releases)
page (see [Installation](installation.md)), then launch it.

Not ready to install? The read-only **Web edition** at
**<https://yyr-465.github.io/SkillHubs/>** lets you browse and search the sample
catalogue in your browser — no account or API key needed.

## 2. Choose your skills folder

On first launch the dashboard shows the onboarding state: no directory
configured and no skills.

1. Click **Select skill directory** (or **Change directory** later).
2. Pick the folder that contains your `SKILL.md` files. SkillHub scans it
   recursively.
3. Click **Scan now**.

Scanning only reads `SKILL.md` metadata — it never modifies your files.

> **A note about paths:** the dashboard tells you whether a directory is
> selected but never shows the absolute path, to keep your file layout private.

## 3. Explore your skills

Discovered skills appear on the dashboard and in the Skills page. You can:

- **Search** with full-text search (English and Chinese work well) and
  auto-complete suggestions.
- **Filter** by category, risk level, and tags.
- **Favorite** skills you use often.
- **Tag** and **categorize** skills. Categorization is automatic
  (keyword-based) or optional AI-assisted via the DeepSeek API in **Settings**.
- Open any skill to read its description, source metadata, and safety notes.

Everything is stored locally in SQLite — no account, no cloud.

## 4. Run a skill (optional)

Only skills that declare an explicit execution section offer a **Run** action:

1. Open the skill and review the execution preview (command, arguments,
   working directory, timeout).
2. Confirm when asked.
3. The command runs without a shell under a narrow executable allowlist, with a
   timeout and managed process-tree cleanup. Results and a sanitized audit
   record are kept locally.

If a required executable is missing (for example `git`), SkillHub tells you
**before** starting — install the executable or add it to `PATH`, then retry.
See [Safe execution](safe-execution.md) for the full model.

## 5. Common situations

| Situation | What to do |
| --- | --- |
| No directory configured | Choose a folder on the dashboard, then scan. |
| Empty folder | Add `SKILL.md` files (or a sample skill) and scan again. |
| Missing `SKILL.md` files | Each skill folder must contain a valid `SKILL.md`; invalid files are listed with a localized message. |
| Missing executable | Install it or configure `PATH`, then retry the run. |
| Changed machines | Use **Settings → Backup & Restore** to back up and restore, then **Scan now** to re-point paths. See [Backup & restore](backup-restore.md). |
| Anything unexpected | Report it through [GitHub Issues](https://github.com/yyr-465/SkillHubs/issues) (see [SECURITY](../SECURITY.md) for vulnerabilities). |
