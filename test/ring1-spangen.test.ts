// THE TOKENIZER, READ OUT OF THE RULES, AGAINST THE RULES.
//
// `scanners/ring1_spangen.ts` extracts thirty relations from ring1.rofl —
// including `tok/2`, which with the automaton is a complete tokenizer — and
// interprets them. The interpretation is checked here before any of it is
// rendered into Rust, which is the order the automaton half was built in and
// the right one: the risky work is READING the rules, and turning a validated
// tree into code is mechanical. A generator checked only through its emitted
// output makes every mistake look like a compiler error.
//
// SET EQUALITY, NEVER A COUNT. The set of (start, end) pairs must be the same
// set the rules derive. A generator that agrees about HOW MANY tokens there are
// is not a generator that agrees.
//
// SIX OFFSET MISTAKES WERE CAUGHT BY THIS COMPARISON OR ITS PREDECESSORS, all
// of them the same shape and all of them mine: a classifier that gave four
// populations for one unchanged grammar, an offset solver that read `I is J + 1`
// in one direction, a loop guard anchored at the span start rather than the
// cursor, one offset map for a chain whose frame moves, a chain that could not
// look back at a position it had passed, and a loop that advanced the position
// AND applied the guard's own offset, so every word came out one character
// short. Each looked like the rules being awkward.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { extract, evaluate, type World } from '../scanners/ring1_spangen.ts';
import { extract as lexExtract, type Cond } from '../scanners/ring1_lexgen.ts';

const REPO = fs.realpathSync(new URL('..', import.meta.url).pathname);
const read = (p: string): string => fs.readFileSync(path.join(REPO, p), 'utf8');
const BUDGET = 4_000_000_000;

// shape rather than size: a tiny file, a comment-heavy one, one with strings
const FILES = ['examples/counter.rofl', 'rules/policies/authority.rofl', 'examples/tm.rofl'];

const ex = extract();
const auto = lexExtract();

/** The characters, their classes and the automaton's state at each position. */
function world(src: string): World {
  const ch = [...src];
  const kind = ch.map((c) => auto.charKinds.get(c) ?? 'other');
  const size = (c: Cond): number => (c.k === 'and' ? c.cs.reduce((n, x) => n + size(x), 0) : c.k === 'true' ? 0 : 1);
  const ev = (c: Cond, i: number): boolean => {
    switch (c.k) {
      case 'true': return true;
      case 'kind': { const j = i + c.off; return j >= 0 && j < kind.length && kind[j] === c.kind; }
      case 'not': return !ev(c.c, i);
      case 'and': return c.cs.length === 0 ? false : c.cs.every((x) => ev(x, i));
    }
  };
  const state: string[] = [];
  let st = auto.start;
  for (let i = 0; i < ch.length; i++) {
    state.push(st);
    const ms = (auto.moves.get(st) ?? []).slice().sort((x, y) => size(y.cond) - size(x.cond));
    let next = st;
    for (const m of ms) if (ev(m.cond, i)) { next = m.to; break; }
    st = next;
  }
  return { ch, kind, state };
}

function fromRules(src: string, rel: string): Set<string> {
  const w = new Rofl({ space: 20_000_000 });
  for (const p of ['boot.rofl', 'examples/ring1/charclass.rofl', 'examples/ring1/ring1.rofl']) {
    w.load(read(p), { budget: BUDGET });
  }
  w.assert(`src(${JSON.stringify(src)}).`);
  w.evaluate(BUDGET);
  const out = new Set<string>();
  for (const row of w.query(`${rel}(I, J)`).rows) out.add(`${row.bindings.I},${row.bindings.J}`);
  return out;
}

test('the extraction expresses tok, and every refusal names a clause', () => {
  const names = new Set(ex.rels.map((r) => r.rel));
  assert.ok(names.has('tok'), 'tok is the milestone: the automaton plus tok is a tokenizer');
  assert.ok(ex.rels.length >= 25, `only ${ex.rels.length} relations expressed`);
  for (const r of ex.refused) {
    assert.match(r.where, /ring1\.rofl#\d+/, `a refusal with no clause named: ${JSON.stringify(r)}`);
    assert.ok(r.why.length > 10, `a refusal with no stated reason: ${r.where}`);
  }
});

for (const f of FILES) {
  test(`tok, derived from the rules, equals what the rules derive: ${f}`, () => {
    const src = read(f);
    const truth = fromRules(src, 'tok');
    const mine = evaluate(world(src), ex).get('tok') ?? new Set<string>();
    assert.ok(truth.size > 20, `${f}: only ${truth.size} tokens, too few to prove anything`);
    const missing = [...truth].filter((x) => !mine.has(x));
    const invented = [...mine].filter((x) => !truth.has(x));
    assert.deepEqual([missing.slice(0, 5), invented.slice(0, 5)], [[], []],
      `${f}: ${missing.length} tokens the rules have and the extraction does not, ${invented.length} the other way`);
    assert.equal(mine.size, truth.size);
  });
}
