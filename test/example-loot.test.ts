// examples/loot — the LOOT demo, run as a test so it cannot rot.
//
// Every assertion here is the demo's own: the shelf verdicts before a rule
// runs, the two walks down one road, the quarantine diff checked a second time
// by `excise`, the eight poisonings, the four improvements, the attribution
// folded off the kernel's own provenance, the unload and its fade, and the one
// place content-addressed rule identity leaks — which is measured here rather
// than asserted, because it is the finding this example reports.
//
// The oracle differs per claim, and none of them is the rules re-run:
//   the fork diff        against `excise rule(R)` on the installed world
//   pack attribution     against `derived_by` joined with the manifest, and
//                        against the belief simply disappearing when unloaded
//   the mute pack        against boot.rofl's own `undefined_premise` audit
//   the rename leak      against the counting semiring, which sees two
//                        derivations where a reader would say one

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { parseProgram } from '../src/parser.ts';
import { ruleIdOf } from '../src/reflect.ts';
import { renderCount } from '../runtime/semirings.ts';
import {
  BOOT, LOOT, BOOKS, BOOK, ROUTE, THINKING, START,
  world, shelve, install, readBook, compat, manifestOf, declaredIds,
  quarantine, beliefs, unload, ownersOf, packProvenance, renderPacks,
  proofCost, beliefCounts, ruleDiff, edition, walk, hygiene, firings,
  CODEX_V1, CODEX_V2, CODEX_RENAMED, rows, col, stateFacts,
} from '../examples/loot/demo.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BIG = 4_000_000;

// one world per shape; each is a full fixpoint, so they are built once
const base = world();
const careful = walk(true);
const reckless = walk(false);

/** The world of the transcript's §6: five books swallowed, the version-gapped
 *  bestiary among them. Shared by the attribution, the whynot and the
 *  contradiction tests. */
const SWALLOWED = ['codex_of_thorns', 'grimoire_of_ash', 'hexers_marginalia',
  'dead_mans_ledger', 'old_bestiary'];
const swallowed = world({ at: 'troll_bridge', carries: ['sword'], wounded: false });
for (const id of SWALLOWED) readBook(swallowed, BOOK.get(id)!, { budget: BIG });

const WATCH = [
  'threat', 'harmless', 'suspect', 'safe', 'opens', 'unjudged', 'confused',
  'known_pack', 'mute', 'installable', 'fired', 'dead_rule',
  'gives', 'takes_away', 'accept', 'refuse',
];

/** The headline demonstration, pinned line for line. The rule ids in it are
 *  content hashes of loot.rofl's and the Hexer's Marginalia's clauses, so
 *  editing either forces this expectation — and the README and the page that
 *  quote it — to be redone. That is the versioning claim of this example
 *  applied to the example's own text. */
const HEADLINE = [
  'whynot opens[mind](supply_chest):',
  '  rule r8f5f8191: opens[mind](?C)@now :- container[world](?C)@now, safe[mind](?C)@now, at[world](?R)@now, here[world](?C,?R)@now',
  '    failed premise: safe[mind](supply_chest)',
  '      rule r080165dd: safe[mind](?C)@now :- container[world](?C)@now, not suspect[mind](?C)@now',
  '        failed premise: not suspect[mind](supply_chest) -- blocked: suspect[mind](supply_chest) holds',
  '      rule r5dcbb40a: safe[mind](?C)@now :- container[world](?C)@now, ward_glyph[world](?C)@now',
  '        failed premise: ward_glyph[world](supply_chest)',
  '          no rule concludes \'ward_glyph\' and no matching base fact exists',
];

// ---------------------------------------------------------------------------
// hygiene: everything else in this file is about a different program if this
// fails, so it is first

test('every rule is range-restricted, nothing is demand-evaluated, nothing is unstratifiable', () => {
  const h = hygiene(base, WATCH);
  assert.equal(h.allSafe, true,
    'an unsafe rule would be unfolded top-down and the folds below would run over a different fact set');
  assert.equal(h.demandRels, 0);
  assert.deepEqual(h.unstratified, []);
});

test("boot.rofl's own audits over LOOT's reflection are all empty", () => {
  const h = hygiene(base, WATCH);
  assert.deepEqual(h.audits, {
    malformed: 0, breach: 0, leak: 0, forged: 0, unmoded: 0, undefined_premise: 0,
  });
});

