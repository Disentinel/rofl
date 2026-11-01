//! WHICH RULE AN EVALUATION SPENDS ITSELF ON, and where in its body. Per
//! premise of each rule: the partial rows it was solved from, the rows it read
//! from the store, the rows it left, and its widest single read with the values
//! bound there. Rows read are deterministic, so the same world names the same
//! rule on every run. The engine does not act on it (a planner that pays every
//! run is not wanted): `hot_rules` says it to the author, who rewrites the rule.

use super::*;
use crate::store::Fx;
use std::hash::{Hash, Hasher};

/// A rule that has read at least this many rows (`Eval::hot_read`), a quarter
/// or more of all the rows read, is named without being asked.
pub const HOT_READ: u64 = 50_000_000;
const HOT_SHARE: u64 = 4;

#[derive(Clone, Default, Debug)]
pub struct PremCost {
    pub rows_in: u64,
    pub read: u64,
    pub rows_out: u64,
    pub widest: Widest,
}

/// The widest single read of the store: its rows, and the premise's arguments as they were bound.
#[derive(Clone, Default, Debug)]
pub struct Widest {
    pub n: usize,
    pub at: Vec<Term>,
}

/// What each rule's premises cost while it is evaluated, held by `Eval`.
#[derive(Clone)]
pub struct CostState {
    /// What each premise of each rule cost (`cost.rs`), by rule and premise.
    pub prem_cost: FxMap<(Sym, u64), PremCost>,
    pub(super) read_rows: u64,
    pub(super) widest: Widest,
    pub(super) wide_floor: usize,
    /// Rows read under each rule, and the count at which it is next said to be hot.
    pub read_by_rule: FxMap<Sym, (u64, u64)>,
    pub(super) hot_read: u64,
    /// Told each hot rule as it is found, as the sentence `hot_said` keeps.
    pub on_hot: Option<fn(&str)>,
    pub hot_said: Vec<String>,
    pub argm_by_rule: HashMap<Sym, u64>,
    /// Nanoseconds in each rule's firings, and per round the sum and the longest rule: the bound on firing rules in parallel.
    pub ns_by_rule: HashMap<Sym, u64>,
    /// Per rule: firings, solutions concluded, and rows that were new.
    pub fires_by_rule: HashMap<Sym, u64>,
    pub sols_by_rule: HashMap<Sym, u64>,
    pub new_by_rule: HashMap<Sym, u64>,
    /// Firings solved delta-first.
    pub delta_by_rule: HashMap<Sym, u64>,
}

impl Default for CostState {
    fn default() -> Self {
        CostState {
            prem_cost: FxMap::default(), read_rows: 0, widest: Widest::default(), wide_floor: 0,
            read_by_rule: FxMap::default(), hot_read: HOT_READ, on_hot: None, hot_said: Vec::new(),
            argm_by_rule: HashMap::new(), ns_by_rule: HashMap::new(), fires_by_rule: HashMap::new(),
            sols_by_rule: HashMap::new(), new_by_rule: HashMap::new(), delta_by_rule: HashMap::new(),
        }
    }
}

pub struct Mark {
    key: (Sym, u64),
    read0: u64,
    outer: Widest,
    outer_floor: usize,
}

#[derive(Clone, Debug)]
pub struct Hot {
    pub rule: String,
    pub head: String,
    pub read: u64,
    pub new: u64,
    pub at: usize,
    pub prem: String,
    pub cost: PremCost,
    /// The variables of the premise bound at its widest read, and their values.
    pub bound: String,
}

impl Hot {
    pub fn sentence(&self) -> String {
        let c = &self.cost;
        let mut s = format!(
            "rule {} ({}) read {} rows for {} new facts; {} of them at premise {}, {}, solved from {} partial rows into {}",
            self.rule, self.head, self.read, self.new, c.read, self.at + 1, self.prem, c.rows_in, c.rows_out
        );
        if c.widest.n > 1 {
            s += &format!("; its widest read was {} rows", c.widest.n);
            if !self.bound.is_empty() {
                s += &format!(" at {}", self.bound);
            }
        }
        s
    }
}

