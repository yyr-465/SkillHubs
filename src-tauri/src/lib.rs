mod backup;
mod db;
mod export;
mod models;
mod parser;
mod settings;
mod scanner;
mod categorizer;
mod tray;
mod execution;
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use std::fs::OpenOptions;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

use models::{ExportCsvRequest, ExportReportRequest, AssignTagRequest, BatchCategorizeRequest, CategorizeProgress, ExecuteSkillRequest, ExecutionPreview, ExecutionResult, FilterOptions, ImportResult, ScanResult, SearchHistoryItem, Skill, SkillContent, SkillPage, SkillQuery, Stats, Tag, ToggleFavoriteRequest, UpdateSkillRequest, EnvironmentDiagnostic};
use models::{CategorizationEntry, ConflictItem, ResolveConflictsRequest};
use backup::{RestorePreview, RestoreSummary};
use settings::AppSettings;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::sync::Arc;

/// Wrapper so we can share a rusqlite Connection across threads.
struct DbState(Arc<Mutex<rusqlite::Connection>>);

/// Wrapper for the categorizer shared state.
struct CategorizerState(Arc<categorizer::CategorizerState>);

struct AppState {
    execution_manager: Arc<execution::manager::ExecutionManager>,
}

// -- Tauri Commands --

/// Scan all configured skill directories and persist to database.
#[tauri::command]
async fn scan_skills(state: tauri::State<'_, DbState>) -> Result<ScanResult, String> {
    let settings = settings::load_settings();
    if !probe_writable_path(&db::db_path()) {
        return Err(database_storage_error(&settings.language));
    }
    let result = scanner::scan_all(settings.skill_directory.as_deref());

    // A missing or unreadable configured directory must not wipe the database:
    // the existing rows still reflect the last successful scan, and the scan
    // result already carries the bilingual, path-safe error for the UI.
    if scanner::directory_is_readable(settings.skill_directory.as_deref()) {
        let mut conn = state.0.lock().map_err(|e| e.to_string())?;
        db::replace_all_skills(&mut conn, &result.skills)
            .map_err(|_| database_storage_error(&settings.language))?;
    }

    Ok(result)
}

/// Return actionable, path-safe checks used by the first-run diagnostics screen.
#[tauri::command]
fn get_environment_diagnostics() -> Vec<EnvironmentDiagnostic> {
    let settings = settings::load_settings();
    let mut checks = Vec::new();
    for executable in ["git.exe", "skill-tool.exe"] {
        let found = if cfg!(target_os = "windows") {
            std::process::Command::new("where").arg(executable).output().map(|output| output.status.success()).unwrap_or(false)
        } else {
            std::process::Command::new("which").arg(executable.trim_end_matches(".exe")).output().map(|output| output.status.success()).unwrap_or(false)
        };
        checks.push(EnvironmentDiagnostic {
            id: format!("executable-{executable}"),
            status: if found { "ok".into() } else { "warning".into() },
            detail: if found {
                format!("{executable} is available / {executable} 可用")
            } else {
                format!("Install or configure {executable} before running Skills / 请先安装或配置 {executable}，再执行 Skill")
            },
        });
    }
    let directory_status = settings.skill_directory.as_deref().map(std::path::Path::new).map(|path| {
        if !path.exists() { "missing" } else if !path.is_dir() { "invalid" } else if std::fs::read_dir(path).is_err() { "unreadable" } else { "ok" }
    }).unwrap_or("unconfigured");
    checks.push(EnvironmentDiagnostic {
        id: "skill-directory".into(),
        status: directory_status.into(),
        detail: match directory_status {
            "ok" => "Readable / 可读取".into(),
            "missing" => "Directory not found; choose another / 目录不存在，请重新选择".into(),
            "invalid" => "Selected path is not a directory / 所选路径不是目录".into(),
            "unreadable" => "Directory cannot be read / 目录不可读取".into(),
            _ => "Choose a Skill directory / 请选择 Skill 目录".into(),
        },
    });
    let db_writable = probe_writable_path(&db::db_path());
    checks.push(EnvironmentDiagnostic {
        id: "database".into(),
        status: if db_writable { "ok".into() } else { "warning".into() },
        detail: if db_writable {
            "Writable / 可写".into()
        } else {
            "Database storage is not writable / 数据库存储不可写".into()
        },
    });
    let integrity = db::check_database();
    checks.push(EnvironmentDiagnostic {
        id: "database-integrity".into(),
        status: if integrity.status == "ok" { "ok".into() } else { "warning".into() },
        detail: if integrity.status == "ok" {
            "Integrity OK / 完整性正常".into()
        } else {
            format!("Database integrity: {} / 数据库完整性异常", integrity.status)
        },
    });
    checks.push(EnvironmentDiagnostic { id: "updater".into(), status: "info".into(), detail: "Check from Settings to verify update access / 请在设置中检查更新连接".into() });
    checks
}

