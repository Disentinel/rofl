// scanners/depends.ts — WHAT BREAKS IF I DELETE THIS FILE?
//
// The question is a refactoring question and this repository has never been
// able to answer it. `scanners/js.ts` emits `src_import`, which is TS imports
// and nothing else — and the edges that actually bite when a file is deleted
// here are mostly NOT imports. `boot.rofl` is reached by `readFileSync`, a
// generated fact pack is reached by its generator's `writeFileSync`, a gate is
// reached by a line in `package.json`, a duty is reached by a citation in
// `facts/spec.rofl`, and a finding is anchored to a path by `addressed_by`.
// A dependency model built from imports alone would report `boot.rofl` as an
// orphan, which is the most confident possible wrong answer.
//
// So: seven edge kinds, one relation, and the reasoning lives in
// `rules/depends.rofl` rather than here. This file only turns bytes into facts.
//
//   artifact[dep](Path, Kind)      ts | rofl | md | json | yml | rs | sh
//   edge[dep](From, To, How)       ts_import | reads_path | npm_script
//                                  | ci_step | doc_ref | ledger_ref | generates
//
// WHERE THIS MODEL CANNOT LOOK, measured rather than guessed, because a
// blast-radius answer that hides an edge is worse than no answer:
//
//  1. A PATH BUILT AT RUNTIME IS INVISIBLE. `join(ROOT, 'facts', name + '.rofl')`
//     produces no string literal this scanner can see. Swept over the tree
//     (`--holes`): the count is reported by the run, so the reader knows how
//     much of the surface is dark rather than assuming it is zero.
//  2. A DOC REFERENCE IS TEXTUAL, so it OVER-reports: a document that merely
//     names a file in prose becomes an edge. That is deliberate — for a
//     deletion question, a mention that would go stale IS a thing that breaks —
//     but it means `doc_ref` must be separable in the rules, and it is.
//  3. COMMENTS ARE STRIPPED FROM `.ts` BEFORE EDGES ARE TAKEN, for the reason
//     CLAUDE.md already records about the flag census: mentioned and exercised
//     look identical to grep and are opposites for this question. They are NOT
//     stripped from `.rofl` and `.md`, where a comment naming a file is the
//     dependency (a ledger note citing a path is exactly that).
//  4. A BARE SPECIFIER IS NOT A REPO FILE. `node:fs` and `@babel/parser` are
//     dropped rather than recorded as missing artifacts.
//  5. IT IS A FILE-LEVEL MODEL. Deleting one export from a file it cannot see;
//     `src_export` + `src_call` would be the finer question and this is not it.
//
// Run: npm run depends            (writes facts/depends.rofl)
//      npm run whydepends         (the report, over rules/depends.rofl)
//      npm run depends -- --blast facts/rule-shape.rofl

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Tracked files only. A build output or a cache is not a dependency of
 *  anything and would drown the model; `git ls-files` is the tree's own
 *  answer to which files are the repository. */
function tracked(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((l) => l.length > 0);
}

const KIND: Record<string, string> = {
  '.ts': 'ts', '.tsx': 'ts', '.mjs': 'ts', '.js': 'ts',
  '.rofl': 'rofl', '.md': 'md', '.json': 'json',
  '.yml': 'yml', '.yaml': 'yml', '.rs': 'rs', '.sh': 'sh', '.toml': 'toml',
};
const kindOf = (p: string): string => KIND[path.extname(p)] ?? 'other';

/** Line and block comments out of TS source. Strings are preserved, so a path
 *  inside a string literal survives and a path inside a comment does not —
 *  which is the whole distinction this scanner turns on. */
function stripTsComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') { out += src[i]; i++; } out += src[i]; i++; }
      out += src[i] ?? ''; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

type Edge = { from: string; to: string; how: string };

/** A path as the repository spells it, or null when it is not one of ours. */
function resolveRepoPath(from: string, spec: string): string | null {
  if (spec.startsWith('node:') || spec.startsWith('@') || /^[a-z][a-z0-9-]*$/i.test(spec)) return null;
  const base = spec.startsWith('.') ? path.join(path.dirname(from), spec) : spec;
  const norm = path.normalize(base).replace(/^\.\//, '');
  if (norm.startsWith('..')) return null;
  return norm;
}

/** Every string literal in already-comment-stripped source. */
function literals(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/'([^'\\\n]{2,200})'|"([^"\\\n]{2,200})"/g)) out.push(m[1] ?? m[2]);
  return out;
}

