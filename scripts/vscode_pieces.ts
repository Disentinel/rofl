// The side-effect question's witnessed world (w_next_version_cutoff) evaluated in pieces, each in an engine process of
// its own (docs/staged-evaluation.md, decisions 2 and 4): the first loads the JS model, the first N files of FACTS and
// the question and evaluates under a clock of MS milliseconds; each next one opens the volume the last kept
// (`open` with `volumePath`) and goes on from where the clock stopped it (`resume`), until the evaluation ends.
//   vscode_pieces.ts FACTS N MS [--state FILE]
// One JSON line a piece (its evaluation time, whether it went on or evaluated again, the steps, the engine's own and
// mapped memory, the volume's size), then the total. `--state FILE` writes the finished world's canonical state.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { RoflPort } from '../runtime/port.ts';
import { MODEL_FILES } from '../notebook/front.ts';
import { NODE } from '../runtime/split.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const [factsPath, nArg, msArg, ...rest] = process.argv.slice(2);
const N = Number(nArg), MS = Number(msArg);
const stateOut = rest[rest.indexOf('--state') + 1];
const facts: string[] = []; const seen = new Set<string>(); let open = '';
for await (const raw of readline.createInterface({ input: fs.createReadStream(factsPath) })) {
  if (!open && (!raw.trim() || raw.startsWith('--'))) continue;
  const line = open ? `${open}\n${raw}` : raw;
  if ((line.replace(/\\./g, '').match(/"/g)?.length ?? 0) % 2) { open = line; continue; }
  open = '';
  const p = NODE.exec(line)?.[1]; NODE.lastIndex = 0;
  if (p && !seen.has(p)) { if (seen.size >= N) continue; seen.add(p); }
  facts.push(line);
}
const asks = ['side_effect_value', 'side_effect_site', 'side_effect_count', 'side_effect_env', 'side_effect_form'].map((r) => `asks(${r}).`).join('\n');
const walls = { budget: 4_000_000_000, space: 40_000_000 };
const bin = path.join(ROOT, `rust/target/${process.env.ROFL_PROFILE ?? 'release'}/rofl`);
const memory = (port: RoflPort) => {
  const t = fs.readFileSync(`/proc/${(port as unknown as { child: { pid: number } }).child.pid}/status`, 'utf8');
  const kb = (k: string) => Number(t.match(new RegExp(`${k}:\\s+(\\d+)`))![1]) >> 10;
  return { ownMb: kb('RssAnon'), mappedMb: kb('RssFile'), peakMb: kb('VmHWM') };
};
const T = () => performance.now();
const dir = fs.mkdtempSync('/tmp/rofl-pieces-');
const t0 = T();
let vol = '';
for (let piece = 1; ; piece++) {
  const port = await RoflPort.start(bin);
  const send = (r: Record<string, unknown>) => (port as unknown as { send(r: unknown): Promise<Record<string, unknown>> }).send(r);
  let t = T(); let s; let r: Record<string, unknown>;
  if (vol) {
    s = await port.open({ volumePath: vol, ...walls });
    const openMs = Math.round(T() - t); t = T();
    r = { openMs, ...(await send({ op: 'resume', session: (s as unknown as { id: number }).id, steps: walls.budget, limit: { ms: MS } })) };
  } else {
    s = await port.fresh(walls.budget, { space: walls.space });
    for (const f of MODEL_FILES) await s.loadFile(path.join(ROOT, f));
    await s.loadFile(path.join(ROOT, 'examples/vscode/side-effects.rofl'));
    await s.load(asks);
    for (let i = 0; i < facts.length; i += 200_000) await s.assert(facts.slice(i, i + 200_000).join('\n'));
    r = { loadMs: Math.round(T() - t) }; t = T();
    Object.assign(r, await send({ op: 'evaluate', session: (s as unknown as { id: number }).id, limit: { ms: MS } }));
  }
  const evalMs = Math.round(T() - t);
  const m = memory(port);
  const next = path.join(dir, `${piece}.vol`);
  t = T(); const bytes = await s.keep(next, true); const keepMs = Math.round(T() - t);
  console.log(JSON.stringify({ piece, loadMs: r.loadMs, openMs: r.openMs, evalMs, wentOn: r.resumed, steps: r.steps, partial: r.partial, keepMs, volumeMb: Math.round(bytes / 2 ** 20), ...m, hot: r.hot }));
  if (vol) fs.rmSync(vol);
  vol = next;
  if (!r.partial) {
    if (stateOut) await send({ op: 'state', session: (s as unknown as { id: number }).id, path: stateOut });
    await port.stop();
    break;
  }
  await port.stop();
}
fs.rmSync(dir, { recursive: true });
console.log(JSON.stringify({ files: seen.size, pieces: 'done', ms: Math.round(T() - t0) }));
