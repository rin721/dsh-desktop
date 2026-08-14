#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::{OsStr, OsString, c_void};
use std::io;
use std::mem::{size_of, zeroed};
use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;
use std::ptr::null;

use windows_sys::Win32::Foundation::{CloseHandle, FALSE, HANDLE, WAIT_OBJECT_0};
use windows_sys::Win32::System::Console::{
    GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    SetInformationJobObject, TerminateJobObject,
};
use windows_sys::Win32::System::Threading::{
    CreateProcessW, GetExitCodeProcess, OpenProcess, ResumeThread, TerminateProcess,
    WaitForMultipleObjects,
    CREATE_NO_WINDOW, CREATE_SUSPENDED, INFINITE, PROCESS_INFORMATION, STARTF_USESTDHANDLES,
    STARTUPINFOW,
};

const PROCESS_SYNCHRONIZE: u32 = 0x0010_0000;

struct OwnedHandle(HANDLE);

impl OwnedHandle {
    fn new(handle: HANDLE, operation: &'static str) -> io::Result<Self> {
        if handle.is_null() {
            Err(io::Error::new(
                io::ErrorKind::Other,
                format!("{operation} 失败：{}", io::Error::last_os_error()),
            ))
        } else {
            Ok(Self(handle))
        }
    }

    fn raw(&self) -> HANDLE {
        self.0
    }
}

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        // SAFETY: OwnedHandle 只接收有效且由当前进程拥有的 Windows HANDLE。
        unsafe {
            CloseHandle(self.0);
        }
    }
}

struct Options {
    parent_pid: u32,
    cwd: PathBuf,
    program: OsString,
    arguments: Vec<OsString>,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("dsh-desktop-launcher：{error}");
        std::process::exit(1);
    }
}

fn run() -> io::Result<()> {
    let options = parse_options()?;

    // 先持有精确的父进程句柄，避免仅凭 PID 轮询产生复用竞态。
    let parent = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, FALSE, options.parent_pid) };
    let parent = OwnedHandle::new(parent, "打开父进程")?;

    let job = unsafe { CreateJobObjectW(null(), null()) };
    let job = OwnedHandle::new(job, "创建 Job Object")?;
    configure_job(&job)?;

    let mut command_line = encode_command_line(&options.program, &options.arguments);
    let application_name = to_wide_nul(&options.program);
    let current_directory = to_wide_nul(options.cwd.as_os_str());

    let mut startup: STARTUPINFOW = unsafe { zeroed() };
    startup.cb = size_of::<STARTUPINFOW>() as u32;
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdInput = unsafe { GetStdHandle(STD_INPUT_HANDLE) };
    startup.hStdOutput = unsafe { GetStdHandle(STD_OUTPUT_HANDLE) };
    startup.hStdError = unsafe { GetStdHandle(STD_ERROR_HANDLE) };

    let mut process: PROCESS_INFORMATION = unsafe { zeroed() };
    let created = unsafe {
        CreateProcessW(
            application_name.as_ptr(),
            command_line.as_mut_ptr(),
            null(),
            null(),
            1,
            CREATE_NO_WINDOW | CREATE_SUSPENDED,
            null(),
            current_directory.as_ptr(),
            &startup,
            &mut process,
        )
    };
    if created == FALSE {
        return Err(last_error("创建受管子进程"));
    }

    let child_process = OwnedHandle::new(process.hProcess, "接收子进程句柄")?;
    let child_thread = OwnedHandle::new(process.hThread, "接收子线程句柄")?;

    let assigned = unsafe { AssignProcessToJobObject(job.raw(), child_process.raw()) };
    if assigned == FALSE {
        // 进程尚处于挂起状态且未归属 Job Object，必须在返回前显式回收。
        unsafe {
            TerminateProcess(child_process.raw(), 1);
        }
        return Err(last_error("将子进程加入 Job Object"));
    }

    let resumed = unsafe { ResumeThread(child_thread.raw()) };
    if resumed == u32::MAX {
        return Err(last_error("恢复受管子进程"));
    }

    let handles = [child_process.raw(), parent.raw()];
    let wait_result = unsafe { WaitForMultipleObjects(2, handles.as_ptr(), FALSE, INFINITE) };
    if wait_result == WAIT_OBJECT_0 + 1 {
        // 父进程消失时终止整棵 Harness 进程树，防止孤儿进程残留。
        let terminated = unsafe { TerminateJobObject(job.raw(), 1) };
        if terminated == FALSE {
            return Err(last_error("终止孤儿进程树"));
        }
        let child_wait = unsafe { WaitForMultipleObjects(1, handles.as_ptr(), FALSE, INFINITE) };
        if child_wait != WAIT_OBJECT_0 {
            return Err(last_error("等待受管子进程退出"));
        }
    } else if wait_result != WAIT_OBJECT_0 {
        return Err(last_error("等待父进程或受管子进程"));
    }

    let mut exit_code = 1_u32;
    let got_exit_code = unsafe { GetExitCodeProcess(child_process.raw(), &mut exit_code) };
    if got_exit_code == FALSE {
        return Err(last_error("读取受管子进程退出码"));
    }

    std::process::exit(exit_code as i32);
}

