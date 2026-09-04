// js-modules.test.ts — the module-graph model, measured.
//
// Three things are being checked here and they are different things:
//
//   1. the CENSUS — what the model derives, counted, so a change to the rules
//      shows up as a number rather than as a feeling;
//   2. the ORACLE — node's own resolver, which reads no ROFL fact and
//      enumerates its own import sites from babel, compared SET FOR SET, with
//      the two error directions reported separately because they mean
//      opposite things;
//   3. the GATES — every audit relation in rules/js-modules.rofl, each one
//      with a PLANTED DEFECT proving it can say no. A gate that has never
//      rejected anything is an assumption wearing a gate's interface.
//
// The fixtures live as `.ts.txt` and are materialised into a temp directory.
// Two reasons, both load-bearing: the repo's tsconfig includes `test/**/*.ts`
// and the fixtures deliberately contain a missing module and a package
// subpath, which are tsc errors; and the resolver oracle needs real files on
// a real disk with a real node_modules above them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';

const REPO = new URL('../', import.meta.url);
const readRepo = (p: string): string => fs.readFileSync(new URL(p, REPO), 'utf8');
const FIXTURES = path.join(fs.realpathSync(new URL('.', REPO).pathname), 'test/fixtures/js-mod');

// ---------------------------------------------------------------------------
// the fixture tree, on a real disk

/** realpathSync is not decoration: on macOS os.tmpdir() is /var/... and node's
 *  resolver answers with the /private/var/... realpath, so every comparison
 *  against a path node returned reads as "outside the tree". Measured while
 *  writing this file — the probe reported sixteen confident wrong answers and
 *  no error at all. */
function materialise(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'js-mod-')));
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(FIXTURES, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) { fs.mkdirSync(path.join(root, r), { recursive: true }); walk(r); }
      else if (e.name.endsWith('.txt')) fs.copyFileSync(path.join(FIXTURES, r), path.join(root, r.slice(0, -4)));
    }
  };
  walk('');
  // a package with dependencies has node_modules above it; without this the
  // bare specifier's oracle verdict depends on where the temp directory
  // happens to sit, which is a property of the machine and not of the model
  fs.symlinkSync(path.join(fs.realpathSync(new URL('.', REPO).pathname), 'node_modules'),
    path.join(root, 'node_modules'), 'dir');
  return root;
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.name.endsWith('.ts')) out.push(r.split(path.sep).join('/'));
    }
  };
  walk('');
  return out.sort();
}

const ROOT = materialise();
const FILES = sourceFiles(ROOT);

