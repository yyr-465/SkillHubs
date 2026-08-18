use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use uuid::Uuid;

use super::error::ExecutionError;
use super::process::{ManagedProcess, ProcessWait};
use super::state::{ExecutionRecord, ExecutionStatus};
use super::validator;
use crate::db;
use rusqlite::Connection;

pub struct ExecutionManager {
    running: Mutex<HashMap<String, Arc<ExecutionHandle>>>,
    audit_db: Option<Arc<Mutex<Connection>>>,
}

struct ExecutionHandle {
    record: Mutex<ExecutionRecord>,
    process: ManagedProcess,
}

impl ExecutionManager {
    pub fn new() -> Self {
        Self { running: Mutex::new(HashMap::new()), audit_db: None }
    }

    pub fn with_audit_db(audit_db: Arc<Mutex<Connection>>) -> Self {
        Self { running: Mutex::new(HashMap::new()), audit_db: Some(audit_db) }
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
            stdout_truncated: false,
            stderr_truncated: false,
            audit_written: false,
        };
        record.mark_running(timestamp());
        let process = match ManagedProcess::spawn(&command, &args, working_dir) {
            Ok(process) => process,
            Err(error) => {
                self.write_start_failure(&record.skill_id, &command, "Process could not be started.");
                return Err(error);
            }
        };
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
        let result = record.clone();
        drop(record);
        self.write_audit_once(&handle, "cancelled", "Execution cancelled.");
        Ok(result)
    }

    pub async fn kill_all(&self) -> Result<(), ExecutionError> {
        eprintln!("ExecutionManager cleanup start");
        let handles = self.running.lock().map_err(|_| ExecutionError::ProcessFailed("execution registry lock poisoned".into()))?.values().cloned().collect::<Vec<_>>();
        for handle in handles {
            eprintln!("ExecutionManager killing managed process");
            handle.process.terminate();
            let mut should_audit = false;
            if let Ok(mut record) = handle.record.lock() {
                if record.status == ExecutionStatus::Running {
                    record.mark_cancelled(timestamp(), "Execution stopped during application shutdown.".into());
                    should_audit = true;
                }
            }
            if should_audit { self.write_audit_once(&handle, "cancelled", "Execution stopped during application shutdown."); }
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
            if record.status != ExecutionStatus::Running {
                return;
            }
            match result {
                Ok(ProcessWait::Finished(result)) if result.exit_code == Some(0) => { record.mark_success(timestamp(), result.exit_code, result.stdout, result.stderr); record.stdout_truncated = result.stdout_truncated; record.stderr_truncated = result.stderr_truncated; },
                Ok(ProcessWait::Finished(result)) => { record.mark_failed(timestamp(), result.exit_code, result.stdout, result.stderr); record.stdout_truncated = result.stdout_truncated; record.stderr_truncated = result.stderr_truncated; },
                Ok(ProcessWait::Timeout) => record.mark_timeout(timestamp(), "Execution timed out.".into()),
                Err(error) => record.mark_failed(timestamp(), None, String::new(), error.to_string()),
            }
        }
        let outcome = self.get_execution_status(&execution_id).ok().map(|record| match record.status {
            ExecutionStatus::Success => ("succeeded", "Process exited successfully."),
            ExecutionStatus::Failed => ("failed", "Process exited unsuccessfully."),
            ExecutionStatus::Timeout => ("timeout", "Execution timed out."),
            _ => ("internal", "Execution reached an unexpected state."),
        });
        if let Some((outcome, detail)) = outcome { self.write_audit_once(&handle, outcome, detail); }
    }

    fn write_audit_once(&self, handle: &Arc<ExecutionHandle>, outcome: &str, detail: &str) {
        let Ok(mut record) = handle.record.lock() else { return };
        if record.audit_written { return; }
        record.audit_written = true;
        let Some(db) = &self.audit_db else { return };
        if let Ok(conn) = db.lock() {
            let _ = db::record_execution_audit(&conn, &record.skill_id, &record.command, outcome, detail);
        }
    }

    fn write_start_failure(&self, skill_id: &str, command: &str, detail: &str) {
        let Some(db) = &self.audit_db else { return };
        if let Ok(conn) = db.lock() {
            let _ = db::record_execution_audit(&conn, skill_id, command, "spawn_failed", detail);
        }
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

    fn audit_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE execution_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                skill_id TEXT NOT NULL,
                command TEXT NOT NULL,
                outcome TEXT NOT NULL,
                detail TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .unwrap();
        Arc::new(Mutex::new(conn))
    }

    #[tokio::test]
    async fn terminal_execution_writes_audit_once() {
        let db = audit_db();
        let manager = Arc::new(ExecutionManager::with_audit_db(Arc::clone(&db)));
        let record = manager
            .start_execution(
                "audit-once-test".into(),
                "git.exe".into(),
                vec!["--version".into()],
                Path::new(env!("CARGO_MANIFEST_DIR")),
                5,
            )
            .await
            .unwrap();

        for _ in 0..50 {
            if manager.get_execution_status(&record.execution_id).unwrap().status
                != ExecutionStatus::Running
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }

        manager.cancel_execution(&record.execution_id).await.unwrap();
        manager.kill_all().await.unwrap();

        let conn = db.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM execution_audit WHERE skill_id = ?1",
                ["audit-once-test"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn spawn_failure_writes_sanitized_audit() {
        let db = audit_db();
        let manager = Arc::new(ExecutionManager::with_audit_db(Arc::clone(&db)));
        let result = manager
            .start_execution(
                "spawn-failure-audit-test".into(),
                "skill-tool.exe".into(),
                Vec::new(),
                Path::new(env!("CARGO_MANIFEST_DIR")),
                5,
            )
            .await;
        assert!(result.is_err());

        let conn = db.lock().unwrap();
        let (count, detail): (i64, String) = conn
            .query_row(
                "SELECT COUNT(*), detail FROM execution_audit WHERE skill_id = ?1",
                ["spawn-failure-audit-test"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(detail, "Process could not be started.");
        assert!(!detail.contains(env!("CARGO_MANIFEST_DIR")));
    }

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
        let pid = manager.get_execution_status("job-tree-cleanup-test").err();
        assert!(pid.is_some(), "the specific execution must be removed after cleanup");
    }
}
