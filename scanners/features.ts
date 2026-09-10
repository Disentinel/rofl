// scanners/features.ts — WHAT THIS SYSTEM CAN DO, AND WHICH DEMO SHOWS IT.
//
// There was no enumeration of the language's or the engine's features. The
// three things that came closest are each about something else: facts/spec.rofl
// lists 122 OBLIGATIONS with citations, README's tables list the kernel's
// VOCABULARY, and scripts/flag_census.ts lists the API's optional FLAGS. None
// of them says what the system can do.
//
// So this derives it, from three places that cannot go stale behind a list:
//
//   language   the reflection of every demo's own `.rofl`. A destructor, an
//              arithmetic operator, a comparison, negation, a tense, a
//              perspective, a nullary head — read off `premise_lit` and
//              `conclusion_lit`, including operands NESTED inside a builtin,
//              which is where `+` and `str_pre` hide.
//   host       the public methods of `src/api.ts`, read off the class, and
//              their use in each demo's TypeScript — PARSED, because a mention
//              in a comment and a call are opposites here, which is the lesson
//              scripts/flag_census.ts already paid for.
//   flags      an optional property of an options object taken by a public
//              method, same source, same parse.
//
// Run: npm run features
//      npm run features -- --cover     a greedy covering set of demos

import { Rofl } from '../src/api.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from '@babel/parser';
import { ARITH_OPS } from '../src/unify.ts';
import { CMP_OPS } from '../src/parser.ts';
import { STR_ARITY } from '../src/reflect.ts';
import { declaredFlags } from '../scripts/flag_census.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const unq = (t: unknown): string => String(t).replace(/^"|"$/g, '');

// EVERY LIST HERE IS THE ONE THE CODE DISPATCHES ON. Typed beside it, two of
// the three were wrong: the arithmetic set spelled modulo `%`, which this
// language writes `mod`, so the census reported a feature that does not exist —
// and then reported that no demo uses it, which was true and meaningless.
const DESTR = [...STR_ARITY.keys()];
const ARITH = [...ARITH_OPS];
const CMP = [...CMP_OPS, 'is'];

/** The class's own methods. A list typed here would go stale on the day a
 *  method is added, which is the day it matters. */
function apiSurface(): string[] {
  // THE METHODS OF `Rofl`, FROM THE CLASS BODY. Parsed rather than matched —
  // the regex this replaced anchored on two spaces of indentation. And the
  // first parse was wrong the other way: it took every ClassMethod AND
  // ClassProperty anywhere in the file, so `store`, `diagnostics` and four
  // option FIELDS read as entry points, while `fromSnapshot` — static, and as
  // public as anything here — was excluded for being static.
  const ast = parse(fs.readFileSync(path.join(ROOT, 'src/api.ts'), 'utf8'),
    { sourceType: 'module', plugins: ['typescript'] });
  const out = new Set<string>();
  const body = (n: unknown): void => {
    const o = n as Record<string, unknown>;
    for (const m of (o.body as Record<string, unknown>[]) ?? []) {
      if (m.type !== 'ClassMethod' || m.computed) continue;
      if (m.kind === 'get' || m.kind === 'set') continue;
      if (m.accessibility === 'private') continue;
      const k = (m.key as Record<string, unknown> | undefined)?.name;
      if (typeof k === 'string' && k !== 'constructor' && !k.startsWith('#')) out.add(k);
    }
  };
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    const id = (o.id as Record<string, unknown> | undefined)?.name;
    if (o.type === 'ClassDeclaration' && id === 'Rofl') body(o.body);
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(ast);
  return [...out].sort();
}

/** Every feature a `.rofl` text uses. The operands of `$builtin(Op, Args)` are
 *  walked as TEXT of the reified term, because an operator functor is not
 *  writable as a term pattern — `*(A, B)` is refused by the parser — so no rule
 *  can see inside an arithmetic operand. */
export function langFeatures(src: string): Set<string> {
  const f = new Set<string>();
  const r = new Rofl();
  if (!r.load(src, { who: 's', budget: 40_000_000 }).ok) return f;
  try { r.evaluate(40_000_000); } catch { return f; }
  for (const x of r.query('premise_lit(Rr, K, $builtin(Op, Args))').rows) {
    f.add('op:' + unq(x.bindings.Op));
    const a = String(x.bindings.Args);
    for (const o of [...DESTR, ...ARITH]) if (a.includes(o + '(')) f.add('op:' + o);
  }
  if (r.query('premise_lit(Rr, K, $not(_))').rows.length) f.add('negation');
  for (const x of r.query('conclusion_tense(Rr, T)').rows) f.add('tense:' + unq(x.bindings.T));
  for (const x of r.query('premise_lit(Rr, K, $lit(_, P, _, _))').rows) {
    const p = unq(x.bindings.P);
    if (p !== 'main' && p !== '$kernel') f.add('perspective');
  }
  if (r.query('conclusion_lit(Rr, 1, $lit(_, _, $nil, _))').rows.length) f.add('nullary head');
  return f;
}

