//! LABELED UNKNOWNS (docs/aggregates.md, "Labeled unknowns"): what a fault
//! leaves unknown has a name and a condition, and a group whose members rest
//! on such names alone is decided by what each value the names could be gives
//! it, not by the algebra of "Precise holes, as built".
//!
//! A label is one unknown value; the values it can be told apart by are the
//! constants the terms around it mention, and one class for all the rest, two
//! labels sharing a class or not (a REGION is one assignment of every label to
//! a constant or a class). A group's member count or total is folded over its
//! known members and the possibles present in each region; the same in every
//! region and it is the group's value, otherwise the value of the one label,
//! region by region, is a `$by`. More regions than `LABEL_REGIONS` and the
//! group is not decided: it is a hole whose shrug says how many there were.

use super::*;

pub(super) const LABEL_REGIONS: i64 = 64;

/// What the regions said of a group an unknown moves.
pub(super) enum Regions {
    No,
    Decided(Term, String),
    Cond(Term),
    Capped(i64),
}

/// One label's value in a region: a constant, or the class of the rest.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Rv {
    C(Term),
    Class(usize),
}

impl Eval {
    /// Whether the tuple an unknown is exists in every completion: it holds a
    /// labeled value, and every one it holds is sure.
    pub(super) fn sure_unknown(&self, u: &Unknown) -> bool {
        let Unknown::Tuple(_, _, args) = u else { return false };
        let mut any = false;
        for a in args.iter() {
            let sure = match (self.unk_parts(*a), self.by_parts(*a)) {
                (Some((_, _, s)), _) => s,
                (_, Some((_, _, _, s))) => s,
                _ => continue,
            };
            if !sure {
                return false;
            }
            any = true;
        }
        any
    }

    /// The solution `s` passed an undecided step, so what it gives may not exist.
    pub(super) fn unsure(&mut self, mut s: Subst) -> Subst {
        if !self.is_unsure(&s) {
            s.push((self.v.s_unsure, Term::int(1)));
        }
        s
    }

    pub(super) fn is_unsure(&self, s: &Subst) -> bool {
        s.iter().any(|(k, _)| *k == self.v.s_unsure)
    }

    /// A term whose tuple may not exist after all.
    pub(super) fn desure(&mut self, t: Term) -> Term {
        if let Some((l, ex, _)) = self.unk_parts(t) {
            return self.mk_unk(l, &ex, false);
        }
        if let Some((l, d, cases, _)) = self.by_parts(t) {
            return self.mk_by(l, d, &cases, false);
        }
        t
    }

    pub(super) fn mk_by(&mut self, label: Term, dflt: Term, cases: &[(Term, Term)], sure: bool) -> Term {
        let cf = self.h.intern("c");
        let cs: Vec<Term> = cases.iter().map(|(c, v)| self.h.mkf(cf, &[*c, *v])).collect();
        let l = self.h.list(&cs);
        self.h.mkf(self.v.s_by, &[label, dflt, l, Term::int(sure as i64)])
    }

    /// The aggregate's result variable bound to what the group's value is, unless it is bound already.
    pub(super) fn bind_result(&mut self, a: &Agg, s: Subst, v: Option<Term>) -> Subst {
        let Some(v) = v else { return s };
        if !matches!(resolve(&mut self.h, a.result, &s).kind(), TermK::Var(_)) {
            return s;
        }
        unify(&self.h, a.result, v, &s).unwrap_or(s)
    }

    /// Whether a possible can be told by regions: it exists in every
    /// completion, its group and its projection are known or labeled.
    fn region_ok(&self, p: &Possible) -> bool {
        p.sure
            && !p.neg
            && p.pat.iter().zip(&p.lab).all(|(t, l)| t.is_some() || l.is_some())
            && p.sproj.iter().all(|t| !self.holds_unknown(*t) || self.unk_parts(*t).is_some() || self.by_parts(*t).is_some())
    }

    /// How many regions `nl` labels have over `nc` constants: each takes a
    /// constant, a class already used, or a new one.
    fn count_regions(nl: usize, nc: usize) -> i64 {
        let mut g = vec![1i64; nl + 2];
        for _ in 0..nl {
            let next: Vec<i64> = (0..=nl).map(|k| ((nc + k) as i64).saturating_mul(g[k]).saturating_add(g[k + 1])).collect();
            g = next.into_iter().chain([1]).collect();
        }
        g[0]
    }

