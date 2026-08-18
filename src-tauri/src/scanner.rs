use crate::models::{ScanResult, Skill};
use crate::parser::parse_skill_md;
use std::path::{Path, PathBuf};

/// Recursively scan a directory for SKILL.md files.
/// `source_label` is stored on each Skill (e.g. "agentic-awesome" or "codex").
fn scan_directory(root: &Path, source_label: &str) -> ScanResult {
    let mut skills = Vec::new();
    let mut errors = Vec::new();

    if !root.exists() {
        errors.push("Directory does not exist / 目录不存在. Choose another directory / 请选择其他目录。".into());
        return ScanResult { skills, errors };
    }

    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(e) => {
            let _ = e;
            errors.push("Directory cannot be read / 目录不可读取. Check permissions / 请检查权限。".into());
            return ScanResult { skills, errors };
        }
    };

    // A user may select either a Skills root or one Skill folder directly.
    // Handle a root SKILL.md before walking child directories so both forms
    // produce the same result.
    let root_skill_md = root.join("SKILL.md");
    if root_skill_md.is_file() {
        let id = root.file_name().unwrap_or_default().to_string_lossy().to_string();
        match parse_skill_md(&root_skill_md) {
            Ok(fm) => skills.push(Skill {
                id: id.clone(),
                name: fm.name.unwrap_or_else(|| id.clone()),
                description: fm.description.unwrap_or_default(),
                category: fm.category,
                risk: fm.risk,
                date_added: fm.date_added,
                source_path: root.to_string_lossy().to_string(),
                source: source_label.to_string(),
                favorite: Some(false),
                icon: fm.icon,
            }),
            Err(_) => errors.push("Invalid SKILL.md / SKILL.md 不合法. Check its front matter / 请检查文件头。".into()),
        }
        return ScanResult { skills, errors };
    }

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }

        let skill_md = entry_path.join("SKILL.md");

        // Recurse into subdirectories if this dir has no SKILL.md
        if !skill_md.exists() {
            let nested = scan_directory(&entry_path, source_label);
            skills.extend(nested.skills);
            errors.extend(nested.errors);
            continue;
        }

        // Folder name is the skill ID
        let id = entry_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        match parse_skill_md(&skill_md) {
            Ok(fm) => {
                skills.push(Skill {
                    id: id.clone(),
                    name: fm.name.unwrap_or_else(|| id.clone()),
                    description: fm.description.unwrap_or_default(),
                    category: fm.category,
                    risk: fm.risk,
                    date_added: fm.date_added,
                    source_path: entry_path.to_string_lossy().to_string(),
                    source: source_label.to_string(),
                    favorite: Some(false),
                    icon: fm.icon,
                });
            }
            Err(e) => {
                let _ = e;
                errors.push("Invalid SKILL.md / SKILL.md 不合法. Check its front matter / 请检查文件头。".into());
            }
        }
    }

    ScanResult { skills, errors }
}

/// Scan all configured skill directories and merge results.
pub fn scan_all(configured_directory: Option<&str>) -> ScanResult {
    let Some(directory) = configured_directory.filter(|value| !value.trim().is_empty()) else {
        return ScanResult {
            skills: Vec::new(),
            errors: Vec::new(),
        };
    };

    let mut merged = ScanResult {
        skills: Vec::new(),
        errors: Vec::new(),
    };

    let result = scan_directory(&PathBuf::from(directory), "configured");
    merged.skills.extend(result.skills);
    merged.errors.extend(result.errors);

    merged
}

/// Whether the configured Skill directory is present and readable.
/// A missing or unreadable directory must not trigger a destructive rescan,
/// because the existing rows still reflect the last successful scan.
pub fn directory_is_readable(configured_directory: Option<&str>) -> bool {
    let Some(directory) = configured_directory.filter(|value| !value.trim().is_empty()) else {
        return true;
    };
    let path = PathBuf::from(directory);
    path.exists() && path.is_dir() && std::fs::read_dir(&path).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_scan_missing_directory() {
        let dir = PathBuf::from("C:\\nonexistent_skill_test_dir_xyz");
        let result = scan_directory(&dir, "test");
        assert!(result.skills.is_empty());
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_scan_empty_directory() {
        let dir = std::env::temp_dir().join("scan_test_empty");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let result = scan_directory(&dir, "test");
        assert!(result.skills.is_empty());
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_scan_finds_skill() {
        let dir = std::env::temp_dir().join("scan_test_skill");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        // Create a valid skill
        let skill_dir = dir.join("my-test-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: Test Skill\ndescription: A test\ncategory: testing\nrisk: low\n---\n\nContent",
        )
        .unwrap();

        // Create a non-skill folder (no SKILL.md)
        let non_skill = dir.join("not-a-skill");
        fs::create_dir_all(&non_skill).unwrap();

        let result = scan_directory(&dir, "test");
        assert_eq!(result.skills.len(), 1);
        assert_eq!(result.skills[0].name, "Test Skill");
        assert_eq!(result.skills[0].id, "my-test-skill");
        assert_eq!(result.skills[0].source, "test");
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_scan_finds_skill_when_selected_directory_is_the_skill_folder() {
        let dir = std::env::temp_dir().join("scan_test_root_skill");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("SKILL.md"),
            "---\nname: Root Skill\ndescription: A root skill\n---\n",
        )
        .unwrap();

        let result = scan_directory(&dir, "test");
        assert_eq!(result.skills.len(), 1);
        assert_eq!(result.skills[0].name, "Root Skill");
        assert!(result.errors.is_empty());
    }
}
