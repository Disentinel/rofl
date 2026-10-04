//! DELTA-FIRST JOIN PLANS (f_costly_rules_are_shapes, w_cmp_delta_first).
//!
//! A rule fired on the news of premise `i` used to solve its premises in
//! written order and keep, at `i`, only the rows that are news: every premise
//! before `i` was joined in full each round, news or not. This is the
//! semi-naive rewrite with the news where it is cheapest to start. For each
//! rule and each premise position `i`, the firing `Δ_i` reads the news at `i`
//! and the whole store at every other premise, which is what the written-order
//! firing reads; only the ORDER of the join differs, so the solutions are the
//! same set (a solution with news at two premises is found at both positions,
//! as it always was, and concluded once).
//!
//! THE ORDER: the news premise first, then, greedily, the premise whose
//! estimated matches per partial solution are fewest given what is bound
//! (a premise bound by nothing is a cross product and costs its rows); a
//! negation as soon as every variable it shares with the rest of the rule is
//! bound. The head is ground under any such order, since every positive
//! premise is placed.
//!
//! THE ESTIMATE: for a premise, the rows that hold its constants and the
//! distinct values of the positions already bound, read off the rows
//! (`Store::probe_stats`, one pass over the rows, cached, recomputed when the
//! relation has doubled). Matches per binding are rows/distinct; with nothing bound, rows.
//! The same model costs the written-order firing (premises before `i` in full;
//! at `i`, the cheaper of an index narrowing and the news) and the delta-first
//! one (the news, then the order above), and the delta-first plan is taken for
//! a firing only when its cost for THIS many news rows is below the written
//! one by `MARGIN` (an average fan-out is not what a bound value finds). A
//! large delta, or a cheap prefix, keeps today's plan. A firing over the whole
//! store, with no news (each rule's first), is ordered the same way from
//! nothing bound, and needs a larger gain (`MARGIN_FULL`).
//!
//! WHICH RULES: those whose plan is positive and negated premises only, in a
//! world with no lattice, and not an aggregate, threshold, closure or demand
//! rule: a builtin or fault reads the order it is solved in (a hole is
//! attributed at the premise that failed), and a lattice withdraws what a
//! firing read. A rule concluding `@next` is kept in written order unless the
//! store is unordered: in the engine's order the first firing to stage a fact
//! is its witness, and the solutions' order is the written one.
//!
//! The premises of a solution are put back in written order before it is
//! concluded, so a witness is the one the written order would have built.

use super::*;

pub(super) struct DeltaPlan {
    body: Rc<[BodyElem]>,
    /// `perm[k]` is the position in `ERule::plan` of `body[k]`.
    perm: Vec<usize>,
    /// Estimated cost of the whole firing per news row.
    unit: f64,
    /// The written-order firing: rows touched by the premises before `i`, the
    /// partial solutions that reach `i`, matches per solution at `i` and the
    /// rows of its relation, and the cost per solution of the premises after.
    pre: f64,
    cur: f64,
    fan: f64,
    rows_i: f64,
    tail: f64,
    /// The relations the estimates read and their size when they were made.
    watch: Vec<(Sym, Option<Sym>, usize)>,
}

#[derive(Clone)]
pub(super) enum Slot {
    No,
    Plan(Rc<DeltaPlan>),
}

struct Stat {
    rows: f64,
    fan: f64,
}

/// A plan is taken when its estimate is this much below the written order's: the
/// estimates are averages and a bound value is not an average one. Over the whole
/// store (nothing to start from) the gain must be larger.
const MARGIN: f64 = 1.25;
const MARGIN_FULL: f64 = 4.0;

fn stale(now: usize, then: usize) -> bool {
    now >= 2 * then + 32 || 2 * now + 32 <= then
}

impl Eval {
    /// The plan for news at plan position `at` (None: a firing over the whole
    /// store, no news) when it is cheaper than the written order for `n` news
    /// rows; None keeps the written order.
    pub(super) fn delta_pick(&mut self, r: &Rc<ERule>, at: Option<usize>, n: usize) -> Option<Rc<DeltaPlan>> {
        if !self.delta_first || brk!("delta_first_off" => true; false) {
            return None;
        }
        let key = (r.id, at.unwrap_or(usize::MAX));
        let fresh = match self.delta_plans.get(&key) {
            Some(Slot::No) => return None,
            Some(Slot::Plan(p)) => p.watch.iter().all(|&(rel, persp, then)| !stale(self.store.rel_len_est(rel, persp), then)),
            None => false,
        };
        if !fresh {
            let slot = match self.delta_build(r, at) {
                Some(p) => Slot::Plan(Rc::new(p)),
                None => Slot::No,
            };
            self.delta_plans.insert(key, slot);
        }
        let Some(Slot::Plan(p)) = self.delta_plans.get(&key) else { return None };
        let n = n as f64;
        let written = if at.is_none() {
            p.pre
        } else {
            p.pre + p.cur * (1.0 + p.fan.min(n)) + p.cur * p.fan * (n / p.rows_i.max(1.0)).min(1.0) * p.tail
        };
        if n * p.unit * if at.is_none() { MARGIN_FULL } else { MARGIN } < written {
            Some(p.clone())
        } else {
            None
        }
    }

