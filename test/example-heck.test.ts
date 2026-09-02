// examples/heck — the HECK demo, run as a test so it cannot rot.
//
// The oracle is exhaustive enumeration of the whole declared situation space —
// 256 situations x 24 ordinances, with the citation closure built separately in
// plain TypeScript — so the contradiction set is checked against a COMPLETE
// decision procedure and not against numbers a previous run happened to
// produce. It is applied to the standing codex AND to every amended codex on
// the docket, because a petition's verdict is a difference of two fixpoints
// and half of that difference would otherwise go unchecked.
//
// The convergence claims are the reason this file exists. HECK is the one
// instance in runtime/semirings.ts whose plus and times pull the same way, so
// its BOUNDED declaration rests on the ceiling alone, and every assertion about
// it here is paired with the same fold minus the ceiling — which must come back
// NEGATIVE. A convergence test that has never seen a divergence is not a test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CDX, PETITIONS, world, amend, clashSet, oracleClashes, SITUATION_COUNT,
  judge, chanceryWorld, docketFacts, codexFacts, parseCodex, CODEX,
  foldChaos, foldUncapped, remedy, hygiene, rows, col,
} from '../examples/heck/demo.ts';
import { REJECTED } from '../runtime/semirings.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// one fixpoint per shape, built once — each is a full evaluation
const r = world();
const CLASHES = clashSet(r);
const CEILING = CLASHES.length;
const VERDICTS = judge(CDX, PETITIONS);
const CW = chanceryWorld(CDX, VERDICTS);

// ---------------------------------------------------------------------------
// hygiene, before anything is believed

test('heck: every boot.rofl audit over HECK is empty', () => {
  for (const { goal, count } of hygiene(r)) {
    assert.equal(count, 0, `${goal} should be empty, got ${count}`);
  }
  // the [audit] and [chancery] heads read [main]; leak/2 being empty means the
  // kernel emitted a bridge_decl for each, which is the whole check
  assert.ok(rows(r, 'bridge_decl(R, F, T)').length > 0,
    'the verdict rules really do cross a ledger boundary');
});

// ---------------------------------------------------------------------------
// the oracle

test('heck: the engine and an exhaustive enumeration agree on the contradictions', () => {
  const oracle = oracleClashes(CDX);
  assert.equal(SITUATION_COUNT(CDX), 256, 'the declared situation space');
  assert.ok(CLASHES.length > 10, 'a non-trivial set of contradictions');
  assert.deepEqual(CLASHES, oracle);

  // POSITIVE CONTROL: the oracle is not a function that always agrees. Drop the
  // citation ring from the codex and it must report FEWER contradictions —
  // paragraphs 13 and 14 hold nothing of their own, so everything they clash
  // over arrives through the ring.
  const cut = { ...CDX, ordinances: CDX.ordinances.map((o) => ({ ...o, cites: [] })) };
  const cutOracle = oracleClashes(cut);
  assert.ok(cutOracle.length < oracle.length,
    `cutting the citations must lose contradictions: ${cutOracle.length} vs ${oracle.length}`);
  assert.deepEqual(clashSet(world(cut)), cutOracle, 'and the two still agree there');
});

test('heck: the oracle agrees on every AMENDED codex too, not only the standing one', () => {
  let checked = 0;
  for (const p of PETITIONS) {
    const amended = amend(CDX, p);
    assert.deepEqual(clashSet(world(amended)), oracleClashes(amended), `petition ${p.id}`);
    checked++;
  }
  assert.equal(checked, PETITIONS.length, 'every petition on the docket');
  assert.ok(checked >= 10, 'and the docket is not empty');
});

// ---------------------------------------------------------------------------
// the demonic MOOT

