// test/rofl-lint.test.ts — THE LINT IS MEASURED, NOT TRUSTED.
//
// scanners/rofl_lint.ts emits facts about rule files and rules/rofl-lint.rofl
// judges them. Nothing here is a gate over the tree — every lint relation is a
// candidate list, non-empty on an honest checkout by design — so what this
// file asserts is the INSTRUMENT: that each criterion fires on the thing it
// was written for and stays silent on the nearest thing it was not.
//
// One mutant is liveness, a set is coverage (CLAUDE.md). Each mutant below
// names the constraint it targets. The set was chosen by asking where the
// check cannot look rather than what else could break, and the places it
// cannot look are stated at the end of this file rather than discovered.
//
// POSITIVE CONTROLS ON THE REAL TREE come first: the rows the instrument was
// built to find in rules/js-callgraph.rofl and rules/js-effects.rofl on
// 2026-09-11. They pin the criterion to a known instance and go stale the day
// somebody repairs the file — which is the right kind of stale: delete the
// control with the repair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Rofl } from '../src/api.ts';
import { analyse, render, type Source } from '../scanners/rofl_lint.ts';

const ROOT = join(import.meta.dirname, '..');
const RULES = readFileSync(join(ROOT, 'rules/rofl-lint.rofl'), 'utf8');
const BOOT = readFileSync(join(ROOT, 'boot.rofl'), 'utf8');

/** A world over the given sources, with the given TypeScript name census. */
function world(sources: Source[], ts: Set<string> = new Set()): Rofl {
  const r = new Rofl();
  for (const text of [BOOT, render(analyse(sources, ts)), RULES]) {
    const res = r.load(text);
    assert.ok(res.ok, `REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  }
  r.evaluate();
  return r;
}
const rows = (r: Rofl, q: string) => {
  const res = r.query(q);
  assert.ok(!res.error, `${q}: ${res.error}`);
  assert.ok(!res.unpopulatable, `${q}: unpopulatable — the relation does not exist at this arity`);
  return res.rows.map((x) => x.bindings);
};
const src = (text: string, file = 'rules/probe.rofl'): Source => ({ file, text });

// ------------------------------------------------ the real tree, pinned ---
let tree: Rofl | undefined;
const treeWorld = () => (tree ??= (() => {
  const r = new Rofl();
  for (const text of [BOOT, render(analyse()), RULES]) {
    const res = r.load(text);
    assert.ok(res.ok, `tree REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  }
  r.evaluate();
  return r;
})());

test('positive controls: the rows the instrument was built to find', () => {
  const r = treeWorld();
  const cg = '"rules/js-callgraph.rofl"';
  const ef = '"rules/js-effects.rofl"';
  // one body, two heads — `top_call` and `top_site` are the same rule
  assert.equal(rows(r, `twin(_, _, top_call, top_site, ${cg})`).length, 1);
  // The comment-side controls — twelve orphan tier paragraphs in js-callgraph,
  // `fn_binding` cited and defined nowhere, section 6 twice and a list
  // restarting at 6 in js-effects — were repaired the same day the instrument
  // found them (both files were cut to the notes that explain a decision), so
  // the rows are asserted ABSENT now, with the mutants below as the liveness.
  assert.deepEqual(rows(r, `orphan_block(_, ${cg}, _, _)`), []);
  assert.deepEqual(rows(r, `orphan_block(_, ${ef}, _, _)`), []);
  assert.deepEqual(rows(r, `dangling_bare(_, ${cg}, _, fn_binding)`), []);
  assert.deepEqual(rows(r, `section_twice(${ef}, _, _, _)`), []);
  assert.deepEqual(rows(r, `list_repeats(_, ${ef}, _, _, _)`), []);
  // a rename, an implied premise, an unread relation
  assert.equal(rows(r, `alias(_, ${ef}, eff_subject, fn_node)`).length, 1);
  assert.equal(rows(r, `implied(_, ${ef}, eff_heap_of, member_node_v, eff_obj_traced)`).length, 1);
  assert.equal(rows(r, `unread(eff_purer_callee, ${ef}, flow)`).length, 1);
  assert.equal(rows(r, `unread(call_line, ${cg}, code)`).length, 1);
});

