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

/** scanned AND executed. `gamma.mjs` declares NO function — it is two
 *  `export *` lines — so it contributes nothing to the census and no frame to
 *  the oracle; it is here because it IS executed, as the module beta imports.
 *  `delta.mjs` is executed for the same reason at one more remove: nothing
 *  imports it, and gamma's second `export *` is its only path into the run. */
const RUN_FILES = ['alpha.mjs', 'beta.mjs', 'gamma.mjs', 'delta.mjs'];
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

// rules/js-controlflow.rofl JOINED 2026-09-06, and it is the THIRD instrument
// in this suite found measuring "the model" in a world narrower than the claim
// — after test/js-fixpoint-cost.test.ts and the corpus world in
// test/js-model.test.ts. The omission was invisible while the control-flow layer
// derived no CALL edges; an accessor read is one, and the oracle said so within
// a run: `SILENT UNDER-REPORT: useGauge -> get broken`. A missing pack subtracts
// rows, and a subtracted row fails in the safe direction.
const RULE_FILES = [
  'rules/js-structure.rofl',
  'rules/js-dataflow.rofl',
  'rules/js-model.rofl',
  'rules/js-callgraph.rofl',
  'rules/js-controlflow.rofl',
];
const FACT_FILES = ['facts/js-kinds.rofl', 'facts/js-callgraph.rofl'];

// ---------------------------------------------------------------------------
// the model, with an optional textual mutation applied to the rules

/** A mutation names the file it applies to, because the rules it targets no
 *  longer all live in one pack: the value questions moved to
 *  rules/js-dataflow.rofl and the mutants aimed at them had to follow. */
type Mutation = { find: string; replace: string; file?: string };

interface Model {
  q: (lit: string) => string[][];
  n: (lit: string) => number;
  binds: (lit: string, ...vars: string[]) => string[];
}

/** query bindings come back quoted for strings and bare for atoms; the
 *  comparison is against V8 frame names, which are neither. */
const unq = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

/** The unmutated world, built once. The mutual fixpoint between `resolves` and
 *  `may_be_*` took world construction from about two seconds to fifteen, and
 *  every test here that asks for a baseline was paying it again — with mutants,
 *  a dozen times over. The mutated worlds are still built per test, because a
 *  mutation is the point; only the shared baseline is memoised, and it is
 *  queried and never written. */
let BASELINE: Model | undefined;

function build(mutations: Mutation[] = []): Model {
  if (mutations.length === 0) return (BASELINE ??= buildFresh([]));
  return buildFresh(mutations);
}

