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
    /// the heads a rule above the stage reads: only these are lemmas, the rest goes with the cut books
    pub given: FxSet<Sym>,
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
    pub fn cut_stage(&mut self) -> Option<Stage> {
        let all = self.rules.clone();
        let refs: Vec<&ERule> = all.iter().map(|r| &**r).collect();
        let mut st = self.lower_of(&refs)?;
        if let Some(full) = &self.lower_full {
            let lower: Vec<&ERule> = refs.into_iter().filter(|r| full.contains(&(r.clause.head.rel, r.clause.head.persp.as_atom()))).collect();
            st.heads = lower.iter().map(|r| r.clause.head.rel).collect();
            st.rules = Rc::new(lower.iter().map(|r| r.id).collect());
        }
        // what a rule above reads, and what the world asks, is given
        let asked: Vec<Sym> = self.store.rel_all(&self.h, self.v.asks).into_iter().filter_map(|f| self.store.args(f).first().and_then(|t| t.as_atom())).collect();
        st.given = all.iter().filter(|r| !st.rules.contains(&r.id)).flat_map(|r| r.clause.body.iter().flat_map(BodyElem::lits_deep).map(|l| l.rel).collect::<Vec<_>>()).chain(asked).filter(|rel| st.heads.contains(rel)).collect();
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
                None => cut_rels.contains(&l.rel) || cut.iter().any(|b| self.store.any_in(&self.h, l.rel, *b)),
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
        Some(Stage { rules, heads, given: FxSet::default(), cut, wide })
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
        let (lemmas, cut, unread) = self.cut_away(&st);
        self.note_staged_away(&st);
        let books: Vec<String> = st.cut.iter().map(|b| format!("[{}]", self.h.name(*b))).collect();
        self.diags.push(format!("stage: {} rules below, {lemmas} lemmas, {cut} facts of {} cut, {unread} nothing above reads; widest below: {}", st.rules.len(), books.join(" "), st.wide.join(", ")));
        self.stage_pass = StagePass::Upper(st.rules);
        self.run_whole()
    }

    /// Once the lower stage `st` is evaluated, of this store's own facts: its conclusions outside the cut books are
    /// made lemmas, the cut books' facts and what nothing above reads are dropped. How many of each.
    pub(super) fn cut_away(&mut self, st: &Stage) -> (usize, usize, usize) {
        let mut drop = Vec::new();
        let mut lemmas = Vec::new();
        let mut unread = Vec::new();
        for id in self.store.all_facts() {
            let r = self.store.rec(id);
            if st.cut.contains(&r.persp) {
                drop.push(id);
            } else if !r.base() && st.heads.contains(&r.rel) && !st.given.contains(&r.rel) {
                unread.push(id);
            } else if !r.base() && st.heads.contains(&r.rel) {
                lemmas.push(id);
            }
        }
        for &id in &lemmas {
            self.store.make_lemma(id);
        }
        let n = (lemmas.len(), drop.len(), unread.len());
        drop.extend(unread);
        self.store.remove_many(&drop);
        n
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
            if st.cut.contains(&r.persp) || !(r.base() || st.given.contains(&r.rel)) {
                continue;
            }
            let args: Vec<Term> = low.store.args(id).iter().map(|t| super::volumes::copy_term(*t, &low.h, &mut self.h, syms, funcs)).collect();
            self.store.put(&self.h, r.rel, r.persp, &args, F_BASE);
        }
        self.store.dirty = true;
    }

    /// What a staged evaluation takes away: the cut books, and the relations concluded below that nothing above reads.
    pub fn note_staged_away(&mut self, st: &Stage) {
        self.staged_away = Some((st.cut.clone(), st.heads.iter().copied().filter(|r| !st.given.contains(r)).collect()));
    }

    /// Why a question is refused where the stage took its rows away: a relation of a cut book, or one concluded below
    /// that nothing above reads, is not kept. None when the world kept it.
    pub fn staged_away(&self, rel: Sym, book: Option<Sym>) -> Option<String> {
        let (cut, gone) = self.staged_away.as_ref()?;
        let n = self.h.name(rel);
        if let Some(b) = book.filter(|b| cut.contains(b)) {
            return Some(format!("'{n}[{}]' is a book the plan cuts (`cut[fixpointplan]`): its facts were dropped once the lower stage had proved its lemmas", self.h.name(b)));
        }
        gone.contains(&rel).then(|| format!("'{n}' is concluded below the plan's cut and nothing above it reads it, so it is not kept as a lemma"))
    }

    /// Whether a fact is a lemma: given, in a relation the lower stage concludes.
    pub(super) fn is_lemma(&mut self, id: FactId) -> bool {
        let r = self.store.rec(id);
        let cut = self.store.lemma_cut.is_some() && !self.store.here(id);
        if !r.base() && !cut {
            return false;
        }
        let key = (self.rules.len(), self.cut_books());
        if self.lemma_heads.as_ref().is_none_or(|(k, _)| *k != key) {
            let heads = self.cut_stage().map(|st| Rc::new(st.heads)).unwrap_or_default();
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
        let args: Vec<Term> = self.store.args(id).to_vec();
        args.into_iter().find_map(|a| self.site_of(a)).map(|rest| rest.join(":"))
    }

    /// Where the plan's `site[fixpointplan](Rel, Book)` places a term: the other arguments of the first fact of
    /// `Rel[Book]` whose first argument it is (`at[tree](N, File, Line)`: `[File, Line]`); none for a term no site names.
    pub fn site_of(&mut self, a: Term) -> Option<Vec<String>> {
        a.as_atom()?;
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
        for (r, b) in site {
            // (a relation the store keeps no index of is walked)
            let fs = self.store.arg_matches(&self.h, r, Some(b), 3, &[0], &[a]).unwrap_or_else(|| self.store.rel_persp(&self.h, r, b));
            if let Some(&f) = fs.iter().find(|&&f| self.store.alive(f) && self.store.args(f).len() == 3 && self.store.args(f)[0] == a) {
                return Some(self.store.args(f)[1..].iter().map(|t| match t.kind() {
                    TermK::Str(s) => self.h.name(s).to_string(),
                    _ => self.h.canon(*t),
                }).collect());
            }
        }
        None
    }

    /// Where the plan's site places each of these names (`site_of`), and where this store holds no site for one, as a
    /// world that cut its book holds none that nothing above reads, the node's file thawed with only the rules of the
    /// lower stage the site reads: a file at a time, each file read once.
    pub fn sites_of(&mut self, names: &[String]) -> Vec<(String, Vec<String>)> {
        let mut out = Vec::new();
        let mut by_file: std::collections::BTreeMap<String, Vec<&String>> = Default::default();
        for v in names {
            match self.h.syms.find(v).and_then(|s| self.site_of(Term::atom(s))) {
                Some(at) => out.push((v.clone(), at)),
                None => if let Some(f) = super::volumes::node_file(v) { by_file.entry(f.to_string()).or_default().push(v) },
            }
        }
        if by_file.is_empty() || self.thawed {
            return out;
        }
        let Some(mut st) = self.cut_stage() else { return out };
        // the rules of the stage the site's relations stand on
        let (rel, book) = (self.h.intern("site"), self.h.intern("fixpointplan"));
        let mut need: FxSet<Sym> = self.store.rel_persp(&self.h, rel, book).into_iter().filter_map(|f| self.store.args(f).first()?.as_atom()).collect();
        let rules: Vec<_> = self.rules.iter().filter(|r| st.rules.contains(&r.id)).cloned().collect();
        let mut taken: FxSet<Sym> = FxSet::default();
        loop {
            let more: Vec<_> = rules.iter().filter(|r| !taken.contains(&r.id) && need.contains(&r.clause.head.rel)).collect();
            if more.is_empty() { break; }
            for r in more {
                taken.insert(r.id);
                need.extend(r.clause.body.iter().flat_map(BodyElem::lits_deep).map(|l| l.rel));
            }
        }
        // where every premise of those rules holds the node the site places, as `at[tree](N, File, Line) :- node(N,
        // ...), line(N, ...)` does, a line of a file that names none of the nodes asked proves no site of them
        let keyed = rules.iter().filter(|r| taken.contains(&r.id)).all(|r| {
            let Some(&n) = r.clause.head.args.first().filter(|t| t.is_var()) else { return false };
            r.clause.body.iter().flat_map(BodyElem::lits_deep).all(|l| if taken_heads(&rules, &taken).contains(&l.rel) { l.args.first() == Some(&n) } else { l.args.contains(&n) })
        });
        let names: FxSet<String> = need.iter().map(|r| self.h.name(*r).to_string()).collect();
        st.rules = Rc::new(taken);
        // the files thawed together, in one fork of the core, each of the lines those rules read
        let mut text = String::new();
        for (file, vs) in &by_file {
            let Some(t) = self.lower_text(file) else { continue };
            let held: Vec<&str> = if keyed { vs.iter().map(|v| v.as_str()).collect() } else { Vec::new() };
            for l in super::volumes::fact_lines(&t, |r| names.contains(r), &held) {
                text.push_str(&l);
                text.push('\n');
            }
        }
        let Ok(mut low) = self.thaw(&text, &st) else { return out };
        for v in by_file.into_values().flatten() {
            if let Some(at) = low.h.syms.find(v).and_then(|s| low.site_of(Term::atom(s))) { out.push((v.clone(), at)); }
        }
        out
    }

    /// Why a retraction is refused here: the world cut a book and holds lemmas, given facts no file names, whose proof
    /// is gone, so nothing could take out the lemmas a fact taken out had proved. None in a world that holds none.
    /// Of the records of facts gone, those the cut dropped (`cut_away`): an evaluation of the files anew leaves them too.
    pub fn gone_by_the_cut(&mut self) -> usize {
        let Some(st) = self.cut_stage() else { return 0 };
        (0..self.store.len_ids()).filter(|&id| {
            let r = self.store.rec(id);
            r.dead() && (st.cut.contains(&r.persp) || (!r.base() && st.heads.contains(&r.rel) && !st.given.contains(&r.rel)))
        }).count()
    }

    pub fn refuses_retraction(&mut self) -> Option<String> {
        self.refuses_retracting(None)
    }

    /// As `refuses_retraction`, of these facts: a fact of a relation no rule of the lower stage reads or concludes
    /// proved no lemma, so taking it out leaves none behind (a runtime assumption read above the cut).
    pub fn refuses_retracting(&mut self, facts: Option<&[FactId]>) -> Option<String> {
        let st = self.cut_stage()?;
        // (the lemmas of a file whose lower stage was proved again, `Session::as_staged`: what it proves now comes in)
        let rest: Vec<FactId>;
        let facts = match facts {
            Some(fs) if self.retaking => {
                rest = fs.iter().copied().filter(|&f| { let r = self.store.rec(f); !(r.base() && st.given.contains(&r.rel) && !st.cut.contains(&r.persp)) }).collect();
                if rest.is_empty() {
                    return None;
                }
                Some(&rest[..])
            }
            f => f,
        };
        let held = st.heads.iter().any(|&rel| self.store.rel_all(&self.h, rel).into_iter().any(|f| self.store.rec(f).base()));
        if let (true, Some(facts)) = (held, facts) {
            let read: FxSet<Sym> = self.rules.iter().filter(|r| st.rules.contains(&r.id)).flat_map(|r| r.clause.body.iter().flat_map(BodyElem::lits_deep).map(|l| l.rel).collect::<Vec<_>>()).collect();
            if facts.iter().all(|&f| { let rel = self.store.rec(f).rel; !read.contains(&rel) && !st.heads.contains(&rel) }) {
                return None;
            }
        }
        held.then(|| {
            let books: Vec<String> = st.cut.iter().map(|b| format!("[{}]", self.h.name(*b))).collect();
            format!("the world cut {} and holds the lemmas proved from it: a fact taken out would leave the lemmas it proved; evaluate the files anew", books.join(" "))
        })
    }
}

/// The relations the rules `taken` of `rules` conclude.
fn taken_heads(rules: &[Rc<ERule>], taken: &FxSet<Sym>) -> FxSet<Sym> {
    rules.iter().filter(|r| taken.contains(&r.id)).map(|r| r.clause.head.rel).collect()
}
