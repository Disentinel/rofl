// js-callgraph.test.ts — ONE construct (the function call) at ONE layer (the
// call graph), measured against an EXECUTION oracle and against its own
// frontier.
//
// THE FINISH LINE IS NOT "the rule fires". A rule that resolves `f(x)` and
// says nothing about `o.m()` reports a smaller call graph that looks correct,
// and nothing goes red. So three things are asserted here that a coverage
// count cannot see:
//
//   1. the shape classification is TOTAL — every call site gets exactly one
//      shape, including the shapes nothing resolves;
//   2. every shape with an unresolved residue carries a TYPED verdict, and
//      `runtime_dependent` is spent exactly once, on the only shape whose
//      target genuinely does not exist until the program runs;
//   3. every edge the RUNTIME saw and the model missed is attributable to one
//      of those verdicts. An unexplained miss is the failure this file exists
//      to catch, and it is asserted rather than counted.
//
// THE ORACLE IS THE RUNTIME. `test/fixtures/js-call/trace.mjs` reads V8's own
// CallSite objects; the instrumentation is ours, the names are V8's, and
// nothing in that path reads a ROFL fact. An oracle derived from the rules it
// checks measures nothing.
//
// An empty oracle result is a fact about the oracle until shown otherwise, so
// the instrumentation CENSUS below is a positive control: it parses the
// fixture with babel directly — no ROFL rule involved — and asserts every
// function that could report actually can. Without it, deleting one `trace()`
// call would read as "the model over-approximates".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse } from '@babel/parser';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = path.join(ROOT, 'test', 'fixtures', 'js-call');
const read = (p: string) => fs.readFileSync(p, 'utf8');

/** scanned AND executed */
const RUN_FILES = ['alpha.mjs', 'beta.mjs'];
/** scanned only: TS-only and exotic grammar shapes a runnable .mjs cannot spell */
const STATIC_FILES = ['shapes.ts'];
const ALL_FILES = [...RUN_FILES, ...STATIC_FILES];

/** A scanned-but-never-compiled fixture carries a `.txt` tail ON DISK, because
 *  tsconfig's include covers `test/**` + slash + `*.ts` and would typecheck it as part of
 *  the project — and a fixture whose job is to hold degenerate shapes cannot
 *  also satisfy tsc. Verified rather than assumed: the same content under a
 *  `.ts` name fails TS2695, under `.ts.txt` it passes. The LOGICAL name keeps
 *  its real extension, and that is what reaches the facts. */
const onDisk = (f: string) => (STATIC_FILES.includes(f) ? f + '.txt' : f);

const RULE_FILES = [
  'rules/js-structure.rofl',
  'rules/js-model.rofl',
  'rules/js-callgraph.rofl',
];
const FACT_FILES = ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl'];

// ---------------------------------------------------------------------------
// the model, with an optional textual mutation applied to the rules

type Mutation = { find: string; replace: string };

interface Model {
  q: (lit: string) => string[][];
  n: (lit: string) => number;
  binds: (lit: string, ...vars: string[]) => string[];
}

/** query bindings come back quoted for strings and bare for atoms; the
 *  comparison is against V8 frame names, which are neither. */
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