fn probe_writable_path(path: &std::path::Path) -> bool {
    if path.exists() {
        return OpenOptions::new().append(true).open(path).is_ok();
    }
    let parent = match path.parent() {
        Some(parent) if parent.exists() => parent,
        _ => return false,
    };
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|value| value.as_nanos()).unwrap_or(0);
    let probe = parent.join(format!(".skillhub-write-probe-{stamp}.tmp"));
    match OpenOptions::new().create_new(true).write(true).open(&probe) {
        Ok(mut file) => {
            let _ = file.write_all(b"probe");
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn database_storage_error(language: &str) -> String {
    if language == "zh" {
        "数据库存储不可写。请检查存储权限或可用磁盘空间，然后重试。".into()
    } else {
        "Database storage is not writable. Check storage permissions or available disk space, then try again.".into()
    }
}
 
 /// Return the Markdown body content for a skill (without YAML front-matter), read from its SKILL.md file.
 #[tauri::command]
async fn get_skill_content(
     state: tauri::State<'_, DbState>,
     id: String,
 ) -> Result<Option<SkillContent>, String> {
     let conn = state.0.lock().map_err(|e| e.to_string())?;
     db::get_skill_content(&conn, &id).map_err(|e| e.to_string())
 }
 
/// Return every skill from the database.
#[tauri::command]
async fn get_all_skills(state: tauri::State<'_, DbState>) -> Result<Vec<Skill>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_all_skills(&conn).map_err(|e| e.to_string())
}

/// Return an execution preview only. Real process execution remains disabled until a
/// platform-specific allowlist and capability policy are established.
#[tauri::command]
async fn prepare_skill_execution(
    state: tauri::State<'_, DbState>,
    skill_id: String,
) -> Result<Option<ExecutionPreview>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let skill = db::get_skill_by_id(&conn, &skill_id).map_err(|e| e.to_string())?
        .ok_or_else(|| "Skill not found".to_string())?;
    execution::preparation::preview(&skill).map_err(|error| error.to_string())
}

/// Start a managed Skill execution.
#[tauri::command]
async fn start_skill_execution(
    request: StartSkillExecutionRequest,
    db_state: tauri::State<'_, DbState>,
    state: tauri::State<'_, AppState>,
) -> Result<execution::state::ExecutionRecord, String> {
    if !request.confirmed {
        return Err("Explicit user confirmation is required.".to_string());
    }
    let skill = {
        let conn = db_state.0.lock().map_err(|e| e.to_string())?;
        db::get_skill_by_id(&conn, &request.skill_id).map_err(|e| e.to_string())?
            .ok_or_else(|| "Skill not found".to_string())?
    };
    let prepared = execution::preparation::prepare_execution(&skill)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "This Skill has no execution declaration.".to_string())?;
    state.execution_manager.start_execution(
        prepared.skill_id,
        prepared.executable,
        prepared.args,
        &prepared.working_dir,
        prepared.timeout_seconds,
    ).await.map_err(|error| error.to_string())
}

