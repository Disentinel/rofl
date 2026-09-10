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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyse, type Cross } from '../scanners/rule_shape.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const key = (c: Cross) => `${c.file}  ${c.head}  <-  ${c.premise}`;
const setOf = (cs: Cross[]) => new Set(cs.map(key));

/** Every cross-product premise in `rules/` as of 2026-09-08, by (file, what the
 *  rule concludes, what the premise reads) — never by rule id or line, both of
 *  which move under an edit that changes nothing. Adding one is a decision:
 *  price the two relations and, if the product is real, reorder the body. */
/** THE REGISTER MOVED TO `facts/cross-products.rofl` ON 2026-09-10, and the
 *  gate split with it. It was 24 hand-typed strings here, 36 behind the tree,
 *  and it made this the most FED file in the repository — 39% of every code
 *  line ever added to it was a list element, measured by rules/history.rofl.
 *
 *  A list of exceptions is DATA. In `facts/` a rule can read it, `why` can
 *  explain it, and every row carries a REASON from a closed list; here it was
 *  code shaped like logic that nobody could argue with.
 *
 *  AND THIRTY-ONE OF THE THIRTY-SIX WERE THE JS LIBRARY'S. A library's join
 *  order is its own business — `examples/` has been counted and not gated for
 *  that reason since this gate was written — and the engine's own packs can
 *  carry the strict promise the kernel does. */
function register(): Map<string, string> {
  const src = fs.readFileSync(path.join(ROOT, 'facts/cross-products.rofl'), 'utf8');
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^cross_allowed\("([^"]+)", (\w+), (\w+), (\w+)\)/gm)) {
    out.set(`${m[1]}  ${m[2]}  <-  ${m[3]}`, m[4]);
  }
  return out;
}

/** Which `rules/` packs belong to a library, read from the owner's own
 *  `library_decl` in facts/layering.rofl rather than from a prefix typed here
 *  — one declaration, and a second library costs nothing in this file. */
function libraryPrefixes(): string[] {
  const src = fs.readFileSync(path.join(ROOT, 'facts/layering.rofl'), 'utf8');
  return [...src.matchAll(/^library_decl\(\w+, "([^"]+)"\)/gm)].map((m) => m[1]);
}

const isLibrary = (file: string): boolean => libraryPrefixes().some((p) => file.startsWith(p));

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

test('the ENGINE\'s own rule packs carry exactly the priced register, no more', () => {
  const reg = register();
  const mine = analyse().cross.filter((c) => c.group === 'rules' && !isLibrary(c.file));
  const got = setOf(mine);
  const added = [...got].filter((k) => !reg.has(k)).sort();
  const gone = [...reg.keys()].filter((k) => !got.has(k)).sort();

  assert.ok(reg.size > 0, 'positive control: the register is populated');
  assert.deepEqual(added, [],
    'a new cross product in an ENGINE rule pack. Price it: reorder the body so ' +
    'each premise shares a variable with what precedes it, or add a row to ' +
    'facts/cross-products.rofl WITH A REASON from the closed list:\n  ' +
    added.join('\n  '));
  assert.deepEqual(gone, [],
    'a registered cross product is gone — delete its row from ' +
    'facts/cross-products.rofl so the register cannot go quiet on its return:\n  ' +
    gone.join('\n  '));

  // EVERY ROW CARRIES A REASON FROM THE CLOSED LIST. A register whose reasons
  // are free text is a list of strings again.
  // `no_nullary_head` LEFT THE LIST ON 2026-09-10 with the three rows that
  // carried it: the parser took a nullary head and all three bodies were
  // repaired rather than re-priced. A reason naming a language limit is a
  // reason with an expiry date, and it is removed here so a new row cannot
  // claim it.
  const REASONS = new Set(['bounded_lookup', 'real_and_accepted']);
  for (const [k, why] of reg) assert.ok(REASONS.has(why), `${k}: unknown reason '${why}'`);
});

test('a library\'s join order is its own business, counted and not gated', () => {
  // The same treatment `examples/` has had since this gate was written, and
  // the reason 31 of the 36 cross products in `rules/` stopped being this
  // gate's subject on 2026-09-10: they are the JS library's, and a library
  // owns its own bodies. Printed so drift is visible without being refused.
  const lib = analyse().cross.filter((c) => c.group === 'rules' && isLibrary(c.file));
  assert.ok(lib.length > 0, `library cross products: ${lib.length}`);
  const files = new Set(lib.map((c) => c.file));
  assert.ok(files.size >= 3, `across ${files.size} packs`);
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