function build(mutations: Mutation[] = []): Model {
  const r = new Rofl();
  const load = (text: string, what: string) => {
    const res = r.load(text);
    assert.equal(res.ok, true, `${what} rejected:\n${res.diagnostics.join('\n')}`);
  };
  load(read(path.join(ROOT, 'boot.rofl')), 'boot.rofl');

  for (const f of ALL_FILES) {
    const s = scan(read(path.join(FIX, onDisk(f))), { file: f });
    const res = r.assert(s.facts.join('\n'));
    assert.equal(res.ok, true, `${f} facts rejected:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  }
  for (const f of FACT_FILES) load(read(path.join(ROOT, f)), f);
  for (const f of RULE_FILES) {
    let text = read(path.join(ROOT, f));
    if (f === 'rules/js-callgraph.rofl') {
      for (const m of mutations) {
        assert.ok(text.includes(m.find), `mutation anchor absent: ${m.find}`);
        text = text.replace(m.find, m.replace);
      }
    }
    load(text, f);
  }

  const q = (lit: string): string[][] => {
    const res = r.query(lit);
    assert.equal(res.error, undefined, `query ${lit}: ${res.error}`);
    assert.equal(res.partial, false, `query ${lit} hit a budget`);
    const vars = [...lit.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1]);
    const seen = new Set<string>();
    const order = vars.filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
    return res.rows.map((row) => order.map((v) => unq(row.bindings[v] ?? '')));
  };
  return {
    q,
    n: (lit) => q(lit).length,
    binds: (lit, ...vars) => {
      const res = r.query(lit);
      assert.equal(res.error, undefined, `query ${lit}: ${res.error}`);
      return res.rows.map((row) => vars.map((v) => unq(row.bindings[v] ?? '')).join(' -> ')).sort();
    },
  };
}

/** the frontier the model declares, keyed by `file:line` — the coordinate a
 *  V8 stack frame reports for the call site it transferred from */
function frontierByLine(m: Model): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [file, line, item] of m.q('frontier_line[code](File, Line, Item)')) {
    const k = `${file}:${line}`;
    out.set(k, [...(out.get(k) ?? []), item]);
  }
  return out;
}

/** the model's edge set, restricted to the files the oracle actually ran */
function modelEdges(m: Model): Set<string> {
  const out = new Set<string>();
  for (const [file, a, b] of m.q('calls_in[code](File, A, B)')) {
    if (!RUN_FILES.includes(file)) continue;
    out.add(`${a === 'top' ? '<top>' : a} -> ${b}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE ORACLE, and the census that keeps its silence honest

interface OracleEdge { caller: string; callee: string; line: number; file: string }
interface OracleRun { edges: Set<string>; list: OracleEdge[]; measured: Set<string>; raw: number }

// NO CACHE-BUSTING QUERY STRING. The first version appended one, which gave
// the reader a DIFFERENT module instance from the one `alpha.mjs` imports, so
// `oracle.edges()` came back empty — and mutant 6's assertions, all of the
// form "this edge is absent", passed on that emptiness without complaint. An
// empty tool result is a fact about the tool until shown otherwise, and this
// probe proved it on itself. Each run therefore gets its own DIRECTORY, which
// is what actually separates two module graphs.
async function runOracle(dir: string): Promise<OracleRun> {
  const alpha: any = await import(path.join(dir, 'alpha.mjs'));
  const beta: any = await import(path.join(dir, 'beta.mjs'));
  const t: any = await import(path.join(dir, 'trace.mjs'));
  alpha.main();
  beta.bmain();
  const edges = new Set<string>();
  const list: OracleEdge[] = [];
  for (const e of t.oracle.edges()) {
    // frames whose caller file is not a fixture are the HARNESS calling
    // main()/bmain(), not an edge the fixture contains
    const base = path.basename(e.file);
    if (!RUN_FILES.includes(base)) continue;
    edges.add(`${e.caller} -> ${e.callee}`);
    list.push({ caller: e.caller, callee: e.callee, line: e.line, file: base });
  }
  return { edges, list, measured: t.oracle.measured(), raw: t.oracle.edges().length };
}

/** Which functions in a fixture CAN report? A direct babel walk — no ROFL
 *  rule, no scanner fact — so "the oracle saw nothing here" can be told apart
 *  from "the oracle was never wired up here". */
function census(dir: string, files: string[]): { instrumented: Set<string>; silent: Set<string> } {
  const instrumented = new Set<string>();
  const silent = new Set<string>();
  for (const f of files) {
    const ast: any = parse(read(path.join(dir, f)), { sourceType: 'module', plugins: ['typescript'] });
    const walk = (node: any, nameHint: string | null, className: string | null) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const x of node) walk(x, null, className); return; }
      if (typeof node.type !== 'string') return;
      const isFn = node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
        || node.type === 'ArrowFunctionExpression' || node.type === 'ObjectMethod'
        || node.type === 'ClassMethod';
      if (isFn) {
        // a constructor answers to the CLASS's name on a stack frame, not to
        // the key `constructor`. Getting this wrong made the census report a
        // function that had in fact reported — the census must speak the same
        // names as the runtime or it measures nothing.
        const name = node.kind === 'constructor' ? (className ?? 'constructor')
          : node.id?.name ?? node.key?.name ?? nameHint ?? '<anon>';
        const stmts = node.body?.type === 'BlockStatement' ? node.body.body : [];
        const wired = stmts.some((s: any) => s.type === 'ExpressionStatement'
          && s.expression?.type === 'CallExpression'
          && s.expression.callee?.type === 'Identifier'
          && s.expression.callee.name === 'trace');
        (wired ? instrumented : silent).add(name);
      }
      const cls = (node.type === 'ClassDeclaration' || node.type === 'ClassExpression')
        ? node.id?.name ?? className : className;
      for (const k of Object.keys(node)) {
        if (k === 'loc') continue;
        const hint = node.type === 'VariableDeclarator' && k === 'init' ? node.id?.name ?? null
          : node.type === 'ObjectProperty' && k === 'value' ? node.key?.name ?? null : null;
        walk(node[k], hint, cls);
      }
    };
    walk(ast, null, null);
  }
  return { instrumented, silent };
}

