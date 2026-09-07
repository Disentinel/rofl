// js-corpus-world.ts — ONE CONSTRUCTION OF THE CORPUS WORLD, shared by every
// file that mutates it.
//
// WHY IT IS A MODULE AND NOT A COPY. Measured 2026-09-07: one world costs
// 15.4 s and 15.39 of that is THE FIXPOINT — the scan is 0.08 s and asserting a
// hundred and sixty thousand AST facts is 0.33 s. So a test file's wall time is
// exactly (number of worlds) x (one fixpoint), and test/js-controlflow.test.ts
// had grown to sixty-six of them: 937 s of an 1171 s suite, on a machine that
// runs THREE test files at once and had two cores idle for most of the run.
//
// Splitting the tests across files is therefore the whole remedy available
// without a kernel change, and it is only available if the construction is ONE
// artifact rather than three copies that can drift apart. `base()` memoises per
// PROCESS, so each file pays for one unmutated world — three instead of one,
// which is the price of the parallelism, stated rather than hidden.
//
// w_mutant_costs_a_world STAYS OPEN. A mutant still pays for a whole fixpoint,
// and whether the kernel can re-evaluate only what a changed rule reaches is a
// kernel question rather than a test one. This is the cheap half.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const FIX = 'test/fixtures/js-call/';
const FILES: [string, string][] = [
  ['alpha.mjs', FIX + 'alpha.mjs'],
  ['beta.mjs', FIX + 'beta.mjs'],
  ['gamma.mjs', FIX + 'gamma.mjs'],
  ['delta.mjs', FIX + 'delta.mjs'],
  ['shapes.ts', FIX + 'shapes.ts.txt'],
];
const FACTS = ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl', 'facts/js-dataflow.rofl',
               'facts/js-modules.rofl', 'facts/js-shapes.rofl',
               'facts/js-statements.rofl'];
const RULES = ['rules/js-structure.rofl', 'rules/js-dataflow.rofl', 'rules/js-model.rofl',
               'rules/js-callgraph.rofl', 'rules/js-controlflow.rofl'];

type Mut = { find: string; replace: string; file?: string };
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

interface World { q: (l: string) => string[][]; n: (l: string) => number; }

/** the full corpus world, with the control-flow layer declared */
function build(muts: Mut[] = [], omitLayer = false): World {
  const r = new Rofl();
  const load = (name: string, text: string) => {
    const res = r.load(text);
    assert.ok(res.ok, `${name} REJECTED:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  };
  // ONE LOAD, AND THE FACTS LAST. Measured 2026-09-07 because this file's cost
  // became the loop's slowest number: `r.load()` RE-EVALUATES, and this world
  // was calling it nine times — boot, seven fact packs, then the rules — so the
  // fixpoint ran nine times to produce one answer. `r.evaluate()` at the end
  // then measured 0 ms, which is the tell.
  //
  //    nine loads, facts asserted first     16.9 s
  //    one load of the packs, facts first   12.3 s   (-27%)
  //    ONE load of everything, facts AFTER  10.0 s   (-41%)
  //
  // Asserting the AST facts after the rules are in place is what makes the last
  // one work: with an empty store the rule load is nearly free, and the single
  // real fixpoint happens at `evaluate`. FIFTEEN relations were compared
  // between the old construction and this one and came back byte-identical —
  // `calls_in`, `resolves`, `may_throw`, `may_not_run`, `may_not_be_reached`,
  // `caught_value`, `after_abrupt`, `guarded`, `cell`, `verdict`,
  // `vocabulary_gap`, `may_be_node`, `accessor_read`, `reachable`,
  // `ambiguous_call` — with a positive control that a changed store DOES
  // compare unequal. The first control was blind (it added a node of a declared
  // kind and watched a relation keyed by kind) and was replaced rather than
  // believed.
  const packs = ['boot.rofl', ...FACTS, 'facts/js-controlflow.rofl', ...RULES]
    .filter((f) => !(omitLayer && f === 'facts/js-controlflow.rofl'))
    .map((f) => {
      let text = read(f);
      for (const m of muts) if ((m.file ?? 'rules/js-controlflow.rofl') === f) {
        assert.ok(text.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
        text = text.replace(m.find, m.replace);
      }
      return text;
    });
  load('all packs', packs.join('\n'));
  for (const [logical, disk] of FILES) {
    const res = r.assert(scan(read(disk), { file: logical }).facts.join('\n'));
    assert.ok(res.ok, `${logical} facts REJECTED:\n${res.diagnostics.slice(0, 4).join('\n')}`);
  }
  r.evaluate(20_000_000);

  const q = (lit: string): string[][] => {
    const res = r.query(lit);
    assert.equal(res.error, undefined, `query ${lit}: ${res.error}`);
    assert.equal(res.partial, false, `query ${lit} hit a budget`);
    assert.equal(res.unpopulatable, false, `query ${lit}: nothing in this world can populate it`);
    const seen = new Set<string>();
    const order = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1])
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return res.rows.map((row) => order.map((v) => unq(row.bindings[v] ?? '')));
  };
  return { q, n: (l) => q(l).length };
}

let BASE: World | undefined;
const base = () => (BASE ??= build());

/** the call edges the model derives, as `caller -> callee` */
export const edges = (w: World) => new Set(w.q('calls_in[code](File, A, B)').map(([, a, b]) => `${a} -> ${b}`));

/** the functions the model says MAY NOT RUN, by name */
export const names = (w: World) => new Set(w.q('may_not_run[code](F)')
  .flatMap(([f]) => w.q(`fn_name[code](${f}, N)`).map(([n]) => n)));

/** each catch parameter and the file its value came from.
 *
 *  THE COLUMN WAS THE LINE NUMBER until 2026-09-07, and no assertion noticed:
 *  every caller splits on `<-` and reads the LEFT half, or compares two of
 *  these lists for length or inequality. `q` returns one cell per capital-letter
 *  variable IN THE ORDER THE LITERAL WRITES THEM — `(id, K, F, L)` is three
 *  variables, not four, because the node id is lower-case — so `[2]` is `L`.
 *  The fourth wrong destructure of a positional result in this repository, and
 *  the first inside a helper three test files import. */
export const caught = (w: World) => w.q('caught_value[flow](P, V)')
  .map(([p, v]) => `${w.q(`ast_name[code](${p}, N)`)[0]?.[0] ?? p}<-${w.q(`ast_node[code](${v}, K, F, L)`)[0]?.[1] ?? v}`)
  .sort();

export { build, base, read, ROOT, FILES, FACTS, RULES, unq };
export type { Mut, World };
