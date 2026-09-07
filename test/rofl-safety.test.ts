// rofl-safety.test.ts — RANGE RESTRICTION, asked of the rules instead of the
// host, and measured against the host's own answer.
//
// `safety.rofl` computes what `Evaluation.classify` computes: which rules the
// kernel marks unsafe. The oracle is exact and free — `Evaluation.rules[].safe`
// is the same property in TypeScript — so the interesting question is not
// whether the two agree once but WHAT THE AGREEMENT CANNOT SEE. Three
// measurements, in the order the repository's own rule asks for them:
//
//   1. the whole corpus: every .rofl file it holds, rule for rule;
//   2. a MUTANT SET, one per branch of the host's fold, so a corpus that
//      happens to contain no unsafe rule cannot make the agreement vacuous;
//   3. COVERAGE OF THE MUTANT SET, measured by deleting each clause of
//      safety.rofl in turn and asking whether any mutant notices.
//
// (3) is the one that pays. It found a dead clause (`slot(R, K, pos)`, a
// groundness question nothing asks of a positive premise) and three redundant
// mutants, each of which was flagged by a DIFFERENT clause than the one it was
// written for — `= with both sides unbound` was caught by the head-variable
// clause because the unbound variable was also in the head.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { Store } from '../src/store.ts';
import { parseProgram } from '../src/parser.ts';
import {
  encodeRule, resolveClauseBooks, decodeRules, KERNEL_PERSP, MAIN, RESERVED, V,
} from '../src/reflect.ts';
import { varsOf } from '../src/unify.ts';
import type { Term } from '../src/unify.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
const SAFETY = fs.readFileSync(path.join(ROOT, 'safety.rofl'), 'utf8');

const mka = (name: string): Term => ({ k: 'a', name });
const mki = (v: number): Term => ({ k: 'i', v });
const mks = (v: string): Term => ({ k: 's', v });

interface Row { rel: string; args: Term[]; fact: boolean; }

/** A program as store rows: a fact stays a fact, a rule becomes reflection. */
function rowsOf(src: string): Row[] {
  const out: Row[] = [];
  for (const c0 of parseProgram(src)) {
    const c = resolveClauseBooks(c0);
    if (c.body.length === 0) out.push({ rel: c.head.rel, args: c.head.args, fact: true });
    else for (const f of encodeRule(c).facts) out.push({ rel: f.rel, args: f.args, fact: false });
  }
  return out;
}

/** THE HOST'S WHOLE SHARE: walk each term for its variables, in order, and
 *  say how many a slot has. It decides nothing — which variable stands where
 *  is a fact about the rule, and the judgement is the program's. */
function seed(pol: Store, store: Store): void {
  const { rules } = decodeRules(store);
  for (const r of rules) {
    const put = (k: number, slot: string, ts: Term[]) => {
      const vs = new Set<string>();
      for (const t of ts) varsOf(t, vs);
      let i = 0;
      for (const v of vs) {
        pol.add('premise_var', MAIN, [mka(r.id), mki(k), mka(slot), mki(++i), mks(v)],
          { scope: 'timeless', base: true });
      }
      pol.add('slot_arity', MAIN, [mka(r.id), mki(k), mka(slot), mki(i)],
        { scope: 'timeless', base: true });
    };
    put(0, 'head', [...r.clause.head.args, r.clause.head.persp]);
    r.clause.body.forEach((b, i) => {
      const k = i + 1;
      if (b.t === 'pos') put(k, 'pos', [...b.lit.args, b.lit.persp]);
      else if (b.t === 'bi') { put(k, 'left', [b.l]); put(k, 'right', [b.r]); }
    });
  }
}

/** The relations the kernel reads back out of this program. The coverage
 *  sweep below compares ALL of them, not just the verdict: a clause that only
 *  the demand set can see is invisible to a comparison of `unsafe_rule`. */
const ANSWERED = ['unsafe_rule', 'demand_rel', 'late_rule', 'trigger_of',
  'neg_relation', 'provenance_reader'];

