// js-vocabulary.test.ts — THE MODEL'S OPINIONS ABOUT KINDS, AND THE LIST IT
// CLAIMS TO DESCRIBE.
//
// rules/js-vocabulary.rofl is the audit; this file is its evidence. It also
// carries the HALF THAT CANNOT LIVE IN THE LANGUAGE — see the census at the
// bottom — and saying which half is which is most of what this file is for.
//
// THE WORLD HERE HAS NO CORPUS, and that is a measurement rather than a
// convenience. The audit reads `premise_lit` and `node_kind` and nothing else,
// so a corpus adds nothing to its answer and 1.5 s to its cost: measured
// 2026-09-08, a full corpus world is 2032 ms and the same world with this
// audit loaded is 2212 ms — 8.9% on EVERY world in the suite — while the
// corpus-free world this file builds is 571 ms in total. The audit therefore
// lives in its own pack, loaded here, rather than in rules/js-model.rofl where
// every test would pay for it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const VOC = 'rules/js-vocabulary.rofl';
const PACKS = [
  'boot.rofl',
  'facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
  'facts/js-modules.rofl', 'facts/js-shapes.rofl', 'facts/js-statements.rofl',
  'facts/js-controlflow.rofl',
  'rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
  'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl', 'rules/js-modules.rofl',
];
const BUDGET = { budget: 900_000_000 };

// TWO FIXTURE RULES, AND THEY ARE FIXTURES IN THE SAME SENSE AS
// test/fixtures/js-call/shapes.ts.txt: a shape the corpus does not contain,
// written so that the thing which reads it is measured rather than assumed.
// Here the corpus is the RULES, so a fixture is a rule.
//
// The negated one exists because a mutant demanded it. Deleting the `$not` arm
// from the audit changed NOTHING on an honest tree — no rule in this model
// negates a kind literal with a constant in it — so the arm was a decoration
// until something named a kind that way. Rather than record a surviving mutant,
// give it a site.
const NEG_SITE = 'neg_site_probe[code](X) :- ast_node[code](X, _, _, _), '
               + 'not ast_node[code](X, s_negated_probe_kind, _, _).';
const POS_SITE = 'pos_site_probe[code](X) :- ast_node[code](X, s_positive_probe_kind, _, _).';

