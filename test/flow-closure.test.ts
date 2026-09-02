// flow-closure.test.ts — the leak audit is transitive, and still local.
//
// The defect it closes: `flow` was one rule's signature — this rule reads that
// ledger, this rule writes this one — and `leak[audit]` read it directly. So
// the audit was LOCAL where the property it guards is TRANSITIVE. Content
// walked out of a ledger along a chain whose every step was separately
// licensed (red -> case declared, case -> report declared) and nobody ever
// asked about red -> report. The comparison was also lopsided: `sees` has
// always been the reflexive-transitive closure of `imports`, so a single-hop
// `flow` was being measured against a transitive right.
//
// Both directions are tested, because only one of them is the risk. A closure
// that swallowed the direct case would look like success and be a disaster, so
// the FIRST assertion here is that a genuine single-hop leak still fires. The
// old single-hop rule is carried in the same store as `leak_hop`, which makes
// the discrimination a measurement rather than a claim: on the multi-hop pair
// the old shape must stay silent while the new one speaks, and on the direct
// pair both must speak.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

/** boot.rofl's leak rule as it stood BEFORE the closure, under a second name.
 *  Carrying it in the store is the positive control: every assertion about
 *  what the closure ADDED is then a difference between two rules evaluated
 *  over one fact set, not a comparison with a remembered number. */
const OLD_RULE = `
leak_hop[audit](A, B) :- flow(A, B), A != B, not sees(B, A), not bridge_decl(R, A, B).
`;

function load(...programs: string[]): Rofl {
  const r = new Rofl();
  for (const p of programs) {
    const res = r.load(p);
    assert.equal(res.ok, true, res.diagnostics.join('\n'));
  }
  return r;
}

const pairs = (r: Rofl, rel: string): string[] =>
  r.query(`${rel}[audit](A, B)`).rows
    .map((x) => `${x.bindings['A']} -> ${x.bindings['B']}`).sort();

// ---------------------------------------------------------------------------
// THE DISCRIMINATING TEST

// One store, two leaks. `naked` reads [red] and writes the default ledger with
// no head annotation, so no bridge is declared and the crossing is a leak at
// one hop — the case that must survive the change. The claim/digest pair is
// the chain: each hop declares its bridge, and the walk declares nothing.
const BOTH = `
authority(red, informer). authority(case, clerk). authority(report, press).
said[red](a).
claim[case](X)    :- said[red](X).
digest[report](X) :- claim[case](X).
naked(X)          :- said[red](X).
`;

test('the closure ADDS the walk and does not swallow the direct crossing', () => {
  const r = load(BOOT, OLD_RULE, BOTH);

  // the fact that motivates the audit: content is in [report], and by then
  // nothing in it names [red].
  assert.ok(r.holds('digest[report](a)'), 'the content arrived');
  assert.deepEqual(r.query('digest[report](X)').rows.map((x) => x.bindings['X']), ['a']);

  const hop = pairs(r, 'leak_hop');   // the rule as it was
  const now = pairs(r, 'leak');       // the rule as it is

  // 1. RED FIRST: the old rule cannot see the walk.
  assert.ok(!hop.includes('red -> report'),
    `the single-hop rule must miss the chain, got ${JSON.stringify(hop)}`);

  // 2. GREEN: the closure sees it.
  assert.ok(now.includes('red -> report'),
    `the closed rule must find the chain, got ${JSON.stringify(now)}`);

  // 3. THE ONE THAT MATTERS: the direct crossing still fires under BOTH.
  assert.ok(hop.includes('red -> main'), 'positive control: the single-hop leak is real');
  assert.ok(now.includes('red -> main'),
    'a closure that swallowed the direct case would look like success and be a disaster');

  // 4. the closure only ever adds: everything the old rule flagged is still flagged.
  for (const p of hop) assert.ok(now.includes(p), `the closure dropped ${p}`);
  assert.ok(now.length > hop.length, 'and it did add something, or nothing was measured');
});

