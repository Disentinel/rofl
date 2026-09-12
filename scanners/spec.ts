// scanners/spec.ts — the census of checks, and the verification of citations.
//
// `scanners/` turns code into facts (CLAUDE.md); this one turns the CHECKING
// APPARATUS into facts, so that rules/spec-coverage.rofl can join it against
// the obligations in facts/spec.rofl and answer the question neither a grep
// nor a coverage tool can: which obligation has nothing behind it.
//
// Two jobs, both mechanical:
//
//   1. CENSUS. Every top-level `test(...)` in test/*.test.ts, every check
//      script in package.json, every named step in the CI workflow, becomes
//      a `check(File, Name, Kind)` fact. The census is the ONLY source of
//      check facts: a duty's guard is cited by name, and if the census does
//      not find that name the citation dangles. Renaming a test therefore
//      breaks the link loudly instead of leaving a stale claim of coverage.
//
//   2. CITATIONS. Every duty names a File and an anchor string. This looks
//      for the anchor IN the file. A duty whose anchor has
//      moved surfaces as `unfounded[coverage]` — the model cannot tell a
//      document that shifted from a sentence that was never there, so it
//      reports the citation rather than a verdict.
//
//   node --experimental-strip-types scanners/spec.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export type CheckKind = 'test' | 'gate' | 'ci';
export interface Check { file: string; name: string; kind: CheckKind; }
export interface Census { checks: Check[]; testFiles: string[]; }

// THE HOST READER IS GONE WITH `test/`, AND ITS LESSON IS NOT. It matched
// `test(` and then, one incident later, `mutant(` too: test/bridges.test.ts
// marked all nineteen of its tests with the second spelling and went silently
// EMPTY here, taking `s7_no_nondeterministic_iteration` and `s_canonical_order`
// out of `covered` with it. A census that names ONE spelling of `a test` goes
// blind the day a second one is introduced — which is what `rustTestNames`
// below is now the only instance of.

/** A Rust integration test is `#[test]` and then the function it attaches to,
 *  which may be one line down or several — `#[ignore]`, a doc comment and an
 *  attribute all sit between. The name is the FUNCTION's, because that is what
 *  `cargo test` prints and therefore what a citation can be checked against. */
export function rustTestNames(source: string): string[] {
  const out: string[] = [];
  let armed = false;
  for (const line of source.split('\n')) {
    const t = line.trim();
    if (t === '#[test]') { armed = true; continue; }
    if (!armed) continue;
    const m = /^(?:pub )?fn ([a-z_][a-z0-9_]*)\s*\(/.exec(t);
    if (m) { out.push(m[1]); armed = false; }
  }
  return out;
}

/** npm scripts that are CHECKS rather than entry points. A check is a script
 *  the tree can fail on; `repl`, `scan`, `report` cannot fail a build. */
const GATE_SCRIPTS = new Set(['test', 'test:bun', 'textcheck', 'measurecheck']);

export function census(): Census {
  const checks: Check[] = [];

  // `test/` IS GONE AND THE CENSUS DIED WITH IT. The suite was removed on
  // 2026-09-11 and this function kept walking the directory, so
  // `npm run speccheck` — the one instrument that answers WHICH OBLIGATION HAS
  // NOTHING BEHIND IT — crashed with ENOENT for a day and nobody ran it. The
  // walk is deleted rather than guarded: a guard would make the host census
  // silently empty, which is the shape this repository spends its audits on.
  //
  // THE PORT'S TESTS WERE OUTSIDE THE CENSUS, AND SO NO DUTY ABOUT THE PORT
  // COULD EVER BE GUARDED. `d_port_owes_why` read UNCOVERED on the day it was
  // discharged, because a citation is checked against this list and this list
  // was `test/*.test.ts` and nothing else — the same blindness the comment
  // above records about `mutant()`, one language further out. They are now the
  // WHOLE census of tests, and `testFiles` is them: `unwritten[coverage]` asks
  // which test file no duty cites, and pointing it at a directory that no
  // longer exists made it structurally empty.
  const rustDir = path.join(ROOT, 'rust/rofl/tests');
  const rustFiles = fs.existsSync(rustDir)
    ? fs.readdirSync(rustDir).filter((f) => f.endsWith('.rs')).sort() : [];
  for (const f of rustFiles) {
    const rel = `rust/rofl/tests/${f}`;
    for (const name of rustTestNames(fs.readFileSync(path.join(rustDir, f), 'utf8'))) {
      checks.push({ file: rel, name, kind: 'test' });
    }
  }

  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  for (const [name, cmd] of Object.entries(pkg.scripts).sort()) {
    if (!GATE_SCRIPTS.has(name)) continue;
    const script = /(\S+\.ts)/.exec(cmd.replace(/test\/\*\.test\.ts/, ''));
    checks.push({ file: script ? script[1] : 'package.json', name: `npm run ${name}`, kind: 'gate' });
  }

  // CI steps, by their `- name:` label. The same label appears in both the
  // node and the bun job (the grep test runs under each runtime); the pair is
  // one check under two runners, so the census keeps one row.
  const seen = new Set<string>();
  for (const line of read('.github/workflows/ci.yml').split('\n')) {
    const m = /^\s*-\s*name:\s*(.+?)\s*$/.exec(line);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    checks.push({ file: '.github/workflows/ci.yml', name: m[1], kind: 'ci' });
  }
  return { checks, testFiles: rustFiles.map((f) => `rust/rofl/tests/${f}`) };
}

const q = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** A ROFL string binding comes back with its quotes on. */
export const unq = (s: string): string =>
  s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).replace(/\\(.)/g, '$1') : s;

