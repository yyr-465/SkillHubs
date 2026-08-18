// Phase 12: Formal backup format, restore, and migration-safety helpers.
//
// Backup format (version 1):
//   {
//     "format": "skillhub-backup",
//     "version": 1,
//     "created_at": "YYYY-MM-DD HH:MM:SS",
//     "app_version": "0.1.5",
//     "data": { ... }
//   }
//
// The data payload carries skills metadata (including category and favorite),
// tags and their associations, settings (excluding secrets), search history,
// recent views, categorization history, and the execution audit. API keys,
// tokens, and other secrets are intentionally NOT serialized anywhere.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::models::Skill;
use crate::settings::AppSettings;

/// Identifies this file as a SkillHub backup.
pub const BACKUP_FORMAT_ID: &str = "skillhub-backup";
/// Current on-disk backup format version. Bump only with an explicit migration.
pub const BACKUP_FORMAT_VERSION: u32 = 1;

/// Sanity bounds applied before restore to reject malformed or hostile files.
const MAX_SKILLS: usize = 200_000;
const MAX_ROWS: usize = 2_000_000;
const MAX_STRING_LEN: usize = 65_536;

// ── Backup schema ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupFile {
    pub format: String,
    pub version: u32,
    pub created_at: String,
    pub app_version: String,
    pub data: BackupData,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BackupData {
    #[serde(default)]
    pub skills: Vec<Skill>,
    #[serde(default)]
    pub tags: Vec<BackupTag>,
    #[serde(default)]
    pub skill_tags: Vec<BackupSkillTag>,
    #[serde(default)]
    pub search_history: Vec<BackupSearchHistory>,
    #[serde(default)]
    pub recent_views: Vec<BackupRecentView>,
    #[serde(default)]
    pub categorization_history: Vec<BackupCategorization>,
    #[serde(default)]
    pub execution_audit: Vec<BackupExecutionAudit>,
    #[serde(default)]
    pub settings: Option<BackupSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupTag {
    pub name: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSkillTag {
    pub skill_id: String,
    pub tag_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSearchHistory {
    pub query: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRecentView {
    pub skill_id: String,
    pub viewed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupCategorization {
    pub skill_id: String,
    pub category: String,
    pub model: String,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupExecutionAudit {
    pub skill_id: String,
    pub command: String,
    pub outcome: String,
    pub detail: Option<String>,
    pub created_at: String,
}

/// Settings that are safe to back up. Deliberately excludes api_key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSettings {
    pub language: String,
    pub theme_mode: String,
    pub custom_primary: String,
    pub custom_background: String,
    pub minimize_to_tray: bool,
    pub skill_directory: Option<String>,
}

impl From<&AppSettings> for BackupSettings {
    fn from(s: &AppSettings) -> Self {
        BackupSettings {
            language: s.language.clone(),
            theme_mode: s.theme_mode.clone(),
            custom_primary: s.custom_primary.clone(),
            custom_background: s.custom_background.clone(),
            minimize_to_tray: s.minimize_to_tray,
            skill_directory: s.skill_directory.clone(),
        }
    }
}

// ── Preview / summary payloads ───────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestorePreview {
    pub format: String,
    pub version: u32,
    pub created_at: String,
    pub app_version: String,
    pub skills: usize,
    pub tags: usize,
    pub skill_tags: usize,
    pub favorites: usize,
    pub search_history: usize,
    pub recent_views: usize,
    pub categorization_history: usize,
    pub execution_audit: usize,
    pub has_settings: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreSummary {
    pub skills: usize,
    pub tags: usize,
    pub skill_tags: usize,
    pub search_history: usize,
    pub recent_views: usize,
    pub categorization_history: usize,
    pub execution_audit: usize,
    pub settings_restored: bool,
    pub warnings: Vec<String>,
}

/// Internal result of a database restore; settings are applied by the caller.
pub(crate) struct RestoreOutcome {
    pub skills: usize,
    pub tags: usize,
    pub skill_tags: usize,
    pub search_history: usize,
    pub recent_views: usize,
    pub categorization_history: usize,
    pub execution_audit: usize,
    pub warnings: Vec<String>,
    pub settings: Option<BackupSettings>,
}

// ── Backup creation ──────────────────────────────────────────────

/// Serialize the complete database + settings into the versioned backup JSON.
pub fn create_backup(conn: &rusqlite::Connection, settings: &AppSettings) -> Result<String, String> {
    let data = read_backup_data(conn, settings);
    let backup = BackupFile {
        format: BACKUP_FORMAT_ID.to_string(),
        version: BACKUP_FORMAT_VERSION,
        created_at: db_now(conn),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        data,
    };
    serde_json::to_string_pretty(&backup).map_err(|e| format!("Could not serialize backup: {e}"))
}

fn db_now(conn: &rusqlite::Connection) -> String {
    conn.query_row("SELECT datetime('now','localtime')", [], |r| r.get::<_, String>(0))
        .unwrap_or_default()
}

fn read_backup_data(conn: &rusqlite::Connection, settings: &AppSettings) -> BackupData {
    BackupData {
        skills: query_skills(conn),
        tags: query_tags(conn),
        skill_tags: query_skill_tags(conn),
        search_history: query_search_history(conn),
        recent_views: query_recent_views(conn),
        categorization_history: query_categorization_history(conn),
        execution_audit: query_execution_audit(conn),
        settings: Some(BackupSettings::from(settings)),
    }
}

fn query_skills(conn: &rusqlite::Connection) -> Vec<Skill> {
    let mut stmt = match conn.prepare(
        "SELECT id, name, description, category, risk, date_added, source_path, source, favorite, icon
         FROM skills ORDER BY name COLLATE NOCASE",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([], crate::db::row_to_skill)
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
}

fn query_tags(conn: &rusqlite::Connection) -> Vec<BackupTag> {
    let mut stmt = match conn.prepare("SELECT name, color, created_at FROM tags ORDER BY name COLLATE NOCASE") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([], |r| {
        Ok(BackupTag { name: r.get(0)?, color: r.get(1)?, created_at: r.get(2)? })
    })
    .map(|rows| rows.filter_map(|r| r.ok()).collect())
    .unwrap_or_default()
}

fn query_skill_tags(conn: &rusqlite::Connection) -> Vec<BackupSkillTag> {
    let mut stmt = match conn.prepare(
        "SELECT st.skill_id, t.name FROM skill_tags st JOIN tags t ON t.id = st.tag_id ORDER BY t.name COLLATE NOCASE",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([], |r| Ok(BackupSkillTag { skill_id: r.get(0)?, tag_name: r.get(1)? }))
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
}

fn query_search_history(conn: &rusqlite::Connection) -> Vec<BackupSearchHistory> {
    let mut stmt = match conn.prepare("SELECT query, created_at FROM search_history ORDER BY id") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([], |r| Ok(BackupSearchHistory { query: r.get(0)?, created_at: r.get(1)? }))
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
}

fn query_recent_views(conn: &rusqlite::Connection) -> Vec<BackupRecentView> {
    let mut stmt = match conn.prepare("SELECT skill_id, viewed_at FROM recent_views ORDER BY id") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([], |r| Ok(BackupRecentView { skill_id: r.get(0)?, viewed_at: r.get(1)? }))
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
}

fn query_categorization_history(conn: &rusqlite::Connection) -> Vec<BackupCategorization> {
    let mut stmt = match conn.prepare(
        "SELECT skill_id, category, model, reason, created_at FROM categorization_history ORDER BY id",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([], |r| {
        Ok(BackupCategorization {
            skill_id: r.get(0)?,
            category: r.get(1)?,
            model: r.get(2)?,
            reason: r.get(3)?,
            created_at: r.get(4)?,
        })
    })
    .map(|rows| rows.filter_map(|r| r.ok()).collect())
    .unwrap_or_default()
}

fn query_execution_audit(conn: &rusqlite::Connection) -> Vec<BackupExecutionAudit> {
    let mut stmt = match conn.prepare(
        "SELECT skill_id, command, outcome, detail, created_at FROM execution_audit ORDER BY id",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    stmt.query_map([], |r| {
        Ok(BackupExecutionAudit {
            skill_id: r.get(0)?,
            command: r.get(1)?,
            outcome: r.get(2)?,
            detail: r.get(3)?,
            created_at: r.get(4)?,
        })
    })
    .map(|rows| rows.filter_map(|r| r.ok()).collect())
    .unwrap_or_default()
}

// ── Validation ───────────────────────────────────────────────────

fn parse_and_validate(json: &str) -> Result<BackupFile, String> {
    let backup: BackupFile = serde_json::from_str(json).map_err(|e| format!("Not a valid SkillHub backup: {e}"))?;

    if backup.format != BACKUP_FORMAT_ID {
        return Err(format!(
            "Not a SkillHub backup (unexpected format '{format}').",
            format = backup.format
        ));
    }
    if backup.version == 0 {
        return Err("Backup is missing a format version.".to_string());
    }
    if backup.version > BACKUP_FORMAT_VERSION {
        return Err(format!(
            "Backup version {v} is newer than this app supports (up to {max}). Update SkillHub first.",
            v = backup.version,
            max = BACKUP_FORMAT_VERSION
        ));
    }

    let data = &backup.data;
    if data.skills.len() > MAX_SKILLS {
        return Err(format!("Backup contains too many skills ({}).", data.skills.len()));
    }
    let row_lists = [
        ("tags", data.tags.len()),
        ("tag associations", data.skill_tags.len()),
        ("search history", data.search_history.len()),
        ("recent views", data.recent_views.len()),
        ("categorization history", data.categorization_history.len()),
        ("execution audit", data.execution_audit.len()),
    ];
    for (label, len) in row_lists {
        if len > MAX_ROWS {
            return Err(format!("Backup contains too many {label} rows ({len})."));
        }
    }

    for skill in &data.skills {
        if skill.id.trim().is_empty() {
            return Err("Backup contains a skill with an empty ID.".to_string());
        }
        if skill.name.trim().is_empty() {
            return Err("Backup contains a skill with an empty name.".to_string());
        }
        if skill.id.len() > MAX_STRING_LEN || skill.name.len() > MAX_STRING_LEN {
            return Err("Backup contains an oversized skill field.".to_string());
        }
    }

    Ok(backup)
}

/// Non-fatal warnings for references that would be skipped during restore.
fn reference_warnings(backup: &BackupFile) -> Vec<String> {
    let data = &backup.data;
    let skill_ids: HashSet<&str> = data.skills.iter().map(|s| s.id.as_str()).collect();
    let tag_names: HashSet<&str> = data.tags.iter().map(|t| t.name.as_str()).collect();

    let mut warnings = Vec::new();
    let empty_tags = data.tags.iter().filter(|t| t.name.trim().is_empty()).count();
    if empty_tags > 0 {
        warnings.push(format!("{empty_tags} tag(s) have empty names and will be skipped."));
    }
    let dangling_links = data
        .skill_tags
        .iter()
        .filter(|l| !skill_ids.contains(l.skill_id.as_str()) || !tag_names.contains(l.tag_name.as_str()))
        .count();
    if dangling_links > 0 {
        warnings.push(format!("{dangling_links} tag association(s) reference missing skills or tags and will be skipped."));
    }
    let dangling_views = data.recent_views.iter().filter(|v| !skill_ids.contains(v.skill_id.as_str())).count();
    if dangling_views > 0 {
        warnings.push(format!("{dangling_views} recent view(s) reference missing skills and will be skipped."));
    }
    let dangling_cat = data.categorization_history.iter().filter(|c| !skill_ids.contains(c.skill_id.as_str())).count();
    if dangling_cat > 0 {
        warnings.push(format!("{dangling_cat} categorization history row(s) reference missing skills and will be skipped."));
    }
    let dangling_audit = data.execution_audit.iter().filter(|a| !skill_ids.contains(a.skill_id.as_str())).count();
    if dangling_audit > 0 {
        warnings.push(format!("{dangling_audit} audit row(s) reference missing skills and will be skipped."));
    }
    warnings
}

/// Parse + validate a backup and return a human-reviewable preview.
pub fn preview_restore(json: &str) -> Result<RestorePreview, String> {
    let backup = parse_and_validate(json)?;
    let warnings = reference_warnings(&backup);
    let data = &backup.data;
    let favorites = data.skills.iter().filter(|s| s.favorite == Some(true)).count();
    Ok(RestorePreview {
        format: backup.format,
        version: backup.version,
        created_at: backup.created_at,
        app_version: backup.app_version,
        skills: data.skills.len(),
        tags: data.tags.iter().filter(|t| !t.name.trim().is_empty()).count(),
        skill_tags: data.skill_tags.len(),
        favorites,
        search_history: data.search_history.len(),
        recent_views: data.recent_views.len(),
        categorization_history: data.categorization_history.len(),
        execution_audit: data.execution_audit.len(),
        has_settings: data.settings.is_some(),
        warnings,
    })
}

// ── Restore ──────────────────────────────────────────────────────

/// Restore a validated backup into conn. The whole multi-table write runs in a
/// single transaction and rolls back completely on any failure. Idempotent: history
/// and associations are deduplicated by natural key, so a repeat restore never
/// creates duplicate associations or duplicate audit rows.
pub fn restore_backup(conn: &mut rusqlite::Connection, json: &str) -> Result<RestoreOutcome, String> {
    let backup = parse_and_validate(json)?;
    let warnings = reference_warnings(&backup);
    let data = &backup.data;

    let skill_ids: HashSet<&str> = data.skills.iter().map(|s| s.id.as_str()).collect();
    let tag_names: HashSet<&str> = data
        .tags
        .iter()
        .filter(|t| !t.name.trim().is_empty())
        .map(|t| t.name.as_str())
        .collect();

    let tx = conn.transaction().map_err(|e| format!("Could not start restore transaction: {e}"))?;

    // 1. Skills metadata (category + favorite are columns on skills).
    // Upsert instead of INSERT OR REPLACE: OR REPLACE deletes the existing row
    // (triggering ON DELETE CASCADE on dependent tables and changing rowid), which
    // would wipe associations and break idempotency.
    for skill in &data.skills {
        tx.execute(
            "INSERT INTO skills
                 (id, name, description, category, risk, date_added, source_path, source, favorite, icon)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                 name        = excluded.name,
                 description = excluded.description,
                 category    = excluded.category,
                 risk        = excluded.risk,
                 date_added  = excluded.date_added,
                 source_path = excluded.source_path,
                 source      = excluded.source,
                 favorite    = excluded.favorite,
                 icon        = excluded.icon",
            rusqlite::params![
                skill.id,
                skill.name,
                skill.description,
                skill.category,
                skill.risk,
                skill.date_added,
                skill.source_path,
                skill.source,
                skill.favorite.unwrap_or(false),
                skill.icon,
            ],
        )
        .map_err(|e| format!("Failed to restore skill '{}': {e}", skill.id))?;
    }

    // 2. Tags (idempotent by unique name).
    for tag in data.tags.iter().filter(|t| !t.name.trim().is_empty()) {
        tx.execute(
            "INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(name) DO UPDATE SET color = excluded.color",
            rusqlite::params![tag.name, tag.color, tag.created_at],
        )
        .map_err(|e| format!("Failed to restore tag '{}': {e}", tag.name))?;
    }

    // Resolve tag name -> local id after the merge above.
    let mut tag_ids: HashMap<String, i64> = HashMap::new();
    {
        let mut stmt = tx.prepare("SELECT id, name FROM tags").map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (id, name) = row.map_err(|e| e.to_string())?;
            tag_ids.insert(name, id);
        }
    }

    // 3. Tag associations (deduplicated by primary key).
    let mut skill_tags_count = 0usize;
    for link in &data.skill_tags {
        if !skill_ids.contains(link.skill_id.as_str()) || !tag_names.contains(link.tag_name.as_str()) {
            continue;
        }
        if let Some(&tag_id) = tag_ids.get(&link.tag_name) {
            skill_tags_count += tx
                .execute(
                    "INSERT OR IGNORE INTO skill_tags (skill_id, tag_id) VALUES (?1, ?2)",
                    rusqlite::params![link.skill_id, tag_id],
                )
                .map_err(|e| e.to_string())?;
        }
    }

    // 4. Search history (deduplicated by query + created_at).
    let mut search_count = 0usize;
    for h in &data.search_history {
        search_count += tx
            .execute(
                "INSERT INTO search_history (query, created_at)
                 SELECT ?1, ?2 WHERE NOT EXISTS (
                     SELECT 1 FROM search_history WHERE query = ?1 AND created_at = ?2
                 )",
                rusqlite::params![h.query, h.created_at],
            )
            .map_err(|e| e.to_string())?;
    }

    // 5. Recent views (one row per skill; idempotent).
    let mut views_count = 0usize;
    for v in &data.recent_views {
        if !skill_ids.contains(v.skill_id.as_str()) {
            continue;
        }
        views_count += tx
            .execute(
                "INSERT INTO recent_views (skill_id, viewed_at)
                 SELECT ?1, ?2 WHERE NOT EXISTS (
                     SELECT 1 FROM recent_views WHERE skill_id = ?1
                 )",
                rusqlite::params![v.skill_id, v.viewed_at],
            )
            .map_err(|e| e.to_string())?;
    }

    // 6. Categorization history (deduplicated by natural key).
    let mut cat_count = 0usize;
    for c in &data.categorization_history {
        if !skill_ids.contains(c.skill_id.as_str()) {
            continue;
        }
        cat_count += tx
            .execute(
                "INSERT INTO categorization_history (skill_id, category, model, reason, created_at)
                 SELECT ?1, ?2, ?3, ?4, ?5 WHERE NOT EXISTS (
                     SELECT 1 FROM categorization_history
                     WHERE skill_id = ?1 AND category = ?2 AND model = ?3 AND created_at = ?5
                 )",
                rusqlite::params![c.skill_id, c.category, c.model, c.reason, c.created_at],
            )
            .map_err(|e| e.to_string())?;
    }

    // 7. Execution audit (deduplicated by natural key).
    let mut audit_count = 0usize;
    for a in &data.execution_audit {
        if !skill_ids.contains(a.skill_id.as_str()) {
            continue;
        }
        audit_count += tx
            .execute(
                "INSERT INTO execution_audit (skill_id, command, outcome, detail, created_at)
                 SELECT ?1, ?2, ?3, ?4, ?5 WHERE NOT EXISTS (
                     SELECT 1 FROM execution_audit
                     WHERE skill_id = ?1 AND command = ?2 AND outcome = ?3 AND created_at = ?5
                 )",
                rusqlite::params![a.skill_id, a.command, a.outcome, a.detail, a.created_at],
            )
            .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| format!("Failed to commit restore: {e}"))?;

    crate::db::rebuild_fts_index(conn).map_err(|e| e.to_string())?;

    Ok(RestoreOutcome {
        skills: data.skills.len(),
        tags: tag_ids.len(),
        skill_tags: skill_tags_count,
        search_history: search_count,
        recent_views: views_count,
        categorization_history: cat_count,
        execution_audit: audit_count,
        warnings,
        settings: data.settings.clone(),
    })
}

/// Apply backup settings to the live settings file, preserving the current API key.
pub fn apply_backup_settings(backup: &BackupSettings) -> Result<(), String> {
    let mut current = crate::settings::load_settings();
    current.language = backup.language.clone();
    current.theme_mode = backup.theme_mode.clone();
    current.custom_primary = backup.custom_primary.clone();
    current.custom_background = backup.custom_background.clone();
    current.minimize_to_tray = backup.minimize_to_tray;
    current.skill_directory = backup.skill_directory.clone();
    crate::settings::save_settings(&current)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Skill;

    fn sample_skill(id: &str, name: &str) -> Skill {
        Skill {
            id: id.into(),
            name: name.into(),
            description: "desc".into(),
            category: Some("dev".into()),
            risk: Some("low".into()),
            date_added: Some("2026-08-01".into()),
            source_path: format!("/skills/{id}"),
            source: "test".into(),
            favorite: Some(true),
            icon: Some("🎨".into()),
        }
    }

    fn populate(conn: &mut rusqlite::Connection) {
        let skills = vec![sample_skill("a", "Alpha"), sample_skill("b", "Beta")];
        crate::db::replace_all_skills(conn, &skills).unwrap();
        crate::db::toggle_favorite(conn, "a", true).unwrap();
        crate::db::toggle_favorite(conn, "b", true).unwrap();
        let tag = crate::db::create_tag(conn, "web", "#ff0000").unwrap();
        crate::db::assign_tag(conn, "a", tag.id).unwrap();
        crate::db::add_search_history(conn, "rust").unwrap();
        crate::db::add_recent_view(conn, "a").unwrap();
        crate::db::record_execution_audit(conn, "a", "git status", "success", "ok").unwrap();
        crate::db::apply_categorization_result(conn, "a", "dev", "deepseek-chat", Some("reason")).unwrap();
    }

    #[test]
    fn round_trip_preserves_counts_and_fields() {
        let mut source = crate::db::init_memory_db().unwrap();
        populate(&mut source);
        let json = create_backup(&source, &AppSettings::default()).unwrap();

        assert!(json.contains(r#""format": "skillhub-backup""#));
        assert!(json.contains(r#""version": 1"#));
        assert!(!json.contains("api_key"));

        let mut target = crate::db::init_memory_db().unwrap();
        let preview = preview_restore(&json).unwrap();
        assert_eq!(preview.skills, 2);
        assert_eq!(preview.tags, 1);
        assert_eq!(preview.skill_tags, 1);
        assert_eq!(preview.favorites, 2);
        assert_eq!(preview.search_history, 1);
        assert_eq!(preview.recent_views, 1);
        assert_eq!(preview.categorization_history, 1);
        assert_eq!(preview.execution_audit, 1);

        let outcome = restore_backup(&mut target, &json).unwrap();
        assert_eq!(outcome.skills, 2);
        assert_eq!(outcome.tags, 1);
        assert_eq!(outcome.skill_tags, 1);
        assert_eq!(outcome.search_history, 1);
        assert_eq!(outcome.recent_views, 1);
        assert_eq!(outcome.categorization_history, 1);
        assert_eq!(outcome.execution_audit, 1);

        let restored = crate::db::get_all_skills(&target).unwrap();
        assert_eq!(restored.len(), 2);
        let a = restored.iter().find(|s| s.id == "a").unwrap();
        assert_eq!(a.category.as_deref(), Some("dev"));
        assert_eq!(a.risk.as_deref(), Some("low"));
        assert_eq!(a.favorite, Some(true));

        let tags = crate::db::get_skill_tags(&target, "a").unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "web");
    }

    #[test]
    fn restore_is_idempotent() {
        let mut source = crate::db::init_memory_db().unwrap();
        populate(&mut source);
        let json = create_backup(&source, &AppSettings::default()).unwrap();

        let mut target = crate::db::init_memory_db().unwrap();
        let first = restore_backup(&mut target, &json).unwrap();
        let second = restore_backup(&mut target, &json).unwrap();

        assert_eq!(first.skill_tags, 1);
        assert_eq!(second.skill_tags, 0);
        assert_eq!(second.execution_audit, 0);
        assert_eq!(second.categorization_history, 0);
        assert_eq!(second.search_history, 0);
        assert_eq!(second.recent_views, 0);

        let links: i64 = target.query_row("SELECT COUNT(*) FROM skill_tags", [], |r| r.get(0)).unwrap();
        let audit: i64 = target.query_row("SELECT COUNT(*) FROM execution_audit", [], |r| r.get(0)).unwrap();
        assert_eq!(links, 1);
        assert_eq!(audit, 1);
    }

    #[test]
    fn rescan_repaints_source_path_and_preserves_metadata() {
        // Machine A: a backup whose skill paths are machine-specific.
        let source = crate::db::init_memory_db().unwrap();
        let machine_a = |id: &str| Skill {
            id: id.into(),
            name: format!("Skill {id}"),
            description: "desc".into(),
            category: Some("dev".into()),
            risk: Some("low".into()),
            date_added: Some("2026-08-01".into()),
            source_path: format!("C:\\machineA\\skills\\{id}"),
            source: "configured".into(),
            favorite: Some(false),
            icon: None,
        };
        crate::db::replace_all_skills(&source, &[machine_a("a"), machine_a("b")]).unwrap();
        crate::db::toggle_favorite(&source, "a", true).unwrap();
        let tag = crate::db::create_tag(&source, "web", "#ff0000").unwrap();
        crate::db::assign_tag(&source, "a", tag.id).unwrap();
        let json = create_backup(&source, &AppSettings::default()).unwrap();

        // Machine B: restore. Saved metadata arrives intact, but source_path is
        // still the stale machine-A path until the user re-scans locally.
        let mut target = crate::db::init_memory_db().unwrap();
        restore_backup(&mut target, &json).unwrap();
        let restored = crate::db::get_skill_by_id(&target, "a").unwrap().unwrap();
        assert_eq!(restored.source_path, "C:\\machineA\\skills\\a");
        assert_eq!(restored.category.as_deref(), Some("dev"));
        assert_eq!(restored.favorite, Some(true));
        assert_eq!(crate::db::get_skill_tags(&target, "a").unwrap().len(), 1);

        // User re-selects a directory on machine B and re-scans. The scan yields
        // the same skill ids with new local paths, no category (front matter has
        // none), and the scanner default favorite=false — none may clobber data.
        let rescan = vec![
            Skill {
                id: "a".into(),
                name: "Skill a".into(),
                description: "desc".into(),
                category: None,
                risk: Some("low".into()),
                date_added: None,
                source_path: "C:\\machineB\\skills\\a".into(),
                source: "configured".into(),
                favorite: Some(false),
                icon: None,
            },
            Skill {
                id: "b".into(),
                name: "Skill b".into(),
                description: "desc".into(),
                category: None,
                risk: Some("low".into()),
                date_added: None,
                source_path: "C:\\machineB\\skills\\b".into(),
                source: "configured".into(),
                favorite: Some(false),
                icon: None,
            },
        ];
        crate::db::replace_all_skills(&target, &rescan).unwrap();

        // Repoint succeeded; saved metadata survived.
        let a = crate::db::get_skill_by_id(&target, "a").unwrap().unwrap();
        assert_eq!(a.source_path, "C:\\machineB\\skills\\a");
        assert_eq!(a.category.as_deref(), Some("dev"));
        assert_eq!(a.favorite, Some(true));
        let tags = crate::db::get_skill_tags(&target, "a").unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "web");

        let b = crate::db::get_skill_by_id(&target, "b").unwrap().unwrap();
        assert_eq!(b.source_path, "C:\\machineB\\skills\\b");
        assert_eq!(b.favorite, Some(false));
    }

    #[test]
    fn rejects_invalid_backups_without_writing() {
        let mut target = crate::db::init_memory_db().unwrap();
        crate::db::replace_all_skills(&target, &[sample_skill("keep", "Keep")]).unwrap();
        let before: i64 = target.query_row("SELECT COUNT(*) FROM skills", [], |r| r.get(0)).unwrap();

        assert!(preview_restore("not json").is_err());
        assert!(preview_restore(r#"{"format":"other","version":1,"created_at":"","app_version":"","data":{}}"#).is_err());
        assert!(preview_restore(r#"{"format":"skillhub-backup","version":99,"created_at":"","app_version":"","data":{}}"#).is_err());
        assert!(preview_restore(r#"{"format":"skillhub-backup","version":0,"created_at":"","app_version":"","data":{}}"#).is_err());
        assert!(preview_restore(r#"{"format":"skillhub-backup","version":1,"created_at":"","app_version":"","data":{"skills":[{"id":"","name":"x","description":"","source_path":"/","source":"s"}]}}"#).is_err());
        assert!(restore_backup(&mut target, r#"{"format":"skillhub-backup","version":1,"created_at":"","app_version":"","data":{"skills":[{"id":"","name":"x","description":"","source_path":"/","source":"s"}]}}"#).is_err());

        let after: i64 = target.query_row("SELECT COUNT(*) FROM skills", [], |r| r.get(0)).unwrap();
        assert_eq!(before, after);
    }
}
