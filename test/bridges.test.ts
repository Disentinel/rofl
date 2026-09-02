// bridges.test.ts — a crossing between two ledgers is licensed by something a
// HUMAN WROTE, or it is a leak.
//
// The defect this closes. `crossing` carried `not bridge_decl(R, A, B)`, and
// `src/reflect.ts` emitted that row for every rule whose head named a
// perspective and whose body read another. So the permission was produced by
// the very act that needed it: typing the bracket was the whole of the
// authorisation. Measured against a bare boot.rofl before the change,
//
//   digest[report](X) :- datum[secret](X).            leak 0  crossing 0
//   ... the same, through an intermediate ledger      leak 1  crossing 1
//   ... the one hop WITH `imports(report, secret)`    leak 0  crossing 0
//
// — the first and the third being the finding, because the DECLARED and the
// UNDECLARED single hop were indistinguishable from the audit. Nine such rows
// existed in a bare boot.rofl, one per audit rule in it.
//
// Every test below states the constraint it targets. The first two are the
// pair that matters: a gate that only ever says yes is an assumption wearing a
// gate's interface, and a gate that only ever says no gets switched off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { encodeRule } from '../src/reflect.ts';
import { parseProgram } from '../src/parser.ts';

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
const leaks = (r: Rofl): string[] =>
  r.query('leak[audit](A, B)').rows
    .map((x) => `${x.bindings['A']} -> ${x.bindings['B']}`).sort();
const crossings = (r: Rofl): string[] =>
  r.query('crossing(A, B)').rows
    .map((x) => `${x.bindings['A']} -> ${x.bindings['B']}`).sort();

/** boot.rofl with ONE line struck out, by exact text. The struck line must be
 *  present or the mutant is vacuous — a mutation test that silently mutates
 *  nothing reports green for the wrong reason, which is the failure mode this
 *  whole file is about. */
function bootWithout(line: string): string {
  assert.ok(BOOT.includes(line + '\n'), `mutant is vacuous: boot.rofl has no line ${JSON.stringify(line)}`);
  return BOOT.replace(line + '\n', '');
}

// ---------------------------------------------------------------------------
// THE PAIR THAT MATTERS

const ONE_HOP = `
authority(secret, spy). authority(report, press).
datum[secret](x).
digest[report](X) :- datum[secret](X).
`;

test('MUTANT 1 — a single-hop crossing nobody declared is a LEAK', () => {
  // TARGET: "an explicit head perspective does not license the read it makes."
  // This is the whole of the change; before it, both numbers below were 0.
  const r = load(BOOT, ONE_HOP);

  // positive control on the instrument: the content really did travel, and the
  // flow graph really did record it. A leak count taken over an empty flow
  // graph would be 0 for a reason that has nothing to do with the audit.
  assert.ok(r.holds('digest[report](x)'), 'the content arrived in [report]');
  assert.ok(r.holds('flow(secret, report)'), 'and the flow graph recorded the hop');

  assert.deepEqual(crossings(r), ['secret -> report']);
  assert.deepEqual(leaks(r), ['secret -> report'],
    'the head bracket is a statement about the rule, never a permission');

  // and the row can be ASKED about, which is what makes it actionable
  const why = r.why('leak[audit](secret, report)').text;
  assert.match(why, /flow\[main\]\(secret, ?report\)/, `the hop must be named:\n${why}`);
});

test('MUTANT 2 — the same hop WITH `imports` declared is silent', () => {
  // TARGET: "the licence is real and not a permanent red." A gate that cannot
  // be satisfied is abolished, and then its absence is invisible.
  const r = load(BOOT, 'imports(report, secret).\n' + ONE_HOP);
  assert.ok(r.holds('sees(report, secret)'), 'positive control: the declaration took effect');
  assert.deepEqual(leaks(r), []);
  assert.deepEqual(crossings(r), []);

  // The DISCRIMINATION, in one store rather than across two runs: the same
  // program, the same rule, one line of declaration apart, and the audit tells
  // them apart. That is the sentence that was false before this change.
  assert.notDeepEqual(leaks(load(BOOT, ONE_HOP)), leaks(r));
});

