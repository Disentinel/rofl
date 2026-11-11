//! LEMMA STAGES (`cut[fixpointplan](B)`). A book B named so is a world of simpler lemmas: the rules that read or
//! conclude it, with every rule below them, are the lower stage, evaluated first and whole; what they concluded outside
//! B are its lemmas, kept as given facts whose proof is in B; then B's facts are dropped and the rest of the program is
//! evaluated over the lemmas. A lower stage is closed downward, so it reads nothing the upper one concludes, and the
//! answers are the whole world's. `why` stops at a lemma (`[lemma]`).

use super::*;

/// The stage of one evaluation: the rules of the lower stage, the books it cuts.
pub struct Stage {
    pub rules: Rc<FxSet<Sym>>,
    /// the relations its rules conclude: what of them stands outside the cut books is a lemma
    pub heads: FxSet<Sym>,
    pub cut: Vec<Sym>,
    /// the rules of the lower stage whose own cone is widest, said with it
    pub wide: Vec<String>,
}

impl Eval {
    /// The books the plan cuts: `cut[fixpointplan](B)`.
    fn cut_books(&mut self) -> Vec<Sym> {
        let (rel, book) = (self.h.intern("cut"), self.h.intern("fixpointplan"));
        let mut out: Vec<Sym> = self.store.rel_persp(&self.h, rel, book).into_iter().filter_map(|f| self.store.args(f).first().and_then(|t| t.as_atom())).collect();
        out.sort_unstable();
        out.dedup();
        out
    }

    /// The lower stage of the books the plan cuts: every rule reading or concluding one, and downward from them every
    /// rule concluding what a rule of the stage reads, and beside each every rule concluding what it concludes. None
    /// when the plan cuts nothing.
    /// Where asks prunes the program, the lower stage is the whole program's (`lower_full`), as the cone has it: what is
    /// a lemma does not hang on what is asked.
    pub fn lemma_stage(&mut self) -> Option<Stage> {
        let all = self.rules.clone();
        let refs: Vec<&ERule> = all.iter().map(|r| &**r).collect();
        let mut st = self.lower_of(&refs)?;
        if let Some(full) = &self.lower_full {
            let lower: Vec<&ERule> = refs.into_iter().filter(|r| full.contains(&(r.clause.head.rel, r.clause.head.persp.as_atom()))).collect();
            st.heads = lower.iter().map(|r| r.clause.head.rel).collect();
            st.rules = Rc::new(lower.iter().map(|r| r.id).collect());
        }
        Some(st)
    }

    /// The lower stage of the whole program, by the relation and book of each rule's head, noted before asks prunes it.
    pub(super) fn note_lower_full(&mut self, rules: &[ERule]) {
        let refs: Vec<&ERule> = rules.iter().collect();
        self.lower_full = None;
        self.lower_full = self.lower_of(&refs).map(|st| rules.iter().filter(|r| st.rules.contains(&r.id)).map(|r| (r.clause.head.rel, r.clause.head.persp.as_atom())).collect());
    }