test('a licensed chain stays silent: the closure reports crossings, not hops', () => {
  // Same three ledgers, same two hops, every hop declared. Nothing fires,
  // which is what makes the audit a gate and not a counter of edges.
  //
  // THE FIXTURE GREW TWO LINES, and that is the change this file now measures.
  // It used to declare only `imports(report, red)` — the far end — and the two
  // HOPS red->case and case->report were silent because the kernel emitted a
  // `bridge_decl` for each rule whose head named a ledger and whose body read
  // another, and `crossing` read that back as a licence. Each rule licensed
  // its own read by existing. With that gone the hops are crossings in their
  // own right and have to be declared like anything else; `sees` is the
  // transitive closure of `imports`, so declaring the two hops licenses the
  // walk as well and the far-end declaration is no longer needed at all.
  const r = load(BOOT, OLD_RULE, `
    authority(red, informer). authority(case, clerk). authority(report, press).
    imports(case, red).
    imports(report, case).
    said[red](a).
    claim[case](X)    :- said[red](X).
    digest[report](X) :- claim[case](X).
  `);
  assert.ok(r.holds('sees(report, red)'),
    'the two declarations compose: rights close the same way flows do');
  assert.ok(!pairs(r, 'leak').includes('red -> report'), 'a declared crossing is not a leak');
  // and the gate can still say no in the same store shape
  assert.equal(pairs(r, 'leak').length, 0, `expected silence, got ${JSON.stringify(pairs(r, 'leak'))}`);

  // MUTANT: drop ONE of the two hop declarations. The hop reddens AND the walk
  // it carried reddens with it — a silence that survived deleting a licence
  // would not be the licence's doing.
  const half = load(BOOT, OLD_RULE, `
    authority(red, informer). authority(case, clerk). authority(report, press).
    imports(report, case).
    said[red](a).
    claim[case](X)    :- said[red](X).
    digest[report](X) :- claim[case](X).
  `);
  assert.deepEqual(pairs(half, 'leak'), ['red -> case', 'red -> report'],
    'the undeclared hop and the walk that runs through it');
});

// ---------------------------------------------------------------------------
// THE CHAIN, NAMED