/// Return the current state of a managed Skill execution.
#[tauri::command]
fn get_execution_status(
    execution_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<execution::state::ExecutionRecord, String> {
    state.execution_manager.get_execution_status(&execution_id).map_err(|error| error.to_string())
}

/// Cancel a managed Skill execution.
#[tauri::command]
async fn cancel_skill_execution(
    execution_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<execution::state::ExecutionRecord, String> {
    state.execution_manager.cancel_execution(&execution_id).await.map_err(|error| error.to_string())
}

#[derive(Debug, serde::Deserialize)]
struct StartSkillExecutionRequest {
    skill_id: String,
    confirmed: bool,
}

/// Deprecated: use start_skill_execution instead.
#[tauri::command]
#[deprecated(note = "use start_skill_execution instead")]
async fn execute_skill(
    request: ExecuteSkillRequest,
    db_state: tauri::State<'_, DbState>,
    app_state: tauri::State<'_, AppState>,
) -> Result<ExecutionResult, String> {
    if !request.confirmed {
        return Err("Explicit user confirmation is required.".into());
    }
    let skill = {
        let conn = db_state.0.lock().map_err(|e| e.to_string())?;
        db::get_skill_by_id(&conn, &request.skill_id).map_err(|e| e.to_string())?
            .ok_or_else(|| "Skill not found".to_string())?
    };
    let prepared = execution::preparation::prepare_execution(&skill)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "This Skill has no execution declaration.".to_string())?;
    let command = prepared.executable.clone();
    let args = prepared.args.clone();
    let execution_id = app_state.execution_manager.start_execution(
        prepared.skill_id.clone(),
        prepared.executable,
        prepared.args,
        &prepared.working_dir,
        prepared.timeout_seconds,
    ).await.map_err(|error| error.to_string())?.execution_id;

    loop {
        let record = app_state.execution_manager.get_execution_status(&execution_id)
            .map_err(|error| error.to_string())?;
        match record.status {
            execution::state::ExecutionStatus::Success
            | execution::state::ExecutionStatus::Failed
            | execution::state::ExecutionStatus::Cancelled
            | execution::state::ExecutionStatus::Timeout => {
                return Ok(ExecutionResult {
                    skill_id: record.skill_id,
                    command: std::iter::once(command).chain(args).collect::<Vec<_>>().join(" "),
                    exit_code: record.exit_code,
                    stdout: record.stdout,
                    stderr: record.stderr,
                    timed_out: record.status == execution::state::ExecutionStatus::Timeout,
                });
            }
            execution::state::ExecutionStatus::Preview | execution::state::ExecutionStatus::Running => {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }
    }
}

/// Return a single skill by its folder-name ID.
#[tauri::command]
async fn get_skill_by_id(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<Option<Skill>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_skill_by_id(&conn, &id).map_err(|e| e.to_string())
}

/// Search skills by name or description (LIKE query).
#[tauri::command]
async fn search_skills(
    state: tauri::State<'_, DbState>,
    query: String,
) -> Result<Vec<Skill>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::search_skills(&conn, &query).map_err(|e| e.to_string())
}

/// Return aggregate statistics (counts / breakdowns).
#[tauri::command]
async fn get_stats(state: tauri::State<'_, DbState>) -> Result<Stats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_stats(&conn).map_err(|e| e.to_string())
}


/// Detect the system locale (returns "zh" or "en").
#[tauri::command]
fn get_locale() -> String {
    settings::detect_system_locale()
}

/// Load persisted settings.
#[tauri::command]
fn load_settings() -> AppSettings {
    settings::load_settings()
}

/// Save settings and return the updated value.
#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<AppSettings, String> {
    settings::save_settings(&settings)?;
    Ok(settings)
}

/// Start the AI categorization background task.
#[tauri::command]
async fn categorize_skills(
    state: tauri::State<'_, CategorizerState>,
) -> Result<(), String> {
    let categorizer_state = &state.0;

    if categorizer_state.running.load(Ordering::SeqCst) {
        return Err("Categorization already in progress".into());
    }

    let settings = settings::load_settings();
    let api_key = settings.api_key;
    if api_key.is_empty() {
        return Err("Please configure your DeepSeek API Key in Settings first.".into());
    }
    let lang = settings.language;

    categorizer_state.running.store(true, Ordering::SeqCst);
    {
        let mut progress = categorizer_state.progress.lock().map_err(|e| e.to_string())?;
        progress.running = true;
    }

    let db_path = crate::db::db_path();
    let db_path_str = db_path.to_string_lossy().to_string();
    let state_clone = categorizer_state.clone();

    tokio::spawn(async move {
        categorizer::run_categorization(state_clone, db_path_str, api_key, lang).await;
    });

    Ok(())
}

