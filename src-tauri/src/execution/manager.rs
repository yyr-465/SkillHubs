use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use uuid::Uuid;

use super::error::ExecutionError;
use super::process::{ManagedProcess, ProcessWait};
use super::state::{ExecutionRecord, ExecutionStatus};
use super::validator;

pub struct ExecutionManager {
    running: Mutex<HashMap<String, Arc<ExecutionHandle>>>,
}

struct ExecutionHandle {
    record: Mutex<ExecutionRecord>,
    process: ManagedProcess,
}

impl ExecutionManager {
    pub fn new() -> Self {
        Self { running: Mutex::new(HashMap::new()) }
    }

    pub async fn start_execution(
        self: &Arc<Self>,
        skill_id: String,
        command: String,
        args: Vec<String>,
        working_dir: &Path,
        timeout_seconds: u64,
    ) -> Result<ExecutionRecord, ExecutionError> {
        validator::validate_executable(&command)?;
        validator::validate_args(&args)?;
        validator::validate_timeout(timeout_seconds)?;

        {
            let running = self.running.lock().map_err(|_| ExecutionError::ProcessFailed("execution registry lock poisoned".into()))?;
            if running.values().any(|handle| {
                let record = handle.record.lock().ok();
                record.is_some_and(|record| record.skill_id == skill_id && record.status == ExecutionStatus::Running)
            }) {
                return Err(ExecutionError::ExecutionAlreadyRunning);
            }
        }

        let execution_id = Uuid::new_v4().to_string();
        let mut record = ExecutionRecord {
            execution_id: execution_id.clone(),
            skill_id,
            command: command.clone(),
            args: args.clone(),
            status: ExecutionStatus::Preview,
            started_at: None,
            finished_at: None,
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
        };
        record.mark_running(timestamp());
        let process = ManagedProcess::spawn(&command, &args, working_dir)?;
        let handle = Arc::new(ExecutionHandle { record: Mutex::new(record.clone()), process });
        self.running.lock().map_err(|_| ExecutionError::ProcessFailed("execution registry lock poisoned".into()))?.insert(execution_id.clone(), Arc::clone(&handle));

        let manager = Arc::clone(self);
        tokio::spawn(async move {
            manager.finish_execution(execution_id, handle, timeout_seconds).await;
        });
        Ok(record)
    }

    pub fn get_execution_status(&self, execution_id: &str) -> Result<ExecutionRecord, ExecutionError> {
        let running = self.running.lock().map_err(|_| ExecutionError::ProcessFailed("execution registry lock poisoned".into()))?;
        let handle = running.get(execution_id).ok_or_else(|| ExecutionError::ExecutionNotFound(execution_id.to_string()))?;
        handle.record.lock().map(|record| record.clone()).map_err(|_| ExecutionError::ProcessFailed("execution record lock poisoned".into()))
    }

    pub async fn cancel_execution(&self, execution_id: &str) -> Result<ExecutionRecord, ExecutionError> {
        let handle = {
            let running = self.running.lock().map_err(|_| ExecutionError::ProcessFailed("execution registry lock poisoned".into()))?;
            Arc::clone(running.get(execution_id).ok_or_else(|| ExecutionError::ExecutionNotFound(execution_id.to_string()))?)
        };
        let is_running = handle.record.lock().map(|record| record.status == ExecutionStatus::Running).map_err(|_| ExecutionError::ProcessFailed("execution record lock poisoned".into()))?;
        if !is_running {
            return self.get_execution_status(execution_id);
        }
        handle.process.kill().await?;
        let mut record = handle.record.lock().map_err(|_| ExecutionError::ProcessFailed("execution record lock poisoned".into()))?;
        record.mark_cancelled(timestamp(), "Execution cancelled.".into());
        Ok(record.clone())
    }

    pub async fn kill_all(&self) -> Result<(), ExecutionError> {
        eprintln!("ExecutionManager cleanup start");
        let handles = self.running.lock().map_err(|_| ExecutionError::ProcessFailed("execution registry lock poisoned".into()))?.values().cloned().collect::<Vec<_>>();
        for handle in handles {
            eprintln!("ExecutionManager killing managed process");
            handle.process.terminate();
            if let Ok(mut record) = handle.record.lock() {
                if record.status == ExecutionStatus::Running {
                    record.mark_cancelled(timestamp(), "Execution stopped during application shutdown.".into());
                }
            }
        }
        self.running.lock().map_err(|_| ExecutionError::ProcessFailed("execution registry lock poisoned".into()))?.clear();
        eprintln!("ExecutionManager cleanup finished");
        Ok(())
    }

    async fn finish_execution(&self, execution_id: String, handle: Arc<ExecutionHandle>, timeout_seconds: u64) {
        let result = async {
            handle.process.wait_with_timeout(Duration::from_secs(timeout_seconds)).await
        }.await;
        if let Ok(mut record) = handle.record.lock() {
            match result {
                Ok(ProcessWait::Finished(result)) if result.exit_code == Some(0) => record.mark_success(timestamp(), result.exit_code, result.stdout, result.stderr),
                Ok(ProcessWait::Finished(result)) => record.mark_failed(timestamp(), result.exit_code, result.stdout, result.stderr),
                Ok(ProcessWait::Timeout) => record.mark_timeout(timestamp(), "Execution timed out.".into()),
                Err(error) => record.mark_failed(timestamp(), None, String::new(), error.to_string()),
            }
        }
        let _ = execution_id;
    }
}

impl Default for ExecutionManager {
    fn default() -> Self { Self::new() }
}

fn timestamp() -> String {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn finished_process_remains_owned_until_cleanup() {
        let manager = Arc::new(ExecutionManager::new());
        let record = manager
            .start_execution(
                "finished-cleanup-test".into(),
                "git.exe".into(),
                vec!["--version".into()],
                Path::new(env!("CARGO_MANIFEST_DIR")),
                5,
            )
            .await
            .unwrap();

        for _ in 0..50 {
            if manager.get_execution_status(&record.execution_id).unwrap().status != ExecutionStatus::Running {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }

        assert_eq!(manager.get_execution_status(&record.execution_id).unwrap().status, ExecutionStatus::Success);
        manager.kill_all().await.unwrap();
        assert!(matches!(manager.get_execution_status(&record.execution_id), Err(ExecutionError::ExecutionNotFound(_))));
    }

    #[tokio::test]
    async fn finished_execution_should_not_block_cleanup() {
        let manager = Arc::new(ExecutionManager::new());
        manager
            .start_execution(
                "long-cleanup-test".into(),
                "git.exe".into(),
                vec!["cat-file".into(), "--batch".into()],
                Path::new(env!("CARGO_MANIFEST_DIR")),
                300,
            )
            .await
            .unwrap();

        let started = std::time::Instant::now();
        manager.kill_all().await.unwrap();
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn cleanup_should_kill_job_tree() {
        let manager = Arc::new(ExecutionManager::new());
        manager
            .start_execution(
                "job-tree-cleanup-test".into(),
                "git.exe".into(),
                vec!["cat-file".into(), "--batch".into()],
                Path::new(env!("CARGO_MANIFEST_DIR")),
                300,
            )
            .await
            .unwrap();

        manager.kill_all().await.unwrap();
        let output = std::process::Command::new("tasklist").output().unwrap();
        let processes = String::from_utf8_lossy(&output.stdout);
        assert!(!processes.to_ascii_lowercase().contains("git.exe"));
    }
}
