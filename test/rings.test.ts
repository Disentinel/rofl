// rings.test.ts — the kernel's book is a ledger, and `[main]` stopped being
// three things at once.
//
// WHAT `[main]` WAS. Three jobs shared one name: the kernel's reflection ON a
// program (`rule`, `concludes`, `reads_from`, `asserted_by` — the structure of
// the rules and the trail of the assertions); the program's own content; and
// the ledger a literal falls into when nobody typed a bracket. `/proc` and
// every file whose owner had been forgotten, in one directory.
//
// THE DEFECT THAT PAID FOR THE SPLIT, measured against a bare boot.rofl before
// it. `concludes`, `rule`, `reads_from` and `writes_to` are RESERVED, which
// refuses a RULE head and says nothing about a FACT — so a program could
// assert the audit's own inputs:
//
//   reads_from(r_fake, secret). writes_to(r_fake, public).
//       signed mallory  -> flow 2->3, crossing 0->1, leak 0->1, forged 2
//       ANONYMOUS       -> the same three moves, forged[audit] 0
//   rule(r_fake). has_premise(r_fake, 1).
//       ANONYMOUS       -> malformed[audit] 0->1, forged[audit] 0
//
// Anonymity was the cheaper attack, exactly as it was for authorship before
// `$anon` existed. After the split both columns read the same: the fact lands
// in `[$kernel]`, whose writer list is one principal, and `forged[audit]`
// names it. The numbers are asserted below rather than quoted.
//
// WHAT THIS FILE DOES NOT CLAIM. One test here is written the wrong way round
// on purpose — 'THE KNOWN HOLE' — because a ledger-polymorphic rule reaches
// the kernel's book and nothing sees it. It asserts the hole so that closing
// it turns this file red instead of leaving the file silently obsolete.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { KERNEL_PERSP, KERNEL_BOOK, MAIN, V, IFACE } from '../src/reflect.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

function load(...programs: string[]): Rofl {
  const r = new Rofl();
  for (const p of programs) {
    const res = r.load(p);
    assert.equal(res.ok, true, res.diagnostics.join('\n'));
  }
  return r;
}
const rows = (r: Rofl, q: string): string[] => r.query(q).rows.map((x) => x.text).sort();
const leaks = (r: Rofl): string[] =>
  r.query('leak[audit](A, B)').rows
    .map((x) => `${x.bindings['A']} -> ${x.bindings['B']}`).sort();
/** boot.rofl with one line struck out — the mutation instrument. */
const bootWithout = (line: string): string => {
  assert.ok(BOOT.includes(line), `mutation target absent from boot.rofl: ${line}`);
  return BOOT.replace(line, '');
};

// ===========================================================================
// 1. READING THE KERNEL'S BOOK IS A CROSSING, AND A DECLARATION SILENCES IT

test('a NAMED ledger reading the kernel book without a declaration is red', () => {
  // TARGET: "reflection is in a book of its own, and reading someone else's
  // book takes a sentence somebody wrote." Before the split this rule read
  // [main] like everything else and the audit had nothing to say about it.
  const r = load(BOOT, 'mine[myaudit](R) :- concludes(R, _).');
  assert.deepEqual(leaks(r), [`${KERNEL_PERSP} -> myaudit`],
    'the undeclared read of the kernel book is reported, by name');
  // and it really did read the kernel's book: the bare premise resolved there
  assert.ok(r.holds(`reads_from(R, ${KERNEL_PERSP})`),
    'the kernel emitted the crossing it is being audited for');
  assert.ok(rows(r, 'mine[myaudit](R)').length > 0,
    'positive control: the rule fires, so the row is a leak and not an empty relation');
});

test('the same rule WITH the declaration is silent, and the silence is the declaration', () => {
  // TARGET: "the declaration is load-bearing." A gate that says nothing after
  // the fix and nothing before it is not a gate.
  const declared = load(BOOT,
    'imports(myaudit, $kernel).\nmine[myaudit](R) :- concludes(R, _).');
  assert.deepEqual(leaks(declared), [], 'declared: nothing to report');
  assert.equal(rows(declared, 'mine[myaudit](R)').length,
               rows(load(BOOT, 'mine[myaudit](R) :- concludes(R, _).'), 'mine[myaudit](R)').length,
               'the declaration changes what the AUDIT says, never what the program derives');
  assert.ok(declared.holds(`sees(myaudit, ${KERNEL_PERSP})`), 'the sentence is in force');
});

