//! storebench — REPLAY THE STORE BOUNDARY AGAINST A CANDIDATE.
//!
//! `scanners/store_boundary.ts` counts the calls; `scanners/store_trace.ts`
//! records them; this replays them. A synthetic uniform-random key/value
//! benchmark would measure the wrong workload: this one is twenty store calls
//! per fact, 71% of the writes are re-derivations of something already there,
//! the point lookups return 1.4 rows, and the whole derived layer is dropped
//! ten times in one evaluation.
//!
//!   cargo run --release -- <trace...> --backends native,btree,redb,fjall,lmdb,rocksdb
//!
//! CONDITIONS. Every run prints the load average it ran under, and `--repeat`
//! interleaves the arms rather than running each to completion, because a
//! machine that gets busier halfway through otherwise charges the difference
//! to whichever backend was in the middle.

mod backend;
mod colfile;
mod column;
mod kv;
mod kv_fjall;
mod kv_heed;
mod kv_redb;
mod kv_rocks;
mod native;
mod scale;
mod trace;

use backend::Backend;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use trace::{Op, Trace};

fn loadavg() -> f64 {
    let mut l = [0f64; 3];
    unsafe {
        libc_getloadavg(l.as_mut_ptr(), 3);
    }
    l[0]
}

extern "C" {
    #[link_name = "getloadavg"]
    fn libc_getloadavg(loadavg: *mut f64, nelem: i32) -> i32;
}

#[derive(Default)]
struct Counts {
    mismatch_add: u64,
    mismatch_get: u64,
    mismatch_rows: u64,
    mismatch_arg: u64,
    mismatch_idx: u64,
    mismatch_sup: u64,
}

struct Run {
    wall: Duration,
    flush: Duration,
    resident: u64,
    disk: u64,
    digest: u64,
    facts: usize,
    counts: Counts,
}

fn digest(mut rows: backend::Facts) -> u64 {
    rows.sort();
    // FNV-1a over the sorted set. The contract is the CONSEQUENCES of
    // derivation (`scripts/derivations.ts`), which sorts at export; a store is
    // therefore not asked to hold a total order, only to hold the same facts.
    let mut h: u64 = 0xcbf29ce484222325;
    let byte = |b: u8, h: &mut u64| {
        *h ^= b as u64;
        *h = h.wrapping_mul(0x100000001b3);
    };
    for (r, p, a) in &rows {
        for w in [*r, *p] {
            for b in w.to_be_bytes() {
                byte(b, &mut h);
            }
        }
        for x in a {
            for b in x.to_be_bytes() {
                byte(b, &mut h);
            }
        }
        byte(0xff, &mut h);
    }
    h
}

