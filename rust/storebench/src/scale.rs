//! THE SHARING CURVE, and the density that decides it.
//!
//! The requirement, settled 2026-09-08: one server, one user, MANY AGENTS. A
//! fork is a full copy in RAM (`Store.clone`, src/store.ts:779), so at Medium's
//! measured 15.5–30.4 GB two agents already exceed a 32 GB machine and four are
//! 122 GB. The base must therefore be mapped and shared, with each agent
//! holding only its private delta.
//!
//! "Shared" is not a property of a crate's README; it is a curve. So:
//!
//!   base  — build a base of N facts with one candidate, report bytes per
//!           fact on disk and the time to build it.
//!   probe — open that base READ ONLY in a fresh process, time the cold map
//!           to the first useful probe, run a point-lookup workload, and print
//!           this process's own resident size. The orchestrating script runs
//!           1, 2, 4 and 8 of these at once and reads the MACHINE's page
//!           accounting, because a per-process RSS counts a shared page in
//!           every process that maps it and would report sharing as growth.
//!
//! The facts are the real ones: a trace's final live fact set, tiled K times
//! with a fresh argument vocabulary per tile, so the relation count, the arity
//! distribution and the group sizes are the workload's and only the volume is
//! synthetic.

use crate::backend::*;
use crate::colfile;
use crate::kv::Kv;
use crate::trace::Trace;
use std::path::Path;
use std::time::Instant;

/// PHYSICAL FOOTPRINT of this process, in bytes — the accounting macOS itself
/// uses, and the one the sharing question needs. A resident-set figure counts a
/// page mapped from a file in EVERY process that maps it, so eight agents over
/// one mapped base would report eight times the memory the machine actually
/// spends. `phys_footprint` counts a process's own dirty and compressed pages
/// and does not count clean file-backed pages it shares with the page cache,
/// which is exactly the distinction between "each agent pays for the base" and
/// "the machine pays once".
///
/// `rusage_info_v0` is `uuid[16]` then ten `u64`s, and `ri_phys_footprint` is
/// the eighth of them — offset 72. The layout is ABI and has not moved.
pub fn footprint() -> u64 {
    extern "C" {
        fn proc_pid_rusage(pid: i32, flavor: i32, buffer: *mut u8) -> i32;
    }
    let mut buf = [0u8; 1024];
    let rc = unsafe { proc_pid_rusage(std::process::id() as i32, 0, buf.as_mut_ptr()) };
    if rc != 0 {
        return 0;
    }
    u64::from_le_bytes(buf[72..80].try_into().unwrap())
}

/// Resident set of this process, in bytes, from the operating system.
pub fn rss() -> u64 {
    let out = std::process::Command::new("ps")
        .args(["-o", "rss=", "-p", &std::process::id().to_string()])
        .output();
    match out {
        Ok(o) => {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .parse::<u64>()
                .unwrap_or(0)
                * 1024
        }
        Err(_) => 0,
    }
}

/// The trace's live fact set, tiled `k` times. Relations and perspectives are
/// SHARED across tiles and argument symbols are not: a bigger corpus is more
/// data over a program of ordinary size, which is the split
/// docs/performance-invariants.md calls "the worst possible" for interning and
/// the one Medium actually has.
pub fn tiled(t: &Trace, k: usize) -> Facts {
    let base = facts_of(t);
    let nsym = t.syms.len() as u32;
    let mut out = Vec::with_capacity(base.len() * k);
    for tile in 0..k as u32 {
        for (r, p, a) in &base {
            out.push((
                *r,
                *p,
                a.iter().map(|x| x + tile * nsym).collect::<Vec<u32>>(),
            ));
        }
    }
    out
}

/// One name per tiled symbol. Relation and perspective names are shared
/// across tiles; argument names are not, because a bigger corpus is more data
/// over a program of ordinary size.
pub fn tiled_names(t: &Trace, k: usize) -> Vec<String> {
    let n = t.syms.len();
    let mut out = Vec::with_capacity(n * k);
    for tile in 0..k {
        for s in &t.syms {
            out.push(if tile == 0 {
                s.clone()
            } else {
                format!("{s}#{tile}")
            });
        }
    }
    out
}