test('MUTANT — boot.rofl\'s own two declarations, each struck separately', () => {
  // TARGET: "the split produced TWO sentences where there was one, and each of
  // them says something different." One line covering both books is a line
  // that says neither, which is what `imports(audit, main)` was doing.
  assert.deepEqual(leaks(load(BOOT)), [], 'control: boot.rofl audits itself clean');

  const noMain = load(bootWithout('imports(audit, main).'));
  assert.deepEqual(leaks(noMain), ['main -> audit'],
    'without it the audits\' read of the DECLARATION tables reports');

  const noDefault = load(bootWithout('imports(main, $kernel).'));
  assert.deepEqual(leaks(noDefault), [`${KERNEL_PERSP} -> main`],
    'the widest one covers `rule_known` and `flow`, derived into [main]');

  // AND THE ONE THAT IS ALREADY REDUNDANT, which is the finding this mutant
  // produced rather than confirmed. `sees` is TRANSITIVE — `sees(P, Q) :-
  // imports(P, X), sees(X, Q)` — so `imports(audit, main)` plus
  // `imports(main, $kernel)` already gives `sees(audit, $kernel)`, and
  // striking the audits' own line changes nothing.
  const noKernel = load(bootWithout('imports(audit, $kernel).'));
  assert.deepEqual(leaks(noKernel), [],
    'REDUNDANT TODAY: the widest line grants it transitively');
  // struck TOGETHER, both reappear — so the pair is load-bearing even though
  // neither half is on its own, and the audits' line is documentation that
  // survives the day `imports(main, $kernel)` is removed.
  const neither = load(bootWithout('imports(audit, $kernel).')
    .replace('imports(main, $kernel).', ''));
  assert.deepEqual(leaks(neither), [`${KERNEL_PERSP} -> audit`, `${KERNEL_PERSP} -> main`],
    'the read of the kernel book is reported at both ends when nothing licenses it');
  // WHAT THAT COSTS, measured rather than described: every ledger in the tree
  // that declares `imports(X, main)` gets the kernel's book with it. Five do
  // (boot [audit], heck [chancery], aka [recon], inquiry [epistemic],
  // js-model [code]). Closing it means moving `rule_known` and `flow` into
  // [audit], which is 21 host-side reads of `flow`, `flows_to`, `crossing`,
  // `collects_from` and `gathered` in test files this change does not own.
  const inherited = load(BOOT, 'authority(reader, r).\nx[reader](R) :- concludes(R, _).');
  assert.deepEqual(leaks(inherited), [`${KERNEL_PERSP} -> reader`],
    'a ledger that does NOT import [main] is still red: the grant is not universal');
});

// ===========================================================================
// 2. WHAT A LITERAL WITHOUT A BRACKET DOES NOW

test('a bare literal: kernel vocabulary resolves to the kernel book, everything else to [main]', () => {
  // TARGET: "the default rule stopped answering a question that was already
  // closed." There is exactly one `concludes` — the kernel writes it — so a
  // bare `concludes` was never under-specified. A bare `datum` was.
  const r = load(BOOT, 'imports(myledger, $kernel).\n'
    + 'datum(a).\n'
    + 'both[myledger](X) :- datum(X), concludes(_, _).');
  const keys = r.factKeys();
  assert.ok(keys.some((k) => k.startsWith('datum[main](')), 'ordinary relation: [main]');
  assert.ok(keys.some((k) => k.startsWith(`concludes[${KERNEL_PERSP}](`)),
    'kernel vocabulary: the kernel book');
  assert.equal(keys.filter((k) => k.startsWith('concludes[main](')).length, 0,
    'and NOTHING of it is left in the default ledger');
  // the resolution is visible where an audit can read it, not only in the store
  assert.deepEqual(rows(r, `reads_from(R, ${KERNEL_PERSP})`).length > 0, true);
});