/// Poll the current categorization progress.
#[tauri::command]
async fn get_categorize_progress(
    state: tauri::State<'_, CategorizerState>,
) -> Result<CategorizeProgress, String> {
    let progress = state.0.progress.lock().map_err(|e| e.to_string())?;
    Ok(progress.clone())
}

/// Query skills with filtering, sorting, and pagination. Returns SkillPage.
#[tauri::command]
async fn query_skills(
    state: tauri::State<'_, DbState>,
    query: SkillQuery,
) -> Result<SkillPage, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::query_skills(&conn, &query).map_err(|e| e.to_string())
}

/// Return available filter options (distinct categories, risks, sources with counts).
#[tauri::command]
async fn get_filters(state: tauri::State<'_, DbState>) -> Result<FilterOptions, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_filters(&conn).map_err(|e| e.to_string())
}

/// Toggle the favorite status of a skill.
#[tauri::command]
async fn toggle_favorite(
    state: tauri::State<'_, DbState>,
    request: ToggleFavoriteRequest,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::toggle_favorite(&conn, &request.skill_id, request.favorite)
        .map_err(|e| e.to_string())
}

/// Return the total number of favorited skills.
#[tauri::command]
async fn get_favorites_count(state: tauri::State<'_, DbState>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_favorites_count(&conn).map_err(|e| e.to_string())
}

/// Update editable fields of a single skill.
#[tauri::command]
async fn update_skill(
    state: tauri::State<'_, DbState>,
    request: UpdateSkillRequest,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::update_skill(&conn, &request).map_err(|e| e.to_string())
}

/// Batch categorize multiple skills at once.
#[tauri::command]
async fn batch_categorize(
    state: tauri::State<'_, DbState>,
    request: BatchCategorizeRequest,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::batch_categorize(&conn, &request).map_err(|e| e.to_string())
}

/// Export selected skills as a JSON string.
#[tauri::command]
async fn export_skills(
    state: tauri::State<'_, DbState>,
    skill_ids: Vec<String>,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let json = db::export_skills_to_json(&conn, &skill_ids).map_err(|e| e.to_string())?;
    Ok(json)
}

/// Import skills from a JSON string.
#[tauri::command]
async fn import_skills(
    state: tauri::State<'_, DbState>,
    json_str: String,
) -> Result<ImportResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::import_skills_from_json(&conn, &json_str).map_err(|e| e.to_string())
}

/// Return full-text search suggestions for auto-complete.
#[tauri::command]
async fn search_suggestions(
    state: tauri::State<'_, DbState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<Skill>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::search_suggestions(&conn, &query, limit.unwrap_or(10)).map_err(|e| e.to_string())
}

/// Record a search query in history.
#[tauri::command]
async fn add_search_history(
    state: tauri::State<'_, DbState>,
    query: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::add_search_history(&conn, &query).map_err(|e| e.to_string())
}

/// Return recent search history.
#[tauri::command]
async fn get_search_history(
    state: tauri::State<'_, DbState>,
    limit: Option<i64>,
) -> Result<Vec<SearchHistoryItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_search_history(&conn, limit.unwrap_or(10)).map_err(|e| e.to_string())
}

/// Clear all search history.
#[tauri::command]
async fn clear_search_history(
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::clear_search_history(&conn).map_err(|e| e.to_string())
}

/// Record a recent view for a skill.
#[tauri::command]
async fn add_recent_view(
    state: tauri::State<'_, DbState>,
    skill_id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::add_recent_view(&conn, &skill_id).map_err(|e| e.to_string())
}

/// Return recent views joined with skill data.
#[tauri::command]
async fn get_recent_views(
    state: tauri::State<'_, DbState>,
    limit: Option<i64>,
) -> Result<Vec<Skill>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_recent_views(&conn, limit.unwrap_or(30)).map_err(|e| e.to_string())
}

