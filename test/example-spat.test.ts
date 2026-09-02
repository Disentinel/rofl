// example-spat.test.ts — SPAT: a real family week (examples/spat/).
//
// SMALL ON PURPOSE, and the reason is measured: one world costs 4.7 s to
// build on a quiet machine (3.1 s of that is boot.rofl's own `reach`
// transitive closure over the rule dependency graph, 1.6 s is this model),
// and a perturbation cannot reuse it — any base-fact change discards the
// derived layer and re-runs the fixpoint from scratch (LIMITS.md). So every
// assertion here rides on ONE shared world, and what needs a second world is
// exercised by the CLI and listed as uncovered in the README rather than
// padded in here.
//
// What earns its place:
//   1. the model loads and boot's audits stay empty, `undefined_premise` too;
//   2. no rule is demand-backed — otherwise the Boolean answers stay right
//      while every semiring number describes a different fact set;
//   3. THE ZERO-SLACK CHAIN: физио ends 13:20, забор детей starts 13:25, on
//      Mondays and Fridays. A Boolean answer says FEASIBLE and hides exactly
//      this, and the family's own schedule flags it in prose;
//   4. one uncovered child, with the constraint AND the owner for each person
//      who could have been there and was not.
//
// Two more ride free on the same world: the counting semiring checked against
// the rows (a projection rule silently multiplied it once, and only this
// caught it), and the weekday difference being derived rather than written
// out five times.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import {
  world, table, holes, chains, whoWasBusy, whynot, ownerOf, folds, hhmm, ru, blocks,
} from '../examples/spat/spat.ts';
import { weekHtml } from '../examples/spat/html.ts';

// THE TEST RUNS AGAINST THE SHIPPED EXAMPLE, never against `week.rofl`.
// A real household's week is gitignored, so a suite that read the default
// would pass on this machine and fail on every other one - and would also
// mean the repository's green tick depended on somebody's family.
const EXAMPLE = new URL('../examples/spat/week.example.rofl', import.meta.url).pathname;
const example = (): Rofl => world(EXAMPLE);

let r: Rofl;
before(() => { r = example(); });

test('the model loads and every audit boot.rofl runs stays empty', () => {
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)',
    'undefined_premise[audit](R, Rel)']) {
    assert.deepEqual(r.query(audit).rows, [], audit);
  }
});

test('nothing is demand-backed: every rule materialises', () => {
  const ev = new Evaluation(r.store, {});
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), [],
    'a rule that is not range-restricted is unfolded top-down at call sites, so '
    + 'the relation sits outside the world the semirings fold over');
  assert.equal(ev.demandRels.size, 0);
});

test('THE ZERO-SLACK CHAIN: физио 13:20 against забор детей 13:25, Mon and Fri', () => {
  assert.deepEqual(
    table(r, 'zero_slack', 'P, D, E1, E2').map((x) => `${x.D} ${x.P} ${x.E1}->${x.E2}`).sort(),
    ['fri robin physio->pickup', 'mon robin physio->pickup']);

  // it is DERIVED, to the minute, from three facts and nothing else — the
  // coverage grid is not involved, so no amount of coarsening can lose it
  const span = (ev: string, d: string) =>
    table(r, 'span', 'C, E, W, P, D, F, T').find((x) => x.E === ev && x.D === d)!;
  const физио = span('physio', 'mon');
  const pickup = span('pickup', 'mon');
  const journey = table(r, 'tt', 'A, B, M')
    .find((x) => x.A === физио.P && x.B === pickup.P)!;
  assert.equal(Number(физио.T), 800, '13:20');
  assert.equal(Number(pickup.F), 805, '13:25');
  assert.equal(Number(pickup.F) - Number(физио.T) - Number(journey.M), 0);
  assert.equal(chains(r).find((c) => c.day === 'mon' && c.a === 'physio')!.m, 0);

  // and a Boolean answer really would hide it: nothing here is infeasible
  assert.deepEqual(table(r, 'negative_slack', 'P, D, A, B'), []);
  assert.equal(table(r, 'broken', 'R').some((x) => x.R === 'no_time'), false);

  // the tropical fold gives the minimum of each person's day — an aggregation
  // the kernel deliberately does not have (START.md section 8)
  assert.equal(folds(r).tight.get('day_tight[main](robin,mon)'), 0);
  assert.equal(folds(r).tight.get('day_tight[main](alex,mon)'), 5);
});