test('the census does not read its own output', () => {
  // facts/rofl-lint.rofl lives in facts/ and would otherwise be an input on
  // the second run: measured, 181 803 clauses where the first run saw 50 448.
  const a = analyse();
  assert.ok(a.clauses < 100_000, `clauses ${a.clauses} — the scanner is reading its own facts`);
});

// ------------------------------------------------------------- mutants ---
test('MUTANT twin: alpha-renaming, and one changed variable is not a twin', () => {
  // targets: body_sig normalises variable NAMES and nothing else
  const r = world([src(`
a(X) :- p(X, Y), q(Y).
b(X) :- p(X, Z), q(Z).
c(X) :- p(X, Z), q(X).
`)]);
  assert.equal(rows(r, 'twin(_, _, a, b, _)').length, 1, 'same body up to names');
  assert.equal(rows(r, 'twin(_, _, a, c, _)').length, 0, 'q(X) is not q(Y)');
  assert.equal(rows(r, 'twin(_, _, b, c, _)').length, 0);
});

test('MUTANT paired_arm: one head, one body, two constants is not a twin', () => {
  // targets: the HA != HB split between `twin` and `paired_arm`
  const r = world([src(`
h(X, a) :- p(X).
h(X, b) :- p(X).
`)]);
  assert.equal(rows(r, 'twin(_, _, _, _, _)').length, 0);
  assert.equal(rows(r, 'paired_arm(_, _, h, _)').length, 1);
});

test('MUTANT alias: one arm and the same pattern; a union, a projection and a permutation are not', () => {
  // targets: head_arms = 1, head_pat = premise pat
  const r = world([src(`
a(X, Y) :- p(X, Y).
u(X) :- p(X, _).
u(X) :- q(X).
j(X) :- p(X, _).
w(Y, X) :- p(X, Y).
`)]);
  assert.equal(rows(r, 'alias(_, _, a, p)').length, 1, 'a plain rename');
  assert.equal(rows(r, 'alias(_, _, u, _)').length, 0, 'two arms are a union');
  assert.equal(rows(r, 'alias(_, _, j, _)').length, 0, 'a projection drops a column');
  assert.equal(rows(r, 'alias(_, _, w, _)').length, 0, 'a permutation is content (a stated limit)');
});

test('MUTANT implied: every arm of Q carries P with the same arguments', () => {
  // targets: unification through Q's head, the wildcard rule, the every-arm rule, edb
  const r = world([src(`
q(X) :- p(X, k), r(X).
s(X) :- q(X), p(X, k).
t(X) :- q(X), p(X, j).
v(X, Y) :- q(X), p(X, Y).
z(X) :- q(X), p(X, _).
edb(e).
y(X) :- e(X), p(X, k).
m(X) :- p(X, k).
m(X) :- r(X).
n(X) :- m(X), p(X, k).
`)]);
  assert.equal(rows(r, 'implied(_, _, s, p, q)').length, 1, 'same constant: implied');
  assert.equal(rows(r, 'implied(_, _, t, _, _)').length, 0, 'a different constant is not implied');
  assert.equal(rows(r, 'implied(_, _, v, _, _)').length, 0, 'Y reaches the head, so p binds it');
  assert.equal(rows(r, 'implied(_, _, z, p, q)').length, 1, 'a wildcard is implied by anything');
  assert.equal(rows(r, 'implied(_, _, y, _, _)').length, 0, 'an edb relation implies nothing');
  assert.equal(rows(r, 'implied(_, _, n, _, _)').length, 0, 'one arm without p is enough to refuse');
});

test('MUTANT orphan: prose over prose, but not a banner and not the file header', () => {
  // targets: block_next = comment, not banner, Line != 1
  const r = world([src(`-- the file header, line 1
-- more header

-- TIER 1: a paragraph whose rule went elsewhere

-- TIER 2: and another

-- the paragraph that does introduce the clause
a(X) :- p(X).

-- ==========================================================================
-- 1. A SECTION BANNER

-- a paragraph over a clause
b(X) :- p(X).
`)]);
  const got = rows(r, 'orphan_block(_, _, L, _)').map((b) => b['L']).sort();
  assert.deepEqual(got, ['4', '6']);
});

