// scripts/agg_mutants.ts — EVERY ALARM OF rules/agg.rofl, SEEN TO FIRE.
//
// A golden of zeros is green whether an audit works or its join broke. Each
// mutant plants one fault in a copy of the ledger (or of its registry), loads
// the world in both engines, and must raise the alarm it names; the controls
// close a cell the right way and must raise none. Nothing in the tree is
// touched. Run: npm run test:agg
//
// With a selector (`-- --item I`, `--world W`, `--cell K:L`, `--file F`,
// scripts/agg_select.ts) it runs, instead, what proves that piece of work:
// its proof worlds against the golden (scripts/goldens.ts) and the planted
// faults that must turn them red (scripts/agg_breaks.ts).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { answerTS, answerRust } from './goldens.ts';
import { runPool } from './pool.ts';
import { parseSelector } from './agg_select.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const AGG = 'facts/agg.rofl', CHECKS = 'facts/checks.rofl';
const CENSUS = 'examples/checks/agg-breaks-census.rofl', CENSUS_CHECK = 'examples/checks/agg-breaks-census-check.rofl';
const PROSE = 'examples/checks/agg-prose-census.rofl', PROSE_CHECK = 'examples/checks/agg-prose-check.rofl';
const LINTER = 'examples/linter/linter.rofl', FIXTURE = 'examples/linter/corpus-fixture.rofl', LINTER_CHECK = 'examples/checks/agg-linter-demo-check.rofl';
/** The rows of the prose census a pattern matches, for a mutant that removes every one. */
const censusRows = (re: RegExp): string[] => fs.readFileSync(path.join(ROOT, PROSE), 'utf8').match(re) ?? [];
const WORLDS: Record<string, string[]> = {
  rules_agg: [AGG, 'rules/agg.rofl'],
  agg_proofs: [CHECKS, 'facts/findings.rofl', AGG, 'rules/agg.rofl'],
  agg_breaks_census: [CENSUS, CENSUS_CHECK],
  agg_prose: [PROSE, PROSE_CHECK],
  agg_linter_demo: [...['corpus-boot-heads', 'corpus-dataflow', 'corpus-fixture', 'linter'].map((f) => `examples/linter/${f}.rofl`), LINTER_CHECK],
};
// the options the registry declares for a world: its files load together, and `explain_request` is answered
const OPTS: Record<string, { together?: boolean; explain?: boolean }> = { agg_linter_demo: { together: true, explain: true } };
type Edit = { file: string; append?: string; replace?: [string, string] };
type Mutant = { expect: string | null; world: keyof typeof WORLDS; edits: Edit[] };
const add = (append: string, file = AGG): Edit => ({ file, append });
const swap = (from: string, to: string): Edit => ({ file: AGG, replace: [from, to] });
const done = (w: string): Edit => swap(`work_state(${w}, open).`, `work_state(${w}, done).`);
// a proof world registered for one cell, as the registry would declare it
const lin = (from: string, to: string, file = LINTER): Edit => ({ file, replace: [from, to] });
const reg = (k: string, l: string, extra = ''): Edit => add(
  `check_world("agg_t"). check_file("agg_t", "examples/checks/agg-t.rofl"). proves("agg_t", agg, ${k}, ${l}). ${extra}`, CHECKS);