test('an uncovered child names the constraint AND its owner, not "infeasible"', () => {
  const hs = holes(r);
  assert.equal(hs.length, 2, 'both children, one window');
  for (const h of hs) {
    assert.equal(h.day, 'thu');
    assert.equal(`${hhmm(h.from)}–${hhmm(h.to)}`, '17:40–18:20');
  }
  assert.deepEqual(hs.map((h) => h.child).sort(), ['kit', 'nico']);

  // who could have been there, what took each of them, and whose it is —
  // all read out of `out_why/4`, which the rules derive
  const by = new Map(whoWasBusy(r, 'thu', 1080).map((b) => [b.person, b.why]));
  assert.deepEqual(by.get('alex'), ['c_acme']);
  assert.deepEqual(by.get('robin'), ['c_swim']);
  assert.deepEqual(by.get('nanny'), ['not_present']);
  assert.deepEqual(ownerOf(r, 'c_acme'), { owner: 'acme', scope: 'external' });
  assert.deepEqual(ownerOf(r, 'c_swim'), { owner: 'robin', scope: 'household' });
  assert.deepEqual(ownerOf(r, 'c_nanny'), { owner: 'nanny', scope: 'external' });

  const text = whynot(r, 'nico', 'thu', 1080);
  assert.match(text, /НЕ ПОКРЫТ/);
  assert.match(text, /c_acme\s+acme\s+ВНЕШНЕЕ/);
  assert.match(text, /c_swim\s+robin\s+наше/);
  assert.match(text, /whynot any_duty\[main\]\(thu,1080\)/);
  assert.match(text, /out\[main\]\(robin,thu,1080\) holds/);
  assert.deepEqual(table(r, 'broken', 'R').map((x) => x.R), ['uncovered']);
});

test('counting IS the number of people who could take it', () => {
  const f = folds(r);
  const byslot = new Map<string, number>();
  for (const x of table(r, 'on_duty', 'P, D, S')) {
    const k = `${x.D},${x.S}`;
    byslot.set(k, (byslot.get(k) ?? 0) + 1);
  }
  assert.ok(byslot.size > 100, `${byslot.size} slots`);
  for (const [k, n] of byslot) {
    assert.equal(f.count.get(`any_duty[main](${k})`), BigInt(n), k);
  }
  // this one is not decoration: `needy` written as a plain projection has one
  // derivation per CHILD, and that multiplicity rode through `here` and
  // `on_duty` into the fold, which reported two coverers as four. Every
  // Boolean answer was correct; only this comparison found it.
});

test('the weekday difference is derived, not written out five times', () => {
  const school = table(r, 'usual', 'C, E, W, P, Sp, F, T')
    .filter((x) => x.E === 'school_kit');
  assert.equal(school.length, 1, 'the school day is one fact');
  assert.equal(school[0].Sp, 'weekdays');
  assert.equal(table(r, 'usual_on', 'C, E, D, F, T')
    .filter((x) => x.E === 'school_kit').length, 1, 'plus one exception');
  const sp = table(r, 'span', 'C, E, W, P, D, F, T').filter((x) => x.E === 'school_kit');
  assert.equal(sp.length, 5);
  assert.deepEqual(sp.filter((x) => x.T === '800').map((x) => x.D), ['fri'],
    'and Friday genuinely ends earlier, everywhere downstream');
});

// ---------------------------------------------------------------------------
// THE GRID IS A VIEW, AND A VIEW CAN LIE
//
// `spat html` draws the week as a board people print and hang up, and a
// drawing is exactly the kind of artefact that drifts: a filter added to the
// renderer, a merge that swallows a block, and the page stays beautiful while
// saying something the rules never derived. There is an exact oracle for it
// and it is free - THE SAME WORLD, RENDERED TWICE. So the grid is checked
// against the relations it claims to display, not against a golden file.
//
// The planted defect is in the test rather than beside it: the control below
// corrupts the markup and requires the count to MOVE. Without it a renderer
// that emitted nothing at all would pass both assertions on a week with no
// blocks, and the gate would be an assumption wearing a test's face.