fn configure_job(job: &OwnedHandle) -> io::Result<()> {
    let mut information: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
    information.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let configured = unsafe {
        SetInformationJobObject(
            job.raw(),
            JobObjectExtendedLimitInformation,
            &information as *const _ as *const c_void,
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if configured == FALSE {
        Err(last_error("配置 Job Object"))
    } else {
        Ok(())
    }
}

fn parse_options() -> io::Result<Options> {
    let mut arguments = std::env::args_os().skip(1);

    if arguments.next().as_deref() != Some(OsStr::new("--parent-pid")) {
        return Err(invalid_arguments());
    }
    let parent_pid = arguments
        .next()
        .and_then(|value| value.to_str().and_then(|value| value.parse::<u32>().ok()))
        .filter(|value| *value > 0)
        .ok_or_else(invalid_arguments)?;

    if arguments.next().as_deref() != Some(OsStr::new("--cwd")) {
        return Err(invalid_arguments());
    }
    let cwd = arguments.next().map(PathBuf::from).ok_or_else(invalid_arguments)?;
    if !cwd.is_absolute() || !cwd.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "工作目录必须是已经存在的绝对目录",
        ));
    }

    if arguments.next().as_deref() != Some(OsStr::new("--")) {
        return Err(invalid_arguments());
    }
    let program = arguments.next().ok_or_else(invalid_arguments)?;
    let arguments = arguments.collect::<Vec<_>>();

    Ok(Options {
        parent_pid,
        cwd,
        program,
        arguments,
    })
}

fn invalid_arguments() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        "用法：dsh-desktop-launcher --parent-pid <PID> --cwd <绝对路径> -- <程序> [参数...]",
    )
}

fn last_error(operation: &'static str) -> io::Error {
    io::Error::new(
        io::ErrorKind::Other,
        format!("{operation}失败：{}", io::Error::last_os_error()),
    )
}

fn to_wide_nul(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(Some(0)).collect()
}

fn encode_command_line(program: &OsStr, arguments: &[OsString]) -> Vec<u16> {
    let mut result = Vec::<u16>::new();
    append_quoted_argument(&mut result, program);
    for argument in arguments {
        result.push(b' ' as u16);
        append_quoted_argument(&mut result, argument);
    }
    result.push(0);
    result
}

// 遵循 CommandLineToArgvW 的反斜杠与引号规则，保留空参数及路径尾部反斜杠。
fn append_quoted_argument(target: &mut Vec<u16>, value: &OsStr) {
    let units = value.encode_wide().collect::<Vec<_>>();
    let needs_quotes = units.is_empty()
        || units
            .iter()
            .any(|unit| matches!(*unit, 0x20 | 0x09 | 0x22));
    if !needs_quotes {
        target.extend(units);
        return;
    }

    target.push(b'"' as u16);
    let mut backslashes = 0_usize;
    for unit in units {
        if unit == b'\\' as u16 {
            backslashes += 1;
            continue;
        }
        if unit == b'"' as u16 {
            target.extend(std::iter::repeat_n(b'\\' as u16, backslashes * 2 + 1));
            target.push(unit);
            backslashes = 0;
            continue;
        }
        target.extend(std::iter::repeat_n(b'\\' as u16, backslashes));
        backslashes = 0;
        target.push(unit);
    }
    target.extend(std::iter::repeat_n(b'\\' as u16, backslashes * 2));
    target.push(b'"' as u16);
}
