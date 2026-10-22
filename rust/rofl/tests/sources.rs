//! A SCAN NAMES ITS SOURCES (docs/cli.md): a scanner that draws from an API says so, `-- source: URI TOKEN` for a
//! versioned source and `-- source: URI @TIME` for a snapshot. A kept scan holds while the scanner, asked in its check
//! mode (`ROFL_SCAN_CHECK=1`), gives the same tokens, and a snapshot while it is younger than its TTL; an answer that
//! rests on a snapshot says when it was taken. No network: a stub HTTP server in the test serves the resource.
//!
//! Each case names itself where it fails; the faults planted (`brk!("scan_source_...")`, `scan_asof_dropped`) are
//! switched on one at a time by scripts/agg_breaks.ts, which requires the cases it names to fail.
use rofl::session::Session;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

/// The stub: `GET /thing` is `{"v": N}` with `ETag: "vN"`, `HEAD /thing` the ETag alone; `/snap` has no ETag; `down`
/// answers every request 503. Each GET is counted.
struct Stub {
    url: String,
    v: Arc<AtomicU32>,
    down: Arc<AtomicBool>,
    gets: Arc<AtomicU32>,
}

fn stub() -> Stub {
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", l.local_addr().unwrap());
    let (v, down, gets) = (Arc::new(AtomicU32::new(1)), Arc::new(AtomicBool::new(false)), Arc::new(AtomicU32::new(0)));
    let (v2, down2, gets2) = (v.clone(), down.clone(), gets.clone());
    std::thread::spawn(move || {
        for c in l.incoming().flatten() {
            let mut r = BufReader::new(c.try_clone().unwrap());
            let mut first = String::new();
            let _ = r.read_line(&mut first);
            loop {
                let mut h = String::new();
                if r.read_line(&mut h).unwrap_or(0) == 0 || h == "\r\n" { break; }
            }
            let mut c = c;
            if down2.load(Ordering::SeqCst) {
                let _ = c.write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                continue;
            }
            let n = v2.load(Ordering::SeqCst);
            let body = format!("{{\"v\": {n}}}");
            let etag = if first.contains("/thing") { format!("ETag: \"v{n}\"\r\n") } else { String::new() };
            if first.starts_with("GET") { gets2.fetch_add(1, Ordering::SeqCst); }
            let head = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{etag}Content-Length: {}\r\nConnection: close\r\n\r\n", body.len());
            let _ = c.write_all(head.as_bytes());
            if first.starts_with("GET") { let _ = c.write_all(body.as_bytes()); }
        }
    });
    Stub { url, v, down, gets }
}

/// A scanner in Python over `URL/RESOURCE`: names its code and its source (versioned by the ETag, else a snapshot
/// taken now, or at the time in `taken`), counts its runs, prints `thing(V).`; in the check mode only the source.
const SCANNER: &str = r#"
import datetime, json, os, sys, urllib.request
d = os.path.dirname(os.path.abspath(__file__))
uri = open(os.path.join(d, "url")).read().strip()
if os.environ.get("ROFL_SCAN_CHECK"):
    r = urllib.request.urlopen(urllib.request.Request(uri, method="HEAD"))
    print(f"-- source: {uri} {r.headers['ETag']}")
    sys.exit(0)
r = urllib.request.urlopen(uri)
body = json.load(r)
taken = os.path.join(d, "taken")
at = open(taken).read().strip() if os.path.exists(taken) else datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
print(f"-- code: {os.path.abspath(__file__)}")
print(f"-- source: {uri} {r.headers['ETag']}" if r.headers["ETag"] else f"-- source: {uri} @{at}")
open(os.path.join(d, "runs"), "a").write("run\n")
print(f"thing({body['v']}).")
"#;

struct Case(PathBuf, Stub);