    fn delta_eligible(&self, r: &Rc<ERule>) -> bool {
        !self.naive
            && self.lattices.is_empty()
            && !r.has_agg
            && !r.has_thr
            && !r.has_demand_prem
            && !self.closure_of.contains_key(&r.id)
            && (r.clause.head.temporal != Temporal::Next || self.store.unordered)
            && r.plan.len() >= 2
            && r.plan.iter().all(|b| match b {
                BodyElem::Pos(_) => true,
                BodyElem::Neg(l) => !self.demand_rels.iter().any(|(d, _)| *d == l.rel),
                _ => false,
            })
    }

    /// Rows holding the premise's constants and matches per binding, given
    /// the variables bound before it.
    fn delta_stat(&mut self, l: &Lit, bound: &[Sym]) -> Stat {
        let persp = l.persp.as_atom();
        let (mut cpos, mut cvals, mut vpos) = (Vec::new(), Vec::new(), Vec::new());
        for (j, a) in l.args.iter().enumerate() {
            let mut vs = Vec::new();
            self.h.vars_of(*a, &mut vs);
            if vs.is_empty() {
                cpos.push(j);
                cvals.push(*a);
            } else if vs.iter().all(|v| bound.contains(v)) {
                vpos.push(j);
            }
        }
        let mut key: Vec<u64> = vec![l.rel as u64, persp.map_or(u64::MAX, |p| p as u64)];
        for (&p, v) in cpos.iter().zip(&cvals) {
            key.push(p as u64);
            key.push(v.bits());
        }
        key.push(u64::MAX);
        key.extend(vpos.iter().map(|&p| p as u64));
        let size = self.store.rel_len_est(l.rel, persp);
        let (rows, distinct) = match self.delta_stats.get(&key) {
            Some(&(then, rows, d)) if !stale(size, then) => (rows, d),
            _ => {
                let t = std::time::Instant::now();
                let (rows, d) = self.store.probe_stats(&self.h, l.rel, persp, &cpos, &cvals, &vpos);
                self.delta_ns += t.elapsed().as_nanos() as u64;
                (rows, d)
            }
        };
        let fan = if vpos.is_empty() { rows as f64 } else { rows as f64 / distinct.max(1) as f64 };
        Stat { rows: rows as f64, fan: if rows == 0 { 0.0 } else { fan.max(1.0) } }
    }