test('MUTANT dangling: called form, bare snake_case, and the three ways a name is not dangling', () => {
  // targets: called vs bare, defined/edb/named_in_ts/atom_seen exemptions
  const r = world([src(`
-- \`ghost[code](X)\` is called and undefined; \`ghost(x)\` is JavaScript
-- \`real[code](X)\` is defined below; \`table(X)\` is declared; \`emitted(X)\` is a scanner's
-- \`gone_rel\` is bare and undefined; \`f_some_finding\` is an atom a fact carries
-- \`import_declaration\` is an atom a RULE carries
edb(table).
real(X) :- p(X).
finding(f_some_finding, insight).
k(X) :- p(X, import_declaration).
`)], new Set(['emitted']));
  assert.deepEqual(rows(r, 'dangling_mention(_, _, _, N)').map((b) => b['N']), ['ghost']);
  assert.deepEqual(rows(r, 'dangling_bare(_, _, _, N)').map((b) => b['N']), ['gone_rel']);
});

test('MUTANT sections and lists: a number used twice, a title used twice, a list that restarts', () => {
  const r = world([src(`-- ===========================================================================
-- 1. FIRST
-- 2. SECOND
a(X) :- p(X).
-- ===========================================================================
-- 2. THIRD
b(X) :- p(X).
-- ===========================================================================
-- 3. FIRST
-- notes:
-- 1. one
-- 2. two
-- 1. one again
c(X) :- p(X).
`)]);
  assert.equal(rows(r, 'section_twice(_, 2, _, _)').length, 1);
  assert.equal(rows(r, 'title_twice(_, "FIRST", _, _)').length, 1);
  assert.equal(rows(r, 'list_repeats(_, _, 1, _, _)').length, 1);
  assert.equal(rows(r, 'list_repeats(_, _, 2, _, _)').length, 0);
});

test('MUTANT unread: no rule reads it, no .ts names it; an audit is reported apart', () => {
  // targets: read_by_rule, named_in_ts, the audit split
  const text = `
a(X) :- p(X).
b(X) :- p(X).
c(X) :- b(X).
g[audit](X) :- p(X).
`;
  const r1 = world([src(text)]);
  assert.deepEqual(rows(r1, 'unread(R, _, _)').map((b) => b['R']).sort(), ['a', 'c']);
  assert.deepEqual(rows(r1, 'unasserted_audit(R, _)').map((b) => b['R']), ['g']);
  const r2 = world([src(text)], new Set(['a', 'g']));
  assert.deepEqual(rows(r2, 'unread(R, _, _)').map((b) => b['R']), ['c']);
  assert.equal(rows(r2, 'unasserted_audit(_, _)').length, 0);
});

// WHERE THIS INSTRUMENT CANNOT LOOK, measured on the day it was written:
//
//   - a relation named in prose WITHOUT backticks ("tier 2", "the resolution
//     tiers") is invisible to both dangling relations;
//   - a .ts reader that builds the relation name at run time is invisible to
//     `named_in_ts`, so `unread` over-reports in exactly that case;
//   - `twin` is per FILE; the same body in two files is not a twin here;
//   - `alias` demands the identical argument pattern, so a rename that permutes
//     its columns is content to this rule;
//   - `implied` sees P only through Q's own arms, one hop; P implied through
//     two hops (Q's arm reads S, S's arm reads P) is not reported;
//   - a comment paragraph split by a truly BLANK line is two blocks, and the
//     first is an orphan by this criterion whether or not it introduces the
//     second — the tier ghosts in js-callgraph are found by exactly this
//     property, so the two cannot be told apart lexically;
//   - `ts_non_null_expression` in js-callgraph is reported dangling and is a
//     deliberate mention ("NOT `ts_non_null_expression`"): a name quoted in
//     order to say it is wrong looks the same as one cited in error.
