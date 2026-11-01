//! A WORLD KEPT ON DISK (docs/cli.md, "A world kept on disk"): `--kept F` names a volume that holds the world the
//! run's files make, evaluated. With no file at F the world is evaluated and kept there; with one, the questions are
//! answered from it in a new process without evaluating again, but only while it is the world the files make now.
//!
//! The volume's note (`volume::check`) is the record of what it was kept from: the world's files and walls as the
//! run gave them, every file read on the way to its rules (a `.rofl.md` and what it reads, the vocabulary of its
//! tree), every path its scanners named as read, the engine's binary and the environment the engine reads. A kept
//! world one of those moved under is STALE AND IS REFUSED, naming what moved (the owner, 2026-10-21): it is never
//! loaded and never silently evaluated again; `--anew` evaluates it again and keeps it over the old one.
use rofl::arena::Sum;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// What the engine reads from the environment that changes a world (`kernel.rs`, `engine/vclosure.rs`).
const ENV: [&str; 2] = ["ROFL_KERNEL_OVERRIDE", "ROFL_NO_VCLOSURE"];

/// What a kept world was kept from, as its volume's note holds it.
pub struct Record {
    /// the world's walls and files, canonical (`load::world_args`)
    pub args: Vec<String>,
    /// of `args`, the files
    pub files: Vec<String>,
    engine: String,
    env: Vec<String>,
    cwd: Option<String>,
    pub read: Vec<(String, String)>,
    /// each file loaded, in order: its path, the sum of its rules and declarations, and the base facts it asserted
    /// (`Session::facts_of`), what a delta takes out when the file changes
    pub units: Vec<Unit>,
    /// each scan the world loaded, and what it brought
    pub scans: Vec<ScanUnit>,
    /// the bytes it was given when it stopped at the disk wall (`rofl::engine::Eval::disk`), if it did
    pub cut: Option<u64>,
}

#[derive(Clone)]
pub struct Unit {
    pub path: String,
    pub rules: String,
    pub facts: Vec<u32>,
}

/// The sum `Record` keeps of a file's rules.
pub fn rules_sum(rules: &str) -> String {
    Sum::of(rules.as_bytes())
}

impl Record {
    /// Of `args`, what is not a file: the walls.
    pub fn walls(&self) -> &[String] {
        &self.args[..self.args.len() - self.files.len()]
    }
    pub fn engine_env_hold(&self, this_build: bool) -> Option<String> {
        if rofl::brk!("kept_stale_engine" => false; !this_build || self.engine != engine()) {
            return Some("the engine changed since it was kept: this rofl binary is not the one that kept it".into());
        }
        (self.env != env_now()).then(|| format!("the environment the engine reads changed since it was kept: [{}] then, [{}] now", self.env.join(" "), env_now().join(" ")))
    }
    /// The directory the world's scanners ran in, where it has any.
    pub fn scanned_in(&self) -> Option<&str> {
        self.cwd.as_deref()
    }
}

/// The note `note` with the bytes its world was cut at (`Record::cut`) set to `cut`.
pub fn recut(note: &str, cut: Option<u64>) -> String {
    let mut v: Value = serde_json::from_str(note).unwrap_or_default();
    v["cut"] = json!(cut);
    v.to_string()
}

/// Whether `p` holds what was stamped `s`.
pub fn holds(p: &str, s: &str) -> bool {
    rofl::brk!("kept_stale_files" => true; stamp(Path::new(p)) == s)
}

/// A file by its bytes, a directory by the names in it, a path that is gone as gone.
fn stamp(p: &Path) -> String {
    if let Ok(d) = std::fs::read_dir(p) {
        let mut names: Vec<String> = d.flatten().map(|e| {
            let dir = e.file_type().is_ok_and(|t| t.is_dir());
            format!("{}{}", e.file_name().to_string_lossy(), if dir { "/" } else { "" })
        }).collect();
        names.sort();
        return format!("dir {}", Sum::of(names.join("\n").as_bytes()));
    }
    rofl::brk!("kept_stamp_mtime" => std::fs::metadata(p).and_then(|m| m.modified()).map_or_else(|_| "gone".into(), |t| format!("{t:?}"));
        summed(p))
}

