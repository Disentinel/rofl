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
    /// `own[fixpointplan](Rel, I)`: the arguments that hold a node of the fact's own file, by relation
    pub own: FxMap<Sym, u64>,
    /// the rules of the stage that read no file, or walk a closure: fired above it too
    pub free: FxSet<Sym>,
}

impl Stage {
    /// The rules the pass above the stage does not fire.
    pub fn below(&self) -> Rc<FxSet<Sym>> {
        if self.free.is_empty() {
            return self.rules.clone();
        }
        Rc::new(self.rules.iter().copied().filter(|r| !self.free.contains(r)).collect())
    }
}

/// Whose file the facts of a relation are of: of none (`Free`), each of one file whose node the positions of the
/// mask hold (`File`), or of any (`Across`).
#[derive(Clone, Copy, PartialEq)]
enum Reach {
    Free,
    File(u64),
    Across,
}

impl Reach {
    fn meet(self, o: Reach) -> Reach {
        match (self, o) {
            (Reach::Across, _) | (_, Reach::Across) => Reach::Across,
            (Reach::Free, x) | (x, Reach::Free) => x,
            (Reach::File(a), Reach::File(b)) => Reach::File(a & b),
        }
    }
}

/// The reach of each relation in each book; under `ANY`, of what a rule concludes into a book it names by a variable,
/// and of what `own` says a file states.
#[derive(Clone, PartialEq, Default)]
struct Reaches(FxMap<(Sym, Sym), Reach>);
pub(super) const ANY: Sym = Sym::MAX;

/// The relation and book a literal names; `ANY` where its book is a variable.
pub(super) fn booked(l: &Lit) -> (Sym, Sym) {
    (l.rel, l.persp.as_atom().unwrap_or(ANY))
}

impl Reaches {
    fn key(l: &Lit) -> (Sym, Sym) {
        booked(l)
    }
    /// What a literal reads or concludes: its book's and what is of any book; every book's where it names none.
    fn of(&self, l: &Lit) -> Option<Reach> {
        match l.persp.as_atom() {
            Some(b) => [self.0.get(&(l.rel, b)), self.0.get(&(l.rel, ANY))].into_iter().flatten().copied().reduce(Reach::meet),
            None => self.0.iter().filter(|(k, _)| k.0 == l.rel).map(|(_, r)| *r).reduce(Reach::meet),
        }
    }
}

/// The premises of a rule that are of a file, each by the variables that name it.
#[derive(Default)]
struct Prems {
    sets: Vec<Vec<Sym>>,
    negs: Vec<Vec<Sym>>,
    /// what a relation not judged yet would name at best: it holds nothing so far
    unjudged: Vec<Sym>,
    /// the variables an `=` says are one value
    same: Vec<(Sym, Sym)>,
}

impl Prems {
    /// False where a premise may be of any file. The members of an aggregate's cell are of one file where a premise
    /// inside it holds, as a node of its file, a variable the cell is of.
    fn read(&mut self, h: &Heap, eq: Sym, body: &[BodyElem], of: &dyn Fn(&Lit) -> Option<Reach>) -> bool {
        let own = |l: &Lit, mask: u64| -> Vec<Sym> { l.args.iter().enumerate().filter(|(i, _)| *i < 64 && mask >> i & 1 == 1).filter_map(|(_, t)| named(h, *t)).collect() };
        for b in body {
            match b {
                BodyElem::Pos(l) | BodyElem::Neg(l) if l.temporal != Temporal::Now => return false,
                BodyElem::Pos(l) => match of(l) {
                    Some(Reach::Across) => return false,
                    Some(Reach::Free) => {}
                    Some(Reach::File(m)) => self.sets.push(own(l, m)),
                    None => self.unjudged.extend(own(l, u64::MAX)),
                },
                BodyElem::Neg(l) => match of(l) {
                    Some(Reach::Across) => return false,
                    Some(Reach::Free) | None => {}
                    Some(Reach::File(m)) => self.negs.push(own(l, m)),
                },
                BodyElem::Bi { op, l, r } => {
                    if let (true, Some(a), Some(b)) = (*op == eq, named(h, *l), named(h, *r)) {
                        self.same.push((a, b));
                    }
                }
                BodyElem::Agg(a) => {
                    let (n, u) = (self.sets.len(), self.unjudged.len());
                    if !self.read(h, eq, &a.body, of) {
                        return false;
                    }
                    let of_file = self.sets.len() > n;
                    if of_file && !self.sets[n..].iter().flatten().chain(&self.unjudged[u..]).any(|v| a.shared.contains(v)) {
                        return false;
                    }
                }
            }
        }
        true
    }
}

