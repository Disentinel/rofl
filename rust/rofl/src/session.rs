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

use std::collections::HashMap;

use crate::describe;
use crate::engine::{Eval, Halt, Mode, TickOutcome, WhyOpts, WhynotBounds, EXPLAIN_WHYNOT_BOUNDS};
use crate::reflect::{self, bootstrap_kernel, is_kernel_ledger, Vocab};
use crate::rofl_parse::{self, Book, Tense};
use crate::store::{write_fact_key, FactId, Store, F_BASE, F_TICK};
use crate::term::{Heap, Sym, Term, TermK};

/// A world. Built once with [`Session::open`], then forked per unit of work.
pub struct Session {
    pub eval: Eval,
    /// Witness references the seed named but did not carry. Not an error — the
    /// harness has warned rather than failed on these since the corpus was
    /// first green — but a caller handed a snapshot should be able to see it.
    pub dangling: usize,
    /// The questions asked so far: a hole a question writes is `$q(N)`, the
    /// reference's `qn` (src/api.ts `query`).
    pub asks: i64,
}

/// What [`Session::retract_delta`] did: the cells brought to their new state,
/// or why the world is evaluated again instead.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Retraction {
    Delta(crate::engine::Delta),
    Full(String),
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
/// The first token of a cooled volume's header line.
pub const VOLUME_MAGIC: &str = "rofl-volume";
/// The layout of the file BELOW the header. Bumped when the rendering changes,
/// separately from the kernel hash, because those are two different reasons a
/// volume can stop being readable.
pub const VOLUME_FORMAT: u32 = 1;

/// `excise` under a cone that left rules out: what the fact supports through those rules is not in the world.
pub const EXCISE_UNDER_ASKS: &str = "excise is not answered under asks: the rules the cone leaves out would lose what the fact supports too; drop the asks";

/// What `cool` did. `facts` is what left memory; `bytes` is what reached the
/// disk, and the two are reported separately because a caller sizing a volume
/// store needs the second and a caller watching pressure needs the first.
pub struct Cooled {
    pub facts: usize,
    pub bytes: usize,
    pub path: String,
}

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
    /// The answers that are shrugs (docs/aggregates.md, "Shrugs, as built"):
    /// the bindings each names, `_` where it does not know, in `vars` order,
    /// and its line (`Eval::shrug_line`).
    pub shrugs: Vec<(Vec<String>, String)>,
    /// The rows may be short of an answer: the evaluation was cut, or an
    /// answer unfolded at a call was left unknown and no shrug row names it
    /// (src/api.ts `query`).
    pub partial: bool,
}

impl Session {
    /// Build a core from a snapshot. Expensive — 383 ms for the 20 630-fact
    /// packs — and meant to happen once per process. Fork it after that.
    pub fn open(seed_json: &str, budget: i64) -> Result<Session, String> {
        let l = crate::load(seed_json, budget)?;
        Ok(Session { eval: l.eval, dangling: l.dangling, asks: 0 })
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
        Session { eval: Eval::new(h, store, budget, Mode::Rounds, false), dangling: 0, asks: 0 }
    }

