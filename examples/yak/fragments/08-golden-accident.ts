// FRAGMENT 08 — A RULE THAT CODES AN ACCIDENT.
//
// TASK      land the meta-layer cache (about 15 s off a spat-sized load).
// QUESTION  did the change move observable behaviour?
// SCANNER   a golden capture: why-trees, canonicalState and snapshot
//           round-trips over three programs — craft, multi, sensors —
//           byte-compared before and after.
// RETURNED  zero bytes moved. Twice, across two separate kernel changes.
//
// On that evidence two findings were settled and the worker was stopped.
// Then the full node suite: 291 pass / 9 FAIL, every failure in examples/wtf,
// a creature computed 2/2 where an independent implementation of the Magic
// layer rules says 3/3. Wrong answers, not flakes.
//
// The golden set was never chosen. It was what happened to be lying around
// when someone needed a diff. This measures what it covered — one number
// settles it, and the engine will report it about itself, since boot.rofl
// derives `stratum/2` from the rule dependency graph.
//
// NOT REPLAYABLE: the nine failures are fixed and the moment has passed. What
// replays is the measurement that explains them.
import { Rofl } from '../../../src/api.ts';
import { Evaluation } from '../../../src/engine.ts';
import { peelRounds } from '../../../src/rounds.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// The two inline programs are the golden capture's own fixtures, verbatim.
const CRAFT = `raw(iron_ore). raw(crude_oil). raw(coal).
recipe(heavy_oil, cons(crude_oil, nil)).
recipe(light_oil, cons(heavy_oil, cons(water, nil))).
recipe(heavy_oil, cons(light_oil, cons(water, nil))).
recipe(petrol_gas, cons(light_oil, cons(water, nil))).
recipe(light_oil, cons(petrol_gas, cons(water, nil))).
recipe(water, nil).
recipe(plastic, cons(petrol_gas, cons(coal, nil))).
suffix(L) :- recipe(_, L).
suffix(T) :- suffix(cons(_, T)).
ok(nil).
ok(cons(H, T)) :- suffix(cons(H, T)), craftable(H), ok(T).
craftable(I) :- raw(I).
craftable(I) :- recipe(I, L), ok(L).`;

const MULTI = `a(1). b(1). c(1).
p(X) :- a(X).
p(X) :- b(X).
p(X) :- c(X).
q(X) :- p(X).`;

export function run(): string[] {
  const out: string[] = [];
  const BOOT = read('boot.rofl');
  const programs: [string, string, boolean][] = [
    ['craft', CRAFT, true],
    ['multi', MULTI, true],
    ['sensors', read('examples/sensors.rofl'), true],
    ['wtf', read('examples/wtf/wtf.rofl'), false],
  ];
  out.push('program            in the golden set   relations   max round     distinct rounds');
  for (const [name, prog, inGolden] of programs) {
    const r = new Rofl();
    r.load(BOOT);
    r.load(prog, { budget: 400000 });
    // The depth used to be read off `stratum(R, N)`, which boot.rofl derived.
    // Those ten rules left boot.rofl when the evaluator started peeling its
    // schedule off the decoded rules; the depth is the same depth, read from
    // the schedule that was actually used instead of from a table describing it.
    const peel = peelRounds(new Evaluation(r.store, { budget: 400000 }).rules);
    const levels = [...peel.round.values()];
    out.push(
      `${name.padEnd(19)}${(inGolden ? 'yes' : 'NO').padEnd(20)}${String(peel.round.size).padStart(9)}` +
      `${String(Math.max(...levels)).padStart(14)}${String(new Set(levels).size).padStart(17)}` +
      (inGolden ? '' : '   <- where the 9 failures were'));
  }
  out.push('');
  out.push('every golden program stops three boundaries in, against fifteen for the');
  out.push('one they left out. (It was ONE until the meta-kernel gained a second');
  out.push('negation level with the collection graph, and one more when the depth');
  out.push('started being counted in WAKE-UP ROUNDS rather than negation depth --');
  out.push('a round is a wave, so base facts are round 0 and everything a rule');
  out.push('concludes is at least round 1. The shallowness of the golden set is the');
  out.push('point and no re-basing touches it.) The change being checked was to the');
  out.push('layer the engine activates one round at a time, so the capture could not');
  out.push('have exercised it however many bytes it compared.');
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  console.log(run().join('\n'));
}