impl Case {
    fn new(name: &str, resource: &str) -> Case {
        let d = std::env::temp_dir().join(format!("rofl-sources-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let s = stub();
        std::fs::write(d.join("api.py"), SCANNER).unwrap();
        std::fs::write(d.join("url"), format!("{}/{resource}", s.url)).unwrap();
        Case(d, s)
    }
    fn world(&self, extra: &str) -> String {
        format!("scanner(t, \"python3 {}\").\nscan_request(t, \"x\").\n{extra}", self.0.join("api.py").display())
    }
    fn runs(&self) -> usize {
        std::fs::read_to_string(self.0.join("runs")).unwrap_or_default().lines().count()
    }
    fn session(&self, extra: &str) -> Result<Session, String> {
        let mut s = Session::fresh(1_000_000);
        s.load(&self.world(extra), None).map_err(|d| d.join("; "))?;
        s.evaluate().map_err(|h| rofl::describe(&h))?;
        Ok(s)
    }
    fn thing(&self, extra: &str) -> Result<Vec<Vec<String>>, String> {
        Ok(self.session(extra)?.ask("thing(V)")?.rows)
    }
}

impl Drop for Case {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn ensure(ok: bool, why: impl FnOnce() -> String) -> Result<(), String> {
    if ok { Ok(()) } else { Err(why()) }
}

fn v(n: &str) -> Vec<Vec<String>> {
    vec![vec![n.to_string()]]
}

/// The token unchanged: answered from the storeroom after one check, the data not drawn again (positive control).
fn a_token_unchanged_is_kept() -> Result<(), String> {
    let c = Case::new("kept", "thing");
    let t0 = std::time::Instant::now();
    ensure(c.thing("")? == v("1"), || "the first scan".into())?;
    let scanned = t0.elapsed();
    let t0 = std::time::Instant::now();
    let rows = c.thing("")?;
    let kept = t0.elapsed();
    ensure(rows == v("1") && c.runs() == 1 && c.1.gets.load(Ordering::SeqCst) == 1, || format!("an unchanged source was drawn again: {} runs, {} GETs", c.runs(), c.1.gets.load(Ordering::SeqCst)))?;
    eprintln!("a_token_unchanged_is_kept: the world scanned {} ms, kept after its check {} ms", scanned.as_millis(), kept.as_millis());
    Ok(())
}

/// The token moved: scanned again, and the answer is the new data.
fn a_token_moved_is_scanned_again() -> Result<(), String> {
    let c = Case::new("moved", "thing");
    c.thing("")?;
    c.1.v.store(2, Ordering::SeqCst);
    let rows = c.thing("")?;
    ensure(rows == v("2") && c.runs() == 2, || format!("the source moved and the kept scan answered: {rows:?}, {} runs", c.runs()))
}

/// The check fails (the server down): the kept scan is not answered; the scanner runs, fails too, and the scan
/// fails saying both. The world holds no `thing`.
fn a_failed_check_is_not_answered_from_the_kept() -> Result<(), String> {
    let c = Case::new("down", "thing");
    c.thing("")?;
    c.1.down.store(true, Ordering::SeqCst);
    let mut s = c.session("")?;
    let rows = s.ask("thing(V)")?.rows;
    let failed = s.ask("scan_failed(t, \"x\", M)")?.rows;
    let m = failed.first().map(|r| r[0].clone()).unwrap_or_default();
    ensure(rows.is_empty() && m.contains("the check of its sources failed") && m.contains("the scan itself failed"), || format!("the server down: thing {rows:?}, scan_failed {failed:?}"))
}

/// A snapshot within its TTL (the world's `scan_ttl`): kept, and `why` says as of when.
fn a_snapshot_within_its_ttl_is_kept_as_of() -> Result<(), String> {
    let c = Case::new("snap", "snap");
    let ttl = "scan_ttl(t, 3600).";
    c.thing(ttl)?;
    let mut s = c.session(ttl)?;
    ensure(s.ask("thing(V)")?.rows == v("1") && c.runs() == 1, || format!("a snapshot within its TTL ran again: {} runs", c.runs()))?;
    let w = s.why("thing(1)")?;
    ensure(w.contains(", as of 20") && s.as_of_said().iter().any(|l| l.contains("as of 20")), || format!("an answer on a snapshot does not say as of when: {w}"))
}

/// A snapshot past its TTL, and one with no TTL: scanned again.
fn a_snapshot_past_its_ttl_is_scanned_again() -> Result<(), String> {
    let c = Case::new("old", "snap");
    std::fs::write(c.0.join("taken"), "2020-01-01T00:00:00Z").unwrap();
    c.thing("scan_ttl(t, 3600).")?;
    c.1.v.store(2, Ordering::SeqCst);
    let rows = c.thing("scan_ttl(t, 3600).")?;
    ensure(rows == v("2") && c.runs() == 2, || format!("a snapshot past its TTL was answered: {rows:?}, {} runs", c.runs()))?;
    std::fs::remove_file(c.0.join("taken")).unwrap();
    c.thing("")?;
    c.thing("")?;
    ensure(c.runs() == 4, || format!("a snapshot with no TTL: {} runs, 4 wanted (it runs every time)", c.runs()))
}

/// Through the binary: a question verb's kept world over a versioned source takes the scan again when the token
/// moved, and over a snapshot says as of when on stderr.
fn a_kept_world_holds_to_its_sources(root: &Path) -> Result<(), String> {
    let c = Case::new("verb", "thing");
    std::fs::write(c.0.join("w.rofl"), format!("edb(scanner).\nedb(scan_done).\nedb(scan_failed).\nedb(scan_ttl).\n{}", c.world(""))).unwrap();
    let boot = root.join("boot.rofl");
    let ask = || std::process::Command::new(env!("CARGO_BIN_EXE_rofl")).args(["ask", "thing(V)", &boot.to_string_lossy(), &c.0.join("w.rofl").to_string_lossy()]).current_dir(&c.0).output().unwrap();
    let out = |o: &std::process::Output| (String::from_utf8_lossy(&o.stdout).to_string(), String::from_utf8_lossy(&o.stderr).to_string());
    let a = out(&ask());
    ensure(a.0.contains("V = 1"), || format!("first: {a:?}"))?;
    let a = out(&ask());
    ensure(a.0.contains("V = 1") && c.runs() == 1, || format!("from the kept world: {a:?}, {} runs", c.runs()))?;
    c.1.v.store(2, Ordering::SeqCst);
    let a = out(&ask());
    ensure(a.0.contains("V = 2") && !a.0.contains("V = 1"), || format!("the kept world after its source moved: {a:?}"))?;
    std::fs::write(c.0.join("url"), format!("{}/snap", c.1.url)).unwrap();
    std::fs::write(c.0.join("w.rofl"), format!("edb(scanner).\nedb(scan_done).\nedb(scan_failed).\nedb(scan_ttl).\n{}", c.world("scan_ttl(t, 3600)."))).unwrap();
    out(&ask());
    let a = out(&ask());
    ensure(a.0.contains("V = 2") && a.1.contains("are as of 20"), || format!("a kept world over a snapshot: {a:?}"))
}

/// A fake `gh`: `gh api PATH` answers the run list from `runs.json` and every run's jobs as none, and logs PATH.
const GH: &str = r#"#!/usr/bin/env python3
import json, os, sys
d = os.path.dirname(os.path.abspath(__file__))
open(os.path.join(d, "calls"), "a").write(sys.argv[2] + "\n")
print(json.dumps({"jobs": []}) if "/jobs" in sys.argv[2] else open(os.path.join(d, "runs.json")).read())
"#;

/// scanners/gh_runs.py run by a world, over a fake `gh` on PATH: the run list unchanged, the kept scan answers after
/// one request (the check); a run that ended since, scanned again, and the answer is the new conclusion.
fn gh_runs_holds_to_the_run_list(root: &Path) -> Result<(), String> {
    let d = std::env::temp_dir().join(format!("rofl-sources-gh-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    let gh = d.join("gh");
    std::fs::write(&gh, GH).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&gh, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    let run = |status: &str, updated: &str| format!(r#"{{"workflow_runs": [{{"id": 7, "updated_at": "{updated}", "created_at": "2026-10-22T10:00:00Z", "run_started_at": "2026-10-22T10:00:00Z", "repository": {{"name": "r"}}, "path": ".github/workflows/ci.yml", "event": "push", "conclusion": "{status}", "status": "completed", "display_title": "push"}}]}}"#);
    std::fs::write(d.join("runs.json"), run("success", "2026-10-22T10:05:00Z")).unwrap();
    let path = std::env::var("PATH").unwrap_or_default();
    std::env::set_var("PATH", format!("{}:{path}", d.display()));
    let world = format!("scanner(gh, \"python3 {}\").\nscan_request(gh, \"o/r\").", root.join("scanners/gh_runs.py").display());
    let ends = || -> Result<Vec<Vec<String>>, String> {
        let mut s = Session::fresh(1_000_000);
        s.load(&world, None).map_err(|d| d.join("; "))?;
        s.evaluate().map_err(|h| rofl::describe(&h))?;
        let failed = s.ask("scan_failed(gh, P, M)")?.rows;
        if !failed.is_empty() { return Err(format!("the scan failed: {failed:?}")); }
        Ok(s.ask("run_end(R, C)")?.rows)
    };
    let calls = || std::fs::read_to_string(d.join("calls")).unwrap_or_default().lines().map(str::to_string).collect::<Vec<_>>();
    let r = (|| {
        ensure(ends()? == vec![vec!["\"7\"".to_string(), "\"success\"".to_string()]], || "the first scan".into())?;
        let n = calls().len();
        ensure(ends()?[0][1] == "\"success\"" && calls().len() == n + 1 && !calls()[n].contains("/jobs"), || format!("kept: wanted one request, the run list; got {:?}", &calls()[n..]))?;
        std::fs::write(d.join("runs.json"), run("failure", "2026-10-22T10:09:00Z")).unwrap();
        let e = ends()?;
        ensure(e[0][1] == "\"failure\"", || format!("a run that ended since: {e:?}"))
    })();
    std::env::set_var("PATH", path);
    let _ = std::fs::remove_dir_all(&d);
    r
}

type F = fn() -> Result<(), String>;

const CASES: [(&str, F); 5] = [
    ("a_token_unchanged_is_kept", a_token_unchanged_is_kept),
    ("a_token_moved_is_scanned_again", a_token_moved_is_scanned_again),
    ("a_failed_check_is_not_answered_from_the_kept", a_failed_check_is_not_answered_from_the_kept),
    ("a_snapshot_within_its_ttl_is_kept_as_of", a_snapshot_within_its_ttl_is_kept_as_of),
    ("a_snapshot_past_its_ttl_is_scanned_again", a_snapshot_past_its_ttl_is_scanned_again),
];

/// One test, the cases in turn: they share the process's storeroom (`XDG_CACHE_HOME`).
#[test]
fn a_kept_scan_holds_to_its_sources() {
    let cache = std::env::temp_dir().join(format!("rofl-sources-cache-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&cache);
    std::env::set_var("XDG_CACHE_HOME", &cache);
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().unwrap();
    let mut bad: Vec<String> = CASES.iter().filter_map(|(name, f)| f().err().map(|e| format!("{name}: {e}"))).collect();
    if let Err(e) = a_kept_world_holds_to_its_sources(&root) {
        bad.push(format!("a_kept_world_holds_to_its_sources: {e}"));
    }
    if let Err(e) = gh_runs_holds_to_the_run_list(&root) {
        bad.push(format!("gh_runs_holds_to_the_run_list: {e}"));
    }
    let _ = std::fs::remove_dir_all(&cache);
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}
