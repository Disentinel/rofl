// The stage planner (docs/staged-evaluation.md, decisions 3 and 6): a corpus cut into stages that each fit a stated
// memory, every stage evaluated in an engine process of its own over the volume the last one kept.
//   stage_plan.ts FACTS LIMIT_MB [--files N] [--run] [--check]
// FACTS is a corpus of scripts/vscode_corpus.ts. First the imports: the files 250 at a time over ROFL_JOBS processes,
// each batch a world asking `module_target` alone over its own facts and every file's path facts. Then the plan: a file weighs its base
// facts times the bytes a fact costs (`plan_bytes_per_fact`, rules/stage-plan.rofl); the files that import one another
// by value (a ring; an `import type` carries no value) go in one stage; the rings, imported first, are packed into
// stages under the limit, and a ring heavier than the limit refuses the plan, naming it. The plan is written as facts
// and rules/stage-plan.rofl checks it. `--run` evaluates it: the first stage is the model, the question and its files;
// each next stage opens the volume the last kept and adds its files by delta; one JSON line a stage, its memory beside
// what the plan said. `--check` evaluates the same files whole as well and says whether the states are equal.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RoflPort } from '../runtime/port.ts';
import { MODEL_FILES } from '../notebook/front.ts';
import { NODE } from '../runtime/split.ts';
import { tarjan } from '../src/scc.ts';
import { PROFILE } from './goldens.ts';
import { jobs } from './pool.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const BIN = path.join(ROOT, 'rust/target', PROFILE, 'rofl');
const RULES = path.join(ROOT, 'rules/stage-plan.rofl');
const args = process.argv.slice(2);
const [factsPath, limitArg] = args;
const LIMIT = Number(limitArg) * 2 ** 20;
const opt = (k: string): string | undefined => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const N = Number(opt('--files') ?? Infinity);
const T = (): number => performance.now();
const say = (o: object): void => console.log(JSON.stringify(o));

