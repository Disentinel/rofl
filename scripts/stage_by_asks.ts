// Two stages by asks (docs/staged-evaluation.md, decision 1): a world evaluated over the cone of LOWER, then the
// question's asks added to the evaluated world by delta, against the same world asking both at once, byte for byte.
//   stage_by_asks.ts FACTS N LOWER,...
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RoflPort } from '../runtime/port.ts';
import { MODEL_FILES } from '../notebook/front.ts';
import { NODE } from '../runtime/split.ts';
const ROOT = new URL('..', import.meta.url).pathname;
const [factsPath, nArg, lowerArg] = process.argv.slice(2);
const lower = lowerArg.split(',');
const upper = ['side_effect_value', 'side_effect_site', 'side_effect_count', 'side_effect_env', 'side_effect_form'];
const facts: string[] = []; const seen: string[] = [];
let open = '';
for (const raw of fs.readFileSync(factsPath, 'utf8').split('\n')) {
  if (!open && (!raw.trim() || raw.startsWith('--'))) continue;
  const line = open ? `${open}\n${raw}` : raw;
  if ((line.replace(/\\./g, '').match(/"/g)?.length ?? 0) % 2) { open = line; continue; }
  open = '';
  const p = [...line.matchAll(NODE)].map((m) => m[1])[0];
  if (p && !seen.includes(p)) { if (seen.length >= Number(nArg)) continue; seen.push(p); }
  if (p && !seen.includes(p)) continue;
  facts.push(line);
}
const asks = (rs: string[]) => rs.map((r) => `asks(${r}).`).join('\n');
const port = await RoflPort.start(path.join(ROOT, `rust/target/${process.env.ROFL_PROFILE ?? 'release'}/rofl-serve`));
async function world(rs: string[], more = '') {
  const s = await port.fresh(4_000_000_000, { space: 40_000_000 });
  for (const f of MODEL_FILES) await s.loadFile(path.join(ROOT, f));
  await s.loadFile(path.join(ROOT, 'examples/vscode/side-effects.rofl'));
  await s.load(asks(rs));
  await s.assert(facts.join('\n'));
  if (more) await s.assert(more);
  return s;
}
const T = () => performance.now();
let t = T(); const w = await world(lower, asks(upper)); await w.evaluate();
const whole = { ms: Math.round(T() - t), facts: (await w.factCount()).facts };
const want = await w.stateText(); await w.close?.();
t = T(); const s = await world(lower); await s.evaluate();
const lowerMs = Math.round(T() - t); const lowerFacts = (await s.factCount()).facts;
t = T(); const r = await s.add(asks(upper)); const upperMs = Math.round(T() - t);
const got = await s.stateText();
if (process.env.DIFF) { fs.writeFileSync(process.env.DIFF + '.want', want); fs.writeFileSync(process.env.DIFF + '.got', got); }
console.log(JSON.stringify({ files: seen.length, lower, whole, lowerMs, lowerFacts, upperMs, full: r.full, facts: (await s.factCount()).facts, sameState: got === want }));
await port.stop();
