// second-door.test.ts — the path into the kernel that does NOT go through text.
//
// Rules here ARE facts, so there are two doors into the rule set: the parser
// (src/api.ts:190 rejects a clause whose head names a kernel relation) and the
// reflection store itself (src/engine.ts:113 refuses to execute a DECODED rule
// whose head names one). The ablation matrix measured the second gate firing
// on none of 32 programs — not because it is dead, but because the first gate
// always answered first, and no program could reach past it: assembling a rule
// out of reflection facts needs `premise_lit`/`conclusion_lit`, whose payload
// is a `$lit(...)` term, and `$` was unwritable in surface syntax.
//
// `$` is writable now (leading position, src/parser.ts), so the forgery can be
// assembled ENTIRELY as data, and the second gate can be measured for the
// first time. The two faces of a rule are independent:
//
//   `concludes(R, Rel)`         — what the AUDIT reads. boot.rofl's
//                                 `breach[audit]` is defined over it.
//   `conclusion_lit(R, 1, $lit(Rel, ...))` — what the ENGINE executes.
//                                 `decodeRules` builds the head from this and
//                                 never looks at `concludes`.
//
// A forger who rewrites only the second face is invisible to `breach[audit]`
// and is stopped by src/engine.ts:113 alone. That is what this file pins.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { parseProgram } from '../src/parser.ts';
import { encodeRule } from '../src/reflect.ts';
import { canonTerm } from '../src/unify.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

/** A legitimate two-place rule, and its reflection rendered as SURFACE TEXT.
 *  Two places so the forged head matches `authority/2`: a rule that writes the
 *  kernel's own authority table is the thing the gate is there to stop. */
const LEGIT = 'winner(X, Y) :- move(X), move(Y).';

function reflectionLines(src: string): { id: string; lines: string[] } {
  const [c] = parseProgram(src);
  const enc = encodeRule(c);
  return { id: enc.id, lines: enc.facts.map((f) => `${f.rel}(${f.args.map(canonTerm).join(', ')}).`) };
}

const HEAD_FACE = (rel: string) => (l: string) =>
  l.startsWith('conclusion_lit(') ? l.replace('$lit(winner,', `$lit(${rel},`) : l;
const AUDIT_FACE = (rel: string) => (l: string) =>
  l.startsWith('concludes(') ? l.replace(', winner)', `, ${rel})`) : l;

function load(mut: (l: string) => string, who?: string) {
  const { id, lines } = reflectionLines(LEGIT);
  const r = new Rofl();
  const b = r.load(BOOT);
  assert.ok(b.ok, 'boot.rofl must load: ' + JSON.stringify(b.diagnostics));
  const res = r.load(lines.map(mut).join('\n') + '\nmove(a).', who ? { who } : {});
  return { r, id, res, ev: res.ok ? new Evaluation(r.store) : null };
}

const rows = (r: Rofl, q: string) => r.query(q).rows.map((x) => x.text);

test('CONTROL: a rule assembled entirely from reflection text is live', () => {
  // Without this control every "the forgery did nothing" below would be a fact
  // about a forgery that never assembled, not about the gate.
  const { r, res, ev } = load((l) => l);
  assert.ok(res.ok, 'reflection text must reload: ' + JSON.stringify(res.diagnostics));
  assert.deepEqual(ev!.diags, [], 'a faithful reflection is executable');
  r.evaluate();
  assert.deepEqual(rows(r, 'winner(X, Y)'), ['X = a, Y = a'],
    'the rebuilt rule must actually fire — otherwise nothing here is measured');
});

test('CONTROL: the same forgery aimed at a NON-kernel head executes', () => {
  // Same pipeline, same mutation site, benign target: proves the head field of
  // `conclusion_lit` is what the engine obeys, and that rewriting it works.
  const { r, res, ev } = load(HEAD_FACE('champion'));
  assert.ok(res.ok, JSON.stringify(res.diagnostics));
  assert.deepEqual(ev!.diags, []);
  r.evaluate();
  assert.deepEqual(rows(r, 'champion(X, Y)'), ['X = a, Y = a'],
    'rewriting the reified head redirects the rule');
  assert.deepEqual(rows(r, 'winner(X, Y)'), [], 'and it no longer writes the old relation');
});

