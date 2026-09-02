// authorship.test.ts — authorship is mandatory, and there is no anonymity.
//
// WHAT CHANGED, and it is a change to the LANGUAGE rather than a repair. There
// used to be a principal called `$anon` who held authority over every ordinary
// book, so an unsigned fact belonged to nobody AND could be written anywhere.
// That made anonymity THE ONLY WAY TO WRITE: a NAMED author writing into a book
// it had itself just created was `forged[audit]` = 1, measured — and that is why
// 420 loads in this repository passed no author while 44 did. The corpus was not
// anonymous by preference. Naming yourself was impossible.
//
// Now there are exactly two kinds of principal and no third:
//
//   `$kernel`  the ring. Claimed ONCE, by `$kernel_authority` as the first
//              clause of the first load — written in boot.rofl where a reader
//              sees it, never passed by a caller. A second claim is refused.
//   `user`     everyone else: whoever loaded a file and did not say who they
//              are. No `$`, deliberately — `$` marks what a caller may NOT
//              spell, and `user` is what any caller MAY, because claiming it
//              claims nothing.
//
// So an unsigned fact is not "anonymous" and not "the system's" — it belongs to
// the person at the keyboard, the way an unowned file in a home directory does.
// And `forged[audit]` finally means one thing: WRITING UNDER A NAME INTO A BOOK
// NOBODY GAVE YOU.
//
// THE HOLES, as measured before the change on a bare boot+sensors world:
//
//   1. `factMetaFacts` emitted `asserted_by` only when the caller passed a
//      `who`. A forgery signed `mallory` gave `forged[audit]` = 1; the SAME
//      forgery unsigned gave 0, with no diagnostic anywhere. Every audit here
//      reads `asserted_by`, so a fact with no row was not a fact with a weaker
//      claim to authorship — it was outside the audit entirely, and anonymity
//      was a cheaper attack than impersonation.
//
//   2. `$kernel` was an ordinary string. `registerPersp` grants
//      `authority(P, $kernel)` over every ledger, so a caller passing
//      `who: '$kernel'` wrote an ordinary trail row and `forged[audit]`
//      agreed with it. Impersonating the kernel was a string literal.
//
// Both sides of the gate are asserted here, because a gate that cannot say
// "no" is an assumption with a gate's interface, and a gate that cannot say
// "yes" gets switched off within a week and leaves the appearance of one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rofl } from '../src/api.ts';
import { ANON_WHO, KERNEL_WHO } from '../src/reflect.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const BOOT = read('boot.rofl');
const SENSORS = read('examples', 'sensors.rofl');

function world(): Rofl {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true, 'boot.rofl must load');
  assert.equal(r.load(SENSORS).ok, true, 'sensors.rofl must load');
  return r;
}
const n = (r: Rofl, q: string) => r.query(q).rows.length;

// ---------------------------------------------------------------------------
// the gate can say YES

test('the honest corpus is green: forged[audit] is empty on a loaded world', () => {
  const r = world();
  assert.equal(n(r, 'forged[audit](F)'), 0, 'nothing honest is forged');
  assert.equal(n(r, 'unattributed[audit](F, P)'), 0,
    'and no ledger has asked to be reported on');
  // The gate is satisfiable AND the trail is non-empty — the two together are
  // the claim. Empty-and-green would also be produced by an audit that reads
  // nothing at all, which is exactly the state this change repaired.
  assert.ok(n(r, 'asserted_by(F, W, T)') > 0, 'the trail is populated');
});

// ---------------------------------------------------------------------------
// HOLE 1: the anonymous assertion is no longer traceless