test('heck: the five verdicts fire, and each names what it is supposed to', () => {
  const serene = col(r, 'serene[audit](O)', 'O');
  const harmonised = rows(r, 'harmonised[audit](A, B)');
  const inert = rows(r, 'inert[audit](O, D)');
  const redundant = rows(r, 'redundant[audit](A, B)');
  const placid = rows(r, 'placid[audit](D, V)');

  // SERENE — party to no contradiction, direct or inherited
  assert.ok(serene.includes('o_017'), 'the Annex stamp offends nobody');
  assert.ok(!serene.includes('o_001'), 'the triplicate rule offends paragraph 2');
  const tainted = new Set(col(r, 'tainted(O)', 'O'));
  for (const o of serene) assert.ok(!tainted.has(o), `${o} cannot be both serene and tainted`);

  // HARMONISED — in force together, bound to a common act, never in discord
  assert.ok(harmonised.length > 0);
  for (const h of harmonised) {
    assert.equal(rows(r, `discord(${h.A}, ${h.B})`).length, 0, `${h.A}/${h.B} must not quarrel`);
    assert.ok(rows(r, `concurs(${h.A}, ${h.B}, X)`).length > 0, `${h.A}/${h.B} must agree on something`);
  }

  // INERT — the clerical error: a scope naming a watch the calendar lacks
  assert.deepEqual(inert, [{ O: 'o_021', D: 'hour' }]);
  assert.equal(rows(r, 'governs(o_021, hour, V)').length, 0, 'in force at no hour at all');

  // REDUNDANT — nothing bound and nothing barred that the senior does not
  assert.ok(redundant.length > 0);
  for (const x of redundant.slice(0, 5)) {
    assert.equal(rows(r, `act_escape(${x.A}, ${x.B})`).length, 0);
    assert.equal(rows(r, `bar_escape(${x.A}, ${x.B})`).length, 0);
  }

  // PLACID — the region at peace, which is the verdict the department acts on
  assert.deepEqual(placid, [{ D: 'writ', V: 'sealed' }]);
});

test('heck: placid depends on the sealed-writ exemption — remove it and the verdict goes', () => {
  // The gate must be able to say no. Every prohibition in the codex carves the
  // sealed writ out; strike that one clause from all of them and the region at
  // peace must disappear, because the prohibitions now run there too.
  const bound = {
    ...CDX,
    ordinances: CDX.ordinances.map((o) => {
      if (!o.scope.has('writ')) return o;
      const scope = new Map(o.scope);
      scope.delete('writ');
      return { ...o, scope };
    }),
  };
  const before = rows(r, 'placid[audit](D, V)');
  const after = rows(world(bound), 'placid[audit](D, V)');
  assert.deepEqual(before, [{ D: 'writ', V: 'sealed' }], 'the region is there to begin with');
  assert.equal(after.length, 0, 'and it is gone once the exemption is');
});

// ---------------------------------------------------------------------------
// the chancery

test('heck: the engine and the host reach the same verdict on every petition', () => {
  const engine = new Set(col(CW, 'approved[chancery](P)', 'P'));
  assert.ok(VERDICTS.length >= 10, 'the docket is not empty');
  for (const v of VERDICTS) {
    assert.equal(engine.has(v.petition.id), v.approved,
      `${v.petition.id}: engine ${engine.has(v.petition.id)}, host ${v.approved}`);
  }
  assert.ok(engine.size > 0, 'some petition is granted');
  assert.ok(engine.size < VERDICTS.length, 'and some petition is refused');
});

test('heck: the three refusals are three DIFFERENT refusals', () => {
  const refused = VERDICTS.filter((v) => !v.approved);
  const pure = refused.filter((v) => v.reconciled.length > 0 && v.manufactured.length === 0);
  const netter = refused.filter((v) => v.reconciled.length > 0 && v.manufactured.length > 0);
  const empty = refused.filter((v) => v.reconciled.length === 0 && v.manufactured.length === 0);
  assert.equal(pure.length, 1, 'one petition only makes peace');
  assert.equal(netter.length, 1, 'one leaves the codex worse and is refused anyway');
  assert.equal(empty.length, 1, 'one changes nothing');
  // THE STANDARD IS NOT "ON BALANCE", and this is where that is decided
  assert.ok(netter[0].manufactured.length > netter[0].reconciled.length,
    `${netter[0].petition.id} manufactures more than it reconciles`);
  assert.equal(netter[0].approved, false, 'and is refused all the same');
});

