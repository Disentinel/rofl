// scripts/retract_passes.ts — how each retraction of the golden worlds is taken: by the set's pass (`set`), or
// evaluated whole (`full`, with the engine's reason). Every world of facts/checks.rofl with `check_opt(W, retract, F)`
// is loaded by `rofl load --retract F...` on the build ROFL_PROFILE names (release by default), and the line the engine
// writes on stderr for each retraction is read. Prints a line per retraction, then the count by pass; `--check N`
// exits 1 when more than N go whole or any goes by another pass.
//
//   node --experimental-strip-types scripts/retract_passes.ts [--check N]
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { placed, worlds } from './goldens.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const BIN = path.join(ROOT, 'rust/target', process.env.ROFL_PROFILE || 'release', 'rofl');
const ci = process.argv.indexOf('--check');
const most = ci >= 0 ? Number(process.argv[ci + 1]) : null;

const tally = new Map<string, number>();
for (const w0 of worlds()) {
  if (!w0.retract?.length) continue;
  const w = placed(w0);
  const args = ['load', path.join(ROOT, 'boot.rofl'), ...(w.budget ?? w.cap ? ['--budget', String(w.budget ?? w.cap)] : []), ...(w.strata ? ['--strata'] : []),
    ...w.retract.flatMap((f) => ['--retract', f]), ...w.files];
  const r = spawnSync(BIN, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  for (const l of String(r.stderr).split('\n').filter((l) => l.startsWith('retract '))) {
    const pass = l.includes('evaluated again, ') ? 'full' : l.includes('set: Some') ? 'set' : 'other';
    tally.set(pass, (tally.get(pass) ?? 0) + 1);
    console.log(`${w.name}\t${pass}\t${pass === 'full' ? l.split('evaluated again, ')[1] : l.slice(8, l.indexOf(':'))}`);
  }
}
const n = (k: string) => tally.get(k) ?? 0;
console.log(`retractions ${n('set') + n('full') + n('other')}: set ${n('set')}, full ${n('full')}, other ${n('other')}`);
if (most !== null && (n('full') > most || n('other') > 0)) process.exit(1);