const M: Mutant[] = [
  { expect: 'double_claimed', world: 'rules_agg', edits: [add('handled(agg, cell, syntax, "x").')] },
  { expect: 'orphan', world: 'rules_agg', edits: [add('claim(queued, agg, nosuch, none, syntax, w_agg_body_strat).')] },
  { expect: 'unknown_ledger', world: 'rules_agg', edits: [add('claim(bogus, agg, count, none, syntax, w_agg_body_strat).')] },
  { expect: 'bad_waiver', world: 'rules_agg', edits: [add('ignored(agg, count, eval_ts, no_surface).')] },
  { expect: 'bad_waiver', world: 'rules_agg', edits: [add('ignored(agg, count, demo, no_workaround).')] },
  { expect: 'bad_waiver', world: 'rules_agg', edits: [add('ignored(agg, sugar, eval_rust, lowers_to_core).')] },
  { expect: 'bad_reason', world: 'rules_agg', edits: [add('unknown_because(agg, count, syntax, whatever).')] },
  { expect: 'stale_reason', world: 'rules_agg', edits: [add('unknown_because(agg, cell, syntax, not_yet).')] },
  { expect: 'retire_unsited', world: 'rules_agg', edits: [swap('ignored(agg, widening, retire, no_workaround).', '')] },
  { expect: 'retire_waived_sited', world: 'rules_agg', edits: [add('workaround_site(widening, "x").')] },
  { expect: 'registry_in_ledger', world: 'rules_agg', edits: [add('check_world("phantom"). check_file("phantom", "README.md").')] },
  { expect: 'registry_in_ledger', world: 'rules_agg', edits: [add('proves("phantom", agg, count, syntax).')] },
  { expect: 'registry_in_ledger', world: 'rules_agg', edits: [add('finding(f_fake, decision).')] },
  { expect: 'closed_without_proof', world: 'rules_agg', edits: [add('handled(agg, count, syntax, none).')] },
  { expect: 'proof_not_a_world', world: 'agg_proofs', edits: [add('handled(agg, count, syntax, "nosuch").')] },
  { expect: 'proof_world_empty', world: 'agg_proofs', edits: [add('check_world("agg_e"). proves("agg_e", agg, count, syntax).', CHECKS), add('handled(agg, count, syntax, "agg_e").')] },
  { expect: 'proof_unbound', world: 'agg_proofs', edits: [add('handled(agg, count, syntax, "premise_arity").')] },
  { expect: 'proof_unbound', world: 'agg_proofs', edits: [reg('count', 'why'), add('handled(agg, count, syntax, "agg_t").')] },
  { expect: 'proof_off_convention', world: 'agg_proofs', edits: [add('handled(agg, count, syntax, "premise_arity").')] },
  { expect: 'proof_is_ledger', world: 'agg_proofs', edits: [add('handled(agg, count, syntax, "agg_proofs").')] },
  { expect: 'work_proof_unbound', world: 'agg_proofs', edits: [add('work_proof(w_agg_baseline, "premise_arity").')] },
  { expect: 'binding_not_a_world', world: 'agg_proofs', edits: [add('proves("ghost", agg, count, syntax).', CHECKS)] },
  { expect: 'binding_orphan', world: 'agg_proofs', edits: [add('proves("premise_arity", agg, nosuch, syntax).', CHECKS)] },
  { expect: 'algebra_undeclared', world: 'rules_agg', edits: [add('agg_kind(newkind).')] },
  { expect: 'algebra_unknown', world: 'rules_agg', edits: [swap('algebra_class(count, invertible).', 'algebra_class(count, magic).')] },
  { expect: 'two_algebras', world: 'rules_agg', edits: [add('algebra_class(count, holistic).')] },
  // (every stratified kind carries its refusal world now: the mutant takes
  // tag_counting's away, and then gives it a recursion world in its place)
  { expect: 'strata_without_refusal', world: 'agg_proofs', edits: [{ file: CHECKS, replace: ['proves_refusal("agg_tagc_strata", tag_counting).', ''] }] },
  // (every recursive kind carries its recursion world now: the mutant takes
  // subsumption's away, leaving its strata cell closed without one)
  { expect: 'strata_without_recursion', world: 'agg_proofs', edits: [{ file: CHECKS, replace: ['proves_recursion("agg_sub_strata", subsumption).', ''] }] },
  { expect: 'strata_without_refusal', world: 'agg_proofs', edits: [{ file: CHECKS, replace: ['proves_refusal("agg_tagc_strata", tag_counting).', 'proves_recursion("agg_tagc_strata", tag_counting).'] }] },
  // a written form stratified whatever its algebra: order_lattice declared one
  // for the mutant, closed with a recursion world and no refusal
  { expect: 'strata_without_refusal', world: 'agg_proofs', edits: [reg('order_lattice', 'strata', 'proves_recursion("agg_t", order_lattice).'), add('stratified_form(order_lattice). handled(agg, order_lattice, strata, "agg_t").')] },
  { expect: 'stratified_form_unknown', world: 'rules_agg', edits: [add('stratified_form(nosuch).')] },
  { expect: 'undecided_not_work', world: 'rules_agg', edits: [add('unknown_because(agg, count, incremental_ready, budget_exhausted).')] },
  { expect: 'undecided_not_work', world: 'rules_agg', edits: [add('unknown_because(agg, count, incremental_ready, out_of_scope).')] },
  { expect: 'decision_stale', world: 'rules_agg', edits: [add('decided_not_work(agg, count, syntax, f_x).')] },
  { expect: 'decision_not_a_finding', world: 'agg_proofs', edits: [add('unknown_because(agg, count, incremental_ready, out_of_scope). decided_not_work(agg, count, incremental_ready, f_nope).')] },
  { expect: 'reason_unclassified', world: 'rules_agg', edits: [add('unknown_type(stuck, ours).')] },
  { expect: 'unqueued', world: 'rules_agg', edits: [add('obligation(newcol).')] },
  // a column opens a cell in every row, so only the owner opens one
  { expect: 'obligation_unauthorised', world: 'rules_agg', edits: [add('obligation(newcol).')] },
  { expect: 'queue_stale', world: 'rules_agg', edits: [add('claim(queued, agg, cell, none, syntax, w_agg_incremental_ready).')] },
  { expect: 'double_owned', world: 'rules_agg', edits: [add('claim(queued, agg, count, none, syntax, w_agg_threshold).')] },
  { expect: 'false_done', world: 'rules_agg', edits: [swap('handled(agg, count, demo, "agg_linter_demo").', '')] },
  { expect: 'false_done', world: 'rules_agg', edits: [swap('handled(agg, count, demo, "agg_linter_demo").', ''), add('unknown_because(agg, count, demo, budget_exhausted). decided_not_work(agg, count, demo, f_x).')] },
  { expect: 'false_done', world: 'rules_agg', edits: [done('w_agg_incremental_ready')] },
  { expect: 'done_by_assertion', world: 'rules_agg', edits: [swap('work_proof(w_agg_baseline, "agg_rederived_provenance").', '')] },
  { expect: 'work_proof_unbound', world: 'agg_proofs', edits: [{ file: CHECKS, replace: ['proves_work("agg_rederived_provenance", w_agg_session_tests).', ''] }] },
  { expect: 'done_by_assertion', world: 'rules_agg', edits: [swap('work_proof(w_agg_reconcile_docs, "agg_prose").', '')] },
  { expect: 'blocker_unknown', world: 'rules_agg', edits: [add('cell_blocked(agg, count, syntax, weird).')] },
  { expect: 'blocker_stale', world: 'rules_agg', edits: [add('cell_blocked(agg, cell, syntax, external).')] },
  { expect: 'needs_unknown', world: 'rules_agg', edits: [add('work_needs(w_agg_ts, w_nope).')] },
  { expect: 'work_needs_cycle', world: 'rules_agg', edits: [add('work_needs(w_agg_baseline, w_agg_body_strat).')] },
  { expect: 'work_unstated', world: 'rules_agg', edits: [add('contradiction_site(w_nope, "README.md", "x").')] },
  { expect: 'work_stateless', world: 'rules_agg', edits: [add('work(w_new, "x").')] },
  { expect: 'work_bad_state', world: 'rules_agg', edits: [add('work_state(w_agg_ts, sleeping).')] },
  { expect: 'work_sweeps_nocolumn', world: 'rules_agg', edits: [add('work_sweeps(w_agg_ts, nocol).')] },
  { expect: 'held_unknown', world: 'rules_agg', edits: [add('held(w_nope, "x").')] },
  // the planted faults against the source and the ledger (agg_breaks_census)
  { expect: 'switch_unplanted', world: 'agg_breaks_census', edits: [{ file: CENSUS, replace: ['switch_site("mono", "rust/rofl/src/engine.rs").', ''] }] },
  { expect: 'site_orphan', world: 'agg_breaks_census', edits: [add('switch_site("ghost", "rust/rofl/src/engine.rs").', CENSUS)] },
  { expect: 'site_not_switch', world: 'agg_breaks_census', edits: [add('switch_site("no_unbound", "rust/rofl/src/engine.rs").', CENSUS)] },
  { expect: 'brk_expects_nothing', world: 'agg_breaks_census', edits: [add('brk("lonely"). brk_kind("lonely", switch). switch_site("lonely", "rust/rofl/src/engine.rs").', CENSUS)] },
  { expect: 'proof_world_unbroken', world: 'agg_breaks_census', edits: [add('proof_world("agg_nobody_breaks").', CENSUS)] },
  { expect: 'proof_world_unbroken', world: 'agg_breaks_census', edits: [{ file: CENSUS, replace: ['brk_expects("why_all_digest", "agg_cell_why").', ''] }, { file: CENSUS, replace: ['brk_expects("digest_off", "agg_cell_why").', ''] }, { file: CENSUS, replace: ['brk_expects("ts_digest_off", "agg_cell_why").', ''] }] },
  // CONTROLS: a cell closed as the registry says, and an item closed by its world
  { expect: null, world: 'agg_proofs', edits: [reg('count', 'strata', 'proves_refusal("agg_t", count).'), add('handled(agg, count, strata, "agg_t").')] },
  { expect: null, world: 'agg_proofs', edits: [reg('order_lattice', 'strata', 'proves_recursion("agg_t", order_lattice).'), add('handled(agg, order_lattice, strata, "agg_t").')] },
  // the body form of min closes its strata cell with a refusal and no recursion
  { expect: null, world: 'agg_proofs', edits: [reg('min_max_strat', 'strata', 'proves_refusal("agg_t", min_max_strat).'), add('handled(agg, min_max_strat, strata, "agg_t").')] },
  { expect: null, world: 'agg_proofs', edits: [reg('count', 'syntax', 'proves_work("agg_t", w_x).'), add('handled(agg, count, syntax, "agg_t"). work(w_x, "x"). work_state(w_x, done). work_proof(w_x, "agg_t"). contradiction_site(w_x, "README.md", "x").')] },
  { expect: null, world: 'agg_proofs', edits: [add('unknown_because(agg, count, incremental_ready, out_of_scope). decided_not_work(agg, count, incremental_ready, f_aggregation_is_one_cell_engine_with_two_syntaxes).')] },
  // the prose of w_agg_reconcile_docs (agg_prose): a claim nothing points past, a census that found nothing
  { expect: 'prose_stale', world: 'agg_prose', edits: [add('prose_claim("LIMITS.md", "a block that says there is no aggregation").', PROSE)] },
  { expect: 'prose_stale', world: 'agg_prose', edits: [{ file: PROSE, replace: ['prose_pointer("START.md", "Incremental maintenance (DRed/counting beyond support counte").', ''] }] },
  { expect: 'prose_vacuous', world: 'agg_prose', edits: censusRows(/^prose_site\("[^"]+"\)\./gm).map((r): Edit => ({ file: PROSE, replace: [r, ''] })) },
  // the retire column (agg_prose): a marker that stands, a kept site that lost its reason, a site no pattern describes, a census with no site
  { expect: 'retire_stands', world: 'agg_prose', edits: [add('retire_marker(count, "scripts/lint.ts").', PROSE)] },
  { expect: 'retire_stands', world: 'agg_prose', edits: [{ file: PROSE, replace: ['retire_kept(sum, "examples/slop/slop.rofl").', ''] }] },
  { expect: 'retire_unsaid', world: 'agg_prose', edits: [{ file: PROSE_CHECK, replace: ['N is count(P : retire_marker(K, P), not retire_kept(K, P))', 'N is count(P : retire_kind(K), retire_marker(K, P), not retire_kept(K, P))'] }, { file: PROSE_CHECK, replace: ['retire_standing(K, N)   :- retire_kind(K), N is', 'retire_standing(K, N)   :- N is'] }] },
  { expect: 'retire_unmarked', world: 'agg_prose', edits: [{ file: PROSE, replace: ['retire_pattern("examples/wtf/wtf.rofl").', ''] }] },
  { expect: 'retire_vacuous', world: 'agg_prose', edits: censusRows(/^retire_site\([a-z_]+, "[^"]+"\)\./gm).map((r): Edit => ({ file: PROSE, replace: [r, ''] })) },
  // the linter as rules (agg_linter_demo): a threshold on each side of the edge, a count of the wrong thing, an empty group read as 0
  { expect: 'lw_table_missing', world: 'agg_linter_demo', edits: [lin('lint_min(table, 5).', 'lint_min(table, 6).')] },
  { expect: 'lw_table_extra', world: 'agg_linter_demo', edits: [lin('lint_min(table, 5).', 'lint_min(table, 4).')] },
  { expect: 'lw_table_extra', world: 'agg_linter_demo', edits: [lin('foreign_head(lint_said). ', '')] },
  { expect: 'lw_pair_missing', world: 'agg_linter_demo', edits: [lin('lint_min(pair, 5).', 'lint_min(pair, 6).')] },
  { expect: 'lw_pair_extra', world: 'agg_linter_demo', edits: [lin('lint_min(pair, 5).', 'lint_min(pair, 4).')] },
  { expect: 'lw_pair_one_sided', world: 'agg_linter_demo', edits: [lin('premise_pos(R, B), A != B).', 'premise_pos(R, B), A != B, B != ast_node).')] },
  { expect: 'lw_long_missing', world: 'agg_linter_demo', edits: [lin('lint_min(long, 7).', 'lint_min(long, 8).')] },
  { expect: 'lw_long_extra', world: 'agg_linter_demo', edits: [lin('lint_min(long, 7).', 'lint_min(long, 6).')] },
  { expect: 'lw_route_missing', world: 'agg_linter_demo', edits: [lin('lint_split(H, _, _), lint_min(table, M)', 'lint_split(H, _, _), lint_min(route, M)')] },
  { expect: 'lw_route_extra', world: 'agg_linter_demo', edits: [lin('lint_split(H, _, _), lint_min(table, M), lint_bodies(H, N), N >= M, not foreign_head(H).', 'lint_split(H, _, _), lint_bodies(H, N), not foreign_head(H).')] },
  { expect: 'lw_twin_missing', world: 'agg_linter_demo', edits: [lin('concludes(R1, H), not lint_differs(R1, R2), not lint_differs(R2, R1).', 'concludes(R1, H), lint_differs(R1, R2), not lint_differs(R2, R1).')] },
  { expect: 'lw_twin_extra', world: 'agg_linter_demo', edits: [lin('concludes(R1, H), not lint_differs(R1, R2), not lint_differs(R2, R1).', 'concludes(R1, H).')] },
  { expect: 'lw_mirror_missing', world: 'agg_linter_demo', edits: [lin('not foreign_head(H1), not foreign_head(H2).', 'lint_min(nothing, _).')] },
  { expect: 'lw_mirror_extra', world: 'agg_linter_demo', edits: [lin('not lint_differs_off_heads(R1, R2), not lint_differs_off_heads(R2, R1),', 'lint_mirror_cand(R1, R2),')] },
  { expect: 'lw_mirror_one_sided', world: 'agg_linter_demo', edits: [lin('not lint_differs_off_heads(R1, R2), not lint_differs_off_heads(R2, R1),', 'not lint_differs_off_heads(R1, R2),')] },
  { expect: 'lw_tplace_wrong', world: 'agg_linter_demo', edits: [lin('S is 0 - N, P is rank(S, V : probably_a_table(_, K), V is 0 - K).', 'P is rank(N, V : probably_a_table(_, V)).')] },
  { expect: 'lw_tplace_over', world: 'agg_linter_demo', edits: [lin('S is 0 - N, P is rank(S, V : probably_a_table(_, K), V is 0 - K).', 'P is N.')] },
  { expect: 'lw_lplace_wrong', world: 'agg_linter_demo', edits: [lin('S is 0 - N, P is rank(S, V : probably_hides_a_concept(_, _, K), V is 0 - K).', 'P is rank(N, V : probably_hides_a_concept(_, _, V)).')] },
  { expect: 'lw_ways_wrong', world: 'agg_linter_demo', edits: [lin('lint_said(or, Rel)      :- probably_one_rule_with_an_or(Rel).\n', '')] },
  { expect: 'lw_ways_wrong', world: 'agg_linter_demo', edits: [lin('S is 0 - N, P is rank(S, V : lint_ways(_, K), V is 0 - K).', 'P is rank(N, V : lint_ways(_, V)).')] },
  { expect: 'lw_vacuous', world: 'agg_linter_demo', edits: [lin('lint_min(table, 5).', 'lint_min(table, 99).')] },
  { expect: 'lw_empty', world: 'agg_linter_demo', edits: [lin('not foreign_head(H1), not foreign_head(H2).', 'lint_min(nothing, _).')] },
  { expect: 'lx_bodies_wrong', world: 'agg_linter_demo', edits: [lin('N is count(R : concludes(R, Rel)).', 'N is count(K : has_premise(R, K), concludes(R, Rel)).')] },
  { expect: 'lx_pair_wrong', world: 'agg_linter_demo', edits: [lin('premise_pos(R, B), A != B).', 'premise_pos(R, B), A != B, has_premise(R, 4)).')] },
  { expect: 'lx_arity_wrong', world: 'agg_linter_demo', edits: [lin('N is count(K : has_premise(R, K)).', 'N is count(K : has_premise(R, K), K > 1).')] },
  { expect: 'lx_ghost_row', world: 'agg_linter_demo', edits: [lin('lint_bodies(Rel, N)  :- N is count', 'lint_bodies(Rel, N)  :- premise_pos(_, Rel), N is count')] },
  { expect: 'lx_zero_row', world: 'agg_linter_demo', edits: [lin('lint_bodies(Rel, N)  :- N is count', 'lint_bodies(Rel, N)  :- premise_pos(_, Rel), N is count')] },
  { expect: 'lx_ghost_not_zero', world: 'agg_linter_demo', edits: [lin('concludes(R, G)), N < 1.', 'concludes(R, G)), N < 0.', LINTER_CHECK)] },
  { expect: 'lx_ghost_unread', world: 'agg_linter_demo', edits: [lin('fx_one(X) :- fx_p(X), fx_ghost(X).', 'fx_one(X) :- fx_p(X), fx_q(X).', FIXTURE)] },
  { expect: 'lw_shrug', world: 'agg_linter_demo', edits: [lin('lint_min(long, 7).', 'lint_min(long, oops).')] },
  { expect: 'lw_unnamed', world: 'agg_linter_demo', edits: [lin('N is count(R : concludes(R, Rel)).', 'N is count(K : has_premise(R, K), concludes(R, Rel)).')] },
  { expect: 'lw_proof_empty', world: 'agg_linter_demo', edits: [lin('explained[$explain](why_all,', 'explained[$explain](why_none,', LINTER_CHECK)] },
  { expect: 'lw_outside', world: 'agg_linter_demo', edits: [lin('lw_stranger(rb321ea6d, "(rb321ea6d,").', 'lw_stranger(r26fda629, "(r26fda629,").', LINTER_CHECK)] },
  { expect: null, world: 'agg_linter_demo', edits: [] },
  { expect: null, world: 'agg_breaks_census', edits: [] },
  { expect: null, world: 'agg_prose', edits: [] },
];

// the ledger's alarms are in [audit], a check file's in [main]
const fired = (census: Map<string, number>, rel: string): number =>
  (census.get(`${rel}[audit]`) ?? 0) + (census.get(`${rel}[main]`) ?? 0);

/** One mutant or control, its files already written: what it got wrong. */
export function judge(i: number, expect: string | null, files: string[], alarms: string[], opts: { together?: boolean; explain?: boolean } = {}): string[] {
  const bad: string[] = [];
  const w = { name: `mutant_${i}`, files, ...opts };
  for (const [who, a] of [['ts', answerTS(w)], ['rust', answerRust(w)]] as const) {
    if (!a) continue;
    if (a.dropped.length) { bad.push(`${i} ${who}: refused ${a.dropped.join('; ')}`); continue; }
    if (expect === null) {
      const raised = alarms.filter((r) => fired(a.census, r) > 0);
      if (raised.length) bad.push(`control ${i} ${who}: raised ${raised.join(', ')}`);
    } else if (fired(a.census, expect) === 0) bad.push(`mutant ${i} ${who}: ${expect} silent`);
  }
  return bad;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
  const { sel } = parseSelector(process.argv.slice(2));
  if (sel) {
    const args = process.argv.slice(2);
    let code = 0;
    for (const s of ['scripts/goldens.ts', 'scripts/agg_breaks.ts']) {
      const p = spawnSync(process.execPath, ['--experimental-strip-types', path.join(ROOT, s), ...args], { stdio: 'inherit' });
      if (p.status !== 0) code = 1;
    }
    process.exit(code);
  }
  const rules = ['rules/agg.rofl', CENSUS_CHECK, PROSE_CHECK, LINTER_CHECK].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const ALARMS = [...rules.matchAll(/^alarm\(([a-z_]+)\)\./gm)].map((m) => m[1]);
  const covered = new Set(M.map((m) => m.expect).filter((x): x is string => x !== null));
  const uncovered = ALARMS.filter((a) => !covered.has(a));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agg-mutants-'));
  const bad: string[] = [];
  try {
    const worlds = M.map((m, i) => {
      const files = WORLDS[m.world].map((f) => path.join(ROOT, f));
      for (const e of m.edits) {
        const at = WORLDS[m.world].indexOf(e.file);
        if (at < 0) throw new Error(`mutant ${i}: ${e.file} is not in ${m.world}`);
        let text = fs.readFileSync(files[at], 'utf8');
        if (e.replace) {
          if (!text.includes(e.replace[0])) throw new Error(`mutant ${i}: no \`${e.replace[0]}\``);
          text = text.replace(e.replace[0], e.replace[1]);
        }
        if (e.append) text += `\n${e.append}\n`;
        const dst = path.join(tmp, `${i}-${path.basename(e.file)}`);
        fs.writeFileSync(dst, text);
        files[at] = dst;
      }
      return files;
    });
    const self = path.resolve(import.meta.filename);
    const got = await runPool<string[]>(M.map((m, i) => ({ mod: self, fn: 'judge', args: [i, m.expect, worlds[i], ALARMS, OPTS[m.world]] })));
    for (const g of got) bad.push(...g);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  for (const u of uncovered) bad.push(`alarm(${u}) has no mutant`);
  for (const b of bad) console.log(`FAIL ${b}`);
  console.log(`${M.length} mutants and controls over ${ALARMS.length} alarms, ${bad.length === 0 ? 'every one caught' : `${bad.length} failures`}`);
  process.exit(bad.length === 0 ? 0 : 1);
}
