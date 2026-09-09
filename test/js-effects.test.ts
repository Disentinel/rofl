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

/** THE CLASS-INITIALISER PROBE, w_effect_class_initialisers 2026-09-09.
 *
 *  SEVEN shapes the five shared fixtures do not have, and every one is here
 *  because a mutant of section 6 could not otherwise die. THE WHOLE REASON THE
 *  CORPUS CANNOT CARRY THEM is one measured sentence: every field initialiser
 *  in those files either allocates an arrow or calls a function that is
 *  `total`, so the propagation arm, the construction seed and the discharge all
 *  derive nothing there.
 *
 *    static heat = scratch()   a DEFINITION-time initialiser whose callee has a
 *                              row of its own
 *    glaze = crack()           a CONSTRUCTION-time initialiser that throws, so
 *                              the construction seed reaches `fires`
 *    static tongs = () => ...  a static field holding a CLOSURE whose body is
 *                              divergent: the walk must keep the arrow and
 *                              refuse to descend into it
 *    static { try ... catch }  a handler inside a class part, which
 *                              `caught_here` is structurally unable to see
 *    class Kilnling extends    a subclass with NO member of its own, so the
 *                              inheritance arm is the only way its row is
 *                              non-empty
 *    class Forge extends f()   an `extends` expression that DOES something
 *    @toll class Chime { [spin()]() {} }
 *                              a decorator and a computed key, and their labels
 *                              are deliberately different — `toll` throws and
 *                              `spin` diverges — so `exn` on `Chime` can only
 *                              be the decorator and `div` can only be the key
 *
 *  IT IS A PROBE AND NOT A SIXTH FIXTURE for the reason `build` records: the
 *  five shared files are what every other claim in this file — and the cell
 *  counts, and four other test files' numbers — are measured over. */
const KILN = `
let plate = 0;
function scratch() { plate = plate + 1; return plate; }
function crack() { throw new Error('crack'); }
function spin() { while (plate > 0) { plate = plate - 1; } return plate; }
function mount() { plate = plate + 2; return Kiln; }
function toll(v, c) { throw new Error('toll'); }
export class Kiln {
  static heat = scratch();
  static tongs = () => spin();
  glaze = crack();
  static { try { crack(); } catch (e) { plate = 0; } }
}
export function fires() { return new Kiln(); }
export class Kilnling extends Kiln {}
export function firesSub() { return new Kilnling(); }
export class Forge extends mount() {}
@toll
class Chime { [spin()]() { return plate; } }
export function chimes() { return new Chime(); }
`;

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
// 2b. WHAT RUNS WHEN A CLASS IS DEFINED, AND WHAT RUNS WHEN ONE IS BUILT
//     w_effect_class_initialisers, 2026-09-09.
//
// EVERY SET HERE IS KEYED BY CLASS NAME AND MEMBER NAME rather than by node id,
// because a node id embeds an index into its file and an element that moves
// when somebody edits a part of the fixture the claim is not about is not a
// named set. `Coin` and `#edge` do not move.

/** each class field with an initialiser, as `<class>.<key>` and the moment it
 *  runs. A PRIVATE key is read through the `id` child of its `private_name`,
 *  which is where the spelling lives — `ast_name` on the key node itself
 *  answers nothing for `#edge`, and rendering all five private fields as one
 *  string would have collapsed `#edge`, `#tally` and `#mark` into one element. */
const moments = (w: World) => w.q('eff_field_moment[flow](P, M)').map(([p, m]) => {
  const cd = w.q(`eff_field_value[code](CD, ${p}, V)`)[0]?.[0] ?? '?';
  const cls = w.q(`class_named[flow](${cd}, Name, File)`)[0]?.[0] ?? cd;
  const kn = w.q(`ast_child[code](${p}, key, 0, KN)`)[0]?.[0] ?? '?';
  const plain = w.q(`ast_name[code](${kn}, Name)`)[0]?.[0];
  const priv = w.q(`ast_child[code](${kn}, id, 0, I)`)[0]?.[0];
  const key = plain ?? (priv ? `#${w.q(`ast_name[code](${priv}, Name)`)[0]?.[0]}` : kn);
  return `${cls}.${key}/${m}`;
}).sort();

/** a class's row at one of the two moments, as `<class>/<label>/<heap>` */
const rows = (w: World, rel: string) => w.q(`${rel}(CD, L, H)`)
  .map(([cd, l, h]) => `${w.q(`class_named[flow](${cd}, Name, File)`)[0]?.[0] ?? cd}/${l}/${h}`)
  .sort();

test('A FIELD INITIALISER RUNS AT DEFINITION OR AT CONSTRUCTION, never both and never neither', () => {
  const w = base();
  // The identity first, because it is true of any corpus: a `static` field and
  // a static block run ONCE when the class is defined, a non-static initialiser
  // runs once per INSTANCE and never at all if nothing constructs the class.
  // Collapsing the two would put an effect at a point in the program where it
  // provably does not happen, which is the one thing a may-set may not do.
  assert.deepEqual(w.binds('eff_moment_both[audit](P, A, B)'), [],
    'no initialiser runs at both moments');
  assert.deepEqual(w.binds('eff_moment_unplaced[audit](P)'), [],
    'and none falls out of both — the two arms are POSITIVE so this can bite');
  // ...and then the placement itself, by name. `blank;` is absent from this set
  // and that is the point: babel emits no `value` child for a field with no
  // initialiser, so there is nothing to place.
  assert.deepEqual(moments(w), [
    'Coin.#edge/construction',
    'Coin.#mark/construction',
    'Coin.#tally/definition',
    'Coin.face/construction',
    'Coin.forge/definition',
    'Coin.mintMark/definition',
    'Coin.pick/definition',
    'Coin.strike/construction',
    'Decorated.slot/construction',
    'Doubloon.pick/definition',
    'Doubloon.tint/construction',
    'Inner.#tag/construction',
    'Outer.#tag/construction',
    'Thimble.sling/construction',
  ]);
  // BOTH `class_accessor_property` SITES ARE NON-STATIC, so the kind's verdict
  // rests on the construction half. Its plugin is on and the corpus has exactly
  // these two — a declaration in `Decorated` and one in `Thimble` that `hauls`
  // reads — which is what the kind had been waiting for at every layer.
  assert.deepEqual(moments(w).filter((m) => m.endsWith('slot/construction') || m.endsWith('sling/construction')),
    ['Decorated.slot/construction', 'Thimble.sling/construction']);
});

test('the two carriers, by class name — and the corpus can only make one of them speak', () => {
  const w = base();
  // `Coin` holds the only `static_block` in the tree; its static block writes
  // `this.mintMark`, reads `Coin.#tally` and allocates nothing of its own,
  // while `static forge = (n) => ...` allocates a closure at definition.
  assert.deepEqual(rows(w, 'class_define_eff[flow]'),
    ['Coin/alloc/none', 'Coin/read/local', 'Coin/write/local']);
  // ...and the construction side is `alloc` and nothing else, because every
  // instance initialiser in these five fixtures either allocates an arrow or
  // calls a function that is `total`. `Doubloon` is here through `super_of`
  // WITHOUT an instance initialiser that allocates — it declares only
  // `tint = punched(0)` — so this row is the inheritance arm and nothing else.
  assert.deepEqual(rows(w, 'class_construct_eff[flow]'),
    ['Coin/alloc/none', 'Doubloon/alloc/none']);
  // THE PRICE OF NOT WIDENING INTO `class_expression`, as a name rather than a
  // sentence. `eff_class_form` has one row; `Bracket` is what that costs.
  assert.deepEqual(w.q('eff_define_unreached[flow](CE, S)')
    .map(([ce]) => w.q(`class_named[flow](${ce}, Name, File)`)[0]?.[0] ?? ce), ['Bracket']);
});

