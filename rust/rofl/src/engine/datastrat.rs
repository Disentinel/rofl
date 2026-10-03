//! DATA-LEVEL STRATIFICATION (docs/aggregates.md, "Data-level stratification,
//! as built"; `f_an_aggregate_is_refused_by_relation_and_not_by_data`).
//!
//! A body aggregate reads a closed relation, and `peel_rounds` ranks relations,
//! so a spreadsheet's `val(N, V) :- sum_head(N, I), V is sum(X ; C :
//! in_range(I, C), addend(C, X))` is refused: val, value and addend read each
//! other as relations, though no cell reads itself. A component of relations
//! whose only strict edges are aggregates' is ranked as one round instead
//! (`data_demotable`), and what the rank does not say is read off the data,
//! once, when the round is reached and every relation below it is closed:
//!
//! - a NODE is a pattern over a relation of the component (`val(n3, _)`, a
//!   `_` for a position nothing bound) or a CORRELATION of one aggregate
//!   element, the cell it seals: `(rule, at, the values of the shared
//!   variables bound before it)`. Its edges are what it reads of the
//!   component: a pattern's are the premises of each rule that could conclude
//!   it, read left to right in the rule's plan, with every premise of a
//!   relation OUTSIDE the component matched against the store (closed), so a
//!   key a closed relation binds is a constant, and with a premise of the
//!   component binding nothing (`_`); a correlation's are the premises of its
//!   inner body, read the same way;
//! - a correlation seals only after every correlation it reaches has: its
//!   LAYER is one more than the greatest among those it reaches without
//!   passing another, 0 for none, and each layer is released together
//!   (`ds_released`), its rules fired, and the news propagated before the
//!   next is;
//! - a cycle through a correlation is a cycle in the data and refused,
//!   naming it.
//!
//! WHY A SEALED CELL NEVER GAINS A MEMBER. A member of the cell is a solution
//! of its inner body, read over the final store. Suppose a fact it reads were
//! derived after the seal. Its derivation tree has leaves in closed relations
//! and cells of the component as the only non-monotone steps, and every rule
//! instance in it is covered by an edge, because a premise outside the
//! component is matched against facts that never change in this round and one
//! inside it is a `_`, which is wider than any value. So each cell in the tree
//! is reached from the correlation, sealed before it, and its conclusions
//! propagated, which is every fact the tree needs: the fact was derived
//! before the seal, or it has no such tree. A premise the walk cannot decide
//! (a builtin over a value of the component, a negation) is read as holding,
//! which only adds edges; an edge too many can make a cycle that is not
//! there, and never hides one that is. What the walk cannot key at all, a
//! correlation bound by a premise of the component, is refused as such.
//!
//! A HOLE is carried across each layer (`ds_carry`): what a fault left out of a
//! relation of the component reaches the correlations above by the carry the
//! levels already do, with the component taken as closed, which can only leave
//! more unknown, never less. An aggregate element of the component is not read
//! by that carry as a rule fired too early: its correlations are sealed
//! after, by the walk's order.
use super::*;

/// A component of relations taken by data: the relations, the round they are
/// ranked in, and the aggregate elements, `(rule, at)`, whose correlations are
/// released by layer.
pub(super) struct DsComp {
    pub rels: HashSet<Sym>,
    pub round: i64,
    pub elems: Vec<(Sym, u32)>,
}

/// A correlation of an aggregate element: `(rule, at, shared values)`.
pub(super) type AggKey = (Sym, u32, Box<[Term]>);

#[derive(Clone, PartialEq, Eq, Hash)]
enum Node {
    Pat(Sym, Box<[Option<Term>]>),
    Agg(AggKey),
}

/// Why the walk could not stratify: a halt, or a correlation it cannot key.
enum Fail {
    Halt(Halt),
    Unkeyed(Sym, u32),
}

impl From<Halt> for Fail {
    fn from(h: Halt) -> Fail {
        Fail::Halt(h)
    }
}

#[derive(Default)]
struct Graph {
    nodes: Vec<Node>,
    ids: HashMap<Node, usize>,
    succ: Vec<Vec<usize>>,
}