pub(super) fn prem_key(b: &BodyElem) -> Option<u64> {
    let mut h = Fx::default();
    match b {
        BodyElem::Pos(l) | BodyElem::Neg(l) => {
            matches!(b, BodyElem::Neg(_)).hash(&mut h);
            l.rel.hash(&mut h);
            l.args.hash(&mut h);
        }
        BodyElem::Bi { op, l, r } => {
            op.hash(&mut h);
            l.hash(&mut h);
            r.hash(&mut h);
        }
        BodyElem::Agg(_) => return None,
    }
    Some(h.finish())
}

impl Eval {
    /// A read of the store by premise `l` under `s`, of `n` rows; its bindings kept only when it
    /// is wider than any read of the premise being solved before.
    /// A rule crossing `HOT_READ`, and each tenfold after, while it is a quarter of the reading, is said at once
    /// (`on_hot`): a rule that blows up may never end for its report to be read.
    pub(super) fn note_read(&mut self, l: &Lit, s: &Subst, n: usize) {
        self.cost.read_rows += n as u64;
        if let Some(rid) = self.cur_rule {
            let first = self.cost.hot_read;
            let e = self.cost.read_by_rule.entry(rid).or_insert((0, first));
            e.0 += n as u64;
            if e.0 >= e.1 {
                e.1 = e.1.saturating_mul(10);
                let read = e.0;
                if read * HOT_SHARE >= self.cost.read_rows {
                    self.say_hot(rid, l, s);
                }
            }
        }
        if n > self.cost.wide_floor && n > self.cost.widest.n {
            let at = l.args.iter().map(|a| resolve(&mut self.h, *a, s)).collect();
            self.cost.widest = Widest { n, at };
        }
    }

    #[cold]
    fn say_hot(&mut self, rid: Sym, l: &Lit, s: &Subst) {
        let at: Vec<Term> = l.args.iter().map(|a| resolve(&mut self.h, *a, s)).collect();
        let bound = self.bound_text(l, &at);
        let mut lit = String::new();
        canon_lit(&self.h, l, &mut lit);
        let r = self.rules.iter().find(|r| r.id == rid);
        let head = r.map_or(String::new(), |r| format!(" ({})", self.h.name(r.clause.head.rel)));
        let k = r.and_then(|r| r.clause.body.iter().position(|b| matches!(b, BodyElem::Pos(p) | BodyElem::Neg(p) if p.rel == l.rel && p.args == l.args)));
        let mut said = format!(
            "rule {}{head} has read {} rows for {} new facts, a quarter or more of all read; it is reading premise {}{lit}",
            self.h.name(rid),
            self.cost.read_by_rule[&rid].0,
            self.cost.new_by_rule.get(&rid).copied().unwrap_or(0),
            k.map_or(String::new(), |k| format!("{}, ", k + 1)),
        );
        if !bound.is_empty() {
            said += &format!(" at {bound}");
        }
        if let Some(f) = self.cost.on_hot {
            f(&said);
        }
        self.cost.hot_said.push(said);
    }

    fn bound_text(&self, l: &Lit, at: &[Term]) -> String {
        let mut bound: Vec<String> = Vec::new();
        for (a, v) in l.args.iter().zip(at) {
            if a.is_var() && self.h.is_ground(*v) {
                let b = format!("{} = {}", self.h.canon(*a), self.h.canon(*v));
                if !bound.contains(&b) {
                    bound.push(b);
                }
            }
        }
        bound.join(", ")
    }

