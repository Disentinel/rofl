// test/exports.test.ts — THE NAMELESS READER OF A NAMED BOOK.
//
// The model these tests exercise -- the four declarations, who may write each
// and what each permits -- is docs/books-and-permission.md 2.1. What is local
// here: the gap `exports(A, anyone)` closed was recorded as permanent
// (`f_there_is_no_instrument_for_a_nameless_reader_of_a_named_book`) -- a rule
// polymorphic in its HEAD book reads a named one, and `$var("G")` can never be
// the To of an import. Three rows, two programs, and both said in their own
// comments that the available workaround -- `imports($var("G"), main).` -- was
// worse than the gap, because it licenses THE SPELLING OF A VARIABLE.
//
// These tests pin what `exports(A, anyone)` covers and, more importantly, what
// it must NOT. (It was built and shipped under the name `publishes(A)` and
// renamed the same day; nothing but the spelling changed.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

/** A world on a boot.rofl with one substitution applied. Asserts the pattern
 *  was PRESENT and the text actually CHANGED before any verdict is read: a
 *  mutant that does not mutate proves nothing, which this repository has now
 *  paid for twice. */
function bootWith(from: string, to: string): string {
  assert.ok(BOOT.includes(from), `mutant pattern absent: ${from.slice(0, 48)}`);
  const out = BOOT.replace(from, to);
  assert.notEqual(out, BOOT, 'mutant did not change the text');
  return out;
}
function world(boot: string, files: string[], extra?: string): Rofl {
  const r = new Rofl(); r.load(boot);
  for (const f of files) r.load(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  if (extra) r.load(extra);
  r.evaluate();
  return r;
}
const dir = (d: string): string[] => fs.readdirSync(path.join(ROOT, d)).sort()
  .filter((x) => x.endsWith('.rofl')).map((x) => `${d}/${x}`);
const leaks = (r: Rofl): number => r.query('leak[audit](A, B)').rows.length;

const GOOF = dir('examples/goof');
const NPC = dir('examples/npc');

test('one declaration closes the gap in each demo, and is exercised', () => {
  assert.equal(leaks(world(BOOT, GOOF)), 0);
  assert.equal(leaks(world(BOOT, NPC)), 0);
  // exercised, not merely written -- the census counts CODE and a declaration
  // nothing derives from is a comment with a dot on the end.
  assert.ok(world(BOOT, GOOF).holds('exported[audit](main)'));
  assert.ok(world(BOOT, NPC).holds('exported[audit](world)'));
  // goof never licenses the KERNEL's book: the two-hop `$kernel -> $var("G")`
  // is discharged by the source-side clause, so one declaration serves both.
  assert.ok(!world(BOOT, GOOF).holds('exports($kernel, anyone)'));
});

test('MUTANTS: what the instrument covers, and what it must refuse', () => {
  // M1 -- the declaration is load-bearing, not decoration.
  const m1 = bootWith('exported_to(A, B)     :- exports(A, anyone), flow(A, B)',
                      'exported_to(A, B)    :- publishes(zzz_nothing), flow(A, B)');
  assert.equal(leaks(world(m1, GOOF)) + leaks(world(m1, NPC)), 3, 'M1 KILLED: three rows return');

  // M2 -- the clause must be TRANSITIVE on the source side. Reduced to the
  // direct form, goof's second row returns: it is a TWO-HOP walk,
  // `$kernel -> main -> $var("G")`, and `exports(main, anyone)` alone leaves it
  // standing. npc's single hop is unaffected, which is what makes this mutant
  // about transitivity rather than about the clause existing at all.
  const m2 = bootWith('gathered(A, B)        :- sees(X, A), exported_to(X, B).',
                      'gathered(A, B)        :- exported_to(A, B).');
  assert.equal(leaks(world(m2, GOOF)), 1, 'M2 KILLED: the two-hop returns');
  assert.equal(leaks(world(m2, NPC)), 0, 'and the one-hop demo is untouched by it');

  // M3 -- `sees(X, A)` and NOT `flows_to(A, X)`, which is the difference
  // between a licence and a laundry. goof's own positive control plants an
  // undeclared `euclid -> main` crossing; under `flows_to` its CONSEQUENCE
  // `euclid -> $var("G")` went silent while only the root stayed named.
  const m3 = bootWith('gathered(A, B)        :- sees(X, A), exported_to(X, B).',
                      'gathered(A, B)        :- flows_to(A, X), exported_to(X, B).');
  const planted3 = world(m3, GOOF, 'sneak(P) :- axiom[euclid](P).');
  assert.equal(leaks(planted3), 2, 'M3 KILLED: a publication would launder the walk it opens');
  assert.equal(leaks(world(BOOT, GOOF, 'sneak(P) :- axiom[euclid](P).')), 3,
    'and the honest rule keeps all three rows of that control');

  // M4 -- the reader guard. `publishes` licenses a crossing to a NAMELESS
  // reader only; a crossing to a REGISTERED book still needs `imports`. The
  // corpus does not exercise this, so it takes a fixture rather than a
  // programme -- recorded as such rather than left as an unexercised branch.
  const FIX = 'edb(src).\nsrc(1).\nexports(alpha, anyone).\nq[beta](X) :- src[alpha](X).\n';
  assert.equal(leaks(world(BOOT, [], FIX)), 1, 'the named-to-named crossing still leaks');
  assert.equal(world(BOOT, [], FIX).query('exported[audit](A)').rows.length, 0,
    'and nothing was published, because beta is a registered perspective');
  const m4 = bootWith('flow(A, B), A != B, not perspective(B).', 'flow(A, B), A != B.');
  assert.equal(leaks(world(m4, [], FIX)), 0, 'M4 KILLED: without the guard it is silenced');
});

test('the declaration survives the tick boundary', () => {
  // The third relation of its kind to need this, found the same way as the
  // first two: `f_a_ledger_declaration_expires_at_the_tick_boundary`. Without
  // the carry, npc reported 20 infinite counts at tick 0 and 21 at tick 3,
  // because the declaration expired and the leak it discharges came back.
  const r = world(BOOT, NPC);
  assert.ok(r.holds('exports(world, anyone)'));
  r.tickAdvance();
  assert.ok(r.holds('exports(world, anyone)'), 'carried');
  assert.equal(leaks(r), 0, 'and still discharging after the boundary');
  const m = bootWith('exports(A, W)      @next :- exports(A, W).', '-- removed');
  const t = world(m, NPC);
  t.tickAdvance();
  assert.ok(!t.holds('exports(world, anyone)'), 'the carry is what keeps it');
});