function buildFresh(mutations: Mutation[]): Model {
  const r = new Rofl();
  const load = (text: string, what: string) => {
    const res = r.load(text);
    assert.equal(res.ok, true, `${what} rejected:\n${res.diagnostics.join('\n')}`);
  };
  // ONE LOAD, NOT FOUR — and then ONE LOAD, NOT EIGHT, and then THE FACTS LAST.
  // The first version of this comment (2026-09-05) said: every `load`
  // re-evaluates, so loading the four rule packs separately paid for the cycle
  // three times over; concatenating them took world construction from ~17s to
  // ~9s. TRUE, AND IT STOPPED ONE STEP SHORT TWICE. Boot and the fact packs are
  // `load` calls too, and they were still separate; and the AST facts were
  // ASSERTED FIRST, so every one of those loads re-ran the fixpoint over the
  // whole corpus. Measured again 2026-09-07, on the control-flow world which
  // has the same shape:
  //
  //    nine loads, facts asserted first     16.9 s
  //    one load of the packs, facts first   12.3 s   (-27%)
  //    ONE load of everything, facts AFTER  10.0 s   (-41%)
  //
  // `r.evaluate()` at the end measured 0 ms in the first two, which is the tell:
  // the work had already been done, repeatedly. Fifteen relations compared
  // between the constructions came back byte-identical, with a positive control
  // that a changed store DOES compare unequal.
  const texts = [
    read(path.join(ROOT, 'boot.rofl')),
    ...FACT_FILES.map((f) => read(path.join(ROOT, f))),
    ...RULE_FILES.map((f) => {
      let text = read(path.join(ROOT, f));
      for (const m of mutations) {
        if ((m.file ?? 'rules/js-callgraph.rofl') !== f) continue;
        assert.ok(text.includes(m.find), `mutation anchor absent in ${f}: ${m.find}`);
        text = text.replace(m.find, m.replace);
      }
      return text;
    }),
  ];
  load(texts.join('\n'), 'boot + facts + rules');

  for (const f of ALL_FILES) {
    const s = scan(read(path.join(FIX, onDisk(f))), { file: f });
    const res = r.assert(s.facts.join('\n'));
    assert.equal(res.ok, true, `${f} facts rejected:\n${res.diagnostics.slice(0, 5).join('\n')}`);
  }
  r.evaluate(20_000_000);

  const q = (lit: string): string[][] => {
    const res = r.query(lit);
    assert.equal(res.error, undefined, `query ${lit}: ${res.error}`);
    assert.equal(res.partial, false, `query ${lit} hit a budget`);
    // A QUERY THAT NAMES NOTHING RETURNS THE SAME EMPTY ANSWER AS A QUERY THAT
    // FINDS NOTHING — so every `assert … 0` in this file was satisfiable by a
    // typo, a rename, or a literal at the wrong arity. `unpopulatable` is the
    // kernel separating the two (src/api.ts).
    assert.equal(res.unpopulatable, false, `query ${lit}: nothing in this world can populate it`);
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
      assert.equal(res.unpopulatable, false, `query ${lit}: nothing in this world can populate it`);
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
  // AWAITED since 2026-09-04: `main` became async when the corpus gained an
  // `await` site, and calling it without awaiting left everything after that
  // await unexecuted — the oracle then reported three edges missing that the
  // model has, and they looked like over-approximation.
  await alpha.main();
  beta.bmain();
  // the default export is an ENTRY POINT and nothing in beta.mjs calls it, so
  // the consumer is what makes it run — here, as in any importing module.
  beta.default(2);
  // V8 NAMES A GETTER'S FRAME `get broken`, not `broken` — the third place the
  // oracle's frame naming differs from the model's node naming, after
  // `%GeneratorPrototype%.next` and the synthesised constructor frame. It is
  // a fact about the INSTRUMENT, so it is normalised here rather than worked
  // around in a rule: the node is the same node, and a model that renamed its
  // functions to match a stack trace would be wrong about the program in
  // order to agree with the tool.
  //
  // ONE FUNCTION, BOTH OUTPUTS, since 2026-09-07 — and until then it was one
  // function and ONE output. `edges` was normalised and `measured` was handed
  // back raw, so the census compared its own `broken` against the oracle's
  // `get broken`, they never matched, and two getters were reported as
  // instrumented-and-permanently-silent. THE LEDGER THEN EXPLAINED THAT: three
  // findings say V8 attributes a getter's frame to the property access so the
  // oracle never sees a caller. Measured 2026-09-07, that is false — the
  // oracle records `useGauge -> get broken` and `useGauge -> get reading`, with
  // the enclosing function as the caller, exactly like any other call. The
  // limit of the instrument was a missing `.replace()` on one of two doors.
  const norm = (n: string) => n.replace(/^(get|set) /, '');
  const edges = new Set<string>();
  const list: OracleEdge[] = [];
  for (const e of t.oracle.edges()) {
    // frames whose caller file is not a fixture are the HARNESS calling
    // main()/bmain(), not an edge the fixture contains
    const base = path.basename(e.file);
    if (!RUN_FILES.includes(base)) continue;
    const callee = norm(e.callee);
    edges.add(`${e.caller} -> ${callee}`);
    list.push({ caller: e.caller, callee, line: e.line, file: base });
  }
  return {
    edges, list, raw: t.oracle.edges().length,
    measured: new Set([...t.oracle.measured() as Set<string>].map(norm)),
  };
}

/** the name a KEY stands for, which is `key_name[code]` in
 *  rules/js-structure.rofl written a fifth time — and the fifth place a
 *  computed key was invisible.
 *
 *  MEASURED 2026-09-07: `{ [Symbol.iterator]() {} }` has a `MemberExpression`
 *  where every other key has an `Identifier`, so `node.key?.name` is
 *  `undefined` and the census named the method `<anon>` while the runtime
 *  reported `iterator`. The census's own header says it must speak the same
 *  names as the runtime; a fourth reader of a key had the same blind spot as
 *  the three the model fixed, and this one is in the INSTRUMENT rather than in
 *  the rules, so no audit over the rules could ever have named it.
 *
 *  Guarded on `Symbol` for the reason the rule is: `obj[someVar]` has no
 *  static name and neither of us may invent one. */
function keyName(key: any): string | undefined {
  if (!key || typeof key !== 'object') return undefined;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'MemberExpression' && key.object?.name === 'Symbol') return key.property?.name;
  return undefined;
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
          : node.id?.name ?? keyName(node.key) ?? nameHint ?? '<anon>';
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
  // 3 -> 5 on 2026-09-07 with the scope fixtures: `useKeyA` and `useKeyB` each
  // write `two[keyPick]()` where `keyPick` is a local `const` holding a string,
  // so the KEY EXPRESSION is not a literal and the shape is dynamic — while the
  // value layer resolves both, which is the point of the pair. A shape counts
  // how the site is SPELLED; whether it resolves is a different table.
  // 5 -> 6 on 2026-09-07: `bin.nest[slotKey](n)` — the read side of the
  // computed write the alias arm was asked to reach.
  assert.equal(tally.get('s_computed_dynamic_key'), 6, 'six computed callees with a non-literal key');
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
  // TWO SITES RESOLVE TWO WAYS, and both are branches. This assertion read
  // `[]` until 2026-09-04, which was a fact about the CORPUS and not a
  // requirement: `(n > 0 ? boxA : boxB).pick(n)` and `(boxA || boxB).pick(n)`
  // are may-sets over two operands, so two answers is the rule doing exactly
  // what its own comment says — "a must-analysis would have to decide; this one
  // does not have to". Asserted by SHAPE rather than by node id, because the
  // ids carry a per-file hash and would pin the fixture's byte layout.
  const ambiguousShapes = [...new Set(m.binds('ambiguous_call[audit](C, F, G)', 'C')
    .flatMap((c) => m.binds(`shape[code](${c}, S)`, 'S')))].sort();
  assert.deepEqual(ambiguousShapes,
    ['s_identifier', 's_member_on_conditional', 's_member_on_logical'],
    'a site resolves two ways only through a branch or a loop variable');
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

test('TIER 3: an identifier callee that names a PARAMETER', () => {
  const m = build();
  const edges = modelEdges(m);

  // The hole this closes lives INSIDE a shape the model claims to handle, so
  // no shape census could show it: `f(n)` where `f` is a parameter is spelled
  // exactly like `f(n)` where `f` is a declaration. The execution oracle is
  // what found it — two of eleven under-reported edges — and it is the oracle
  // that says it is closed.
  for (const e of ['apply2 -> leaf', 'apply2 -> mid', 'applyFirst -> leaf', 'useCb -> mid']) {
    assert.ok(edges.has(e), `the parameter callee did not resolve: ${e}`);
  }

  // THE TWO EDGES A SLOPPIER VERSION INVENTS, asserted as absences because a
  // parameter analysis that is right about what it derives and wrong about
  // what it excludes is over-approximation wearing the shape of coverage.
  // `applyFirst` is handed `mid` and never calls it; `useCb` names its
  // parameter `f`, the same as apply2's, and is handed a different function.
  assert.ok(!edges.has('applyFirst -> mid'), 'a function passed is not a function called');
  assert.ok(!edges.has('useCb -> leaf'), 'two parameters named `f` are two different bindings');

  // the binding table itself: the value that reaches each parameter, which is
  // where this now lives — the call graph asks the dataflow layer instead of
  // keeping a binding table. TWO MORE since 2026-09-05, both slot 0 and both a
  // `.next(v)`: a generator's consumer is an ordinary call site, and only the
  // destination of the value is unusual.
  const bound = m.binds('passes_function[code](C, I, F, N)', 'I', 'N');
  assert.deepEqual([...new Set(bound)].sort(),
    // `0 -> neverSettle` joined 2026-09-07: `new Promise(neverSettle)` passes a
    // function to a HOST constructor, which is a higher-order fact whether or
    // not this model knows what `Promise` does with it — `passes_function`
    // records the passing and deliberately does not fold it into `calls`.
    ['0 -> leaf', '0 -> mid', '0 -> neverSettle', '0 -> pickedA', '0 -> pickedB',
     '1 -> mid']);

  // AND THE SHAPE IS STILL NOT FINISHED, which is why `shape_because` for
  // `s_identifier` is not stale: an identifier naming an IMPORT still does not
  // resolve, so the residue is smaller and not gone. A verdict that outlived
  // its cause would be caught by `shape_stale[audit]`, asserted empty above.
  assert.deepEqual(m.binds('shape_verdict[audit](s_identifier, V)', 'V'), ['has_residue']);
});

test('TIER 4: one question — what object does this expression denote?', () => {
  const m = build();
  const edges = modelEdges(m);

  // FIVE SPELLINGS, ONE RULE. Each of these was a separate shape with its own
  // `not_yet`, and none of them needed a resolution rule of its own once the
  // OBJECT half is answered by a relation instead of by a pattern.
  for (const [e, why] of [
    ['useNs -> hello', 'o.m() — an identifier bound to an object literal'],
    ['useDeep -> dig', 'a.b.c() — the recursion, at depth two'],
    ['both -> get', 'this.m() — inside a class method'],
    ['useClass -> both', 'inst.m() — an identifier bound to `new C()`'],
    ['useLit -> pick', "o['k']() — a computed key that is a literal"],
    ['useOpt -> hello', 'o?.m() — which needed no rule at all'],
  ] as [string, string][]) {
    assert.ok(edges.has(e), `${e} (${why})`);
  }

  // AND THE REFUSALS, which are the same rule declining rather than a special
  // case: `o[k]()` with a variable key reaches no `member_node_key` row, and a
  // receiver the five entries cannot answer reaches no `denotes` row.
  // `useDyn(n, k) { table[k](n) }` called once as `useDyn(1, 'pick')`: the key
  // is a PARAMETER, and the value reaches it by the same argument flow that
  // carries a function into a callback slot. Closed by w_df_function_forms.
  assert.ok(edges.has('useDyn -> pick'), 'a key that is a parameter, valued across the call');

  // THE TRAP NOW RESOLVES, AND RESOLVING IT IS THE CORRECT ANSWER.
  // `const pickA = "pickB"; two[pickA]()` runs pickB, and the model says
  // pickB — because the dataflow layer answers what `pickA` MAY BE rather than
  // what it is spelled. The trap was never about refusing the site; it was
  // about refusing to read the NAME as the key, and `useTrap -> pickA` is the
  // edge that must never appear.
  assert.ok(edges.has('useTrap -> pickB'), 'the value, not the name');
  assert.ok(!edges.has('useTrap -> pickA'), 'and never the name');
  // FOUR sites now, not two: the two branch receivers, plus the two for-of
  // loop variables, which are may-sets over what the iterable hands out.
  assert.equal(m.n('ambiguous_call[audit](C, F, G)'), 8,
    'four sites, each reported in both orderings of its pair');
});

test('argument position is content: which function is in which slot', () => {
  const m = build();
  const passed = [...new Set(m.binds('passes_function[code](C, I, F, N)', 'I', 'N'))].sort();
  // `mid` rides in slot 1 out of `apply2`/`applyFirst` and in slot 0 out of
  // `useCb`, so the index is NOT recoverable from the name. Before `useCb`
  // existed the two were in bijection here, and a model that carried only the
  // name would have produced the same table.
  // ...AND TWO MORE SINCE 2026-09-05, both in slot 0 and both a `.next(v)`:
  // `gs.next(pickedA)` and `gd.next(pickedB)` really do pass a function as the
  // first argument of a call. The generator protocol is an ordinary call site
  // on the consumer's side; what is unusual is only where the value GOES.
  assert.deepEqual(passed,
    ['0 -> leaf', '0 -> mid', '0 -> neverSettle', '0 -> pickedA', '0 -> pickedB', '1 -> mid'],
    'apply2(leaf, mid), applyFirst(leaf, mid), useCb(mid), and the two sends');
});

// ===========================================================================
// 6. THE FRONTIER IS TOTAL AND TYPED

test('every unresolved shape carries a typed verdict, and it type-checks', () => {
  const m = build();
  const residue = m.binds('unresolved_shape[audit](S)', 'S');
  // 8 -> 10 on 2026-09-05: `s_member_on_ident` and `s_member_on_new` each
  // gained one unresolved site, and the gain IS the fix. `Vat.poured()` and
  // `new Vat().tapped()` are TypeErrors that used to resolve; the receiver now
  // decides which half of a class it can see, so they resolve to nothing and
  // land in the frontier with `no_source_target` — the same atom `super()`
  // earned for a target the program does not contain.
  // 10 -> 9 on 2026-09-08: `s_computed_template_key` left the residue entirely
  // when the scanner's contract grew one property, and `shape_stale[audit]`
  // named its excuse the same run.
  assert.equal(residue.length, 9, `positive control: ${residue.length} shapes with a residue`);

  // THE TOTALITY ARITHMETIC, stated as an identity rather than as a count:
  // resolved sites + unresolved sites = all call sites. A frontier that
  // derives nothing satisfies every "is it explained" check trivially, and
  // only this identity notices that the sites went somewhere.
  const sites = m.n('call_site[code](C, F)');
  const resolved = m.n('resolved_call[code](C)');
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

  // TWO reasons are properties of the SUBJECT rather than of us, and the second
  // arrived 2026-09-04: `runtime_dependent` for a computed key that does not
  // exist until the program runs, and `no_source_target` for a `super()` whose
  // whole ancestor chain declares no constructor — the target is decided at
  // parse time and the language synthesises it, so there is no node to reach
  // and no rule that would produce one. Borrowing `runtime_dependent` for it
  // would have said something false about WHEN the answer exists.
  // TWO BECAME FOUR on 2026-09-05, and the two new ones carry the SAME atom for
  // the same reason: `Vat.poured()` and `new Vat().tapped()` name a function the
  // program does not contain. `super()` earned `no_source_target` for a target
  // the LANGUAGE synthesises; these earn it for a target that exists nowhere at
  // all. Both are "there is no node to reach", which is what the atom says, and
  // `not_yet` would have been a queue entry nobody can ever discharge.
  assert.deepEqual(m.binds('shape_irreducible[audit](S)', 'S'),
    ['s_computed_dynamic_key', 's_member_on_ident', 's_member_on_new', 's_super']);
  const ours = m.binds('shape_ours[audit](S)', 'S');
  assert.equal(ours.length + 4, residue.length, 'irreducible + ours partitions the residue');

  console.log('  frontier: ' + residue.length + ' shapes with a residue, 4 irreducible, '
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
    assert.equal(res.unpopulatable, false, `${lit}: nothing in this world can populate it`);
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
  // 26 -> 29 on 2026-09-05: `boolean_literal`, `class_declaration` and
  // `return_statement` now carry a call-graph verdict from THIS pack, so this
  // pack declares them. `orphan_claim[audit]` is what demanded it — the rows
  // were written where the verdict belongs and their kinds were declared in
  // the dataflow pack, so in this world they claimed cells that did not exist.
  // 34 -> 44 on 2026-09-07: the ten TypeScript type-node kinds, declared in
  // this pack rather than deferred.
  // 44 -> 50 on 2026-09-07: `import_specifier`, `export_named_declaration` and
  // the four unexercised import/export forms, declared in this pack because
  // their verdicts are.
  // +2 on 2026-09-08: `object_pattern` entered the vocabulary with
  // destructuring, and this world declares two layers.
  assert.equal(dKinds, 51, 'kinds the matrix did not know existed');
  const layers = dCells / dKinds;
  assert.ok(Number.isInteger(layers), 'every new kind opens one cell per layer');
  assert.equal(dCells, dKinds * layers, `${dKinds} kinds x ${layers} layers`);
  // the callgraph half is answered; the other layers' half is not, and that
  // is the debt this cell created rather than repaid
  assert.ok(dUnaccounted > 0, 'modelling one layer LEFT the matrix with more open cells, not fewer');
});

// ===========================================================================
// 7. THE ORACLE — both error directions, counted separately

// THE INSTRUMENT'S OWN NAMING RULE, GATED. `frameName` in trace.mjs turns what
// V8 puts on a CallSite into the name this model uses, and until 2026-09-07 it
// had no test at all — the rule was a comment claiming `V8 gives Box.get,
// Object.hello, new Box`, and a sweep of sixteen shapes found that this V8
// gives none of those. The same sweep caught the rule CORRUPTING a shape it had
// never seen: `[Symbol.iterator]` came out `iterator]`, because the last-dot
// rule ran on a bracketed key.
//
// WHAT IS PINNED HERE IS THE TRANSFORMATION AND NOT THE ENGINE, and the
// distinction is the reason this is a table of STRINGS rather than a fixture of
// call sites. The raw column is a measurement — identical on V8 12.4 and V8
// 14.0, re-swept the same day — and the arrow is ours. CI runs this suite under
// bun as well, where the raw names are JavaScriptCore's; a test that called the
// shapes for real would pin an engine and go red for being right.
test("the oracle's frame naming: what V8 spells, and what it becomes", async () => {
  const t: any = await import(path.join(FIX, 'trace.mjs'));
  const call = (raw: string | null) =>
    t.frameName({ getFunctionName: () => raw, getMethodName: () => null });
  const SWEEP: [string, string | null, string][] = [
    ['function / arrow / object method / class method / static', 'plainFn', 'plainFn'],
    ['async / generator / named or anonymous fn expression', 'theName', 'theName'],
    ['a bound function, which reports its target', 'plainFn', 'plainFn'],
    ['new Box(), and there is no `new ` prefix to strip', 'Box', 'Box'],
    ['a getter, whose accessor word the oracle normalises elsewhere', 'get acc', 'get acc'],
    ["a key that CONTAINS a dot, obj['a.b'] — the rule earns its keep", 'dotted.a.b', 'b'],
    ['a computed key, the shape the rule was corrupting', '[Symbol.iterator]', 'iterator'],
    ['an arrow passed to a host API, which V8 will not name', null, '<top>'],
  ];
  for (const [shape, raw, want] of SWEEP) assert.equal(call(raw), want, shape);
  // THE REGRESSION, STATED AS ITSELF rather than left implicit in the row
  // above: without the bracket strip the last-dot rule returns `iterator]`, a
  // name no model has and no assertion in this file would have questioned.
  assert.notEqual(call('[Symbol.iterator]'), 'iterator]');
  // `getMethodName` is a real fallback and is reached — V8 leaves
  // `getFunctionName` null on a frame it can only name through its receiver.
  assert.equal(t.frameName({ getFunctionName: () => null, getMethodName: () => 'hello' }), 'hello');
  // ...and a CallSite that throws is `<top>` rather than a crash. The try is
  // load-bearing on a frame the engine refuses to describe, and nothing else
  // here exercises it.
  assert.equal(t.frameName({
    getFunctionName: () => { throw new Error('no name'); },
    getMethodName: () => 'x',
  }), '<top>');
});

test('execution oracle: what ran, what the model derived, and the gap', async () => {
  const m = build();
  const model = modelEdges(m);
  const o = await runOracle(FIX);

  // POSITIVE CONTROL, first: an oracle that measured nothing is a fact about
  // the oracle. Both the raw frame count and the census must be non-trivial.
  assert.ok(o.raw >= 30, `oracle recorded ${o.raw} frames — did it run at all?`);
  // ...AND NO NAME IT REPORTS IS HALF-NORMALISED. The bracketed computed key
  // reached this instrument as `[Symbol.iterator]` and left it as `iterator]`
  // for as long as the last-dot rule was the whole rule, and every assertion in
  // this file would have gone on passing: a name nothing matches simply looks
  // like a function that never ran. This is the engine-independent half of the
  // naming rule — whatever V8 or JSC spells, what comes out of `frameName` is
  // an identifier, `<top>`, or an accessor word and an identifier.
  const halfNormalised = [...o.measured, ...o.list.map((e) => e.caller)]
    .filter((n) => /[[\].]/.test(n));
  assert.deepEqual([...new Set(halfNormalised)].sort(), [],
    'a frame name the normalisation did not finish');
  const { instrumented, silent } = census(FIX, RUN_FILES);
  assert.ok(instrumented.size >= 25, `census: only ${instrumented.size} instrumented functions`);
  assert.deepEqual([...silent].sort(), [], 'every fixture function can report');
  // `pickA` is the decoy of the computed-callee trap: `const pickA = "pickB"`
  // means `two[pickA]()` runs pickB and pickA never executes. It is the ONE
  // function that is instrumented and legitimately silent, and it is named
  // here rather than tolerated — if it ever reports, the trap has stopped
  // trapping, and if anything else falls silent, that goes red too.
  // TWO functions are instrumented and legitimately silent, and they are silent
  // for COMPLETELY DIFFERENT REASONS — which is the distinction the third layer
  // was added to make. `pickA` is a VALUE decoy: `const pickA = "pickB"` means
  // `two[pickA]()` runs pickB, and the model does not derive an edge to pickA
  // at all. `unreached` is a CONTROL decoy: the model DOES derive
  // `useGuard -> unreached`, correctly, and the program branches around it.
  // Listing them together as "expected exceptions" would lose exactly that.
  // THREE now, and the three are three different reasons — which is exactly the
  // distinction the layers were built to draw. `pickA` is a VALUE decoy: the
  // model never derives an edge to it, because `two[pickA]()` reads the value
  // and reaches `pickB`. `unreached` is a GUARD: the model derives the edge and
  // the program branches around it — `may_not_run[code]` covers it.
  // `after` is silent for a THIRD reason, and this comment named the wrong one
  // until 2026-09-06: it said abrupt transfer, owned by `w_cf_abrupt_transfer`.
  // That item closed, and the measurement that closed it found no statement
  // anywhere in this corpus sitting after an abrupt transfer in the same list.
  // `after` follows a CALL to `thrower`, which always throws — propagation
  // across a call edge, which no syntactic rule reaches, and w_exn_propagation
  // owns it.
  // FIVE now: `neverReached` and `neverCased` are the real abrupt witnesses,
  // written to close that item, and they ARE covered — `may_not_run[code]`
  // names both. They are silent-but-wired for the same reason `unreached` is,
  // and they are listed here because this assertion is about instrumentation,
  // not about explanation. Listing all five together would lose every
  // distinction; test/js-controlflow.test.ts asserts each by name.
  // SEVEN on 2026-09-06 with the reachability fixture: `sleeper` sits behind a
  // guard arm and `dormant` behind `sleeper`, so neither runs. They are the
  // chain w_cf_reachability was closed on — the LOCAL rule covers `sleeper` and
  // only the transitive one covers `dormant`, which is the whole content of
  // that item and is asserted by name in test/js-controlflow.test.ts.
  // EIGHT on 2026-09-06 with the exception fixtures: `unlit` follows `super(n)`
  // into a constructor that always throws. `after` is on this list for the same
  // reason it always was — and for the FIRST TIME the layer explains it.
  // ELEVEN on 2026-09-06 with the accessor fixture, and the comment that stood
  // here was WRONG for a day. It said `broken` and `reading` are GETTERS, so V8
  // attributes their frames to the property access and the oracle never sees a
  // caller — the same limit of the instrument the generator frames have.
  //
  // MEASURED 2026-09-07 AND IT IS NOTHING OF THE KIND. The oracle records
  // `useGauge -> get broken` and `useGauge -> get reading`, with the enclosing
  // function as the caller, exactly like any other call. They looked silent
  // because `runOracle` normalised the `get ` prefix off the EDGES and handed
  // `measured` back raw, so this census compared its own `broken` against the
  // oracle's `get broken`. One function, two doors, `.replace()` on one of
  // them. THE LEDGER HAD THEN EXPLAINED THE ARTEFACT: a recorded finding
  // generalises getters, generators and `await` into `a call the HOST makes on
  // the program's behalf has no caller in the program`, and one of its three
  // instances was a missing string operation. The generator frame is real —
  // V8 names the caller `next` — and `await` is real and different again; the
  // getter was never an instance of anything.
  //
  // `unreadable` is the real silence in that fixture: `void gauge.broken`
  // throws before it can report.
  // THIRTEEN on 2026-09-06 with the propagation fixtures. `boom` is RETURNED
  // rather than called — the shape the transitive walk needed to be tested
  // against — and `lateThrow` is silent because `boom` is. Both are wired and
  // both stay silent for a reason no guard explains, which `may_not_be_reached`
  // now covers and `may_not_run` does not.
  // THIRTEEN -> ELEVEN on 2026-09-07: `broken` and `reading` were never on this
  // list on merit — see above.
  // ELEVEN -> TWELVE the same day, and the new one is a fourteenth REASON
  // rather than another instance of an old one. `afterStall` is called after
  // `await unsettled`, a promise nothing ever resolves, so the suspension never
  // resumes and the statement after it never executes. It is not a guard, not
  // an abrupt transfer, and not a value decoy — it is the code after a
  // suspension, which this layer waived until the day this name appeared, and
  // `may_not_run[code]` covers it now.
  const NEVER_CALLED = ['after', 'afterStall', 'boom', 'dormant', 'lateThrow',
                        'neverCased', 'neverReached', 'pickA',
                        'sleeper', 'unlit', 'unreached', 'unreadable'];
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
  // `new Box(1)` WAS the standing example of a miss no callee shape could
  // carry, because it is not a CallExpression at all. It is derived now, and
  // the assertion is inverted rather than deleted: the edge the oracle sees is
  // the edge the model has, and it is reached through a value question — which
  // class does this expression construct — not through a shape.
  assert.ok(!missed.some((e) => e.endsWith('-> Box')), 'the constructor edge is no longer missed');
  assert.ok(model.has('useClass -> Box'), 'and the model really does derive it');
  assert.equal(missed.length, 0, 'every edge the runtime took is derived');

  // OVER-APPROXIMATION IS NAMED, not bounded. A count tolerates whatever fits
  // under it; a list says which edge and why, and goes red when a different one
  // appears. The one entry is MEASURED rather than argued: V8 attributes a
  // generator body's first resume to the built-in `%GeneratorPrototype%.next`,
  // so `for (const x of pick())` produces the oracle edge `next -> pick` and
  // never `useForOfGen -> pick`. The model's edge is right about the SOURCE and
  // the oracle's is right about the FRAMES; they name different things, and the
  // difference is the oracle's naming rather than a rule's mistake.
  // TWO ENTRIES, TWO CAUSES, and the list is what keeps them apart. The first
  // is the oracle's naming: V8 attributes a generator body's first resume to
  // `%GeneratorPrototype%.next`, so the oracle edge is `next -> pick`. The
  // second is CONTROL FLOW: the model derives `useGuard -> unreached` correctly
  // and the program branches around it — `may_not_run[code]` in
  // rules/js-controlflow.rofl names `unreached` for exactly this reason, and
  // test/js-controlflow.test.ts asserts that every silent callee is covered.
  // Under a bound these two would have been one number.
  // THREE ENTRIES, THREE CAUSES, and the list is the only thing keeping them
  // apart. `useForOfGen -> pick` is the ORACLE's naming: V8 attributes a
  // generator body's first resume to `%GeneratorPrototype%.next`. `useGuard ->
  // unreached` is a GUARD the program does not take, and `may_not_run[code]`
  // covers it. `useTry -> after` is an ABRUPT transfer — a `throw` earlier in
  // the same block — and it is the control-flow layer's declared gap, owned by
  // `w_cf_abrupt_transfer`. Under the old `extra.length <= 2` bound the third
  // would simply have pushed the number to three and nobody would have been
  // asked which one it was.
  // THREE BECAME SIX on 2026-09-05, and all three new ones share a cause that
  // was already on this list: V8 attributes a generator body's first resume to
  // `%GeneratorPrototype%.next`, so the oracle's caller is `next` and never the
  // enclosing function. FOUR of the six are now that one limit of the
  // instrument — `useForOfGen -> pick`, `useSent -> chooser`,
  // `useDelegated -> outerGen`, `outerGen -> innerGen` — and no rule can close
  // any of them. The other two are control flow: a guard not taken, and an
  // abrupt transfer. A COUNT would have said "6" and asked nobody which.
  // SEVEN BECAME NINE on 2026-09-06, and BOTH new ones are the point of the
  // fixture that added them rather than a regression: `useAbrupt ->
  // neverReached` and `useCased -> neverCased` are edges the model derives from
  // syntax and the runtime never takes, because the callee sits after a
  // `return` in the same statement list. They belong with `useGuard ->
  // unreached` — control flow the model over-approximates ON PURPOSE — and
  // `may_not_run[code]` now names both, which test/js-controlflow.test.ts
  // asserts by name. AND ONE ENTRY ON THIS LIST CHANGED OWNER WITHOUT MOVING:
  // `useTry -> after` was attributed to `w_cf_abrupt_transfer` above; that item
  // closed and this edge stayed, because `after` follows a CALL that always
  // throws, not a statement. It is w_exn_propagation's, and only closing the
  // other item made the difference measurable.
  // NINE BECAME ELEVEN the same day, and the two new ones are ONE CHAIN rather
  // than two facts: `useDormant -> sleeper` is a guard the program does not take,
  // and `sleeper -> dormant` is the edge behind it — unguarded, correctly
  // derived, and never taken because its caller never runs. That second entry
  // is the whole reason w_cf_reachability exists; `may_not_run` cannot explain
  // it and `may_not_be_reached` can. FIVE of the eleven are now control flow the
  // model over-approximates on purpose, four are the V8 generator-frame limit,
  // one is exception propagation, and one is `useTry -> after`. A count would
  // have said "11".
  // TWELVE on 2026-09-06, and the new one is the exception fixture's own point:
  // `Lit -> unlit` is derived from syntax, and the runtime never takes it
  // because `super(n)` enters a constructor that always throws. It joins the
  // control-flow half of this list, which `may_not_run` now explains.
  // THIRTEEN on 2026-09-06 with the accessor fixture, and the new one is that
  // item's own point: `useGauge -> unreadable` is derived and never taken,
  // because the getter read on the line before it throws. It is the third
  // control-flow entry whose cause is an EXIT rather than a branch.
  // FOURTEEN on 2026-09-06, and the new one is the propagation fixture's point:
  // `boom -> lateThrow` is derived from syntax and never taken, because `boom`
  // is RETURNED rather than called. It is the first entry on this list whose
  // cause is neither a guard nor an exit but plain unreachability, and
  // `may_not_be_reached` is the only relation that explains it.
  assert.deepEqual(extra, [
    'Lit -> unlit', 'boom -> lateThrow',
    'outerGen -> innerGen', 'sleeper -> dormant',
    'useAbrupt -> neverReached', 'useCased -> neverCased',
    'useDelegated -> outerGen', 'useDormant -> sleeper', 'useForOfGen -> pick',
    'useGauge -> unreadable',
    'useGuard -> unreached', 'useSent -> chooser',
    // A FIFTEENTH CAUSE, 2026-09-07, and it is a new one rather than another
    // instance: `useStall` awaits a promise nothing resolves, so the call to
    // `afterStall` is WRITTEN, correctly derived, and never taken. Not a guard,
    // not an abrupt transfer, not the instrument's naming — the suspension
    // simply never resumes, and `may_not_run[code]` says so since this layer
    // stopped waiving `suspend`.
    'useStall -> afterStall', 'useTry -> after',
    'useYieldCallee -> callsSent',
  ], `over-approximation, by cause: ${extra.join(', ')}`);
  // FIVE OF THE SEVEN are one limit of the INSTRUMENT rather than of the model:
  // V8 names `%GeneratorPrototype%.next` as the caller of a generator body's
  // first resume, so the oracle's caller is `next` and never the enclosing
  // function. No rule can close any of them, and the list is what keeps that
  // distinguishable from the two that are control flow.
  const generatorFrame = extra.filter((e) => /-> (pick|chooser|outerGen|innerGen|callsSent)$/.test(e));
  assert.equal(generatorFrame.length, 5, `the oracle's frame limit: ${generatorFrame.join(', ')}`);
});

// ===========================================================================
// 8. THE MUTANT SET — one mutant is liveness, a set is coverage

interface Probe {
  edges: Set<string>; residue: number; shapes: number; ambiguous: number;
  // `bindings: number` LEFT WITH `param_bind`. That relation moved into
  // rules/js-dataflow.rofl and then out of existence entirely when the value
  // layer absorbed it; this field went on querying the dead name in all
  // twenty-six probes and no assertion ever read it. Found by `unpopulatable`
  // (src/api.ts) on 2026-09-07, which is the first thing here that could see it.
  passed: string[];
}
function probe(mutations: Mutation[]): Probe {
  const m = build(mutations);
  return {
    edges: modelEdges(m),
    residue: m.n('unresolved_call[code](C, S)'),
    shapes: m.n('shape[code](C, S)'),
    ambiguous: m.n('ambiguous_call[audit](C, F, G)'),
    passed: [...new Set(m.binds('passes_function[code](C, I, F, N)', 'I', 'N'))].sort(),
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

test('mutant 2 — read the computed key as a NAME: the trap springs', () => {
  // RE-AIMED. The computed/static distinction lives in `selects` now, not in
  // the call graph: `o.pick` and `o[k]` differ only in where the text is, so
  // one relation answers both. Reading the computed branch's property by NAME
  // instead of by VALUE is exactly the mistake the fixture's trap exists for.
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: "selects[flow](N, Key)       :- member_node_v[flow](N), ast_attr[code](N, computed, true),\n"
        + "                               ast_child[code](N, property, 0, P), may_be_lit[flow](P, Key).",
    replace: "selects[flow](N, Key)       :- member_node_v[flow](N), ast_attr[code](N, computed, true),\n"
        + "                               ast_child[code](N, property, 0, P), ast_name[code](P, Key).",
  }]);
  assert.ok(mut.edges.has('useTrap -> pickA'), 'the mutant invents an edge no execution can produce');
  assert.ok(!base.edges.has('useTrap -> pickA'), 'the baseline reads the VALUE and refuses');
  assert.ok(base.edges.has('useTrap -> pickB'), 'and gets the right one');
  console.log(`  KILLED: edges ${base.edges.size} -> ${mut.edges.size}`);
});

test('mutant 3 — forget which file a function was declared in', () => {
  // RE-AIMED to the dataflow entry that reaches a function declaration by name.
  // Two files define `run`; without the File column both answer every call.
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    // RE-AIMED AGAIN 2026-09-05 when the body was reordered for cost. The
    // planted defect is the same one — drop the File column so a name reaches
    // a declaration in ANY file — only the surviving literal moved.
    // THE ANCHOR MUST NAME THE WHOLE RULE. `ident_in` now appears in five
    // bodies and `String.replace` with a STRING argument replaces the FIRST
    // occurrence — the pitfall already recorded in this repository, which
    // planted the defect in the binder rule and left this one untouched. The
    // mutant read GREEN, which is the direction that gets believed.
    find: 'may_be_node[flow](E, F) :- ast_node[code](F, function_declaration, File, _),\n'
        + '                           ast_child[code](F, id, 0, I), ast_name[code](I, Name),\n'
        + '                           ident_in[code](E, Name, File).',
    replace: 'may_be_node[flow](E, F) :- ast_node[code](F, function_declaration, _, _),\n'
        + '                           ast_child[code](F, id, 0, I), ast_name[code](I, Name),\n'
        + '                           ident_in[code](E, Name, _).',
  }]);
  assert.equal(base.ambiguous, 8, 'baseline: the branch receivers and the loop variables');
  assert.ok(mut.ambiguous > 8, `mutant resolves ${mut.ambiguous} sites two ways`);
  console.log(`  KILLED: ambiguous resolutions 8 -> ${mut.ambiguous}`);
});