test('MUTANT 3 — the two-hop walk did not stop being caught', () => {
  // TARGET: "the closure still reports the far end." The change removes a
  // premise from `crossing`, which can only widen it; this asserts the widening
  // did not come at the cost of the case that already worked.
  const r = load(BOOT, `
    authority(secret, spy). authority(mid, courier). authority(report, press).
    datum[secret](x).
    relay[mid](X)     :- datum[secret](X).
    digest[report](X) :- relay[mid](X).
  `);
  assert.ok(leaks(r).includes('secret -> report'), `the far end: ${JSON.stringify(leaks(r))}`);
  // and now each HOP is reported too, which it was not before: every one of
  // them is itself an undeclared crossing, and saying so is the point.
  assert.deepEqual(leaks(r), ['mid -> report', 'secret -> mid', 'secret -> report']);

  // declaring the two hops silences the walk as well, because `sees` is the
  // transitive closure of `imports` and always was. Rights compose the same
  // way flows do — that is why the audit compares one closure against another.
  const declared = load(BOOT, 'imports(mid, secret). imports(report, mid).\n' + `
    authority(secret, spy). authority(mid, courier). authority(report, press).
    datum[secret](x).
    relay[mid](X)     :- datum[secret](X).
    digest[report](X) :- relay[mid](X).
  `);
  assert.deepEqual(leaks(declared), []);
});

// ---------------------------------------------------------------------------
// THE DECLARATIONS THIS FILE'S OWN LEDGER NEEDED

test('MUTANT 4 — striking `imports(audit, main)` reddens boot.rofl itself, and by how much', () => {
  // TARGET: "the declaration added to boot.rofl is load-bearing and is not
  // WIDER than it needs to be." If the count came out larger than the crossing
  // it was written for, the sentence covered more than it claimed.
  const r = load(bootWithout('imports(audit, main).'));
  assert.deepEqual(leaks(r), ['main -> audit'],
    'exactly one pair, the one the declaration names');
  // one PAIR, and the rules behind it. THE COUNT MOVED FROM NINE TO EIGHT, and
  // the missing one is the finding rather than a re-baseline: reflection now
  // lives in `[$kernel]`, so `imports(audit, main)` no longer covers what an
  // audit rule reads from the kernel's book. What it still covers is the
  // DECLARATION tables — `authority`, `mode`, `edb`, `reserved`,
  // `demands_authorship` — plus this file's own derived `rule_known`,
  // `crossing`, `gathered` and `collects_from`. Eight rules need that; one
  // reads nothing but the kernel's book and has left this set.
  const reads = (book: string) => new Set(r.query(`reads_from(R, ${book})`).rows
    .filter((x) => r.holds(`writes_to(${x.bindings['R']}, audit)`))
    .map((x) => x.bindings['R']));
  const fromMain = reads('main');
  const fromKernel = reads('$kernel');
  assert.equal(fromMain.size, 8, `eight audit rules read [main], got ${fromMain.size}`);
  // MUTANT / THE OTHER HALF, which is the point of splitting one sentence into
  // two: the rules that vanished from the count above did not vanish from the
  // program. Asserting only the 8 would pass just as well if the kernel's book
  // were never read at all, which is precisely the state this split replaced.
  assert.equal(fromKernel.size, 7, `seven audit rules read the kernel book, got ${fromKernel.size}`);
  assert.ok([...fromMain].some((id) => fromKernel.has(id)),
    'and at least one rule reads BOTH — the trail and the declarations together');
  // and with the line in place, silence
  assert.deepEqual(leaks(load(BOOT)), []);

  // NOT WIDER THAN IT SAYS: `imports(audit, main)` does not make [audit] see
  // whatever ELSE reaches [main]. `sees(audit, X)` would need `sees(main, X)`,
  // and [main] imports nothing, so a ledger flowing into [main] is still
  // reported at both ends of its walk.
  const w = load(BOOT, 'authority(euclid, e). axiom[euclid](p). prop[main](P) :- axiom[euclid](P).');
  assert.deepEqual(leaks(w), ['euclid -> audit', 'euclid -> main']);
});