/** Every API method and flag a demo's TypeScript actually calls. Parsed: a name
 *  in a comment is not a use, and the two look identical to grep. */
export function hostFeatures(file: string, surface: Set<string>): Set<string> {
  const f = new Set<string>();
  const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['typescript'] });
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (o.type === 'CallExpression') {
      const c = o.callee as Record<string, unknown> | undefined;
      if (c && c.type === 'MemberExpression' && !c.computed) {
        const p = (c.property as Record<string, unknown> | undefined)?.name;
        if (typeof p === 'string' && surface.has(p)) f.add('api:' + p);
      }
    }
    if (o.type === 'ObjectProperty' && !o.computed) {
      const k = (o.key as Record<string, unknown> | undefined)?.name;
      if (typeof k === 'string' && FLAGS.has(k)) f.add('flag:' + k);
    }
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(ast);
  return f;
}

/** The optional properties of the options objects the public methods take —
 *  the same definition scripts/flag_census.ts uses, read off the same file. */
/** A FLAG IS AN OPTIONAL PROPERTY OF AN OPTIONS OBJECT A PUBLIC METHOD TAKES,
 *  and that definition is already written and already parsed — in
 *  scripts/flag_census.ts, which exists to keep every flag exercised by a demo.
 *  Re-deriving it here with a regex produced `error` and `unpopulatable` as
 *  flags: they are fields of `QueryResult`, OUTPUTS, and the regex matched any
 *  optional property of any interface in the file. Both then read as orphan
 *  capabilities, which is a defect wearing a finding's clothes. A second
 *  crude pass also truncated `maxTicks` to `max` and `onFixpoint` to `on`. */
const FLAGS = new Set<string>(
  declaredFlags(fs.readFileSync(path.join(ROOT, 'src/api.ts'), 'utf8')).map((f) => f.name));

export interface Demo { name: string; features: Set<string>; }

export function scan(): { demos: Demo[]; all: string[] } {
  const surface = new Set(apiSurface());
  const ex = path.join(ROOT, 'examples');
  const demos: Demo[] = [];
  for (const e of fs.readdirSync(ex).sort()) {
    const dir = path.join(ex, e);
    if (!fs.statSync(dir).isDirectory()) continue;
    const f = new Set<string>();
    for (const x of fs.readdirSync(dir).filter((x) => x.endsWith('.rofl')))
      for (const k of langFeatures(fs.readFileSync(path.join(dir, x), 'utf8'))) f.add(k);
    const demo = path.join(dir, 'demo.ts');
    if (fs.existsSync(demo)) for (const k of hostFeatures(demo, surface)) f.add(k);
    if (f.size > 0) demos.push({ name: e, features: f });
  }
  // THE FEATURE LIST COMES FROM THE SYSTEM, NOT FROM THE DEMOS. The first
  // version took the union of what the demos use, and reported 41 of 41
  // covered — which it could not have failed to. A corpus built for a table
  // cannot surprise it (f_a_corpus_built_for_a_table_cannot_surprise_it); the
  // list has to be what the system CAN do, and then coverage is a number that
  // can be short.
  const all = [
    ...[...DESTR, ...ARITH, ...CMP].map((x) => 'op:' + x),
    ...[...surface].map((x) => 'api:' + x),
    ...[...FLAGS].map((x) => 'flag:' + x),
    'negation', 'tense:now', 'tense:next', 'perspective', 'nullary head',
  ].sort();
  return { demos, all };
}

/** GREEDY, AND SAID SO. Minimum set cover is NP-hard; greedy is within a log
 *  factor and the answer here is a handful of demos, so the distinction is
 *  academic — but calling a greedy answer minimal is the kind of claim this
 *  repository has a word for. */
export function cover(demos: Demo[], all: string[]): { pick: string[]; got: Set<string> } {
  const need = new Set(all); const pick: string[] = []; const left = [...demos];
  while (need.size > 0) {
    left.sort((a, b) => [...b.features].filter((f) => need.has(f)).length
                      - [...a.features].filter((f) => need.has(f)).length);
    const best = left.shift();
    if (!best || [...best.features].filter((f) => need.has(f)).length === 0) break;
    pick.push(best.name);
    for (const f of best.features) need.delete(f);
  }
  return { pick, got: new Set(all.filter((f) => !need.has(f))) };
}