/// The live fact set, recovered from the trace's own key list.
fn facts_of(t: &Trace) -> Facts {
    let mut ix: std::collections::HashMap<&str, u32> = Default::default();
    for (i, s) in t.syms.iter().enumerate() {
        ix.insert(s.as_str(), i as u32);
    }
    let mut out = Vec::with_capacity(t.live.len());
    for k in &t.live {
        let ob = k.find('[').unwrap();
        let cb = k.find("](").unwrap();
        let rel = &k[..ob];
        let persp = &k[ob + 1..cb];
        let inner = &k[cb + 2..k.len() - 1];
        let (Some(&r), Some(&p)) = (ix.get(rel), ix.get(persp)) else {
            continue;
        };
        let mut args = Vec::new();
        let mut ok = true;
        if !inner.is_empty() {
            // Split on commas at DEPTH ZERO: a functor argument carries its own.
            let (mut d, mut at) = (0i32, 0usize);
            let b = inner.as_bytes();
            let mut parts: Vec<&str> = Vec::new();
            for i in 0..b.len() {
                match b[i] {
                    b'(' | b'[' => d += 1,
                    b')' | b']' => d -= 1,
                    b',' if d == 0 => {
                        parts.push(&inner[at..i]);
                        at = i + 1;
                    }
                    _ => {}
                }
            }
            parts.push(&inner[at..]);
            for s in parts {
                match ix.get(s) {
                    Some(&i) => args.push(i),
                    None => {
                        ok = false;
                        break;
                    }
                }
            }
        }
        if ok {
            out.push((r, p, args));
        }
    }
    out
}

fn dir_bytes(p: &Path) -> u64 {
    let m = match std::fs::metadata(p) {
        Ok(m) => m,
        Err(_) => return 0,
    };
    if m.is_file() {
        return m.len();
    }
    let mut n = 0;
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            n += dir_bytes(&e.path());
        }
    }
    n
}

/// `prov` adds one firing per fact, which is what this kernel keeps BY
/// CONSTRUCTION: measured 1.0–1.9 witnesses per answer
/// (docs/performance-invariants.md §3), so one is the low end and the honest
/// floor for a provenance-carrying store.
pub fn build(backend: &str, t: &Trace, tiles: usize, dir: &Path, prov: bool, probes: usize) {
    std::fs::create_dir_all(dir).unwrap();
    let facts = tiled(t, tiles);
    println!(
        "building {backend}: {} facts ({} tiles of {})",
        facts.len(),
        tiles,
        facts.len() / tiles.max(1)
    );
    let t0 = Instant::now();
    match backend {
        // IN-HEAP arms: what an agent's own copy costs, which is the numerator
        // of the sharing problem. Reported as resident bytes rather than file
        // bytes, and the empty-process floor is subtracted.
        "native" | "column" => {
            // The VOCABULARY is built and measured first, and separately: both
            // arms need names, only one of them stores them, and charging the
            // difference to the fact representation would be measuring the
            // benchmark's own string vector.
            let base = rss();
            let names = tiled_names(t, tiles);
            let nsym = names.len();
            let vocab = rss().saturating_sub(base);
            let rss0 = rss();
            let mut b: Box<dyn Backend> = if backend == "native" {
                Box::new(crate::native::NativeBackend::new(names))
            } else {
                drop(names);
                Box::new(crate::column::ColumnBackend::new())
            };
            for (i, (r, p, a)) in facts.iter().enumerate() {
                b.add(*r, *p, a, true, false);
                if prov {
                    b.support(*r, *p, a, i as u32, 3);
                }
            }
            let used = rss().saturating_sub(rss0);
            // The same point-lookup workload the mapped arms run, so
            // "probe from a mapped base versus from an in-heap store" is one
            // comparison and not two benchmarks.
            if probes > 0 {
                let mut hits = 0usize;
                let t2 = Instant::now();
                for i in 0..probes {
                    let (r, p, a) = &facts[(i * 37) % facts.len()];
                    if b.get(*r, *p, a) {
                        hits += 1;
                    }
                }
                println!(
                    "PROBE {backend}-inheap open_ms=0.00 first_ms=0.00 probes={probes} hits={hits} \
us_per_probe={:.3} rss_mb={:.1} rss_delta_mb={:.1} foot_mb={:.1}",
                    t2.elapsed().as_secs_f64() * 1e6 / probes as f64,
                    rss() as f64 / 1e6,
                    used as f64 / 1e6,
                    footprint() as f64 / 1e6
                );
            }
            println!(
                "{:<9}{:<6} {:>12} facts {:>10.1} MB {:>8.1} B/fact  build {:.1} s  (RESIDENT, in heap; {} names cost {:.1} MB = {:.1} B/fact on top)",
                backend,
                if prov { " +prov" } else { "" },
                facts.len(),
                used as f64 / 1e6,
                used as f64 / facts.len() as f64,
                t0.elapsed().as_secs_f64(),
                nsym,
                vocab as f64 / 1e6,
                vocab as f64 / facts.len() as f64
            );
            // keep it alive until after the measurement
            drop(b);
            return;
        }
        "colfile" => colfile::write(&dir.join("base.col"), &facts).unwrap(),
        "redb" => put_all::<crate::kv_redb::RedbKv>(dir, &facts),
        "lmdb" => put_all::<crate::kv_heed::HeedKv>(dir, &facts),
        "fjall" => put_all::<crate::kv_fjall::FjallKv>(dir, &facts),
        "rocksdb" => put_all::<crate::kv_rocks::RocksKv>(dir, &facts),
        _ => panic!("unknown base backend {backend}"),
    }
    let build = t0.elapsed();
    // A deterministic probe sample: every 37th fact, so the probes hit rows
    // spread across every group rather than one hot page.
    let mut s = String::new();
    for (i, (r, p, a)) in facts.iter().enumerate() {
        if i % 37 == 0 {
            s.push_str(&format!(
                "{r} {p} {}\n",
                a.iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<_>>()
                    .join(" ")
            ));
        }
    }
    std::fs::write(dir.join("sample.txt"), s).unwrap();
    let bytes = dir_bytes(dir) - std::fs::metadata(dir.join("sample.txt")).unwrap().len();
    println!(
        "{:<9} {:>12} facts {:>10.1} MB {:>8.1} B/fact  build {:.1} s",
        backend,
        facts.len(),
        bytes as f64 / 1e6,
        bytes as f64 / facts.len() as f64,
        build.as_secs_f64()
    );
}

