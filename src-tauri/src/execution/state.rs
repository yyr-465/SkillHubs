use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ExecutionStatus {
    Preview,
    Running,
    Success,
    Failed,
    Cancelled,
    Timeout,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExecutionRecord {
    pub execution_id: String,
    pub skill_id: String,
    pub command: String,
    pub args: Vec<String>,
    pub status: ExecutionStatus,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
    #[serde(skip)]
    pub audit_written: bool,
}

impl ExecutionRecord {
    pub fn mark_running(&mut self, started_at: String) {
        self.status = ExecutionStatus::Running;
        self.started_at = Some(started_at);
    }

    pub fn mark_success(&mut self, finished_at: String, exit_code: Option<i32>, stdout: String, stderr: String) {
        self.finish(ExecutionStatus::Success, finished_at, exit_code, stdout, stderr);
    }

    pub fn mark_failed(&mut self, finished_at: String, exit_code: Option<i32>, stdout: String, stderr: String) {
        self.finish(ExecutionStatus::Failed, finished_at, exit_code, stdout, stderr);
    }

    pub fn mark_cancelled(&mut self, finished_at: String, stderr: String) {
        self.finish(ExecutionStatus::Cancelled, finished_at, None, String::new(), stderr);
    }

    pub fn mark_timeout(&mut self, finished_at: String, stderr: String) {
        self.finish(ExecutionStatus::Timeout, finished_at, None, String::new(), stderr);
    }

    fn finish(&mut self, status: ExecutionStatus, finished_at: String, exit_code: Option<i32>, stdout: String, stderr: String) {
        self.status = status;
        self.finished_at = Some(finished_at);
        self.exit_code = exit_code;
        self.stdout = stdout;
        self.stderr = stderr;
        self.stdout_truncated = false;
        self.stderr_truncated = false;
    }
}