// the symlink goes first: rmSync would unlink it rather than recurse through
// it, but saying so out loud costs one line and being wrong costs node_modules
process.on('exit', () => {
  try { fs.unlinkSync(path.join(ROOT, 'node_modules')); } catch { /* already gone */ }
  fs.rmSync(ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// the two blind host emitters, declared in facts/js-modules.rofl
//
// Neither knows what an import is. `str*` would cut a shopping list the same
// way; `fsFacts` says what is on disk and nothing about what it means. They
// exist because the kernel's builtins are arithmetic and comparison only, so
// no rule can take a string apart, and because no AST can see a directory.

const q = (s: string): string => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

function strFacts(s: string): string[] {
  if (s.length === 0) return [];
  const segs = s.split('/');
  const out = [`str_char0[code](${q(s)}, ${q(s[0] as string)}).`, `str_segs[code](${q(s)}, ${segs.length}).`];
  segs.forEach((g, i) => out.push(`str_seg[code](${q(s)}, ${i}, ${q(g)}).`));
  const c = s.indexOf(':');
  if (c > 0) out.push(`str_scheme[code](${q(s)}, ${q(s.slice(0, c))}).`);
  return out;
}

function fsFacts(root: string): string[] {
  const out: string[] = [];
  const rel = (p: string): string => {
    const r = path.relative(root, p).split(path.sep).join('/');
    return r === '' ? '.' : r;
  };
  const walk = (dir: string): void => {
    const d = rel(dir);
    out.push(`fs_dir[code](${q(d)}).`);
    if (d !== '.') out.push(`fs_parent[code](${q(d)}, ${q(rel(path.dirname(dir)))}).`);
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { out.push(`fs_dir_in[code](${q(d)}, ${q(e.name)}, ${q(rel(full))}).`); walk(full); }
      else out.push(`fs_file[code](${q(rel(full))}).`,
        `fs_file_in[code](${q(d)}, ${q(e.name)}, ${q(rel(full))}).`,
        `fs_dir_of[code](${q(rel(full))}, ${q(d)}).`);
    }
  };
  walk(root);
  return out;
}

// ---------------------------------------------------------------------------
// building the model

const RULES = readRepo('rules/js-modules.rofl');
const FACTS = readRepo('facts/js-modules.rofl');
const STRUCTURE = readRepo('rules/js-structure.rofl');
const KINDS = readRepo('facts/js-kinds.rofl');
const MODEL = readRepo('rules/js-model.rofl');

const idem = (s: string): string => s;

interface BuildOpts {
  rules?: (s: string) => string;
  facts?: (s: string) => string;
  /** drop the str facts for these specifiers, to plant a gap in the vocabulary */
  dropStrings?: string[];
}

function unq(t: string): string | null {
  if (t.length < 2 || t[0] !== '"' || t[t.length - 1] !== '"') return null;
  let out = '';
  for (let i = 1; i < t.length - 1; i++) { if (t[i] === '\\') out += t[++i] as string; else out += t[i] as string; }
  return out;
}

function build(opts: BuildOpts = {}): Rofl {
  const r = new Rofl();
  const load = (text: string, what: string): void => {
    const res = r.load(text);
    assert.ok(res.ok, `${what} loads: ${res.diagnostics.slice(0, 3).join(' | ')}`);
  };
  for (const f of FILES) load(scan(fs.readFileSync(path.join(ROOT, f), 'utf8'), { file: f }).facts.join('\n'), f);
  load(fsFacts(ROOT).join('\n'), 'fs facts');

  // the string algebra is computed for the strings the STORE holds, read back
  // out of it — so the model's input comes only from scanner facts and the
  // oracle's only from its own parse, with no shared enumeration
  const drop = new Set(opts.dropStrings ?? []);
  const strs = new Set<string>();
  for (const row of r.query('ast_attr[code](_, value, V)').rows) {
    const v = unq(row.bindings['V'] ?? '');
    if (v !== null && !drop.has(v)) strs.add(v);
  }
  const sf: string[] = [];
  for (const s of strs) sf.push(...strFacts(s));
  load(sf.join('\n'), 'str facts');

  load(STRUCTURE, 'js-structure');
  load(KINDS, 'js-kinds');
  load(MODEL, 'js-model');
  load((opts.facts ?? idem)(FACTS), 'js-modules facts');
  load((opts.rules ?? idem)(RULES), 'js-modules rules');
  return r;
}

const count = (r: Rofl, goal: string): number => r.query(goal).rows.length;
const bind = (r: Rofl, goal: string, ...vars: string[]): string[] =>
  r.query(goal).rows.map((row) => vars.map((v) => unq(row.bindings[v] ?? '') ?? row.bindings[v] ?? '').join('|')).sort();

const MODEL_R = build();

// ===========================================================================
// 1. THE CENSUS

test('census: every import site is accounted for, and the buckets partition', () => {
  const sites = count(MODEL_R, 'import_site[code](I, K)');
  const literal = count(MODEL_R, 'site_source[code](I, S)');
  const computed = count(MODEL_R, 'site_source_computed[code](I)');
  const shaped = count(MODEL_R, 'site_shape[code](I, Sh)');
  const files = count(MODEL_R, 'resolved_import[code](I, T)');
  const builtins = count(MODEL_R, 'resolved_builtin[code](I, S)');
  const unresolved = count(MODEL_R, 'unresolved_import[code](I, Sh)');

  console.log(`\n  sites ${sites} = literal ${literal} + computed ${computed}`);
  console.log(`  resolved: file ${files} + builtin ${builtins}; unresolved ${unresolved}`);
  const byShape = new Map<string, number>();
  for (const row of MODEL_R.query('site_shape[code](I, Sh)').rows) {
    const s = row.bindings['Sh'] ?? '?';
    byShape.set(s, (byShape.get(s) ?? 0) + 1);
  }
  console.log('  by shape:', [...byShape].map(([k, v]) => `${k} ${v}`).join(', '), `, computed ${computed}`);

  // the partition, as arithmetic rather than as prose
  assert.equal(literal + computed, sites, 'a site has a literal source or a computed one');
  assert.equal(shaped, literal, 'every literal source gets a shape');
  assert.equal(files + builtins + unresolved, sites, 'resolved + unresolved = every site');

  // ...and the positive control: these numbers are not zero, so the equalities
  // above are not the trivially-true ones
  assert.ok(sites >= 15 && files >= 10 && unresolved >= 3, `nontrivial: ${sites}/${files}/${unresolved}`);
  assert.equal(byShape.size, 4, 'all four literal shapes occur in the fixtures');
});

test('DEPENDS is potential, FLOWS is actual, EVALUATES is the third thing', () => {
  const depends = bind(MODEL_R, 'depends[code](F, T)', 'F', 'T');
  const flows = bind(MODEL_R, 'flows[code](F, T)', 'F', 'T');
  const evaluates = bind(MODEL_R, 'evaluates[code](F, T)', 'F', 'T');
  const pretty = (xs: string[]): string => xs.map((x) => x.replace('|', ' -> ')).join(', ');
  console.log(`\n  depends ${depends.length}: ${pretty(depends)}`);
  console.log(`  flows    ${flows.length}: ${pretty(flows)}`);
  console.log(`  evaluate ${evaluates.length}: ${pretty(evaluates)}`);
  console.log(`  THE GAP: depends - flows = ${depends.length - flows.length}`);

  // FLOWS is contained in DEPENDS, and strictly: the gap is the whole point
  for (const e of flows) assert.ok(depends.includes(e), `flows subset of depends: ${e}`);
  for (const e of evaluates) assert.ok(depends.includes(e), `evaluates subset of depends: ${e}`);
  assert.ok(depends.length > flows.length, 'the distinction is not decoration');

  // the three named cases, each one an edge the other two relations get wrong
  const has = (xs: string[], f: string, t: string): boolean => xs.includes(`${f}|${t}`);
  // declaration-level `import type { T1 } from './types.ts'`
  assert.ok(has(depends, 'a.ts', 'types.ts'), 'type-only import DEPENDS');
  assert.ok(!has(flows, 'a.ts', 'types.ts'), 'type-only import does NOT flow');
  assert.ok(!has(evaluates, 'a.ts', 'types.ts'), 'type-only import is not even evaluated');
  // inline `import { type T3 } from './types2.ts'` — the same verdict reached
  // through the OTHER marker, on a target nothing else imports
  assert.ok(has(depends, 'a.ts', 'types2.ts'), 'inline-type-only import DEPENDS');
  assert.ok(!has(flows, 'a.ts', 'types2.ts'), 'inline-type-only import does NOT flow');
  // side effect `import './side.ts'` — no binding, and the module still runs
  assert.ok(has(depends, 'a.ts', 'side.ts'), 'side-effect import DEPENDS');
  assert.ok(!has(flows, 'a.ts', 'side.ts'), 'side-effect import has no value to flow');
  assert.ok(has(evaluates, 'a.ts', 'side.ts'), 'side-effect import IS evaluated');
});

test('all four specifier kinds bind a local name to an imported one', () => {
  const bs = bind(MODEL_R, 'binding[code](I, Sp, L, M)', 'L', 'M');
  const pairs = new Set(bs.map((b) => b.replace('|', ' <- ')));
  console.log('\n  bindings:', [...pairs].join(', '));
  assert.ok(pairs.has('def <- default'), 'ImportDefaultSpecifier binds the default export');
  assert.ok(pairs.has('ns <- *'), 'ImportNamespaceSpecifier binds the whole namespace');
  assert.ok(pairs.has('v1 <- v1'), 'ImportSpecifier binds a named export');
  assert.ok(pairs.has('T3 <- T3'), 'an inline-type ImportSpecifier still BINDS; it just does not flow');
  assert.ok(count(MODEL_R, 'value_binding[code](I, Sp)') < count(MODEL_R, 'binding[code](I, Sp, L, M)'),
    'strictly fewer bindings survive erasure than exist');
});

test('the frontier is a positive relation, one row per unresolved site', () => {
  const rows = MODEL_R.query('unresolved_import[code](I, Sh)').rows.map((x) => x.bindings['Sh'] ?? '?').sort();
  console.log('\n  unresolved by shape:', rows.join(', '));
  assert.deepEqual(rows, ['bare', 'computed', 'relative', 'subpath']);
  // the relative one is a BROKEN import, not a missing rule, and it is in its
  // own relation so the two are never counted in the same bucket
  assert.equal(count(MODEL_R, 'dangling_import[code](I, S)'), 1);
  assert.equal(count(MODEL_R, 'site_source_computed[code](I)'), 1,
    'exactly one irreducible cell: import() with a computed argument');
});

// ===========================================================================
// 2. THE ORACLE — node's own resolver, reading no ROFL fact.

interface OracleSite { file: string; line: number; spec: string | null; kind: string; }
type Verdict =
  | { k: 'file'; target: string } | { k: 'builtin'; name: string }
  | { k: 'external'; where: string } | { k: 'computed' } | { k: 'throws'; code: string };

/** The oracle enumerates its OWN sites. Taking the site list from the model
 *  would make a site the model never saw impossible to report as a miss. */
function oracleSites(root: string, files: string[]): OracleSite[] {
  const out: OracleSite[] = [];
  for (const f of files) {
    const ast = parse(fs.readFileSync(path.join(root, f), 'utf8'),
      { sourceType: 'module', plugins: ['typescript'] });
    const walk = (n: unknown): void => {
      if (n === null || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) walk(x); return; }
      const o = n as Record<string, unknown> & { type?: string; loc?: { start?: { line?: number } } };
      if (typeof o.type !== 'string') return;
      if (o.type === 'ImportDeclaration' || o.type === 'ImportExpression') {
        const src = o['source'] as { type?: string; value?: string } | undefined;
        out.push({
          file: f, line: o.loc?.start?.line ?? 0,
          spec: src?.type === 'StringLiteral' ? (src.value ?? null) : null,
          kind: o.type === 'ImportDeclaration' ? 'import_declaration' : 'import_expression',
        });
      }
      for (const k of Object.keys(o)) if (k !== 'loc') walk(o[k]);
    };
    walk(ast);
  }
  return out;
}

function classify(root: string, resolved: string): Verdict {
  if (resolved.startsWith('node:')) return { k: 'builtin', name: resolved };
  if (!resolved.includes('/') && !resolved.includes('\\')) return { k: 'builtin', name: 'node:' + resolved };
  const rel = path.relative(root, resolved).split(path.sep).join('/');
  return rel.startsWith('..') || path.isAbsolute(rel) || rel.includes('node_modules/')
    ? { k: 'external', where: resolved } : { k: 'file', target: rel };
}

function oracleResolve(root: string, s: OracleSite): Verdict {
  if (s.spec === null) return { k: 'computed' };
  try { return classify(root, createRequire(path.join(root, s.file)).resolve(s.spec)); }
  catch (e) { return { k: 'throws', code: (e as { code?: string }).code ?? 'ERR' }; }
}

const siteKey = (s: { file: string; line: number; spec: string | null }): string =>
  `${s.file}:${s.line}:${s.spec ?? '<computed>'}`;

/** What the MODEL says, keyed the way a person names a site rather than by
 *  node id, so the two sides can be compared without either seeing the
 *  other's identifiers. */
function modelVerdicts(r: Rofl): Map<string, string> {
  const line = new Map<string, string>();
  for (const row of r.query('site_line[code](I, L)').rows) line.set(row.bindings['I'] ?? '', row.bindings['L'] ?? '');
  const fileOf = new Map<string, string>();
  for (const row of r.query('site_file[code](I, F)').rows) fileOf.set(row.bindings['I'] ?? '', unq(row.bindings['F'] ?? '') ?? '');
  const specOf = new Map<string, string>();
  for (const row of r.query('site_source[code](I, S)').rows) specOf.set(row.bindings['I'] ?? '', unq(row.bindings['S'] ?? '') ?? '');
  const key = (i: string): string => `${fileOf.get(i) ?? '?'}:${line.get(i) ?? '?'}:${specOf.get(i) ?? '<computed>'}`;

  const out = new Map<string, string>();
  for (const row of r.query('import_site[code](I, K)').rows) out.set(key(row.bindings['I'] ?? ''), 'nothing');
  for (const row of r.query('unresolved_import[code](I, Sh)').rows)
    out.set(key(row.bindings['I'] ?? ''), `declined ${row.bindings['Sh'] ?? '?'}`);
  for (const row of r.query('resolved_builtin[code](I, S)').rows)
    out.set(key(row.bindings['I'] ?? ''), `builtin ${unq(row.bindings['S'] ?? '') ?? ''}`);
  for (const row of r.query('resolved_import[code](I, T)').rows)
    out.set(key(row.bindings['I'] ?? ''), `file ${unq(row.bindings['T'] ?? '') ?? ''}`);
  return out;
}

interface Under { line: string; shape: string }
interface Comparison {
  sitesSeen: number;
  agree: string[];
  under: Under[];   // THE RESOLVER RESOLVED IT AND THE MODEL DID NOT — under-report
  wrong: string[];  // the model answered and the resolver disagrees or throws
}

/** Mechanical, and it decides nothing about which under-reports are excusable.
 *  It records the model's own decline reason alongside each one and lets the
 *  caller sort them against the declared frontier — so a decline the taxonomy
 *  does not cover cannot hide among the ones it does. */
function compare(root: string, files: string[], r: Rofl): Comparison {
  const sites = oracleSites(root, files);
  const model = modelVerdicts(r);
  const c: Comparison = { sitesSeen: sites.length, agree: [], under: [], wrong: [] };
  for (const s of sites) {
    const k = siteKey(s);
    const o = oracleResolve(root, s);
    const m = model.get(k) ?? 'ABSENT FROM MODEL';
    const oText = o.k === 'file' ? `file ${o.target}` : o.k === 'builtin' ? `builtin ${o.name}`
      : o.k === 'external' ? `external ${o.where}` : o.k === 'computed' ? 'computed' : `throws ${o.code}`;
    const line = `${k}  oracle=${oText}  model=${m}`;

    // `external` counts as RESOLVED: node found the module, it just found it
    // outside the scanned tree. Filing that as agreement would let the model
    // decline every package in the repository and still read clean.
    const oracleResolved = o.k === 'file' || o.k === 'builtin' || o.k === 'external';
    const modelAnswered = m.startsWith('file ') || m.startsWith('builtin ');

    if (oracleResolved && modelAnswered) { (m === oText ? c.agree : c.wrong).push(line); }
    else if (oracleResolved) c.under.push({ line, shape: m.startsWith('declined ') ? m.slice(9) : 'NO VERDICT' });
    else if (modelAnswered) c.wrong.push(line);
    else c.agree.push(line);
  }
  return c;
}

test('ORACLE: node resolves; the model resolves; set for set, both directions', () => {
  const c = compare(ROOT, FILES, MODEL_R);

  // POSITIVE CONTROL FIRST. An empty comparison is a fact about the probe
  // until it is shown to be a fact about the model.
  assert.ok(c.sitesSeen > 0, 'the oracle saw import sites at all');
  assert.equal(c.sitesSeen, count(MODEL_R, 'import_site[code](I, K)'),
    'oracle and model enumerate the SAME NUMBER of sites — a site the model never saw would show here');
  assert.ok(c.agree.length > 0, 'the comparison found agreements, so it is capable of comparing');

  // which shapes the model DECLARED it would not resolve; read from the
  // ledger, not from the oracle, and used only to sort the under-reports
  const declaredOut = new Set(
    MODEL_R.query('shape_verdict(Sh, R)').rows
      .filter((x) => x.bindings['R'] !== 'resolves').map((x) => x.bindings['Sh'] ?? ''));
  const declared = c.under.filter((u) => declaredOut.has(u.shape));
  const undeclared = c.under.filter((u) => !declaredOut.has(u.shape));

  console.log(`\n  oracle sites ${c.sitesSeen}: agree ${c.agree.length}, ` +
    `WRONG ANSWER ${c.wrong.length}, under-report ${c.under.length} ` +
    `(${declared.length} declared, ${undeclared.length} UNDECLARED)`);
  for (const u of declared) console.log(`    under-report [declared ${u.shape}]:`, u.line);
  for (const u of undeclared) console.log(`    UNDER-REPORT [undeclared]:`, u.line);
  for (const l of c.wrong) console.log('    WRONG:', l);

  assert.deepEqual(c.wrong, [], 'a wrong answer is worse than none');
  assert.deepEqual(undeclared.map((u) => u.line), [], 'no UNDECLARED under-report');

  // ...and the declared under-reports are exactly the two shapes the frontier
  // names, each one a piece of work the taxonomy says is left rather than done
  assert.equal(declared.length, 2, 'bare and subpath, both declared, both real');
  assert.ok(declared.some((u) => u.line.includes('@babel/parser') && u.shape === 'bare'));
  assert.ok(declared.some((u) => u.line.includes('#sub') && u.shape === 'subpath'));
});

test('MUTANT 6: an oracle pointed at an empty directory reports NOTHING TO SEE, not agreement', () => {
  // TARGETS: whether the probe can tell "nothing to resolve" from "the
  // resolver never ran". Both produce zero mismatches and they are opposite
  // facts. This is the measurement that says the previous test's zeros mean
  // something.
  const empty = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'js-mod-empty-')));
  const c = compare(empty, [], MODEL_R);
  assert.equal(c.sitesSeen, 0, 'an empty tree yields no sites');
  assert.deepEqual(c.under, []);
  assert.deepEqual(c.wrong, []);
  // ...and this is exactly the shape of a PASS if the guard were not there:
  // zero missed, zero wrong, and nothing measured. The guard is the sitesSeen
  // assertion in the test above, and here is the proof it is not vacuous.
  console.log(`\n  empty-dir oracle: sitesSeen ${c.sitesSeen}, under ${c.under.length}, wrong ${c.wrong.length}` +
    '  <- the same zeros as a pass, from a probe that measured nothing');
  fs.rmSync(empty, { recursive: true, force: true });
});