/** Ask safety.rofl, in a store of its own, over a copy of the reflection. */
function ask(store: Store, prog: Row[]): Set<string> {
  const pol = new Store();
  for (const f of prog) {
    pol.add(f.rel, f.fact && !RESERVED.has(f.rel) ? MAIN : KERNEL_PERSP, f.args,
      { scope: 'timeless', base: true });
  }
  for (const rel of [V.premise_lit, V.conclusion_lit, V.has_premise,
    V.concludes, V.conclusion_tense, V.premise_pos, V.premise_neg, V.reserved]) {
    for (const f of store.relAll(rel)) {
      pol.add(rel, f.persp, f.args, { scope: 'timeless', base: true });
    }
  }
  seed(pol, store);
  new Evaluation(pol, { reuse: false, budget: 20_000_000, bootstrap: true }).run();
  const out = new Set<string>();
  for (const f of pol.relAll('unsafe_rule')) if (f.args[0].k === 'a') out.add(f.args[0].name);
  return out;
}

/** Everything the program answers, as one comparable string. */
function answerSig(store: Store, prog: Row[]): string {
  const pol = new Store();
  for (const f of prog) {
    pol.add(f.rel, f.fact && !RESERVED.has(f.rel) ? MAIN : KERNEL_PERSP, f.args,
      { scope: 'timeless', base: true });
  }
  for (const rel of [V.premise_lit, V.conclusion_lit, V.has_premise,
    V.concludes, V.conclusion_tense, V.premise_pos, V.premise_neg, V.reserved]) {
    for (const f of store.relAll(rel)) {
      pol.add(rel, f.persp, f.args, { scope: 'timeless', base: true });
    }
  }
  seed(pol, store);
  new Evaluation(pol, { reuse: false, budget: 20_000_000, bootstrap: true }).run();
  return ANSWERED.map((rel) => `${rel}=${pol.relAll(rel).map((f) => f.key).sort().join(',')}`).join('\n');
}

const PROG = rowsOf(SAFETY);

function hostUnsafe(r: Rofl): Set<string> {
  const ev = new Evaluation(r.store);
  return new Set(ev.rules.filter((x) => !x.safe).map((x) => x.id));
}

test('the corpus: every .rofl file this repository holds, rule for rule', () => {
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

  let agree = 0; let refused = 0; let rules = 0; let unsafe = 0;
  const disagreed: string[] = [];
  for (const f of files) {
    const r = new Rofl();
    r.load(BOOT);
    if (!r.load(fs.readFileSync(f, 'utf8')).ok) { refused++; continue; }
    const host = hostUnsafe(r);
    const rofl = ask(r.store, PROG);
    rules += new Evaluation(r.store).rules.length;
    unsafe += host.size;
    const same = host.size === rofl.size && [...host].every((x) => rofl.has(x));
    if (same) agree++; else disagreed.push(path.relative(ROOT, f));
  }
  assert.deepEqual(disagreed, [], 'files where the two instruments disagree');
  // CONTROLS. The sweep must have looked at a lot of rules, and the host must
  // have called some of them unsafe — two empty sets agree about nothing.
  assert.ok(agree > 60, `only ${agree} files compared`);
  assert.ok(rules > 3000, `only ${rules} rules seen`);
  assert.ok(unsafe > 0, 'the corpus must contain an unsafe rule for this to mean anything');
  assert.ok(refused <= 2, `${refused} files would not load`);
});