/// Get all matching skill IDs for the current query (no pagination).
#[tauri::command]
async fn get_skill_ids_by_query(
    state: tauri::State<'_, DbState>,
    query: SkillQuery,
) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_skill_ids_by_query(&conn, &query).map_err(|e| e.to_string())
}

/// Export skills as CSV string.
#[tauri::command]
async fn export_skills_csv(
    state: tauri::State<'_, DbState>,
    request: ExportCsvRequest,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    export::export_csv_string(&conn, &request)
}

/// Export skills as Markdown report string.
#[tauri::command]
async fn export_skills_report(
    state: tauri::State<'_, DbState>,
    request: ExportReportRequest,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    export::export_report_string(&conn, &request)
}

// -- Phase 12: Backup, restore, and database health commands --

/// Produce a versioned, secret-free backup of the full database + settings.
#[tauri::command]
async fn backup_data(state: tauri::State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let settings = settings::load_settings();
    backup::create_backup(&conn, &settings)
}

/// Validate a backup and return a preview without touching the database.
#[tauri::command]
async fn preview_restore(json_str: String) -> Result<RestorePreview, String> {
    backup::preview_restore(&json_str)
}

/// Restore a validated backup into the database inside a single transaction.
#[tauri::command]
async fn restore_data(
    state: tauri::State<'_, DbState>,
    json_str: String,
) -> Result<RestoreSummary, String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let outcome = backup::restore_backup(&mut conn, &json_str)?;

    let mut settings_restored = false;
    let mut warnings = outcome.warnings;
    if let Some(settings_backup) = &outcome.settings {
        match backup::apply_backup_settings(settings_backup) {
            Ok(()) => settings_restored = true,
            Err(e) => warnings.push(format!("Settings were not restored: {e}")),
        }
    }

    Ok(RestoreSummary {
        skills: outcome.skills,
        tags: outcome.tags,
        skill_tags: outcome.skill_tags,
        search_history: outcome.search_history,
        recent_views: outcome.recent_views,
        categorization_history: outcome.categorization_history,
        execution_audit: outcome.execution_audit,
        settings_restored,
        warnings,
    })
}

/// Run a live integrity check against the on-disk database file.
#[tauri::command]
fn verify_database() -> db::DatabaseIntegrity {
    db::check_database()
}

/// Return the data directory and database file paths.
#[tauri::command]
fn get_data_directory() -> db::DataDirectoryInfo {
    db::data_directory_info()
}

// -- Phase 8.2: Tag commands --
#[tauri::command]
async fn create_tag(state: tauri::State<'_, DbState>, name: String, color: Option<String>) -> Result<Tag, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::create_tag(&conn, &name, &color.unwrap_or_else(|| "#6366f1".to_string()))
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn delete_tag(state: tauri::State<'_, DbState>, tag_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::delete_tag(&conn, tag_id).map_err(|e| e.to_string())
}
#[tauri::command]
async fn get_all_tags(state: tauri::State<'_, DbState>) -> Result<Vec<Tag>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_all_tags(&conn).map_err(|e| e.to_string())
}
#[tauri::command]
async fn assign_tag(state: tauri::State<'_, DbState>, request: AssignTagRequest) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::assign_tag(&conn, &request.skill_id, request.tag_id).map_err(|e| e.to_string())
}
#[tauri::command]
async fn remove_tag(state: tauri::State<'_, DbState>, request: AssignTagRequest) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::remove_tag(&conn, &request.skill_id, request.tag_id).map_err(|e| e.to_string())
}
#[tauri::command]
async fn get_skill_tags(state: tauri::State<'_, DbState>, skill_id: String) -> Result<Vec<Tag>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_skill_tags(&conn, &skill_id).map_err(|e| e.to_string())
}


// -- Phase 8.3b: Categorization conflict commands --

/// Get all categorization conflicts where AI changed its mind on the same skill.
#[tauri::command]
async fn get_categorization_conflicts(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<ConflictItem>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_categorization_conflicts(&conn).map_err(|e| e.to_string())
}

/// Count unresolved categorization conflicts (for Dashboard badge).
#[tauri::command]
async fn get_conflict_count(
    state: tauri::State<'_, DbState>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_conflict_count(&conn).map_err(|e| e.to_string())
}

/// Resolve one or more conflicts using the categories selected by the user.
#[tauri::command]
async fn resolve_conflicts(
    state: tauri::State<'_, DbState>,
    request: ResolveConflictsRequest,
) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    db::resolve_conflicts(&mut conn, &request).map_err(|e| e.to_string())
}

