// test/permission-doc.test.ts — THE GATE THAT KEEPS THE DOCUMENT HONEST.
//
// `docs/books-and-permission.md` exists because the book-and-permission
// question was being answered in twelve places at once. A document is not a
// remedy for that on its own — `HANDOFF.md` was deleted on 2026-09-07 for
// exactly this reason, and every stale claim §5 of that document corrects was
// written by someone who believed a paragraph.
//
// So the SET is checkable. This test derives the permission family from
// boot.rofl and asserts that the document's inventory tables list the same
// relations, in both directions.
//
// BOTH SIDES ARE RE-DERIVED HERE, FROM THE SOURCE FILES, EVERY RUN. It does
// NOT read facts/permission-inventory.rofl: a gate that reads a generated file
// stays green when boot.rofl grows a relation and nobody re-ran the scanner,
// which is the stale-check shape this repository has paid for twice
// (`f_a_gate_inherits_the_scope_of_its_incident`, the kernel_grep list that
// fell three names behind boot.rofl).
//
// WHAT THIS GATE CANNOT LOOK AT, measured with mutant 6 below rather than
// assumed: it compares SETS OF NAMES. Every word of prose in that document —
// every "who may write it", every "what it cannot see", every number — is
// invisible to it. A row whose text is replaced with nonsense passes. The
// numbers in the document are dated for that reason, and re-measuring them is
// a person's job.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { bootStructure, docListed } from '../scanners/permission_inventory.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MODEL = read('rules/permission-model.rofl');
const BOOT = read('boot.rofl');
const DOC = read('docs/books-and-permission.md');

/** The model, fed a boot.rofl and a document. Both are parameters so a mutant
 *  is a string edit and never a file edit. */
function derive(bootSrc: string, docSrc: string): Rofl {
  const r = new Rofl();
  assert.equal(r.load(MODEL).ok, true, 'rules/permission-model.rofl loads');
  const bs = bootStructure(bootSrc);
  assert.equal(r.assert(bs.rules.join('\n')).ok, true, 'boot structure asserts');
  assert.equal(r.assert(bs.edb.map((x) => `boot_edb(${x}).`).join('\n')).ok, true, 'edb decls assert');
  const listed = docListed(docSrc);
  if (listed.length) assert.equal(r.assert(listed.map((x) => `doc_lists(${x}).`).join('\n')).ok, true);
  r.evaluate();
  return r;
}

const col = (r: Rofl, q: string, v = 'Rel'): string[] =>
  r.query(q).rows.map((x) => x.bindings[v]).sort();

// ---------------------------------------------------------------- the gate
test('the document lists exactly the permission family boot.rofl defines', () => {
  const r = derive(BOOT, DOC);
  const family = col(r, 'family(Rel)');
  const inventory = col(r, 'inventory(Rel)');

  // the closure found something, and it did not find everything: `outside`
  // holds boot.rofl's STRUCTURAL audits, which read the shape of a rule and
  // never a book. An empty `outside` would mean the criterion had gone slack.
  assert.ok(family.length >= 20, `family is ${family.length}, expected at least 20`);
  assert.ok(col(r, 'outside(Rel)').length > 0,
    'the family closure is a claim, not a net: something in boot.rofl is outside it');

  assert.deepEqual(col(r, 'doc_missing(Rel)'), [],
    'every relation of the permission family has a row in docs/books-and-permission.md');
  assert.deepEqual(col(r, 'doc_extra(Rel)'), [],
    'every row in docs/books-and-permission.md names a relation boot.rofl still has');
  assert.deepEqual(docListed(DOC), inventory, 'the two sides agree as sets');
});

// ------------------------------------------------------- the mutant set
//
// One mutant shows the gate is alive. A SET says what it covers. Each names
// the constraint it targets, and the last two are the ones that matter: a
// negative control that must stay GREEN, and a survivor that says where this
// gate is structurally unable to look.

test('mutant 1: a new permission relation in boot.rofl with no doc row goes red', () => {
  // targets: the failure this gate exists for. A fifth declaration, in the
  // shape of the four that exist, plus an audit reading it.
  const mutated = BOOT + '\nedb(revokes).\nrevoked[audit](A, B) :- revokes(A), crossing(A, B).\n';
  const r = derive(mutated, DOC);
  assert.deepEqual(col(r, 'doc_missing(Rel)'), ['revoked', 'revokes'],
    'both the declaration and the audit reading it are named');
  assert.deepEqual(col(r, 'doc_extra(Rel)'), []);
});