test('an EXPLICIT wrong bracket is left alone, and that is a hole this file records', () => {
  // TARGET: "resolveBook corrects an ABSENT bracket and never a WRONG one."
  // Silently fixing `concludes[main]` would make the two spellings
  // indistinguishable, which is the defect `bridge_decl` was deleted for. The
  // price is that the wrong bracket reads an empty relation and no audit says
  // so: `edb(concludes)` is written by `bootstrapKernel`, so
  // `undefined_premise[audit]` sees a declared input rather than a typo.
  const r = load(BOOT, 'mine[myledger](R) :- concludes[main](R, _).');
  assert.deepEqual(rows(r, 'mine[myledger](R)'), [], 'the premise reads an empty relation');
  assert.deepEqual(rows(r, 'undefined_premise[audit](R, Rel)'), [],
    'and NO audit names it — recorded as a known hole, not as a passing check');
  // what DOES fire is the ordinary crossing, which names the wrong book. So
  // the mistake is visible, but as `main -> myledger` rather than as a typo.
  assert.deepEqual(leaks(r), [`${KERNEL_PERSP} -> myledger`, 'main -> myledger'],
    'and the kernel book reaches it transitively through [main], which is the '
    + 'price of `imports(main, $kernel)` recorded above');
});

// ===========================================================================
// 3. WRITING THE KERNEL'S BOOK

test('an explicit [$kernel] head is refused at the door, fact and rule alike', () => {
  // TARGET: "`$` marks the kernel in the LEDGER slot exactly as it marks the
  // kernel in the AUTHOR slot." Prefix, not name, so the next kernel ledger is
  // closed the day it is added.
  const r = load(BOOT);
  for (const text of [`foo[${KERNEL_PERSP}](a).`,
                      `foo[${KERNEL_PERSP}](X) :- bar(X).`,
                      'foo[$anything](a).']) {
    const res = r.assert(text);
    assert.equal(res.ok, false, `must be refused: ${text}`);
    assert.match(res.diagnostics[0], /'\$' marks a kernel ledger/, text);
  }
  // POSITIVE CONTROL: the same shapes with an ordinary ledger are admitted.
  assert.equal(r.assert('foo[ordinary](a).').ok, true);
  assert.equal(r.assert('foo[ordinary](X) :- bar(X).').ok, true);
});

test('a claimed kernel AUTHOR is refused, and the kernel book has one writer', () => {
  // TARGET: "the two slots are closed by two independent checks." The author
  // check already existed; what is new is that the grant behind it stopped
  // being handed out. `registerPersp` fires on first USE — including the use
  // in one of boot.rofl's own premises — and without the `$` branch it
  // registered the kernel's book like any other, the default author included,
  // which put the hole straight back.
  const r = load(BOOT);
  assert.equal(r.assert('x(a).', { who: '$kernel' }).ok, false, 'the author cannot be claimed');
  assert.deepEqual(rows(r, `authority(${KERNEL_PERSP}, W)`), ['W = $kernel'],
    'ONE writer for the kernel book, and it is the one no caller can spell');
  // POSITIVE CONTROL: an ordinary ledger still gets both writers, which is what
  // makes a corpus that names nobody loadable at all.
  // The ordinary book has TWO writers and they are the two principals that
  // exist: the kernel, which owns everything the way root does, and `user`,
  // whoever loaded a file and named nobody. `$anon` used to stand here — a
  // principal belonging to no one that nonetheless held authority everywhere,
  // which is what made anonymity the only way to write.
  assert.deepEqual(rows(r, `authority(${MAIN}, W)`), ['W = $kernel', 'W = user']);
});

