// js-resolve.test.ts — resolution as an OBSERVATION, measured.
//
// Five things are checked here and they are different things:
//
//   1. the CENSUS — what the observer saw and what the rules derived from it,
//      counted, so a change shows up as a number rather than as a feeling;
//   2. the ENVIRONMENT DIVERGENCE — two configurations of node's own resolver,
//      answering DIFFERENTLY on the same import. Without a real divergence the
//      whole perspective argument is decoration, so the number is printed and
//      the examples are named;
//   3. the MODEL DIVERGENCE — rules/js-modules.rofl's path walk against the
//      host's answer, set for set. Not an error: a work queue with a length;
//   4. the WHY-TREE — the reason the trace exists at all. Printed, not
//      described, and measured again under the mutant that removes it;
//   5. the GATES and the MUTANT SET. One mutant says a gate is alive; only a
//      set says what it covers, and a survivor is reported as a result.
//
// The fixtures live as `.ts.txt` and are materialised into a temp directory,
// for the same two reasons as test/js-modules.test.ts: the repo's tsconfig
// includes `test/**/*.ts` and the fixtures deliberately contain a module that
// is missing and one that only a TypeScript loader can find, which are tsc
// errors; and node's resolver needs real files on a real disk.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { scan } from '../scanners/js_ast.ts';
import { observe, nodeResolver, type ResolveEnv, type Resolver } from '../scanners/js_resolve.ts';

const REPO = new URL('../', import.meta.url);
const readRepo = (p: string): string => fs.readFileSync(new URL(p, REPO), 'utf8');
const REPO_DIR = fs.realpathSync(new URL('.', REPO).pathname);
const FIXTURES = path.join(REPO_DIR, 'test/fixtures/js-resolve');

// ---------------------------------------------------------------------------
// the fixture tree, on a real disk

/** realpathSync is not decoration: on macOS os.tmpdir() is /var/... and node's
 *  resolver answers with the /private/var/... realpath, so every comparison
 *  against a path node returned would read as "outside the tree". */