function copyFixtures(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-callgraph-'));
  for (const f of [...RUN_FILES, 'trace.mjs']) fs.copyFileSync(path.join(FIX, f), path.join(dir, f));
  return dir;
}

// ===========================================================================
// 1. THE CLASSIFICATION IS TOTAL

test('every call site gets exactly one shape, and the catch-all is reachable', () => {
  const m = build();
  const sites = m.n('call_site[code](C, F)');
  const shapes = m.n('shape[code](C, S)');
  assert.ok(sites > 60, `positive control: expected a corpus, got ${sites} call sites`);
  assert.equal(shapes, sites, 'shape is a total function on call sites');
  assert.deepEqual(m.binds('unshaped[audit](C)', 'C'), [], 'no call site without a shape');
  assert.deepEqual(m.binds('multi_shape[audit](C, A, B)', 'A', 'B'), [], 'no call site with two shapes');

  // the catch-all is not decoration: it caught a real defect. `atomise` turns
  // TSNonNullExpression into `tsnon_null_expression`, and the first version of
  // the shape table guessed `ts_non_null_expression`, matched nothing, and the
  // site landed in s_unclassified rather than vanishing.
  const vocab = m.binds('shape_vocab[audit](S)', 'S');
  assert.ok(vocab.includes('s_unclassified'), 'the catch-all is part of the vocabulary');
  const seen = new Set(m.binds('shape_seen[audit](S)', 'S'));
  for (const s of vocab) assert.ok(!s.startsWith('"'), `shape atoms, not strings: ${s}`);
  assert.ok(seen.size >= 15, `positive control: ${seen.size} shapes exercised`);

  // and the verdict is a total function on the vocabulary: absent, fully
  // resolved, or carrying a residue — never silence.
  const verdicts = new Map<string, string[]>();
  for (const [sh, v] of m.q('shape_verdict[audit](S, V)')) {
    verdicts.set(sh, [...(verdicts.get(sh) ?? []), v]);
  }
  for (const sh of vocab) {
    const v = verdicts.get(sh);
    assert.ok(v && v.length === 1, `${sh} has ${v?.length ?? 0} verdicts, want exactly 1`);
  }
});

test('the shape census — the frontier, as a table', () => {
  const m = build();
  const tally = new Map<string, number>();
  for (const [, s] of m.q('shape[code](C, S)')) tally.set(s, (tally.get(s) ?? 0) + 1);
  const rows = [...tally].sort((a, b) => b[1] - a[1]);
  console.log('  shape census (' + m.n('call_site[code](C, F)') + ' call sites):');
  for (const [s, n] of rows) console.log(`    ${String(n).padStart(3)}  ${s}`);
  // s_identifier dominates because every instrumented function calls trace()
  assert.equal(tally.get('s_computed_dynamic_key'), 3, 'three computed callees with a non-literal key');
  assert.equal(tally.get('s_computed_literal_key'), 2, 'two computed callees with a literal key');
  assert.ok((tally.get('s_unclassified') ?? 0) === 0, 'nothing unclassified in this corpus');
});

// ===========================================================================
// 2. THE NEAREST ENCLOSING FUNCTION

test('a call in a nested function belongs to the inner one', () => {
  const m = build();
  // `leaf(y)` sits inside inner(), which sits inside outer(). Both enclose it.
  const enclosers = m.q('encloses[code](F, C)').length;
  assert.ok(enclosers > 0, 'positive control: something encloses something');
  const named = new Set(modelEdges(m));
  assert.ok(named.has('inner -> leaf'), 'the inner function owns the call');
  assert.ok(!named.has('outer -> leaf'), 'the outer function does NOT');
  assert.ok(named.has('outer -> inner'), 'and the outer function owns its own call');
  // top-level calls have no enclosing function at all and are attributed to
  // the file, which is what a stack frame with no function name means
  assert.ok(named.has('<top> -> seed'), 'the module top level is a caller unit');
});

