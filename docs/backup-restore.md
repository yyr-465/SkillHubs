# Backup & restore

SkillHub keeps your Skills, categories, tags, favorites, settings, history, and
execution audit in a local SQLite database. This guide explains how to protect
that data and move it to a new machine.

## Create a backup

1. Open **Settings → Backup & Restore**.
2. Click **Create backup** and choose where to save the JSON file.

The backup contains skill metadata, tags and associations, search history,
recent views, categorization history, execution audit, and settings.

**Backups never contain secrets:** the API key, tokens, and private keys are
excluded. Restoring also preserves the current machine's API key.

## Restore from a backup

1. Open **Settings → Backup & Restore**.
2. Click **Restore from backup** and select a backup file.
3. Review the preview (counts per section plus any warnings).
4. Confirm.

Restore is safe by design:

- The file is validated (format, version, data bounds) **before** anything is
  written.
- The restore runs in a single transaction — a mid-restore failure rolls back
  completely, leaving existing data untouched.
- Restoring the same backup twice does **not** create duplicates (associations
  and audit rows are deduplicated by natural key).
- A backup created by a newer version is rejected with a clear message; the
  app never silently downgrades newer data.

## Verify the database

**Settings → Backup & Restore → Verify database** runs an integrity check and
reports the result. Use it after a crash or when behavior seems off.

## Data directory

All mutable data lives in `%USERPROFILE%\.skillhub\` (shown in the
application under **Settings → Backup & Restore → Data directory**). It is
outside the install directory, so uninstall does not remove it.

## Move to a new machine

1. On the old machine: **Settings → Backup & Restore → Create backup**, save
   the JSON file (or copy the whole `.skillhub` folder).
2. On the new machine: install SkillHub, then **Restore from backup** and
   confirm.
3. After restore, run **Scan now** once so absolute paths (skill folders) are
   re-pointed to the new machine's locations. Categories, tags, and favorites
   are preserved by the scan.

## Upgrade, rollback, and corruption

- **Upgrade:** schema migration runs automatically on launch; before any
  migration the raw database is copied to a `.pre-migrate-<timestamp>.bak`
  file so a failed migration is recoverable.
- **Rollback:** if a database was opened by a newer version, the older app
  refuses to migrate and reports "database is newer than this app supports".
  It never rewrites newer data in a way that loses information.
- **Corruption:** on startup an integrity check runs; a corrupt database is
  preserved as `.corrupt-<timestamp>.bak` before any recovery, and the app
  can continue with a fresh in-memory state rather than silently losing data.

The formal backup format and full data-directory reference are documented in
[Data directory & backup reference](../DATA_DIRECTORY.md).
