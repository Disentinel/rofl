// widened-negation.test.ts — `widened[audit]`, the audit that reports a
// negation whose range grew because a second file wrote into the same book.
//
// The defect it reports (finding
// `f_two_files_writing_one_book_is_scoping_not_naming`): two files loaded into
// one store both write `[main]` and mean different things by it. Nothing is
// corrupted — Datalog accumulates, so two files asserting into one relation is
// a union and that is usually what was wanted. What changes silently is a
// NEGATION: file A's `not p(X)` now ranges over file B's `p` facts. The damage
// is a property of the whole program and is invisible in either file alone,
// which is why this is an audit row and not a refusal.
//
// Three questions are asked here and they are different questions:
//
//   1. LIVENESS — does it ever say yes, on a program that really has the
//      defect, with the damage visible beside the row?
//   2. COVERAGE — which of its conjuncts are load-bearing? Each is deleted
//      from boot.rofl's own text, the deletion is asserted to have LANDED, and
//      the verdict is compared. A mutant that does not mutate proves nothing.
//   3. WHERE IT CANNOT LOOK — the holes, measured and written down as tests
//      that pin the CURRENT answer, so that closing one of them goes red here
//      rather than passing unnoticed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { widenedWorld } from '../examples/aka/demo.ts';
import { mutant } from './helpers/mutant.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// `forged`/`unattributed`/`widened` moved to rules/self-audit.rofl, which a
// world loads when its writers are not all its own. This one plants forgeries,
// so it says so here rather than inheriting the audit from the kernel.
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8')
  + '\n' + fs.readFileSync(path.join(ROOT, 'rules/self-audit.rofl'), 'utf8');

/** The three clauses under test, quoted from boot.rofl. Asserted to be present
 *  before any mutant is built, so a reformatting of the file fails HERE rather
 *  than silently turning every mutant below into a no-op. */
const NEG_CLAUSE = 'negated_under(Rel, P) :- premise_lit(R, _, $not($lit(Rel, P, _, _))).';
const LOADER_CLAUSE = 'loader(Rel, P, Who)   :- asserted_by($fact(Rel, P, _), Who, _), Who != $kernel.';
const AUDIT_CLAUSE = `widened[audit](Rel, P) :- negated_under(Rel, P),
                          loader(Rel, P, W1), loader(Rel, P, W2), W1 != W2.`;

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  assert.equal(res.ok, true, `${what}: ${res.diagnostics.join('; ')}`);
}

/** A store on the real boot.rofl, or on a mutated copy of it. */
function store(boot = BOOT): Rofl {
  const r = new Rofl();
  must(r.load(boot), 'boot.rofl');
  return r;
}

function widened(r: Rofl): string[] {
  return r.query('widened[audit](Rel, P)').rows
    .map((x) => `${x.bindings['Rel']}[${x.bindings['P']}]`).sort();
}

/** The canonical two-file program: alice negates `bad` in [main] and writes one
 *  `bad`; bob writes another. `both = false` gives the SAME facts and the same
 *  rule under one author. */
function twoFiles(opts: { both?: boolean; who2?: string; boot?: string } = {}): Rofl {
  const r = store(opts.boot);
  must(r.load('authority(main, alice). authority(main, bob).'), 'grants');
  must(r.load('p(a). q(X) :- p(X), not bad(X). bad(z).', { who: 'alice' }), 'file A');
  must(r.load('bad(a).', { who: opts.both === false ? 'alice' : (opts.who2 ?? 'bob') }), 'file B');
  return r;
}

// ---------------------------------------------------------------------------
// 1. liveness

test('two files, one book, one negation: the audit says so and the damage is real', () => {
  const one = widenedWorld(false);
  const two = widenedWorld(true);

  // THE DAMAGE FIRST, so that the row is a report about something rather than
  // a report about itself. Integration suppressed b4 and reads its own list
  // back with `not suppressed[recon](B)`; finance suppresses b1 into the same
  // book; b1 leaves `in_play` and no file said it would.
  const inPlay = (r: Rofl) => r.query('in_play[recon](B)').rows.map((x) => x.bindings['B']).sort();
  assert.deepEqual(inPlay(one), ['b1', 'b2', 'b3', 'b5', 'b6', 'b7', 'b8', 'b9']);
  assert.deepEqual(inPlay(two), ['b2', 'b3', 'b5', 'b6', 'b7', 'b8', 'b9']);

  assert.deepEqual(widened(two), ['suppressed[recon]']);
  assert.deepEqual(widened(one), [], 'one author, same facts, same rule: no row');

  // NOT A FORGERY AND NOT A LEAK. Both authors were granted [recon] in
  // writing, and no rule crosses a ledger — so the two audits that already
  // exist have nothing to say, which is why this one had to.
  assert.equal(two.query('forged[audit](F)').rows.length, 0);
  assert.equal(two.query('leak[audit](A, B)').rows.length, 0);

  // The row is askable, which is what separates an audit from a warning.
  const why = two.why('widened[audit](suppressed, recon)').text;
  for (const frag of ['negated_under', 'loader', 'finance_ops', 'integration_team']) {
    assert.ok(why.includes(frag), `why tree is missing ${frag}:\n${why}`);
  }
});

