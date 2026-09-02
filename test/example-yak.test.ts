// example-yak.test.ts — YAK is a catalogue of real runs, so it has exactly
// two things to prove: the scanners that still run still run, and nothing in
// the catalogue claims evidence it does not have.
//
// The second half matters more than it looks. YAK's own rule is that an
// invented fragment is a defect no test can catch — which is true of the
// PROSE. It is not true of the bookkeeping around it, and that is mechanised
// here: every row marked CONFIRMED must name an artefact that exists, the
// README and demo.ts must agree on every fragment's mode, label and fate, and
// a fragment with no scanner must say so in both places rather than quietly
// having one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Store } from '../src/store.ts';
import { mki, mks, type Term } from '../src/unify.ts';
import { FRAGMENTS } from '../examples/yak/demo.ts';
import { run as sediment } from '../examples/yak/fragments/01-sediment.ts';
import { run as scc } from '../examples/yak/fragments/02-scc.ts';
import { run as metadep } from '../examples/yak/fragments/03-metadep.ts';
import { run as falseMiss } from '../examples/yak/fragments/04-false-miss.ts';
import { run as diverging } from '../examples/yak/fragments/05-diverging-semiring.ts';
import { run as stale } from '../examples/yak/fragments/06-stale-model.ts';
import { run as notNeeded } from '../examples/yak/fragments/07-not-needed.ts';
import { run as goldenAccident } from '../examples/yak/fragments/08-golden-accident.ts';
import { run as wrongPremise } from '../examples/yak/fragments/09-wrong-premise.ts';
import { run as hygiene } from '../examples/yak/fragments/hygiene.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const YAK = path.join(ROOT, 'examples', 'yak');
const README = fs.readFileSync(path.join(YAK, 'README.md'), 'utf8');

/** Each scanner is run once and its output shared, because several of them
 *  load boot.rofl and the suite has a budget. */
const memo = new Map<string, string>();
const out = (name: string, f: () => string[]): string => {
  let v = memo.get(name);
  if (v === undefined) { v = f().join('\n'); memo.set(name, v); }
  return v;
};

// ---------------------------------------------------------------------------
// the scanners that still run, still run

test('01 sediment — the retained audit fires on code written after it', () => {
  const t = out('01', sediment);
  // The live hit: BLAM declares no edb, so its rule file alone is mute on the
  // diff relation its host supplies. If this ever stops firing, the fragment
  // is describing something that no longer happens and must be rewritten.
  assert.match(t, /examples\/blam\/blam\.rofl\s+load=ok\s+undefined_premise: changed/);
  // And the positive control, without which the (none) rows prove nothing.
  assert.match(t, /the audit names 12 relations/);
  assert.match(t, /cond, cond_alt, cond_of, ctx, dim, dom, exclusive, flag, ordered, req_at, req_count, requires/);
});

test('02 scc — infinity is decided, and the naive rule over-condemns', () => {
  const t = out('02', scc);
  for (const f of ['heavy_oil', 'light_oil', 'petrol_gas']) {
    assert.match(t, new RegExp(`infinitely many derivations :.*craftable\\(${f}\\)`));
  }
  for (const f of ['coal', 'crude_oil', 'water']) {
    assert.match(t, new RegExp(`finite, safe to report\\s+:.*craftable\\(${f}\\)`));
  }
  // The correction that stopped the rule being kept: kernel facts on a support
  // cycle, where a cycle is harmless.
  // `reach` was the relation this reported on until boot.rofl stopped deriving
  // it; `flows_to` is the closure that remains, and it sits on a support cycle
  // for the same reason — `flow(main, main)` is a self-loop in any program with
  // a rule reading and writing the default ledger.
  const closure = /flows_to\s+(\d+) of\s+(\d+) facts sit on a support cycle/.exec(t);
  assert.ok(closure, 'the precision check must report on the closure');
  assert.ok(Number(closure[1]) > 0, 'the naive rule condemns harmless kernel facts');
});