    /// A world of one's own, as a LAYER over this one. The first fork freezes
    /// what the heap and the store hold into a base that this world and every
    /// fork then share and none of them writes (`Store::freeze`), so a fork
    /// copies no fact, tuple, name or functor: it appends above the base's
    /// ids, and nothing it does is visible to the core or to a sibling.
    pub fn fork(&mut self) -> Session {
        self.eval.settle_provenance();
        self.eval.h.freeze();
        self.eval.store.freeze(&self.eval.h);
        Session { eval: self.eval.fork(), dangling: self.dangling, asks: self.asks }
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
        let mut asked = false;
        for c in &cs {
            if !c.body.is_empty() || c.lattice.is_some() {
                return Err(format!("assert takes facts, not rules or declarations: {}", rofl_parse::show(&self.eval.h, c)));
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
                asked |= rel == self.eval.v.asks || (rel == self.eval.v.explain_request && self.eval.cone.is_some());
            }
        }
        if n > 0 {
            self.eval.store.dirty = true;
        }
        // the rules a world runs are read at prepare: a new ask is only an ask once they are read again
        if asked {
            self.eval.reprepare();
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

    /// THE COMPOSITION FROM BELOW (docs/aggregates.md, "Well-founded worlds
    /// and ticks, as built"): a world evaluated on its own, typically under
    /// `semantics(well_founded)`, hands its answers to this one as base facts
    /// asserted by `below`, and this one aggregates them stratified. What is
    /// fed is what the world below concludes: every live row, in a program's
    /// book, of a relation a rule of its own concludes (a rule this world
    /// also holds, boot's, is not its own), and every `unknown(Atom)` row the
    /// alternating fixpoint wrote. A declaration the kernel reads
    /// (`semantics`, `sealed`, `stratum`) is not an answer and is not fed.
    ///
    /// What the world below has no answer for crosses as a shrug
    /// (docs/aggregates.md, "Shrugs, as built"): each atom it names a shrug,
    /// and every row of each relation it feeds when a wall cut it, is written
    /// here as `hole($below(Rel, Book, Args), left_out_below)`, which this
    /// world carries as what a hole left out. Fed as base, it would read as
    /// false. Refused: a world below that is not evaluated.
    /// Returns how many facts were fed.
    pub fn feed_below(&mut self, below: &mut Session) -> Result<usize, String> {
        let b = &mut below.eval;
        if b.store.dirty {
            return Err("the world below is not evaluated".into());
        }
        let mine: std::collections::HashSet<&str> = self.eval.rules.iter().map(|r| self.eval.h.name(r.id)).collect();
        let declared = [b.v.semantics, b.v.sealed, b.v.stratum];
        let mut fed: std::collections::HashSet<Sym> = b
            .rules
            .iter()
            .filter(|r| !mine.contains(b.h.name(r.id)))
            .map(|r| r.clause.head.rel)
            .filter(|r| brk!("below_feeds_declarations" => true; !declared.contains(r)))
            .collect();
        if brk!("below_drops_unknown" => false; true) {
            fed.insert(b.v.unknown);
        }
        let mut keys: Vec<String> = Vec::new();
        for id in b.store.all_facts() {
            let r = b.store.rec(id);
            if !b.store.alive(id) || !fed.contains(&r.rel) || is_kernel_ledger(&b.h, r.persp) || brk!("below_drops_concluded_input" => r.base(); false) {
                continue;
            }
            let mut k = String::new();
            write_fact_key(&b.h, r.rel, r.persp, b.store.args(id), &mut k);
            keys.push(k);
        }
        keys.sort_by(|x, y| crate::term::cmp_js(x, y));
        // what it has no answer for: an atom a shrug names, or every row of a
        // relation it feeds when a wall cut it
        let mut open: Vec<(Sym, Option<Sym>, Vec<Term>)> = Vec::new();
        if b.store.partial_eval {
            let mut rels: Vec<Sym> = fed.iter().copied().collect();
            rels.sort_by(|x, y| crate::term::cmp_js(b.h.name(*x), b.h.name(*y)));
            open.extend(rels.into_iter().map(|r| (r, None, Vec::new())));
        }
        let (every, inn) = (b.h.intern("every"), b.h.intern("in"));
        for id in b.store.rel_all(&b.h, b.v.shrug) {
            let t = b.store.args(id)[0];
            let (persp, at) = match t.kind() {
                TermK::Func(i) if b.h.fname(i) == inn && b.h.fargs(i).len() == 2 => match b.h.fargs(i)[0].as_atom() {
                    Some(p) => (p, b.h.fargs(i)[1]),
                    None => continue,
                },
                _ => (b.v.main, t),
            };
            let (rel, args) = match at.kind() {
                TermK::Atom(r) => (r, Vec::new()),
                TermK::Func(i) if b.h.fname(i) == every => match b.h.fargs(i)[0].as_atom() {
                    Some(r) if fed.contains(&r) => {
                        open.push((r, None, Vec::new()));
                        continue;
                    }
                    _ => continue,
                },
                TermK::Func(i) => (b.h.fname(i), b.h.fargs(i).to_vec()),
                _ => continue,
            };
            if brk!("below_drops_shrugs" => false; fed.contains(&rel) && !b.h.name(rel).starts_with('$')) {
                open.push((rel, Some(persp), args));
            }
        }
        let text: String = keys.iter().map(|k| format!("{k}.\n")).collect();
        self.load(&text, Some("below")).map_err(|d| format!("what the world below concludes does not load here: {}", d.join("; ")))?;
        let e = &mut self.eval;
        let (mark, cause, any) = (e.h.intern("$below"), e.h.atom("left_out_below"), e.h.atom("$any"));
        for (rel, persp, args) in open {
            let rel = e.h.intern(below.eval.h.name(rel));
            let persp = persp.map(|p| e.h.atom(below.eval.h.name(p))).unwrap_or(any);
            let args = if persp == any { any } else {
                let xs: Vec<Term> = args.iter().map(|a| crate::term::copy_term(&below.eval.h, *a, &mut e.h)).collect();
                e.h.list(&xs)
            };
            let target = e.h.mkf(mark, &[Term::atom(rel), persp, args]);
            e.store.add(&e.h, e.v.hole, e.v.kernel_persp, &[target, cause], crate::store::F_BASE | crate::store::F_FROZEN);
        }
        self.eval.store.dirty = true;
        Ok(keys.len())
    }

    /// Run to fixpoint, or to a wall. `Err` is a defect or a stratification
    /// refusal; a budget or space wall is NOT an error (measurement 4) — it
    /// comes back as `partial` with a `hole` in the store naming what is
    /// unfinished.
    pub fn evaluate(&mut self) -> Result<Evaluated, Halt> {
        let o = match self.eval.run() {
            Ok(o) => o,
            Err(Halt::Budget(_, _)) => {
                // The wall unwinds past `run`'s own exits, so the record is
                // written here: a tick that ran out is exactly the one whose
                // budget a replay must be given.
                self.eval.store.note_eval(self.eval.budget, self.eval.steps, true);
                // a wall judges the promises like any other exit, and a world
                // that breaks one stays dirty
                self.eval.check_promises()?;
                // as the reference's run does after either wall: the hole is
                // the answer, and asking again must not pay for the run again
                self.eval.store.dirty = false;
                self.eval.store.partial_eval = true;
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

    /// COOL A VOLUME TO DISK: write its facts out as ROFL and drop them.
    ///
    /// A VOLUME IS A KEY PREFIX (docs/volumes-and-residency.md). Which volume a
    /// fact belongs to is decided by the SCANNER when it mints an id — nothing
    /// is derived, because a derived answer would need the data in order to
    /// find the data. `scanners/js_ast.ts` mints every node id as
    /// `n<sha256(path)[0..8]>_<counter>`, so a file is a prefix of every id it
    /// produced, and this reads that prefix off the key.
    ///
    /// THE RULES NEVER MENTION VOLUMES AND MUST NOT. All 64 volumes agreed byte
    /// for byte while no rule knew volumes existed; locality here is a property
    /// of the DATA, and a rule that named a volume would stop being about the
    /// domain and start being about storage. So this is a host operation over
    /// keys, and `rules/ingest.rofl` only ever says a book is `coolable`.
    ///
    /// ONLY BASE FACTS ARE WRITTEN AND DROPPED. A derived fact is not a
    /// possession, it is a conclusion — re-derived from what remains — so
    /// carrying it to disk would store an answer beside the question and let
    /// the two disagree. Dropping the base layer marks the store dirty and the
    /// next evaluation rebuilds what still follows.
    ///
    /// The caller is what records the act: `cooled[code](File, Path)` so the
    /// file stays INDEXED rather than returning to the frontier, and
    /// `hole($cold(File), cooled_to_disk)` so a question about the cold volume
    /// REFUSES instead of answering empty. Neither is written here, because
    /// both are statements about a corpus and this function knows only a
    /// prefix.
    pub fn cool(&mut self, prefix: &str, out: &str) -> Result<Cooled, String> {
        let (write, drop) = self.volume(prefix);
        // THE HEADER IS A REFUSAL WAITING TO HAPPEN, and that is its whole
        // point. A volume is ROFL text, so no change to the store's layout can
        // make it unreadable — but the kernel's own programs decide what a
        // fact may say and how a rule is encoded, and a volume written under
        // one policy and reheated under another still PARSES while meaning
        // something else. That is the exact shape of the stale corpus this
        // branch found today: an artefact that cannot go red on its own.
        //
        // A comment line, so the file stays ordinary ROFL and `load` will
        // still take it. `reheat` is what checks — see the note there for the
        // hole that leaves open, which is deliberate and named rather than
        // pretended away.
        let mut text = self.header(prefix);
        for id in &write {
            let r = self.eval.store.rec(*id);
            let args = self.eval.store.args(*id).to_vec();
            write_fact_key(&self.eval.h, r.rel, r.persp, &args, &mut text);
            text.push_str(".\n");
        }
        std::fs::write(out, &text).map_err(|e| format!("{out}: {e}"))?;
        self.eval.store.remove_many(&drop);
        self.eval.store.dirty = true;
        Ok(Cooled { facts: write.len(), bytes: text.len(), path: out.to_string() })
    }

    /// COOL THE ASSERTION TRAIL: the `why was this here` layer, parked.
    ///
    /// `asserted_by` is two-thirds of what a load writes and half of what a
    /// world then holds — measured on 16 eslint files, 41 722 rows against
    /// 43 078 base facts, and dropping it takes a load from 331 ms to 94. It is
    /// also the layer nobody asks about until something is wrong.
    ///
    /// SEALING IT WOULD BE CHEAPER AND WORSE. `sealed(assertions)` already
    /// exists and gets the same numbers, but the information is then never
    /// written and `why` can never be answered, at any price. Cooling parks it:
    /// the rows go to disk and come back when a question needs them.
    ///
    /// THE HOLE IS WHAT MAKES IT HONEST. A world whose trail is cold must
    /// REFUSE a question about authorship rather than answer it empty, because
    /// an empty audit and a clean one are the same two characters — so the
    /// caller writes `hole($cold(assertions), cooled_to_disk)` as it cools,
    /// exactly as it does for a volume.
    pub fn cool_trail(&mut self, out: &str) -> Result<Cooled, String> {
        let ab = self.eval.v.asserted_by;
        let mut ids = Vec::new();
        for id in self.eval.store.all_facts() {
            if self.eval.store.alive(id) && self.eval.store.rec(id).rel == ab {
                ids.push(id);
            }
        }
        let mut text = self.header("$trail");
        for id in &ids {
            let r = self.eval.store.rec(*id);
            let args = self.eval.store.args(*id).to_vec();
            write_fact_key(&self.eval.h, r.rel, r.persp, &args, &mut text);
            text.push_str(".\n");
        }
        std::fs::write(out, &text).map_err(|e| format!("{out}: {e}"))?;
        self.eval.store.remove_many(&ids);
        self.eval.store.dirty = true;
        Ok(Cooled { facts: ids.len(), bytes: text.len(), path: out.to_string() })
    }

    /// REHEAT THE TRAIL, PAST THE DOOR, and the signature is what earns that.
    ///
    /// `asserted_by` lives in `[$kernel]`, and a program may not write a kernel
    /// ledger — rightly, since that is the whole `$` ring. So a cooled trail
    /// cannot come back through `load`, and this adds to the store directly.
    ///
    /// THAT IS THE SAME CATEGORY AS `seed::restore`, NOT A NEW ONE: the door
    /// exists to judge UNTRUSTED INPUT, and a file this engine wrote of its own
    /// state is not input, it is the state. What makes the claim checkable is
    /// the header — the volume names the kernel it was written under, and a
    /// mismatch is refused rather than translated, because translating needs
    /// the meaning that has been lost.
    pub fn reheat_trail(&mut self, path: &str) -> Result<usize, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
        let head = text.lines().next().unwrap_or("");
        let want = format!("-- {VOLUME_MAGIC} {VOLUME_FORMAT} kernel={}", crate::kernel::hash());
        if !head.starts_with(&want) {
            return Err(format!(
                "{path}: not a trail this engine wrote, so what it means is unknown.\n  \
                 header: {head}\n  wanted: {want}..."
            ));
        }
        let cs = rofl_parse::parse(&mut self.eval.h, &text)?;
        let ab = self.eval.v.asserted_by;
        let kp = self.eval.v.kernel_persp;
        let mut n = 0;
        for c in &cs {
            if !c.body.is_empty() || c.lattice.is_some() || c.head.rel != ab {
                return Err(format!("{path}: a trail holds `asserted_by` facts and nothing else"));
            }
            let args = c.head.args.clone();
            if self.eval.store.add(&self.eval.h, ab, kp, &args, F_BASE) {
                n += 1;
            }
        }
        self.eval.store.dirty = true;
        Ok(n)
    }

    /// REHEAT A COOLED VOLUME, refusing one this engine did not write.
    ///
    /// The check is a REFUSAL and never a repair: told the kernel has moved, a
    /// caller re-parses the source, which is cheap — 28 MB/s measured on real
    /// eslint AST facts — and is the only thing that can be right. Rewriting an
    /// old volume to the new meaning would require knowing what it meant, which
    /// is precisely what has been lost.
    ///
    /// THE HOLE, NAMED: a cooled volume is ordinary ROFL, so `load` will take
    /// it without looking at the header. That is deliberate — a volume must
    /// stay readable by anything that reads ROFL, including a person — and it
    /// means the check lives on the path a driver uses rather than on the
    /// format. A driver that reaches for `load` instead of `reheat` gets no
    /// protection, and the gate says so rather than the doc claiming otherwise.
    pub fn reheat(&mut self, path: &str) -> Result<usize, Vec<String>> {
        let text = std::fs::read_to_string(path).map_err(|e| vec![format!("{path}: {e}")])?;
        let head = text.lines().next().unwrap_or("");
        let want = format!("-- {VOLUME_MAGIC} {VOLUME_FORMAT} kernel={}", crate::kernel::hash());
        if !head.starts_with(&want) {
            return Err(vec![format!(
                "{path}: not a volume this engine wrote, so what it means is unknown.\n                   header: {head}\n  wanted: {want}...\n                   Re-parse the source instead; a volume cannot be translated, because \
                 translating it needs the meaning that has been lost."
            )]);
        }
        self.load(&text, None)
    }

    /// Every live BASE fact IN A PROGRAM'S OWN BOOK carrying an atom whose name
    /// begins with `prefix`, looked for inside functors too — an id can be
    /// nested, and a volume that dropped only the top-level mentions would
    /// leave half a file behind.
    ///
    /// WHAT IS WRITTEN AND WHAT IS REMOVED ARE NOT THE SAME SET, and conflating
    /// them is the defect that made cooling useless.
    ///
    /// The kernel writes `in_perspective` and `asserted_by` into `[$kernel]`
    /// about every fact a program asserts, and those rows MENTION the volume —
    /// the fact is reified inside a `$fact(...)` functor, so a prefix search
    /// finds them. The first version excluded them from BOTH halves, which was
    /// half right and wholly wrong:
    ///
    ///   * excluding them from what is WRITTEN is correct. The trail is what
    ///     the kernel says ABOUT an assertion; a reheat IS a fresh assertion
    ///     and earns a fresh trail dated to when it actually happened. A volume
    ///     carrying the old trail would claim a fact was asserted at a time it
    ///     was not — and the door refuses it anyway, since `$` marks a kernel
    ///     ledger a program may not write.
    ///   * excluding them from what is REMOVED left the trail behind forever.
    ///     Measured over 64 eslint files: every file cooled on every tick and
    ///     the world still grew 18 360 -> 295 185 facts, because the trail is
    ///     roughly two rows per fact and none of it ever left. Cooling freed
    ///     the smaller half and kept the larger.
    ///
    /// So: `write` is the program's own facts, `drop` is everything about the
    /// volume including the kernel's account of it.
    pub fn volume(&mut self, prefix: &str) -> (Vec<FactId>, Vec<FactId>) {
        self.eval.settle_provenance();
        let mut write = Vec::new();
        let mut drop = Vec::new();
        for id in self.eval.store.all_facts() {
            if !self.eval.store.alive(id) {
                continue;
            }
            let args = self.eval.store.args(id).to_vec();
            if !args.iter().any(|a| self.mentions(*a, prefix)) {
                continue;
            }
            let r = self.eval.store.rec(id);
            let kernel = is_kernel_ledger(&self.eval.h, r.persp);
            if r.base() && !kernel {
                write.push(id);
            }
            drop.push(id);
        }
        (write, drop)
    }

    /// COOL MANY VOLUMES IN ONE PASS.
    ///
    /// `cool` walks every fact in the world to find one volume's, so cooling N
    /// volumes one at a time is N walks over a world that is still shrinking —
    /// quadratic, and measured as such: 8 volumes a tick over 64 files took
    /// cooling from 73 ms to 4 699 ms while the work per tick was constant.
    /// One pass, N prefixes.
    pub fn cool_many(&mut self, vols: &[(String, String)]) -> Result<Vec<Cooled>, String> {
        // FOUR PHASES, TIMED SEPARATELY, because "cooling is 61 per cent of the
        // run" is not a place you can optimise. Walking the world, matching a
        // prefix, rendering a fact to text and writing bytes are four different
        // costs and only one of them is the FORMAT.
        // A FACT FINDS ITS VOLUME BY LOOKUP, NOT BY SEARCH.
        //
        // This asked, for every fact, whether any of the batch's prefixes
        // matched any of its arguments — a product, and measured as one: over
        // the whole of eslint, matching was 13 168 ms for 456 volumes and
        // 28 852 ms for 658, against 150 ms of rendering and 78 ms of disk.
        // NINETY-EIGHT PER CENT OF COOLING WAS THE SEARCH. `cool_many`'s own
        // comment boasts of replacing one walk per volume with one walk for all
        // of them, and the product had simply moved INSIDE the walk.
        //
        // Volume prefixes are fixed-length strings, so they group by length and
        // each length costs one hash lookup: `name[..len]` against a map. Two
        // volumes of different prefix lengths cost two lookups, not two scans.
        let mut by_len: HashMap<usize, HashMap<&str, usize>> = HashMap::new();
        for (i, (p, _)) in vols.iter().enumerate() {
            by_len.entry(p.len()).or_default().insert(p.as_str(), i);
        }
        let t0 = std::time::Instant::now();
        let mut ns_match = 0u128;
        let mut ns_render = 0u128;
        self.eval.settle_provenance();
        let mut texts: Vec<String> = vols.iter().map(|(p, _)| self.header(p)).collect();
        let mut counts = vec![0usize; vols.len()];
        let mut drop: Vec<FactId> = Vec::new();
        for id in self.eval.store.all_facts() {
            if !self.eval.store.alive(id) {
                continue;
            }
            let args = self.eval.store.args(id).to_vec();
            let m0 = std::time::Instant::now();
            let hit = self.volume_of(&args, &by_len);
            ns_match += m0.elapsed().as_nanos();
            let Some(k) = hit else { continue };
            let r = self.eval.store.rec(id);
            if r.base() && !is_kernel_ledger(&self.eval.h, r.persp) {
                let w0 = std::time::Instant::now();
                write_fact_key(&self.eval.h, r.rel, r.persp, &args, &mut texts[k]);
                texts[k].push_str(".\n");
                ns_render += w0.elapsed().as_nanos();
                counts[k] += 1;
            }
            drop.push(id);
        }
        let t_walk = t0.elapsed().as_millis();
        let t1 = std::time::Instant::now();
        let mut out = Vec::with_capacity(vols.len());
        for (i, (_, path)) in vols.iter().enumerate() {
            std::fs::write(path, &texts[i]).map_err(|e| format!("{path}: {e}"))?;
            out.push(Cooled { facts: counts[i], bytes: texts[i].len(), path: path.clone() });
        }
        let t_write = t1.elapsed().as_millis();
        let t2 = std::time::Instant::now();
        self.eval.store.remove_many(&drop);
        if std::env::var("ROFL_COOL_PHASES").is_ok() {
            eprintln!(
                "cool: walk {}ms (match {}ms render {}ms) write {}ms remove {}ms | {} vols {} facts {} bytes",
                t_walk, ns_match / 1_000_000, ns_render / 1_000_000, t_write,
                t2.elapsed().as_millis(), vols.len(),
                counts.iter().sum::<usize>(), texts.iter().map(|t| t.len()).sum::<usize>()
            );
        }
        self.eval.store.dirty = true;
        Ok(out)
    }

    /// Which of the batch's volumes this fact belongs to, by lookup.
    ///
    /// Walks the fact's terms once and, for each atom or functor name, tries
    /// one map lookup per distinct prefix LENGTH in the batch — in practice
    /// one, since a scanner mints ids of a single shape. The old form asked
    /// every prefix about every argument, which is the product this replaces.
    fn volume_of(
        &self,
        args: &[Term],
        by_len: &HashMap<usize, HashMap<&str, usize>>,
    ) -> Option<usize> {
        for a in args {
            if let Some(k) = self.volume_of_term(*a, by_len) {
                return Some(k);
            }
        }
        None
    }

    fn volume_of_term(
        &self,
        t: Term,
        by_len: &HashMap<usize, HashMap<&str, usize>>,
    ) -> Option<usize> {
        match t.kind() {
            TermK::Atom(a) => self.lookup_name(self.eval.h.name(a), by_len),
            TermK::Func(i) => {
                if let Some(k) = self.lookup_name(self.eval.h.name(self.eval.h.fname(i)), by_len) {
                    return Some(k);
                }
                self.eval
                    .h
                    .fargs(i)
                    .iter()
                    .find_map(|x| self.volume_of_term(*x, by_len))
            }
            _ => None,
        }
    }

    fn lookup_name(&self, n: &str, by_len: &HashMap<usize, HashMap<&str, usize>>) -> Option<usize> {
        for (len, m) in by_len {
            if n.len() >= *len {
                if let Some(k) = m.get(&n[..*len]) {
                    return Some(*k);
                }
            }
        }
        None
    }

    fn header(&self, prefix: &str) -> String {
        format!("-- {VOLUME_MAGIC} {VOLUME_FORMAT} kernel={} prefix={prefix}\n",
            crate::kernel::hash())
    }

    fn mentions(&self, t: Term, prefix: &str) -> bool {
        match t.kind() {
            TermK::Atom(a) => self.eval.h.name(a).starts_with(prefix),
            TermK::Func(i) => {
                self.eval.h.name(self.eval.h.fname(i)).starts_with(prefix)
                    || self.eval.h.fargs(i).iter().any(|x| self.mentions(*x, prefix))
            }
            _ => false,
        }
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
        self.asks += 1;
        if let Some(m) = &self.eval.promise_broken {
            return Err(m.clone());
        }
        let src = format!("{}.", query.trim().trim_end_matches('.'));
        let cs = rofl_parse::parse(&mut self.eval.h, &src)?;
        if cs.len() != 1 || !cs[0].body.is_empty() || cs[0].lattice.is_some() {
            return Err("ask takes exactly one literal".into());
        }
        let lit = &cs[0].head;
        let (rel, persp, args) = self.lit_terms(lit)?;
        // ASKING A SEALED BODY REFUSES, as src/api.ts `query` does: a hole named for the question, and a partial answer
        if crate::program::sealed_rels(&mut self.eval).contains(&rel) && brk!("ask_sealed_answers" => false; true) {
            let q = self.eval.h.intern("$q");
            let id = self.eval.h.mkf(q, &[Term::int(self.asks)]);
            let reason = Term::atom(self.eval.h.intern("reflection_sealed"));
            self.eval.store.put(&self.eval.h, self.eval.v.hole, self.eval.v.kernel_persp, &[id, reason], F_BASE | crate::store::F_FROZEN);
            let vars = args.iter().filter_map(|a| match a.kind() { TermK::Var(v) => Some(v), _ => None }).map(|v| self.eval.h.name(v).to_string()).fold(Vec::new(), |mut vs: Vec<String>, n| {
                if !vs.contains(&n) {
                    vs.push(n);
                }
                vs
            });
            return Ok(Answer { vars, rows: Vec::new(), keys: Vec::new(), scanned: 0, probed: false, micros: t0.elapsed().as_micros(), shrugs: Vec::new(), partial: true });
        }
        if let Some(m) = self.eval.outside_cone(rel) {
            return Err(m);
        }
        if rel == self.eval.v.derived_by {
            self.eval.settle_provenance();
        }
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

        // A RELATION UNFOLDED AT A CALL is answered as the reference's `query` answers it: its rules
        // unfolded under the question, which leaves the world as it was (`Eval::answer_on_demand`)
        let mut partial = self.eval.store.partial_eval;
        let (rows, keys, scanned, probed) = if self.eval.answers_open(rel) && brk!("ask_store_only" => false; true) {
            let el = self.one_lit(query)?;
            // A WALL MET ANSWERING is a hole named for the question, and the answer is partial
            let (sols, unnamed) = match self.eval.answer_on_demand(&el) {
                Ok(got) => got,
                Err(Halt::Budget(wall, _)) if brk!("ask_wall_errors" => false; true) => {
                    let q = self.eval.h.intern("$q");
                    let id = self.eval.h.mkf(q, &[Term::int(self.asks)]);
                    // the hole says which wall fell: steps or rows
                    let reason = Term::atom(brk!("ask_wall_unnamed" => self.eval.v.budget_reason; self.eval.h.intern(wall)));
                    self.eval.store.put(&self.eval.h, self.eval.v.hole, self.eval.v.kernel_persp, &[id, reason], crate::store::F_BASE | crate::store::F_FROZEN);
                    (Vec::new(), true)
                }
                Err(h) => return Err(describe(&h)),
            };
            partial |= unnamed;
            let mut named: Vec<usize> = (0..vars.len()).collect();
            named.sort_by(|a, b| crate::term::cmp_js(&vars[*a], &vars[*b]));
            let mut got: Vec<(String, Vec<String>, String)> = Vec::new();
            let mut texts: std::collections::HashSet<String> = std::collections::HashSet::new();
            for sol in &sols {
                let row: Vec<String> = vars
                    .iter()
                    .map(|v| {
                        let vt = self.eval.h.var(v);
                        let t = crate::term::resolve(&mut self.eval.h, vt, sol);
                        let mut o = String::new();
                        self.eval.h.canon_term(t, &mut o);
                        o
                    })
                    .collect();
                let text = if vars.is_empty() { "true".to_string() } else { named.iter().map(|&i| format!("{} = {}", vars[i], row[i])).collect::<Vec<_>>().join(", ") };
                let seen = brk!("ask_dedup_scan" => got.iter().any(|g| g.0 == text); !texts.insert(text.clone()));
                if seen {
                    continue;
                }
                let fa: Vec<Term> = args.iter().map(|a| crate::term::resolve(&mut self.eval.h, *a, sol)).collect();
                let mut k = String::new();
                write_fact_key(&self.eval.h, rel, persp, &fa, &mut k);
                got.push((text, row, k));
            }
            got.sort_by(|a, b| crate::term::cmp_js(&a.0, &b.0));
            let n = got.len();
            let (rows, keys): (Vec<Vec<String>>, Vec<String>) = got.into_iter().map(|(_, r, k)| (r, k)).unzip();
            (rows, keys, n, false)
        } else {
            // A RELATION ANSWERED FROM A STRUCTURE (the closure of a declared tree) has no rows to find: its rows are read off the tree
            let virt = self.eval.vclosure_query(rel, persp_opt, &args);
            let cand = if virt.is_some() {
                Some(Vec::new())
            } else {
                self.eval.store.arg_matches(&self.eval.h, rel, persp_opt, args.len(), &pos, &vals)
            };
            let probed = cand.is_some();
            let ids = match cand {
                Some(v) => v,
                None => match persp_opt {
                    Some(p) => self.eval.store.rel_persp(&self.eval.h, rel, p),
                    None => self.eval.store.rel_all(&self.eval.h, rel),
                },
            };
            let scanned = ids.len() + virt.as_ref().map_or(0, |v| v.len());

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
            for (book, a, d) in virt.unwrap_or_default() {
                let fa = [a, d];
                if pos.iter().zip(&vals).any(|(&i, v)| fa[i] != *v) || same.iter().any(|&(x, y)| fa[x] != fa[y]) {
                    continue;
                }
                let row: Vec<String> = col
                    .iter()
                    .map(|&i| {
                        let mut s = String::new();
                        self.eval.h.canon_term(fa[i], &mut s);
                        s
                    })
                    .collect();
                let mut k = String::new();
                write_fact_key(&self.eval.h, rel, book, &fa, &mut k);
                rows.push(row);
                keys.push(k);
            }
            (rows, keys, scanned, probed)
        };

        let lit = self.one_lit(query)?;
        let mut shrugs: Vec<(Vec<String>, String)> = Vec::new();
        let mut order: Vec<String> = Vec::new();
        for (f, s) in self.eval.shrugs_of(&lit) {
            let row: Vec<String> = vars
                .iter()
                .map(|v| {
                    let vt = self.eval.h.var(v);
                    let t = crate::term::resolve(&mut self.eval.h, vt, &s);
                    if matches!(t.kind(), TermK::Var(_)) { "_".to_string() } else { self.eval.shown(t) }
                })
                .collect();
            let line = self.eval.shrug_line(f);
            {
                // one per reading and reason, the least line where several say it, ordered as the bindings read,
                // then by the reason (`query`, src/api.ts)
                let reason = self.eval.store.args(f)[1];
                let mut key = if vars.is_empty() { "true".to_string() } else { vars.iter().zip(&row).map(|(v, x)| format!("{v} = {x}")).collect::<Vec<_>>().join(", ") };
                key.push('\u{0}');
                match reason.kind() {
                    TermK::Atom(s) => key.push_str(self.eval.h.name(s)),
                    _ => self.eval.h.canon_term(reason, &mut key),
                }
                match order.iter().position(|k| *k == key) {
                    Some(i) if crate::term::cmp_js(&line, &shrugs[i].1).is_lt() => shrugs[i] = (row, line),
                    Some(_) => {}
                    None => {
                        order.push(key);
                        shrugs.push((row, line));
                    }
                }
            }
        }
        let mut by: Vec<usize> = (0..shrugs.len()).collect();
        by.sort_by(|a, b| crate::term::cmp_js(&order[*a], &order[*b]));
        let mut shrugs: Vec<(Vec<String>, String)> = by.into_iter().map(|i| std::mem::take(&mut shrugs[i])).collect();
        // A WALL CUT THE WORLD: every answer that does not hold is no answer
        if self.eval.store.partial_eval {
            let budget = self.eval.h.atom("budget");
            for f in self.eval.store.rel_persp(&self.eval.h, self.eval.v.shrug, self.eval.v.kernel_persp) {
                let a = self.eval.store.args(f).to_vec();
                let kernel_target = match a[0].kind() {
                    TermK::Atom(s) => self.eval.h.name(s).starts_with('$'),
                    TermK::Func(i) => self.eval.h.name(self.eval.h.fname(i)).starts_with('$'),
                    _ => false,
                };
                if a[1] == budget && kernel_target {
                    shrugs.push((vars.iter().map(|_| "_".to_string()).collect(), self.eval.shrug_line(f)));
                    break;
                }
            }
        }
        Ok(Answer { vars, rows, keys, scanned, probed, micros: t0.elapsed().as_micros(), shrugs, partial })
    }

    /// A parsed literal, in this world's vocabulary.
    ///
    /// The terms arrive finished: the parser interns into this same heap, so
    /// there is nothing left to convert. What remains is the book, which is a
    /// SOURCE notion — absent, named, or a variable — and only the first two
    /// mean anything to a question.
    /// `Rofl.save` (src/api.ts:261): this world as a seed, which `open` reads
    /// back. The way OUT existed on one side only until now — a port that can
    /// be handed a world and cannot hand one back is half a pipe.
    ///
    /// ONE FIELD GOES OUT EMPTY AND IT IS NOT A ROUNDING ERROR: `evals`, the
    /// per-tick record of what the standing evaluation was allowed and what it
    /// spent. This store does not keep it; `crate::seed` says why it matters.
    pub fn save(&mut self) -> String {
        self.eval.settle_provenance();
        crate::seed::snapshot(&self.eval.h, &self.eval.store)
    }

    /// `Rofl.run` (src/api.ts:1199): boundaries until the world stops moving.
    ///
    /// `quiescent` is the answer the caller wants; `partial` is the one they
    /// have to handle. Running out of budget mid-tick is NOT a pause — the
    /// hole is written into the world and a later, larger budget does not undo
    /// it (f_the_cost_pin_measures_a_fixpoint_that_never_finishes). A caller
    /// who wants to stop and continue stops AT A BOUNDARY, with `tick`.
    pub fn run(&mut self, max_ticks: usize) -> Result<(u32, bool, bool), String> {
        for _ in 0..max_ticks {
            let r = self.tick().map_err(|h| describe(&h))?;
            if r.partial {
                return Ok((self.eval.store.tick, false, true));
            }
            if r.quiescent {
                return Ok((self.eval.store.tick, true, false));
            }
        }
        Ok((self.eval.store.tick, false, false))
    }

    /// `Rofl.holds` (src/api.ts:834). The question with its answer thrown
    /// away — kept because `ask(...)?.rows.is_empty()` at every call site is
    /// how a caller starts writing their own query layer.
    pub fn holds(&mut self, query: &str) -> Result<bool, String> {
        Ok(!self.ask(query)?.rows.is_empty())
    }

    /// `Rofl.factKeys` (src/api.ts:1220), in canonical order. `rel` narrows.
    pub fn fact_keys(&mut self, rel: Option<&str>) -> Vec<String> {
        let want = rel.map(|r| self.eval.h.intern(r));
        if want.is_none_or(|w| w == self.eval.v.derived_by) {
            self.eval.settle_provenance();
        }
        let mut out = Vec::new();
        for id in self.eval.store.live_ids() {
            if want.is_some_and(|w| self.eval.store.rec(id).rel != w) {
                continue;
            }
            out.push(self.eval.store.key(&self.eval.h, id));
        }
        out.sort_by(|a, b| crate::term::cmp_js(a, b));
        out
    }

    /// `Rofl.retract` (src/api.ts:651): take a BASE fact out, and the
    /// `asserted_by` row that recorded who put it there with it.
    ///
    /// A DERIVED FACT IS REFUSED BY NAME rather than removed, because removing
    /// it would leave the rule that concluded it still concluding it — the
    /// caller wants `excise` and is told so.
    pub fn retract(&mut self, query: &str) -> Result<(), String> {
        let (id, key) = self.ground_fact(query, "retract")?;
        let Some(id) = id else { return Err(format!("no such fact: {key}")) };
        if !self.eval.store.rec(id).base() {
            return Err(format!("{key} is derived; retract its supports instead"));
        }
        let mut doomed = vec![id];
        let ft = self.fact_term(id);
        let ab = self.eval.v.asserted_by;
        for f in self.eval.store.rel_all(&self.eval.h, ab) {
            if self.eval.store.args(f).first() == Some(&ft) {
                doomed.push(f);
            }
        }
        let rel = self.eval.store.rec(id).rel;
        let asks = rel == self.eval.v.asks || (rel == self.eval.v.explain_request && self.eval.cone.is_some());
        self.eval.store.remove_many(&doomed);
        self.eval.store.dirty = true;
        if brk!("asks_retract_unread" => false; asks) {
            self.eval.reprepare();
        }
        Ok(())
    }

    /// `retract`, bringing the aggregate cells the fact supported to the state
    /// a fresh evaluation would hold without evaluating the world again
    /// (`Eval::retract_delta`). The world is evaluated first if it is not. A
    /// world or a fact the path is not worked out for is retracted as
    /// `retract` does, and `Full` says why: the next evaluation answers.
    pub fn retract_delta(&mut self, query: &str) -> Result<Retraction, String> {
        let (id, key) = self.ground_fact(query, "retract")?;
        let Some(id) = id else { return Err(format!("no such fact: {key}")) };
        if !self.eval.store.rec(id).base() {
            return Err(format!("{key} is derived; retract its supports instead"));
        }
        let rel = self.eval.store.rec(id).rel;
        if rel == self.eval.v.asks || (rel == self.eval.v.explain_request && self.eval.cone.is_some()) {
            self.retract(query)?;
            return Ok(Retraction::Full("asks names the rules the world runs".to_string()));
        }
        self.settle()?;
        let mut doomed = vec![id];
        let ft = self.fact_term(id);
        let ab = self.eval.v.asserted_by;
        for f in self.eval.store.rel_all(&self.eval.h, ab) {
            if self.eval.store.args(f).first() == Some(&ft) {
                doomed.push(f);
            }
        }
        match self.eval.retract_delta(&doomed) {
            Ok(d) => {
                if let Err(e) = self.eval.check_promises() {
                    brk!("function_retract_clean" => (); self.eval.store.dirty = true);
                    return Err(crate::describe(&e));
                }
                Ok(Retraction::Delta(d))
            }
            Err(why) => {
                if self.eval.store.alive(id) {
                    self.eval.store.remove_many(&doomed);
                }
                self.eval.store.dirty = true;
                Ok(Retraction::Full(why))
            }
        }
    }

    /// `Rofl.excise` (src/api.ts:1070): what this base fact is holding up.
    ///
    /// A FORK, THE FACT REMOVED, A CLEAN RE-EVALUATION, AND THE DIFF IS THE
    /// BLAST RADIUS. This world is not touched — the question is counterfactual
    /// and an instrument that answers it by damaging its subject has only one
    /// use.
    pub fn excise(&mut self, query: &str) -> Result<(Vec<String>, Vec<String>), String> {
        let (id, key) = self.ground_fact(query, "excise")?;
        let Some(id) = id else { return Err(format!("{key} is not a base fact")) };
        if !self.eval.store.rec(id).base() {
            return Err(format!("{key} is not a base fact"));
        }
        self.settle()?;
        if self.eval.cone.is_some() && !self.eval.pruned.is_empty() {
            return Err(EXCISE_UNDER_ASKS.to_string());
        }
        let before = self.visible();
        let mut scratch = self.fork();
        scratch.retract(query)?;
        scratch.evaluate().map_err(|h| describe(&h))?;
        let after = scratch.visible();
        let removed: Vec<String> = before.iter().filter(|k| !after.contains(*k)).cloned().collect();
        let added: Vec<String> = after.iter().filter(|k| !before.contains(*k)).cloned().collect();
        Ok((removed, added))
    }

    /// The keys a caller can see: the kernel's own ledgers are the engine
    /// talking to itself and would put the whole reification in every diff.
    fn visible(&mut self) -> std::collections::BTreeSet<String> {
        let hide: std::collections::HashSet<Sym> = self
            .eval
            .v
            .reserved_set
            .iter()
            .copied()
            .chain([self.eval.v.stratum, self.eval.v.unstratified])
            .collect();
        let mut out = std::collections::BTreeSet::new();
        for id in self.eval.store.live_ids() {
            if hide.contains(&self.eval.store.rec(id).rel) {
                continue;
            }
            out.insert(self.eval.store.key(&self.eval.h, id));
        }
        out.extend(self.eval.store.virtual_keys(&self.eval.h));
        out
    }

    /// One ground literal, as the fact it names: the id when the store holds
    /// it, and the key either way so the caller is told WHICH fact was meant.
    /// A refusal names the verb, as the reference's does ("excise needs a
    /// ground fact", src/api.ts).
    fn ground_fact(&mut self, query: &str, verb: &str) -> Result<(Option<FactId>, String), String> {
        let lit = self.one_lit(query)?;
        // the ground check is `why`'s; only the refusal names this verb
        let p = self.eval.why_ground(&lit).map_err(|_| format!("{verb} needs a ground fact"))?;
        let mut key = String::new();
        write_fact_key(&self.eval.h, lit.rel, p, &lit.args, &mut key);
        Ok((self.eval.store.get(lit.rel, p, &lit.args), key))
    }

    /// `$fact(rel, persp, args)` — how `asserted_by` names the fact it is about.
    fn fact_term(&mut self, id: FactId) -> Term {
        let r = self.eval.store.rec(id);
        let (rel, persp) = (r.rel, r.persp);
        let args = self.eval.store.args(id).to_vec();
        crate::reflect::fact_term(&mut self.eval.h, &self.eval.v, rel, persp, &args)
    }

    /// `Rofl.why` (src/api.ts:841). The question is written in the SOURCE
    /// language, as `ask` is: a caller who can write a rule can write a why.
    pub fn why(&mut self, query: &str) -> Result<String, String> {
        let lit = self.one_lit(query)?;
        self.ground_lit(&lit)?;
        self.settle()?;
        self.cone_holds(&lit)?;
        self.settle_if_provenance(&lit);
        self.eval.why_text(&lit, Some(query))
    }

    /// `why`, with every member of every aggregate cell it passes through,
    /// where `why` prints a digest of the first `WHY_MEMBERS`.
    pub fn why_all(&mut self, query: &str) -> Result<String, String> {
        let lit = self.one_lit(query)?;
        self.ground_lit(&lit)?;
        self.settle()?;
        self.cone_holds(&lit)?;
        self.settle_if_provenance(&lit);
        self.eval.why_text_with(&lit, &WhyOpts { members: usize::MAX, query: String::new() }, Some(query))
    }

    /// THE EXPLAIN BRIDGE, and why it exists: `why` and `whynot` are host
    /// verbs, and a `.rofl` world cannot call one, so a property of their text
    /// had no world that could hold it. A program asks with
    /// `explain_request(Kind, Atom)` — `Kind` is `why`, `why_all` or
    /// `whynot`, `Atom` is `rel(args...)` in the main book — and after an
    /// evaluation this answers each, in key order, as
    /// `explained[$explain](Kind, Atom, I, "line")`, one row per line from
    /// I = 1, or one row at I = 0 carrying the refusal. `$explain` is a `$`
    /// ledger: a program reads it and cannot write it. The rows are base and
    /// tick-scoped; the caller evaluates again so rules can read them.
    /// Returns how many requests were answered.
    pub fn explain_requests(&mut self) -> Result<usize, String> {
        // a plain program is evaluated again by the aggregate evaluator, whose
        // planner and explanations the reference answers these with
        if self.eval.plain {
            self.eval.agg_forced = true;
            self.eval.reprepare();
            self.eval.store.dirty = true;
            let r = self.eval.ensure();
            let r = r.map_err(|h| describe(&h)).and_then(|_| self.answer_explain_requests());
            self.eval.agg_forced = false;
            self.eval.reprepare();
            self.eval.store.dirty = true;
            return r;
        }
        self.answer_explain_requests()
    }

    fn answer_explain_requests(&mut self) -> Result<usize, String> {
        let (req, main) = (self.eval.v.explain_request, self.eval.v.main);
        let mut asks: Vec<(String, Term, Term)> = Vec::new();
        for f in self.eval.store.rel_persp(&self.eval.h, req, main) {
            let args = self.eval.store.args(f).to_vec();
            if args.len() != 2 {
                continue;
            }
            let k = self.eval.store.key(&self.eval.h, f);
            asks.push((k, args[0], args[1]));
        }
        asks.sort_by(|a, b| crate::term::cmp_js(&a.0, &b.0));
        let (why, why_all, whynot) = (self.eval.h.intern("why"), self.eval.h.intern("why_all"), self.eval.h.intern("whynot"));
        let mut rows: Vec<(Term, Term, i64, String)> = Vec::new();
        for (_, kind, atom) in &asks {
            let lit = match atom.kind() {
                TermK::Atom(rel) => Ok(reflect::Lit { rel, persp: Term::atom(main), persp_explicit: false, args: Vec::new(), temporal: reflect::Temporal::Now }),
                TermK::Func(i) => Ok(reflect::Lit {
                    rel: self.eval.h.fname(i),
                    persp: Term::atom(main),
                    persp_explicit: false,
                    args: self.eval.h.fargs(i).to_vec(),
                    temporal: reflect::Temporal::Now,
                }),
                _ => Err("an explain request names an atom: rel(args...)".to_string()),
            };
            let text = lit.and_then(|l| self.eval.outside_cone(l.rel).map_or(Ok(l), Err)).and_then(|l| match kind.as_atom() {
                Some(k) if k == why => self.eval.why_text(&l, None),
                Some(k) if k == why_all => brk!("why_all_digest" => self.eval.why_text(&l, None);
                    self.eval.why_text_with(&l, &WhyOpts { members: usize::MAX, query: String::new() }, None)),
                Some(k) if k == whynot => self.eval.whynot_text(&l, &EXPLAIN_WHYNOT_BOUNDS, None).map(|(_, t)| t).map_err(|h| describe(&h)),
                _ => Err("the kinds of explanation are why, why_all and whynot".to_string()),
            });
            match text {
                Ok(t) => {
                    for (i, line) in t.lines().enumerate() {
                        rows.push((*kind, *atom, i as i64 + 1, line.to_string()));
                    }
                }
                Err(e) => rows.push((*kind, *atom, 0, e)),
            }
        }
        let (rel, book) = (self.eval.v.explained, self.eval.v.explain_persp);
        for (kind, atom, i, line) in rows {
            let l = self.eval.h.string(&line);
            self.eval.store.add(&self.eval.h, rel, book, &[kind, atom, Term::int(i), l], F_BASE | F_TICK);
        }
        self.eval.store.dirty = true;
        Ok(asks.len())
    }

    /// `Rofl.whynot` (src/api.ts:927). `(holds, text)` — a literal that HOLDS
    /// is the answer, not an error, and says so in the same shape.
    ///
    /// THE WORLD IS SETTLED BEFORE THE QUESTION IS PARSED, in the reference's
    /// order (`ensure`, then `asked`), so a world that halts says so before a
    /// malformed question is refused — in both engines.
    ///
    /// A WALL MET WHILE DEMONSTRATING IS THE ANSWER: `holds: false` with the
    /// wall named (`wall: budget_exhausted`), as both of the reference's
    /// whynots give it (src/api.ts `whynot`, `describeHalt`) — a demand that
    /// unfolds without end has no demonstration, and saying which wall stopped
    /// it is the demonstration there is. The aggregate path answers every halt
    /// so; the plain one answers a wall and refuses the rest, as its evaluator
    /// throws them.
    pub fn whynot(&mut self, query: &str, b: &WhynotBounds) -> Result<(bool, String), String> {
        self.settle()?;
        let lit = self.one_lit(query)?;
        self.cone_holds(&lit)?;
        self.settle_if_provenance(&lit);
        match self.eval.whynot_text(&lit, b, Some(query.trim())) {
            Ok(r) => Ok(r),
            Err(h @ Halt::Budget(..)) => Ok((false, describe(&h))),
            Err(h) if !self.eval.plain => Ok((false, describe(&h))),
            Err(h) => Err(describe(&h)),
        }
    }

    /// A `why` is of a ground literal, and is told so before the world is
    /// evaluated for it (src/api.ts `why` checks before `ensure`). The check
    /// is `Eval::why_ground`'s, the one `why_text` makes again on its own.
    fn ground_lit(&self, lit: &reflect::Lit) -> Result<(), String> {
        self.eval.why_ground(lit).map(|_| ())
    }

    /// `Rofl.ensure`: an explanation is of the settled world, so a world with
    /// unjudged facts in it is evaluated first, and a settled one is not
    /// evaluated again.
    fn settle(&mut self) -> Result<(), String> {
        self.eval.ensure().map(|_| ()).map_err(|h| describe(&h))
    }

    /// One literal, parsed and lowered. `ask` open-codes the same first three
    /// lines because it goes on to read the columns; these two want the
    /// evaluator's `Lit` and nothing else.
    /// A question about a `derived_by` row reads the rows, so the deferred
    /// ones are written first, as `ask` does.
    fn settle_if_provenance(&mut self, lit: &reflect::Lit) {
        if lit.rel == self.eval.v.derived_by {
            self.eval.settle_provenance();
        }
    }

    /// A question about a relation the cone of `asks` left out is refused, never answered from what the cone holds.
    fn cone_holds(&self, lit: &reflect::Lit) -> Result<(), String> {
        self.eval.outside_cone(lit.rel).map_or(Ok(()), Err)
    }

    fn one_lit(&mut self, query: &str) -> Result<reflect::Lit, String> {
        self.eval.parse_lit(query)
    }

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
        let (h, v) = (&mut self.eval.h, &self.eval.v);
        let args: Vec<Term> = l.args.iter().map(|t| crate::program::canon_sets(h, v, *t)).collect();
        crate::program::check_query_sets(h, v, &args)?;
        Ok((l.rel, persp, args))
    }
}