test('TRAVEL IS A CONDITION, not a number, and the week reads under one', () => {
  // "зависит от трафика, от того как активно я жму на газ", "сегодня на
  // расслабоне", "ехали по длинному, не дворами" - one drive, three sources of
  // variation, and `travel/3` carries one integer. A figure measured on a
  // quiet morning by the long way round is one sample of one condition, and
  // every slack in the week rested on it.
  //
  // BOTH DIRECTIONS: a named condition must MOVE the answer, and a household
  // that never names one must see nothing change.
  const plain = example();
  const before = table(plain, 'tt', 'A, B, M')
    .find((x) => x.A === 'home' && x.B === 'school');
  assert.ok(before !== undefined, 'the ordinary travel fact still answers');

  const under = example();
  assert.equal(under.assert('assume(rush). travel_as(rush, home, school, 44).').ok, true);
  const after = table(under, 'tt', 'A, B, M')
    .find((x) => x.A === 'home' && x.B === 'school');
  assert.equal(Number(after?.M), 44, 'the assumed condition displaces the bare number');
  assert.notEqual(Number(after?.M), Number(before?.M), 'and it really is a different answer');

  // the reverse direction too - `tt` is symmetric under a condition, as it is
  // without one, or a return trip would silently keep the old figure
  const back = table(under, 'tt', 'A, B, M')
    .find((x) => x.A === 'school' && x.B === 'home');
  assert.equal(Number(back?.M), 44, 'the return leg moves with it');

  // a pair with no condition named keeps its ordinary number
  const other = table(under, 'tt', 'A, B, M')
    .find((x) => x.A === 'home' && x.B === 'sadik');
  const otherPlain = table(plain, 'tt', 'A, B, M')
    .find((x) => x.A === 'home' && x.B === 'sadik');
  assert.equal(Number(other?.M), Number(otherPlain?.M),
    'an unmeasured pair is untouched: naming one condition does not blank the rest');

  // THE ENVELOPE, which is the durable statement a measurement sits inside
  const budgets = table(plain, 'travel_budget', 'P, D, E1, E2, Max');
  assert.ok(budgets.length > 0, 'every handover states how much driving it can absorb');
  for (const b of budgets) {
    const sl = chains(plain).find((c) => c.day === b.D && c.who === b.P
      && c.a === b.E1 && c.b === b.E2);
    if (sl === undefined) continue;
    const spent = Number(b.Max) - sl.m;
    assert.ok(spent >= 0, `${b.P}/${b.D}: driving spent is not negative`);
    assert.equal(Number(b.Max) - spent, sl.m,
      'budget minus what the drive costs IS the slack, by construction');
  }
});

test('THE DAILY TOTAL IS SUMMED IN RULES, and the requirement can say no', () => {
  // PORTED FROM examples/slop, which folds a spreadsheet range with two rules
  // over a chain because the kernel has no aggregation. The paragraph in
  // spat.rofl said the sum had to be host-side; it did not, and this is the
  // proof. One difference in our favour: SLOP's host lays the chain out, since
  // a range is given by the text of a formula. Here blocks carry times, so
  // the chain is derived too - `work_next` is the immediate successor, and
  // negating the two-hop composition is what makes a partial order a chain.
  const w = example();
  const totals = table(w, 'day_work', 'P, D, M')
    .filter((x) => x.P === 'alex').map((x) => Number(x.M));
  assert.ok(totals.length > 0, 'the fold produced a total for at least one day');

  // it agrees with the host arithmetic it replaces, day for day
  for (const row of table(w, 'day_work', 'P, D, M')) {
    const mins = table(w, 'span', 'C, E, W, P, D, F, T')
      .filter((x) => x.W === row.P && x.D === row.D
        && table(w, 'kind', 'E, K').some((k) => k.E === x.E && k.K === 'work'))
      .reduce((n, x) => n + (Number(x.T) - Number(x.F)), 0);
    assert.equal(Number(row.M), mins,
      `${row.P}/${row.D}: the chain fold and plain arithmetic agree`);
  }

  // BOTH DIRECTIONS, with the thresholds taken from the data rather than
  // invented: at the shortest day nothing is short, one minute above it
  // something must be. A gate that has never said no is an assumption.
  const lo = Math.min(...totals);
  const yes = example();
  assert.equal(yes.assert(`work_needed(alex, ${lo}).`).ok, true);
  assert.equal(table(yes, 'short_day', 'P, D, M, N').length, 0,
    `at ${lo} minutes no day falls short`);

  const no = example();
  assert.equal(no.assert(`work_needed(alex, ${lo + 1}).`).ok, true);
  const short = table(no, 'short_day', 'P, D, M, N');
  assert.ok(short.length > 0, `at ${lo + 1} minutes at least one day falls short`);
  assert.ok(table(no, 'broken', 'R').some((x) => x.R === 'short_day'),
    'and a short day makes the week not add up, not merely a number in a report');

  // and with NO requirement the household pays nothing for the machinery
  assert.equal(table(w, 'short_day', 'P, D, M, N').length, 0,
    'no `work_needed` fact, no reason - the same shape as `give/2`');
});

