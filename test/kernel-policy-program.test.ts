// The kernel ships its own program, and this is the gate that keeps the copy
// honest.
//
// The owner chose 2026-09-05 that policy moved out of the host travels WITH the
// kernel rather than with the program that loads it: a rule that is not loaded
// is not a conservative answer, it is a wrong one, and 22 of the 95 worlds in
// this repository never load boot.rofl.
//
// src/ carries no `fs` — only src/repl.ts does — so the kernel cannot read
// policy.rofl off disk and the source has to live in src/reflect.ts as text.
// That makes policy.rofl the SOURCE and the constant a COPY, which is only
// honest with a gate. examples/ring1/l1.dense.rofl is the same arrangement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { parseProgram } from '../src/parser.ts';
import { resolveClauseBooks, encodeRule, RESERVED, KERNEL_PERSP, MAIN } from '../src/reflect.ts';
import { POLICY_DENSE, SAFETY_DENSE } from '../src/kernel-dense.ts';
import { denseClauses } from '../src/dense.ts';
import { renderDense } from '../scripts/build_kernel_dense.ts';
import { canonClause } from '../src/reflect.ts';
import { Store } from '../src/store.ts';
import { peelRounds } from '../src/rounds.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE = fs.readFileSync(path.join(ROOT, 'policy.rofl'), 'utf8');
const SAFETY = fs.readFileSync(path.join(ROOT, 'safety.rofl'), 'utf8');

test('THE GATE THIS FILE CLAIMED TO BE, and was not', () => {
  // Two comments — one in src/reflect.ts, one at the top of this file — said
  // the copy in the kernel was kept honest by "the gate that keeps them
  // identical, which test/kernel-policy-program.test.ts is". Measured
  // 2026-09-06: no test in this repository read the constant at all. The two
  // were in fact identical, so nothing was broken; what was missing was the
  // reason to believe it. This is that reason.
  //
  // WHAT IT COMPARES CHANGED THE SAME DAY, and the gate got stronger for it.
  // The kernel used to carry these programs as SOURCE TEXT and parse them; it
  // carries them COMPILED now, in the dense form, so the check is no longer
  // "the two texts are equal" but "compiling the source gives the shipped
  // program". That covers the compiler as well as the copy.
  assert.equal(POLICY_DENSE, renderDense('policy.rofl'),
    'policy.rofl and src/kernel-dense.ts have drifted — run npm run build:dense');
  assert.equal(SAFETY_DENSE, renderDense('safety.rofl'),
    'safety.rofl and src/kernel-dense.ts have drifted — run npm run build:dense');
  // PLANTED DEFECT: the comparison must be able to fail. A one-character edit
  // — the kind a hand-merge makes — has to be visible to it.
  assert.notEqual(POLICY_DENSE, POLICY_DENSE.replace('rule_reads', 'rule_read'));
  assert.notEqual(SAFETY_DENSE, SAFETY_DENSE.replace('slot_arity', 'slot_arty'));
});

test('the compiled program IS the source program, clause for clause', () => {
  // The gate above compares TEXT, which catches a stale build and would also
  // pass if the writer and the reader were wrong in the same way. This reads
  // both back as CLAUSES and compares them canonically, which is the property
  // that actually matters: what the kernel runs is what policy.rofl says.
  //
  // It found a defect on the day it was written. `denseClauses` used a plain
  // fact's arguments RAW instead of decoding them, so `eq_or_is("=")` came
  // back as the functor `s("=")` — and seven corpus programs then computed a
  // different `trigger_of`. examples/ring1/l0.ts had carried that bug since it
  // was written; a grammar's facts are atoms and integers, so the tower never
  // reached the case.
  for (const [file, shipped] of [['policy.rofl', POLICY_DENSE], ['safety.rofl', SAFETY_DENSE]] as const) {
    const source = parseProgram(fs.readFileSync(path.join(ROOT, file), 'utf8')).map(canonClause);
    const compiled = denseClauses(shipped).map(canonClause);
    assert.deepEqual(compiled, source, `${file}: the compiled program is not the source program`);
    assert.ok(source.length > 8, `${file}: ${source.length} clauses — a vacuous comparison`);
  }
});