const REPO_PATH = /^[A-Za-z0-9_.\/-]+\.(ts|tsx|mjs|js|rofl|md|json|yml|yaml|rs|sh|toml)$/;

export function scan(): { artifacts: Map<string, string>; edges: Edge[]; holes: number } {
  const files = tracked();
  const artifacts = new Map<string, string>();
  for (const f of files) artifacts.set(f, kindOf(f));
  const has = (p: string): boolean => artifacts.has(p);
  const edges: Edge[] = [];
  const add = (from: string, to: string, how: string): void => {
    if (to === from || !has(to)) return;
    if (!edges.some((e) => e.from === from && e.to === to && e.how === how)) edges.push({ from, to, how });
  };
  let holes = 0;

  for (const f of files) {
    const kind = artifacts.get(f)!;
    let src: string;
    try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }

    if (kind === 'ts') {
      const code = stripTsComments(src);
      // 1. imports and requires, resolved against this file
      for (const m of code.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const r = resolveRepoPath(f, m[1]);
        if (r) { if (has(r)) add(f, r, 'ts_import'); }
      }
      // 2. WRITES FIRST, so that a path this file PRODUCES is never also
      //    recorded as a path it needs. Getting that wrong put
      //    `scanners/rule_shape.ts` in its own output's blast radius, which
      //    reads as `deleting the generated pack breaks the generator` — the
      //    exact opposite of the truth, and invisible to any check on the
      //    edge COUNT because the edge was real and only its meaning was not.
      const written = new Set<string>();
      for (const m of code.matchAll(/writeFileSync\s*\([^)]*?['"]([^'"]+\.(?:rofl|json|md))['"]/g)) {
        const r = has(m[1]) ? m[1] : resolveRepoPath(f, m[1]);
        if (r && has(r)) { written.add(r); add(f, r, 'generates'); }
      }
      // 3. every other literal that spells a file this repository has —
      //    readFileSync and join(ROOT, ...) both reduce to this
      for (const lit of literals(code)) {
        if (!REPO_PATH.test(lit)) continue;
        const r = has(lit) ? lit : resolveRepoPath(f, lit);
        if (r && has(r) && !written.has(r)) add(f, r, 'reads_path');
      }
      // 3. THE DARK SURFACE, counted rather than assumed: a path assembled
      //    from a variable is a dependency this model does not have.
      //
      //    THE FIRST DRAFT OF THIS COUNT WAS WRONG BY MOST OF ITSELF and the
      //    error is worth keeping, because it is the shape this repository
      //    keeps recording. It counted every `readFileSync(` whose first
      //    character is not a quote — which makes `readFileSync(join(ROOT,
      //    'boot.rofl'))`, the single commonest idiom in the tree and a call
      //    this scanner reads perfectly, count as DARK. 369 of them. A
      //    darkness measure that fires on the calls the model handles best
      //    reports the instrument, not the tree. What is actually dark is a
      //    call whose argument region holds NO repo-path literal at all.
      for (const m of code.matchAll(/\.(?:read|write)FileSync\s*\(/g)) {
        const start = m.index! + m[0].length;
        let depth = 1, j = start;
        while (j < code.length && depth > 0) { if (code[j] === '(') depth++; else if (code[j] === ')') depth--; j++; }
        const args = code.slice(start, j);
        if (!literals(args).some((l) => REPO_PATH.test(l))) holes++;
      }
    } else if (kind === 'md' || kind === 'rofl') {
      // Comments are NOT stripped here: in a document and in the ledger, a
      // mention IS the dependency — it is what goes stale when the file dies.
      for (const m of src.matchAll(/[`"]([A-Za-z0-9_.\/-]+\.(?:ts|tsx|mjs|rofl|md|json|yml|rs|sh))[`"]/g)) {
        if (!has(m[1])) continue;
        add(f, m[1], f === 'facts/findings.rofl' || f === 'facts/spec.rofl' ? 'ledger_ref' : 'doc_ref');
      }
    }
  }

  // 5. package.json scripts: the gate list, and what each one runs
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
    for (const m of String(cmd).matchAll(/([A-Za-z0-9_.\/-]+\.(?:ts|rofl))/g)) {
      if (has(m[1])) add(`npm:${name}`, m[1], 'npm_script');
    }
    artifacts.set(`npm:${name}`, 'script');
  }

  // 6. CI steps: what the referee actually runs
  const wf = path.join(ROOT, '.github/workflows');
  for (const w of fs.existsSync(wf) ? fs.readdirSync(wf) : []) {
    const src = fs.readFileSync(path.join(wf, w), 'utf8');
    const id = `.github/workflows/${w}`;
    artifacts.set(id, 'yml');
    for (const m of src.matchAll(/npm run ([a-z:]+)/g)) add(id, `npm:${m[1]}`, 'ci_step');
    for (const m of src.matchAll(/([A-Za-z0-9_.\/-]+\.ts)/g)) if (has(m[1])) add(id, m[1], 'ci_step');
    if (/npm test/.test(src)) add(id, 'npm:test', 'ci_step');
  }

  return { artifacts, edges, holes };
}

const q = (s: string): string => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

export function render(a: ReturnType<typeof scan>): string {
  const L: string[] = [
    '-- facts/depends.rofl — GENERATED by scanners/depends.ts, do not edit.',
    '-- Run `npm run depends` to rebuild; test/depends.test.ts regenerates and',
    '-- compares, so a stale commit is a failing test rather than silent drift',
    '-- (f_a_generated_pack_with_no_regeneration_gate_has_already_rotted).',
    '--',
    '-- The reasoning over these rows is rules/depends.rofl; nothing here',
    '-- concludes anything.',
    `-- ${a.artifacts.size} artifacts, ${a.edges.length} edges, ${a.holes} unreadable path expressions.`,
    '',
  ];
  for (const p of [...a.artifacts.keys()].sort()) L.push(`artifact[dep](${q(p)}, ${a.artifacts.get(p)}).`);
  L.push('');
  for (const e of [...a.edges].sort((x, y) => (x.from + x.to + x.how).localeCompare(y.from + y.to + y.how))) {
    L.push(`edge[dep](${q(e.from)}, ${q(e.to)}, ${e.how}).`);
  }
  L.push('');
  L.push(`dark_paths[dep](${a.holes}).`);
  return L.join('\n') + '\n';
}

// AN `includes` GUARD FIRES ON THE TEST THAT IMPORTS IT. The first draft read
// `path.resolve(process.argv[1]).includes('depends')`, which is true for
// `test/depends.test.ts` — so importing the scanner from its own test ran the
// main block and OVERWROTE the committed pack, and the regeneration gate then
// compared the file against itself. Green by construction, in the one gate
// written to prevent exactly that. The basename is the check.
const isMain = process.argv[1] && path.basename(process.argv[1]) === 'depends.ts';
if (isMain) {
  const a = scan();
  const blastAt = process.argv.indexOf('--blast');
  if (blastAt >= 0) {
    // The direct answer, without loading the rules — a convenience for the
    // command line. `npm run whydepends` is the model, and it is the one that
    // can be argued with.
    const target = process.argv[blastAt + 1];
    const inbound = new Map<string, string[]>();
    for (const e of a.edges) { const l = inbound.get(e.to) ?? []; l.push(`${e.from} (${e.how})`); inbound.set(e.to, l); }
    const seen = new Set<string>([target]);
    const queue = [target];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of a.edges) if (e.to === cur && !seen.has(e.from)) { seen.add(e.from); queue.push(e.from); }
    }
    console.log(`\nblast radius of deleting ${target}\n`);
    console.log(`  direct dependents (${(inbound.get(target) ?? []).length}):`);
    for (const d of (inbound.get(target) ?? []).sort()) console.log(`    ${d}`);
    seen.delete(target);
    console.log(`\n  transitively reached: ${seen.size}`);
    if (a.holes) console.log(`\n  NOT SEEN: ${a.holes} path expressions in this tree are built at runtime.`);
  } else {
    fs.writeFileSync(path.join(ROOT, 'facts/depends.rofl'), render(a));
    console.log(`facts/depends.rofl: ${a.artifacts.size} artifacts, ${a.edges.length} edges, ${a.holes} dark path expressions`);
  }
}