test('the audit is silent on a bare boot.rofl and on every other required-empty query', () => {
  const r = store();
  for (const q of ['malformed[audit](R)', 'breach[audit](R)', 'leak[audit](A, B)',
    'forged[audit](F)', 'unmoded[audit](R)', 'undefined_premise[audit](R, Rel)',
    'unattributed[audit](F, P)', 'widened[audit](Rel, P)']) {
    assert.equal(r.query(q).rows.length, 0, `${q} on a bare boot.rofl`);
  }
  // LIVENESS OF THE INPUTS, not of the audit: boot.rofl negates ten relations
  // and asserts its own declarations, so both premises of the audit have rows
  // to range over and the 0 above is a verdict rather than an empty table.
  assert.ok(r.query('negated_under(Rel, P)').rows.length > 0, 'negated_under is empty');
  assert.ok(r.query('loader(Rel, P, W)').rows.length === 0,
    'a bare boot.rofl has no non-kernel loader, which is why the audit is 0 twice over');
});

// ---------------------------------------------------------------------------
// 2. coverage: every conjunct deleted, and every deletion checked to have landed

/** Replace one clause of boot.rofl and assert the replacement really happened.
 *  A mutant that fails to parse, or that silently does not apply, prints
 *  SURVIVED and means nothing. */
function mutate(from: string, to: string): string {
  assert.ok(BOOT.includes(from), `mutant target not found in boot.rofl:\n${from}`);
  const out = BOOT.replace(from, to);
  assert.notEqual(out, BOOT, 'mutation did not change the text');
  return out;
}

mutant('mutant: the book is dropped from the negation — a cross-book pair goes red', () => {
  // TARGETS: the perspective in `negated_under`. `safety.rofl` already derives
  // `neg_relation(A)` = negated ANYWHERE, book-blind; if that were enough this
  // clause would not need `premise_lit`.
  const program = (r: Rofl) => {
    must(r.load('authority(red, alice). authority(red, bob). authority(blue, alice). authority(blue, bob).'), 'grants');
    // `p` is negated in [red] and co-written in [blue]. Two unrelated facts.
    must(r.load('seen[red](X) :- tag[red](X), not p[red](X). tag[red](t). p[blue](u).', { who: 'alice' }), 'A');
    must(r.load('p[blue](v).', { who: 'bob' }), 'B');
    return r;
  };
  assert.deepEqual(widened(program(store())), [], 'honest rule: [red] and [blue] are different books');

  const mutant = mutate(NEG_CLAUSE,
    'negated_under(Rel, P) :- premise_lit(R, _, $not($lit(Rel, _, _, _))), loader(Rel, P, _).');
  const bad = program(store(mutant));
  assert.ok(widened(bad).length > 0, 'MUTANT DID NOT MUTATE: book-blind rule found nothing');
  assert.deepEqual(widened(bad), ['p[blue]']);
});

mutant('mutant: the ring is not subtracted — every honest program goes red', () => {
  // TARGETS: `Who != $kernel` in `loader`. boot.rofl writes `edb`, `imports`
  // and `authority` rows as `$kernel`; a program writing one more is the
  // co-written declaration table src/reflect.ts documents, not two files.
  const program = (r: Rofl) => {
    must(r.load('edb(sensor). seen(X) :- sensor(X).', { who: 'alice' }), 'A');
    return r;
  };
  assert.deepEqual(widened(program(store())), [], 'honest rule: the ring is not one of the files');

  const mutant = mutate(LOADER_CLAUSE, 'loader(Rel, P, Who)   :- asserted_by($fact(Rel, P, _), Who, _).');
  const bad = program(store(mutant));
  assert.ok(widened(bad).length > 0, 'MUTANT DID NOT MUTATE: no kernel-plus-program pair found');
  assert.deepEqual(widened(bad), ['edb[main]'],
    'one program declaring one input is enough to redden the unsubtracted rule');
});

mutant('mutant: two writers become one — the audit fires on a singly-written relation', () => {
  // TARGETS: `W1 != W2` in the audit clause. Without it, any negated relation
  // with a single named writer is a row.
  const honest = twoFiles({ both: false });
  assert.deepEqual(widened(honest), [], 'one author over two loads is one writer');

  const mutant = mutate(AUDIT_CLAUSE,
    `widened[audit](Rel, P) :- negated_under(Rel, P),
                          loader(Rel, P, W1), loader(Rel, P, W2).`);
  const bad = twoFiles({ both: false, boot: mutant });
  assert.deepEqual(widened(bad), ['authority[main]', 'bad[main]'], 'MUTANT DID NOT MUTATE');
});