test('heck: whynot on the net-positive refusal names the paragraphs it reconciled', () => {
  const netter = VERDICTS.find((v) => !v.approved && v.manufactured.length > 0)!;
  const out = CW.whynot(`approved[chancery](${netter.petition.id})`, { depth: 4, nodes: 24 });
  assert.equal(out.holds, false);
  assert.match(out.text, /failed premise: not reconciles/, 'the reconciliation is the cause');
  assert.doesNotMatch(out.text, /failed premise: not manufactures/,
    'and manufacturing is not — this petition manufactured plenty');
  // the pair is in the text, not merely the relation name
  const [a, b, act] = netter.reconciled[0].split('|');
  for (const part of [a, b, act]) {
    assert.ok(out.text.includes(part), `the tree names ${part}`);
  }
});

test('heck: the minimal amendment is found by minimising on the same facts', () => {
  const empty = VERDICTS.find((v) => !v.approved
    && v.manufactured.length === 0 && v.reconciled.length === 0)!;
  const fix = remedy(CDX, empty.petition);
  assert.notEqual(fix, null, 'a petition that merely changes nothing can be repaired');
  assert.ok(fix!.added > 0, 'the remedy manufactures something');
  assert.equal(fix!.reconciled, 0, 'and reconciles nothing');
  assert.ok(Number.isFinite(fix!.cost), 'the tropical cost is a real derivation, not Infinity');
  // and the repair really does flip the verdict when applied
  const repaired = judge(CDX, [{
    ...empty.petition,
    add: {
      ...empty.petition.add,
      forbids: fix!.edit.startsWith('also forbid')
        ? [...empty.petition.add.forbids, fix!.edit.replace('also forbid ', '')]
        : empty.petition.add.forbids,
    },
  }]);
  if (fix!.edit.startsWith('also forbid')) {
    assert.equal(repaired[0].approved, true, 'the named edit carries the petition');
  }
});

// ---------------------------------------------------------------------------
// the convergence mechanism — the reason this example exists
//
// Everything below is on data with a real cycle: paragraphs 13/14 and 15/16
// cite each other, so the support hypergraph has strongly connected components
// and convergence is not free.

test('heck: the chaos fold converges on the citation ring, and the ring saturates', () => {
  const fold = foldChaos(r, CEILING);
  assert.ok(fold.cyclic > 0, 'the codex really does contain a citation ring');
  assert.equal(fold.converged, true);
  assert.equal(fold.disciplineHeld, true, 'BOUNDED is an honest declaration here');
  assert.equal(fold.ceiling, CEILING);

  // values GROW along a derivation — the direction no other BOUNDED instance
  // in runtime/semirings.ts moves in
  const ring = ['o_013', 'o_014', 'o_015', 'o_016'];
  for (const o of ring) {
    assert.equal(fold.chaos.get(o), CEILING, `${o} is on the ring and drags in everything`);
  }
  assert.deepEqual(fold.saturated, ring, 'and nothing off the ring reaches the ceiling');
  const offRing = fold.chaos.get('o_001')!;
  assert.notEqual(offRing, REJECTED);
  assert.ok((offRing as number) > 0 && (offRing as number) < CEILING,
    `an ordinary quarrelsome paragraph sits strictly between: ${String(offRing)}`);

  // nothing escapes the carrier
  for (const [o, v] of fold.chaos) {
    assert.ok(v === REJECTED || (Number.isInteger(v) && v >= 0 && v <= CEILING),
      `${o}: ${String(v)} is outside the carrier`);
  }
});

test('heck: take the ceiling away and the same fold does NOT converge', () => {
  // The whole convergence argument is the ceiling: the vocabulary is finite,
  // so the distinguishable contradictions are, so the carrier is. Remove the
  // clamp and nothing else, and the citation ring becomes a pump.
  const t0 = Date.now();
  const loose = foldUncapped(r, CEILING, 40);
  assert.equal(loose.converged, false, 'the false declaration shows up as divergence');
  assert.equal(loose.disciplineHeld, false, 'and is reported rather than hung on');
  assert.equal(loose.rounds, 40, 'the caller cap stopped it, not a fixpoint');
  assert.ok(Date.now() - t0 < 10_000, 'and it stopped quickly');

  // MEASURED TWICE, so "still climbing" is not a guess
  const looser = foldUncapped(r, CEILING, 80);
  assert.ok(looser.top > loose.top,
    `twice the rounds, a strictly larger value: ${loose.top} then ${looser.top}`);
  assert.ok(loose.top > CEILING, 'and it has already passed the ceiling it was refusing');

  // the capped fold on the SAME data is the other half of the control
  assert.equal(foldChaos(r, CEILING).converged, true);
});