// ===========================================================================
// 3-5. RESOLUTION AND THE EDGE

test('resolution: identifier, IIFE, and a local namespace object', () => {
  const m = build();
  const e = modelEdges(m);
  assert.ok(e.has('mid -> leaf'), 'tier 1: identifier naming a declaration');
  assert.ok(e.has('useArrow -> dbl'), 'tier 1: identifier naming an arrow bound to a const');
  assert.ok(e.has('<top> -> seed'), 'tier 1b: an IIFE resolves to its own callee');
  assert.ok(e.has('useNs -> hello'), 'tier 2: object literal, shorthand method');
  assert.ok(e.has('useNs -> bye'), 'tier 2: object literal, property holding a function');
  assert.deepEqual(m.binds('ambiguous_call[audit](C, F, G)', 'C'), [], 'no site resolves two ways');
  // the file-agnostic view agrees with the file-scoped one on this corpus
  const named = new Set(m.binds('calls_named[code](A, B)', 'A', 'B'));
  for (const e of modelEdges(m)) assert.ok(named.has(e.replace('<top>', 'top')), `calls_named lost ${e}`);
});

test('two files, one name `run`: resolution is file-scoped', () => {
  const m = build();
  const e = modelEdges(m);
  assert.ok(e.has('main -> run') && e.has('run -> mid'), 'alpha resolves its own run');
  assert.ok(e.has('bmain -> run') && e.has('run -> bhelper'), 'beta resolves its own run');
  // by node, not by name: the names collide and the nodes do not
  assert.equal(m.n('calls[code](A, B)'), m.q('calls[code](A, B)').length);
  const runSites = m.q('resolves[code](C, F)').length;
  assert.ok(runSites > 20, `positive control: ${runSites} resolutions`);
});

test('argument position is content: which function is in which slot', () => {
  const m = build();
  const passed = m.binds('passes_function[code](C, I, F, N)', 'I', 'N');
  assert.deepEqual(passed, ['0 -> leaf', '1 -> mid'], 'apply2(leaf, mid) — in that order');
});

// ===========================================================================
// 6. THE FRONTIER IS TOTAL AND TYPED

test('every unresolved shape carries a typed verdict, and it type-checks', () => {
  const m = build();
  const residue = m.binds('unresolved_shape[audit](S)', 'S');
  assert.ok(residue.length >= 10, `positive control: ${residue.length} shapes with a residue`);

  // THE TOTALITY ARITHMETIC, stated as an identity rather than as a count:
  // resolved sites + unresolved sites = all call sites. A frontier that
  // derives nothing satisfies every "is it explained" check trivially, and
  // only this identity notices that the sites went somewhere.
  const sites = m.n('call_site[code](C, F)');
  const resolved = m.n('resolved_site[code](C)');
  const residueSites = new Set(m.q('unresolved_call[code](C, S)').map(([c]) => c)).size;
  assert.equal(resolved + residueSites, sites,
    `${resolved} resolved + ${residueSites} unresolved != ${sites} call sites`);
  assert.ok(resolved > 0 && residueSites > 0, 'positive control: both halves are non-empty');
  assert.deepEqual(m.binds('shape_unexplained[audit](S)', 'S'), [],
    'a shape whose sites do not resolve and nobody said why');
  assert.deepEqual(m.binds('shape_bad_reason[audit](S, R)', 'S', 'R'), [],
    'every reason is in the taxonomy');
  assert.deepEqual(m.binds('shape_orphan[audit](S)', 'S'), [],
    'no verdict for a shape outside the vocabulary');
  assert.deepEqual(m.binds('shape_stale[audit](S)', 'S'), [],
    'no excuse outliving its cause');

  // `runtime_dependent` is the ONLY reason that is a property of the subject
  // rather than of us, and it is spent exactly once.
  assert.deepEqual(m.binds('shape_irreducible[audit](S)', 'S'), ['s_computed_dynamic_key']);
  const ours = m.binds('shape_ours[audit](S)', 'S');
  assert.equal(ours.length + 1, residue.length, 'irreducible + ours partitions the residue');

  console.log('  frontier: ' + residue.length + ' shapes with a residue, 1 irreducible, '
    + ours.length + ' ours');
  console.log('  unexercised verdicts (grammar, not corpus): '
    + m.binds('shape_unexercised[audit](S)', 'S').join(', '));
});