// One per branch of the host's fold, plus the three that were added only
// because the coverage measurement below said the set could not see them.
const MUTANTS: [string, string, 'safe' | 'unsafe'][] = [
  ['head var never bound', 'm1(A, Z) :- edge(A, _).', 'unsafe'],
  ['head var bound', 'm2(A, B) :- edge(A, B).', 'safe'],
  ['head perspective var unbound', 'm3[P](A) :- edge(A, _).', 'unsafe'],
  ['head perspective bound by a premise perspective', 'm4[P](A) :- edge[P](A, _).', 'safe'],
  ['is with unbound rhs', 'm5(A, Y) :- Y is A + 1, edge(A, _).', 'unsafe'],
  ['is with ground rhs', 'm6(A, Y) :- edge(A, _), Y is A + 1.', 'safe'],
  ['chained is', 'm7(Z) :- edge(A, _), Y is A + 1, Z is Y.', 'safe'],
  ['= with both sides unbound', 'm8(A, B) :- edge(A, _), B = C.', 'unsafe'],
  ['= binds rightwards', 'm9(A, B) :- edge(A, _), B = A.', 'safe'],
  ['= binds leftwards', 'm10(A, B) :- edge(A, _), A = B.', 'safe'],
  ['< with an unbound side', 'm11(A) :- edge(A, _), A < B.', 'unsafe'],
  ['!= with an unbound side', 'm12(A) :- edge(A, _), A != B.', 'unsafe'],
  ['!= with both sides bound', 'm13(A, B) :- edge(A, B), A != B.', 'safe'],
  ['bound only under a negation', 'm14(Q) :- not tag(Q).', 'unsafe'],
  ['a wildcard in the head', 'm15(_) :- edge(_, _).', 'unsafe'],
  ['bound by a premise perspective', 'm16(P) :- edge[P](_, _).', 'safe'],
  ['= chained off a premise', 'm17(X) :- edge(Y, _), X = Y.', 'safe'],
  ['a negation after its binder', 'm18(X) :- edge(X, _), not tag(X).', 'safe'],
  ['< with the LEFT side unbound', 'm19(A) :- edge(A, _), B < A.', 'unsafe'],
  ['= both unbound, neither in the head', 'm20(A) :- edge(A, _), B = C.', 'unsafe'],
  ['a binding used two premises later', 'm21(Y) :- edge(A, _), tag(_), Y is A + 1.', 'safe'],
  ['is with unbound rhs, head unaffected', 'm22(A) :- edge(A, _), Y is Z + 1.', 'unsafe'],
];
const BASE = 'edge(x, y).\ntag(y).\n';

/** THE SECOND FAMILY. The clauses that read the verdict — the demand set, the
 *  stratum cone, the trigger closure — are invisible to a program with no
 *  unsafe rule in it, and every mutant above was written to have exactly one.
 *  These carry demand instead. */
const ANSWER_MUTANTS: [string, string][] = [
  ['a demand-backed relation and its reader',
    'd(A, Y) :- edge(A, _), Y > 0.\nu(A) :- d(A, _), edge(A, _).'],
  ['a cycle through two demand-backed relations',
    'a(A, Y) :- edge(A, _), b(A), Y > 0.\nb(A) :- a(A, _).\nc(A) :- b(A).'],
  ['a @next head, which never unfolds',
    'n(A, Y) @next :- edge(A, _), Y > 0.\nm(A) :- n(A, _).'],
  ['a rule reading provenance',
    'w(x) :- derived_by(_, _, _).'],
  ['a negation over a demand-backed relation',
    'd(A, Y) :- edge(A, _), Y > 0.\nz(A) :- edge(A, _), not d(A, 1).'],
  ['a monotone rule in the stratum cone',
    'stratum(r, 1).\nk(A) :- edge(A, _), stratum(A, _).'],
  // Added because the coverage sweep said nothing could see two clauses. A
  // NEGATED rule that would otherwise reach the stratum cone is the only thing
  // `has_neg_rule` changes; a rule that negates `derived_by` is the only thing
  // the second `provenance_reader` clause changes.
  ['a negated rule that would otherwise enter the stratum cone',
    'stratum(r, 1).\nk(A) :- edge(A, _), stratum(A, _), not tag(A).'],
  ['a rule that NEGATES provenance rather than reading it',
    'v(A) :- edge(A, _), not derived_by(A, r, 0).'],
];