fn put_all<K: Kv>(dir: &Path, facts: &[(u32, u32, Vec<u32>)]) {
    let mut kv = K::open(dir);
    for (i, (r, p, a)) in facts.iter().enumerate() {
        kv.put(&fact_key(T_FACT_BASE, *r, *p, a), &[1u8]);
        if i % 200_000 == 0 {
            kv.commit();
        }
    }
    kv.commit();
    kv.flush();
}

pub fn probe(backend: &str, dir: &Path, n: usize, hold: bool) {
    let sample: Vec<(u32, u32, Vec<u32>)> = std::fs::read_to_string(dir.join("sample.txt"))
        .unwrap()
        .lines()
        .map(|l| {
            let v: Vec<u32> = l.split(' ').map(|x| x.parse().unwrap()).collect();
            (v[0], v[1], v[2..].to_vec())
        })
        .collect();
    let rss0 = rss();
    let t0 = Instant::now();
    let mut hits = 0usize;
    let open;
    let warm;
    match backend {
        "colfile" => {
            let m = colfile::Mapped::open(&dir.join("base.col")).unwrap();
            open = t0.elapsed();
            let t1 = Instant::now();
            m.warm();
            warm = t1.elapsed();
            let t2 = Instant::now();
            for i in 0..n {
                let (r, p, a) = &sample[i % sample.len()];
                if m.get(*r, *p, a) {
                    hits += 1;
                }
            }
            report(backend, open, warm, t2.elapsed(), n, hits, rss0);
        }
        "redb" => probe_kv::<crate::kv_redb::RedbKv>(backend, dir, &sample, n, rss0),
        "lmdb" => probe_kv::<crate::kv_heed::HeedKv>(backend, dir, &sample, n, rss0),
        "fjall" => probe_kv::<crate::kv_fjall::FjallKv>(backend, dir, &sample, n, rss0),
        "rocksdb" => probe_kv::<crate::kv_rocks::RocksKv>(backend, dir, &sample, n, rss0),
        _ => panic!("unknown probe backend {backend}"),
    }
    if hold {
        // Stay resident so the orchestrator can read the machine's own page
        // accounting with N of these alive at once.
        let mut line = String::new();
        let _ = std::io::stdin().read_line(&mut line);
    }
}

fn probe_kv<K: Kv>(name: &str, dir: &Path, sample: &[(u32, u32, Vec<u32>)], n: usize, rss0: u64) {
    let t0 = Instant::now();
    let kv = K::open(dir);
    let open = t0.elapsed();
    let t1 = Instant::now();
    // First useful probe: one lookup, which is what an agent actually waits for.
    let (r, p, a) = &sample[0];
    let _ = kv.get(&fact_key(T_FACT_BASE, *r, *p, a));
    let warm = t1.elapsed();
    let t2 = Instant::now();
    let mut hits = 0usize;
    for i in 0..n {
        let (r, p, a) = &sample[i % sample.len()];
        if kv.get(&fact_key(T_FACT_BASE, *r, *p, a)).is_some() {
            hits += 1;
        }
    }
    report(name, open, warm, t2.elapsed(), n, hits, rss0);
    std::mem::forget(kv);
}

fn report(
    name: &str,
    open: std::time::Duration,
    warm: std::time::Duration,
    probe: std::time::Duration,
    n: usize,
    hits: usize,
    rss0: u64,
) {
    println!(
        "PROBE {name} open_ms={:.2} first_ms={:.2} probes={n} hits={hits} us_per_probe={:.3} rss_mb={:.1} rss_delta_mb={:.1} foot_mb={:.1}",
        open.as_secs_f64() * 1e3,
        warm.as_secs_f64() * 1e3,
        probe.as_secs_f64() * 1e6 / n as f64,
        rss() as f64 / 1e6,
        (rss().saturating_sub(rss0)) as f64 / 1e6,
        footprint() as f64 / 1e6
    );
}