    /// The `n` rules that read the most rows, each at its costliest premise.
    pub fn hot_rules(&self, n: usize) -> Vec<Hot> {
        let mut by: Vec<(Sym, u64)> = self.cost.read_by_rule.iter().map(|(r, (n, _))| (*r, *n)).filter(|(_, n)| *n > 0).collect();
        by.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| self.h.name(a.0).cmp(self.h.name(b.0))));
        by.into_iter().take(n).filter_map(|(rid, _)| self.hot_rule(rid)).collect()
    }

    /// What rule `rid` read, at its costliest premise.
    pub fn hot_rule(&self, rid: Sym) -> Option<Hot> {
        let read = self.cost.read_by_rule.get(&rid)?.0;
        {
            let r = self.rules.iter().find(|r| r.id == rid)?;
            let mut best: Option<(usize, &PremCost)> = None;
            for (i, b) in r.clause.body.iter().enumerate() {
                let Some(c) = prem_key(b).and_then(|k| self.cost.prem_cost.get(&(rid, k))) else { continue };
                if best.is_none_or(|(_, x): (usize, &PremCost)| c.read > x.read) {
                    best = Some((i, c));
                }
            }
            let (at, cost) = best?;
            let b = &r.clause.body[at];
            let mut prem = String::new();
            canon_body_elem(&self.h, b, &mut prem);
            let bound = match b {
                BodyElem::Pos(l) | BodyElem::Neg(l) => self.bound_text(l, &cost.widest.at),
                _ => String::new(),
            };
            Some(Hot {
                rule: self.h.name(rid).to_string(),
                head: self.h.name(r.clause.head.rel).to_string(),
                read,
                new: self.cost.new_by_rule.get(&rid).copied().unwrap_or(0),
                at,
                prem,
                cost: cost.clone(),
                bound,
            })
        }
    }

    /// The rules that read so much of all that is read that the author should hear of them.
    pub fn too_hot(&self) -> Vec<Hot> {
        self.hot_rules(4).into_iter().filter(|h| h.read >= self.cost.hot_read && h.read * HOT_SHARE >= self.cost.read_rows).collect()
    }
}

/// The relations the profile writes, all in the book `profile`; a rule that reads one of them asks for the profile.
/// The book is shared with rules/profile.rofl, which reads the store's shape there under other names.
const PROFILE_RELS: [&str; 15] =
    ["fires", "conc", "fresh", "delta_fires", "written_order", "order", "width", "read", "yield", "widest", "rows", "distinct", "program", "kernel_premise", "kernel_head"];