    fn lower_of(&mut self, rules: &[&ERule]) -> Option<Stage> {
        let cut = self.cut_books();
        if cut.is_empty() || self.well_founded {
            return None;
        }
        let rules: Vec<&ERule> = rules.iter().copied().filter(|r| r.safe && r.clause.head.temporal != Temporal::Next).collect();
        let mut by_head: HashMap<Sym, Vec<usize>> = HashMap::new();
        for (i, r) in rules.iter().enumerate() {
            by_head.entry(r.clause.head.rel).or_default().push(i);
        }
        let cut_rels: HashSet<Sym> = rules.iter().filter(|r| r.clause.head.persp.as_atom().is_some_and(|b| cut.contains(&b))).map(|r| r.clause.head.rel).collect();
        let mut taken = vec![false; rules.len()];
        let mut todo: Vec<usize> = Vec::new();
        for (i, r) in rules.iter().enumerate() {
            let head = r.clause.head.persp.as_atom().is_some_and(|b| cut.contains(&b));
            let reads = r.clause.body.iter().flat_map(BodyElem::lits_deep).any(|l| match l.persp.as_atom() {
                Some(b) => cut.contains(&b),
                None => cut_rels.contains(&l.rel) || cut.iter().any(|b| !self.store.rel_persp(&self.h, l.rel, *b).is_empty()),
            });
            if head || reads {
                taken[i] = true;
                todo.push(i);
            }
        }
        if todo.is_empty() {
            return None;
        }
        let below = |seeds: &[usize]| -> Vec<bool> {
            let mut taken = vec![false; rules.len()];
            let mut todo = seeds.to_vec();
            for &i in seeds {
                taken[i] = true;
            }
            while let Some(i) = todo.pop() {
                // a relation is below or above whole: every rule concluding it goes with the one taken
                let head = &rules[i].clause.head;
                for &j in by_head.get(&head.rel).into_iter().flatten() {
                    if !taken[j] && rules[j].clause.head.persp == head.persp {
                        taken[j] = true;
                        todo.push(j);
                    }
                }
                for l in rules[i].clause.body.iter().flat_map(BodyElem::lits_deep) {
                    for &j in by_head.get(&l.rel).into_iter().flatten() {
                        let same_book = match (l.persp.as_atom(), rules[j].clause.head.persp.as_atom()) {
                            (Some(x), Some(y)) => x == y,
                            _ => true,
                        };
                        if same_book && !taken[j] {
                            taken[j] = true;
                            todo.push(j);
                        }
                    }
                }
            }
            taken
        };
        let taken = below(&todo);
        // what pulls the most into the lower stage: the seeds whose own cone is widest
        let mut wide: Vec<(usize, usize)> = todo.iter().map(|&i| (below(&[i]).iter().filter(|t| **t).count(), i)).collect();
        wide.sort_unstable_by(|a, b| b.cmp(a));
        let wide: Vec<String> = wide
            .iter()
            .take(3)
            .map(|(n, i)| {
                let h = &rules[*i].clause.head;
                let book = h.persp.as_atom().map(|b| format!("[{}]", self.h.name(b))).unwrap_or_default();
                format!("{}{} ({} rules)", self.h.name(h.rel), book, n)
            })
            .collect();
        let lower: Vec<&&ERule> = rules.iter().zip(&taken).filter(|(_, t)| **t).map(|(r, _)| r).collect();
        let heads = lower.iter().map(|r| r.clause.head.rel).collect();
        let rules = Rc::new(lower.iter().map(|r| r.id).collect());
        Some(Stage { rules, heads, cut, wide })
    }

    /// Whether a rule fires in the pass under way: in the lower stage, only its rules; above it, none of them.
    pub(super) fn stage_fires(&self, r: &ERule) -> bool {
        match &self.stage_pass {
            StagePass::Whole => true,
            StagePass::Lower(s) => s.contains(&r.id),
            StagePass::Upper(s) => !s.contains(&r.id),
        }
    }

    /// The evaluation in two stages: the lower one whole, its conclusions outside the cut books made lemmas, the cut
    /// books' facts dropped, then the rest over them.
    pub(super) fn run_staged(&mut self, st: Stage) -> Result<Outcome, Halt> {
        let walls = (self.wall.level_wall.take(), std::mem::take(&mut self.wall.hold_end));
        let low = self.lower_stage(&st);
        (self.wall.level_wall, self.wall.hold_end) = walls;
        if let Err(Halt::Budget(..)) = low {
            return Ok(Outcome { partial: true, staged: 0 });
        }
        low?;
        let mut drop = Vec::new();
        let mut lemmas = Vec::new();
        for id in self.store.all_facts() {
            let r = self.store.rec(id);
            if st.cut.contains(&r.persp) {
                drop.push(id);
            } else if !r.base() && st.heads.contains(&r.rel) {
                lemmas.push(id);
            }
        }
        for &id in &lemmas {
            self.store.make_lemma(id);
        }
        self.store.remove_many(&drop);
        let books: Vec<String> = st.cut.iter().map(|b| format!("[{}]", self.h.name(*b))).collect();
        self.diags.push(format!("stage: {} rules below, {} lemmas, {} facts of {} cut; widest below: {}", st.rules.len(), lemmas.len(), drop.len(), books.join(" "), st.wide.join(", ")));
        self.stage_pass = StagePass::Upper(st.rules);
        self.run_whole()
    }

