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
    Decided(Val),
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
            return Some(match rg[at] {
                Rv::C(c) => cases.iter().find(|(k, _)| *k == c).map_or(d, |(_, v)| *v),
                Rv::Class(_) => d,
            });
        }
        Some(t)
    }

    /// The group's member count or total in one region, over its known
    /// members and the possibles present there; `None` where it has no member.
    #[allow(clippy::too_many_arguments)]
    fn region_value(&mut self, op: AggOp, labels: &[Term], rg: &[Rv], gkey: &[Term], projs: &[&[Term]], vals: &[Term], mine: &[&Possible]) -> Option<i128> {
        let count = op == AggOp::Count;
        let mut seen: Vec<Vec<Term>> = Vec::new();
        let mut total: i128 = 0;
        for (m, p) in projs.iter().enumerate() {
            seen.push(p.to_vec());
            total += if count { 1 } else { vals[m].as_int()? as i128 };
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
            total += if count { 1 } else { pr.first()?.as_int()? as i128 };
            seen.push(pr);
        }
        (!seen.is_empty() && (INT_MIN as i128..=INT_MAX as i128).contains(&total)).then_some(total)
    }

    /// THE GROUP `gkey` BY REGIONS (docs/aggregates.md, "Labeled unknowns"),
    /// of a count or a sum whose possibles `mine` all exist in every
    /// completion and rest on labels alone.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn region_decide(&mut self, op: AggOp, a: &Agg, gkey: &[Term], projs: &[&[Term]], vals: &[Term], mine: &[&Possible]) -> Regions {
        if !matches!(op, AggOp::Count | AggOp::Sum) || a.params() != 0 || mine.is_empty() || !mine.iter().all(|p| self.region_ok(p)) {
            return Regions::No;
        }
        let mut labels: Vec<Term> = Vec::new();
        let mut consts: Vec<Term> = gkey.to_vec();
        for p in mine {
            let occs = p.lab.iter().flatten().map(|(t, _)| *t).chain(p.sproj.iter().copied());
            for t in occs {
                if let Some((l, ex, _)) = self.unk_parts(t) {
                    labels.push(l);
                    consts.extend(ex);
                } else if let Some((l, _, cases, _)) = self.by_parts(t) {
                    labels.push(l);
                    consts.extend(cases.into_iter().map(|(c, _)| c));
                }
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
        let mut vs: Vec<i128> = Vec::with_capacity(regs.len());
        for rg in &regs {
            let Some(v) = self.region_value(op, &labels, rg, gkey, projs, vals, mine) else { return Regions::No };
            vs.push(v);
        }
        if vs.iter().all(|v| *v == vs[0]) && brk!("label_correlation_lost" => false; true) {
            return Regions::Decided(Val::Int(vs[0]));
        }
        if labels.len() != 1 {
            return Regions::No;
        }
        let Some(d) = vs.last().copied() else { return Regions::No };
        let cases: Vec<(Term, Term)> = regs
            .iter()
            .zip(&vs)
            .filter_map(|(r, v)| match r[0] {
                Rv::C(c) if *v != d => Some((c, Term::int(*v as i64))),
                _ => None,
            })
            .collect();
        Regions::Cond(self.mk_by(labels[0], Term::int(d as i64), &cases, true))
    }

    /// The member count or total of the group an unknown makes, where every
    /// possible that could make a group no sealed group names is this one's
    /// and exists in every completion, with its projection known.
    pub(super) fn new_group_value(&mut self, a: &Agg, ps: &[Possible], pat: &[Option<Term>], labs: &[Option<Term>]) -> Option<Term> {
        if !matches!(a.op, AggOp::Count | AggOp::Sum) || a.params() != 0 || pat.iter().filter(|t| t.is_none()).count() != 1 {
            return None;
        }
        let at = pat.iter().position(|t| t.is_none())?;
        let (label, _, _) = self.unk_parts(labs[at]?)?;
        let count = a.op == AggOp::Count;
        let mut seen: Vec<&Vec<Term>> = Vec::new();
        let mut total: i128 = 0;
        for p in ps.iter().filter(|p| !p.exact()) {
            let occ = p.lab[at].as_ref().map(|(t, _)| *t)?;
            if p.pat != pat || !p.sure || p.neg || self.unk_parts(occ)?.0 != label {
                return None;
            }
            let pr = p.proj.as_ref()?;
            if !seen.contains(&pr) {
                total += if count { 1 } else { pr.first()?.as_int()? as i128 };
                seen.push(pr);
            }
        }
        (!seen.is_empty() && (INT_MIN as i128..=INT_MAX as i128).contains(&total)).then(|| Term::int(total as i64))
    }
}