    fn region_list(nl: usize, consts: &[Term]) -> Vec<Vec<Rv>> {
        fn go(nl: usize, consts: &[Term], classes: usize, cur: &mut Vec<Rv>, out: &mut Vec<Vec<Rv>>) {
            if cur.len() == nl {
                out.push(cur.clone());
                return;
            }
            for c in consts {
                cur.push(Rv::C(*c));
                go(nl, consts, classes, cur, out);
                cur.pop();
            }
            for k in 0..=classes {
                cur.push(Rv::Class(k));
                go(nl, consts, classes.max(k + 1), cur, out);
                cur.pop();
            }
        }
        let mut out = Vec::new();
        go(nl, consts, 0, &mut Vec::new(), &mut out);
        out
    }

    /// Whether the case keyed `k` of a `$by` on the label at `at` is the region's: a constant the label is,
    /// or another label it is equal to (the same constant, or the same class).
    fn case_matches(&self, k: Term, labels: &[Term], rg: &[Rv], at: usize) -> bool {
        if matches!(k.kind(), TermK::Func(i) if self.h.fname(i) == self.v.s_lbl) {
            return labels.iter().position(|x| *x == k).is_some_and(|j| rg[j] == rg[at]);
        }
        rg[at] == Rv::C(k)
    }

    /// The labels and constants a term names, a `$by` and what it holds too.
    fn names_in(&self, t: Term, labels: &mut Vec<Term>, consts: &mut Vec<Term>) {
        if let Some((l, ex, _)) = self.unk_parts(t) {
            labels.push(l);
            consts.extend(ex);
        } else if let Some((l, d, cases, _)) = self.by_parts(t) {
            labels.push(l);
            for (k, v) in cases {
                if matches!(k.kind(), TermK::Func(i) if self.h.fname(i) == self.v.s_lbl) {
                    labels.push(k);
                } else {
                    consts.push(k);
                }
                self.names_in(v, labels, consts);
            }
            self.names_in(d, labels, consts);
        }
    }

    /// A term in a region: a labeled value is the constant or the class its
    /// label has there, a `$by` the case that constant has, and `None` where
    /// the label is a value the occurrence is known not to be (the tuple that
    /// holds it is not there).
    fn inst(&mut self, t: Term, labels: &[Term], rg: &[Rv]) -> Option<Term> {
        if let Some((l, ex, _)) = self.unk_parts(t) {
            let at = labels.iter().position(|x| *x == l)?;
            return match rg[at] {
                Rv::C(c) if ex.contains(&c) => None,
                Rv::C(c) => Some(c),
                Rv::Class(k) => Some(self.h.mkf_named("$other", &[Term::int(k as i64)])),
            };
        }
        if let Some((l, d, cases, _)) = self.by_parts(t) {
            let at = labels.iter().position(|x| *x == l)?;
            let hit = cases.iter().find(|(k, _)| brk!("label_correlation_lost" => false; self.case_matches(*k, labels, rg, at)));
            return self.inst(hit.map_or(d, |(_, v)| *v), labels, rg);
        }
        Some(t)
    }