test('every asserted fact carries an author, and it is a real principal', () => {
  const r = world();
  // one per asserted base fact, with no gap for the unsigned ones
  assert.equal(n(r, 'asserted_by(F, W, T)'), n(r, 'in_perspective(F, P)'),
    'no fact is authorless: the trail and the ledger index agree row for row');
  // TWO PRINCIPALS AND NO THIRD, which is the whole model in one assertion.
  // boot.rofl claimed the ring with `$kernel_authority` and everything in it is
  // the kernel's; sensors.rofl named nobody and is the user's. Before the
  // change this line read "every author is the anonymous one", because there
  // was one principal and it belonged to nobody.
  const kernel = n(r, `asserted_by(F, ${KERNEL_WHO}, T)`);
  const usr = n(r, `asserted_by(F, ${ANON_WHO}, T)`);
  assert.equal(kernel + usr, n(r, 'asserted_by(F, W, T)'),
    'every author is either the kernel or the user — there is no third kind');
  assert.ok(kernel > 0, 'boot.rofl claimed the ring, so the kernel really wrote');
  assert.ok(usr > 0, 'sensors.rofl named nobody, so the user really wrote');
});

test('an unsigned assertion leaves a row where it used to leave nothing', () => {
  const r = world();
  const before = n(r, 'asserted_by(F, W, T)');
  assert.equal(r.assert('reading[s1](t2, 30).').ok, true);
  assert.equal(n(r, 'asserted_by(F, W, T)'), before + 1,
    'the unsigned assertion is in the trail; before the change this was +0');
  const row = r.query('asserted_by($fact(reading, s1, $cons(t2, $cons(30, $nil))), W, T)');
  assert.equal(row.rows.length, 1, 'and it is THAT fact that is attributable');
  assert.equal(row.rows[0].bindings['W'], ANON_WHO);
});

// ---------------------------------------------------------------------------
// the gate can say NO

