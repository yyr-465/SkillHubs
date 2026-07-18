/// Owns a Windows Job Object so descendants are cleaned up with the managed process.
pub struct ProcessGroup {
    #[cfg(windows)]
    job: usize,
}

unsafe impl Send for ProcessGroup {}
unsafe impl Sync for ProcessGroup {}

impl ProcessGroup {
    #[cfg(windows)]
    pub fn new(process_id: u32) -> std::io::Result<Self> {
        use std::ptr::null_mut;

        unsafe {
            let job = CreateJobObjectW(null_mut(), null_mut());
            if job.is_null() {
                return Err(std::io::Error::last_os_error());
            }
            let process = OpenProcess(PROCESS_TERMINATE | PROCESS_SET_QUOTA, 0, process_id);
            if process.is_null() || AssignProcessToJobObject(job, process) == 0 {
                let error = std::io::Error::last_os_error();
                if !process.is_null() { CloseHandle(process); }
                CloseHandle(job);
                return Err(error);
            }
            CloseHandle(process);
            Ok(Self { job: job as usize })
        }
    }

    #[cfg(not(windows))]
    pub fn new(_process_handle: ()) -> std::io::Result<Self> {
        Ok(Self {})
    }

    pub fn terminate(&self) -> std::io::Result<()> {
        #[cfg(windows)]
        unsafe {
            if TerminateJobObject(self.job as *mut std::ffi::c_void, 1) == 0 {
                return Err(std::io::Error::last_os_error());
            }
        }
        Ok(())
    }
}

#[cfg(windows)]
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.job as *mut std::ffi::c_void); }
    }
}

#[cfg(windows)]
extern "system" {
    fn CreateJobObjectW(attributes: *mut std::ffi::c_void, name: *const u16) -> *mut std::ffi::c_void;
    fn AssignProcessToJobObject(job: *mut std::ffi::c_void, process: *mut std::ffi::c_void) -> i32;
    fn OpenProcess(access: u32, inherit_handle: i32, process_id: u32) -> *mut std::ffi::c_void;
    fn TerminateJobObject(job: *mut std::ffi::c_void, exit_code: u32) -> i32;
    fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
}

#[cfg(windows)]
const PROCESS_TERMINATE: u32 = 0x0001;
#[cfg(windows)]
const PROCESS_SET_QUOTA: u32 = 0x0100;
