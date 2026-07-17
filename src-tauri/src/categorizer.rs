use crate::models::{CategorizeProgress, CategorizeResult, Skill};
use rusqlite::Connection;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Duration;

// ── Constants ──────────────────────────────────────────────────────────────

const DEEPSEEK_API_URL: &str = "https://api.deepseek.com/v1/chat/completions";
const BATCH_SIZE: usize = 50;
const MAX_CONCURRENT: usize = 5;
const MAX_RETRIES: u32 = 2;
const RETRY_DELAY_SECS: u64 = 3;
const BATCH_DELAY_SECS: u64 = 1;

// ── Shared progress state ─────────────────────────────────────────────────

pub struct CategorizerState {
    pub progress: Mutex<CategorizeProgress>,
    pub running: AtomicBool,
}

impl CategorizerState {
    pub fn new() -> Self {
        Self {
            progress: Mutex::new(CategorizeProgress {
                total: 0,
                processed: 0,
                succeeded: 0,
                failed: 0,
                current_skill: None,
                running: false,
            }),
            running: AtomicBool::new(false),
        }
    }
}

// ── API request / response types (OpenAI-compatible) ──────────────────────

#[derive(serde::Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    max_tokens: u32,
}

#[derive(serde::Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(serde::Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(serde::Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(serde::Deserialize)]
struct ResponseMessage {
    content: String,
}

// ── System prompt ─────────────────────────────────────────────────────────

fn system_prompt(lang: &str) -> String {
    if lang == "zh" {
        r#"你是一个技能分类助手。你的任务是根据技能的名称和描述，将其归入一个简洁的分类标签。

规则：
1. 只返回一个单词或短语，使用英文小写（例如 "development"、"security"、"design"、"data"、"devops"、"marketing"、"writing"、"testing"、"database"、"cloud"、"mobile"、"api"、"productivity"、"automation"、"analytics"、"monitoring"、"machine-learning"、"frontend"、"backend"、"documentation"、"search"、"communication"、"knowledge-management"、"business-intelligence"、"blockchain"、"ai"、"compliance"、"education"、"entertainment"、"games"、"utilities"）。
2. 不要包含任何标点符号、解释或额外文字。
3. 选择最相关的一个分类。如果没有合适的，返回 "uncategorized"。
4. 优先使用已有的分类名；优先选择通用术语。
5. 在分类名之后的第二行，提供一句话的中文依据。
   格式：category\nReason: <一句话中文依据>"#
            .to_string()
    } else {
        r#"You are a skill categorization assistant. Your task is to categorise a software / AI skill
into a single, concise category label based on its name and description.

Rules:
1. Return ONLY a single word or short phrase in lowercase English (e.g. "development", "security", "design", "data", "devops", "marketing", "writing", "testing", "database", "cloud", "mobile", "api", "productivity", "automation", "analytics", "monitoring", "machine-learning", "frontend", "backend", "documentation", "search", "communication", "knowledge-management", "business-intelligence", "blockchain", "ai", "compliance", "education", "entertainment", "games", "utilities").
2. Do NOT include any punctuation, explanation, or extra text.
3. Choose the SINGLE most relevant category. If nothing fits, return "uncategorized".
4. Use existing categories when they are a good match; prefer common terms over rare ones.
5. On a second line after the category, provide a one-sentence reason in English.
   Format: category\nReason: <one sentence>"#
            .to_string()
    }
}

fn user_prompt(skill: &Skill, lang: &str) -> String {
    if lang == "zh" {
        format!(
            "名称: {}\n描述: {}\n\n这个技能最适合哪个分类？",
            skill.name, skill.description
        )
    } else {
        format!(
            "Name: {}\nDescription: {}\n\nWhat is the most appropriate category for this skill?",
            skill.name, skill.description
        )
    }
}

// ── Category sanitisation ─────────────────────────────────────────────────

