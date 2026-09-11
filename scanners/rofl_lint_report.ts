// scanners/rofl_lint_report.ts — render rules/rofl-lint.rofl over the census.
//
//   node --experimental-strip-types scanners/rofl_lint_report.ts [FILE ...]
//
// With no FILE the two files the instrument was built for are the focus; the
// population numbers are always over every rule pack the scanner read. Every
// number printed is beside the query that produced it, so the reader can run
// the query and argue with the rule rather than with this script.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = join(import.meta.dirname, '..');
const focus = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['rules/js-effects.rofl', 'rules/js-callgraph.rofl'];

const r = new Rofl();
for (const f of ['boot.rofl', 'facts/rofl-lint.rofl', 'rules/rofl-lint.rofl']) {
  const res = r.load(readFileSync(join(ROOT, f), 'utf8'));
  if (!res.ok) { console.error(`${f} REJECTED:\n${res.diagnostics.join('\n')}`); process.exit(1); }
}
r.evaluate();

const rows = (query: string) => {
  const res = r.query(query);
  if (res.error) throw new Error(`${query}: ${res.error}`);
  return res.rows.map((x) => x.bindings);
};
const n = (query: string) => rows(query).length;
const strip = (x: string | undefined) => (x ?? '?').replace(/^"|"$/g, '');
const Q = (s: string) => JSON.stringify(s);

console.log('ROFL LINT — what in a rule file could be shorter\n');
console.log('THE POPULATION — every rule pack the census read');
for (const [label, query] of [
  ['rule clauses', 'clause(Id, _, _, _, _, _)'],
  ['comment blocks', 'block(B, _, _, _)'],
  ['orphan blocks (prose over no clause)', 'orphan_block(B, _, _, _)'],
  ['blocks of 30+ lines', 'long_block(B, _, _, _)'],
  ['blocks carrying a date', 'dated_block(B, _, _, _)'],
  ['dangling mentions (called form)', 'dangling_mention(B, _, _, _)'],
  ['dangling mentions (bare snake_case)', 'dangling_bare(B, _, _, _)'],
  ['twins (one body, two heads)', 'twin(A, B, _, _, _)'],
  ['paired arms (one body, one head, two constants)', 'paired_arm(A, B, _, _)'],
  ['shape twins (3+ premises)', 'shape_twin(A, B, _, _, _)'],
  ['aliases (a rule that renames)', 'alias(Id, _, _, _)'],
  ['implied premises', 'implied(Id, _, _, _, _)'],
  ['unread relations', 'unread(Rel, _, _)'],
  ['audits no test names', 'unasserted_audit(Rel, _)'],
]) console.log(`  ${label.padEnd(40)}${String(n(query)).padStart(6)}   ${query}`);

for (const file of focus) {
  const f = Q(file);
  console.log(`\n${'='.repeat(78)}\n${file}\n`);
  const census = rows(`lint_file(${f}, C, M, B)`)[0];
  const cl = rows(`file_clauses(${f}, R, Fa)`)[0];
  if (!census || !cl) { console.log('  (not in the census)'); continue; }
  console.log(`  lines: ${census['C']} code, ${census['M']} comment, ${census['B']} blank` +
    `   clauses: ${cl['R']} rules, ${cl['Fa']} facts` +
    `   comment ${strip(rows(`comment_pct(${f}, P)`)[0]?.['P'])}%` +
    `   ${strip(rows(`comment_lines_per_rule(${f}, P)`)[0]?.['P'])} comment lines per rule`);

  const section = (title: string, query: string, fmt: (b: Record<string, string>) => string) => {
    const got = rows(query);
    console.log(`\n  ${title}: ${got.length}      ${query}`);
    for (const b of got) console.log(`    ${fmt(b)}`);
  };
  section('ORPHAN BLOCKS — prose followed by prose, not by a clause',
    `orphan_block(B, ${f}, L, N)`, (b) => `line ${b['L'].padStart(5)}  ${b['N'].padStart(3)} lines`);
  section('LONG BLOCKS — 30 lines or more',
    `long_block(B, ${f}, L, N)`, (b) => `line ${b['L'].padStart(5)}  ${b['N'].padStart(3)} lines`);
  section('DATED BLOCKS — history rather than criterion',
    `dated_block(B, ${f}, L, N)`, (b) => `line ${b['L'].padStart(5)}  ${b['N']} dated line(s)`);
  section('DANGLING MENTIONS — a relation the prose calls and nothing defines',
    `dangling_mention(B, ${f}, L, Name)`, (b) => `line ${b['L'].padStart(5)}  ${b['Name']}`);
  section('DANGLING BARE NAMES — a snake_case name in backticks that nothing defines or carries',
    `dangling_bare(B, ${f}, L, Name)`, (b) => `line ${b['L'].padStart(5)}  ${b['Name']}`);
  section('SECTION NUMBER USED TWICE',
    `section_twice(${f}, N, L1, L2)`, (b) => `section ${b['N']} at lines ${b['L1']} and ${b['L2']}`);
  section('SECTION TITLE USED TWICE',
    `title_twice(${f}, T, L1, L2)`, (b) => `${strip(b['T'])}  at lines ${b['L1']} and ${b['L2']}`);
  section('A NUMBERED LIST THAT REPEATS A NUMBER',
    `list_repeats(B, ${f}, N, L1, L2)`, (b) => `item ${b['N']} at lines ${b['L1']} and ${b['L2']}`);
  section('TWINS — one body under two heads',
    `twin(A, B, HA, HB, ${f})`, (b) => `${b['HA']}  =  ${b['HB']}   (${strip(b['A'])}, ${strip(b['B'])})`);
  section('PAIRED ARMS — one body, one head, differing in a head constant',
    `paired_arm(A, B, H, ${f})`, (b) => `${b['H']}   (${strip(b['A'])}, ${strip(b['B'])})`);
  section('SHAPE TWINS — the same shape with relations renamed (weaker)',
    `shape_twin(A, B, HA, HB, ${f})`, (b) => `${b['HA']}  ~  ${b['HB']}   (${strip(b['A'])}, ${strip(b['B'])})`);
  section('ALIASES — a rule whose whole content is another relation',
    `alias(Id, ${f}, Head, Of)`, (b) => `${b['Head']}  :-  ${b['Of']}   (${strip(b['Id'])})`);
  section('IMPLIED PREMISES — a premise the rule could drop without changing what it concludes',
    `implied(Id, ${f}, Head, P, Q)`, (b) => `${b['Head']}: ${b['P']} follows from ${b['Q']}   (${strip(b['Id'])})`);
  section('UNREAD — concluded here, read by no rule and named by no .ts file',
    `unread(Rel, ${f}, Book)`, (b) => `${b['Rel']}[${b['Book']}]`);
  section('AUDITS NO TEST NAMES',
    `unasserted_audit(Rel, ${f})`, (b) => `${b['Rel']}[audit]`);
}
