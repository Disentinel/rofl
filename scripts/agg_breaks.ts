// scripts/agg_breaks.ts — EVERY AGGREGATE PROOF WORLD, SEEN TO FAIL.
//
// A world whose alarms stay silent is green whether the engine is right or
// the check is blind. Each break below plants one fault in the Rust engine,
// its parser or safety.rofl, and runs the proof worlds it should turn red,
// which must raise the alarm (or refuse with the text) it names. The worlds
// are facts/checks.rofl's `agg_<kind>_<column>`, each bound to one cell of
// facts/agg.rofl.
//
// HOW A FAULT IS PLANTED. A break with no `edits` is a switch in the engine
// source, `brk!("id" => broken; original)` (rust/rofl/src/breaks.rs): one
// build with `--features breaks` holds every fault, and ROFL_BREAK=id turns
// one on in the `rofl-load` a world runs. A normal build holds none of them.
// A break with `edits` changes a .rofl text: safety.rofl is compiled into a
// kernel-dense.ts of its own, which that build reads from
// ROFL_KERNEL_OVERRIDE, boot.rofl is copied, edited, and named in ROFL_BOOT,
// and any other file is copied, edited, and loaded in
// its place. A break whose edits are to src/ plants its fault in the
// TypeScript engine: the files src/api.ts imports are copied beside it, the
// edits applied, and each world's TypeScript answer is taken from that copy;
// such a break reds a world both engines answer. Nothing in the tree is
// touched, so the breaks run in parallel, each on its own worlds
// (scripts/pool.ts).
//
// BEFORE ANY VERDICT: every switch has a site and every site a break; every
// edit is found exactly once; src/kernel-dense.ts is the one safety.rofl
// compiles to; and every world a break reads, run by the breaks build with
// no break, is its golden and raises nothing. A break that no longer plants
// is reported as such and is not a verdict.
//
//   node --experimental-strip-types scripts/agg_breaks.ts [id ...]
//        [--world W] [--item I] [--cell K:L] [--file F]   the breaks whose worlds these select
//        [--changed[=REF]]   the breaks a change since REF (HEAD) can move
//        [--legacy]          plant each fault in the source and rebuild, one at a time
//        --census [--write]   check (or write) examples/checks/agg-breaks-census.rofl
//
// `--legacy` is the old mode: a switch is written into the source as its
// broken text (the other switches as their originals), safety.rofl edited in
// place and compiled, and the engine rebuilt with ROFL_PROFILE (release) for
// every break. It is what a switch is checked against, and it is slow.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { worlds, declared, parse, checkWorld, answerTS, answerRust, type World } from './goldens.ts';
import { runPool, type Task } from './pool.ts';
import { parseSelector, select, inputs } from './agg_select.ts';
import { kernelDenseFile } from './build_kernel_dense.ts';
import { pathToFileURL } from 'node:url';
import { Rofl } from '../src/api.ts';
import { libFiles } from '../notebook/front.ts';
import { materialize as reading } from './sentences.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
/** A break with no `edits` is a switch, `brk!("id" ...)` in rust/rofl/src. */
type Break = { id: string; what: string; edits?: [string, string, string][]; expect: Record<string, string> };
export const BREAKS: Break[] = [
 {
  "id": "prov_state_unsettled",
  "what": "the canonical state of a lazily provenanced world is read without writing the derived_by rows of the firings noted since",
  "expect": {
   "prov_lazy_reader": "the state lacks the row derived_by[$kernel]($fact(pr_b",
   "prov_lazy_retract": "the state lacks the row derived_by[$kernel]($fact(pl_reach"
  }
 },
 {
  "id": "prov_settle_keeps_dead",
  "what": "a note written as a derived_by row whether or not its fact is alive and a firing of that rule still stands",
  "expect": {
   "prov_lazy_lattice": "the state holds the row derived_by[$kernel]($fact(pv_d"
  }
 },
 {
  "id": "prov_tick_unsettled",
  "what": "a tick boundary freezes the rows written so far and not the firings noted in the tick it ends",
  "expect": {
   "prov_lazy": "the state lacks the row derived_by[$kernel]($fact(pl_hit"
  }
 },
 {
  "id": "prov_reader_deferred",
  "what": "the rows of a relation a rule reads derived_by of are noted like any other and not written as it fires",
  "expect": {
   "prov_lazy_reader": "the state lacks the row pr_fired"
  }
 },
 {
  "id": "prov_variable_reader_lazy",
  "what": "a rule that reads derived_by of a fact it does not name a relation of is taken for a reader of none: every row waits",
  "expect": {
   "provenance_relational": "the state lacks the row fired_into[main](d)"
  }
 },
 {
  "id": "asks_negation_cut",
  "what": "the cone of an asked relation does not follow a negated premise: the relation it negates is never derived",
  "expect": {
   "asks_cone": "ak_blocked"
  }
 },
 {
  "id": "asks_aggregate_cut",
  "what": "the cone of an asked relation does not follow the premises inside an aggregate: the relation it counts is never derived",
  "expect": {
   "asks_cone": "ak_member"
  }
 },
 {
  "id": "asks_derived_by_plain",
  "what": "a rule in the cone that reads derived_by of a named relation is taken for a reader of none: the relation is outside the cone and its rows are never written",
  "expect": {
   "asks_reads_provenance": "ap_a"
  }
 },
 {
  "id": "asks_derived_by_unnamed",
  "what": "a rule in the cone that reads derived_by with its fact unbound keeps only the cone: the rows of every other relation are missing",
  "expect": {
   "asks_reads_everything": "au_b"
  }
 },
 {
  "id": "asks_blind_reflection",
  "what": "a rule in the cone that reads the kernel's aggregate cells keeps only the cone: the cells of every other aggregate are missing",
  "expect": {
   "asks_reads_cells": "ab_size"
  }
 },
 {
  "id": "asks_explain_unasked",
  "what": "a relation an explain_request names is outside the cone unless some asked relation reads it: its explanation is that of a world that never derived it",
  "expect": {
   "asks_explained": "ae_y"
  }
 },
 {
  "id": "asks_dominance_reads",
  "what": "the relations a subsumptive relation's dominance bodies read are outside the cone: nothing dominates, and every value of the front is kept",
  "expect": {
   "asks_dominance": "ad_best"
  }
 },
 {
  "id": "asks_blind_asked",
  "what": "a relation the kernel writes from every rule's evaluation, asked by name, is answered from the cone: the aggregate cells of every other rule are missing",
  "expect": {
   "asks_asked_cells": "ab2_size"
  }
 },
 {
  "id": "asks_demand_asked",
  "what": "a relation answered on demand, asked by name, is answered from the cone: the facts made for the calls of every other rule are missing",
  "expect": {
   "asks_demand": "dd_u"
  }
 },
 {
  "id": "asks_retract_unread",
  "what": "an ask retracted from an evaluated world leaves the cone it named: the rules it activated still run and their rows stand",
  "expect": {
   "asks_retracted": "rr_b"
  }
 },
 {
  "id": "ts_asks_derived_by_unnamed",
  "what": "the TypeScript engine keeps only the cone for a rule that reads derived_by with its fact unbound",
  "edits": [
   [
    "src/aggeval.ts",
    "            else return whole(r, V.derived_by);",
    "            else void whole;"
   ]
  ],
  "expect": {
   "asks_reads_everything": "au_b"
  }
 },
 {
  "id": "ts_asks_blind_reflection",
  "what": "the TypeScript engine keeps only the cone for a rule that reads the kernel's aggregate cells",
  "edits": [
   [
    "src/aggeval.ts",
    "          } else if (blind.has(l.rel) || l.rel === V.hole) return whole(r, l.rel);",
    "          }"
   ]
  ],
  "expect": {
   "asks_reads_cells": "ab_size"
  }
 },
 {
  "id": "ts_asks_explain_unasked",
  "what": "the TypeScript engine leaves a relation an explain_request names outside the cone",
  "edits": [
   [
    "src/aggeval.ts",
    "if (f.args.length === 2 && (f.args[1].k === 'a' || f.args[1].k === 'f')) cone.add(f.args[1].name);",
    "if (false) cone.add(f.args[1].name);"
   ]
  ],
  "expect": {
   "asks_explained": "ae_y"
  }
 },
 {
  "id": "ts_asks_dominance_reads",
  "what": "the TypeScript engine leaves the relations a dominance body reads outside the cone",
  "edits": [
   [
    "src/aggeval.ts",
    "      for (const [rel, sub] of this.subs) if (cone.has(rel)) for (const x of sub.reads) cone.add(x);",
    "      for (const [rel, sub] of this.subs) if (false) for (const x of sub.reads) cone.add(x);"
   ]
  ],
  "expect": {
   "asks_dominance": "ad_best"
  }
 },
 {
  "id": "asks_kernel_heads_cut",
  "what": "a rule concluding unknown runs only when its relation is asked: the negation the kernel reads it behind is a finite failure",
  "expect": {
   "asks_kernel_reads": "the state lacks the row unknown[main](kr_k(b))"
  }
 },
 {
  "id": "asks_explain_rule_unasked",
  "what": "a rule that makes an explain_request runs only when explain_request is asked: the request is never made",
  "expect": {
   "asks_explain_rule": "the state lacks the row explained[$explain](why,er_y(1),1,\"er_y[main](1)"
  }
 },
 {
  "id": "asks_refusals_cut",
  "what": "the cone keeps none of the rules that make the whole world refuse: a world refused without asks is answered with them",
  "expect": {
   "asks_refused": "was to be refused"
  }
 },
 {
  "id": "asks_hole_asked",
  "what": "hole asked is read as a relation of the cone: no rule runs for it and the hole of a rule outside the cone is never met",
  "expect": {
   "asks_hole": "the state lacks the row ho_bad[main](10)"
  }
 },
 {
  "id": "asks_derived_ignored",
  "what": "an ask a rule concludes is ignored beside a stored one: the relation it asks is left outside the cone",
  "expect": {
   "asks_derived": "the state lacks the row dv_b[main](1)"
  }
 },
 {
  "id": "ts_asks_kernel_heads_cut",
  "what": "the TypeScript engine runs a rule concluding unknown only when its relation is asked",
  "edits": [
   [
    "src/aggeval.ts",
    "    return [IFACE.unknown, 'shrug', 'explain_request', ...(this.wellFounded ? [IFACE.stratum] : [])];",
    "    return [];"
   ]
  ],
  "expect": {
   "asks_kernel_reads": "the state lacks the row unknown[main](kr_k(b))"
  }
 },
 {
  "id": "ts_asks_explain_rule_unasked",
  "what": "the TypeScript engine leaves the relation a rule-made explain_request names outside the cone",
  "edits": [
   [
    "src/aggeval.ts",
    "        if (head === 'explain_request') {",
    "        if (false) {"
   ]
  ],
  "expect": {
   "asks_explain_rule": "the state lacks the row explained[$explain](why,er_y(1),1,\"er_y[main](1)"
  }
 },
 {
  "id": "ts_asks_refusals_cut",
  "what": "the TypeScript engine keeps none of the rules that make the whole world refuse",
  "edits": [
   [
    "src/aggeval.ts",
    "    for (const rel of this.refusalHeads(kept)) cone.add(rel);",
    "    void this.refusalHeads;"
   ]
  ],
  "expect": {
   "asks_refused": "was to be refused"
  }
 },
 {
  "id": "ts_asks_hole_asked",
  "what": "the TypeScript engine reads hole asked as a relation of the cone",
  "edits": [
   [
    "src/aggeval.ts",
    "rel === V.derived_by || rel === V.hole || this.answer.demandRels.includes(rel)",
    "rel === V.derived_by || this.answer.demandRels.includes(rel)"
   ]
  ],
  "expect": {
   "asks_hole": "the state lacks the row ho_bad[main](10)"
  }
 },
 {
  "id": "ts_asks_derived_ignored",
  "what": "the TypeScript engine ignores an ask a rule concludes beside a stored one",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (derived) {",
    "    if (derived && false) {"
   ]
  ],
  "expect": {
   "asks_derived": "the state lacks the row dv_b[main](1)"
  }
 },
 {
  "id": "stale_kept_drained",
  "what": "a fact that read a value since improved on is decided and forgotten when the first lattice closes: a subsumptive relation closing later drops the history its why walks",
  "expect": {
   "sub_history_beside_lattice": "the state lacks the row wit sh_sat[main](p,1)"
  }
 },
 {
  "id": "ts_stale_kept_drained",
  "what": "the TypeScript engine forgets the stale facts it kept when the first lattice closes",
  "edits": [
   [
    "src/aggeval.ts",
    "    for (const f of keep) this.latStale.add(f);",
    "    void keep;"
   ]
  ],
  "expect": {
   "sub_history_beside_lattice": "the state lacks the row wit sh_sat[main](p,1)"
  }
 },
 {
  "id": "delta_first_off",
  "what": "a firing is solved in written order, never from its news: the join before the news premise is held in full",
  "expect": {
   "agg_join_delta_first": "the state holds the row hole"
  }
 },
 {
  "id": "delta_first_spread",
  "what": "a firing is solved delta-first while an unknown spreads: the negation it leaves undecided is recorded at the plan's position, with the plan's bindings",
  "expect": {
   "agg_join_delta_first_hole": "the state lacks the row hole[$kernel]($rule(ra0d53dbb),support_withdrawn)"
  }
 },
 {
  "id": "delta_first_persp",
  "what": "a premise with a perspective variable is placed after a premise that binds it, where the written order read it unbound",
  "expect": {
   "agg_join_delta_first_persp": "jdp_kernel"
  }
 },
 {
  "id": "delta_first_walls",
  "what": "a firing is solved delta-first under a budget or space the caller set, without the world opting in",
  "expect": {
   "agg_join_delta_first_walled": "the state lacks the row hole[$kernel]($adhoc,space_exhausted)"
  }
 },
 {
  "id": "delta_first_cut_unchecked",
  "what": "a delta-first firing whose conclusions reach the steps wall concludes in the plan's order",
  "expect": {
   "agg_join_delta_first_steps_planned": "the state lacks the row p[main](q,y6) tick"
  }
 },
 {
  "id": "delta_first_overrun_holes",
  "what": "a delta-first plan that outgrows the space holes the rule, where the written order fits",
  "expect": {
   "agg_join_delta_first_space_planned": "the state holds the row hole[$kernel]($rule("
  }
 },
 {
  "id": "mono",
  "what": "aggregate rules run as monotone rules, in phase A, before what they read is closed",
  "expect": {
   "agg_cell_eval": "acl_wrong",
   "agg_life_demo": "lf_wrong",
   "agg_critpath_demo": "cpc_miss",
   "agg_minimax_demo": "mmc_miss",
   "agg_quorum_demo": "qc_said",
   "agg_linter_demo": "lw_ways_wrong"
  }
 },
 {
  "id": "memo",
  "what": "no memo: a cell is sealed again on every firing",
  "expect": {
   "agg_cell_eval": "sealed twice"
  }
 },
 {
  "id": "max",
  "what": "max folds as min",
  "expect": {
   "agg_cell_eval": "acl_wrong",
   "agg_minmax_eval": "am_max_wrong",
   "agg_lattice_eval": "al_missing",
   "agg_critpath_demo": "cpc_miss",
   "agg_minimax_demo": "mmc_miss"
  }
 },
 {
  "id": "height_min",
  "what": "a firing is 1 + its LOWEST premise",
  "expect": {
   "agg_tag_witness": "tgw_missing",
   "agg_cell_witness": "aw_h_wrong"
  }
 },
 {
  "id": "order_proj",
  "what": "members sorted by projection only, not height first",
  "expect": {
   "agg_cell_witness": "aw_misordered"
  }
 },
 {
  "id": "trunc5",
  "what": "a cell keeps at most five members",
  "expect": {
   "agg_cell_witness": "aw_short"
  }
 },
 {
  "id": "refl_neg",
  "what": "encode_rule writes premise_agg for positive inner literals only",
  "expect": {
   "agg_holistic_reflect": "refl_missing",
   "agg_cell_reflect": "refl_missing"
  }
 },
 {
  "id": "no_seal",
  "what": "the seals of a cell are not reflected",
  "expect": {
   "agg_cell_reflect": "sealed_missing"
  }
 },
 {
  "id": "digest_off",
  "what": "why ignores WHY_MEMBERS and prints every member",
  "expect": {
   "agg_holistic_why": "why_text_leaked",
   "agg_cell_why": "digest_leak"
  }
 },
 {
  "id": "why_all_digest",
  "what": "why_all prints the digest",
  "expect": {
   "agg_cell_why": "full_short"
  }
 },
 {
  "id": "swap",
  "what": "the parser swaps values and keys",
  "expect": {
   "agg_holistic_syntax": "does not evaluate",
   "agg_count_syntax": "does not evaluate",
   "agg_sum_syntax": "does not evaluate",
   "agg_minmax_syntax": "does not evaluate"
  }
 },
 {
  "id": "unclosed",
  "what": "the parser accepts an aggregate that never closes",
  "expect": {
   "agg_holistic_syntax": "bad_accepted",
   "agg_count_syntax": "bad_accepted",
   "agg_sum_syntax": "bad_accepted"
  }
 },
 {
  "id": "inner_pos",
  "what": "encode_rule also writes premise_pos for inner literals",
  "expect": {
   "agg_holistic_reflect": "inner_pos",
   "agg_count_reflect": "inner_pos",
   "agg_sum_reflect": "inner_pos",
   "agg_minmax_reflect": "inner_pos"
  }
 },
 {
  "id": "book",
  "what": "book resolution skips the inside of an aggregate",
  "expect": {
   "agg_holistic_reflect": "book_unresolved",
   "agg_count_reflect": "book_unresolved",
   "agg_sum_reflect": "book_unresolved",
   "agg_minmax_reflect": "book_unresolved"
  }
 },
 {
  "id": "no_agg_edge",
  "what": "peel_rounds drops the aggregate edges",
  "expect": {
   "agg_sugar_safety": "was to be refused",
   "agg_holistic_strata": "ahr_accepted",
   "agg_life_demo": "lf_wrong",
   "agg_count_eval": "ac_count_wrong",
   "agg_sum_eval": "as_sum_wrong",
   "agg_minmax_eval": "am_min_missing",
   "agg_empty_strata": "ae_zero_but_ballot",
   "agg_count_strata": "acr_accepted",
   "agg_sum_strata": "asr_accepted",
   "agg_minmax_strata": "amr_accepted",
   "agg_minimax_demo": "mmc_miss"
  }
 },
 {
  "id": "no_unbound",
  "what": "safety.rofl no longer refuses an unbound member",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, member_unbound)     :- agg_inner(R, _, I), unsafe_rule(I).\n",
    ""
   ]
  ],
  "expect": {
   "agg_count_safety": "unbound_accepted"
  }
 },
 {
  "id": "no_agg_binds",
  "what": "safety.rofl no longer counts an aggregate as binding",
  "edits": [
   [
    "safety.rofl",
    "binds_at(R, K, V) :- premise_var(R, K, agg, _, V).\nbinds_at(R, K, V) :- premise_var(R, K, agg_res, _, V).\n",
    ""
   ]
  ],
  "expect": {
   "agg_count_safety": "not range-restricted",
   "agg_sum_safety": "not range-restricted",
   "agg_minmax_safety": "not range-restricted"
  }
 },
 {
  "id": "solutions",
  "what": "count counts solutions, not distinct tuples",
  "expect": {
   "agg_holistic_eval": "q_wrong",
   "agg_count_eval": "ac_count_wrong"
  }
 },
 {
  "id": "first_rep",
  "what": "a member is represented by the first solution, not the least signature",
  "expect": {
   "agg_count_witness": "rep_not_least"
  }
 },
 {
  "id": "one_member",
  "what": "a cell keeps one member",
  "expect": {
   "agg_holistic_witness": "member_missing",
   "agg_count_witness": "member_missing",
   "agg_sum_witness": "member_missing",
   "agg_minimax_demo": "mmc_unsaid"
  }
 },
 {
  "id": "no_sealed_text",
  "what": "why says nothing of what a cell sealed",
  "expect": {
   "agg_holistic_why": "why_text_missing",
   "agg_count_why": "why_seal_missing",
   "agg_sum_why": "why_text_missing",
   "agg_minmax_why": "why_text_missing",
   "agg_empty_why": "why_empty_missing"
  }
 },
 {
  "id": "sum_by_value",
  "what": "a sum member is its value alone, not (value, key)",
  "expect": {
   "agg_holistic_eval": "q_wrong",
   "agg_slo_demo": "slc_sums_missing",
   "agg_voting_demo": "vc_miss",
   "agg_sum_eval": "as_sum_wrong",
   "agg_sum_witness": "member_missing"
  }
 },
 {
  "id": "wrap",
  "what": "sum wraps into the term instead of refusing a total past the range",
  "expect": {
   "agg_sugar_holes": "sgh_bad",
   "agg_sum_eval": "as_overflow_row",
   "agg_sum_holes": "ahs_bad"
  }
 },
 {
  "id": "no_sum_key",
  "what": "safety.rofl no longer requires sum's key",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, sum_needs_key)      :- agg_op(R, K, Op), needs_key(Op), not agg_keyed(R, K).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sum_safety": "nokey_accepted"
  }
 },
 {
  "id": "best_all",
  "what": "a Best keeps every member, not only the ties at the final value",
  "expect": {
   "agg_minmax_witness": "am_nontie_member"
  }
 },
 {
  "id": "min_by_value",
  "what": "min members deduplicated by value",
  "expect": {
   "agg_minmax_witness": "am_tie_missing",
   "agg_minimax_demo": "mmc_unsaid"
  }
 },
 {
  "id": "no_idem_key",
  "what": "safety.rofl no longer refuses a key on min",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, key_on_idempotent)  :- agg_op(R, K, Op), idempotent_op(Op), agg_keyed(R, K).\n",
    ""
   ]
  ],
  "expect": {
   "agg_minmax_safety": "key_accepted"
  }
 },
 {
  "id": "no_empty_zero",
  "what": "safety.rofl never says empty-zero",
  "edits": [
   [
    "safety.rofl",
    "empty_zero(R, K)       :- agg_op(R, K, count), not agg_groups(R, K).\nempty_zero(R, K)       :- agg_op(R, K, sum),   not agg_groups(R, K).",
    ""
   ]
  ],
  "expect": {
   "agg_empty_safety": "ae_zero_missing",
   "agg_empty_eval": "ae_zero_missing",
   "agg_minimax_demo": "mmc_miss",
   "agg_quorum_demo": "qc_miss"
  }
 },
 {
  "id": "zero_ignores_groups",
  "what": "safety.rofl says empty-zero for a grouping aggregate too",
  "edits": [
   [
    "safety.rofl",
    "empty_zero(R, K)       :- agg_op(R, K, count), not agg_groups(R, K).",
    "empty_zero(R, K)       :- agg_op(R, K, count)."
   ]
  ],
  "expect": {
   "agg_empty_safety": "grouping aggregate"
  }
 },
 {
  "id": "empty_none",
  "what": "an empty group of count or sum seals no value",
  "expect": {
   "agg_life_demo": "lf_wrong",
   "agg_voting_demo": "vc_miss",
   "agg_empty_eval": "ae_zero_missing",
   "agg_minimax_demo": "mmc_miss",
   "agg_quorum_demo": "qc_miss",
   "agg_linter_demo": "lx_ghost_not_zero",
   "agg_prose": "retire_unsaid"
  }
 },
 {
  "id": "phantom",
  "what": "a zero cell carries a member",
  "expect": {
   "agg_empty_witness": "ae_zero_has_member"
  }
 },
 {
  "id": "empty_text",
  "what": "an empty cell renders as 0 members",
  "expect": {
   "agg_empty_why": "why_empty_missing"
  }
 },
 {
  "id": "partial_check",
  "what": "a count or sum is range-checked at every partial sum, so the verdict depends on member order",
  "expect": {
   "agg_sum_eval": "ase_holed"
  }
 },
 {
  "id": "inner_fault",
  "what": "a member dropped by a builtin error in the inner body is ignored and the survivors are folded",
  "expect": {
   "agg_sum_eval": "as_dropped_row",
   "agg_sum_why": "hole_text_missing"
  }
 },
 {
  "id": "whynot_hole_empty",
  "what": "whynot reads a holed cell as an empty group",
  "expect": {
   "agg_sugar_why": "sgy_leaked",
   "agg_holistic_why": "why_text_leaked",
   "agg_sum_why": "hole_read_as",
   "agg_minmax_why": "why_hole_as_empty"
  }
 },
 {
  "id": "max_tie_last",
  "what": "max keeps only the last of its tied members",
  "expect": {
   "agg_minmax_witness": "am_tie_missing",
   "agg_minmax_why": "why_text_missing",
   "agg_minimax_demo": "mmc_unsaid"
  }
 },
 {
  "id": "or_tie_last",
  "what": "or keeps only the last of its tied members",
  "expect": {
   "agg_minmax_witness": "am_tie_missing",
   "agg_minmax_why": "why_text_missing"
  }
 },
 {
  "id": "and_tie_last",
  "what": "and keeps only the last of its tied members",
  "expect": {
   "agg_minmax_witness": "am_tie_missing"
  }
 },
 {
  "id": "cell_untimed",
  "what": "a cell is named without its tick",
  "expect": {
   "agg_cell_ticks": "act_both"
  }
 },
 {
  "id": "strata_untabled",
  "what": "the stock evaluator seals an aggregate its table does not rank, and seals an unranked relation at round 0",
  "expect": {
   "agg_count_strata_untabled": "was to be refused"
  }
 },
 {
  "id": "unranked_negation_runs",
  "what": "the stock evaluator runs a negation of what another unranked rule derives in the one final pass",
  "expect": {
   "strata_unranked_negation": "was to be refused"
  }
 },
 {
  "id": "ts_unranked_negation_runs",
  "what": "the TypeScript stock evaluator runs a negation of what another unranked rule derives in the one final pass",
  "edits": [
   [
    "src/aggeval.ts",
    "this.checkUnrankedNegation(table, stratRules, mono);",
    ""
   ]
  ],
  "expect": {
   "strata_unranked_negation": "was to be refused"
  }
 },
 {
  "id": "boot_rank_deleted",
  "what": "boot.rofl writes no rank for `leak`, the head of its audit negation",
  "edits": [
   [
    "boot.rofl",
    "boot_rank(leak, 2).\n",
    ""
   ]
  ],
  "expect": {
   "strata_boot_canon": "boot_rank_missing"
  }
 },
 {
  "id": "boot_rank_unmoved",
  "what": "boot.rofl ranks `leak` with what it negates, not above it",
  "edits": [
   [
    "boot.rofl",
    "boot_rank(leak, 2).\n",
    "boot_rank(leak, 1).\n"
   ]
  ],
  "expect": {
   "strata_boot_canon": "boot_rank_below_edge"
  }
 },
 {
  "id": "boot_rank_exported_to_deleted",
  "what": "boot.rofl writes no rank for `exported_to`, which feeds what `leak` negates",
  "edits": [
   [
    "boot.rofl",
    "boot_rank(exported_to, 1).\n",
    ""
   ]
  ],
  "expect": {
   "strata_boot_canon": "boot_rank_missing",
   "strata_boot_alone": "sb_false_leak"
  }
 },
 {
  "id": "boot_rank_unranked_negation",
  "what": "boot.rofl gains a rule with a `not` and no rank for its head",
  "edits": [
   [
    "boot.rofl",
    "boot_rank(Rel, N)  @next :- boot_rank(Rel, N).\n",
    "boot_rank(Rel, N)  @next :- boot_rank(Rel, N).\nunranked_probe(R) :- rule_known(R), not has_premise(R, _).\n"
   ]
  ],
  "expect": {
   "strata_boot_canon": "boot_rank_missing"
  }
 },
 {
  "id": "boot_rank_phantom",
  "what": "boot.rofl ranks a relation no rule of it concludes",
  "edits": [
   [
    "boot.rofl",
    "boot_rank(leak, 2).\n",
    "boot_rank(leak, 2).\nboot_rank(nosuch, 1).\n"
   ]
  ],
  "expect": {
   "strata_boot_canon": "boot_rank_phantom"
  }
 },
 {
  "id": "lattice_op_min",
  "what": "the door writes every declaration as a min",
  "expect": {
   "agg_join_syntax": "sxj_missing",
   "agg_lattice_syntax": "decl_missing",
   "agg_critpath_demo": "cpc_miss"
  }
 },
 {
  "id": "lattice_value_dropped",
  "what": "the parser reads a declaration's value and drops it",
  "expect": {
   "agg_lattice_syntax": "declares nothing"
  }
 },
 {
  "id": "lattice_arity_short",
  "what": "the declaration row records the key's width as the arity",
  "expect": {
   "agg_join_reflect": "arity other than",
   "agg_lattice_reflect": "arity other than"
  }
 },
 {
  "id": "lattice_gate_open",
  "what": "the recursion gate does not read the algebra flag: a count or sum declares a lattice",
  "edits": [
   [
    "safety.rofl",
    "lattice_refused(P, not_idempotent) :- lattice_decl(P, _, Op), not idempotent_op(Op).\n",
    ""
   ]
  ],
  "expect": {
   "agg_lattice_strata": "refused, but not for"
  }
 },
 {
  "id": "lattice_inner_as_outer",
  "what": "every read of a lattice is a strict edge, so none can recurse",
  "edits": [
   [
    "safety.rofl",
    "lattice_outer(R, P) :- lat_read(R, K, P), not lat_inner(R, K, P).",
    "lattice_outer(R, P) :- lat_read(R, K, P)."
   ]
  ],
  "expect": {
   "agg_lattice_strata": "does not evaluate"
  }
 },
 {
  "id": "lattice_two_ops",
  "what": "a relation declared with two operations is accepted",
  "edits": [
   [
    "safety.rofl",
    "lattice_refused(P, two_algebras)   :- lattice_decl(P, _, A), lattice_decl(P, _, B), A != B.\n",
    ""
   ]
  ],
  "expect": {
   "agg_lattice_safety": "was to be refused"
  }
 },
 {
  "id": "lattice_asserted",
  "what": "an asserted fact in a lattice relation is accepted",
  "expect": {
   "agg_lattice_safety": "was to be refused"
  }
 },
 {
  "id": "lattice_keep_dominated",
  "what": "a contribution worse than the cell is stored anyway",
  "expect": {
   "agg_lattice_eval": "cut by the budget"
  }
 },
 {
  "id": "lattice_no_retire",
  "what": "a better value does not retire the fact it improves on",
  "expect": {
   "agg_lattice_eval": "al_two",
   "agg_critpath_demo": "cpc_two"
  }
 },
 {
  "id": "lattice_self_support",
  "what": "a lattice's firings are not pruned of self-support",
  "expect": {
   "agg_lattice_witness": "alw_self"
  }
 },
 {
  "id": "lattice_stale_firings",
  "what": "a firing that read a value since improved on is kept where the final values found the fact",
  "expect": {
   "agg_lattice_witness": "alw_stale"
  }
 },
 {
  "id": "lattice_whynot_plain",
  "what": "whynot explores a lattice value like any other literal",
  "expect": {
   "agg_lattice_why": "why_text_missing",
   "agg_critpath_demo": "cpc_unsaid"
  }
 },
 {
  "id": "lattice_misuse_ignored",
  "what": "safety.rofl finds a rule not monotone in the value and does not refuse it",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, lattice_nonmonotone) :- lat_misuse(R), not ord_rule(R).\n",
    ""
   ]
  ],
  "expect": {
   "agg_cell_safety": "was to be refused"
  }
 },
 {
  "id": "lattice_lt_as_gt",
  "what": "a threshold below the value is taken as the monotone one for a min",
  "edits": [
   [
    "safety.rofl",
    "lt_op(Op), not lat_right_dirty(R, K, J).",
    "gt_op(Op), not lat_right_dirty(R, K, J)."
   ]
  ],
  "expect": {
   "agg_cell_safety": "was to be refused"
  }
 },
 {
  "id": "lattice_two_algebras",
  "what": "a body aggregate of another operation as a lattice's value is accepted",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, lattice_two_algebras) :- concludes(R, H), lat_op(H, Op),\n  lat_aggval(R, A, V), premise_var(R, 0, hval, _, V), A != Op.\n",
    ""
   ]
  ],
  "expect": {
   "agg_cell_safety": "was to be refused"
  }
 },
 {
  "id": "lattice_outer_mono",
  "what": "a read from outside a lattice's recursion runs with the monotone rules, on values not yet final",
  "expect": {
   "agg_cell_strata": "lost every firing"
  }
 },
 {
  "id": "lattice_negation_unnamed",
  "what": "a negation inside a lattice's recursion is not refused as one",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, lattice_negated) :- premise_neg(R, P), lattice_rel(P), concludes(R, H),\n  conclusion_tense(R, now), lat_reach(P, H).\n",
    ""
   ]
  ],
  "expect": {
   "agg_cell_strata": "refused, but not for"
  }
 },
 {
  "id": "lattice_history_dropped",
  "what": "the close drops every firing that read an earlier value, so a value reached only through its own earlier values has no well-founded derivation",
  "expect": {
   "agg_lattice_eval": "well-founded height",
   "agg_lattice_witness": "well-founded height"
  }
 },
 {
  "id": "lattice_self_cite",
  "what": "a firing that cites the fact itself (a zero-weight self-loop) is kept as a member",
  "expect": {
   "agg_lattice_witness": "alxw_self"
  }
 },
 {
  "id": "lattice_existence_ignored",
  "what": "a tied member through a higher premise is judged self-support without asking whether a derivation without the fact exists",
  "expect": {
   "agg_lattice_witness": "alxw_wrong_count"
  }
 },
 {
  "id": "lattice_literal_order",
  "what": "a rule into a lattice runs its builtins where they are written, so a fault before the key is bound holes every cell",
  "expect": {
   "agg_lattice_eval": "alx_hole_extra"
  }
 },
 {
  "id": "lattice_holes_in_order",
  "what": "the faults of a closing lattice are judged one at a time, each after the ones before it were applied",
  "expect": {
   "agg_lattice_eval": "alx_hole_missing"
  }
 },
 {
  "id": "lattice_alive_unchecked",
  "what": "a fault on a value since improved on is applied at the close",
  "expect": {
   "agg_lattice_eval": "alx_stale_fault"
  }
 },
 {
  "id": "lattice_rule_hole_early",
  "what": "a rule a lattice decides writes its rule hole when a builtin fails, on a value that may be improved on",
  "expect": {
   "agg_lattice_eval": "alx_stale_fault"
  }
 },
 {
  "id": "lattice_max_stuck",
  "what": "a max lattice keeps the first value it gets: a better one is dropped as if it were worse",
  "expect": {
   "agg_lattice_eval": "al_missing",
   "agg_critpath_demo": "cpc_miss"
  }
 },
 {
  "id": "lattice_alias_unfollowed",
  "what": "one algebra per predicate is judged on the head value only, so a body aggregate renamed by `is` passes",
  "edits": [
   [
    "safety.rofl",
    "lat_aggval(R, A, X) :- lat_aggval(R, A, Y), premise_var(R, J, right, _, Y),\n                       premise_lit(R, J, $builtin(\"is\", _)), premise_var(R, J, left, _, X).\n",
    ""
   ]
  ],
  "expect": {
   "agg_cell_safety": "was to be refused"
  }
 },
 {
  "id": "lattice_stale_solution",
  "what": "a solution over a value improved on earlier in the same batch is concluded, adding a history the value was never reached by",
  "expect": {
   "agg_lattice_witness": "alxw_wrong_count"
  }
 },
 {
  "id": "lattice_poison_off",
  "what": "a hole reaches nothing: a cell whose value could come through an unknown one keeps the value it has",
  "expect": {
   "agg_join_shrug": "the state",
   "agg_join_holes": "the state",
   "agg_lattice_eval": "ah_hole_missing",
   "agg_lattice_wall": "lacks the row"
  }
 },
 {
  "id": "lattice_unknown_decides",
  "what": "an unknown value decides a comparison or a sum, and fails it: what it reaches is not reached",
  "expect": {
   "agg_lattice_eval": "ah_hole_missing"
  }
 },
 {
  "id": "lattice_tuple_unspread",
  "what": "a tuple of a relation that is no lattice, not known to hold, is taken as false and carried no further",
  "expect": {
   "agg_lattice_eval": "ah_rule_unholed"
  }
 },
 {
  "id": "lattice_withdrawn_unspread",
  "what": "what the cascade withdraws is not carried on as unknown, and its rule is not holed",
  "expect": {
   "agg_lattice_eval": "ah_rule_unholed"
  }
 },
 {
  "id": "lattice_space_uncut",
  "what": "the space wall leaves every open lattice's values as if final: no hole",
  "expect": {
   "agg_lattice_space": "lacks the row"
  }
 },
 {
  "id": "lattice_cycle_unnamed",
  "what": "a wall names no improving cycle: a min over a negative cycle keeps the value it reached",
  "expect": {
   "agg_lattice_wall": "lacks the row",
   "agg_lattice_space": "lacks the row"
  }
 },
 {
  "id": "lattice_cycle_any_firing",
  "what": "an improving cycle is judged over every firing, so a zero-weight tie makes one",
  "expect": {
   "agg_lattice_wall": "holds the row"
  }
 },
 {
  "id": "lattice_cycle_merged_cells",
  "what": "an improving cycle is judged over cells, each one node: two settled cells that improved through each other are withdrawn",
  "expect": {
   "agg_lattice_wall": "lacks the row",
   "agg_lattice_space": "lacks the row"
  }
 },
 {
  "id": "lattice_outer_unpoisoned",
  "what": "a rule reading a lattice from outside its recursion finds a holed cell absent and concludes over the rest: a lattice above keeps a value the hole could have bettered",
  "expect": {
   "agg_lattice_eval": "ah_hole_missing"
  }
 },
 {
  "id": "lattice_neg_decides",
  "what": "a negation of something a hole left unknown succeeds, and concludes a tuple not known to hold",
  "expect": {
   "agg_lattice_eval": "aho_extra"
  }
 },
 {
  "id": "lattice_agg_decides",
  "what": "a body aggregate whose group could hold something a hole left unknown counts what survived",
  "expect": {
   "agg_lattice_eval": "aho_extra"
  }
 },
 {
  "id": "lattice_whynot_tuple_plain",
  "what": "whynot of a tuple a hole left unknown explores its rules as if it were plainly false, and names no hole",
  "expect": {
   "agg_lattice_why": "ahyw_text_missing"
  }
 },
 {
  "id": "lattice_hole_unranked",
  "what": "hole ranks above the lattices alone, so a negation of what reads it runs before a reader outside the recursion is holed",
  "expect": {
   "agg_lattice_eval": "ah_rule_unholed"
  }
 },
 {
  "id": "lattice_whynot_no_path",
  "what": "whynot of a cell a hole reached names its hole and not the path back to the fault",
  "expect": {
   "agg_lattice_why": "ahyw_text_missing"
  }
 },
 {
  "id": "lattice_why_one_member",
  "what": "why of a lattice fact prints its canonical member alone, not the digest of members",
  "expect": {
   "agg_tag_why": "tgy_text_missing",
   "agg_lattice_why": "why_text_missing",
   "agg_critpath_demo": "cpc_unnamed"
  }
 },
 {
  "id": "lattice_why_ghost_unmarked",
  "what": "why prints a superseded value as if it were the cell's value",
  "expect": {
   "agg_lattice_why": "alyx_text_missing"
  }
 },
 {
  "id": "thr_n_minus_one",
  "what": "a threshold reads N as N - 1: reached one member short",
  "expect": {
   "agg_threshold_eval": "oracle_short",
   "agg_threshold_witness": "quorum_size",
   "agg_quorum_demo": "qc_miss"
  }
 },
 {
  "id": "thr_no_refire",
  "what": "news on a relation read inside a threshold does not fire its rule again: the recursion stops at the first round",
  "expect": {
   "agg_threshold_eval": "ate_wrong",
   "agg_threshold_strata": "recursion_short",
   "agg_quorum_demo": "qc_miss"
  }
 },
 {
  "id": "thr_text_order",
  "what": "the Quorum is the first N by projection text, not by height",
  "expect": {
   "agg_threshold_witness": "quorum_wrong",
   "agg_threshold_why": "text_missing",
   "agg_quorum_demo": "qc_unsaid"
  }
 },
 {
  "id": "thr_first_height",
  "what": "a quorum's height is its first member's, not its Nth",
  "expect": {
   "agg_threshold_witness": "height_chain",
   "agg_threshold_why": "text_missing"
  }
 },
 {
  "id": "thr_no_close",
  "what": "a quorum keeps the members it was reached with: never closed, never canonical",
  "expect": {
   "agg_threshold_witness": "quorum_wrong",
   "agg_threshold_why": "text_missing",
   "agg_quorum_demo": "qc_unsaid"
  }
 },
 {
  "id": "thr_whynot_reached",
  "what": "whynot takes a group one member short for reached",
  "expect": {
   "agg_threshold_why": "text_missing",
   "agg_quorum_demo": "qc_unsaid"
  }
 },
 {
  "id": "thr_no_hole",
  "what": "a threshold that is no integer leaves no hole",
  "expect": {
   "agg_threshold_eval": "threshold_not_holed"
  }
 },
 {
  "id": "thr_reflect_agg",
  "what": "a threshold's inner reads are reflected as a closed aggregate's, premise_agg",
  "expect": {
   "agg_threshold_reflect": "pos_missing"
  }
 },
 {
  "id": "thr_peel_cells",
  "what": "the peel does not rank a threshold's cells above its conclusion",
  "expect": {
   "agg_threshold_strata": "cell_unseen"
  }
 },
 {
  "id": "thr_table_cells",
  "what": "rules/strata.rofl does not rank a threshold's cells above its conclusion",
  "edits": [
   [
    "rules/strata.rofl",
    "dep_neg(X, A)      :- agg_reflection(X), threshold_rule(R), concludes(R, A), conclusion_tense(R, now).\n",
    ""
   ]
  ],
  "expect": {
   "agg_threshold_strata": "table_cell_low"
  }
 },
 {
  "id": "thr_key_parse",
  "what": "the parser no longer refuses a key on a threshold by name",
  "expect": {
   "agg_threshold_syntax": "takes no key"
  }
 },
 {
  "id": "thr_lattice_live",
  "what": "safety.rofl lets a threshold count what rests on an open lattice",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, threshold_lattice) :- thr_read(R, Q), lat_live(Q, _).\n",
    ""
   ]
  ],
  "expect": {
   "agg_threshold_safety": "was to be refused"
  }
 },
 {
  "id": "thr_door_n",
  "what": "the load door takes a threshold that is neither an integer nor bound before it",
  "expect": {
   "agg_threshold_safety": "was to be refused"
  }
 },
 {
  "id": "thr_key_no_n",
  "what": "a threshold cell's key leaves N out: a group reached at one N is taken as reached at every N",
  "expect": {
   "agg_threshold_eval": "ate_wrong",
   "agg_threshold_witness": "cell_unshaped"
  }
 },
 {
  "id": "thr_one_deriv",
  "what": "a threshold member keeps one derivation, its least signature, and is as high (or as unfounded) as that one",
  "expect": {
   "agg_threshold_witness": "quorum_wrong"
  }
 },
 {
  "id": "thr_acc_frozen",
  "what": "a threshold group short of N keeps the members it had when first touched: the round's news never grows it",
  "expect": {
   "agg_threshold_eval": "ate_wrong",
   "agg_quorum_demo": "qc_miss"
  }
 },
 {
  "id": "median_upper",
  "what": "median takes the upper of the two middle values of an even count",
  "expect": {
   "agg_holistic_eval": "med_wrong"
  }
 },
 {
  "id": "quantile_floor",
  "what": "quantile takes the floor of P*n/100 as its rank, not the ceiling",
  "expect": {
   "agg_holistic_eval": "q_wrong",
   "agg_slo_demo": "slc_p99_missing"
  }
 },
 {
  "id": "quantile_domain",
  "what": "a percent outside 0..100 is clamped to a value, not a hole",
  "expect": {
   "agg_holistic_eval": "hole_unmarked",
   "agg_holistic_why": "why_text_missing"
  }
 },
 {
  "id": "holistic_unsorted",
  "what": "the holistic value is read from the members in canonical order, not sorted by value",
  "expect": {
   "agg_holistic_eval": "q_wrong"
  }
 },
 {
  "id": "rank_insertion",
  "what": "rank of a subject that is none of the values is where it would stand",
  "expect": {
   "agg_holistic_eval": "unranked_row",
   "agg_holistic_witness": "unranked_valued"
  }
 },
 {
  "id": "hol_door_param",
  "what": "the load door takes a percent or subject that is neither an integer nor bound before it",
  "expect": {
   "agg_holistic_safety": "was to be refused"
  }
 },
 {
  "id": "hol_door_percent_range",
  "what": "the load door takes a literal percent outside 0..100",
  "expect": {
   "agg_holistic_safety": "was to be refused"
  }
 },
 {
  "id": "hol_unshared",
  "what": "a holistic group read under many percents or subjects is solved and stored once per percent or subject",
  "expect": {
   "agg_holistic_eval": "was cut by the budget"
  }
 },
 {
  "id": "hol_share_body",
  "what": "a group is shared across percents even when its inner body reads the percent",
  "expect": {
   "agg_holistic_eval": "qin_"
  }
 },
 {
  "id": "hol_shared_bare",
  "what": "a cell sealed over a shared group stores no members",
  "expect": {
   "agg_holistic_witness": "member_missing"
  }
 },
 {
  "id": "plain_rule_hole_unspread",
  "what": "a rule holed by a builtin's error leaves its conclusion absent, and an aggregate over it has a value",
  "expect": {
   "agg_holistic_eval": "ahp_hole_unmarked",
   "agg_count_holes": "ahc_bad",
   "agg_empty_holes": "ahe_bad"
  }
 },
 {
  "id": "plain_cell_hole_unspread",
  "what": "a body aggregate's holed cell leaves its conclusion absent, and an aggregate over it has a value",
  "expect": {
   "agg_holistic_eval": "ahp_hole_unmarked"
  }
 },
 {
  "id": "plain_positive_holed",
  "what": "a positive rule reading what a plain hole left out is holed, where the plain engine holes nothing",
  "expect": {
   "agg_holistic_eval": "ahp_reader_holed",
   "agg_cell_holes": "hn_overholed"
  }
 },
 {
  "id": "plain_unknown_settles",
  "what": "a wall closes as settled a lattice that what a plain hole left out, not yet carried, could still reach",
  "expect": {
   "agg_lattice_plain_budget": "lacks the row",
   "agg_lattice_plain_space": "lacks the row"
  }
 },
 {
  "id": "carry_unwalled",
  "what": "the carry of unknowns is charged against no wall, so a program with a hole in it runs past both",
  "expect": {
   "agg_carry_budget": "lacks the row",
   "agg_carry_space": "lacks the row",
   "agg_carry_plain_budget": "lacks the row"
  }
 },
 {
  "id": "carry_broken_settles",
  "what": "after a wall fell inside a carry, a lattice it had not yet reached is closed at the cut as settled",
  "expect": {
   "agg_lattice_carry_cut": "lacks the row"
  }
 },
 {
  "id": "cut_carry_unrenewed",
  "what": "the cut's carry is charged against the walls already spent, so every cut after a carry holes its lattices whole",
  "expect": {
   "agg_lattice_carry_cut": "lacks the row"
  }
 },
 {
  "id": "cut_fallback_off",
  "what": "a cut whose own carry runs out fails the evaluation instead of holing its lattices whole",
  "expect": {
   "agg_lattice_cut_fallback": "holds the row"
  }
 },
 {
  "id": "unknown_scan",
  "what": "a negation reads what a hole left out by scanning every unknown of the relation, not those at its bound argument",
  "expect": {
   "agg_cell_holes_scale": "holds the row"
  }
 },
 {
  "id": "neg_unknown_unbound",
  "what": "a negation is undecided by any unknown of its relation, whatever its arguments",
  "expect": {
   "agg_cell_holes": "lacks the row"
  }
 },
 {
  "id": "plain_alive_unknown",
  "what": "what a plain hole left out is unknown even when it holds another way",
  "expect": {
   "agg_holistic_eval": "ahp_alive"
  }
 },
 {
  "id": "plain_flush_early",
  "what": "what a plain hole left out is carried before its relation closes, so a later rule that concludes it comes too late",
  "expect": {
   "agg_holistic_eval": "ahp_alive"
  }
 },
 {
  "id": "hol_param_projected",
  "what": "quantile's percent and rank's subject are projected as a member's first term",
  "expect": {
   "agg_holistic_eval": "q_wrong",
   "agg_holistic_witness": "member_extra"
  }
 },
 {
  "id": "hol_best_only",
  "what": "a holistic cell keeps only the members that hold its value",
  "expect": {
   "agg_holistic_witness": "member_missing",
   "agg_holistic_why": "why_text_missing"
  }
 },
 {
  "id": "whynot_unranked_empty",
  "what": "whynot reads a rank nobody holds as an empty group",
  "expect": {
   "agg_holistic_why": "why_text_missing"
  }
 },
 {
  "id": "hol_no_key",
  "what": "safety.rofl no longer requires median's and quantile's projection key",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, holistic_needs_key) :- agg_op(R, K, Op), needs_holistic_key(Op), not agg_keyed(R, K).\n",
    ""
   ]
  ],
  "expect": {
   "agg_holistic_safety": "refused_accepted"
  }
 },
 {
  "id": "hol_no_param",
  "what": "safety.rofl no longer requires quantile's and rank's two terms",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, param_and_value)    :- agg_op(R, K, Op), param_op(Op), not agg_two_terms(R, K), not agg_tuple_rank(R, K).\n",
    ""
   ]
  ],
  "expect": {
   "agg_holistic_safety": "was to be refused"
  }
 },
 {
  "id": "hol_ring1_words",
  "what": "ring 1 does not read median, quantile and rank as operations",
  "edits": [
   [
    "examples/ring1/ring1.rofl",
    "agg_word(median). agg_word(quantile). agg_word(rank).\n",
    ""
   ]
  ],
  "expect": {
   "agg_holistic_syntax": "ring1_missing"
  }
 },
 {
  "id": "strata_agg_edge",
  "what": "rules/strata.rofl ranks an aggregate's conclusion no higher than what it reads",
  "edits": [
   [
    "rules/strata.rofl",
    "dep_neg(A, B)      :- concludes(R, A), conclusion_tense(R, now), premise_agg(R, B).\n",
    ""
   ]
  ],
  "expect": {
   "agg_holistic_strata": "ahs_inverted"
  }
 },
 {
  "id": "wfs_admits_body_aggregate",
  "what": "a body aggregate is evaluated under well_founded semantics, sealed under the round's assumption",
  "expect": {
   "agg_count_wfs": "count is not evaluated under well_founded semantics",
   "agg_sum_wfs": "sum is not evaluated under well_founded semantics",
   "agg_minmax_wfs": "min is not evaluated under well_founded semantics",
   "agg_holistic_wfs": "median is not evaluated under well_founded semantics",
   "agg_empty_wfs": "count is not evaluated under well_founded semantics"
  }
 },
 {
  "id": "wfs_admits_threshold",
  "what": "a threshold is evaluated under well_founded semantics",
  "expect": {
   "agg_threshold_wfs": "at_least is not evaluated under well_founded semantics"
  }
 },
 {
  "id": "wfs_admits_lattice",
  "what": "a lattice is evaluated under well_founded semantics",
  "expect": {
   "agg_join_wfs": "lattice wjr_reach is not evaluated under well_founded semantics",
   "agg_lattice_wfs": "lattice wr_reach is not evaluated under well_founded semantics",
   "agg_widen_wfs": "lattice wwr_depth is not evaluated under well_founded semantics"
  }
 },
 {
  "id": "below_feeds_declarations",
  "what": "the world below feeds the declarations its rules conclude, so the world above is well-founded too",
  "expect": {
   "agg_cell_wfs": "does not evaluate"
  }
 },
 {
  "id": "below_drops_unknown",
  "what": "the world below feeds its true rows and not its unknown ones",
  "expect": {
   "agg_count_wfs": "wcn_got[main](draws,4)",
   "agg_sum_wfs": "wsm_got[main](drawn,4)",
   "agg_minmax_wfs": "wmx_best[main](a,0)",
   "agg_holistic_wfs": "whl_got[main](median,0)",
   "agg_threshold_wfs": "wth_contested[main]()",
   "agg_empty_wfs": "wem_got[main](p2,0,2)",
   "agg_lattice_wfs": "wlt_to_draw[main](a,0)"
  }
 },
 {
  "id": "carry_into_lattice",
  "what": "a lattice concluded @next is staged into the lattice itself, not into its carried relation",
  "expect": {
   "agg_join_ticks": "does not evaluate",
   "agg_lattice_ticks": "does not evaluate"
  }
 },
 {
  "id": "carry_why_present",
  "what": "why explains a staged firing's premises as the facts of the tick it arrived in",
  "expect": {
   "agg_join_ticks": "tjk_text_missing",
   "agg_lattice_ticks": "tlk_not_past"
  }
 },
 {
  "id": "cell_why_present",
  "what": "why explains a carried cell's members as the facts of the present tick",
  "expect": {
   "agg_cell_ticks": "ctk_member_not_past",
   "agg_count_ticks": "tcn_member_not_past",
   "agg_sum_ticks": "tsm_member_not_past",
   "agg_minmax_ticks": "tmx_member_not_past",
   "agg_holistic_ticks": "thl_member_not_past",
   "agg_threshold_ticks": "tth_member_not_past"
  }
 },
 {
  "id": "retain_prunes_cited",
  "what": "retain_ticks drops the derived_by rows a live cell cites",
  "expect": {
   "agg_join_ticks": "tjk_text_missing",
   "agg_cell_ticks": "the state lacks the row derived_by",
   "agg_count_ticks": "tcn_member_not_past",
   "agg_sum_ticks": "tsm_member_not_past",
   "agg_minmax_ticks": "tmx_member_not_past",
   "agg_holistic_ticks": "thl_member_not_past",
   "agg_threshold_ticks": "tth_member_not_past",
   "agg_lattice_ticks": "tlk_not_past"
  }
 },
 {
  "id": "carried_cells_unreflected",
  "what": "a cell carried across a boundary is not reflected in the tick it arrives in",
  "expect": {
   "agg_cell_ticks": "ctk_wrong",
   "agg_count_ticks": "tcn_cell_missing",
   "agg_sum_ticks": "tsm_cell_missing",
   "agg_minmax_ticks": "tmx_cell_missing",
   "agg_holistic_ticks": "thl_cell_missing",
   "agg_threshold_ticks": "tth_cell_missing",
   "agg_empty_ticks": "tem_cell_missing"
  }
 },
 {
  "id": "next_cells_reflected_early",
  "what": "a cell sealed for an @next conclusion is reflected in the tick it is sealed in",
  "expect": {
   "agg_cell_ticks": "ctk_wrong",
   "agg_count_ticks": "tcn_early",
   "agg_sum_ticks": "tsm_early",
   "agg_minmax_ticks": "tmx_early",
   "agg_holistic_ticks": "thl_early",
   "agg_threshold_ticks": "tth_early",
   "agg_empty_ticks": "tem_early"
  }
 },
 {
  "id": "carry_drops_hole",
  "what": "a conclusion @next a hole kept from being staged is absent at the next tick, not unknown",
  "expect": {
   "agg_count_ticks": "tcn_hole_read",
   "agg_sum_ticks": "tsm_hole_read",
   "agg_minmax_ticks": "tmx_hole_read",
   "agg_holistic_ticks": "thl_hole_read",
   "agg_threshold_ticks": "tth_unholed",
   "agg_empty_ticks": "tem_hole_read",
   "agg_lattice_ticks": "tlk_hole_read"
  }
 },
 {
  "id": "restaged_keeps_old_firing",
  "what": "a fact staged again keeps the firings of the ticks before, and why explains it by the oldest",
  "expect": {
   "agg_cell_ticks": "ctk_restaged"
  }
 },
 {
  "id": "below_drops_concluded_input",
  "what": "the world below feeds no asserted row, though its rules conclude the relation",
  "expect": {
   "agg_cell_wfs": "wc_answer_missing"
  }
 },
 {
  "id": "plain_neg_decides",
  "what": "a negation of what a plain hole left out succeeds: a tuple not known reads as false",
  "expect": {
   "agg_sugar_holes": "sgh_bad",
   "agg_cell_holes": "hn_bad",
   "agg_count_holes": "ahc_bad",
   "agg_sum_holes": "ahs_bad",
   "agg_minmax_holes": "ahm_bad",
   "agg_holistic_holes": "ahh_bad",
   "agg_threshold_holes": "aht_bad",
   "agg_empty_holes": "ahe_bad"
  }
 },
 {
  "id": "plain_neg_unholed",
  "what": "a negation a plain hole left undecided concludes nothing and says nothing: its rule is not holed",
  "expect": {
   "agg_cell_holes": "hn_unholed"
  }
 },
 {
  "id": "plain_reader_unclosed",
  "what": "a rule is never solved against the plain unknowns carried before it closed",
  "expect": {
   "agg_cell_holes": "hn_bad"
  }
 },
 {
  "id": "space_uncut_world",
  "what": "the space wall writes no world hole and leaves the evaluation as if it had finished",
  "expect": {
   "agg_lattice_space": "lacks the row"
  }
 },
 {
  "id": "agg_seal_at_wall",
  "what": "at the budget, the body aggregates are sealed over what was derived before the cut",
  "expect": {
   "agg_tagc_budget": "holds the row",
   "agg_count_budget": "holds the row",
   "agg_sum_budget": "holds the row",
   "agg_minmax_budget": "holds the row",
   "agg_holistic_budget": "holds the row",
   "agg_empty_budget": "holds the row"
  }
 },
 {
  "id": "arith_wraps",
  "what": "arithmetic past the term range wraps into a value instead of holing its rule",
  "expect": {
   "agg_cell_holes": "ahx_bad",
   "agg_lattice_holes": "ahl_bad",
   "agg_int_range": "ir_bad"
  }
 },
 {
  "id": "int_literal_wide",
  "what": "the parser reads a literal of 2^60 as a value",
  "expect": {
   "agg_int_range": "ir_bad"
  }
 },
 {
  "id": "mod_floor",
  "what": "mod takes the divisor's sign, not the dividend's",
  "expect": {
   "agg_int_range": "ir_bad"
  }
 },
 {
  "id": "args_are_expressions",
  "what": "the Rust parser reads an expression as a functor's argument, where the grammar and the TypeScript parser read a term",
  "expect": {
   "args_are_terms": "args-are-terms"
  }
 },
 {
  "id": "ts_args_are_expressions",
  "what": "the TypeScript parser reads an expression as a functor's argument, where the grammar and the Rust parser read a term",
  "edits": [
   [
    "src/parser.ts",
    "const out = [this.term()];\n    while (this.peek().t === ',') { this.next(); out.push(this.term()); }",
    "const out = [this.expr()];\n    while (this.peek().t === ',') { this.next(); out.push(this.expr()); }"
   ]
  ],
  "expect": {
   "args_are_terms": "args-are-terms"
  }
 },
 {
  "id": "ts_arith_range",
  "what": "the TypeScript engine's arithmetic has no range: a result past 2^60 is a value",
  "edits": [
   [
    "src/unify.ts",
    "if (v < TERM_MIN || v > TERM_MAX) {",
    "if (false) {"
   ]
  ],
  "expect": {
   "agg_int_range": "ir_bad"
  }
 },
 {
  "id": "ts_arith_float",
  "what": "the TypeScript engine's arithmetic keeps a double past 2^53, where it is not exact",
  "edits": [
   [
    "src/unify.ts",
    "if (v !== null && Number.isSafeInteger(v)) return v;",
    "if (v !== null) return v;"
   ]
  ],
  "expect": {
   "agg_int_range": "ir_bad"
  }
 },
 {
  "id": "ts_literal_range",
  "what": "the TypeScript parser reads a literal of 2^60 as a value",
  "edits": [
   [
    "src/parser.ts",
    "if (v > limit || (v === limit && !negated))",
    "if (v > limit)"
   ]
  ],
  "expect": {
   "agg_int_range": "ir_bad"
  }
 },
 {
  "id": "ts_mod_floor",
  "what": "the TypeScript engine's mod takes the divisor's sign, not the dividend's",
  "edits": [
   [
    "src/unify.ts",
    "t.name === 'mod' ? a - b * (a / b)",
    "t.name === 'mod' ? ((a % b) + b) % b"
   ]
  ],
  "expect": {
   "agg_int_range": "ir_bad"
  }
 },
 {
  "id": "lattice_settled_cut",
  "what": "a wall holes a lattice that had settled, for sharing the round with one that had not",
  "expect": {
   "agg_lattice_budget": "holds the row",
   "agg_lattice_wall": "holds the row",
   "agg_lattice_space": "holds the row"
  }
 },
 {
  "id": "plain_staged_why_present",
  "what": "why explains a plain staged firing's premises by what the store holds under their keys now, not as of the tick they were read in",
  "expect": {
   "agg_cell_ticks": "ctk_plain"
  }
 },
 {
  "id": "staged_neg_arrival",
  "what": "why explains a staged firing's negated premise against the arrival tick's store (an inlined whynot that says the fact holds) instead of as it stood in the tick the rule fired in",
  "expect": {
   "staged_neg_why": "snw_bad",
   "staged_neg_why_agg": "snw_bad"
  }
 },
 {
  "id": "ts_staged_neg_arrival_agg",
  "what": "the TypeScript aggregate explainer reads a staged firing's negated premise against the arrival tick",
  "edits": [
   [
    "src/aggeval.ts",
    "const bare = pr.t === 'neg';",
    "const bare = false;"
   ]
  ],
  "expect": {
   "staged_neg_why_agg": "snw_bad"
  }
 },
 {
  "id": "wfs_unknowns_decide",
  "what": "under well-founded semantics a negation of what a hole left out is judged as if it were false, and holds for certain",
  "expect": {
   "agg_cell_holes_wfs": "holds the row"
  }
 },
 {
  "id": "demand_fault_unspread",
  "what": "a fault below a relation answered on demand leaves what the call would have matched absent, and a reader of it definite",
  "expect": {
   "agg_cell_holes_ticks": "ht_bad"
  }
 },
 {
  "id": "shrug_meta_off",
  "what": "`unknown(A)` of what a hole left out is read as no row: a negation of it succeeds and a count of it is a count of the rest",
  "expect": {
   "agg_cell_shrug": "sd_settled[main](c)",
   "agg_count_shrug": "sac_settled",
   "agg_unknown_beside_hole": "aub_shrug[main](hu_decided(c))",
   "agg_unknown_beside_hole_strata": "aub_shrug[main](hu_decided(c))",
   "agg_sum_shrug": "sas_settled",
   "agg_minmax_shrug": "sam_settled",
   "agg_holistic_shrug": "sah_settled"
  }
 },
 {
  "id": "shrug_rows_off",
  "what": "no shrug row is written: a shrug is indistinguishable from what is unentailed",
  "expect": {
   "agg_sugar_shrug": "sgk_wrong",
   "agg_count_shrug": "shrug[$kernel](sac_n(q",
   "agg_lattice_shrug": "shrug[$kernel](sl_d(a,c",
   "agg_lattice_shrug_wall": "shrug[$kernel]($adhoc,budget,spent(steps,3001,3000))",
   "agg_empty_shrug": "shrug[$kernel](sae_n(r",
   "agg_sum_shrug": "shrug[$kernel](sas_t(q",
   "agg_minmax_shrug": "shrug[$kernel](sam_lo(q",
   "agg_holistic_shrug": "shrug[$kernel](sah_med(q",
   "agg_cell_shrug_ticks": "stk_was[main]($next(stk_y"
  }
 },
 {
  "id": "shrug_unknown_unranked",
  "what": "what reads `unknown` or `shrug` is ranked among the rest, and fires before the shrugs it reads are known",
  "expect": {
   "agg_unknown_beside_hole": "aub_shrug[main](hu_decided(c))",
   "agg_cell_shrug_strata": "ss_ok[main](c)"
  }
 },
 {
  "id": "shrug_structure_wild",
  "what": "an unknown whose value holds a structure matches any structure: unknown(sd_val(b, _)) is read as unknown(sd_lose(b))",
  "expect": {
   "agg_cell_shrug": "sd_novel[main](b)"
  }
 },
 {
  "id": "shrug_wfs_one_level",
  "what": "under well-founded semantics a rule reading `unknown` runs in the one alternation, before the rows it reads exist",
  "expect": {
   "agg_cell_shrug_wfs": "sw_decided[main](x)",
   "wfs_unknown_negated": "wn_decided[main](x)"
  }
 },
 {
  "id": "shrug_wfs_carry_reset",
  "what": "the alternation forgets what holes left out at every round, so a negation over it is undefined in the first round's model and called a paradox",
  "expect": {
   "holes_negation_wfs": "unknown[main](hw_nx(c))"
  }
 },
 {
  "id": "shrug_thr_neg_decides",
  "what": "a threshold's member admitted by a negation over what a hole left out counts as certain",
  "expect": {
   "agg_threshold_shrug": "st_ok4[main]()"
  }
 },
 {
  "id": "shrug_thr_bound_off",
  "what": "a threshold short of N under every completion stays a shrug",
  "expect": {
   "agg_threshold_shrug": "so_agree[main](many4)",
   "agg_threshold_holes": "aht_ntwo[main](d)"
  }
 },
 {
  "id": "nullary_compound_term",
  "what": "the Rust parser reads `p()` in argument position as a compound of no arguments, which no nullary atom is",
  "expect": {
   "agg_cell_shrug_wfs": "was to be refused"
  }
 },
 {
  "id": "shrug_paradox_root_off",
  "what": "the roots of what a hole left out name no paradox it also rests on",
  "expect": {
   "agg_cell_shrug_wfs": "shrug[$kernel](sw_mix,inherited,from($cons($rule(rea688f7c),$cons(sw_n0,$nil))))"
  }
 },
 {
  "id": "shrug_paradox_neg_off",
  "what": "a paradox read under not is no root of what a hole left out",
  "expect": {
   "agg_cell_shrug_wfs": "shrug[$kernel](sw_mix_not,inherited,from($cons($rule(rea688f7c),$cons(sw_n1,$nil))))"
  }
 },
 {
  "id": "shrug_thr_cosource_off",
  "what": "a threshold group left open names only the unknown that reached it last, not every member that is not certain",
  "expect": {
   "agg_threshold_shrug": "shrug[$kernel](st_mix3,inherited,from($cons($rule(r14d688e5),$cons($rule(r68485520),$nil))))"
  }
 },
 {
  "id": "shrug_thr_first_root",
  "what": "a threshold whose negation reads several unknowns names only the first",
  "expect": {
   "agg_threshold_shrug": "shrug[$kernel](st_both,inherited,from($cons($rule(r4652c90b),$cons($rule(r46aa4222),$nil))))"
  }
 },
 {
  "id": "shrug_thr_empty_undecided",
  "what": "a threshold group with no member under any completion stays a shrug instead of decided short",
  "expect": {
   "agg_threshold_shrug": "so_agree[main](acta)"
  }
 },
 {
  "id": "shrug_cycle_merged",
  "what": "a divergence's meta names every cell the cut found on any improving cycle, not the cells of its own",
  "expect": {
   "agg_sub_shrug_wall": "lacks the row",
   "agg_lattice_shrug_wall": "shrug[$kernel]($lattice(awn,main,0,$cons(x,$cons(y,$nil))),divergence,cycle($cons($lattice(awn,main,0,$cons(x,$cons(x,$nil))),$cons($lattice(awn,main,0,$cons(x,$cons(y,$nil))),$nil))))"
  }
 },
 {
  "id": "shrug_paradox_any_cycle",
  "what": "a paradox's meta names every relation below it on any cycle, a positive recursion included",
  "expect": {
   "agg_cell_shrug_wfs": "shrug[$kernel](sw_rwin(x),paradox,cycle($cons(sw_rwin,$nil)))"
  }
 },
 {
  "id": "shrug_wfs_history_kept",
  "what": "a fault met only under an over-estimate the alternation has left behind stays carried, so what the fixpoint decides is a shrug",
  "expect": {
   "agg_cell_shrug_wfs_history": "swh_g[main](z)"
  }
 },
 {
  "id": "shrug_late_unrefused",
  "what": "a shrug a rule reading shrug leaves, which such a rule could read, is left unread instead of refused",
  "expect": {
   "agg_cell_shrug": "agg-shrug-late-row.rofl was to be refused"
  }
 },
 {
  "id": "shrug_withdrawn_unrefused",
  "what": "a shrug row a rule reading shrug read, which that rule's own conclusion then withdrew, is let stand instead of refused",
  "expect": {
   "agg_cell_shrug": "agg-shrug-late-withdrawn.rofl was to be refused"
  }
 },
 {
  "id": "shrug_meta_late_unrefused",
  "what": "`unknown(A)` of what a rule reading unknown left out, which a negation of unknown could read, is left unread instead of refused",
  "expect": {
   "agg_cell_shrug": "agg-shrug-late-meta.rofl was to be refused"
  }
 },
 {
  "id": "shrug_wfs_upper_unrefused",
  "what": "`unknown(A)` of what the level reading unknown leaves undefined is read before it is written",
  "expect": {
   "agg_cell_shrug_wfs_upper": "agg-shrug-wfs-upper.rofl was to be refused"
  }
 },
 {
  "id": "shrug_edges_off",
  "what": "what an unknown was reached from is not kept: a shrug names no root, or the wrong one",
  "expect": {
   "agg_join_shrug": "the state lacks the row shrug[$kernel](sj_lacks(a),inherited",
   "agg_cell_shrug": "shrug[$kernel](sd_lose(c),inherited,from($cons($rule(r011bb866),$nil)))",
   "agg_lattice_shrug": "shrug[$kernel](sl_far(a,c),inherited",
   "agg_cell_shrug_ticks": "stk_was[main](stk_absent(q)"
  }
 },
 {
  "id": "shrug_whynot_as_failure",
  "what": "whynot of a shrug demonstrates failed premises as if it were unentailed",
  "expect": {
   "agg_cell_shrug_why": "sdw_shrugged[main](sd_lose(c))"
  }
 },
 {
  "id": "below_drops_shrugs",
  "what": "what the world below has no answer for is dropped, so it reads as false above",
  "expect": {
   "agg_cell_wfs": "wch_n"
  }
 },
 {
  "id": "shrug_given_off",
  "what": "an unknown row a book writes itself is a paradox with no cycle, as the alternating fixpoint's are",
  "expect": {
   "agg_cell_shrug_given": "shrug[$kernel](sg_said,given,stated)",
   "agg_cell_shrug_given_agg": "shrug[$kernel](sgc_said,given,stated)"
  }
 },
 {
  "id": "shrug_given_base_only",
  "what": "only an unknown row asserted as a fact is given; one a rule of a book concluded is a paradox",
  "expect": {
   "agg_cell_shrug_given": "shrug[$kernel](in(sg_book,sg_concl(b)),given,concluded)",
   "agg_cell_shrug_given_agg": "shrug[$kernel](in(sgc_book,sgc_concl(b)),given,concluded)"
  }
 },
 {
  "id": "shrug_given_wfs_unread",
  "what": "an atom the alternating fixpoint leaves undefined is given when a book also asserted its unknown row",
  "expect": {
   "agg_cell_shrug_given": "shrug[$kernel](sg_p,paradox,cycle($cons(sg_p,$cons(sg_q,$nil))))"
  }
 },
 {
  "id": "shrug_late_cut_refused",
  "what": "a wall that falls after a reader of shrug fired refuses the program over the wall's own row instead of cutting it short",
  "expect": {
   "agg_cell_shrug_given_cut": "shrug is read of $adhoc, which a rule that reads shrug leaves without an answer",
   "agg_cell_shrug_given_cut_agg": "shrug is read of $adhoc, which a rule that reads shrug leaves without an answer"
  }
 },
 {
  "id": "ts_agg_shrug_late_cut_refused",
  "what": "the TypeScript aggregate evaluator refuses a program a wall cut after a reader of shrug fired",
  "edits": [
   [
    "src/aggeval.ts",
    "const snap = cut ? null : this.shrugSnap;",
    "const snap = this.shrugSnap;"
   ]
  ],
  "expect": {
   "agg_cell_shrug_given_cut": "shrug is read of $adhoc, which a rule that reads shrug leaves without an answer",
   "agg_cell_shrug_given_cut_agg": "shrug is read of $adhoc, which a rule that reads shrug leaves without an answer"
  }
 },
 {
  "id": "ts_shrug_given_wfs_unread",
  "what": "the TypeScript evaluator calls an undefined atom given when a book also asserted its unknown row",
  "edits": [
   [
    "src/aggeval.ts",
    "if (!fed && !this.wfsWritten.has(f.key)) {",
    "if (!fed) {"
   ]
  ],
  "expect": {
   "agg_cell_shrug_given": "shrug[$kernel](sg_p,paradox,cycle($cons(sg_p,$cons(sg_q,$nil))))"
  }
 },
 {
  "id": "ts_agg_shrug_given_off",
  "what": "the TypeScript aggregate evaluator makes an unknown row a book writes itself a paradox",
  "edits": [
   [
    "src/aggeval.ts",
    "if (!fed && !this.wfsWritten.has(f.key)) {",
    "if (false) {"
   ]
  ],
  "expect": {
   "agg_cell_shrug_given": "shrug[$kernel](sg_said,given,stated)",
   "agg_cell_shrug_given_agg": "shrug[$kernel](sgc_said,given,stated)"
  }
 },
 {
  "id": "below_paradox_meta_off",
  "what": "a paradox fed from the world below is given the cycles of this world's rules, which have none",
  "expect": {
   "agg_cell_wfs": "shrug[$kernel](wg_win(a),paradox,below)"
  }
 },
 {
  "id": "ts_shrug_paradox_root_off",
  "what": "the TypeScript evaluator names no paradox among the roots of what a hole left out",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (this.latUnknown.size === 0) return;\n    const targetOf",
    "    return;\n    const targetOf"
   ]
  ],
  "expect": {
   "agg_cell_shrug_wfs": "shrug[$kernel](sw_mix,inherited,from($cons($rule(rea688f7c),$cons(sw_n0,$nil))))"
  }
 },
 {
  "id": "ts_shrug_paradox_neg_off",
  "what": "the TypeScript evaluator reads no paradox under not among the roots of what a hole left out",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (this.undefAtoms === null || !this.undefAtoms.has(l.rel)) return false;",
    "    if (this.undefAtoms === null || !this.undefAtoms.has(l.rel) || true) return false;"
   ]
  ],
  "expect": {
   "agg_cell_shrug_wfs": "shrug[$kernel](sw_mix_not,inherited,from($cons($rule(rea688f7c),$cons(sw_n1,$nil))))"
  }
 },
 {
  "id": "ts_shrug_meta_off",
  "what": "the TypeScript evaluator reads `unknown(A)` of what a hole left out as no row",
  "edits": [
   [
    "src/aggeval.ts",
    "if (this.readsUnknown && uRelOf(u) !== IFACE.unknown) this.metaQueue.push",
    "if (false && this.readsUnknown && uRelOf(u) !== IFACE.unknown) this.metaQueue.push"
   ]
  ],
  "expect": {
   "agg_cell_shrug": "sd_settled[main](c)",
   "agg_unknown_beside_hole": "aub_shrug[main](hu_decided(c))",
   "agg_unknown_beside_hole_strata": "aub_shrug[main](hu_decided(c))"
  }
 },
 {
  "id": "ts_shrug_rows_off",
  "what": "the TypeScript evaluator writes no shrug row",
  "edits": [
   [
    "src/aggeval.ts",
    "    for (const args of rows) this.store.add('shrug', KERNEL_PERSP, args, F_BASE_TICK);",
    "    void rows;"
   ]
  ],
  "expect": {
   "agg_cell_shrug_wfs": "shrug[$kernel](sw_win(x),paradox",
   "agg_cell_shrug_ticks": "stk_was[main]($next(stk_y"
  }
 },
 {
  "id": "ts_shrug_unknown_unranked",
  "what": "the TypeScript evaluator ranks what reads `unknown` among the rest",
  "edits": [
   [
    "src/aggeval.ts",
    "if ([...heads].some((h) => readsIn(h, new Set([un, sh])))) {",
    "if (false) {"
   ]
  ],
  "expect": {
   "agg_cell_shrug": "agg-shrug-late-meta.rofl was to be refused"
  }
 },
 {
  "id": "ts_shrug_rank_off",
  "what": "the TypeScript evaluator ranks what reads `unknown` by the table alone, below what it reads",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (this.unknownCone.size === 0) return;",
    "    return;"
   ]
  ],
  "expect": {
   "agg_cell_shrug_strata": "ss_ok[main](c)"
  }
 },
 {
  "id": "ts_shrug_structure_wild",
  "what": "the TypeScript engine matches any structure around an unknown value",
  "edits": [
   [
    "src/unify.ts",
    "  if (t.k === 'a' && t.name === '$unknown_value') return bindUnknown([a], s);",
    "  if (holdsUnknown(t)) return bindUnknown([a], s);"
   ]
  ],
  "expect": {
   "agg_cell_shrug": "sd_novel[main](b)"
  }
 },
 {
  "id": "ts_shrug_wfs_one_level",
  "what": "the TypeScript alternation runs a rule reading `unknown` in its one level",
  "edits": [
   [
    "src/aggeval.ts",
    "const twoLevels = this.unknownCone.size > 0;",
    "const twoLevels = false;"
   ]
  ],
  "expect": {
   "agg_cell_shrug_wfs": "sw_decided[main](x)",
   "wfs_unknown_negated": "wn_decided[main](x)"
  }
 },
 {
  "id": "ts_shrug_wfs_carry_reset",
  "what": "the TypeScript alternation forgets what holes left out at every round",
  "edits": [
   [
    "src/aggeval.ts",
    "      this.plainPending = [...carried];\n      const noted = this.latUnknown.size;",
    "      this.plainPending = [...carried];\n      this.wfsCarryReset();\n      const noted = this.latUnknown.size;"
   ],
   [
    "src/aggeval.ts",
    "const settled = sameKeys(next.recs, mean.recs) && this.latUnknown.size === noted;",
    "const settled = sameKeys(next.recs, mean.recs);"
   ]
  ],
  "expect": {
   "holes_negation_wfs": "unknown[main](hw_nx(c))"
  }
 },
 {
  "id": "ts_shrug_paradox_any_cycle",
  "what": "the TypeScript evaluator's paradox meta names every relation below it on any cycle, a positive recursion included",
  "edits": [
   [
    "src/aggeval.ts",
    "          if (n || strict) neg.push([h, t]);",
    "          neg.push([h, t]);"
   ]
  ],
  "expect": {
   "agg_cell_shrug_wfs": "shrug[$kernel](sw_rwin(x),paradox,cycle($cons(sw_rwin,$nil)))"
  }
 },
 {
  "id": "ts_shrug_wfs_history_kept",
  "what": "the TypeScript alternation keeps carrying a fault met only under an over-estimate it has left behind",
  "edits": [
   [
    "src/aggeval.ts",
    "      if (this.latUnknown.size === 0 || !moved) {",
    "      if (true || !moved) {"
   ]
  ],
  "expect": {
   "agg_cell_shrug_wfs_history": "swh_g[main](z)"
  }
 },
 {
  "id": "ts_shrug_late_unrefused",
  "what": "the TypeScript evaluator leaves a late shrug unread instead of refused",
  "edits": [
   [
    "src/aggeval.ts",
    "        if (readable) {",
    "        if (false && readable) {"
   ]
  ],
  "expect": {
   "agg_cell_shrug": "agg-shrug-late-row.rofl was to be refused"
  }
 },
 {
  "id": "ts_shrug_withdrawn_unrefused",
  "what": "the TypeScript evaluator lets a shrug row stand that a rule reading shrug read and then withdrew",
  "edits": [
   [
    "src/aggeval.ts",
    "      moved.push(...gone);",
    "      void gone;"
   ]
  ],
  "expect": {
   "agg_cell_shrug": "agg-shrug-late-withdrawn.rofl was to be refused"
  }
 },
 {
  "id": "ts_shrug_meta_late_unrefused",
  "what": "the TypeScript evaluator leaves a late `unknown(A)` unread instead of refused",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (this.metaLate !== null) {",
    "    if (false && this.metaLate !== null) {"
   ]
  ],
  "expect": {
   "agg_cell_shrug": "agg-shrug-late-meta.rofl was to be refused"
  }
 },
 {
  "id": "ts_shrug_wfs_upper_unrefused",
  "what": "the TypeScript alternation reads `unknown(A)` of what its upper level leaves undefined",
  "edits": [
   [
    "src/aggeval.ts",
    "        if (lits.some((l) => this.unknownBinds(l, u, new Map()) !== null)) {",
    "        if (false) {"
   ]
  ],
  "expect": {
   "agg_cell_shrug_wfs_upper": "agg-shrug-wfs-upper.rofl was to be refused"
  }
 },
 {
  "id": "ts_shrug_edges_off",
  "what": "the TypeScript evaluator keeps no edge from an unknown to what reached it",
  "edits": [
   [
    "src/aggeval.ts",
    "    this.unkEdges.push([nUnk(v), nUnk(from)]);",
    ""
   ]
  ],
  "expect": {
   "agg_cell_shrug": "shrug[$kernel](sd_lose(c),inherited,from($cons($rule(r011bb866),$nil)))"
  }
 },
 {
  "id": "ts_shrug_snapshot_off",
  "what": "the TypeScript evaluator fires a rule reading shrug before the rows are written",
  "edits": [
   [
    "src/aggeval.ts",
    "        if (this.shrugSnap === null && rs.some((r) => this.shrugReaders.has(r.id))) {",
    "        if (false) {"
   ]
  ],
  "expect": {
   "agg_cell_shrug": "sd_faulty[main]($rule(r011bb866))"
  }
 },
 {
  "id": "shrug_snapshot_off",
  "what": "a rule reading shrug fires before the rows are written",
  "expect": {
   "agg_cell_shrug": "sd_faulty[main]($rule(r011bb866))",
   "agg_threshold_shrug": "so_agree[main](ok4)"
  }
 },
 {
  "id": "shrug_standing_off",
  "what": "a volume cooled to disk is no shrug: a question about it answers empty",
  "expect": {
   "agg_cell_shrug": "shrug[$kernel]($cold(vol1),federation,at(vol1))"
  }
 },
 {
  "id": "ts_shrug_standing_off",
  "what": "the TypeScript evaluator reads no standing federation hole",
  "edits": [
   [
    "src/aggeval.ts",
    "      if (reasonOf(c.name) === 'federation' && !seenHoles.has(k)) {",
    "      if (false && reasonOf(c.name) === 'federation' && !seenHoles.has(k)) {"
   ]
  ],
  "expect": {
   "agg_cell_shrug": "shrug[$kernel]($cold(vol1),federation,at(vol1))"
  }
 },
 {
  "id": "join_set_unsorted",
  "what": "a set contribution is kept as written, unsorted and with its repeats, so one value has two spellings",
  "expect": {
   "agg_join_eval": "aj_missing"
  }
 },
 {
  "id": "join_iv_inverted",
  "what": "an interval whose low end is above its high end is taken as a value",
  "expect": {
   "agg_join_holes": "lacks the row"
  }
 },
 {
  "id": "union_left",
  "what": "the union of two sets is the first of them",
  "expect": {
   "agg_join_eval": "a consumer was not monotone"
  }
 },
 {
  "id": "hull_low_only",
  "what": "the hull of two intervals keeps the first one's high end",
  "expect": {
   "agg_join_eval": "a consumer was not monotone"
  }
 },
 {
  "id": "bitor_and",
  "what": "the bitset join is an and",
  "expect": {
   "agg_join_eval": "a consumer was not monotone"
  }
 },
 {
  "id": "in_iv_open_high",
  "what": "the members of an interval enumerated stop before its high end",
  "expect": {
   "agg_join_eval": "aj_read_missing"
  }
 },
 {
  "id": "in_iv_uncharged",
  "what": "the members of an interval are enumerated without a step each: the budget does not see them",
  "expect": {
   "agg_join_span_budget": "holds the row"
  }
 },
 {
  "id": "in_first_only",
  "what": "a membership test of a set reads its first element alone",
  "expect": {
   "agg_join_eval": "aj_missing"
  }
 },
 {
  "id": "join_read_unchecked",
  "what": "the right side of in and both sides of subset are read as spelled, not as values: an inverted interval or a negative bitset is silently false or true instead of set_type_error",
  "expect": {
   "agg_join_holes": "ajh_bad_silent"
  }
 },
 {
  "id": "subset_iv_low_only",
  "what": "an interval inside another is judged by the low ends alone",
  "expect": {
   "agg_join_eval": "aj_read_extra"
  }
 },
 {
  "id": "join_leq_reversed",
  "what": "a contribution is dropped when the cell is below it, not when it is below the cell",
  "expect": {
   "agg_join_eval": "a consumer was not monotone"
  }
 },
 {
  "id": "join_no_retire",
  "what": "a value the join widened stays an answer beside the value that replaced it",
  "expect": {
   "agg_join_eval": "is not below its cell"
  }
 },
 {
  "id": "join_cover_text_order",
  "what": "a Cover takes the contributions in the order of their text, not their height",
  "expect": {
   "agg_join_witness": "ajw_missing"
  }
 },
 {
  "id": "join_cover_every",
  "what": "a Cover takes every contribution that stands, and only then drops the redundant",
  "expect": {
   "agg_join_witness": "ajw_missing"
  }
 },
 {
  "id": "join_cover_redundant",
  "what": "a Cover keeps a contribution the others already count in full",
  "expect": {
   "agg_join_witness": "ajw_redundant"
  }
 },
 {
  "id": "join_self_firing_kept",
  "what": "a Cover's contribution keeps the firing that reads the cell itself",
  "expect": {
   "agg_join_why": "lacks the row aj_comp@join[main](s,set(s)) tick drv support=1"
  }
 },
 {
  "id": "join_cycle_named",
  "what": "at a wall a join cell reached from its own earlier value is withdrawn as a divergence",
  "expect": {
   "agg_join_budget": "lacks the row",
   "agg_join_shrug_wall": "holds the row"
  }
 },
 {
  "id": "join_hole_keeps_contributions",
  "what": "a holed join cell keeps its contributions",
  "expect": {
   "agg_join_holes": "holds the row"
  }
 },
 {
  "id": "join_why_ghost_unmarked",
  "what": "why prints a value the join widened as if it were the cell's value",
  "expect": {
   "agg_join_why": "ajy_text_missing"
  }
 },
 {
  "id": "join_why_one_member",
  "what": "why of a join fact prints the first contribution of its Cover alone",
  "expect": {
   "agg_join_why": "ajy_text_missing"
  }
 },
 {
  "id": "set_literal_as_written",
  "what": "a ground set a program writes is kept as written, so a body pattern, an `=`, a plain fact and an explain request each name a spelling and not a value",
  "expect": {
   "agg_join_eval": "aj_spelling_missing",
   "agg_join_why": "ajy_text_missing",
   "set_spelling": "ss_extra"
  }
 },
 {
  "id": "set_pattern_admitted",
  "what": "a set written with a variable is admitted wherever it stands, and matches or is stored by the order its variables fall in",
  "expect": {
   "agg_join_safety": "was to be refused",
   "set_spelling": "was to be refused"
  }
 },
 {
  "id": "join_value_unchecked",
  "what": "a join's value slot in a body takes any term, so `r(k, oops)` of a union is a silent false",
  "expect": {
   "agg_join_safety": "was to be refused"
  }
 },
 {
  "id": "ts_set_literal_as_written",
  "what": "the TypeScript engine keeps a ground set as written, so one set held in a plain relation is several facts",
  "edits": [
   [
    "src/unify.ts",
    "  if (!hasSet(t) || t.k !== 'f') return t;",
    "  if (true) return t;"
   ]
  ],
  "expect": {
   "set_spelling": "ss_extra"
  }
 },
 {
  "id": "ts_set_pattern_admitted",
  "what": "the TypeScript engine admits a set written with a variable",
  "edits": [
   [
    "src/unify.ts",
    "  if (t.name === 'set' && t.args.length > 1 && !isGround(t)) return t;",
    ""
   ]
  ],
  "expect": {
   "set_spelling": "was to be refused"
  }
 },
 {
  "id": "join_whynot_below",
  "what": "whynot of a value below the cell's says it would widen the cell",
  "expect": {
   "agg_join_why": "ajy_text_missing"
  }
 },
 {
  "id": "lattice_join_unread",
  "what": "the Rust parser reads no join in a lattice declaration",
  "expect": {
   "agg_join_syntax": "does not evaluate"
  }
 },
 {
  "id": "word_ops_is_only",
  "what": "the Rust parser reads `in` and `subset` as no operators",
  "expect": {
   "agg_join_syntax": "does not evaluate"
  }
 },
 {
  "id": "join_not_idempotent",
  "what": "safety.rofl does not count union among the idempotent operations: a union lattice is refused",
  "edits": [
   [
    "safety.rofl",
    "idempotent_op(union).\n",
    ""
   ]
  ],
  "expect": {
   "agg_join_strata": "does not evaluate"
  }
 },
 {
  "id": "join_read_refused",
  "what": "safety.rofl counts no membership or subset among a join's monotone reads",
  "edits": [
   [
    "safety.rofl",
    "lat_ok(R, K, X, J, right) :- lat_mv(R, K, X, M), join_move(M),\n                             premise_lit(R, J, $builtin(Op, $cons(_, $cons($var(X), $nil)))),\n                             join_read(Op), not lat_left_dirty(R, K, J).\n",
    ""
   ]
  ],
  "expect": {
   "agg_join_safety": "does not evaluate",
   "agg_join_eval": "does not evaluate"
  }
 },
 {
  "id": "join_arith_step",
  "what": "safety.rofl lets arithmetic carry a join's value into its head",
  "edits": [
   [
    "safety.rofl",
    "lat_step(R, K, Y, J, X, M)  :- lat_mv(R, K, Y, M), order_move(M), premise_arith(R, J, $var(X), \"+\", $var(Y), E), lat_clean(R, K, E).",
    "lat_step(R, K, Y, J, X, M)  :- lat_mv(R, K, Y, M), premise_arith(R, J, $var(X), \"+\", $var(Y), E), lat_clean(R, K, E)."
   ]
  ],
  "expect": {
   "agg_join_safety": "was to be refused"
  }
 },
 {
  "id": "in_binds_nothing",
  "what": "safety.rofl reads no binding in `E in S`: a membership that enumerates is not range-restricted",
  "edits": [
   [
    "safety.rofl",
    "binds_at(R, K, V) :- premise_lit(R, K, $builtin(\"in\", _)), ground(R, K, right),\n                     premise_var(R, K, left, _, V).\n",
    ""
   ]
  ],
  "expect": {
   "agg_join_eval": "does not evaluate"
  }
 },
 {
  "id": "join_moves_shared",
  "what": "safety.rofl moves a hull's value as a set's: one carrier's value into another's head",
  "edits": [
   [
    "safety.rofl",
    "better_move(hull, grow_iv).",
    "better_move(hull, grow_set)."
   ]
  ],
  "expect": {
   "agg_join_safety": "was to be refused"
  }
 },
 {
  "id": "ring1_join_unread",
  "what": "ring 1 reads no join in a lattice declaration",
  "edits": [
   [
    "examples/ring1/ring1.rofl",
    "latop(I, J, Op) :- identtok(I, J), tok_name(I, J, Op), lat_word(Op).\n",
    ""
   ]
  ],
  "expect": {
   "agg_join_syntax": "ring1_missing"
  }
 },
 {
  "id": "ring1_in_unread",
  "what": "ring 1 reads no `in` operator",
  "edits": [
   [
    "examples/ring1/ring1.rofl",
    "optok(I, J, in)     :- kw_in(I), word(I, J).\n",
    ""
   ]
  ],
  "expect": {
   "agg_join_syntax": "ring1_missing"
  }
 },
 {
  "id": "widen_unread",
  "what": "the Rust parser does not read `widen N` after a lattice declaration",
  "expect": {
   "agg_widen_syntax": "does not evaluate"
  }
 },
 {
  "id": "widen_row_late",
  "what": "a declared widening is written as one improvement more than declared",
  "expect": {
   "agg_widen_syntax": "sxw_missing",
   "agg_widen_reflect": "awr_missing"
  }
 },
 {
  "id": "widen_row_unread",
  "what": "safety.rofl is not given the `lattice_widen` rows, so no cycle is widened",
  "expect": {
   "agg_widen_safety": "does not evaluate",
   "agg_widen_strata": "does not evaluate"
  }
 },
 {
  "id": "widen_late",
  "what": "a cell is widened only after N + 1 improvements",
  "expect": {
   "agg_widen_eval": "awe_unwidened",
   "agg_widen_witness": "aww_missing"
  }
 },
 {
  "id": "widen_never",
  "what": "a declared widening is never applied: the join alone",
  "expect": {
   "agg_widen_budget": "lacks the row"
  }
 },
 {
  "id": "widen_unmarked",
  "what": "a widened value is held as a fact, with no hole and no shrug",
  "expect": {
   "agg_widen_eval": "do not join to it",
   "agg_widen_holes": "lacks the row"
  }
 },
 {
  "id": "widen_both_ends",
  "what": "a widening sends both ends to their infinities, moved or not",
  "expect": {
   "agg_widen_eval": "awe_unwidened"
  }
 },
 {
  "id": "widen_meta_first",
  "what": "a widened shrug's meta names the value of its first widening, not the one it closed on",
  "expect": {
   "agg_widen_shrug": "awg_nonneg_wrong",
   "agg_widen_witness": "aww_meta_wrong"
  }
 },
 {
  "id": "widen_why_one_step",
  "what": "why of a widened cell shows its first widening only",
  "expect": {
   "agg_widen_witness": "aww_wrong_steps"
  }
 },
 {
  "id": "join_fault_unexcused",
  "what": "a join contribution read from a value since improved on is a defect even when its rule's firing on the value that replaced it faulted",
  "expect": {
   "agg_widen_holes": "a consumer was not monotone"
  }
 },
 {
  "id": "refire_fault_unexcused",
  "what": "a fact concluded from a value since improved on is a defect even when its rule's firing on the value that replaced it faulted",
  "expect": {
   "agg_widen_holes": "a consumer was not monotone"
  }
 },
 {
  "id": "widen_fault_both",
  "what": "a widened cell that also takes a fault is holed twice, the widening after the fault kept with no value",
  "expect": {
   "agg_widen_holes": "kept no value"
  }
 },
 {
  "id": "widen_cut_encloses",
  "what": "a cell widened before a wall stops its recursion is written a widened shrug, within a value never checked to enclose the least one",
  "expect": {
   "agg_widen_cut": "holds the row"
  }
 },
 {
  "id": "widen_counts_base",
  "what": "every improvement counts toward a widening, contributions from below the recursion included",
  "expect": {
   "agg_widen_eval": "lacks the row"
  }
 },
 {
  "id": "iv_operand_unchecked",
  "what": "an interval operand with Lo above Hi is taken as a value",
  "expect": {
   "agg_widen_holes": "holds the row"
  }
 },
 {
  "id": "widen_whynot_bare",
  "what": "whynot of a widened cell names its hole and not its widening",
  "expect": {
   "agg_widen_why": "awy_text_missing"
  }
 },
 {
  "id": "widen_why_root_bare",
  "what": "why of a shrug resting on a widened cell names the root and not its widening",
  "expect": {
   "agg_widen_why": "awy_text_missing",
   "agg_widen_witness": "aww_missing"
  }
 },
 {
  "id": "widen_steps_carried",
  "what": "a cell's improvements are counted across ticks, not in each",
  "expect": {
   "agg_widen_ticks": "lacks the row tw_c"
  }
 },
 {
  "id": "ivsub_same_ends",
  "what": "ivsub subtracts the high end from both ends",
  "expect": {
   "agg_widen_eval": "awe_fn_wrong"
  }
 },
 {
  "id": "ivmeet_keeps_high",
  "what": "ivmeet keeps its first operand's high end",
  "expect": {
   "agg_widen_eval": "lacks the row aw_short"
  }
 },
 {
  "id": "iv_overflow_typed",
  "what": "an interval end past the term range is a type error, not an overflow",
  "expect": {
   "agg_widen_holes": "lacks the row"
  }
 },
 {
  "id": "in_iv_unbounded_walked",
  "what": "the members of an interval with an infinite end are walked one by one",
  "expect": {
   "agg_widen_budget": "lacks the row hole[$kernel]($rule(rd3b23df3),unbounded_members)"
  }
 },
 {
  "id": "widen_cycle_unchecked",
  "what": "safety.rofl lets an interval function run round a cycle no widening bounds",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, lattice_unwidened) :- lat_iv_step(R, K), lat_inner(R, K, P), concludes(R, H), unw_reach(P, H).\nagg_refused(R, lattice_unwidened) :- lat_iv_step(R, K), lat_inner(R, K, H), concludes(R, H), not lat_widened(H).\n",
    ""
   ]
  ],
  "expect": {
   "agg_widen_safety": "was to be refused"
  }
 },
 {
  "id": "widen_any_lattice",
  "what": "safety.rofl lets a union or an order lattice declare a widening",
  "edits": [
   [
    "safety.rofl",
    "lattice_refused(P, widen_not_hull) :- lattice_widen(P, _), lat_op(P, Op), not widenable(Op).\n",
    ""
   ]
  ],
  "expect": {
   "agg_widen_safety": "was to be refused"
  }
 },
 {
  "id": "widen_two_admitted",
  "what": "safety.rofl lets one relation declare two widenings",
  "edits": [
   [
    "safety.rofl",
    "lattice_refused(P, two_widenings)  :- lattice_widen(P, A), lattice_widen(P, B), A != B.\n",
    ""
   ]
  ],
  "expect": {
   "agg_widen_safety": "was to be refused"
  }
 },
 {
  "id": "iv_step_off",
  "what": "safety.rofl counts no interval function among a hull's monotone steps",
  "edits": [
   [
    "safety.rofl",
    "lat_step(R, K, Y, J, X, grow_iv) :- lat_mv(R, K, Y, grow_iv), premise_arith(R, J, $var(X), Op, $var(Y), E),\n                                    iv_op(Op), lat_clean(R, K, E).\n",
    ""
   ]
  ],
  "expect": {
   "agg_widen_safety": "does not evaluate",
   "agg_widen_eval": "does not evaluate"
  }
 },
 {
  "id": "iv_mul_either",
  "what": "safety.rofl lets ivmul take the value as its multiplier",
  "edits": [
   [
    "safety.rofl",
    "                                    iv_op(Op), Op != \"ivmul\", lat_clean(R, K, E).\n",
    "                                    iv_op(Op), lat_clean(R, K, E).\n"
   ]
  ],
  "expect": {
   "agg_widen_safety": "was to be refused"
  }
 },
 {
  "id": "ring1_widen_unread",
  "what": "ring 1 reads no `widen N` after a lattice declaration",
  "edits": [
   [
    "examples/ring1/ring1.rofl",
    "  nexttok(E, C), p(C, rpar), nexttok(C, W), identtok(W, W2), tok_name(W, W2, widen),\n",
    "  nexttok(E, C), p(C, rpar), nexttok(C, W), identtok(W, W2), tok_name(W, W2, widened),\n"
   ]
  ],
  "expect": {
   "agg_widen_syntax": "ring1_missing"
  }
 },
 {
  "id": "narrow_off",
  "what": "no descending pass is made: a widened cell closes on the value the widening left",
  "expect": {
   "agg_interval_demo": "ivc_wrong",
   "agg_narrow_eval": "ann_wrong",
   "agg_narrow_why": "anw_missing",
   "agg_widen_eval": "awe_unwidened"
  }
 },
 {
  "id": "narrow_once",
  "what": "a single descending pass is made, not up to four",
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "narrow_more",
  "what": "five descending passes are made, not four",
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "narrow_overshoot",
  "what": "a narrowed high end comes down one below the join of what the rules contribute",
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "narrow_fresh_first",
  "what": "what the rules contribute to a widened cell from its value is the first contribution, not their join",
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "narrow_meta_stale",
  "what": "a narrowed cell's shrug names the value the widening closed on, not the narrowed one",
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "narrow_why_bare",
  "what": "why and whynot of a narrowed cell show its widenings and not its narrowing",
  "expect": {
   "agg_narrow_why": "anw_missing"
  }
 },
 {
  "id": "narrow_fault_ignored",
  "what": "a rule that faulted in the descent is no reason to leave its recursion's cells as they were",
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "descent_wall",
  "what": "a wall in the descending pass, which the first pass did not meet: the widened result stands, un-narrowed",
  "expect": {
   "agg_narrow_eval": "ann_extra"
  }
 },
 {
  "id": "descent_closes_other",
  "what": "the evaluation after the descent closes a widened cell on another value: the widened result stands, un-narrowed",
  "expect": {
   "agg_narrow_eval": "ann_extra"
  }
 },
 {
  "id": "descent_fatal",
  "what": "a defect in the descending pass fails the run instead of leaving the widened result",
  "expect": {
   "agg_narrow_eval": "does not evaluate"
  }
 },
 {
  "id": "ts_descent_wall",
  "what": "a wall in the TypeScript descending pass: the widened result stands, un-narrowed",
  "edits": [
   [
    "src/aggeval.ts",
    "      this.narrowDescend();\n      out = this.runPass();",
    "      throw new Wall('budget_exhausted');\n      out = this.runPass();"
   ]
  ],
  "expect": {
   "agg_narrow_eval": "ann_extra"
  }
 },
 {
  "id": "ts_descent_closes_other",
  "what": "the TypeScript evaluation after the descent closes a widened cell on another value: the widened result stands",
  "edits": [
   [
    "src/aggeval.ts",
    "w === undefined || !teq(w[1], x)",
    "true"
   ]
  ],
  "expect": {
   "agg_narrow_eval": "ann_extra"
  }
 },
 {
  "id": "ts_descent_fatal",
  "what": "a defect in the TypeScript descending pass fails the run",
  "edits": [
   [
    "src/aggeval.ts",
    "      this.narrowDescend();\n      out = this.runPass();",
    "      throw new Bug('descent');\n      out = this.runPass();"
   ],
   [
    "src/aggeval.ts",
    "if (!(e instanceof Wall || e instanceof Bug || e instanceof Rejected)) throw e;",
    "throw e;"
   ]
  ],
  "expect": {
   "agg_narrow_eval": "does not evaluate"
  }
 },
 {
  "id": "roots_of_cycle_off",
  "what": "the roots of a cycle nothing outside reached are none, where they are the faults that began it",
  "expect": {
   "agg_widen_holes": "awh_rootless"
  }
 },
 {
  "id": "ts_roots_of_cycle_off",
  "what": "the TypeScript roots of a cycle nothing outside reached are none",
  "edits": [
   [
    "src/aggeval.ts",
    "        if (roots.length === 0) {\n          const holes",
    "        if (roots.length === 0 && false) {\n          const holes"
   ]
  ],
  "expect": {
   "agg_widen_holes": "awh_rootless"
  }
 },
 {
  "id": "ts_narrow_off",
  "what": "the TypeScript engine makes no descending pass",
  "edits": [
   [
    "src/aggeval.ts",
    "for (let pass = 0; pass < NARROW_PASSES; pass++) {",
    "for (let pass = 0; pass < 0; pass++) {"
   ]
  ],
  "expect": {
   "agg_interval_demo": "ivc_wrong",
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "ts_narrow_once",
  "what": "the TypeScript engine makes a single descending pass",
  "edits": [
   [
    "src/aggeval.ts",
    "for (let pass = 0; pass < NARROW_PASSES; pass++) {",
    "for (let pass = 0; pass < 1; pass++) {"
   ]
  ],
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "ts_narrow_more",
  "what": "the TypeScript engine makes five descending passes",
  "edits": [
   [
    "src/aggeval.ts",
    "const NARROW_PASSES = 4;",
    "const NARROW_PASSES = 5;"
   ]
  ],
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "ts_narrow_overshoot",
  "what": "the TypeScript engine narrows a high end one below the join of what the rules contribute",
  "edits": [
   [
    "src/cell.ts",
    "fresh[1] < x[1] ? fresh[1] : x[1]]",
    "fresh[1] < x[1] ? fresh[1] - 1n : x[1]]"
   ]
  ],
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "ts_narrow_fresh_first",
  "what": "the TypeScript engine takes the first contribution for what the rules contribute to a widened cell",
  "edits": [
   [
    "src/aggeval.ts",
    "nr.fresh.set(ck.id, f);",
    "nr.fresh.set(ck.id, held ?? f);"
   ]
  ],
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "ts_narrow_meta_stale",
  "what": "the TypeScript engine's narrowed shrug names the value the widening closed on",
  "edits": [
   [
    "src/aggeval.ts",
    "[no !== undefined ? no[1] : value, this.latWidened",
    "[value, this.latWidened"
   ]
  ],
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 },
 {
  "id": "ts_narrow_why_bare",
  "what": "the TypeScript engine's why shows no narrowing step",
  "edits": [
   [
    "src/aggeval.ts",
    "for (const [before, fresh, after] of narrowed) out.push(",
    "for (const [before, fresh, after] of [] as Term[][]) out.push("
   ]
  ],
  "expect": {
   "agg_narrow_why": "anw_missing"
  }
 },
 {
  "id": "ts_narrow_fault_ignored",
  "what": "the TypeScript engine narrows the cells of a recursion a rule faulted in",
  "edits": [
   [
    "src/aggeval.ts",
    "if (met.length > 0) {",
    "if (false) {"
   ]
  ],
  "expect": {
   "agg_narrow_eval": "ann_wrong"
  }
 }
,
 {
  "id": "tag_counting_idempotent",
  "what": "counting is flagged idempotent, so the recursion gate lets a counting tag recurse",
  "expect": {
   "agg_tagc_strata": "refused, but not for"
  }
 },
 {
  "id": "tropical_max",
  "what": "a tropical tag keeps the largest cost, not the least",
  "expect": {
   "agg_tag_shrug_wall": "lacks the row",
   "agg_tag_budget": "holds the row",
   "agg_tag_bounded": "holds the row"
  }
 },
 {
  "id": "tag_carrier_open",
  "what": "viterbi and trust take any integer, off the carrier or not",
  "expect": {
   "agg_tag_shrug": "tsg_fault_wrong",
   "agg_tag_holes": "holds the row"
  }
 },
 {
  "id": "viterbi_rounds_up",
  "what": "viterbi's product rounds up, not down",
  "expect": {
   "agg_tag_eval": "tge_missing",
   "agg_tag_demo": "tgd_differs"
  }
 },
 {
  "id": "trust_max",
  "what": "trust's ⊗ is max, not min: a chain as trusted as its strongest link",
  "expect": {
   "agg_tag_eval": "tge_missing",
   "agg_tag_demo": "tgd_differs"
  }
 },
 {
  "id": "tag_unread",
  "what": "the Rust parser does not read a tag declaration",
  "expect": {
   "agg_tag_syntax": "does not evaluate"
  }
 },
 {
  "id": "tag_arity_short",
  "what": "a tag declaration is written one argument short",
  "expect": {
   "agg_tag_reflect": "does not evaluate"
  }
 },
 {
  "id": "tag_lattice_admitted",
  "what": "a relation both tagged and declared a lattice is admitted",
  "expect": {
   "agg_tag_safety": "was to be refused",
   "agg_tagc_safety": "was to be refused"
  }
 },
 {
  "id": "tag_times_skipped",
  "what": "⊗ runs through no premise: a firing's tag is its weight alone",
  "expect": {
   "agg_tag_ticks": "tkc_wrong",
   "agg_tag_witness": "tgw_missing",
   "agg_tag_eval": "tge_missing",
   "agg_tagc_eval": "tce_missing"
  }
 },
 {
  "id": "count_firing_rule_only",
  "what": "a counting derivation is named by its rule alone, so two firings of one rule with one count are one",
  "expect": {
   "agg_tagc_witness": "tcw_total_wrong",
   "agg_tagc_eval": "tce_missing"
  }
 },
 {
  "id": "count_firing_premises_only",
  "what": "a counting derivation is named by its positive premises' variables alone, so the solutions of a generator or an aggregate's groups that share every premise are one",
  "expect": {
   "agg_tagc_eval": "tcb_missing"
  }
 },
 {
  "id": "decl_row_skipped",
  "what": "a lattice_decl or tag_decl row of no declaration's shape (arity 0) is skipped, and its relation runs plain",
  "expect": {
   "agg_lattice_safety": "was to be refused",
   "agg_tag_safety": "was to be refused"
  }
 },
 {
  "id": "tag_alg_unknown_skipped",
  "what": "a tag_decl row naming no semiring is skipped, and its relation runs plain",
  "expect": {
   "agg_tag_safety": "was to be refused"
  }
 },
 {
  "id": "count_demand_admitted",
  "what": "a counting tag whose rule leaves a head key unbound is admitted, and answers with a shrug that names no reason",
  "expect": {
   "agg_tagc_safety": "was to be refused"
  }
 },
 {
  "id": "count_folds_max",
  "what": "a counting tag keeps its largest derivation instead of the sum",
  "expect": {
   "agg_tagc_ticks": "tkn_wrong",
   "agg_tagc_witness": "tcw_value_wrong",
   "agg_tagc_eval": "tce_missing",
   "agg_tag_demo": "tgd_differs"
  }
 },
 {
  "id": "tag_judged_as_written",
  "what": "safety.rofl judges a tag's rules as written, not as they run",
  "expect": {
   "agg_tag_eval": "tge_missing"
  }
 },
 {
  "id": "tag_asserted",
  "what": "an asserted fact in a tag is admitted",
  "expect": {
   "agg_tag_safety": "refused, but not for",
   "agg_tagc_safety": "was to be refused"
  }
 },
 {
  "id": "counting_recursion_admitted",
  "what": "a counting tag inside its own recursion is not refused as a tag",
  "expect": {
   "agg_tagc_strata": "refused, but not for"
  }
 },
 {
  "id": "wfs_admits_tag",
  "what": "a tag under well-founded semantics is not refused as a tag",
  "expect": {
   "agg_tag_wfs": "refused, but not for"
  }
 },
 {
  "id": "why_cell_id_off",
  "what": "why writes two different cells under one header with nothing to tell them apart",
  "expect": {
   "agg_why_dag_cells": "dgc_missing"
  }
 },
 {
  "id": "why_dag_off",
  "what": "why writes a fact it has written out already in full again, as a tree and not a DAG",
  "expect": {
   "agg_why_dag": "dg_twice"
  }
 },
 {
  "id": "why_dag_cell_off",
  "what": "why writes an aggregate's cell it has written out already in full again",
  "expect": {
   "agg_why_dag": "dg_text_missing"
  }
 },
 {
  "id": "whynot_dag_off",
  "what": "whynot demonstrates a ground literal it has demonstrated already again",
  "expect": {
   "agg_why_dag": "dg_text_missing"
  }
 },
 {
  "id": "count_why_plain",
  "what": "why renders a counting tag's fact as a plain one, not as the sum of its derivations",
  "expect": {
   "agg_tagc_why": "tcy_text_missing"
  }
 },
 {
  "id": "count_whynot_plain",
  "what": "whynot of a counting tag's other count does not say what it holds",
  "expect": {
   "agg_tagc_why": "tcy_text_missing"
  }
 },
 {
  "id": "count_unranked",
  "what": "the stock evaluator does not rank the relation of a counting tag's derivations",
  "expect": {
   "agg_tagc_strata_stock": "does not evaluate"
  }
 },
 {
  "id": "tag_step_off",
  "what": "safety.rofl reads no viterbi ⊗ as a monotone step",
  "edits": [
   [
    "safety.rofl",
    "tag_step(\"$viterbi\").\n",
    ""
   ]
  ],
  "expect": {
   "agg_tag_strata": "does not evaluate",
   "agg_tag_eval": "does not evaluate"
  }
 },
 {
  "id": "ring1_tag_unread",
  "what": "ring 1 reads no tag declaration",
  "edits": [
   [
    "examples/ring1/ring1.rofl",
    "  identtok(I, I2), tok_name(I, I2, tag), nexttok(I2, K), identtok(K, K2), not keyword(K),\n",
    "  identtok(I, I2), tok_name(I, I2, tagged), nexttok(I2, K), identtok(K, K2), not keyword(K),\n"
   ]
  ],
  "expect": {
   "agg_tag_syntax": "ring1_missing"
  }
 },
 {
  "id": "strata_counting_unranked",
  "what": "rules/strata.rofl ranks a counting tag with what its rules read, not above it",
  "edits": [
   [
    "rules/strata.rofl",
    "dep_neg(A, B)      :- counting_tag(A), concludes(R, A), conclusion_tense(R, now), premise_pos(R, B).\n",
    ""
   ]
  ],
  "expect": {
   "agg_tagc_strata_stock": "tcst_below"
  }
 },
 {
  "id": "count_carrier_open",
  "what": "a counting weight of 0 or below is taken as a count",
  "expect": {
   "agg_tagc_holes": "holds the row",
   "agg_tagc_shrug": "tcg_unfaulted"
  }
 },
 {
  "id": "tag_label_lattice",
  "what": "why and whynot name a tag the lattice of its ⊕, not the tag it is",
  "expect": {
   "agg_tag_why": "tgy_text_missing"
  }
 },
 {
  "id": "ts_tag_admitted",
  "what": "the TypeScript engine does not refuse a tag under well-founded semantics as a tag",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (tagged !== undefined) throw new Rejected(",
    "    if (tagged === '') throw new Rejected("
   ]
  ],
  "expect": {
   "agg_tag_ts": "refused, but not for"
  }
 },
 {
  "id": "dominance_unread",
  "what": "the Rust parser reads no dominance rule: `<=` after a head is a clause with no closing dot",
  "expect": {
   "agg_sub_syntax": "does not evaluate"
  }
 },
 {
  "id": "dominance_key_long",
  "what": "a dominance rule is reflected with a key one longer than the prefix its two facts share",
  "expect": {
   "agg_sub_reflect": "does not evaluate",
   "agg_sub_eval": "does not evaluate"
  }
 },
 {
  "id": "dominance_lits_swapped",
  "what": "a dominance rule is reflected with its two facts swapped: the dominator is taken for the dominated",
  "expect": {
   "agg_sub_reflect": "cut by the budget",
   "agg_sub_eval": "cut by the budget"
  }
 },
 {
  "id": "dominance_as_rule",
  "what": "a dominance rule is reflected as a rule too, concluding its dominated fact",
  "expect": {
   "agg_sub_reflect": "asr_as_rule"
  }
 },
 {
  "id": "dominance_row_unread",
  "what": "safety.rofl is not given the dominance rows, so a subsumptive relation is no cell there: its recursion unjudged, its outer reads not strict",
  "expect": {
   "agg_sub_safety": "was to be refused",
   "agg_sub_strata": "refused, but not for"
  }
 },
 {
  "id": "dominance_keep_dominated",
  "what": "a value a standing one dominates joins the front anyway",
  "expect": {
   "agg_sub_eval": "cut by the budget",
   "agg_sub_demo": "cut by the budget"
  }
 },
 {
  "id": "dominance_no_retire",
  "what": "a value the new one dominates stays an answer beside it",
  "expect": {
   "agg_sub_eval": "asv_shrug",
   "agg_sub_demo": "asd_shrug"
  }
 },
 {
  "id": "dominance_consequences_kept",
  "what": "what a dominated value concluded inside the recursion is kept, and so a copy of a dominated value is an answer",
  "expect": {
   "agg_sub_eval": "does not evaluate",
   "agg_sub_safety": "refused, but not for"
  }
 },
 {
  "id": "dominance_nonmonotone_is_bug",
  "what": "a consumer not monotone in the dominance is reported as the engine's defect, not refused as the program's",
  "expect": {
   "agg_sub_safety": "refused, but not for"
  }
 },
 {
  "id": "dominance_unchecked",
  "what": "the close does not check the front against every value given: a dominance with no transitivity keeps a front",
  "expect": {
   "agg_sub_shrug": "asgs_missing",
   "agg_sub_witness": "asw_missing"
  }
 },
 {
  "id": "dominance_by_last",
  "what": "a value given is named with the last member that dominates it, not the first in canonical order",
  "expect": {
   "agg_sub_witness": "asw_missing"
  }
 },
 {
  "id": "dominance_conflict_ignored",
  "what": "a dominance that is no strict partial order is not a conflict: its cells keep what they reached",
  "expect": {
   "agg_sub_shrug": "asgs_missing"
  }
 },
 {
  "id": "shrug_conflict_parties_off",
  "what": "a conflict shrug's meta is its cause, not the values in conflict",
  "expect": {
   "agg_sub_shrug": "asgs_missing"
  }
 },
 {
  "id": "dominance_fault_is_no",
  "what": "a dominance body that fails for an error answers no: the cell keeps a front that is not known",
  "expect": {
   "agg_sub_holes": "lacks the row"
  }
 },
 {
  "id": "dominance_unknown_decides",
  "what": "a dominance body that reads what a hole left unknown decides as if it were absent",
  "expect": {
   "agg_sub_holes": "lacks the row"
  }
 },
 {
  "id": "dominance_hole_keeps_front",
  "what": "a holed subsumptive cell keeps its front",
  "expect": {
   "agg_sub_budget": "holds the row",
   "agg_sub_holes": "holds the row",
   "agg_sub_shrug": "holds the row"
  }
 },
 {
  "id": "dominance_edge_positive",
  "what": "what a dominance body reads is a positive edge, so a value may be compared before it is closed",
  "expect": {
   "agg_sub_strata": "assc_extra",
   "agg_sub_eval": "asv_extra"
  }
 },
 {
  "id": "dominance_rules_early",
  "what": "the rules of a subsumptive relation whose dominance reads a relation fire in phase A, before that relation is closed",
  "expect": {
   "agg_sub_strata": "assc_extra",
   "agg_sub_eval": "asv_extra"
  }
 },
 {
  "id": "demand_strict_mono",
  "what": "a monotone rule whose demand premise unfolds into a negation fires in phase A, reading the negated relation before its round",
  "expect": {
   "demand_neg_round": "dn_wrong"
  }
 },
 {
  "id": "ts_demand_strict_mono",
  "what": "the TypeScript engine fires a monotone rule whose demand premise unfolds into a negation in phase A",
  "edits": [
   [
    "src/aggeval.ts",
    "|| r.latticeOuter.length > 0 || r.demandStrict;",
    "|| r.latticeOuter.length > 0;"
   ]
  ],
  "expect": {
   "demand_neg_round": "dn_wrong"
  }
 },
 {
  "id": "demand_strict_refire",
  "what": "the retraction fires a rule whose demand premise unfolds into a negation with the monotone rules, before what the negation reads is derived again",
  "expect": {
   "demand_neg_retract": "dt_wrong"
  }
 },
 {
  "id": "shrug_demand_unread",
  "what": "a rule that reads shrug only through a relation answered on demand is not counted a shrug reader and fires before the shrugs",
  "expect": {
   "demand_shrug_read": "ds_missed"
  }
 },
 {
  "id": "ts_shrug_demand_unread",
  "what": "the TypeScript engine does not count a rule that reads shrug through a relation answered on demand a shrug reader",
  "edits": [
   [
    "src/aggeval.ts",
    "if (!via.has(rel) && rs.some(",
    "if (false && rs.some("
   ]
  ],
  "expect": {
   "demand_shrug_read": "ds_missed"
  }
 },
 {
  "id": "demand_neg_unholed",
  "what": "a negation unfolded at a call reads what a hole left unknown as absent",
  "expect": {
   "demand_neg_hole": "dh_wrong"
  }
 },
 {
  "id": "ts_demand_neg_unholed",
  "what": "the TypeScript engine reads what a hole left unknown as absent in a negation unfolded at a call",
  "edits": [
   [
    "src/aggeval.ts",
    "if (u !== null) { this.demandUnknownRead(depth, a.s, u); continue; }",
    "if (u === undefined) continue;"
   ]
  ],
  "expect": {
   "demand_neg_hole": "dh_wrong"
  }
 },
 {
  "id": "asked_unholed",
  "what": "a question's negation unfolded at a call reads what a hole left unknown as absent",
  "expect": {
   "demand_asked_hole": "lacks the row explained[$explain](whynot,da_q(c,z),1,"
  }
 },
 {
  "id": "ts_asked_unholed",
  "what": "the TypeScript engine reads what a hole left unknown as absent in a question's negation unfolded at a call",
  "edits": [
   [
    "src/aggeval.ts",
    "if (holds && depth > 0 && (this.firing || this.asking) && this.demandHeads.length > 0",
    "if (holds && depth > 0 && this.firing && this.demandHeads.length > 0"
   ]
  ],
  "expect": {
   "demand_asked_hole": "lacks the row explained[$explain](whynot,da_q(c,z),1,"
  }
 },
 {
  "id": "demand_trail_last",
  "what": "a call left unknown by several unknowns below it rests on the last one only",
  "expect": {
   "demand_asked_hole": "lacks the row shrug[$kernel](da_ng(b)"
  }
 },
 {
  "id": "ts_demand_trail_last",
  "what": "the TypeScript engine rests a call left unknown on the last unknown below it only",
  "edits": [
   [
    "src/aggeval.ts",
    "const past = this.demandTrail.slice(unknowns);",
    "const past = this.demandTrail.slice(-1);"
   ]
  ],
  "expect": {
   "demand_asked_hole": "lacks the row shrug[$kernel](da_ng(b)"
  }
 },
 {
  "id": "demand_poison_skipped",
  "what": "a hole is not carried through a rule answered on demand to its readers",
  "expect": {
   "demand_pos_hole": "lacks the row shrug[$kernel](dp_q2(k)"
  }
 },
 {
  "id": "ts_demand_poison_skipped",
  "what": "the TypeScript engine does not carry a hole through a rule answered on demand to its readers",
  "edits": [
   [
    "src/aggeval.ts",
    "for (const [drel, rs] of this.demandRels) {",
    "for (const [drel, rs] of [] as [string, ERule[]][]) {"
   ]
  ],
  "expect": {
   "demand_pos_hole": "lacks the row shrug[$kernel](dp_q2(k)"
  }
 },
 {
  "id": "demand_recursion_unfolds",
  "what": "a call to a closed relation answered on demand unfolds its rules, without end",
  "expect": {
   "demand_recursion": "lacks the row dr_r[main](6)"
  }
 },
 {
  "id": "ts_demand_recursion_unfolds",
  "what": "the TypeScript engine unfolds a call to a closed relation answered on demand, without end",
  "edits": [
   [
    "src/aggeval.ts",
    "if (drs !== undefined && !this.demandClosed.has(l.rel) && !again) {",
    "if (drs !== undefined && !again) {"
   ]
  ],
  "expect": {
   "demand_recursion": "lacks the row dr_r[main](6)"
  }
 },
 {
  "id": "demand_closed_unfolds",
  "what": "a call to a closed relation answered on demand unfolds its rules, stopping only on a call met again, to the depth wall",
  "expect": {
   "demand_chain": "lacks the row dc_r[main](700)"
  }
 },
 {
  "id": "ts_demand_closed_unfolds",
  "what": "the TypeScript engine unfolds a call to a closed relation answered on demand, stopping only on a call met again",
  "edits": [
   [
    "src/aggeval.ts",
    "this.demandCyclic.has(l.rel) ? this.anonLitKey(l, s) : null",
    "(this.demandCyclic.has(l.rel) || this.demandClosed.has(l.rel)) ? this.anonLitKey(l, s) : null"
   ],
   [
    "src/aggeval.ts",
    "if (drs !== undefined && !this.demandClosed.has(l.rel) && !again) {",
    "if (drs !== undefined && !again) {"
   ]
  ],
  "expect": {
   "demand_chain": "lacks the row dc_r[main](700)"
  }
 },
 {
  "id": "demand_cycle_unfolds",
  "what": "a call to a relation answered on demand with an open answer, met again inside its own unfolding, unfolds again, to the depth wall",
  "expect": {
   "demand_cycle": "lacks the row dy_r[main](4)"
  }
 },
 {
  "id": "ts_demand_cycle_unfolds",
  "what": "the TypeScript engine unfolds again a call to a relation answered on demand met inside its own unfolding",
  "edits": [
   [
    "src/aggeval.ts",
    "const again = call !== null && this.demandCalls.includes(call);",
    "const again = false;"
   ]
  ],
  "expect": {
   "demand_cycle": "lacks the row dy_r[main](4)"
  }
 },
 {
  "id": "wfs_admits_subsumption",
  "what": "a dominance rule is evaluated under well-founded semantics",
  "expect": {
   "agg_sub_wfs": "was to be refused",
   "agg_sub_ts": "was to be refused"
  }
 },
 {
  "id": "dominance_why_ghost_unmarked",
  "what": "why prints a value dominated since as if it were on the front",
  "expect": {
   "agg_sub_why": "asy_text_missing"
  }
 },
 {
  "id": "dominance_why_one_member",
  "what": "why of a member of a front prints its first member alone and nothing it dominates beyond the digest",
  "expect": {
   "agg_sub_order_why": "aoy_text_missing",
   "agg_sub_why": "asy_text_missing"
  }
 },
 {
  "id": "dominance_why_beaten_off",
  "what": "why of a member of a front does not name the values it dominates",
  "expect": {
   "agg_sub_order_why": "aoy_text_missing",
   "agg_sub_why": "asy_text_missing"
  }
 },
 {
  "id": "dominance_whynot_plain",
  "what": "whynot of a value given and dominated does not name what dominates it",
  "expect": {
   "agg_sub_order_why": "aoy_text_missing",
   "agg_sub_why": "asy_text_missing",
   "agg_sub_ticks": "astk_text_missing"
  }
 },
 {
  "id": "dominance_history_unfounded",
  "what": "a consequence of a dominated value that its rule concluded again from what dominates it is not founded by it: a monotone consumer an improvement reaches back through is refused",
  "expect": {
   "agg_sub_eval": "does not evaluate"
  }
 },
 {
  "id": "staged_keeps_withdrawn",
  "what": "a conclusion staged @next from a fact a lattice withdrew later in the tick stays staged, for certain",
  "expect": {
   "agg_sub_ticks": "astk_wrong",
   "agg_lattice_ticks": "tlk_staged_unholed"
  }
 },
 {
  "id": "dominance_self_fault_ignored",
  "what": "a value whose comparison with itself faults is admitted as if it did not dominate itself",
  "expect": {
   "agg_sub_holes": "lacks the row"
  }
 },
 {
  "id": "dominance_whynot_unasked",
  "what": "whynot of a value no rule gives reads every comparison as no: one that faults, reads an unknown or dominates itself would join the front",
  "expect": {
   "agg_sub_why": "asy_text_missing"
  }
 },
 {
  "id": "dominance_body_unordered",
  "what": "the door reads a dominance body's variables in any order, not the order it is solved in",
  "expect": {
   "agg_sub_safety": "was to be refused"
  }
 },
 {
  "id": "dominance_sub_rel_off",
  "what": "safety.rofl reads a subsumptive relation as no cell: nothing refuses its negation or a threshold inside its recursion, and its outer reads are not strict",
  "edits": [
   [
    "safety.rofl",
    "lattice_rel(P) :- sub_rel(P).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_strata": "refused, but not for",
   "agg_sub_safety": "was to be refused"
  }
 },
 {
  "id": "dominance_two_keys_admitted",
  "what": "safety.rofl admits two dominance rules of one relation at two keys",
  "edits": [
   [
    "safety.rofl",
    "lattice_refused(P, two_keys)     :- dominance(_, P, _, J), dominance(_, P, _, K), J != K.\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_safety": "was to be refused"
  }
 },
 {
  "id": "strata_dominance_unranked",
  "what": "rules/strata.rofl ranks a subsumptive relation with what its dominance reads, not above it",
  "edits": [
   [
    "rules/strata.rofl",
    "dep_neg(A, B)      :- dominance(R, A, _, _), premise_pos(R, B).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_strata_stock": "assc_unranked",
   "agg_sub_strata": "assc_unranked"
  }
 },
 {
  "id": "ring1_dominance_unread",
  "what": "ring 1 reads no dominance rule",
  "edits": [
   [
    "examples/ring1/ring1.rofl",
    "clause_at(I, D, $dominance(H, G), B) :- lit(I, C, H), nexttok(C, K), op2(K, K2, le),\n  nexttok(K2, S0), lit(S0, C2, G), nexttok(C2, N), neck(N, N2),\n  nexttok(N2, S), body(S, E, B), nexttok(E, D), p(D, dot).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_syntax": "ring1_missing"
  }
 },
 {
  "id": "ts_dominance_admitted",
  "what": "the TypeScript engine does not refuse a dominance rule under well-founded semantics",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (sub !== undefined) throw new Rejected(",
    "    if (sub === '') throw new Rejected("
   ]
  ],
  "expect": {
   "agg_sub_ts": "was to be refused"
  }
 },
 {
  "id": "order_unread",
  "what": "the Rust parser reads no declared order: `pareto` and `lex` are names, and a declaration a clause with no closing dot",
  "expect": {
   "agg_sub_order_syntax": "does not evaluate",
   "agg_sub_order_reflect": "does not evaluate",
   "agg_sub_order_eval": "does not evaluate",
   "agg_sub_order_safety": "does not evaluate",
   "agg_sub_order_witness": "does not evaluate",
   "agg_sub_order_why": "does not evaluate",
   "agg_sub_order_demo": "does not evaluate"
  }
 },
 {
  "id": "order_pareto_weak",
  "what": "a declared order is lowered with every comparison weak: a value dominates itself",
  "expect": {
   "agg_sub_order_reflect": "sor_missing",
   "agg_sub_order_eval": "aoe_unlike",
   "agg_sub_order_witness": "aow_missing",
   "agg_sub_order_demo": "aodb_lp_missing"
  }
 },
 {
  "id": "order_lex_as_pareto",
  "what": "a lex declaration is lowered as a pareto one: a better first value no longer decides",
  "expect": {
   "agg_sub_order_eval": "aoe_two",
   "agg_sub_order_witness": "aow_missing",
   "agg_sub_order_demo": "aodb_lp_extra"
  }
 },
 {
  "id": "order_max_as_min",
  "what": "a max value of a declared order is lowered as a min",
  "expect": {
   "agg_sub_order_eval": "aoe_missing"
  }
 },
 {
  "id": "order_row_rule_first",
  "what": "every `order_comp` row of a declaration names its first dominance rule, not the one strict in its value",
  "expect": {
   "agg_sub_order_reflect": "does not evaluate",
   "agg_sub_order_syntax": "does not evaluate"
  }
 },
 {
  "id": "order_row_unread",
  "what": "safety.rofl is not given the `order_comp` rows, so a declared order is judged as a custom dominance: every consumer admitted",
  "expect": {
   "agg_sub_order_safety": "was to be refused"
  }
 },
 {
  "id": "order_head_unseeded",
  "what": "the host seeds no value of a declared order in a head: what a rule concludes into it is judged by nothing",
  "expect": {
   "agg_sub_order_safety": "does not evaluate"
  }
 },
 {
  "id": "ring1_order_unread",
  "what": "ring 1 reads no declared order",
  "edits": [
   [
    "examples/ring1/ring1.rofl",
    "clause_at(I, D, $order(Kind, Ds, $lit(R, $bare, A, $now)), $nil) :-\n  identtok(I, I2), tok_name(I, I2, Kind), ord_kind(Kind), nexttok(I2, K), identtok(K, K2), not keyword(K),\n  tok_name(K, K2, R), nexttok(K2, L), p(L, lpar), nexttok(L, S), ordargs(S, E, Ds, A),\n  nexttok(E, C), p(C, rpar), nexttok(C, D), p(D, dot).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_order_syntax": "ring1_missing"
  }
 },
 {
  "id": "ts_order_unread",
  "what": "the TypeScript parser reads no declared order",
  "edits": [
   [
    "src/parser.ts",
    "if (this.peek().t === 'ident' && ORDER_KINDS.has(this.peek().v) &&",
    "if (false && ORDER_KINDS.has(this.peek().v) &&"
   ]
  ],
  "expect": {
   "agg_sub_order_syntax": "refused, but not for"
  }
 },
 {
  "id": "ts_order_lex_as_pareto",
  "what": "the TypeScript door lowers a lex declaration as a pareto one",
  "edits": [
   [
    "src/aggeval.ts",
    "      if (kind !== 'pareto' && i > j) continue;\n      body.push(i === j ? cmp(i, true) : kind === 'pareto' ? cmp(i, false)",
    "      body.push(i === j ? cmp(i, true) : true ? cmp(i, false)"
   ]
  ],
  "expect": {
   "agg_sub_order_eval": "aoe_two"
  }
 },
 {
  "id": "order_dir_ignored",
  "what": "safety.rofl takes every value of a declared order for a min: a max is judged as it improves downwards",
  "edits": [
   [
    "safety.rofl",
    "premise_var(R, K, oval, I, V), order_comp(P, _, I, Dir, _), better_move(Dir, M).\n",
    "premise_var(R, K, oval, I, V), order_comp(P, _, I, Dir, _), better_move(min, M).\n"
   ]
  ],
  "expect": {
   "agg_sub_order_safety": "does not evaluate"
  }
 },
 {
  "id": "order_head_fit_ignored",
  "what": "safety.rofl admits a value of a declared order into a head of any direction",
  "edits": [
   [
    "safety.rofl",
    "lat_ok(R, K, X, 0, oval) :- lat_taint(R, K, X), premise_var(R, 0, oval, _, X), not ord_head_unfit(R, K, X).\n",
    "lat_ok(R, K, X, 0, oval) :- lat_taint(R, K, X), premise_var(R, 0, oval, _, X).\n"
   ]
  ],
  "expect": {
   "agg_sub_order_safety": "was to be refused"
  }
 },
 {
  "id": "order_taint_dropped",
  "what": "safety.rofl does not taint what a declared order reads: no use of its values is judged",
  "edits": [
   [
    "safety.rofl",
    "lat_taint(R, K, V) :- lat_inner(R, K, P), ord_rel(P), premise_var(R, K, oval, _, V).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_order_safety": "was to be refused"
  }
 },
 {
  "id": "order_bad_read_ignored",
  "what": "safety.rofl admits a read of a declared order whose value is a constant or repeated",
  "edits": [
   [
    "safety.rofl",
    "lat_misuse(R) :- lat_inner(R, K, P), ord_rel(P), order_bad_read(R, K).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_order_safety": "was to be refused"
  }
 },
 {
  "id": "order_and_rules_admitted",
  "what": "safety.rofl admits a declared order beside dominance rules of its own",
  "edits": [
   [
    "safety.rofl",
    "lattice_refused(P, order_and_rules) :- ord_rel(P), dominance(R, P, _, _), not ord_owned(P, R).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_order_safety": "was to be refused"
  }
 },
 {
  "id": "order_two_kinds_admitted",
  "what": "safety.rofl admits two declarations of one relation of two kinds",
  "edits": [
   [
    "safety.rofl",
    "lattice_refused(P, two_orders)      :- order_comp(P, K1, _, _, _), order_comp(P, K2, _, _, _), K1 != K2.\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_order_safety": "was to be refused"
  }
 },
 {
  "id": "order_lex_late_compared",
  "what": "safety.rofl admits a comparison of a later value of a lex order",
  "edits": [
   [
    "safety.rofl",
    "lat_misuse(R) :- lex_late(R, K, X), premise_lit(R, J, $builtin(Op, _)), premise_var(R, J, _, _, X), ord_cmp(Op).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_order_safety": "was to be refused"
  }
 },
 {
  "id": "order_lex_strict_unchecked",
  "what": "safety.rofl does not require a lex head's values but the last to be computed strictly from the value at their own place",
  "edits": [
   [
    "safety.rofl",
    "lat_misuse(R) :- lex_track(R, K), lex_pos(R, I), not lex_strict(R, K, I).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_order_safety": "was to be refused"
  }
 },
 {
  "id": "order_lex_late_into_pareto",
  "what": "safety.rofl admits a lex read's later value into a head that is not lex",
  "edits": [
   [
    "safety.rofl",
    "lat_misuse(R) :- lex_late(R, K, X), premise_var(R, 0, oval, _, X), concludes(R, H), not lex_rel(H).\n",
    ""
   ]
  ],
  "expect": {
   "agg_sub_order_safety": "was to be refused"
  }
 },
 {
  "id": "phrase_subset_as_member",
  "what": "rofl-render writes a subset test as membership",
  "expect": {
   "agg_join_phrase": "sentence_lost"
  }
 },
 {
  "id": "phrase_inner_unread",
  "what": "rofl-render writes an aggregate's own body as nothing",
  "expect": {
   "agg_count_phrase": "does not evaluate",
   "agg_holistic_phrase": "does not evaluate",
   "agg_empty_phrase": "does not evaluate",
   "agg_threshold_phrase": "does not evaluate"
  }
 },
 {
  "id": "phrase_sum_as_median",
  "what": "rofl-render writes a sum as a median",
  "expect": {
   "agg_sum_phrase": "sentence_lost"
  }
 },
 {
  "id": "phrase_max_as_min",
  "what": "rofl-render writes a max as the least",
  "expect": {
   "agg_minmax_phrase": "sentence_lost"
  }
 },
 {
  "id": "phrase_count_tuple_first",
  "what": "rofl-render writes the first of what a count takes and drops the rest",
  "expect": {
   "agg_count_phrase": "sentence_lost"
  }
 },
 {
  "id": "phrase_quantile_swapped",
  "what": "rofl-render writes a quantile's rank and value the other way round",
  "expect": {
   "agg_holistic_phrase": "quantile's percent is an integer"
  }
 },
 {
  "id": "phrase_threshold_as_atmost",
  "what": "rofl-render writes at least N as at most N",
  "expect": {
   "agg_threshold_phrase": "sentence_lost"
  }
 },
 {
  "id": "phrase_lattice_op_lost",
  "what": "rofl-render writes every lattice's operation as the least",
  "expect": {
   "agg_lattice_phrase": "decl_lost",
   "agg_join_phrase": "decl_lost"
  }
 },
 {
  "id": "phrase_widen_off_by_one",
  "what": "rofl-render writes a widening one improvement late",
  "expect": {
   "agg_widen_phrase": "decl_lost"
  }
 },
 {
  "id": "phrase_tag_alg_lost",
  "what": "rofl-render writes every tag's semiring as tropical",
  "expect": {
   "agg_tag_phrase": "decl_lost",
   "agg_tagc_phrase": "decl_lost"
  }
 },
 {
  "id": "phrase_decl_twinned",
  "what": "rofl-render merges a declaration or a dominance rule with its neighbour, `a`/`b` keeps ...",
  "expect": {
   "agg_lattice_phrase": "decl_lost",
   "agg_join_phrase": "decl_lost",
   "agg_tag_phrase": "does not evaluate"
  }
 },
 {
  "id": "phrase_dom_reintroduced",
  "what": "rofl-render introduces a dominance's variables again in its body",
  "expect": {
   "agg_sub_phrase": "sentence_lost"
  }
 },
 {
  "id": "phrase_avg_rounding_lost",
  "what": "rofl-render writes an average without its rounding",
  "expect": {
   "agg_sugar_phrase": "sentence_lost"
  }
 },
 {
  "id": "phrase_atmost_as_exactly",
  "what": "rofl-render writes at most N as exactly N",
  "expect": {
   "agg_sugar_phrase": "sentence_lost"
  }
 },
 {
  "id": "phrase_sugar_unseen",
  "what": "rofl-render never sees the sugar's lowering and writes it as the counts and sums it is",
  "expect": {
   "agg_sugar_phrase": "sentence_unsaid",
   "agg_sugar_shrug": "sentence_unsaid"
  }
 },
 {
  "id": "phrase_avg_copy_unchecked",
  "what": "rofl-render takes a sum and a count over different bodies for an average",
  "expect": {
   "agg_sugar_phrase": "sentence_lost"
  }
 },
 {
  "id": "div_floor",
  "what": "integer division rounds down, not toward zero",
  "expect": {
   "agg_sugar_eval": "sge_wrong"
  }
 },
 {
  "id": "reader_sugar_shared",
  "what": "the reader lowers the sugar's second aggregate with the first one's names",
  "edits": [
   [
    "scripts/read_md.ts",
    "    return own.map(apart);",
    "    return own;"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "bound by another aggregate",
   "agg_sugar_phrase": "bound by another aggregate"
  }
 },
 {
  "id": "reader_rounding_optional",
  "what": "the reader reads an average that does not state its rounding",
  "edits": [
   [
    "scripts/read_md.ts",
    "const r = /^(?: in (tenths|hundredths|thousandths|millionths))? rounded toward zero$/.exec(tail);",
    "const r = /^(?: in (tenths|hundredths|thousandths|millionths))?(?: rounded toward zero)?$/.exec(tail);"
   ]
  ],
  "expect": {
   "agg_sugar_safety": "sgf_accepted"
  }
 },
 {
  "id": "reader_avg_empty_divides",
  "what": "the reader lowers an average without its count's `> 0`, so an empty group divides by zero",
  "edits": [
   [
    "scripts/read_md.ts",
    "      rule.body.push({ rel: '>', args: [count, { n: 0 }] });\n",
    ""
   ]
  ],
  "expect": {
   "agg_sugar_eval": "sge_divided",
   "agg_sugar_why": "sgy_missing"
  }
 },
 {
  "id": "reader_every_domain_dropped",
  "what": "the reader counts what satisfies every without its domain: the copy then counts a row variable its body does not bind, and the lowering is refused",
  "edits": [
   [
    "scripts/read_md.ts",
    "push('count', holding, xs, [], [d, b], true, true);",
    "push('count', holding, xs, [], [b], true, true);"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "does not bind every term it counts"
  }
 },
 {
  "id": "reader_atmost_strict",
  "what": "the reader lowers at most N to a count below N",
  "edits": [
   [
    "scripts/read_md.ts",
    "m[1] === 'at most' ? { rel: '<=', args: [count, n] }",
    "m[1] === 'at most' ? { rel: '<', args: [count, n] }"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "sge_wrong"
  }
 },
 {
  "id": "reader_scale_off",
  "what": "the reader scales tenths by a hundred",
  "edits": [
   [
    "scripts/read_md.ts",
    "tenths: 10, hundredths: 100",
    "tenths: 100, hundredths: 100"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "sge_wrong"
  }
 },
 {
  "id": "reader_results_folded",
  "what": "the reader folds two aggregates' results compared into one variable",
  "edits": [
   [
    "scripts/read_md.ts",
    " && !(aggRes(l.args[0]) && aggRes(l.args[1]))",
    ""
   ]
  ],
  "expect": {
   "agg_sugar_phrase": "sentence_lost"
  }
 },
 {
  "id": "reader_apart_takes_only",
  "what": "the reader renames apart only what the sugar's copy takes, sharing a variable its body joins through",
  "edits": [
   [
    "scripts/read_md.ts",
    "const own = (x: string) => !outside.has(x);",
    "const takes = new Set([...a.vals, ...a.keys].flatMap(namesIn)), own = (x: string) => !outside.has(x) && takes.has(x);"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "bound by another aggregate",
   "agg_sugar_phrase": "bound by another aggregate"
  }
 },
 {
  "id": "reader_apart_bound_too",
  "what": "the reader renames apart what the sugar's copy takes even when the rule binds it before, so the copy counts the whole group",
  "edits": [
   [
    "scripts/read_md.ts",
    "const own = (x: string) => !outside.has(x);",
    "const takes = new Set([...a.vals, ...a.keys].flatMap(namesIn)), own = (x: string) => !outside.has(x) || takes.has(x);"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "sge_wrong",
   "agg_sugar_phrase": "psc_wrong"
  }
 },
 {
  "id": "reader_exactly_unbound",
  "what": "the reader reads exactly N with N named nowhere else, which holds of every group",
  "edits": [
   [
    "scripts/read_md.ts",
    "if (c.body[j + 1].rel === '=' && ",
    "if (c.body[j + 1].rel === '==' && "
   ]
  ],
  "expect": {
   "agg_sugar_safety": "sgf_accepted"
  }
 },
 {
  "id": "reader_alone_ungrouped",
  "what": "the reader reads at most and exactly N over a group nothing binds before the count, leaving its empty groups out",
  "edits": [
   [
    "scripts/read_md.ts",
    "&& !written(x, 0, j));",
    "&& !written(x, 0, j) && x === a.res);"
   ]
  ],
  "expect": {
   "agg_sugar_safety": "sgf_accepted"
  }
 },
 {
  "id": "reader_shrug_phrase",
  "what": "the vocabulary every reading loads words the shrug sentence otherwise, so the answer model's sentences are not read",
  "edits": [
   [
    "facts/phrases.rofl",
    "phrase(shrug, \"<0:target> has no answer for the reason <1:reason> with <2:meta>\").",
    "phrase(shrug, \"<0:target> has no answer because of <1:reason> with <2:meta>\")."
   ]
  ],
  "expect": {
   "agg_sugar_shrug": "sgk_wrong"
  }
 },
 {
  "id": "reader_every_per_member",
  "what": "the reader lowers every onto counts of what the sentence names alone, so one passing row of each member is enough and a failing row beside it is not seen",
  "edits": [
   [
    "scripts/read_md.ts",
    "      if (!extra.length) continue;\n",
    "      continue;\n"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "sge_wrong",
   "agg_sugar_phrase": "psc_wrong"
  }
 },
 {
  "id": "reader_units_shared",
  "what": "the reader keeps a letter two aggregates of one rule write as one variable, which safety refuses as a group one binds for the other",
  "edits": [
   [
    "scripts/read_md.ts",
    "    const own = out.map(unitsApart).map(rows);",
    "    const own = out.map(rows);"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "bound by another aggregate",
   "agg_sugar_phrase": "bound by another aggregate"
  }
 },
 {
  "id": "reader_same_folded",
  "what": "the reader folds `V is V` away, a condition of the rule it came from lost",
  "edits": [
   [
    "scripts/read_md.ts",
    "!l.keep && !same && ",
    "!l.keep && "
   ]
  ],
  "expect": {
   "agg_sugar_phrase": "sentence_lost"
  }
 },
 {
  "id": "reader_bare_article",
  "what": "the reader takes a capital A, An or The standing alone in a conclusion for an article, and the conclusion loses that argument, an average's result with it",
  "edits": [
   [
    "scripts/read_md.ts",
    "while ((m = re.exec(head))) {",
    "while ((m = re.exec(head))) { if (!m[2] && ['A', 'An', 'The'].includes(m[3])) continue;"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "sge_wrong",
   "agg_sugar_phrase": "psc_wrong"
  }
 },
 {
  "id": "reader_article_before_word",
  "what": "the reader takes a capital A, An or The in a conclusion for an article when a lower-case word follows it (`is A in whole units`), and drops it, an average's result with it",
  "edits": [
   [
    "scripts/read_md.ts",
    "while ((m = re.exec(head))) {",
    "while ((m = re.exec(head))) { if (!m[2] && ['A', 'An', 'The'].includes(m[3]) && /^ [a-z]/.test(head.slice(m.index + m[0].length))) continue;"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "sge_wrong",
   "agg_sugar_phrase": "psc_wrong"
  }
 },
 {
  "id": "reader_capital_typed_article",
  "what": "the reader takes a capital A in a conclusion, followed by words and a capital (`puts A above M`), for the article of a typed hole, and the conclusion loses A",
  "edits": [
   [
    "scripts/read_md.ts",
    "(?:\\b(an?) (",
    "(?:\\b([Aa]n?) ("
   ]
  ],
  "expect": {
   "agg_sugar_phrase": "psc_wrong"
  }
 },
 {
  "id": "facts_agg_unwritten",
  "what": "rofl-render --facts writes an aggregate as its operator and result alone, and the reader's round trip against the source cannot count a rule with an aggregate as come back",
  "expect": {
   "agg_count_phrase": "sentence_inexact",
   "agg_sugar_phrase": "sentence_inexact"
  }
 },
 {
  "id": "facts_decl_as_fact",
  "what": "rofl-render --facts writes a lattice or tag declaration as a bare fact, and the round trip counts it as a fact that did not come back",
  "expect": {
   "agg_join_phrase": "sentence_inexact",
   "agg_tag_phrase": "sentence_inexact"
  }
 },
 {
  "id": "facts_dom_unwritten",
  "what": "rofl-render --facts leaves out a dominance rule's dominating fact, and the round trip cannot count the dominance as come back",
  "expect": {
   "agg_sub_phrase": "sentence_inexact"
  }
 },
 {
  "id": "reader_fold_source_only",
  "what": "the round trip folds `X = Y` between two variables in the source's clause and not in the one read back, and every as two counts compared never counts as come back",
  "edits": [
   [
    "scripts/read_md.ts",
    "for (const c of [...parsed, ...dominances].map(foldVars)) parsedSet",
    "for (const c of [...parsed, ...dominances]) parsedSet"
   ]
  ],
  "expect": {
   "agg_sugar_phrase": "sentence_inexact"
  }
 },
 {
  "id": "reader_dominance_uncompared",
  "what": "the round trip compares the rules read back and not the dominances, and a dominance never counts as come back",
  "edits": [
   [
    "scripts/read_md.ts",
    "for (const c of [...parsed, ...dominances].map(foldVars)) parsedSet",
    "for (const c of [...parsed].map(foldVars)) parsedSet"
   ]
  ],
  "expect": {
   "agg_sub_phrase": "sentence_inexact"
  }
 },
 {
  "id": "phrase_every_rows_unchecked",
  "what": "rofl-render writes as every two counts that take what the sentence names alone, where the satisfies clause reads more of the domain",
  "expect": {
   "agg_sugar_phrase": "sentence_lost"
  }
 },
 {
  "id": "phrase_apart_takes_only",
  "what": "rofl-render recognises the sugar's pair only when the copy renames what it takes, not a variable its body joins through",
  "expect": {
   "agg_sugar_phrase": "sentence_unsaid"
  }
 },
 {
  "id": "phrase_apart_first_bound",
  "what": "rofl-render writes as an average a sum asked per key beside a count over every key",
  "expect": {
   "agg_sugar_phrase": "sentence_lost"
  }
 },
 {
  "id": "phrase_apart_copy_bound",
  "what": "rofl-render writes as an average a sum over every key beside a count asked per key",
  "expect": {
   "agg_sugar_phrase": "sentence_lost"
  }
 },
 {
  "id": "ts_max",
  "what": "the TypeScript engine folds max as min",
  "edits": [
   [
    "src/cell.ts",
    "if (op === 'max' && acc.k === 'int' && x.k === 'int') return order(cmpVal(acc, x), x);",
    "if (op === 'max' && acc.k === 'int' && x.k === 'int') return order(cmpVal(x, acc), x);"
   ]
  ],
  "expect": {
   "agg_cell_eval": "acl_wrong",
   "agg_minmax_eval": "am_max_wrong",
   "agg_lattice_eval": "al_missing",
   "agg_critpath_demo": "cpc_miss"
  }
 },
 {
  "id": "ts_no_agg_edge",
  "what": "the TypeScript peel drops the aggregate edges",
  "edits": [
   [
    "src/aggeval.ts",
    "for (const h of [hrel, ...reflected]) {\n            heads.add(h); P(h);",
    "for (const h of [] as string[]) {\n            heads.add(h); P(h);"
   ]
  ],
  "expect": {
   "agg_count_eval": "ac_count_wrong",
   "agg_sum_eval": "as_sum_wrong",
   "agg_minmax_eval": "am_min_missing"
  }
 },
 {
  "id": "ts_no_empty_zero",
  "what": "the TypeScript engine never reads safety.rofl's empty-zero",
  "edits": [
   [
    "src/aggeval.ts",
    "emptyZero: this.answer.emptyZero.has(`${rid}|${a.at}`) };",
    "emptyZero: false };"
   ]
  ],
  "expect": {
   "agg_empty_eval": "ae_zero_missing",
   "agg_quorum_demo": "qc_miss"
  }
 },
 {
  "id": "ts_median_upper",
  "what": "the TypeScript median takes the upper of the two middle values",
  "edits": [
   [
    "src/cell.ts",
    "if (op === 'median') return nth((n + 1n) / 2n);",
    "if (op === 'median') return nth(n / 2n + 1n);"
   ]
  ],
  "expect": {
   "agg_holistic_eval": "med_wrong"
  }
 },
 {
  "id": "ts_thr_n_minus_one",
  "what": "the TypeScript threshold reads N as N - 1",
  "edits": [
   [
    "src/aggeval.ts",
    "if (n.k === 'i') { const k = BigInt(n.v); return [k > 0n ? Number(k) : 0, n]; }",
    "if (n.k === 'i') { const k = BigInt(n.v); return [k > 1n ? Number(k) - 1 : 0, n]; }"
   ]
  ],
  "expect": {
   "agg_threshold_eval": "oracle_short",
   "agg_quorum_demo": "qc_miss"
  }
 },
 {
  "id": "ts_lattice_no_retire",
  "what": "a better TypeScript lattice value does not retire the fact it improves on",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (st.k === 'tied') return ck;\n    this.supersede(old, ck);",
    "    if (st.k === 'tied') return ck;"
   ]
  ],
  "expect": {
   "agg_lattice_eval": "al_two",
   "agg_critpath_demo": "cpc_two"
  }
 },
 {
  "id": "ts_union_left",
  "what": "the TypeScript union of two sets is the first of them",
  "edits": [
   [
    "src/cell.ts",
    "    return mkSet(mergeTerms(xs, ys));",
    "    return a;"
   ]
  ],
  "expect": {
   "agg_join_eval": "a consumer was not monotone"
  }
 },
 {
  "id": "ts_widen_both_ends",
  "what": "the TypeScript widening sends both ends to their infinities",
  "edits": [
   [
    "src/cell.ts",
    "  return [joined[0] < old[0] ? down(joined[0]) : old[0], joined[1] > old[1] ? up(joined[1]) : old[1]];",
    "  return [NINF, PINF];"
   ]
  ],
  "expect": {
   "agg_widen_eval": "awe_unwidened"
  }
 },
 {
  "id": "ts_trust_max",
  "what": "the TypeScript trust's ⊗ is max, not min",
  "edits": [
   [
    "src/cell.ts",
    "a === 'trust' ? (x < y ? x : y)",
    "a === 'trust' ? (x > y ? x : y)"
   ]
  ],
  "expect": {
   "agg_tag_eval": "tge_missing"
  }
 },
 {
  "id": "ts_count_folds_max",
  "what": "a TypeScript counting tag keeps its largest derivation instead of the sum",
  "edits": [
   [
    "src/tag.ts",
    "body: [{ t: 'agg', op: 'sum', res: total, vals: [val], keys: [f], body:",
    "body: [{ t: 'agg', op: 'max', res: total, vals: [val], keys: [], body:"
   ]
  ],
  "expect": {
   "agg_tagc_eval": "tce_missing"
  }
 },
 {
  "id": "ts_dominance_no_retire",
  "what": "a TypeScript value the new one dominates stays an answer beside it",
  "edits": [
   [
    "src/aggeval.ts",
    "        this.supersede(s, ck);\n        this.latImproved.push(s);",
    "        this.latImproved.push(s);"
   ]
  ],
  "expect": {
   "agg_sub_eval": "asv_shrug"
  }
 },
 {
  "id": "ts_div_floor",
  "what": "TypeScript integer division rounds down, not toward zero",
  "edits": [
   [
    "src/unify.ts",
    ": t.name === '/' ? a / b :",
    ": t.name === '/' ? a / b - (a % b !== 0n && (a < 0n) !== (b < 0n) ? 1n : 0n) :"
   ]
  ],
  "expect": {
   "agg_sugar_eval": "sge_wrong"
  }
 },
 {
  "id": "ts_digest_off",
  "what": "TypeScript why ignores WHY_MEMBERS and prints every member",
  "edits": [
   [
    "src/aggeval.ts",
    "      if (i >= o.members) { next.push(line(`${'  '.repeat(indent + 1)}[",
    "      if (false) { next.push(line(`${'  '.repeat(indent + 1)}["
   ]
  ],
  "expect": {
   "agg_cell_why": "digest_leak",
   "agg_holistic_why": "why_text_leaked"
  }
 },
 {
  "id": "ts_no_sealed_text",
  "what": "TypeScript why says nothing of what a cell sealed",
  "edits": [
   [
    "src/aggeval.ts",
    "[aggregate: ${what}, sealed ${r.seals.map((x) => `${x.rel}@${x.round}`).join(', ')}]${id}`));",
    "[aggregate: ${what}]${r.seals.map((x) => `${x.rel}@${x.round}`).join(', ')}${id}`));"
   ]
  ],
  "expect": {
   "agg_count_why": "why_seal_missing",
   "agg_sum_why": "why_text_missing",
   "agg_minmax_why": "why_text_missing",
   "agg_empty_why": "why_empty_missing",
   "agg_holistic_why": "why_text_missing"
  }
 },
 {
  "id": "ts_empty_text",
  "what": "a TypeScript empty cell renders as 0 members",
  "edits": [
   [
    "src/aggeval.ts",
    ": n === 0 ? 'empty group' :",
    ": n === 0 ? `${n} members` :"
   ]
  ],
  "expect": {
   "agg_empty_why": "why_empty_missing"
  }
 },
 {
  "id": "ts_thr_text_order",
  "what": "the TypeScript Quorum is the first N by text, not by height",
  "edits": [
   [
    "src/cell.ts",
    "idx.sort((a, b) => ms[a][0] - ms[b][0] || (ms[a][1]",
    "idx.sort((a, b) => (ms[a][1]"
   ]
  ],
  "expect": {
   "agg_threshold_why": "text_missing",
   "agg_threshold_witness": "quorum_wrong",
   "agg_quorum_demo": "qc_unsaid"
  }
 },
 {
  "id": "ts_lattice_why_one_member",
  "what": "TypeScript why of a lattice fact or a member of a front prints its first member alone",
  "edits": [
   [
    "src/aggeval.ts",
    "n = members.length, limit = indent === 0 ? o.members : 1;",
    "n = members.length, limit = 1;"
   ]
  ],
  "expect": {
   "agg_sub_why": "asy_text_missing",
   "agg_lattice_why": "why_text_missing",
   "agg_tag_why": "tgy_text_missing",
   "agg_critpath_demo": "cpc_unnamed"
  }
 },
 {
  "id": "ts_join_why_one_member",
  "what": "TypeScript why of a join fact prints the first contribution of its Cover alone",
  "edits": [
   [
    "src/aggeval.ts",
    "const limit = !live ? facts.length : indent === 0 ? o.members : 1;",
    "const limit = !live ? facts.length : indent === 0 ? 1 : 1;"
   ]
  ],
  "expect": {
   "agg_join_why": "ajy_text_missing"
  }
 },
 {
  "id": "ts_widen_whynot_bare",
  "what": "TypeScript whynot of a widened cell names its hole and not its widening",
  "edits": [
   [
    "src/aggeval.ts",
    "...this.widenedLines(markers[i], '  '), ...this.unknownPath(unknowns[i])",
    "...this.unknownPath(unknowns[i])"
   ]
  ],
  "expect": {
   "agg_widen_why": "awy_text_missing"
  }
 },
 {
  "id": "ts_tag_label_lattice",
  "what": "TypeScript why and whynot name a tag the lattice of its ⊕",
  "edits": [
   [
    "src/aggeval.ts",
    "return t !== undefined ? `tag ${t[1]}` : `lattice ${op}`;",
    "return `lattice ${op}`;"
   ]
  ],
  "expect": {
   "agg_tag_why": "tgy_text_missing"
  }
 },
 {
  "id": "ts_why_cell_id_off",
  "what": "TypeScript why writes two different cells under one header with nothing to tell them apart",
  "edits": [
   [
    "src/aggeval.ts",
    "return at === 0 ? '' : ` (cell ${at + 1})`;",
    "return '';"
   ]
  ],
  "expect": {
   "agg_why_dag_cells": "dgc_missing"
  }
 },
 {
  "id": "ts_why_dag_off",
  "what": "TypeScript why writes a fact it has written out already in full again",
  "edits": [
   [
    "src/aggeval.ts",
    "if (this.whyDone.has(`f|${id}`)) {",
    "if (false) {"
   ]
  ],
  "expect": {
   "agg_why_dag": "dg_twice"
  }
 },
 {
  "id": "ts_why_dag_cell_off",
  "what": "TypeScript why writes an aggregate's cell it has written out already in full again",
  "edits": [
   [
    "src/aggeval.ts",
    "if (this.whyDone.has(`c|${pr.key}`)) {",
    "if (false) {"
   ]
  ],
  "expect": {
   "agg_why_dag": "dg_text_missing"
  }
 },
 {
  "id": "ts_whynot_dag_off",
  "what": "TypeScript whynot demonstrates a ground literal it has demonstrated already again",
  "edits": [
   [
    "src/aggeval.ts",
    "if (at !== undefined && at.has(level)) {",
    "if (false) {"
   ]
  ],
  "expect": {
   "agg_why_dag": "dg_text_missing"
  }
 },
 {
  "id": "ts_count_why_plain",
  "what": "TypeScript why renders a counting tag's fact as a plain one",
  "edits": [
   [
    "src/aggeval.ts",
    "else if (this.tags.countRel.has(r.rel)) this.renderCounting(id, key, indent, o, next);",
    "else if (false) this.renderCounting(id, key, indent, o, next);"
   ]
  ],
  "expect": {
   "agg_tagc_why": "tcy_text_missing"
  }
 },
 {
  "id": "ts_whynot_hole_empty",
  "what": "TypeScript whynot reads a holed cell as an empty group",
  "edits": [
   [
    "src/aggeval.ts",
    "else if (holed !== undefined && holed.k === 'hole') put(",
    "else if (false && holed !== undefined && holed.k === 'hole') put("
   ]
  ],
  "expect": {
   "agg_sugar_why": "sgy_leaked",
   "agg_sum_why": "hole_read_as",
   "agg_minmax_why": "why_hole_as_empty"
  }
 },
 {
  "id": "withdrawn_cell_stale_src",
  "what": "a lattice cell withdrawn at the settle rests on whatever unknown the carry last worked from",
  "expect": {
   "agg_lattice_shrug": "agg-shrug-lattice-roots.rofl: the state lacks the row"
  }
 },
 {
  "id": "ts_withdrawn_cell_stale_src",
  "what": "in the TypeScript engine, a lattice cell withdrawn at the settle rests on whatever unknown the carry last worked from",
  "edits": [
   [
    "src/aggeval.ts",
    "        this.carrySrc = src;\n        this.carryMore = [];",
    "        this.carrySrc = saved[0];\n        this.carryMore = saved[1];"
   ]
  ],
  "expect": {
   "agg_lattice_shrug": "agg-shrug-lattice-roots.rofl: the state lacks the row"
  }
 },
 {
  "id": "why_depth_cut",
  "what": "why stops rendering below a depth, as a walk with a frame per level stopped where its stack ran out",
  "expect": {
   "agg_lattice_why": "why_deep_missing"
  }
 },
 {
  "id": "ts_why_depth_cut",
  "what": "the TypeScript why fails below a depth, as its walk with a frame per level did where the stack ran out",
  "edits": [
   [
    "src/aggeval.ts",
    "      if (t.t === 'fact') this.renderWhy(t.id, t.indent, seen, o, next);",
    "      if (t.t === 'fact') { if (t.indent > 1000) throw new RangeError('Maximum call stack size exceeded'); this.renderWhy(t.id, t.indent, seen, o, next); }"
   ]
  ],
  "expect": {
   "agg_lattice_why": "why_deep_missing"
  }
 },
 {
  "id": "agg_reach_whole",
  "what": "a possible member's group is never known: every group it could be in is judged, and a group it cannot be in is holed",
  "expect": {
   "agg_precise_oracle": "po_bad",
   "agg_precise_holes": "ph_hole_extra"
  }
 },
 {
  "id": "agg_reach_neg_certain",
  "what": "a member an undecided negation may take away is read as certain",
  "expect": {
   "agg_precise_oracle": "po_bad",
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "agg_reach_dedup_any",
  "what": "every possible member's projection is read as one its group already holds",
  "expect": {
   "agg_precise_oracle": "po_bad",
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "agg_reach_bound_any",
  "what": "no possible member moves a min, max, or or and",
  "expect": {
   "agg_precise_oracle": "po_bad",
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "agg_reach_sum_zero",
  "what": "no possible member moves a sum",
  "expect": {
   "agg_precise_oracle": "po_bad",
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "agg_reach_holistic_low_only",
  "what": "a median or quantile is judged by its lower possible members alone",
  "expect": {
   "agg_precise_oracle": "po_bad",
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "agg_reach_fresh_off",
  "what": "a group only a possible member could make is sealed as no cell",
  "expect": {
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "agg_reach_first_only",
  "what": "only the firing that seals the aggregate is undecided where an unknown could change a group",
  "expect": {
   "agg_precise_holes": "ph_two(2,g1"
  }
 },
 {
  "id": "ts_agg_reach_whole",
  "what": "the TypeScript engine never knows a possible member's group",
  "edits": [
   [
    "src/aggeval.ts",
    "const pat = gt.map((t) => (known(t) ? t : null));",
    "const pat = gt.map(() => null);"
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_extra"
  }
 },
 {
  "id": "ts_agg_reach_neg_certain",
  "what": "the TypeScript engine reads a member an undecided negation may take away as certain",
  "edits": [
   [
    "src/aggeval.ts",
    "neg: b.t === 'neg', u };",
    "neg: false, u };"
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "ts_agg_reach_dedup_any",
  "what": "the TypeScript engine reads every possible projection as held",
  "edits": [
   [
    "src/aggeval.ts",
    "if (held.has(k)) continue;",
    "continue;"
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "ts_agg_reach_bound_any",
  "what": "in the TypeScript engine no possible member moves an order",
  "edits": [
   [
    "src/aggeval.ts",
    "try { return insert(op, now, x).k === 'improved'; }",
    "try { return false; }"
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "ts_agg_reach_sum_zero",
  "what": "in the TypeScript engine no possible member moves a sum",
  "edits": [
   [
    "src/aggeval.ts",
    "else if (op === 'sum' && value.k !== 'empty') moved = fresh.filter",
    "else if (op === 'sum' && value.k !== 'empty') moved = [].filter"
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "ts_agg_reach_holistic_low_only",
  "what": "the TypeScript engine judges a median or quantile by its lower possible members alone",
  "edits": [
   [
    "src/aggeval.ts",
    "&& same(at(xs.filter((x) => lt(now, x))), now);",
    ";"
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "ts_agg_reach_fresh_off",
  "what": "the TypeScript engine seals no cell for a group only a possible member could make",
  "edits": [
   [
    "src/aggeval.ts",
    "for (const g of fresh) groups.push([g, []]);",
    ""
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "ts_agg_reach_first_only",
  "what": "in the TypeScript engine only the sealing firing is undecided",
  "edits": [
   [
    "src/aggeval.ts",
    "                this.aggReachUndecided(rid, b, a.s, i, m);",
    "                if (memo === undefined) this.aggReachUndecided(rid, b, a.s, i, m);"
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_two(2,g1"
  }
 },
 {
  "id": "agg_reach_neg_fact_ignored",
  "what": "a member a fact takes away through a negation is read as one an unknown beside it might take away",
  "expect": {
   "agg_precise_oracle": "po_bad",
   "agg_precise_holes": "ph_hole_extra"
  }
 },
 {
  "id": "ts_agg_reach_neg_fact_ignored",
  "what": "the TypeScript engine reads a member a fact takes away as one an unknown beside it might",
  "edits": [
   [
    "src/aggeval.ts",
    "if (b.t === 'neg' && this.negDecided(b.lit, ps, free)) continue;",
    ""
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_extra"
  }
 },
 {
  "id": "agg_reach_fault_relabel",
  "what": "a group whose known members fault in every completion is withdrawn when a possible reaches it",
  "expect": {
   "agg_precise_holes": "ph_hole_extra"
  }
 },
 {
  "id": "ts_agg_reach_fault_relabel",
  "what": "the TypeScript engine withdraws a group whose known members fault in every completion",
  "edits": [
   [
    "src/aggeval.ts",
    "if (this.faultCertain(op, param, vals, value, ps)) return us;",
    ""
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_extra"
  }
 },
 {
  "id": "agg_reach_overflow_kept",
  "what": "a sum's overflow is kept whatever the possibles could add or take away",
  "expect": {
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "ts_agg_reach_overflow_kept",
  "what": "the TypeScript engine keeps a sum's overflow whatever the possibles could add or take away",
  "edits": [
   [
    "src/aggeval.ts",
    "if (value.reason !== AGG_OVERFLOW || op !== 'sum') return false;",
    "if (value.reason !== AGG_OVERFLOW || op !== 'sum') return false; if (vals.length > 0) return true;"
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "agg_reach_sum_empty",
  "what": "a member weighing 0 moves no sum, a group only it could make too",
  "expect": {
   "agg_precise_oracle": "po_bad",
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "ts_agg_reach_sum_empty",
  "what": "in the TypeScript engine a member weighing 0 moves no sum, a group only it could make too",
  "edits": [
   [
    "src/aggeval.ts",
    "else if (op === 'sum' && value.k !== 'empty') moved",
    "else if (op === 'sum') moved"
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_missing"
  }
 },
 {
  "id": "agg_reach_alias_first",
  "what": "a projection several unknowns could add rests on the first found alone",
  "expect": {
   "agg_precise_holes": "shrug[$kernel](ph_acnt(a1,$unknown_value)"
  }
 },
 {
  "id": "ts_agg_reach_alias_first",
  "what": "in the TypeScript engine a projection several unknowns could add rests on the first found alone",
  "edits": [
   [
    "src/aggeval.ts",
    "if (at !== undefined) { fresh[at][1].push(p.u); continue; }",
    "if (at !== undefined) continue;"
   ]
  ],
  "expect": {
   "agg_precise_holes": "shrug[$kernel](ph_acnt(a1,$unknown_value)"
  }
 },
 {
  "id": "agg_reach_redecide",
  "what": "every firing decides the groups again over the value sealed, a withdrawn one too",
  "expect": {
   "agg_precise_holes": "shrug[$kernel](ph_amin(a2,$unknown_value)"
  }
 },
 {
  "id": "ts_agg_reach_redecide",
  "what": "in the TypeScript engine every firing decides the groups again over the value sealed",
  "edits": [
   [
    "src/aggeval.ts",
    "      let us = this.cellReach.get(c);\n      if (us === undefined) {\n        if (sealedNow) continue;\n",
    "      let us: Unknown[] | undefined;\n      {\n"
   ]
  ],
  "expect": {
   "agg_precise_holes": "shrug[$kernel](ph_amin(a2,$unknown_value)"
  }
 },
 {
  "id": "agg_reach_unmemo",
  "what": "what an aggregate leaves undecided is found again at every firing",
  "expect": {
   "agg_precise_scale": "hole[$kernel]($adhoc,"
  }
 },
 {
  "id": "ts_agg_reach_unmemo",
  "what": "the TypeScript engine finds what an aggregate leaves undecided again at every firing",
  "edits": [
   [
    "src/aggeval.ts",
    "const memo = reads ? this.reachMemo.get(mk) : undefined;",
    "const memo = undefined as ReachMemo | undefined;"
   ]
  ],
  "expect": {
   "agg_precise_scale": "shrug[$kernel](sc_two(0,g0,$unknown_value)"
  }
 },
 {
  "id": "label_off",
  "what": "a fault names nothing: the unknown it leaves is anonymous, matches every group and decides no total",
  "expect": {
   "agg_label_holes": "lacks the row ltot[main](3)",
   "agg_precise_holes": "lacks the row ph_nwc[main](g1)"
  }
 },
 {
  "id": "label_ex_ignored",
  "what": "a labeled unknown is matched against a group it is known not to be: a group no unknown moves is a shrug",
  "expect": {
   "agg_label_holes": "lacks the row lqn[main](g5)"
  }
 },
 {
  "id": "label_regions_off",
  "what": "a group an unknown moves is never decided by the values the unknown could be",
  "expect": {
   "agg_label_holes": "lacks the row ltot[main](3)"
  }
 },
 {
  "id": "label_correlation_lost",
  "what": "a value that depends on a label is read as the same under every value of it: the cells of one unknown are judged apart",
  "expect": {
   "agg_label_holes": "lacks the row ltot[main](3)"
  }
 },
 {
  "id": "label_cap_ignored",
  "what": "the regions of many labels are all made, however many there are, and the group is decided or a plain hole, never a capped one",
  "expect": {
   "agg_label_cap": "lacks the row lcap[main](regions,203,64)"
  }
 },
 {
  "id": "label_open_correlation",
  "what": "a group a labeled unknown makes still holes the whole correlation, so it reads as every group",
  "expect": {
   "agg_precise_holes": "ph_hole_extra"
  }
 },
 {
  "id": "label_new_anonymous",
  "what": "the group a labeled unknown could make is an anonymous one, matching every group and every count",
  "expect": {
   "agg_precise_holes": "lacks the row ph_nwc[main](g1)"
  }
 },
 {
  "id": "label_sure_always",
  "what": "a tuple that may not exist is read as one that exists in every completion: a total over it is decided",
  "expect": {
   "agg_label_holes": "lutot[main]"
  }
 },
 {
  "id": "ts_label_off",
  "what": "the TypeScript engine names no fault",
  "edits": [
   [
    "src/aggeval.ts",
    "if (!ra.some((t) => t.k === 'v')) return s;",
    "if (!ra.some((t) => t.k === 'v') || true) return s;"
   ]
  ],
  "expect": {
   "agg_label_holes": "lacks the row ltot[main](3)"
  }
 },
 {
  "id": "ts_label_ex_ignored",
  "what": "the TypeScript engine matches a labeled unknown against a group it is known not to be",
  "edits": [
   [
    "src/unify.ts",
    "if (p !== null && isGround(ra) && !holdsUnknown(ra) && p.ex.some(",
    "if (false && p !== null && isGround(ra) && !holdsUnknown(ra) && p.ex.some("
   ]
  ],
  "expect": {
   "agg_label_holes": "lacks the row lqn[main](g5)"
  }
 },
 {
  "id": "ts_label_regions_off",
  "what": "the TypeScript engine never decides a group by the values an unknown could be",
  "edits": [
   [
    "src/aggeval.ts",
    "const rg = this.rankKey(a, s) === null &&",
    "const rg = false &&"
   ]
  ],
  "expect": {
   "agg_label_holes": "lacks the row ltot[main](3)"
  }
 },
 {
  "id": "ts_label_correlation_lost",
  "what": "the TypeScript engine reads a value that depends on a label as the same under every value of it",
  "edits": [
   [
    "src/labeled.ts",
    "const hit = b.cases.find(([k]) => caseMatches(k, labels, rg, at));",
    "const hit = undefined;"
   ]
  ],
  "expect": {
   "agg_label_holes": "lacks the row ltot[main](3)"
  }
 },
 {
  "id": "ts_label_cap_ignored",
  "what": "the TypeScript engine makes every region, however many",
  "edits": [
   [
    "src/labeled.ts",
    "if (n > LABEL_REGIONS) return { k: 'capped', n };",
    ""
   ]
  ],
  "expect": {
   "agg_label_cap": "lacks the row lcap[main](regions,203,64)"
  }
 },
 {
  "id": "ts_label_open_correlation",
  "what": "the TypeScript engine holes the whole correlation for a group a labeled unknown makes",
  "edits": [
   [
    "src/aggeval.ts",
    "p.pat.some((t) => t === null) && !labeledOpen(p) && !open.some(",
    "p.pat.some((t) => t === null) && !open.some("
   ]
  ],
  "expect": {
   "agg_precise_holes": "ph_hole_extra"
  }
 },
 {
  "id": "ts_label_new_anonymous",
  "what": "the TypeScript engine reads the group a labeled unknown could make as an anonymous one",
  "edits": [
   [
    "src/aggeval.ts",
    "if (labeledOpen(p)) {",
    "if (false && labeledOpen(p)) {"
   ]
  ],
  "expect": {
   "agg_precise_holes": "lacks the row ph_nwc[main](g1)"
  }
 },
 {
  "id": "ts_label_sure_always",
  "what": "the TypeScript engine reads a tuple that may not exist as one that exists in every completion",
  "edits": [
   [
    "src/aggeval.ts",
    "const sure = this.lastFault === 'arith_overflow' && this.faultSure(r, s, at);",
    "const sure = true;"
   ]
  ],
  "expect": {
   "agg_label_holes": "lutot[main]"
  }
 },
 {
  "id": "label_by_values_ignored",
  "what": "a value that depends on a label is matched against a value none of its cases has: a count no completion gives is a shrug",
  "expect": {
   "agg_label_holes": "lb_sh3[main]"
  }
 },
 {
  "id": "ts_label_by_values_ignored",
  "what": "the TypeScript engine matches a value that depends on a label against a value none of its cases has",
  "edits": [
   [
    "src/unify.ts",
    "if (isGround(ra) && !holdsUnknown(ra)) { const vs = byValues(t);",
    "if (false && isGround(ra) && !holdsUnknown(ra)) { const vs = byValues(t);"
   ]
  ],
  "expect": {
   "agg_label_holes": "lb_sh3[main]"
  }
 },
 {
  "id": "label_match_unconditional",
  "what": "a value matched against a labeled unknown is read as holding in every completion: a member read only where the unknown is a value is always there",
  "expect": {
   "agg_label_oracle": "lo_bad"
  }
 },
 {
  "id": "ts_label_match_unconditional",
  "what": "the TypeScript engine reads a value matched against a labeled unknown as holding in every completion",
  "edits": [
   [
    "src/unify.ts",
    "return bindUnknown([ra], same ? s : unsure(s));",
    "return bindUnknown([ra], s);"
   ]
  ],
  "expect": {
   "agg_label_oracle": "lo_bad"
  }
 },
 {
  "id": "retract_no_subtract",
  "what": "a dropped member's value is not subtracted from the total of a count or sum",
  "expect": {
   "agg_incr_sum": "lacks the row ai_total[main](a,5)",
   "agg_incr_tagc": "lacks the row ic_"
  }
 },
 {
  "id": "retract_stale_rep",
  "what": "a member that rests on a retracted fact keeps that derivation instead of the one that is left",
  "expect": {
   "agg_incr_sum": "lacks the row mem $cell(r9f34c003,2,0,$cons(b,$nil)) #1"
  }
 },
 {
  "id": "keep_first_derivation",
  "what": "a member keeps only its canonical derivation: the others are dropped when the cell is sealed",
  "expect": {
   "agg_member_derivs_state": "lacks the row mem $cell(r71cb3651,2,0,$cons(a,$nil)) #2",
   "agg_member_derivs_retract": "lacks the row mem $cell(rea3e7ccf,2,0,$cons(a,$nil)) #1",
   "agg_member_derivs_why": "why_text_missing"
  }
 },
 {
  "id": "retract_alts_unindexed",
  "what": "the back-index cites a member's canonical derivation only: a retracted fact that is another derivation leaves the member's derivation set as it was",
  "expect": {
   "agg_member_derivs_retract": "holds the row mem $cell(rea3e7ccf,2,0,$cons(a,$nil)) #1 id=2253268ea44d73e0"
  }
 },
 {
  "id": "retract_alt_member_dropped",
  "what": "a retraction drops a member that another derivation still supports (an excise of one of its facts removes the member's row with it)",
  "expect": {
   "agg_member_derivs_retract": "lacks the row mem $cell(rea3e7ccf,2,0,$cons(a,$nil)) #1"
  }
 },
 {
  "id": "why_all_one_derivation",
  "what": "`why all` prints a member's canonical derivation only",
  "expect": {
   "agg_member_derivs_why": "why_text_missing"
  }
 },
 {
  "id": "ts_keep_first_derivation",
  "what": "the TypeScript evaluator seals a member with its canonical derivation only",
  "edits": [
   [
    "src/aggeval.ts",
    "others: (alts.get(reps[o]) ?? []).map((i) => cands[i].prems) });",
    "others: [] });"
   ]
  ],
  "expect": {
   "agg_member_derivs_state": "lacks the row mem $cell(r71cb3651,2,0,$cons(a,$nil)) #2"
  }
 },
 {
  "id": "ts_why_all_one_derivation",
  "what": "the TypeScript explainer prints a member's canonical derivation only under `why all`",
  "edits": [
   [
    "src/aggeval.ts",
    "if (o.members !== Infinity) return;",
    "return;"
   ]
  ],
  "expect": {
   "agg_member_derivs_why": "why_text_missing"
  }
 },
 {
  "id": "retract_deep_neg_unread",
  "what": "a fact read negated inside an aggregate body is retracted as if only the back-index read it: the cell keeps the members it had",
  "expect": {
   "agg_incr_neginner": "lacks the row ni_n[main](g,2)"
  }
 },
 {
  "id": "cited_past_canonical_only",
  "what": "the past-tick premises a live cell cites are walked in each member's canonical derivation only: the derived_by row a member's other derivation alone cites is pruned",
  "expect": {
   "agg_member_derivs_ticks": "mty_text_missing"
  }
 },
 {
  "id": "ts_cited_past_canonical_only",
  "what": "the TypeScript evaluator walks the past-tick premises of a member's canonical derivation only",
  "edits": [
   [
    "src/aggeval.ts",
    "for (const q of [m.prems, ...m.others].flat()) if (q.t === 'fact')",
    "for (const q of m.prems) if (q.t === 'fact')"
   ]
  ],
  "expect": {
   "agg_member_derivs_ticks": "mty_text_missing"
  }
 },
 {
  "id": "retract_no_readers",
  "what": "the facts a cell's reader concluded from its old record stay when the cell is replaced",
  "expect": {
   "agg_incr_sum": "holds the row ai_total[main](a,15)"
  }
 },
 {
  "id": "retract_no_refire",
  "what": "what read a replaced cell does not read the new one",
  "expect": {
   "agg_incr_sum": "lacks the row ai_total[main](a,5)"
  }
 },
 {
  "id": "retract_no_rederive",
  "what": "an idempotent cell is not derived again after one of its supports is retracted",
  "expect": {
   "agg_incr_minmax": "lacks the row am_lo[main](a,3)",
   "agg_incr_holistic": "lacks the row ah_med[main](a,4)"
  }
 },
 {
  "id": "retract_index_off",
  "what": "the back-index finds no cell for a retracted fact",
  "expect": {
   "agg_incr_sum": "holds the row ai_total[main](a,15)"
  }
 },
 {
  "id": "retract_gate_plain",
  "what": "a fact a plain rule reads is retracted as if only aggregates read it",
  "expect": {
   "agg_incr_gate": "holds the row ag_big[main](1)"
  }
 },
 {
  "id": "retract_gate_neg",
  "what": "a fact a negation reads is retracted as if only aggregates read it",
  "expect": {
   "agg_incr_neg": "lacks the row ag_quiet[main](b)"
  }
 },
 {
  "id": "retract_empty_gone",
  "what": "a count of a bound key with no member left is gone instead of 0",
  "expect": {
   "agg_incr_sum": "lacks the row ai_n[main](c,0)"
  }
 },
 {
  "id": "retract_memo_stale",
  "what": "the correlation's cells are not updated, so what reads them reads the old record",
  "expect": {
   "agg_incr_sum": "lacks the row ai_total[main](a,5)"
  }
 },
 {
  "id": "member_id_position",
  "what": "a member's id is a function of its place in the cell, which a re-seal changes",
  "expect": {
   "agg_incr_sum": "lacks the row mem $cell(r77e892da,1,0,$cons(a,$nil)) #1 id=af25"
  }
 },
 {
  "id": "alg_flags_off",
  "what": "a cell records no algebra flags",
  "expect": {
   "agg_incr_sum": "alg=invertible use=subtract",
   "agg_incr_minmax": "alg=idempotent,lattice use=rederive",
   "agg_incr_holistic": "alg=holistic use=recompute",
   "agg_incr_lattice": "lacks the row lat il_dist min alg=idempotent,lattice use=rederive",
   "agg_incr_join": "lacks the row lat ij_comp union alg=idempotent,lattice use=rederive",
   "agg_incr_sub": "lacks the row lat is_route subsumption alg=idempotent use=rederive"
  }
 },
 {
  "id": "firing_id_tickless",
  "what": "a firing's id leaves out its tick",
  "expect": {
   "agg_incr_lattice": "lacks the row fir il_dist",
   "agg_incr_tagc": "lacks the row fir ic_walks@count"
  }
 },
 {
  "id": "fir_superseded_live",
  "what": "a firing of a superseded value is printed as live",
  "expect": {
   "agg_incr_lattice": "lacks the row fir il_dec"
  }
 },
 {
  "id": "tag_flags_off",
  "what": "a semiring tag's relation records no algebra flags",
  "expect": {
   "agg_incr_tag": "lacks the row lat it_cost",
   "agg_incr_tagc": "lacks the row lat ic_walks@count"
  }
 },
 {
  "id": "tag_cell_flag_off",
  "what": "the cell of a counting tag is not marked as a tag's",
  "expect": {
   "agg_incr_tagc": "alg=invertible,tag use=subtract"
  }
 },
 {
  "id": "widening_flag_off",
  "what": "a widened join relation is not marked widening, and its strategy is not full",
  "expect": {
   "agg_incr_widen": "lacks the row lat iw_o"
  }
 },
 {
  "id": "retract_lattice_precise",
  "what": "a lattice fact is in the cone only if every firing of it rests on the cone, so a cycle that rested on the fact alone stands",
  "expect": {
   "agg_incr_lattice": "holds the row il_hop[main](d,2)"
  }
 },
 {
  "id": "retract_tag_derivations_kept",
  "what": "the derivations of a counting tag that cited a retracted fact stay",
  "expect": {
   "agg_incr_tagc": "holds the row ic_"
  }
 },
 {
  "id": "retract_thr_no_close",
  "what": "a threshold cell derived again keeps the provisional quorum of its first members",
  "expect": {
   "agg_incr_holistic": "the state lacks the row"
  }
 },
 {
  "id": "retract_chain_gate_off",
  "what": "an aggregate that reads what another of its rule binds is retracted from as if its cells were all indexed",
  "expect": {
   "agg_incr_chain": "holds the row cell"
  }
 },
 {
  "id": "retract_partial_gate_off",
  "what": "an aggregate after one that may leave no solution is retracted from as if it were sealed for every group",
  "expect": {
   "agg_incr_partial": "holds the row cell"
  }
 },
 {
  "id": "retract_hole_kept",
  "what": "a retraction that makes a hole is taken by the delta, which writes none of its shrugs",
  "expect": {
   "agg_incr_overflow": "lacks the row shrug"
  }
 },
 {
  "id": "retract_lattice_hole_kept",
  "what": "a retraction under a lattice that makes a hole is taken by the delta, which writes none of its shrugs",
  "expect": {
   "agg_incr_latticehole": "lacks the row shrug"
  }
 },
 {
  "id": "ts_stock_stale_holes_kept",
  "what": "the TypeScript evaluator keeps the hole rows of the evaluation before when a world is evaluated again",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (plan.hits.size === 0) this.store.dropEvalHoles();",
    "    if (plan.hits.size === 0) { /* kept */ }"
   ]
  ],
  "expect": {
   "agg_incr_stockholes": "holds the row hr_"
  }
 },
 {
  "id": "retract_stacked_plain",
  "what": "a rule that negates or aggregates what changed is treated as a plain reader: only the facts that cite what went are taken out",
  "expect": {
   "agg_incr_stacked": "lacks the row st_"
  }
 },
 {
  "id": "retract_stacked_facts_kept",
  "what": "the facts of a rule read again whole stay beside the ones it concludes again",
  "expect": {
   "agg_incr_stacked": "holds the row st_"
  }
 },
 {
  "id": "retract_stacked_cells_kept",
  "what": "the cells of a rule read again whole stay, and the rule reads the old record",
  "expect": {
   "agg_incr_stacked": "holds the row cell"
  }
 },
 {
  "id": "retract_stacked_one_level",
  "what": "the rules read again fire in one wave, whatever the level of what they read",
  "expect": {
   "agg_incr_stacked": "st_"
  }
 },
 {
  "id": "retract_consumers_kept",
  "what": "the facts of plain rules that rested on a replaced cell or a retracted lattice value stay beside the ones derived again",
  "expect": {
   "agg_incr_readers": "holds the row ir_"
  }
 },
 {
  "id": "stale_holes_kept",
  "what": "the hole rows an evaluation wrote stand when the world is evaluated again",
  "expect": {
   "agg_incr_stale": "holds the row hole"
  }
 },
 {
  "id": "ds_seal_early",
  "what": "a correlation of a component stratified by its data is read before the layer it belongs to is released",
  "expect": {
   "agg_datastrat_eval": "changed after it sealed",
   "agg_datastrat_tree": "changed after it sealed",
   "agg_datastrat_tick": "changed after it sealed",
   "agg_datastrat_holes": "changed after it sealed"
  }
 },
 {
  "id": "ds_layer_flat",
  "what": "a layer is the greatest below it, not one more: every correlation is released with the first",
  "expect": {
   "agg_datastrat_eval": "changed after it sealed",
   "agg_datastrat_tree": "changed after it sealed"
  }
 },
 {
  "id": "ds_cycle_unseen",
  "what": "a cycle through a correlation in the data is not refused",
  "expect": {
   "agg_datastrat_cycle": "refused, but not for"
  }
 },
 {
  "id": "ds_no_demote",
  "what": "no component is ranked by its data: the program is refused as it was by its relations",
  "expect": {
   "agg_datastrat_eval": "the world does not evaluate",
   "agg_datastrat_tree": "the world does not evaluate"
  }
 },
 {
  "id": "ds_barred_ignored",
  "what": "a component with a lattice in it is ranked by its data too",
  "expect": {
   "agg_datastrat_cycle": "was to be refused"
  }
 },
 {
  "id": "ds_wild_keys",
  "what": "every position of a pattern the data walk reads is a wildcard: a cell reads every cell",
  "expect": {
   "agg_datastrat_eval": "the world does not evaluate",
   "agg_datastrat_tree": "the world does not evaluate"
  }
 },
 {
  "id": "ds_builtin_dead",
  "what": "a builtin the data walk cannot decide fails the branch it stands in",
  "expect": {
   "agg_datastrat_eval": "changed after it sealed"
  }
 },
 {
  "id": "ds_hole_uncarried",
  "what": "what a hole left unknown is not carried before the next layer of a stratified component is read",
  "expect": {
   "agg_datastrat_holes": "adh_leak"
  }
 },
 {
  "id": "ds_root_dropped",
  "what": "the last correlation the walk finds is never released",
  "expect": {
   "agg_datastrat_eval": "never reached"
  }
 },
 {
  "id": "ds_comps_unordered",
  "what": "two components of one round are run in the order of their names, not the one that reads the other last",
  "expect": {
   "agg_datastrat_two": "d2_wrong"
  }
 },
 {
  "id": "ds_neg_invisible",
  "what": "a negation inside an aggregate's body over the component is read as holding: the cell does not wait for it",
  "expect": {
   "agg_datastrat_neg": "changed after it sealed",
   "agg_datastrat_cycle": "refused, but not for"
  }
 },
 {
  "id": "ds_closed_agg_unbound",
  "what": "an aggregate over closed relations binds nothing in the data walk",
  "expect": {
   "agg_datastrat_keys": "the world does not evaluate"
  }
 },
 {
  "id": "ds_in_undecided",
  "what": "the data walk does not decide `E in S` with S known",
  "expect": {
   "agg_datastrat_keys": "the world does not evaluate"
  }
 },
 {
  "id": "ds_comp_not_reread",
  "what": "a retraction that reaches a component stratified by its data fires its rules again at once, with no walk of its data",
  "expect": {
   "agg_datastrat_retract": "the state lacks the row value"
  }
 },
 {
  "id": "ds_group_whole",
  "what": "a group the rule binds is read as the whole correlation: a group that reads another group of its own relation is a cycle",
  "expect": {
   "agg_datastrat_groups": "the world does not evaluate",
   "agg_datastrat_cycle": "refused, but not for"
  }
 },
 {
  "id": "ds_group_resealed",
  "what": "the whole correlation of a grouped element seals again the groups a narrower one sealed",
  "expect": {
   "agg_datastrat_groups": "sealed twice"
  }
 },
 {
  "id": "ds_ground_unreleased",
  "what": "a group the rule binds is never released on its own: only the whole correlation is",
  "expect": {
   "agg_datastrat_groups": "changed after it sealed"
  }
 },
 {
  "id": "ds_layer_fires_whole",
  "what": "a layer of a stratified component fires every instance of the rules that own its correlations, not only the instances new to it",
  "expect": {
   "agg_datastrat_chain": "the state holds the row hole"
  }
 },
 {
  "id": "ds_layer_refires",
  "what": "a layer fires an instance again for each of its elements a layer releases, not once for the first",
  "expect": {
   "agg_datastrat_budget": "the state lacks the row value"
  }
 },
 {
  "id": "ds_wide_unlisted",
  "what": "the whole correlation of a grouped element drops the groups a narrower one sealed instead of listing their cells",
  "expect": {
   "agg_datastrat_wide": "changed after it sealed"
  }
 },
 {
  "id": "ds_hold_grouped",
  "what": "an element a layer released is held while a later one is fired even where the later one is grouped, and the instance is read by neither",
  "expect": {
   "agg_datastrat_elems": "changed after it sealed"
  }
 },
 {
  "id": "ds_any_writable",
  "what": "the mark of a group no rule bound is an atom the source can write",
  "expect": {
   "agg_datastrat_wide": "the world does not evaluate"
  }
 },
 {
  "id": "ds_layer_unfired",
  "what": "a layer fires nothing, so the final firing of the component makes every conclusion",
  "expect": {
   "agg_datastrat_eval": "missed an instance"
  }
 },
 {
  "id": "ds_any_printed_raw",
  "what": "the mark of a group no rule bound is printed as the byte it is, in a hole or a shrug that names the correlation",
  "expect": {
   "agg_datastrat_mark": "the state lacks the row hole"
  }
 },
 {
  "id": "ds_spread_uncarried",
  "what": "an unknown a fault below the component carried is not carried through the component's own rules before its layers seal",
  "expect": {
   "agg_datastrat_below": "dz_missing",
   "agg_datastrat_below_sum": "dz_missing"
  }
 },
 {
  "id": "retract_thr_cells_kept",
  "what": "the thresholds of a rule read again whole stay known to the evaluation: a quorum cell that is gone is found where it was",
  "expect": {
   "agg_incr_thr": "lacks the row th_"
  }
 },
 {
  "id": "retract_thr_unclosed",
  "what": "the quorums a retraction reaches again are not closed",
  "expect": {
   "agg_incr_thr": "lacks the row cell"
  }
 },
 {
  "id": "retract_swept_cell_subtracted",
  "what": "a cell of a rule read again whole is subtracted from as well",
  "expect": {
   "agg_incr_twice": "holds the row agg_cell"
  }
 },
 {
  "id": "retract_demand_kept",
  "what": "the facts made at the calls of a relation answered on demand stay when the rules that call it fire again",
  "expect": {
   "agg_incr_demand": "the state holds the row dm_big"
  }
 },
 {
  "id": "restage_dead_kept",
  "what": "a staged fact whose firing cited what is gone stays staged",
  "expect": {
   "agg_incr_staged": "does not evaluate"
  }
 },
 {
  "id": "restage_first_wins",
  "what": "a staged fact two firings reach is kept with the first one the refiring finds, and the world is not evaluated again",
  "expect": {
   "agg_incr_staged": "lacks the row wit sg_pick"
  }
 },
 {
  "id": "ts_ds_seal_early",
  "what": "the TypeScript gate reads a correlation of a stratified component before its layer is released",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (this.dsReleased.has(mk)) return true;",
    "    if (this.dsReleased.has(mk) || mk.length > 0) return true;"
   ]
  ],
  "expect": {
   "agg_datastrat_eval": "changed after it sealed",
   "agg_datastrat_tree": "changed after it sealed"
  }
 },
 {
  "id": "ts_ds_cycle_unseen",
  "what": "the TypeScript walk does not refuse a cycle through a correlation",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (bad.length > 0) {\n      const text = (i: number): string => this.dsNodeText(nodes[i]);",
    "    if (bad.length > 0 && bad.length < 0) {\n      const text = (i: number): string => this.dsNodeText(nodes[i]);"
   ]
  ],
  "expect": {
   "agg_datastrat_cycle": "refused, but not for"
  }
 },
 {
  "id": "ts_ds_no_demote",
  "what": "the TypeScript peel takes no component by its data",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (demote.size === 0) return null;",
    "    if (demote.size >= 0) return null;"
   ]
  ],
  "expect": {
   "agg_datastrat_eval": "the world does not evaluate",
   "agg_datastrat_tree": "the world does not evaluate"
  }
 },
 {
  "id": "ts_ds_hole_uncarried",
  "what": "the TypeScript engine does not carry what a hole left unknown between the layers of a stratified component",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (this.plainPending.length === 0 && this.plainUndecided.length === 0 && this.latUndecided.length === 0 && this.latSpread.size === 0) return;\n    this.closePlainRules(comp.round + 1);",
    "    if (true as boolean) return;\n    this.closePlainRules(comp.round + 1);"
   ]
  ],
  "expect": {
   "agg_datastrat_holes": "adh_leak"
  }
 },
 {
  "id": "ts_ds_builtin_dead",
  "what": "the TypeScript walk fails the branch of a builtin it cannot decide",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (!this.dsDecides(op, l, r, s)) return [s];",
    "    if (!this.dsDecides(op, l, r, s)) return [];"
   ]
  ],
  "expect": {
   "agg_datastrat_eval": "changed after it sealed"
  }
 },
 {
  "id": "ts_ds_layer_flat",
  "what": "the TypeScript layer is the greatest below it, not one more",
  "edits": [
   [
    "src/aggeval.ts",
    "d = Math.max(d, depth[k] + (isAgg(j) ? 1 : 0));",
    "d = Math.max(d, depth[k]);"
   ]
  ],
  "expect": {
   "agg_datastrat_eval": "changed after it sealed",
   "agg_datastrat_tree": "changed after it sealed"
  }
 },
 {
  "id": "ts_ds_comps_unordered",
  "what": "the TypeScript engine runs two components of one round in the order of their names",
  "edits": [
   [
    "src/aggeval.ts",
    "      let first = comps.findIndex((_, i) => !readsAnother(i));",
    "      let first = 0 * comps.findIndex((_, i) => !readsAnother(i));"
   ]
  ],
  "expect": {
   "agg_datastrat_two": "d2_wrong"
  }
 },
 {
  "id": "ts_ds_neg_invisible",
  "what": "the TypeScript walk reads a negation inside an aggregate's body over the component as holding",
  "edits": [
   [
    "src/aggeval.ts",
    "    } else if (b.t === 'neg' && comp.rels.has(b.lit.rel)) {",
    "    } else if (b.t === 'neg' && comp.rels.has(b.lit.rel) && b.lit.rel.length < 0) {"
   ]
  ],
  "expect": {
   "agg_datastrat_neg": "changed after it sealed",
   "agg_datastrat_cycle": "refused, but not for"
  }
 },
 {
  "id": "ts_ds_closed_agg_unbound",
  "what": "the TypeScript walk binds nothing by an aggregate over closed relations",
  "edits": [
   [
    "src/aggeval.ts",
    "for (const s2 of this.dsAggClosed(rid, b, s)) this.dsWalk(",
    "for (const s2 of [s]) this.dsWalk("
   ]
  ],
  "expect": {
   "agg_datastrat_keys": "the world does not evaluate"
  }
 },
 {
  "id": "ts_ds_in_undecided",
  "what": "the TypeScript walk does not decide `E in S` with S known",
  "edits": [
   [
    "src/aggeval.ts",
    "return op === 'is' || op === 'in' ? gr : op === '=' ? true : gl && gr;",
    "return op === 'is' ? gr : op === '=' ? true : gl && gr;"
   ]
  ],
  "expect": {
   "agg_datastrat_keys": "the world does not evaluate"
  }
 },
 {
  "id": "ts_ds_group_whole",
  "what": "the TypeScript walk reads a group the rule binds as the whole correlation",
  "edits": [
   [
    "src/aggeval.ts",
    "        for (const i of plan.group) {\n          const t = resolve(mkv(b.shared![i]), s);\n          corr.push(isGround(t) ? t : DS_ANY);",
    "        for (const i of plan.group) {\n          const t = resolve(mkv(b.shared![i]), s);\n          corr.push(DS_ANY);"
   ]
  ],
  "expect": {
   "agg_datastrat_groups": "the world does not evaluate",
   "agg_datastrat_cycle": "refused, but not for"
  }
 },
 {
  "id": "ts_ds_group_resealed",
  "what": "the TypeScript whole correlation of a grouped element seals again the groups a narrower one sealed",
  "edits": [
   [
    "src/aggeval.ts",
    "if (keep && plan.group.length > 0 && this.dsElems.has(`${rid}|${a.at}`)) {\n      for (let j",
    "if (keep && plan.group.length > 0 && this.dsElems.has(`${rid}|${a.at}`) && false) {\n      for (let j"
   ]
  ],
  "expect": {
   "agg_datastrat_groups": "sealed twice"
  }
 },
 {
  "id": "ts_ds_ground_unreleased",
  "what": "the TypeScript walk releases no group the rule binds on its own",
  "edits": [
   [
    "src/aggeval.ts",
    "      if (nd.k !== 'a') continue;\n      const d = depth[compOf[i]];",
    "      if (nd.k !== 'a' || nd.corr.slice(nd.corr.length - (this.aggPlans.get(`${nd.rid}|${nd.at}`)?.group.length ?? 0)).some((t) => t !== DS_ANY)) continue;\n      const d = depth[compOf[i]];"
   ]
  ],
  "expect": {
   "agg_datastrat_groups": "changed after it sealed"
  }
 },
 {
  "id": "ts_ds_layer_fires_whole",
  "what": "the TypeScript layer fires every instance of the rules that own its correlations",
  "edits": [
   [
    "src/aggeval.ts",
    "      this.fireKeys(layer);",
    "      this.dsCharge = true;\n      try { this.fireAll(owners); } finally { this.dsCharge = false; }"
   ]
  ],
  "expect": {
   "agg_datastrat_chain": "the state holds the row hole"
  }
 },
 {
  "id": "ts_ds_layer_refires",
  "what": "the TypeScript layer fires an instance again for each of its elements a layer releases",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (this.dsFiring !== null && this.dsLayer.has(mk)) {",
    "    if (this.dsFiring !== null && this.dsLayer.has(mk) && false) {"
   ]
  ],
  "expect": {
   "agg_datastrat_budget": "the state lacks the row value"
  }
 },
 {
  "id": "ts_ds_wide_unlisted",
  "what": "the TypeScript whole correlation drops the groups a narrower one sealed",
  "edits": [
   [
    "src/aggeval.ts",
    "    ids.push(...reuse);\n",
    "    if (reuse.length < 0) ids.push(...reuse);\n"
   ]
  ],
  "expect": {
   "agg_datastrat_wide": "changed after it sealed"
  }
 },
 {
  "id": "ts_ds_hold_grouped",
  "what": "the TypeScript layer holds an earlier element while a grouped one is fired",
  "edits": [
   [
    "src/aggeval.ts",
    "this.dsFiring = whole ? [k.rid, k.at] : null;",
    "this.dsFiring = [k.rid, k.at];"
   ]
  ],
  "expect": {
   "agg_datastrat_elems": "changed after it sealed"
  }
 },
 {
  "id": "ts_ds_any_writable",
  "what": "the TypeScript mark of a group no rule bound is an atom the source can write",
  "edits": [
   [
    "src/aggeval.ts",
    "const DS_ANY = mka(DS_ANY_NAME);",
    "const DS_ANY = mka('$ds_any');"
   ]
  ],
  "expect": {
   "agg_datastrat_wide": "the world does not evaluate"
  }
 },
 {
  "id": "ts_ds_layer_unfired",
  "what": "the TypeScript layer fires nothing",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (keys.length === 0) return;\n    const owners: ERule[] = [];",
    "    if (keys.length >= 0) return;\n    const owners: ERule[] = [];"
   ]
  ],
  "expect": {
   "agg_datastrat_eval": "missed an instance"
  }
 },
 {
  "id": "ts_ds_any_printed_raw",
  "what": "the TypeScript printing of a term writes the mark of a group no rule bound as the byte it is",
  "edits": [
   [
    "src/unify.ts",
    "    case 'a': return t.name === DS_ANY_NAME ? '_' : t.name;",
    "    case 'a': return t.name;"
   ]
  ],
  "expect": {
   "agg_datastrat_mark": "the state lacks the row hole"
  }
 },
 {
  "id": "ts_ds_spread_uncarried",
  "what": "the TypeScript engine does not carry what a fault below the component left unknown through its rules before the layers seal",
  "edits": [
   [
    "src/aggeval.ts",
    "this.latUndecided.length === 0 && this.latSpread.size === 0) return;",
    "this.latUndecided.length === 0 && true) return;"
   ]
  ],
  "expect": {
   "agg_datastrat_below": "dz_missing",
   "agg_datastrat_below_sum": "dz_missing"
  }
 },
 {
  "id": "rank_dir_ignored",
  "what": "a rank key's direction is read as ascending, whatever the key is wrapped in",
  "expect": {
   "agg_rank_tuple_eval": "place_wrong",
   "agg_rank_tuple_witness": "member_wrong_at",
   "agg_rank_tuple_holes": "hole_missing"
  }
 },
 {
  "id": "rank_first_key_only",
  "what": "a rank over a tuple compares the first key and calls the rest equal",
  "expect": {
   "agg_rank_tuple_eval": "place_wrong"
  }
 },
 {
  "id": "rank_kind_order",
  "what": "a rank key's atoms sort after its strings, not before",
  "expect": {
   "agg_rank_tuple_eval": "mixaa_wrong"
  }
 },
 {
  "id": "rank_tuple_insertion",
  "what": "a rank over a tuple of a subject that is none of the tuples is where it would stand",
  "expect": {
   "agg_rank_tuple_eval": "ask_wrong",
   "agg_rank_tuple_witness": "unranked_valued"
  }
 },
 {
  "id": "rank_members_unordered",
  "what": "the members of a rank over a tuple are listed by height and text, not in the tuple's order",
  "expect": {
   "agg_rank_tuple_witness": "member_wrong_at"
  }
 },
 {
  "id": "rank_share_coarse",
  "what": "cells over one shared group are shared across the groups too",
  "expect": {
   "agg_rank_tuple_eval": "asc_missing"
  }
 },
 {
  "id": "rank_reach_blind",
  "what": "no unknown moves a rank over a tuple",
  "expect": {
   "agg_rank_tuple_holes": "hole_missing"
  }
 },
 {
  "id": "rank_compound_key",
  "what": "a compound term is read as a key, the atom with no name",
  "expect": {
   "agg_rank_tuple_eval": "hole_unmarked"
  }
 },
 {
  "id": "rank_door_subject_wrapped",
  "what": "the load door takes a rank's subject written in asc(..) or desc(..)",
  "expect": {
   "agg_rank_tuple_safety": "refused, but not for"
  }
 },
 {
  "id": "rank_door_key_compound",
  "what": "the load door takes a rank key that is a compound term",
  "expect": {
   "agg_rank_tuple_safety": "was to be refused"
  }
 },
 {
  "id": "phrase_rank_dir_dropped",
  "what": "rofl-render writes a rank key without its direction",
  "expect": {
   "agg_rank_tuple_phrase": "pt_wrong"
  }
 },
 {
  "id": "rank_arity_unchecked",
  "what": "safety.rofl takes a rank over a tuple with a different number of keys and subjects",
  "edits": [
   [
    "safety.rofl",
    "agg_refused(R, rank_key_arity)     :- agg_tuple_rank(R, K), not rank_arity_ok(R, K).\n",
    ""
   ]
  ],
  "expect": {
   "agg_rank_tuple_safety": "was to be refused",
   "agg_holistic_safety": "was to be refused"
  }
 },
 {
  "id": "ts_rank_dir_ignored",
  "what": "the TypeScript rank key's direction is read as ascending",
  "edits": [
   [
    "src/cell.ts",
    "    if (c !== 0) return desc[i] ? -c : c;",
    "    if (c !== 0) return c;"
   ]
  ],
  "expect": {
   "agg_rank_tuple_eval": "place_wrong"
  }
 },
 {
  "id": "ts_rank_kind_order",
  "what": "the TypeScript rank key sorts atoms after strings",
  "edits": [
   [
    "src/cell.ts",
    "const kindRank = (x: KeyAtom): number => (x.k === 'i' ? 0 : x.k === 'a' ? 1 : 2);",
    "const kindRank = (x: KeyAtom): number => (x.k === 'i' ? 0 : x.k === 'a' ? 2 : 1);"
   ]
  ],
  "expect": {
   "agg_rank_tuple_eval": "mixaa_wrong"
  }
 },
 {
  "id": "ts_rank_members_unordered",
  "what": "the TypeScript members of a rank over a tuple are listed by height and text",
  "edits": [
   [
    "src/aggeval.ts",
    "      if (rk && katoms.every((x) => typeof x !== 'string')) {",
    "      if (false && katoms.every((x) => typeof x !== 'string')) {"
   ]
  ],
  "expect": {
   "agg_rank_tuple_witness": "member_wrong_at"
  }
 },
 {
  "id": "ts_rank_reach_blind",
  "what": "no unknown moves a rank over a tuple in the TypeScript engine",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (!stays) for (const [, xs] of fresh) for (const u of xs) push(u);\n    return us;\n  }\n\n  /** A FAULT EVERY",
    "    if (false) for (const [, xs] of fresh) for (const u of xs) push(u);\n    return us;\n  }\n\n  /** A FAULT EVERY"
   ]
  ],
  "expect": {
   "agg_rank_tuple_holes": "hole_missing"
  }
 },
 {
  "id": "ts_rank_door_subject_wrapped",
  "what": "the TypeScript load door takes a rank's subject written in asc(..) or desc(..)",
  "edits": [
   [
    "src/aggeval.ts",
    "    if (keyDir(p)[1]) return `rank's subject has no direction",
    "    if (false) return `rank's subject has no direction"
   ]
  ],
  "expect": {
   "agg_rank_tuple_safety": "refused, but not for"
  }
 },
 {
  "id": "ts_rank_compound_key",
  "what": "the TypeScript rank reads a compound term as a key, the atom with no name",
  "edits": [
   [
    "src/cell.ts",
    "    if (t.k === 's') return { k: 's', v: t.v };\n    throw new Refused(AGG_TYPE);",
    "    if (t.k === 's') return { k: 's', v: t.v };\n    return { k: 'a', v: '' };"
   ]
  ],
  "expect": {
   "agg_rank_tuple_eval": "hole_unmarked"
  }
 },
 {
  "id": "ts_rank_share_coarse",
  "what": "the TypeScript cells over one shared group are shared across the groups too",
  "edits": [
   [
    "src/aggeval.ts",
    "listKey(corr.filter((_, n) => !ats.includes(n)))",
    "listKey(corr.filter(() => false))"
   ]
  ],
  "expect": {
   "agg_rank_tuple_eval": "asc_missing"
  }
 },
 {
  "id": "reader_rank_dir_dropped",
  "what": "the reader reads a rank key's direction and drops it",
  "edits": [
   [
    "scripts/read_md.ts",
    "        return d ? { f: d[2] === 'descending' ? 'desc' : 'asc', args: [t] } : t;",
    "        return t;"
   ]
  ],
  "expect": {
   "agg_rank_tuple_phrase": "pt_wrong"
  }
 },
 {
  "id": "witness_by_signature",
  "what": "`why` shows the firing of least signature, not of least derivation height: the circle where a direct firing exists",
  "expect": {
   "why_height": "wh_missing",
   "why_forest": "wf_missing"
  }
 },
 {
  "id": "ts_witness_by_signature",
  "what": "the TypeScript store picks the canonical firing by signature alone",
  "edits": [
   [
    "src/store.ts",
    "return this.firingsRanked(key, memo)[0];",
    "return [...sigs.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))[0][1];"
   ]
  ],
  "expect": {
   "why_height": "wh_missing",
   "why_forest": "wf_missing"
  }
 },
 {
  "id": "why_all_one_tree",
  "what": "`why all` of an ordinary fact writes its shortest firing only",
  "expect": {
   "why_height": "wh_missing",
   "why_forest": "wf_missing"
  }
 },
 {
  "id": "ts_why_all_one_tree",
  "what": "the TypeScript explainer writes an ordinary fact's shortest firing only under `why all`",
  "edits": [
   [
    "src/aggeval.ts",
    "rest.forEach((x, k) => {",
    "rest.slice(0, 0).forEach((x, k) => {"
   ]
  ],
  "expect": {
   "why_height": "wh_missing",
   "why_forest": "wf_missing"
  }
 },
 {
  "id": "why_hint_missing",
  "what": "`why` of a fact with other firings does not say how many",
  "expect": {
   "why_height": "wh_missing",
   "why_forest": "wf_missing"
  }
 },
 {
  "id": "ts_why_hint_missing",
  "what": "the TypeScript explainer does not say how many other firings a fact has",
  "edits": [
   [
    "src/aggeval.ts",
    "} else if (rest.length > 0) next.push(line(`${pad}  [${rest.length} more derivation",
    "} else if (rest.length > 99999) next.push(line(`${pad}  [${rest.length} more derivation"
   ]
  ],
  "expect": {
   "why_height": "wh_missing",
   "why_forest": "wf_missing"
  }
 },
 {
  "id": "why_base_circle",
  "what": "a base fact is shown by its firing even where that firing rests on the fact itself",
  "expect": {
   "why_base": "wb_missing"
  }
 },
 {
  "id": "ts_why_base_circle",
  "what": "the TypeScript explainer shows a base fact by its firing even where that firing rests on the fact itself",
  "edits": [
   [
    "src/aggeval.ts",
    "if (g === id) return undefined;",
    "if (g === id) return w;"
   ]
  ],
  "expect": {
   "why_base": "wb_missing"
  }
 },
 {
  "id": "label_known_apart",
  "what": "a labeled member is told apart from every known member: where the label is a known member's value the two are counted twice",
  "expect": {
   "agg_label_sound": "ls_w2c[main]"
  }
 },
 {
  "id": "label_join_certain",
  "what": "a join on a labeled value is read as certain: whatever fact it meets, the solution exists in every completion",
  "expect": {
   "agg_label_sound": "ls_jc[main]"
  }
 },
 {
  "id": "label_join_ex_ignored",
  "what": "a labeled value meets an occurrence of its label with more exclusions as if it were the same, and the solution is sure",
  "expect": {
   "agg_label_sound": "ls_yc[main]"
  }
 },
 {
  "id": "label_ex_elsewhere_ignored",
  "what": "a label's exclusion is read only where it is the group or the projection: a tuple that is not there where the label is excluded counts",
  "expect": {
   "agg_label_sound": "ls_minsv[main]"
  }
 },
 {
  "id": "label_fault_anywhere",
  "what": "a fault anywhere in a body whose last element is an `is` leaves a tuple that exists in every completion",
  "expect": {
   "agg_label_sound": "ls_ftot[main]"
  }
 },
 {
  "id": "ts_label_known_apart",
  "what": "the TypeScript engine tells a labeled member apart from every known member",
  "edits": [
   [
    "src/labeled.ts",
    "    projConsts(p, projs, constAt);\n    projConsts(p, others, constAt);\n",
    ""
   ]
  ],
  "expect": {
   "agg_label_sound": "ls_w2c[main]"
  }
 },
 {
  "id": "ts_label_join_certain",
  "what": "the TypeScript engine reads a join on a labeled value as certain",
  "edits": [
   [
    "src/aggeval.ts",
    "const joined = wild.length > 0;",
    "const joined = false;"
   ]
  ],
  "expect": {
   "agg_label_sound": "ls_jc[main]"
  }
 },
 {
  "id": "ts_label_join_ex_ignored",
  "what": "the TypeScript engine reads two occurrences of one label as the same whatever their exclusions",
  "edits": [
   [
    "src/unify.ts",
    " && pt.ex.every((e) => pa.ex.some((x) => canonTerm(x) === canonTerm(e)));",
    ";"
   ]
  ],
  "expect": {
   "agg_label_sound": "ls_yc[main]"
  }
 },
 {
  "id": "ts_label_ex_elsewhere_ignored",
  "what": "the TypeScript engine reads a label's exclusion only at the group and the projection",
  "edits": [
   [
    "src/labeled.ts",
    "for (const u of tupleUnks(p)) if (inst(u, labels, rg) === null) continue outer;",
    ""
   ]
  ],
  "expect": {
   "agg_label_sound": "ls_minsv[main]"
  }
 },
 {
  "id": "ts_label_fault_anywhere",
  "what": "the TypeScript engine reads a fault anywhere in a body ending in an `is` as the last thing it asks",
  "edits": [
   [
    "src/aggeval.ts",
    "if (last !== at || last === undefined",
    "if (last === undefined"
   ]
  ],
  "expect": {
   "agg_label_sound": "ls_ftot[main]"
  }
 },
 {
  "id": "function_unread",
  "what": "the Rust parser reads no declared function: `function p(K, to V).` is a clause it refuses",
  "expect": {
   "ds_function_syntax": "does not evaluate",
   "ds_function_holds": "does not evaluate"
  }
 },
 {
  "id": "function_value_unread",
  "what": "the promise of a declared function compares no value: two values for a key are one",
  "expect": {
   "ds_function_holds": "was to be refused",
   "ds_function_tick": "was to be refused"
  }
 },
 {
  "id": "function_check_off",
  "what": "no declared function is judged after an evaluation",
  "expect": {
   "ds_function_holds": "was to be refused",
   "ds_function_tick": "was to be refused"
  }
 },
 {
  "id": "function_book_ignored",
  "what": "a declared function is judged over every book at once: a key with a value in each of two books is broken",
  "expect": {
   "ds_function_holds": "does not evaluate"
  }
 },
 {
  "id": "function_tick_unchecked",
  "what": "a declared function is judged at tick 0 and never after",
  "expect": {
   "ds_function_tick": "was to be refused"
  }
 },
 {
  "id": "function_dirty_cleared_first",
  "what": "an evaluation marks the world clean before the promises are judged, so a refused world is answered by the next question",
  "expect": {
   "ds_function_holds": "refused, but not for"
  }
 },
 {
  "id": "function_retract_clean",
  "what": "a retraction refused for the promise it breaks leaves the world marked clean, so the next question answers",
  "expect": {
   "ds_function_retract": "refused, but not for"
  }
 },
 {
  "id": "ts_function_dirty_cleared",
  "what": "the TypeScript engine leaves a world it refused for a broken promise marked clean, so the next question answers",
  "edits": [
   [
    "src/api.ts",
    "      this.store.dirty = true; // a broken world is never settled: every later question refuses until it is fixed\n",
    ""
   ]
  ],
  "expect": {
   "ds_function_holds": "refused, but not for",
   "ds_function_tick": "refused, but not for",
   "ds_function_retract": "refused, but not for"
  }
 },
 {
  "id": "function_twice_admitted",
  "what": "a relation declared a function twice is admitted",
  "expect": {
   "ds_function_syntax": "was to be refused"
  }
 },
 {
  "id": "function_roles_unread",
  "what": "the `structure_role` rows of a declaration are not written, so every argument is a key and nothing is promised",
  "expect": {
   "ds_function_syntax": "dsxs_role_missing",
   "ds_function_holds": "was to be refused"
  }
 },
 {
  "id": "function_arity_short",
  "what": "the `structure_decl` row of a declaration names an arity one short",
  "expect": {
   "ds_function_syntax": "dsxs_missing"
  }
 },
 {
  "id": "phrase_function_key_lost",
  "what": "rofl-render writes a function without its key: `has one V.` for `has one V for each N`",
  "expect": {
   "ds_function_phrase": "decl_lost"
  }
 },
 {
  "id": "ring1_function_unread",
  "what": "ring 1 reads no declared function",
  "edits": [
   [
    "examples/ring1/ring1.rofl",
    "clause_at(I, D, $structure(Kind, Rs, $lit(R, $bare, A, $now)), $nil) :-\n  identtok(I, I2), tok_name(I, I2, Kind), struct_kind(Kind), nexttok(I2, K), identtok(K, K2), not keyword(K),\n  tok_name(K, K2, R), nexttok(K2, L), p(L, lpar), nexttok(L, S), strargs(Kind, S, E, Rs, A),\n  nexttok(E, C), p(C, rpar), nexttok(C, D), p(D, dot).\n",
    ""
   ]
  ],
  "expect": {
   "ds_function_syntax": "ring1_missing"
  }
 },
 {
  "id": "ts_function_unread",
  "what": "the TypeScript parser reads no declared function",
  "edits": [
   [
    "src/parser.ts",
    "if (this.peek().t === 'ident' && STRUCTURE_ROLES.has(this.peek().v) &&",
    "if (false && STRUCTURE_ROLES.has(this.peek().v) &&"
   ]
  ],
  "expect": {
   "ds_function_syntax": "does not evaluate"
  }
 },
 {
  "id": "ts_function_check_off",
  "what": "the TypeScript engine judges no declared function after an evaluation",
  "edits": [
   [
    "src/api.ts",
    "    try { checkFunctions(this.store); checkTrees(this.store); } catch (e) {",
    "    try { checkTrees(this.store); } catch (e) {"
   ]
  ],
  "expect": {
   "ds_function_holds": "was to be refused",
   "ds_function_tick": "was to be refused"
  }
 },
 {
  "id": "ts_function_value_unread",
  "what": "the TypeScript engine's promise of a declared function compares no value",
  "edits": [
   [
    "src/structure.ts",
    ".filter(([, vs]) => vs.size > 1)",
    ".filter(([, vs]) => vs.size > 99)"
   ]
  ],
  "expect": {
   "ds_function_holds": "was to be refused"
  }
 },
 {
  "id": "ts_function_twice_admitted",
  "what": "the TypeScript door admits a relation declared a function twice",
  "edits": [
   [
    "src/structure.ts",
    "if (declared.has(rel)) return",
    "if (false && declared.has(rel)) return"
   ]
  ],
  "expect": {
   "ds_function_syntax": "was to be refused"
  }
 },
 {
  "id": "ts_function_roles_unread",
  "what": "the TypeScript door writes no `structure_role` row",
  "edits": [
   [
    "src/api.ts",
    "for (const [rel, args] of structureRows(c)) this.store.add(",
    "for (const [rel, args] of structureRows(c).slice(0, 1)) this.store.add("
   ]
  ],
  "expect": {
   "ds_function_syntax": "dsxs_role_missing",
   "ds_function_holds": "was to be refused"
  }
 },
 {
  "id": "structures_declared_ignored",
  "what": "the detection report does not read the declarations, so a tree the program declares is proposed again and said to have no closure",
  "expect": {
   "structures_proof": "dedge"
  }
 },
 {
  "id": "structures_function_conflict_ignored",
  "what": "the detection report takes a key with one conflicting value for a function",
  "expect": {
   "structures_proof": "function tag_of"
  }
 },
 {
  "id": "structures_tree_two_parents_ignored",
  "what": "the detection report does not see the second parent of a node, so a DAG is a tree",
  "expect": {
   "structures_proof": "tree link"
  }
 },
 {
  "id": "structures_alias_subset_accepted",
  "what": "the detection report takes a permuted copy that lacks a row for an alias",
  "expect": {
   "structures_proof": "alias copy_miss"
  }
 },
 {
  "id": "tree_unread",
  "what": "the Rust parser reads no declared tree: `tree p(P, C).` is a clause it refuses",
  "expect": {
   "ds_tree_syntax": "does not evaluate",
   "ds_tree_holds": "does not evaluate"
  }
 },
 {
  "id": "tree_closure_dropped",
  "what": "the Rust parser reads a tree's `closure` and keeps none: the closure is no relation",
  "expect": {
   "ds_tree_syntax": "was to be refused",
   "ds_tree_holds": "dstc_lost"
  }
 },
 {
  "id": "tree_closure_row_unwritten",
  "what": "the `structure_closure` row of a declaration is not written, so no engine knows the tree's closure",
  "expect": {
   "ds_tree_syntax": "dtxs_closure_missing",
   "ds_tree_phrase": "decl_lost"
  }
 },
 {
  "id": "tree_arity_unchecked",
  "what": "a tree of one argument is admitted",
  "expect": {
   "ds_tree_syntax": "was to be refused"
  }
 },
 {
  "id": "tree_closure_head_open",
  "what": "a rule or a fact may conclude the closure of a declared tree",
  "expect": {
   "ds_tree_syntax": "was to be refused"
  }
 },
 {
  "id": "tree_lowering_base_only",
  "what": "a closure lowers to its base rule alone: the closure is the edges",
  "expect": {
   "ds_tree_holds": "dstc_lost",
   "ds_tree_syntax": "dtxs_rules_wrong"
  }
 },
 {
  "id": "tree_check_off",
  "what": "no declared tree is judged after an evaluation",
  "expect": {
   "ds_tree_holds": "was to be refused",
   "ds_tree_tick": "was to be refused",
   "ds_tree_retract": "was to be refused",
   "ds_tree_wall": "was to be refused"
  }
 },
 {
  "id": "tree_parents_unjudged",
  "what": "a child with two parents is no break of the promise",
  "expect": {
   "ds_tree_holds": "was to be refused"
  }
 },
 {
  "id": "tree_cycle_unchecked",
  "what": "a cycle is no break of the promise",
  "expect": {
   "ds_tree_holds": "was to be refused"
  }
 },
 {
  "id": "tree_book_ignored",
  "what": "a declared tree is judged over every book at once: a child with a parent in each of two books is broken",
  "expect": {
   "ds_tree_holds": "does not evaluate"
  }
 },
 {
  "id": "tree_tick_unchecked",
  "what": "a declared tree is judged at tick 0 and never after",
  "expect": {
   "ds_tree_tick": "was to be refused"
  }
 },
 {
  "id": "vclosure_nonstrict",
  "what": "the tree answers a node as its own ancestor",
  "expect": {
   "ds_tree_sealed": "dstc_diff"
  }
 },
 {
  "id": "vclosure_descendants_short",
  "what": "the range of the descendants of a node stops one short",
  "expect": {
   "ds_tree_sealed": "dstc_diff",
   "ds_tree_plan": "dtlc_lost"
  }
 },
 {
  "id": "vclosure_ancestors_short",
  "what": "the parent chain of a node stops one short of the root",
  "expect": {
   "ds_tree_sealed": "dstc_diff"
  }
 },
 {
  "id": "vclosure_stale_forest",
  "what": "the forest is built once and not again when the edges change",
  "expect": {
   "ds_tree_sealed": "dstc_"
  }
 },
 {
  "id": "vclosure_reader_stale",
  "what": "a rule that reads the closure is not fired again when news of the edges reaches it",
  "expect": {
   "ds_tree_sealed": "dstc_"
  }
 },
 {
  "id": "vclosure_book_merged",
  "what": "a premise that names a book is answered from the forests of every book",
  "expect": {
   "ds_tree_sealed": "dstc_diff"
  }
 },
 {
  "id": "vclosure_premise_untagged",
  "what": "a premise answered from the tree is the negation of a symbol, not the row it is: the member of a cell and the premise of a firing name no fact",
  "expect": {
   "ds_tree_explain": "dte_missing",
   "ds_tree_sealed": "answered from its tree the state differs"
  }
 },
 {
  "id": "vclosure_why_absent",
  "what": "a row answered from the tree is no fact to `why`: it does not hold, where `ask` says it does",
  "expect": {
   "ds_tree_explain": "explain_refused"
  }
 },
 {
  "id": "vclosure_derive_always_step",
  "what": "the derivation of a row rebuilt from the tree is always the second rule, the edge to the ancestor too",
  "expect": {
   "ds_tree_explain": "dte_missing"
  }
 },
 {
  "id": "vclosure_row_written_twice",
  "what": "a row of the closure cited twice is written out in full twice, not referred to",
  "expect": {
   "ds_tree_explain": "dte_extra"
  }
 },
 {
  "id": "vclosure_demand_unread",
  "what": "the relations answered on demand are not known when a declared closure is read for whether it may be answered from its tree",
  "expect": {
   "ds_tree_demand_edge": "dtd_lost"
  }
 },
 {
  "id": "vclosure_restore_unengaged",
  "what": "a snapshot is opened without reading which closures are answered from their trees: asked before any evaluation, the closure has no rows",
  "expect": {
   "ds_tree_sealed": "a snapshot opened and not evaluated holds another state",
   "ds_tree_explain": "a snapshot opened and not evaluated holds another state"
  }
 },
 {
  "id": "demand_closed_atom_book",
  "what": "a rule whose head book is a variable is not read from the store as a closed relation is: the closure written with a book variable over edges that read a demand relation is unfolded at its calls and meets its own",
  "expect": {
   "ds_tree_demand_book": "fired before ddb_w",
   "ds_tree_demand_book_sealed": "fired before ddb_w"
  }
 },
 {
  "id": "ts_demand_closed_atom_book",
  "what": "the TypeScript evaluator does not read a relation whose head book is a variable from the store as a closed relation",
  "edits": [
   [
    "src/aggeval.ts",
    "const ok = rs.every((r) => r.clause.head.args.length === n);",
    "const ok = rs.every((r) => r.clause.head.args.length === n && r.clause.head.persp.k === 'a');"
   ]
  ],
  "expect": {
   "ds_tree_demand_book": "fired before ddb_w",
   "ds_tree_demand_book_sealed": "fired before ddb_w"
  }
 },
 {
  "id": "demand_closed_book_unbound",
  "what": "a premise at a ground book does not bind the book variable of the rule's head",
  "expect": {
   "ds_tree_demand_book": "fired before ddb_w",
   "ds_tree_demand_book_sealed": "fired before ddb_w"
  }
 },
 {
  "id": "ts_demand_closed_book_unbound",
  "what": "the TypeScript evaluator's premise at a ground book does not bind the book variable of the rule's head",
  "edits": [
   [
    "src/aggeval.ts",
    "if (g === undefined || (g.length === b.lit.args.length + 1 && g[b.lit.args.length])) varsOf(b.lit.persp, bound);",
    "if (g === undefined) varsOf(b.lit.persp, bound);"
   ]
  ],
  "expect": {
   "ds_tree_demand_book": "fired before ddb_w",
   "ds_tree_demand_book_sealed": "fired before ddb_w"
  }
 },
 {
  "id": "vclosure_rows_cost",
  "what": "a row answered from the tree costs a row against the space wall, as a stored one does: the world that declares it is answered where the stored closure meets its wall is cut too",
  "expect": {
   "ds_tree_plan": "declares closure_unwalled"
  }
 },
 {
  "id": "vclosure_neg_inverted",
  "what": "a negation of the closure holds where a row does",
  "expect": {
   "ds_tree_sealed": "dstc_diff"
  }
 },
 {
  "id": "vclosure_unbound_cheap",
  "what": "the planner counts an unbound closure as one row, so a plan may start from it",
  "expect": {
   "ds_tree_plan": "the state holds the row"
  }
 },
 {
  "id": "vclosure_rows_unpublished",
  "what": "the canonical state lists no row of a closure answered from its tree",
  "expect": {
   "ds_tree_sealed": "the state lacks the row"
  }
 },
 {
  "id": "vclosure_prov_read_ignored",
  "what": "a closure is answered from its tree where witnesses are kept and a rule reads its derived_by rows, which are then not there while the world evaluates",
  "expect": {
   "ds_tree_prov_read": "dstp_unmade"
  }
 },
 {
  "id": "vclosure_wit_unwritten",
  "what": "where witnesses are kept, the canonical state writes no witness for a row of a closure answered from its tree",
  "expect": {
   "ds_tree_holds": "the state differs",
   "ds_tree_explain_kept": "the state differs"
  }
 },
 {
  "id": "vclosure_prov_unsettled",
  "what": "where witnesses are kept, the derived_by rows of a closure answered from its tree are never written when observed",
  "expect": {
   "ds_tree_holds": "the state differs",
   "ds_tree_explain_kept": "the state differs"
  }
 },
 {
  "id": "vclosure_height_zero",
  "what": "a row of a closure answered from its tree weighs nothing, where witnesses are kept: a member's height and the witness a height picks are wrong",
  "expect": {
   "ds_tree_explain_kept": "dtk_missing"
  }
 },
 {
  "id": "vclosure_past_row_present",
  "what": "a row of a closure answered from its tree that a staged conclusion read in a past tick is explained by the row of the present tick",
  "expect": {
   "ds_tree_tick_staged": "the state differs"
  }
 },
 {
  "id": "cited_past_vrow_skipped",
  "what": "under --retain 0 the frozen derived_by rows of the closure rows a staged conclusion or a carried cell read in a past tick are pruned, the rows being answered from a tree",
  "expect": {
   "ds_tree_tick_staged_retain": "the state differs"
  }
 },
 {
  "id": "vclosure_unknown_row_absent",
  "what": "a row of a closure answered from its tree is taken for a row that does not hold where an unknown could reach it, and made a shrug",
  "expect": {
   "ds_tree_unknown_edge": "lknown_shrug"
  }
 },
 {
  "id": "vclosure_retract_edge_delta",
  "what": "a retraction that reaches the edges of a closure answered from its tree is worked out as a delta, which does not build the forest again for what reads it",
  "expect": {
   "ds_tree_retract_edge": "dtg"
  }
 },
 {
  "id": "vclosure_restore_keys_unread",
  "what": "a snapshot opened does not read the rows its witnesses cite, so their heights are 0 and a witness a height picks is another",
  "expect": {
   "ds_tree_explain_kept": "a snapshot opened and not evaluated holds another state"
  }
 },
 {
  "id": "closure_one_book",
  "what": "the closure kernel walks the first book its edges have and no other",
  "expect": {
   "ds_tree_holds": "dstc_"
  }
 },
 {
  "id": "phrase_tree_closure_lost",
  "what": "rofl-render writes a tree without its closure: the sentence of the promise alone",
  "expect": {
   "ds_tree_phrase": "decl_lost"
  }
 },
 {
  "id": "ring1_tree_unread",
  "what": "ring 1 reads no tree with a closure",
  "edits": [
   [
    "examples/ring1/ring1.rofl",
    "clause_at(I, D, $closure(Cl, $structure(Kind, Rs, $lit(R, $bare, A, $now))), $nil) :-\n  identtok(I, I2), tok_name(I, I2, Kind), struct_kind(Kind), nexttok(I2, K), identtok(K, K2), not keyword(K),\n  tok_name(K, K2, R), nexttok(K2, L), p(L, lpar), nexttok(L, S), strargs(Kind, S, E, Rs, A),\n  nexttok(E, C), p(C, rpar), nexttok(C, W), identtok(W, W2), tok_name(W, W2, closure),\n  nexttok(W2, X), identtok(X, X2), not keyword(X), tok_name(X, X2, Cl), nexttok(X2, D), p(D, dot).\n",
    ""
   ]
  ],
  "expect": {
   "ds_tree_syntax": "ring1_missing"
  }
 },
 {
  "id": "ts_tree_unread",
  "what": "the TypeScript parser reads no declared tree",
  "edits": [
   [
    "src/parser.ts",
    "new Map([['function', ['to']], ['tree', []]])",
    "new Map([['function', ['to']]])"
   ]
  ],
  "expect": {
   "ds_tree_syntax": "does not evaluate"
  }
 },
 {
  "id": "ts_tree_check_off",
  "what": "the TypeScript engine judges no declared tree after an evaluation",
  "edits": [
   [
    "src/api.ts",
    "checkFunctions(this.store); checkTrees(this.store);",
    "checkFunctions(this.store);"
   ]
  ],
  "expect": {
   "ds_tree_holds": "was to be refused",
   "ds_tree_tick": "was to be refused"
  }
 },
 {
  "id": "ts_tree_parents_unread",
  "what": "the TypeScript engine's promise of a declared tree compares no second parent",
  "edits": [
   [
    "src/structure.ts",
    ".filter(([, ps]) => ps.size > 1)",
    ".filter(([, ps]) => ps.size > 99)"
   ]
  ],
  "expect": {
   "ds_tree_holds": "was to be refused"
  }
 },
 {
  "id": "ts_tree_cycle_unread",
  "what": "the TypeScript engine's promise of a declared tree looks for no cycle",
  "edits": [
   [
    "src/structure.ts",
    "if (cycles.length === 0) continue;",
    "if (cycles.length >= 0) continue;"
   ]
  ],
  "expect": {
   "ds_tree_holds": "was to be refused"
  }
 },
 {
  "id": "ts_tree_lowering_lost",
  "what": "the TypeScript lowering of a closure is the base rule alone",
  "edits": [
   [
    "src/structure.ts",
    ", `${cl}[B](P, D) :- ${cl}[B](P, X), ${rel}[B](X, D).`]",
    "]"
   ]
  ],
  "expect": {
   "ds_tree_holds": "dstc_lost",
   "ds_tree_syntax": "dtxs_rules_wrong"
  }
 },
 {
  "id": "ts_tree_closure_head_open",
  "what": "the TypeScript door lets a rule or a fact conclude the closure of a declared tree",
  "edits": [
   [
    "src/api.ts",
    "const badClosure = lowered ? null : checkClosureHead(c0, declaredClosures(this.store));",
    "const badClosure = null;"
   ]
  ],
  "expect": {
   "ds_tree_syntax": "was to be refused"
  }
 },
 {
  "id": "ts_tree_arity_unchecked",
  "what": "the TypeScript door admits a tree of one argument",
  "edits": [
   [
    "src/structure.ts",
    "if (s.kind === 'tree' && c.head.args.length !== 2) return",
    "if (false && s.kind === 'tree' && c.head.args.length !== 2) return"
   ]
  ],
  "expect": {
   "ds_tree_syntax": "was to be refused"
  }
 },
 {
  "id": "ts_tree_closure_row_unwritten",
  "what": "the TypeScript door writes no `structure_closure` row",
  "edits": [
   [
    "src/structure.ts",
    "if (s.closure !== undefined) rows.push([V.structure_closure,",
    "if (false) rows.push([V.structure_closure,"
   ]
  ],
  "expect": {
   "ds_tree_syntax": "was to be refused"
  }
 },
];

/** A proof that is no world: the report `rofl-load --propose-structures` prints over a fixture (rust/rofl/src/structures.rs),
 *  which is its committed text with no fault and must move, on a line that holds the sign, with one planted. */
const REPORTS: Record<string, { fixture: string; golden: string }> = {
  structures_proof: { fixture: 'rust/rofl/tests/fixtures/structures_proof.facts', golden: 'rust/rofl/tests/fixtures/structures_proof.report' },
};

function proofReports(b: Break, bin: string, control: boolean): Verdict {
  const lines: string[] = [], bad: string[] = [];
  for (const [name, sign] of Object.entries(b.expect)) {
    const r = REPORTS[name];
    if (!r) continue;
    const run = (id: string): string => execFileSync(bin, ['--propose-structures', path.join(ROOT, r.fixture)],
      { encoding: 'utf8', env: { ...process.env, ROFL_BREAK: id } });
    const golden = read(r.golden);
    if (control && run('') !== golden) { bad.push(`control, no break planted: ${name} is not its committed report`); continue; }
    const was = golden.split('\n'), now = run(control ? b.id : '').split('\n');
    const moved = [...was.filter((l) => !now.includes(l)), ...now.filter((l) => !was.includes(l))];
    const killed = moved.some((l) => l.includes(sign));
    lines.push(`${killed ? 'KILLED  ' : 'SURVIVED'} ${b.id.padEnd(20)} ${name.padEnd(22)} ${sign}`);
    if (!killed) bad.push(`${b.id}: ${name} did not move a line holding ${sign} (${moved.slice(0, 2).join(' | ') || 'nothing'})`);
  }
  return { lines, bad };
}

// ------------------------------------------------------------ the switches

const SRC = 'rust/rofl/src';
const KERNEL = ['policy.rofl', 'safety.rofl'];

/** One `brk!( ... )` in the source: where it is, its arms, its original. */
export interface Site { file: string; line: number; start: number; end: number; arms: Map<string, string>; orig: string }

/** The `brk!` invocations of a Rust file, read by bracket depth with strings,
 *  characters and comments skipped: `"id" => broken` arms split at the top
 *  level on `,`, and the original after the one top-level `;`. */
export function sitesIn(file: string, text: string): Site[] {
  const out: Site[] = [];
  const skip = (i: number): number => {
    const c = text[i];
    // a raw string reads no escape: r"…", r#"…"#, its end the quote and as many #
    const raw = c === 'r' && !/[A-Za-z0-9_]/.test(text[i - 1] ?? '') ? /^r(#*)"/.exec(text.slice(i, i + 8)) : null;
    if (raw) { const end = text.indexOf(`"${raw[1]}`, i + raw[0].length); return end < 0 ? text.length : end + raw[1].length; }
    if (c === '"') { for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++; return i; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; return i; }
    if (c === "'" && text[i + 2] === "'") return i + 2;
    if (c === "'" && text[i + 1] === '\\' && text[i + 3] === "'") return i + 3;
    return i;
  };
  for (let i = 0; i < text.length; i++) {
    const j = skip(i);
    if (j !== i) { i = j; continue; }
    if (!text.startsWith('brk!(', i)) continue;
    const start = i;
    let depth = 0, semi = -1;
    const commas: number[] = [];
    let k = i + 4;
    for (; k < text.length; k++) {
      const s = skip(k);
      if (s !== k) { k = s; continue; }
      const c = text[k];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (--depth === 0) break; }
      else if (depth === 1 && c === ';' && semi < 0) semi = k;
      else if (depth === 1 && c === ',' && semi < 0) commas.push(k);
    }
    const line = text.slice(0, start).split('\n').length;
    if (semi < 0) throw new Error(`${file}:${line}: a brk! with no \`;\` before its original`);
    const arms = new Map<string, string>();
    const cuts = [start + 4, ...commas, semi];
    for (let a = 0; a + 1 < cuts.length; a++) {
      const m = /^\s*"([a-z0-9_]+)"\s*=>\s*([\s\S]*?)\s*$/.exec(text.slice(cuts[a] + 1, cuts[a + 1]));
      if (!m) throw new Error(`${file}:${line}: cannot read the arms of this brk!`);
      if (arms.has(m[1])) throw new Error(`${file}:${line}: brk!("${m[1]}") twice in one site`);
      arms.set(m[1], m[2]);
    }
    out.push({ file, line, start, end: k + 1, arms, orig: text.slice(semi + 1, k).trim() });
    i = start + 4;   // a site may hold another
  }
  return out;
}

/** Every site under rust/rofl/src by break id. breaks.rs defines the macro
 *  and is not read. */
export function census(): Map<string, Site[]> {
  const out = new Map<string, Site[]>();
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(path.join(ROOT, dir)).sort()) {
      const rel = path.join(dir, e);
      if (fs.statSync(path.join(ROOT, rel)).isDirectory()) { walk(rel); continue; }
      if (!e.endsWith('.rs') || rel === `${SRC}/breaks.rs`) continue;
      for (const s of sitesIn(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'))) {
        for (const id of s.arms.keys()) out.set(id, [...(out.get(id) ?? []), s]);
      }
    }
  };
  walk(SRC);
  return out;
}

/** The file as a normal build would compile it with break `id` written in:
 *  each of its sites replaced by that arm, every other site left, which the
 *  macro turns into its original. */
function materialize(file: string, text: string, id: string): string {
  // one site at a time, the last first, read again after each: a site may
  // hold another
  for (;;) {
    const s = sitesIn(file, text).filter((x) => x.arms.has(id)).pop();
    if (!s) return text;
    text = text.slice(0, s.start) + `(${s.arms.get(id)})` + text.slice(s.end);
  }
}

// ------------------------------------------------------------ the census

const CENSUS = 'examples/checks/agg-breaks-census.rofl';

/** The table and the source as facts, for the world `agg_breaks_census`
 *  (examples/checks/agg-breaks-census-check.rofl): every break, how it is
 *  planted and what it must turn red; every switch site in the source; and
 *  every world the ledger closes a cell with. A world cannot walk the source
 *  or run this table, so they are written down, and `npm test` regenerates
 *  and compares (`--census --check`) so the photograph cannot go stale. */
export function censusPack(): string {
  const q = (s: string): string => JSON.stringify(s);
  const L = [
    `-- ${CENSUS} — GENERATED by \`node --experimental-strip-types scripts/agg_breaks.ts --census --write\`.`,
    '-- The planted faults of scripts/agg_breaks.ts, the brk! sites of rust/rofl/src, and the',
    '-- worlds facts/agg.rofl closes a cell with; `npm test` fails when this is stale.',
    '',
    'edb(brk).', 'edb(brk_kind).', 'edb(brk_expects).', 'edb(switch_site).', 'edb(proof_world).', '',
  ];
  for (const b of BREAKS) {
    const kind = !b.edits ? 'switch' : b.edits.every(([f]) => KERNEL.includes(f)) ? 'kernel' : isTs(b) ? 'ts' : 'file';
    L.push(`brk(${q(b.id)}). brk_kind(${q(b.id)}, ${kind}).`);
    for (const w of Object.keys(b.expect)) L.push(`brk_expects(${q(b.id)}, ${q(w)}).`);
  }
  L.push('');
  const seen = new Set<string>();
  for (const [id, ss] of [...census()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    for (const s of ss) {
      const row = `switch_site(${q(id)}, ${q(s.file)}).`;
      if (!seen.has(row)) { seen.add(row); L.push(row); }
    }
  }
  L.push('');
  for (const w of closingWorlds()) L.push(`proof_world(${q(w)}).`);
  return L.join('\n') + '\n';
}

/** Every world `handled` closes a cell with, read by loading the ledger. */
function closingWorlds(): string[] {
  const r = new Rofl();
  for (const f of ['boot.rofl', 'facts/agg.rofl', 'rules/agg.rofl']) {
    if (!r.load(read(f)).ok) throw new Error(`${f} does not load`);
  }
  r.evaluate();
  return [...new Set(r.query('handled(agg, K, L, P)').rows.map((x) => String(x.bindings['P']).replace(/^"|"$/g, '')))]
    .filter((p) => p !== 'none').sort();
}

// -------------------------------------------------------------- the edits

/** Each edited file's text with the break's edits applied, or the edit that
 *  is not in its file exactly once. */
function edited(b: Break): Map<string, string> {
  const out = new Map<string, string>();
  for (const [f, from, to] of b.edits ?? []) {
    const text = out.get(f) ?? fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (text.split(from).length !== 2) throw new Error(`NOT PLANTED: \`${from.slice(0, 60)}\` is not in ${f} exactly once`);
    out.set(f, text.replace(from, to));
  }
  return out;
}

const read = (f: string): string => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** How a break is planted without touching the tree: the environment of the
 *  `rofl-load` it runs, the files its worlds load in place of others, and
 *  the copy of src/api.ts the TypeScript engine is loaded from. */
interface Plant { env: Record<string, string>; subs: [string, string][]; ts?: string }

const TS_SRC = 'src/';
/** A break whose every edit is to the TypeScript engine; one that edits it
 *  and anything else is refused, since no world could tell which reddened. */
function isTs(b: Break): boolean {
  const n = (b.edits ?? []).filter(([f]) => f.startsWith(TS_SRC)).length;
  if (n > 0 && n !== b.edits!.length) throw new Error(`${b.id}: edits src/ and other files at once`);
  return n > 0;
}

/** Every file src/api.ts imports, followed to the end, by its path from ROOT. */
function tsEngineFiles(): string[] {
  const seen = new Set<string>(), todo = ['src/api.ts'];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+\.ts)['"]/g)) {
      todo.push(path.relative(ROOT, path.resolve(ROOT, path.dirname(f), m[1])));
    }
  }
  return [...seen].sort();
}

/** What the reader of the sentence form (scripts/read.ts) reads beside itself (`libFiles`): the vocabulary, its own, and
 *  the model, which a world loads too. */
const readerLib = (): { model: string[]; phrases: string[] } => libFiles('docs/rings/any.rofl.md', { model: 'js', code: [], reads: [], keys: {} });
/** Every file the reader imports, followed to the end, and the vocabulary it reads. */
function readerFiles(): string[] {
  const seen = new Set<string>(readerLib().phrases), todo = ['scripts/read.ts'];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+\.ts)['"]/g)) todo.push(path.relative(ROOT, path.resolve(ROOT, path.dirname(f), m[1])));
  }
  return [...seen].sort();
}
/** A break whose every edit is to the reader of the sentence form and none to the TypeScript engine: planted in a
 *  copy of the reader, which scripts/sentences.ts runs as ROFL_READER over this tree (ROFL_TREE). */
function isReader(b: Break): boolean {
  const files = readerFiles();
  const n = (b.edits ?? []).filter(([f]) => files.includes(f) && !f.startsWith(TS_SRC)).length;
  if (n > 0 && n !== b.edits!.length) throw new Error(`${b.id}: edits the reader and other files at once`);
  return n > 0;
}

export function plant(b: Break, dir: string): Plant {
  if (!b.edits) return { env: { ROFL_BREAK: b.id }, subs: [] };
  const env: Record<string, string> = {}, subs: [string, string][] = [];
  const texts = edited(b);
  if (isReader(b)) {
    for (const f of [...readerFiles(), ...readerLib().model]) {
      const p = path.join(dir, 'reader', f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, texts.get(f) ?? read(f));
    }
    return { env: { ROFL_READER: path.join(dir, 'reader', 'scripts/read.ts'), ROFL_TREE: ROOT + '/' }, subs };
  }
  if (isTs(b)) {
    const files = tsEngineFiles();
    for (const f of texts.keys()) if (!files.includes(f)) throw new Error(`NOT PLANTED: ${f} is not a file src/api.ts imports`);
    for (const f of files) {
      const p = path.join(dir, 'ts', f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, texts.get(f) ?? read(f));
    }
    return { env, subs, ts: path.join(dir, 'ts', 'src/api.ts') };
  }
  if (KERNEL.some((f) => texts.has(f))) {
    const k = path.join(dir, 'kernel-dense.ts');
    fs.writeFileSync(k, kernelDenseFile(texts.get('policy.rofl') ?? read('policy.rofl'), texts.get('safety.rofl') ?? read('safety.rofl')));
    env.ROFL_KERNEL_OVERRIDE = k;
  }
  // boot.rofl is not a file of any world: every world loads it, and ROFL_BOOT names the copy to load
  if (texts.has('boot.rofl')) {
    const b = path.join(dir, 'boot', 'boot.rofl');
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.writeFileSync(b, texts.get('boot.rofl')!);
    env.ROFL_BOOT = b;
  }
  [...texts].filter(([f]) => !KERNEL.includes(f) && f !== 'boot.rofl').forEach(([f, text], i) => {
    // the same base name, which is how a refusal names the file it refused
    const p = path.join(dir, String(i), path.basename(f));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    subs.push([path.join(ROOT, f), p]);
  });
  return { env, subs };
}

// ------------------------------------------------------------- one break

export interface Verdict { lines: string[]; bad: string[] }

/** The worlds a break names, each run with the break planted; in a pool
 *  worker, whose environment reaches the `rofl-load` it starts. */
export async function runBreak(b: Break, ws: World[], p: Plant): Promise<Verdict> {
  const lines: string[] = [], bad: string[] = [];
  const subs = new Map(p.subs);
  const saved = Object.fromEntries(Object.keys(p.env).map((k) => [k, process.env[k]]));
  try {
    // each reading warm from the reader as it is before a fault is planted in a copy of it: a cache keyed on less than the
    // reading reads would hand the planted reader the reading it did not make, and the fault would not show
    if (p.env.ROFL_READER) for (const n of Object.keys(b.expect)) { const w = ws.find((x) => x.name === n)!; for (const f of w.files) reading(f, !!w.sentences); }
    Object.assign(process.env, p.env);
    const Engine: typeof Rofl = p.ts ? (await import(pathToFileURL(p.ts).href)).Rofl : Rofl;
    for (const [name, sign] of Object.entries(b.expect)) {
      const w0 = ws.find((x) => x.name === name)!;
      const w = { ...w0, files: w0.files.map((f) => subs.get(f) ?? f), ...(sign === CUT ? { cap: CAP } : {}) };
      if (p.ts && w.oneEngine) throw new Error(`${name} is answered by one engine, and a TypeScript fault can red only a world both answer`);
      // a switch reaches only rofl-load, so the TypeScript answer of its world is the control's
      const rs = answerRust(w)!, ts = p.env.ROFL_BREAK || w.oneEngine === 'rust' ? null : answerTS(w, Engine);
      // a world both engines answer says its alarms and rows through either
      const both = w.oneEngine || !ts ? [] : [...ts.problems, ...ts.alarms];
      const said = [...rs.problems, ...rs.alarms, ...both];
      const killed = said.some((s) => s.startsWith(`${sign}[`) || s.includes(sign));
      lines.push(`${killed ? 'KILLED  ' : 'SURVIVED'} ${b.id.padEnd(20)} ${name.padEnd(22)} ${sign}`);
      if (!killed) bad.push(`${b.id}: ${name} did not raise ${sign} (${said.slice(0, 3).join(' | ') || 'nothing'})`);
    }
  } catch (e) {
    bad.push(`${b.id}: ${(e as Error).message.split('\n')[0]}`);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  return { lines, bad };
}

/** A break that runs away is shown by the wall cutting it, and a budget of CAP steps cuts it in a second where the
 *  default takes minutes; a world that sign reads is also run with no break under the same cap, which must not cut it. */
const CUT = 'cut by the budget', CAP = 1_000_000;

/** `runBreak` or a control, with how long it took. */
export async function timedBreak(b: Break, ws: World[], p: Plant): Promise<{ v: Verdict; ms: number }> {
  const t = Date.now();
  return { v: await runBreak(b, ws, p), ms: Date.now() - t };
}
export function timedControl(...a: Parameters<typeof checkWorld>): { v: string | null; ms: number } {
  const t = Date.now();
  return { v: checkWorld(...a), ms: Date.now() - t };
}

// the durations of the last run, which only order the work: kept beside the
// binary they were measured with, and nothing is decided by them
const TIMES = path.join(ROOT, 'rust/target/breaks/agg-breaks-times.json');
const lastTimes = (): Record<string, number> => { try { return JSON.parse(fs.readFileSync(TIMES, 'utf8')); } catch { return {}; } };
const saveTimes = (t: Record<string, number>): void => { try { fs.writeFileSync(TIMES, JSON.stringify(t)); } catch { /* ordering only */ } };

// -------------------------------------------------------------- selection

// what the engine is built from: a change to any of it can move every break
const ENGINE = [/^rust\//, /^src\//, /^safety\.rofl$/, /^policy\.rofl$/, /^shrug\.rofl$/, /^boot\.rofl$/, /^examples\/ring1\/dense\.ts$/];

/** Every file this harness runs: this script, what it imports, and the
 *  scripts they start (scripts/read.ts, which reads a Markdown world), each
 *  followed to the end. A name in a string that is not a script started is
 *  counted too, which runs more breaks and never fewer. */
export function harness(): string[] {
  const seen = new Set<string>(), todo = ['scripts/agg_breaks.ts'];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f) || !fs.existsSync(path.join(ROOT, f))) continue;
    seen.add(f);
    const text = read(f);
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+\.ts)['"]/g)) {
      todo.push(path.relative(ROOT, path.resolve(ROOT, path.dirname(f), m[1])));
    }
    for (const m of text.matchAll(/['"]((?:scripts|scanners)\/[\w.-]+\.ts)['"]/g)) todo.push(m[1]);
  }
  return [...seen].sort();
}

/** The breaks a change since `ref` can move: all of them when the engine, its
 *  kernel or this harness changed; otherwise those whose worlds load a changed
 *  file, whose edits are to one, or whose worlds facts/checks.rofl declares
 *  differently (files, budget, engine, options) or facts/goldens.rofl
 *  expects differently than at `ref`. */
function changedSince(ref: string, ws: World[]): { ids: Set<string>; why: string[] } {
  const git = (args: string[]): string[] => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  // a file git does not track is changed unless `ref` holds it byte for byte
  const others = git(['ls-files', '--others', '--exclude-standard']);
  const held = new Map(others.length ? git(['ls-tree', '-r', ref, '--', ...others]).map((l) => {
    const [meta, f] = l.split('\t');
    return [f, meta.split(' ')[2]] as [string, string];
  }) : []);
  const now = others.length ? git(['hash-object', '--', ...others]) : [];
  // (`git diff` names an untracked file `ref` holds as deleted, whatever it holds)
  const untracked = new Set(others);
  const files = [...new Set([...git(['diff', '--name-only', ref, '--']).filter((f) => !untracked.has(f)),
    ...others.filter((f, i) => held.get(f) !== now[i])])];
  const every = (why: string): { ids: Set<string>; why: string[] } => ({ ids: new Set(BREAKS.map((b) => b.id)), why: [`every break: ${why}`] });
  const run = new Set(harness());
  const engine = files.filter((f) => ENGINE.some((r) => r.test(f)) || run.has(f));
  if (engine.length) return every(`${engine.slice(0, 4).join(', ')}${engine.length > 4 ? ` and ${engine.length - 4} more` : ''} changed`);
  // the worlds whose declaration or golden is not what it was at `ref`
  const then = (f: string): string | null => {
    try { return execFileSync('git', ['show', `${ref}:./${f}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 }); } catch { return null; }
  };
  const moved = new Map<string, string>();
  const differ = <T>(f: string, now: Map<string, T>, at: (text: string) => Map<string, T>, key: (x: T) => string): string | null => {
    if (!files.includes(f)) return null;
    const old = then(f);
    if (old === null) return `${f} is not at ${ref}`;
    let before: Map<string, T>;
    try { before = at(old); } catch (e) { return `${f} at ${ref} does not load (${(e as Error).message.split('\n')[0]})`; }
    for (const n of new Set([...before.keys(), ...now.keys()])) {
      const [a, b] = [before.get(n), now.get(n)];
      if ((a === undefined ? '' : key(a)) !== (b === undefined ? '' : key(b))) moved.set(n, f);
    }
    return null;
  };
  const decl = (list: World[]): Map<string, World> => new Map(list.map((w) => [w.name, w]));
  const worldKey = (w: World): string => JSON.stringify(Object.entries(w).sort(([a], [b]) => (a < b ? -1 : 1)));
  const goldKey = (g: ReturnType<typeof parse> extends Map<string, infer G> ? G : never): string =>
    JSON.stringify([g.hash, g.facts, [...g.census].sort(([a], [b]) => (a < b ? -1 : 1))]);
  const whole = differ('facts/checks.rofl', decl(declared()), (t) => decl(declared(t)), worldKey)
    ?? differ('facts/goldens.rofl', parse(), (t) => parse(t), goldKey);
  if (whole) return every(whole);
  const abs = new Set(files.map((f) => path.join(ROOT, f)));
  const ids = new Set<string>(), why: string[] = [];
  for (const b of BREAKS) {
    const hit = [...(b.edits ?? []).map(([f]) => path.join(ROOT, f)),
      ...Object.keys(b.expect).flatMap((n) => { const w = ws.find((x) => x.name === n); return w ? inputs(w) : []; })].find((f) => abs.has(f));
    const w = Object.keys(b.expect).find((n) => moved.has(n));
    if (hit) { ids.add(b.id); why.push(`${b.id}: ${path.relative(ROOT, hit)}`); }
    else if (w) { ids.add(b.id); why.push(`${b.id}: ${w} in ${moved.get(w)}`); }
  }
  return { ids, why };
}

// ------------------------------------------------------------------- main

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
  const t0 = Date.now();
  if (process.argv.includes('--census')) {
    const fresh = censusPack(), file = path.join(ROOT, CENSUS);
    const held = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (process.argv.includes('--write')) { if (held !== fresh) fs.writeFileSync(file, fresh); console.log(`  ${held === fresh ? 'ok   ' : 'wrote'} ${CENSUS}`); process.exit(0); }
    if (held === fresh) { console.log(`  ok    ${CENSUS}`); process.exit(0); }
    console.log(`  STALE ${CENSUS} — run \`node --experimental-strip-types scripts/agg_breaks.ts --census --write\``);
    process.exit(1);
  }
  // the pool workers are started with both empty; a fault switched on from
  // the shell would be run as the control of every break
  const planted = ['ROFL_BREAK', 'ROFL_KERNEL_OVERRIDE', 'ROFL_BOOT', 'ROFL_READER'].filter((k) => process.env[k]);
  if (planted.length) { console.log(`FAIL ${planted.join(', ')} is set in the environment: unset it; the loop switches each fault on itself`); process.exit(1); }
  const { sel, rest } = parseSelector(process.argv.slice(2));
  const legacy = rest.includes('--legacy');
  const changed = rest.find((a) => a === '--changed' || a.startsWith('--changed='));
  const ids = rest.filter((a) => !a.startsWith('--'));
  for (const id of ids) if (!BREAKS.some((b) => b.id === id)) throw new Error(`no break ${id}`);

  // the worlds: the declared ones, and the walk only if a break names another
  const expected = new Set(BREAKS.flatMap((b) => Object.keys(b.expect)));
  let all = declared();
  if ([...expected].some((n) => !all.some((w) => w.name === n)) || sel?.files.length) all = worlds();
  const bad: string[] = [];
  for (const n of expected) if (!all.some((w) => w.name === n) && !REPORTS[n]) bad.push(`a break expects ${n}, which is no world`);

  let chosen = BREAKS;
  const why: string[] = [];
  if (ids.length) chosen = chosen.filter((b) => ids.includes(b.id));
  // A PICKED WORLD NO BREAK READS is red only when it closes a cell: then the
  // cell is proved by a world nothing has seen fail. Any other world (the
  // census, a ledger audit) has no break to run, and saying so is the answer.
  const unbroken: string[] = [];
  if (sel) {
    let s: ReturnType<typeof select<World>>;
    try { s = select(all, sel); } catch (e) { console.log(`FAIL ${(e as Error).message}`); process.exit(1); }
    const names = new Set(s.picked.map((w) => w.name));
    chosen = chosen.filter((b) => Object.keys(b.expect).some((n) => names.has(n)));
    why.push(...s.why);
    const closing = new Set(closingWorlds());
    for (const n of [...names].filter((n) => !expected.has(n)).sort()) {
      if (closing.has(n)) unbroken.push(n);
      else why.push(`${n}: no break reads it, and it closes no cell`);
    }
  }
  if (changed) {
    const c = changedSince(changed.split('=')[1] ?? 'HEAD', all);
    chosen = chosen.filter((b) => c.ids.has(b.id));
    why.push(...c.why);
  }
  if (sel || changed) {
    for (const w of why) console.log(`selected ${w}`);
    for (const n of unbroken) bad.push(`${n} closes a cell of facts/agg.rofl and no break turns it red`);
    if (chosen.length === 0) {
      for (const x of bad) console.log(`FAIL ${x}`);
      // break ids that the selection then left none of is a request for nothing
      const empty = ids.length > 0 && !changed;
      console.log(empty ? 'FAIL no break named is among the selected' : 'no break is selected');
      process.exit(bad.length || empty ? 1 : 0);
    }
  }

  // THE TABLE AGAINST THE SOURCE, whatever is selected
  const sites = census();
  for (const b of BREAKS) if (!b.edits && !sites.has(b.id)) bad.push(`${b.id}: NOT PLANTED: no brk!("${b.id}") in ${SRC}`);
  for (const [id, ss] of sites) if (!BREAKS.some((b) => b.id === id && !b.edits)) bad.push(`brk!("${id}") at ${ss[0].file}:${ss[0].line} is no break of this table`);
  const fresh = kernelDenseFile(read('policy.rofl'), read('safety.rofl'));
  if (fresh !== read('src/kernel-dense.ts')) bad.push('src/kernel-dense.ts is not what safety.rofl and policy.rofl compile to: npm run build:dense');

  const byName = new Map(all.map((w) => [w.name, w]));
  const wsOf = (b: Break): World[] => Object.keys(b.expect).map((n) => byName.get(n)).filter((w): w is World => !!w);
  const out: Verdict[] = [];
  const sh = (cmd: string): string => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  if (!legacy) {
    const tb = Date.now();
    sh('cd rust && cargo build --profile breaks --features breaks -p rofl --bin rofl-load --bin rofl-render --bin rofl-serve');
    console.log(`built rust/target/breaks/rofl-load, rofl-render and rofl-serve in ${((Date.now() - tb) / 1000).toFixed(1)} s`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agg-breaks-'));
    try {
      const plants = chosen.map((b) => {
        const dir = path.join(tmp, b.id);
        fs.mkdirSync(dir);
        try { return plant(b, dir); } catch (e) { return e as Error; }
      });
      // THE CONTROL: the breaks build with no break answers every world a
      // selected break reads exactly as the golden does, and raises nothing
      const want = parse();
      const controls = [...new Set(chosen.flatMap((b) => wsOf(b)))];
      const self = path.resolve(import.meta.filename);
      // one task per break and world, the slowest of the last run first: a
      // break that runs a world to its budget is most of the wall time
      type Job = { key: string; task: Task };
      const jobs: Job[] = controls.map((w) => ({ key: `control/${w.name}`, task: { mod: self, fn: 'timedControl', args: [w, want.get(w.name), false] } }));
      for (const w of new Set(chosen.flatMap((b) => wsOf(b).filter((x) => b.expect[x.name] === CUT)))) {
        jobs.push({ key: `capped/${w.name}`, task: { mod: self, fn: 'timedControl', args: [{ ...w, cap: CAP }, want.get(w.name), false] } });
      }
      chosen.forEach((b, i) => {
        const p = plants[i];
        if (p instanceof Error) return;
        for (const w of wsOf(b)) {
          jobs.push({ key: `${b.id}/${w.name}`, task: { mod: self, fn: 'timedBreak', args: [{ ...b, expect: { [w.name]: b.expect[w.name] } }, [w], p] } });
        }
      });
      const past = lastTimes();
      const order = jobs.map((_, i) => i).sort((x, y) => (past[jobs[y].key] ?? 1e12) - (past[jobs[x].key] ?? 1e12));
      const ran = await runPool<{ v: unknown; ms: number }>(order.map((i) => jobs[i].task),
        { env: { ROFL_PROFILE: 'breaks', ROFL_BREAK: '', ROFL_KERNEL_OVERRIDE: '', ROFL_BOOT: '', ROFL_READER: '', ROFL_TREE: '' } });
      const res = new Map<string, unknown>();
      order.forEach((i, k) => { res.set(jobs[i].key, ran[k].v); past[jobs[i].key] = ran[k].ms; });
      saveTimes(past);
      for (const w of controls) { const r = res.get(`control/${w.name}`); if (r !== null) bad.push(`control, no break planted: ${r}`); }
      for (const [k, r] of res) if (k.startsWith('capped/') && r !== null) bad.push(`control under the cap of ${CAP} steps: ${r}`);
      chosen.forEach((b, i) => {
        const p = plants[i];
        if (p instanceof Error) { out.push({ lines: [], bad: [`${b.id}: ${p.message}`] }); return; }
        if (Object.keys(b.expect).some((n) => REPORTS[n])) out.push(proofReports(b, path.join(ROOT, 'rust/target/breaks/rofl-load'), true));
        const vs = wsOf(b).map((w) => res.get(`${b.id}/${w.name}`) as Verdict);
        out.push({ lines: vs.flatMap((v) => v.lines), bad: vs.flatMap((v) => v.bad) });
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } else {
    const profile = process.env.ROFL_PROFILE || 'release';
    const build = (): void => { sh(`cd rust && cargo build --profile ${profile} -p rofl --bin rofl-load --bin rofl-render --bin rofl-serve`); };
    for (const b of chosen) {
      const saved = new Map<string, string>();
      const kernel = (b.edits ?? []).some(([f]) => KERNEL.includes(f));
      if (isTs(b)) {
        // the engine this process runs is already imported: a copy is planted
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agg-breaks-'));
        try { out.push(await runBreak(b, wsOf(b), plant(b, tmp))); }
        catch (e) { out.push({ lines: [], bad: [`${b.id}: ${(e as Error).message.split('\n')[0]}`] }); }
        finally { fs.rmSync(tmp, { recursive: true, force: true }); }
        continue;
      }
      try {
        const texts = b.edits ? edited(b)
          : new Map((sites.get(b.id) ?? []).map((s) => [s.file, materialize(s.file, read(s.file), b.id)]));
        if (texts.size === 0) throw new Error(`NOT PLANTED: no brk!("${b.id}") in ${SRC}`);
        for (const [f, text] of texts) { saved.set(f, read(f)); fs.writeFileSync(path.join(ROOT, f), text); }
        if (kernel) sh('npm run build:dense');
        build();
        out.push(await runBreak(b, wsOf(b), { env: {}, subs: [] }));
        if (Object.keys(b.expect).some((n) => REPORTS[n])) out.push(proofReports(b, path.join(ROOT, `rust/target/${profile}/rofl-load`), false));
      } catch (e) {
        out.push({ lines: [], bad: [`${b.id}: ${(e as Error).message.split('\n')[0]}`] });
      } finally {
        for (const [f, t] of saved) fs.writeFileSync(path.join(ROOT, f), t);
        // a restored safety.rofl is not a restored kernel until it is compiled
        // again, or the next break runs over this one's
        if (kernel) sh('npm run build:dense');
      }
    }
    build();
  }
  for (const v of out) for (const l of v.lines) console.log(l);
  for (const v of out) bad.push(...v.bad);
  for (const x of bad) console.log(`FAIL ${x}`);
  console.log(`${chosen.length} breaks, ${bad.length === 0 ? 'every one caught' : `${bad.length} failures`}; ${legacy ? 'planted in the source, rebuilt for each, the source restored' : 'switched on in one build'}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(bad.length === 0 ? 0 : 1);
}
