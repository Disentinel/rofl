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
//   2. CITATIONS. Every duty names File, Line and an anchor string. This
//      reads the line and checks the anchor is there. A duty whose anchor has
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

/** A top-level `test('...'` or `test("...")`, with backslash escapes undone.
 *  Top-level only: a nested test is part of its parent's subject, and the
 *  citations in facts/spec.rofl name testable units, not sub-steps. */
const TEST_RE = /^test\(\s*(['"])((?:[^\\]|\\.)*?)\1/;

function unescape(s: string): string {
  return s.replace(/\\(.)/g, '$1');
}

export function testNames(source: string): string[] {
  const out: string[] = [];
  for (const line of source.split('\n')) {
    const m = TEST_RE.exec(line);
    if (m) out.push(unescape(m[2]));
  }
  return out;
}

/** npm scripts that are CHECKS rather than entry points. A check is a script
 *  the tree can fail on; `repl`, `scan`, `report` cannot fail a build. */
const GATE_SCRIPTS = new Set(['test', 'test:bun', 'grepcheck', 'textcheck', 'measurecheck']);

export function census(): Census {
  const checks: Check[] = [];
  const testDir = path.join(ROOT, 'test');
  const testFiles = fs.readdirSync(testDir).filter((f) => f.endsWith('.test.ts')).sort();
  for (const f of testFiles) {
    const rel = `test/${f}`;
    for (const name of testNames(fs.readFileSync(path.join(testDir, f), 'utf8'))) {
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
  return { checks, testFiles: testFiles.map((f) => `test/${f}`) };
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
  id: string; kind: string; ledger: string; file: string; line: number; anchor: string;
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

/** Does the anchor stand at the line the duty names? Whitespace is collapsed
 *  on both sides — a reflowed paragraph is not a moved sentence — and nothing
 *  else is normalised, so a rewritten sentence fails. */
export function checkCitation(d: Duty): CiteResult {
  const ls = lines(d.file);
  if (ls.length === 0) return { duty: d, ok: false, why: `no such file: ${d.file}` };
  if (d.line < 1 || d.line > ls.length) {
    return { duty: d, ok: false, why: `${d.file} has ${ls.length} lines, cited ${d.line}` };
  }
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  const found = flat(ls[d.line - 1]).includes(flat(d.anchor));
  return { duty: d, ok: found, why: found ? '' : `not at ${d.file}:${d.line}: ${flat(ls[d.line - 1]).slice(0, 60)}` };
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

export interface SpecWorld { r: Rofl; duties: Duty[]; citations: CiteResult[]; census: Census; }

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

  const duties: Duty[] = r.query('duty_of[coverage](O, K, P, F, L, A)').rows.map((row) => ({
    id: row.bindings['O'], kind: row.bindings['K'], ledger: row.bindings['P'],
    file: unq(row.bindings['F']), line: Number(row.bindings['L']), anchor: unq(row.bindings['A']),
  }));
  const citations = duties.map(checkCitation);
  const ok = citations.filter((x) => x.ok).map((x) => `citation_ok[checks](${x.duty.id}).`);
  const present = r.query('discharged_by[map](O, Path)').rows
    .filter((row) => fs.existsSync(path.join(ROOT, unq(row.bindings['Path']))))
    .map((row) => `artifact_present[checks](${row.bindings['O']}).`);
  must(r.load([...ok, ...present].join('\n') + '\n', { who: 'census' }), 'citation verdicts');
  r.evaluate(BUDGET);
  return { r, duties, citations, census: c };
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
    return d ? `${d.file}:${d.line}` : '?';
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
  say(`  unfounded (the anchor is not at the line the duty names): ${unfounded.length}`);
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
  for (const line of report()) console.log(line);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(path.resolve(new URL(import.meta.url).pathname))) {
  main();
}