/// The sum of a file's bytes, read again only when its length or change time moved since the sum was noted under
/// `seen()`; a file changed less than a second ago is not noted, as a volume is not (`volume::check_seen`).
fn summed(p: &Path) -> String {
    let Ok(m) = std::fs::metadata(p) else { return "gone".into() };
    let at = m.modified().ok();
    let key = at.and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| format!("{} {}", m.len(), d.as_nanos()));
    let mark = key.as_ref().and(seen()).map(|d| d.join("files").join(Sum::of(p.as_os_str().as_encoded_bytes())));
    if let (Some(k), Some(f)) = (&key, &mark) {
        if let Some(sum) = std::fs::read_to_string(f).ok().and_then(|x| x.strip_prefix(&format!("{k} ")).map(str::to_string)) {
            return sum;
        }
    }
    let Ok(b) = std::fs::read(p) else { return "gone".into() };
    let sum = Sum::of(&b);
    if let (Some(k), Some(f), true) = (&key, &mark, at.is_some_and(|t| t.elapsed().is_ok_and(|e| e.as_secs() >= 1))) {
        let tmp = f.with_extension(format!("{}.new", std::process::id()));
        if f.parent().is_some_and(|d| std::fs::create_dir_all(d).is_ok()) && std::fs::write(&tmp, format!("{k} {sum}")).is_ok() && std::fs::rename(&tmp, f).is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
    }
    sum
}

/// The binary answering, by its bytes.
fn engine() -> String {
    static E: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    E.get_or_init(|| std::env::current_exe().map_or_else(|_| "unknown".into(), |p| summed(&p))).clone()
}

/// What the kept worlds of the question verbs may hold on disk together, in GB, unless `ROFL_CACHE_GB` says
/// otherwise: a safety net, and a hard one. Two worlds of the reference scale (11 100 JS/TS files, ~23 GB of
/// memory evaluated) fit: a volume was measured at 0.36 and 0.80 of the evaluation's peak memory (cost_shapes_model
/// 27.7 MB of 77 MB, 89 bytes a fact; agg_minmax_strata 58.2 MB of 72 MB, 76 bytes a fact), the fixed part of the
/// memory weighing less the larger the world, so up to about 23 GB each (docs/cli.md).
const CACHE_GB: f64 = 50.0;

/// The free space a kept world never takes from its disk.
const FLOOR: u64 = 5 << 30;

const GB: f64 = (1u64 << 30) as f64;

/// A size as a reader reads it: in GB from 1 GB up, else in MB, else in KB.
fn size(bytes: u64) -> String {
    let b = bytes as f64;
    if b >= GB { format!("{:.2} GB", b / GB) } else if b >= (1u64 << 20) as f64 { format!("{:.1} MB", b / (1u64 << 20) as f64) } else { format!("{:.0} KB", b / 1024.0) }
}

fn cap() -> u64 {
    let gb = std::env::var("ROFL_CACHE_GB").ok().and_then(|v| v.parse::<f64>().ok()).filter(|g| *g >= 0.0).unwrap_or(CACHE_GB);
    (gb * GB) as u64
}

/// The bytes free to this process on the disk holding `dir`.
#[cfg(unix)]
fn free(dir: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let c = std::ffi::CString::new(dir.as_os_str().as_bytes()).ok()?;
    let mut s: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: a NUL-terminated path and a struct statvfs fills
    (unsafe { libc::statvfs(c.as_ptr(), &mut s) } == 0).then(|| s.f_bavail as u64 * s.f_frsize as u64)
}

#[cfg(windows)]
fn free(dir: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = dir.as_os_str().encode_wide().chain([0]).collect();
    let (mut avail, mut total, mut all) = (0u64, 0u64, 0u64);
    // SAFETY: a NUL-terminated wide path and three counters the call fills
    (unsafe { win::GetDiskFreeSpaceExW(wide.as_ptr(), &mut avail, &mut total, &mut all) } != 0).then_some(avail)
}