/// The reach of what a rule concludes, by the reach `of` what it reads: a node's name says its file, so premises that
/// hold one variable where each holds a node of its own file are of one file, and an absence asked of such a node is
/// settled there.
/// The variable whose node a term names: itself, or the one argument of a term of one argument (`after(D)`).
fn named(h: &Heap, t: Term) -> Option<Sym> {
    match t.kind() {
        TermK::Var(v) => Some(v),
        TermK::Func(i) => match h.fargs(i) {
            [a] => named(h, *a),
            _ => None,
        },
        _ => None,
    }
}

fn rule_reach(h: &Heap, eq: Sym, r: &ERule, of: &dyn Fn(&Lit) -> Option<Reach>) -> Reach {
    let c = &r.clause;
    if !r.safe || r.has_thr || r.has_demand_prem || !r.lattice_outer.is_empty() || r.lat_close.is_some() || c.head.temporal != Temporal::Now {
        return Reach::Across;
    }
    let mut p = Prems::default();
    if !p.read(h, eq, &c.body, of) {
        return Reach::Across;
    }
    let Prems { mut sets, negs, unjudged, same } = p;
    let Some(mut group) = sets.pop().or_else(|| (!unjudged.is_empty()).then(Vec::new)) else {
        return if negs.is_empty() { Reach::Free } else { Reach::Across };
    };
    while !sets.is_empty() {
        let Some(i) = sets.iter().position(|s| s.iter().any(|v| group.contains(v))) else { return Reach::Across };
        group.extend(sets.swap_remove(i));
    }
    group.extend(unjudged);
    while let Some(v) = same.iter().find_map(|&(a, b)| [(a, b), (b, a)].into_iter().find(|(x, y)| group.contains(x) && !group.contains(y)).map(|p| p.1)) {
        group.push(v);
    }
    if negs.iter().any(|n| !n.iter().any(|v| group.contains(v))) {
        return Reach::Across;
    }
    let mut mask = 0u64;
    for (i, t) in c.head.args.iter().enumerate().take(64) {
        if named(h, *t).is_some_and(|v| group.contains(&v)) {
            mask |= 1 << i;
        }
    }
    Reach::File(mask)
}

impl Eval {
    /// The reach of every relation, by the arguments `own` declares: the greatest that every rule keeps. What a rule of
    /// the stage `lower` concludes is of one file whatever its shape: it is evaluated a file at a time.
    fn reaches(&mut self, own: &FxMap<Sym, u64>, lower: &FxSet<Sym>) -> Reaches {
        let rules = self.rules.clone();
        let heads: FxSet<(Sym, Sym)> = rules.iter().map(|r| Reaches::key(&r.clause.head)).collect();
        let stated: FxSet<(Sym, Sym)> = self.store.all_facts().into_iter().map(|f| self.store.rec(f)).map(|r| (r.rel, r.persp)).collect();
        let mut at = Reaches(own.iter().map(|(r, m)| ((*r, ANY), Reach::File(*m))).collect());
        // a relation no rule concludes into the book and no `own` names: the model's where it states it, else it holds nothing
        for k in stated.into_iter().filter(|k| !heads.contains(k) && !heads.contains(&(k.0, ANY)) && !own.contains_key(&k.0)) {
            at.0.insert(k, Reach::Free);
        }
        loop {
            let mut next = at.clone();
            let of = |l: &Lit| at.of(l);
            for r in rules.iter() {
                let x = match rule_reach(&self.h, self.v.op_eq, r, &of) {
                    Reach::Across if lower.contains(&r.id) => Reach::File(0),
                    x => x,
                };
                next.0.entry(Reaches::key(&r.clause.head)).and_modify(|e| *e = e.meet(x)).or_insert(x);
            }
            if next == at {
                return at;
            }
            at = next;
        }
    }

