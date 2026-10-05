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
import { canonTerm } from '../src/unify.ts';
import { evaluateSemiring, BOUNDED, type Semiring } from '../src/semiring.ts';
import { tropicalSemiring, countingSemiring } from '../runtime/semirings.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

interface Block { file: string; name: string; source: string; render: () => string; comment?: string }

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
  // A COUNT OR A DURATION IN A NOTE DRIFTS: the command prints its own.
  const drifting = shown.filter((s) => /\b\d+ ?(s|ms|seconds?|worlds?|mutants?|demos?|breaks?|faults?|cells?)\b/.test(note.get(s)!));
  if (drifting.length) throw new Error(`facts/commands.rofl states a count or a duration for: ${drifting.join(', ')} (the command prints its own)`);
  // PADDED FROM THE RENDERED PREFIX, not from the script name: `npm run` is
  // four characters longer than `npm`, and padding by the name alone ran
  // `test:hosts` into its own note.
  const label = (s: string): string => 'npm ' + (s === 'test' ? 'test' : 'run ' + s);
  const w = Math.max(...shown.map((s) => label(s).length)) + 2;
  return shown.map((s) => `    ${label(s).padEnd(w)}${note.get(s)}`).join('\n');
}

/** The knobs an agent may use: the SET is facts/commands.rofl, and a token that no source file of
 *  the tree contains fails the render instead of sitting in CLAUDE.md as advice. The inventory of
 *  every knob, with the verdicts, is docs/knobs.md. */
function knobs(): string {
  const r = pack('facts/commands.rofl');
  const unq = (v: unknown): string => JSON.parse(String(v)) as string;
  const note = new Map(r.query('knob_note(N, T, X)').rows.map((x) => [unq(x.bindings['N']), [unq(x.bindings['T']), unq(x.bindings['X'])]] as [string, string[]]));
  const shown = r.query('knob_shown(N, O)').rows
    .map((x) => [Number(String(x.bindings['O'])), unq(x.bindings['N'])] as [number, string]).sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  const undescribed = shown.filter((k) => !note.has(k));
  if (undescribed.length) throw new Error(`no knob_note for: ${undescribed.join(', ')}`);
  const walk = (d: string): string[] => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'node_modules' || e.name === 'target' ? [] : walk(`${d}/${e.name}`)) : /\.(ts|rs|json)$/.test(e.name) ? [`${d}/${e.name}`] : []);
  const code = ['rust/rofl/src', 'scripts', 'notebook', 'runtime', 'vscode'].flatMap(walk).concat('package.json').map(read).join('\n');
  const gone = shown.filter((k) => !code.includes(k));
  if (gone.length) throw new Error(`facts/commands.rofl shows knobs no source file has: ${gone.join(', ')}`);
  return ['| knob | tool | use |', '|---|---|---|', ...shown.map((k) => `| \`${k}\` | ${note.get(k)![0]} | ${note.get(k)![1].replace(/\|/g, '\\|')} |`)].join('\n');
}

/** THE HOST FOLD OF THE TAG DEMO (docs/aggregates.md, "Tags, as built"): the
 *  demo's plain rules run in the TypeScript engine, and src/semiring.ts's
 *  fold annotates their support in each semiring, every edge its weight;
 *  what it computes is written as facts the Rust world agg_tag_demo holds
 *  the kernel's tags equal to. The tropical and counting instances are
 *  runtime/semirings.ts's own; viterbi's and trust's are the kernel's
 *  carriers (a probability in millionths rounded down, a trust in
 *  millionths), stated here as the fold's instances, so the fold is the
 *  host's and the arithmetic each side's own. */
function tagHostFold(): string {
  const r = new Rofl();
  r.load(read('boot.rofl'));
  for (const f of ['examples/checks/agg-tag-demo-data.rofl', 'examples/checks/agg-tag-demo-plain.rofl']) {
    if (!r.load(read(f)).ok) throw new Error(`${f} does not load`);
  }
  r.evaluate();
  const weights = (rel: string): Map<string, number> =>
    new Map(r.store.relAll(rel).map((f) => [f.key, Number((f.args[2] as { v: number | bigint }).v)]));
  const unit = 1_000_000;
  const viterbi: Semiring<number> = { discipline: BOUNDED, zero: 0, one: unit, plus: Math.max, times: (a, b) => Math.floor((a * b) / unit), eq: (a, b) => a === b };
  const trust: Semiring<number> = { discipline: BOUNDED, zero: 0, one: unit, plus: Math.max, times: Math.min, eq: (a, b) => a === b };
  const out: string[] = [];
  const fold = <T>(alg: string, head: string, edges: string, sr: Semiring<T>, lift: (w: number) => T, show: (v: T) => string): void => {
    const w = weights(edges);
    const res = evaluateSemiring(r.store, sr, { base: (k) => (w.has(k) ? lift(w.get(k)!) : sr.one) });
    if (!res.converged) throw new Error(`the ${alg} fold did not converge`);
    for (const f of r.store.relAll(head).sort((a, b) => (a.key < b.key ? -1 : 1))) {
      out.push(`tgd_host(${alg}, ${f.args.map((a) => canonTerm(a)).join(', ')}, ${show(res.value.get(f.key)!)}).`);
    }
  };
  fold('tropical', 'tgd_hc', 'tgd_w', tropicalSemiring, (w) => w, String);
  fold('viterbi', 'tgd_hp', 'tgd_p', viterbi, (w) => w, String);
  fold('trust', 'tgd_ht', 'tgd_t', trust, (w) => w, String);
  fold('counting', 'tgd_hm', 'tgd_m', countingSemiring, (w) => BigInt(w), (v) => String(v));
  return out.join('\n');
}