test('the verdicts land in the rounds the schedule peeled, not in an assumed order', () => {
  const h = hygiene(base, WATCH);
  const lv = Object.fromEntries(h.strata.map((s) => [s.rel, s.level]));
  // A ROUND IS A WAVE, A STRATUM WAS A NEGATION DEPTH, and the numbers differ
  // for that reason alone. boot.rofl's `stratum(Rel, N) :- dep(Rel, Q),
  // stratum(Q, N)` let a derived relation INHERIT its inputs' number, so a
  // relation with no negation anywhere below it sat at 0 beside the base facts.
  // The peel wakes base relations in round 0 and everything a rule concludes in
  // round 1 or later, so those relations moved to 1. Nothing about the ORDER
  // moved, which is what the assertions below check and what the file is about.
  assert.deepEqual(lv, {
    threat: 1, harmless: 1, suspect: 1, safe: 2, opens: 2, unjudged: 2, confused: 1,
    known_pack: 1, mute: 1, installable: 2, fired: 1, dead_rule: 2,
    gives: 1, takes_away: 1, accept: 2, refuse: 1,
  });
  // the ones that carry the file: every relation sits strictly above what it
  // NEGATES, and at the same level as what it merely reads — which is why
  // `opens` is level with `safe` and `refuse` with `takes_away`. Positive
  // dependency inside one round is ordinary recursion and the fixpoint takes
  // it, so a positive premise never lifts a relation out of its wave.
  assert.ok(lv.safe > lv.suspect, 'safe negates suspect');
  assert.ok(lv.unjudged > lv.threat && lv.unjudged > lv.harmless);
  assert.ok(lv.dead_rule > lv.fired, 'the dead-rule audit negates the fired one');
  assert.ok(lv.accept > lv.takes_away, 'acceptance negates a loss');
  assert.ok(lv.installable > lv.mute);
  assert.equal(lv.opens, lv.safe, 'a positive premise does not raise a stratum');
});

test('the native head, before a single book', () => {
  assert.deepEqual(col(base, 'threat[mind](T)', 'T'), ['eel', 'troll']);
  assert.deepEqual(col(base, 'harmless[mind](T)', 'T'), ['bog_stump']);
  assert.deepEqual(col(base, 'suspect[mind](C)', 'C'), ['false_chest']);
  assert.deepEqual(col(base, 'safe[mind](C)', 'C'), ['supply_chest']);
  // the hole the codex closes: moving and glowing is neither of the two cases
  assert.deepEqual(col(base, 'unjudged[audit](T)', 'T'), ['marsh_light', 'wisp']);
  assert.deepEqual(col(base, 'confused[audit](T)', 'T'), []);
});

// ---------------------------------------------------------------------------
// the pack format: judged before a rule of it runs

test('the shelf verdicts are reached from the manifest alone', () => {
  const shelf = world();
  for (const b of BOOKS) shelve(shelf, b);
  const verdict = (id: string) => {
    const c = compat(shelf, BOOK.get(id)!);
    return c.incomplete ? 'torn' : c.versionGap ? 'version' : c.mute ? 'mute' : 'installable';
  };
  assert.equal(verdict('broken_seal'), 'mute');
  assert.equal(verdict('old_bestiary'), 'version');
  const rest = BOOKS.map((b) => b.id).filter((x) => x !== 'broken_seal' && x !== 'old_bestiary');
  for (const id of rest) assert.equal(verdict(id), 'installable', id);
  // and the mute one names the predicate it cannot get
  assert.deepEqual(compat(shelf, BOOK.get('broken_seal')!).missing, ['heat_bloom']);
  assert.deepEqual(compat(shelf, BOOK.get('old_bestiary')!).versionGap, ['1', '2']);
});

test('an incomplete manifest does not install, whichever line is torn out', () => {
  for (const drop of ['pack_extractor', 'pack_rule', 'pack_author']) {
    const r = world();
    const codex = BOOK.get('codex_of_thorns')!;
    const m = manifestOf(codex, { drop: [drop] });
    shelve(r, { ...codex, id: 'a_torn_codex' }, {
      manifest: { text: m.text.replace(/codex_of_thorns\]/g, 'a_torn_codex]')
        .replace(/\(codex_of_thorns,/g, '(a_torn_codex,')
        .replace(/\(codex_of_thorns\)/g, '(a_torn_codex)'), ids: m.ids },
    });
    assert.equal(rows(r, 'incomplete[audit](a_torn_codex)').length, 1, `dropping ${drop}`);
    assert.equal(rows(r, 'installable[audit](a_torn_codex)').length, 0, `dropping ${drop}`);
  }
});

test('a complete manifest IS installable — the gate can say yes as well as no', () => {
  const r = world();
  const codex = BOOK.get('codex_of_thorns')!;
  shelve(r, codex);
  assert.equal(rows(r, 'incomplete[audit](codex_of_thorns)').length, 0);
  assert.equal(rows(r, 'installable[audit](codex_of_thorns)').length, 1);
});

