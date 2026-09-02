// js_resolve.ts — import resolution OBSERVED, in a named environment.
//
// WHY THIS FILE EXISTS AT ALL, and why the ~20 rules in rules/js-modules.rofl
// that already resolve a path are not deleted by it.
//
// Resolving an import is not an inference from the code. It is a question
// about the WORLD: which files are on the disk, which extensions the running
// loader has registered, which conditions the package manager wrote into
// `exports`, where node_modules happens to sit. None of that is in the AST,
// and a rule that concludes it is guessing about a machine it cannot see. The
// house rule here is `scanners/` observe, `rules/` judge; resolution had ended
// up on the wrong side of it, and this file puts it back.
//
// WHAT IS OBSERVED, and how. The observer calls node's own resolver — the same
// `createRequire(importer).resolve(spec)` that the program will call at run
// time — and records THE SEARCH, not only its result:
//
//   resolve_site[code](Site, File, Line, Spec)   the place, enumerated here
//   resolve_site_computed[code](Site, File, Line)   ...with no literal to ask
//   resolve_try[E](Site, K, Path, Outcome)      the K-th candidate node stat'd
//   resolve_answer[E](Site, Path)               what node returned
//   resolve_failed[E](Site, Reason)             ...or the error code it threw
//   resolve_unasked[E](Site, Reason)            ...or why it was never asked
//   resolve_via[E](Site, Mechanism, Detail)     which mechanism produced it
//   env_ran(Env) / env_extension(Env, K, Ext)   the configuration that ran
//
// The trace is not decoration. `resolve_try` comes from patching `Module._stat`
// — node's own filesystem probe inside `Module._findPath` — so the candidate
// list and its order are what node ACTUALLY DID, in the order it did it, not a
// reconstruction. rules/js-resolve.rofl then derives the answer by replaying
// that search, which is what makes `why resolves_to(...)` a tree of
// observations instead of the single line "node said so".
//
// PERSPECTIVE = ENVIRONMENT. Every observation above except the site list is
// filed in the environment's own ledger. The argument is in
// facts/js-resolve.rofl; the short form is that two environments answering
// differently is not a contradiction to be resolved but two entries in two
// books, and that is exactly what a perspective is for.
//
// THE SITE LIST IS NOT IN AN ENVIRONMENT LEDGER, and that is deliberate: where
// the import sites are is a property of the source text and cannot differ
// between environments. Filing it per-environment would duplicate a fact that
// cannot disagree, and duplication is where disagreement hides.
//
// WHAT THE OBSERVER IS NOT ALLOWED TO DO: decide. It never inspects the
// specifier to guess an answer and never falls back to a path it built itself.
// If node throws, that is `resolve_failed` with node's error code; if there was
// nothing to ask — `import(expr)` names no module until the expression runs —
// that is `resolve_unasked`. The two are separate relations because "it did
// not resolve" and "nobody asked" are opposite facts that look identical from
// the outside, and a silent observer produces the same emptiness as both.

import * as fs from 'node:fs';
import * as path from 'node:path';
import Module, { createRequire, isBuiltin } from 'node:module';
import { parse } from '@babel/parser';

/** The internals this file reaches for, named so the reach is visible.
 *
 *  `_stat` and `_pathCache` are node's own CJS-resolution machinery:
 *  `Module._findPath` probes the disk through `_stat` and memoises the answer
 *  in `_pathCache`. Patching `_stat` is how a trace is obtained WITHOUT
 *  reimplementing anything; clearing `_pathCache` before each question is what
 *  keeps the trace complete, and it was measured rather than assumed — a
 *  second resolve of the same specifier returns the memoised answer and
 *  produces an EMPTY trace, which is indistinguishable from a builtin.
 *
 *  `_extensions` is the environment knob. Its KEYS, in insertion order, are
 *  the extensions `_findPath` appends to a candidate, and registering one more
 *  is exactly what a TypeScript loader does to the process it runs in. */
interface ModuleInternals {
  _stat: (p: string) => number;
  _extensions: Record<string, unknown>;
  _pathCache: Record<string, unknown>;
}
const MI = Module as unknown as ModuleInternals;