test('mutant 2: deleting a row from the document goes red, and names it', () => {
  // targets: the document drifting behind by deletion.
  const mutated = DOC.split('\n').filter((l) => !/^\|\s*`collects`/.test(l)).join('\n');
  const r = derive(BOOT, mutated);
  assert.deepEqual(col(r, 'doc_missing(Rel)'), ['collects']);
});

test('mutant 3: a document row for a relation boot.rofl does not have goes red', () => {
  // targets: a rename that leaves the old row standing — the way a document
  // rots without anyone deleting anything.
  const mutated = DOC + '\n| `publishes`/1 | the source | the old name of exports |\n';
  const r = derive(BOOT, mutated);
  assert.deepEqual(col(r, 'doc_extra(Rel)'), ['publishes']);
});

test('mutant 4: renaming a family relation in boot.rofl fires BOTH directions', () => {
  // targets: the case where the set changes without changing size. A gate
  // that only counted would sleep through this.
  const mutated = BOOT.replace(/\bgathered\b/g, 'discharged');
  const r = derive(mutated, DOC);
  assert.deepEqual(col(r, 'doc_missing(Rel)'), ['discharged']);
  assert.deepEqual(col(r, 'doc_extra(Rel)'), ['gathered']);
});

test('mutant 5, NEGATIVE CONTROL: a structural audit in boot.rofl stays green', () => {
  // targets: the criterion itself. The family is NOT "every relation in
  // boot.rofl" — it is what hangs off `perspective`. A new audit over the
  // SHAPE of a rule, in the register of `breach` and `unmoded`, must not be
  // demanded of this document. If this goes red the closure has gone slack
  // and the gate has become a file census wearing a model's clothes.
  const mutated = BOOT + '\nheadless[audit](R) :- concludes(R, Rel), not reserved(Rel).\n';
  const r = derive(mutated, DOC);
  assert.ok(col(r, 'outside(Rel)').includes('headless'), 'the new audit lands outside the family');
  assert.deepEqual(col(r, 'doc_missing(Rel)'), [], 'and the document is not asked to carry it');
  assert.deepEqual(col(r, 'doc_extra(Rel)'), []);
});

test('mutant 6, THE SURVIVOR: rewriting what a row SAYS stays green', () => {
  // targets: nothing — it is the measurement of where this gate cannot look,
  // recorded because a gate whose blind spot is undocumented gets mistaken
  // for coverage. Every claim in the document's prose is outside it.
  const mutated = DOC.replace(
    /^\| `forged`\/1 \|.*$/m,
    '| `forged`/1 | it catches nothing | it sees everything | 99999 |');
  const r = derive(BOOT, mutated);
  assert.deepEqual(col(r, 'doc_missing(Rel)'), [], 'the gate is silent');
  assert.deepEqual(col(r, 'doc_extra(Rel)'), [], 'the gate is silent');
  assert.notEqual(mutated, DOC, 'the mutant really did change the file');
});

// -------------------------------------------------- the derived negatives
//
// The two statements a grep cannot make. They are asserted here so that the
// day one of them stops being true, the document is told to say so.

test('every audit row is terminal: no rule anywhere builds on one', () => {
  const r = new Rofl();
  r.load(MODEL);
  r.assert(read('facts/permission-inventory.rofl'));
  r.evaluate();
  assert.deepEqual(col(r, 'audit_row(Rel)'),
    ['collected', 'exported', 'forged', 'leak', 'unattributed', 'widened']);
  assert.deepEqual(col(r, 'terminal_non_audit(Rel)'), [],
    'a non-audit relation nothing consumes would be dead weight');
  for (const a of col(r, 'audit_row(Rel)')) {
    assert.ok(r.holds(`terminal(${a})`), `${a} is read by no rule`);
  }
});

test('demands_authorship is an offer no program in this repository has taken', () => {
  // The negative §3.3 rests on. If a demo ever declares it, this goes red and
  // the document's "0 facts in 0 programs" has to be re-measured — which is
  // the point: the claim is pinned to a fact, not to a memory.
  const r = new Rofl();
  r.load(MODEL);
  r.assert(read('facts/permission-inventory.rofl'));
  r.evaluate();
  assert.ok(r.holds('never_declared(demands_authorship)'));
  assert.ok(r.holds('untaken_offer(demands_authorship)'));
  assert.deepEqual(col(r, 'never_declared(Rel)'), ['demands_authorship'],
    'and it is the only declaration in that state');
});
