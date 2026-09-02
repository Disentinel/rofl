// kernel-arity.test.ts — a program writing a kernel relation at the wrong
// width is REFUSED, naming what is wrong. It is not answered, and above all
// the host does not fall over.
//
// WHAT WAS MEASURED, and why the sweep came before the fix. The report was
// that `stratum/1` crashes the host with a TypeError. Sweeping one name would
// have fixed one case in ten, so all 25 kernel-read names were swept over
// arities 0..4, in both clause forms, under all four evaluator/semantics
// configurations. Two crashed, not one:
//
//   premise_lit/1  — under EVERY configuration (src/reflect.ts decodeRules,
//                    which tested `f.args[1].k` before anything established
//                    that there is an args[1]).
//   stratum/1      — under the `strata` evaluator only (src/engine.ts
//                    readStrata: `const [rel, n] = f.args` and then `n.k`).
//                    Under the default `rounds` evaluator nothing reads
//                    `stratum`, which is why the default sweep saw nothing and
//                    why the first sweep's silence was a fact about the probe.
//
// The other 23 are inert at the wrong width. That is luck about where each
// reader happens to look, not a property anything enforced — so the refusal
// is at the door, against one table, rather than in the two readers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rofl, type EvalOpts } from '../src/api.ts';
import { ARITY, V, IFACE, MAIN } from '../src/reflect.ts';
import { mka } from '../src/unify.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

const CONFIGS: { name: string; opts: EvalOpts; decl: string }[] = [
  { name: 'rounds', opts: {}, decl: '' },
  { name: 'strata', opts: { evaluator: 'strata' }, decl: '' },
  { name: 'rounds+wf', opts: {}, decl: 'semantics(well_founded).\n' },
  { name: 'strata+wf', opts: { evaluator: 'strata' }, decl: 'semantics(well_founded).\n' },
];

type Outcome = { kind: 'crash' | 'refused' | 'accepted'; detail: string };

function attempt(text: string, cfg: { opts: EvalOpts; decl: string }): Outcome {
  try {
    const r = new Rofl(cfg.opts);
    assert.equal(r.load(BOOT).ok, true, 'boot.rofl must load');
    const res = r.load(cfg.decl + text);
    if (!res.ok) return { kind: 'refused', detail: res.diagnostics[0] ?? '' };
    r.evaluate();
    return { kind: 'accepted', detail: '' };
  } catch (e) {
    const err = e as Error;
    if (err.constructor.name === 'StratificationError'
      || err.constructor.name === 'BudgetExhausted') {
      return { kind: 'refused', detail: err.message };
    }
    return { kind: 'crash', detail: `${err.constructor.name}: ${err.message}` };
  }
}

const args = (k: number) => Array.from({ length: k }, (_, i) => `a${i}`).join(', ');
const lit = (rel: string, k: number) => (k === 0 ? rel : `${rel}(${args(k)})`);

// ---------------------------------------------------------------------------

test('the sweep: no kernel name at any width in any configuration crashes the host', () => {
  const names = Object.keys(ARITY).sort();
  assert.equal(names.length, 25, 'the table covers the whole kernel vocabulary');
  const crashes: string[] = [];
  let refusals = 0;
  for (const cfg of CONFIGS) {
    for (const rel of names) {
      for (let k = 0; k <= 4; k++) {
        if (k === ARITY[rel]) continue;
        for (const text of [
          `${lit(rel, k)}.`,
          `${k === 0 ? 'seed0.' : `seed${k}(${args(k)}).`}\n`
          + `${lit(rel, k)} :- ${k === 0 ? 'seed0' : `seed${k}(${args(k)})`}.`,
        ]) {
          const o = attempt(text, cfg);
          if (o.kind === 'crash') crashes.push(`[${cfg.name}] ${text} -> ${o.detail}`);
          if (o.kind === 'refused') refusals++;
        }
      }
    }
  }
  assert.deepEqual(crashes, [], 'a wrong program is refused, never a host crash');
  // POSITIVE CONTROL on the sweep itself: an empty crash list would also be
  // produced by a sweep that never ran anything. It ran, and it refused.
  assert.ok(refusals > 700, `the sweep must actually exercise the gate, got ${refusals}`);
});

test('the two that used to crash are now refused, by name and by number', () => {
  // `premise_lit/1`: crashed under every configuration.
  for (const cfg of CONFIGS) {
    const o = attempt('premise_lit(a0).', cfg);
    assert.equal(o.kind, 'refused', `premise_lit/1 under ${cfg.name}`);
    assert.match(o.detail, /'premise_lit' is a kernel relation of arity 3, written here with 1/);
  }
  // `stratum/1`: crashed under `strata`, as a fact and as a rule head.
  const strata = CONFIGS[1];
  for (const text of ['stratum(a0).', 'seed(x).\nstratum(A) :- seed(A).']) {
    const o = attempt(text, strata);
    assert.equal(o.kind, 'refused', text);
    assert.match(o.detail, /'stratum' is a kernel relation of arity 2, written here with 1/);
  }
});

test('the gate says YES: the right width, and every ordinary relation, still load', () => {
  for (const cfg of CONFIGS) {
    assert.equal(attempt('stratum(some_rel, 1).', cfg).kind, 'accepted', cfg.name);
    assert.equal(attempt('edb(some_rel).', cfg).kind, 'accepted', cfg.name);
    assert.equal(attempt('concludes(r_x, some_rel).', cfg).kind, 'accepted', cfg.name);
    // a relation the kernel has no opinion about takes any width it likes
    assert.equal(attempt('zzz_free(a).\nzzz_free(a, b, c).', cfg).kind, 'accepted', cfg.name);
  }
});

test('the reader is total too, because a snapshot never passes the door', () => {
  // `Rofl.fromSnapshot` does not go through `addClause`, so the admission
  // check cannot see it. `decodeRules` therefore checks width itself.
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  r.store.add(V.premise_lit, MAIN, [mka('x')], { scope: 'timeless', base: true });
  const snap = r.save();
  for (const evaluator of ['rounds', 'strata'] as const) {
    const back = Rofl.fromSnapshot(snap, { evaluator });
    back.store.dirty = true;
    back.evaluate();   // must not throw
    assert.ok(back.query('reserved(X)').rows.length > 0, 'and the store still answers');
  }
});

test('KNOWN RESIDUE: stratum/1 from a snapshot still crashes readStrata', () => {
  // The one path the door cannot cover and the one reader that is not guarded:
  // src/engine.ts readStrata destructures `const [rel, n] = f.args` and then
  // reads `n.k`. Reached only by a store that did NOT come through `load`
  // (a hand-edited or hand-built snapshot) AND the `strata` evaluator, which
  // is the only thing that reads `stratum` at all.
  //
  // It is pinned as a FAILING PROPERTY rather than fixed because src/engine.ts
  // was out of scope for this change. The fix is one line at its top:
  // `if (f.args.length !== 2) continue;`. When that lands, this test flips —
  // delete it and drop the case into the sweep above.
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  r.store.add(IFACE.stratum, MAIN, [mka('x')], { scope: 'timeless', base: true });
  const snap = r.save();

  const rounds = Rofl.fromSnapshot(snap, { evaluator: 'rounds' });
  rounds.store.dirty = true;
  rounds.evaluate();   // nothing reads `stratum` here, so it survives

  const strata = Rofl.fromSnapshot(snap, { evaluator: 'strata' });
  strata.store.dirty = true;
  assert.throws(() => strata.evaluate(), /Cannot read properties of undefined/,
    'documented residue — see the comment above, and delete this when it is fixed');
});