type Mut = [find: string, replace: string];
function world(extra: string[] = [], mut?: Mut): Rofl {
  const r = new Rofl();
  let voc = read(VOC);
  if (mut) {
    assert.ok(voc.includes(mut[0]), `mutation anchor absent in ${VOC}: ${mut[0]}`);
    voc = voc.replace(mut[0], mut[1]);
  }
  const res = r.load([...PACKS.map(read), voc, ...extra].join('\n'));
  assert.ok(res.ok, `world REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  return r;
}
// EVERY EMPTY ANSWER HERE IS AN ASSERTION, so every empty answer is guarded.
// `assert.deepEqual(audit(world()), [])` is the central claim of this file and
// it would pass just as well on a MISSPELLED relation name, which is what
// `unpopulatable` exists to refuse: the kernel distinguishes "nothing derived"
// from "nothing in this world could derive this". It stays false in the mutant
// worlds too — a deleted premise leaves the rule head standing — so the guard
// costs nothing there and catches a rename everywhere.
const audit = (r: Rofl): string[] => {
  const res = r.query('rule_opinion_unlisted[audit](L, K)', BUDGET);
  assert.equal(res.unpopulatable, false, 'nothing in this world can populate the audit');
  assert.equal(res.partial, false, 'the audit query hit a budget');
  return res.rows.map((x) => String(x.bindings.K)).sort();
};

/** a query whose empty answer would be a claim, guarded the same way */
const asked = (r: Rofl, lit: string) => {
  const res = r.query(lit, BUDGET);
  assert.equal(res.unpopulatable, false, `nothing in this world can populate ${lit}`);
  assert.equal(res.partial, false, `${lit} hit a budget`);
  return res.rows;
};

// ---------------------------------------------------------------------------
// 1. THE AUDIT ON AN HONEST TREE

test('a rule names no kind the vocabulary does not declare', () => {
  assert.deepEqual(audit(world()), []);
});

// ...AND IT CAN FIRE, which is the half that is easy to skip. An audit that
// reports nothing because it CANNOT report anything is the failure mode this
// project has caught in itself repeatedly, so every declaration this audit
// depends on is removed in turn and the audit is required to name exactly the
// kind that went missing.
test('removing a declaration makes the audit name exactly that kind', () => {
  const drop = (kind: string) => {
    const r = new Rofl();
    const packs = PACKS.map(read).map((t) => t.split('\n')
      .filter((l) => l.trim() !== `node_kind(js, ${kind}).`).join('\n'));
    const res = r.load([...packs, read(VOC)].join('\n'));
    assert.ok(res.ok, res.diagnostics.slice(0, 4).join('\n'));
    return audit(r);
  };
  assert.deepEqual(drop('class_expression'), ['class_expression']);
  assert.deepEqual(drop('for_of_statement'), ['for_of_statement']);
  assert.deepEqual(drop('object_pattern'),   ['object_pattern']);
});

// `class_expression` in that list is not an example chosen for variety. It is
// the kind the ledger named on 2026-09-08 as the one silent hole — read by
// `obj_like[flow]` and `node_value_kind`, declared nowhere, so the model held
// an opinion the matrix had no cell for. It was declared in the same
// iteration; this test is what keeps the hole from re-opening quietly.

// ---------------------------------------------------------------------------
// 2. THE SLOTS ARE DISCOVERED, NOT DECLARED

test('the kind-carrying argument positions configure themselves', () => {
  const slots = asked(world(), 'kind_slot(Rel, I)')
    .map((x) => `${x.bindings.Rel}/${x.bindings.I}`).sort();
  // TWO, and the second is the point: a hand-written table of kind slots would
  // have had `ast_node` in it and would not have had `transfer_site`, which is
  // read with a constant kind in exactly three rules of the call-graph pack.
  assert.deepEqual(slots, ['ast_node/2', 'transfer_site/2']);
});

// ---------------------------------------------------------------------------
// 3. FIVE MUTANTS, FIVE ORACLES
//
// Each one names a different way the audit could be hollow, and each is
// distinguished by WHAT it reports rather than by whether it reports.

test('the walk over reified arguments is load-bearing', () => {
  assert.deepEqual(audit(world([POS_SITE])), ['s_positive_probe_kind'],
    'the positive fixture rule must be seen at all');
  assert.deepEqual(
    audit(world([POS_SITE], ['arg_at(L, J, T)     :- arg_at(L, I, $cons(_, T)), J is I + 1.', ''])),
    [], 'without the recursion the audit sees no argument past the first');
});

test('the negated-premise arm is load-bearing', () => {
  assert.deepEqual(audit(world([NEG_SITE])), ['s_negated_probe_kind']);
  assert.deepEqual(
    audit(world([NEG_SITE], ['body_lit(L)         :- premise_lit(_, _, $not(L)).', ''])),
    [], 'an opinion held in a negated premise is still an opinion');
});

test('a variable is not a kind', () => {
  const leaked = audit(world([POS_SITE], [
    'slot_atom(Rel, I, A)      :- slot_term(Rel, I, A), not slot_var(Rel, I, A).',
    'slot_atom(Rel, I, A)      :- slot_term(Rel, I, A).']));
  // The signature of this mutant is REIFIED VARIABLES arriving as kind names.
  assert.ok(leaked.some((k) => k.startsWith('$var(')), `expected $var terms, got ${JSON.stringify(leaked)}`);
});

test('restricting to kind positions is load-bearing', () => {
  const leaked = audit(world([POS_SITE], [
    'kind_named_by_rule(K) :- slot_atom(Rel, I, K), kind_slot(Rel, I).',
    'kind_named_by_rule(K) :- slot_atom(_, _, K).']));
  // A different signature again: every string constant in every rule — the
  // separators `"."` and `"#"`, the name `"Symbol"` — arrives as a kind.
  assert.ok(leaked.some((k) => k.startsWith('"')), `expected string constants, got ${JSON.stringify(leaked)}`);
});

test('the not_a_construct exclusion is load-bearing', () => {
  assert.deepEqual(audit(world([POS_SITE], ['not not_a_construct(K),', ''])),
    ['program', 's_positive_probe_kind']);
});

// ---------------------------------------------------------------------------
// 4. THE HALF THAT CANNOT LIVE IN THE LANGUAGE
//
// A rule names a kind in two grammatically different places, and the audit
// above sees only one of them. `ast_node[code](X, for_of_statement, _, _)` is a
// PREMISE, reified into the store, queryable. `node_value_kind(class_expression).`
// is a FACT — a one-column table of kinds, written in a rules file — and the
// reification says nothing about it, because it is not part of any rule.
//
// That is the shape that started this whole check: the ledger found
// `class_expression` through `node_value_kind`, which is the half the ROFL
// audit above cannot see.
//
// Datalog cannot quantify over relations, so this half is a HOST census, and
// the invariant it checks is stronger than a list: a table that holds kinds
// holds ONLY kinds. Measured 2026-09-08 across all 357 relation names in this
// world: twenty-three argument positions hold at least one declared kind, and
// every one of them is pure. The single exception is `node_kind/2` itself,
// whose second argument also holds the five Python kinds — it is the
// declaration, not a consumer of it.

// THE CENSUS RUNS ON A WORLD WITHOUT THE AUDIT IN IT, and the first draft did
// not — which cost one run and is worth keeping. rules/js-vocabulary.rofl
// derives `slot_atom`, `lit_arg` and `kind_named_by_rule`, every one of which
// holds EVERY constant in EVERY rule and therefore holds kinds alongside
// hundreds of field names. The census read them as impure kind tables. They are
// not tables of kinds; they are a census of constants, and a census that
// audits itself reports its own working. Excluding them by name would have
// worked and would have been a list to maintain; not loading them is the same
// answer with nothing to maintain.
const packsOnly = (): Rofl => {
  const r = new Rofl();
  const res = r.load(PACKS.map(read).join('\n'));
  assert.ok(res.ok, res.diagnostics.slice(0, 4).join('\n'));
  return r;
};

// `node_kind/2` is the DECLARATION rather than a consumer of it, and its second
// argument also carries the five Python kinds this vocabulary declares
// alongside the 212 js ones.
const KIND_TABLE_EXEMPT = new Set(['node_kind']);

/** Every (relation, arity, argument) that holds at least one declared js kind,
 *  with the values in it that are NOT declared js kinds. */
function kindPositionCensus(r: Rofl): Map<string, string[]> {
  // THE ONE PLACE `unpopulatable` IS NOT A DEFECT. The sweep below asks every
  // relation at arities 1..3, so most of those queries are deliberately wrong
  // and their refusal is the answer. The two queries whose emptiness would be a
  // CLAIM — the kind list and the relation names — are guarded.
  const kinds = new Set(asked(r, 'node_kind(js, K)').map((x) => String(x.bindings.K)));
  const names = new Set<string>();
  // THE UNION IS GUARDED, NOT EACH SOURCE, and the difference is a measured
  // fact rather than a convenience: `rule_relation` is derived by the KERNEL'S
  // OWN program (policy.rofl, in a store of its own) and is `unpopulatable` in
  // an ordinary world. Requiring each source to answer failed here and said so.
  // What must not be empty is the set the sweep walks.
  for (const q of ['rule_relation(N)', 'edb(N)', 'concludes(_, N)'])
    for (const row of r.query(q, BUDGET).rows) names.add(String(row.bindings.N));
  assert.ok(names.size > 100, `the sweep found only ${names.size} relation names`);
  const out = new Map<string, string[]>();
  for (const n of [...names].sort()) {
    if (KIND_TABLE_EXEMPT.has(n)) continue;
    for (let ar = 1; ar <= 3; ar++) {
      const vs = ['A', 'B', 'C'].slice(0, ar);
      let rows;
      try { rows = r.query(`${n}(${vs.join(', ')})`, BUDGET).rows; } catch { continue; }
      if (!rows.length) continue;
      for (let i = 0; i < ar; i++) {
        const vals = new Set(rows.map((x) => String(x.bindings[vs[i]])));
        const declared = [...vals].filter((v) => kinds.has(v));
        if (!declared.length) continue;
        out.set(`${n}/${ar} arg${i + 1}`, [...vals].filter((v) => !kinds.has(v)).sort());
      }
    }
  }
  return out;
}

test('a table that holds kinds holds only kinds', () => {
  const census = kindPositionCensus(packsOnly());
  if (process.env.CENSUS) console.log(JSON.stringify([...census.keys()].sort(), null, 1));
  const impure = [...census].filter(([, other]) => other.length)
    .map(([k, other]) => `${k}: ${JSON.stringify(other)}`).sort();
  assert.deepEqual(impure, []);
  // ...AND THE SWEEP FOUND SOMETHING, which is the control on the control: a
  // census that matched no relation at all would also report no impure one.
  // Named rather than counted, because a count is a number every parallel
  // branch moves and a set is a claim about what exists.
  assert.deepEqual([...census.keys()].sort(), [
    'abrupt_kind/1 arg1',
    // AND ONE FROM THE SCOPE CLOSURE, 2026-09-09 (w_scope_shadowing), merged
    // the same night as the three below: `block_scope_kind` is the table that
    // says which kinds open a lexical region, and it is the premise block
    // regions are built on. Two branches grew this set and neither could see
    // the other — a union, which is why this pin is a set and not a count.
    'block_scope_kind/1 arg1', 'call_kind/1 arg1', 'call_like_v/1 arg1',
    'callee_shape/2 arg1', 'class_field_kind/1 arg1',
    // THREE FROM THE COMPLETION CLOSURE, 2026-09-09 (w_cf_completion), and the
    // third is the interesting one: `completion_known` is DERIVED — the union of
    // the kinds the closure decides, the kinds it defers, and the four abrupt
    // kinds it is seeded from — so this census reaches a kind table that no
    // `edb` line declares, which is exactly what its `concludes(_, N)` source is
    // for.
    'completion_deferred/2 arg1', 'completion_kind/1 arg1', 'completion_known/1 arg1',
    'export_kind/1 arg1', 'fn_kind/1 arg1',
    'fn_kind_v/1 arg1', 'guard_kind/2 arg1', 'kind_absent_ok/2 arg1',
    'kind_prototype/2 arg1', 'literal_kind/1 arg1', 'member_kind/1 arg1',
    'member_kind_v/1 arg1', 'node_value_kind/1 arg1', 'obj_kind_class/2 arg1',
    'obj_kind_known/1 arg1', 'private_member_kind/1 arg1',
    'shape_of/3 arg2', 'short_circuit_kind/1 arg1',
    'static_key_kind/1 arg1', 'this_binds_kind/1 arg1', 'transfer_kind/1 arg1',
    'transfer_mechanism/2 arg1', 'value_transparent/1 arg1',
  ]);
});

test('the census names an undeclared kind smuggled into a kind table', () => {
  const r = new Rofl();
  const res = r.load([...PACKS.map(read), 'node_value_kind(s_smuggled_kind).'].join('\n'));
  assert.ok(res.ok, res.diagnostics.slice(0, 4).join('\n'));
  const census = kindPositionCensus(r);
  assert.deepEqual(census.get('node_value_kind/1 arg1'), ['s_smuggled_kind']);
});
