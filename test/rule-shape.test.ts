// test/rule-shape.test.ts — THE CROSS-PRODUCT GATE.
//
// A positive premise that shares no variable with anything bound before it is
// a cross product by construction: `planBody` moves only negations
// (src/engine.ts:298) and says why — a positive premise's position is a choice
// the author already has, and examples/yak fragment 09 is a rule that means two
// different things depending on it. So the order written is the order paid for,
// and the only honest repair is to TELL the author rather than reorder behind
// them.
//
// WHAT IT COSTS, measured on the JS model of branch modeljs so the number is
// not hypothetical: `has_return(F) :- fn_node(F), ast_node(R, return_statement,
// _, _), ast_within(F, R).` lays 272 functions beside 291 return statements —
// 79 152 intermediate rows for a few hundred answers — where the same three
// premises reordered peak at 291 and produce a fact set identical to the digit
// (396113 and 651679 at 8 and 16 files).
//
// THREE SCOPES, AND THEY ARE NOT THE SAME PROMISE. A gate that is red on an
// honest checkout gets switched off, and then its absence is invisible
// (CLAUDE.md). There are 238 such premises in this tree today, so a gate that
// reds on all of them is that gate. Instead:
//
//   kernel   boot.rofl, safety.rofl, policy.rofl — ZERO, strictly. Measured:
//            0 of 129 positive premises today, so this is a promise the tree
//            already keeps rather than an aspiration.
//   rules/   the exact SET, baselined. A set and not a count, because a count
//            sleeps through a swap — remove one, add one — which is precisely
//            the weakness test/permission-doc.test.ts records for size checks.
//   examples reported, never asserted. A demo exists to demonstrate, and its
//            join order is its own business.
//
// THE GATE RE-DERIVES FROM SOURCE. It calls `analyse()` and never opens
// facts/rule-shape.rofl: a gate that reads generated facts is green by
// construction the moment somebody adds a rule without re-running the scanner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, type Cross } from '../scanners/rule_shape.ts';

const key = (c: Cross) => `${c.file}  ${c.head}  <-  ${c.premise}`;
const setOf = (cs: Cross[]) => new Set(cs.map(key));

/** Every cross-product premise in `rules/` as of 2026-09-08, by (file, what the
 *  rule concludes, what the premise reads) — never by rule id or line, both of
 *  which move under an edit that changes nothing. Adding one is a decision:
 *  price the two relations and, if the product is real, reorder the body. */
const RULES_BASELINE = [
  'rules/decisions/production-readiness.rofl  coverage_gap  <-  concern',
  'rules/eval-cost.rofl  share  <-  total_width',
  'rules/eval-cost.rofl  slow_because  <-  total_fresh',
  'rules/floor-census.rofl  saved_bytes  <-  store_bytes',
  'rules/floor-census.rofl  saved_facts  <-  store_facts',
  'rules/inquiry/epistemic.rofl  refuted  <-  refutes',
  'rules/inquiry/epistemic.rofl  refuted_confirmed  <-  refutes',
  'rules/inquiry/epistemic.rofl  supported  <-  supports',
  'rules/inquiry/epistemic.rofl  supported_confirmed  <-  supports',
  'rules/js-callgraph.rofl  encloses  <-  site',
  'rules/js-callgraph.rofl  fn_binding  <-  ast_node',
  'rules/js-callgraph.rofl  fn_name  <-  ast_child',
  'rules/js-callgraph.rofl  fn_name  <-  ast_node',
  'rules/js-model.rofl  axis_earns  <-  refined_reason',
  'rules/js-model.rofl  axis_earns  <-  refined_verdict',
  'rules/js-model.rofl  cell  <-  layer',
  'rules/js-model.rofl  unaccounted  <-  layer',
  'rules/js-resolve.rofl  resolve_silent  <-  env_ran',
  'rules/kernel-policy.rofl  wf_inadmissible  <-  demand_rel',
  'rules/parse-cost.rofl  bigger  <-  sweep',
  'rules/parse-cost.rofl  cache_costs  <-  cache',
  'rules/parse-cost.rofl  overhead_exceeds_work  <-  work_costs',
  'rules/permission-model.rofl  co_read  <-  boot_rule',
  'rules/policies/evidence.rofl  stale_evidence  <-  current_version',
];

test('the fold agrees with planBody on every clause it walks', () => {
  // The gate re-implements the binding order `planBody` decides, to learn what
  // was bound WHERE — which planBody does not report. A second implementation
  // of a rule this repository already owns is the classic way to get a
  // disagreement instead of an answer, so it is checked rather than trusted.
  assert.equal(analyse().disagreements, 0);
});

test('the kernel program pays no cross product, and that is strict', () => {
  const a = analyse();
  const kernel = a.cross.filter((c) => c.group === 'kernel').map(key);
  assert.deepEqual(kernel, [],
    `boot.rofl, safety.rofl and policy.rofl must join on a shared variable at every step.\n` +
    `New: ${kernel.join('\n     ')}`);
  // The positive control for the promise above: the scope is not empty, so
  // "zero" is a measurement and not an absence of subjects.
  assert.ok(a.posSites > 100, 'no positive premises were analysed at all');
});

test('rules/ carries exactly its baseline of cross products, no more and no fewer', () => {
  const got = setOf(analyse().cross.filter((c) => c.group === 'rules'));
  const want = new Set(RULES_BASELINE);
  const added = [...got].filter((k) => !want.has(k)).sort();
  const gone = [...want].filter((k) => !got.has(k)).sort();
  assert.deepEqual(added, [],
    'a new cross product in rules/. Price the two relations; if the product is ' +
    'real, reorder the body so each premise shares a variable with what precedes it:\n  ' +
    added.join('\n  '));
  assert.deepEqual(gone, [],
    'a cross product in rules/ was repaired — delete it from RULES_BASELINE so ' +
    'the gate cannot go quiet on its return:\n  ' + gone.join('\n  '));
});

test('the examples are counted and not gated, and the count is visible', () => {
  const a = analyse();
  const ex = a.cross.filter((c) => c.group === 'examples');
  // Asserted only to be non-absurd: this number is a fact about demos, and a
  // demo's join order is its own business. It is printed so that a reader who
  // wants to know whether the corpus is drifting can see it move.
  assert.ok(ex.length > 0 && ex.length < a.posSites,
    `examples cross products: ${ex.length} of ${a.posSites} positive premises`);
});
