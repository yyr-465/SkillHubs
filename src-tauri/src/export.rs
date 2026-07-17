
use crate::db;
use crate::models::{ExportCsvRequest, ExportReportRequest, SkillExportRow, Skill};
use rusqlite::Connection;
use std::collections::HashMap;

// CSV column order constant: maps column key → CSV header label
const CSV_COLUMNS: &[(&str, &str)] = &[
    ("name", "Name"),
    ("description", "Description"),
    ("category", "Category"),
    ("risk", "Risk"),
    ("tags", "Tags"),
    ("source", "Source"),
    ("date_added", "Date Added"),
    ("id", "ID"),
    ("favorite", "Favorite"),
    ("icon", "Icon"),
    ("source_path", "Source Path"),
];

const DEFAULT_COLUMNS: &[&str] = &[
    "name", "description", "category", "risk", "tags", "source", "date_added",
];

/// Build SkillExportRow from Skill + tags map.
fn build_export_rows(skills: Vec<Skill>, tags_map: &HashMap<String, Vec<String>>) -> Vec<SkillExportRow> {
    skills.into_iter().map(|s| {
        let tags = tags_map.get(&s.id).cloned().unwrap_or_default().join(", ");
        SkillExportRow {
            id: s.id,
            name: s.name,
            description: s.description,
            category: s.category,
            risk: s.risk,
            date_added: s.date_added,
            source_path: s.source_path,
            source: s.source,
            favorite: s.favorite,
            icon: s.icon,
            tags,
        }
    }).collect()
}

/// Get cell value for a given column key.
fn cell_value(row: &SkillExportRow, col_key: &str) -> String {
    match col_key {
        "id" => row.id.clone(),
        "name" => row.name.clone(),
        "description" => row.description.clone(),
        "category" => row.category.clone().unwrap_or_default(),
        "risk" => row.risk.clone().unwrap_or_default(),
        "date_added" => row.date_added.clone().unwrap_or_default(),
        "source_path" => row.source_path.clone(),
        "source" => row.source.clone(),
        "favorite" => if row.favorite.unwrap_or(false) { "\u{2605}".to_string() } else { String::new() },
        "icon" => row.icon.clone().unwrap_or_default(),
        "tags" => row.tags.clone(),
        _ => String::new(),
    }
}

/// Generate CSV string from skill data with BOM prefix for Excel compatibility.
pub fn export_csv_string(
    conn: &Connection,
    req: &ExportCsvRequest,
) -> Result<String, String> {
    let skills = db::export_skills(conn, &req.skill_ids)
        .map_err(|e| format!("Failed to load skills: {}", e))?;

    let tags_map = db::get_tags_for_skills(conn, &req.skill_ids)
        .map_err(|e| format!("Failed to load tags: {}", e))?;

    let rows = build_export_rows(skills, &tags_map);

    // Determine which columns to export
    let columns: Vec<&str> = if req.columns.is_empty() {
        DEFAULT_COLUMNS.to_vec()
    } else {
        req.columns.iter().map(|c| c.as_str()).collect()
    };

    let mut wtr = csv::Writer::from_writer(vec![]);

    // Write header
    let header_labels: Vec<&str> = columns.iter().map(|col_key| {
        CSV_COLUMNS.iter()
            .find(|(k, _)| k == col_key)
            .map(|(_, label)| *label)
            .unwrap_or(col_key)
    }).collect();
    wtr.write_record(&header_labels)
        .map_err(|e| format!("CSV write error: {}", e))?;

    // Write data rows
    for row in &rows {
        let record: Vec<String> = columns.iter()
            .map(|col_key| cell_value(row, col_key))
            .collect();
        wtr.write_record(&record)
            .map_err(|e| format!("CSV write error: {}", e))?;
    }

    wtr.flush().map_err(|e| format!("CSV flush error: {}", e))?;

    let data = wtr.into_inner()
        .map_err(|e| format!("CSV finalize error: {}", e))?;

    // Prepend UTF-8 BOM for Excel Chinese compatibility
    let bom = "\u{FEFF}";
    let csv_str = String::from_utf8(data)
        .map_err(|e| format!("CSV encoding error: {}", e))?;

    Ok(format!("{}{}", bom, csv_str))
}

// -- Markdown Report Generation --

fn escape_md(s: &str) -> String {
    s.replace('|', "\\|")
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.chars().count() > max_len {
        format!("{}...", s.chars().take(max_len).collect::<String>())
    } else {
        s.to_string()
    }
}