test('mutant 4 — drop the argument index: which value lands in which slot', () => {
  // RE-AIMED to the value flow across a call. The index is the content:
  // argument 0 and argument 1 are different facts about the program.
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'may_be_node[flow](U, N) :- resolves[code](C, F), arg_at[flow](C, I, A), may_be_node[flow](A, N),\n'
        + '                           param_of[flow](F, I, Name), param_use[flow](F, Name, U).',
    replace: 'may_be_node[flow](U, N) :- resolves[code](C, F), arg_at[flow](C, _, A), may_be_node[flow](A, N),\n'
        + '                           param_of[flow](F, _, Name), param_use[flow](F, Name, U).',
  }]);
  assert.ok(!base.edges.has('applyFirst -> mid'), 'baseline: a function passed is not a function called');
  assert.ok(mut.edges.has('applyFirst -> mid'), 'the mutant calls the function in the other slot');
  assert.ok(mut.ambiguous > base.ambiguous, 'and parameter sites resolve many ways');
  console.log(`  KILLED: ambiguous ${base.ambiguous} -> ${mut.ambiguous}, edges ${base.edges.size} -> ${mut.edges.size}`);
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
  // 50 today: the number FALLS as the model resolves more, so it is pinned
  // rather than bounded — a threshold would quietly stop meaning anything.
  // 86 -> 97: the generator-protocol fixture added two consumers, two
  // generators and two callees.
  // 101 -> 105 on 2026-09-06: the abrupt-transfer fixture added four functions,
  // each with a `trace()` call and each called once.
  // 105 -> 110 the same day: the reachability fixture added three more in
  // alpha.mjs and two in beta.mjs, on the same pattern.
  // 110 -> 127: the exception fixtures — thirteen functions across both halves,
  // each with its `trace()` call.
  // 127 -> 133: the accessor fixtures, on the same pattern.
  // 133 -> 131 the same day: two accessor READS became resolved sites when the
  // control-flow pack joined this world, so the frontier is two smaller without
  // the corpus changing. A number that falls because the model got better.
  // 131 -> 137 on 2026-09-06: the propagation fixtures, seven functions.
  // 137 -> 138 -> 153 on 2026-09-07: the binder fixture added one site and the
  // scope-and-`this` fixture fifteen — seven functions and an object literal
  // with three methods, each carrying its `trace()`.
  // 153 -> 160 on 2026-09-07: the alias fixture — six functions and three
  // objects, each function carrying its `trace()`.
  // 160 -> 162: `crossed` and `bcross` and their `trace()` calls, less the one
  // site that now RESOLVES across the file boundary.
  // 162 -> 164: `adefault` and `bviaNs` and their `trace()` calls, less the two
  // sites the namespace and default bindings now resolve.
  // 164 -> 168 on 2026-09-07: the re-export fixtures — `twin` twice, `bviaTwin`
  // and `bviaStar`, each with its `trace()` call, less the sites the re-export
  // binding now resolves.
  // 168 -> 171 the same day: the tagged-template fixtures — `mark` twice,
  // `stamped`, `useTag` and `bTag` with their `trace()` calls, less the sites
  // the tag arm now resolves.
  // 172 -> 175 the same day with the SUSPENSION fixture: `neverSettle`,
  // `afterStall` and `useStall` bring three `trace()` calls, and the call from
  // `main` and the call to `afterStall` both resolve. `new Promise(...)` is a
  // transfer site rather than a call site, so it is not on this count at all.
  // 171 -> 172 the same day with the ITERATOR PROTOCOL, and it is the smallest
  // move the frontier has made for a fixture: `bump`, the `[Symbol.iterator]`
  // method, `useIterable` and shapes.ts's `onIterObject` bring four `trace()`
  // calls and a call from `main`, and all five RESOLVE — an imported name and a
  // declared function. What is left over is the one site inside `useIterable`
  // that the loop body adds. The protocol's own two calls are not call sites at
  // all, which is the entire reason the item exists.
  // 175 -> 176 on 2026-09-08: the template-key fixtures add three `trace()`
  // calls and two calls that RESOLVE, plus `escaped`, which is a value and no
  // call at all — one site over, and the template key itself is not a call site
  // but the member around it is.
  // 176 -> 178 on 2026-09-08: `useBoundArr` and its `trace()`, plus the
  // `.join` and `.length` chain on a bound array — the site that makes the
  // value arm of `prototype_of` load-bearing.
  // +2 on 2026-09-08: `object_pattern` entered the vocabulary with
  // destructuring, and this world declares two layers.
  //
  // CONVERTED TO AN IDENTITY 2026-09-08 (w_export_specifier_forms), and the
  // twenty lines of arithmetic above are the argument for converting it: this
  // is `f_a_pin_that_moves_with_the_corpus_is_measuring_the_corpus` with a
  // fourteen-entry changelog attached, and every entry is a fixture rather than
  // a change to the model. What the mutant DAMAGES is exact and needs no
  // number: the sites that stop being accounted for are precisely the ones the
  // baseline had on its frontier, because the mutation empties `unresolved_call`
  // and touches nothing else. The baseline residue is the positive control four
  // lines above, so an identity between two zeros cannot pass unnoticed.
  // ...AND `sites - resolved` WAS NEVER THE NUMBER THIS MEANT TO PIN. Measured
  // while converting it: base `call_site` 397, `shape` 397, `resolved_site`
  // 213, `unresolved_call` 195 — and 397 - 213 = 184, which is neither. The
  // difference is ELEVEN TRANSFER SITES: `resolved_site` counts a `new` and a
  // tagged template, `call_site` and `shape` do not, so the subtraction mixed
  // two populations and its fourteen-entry changelog above was tracking a
  // corpus through a quantity nothing else in the model uses.
  //
  // WHAT THE MUTATION ACTUALLY DAMAGES, stated as a set: a shaped site with NO
  // verdict at all — neither resolved nor on the frontier. That is zero in the
  // baseline by the totality the frontier exists to keep, and under the mutant
  // it is exactly the baseline's frontier, because the mutation empties
  // `unresolved_call` and touches no rule that decides resolution.
  const orphaned = (w: Model): number => {
    const res = new Set(w.binds('resolved_site[code](C)', 'C'));
    const front = new Set(w.binds('unresolved_call[code](C, S)', 'C'));
    return new Set(w.binds('shape[code](C, S)', 'C')).size
      - [...new Set(w.binds('shape[code](C, S)', 'C'))].filter((c) => res.has(c) || front.has(c)).length;
  };
  const baseline = build([]);
  const baseFrontier = new Set(baseline.binds('unresolved_call[code](C, S)', 'C')).size;
  assert.equal(orphaned(baseline), 0,
    'positive control: the baseline accounts for every shaped site, so the identity below is not two zeros');
  assert.ok(baseFrontier > 30, `positive control: the baseline frontier is ${baseFrontier}`);
  assert.equal(orphaned(mut), baseFrontier,
    `${orphaned(mut)} shaped sites fell out of the bottom, and the baseline frontier held ${baseFrontier}`);
  // an empty frontier is not success: the shapes still exist and the sites
  // still do not resolve. `shape_stale` is what says so — every verdict now
  // stands over a shape the model claims is finished.
  const stale = mut.binds('shape_stale[audit](S)', 'S');
  // Every shape whose excuse this mutant strands is a shape that still HAS one.
  // The number moves in BOTH directions and is pinned rather than bounded: it
  // falls as the model closes cells and retires their excuses, and it rises
  // when a split gives a residue a row of its own — 7 -> 9 when
  // `s_member_on_await` and `s_member_on_template` came out of the catch-all,
  // then 9 -> 8 when `await` turned transparent and retired the first of them.
  // 8 -> 10 when the receiver split gave `s_member_on_ident` and
  // `s_member_on_new` a residue of their own, and a reason with it.
  assert.equal(stale.length, 9, `the stale-verdict audit fires on ${stale.length} shapes`);
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
  // RE-AIMED 2026-09-04. The subject moved: a transfer site that RESOLVES is
  // no longer frontier, so the baseline has nothing to attribute at the
  // constructor site — it has an edge instead. What the mutant destroys now is
  // the EDGE, and the oracle sees the loss directly.
  const ctor = o.list.find((e) => e.callee === 'Box');
  assert.ok(ctor, 'positive control: the oracle saw the constructor edge');
  const key = `${ctor!.file}:${ctor!.line}`;
  assert.deepEqual(base.get(key), undefined, 'the baseline resolves it, so it is not frontier');
  assert.ok(modelEdges(build()).has('useClass -> Box'), 'the baseline derives the edge');
  assert.ok(!modelEdges(build([{
    find: 'transfer_kind(new_expression).',
    replace: 'transfer_kind(no_such_kind).',
  }])).has('useClass -> Box'), 'and the mutant loses it');
  assert.deepEqual(blind.get(key), undefined, 'the mutant has nothing at that site either');
  // and the damage is LOCAL — stated 2026-09-07 as a DIFFERENCE rather than as
  // a zero, and the change is a correction rather than a re-pin. The absolute
  // said `no oracle edge outside the constructor sits on a frontier line in the
  // blinded world`, which was 0 only for as long as no frontier line happened
  // to be a line V8 also reports a call on. The FOR-OF ended that in the
  // BASELINE and not in the mutant: `for (const x of [..])` and
  // `for (const x of pick())` are transfer sites whose `[Symbol.iterator]` is a
  // BUILT-IN, so they resolve to nothing and correctly say so, and both calls
  // in each loop body are reported by V8 at the loop's own line. Those four are
  // attributed with the mutation and without it.
  //
  // The claim that mutant 7 is actually making is that the blinded world
  // attributes nothing the baseline does not, and that was never what an
  // equality against zero measured. Named rather than counted, for the reason
  // the over-approximation list above is named: a number tolerates whatever
  // fits under it.
  const attributed = (f: Map<string, string[]>) => [...new Set(o.list
    .filter((e) => e.callee !== 'Box' && f.has(`${e.file}:${e.line}`))
    .map((e) => `${e.caller} -> ${e.callee} @ ${e.file}:${e.line}`))].sort();
  const pair = (x: string) => x.split(' @ ')[0];
  const at = (x: string) => x.split(' @ ')[1];
  // FOUR OF THEM IN BOTH WORLDS, and they are the two OTHER for-of loops:
  // `for (const x of [..])` and `for (const x of pick())` are transfer sites
  // whose `[Symbol.iterator]` is a BUILT-IN, so they resolve to nothing and
  // correctly say so, and V8 reports both calls in each loop body at the loop's
  // own line. Written as pairs plus the item declared at the line, because the
  // LINE moves whenever anything above it in the fixture does.
  assert.deepEqual(attributed(blind).map(pair), [
    'useForOfArray -> alef', 'useForOfArray -> bet',
    'useForOfGen -> alef', 'useForOfGen -> bet',
  ], 'the two for-of loops whose iterable is a built-in, and nothing else');
  assert.deepEqual([...new Set(attributed(blind).map((x) => blind.get(at(x))?.join()))],
    ['for_of_statement'], 'and each is attributed to the loop rather than to a call');
  assert.deepEqual(attributed(blind).filter((x) => !attributed(base).includes(x)), [],
    'the mutant attributes nothing the baseline does not');

  // ...AND IT ATTRIBUTES ONE THING LESS, which is the sentence in this test's
  // own name and was NOT what the old `stillOk === 0` measured. Un-declaring
  // the kind does not merely lose the constructor edge: it removes the model's
  // ability to SAY a transfer happened at all, so a `new` whose site does NOT
  // resolve stops being frontier too. That site is where `useMethodOnInstance`
  // calls a method on a fresh instance — the baseline declares
  // `new_expression` at the line and the blinded world declares nothing, which
  // is the gate going blind rather than going wrong.
  const wentBlind = attributed(base).filter((x) => !attributed(blind).includes(x));
  assert.deepEqual(wentBlind.map(pair), ['useMethodOnInstance -> poured']);
  assert.deepEqual(wentBlind.map((x) => base.get(at(x))), [['new_expression']]);
  assert.deepEqual(wentBlind.map((x) => blind.get(at(x))), [undefined],
    'the line the baseline could explain, the mutant cannot');
  console.log('  KILLED: the new-expression site loses its edge AND its verdict, while '
    + `${attributed(blind).length} for-of attributions are untouched`);
});


