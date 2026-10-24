//! WHAT A WORLD CAN JOIN NOW of facts another worker made (the hypothesis "deliver by the keys of the rules"). A fact is
//! taken when some rule reading its relation could fire on it: every argument the rule joins on is found where the rule
//! joins it, or the rule copies the fact into a relation whose own readers could. A relation negated or aggregated is
//! always taken; what no rule could fire on now is held, and asked about again at the next barrier.

use super::*;

#[derive(Clone)]
pub(crate) enum Need {
    Always,
    /// any one alternative; none means no rule reads the relation
    Alts(Vec<Alt>),
}

#[derive(Clone)]
pub(crate) enum Alt {
    Join(Vec<Check>),
    /// the head's position j takes the fact's position `map[j]`
    Copy { map: Vec<Option<usize>>, rel: Sym, persp: Option<Sym> },
}

#[derive(Clone)]
pub(crate) enum Check {
    Const(usize, Term),
    /// one fact of the partner holds the fact's position `pos[i]` at its `at[i]`
    Partner { pos: Vec<usize>, rel: Sym, persp: Option<Sym>, arity: usize, at: Vec<usize> },
}

impl Eval {
    pub(crate) fn need(&mut self, rel: Sym, persp: Sym) -> Need {
        if let Some(n) = self.needs.get(&(rel, persp)) {
            return n.clone();
        }
        self.needs.insert((rel, persp), Need::Always);
        let n = self.need_of(rel, persp);
        self.needs.insert((rel, persp), n.clone());
        n
    }

    fn need_of(&self, rel: Sym, persp: Sym) -> Need {
        let reads = |l: &Lit| l.rel == rel && l.persp.as_atom().is_none_or(|p| p == persp);
        let mut alts = Vec::new();
        for r in &self.rules {
            let body = &r.plan;
            if r.has_thr || body.iter().any(|b| match b {
                BodyElem::Neg(l) => reads(l),
                BodyElem::Agg(_) => b.lits_deep().into_iter().any(reads),
                _ => false,
            }) {
                return Need::Always;
            }
            for (i, b) in body.iter().enumerate() {
                let BodyElem::Pos(l) = b else { continue };
                if !reads(l) {
                    continue;
                }
                let others: Vec<&Lit> = body.iter().enumerate().filter(|(j, _)| *j != i).filter_map(|(_, b)| match b {
                    BodyElem::Pos(m) => Some(m),
                    _ => None,
                }).collect();
                if others.is_empty() {
                    let h = &r.clause.head;
                    let map = h.args.iter().map(|t| if t.is_var() { l.args.iter().position(|a| a == t) } else { None }).collect();
                    alts.push(Alt::Copy { map, rel: h.rel, persp: h.persp.as_atom() });
                    continue;
                }
                let mut checks = Vec::new();
                for (k, t) in l.args.iter().enumerate() {
                    if !t.is_var() && self.h.is_ground(*t) {
                        checks.push(Check::Const(k, *t));
                    }
                }
                for m in &others {
                    let (mut pos, mut at) = (Vec::new(), Vec::new());
                    for (k, t) in l.args.iter().enumerate() {
                        if t.is_var() && !l.args[..k].contains(t) {
                            if let Some(q) = m.args.iter().position(|a| a == t) {
                                pos.push(k);
                                at.push(q);
                            }
                        }
                    }
                    if !pos.is_empty() {
                        checks.push(Check::Partner { pos, rel: m.rel, persp: m.persp.as_atom(), arity: m.args.len(), at });
                    }
                }
                alts.push(Alt::Join(checks));
            }
        }
        Need::Alts(alts)
    }

    /// Whether some rule could fire now on a fact of `rel` whose known arguments are `arg(k)`.
    pub(crate) fn joinable(&mut self, rel: Sym, persp: Sym, arg: &dyn Fn(usize) -> Option<Term>, depth: usize, wake: &mut Vec<(Sym, usize, Term)>) -> bool {
        let Need::Alts(alts) = self.need(rel, persp) else { return true };
        if depth > 8 {
            return true;
        }
        for a in &alts {
            let ok = match a {
                Alt::Join(checks) => {
                    let (mut all, mut mine, mut partners) = (true, false, false);
                    let mut keys = Vec::new();
                    for c in checks {
                        match *c {
                            Check::Const(k, t) => all &= arg(k).is_none_or(|v| v == t),
                            Check::Partner { ref pos, rel, persp, arity, ref at } => {
                                let (mut ps, mut vs) = (Vec::new(), Vec::new());
                                for (p, a) in pos.iter().zip(at) {
                                    if let Some(v) = arg(*p) {
                                        ps.push(*a);
                                        vs.push(v);
                                    }
                                }
                                partners = true;
                                let (any, own) = if ps.is_empty() { (true, true) } else { self.holds_at(rel, persp, arity, &ps, &vs) };
                                if !ps.is_empty() {
                                    keys.push((rel, ps[0], vs[0]));
                                }
                                if !any {
                                    all = false;
                                    wake.extend(keys.pop());
                                    keys.clear();
                                }
                                mine |= own;
                            }
                        }
                        if !all {
                            break;
                        }
                    }
                    let ok = all && (mine || !partners || self.foreign.is_empty());
                    if all && !ok {
                        wake.extend(keys);
                    }
                    ok
                }
                Alt::Copy { map, rel: hr, persp: hp } => {
                    let inner = |j: usize| map.get(j).copied().flatten().and_then(arg);
                    self.joinable(*hr, hp.unwrap_or(persp), &inner, depth + 1, wake)
                }
            };
            if ok {
                return true;
            }
        }
        false
    }