test('the kind matrix knows every kind this layer touches', () => {
  const m = build();
  assert.deepEqual(m.binds('kind_undeclared[audit](K)', 'K'), [],
    'a kind the rules touch that node_kind does not declare');
  assert.deepEqual(m.binds('orphan_claim[audit](L, K, X)', 'K'), [], 'no claim about a cell that does not exist');
  assert.deepEqual(m.binds('orphan_reason[audit](L, K, X)', 'K'), [], 'no reason about a cell that does not exist');
  assert.deepEqual(m.binds('double_claimed[audit](L, K, X)', 'K'), [], 'no cell claimed both ways');
  assert.deepEqual(m.binds('bad_reason[audit](L, K, X, R)', 'R'), [], 'kind-level reasons type-check too');
  assert.deepEqual(m.binds('stale_reason[audit](L, K, X, R)', 'K'), [], 'no kind-level excuse outliving its cause');

  // the cell IS checked against an oracle, which is what `verified` means
  const verified = m.binds('verified[audit](L, K, X, R)', 'K', 'X');
  assert.ok(verified.includes('call_expression -> callgraph'), 'the call-graph cell has evidence');
});

// ===========================================================================
// 6b. THE PRICE OF THE CELL
//
// The owner's question: how many NEW unmodelled cells did modelling this ONE
// cell drag in? It is measured here rather than asserted, by building the
// matrix twice — once with js-kinds alone, once with this layer's kind
// declarations added — and diffing. The delta is the result whatever it says.

function matrix(withCallgraph: boolean): { cells: number; kinds: number; unaccounted: number; notModelled: number } {
  const r = new Rofl();
  const load = (f: string) => {
    const res = r.load(read(path.join(ROOT, f)));
    assert.equal(res.ok, true, `${f}: ${res.diagnostics.join('\n')}`);
  };
  load('boot.rofl');
  load('facts/js-kinds.rofl');
  if (withCallgraph) load('facts/js-callgraph.rofl');
  load('rules/js-model.rofl');
  const n = (lit: string) => {
    const res = r.query(lit);
    assert.equal(res.error, undefined, `${lit}: ${res.error}`);
    return res.rows.length;
  };
  return {
    cells: n('cell[audit](L, K, X)'),
    kinds: n('node_kind(js, K)'),
    unaccounted: n('unaccounted[audit](L, K, X)'),
    notModelled: n('verdict[audit](L, K, X, not_modelled)'),
  };
}

test('the price of the cell: what modelling the call graph dragged into the matrix', () => {
  const before = matrix(false);
  const after = matrix(true);
  assert.ok(before.cells > 0, 'positive control: the matrix has cells without this layer');
  const dKinds = after.kinds - before.kinds;
  const dCells = after.cells - before.cells;
  const dUnaccounted = after.unaccounted - before.unaccounted;
  console.log(`  js node kinds:  ${before.kinds} -> ${after.kinds}  (+${dKinds})`);
  console.log(`  cells:          ${before.cells} -> ${after.cells}  (+${dCells})`);
  console.log(`  unaccounted:    ${before.unaccounted} -> ${after.unaccounted}  (+${dUnaccounted})`);
  console.log(`  not_modelled:   ${before.notModelled} -> ${after.notModelled}`);

  // 17 kinds x however many layers are declared. The multiplication is the
  // point: a kind named by a CALL-GRAPH rule opens a cell in every other
  // layer too, and nobody has said anything about those.
  // TWO different debts, and conflating them would flatter the result. 17
  // kinds the rules actually TOUCH — measured by kind_undeclared going 17 -> 0
  // — plus 4 the call graph must answer for and does not touch at all: the
  // control transfers that are not CallExpressions.
  assert.equal(dKinds, 24, 'kinds the matrix did not know existed');
  const layers = dCells / dKinds;
  assert.ok(Number.isInteger(layers), 'every new kind opens one cell per layer');
  assert.equal(dCells, dKinds * layers, `${dKinds} kinds x ${layers} layers`);
  // the callgraph half is answered; the other layers' half is not, and that
  // is the debt this cell created rather than repaid
  assert.ok(dUnaccounted > 0, 'modelling one layer LEFT the matrix with more open cells, not fewer');
});