// ---------------------------------------------------------------------------
// TIER 3's OWN MUTANTS. The first three were written by asking where the
// oracle is structurally UNABLE to look, and against the fixture as it stood
// they proved the answer was "at all of this": `apply2(leaf, mid)` calls both
// of its function parameters, so the edge set is identical whether the model
// carries the argument index, ignores it, or binds every parameter of every
// function to every function passed anywhere. Three of four survived, and the
// remedy was the FIXTURE rather than the assertions — `applyFirst`, which is
// handed `mid` and never calls it, and `useCb`, whose parameter shares a name
// with apply2's and is handed a different function. Both defects now cost an
// edge the runtime never ran, which is the one thing the oracle can see.

test('mutant 8 — sever the cycle: bind parameters without asking who is called', () => {
  // RE-AIMED TWICE, and the second time named the WALL instead of guessing at
  // it. Without `resolves` in the body, every function's parameters take every
  // value passed at that index anywhere in the corpus.
  //
  // 2026-09-05: the assertion changed shape from `invents edges` to `does not
  // finish`, because on the larger corpus the mutant stopped terminating.
  // 2026-09-07: it changed back — `r.load()` was evaluating under a DEFAULTED
  // budget, and under a stated one the mutant terminated and invented eight
  // edges by name. The note recorded the lesson: a budget was being read as a
  // property of the corpus.
  // 2026-09-08: the corpus grew four fixtures and it stopped terminating again,
  // and the same lesson had a second floor under it. `evaluate` was raised from
  // 20 M to 60 M to 400 M and the world came back partial in 2.9 s EVERY TIME,
  // with zero rows; the query budget was raised to 1.5 B and nothing moved at
  // 0.0 s. It is not steps. ASKED THE KERNEL RATHER THAN THE BUDGET, and it
  // answers by name: `hole(Q, space_exhausted)` — the ROW wall, the second
  // budget added so that an evaluation running out of MEMORY says so instead of
  // being killed.
  //
  // That is the sharpest statement this mutant has ever made. An
  // over-approximation that binds every parameter to every argument does not
  // merely invent edges or merely take longer: it stops fitting, and the kernel
  // has a word for that. The baseline emits NO hole at all, which is the
  // control that keeps `space_exhausted` from being a property of the corpus.
  //
  // IT BUILDS ITS OWN WORLD, and that is not duplication for its own sake: the
  // shared builder asserts `partial === false` on every query, which is right
  // for every other test here and is exactly what this one is about.
  const worldOf = (mutate: boolean): Rofl => {
    const r = new Rofl();
    const texts = [
      read(path.join(ROOT, 'boot.rofl')),
      ...FACT_FILES.map((f) => read(path.join(ROOT, f))),
      ...RULE_FILES.map((f) => {
        const text = read(path.join(ROOT, f));
        return mutate && f === 'rules/js-dataflow.rofl'
          ? text.replace('may_be_node[flow](U, N) :- resolves[code](C, F), arg_at[flow](C, I, A),',
                         'may_be_node[flow](U, N) :- fn_node_v[flow](F), arg_at[flow](C, I, A),')
          : text;
      }),
    ];
    assert.equal(r.load(texts.join('\n')).ok, true);
    for (const f of ALL_FILES) {
      assert.equal(r.assert(scan(read(path.join(FIX, onDisk(f))), { file: f }).facts.join('\n')).ok, true);
    }
    r.evaluate(20_000_000);
    return r;
  };
  const holes = (r: Rofl): string[] =>
    [...new Set(r.query('hole(Q, R)').rows.map((row) => row.bindings['R']))].sort();

  const base = worldOf(false);
  assert.deepEqual(holes(base), [], 'positive control: the honest tree fits, and emits no hole');
  assert.equal(base.query('calls_in[code](File, A, B)').partial, false);

  const mut = worldOf(true);
  assert.deepEqual(holes(mut), ['budget_exhausted', 'space_exhausted'],
    'the severed cycle runs out of ROWS, and the kernel says which wall by name');
  assert.equal(mut.query('calls_in[code](File, A, B)').partial, true,
    'and every answer out of that world is marked partial');
  console.log('  KILLED: the severed cycle stops FITTING — hole(space_exhausted)');
});