test('a bare kernel-vocabulary FACT is admitted as data and named by forged[audit]', () => {
  // TARGET: "the kernel RECORDS and a ledger JUDGES." Refusing this at the
  // door would delete a property the kernel documents and tests — that a
  // forged reflection is admissible AS DATA and is stopped downstream
  // (test/second-door.test.ts loads exactly such a program). So it lands in
  // the kernel's book, unsigned by the kernel, and the audit says so.
  //
  // THIS IS THE MEASUREMENT THE SPLIT EXISTS FOR: the anonymous column used to
  // read 0 where the signed column read 2.
  for (const who of [undefined, 'mallory']) {
    const r = load(BOOT);
    const res = r.assert('reads_from(r_fake, secret).\nwrites_to(r_fake, public).',
                         who === undefined ? {} : { who });
    assert.equal(res.ok, true, 'still admissible as data');
    assert.equal(rows(r, 'forged[audit](F)').length, 2,
      `both rows are named whether signed or anonymous (who=${who ?? '$anon'})`);
    // and the forgery still MOVES the audit's inputs — that is why it matters
    assert.ok(r.holds('leak[audit](secret, public)'),
      'the fake rule still fabricates a leak; what changed is that it is signed');
  }
  // POSITIVE CONTROL, both directions: the same world with no forgery has
  // neither row, so the two numbers above are not a constant.
  const clean = load(BOOT);
  assert.deepEqual(rows(clean, 'forged[audit](F)'), []);
  assert.ok(!clean.holds('leak[audit](secret, public)'));
});

test('the ring is closed on BOTH routes a perspective variable can take', () => {
  // THIS TEST WAS WRITTEN THE WRONG WAY ROUND and has been turned over. It
  // used to assert the hole — 22 of the program's facts sitting inside the
  // kernel's book — so that closing it would go red here rather than leave the
  // file passing while claiming a ring it did not have. It went red. This is
  // what replaced it.
  //
  // FOUND BY ASKING WHERE THE CHECKS CANNOT LOOK. Every gate missed it for a
  // different reason and no two overlapped: the door check reads the head
  // perspective AS WRITTEN and saw a variable; `forged[audit]` reads
  // `asserted_by`, which a DERIVED fact never carries; and `crossing` exempts
  // `A != B`, because a rule uniform in the ledger instantiates both ends
  // together — which is precisely what the rule below does. The tell was the
  // inversion: spelling the bracket was refused and leaving it off was not.

  // ROUTE 1 — the variable is bound from the kernel's book itself.
  // src/engine.ts `matchPremise`: a perspective variable does not range over a
  // `$` book, so the premise has nothing to match and nothing is planted.
  const read = load(BOOT, 'shadow[P](R) :- concludes[P](R, _).');
  assert.deepEqual(rows(read, `shadow[${KERNEL_PERSP}](R)`), [],
    'nothing of the program lands in the kernel book');

  // POSITIVE CONTROL, and it is what makes that empty list a measurement. The
  // rows ARE there and ARE reachable — by the honest path, which names the
  // book and declares the import. Without this, the assertion above would pass
  // just as well if `concludes` were empty.
  const named = load(BOOT,
    `imports(mine, ${KERNEL_PERSP}).\nshadow[mine](R) :- concludes[${KERNEL_PERSP}](R, _).`);
  assert.ok(rows(named, 'shadow[mine](R)').length > 15,
    `the same facts, read by naming the book: ${rows(named, 'shadow[mine](R)').length}`);
  assert.deepEqual(leaks(named), [], 'and declared, so the audit is quiet');

  // ROUTE 2 — the atom arrives as ORDINARY DATA, never through a perspective
  // slot, so the read-side exclusion cannot see it. `kind($kernel).` is
  // writable in surface syntax. Refused at `conclude`, where the head's ledger
  // is finally known, and it SAYS SO rather than dropping the row in silence.
  const arg = load(BOOT,
    `kind(${KERNEL_PERSP}).\nshadow[P](R) :- kind(P), concludes(R, _).`);
  assert.deepEqual(rows(arg, `shadow[${KERNEL_PERSP}](R)`), []);
  const ev = new Evaluation(arg.store, { budget: 100_000 });
  ev.run();
  assert.ok(ev.diags.some((d) => /conclusion into kernel ledger \[\$kernel\] refused/.test(d)),
    `the refusal is reported, not silent: ${JSON.stringify(ev.diags)}`);

  // MUTANT — the filter must not have been bought by breaking ledger
  // polymorphism generally. The same shape over two ORDINARY ledgers still
  // computes, both ends, or the two assertions above are measuring a dead
  // feature rather than a closed ring.
  const poly = load(BOOT, 'authority(red, w).\nauthority(blue, w).\n'
    + 'said[red](a).\nsaid[blue](b).\nechoed[P](X) :- said[P](X).');
  assert.deepEqual(rows(poly, 'echoed[red](X)'), ['X = a']);
  assert.deepEqual(rows(poly, 'echoed[blue](X)'), ['X = b']);
});

