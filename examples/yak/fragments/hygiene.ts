// HYGIENE (not a fragment) — MOOT pointed at the accumulated scanner set.
//
// A tool that leaves rules behind after every task has to be able to prove
// which of them died. examples/moot/ already is that instrument: five
// verdicts over rules-as-data — unreachable, shadowed, tautological,
// contradictory, dependent — and it already points itself at boot.rofl. This
// reuses it rather than growing a second one.
//
// WHAT IT CAN AND CANNOT POLICE, stated before the output, because the gap is
// the finding. Of the ten scanners in this catalogue exactly ONE is a rule
// (`undefined_premise`, fragment 01); the other nine are TypeScript probes
// against the store API. That is not an accident of this session — the
// questions were about the ENGINE, and a rule cannot ask how many
// milliseconds an insert took. MOOT's five verdicts decide rule-shaped
// scanners exactly and have nothing at all to say about probe-shaped ones.
//
// Fragment 06 is the proof: a probe that went stale is not unreachable, not
// shadowed, not tautological. It runs, it returns, and it is about nothing.
// No verdict here catches it. The hygiene that would is a different one —
// does this probe still measure what its comment claims — and it is not
// mechanised anywhere in this repository.
import { Rofl } from '../../../src/api.ts';
import { BOOT, encodeProgram, selfWorld, deadRules, verdicts } from '../../moot/demo.ts';
import * as fs from 'node:fs';

export function run(): string[] {
  const out: string[] = [];
  const r = new Rofl();
  r.load(BOOT, { budget: 400000 });
  r.evaluate();

  const enc = encodeProgram(r, [BOOT]);
  const self = selfWorld(enc);
  const dead = deadRules(self, enc);
  // The verdicts live in the [audit] perspective. Querying them without it
  // returns empty, and empty would have read as 'nothing dead here' — the
  // same misreading fragment 04 is about, one directory away.
  const v = verdicts(self);

  out.push('the audit layer of boot.rofl — where a retained rule-scanner lands,');
  out.push("and where fragment 01's rule now lives:");
  out.push(`  ${enc.rules} rules encoded as clauses over ${enc.dims} dimensions, ${enc.flags} relations as flags`);
  out.push('');
  out.push(`  unreachable relations: ${v.unreachable.sort().join(' ') || '(none)'}`);
  out.push(`  rules that can never fire in this store: ${dead.length}`);
  for (const d of dead) out.push(`    ${d.rule}  concluding ${d.rel}`);
  out.push(`  shadowed rule pairs: ${v.shadowed.length || '(none)'}`);
  out.push('');
  out.push('`undefined_premise` is not among the dead, which is the answer this');
  out.push('section was run to get. `forged[audit]` is: it reads `asserted_by`,');
  out.push('which nothing here populates, so it has been answering "clean" to');
  out.push('every program in the repository and would answer "clean" to a forged');
  out.push('fact too. An accumulated scanner set rots quietly, and this is what');
  out.push('proving it looks like.');
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  console.log(run().join('\n'));
}