    /// The lower stage evaluated alone, whole: a stop by a wall is a budget's halt.
    pub fn lower_stage(&mut self, st: &Stage) -> Result<(), Halt> {
        self.stage_pass = StagePass::Lower(st.rules.clone());
        let out = self.run_whole();
        self.stage_pass = StagePass::Whole;
        match out? {
            o if o.partial => Err(Halt::Budget("budget_exhausted", None)),
            _ => Ok(()),
        }
    }

    /// What a lower stage of `low` proved and was given outside the cut books, put here as given facts: its lemmas and
    /// the base facts the upper stage reads. `low` is a fork of this world's core, its own facts above `from`.
    pub fn take_lemmas(&mut self, low: &Eval, st: &Stage, from: FactId, syms: Sym, funcs: u32) {
        for id in from..low.store.len_ids() {
            if !low.store.alive(id) {
                continue;
            }
            let r = low.store.rec(id);
            if st.cut.contains(&r.persp) || !(r.base() || st.heads.contains(&r.rel)) {
                continue;
            }
            let args: Vec<Term> = low.store.args(id).iter().map(|t| super::volumes::copy_term(*t, &low.h, &mut self.h, syms, funcs)).collect();
            self.store.put(&self.h, r.rel, r.persp, &args, F_BASE);
        }
        self.store.dirty = true;
    }

    /// What one file gives a world by volumes, as text: its lower stage's lemmas and its facts outside the cut books
    /// where the program cuts one (`take_lemmas`), else its base facts. A fork of the core, its own facts above `from`.
    pub fn given_by_file(&self, text: &str, st: Option<&Stage>) -> Result<Vec<String>, Halt> {
        let mut low = self.fork();
        let from = low.store.len_ids();
        super::volumes::load_text(&mut low, text)?;
        if let Some(st) = st {
            low.lower_stage(st)?;
        }
        Ok((from..low.store.len_ids())
            .filter(|&id| low.store.alive(id))
            .filter(|&id| {
                let r = low.store.rec(id);
                match st {
                    Some(st) => !st.cut.contains(&r.persp) && (r.base() || st.heads.contains(&r.rel)),
                    None => r.base(),
                }
            })
            .map(|id| low.store.key(&low.h, id))
            .collect())
    }

