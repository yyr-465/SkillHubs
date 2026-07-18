use super::error::ExecutionError;

const ALLOWED_BINARIES: &[&str] = &["git.exe", "skill-tool.exe"];

pub fn normalize_executable_name(executable: &str) -> Result<String, ExecutionError> {
    let name = executable.trim();
    if name.is_empty() || name.contains(['/', '\\']) {
        return Err(ExecutionError::InvalidExecutable(executable.to_string()));
    }

    let normalized = if name.to_ascii_lowercase().ends_with(".exe") {
        name.to_ascii_lowercase()
    } else {
        format!("{}.exe", name.to_ascii_lowercase())
    };

    Ok(normalized)
}

pub fn validate_executable(executable: &str) -> Result<(), ExecutionError> {
    let normalized = normalize_executable_name(executable)?;
    if ALLOWED_BINARIES.contains(&normalized.as_str()) {
        Ok(())
    } else {
        Err(ExecutionError::ExecutableNotAllowed(normalized))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_executable_names() {
        assert_eq!(normalize_executable_name("Git.EXE").unwrap(), "git.exe");
        assert_eq!(normalize_executable_name("git").unwrap(), "git.exe");
        assert_eq!(normalize_executable_name("git.exe").unwrap(), "git.exe");
    }

    #[test]
    fn rejects_interpreters_and_shells() {
        for executable in [
            "python.exe", "python", "python3.exe", "node.exe", "node", "cmd.exe",
            "powershell.exe", "npm", "npx", "bash", "sh",
        ] {
            assert!(validate_executable(executable).is_err(), "{executable} must be rejected");
        }
    }

    #[test]
    fn allows_registered_binary() {
        assert!(validate_executable("skill-tool.exe").is_ok());
        assert!(validate_executable("SKILL-TOOL").is_ok());
    }
}