test('ROUTE 1 IS SILENT, and that is recorded rather than claimed as a feature', () => {
  // The read-side exclusion makes the premise match nothing. No audit fires:
  // `undefined_premise[audit]` cannot, because `bootstrapKernel` writes
  // `edb(concludes)`, so the relation is a DECLARED input rather than a
  // misspelling. An author who meant to read the kernel's book polymorphically
  // gets an empty relation and no sentence about why.
  //
  // Left as it is, and the reason is that the honest path exists and is one
  // token away: name the book. But it IS a silence, and RULE 2 of this house
  // says a silence has to be written down where it is, not discovered later.
  const r = load(BOOT, 'shadow[P](R) :- concludes[P](R, _).');
  assert.deepEqual(rows(r, `shadow[${KERNEL_PERSP}](R)`), []);
  assert.deepEqual(rows(r, 'undefined_premise[audit](R, Rel)'), [],
    'RECORDED HOLE: nothing names the read that can never match');
  assert.deepEqual(leaks(r), [], 'and no crossing either — the walk never happened');
});

test('derived_by and hole are IN the kernel book, and edb deliberately is not', () => {
  // ALSO TURNED OVER. This asserted the residue — provenance and refusal rows
  // left in `[main]`, forgeable anonymously — because src/engine.ts and
  // src/rounds.ts were owned by another change when the split landed. They are
  // in the kernel book now, and this is the measurement that says so.
  const r = load(BOOT);
  assert.ok(r.factKeys().filter((k) => k.startsWith(`derived_by[${KERNEL_PERSP}](`)).length > 20,
    'the provenance trail is the kernel writing about the program');
  assert.deepEqual(r.factKeys().filter((k) => k.startsWith('derived_by[main](')), [],
    'and none of it is left in the default ledger');

  // WHAT THAT BUYS, in the one number that moved: both were accepted anonymously
  // with `forged[audit]` at 0 before, because `$anon` has standing over [main].
  for (const forgery of ['derived_by(x, r_never, 0).', 'hole(x, budget_exhausted).']) {
    const f = load(BOOT);
    assert.equal(f.assert(forgery).ok, true, `${forgery} is still admissible AS DATA`);
    assert.equal(rows(f, 'forged[audit](F)').length, 1, `and named: ${forgery}`);
  }

  // MUTANT / THE LINE ITSELF: `edb` did NOT follow them out of src/engine.ts,
  // and that is a decision rather than a leftover. `edb(unknown)` is written by
  // the kernel and 233 `edb(...)` facts in the corpus are written by hand;
  // `undefined_premise[audit]` reads `not edb(Rel)` ONCE, so a table split
  // across two books makes it blind to whichever half it did not read.
  assert.ok(r.factKeys().filter((k) => k.startsWith('edb[main](')).length > 10,
    'the co-written table stays whole, in the book programs can write');
  assert.deepEqual(r.factKeys().filter((k) => k.startsWith(`edb[${KERNEL_PERSP}](`)), [],
    'no half of it moved');
  // and the audit that reads it is still able to fire on a real miss
  const miss = load(BOOT, 'x[y](A) :- never_populated(A).');
  assert.ok(rows(miss, 'undefined_premise[audit](R, Rel)').length > 0,
    'positive control: undefined_premise still says no when a premise is unpopulatable');
});

// ===========================================================================
// 4. THE PARTITION, SWEPT RATHER THAN SAMPLED