test('THE PROBE: both moments with real labels, and the oracle the corpus cannot ask', () => {
  // Every claim above is about a corpus whose field initialisers are all
  // `total` or an allocation, so the propagation arm, the construction seed and
  // the discharge derive NOTHING there and no mutant of them could die. This
  // plants the seven shapes the fixtures lack — a PROBE and not a sixth
  // fixture, for the reason `build`'s own comment gives.
  const w = build([], [], [['kiln.ts', KILN]]);
  // DEFINITION TIME, and the sources are separated by their labels rather
  // than by a count. `Kiln`: `scratch` bumps a module-level `let`, so the
  // class's own row carries its write and its read, and `static tongs` is the
  // `alloc`. `exn` is NOT on `Kiln` although its static block calls something
  // that throws — the try/catch discharges it, which `caught_here` could not
  // have said (MUTANT M11). `Forge` has nothing but an `extends` that writes.
  // `Chime` has nothing but a decorator that throws and a computed key that
  // diverges, so `exn` there is the decorator and `div` is the key.
  assert.deepEqual(rows(w, 'class_define_eff[flow]').filter((r) => !r.startsWith('Coin/')),
    ['Chime/alloc/none', 'Chime/div/none', 'Chime/exn/none', 'Chime/read/local',
      'Chime/write/local', 'Forge/read/local', 'Forge/write/local',
      'Kiln/alloc/none', 'Kiln/read/local', 'Kiln/write/local']);
  // CONSTRUCTION TIME: `glaze = crack()` throws, and it reaches the class only
  // through the propagation arm — the initialiser holds a call and no label of
  // its own. `Kilnling` has no field at all and inherits the row. `Forge` is
  // absent, and correctly: `extends mount()` is a call whose value this model
  // does not follow to a class, so `super_of` has no row for it.
  assert.deepEqual(rows(w, 'class_construct_eff[flow]'),
    ['Coin/alloc/none', 'Doubloon/alloc/none',
      'Kiln/alloc/none', 'Kiln/exn/none', 'Kilnling/alloc/none', 'Kilnling/exn/none']);
  // ...AND THE CONSTRUCTION SEED REACHES A FUNCTION, which is the edge the call
  // graph does not have: the call in the initialiser has no enclosing function,
  // so `encloses[code]` attributes it to nobody and V8 names the frame
  // `<instance_members_initializer>`.
  const throwers = new Set(w.q('eff_latent[flow](F, exn, none)')
    .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));
  assert.ok(throwers.has('fires') && throwers.has('firesSub'),
    `a function whose only throw is a field initialiser is exn — got ${[...throwers].join(' ')}`);
  // AND THIS IS WHERE THE INDEPENDENT ORACLE AND THIS LAYER PART COMPANY.
  // `may_throw[code]` propagates over `resolves` + `nearest_v`, and the call in
  // a field initialiser has no caller for it to reach — so it says `fires` does
  // not throw and it is WRONG. `eff_exn_only[audit]` is the row that reports it
  // and it is EMPTY on the honest corpus, because no field initialiser in the
  // five fixtures reaches a throw. `f_may_throw_has_no_construction_edge`.
  assert.deepEqual(w.binds('eff_exn_only[audit](F)').map((f) =>
    w.q(`fn_name[code](${f}, N)`)[0]?.[0] ?? f).sort(), ['fires', 'firesSub'],
  'the divergence is exactly the two functions that construct');
  assert.deepEqual(base().binds('eff_exn_only[audit](F)'), [],
    'and the shared corpus has no site for it, which is why this is a probe');
  assert.deepEqual(w.binds('may_throw_only[audit](F)'), [],
    'the other direction stays exact: this layer loses nothing may_throw has');
});

// ===========================================================================
// 3. THE MATRIX

