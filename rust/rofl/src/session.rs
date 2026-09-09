//! THE PORT'S SURFACE: five verbs and a tick, each one shaped by a measurement.
//!
//! `docs/port-surface.md` derives this from five numbers, and the point of
//! deriving it before writing it was that a surface designed without them hides
//! exactly what a caller needs to see. What each number bought:
//!
//! 1. A QUESTION'S COST IS A PROPERTY OF THE QUESTION. Over a 128-file world of
//!    5 676 864 facts: a bound key 5.5 ms, a bound prefix 8.6 ms, a scan 72 ms,
//!    and the largest relation — 1 093 150 rows — 12 469 ms. Three orders of
//!    magnitude behind one verb is a trap, so [`Answer`] carries what the ask
//!    COST and whether it probed an index or walked the relation. A caller who
//!    reads `probed: false` next to `scanned: 1093150` knows why they waited.
//!
//! 2. STARTING IS 383 ms AND FORKING IS 3 ms. So [`Session::fork`] is on the
//!    surface rather than in the host: a unit of work is a fork of a built
//!    core, and that has to be the obvious path rather than an optimisation a
//!    caller discovers after paying 128x for it.
//!
//! 3. A VOLUME MAY BE LIFTED AT A TICK BOUNDARY AND NOWHERE ELSE, because
//!    `Assumption` freezes what `not p` is judged against for a whole round.
//!    This surface honours that BY CONSTRUCTION rather than by a guard: there
//!    is no way to reach the middle of a round from here — [`Session::evaluate`]
//!    is one call that either reaches the fixpoint or halts at a wall — and
//!    [`Session::assert`] only marks the store dirty, so the facts it adds are
//!    first judged by the NEXT whole evaluation. A caller cannot ask a
//!    negation to be answered against two different worlds, because there is
//!    no verb that would let them.
//!
//! 4. EXHAUSTION IS A FACT, not an error. A wall emits a `hole` into the store,
//!    so the unfinished part names itself. [`Session::evaluate`] therefore
//!    returns the answer AND the margin, and reserves `Err` for a defect.
//!
//! 5. ROWS ARE NOT FACTS AND THE WALL IS COUNTED IN ROWS — measured at 0.507
//!    rows per fact on the JS model. So every field below that reports a margin
//!    says which unit it is in, in its name. The category error has been made
//!    here once already.
//!
//! What is deliberately NOT here: any way to mutate the world mid-evaluation,
//! and any query that hides whether it probed or scanned.

use crate::engine::{Eval, Halt, Mode, TickOutcome};
use crate::reflect::{bootstrap_kernel, Vocab};
use crate::rofl_parse::{self, Book, Tense};
use crate::store::{write_fact_key, Store, F_BASE};
use crate::term::{Heap, Sym, Term, TermK};

/// A world. Built once with [`Session::open`], then forked per unit of work.
pub struct Session {
    pub eval: Eval,
    /// Witness references the seed named but did not carry. Not an error — the
    /// harness has warned rather than failed on these since the corpus was
    /// first green — but a caller handed a snapshot should be able to see it.
    pub dangling: usize,
}

/// What [`Session::evaluate`] answers. Measurement 4: the answer AND the margin.
pub struct Evaluated {
    /// A wall was hit and a `hole` names the unfinished part in the store.
    pub partial: bool,
    /// Facts waiting for the next tick boundary.
    pub staged: usize,
    /// Steps spent. Compare against the budget to read the remaining margin.
    pub steps: i64,
    /// The high-water mark of the join accumulator, IN ROWS (measurement 5),
    /// against `space`, which is also in rows.
    pub peak_rows: i64,
    pub space: i64,
}

/// What [`Session::ask`] answers. Measurement 1 is the whole reason for the
/// three cost fields: they are the difference between 5.5 ms and 12 469 ms,
/// and they are visible before the caller is surprised by it.
pub struct Answer {
    /// Variable names in the order they first appear in the query. `_` is
    /// dropped by the parser into a fresh name, so a wildcard is a column too.
    pub vars: Vec<String>,
    /// One row per match: the bindings, canonically rendered, in `vars` order.
    pub rows: Vec<Vec<String>>,
    /// The whole matched fact, in `canonicalState`'s key form. A caller that
    /// wants the fact rather than the bindings has it without a second ask.
    pub keys: Vec<String>,
    /// Candidates the store handed back before filtering. THIS is the number
    /// that separates the three orders of magnitude, not `rows.len()`.
    pub scanned: usize,
    /// True when the store served an index, false when it declined and the
    /// relation was walked. A caller tuning a question watches this flip.
    pub probed: bool,
    pub micros: u128,
}