test('red -> case -> report: the leak names the far end and `why` names the hop', () => {
  const r = load(BOOT, `
    authority(red, informer). authority(case, clerk). authority(report, press).
    said[red](a).
    claim[case](X)    :- said[red](X).
    digest[report](X) :- claim[case](X).
  `);
  assert.ok(r.holds('leak[audit](red, report)'), 'the walk is reported');

  // `why` on the LEAK ITSELF names the hop. The proof of flows_to(red,report)
  // rests on flows_to(red,case) and flow(case,report), and the tree carries
  // both, down to the rule ids on either side of the crossing. So the audit
  // reports the two ends and the demonstration reports the route — there is
  // no limitation to record here.
  const why = r.why('leak[audit](red, report)').text;
  assert.match(why, /flow\[main\]\(case, ?report\)/, `the demonstration must name the hop:\n${why}`);
  assert.match(why, /flows_to\[main\]\(red, ?case\)/, `and the first half of the walk:\n${why}`);
  // the rules on both sides of the crossing are named, so the route is
  // actionable and not merely visible.
  //
  // THE BRACKET IN THIS PATTERN MOVED, and it is a fact about where the rows
  // live rather than a loosened regex. `reads_from` is written by the kernel
  // about a program and now lives in `[$kernel]`, so the demonstration prints
  // it there. Kept EXACT — matching `reads_from[` with any book would pass on
  // a tree where the split never happened, which is the one thing this line
  // must not do.
  const rules = [...why.matchAll(/reads_from\[\$kernel\]\((r[0-9a-f]+),/g)].map((m) => m[1]);
  assert.equal(new Set(rules).size, 2, `two rules make the walk, got ${JSON.stringify(rules)}`);
  // MUTANT — the old book must be GONE from the tree, not merely joined by a
  // new one. A `reads_from[main]` row surviving anywhere would mean reflection
  // is split across two books, which is the state `undefined_premise` and
  // `breach` would then each see half of.
  assert.doesNotMatch(why, /reads_from\[main\]/,
    'no half of the trail was left behind in the default ledger');

  // the leak literal ITSELF only carries the two ends — that is the audit's
  // shape, and the hop is one `why` away rather than in the row.
  //
  // WHAT THIS ASSERTION USED TO SAY, and why it was wrong. It read "the
  // DECLARED hop is not itself a leak" — but nothing in this fixture ever
  // declared red->case. It was silent because the kernel emitted a
  // `bridge_decl` for `claim[case](X) :- said[red](X).` and `crossing` read
  // that as a licence, so the comment named a declaration that did not exist.
  // Both hops are undeclared here, and both are now reported.
  assert.deepEqual(pairs(r, 'leak'),
    ['case -> report', 'red -> case', 'red -> report'],
    'three rows: the two undeclared hops and the walk they make');
  // and the walk is not merely the sum of the hops — remove either hop's
  // content and it is gone, which is what `flows_to` being a closure means
  assert.ok(r.holds('leak[audit](red, report)'));
});

test('the brief\'s polymorphic shape leaks under the VARIABLE, not under red', () => {
  // `claim[case](P, X) :- said[P](X).` relocates the ledger name into an
  // ordinary argument, and `digest[report](X) :- claim[case](_, X).` projects
  // it away — so [report] ends up holding red's content with no trace of red.
  // The flow graph records the rule's SIGNATURE, though, and that signature
  // names the variable: what fires is $var("P") -> report. The content-level
  // attribution is exactly what is lost, which is why the audit is about
  // ledgers rather than about rows.
  const r = load(BOOT, `
    authority(red, informer). authority(blue, other).
    authority(case, clerk). authority(report, press).
    said[red](a). said[blue](b).
    claim[case](P, X) :- said[P](X).
    digest[report](X) :- claim[case](_, X).
  `);
  assert.ok(r.holds('claim[case](red, a)'), 'the ledger name survived collection as an argument');
  assert.deepEqual(r.query('digest[report](X)').rows.map((x) => x.bindings['X']).sort(), ['a', 'b'],
    'and then it was projected away — [report] holds both, attributed to neither');

  const now = pairs(r, 'leak');
  // Three rows where there was one. The extra two are the HOPS, which the old
  // audit could not see: `claim[case](P, X) :- said[P](X).` gathers under the
  // variable and `digest[report](X) :- claim[case](_, X).` carries it onward,
  // and each rule used to license its own read by having a bracketed head.
  assert.deepEqual(now, ['$var("P") -> case', '$var("P") -> report', 'case -> report'],
    'the crossing surfaces under the variable perspective, at every hop');
  assert.ok(!r.holds('leak[audit](red, report)'),
    'red is not in the flow graph at all: a polymorphic read records the variable');
  // THE POINT OF THE ARM, unchanged and now sharper: not one row names [red].
  for (const row of now) assert.ok(!row.includes('red'), `attribution is lost by projection: ${row}`);
});

// ---------------------------------------------------------------------------
// THE COLLECTION DECLARATION
//
// The closure made one class of crossing permanently unreportable-and-
// unfixable: a rule polymorphic in the ledger reads `$var("P")`, which has no
// `authority` fact, so `imports(To, $var("P"))` is not a sentence this
// language can write. The remedy used to be a paragraph in a README, which is
// not auditable, does not go stale loudly, and no check reads. `collects(X)`
// is the fact that replaces it.
//
// The risk is that such an escape is an off switch wearing a declaration's
// clothes, so every test below carries the named-source control in the SAME
// store: after the declaration, a crossing from a NAMED ledger must still be
// reported, or nothing here is a gate.

/** [case] gathers from any speaker; [worlds] and [ledger_x] read [case].
 *  [secret] reaches [case] through [mid] by a walk nobody declared — that is
 *  the control, and it must survive every declaration below. */
const COLLECTING = `
authority(case, clerk). authority(worlds, judge). authority(ledger_x, archivist).
authority(secret, spy). authority(mid, courier).
said[gossip](a). hidden[secret](b).
claim[case](X)     :- said[P](X).       -- [case] gathers, polymorphically
world[worlds](X)   :- claim[case](X).
filed[ledger_x](X) :- claim[case](X).
relay[mid](X)      :- hidden[secret](X).
sneak[case](X)     :- relay[mid](X).    -- and a NAMED-source walk into [case]
`;

test('the declaration licenses the gather and does NOT license the named walk', () => {
  const before = load(BOOT, COLLECTING);
  // POSITIVE CONTROL FIRST: without the declaration the walks are all reported,
  // so the silence below belongs to the declaration and not to the probe.
  // Twelve rows, not the seven this list held before: every HOP is now a
  // crossing in its own right, where each rule used to license its own read by
  // having a bracketed head.
  assert.deepEqual(pairs(before, 'leak'),
    ['$var("P") -> case', '$var("P") -> ledger_x', '$var("P") -> worlds',
     'case -> ledger_x', 'case -> worlds',
     'mid -> case', 'mid -> ledger_x', 'mid -> worlds',
     'secret -> case', 'secret -> ledger_x', 'secret -> mid', 'secret -> worlds']);

  const after = load(BOOT, COLLECTING + 'collects(case).\n');
  const now = pairs(after, 'leak');

  // 1. the two walks out of the ledger VARIABLE are licensed
  assert.ok(!now.includes('$var("P") -> worlds'), `still leaking: ${JSON.stringify(now)}`);
  assert.ok(!now.includes('$var("P") -> ledger_x'), 'and the second reader too');

  // 2. THE ONE THAT MATTERS: every NAMED-source walk into the same collecting
  //    ledger is still reported. `collects` admits what `imports` cannot name;
  //    it does not admit what `imports` was there to gate.
  for (const p of ['secret -> case', 'secret -> worlds', 'secret -> ledger_x',
                   'mid -> worlds', 'mid -> ledger_x']) {
    assert.ok(now.includes(p), `the gate stopped saying no about ${p}: ${JSON.stringify(now)}`);
  }
  // NINE named walks remain where this list held five. The four additions are
  // hops that were previously self-licensed by a bracketed head — `secret ->
  // mid`, `mid -> case`, `case -> worlds`, `case -> ledger_x` — and every one
  // of them has a NAMED source, which is the property the arm is about.
  assert.deepEqual(now,
    ['case -> ledger_x', 'case -> worlds',
     'mid -> case', 'mid -> ledger_x', 'mid -> worlds',
     'secret -> case', 'secret -> ledger_x', 'secret -> mid', 'secret -> worlds'],
    `exactly the named walks remain: ${JSON.stringify(now)}`);
  // THE DISCRIMINATION, stated rather than implied: not one surviving row has
  // a variable source. `collects` admitted exactly the class `imports` cannot
  // name, and nothing else.
  for (const p of now) assert.ok(!p.startsWith('$var'), `a variable source survived: ${p}`);
  assert.equal(now.length, 9, `and the count is pinned: ${JSON.stringify(now)}`);
});

test('ONE declaration, at the ledger that gathers — not one per reader', () => {
  // Keyed on the walk's DESTINATION instead, `collects(worlds)` would leave
  // `$var("P") -> ledger_x` firing and demand a second declaration — a
  // sentence that is false about [ledger_x], which gathers nothing — and a
  // third the day a third reader is added. This is that comparison, run
  // rather than argued: the destination-keyed rule is defined locally, over
  // the same store, so the difference is a measurement.
  const r = load(BOOT, COLLECTING + 'collects(worlds).\n' + `
    by_destination(A, B) :- crossing(A, B), collects(B), not perspective(A).
  `);
  const licensed = r.query('by_destination(A, B)').rows
    .map((x) => `${x.bindings['A']} -> ${x.bindings['B']}`).sort();
  assert.deepEqual(licensed, ['$var("P") -> worlds'],
    'declaring the destination covers that reader and no other');
  // whereas the shipped rule, declared once at [case], covers both readers
  const s = load(BOOT, COLLECTING + 'collects(case).\n');
  assert.deepEqual(s.query('gathered(A, B)').rows
    .map((x) => `${x.bindings['A']} -> ${x.bindings['B']}`).sort(),
    ['$var("P") -> case', '$var("P") -> ledger_x', '$var("P") -> worlds']);
});

test('the broad form is an off switch, and this is the measurement that says so', () => {
  // `not collects(B)` as a bare premise on `leak` was the obvious shape. In
  // the same store it silences `secret -> case` — a walk from a NAMED ledger
  // that nothing licensed — which is the whole property the audit exists for.
  const r = load(BOOT, COLLECTING + 'collects(case).\n' + `
    broad_leak(A, B) :- crossing(A, B), not collects(B).
  `);
  const broad = r.query('broad_leak(A, B)').rows
    .map((x) => `${x.bindings['A']} -> ${x.bindings['B']}`).sort();
  assert.ok(!broad.includes('secret -> case'),
    'the broad form silences the named walk — that is what makes it an off switch');
  assert.ok(pairs(r, 'leak').includes('secret -> case'),
    'and the shipped form does not');
});

test('the licence can be ASKED about: `why` names the declaration and its author', () => {
  // the declaration is loaded under a named author, because "who may say this"
  // is half of what makes it a declaration rather than a setting
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(COLLECTING).ok, true);
  assert.equal(r.load('collects(case).', { who: 'clerk' }).ok, true);
  // `why` needs a ground literal and `$` is unwritable in surface syntax, so
  // the pair row cannot be typed at all. The ledger-keyed row can be, and it
  // is what makes the escape an explanation rather than an invisible absence.
  assert.ok(r.holds('collected[audit](case)'));
  const why = r.why('collected[audit](case)').text;
  assert.match(why, /collects\[main\]\(case\) \[axiom\]/, `the declaration itself:\n${why}`);
  assert.match(why, /not perspective\[main\]\(\$var\("P"\)\)/,
    `and why the escape applied — the source is no registered ledger:\n${why}`);
  assert.match(why, /flow\[main\]\(\$var\("P"\),case\)/, `and the gathering rule:\n${why}`);

  // WHO declared it, which the trail carries the same way it carries any
  // other assertion
  const who = r.query('asserted_by(F, Who, T)').rows
    .filter((x) => x.text.includes('$fact(collects,')).map((x) => x.bindings['Who']);
  assert.deepEqual(who, ['clerk'], 'the declaration is attributable');

  // and the refusal explains itself too. `why` inlines the SINGLE-STEP form
  // of a finite failure, so the tree names the relation that failed —
  // `collects_from(case, secret)` — and stops there; the deciding premise is
  // one `whynot` further down. Both halves are asserted, because "the tree
  // names it" and "the tree names the reason" are different claims and only
  // the first is true at this depth.
  const refused = r.why('leak[audit](secret, case)').text;
  assert.match(refused, /failed premise: collects_from\[main\]\(case,secret\)/,
    `the refusal must name the collection premise:\n${refused}`);
  // one step down, the licence rule is quoted in full, so a reader sees the
  // shape of the escape rather than being told a row is absent
  const deeper = r.whynot('collects_from(case, secret)').text;
  assert.match(deeper, /not perspective\[main\]\(\?A\)/, `the rule must be quoted:\n${deeper}`);
  // [secret] fails it twice over and `whynot` names the first: it never flows
  // DIRECTLY into [case] at all, it arrives by a walk through [mid]
  assert.match(deeper, /failed premise: flow\[main\]\(secret,case\)/, deeper);
  // and where a ledger DOES flow straight in, the perspective premise is the
  // one that bites, by name — [mid] is registered, so [case] never collected
  // from it and the walk through it stays the audit's business
  const mid = r.whynot('collects_from(case, mid)').text;
  assert.match(mid, /perspective\[main\]\(mid\) holds/,
    `the deciding premise must name itself:\n${mid}`);
});

test('a declaration that licenses nothing says so, instead of sitting there', () => {
  // `collects(X)` on a ledger nothing gathers into derives no `collected`
  // row. A declaration nobody needed is then distinguishable from one doing
  // work, which is the difference between a fact and a decoration.
  const r = load(BOOT, COLLECTING + 'collects(ledger_x).\n');
  assert.ok(!r.holds('collected[audit](ledger_x)'),
    'nothing polymorphic flows straight into [ledger_x], so it collected nothing');
  assert.ok(pairs(r, 'leak').includes('$var("P") -> ledger_x'),
    'and the crossing it was meant to cover is still reported');
  // the control: the same declaration on the right ledger does derive the row
  assert.ok(load(BOOT, COLLECTING + 'collects(case).\n').holds('collected[audit](case)'));
});
