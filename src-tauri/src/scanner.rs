use crate::models::{ScanResult, Skill};
use crate::parser::parse_skill_md;
use std::path::{Path, PathBuf};

/// Recursively scan a directory for SKILL.md files.
/// `source_label` is stored on each Skill (e.g. "agentic-awesome" or "codex").
fn scan_directory(root: &Path, source_label: &str) -> ScanResult {
    let mut skills = Vec::new();
    let mut errors = Vec::new();

    if !root.exists() {
        errors.push(format!("Directory does not exist: {}", root.display()));
        return ScanResult { skills, errors };
    }

    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(e) => {
            errors.push(format!("Cannot read directory {}: {}", root.display(), e));
            return ScanResult { skills, errors };
        }
    };

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
                errors.push(e);
            }
        }
    }

    ScanResult { skills, errors }
}

/// Scan all configured skill directories and merge results.
pub fn scan_all() -> ScanResult {
    // Resolve ~ to the user's home directory
    let home = dirs_next().unwrap_or_else(|| PathBuf::from("."));

    let paths = vec![
        (
            home.join(".agentic-awesome-skills").join("skills"),
            "agentic-awesome",
        ),
        (home.join(".codex").join("skills"), "codex"),
    ];

    let mut merged = ScanResult {
        skills: Vec::new(),
        errors: Vec::new(),
    };

    for (root, label) in paths {
        let result = scan_directory(&root, label);
        merged.skills.extend(result.skills);
        merged.errors.extend(result.errors);
    }

    merged
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
}