impl Graph {
    fn id(&mut self, n: Node, todo: &mut Vec<usize>) -> usize {
        if let Some(i) = self.ids.get(&n) {
            return *i;
        }
        let i = self.nodes.len();
        self.ids.insert(n.clone(), i);
        self.nodes.push(n);
        self.succ.push(Vec::new());
        todo.push(i);
        i
    }
}

impl Eval {
    /// The peel that ranks each component of a stalled one `data_demotable`
    /// finds as a round, with the components recorded for the evaluation; none
    /// when there is no such component or the program stalls anyway.
    pub(super) fn take_data_components(&mut self, stalled: &Peel, lats: &[Sym], dom_edges: &[(Sym, Sym)]) -> Option<Peel> {
        let barred = |rel: Sym| {
            brk!("ds_barred_ignored" => false; self.lattices.contains_key(&rel)
                || self.subs.contains_key(&rel)
                || self.carried.contains_key(&rel)
                || self.demand_rels.iter().any(|(d, _)| *d == rel)
                || self.tags.count_rel.iter().any(|(p, c)| *p == rel || *c == rel)
                || self.rules.iter().any(|r| r.clause.head.rel == rel && (r.has_thr || r.lat_close.is_some() || !r.lattice_outer.is_empty())))
        };
        let (demote, mut comps) = data_demotable(stalled, &barred);
        if brk!("ds_no_demote" => true; demote.is_empty()) {
            return None;
        }
        let again = peel_rounds(&self.rules, &self.v, lats, dom_edges, &demote);
        if again.stalled {
            return None;
        }
        comps.sort_by(|a, b| {
            let least = |s: &HashSet<Sym>| s.iter().map(|r| self.h.name(*r).to_string()).min_by(|x, y| cmp_js(x, y)).unwrap_or_default();
            cmp_js(&least(a), &least(b))
        });
        // two components of one round are run the one that reads the other last: what it reads is
        // closed only when that one has run
        let deps = self.rel_deps();
        let mut ordered: Vec<HashSet<Sym>> = Vec::new();
        while !comps.is_empty() {
            let reads_another = |i: usize| (0..comps.len()).any(|j| j != i && comps[i].iter().any(|a| comps[j].iter().any(|b| reaches_in(&deps, *a, *b))));
            let first = brk!("ds_comps_unordered" => 0; (0..comps.len()).find(|i| !reads_another(*i)).unwrap_or(0));
            ordered.push(comps.remove(first));
        }
        for rels in ordered {
            let round = rels.iter().filter_map(|r| again.round.get(r)).copied().next().unwrap_or(0);
            let elems: Vec<(Sym, u32)> = again
                .demoted
                .iter()
                .filter(|(rid, _)| self.rule_of(*rid).is_some_and(|r| rels.contains(&r.clause.head.rel)))
                .copied()
                .collect();
            self.ds_elems.extend(elems.iter().copied());
            self.ds_comps.push(Rc::new(DsComp { rels, round, elems }));
        }
        Some(again)
    }

    /// Whether the correlation `mk` of a data-stratified element may be read
    /// now: it has been released.
    pub(super) fn ds_gate(&self, mk: &AggKey) -> Result<bool, Halt> {
        if brk!("ds_seal_early" => false; !self.ds_released.contains(mk)) {
            if self.ds_strict {
                return Err(Halt::Bug(format!(
                    "a correlation of {} was met that the data walk never reached",
                    self.h.name(mk.0)
                )));
            }
            return Ok(false);
        }
        Ok(true)
    }

    /// Whether `r` owns an element a data-level stratification took.
    pub(super) fn ds_owner(&self, r: &ERule) -> bool {
        !self.ds_elems.is_empty() && r.clause.body.iter().any(|b| matches!(b, BodyElem::Agg(a) if self.ds_elems.contains(&(r.id, a.at))))
    }