test('mutant 9 — a parameter read from anywhere, not from inside its function', () => {
  const base = probe([]);
  // THE KILL GOT LOUDER ON 2026-09-05, like mutant 8's — and on 2026-09-07 it
  // turned out both had gone QUIETER. "Does not finish" was `r.load()`'s default
  // budget running out, not the program diverging; under a stated budget this
  // mutant terminates and the edges it invents can be named, which is the
  // sharper claim. See mutant 8 for the measurement.
  assert.ok(!base.edges.has('useCb -> leaf'), 'baseline: two parameters named `f` stay two');
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    // RE-AIMED 2026-09-05 with the cost reordering: `ast_within` moved ahead of
    // `ident`, and dropping it is still exactly the defect — a parameter read
    // from anywhere instead of from inside its own function.
    find: 'param_use[flow](F, Name, U) :- param_of[flow](F, _, Name),\n'
        + '                               ast_within[code](F, U),\n'
        + '                               ident[code](U, Name).',
    replace: 'param_use[flow](F, Name, U) :- param_of[flow](F, _, Name),\n'
        + '                               ident[code](U, Name).',
  }]);
  assert.ok(mut.edges.has('useCb -> leaf'),
    'a parameter read from anywhere merges two parameters that share a name');
  console.log(`  KILLED: the unscoped parameter read invents `
    + `${[...mut.edges].filter((e) => !base.edges.has(e)).length} edges`
    + ` (baseline ${base.edges.size})`);
});

