//! The memory wall's watcher: `rofl::engine::MEMORY_FULL` set while the process is near the memory it may use, so an
//! evaluation stops and answers partial (`memory_exhausted`) instead of being killed. What it may use is, in order:
//! the memory limit of its cgroup (v2 `memory.max`, v1 `memory.limit_in_bytes`, the least on the way to the root) less
//! a tenth, against the cgroup's anonymous memory, which is what neither a cache nor a file gives back; else what the
//! machine has available (Linux `MemAvailable`) down to a tenth of it; else four fifths of the machine's memory against
//! this process's live heap (`seed::LIVE`). Siblings in the same cgroup (the Node of a notebook) count against it.
use rofl::engine::{MEMORY_FULL, MEMORY_LIMIT, MEMORY_USED};
use std::sync::atomic::Ordering::Relaxed;

const RESERVE_MIN: i64 = 256 << 20;

/// Used and may-use, in bytes, as measured now.
type Measure = Box<dyn Fn() -> Option<(i64, i64)> + Send>;

fn read(p: &str) -> Option<String> {
    std::fs::read_to_string(p).ok()
}

fn stat(dir: &str, key: &str) -> Option<i64> {
    read(&format!("{dir}/memory.stat"))?.lines().find_map(|l| l.strip_prefix(key)?.strip_prefix(' ')?.trim().parse().ok())
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

#[cfg(not(target_os = "macos"))]
fn machine() -> Option<i64> {
    meminfo("MemTotal:")
}

fn measure() -> Option<Measure> {
    if let Some((dir, limit, v2)) = cgroup() {
        let key = if v2 { "anon" } else { "total_rss" };
        stat(&dir, key)?;
        let may = limit - (limit / 4).max(RESERVE_MIN.min(limit / 2));
        return Some(Box::new(move || stat(&dir, key).map(|u| (u, may))));
    }
    if let (Some(_), Some(total)) = (meminfo("MemAvailable:"), meminfo("MemTotal:")) {
        let reserve = (total / 4).max(RESERVE_MIN);
        return Some(Box::new(move || meminfo("MemAvailable:").map(|a| (total - a, total - reserve))));
    }
    let may = machine()? / 5 * 4;
    Some(Box::new(move || Some((crate::seed::LIVE.load(Relaxed) as i64, may))))
}

/// Starts the watcher; without a measure there is no wall, as before.
pub fn watch() {
    let Some(m) = measure() else { return };
    std::thread::spawn(move || loop {
        if let Some((used, may)) = m() {
            MEMORY_USED.store(used, Relaxed);
            MEMORY_LIMIT.store(may, Relaxed);
            MEMORY_FULL.store(used >= may, Relaxed);
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    });
}