test('MUTANT 5 — a rule with a VARIABLE ledger reading a NAMED one', () => {
  // TARGET: "the polymorphic read into [audit] is licensable AT ALL, and by a
  // sentence that licenses NOTHING ELSE." A rule that quantifies over the
  // ledger reads `$var("E")`, which has no `authority` fact and so can never
  // be the From of an `imports` — `collects` is the only instrument that
  // reaches it, and it must not become an off switch while doing so.
  //
  // The declaration is written HERE and not in boot.rofl on purpose: it is a
  // sentence about the layer that has such a rule, and boot.rofl has none.
  const LAYER = `
    authority(node, host). authority(code, scanner).
    resolved[node](s, f). found[code](s).
    -- polymorphic read into [audit]: the source has no name at all
    unexplained[audit](S, E) :- resolved[E](S, _), not found[code](S).
    -- and a NAMED read into [audit] in the same program
    tallied[audit](S)        :- found[code](S).
  `;
  // POSITIVE CONTROL FIRST: undeclared, the polymorphic crossing is reported,
  // so the silence below belongs to the declaration and not to the probe.
  assert.ok(leaks(load(BOOT, LAYER)).includes('$var("E") -> audit'),
    JSON.stringify(leaks(load(BOOT, LAYER))));

  const r = load(BOOT, LAYER + 'collects(audit).\n');
  // 1. the polymorphic crossing is licensed
  assert.ok(!leaks(r).includes('$var("E") -> audit'), `${JSON.stringify(leaks(r))}`);
  // 2. THE ONE THAT MATTERS: the named source is still reported, in the SAME
  //    store, at the same time. `collects` admits what `imports` cannot name;
  //    it does not admit what `imports` is there to gate.
  assert.ok(leaks(r).includes('code -> audit'),
    `the escape must not silence a ledger that has a name: ${JSON.stringify(leaks(r))}`);
  // 3. and the licence is exercised as a row that can be asked about
  assert.ok(r.holds('collected[audit](audit)'));
  assert.match(r.why('collected[audit](audit)').text, /collects\[main\]\(audit\) \[axiom\]/);
});

test('MUTANT 5b — boot.rofl does NOT carry `collects(audit)`, and that is deliberate', () => {
  // WHERE IT COULD NOT LOOK: every probe here loads boot.rofl, so a licence
  // sitting in boot.rofl would be invisible — it would simply make things
  // green. The check is therefore of the FILE, not of a query over it.
  assert.ok(!BOOT.includes('\ncollects(audit).'),
    'a blanket licence for every polymorphic read into [audit], in every program');
  // and the reason, measured: in a bare boot.rofl it would license nothing,
  // which is this file's own definition of a decoration rather than a licence.
  assert.equal(load(BOOT).query('collected[audit](X)').rows.length, 0);
  assert.equal(load(BOOT + 'collects(audit).\n').query('collected[audit](X)').rows.length, 0,
    'no rule in boot.rofl reads a variable ledger, so the sentence buys nothing here');
  // the one declaration boot.rofl DOES carry buys something, which is the
  // discrimination: `imports(audit, main)` is load-bearing, `collects` is not.
  assert.deepEqual(leaks(load(bootWithout('imports(audit, main).'))), ['main -> audit']);
});

test('MUTANT 6 — `collects` / `gathered` still work for a ledger other than [audit]', () => {
  // TARGET: "the collection mechanism is orthogonal to this change." It was
  // built for a different problem (a source with no name) and must keep its
  // own meaning, including its narrowness.
  const COLLECTING = `
    authority(case, clerk). authority(worlds, judge).
    authority(secret, spy). authority(mid, courier).
    said[gossip](a). hidden[secret](b).
    claim[case](X)   :- said[P](X).
    world[worlds](X) :- claim[case](X).
    relay[mid](X)    :- hidden[secret](X).
    sneak[case](X)   :- relay[mid](X).
  `;
  const before = load(BOOT, COLLECTING);
  assert.ok(leaks(before).includes('$var("P") -> case'),
    `positive control: undeclared, the gather is reported: ${JSON.stringify(leaks(before))}`);

  const after = load(BOOT, COLLECTING + 'collects(case).\n');
  assert.ok(!leaks(after).includes('$var("P") -> case'), 'the gather is licensed');
  assert.ok(!leaks(after).includes('$var("P") -> worlds'), 'and the onward hop from the gatherer');
  // the named-source walk into the SAME collecting ledger survives untouched
  for (const p of ['secret -> mid', 'mid -> case', 'secret -> case']) {
    assert.ok(leaks(after).includes(p), `${p} must still be reported: ${JSON.stringify(leaks(after))}`);
  }
  assert.ok(after.holds('collected[audit](case)'));
});

// ---------------------------------------------------------------------------
// WHERE THIS CHECK CANNOT LOOK — the question asked of the instrument itself,
// rather than of the code. Every mutant below was written from it, and the
// ones that SURVIVED are reported as results, not fixed into silence.

