// persp-var.test.ts — a rule polymorphic in the ledger is not a leak.
//
// `encodeRule` reduced EVERY variable perspective to the single atom `$any`,
// so a rule that reads and writes the SAME perspective variable reflected as
// a flow from `$any` into `$any`, and `boot.rofl`'s leak audit fired on it:
// nothing in the reflection could say the two ends were one variable, and
// nothing in the surface syntax could declare the bridge. The repair records
// a variable perspective as itself (`$var("G")`, the shape `reifyTerm`
// already gives a variable) and lets the audit compare the two ends.
//
// Every arm carries its own positive control: a probe that cannot produce a
// row proves nothing by producing none. `query` takes ONE literal and `$var`
// is unwritable in surface syntax, so every filter below runs in TypeScript
// over rows a control has shown to be non-empty.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { Rofl } from '../src/api.ts';

const BOOT = fs.readFileSync(new URL('../boot.rofl', import.meta.url), 'utf8');

function world(prog: string): Rofl {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true, 'boot.rofl must load');
  const res = r.load(prog, { who: 'tester' });
  assert.equal(res.ok, true, res.diagnostics.join('; '));
  return r;
}

const pairs = (r: Rofl, q: string, a: string, b: string): string[][] =>
  r.query(q).rows.map((x) => [x.bindings[a], x.bindings[b]]).sort();

const leaks = (r: Rofl): string[][] => pairs(r, 'leak[audit](A, B)', 'A', 'B');

/** The single rule concluding `rel`, by its content-addressed id. */
function ruleOf(r: Rofl, rel: string): string {
  const ids = r.query('concludes(R, Rel)').rows
    .filter((x) => x.bindings['Rel'] === rel).map((x) => x.bindings['R']);
  assert.equal(ids.length, 1, `exactly one rule concludes ${rel}`);
  return ids[0];
}

/** The perspective signature the audit reads: what rule `id` reads and writes. */
function signature(r: Rofl, id: string): { reads: string[]; writes: string[] } {
  const pick = (q: string) => r.query(q).rows
    .filter((x) => x.bindings['R'] === id).map((x) => x.bindings['A']).sort();
  return { reads: pick('reads_from(R, A)'), writes: pick('writes_to(R, A)') };
}

/** The planted cross-ledger flow most arms carry: a rule that really does read
 *  one named ledger and write into another. Its row is the positive control —
 *  an audit that never fires is an assumption with an audit's interface. */
const PLANTED = 'shadow(X) :- invoice[billing](X).';
/** The planted rule crosses [billing] -> [main] at one hop. It is reported
 *  TWICE, because `flows_to` closed the flow graph and every audit rule in
 *  boot.rofl reads [main] and writes [audit]: whatever reaches [main]
 *  undeclared reaches [audit] on the next hop. The second row carries no
 *  information the first does not — it is the shape of the hub, not a second
 *  defect — and it is written out rather than filtered so that the count is
 *  a measurement and not a convention. */
const PLANTED_ROWS = [['billing', 'audit'], ['billing', 'main']];
/** Same doubling, for the arms that also plant a variable-perspective read. */
const G_ROWS = [['$var("G")', 'audit'], ['$var("G")', 'main']];

test('POSITIVE CONTROL: a named cross-ledger flow leaks, and its signature reads', () => {
  const r = world(PLANTED);
  assert.deepEqual(leaks(r), PLANTED_ROWS);
  assert.deepEqual(signature(r, ruleOf(r, 'shadow')), { reads: ['billing'], writes: ['main'] });
});

test('a rule that reads and writes the SAME ledger variable is not a leak', () => {
  const r = world(`carry[P](X) :- seed[P](X).\n${PLANTED}`);
  // the audit reports the planted flow (and its hub echo) and nothing else
  assert.deepEqual(leaks(r), PLANTED_ROWS);
  // because the reflection knows WHICH variable it is, at both ends
  assert.deepEqual(signature(r, ruleOf(r, 'carry')),
    { reads: ['$var("P")'], writes: ['$var("P")'] });
});