const BLOCKS: Block[] = [
  { file: 'README.md', name: 'deviations', source: 'facts/deviations.rofl', render: deviations },
  { file: 'CLAUDE.md', name: 'commands', source: 'package.json + facts/commands.rofl', render: commands },
  { file: 'CLAUDE.md', name: 'knobs', source: 'facts/commands.rofl, inventory in docs/knobs.md', render: knobs },
  { file: 'examples/checks/agg-tag-demo-host.rofl', name: 'host_fold', source: 'agg-tag-demo-plain.rofl folded by src/semiring.ts', render: tagHostFold, comment: '-- ' },
];

// A BLOCK IN A PROGRAM sits in its comments: the markers carry the comment
// leader, so the file still parses.
const begin = (b: Block): string => `${b.comment ?? ''}<!-- BEGIN ${b.name}: generated from ${b.source} -->`;
const end = (b: Block): string => `${b.comment ?? ''}<!-- END ${b.name} -->`;

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
// A TRAILING SLASH IS A PATH TOO, and `+` made a bare directory reference
// invisible: README listed `test/` in its own map of the tree for a whole
// commit after the folder was deleted, and this check read it as prose.
const PATHY = /`((?:src|rules|facts|scanners|test|scripts|runtime|examples|adapters|bench|docs|skills|rust)\/[A-Za-z0-9_./-]*)`/g;

function danglingPaths(): { dangling: string[]; unverifiable: string[] } {
  const out: string[] = [], unverifiable: string[] = [];
  const docs = ['README.md', 'CLAUDE.md', 'LIMITS.md', 'START.md',
    ...fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];
  for (const d of docs) {
    if (!fs.existsSync(path.join(ROOT, d))) continue;
    const seen = new Set<string>();
    for (const m of fs.readFileSync(path.join(ROOT, d), 'utf8').matchAll(PATHY)) {
      const ref = m[1].replace(/:\d+$/, '');
      if (ref.includes('*') || seen.has(ref)) continue;
      seen.add(ref);
      if (fs.existsSync(path.join(ROOT, ref))) continue;
      // A GENERATED DIRECTORY IS ABSENT ON PURPOSE. `.gitignore` is the tree's
      // own declaration that a path is built, not kept, and in a fresh clone
      // every such path is missing — which read as nine dangling references
      // the first time this ran anywhere but on a working machine.
      // Exit 1 is git saying the path is not ignored; anything else is git not
      // answering, as in a copy of the tree without its repository (an rsync of
      // a worktree), where every generated path read as dangling.
      const ignored = spawnSync('git', ['check-ignore', '-q', ref], { cwd: ROOT }).status;
      if (ignored === 0) continue;
      (ignored === 1 ? out : unverifiable).push(`${d} → ${ref}`);
    }
  }
  return { dangling: out, unverifiable };
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
function danglingSettlements(): { dangling: string[]; unverifiable: string[] } {
  const out: string[] = [];
  const unverifiable: string[] = [];
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
    // A SHA THIS CLONE CANNOT SEE IS NOT A MISSING BODY. `git cat-file -e`
    // fails the same way for "the grave is empty" and for "you fetched one
    // commit", and reading the second as the first is the clean-looking
    // negative this repository has a name for. So the commit is checked for
    // FIRST, and an absent one is reported as unverifiable rather than
    // counted as a dangling settlement.
    if (spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: ROOT }).status !== 0) {
      unverifiable.push(`${fid} \u2192 ${ref} (${sha} not in this clone)`);
      continue;
    }
    const r = spawnSync('git', ['cat-file', '-e', `${sha}^:${ref}`], { cwd: ROOT });
    if (r.status !== 0) out.push(`${fid} \u2192 ${ref} not in ${sha}^`);
  }
  return { dangling: out, unverifiable };
}