impl Eval {
    /// Whether a rule reads the book `profile`: then the evaluation is written there as facts (`profile_text`).
    pub fn profile_wanted(&mut self) -> bool {
        let p = self.h.intern("profile");
        let names: Vec<Sym> = PROFILE_RELS.iter().map(|n| self.h.intern(n)).collect();
        self.rules.iter().any(|r| {
            r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| l.persp.as_atom() == Some(p) && names.contains(&l.rel))
        })
    }

    /// THE EVALUATION AS FACTS OF THE BOOK `profile`, one a line, in a fixed order, for the rules that read it
    /// (docs/cli.md, *The profile of an evaluation*). `K` is a premise's written position as `premise_lit` counts it,
    /// from 1; `Pos` an argument's, from 1. Per rule: `fires(R, N)` firings, `conc(R, N)` solutions concluded,
    /// `fresh(R, N)` rows that were new, `delta_fires(R, N)` firings solved news first, `written_order(R, Why)` why
    /// the planner kept it in written order. Per premise: `width(R, K, N)` partial rows that reached it,
    /// `read(R, K, N)` rows read from the store there, `yield(R, K, N)` rows that left it, `widest(R, K, N)` its
    /// widest single read. Per relation of a user's book: `rows(Rel, Book, N)` live rows and `distinct(Rel, Book,
    /// Pos, N)` the distinct values at `Pos`, the planner's own measure (`Store::probe_stats`). Rows read are
    /// deterministic, so the same world profiles the same on every run; time is not written.
    pub fn profile_text(&mut self) -> String {
        use std::fmt::Write;
        let mut out = String::new();
        let mut rules: Vec<Rc<ERule>> = self.rules.clone();
        rules.sort_by(|a, b| cmp_js(self.h.name(a.id), self.h.name(b.id)));
        let count = |m: &HashMap<Sym, u64>, r: Sym| m.get(&r).copied().unwrap_or(0);
        for r in &rules {
            let id = self.h.name(r.id).to_string();
            let _ = writeln!(
                out,
                "fires[profile]({id}, {}). conc[profile]({id}, {}). fresh[profile]({id}, {}). delta_fires[profile]({id}, {}).",
                count(&self.cost.fires_by_rule, r.id),
                count(&self.cost.sols_by_rule, r.id),
                count(&self.cost.new_by_rule, r.id),
                count(&self.cost.delta_by_rule, r.id)
            );
            if let Some(why) = self.written_order_reason(r) {
                let _ = writeln!(out, "written_order[profile]({id}, {why}).");
            }
            for (i, b) in r.clause.body.iter().enumerate() {
                let Some(c) = prem_key(b).and_then(|k| self.cost.prem_cost.get(&(r.id, k))) else { continue };
                let k = i + 1;
                let _ = writeln!(
                    out,
                    "width[profile]({id}, {k}, {}). read[profile]({id}, {k}, {}). yield[profile]({id}, {k}, {}).",
                    c.rows_in, c.read, c.rows_out
                );
                if c.widest.n > 0 {
                    let _ = writeln!(out, "widest[profile]({id}, {k}, {}).", c.widest.n);
                }
            }
        }
        // the orders the planner solved in, by rule and news position, in written positions: from a plan fact or greedy
        let mut orders: Vec<(String, usize, Vec<usize>, bool)> = Vec::new();
        for (&(rid, at), slot) in self.add.delta_plans.iter() {
            let super::joinplan::Slot::Plan(p) = slot else { continue };
            let Some(r) = self.rules.iter().find(|r| r.id == rid) else { continue };
            let at = match at {
                a if a == usize::MAX >> 1 => Some(0),
                a if a & (1 << 62) != 0 => None,
                a => self.written_pos(r, a),
            };
            let ks: Option<Vec<usize>> = p.perm.iter().map(|&j| self.written_pos(r, j)).collect();
            if let (Some(at), Some(ks)) = (at, ks) {
                orders.push((self.h.name(rid).to_string(), at, ks, p.given));
            }
        }
        orders.sort_by(|a, b| cmp_js(&a.0, &b.0).then(a.1.cmp(&b.1)));
        for (id, at, ks, given) in orders {
            let list = ks.iter().rev().fold("$nil".to_string(), |t, k| format!("$cons({k}, {t})"));
            let _ = writeln!(out, "order[profile]({id}, {at}, {list}, {}).", if given { "plan" } else { "greedy" });
        }
        let mut census: Vec<(String, String, Sym, Sym, usize, usize)> = self
            .store
            .live_census()
            .into_iter()
            .filter(|&(rel, book, _, _)| !self.v.is_reserved(rel) && !is_kernel_ledger(&self.h, book) && self.h.name(book) != "profile")
            .map(|(rel, book, n, arity)| (self.h.name(rel).to_string(), self.h.name(book).to_string(), rel, book, n, arity))
            .collect();
        census.sort_by(|a, b| cmp_js(&a.0, &b.0).then_with(|| cmp_js(&a.1, &b.1)));
        for (rel_name, book_name, rel, book, n, arity) in census {
            let _ = writeln!(out, "rows[profile]({rel_name}, {book_name}, {n}).");
            for pos in 0..arity {
                let (_, d) = self.store.probe_stats(&self.h, rel, Some(book), &[], &[], &[pos]);
                let _ = writeln!(out, "distinct[profile]({rel_name}, {book_name}, {}, {d}).", pos + 1);
            }
        }
        if let Some(k) = &self.kernel_profile {
            out.push_str(k);
        }
        out
    }

    /// THE KERNEL'S OWN PROGRAM PROFILED: this evaluation's `profile_text` (it is safety.rofl's), then
    /// `program[profile](R, safety)` for each of its rules and their reflection as the world's `premise_lit` and
    /// `conclusion_lit` would carry it, `kernel_premise[profile](R, K, L)` and `kernel_head[profile](R, L)`, since
    /// the kernel's rules are reflected in no world of a user's. A hypothesis pack reads them as it reads the
    /// world's rules (models/engine/profile.rofl). The relations seeded from the world are the kernel's book and
    /// are not censused; safety.rofl's own are.
    pub fn kernel_profile_text(&mut self) -> String {
        use std::fmt::Write;
        let mut out = self.profile_text();
        let mut rules: Vec<Rc<ERule>> = self.rules.clone();
        rules.sort_by(|a, b| cmp_js(self.h.name(a.id), self.h.name(b.id)));
        for r in &rules {
            let id = self.h.name(r.id).to_string();
            let _ = writeln!(out, "program[profile]({id}, safety).");
            let head = crate::reflect::reify_lit(&mut self.h, &self.v, &r.clause.head);
            let _ = writeln!(out, "kernel_head[profile]({id}, {}).", self.h.canon(head));
            // a builtin's arithmetic prints as a prefix functor the parser does not read back: its operator alone
            for (i, b) in r.clause.body.iter().enumerate() {
                let text = match b {
                    BodyElem::Bi { op, .. } => format!("$builtin({:?}, $nil)", self.h.name(*op)),
                    BodyElem::Agg(_) => "$agg".to_string(),
                    _ => {
                        let t = crate::reflect::reify_body_elem(&mut self.h, &self.v, b);
                        self.h.canon(t)
                    }
                };
                let _ = writeln!(out, "kernel_premise[profile]({id}, {}, {text}).", i + 1);
            }
        }
        out
    }
}