test('MUTANT 7 — the bracket no longer decides anything, in EITHER direction', () => {
  // WHERE IT COULD NOT LOOK: every probe above writes the head bracket. The
  // old emission fired on `perspExplicit`, so an UNBRACKETED head was the one
  // shape the old audit could see — and a check written from the bracketed
  // side would never notice if the two shapes still disagreed.
  //
  // Recorded finding f_bracket_silences_leak measured the old behaviour:
  // `prop(P) :- axiom[euclid](P).` gave leak 1 and `prop[main](P) :-
  // axiom[euclid](P).` gave leak 0 — so writing the bracket, the tidy and
  // documented-looking edit, switched the alarm off. Both must now agree.
  const bare = load(BOOT, 'authority(euclid, e). axiom[euclid](p). prop(P) :- axiom[euclid](P).');
  const brac = load(BOOT, 'authority(euclid, e). axiom[euclid](p). prop[main](P) :- axiom[euclid](P).');
  // Two rows, not one, and the second is the transitivity working: the content
  // lands in [main], boot.rofl's own audit rules carry [main] into [audit], and
  // NOTHING declared the first hop — so the walk `euclid -> audit` is undeclared
  // end to end. `imports(audit, main)` does not launder it, because `sees` needs
  // `sees(main, euclid)` for that and [main] imports nothing.
  assert.deepEqual(leaks(bare), ['euclid -> audit', 'euclid -> main']);
  assert.deepEqual(leaks(brac), ['euclid -> audit', 'euclid -> main'],
    'the bracket is not a declaration and must not silence the audit');
  assert.deepEqual(leaks(bare), leaks(brac));
  // and the reflection is bracket-insensitive too: same rule, same flow graph
  assert.deepEqual(bare.query('flow(A, B)').rows.map((x) => x.text).sort(),
                   brac.query('flow(A, B)').rows.map((x) => x.text).sort());
});

test('MUTANT 8 — nothing emits bridge_decl, and no program may write one', () => {
  // WHERE IT COULD NOT LOOK: `leak` is the only reader of `bridge_decl`, so
  // once the premise leaves `crossing`, every leak-shaped probe is blind to
  // whether the row is still being MANUFACTURED. This looks at the encoder
  // directly, and then at the door that keeps the name shut.
  const enc = encodeRule(parseProgram('digest[report](X) :- datum[secret](X).')[0]);
  assert.equal(enc.facts.filter((f) => f.rel === 'bridge_decl').length, 0);
  // positive control: the encoder is still emitting the flow pair it should
  assert.equal(enc.facts.filter((f) => f.rel === 'reads_from').length, 1);
  assert.equal(enc.facts.filter((f) => f.rel === 'writes_to').length, 1);

  // The name stays RESERVED, so the self-licence cannot be spelled by hand
  // either. There are two doors and this is the OUTER one: `src/api.ts` refuses
  // the clause at admission, so the rule never reaches the store and
  // `breach[audit]` — the inner door, which reads `concludes` and covers a
  // store arriving by snapshot — never gets to see it. Asserting the refusal
  // rather than the breach is asserting which door actually fired.
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.ok(r.holds('reserved(bridge_decl)'), 'the name is still write-protected');
  const res = r.load('bridge_decl(mine, secret, report) :- rule(mine).');
  assert.equal(res.ok, false, 'a program must not be able to write its own licence');
  assert.match(res.diagnostics.join('\n'), /'bridge_decl' is a kernel relation \(write-protected\)/);
});

test('MUTANT 9 — the audit sees a crossing the CONTENT makes, not one a rule declares', () => {
  // WHERE IT COULD NOT LOOK: `flow` is built from `reads_from`/`writes_to`,
  // which are per-RULE signatures. A ledger reached only through an argument
  // column — the name carried as data and then projected away — is invisible
  // to every probe above, because no rule's signature ever mentions it.
  //
  // This SURVIVES, and is reported rather than fixed: it is the same
  // limitation `flows_to` already documents, and the change neither caused
  // nor widened it. The crossing surfaces under the VARIABLE, not under [red].
  const r = load(BOOT, `
    authority(red, informer). authority(case, clerk). authority(report, press).
    said[red](a).
    claim[case](P, X) :- said[P](X).
    digest[report](X) :- claim[case](_, X).
  `);
  assert.ok(r.holds('claim[case](red, a)'), 'the ledger name survived as an argument');
  assert.ok(r.holds('digest[report](a)'), 'and was then projected away');
  assert.ok(!r.holds('leak[audit](red, report)'),
    'KNOWN AND UNCHANGED: content-level attribution is not what this audit reads');
  assert.ok(leaks(r).includes('$var("P") -> report'), JSON.stringify(leaks(r)));
});