test('the second door: a forged head into a kernel relation is refused by the engine', () => {
  // Only the ENGINE face is rewritten. `concludes` still says `winner`.
  const { r, id, res, ev } = load(HEAD_FACE('authority'));
  assert.ok(res.ok, 'the forgery is admissible AS DATA: ' + JSON.stringify(res.diagnostics));

  // src/engine.ts:113 — this is the assertion that goes red without the guard.
  assert.deepEqual(ev!.diags, [`rule ${id} concludes into a kernel relation; not executable`],
    'the decoded rule must be refused, by name');
  assert.equal(ev!.rules.filter((x) => x.id === id).length, 0,
    'and must not appear among the executable rules');

  r.evaluate();
  // The consequence the guard exists to prevent: the kernel's authority table
  // holds exactly what bootstrapKernel put there, and nothing the forgery said.
  // THE LIST GAINED ONE ROW, and it is not a re-baseline. The kernel's own
  // book `[$kernel]` is registered by `bootstrapKernel`, and it is registered
  // BY HAND rather than through `registerPersp` precisely so that it gets ONE
  // writer where every other ledger gets two: `user` is withheld. That single
  // asymmetry is what makes a forgery in the kernel's book a
  // `forged[audit]` row instead of an accepted fact — see the test below.
  assert.deepEqual(rows(r, 'authority(P, W)').sort(),
    ['P = $kernel, W = $kernel',
     // [audit] is used only inside boot.rofl, so it is registered under the
     // kernel's own load and `user` never appears in it. [main] is used by
     // both, so it has both writers. The asymmetry is the model working:
     // a book belongs to whoever writes in it, and nobody else.
     'P = audit, W = $kernel',
    'P = audit, W = user',
     'P = main, W = $kernel', 'P = main, W = user'],
    'no forged authority row may exist');
  // MUTANT — the asymmetry is the whole of it, so it is asserted separately
  // rather than left implicit in the list above. Grant `$anon` the kernel's
  // book (drop the `$` branch in `registerPersp`) and this line goes red while
  // the list above still passes, because the list is sorted and would simply
  // gain a sixth row nobody was reading for.
  assert.deepEqual(rows(r, 'authority($kernel, W)'), ['W = $kernel'],
    'ONE writer for the kernel book, and it is the one no caller can spell');
  assert.deepEqual(rows(r, 'authority(a, a)'), [],
    'specifically: the rule must not have granted authority to its own datum');

  // ...and the text-path audit cannot see this at all. `breach[audit]` reads
  // `concludes`, which the forger left honest.
  assert.deepEqual(rows(r, 'breach[audit](R)'), [],
    'breach[audit] is blind here BY CONSTRUCTION — engine.ts:113 is the only net');
});

test('the first door: rewriting only the audit face is caught by breach[audit], not by the engine', () => {
  // The mirror image. `concludes` lies, the executable head is honest, so the
  // rule runs (harmlessly) and the audit is the thing that speaks.
  const { r, id, res, ev } = load(AUDIT_FACE('authority'));
  assert.ok(res.ok);
  assert.deepEqual(ev!.diags, [], 'the engine sees an ordinary rule');
  r.evaluate();
  assert.deepEqual(rows(r, 'breach[audit](R)'), [`R = ${id}`]);
  assert.deepEqual(rows(r, 'winner(X, Y)'), ['X = a, Y = a']);
});