test('SELF-APPLICATION: safety.rofl judges both kernel programs, its own rules included', () => {
  // THE BOTTOM RUNG OF THE TOWER. `Evaluation` asks safety.rofl whether a
  // program's rules are range-restricted, and a store holding one of the
  // kernel's OWN programs is evaluated with `bootstrap: true` — it does not
  // ask, because asking means constructing an Evaluation. What that rung
  // stands on is an assumption: every rule the kernel ships is safe. Here the
  // assumption is CHECKED, by the very program it lets run.
  const r = new Rofl();
  assert.ok(r.load(FILE).ok);
  assert.ok(r.load(SAFETY).ok);
  const ev = new Evaluation(r.store);
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), [],
    'a rule the kernel ships is not range-restricted, and the bootstrap assumes it is');
  // CONTROL: it looked, and it can say no. Without this an empty answer would
  // be a fact about the probe.
  assert.ok(ev.rules.length > 20, `${ev.rules.length} rules judged`);
  const r2 = new Rofl();
  assert.ok(r2.load(FILE).ok);
  assert.ok(r2.load(SAFETY).ok);
  assert.ok(r2.load('planted(A, Z) :- rule_relation(A).\n').ok);
  assert.deepEqual(new Evaluation(r2.store).rules.filter((x) => !x.safe).map((x) => x.canon),
    ['planted[main](?A,?Z)@now :- rule_relation[main](?A)@now']);
});

test('safety.rofl declares its own schedule, and the peel agrees with it', () => {
  // THE STORE THE KERNEL ANSWERS IN HOLDS NO STRATUM TABLE, so the evaluator
  // would run every negation in one final pass — the failure examples/wtf
  // exists to demonstrate. Measured 2026-09-06 against the round evaluator,
  // which peels its schedule off the rules rather than reading a table: the
  // two disagreed on 3 of 65 corpus programs, on `mono_rule`. The program
  // declares its own strata now, which is the documented arrangement
  // (`stratum` is read by the kernel and written by the program), and THIS is
  // the gate that keeps the declaration from going stale behind a new clause.
  const pol = new Store();
  const declared = new Map<string, number>();
  for (const c0 of parseProgram(SAFETY)) {
    const c = resolveClauseBooks(c0);
    if (c.body.length === 0) {
      if (c.head.rel === 'stratum' && c.head.args[0].k === 'a' && c.head.args[1].k === 'i') {
        declared.set(c.head.args[0].name, c.head.args[1].v);
      }
      pol.add(c.head.rel, RESERVED.has(c.head.rel) ? KERNEL_PERSP : MAIN, c.head.args,
        { scope: 'timeless', base: true });
    } else {
      for (const f of encodeRule(c).facts) {
        pol.add(f.rel, KERNEL_PERSP, f.args, { scope: 'timeless', base: true });
      }
    }
  }
  const ev = new Evaluation(pol, { reuse: false, budget: 20_000_000, bootstrap: true });
  const peel = peelRounds(ev.rules);
  const heads = new Set(ev.rules.map((r) => r.clause.head.rel));
  const peeled = new Map<string, number>();
  for (const [rel, n] of peel.round) if (heads.has(rel)) peeled.set(rel, n);
  assert.equal(peel.stalled, false, 'the kernel\'s own program must not stall');
  assert.deepEqual([...declared.entries()].sort(), [...peeled.entries()].sort(),
    'the declared schedule and the peel have drifted apart');
  // CONTROLS: it is not one flat layer, and it covers every relation the
  // program concludes.
  assert.ok(peel.rounds >= 3, `${peel.rounds} rounds — a flat peel proves nothing`);
  assert.equal(declared.size, heads.size);
});

