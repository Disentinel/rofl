// test/vocabulary-doc.test.ts — THE GATE THAT KEEPS README'S VOCABULARY HONEST.
//
// README.md says, in the *Deviations* section, that "the grep whitelist equals
// this README's tables". MEASURED 2026-09-10, IT DID NOT: of the 46 names
// `scripts/kernel_grep.ts` allows in kernel source, TWENTY appeared nowhere in
// the document — the thirteen relations of `policy.rofl` and `safety.rofl`,
// and all seven string and term destructors. The sentence had been true when
// it was written and had gone stale in the SAFE direction, which is why
// nothing noticed: a whitelist that is wider than the document turns nothing
// red, it only means the document stopped describing the kernel.
//
// That is the shape this repository already names twice — a gate inherits the
// scope of its incident, and a hand-written list goes stale on a refactor —
// and the remedy is the one `test/permission-doc.test.ts` already uses:
// RE-DERIVE BOTH SIDES FROM SOURCE ON EVERY RUN. This test imports the arrays
// the grep check itself uses (never a copy of them) and re-parses README.md
// live (never a generated index), so a name added to either side without the
// other goes red naming it.
//
// WHAT THIS GATE CANNOT LOOK AT, and mutant 6 measures it rather than assuming
// it: it compares SETS OF NAMES. Every word of prose in those tables — every
// arity, every "written by", every description — is invisible to it. A row
// whose meaning column is replaced with nonsense passes. Checking that would
// need a second source for the meanings, and there is none; a person reads it.
//
// The three SETS deliberately left out are named here so their absence is a
// decision rather than an oversight: `SYNTAX`, `CONSTANTS` and `IMPL` in the
// grep check are language keywords, hole reasons and host tags — they name no
// relation, so a vocabulary table is the wrong place for them, and `FORBIDDEN`
// is boot.rofl's own relations, which `docs/books-and-permission.md` owns.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { KERNEL_RELS, IFACE_RELS, BUILTINS } from '../scripts/kernel_grep.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

/** The markdown section between one `## heading` and the next. A section is
 *  addressed by heading rather than by line number for the reason the
 *  floor-sealing note at the end of README.md gives: a block inserted above
 *  moves every line below it. */
