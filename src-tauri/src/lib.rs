mod db;
mod export;
mod models;
mod parser;
mod settings;
mod scanner;
mod categorizer;
mod tray;
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use models::{ExportCsvRequest, ExportReportRequest, AssignTagRequest, BatchCategorizeRequest, CategorizeProgress, ExecutionPreview, FilterOptions, ImportResult, ScanResult, SearchHistoryItem, Skill, SkillContent, SkillPage, SkillQuery, Stats, Tag, ToggleFavoriteRequest, UpdateSkillRequest};
use models::{CategorizationEntry, ConflictItem, ResolveConflictsRequest};
use settings::AppSettings;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::sync::Arc;

/// Wrapper so we can share a rusqlite Connection across threads.
struct DbState(Mutex<rusqlite::Connection>);

/// Wrapper for the categorizer shared state.
struct CategorizerState(Arc<categorizer::CategorizerState>);

// -- Tauri Commands --

/// Scan all configured skill directories and persist to database.
#[tauri::command]
async fn scan_skills(state: tauri::State<'_, DbState>) -> Result<ScanResult, String> {
    let result = scanner::scan_all();

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::replace_all_skills(&conn, &result.skills)
        .map_err(|e| format!("DB insert error: {}", e))?;

    Ok(result)
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
    let path = std::path::Path::new(&skill.source_path).join("SKILL.md");
    let front_matter = parser::parse_skill_md(&path)?;
    Ok(front_matter.execution.map(|spec| ExecutionPreview {
        skill_id,
        spec,
        executable: false,
        reason: Some("Command execution is disabled until a secure allowlist and capability policy are configured.".to_string()),
    }))
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
    // Initialise the database before starting the app
    let conn = db::init_db().expect("Failed to initialise SQLite database");

    tauri::Builder::default()
        .manage(std::sync::Mutex::new(false))
        .manage(DbState(Mutex::new(conn)))
        .manage(CategorizerState(Arc::new(categorizer::CategorizerState::new())))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                tray::toggle_main_window(app);
            }
        }).build())
        .invoke_handler(tauri::generate_handler![
            scan_skills,
            get_skill_content,
            prepare_skill_execution,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
