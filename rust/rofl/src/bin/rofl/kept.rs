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
        std::fs::read(p).map_or_else(|_| "gone".into(), |b| Sum::of(&b)))
}

/// The binary answering, by its bytes.
fn engine() -> String {
    static E: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    E.get_or_init(|| std::env::current_exe().and_then(std::fs::read).map_or_else(|_| "unknown".into(), |b| Sum::of(&b))).clone()
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
fn free(dir: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let c = std::ffi::CString::new(dir.as_os_str().as_bytes()).ok()?;
    let mut s: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: a NUL-terminated path and a struct statvfs fills
    (unsafe { libc::statvfs(c.as_ptr(), &mut s) } == 0).then(|| s.f_bavail as u64 * s.f_frsize as u64)
}

/// The world of `s` kept at `kept` as a question verb keeps it: written no further than the cap and than the disk
/// can give above its floor, so a world too large stops the writer at that size and is not kept; then the older
/// kept worlds go, least recently used first, until all fit the cap. Why it was not kept, otherwise.
pub fn keep_capped(s: &mut rofl::session::Session, kept: &str, note: &str) -> Result<u64, String> {
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
    let writing: u64 = if orphans {
        std::fs::read_dir(dir).map(|rd| rd.flatten().filter(|e| !e.path().extension().is_some_and(|x| x == "vol")).filter_map(|e| e.metadata().ok()).filter(|m| m.is_file()).map(|m| m.len()).sum()).unwrap_or(0)
    } else {
        0
    };
    let most = cap.saturating_sub(writing).min(room.unwrap_or(u64::MAX));
    let bound = rofl::brk!("kept_write_unbounded" => None; (!ignored).then_some(most as usize));
    let new = rofl::brk!("kept_shared_temp" => format!("{kept}.new"); format!("{kept}.{}.new", std::process::id()));
    let bytes = match s.keep_volume_bounded(&new, note, bound) {
        Ok(n) => n as u64,
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
        let Some(pid) = rest.split('.').next().and_then(|p| p.parse::<i32>().ok()) else { continue };
        if !(name.ends_with(".new") || name.ends_with(".part")) || pid == std::process::id() as i32 {
            continue;
        }
        // SAFETY: signal 0 only asks whether the process exists
        let alive = unsafe { libc::kill(pid, 0) } == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM);
        if !alive {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

/// Where a question verb keeps the world of `world` (the canonical walls and files) by itself: a file named by
/// that, the environment the engine reads and the engine, under `$XDG_CACHE_HOME/rofl/worlds` (else
/// `~/.cache/rofl/worlds`), beside the storeroom of scans. What else the world read is in the file's record,
/// compared when it is opened (`moved`).
pub fn slot(world: &[String], _files: &[String]) -> Option<String> {
    let home = std::env::var_os("XDG_CACHE_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| Path::new(&h).join(".cache")))?;
    let key: &[String] = rofl::brk!("kept_key_ignores_walls" => _files; world);
    let named = format!("{}\0{}\0{}", key.join("\0"), env_now().join("\0"), engine());
    Some(home.join("rofl/worlds").join(format!("{}.vol", Sum::of(named.as_bytes()))).to_string_lossy().into_owned())
}

/// A kept world used again is the most recently used.
pub fn touch(kept: &str) {
    if let Ok(f) = std::fs::OpenOptions::new().write(true).open(kept) {
        let _ = f.set_modified(std::time::SystemTime::now());
    }
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
pub fn record(args: &[String], world_files: &[String], units: &[Unit], files: &[String], scans: &[ScanUnit]) -> Result<String, String> {
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
    let units: Vec<Value> = units.iter().map(|u| json!([u.path, u.rules, u.facts])).collect();
    let scans: Vec<Value> = scans.iter().map(|s| json!([s.kind, s.path, s.text, s.cmd, s.read, s.facts])).collect();
    Ok(json!({ "kept": 2, "args": args, "files": world_files, "engine": engine(), "env": env_now(), "cwd": cwd, "read": read, "units": units, "scans": scans }).to_string())
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
}

impl ScanUnit {
    /// What the session's scan `r` brought, read against it.
    pub fn of(s: &mut rofl::session::Session, r: &rofl::engine::ScanRec) -> ScanUnit {
        let facts = s.facts_of(&r.unit).map(|f| f.0).unwrap_or_default();
        ScanUnit { kind: r.kind.clone(), path: r.path.clone(), text: r.text.clone(), cmd: r.cmd.clone(), read: r.read.clone(), facts }
    }
}

pub fn parse(note: &str) -> Option<Record> {
    let v: Value = serde_json::from_str(note).ok()?;
    if v.get("kept")? != 2 { return None; }
    let strs = |k: &str| -> Option<Vec<String>> { v.get(k)?.as_array()?.iter().map(|x| x.as_str().map(str::to_string)).collect() };
    let read = v.get("read")?.as_array()?.iter().map(|r| Some((r.get(0)?.as_str()?.to_string(), r.get(1)?.as_str()?.to_string()))).collect::<Option<Vec<_>>>()?;
    let units = v.get("units")?.as_array()?.iter().map(|u| Some(Unit {
        path: u.get(0)?.as_str()?.to_string(),
        rules: u.get(1)?.as_str()?.to_string(),
        facts: u.get(2)?.as_array()?.iter().map(|x| x.as_u64().map(|n| n as u32)).collect::<Option<Vec<u32>>>()?,
    })).collect::<Option<Vec<_>>>()?;
    let (args, files) = (strs("args")?, strs("files")?);
    if files.len() > args.len() { return None; }
    let scans = v.get("scans")?.as_array()?.iter().map(|s| Some(ScanUnit {
        kind: s.get(0)?.as_str()?.to_string(),
        path: s.get(1)?.as_str()?.to_string(),
        text: s.get(2)?.as_str()?.to_string(),
        cmd: s.get(3)?.as_str().map(str::to_string),
        read: s.get(4)?.as_array()?.iter().map(|x| x.as_str().map(str::to_string)).collect::<Option<Vec<_>>>()?,
        facts: s.get(5)?.as_array()?.iter().map(|x| x.as_u64().map(|n| n as u32)).collect::<Option<Vec<u32>>>()?,
    })).collect::<Option<Vec<_>>>()?;
    Some(Record { args, files, engine: v.get("engine")?.as_str()?.to_string(), env: strs("env")?, cwd: v.get("cwd")?.as_str().map(str::to_string), read, units, scans })
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
