//! THE CHECKS OF A WANT (docs/intents.md 4.2), each a refusal of the world naming the want or the rule. A want is
//! the rule `want_key($want(Cap, A1..An)) :- Body.` the door lowered `want Cap(A1..An) :- Body.` to; what it may
//! want is the capability rows of the adapter books the world holds:
//!
//! 1. a capability `capability(Cap, Adapter, Class)` names it;
//! 2. it gives as many arguments as the capability has `arg(Cap, Pos, Name, Type)` rows, and a constant among them
//!    is of its type (text, number, atom; time and json are text);
//! 3. no rule concludes a relation a declared capability answers in (`answers(Cap, Rel, Arity)`): an answer is the adapter's
//!    word, which arrives at a later tick, never a conclusion of the evaluation that wanted it;
//! 4. no rule reads what a `shows` capability answers;
//! 5. no rule concludes `query(Cap, Template)`: a sql template is the adapter book's (docs/intents.md 4.1).

use super::*;
use crate::rofl_parse;

impl Eval {
    pub(super) fn check_wants(&mut self) -> Result<(), Halt> {
        let wants: Vec<(Sym, Vec<Term>, Sym)> = self
            .rules
            .iter()
            .filter(|r| r.clause.head.rel == self.v.want)
            .filter_map(|r| match r.clause.head.args.first()?.kind() {
                TermK::Func(i) => {
                    let a = self.h.fargs(i);
                    Some((a.first()?.as_atom()?, a[1..].to_vec(), r.id))
                }
                _ => None,
            })
            .collect();
        let rows = |e: &mut Eval, rel: &str, n: usize| -> Vec<Vec<Term>> {
            let r = e.h.intern(rel);
            e.store.rel_all(&e.h, r).into_iter().filter(|&f| e.store.arity(f) == n).map(|f| e.store.args(f).to_vec()).collect()
        };
        let caps = rows(self, "capability", 3);
        if wants.is_empty() && caps.is_empty() {
            return Ok(());
        }
        let (args, answers) = (rows(self, "arg", 4), rows(self, "answers", 3));
        let refuse = |m: String| Err(Halt::Strat(format!("want refused: {m}"), String::new()));
        for (cap, given, _) in &wants {
            let shown = self.want_text(*cap, given);
            if !caps.iter().any(|c| c[0] == Term::atom(*cap)) && brk!("want_capability_unchecked" => false; true) {
                return refuse(format!("{shown}: no capability '{}' is declared; the world imports its adapter's book (`capability({}, Adapter, Class)`)", self.h.name(*cap), self.h.name(*cap)));
            }
            let mut types: Vec<(i64, Term)> = args.iter().filter(|a| a[0] == Term::atom(*cap)).filter_map(|a| Some((a[1].as_int()?, a[3]))).collect();
            types.sort_by_key(|t| t.0);
            types.dedup_by_key(|t| t.0);
            let n = brk!("want_arity_off_by_one" => types.len() + 1; types.len());
            if n != given.len() {
                return refuse(format!("{shown}: '{}' takes {} argument(s) by its `arg` rows, the want gives {}", self.h.name(*cap), types.len(), given.len()));
            }
            for (k, (pos, ty)) in types.iter().enumerate() {
                if *pos != k as i64 + 1 {
                    return refuse(format!("{shown}: the `arg` rows of '{}' leave position {} out", self.h.name(*cap), k + 1));
                }
                let a = given[k];
                let fits = match (ty.as_atom().map(|t| self.h.name(t)), a.kind()) {
                    (_, TermK::Var(_)) => true,
                    (Some("number"), k) => matches!(k, TermK::Int(_)),
                    (Some("atom"), k) => matches!(k, TermK::Atom(_)),
                    (Some("text" | "time" | "json"), k) => matches!(k, TermK::Str(_)),
                    _ => true,
                };
                if !fits && brk!("want_types_unchecked" => false; true) {
                    let mut t = String::new();
                    rofl_parse::src_term(&self.h, a, &mut t);
                    return refuse(format!("{shown}: argument {} is {t}, and '{}' takes a {} there", k + 1, self.h.name(*cap), self.shown(*ty)));
                }
            }
        }
        let query = self.h.intern("query");
        if let Some(r) = self.rules.iter().find(|r| r.clause.head.rel == query && r.clause.head.args.len() == 2).filter(|_| !caps.is_empty() && brk!("sql_query_from_rule" => false; true)) {
            return refuse(format!("rule {}: it concludes query, the template of a sql capability; a template is its adapter book's, never a string a rule builds", self.h.name(r.id)));
        }
        for a in &answers {
            let (Some(cap), Some(rel)) = (a[0].as_atom(), a[1].as_atom()) else { continue };
            if !caps.iter().any(|c| c[0] == Term::atom(cap)) {
                continue;
            }
            if let Some(r) = self.rules.iter().find(|r| r.clause.head.rel == rel).filter(|_| brk!("want_answer_concluded" => false; true)) {
                return refuse(format!("rule {}: it concludes {}, which '{}' answers in; an answer is its adapter's, at a later tick", self.h.name(r.id), self.h.name(rel), self.h.name(cap)));
            }
            let shows = caps.iter().any(|c| c[0] == Term::atom(cap) && c[2].as_atom().is_some_and(|k| self.h.name(k) == "shows"));
            let reader = self.rules.iter().find(|r| r.clause.body.iter().flat_map(|b| b.lits_deep()).any(|l| l.rel == rel));
            if let Some(r) = reader.filter(|_| shows && brk!("want_shows_read" => false; true)) {
                return refuse(format!("rule {}: it reads {}, which '{}' answers in, and what a `shows` capability answers feeds nothing back", self.h.name(r.id), self.h.name(rel), self.h.name(cap)));
            }
        }
        Ok(())
    }

    /// `want cap(A, b)`, as it was written.
    fn want_text(&self, cap: Sym, args: &[Term]) -> String {
        let mut s = format!("want {}(", self.h.name(cap));
        for (k, a) in args.iter().enumerate() {
            if k > 0 {
                s.push_str(", ");
            }
            rofl_parse::src_term(&self.h, *a, &mut s);
        }
        s.push(')');
        s
    }
}
