/* FORCE_RECOMPILE */
use crate::models::{BatchCategorizeRequest, CategoryCount, FilterOptionWithCount, FilterOptions, ImportResult, RiskCount, SearchHistoryItem, Skill, SkillContent, SkillExportWrapper, SkillPage, SkillQuery, SortDirection, SortField, Stats, Tag, UpdateSkillRequest};
use rusqlite::{params, Connection, Result as SqlResult};
use std::collections::HashSet;
use std::path::PathBuf;
use std::fs;

/// Path to the SQLite database file under C:\Users\DELL/.skillhub/skills.db
pub(crate) fn db_path() -> PathBuf {
    let home = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    let dir = home.join(".skillhub");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("skills.db")
}

/// Cross-platform home directory resolution.
fn dirs_next() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

/// Open or create the database and ensure the schema exists.
pub fn init_db() -> SqlResult<Connection> {
    let path = db_path();
    let conn = Connection::open(&path)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS skills (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            category    TEXT,
            risk        TEXT,
            date_added  TEXT,
            source_path TEXT NOT NULL,
            source      TEXT NOT NULL DEFAULT 'agentic-awesome'
        );

        CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
        CREATE INDEX IF NOT EXISTS idx_skills_risk     ON skills(risk);
        CREATE INDEX IF NOT EXISTS idx_skills_source   ON skills(source);
        CREATE INDEX IF NOT EXISTS idx_skills_name     ON skills(name);
        ",
    )?;

    // Phase 4: Add favorite column if it does not exist
    let has_favorite = conn
        .prepare("SELECT favorite FROM skills LIMIT 1")
        .is_ok();
    if !has_favorite {
        conn.execute_batch(
            "ALTER TABLE skills ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;",
        )?;
        // Create index on favorite after the column exists
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_skills_favorite ON skills(favorite)", []);
    }
    // Ensure date_added index exists (column always exists in initial schema)
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_skills_date_added ON skills(date_added)", []);

    // Phase 5: Add icon column if it does not exist
    let has_icon = conn
        .prepare("SELECT icon FROM skills LIMIT 1")
        .is_ok();
    if !has_icon {
        conn.execute_batch(
            "ALTER TABLE skills ADD COLUMN icon TEXT;",
        )?;
    }

    // Phase 8: FTS5 virtual table for full-text search
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
           name, description, category,
           content='skills', content_rowid='rowid',
           tokenize='unicode61'
         );"
    )?;

    // Phase 8: Search history table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS search_history (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           query TEXT NOT NULL,
           created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
         );"
    )?;

    // Phase 8: Recent views table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS recent_views (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           skill_id TEXT NOT NULL REFERENCES skills(id),
           viewed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
         );"
    )?;

    // Phase 8: Rebuild FTS index at startup
    let _ = conn.execute("INSERT INTO skills_fts(skills_fts) VALUES('rebuild')", []);
    
    // Phase 8.2: Tags tables
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT '#6366f1',
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS skill_tags (
            skill_id TEXT NOT NULL,
            tag_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            PRIMARY KEY (skill_id, tag_id),
            FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )",
    [],
)?;

    // Fix: if skill_tags has a 'tag' column (broken schema from old version), recreate it
    let has_bad_tag = conn
        .prepare("SELECT tag FROM skill_tags LIMIT 1")
        .is_ok();
    if has_bad_tag {
        conn.execute("DROP TABLE IF EXISTS skill_tags", [])?;
        conn.execute(
            "CREATE TABLE skill_tags (
                skill_id TEXT NOT NULL,
                tag_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                PRIMARY KEY (skill_id, tag_id),
                FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            )",
            [],
        )?;
    }

    // Ensure tag_id column exists in skill_tags (migration safety)
    let has_tag_id = conn
        .prepare("SELECT tag_id FROM skill_tags LIMIT 1")
        .is_ok();
    if !has_tag_id {
        conn.execute(
            "ALTER TABLE skill_tags ADD COLUMN tag_id INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    // Phase 8.3b: Categorization history table for conflict detection and audit
    conn.execute(
        "CREATE TABLE IF NOT EXISTS categorization_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            skill_id TEXT NOT NULL,
            category TEXT NOT NULL,
            model TEXT NOT NULL DEFAULT 'deepseek-chat',
            reason TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_categorization_history_skill_order
         ON categorization_history(skill_id, created_at DESC, id DESC)",
        [],
    )?;

    Ok(conn)
}

/// Rebuild the FTS5 full-text search index from the skills table.
pub fn rebuild_fts_index(conn: &Connection) -> SqlResult<()> {
    // Rebuild the FTS index from the external content table
    conn.execute("INSERT INTO skills_fts(skills_fts) VALUES('rebuild')", [])?;
    Ok(())
}

/// Clear all existing rows and insert a fresh set of skills (bulk insert).
pub fn replace_all_skills(conn: &Connection, skills: &[Skill]) -> SqlResult<()> {
    // 1. Collect IDs from the new scan
    let scanned_ids: HashSet<&str> = skills.iter().map(|s| s.id.as_str()).collect();

    // 2. Delete skills that are no longer on disk
    let existing_ids: Vec<String> = conn
        .prepare("SELECT id FROM skills")?
        .query_map([], |r| r.get(0))?
        .collect::<SqlResult<Vec<String>>>()?;

    let mut del_stmt = conn.prepare("DELETE FROM skills WHERE id = ?1")?;
    for id in &existing_ids {
        if !scanned_ids.contains(id.as_str()) {
            del_stmt.execute(params![id])?;
        }
    }

    // 3. Upsert -- preserve existing category when scan has none
    let mut stmt = conn.prepare(
        "INSERT INTO skills (id, name, description, category, risk, date_added, source_path, source, icon)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
           name        = excluded.name,
           description = excluded.description,
           category    = COALESCE(NULLIF(excluded.category, ''), skills.category),
           risk        = excluded.risk,
           date_added  = excluded.date_added,
           source_path = excluded.source_path,
           source      = excluded.source,
           icon        = excluded.icon",
    )?;

    for skill in skills {
        stmt.execute(params![
            skill.id,
            skill.name,
            skill.description,
            skill.category,
            skill.risk,
            skill.date_added,
            skill.source_path,
            skill.source,
            skill.icon,
        ])?;
    }

    // Phase 8: Rebuild FTS index after bulk replace
    rebuild_fts_index(conn)?;

    Ok(())
}

/// Return every skill from the database.
pub fn get_all_skills(conn: &Connection) -> SqlResult<Vec<Skill>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, category, risk, date_added, source_path, source, favorite, icon
         FROM skills ORDER BY name COLLATE NOCASE",
    )?;

    let skills = stmt
        .query_map([], row_to_skill)?
        .collect::<SqlResult<Vec<_>>>()?;

    Ok(skills)
}