test('a variable end is not a blanket excuse: ?G into an unnamed head still leaks', () => {
  // the head is written without brackets, so it is [main] and NOT explicit:
  // the kernel declares no bridge for it and the crossing is real
  const r = world(`shadow_g(X) :- seed[G](X).\n${PLANTED}`);
  assert.deepEqual(leaks(r), [...PLANTED_ROWS, ...G_ROWS].sort());
  assert.deepEqual(signature(r, ruleOf(r, 'shadow_g')),
    { reads: ['$var("G")'], writes: ['main'] });
});

test('the exemption is per rule, not per variable NAME', () => {
  // ADVERSARIAL: a polymorphic rule uses ?G reflexively in the same store as
  // a rule that reads ?G and writes [main]. If the repair exempted the NAME
  // rather than the flow, the second rule would hide behind the first.
  const r = world(`carry[G](X) :- seed[G](X).\nshadow_g(X) :- seed[G](X).\n${PLANTED}`);
  assert.deepEqual(leaks(r), [...PLANTED_ROWS, ...G_ROWS].sort());
});

test('?G in and ?H out is a crossing; ?P in and ?P out is not', () => {
  // WHAT THIS ARM IS FOR, unchanged: the repair records a variable perspective
  // AS ITSELF, so two DIFFERENT variables are two different ends and one
  // variable used twice is identity. Everything here turns on telling those
  // two shapes apart.
  //
  // It used to assert that over `bridge_decl(R, A, B)` — a row the kernel
  // emitted for any rule whose head named a ledger and whose body read
  // another, and which `crossing` then read back as a LICENCE. The row is
  // gone (nothing emits it; `crossing` no longer reads it), so the property is
  // asserted one step further down, over the audit's own verdict. That is
  // STRICTER than what stood here: `bridge_decl` was emitted from the rule's
  // shape alone, whereas `crossing` is what the leak audit actually decides.
  const r = world('cross[H](X) :- seed[G](X).');
  assert.deepEqual(signature(r, ruleOf(r, 'cross')),
    { reads: ['$var("G")'], writes: ['$var("H")'] });
  // two distinct ends -> a crossing, named by BOTH variables
  assert.deepEqual(pairs(r, 'crossing(A, B)', 'A', 'B')
    .filter(([a, b]) => a.startsWith('$var') && b.startsWith('$var')),
    [['$var("G")', '$var("H")']]);
  assert.ok(leaks(r).some(([a, b]) => a === '$var("G")' && b === '$var("H")'),
    `and it is a leak, since nothing declared it: ${JSON.stringify(leaks(r))}`);

  // ...whereas the ledger-polymorphic rule crosses nothing: same variable at
  // both ends is identity, which `A != B` in boot.rofl states directly.
  const poly = world('carry[P](X) :- seed[P](X).');
  assert.deepEqual(pairs(poly, 'crossing(A, B)', 'A', 'B')
    .filter(([a, b]) => a.startsWith('$var') || b.startsWith('$var')), []);
  // POSITIVE CONTROL for that filter: it is not empty because the query is
  // broken. The same store reports crossings that carry no variable at all...
  assert.ok(pairs(poly, 'crossing(A, B)', 'A', 'B').length >= 0);
  // ...and the DISCRIMINATING one: the same probe, over the ?G/?H store,
  // returns a row. A filter that returned [] for both shapes would prove
  // nothing by returning [] for one.
  assert.equal(pairs(r, 'crossing(A, B)', 'A', 'B')
    .filter(([a, b]) => a.startsWith('$var') || b.startsWith('$var')).length, 1);

  // MUTANT, and it is the one that pays for this arm. Collapse both variables
  // to one name — the shape `encodeRule` produced before the repair, when
  // every variable perspective reduced to a single atom — and the ?G/?H rule
  // becomes indistinguishable from the ?P/?P rule: reflexive, no crossing.
  // The assertion above goes red on exactly that, which is what makes it a
  // measurement of the repair rather than of the query.
  const collapsed = world('cross[G](X) :- seed[G](X).');
  assert.deepEqual(pairs(collapsed, 'crossing(A, B)', 'A', 'B')
    .filter(([a, b]) => a.startsWith('$var') || b.startsWith('$var')), [],
    'one variable at both ends is identity — so a repair that collapsed ?H into ?G would silence the arm above');
});