test('03 metadep — the closure is immune to data, the edb reader is not', () => {
  const lines = out('03', metadep).split('\n');
  const val = (line: string, rel: string) =>
    Number(new RegExp(`\\b${rel}=(\\d+)`).exec(line)![1]);
  /** Did that relation's reuse fingerprint move on that mutation? */
  const moved = (line: string, rel: string) =>
    new RegExp(`\\b${rel}=\\d+\\*`).test(line);
  const [base, existing, newRel, newPersp, authored] = lines;
  // THE RULE-SHAPED HALF. This was `dep`, `dep_neg` and `reach` until boot.rofl
  // stopped deriving them; `flow`/`flows_to` is the closure that remains, over
  // the same rule reflection, and it is immune in the same way — in the count
  // AND in the key, which is the quantity the cache is built on.
  for (const rel of ['flow', 'flows_to']) {
    for (const l of [existing, newRel, newPersp, authored]) {
      assert.equal(val(l, rel), val(base, rel), `${rel} must not move for any data change`);
      assert.equal(moved(l, rel), false, `${rel}'s key must not move for any data change`);
    }
  }
  // THE DECLARATION-SHAPED HALF, which was `stratum` — every stratum bottomed
  // out in `stratum(Rel, 0) :- edb(Rel)`. `undefined_premise` reads the same
  // `edb` marks and carries the same key. It is an audit that fires on nothing
  // here, so its COUNT can never move; the key is where the width shows, which
  // is why the fragment prints it.
  assert.equal(moved(existing, 'undefined_premise'), false, 'an existing relation moves nothing');
  assert.equal(moved(newRel, 'undefined_premise'), true, 'a new relation moves the edb reader');
  assert.equal(moved(newRel, 'sees'), false, 'and does not move visibility');
  assert.ok(val(newPersp, 'sees') > val(newRel, 'sees'), 'a new perspective moves sees');
  assert.equal(moved(newPersp, 'sees'), true);
  assert.equal(val(authored, 'forged'), 1, 'an authored fact fires the forgery audit');
  assert.equal(moved(existing, 'forged'), true, 'forged is per-fact: nothing about it is cacheable');
});

test('04 false miss — the same question, two instruments, opposite answers', () => {
  const t = out('04', falseMiss);
  // The instrument that skips binary files answers with nothing at all about a
  // file with three exports. That IS the fragment; if it ever starts warning,
  // the lesson weakens and the text must change.
  assert.match(t, /\/usr\/bin\/grep -I -c\s+3\s+\[exit 0\]\s+\(NOTHING AT ALL\)\s+\[exit 1\]/);
  assert.match(t, /\/usr\/bin\/grep -c\s+3\s+\[exit 0\]\s+3\s+\[exit 0\]/);
  // The replacement gate reads bytes and does say no.
  assert.match(t, /1 violation\(s\)/);
  assert.match(t, /withnul\.ts: NUL byte/);
});

test('05 diverging semiring — the probe outlived its subject, and now guards it', () => {
  const lines = out('05', diverging).split('\n');
  assert.match(lines[0], /tick=0\s+domain facts=7\s+INFINITE=0\s+self-supported=0/);
  assert.match(lines[1], /solo\(z\), which cites nothing = 1/);
  // One tick later the same fact, still with exactly one origin, recorded
  // INFINITE when this fragment was written — six of the seven did. The fold
  // is about one tick now, so a fact that arrived over the boundary is a given.
  assert.match(lines[2], /tick=1\s+domain facts=7\s+INFINITE=0\s+self-supported=3/);
  assert.match(lines[3], /solo\(z\), which cites nothing = 1/);
  assert.match(lines[4], /tick=3\s+domain facts=7\s+INFINITE=0\s+self-supported=3/);

  // THE DISCRIMINATING LINE, and the reason the fragment kept running. Three
  // different folds print `INFINITE=0` above — the fixed one, one that walked
  // no support at all, and one that stopped detecting cycles — so that number
  // is not evidence by itself. The control puts both kinds of loop in ONE
  // store: only the fix answers 1 for the fact carried over the boundary AND
  // INFINITE for the citation cycle inside the tick. Measured against two
  // mutants: the pre-fix fold prints INFINITE for the carried fact, and the
  // fix with cycle closure disabled prints 30 for the cycle — a number that
  // moves with the round cap.
  assert.match(lines[6], /control, same store plus a citation cycle/);
  assert.match(lines[7], /cite\(a,b\), carried over the boundary = 1\b/);
  assert.match(lines[7], /hop\(p,p\), a cycle inside the tick = INFINITE/);
});