    fn delta_build(&mut self, r: &Rc<ERule>, at: Option<usize>) -> Option<DeltaPlan> {
        if !self.delta_eligible(r) {
            return None;
        }
        let plan = &r.plan;
        let i = at.unwrap_or(plan.len());
        let vars_of = |h: &Heap, b: &BodyElem| {
            let mut v = Vec::new();
            b.vars(h, &mut v);
            v
        };
        let mut watch: Vec<(Sym, Option<Sym>, usize)> = Vec::new();
        for b in plan.iter() {
            if let BodyElem::Pos(l) | BodyElem::Neg(l) = b {
                let persp = l.persp.as_atom();
                if !watch.iter().any(|w| w.0 == l.rel && w.1 == persp) {
                    watch.push((l.rel, persp, self.store.rel_len_est(l.rel, persp)));
                }
            }
        }
        let news = match plan.get(i) {
            Some(BodyElem::Pos(l)) => Some(l),
            Some(_) => return None,
            None => None,
        };
        let size_i = news.map_or(1, |l| self.store.rel_len_est(l.rel, l.persp.as_atom())).max(1) as f64;

        // the written order, the news at i
        let (mut bound, mut pre, mut cur, mut fan_i, mut tail) = (Vec::new(), 0.0f64, 1.0f64, 1.0f64, 0.0f64);
        let mut tail_cur = 1.0f64;
        for (j, b) in plan.iter().enumerate() {
            match b {
                BodyElem::Pos(l) => {
                    let st = self.delta_stat(l, &bound);
                    if j < i {
                        pre += cur.min(1e15) * (1.0 + st.fan);
                        cur = (cur * st.fan).min(1e15);
                    } else if j == i {
                        fan_i = st.fan;
                    } else {
                        tail += tail_cur * (1.0 + st.fan);
                        tail_cur = (tail_cur * st.fan).min(1e15);
                    }
                }
                _ => {
                    if j < i {
                        pre += cur.min(1e15);
                    } else {
                        tail += tail_cur;
                    }
                }
            }
            for v in vars_of(&self.h, b) {
                if !bound.contains(&v) {
                    bound.push(v);
                }
            }
        }

        // the delta-first order
        let mut head_vars = Vec::new();
        for a in &r.clause.head.args {
            self.h.vars_of(*a, &mut head_vars);
        }
        self.h.vars_of(r.clause.head.persp, &mut head_vars);
        let all_vars: Vec<Vec<Sym>> = plan.iter().map(|b| vars_of(&self.h, b)).collect();
        let ready = |j: usize, bound: &Vec<Sym>| -> bool {
            all_vars[j].iter().all(|v| {
                bound.contains(v) || (!head_vars.contains(v) && all_vars.iter().enumerate().all(|(k, vs)| k == j || !vs.contains(v)))
            })
        };
        let mut bound: Vec<Sym> = Vec::new();
        let mut order: Vec<usize> = Vec::new();
        let mut rest: Vec<usize> = (0..plan.len()).collect();
        let (mut unit, mut cur_d) = (0.0f64, 1.0f64);
        if let Some(l) = news {
            bound = all_vars[i].clone();
            order.push(i);
            rest.remove(i);
            let st0 = self.delta_stat(l, &[]);
            let sel = if st0.rows == 0.0 { 0.0 } else { (st0.rows / size_i).min(1.0) };
            (unit, cur_d) = (1.0, sel);
        }
        loop {
            while let Some(at) = rest.iter().position(|&j| matches!(plan[j], BodyElem::Neg(_)) && ready(j, &bound)) {
                let j = rest.remove(at);
                unit += cur_d;
                order.push(j);
            }
            let mut best: Option<(usize, f64)> = None;
            for (at, &j) in rest.iter().enumerate() {
                let BodyElem::Pos(l) = &plan[j] else { continue };
                let st = self.delta_stat(l, &bound);
                if best.is_none_or(|(_, f)| st.fan < f) {
                    best = Some((at, st.fan));
                }
            }
            let Some((at, fan)) = best else { break };
            let j = rest.remove(at);
            unit += cur_d * (1.0 + fan);
            cur_d = (cur_d * fan).min(1e15);
            for v in &all_vars[j] {
                if !bound.contains(v) {
                    bound.push(*v);
                }
            }
            order.push(j);
        }
        if !rest.is_empty() {
            return None;
        }
        let body: Vec<BodyElem> = order.iter().map(|&j| plan[j].clone()).collect();
        Some(DeltaPlan { body: Rc::from(body), perm: order, unit, pre, cur, fan: fan_i, rows_i: size_i, tail, watch })
    }

    /// `r` fired by `p`: on the news `keys` of the premise the plan starts
    /// from, or over the whole store when there are none. The premises of
    /// each solution are put back in written order before it is concluded.
    pub(super) fn fire_planned(&mut self, r: &Rc<ERule>, p: &DeltaPlan, keys: Option<&FxSet<FactId>>) -> Result<Front, Halt> {
        *self.fires_by_rule.entry(r.id).or_insert(0) += 1;
        *self.delta_by_rule.entry(r.id).or_insert(0) += 1;
        let outer = self.cur_rule.replace(r.id);
        let was_firing = std::mem::replace(&mut self.firing, true);
        let sols = self.solve_body(&p.body, Subst::new(), 0, keys.map(|k| (0, k)), Some(r.id));
        self.firing = was_firing;
        self.cur_rule = outer;
        let sols = sols?;
        *self.sols_by_rule.entry(r.id).or_insert(0) += sols.len() as u64;
        let mut out = Front::default();
        for mut sol in sols {
            let mut prems = sol.prems.clone();
            for (k, &at) in p.perm.iter().enumerate() {
                prems[at] = sol.prems[k];
            }
            sol.prems = prems;
            self.conclude(r, sol, &mut out)?;
        }
        Ok(out)
    }
}
