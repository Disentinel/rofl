// FRAGMENT 01 — sedimentary success.
//
// TASK      make HUH's pipe demo say which stage ate a log line.
// QUESTION  `hit(N) :- msg(N,S), contains(S,"404").` loads clean and `hit` is
//           always empty, because `contains` is not a builtin and parses as a
//           relation nothing can populate. How many relations in a program can
//           never hold a fact?
//
// The scanner is one rule, and it lives in boot.rofl to this day:
//
//   undefined_premise[audit](R, Rel) :- premise_pos(R, Rel),
//                                       not concludes(_, Rel), not edb(Rel).
//
// This file replays it over the rule files written AFTER it landed — which is
// the only thing that makes a retained rule worth its keep.
import { Rofl } from '../../../src/api.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PROGRAMS = [
  'examples/moot/moot.rofl', 'examples/blam/blam.rofl', 'examples/bleep/bleep.rofl',
  'examples/drip/drip.rofl', 'examples/wtf/wtf.rofl', 'examples/spat/spat.rofl',
];

/** The relations the audit condemns in a program, canonically ordered. */
export function flagged(r: Rofl): string[] {
  return [...new Set(r.query('undefined_premise[audit](Rule, Rel)').rows
    .map((x) => x.bindings['Rel']))].sort();
}

export function run(): string[] {
  const out: string[] = [];
  const BOOT = read('boot.rofl');
  out.push('A. the audit over every rule file shipped SINCE it landed:');
  for (const p of PROGRAMS) {
    const r = new Rofl();
    r.load(BOOT);
    const res = r.load(read(p), { budget: 400000 });
    const f = flagged(r);
    out.push(`   ${p.padEnd(26)} load=${res.ok ? 'ok ' : 'REJ'}  undefined_premise: ${f.join(', ') || '(none)'}`);
  }
  // A negative result is a fact about the instrument until a positive control
  // says otherwise. MOOT declares its twelve inputs BECAUSE of this audit and
  // says so in its header; remove the declarations and the audit must name them.
  const r = new Rofl();
  r.load(BOOT);
  r.load(read('examples/moot/moot.rofl').split('\n').filter((l) => !/^edb\(/.test(l)).join('\n'),
    { budget: 400000 });
  const f = flagged(r);
  out.push('');
  out.push('B. positive control — strip MOOT\'s edb declarations and re-ask:');
  out.push(`   the audit names ${f.length} relations: ${f.join(', ')}`);
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  console.log(run().join('\n'));
}