test('the grid carries exactly the blocks and holes the rules derived', () => {
  const html = weekHtml(r, { standalone: true });
  const n = (re: RegExp): number => (html.match(re) ?? []).length;

  assert.equal(n(/class="b(?: thin)?"/g), blocks(r).length,
    'every span the rules derived is drawn, and nothing else is');
  assert.equal(n(/class="hole"/g), holes(r).length,
    'every uncovered interval is drawn, and no interval is invented');

  // CONTROL: the counter must be able to say no.
  const spoiled = html.replace('class="hole"', 'class="hole-x"');
  assert.notEqual((spoiled.match(/class="hole"/g) ?? []).length, holes(r).length,
    'a planted corruption must move the count, or the count proves nothing');

  // THE RED BLOCK NAMES ITS CHILD IN ITSELF. A page-wide `includes` was the
  // first draft and a mutant walked through it: the child is named in the
  // panels too, so blanking the name inside the block left the check green.
  // The assertion is anchored to the element, which is the only place the
  // person reading the printout will look.
  for (const h of holes(r)) {
    assert.ok(html.includes(
      `<b>${ru(h.child)}</b><span>${hhmm(h.from)}\u2013${hhmm(h.to)}</span>`),
      `the red block itself says ${ru(h.child)}, ${hhmm(h.from)}-${hhmm(h.to)}`);
  }
  // THE ZERO-SLACK CHAINS are the second thing a Boolean answer hides, and
  // this assertion was WRONG until a mutant said so: `0 \u043c\u0438\u043d` is a substring of
  // `10 \u043c\u0438\u043d`, so dropping the whole panel left the check green. The cell
  // delimiters make the match exact, which is the difference between a gate
  // and a decoration.
  for (const c of chains(r).filter((x) => x.m <= 0)) {
    assert.ok(html.includes(`>${c.m} \u043c\u0438\u043d<`),
      `the grid states the ${c.m}-minute handover in a cell of its own`);
  }
});

test('POSITION: every block lands in its own day column at its own minute', () => {
  // ASKED WHERE THE COUNT CANNOT LOOK, and the answer was: at position. A
  // renderer that drew every block at top:0, or in the wrong day, or outside
  // the window so `overflow:hidden` ate it, keeps both counts exact. Those are
  // the failures a printed schedule cannot survive, so they get their own
  // oracle: the geometry is DERIVED here a second way and compared.
  const html = weekHtml(r, { standalone: true });
  const bs = blocks(r);
  const hs = holes(r);
  const times = [...bs.flatMap((b) => [b.from, b.to]), ...hs.flatMap((h) => [h.from, h.to])];
  const lo = Math.floor(Math.min(...times) / 60) * 60;
  const hi = Math.ceil(Math.max(...times) / 60) * 60;
  const span = hi - lo;

  // split the page into day columns, in the order the renderer emitted them
  const cols = html.split('<div class="day">').slice(1);
  const dayOf = cols.map((c) => c.slice(c.indexOf('class="dh">') + 11).split('<')[0]);
  const wantDays = new Set([...bs.map((b) => b.day), ...hs.map((h) => h.day)].map(ru));
  assert.deepEqual(new Set(dayOf), wantDays, 'one column per day that has anything in it');

  let checked = 0;
  for (const b of bs) {
    const i = dayOf.indexOf(ru(b.day));
    assert.notEqual(i, -1, `${ru(b.day)} has a column`);
    const want = `top:${(((b.from - lo) / span) * 100).toFixed(3)}%;`
      + `height:${(((b.to - b.from) / span) * 100).toFixed(3)}%`;
    assert.ok(cols[i].includes(want),
      `${ru(b.who)}/${ru(b.ev)} ${hhmm(b.from)} sits at its own minute in ${ru(b.day)}`);
    checked++;
  }
  assert.equal(checked, bs.length);

  // AND THE SAME FOR THE RED BLOCKS. Checked separately because a mutant
  // that moved every hole into Monday's column passed everything above: the
  // count was right, the element said the right child and the right window,
  // and only the COLUMN was wrong. Position was verified for blocks and not
  // for holes, which is the one place a printed schedule must not be wrong.
  for (const h of hs) {
    const i = dayOf.indexOf(ru(h.day));
    assert.notEqual(i, -1, `${ru(h.day)} has a column`);
    assert.ok(cols[i].includes(
      `<b>${ru(h.child)}</b><span>${hhmm(h.from)}\u2013${hhmm(h.to)}</span>`),
      `${ru(h.child)}'s hole is drawn in ${ru(h.day)}, not in another day`);
    assert.ok(cols[i].includes(`top:${(((h.from - lo) / span) * 100).toFixed(3)}%;`
      + `height:${(((h.to - h.from) / span) * 100).toFixed(3)}%`),
      `${ru(h.child)}'s hole sits at ${hhmm(h.from)} and lasts as long as it lasts`);
  }

  // NOTHING MAY BE CLIPPED: a percentage outside [0, 100] is a block the
  // reader never sees, and `overflow:hidden` makes that silent.
  for (const m of html.matchAll(/top:(-?[\d.]+)%;height:([\d.]+)%/g)) {
    const top = Number(m[1]); const h = Number(m[2]);
    assert.ok(top >= 0 && top + h <= 100.001, `a block at ${top}% + ${h}% is inside the board`);
  }

  // The mutants that prove this gate can say no are run against html.ts
  // itself and recorded in facts/findings.rofl: flatten every top to 0, put
  // every block in the first column, drop the holes loop, freeze the window.
});