    /// `own[fixpointplan](Rel, I)`: a file states Rel, and argument I of it, from 0, holds a node of that file; `none`
    /// for I where no argument does.
    fn own_declared(&mut self) -> FxMap<Sym, u64> {
        let (rel, book) = (self.h.intern("own"), self.h.intern("fixpointplan"));
        let mut out: FxMap<Sym, u64> = FxMap::default();
        for f in self.store.rel_persp(&self.h, rel, book) {
            if let [r, i] = self.store.args(f) {
                let Some(r) = r.as_atom() else { continue };
                let m = out.entry(r).or_default();
                if let TermK::Int(i @ 0..64) = i.kind() {
                    *m |= 1 << i;
                }
            }
        }
        out
    }

    /// THE STAGE OF A WORLD EVALUATED A FILE AT A TIME: the lower stage of the books the plan cuts, and with it every
    /// rule above that cannot leave a file, by what `own[fixpointplan]` says of the facts given and the shape of the
    /// rules (`rule_reach`). What they conclude is a lemma of the file as the lower stage's is, and all of it is given.
    /// Where the plan names no `own`, the lower stage alone.
    pub fn lemma_stage(&mut self) -> Option<Stage> {
        let mut st = self.cut_stage()?;
        let own = self.own_declared();
        if own.is_empty() {
            return Some(st);
        }
        let at = self.reaches(&own, &st.rules);
        let mut rules: FxSet<Sym> = (*st.rules).clone();
        // a closure answered from its tree is walked in the file's world and in this one: its rows are not given
        let walked: FxSet<Sym> = (0..self.store.virtuals.len()).filter(|ci| !self.vc.vclosure_blocked.contains(ci)).map(|ci| self.store.virtuals[ci].rel).collect();
        for r in self.rules.clone().iter().filter(|r| !st.rules.contains(&r.id)) {
            let rel = r.clause.head.rel;
            match at.of(&r.clause.head) {
                Some(Reach::File(_)) if !walked.contains(&rel) => {
                    rules.insert(r.id);
                    st.heads.insert(rel);
                    st.given.insert(rel);
                }
                Some(Reach::Free | Reach::File(_)) => {
                    rules.insert(r.id);
                    st.free.insert(r.id);
                }
                _ => {}
            }
        }
        st.rules = Rc::new(rules);
        st.own = own;
        Some(st)
    }

    /// The stage this world was evaluated by: a file at a time where it was given its files' lemmas, else the cut alone.
    pub(super) fn stage_here(&mut self) -> Option<Stage> {
        if self.stage_given.is_some() { self.lemma_stage() } else { self.cut_stage() }
    }

    /// A relation `own[fixpointplan]` names is stated by files alone: a fact of it that is of no one file is refused.
    pub fn refuse_own_outside(&mut self, st: &Stage) -> Result<(), Halt> {
        let rels: Vec<Sym> = st.own.keys().copied().collect();
        for rel in rels {
            if let Some(&f) = self.store.rel_all(&self.h, rel).iter().find(|f| self.store.alive(**f)) {
                let n = self.h.name(rel);
                return Err(Halt::reject(format!("{} is of no one file, and `own[fixpointplan]({n}, _)` says a file states '{n}'", self.store.key(&self.h, f))));
            }
        }
        Ok(())
    }