/** docs/js IS NOT A BLOCK IN A FILE but a whole tree written by `npm run
 *  render:js`; a rule or phrase edit left it stale with every gate green.
 *  (docs/rings is not covered: its committed files already differ from what
 *  render:rings writes, which is its own finding.) The script is run from
 *  package.json with its `--out` pointed at a scratch directory, and the two
 *  trees are compared file for file. */
function renderedTrees(): { stale: string[]; unverifiable: string[] } {
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts as Record<string, string>;
  const stale: string[] = [];
  const unverifiable: string[] = [];
  for (const name of Object.keys(scripts).filter((k) => k === 'render:js')) {
    const words = scripts[name].split(/\s+/);
    const at = words.indexOf('--out');
    if (at < 0) continue;
    const dir = words[at + 1];
    const bin = path.join(ROOT, words[0]);
    if (!fs.existsSync(bin)) { unverifiable.push(`${name}: ${words[0]} is not built`); continue; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-render-'));
    try {
      words[at + 1] = tmp;
      const r = spawnSync('sh', ['-c', words.join(' ')], { cwd: ROOT, encoding: 'utf8' });
      if (r.status !== 0) { stale.push(`${name}: ${r.stderr.trim().split('\n')[0] || 'render failed'}`); continue; }
      const have = new Set(fs.readdirSync(path.join(ROOT, dir)));
      for (const f of fs.readdirSync(tmp)) {
        have.delete(f);
        const old = path.join(ROOT, dir, f);
        if (!fs.existsSync(old) || fs.readFileSync(old, 'utf8') !== fs.readFileSync(path.join(tmp, f), 'utf8')) stale.push(`${dir}/${f}`);
      }
      for (const f of have) stale.push(`${dir}/${f} (no longer rendered)`);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  return { stale, unverifiable };
}

/** A COUNT HAS NO READING OF ITS OWN (f_counting_reads_oppositely_by_domain,
 *  docs/aggregates.md "What a count reads as"). An example whose sources fold a
 *  count, by `countingSemiring` or a `counting` tag, must say in its README which
 *  of the five readings it takes, on a `**Count reading:** <word> ` line. */
const READINGS = ['robustness', 'ambiguity', 'launderability', 'fragility', 'domain'];
function countReadings(): string[] {
  const out: string[] = [];
  const fold = /countingSemiring|\btag\s+\w+\s*\([^)]*\bcounting\b/;
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|rofl|rofl\.md)$/.test(e.name) ? [path.join(dir, e.name)] : []);
  for (const d of fs.readdirSync(path.join(ROOT, 'examples'), { withFileTypes: true })) {
    if (!d.isDirectory() || d.name === 'checks') continue;
    const dir = path.join(ROOT, 'examples', d.name);
    if (!files(dir).some((f) => fold.test(fs.readFileSync(f, 'utf8')))) continue;
    const readme = path.join(dir, 'README.md');
    const m = fs.existsSync(readme) && /^\*\*Count reading:\*\* (\w+)\b/m.exec(fs.readFileSync(readme, 'utf8'));
    if (!m) out.push(`examples/${d.name}/README.md folds a count and names no reading`);
    else if (!READINGS.includes(m[1])) out.push(`examples/${d.name}/README.md names the reading "${m[1]}", not one of ${READINGS.join(', ')}`);
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
  const unread = countReadings();
  for (const u of unread) console.error(`  COUNT ${u}`);
  bad += unread.length;
  const trees = renderedTrees();
  for (const f of trees.stale) {
    if (check) { console.error(`  STALE ${f} — run \`npm run render:js\``); bad++; }
  }
  for (const u of trees.unverifiable) console.error(`  UNVERIFIABLE ${u} — needs cargo build --release in rust/`);
  if (!check && trees.stale.length) console.error(`  STALE ${trees.stale.length} rendered file(s) — run \`npm run render:js\``);
  const graves = danglingSettlements();
  const paths = danglingPaths();
  const dangling = [...paths.dangling, ...graves.dangling];
  for (const d of dangling) console.error(`  DANGLING ${d}`);
  // SAID, NOT FAILED. A shallow clone cannot answer, and a check that cannot
  // answer must say so rather than pass quietly or accuse.
  if (graves.unverifiable.length) {
    console.error(`  UNVERIFIABLE ${graves.unverifiable.length} grave(s) — shallow clone, run with full history to check them`);
    for (const u of graves.unverifiable.slice(0, 3)) console.error(`    ${u}`);
  }
  if (paths.unverifiable.length) {
    console.error(`  UNVERIFIABLE ${paths.unverifiable.length} missing path(s) — git cannot say whether they are generated here (no repository)`);
    for (const u of paths.unverifiable.slice(0, 3)) console.error(`    ${u}`);
  }
  process.exit(bad === 0 && dangling.length === 0 ? 0 : 1);
}
