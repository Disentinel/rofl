// rule-answers.test.ts — the four answers that USED to be folds in
// src/engine.ts, measured against the folds themselves.
//
// `safety.rofl` decides range restriction; `test/rofl-safety.test.ts` measures
// that. This file is about what the kernel computes FROM that verdict and now
// asks for in the same breath:
//
//   demand_rel        which relations unfold at call sites
//   trigger_of        what a positive premise can wake
//   late_rule         the monotone rules held back until the program is judged
//   neg_relation      the relations some rule negates
//   provenance_reader whether any rule reads the provenance table
//
// THE ORACLE IS THE DELETED CODE. `hostAnswer` below is the four blocks of
// src/engine.ts as they stood before this move, copied verbatim and kept here
// for no other purpose. That makes the comparison a real one for exactly as
// long as this file is not edited to agree with the kernel — which is why it
// carries its own mutant set and its own coverage measurement rather than
// trusting a corpus that turns out to hold only seven demand-backed relations
// in seventy files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

interface HostAnswer {
  demand: Set<string>; trig: Map<string, string[]>;
  neg: Set<string>; prov: boolean; late: Set<string>;
}

/** THE CODE THIS REPLACED, kept as an oracle and nothing else. Four blocks of
 *  src/engine.ts as they stood on 2026-09-06: the `for(;;)` over a growing
 *  unfoldable set, the memoised `closeRel` with its `seen` guard, the stratum
 *  cone's own `for(;;)`, and the two nested loops over every body. */
function hostAnswer(ev: Evaluation): HostAnswer {
  const kept = ev.rules;
  const nowRulesByRel = new Map<string, typeof kept>();
  for (const r of kept) {
    if (r.clause.head.temporal === 'next') continue;
    let a = nowRulesByRel.get(r.clause.head.rel);
    if (!a) { a = []; nowRulesByRel.set(r.clause.head.rel, a); }
    a.push(r);
  }
  const unfoldable = new Set<string>();
  for (const [rel, rs] of nowRulesByRel) if (rs.some((r) => !r.safe)) unfoldable.add(rel);
  for (;;) {
    let grew = false;
    for (const [rel, rs] of nowRulesByRel) {
      if (unfoldable.has(rel)) continue;
      for (const r of rs) {
        if (r.posRels.some((x) => unfoldable.has(x))) { unfoldable.add(rel); grew = true; break; }
      }
    }
    if (!grew) break;
  }
  const demandRels = new Map<string, typeof kept>();
  for (const rel of [...unfoldable].sort()) demandRels.set(rel, nowRulesByRel.get(rel)!);
  const closure = new Map<string, Set<string>>();
  const closeRel = (rel: string, seen: Set<string>): Set<string> => {
    const c = closure.get(rel);
    if (c) return c;
    const out = new Set<string>([rel]);
    if (!seen.has(rel)) {
      seen.add(rel);
      for (const dr of demandRels.get(rel) ?? []) {
        for (const b of dr.clause.body) {
          if (b.t === 'pos') for (const x of closeRel(b.lit.rel, seen)) out.add(x);
        }
      }
    }
    closure.set(rel, out);
    return out;
  };
  const trig = new Map<string, string[]>();
  for (const r of kept) {
    const t = new Set<string>();
    for (const p of r.posRels) for (const x of closeRel(p, new Set())) t.add(x);
    trig.set(r.id, [...t].sort());
  }
  const neg = new Set<string>();
  for (const r of kept) for (const b of r.clause.body) if (b.t === 'neg') neg.add(b.lit.rel);
  let prov = false;
  for (const r of kept) {
    for (const b of r.clause.body) if (b.t !== 'bi' && b.lit.rel === 'derived_by') prov = true;
  }
  const mono = kept.filter((r) => r.safe && !r.hasNeg);
  const rels = new Set<string>(['stratum']);
  for (;;) {
    let grew = false;
    for (const r of mono) {
      if (rels.has(r.clause.head.rel)) continue;
      if (r.posRels.some((x) => rels.has(x))) { rels.add(r.clause.head.rel); grew = true; }
    }
    if (!grew) break;
  }
  const late = new Set(mono.filter((r) => rels.has(r.clause.head.rel)).map((r) => r.id));
  return { demand: new Set(demandRels.keys()), trig, neg, prov, late };
}

/** What the kernel answers, reached through the public surface where there is
 *  one and through the private field where there is not. */
function kernelAnswer(ev: Evaluation): HostAnswer {
  const priv = ev as unknown as {
    answer: { negRels: Set<string> };
    stratumCone(mono: Evaluation['rules']): Set<string>;
  };
  return {
    demand: new Set(ev.demandRels.keys()),
    trig: new Map(ev.rules.map((r) => [r.id, [...r.triggerRels].sort()])),
    neg: priv.answer.negRels,
    prov: ev.readsProvenance(),
    late: priv.stratumCone(ev.rules.filter((r) => r.safe && !r.hasNeg)),
  };
}

const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