/// Return a single skill by its id.
pub fn get_skill_by_id(conn: &Connection, id: &str) -> SqlResult<Option<Skill>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, category, risk, date_added, source_path, source, favorite, icon
         FROM skills WHERE id = ?1",
    )?;

    let mut rows = stmt.query_map(params![id], row_to_skill)?;
    match rows.next() {
        Some(result) => Ok(Some(result?)),
        None => Ok(None),
    }
}
 
 /// Read the SKILL.md file for a skill and return its body content (without YAML front-matter).
 pub fn get_skill_content(conn: &Connection, id: &str) -> SqlResult<Option<SkillContent>> {
     let skill = match get_skill_by_id(conn, id)? {
         Some(s) => s,
         None => return Ok(None),
     };
 
     let skill_path = std::path::Path::new(&skill.source_path);
     let md_path = skill_path.join("SKILL.md");
 
     let raw = match fs::read_to_string(&md_path) {
         Ok(c) => c,
         Err(_) => return Ok(Some(SkillContent {
             id: skill.id.clone(),
             name: skill.name.clone(),
             content: String::new(),
         })),
     };
 
     let trimmed = raw.trim_start();
 
     // Extract body after YAML front-matter if present
     let content = if trimmed.starts_with("---") {
         let after_opener = &trimmed[3..];
         if let Some(close_pos) = after_opener.find("\n---") {
             let body = &after_opener[close_pos + 5..]; // skip "\n---" and possible newline
             body.trim().to_string()
         } else {
             // Unclosed front-matter �?return the raw content as-is
             raw.trim().to_string()
         }
     } else {
         // No front-matter �?return the whole file
         raw.trim().to_string()
     };
 
     Ok(Some(SkillContent {
         id: skill.id,
         name: skill.name,
         content,
     }))
 }

/// Full-text search on name and description (LIKE-based).
pub fn search_skills(conn: &Connection, query: &str) -> SqlResult<Vec<Skill>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(
        "SELECT id, name, description, category, risk, date_added, source_path, source, favorite, icon
         FROM skills
         WHERE skills.rowid IN (SELECT rowid FROM skills_fts WHERE skills_fts MATCH ?1)
         ORDER BY name COLLATE NOCASE",
    )?;

    let skills = stmt
        .query_map(params![query], row_to_skill)?
        .collect::<SqlResult<Vec<_>>>()?;

    Ok(skills)
}

/// Return full-text search suggestions for auto-complete dropdown.
pub fn search_suggestions(conn: &Connection, query: &str, limit: i64) -> SqlResult<Vec<Skill>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(
        "SELECT id, name, description, category, risk, date_added, source_path, source, favorite, icon
         FROM skills
         WHERE skills.rowid IN (SELECT rowid FROM skills_fts WHERE skills_fts MATCH ?1)
         ORDER BY name COLLATE NOCASE
         LIMIT ?2",
    )?;
    let suggestions = stmt
        .query_map(params![query, limit], row_to_skill)?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(suggestions)
}

/// Return skills that have no category yet.
pub fn get_uncategorized_skills(conn: &Connection) -> SqlResult<Vec<Skill>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, category, risk, date_added, source_path, source, favorite, icon
         FROM skills
         WHERE category IS NULL OR category = ''
         ORDER BY name COLLATE NOCASE",
    )?;

    let skills = stmt
        .query_map([], row_to_skill)?
        .collect::<SqlResult<Vec<_>>>()?;

    Ok(skills)
}

/// Update the category field for a single skill.
/// Phase 8.3b: Transactional write -- INSERT categorization_history + UPDATE skills.category.
/// Must be used instead of separate update_skill_category calls to guarantee consistency.
pub fn apply_categorization_result(
    conn: &mut Connection,
    skill_id: &str,
    category: &str,
    model: &str,
    reason: Option<&str>,
) -> SqlResult<()> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO categorization_history (skill_id, category, model, reason) VALUES (?1, ?2, ?3, ?4)",
        params![skill_id, category, model, reason],
    )?;
    let updated = tx.execute(
        "UPDATE skills SET category = ?1 WHERE id = ?2",
        params![category, skill_id],
    )?;
    if updated != 1 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    tx.commit()?;
    Ok(())
}

/// Update editable fields of a single skill.
pub fn update_skill(conn: &Connection, req: &UpdateSkillRequest) -> SqlResult<()> {
    let mut sql = String::from("UPDATE skills SET");
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut fields = Vec::new();

    if let Some(ref name) = req.name {
        fields.push("name");
        params_vec.push(Box::new(name.clone()));
    }
    if let Some(ref description) = req.description {
        fields.push("description");
        params_vec.push(Box::new(description.clone()));
    }
    if let Some(ref category) = req.category {
        fields.push("category");
        params_vec.push(Box::new(category.clone()));
    }
    if let Some(ref risk) = req.risk {
        fields.push("risk");
        params_vec.push(Box::new(risk.clone()));
    }

    if fields.is_empty() {
        return Ok(()); // nothing to update
    }

    // Build the SET clause with numbered placeholders
    for (i, f) in fields.iter().enumerate() {
        let param_idx = params_vec.len() - fields.len() + i + 1;
        if i == 0 {
            sql.push_str(&format!(" {} = ?{}", f, param_idx));
        } else {
            sql.push_str(&format!(", {} = ?{}", f, param_idx));
        }
    }

    sql.push_str(&format!(" WHERE id = ?{}", params_vec.len() + 1));
    params_vec.push(Box::new(req.id.clone()));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params_vec.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, param_refs.as_slice())?;

    // Phase 8: Rebuild FTS index after update
    rebuild_fts_index(conn)?;

    Ok(())
}