test('authorship is the net that does not care which face was forged', () => {
  const { r, res } = load(HEAD_FACE('authority'), 'mallory');
  assert.ok(res.ok);
  r.evaluate();
  const forged = rows(r, 'forged[audit](F)');
  assert.ok(forged.length >= 10, `every forged fact is named, got ${forged.length}`);
  assert.ok(forged.some((f) => f.includes('$lit(authority,')),
    'including the one carrying the forged head');

  // ANONYMITY USED TO BE FREE HERE, AND IS NOT ANY MORE. This block asserted
  // the opposite of what it asserts now, and the change is a fact about the
  // language rather than a number that drifted.
  //
  // WHAT IT SAID. `forged[audit]` was empty for an unsigned forger, so the
  // sentence written here was that authorship catches a NAMED forgery and
  // engine.ts:113 is all there is against an unsigned one. That was true, and
  // it was the cheaper attack: reflection lived in `[main]`, where
  // `registerPersp` grants `$anon` standing, so an unsigned row in the audit's
  // own input table was indistinguishable from the kernel's.
  //
  // WHY IT CHANGED. Reflection moved into `[$kernel]`, whose writer list is
  // `$kernel` and nobody else — `$anon` included. The forgery is still
  // ADMISSIBLE AS DATA, which is the property this whole file exists to pin;
  // what it is no longer is INVISIBLE. Measured on a bare boot.rofl, the pair
  // that used to read 2 / 0 now reads 2 / 2:
  //
  //   reads_from(r_fake, secret). writes_to(r_fake, public).
  //       signed mallory -> forged[audit] 2      (before AND after)
  //       unsigned       -> forged[audit] 0 -> 2 (this line)
  const anon = load(HEAD_FACE('authority'));
  anon.r.evaluate();
  const anonForged = rows(anon.r, 'forged[audit](F)');
  assert.ok(anonForged.length >= 10,
    `an unsigned forger is named too, got ${anonForged.length}`);
  assert.ok(anonForged.some((f) => f.includes('$lit(authority,')),
    'including the row carrying the forged head');
  // MUTANT — this must be about the LEDGER and not about `$anon` losing its
  // standing everywhere. An ordinary unsigned fact in an ordinary ledger is
  // still perfectly honest, or the gate is red on the first load of every
  // program in this repository and gets switched off within the week.
  const ordinary = new Rofl();
  assert.ok(ordinary.load(BOOT).ok, 'boot.rofl must load');
  assert.ok(ordinary.assert('authority(red, informer).\nsaid[red](a).').ok,
    'an unsigned honest program must load');
  ordinary.evaluate();
  assert.deepEqual(rows(ordinary, 'forged[audit](F)'), [],
    'anonymity is still free everywhere a program is allowed to write');

  // AND IMPERSONATION IS CLOSED AT THE DOOR, one layer earlier than this net.
  // `src/api.ts` refuses a caller-supplied `who` beginning with `$`, so the
  // forger below cannot be admitted at all — where it used to be admitted and
  // then silenced by `authority(main, $kernel)`.
  const imp = load(HEAD_FACE('authority'), '$kernel');
  assert.equal(imp.res.ok, false, 'claiming the kernel principal is refused');
  assert.match(imp.res.diagnostics.join('\n'), /'\$' marks a kernel principal/);
});

test('the known hole: `stratum` is outside the protected set, and breach stays empty', () => {
  // boot.rofl COMPUTES `stratum`, so it cannot be reserved; `breach[audit]`
  // therefore cannot see a rule that concludes into it, and neither can
  // engine.ts:113. Authorship is the only net left.
  const r = new Rofl();
  r.load(BOOT);
  r.load('winner(X, Y) :- move(X), move(Y).\nmove(a).');
  const res = r.assert('concludes(r_evil, stratum).', { who: 'mallory' });
  assert.ok(res.ok);
  r.evaluate();
  assert.deepEqual(rows(r, 'breach[audit](R)'), [],
    'stratum is not reserved, so breach cannot fire');
  // The row names `[$kernel]` and not `[main]`, because a bare `concludes(...)`
  // resolves to the book that relation lives in — there is exactly one
  // `concludes` and the kernel writes it, so the ledger was never the default
  // rule's to decide. The HOLE is unchanged and is still the point of this
  // test: `stratum` is computed by boot.rofl, so it cannot be reserved,
  // `breach[audit]` cannot see a rule concluding into it, and authorship is
  // the only net left.
  assert.deepEqual(rows(r, 'forged[audit](F)'),
    ['F = $fact(concludes,$kernel,$cons(r_evil,$cons(stratum,$nil)))'],
    'authorship catches it, and only authorship');
  // MUTANT — the net must be the LEDGER's authority and not the name `mallory`.
  // Unsigned, the same forgery is caught by the same rule, which is the thing
  // that was NOT true before reflection had a book of its own.
  const unsigned = new Rofl();
  assert.ok(unsigned.load(BOOT).ok, 'boot.rofl must load');
  assert.ok(unsigned.load('winner(X, Y) :- move(X), move(Y).\nmove(a).').ok, 'a program must load');
  assert.ok(unsigned.assert('concludes(r_evil, stratum).').ok, 'admissible as data');
  unsigned.evaluate();
  assert.deepEqual(rows(unsigned, 'forged[audit](F)'),
    ['F = $fact(concludes,$kernel,$cons(r_evil,$cons(stratum,$nil)))'],
    'and unsigned it is caught by exactly the same row');
});