test('06 stale model — the spread the probe was written for is gone', () => {
  // WHY THIS IS NOT A STOPWATCH ANY MORE. It was `spread < 3`, a ratio of
  // three wall-clock timings, and it FAILED at 3.0x under the full suite on
  // the day an argument index landed in src/store.ts. Nothing regressed: a
  // build here went from ~135 ms to 25-38 ms, the absolute noise of one GC
  // pause did not change, so as a fraction of the measurement it grew about
  // fourfold and the ratio started crossing a threshold calibrated against
  // the slower engine. A ratio-of-timings assertion tightens itself every
  // time the code improves — it is guaranteed to fail eventually ON SUCCESS,
  // and raising the bound only moves the day.
  //
  // The fragment's own claim is structural: all three arrival orders take the
  // identical append path, so the spread is absent BY CONSTRUCTION. An
  // identical path means the arrival order cannot reach the store, and THAT
  // is checkable exactly.
  //
  // What is compared matters. `canonicalState()` SORTS its own key list, so on
  // its own it can only see facts lost or gained, never an index left in the
  // wrong order — it would pass a store whose `relPersp` came back scrambled.
  // The order-sensitive read is `relAll`, whose canonical ordering is the
  // promise `absorb` exists to keep and which `canonicalState`, the goldens
  // and the witness ordering all rest on. Both are asserted, the sequence
  // first.
  //
  // Nothing is left unguarded by the move. The PERFORMANCE invariant this
  // fragment is about (I1) has a permanent home in index-arrival.test.ts §4,
  // where it is a ratio of the same operation in two arrival orders rather
  // than the max over three different key shapes — a paired comparison that
  // does not sharpen as the engine gets faster.
  const n = 8_000;
  const up = [...Array(n).keys()];
  const mixed = [...up];
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
  }
  const fill = (arg: (i: number) => Term, order: number[]): Store => {
    const s = new Store();
    for (const i of order) s.add('f', 'main', [arg(i)], { scope: 'tick', base: true });
    return s;
  };
  // both key shapes the probe timed: integers, whose lexicographic order is
  // scrambled, and zero-padded strings, whose keys ascend with the counter
  for (const [what, arg] of [
    ['integer args', (i: number) => mki(i)],
    ['zero-padded keys', (i: number) => mks(String(i).padStart(8, '0'))],
  ] as [string, (i: number) => Term][]) {
    const a = fill(arg, up);
    const b = fill(arg, mixed);
    assert.equal(a.relCount('f'), n, `${what}: ascending arrival lost facts`);
    assert.equal(b.relCount('f'), n, `${what}: shuffled arrival lost facts`);
    const ka = a.relAll('f').map((f) => f.key);
    const kb = b.relAll('f').map((f) => f.key);
    assert.deepEqual(kb, ka,
      `${what}: the arrival order reached the store; the append path is not identical`);
    assert.deepEqual(ka, [...ka].sort(), `${what}: the run is not canonically ordered`);
    assert.equal(b.canonicalState(), a.canonicalState(), `${what}: canonical state`);
  }
  // and the fragment itself still runs and still reports both, because a
  // catalogue entry whose scanner has stopped answering is the very defect
  // this fragment is about
  const t = out('06', () => stale(16_000));
  assert.match(t, /spread: [\d.]+x/, 'the probe reports a spread');
  assert.match(t, /integer args[^\n]*the same store \(16000 facts\)/);
  assert.match(t, /zero-padded[^\n]*the same store \(16000 facts\)/);
});

test('07 not needed — the comment that answered it is still there', () => {
  const t = out('07', () => notNeeded(1000));
  assert.match(t, /the control cannot see the effect either/);
  // The fragment quotes src/store.ts rather than paraphrasing it, so the quote
  // cannot drift. If the comment moves, this fails and the fragment is fixed.
  assert.match(t, /WHY THE SPLIT/);
  assert.match(t, /the cost of a fact is decided by the ORDER facts arrive in/);
});