export function censusFacts(c: Census): string {
  const out: string[] = [];
  for (const ch of c.checks) out.push(`check[checks](${q(ch.file)}, ${q(ch.name)}, ${ch.kind}).`);
  for (const f of c.testFiles) out.push(`test_file[checks](${q(f)}).`);
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// citations

export interface Duty {
  id: string; kind: string; ledger: string; file: string; anchor: string;
}
export interface CiteResult { duty: Duty; ok: boolean; why: string; }

const FILE_CACHE = new Map<string, string[]>();
function lines(rel: string): string[] {
  let v = FILE_CACHE.get(rel);
  if (v === undefined) {
    v = fs.existsSync(path.join(ROOT, rel)) ? read(rel).split('\n') : [];
    FILE_CACHE.set(rel, v);
  }
  return v;
}

/** IS THE ANCHOR IN THE FILE? Not "at line N" — a duty used to carry a LINE
 *  NUMBER and this read that line, which is identity by POSITION: the sentence
 *  is still there, the paragraph above it grew, and the citation reports a
 *  duty that never moved as unfounded. Thirteen of them were in that state,
 *  every one a false negative, and the repository had already written the
 *  lesson down once — `BY NAME, NOT BY RANGE` in test/policy-ladder.test.ts,
 *  where four assertions used to pin `src/engine.ts` line ranges.
 *
 *  Whitespace is collapsed on both sides, so a reflowed paragraph is not a
 *  moved sentence; nothing else is normalised, so a REWRITTEN sentence still
 *  fails, which is the failure worth keeping. A duty whose anchor appears more
 *  than once is reported: an identity that matches twice is not one. */
export function checkCitation(d: Duty): CiteResult {
  const ls = lines(d.file);
  if (ls.length === 0) return { duty: d, ok: false, why: `no such file: ${d.file}` };
  const flat = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const want = flat(d.anchor);
  const hits = ls.filter((l) => flat(l).includes(want)).length;
  if (hits === 1) return { duty: d, ok: true, why: '' };
  if (hits === 0) return { duty: d, ok: false, why: `anchor not in ${d.file}: ${want.slice(0, 60)}` };
  return { duty: d, ok: false, why: `anchor is in ${d.file} ${hits} times: ${want.slice(0, 60)}` };
}

// ---------------------------------------------------------------------------
// the world

const WHO_RE = /^--\s*@who\s+([a-z_]+)\s*$/;

/** `-- @who X` sections, the convention examples/sus uses: the marker is a
 *  comment, and the loader turns it into the `who` of the assert. */
export function sections(text: string): { who: string; text: string }[] {
  const out: { who: string; text: string }[] = [];
  let who = 'librarian';
  let buf: string[] = [];
  for (const line of text.split('\n')) {
    const m = WHO_RE.exec(line);
    if (m) { out.push({ who, text: buf.join('\n') }); who = m[1]; buf = []; }
    else buf.push(line);
  }
  out.push({ who, text: buf.join('\n') });
  return out.filter((s) => s.text.trim().length > 0);
}

const BUDGET = 4_000_000;

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

export interface SpecWorld {
  r: Rofl; duties: Duty[]; citations: CiteResult[]; census: Census;
  /** the [checks] book this run computed, as ROFL text: the census plus the
   *  citation verdicts. Carried out so `facts/spec-census.rofl` is the SAME
   *  text the report was computed from rather than a second derivation. */
  checksBook: string;
}

/** boot.rofl + the discipline + the ledger + the census, evaluated, with the
 *  citation verdicts asserted back into [checks] and evaluated again. The
 *  second pass is what makes `unfounded` derivable: the model cannot verify
 *  its own citations, so the scanner does it and files the answer. */
export interface WorldOpts {
  /** extra duties or links, loaded as the librarian: the probe's own plant. */
  extra?: string;
  /** a check the census must PRETEND is gone — the deliberate removal that
   *  proves the model can report a covered obligation as uncovered. */
  omit?: (c: Check) => boolean;
}

export function world(opts: WorldOpts = {}): SpecWorld {
  const r = new Rofl();
  must(r.load(read('boot.rofl')), 'boot.rofl');
  must(r.load(read('rules/spec-coverage.rofl')), 'rules/spec-coverage.rofl');
  for (const s of sections(read('facts/spec.rofl'))) {
    must(r.load(s.text, { who: s.who }), `facts/spec.rofl [@who ${s.who}]`);
  }
  const full = census();
  const c: Census = opts.omit
    ? { checks: full.checks.filter((x) => !opts.omit!(x)), testFiles: full.testFiles }
    : full;
  must(r.load(censusFacts(c), { who: 'census' }), 'census');
  if (opts.extra && opts.extra.trim()) must(r.load(opts.extra, { who: 'librarian' }), 'extra');
  r.evaluate(BUDGET);

  const duties: Duty[] = r.query('duty_of[coverage](O, K, P, F, A)').rows.map((row) => ({
    id: row.bindings['O'], kind: row.bindings['K'], ledger: row.bindings['P'],
    file: unq(row.bindings['F']), line: Number(row.bindings['L']), anchor: unq(row.bindings['A']),
  }));
  const citations = duties.map(checkCitation);
  const ok = citations.filter((x) => x.ok).map((x) => `citation_ok[checks](${x.duty.id}).`);
  const present = r.query('discharged_by[map](O, Path)').rows
    .filter((row) => fs.existsSync(path.join(ROOT, unq(row.bindings['Path']))))
    .map((row) => `artifact_present[checks](${row.bindings['O']}).`);
  const verdicts = [...ok, ...present].join('\n') + '\n';
  must(r.load(verdicts, { who: 'census' }), 'citation verdicts');
  r.evaluate(BUDGET);
  return { r, duties, citations, census: c, checksBook: censusFacts(c) + verdicts };
}

// ---------------------------------------------------------------------------
// the census as a committed pack
//
// WHY THIS EXISTS. `rules/spec-coverage.rofl` was already a golden world and it
// was EMPTY: `scripts/goldens.ts` pairs `rules/X.rofl` with `facts/X.rofl` by
// name, the specification lives in `facts/spec.rofl`, and so the world loaded
// the discipline and zero duties — 32 relations in the census and not one
// `duty`, `covered` or `uncovered` row. Every verdict in it was a negation over
// an empty relation, green for a day after `npm run speccheck` had stopped
// running at all.
//
// A world assembled from `.rofl` files cannot walk the filesystem, so the two
// books the verdicts are computed FROM — which checks exist, and which
// citations resolve — have to be written down. That is what this pack is, and
// `--check` is what keeps it from becoming a photograph: regenerate, compare,
// fail. `scripts/goldens.ts` spawns it, so a stale census is a red `npm test`
// rather than a number nobody re-measured.

const CENSUS_PACK = 'facts/spec-census.rofl';

export function censusPack(w: SpecWorld = world()): string {
  return [
    `-- ${CENSUS_PACK} — GENERATED by \`npm run speccheck -- --write\`.`,
    '--',
    '-- The [checks] book: which checks exist in the tree, which test files do,',
    '-- and which duty citations resolve. A world made of `.rofl` files cannot',
    '-- walk a filesystem or open a cited document, so the answers are written',
    '-- here and `npm test` fails when they are stale.',
    '--',
    '-- @who census',
    '',
    w.checksBook.trimEnd(),
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// the report

const col = (r: Rofl, lit: string, v: string): string[] =>
  r.query(lit).rows.map((x) => unq(x.bindings[v])).sort();

export function report(w: SpecWorld = world()): string[] {
  const { r, duties, citations, census: c } = w;
  const out: string[] = [];
  const say = (s = '') => out.push(s);
  const byId = new Map(duties.map((d) => [d.id, d]));
  const cite = (id: string): string => {
    const d = byId.get(id);
    return d ? d.file : '?';
  };

  const ledgers = [...new Set(duties.map((d) => d.ledger))].sort();
  const kinds = [...new Set(duties.map((d) => d.kind))].sort();
  say(`${duties.length} duties in ${ledgers.length} ledgers: ` +
    ledgers.map((p) => `${p} ${duties.filter((d) => d.ledger === p).length}`).join(', '));
  say(`by kind: ` + kinds.map((k) => `${k} ${duties.filter((d) => d.kind === k).length}`).join(', '));
  say(`${c.checks.length} checks in the census ` +
    `(${c.checks.filter((x) => x.kind === 'test').length} tests in ${c.testFiles.length} files, ` +
    `${c.checks.filter((x) => x.kind === 'gate').length} gate scripts, ` +
    `${c.checks.filter((x) => x.kind === 'ci').length} CI steps)`);

  const covered = col(r, 'covered[coverage](O)', 'O');
  const uncovered = col(r, 'uncovered[coverage](O)', 'O');
  const superseded = col(r, 'superseded[coverage](O)', 'O');
  say(`covered ${covered.length}, uncovered ${uncovered.length}, superseded ${superseded.length}`);
  say('');

  say('-- UNCOVERED: the kernel owes it, nothing mechanical holds it --------');
  const unattended = new Set(col(r, 'unattended[coverage](O)', 'O'));
  const prose = col(r, 'prose_discharged[coverage](O)', 'O');
  for (const kind of kinds) {
    const rows = uncovered.filter((o) => byId.get(o)?.kind === kind && unattended.has(o));
    if (rows.length === 0) continue;
    say(`  ${kind} (${rows.length}):`);
    for (const o of rows) say(`    ${o.padEnd(38)} ${cite(o)}`);
  }
  if (prose.length > 0) {
    say(`  discharged by an artefact rather than a test (${prose.length}):`);
    for (const o of prose) say(`    ${o.padEnd(38)} ${cite(o)}`);
  }
  say('');

  const shortcuts = col(r, 'open_shortcut[coverage](O)', 'O');
  say(`-- PROHIBITIONS with no mechanical check (${shortcuts.length}) --------`);
  for (const o of shortcuts) say(`    ${o.padEnd(38)} ${cite(o)}`);
  say('');

  const dangling = r.query('dangling[coverage](C, O)').rows
    .map((x) => `${x.bindings['C']} -> ${x.bindings['O']}`).sort();
  const undef = r.query('undefined_citation[coverage](C, O)').rows
    .map((x) => `${x.bindings['C']} -> ${x.bindings['O']}`).sort();
  say(`-- CITATIONS THAT NO LONGER RESOLVE ----------------------------------`);
  say(`  dangling (the cited check is not in the census): ${dangling.length}`);
  for (const x of dangling) say(`    ${x}`);
  say(`  undefined (the guard names a check id nothing declares): ${undef.length}`);
  for (const x of undef) say(`    ${x}`);
  const unfounded = col(r, 'unfounded[coverage](O)', 'O');
  say(`  unfounded (the anchor is not in the file, or is in it twice): ${unfounded.length}`);
  for (const o of unfounded) {
    const why = citations.find((x) => x.duty.id === o);
    say(`    ${o.padEnd(38)} ${why ? why.why : ''}`);
  }
  say('');

  say('-- CHANGED --------------------------------------------------------');
  for (const row of r.query('amends[map](New, Old)').rows) {
    say(`    ${row.bindings['New']} amends ${row.bindings['Old']}  ` +
      `(${cite(row.bindings['New'])} over ${cite(row.bindings['Old'])})`);
  }
  for (const row of r.query('qualified[coverage](Old, New)').rows) {
    say(`    ${row.bindings['New']} qualifies ${row.bindings['Old']}  ` +
      `(${cite(row.bindings['New'])} over ${cite(row.bindings['Old'])})`);
  }
  say('');

  const unwritten = col(r, 'unwritten[coverage](F)', 'F');
  say(`-- TEST FILES NO DUTY CITES (${unwritten.length} of ${c.testFiles.length}) ------------`);
  for (const f of unwritten) {
    const n = c.checks.filter((x) => x.file === f).length;
    say(`    ${f.padEnd(42)} ${n} tests`);
  }
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--write') || argv.includes('--check')) {
    const fresh = censusPack();
    const file = path.join(ROOT, CENSUS_PACK);
    const held = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (argv.includes('--write')) {
      if (held === fresh) { console.log(`  ok    ${CENSUS_PACK}`); return; }
      fs.writeFileSync(file, fresh);
      console.log(`  wrote ${CENSUS_PACK}`);
      return;
    }
    if (held === fresh) { console.log(`  ok    ${CENSUS_PACK}`); return; }
    console.error(`  STALE ${CENSUS_PACK} — run \`npm run speccheck -- --write\``);
    process.exit(1);
  }
  for (const line of report()) console.log(line);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(path.resolve(new URL(import.meta.url).pathname))) {
  main();
}
