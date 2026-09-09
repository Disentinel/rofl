//! A Rust implementation of the ROFL evaluator.
//!
//! The contract is three lines long and mechanically checkable:
//!
//! ```text
//! snapshot in  ->  evaluate  ->  canonicalState out
//! ```
//!
//! `facts/port-corpus/` is the oracle (`scripts/port_corpus.ts`), and every
//! module here cites the JS file and line it ports.
//!
//! THE CORPUS IS GENERATED, NOT KEPT: it is gitignored, and `rust/run_corpus.sh`
//! regenerates it before every run. It did not always — and a corpus read off
//! disk is a photograph of whatever the kernel was when somebody last ran the
//! generator, which cannot go stale visibly because the seed and the expected
//! output are written in the same instant and agree with each other forever.
//! See `f_the_conformance_corpus_was_a_photograph_of_the_kernel_not_the_kernel`.

pub mod dense;
pub mod engine;
pub mod reflect;
/// GENERATED from examples/ring1/ring1.rofl by scanners/ring1_lexgen.ts.
pub mod ring1_lexer;
/// GENERATED from examples/ring1/ring1.rofl by scanners/ring1_predgen.ts.
pub mod ring1_preds;
/// The driver for the generated tokenizer tables, written once.
pub mod ring1_tok;
/// A hand-written tokenizer, with ring1 as its specification and oracle.
pub mod rofl_lex;
/// A hand-written parser, with ring1 as its specification.
pub mod rofl_parse;
/// GENERATED from examples/ring1/ring1.rofl by scanners/ring1_spangen.ts.
pub mod ring1_tables;
/// Loading a ROFL program into the engine: the port of `Rofl.load`.
pub mod program;
pub mod seed;
/// The five verbs the port offers a caller, derived in docs/port-surface.md.
pub mod session;
pub mod store;
pub mod term;

use engine::{Eval, Halt, Mode};
use reflect::{bootstrap_kernel, Vocab};
use term::Heap;

pub struct Loaded {
    pub eval: Eval,
    pub dangling: usize,
}

/// `Rofl.fromSnapshot(seed)` then `evaluate()` — the whole corpus contract.
pub fn load(json: &str, budget: i64) -> Result<Loaded, String> {
    let mut h = Heap::default();
    let v = Vocab::new(&mut h);
    let r = seed::restore(&mut h, &v, json)?;
    let mut store = r.store;
    bootstrap_kernel(&mut h, &v, &mut store);
    let eval = Eval::new(h, store, budget, Mode::Rounds, false);
    Ok(Loaded {
        eval,
        dangling: r.dangling,
    })
}

pub fn describe(e: &Halt) -> String {
    match e {
        Halt::Budget(r, _) => format!("wall: {r}"),
        Halt::Strat(m, _) => m.clone(),
        Halt::Bug(m) => format!("defect: {m}"),
    }
}