// ===========================================================================
// 3. THE GATES — each with a planted defect proving it can say no.

const GATES: { goal: string; why: string; plant: BuildOpts }[] = [
  {
    goal: 'shape_conflict[audit](I, A, B)',
    why: 'shape must be a function of the specifier',
    // give "./b.ts" a second first-character and it is relative AND subpath
    plant: { rules: (s) => s + '\nstr_char0[code]("./b.ts", "#").\n' },
  },
  {
    goal: 'shape_missing[audit](I)',
    why: 'a literal source with no shape at all',
    plant: { dropStrings: ['./dyn.ts'] },
  },
  {
    goal: 'unaccounted_site[audit](I)',
    why: 'shapes + resolved must cover every site',
    plant: { rules: (s) => s.replace(/^unresolved_import\[code\]/gm, 'muted_unresolved_import[code]') },
  },
  {
    goal: 'shape_without_verdict[audit](Sh)',
    why: 'a shape that occurs with no declared verdict',
    plant: { facts: (s) => s.replace('shape_verdict(bare,         out_of_scope).', '') },
  },
  {
    goal: 'reason_missing[audit](K, Sh, R)',
    why: 'an unresolved shape with no recorded reason',
    plant: { facts: (s) => s.replace('unknown_because(js, import_declaration, bare, modules, out_of_scope).', '') },
  },
  {
    goal: 'reason_unexercised[audit](K, R)',
    why: 'a reason recorded for something that never happens',
    plant: { facts: (s) => s + '\nunknown_because(js, import_declaration, bare, modules, budget_exhausted).\n' },
  },
  {
    goal: 'resolve_gap[audit](I, Sh)',
    why: 'a shape promised to resolve, that did not',
    plant: { rules: (s) => s.replace('builtin_canonical[code](S, C) :- node_builtin_bare(S, C).', '') },
  },
  {
    goal: 'orphan_claim[audit](L, K, La)',
    why: 'a claim about a cell that does not exist',
    plant: { facts: (s) => s + '\nhandled(js, no_such_kind, modules, r_nothing).\n' },
  },
];