test('policy.rofl is a program, and it is the one the acceptance measured', () => {
  // NOT YET CARRIED BY THE KERNEL, and the price of carrying it is measured
  // rather than guessed. Installing these two rules in `bootstrapKernel` works
  // — the program runs in a bare store and answers about a program the kernel
  // never saw loaded — and it turned 18 tests red against a baseline of 8.
  // Four of those are ROW AND TERM COUNTS: every gate in this repository that
  // counts inherits the kernel's own rules as a new baseline, permanently. Two
  // more are the kernel's own vocabulary discipline — the grep test reads the
  // embedded program's relation names as kernel source, which they are not.
  // That cost was not knowable before it was tried, and it is the owner's to
  // weigh against what carrying policy buys.
  assert.ok(FILE.length > 500, `policy.rofl is ${FILE.length} bytes`);
  // Seven clauses today: two for `rule_reads`, two for `rule_relation`, two
  // for `cone` and two for `opaque_closed` minus the `edb` declaration that is
  // a fact rather than a rule. The number is here so that adding one is a
  // deliberate act rather than a diff nobody reads.
  const cs = parseProgram(FILE);
  assert.equal(cs.length, 9, 'the program, clause by clause');
  assert.deepEqual([...new Set(cs.map((c) => c.head.rel))].sort(),
    ['cone', 'edb', 'opaque_closed', 'rule_reads', 'rule_relation']);
});

test('it RUNS, and answers about the program it is loaded beside', () => {
  // NOT YET INSTALLED BY `bootstrapKernel`, and the price of installing it is
  // measured rather than guessed: doing so turned 18 tests red against a
  // baseline of 8, and four of those are ROW AND TERM COUNTS — every gate in
  // this repository that counts inherits the kernel's own rules as a new
  // baseline. That is the cost of carrying policy with the kernel, and it was
  // not knowable before it was tried. So the program is loaded here like any
  // other, and installing it is the next decision.
  const r = new Rofl();
  r.load(FILE);
  r.load('p(1).\nq(X) :- p(X).\nz(X) :- q(X), not p(X).\n');
  r.evaluate();
  const rows = new Set(r.query('rule_reads(A, B)').rows.map((x) => `${x.bindings.A} <- ${x.bindings.B}`));
  assert.ok(rows.has('q <- p'), `q reads p; got ${[...rows].join(', ')}`);
  assert.ok(rows.has('z <- q'), 'z reads q positively');
  assert.ok(rows.has('z <- p'), 'and p negatively — the tense filter dep has is deliberately absent');
  // IT DESCRIBES ITSELF TOO, which is what a program carried as data means.
  assert.ok(rows.has('rule_reads <- concludes'));
});

test('it agrees with the host walk it was measured against, set for set', () => {
  // The acceptance that let the move be planned at all. Kept as a gate because
  // `planReuse` still walks the rules: the two must not drift while the walk
  // waits for the two-stage bootstrap that will let it be deleted.
  for (const files of [['boot.rofl'], ['boot.rofl', 'rules/strata.rofl'],
                       ['boot.rofl', 'examples/ring1/charclass.rofl', 'examples/ring1/ring1.rofl']]) {
    const r = new Rofl();
    r.load(FILE);
    for (const f of files) {
      const res = r.load(fs.readFileSync(path.join(ROOT, f), 'utf8'), { budget: 200_000_000 });
      assert.ok(res.ok, `${f}: ${res.diagnostics.slice(0, 2).join('; ')}`);
    }
    r.evaluate(200_000_000);
    const host = new Set<string>();
    for (const rule of (r as unknown as { store: { allFacts: () => unknown[] } }, parseProgram(
      files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')))) {
      for (const b of rule.body) if (b.t !== 'bi') host.add(`${rule.head.rel}\t${b.lit.rel}`);
    }
    const mine = new Set(r.query('rule_reads(A, B)', { budget: 200_000_000 }).rows
      .map((x) => `${x.bindings.A}\t${x.bindings.B}`));
    // the kernel's own two rules are in `mine` and not in `host`, which reads
    // only the files — so `host` must be a SUBSET, and a large one.
    assert.ok(host.size > 30, `positive control: the host set is ${host.size}`);
    for (const k of host) {
      assert.ok(mine.has(k), `${files.join('+')}: the rules missed ${k.replace('\t', ' <- ')}`);
    }
  }
});