function differences(ev: Evaluation): string[] {
  const h = hostAnswer(ev); const k = kernelAnswer(ev);
  const out: string[] = [];
  if (!same(h.demand, k.demand)) out.push(`demand: host [${[...h.demand]}] rules [${[...k.demand]}]`);
  if (!same(h.neg, k.neg)) out.push(`neg: ${h.neg.size} vs ${k.neg.size}`);
  if (h.prov !== k.prov) out.push(`provenance: ${h.prov} vs ${k.prov}`);
  if (!same(h.late, k.late)) out.push(`late: ${h.late.size} vs ${k.late.size}`);
  let td = 0;
  for (const [id, hs] of h.trig) if (hs.join(',') !== (k.trig.get(id) ?? []).join(',')) td++;
  if (td > 0) out.push(`trigger: ${td} rules differ`);
  return out;
}

test('the corpus: every .rofl file, five answers, rule for rule', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (f.endsWith('.rofl')) files.push(full);
    }
  };
  for (const d of ['examples', 'rules', 'facts']) walk(path.join(ROOT, d));

  let agree = 0; let refused = 0; let rules = 0; let demandSeen = 0;
  const bad: string[] = [];
  for (const f of files) {
    const r = new Rofl();
    r.load(BOOT);
    if (!r.load(fs.readFileSync(f, 'utf8')).ok) { refused++; continue; }
    const ev = new Evaluation(r.store);
    rules += ev.rules.length;
    demandSeen += ev.demandRels.size;
    const d = differences(ev);
    if (d.length === 0) agree++; else bad.push(`${path.relative(ROOT, f)}: ${d.join(' | ')}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(agree > 55, `only ${agree} files compared`);
  assert.ok(rules > 3000, `only ${rules} rules seen`);
  // CONTROL, and the reason the mutants below exist: the whole corpus carries
  // eight demand-backed relations. Agreement on it is mostly agreement about
  // emptiness, which is why it is not the only measurement here.
  // SEVEN -> EIGHT on 2026-09-07 with the kernel merge, and the eighth is named
  // rather than counted: `earlier_takeable` in rules/worklist.rofl, the queue's
  // own ordering relation, which this corpus had never seen because the plan
  // pack lived on the other branch. The other seven are `close`, `corroborated`
  // and `temp` in examples/sensors.rofl and `move`/`step` in the two tm files.
  assert.equal(demandSeen, 8);
  assert.ok(refused <= 2, `${refused} files would not load`);
});

const MUTANTS: [string, string, string[]][] = [
  ['a demand-backed relation and its reader',
    'e(1).\nd(X, Y) :- e(X), Y > 0.\nu(X) :- d(X, _), e(X).\n', ['d', 'u']],
  ['a CYCLE through two demand-backed relations',
    'e(1).\na(X, Y) :- e(X), b(X), Y > 0.\nb(X) :- a(X, _).\nc(X) :- b(X).\n', ['a', 'b', 'c']],
  ['a @next head never unfolds',
    'e(1).\nn(X, Y) @next :- e(X), Y > 0.\nm(X) :- n(X, _).\n', []],
  ['a rule reading provenance',
    'e(1).\nw(x) :- derived_by(_, _, _).\n', []],
  ['negation over a demand-backed relation',
    'e(1).\nd(X, Y) :- e(X), Y > 0.\nz(X) :- e(X), not d(X, 1).\n', ['d']],
  ['a stratified program with no demand at all',
    'e(1).\nf(X) :- e(X).\ng(X) :- f(X), not e(X).\n', []],
];

function build(prog: string): Evaluation {
  const r = new Rofl();
  r.load(BOOT);
  const res = r.load(prog);
  assert.ok(res.ok, `the door refused the mutant: ${JSON.stringify(res.diagnostics)}`);
  return new Evaluation(r.store);
}

test('MUTANTS: the corpus is thin on demand, so the demand is planted', () => {
  for (const [name, prog, demand] of MUTANTS) {
    const ev = build(prog);
    assert.deepEqual(differences(ev), [], name);
    assert.deepEqual([...ev.demandRels.keys()].sort(), demand, `${name}: the demand set`);
  }
  // THE CYCLE IS THE ONE THAT WAS SUPPOSED TO DIFFER, and it does not. The
  // host's `closeRel` carries a `seen` set that stops at a cycle instead of
  // closing over it, and a memo keyed by relation that caches whatever the
  // first `seen` produced — so the two constructions are not the same
  // algorithm, and on `a -> b -> a` they still give the same answer. Measured
  // rather than reasoned: the closure is reached from every entry point in
  // turn, and every entry point puts the whole cycle in.
  const cyc = build(MUTANTS[1][1]);
  const trig = cyc.rules.find((r) => r.clause.head.rel === 'c')!.triggerRels;
  assert.deepEqual([...trig].sort(), ['a', 'b', 'e']);
});

test('where blocked_head is reachable, and where it is not', () => {
  // `executable(R) :- analysed(R), not blocked_head(R).` is the rules' copy of
  // the kernel refusing a rule whose head is a kernel relation. It cannot be
  // exercised through a load: the DOOR refuses first, with its own message, so
  // the clause guards only a store that arrived some other way. Saying so is
  // the point — a clause nothing can reach is a clause nobody should trust.
  const r = new Rofl();
  r.load(BOOT);
  const res = r.load('e(1).\nmode(a, b) :- e(_).\n');
  assert.equal(res.ok, false);
  assert.match(res.diagnostics.join(' '), /kernel relation \(write-protected\)/);
});