/** A resolution environment: a ledger name and the settings that make it
 *  differ from another one. Only the extension list varies today; the reason
 *  the field list is this short, and what a second axis would cost, is
 *  recorded in facts/js-resolve.rofl. */
export interface ResolveEnv {
  /** the ledger these observations are filed in */
  name: string;
  /** the extensions node's resolver will append, IN ORDER */
  extensions: string[];
}

export type Outcome = 'file' | 'dir' | 'miss';

/** One candidate node put to the disk, and what the disk said. */
export interface Attempt { path: string; outcome: Outcome; }

/** What one question to a resolver produced. `answer` and `failure` are
 *  mutually exclusive and exactly one of them is non-null for a real resolver;
 *  a resolver that returns neither is one that swallowed the question, and
 *  rules/js-resolve.rofl reports that as `resolve_silent`. */
export interface Resolution {
  answer: string | null;
  failure: string | null;
  trace: Attempt[];
}

/** The oracle, as a parameter. Production passes `nodeResolver`; a test passes
 *  a deliberately broken one to find out what the model notices. */
export type Resolver =
  (spec: string, importerAbs: string, env: ResolveEnv, root: string) => Resolution;

// ---------------------------------------------------------------------------
// paths

/** The ONE spelling every path in this file is compared in.
 *
 *  Two normalisations, both load-bearing. `realpathSync` because a fixture
 *  tree reaches its packages through a symlinked `node_modules` and node
 *  answers with the realpath: without it the trace says
 *  `node_modules/@babel/parser/lib/index.js` and the answer says
 *  `/Users/.../rofl/node_modules/@babel/parser/lib/index.js`, the two never
 *  join, and every package import reads as an answer the trace cannot explain.
 *  And relativisation against the scanned root, because that is the spelling
 *  the rule model uses and the two models have to be comparable.
 *
 *  A path that leaves the root stays ABSOLUTE, which is a fact about the
 *  answer worth keeping: it is where "the module is outside the tree we
 *  scanned" is visible. A name with no separator at all is a builtin and is
 *  returned untouched. */
function normPath(p: string, root: string, exists: boolean): string {
  if (!p.includes('/') && !p.includes(path.sep)) return p;
  let abs = p;
  if (exists) { try { abs = fs.realpathSync(p); } catch { /* raced away */ } }
  const rel = path.relative(root, abs);
  if (rel === '') return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return abs;
  return rel.split(path.sep).join('/');
}

/** The nearest package.json at or above `from`, or null. A directory walk
 *  rather than a call into node's own package reader: this is used ONLY to
 *  label a mechanism, never to produce an answer, and a labelling helper that
 *  can throw on an experimental API is a worse trade than a walk.
 *
 *  It walks to the filesystem root and stops at the FIRST package.json, which
 *  is node's own rule. An earlier version also stopped as soon as the walk
 *  left the scanned tree, and the effect was measured rather than reasoned
 *  about: every answer inside node_modules is outside the tree, so the guard
 *  returned null for exactly the case `exports_map` exists to label, the
 *  mechanism never occurred once, and `mechanism_unexercised` reported it. */