function verdicts(rule: string, prog: Row[]) {
  const r = new Rofl();
  r.load(BOOT);
  const res = r.load(BASE + rule + '\n');
  assert.ok(res.ok, `the door refused the mutant: ${JSON.stringify(res.diagnostics)}`);
  const ev = new Evaluation(r.store);
  const host = new Set(ev.rules.filter((x) => !x.safe).map((x) => x.id));
  const rofl = ask(r.store, prog);
  const rel = rule.split(/[([]/)[0];
  const mine = ev.rules.filter((x) => x.canon.startsWith(rel + '['));
  assert.equal(mine.length, 1, `the mutant rule ${rel} must be found exactly once`);
  return {
    host: mine.some((x) => !x.safe) ? 'unsafe' : 'safe',
    rofl: mine.some((x) => rofl.has(x.id)) ? 'unsafe' : 'safe',
    same: host.size === rofl.size && [...host].every((x) => rofl.has(x)),
  };
}

test('MUTANTS: one per branch of the host fold, and the two instruments agree on each', () => {
  const wrong: string[] = [];
  for (const [name, rule, want] of MUTANTS) {
    const v = verdicts(rule, PROG);
    if (v.host !== want) wrong.push(`${name}: the HOST says ${v.host}, the mutant claims ${want}`);
    if (v.rofl !== want) wrong.push(`${name}: safety.rofl says ${v.rofl}, the host says ${v.host}`);
    if (!v.same) wrong.push(`${name}: the two sets differ beyond the mutant rule itself`);
  }
  assert.deepEqual(wrong, []);
  // CONTROL: the set says no as well as yes.
  assert.equal(MUTANTS.filter((m) => m[2] === 'unsafe').length, 11);
  assert.equal(MUTANTS.filter((m) => m[2] === 'safe').length, 11);
});

test('COVERAGE: deleting a clause of safety.rofl, and what the mutants still miss', () => {
  // Clause by clause, from the source, so a clause added later is measured too.
  const parts: string[] = [];
  let cur = '';
  for (const l of SAFETY.split('\n')) {
    if (!l.trim() || l.trim().startsWith('--')) continue;
    cur += (cur ? '\n' : '') + l;
    if (l.trimEnd().endsWith('.')) { parts.push(cur); cur = ''; }
  }
  assert.ok(parts.length > 15, `${parts.length} clauses parsed out of the program`);
  // THE SCHEDULE DECLARATION IS NOT ANALYSIS and this is the wrong instrument
  // for it: deleting one `stratum(...)` fact of twenty changes which phase one
  // relation settles in, which these mutants are far too small to notice. It
  // is covered exactly, by re-peeling the program and comparing —
  // test/kernel-policy-program.test.ts, 'safety.rofl declares its own
  // schedule'. Named rather than assumed, because a gate named in prose and
  // not written is the defect this repository recorded one iteration ago.
  const analysis = parts.filter((p) => !p.startsWith('stratum('));
  assert.equal(parts.length - analysis.length, 20, 'the schedule, declared as facts');

  // Each mutant's store, built once: the sweep runs the whole program against
  // every one of them for every deletion, and building the stores again each
  // time is the difference between ten seconds and two minutes.
  const stores = [...MUTANTS, ...ANSWER_MUTANTS].map(([, rule]) => {
    const r = new Rofl();
    r.load(BOOT);
    assert.ok(r.load(BASE + rule + '\n').ok, `the door refused ${rule}`);
    return r.store;
  });
  const whole = stores.map((st) => answerSig(st, PROG));

  const survivors: string[] = [];
  for (let i = 0; i < analysis.length; i++) {
    const prog = rowsOf(parts.filter((p) => p !== analysis[i]).join('\n'));
    let died = false;
    for (let m = 0; m < stores.length; m++) {
      let sig;
      try { sig = answerSig(stores[m], prog); } catch { died = true; break; }
      if (sig !== whole[m]) { died = true; break; }
    }
    if (!died) survivors.push(analysis[i].replace(/\s+/g, ' '));
  }
  // THE MEASUREMENT, not a pass/fail dressed as one. The two survivors are the
  // `edb` declarations, and they survive for a reason that is structural rather
  // than accidental: their only reader is `undefined_premise[audit]` in
  // boot.rofl, and the isolated store this program runs in does not hold
  // boot.rofl. Nothing else in the program can be deleted unnoticed.
  // THREE SURVIVORS, each for a reason that is structural rather than a gap
  // in the sample. The two `edb` declarations are read by
  // `undefined_premise[audit]` in boot.rofl, which this isolated store does not
  // hold. `blocked_head` guards against a rule whose head is a kernel
  // relation, and the LOAD DOOR refuses that first with its own message — the
  // clause protects a store that arrived some other way, and no mutant loaded
  // through the door can reach it. Everything else in the program, both
  // halves, is seen by some mutant.
  assert.deepEqual(survivors, ['edb(premise_var).', 'edb(slot_arity).',
    'blocked_head(R) :- analysed(R), concludes(R, Rel), reserved(Rel).']);
});