    /// `given_by_file` of each text, the files spread over the cores: each thread works in a fork of its own.
    pub fn given_by_files(&self, texts: &[&str], st: Option<&Stage>) -> Result<Vec<Vec<String>>, Halt> {
        let n = std::thread::available_parallelism().map_or(1, |c| c.get()).min(texts.len());
        if n < 2 {
            return texts.iter().map(|t| self.given_by_file(t, st)).collect();
        }
        struct Own<'a>(Eval, Option<&'a Stage>);
        // SAFETY: as the workers of a set of volumes (engine/volumes.rs): each fork is moved to a thread whole, and
        // the stage is only read
        unsafe impl Send for Own<'_> {}
        let forks: Vec<Own> = (0..n).map(|_| Own(self.fork(), st)).collect();
        let out: Vec<Result<Vec<(usize, Vec<String>)>, Halt>> = std::thread::scope(|sc| {
            let hs: Vec<_> = forks
                .into_iter()
                .enumerate()
                .map(|(i, own)| {
                    sc.spawn(move || {
                        let own = own;
                        (i..texts.len()).step_by(n).map(|x| own.0.given_by_file(texts[x], own.1).map(|g| (x, g))).collect()
                    })
                })
                .collect();
            hs.into_iter().map(|h| h.join().unwrap_or_else(|_| Err(Halt::Bug("a worker panicked".into())))).collect()
        });
        let mut by: Vec<Vec<String>> = vec![Vec::new(); texts.len()];
        for part in out {
            for (x, g) in part? {
                by[x] = g;
            }
        }
        Ok(by)
    }

    /// A lower stage that reads or concludes `[surface]` is refused where files are evaluated apart: it is evaluated
    /// a file at a time, before anything crosses.
    pub fn refuse_stage_across(&self, st: &Stage, surface: Sym) -> Result<(), Halt> {
        // what [surface] holds, and what a rule of a variable book concludes from it
        let mut crossing: HashSet<Sym> = self.rules.iter().filter(|r| r.clause.head.persp.as_atom() == Some(surface)).map(|r| r.clause.head.rel).collect();
        loop {
            let more: Vec<Sym> = self
                .rules
                .iter()
                .filter(|r| r.clause.head.persp.as_atom().is_none() && !crossing.contains(&r.clause.head.rel))
                .filter(|r| r.clause.body.iter().flat_map(BodyElem::lits_deep).any(|l| l.persp.as_atom() == Some(surface) || l.persp.as_atom().is_none() && crossing.contains(&l.rel)))
                .map(|r| r.clause.head.rel)
                .collect();
            if more.is_empty() {
                break;
            }
            crossing.extend(more);
        }
        for r in self.rules.iter().filter(|r| st.rules.contains(&r.id)) {
            let lits = std::iter::once(&r.clause.head).chain(r.clause.body.iter().flat_map(BodyElem::lits_deep));
            if let Some(l) = lits.into_iter().find(|l| match l.persp.as_atom() {
                Some(b) => b == surface,
                None => crossing.contains(&l.rel),
            }) {
                return Err(Halt::reject(format!(
                    "the lower stage of the cut books reads {}, which crosses files: rule {} is evaluated a file at a time, before anything crosses",
                    self.h.name(l.rel),
                    self.h.name(r.id)
                )));
            }
        }
        Ok(())
    }

    /// Whether a fact is a lemma: given, in a relation the lower stage concludes.
    pub(super) fn is_lemma(&mut self, id: FactId) -> bool {
        let r = self.store.rec(id);
        if !r.base() {
            return false;
        }
        let key = (self.rules.len(), self.cut_books());
        if self.lemma_heads.as_ref().is_none_or(|(k, _)| *k != key) {
            let heads = self.lemma_stage().map(|st| Rc::new(st.heads)).unwrap_or_default();
            self.lemma_heads = Some((key, heads));
        }
        self.lemma_heads.as_ref().is_some_and(|(_, h)| h.contains(&r.rel))
    }

    /// What `why` says of a lemma's place, `File:Line` or empty where the plan names no site; none when `id` is no lemma.
    pub fn lemma_mark(&mut self, id: FactId) -> Option<String> {
        (self.store.alive(id) && self.is_lemma(id)).then(|| self.lemma_site(id).unwrap_or_default())
    }

    /// Where a lemma stands, by the plan's `site[fixpointplan](Rel, Book)`: the first fact of `Rel[Book]` whose first
    /// argument is one of the lemma's, its other arguments joined by `:` (`at[tree](N, File, Line)`: `File:Line`).
    pub(super) fn lemma_site(&mut self, id: FactId) -> Option<String> {
        let (rel, book) = (self.h.intern("site"), self.h.intern("fixpointplan"));
        let site: Vec<(Sym, Sym)> = self
            .store
            .rel_persp(&self.h, rel, book)
            .into_iter()
            .filter_map(|f| match self.store.args(f) {
                [r, b] => Some((r.as_atom()?, b.as_atom()?)),
                _ => None,
            })
            .collect();
        let args: Vec<Term> = self.store.args(id).to_vec();
        for (r, b) in site {
            for a in args.iter().filter(|a| a.as_atom().is_some()) {
                let Some(fs) = self.store.arg_matches(&self.h, r, Some(b), 3, &[0], &[*a]) else { continue };
                if let Some(&f) = fs.iter().find(|&&f| self.store.alive(f)) {
                    let rest: Vec<String> = self.store.args(f)[1..].iter().map(|t| match t.kind() {
                        TermK::Str(s) => self.h.name(s).to_string(),
                        _ => self.h.canon(*t),
                    }).collect();
                    return Some(rest.join(":"));
                }
            }
        }
        None
    }

    /// Why a retraction is refused here: the world cut a book and holds lemmas, given facts no file names, whose proof
    /// is gone, so nothing could take out the lemmas a fact taken out had proved. None in a world that holds none.
    pub fn refuses_retraction(&mut self) -> Option<String> {
        let st = self.lemma_stage()?;
        let held = st.heads.iter().any(|&rel| self.store.rel_all(&self.h, rel).into_iter().any(|f| self.store.rec(f).base()));
        held.then(|| {
            let books: Vec<String> = st.cut.iter().map(|b| format!("[{}]", self.h.name(*b))).collect();
            format!("the world cut {} and holds the lemmas proved from it: a fact taken out would leave the lemmas it proved; evaluate the files anew", books.join(" "))
        })
    }
}