/// Return the categorization history for a single skill.
#[tauri::command]
async fn get_categorization_history(
    state: tauri::State<'_, DbState>,
    skill_id: String,
) -> Result<Vec<CategorizationEntry>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get_categorization_history(&conn, &skill_id).map_err(|e| e.to_string())
}

// -- Application entry point --

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Keep the app available long enough to explain a storage failure. The
    // in-memory fallback is intentionally non-persistent; commands that need
    // the normal schema will still fail safely, while Settings can show the
    // path-safe database diagnostic and the user can fix storage permissions.
    let conn = match db::init_db() {
        Ok(conn) => conn,
        Err(error) => {
            eprintln!("Database storage is unavailable; using a non-persistent fallback: {error}");
            // Preserve the raw database file so a corrupt or unreadable file can
            // still be recovered or inspected rather than silently overwritten.
            if let Err(preserve_error) = db::preserve_database_file() {
                eprintln!("Failed to preserve database file: {preserve_error}");
            }
            db::init_memory_db()
                .expect("Failed to create in-memory database fallback")
        }
    };
    let db_state = Arc::new(Mutex::new(conn));

    tauri::Builder::default()
        .manage(std::sync::Mutex::new(false))
        .manage(DbState(Arc::clone(&db_state)))
        .manage(CategorizerState(Arc::new(categorizer::CategorizerState::new())))
        .manage(AppState { execution_manager: Arc::new(execution::manager::ExecutionManager::with_audit_db(Arc::clone(&db_state))) })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                tray::toggle_main_window(app);
            }
        }).build())
        .invoke_handler(tauri::generate_handler![
            scan_skills,
            get_environment_diagnostics,
            get_skill_content,
            prepare_skill_execution,
            start_skill_execution,
            get_execution_status,
            cancel_skill_execution,
            execute_skill,
            get_all_skills,
            get_skill_by_id,
            search_skills,
            query_skills,
            get_filters,
            get_stats,
            get_locale,
            load_settings,
            save_settings,
            categorize_skills,
            get_categorize_progress,
            toggle_favorite,
            get_favorites_count,
            update_skill,
            batch_categorize,
            export_skills,
            import_skills,
            search_suggestions,
            add_search_history,
            get_search_history,
            clear_search_history,
            add_recent_view,
            get_recent_views,
            // Phase 8.2: Tag commands
            create_tag,
            delete_tag,
            get_all_tags,
            assign_tag,
            remove_tag,
            get_skill_tags,
            get_skill_ids_by_query,
            export_skills_csv,
            export_skills_report,
            get_categorization_conflicts,
            get_conflict_count,
            resolve_conflicts,
            get_categorization_history,
            // Phase 12: Backup, restore, and database health
            backup_data,
            preview_restore,
            restore_data,
            verify_database,
            get_data_directory,
        ])
        .setup(|app| {
            tray::init(app)?;
            if let Err(error) = app.global_shortcut().register("ALT+SPACE") {
                eprintln!("Failed to register Alt+Space: {error}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let settings = settings::load_settings();
                let exit_requested = window.app_handle().try_state::<std::sync::Mutex<bool>>()
                    .map(|state| *state.lock().unwrap_or_else(|poisoned| poisoned.into_inner()))
                    .unwrap_or(false);
                if settings.minimize_to_tray && !exit_requested {
                    api.prevent_close();
                    tray::hide_main_window(&window.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle: &tauri::AppHandle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Err(error) = tauri::async_runtime::block_on(state.inner().execution_manager.kill_all()) {
                        eprintln!("Failed to clean up executions during exit: {error}");
                    }
                }
            }
        });
}