fn parse_category_response(raw: &str) -> (String, Option<String>) {
    let mut lines = raw.trim().lines();
    let raw_category = lines.next().unwrap_or("uncategorized").to_string();
    let category = {
        let trimmed = raw_category.trim().to_lowercase();
        let cleaned: String = trimmed
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || c.is_ascii_whitespace())
            .map(|c| if c.is_ascii_whitespace() { '-' } else { c })
            .collect();
        if cleaned.is_empty() { "uncategorized".into() } else { cleaned }
    };
    let reason = lines
        .find(|l| l.starts_with("Reason:"))
        .map(|l| l.trim_start_matches("Reason:").trim().to_string());
    (category, reason)
}

// ── Single skill categorisation (with retries) ────────────────────────────

async fn categorize_single(
    client: &reqwest::Client,
    api_key: &str,
    skill: &Skill,
    lang: &str,
) -> Result<(String, Option<String>), String> {
    let request = ChatRequest {
        model: "deepseek-chat".into(),
        messages: vec![
            Message {
                role: "system".into(),
                content: system_prompt(lang),
            },
            Message {
                role: "user".into(),
                content: user_prompt(skill, lang),
            },
        ],
        max_tokens: 64,
    };

    let mut last_error = String::new();

    for attempt in 0..=MAX_RETRIES {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_secs(RETRY_DELAY_SECS)).await;
        }

        match client
            .post(DEEPSEEK_API_URL)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
        {
            Ok(response) => {
                if !response.status().is_success() {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    last_error = format!("API error {}: {}", status, body);
                    continue;
                }

                match response.json::<ChatResponse>().await {
                    Ok(chat_resp) => {
                        if let Some(choice) = chat_resp.choices.first() {
                            let raw = &choice.message.content;
                            let (category, reason) = parse_category_response(raw);
                            return Ok((category, reason));
                        }
                        last_error = "Empty choices array".into();
                    }
                    Err(e) => {
                        last_error = format!("JSON parse error: {}", e);
                    }
                }
            }
            Err(e) => {
                last_error = format!("Network error: {}", e);
            }
        }
    }

    Err(last_error)
}

// ── Background categorisation task ────────────────────────────────────────