test('mutant 10 — delete the value flow across a call', () => {
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'may_be_node[flow](U, N) :- resolves[code](C, F), arg_at[flow](C, I, A), may_be_node[flow](A, N),',
    replace: 'may_be_node_unused[flow](U, N) :- resolves[code](C, F), arg_at[flow](C, I, A), may_be_node[flow](A, N),',
  }]);
  const lost = [...base.edges].filter((e) => !mut.edges.has(e)).sort();
  assert.deepEqual(lost, ['apply2 -> leaf', 'apply2 -> mid', 'applyFirst -> leaf', 'useCb -> mid'],
    'exactly the callback edges, and nothing else');
  console.log(`  KILLED (liveness): ${lost.length} edges lost`);
});

test('mutant 11 — a computed key stops being a key at all', () => {
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: "selects[flow](N, Key)       :- member_node_v[flow](N), ast_attr[code](N, computed, true),\n"
        + "                               ast_child[code](N, property, 0, P), may_be_lit[flow](P, Key).",
    replace: '',
  }]);
  assert.ok(base.edges.has('useLit -> pick'));
  assert.ok(!mut.edges.has('useLit -> pick'), "o['pick']() is o.pick() and the mutant forgets it");
  assert.ok(!mut.edges.has('useTrap -> pickB'), 'and the const-key case goes with it — one rule, both');
  console.log(`  KILLED: edges ${base.edges.size} -> ${mut.edges.size}`);
});

