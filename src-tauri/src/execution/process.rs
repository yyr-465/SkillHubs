use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Child;
use tokio::sync::Mutex as AsyncMutex;
use super::process_group::ProcessGroup;

use super::error::ExecutionError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
}

const MAX_OUTPUT_BYTES: usize = 16 * 1024;

fn bounded_output(bytes: &[u8]) -> (String, bool) {
    let truncated = bytes.len() > MAX_OUTPUT_BYTES;
    let end = bytes.len().min(MAX_OUTPUT_BYTES);
    (String::from_utf8_lossy(&bytes[..end]).into_owned(), truncated)
}

pub struct ManagedProcess {
    child: AsyncMutex<Option<Child>>,
    group: ProcessGroup,
}

impl ManagedProcess {
    pub fn spawn(executable: &str, args: &[String], working_dir: &Path) -> Result<Self, ExecutionError> {
        let child = tokio::process::Command::new(executable)
            .args(args)
            .current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| ExecutionError::ProcessFailed(error.to_string()))?;
        #[cfg(windows)]
        let group = ProcessGroup::new(child.id().ok_or_else(|| ExecutionError::ProcessFailed("process id unavailable".into()))?)
            .map_err(|error| ExecutionError::ProcessFailed(format!("failed to assign process job: {error}")))?;
        #[cfg(not(windows))]
        let group = ProcessGroup::new(())
            .map_err(|error| ExecutionError::ProcessFailed(format!("failed to create process group: {error}")))?;
        Ok(Self { child: AsyncMutex::new(Some(child)), group })
    }

    pub async fn wait(&self) -> Result<ProcessResult, ExecutionError> {
        let child = self.child.lock().await.take().ok_or_else(|| ExecutionError::ProcessFailed("process already consumed".into()))?;
        let output = child
            .wait_with_output()
            .await
            .map_err(|error| ExecutionError::ProcessFailed(error.to_string()))?;
        Ok(ProcessResult {
            stdout: bounded_output(&output.stdout).0,
            stderr: bounded_output(&output.stderr).0,
            exit_code: output.status.code(),
            stdout_truncated: output.stdout.len() > MAX_OUTPUT_BYTES,
            stderr_truncated: output.stderr.len() > MAX_OUTPUT_BYTES,
        })
    }

    pub async fn wait_with_timeout(&self, timeout: Duration) -> Result<ProcessWait, ExecutionError> {
        tokio::select! {
            result = self.wait() => result.map(ProcessWait::Finished),
            _ = tokio::time::sleep(timeout) => {
                self.kill().await?;
                Ok(ProcessWait::Timeout)
            }
        }
    }

    pub async fn kill(&self) -> Result<(), ExecutionError> {
        self.terminate();
        Ok(())
    }

    pub fn terminate(&self) {
        let _ = self.group.terminate();
    }
}

pub enum ProcessWait {
    Finished(ProcessResult),
    Timeout,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn spawns_and_captures_output() {
        let executable = std::env::current_exe().unwrap();
        let process = ManagedProcess::spawn(
            executable.to_str().unwrap(),
            &["--help".to_string()],
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")),
        )
        .unwrap();
        let result = process.wait().await.unwrap();
        assert!(result.exit_code.is_some());
    }
}
