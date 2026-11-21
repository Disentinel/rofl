//! A line on stderr while a question verb runs long, so that an agent whose call is cut at two minutes (CLAUDE.md,
//! *Testing has a hard limit*) tells a slow run, whose steps or memory still move, from a stuck one.
use rofl::engine::{MEMORY_LIMIT, MEMORY_USED, STEPS_DONE};
use std::sync::atomic::Ordering::Relaxed;
use std::time::{Duration, Instant};

/// Eight lines in an agent's call of two minutes.
const EVERY: Duration = Duration::from_secs(15);

pub fn tell() {
    let start = Instant::now();
    std::thread::spawn(move || {
        let mut last = 0;
        loop {
            std::thread::sleep(EVERY);
            let steps = STEPS_DONE.load(Relaxed);
            let (used, may) = (MEMORY_USED.load(Relaxed), MEMORY_LIMIT.load(Relaxed));
            let memory = if may > 0 { format!(", memory {} of the {} it may use", crate::load::gb(used), crate::load::gb(may)) } else { String::new() };
            eprintln!("progress: {} s, {} steps, {} in the last {} s{memory}", start.elapsed().as_secs(), said(steps), said(steps - last), EVERY.as_secs());
            last = steps;
        }
    });
}

fn said(n: i64) -> String {
    match n {
        n if n >= 1_000_000_000 => format!("{:.1} G", n as f64 / 1e9),
        n if n >= 1_000_000 => format!("{:.1} M", n as f64 / 1e6),
        n if n >= 1_000 => format!("{} k", n / 1_000),
        n => n.to_string(),
    }
}