/** THE BRIDGE FROM A GOAL TO A CAPABILITY, and it is derived rather than
 *  labelled. facts/spec.rofl already carries 129 duties and 118 `guards[map]`
 *  rows saying which CHECK stands for which duty, plus `cited_check[map]`
 *  naming the FILE each check lives in. A file's features are the same parse a
 *  demo gets. So: duty -> check -> file -> feature, with nothing typed by hand
 *  in between. */
export function checkFeatures(): { guards: [string, string][]; uses: Map<string, Set<string>> } {
  // A FACT PACK IS READ BY LOADING IT. facts/spec.rofl is 547 lines of data
  // this system can answer questions about; matching it with a regex is a
  // second parser for a language that ships one.
  const r = new Rofl();
  r.load(fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8'));
  if (!r.load(fs.readFileSync(path.join(ROOT, 'facts/spec.rofl'), 'utf8')).ok)
    throw new Error('facts/spec.rofl does not load');
  r.evaluate();
  const col = (lit: string, ...vs: string[]): string[][] =>
    r.query(lit).rows.map((x) => vs.map((v) => String(x.bindings[v]).replace(/^"|"$/g, '')));
  const guards = col('guards[map](C, D)', 'C', 'D').map(([c, d]) => [c, d] as [string, string]);
  const surface = new Set(apiSurface());
  const uses = new Map<string, Set<string>>();
  for (const [check, rel] of col('cited_check[map](C, F, T)', 'C', 'F')) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const f = uses.get(check) ?? new Set<string>();
    if (file.endsWith('.ts')) for (const k of hostFeatures(file, surface)) f.add(k);
    if (file.endsWith('.rofl')) for (const k of langFeatures(fs.readFileSync(file, 'utf8'))) f.add(k);
    uses.set(check, f);
  }
  return { guards, uses };
}

function emit(demos: Demo[], all: string[]): string {
  const { guards, uses } = checkFeatures();
  const L = [
    '-- facts/feature-map.rofl — GENERATED by scanners/features.ts.',
    '--',
    '-- What this system can do, who shows it, and which promise stands over it.',
    '-- `feature` is the SYSTEM side — the destructor table, the operator set,',
    '-- the public API surface, the option flags — never the union of what the',
    '-- demos happen to use, because a list taken from its own corpus cannot be',
    '-- short.',
    '--',
    '-- Reasoning: rules/features.rofl.',
    '',
    'edb(feature).', 'edb(demo_uses).', 'edb(check_uses).', '',
  ];
  const kind = (f: string): string =>
    f.startsWith('op:') ? 'language' : f.startsWith('api:') ? 'entry_point'
      : f.startsWith('flag:') ? 'contract_flag' : 'construct';
  for (const f of all) L.push(`feature("${f}", ${kind(f)}).`);
  L.push('');
  for (const d of demos) for (const f of [...d.features].sort()) L.push(`demo_uses("${d.name}", "${f}").`);
  L.push('');
  for (const [c, fs2] of [...uses].sort()) for (const f of [...fs2].sort()) L.push(`check_uses(${c}, "${f}").`);
  L.push('');
  L.push(`-- ${all.length} features, ${demos.length} demos, ${uses.size} checks, ${guards.length} guard rows.`);
  return L.join('\n') + '\n';
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'features.ts';
if (isMain) {
  const { demos, all } = scan();
  const byKind = (p: string): string[] => all.filter((f) => f.startsWith(p));
  console.log(`${all.length} features over ${demos.length} demos\n`);
  for (const [label, pre] of [['язык', 'op:'], ['API', 'api:'], ['флаги', 'flag:']] as [string, string][]) {
    const xs = byKind(pre);
    console.log(`${label} (${xs.length}): ${xs.map((x) => x.slice(pre.length)).join(' ')}`);
  }
  console.log(`прочее: ${all.filter((f) => !/^(op|api|flag):/.test(f)).join(' ')}\n`);
  const { pick, got } = cover(demos, all);
  console.log(`greedy cover: ${pick.length} demos of ${demos.length} reach ${got.size}/${all.length}`);
  for (const n of pick) {
    const d = demos.find((x) => x.name === n)!;
    console.log(`  ${n.padEnd(8)} ${d.features.size} features`);
  }
  const missed = all.filter((f) => !got.has(f));
  if (missed.length) console.log(`\nunreachable by any demo: ${missed.join(' ')}`);
  fs.writeFileSync(path.join(ROOT, 'facts/feature-map.rofl'), emit(demos, all));
  console.log(`\nfacts/feature-map.rofl written`);
}
