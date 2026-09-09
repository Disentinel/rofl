// js-effects.test.ts — THE FIFTH LAYER: THE LATTICE, THE PROPAGATION, AND THE
// CONCRETE COLUMN UNDER IT.
//
// WHAT IS ASSERTED HERE AND WHY EACH ONE IS A NAMED SET RATHER THAN A COUNT.
// Three parallel branches moved one number in `test/worklist.test.ts` on
// 2026-09-08 and every move was right on its own branch and wrong in the merge,
// so this file pins identities and named sets:
//
//   * the lattice's four failure modes, EMPTY — join and meet total and
//     single-valued over the fourteen landmarks, which is the theorem the
//     design rests on rather than a hope about it;
//   * `eff_top` and `eff_bot` as DERIVED SETS, `{top}` and `{total}`;
//   * Koka's aliases as derived rows: `join(div, exn) = pure`, and the set of
//     names below `io` written out;
//   * the `exn` projection against `may_throw[code]`, BOTH DIRECTIONS, over two
//     relations written a week apart in two different packs;
//   * `member_node_v` PARTITIONED by read site and write target — an identity,
//     so it is true of any corpus rather than of this one;
//   * the labels this corpus does not exercise, BY NAME.
//
// THE WORLD IS `w_js_effects` in facts/worlds.rofl: the corpus world plus the
// two effect packs. It is built here rather than in test/js-corpus-world.ts on
// purpose — that world's row count is pinned by test/js-layer-cost.test.ts and
// read by four other files, and a layer added to it moves numbers that are not
// about it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import { read, FILES, FACTS, RULES } from './js-corpus-world.ts';

const EFF_FACTS = 'facts/js-effects.rofl';
const EFF_RULES = 'rules/js-effects.rofl';
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

type Mut = { file: string; find: string; replace: string };
type Extra = string;
interface World { q: (l: string) => string[][]; n: (l: string) => number; binds: (l: string) => string[] }

/** the corpus world PLUS the two effect packs, with optional mutations and
 *  optional extra rofl text (the planted surface). */