test('the grid prints every reason the model calls the week broken', () => {
  // FOUND BY COMPARING THE TWO OUTPUTS, not by a failing test: `spat check`
  // reported `double_booked` on a real week and the grid was silent about it,
  // because the renderer drew blocks and holes and nothing else. A printout
  // that hides a failure the model located reads as a clean week.
  const html = weekHtml(r, { standalone: true });
  const broke = table(r, 'broken', 'R').map((x) => x.R);
  assert.ok(broke.length > 0, 'this week is broken, so the assertion has something to bite on');
  for (const b of broke) {
    // ANCHORED TO THE SECTION, not to the page. The bare phrase also stands in
    // the header, so a page-wide `includes` stayed green with the whole panel
    // removed - the fourth time in this file that a loose match could not say
    // no. The heading is the thing being tested, so the heading is the match.
    assert.ok(html.includes('<h2>\u041d\u0435 \u0441\u0445\u043e\u0434\u0438\u0442\u0441\u044f</h2>'),
      'the panel that lists the reasons exists, not merely the phrase');
  }
  // THE REASON IS NAMED INSIDE THE PANEL, and the panel agrees with the
  // header. A disjunction over phrases anywhere on the page let two separate
  // reads of `broken` contradict each other in silence.
  const panel = html.slice(html.indexOf('<h2>\u041d\u0435 \u0441\u0445\u043e\u0434\u0438\u0442\u0441\u044f</h2>'));
  const head = html.slice(0, html.indexOf('<div class="legend">'));
  for (const b of broke) {
    assert.ok(/<p class="brk">[^<]+<\/p>/.test(panel), 'the panel lists reasons');
    for (const scope of [panel, head]) {
      assert.ok(scope.includes(b) || /\u0440\u0435\u0431\u0451\u043d\u043e\u043a|\u043c\u0435\u0441\u0442\u0430\u0445|\u043f\u0435\u0440\u0435\u0435\u0437\u0434|\u043e\u0442\u0432\u0435\u0437\u0442\u0438/.test(scope),
        `${b} is named in both the header and the panel, which must not disagree`);
    }
  }
});

test('the grid is a document, not a fragment: one title, no orphan colours', () => {
  const page = weekHtml(r, { standalone: true });
  assert.match(page, /^<!doctype html>/, 'standalone output is a document');
  assert.equal((page.match(/<title>/g) ?? []).length, 1);

  // AS AN ARTIFACT the page is wrapped by the host, so it must carry no
  // document scaffolding of its own - measured, because the two modes differ
  // by one branch and nothing else would notice if that branch inverted.
  const frag = weekHtml(r, { standalone: false });
  for (const tag of ['<!doctype', '<html', '<head', '<body']) {
    assert.ok(!frag.toLowerCase().includes(tag), `the fragment carries no ${tag}`);
  }
  assert.ok(frag.includes('<title>'), 'the fragment still names itself');
});
