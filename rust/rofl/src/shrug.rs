//! THE SHRUG VOCABULARY, shrug.rofl as build.rs extracted it from
//! src/kernel-dense.ts: each reason with its text, and each cause a hole can
//! name with the reason it is and its text (docs/aggregates.md, "Shrugs, as
//! built"). One fact extends it; a cause it does not declare is a defect,
//! which `every_cause_the_engine_writes_is_declared` holds; the engine
//! refuses to write one (`Halt::Bug`).

use crate::dense::dense_facts;
use crate::term::{Heap, TermK};
use std::collections::HashMap;
use std::sync::OnceLock;

const SHRUG_DENSE: &str = include_str!(concat!(env!("OUT_DIR"), "/shrug.dense"));

pub struct Vocab {
    pub reasons: Vec<(String, String)>,
    pub causes: HashMap<String, (String, String)>,
}

pub fn vocab() -> &'static Vocab {
    static V: OnceLock<Vocab> = OnceLock::new();
    V.get_or_init(|| {
        let mut h = Heap::default();
        let rows = dense_facts(&mut h, SHRUG_DENSE).unwrap_or_else(|e| panic!("shrug.dense: {}", e.0));
        let text = |h: &Heap, t| match crate::term::Term::kind(t) {
            TermK::Atom(s) | TermK::Str(s) => h.name(s).to_string(),
            TermK::Func(i) => match h.fargs(i).first().map(|a| a.kind()) {
                Some(TermK::Str(s)) => h.name(s).to_string(),
                _ => String::new(),
            },
            _ => String::new(),
        };
        let mut v = Vocab { reasons: Vec::new(), causes: HashMap::new() };
        for r in &rows {
            match (r.rel.as_str(), r.args.len()) {
                ("shrug_reason", 2) => v.reasons.push((text(&h, r.args[0]), text(&h, r.args[1]))),
                ("shrug_cause", 3) => {
                    v.causes.insert(text(&h, r.args[0]), (text(&h, r.args[1]), text(&h, r.args[2])));
                }
                _ => {}
            }
        }
        v
    })
}

/// The reason a hole's cause is, as shrug.rofl declares it.
pub fn reason_of(cause: &str) -> Option<&'static str> {
    vocab().causes.get(cause).map(|(r, _)| r.as_str())
}

pub fn reason_text(reason: &str) -> Option<&'static str> {
    vocab().reasons.iter().find(|(r, _)| r == reason).map(|(_, t)| t.as_str())
}

pub fn cause_text(cause: &str) -> Option<&'static str> {
    vocab().causes.get(cause).map(|(_, t)| t.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every cause a hole row of this engine names (reflect.rs's reasons,
    /// the lattice's, the carry's, a boundary's, a world below's, a cold
    /// volume's) is declared.
    #[test]
    fn every_cause_the_engine_writes_is_declared() {
        for c in [
            "budget_exhausted", "space_exhausted", "arith_type_error", "arith_zero_divisor", "str_type_error",
            "str_index_error", "str_empty_separator", "atom_unwritable", "arith_overflow", "agg_overflow",
            "agg_type_error", "agg_open_member", "improving_cycle", "support_withdrawn", "fault_left_out",
            "left_out_below", "cooled_to_disk", "unbounded_members", "widening_forced", "tag_off_carrier",
            "dominance_cycle", "dominance_intransitive", "demand_cycle",
        ] {
            assert!(reason_of(c).is_some(), "shrug.rofl does not declare the cause {c}");
        }
    }

    /// A cut cycle is no wall: it has a reason of its own
    /// (f_a_cycle_cut_shrugged_what_a_fixpoint_decides).
    #[test]
    fn a_cut_cycle_is_no_budget() {
        assert_eq!(reason_of("demand_cycle"), Some("cut"));
    }

    #[test]
    fn every_cause_names_a_declared_reason() {
        let v = vocab();
        assert!(v.reasons.len() >= 8);
        for (c, (r, _)) in &v.causes {
            assert!(reason_text(r).is_some(), "{c} names the undeclared reason {r}");
        }
    }
}
