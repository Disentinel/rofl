// scripts/structures.ts — THE DETECTION REPORT (docs/data-structures.md, "Detection"): what the engine would
// propose to declare over a world, read-only, from the Rust release build.
//
//   node --experimental-strip-types scripts/structures.ts [--min-rows N] <files>   boot.rofl, then the files
//   node --experimental-strip-types scripts/structures.ts --check                  the proof fixture against its committed report
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const RUST = path.join(ROOT, 'rust/target', process.env.ROFL_PROFILE || 'release', 'rofl');
const FIXTURE = 'rust/rofl/tests/fixtures/structures_proof';
const run = (args: string[]): string => execFileSync(RUST, ['load', '--propose-structures', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

const args = process.argv.slice(2);
if (args.includes('--check')) {
  const got = run([path.join(ROOT, `${FIXTURE}.facts`)]);
  if (got === fs.readFileSync(path.join(ROOT, `${FIXTURE}.report`), 'utf8')) { console.log(`  ok    ${FIXTURE}.report`); process.exit(0); }
  console.log(`  FAIL  the report over ${FIXTURE}.facts is not ${FIXTURE}.report`);
  process.exit(1);
}
const min = args.indexOf('--min-rows');
const files = args.filter((a, i) => !a.startsWith('--') && (min < 0 || i !== min + 1));
process.stdout.write(run([...(min >= 0 ? ['--structures-min-rows', args[min + 1]] : []), path.join(ROOT, 'boot.rofl'), ...files]));