    /// The components ranked at `lv`, each run: the rules `rs` own their
    /// elements.
    pub(super) fn run_data_levels(&mut self, lv: i64, rs: &[Rc<ERule>]) -> Result<(), Halt> {
        let comps: Vec<Rc<DsComp>> = self.ds_comps.iter().filter(|c| c.round == lv).cloned().collect();
        for c in comps {
            let mine: Vec<Rc<ERule>> = rs.iter().filter(|r| c.rels.contains(&r.clause.head.rel)).cloned().collect();
            self.run_data_level(&c, &mine)?;
        }
        Ok(())
    }

    fn run_data_level(&mut self, comp: &Rc<DsComp>, rs: &[Rc<ERule>]) -> Result<(), Halt> {
        // fired with every correlation held: nothing seals, the rules are live
        self.activate(rs)?;
        let layers = self.ds_layers(comp)?;
        for layer in layers {
            self.ds_carry(comp)?;
            let owners: Vec<Rc<ERule>> = rs.iter().filter(|r| layer.iter().any(|k| k.0 == r.id)).cloned().collect();
            self.ds_released.extend(layer);
            self.fire_all(owners.clone())?;
            self.poison_readers(&owners)?;
        }
        self.ds_carry(comp)?;
        // every correlation the rules meet now was released: the walk reached them all
        self.ds_strict = true;
        let fired = self.fire_all(rs.to_vec());
        self.ds_strict = false;
        fired
    }

    /// What a hole in the component left unknown, carried before the next layer
    /// reads it: the component is closed as far as the carry is concerned.
    fn ds_carry(&mut self, comp: &DsComp) -> Result<(), Halt> {
        if brk!("ds_hole_uncarried" => true; self.plain_pending.is_empty() && self.plain_undecided.is_empty() && self.lat_undecided.is_empty()) {
            return Ok(());
        }
        self.close_plain_rules(comp.round + 1)?;
        self.plain_flush(comp.round + 1)
    }

    /// The layers of the correlations of `comp`, each in canonical order, or
    /// the refusal of a cycle in the data.
    fn ds_layers(&mut self, comp: &DsComp) -> Result<Vec<Vec<AggKey>>, Halt> {
        match self.ds_graph(comp) {
            Ok(layers) => Ok(layers),
            Err(Fail::Halt(h)) => Err(h),
            Err(Fail::Unkeyed(rid, at)) => {
                let (head, op, inner) = self.ds_element(rid, at, comp);
                Err(Halt::Strat(
                    format!(
                        "program rejected: {op} in rule {} reads {inner}, which depends on the rule's own conclusion {head}: \
                         an aggregate reads a closed relation, and its correlation is bound by a relation of the component, \
                         so no cell of it can be named before the data is known (docs/aggregates.md, \"Data-level stratification, as built\")",
                        self.h.name(rid)
                    ),
                    String::new(),
                ))
            }
        }
    }

    /// `(head, op, inner)` of an element, as the refusals name it: the head of
    /// its rule, the operation, and the first relation of the component it reads.
    fn ds_element(&self, rid: Sym, at: u32, comp: &DsComp) -> (String, &'static str, String) {
        let r = self.rule_of(rid).expect("a rule of the component");
        let a = r.clause.body.iter().find_map(|b| match b {
            BodyElem::Agg(a) if a.at == at => Some(a.clone()),
            _ => None,
        });
        let inner = a
            .as_ref()
            .and_then(|a| a.body.iter().flat_map(|b| b.lits_deep()).map(|l| l.rel).find(|x| comp.rels.contains(x)))
            .map_or_else(String::new, |x| self.h.name(x).to_string());
        (self.h.name(r.clause.head.rel).to_string(), a.map_or("an aggregate", |a| a.op.name()), inner)
    }

    fn node_text(&self, n: &Node) -> String {
        match n {
            Node::Pat(rel, args) => {
                let mut o = String::from(self.h.name(*rel));
                o.push('(');
                for (i, a) in args.iter().enumerate() {
                    if i > 0 {
                        o.push(',');
                    }
                    match a {
                        Some(t) => self.h.canon_term(*t, &mut o),
                        None => o.push('_'),
                    }
                }
                o.push(')');
                o
            }
            Node::Agg((rid, at, corr)) => {
                let (head, op, _) = match self.rule_of(*rid) {
                    Some(r) => (self.h.name(r.clause.head.rel).to_string(), self.ds_op(&r, *at), String::new()),
                    None => (String::new(), "an aggregate", String::new()),
                };
                format!("{op}@{head}{}", tuple_text(&self.h, corr))
            }
        }
    }