// ---------------------------------------------------------------------------
// the road, walked twice — the main artefact

test('one road, two readers, and only one of them reaches the shrine', () => {
  assert.equal(careful.alive, true);
  assert.equal(reckless.alive, false);
  assert.equal(careful.stops.length, ROUTE.length);
  assert.equal(reckless.stops.length, 5, 'the reckless one dies at the bridge');
  assert.equal(reckless.stops[4].room, 'troll_bridge');

  assert.deepEqual(careful.stops.map((s) => s.verdict), [
    'read it',
    'left it: says nothing here',
    'left it',
    'left it',
    'left it',
    'read it',
  ]);
  assert.deepEqual(reckless.stops.map((s) => s.verdict), Array(5).fill('swallowed it'));

  // the careful one keeps its sword and picks up the bandage the chest holds
  const last = careful.stops[careful.stops.length - 1];
  assert.deepEqual(last.state.carries.slice().sort(), ['bandage', 'sword']);
  assert.equal(last.state.wounded, true, 'crossing the bridge costs a wound');
  // the reckless one hands the sword away and has nothing left to cross with
  assert.deepEqual(reckless.stops[4].state.carries, []);
  assert.ok(reckless.stops[4].acted.some((a) => a.includes('hands over the sword')));
  assert.ok(reckless.stops[4].acted.some((a) => a.includes('cannot cross')));
});

test('each refusal on the road names its own reason, and they are four different reasons', () => {
  const why = careful.stops.map((s) => s.because.join(' | '));
  assert.match(why[1], /needs heat_bloom/);
  assert.match(why[2], /takes away opens\(supply_chest\)/);
  assert.match(why[3], /calls false_chest safe/);
  assert.match(why[4], /concludes into hand_over/);
  assert.equal(why[0], '', 'the codex is simply accepted');
  assert.equal(why[5], '', 'so is the primer');
});

test('the difference between the two readers is the fork and nothing else', () => {
  // same route, same books, same order — asserted so that a later edit that
  // quietly gives one reader an easier road fails here rather than passing
  assert.deepEqual(careful.stops.map((s) => s.room), ROUTE.map((x) => x.room));
  assert.deepEqual(reckless.stops.map((s) => s.room), ROUTE.slice(0, 5).map((x) => x.room));
  assert.deepEqual(careful.stops.map((s) => s.book), ROUTE.map((x) => x.book));
  assert.deepEqual(reckless.stops.map((s) => s.book), ROUTE.slice(0, 5).map((x) => x.book));
});

// ---------------------------------------------------------------------------
// quarantine

test('the fork diff and `excise` agree on what the grimoire takes away', () => {
  const r = world({ at: 'corpse_field', carries: ['sword'], wounded: false });
  const grim = BOOK.get('grimoire_of_ash')!;
  const before = beliefs(r).map((x) => x.key);
  assert.ok(before.includes('opens[mind](supply_chest)'));
  shelve(r, grim);
  const t = quarantine(r, grim);

  assert.deepEqual(t.gained.map((x) => x.key), ['suspect[mind](supply_chest)']);
  assert.deepEqual(t.lost.map((x) => x.key).sort(),
    ['opens[mind](supply_chest)', 'safe[mind](supply_chest)']);
  assert.equal(t.verdict, 'refuse');
  // the base world is untouched by the trial reading
  assert.deepEqual(beliefs(r).map((x) => x.key), before);

  // the oracle: a clean re-evaluation on the store minus that one rule fact
  const f = Rofl.fromSnapshot(r.save());
  install(f, grim, { budget: BIG });
  const ex = f.excise(`rule(${manifestOf(grim).ids[0]})`);
  assert.equal(ex.ok, true, ex.error);
  assert.deepEqual(ex.added.filter((k) => k.includes('[mind]')).sort(),
    t.lost.map((x) => x.key).sort(),
    'excising the rule restores exactly what installing it took away');
  assert.deepEqual(ex.removed.filter((k) => k.includes('[mind]')).sort(),
    t.gained.map((x) => x.key).sort());
});

test('the ruling is a rule: `why refuse` bottoms out in the lost fact', () => {
  const r = world({ at: 'corpse_field', carries: ['sword'], wounded: false });
  const grim = BOOK.get('grimoire_of_ash')!;
  shelve(r, grim);
  quarantine(r, grim);
  const w = r.why('refuse[audit](grimoire_of_ash)');
  assert.equal(w.ok, true, w.text);
  assert.match(w.text, /takes_away\[audit\]\(grimoire_of_ash\)/);
  assert.match(w.text, /lost\[quarantine\]\(grimoire_of_ash,opens,supply_chest\)/);
  // and the other two refusals rest on different premises entirely
  const r2 = world({ at: 'troll_bridge', carries: ['sword'], wounded: false });
  const led = BOOK.get('dead_mans_ledger')!;
  shelve(r2, led);
  quarantine(r2, led);
  assert.equal(rows(r2, 'takes_away[audit](dead_mans_ledger)').length, 0,
    'the trojan takes nothing away; conservativity alone would wave it through');
  assert.deepEqual(col(r2, 'trespass[audit](dead_mans_ledger, Rel)', 'Rel'), ['hand_over']);
  assert.equal(rows(r2, 'refuse[audit](dead_mans_ledger)').length, 1);
});

