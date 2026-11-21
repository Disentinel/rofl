//! The memory wall's watcher: `rofl::engine::MEMORY_FULL` set while the process is near the memory it may use, so an
//! evaluation stops and answers partial (`memory_exhausted`) instead of being killed. What it may use is, in order:
//! the memory limit of its cgroup (v2 `memory.max`, v1 `memory.limit_in_bytes`, the least on the way to the root) less
//! a quarter, against the cgroup's anonymous and shared memory, which is what neither a cache nor a file gives back
//! (a segment cooled to a `/tmp` of tmpfs is shared memory); else what the machine has available (Linux
//! `MemAvailable`) down to a quarter of it; else, on macOS, four fifths of the machine against this process's physical
//! footprint, what the system counts against it (twice its live heap at 493 vscode files). Siblings in the same cgroup
//! (the Node of a notebook) count against it.
//!
//! THE EDGE. The kernel kills at the limit itself, and an evaluation stops only at its next step or premise: a step
//! that takes more than the quarter left passes the wall. So the watcher keeps the largest rise it has seen between
//! two looks, and when the next such rise would reach the edge while the evaluation has not stopped, it says so and
//! ends the process itself, exit 5, before the kernel does it without a word.
use rofl::engine::{MEMORY_FULL, MEMORY_LIMIT, MEMORY_USED};
use std::sync::atomic::Ordering::Relaxed;

const RESERVE_MIN: i64 = 256 << 20;

/// Used, may-use and the edge where the system takes the memory back by killing, in bytes, as measured now.
type Measure = Box<dyn Fn() -> Option<(i64, i64, i64)> + Send>;

fn read(p: &str) -> Option<String> {
    std::fs::read_to_string(p).ok()
}

/// The sum of the keys of the cgroup's `memory.stat`, each of which it must hold.
fn stat(dir: &str, keys: &[&str]) -> Option<i64> {
    let text = read(&format!("{dir}/memory.stat"))?;
    keys.iter().map(|k| text.lines().find_map(|l| l.strip_prefix(k)?.strip_prefix(' ')?.trim().parse::<i64>().ok())).sum()
}

/// The cgroup directory holding the least memory limit above this process, with the limit.
fn cgroup() -> Option<(String, i64, bool)> {
    let own = read("/proc/self/cgroup")?;
    let (root, path, v2) = own.lines().find_map(|l| {
        let mut f = l.splitn(3, ':');
        let (_, ctl, path) = (f.next()?, f.next()?, f.next()?);
        if ctl.split(',').any(|c| c == "memory") {
            Some(("/sys/fs/cgroup/memory", path, false))
        } else if ctl.is_empty() && std::path::Path::new("/sys/fs/cgroup/cgroup.controllers").exists() {
            Some(("/sys/fs/cgroup", path, true))
        } else {
            None
        }
    })?;
    let mut dir = format!("{root}{}", path.trim_end_matches('/'));
    let mut best: Option<(String, i64)> = None;
    loop {
        let limit = read(&format!("{dir}/{}", if v2 { "memory.max" } else { "memory.limit_in_bytes" })).and_then(|t| t.trim().parse::<i64>().ok());
        if let Some(l) = limit.filter(|l| *l < 1 << 60) {
            if best.as_ref().is_none_or(|(_, b)| l < *b) {
                best = Some((dir.clone(), l));
            }
        }
        if dir.len() <= root.len() {
            break;
        }
        dir.truncate(dir.rfind('/').unwrap_or(root.len()).max(root.len()));
    }
    best.map(|(d, l)| (d, l, v2))
}

fn meminfo(key: &str) -> Option<i64> {
    read("/proc/meminfo")?.lines().find_map(|l| l.strip_prefix(key)?.trim().strip_suffix("kB")?.trim().parse::<i64>().ok().map(|k| k << 10))
}

#[cfg(target_os = "macos")]
fn machine() -> Option<i64> {
    let (mut n, mut len) = (0i64, std::mem::size_of::<i64>());
    let ok = unsafe { libc::sysctlbyname(c"hw.memsize".as_ptr(), &mut n as *mut i64 as *mut libc::c_void, &mut len, std::ptr::null_mut(), 0) };
    (ok == 0).then_some(n)
}

/// What the system counts against this process: its physical footprint.
#[cfg(target_os = "macos")]
fn footprint() -> Option<i64> {
    let mut info: libc::rusage_info_v2 = unsafe { std::mem::zeroed() };
    let ok = unsafe { libc::proc_pid_rusage(std::process::id() as i32, libc::RUSAGE_INFO_V2, &mut info as *mut _ as *mut libc::rusage_info_t) };
    (ok == 0).then_some(info.ri_phys_footprint as i64)
}

#[cfg(not(target_os = "macos"))]
fn machine() -> Option<i64> {
    None
}

#[cfg(not(target_os = "macos"))]
fn footprint() -> Option<i64> {
    None
}

fn measure() -> Option<Measure> {
    if let Some((dir, limit, v2)) = cgroup() {
        let keys: &[&str] = if v2 { &["anon", "shmem"] } else { &["total_rss", "total_shmem"] };
        stat(&dir, keys)?;
        let may = limit - (limit / 4).max(RESERVE_MIN.min(limit / 2));
        return Some(Box::new(move || stat(&dir, keys).map(|u| (u, may, limit))));
    }
    if let (Some(_), Some(total)) = (meminfo("MemAvailable:"), meminfo("MemTotal:")) {
        let reserve = (total / 4).max(RESERVE_MIN);
        return Some(Box::new(move || meminfo("MemAvailable:").map(|a| (total - a, total - reserve, total))));
    }
    let total = machine()?;
    footprint()?;
    Some(Box::new(move || footprint().map(|u| (u, total / 5 * 4, total))))
}

/// Starts the watcher; without a measure there is no wall, as before. `answers`: whether stdout carries a question
/// verb's answers, and in JSON, so that a process ended at the edge leaves a partial answer there.
pub fn watch(answers: Option<bool>) {
    let Some(m) = measure() else { return };
    std::thread::spawn(move || {
        let (mut last, mut leap) = (i64::MAX, 0i64);
        loop {
            if let Some((used, may, edge)) = m() {
                leap = leap.max(used - last);
                last = used;
                MEMORY_USED.store(used, Relaxed);
                MEMORY_LIMIT.store(may, Relaxed);
                MEMORY_FULL.store(used >= may, Relaxed);
                if used >= may && used + leap >= edge {
                    let gb = crate::load::gb;
                    eprintln!("the world reached the memory this process may use ({} of {}) and did not stop before the edge where the system kills it ({}, rising up to {} between two looks): the process ends here, without an answer; ask over fewer files", gb(used), gb(may), gb(edge), gb(leap));
                    if let Some(n) = crate::load::narrowing() { eprintln!("{n}"); }
                    match answers {
                        Some(true) => println!("{}", serde_json::json!({ "ok": true, "vars": [], "rows": [], "partial": true })),
                        Some(false) => println!("{}\n(empty)\n[partial: the memory ran out before the world could stop; no answer]", crate::load::PARTIAL_HEAD),
                        None => {}
                    }
                    std::process::exit(crate::load::PARTIAL);
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
    });
}
