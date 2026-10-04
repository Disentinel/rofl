//! A FORK BY CLONE AGAINST A FORK BY LAYER, over one evaluated core.
//!
//!   cargo run --profile fast --example fork_layers -- CORE.seed.json [VOL.rofl ...]
//!
//! (a) 64 forks of the core each way: the time, and the live bytes of holding
//! all 64. (b) one volume per file — a fork, the file's facts asserted, then
//! evaluated — each way, with the eight held: the time, the live bytes, and
//! the canonical state of every volume, which must be the same both ways.
//! A clone is `Eval::fork` of a core never forked, so never frozen; a layer
//! is `Session::fork` of a second core loaded from the same seed.
use rofl::session::Session;
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicIsize, Ordering};
use std::time::Instant;

struct Counting;
static LIVE: AtomicIsize = AtomicIsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        LIVE.fetch_add(l.size() as isize, Ordering::Relaxed);
        System.alloc(l)
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        LIVE.fetch_sub(l.size() as isize, Ordering::Relaxed);
        System.dealloc(p, l)
    }
    unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
        LIVE.fetch_add(n as isize - l.size() as isize, Ordering::Relaxed);
        System.realloc(p, l, n)
    }
}

#[global_allocator]
static A: Counting = Counting;

fn live() -> isize {
    LIVE.load(Ordering::Relaxed)
}

fn core(src: &str) -> Session {
    let mut s = Session::open(src, 4_000_000_000).unwrap();
    s.eval.space = 4_000_000;
    s.evaluate().map_err(|h| rofl::describe(&h)).unwrap();
    s
}

fn volume(mut s: Session, text: &str) -> Session {
    s.assert(text).unwrap();
    s.evaluate().map_err(|h| rofl::describe(&h)).unwrap();
    s
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let src = std::fs::read_to_string(&args[0]).unwrap();
    let vols: Vec<String> = args[1..].iter().map(|p| std::fs::read_to_string(p).unwrap()).collect();
    let mut cc = core(&src);
    let mut cl = core(&src);
    println!("core facts={} ids={}", cc.eval.store.fact_count(), cc.eval.store.len_ids());

    let at = live();
    let t = Instant::now();
    let held: Vec<_> = (0..64).map(|_| cc.eval.fork()).collect();
    println!("(a) clone x64 ms={:.3} live_bytes={}", t.elapsed().as_secs_f64() * 1e3, live() - at);
    drop(held);
    let at = live();
    let t = Instant::now();
    cl.eval.h.freeze();
    cl.eval.store.freeze(&cl.eval.h);
    println!("(a) freeze ms={:.3} live_bytes={}", t.elapsed().as_secs_f64() * 1e3, live() - at);
    let at = live();
    let t = Instant::now();
    let held: Vec<_> = (0..64).map(|_| cl.fork()).collect();
    println!("(a) layer x64 ms={:.3} live_bytes={}", t.elapsed().as_secs_f64() * 1e3, live() - at);
    drop(held);
    for (part, f) in [("heap", 0), ("store", 1)] {
        let at = live();
        let held: Vec<Box<dyn std::any::Any>> = (0..64).map(|_| -> Box<dyn std::any::Any> { if f == 0 { Box::new(cl.eval.h.clone()) } else { Box::new(cl.eval.store.clone()) } }).collect();
        println!("(a) layer x64, the {part} alone: live_bytes={}", live() - at);
        drop(held);
    }

    if vols.is_empty() {
        return;
    }
    let mut states = Vec::new();
    for (way, layer) in [("clone", false), ("layer", true)] {
        let at = live();
        let t = Instant::now();
        let held: Vec<Session> = vols
            .iter()
            .map(|v| {
                let f = if layer { cl.fork() } else { Session { eval: cc.eval.fork(), dangling: cc.dangling } };
                volume(f, v)
            })
            .collect();
        let ms = t.elapsed().as_secs_f64() * 1e3;
        let bytes = live() - at;
        let facts: usize = held.iter().map(|s| s.eval.store.fact_count()).sum();
        println!("(b) {way} x{} ms={ms:.1} live_bytes={bytes} facts={facts}", held.len());
        states.push(held.iter().map(|s| s.eval.store.canonical_state(&s.eval.h)).collect::<Vec<_>>());
    }
    let same = states[0].iter().zip(&states[1]).filter(|(a, b)| a == b).count();
    println!("(b) canonical states identical: {same} of {}", vols.len());
    assert_eq!(same, vols.len());
}