test('08 golden accident — every golden program stops at one stratum', () => {
  const t = out('08', goldenAccident);
  const rows = t.split('\n').filter((l) => /^(craft|multi|sensors|wtf)\s/.test(l));
  assert.equal(rows.length, 4);
  // columns: name, in-golden, relations, MAX ROUND, distinct rounds — read
  // from the left, because the wtf row carries a trailing annotation.
  const depth = (name: string) => {
    const l = rows.find((r) => r.startsWith(name))!;
    return Number(l.trim().split(/\s+/)[3]);
  };
  // Three, not one and not two. `boot.rofl` gained a second negation level when
  // the collection graph landed (`collects_from` negates `perspective`, and
  // `leak` negates `gathered`, which rides on it), and one more when the depth
  // started being counted in WAKE-UP ROUNDS instead of read off `stratum/2` —
  // a round is a wave, so a relation with nothing negated below it sits at 1
  // rather than at 0 with the base facts. The fragment's claim is about the
  // SHALLOWNESS of the golden set relative to what it missed, and it survives
  // both shifts — which is why the ratio below is what is asserted and the
  // absolute number is only pinned so a drift is noticed.
  for (const g of ['craft', 'multi', 'sensors']) {
    assert.equal(depth(g), 3, `${g} stops three round boundaries in`);
  }
  assert.ok(depth('wtf') > depth('craft') * 4,
    'the program the goldens missed is an order deeper than the ones they covered');
});

test('09 wrong premise — nothing vanished, and the real defect is repaired', () => {
  const t = out('09', wrongPremise);
  assert.match(t, /non-range-restricted rules : risky/);
  assert.match(t, /risky facts in the store\s+: 2/);
  assert.match(t, /of those, annotated by the fold: 2/);
  // Both sides return 1 now. Before the repair the demand-backed side was 2.
  assert.match(t, /demand-backed\s+: 1/);
  assert.match(t, /range-restricted : 1/);
});

test('hygiene — MOOT condemns a dead audit and spares the retained one', () => {
  const t = out('hy', hygiene);
  // WHAT MOVED, and why this is the fix landing rather than the check
  // rotting. The fragment found `forged[audit]` dead because nothing
  // populated `asserted_by` — it answered 'clean' to every program in the
  // repository and would have answered 'clean' to a forged fact. That is
  // closed: `factMetaFacts` now signs EVERY asserted fact (src/reflect.ts),
  // so `asserted_by` and `forged` are live from the bare file up and have
  // left the dead list.
  //
  // Their place is taken by the opt-in pair `demands_authorship` /
  // `unattributed`, dead for the same reason the COLLECTION GRAPH is —
  // host data that a bare boot.rofl does not declare. The count stays 7.
  //
  // STALE PROSE, DELIBERATELY NOT EDITED HERE: the paragraph
  // examples/yak/fragments/hygiene.ts prints after these numbers still says
  // `forged[audit]` is among the dead and reads a trail 'nothing here
  // populates'. That sentence is now false. It is narrative in examples/,
  // outside the file set this change was scoped to, so it is reported rather
  // than rewritten — the numbers below are the measured truth and the prose
  // needs its author.
  // `imports` HAS LEFT THE DEAD LIST, and that is a changed fact about the
  // language rather than a test to re-baseline. It was dead because a bare
  // boot.rofl declared `edb(imports)` and then never wrote a row: the import
  // graph was host data that the kernel itself had no use for, because
  // `crossing` carried `not bridge_decl(R, A, B)` and the kernel EMITTED that
  // row for any rule whose head named a ledger and whose body read another.
  // Every audit rule in boot.rofl licensed its own read by existing, so the
  // one mechanism an author could actually write was the one nothing used.
  //
  // With `bridge_decl` gone, boot.rofl has to say out loud what its nine audit
  // rules do — `imports(audit, main).` — and the relation is populated from
  // the bare file up. The list is 6 where it was 7.
  //
  // TWO rules came alive, not one, and the second is the interesting half:
  // `sees(P, Q) :- imports(P, Q).` AND `sees(P, Q) :- imports(P, X),
  // sees(X, Q).`, the transitive step. The closure of the import graph had
  // never once been exercised by a program that loads only boot.rofl. The
  // count is 5 where it was 7.
  assert.match(t, /unreachable relations: collected collects collects_from demands_authorship gathered unattributed/);
  assert.doesNotMatch(t, /unreachable relations:[a-z_ ]*\bimports\b/,
    'imports is populated by boot.rofl now — a licence nobody writes is what this list is for');
  assert.match(t, /rules that can never fire in this store: 5/);
  assert.match(t, /concluding unattributed/);
  assert.doesNotMatch(t, /concluding forged/,
    'the forgery audit is no longer dead — that is the whole repair');
  // The rule fragment 01 left behind is alive. This is the question the pass
  // was run to answer, so it is pinned rather than read off the prose.
  assert.doesNotMatch(t, /concluding undefined_premise/);
});