mutant('mutant: the negation requirement is dropped — an honest union goes red', () => {
  // TARGETS: `negated_under` in the audit clause. Two files writing one
  // relation is a UNION and usually what was wanted; only a negation over it
  // is damage. Without this conjunct the audit reports the union.
  const program = (r: Rofl) => {
    must(r.load('authority(main, alice). authority(main, bob).'), 'grants');
    must(r.load('note(a). listed(X) :- note(X).', { who: 'alice' }), 'A');
    must(r.load('note(b).', { who: 'bob' }), 'B');
    return r;
  };
  assert.deepEqual(widened(program(store())), [], 'a co-written relation nobody negates is not damage');

  const mutant = mutate(AUDIT_CLAUSE,
    `widened[audit](Rel, P) :- loader(Rel, P, W1), loader(Rel, P, W2), W1 != W2.`);
  const bad = program(store(mutant));
  assert.deepEqual(widened(bad), ['note[main]'], 'MUTANT DID NOT MUTATE');
});

// ---------------------------------------------------------------------------
// 3. the subtraction is not an off switch, and is not keyed on the relation

test('a program cannot join the ring to hide its second writer', () => {
  // `Who != $kernel` would be an off switch if a caller could spell `$kernel`.
  // It cannot: src/api.ts refuses any caller-supplied `$` principal, and the
  // ring can be claimed only by the first clause of the first load.
  const r = twoFiles();
  assert.deepEqual(widened(r), ['bad[main]']);

  const evader = store();
  must(evader.load('authority(main, alice).'), 'grants');
  must(evader.load('p(a). q(X) :- p(X), not bad(X). bad(z).', { who: 'alice' }), 'file A');
  const refused = evader.load('bad(a).', { who: '$kernel' });
  assert.equal(refused.ok, false, 'a caller spelled $kernel and was not refused');
  assert.ok(refused.diagnostics.join(' ').includes('$'), refused.diagnostics.join(' '));
});

test('the ring is subtracted from the writer SET, not exempted per relation', () => {
  // Kernel + one program = one file. Kernel + two programs = two files, and
  // the same relation is then reported. An exemption keyed on `edb` would have
  // gone quiet on the second case, which is why it is not written that way.
  const one = store();
  must(one.load('authority(main, alice). authority(main, bob).'), 'grants');
  must(one.load('edb(sensor).', { who: 'alice' }), 'A');
  assert.deepEqual(widened(one), [], 'kernel + one program is one writer');

  const two = store();
  must(two.load('authority(main, alice). authority(main, bob).'), 'grants');
  must(two.load('edb(sensor).', { who: 'alice' }), 'A');
  must(two.load('edb(other).', { who: 'bob' }), 'B');
  assert.deepEqual(widened(two), ['edb[main]'],
    'two named programs declaring inputs share boot.rofl `not edb(Rel)` and are told so');
});

// ---------------------------------------------------------------------------
// 4. where the audit is structurally unable to look
//
// Both of these are RECORDED HOLES, not bugs found here. They are pinned so
// that closing either one goes red in this file instead of passing unnoticed.

test('HOLE: two anonymous loads are one writer, by the kernel\'s own definition', () => {
  // `src/reflect.ts` defines `user` as "whoever loaded a file and did not say
  // who they are", and there is no load identity anywhere in the store — the
  // load counter reaches no fact. So the audit is exactly as sharp as the
  // host's discipline about `who`, and no sharper. Measured over 19 example
  // worlds on 2026-09-07: 32 (relation, book) pairs take asserted facts from
  // more than one LOAD, and 22 of those name one principal across all of them.
  const r = store();
  must(r.load('p(a). q(X) :- p(X), not bad(X). bad(z).'), 'file A, unsigned');
  must(r.load('bad(a).'), 'file B, unsigned');
  assert.deepEqual(widened(r), [], 'if this ever goes red the trail grew a load identity');
  // The union really happened; only its authorship is invisible.
  assert.equal(r.query('bad(a)').rows.length, 1);
  assert.equal(r.query('q(a)').rows.length, 0, 'the widening is real and unreported');
});

test('HOLE: a relation two files DERIVE into carries no assertion trail', () => {
  // `asserted_by` is emitted for asserted base facts only, so a co-written
  // relation that both files reach through a rule is outside the audit. Same
  // boundary from the other side: a negation over a relation DERIVED from a
  // co-written one names the derived relation, and the writers are the base
  // relation's.
  const r = store();
  must(r.load('authority(main, alice). authority(main, bob).'), 'grants');
  must(r.load('src_a(z). bad(X) :- src_a(X). p(a). q(X) :- p(X), not bad(X).', { who: 'alice' }), 'A');
  must(r.load('src_b(a). bad(X) :- src_b(X).', { who: 'bob' }), 'B');
  assert.equal(r.query('q(a)').rows.length, 0, 'the widening is real');
  assert.deepEqual(widened(r), [], 'and unreported: `bad` is derived, so it has no writers');
  // The positive control that this world is otherwise the same shape: assert
  // the same two facts directly and the audit does see it.
  const direct = twoFiles();
  assert.deepEqual(widened(direct), ['bad[main]']);
});