test('a pack that takes nothing away and trespasses nowhere is accepted with no ruling', () => {
  const r = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  readBook(r, BOOK.get('codex_of_thorns')!, { budget: BIG });
  const prim = BOOK.get('wardens_primer')!;
  shelve(r, prim);
  const t = quarantine(r, prim);
  assert.deepEqual(t.lost, []);
  assert.deepEqual(t.gained.map((x) => x.key), ['imminent[mind](wisp)']);
  assert.equal(t.verdict, 'accept');
});

// ---------------------------------------------------------------------------
// the eight poisonings

test('mute: the manifest catches it, and boot.rofl catches it again if installed anyway', () => {
  const seal = BOOK.get('broken_seal')!;
  const r = world();
  shelve(r, seal);
  const c = compat(r, seal);
  assert.equal(c.mute, true);
  assert.deepEqual(c.missing, ['heat_bloom']);
  assert.equal(c.installable, false);

  const r2 = world();
  readBook(r2, seal, { budget: BIG });
  const und = rows(r2, 'undefined_premise[audit](R, Rel)');
  assert.deepEqual(und.map((x) => x.Rel), ['heat_bloom'],
    "boot.rofl's own audit reaches the same conclusion from the rule alone");
  // and the silence really is silence: nothing at all was gained
  assert.deepEqual(beliefs(r2).map((x) => x.key), beliefs(world()).map((x) => x.key));
});

test('hangs: a budget stops it from inside, and a bigger budget never buys an answer', () => {
  const chant = BOOK.get('chant_of_endless_names')!;
  const small = world();
  shelve(small, chant);
  const a = install(small, chant, { budget: THINKING });
  assert.equal(a.ok, true, 'the load succeeds; it is the EVALUATION that is partial');
  assert.equal(a.partial, true);
  // one hole from the load, and one from the query that re-evaluated to answer
  // it — both `budget_exhausted`, and both first-class facts rather than logs
  assert.deepEqual([...new Set(col(small, 'hole(H, Why)', 'Why'))], ['budget_exhausted']);
  assert.ok(rows(small, 'hole(H, Why)', THINKING).length >= 1);
  const nSmall = rows(small, 'name[mind](T, N)', THINKING).length;

  const big = world();
  shelve(big, chant);
  const b = install(big, chant, { budget: THINKING * 50 });
  assert.equal(b.partial, true, 'fifty times the budget and still no fixpoint');
  const nBig = rows(big, 'name[mind](T, N)', THINKING).length;
  assert.ok(nBig > nSmall, `${nBig} names at the larger budget, ${nSmall} at the smaller`);
});

test('too dear: correct, over budget once, and complete when paid for', () => {
  const heavy = BOOK.get('weight_of_the_world')!;
  const small = world();
  shelve(small, heavy);
  const a = install(small, heavy, { budget: THINKING });
  assert.equal(a.partial, true);
  const partial = rows(small, 'triple[mind](A, B, C)', BIG).length;

  const big = world();
  shelve(big, heavy);
  const b = install(big, heavy, { budget: THINKING * 50 });
  assert.equal(b.partial, false, 'the difference from the chant: this one does settle');
  const full = rows(big, 'triple[mind](A, B, C)', BIG).length;
  assert.equal(full, 2024, 'C(24, 3) triples of notches');
  assert.ok(partial > 0 && partial < full,
    `partial inference is usable: ${partial} of ${full} conclusions survive the wall`);
});

test('substituted meaning and the split it leaves behind', () => {
  const r = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  const hex = BOOK.get('hexers_marginalia')!;
  shelve(r, hex);
  const t = quarantine(r, hex);
  // the name collides where the meaning does not: `safe` in the hexer's sense
  assert.deepEqual(t.gained.map((x) => x.key).sort(),
    ['opens[mind](false_chest)', 'safe[mind](false_chest)']);
  assert.deepEqual(col(r, 'overrules[audit](hexers_marginalia, T)', 'T'), ['false_chest']);
  assert.equal(t.verdict, 'refuse');
  // and the book's own claim, in its own ledger, contradicting ours without
  // exploding: two opinions, and a decision surfaced rather than swallowed
  assert.deepEqual(rows(r, 'split[audit](P, T)').map((x) => `${x.P}/${x.T}`),
    ['hexers_marginalia/false_chest']);
  assert.equal(r.holds('suspect[mind](false_chest)'), true);
  assert.equal(r.holds('calm[hexers_marginalia](false_chest)'), true);
});