test('every audit gate reads ZERO on the model as written', () => {
  for (const g of GATES) assert.equal(count(MODEL_R, g.goal), 0, `${g.goal} — ${g.why}`);
});

for (const g of GATES) {
  test(`gate can say NO: ${g.goal} — ${g.why}`, () => {
    // the mutation must actually change something, or the gate is being
    // credited for rejecting a defect that was never planted
    if (g.plant.rules) assert.notEqual(g.plant.rules(RULES), RULES, 'the rule mutation applied');
    if (g.plant.facts) assert.notEqual(g.plant.facts(FACTS), FACTS, 'the fact mutation applied');
    const broken = build(g.plant);
    const n = count(broken, g.goal);
    assert.ok(n > 0, `${g.goal} stayed silent under a planted defect — it is an assumption, not a gate`);
    console.log(`    ${g.goal} -> ${n} row(s) under the planted defect`);
  });
}

// ===========================================================================
// 4. THE MUTANT SET — one mutant is liveness, a set is coverage.
//
// Each entry says which CONSTRAINT it targets. A survivor is a real result and
// is reported, not hidden.

interface Mutant {
  name: string; targets: string; plant: BuildOpts;
  /** what must go red. Returns a description of the damage, or null if the
   *  mutant survived — in which case the test fails and says so. */
  damage: (r: Rofl) => string | null;
}

