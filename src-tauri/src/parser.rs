use crate::models::{ExecutionSpec, SkillFrontMatter};
use serde_yaml::Value;
use std::path::Path;

/// Parse SKILL.md front matter without interpreting Markdown as executable code.
pub fn parse_skill_md(path: &Path) -> Result<SkillFrontMatter, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("Cannot read {}: {}", path.display(), e))?;
    let trimmed = content.trim_start_matches('\u{feff}').trim_start();
    if !trimmed.starts_with("---") { return Err(format!("No front matter in {}", path.display())); }
    let after_opener = &trimmed[3..];
    let close_pos = after_opener.find("\n---").ok_or_else(|| format!("Unclosed front matter in {}", path.display()))?;
    let value: Value = serde_yaml::from_str(&after_opener[..close_pos]).map_err(|e| format!("YAML parse error in {}: {}", path.display(), e))?;
    let extract = |key: &str| value.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(ToOwned::to_owned);
    let execution = value.get("execution").map(|v| parse_execution(v, path)).transpose()?;
    Ok(SkillFrontMatter { name: extract("name"), description: extract("description"), category: extract("category"), risk: extract("risk"), date_added: extract("date_added"), icon: extract("icon"), execution })
}

fn parse_execution(value: &Value, path: &Path) -> Result<ExecutionSpec, String> {
    let map = value.as_mapping().ok_or_else(|| format!("Invalid execution declaration in {}", path.display()))?;
    let get = |key: &str| map.get(Value::String(key.to_string()));
    let command = get("command").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty() && !s.chars().any(char::is_control)).ok_or_else(|| format!("Invalid execution command in {}", path.display()))?.to_string();
    let args = match get("args") { None => Vec::new(), Some(Value::Sequence(values)) => values.iter().map(|v| v.as_str().filter(|s| !s.chars().any(char::is_control)).map(ToOwned::to_owned).ok_or_else(|| format!("Invalid execution args in {}", path.display()))).collect::<Result<Vec<_>, _>>()?, _ => return Err(format!("Invalid execution args in {}", path.display())) };
    let timeout_seconds = get("timeout_seconds").and_then(Value::as_u64).unwrap_or(300);
    if !(1..=3600).contains(&timeout_seconds) { return Err(format!("Execution timeout must be between 1 and 3600 seconds in {}", path.display())); }
    let working_dir = get("working_dir").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty() && !s.contains("..") && !s.contains('/') && !s.contains('\\')).map(ToOwned::to_owned);
    if get("working_dir").is_some() && working_dir.is_none() { return Err(format!("Invalid execution working_dir in {}", path.display())); }
    let requires_confirmation = get("requires_confirmation").and_then(Value::as_bool).unwrap_or(true);
    if !requires_confirmation { return Err(format!("Execution declarations must require confirmation in {}", path.display())); }
    Ok(ExecutionSpec { command, args, working_dir, timeout_seconds, requires_confirmation })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn write_fixture(name: &str, content: &str) -> std::path::PathBuf { let dir = std::env::temp_dir().join(name); std::fs::create_dir_all(&dir).unwrap(); let path = dir.join("SKILL.md"); std::fs::write(&path, content).unwrap(); path }
    #[test] fn parses_execution() { let path = write_fixture("skillhub_parse_execution", "---\nname: executable\nexecution:\n  command: python\n  args: [script.py]\n  working_dir: .\n  timeout_seconds: 60\n  requires_confirmation: true\n---\n"); assert_eq!(parse_skill_md(&path).unwrap().execution.unwrap().command, "python"); }
    #[test] fn rejects_non_sequence_args() { let path = write_fixture("skillhub_reject_args", "---\nname: unsafe\nexecution:\n  command: cmd\n  args: script.py\n---\n"); assert!(parse_skill_md(&path).is_err()); }
    #[test] fn ignores_markdown_code() { let path = write_fixture("skillhub_markdown_only", "---\nname: docs\n---\n```bash\nrm -rf .\n```"); assert!(parse_skill_md(&path).unwrap().execution.is_none()); }
}