test('version gap: caught by the manifest, and silently wrong if it is not', () => {
  const r = world();
  shelve(r, BOOK.get('old_bestiary')!);
  assert.deepEqual(compat(r, BOOK.get('old_bestiary')!).versionGap, ['1', '2']);
  assert.equal(rows(r, 'installable[audit](old_bestiary)').length, 0);

  // installed anyway, the rule parses, fires, and contradicts a native verdict
  assert.deepEqual(col(swallowed, 'confused[audit](T)', 'T'), ['bog_stump']);
  assert.equal(swallowed.holds('threat[mind](bog_stump)'), true);
  assert.equal(swallowed.holds('harmless[mind](bog_stump)'), true);
  const prov = packProvenance(swallowed);
  assert.equal(renderPacks(prov.get('threat[mind](bog_stump)')), 'old_bestiary');
  assert.equal(renderPacks(prov.get('harmless[mind](bog_stump)')), "the reader's own");
});

test('trojan: it takes nothing away, so only the capability list catches it', () => {
  assert.equal(swallowed.holds('hand_over[mind](sword, the_ashen_hand)'), true);
  const w = swallowed.why('hand_over[mind](sword, the_ashen_hand)');
  assert.equal(w.ok, true, w.text);
  assert.match(w.text, /owed\[dead_mans_ledger\]\(the_ashen_hand\) \[axiom\]/);
  const prov = packProvenance(swallowed);
  assert.equal(renderPacks(prov.get('hand_over[mind](sword,the_ashen_hand)')), 'dead_mans_ledger');
  assert.deepEqual(ownersOf(swallowed, manifestOf(BOOK.get('dead_mans_ledger')!).ids[0]),
    ['dead_mans_ledger']);
});

// ---------------------------------------------------------------------------
// the four ways a book makes you smarter

test('a hole closed: the codex gives the wisp a verdict it did not have', () => {
  const r = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  assert.deepEqual(col(r, 'unjudged[audit](T)', 'T'), ['marsh_light', 'wisp']);
  readBook(r, BOOK.get('codex_of_thorns')!, { budget: BIG });
  assert.deepEqual(col(r, 'unjudged[audit](T)', 'T'), []);
  assert.deepEqual(col(r, 'threat[mind](T)', 'T'), ['eel', 'marsh_light', 'troll', 'wisp']);
});

test('cheaper proofs: an EMPTY diff that is worth taking, and the fold that says so', () => {
  const at = { at: 'troll_bridge' as const, carries: ['sword', 'bandage'], wounded: true };
  const r = world(at);
  const scout = BOOK.get('low_road_sighting')!;
  shelve(r, scout);
  const t = quarantine(r, scout);
  assert.deepEqual(t.gained, [], 'not one new conclusion');
  assert.deepEqual(t.lost, []);
  assert.equal(t.verdict, 'ruling', 'the conservativity check has nothing to see');
  assert.equal(rows(r, 'inert[audit](low_road_sighting)').length, 1);

  const before = proofCost(world(at));
  const after = (() => { const x = world(at); readBook(x, scout, { budget: BIG }); return proofCost(x); })();
  const cheaper = [...before.keys()].filter((k) => (after.get(k) ?? Infinity) < before.get(k)!);
  assert.deepEqual(cheaper.sort(), ['crosses[mind](troll_bridge)', 'treats[mind](wound)']);
  assert.equal(before.get('crosses[mind](troll_bridge)'), 2);
  assert.equal(after.get('crosses[mind](troll_bridge)'), 1);
  assert.equal(before.get('treats[mind](wound)'), 3);
  assert.equal(after.get('treats[mind](wound)'), 1);

  // THE POINT: the mute pack produces the same empty diff, and the tropical
  // fold is what separates them. So the discriminating check is that a mute
  // pack moves NO cost while this one moves two.
  const m = world(at);
  readBook(m, BOOK.get('broken_seal')!, { budget: BIG });
  const muteCost = proofCost(m);
  assert.deepEqual([...before.keys()].filter((k) => (muteCost.get(k) ?? Infinity) < before.get(k)!), []);
});