function build(muts: Mut[] = [], extra: Extra[] = [], src: [string, string][] = []): World {
  const r = new Rofl();
  const packs = ['boot.rofl', ...FACTS, 'facts/js-controlflow.rofl', EFF_FACTS,
    ...RULES, EFF_RULES].map((f) => {
    let t = read(f);
    for (const m of muts) if (m.file === f) {
      assert.ok(t.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
      t = t.replace(m.find, m.replace);
    }
    return t;
  });
  const res = r.load([...packs, ...extra].join('\n'));
  assert.ok(res.ok, `world REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  for (const [logical, disk] of FILES) {
    const a = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(a.ok, `${logical} facts REJECTED:\n${a.diagnostics.slice(0, 3).join('\n')}`);
  }
  // ...and any PROBE source, scanned from text. Used by one test only, and it
  // is a probe rather than a fixture on purpose: the five shared files are what
  // every other claim in this file is measured over, and adding a sixth would
  // move the concrete-column set, the cell counts and four other test files'
  // numbers for the sake of one rule.
  for (const [logical, text] of src) {
    const a = r.assert(scan(text, { file: logical }).facts.join('\n'));
    assert.ok(a.ok, `${logical} facts REJECTED:\n${a.diagnostics.slice(0, 3).join('\n')}`);
  }
  r.evaluate(40_000_000);
  assert.deepEqual(r.query('hole(Q, R)').rows.map((x: any) => `${x.bindings.Q}/${x.bindings.R}`), [],
                   'this world must reach its fixpoint, not stop at a budget');
  const q = (lit: string): string[][] => {
    const out = r.query(lit, { budget: 900_000_000 });
    assert.equal(out.error, undefined, `query ${lit}: ${out.error}`);
    assert.equal(out.partial, false, `query ${lit} hit a budget`);
    assert.equal(out.unpopulatable, false, `query ${lit}: nothing in this world can populate it`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return out.rows.map((row: any) => order.map((v) => unq(row.bindings[v] ?? '')));
  };
  return { q, n: (l) => q(l).length, binds: (l) => q(l).map((x) => x.join('/')).sort() };
}

let BASE: World | undefined;
const base = () => (BASE ??= build());

// ===========================================================================
// 1. THE LATTICE

test('the fourteen landmarks form a LATTICE — join and meet total and unique', () => {
  const w = base();
  // The named family is NOT closed under union: `pure` joined with `alloc` is
  // <div, exn, alloc> and no name denotes that row. The join is therefore the
  // least NAME above the union, which exists and is unique exactly when the
  // family is closed under INTERSECTION and contains the full row — a Moore
  // family. These four rows are the four ways that can fail.
  assert.deepEqual(w.binds('join_missing[audit](A, B)'), [], 'every pair has an upper bound');
  assert.deepEqual(w.binds('join_ambiguous[audit](A, B, C, D)'), [], 'and exactly one least one');
  assert.deepEqual(w.binds('meet_missing[audit](A, B)'), [], 'every pair has a lower bound');
  assert.deepEqual(w.binds('meet_ambiguous[audit](A, B, C, D)'), [], 'and exactly one greatest one');
  // ...and the bottom and the top are DERIVED sets rather than two claimed
  // names. `total` is below everything because it has no rows, not because
  // anybody said so.
  assert.deepEqual(w.binds('eff_bot(B)'), ['total']);
  assert.deepEqual(w.binds('eff_top(T)'), ['top']);
});

test('KOKA\'S ALIASES ARE DERIVED, not written down twice', () => {
  const w = base();
  // `pure = <div, exn>` is one `eff_alias` pair and the join falls out of it.
  assert.deepEqual(w.binds('eff_join(div, exn, C)'), ['pure']);
  // `io = <st<global>, div, exn, ndet>`, as the set of names at or below it.
  // A SET and not a count: adding a landmark that belongs under `io` grows it
  // by a name a reader can see, and dropping `eff_alias(io, ndet)` removes one.
  assert.deepEqual(w.binds('eff_leq(A, io)'),
    ['alloc', 'div', 'exn', 'io', 'ndet', 'pure', 'rd_global', 'st_global', 'total', 'wr_global']);
  // `st<h> = <rd, wr, alloc>`, and LOCAL STATE IS NOT UNDER `io`. That is not
  // an artefact of the encoding: Koka's `local<s>` is encapsulated, discharged
  // by `run`, which is why `io` does not contain it — and the two branches meet
  // at exactly the allocation.
  assert.deepEqual(w.binds('eff_leq(A, st_local)'),
    ['alloc', 'rd_local', 'st_local', 'total', 'wr_local']);
  assert.deepEqual(w.binds('eff_meet(io, st_local, C)'), ['alloc']);
  assert.deepEqual(w.binds('eff_join(io, st_local, C)'), ['top']);
  // the tower the founding finding names
  for (const [a, b] of [['total', 'pure'], ['pure', 'io'], ['io', 'top']])
    assert.ok(w.n(`eff_lt(${a}, ${b})`) === 1, `${a} < ${b}`);
});

test('the authored table is closed — six hygiene rows, empty', () => {
  const w = base();
  for (const a of ['eff_row_unknown[audit](N)', 'eff_label_unknown[audit](L, H)',
    'eff_alias_unknown[audit](A, P)', 'eff_alias_unnamed[audit](A)',
    'eff_name_empty[audit](N)', 'eff_heap_unknown[audit](H)',
    'eff_label_unnamed[audit](L, H)', 'eff_discharge_unknown[audit](M, L)'])
    assert.deepEqual(w.binds(a), [], a);
});

// ===========================================================================
// 2. THE PROPAGATION, AND THE ONE INDEPENDENT ORACLE

test('THE ORACLE: the exn projection reproduces may_throw ROW FOR ROW', () => {
  const w = base();
  // `may_throw[code]` was built by w_exn_propagation on 2026-09-06 for the
  // exception question alone — a different relation, in a different pack,
  // written before this layer existed. `eff_latent(F, exn, none)` re-derives it
  // as ONE PROJECTION of a general rule: seed, close over the call graph, minus
  // what a handler discharges. BOTH DIRECTIONS, because one alone is satisfied
  // by a rule that derives nothing at all.
  assert.deepEqual(w.binds('eff_exn_only[audit](F)'), [],
    'the effect layer must not invent a throw the exception layer does not have');
  assert.deepEqual(w.binds('may_throw_only[audit](F)'), [],
    'and must not lose one it does have');
  // ...and both sides are non-empty, so the agreement is a measurement rather
  // than two empty sets agreeing. A FLOOR, because a fixture gaining a throw
  // must not redden a claim about whether the two relations agree.
  assert.ok(w.n('may_throw[code](F)') >= 8, 'the oracle has something to say');
});

test('the propagation is monotone THROUGH THE JOIN, and a caller loses no label at a try', () => {
  const w = base();
  // Joining a caller's effect with its callee's must give the caller's own back
  // wherever nothing is discharged. This is the one place the join operation is
  // read by a rule rather than by a test.
  assert.deepEqual(w.binds('eff_join_short[audit](F, G, J)'), [],
    'a caller must already contain its callee');
  // AND THE GATE THE ORACLE ABOVE IS STRUCTURALLY UNABLE TO BE. `may_throw`
  // carries one label, so a discharge that swallows the callee's WHOLE ROW at a
  // try agrees with it exactly — the difference lives entirely in the seven
  // labels the oracle does not carry. MUTANT M2 below is that discharge, and
  // this row is what kills it.
  assert.deepEqual(w.binds('eff_swallowed[audit](F, C, L, H)'), [],
    'a handler removes exn and nothing else');
  // and the row is populatable rather than empty because nothing reaches it
  assert.ok(w.n('eff_catch_here[code](N)') >= 1, 'there are caught sites at all');
  assert.equal(w.n('effect_of[flow](F, N)'), w.n('fn_node[code](F)'),
    'every function gets exactly one name — the Moore closure is total here too');
  assert.deepEqual(w.binds('eff_unnamed[audit](F)'), []);
  assert.deepEqual(w.binds('eff_two_names[audit](F, A, B)'), []);
});

test('read and write PARTITION the member nodes — an identity, not a count', () => {
  const w = base();
  // A member is a read site or an assignment target and never both and never
  // neither. Written as a sum so that it is true of any corpus: the numbers on
  // both sides move together and the identity does not.
  assert.equal(w.n('eff_read_site[flow](M)') + w.n('eff_member_target[code](L)'),
    w.n('member_node_v[flow](M)'), 'every member node is a read or a write');
  assert.deepEqual(w.binds('eff_member_both[audit](M)'), [], 'and never both');
});

test('WHICH LABELS THIS CORPUS DOES NOT EXERCISE, by name', () => {
  const w = base();
  // Two of the eight, and they are empty for DIFFERENT reasons — which is the
  // whole value of naming them instead of counting them.
  //   write/global  HAS a seed and no site: nothing here assigns to a member of
  //                 a receiver the value layer cannot trace.
  //   ndet          has NO SEED AT ALL and cannot have one. Nothing in the
  //                 LANGUAGE is nondeterministic; `Math.random`, `Date.now` and
  //                 `crypto.getRandomValues` are ambient members, so `ndet`
  //                 becomes derivable exactly when `ambient_effect` exists.
  //                 It is the sharpest statement of what this layer waits for.
  assert.deepEqual(w.binds('eff_label_unseen[flow](L, H)'),
    ['ndet/none', 'write/global']);
});

test('a try with no handler catches nothing — and there is no such site here', () => {
  const w = base();
  // f_a_try_with_no_handler_catches_nothing_and_caught_here_says_it_does. The
  // absence carries its control, which is the same literal with ONE CONSTANT
  // swapped — the form facts/findings.rofl's `witness_absent` demands.
  assert.deepEqual(w.binds('eff_try_arm[flow](T, unhandled)'), []);
  assert.ok(w.n('eff_try_arm[flow](T, handled)') >= 1,
    'the control is live: this world can answer the question');
});

// ===========================================================================
// 3. THE MATRIX

test('the effect layer answers 100 js cells and the partition closes', () => {
  const w = base();
  const v = (x: string) => w.n(`verdict[audit](js, K, S, effect, ${x})`);
  // A number that moves when the MODEL changes stays a number, and this one is
  // re-stated on purpose: 33 modelled, 52 waived, 15 not modelled — of which
  // ONE is irreducible (`debugger` is `runtime_dependent`) and fourteen are open
  // and owned by name in facts/worklist.rofl.
  //
  // MOVED 2026-09-09 by `w_effect_ambient_call`, 29 -> 33 and 19 -> 15, and the
  // four are named below rather than left to the difference between two
  // numbers. A count two branches both move is right on each branch and wrong
  // in the merge; the SET says which kinds changed hands.
  assert.equal(v('modelled') + v('waived') + v('not_modelled'),
    w.n('cell[audit](js, K, S, effect)'), 'the three buckets partition the layer');
  assert.equal(w.n('cell[audit](js, K, S, effect)'), w.n('node_kind(js, K)'),
    'one cell per kind: the shape axis does not apply here');
  assert.equal(v('modelled'), 33);
  assert.equal(v('waived'), 52);
  assert.equal(v('not_modelled'), 15);
  // THE AMBIENT GROUP, BY NAME. These four are `modelled` while
  // `rules/js-ambient.rofl` — which this world deliberately does NOT load — is
  // what derives their answer, and that is the point of asserting them here:
  // the verdict is a claim about the CELL and the matrix reads claims rather
  // than rules, so this world can hold the claim and refuse the pack.
  assert.deepEqual(['call_expression', 'identifier', 'new_expression', 'optional_call_expression']
    .filter((k) => w.n(`verdict[audit](js, ${k}, none, effect, modelled)`) === 1),
    ['call_expression', 'identifier', 'new_expression', 'optional_call_expression']);
  // the reason vocabulary is closed and no excuse outlived its cause
  assert.deepEqual(w.binds('bad_reason[audit](A, K, S, L, R)'), []);
  assert.deepEqual(w.binds('orphan_claim[audit](A, K, S, L)'), []);
  assert.deepEqual(w.binds('layer_unauthorised[audit](L)'), [],
    'layer(effect) is the owner\'s and layer_authorised says so');
  // `debugger` is the one cell that is nobody's work
  assert.ok(w.n('reason[audit](js, debugger_statement, none, effect, runtime_dependent)') === 1);
  assert.ok(w.n('irreducible_unknown[audit](js, debugger_statement, none, effect)') === 1);
});

// ===========================================================================
// 4. THE CONCRETE COLUMN

test('the concrete column is DERIVED — ten sites, eight pairs, and no map', () => {
  const w = base();
  // The surface half needs no `.d.ts` at all: `prototype_of[flow]` reads the
  // receiver's KIND. The operation half is the member name. NEITHER IS
  // AUTHORED anywhere in this tree, which is the constraint the founding
  // finding imposes — Koka's set is closed at eight and `http:get` opens an
  // infinite one, so a concrete effect somebody TYPED would be the taxonomy
  // being invented after all.
  assert.deepEqual(w.binds('concrete_effect[flow](C, S, Op)').map((x) => x.split('/').slice(1).join(':')).sort(),
    ['array:at', 'array:join', 'array:join', 'bigint:toString', 'regexp:test', 'regexp:test',
      'string:concat', 'string:replaceAll', 'string:substr', 'string:trimLeft']);
  // ...AND NOT ONE OF THEM HAS A MAP INTO THE LATTICE. `ambient_effect` is the
  // table the runtime and globals surfaces owe, one row per member, and until
  // it exists every ambient call is an open cell with an owner rather than a
  // label. That is the honest answer to the majority case.
  assert.deepEqual(w.binds('concrete_unmapped[flow](S, Op)'),
    ['array/at', 'array/join', 'bigint/toString', 'regexp/test', 'string/concat',
      'string/replaceAll', 'string/substr', 'string/trimLeft']);
  assert.deepEqual(w.binds('concrete_denotes[flow](S, Op, E)'), [], 'nothing is mapped yet');
  // the three audits that go red on a surface pack that is WRONG rather than absent
  assert.deepEqual(w.binds('concrete_unnamed[audit](S, Op, E)'), []);
  assert.deepEqual(w.binds('concrete_no_origin[audit](S)'), []);
  assert.deepEqual(w.binds('concrete_async_smuggled[audit](S, Op)'), []);
});

test('POSITIVE CONTROL: one planted surface row brings the whole column to life', () => {
  // Every claim in the test above is about an EMPTY relation, and an empty
  // relation is a fact about the query until proven otherwise. This plants
  // exactly what the runtime and globals agents are building — three rows — and
  // shows that nothing in the rules has to change on the day they arrive.
  const w = build([], [`
surface_origin(array, builtin_prototype).
-- THE MEMBER IS A STRING AND THE SURFACE AND THE EFFECT ARE ATOMS. The first
-- draft of this control wrote all three as atoms; it LOADED, held, joined
-- nothing and derived zero, because selects[flow] carries a key as a string.
-- That is the shape the surface packs must supply, and it is now stated in
-- facts/js-effects.rofl because nothing objects to the wrong one.
ambient_effect(array, "join", rd_local).
ambient_effect(array, "at", rd_local).
`]);
  assert.deepEqual(w.binds('concrete_denotes[flow](S, Op, E)'),
    ['array/at/rd_local', 'array/join/rd_local']);
  // ...and the residue shrinks by exactly the two that were mapped
  assert.deepEqual(w.binds('concrete_unmapped[flow](S, Op)'),
    ['bigint/toString', 'regexp/test', 'string/concat', 'string/replaceAll',
      'string/substr', 'string/trimLeft']);
  // ...and the effect reaches a FUNCTION through the ordinary propagation, with
  // no arm added for the surface: the call sites now contribute read<local>.
  assert.ok(w.n('eff_here[flow](C, read, local)') > BASE!.n('eff_here[flow](C, read, local)'),
    'a mapped ambient call contributes its lattice row like any other node');
  // AND THE MAP INDUCES A PREORDER ON THE CONCRETE NAMES, which is the whole
  // point of having two columns: `array:join` and `array:at` are incomparable
  // AS NAMES and comparable through what they denote.
  assert.ok(w.n('concrete_leq[flow](array, "join", array, "at")') === 1);
  // a surface with no origin is a name somebody typed — the audit that keeps
  // the vocabulary derived
  const bad = build([], ['ambient_effect(http, "get", io).']);
  assert.deepEqual(bad.binds('concrete_no_origin[audit](S)'), ['http'],
    'a surface that cannot say which declaration file it came from is invented');
});

test('`axis_applies(shape, effect)` is REFUSED today and the condition is exact', () => {
  // The refinement column must EARN its layer: `unearned_axis[audit]` reports an
  // axis that splits a layer into rows all carrying the same answer. Declaring
  // the row today would mint shapes that all read `not_yet` for one reason.
  const declared = build([], ['axis_applies(shape, effect).']);
  assert.deepEqual(declared.binds('unearned_axis[audit](A, L)'), ['shape/effect'],
    'an axis that distinguishes nothing is refused, which is why the row is not in the pack');
  // ...AND IT BECOMES CORRECT ON THE DAY THE SURFACE ATTRIBUTES ONE MEMBER AND
  // LEAVES ANOTHER UNATTRIBUTED — one `handled` shape beside one `not_yet`
  // shape is exactly what `axis_earns[audit]` asks for. So the sentence in
  // facts/js-effects.rofl is a runnable claim rather than a prediction.
  const earned = build([], [`
axis_applies(shape, effect).
shape_of(js, call_expression, s_eff_mapped).
shape_of(js, call_expression, s_eff_unmapped).
shape_in(s_eff_mapped, effect).
shape_in(s_eff_unmapped, effect).
handled(js, call_expression, s_eff_mapped, effect, r_effect_concrete).
unknown_because(js, call_expression, s_eff_unmapped, effect, not_yet).
`]);
  assert.deepEqual(earned.binds('unearned_axis[audit](A, L)'), [],
    'one attributed member beside one unattributed EARNS the column');
  assert.equal(earned.n('cell[audit](js, call_expression, S, effect)'), 2,
    'and the kind splits into exactly the two shapes');
});

// ===========================================================================
// 5. THE MUTANTS
//
// The set was chosen by asking WHERE THIS CHECK IS STRUCTURALLY UNABLE TO LOOK
// rather than what else could be broken, which is the question CLAUDE.md
// records as the only one that produces survivors. Two of the six changed the
// design rather than confirming it:
//
//   * M2 — the label-blind discharge — is INVISIBLE to the only independent
//     oracle this layer has, because `may_throw` carries one label and the
//     difference lives in the other seven. It was a survivor until
//     `eff_swallowed[audit]` was written for it, which is the rule that exists
//     because the mutant did.
//   * M3 — the try with no handler — SURVIVES, and it is not a hole in the
//     check: it is a defect in `caught_here` with no site in this corpus. It is
//     recorded as a finding with a live control rather than repaired blind.

test('MUTANT M1: dropping the discharge entirely — the oracle kills it', () => {
  // Targets: that a handler discharges anything at all.
  const m = build([{ file: EFF_RULES,
    find: 'nearest_v[flow](F, C), not eff_discharged_at[code](C, L).',
    replace: 'nearest_v[flow](F, C).' }]);
  assert.ok(m.n('eff_exn_only[audit](F)') > 0,
    'KILLED: a caught throw propagates and may_throw disagrees');
});

test('MUTANT M2: a LABEL-BLIND discharge — the exn oracle cannot see it', () => {
  // Targets: that a handler removes ONE label rather than the whole row. This
  // is the mutant the design changed for.
  const m = build([{ file: EFF_RULES,
    find: 'nearest_v[flow](F, C), not eff_discharged_at[code](C, L).',
    replace: 'nearest_v[flow](F, C), not eff_catch_here[code](C).' }]);
  assert.deepEqual(m.binds('eff_exn_only[audit](F)'), [],
    'SURVIVES the oracle: exn is the only label may_throw carries');
  assert.deepEqual(m.binds('may_throw_only[audit](F)'), [], 'in both directions');
  assert.ok(m.n('eff_swallowed[audit](F, C, L, H)') > 0,
    'KILLED by eff_swallowed, which exists because this mutant survived everything else');
});

test('MUTANT M3: `caught_here` with no handler test — SURVIVES, and it is a finding', () => {
  // Targets: the repair `eff_catch_here` makes over `caught_here`. It cannot be
  // killed by this corpus, because all eleven try statements have a handler —
  // which is the finding, measured, with `eff_try_arm` as its live control.
  const m = build([{ file: EFF_RULES,
    find: `eff_catch_here[code](N) :- caught_here[code](N), in_try_block[code](TS, N),
                           ast_child[code](TS, handler, 0, _).`,
    replace: 'eff_catch_here[code](N) :- caught_here[code](N).' }]);
  assert.deepEqual(m.binds('eff_exn_only[audit](F)'), []);
  assert.deepEqual(m.binds('eff_swallowed[audit](F, C, L, H)'), []);
  assert.equal(m.n('eff_catch_here[code](N)'), base().n('eff_catch_here[code](N)'),
    'SURVIVES by the corpus: not one try in these five files lacks a handler');
});

test('MUTANT M4: the heap arms swapped — the unexercised-label set kills it', () => {
  // Targets: which heap a traced receiver belongs to. Nothing in the lattice
  // cares, and no count would have moved; the SET of labels this corpus never
  // reaches is what sees it.
  const m = build([{ file: EFF_RULES,
    find: `eff_heap_of[flow](M, local)  :- member_node_v[flow](M), eff_obj_traced[flow](M).`,
    replace: 'eff_heap_of[flow](M, global) :- member_node_v[flow](M), eff_obj_traced[flow](M).' }]);
  assert.notDeepEqual(m.binds('eff_label_unseen[flow](L, H)'), base().binds('eff_label_unseen[flow](L, H)'),
    'KILLED: write/global stops being unreachable');
});

test('MUTANT M5: `eff_alias(io, ndet)` deleted — the named set below io kills it', () => {
  // Targets: that `io` really is `<st<global>, div, exn, ndet>`. A COUNT of the
  // rows under `io` would have moved and said nothing; the set says which name
  // left.
  const m = build([{ file: EFF_FACTS, find: 'eff_alias(io, ndet).', replace: '' }]);
  assert.ok(!m.binds('eff_leq(A, io)').includes('ndet'),
    'KILLED: ndet is no longer below io, and the set names it');
  // ...and it is still a lattice, which is why the SET and not the audits is
  // the gate here. A wrong lattice and a wrong TAXONOMY are different defects.
  assert.deepEqual(m.binds('join_ambiguous[audit](A, B, C, D)'), [],
    'the four lattice audits are structurally unable to see a missing alias');
});

test('MUTANT M6: the join is no longer LEAST — join_ambiguous kills it', () => {
  // Targets: minimality of the upper bound, which is what makes `effect_of`
  // single-valued.
  const m = build([{ file: EFF_RULES,
    find: 'eff_join(A, B, C)     :- eff_ub(A, B, C), not eff_ub_lower(A, B, C).',
    replace: 'eff_join(A, B, C)     :- eff_ub(A, B, C).' }]);
  assert.ok(m.n('join_ambiguous[audit](A, B, C, D)') > 0, 'KILLED');
});

test('MUTANT M7: a read site that is also a write target — the partition kills it', () => {
  // Targets: the read/write DIRECTION, which no count of `eff_here` rows would
  // separate from a read the rule simply missed.
  const m = build([{ file: EFF_RULES,
    find: 'eff_read_site[flow](M) :- member_node_v[flow](M), not eff_member_target[code](M).',
    replace: 'eff_read_site[flow](M) :- member_node_v[flow](M).' }]);
  assert.notEqual(m.n('eff_read_site[flow](M)') + m.n('eff_member_target[code](L)'),
    m.n('member_node_v[flow](M)'), 'KILLED by the partition identity');
});

test('MUTANT M8: recursion no longer seeds div — SURVIVES the shared corpus entirely', () => {
  // Targets: the `div` seed that has no syntax. A call that can come back to the
  // function it is written in may not terminate for exactly the reason a
  // `while (true)` may not, and nothing in the tree shows it.
  //
  // IT SURVIVES EVERY GATE IN THIS FILE AND EVERY RELATION IN THE PACK, and the
  // reason is the corpus rather than the check: `eff_reaches[code](F, F)` is
  // ZERO over the five shared fixtures. They are a CALL-GRAPH corpus measured
  // against V8's own stack frames, and a cycle would have been a stack that
  // never unwinds — so there is not one recursive function in any of them.
  // That is the "waiting on a corpus" category, and the question the repository
  // asks of every survivor is which of the three it is.
  const m = build([{ file: EFF_RULES,
    find: `eff_here[flow](C, div, none) :- resolves[code](C, G), nearest_v[flow](F, C),
                                eff_reaches[code](G, F).`,
    replace: '' }]);
  assert.deepEqual(m.binds('eff_exn_only[audit](F)'), [], 'SURVIVES the oracle');
  assert.deepEqual(m.binds('eff_swallowed[audit](F, C, L, H)'), [], 'and eff_swallowed');
  assert.deepEqual(m.binds('join_missing[audit](A, B)'), [], 'and every lattice audit');
  assert.equal(m.n('eff_here[flow](N, div, none)'), base().n('eff_here[flow](N, div, none)'),
    'and even the div seeds, row for row: the shared corpus has no recursion');
  assert.equal(base().n('eff_reaches[code](F, F)'), 0, 'which is what that means, as a row');
});

test('...AND THE SEED IS EXERCISED, on a probe source rather than in a comment', () => {
  // A capability nothing exercises cannot go red, which this repository forbids
  // by name. The rule is therefore run against three lines that recurse — a
  // PROBE and not a sixth fixture, because the five shared files are what every
  // other claim here is measured over. What it shows is that the seed fires and
  // that it reaches the enclosing function's row, which is the whole of it.
  const rec = `
export function down(n) { if (n <= 0) { return 0; } return down(n - 1); }
export function mutualA(n) { return mutualB(n); }
export function mutualB(n) { return mutualA(n); }
`;
  const w = build([], [], [['rec.mjs', rec]]);
  assert.ok(w.n('eff_reaches[code](F, F)') >= 3, 'direct and mutual recursion both close');
  assert.ok(w.n('eff_here[flow](N, div, none)') > base().n('eff_here[flow](N, div, none)'),
    'and the recursive call sites seed div where no loop exists');
  // ...and the seed reaches the FUNCTION, which is the row anybody would read
  const named = new Set(w.q('effect_of[flow](F, N)')
    .filter(([, n]) => n === 'div' || n === 'pure' || n === 'top' || n === 'io')
    .flatMap(([f]) => w.q(`fn_name[code](${f}, Name)`).map(([x]) => x)));
  assert.ok(named.has('down'), `a recursive function is at least div — got ${[...named].join(' ')}`);
});