/// Replay the trace `tiles` times over disjoint argument vocabularies. The
/// program is the same — relation and perspective ids are NOT shifted — and
/// only the data grows, which is the shape `docs/medium-and-large.md` sizes:
/// 2.9M lines of one repository at 9.9 facts a line, over a program of
/// ordinary size.
fn replay(bs: &mut [Box<dyn Backend>], main: usize, t: &Trace, only_main: bool, tiles: u32) -> Run {
    let mut c = Counts::default();
    let mut cur = 0usize;
    let n = t.syms.len() as u32;
    let mut buf: Vec<u32> = Vec::with_capacity(16);
    let mut buf2: Vec<u32> = Vec::with_capacity(16);
    let rss0 = crate::scale::rss();
    let t0 = Instant::now();
    for tile in 0..tiles {
        let sh = |xs: &[u32], out: &mut Vec<u32>| -> () {
            out.clear();
            out.extend(xs.iter().map(|x| x + tile * n));
        };
        let mut cur_ = 0usize;
        std::mem::swap(&mut cur, &mut cur_);
        cur = 0;
        for op in &t.ops {
            if let Op::Store(i) = *op {
                cur = i as usize;
                continue;
            }
            if only_main && cur != main {
                continue;
            }
            let b = bs[if only_main { main } else { cur }].as_mut();
            match *op {
                Op::Add {
                    rel,
                    persp,
                    base,
                    frozen,
                    is_new,
                    args,
                } => {
                    sh(args.get(&t.pool), &mut buf);
                    let got = b.add(rel, persp, &buf, base, frozen);
                    if got != is_new && tile == 0 {
                        c.mismatch_add += 1;
                    }
                }
                Op::Get { rel, persp, args } => {
                    sh(args.get(&t.pool), &mut buf);
                    if !b.get(rel, persp, &buf) && tile == 0 {
                        c.mismatch_get += 1;
                    }
                }
                Op::RelPersp { rel, persp, rows } => {
                    if b.rel_persp(rel, persp) != rows as usize && tile == 0 {
                        c.mismatch_rows += 1;
                    }
                }
                Op::RelAll { rel, rows } => {
                    if b.rel_all(rel) != rows as usize && tile == 0 {
                        c.mismatch_rows += 1;
                    }
                }
                Op::Indexed { rel, persp, ans } => {
                    if b.indexed(rel, persp) != ans && tile == 0 {
                        c.mismatch_idx += 1;
                    }
                }
                Op::ArgMatches {
                    rel,
                    persp,
                    arity,
                    rows,
                    pos,
                    vals,
                } => {
                    sh(vals.get(&t.pool), &mut buf);
                    let got = b.arg_matches(rel, persp, arity as usize, pos.get(&t.pool), &buf);
                    let got = got.map(|x| x as i64).unwrap_or(-1);
                    // `argMatches` may over-answer in any order (src/store.ts:243),
                    // so a LARGER answer is conformant and a smaller one is not.
                    if ((rows < 0) != (got < 0) || got < rows) && tile == 0 {
                        c.mismatch_arg += 1;
                    }
                }
                Op::Support {
                    rel,
                    persp,
                    sig,
                    nprems,
                    is_new,
                    args,
                    ..
                } => {
                    sh(args.get(&t.pool), &mut buf2);
                    let got = b.support(rel, persp, &buf2, sig + tile * n, nprems);
                    if got != is_new && tile == 0 {
                        c.mismatch_sup += 1;
                    }
                }
                Op::ClearDerived => b.clear_derived(),
                Op::Store(_) => unreachable!(),
                Op::RelCount { rel, ans } => {
                    if b.rel_count(rel) != ans as usize && tile == 0 {
                        c.mismatch_rows += 1;
                    }
                }
            }
        }
    }
    let wall = t0.elapsed();
    let resident = crate::scale::rss().saturating_sub(rss0);
    let t1 = Instant::now();
    for b in bs.iter_mut() {
        b.flush();
    }
    let flush = t1.elapsed();
    let disk: u64 = bs.iter().map(|b| b.disk_bytes()).sum();
    let rows = bs[main].live_facts();
    if let Ok(p) = std::env::var("STOREBENCH_DUMP") {
        let mut ks: Vec<String> = rows
            .iter()
            .map(|(r, pp, a)| {
                format!(
                    "{}[{}]({})",
                    t.syms[*r as usize],
                    t.syms[*pp as usize],
                    a.iter()
                        .map(|x| t.syms[*x as usize].as_str())
                        .collect::<Vec<_>>()
                        .join(",")
                )
            })
            .collect();
        ks.sort();
        std::fs::write(p, ks.join("\n") + "\n").unwrap();
    }
    Run {
        wall,
        flush,
        resident,
        disk,
        facts: rows.len(),
        digest: digest(rows),
        counts: c,
    }
}