test('a named writer without authority is forged, with numbers either side', () => {
  const r = world();
  assert.equal(n(r, 'forged[audit](F)'), 0, 'before: 0');
  assert.equal(r.assert('reading[s1](t2, 30).', { who: 'mallory' }).ok, true);
  assert.equal(n(r, 'forged[audit](F)'), 1, 'after: 1');
  assert.match(r.query('forged[audit](F)').rows[0].text, /\$fact\(reading,s1/);
  // and it is authority that decides, not the name: a writer the ledger DOES
  // authorise adds no second row.
  assert.equal(r.assert('reading[s2](t2, 31).', { who: 'sensor_net' }).ok, true);
  assert.equal(n(r, 'forged[audit](F)'), 1, 'the authorised writer is not forged');
});

test('a ledger that DEMANDS authorship reports its unsigned facts', () => {
  const r = world();
  assert.equal(n(r, 'unattributed[audit](F, P)'), 0, 'before the declaration: 0');
  assert.equal(r.assert('demands_authorship(s1).').ok, true);
  assert.equal(r.assert('reading[s1](t9, 30).').ok, true);              // unsigned
  assert.equal(r.assert('reading[s1](t9, 31).', { who: 'sensor_net' }).ok, true); // signed
  const rows = r.query('unattributed[audit](F, P)').rows;
  assert.ok(rows.length > 0, 'the gate fires where a ledger asked');
  assert.ok(rows.every((x) => x.bindings['P'] === 's1'), 'only in the ledger that asked');
  assert.ok(!rows.some((x) => x.text.includes('$cons(31,')),
    'and the SIGNED fact is not among them — this is what makes it about authorship');
  // CONTROL: a ledger that did not ask is silent, which is what keeps this
  // from being a permanently red gate on a corpus that is anonymous throughout.
  assert.equal(n(world(), 'unattributed[audit](F, P)'), 0);
});

// ---------------------------------------------------------------------------
// HOLE 2: `$kernel` is out of the space of values `who` can take

test('a caller cannot claim a kernel principal', () => {
  for (const who of [KERNEL_WHO, '$anything']) {
    const r = world();
    const before = n(r, 'asserted_by(F, W, T)');
    const res = r.assert('reading[s1](t2, 30).', { who });
    assert.equal(res.ok, false, `who=${who} must be refused`);
    assert.match(res.diagnostics[0], /kernel principal/,
      'and the refusal must say what is wrong');
    assert.equal(n(r, 'asserted_by(F, W, T)'), before, 'nothing was written');
  }
});

test('the refusal rolls a whole load back, not just the offending clause', () => {
  const r = world();
  const before = n(r, 'asserted_by(F, W, T)');
  const res = r.load('reading[s1](t8, 10).\nreading[s1](t9, 99).', { who: KERNEL_WHO });
  assert.equal(res.ok, false);
  assert.equal(n(r, 'asserted_by(F, W, T)'), before,
    'load is atomic: a rejected who leaves no partial write');
});

test('an ordinary author is accepted, and the user principal stays replayable', () => {
  const r = world();
  assert.equal(r.assert('reading[s1](t2, 30).', { who: 'sensor_net' }).ok, true,
    'the check must not refuse ordinary callers');
  // `user` is spellable by anyone, and that is the point: it confers nothing
  // that omitting `who` does not already confer — both land the same row. It
  // MUST be spellable because the TRAIL IS REPLAYED: `asserted_by` is read
  // back out of a store and fed to `assertClauses` to reconstruct a past tick
  // (test/asserted-tick.test.ts). Refusing the author the kernel itself wrote
  // would make anonymous history the one history that cannot be replayed.
  assert.equal(r.assert('reading[s1](t3, 30).', { who: ANON_WHO }).ok, true);
  assert.equal(n(r, `asserted_by($fact(reading, s1, $cons(t3, $cons(30, $nil))), ${ANON_WHO}, T)`), 1);
});

// ---------------------------------------------------------------------------
// what the gate does NOT see, stated rather than left to be discovered

test('THE MODEL, not a limit: an unsigned fact is the USER\'s, and that is legal', () => {
  // This test used to be called KNOWN LIMIT and it pinned a HOLE: an unsigned
  // fact was signed `$anon`, `$anon` held authority everywhere, so `forged`
  // could not fire and omitting `who` was a cheaper attack than impersonation.
  // The hole is gone because the principal is gone. What is left is a MODEL:
  // a fact nobody signed belongs to `user`, who owns the ordinary books, and
  // that is not a forgery — it is a person writing in their own home.
  const r = world();
  assert.equal(r.assert('reading[s1](t2, 30).').ok, true);
  assert.equal(n(r, 'forged[audit](F)'), 0,
    'unsigned is the user, and the user owns ordinary books: nothing is forged');
  assert.equal(n(r, `asserted_by($fact(reading, s1, $cons(t2, $cons(30, $nil))), ${ANON_WHO}, T)`), 1,
    'and the trail names them — there is no authorless row any more');

  // THE OTHER SIDE, which is what the old hole made impossible: NAMING YOURSELF
  // now costs something. A caller who claims to be someone must have been given
  // the book in writing, and `forged` says so when they were not.
  const s2 = world();
  assert.equal(s2.assert('reading[s1](t3, 30).', { who: 'mallory' }).ok, true);
  assert.equal(n(s2, 'forged[audit](F)'), 1,
    'a name with no grant is exactly what forged[audit] is for');
  // and the grant is what decides, not the name: sensors.rofl says
  // `authority(s1, sensor_net).` in writing, so that writer is not forged.
  const s3 = world();
  assert.equal(s3.assert('reading[s1](t3, 30).', { who: 'sensor_net' }).ok, true);
  assert.equal(n(s3, 'forged[audit](F)'), 0, 'a granted name writes freely');

  // A ledger may still ask for MORE than the kernel enforces — that anything
  // unsigned be reported, even though unsigned is legal. Kept, because it is a
  // different question: the kernel asks WHO MAY, a ledger may ask WHO DID.
  const s4 = world();
  assert.equal(s4.assert('demands_authorship(s1).').ok, true);
  assert.equal(s4.assert('reading[s1](t2, 30).').ok, true);
  assert.ok(n(s4, 'unattributed[audit](F, P)') > 0, 'and there it is reported');
});