test('mutant 12 — drop the recursion: a.b.c() loses its middle', () => {
  const base = probe([]);
  // THREE ENTRIES, NOT ONE, since the lookup split by receiver role on
  // 2026-09-05: the head is identical in all three rules and `String.replace`
  // with a STRING argument replaces the FIRST occurrence — the pitfall this
  // repository has now paid for three times. Applying it three times renames
  // them one at a time, and the anchor assertion holds until all three are gone.
  const kill = {
    file: 'rules/js-dataflow.rofl',
    find: 'may_be_node[flow](N, V2) :- member_node_v[flow](N), ast_child[code](N, object, 0, O),',
    replace: 'may_be_node_unused[flow](N, V2) :- member_node_v[flow](N), ast_child[code](N, object, 0, O),',
  };
  const mut = probe([kill, kill, kill]);
  assert.ok(base.edges.has('useDeep -> dig'));
  assert.ok(!mut.edges.has('useDeep -> dig'), 'depth two needs the relation to call itself');
  console.log(`  KILLED: edges ${base.edges.size} -> ${mut.edges.size}`);
});

test('mutant 13 — a class is not an object: drop the class-method lookup', () => {
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'member_value[flow](CD, Key, M) :- obj_like[flow](CD), ast_child[code](CD, body, 0, B),',
    replace: 'member_value_unused[flow](CD, Key, M) :- obj_like[flow](CD), ast_child[code](CD, body, 0, B),',
  }]);
  const lost = [...base.edges].filter((e) => !mut.edges.has(e)).sort();
  assert.ok(lost.includes('both -> get'), 'every edge through a class method goes');
  assert.ok(lost.includes('useClass -> both'));
  console.log(`  KILLED: ${lost.length} edges lost`);
});

test('mutant 14 — ignore the key: any member answers any call', () => {
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'class_member_proto[flow](Obj, Key, V), may_be_node[flow](V, V2),',
    replace: 'class_member_proto[flow](Obj, _, V), may_be_node[flow](V, V2),',
  }, {
    file: 'rules/js-dataflow.rofl',
    find: 'member_plain[flow](Obj, Key, V), may_be_node[flow](V, V2).',
    replace: 'member_plain[flow](Obj, _, V), may_be_node[flow](V, V2).',
  }, {
    file: 'rules/js-dataflow.rofl',
    find: 'class_member_static[flow](Obj, Key, V), may_be_node[flow](V, V2).',
    replace: 'class_member_static[flow](Obj, _, V), may_be_node[flow](V, V2).',
  }]);
  const extra = [...mut.edges].filter((e) => !base.edges.has(e));
  assert.ok(extra.length >= 5, `${extra.length} edges the runtime never ran`);
  assert.ok(mut.ambiguous > base.ambiguous, 'and every member site resolves many ways');
  console.log(`  KILLED: ${extra.length} invented edges, ambiguous ${base.ambiguous} -> ${mut.ambiguous}`);
});

test('mutant 15 — a sequence evaluates to its FIRST element', () => {
  // the `not seq_later` idiom is how a maximum is written without aggregation;
  // dropping it makes `(a, b)` mean both, which is what an unguarded index does.
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: '                           ast_child[code](E, expressions, I, X),\n'
        + '                           not seq_later[flow](E, I), may_be_node[flow](X, N).',
    replace: '                           ast_child[code](E, expressions, I, X),\n'
        + '                           may_be_node[flow](X, N).',
  }]);
  assert.ok(base.edges.size > 50, 'positive control: the baseline has a call graph');
  console.log(`  edges ${base.edges.size} -> ${mut.edges.size}, ambiguous ${base.ambiguous} -> ${mut.ambiguous}`);
});

test('mutant 16 — `this` unscoped: killed by the AUDIT, not by the oracle', () => {
  const base = probe([]);
  // THE ANCHOR MOVED 2026-09-07 and the mutant moved with it. The rule this
  // used to break read `this` as the class of ANY enclosing class method, and
  // the mutant widened it to any class at all. `this_host[flow]` now names the
  // nearest enclosing non-arrow function, so the SAME defect — a `this` that
  // does not know which function binds it — is spelled by deleting the
  // nearest-wins literal. Rewritten rather than deleted: it is the same claim.
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'this_host[flow](F, T)   :- this_over[flow](F, T), not this_nearer[flow](F, T).',
    replace: 'this_host[flow](F, T)   :- this_over[flow](F, T).',
  }]);
  // THE EDGE SET DOES NOT MOVE, and that is a fact about V8's naming rather
  // than about the mutant: `Box.get` and `Crate.get` both report as `get`, so
  // `Box.both -> Crate.get` is spelled exactly like the edge that should be
  // there. The fixture carries two classes with the same method names for
  // precisely this reason, and it still cannot make the oracle see it.
  assert.deepEqual([...mut.edges].filter((e) => !base.edges.has(e)), [],
    'the oracle is structurally blind here — if this ever fails, say so');
  assert.equal(base.ambiguous, 8, 'the branch sites and the loop variables, and nothing else');
  assert.equal(mut.ambiguous, 10,
    `a this-site inside a nested object method resolves two ways: ${mut.ambiguous}`);
  console.log(`  KILLED by ambiguous_call: 8 -> ${mut.ambiguous}, edge set UNMOVED`);
});

test('mutant 18 — a catch-all that is waived as empty must be able to fill', () => {
  // `s_member_on_other` is waived in facts/js-shapes.rofl as EMPTY BY DESIGN:
  // every object position the classifier meets has a name of its own, so the
  // catcher holds nothing and `not_yet` would be a backlog item for a form
  // nobody has seen. A waiver nobody re-checks is how a table stops matching
  // the grammar, so the waiver ships with the gate that watches it.
  const base = build();
  assert.equal(base.n('catch_all_occupied[audit](K)'), 0, 'baseline: the catcher is empty');

  const mut = build([{
    find: 'obj_kind_class(logical_expression,         o_logical).',
    replace: '-- withdrawn by the mutant',
  }]);
  assert.deepEqual(mut.binds('catch_all_occupied[audit](K)', 'K'), ['logical_expression'],
    'the kind is NAMED, so the split can continue rather than the bucket growing');
  console.log('  KILLED: catch_all_occupied 0 -> 1, and it names the kind');
});

test('mutant 23 — the receiver stops deciding: a static answers on an instance', () => {
  // THE GATE THIS ITEM ADDED, planted. Put the undifferentiated lookup back —
  // one rule over `member_value` instead of three over the split — and the two
  // edges the runtime answers with a TypeError come back BY NAME in the
  // over-approximation list. That list is what makes this a measurement: a
  // count would have said "5" and asked nobody which two.
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'class_member_proto[flow](Obj, Key, V), may_be_node[flow](V, V2),\n'
        + '                            not class_receiver[flow](O).',
    replace: 'member_value[flow](Obj, Key, V), may_be_node[flow](V, V2).',
  }]);
  const invented = [...mut.edges].filter((e) => !base.edges.has(e)).sort();
  assert.deepEqual(invented, ['useMethodOnClass -> poured', 'useStaticOnInstance -> tapped'],
    'both TypeError sites resolve again, and the list names them');
  assert.equal(base.edges.size + 2, mut.edges.size);
  console.log(`  KILLED: edges ${base.edges.size} -> ${mut.edges.size},`
    + ' named: ' + invented.join(', '));
});

test('mutant 24 — the generator protocol, planted in three places', () => {
  // ONE MUTANT IS LIVENESS, A SET IS COVERAGE, and the set here is the three
  // separate claims the rules make: that a value sent to `.next` reaches the
  // yield, that DELEGATION passes it through, and that the sent value is found
  // by following the name to the CALL rather than to what the call returns.
  // Each is planted alone, and each loses a different edge.
  const base = probe([]);
  assert.ok(base.edges.has('chooser -> sentIn') === false, 'sentIn is a value, not a callee name');
  assert.ok(base.edges.has('chooser -> pickedA'), 'baseline: the sent function is called');
  assert.ok(base.edges.has('innerGen -> pickedB'), 'baseline: and through a delegation');

  // A — the consumer's side: no `.next(v)` is read at all
  const noSend = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'next_send[flow](G, V) :- call_site[code](C, _), callee_of[code](C, N),',
    replace: 'next_send_unused[flow](G, V) :- call_site[code](C, _), callee_of[code](C, N),',
  }]);
  assert.ok(!noSend.edges.has('chooser -> pickedA'), 'A: nothing arrives at the yield');
  assert.ok(!noSend.edges.has('innerGen -> pickedB'), 'A: and nothing reaches the delegate');

  // B — delegation stops passing it through: the DIRECT send still works
  const noDeleg = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'next_send[flow](Inner, V) :- next_send[flow](Outer, V), delegates[flow](Outer, Inner).',
    replace: '-- withdrawn by the mutant',
  }]);
  assert.ok(noDeleg.edges.has('chooser -> pickedA'), 'B: the direct send is untouched');
  assert.ok(!noDeleg.edges.has('innerGen -> pickedB'), 'B: only the delegated one is lost');

  // C — follow the name to what the call RETURNS instead of to the call. This
  // is the distinction `bound_to_call` exists for, and it is invisible without
  // a generator: for any ordinary function the two coincide.
  const viaReturns = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'bound_to_call[flow](E, C) :- ident_in[code](E, Name, File),\n'
        + '                             binder[code](_, Name, C, File),\n'
        + '                             ast_node[code](C, call_expression, _, _).',
    replace: 'bound_to_call[flow](E, C) :- ident_in[code](E, Name, File),\n'
        + '                             binder[code](_, Name, I, File),\n'
        + '                             may_be_node[flow](I, C).',
  }]);
  assert.ok(!viaReturns.edges.has('chooser -> pickedA'),
    'C: a generator is not what its call returns');
  console.log(`  KILLED x3: no send ${base.edges.size} -> ${noSend.edges.size},`
    + ` no delegation -> ${noDeleg.edges.size}, via returns -> ${viaReturns.edges.size}`);
});