    /// Whether a fact of the partner holds these values, and whether one of this world's own does.
    fn holds_at(&mut self, rel: Sym, persp: Option<Sym>, arity: usize, at: &[usize], vs: &[Term]) -> (bool, bool) {
        match self.store.arg_matches_upto(&self.h, rel, persp, arity, at, vs, 256) {
            None => (true, true),
            Some(ids) => {
                let (mut any, mut own) = (false, false);
                for &id in &ids {
                    if self.store.alive(id) && at.iter().zip(vs).all(|(a, v)| self.store.args(id).get(*a) == Some(v)) {
                        any = true;
                        own |= !self.foreign.contains(&id);
                    }
                }
                (any, own)
            }
        }
    }
}

impl Eval {
    pub fn need_text(&mut self, rel: Sym, persp: Sym, depth: usize) -> String {
        let n = self.need(rel, persp);
        let pad = "  ".repeat(depth);
        let name = format!("{}[{}]", self.h.name(rel), self.h.name(persp));
        let Need::Alts(alts) = n else { return format!("{pad}{name}: ALWAYS\n") };
        let mut out = format!("{pad}{name}: {} alts\n", alts.len());
        if depth > 3 {
            return out;
        }
        for a in alts {
            match a {
                Alt::Join(cs) => {
                    let d: Vec<String> = cs.iter().map(|c| match c {
                        Check::Const(k, _) => format!("const@{k}"),
                        Check::Partner { pos, rel, at, .. } => format!("{}{:?}->{:?}", self.h.name(*rel), pos, at),
                    }).collect();
                    out.push_str(&format!("{pad}  join [{}]\n", d.join(", ")));
                }
                Alt::Copy { map, rel: r, persp: p } => {
                    out.push_str(&format!("{pad}  copy {:?}\n", map));
                    out.push_str(&self.need_text(r, p.unwrap_or(persp), depth + 2));
                }
            }
        }
        out
    }
}

/// A fact held until something it could join with arrives: the keys it waits on are in `Eval::wake`.
#[derive(Clone)]
pub(crate) struct Held {
    pub rel: Sym,
    pub persp: Sym,
    pub args: Vec<Term>,
    pub line: String,
    pub taken: bool,
}

impl Eval {
    /// The facts of `cands` some rule could fire on now, as lines; the rest are held, each under the keys it waits on.
    pub(crate) fn take_joinable(&mut self, cands: Vec<Held>) -> String {
        let mut take = String::new();
        for c in cands {
            let mut wake = Vec::new();
            if self.joinable(c.rel, c.persp, &|k| c.args.get(k).copied(), 0, &mut wake) {
                take.push_str(&c.line);
                take.push('\n');
            } else if !wake.is_empty() {
                let i = self.held.len() as u32;
                for (rel, at, v) in wake {
                    let ps = self.wake_at.entry(rel).or_default();
                    if !ps.contains(&at) {
                        ps.push(at);
                    }
                    self.wake.entry((rel, at, v)).or_default().push(i);
                }
                self.held.push(c);
            }
        }
        take
    }

    /// The held facts something since `self.woke_from` could wake.
    pub(crate) fn woken(&mut self) -> Vec<Held> {
        let (from, to) = (self.woke_from, self.store.len_ids());
        self.woke_from = to;
        let mut out = Vec::new();
        if self.wake.is_empty() {
            return out;
        }
        for id in from..to {
            if !self.store.alive(id) {
                continue;
            }
            let rel = self.store.rec(id).rel;
            let Some(ps) = self.wake_at.get(&rel) else { continue };
            for &at in ps.clone().iter() {
                let Some(&v) = self.store.args(id).get(at) else { continue };
                for i in self.wake.remove(&(rel, at, v)).unwrap_or_default() {
                    let h = &mut self.held[i as usize];
                    if !h.taken {
                        h.taken = true;
                        out.push(Held { rel: h.rel, persp: h.persp, args: std::mem::take(&mut h.args), line: std::mem::take(&mut h.line), taken: false });
                    }
                }
            }
        }
        out
    }
}

impl Eval {
    pub fn held_count(&self) -> usize {
        self.held.iter().filter(|h| !h.taken).count()
    }
}