// ===========================================================================
// 7. THE ORACLE — both error directions, counted separately

test('execution oracle: what ran, what the model derived, and the gap', async () => {
  const m = build();
  const model = modelEdges(m);
  const o = await runOracle(FIX);

  // POSITIVE CONTROL, first: an oracle that measured nothing is a fact about
  // the oracle. Both the raw frame count and the census must be non-trivial.
  assert.ok(o.raw >= 30, `oracle recorded ${o.raw} frames — did it run at all?`);
  const { instrumented, silent } = census(FIX, RUN_FILES);
  assert.ok(instrumented.size >= 25, `census: only ${instrumented.size} instrumented functions`);
  assert.deepEqual([...silent].sort(), [], 'every fixture function can report');
  // `pickA` is the decoy of the computed-callee trap: `const pickA = "pickB"`
  // means `two[pickA]()` runs pickB and pickA never executes. It is the ONE
  // function that is instrumented and legitimately silent, and it is named
  // here rather than tolerated — if it ever reports, the trap has stopped
  // trapping, and if anything else falls silent, that goes red too.
  const NEVER_CALLED = ['pickA'];
  const silentButWired = [...instrumented].filter((n) => !o.measured.has(n)).sort();
  assert.deepEqual(silentButWired, NEVER_CALLED,
    'exactly the decoy is instrumented and unreported');

  const missed = [...o.edges].filter((e) => !model.has(e)).sort();
  const extra = [...model].filter((e) => !o.edges.has(e)).sort();
  console.log(`  oracle ${o.edges.size} edges | model ${model.size} edges`);
  console.log(`  UNSOUND under-report (oracle saw, model missed): ${missed.length}`);
  for (const e of missed) console.log('    - ' + e);
  console.log(`  over-approximation (model derived, oracle never ran): ${extra.length}`);
  for (const e of extra) console.log('    + ' + e);

  assert.ok(o.edges.size >= 30, 'the oracle saw a call graph');
  assert.ok(model.size >= 20, 'the model derived a call graph');

  // THE ASSERTION THAT MATTERS, and it is an ATTRIBUTION rather than a count.
  // Every missed edge must point at a frontier item sitting in the very
  // function the runtime called FROM — an unresolved call site, or a transfer
  // form this layer does not model. A miss whose caller has no frontier row is
  // a call the model lost with nothing to blame, which is the silent
  // under-report this whole file exists to catch.
  const frontier = frontierByLine(m);
  assert.ok(frontier.size > 0, 'positive control: the frontier has members');
  const shapeReasons = new Map(m.q('shape_reason[audit](S, R)') as [string, string][]);
  const kindReasons = new Map(m.q('reason[audit](L, K, X, R)').filter(([, , l]) => l === 'callgraph')
    .map(([, k, , r]) => [k, r] as [string, string]));
  console.log('  attribution of every missed edge, by the LINE V8 reported:');
  for (const e of o.list) {
    const key = `${e.caller} -> ${e.callee}`;
    if (model.has(key)) continue;
    const items = frontier.get(`${e.file}:${e.line}`);
    assert.ok(items && items.length > 0, `SILENT UNDER-REPORT: ${key} at ${e.file}:${e.line}`
      + ' — the model lost this call and declares no frontier at the site it came from');
    for (const i of items) {
      assert.ok(shapeReasons.has(i) || kindReasons.has(i), `${i} carries no typed reason`);
    }
    console.log(`    ${key.padEnd(24)} ${e.file}:${e.line}  <-  ${[...new Set(items)].sort().join(', ')}`);
  }
  // `new Box(1)` is not a call site at all: the constructor edge is missed
  // because new_expression is an unmodelled TRANSFER form, not a callee shape.
  assert.equal(kindReasons.get('new_expression'), 'not_yet', 'the constructor edge has a verdict');
  assert.ok(missed.some((e) => e.endsWith('-> Box')), 'and the oracle really did see it');

  // over-approximation is expected and must be COUNTED, not waved through
  assert.ok(extra.length <= 2, `over-approximation grew to ${extra.length}: ${extra.join(', ')}`);
});

// ===========================================================================
// 8. THE MUTANT SET — one mutant is liveness, a set is coverage