impl Session {
    /// Build a core from a snapshot. Expensive — 383 ms for the 20 630-fact
    /// packs — and meant to happen once per process. Fork it after that.
    pub fn open(seed_json: &str, budget: i64) -> Result<Session, String> {
        let l = crate::load(seed_json, budget)?;
        Ok(Session { eval: l.eval, dangling: l.dangling })
    }

    /// AN EMPTY WORLD with the kernel's bootstrap tables and nothing else —
    /// `new Rofl()` on the TypeScript side. This is where `load` starts from,
    /// and it is the reason the port no longer needs a seed to exist: a caller
    /// can now build a world out of `.rofl` text alone.
    pub fn fresh(budget: i64) -> Session {
        let mut h = Heap::default();
        let v = Vocab::new(&mut h);
        let mut store = Store::new();
        bootstrap_kernel(&mut h, &v, &mut store);
        Session { eval: Eval::new(h, store, budget, Mode::Rounds, false), dangling: 0 }
    }

    /// A world of one's own, at 3 ms against 383 (measurement 2). The heap and
    /// the store are copied wholesale, so nothing the fork does is visible to
    /// the core or to a sibling — which is what makes 64 volumes cost 5.87x a
    /// single world of the same files instead of 64x.
    pub fn fork(&self) -> Session {
        Session { eval: self.eval.fork(), dangling: self.dangling }
    }

    /// Add base facts, written as ROFL. What they add is not visible to a
    /// negation until the next whole evaluation (measurement 3): this marks
    /// the store dirty and nothing more, so `not p` is never answered against
    /// a half-loaded world. Returns how many facts were NEW.
    ///
    /// Facts only. A clause with a body is a RULE, and rules arrive with the
    /// packs — accepting one here would let a caller change what the world
    /// means without saying so.
    pub fn assert(&mut self, src: &str) -> Result<usize, String> {
        let cs = rofl_parse::parse(&mut self.eval.h, src)?;
        let mut n = 0;
        for c in &cs {
            if !c.body.is_empty() {
                return Err(format!("assert takes facts, not rules: {}", rofl_parse::show(&self.eval.h, c)));
            }
            if c.head.tense != Tense::Now {
                return Err(format!("assert takes facts of the present tense: {}", rofl_parse::show(&self.eval.h, c)));
            }
            let (rel, persp, args) = self.lit_terms(&c.head)?;
            for a in &args {
                if a.is_var() {
                    return Err(format!("a base fact may not carry a variable: {}", rofl_parse::show(&self.eval.h, c)));
                }
            }
            if self.eval.store.add(&self.eval.h, rel, persp, &args, F_BASE) {
                n += 1;
            }
        }
        if n > 0 {
            self.eval.store.dirty = true;
        }
        Ok(n)
    }

    /// LOAD A ROFL PROGRAM — the verb that stops this being an accelerator.
    ///
    /// Until this existed, `open` meant `open(seed)` and the only way into a
    /// Rust world was a snapshot the TypeScript kernel had made, so the port
    /// could not be handed to anyone without handing them the pair.
    ///
    /// `who` is the author. A caller may not spell a `$` principal; the one
    /// way into the kernel's ring is `$kernel_authority` written as the FIRST
    /// clause of the FIRST load, in the file itself, where a reader can see it.
    ///
    /// A refusal returns EVERY diagnostic and leaves the store exactly as it
    /// was — a program with three bad clauses hears about all three and puts
    /// nothing in the world.
    ///
    /// THE RULES ARE RE-PREPARED AFTERWARDS, and that is not a detail: rules
    /// live in the store as reflection facts, and the peeled strata, the body
    /// plans and the demand grouping are all computed from them. A load that
    /// added rules and left `self.rules` alone would evaluate the OLD program
    /// against the NEW facts, silently.
    pub fn load(&mut self, src: &str, who: Option<&str>) -> Result<usize, Vec<String>> {
        let r = crate::program::load_program(&mut self.eval, src, who);
        if !r.ok {
            return Err(r.diagnostics);
        }
        self.eval.reprepare();
        Ok(r.admitted)
    }

    /// Run to fixpoint, or to a wall. `Err` is a defect or a stratification
    /// refusal; a budget or space wall is NOT an error (measurement 4) — it
    /// comes back as `partial` with a `hole` in the store naming what is
    /// unfinished.
    pub fn evaluate(&mut self) -> Result<Evaluated, Halt> {
        let o = match self.eval.run() {
            Ok(o) => o,
            Err(Halt::Budget(_, _)) => {
                return Ok(Evaluated {
                    partial: true,
                    staged: 0,
                    steps: self.eval.steps,
                    peak_rows: self.eval.peak_rows,
                    space: self.eval.space,
                })
            }
            Err(e) => return Err(e),
        };
        Ok(Evaluated {
            partial: o.partial,
            staged: o.staged,
            steps: self.eval.steps,
            peak_rows: self.eval.peak_rows,
            space: self.eval.space,
        })
    }