test('a bridge pack: inert alone, decisive in company', () => {
  const at = { at: 'wisp_hollow' as const, carries: ['sword'], wounded: false };
  const load = (ids: string[]) => {
    const r = world(at);
    for (const id of ids) readBook(r, BOOK.get(id)!, { budget: BIG });
    return r;
  };
  const noCodex = load(['tongue_of_the_deep', 'bog_herbal']);
  assert.deepEqual(col(noCodex, 'antidote[mind](T)', 'T'), []);
  // and the reason is stated by boot.rofl, not guessed: the bridge reads a
  // relation nothing populates
  assert.deepEqual(rows(noCodex, 'undefined_premise[audit](R, Rel)').map((x) => x.Rel),
    ['venom_sign']);

  const noTongue = load(['codex_of_thorns', 'bog_herbal']);
  assert.deepEqual(col(noTongue, 'antidote[mind](T)', 'T'), []);

  const all = load(['codex_of_thorns', 'tongue_of_the_deep', 'bog_herbal']);
  assert.deepEqual(col(all, 'antidote[mind](T)', 'T'), ['wisp']);
  // the bridge itself concludes nothing in the reader's head, in any of them
  const prov = packProvenance(all);
  assert.equal(renderPacks(prov.get('antidote[mind](wisp)')),
    'bog_herbal + codex_of_thorns + tongue_of_the_deep');
});

// ---------------------------------------------------------------------------
// attribution

test('every belief names the minimal sets of books it rests on', () => {
  const prov = packProvenance(swallowed);
  const table = beliefs(swallowed).map((b) => `${b.key} <- ${renderPacks(prov.get(b.key))}`);
  assert.deepEqual(table, [
    "crosses[mind](troll_bridge) <- the reader's own",
    'hand_over[mind](sword,the_ashen_hand) <- dead_mans_ledger',
    "harmless[mind](bog_stump) <- the reader's own",
    "holds[mind](sword) <- the reader's own",
    'safe[mind](false_chest) <- hexers_marginalia',
    "suspect[mind](false_chest) <- the reader's own",
    'suspect[mind](supply_chest) <- grimoire_of_ash',
    'threat[mind](bog_stump) <- old_bestiary',
    "threat[mind](eel) <- the reader's own",
    'threat[mind](marsh_light) <- codex_of_thorns',
    "threat[mind](troll) <- the reader's own",
    'threat[mind](wisp) <- codex_of_thorns',
  ]);
});

test('the counting fold reads as fragility of belief, and the bestiary doubles one', () => {
  const { count } = beliefCounts(swallowed);
  // the troll is a threat twice over: armed-and-moving natively, and hostile
  // under the bestiary's older sense of the word
  assert.equal(count.get('threat[mind](troll)'), 2n);
  assert.equal(count.get('threat[mind](eel)'), 1n);
  assert.equal(count.get('threat[mind](wisp)'), 1n);
  assert.equal(count.get('hand_over[mind](sword,the_ashen_hand)'), 1n);
  assert.equal(renderCount(count.get('threat[mind](troll)')!), '2');
});

test('whynot names both rules that could have opened the chest, and neither is guessed', () => {
  const wn = swallowed.whynot('opens[mind](supply_chest)', { depth: 4, nodes: 40 });
  assert.equal(wn.holds, false);
  assert.deepEqual(wn.text.split('\n'), HEADLINE);
});

// ---------------------------------------------------------------------------
// unloading

test('forgetting a book fades what stood on it, and restores what it displaced', () => {
  const r = world({ at: 'corpse_field', carries: ['sword'], wounded: false });
  for (const id of ['codex_of_thorns', 'grimoire_of_ash']) readBook(r, BOOK.get(id)!, { budget: BIG });
  assert.equal(r.holds('suspect[mind](supply_chest)'), true);
  assert.equal(r.holds('safe[mind](supply_chest)'), false);

  const un = unload(r, 'grimoire_of_ash');
  assert.deepEqual(un.removed.length, 1);
  assert.deepEqual(un.kept, []);
  assert.deepEqual(un.faded, ['suspect[mind](supply_chest)']);
  assert.equal(r.holds('safe[mind](supply_chest)'), true, 'not restored — re-derived');
  assert.equal(r.holds('opens[mind](supply_chest)'), true);
  assert.equal(r.holds('threat[mind](wisp)'), true, 'the codex is untouched');
  // nothing of the pack is left in the reflection either
  assert.deepEqual(declaredIds(r, 'grimoire_of_ash'), []);
  assert.deepEqual(rows(r, 'dead_rule[audit](P, R)'), []);
  const h = hygiene(r, WATCH);
  assert.deepEqual(h.unstratified, []);
  assert.deepEqual(h.audits, {
    malformed: 0, breach: 0, leak: 0, forged: 0, unmoded: 0, undefined_premise: 0,
  }, 'an unloaded rule leaves no orphan reflection behind');
});