function materialise(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'js-res-')));
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(FIXTURES, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) { fs.mkdirSync(path.join(root, r), { recursive: true }); walk(r); }
      else if (e.name.endsWith('.txt')) fs.copyFileSync(path.join(FIXTURES, r), path.join(root, r.slice(0, -4)));
    }
  };
  walk('');
  // a package with dependencies has node_modules above it; without this the
  // bare specifier's answer depends on where the temp directory happens to
  // sit, which is a property of the machine and not of the model
  fs.symlinkSync(path.join(REPO_DIR, 'node_modules'), path.join(root, 'node_modules'), 'dir');
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
// it, but being wrong costs node_modules
process.on('exit', () => {
  try { fs.unlinkSync(path.join(ROOT, 'node_modules')); } catch { /* already gone */ }
  fs.rmSync(ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// THE TWO ENVIRONMENTS. One axis, and it is this repository's own situation:
// sources run under a loader that understands `.ts`, and would deploy compiled.

const ENV_TS: ResolveEnv = { name: 'env_ts_loader', extensions: ['.js', '.json', '.node', '.ts'] };
const ENV_PLAIN: ResolveEnv = { name: 'env_plain_node', extensions: ['.js', '.json', '.node'] };
const ENVS = [ENV_TS, ENV_PLAIN];

// ---------------------------------------------------------------------------
// the blind host emitters the RULE model needs (declared in
// facts/js-modules.rofl). Copied rather than shared on purpose: this file is
// measuring that model, and a probe that imports its subject's helpers cannot
// report a change in them.

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
// building the world

const BOOT = readRepo('boot.rofl');
const STRUCTURE = readRepo('rules/js-structure.rofl');
const KINDS = readRepo('facts/js-kinds.rofl');
const MODEL = readRepo('rules/js-model.rofl');
const MOD_RULES = readRepo('rules/js-modules.rofl');
const MOD_FACTS = readRepo('facts/js-modules.rofl');
const RES_RULES = readRepo('rules/js-resolve.rofl');
const RES_FACTS = readRepo('facts/js-resolve.rofl');

const idem = (s: string): string => s;

interface BuildOpts {
  /** mutate rules/js-resolve.rofl */
  rules?: (s: string) => string;
  /** mutate the fact text the observer produced */
  hostFacts?: (s: string) => string;
  /** which environments the observer runs */
  envs?: ResolveEnv[];
  /** substitute a deliberately broken oracle */
  resolver?: Resolver;
  /** rewrite a.ts BEFORE the rule model's scanner sees it. The observer still
   *  reads the real file off the disk, which is what makes a place the model
   *  missed reportable at all. */
  modelSource?: (src: string) => string;
  /** appended verbatim, for planting a forgery */
  extra?: string;
}

function unq(t: string): string | null {
  if (t.length < 2 || t[0] !== '"' || t[t.length - 1] !== '"') return null;
  let out = '';
  for (let i = 1; i < t.length - 1; i++) { if (t[i] === '\\') out += t[++i] as string; else out += t[i] as string; }
  return out;
}

function build(opts: BuildOpts = {}): Rofl {
  const r = new Rofl();
  const load = (text: string, what: string, who?: string): void => {
    const res = r.load(text, who === undefined ? {} : { who });
    assert.ok(res.ok, `${what} loads: ${res.diagnostics.slice(0, 3).join(' | ')}`);
  };
  load(BOOT, 'boot.rofl');
  // THE PREAMBLE, and it is why boot.rofl is loaded at all. `forged[audit]` is
  // a live gate here: every fact below is signed by the tool that produced it,
  // so a ledger's writers have to be named or the audit reports the whole
  // corpus. `js_resolve`'s own authority is declared in facts/js-resolve.rofl,
  // where it is a claim the model makes about itself; `scanner` is js_ast's and
  // is granted here, because the world this file builds is what has a scanner
  // in it. Measured before it existed: 409 forged rows, all of them honest.
  load('authority(code, scanner).', 'scanner authority');

  // the RULE model's input: the AST, the disk, the string algebra
  for (const f of FILES) {
    let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (opts.modelSource && f === 'a.ts') src = opts.modelSource(src);
    load(scan(src, { file: f }).facts.join('\n'), f, 'scanner');
  }
  load(fsFacts(ROOT).join('\n'), 'fs facts', 'scanner');
  const strs = new Set<string>();
  for (const row of r.query('ast_attr[code](_, value, V)').rows) {
    const v = unq(row.bindings['V'] ?? '');
    if (v !== null) strs.add(v);
  }
  const sf: string[] = [];
  for (const s of strs) sf.push(...strFacts(s));
  load(sf.join('\n'), 'str facts', 'scanner');

  // the OBSERVER's input: node's own resolver, in each environment. It parses
  // the files itself off the disk and never reads a ROFL fact.
  const obs = observe({
    root: ROOT, files: FILES,
    envs: opts.envs ?? ENVS,
    resolver: opts.resolver ?? nodeResolver,
  });
  load((opts.hostFacts ?? idem)(obs.facts.join('\n')), 'host observations', 'js_resolve');

  load(STRUCTURE, 'js-structure');
  load(KINDS, 'js-kinds');
  load(MODEL, 'js-model');
  load(MOD_FACTS, 'js-modules facts');
  load(MOD_RULES, 'js-modules rules');
  load(RES_FACTS, 'js-resolve facts');
  load((opts.rules ?? idem)(RES_RULES), 'js-resolve rules');
  if (opts.extra) load(opts.extra, 'extra', 'mallory');
  return r;
}

const count = (r: Rofl, goal: string): number => r.query(goal).rows.length;
const col = (r: Rofl, goal: string, ...vars: string[]): string[] =>
  r.query(goal).rows.map((row) => vars.map((v) => unq(row.bindings[v] ?? '') ?? row.bindings[v] ?? '').join(' | ')).sort();

const W = build();

// the site the demonstrations key on: `./pick` resolves in BOTH environments
// and to DIFFERENT FILES, which is the case the whole file exists for
const PICK = 'a.ts:8:./pick';

/** a.ts with one import site removed — the rule model's scanner never sees it,
 *  the observer still reads the file off the disk.
 *
 *  The line is REPLACED rather than deleted, and that is not cosmetic: a site
 *  is named (file, line, specifier), so deleting a line renumbers every site
 *  below it and the join breaks for all of them at once. Measured — the first
 *  version reported eight unseen places for one removed import, which would
 *  have credited the gate with a precision it had not shown. */
const HIDE_ONLYTS = (s: string): string =>
  s.split('\n').map((l) => l.includes("'./onlyts'") ? '// (this site is hidden from the rule model)' : l).join('\n');

/** ...and a.ts with TWO import sites on ONE LINE, sharing a specifier: the
 *  (file, line, specifier) key really does stop being a key. */
const DOUBLE_ON_ONE_LINE = (s: string): string =>
  s.replace("import { b } from './b.ts';",
    "import { b } from './b.ts'; import { b as b9 } from './b.ts';");

// ===========================================================================
// 1. THE CENSUS

test('census: every place is enumerated, every place is spoken about', () => {
  const places = count(W, 'resolve_place[code](S)');
  const literal = count(W, 'resolve_site[code](S, F, L, Sp)');
  const computed = count(W, 'resolve_site_computed[code](S, F, L)');
  const tries = count(W, 'resolve_try[env_ts_loader](S, K, P, O)')
    + count(W, 'resolve_try[env_plain_node](S, K, P, O)');
  const answers = count(W, 'resolves_to[env_ts_loader](S, P)')
    + count(W, 'resolves_to[env_plain_node](S, P)');
  const failed = count(W, 'resolve_failed[env_ts_loader](S, R)')
    + count(W, 'resolve_failed[env_plain_node](S, R)');
  const unasked = count(W, 'resolve_unasked[env_ts_loader](S, R)')
    + count(W, 'resolve_unasked[env_plain_node](S, R)');

  console.log(`\n  places ${places} = literal ${literal} + computed ${computed}`);
  console.log(`  over 2 environments: answers ${answers} + failed ${failed} + unasked ${unasked}` +
    ` = ${answers + failed + unasked} (places x envs = ${places * 2})`);
  console.log(`  candidates node actually stat'd, both environments: ${tries}`);

  assert.equal(literal + computed, places, 'a place has a literal specifier or none');
  assert.equal(answers + failed + unasked, places * 2, 'every place, in every environment, got a verdict');

  // POSITIVE CONTROL. All of the above is satisfied by a probe that measured
  // nothing at all, so the numbers have to be shown to be non-trivial.
  assert.ok(places >= 11, `the observer found sites: ${places}`);
  assert.ok(tries > 20, `node was actually made to search: ${tries} candidates`);
  assert.ok(answers > 0 && failed > 0 && unasked > 0, 'all three verdicts occur');

  // the `checked` rows are a count, and a count that nobody re-derives rots
  const decl = col(W, 'checked(js, K, modules, R, o_node_resolver_traced, N)', 'K', 'N');
  console.log('  checked rows:', decl.join(' ; '));
  assert.deepEqual(decl, [`import_declaration | ${literal}`, `import_expression | ${computed}`]);
});

test('every declared mechanism occurs, and every mechanism that occurs is declared', () => {
  const seen = col(W, 'mechanism_seen[audit](M)', 'M');
  const byMech = new Map<string, number>();
  for (const e of ['env_ts_loader', 'env_plain_node']) {
    for (const row of W.query(`resolve_via[${e}](S, M, D)`).rows) {
      const m = row.bindings['M'] ?? '?';
      byMech.set(m, (byMech.get(m) ?? 0) + 1);
    }
  }
  console.log('\n  mechanisms:', [...byMech].sort().map(([k, v]) => `${k} ${v}`).join(', '));
  assert.equal(count(W, 'mechanism_undeclared[audit](M)'), 0);
  assert.equal(count(W, 'mechanism_unexercised[audit](M)'), 0);
  assert.equal(seen.length, 7, 'all seven mechanisms in the vocabulary occur');
});

// ===========================================================================
// 2. THE ENVIRONMENT DIVERGENCE — the measurement the perspective claim rests
//    on. If two ledgers never disagree, one ledger would have done.

test('DIVERGENCE, environment against environment: same import, different answer', () => {
  const rows = col(W, 'env_divergence[audit](S, A, VA, B, VB)', 'S', 'A', 'VA', 'B', 'VB');
  const sites = col(W, 'env_divergent_site[audit](S)', 'S');
  // the relation is symmetric, so each disagreement appears once per ordering
  console.log(`\n  environment-divergent sites: ${sites.length} (${rows.length} ordered rows)`);
  for (const s of sites) {
    const a = col(W, `host_verdict[env_ts_loader](${q(s)}, V)`, 'V');
    const b = col(W, `host_verdict[env_plain_node](${q(s)}, V)`, 'V');
    console.log(`    ${s}\n        env_ts_loader  -> ${a.join(',')}\n        env_plain_node -> ${b.join(',')}`);
  }

  assert.ok(sites.length >= 1, 'the two environments really disagree — otherwise one ledger would do');
  assert.equal(rows.length, sites.length * 2, 'each disagreement, once per ordering');

  // the three named cases, each a different KIND of disagreement
  const verdict = (e: string, s: string): string => col(W, `host_verdict[${e}](${q(s)}, V)`, 'V').join(',');
  // (a) both resolve, to DIFFERENT FILES — "works on my machine" in its purest
  //     form, and the one a model that had to pick one answer could not state
  assert.equal(verdict('env_ts_loader', PICK), 'pick.ts');
  assert.equal(verdict('env_plain_node', PICK), 'pick/index.js');
  // (b) and (c) one resolves, the other cannot find the module at all
  assert.equal(verdict('env_ts_loader', 'a.ts:9:./onlyts'), 'onlyts.ts');
  assert.equal(verdict('env_plain_node', 'a.ts:9:./onlyts'), 'no_answer');
  assert.equal(verdict('env_ts_loader', 'a.ts:10:./idx2'), 'idx2/index.ts');
  assert.equal(verdict('env_plain_node', 'a.ts:10:./idx2'), 'no_answer');
  assert.deepEqual(sites, ['a.ts:10:./idx2', 'a.ts:8:./pick', 'a.ts:9:./onlyts']);

  // ...and the CONTROL that says the divergence is specific rather than
  // global: the environment that finds more does not find different everywhere
  const agree = col(W, 'host_verdict[env_ts_loader](S, V)', 'S', 'V')
    .filter((x) => col(W, 'host_verdict[env_plain_node](S, V)', 'S', 'V').includes(x));
  console.log(`  places the two environments AGREE on: ${agree.length}`);
  assert.ok(agree.length > sites.length, 'most places do not depend on the environment');
});

// ===========================================================================
// 3. THE MODEL DIVERGENCE — the work queue, with a length.

test('DIVERGENCE, rules against host: the distance between two models, as a number', () => {
  const div = col(W, 'resolve_divergence[audit](S, R, H, E)', 'E', 'S', 'R', 'H');
  const agree = count(W, 'resolve_agreement[audit](S, V, E)');
  console.log(`\n  rules vs host: agreement ${agree}, divergence ${div.length}`);
  for (const d of div) console.log('    DIVERGE:', d);

  assert.equal(count(W, 'uncompared[audit](S, E)'), 0, 'every site with both verdicts is compared');
  assert.ok(agree > 0, 'the comparison is capable of agreeing');
  assert.ok(div.length > 0, 'and capable of disagreeing');

  // the two the brief predicted, both present, both in both environments: the
  // rule model declines a package name and a package subpath and the host
  // resolves them
  for (const e of ['env_ts_loader', 'env_plain_node']) {
    assert.ok(div.some((d) => d.startsWith(e) && d.includes('@babel/parser')), `${e}: bare specifier`);
    assert.ok(div.some((d) => d.startsWith(e) && d.includes('#sub/deep.ts')), `${e}: package subpath`);
  }
  // ...and the ones the fixture added: extension guessing and index files, which
  // the path walk in rules/js-modules.rofl does not do
  assert.ok(div.some((d) => d.includes('./pick')), 'extension guessing / index files');

  // AGREEMENT IS NOT VACUOUS EITHER: the two models really do meet on the
  // ordinary cases, including a builtin, which each canonicalises separately
  const ag = col(W, 'resolve_agreement[audit](S, V, env_ts_loader)', 'S', 'V');
  console.log('    agreements (env_ts_loader):', ag.join(' ; '));
  assert.ok(ag.some((x) => x.includes('./b.ts') && x.includes('b.ts')));
  assert.ok(ag.some((x) => x.includes('path') && x.includes('node:path')));
});

// ===========================================================================
// 4. THE WHY-TREE — what the trace buys, shown rather than described.

test('WHY: the answer stands on the failed attempts, and they are in the tree', () => {
  const w = W.why(`resolves_to[env_plain_node](${q(PICK)}, "pick/index.js")`);
  assert.ok(w.ok, w.text);
  console.log('\n  why resolves_to[env_plain_node]("' + PICK + '", "pick/index.js"):\n');
  console.log(w.text.split('\n').map((l) => '    ' + l).join('\n'));

  // the candidates node tried and did NOT find are IN the tree, by name
  for (const missed of ['pick.js', 'pick.json', 'pick.node']) {
    assert.ok(w.text.includes(missed), `the tree names the failed candidate ${missed}`);
  }
  assert.ok(w.text.includes('resolve_try'), 'the tree bottoms out in observations');
  assert.ok(w.text.includes('resolve_via'), 'and names the mechanism');
});

// ===========================================================================
// 5. THE GATES — each with a planted defect proving it can say no.

const GATES: { goal: string; why: string; plant: BuildOpts }[] = [
  {
    goal: 'answer_without_trace[audit](S, E, P)',
    why: 'an answer the recorded search does not reach',
    plant: { hostFacts: (s) => s.split('\n').filter((l) => !l.includes(', file).')).join('\n') },
  },
  {
    goal: 'answer_without_mechanism[audit](S, E)',
    why: 'an answer with no mechanism accounting for it',
    plant: { hostFacts: (s) => s.split('\n').filter((l) => !l.startsWith('resolve_via[')).join('\n') },
  },
  {
    goal: 'resolve_silent[audit](S, E)',
    why: 'a place an environment said nothing at all about',
    plant: { hostFacts: (s) => s.split('\n').filter((l) => !l.startsWith('resolve_failed[')).join('\n') },
  },
  {
    goal: 'answer_ambiguous[audit](S, E, A, B)',
    why: 'one ledger holding two answers for one place',
    plant: { envs: [ENV_TS, { name: 'env_ts_loader', extensions: ENV_PLAIN.extensions }] },
  },
  {
    goal: 'env_unobserved[audit](E)',
    why: 'a declared environment nothing ran',
    plant: { envs: [ENV_TS] },
  },
  {
    goal: 'env_undeclared[audit](E)',
    why: 'an environment that ran and was never declared',
    plant: { envs: [ENV_TS, { name: 'env_smuggled', extensions: ENV_PLAIN.extensions }] },
  },
  {
    goal: 'site_unseen_by_model[audit](S)',
    why: 'a place the observer found and the rule model did not',
    plant: { modelSource: HIDE_ONLYTS },
  },
  {
    goal: 'site_unseen_by_host[audit](I)',
    why: 'an import site the rule model found and the observer did not',
    plant: { hostFacts: (s) => s.split('\n').filter((l) => !l.includes(':6:./b.ts')).join('\n') },
  },
  {
    goal: 'uncompared[audit](S, E)',
    why: 'two models that stopped checking each other',
    plant: { rules: (s) => s.replace(/^resolve_divergence\[audit\]/gm, 'muted_resolve_divergence[audit]') },
  },
  {
    goal: 'mechanism_undeclared[audit](M)',
    why: 'a mechanism outside the declared vocabulary',
    plant: { hostFacts: (s) => s.replace(/, builtin, /g, ', telepathy, ') },
  },
  {
    goal: 'mechanism_unexercised[audit](M)',
    why: 'a mechanism declared and never observed',
    plant: { hostFacts: (s) => s.split('\n').filter((l) => !l.includes(', imports_map, ')).join('\n') },
  },
  {
    goal: 'site_key_ambiguous[audit](S, I, J)',
    why: '(file, line, specifier) stopped being a key',
    // two import declarations, one line, one specifier: the observer names one
    // place and the rule model has two nodes for it
    plant: { modelSource: DOUBLE_ON_ONE_LINE },
  },
  {
    goal: 'forged[audit](F)',
    why: 'an impostor writing into an environment ledger',
    plant: { extra: 'resolves_to[env_ts_loader]("nowhere", "anywhere").' },
  },
];

test('every audit gate reads ZERO on the model as written', () => {
  for (const g of GATES) assert.equal(count(W, g.goal), 0, `${g.goal} — ${g.why}`);
  // ...and the kernel's own audits, on a program that loads boot.rofl
  for (const g of ['malformed[audit](R)', 'breach[audit](R)', 'leak[audit](A, B)',
    'unmoded[audit](R)', 'undefined_premise[audit](R, Rel)', 'orphan_claim[audit](L, K, La)',
    'double_claimed[audit](L, K, La)']) {
    assert.equal(count(W, g), 0, g);
  }

  // `unverified[audit]` is NOT asserted to zero, and the reason is a
  // measurement rather than a convenience: it counts every `handled` claim in
  // the loaded corpus with no `checked` row beside it, and this world loads
  // three layers' worth of them. Zero would be a claim about other people's
  // files. What IS asserted is that neither of the two claims THIS layer adds
  // is among them — the gap it inherits is reported, the gap it creates is not.
  const unver = col(W, 'unverified[audit](L, K, La, R)', 'R');
  console.log(`\n  unverified claims in the whole loaded corpus: ${unver.length}` +
    ` (this layer contributes 0 of them)`);
  assert.ok(unver.length > 0, 'the relation is populated, so the filter below is not vacuous');
  for (const mine of ['r_host_observed_resolution', 'r_host_unasked_without_a_literal']) {
    assert.ok(!unver.includes(mine), `${mine} is claimed AND checked`);
  }
});

for (const g of GATES) {
  test(`gate can say NO: ${g.goal} — ${g.why}`, () => {
    const broken = build(g.plant);
    const n = count(broken, g.goal);
    assert.ok(n > 0, `${g.goal} stayed silent under a planted defect — it is an assumption, not a gate`);
    console.log(`    ${g.goal} -> ${n} row(s) under the planted defect`);
  });
}

// ===========================================================================
// 6. THE MUTANT SET — one mutant is liveness, a set is coverage.
//
// Each entry says which CONSTRAINT it targets. A survivor is a real result and
// is reported rather than hidden.

interface Mutant {
  name: string; targets: string; plant: BuildOpts;
  /** what must go red. A description of the damage, or null if it survived. */
  damage: (r: Rofl) => string | null;
}

/** the honest baseline the mutants are measured against */
const BASE = {
  answers: count(W, 'resolves_to[env_ts_loader](S, P)') + count(W, 'resolves_to[env_plain_node](S, P)'),
  envSites: count(W, 'env_divergent_site[audit](S)'),
  divergence: count(W, 'resolve_divergence[audit](S, R, H, E)'),
  whyLines: W.why(`resolves_to[env_plain_node](${q(PICK)}, "pick/index.js")`).text.split('\n').length,
};

/** node's resolver, asked and then part-swallowed. Both wrappers below are
 *  faithful to their mutant: the DAMAGE is in what the observer reports, not
 *  in what node did. */
const swallowing: Resolver = (spec, importer, env, root) => {
  const r = nodeResolver(spec, importer, env, root);
  return r.failure !== null ? { answer: null, failure: null, trace: [] } : r;
};

/** an observer that never asks: it builds a path out of the specifier and the
 *  importing directory, which is what "resolution" looks like if you have
 *  never met a node_modules */
const firstPathResolver: Resolver = (spec, importer, _env, root) => {
  const segs = spec.split('/');
  const guess = path.join(path.dirname(importer), segs[segs.length - 1] as string);
  const rel = path.relative(root, guess).split(path.sep).join('/');
  return { answer: rel, failure: null, trace: [] };
};

const MUTANTS: Mutant[] = [
  {
    name: '1. the trace is written only for the attempt that SUCCEEDED',
    targets: 'EXPLAINABILITY. If the failed candidates are decoration, removing them changes a ' +
      'count and nothing else, and `why` is no poorer for it.',
    plant: { hostFacts: (s) => s.split('\n').filter((l) => !l.includes(', miss).') && !l.includes(', dir).')).join('\n') },
    damage: (r) => {
      const left = count(r, 'resolves_to[env_ts_loader](S, P)') + count(r, 'resolves_to[env_plain_node](S, P)');
      const w = r.why(`resolves_to[env_plain_node](${q(PICK)}, "pick/index.js")`);
      const gaps = count(r, 'answer_without_trace[audit](S, E, P)');
      if (left === BASE.answers && w.ok) return null;
      return `answers ${BASE.answers} -> ${left}; answer_without_trace ${gaps}; ` +
        `why on ${PICK}: ${BASE.whyLines} lines -> ${w.ok ? w.text.split('\n').length + ' lines' : 'DOES NOT HOLD (' + w.text.slice(0, 60) + ')'}`;
    },
  },
  {
    name: '2. both environments write into ONE ledger',
    targets: 'the VARIABILITY of the environment. If the divergence merely stops being counted and ' +
      'nothing objects, the perspective slot was carrying no weight.',
    plant: { envs: [ENV_TS, { name: 'env_ts_loader', extensions: ENV_PLAIN.extensions }] },
    damage: (r) => {
      const env = count(r, 'env_divergent_site[audit](S)');
      const amb = count(r, 'answer_ambiguous[audit](S, E, A, B)');
      const uno = col(r, 'env_unobserved[audit](E)', 'E');
      const parts: string[] = [];
      if (env < BASE.envSites) parts.push(`environment divergence ${BASE.envSites} -> ${env}`);
      if (amb > 0) parts.push(`answer_ambiguous fires ${amb}x: one book, two answers for one place`);
      if (uno.length > 0) parts.push(`env_unobserved names ${uno.join(',')}`);
      return parts.length >= 2 ? parts.join('; ') : null;
    },
  },
  {
    name: '3. resolve_divergence derives nothing',
    targets: 'whether ANYONE notices that the two models stopped checking each other. A comparison ' +
      'that quietly stops is the failure mode a count alone cannot see.',
    plant: { rules: (s) => s.replace(/^resolve_divergence\[audit\]/gm, 'muted_resolve_divergence[audit]') },
    damage: (r) => {
      const n = count(r, 'uncompared[audit](S, E)');
      const d = count(r, 'resolve_divergence[audit](S, R, H, E)');
      return n > 0 ? `resolve_divergence ${BASE.divergence} -> ${d}, and uncompared reports ${n} site(s) ` +
        'nobody compares any more' : null;
    },
  },
  {
    name: '4. the observer returns a path it built itself, never asking node',
    targets: 'whether this is an ORACLE or a second guess. A host that answers from the specifier ' +
      'alone is the rule model again, with fewer rules and no audit.',
    plant: { resolver: firstPathResolver },
    damage: (r) => {
      const gaps = count(r, 'answer_without_trace[audit](S, E, P)');
      const env = count(r, 'env_divergent_site[audit](S)');
      const parts: string[] = [];
      if (gaps > 0) parts.push(`answer_without_trace reports ${gaps} answer(s) no search reaches`);
      if (env < BASE.envSites) parts.push(`environment divergence ${BASE.envSites} -> ${env}: the guess does not depend on the environment`);
      return parts.length >= 2 ? parts.join('; ') : null;
    },
  },
  {
    name: '5. the observer swallows the resolver\'s exception and writes nothing',
    targets: 'the DISTINGUISHABILITY of "it did not resolve" from "nobody asked". Both produce no ' +
      'answer; only one of them is a fact about the import.',
    plant: { resolver: swallowing },
    damage: (r) => {
      const silent = col(r, 'resolve_silent[audit](S, E)', 'S', 'E');
      const failed = count(r, 'resolve_failed[env_ts_loader](S, R)') + count(r, 'resolve_failed[env_plain_node](S, R)');
      return silent.length > 0
        ? `resolve_failed rows -> ${failed}, and resolve_silent names ${silent.length} place(s) the ` +
          `environment said nothing about, e.g. ${silent[0]}`
        : null;
    },
  },
  {
    name: '6. one import site is invisible to the rule model',
    targets: 'whether the probe enumerates its OWN places. If it took the site list from the model, ' +
      'a place the model missed could never be reported as missing.',
    plant: { modelSource: HIDE_ONLYTS },
    damage: (r) => {
      const unseen = col(r, 'site_unseen_by_model[audit](S)', 'S');
      const sites = count(r, 'import_site[code](I, K)');
      return unseen.length > 0
        ? `the model now sees ${sites} import sites (was ${count(W, 'import_site[code](I, K)')}), and ` +
          `site_unseen_by_model names exactly the missing one: ${unseen.join(',')}`
        : null;
    },
  },
];

for (const m of MUTANTS) {
  test(`MUTANT ${m.name}`, () => {
    const r = build(m.plant);
    const d = m.damage(r);
    console.log(`\n    targets: ${m.targets}`);
    console.log(`    verdict: ${d === null ? 'SURVIVED — nothing here covers this' : 'KILLED — ' + d}`);
    assert.ok(d !== null, `mutant SURVIVED: ${m.name}`);
  });
}