/// Is the process `pid` alive (a writer whose temp file is not to be taken from under it)?
#[cfg(unix)]
fn alive(pid: u32) -> bool {
    // SAFETY: signal 0 only asks whether the process exists
    let r = unsafe { libc::kill(pid as libc::pid_t, 0) };
    r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(windows)]
fn alive(pid: u32) -> bool {
    const QUERY: u32 = 0x1000; // PROCESS_QUERY_LIMITED_INFORMATION
    const STILL_ACTIVE: u32 = 259;
    const ACCESS_DENIED: i32 = 5;
    // SAFETY: a handle opened here is closed here; the exit code is a u32 the call fills
    unsafe {
        let h = win::OpenProcess(QUERY, 0, pid);
        if h.is_null() {
            // a process that exists and is not ours to ask is alive; one that does not exist is not
            return std::io::Error::last_os_error().raw_os_error() == Some(ACCESS_DENIED);
        }
        let mut code = 0u32;
        let ok = win::GetExitCodeProcess(h, &mut code) != 0;
        win::CloseHandle(h);
        !ok || code == STILL_ACTIVE
    }
}

/// The three kernel32 calls the cache needs, declared here rather than through a crate.
#[cfg(windows)]
mod win {
    use std::ffi::c_void;
    #[link(name = "kernel32")]
    extern "system" {
        pub fn GetDiskFreeSpaceExW(dir: *const u16, avail: *mut u64, total: *mut u64, free: *mut u64) -> i32;
        pub fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
        pub fn GetExitCodeProcess(h: *mut c_void, code: *mut u32) -> i32;
        pub fn CloseHandle(h: *mut c_void) -> i32;
    }
}

/// The most a world kept at `kept` may take: the cap less what live writers are writing, and no more than the disk
/// gives above its floor. Older kept worlds are not counted: they go to make room.
pub fn most(kept: &str) -> Result<u64, String> {
    let dir = Path::new(kept).parent().ok_or("no directory")?;
    let room = free(dir).map(|f| f.saturating_sub(FLOOR));
    if room == Some(0) {
        return Err(format!("the disk has less than the {} free a kept world never takes", size(FLOOR)));
    }
    Ok(cap().saturating_sub(writing(dir, true)).min(room.unwrap_or(u64::MAX)))
}

/// What processes writing a kept world beside `dir`'s worlds have written so far; `live`, only those still alive
/// (what a dead one left goes before a world is written: `sweep_orphans`).
fn writing(dir: &Path, live: bool) -> u64 {
    let dead = |name: &str| name.split_once(".vol.").and_then(|(_, r)| r.split('.').next()?.parse::<u32>().ok()).is_some_and(|pid| pid != std::process::id() && !alive(pid));
    std::fs::read_dir(dir).map(|rd| rd.flatten().filter(|e| e.path().extension().is_none_or(|x| x != "vol"))
        .filter(|e| !live || !dead(&e.file_name().to_string_lossy())).filter_map(|e| e.metadata().ok()).filter(|m| m.is_file()).map(|m| m.len()).sum()).unwrap_or(0)
}

/// A size as `size` says it, for a message of another module.
pub fn said_size(bytes: u64) -> String {
    size(bytes)
}

/// The world of `s` kept at `kept` as a question verb keeps it: written no further than the cap and than the disk
/// can give above its floor, so a world too large stops the writer at that size and is not kept; then the older
/// kept worlds go, least recently used first, until all fit the cap. Why it was not kept, otherwise.
/// A world kept by delta is written as an overlay over the volumes it was opened from, while they are no more than this
/// many overlays and these together are at most `1/OVER_PART` of the whole volume under them; past either it is
/// written whole again, and their dead weight with it.
const OVER_PART: u64 = 4;
const OVER_MOST: usize = 64;