function section(doc: string, heading: string): string {
  const start = doc.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `README.md has a "## ${heading}" section`);
  const rest = doc.slice(start + 1);
  const end = rest.indexOf('\n## ', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Every relation named in the FIRST column of a markdown table, in the given
 *  region: a backticked identifier immediately followed by `(`. The first
 *  column only, so a relation MENTIONED in a description does not count as
 *  documented — mutant 5 is what makes that a measurement. */
function tabled(region: string): string[] {
  const out = new Set<string>();
  for (const line of region.split('\n')) {
    if (!line.startsWith('|')) continue;
    const first = line.slice(1).split('|')[0];
    if (/^\s*-+\s*$/.test(first)) continue;              // the separator row
    for (const m of first.matchAll(/`([a-z][A-Za-z0-9_]*)\(/g)) out.add(m[1]);
  }
  return [...out].sort();
}

/** The three regions of README.md this gate is about, cut out of one document
 *  so a mutant is a string edit and never a file edit. */
function documented(doc: string) {
  const vocab = section(doc, 'Kernel vocabulary');
  // The section holds three tables in order: reserved, read interface,
  // destructors. They are split on the paragraph that introduces each.
  const ifaceAt = vocab.indexOf('**It is no longer two names');
  const strAt = vocab.indexOf('**Term and string destructors**');
  assert.ok(ifaceAt > 0, 'README.md still introduces the read-interface table');
  assert.ok(strAt > ifaceAt, 'README.md still introduces the destructor table');
  return {
    reserved: tabled(vocab.slice(0, ifaceAt)),
    iface: tabled(vocab.slice(ifaceAt, strAt)),
    builtins: tabled(vocab.slice(strAt)),
  };
}

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

// ---------------------------------------------------------------- the gate
test('README.md documents exactly the vocabulary the grep check allows', () => {
  const doc = documented(README);

  // The positive control for all three: the tables are not empty, so "they
  // agree" is a measurement and not a pair of absences agreeing with itself.
  assert.ok(doc.reserved.length >= 20, `the reserved table is ${doc.reserved.length} rows`);
  assert.ok(doc.iface.length >= 15, `the read-interface table is ${doc.iface.length} rows`);
  assert.ok(doc.builtins.length >= 5, `the destructor table is ${doc.builtins.length} rows`);

  assert.deepEqual(doc.reserved, sorted(KERNEL_RELS),
    'the reserved table in README.md and KERNEL_RELS in scripts/kernel_grep.ts');
  assert.deepEqual(doc.iface, sorted(IFACE_RELS),
    'the read-interface table in README.md and IFACE_RELS in scripts/kernel_grep.ts');
  assert.deepEqual(doc.builtins, sorted(BUILTINS),
    'the destructor table in README.md and BUILTINS in scripts/kernel_grep.ts');
});

// ------------------------------------------------------- the mutant set
//
// One mutant shows the gate is alive. A SET says what it covers. Each names
// the constraint it targets; the last two are the ones that matter — a
// negative control that must stay GREEN, and a survivor that says where this
// gate is structurally unable to look.

test('mutant 1: a name allowed by the grep check with no README row goes red', () => {
  // targets: the failure this gate exists for, and the exact one measured on
  // 2026-09-10 — the whitelist grew thirteen relations and the document did
  // not. Simulated on the WHITELIST side, since that array is the import.
  const doc = documented(README);
  const widened = sorted([...IFACE_RELS, 'volume_of']);
  assert.notDeepEqual(doc.iface, widened);
  assert.ok(!doc.iface.includes('volume_of'), 'and it is missing on the document side, by name');
});

test('mutant 2: a README row deleted goes red, naming it', () => {
  // targets: the other direction — a table row lost to an edit.
  const cut = README.replace(/\n\| `demand_rel\(Rel\)`[^\n]*\n/, '\n');
  assert.notEqual(cut, README, 'the row to delete was found');
  const doc = documented(cut);
  assert.ok(!doc.iface.includes('demand_rel'));
  assert.notDeepEqual(doc.iface, sorted(IFACE_RELS));
});

test('mutant 3: a README row for a name the grep check does not allow goes red', () => {
  // targets: a relation documented as kernel vocabulary that the kernel may
  // not actually name — the direction a "document everything" gate misses.
  const grown = README.replace(
    '| `neg_relation(A)` |',
    '| `ghost_rel(A)` | `safety.rofl` | the kernel | invented |\n| `neg_relation(A)` |');
  assert.notEqual(grown, README, 'the anchor row was found');
  const doc = documented(grown);
  assert.ok(doc.iface.includes('ghost_rel'));
  assert.notDeepEqual(doc.iface, sorted(IFACE_RELS));
});

test('mutant 4: a rename goes red on BOTH sides, which a size check would sleep through', () => {
  // targets: the mutant a `length ===` comparison cannot see. Renaming keeps
  // both counts identical and changes the sets.
  const renamed = README.replace('| `late_rule(R)` |', '| `tardy_rule(R)` |');
  assert.notEqual(renamed, README, 'the row to rename was found');
  const doc = documented(renamed);
  assert.equal(doc.iface.length, IFACE_RELS.length, 'the SIZES still agree — that is the point');
  assert.ok(doc.iface.includes('tardy_rule') && !doc.iface.includes('late_rule'));
  assert.notDeepEqual(doc.iface, sorted(IFACE_RELS));
});

test('mutant 5 (NEGATIVE CONTROL): a relation named only in a DESCRIPTION stays green', () => {
  // targets: a slack criterion. If the reader scanned the whole section for
  // backticked names rather than the first column, every relation mentioned in
  // passing — and the descriptions mention many — would count as documented,
  // and mutant 3 could never fire. This one MUST NOT go red.
  const chatty = README.replace(
    '| `neg_relation(A)` | `safety.rofl` | the kernel | some rule negates A |',
    '| `neg_relation(A)` | `safety.rofl` | the kernel | some rule negates A, unlike `ghost_rel(A)` |');
  assert.notEqual(chatty, README, 'the row to embellish was found');
  const doc = documented(chatty);
  assert.deepEqual(doc.iface, sorted(IFACE_RELS), 'a mention in prose is not a row');
});

test('mutant 6 (THE SURVIVOR): a row whose meaning is replaced with a lie stays GREEN', () => {
  // targets: nothing — it says where this gate cannot look, and that is why it
  // is written down. The sets are names; the meanings have no second source in
  // the tree to check against, so a wrong description survives every assertion
  // here. A reader is the only check on that column.
  const lying = README.replace(
    '| `neg_relation(A)` | `safety.rofl` | the kernel | some rule negates A |',
    '| `neg_relation(A)` | the host | nobody | the number of ticks since boot |');
  assert.notEqual(lying, README, 'the row to falsify was found');
  const doc = documented(lying);
  assert.deepEqual(doc.iface, sorted(IFACE_RELS),
    'SURVIVED: this gate compares names, never claims');
});
