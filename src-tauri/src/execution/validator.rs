use std::path::{Path, PathBuf};

use super::{allowlist, error::ExecutionError};

pub const MAX_TIMEOUT_SECONDS: u64 = 300;

pub fn validate_executable(executable: &str) -> Result<(), ExecutionError> {
    allowlist::validate_executable(executable)
}

pub fn validate_args(args: &[String]) -> Result<(), ExecutionError> {
    const FORBIDDEN: &[char] = &['&', '|', ';', '>', '<', '`'];
    if let Some(argument) = args.iter().find(|argument| argument.chars().any(|c| FORBIDDEN.contains(&c))) {
        return Err(ExecutionError::InvalidArgument(argument.clone()));
    }
    Ok(())
}

pub fn validate_timeout(timeout_seconds: u64) -> Result<(), ExecutionError> {
    if (1..=MAX_TIMEOUT_SECONDS).contains(&timeout_seconds) {
        Ok(())
    } else {
        Err(ExecutionError::InvalidArgument(format!("timeout must be between 1 and {MAX_TIMEOUT_SECONDS} seconds")))
    }
}

pub fn validate_path_inside_root(root: &Path, target: &Path) -> Result<PathBuf, ExecutionError> {
    let canonical_root = root.canonicalize().map_err(|error| ExecutionError::InvalidPath(error.to_string()))?;
    let canonical_target = target.canonicalize().map_err(|error| ExecutionError::InvalidPath(error.to_string()))?;

    if !canonical_target.starts_with(&canonical_root) {
        if target.starts_with(root) {
            return Err(ExecutionError::SymlinkEscape(canonical_target.display().to_string()));
        }
        return Err(ExecutionError::PathEscape(canonical_target.display().to_string()));
    }

    Ok(canonical_target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_shell_metacharacters() {
        assert!(validate_args(&["safe".to_string(), "x;whoami".to_string()]).is_err());
        assert!(validate_args(&["safe".to_string()]).is_ok());
    }

    #[test]
    fn validates_timeout_range() {
        assert!(validate_timeout(0).is_err());
        assert!(validate_timeout(301).is_err());
        assert!(validate_timeout(300).is_ok());
    }

    #[test]
    fn rejects_traversal_and_absolute_escape() {
        let root = test_root("path_escape");
        let inside = root.join("inside");
        fs::create_dir_all(&inside).unwrap();
        let outside = root.parent().unwrap().join("outside");
        fs::create_dir_all(&outside).unwrap();

        assert!(validate_path_inside_root(&root, &root.join(".." ).join("outside")).is_err());
        assert!(validate_path_inside_root(&root, &outside).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        use std::os::unix::fs::symlink;
        let root = test_root("symlink_escape");
        let outside = root.parent().unwrap().join("private");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let link = root.join("data");
        symlink(&outside, &link).unwrap();

        assert!(validate_path_inside_root(&root, &link).is_err());
    }

    fn test_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("skillhub_execution_{name}"));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }
}
