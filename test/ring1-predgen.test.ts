// THE GENERATED PREDICATE LAYER AGAINST THE RULES IT CAME FROM.
//
// Between the automaton and the span productions sits a layer of predicates
// over one position — `wordch`, `word_start`, `prevword`, `white` and the rest.
// `scanners/ring1_predgen.ts` emits them as Rust by reading ring1.rofl: each
// becomes a function that is an OR over its clauses of an AND over their
// guards, which is what the automaton generator could not do because it INLINED
// and a multi-clause relation is a disjunction.
//
// The oracle is ring1: the set of positions where a generated predicate holds
// must equal the set the rules derive. Set equality, not a count — a generator
// that is right about how MANY is not right.
//
// THE LAYER IS CLOSED OVER ITS OWN DEPENDENCIES and that was learned from the
// Rust compiler rather than from the generator: the first draft expressed
// `stray` and `first_tok`, which read `tokstart` and `preceded`, both of which
// it had refused for reading a span. The emitted code called functions that
// were never emitted. A refusal that has to be discovered downstream is not a
// refusal, so the generator now closes the set and names what it dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../src/api.ts';
import { extract } from '../scanners/ring1_predgen.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const read = (p: string): string => fs.readFileSync(path.join(REPO, p), 'utf8');
const BUDGET = 4_000_000_000;
const FILES = ['examples/counter.rofl', 'rules/policies/authority.rofl', 'examples/tm.rofl'];

const { preds, refused } = extract();

test('the predicate layer is closed and its refusals all point at the span layer', () => {
  assert.ok(preds.length >= 8, `only ${preds.length} predicates expressed`);
  const names = new Set(preds.map((p) => p.rel));
  for (const p of preds) {
    const walk = (x: unknown): void => {
      const t = x as { t: string; rel?: string; x?: unknown; xs?: unknown[] };
      if (t.t === 'pred') assert.ok(names.has(t.rel!), `${p.rel} reads ${t.rel}, which was not emitted`);
      else if (t.t === 'not') walk(t.x);
      else if (t.t === 'and') t.xs!.forEach(walk);
    };
    p.clauses.forEach(walk);
  }
  // every refusal names why, and the reason is a span or an unanchored premise
  for (const r of refused) {
    assert.match(r, /is not a single-index test|not anchored at a known offset|not expressible|non-atom/,
      `a refusal with no stated reason: ${r}`);
  }
});

function fromRules(src: string, rel: string): Set<number> {
  const w = new Rofl({ space: 20_000_000 });
  for (const p of ['boot.rofl', 'examples/ring1/charclass.rofl', 'examples/ring1/ring1.rofl']) {
    w.load(read(p), { budget: BUDGET });
  }
  w.assert(`src(${JSON.stringify(src)}).`);
  w.evaluate(BUDGET);
  const out = new Set<number>();
  for (const row of w.query(`${rel}(I)`).rows) out.add(Number(row.bindings.I));
  return out;
}

for (const f of FILES) {
  test(`every generated predicate holds exactly where the rules say: ${f}`, () => {
    const src = read(f);
    const bin = path.join(REPO, 'rust/target/release/ring1-preds');
    if (!fs.existsSync(bin)) return;                       // built by cargo, skipped when absent
    let checked = 0;
    for (const p of preds) {
      const truth = fromRules(src, p.rel);
      const raw = execFileSync(bin, [p.rel, path.join(REPO, f)], { encoding: 'utf8' });
      const mine = new Set(raw.split('\n').filter(Boolean).map(Number));
      const missing = [...truth].filter((i) => !mine.has(i));
      const extra = [...mine].filter((i) => !truth.has(i));
      assert.deepEqual([missing.slice(0, 3), extra.slice(0, 3)], [[], []],
        `${p.rel} on ${f}: ${missing.length} positions the rules have and the generated code does not, `
        + `${extra.length} the other way`);
      checked++;
    }
    assert.ok(checked >= 8, `only ${checked} predicates compared`);
  });
}
