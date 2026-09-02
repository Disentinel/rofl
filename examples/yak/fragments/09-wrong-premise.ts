// FRAGMENT 09 — THE WRONG PREMISE. The probe failed; the code was fine.
//
// TASK      land the semiring layer across three demos in parallel.
// REPORT    a demo agent reported: a rule outside range restriction is
//           silently demand-evaluated, and this "corrupts the semiring fold"
//           because its facts VANISH from it, while the Boolean answer stays
//           right.
// QUESTION  do they vanish?
// SCANNER   the shape the report described, built to confirm it.
//
// They do not. The facts are in the store and every one of them is annotated.
// The probe refuted the symptom it was written to reproduce — which is the
// only reason the real defect got found, because the report was right that
// something was wrong and wrong about what. A second, narrower probe found
// it: the clause-renaming counter was leaking into the FIRING SIGNATURE, so a
// fact with exactly one derivation recorded as two supports. Inflation, not
// disappearance, and only counting could see it.
//
// That second probe was kept — it is test/firing-signature.test.ts now, same
// two fixtures. Replayed here, both sides return 1: the repair landed.
import { Rofl } from '../../../src/api.ts';
import { Evaluation } from '../../../src/engine.ts';
import { evaluateSemiring } from '../../../src/semiring.ts';
import { countingSemiring } from '../../../runtime/semirings.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

// `risky` is not range-restricted as written: Y and Z are both unbound when
// the `=` runs, so it is demand-backed and unfolded top-down at each call site.
const DEMAND = `
who(alice). who(bob).
tag(alice, staging). tag(bob, prod).
risky(X, Y) :- Y = pair(X, Z), who(X), tag(X, Z).
safe(X) :- who(X), risky(X, _).
`;
// The same logic, premise order fixed: materialised bottom-up, never unfolded.
const RANGE_RESTRICTED = `
who(alice). who(bob).
tag(alice, staging). tag(bob, prod).
risky(X, Y) :- who(X), tag(X, Z), Y = pair(X, Z).
safe(X) :- who(X), risky(X, _).
`;

export function run(): string[] {
  const out: string[] = [];
  const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
  const load = (prog: string) => { const r = new Rofl(); r.load(BOOT); r.load(prog); r.evaluate(); return r; };

  const r = load(DEMAND);
  const ev = new Evaluation(r.store, {});
  out.push('the shape the report described is real:');
  out.push(`  non-range-restricted rules : ${ev.rules.filter((x) => !x.safe).map((x) => x.clause.head.rel).join(', ') || '(none)'}`);
  out.push(`  demand-backed relations    : ${[...ev.demandRels.keys()].join(', ') || '(none)'}`);
  out.push('');
  out.push('the claimed consequence is not:');
  const answers = r.query('risky(X,Y)').rows.length;
  const inStore = [...r.store.facts.keys()].filter((k) => /^risky\[/.test(k)).sort();
  const fold = evaluateSemiring(r.store, countingSemiring, { maxRounds: 40 });
  const annotated = inStore.filter((k) => fold.value.has(k));
  out.push(`  query answers for risky    : ${answers}`);
  out.push(`  risky facts in the store   : ${inStore.length}`);
  out.push(`  of those, annotated by the fold: ${annotated.length}`);
  out.push('  nothing vanished.');
  out.push('');
  out.push('what WAS wrong, and what the kept probe pins — supports for a fact');
  out.push('with exactly one derivation:');
  const KEY = 'risky[main](alice,pair(alice,staging))';
  out.push(`  demand-backed    : ${load(DEMAND).store.supportCount(KEY)}`);
  out.push(`  range-restricted : ${load(RANGE_RESTRICTED).store.supportCount(KEY)}`);
  out.push('  (2 and 1 before the fix; the description carried a renamed variable');
  out.push('   from its call site into the signature, so one derivation hashed twice)');
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  console.log(run().join('\n'));
}
