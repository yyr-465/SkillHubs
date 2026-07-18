use std::path::PathBuf;

use crate::models::{ExecutionSpec, ExecutionPreview, Skill};
use super::error::ExecutionError;
use super::validator;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedExecutionRequest {
    pub skill_id: String,
    pub executable: String,
    pub args: Vec<String>,
    pub working_dir: PathBuf,
    pub timeout_seconds: u64,
}

pub fn prepare_execution(skill: &Skill) -> Result<Option<ValidatedExecutionRequest>, ExecutionError> {
    let skill_root = PathBuf::from(&skill.source_path);
    let skill_file = skill_root.join("SKILL.md");
    let front_matter = crate::parser::parse_skill_md(&skill_file).map_err(ExecutionError::InvalidArgument)?;
    let Some(spec) = front_matter.execution else { return Ok(None); };
    prepare_spec(skill, spec).map(Some)
}

pub fn prepare_spec(skill: &Skill, spec: ExecutionSpec) -> Result<ValidatedExecutionRequest, ExecutionError> {
    validator::validate_executable(&spec.command)?;
    validator::validate_args(&spec.args)?;
    validator::validate_timeout(spec.timeout_seconds)?;

    let skill_root = PathBuf::from(&skill.source_path);
    let requested_working_dir = spec.working_dir.as_deref().map(|path| skill_root.join(path)).unwrap_or_else(|| skill_root.clone());
    let working_dir = validator::validate_path_inside_root(&skill_root, &requested_working_dir)?;

    Ok(ValidatedExecutionRequest {
        skill_id: skill.id.clone(),
        executable: spec.command,
        args: spec.args,
        working_dir,
        timeout_seconds: spec.timeout_seconds,
    })
}

pub fn preview(skill: &Skill) -> Result<Option<ExecutionPreview>, ExecutionError> {
    let prepared = prepare_execution(skill)?;
    let Some(prepared) = prepared else { return Ok(None); };
    Ok(Some(ExecutionPreview {
        skill_id: prepared.skill_id,
        spec: ExecutionSpec {
            command: prepared.executable,
            args: prepared.args,
            working_dir: Some(prepared.working_dir.to_string_lossy().into_owned()),
            timeout_seconds: prepared.timeout_seconds,
            requires_confirmation: true,
        },
        executable: true,
        reason: None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_interpreter_and_path_escape_before_execution() {
        let root = std::env::temp_dir().join("skillhub_preparation_test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let skill = Skill {
            id: "demo".into(), name: "Demo".into(), description: String::new(), category: None,
            risk: None, date_added: None, source_path: root.to_string_lossy().into_owned(),
            source: "test".into(), favorite: None, icon: None,
        };
        let spec = ExecutionSpec {
            command: "python.exe".into(), args: vec![], working_dir: Some("..".into()),
            timeout_seconds: 300, requires_confirmation: true,
        };
        assert!(prepare_spec(&skill, spec).is_err());
    }
}