/// `keep_capped`; with `over`, as an overlay over the volumes the world was opened from, while they are there and
/// the overlays stay few and small beside the whole one. Whether it was written as one.
pub fn keep_capped_over(s: &mut rofl::session::Session, kept: &str, note: &str, over: bool) -> Result<(u64, bool), String> {
    let mut chain = s.kept.files.clone();
    let laid: u64 = chain.iter().skip(1).map(|k| k.size).sum();
    let room = chain.first().map_or(0, |w| (w.size / OVER_PART).saturating_sub(laid));
    let layer = over && room > 0 && chain.len() <= OVER_MOST && chain.iter().all(|k| Path::new(&k.path).exists());
    // the world's own slot holds the last of them: it goes beside it under its sum, and the overlay takes the slot
    if let Some(b) = chain.last_mut().filter(|b| layer && b.path == kept) {
        let aside = format!("{}.{:016x}.vol", kept.trim_end_matches(".vol"), b.id);
        match std::fs::rename(kept, &aside) {
            Ok(()) => {
                rofl::volume::moved(kept, &aside, seen().as_deref());
                b.path = aside;
                s.kept.files = chain.clone();
            }
            Err(_) => chain.clear(),
        }
    }
    if layer && !chain.is_empty() {
        match keep_bounded(s, kept, note, &chain, Some(room)) {
            Err(e) if e == rofl::arena::TOO_LARGE => {}
            r => return r.map(|n| (n, true)),
        }
    }
    let n = keep_bounded(s, kept, note, &[], None)?;
    // what no overlay is kept over any more is the world this one replaces
    for b in chain.iter().rev().filter(|b| b.path != kept) {
        let p = Path::new(&b.path);
        if p.parent().is_some_and(|d| overlays_of(d, p).is_empty()) {
            let _ = std::fs::remove_file(p);
        }
    }
    Ok((n, false))
}

pub fn keep_capped(s: &mut rofl::session::Session, kept: &str, note: &str) -> Result<u64, String> {
    keep_bounded(s, kept, note, &[], None)
}

/// The volumes beside `p` kept as overlays over it.
fn overlays_of(dir: &Path, p: &Path) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(dir) else { return Vec::new() };
    rd.flatten().map(|e| e.path()).filter(|q| q.extension().is_some_and(|x| x == "vol") && rofl::volume::chain_named(&q.to_string_lossy()).iter().any(|b| Path::new(b) == p)).collect()
}

/// `keep_capped` over `chain`; with `part`, an overlay larger than it is not kept (`arena::TOO_LARGE`, said as is).
fn keep_bounded(s: &mut rofl::session::Session, kept: &str, note: &str, chain: &[rofl::volume::Kept], part: Option<u64>) -> Result<u64, String> {
    let dir = Path::new(kept).parent().ok_or("no directory")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    // what writers killed before this one left goes before this one writes: it may be killed too
    let orphans = rofl::brk!("kept_orphans_ignored" => false; true);
    let late = rofl::brk!("kept_orphans_swept_late" => true; false);
    if orphans && !late {
        sweep_orphans(dir);
    }
    let (cap, ignored) = (cap(), rofl::brk!("kept_cap_ignored" => true; false));
    let room = free(dir).map(|f| f.saturating_sub(FLOOR));
    if room == Some(0) {
        return Err(format!("the disk has less than the {} free a kept world never takes", size(FLOOR)));
    }
    // what live writers have written so far is taken from the cap before this one writes
    let writing: u64 = if orphans { writing(dir, false) } else { 0 };
    let most = cap.saturating_sub(writing).min(room.unwrap_or(u64::MAX));
    let bound = rofl::brk!("kept_write_unbounded" => None; (!ignored).then_some(most as usize));
    let bound = match (bound, part) {
        (Some(b), Some(p)) => Some(b.min(p as usize)),
        (b, p) => b.or(p.map(|p| p as usize)),
    };
    let new = rofl::brk!("kept_shared_temp" => format!("{kept}.new"); format!("{kept}.{}.new", std::process::id()));
    let bytes = match s.keep_volume_as(&new, note, bound, chain) {
        Ok(n) => n as u64,
        Err(e) if part.is_some() && e.to_string() == rofl::arena::TOO_LARGE => return Err(rofl::arena::TOO_LARGE.into()),
        Err(e) if e.to_string() == rofl::arena::TOO_LARGE || (bound.is_none() && !ignored) => {
            let _ = std::fs::remove_file(&new);
            return Err(format!("the world is larger than {}, the most it may take: the cap is {} (ROFL_CACHE_GB){}",
                size(most), size(cap), room.filter(|r| *r < cap).map_or(String::new(), |r| format!(" and the disk gives {} above its {} floor", size(r), size(FLOOR)))));
        }
        Err(e) => return Err(e.to_string()),
    };
    if bound.is_none() && !ignored && bytes > most {
        let _ = std::fs::remove_file(&new);
        return Err(format!("the world is larger than {}, the most it may take: the cap is {} (ROFL_CACHE_GB)", size(most), size(cap)));
    }
    if orphans && late {
        sweep_orphans(dir);
    }
    // every file of the directory counts, a world another process is writing too
    let (mut older, mut others): (Vec<(std::time::SystemTime, u64, PathBuf)>, u64) = (Vec::new(), 0);
    for e in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let (p, Ok(m)) = (e.path(), e.metadata()) else { continue };
        if chain.iter().any(|b| p == Path::new(&b.path)) {
            others += m.len();
            continue;
        }
        if p == Path::new(kept) || p == Path::new(&new) || !m.is_file() {
            continue;
        }
        if p.extension().is_some_and(|x| x == "vol") {
            older.push((m.modified().unwrap_or(std::time::UNIX_EPOCH), m.len(), p));
        } else if orphans {
            others += m.len();
        }
    }
    older.sort();
    let mut total: u64 = older.iter().map(|o| o.1).sum::<u64>() + others + bytes;
    for (_, len, p) in older {
        if total <= cap || ignored { break; }
        if !p.exists() { continue; }
        // an overlay is read with its base: a base pushed out takes them
        for o in overlays_of(dir, &p) {
            let n = std::fs::metadata(&o).map(|m| m.len()).unwrap_or(0);
            if std::fs::remove_file(&o).is_ok() { total = total.saturating_sub(n); }
        }
        if std::fs::remove_file(&p).is_ok() { total -= len; }
    }
    if total > cap && !ignored {
        let _ = std::fs::remove_file(&new);
        return Err(format!("with what other processes are writing the cache would hold {}, over the cap of {} (ROFL_CACHE_GB)", size(total), size(cap)));
    }
    std::fs::rename(&new, kept).map_err(|e| format!("{kept}: {e}"))?;
    Ok(bytes)
}