interface Probe { edges: Set<string>; residue: number; shapes: number; ambiguous: number; passed: string[] }
function probe(mutations: Mutation[]): Probe {
  const m = build(mutations);
  return {
    edges: modelEdges(m),
    residue: m.n('unresolved_call[code](C, S)'),
    shapes: m.n('shape[code](C, S)'),
    ambiguous: m.n('ambiguous_call[audit](C, F, G)'),
    passed: m.binds('passes_function[code](C, I, F, N)', 'I', 'N'),
  };
}

test('mutant 1 — drop `not closer`: a call is attributed to every enclosing function', () => {
  const base = probe([]);
  const mut = probe([{
    find: 'nearest_fn[code](F, C) :- encloses[code](F, C), not closer[code](F, C).',
    replace: 'nearest_fn[code](F, C) :- encloses[code](F, C).',
  }]);
  assert.ok(mut.edges.has('outer -> leaf'), 'the mutant attributes the inner call to the outer function');
  assert.ok(!base.edges.has('outer -> leaf'), 'and the baseline does not');
  console.log(`  KILLED: edges ${base.edges.size} -> ${mut.edges.size}`);
});

test('mutant 2 — ignore `computed`: the frontier collapses into a false resolution', () => {
  const base = probe([]);
  const mut = probe([{
    find: 'computed_member[code](C, N) :- member_like[code](C, N), ast_attr[code](N, computed, true).\nstatic_member[code](C, N)   :- member_like[code](C, N), ast_attr[code](N, computed, false).',
    replace: 'computed_member[code](C, N) :- member_like[code](C, N), ast_attr[code](N, computed, never).\nstatic_member[code](C, N)   :- member_like[code](C, N).',
  }]);
  // the trap: `const pickA = "pickB"; two[pickA]()` runs pickB. A model that
  // reads the computed callee as `two.pickA` resolves to the WRONG function.
  assert.ok(mut.edges.has('useTrap -> pickA'), 'the mutant invents an edge no execution can produce');
  assert.ok(!base.edges.has('useTrap -> pickA'), 'the baseline refuses');
  assert.ok(mut.residue < base.residue, 'and the frontier shrank, which is how it looks like progress');
  console.log(`  KILLED: residue ${base.residue} -> ${mut.residue}, edges ${base.edges.size} -> ${mut.edges.size}`);
});

test('mutant 3 — resolve across the corpus: two files each defining `run`', () => {
  const base = probe([]);
  const mut = probe([{
    find: '                        ast_name[code](N, Name), call_site[code](C, File),\n                        fn_binding[code](F, Name, File).',
    replace: '                        ast_name[code](N, Name), call_site[code](C, File),\n                        fn_binding[code](F, Name, _).',
  }]);
  assert.equal(base.ambiguous, 0, 'baseline: no site resolves two ways');
  assert.ok(mut.ambiguous > 0, `mutant resolves ${mut.ambiguous} sites two ways`);
  console.log(`  KILLED: ambiguous resolutions ${base.ambiguous} -> ${mut.ambiguous}`);
});

test('mutant 4 — drop the argument index: which function is in which slot', () => {
  const base = probe([]);
  const mut = probe([{
    find: 'call_arg[code](C, I, A)       :- call_site[code](C, _), ast_child[code](C, arguments, I, A).',
    replace: 'call_arg[code](C, 0, A)       :- call_site[code](C, _), ast_child[code](C, arguments, _, A).',
  }]);
  assert.deepEqual(base.passed, ['0 -> leaf', '1 -> mid']);
  assert.deepEqual(mut.passed, ['0 -> leaf', '0 -> mid'], 'both functions collapse into slot 0');
  console.log(`  KILLED: ${base.passed.join(', ')} -> ${mut.passed.join(', ')}`);
});

