// scripts/render_docs.ts — EVERY BLOCK A DOCUMENT CLAIMS ABOUT THE TREE,
// generated from the thing that knows it.
//
// The deprecation problem, stated: prose asserts a fact about the tree, the
// tree moves, and nothing goes red. CLAUDE.md was rewritten on 2026-09-10 for
// exactly that and was stale again within a day — `npm run history` listed
// after deletion, four commands missing, and `npm test` described as a
// half-hour run to be avoided when it had become the eleven-second one. Three
// hand-patches in two days.
//
// A block declares its source in its own opening marker, is rendered from that
// source, and `--check` fails if the file differs. What the tree knows, the
// tree writes; what a person knows stays prose outside the markers.
//
//   npm run docs            rewrite every block
//   npm run docs -- --check fail if any file differs from its render
//
// ADDING A BLOCK is a renderer and a marker pair. It is worth doing whenever a
// document states something the tree already holds as data — a list of files, a
// list of commands, a set of names, a count.

import { Rofl } from '../src/api.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

interface Block { file: string; name: string; source: string; render: () => string }

/** A fact pack, loaded and queried — never matched. */
function pack(rel: string): Rofl {
  const r = new Rofl();
  r.load(read('boot.rofl'));
  if (!r.load(read(rel)).ok) throw new Error(`${rel} does not load`);
  r.evaluate();
  return r;
}

/** The deviations from START.md. Stored verbatim, each chunk carrying its own
 *  trailing blank lines, so the render is byte-identical to what it replaced. */
function deviations(): string {
  const r = pack('facts/deviations.rofl');
  const rows = r.query('deviation(I, O, T)').rows
    .map((x) => [Number(String(x.bindings['O'])), JSON.parse(String(x.bindings['T'])) as string] as [number, string])
    .sort((a, b) => a[0] - b[0]);
  if (rows.length === 0) throw new Error('no deviations in the pack');
  return rows.map(([, t]) => t).join('\n');
}

/** The commands. The SET comes from package.json and cannot go stale; the NOTE
 *  beside each comes from facts/commands.rofl and must be written by a person.
 *  A script with no note is a red — which is the point: a capability nobody
 *  described is the thing this block exists to surface. */