function nearestPackage(from: string): { file: string; json: Record<string, unknown> } | null {
  let dir = path.dirname(from);
  for (let i = 0; i < 64; i++) {
    const cand = path.join(dir, 'package.json');
    if (fs.existsSync(cand)) {
      try {
        return { file: cand, json: JSON.parse(fs.readFileSync(cand, 'utf8')) as Record<string, unknown> };
      } catch { return null; }
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

// ---------------------------------------------------------------------------
// the real resolver

/** Install exactly `exts` as the resolver's extension list, returning what was
 *  there. The keys of `Module._extensions` ARE the list and their order is the
 *  order tried, so the whole object is rebuilt rather than added to. */
function setExtensions(exts: string[]): Record<string, unknown> {
  const saved: Record<string, unknown> = { ...MI._extensions };
  const js = saved['.js'];
  for (const k of Object.keys(MI._extensions)) delete MI._extensions[k];
  for (const e of exts) MI._extensions[e] = saved[e] ?? js;
  return saved;
}

function restoreExtensions(saved: Record<string, unknown>): void {
  for (const k of Object.keys(MI._extensions)) delete MI._extensions[k];
  Object.assign(MI._extensions, saved);
}

/** node's own CJS resolver, asked once, with its search recorded.
 *
 *  Everything global this touches is restored in `finally`, including on the
 *  throwing path — a half-applied environment would silently contaminate every
 *  later question, and the contamination would look like a real divergence. */
export const nodeResolver: Resolver = (spec, importerAbs, env, root) => {
  const trace: Attempt[] = [];
  const origStat = MI._stat;
  const savedExts = setExtensions(env.extensions);
  for (const k of Object.keys(MI._pathCache)) delete MI._pathCache[k];
  MI._stat = (p: string): number => {
    const code = origStat.call(Module, p);
    const outcome: Outcome = code === 0 ? 'file' : code === 1 ? 'dir' : 'miss';
    trace.push({ path: normPath(p, root, outcome !== 'miss'), outcome });
    return code;
  };
  let answer: string | null = null;
  let failure: string | null = null;
  try {
    answer = normPath(createRequire(importerAbs).resolve(spec), root, true);
  } catch (e) {
    failure = String((e as { code?: string }).code ?? 'ERR');
  } finally {
    MI._stat = origStat;
    restoreExtensions(savedExts);
  }
  return { answer, failure, trace };
};

// ---------------------------------------------------------------------------
// which mechanism produced the answer
//
// Read off the TRACE wherever the trace can say it, because the trace is what
// node did and a specifier is only what was asked. `extension_guess` and
// `index_file` need no knowledge of the specifier at all: they are shapes in
// the candidate list. Where the specifier is genuinely part of node's own
// algorithm — a leading "." selects relative resolution, a leading "#" selects
// the package `imports` map, a builtin name short-circuits the disk — it is
// used, and that use is declared in facts/js-resolve.rofl as a host loan.
//
// A site whose answer matches NO mechanism gets no row here rather than a
// guessed one, and rules/js-resolve.rofl reports it as
// `answer_without_mechanism`. An invented label would be the one outcome worse
// than an absent one, because it reads like knowledge.

export interface Via { mech: string; detail: string; }

export function mechanisms(spec: string, importerAbs: string, root: string,
                           env: ResolveEnv, res: Resolution): Via[] {
  const out: Via[] = [];
  if (isBuiltin(spec)) {
    out.push({ mech: 'builtin', detail: spec.startsWith('node:') ? spec : 'node:' + spec });
    return out;
  }
  const ans = res.answer;
  if (ans === null) return out;

  if (spec.startsWith('.')) {
    const joined = normPath(path.resolve(path.dirname(importerAbs), spec), root, false);
    if (ans === joined) out.push({ mech: 'relative', detail: joined });
  }
  for (const a of res.trace) {
    for (const ext of env.extensions) {
      if (ans === a.path + ext) out.push({ mech: 'extension_guess', detail: ext });
    }
    if (a.outcome === 'dir' && ans.startsWith(a.path + '/index.')) {
      out.push({ mech: 'index_file', detail: a.path });
    }
  }
  if (ans.split('/').includes('node_modules') || ans.split(path.sep).includes('node_modules')) {
    out.push({ mech: 'node_modules_walk', detail: ans.slice(0, ans.lastIndexOf('node_modules') + 12) });
  }
  const ansAbs = path.isAbsolute(ans) ? ans : path.join(root, ans);
  const target = nearestPackage(ansAbs);
  const importer = nearestPackage(importerAbs);
  if (target && target.json['exports'] !== undefined && target.file !== importer?.file) {
    out.push({ mech: 'exports_map', detail: normPath(target.file, root, true) });
  }
  if (spec.startsWith('#') && importer && importer.json['imports'] !== undefined) {
    out.push({ mech: 'imports_map', detail: normPath(importer.file, root, true) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// the places
//
// ENUMERATED HERE, from babel, over the files on disk. Taking the site list
// from the rule model would make a site the model never saw impossible to
// report as missing — the probe would be measuring its own input. The join
// back to the model's node ids is a RULE (`model_site`), so a disagreement
// between the two enumerations is a row rather than a silence.

export interface Site {
  key: string;
  file: string;
  line: number;
  /** null where the specifier is not a string literal */
  spec: string | null;
}

export function sitesOf(root: string, files: string[]): Site[] {
  const out: Site[] = [];
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
        const spec = src?.type === 'StringLiteral' ? (src.value ?? null) : null;
        const line = o.loc?.start?.line ?? 0;
        out.push({ key: `${f}:${line}:${spec ?? '<computed>'}`, file: f, line, spec });
      }
      for (const k of Object.keys(o)) if (k !== 'loc') walk(o[k]);
    };
    walk(ast);
  }
  return out;
}

// ---------------------------------------------------------------------------
// emitting

/** The only escaping the fact syntax has (src/parser.ts tokenize). */
const q = (s: string): string => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

/** node's error codes are SCREAMING_SNAKE; an atom here is lower_snake. Any
 *  character the tokenizer would not accept in an atom becomes `_`, so an
 *  unfamiliar code lands as a readable atom rather than as a parse error. */
export const reasonAtom = (code: string): string =>
  code.toLowerCase().replace(/[^a-z0-9_]/g, '_');

export interface ObserveOpts {
  /** the tree, already realpath'd */
  root: string;
  /** source files, relative to root, POSIX-separated */
  files: string[];
  envs: ResolveEnv[];
  /** defaults to `nodeResolver`; a test substitutes a broken one on purpose */
  resolver?: Resolver;
  /** the ledger the site enumeration is filed in */
  persp?: string;
}

export interface Observation {
  facts: string[];
  sites: Site[];
  /** answers per environment, keyed by site key — the host's own view, kept so
   *  a test can measure divergence without going through the rule model */
  answers: Map<string, Map<string, string | null>>;
}

export function observe(opts: ObserveOpts): Observation {
  const { root, files, envs } = opts;
  const resolver = opts.resolver ?? nodeResolver;
  const persp = opts.persp ?? 'code';
  const sites = sitesOf(root, files);
  const facts: string[] = [];
  const answers = new Map<string, Map<string, string | null>>();

  for (const s of sites) {
    facts.push(s.spec === null
      ? `resolve_site_computed[${persp}](${q(s.key)}, ${q(s.file)}, ${s.line}).`
      : `resolve_site[${persp}](${q(s.key)}, ${q(s.file)}, ${s.line}, ${q(s.spec)}).`);
  }

  for (const env of envs) {
    const seen = new Map<string, string | null>();
    answers.set(env.name, seen);
    facts.push(`env_ran(${env.name}).`);
    env.extensions.forEach((e, k) => facts.push(`env_extension(${env.name}, ${k}, ${q(e)}).`));
    for (const s of sites) {
      if (s.spec === null) {
        // NOT a failure: nothing was asked, because `import(expr)` names no
        // module until the expression is evaluated. Kept apart from
        // `resolve_failed` so the two cannot be counted in one bucket.
        facts.push(`resolve_unasked[${env.name}](${q(s.key)}, no_literal_specifier).`);
        seen.set(s.key, null);
        continue;
      }
      const importerAbs = path.join(root, s.file);
      const res = resolver(s.spec, importerAbs, env, root);
      res.trace.forEach((a, k) =>
        facts.push(`resolve_try[${env.name}](${q(s.key)}, ${k}, ${q(a.path)}, ${a.outcome}).`));
      if (res.answer !== null) {
        facts.push(`resolve_answer[${env.name}](${q(s.key)}, ${q(res.answer)}).`);
        for (const v of mechanisms(s.spec, importerAbs, root, env, res)) {
          facts.push(`resolve_via[${env.name}](${q(s.key)}, ${v.mech}, ${q(v.detail)}).`);
        }
      } else if (res.failure !== null) {
        facts.push(`resolve_failed[${env.name}](${q(s.key)}, ${reasonAtom(res.failure)}).`);
      }
      // ...and if the resolver returned NEITHER, nothing is written, which is
      // the one case this file must not paper over: rules/js-resolve.rofl's
      // `resolve_silent` is what turns that emptiness into a row.
      seen.set(s.key, res.answer);
    }
  }
  return { facts, sites, answers };
}