/// A world half written by a process that is gone (killed while it wrote): `<key>.vol.<pid>.new`, and the `.part`
/// its volume was written under. Nothing else removes it, and each may be a world's size.
fn sweep_orphans(dir: &Path) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let Some((_, rest)) = name.split_once(".vol.") else { continue };
        let Some(pid) = rest.split('.').next().and_then(|p| p.parse::<u32>().ok()) else { continue };
        if !(name.ends_with(".new") || name.ends_with(".part")) || pid == std::process::id() {
            continue;
        }
        if !alive(pid) {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

/// Where a question verb keeps the world of `world` (the canonical walls and files) by itself: a file named by
/// that, the environment the engine reads and the engine, under `$XDG_CACHE_HOME/rofl/worlds` (else
/// `~/.cache/rofl/worlds`), beside the storeroom of scans. What else the world read is in the file's record,
/// compared when it is opened (`moved`).
pub fn slot(world: &[String], _files: &[String]) -> Option<String> {
    let home = cache_home()?;
    let key: &[String] = rofl::brk!("kept_key_ignores_walls" => _files; world);
    let named = format!("{}\0{}\0{}", key.join("\0"), env_now().join("\0"), engine());
    Some(home.join("rofl/worlds").join(format!("{}.vol", Sum::of(named.as_bytes()))).to_string_lossy().into_owned())
}

/// A kept world used again is the most recently used.
pub fn touch(kept: &str) {
    rofl::volume::touch(kept, seen().as_deref());
}

/// Where the volumes found whole are noted (`volume::check_seen`): beside the kept worlds.
pub fn seen() -> Option<PathBuf> {
    Some(cache_home()?.join("rofl/seen"))
}

fn cache_home() -> Option<PathBuf> {
    std::env::var_os("XDG_CACHE_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| Path::new(&h).join(".cache")))
}

fn env_now() -> Vec<String> {
    ENV.iter().filter_map(|k| std::env::var(k).ok().filter(|v| !v.is_empty()).map(|v| format!("{k}={v}"))).collect()
}

pub fn absolute(p: &str) -> String {
    std::env::current_dir().map_or_else(|_| p.to_string(), |d| d.join(p).to_string_lossy().into_owned())
}

/// A path as the reader of a message knows it: from the working directory when it lies below it.
pub fn shown(p: &str) -> String {
    let cwd = std::env::current_dir().unwrap_or_default();
    Path::new(p).strip_prefix(&cwd).map_or_else(|_| p.to_string(), |r| r.to_string_lossy().into_owned())
}

/// The record of a world evaluated from `args` that read `files` and whose scans are `scans`: refused when a scan
/// named nothing it read, since whether the world it brought in is stale could not be told.
pub fn record(args: &[String], world_files: &[String], units: &[Unit], files: &[String], scans: &[ScanUnit], cut: Option<u64>) -> Result<String, String> {
    if let Some(s) = scans.iter().find(|s| s.cmd.is_some() && s.failed) {
        return Err(format!("the scan `{} {}` failed, so what it would have read is not known", s.cmd.as_deref().unwrap_or(""), s.text));
    }
    if let Some(s) = scans.iter().find(|s| s.cmd.is_some() && rofl::brk!("kept_blind_scans" => false; s.read.is_empty())) {
        return Err(format!("the scan `{} {}` named nothing it read (`-- reads: PATH`), so whether a kept world is stale could not be told", s.cmd.as_deref().unwrap_or(""), s.text));
    }
    let mut paths: Vec<PathBuf> = files.iter().map(|f| PathBuf::from(absolute(f))).collect();
    paths.extend(rofl::md::files_read().into_iter().map(|p| PathBuf::from(absolute(&p.to_string_lossy())))
        .filter(|_| rofl::brk!("kept_md_unread" => false; true)));
    if rofl::brk!("kept_scans_unread" => false; true) {
        paths.extend(scans.iter().flat_map(|s| s.read.iter().map(PathBuf::from)));
    }
    if let Ok(k) = std::env::var("ROFL_KERNEL_OVERRIDE") {
        if !k.is_empty() { paths.push(PathBuf::from(absolute(&k))); }
    }
    paths.sort();
    paths.dedup();
    let read: Vec<Value> = paths.iter().map(|p| json!([p.to_string_lossy(), stamp(p)])).collect();
    let cwd = (!scans.is_empty()).then(|| std::env::current_dir().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default());
    let units: Vec<Value> = units.iter().map(|u| json!([u.path, u.rules, runs(&u.facts)])).collect();
    let scans: Vec<Value> = scans.iter().map(|s| json!([s.kind, s.path, s.text, s.cmd, s.read, runs(&s.facts)])).collect();
    Ok(json!({ "kept": 3, "args": args, "files": world_files, "engine": engine(), "env": env_now(), "cwd": cwd, "read": read, "units": units, "scans": scans, "cut": cut }).to_string())
}

/// What a kept world records of a scan it loaded: the request, the command, what it read, and the base facts it
/// brought (its `scan_done` row among them).
#[derive(Clone)]
pub struct ScanUnit {
    pub kind: String,
    pub path: String,
    pub text: String,
    pub cmd: Option<String>,
    pub read: Vec<String>,
    pub facts: Vec<u32>,
    /// the scan failed, and brought no facts
    pub failed: bool,
}

impl ScanUnit {
    /// What the session's scan `r` brought, read against it.
    pub fn of(s: &mut rofl::session::Session, r: &rofl::engine::ScanRec) -> ScanUnit {
        let facts = s.facts_of(&r.unit).map(|f| f.0).unwrap_or_default();
        ScanUnit { kind: r.kind.clone(), path: r.path.clone(), text: r.text.clone(), cmd: r.cmd.clone(), read: r.read.clone(), facts, failed: r.unit.starts_with("scan_failed(") }
    }
}

/// Fact ids as runs of consecutive ids, each its first id and its length: a file's facts are mostly one run, so a
/// world's record grows with its files, not with its facts.
fn runs(ids: &[u32]) -> Vec<u32> {
    let mut out: Vec<u32> = Vec::new();
    for &id in ids {
        match out.len() {
            l if l >= 2 && out[l - 2].checked_add(out[l - 1]) == Some(id) => out[l - 1] += 1,
            _ => out.extend([id, 1]),
        }
    }
    out
}

fn unruns(v: &Value) -> Option<Vec<u32>> {
    let w = v.as_array()?.iter().map(|x| x.as_u64().and_then(|n| u32::try_from(n).ok())).collect::<Option<Vec<u32>>>()?;
    if w.len() % 2 != 0 { return None; }
    Some(w.chunks_exact(2).flat_map(|r| r[0]..r[0].saturating_add(r[1])).collect())
}

pub fn parse(note: &str) -> Option<Record> {
    let v: Value = serde_json::from_str(note).ok()?;
    if v.get("kept")? != 3 { return None; }
    let strs = |k: &str| -> Option<Vec<String>> { v.get(k)?.as_array()?.iter().map(|x| x.as_str().map(str::to_string)).collect() };
    let read = v.get("read")?.as_array()?.iter().map(|r| Some((r.get(0)?.as_str()?.to_string(), r.get(1)?.as_str()?.to_string()))).collect::<Option<Vec<_>>>()?;
    let units = v.get("units")?.as_array()?.iter().map(|u| Some(Unit {
        path: u.get(0)?.as_str()?.to_string(),
        rules: u.get(1)?.as_str()?.to_string(),
        facts: unruns(u.get(2)?)?,
    })).collect::<Option<Vec<_>>>()?;
    let (args, files) = (strs("args")?, strs("files")?);
    if files.len() > args.len() { return None; }
    let scans = v.get("scans")?.as_array()?.iter().map(|s| Some(ScanUnit {
        kind: s.get(0)?.as_str()?.to_string(),
        path: s.get(1)?.as_str()?.to_string(),
        text: s.get(2)?.as_str()?.to_string(),
        cmd: s.get(3)?.as_str().map(str::to_string),
        read: s.get(4)?.as_array()?.iter().map(|x| x.as_str().map(str::to_string)).collect::<Option<Vec<_>>>()?,
        facts: unruns(s.get(5)?)?,
        failed: false,
    })).collect::<Option<Vec<_>>>()?;
    let cut = v.get("cut").and_then(|c| c.as_u64());
    Some(Record { args, files, engine: v.get("engine")?.as_str()?.to_string(), env: strs("env")?, cwd: v.get("cwd")?.as_str().map(str::to_string), read, units, scans, cut })
}

/// The header of the kept world at `p`, its sum not read: to choose among kept worlds before opening one.
pub fn peek(p: &str) -> Option<Record> {
    parse(&rofl::volume::note(p).ok()?)
}

/// What moved since the world was kept, as a sentence; None when nothing did.
pub fn moved(r: &Record, this_build: bool) -> Option<String> {
    if let Some(m) = r.engine_env_hold(this_build) {
        return Some(m);
    }
    if let Some(cwd) = &r.cwd {
        if std::env::current_dir().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default() != *cwd {
            return Some(format!("its scanners ran in {cwd}, and this run is in another directory"));
        }
    }
    let now: Vec<(String, String)> = r.read.iter().map(|(p, s)| (p.clone(), if holds(p, s) { String::new() } else { stamp(Path::new(p)) })).collect();
    let said = |gone: bool| -> Vec<String> { now.iter().filter(|(_, s)| !s.is_empty() && (s == "gone") == gone).map(|(p, _)| shown(p)).collect() };
    let list = |v: Vec<String>| if v.len() > 5 { format!("{} and {} more", v[..5].join(", "), v.len() - 5) } else { v.join(", ") };
    let (missing, changed) = (said(true), said(false));
    if !missing.is_empty() {
        return Some(format!("{} {} missing", list(missing.clone()), if missing.len() == 1 { "is" } else { "are" }));
    }
    (!changed.is_empty()).then(|| format!("{} changed since it was kept", list(changed)))
}

/// Whether what `moved` said is a file gone: a run computing anew would only fail to read it.
pub fn missing(said: &str) -> bool {
    said.ends_with(" missing")
}