function commands(): string {
  const scripts = Object.keys((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts);
  const r = pack('facts/commands.rofl');
  const note = new Map(r.query('command_note(N, T)').rows
    .map((x) => [String(x.bindings['N']).replace(/^"|"$/g, ''),
      JSON.parse(String(x.bindings['T'])) as string] as [string, string]));
  const shown = r.query('command_shown(N, O)').rows
    .map((x) => [Number(String(x.bindings['O'])), String(x.bindings['N']).replace(/^"|"$/g, '')] as [number, string])
    .sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  const missing = shown.filter((s) => !scripts.includes(s));
  if (missing.length) throw new Error(`facts/commands.rofl shows scripts package.json does not have: ${missing.join(', ')}`);
  const undescribed = shown.filter((s) => !note.has(s));
  if (undescribed.length) throw new Error(`no command_note for: ${undescribed.join(', ')}`);
  // PADDED FROM THE RENDERED PREFIX, not from the script name: `npm run` is
  // four characters longer than `npm`, and padding by the name alone ran
  // `test:hosts` into its own note.
  const label = (s: string): string => 'npm ' + (s === 'test' ? 'test' : 'run ' + s);
  const w = Math.max(...shown.map((s) => label(s).length)) + 2;
  return shown.map((s) => `    ${label(s).padEnd(w)}${note.get(s)}`).join('\n');
}

const BLOCKS: Block[] = [
  { file: 'README.md', name: 'deviations', source: 'facts/deviations.rofl', render: deviations },
  { file: 'CLAUDE.md', name: 'commands', source: 'package.json + facts/commands.rofl', render: commands },
];

const begin = (b: Block): string => `<!-- BEGIN ${b.name}: generated from ${b.source} -->`;
const end = (b: Block): string => `<!-- END ${b.name} -->`;

export function splice(doc: string, b: Block, body: string): string {
  const a = doc.indexOf(begin(b));
  const z = doc.indexOf(end(b));
  if (a < 0 || z < 0) throw new Error(`${b.file} has no ${b.name} markers`);
  return doc.slice(0, a + begin(b).length) + '\n\n' + body + '\n\n' + doc.slice(z);
}

/** A BACKTICKED REPO PATH IN A DOCUMENT MUST EXIST. No judgement in it — a file
 *  is there or it is not — and it is the simplest form of the deprecation
 *  problem: nine references were left dangling by one afternoon of deleting,
 *  pointing at `scripts/kernel_grep.ts`, `bench/mem_scale.ts`,
 *  `docs/dogfood/...` and four scanners.
 *
 *  A trailing `:123` is stripped (a citation to a line still names a file) and
 *  anything with a `*` is skipped: a glob is a pattern, not a path. */
const PATHY = /`((?:src|rules|facts|scanners|test|scripts|runtime|examples|adapters|bench|docs|skills|rust)\/[A-Za-z0-9_./-]+)`/g;

function danglingPaths(): string[] {
  const out: string[] = [];
  const docs = ['README.md', 'CLAUDE.md', 'LIMITS.md', 'START.md',
    ...fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];
  for (const d of docs) {
    if (!fs.existsSync(path.join(ROOT, d))) continue;
    const seen = new Set<string>();
    for (const m of fs.readFileSync(path.join(ROOT, d), 'utf8').matchAll(PATHY)) {
      const ref = m[1].replace(/:\d+$/, '');
      if (ref.includes('*') || seen.has(ref)) continue;
      seen.add(ref);
      if (!fs.existsSync(path.join(ROOT, ref))) out.push(`${d} → ${ref}`);
    }
  }
  return out;
}

/** A SETTLEMENT MUST CITE SOMETHING THAT EXISTS. `addressed_by(F, Path)` is
 *  the ledger's claim that a finding is closed BECAUSE that artifact is in the
 *  tree; delete the artifact and the claim has no evidence left, silently. The
 *  document check above found nine such references in the prose; the first run
 *  of this one found thirty-three in the ledger, all from the same afternoon.
 *
 *  Only `addressed_by` is checked. A `finding_note` that names a file is a
 *  record of a past measurement, and history does not become false when the
 *  file is deleted. */
function danglingSettlements(): string[] {
  const out: string[] = [];
  const src = fs.readFileSync(path.join(ROOT, 'facts/findings.rofl'), 'utf8');
  for (const m of src.matchAll(/addressed_by\(([a-z0-9_]+),\s*"([^"]+)"\)/g)) {
    const ref = m[2].replace(/:\d+$/, '');
    if (!fs.existsSync(path.join(ROOT, ref))) out.push(`${m[1]} \u2192 ${ref}`);
  }
  // AND A GRAVE MUST HOLD A BODY. `artifact_removed` names what left; the
  // `removed_in` sha is the address it left for, and an address nobody dials
  // is the same dead end one indirection further out.
  const grave = new Map<string, string>();
  for (const m of src.matchAll(/removed_in\("([^"]+)",\s*"([0-9a-f]{7,40})"\)/g)) grave.set(m[1], m[2]);
  for (const m of src.matchAll(/artifact_removed\(([a-z0-9_]+),\s*"([^"]+)"\)/g)) {
    const [fid, ref] = [m[1], m[2]];
    const sha = grave.get(ref);
    if (!sha) { out.push(`${fid} \u2192 ${ref} (no removed_in)`); continue; }
    const r = spawnSync('git', ['cat-file', '-e', `${sha}^:${ref}`], { cwd: ROOT });
    if (r.status !== 0) out.push(`${fid} \u2192 ${ref} not in ${sha}^`);
  }
  return out;
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'render_docs.ts';
if (isMain) {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const b of BLOCKS) {
    const p = path.join(ROOT, b.file);
    const doc = fs.readFileSync(p, 'utf8');
    let out: string;
    // A RENDERER THAT CANNOT RUN IS A STALE BLOCK, not a crash. The first
    // version let the throw escape and a script removed from package.json
    // came out as a stack trace instead of a line naming the block.
    try { out = splice(doc, b, b.render()); }
    catch (e) { console.error(`  BROKEN ${b.file} ${b.name} — ${(e as Error).message}`); bad++; continue; }
    if (out === doc) { console.log(`  ok    ${b.file} ${b.name}`); continue; }
    if (check) { console.error(`  STALE ${b.file} ${b.name} — run \`npm run docs\``); bad++; continue; }
    fs.writeFileSync(p, out);
    console.log(`  wrote ${b.file} ${b.name}`);
  }
  const dangling = [...danglingPaths(), ...danglingSettlements()];
  for (const d of dangling) console.error(`  DANGLING ${d}`);
  process.exit(bad === 0 && dangling.length === 0 ? 0 : 1);
}