const has = (r: Rofl, goal: string): boolean => count(r, goal) > 0;

const MUTANTS: Mutant[] = [
  {
    name: '1. a type-only DECLARATION also produces flows',
    targets: 'the DEPENDS/FLOWS distinction itself. If nothing goes red, the distinction is decoration.',
    plant: { rules: (s) => s.replace('                              not decl_type_only[code](I),\n', '') },
    damage: (r) => {
      const flows = bind(r, 'flows[code](F, T)', 'F', 'T');
      return flows.includes('a.ts|types.ts')
        ? `flows now contains a.ts -> types.ts (${flows.length} edges, was 6)` : null;
    },
  },
  {
    name: '2. the INLINE type marker is ignored, the declaration-level one honoured',
    targets: 'the half of the distinction that is easy to miss — 111 sites in the corpus, and the marker ' +
      'babel writes as "value" on the specifiers of a type-only declaration.',
    plant: {
      rules: (s) => s.replace(',\n                              not spec_type_only[code](Sp).', '.'),
    },
    damage: (r) => {
      const flows = bind(r, 'flows[code](F, T)', 'F', 'T');
      return flows.includes('a.ts|types2.ts')
        ? `flows now contains a.ts -> types2.ts (${flows.length} edges, was 6)` : null;
    },
  },
  {
    name: '3. relative specifiers are joined against the root, not the importer',
    targets: 'whether resolution is actually relative to the importing file.',
    plant: {
      rules: (s) => s.replace(
        'walk[code](I, 0, D) :- site_shape[code](I, relative),\n                       site_file[code](I, F), fs_dir_of[code](F, D).',
        'walk[code](I, 0, ".") :- site_shape[code](I, relative).'),
    },
    damage: (r) => {
      const c = compare(ROOT, FILES, r);
      if (c.sitesSeen === 0) return null;
      const parts: string[] = [];
      if (c.wrong.length) parts.push(`${c.wrong.length} WRONG ANSWER(S), e.g. ${c.wrong[0]}`);
      if (c.under.length > 2) parts.push(`${c.under.length} under-report(s) (2 declared), e.g. ${c.under[0]?.line}`);
      return parts.length ? parts.join('; ') : null;
    },
  },
  {
    name: '4. a bare specifier is treated as relative',
    targets: 'the shape classification being TOTAL and DISJOINT, and the frontier reasons being earned.',
    plant: {
      rules: (s) => s.replace('src_shape[code](S, bare) :- str_char0[code](S, _), not has_explicit_shape[code](S).',
        'src_shape[code](S, relative) :- str_char0[code](S, _), not has_explicit_shape[code](S).'),
    },
    damage: (r) => {
      const shapes = r.query('site_shape[code](I, Sh)').rows.map((x) => x.bindings['Sh']);
      const parts: string[] = [];
      if (!shapes.includes('bare')) parts.push('no site is classified bare any more');
      if (has(r, 'reason_unexercised[audit](K, R)')) parts.push('reason_unexercised fires: out_of_scope is now decoration');
      return parts.length ? parts.join('; ') : null;
    },
  },
  {
    name: '5. unresolved_import derives nothing',
    targets: 'whether anything checks that shapes + resolved = all imports.',
    plant: { rules: (s) => s.replace(/^unresolved_import\[code\]/gm, 'muted_unresolved_import[code]') },
    damage: (r) => {
      const n = count(r, 'unaccounted_site[audit](I)');
      return n > 0 ? `unaccounted_site reports ${n} site(s) that fell out of the bottom` : null;
    },
  },
  {
    name: '6. the oracle is pointed at a directory with no files',
    targets: 'whether the probe can tell "nothing to resolve" from "the resolver never ran".',
    plant: {},
    damage: () => {
      const empty = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'js-mod-empty2-')));
      const c = compare(empty, [], MODEL_R);
      fs.rmSync(empty, { recursive: true, force: true });
      // the damage IS that the comparison looks like a pass while measuring
      // nothing; the guard that catches it is sitesSeen
      return c.sitesSeen === 0 && c.under.length === 0 && c.wrong.length === 0
        ? 'zero sites seen — indistinguishable from a pass except by the sitesSeen guard'
        : null;
    },
  },
];