    /// The group's member count or total in one region, over its known
    /// members and the possibles present there; `None` where it has no member.
    #[allow(clippy::too_many_arguments)]
    fn region_value(&mut self, op: AggOp, labels: &[Term], rg: &[Rv], gkey: &[Term], projs: &[&[Term]], vals: &[Term], mine: &[&Possible]) -> Option<Term> {
        let count = op == AggOp::Count;
        let mut seen: Vec<Vec<Term>> = Vec::new();
        let mut xs: Vec<Term> = Vec::new();
        for (m, p) in projs.iter().enumerate() {
            seen.push(p.to_vec());
            xs.push(if count { Term::int(1) } else { vals[m] });
        }
        'p: for p in mine {
            for (i, g) in gkey.iter().enumerate() {
                match (p.pat[i], &p.lab[i]) {
                    (Some(t), _) if t != *g => continue 'p,
                    (Some(_), _) => {}
                    (None, Some((occ, _))) => {
                        if self.inst(*occ, labels, rg) != Some(*g) {
                            continue 'p;
                        }
                    }
                    (None, None) => return None,
                }
            }
            let mut pr: Vec<Term> = Vec::with_capacity(p.sproj.len());
            for t in &p.sproj {
                match self.inst(*t, labels, rg) {
                    Some(x) => pr.push(x),
                    None => continue 'p,
                }
            }
            if seen.contains(&pr) {
                continue;
            }
            xs.push(if count { Term::int(1) } else { *pr.first()? });
            seen.push(pr);
        }
        if seen.is_empty() {
            return None;
        }
        self.fold_values(op, &xs)
    }

    /// The value of a group over its members' values: a count, a total, the least or greatest, any or all.
    fn fold_values(&self, op: AggOp, xs: &[Term]) -> Option<Term> {
        let ints = || xs.iter().map(|t| t.as_int().map(|n| n as i128)).collect::<Option<Vec<i128>>>();
        let int = |n: i128| (INT_MIN as i128..=INT_MAX as i128).contains(&n).then(|| Term::int(n as i64));
        match op {
            AggOp::Count => int(xs.len() as i128),
            AggOp::Sum => int(ints()?.iter().sum()),
            AggOp::Min => int(*ints()?.iter().min()?),
            AggOp::Max => int(*ints()?.iter().max()?),
            AggOp::Or | AggOp::And => {
                let bs = xs
                    .iter()
                    .map(|t| match t.as_atom() {
                        Some(a) if a == self.v.a_true => Some(true),
                        Some(a) if a == self.v.a_false => Some(false),
                        _ => None,
                    })
                    .collect::<Option<Vec<bool>>>()?;
                let b = if op == AggOp::Or { bs.iter().any(|b| *b) } else { bs.iter().all(|b| *b) };
                Some(Term::atom(if b { self.v.a_true } else { self.v.a_false }))
            }
            _ => None,
        }
    }

    /// THE GROUP `gkey` BY REGIONS (docs/aggregates.md, "Labeled unknowns"),
    /// of a count or a sum whose possibles `mine` all exist in every
    /// completion and rest on labels alone.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn region_decide(&mut self, op: AggOp, a: &Agg, gkey: &[Term], projs: &[&[Term]], vals: &[Term], mine: &[&Possible]) -> Regions {
        if !matches!(op, AggOp::Count | AggOp::Sum | AggOp::Min | AggOp::Max | AggOp::Or | AggOp::And) || a.params() != 0 || mine.is_empty() || !mine.iter().all(|p| self.region_ok(p)) {
            return Regions::No;
        }
        let mut labels: Vec<Term> = Vec::new();
        let mut consts: Vec<Term> = gkey.to_vec();
        for p in mine {
            let occs = p.lab.iter().flatten().map(|(t, _)| *t).chain(p.sproj.iter().copied());
            for t in occs {
                self.names_in(t, &mut labels, &mut consts);
            }
        }
        let key = |e: &Eval, t: &Term| tuple_text(&e.h, &[*t]);
        labels.sort_by(|x, y| cmp_js(&key(self, x), &key(self, y)));
        labels.dedup();
        consts.sort_by(|x, y| cmp_js(&key(self, x), &key(self, y)));
        consts.dedup();
        if labels.is_empty() {
            return Regions::No;
        }
        let n = Self::count_regions(labels.len(), consts.len());
        if n > LABEL_REGIONS && brk!("label_cap_ignored" => false; true) {
            return Regions::Capped(n);
        }
        let regs = Self::region_list(labels.len(), &consts);
        let mut vs: Vec<Term> = Vec::with_capacity(regs.len());
        for rg in &regs {
            let Some(v) = self.region_value(op, &labels, rg, gkey, projs, vals, mine) else { return Regions::No };
            vs.push(v);
        }
        if vs.iter().all(|v| *v == vs[0]) {
            let by: Vec<String> = labels.iter().map(|l| format!("_[{}]", self.label_text(*l))).collect();
            return Regions::Decided(vs[0], by.join(", "));
        }
        let idx: Vec<usize> = (0..regs.len()).collect();
        Regions::Cond(self.by_node(&labels, &regs, &vs, &consts, 0, &idx))
    }

    /// The value of the group as a table over the labels, `labels[i..]` still to be told, `idx` the regions the
    /// labels before them are the same in: a case for each constant the label could be and for each earlier
    /// label it could be equal to, the rest where it is none of them; a case no different from the rest is left out.
    fn by_node(&mut self, labels: &[Term], regs: &[Vec<Rv>], vs: &[Term], consts: &[Term], i: usize, idx: &[usize]) -> Term {
        if i == labels.len() {
            return vs[idx[0]];
        }
        let mut cases: Vec<(Term, Term)> = Vec::new();
        for c in consts {
            let sub: Vec<usize> = idx.iter().copied().filter(|r| regs[*r][i] == Rv::C(*c)).collect();
            if !sub.is_empty() {
                cases.push((*c, self.by_node(labels, regs, vs, consts, i + 1, &sub)));
            }
        }
        // the classes the labels before it are in, each by the first label in it
        let mut classes: Vec<(usize, usize)> = Vec::new();
        for (j, rv) in regs[idx[0]][..i].iter().enumerate() {
            if let Rv::Class(k) = rv {
                if !classes.iter().any(|(c, _)| c == k) {
                    classes.push((*k, j));
                }
            }
        }
        for (k, j) in &classes {
            let sub: Vec<usize> = idx.iter().copied().filter(|r| regs[*r][i] == Rv::Class(*k)).collect();
            cases.push((labels[*j], self.by_node(labels, regs, vs, consts, i + 1, &sub)));
        }
        let fresh = Rv::Class(classes.len());
        let sub: Vec<usize> = idx.iter().copied().filter(|r| regs[*r][i] == fresh).collect();
        let dflt = self.by_node(labels, regs, vs, consts, i + 1, &sub);
        cases.retain(|(_, v)| *v != dflt);
        if cases.is_empty() {
            return dflt;
        }
        self.mk_by(labels[i], dflt, &cases, true)
    }

    /// The member count or total of the group an unknown makes, where every
    /// possible that could make a group no sealed group names exists in every
    /// completion and has its projection known: the members of this label's
    /// own, and those of each other label that is this one's value too, a
    /// table over those labels (`$by` with this label as the key of its case).
    pub(super) fn new_group_value(&mut self, a: &Agg, ps: &[Possible], pat: &[Option<Term>], labs: &[Option<Term>]) -> Option<Term> {
        if !matches!(a.op, AggOp::Count | AggOp::Sum | AggOp::Min | AggOp::Max | AggOp::Or | AggOp::And) || a.params() != 0 || pat.iter().filter(|t| t.is_none()).count() != 1 {
            return None;
        }
        let at = pat.iter().position(|t| t.is_none())?;
        let (label, _, _) = self.unk_parts(labs[at]?)?;
        let mut own: Vec<Vec<Term>> = Vec::new();
        let mut others: Vec<(Term, Vec<Vec<Term>>)> = Vec::new();
        for p in ps.iter().filter(|p| !p.exact()) {
            let occ = p.lab[at].as_ref().map(|(t, _)| *t)?;
            let (l, _, _) = self.unk_parts(occ)?;
            if p.pat != pat || !p.sure || p.neg {
                return None;
            }
            let pr = p.proj.clone()?;
            let into = if l == label {
                &mut own
            } else {
                match others.iter().position(|(o, _)| *o == l) {
                    Some(k) => &mut others[k].1,
                    None => {
                        others.push((l, Vec::new()));
                        &mut others.last_mut().unwrap().1
                    }
                }
            };
            if !into.contains(&pr) {
                into.push(pr);
            }
            if others.len() > 6 {
                return None;
            }
        }
        if own.is_empty() {
            return None;
        }
        others.sort_by(|x, y| cmp_js(&tuple_text(&self.h, &[x.0]), &tuple_text(&self.h, &[y.0])));
        self.new_group_node(a.op, label, &others, 0, own)
    }

    fn new_group_node(&mut self, op: AggOp, own: Term, others: &[(Term, Vec<Vec<Term>>)], j: usize, acc: Vec<Vec<Term>>) -> Option<Term> {
        if j == others.len() {
            let xs: Option<Vec<Term>> = acc.iter().map(|p| if op == AggOp::Count { Some(Term::int(1)) } else { p.first().copied() }).collect();
            return self.fold_values(op, &xs?);
        }
        let without = self.new_group_node(op, own, others, j + 1, acc.clone())?;
        let mut with = acc;
        for p in &others[j].1 {
            if !with.contains(p) {
                with.push(p.clone());
            }
        }
        let with = self.new_group_node(op, own, others, j + 1, with)?;
        if with == without {
            return Some(without);
        }
        Some(self.mk_by(others[j].0, without, &[(own, with)], true))
    }
}