pub async fn run_categorization(
    state: Arc<CategorizerState>,
    db_path: String,
    api_key: String,
    lang: String,
) -> CategorizeResult {
    let lang = std::sync::Arc::new(lang);
    // Initialise progress
    {
        let mut progress = state.progress.lock().unwrap();
        progress.running = true;
        progress.processed = 0;
        progress.succeeded = 0;
        progress.failed = 0;
        progress.current_skill = None;
    }

    // Fetch uncategorised skills
    let conn = Connection::open(&db_path).expect("Failed to open database");
    let skills = crate::db::get_uncategorized_skills(&conn).unwrap_or_default();

    let total = skills.len();
    {
        let mut progress = state.progress.lock().unwrap();
        progress.total = total;
    }

    if total == 0 {
        let mut progress = state.progress.lock().unwrap();
        progress.running = false;
        return CategorizeResult {
            total: 0,
            succeeded: 0,
            failed: 0,
            errors: vec![],
        };
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("Failed to build HTTP client");

    let mut all_errors: Vec<String> = vec![];
    let mut succeeded = 0usize;
    let mut failed = 0usize;

    // Process in batches
    for batch_start in (0..total).step_by(BATCH_SIZE) {
        let batch_end = std::cmp::min(batch_start + BATCH_SIZE, total);
        let batch = &skills[batch_start..batch_end];

        // Process batch with limited concurrency
        let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT));
        let mut handles = vec![];

        for skill in batch {
            let sem = semaphore.clone();
            let client = client.clone();
            let api_key = api_key.clone();
            let skill = skill.clone();
            let state = state.clone();

            let lang_for_spawn = lang.clone();
                let handle = tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();

                // Update current skill
                {
                    let mut progress = state.progress.lock().unwrap();
                    progress.current_skill = Some(skill.name.clone());
                }

                let result = categorize_single(&client, &api_key, &skill, &lang_for_spawn).await;

                (skill, result)
            });

            handles.push(handle);
        }

        // Collect results
        let mut conn = Connection::open(&db_path).expect("Failed to open database");
        for handle in handles {
            match handle.await {
                Ok((skill, result)) => {
                    match result {
                        Ok((category, reason)) => {
                            // Phase 8.3b: Transactional write with history
                            if let Err(e) = crate::db::apply_categorization_result(&mut conn, &skill.id, &category, "deepseek-chat", reason.as_deref()) {
                                all_errors.push(format!("DB update error for '{}': {}", skill.name, e));
                                failed += 1;
                            } else {
                                succeeded += 1;
                            }
                        }
                        Err(e) => {
                            all_errors.push(format!("Categorisation error for '{}': {}", skill.name, e));
                            failed += 1;
                        }
                    }

                    // Update processed count
                    let mut progress = state.progress.lock().unwrap();
                    progress.processed += 1;
                    progress.succeeded = succeeded;
                    progress.failed = failed;
                    progress.current_skill = None;
                }
                Err(e) => {
                    all_errors.push(format!("Task join error: {}", e));
                    failed += 1;
                    let mut progress = state.progress.lock().unwrap();
                    progress.processed += 1;
                    progress.failed = failed;
                }
            }
        }

        // Delay before next batch (unless this was the last batch)
        if batch_end < total {
            tokio::time::sleep(Duration::from_secs(BATCH_DELAY_SECS)).await;
        }
    }

    // Close connection
    drop(conn);

    // Mark done
    {
        let mut progress = state.progress.lock().unwrap();
        progress.running = false;
        progress.current_skill = None;
    }

    CategorizeResult {
        total,
        succeeded,
        failed,
        errors: all_errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_category_response() {
        assert_eq!(parse_category_response("Development"), ("development".into(), None));
        assert_eq!(parse_category_response("  SECURITY  "), ("security".into(), None));
        assert_eq!(parse_category_response("Data Science"), ("data-science".into(), None));
        assert_eq!(parse_category_response("Machine Learning!"), ("machine-learning".into(), None));
        assert_eq!(parse_category_response("dev-ops"), ("dev-ops".into(), None));
        assert_eq!(parse_category_response(""), ("uncategorized".into(), None));
        assert_eq!(parse_category_response("   "), ("uncategorized".into(), None));
        assert_eq!(parse_category_response("Artificial Intelligence (AI)"), ("artificial-intelligence-ai".into(), None));
        assert_eq!(parse_category_response("development."), ("development".into(), None));
        assert_eq!(parse_category_response("\"testing\""), ("testing".into(), None));
    }

    #[test]
    fn test_parse_category_response_with_reason() {
        let result = parse_category_response("security\nReason: Handles OWASP patterns");
        assert_eq!(result.0, "security");
        assert_eq!(result.1.unwrap(), "Handles OWASP patterns");
    }

    #[test]
    fn test_parse_category_response_extra_lines() {
        let result = parse_category_response("development\nReason: Builds code\nExtra");
        assert_eq!(result.0, "development");
        assert_eq!(result.1.unwrap(), "Builds code");
    }

    #[test]
    fn test_parse_category_response_no_reason() {
        let result = parse_category_response("data\nSome text\nMore text");
        assert_eq!(result.0, "data");
        assert_eq!(result.1, None);
    }

    #[test]
    fn test_prompts_follow_selected_language() {
        assert!(system_prompt("zh").contains("中文依据"));
        assert!(system_prompt("en").contains("reason in English"));

        let skill = Skill {
            id: "test".into(),
            name: "Test".into(),
            description: "Description".into(),
            category: None,
            risk: None,
            date_added: None,
            source_path: "test".into(),
            source: "test".into(),
            favorite: Some(false),
            icon: None,
        };
        assert!(user_prompt(&skill, "zh").contains("名称"));
        assert!(user_prompt(&skill, "en").contains("Name"));
    }
}