test('MUTANT 10 — a FACT asserted straight into a ledger crosses nothing', () => {
  // WHERE IT COULD NOT LOOK: the audit reads the RULE graph. A host that
  // simply asserts secret content into [report] under [report]'s own authority
  // moves it with no rule at all, so `flow` is empty and the audit is silent —
  // and this is not the audit failing, it is `forged[audit]` and `authority`
  // being the mechanism for that half. Asserted here so the boundary between
  // the two audits is written down rather than assumed.
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load('authority(secret, spy). authority(report, press).').ok, true);
  assert.equal(r.load('datum[report](x).', { who: 'spy' }).ok, true);
  assert.deepEqual(leaks(r), [], 'no rule, no flow — the leak audit has nothing to read');
  assert.equal(r.query('forged[audit](F)').rows.length, 1,
    'and the audit that DOES cover it says so: [report] is not spy\'s to write');

  // SURVIVOR. Give the assertion [report]'s OWN author and both audits fall
  // silent: no rule, so no flow; a legitimate writer, so no forgery. Content
  // that a host carried between ledgers by hand is outside BOTH, and no
  // arrangement of `imports` reaches it. Reported, not fixed — it is a
  // property of what the flow graph is built from and predates this change.
  const legit = new Rofl();
  assert.equal(legit.load(BOOT).ok, true);
  assert.equal(legit.load('authority(secret, spy). authority(report, press).').ok, true);
  assert.equal(legit.load('datum[report](x).', { who: 'press' }).ok, true);
  assert.deepEqual(leaks(legit), []);
  assert.equal(legit.query('forged[audit](F)').rows.length, 0,
    'KNOWN HOLE: a host that moves content by asserting it is seen by neither audit');
});

test('MUTANT 11 — a crossing staged at the TICK BOUNDARY is still a crossing', () => {
  // WHERE IT COULD NOT LOOK: every probe above writes a same-tick head.
  // `peelRounds` treats a '@next' conclusion specially — it contributes no
  // dependency edge and settles no relation — so it would have been easy for
  // the flow graph to lose the rule with it, and no leak-shaped probe over
  // ordinary rules could tell.
  const r = load(BOOT, `
    authority(secret, spy). authority(report, press).
    datum[secret](x).
    digest[report](X)@next :- datum[secret](X).
  `);
  assert.equal(r.query('reads_from(R, secret)').rows.length, 1,
    'positive control: the staged rule is in the reflection at all');
  assert.deepEqual(leaks(r), ['secret -> report'],
    'staging a conclusion for the next tick does not launder the ledger it read');
});

test('MUTANT 12 — the audited program can still write its OWN `imports`', () => {
  // WHERE IT COULD NOT LOOK: every probe above hands the declaration to the
  // program from outside, as the owner of a ledger would. Nothing makes that
  // so. `imports` is host data in [main], and the program under audit can put
  // the line in its own text.
  //
  // SURVIVOR, and it is the honest residue of the defect this file closes.
  // What changed is not that self-licensing became impossible — it is that the
  // licence became a LINE SOMEBODY HAD TO TYPE, visible in the source and
  // carried by `asserted_by`, instead of a row the kernel emitted for every
  // bracketed head with no author at all. Cheap to grep for; not prevented.
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(`
    authority(secret, spy). authority(report, press).
    imports(report, secret).            -- written BY THE PROGRAM BEING AUDITED
    datum[secret](x).
    digest[report](X) :- datum[secret](X).
  `).ok, true);
  assert.deepEqual(leaks(r), [], 'the self-written licence is honoured');

  // What DOES bite, and only when the author is named: `imports` lands in
  // [main], so writing it without `authority(main, Who)` is `forged[audit]`.
  // Anonymously — the default across this repository — it is not caught, so
  // this is a half-measure and is recorded as one.
  const named = new Rofl();
  assert.equal(named.load(BOOT).ok, true);
  assert.equal(named.load('authority(secret, spy). authority(report, press).').ok, true);
  assert.equal(named.load('imports(report, secret).', { who: 'the_leaker' }).ok, true);
  assert.ok(named.query('forged[audit](F)').rows.length > 0,
    'a NAMED author with no authority over [main] surfaces as a forgery');
  const anon = new Rofl();
  assert.equal(anon.load(BOOT).ok, true);
  assert.equal(anon.load('authority(secret, spy). authority(report, press).').ok, true);
  assert.equal(anon.load('imports(report, secret).').ok, true);
  assert.equal(anon.query('forged[audit](F)').rows.length, 0,
    'KNOWN HOLE: unsigned, the same line draws no reaction at all');
});
