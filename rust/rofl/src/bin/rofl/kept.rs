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
    std::env::current_exe().and_then(std::fs::read).map_or_else(|_| "unknown".into(), |b| Sum::of(&b))
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
    let changed: Vec<String> = r.read.iter().filter(|(p, s)| rofl::brk!("kept_stale_files" => false; stamp(Path::new(p)) != *s))
        .map(|(p, _)| shown(p)).collect();
    let n = changed.len();
    let named = if n > 5 { format!("{} and {} more", changed[..5].join(", "), n - 5) } else { changed.join(", ") };
    (n > 0).then(|| format!("{named} changed since it was kept"))
}
