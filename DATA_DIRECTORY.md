# SkillHub — Data Directory & Backup/Migration Reference

> Phase 12 · Applies to SkillHub 0.1.5+

This document defines where SkillHub keeps user data, the formal backup format,
and exactly how that data behaves across install, over-install, uninstall,
rollback, and machine migration.

---

## 1. Data directory

All mutable user data lives in a single directory **outside the install path**:

| Platform | Path |
| --- | --- |
| Windows | %USERPROFILE%\.skillhub\ |
| Linux / macOS | $HOME/.skillhub/ |

The directory contains two files:

| File | Contents |
| --- | --- |
| skills.db | SQLite database: skills metadata, categories, tags + associations, favorites, search history, recent views, categorization history, execution audit. |
| settings.json | User settings: language, theme, skill directory, tray behavior, and the DeepSeek API key. |

The directory is created automatically on first launch. The user never has to
create or edit it by hand.

The running application also shows the exact path under
**Settings → Backup & Restore → Data directory**.

---

## 2. Formal backup format

A backup is a single JSON file identified by:

- "format": "skillhub-backup"
- "version": 1 (current)

Structure (top-level fields):

- format — always "skillhub-backup".
- version — current format version (1).
- created_at — local timestamp when the backup was created.
- app_version — the SkillHub version that created it.
- data — the payload, with these sections:
  - skills — skill metadata (id, name, description, category, risk, date_added, source_path, source, favorite, icon).
  - tags — tag list (name, color, created_at).
  - skill_tags — associations as { skill_id, tag_name }.
  - search_history — { query, created_at }.
  - recent_views — { skill_id, viewed_at }.
  - categorization_history — { skill_id, category, model, reason, created_at }.
  - execution_audit — { skill_id, command, outcome, detail, created_at }.
  - settings — user settings WITHOUT api_key.

- **Categories** are stored as the category column on each skill (there is no
  separate categories table).
- **Favorites** are the favorite column on each skill.
- Tag associations reference a tag by its unique **name**, not its local numeric
  id, so they stay correct when restored onto a different machine.

### Versioning rule

A backup whose version is greater than the app supports is rejected with a
clear message ("created by a newer version"). The app never silently downgrades
or re-interprets a newer format.

### Secrets

API keys, tokens, and private keys are **never written to a backup**. The
settings section explicitly excludes api_key. Restore also preserves the
current machine's API key instead of importing one.

---

## 3. Data directory behavior by operation

### Clean install

- The installer writes only to the install directory.
- On first launch the app creates .skillhub/ and an empty schema. No user data
  exists yet.

### Over-install / upgrade (same user)

- The installer never touches %USERPROFILE%\.skillhub\.
- On launch the app opens the existing skills.db and migrates the schema in
  place (idempotent CREATE TABLE IF NOT EXISTS plus guarded ALTER TABLE).
- Before any migration runs, the app copies the raw database to
  skills.db.pre-migrate-<timestamp>.bak so a failed migration is always
  recoverable. Old-version data upgrades to the current version automatically.

### Uninstall

- Because the data directory is outside the install directory, uninstalling the
  app does **not** remove user data. Skills, tags, favorites, settings, history,
  and audit survive an uninstall/reinstall cycle.

### Rollback (downgrade)

- The schema is tracked with PRAGMA user_version.
- If a database was opened by a newer app version, an older app detects it and
  refuses to migrate, instead reporting "database is newer than this app
  supports". It never rewrites a newer schema in a way that would lose data.
- To move data back to an older version, restore a backup that was produced by
  that older version, or keep the data and re-upgrade.

### Machine migration

1. On the old machine, use **Settings → Backup & Restore → Create backup** and
   save the JSON file.
2. On the new machine, install SkillHub and use **Settings → Backup & Restore →
   Restore from backup**, then confirm the preview.
3. Alternatively, copy the whole .skillhub/ directory to the new machine's
   profile directory.

After migration, source_path (absolute skill folders) and skill_directory are
machine-specific; run **Scan Now** once to re-point them to the local
locations. Categories, tags, and favorites are preserved by the scan upsert.

---

## 4. Corruption & recovery

- On startup the app runs PRAGMA integrity_check. A corrupt database is
  reported (and shown in Settings → Backup & Restore → Verify database).
- Before falling back or repairing, the raw file is preserved as
  skills.db.corrupt-<timestamp>.bak so it is never silently overwritten.
- Restore is transactional: a failed or corrupt backup is rejected **before**
  any write, and any mid-restore failure rolls back the entire change, leaving
  existing data untouched.
- Repeated restores are idempotent: associations and audit rows are deduplicated
  by natural key, so restoring the same backup twice does not duplicate data.

---

## 5. Restore guarantees

- A backup can be restored onto a clean install and reproduce the same counts
  and key fields.
- A corrupt backup, an incompatible version, or a mid-restore failure does not
  pollute existing data.
- A repeat restore does not create duplicate tag associations or duplicate
  audit rows.
