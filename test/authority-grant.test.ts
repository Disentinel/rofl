// test/authority-grant.test.ts — WHAT `forged[audit]` ACTUALLY DISTINGUISHES.
//
// Recorded 2026-09-01 as `f_naming_yourself_is_itself_a_forgery`: a program
// that names its author forges on its own preamble, and "there is no order of
// lines that fixes it". Re-measured 2026-09-08 and the claim is wrong as
// stated -- what was tried was a single NAMED load carrying both the grant and
// the write, which is self-licensing, and self-licensing is the thing this
// audit exists to refuse.
//
// `registerPersp` (src/reflect.ts) grants `authority(book, $kernel)` and
// `authority(book, user)` for every ordinary book on first use, with the
// reasoning written there: an ordinary book is the user's, the way a home
// directory belongs to whoever is logged in, and a caller that NAMES ITSELF is
// claiming to be someone other than the user at the keyboard. So a grant must
// come from a principal that already has standing, and the operator -- loading
// anonymously, signed `user` -- is exactly that principal.
//
// These four cases pin the distinction, and the fifth pins its CEILING.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
const booted = (): Rofl => { const r = new Rofl(); r.load(BOOT); return r; };
const forged = (r: Rofl): number => r.query('forged[audit](F)').rows.length;

test('a grant must come from a principal that already has standing', () => {
  // The default writers of every ordinary book, granted by `registerPersp`.
  const w = booted().query('authority(main, W)').rows.map((x) => x.bindings['W']).sort();
  assert.deepEqual(w, ['$kernel', 'user'], 'the operator writes [main]; a named author does not');

  // A. one NAMED load carrying its own grant -- self-licensing, refused.
  const a = booted();
  assert.equal(a.load('authority(mybook, alice).\np[mybook](x).\n', { who: 'alice' }).ok, true);
  assert.equal(forged(a), 1, 'the grant itself is the forgery: alice has no standing in [main]');

  // B. the operator grants anonymously, THEN alice writes. The intended path.
  const b = booted();
  assert.equal(b.load('authority(mybook, alice).\n').ok, true);          // signed `user`
  assert.equal(b.load('p[mybook](x).\n', { who: 'alice' }).ok, true);
  assert.equal(forged(b), 0, 'naming yourself is possible; granting yourself is not');

  // C. standing is PER BOOK. A named author still cannot write [main].
  const c = booted();
  c.load('authority(mybook, alice).\n');
  c.load('p[mybook](x).\nedb(q).\nq(1).\n', { who: 'alice' });
  assert.equal(forged(c), 2, 'both [main] facts are forged; the mybook one is not');

  // D. the gate bites: a book nobody gave her.
  const d = booted();
  d.load('authority(mybook, alice).\n');
  d.load('p[somebodyelses](x).\n', { who: 'alice' });
  assert.equal(forged(d), 1);
});

// THE CEILING, pinned deliberately rather than left to be discovered. The
// sanctioned path of B and the laundering path here are THE SAME PATH: nothing
// authenticates an anonymous load, so the operator and an attacker are one
// principal, `user`. `forged` therefore separates "wrote a book nobody gave
// you" from "wrote a book SOMEONE gave you", and does not and cannot ask who
// that someone was. That is the same ceiling already recorded for `imports` in
// `f_self_licensing_is_not_gone_it_is_now_a_line_someone_typed`, now measured
// for `authority` too. Authenticating `who` is a host concern; the kernel
// records enough and cannot verify.
test('a grant is a line anyone can type, and the audit cannot see that', () => {
  const r = booted();
  r.load('authority(victimbook, mallory).\n');                 // anonymous, signed `user`
  assert.equal(r.load('p[victimbook](x).\n', { who: 'mallory' }).ok, true);
  assert.equal(forged(r), 0, 'a laundered self-grant is indistinguishable from an honest one');
  const w = r.query('authority(victimbook, W)').rows.map((x) => x.bindings['W']).sort();
  assert.deepEqual(w, ['$kernel', 'mallory', 'user']);
  // and no other audit sees it either -- stated so a reader does not assume
  // one of the siblings covers what this one does not.
  for (const a of ['leak', 'breach', 'malformed', 'unmoded']) {
    assert.equal(r.query(`${a}[audit](X)`).rows.length, 0, `${a} does not see it either`);
  }
});