test('every kernel-vocabulary relation is in exactly one book, and the list prints', () => {
  // TARGET: "the line between the two books is where the WRITER is, and it is
  // drawn once rather than per relation." Swept over the whole vocabulary in
  // both directions, so what moved AND what stayed are both measured — a
  // sampled boundary is an assumption wearing a test's face.
  const r = load(BOOT, 'imports(x, $kernel).\ndatum(a).\nseen[x](A) :- datum(A), rule(_).');
  const seen = new Map<string, Set<string>>();
  for (const k of r.factKeys()) {
    const m = /^([a-z_]+)\[([^\]]+)\]/.exec(k);
    if (!m) continue;
    if (!seen.has(m[1])) seen.set(m[1], new Set());
    seen.get(m[1])!.add(m[2]);
  }
  const inKernel: string[] = [];
  const inMain: string[] = [];
  const split: string[] = [];
  for (const rel of [...Object.values(V), ...Object.values(IFACE)].sort()) {
    const ps = seen.get(rel);
    if (!ps || ps.size === 0) continue;
    if (ps.size > 1) split.push(`${rel}:${[...ps].sort().join('+')}`);
    else if (ps.has(KERNEL_PERSP)) inKernel.push(rel);
    else inMain.push(rel);
  }
  assert.deepEqual(split, [], `no kernel relation may be split across books: ${split}`);
  // what moved
  assert.deepEqual(inKernel.sort(), [...KERNEL_BOOK].filter((x) => seen.has(x)).sort(),
    'the kernel book holds exactly KERNEL_BOOK, no more and no less');
  // what stayed, BY NAME, because these are the ones a program writes by hand
  assert.deepEqual(inMain.sort(), ['authority', 'edb', 'mode', 'reserved'],
    'exactly the declaration tables, which programs write by hand, stayed');
  // POSITIVE CONTROL: the sweep found relations at all, in both books
  assert.ok(inKernel.length >= 12 && inMain.length === 4,
    `sweep found ${inKernel.length} in the kernel book and ${inMain.length} in [main]`);
});

test('the split adds no NEW finding: leak($kernel, X) holds exactly where leak(main, X) did', () => {
  // TARGET: "how much noise does `imports(main, $kernel)` cost, and is any of
  // it a new CLASS of report?" This is the bound on the regression, and it is
  // a theorem before it is a measurement: `sees` is transitive, so a ledger X
  // that declares `imports(X, main)` inherits `sees(X, $kernel)` and reports
  // neither; one that does not declare it reports both. The two sets cannot
  // come apart. What the split costs is therefore DOUBLED ROWS on a walk that
  // was already being reported, never a row about a walk that was not.
  //
  // Measured over 9 worlds (bare boot, sensors, findings, counter, tm,
  // strata+kernel-policy, inquiry, and the pair below): 9 agree, 0 diverge.
  const undeclared = load(BOOT,
    'authority(x, w).\ndatum(a).\nd[x](A) :- datum(A).');
  assert.deepEqual(leaks(undeclared), [`${KERNEL_PERSP} -> x`, 'main -> x'],
    'undeclared: the walk is reported at both of its sources');
  const declared = load(BOOT,
    'authority(x, w).\nimports(x, main).\ndatum(a).\nd[x](A) :- datum(A).');
  assert.deepEqual(leaks(declared), [],
    'declared: BOTH go quiet, because the declaration reaches the kernel book '
    + 'through [main] by the transitive step of `sees`');
  // sensors is the standing example, and it is the same shape: two known-open
  // rows became four, and the two new ones name the same walk one hop earlier.
  const sensors = load(BOOT, fs.readFileSync(path.join(ROOT, 'examples/sensors.rofl'), 'utf8'));
  assert.deepEqual(leaks(sensors),
    [`${KERNEL_PERSP} -> trust`, `${KERNEL_PERSP} -> verified`,
     'main -> trust', 'main -> verified'],
    'sensors: 2 rows became 4, and the destinations are the same set');
});

test('a program that reads nothing of the kernel book is untouched by the split', () => {
  // TARGET: "the cost is paid only by programs that read reflection." Nineteen
  // of twenty demos never mention it; if the split moved their audits the
  // price would be everywhere instead of where the reading is.
  const r = load(BOOT, 'authority(red, informer).\nsaid[red](a).\nheard[red](X) :- said[red](X).');
  assert.deepEqual(leaks(r), []);
  assert.deepEqual(rows(r, 'forged[audit](F)'), []);
  assert.deepEqual(rows(r, 'malformed[audit](R)'), []);
  assert.deepEqual(rows(r, 'undefined_premise[audit](R, Rel)'), []);
  assert.deepEqual(rows(r, 'heard[red](X)'), ['X = a'], 'positive control: it computes');
});
