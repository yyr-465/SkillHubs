use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ── Settings data model ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    /// DeepSeek API key (plain text; Phase 9 moves to credential vault)
    pub api_key: String,
    /// "zh" or "en"
    pub language: String,
    /// "system" | "light" | "dark" | "custom"
    pub theme_mode: String,
    /// Custom primary colour (hex, used when theme_mode == "custom")
    pub custom_primary: String,
    /// Custom background colour (hex, used when theme_mode == "custom")
    pub custom_background: String,
    pub minimize_to_tray: bool,
    /// User-selected root directory scanned recursively for SKILL.md files.
    pub skill_directory: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            language: "en".into(),
            theme_mode: "system".into(),
            custom_primary: "#6366f1".into(),
            custom_background: "#0f0f0f".into(),
            minimize_to_tray: true,
            skill_directory: None,
        }
    }
}

// ── File path ────────────────────────────────────────────────────

fn settings_path() -> PathBuf {
    let home = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    let dir = home.join(".skillhub");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("settings.json")
}

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

// ── Read / Write ─────────────────────────────────────────────────

pub fn load_settings() -> AppSettings {
    let path = settings_path();
    if !path.exists() {
        let settings = AppSettings::default();
        let _ = save_settings(&settings);
        return settings;
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path();
    let content = serde_json::to_string_pretty(settings)
        .map_err(|_| "Settings could not be serialized.".to_string())?;
    std::fs::write(&path, content)
        .map_err(|_| "Settings could not be saved. Check storage permissions or available disk space.".to_string())
}

// ── Locale detection (Windows) ───────────────────────────────────

/// Returns a two-letter language code based on the system locale.
/// On Windows we read the system default locale via PowerShell.
pub fn detect_system_locale() -> String {
    // Try reading Windows regional setting
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "& {Get-WinSystemLocale | Select-Object -ExpandProperty Name}"])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let locale = String::from_utf8_lossy(&out.stdout).trim().to_string();
            // e.g. "zh-CN", "en-US", "ja-JP" etc.
            if locale.starts_with("zh") {
                return "zh".into();
            }
        }
    }

    // Fallback: check LANG env var
    if let Ok(lang) = std::env::var("LANG") {
        if lang.starts_with("zh") {
            return "zh".into();
        }
    }

    "en".into()
}
