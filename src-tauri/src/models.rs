use serde::{Deserialize, Serialize};

/// Sort field for skills listing
/// A tag with optional skill count.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub created_at: String,
    pub skill_count: Option<i64>,
}

/// Request to assign or remove a tag from a skill.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignTagRequest {
    pub skill_id: String,
    pub tag_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SortField {
    Name,
    DateAdded,
    Category,
    Risk,
    Source,
}

/// Sort direction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SortDirection {
    Asc,
    Desc,
}

/// Filter + sort parameters passed from frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillQuery {
    pub search: Option<String>,
    pub category: Option<String>,
    pub risk: Option<String>,
    pub source: Option<String>,
    pub sort_field: Option<SortField>,
    pub sort_direction: Option<SortDirection>,
    pub offset: Option<i64>,
    pub limit: Option<i64>,
    pub favorite_only: Option<bool>,
    pub tag_ids: Option<Vec<i64>>,
}

/// Filter options returned by get_filters()
#[derive(Debug, Serialize, Deserialize)]
pub struct FilterOptions {
    pub categories: Vec<FilterOptionWithCount>,
    pub risks: Vec<FilterOptionWithCount>,
    pub sources: Vec<FilterOptionWithCount>,
}

/// A filter option with its occurrence count
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterOptionWithCount {
    pub value: String,
    pub count: i64,
}

/// A single search history entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHistoryItem {
    pub id: i64,
    pub query: String,
    pub created_at: String,
}

/// A single skill parsed from SKILL.md
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    /// Folder name as unique ID
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: Option<String>,
    pub risk: Option<String>,
    pub date_added: Option<String>,
    /// Absolute path to the skill folder
    pub source_path: String,
    /// "agentic-awesome" or "codex"
    pub source: String,
    pub favorite: Option<bool>,
    /// Icon value from SKILL.md front-matter (emoji, URL, SVG, or null)
    pub icon: Option<String>,
}

/// Result of a scan operation
#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub skills: Vec<Skill>,
    pub errors: Vec<String>,
}

/// Paginated skills result with total count
#[derive(Debug, Serialize, Deserialize)]
pub struct SkillPage {
    pub skills: Vec<Skill>,
    pub total_count: i64,
}

/// Request body for toggling favorite status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToggleFavoriteRequest {
    pub skill_id: String,
    pub favorite: bool,
}

/// Dashboard / API statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct Stats {
    pub total_count: i64,
    pub categorized_count: i64,
    pub uncategorized_count: i64,
    pub category_counts: Vec<CategoryCount>,
    pub risk_counts: Vec<RiskCount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryCount {
    pub category: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RiskCount {
    pub risk: String,
    pub count: i64,
}

/// Progress state for the AI categorization background task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorizeProgress {
    pub total: usize,
    pub processed: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub current_skill: Option<String>,
    pub running: bool,
}

/// Final result returned when categorization finishes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorizeResult {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

// -- Front-matter subset we expect in SKILL.md --
#[derive(Debug, Deserialize)]
pub struct SkillFrontMatter {
    pub name: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub risk: Option<String>,
    pub date_added: Option<String>,
    pub icon: Option<String>,
    pub execution: Option<ExecutionSpec>,
}

/// Explicit, user-visible command declaration from SKILL.md front matter.
/// Parsing this data never executes code.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionSpec {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub working_dir: Option<String>,
    pub timeout_seconds: u64,
    pub requires_confirmation: bool,
}

/// Safe preview returned before any future execution implementation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionPreview {
    pub skill_id: String,
    pub spec: ExecutionSpec,
    pub executable: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteSkillRequest {
    pub skill_id: String,
    pub confirmed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionResult {
    pub skill_id: String,
    pub command: String,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
}

// -- Phase 5: CRUD & batch types --

/// Request body for updating a single skill's editable fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSkillRequest {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub risk: Option<String>,
}

/// Request body for batch-categorizing multiple skills at once.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchCategorizeRequest {
    pub skill_ids: Vec<String>,
    pub category: Option<String>,
    pub risk: Option<String>,
}

/// Result of an import operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub success_count: usize,
    pub errors: Vec<String>,
}

/// Wrapper for JSON import/export payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillExportWrapper {
    pub skills: Vec<Skill>,
}

/// Markdown body content for a skill, returned by get_skill_content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillContent {
    pub id: String,
    pub name: String,
    pub content: String,
}

// -- Phase 8.3a: Export types --

// -- Phase 8.3b: Categorization conflict types --

/// A single entry in the categorization_history table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorizationEntry {
    pub id: i64,
    pub skill_id: String,
    pub category: String,
    pub model: String,
    pub reason: Option<String>,
    pub created_at: String,
}

/// A conflict item showing old vs new AI categorization for a skill.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictItem {
    pub skill_id: String,
    pub skill_name: String,
    pub old_category: String,
    pub old_reason: Option<String>,
    pub new_category: String,
    pub new_reason: Option<String>,
    pub categorized_at: String,
}

/// Request body for resolving categorization conflicts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolveConflictsRequest {
    /// skill_id -> user-chosen category
    pub resolutions: std::collections::HashMap<String, String>,
}

/// Request body for CSV export.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportCsvRequest {
    pub skill_ids: Vec<String>,
    /// Column keys to include. Empty vec = default 7 columns.
    pub columns: Vec<String>,
}

/// Request body for Markdown report export.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportReportRequest {
    pub skill_ids: Vec<String>,
}

/// Internal row for CSV/report generation (not exposed as command param).
#[derive(Debug, Clone)]
pub(crate) struct SkillExportRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: Option<String>,
    pub risk: Option<String>,
    pub date_added: Option<String>,
    pub source_path: String,
    pub source: String,
    pub favorite: Option<bool>,
    pub icon: Option<String>,
    pub tags: String,
}