test('heck: a cycle alone does not pump — it takes a cycle the WEIGHT charges on', () => {
  // Cut the citation ring and leave everything else. What is left is still
  // cyclic: boot.rofl's own audit rules are mutually recursive and keep 38
  // facts in a strongly connected component whatever the codex says. Those
  // cycles carry no `tainted` firing, so the weight hook charges nothing to go
  // round them, and the uncapped fold is finite there. It is the ring — a
  // cycle the weight charges on — that turns growth into divergence.
  const cut = { ...CDX, ordinances: CDX.ordinances.map((o) => ({ ...o, cites: [] })) };
  const cutWorld = world(cut);
  const ceiling = clashSet(cutWorld).length;
  assert.ok(ceiling > 0, 'there are still contradictions to count');

  const fold = foldChaos(cutWorld, ceiling);
  const whole = foldChaos(r, CEILING);
  assert.ok(fold.cyclic > 0, 'the graph is STILL cyclic — those cycles are boot.rofl\'s');
  assert.ok(fold.cyclic < whole.cyclic,
    `and the ring's own facts have left it: ${whole.cyclic} then ${fold.cyclic}`);

  const loose = foldUncapped(cutWorld, ceiling, 40);
  assert.equal(loose.converged, true, 'uncapped, over the cycles that remain, it stabilises');
  assert.equal(loose.disciplineHeld, true);
  assert.ok(loose.rounds < 40, `and at a fixpoint rather than at the cap: ${loose.rounds}`);
  // the same call on the uncut codex is the other half of the control
  assert.equal(foldUncapped(r, CEILING, 40).converged, false);
});

// ---------------------------------------------------------------------------
// the files

test('heck: the README and the page quote the program, not a memory of it', () => {
  const readme = read('examples', 'heck', 'README.md');
  const page = read('examples', 'heck', 'page.html');
  const fold = foldChaos(r, CEILING);

  for (const [what, needle] of [
    ['the contradiction count', `${CLASHES.length} mutually exclusive prescriptions`],
    ['the situation space', `${SITUATION_COUNT(CDX)} situations`],
    ['the ordinance count', `${CDX.ordinances.length} ordinances`],
    ['the saturation report', 'HELL HAS REACHED MAXIMUM ENTROPY'],
  ] as [string, string][]) {
    assert.ok(readme.includes(needle), `README must carry ${what}: ${needle}`);
  }
  assert.ok(page.includes(String(CEILING)), 'the page carries the ceiling');
  assert.equal(fold.ceiling, CEILING);

  // exactly one <title>, and none of the tags the harness supplies
  assert.equal((page.match(/<title>/g) ?? []).length, 1);
  for (const tag of ['<!doctype', '<html', '<head', '<body']) {
    assert.ok(!page.toLowerCase().includes(tag), `the page must not carry ${tag}`);
  }
  // the theme contract: a light palette on bare :root, redefined under BOTH
  assert.match(page, /:root\s*\{/);
  assert.match(page, /@media \(prefers-color-scheme: dark\)/);
  assert.match(page, /:root:not\(\[data-theme="light"\]\)/);
  assert.match(page, /:root\[data-theme="dark"\]/);
  assert.doesNotMatch(page, /<(script|link|img)[^>]*\s(src|href)=["']http/i);
});

test('heck: the codex parses back to what it was written as', () => {
  const again = parseCodex(CODEX);
  assert.equal(again.ordinances.length, CDX.ordinances.length);
  assert.equal(codexFacts(again), codexFacts(CDX), 'the parse is deterministic');
  assert.ok(docketFacts(VERDICTS).includes('was_clash('), 'both sides of the difference are filed');
  assert.ok(docketFacts(VERDICTS).includes('now_clash('));
  // every ordinance has wording, because the report reads it back
  for (const o of CDX.ordinances) {
    assert.ok(o.text.length > 10, `${o.id} has real wording`);
    assert.equal(rows(r, `text(${o.id}, T)`).length, 1);
  }
});
