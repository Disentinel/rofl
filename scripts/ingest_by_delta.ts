// Ingest by delta (docs/staged-evaluation.md): the core evaluated once, then each file of a corpus chunk added to the
// evaluated world by the addition path, against the same files evaluated whole; the states must be equal byte for byte.
//   ingest_by_delta.ts FACTS N [sealed]     FACTS: a chunk of scripts/vscode_corpus.ts; N: its first N files
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RoflPort } from '../runtime/port.ts';
import { MODEL_FILES } from '../notebook/front.ts';
import { NODE } from '../runtime/split.ts';
const ROOT = new URL('..', import.meta.url).pathname;
const [factsPath, nArg, mode] = process.argv.slice(2);
const N = Number(nArg);
const core: string[] = []; const byP = new Map<string, string[]>();
let open = '';
for (const raw of fs.readFileSync(factsPath, 'utf8').split('\n')) {
  if (!open && (!raw.trim() || raw.startsWith('--'))) continue;
  const line = open ? `${open}\n${raw}` : raw;
  if ((line.replace(/\\./g, '').match(/"/g)?.length ?? 0) % 2) { open = line; continue; }
  open = '';
  const ps = new Set([...line.matchAll(NODE)].map((m) => m[1]));
  if (ps.size === 0) { core.push(line); continue; }
  const p = [...ps][0];
  if (!byP.has(p)) byP.set(p, []);
  byP.get(p)!.push(line);
}
const files = [...byP].slice(0, N);
const asks = ['side_effect_value', 'side_effect_site', 'side_effect_count', 'side_effect_env', 'side_effect_form'].map((r) => `asks(${r}).`).join('\n');
const port = await RoflPort.start(path.join(ROOT, `rust/target/${process.env.ROFL_PROFILE ?? 'release'}/rofl-serve`));
async function world() {
  const s = await port.fresh(4_000_000_000, { space: 40_000_000 });
  for (const f of MODEL_FILES) await s.loadFile(path.join(ROOT, f));
  await s.loadFile(path.join(ROOT, 'examples/vscode/side-effects.rofl'));
  await s.load((mode === 'sealed' ? 'sealed(provenance).\n' : '') + asks);
  await s.assert(core.join('\n'));
  return s;
}
const T = () => performance.now();
// whole
let t = T(); const w = await world();
for (const [, ls] of files) await w.assert(ls.join('\n'));
const ew = await w.evaluate(); const whole = { ms: Math.round(T() - t), facts: (await w.factCount()).facts, partial: ew.partial };
const wantState = await w.stateText(); await w.close?.();
// stream
t = T(); const s = await world(); await s.evaluate(); const coreMs = Math.round(T() - t);
const per: number[] = []; const fulls: Record<string, number> = {};
for (const [, ls] of files) {
  const t1 = T(); const r = await s.add(ls.join('\n'));
  if (r.full) fulls[r.full] = (fulls[r.full] ?? 0) + 1;
  per.push(T() - t1);
}
const stream = { ms: Math.round(T() - t), coreMs, facts: (await s.factCount()).facts };
const same = (await s.stateText()) === wantState;
per.sort((a, b) => a - b);
console.log(JSON.stringify({ files: files.length, mode: mode ?? 'witnessed', whole, stream, sameState: same, fileMedianMs: Math.round(per[per.length >> 1]), fileMaxMs: Math.round(per[per.length - 1]), fileSumMs: Math.round(per.reduce((a, b) => a + b, 0)), fulls }));
await port.stop();