test('mutant 19 — the OTHER catch-all, the one that had no gate for three days', () => {
  // `s_unclassified` is the CALLEE-position bucket and `s_member_on_other` is
  // the OBJECT-position copy of it. Mutant 18 above watches the copy; until
  // 2026-09-05 nothing watched the original, and the two are twenty lines apart
  // in the same file. That is a gate inheriting the scope of its incident, and
  // the incident was the object split.
  //
  // WHAT THE BUCKET ACTUALLY HELD, measured by sweeping the boundary rather
  // than sampling it — every declared expression kind put in callee position,
  // one at a time: TWELVE kinds, and three of them ALREADY RESOLVED. So its
  // single `not_yet` was false about a quarter of its contents.
  const base = build();
  assert.equal(base.n('unnamed_callee[audit](K)'), 0, 'baseline: nothing unnamed in this corpus');

  const mut = build([{
    find: 'callee_shape(conditional_expression,    s_conditional).',
    replace: '-- withdrawn by the mutant',
  }]);
  assert.deepEqual(mut.binds('unnamed_callee[audit](K)', 'K'), ['conditional_expression'],
    'the kind is NAMED, which is the whole difference from a bucket');
  // and the site is still shaped — it fell INTO the catch-all rather than out
  // of the classification, which is what makes the defect invisible without
  // this audit
  assert.equal(mut.n('unshaped[audit](C)'), 0, 'totality survives; only the name is lost');
  console.log('  KILLED: unnamed_callee 0 -> 1, and unshaped stays 0');
});

test('BLIND SPOT: the branch over-approximation is real, and the oracle cannot see it', () => {
  // The two branch sites resolve two ways EACH, which is the may-set doing
  // what it says. At runtime only one branch is taken, so the model has an
  // edge the execution never produces — a genuine over-approximation, in the
  // BASELINE and not in a mutant.
  //
  // The oracle reports 0 misses and 0 extras anyway, and the reason is the one
  // mutant 16 already names for `Box.get` / `Crate.get`: a V8 frame carries the
  // LAST DOT-SEGMENT of a name, so `boxA.pick` and `boxB.pick` are both `pick`
  // and the two edges are spelled identically. This test states the wrong
  // answer rather than leaving the silence to look like agreement.
  const m = build();
  // RESTRICTED TO THE BRANCH SITES 2026-09-04. The for-of loop variables also
  // resolve two ways, and there the runtime takes BOTH — a loop runs every
  // element — so those pairs are not over-approximation at all and their
  // targets are `alef` and `bet`, two different names. The blind spot is
  // specifically the branch: one arm is taken, the other is not, and both
  // targets are called `pick`.
  const branchSites = new Set(m.binds('ambiguous_call[audit](C, F, G)', 'C')
    .filter((c) => m.binds(`shape[code](${c}, S)`, 'S')
      .some((sh) => sh.startsWith('s_member_on_'))));
  const pairs = m.q('ambiguous_call[audit](C, F, G)').filter(([c]) => branchSites.has(c));
  assert.equal(pairs.length, 4, 'two branch sites, both orderings');
  for (const [, f, g] of pairs) {
    const nf = m.binds(`fn_name[code](${f}, N)`, 'N');
    const ng = m.binds(`fn_name[code](${g}, N)`, 'N');
    assert.deepEqual(nf, ng,
      'the two targets share a name, which is exactly why the oracle collapses them');
  }
  // ...and the collapse is visible in the model's own by-name view: two nodes,
  // one named edge. If somebody later adds an ambiguous site whose targets have
  // DIFFERENT names, the loop above goes red and the oracle becomes able to see
  // an over-approximation it cannot see today — which is news, not breakage.
  const named = new Set(m.binds('calls_named[code](A, B)', 'A', 'B'));
  assert.ok(named.has('useCond -> pick'));
  assert.ok(named.has('useOr -> pick'));
});

test('mutant 19 — `super()` loses its rule: the call, not the member', () => {
  const base = probe([]);
  const mut = probe([{
    find: 'resolves[code](C, M) :- callee_of[code](C, N), ast_node[code](N, super, _, _),\n'
        + '                        may_be_node[flow](N, SD), ctor_of[flow](SD, M).',
    replace: '-- withdrawn by the mutant',
  }]);
  assert.ok(base.edges.has('Cask -> Barrel'), 'baseline: super() reaches the ancestor constructor');
  assert.ok(!mut.edges.has('Cask -> Barrel'), 'and the mutant loses exactly that edge');
  // `super.m()` is a DIFFERENT rule and must survive: the member form reads the
  // parent explicitly and never needed the constructor walk, so the edge it
  // produces is untouched by this mutation.
  assert.ok(base.edges.has('Sub -> m') === mut.edges.has('Sub -> m'),
    'the member form of super is a different rule and does not move');
  console.log(`  KILLED: edges ${base.edges.size} -> ${mut.edges.size}`);
});

test('mutant 20 — the constructor walk stops at the first class', () => {
  // `Keg` declares no constructor, so `super()` inside `Cask` must pass through
  // it to `Barrel`. V8 does exactly that — measured — and without the inherited
  // clause the model stops one level short and says nothing at all.
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'ctor_of[flow](CD, M)   :- super_of[flow](CD, SD), not has_own_ctor[flow](CD),\n'
        + '                          ctor_of[flow](SD, M).',
    replace: '-- withdrawn by the mutant',
  }]);
  assert.ok(base.edges.has('Cask -> Barrel'));
  assert.ok(!mut.edges.has('Cask -> Barrel'), 'the walk is what crosses the constructor-less class');
  console.log(`  KILLED: edges ${base.edges.size} -> ${mut.edges.size}`);
});

test('mutant 21 — a class stops inheriting its ancestors\' methods', () => {
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'member_value[flow](CD, Key, V) :- super_of[flow](CD, SD),\n'
        + '                                  member_value[flow](SD, Key, V),\n'
        + '                                  not own_key[flow](CD, Key).',
    replace: '-- withdrawn by the mutant',
  }]);
  assert.ok(base.edges.has('useSuper -> hold'), 'baseline: an inherited method is reachable');
  assert.ok(!mut.edges.has('useSuper -> hold'), 'and the mutant loses it');
  console.log(`  KILLED: edges ${base.edges.size} -> ${mut.edges.size}`);
});

test('mutant 22 — THE ORDER OF A NEGATED LITERAL, and it is not style', () => {
  // This mutant only swaps two premises. In Datalog that must change nothing,
  // and here it changes the answer: with `not own_key` BEFORE the literal that
  // binds `Key`, the negation is evaluated with `Key` unbound and reads as
  // "Cask has no own key at all" — which is false, Cask declares a constructor
  // — so the chain stops one level short and `hold` never reaches the instance.
  //
  // IT IS PINNED HERE ON PURPOSE. The defect is the kernel's
  // (f_body_order_changes_the_answer_and_whynot_cannot_see_it, queued as
  // w_body_order_is_load_bearing); the day it is fixed THIS MUTANT STOPS
  // KILLING, and that is the signal that the workaround comment in
  // rules/js-dataflow.rofl can go.
  // THE KERNEL WAS FIXED, 2026-09-05, and this test was the signal by
  // construction: it stopped killing. `Evaluation.evalOrder` now defers a
  // negative literal to the earliest point where every variable in it is
  // bound, so the two spellings below are the same program — which is what
  // Datalog says they always were.
  //
  // IT IS KEPT AND INVERTED rather than deleted. A defect that was fixed once
  // can return, and the assertion that says so is the same two spellings with
  // the expectation the other way round: they must now agree EDGE FOR EDGE,
  // not merely on the one edge that used to vanish.
  const base = probe([]);
  const mut = probe([{
    file: 'rules/js-dataflow.rofl',
    find: 'member_value[flow](CD, Key, V) :- super_of[flow](CD, SD),\n'
        + '                                  member_value[flow](SD, Key, V),\n'
        + '                                  not own_key[flow](CD, Key).',
    replace: 'member_value[flow](CD, Key, V) :- super_of[flow](CD, SD),\n'
        + '                                  not own_key[flow](CD, Key),\n'
        + '                                  member_value[flow](SD, Key, V).',
  }]);
  assert.ok(base.edges.has('useSuper -> hold'), 'positive control: the inherited edge is there');
  assert.ok(mut.edges.has('useSuper -> hold'),
    'the edge survives the swap — this is the kernel fix, asserted');
  assert.deepEqual([...mut.edges].sort(), [...base.edges].sort(),
    'and the two spellings agree edge for edge, not just on the one that used to go');
  console.log(`  NO LONGER KILLS, and that is the acceptance: ${base.edges.size} edges either way`);
});

// MUTANT 17 WAS DELETED 2026-09-04 with its subject. It mutated `denotes` in
// the call-graph pack to forget which file a binding came from; `denotes` is
// gone, and the property it tested — a name resolving into the wrong file —
// is mutant 3 above, aimed at the dataflow entry that now carries it.