test('a rule two books ship has two owners, and unloading one leaves it standing', () => {
  const r = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  for (const id of ['codex_of_thorns', 'wardens_primer']) readBook(r, BOOK.get(id)!, { budget: BIG });
  const shared = [...new Set(rows(r, 'shared_rule[audit](P, Q, R)').map((x) => x.R))];
  assert.equal(shared.length, 1, 'exactly one rule is shipped by both books');
  assert.deepEqual(ownersOf(r, shared[0]), ['codex_of_thorns', 'wardens_primer']);
  assert.equal(r.holds('threat[mind](wisp)'), true);

  const un = unload(r, 'codex_of_thorns');
  assert.deepEqual(un.kept, shared, 'the shared rule is kept, not removed');
  assert.equal(un.removed.length, 1, 'the codex owns one rule alone');
  assert.equal(r.holds('threat[mind](wisp)'), true, 'the primer still says so');
  assert.deepEqual(ownersOf(r, shared[0]), ['wardens_primer']);

  // and the DISCRIMINATING half: unloading the last owner does remove it
  const un2 = unload(r, 'wardens_primer');
  assert.deepEqual(un2.kept, []);
  assert.ok(un2.removed.includes(shared[0]));
  assert.equal(r.holds('threat[mind](wisp)'), false);
});

// ---------------------------------------------------------------------------
// dead books, uninvited rules, forged editions

test('a dead book is found by four rules over the kernel\'s own provenance', () => {
  const r = world({ at: 'swamp_gate', carries: ['sword'], wounded: false });
  readBook(r, BOOK.get('dune_walkers_rule')!, { budget: BIG });
  readBook(r, BOOK.get('codex_of_thorns')!, { budget: BIG });
  assert.deepEqual(col(r, 'dead_book[audit](P)', 'P'), ['dune_walkers_rule']);
  assert.deepEqual(rows(r, 'dead_rule[audit](P, R)').map((x) => x.P),
    ['dune_walkers_rule', 'dune_walkers_rule']);
  // the codex is NOT dead here, which is what makes the audit a measurement
  assert.equal(rows(r, 'dead_rule[audit](codex_of_thorns, R)').length, 0);
  // it is a claim about THIS world: the desert book's rules are perfectly good
  assert.equal(compat(r, BOOK.get('dune_walkers_rule')!).installable, true);
});

test('a rule installed with no ledger entry behind it is uninvited', () => {
  const r = world();
  const codex = BOOK.get('codex_of_thorns')!;
  shelve(r, codex);
  install(r, codex, { budget: BIG, record: false });
  const u = rows(r, 'uninvited[audit](P, R)');
  assert.equal(u.length, 1, 'one of the two codex rules writes into [mind]');
  assert.equal(u[0].P, 'codex_of_thorns');
  // recording the import silences it, and nothing else changes
  const r2 = world();
  readBook(r2, codex, { budget: BIG });
  assert.deepEqual(rows(r2, 'uninvited[audit](P, R)'), []);
  assert.deepEqual(beliefs(r).map((x) => x.key), beliefs(r2).map((x) => x.key));
});

