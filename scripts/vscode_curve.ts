// One point of the side-effect question's curve (w_next_version_cutoff), on the Rust engine (rofl-serve, release):
//   vscode_curve.ts DIR N MODE [--space ROWS] [--budget STEPS] [--census FILE] [--why K]
// loads the JS model, DIR/facts-*.rofl up to N files (scripts/vscode_corpus.ts corpus) and examples/vscode/side-effects.rofl
// into a fresh world, evaluates it and prints one JSON line: facts, load and eval time, peak RSS of the engine, the
// answers. MODE: `full` (sealed, every rule), `cone` (sealed, asks of the question), `witnessed` (asks, provenance kept).
// `--census FILE` writes the world's relations by facts; `--why K` prints the why of K answers with a literal value
// and K with a node.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RoflPort } from '../runtime/port.ts';
import { MODEL_FILES } from '../notebook/front.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const [dir, nArg, mode, ...rest] = process.argv.slice(2);
const opt = (k: string) => { const i = rest.indexOf(k); return i < 0 ? undefined : rest[i + 1]; };
const space = Number(opt('--space') ?? 40_000_000), budget = Number(opt('--budget') ?? 4_000_000_000);
const chunks = fs.readdirSync(dir).flatMap((f) => /^facts-(\d+)\.rofl$/.exec(f) ?? []).map(Number).sort((a, b) => a - b);
const n = Number(nArg);
if (!chunks.includes(n) || !['full', 'cone', 'witnessed'].includes(mode)) { console.error(`N is one of ${chunks.join(', ')}; MODE full, cone or witnessed`); process.exit(64); }

const port = await RoflPort.start(path.join(ROOT, `rust/target/${process.env.ROFL_PROFILE ?? 'release'}/rofl-serve`));
const pid = (port as unknown as { child: { pid: number } }).child.pid;
const status = (k: string) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] ?? 0) / 1024;
const s = await port.fresh(budget, { space });
const t0 = performance.now();
for (const f of MODEL_FILES) await s.loadFile(path.join(ROOT, f));
for (const c of chunks.filter((c) => c <= n)) await s.loadFile(path.join(dir, `facts-${c}.rofl`));
await s.loadFile(path.join(ROOT, 'examples/vscode/side-effects.rofl'));
const asked = ['side_effect_value', 'side_effect_site', 'side_effect_count', 'side_effect_env'];
await s.load([...(mode !== 'witnessed' ? ['sealed(provenance).'] : []), ...(mode !== 'full' ? asked.map((r) => `asks(${r}).`) : [])].join('\n'));
const loadMs = performance.now() - t0, loadRss = status('VmRSS');
const t1 = performance.now();
const ev = await s.evaluate();
const evalMs = performance.now() - t1, peakRss = status('VmHWM');
const count = async (q: string) => (await s.ask(q)).rows.length;
const counts = (await s.ask('side_effect_count(F, N, V)')).rows.map((r) => r.join(' '));
const out = {
  files: n, mode, space, budget, loadMs: Math.round(loadMs), loadRssMb: Math.round(loadRss),
  evalMs: Math.round(evalMs), peakRssMb: Math.round(peakRss), partial: ev.partial, steps: ev.steps, peakRows: ev.peakRows,
  values: await count('side_effect_value(S, F, V)'), sites: await count('side_effect_site(S, F)'), counts,
  facts: (await s.factCount()).facts,
};
console.log(JSON.stringify(out));
const census = opt('--census');
if (census) {
  const tmp = `${census}.state`;
  await s.state(tmp);
  const by = new Map<string, number>();
  for (const line of fs.readFileSync(tmp, 'utf8').split('\n')) { const m = /^([a-z_$][\w$]*(?:\[[^\]]*\])?)\(/.exec(line); if (m) by.set(m[1], (by.get(m[1]) ?? 0) + 1); }
  fs.rmSync(tmp);
  fs.writeFileSync(census, [...by].sort((a, b) => b[1] - a[1]).map(([r, k]) => `${k}\t${r}`).join('\n') + '\n');
}
const k = Number(opt('--why') ?? 0);
if (k) {
  const rows = (await s.ask('side_effect_value(S, F, V)')).rows;
  const lit = rows.filter((r) => r[2].startsWith('"') || /^\d/.test(r[2])), node = rows.filter((r) => !lit.includes(r));
  for (const r of [...lit.slice(0, k), ...node.slice(0, k)]) {
    const q = `side_effect_value(${r.join(', ')})`;
    console.log(`\n== why ${q}\n${await s.why(q)}`);
  }
}
await port.stop();