test('the effect layer answers 101 js cells and the partition closes', () => {
  const w = base();
  const v = (x: string) => w.n(`verdict[audit](js, K, S, effect, ${x})`);
  // A number that moves when the MODEL changes stays a number, and this one is
  // re-stated on purpose: 33 modelled, 53 waived, 14 not modelled — of which
  // ONE is irreducible (`debugger` is `runtime_dependent`) and thirteen are open
  // and owned by name in facts/worklist.rofl.
  //
  // MOVED 2026-09-09 by w_effect_module_evaluation, 29/52/19 -> 33/53/14. Four
  // kinds became `handled` under `r_effect_module` — `import_declaration`,
  // `import_expression`, `export_all_declaration`, `export_named_declaration` —
  // and `import` became `ignored`, because babel emits no `Import` node under
  // these plugins and the same argument is already written out at three other
  // layers. w_effect_implicit_coercion moved NONE of them, deliberately: a rule
  // fires on all three of its kinds and 141 of 369 coerced operands are values
  // the value layer did not trace, which is a residue and therefore an open
  // cell by this layer's own criterion.
  // THE THREE COUNTS BECAME A NAMED SET ON 2026-09-09, and the reason is the
  // merge rather than taste. `29 / 52 / 19` is three numbers that FOUR items
  // move — `w_effect_class_initialisers`, `w_effect_ambient_call`,
  // `w_effect_implicit_coercion`, `w_effect_module_evaluation` — one layer,
  // four branches, and when two of them move a number to the same value git
  // auto-merges in silence, which HANDOFF.md records as having already
  // happened once to `unproven(F)`. What replaces them:
  //
  //   * the PARTITION, an identity, unchanged;
  //   * the KINDS this layer has not answered, BY NAME — a set that shrinks by
  //     the elements one branch closes and merges as a set difference;
  //   * `waived`, which is still a number because no open item moves it: every
  //     one of the fifty-two is a decision already taken, and a branch that
  //     changes one is changing a verdict rather than adding work.
  assert.equal(v('modelled') + v('waived') + v('not_modelled'),
    w.n('cell[audit](js, K, S, effect)'), 'the three buckets partition the layer');
  assert.equal(w.n('cell[audit](js, K, S, effect)'), w.n('node_kind(js, K)'),
    'one cell per kind: the shape axis does not apply here');
  assert.deepEqual(w.binds('verdict[audit](js, K, S, effect, not_modelled)').map((x) => x.split('/')[0]).sort(), [
    // FOURTEEN -> NINE ON THE MERGE, 2026-09-09, and neither branch could have
    // written this list. `w_effect_class_initialisers` closed five kinds and
    // `w_effect_module_evaluation` closed five others, each seeing the other's
    // as still open. THE MERGED LIST IS THE ONLY PLACE THE TRUTH EXISTED — which
    // is the whole argument for a named set over three counts: two branches
    // moving `not_modelled` 19 -> 14 by different fives would have auto-merged
    // to 14 and been wrong, silently, in the shape this repository has now met
    // four times.
    //
    // NINE -> FIVE, 2026-09-09, and this is the third branch to shrink the same
    // list. `w_effect_ambient_call` closed four — `call_expression`,
    // `identifier`, `new_expression`, `optional_call_expression` — which are
    // exactly the four kinds whose cell was open because THE CALLEE IS NOT IN
    // THIS PROGRAM. It closed them by deriving the surface rather than by
    // writing effect rows: rules/js-ambient.rofl has no facts file, and what it
    // cannot attribute is a positive row in `ambient_owed[flow]` instead of a
    // silence. That is the difference between closing a cell and painting it.
    //
    // AND THE LIST IS NOW THE ARGUMENT FOR ITSELF. Three branches, three
    // different fives-and-fours, one relation: 14 -> 9 -> 5 as SETS that merge
    // by difference. As three counts it would have been 14 -> 9 twice and 9 -> 5
    // once, with git resolving the collision by picking a number.
    'binary_expression',
    'debugger_statement',
    'template_literal',
    'unary_expression',
    'with_statement',
  ], 'the kinds this layer has not answered, by name');
  // 52 -> 53 ON THE MERGE, and this one IS still a count — which is why it
  // moved silently where the list above did not. `import` became `ignored`
  // (babel emits no `Import` node under our plugins) on one branch while the
  // other branch waived nothing, so the two sides differed by one and git had
  // no conflict to raise. Kept as a count deliberately: `waived` is the half
  // whose MEMBERS are already named by `ignored(...)` rows in
  // facts/js-effects.rofl and re-listing them here would pin the same set twice.
  //
  // 53 -> 54 ON 2026-09-09, and it moved silently AGAIN, which is the second
  // entry in this comment's own changelog saying the same thing. The owner
  // declared `environment(es2025)` and `import_attribute` entered the
  // vocabulary; its effect cell is `ignored(js, import_attribute, effect,
  // a_not_an_evaluated_construct)` — an attribute is read by the HOST when it
  // decides how to parse the module, and nothing in the program evaluates it.
  // A count that has now moved twice for two unrelated reasons is the shape
  // this file argues against four hundred lines up; it stays a count only
  // because its members are named by `ignored(...)` rows, and that is the whole
  // defence it has.
  assert.equal(v('waived'), 54);
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

// ===========================================================================
// 6. IMPLICIT COERCION — w_effect_implicit_coercion
//
// The mechanism is in section 5b of rules/js-effects.rofl and the item is
// STILL OPEN. What is asserted here is the mechanism and the residue, never a
// verdict: a count of coerced operands would move with the corpus and say
// nothing about whether the three answers cover it.

test('a conversion is decided by the OPERAND, and the three answers partition it', () => {
  const w = base();
  // AN IDENTITY, so it is true of any corpus rather than of this one: every
  // coerced operand is a primitive, an in-program object, or a value the value
  // layer did not trace, and never none of the three. The numbers on both sides
  // move together and the identity does not.
  assert.deepEqual(w.binds('eff_conv_unaccounted[audit](N, X)'), [],
    'no coerced operand falls out of the bottom');
  assert.equal(w.n('eff_conv_primitive[flow](N, X)') + w.n('eff_conv_object[flow](N, X)')
    + w.n('eff_conv_untraced[flow](N, X)'), w.n('eff_coerced[flow](N, X)'),
    'primitive + object + untraced = every conversion site');
  // ...and all three arms are populated, so the identity is not the trivially
  // true one. FLOORS, because a fixture gaining an operator must not redden a
  // claim about whether the partition holds.
  for (const r of ['eff_conv_primitive[flow](N, X)', 'eff_conv_object[flow](N, X)',
    'eff_conv_untraced[flow](N, X)'])
    assert.ok(w.n(r) >= 1, `${r} is populated`);
});

test('NOT ONE OBJECT IN THIS CORPUS OVERRIDES A CONVERSION METHOD, with a live control', () => {
  const w = base();
  // The absence carries its control, which is the same literal with ONE
  // CONSTANT swapped — the form facts/findings.rofl's `witness_absent` demands
  // and the form this claim is recorded in.
  assert.deepEqual(w.binds('member_value[flow](O, "valueOf", V)'), []);
  assert.deepEqual(w.binds('member_value[flow](O, "toString", V)'), []);
  assert.ok(w.n('member_value[flow](O, "riveted", V)') >= 1,
    'the control is live: this world can answer the question');
  // so every in-program object at a conversion site converts through the
  // language's own prototype, which performs nothing — the positive half
  assert.deepEqual(w.binds('eff_conv_call[flow](N, M)'), []);
  assert.equal(w.n('eff_conv_default[flow](N, X)'), w.n('eff_conv_object[flow](N, X)'),
    'every traced object at a conversion site falls to Object.prototype');
});

test('WHICH OPERATORS THIS CORPUS HAS THAT RUN NO USER CODE, by name', () => {
  const w = base();
  // A NAMED SET AND NOT A COUNT. `eff_op_inspects` names five spellings and the
  // rest converts by complement; this is the intersection with what the corpus
  // actually carries, which is the half a reader wants and the half a mutant on
  // the table moves.
  const spell = (rel: string) => [...new Set(w.q(rel).flatMap(([n]) =>
    w.q(`ast_attr[code](${n}, operator, Op)`).map(([o]) => o)))].sort();
  assert.deepEqual(spell('eff_op_inspects[code](N)'), ['===', 'void']);
  // ...AND THE TWO THE ITEM HAD TO ANSWER FOR, which have no site at all.
  // `typeof` and `delete` were named in the item's own note as the cases it
  // owed an answer; `instanceof` is the third. All three are absent, so
  // `eff_op_beyond` is exercised by a probe below rather than by the fixtures.
  assert.deepEqual(w.binds('eff_op_beyond[flow](N, W)'), []);
  // the table must not classify a node of a kind this section does not model —
  // `operator` sits on five kinds and `eff_op_inspects` reads it off all of them
  assert.deepEqual(w.binds('eff_op_off_kind[audit](N, K)'), []);
});

test('MUTANT M9: `void` is no longer inspected — the operator set kills it', () => {
  // Targets: that the operator table separates anything at all. A count of
  // `eff_coerced` rows would move and say nothing about WHICH operator leaked.
  const m = build([{ file: EFF_RULES,
    find: 'eff_op_inspects[code](N) :- ast_attr[code](N, operator, "void").',
    replace: '' }]);
  assert.ok(m.n('eff_coerced[flow](N, X)') > base().n('eff_coerced[flow](N, X)'),
    'KILLED: five `void` operands become conversion sites');
});

test('MUTANT M10: an in-program object is treated as untraceable — the partition kills it', () => {
  // Targets: that a traced object discharges through `Object.prototype` rather
  // than falling into the residue. Both halves move, so the SUM is what sees it.
  const m = build([{ file: EFF_RULES,
    find: 'eff_conv_object[flow](N, X)     :- eff_coerced[flow](N, X), may_be_node[flow](X, _).',
    replace: 'eff_conv_object[flow](N, X)     :- eff_coerced[flow](N, X), may_be_node[flow](X, _), N != N.' }]);
  assert.ok(m.n('eff_conv_unaccounted[audit](N, X)') > 0,
    'KILLED by the partition: a traced object now falls out of the bottom');
});

test('...AND THE CONVERSION CALL IS EXERCISED, on a probe source rather than in a comment', () => {
  // A capability nothing exercises cannot go red, which this repository forbids
  // by name — and `eff_conv_call` is EMPTY on the shared corpus because not one
  // object in it declares `valueOf` or `toString`. Three lines that do.
  //
  // THE PROBE WRITES AND DOES NOT THROW, deliberately.
  // `f_the_exn_oracle_cannot_see_a_label_that_did_not_arrive_through_resolves`
  // is the finding that says why: `may_throw` closes over `resolves` and a
  // conversion is not a `resolves` edge, so a `valueOf` that threw would take
  // `eff_exn_only[audit]` red for a reason that is about the oracle rather than
  // about this arm.
  const src = `
const sink = { n: 0 };
const priced = { valueOf() { sink.n = 1; return 2; } };
export function total(n) { return priced + n; }
export function shouted(n) { return \`v\${priced}\` + n; }
export function dropped(o) { return delete o.gone; }
export function isit(x, C) { return x instanceof C; }
`;
  const w = build([], [], [['conv.mjs', src]]);
  assert.ok(w.n('eff_conv_call[flow](N, M)') >= 1, 'the seed fires on an overriding object');
  // ...and the effect reaches the ENCLOSING FUNCTION through the ordinary
  // propagation, which is the whole of what the arm is for: `total` writes
  // because `priced.valueOf` writes, and nothing in `total` says so.
  const named = new Set(w.q('eff_latent[flow](F, write, local)')
    .flatMap(([f]) => w.q(`fn_name[code](${f}, Name)`).map(([x]) => x)));
  assert.ok(named.has('total'), `a coercion carries its callee's write — got ${[...named].join(' ')}`);
  // AND THE TWO OPERATORS OUTSIDE THE MECHANISM ARE NAMED RATHER THAN SILENT
  assert.deepEqual(w.binds('eff_op_beyond[flow](N, W)').map((x) => x.split('/')[1]).sort(),
    ['delete_own', 'has_instance']);
  // ...and the partition still closes on a corpus that has all three answers
  assert.deepEqual(w.binds('eff_conv_unaccounted[audit](N, X)'), []);
});

// ===========================================================================
// 7. MODULE EVALUATION — w_effect_module_evaluation
//
// An import EVALUATES the imported module, so an import's effect is that
// module's top-level effect. The graph is `module_source[code]` and
// `import_target[code]`, both already standing in this world;
// rules/js-modules.rofl is deliberately NOT loaded, because it would need the
// two blind host emitters and change nothing about the join.

test('a module\'s effect is its top level JOINED ACROSS THE GRAPH', () => {
  const w = base();
  // A NAMED SET, one row per corpus file, and the row worth reading is
  // gamma.mjs: it declares nothing at all — three `export ... from` lines and
  // not one function — and its whole effect is inherited from alpha and delta.
  assert.deepEqual(w.binds('effect_of_module[flow](F, N)'), [
    'alpha.mjs/st_local',
    'beta.mjs/st_local',
    'delta.mjs/total',
    'gamma.mjs/st_local',
    'shapes.ts/top',
  ]);
  // the Moore closure is total over files too, exactly as it is over functions
  assert.deepEqual(w.binds('eff_mod_unnamed[audit](F)'), []);
  assert.deepEqual(w.binds('eff_mod_two_names[audit](F, A, B)'), []);
  // ...AND THE JOIN IS READ BY A RULE, a second time. An importer's effect
  // joined with the effect of a module it evaluates must give the importer's
  // own back — `eff_join_short[audit]` for a caller and its callee, said about
  // a module and the module it loads.
  assert.deepEqual(w.binds('eff_mod_join_short[audit](F, T, J)'), []);
  assert.ok(w.n('eff_evaluates_at[code](I, T)') >= 1, 'the row is populatable');
  // AND THE SUSPENSION IS NOT SMUGGLED BACK IN AS AN ORDERING EFFECT: a site
  // contributes exactly the labels its target module has and nothing else.
  assert.deepEqual(w.binds('eff_import_invented[audit](I, L, H)'), []);
  // ...AND THE SPECIFIER RESOLVER IS A COPY WITH A CONTROL. `import_target[code]`
  // is closed over `module_source[code]`, which has no arm for the dynamic form,
  // so this pack writes the same four literals again — and asserts the two agree
  // ROW FOR ROW in both directions wherever `module_source` carries the
  // specifier, which is what keeps a copy from becoming a second opinion.
  assert.deepEqual(w.binds('eff_mod_target_disagrees[audit](Src, T)'), []);
  assert.ok(w.n('import_target[code](Src, T)') >= 1, 'and both sides are populated');
});

test('the frontier is a MISSING FILE, and it is named by the file that imports it', () => {
  const w = base();
  // A NAMED SET whose elements carry no node id and no line: a declaration
  // appended anywhere in any of these files moves none of them.
  // `q` returns ONE CELL PER CAPITAL-LETTER VARIABLE IN THE ORDER THE LITERAL
  // WRITES THEM, so `(id, K, F, L)` is THREE cells and the file is `[1]`, not
  // `[2]`. test/js-corpus-world.ts records this as the fourth wrong destructure
  // of a positional result in this repository; this was the fifth, and it read
  // as three line numbers.
  const outside = w.q('eff_import_outside[flow](I, Src)')
    .map(([i, src]) => `${w.q(`ast_node[code](${i}, K, F, L)`)[0]?.[1]} ${src}`).sort();
  assert.deepEqual(outside,
    ['alpha.mjs ./trace.mjs', 'beta.mjs ./trace.mjs', 'delta.mjs ./trace.mjs'],
    'trace.mjs is the oracle probe and is not part of the corpus');
});

test('THE JOIN OVER THE GRAPH IS A FIXPOINT — a cyclic module pair, on a probe', () => {
  // ES MODULES CAN BE CYCLIC and this corpus is acyclic: beta -> alpha,
  // beta -> gamma, gamma -> alpha, gamma -> delta, and gamma.mjs's own header
  // says the direction was chosen to avoid a cycle. So the case the rules are
  // written for has no site in the fixtures and is exercised here.
  //
  // A PROBE AND NOT TWO MORE `.mjs` FIXTURES: test/js-modules.test.ts imports
  // every `.mjs` in test/fixtures/js-call with node, so a sixth file there
  // moves another branch's oracle.
  const cycA = `
import './cycB.mjs';
const boxA = {};
boxA.hit = 1;
export function fromA(n) { return n; }
`;
  const cycB = `
import { fromA } from './cycA.mjs';
export function fromB(n) { return fromA(n); }
while (0) { }
`;
  const w = build([], [], [['cycA.mjs', cycA], ['cycB.mjs', cycB]]);
  // the cycle closes IN BOTH DIRECTIONS: cycA's allocation and write reach cycB,
  // and cycB's `div` reaches cycA. Neither file contains the other's construct.
  const rows = (f: string) => w.q(`eff_module[flow]("${f}", L, H)`).map((x) => x.join('/')).sort();
  for (const f of ['cycA.mjs', 'cycB.mjs'])
    assert.deepEqual(rows(f), ['alloc/none', 'div/none', 'write/local'], f);
  // ...and the fixpoint TERMINATED, which is the claim a walk could not make.
  // `build` already asserts `hole(Q, R)` is empty, so reaching this line at all
  // is the statement; this names it.
  assert.deepEqual(w.binds('eff_import_invented[audit](I, L, H)'), []);
  assert.deepEqual(w.binds('eff_mod_join_short[audit](F, T, J)'), []);
});

test('a DYNAMIC import evaluates its module, and the suspension is not an effect', () => {
  // The corpus's one `import_expression` is `import(p)` with a computed
  // specifier — the irreducible form the modules layer already records as
  // `runtime_dependent` — so the literal form has no site and is exercised here.
  const dyn = `
export async function later(n) { const m = await import('./cycC.mjs'); return m.fromC(n); }
`;
  const cycC = `
const boxC = {};
boxC.hit = 1;
export function fromC(n) { return n; }
`;
  const w = build([], [], [['dyn.mjs', dyn], ['cycC.mjs', cycC]]);
  // the site carries the target's row...
  assert.ok(w.q('eff_evaluates_at[code](I, T)').some(([, t]) => t === 'cycC.mjs'),
    'a dynamic import with a literal specifier is a module edge');
  // ...and NOTHING ELSE. A promise is not an effect here: `await` is waived
  // under `a_suspension_is_not_an_effect` and a dynamic import must not smuggle
  // an ordering label back in through the module graph.
  assert.deepEqual(w.binds('eff_import_invented[audit](I, L, H)'), []);
  // the effect lands on the ENCLOSING FUNCTION, because this site is inside one
  const named = new Set(w.q('eff_latent[flow](F, write, local)')
    .flatMap(([f]) => w.q(`fn_name[code](${f}, Name)`).map(([x]) => x)));
  assert.ok(named.has('later'), `a dynamic import carries its module's row — got ${[...named].join(' ')}`);
});

test('MUTANT M11: the erasure guard is dropped — a type-only import evaluates', () => {
  // Targets: that `import type` evaluates NOTHING. There is no type-only import
  // in the shared corpus (`ast_attr(_, import_kind, "type")` is empty), so this
  // mutant is measured against a probe that has one.
  const eraA = `
import type { Shape } from './eraB.mjs';
export function useA(s) { return s; }
`;
  const eraB = `
const boxB = {};
boxB.hit = 1;
export function fromB(n) { return n; }
`;
  const files: [string, string][] = [['eraA.mjs', eraA], ['eraB.mjs', eraB]];
  const clean = build([], [], files);
  assert.deepEqual(clean.q('eff_module[flow]("eraA.mjs", L, H)'), [],
    'a type-only import evaluates nothing at all');
  const m = build([{ file: EFF_RULES,
    find: `eff_evaluates_at[code](I, T) :- eff_mod_src[code](I, Src, _), not eff_erased[code](I),
                                eff_mod_target[code](Src, T).`,
    replace: `eff_evaluates_at[code](I, T) :- eff_mod_src[code](I, Src, _),
                                eff_mod_target[code](Src, T).` }], [], files);
  assert.ok(m.n('eff_module[flow]("eraA.mjs", L, H)') > 0,
    'KILLED: the erased import now runs the module');
});

test('MUTANT M12: the top-level test is dropped — every function becomes its module', () => {
  // Targets: `not eff_in_fn(N)`, which is the whole definition of "a module's
  // own top level". Without it a module's row is every node in the file, so the
  // distinction between what a module DOES and what its functions MAY do is
  // gone — and the named set of module effects is what says so.
  const m = build([{ file: EFF_RULES,
    find: `eff_module[flow](F, L, H) :- eff_here[flow](N, L, H), not eff_in_fn[flow](N),
                             ast_node[code](N, _, F, _).`,
    replace: `eff_module[flow](F, L, H) :- eff_here[flow](N, L, H),
                             ast_node[code](N, _, F, _).` }]);
  assert.notDeepEqual(m.binds('effect_of_module[flow](F, N)'), base().binds('effect_of_module[flow](F, N)'),
    'KILLED: delta.mjs stops being `total` although its top level does nothing');
});

// ===========================================================================
// 8. WHERE THIS LAYER'S ONE ORACLE IS STRUCTURALLY UNABLE TO LOOK
//
// f_the_exn_oracle_cannot_see_a_label_that_did_not_arrive_through_resolves.
// This is a MEASUREMENT of a defect that predates both items in this file's
// section 6 and 7, kept as a runnable row rather than as prose, because its
// premise cannot be stated over the honest world: `ambient_effect` is empty.

test('ONE HONEST SURFACE ROW MAPPING TO `io` TURNS THE exn ORACLE RED', () => {
  // `may_throw[code]` closes over `resolves` and `throw_statement` and nothing
  // else. The concrete column seeds a label at a call site `resolves` has no row
  // for, and `io` CONTAINS `exn` — so the first member the runtime and globals
  // surfaces attribute to `io`, `exn`, `pure` or `top` breaks the only
  // row-for-row cross-check this layer has.
  const w = build([], [`
surface_origin(array, builtin_prototype).
ambient_effect(array, "join", io).
`]);
  assert.deepEqual(w.binds('concrete_denotes[flow](S, Op, E)'), ['array/join/io']);
  assert.ok(w.n('eff_exn_only[audit](F)') > 0,
    'the effect layer now claims a throw the exception layer does not have');
  assert.deepEqual(w.binds('may_throw_only[audit](F)'), [],
    'and only in that direction, which is why the oracle reads as a false alarm');
  // ...and the existing positive control stays green ONLY because it maps two
  // members to `rd_local`, which carries no `exn`. That is the coincidence this
  // test exists to stop being one.
  const ok = build([], [`
surface_origin(array, builtin_prototype).
ambient_effect(array, "join", rd_local).
`]);
  assert.deepEqual(ok.binds('eff_exn_only[audit](F)'), []);
});

// ---------------------------------------------------------------------------
// M9 .. M14 — THE CLASS INITIALISERS (w_effect_class_initialisers, 2026-09-09).
//
// The set was chosen by asking where THIS check cannot look, and the answer was
// the same each time: the shared corpus has no field initialiser whose effect is
// anything but an allocation, so three of the six survive it entirely and die
// only against `KILN`. That is the difference between a rule that does nothing
// and a corpus with no site, and it is why the probe exists.
//
//   M9   collapse the two moments          KILLED by the corpus
//   M10  descend through a closure         survives the corpus, KILLED by KILN
//   M11  drop the class-part handler       survives ROW FOR ROW, KILLED by KILN
//   M12  drop the inheritance arm          KILLED by the corpus
//   M13  drop the construction seed        survives EVERY relation, KILLED by KILN
//   M14  drop the class-declaration alloc  survives `eff_latent`, KILLED by `eff_here`

test('MUTANT M9: the two moments collapsed — the partition identity kills it', () => {
  // Targets: that `static` is what decides WHEN an initialiser runs. Both arms
  // now read the same attribute value, so a non-static field lands in both
  // moments and a static one in neither.
  const m = build([{ file: EFF_RULES,
    find: `eff_field_moment[flow](P, definition)   :- eff_field_value[code](_, P, _),
                                           ast_attr[code](P, static, true).`,
    replace: `eff_field_moment[flow](P, definition)   :- eff_field_value[code](_, P, _),
                                           ast_attr[code](P, static, false).` }]);
  assert.ok(m.n('eff_moment_both[audit](P, A, B)') > 0, 'KILLED: an initialiser at both moments');
  assert.ok(m.n('eff_moment_unplaced[audit](P)') > 0, 'and one at neither');
});

test('MUTANT M10: the walk descends THROUGH a closure — survives the corpus, dies on the probe', () => {
  // Targets: that a static field holding a function allocates at definition and
  // does NOT perform what its body performs. Without the guard the walk sweeps
  // every latent body into the definition moment, which is the exact confusion
  // the latent group exists to prevent.
  const mut = { file: EFF_RULES,
    find: `eff_runs_in[flow](P, X) :- eff_runs_in[flow](P, Y), not fn_node_v[flow](Y),
                           ast_in[code](Y, X).`,
    replace: 'eff_runs_in[flow](P, X) :- eff_runs_in[flow](P, Y), ast_in[code](Y, X).' };
  const m = build([mut]);
  assert.deepEqual(rows(m, 'class_define_eff[flow]'), rows(base(), 'class_define_eff[flow]'),
    'SURVIVES the shared corpus: `static forge = (n) => hammered(n)` has a total body');
  const p = build([mut], [], [['kiln.ts', KILN]]);
  assert.ok(rows(p, 'class_define_eff[flow]').includes('Kiln/div/none'),
    'KILLED by the probe: `static tongs = () => spin()` diverges only when called');
});

test('MUTANT M11: the class-part handler dropped — survives ROW FOR ROW, dies on the probe', () => {
  // Targets: the arm that repairs `caught_here` inside a class part. It is the
  // clearest survivor of the set, because deleting it changes NOTHING here —
  // not one try in these five files sits in a static block or an initialiser.
  const mut = { file: EFF_RULES,
    find: `eff_catch_here[code](N) :- eff_runs_in[flow](P, TS),
                           ast_node[code](TS, try_statement, _, _),
                           in_try_block[code](TS, N), eff_runs_in[flow](P, N),
                           ast_child[code](TS, handler, 0, _).`,
    replace: '' };
  const m = build([mut]);
  assert.equal(m.n('eff_catch_here[code](N)'), base().n('eff_catch_here[code](N)'),
    'SURVIVES: no try in the shared corpus runs in a class part');
  assert.equal(m.n('eff_here[flow](N, L, H)'), base().n('eff_here[flow](N, L, H)'),
    'and the seeds are unchanged, so the repair costs the honest tree nothing');
  const p = build([mut], [], [['kiln.ts', KILN]]);
  assert.ok(rows(p, 'class_define_eff[flow]').includes('Kiln/exn/none'),
    'KILLED by the probe: a handler in plain sight, ignored');
});

test('MUTANT M12: a subclass stops running its ancestors\' initialisers — the corpus kills it', () => {
  // Targets: that constructing a subclass runs the BASE's instance initialisers
  // too, INCLUDING the shadowed ones. `Doubloon` declares `tint = punched(0)`
  // and nothing that allocates, so its whole construction row is this arm.
  const m = build([{ file: EFF_RULES,
    find: `class_construct_eff[flow](CD, L, H) :- super_of[flow](CD, SD),
                                       class_construct_eff[flow](SD, L, H).`,
    replace: '' }]);
  assert.deepEqual(rows(m, 'class_construct_eff[flow]'), ['Coin/alloc/none'],
    'KILLED: Doubloon leaves the relation entirely');
});

test('MUTANT M13: the construction seed dropped — survives EVERYTHING here, dies on the probe', () => {
  // Targets: the edge from an instance initialiser to the `new` that runs it. It
  // survives every relation in this pack over the shared corpus for a reason
  // worth stating rather than counting: the only construction-time label those
  // fixtures have is `alloc`, and `new_expression` is already in
  // `eff_alloc_kind`, so the seed delivers a label the site already carried.
  const mut = { file: EFF_RULES,
    find: `eff_here[flow](X, L, H)  :- ast_node[code](X, new_expression, _, _),
                            may_be_node[flow](X, CD), class_construct_eff[flow](CD, L, H).`,
    replace: '' };
  const m = build([mut]);
  assert.equal(m.n('eff_here[flow](N, L, H)'), base().n('eff_here[flow](N, L, H)'),
    'SURVIVES row for row');
  assert.equal(m.n('eff_latent[flow](F, L, H)'), base().n('eff_latent[flow](F, L, H)'),
    'and so does the join');
  assert.deepEqual(m.binds('eff_exn_only[audit](F)'), [], 'and the independent oracle');
  const p = build([mut], [], [['kiln.ts', KILN]]);
  assert.deepEqual(p.binds('eff_exn_only[audit](F)'), [],
    'KILLED by the probe: `fires` stops carrying the throw its construction performs');
});

test('MUTANT M14: a class declaration allocates nothing — `eff_latent` cannot see it', () => {
  // Targets: the one-row claim that evaluating a class declaration creates a
  // fresh mutable identity, exactly as `class_expression` does. It survives
  // `eff_latent` and `effect_of` on this corpus because every class here is
  // either at a module's top level, where `nearest_v` reaches nothing, or inside
  // a function that already allocates through the `new` beside it.
  const m = build([{ file: EFF_RULES, find: 'eff_alloc_kind(class_declaration).', replace: '' }]);
  assert.equal(m.n('eff_latent[flow](F, L, H)'), base().n('eff_latent[flow](F, L, H)'),
    'SURVIVES the join: no function in this corpus needed it to be alloc');
  assert.equal(m.n('effect_of[flow](F, N)'), base().n('effect_of[flow](F, N)'), 'and every name');
  const allocked = (w: World) => new Set(w.q('eff_here[flow](N, alloc, none)')
    .filter(([n]) => w.q(`ast_node[code](${n}, class_declaration, F, L)`).length === 1)
    .flatMap(([n]) => w.q(`class_named[flow](${n}, Name, File)`).map(([x]) => x)));
  assert.deepEqual([...allocked(m)], ['Coin'],
    'KILLED by eff_here: only Coin is left, and through its static field rather than its kind');
  assert.ok(allocked(base()).size > 15, 'while every class declaration carried it');
});

// ===========================================================================
// 5d. A HIDDEN CALL THAT REACHES `calls` AND NOT `resolves`
//     w_destructuring_hides_a_call, second pass 2026-09-09.
//
// THE HOLE THIS SECTION REPAIRS WAS ASSERTED AWAY IN THE LEDGER. The note
// beside `handled(js, object_pattern, effect, r_effect_transfer)` read
// "`pattern_iterates` and `pattern_accessor` turn each into a `resolves` row,
// so at this layer they are ordinary calls". Only the first half is true, and
// `eff_latent` closes over `resolves` — so THREE of the four kinds contributed
// nothing whatever while the cell said they were ordinary calls.
//
// IT IS A PROBE AND NOT A FIXTURE, for the reason `build` records and for one
// more that is measured: every getter in the five shared files is PURE, so the
// repair moves `eff_latent` by zero rows there — 401 with the arm and 401
// without, gained 0, lost 0. A repair invisible on the corpus is exactly the
// class that needs a probe rather than a number.

/** ONE GETTER THAT WRITES AND THROWS, read five ways.
 *
 *  `readsByMember` is the CONTROL and not a case: it is the shape the layer
 *  already handled, so every assertion below is "the other four now say what
 *  this one has always said" rather than "the other four say something". */
const GATE = `
let sink = 0;
const gate = { get hot() { sink = sink + 1; throw new Error('x'); } };
export function readsByMember() { return gate.hot; }
export function readsByPattern() { const { hot } = gate; return hot; }
export function readsByRest() { const { other, ...rest } = gate; return rest; }
export function readsBySpread() { return { ...gate }; }
`;

/** AN ITERATOR WHOSE `next` DOES SOMETHING, reached through three doors.
 *
 *  The corpus cannot carry this claim: its four for-of sites and its three
 *  pattern sites all reach `bump` as their `next`, and `bump` has no operation
 *  to propagate — so the second hop of the protocol was untestable here in
 *  either direction. */
const REEL = `
let tally = 0;
function stepper() { tally = tally + 1; return { done: true }; }
const iterObj = { next: stepper };
const reel = { iterator() { return iterObj; } };
export function viaForOf() { for (const x of reel) { const y = x; } }
export function viaArrayPattern() { const [a] = reel; return a; }
export function viaSpreadArg() { return String(...reel); }
`;

/** a named function's row, as `<label><heap>` */
const rowOf = (w: World, fn: string) => w.q('fn_name[code](F, N)').filter(([, n]) => n === fn)
  .flatMap(([f]) => w.q(`eff_latent[flow](${f}, L, H)`).map(([l, h]) => `${l}<${h}>`)).sort();


// ===========================================================================
// THE DEMONSTRATION, AND IT IS A DEMONSTRATION RATHER THAN A GATE.
//
// The hole below is REAL, MEASURED and DELIBERATELY UNREPAIRED, by the owner's
// decision on 2026-09-09: the arm that closes it belongs to the call-graph and
// effect packs together and is not to arrive inside a destructuring merge. So
// what these tests assert is that the hole IS THERE and that the instrument
// which ought to have found it CANNOT — and they will go red the day somebody
// closes it, which is the correct direction for a test whose subject is a
// known defect. `w_effect_reads_only_what_resolves` owns the repair.

test('THE HOLE: a getter reached through a BINDING contributes nothing to its caller', () => {
  const p = build([], [], [['gate.ts', GATE]]);

  // THE CONTROL FIRST, because "these three are empty" means nothing until the
  // shape the layer DOES handle is shown to be full in the same world.
  assert.deepEqual(rowOf(p, 'readsByMember'),
    ['alloc<none>', 'exn<none>', 'read<local>', 'write<local>'],
    'the control: a getter reached through a MEMBER carries its whole row');

  // ...AND THE SAME GETTER THROUGH A BINDING CARRIES NOTHING. `pattern_accessor`
  // reaches `calls[code]` and not `resolves[code]` — deliberately, because two
  // `resolves` rows at one node is what `ambiguous_call[audit]` exists to report
  // — and `eff_latent` closes over `resolves`.
  assert.deepEqual(rowOf(p, 'readsByPattern'), [], 'object_pattern: nothing');
  assert.deepEqual(rowOf(p, 'readsByRest'), [], 'rest_element: nothing');
  assert.deepEqual(rowOf(p, 'readsBySpread'), ['alloc<none>'],
    'spread_element: the literal\'s own allocation and no part of the getter');

  // THE DOORS ARE NAMED even though nothing propagates through them, which is
  // what makes the hole queryable rather than a paragraph.
  assert.ok(p.n('eff_hidden_call[flow](N, M)') > 0, 'the doors are named');

  // AND THE GATE THAT SHOULD HAVE CAUGHT IT IS GREEN IN THIS VERY WORLD. This
  // is the finding rather than the missing arm: `eff_join_short[audit]` says a
  // caller's row contains its callee's, and it reads `resolves` — the same
  // relation the propagation reads — so it is structurally unable to see an
  // edge the propagation never took.
  assert.deepEqual(p.q('eff_join_short[audit](F, G, J)'), [],
    'the gate for exactly this question cannot look where the hole is');
  assert.deepEqual(p.q('eff_edge_unclosed[flow](F, G, L, H)').length > 0, true,
    'while the relation that CAN look reports it');

  // ...and every other gate in the pack is shut, so the world is honest apart
  // from the one thing under measurement.
  for (const a of ['eff_swallowed[audit](F, C, L, H)', 'may_throw_only[audit](F)',
    'eff_unnamed[audit](F)', 'eff_conv_unaccounted[audit](N, X)'])
    assert.deepEqual(p.q(a), [], a);
});

test('THE RESIDUE names what the layer drops, by caller, callee and label', () => {
  const p = build([], [], [['gate.ts', GATE]]);
  const unclosed = (w: World) => w.q('eff_edge_unclosed[flow](F, G, L, H)')
    .map(([f, g, l, h]) => `${w.q(`fn_name[code](${f}, N)`)[0]?.[0]} -> `
       + `${w.q(`fn_name[code](${g}, N)`)[0]?.[0]} : ${l}<${h}>`).sort();
  // A NAMED SET: caller, callee and label. No file, no line, no count — a
  // fixture appended anywhere else in the corpus moves nothing in it.
  assert.deepEqual(unclosed(p), [
    'readsByPattern -> hot : alloc<none>', 'readsByPattern -> hot : exn<none>',
    'readsByPattern -> hot : read<local>', 'readsByPattern -> hot : write<local>',
    'readsByRest -> hot : alloc<none>', 'readsByRest -> hot : exn<none>',
    'readsByRest -> hot : read<local>', 'readsByRest -> hot : write<local>',
    'readsBySpread -> hot : exn<none>', 'readsBySpread -> hot : read<local>',
    'readsBySpread -> hot : write<local>',
  ]);
  // ...AND EMPTY ON THE SHARED CORPUS, which is a fact about the fixtures and
  // not about the rule: every getter in the five files is pure, so there is no
  // row for the relation to carry even though the doors are all there.
  assert.deepEqual(base().q('eff_edge_unclosed[flow](F, G, L, H)'), []);
  assert.ok(base().n('eff_hidden_call[flow](N, M)') > 0,
    'positive control: the doors exist in the shared corpus, the labels do not');
});

test('THE SECOND HOP of the iterator protocol is dropped through every door', () => {
  const p = build([], [], [['reel.ts', REEL]]);
  // `pattern_iterates` IS a `resolves` row, so the iterator METHOD propagates —
  // but the `next()` it implies is a `calls` row and does not. `stepper` writes;
  // none of the three callers carries it.
  assert.deepEqual(rowOf(p, 'stepper'), ['alloc<none>', 'read<local>', 'write<local>'],
    'the control: the callee has a row to lose');
  assert.deepEqual(rowOf(p, 'viaArrayPattern'), [], 'the array pattern drops it');
  assert.deepEqual(rowOf(p, 'viaSpreadArg'), [], 'and the spread argument');
  assert.deepEqual(rowOf(p, 'viaForOf'), ['div<none>'],
    'and the loop, which carries only its own loop');
  // ...AND THE CALL GRAPH HAS ALL THREE EDGES, which is what makes this a
  // DROPPED edge rather than a missing one. The two layers disagree and only
  // one of them is right.
  const named = new Set(p.q('calls_named[code](A, B)').map(([a, b]) => `${a} -> ${b}`));
  for (const e of ['viaArrayPattern -> stepper', 'viaSpreadArg -> stepper', 'viaForOf -> stepper'])
    assert.ok(named.has(e), `the call graph carries ${e}`);
  // ...and the same silent gate, in this world too.
  assert.deepEqual(p.q('eff_join_short[audit](F, G, J)'), [],
    'the gate for exactly this question cannot look where the hole is');
});

test('MUTANT M15: the residue relation reads `resolves` like the gate it corrects', () => {
  // Targets: that `eff_edge_unclosed` ranges over `calls[code]` — the relation
  // carrying EVERY door — and not over the one the propagation already reads.
  // A version that read `resolves` would be a second copy of `eff_join_short`
  // and would report nothing, which is the defect it exists to expose.
  const p = build([{ file: EFF_RULES,
    find: 'eff_edge_unclosed[flow](F, G, L, H) :- calls[code](F, G), fn_node[code](F),',
    replace: 'eff_edge_unclosed[flow](F, G, L, H) :- resolves[code](C, G), nearest_fn[code](F, C), fn_node[code](F),' }],
    [], [['gate.ts', GATE]]);
  assert.deepEqual(p.q('eff_edge_unclosed[flow](F, G, L, H)'), [],
    'KILLED: reading `resolves` makes the residue blind to exactly what it is for');
});

test('MUTANT M16: the doors go unnamed and the residue has nothing to report about them', () => {
  // Targets: `eff_hidden_call`'s two arms. It contributes NO label anywhere, so
  // nothing in `eff_latent`, `effect_of` or any audit moves when it is removed —
  // which is precisely why the relation had to be written to make the hole
  // visible at all. The kill is the residue losing the getter rows while the
  // call graph keeps the edges.
  const mut = [{ file: EFF_RULES, find: 'eff_hidden_call[flow](N, M) :- pattern_accessor[code](N, M).',
                 replace: '' }];
  const m = build(mut);
  assert.equal(m.n('eff_latent[flow](F, L, H)'), base().n('eff_latent[flow](F, L, H)'),
    'SURVIVES the propagation, because this relation propagates nothing');
  const p = build(mut, [], [['gate.ts', GATE]]);
  assert.equal(p.n('eff_hidden_call[flow](N, M)'), 0, 'KILLED: no getter door is named');
  // ...and the residue is UNMOVED, which is the honest reading and worth the
  // line: `eff_edge_unclosed` ranges over `calls[code]` and never consulted
  // `eff_hidden_call` at all. The two relations answer different halves —
  // WHICH doors exist, and WHAT gets dropped — and this mutant says so.
  assert.ok(p.n('eff_edge_unclosed[flow](F, G, L, H)') > 0,
    'the residue is independent of the door list, and reports the drop anyway');
});

test('THE ARM THAT WOULD CLOSE IT IS ONE LINE, and it is not here', () => {
  // NOT A MUTANT — the opposite. This plants the REPAIR the owner refused and
  // measures what it would buy, so that the refusal is a decision with a number
  // beside it rather than an omission. It is the same shape MUTANT B in
  // test/js-layer-cost.test.ts took when a repair landed: plant the other state
  // and hold the current one against it.
  const REPAIR = 'eff_hidden_call[flow](N, M) :- pattern_next[code](N, M).\n'
    + 'eff_latent[flow](F, L, H) :- eff_hidden_call[flow](N, M), eff_latent[flow](M, L, H),\n'
    + '                             nearest_v[flow](F, N), not eff_discharged_at[code](N, L).';
  const p = build([{ file: EFF_RULES,
    find: 'eff_hidden_call[flow](N, M) :- pattern_next[code](N, M).', replace: REPAIR }],
    [], [['gate.ts', GATE]]);
  // ALL THREE BINDINGS WOULD CARRY THE CONTROL'S ROW...
  const member = ['alloc<none>', 'exn<none>', 'read<local>', 'write<local>'];
  for (const fn of ['readsByPattern', 'readsByRest', 'readsBySpread'])
    assert.deepEqual(rowOf(p, fn), member, `${fn} would say what the member read says`);
  // ...THE RESIDUE WOULD EMPTY...
  assert.deepEqual(p.q('eff_edge_unclosed[flow](F, G, L, H)'), []);
  // ...AND THE COST TO THE SHARED CORPUS WOULD BE ZERO ROWS, which is the
  // measurement that makes this a decision about the MERGE and not about the
  // model: every getter in the five fixtures is pure.
  const c = build([{ file: EFF_RULES,
    find: 'eff_hidden_call[flow](N, M) :- pattern_next[code](N, M).', replace: REPAIR }]);
  assert.equal(c.n('eff_latent[flow](F, L, H)'), base().n('eff_latent[flow](F, L, H)'),
    'the repair moves the shared corpus by zero rows');
  // ...AND NOTHING WOULD REACH THE TOP OF THE LATTICE, the standard
  // test/js-ambient.test.ts sets: the arm propagates an EXISTING row over an
  // edge and seeds nothing for a source the value layer did not trace.
  const tops = (w: World) => [...new Set(w.q('effect_of[flow](F, top)')
    .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)))].sort();
  assert.deepEqual(tops(c), tops(base()),
    'not one function would reach the top of the lattice because of it');
  // AND THE KNOWN `may_throw` DEFECT IS WHAT IT WOULD EXPOSE, which is a second
  // reason the repair is not a one-liner in someone else's merge: with the arm
  // in, this layer knows a throw its one independent oracle cannot follow.
  // `may_throw[code]` closes over `resolves` and `throw_statement`, so a getter
  // reached through a BINDING is exactly the shape it cannot see. Three
  // branches met that relation on 2026-09-09 and all three left it alone.
  assert.deepEqual(p.q('eff_exn_only[audit](F)')
    .map(([f]) => p.q(`fn_name[code](${f}, N)`)[0]?.[0]).sort(),
    ['readsByPattern', 'readsByRest', 'readsBySpread'],
    'the repair would light up the oracle gap, which is somebody else\'s item');
  assert.deepEqual(base().q('eff_exn_only[audit](F)'), [],
    'and the honest tree is untouched either way');
});