impl CostState {
    /// Premise `b` of rule `rid` about to be solved: what its cost is measured from.
    pub(super) fn cost_mark(&mut self, rid: Option<Sym>, b: &BodyElem) -> Option<Mark> {
        let key = (rid?, prem_key(b)?);
        let floor = self.prem_cost.get(&key).map_or(0, |c| c.widest.n);
        Some(Mark {
            key,
            read0: self.read_rows,
            outer: std::mem::take(&mut self.widest),
            outer_floor: std::mem::replace(&mut self.wide_floor, floor),
        })
    }

    /// The premise of `m` solved from `rows_in` rows into `rows_out`.
    pub(super) fn note_cost(&mut self, m: Mark, rows_in: usize, rows_out: usize) {
        let wide = std::mem::take(&mut self.widest);
        self.widest = if wide.n > m.outer.n { wide.clone() } else { m.outer };
        self.wide_floor = m.outer_floor;
        let c = self.prem_cost.entry(m.key).or_default();
        c.rows_in += rows_in as u64;
        c.read += self.read_rows - m.read0;
        c.rows_out += rows_out as u64;
        if wide.n > c.widest.n {
            c.widest = wide;
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::session::Session;

    /// The shape that cost a piece of vscode 55 s: a name joined to every
    /// binder of the name, the planner pricing the average name.
    #[test]
    fn a_join_by_a_common_name_is_named_with_the_name() {
        let mut src = String::new();
        for i in 0..300 {
            src += &format!("use(u{i}, e). bind(b{i}, e). use(v{i}, n{i}). bind(c{i}, n{i}).\n");
        }
        for i in 0..5000 {
            src += &format!("inside(x{i}, y{i}).\n");
        }
        src += "inside(b1, u1).\nsees(U, B) :- use(U, N), bind(B, N), inside(B, U).\nother(U) :- use(U, _).\n";
        let mut s = Session::fresh(100_000_000);
        s.eval.cost.hot_read = 10_000;
        s.eval.cost.on_hot = Some(|t| eprintln!("hot: {t}"));
        s.load(&src, None).unwrap();
        s.evaluate().unwrap();
        assert!(s.holds("sees(u1, b1)").unwrap());
        let said = s.eval.cost.hot_said.join("\n");
        let top: Vec<String> = s.eval.hot_rules(3).iter().map(|h| h.sentence()).collect();
        assert!(said.contains("(sees)") && said.contains("= e"), "said: {said}\ntop: {top:#?}");
        let top = &s.eval.hot_rules(1)[0];
        assert_eq!(top.head, "sees");
        assert!(top.cost.widest.n >= 300, "{}", top.sentence());
        assert!(top.sentence().contains("?N = e"), "{}", top.sentence());
        assert_eq!(s.eval.too_hot().len(), 1);
    }
}