/// Batch update category and/or risk for multiple skills.
pub fn batch_categorize(conn: &Connection, req: &BatchCategorizeRequest) -> SqlResult<()> {
    for skill_id in &req.skill_ids {
        if let Some(ref category) = req.category {
            conn.execute(
                "UPDATE skills SET category = ?1 WHERE id = ?2",
                params![category, skill_id],
            )?;
        }
        if let Some(ref risk) = req.risk {
            conn.execute(
                "UPDATE skills SET risk = ?1 WHERE id = ?2",
                params![risk, skill_id],
            )?;
        }
    }
    Ok(())
}

/// Export skills by ID list.
pub fn export_skills(conn: &Connection, skill_ids: &[String]) -> SqlResult<Vec<Skill>> {
    if skill_ids.is_empty() {
        return Ok(vec![]);
    }
    let placeholders: Vec<String> = skill_ids.iter().enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect();
    let sql = format!(
        "SELECT id, name, description, category, risk, date_added, source_path, source, favorite, icon
         FROM skills WHERE id IN ({}) ORDER BY name COLLATE NOCASE",
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        skill_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();

    let skills = stmt
        .query_map(param_refs.as_slice(), row_to_skill)?
        .collect::<SqlResult<Vec<_>>>()?;

    Ok(skills)
}

/// Export skills to a JSON string.
pub fn export_skills_to_json(conn: &Connection, skill_ids: &[String]) -> SqlResult<String> {
    let skills = export_skills(conn, skill_ids)?;
    let wrapper = SkillExportWrapper { skills };
    serde_json::to_string_pretty(&wrapper)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
}

/// Import skills from a JSON string. Returns (success_count, error_messages).
pub fn import_skills_from_json(conn: &Connection, json_str: &str) -> SqlResult<ImportResult> {
    let wrapper: SkillExportWrapper = match serde_json::from_str(json_str) {
        Ok(w) => w,
        Err(e) => {
            return Ok(ImportResult {
                success_count: 0,
                errors: vec![format!("Invalid JSON: {}", e)],
            });
        }
    };

    let mut success_count = 0usize;
    let mut errors = Vec::new();

    for skill in &wrapper.skills {
        let result = conn.execute(
            "INSERT OR REPLACE INTO skills (id, name, description, category, risk, date_added, source_path, source, favorite, icon)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
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
        );
        match result {
            Ok(_) => success_count += 1,
            Err(e) => errors.push(format!("Failed to import '{}': {}", skill.name, e)),
        }
    }

    // Phase 8: Rebuild FTS index after import
    let _ = rebuild_fts_index(conn);

    Ok(ImportResult {
        success_count,
        errors,
    })
}

/// Compute aggregate statistics.
pub fn get_stats(conn: &Connection) -> SqlResult<Stats> {
    let total_count = conn.query_row("SELECT COUNT(*) FROM skills", [], |r| r.get::<_, i64>(0))?;

    let categorized_count = conn.query_row(
        "SELECT COUNT(*) FROM skills WHERE category IS NOT NULL AND category != ''",
        [],
        |r| r.get::<_, i64>(0),
    )?;

    let uncategorized_count = total_count - categorized_count;

    // Per-category counts
    let mut cat_stmt = conn.prepare(
        "SELECT COALESCE(NULLIF(category, ''), '(uncategorized)') AS cat, COUNT(*) AS cnt
         FROM skills GROUP BY cat ORDER BY cnt DESC",
    )?;
    let category_counts: Vec<CategoryCount> = cat_stmt
        .query_map([], |r| {
            Ok(CategoryCount {
                category: r.get(0)?,
                count: r.get(1)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;

    // Per-risk counts
    let mut risk_stmt = conn.prepare(
        "SELECT COALESCE(NULLIF(risk, ''), '(unknown)') AS r, COUNT(*) AS cnt
         FROM skills GROUP BY r ORDER BY cnt DESC",
    )?;
    let risk_counts: Vec<RiskCount> = risk_stmt
        .query_map([], |r| {
            Ok(RiskCount {
                risk: r.get(0)?,
                count: r.get(1)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;

    Ok(Stats {
        total_count,
        categorized_count,
        uncategorized_count,
        category_counts,
        risk_counts,
    })
}

/// Query skills with dynamic filtering, sorting, and pagination.
/// Returns SkillPage with total_count using SQL window function.
pub fn query_skills(conn: &Connection, query: &SkillQuery) -> SqlResult<SkillPage> {
    let mut conditions: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            conditions.push(format!("skills.rowid IN (SELECT rowid FROM skills_fts WHERE skills_fts MATCH ?{})", idx));
            param_values.push(Box::new(trimmed.to_string()));
            idx += 1;
        }
    }

    if let Some(ref cat) = query.category {
        let trimmed = cat.trim();
        if !trimmed.is_empty() {
            conditions.push(format!("category = ?{}", idx));
            param_values.push(Box::new(trimmed.to_string()));
            idx += 1;
        }
    }

    if let Some(ref r) = query.risk {
        let trimmed = r.trim();
        if !trimmed.is_empty() {
            conditions.push(format!("risk = ?{}", idx));
            param_values.push(Box::new(trimmed.to_string()));
            idx += 1;
        }
    }

    if let Some(ref s) = query.source {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            conditions.push(format!("source = ?{}", idx));
            param_values.push(Box::new(trimmed.to_string()));
            idx += 1;
        }
    }

    if let Some(true) = query.favorite_only {
        conditions.push(format!("favorite = 1"));
    }
    
    if let Some(ref tag_ids) = query.tag_ids {
        if !tag_ids.is_empty() {
            let placeholders: Vec<String> = tag_ids.iter().enumerate()
                .map(|(i, _)| format!("?{}", idx + i))
                .collect();
            conditions.push(format!(
                "skills.id IN (SELECT skill_id FROM skill_tags WHERE tag_id IN ({}))",
                placeholders.join(",")
            ));
            for &tid in tag_ids {
                param_values.push(Box::new(tid));
            }
            idx += tag_ids.len();
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let order_column = match query.sort_field {
        Some(SortField::Name) => "name",
        Some(SortField::DateAdded) => "date_added",
        Some(SortField::Category) => "category",
        Some(SortField::Risk) => "risk",
        Some(SortField::Source) => "source",
        None => "name",
    };
    let order_direction = match query.sort_direction {
        Some(SortDirection::Asc) => "ASC",
        Some(SortDirection::Desc) => "DESC",
        None => "ASC",
    };

    let limit_val = query.limit.unwrap_or(50);
    let offset_val = query.offset.unwrap_or(0);

    let sql = format!(
        "SELECT COUNT(*) OVER() AS total_count, id, name, description, category, risk, date_added, source_path, source, favorite, icon
         FROM skills {}
         ORDER BY {} COLLATE NOCASE {}
         LIMIT ?{} OFFSET ?{}",
        where_clause, order_column, order_direction, idx, idx + 1
    );

    param_values.push(Box::new(limit_val));
    param_values.push(Box::new(offset_val));

    let mut stmt = conn.prepare(&sql)?;

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let mut rows = stmt.query(param_refs.as_slice())?;

    let mut skills = Vec::new();
    let mut total_count: i64 = 0;

    while let Some(row) = rows.next()? {
        if total_count == 0 {
            total_count = row.get::<_, i64>(0)?;
        }
        skills.push(Skill {
            id: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            category: row.get(4)?,
            risk: row.get(5)?,
            date_added: row.get(6)?,
            source_path: row.get(7)?,
            source: row.get(8)?,
            favorite: row.get::<_, Option<bool>>(9)?.or(Some(false)),
            icon: row.get::<_, Option<String>>(10)?,
        });
    }

    Ok(SkillPage {
        skills,
        total_count,
    })
}

/// Toggle the favorite status of a skill.
pub fn toggle_favorite(conn: &Connection, skill_id: &str, favorite: bool) -> SqlResult<()> {
    let fav_int: i32 = if favorite { 1 } else { 0 };
    conn.execute(
        "UPDATE skills SET favorite = ?1 WHERE id = ?2",
        params![fav_int, skill_id],
    )?;
    Ok(())
}

/// Return the total number of favorited skills.
pub fn get_favorites_count(conn: &Connection) -> SqlResult<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM skills WHERE favorite = 1",
        [],
        |r| r.get::<_, i64>(0),
    )
}

/// Return all distinct non-empty category values with their counts.
pub fn get_distinct_categories(conn: &Connection) -> SqlResult<Vec<FilterOptionWithCount>> {
    let mut stmt = conn.prepare(
        "SELECT category AS value, COUNT(*) AS cnt FROM skills
         WHERE category IS NOT NULL AND category != ''
         GROUP BY category
         ORDER BY category COLLATE NOCASE",
    )?;
    let items = stmt
        .query_map([], |r| {
            Ok(FilterOptionWithCount {
                value: r.get(0)?,
                count: r.get(1)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(items)
}

/// Return all distinct non-empty risk values with their counts.
pub fn get_distinct_risks(conn: &Connection) -> SqlResult<Vec<FilterOptionWithCount>> {
    let mut stmt = conn.prepare(
        "SELECT risk AS value, COUNT(*) AS cnt FROM skills
         WHERE risk IS NOT NULL AND risk != ''
         GROUP BY risk
         ORDER BY risk COLLATE NOCASE",
    )?;
    let items = stmt
        .query_map([], |r| {
            Ok(FilterOptionWithCount {
                value: r.get(0)?,
                count: r.get(1)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(items)
}

/// Return all distinct non-empty source values with their counts.
pub fn get_distinct_sources(conn: &Connection) -> SqlResult<Vec<FilterOptionWithCount>> {
    let mut stmt = conn.prepare(
        "SELECT source AS value, COUNT(*) AS cnt FROM skills
         WHERE source IS NOT NULL AND source != ''
         GROUP BY source
         ORDER BY source COLLATE NOCASE",
    )?;
    let items = stmt
        .query_map([], |r| {
            Ok(FilterOptionWithCount {
                value: r.get(0)?,
                count: r.get(1)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(items)
}

/// Convenience: return all three filter option lists at once.
pub fn get_filters(conn: &Connection) -> SqlResult<FilterOptions> {
    Ok(FilterOptions {
        categories: get_distinct_categories(conn)?,
        risks: get_distinct_risks(conn)?,
        sources: get_distinct_sources(conn)?,
    })
}

/// Helper: map a SQLite row to a Skill.
/// Row layout: id(0), name(1), description(2), category(3), risk(4), date_added(5), source_path(6), source(7), favorite(8), icon(9)
fn row_to_skill(row: &rusqlite::Row) -> SqlResult<Skill> {
    let favorite = row.get::<_, Option<bool>>(8).unwrap_or(None).or(Some(false));
    Ok(Skill {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        category: row.get(3)?,
        risk: row.get(4)?,
        date_added: row.get(5)?,
        source_path: row.get(6)?,
        source: row.get(7)?,
        favorite,
        icon: row.get::<_, Option<String>>(9)?,
    })
}

// -- Phase 8: Search history --
// -- Phase 8.2: Tags --
/// Create a new tag.
pub fn create_tag(conn: &Connection, name: &str, color: &str) -> SqlResult<Tag> {
    conn.execute("INSERT INTO tags (name, color) VALUES (?1, ?2)", params![name, color])?;
    let id = conn.last_insert_rowid();
    Ok(Tag {
        id,
        name: name.to_string(),
        color: color.to_string(),
        created_at: default_iso_time(),
        skill_count: None,
    })
}
/// Delete a tag and all its skill associations.
pub fn delete_tag(conn: &Connection, tag_id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM skill_tags WHERE tag_id = ?1", params![tag_id])?;
    conn.execute("DELETE FROM tags WHERE id = ?1", params![tag_id])?;
    Ok(())
}
/// Get all tags with their skill count.
pub fn get_all_tags(conn: &Connection) -> SqlResult<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, t.created_at,
                (SELECT COUNT(*) FROM skill_tags st WHERE st.tag_id = t.id) AS cnt
         FROM tags t
         ORDER BY cnt DESC, t.name COLLATE NOCASE"
    )?;
    let tags = stmt.query_map([], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            created_at: row.get(3)?,
            skill_count: row.get::<_, i64>(4).ok(),
        })
    })?.collect::<SqlResult<Vec<_>>>()?;
    Ok(tags)
}
/// Assign a tag to a skill.
pub fn assign_tag(conn: &Connection, skill_id: &str, tag_id: i64) -> SqlResult<()> {
    conn.execute("INSERT INTO skill_tags (skill_id, tag_id) VALUES (?1, ?2)", params![skill_id, tag_id])?;
    Ok(())
}
/// Remove a tag from a skill.
pub fn remove_tag(conn: &Connection, skill_id: &str, tag_id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM skill_tags WHERE skill_id = ?1 AND tag_id = ?2", params![skill_id, tag_id])?;
    Ok(())
}
/// Get all tags for a specific skill.
pub fn get_skill_tags(conn: &Connection, skill_id: &str) -> SqlResult<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, created_at, NULL AS cnt
         FROM tags
         WHERE id IN (SELECT tag_id FROM skill_tags WHERE skill_id = ?1)
         ORDER BY name COLLATE NOCASE"
    )?;
    let tags = stmt.query_map(params![skill_id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            created_at: row.get(3)?,
            skill_count: None,
        })
    })?.collect::<SqlResult<Vec<_>>>()?;
    Ok(tags)
}
/// Return the current local time in ISO format for tag created_at.
fn default_iso_time() -> String {
    // The SQL DEFAULT in the tags table sets created_at, so this is fine
    String::new()
}

/// Record a search query in history. Trims old entries when exceeding 50.
pub fn add_search_history(conn: &Connection, query: &str) -> SqlResult<()> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO search_history (query) VALUES (?1)",
        params![trimmed],
    )?;
    // Keep at most 50 entries
    conn.execute(
        "DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history ORDER BY id DESC LIMIT 50)",
        [],
    )?;
    Ok(())
}

/// Return recent search history entries (most recent first).
pub fn get_search_history(conn: &Connection, limit: i64) -> SqlResult<Vec<SearchHistoryItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, query, created_at FROM search_history ORDER BY id DESC LIMIT ?1",
    )?;
    let items = stmt
        .query_map(params![limit], |row| {
            Ok(SearchHistoryItem {
                id: row.get(0)?,
                query: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(items)
}

/// Clear all search history.
pub fn clear_search_history(conn: &Connection) -> SqlResult<()> {
    conn.execute("DELETE FROM search_history", [])?;
    Ok(())
}

// -- Phase 8: Recent views --

/// Record or update a recent view for a skill. Trims old entries when exceeding 30.
pub fn add_recent_view(conn: &Connection, skill_id: &str) -> SqlResult<()> {
    // Upsert: if this skill_id already exists, update viewed_at; otherwise insert
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM recent_views WHERE skill_id = ?1",
            params![skill_id],
            |row| row.get(0),
        )
        .ok();
    if let Some(view_id) = existing {
        conn.execute(
            "UPDATE recent_views SET viewed_at = datetime('now','localtime') WHERE id = ?1",
            params![view_id],
        )?;
    } else {
        conn.execute(
            "INSERT INTO recent_views (skill_id) VALUES (?1)",
            params![skill_id],
        )?;
    }
    // Keep at most 30 entries
    conn.execute(
        "DELETE FROM recent_views WHERE id NOT IN (SELECT id FROM recent_views ORDER BY id DESC LIMIT 30)",
        [],
    )?;
    Ok(())
}

/// Return recent views joined with skill data (most recent first).
pub fn get_recent_views(conn: &Connection, limit: i64) -> SqlResult<Vec<Skill>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.description, s.category, s.risk, s.date_added,
                s.source_path, s.source, s.favorite, s.icon
         FROM recent_views rv
         JOIN skills s ON s.id = rv.skill_id
         ORDER BY rv.viewed_at DESC
         LIMIT ?1",
    )?;
    let skills = stmt
        .query_map(params![limit], row_to_skill)?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(skills)
}

// -- Phase 8.3b: Categorization conflict detection and resolution --

const CONFLICT_QUERY: &str = "WITH ranked AS (
            SELECT *,
                   ROW_NUMBER() OVER (PARTITION BY skill_id ORDER BY created_at DESC, id DESC) AS rn
            FROM categorization_history
            WHERE model = 'deepseek-chat'
        ), conflicts AS (
        SELECT s.id AS skill_id,
               s.name AS skill_name,
               prev.category AS old_category,
               prev.reason AS old_reason,
               latest.category AS new_category,
               latest.reason AS new_reason,
               latest.created_at AS categorized_at
        FROM skills s
        JOIN ranked latest ON s.id = latest.skill_id AND latest.rn = 1
        JOIN ranked prev  ON s.id = prev.skill_id  AND prev.rn = 2
        WHERE latest.category != prev.category
          AND s.category = latest.category
          AND NOT EXISTS (
              SELECT 1
              FROM categorization_history newer
              WHERE newer.skill_id = latest.skill_id
                AND (
                    newer.created_at > latest.created_at
                    OR (newer.created_at = latest.created_at AND newer.id > latest.id)
                )
          )
        )";

pub fn get_categorization_conflicts(conn: &Connection) -> SqlResult<Vec<crate::models::ConflictItem>> {
    let sql = format!("{CONFLICT_QUERY} SELECT * FROM conflicts ORDER BY categorized_at DESC, skill_name COLLATE NOCASE");
    let mut stmt = conn.prepare(&sql)?;
    let items = stmt
        .query_map([], |row| {
            Ok(crate::models::ConflictItem {
                skill_id: row.get(0)?,
                skill_name: row.get(1)?,
                old_category: row.get(2)?,
                old_reason: row.get(3)?,
                new_category: row.get(4)?,
                new_reason: row.get(5)?,
                categorized_at: row.get(6)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(items)
}

pub fn get_conflict_count(conn: &Connection) -> SqlResult<i64> {
    let sql = format!("{CONFLICT_QUERY} SELECT COUNT(*) FROM conflicts");
    conn.query_row(&sql, [], |r| r.get(0))
}

pub fn resolve_conflicts(
    conn: &mut Connection,
    req: &crate::models::ResolveConflictsRequest,
) -> SqlResult<()> {
    for (skill_id, category) in &req.resolutions {
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO categorization_history (skill_id, category, model) VALUES (?1, ?2, 'manual')",
            params![skill_id, category],
        )?;
        let updated = tx.execute(
            "UPDATE skills SET category = ?1 WHERE id = ?2",
            params![category, skill_id],
        )?;
        if updated != 1 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        tx.commit()?;
    }
    Ok(())
}

pub fn get_categorization_history(
    conn: &Connection,
    skill_id: &str,
) -> SqlResult<Vec<crate::models::CategorizationEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, skill_id, category, model, reason, created_at
         FROM categorization_history
         WHERE skill_id = ?1
         ORDER BY created_at DESC, id DESC"
    )?;
    let entries = stmt
        .query_map(params![skill_id], |row| {
            Ok(crate::models::CategorizationEntry {
                id: row.get(0)?,
                skill_id: row.get(1)?,
                category: row.get(2)?,
                model: row.get(3)?,
                reason: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Skill;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE skills (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                category    TEXT,
                risk        TEXT,
                date_added  TEXT,
                source_path TEXT NOT NULL,
                source      TEXT NOT NULL DEFAULT 'agentic-awesome',
                favorite    INTEGER NOT NULL DEFAULT 0,
                icon        TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
            CREATE INDEX IF NOT EXISTS idx_skills_risk     ON skills(risk);
            CREATE INDEX IF NOT EXISTS idx_skills_source   ON skills(source);
            CREATE INDEX IF NOT EXISTS idx_skills_name     ON skills(name);
        CREATE INDEX IF NOT EXISTS idx_skills_favorite ON skills(favorite);
            CREATE INDEX IF NOT EXISTS idx_skills_date_added ON skills(date_added);",
        )
        .unwrap();
        conn.execute_batch(
            "CREATE TABLE categorization_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                skill_id TEXT NOT NULL,
                category TEXT NOT NULL,
                model TEXT NOT NULL DEFAULT 'deepseek-chat',
                reason TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
            );
            CREATE INDEX idx_categorization_history_skill_order
            ON categorization_history(skill_id, created_at DESC, id DESC);",
        )
        .unwrap();
        // FTS5 virtual table for test (data populated by replace_all_skills/>rebuild_fts_index)
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
               name, description, category,
               content='skills', content_rowid='rowid',
               tokenize='unicode61'
             );"
        )
        .unwrap();
        conn
    }

    fn make_skill(id: &str, name: &str, category: Option<&str>, source: &str) -> Skill {
        Skill {
            id: id.into(),
            name: name.into(),
            description: "".into(),
            category: category.map(|s| s.into()),
            risk: None,
            date_added: None,
            source_path: format!("/tmp/{}", id),
            source: source.into(),
            favorite: Some(false),
            icon: None,
        }
    }

    #[test]
    fn test_insert_and_get() {
        let conn = setup_db();
        let skills = vec![Skill {
            id: "test-1".into(),
            name: "Test One".into(),
            description: "First skill".into(),
            category: Some("dev".into()),
            risk: Some("low".into()),
            date_added: Some("2025-01-01".into()),
            source_path: "/tmp/test-1".into(),
            source: "agentic-awesome".into(),
            favorite: Some(false),
            icon: Some("\u{1f3a8}".into()),
        }];

        replace_all_skills(&conn, &skills).unwrap();

        let all = get_all_skills(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "Test One");
        assert_eq!(all[0].favorite, Some(false));
        assert_eq!(all[0].icon, Some("\u{1f3a8}".into()));
    }

    #[test]
    fn test_search() {
        let conn = setup_db();
        let skills = vec![
            make_skill("alpha", "Alpha Skill", None, "test"),
            make_skill("beta", "Beta Tool", None, "test"),
        ];
        replace_all_skills(&conn, &skills).unwrap();

        let results = search_skills(&conn, "alpha").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "alpha");
    }

    #[test]
    fn test_get_by_id() {
        let conn = setup_db();
        let skills = vec![make_skill("unique-id", "Unique", None, "test")];
        replace_all_skills(&conn, &skills).unwrap();

        let found = get_skill_by_id(&conn, "unique-id").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "Unique");

        let missing = get_skill_by_id(&conn, "nope").unwrap();
        assert!(missing.is_none());
    }

    #[test]
    fn test_stats() {
        let conn = setup_db();
        let skills = vec![
            Skill {
                id: "a".into(), name: "A".into(), description: "".into(),
                category: Some("dev".into()), risk: Some("low".into()),
                date_added: None, source_path: "/tmp/a".into(), source: "test".into(),
                favorite: Some(false), icon: None,
            },
            Skill {
                id: "b".into(), name: "B".into(), description: "".into(),
                category: Some("dev".into()), risk: Some("high".into()),
                date_added: None, source_path: "/tmp/b".into(), source: "test".into(),
                favorite: Some(false), icon: None,
            },
            Skill {
                id: "c".into(), name: "C".into(), description: "".into(),
                category: None, risk: None,
                date_added: None, source_path: "/tmp/c".into(), source: "test".into(),
                favorite: Some(false), icon: None,
            },
        ];
        replace_all_skills(&conn, &skills).unwrap();

        let stats = get_stats(&conn).unwrap();
        assert_eq!(stats.total_count, 3);
        assert_eq!(stats.categorized_count, 2);
        assert_eq!(stats.uncategorized_count, 1);
    }

    #[test]
    fn test_toggle_favorite() {
        let conn = setup_db();
        let skills = vec![Skill {
            id: "fav-test".into(), name: "Favorite Test".into(), description: "".into(),
            category: None, risk: None, date_added: None,
            source_path: "/tmp/fav-test".into(), source: "test".into(),
            favorite: Some(false), icon: None,
        }];
        replace_all_skills(&conn, &skills).unwrap();

        toggle_favorite(&conn, "fav-test", true).unwrap();
        let skill = get_skill_by_id(&conn, "fav-test").unwrap().unwrap();
        assert_eq!(skill.favorite, Some(true));

        toggle_favorite(&conn, "fav-test", false).unwrap();
        let skill = get_skill_by_id(&conn, "fav-test").unwrap().unwrap();
        assert_eq!(skill.favorite, Some(false));
    }

    #[test]
    fn test_update_skill() {
        let conn = setup_db();
        let skills = vec![Skill {
            id: "edit".into(), name: "Original".into(), description: "Original desc".into(),
            category: Some("dev".into()), risk: Some("low".into()), date_added: None,
            source_path: "/tmp/edit".into(), source: "test".into(),
            favorite: Some(false), icon: None,
        }];
        replace_all_skills(&conn, &skills).unwrap();

        // Update name and category
        let req = UpdateSkillRequest {
            id: "edit".into(),
            name: Some("Updated".into()),
            description: None,
            category: Some("security".into()),
            risk: Some("high".into()),
        };
        update_skill(&conn, &req).unwrap();

        let skill = get_skill_by_id(&conn, "edit").unwrap().unwrap();
        assert_eq!(skill.name, "Updated");
        assert_eq!(skill.category.unwrap(), "security");
        assert_eq!(skill.risk.unwrap(), "high");
        assert_eq!(skill.description, "Original desc"); // unchanged
    }

    #[test]
    fn test_batch_categorize() {
        let conn = setup_db();
        let skills = vec![
            make_skill("a", "Alpha", None, "test"),
            make_skill("b", "Beta", None, "test"),
            make_skill("c", "Gamma", None, "test"),
        ];
        replace_all_skills(&conn, &skills).unwrap();

        let req = BatchCategorizeRequest {
            skill_ids: vec!["a".into(), "b".into()],
            category: Some("devops".into()),
            risk: Some("medium".into()),
        };
        batch_categorize(&conn, &req).unwrap();

        let a = get_skill_by_id(&conn, "a").unwrap().unwrap();
        let b = get_skill_by_id(&conn, "b").unwrap().unwrap();
        let c = get_skill_by_id(&conn, "c").unwrap().unwrap();

        assert_eq!(a.category.unwrap(), "devops");
        assert_eq!(b.category.unwrap(), "devops");
        // c should not be changed
        assert!(c.category.is_none());
    }

    #[test]
    fn test_export_skills() {
        let conn = setup_db();
        let skills = vec![
            make_skill("a", "Alpha", Some("dev"), "test"),
            make_skill("b", "Beta", Some("sec"), "test"),
        ];
        replace_all_skills(&conn, &skills).unwrap();

        let json = export_skills_to_json(&conn, &[]).unwrap();
        let imported = import_skills_from_json(&conn, &json).unwrap();
        assert_eq!(imported.success_count, 0); // empty list

        let json = export_skills_to_json(&conn, &["a".into(), "b".into()]).unwrap();
        assert!(json.contains("Alpha"));
        assert!(json.contains("Beta"));
    }

    #[test]
    fn test_import_skills() {
        let conn = setup_db();
        let json = r#"{"skills":[{"id":"imported","name":"Imported","description":"Test","category":"tools","risk":null,"date_added":null,"source_path":"/tmp/imported","source":"test","favorite":false,"icon":null}]}"#;
        let result = import_skills_from_json(&conn, json).unwrap();
        assert_eq!(result.success_count, 1);
        assert!(result.errors.is_empty());

        let skill = get_skill_by_id(&conn, "imported").unwrap().unwrap();
        assert_eq!(skill.name, "Imported");
        assert_eq!(skill.category.unwrap(), "tools");
    }

    #[test]
    fn test_import_invalid_json() {
        let conn = setup_db();
        let result = import_skills_from_json(&conn, "not json").unwrap();
        assert_eq!(result.success_count, 0);
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_query_skills_with_favorite_only() {
        let conn = setup_db();
        let skills = vec![
            make_skill("a", "Alpha", None, "test"),
            make_skill("b", "Beta", None, "test"),
            make_skill("c", "Gamma", None, "test"),
        ];
        replace_all_skills(&conn, &skills).unwrap();

        toggle_favorite(&conn, "a", true).unwrap();
        toggle_favorite(&conn, "c", true).unwrap();

        let result = query_skills(&conn, &SkillQuery {
            search: None,
            category: None,
            risk: None,
            source: None,
            sort_field: None,
            sort_direction: None,
            offset: Some(0),
            limit: Some(50),
            favorite_only: Some(true),
            tag_ids: None,
        }).unwrap();

        assert_eq!(result.total_count, 2);
        assert_eq!(result.skills.len(), 2);
        assert!(result.skills.iter().all(|s| s.favorite == Some(true)));
    }

    #[test]
    fn test_get_favorites_count() {
        let conn = setup_db();
        let skills = vec![
            make_skill("a", "Alpha", None, "test"),
            make_skill("b", "Beta", None, "test"),
        ];
        replace_all_skills(&conn, &skills).unwrap();

        assert_eq!(get_favorites_count(&conn).unwrap(), 0);
        toggle_favorite(&conn, "a", true).unwrap();
        assert_eq!(get_favorites_count(&conn).unwrap(), 1);
    }

    #[test]
    fn test_filter_options_with_counts() {
        let conn = setup_db();
        let skills = vec![
            make_skill("a", "A", Some("dev"), "src1"),
            make_skill("b", "B", Some("dev"), "src1"),
            make_skill("c", "C", Some("test"), "src2"),
        ];
        replace_all_skills(&conn, &skills).unwrap();

        let cats = get_distinct_categories(&conn).unwrap();
        assert_eq!(cats.len(), 2);
        assert_eq!(cats.iter().find(|c| c.value == "dev").unwrap().count, 2);
    }

    #[test]
    fn test_categorization_conflict_lifecycle() {
        let mut conn = setup_db();
        replace_all_skills(&conn, &[make_skill("a", "Alpha", None, "test")]).unwrap();

        assert_eq!(get_conflict_count(&conn).unwrap(), 0);
        apply_categorization_result(&mut conn, "a", "development", "deepseek-chat", Some("Builds software")).unwrap();
        apply_categorization_result(&mut conn, "a", "ai", "deepseek-chat", Some("Uses models")).unwrap();

        let conflicts = get_categorization_conflicts(&conn).unwrap();
        assert_eq!(get_conflict_count(&conn).unwrap(), conflicts.len() as i64);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].old_category, "development");
        assert_eq!(conflicts[0].new_category, "ai");
        assert_eq!(conflicts[0].new_reason.as_deref(), Some("Uses models"));

        let request = crate::models::ResolveConflictsRequest {
            resolutions: [("a".to_string(), "development".to_string())].into(),
        };
        resolve_conflicts(&mut conn, &request).unwrap();

        assert_eq!(get_conflict_count(&conn).unwrap(), 0);
        assert_eq!(get_skill_by_id(&conn, "a").unwrap().unwrap().category.as_deref(), Some("development"));
        let history = get_categorization_history(&conn, "a").unwrap();
        assert_eq!(history.len(), 3);
        assert_eq!(history[0].model, "manual");
    }

    #[test]
    fn test_keep_new_resolves_single_and_batch_conflicts() {
        let mut conn = setup_db();
        replace_all_skills(
            &conn,
            &[
                make_skill("a", "Alpha", None, "test"),
                make_skill("b", "Beta", None, "test"),
            ],
        )
        .unwrap();

        for skill_id in ["a", "b"] {
            apply_categorization_result(&mut conn, skill_id, "old", "deepseek-chat", Some("Old reason")).unwrap();
            apply_categorization_result(&mut conn, skill_id, "new", "deepseek-chat", Some("New reason")).unwrap();
        }
        assert_eq!(get_conflict_count(&conn).unwrap(), 2);

        let request = crate::models::ResolveConflictsRequest {
            resolutions: [
                ("a".to_string(), "new".to_string()),
                ("b".to_string(), "new".to_string()),
            ]
            .into(),
        };
        resolve_conflicts(&mut conn, &request).unwrap();

        assert_eq!(get_conflict_count(&conn).unwrap(), 0);
        assert!(get_categorization_conflicts(&conn).unwrap().is_empty());
        for skill_id in ["a", "b"] {
            let history = get_categorization_history(&conn, skill_id).unwrap();
            assert_eq!(history[0].model, "manual");
            assert_eq!(history[0].category, "new");
        }
    }

    #[test]
    fn test_categorization_write_rolls_back_when_skill_is_missing() {
        let mut conn = setup_db();

        assert!(apply_categorization_result(
            &mut conn,
            "missing",
            "ai",
            "deepseek-chat",
            None,
        )
        .is_err());

        let history_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM categorization_history", [], |row| row.get(0))
            .unwrap();
        assert_eq!(history_count, 0);
        assert!(conn.is_autocommit());
    }

    #[test]
    fn test_conflict_queries_handle_empty_history() {
        let conn = setup_db();
        assert!(get_categorization_conflicts(&conn).unwrap().is_empty());
        assert_eq!(get_conflict_count(&conn).unwrap(), 0);
    }

    #[test]
    fn test_conflict_query_performance_with_5000_skills() {
        let mut conn = setup_db();
        let tx = conn.transaction().unwrap();
        for index in 0..5_000 {
            let id = format!("skill-{index}");
            tx.execute(
                "INSERT INTO skills (id, name, source_path) VALUES (?1, ?2, ?3)",
                params![id, format!("Skill {index}"), format!("/tmp/skill-{index}")],
            )
            .unwrap();
            tx.execute(
                "INSERT INTO categorization_history (skill_id, category, model) VALUES (?1, 'old', 'deepseek-chat')",
                params![id],
            )
            .unwrap();
            tx.execute(
                "INSERT INTO categorization_history (skill_id, category, model) VALUES (?1, 'new', 'deepseek-chat')",
                params![id],
            )
            .unwrap();
            tx.execute("UPDATE skills SET category = 'new' WHERE id = ?1", params![id])
                .unwrap();
        }
        tx.commit().unwrap();

        let count_started = std::time::Instant::now();
        assert_eq!(get_conflict_count(&conn).unwrap(), 5_000);
        assert!(count_started.elapsed().as_millis() < 50);

        let list_started = std::time::Instant::now();
        assert_eq!(get_categorization_conflicts(&conn).unwrap().len(), 5_000);
        assert!(list_started.elapsed().as_millis() < 500);

        let history_started = std::time::Instant::now();
        assert_eq!(get_categorization_history(&conn, "skill-4999").unwrap().len(), 2);
        assert!(history_started.elapsed().as_millis() < 100);
    }
}








/// Build shared WHERE clause and parameters from a SkillQuery.
/// Returns (where_clause, param_values, next_param_index).
/// The where_clause is empty string if no conditions, otherwise "WHERE cond1 AND cond2 ...".
pub(crate) fn build_filter_conditions(query: &SkillQuery) -> (String, Vec<Box<dyn rusqlite::types::ToSql>>, usize) {
    let mut conditions: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx: usize = 1;

    if let Some(ref search) = query.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            conditions.push(format!("skills.rowid IN (SELECT rowid FROM skills_fts WHERE skills_fts MATCH ?{})", idx));
            param_values.push(Box::new(trimmed.to_string()));
            idx += 1;
        }
    }

    if let Some(ref cat) = query.category {
        let trimmed = cat.trim();
        if !trimmed.is_empty() {
            conditions.push(format!("category = ?{}", idx));
            param_values.push(Box::new(trimmed.to_string()));
            idx += 1;
        }
    }

    if let Some(ref r) = query.risk {
        let trimmed = r.trim();
        if !trimmed.is_empty() {
            conditions.push(format!("risk = ?{}", idx));
            param_values.push(Box::new(trimmed.to_string()));
            idx += 1;
        }
    }

    if let Some(ref s) = query.source {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            conditions.push(format!("source = ?{}", idx));
            param_values.push(Box::new(trimmed.to_string()));
            idx += 1;
        }
    }

    if let Some(true) = query.favorite_only {
        conditions.push("favorite = 1".to_string());
    }

    if let Some(ref tag_ids) = query.tag_ids {
        if !tag_ids.is_empty() {
            let placeholders: Vec<String> = tag_ids.iter().enumerate()
                .map(|(i, _)| format!("?{}", idx + i))
                .collect();
            conditions.push(format!(
                "skills.id IN (SELECT skill_id FROM skill_tags WHERE tag_id IN ({}))",
                placeholders.join(",")
            ));
            for &tid in tag_ids {
                param_values.push(Box::new(tid));
            }
            idx += tag_ids.len();
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    (where_clause, param_values, idx)
}

/// Get all matching skill IDs for a query (no pagination).
pub fn get_skill_ids_by_query(conn: &Connection, query: &SkillQuery) -> SqlResult<Vec<String>> {
    let (where_clause, param_values, _idx) = build_filter_conditions(query);

    let sql = format!(
        "SELECT id FROM skills {} ORDER BY name COLLATE NOCASE",
        where_clause
    );

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let ids = stmt.query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))?
        .collect::<SqlResult<Vec<_>>>()?;

    Ok(ids)
}

/// Batch-get tags for multiple skills. Returns skill_id -> Vec<tag_name>.
pub fn get_tags_for_skills(conn: &Connection, skill_ids: &[String]) -> SqlResult<std::collections::HashMap<String, Vec<String>>> {
    use std::collections::HashMap;

    if skill_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders: Vec<String> = skill_ids.iter().enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect();

    let sql = format!(
        "SELECT st.skill_id, t.name FROM skill_tags st
         JOIN tags t ON t.id = st.tag_id
         WHERE st.skill_id IN ({})
         ORDER BY t.name COLLATE NOCASE",
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        skill_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for pair in rows {
        let (skill_id, tag_name) = pair?;
        map.entry(skill_id).or_default().push(tag_name);
    }

    Ok(map)
}
