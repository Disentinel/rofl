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
    engine: String,
    env: Vec<String>,
    cwd: Option<String>,
    read: Vec<(String, String)>,
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
pub fn keep_capped(s: &mut rofl::session::Session, kept: &str, note: &str) -> Result<(), String> {
    let dir = Path::new(kept).parent().ok_or("no directory")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let (cap, ignored) = (cap(), rofl::brk!("kept_cap_ignored" => true; false));
    let room = free(dir).map(|f| f.saturating_sub(FLOOR));
    if room == Some(0) {
        return Err(format!("the disk has less than the {:.0} GB free a kept world never takes", FLOOR as f64 / GB));
    }
    let most = cap.min(room.unwrap_or(u64::MAX));
    let bound = rofl::brk!("kept_write_unbounded" => None; (!ignored).then_some(most as usize));
    let new = rofl::brk!("kept_shared_temp" => format!("{kept}.new"); format!("{kept}.{}.new", std::process::id()));
    let bytes = match s.keep_volume_bounded(&new, note, bound) {
        Ok(n) => n as u64,
        Err(e) if e.to_string() == rofl::arena::TOO_LARGE || (bound.is_none() && !ignored) => {
            let _ = std::fs::remove_file(&new);
            return Err(format!("the world is larger than {:.2} GB, the most it may take: the cap is {:.2} GB (ROFL_CACHE_GB){}",
                most as f64 / GB, cap as f64 / GB, room.filter(|r| *r < cap).map_or(String::new(), |r| format!(" and the disk gives {:.2} GB above its {:.0} GB floor", r as f64 / GB, FLOOR as f64 / GB))));
        }
        Err(e) => return Err(e.to_string()),
    };
    if bound.is_none() && !ignored && bytes > most {
        let _ = std::fs::remove_file(&new);
        return Err(format!("the world is larger than {:.2} GB, the most it may take: the cap is {:.2} GB (ROFL_CACHE_GB)", most as f64 / GB, cap as f64 / GB));
    }
    let mut older: Vec<(std::time::SystemTime, u64, PathBuf)> = std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "vol") && e.path() != Path::new(kept))
        .filter_map(|e| e.metadata().ok().map(|m| (m.modified().unwrap_or(std::time::UNIX_EPOCH), m.len(), e.path())))
        .collect();
    older.sort();
    let mut total: u64 = older.iter().map(|o| o.1).sum::<u64>() + bytes;
    for (_, len, p) in older {
        if total <= cap || ignored { break; }
        if std::fs::remove_file(&p).is_ok() { total -= len; }
    }
    std::fs::rename(&new, kept).map_err(|e| format!("{kept}: {e}"))
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
pub fn record(args: &[String], files: &[String], scans: &[(String, Vec<String>)]) -> Result<String, String> {
    if let Some((cmd, _)) = scans.iter().find(|(_, read)| rofl::brk!("kept_blind_scans" => false; read.is_empty())) {
        return Err(format!("the scan `{cmd}` named nothing it read (`-- reads: PATH`), so whether a kept world is stale could not be told"));
    }
    let mut paths: Vec<PathBuf> = files.iter().map(|f| PathBuf::from(absolute(f))).collect();
    paths.extend(rofl::md::files_read().into_iter().map(|p| PathBuf::from(absolute(&p.to_string_lossy())))
        .filter(|_| rofl::brk!("kept_md_unread" => false; true)));
    if rofl::brk!("kept_scans_unread" => false; true) {
        paths.extend(scans.iter().flat_map(|(_, read)| read.iter().map(PathBuf::from)));
    }
    if let Ok(k) = std::env::var("ROFL_KERNEL_OVERRIDE") {
        if !k.is_empty() { paths.push(PathBuf::from(absolute(&k))); }
    }
    paths.sort();
    paths.dedup();
    let read: Vec<Value> = paths.iter().map(|p| json!([p.to_string_lossy(), stamp(p)])).collect();
    let cwd = (!scans.is_empty()).then(|| std::env::current_dir().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default());
    Ok(json!({ "kept": 1, "args": args, "engine": engine(), "env": env_now(), "cwd": cwd, "read": read }).to_string())
}

pub fn parse(note: &str) -> Option<Record> {
    let v: Value = serde_json::from_str(note).ok()?;
    if v.get("kept")? != 1 { return None; }
    let strs = |k: &str| -> Option<Vec<String>> { v.get(k)?.as_array()?.iter().map(|x| x.as_str().map(str::to_string)).collect() };
    let read = v.get("read")?.as_array()?.iter().map(|r| Some((r.get(0)?.as_str()?.to_string(), r.get(1)?.as_str()?.to_string()))).collect::<Option<Vec<_>>>()?;
    Some(Record { args: strs("args")?, engine: v.get("engine")?.as_str()?.to_string(), env: strs("env")?, cwd: v.get("cwd")?.as_str().map(str::to_string), read })
}

/// What moved since the world was kept, as a sentence; None when nothing did.
pub fn moved(r: &Record, this_build: bool) -> Option<String> {
    if rofl::brk!("kept_stale_engine" => false; !this_build || r.engine != engine()) {
        return Some("the engine changed since it was kept: this rofl binary is not the one that kept it".into());
    }
    if r.env != env_now() {
        return Some(format!("the environment the engine reads changed since it was kept: [{}] then, [{}] now", r.env.join(" "), env_now().join(" ")));
    }
    if let Some(cwd) = &r.cwd {
        if std::env::current_dir().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default() != *cwd {
            return Some(format!("its scanners ran in {cwd}, and this run is in another directory"));
        }
    }
    let now: Vec<(String, String)> = r.read.iter().map(|(p, s)| (p.clone(), if rofl::brk!("kept_stale_files" => s.clone(); stamp(Path::new(p))) == *s { String::new() } else { stamp(Path::new(p)) })).collect();
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