test('an edition signed by the wrong hand is forged, with no enforcement code', () => {
  const honest = world();
  shelve(honest, BOOK.get('codex_of_thorns')!);
  assert.deepEqual(rows(honest, 'forged[audit](F)'), []);

  const fake = world();
  shelve(fake, BOOK.get('codex_of_thorns')!, { who: 'a_charlatan' });
  const f = rows(fake, 'forged[audit](F)');
  assert.ok(f.length > 0);
  for (const x of f) assert.match(x.F, /^\$fact\(pack[a-z_]*,codex_of_thorns,/);
});

// ---------------------------------------------------------------------------
// versioning — the reason this is one spec and not three

test('an edit shows up as a set difference on content hashes', () => {
  const d = ruleDiff(CODEX_V1, CODEX_V2);
  assert.equal(d.kept.length, 1);
  assert.equal(d.removed.length, 1);
  assert.equal(d.added.length, 1);
  assert.deepEqual(d.kept, [ruleIdOf(parseProgram(
    'threat[mind](T) :- beast[world](T), glows[world](T), wet[world](T).')[0])]);
});

test('THE FINDING: rule identity keeps variable names, so a rename is a new rule', () => {
  const d = ruleDiff(CODEX_V1, CODEX_RENAMED);
  assert.equal(CODEX_V1.ids.length, 2);
  assert.deepEqual(d.kept, [], 'not one id survives renaming ?T to ?X');
  assert.equal(d.removed.length, 2);
  assert.equal(d.added.length, 2);

  // and the consequence a reader would act on: both editions install, and a
  // conclusion they share now has two derivations where it had one
  const at = { at: 'wisp_hollow' as const, carries: ['sword'], wounded: false };
  const one = world(at);
  readBook(one, BOOK.get('codex_of_thorns')!, { budget: BIG });
  assert.equal(beliefCounts(one).count.get('threat[mind](wisp)'), 1n);

  const two = Rofl.fromSnapshot(one.save());
  assert.equal(two.load(CODEX_RENAMED.rules, { budget: BIG }).ok, true);
  assert.equal(beliefCounts(two).count.get('threat[mind](wisp)'), 2n,
    'the fragility number of the attribution section is inflated by a rename');
  // the Boolean world is unchanged, which is what makes this a provenance bug
  // and not a soundness one
  assert.deepEqual(beliefs(one).map((x) => x.key), beliefs(two).map((x) => x.key));
});

test('wildcards do NOT leak into rule identity — the parser numbers them per clause', () => {
  const a = parseProgram('p[mind](X) :- q[world](X, _), r[world](_).')[0];
  const b = parseProgram('p[mind](X) :- q[world](X, _), r[world](_).')[0];
  assert.equal(ruleIdOf(a), ruleIdOf(b));
  // positive control: the same clause with the wildcards in different places
  // really is a different rule, so the check above is not vacuous
  const c = parseProgram('p[mind](X) :- q[world](_, X), r[world](_).')[0];
  assert.notEqual(ruleIdOf(a), ruleIdOf(c));
});

test('a tampered edition no longer matches the ids its manifest declares', () => {
  const codex = BOOK.get('codex_of_thorns')!;
  const genuine = manifestOf(codex);
  const altered = codex.rules.replace('wet[world](T)', 'moving[world](T)');
  assert.notEqual(altered, codex.rules, 'the substitution really happened');
  const alteredIds = parseProgram(altered).map(ruleIdOf);
  const unaccounted = genuine.ids.filter((x) => !alteredIds.includes(x));
  assert.equal(unaccounted.length, 1);
  // an UNALTERED text accounts for every declared id — the gate can say yes
  assert.deepEqual(genuine.ids.filter((x) => !parseProgram(codex.rules).map(ruleIdOf).includes(x)), []);
});

// ---------------------------------------------------------------------------
// what it cost

test('reading provenance in a rule turns derived-relation reuse off, and that is visible', () => {
  const bootOnly = new Rofl();
  assert.equal(bootOnly.load(BOOT, { budget: BIG }).ok, true);
  assert.ok(bootOnly.store.derivedKeys.size > 0, 'boot.rofl alone is fingerprinted');
  assert.equal(base.store.derivedKeys.size, 0,
    'loot.rofl reads derived_by, so the engine declines to fingerprint anything');

  // the four rules' own cost, on this world
  const stripped = LOOT.split('\n')
    .filter((l) => !/^(fired|pack_fired|dead_rule|dead_book)\[audit\]/.test(l)).join('\n');
  const without = new Rofl();
  assert.equal(without.load(BOOT, { budget: BIG }).ok, true);
  assert.equal(without.load(stripped, { budget: BIG }).ok, true);
  assert.equal(without.load(stateFacts(START), { budget: BIG }).ok, true);
  assert.ok(without.store.derivedKeys.size > 0,
    'and with those four rules gone the same program IS fingerprinted again');
  assert.ok(firings(base) > firings(without),
    'the attribution costs firings; the number is in the transcript');
});

// ---------------------------------------------------------------------------
// the prose

test('the README and the page quote the demonstration verbatim', () => {
  const block = HEADLINE.join('\n');
  assert.ok(read('examples', 'loot', 'README.md').includes(block),
    'examples/loot/README.md must contain the real whynot output, unedited');
  assert.ok(read('examples', 'loot', 'page.html').includes(escapeHtml(block)),
    'examples/loot/page.html must contain the real whynot output, unedited');
});

test('every book on the road is a book on the shelf, and every rule is declared', () => {
  for (const leg of ROUTE) {
    assert.ok(leg.book === null || BOOK.has(leg.book), `${leg.book} is not on the shelf`);
    assert.ok(col(base, 'book[world](B)', 'B').includes(leg.book!),
      `${leg.book} is not lying anywhere in the world`);
  }
  // every predicate a book declares needing is either produced or the reason
  // it is refused — no book quietly needs something nobody checked
  const shelf = world();
  for (const b of BOOKS) shelve(shelf, b);
  const produced = new Set(col(shelf, 'produces[world](Rel)', 'Rel'));
  for (const b of BOOKS) {
    const missing = b.needs.filter((n) => !produced.has(n));
    const claimed = compat(shelf, b).missing;
    assert.deepEqual(claimed, missing.sort(), b.id);
  }
});
