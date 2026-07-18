use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ExecutionError {
    #[error("invalid executable: {0}")]
    InvalidExecutable(String),
    #[error("executable is not allowed: {0}")]
    ExecutableNotAllowed(String),
    #[error("invalid argument: {0}")]
    InvalidArgument(String),
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("path escapes the skill root: {0}")]
    PathEscape(String),
    #[error("path escapes through a symlink: {0}")]
    SymlinkEscape(String),
    #[error("execution is already running")]
    ExecutionAlreadyRunning,
    #[error("execution not found: {0}")]
    ExecutionNotFound(String),
    #[error("execution timed out")]
    Timeout,
    #[error("process failed: {0}")]
    ProcessFailed(String),
    #[error("execution was cancelled")]
    Cancelled,
}