fn parse_ym(date_str: &str) -> Option<(i32, u32)> {
    let s = date_str.trim();
    if s.len() >= 7 {
        let year: i32 = s[0..4].parse().ok()?;
        let month: u32 = s[5..7].parse().ok()?;
        if year >= 2000 && month >= 1 && month <= 12 {
            return Some((year, month));
        }
    }
    None
}

pub fn export_report_string(
    conn: &Connection,
    req: &ExportReportRequest,
) -> Result<String, String> {
    let skills = db::export_skills(conn, &req.skill_ids)
        .map_err(|e| format!("Failed to load skills: {}", e))?;

    let tags_map = db::get_tags_for_skills(conn, &req.skill_ids)
        .map_err(|e| format!("Failed to load tags: {}", e))?;

    let rows = build_export_rows(skills, &tags_map);
    let now = format_timestamp(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs());

    let mut out = String::new();
    out.push_str("# SkillHub Export Report\n\n");
    out.push_str(&format!("**Generated:** {}\n\n", now));
    out.push_str(&format!("**Total skills in report:** {}\n\n", rows.len()));
    out.push_str("---\n\n");

    // 1. Basic Stats
    let total = rows.len();
    let categorized = rows.iter().filter(|r| r.category.as_deref().map_or(false, |c| !c.is_empty())).count();
    let uncategorized = total - categorized;
    let favorites = rows.iter().filter(|r| r.favorite.unwrap_or(false)).count();
    let total_tags: usize = tags_map.values().map(|v| v.len()).sum();

    out.push_str("## 1. Basic Statistics\n\n");
    out.push_str("| Metric | Value |\n|--------|-------|\n");
    out.push_str(&format!("| Total skills | {} |\n", total));
    out.push_str(&format!("| Categorized | {} |\n", categorized));
    out.push_str(&format!("| Uncategorized | {} |\n", uncategorized));
    out.push_str(&format!("| Total tags | {} |\n", total_tags));
    out.push_str(&format!("| Favorited | {} |\n\n", favorites));

    // 2. Health Check
    let no_category = rows.iter().filter(|r| r.category.as_deref().map_or(true, |c| c.is_empty())).count();
    let no_description = rows.iter().filter(|r| r.description.is_empty()).count();
    let no_tags = rows.iter().filter(|r| r.tags.is_empty()).count();
    let no_risk = rows.iter().filter(|r| r.risk.as_deref().map_or(true, |c| c.is_empty())).count();

    out.push_str("## 2. Skill Health\n\n");
    out.push_str("| Check | Count |\n|-------|-------|\n");
    out.push_str(&format!("| No category | {} |\n", no_category));
    out.push_str(&format!("| No description | {} |\n", no_description));
    out.push_str(&format!("| No tags | {} |\n", no_tags));
    out.push_str(&format!("| No risk rating | {} |\n\n", no_risk));

    // 3. By Category
    out.push_str("## 3. Breakdown by Category\n\n");
    let mut cat_counts: HashMap<String, usize> = HashMap::new();
    for r in &rows {
        let key = r.category.as_deref().filter(|c| !c.is_empty()).unwrap_or("(uncategorized)").to_string();
        *cat_counts.entry(key).or_default() += 1;
    }
    let mut cat_sorted: Vec<(String, usize)> = cat_counts.into_iter().collect();
    cat_sorted.sort_by(|a, b| b.1.cmp(&a.1));
    out.push_str("| Category | Count |\n|----------|-------|\n");
    for (cat, cnt) in &cat_sorted {
        out.push_str(&format!("| {} | {} |\n", escape_md(cat), cnt));
    }
    out.push_str("\n");

    // 4. By Risk
    out.push_str("## 4. Breakdown by Risk\n\n");
    let mut risk_counts: HashMap<String, usize> = HashMap::new();
    for r in &rows {
        let key = r.risk.as_deref().filter(|c| !c.is_empty()).unwrap_or("(unknown)").to_string();
        *risk_counts.entry(key).or_default() += 1;
    }
    let mut risk_sorted: Vec<(String, usize)> = risk_counts.into_iter().collect();
    risk_sorted.sort_by(|a, b| b.1.cmp(&a.1));
    out.push_str("| Risk | Count |\n|------|-------|\n");
    for (risk, cnt) in &risk_sorted {
        out.push_str(&format!("| {} | {} |\n", escape_md(risk), cnt));
    }
    out.push_str("\n");

    // 5. Top Tags (top 30)
    out.push_str("## 5. Top Tags\n\n");
    let mut tag_counts: HashMap<String, usize> = HashMap::new();
    for tags in tags_map.values() {
        for tag in tags {
            *tag_counts.entry(tag.clone()).or_default() += 1;
        }
    }
    let mut tag_sorted: Vec<(String, usize)> = tag_counts.into_iter().collect();
    tag_sorted.sort_by(|a, b| b.1.cmp(&a.1));
    let top_tags = if tag_sorted.len() > 30 { &tag_sorted[..30] } else { &tag_sorted[..] };
    out.push_str("| Tag | Count |\n|-----|-------|\n");
    for (tag, cnt) in top_tags {
        out.push_str(&format!("| {} | {} |\n", escape_md(tag), cnt));
    }
    if tag_sorted.len() > 30 {
        out.push_str(&format!("\n*...and {} more tags*\n", tag_sorted.len() - 30));
    }
    out.push_str("\n");

    // 6. Source Analysis
    out.push_str("## 6. Source Analysis\n\n");
    let mut src_counts: HashMap<String, usize> = HashMap::new();
    for r in &rows {
        *src_counts.entry(r.source.clone()).or_default() += 1;
    }
    let mut src_sorted: Vec<(String, usize)> = src_counts.into_iter().collect();
    src_sorted.sort_by(|a, b| b.1.cmp(&a.1));
    out.push_str("| Source | Count |\n|--------|-------|\n");
    for (src, cnt) in &src_sorted {
        out.push_str(&format!("| {} | {} |\n", escape_md(src), cnt));
    }
    out.push_str("\n");

    // 7. Recent Trend (last 6 months)
    out.push_str("## 7. Recent Installation Trend\n\n");
    let mut month_counts: HashMap<(i32, u32), usize> = HashMap::new();
    for r in &rows {
        if let Some(ref date) = r.date_added {
            if let Some(ym) = parse_ym(date) {
                *month_counts.entry(ym).or_default() += 1;
            }
        }
    }
    let mut month_sorted: Vec<((i32, u32), usize)> = month_counts.into_iter().collect();
    month_sorted.sort_by(|a, b| a.0.cmp(&b.0));
    let start = if month_sorted.len() > 6 { month_sorted.len() - 6 } else { 0 };
    out.push_str("| Month | New Skills |\n|-------|------------|\n");
    for ((y, m), cnt) in &month_sorted[start..] {
        out.push_str(&format!("| {}-{:02} | {} |\n", y, m, cnt));
    }
    out.push_str("\n");

    // 8. Full Skill List by Category
    out.push_str("## 8. Full Skill List\n\n");
    let mut by_cat: HashMap<String, Vec<&SkillExportRow>> = HashMap::new();
    for r in &rows {
        let key = r.category.as_deref().filter(|c| !c.is_empty()).unwrap_or("(uncategorized)").to_string();
        by_cat.entry(key).or_default().push(r);
    }
    let mut cat_keys: Vec<&String> = by_cat.keys().collect();
    cat_keys.sort();
    for cat_key in cat_keys {
        let skills_in_cat = by_cat.get(cat_key).unwrap();
        out.push_str(&format!("### {}\n\n", escape_md(cat_key)));
        out.push_str("| Name | Description | Risk | Tags |\n|------|-------------|------|------|\n");
        for row in skills_in_cat {
            let desc = truncate(&row.description, 80);
            let risk = row.risk.as_deref().unwrap_or("-");
            let tags = if row.tags.is_empty() { "-".to_string() } else { row.tags.clone() };
            out.push_str(&format!(
                "| {} | {} | {} | {} |\n",
                escape_md(&row.name), escape_md(&desc), escape_md(risk), escape_md(&tags),
            ));
        }
        out.push_str("\n");
    }

    Ok(out)
}

fn format_timestamp(total_secs: u64) -> String {
    // Beijing time: UTC+8
    let total_secs = total_secs + 8 * 3600;
    let mut days = total_secs / 86400;
    let time_of_day = total_secs % 86400;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;

    days += 719468;
    let era = (days as i64) / 146097;
    let doe = (days as i64) % 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mon = if mp < 10 { mp + 3 } else { mp - 9 };
    let yr = if mon <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", yr, mon, d, h, m, s)
}