/// A store that is never asked anything: the placeholder for a scratch store
/// the run is not replaying.
struct NullBackend;
impl Backend for NullBackend {
    fn add(&mut self, _: u32, _: u32, _: &[u32], _: bool, _: bool) -> bool {
        unreachable!()
    }
    fn get(&mut self, _: u32, _: u32, _: &[u32]) -> bool {
        unreachable!()
    }
    fn rel_persp(&mut self, _: u32, _: u32) -> usize {
        unreachable!()
    }
    fn rel_all(&mut self, _: u32) -> usize {
        unreachable!()
    }
    fn indexed(&mut self, _: u32, _: Option<u32>) -> bool {
        unreachable!()
    }
    fn arg_matches(
        &mut self,
        _: u32,
        _: Option<u32>,
        _: usize,
        _: &[u32],
        _: &[u32],
    ) -> Option<usize> {
        unreachable!()
    }
    fn support(&mut self, _: u32, _: u32, _: &[u32], _: u32, _: u32) -> bool {
        unreachable!()
    }
    fn clear_derived(&mut self) {
        unreachable!()
    }
    fn rel_count(&mut self, _: u32) -> usize {
        unreachable!()
    }
    fn live_facts(&mut self) -> crate::backend::Facts {
        Vec::new()
    }
}