for (const m of MUTANTS) {
  test(`MUTANT ${m.name}`, () => {
    if (m.plant.rules) assert.notEqual(m.plant.rules(RULES), RULES, 'the mutation applied to the rule text');
    const r = m.plant.rules || m.plant.facts || m.plant.dropStrings ? build(m.plant) : MODEL_R;
    const d = m.damage(r);
    console.log(`\n    targets: ${m.targets}`);
    console.log(`    verdict: ${d === null ? 'SURVIVED — the gate does not cover this' : 'KILLED — ' + d}`);
    assert.ok(d !== null, `mutant SURVIVED: ${m.name}`);
  });
}

// ===========================================================================
// 5. THE LAYER IS ONE FACT — the premise this whole layer is an instance of.

test('adding layer(modules) grows the matrix by exactly one cell per node kind', () => {
  const withLayer = count(MODEL_R, 'cell[audit](L, K, La)');
  const without = build({ facts: (s) => s.replace('layer(modules).', '') });
  const kinds = count(MODEL_R, 'node_kind(L, K)');
  const before = count(without, 'cell[audit](L, K, La)');
  console.log(`\n  cells ${before} -> ${withLayer} on one fact; node kinds ${kinds}`);
  assert.equal(withLayer - before, kinds, 'one fact, one cell per kind, and no rule changed');
  assert.ok(kinds > 0, 'the vocabulary is not empty');
});