test('mutant 5 — unresolved_call derives nothing: is the frontier checked for totality?', () => {
  const base = probe([]);
  const mut = build([{
    find: 'unresolved_call[code](C, S) :- shape[code](C, S), not resolved_site[code](C).',
    replace: 'unresolved_call[code](C, S) :- shape[code](C, S), shape[code](C, s_no_such_shape).',
  }]);
  assert.ok(base.residue > 30, `positive control: baseline residue ${base.residue}`);
  assert.equal(mut.n('unresolved_call[code](C, S)'), 0, 'the mutant reports an empty frontier');

  // THE DIRECT KILL: resolved + unresolved no longer accounts for the call
  // sites. 82 sites went in, 28 came out resolved, and the model claims
  // nothing is left over.
  const sites = mut.n('call_site[code](C, F)');
  const resolved = mut.n('resolved_site[code](C)');
  assert.notEqual(resolved + 0, sites, 'the totality identity is broken');
  assert.ok(sites - resolved > 50, `${sites - resolved} call sites vanished from the frontier`);
  // an empty frontier is not success: the shapes still exist and the sites
  // still do not resolve. `shape_stale` is what says so — every verdict now
  // stands over a shape the model claims is finished.
  const stale = mut.binds('shape_stale[audit](S)', 'S');
  assert.ok(stale.length > 10, `the stale-verdict audit fires on ${stale.length} shapes`);
  assert.deepEqual(build().binds('shape_stale[audit](S)', 'S'), [], 'and is silent on the baseline');
  console.log(`  KILLED: residue ${base.residue} -> 0, but shape_stale went ${0} -> ${stale.length}`);
});

test('mutant 6 — delete one function\'s instrumentation: can the probe tell "not called" from "not measured"?', async () => {
  const dir = copyFixtures();
  const before = census(dir, RUN_FILES);
  assert.deepEqual([...before.silent].sort(), [], 'positive control: the copy is fully instrumented');

  const p = path.join(dir, 'alpha.mjs');
  const mutated = read(p).replace('function useDeep(n) {\n  trace();\n', 'function useDeep(n) {\n');
  assert.notEqual(mutated, read(p), 'the mutation applied');
  fs.writeFileSync(p, mutated);

  const after = census(dir, RUN_FILES);
  assert.deepEqual([...after.silent].sort(), ['useDeep'], 'the census names the uninstrumented function');

  const o = await runOracle(dir);
  // POSITIVE CONTROL FIRST. Every assertion below is of the form "this is
  // absent", and an oracle that ran nothing satisfies all of them. It has to
  // be shown speaking before its silence about useDeep means anything.
  assert.ok(o.raw >= 30, `oracle recorded ${o.raw} frames on the copy — it never ran`);
  assert.ok(o.measured.has('useCall'), 'a neighbouring function still reports');
  assert.ok(o.edges.has('main -> useCall'), 'and its edge is still there');
  assert.ok(!o.measured.has('useDeep'), 'and the oracle now reports nothing for it');
  // without the census, this absence would read as "the model over-approximates
  // main -> useDeep". With it, the run is refused as unmeasured.
  assert.ok(!o.edges.has('main -> useDeep'), 'the edge disappeared from the oracle');
  assert.ok(build().binds('calls_in[code](File, A, B)', 'A', 'B').includes('main -> useDeep'),
    'while the model still derives it — the exact shape of a false over-approximation');
  console.log('  KILLED: census names `useDeep` unmeasured; the missing edge is not evidence');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mutant 7 — un-declare `new` as a transfer site: the attribution gate goes blind', async () => {
  // THE ATTRIBUTION GATE'S OWN POSITIVE CONTROL. It reported every missed edge
  // as explained; a gate that has never refused is an assumption wearing a
  // gate's interface. `new Box(1)` is the one miss that is NOT a callee shape,
  // so removing its declaration should leave that site with nothing to point
  // at — and leave every other miss still attributed.
  const o = await runOracle(FIX);
  const base = frontierByLine(build());
  const blind = frontierByLine(build([{
    find: 'transfer_kind(new_expression).',
    replace: 'transfer_kind(no_such_kind).',
  }]));
  const ctor = o.list.find((e) => e.callee === 'Box');
  assert.ok(ctor, 'positive control: the oracle saw the constructor edge');
  const key = `${ctor!.file}:${ctor!.line}`;
  assert.ok((base.get(key) ?? []).includes('new_expression'), 'the baseline attributes it');
  assert.deepEqual(blind.get(key), undefined, 'the mutant has nothing at that site');
  // and the damage is LOCAL: every other missed edge is still attributed, so
  // the mutant is killed by the constructor site and not by a global collapse
  const stillOk = o.list.filter((e) => e.callee !== 'Box' && blind.has(`${e.file}:${e.line}`)).length;
  assert.ok(stillOk > 5, `${stillOk} other sites keep their attribution`);
  console.log(`  KILLED: the new-expression site loses its verdict while ${stillOk} others keep theirs`);
});
