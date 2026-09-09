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
use crate::reflect::{bootstrap_kernel, is_kernel_ledger, Vocab};
use crate::rofl_parse::{self, Book, Tense};
use crate::store::{write_fact_key, FactId, Store, F_BASE};
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
/// The first token of a cooled volume's header line.
pub const VOLUME_MAGIC: &str = "rofl-volume";
/// The layout of the file BELOW the header. Bumped when the rendering changes,
/// separately from the kernel hash, because those are two different reasons a
/// volume can stop being readable.
pub const VOLUME_FORMAT: u32 = 1;

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
            let r = *self.eval.store.rec(*id);
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
            let r = *self.eval.store.rec(*id);
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
        let want = format!("-- {VOLUME_MAGIC} {VOLUME_FORMAT} kernel={}", env!("ROFL_KERNEL_HASH"));
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
            if !c.body.is_empty() || c.head.rel != ab {
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
        let want = format!("-- {VOLUME_MAGIC} {VOLUME_FORMAT} kernel={}", env!("ROFL_KERNEL_HASH"));
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
        let mut texts: Vec<String> = vols.iter().map(|(p, _)| self.header(p)).collect();
        let mut counts = vec![0usize; vols.len()];
        let mut drop: Vec<FactId> = Vec::new();
        for id in self.eval.store.all_facts() {
            if !self.eval.store.alive(id) {
                continue;
            }
            let args = self.eval.store.args(id).to_vec();
            let Some(k) = vols.iter().position(|(p, _)| args.iter().any(|a| self.mentions(*a, p)))
            else {
                continue;
            };
            let r = *self.eval.store.rec(id);
            if r.base() && !is_kernel_ledger(&self.eval.h, r.persp) {
                write_fact_key(&self.eval.h, r.rel, r.persp, &args, &mut texts[k]);
                texts[k].push_str(".\n");
                counts[k] += 1;
            }
            drop.push(id);
        }
        let mut out = Vec::with_capacity(vols.len());
        for (i, (_, path)) in vols.iter().enumerate() {
            std::fs::write(path, &texts[i]).map_err(|e| format!("{path}: {e}"))?;
            out.push(Cooled { facts: counts[i], bytes: texts[i].len(), path: path.clone() });
        }
        self.eval.store.remove_many(&drop);
        self.eval.store.dirty = true;
        Ok(out)
    }

    fn header(&self, prefix: &str) -> String {
        format!("-- {VOLUME_MAGIC} {VOLUME_FORMAT} kernel={} prefix={prefix}\n",
            env!("ROFL_KERNEL_HASH"))
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