// ---------------------------------------------------------------------------
// the bookkeeping: no fragment claims evidence it does not have

/** The catalogue table, parsed out of README.md. */
function catalogue(): { id: string; mode: string; label: string; fate: string; evidence: string; scanner: string }[] {
  return README.split('\n')
    .filter((l) => /^\| \d\d \| /.test(l))
    .map((l) => {
      const c = l.split('|').map((x) => x.trim());
      return { id: c[1], mode: c[2], label: c[3], fate: c[4], evidence: c[5], scanner: c[6] };
    });
}

test('the catalogue and demo.ts agree on every fragment', () => {
  const rows = catalogue();
  assert.equal(rows.length, FRAGMENTS.length, 'same number of fragments in both');
  for (const [i, row] of rows.entries()) {
    const f = FRAGMENTS[i];
    assert.equal(row.id, f.id);
    assert.equal(row.mode.toLowerCase(), f.mode.toLowerCase(), `fragment ${row.id} mode`);
    assert.equal(row.label, f.label, `fragment ${row.id} label`);
    assert.equal(row.fate, f.fate, `fragment ${row.id} fate`);
  }
});

test('every fragment marked CONFIRMED has an artefact behind it', () => {
  for (const row of catalogue()) {
    assert.equal(row.evidence, 'CONFIRMED', `fragment ${row.id} carries an evidence mark`);
    if (row.scanner.startsWith('none')) {
      // A fragment with no scanner must be the one demo.ts also says has none,
      // and it must say what cannot be replayed rather than staying silent.
      const f = FRAGMENTS.find((x) => x.id === row.id)!;
      assert.equal(f.run, null, `fragment ${row.id} claims no scanner; demo.ts must agree`);
      assert.ok(f.unreplayable, `fragment ${row.id} must say what cannot be replayed`);
      continue;
    }
    const file = row.scanner.replace(/`/g, '');
    assert.ok(fs.existsSync(path.join(YAK, file)), `fragment ${row.id}: ${file} must exist`);
    const f = FRAGMENTS.find((x) => x.id === row.id)!;
    assert.ok(f.run, `fragment ${row.id} names a scanner; demo.ts must run it`);
  }
});

test('no predicted mode is written up as a fragment', () => {
  // The spec's own boundary: modes with no run go one line each into "What to
  // expect" and never get a fragment heading. Every "## NN — " heading must
  // therefore correspond to a catalogue row.
  const headings = [...README.matchAll(/^## (\d\d) — /gm)].map((m) => m[1]);
  const ids = catalogue().map((r) => r.id);
  assert.deepEqual(headings, ids, 'every fragment heading is a catalogued fragment');
  const expect = README.slice(README.indexOf('## What to expect'));
  assert.doesNotMatch(expect, /^## \d\d — /m, 'nothing in "What to expect" is written up as a fragment');
});

test('the labels are only the two that mean a real run happened', () => {
  for (const row of catalogue()) {
    assert.ok(['caught', 'provoked'].includes(row.label),
      `fragment ${row.id}: "${row.label}" is not a label that means a run exists`);
  }
});

test('discarding is shown, not just retention', () => {
  const fates = catalogue().map((r) => r.fate);
  const discarded = fates.filter((f) => f === 'discarded').length;
  assert.ok(discarded > fates.length / 2,
    'most scanners must die with their task, or the catalogue teaches hoarding');
});

test('the mandatory fragments are present', () => {
  const modes = catalogue().map((r) => r.mode);
  assert.ok(modes.includes('false miss'), 'the false-miss fragment is mandatory');
  assert.ok(modes.includes('the scanner was not needed'),
    'without the abstention fragment the demonstration is unfalsifiable');
  assert.match(README, /### The criterion of abstention/,
    'abstention needs a stated criterion, not a wish');
});
