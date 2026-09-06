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
import { POLICY_SRC, SAFETY_SRC } from '../src/reflect.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE = fs.readFileSync(path.join(ROOT, 'policy.rofl'), 'utf8');
const SAFETY = fs.readFileSync(path.join(ROOT, 'safety.rofl'), 'utf8');

test('THE GATE THIS FILE CLAIMED TO BE, and was not', () => {
  // Two comments — one in src/reflect.ts, one at the top of this file — said
  // the copy in the kernel was kept honest by "the gate that keeps them
  // identical, which test/kernel-policy-program.test.ts is". Measured
  // 2026-09-06: no test in this repository read POLICY_SRC at all. The two were
  // in fact identical, so nothing was broken; what was missing was the reason
  // to believe it. This is that reason.
  assert.equal(POLICY_SRC, FILE, 'policy.rofl and src/reflect.ts have drifted');
  assert.equal(SAFETY_SRC, SAFETY, 'safety.rofl and src/reflect.ts have drifted');
  // PLANTED DEFECT: the comparison must be able to fail. A one-character edit
  // — the kind a hand-merge makes — has to be visible to it.
  assert.notEqual(POLICY_SRC, FILE.replace('rule_reads', 'rule_read'));
  assert.notEqual(SAFETY_SRC, SAFETY.replace('slot_arity', 'slot_arty'));
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