// ------------------------------------------------------------------ the corpus, by file
const core: string[] = [];
const byNode = new Map<string, string[]>();
let open = '';
for (const raw of fs.readFileSync(factsPath, 'utf8').split('\n')) {
  if (!open && (!raw.trim() || raw.startsWith('--'))) continue;
  const line = open ? `${open}\n${raw}` : raw;
  if ((line.replace(/\\./g, '').match(/"/g)?.length ?? 0) % 2) { open = line; continue; }
  open = '';
  const p = [...line.matchAll(NODE)].map((m) => m[1])[0];
  if (!p) { core.push(line); continue; }
  if (!byNode.has(p)) { if (byNode.size >= N) continue; byNode.set(p, []); }
  byNode.get(p)!.push(line);
}
const pathOf = new Map<string, string>();
for (const [p, ls] of byNode) {
  const m = ls.find((l) => l.startsWith('ast_file['))?.match(/"((?:[^"\\]|\\.)*)"/);
  if (m) pathOf.set(p, m[1]);
}
const prefixes = [...byNode.keys()].filter((p) => pathOf.has(p));
const at = new Map(prefixes.map((p, i) => [pathOf.get(p)!, i]));
const fileOf = (node: string): number | undefined => at.get(pathOf.get(node.slice(1, 17)) ?? '');

// ------------------------------------------------------------------ the imports
const planRules = fs.readFileSync(RULES, 'utf8');
const bytesPerFact = Number(planRules.match(/^plan_bytes_per_fact\((\d+)\)\./m)?.[1]);
const t0 = T();
const edges: [number, number][] = [];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-plan-'));
const walls = { budget: 4_000_000_000, space: 40_000_000 };
const batches: number[][] = [];
for (let i = 0; i < prefixes.length; i += 250) batches.push(prefixes.slice(i, i + 250).map((_, j) => i + j));
let next = 0;
await Promise.all(Array.from({ length: Math.min(jobs(), batches.length) }, async (_, w) => {
  const p = await RoflPort.start(BIN);
  const file = path.join(dir, `imports-${w}.rofl`);
  for (let b = next++; b < batches.length; b = next++) {
    fs.writeFileSync(file, core.join('\n') + '\n' + batches[b].flatMap((i) => byNode.get(prefixes[i])!).join('\n') + '\n');
    const s = await p.fresh(walls.budget, { space: walls.space });
    for (const f of MODEL_FILES) await s.loadFile(path.join(ROOT, f));
    await s.load('asks(module_target).\nasks(type_only_site).');
    await s.loadFile(file);
    if ((await s.evaluate()).partial) throw new Error(`the imports of batch ${b} were cut by a wall`);
    const typeOnly = new Set((await s.ask('type_only_site[code](I)')).rows.map((r) => r[0]));
    for (const [site, target] of (await s.ask('module_target[code](I, T)')).rows) {
      const [x, y] = [fileOf(site), at.get(JSON.parse(target))];
      if (x !== undefined && y !== undefined && x !== y && !typeOnly.has(site)) edges.push([x, y]);
    }
    await s.close();
  }
  await p.stop();
  fs.rmSync(file, { force: true });
}));
const importMs = Math.round(T() - t0);

// ------------------------------------------------------------------ the plan
const weight = prefixes.map((p) => byNode.get(p)!.length * bytesPerFact);
const succ: number[][] = prefixes.map(() => []);
for (const [a, b] of edges) succ[a].push(b);
const comp = tarjan(succ);
const rings = new Map<number, number[]>();
comp.forEach((c, i) => rings.set(c, [...(rings.get(c) ?? []), i]));
const name = (i: number): string => pathOf.get(prefixes[i])!;
const q = (s: string): string => JSON.stringify(s);
// a component is numbered after every component it reaches: in that order, what is imported comes first
const stages: number[][] = [];
let cur: number[] = [], curW = 0;
const refused: string[] = [];
for (const c of [...rings.keys()].sort((a, b) => a - b)) {
  const fs_ = rings.get(c)!;
  const w = fs_.reduce((s, i) => s + weight[i], 0);
  if (w > LIMIT) {
    refused.push(`plan_refused(${q(name(fs_[0]))}, ${fs_.length}, ${Math.round(w / 2 ** 20)}).`);
    continue;
  }
  if (curW + w > LIMIT && cur.length) { stages.push(cur); cur = []; curW = 0; }
  cur.push(...fs_); curW += w;
}
if (cur.length) stages.push(cur);
const stageOf = new Map<number, number>();
stages.forEach((st, k) => st.forEach((i) => stageOf.set(i, k + 1)));
const facts: string[] = [`plan_limit(${Math.round(LIMIT / 2 ** 20)}).`];
prefixes.forEach((_, i) => facts.push(`plan_file(${q(name(i))}, ${byNode.get(prefixes[i])!.length}).`));
for (const [, fs_] of rings) if (fs_.length > 1) for (const i of fs_) facts.push(`plan_ring(${q(name(fs_[0]))}, ${q(name(i))}).`);
for (const [a, b] of edges) facts.push(`plan_import(${q(name(a))}, ${q(name(b))}).`);
for (const [i, k] of stageOf) facts.push(`plan_stage(${k}, ${q(name(i))}).`);
facts.push(...refused);
const planPath = path.join(dir, 'plan.rofl');
fs.writeFileSync(planPath, facts.join('\n') + '\n');
const state = execFileSync(BIN, ['load', path.join(ROOT, 'boot.rofl'), RULES, planPath], { encoding: 'utf8', maxBuffer: 1 << 30 });
const rows = (rel: string): string[] => state.split('\n').filter((l) => l.startsWith(`${rel}[`));
const ringSizes = [...rings.values()].map((r) => r.length).filter((n) => n > 1).sort((a, b) => b - a);
say({ files: prefixes.length, importMs, valueImports: edges.length, rings: ringSizes.length, largestRing: ringSizes[0] ?? 0,
  limitMb: LIMIT / 2 ** 20, bytesPerFact, stages: stages.length,
  stageMb: stages.map((st) => Math.round(st.reduce((s, i) => s + weight[i], 0) / 2 ** 20)), plan: planPath });
for (const l of [...rows('plan_alarm'), ...rows('plan_refusal')]) console.log(l);
if (rows('plan_refusal').length || rows('plan_alarm').length || !args.includes('--run')) process.exit(rows('plan_refusal').length || rows('plan_alarm').length ? 2 : 0);

// ------------------------------------------------------------------ the run
const question = path.join(ROOT, 'examples/vscode/side-effects.rofl');
const asks = ['side_effect_value', 'side_effect_site', 'side_effect_count', 'side_effect_env', 'side_effect_form'].map((r) => `asks(${r}).`).join('\n');
const memory = (p: RoflPort) => {
  const t = fs.readFileSync(`/proc/${(p as unknown as { child: { pid: number } }).child.pid}/status`, 'utf8');
  const kb = (k: string): number => Number(t.match(new RegExp(`${k}:\\s+(\\d+)`))![1]) >> 10;
  return { ownMb: kb('RssAnon'), mappedMb: kb('RssFile'), peakMb: kb('VmHWM') };
};
/** The files of a stage written where the engine reads them, the corpus's path and string facts first when asked. */
const fileOf_ = (name: string, st: number[], withCore = false): string => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, (withCore ? core.join('\n') + '\n' : '') + st.flatMap((i) => byNode.get(prefixes[i])!).join('\n') + '\n');
  return f;
};
type Sent = { port: { send(r: object): Promise<Record<string, unknown>> }; id: number };
let vol = '';
const got = path.join(dir, 'staged.state');
let port: RoflPort;
for (let k = 0; k < stages.length; k++) {
  port = await RoflPort.start(BIN);
  let t = T();
  let s, full: string | null = null;
  if (!vol) {
    s = await port.fresh(walls.budget, { space: walls.space });
    for (const f of MODEL_FILES) await s.loadFile(path.join(ROOT, f));
    await s.loadFile(question);
    await s.load(asks);
    await s.loadFile(fileOf_('stage.rofl', stages[k], true));
    await s.evaluate();
  } else {
    s = await port.open({ volumePath: vol, ...walls });
    const x = s as unknown as Sent;
    full = (await x.port.send({ op: 'load', session: x.id, path: fileOf_('stage.rofl', stages[k]) })).full as string | null;
    if (full) await s.evaluate();
  }
  const ms = Math.round(T() - t);
  const m = memory(port);
  const next = path.join(dir, `${k + 1}.vol`);
  t = T(); const bytes = await s.keep(next, true); const keepMs = Math.round(T() - t);
  say({ stage: k + 1, files: stages[k].length, planMb: Math.round(stages[k].reduce((a, i) => a + weight[i], 0) / 2 ** 20), ms, full, keepMs, volumeMb: Math.round(bytes / 2 ** 20), ...m });
  if (vol) fs.rmSync(vol);
  vol = next;
  if (k === stages.length - 1 && args.includes('--check')) await s.state(got);
  await port.stop();
}
if (args.includes('--check')) {
  port = await RoflPort.start(BIN);
  const s = await port.fresh(walls.budget, { space: walls.space });
  for (const f of MODEL_FILES) await s.loadFile(path.join(ROOT, f));
  await s.loadFile(question);
  await s.load(asks);
  await s.loadFile(fileOf_('whole.rofl', stages.flat(), true));
  let t = T();
  await s.evaluate();
  const ms = Math.round(T() - t);
  const m = memory(port);
  const bytes = await s.keep(path.join(dir, 'whole.vol'), true);
  say({ whole: stages.flat().length, ms, volumeMb: Math.round(bytes / 2 ** 20), ...m });
  const want = path.join(dir, 'whole.state');
  await s.state(want);
  await port.stop();
  const held = (f: string): string => execFileSync('sh', ['-c', `grep -v '^evaluated_again\\[' "$0" | sha256sum`, f], { encoding: 'utf8' });
  say({ sameState: held(got) === held(want) });
}
fs.rmSync(dir, { recursive: true, force: true });