    fn ds_op(&self, r: &ERule, at: u32) -> &'static str {
        r.clause.body.iter().find_map(|b| match b {
            BodyElem::Agg(a) if a.at == at => Some(a.op.name()),
            _ => None,
        })
        .unwrap_or("an aggregate")
    }

    fn ds_graph(&mut self, comp: &DsComp) -> Result<Vec<Vec<AggKey>>, Fail> {
        let rules: Vec<Rc<ERule>> = self
            .rules
            .iter()
            .filter(|r| r.safe && r.clause.head.temporal != Temporal::Next && comp.rels.contains(&r.clause.head.rel))
            .cloned()
            .collect();
        let owners: Vec<Rc<ERule>> = rules.iter().filter(|r| comp.elems.iter().any(|e| e.0 == r.id)).cloned().collect();
        let mut g = Graph::default();
        let mut todo: Vec<usize> = Vec::new();
        // the correlations the owners' rules make, as the rules themselves would
        let mut roots: Vec<usize> = Vec::new();
        for r in &owners {
            let mut out = Vec::new();
            self.ds_walk(comp, r.id, r.plan.iter().collect(), Subst::new(), &mut out)?;
            for n in out {
                if matches!(n, Node::Agg(_)) {
                    roots.push(g.id(n, &mut todo));
                }
            }
        }
        brk!("ds_root_dropped" => { roots.pop(); }; ());
        while let Some(i) = todo.pop() {
            let mut out = Vec::new();
            match g.nodes[i].clone() {
                Node::Pat(rel, args) => {
                    for r in rules.iter().filter(|r| r.clause.head.rel == rel) {
                        let mut s = Some(Subst::new());
                        for (a, p) in r.clause.head.args.iter().zip(args.iter()) {
                            if let (Some(t), Some(x)) = (p, s.as_ref()) {
                                s = unify(&self.h, *a, *t, x);
                            }
                        }
                        if let Some(s) = s.filter(|_| r.clause.head.args.len() == args.len()) {
                            self.ds_walk(comp, r.id, r.plan.iter().collect(), s, &mut out)?;
                        }
                    }
                }
                Node::Agg((rid, at, corr)) => {
                    let r = self.rule_of(rid).ok_or_else(|| Halt::Bug("a correlation of no rule".into()))?;
                    let a = r.plan.iter().find_map(|b| match b {
                        BodyElem::Agg(a) if a.at == at => Some(a.clone()),
                        _ => None,
                    });
                    let (a, plan) = (a.ok_or_else(|| Halt::Bug("a correlation of no element".into()))?, self.agg_plans.get(&(rid, at)).cloned());
                    let plan = plan.ok_or_else(|| Halt::Bug("a correlation with no plan".into()))?;
                    let mut s = Some(Subst::new());
                    for (n, i) in plan.corr.iter().enumerate() {
                        s = s.and_then(|x| unify(&self.h, Term::var(a.shared[*i]), corr[n], &x));
                    }
                    if let Some(s) = s {
                        self.ds_walk(comp, rid, plan.inner_order.iter().map(|i| &a.body[*i]).collect(), s, &mut out)?;
                    }
                }
            }
            let mut ids: Vec<usize> = Vec::with_capacity(out.len());
            for n in out {
                let j = g.id(n, &mut todo);
                if !ids.contains(&j) {
                    ids.push(j);
                }
            }
            g.succ[i] = ids;
        }
        let n = g.nodes.len();
        let comp_of = tarjan(&g.succ);
        let mut size: HashMap<usize, usize> = HashMap::new();
        for c in &comp_of {
            *size.entry(*c).or_default() += 1;
        }
        let is_agg = |i: usize| matches!(g.nodes[i], Node::Agg(_));
        // a cycle through a correlation is a cycle in the data
        let mut bad: Vec<usize> = (0..n).filter(|i| is_agg(*i) && (size[&comp_of[*i]] > 1 || g.succ[*i].contains(i))).collect();
        brk!("ds_cycle_unseen" => bad.clear(); ());
        if !bad.is_empty() {
            bad.sort_by(|a, b| cmp_js(&self.node_text(&g.nodes[*a]), &self.node_text(&g.nodes[*b])));
            return Err(Halt::Strat(self.ds_cycle(comp, &g, &comp_of, bad[0]), String::new()).into());
        }
        // a layer is one more than the greatest reached without passing another correlation
        let ncomp = comp_of.iter().copied().max().map_or(0, |m| m + 1);
        let mut members: Vec<Vec<usize>> = vec![Vec::new(); ncomp];
        for i in 0..n {
            members[comp_of[i]].push(i);
        }
        let mut depth: Vec<usize> = vec![0; ncomp];
        for c in 0..ncomp {
            let mut d = 0;
            for i in &members[c] {
                for j in &g.succ[*i] {
                    let k = comp_of[*j];
                    if k != c {
                        d = d.max(depth[k] + brk!("ds_layer_flat" => 0; usize::from(is_agg(*j))));
                    }
                }
            }
            depth[c] = d;
        }
        let mut layers: Vec<Vec<AggKey>> = Vec::new();
        for i in roots.iter().copied().collect::<std::collections::BTreeSet<usize>>() {
            let Node::Agg(k) = &g.nodes[i] else { continue };
            let d = depth[comp_of[i]];
            while layers.len() <= d {
                layers.push(Vec::new());
            }
            layers[d].push(k.clone());
        }
        for l in layers.iter_mut() {
            l.sort_by(|a, b| {
                cmp_js(self.h.name(a.0), self.h.name(b.0)).then(a.1.cmp(&b.1)).then(cmp_js(&tuple_text(&self.h, &a.2), &tuple_text(&self.h, &b.2)))
            });
        }
        Ok(layers)
    }

    /// The refusal of a cycle: the old sentence, then the cycle as the data
    /// makes it, from the correlation named.
    fn ds_cycle(&self, comp: &DsComp, g: &Graph, comp_of: &[usize], at: usize) -> String {
        let Node::Agg((rid, a, _)) = &g.nodes[at] else { unreachable!() };
        let (head, op, inner) = self.ds_element(*rid, *a, comp);
        // the shortest way back, by edges in canonical order
        let mut prev: HashMap<usize, usize> = HashMap::new();
        let mut queue: std::collections::VecDeque<usize> = std::collections::VecDeque::from([at]);
        let mut last = at;
        'bfs: while let Some(x) = queue.pop_front() {
            let mut next: Vec<usize> = g.succ[x].iter().copied().filter(|y| comp_of[*y] == comp_of[at]).collect();
            next.sort_by(|p, q| cmp_js(&self.node_text(&g.nodes[*p]), &self.node_text(&g.nodes[*q])));
            for y in next {
                if y == at {
                    last = x;
                    break 'bfs;
                }
                if y != at && !prev.contains_key(&y) {
                    prev.insert(y, x);
                    queue.push_back(y);
                }
            }
        }
        let mut path = vec![last];
        while let Some(p) = prev.get(path.last().unwrap()) {
            path.push(*p);
        }
        path.reverse();
        let mut names: Vec<String> = path.iter().map(|i| self.node_text(&g.nodes[*i])).collect();
        names.push(self.node_text(&g.nodes[at]));
        format!(
            "program rejected: {op} in rule {} reads {inner}, which depends on the rule's own conclusion {head}: \
             an aggregate reads a closed relation; a recursive min/max is a lattice declaration (docs/aggregates.md); \
             in the data the cell reads itself: {}",
            self.h.name(*rid),
            names.join(" -> ")
        )
    }

    /// Which of `body` is read next under `s`: a premise outside the component
    /// first, for it binds what the patterns after it name; then a builtin that
    /// can be decided; then the first, in the rule's plan.
    fn ds_pick(&mut self, comp: &DsComp, body: &[&BodyElem], s: &Subst) -> usize {
        if let Some(i) = body.iter().position(|b| matches!(b, BodyElem::Pos(l) if !comp.rels.contains(&l.rel))) {
            return i;
        }
        for (i, b) in body.iter().enumerate() {
            if matches!(b, BodyElem::Bi { op, l, r } if self.ds_decides(*op, *l, *r, s)) {
                return i;
            }
        }
        0
    }

    /// The nodes the rest of `body` reads under `s`, pushed to `out`.
    fn ds_walk(&mut self, comp: &DsComp, rid: Sym, mut rest: Vec<&BodyElem>, s: Subst, out: &mut Vec<Node>) -> Result<(), Fail> {
        if rest.is_empty() {
            return Ok(());
        }
        let b = rest.remove(self.ds_pick(comp, &rest, &s));
        match b {
            BodyElem::Pos(l) if comp.rels.contains(&l.rel) => {
                let args: Vec<Option<Term>> = l
                    .args
                    .iter()
                    .map(|a| {
                        let t = resolve(&mut self.h, *a, &s);
                        self.h.is_ground(t).then_some(t).filter(|_| brk!("ds_wild_keys" => false; true))
                    })
                    .collect();
                out.push(Node::Pat(l.rel, args.into()));
                self.ds_walk(comp, rid, rest, s, out)
            }
            BodyElem::Pos(l) => {
                for (s2, _) in self.match_premise(l, &s, 0, None)? {
                    self.ds_walk(comp, rid, rest.clone(), s2, out)?;
                }
                Ok(())
            }
            BodyElem::Neg(_) => self.ds_walk(comp, rid, rest, s, out),
            BodyElem::Bi { op, l, r } => match self.ds_builtin(*op, *l, *r, &s) {
                Some(s2) => self.ds_walk(comp, rid, rest, s2, out),
                None => Ok(()),
            },
            BodyElem::Agg(a) if a.op == AggOp::AtLeast => {
                self.ds_walk(comp, rid, a.body.iter().collect(), s.clone(), out)?;
                self.ds_walk(comp, rid, rest, s, out)
            }
            BodyElem::Agg(a) => {
                if self.ds_elems.contains(&(rid, a.at)) {
                    let plan = self.agg_plans.get(&(rid, a.at)).cloned().ok_or_else(|| Halt::Bug("an aggregate with no plan".into()))?;
                    let mut corr: Vec<Term> = Vec::with_capacity(plan.corr.len());
                    for i in &plan.corr {
                        let t = resolve(&mut self.h, Term::var(a.shared[*i]), &s);
                        if !self.h.is_ground(t) {
                            return Err(Fail::Unkeyed(rid, a.at));
                        }
                        corr.push(t);
                    }
                    out.push(Node::Agg((rid, a.at, corr.into())));
                }
                self.ds_walk(comp, rid, rest, s, out)
            }
        }
    }

    /// A builtin the walk can decide, decided: what it cannot, because a value
    /// of the component stands in it, holds. A fault it makes is no fault of
    /// the evaluation.
    fn ds_builtin(&mut self, op: Sym, l: Term, r: Term, s: &Subst) -> Option<Subst> {
        if !self.ds_decides(op, l, r, s) {
            return brk!("ds_builtin_dead" => None; Some(s.clone()));
        }
        let saved = (self.fault, self.fault_count, self.last_fault, self.last_fault_rule);
        let out = self.eval_builtin(op, l, r, s, None);
        (self.fault, self.fault_count, self.last_fault, self.last_fault_rule) = saved;
        out
    }

    /// Whether the operands a builtin needs are known under `s`.
    fn ds_decides(&mut self, op: Sym, l: Term, r: Term, s: &Subst) -> bool {
        if op == self.v.op_in || op == self.v.op_subset {
            return false;
        }
        let (lt, rt) = (resolve(&mut self.h, l, s), resolve(&mut self.h, r, s));
        let (gl, gr) = (self.h.is_ground(lt), self.h.is_ground(rt));
        if op == self.v.op_is { gr } else if op == self.v.op_eq { true } else { gl && gr }
    }
}