    /// What a file's world gives is checked against the plan: an argument `own[fixpointplan]` names holds a node of
    /// the one file, and the file states no relation the plan does not name. The world's own facts are above `from`.
    pub fn own_kept(&self, st: &Stage, from: FactId) -> Result<(), Halt> {
        if st.own.is_empty() {
            return Ok(());
        }
        let mut file: Option<String> = None;
        for id in (from..self.store.len_ids()).filter(|&id| self.store.alive(id)) {
            let r = self.store.rec(id);
            if !r.base() {
                continue;
            }
            let Some(m) = st.own.get(&r.rel) else {
                let n = self.h.name(r.rel);
                return Err(Halt::reject(format!("{} is stated by a file, and the plan names what a file states: say `own[fixpointplan]({n}, I)` of each argument I that holds a node of the file, or `own[fixpointplan]({n}, none)`", self.store.key(&self.h, id))));
            };
            for (i, t) in self.store.args(id).iter().enumerate().filter(|(i, _)| *i < 64 && m >> i & 1 == 1) {
                let named = match t.kind() {
                    TermK::Atom(x) | TermK::Str(x) => super::volumes::file_of(self.h.name(x)),
                    _ => None,
                };
                if named.is_none() || file.as_deref().is_some_and(|f| Some(f) != named) {
                    return Err(Halt::reject(format!("{} holds at argument {i} no node of its file, and `own[fixpointplan]({}, {i})` says every fact of it does", self.store.key(&self.h, id), self.h.name(r.rel))));
                }
                if file.is_none() {
                    file = named.map(str::to_string);
                }
            }
        }
        Ok(())
    }

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
        Some(Stage { rules, heads, given: FxSet::default(), cut, wide, own: FxMap::default(), free: FxSet::default() })
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
        let unread_n = unread.len();
        drop.extend(unread);
        self.store.remove_many(&drop);
        self.note_staged_away(&st);
        let books: Vec<String> = st.cut.iter().map(|b| format!("[{}]", self.h.name(*b))).collect();
        self.diags.push(format!("stage: {} rules below, {} lemmas, {} facts of {} cut, {} nothing above reads; widest below: {}", st.rules.len(), lemmas.len(), drop.len() - unread_n, books.join(" "), unread_n, st.wide.join(", ")));
        self.stage_pass = StagePass::Upper(st.rules);
        self.run_whole()
    }

    /// The lower stage evaluated alone, whole: a stop by a wall is a budget's halt.
    pub fn lower_stage(&mut self, st: &Stage) -> Result<(), Halt> {
        self.stage_pass = StagePass::Lower(st.rules.clone());
        self.stage_both = Rc::new(st.free.clone());
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

    /// What one file gives a world by volumes, as text: its lower stage's lemmas and its facts outside the cut books
    /// where the program cuts one (`take_lemmas`), else its base facts. A fork of the core, its own facts above `from`.
    pub fn given_by_file(&self, text: &str, st: Option<&Stage>) -> Result<Vec<String>, Halt> {
        let mut low = self.fork();
        let from = low.store.len_ids();
        super::volumes::load_text(&mut low, text)?;
        if let Some(st) = st {
            low.lower_stage(st)?;
            low.own_kept(st, from)?;
        }
        Ok((from..low.store.len_ids())
            .filter(|&id| low.store.alive(id))
            .filter(|&id| {
                let r = low.store.rec(id);
                match st {
                    Some(st) => !st.cut.contains(&r.persp) && (r.base() || st.given.contains(&r.rel)),
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

    /// What a staged evaluation takes away: the cut books, and the relations concluded below that nothing above reads.
    pub(super) fn note_staged_away(&mut self, st: &Stage) {
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
        if !r.base() {
            return false;
        }
        let key = (self.rules.len() + usize::from(self.stage_given.is_some()), self.cut_books());
        if self.lemma_heads.as_ref().is_none_or(|(k, _)| *k != key) {
            let heads = self.stage_here().map(|st| Rc::new(st.heads)).unwrap_or_default();
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
        let st = self.stage_here()?;
        let held = st.heads.iter().any(|&rel| self.store.rel_all(&self.h, rel).into_iter().any(|f| self.store.rec(f).base()));
        held.then(|| {
            let books: Vec<String> = st.cut.iter().map(|b| format!("[{}]", self.h.name(*b))).collect();
            format!("the world cut {} and holds the lemmas proved from it: a fact taken out would leave the lemmas it proved; evaluate the files anew", books.join(" "))
        })
    }
}