    /// The boundary. Staged `@next` facts are installed here, and here is the
    /// only place a volume may be lifted (measurement 3).
    pub fn tick(&mut self) -> Result<TickOutcome, Halt> {
        self.eval.tick_advance()
    }

    /// Ask one literal, written as ROFL: `edge(a, X)`, `kind[js](F, _)`.
    ///
    /// The query language is the SOURCE language, which is the whole reason the
    /// hand-written parser is in this crate: a caller who can write a rule can
    /// write a question, and there is no second syntax to learn or to keep in
    /// step. `_` and a named variable are both columns; a repeated variable
    /// constrains, as it does in a body.
    pub fn ask(&mut self, query: &str) -> Result<Answer, String> {
        let t0 = std::time::Instant::now();
        let src = format!("{}.", query.trim().trim_end_matches('.'));
        let cs = rofl_parse::parse(&mut self.eval.h, &src)?;
        if cs.len() != 1 || !cs[0].body.is_empty() {
            return Err("ask takes exactly one literal".into());
        }
        let lit = &cs[0].head;
        let (rel, persp, args) = self.lit_terms(lit)?;
        let persp_opt = match lit.book {
            Book::Bare => None,
            _ => Some(persp),
        };

        // The bound positions, and the variables in order of first appearance.
        // A variable seen twice is not a second column, it is a constraint —
        // recorded here as the position it must equal.
        let mut pos: Vec<usize> = Vec::new();
        let mut vals: Vec<Term> = Vec::new();
        let mut vars: Vec<String> = Vec::new();
        let mut col: Vec<usize> = Vec::new(); // for each var, the position read
        let mut same: Vec<(usize, usize)> = Vec::new();
        for (i, a) in args.iter().enumerate() {
            match a.kind() {
                TermK::Var(s) => {
                    let n = self.eval.h.name(s).to_string();
                    match vars.iter().position(|v| *v == n) {
                        Some(j) => same.push((col[j], i)),
                        None => {
                            vars.push(n);
                            col.push(i);
                        }
                    }
                }
                _ => {
                    pos.push(i);
                    vals.push(*a);
                }
            }
        }

        let cand = self
            .eval
            .store
            .arg_matches(&self.eval.h, rel, persp_opt, args.len(), &pos, &vals);
        let probed = cand.is_some();
        let ids = match cand {
            Some(v) => v,
            None => match persp_opt {
                Some(p) => self.eval.store.rel_persp(&self.eval.h, rel, p),
                None => self.eval.store.rel_all(&self.eval.h, rel),
            },
        };
        let scanned = ids.len();

        // `arg_matches` promises a SUPERSET in no order (src/store.ts:477), so
        // every candidate is re-checked here. Skipping this is how a query
        // engine reports rows its index merely suggested.
        let mut rows = Vec::new();
        let mut keys = Vec::new();
        for id in ids {
            if !self.eval.store.alive(id) {
                continue;
            }
            let fa = self.eval.store.args(id);
            if fa.len() != args.len() {
                continue;
            }
            if pos.iter().zip(&vals).any(|(&i, v)| fa[i] != *v) {
                continue;
            }
            if same.iter().any(|&(a, b)| fa[a] != fa[b]) {
                continue;
            }
            let mut row = Vec::with_capacity(col.len());
            for &i in &col {
                let mut s = String::new();
                self.eval.h.canon_term(fa[i], &mut s);
                row.push(s);
            }
            let r = self.eval.store.rec(id);
            let mut k = String::new();
            write_fact_key(&self.eval.h, r.rel, r.persp, fa, &mut k);
            rows.push(row);
            keys.push(k);
        }

        Ok(Answer { vars, rows, keys, scanned, probed, micros: t0.elapsed().as_micros() })
    }

    /// A parsed literal, in this world's vocabulary.
    ///
    /// The terms arrive finished: the parser interns into this same heap, so
    /// there is nothing left to convert. What remains is the book, which is a
    /// SOURCE notion — absent, named, or a variable — and only the first two
    /// mean anything to a question.
    fn lit_terms(&mut self, l: &rofl_parse::Lit) -> Result<(Sym, Sym, Vec<Term>), String> {
        let persp = match l.book {
            Book::Bare => self.eval.v.main,
            Book::Named(n) => n,
            Book::Var(n) => {
                return Err(format!(
                    "a book variable has nothing to bind to here: {}",
                    self.eval.h.name(n)
                ))
            }
        };
        Ok((l.rel, persp, l.args.clone()))
    }
}
