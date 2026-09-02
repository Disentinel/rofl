// FRAGMENT 03 — quick success, rule thrown away.
//
// TASK      cache boot.rofl's meta-layer: it was ~15 s of a 29.8 s load on
//           examples/spat, and it is rebuilt from scratch every time.
// QUESTION  a cache needs an invalidation key. What actually moves the meta
//           relations — the rules, or the data?
//
// Four mutations, the meta relations watched. Written in about three minutes,
// run once, deleted. Its answer became the cache's key and nothing else: the
// rule-shaped relations are immune to data, so their key is just the set of
// rule ids, which are already content-addressed.
//
// AND THE ANSWER OUTLIVED ITS SUBJECT. The relations this originally watched
// were `dep`, `dep_neg`, `reach` and `stratum`, and `reach` was the ~15 s the
// task was about. All ten rules behind them left boot.rofl when the evaluator
// started peeling its schedule off the decoded rules — the expensive thing the
// cache was for is not cached now, it is GONE, and with it 44.8% of the steps
// the whole corpus spent. The three-way split the fragment found is still here
// and is re-measured below on the relations that remain: `flows_to` and `flow`
// are the rule-shaped ones, `undefined_premise` reads the `edb` marks and so is
// declaration-shaped, `sees`/`perspective` move with a perspective, `forged`
// with an authored fact. A finding about the SHAPE of a key survived the
// deletion of every relation it was measured on, which is the most this
// fragment could have hoped to demonstrate about itself.
import { Rofl } from '../../../src/api.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const META = ['flow', 'flows_to', 'undefined_premise', 'sees', 'perspective', 'forged'];

export function run(): string[] {
  const out: string[] = [];
  // FACT COUNTS AND THE KEY ITSELF. Counting facts was enough while the meta
  // layer was big: a new relation added a `stratum` row and you could see it.
  // What remains is small, and `undefined_premise` is EMPTY on a clean program
  // — an audit that fires on nothing. An empty relation cannot show a key
  // moving, so the fingerprint is printed beside the count. That is what the
  // cache actually keys on, and it is the thing the task asked about.
  let prev: Record<string, string | undefined> = {};
  const snap = (r: Rofl) => {
    const now: Record<string, string | undefined> = {};
    const parts = META.map((m) => {
      now[m] = r.store.derivedKeys.get(m);
      const n = [...r.store.facts.values()].filter((f) => f.rel === m).length;
      const moved = Object.keys(prev).length > 0 && now[m] !== prev[m] ? '*' : ' ';
      return `${m}=${n}${moved}`;
    }).join(' ');
    prev = now;
    return parts;
  };

  const r = new Rofl();
  r.load(fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8'));
  r.load('p(1). q(X) :- p(X).');
  r.evaluate();
  out.push(`after program            : ${snap(r)}`);

  r.assert('p(2).'); r.evaluate();
  out.push(`+ fact of existing rel   : ${snap(r)}`);

  r.assert('brandnew(7).'); r.evaluate();
  out.push(`+ fact of NEW relation   : ${snap(r)}`);

  r.assert('note[obs](hello).'); r.evaluate();
  out.push(`+ fact in NEW perspective: ${snap(r)}`);

  r.assert('claim(x).', { who: 'someone' }); r.evaluate();
  out.push(`+ fact with an author    : ${snap(r)}`);
  out.push('');
  out.push('`*` marks a relation whose reuse fingerprint MOVED on that mutation.');
  out.push('flow / flows_to never move: rule-shaped, and the closure over the rule');
  out.push('signatures is exactly the shape `reach` was. undefined_premise moves when');
  out.push('a relation is first DECLARED, because it reads the edb marks, which is the');
  out.push('shape `stratum` had. sees / perspective move with a perspective, forged');
  out.push('with every authored fact. Three keys, three widths -- and none of the four');
  out.push('relations this was originally measured on still exists.');
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  console.log(run().join('\n'));
}