static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn tmpdir(tag: &str) -> PathBuf {
    // A fresh path every time: LMDB refuses to open one environment twice in a
    // process, and an `Instant::now().elapsed()` is zero.
    let d = std::env::temp_dir().join(format!(
        "storebench-{tag}-{}-{}",
        std::process::id(),
        SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn make(name: &str, t: &Trace, dir: &Path, tiles: u32) -> Option<Box<dyn Backend>> {
    Some(match name {
        "native" => Box::new(native::NativeBackend::new(scale::tiled_names(
            t,
            tiles as usize,
        ))) as Box<dyn Backend>,
        "btree" => Box::new(kv::KvBackend::<kv::BTreeKv>::new(dir)),
        "column" => Box::new(column::ColumnBackend::new()),
        "redb" => Box::new(kv::KvBackend::<kv_redb::RedbKv>::new(dir)),
        "fjall" => Box::new(kv::KvBackend::<kv_fjall::FjallKv>::new(dir)),
        "lmdb" => Box::new(kv::KvBackend::<kv_heed::HeedKv>::new(dir)),
        "rocksdb" => Box::new(kv::KvBackend::<kv_rocks::RocksKv>::new(dir)),
        _ => return None,
    })
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    // `base` and `probe` are the sharing-curve commands; everything else is a
    // trace replay.
    if argv.first().map(|s| s.as_str()) == Some("base") {
        let t = Trace::load(Path::new(&argv[2]));
        scale::build(
            &argv[1],
            &t,
            argv[3].parse().unwrap(),
            Path::new(&argv[4]),
            argv.iter().any(|a| a == "--prov"),
            argv.iter()
                .position(|a| a == "--probe")
                .map(|i| argv[i + 1].parse().unwrap())
                .unwrap_or(0),
        );
        return;
    }
    if argv.first().map(|s| s.as_str()) == Some("probe") {
        scale::probe(
            &argv[1],
            &PathBuf::from(&argv[2]),
            argv[3].parse().unwrap(),
            argv.iter().any(|a| a == "--hold"),
        );
        return;
    }
    let mut traces: Vec<PathBuf> = Vec::new();
    let mut backends = vec!["native".to_string(), "btree".to_string()];
    let mut repeat = 3usize;
    let mut only_main = true;
    let mut tiles = 1u32;
    let mut i = 0;
    while i < argv.len() {
        match argv[i].as_str() {
            "--backends" => {
                i += 1;
                backends = argv[i].split(',').map(|s| s.to_string()).collect();
            }
            "--all-stores" => only_main = false,
            "--tile" => {
                i += 1;
                tiles = argv[i].parse().unwrap();
            }
            "--repeat" => {
                i += 1;
                repeat = argv[i].parse().unwrap();
            }
            s => traces.push(PathBuf::from(s)),
        }
        i += 1;
    }
    if traces.is_empty() {
        eprintln!("usage: storebench <trace...> [--backends a,b] [--repeat N]");
        std::process::exit(2);
    }

    for tp in &traces {
        let t = Trace::load(tp);
        let nops = if only_main {
            let mut cur = 0u32;
            let mut n = 0usize;
            for op in &t.ops {
                match *op {
                    Op::Store(i) => cur = i,
                    _ if cur == t.main => n += 1,
                    _ => {}
                }
            }
            n
        } else {
            t.ops.iter().filter(|o| !matches!(o, Op::Store(_))).count()
        };
        println!(
            "\n=== {}  {} ops{}  {} symbols  {} live facts   load {:.2}",
            t.name,
            nops,
            if only_main {
                " (world store only)"
            } else {
                " (all stores)"
            },
            t.syms.len(),
            t.live.len(),
            loadavg()
        );
        // Interleaved: one pass of every arm, `repeat` times.
        let mut best: std::collections::HashMap<String, Run> = Default::default();
        let mut alls: std::collections::HashMap<String, Vec<f64>> = Default::default();
        for _pass in 0..repeat {
            for b in &backends {
                let dir = tmpdir(b);
                let mut insts: Vec<Box<dyn Backend>> = Vec::new();
                // Only the world's own store is instantiated when the scratch
                // stores are skipped: a backend must not be charged six empty
                // databases' fixed cost for stores it never serves.
                let mut ok = true;
                for i in 0..t.nstores {
                    if only_main && i != t.main {
                        insts.push(Box::new(NullBackend) as Box<dyn Backend>);
                        continue;
                    }
                    let sub = dir.join(format!("s{i}"));
                    std::fs::create_dir_all(&sub).unwrap();
                    let Some(inst) = make(b, &t, &sub, tiles) else {
                        eprintln!("unknown backend {b}");
                        ok = false;
                        break;
                    };
                    insts.push(inst);
                }
                if !ok {
                    continue;
                }
                let r = replay(&mut insts, t.main as usize, &t, only_main, tiles);
                alls.entry(b.clone())
                    .or_default()
                    .push(r.wall.as_secs_f64() * 1e3);
                let keep = match best.get(b) {
                    Some(p) => r.wall < p.wall,
                    None => true,
                };
                drop(insts);
                if keep {
                    best.insert(b.clone(), r);
                }
                let _ = std::fs::remove_dir_all(&dir);
            }
        }
        println!(
            "{:<10} {:>10} {:>10} {:>9} {:>12} {:>10} {:>10} {:>18}  conformance",
            "backend", "best ms", "med ms", "flush ms", "us/op", "RSS MB", "disk MB", "digest"
        );
        let mut ref_digest: Option<u64> = None;
        for b in &backends {
            let Some(r) = best.get(b) else { continue };
            let mut v = alls[b].clone();
            v.sort_by(|a, c| a.partial_cmp(c).unwrap());
            let med = v[v.len() / 2];
            if ref_digest.is_none() {
                ref_digest = Some(r.digest);
            }
            let c = &r.counts;
            let bad = c.mismatch_add
                + c.mismatch_get
                + c.mismatch_rows
                + c.mismatch_arg
                + c.mismatch_idx
                + c.mismatch_sup;
            let same = Some(r.digest) == ref_digest && r.facts == t.live.len();
            println!(
                "{:<10} {:>10.1} {:>10.1} {:>9.1} {:>12.3} {:>10.1} {:>10.2} {:>18x}  {} facts={} {}",
                b,
                r.wall.as_secs_f64() * 1e3,
                med,
                r.flush.as_secs_f64() * 1e3,
                r.wall.as_secs_f64() * 1e6 / (nops * tiles as usize) as f64,
                r.resident as f64 / 1e6,
                r.disk as f64 / 1e6,
                r.digest,
                if same && bad == 0 { "OK " } else { "BAD" },
                r.facts,
                if bad == 0 {
                    String::new()
                } else {
                    format!(
                        "add:{} get:{} rows:{} arg:{} idx:{} sup:{}",
                        c.mismatch_add,
                        c.mismatch_get,
                        c.mismatch_rows,
                        c.mismatch_arg,
                        c.mismatch_idx,
                        c.mismatch_sup
                    )
                }
            );
        }
        let _ = BTreeSet::<u8>::new();
        println!("load after {:.2}", loadavg());
    }
}
