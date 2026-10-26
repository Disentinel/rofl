// scripts/addcheck.ts — THE ADDITION DELTA, HELD TO THE FRESH WORLD BOTH ENGINES ARE HELD TO.
//
//   node --experimental-strip-types scripts/addcheck.ts [world ...]
//
// Incremental addition is a Rust capability (CLAUDE.md, "Rust is the engine"):
// the TypeScript engine evaluates again. Its parity is checked through the
// fresh world: `npm test` holds `rofl load`'s fresh state to the golden the
// TypeScript engine is held to, and this holds the delta to `rofl load`, byte
// for byte. Each world `npm test` loads one file at a time (no ticks, walls,
// strata, explain bridge or refusal fixture) is split in two: its first half
// is loaded into a `rofl serve` session and evaluated, and the second half is
// loaded into the evaluated world (`Session::load_delta`: facts and rules),
// then the state is read. A world of one file is split inside the file, at a
// clause boundary. A split the engine refuses to load (a declaration after
// what it declares) is skipped and counted. Every addition evaluated again
// instead of by delta says why, and the reasons are counted.
//
// The same worlds are also SPLIT IN STAGES (docs/staged-evaluation.md, item 1): the relations the world's rules
// conclude, by the layers of what they read, the lower half asked first (`asks`), evaluated, kept as a
// volume and opened again, the upper half's asks added to the opened world; against the world asking both at once.
// A world whose rules make fewer than two layers does not split. An upper stage evaluated again keeps the lower stage
// it was opened with (engine/layer.rs): a lower relation it evaluates again is a red.
//
// Rust release (rust/target/$ROFL_PROFILE/rofl serve and rofl load); the
// sessions run in one rofl serve, the worlds one at a time.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RoflPort, type RoflSession } from '../runtime/port.ts';
import { worlds, placed, expectedRefusal, PROFILE } from './goldens.ts';
import { belowFiles } from './agg_select.ts';
import { parseProgram } from '../src/parser.ts';
import { indexer, tarjan } from '../src/scc.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOAD = path.join(ROOT, 'rust/target', PROFILE, 'rofl');
const BOOT = path.join(ROOT, 'boot.rofl');
const want = new Set(process.argv.slice(2));

/** A file's text cut at a clause boundary near its middle: a line ending a clause outside a string or a comment. */
function halves(text: string): [string, string] | null {
  const lines = text.split('\n');
  let quoted = false;
  const ends: number[] = [];
  lines.forEach((l, i) => {
    let esc = false;
    for (const c of l.startsWith('--') ? '' : l) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') quoted = !quoted;
    }
    if (!quoted && /\.\s*(--.*)?$/.test(l) && !l.startsWith('--')) ends.push(i);
  });
  if (ends.length < 2) return null;
  const cut = ends[Math.floor(ends.length / 2) - 1];
  return [lines.slice(0, cut + 1).join('\n') + '\n', lines.slice(cut + 1).join('\n')];
}

/** The relations the files' rules conclude, each with its layer: one above the highest layer of what its rules read
 *  outside its own recursion. */
function layers(files: string[]): Map<string, number> {
  const g = indexer();
  const heads = new Set<string>();
  const rels = (x: unknown, into: Set<string>): Set<string> => {
    if (Array.isArray(x)) for (const y of x) rels(y, into);
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o.rel === 'string' && Array.isArray(o.args)) into.add(o.rel);
      for (const v of Object.values(o)) rels(v, into);
    }
    return into;
  };
  for (const f of files) {
    for (const c of parseProgram(fs.readFileSync(f, 'utf8'))) {
      if (!c.body.length) continue;
      heads.add(c.head.rel);
      const h = g.id(c.head.rel);
      for (const r of rels(c.body, new Set())) g.succ[h].push(g.id(r));
    }
  }
  const comp = tarjan(g.succ);
  const layer = new Array<number>(Math.max(0, ...comp) + 1).fill(0);
  const members = layer.map(() => [] as number[]);
  comp.forEach((c, i) => members[c].push(i));
  members.forEach((ms, c) => {
    for (const i of ms) for (const j of g.succ[i]) if (comp[j] !== c) layer[c] = Math.max(layer[c], layer[comp[j]] + 1);
  });
  return new Map([...heads].map((r) => [r, layer[comp[g.find(r)!]]]));
}

/** A state without the kernel's `evaluated_again` rows, which record that an addition was evaluated again, not what
 *  the world holds. */
const held = (state: string): string => state.split('\n').filter((l) => !l.startsWith('evaluated_again[')).join('\n');

/** `asks` of every relation named, as ROFL. */
const asks = (rels: string[]): string => rels.map((r) => `asks(${r}).`).join('\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'addcheck-'));
const port = await RoflPort.start();
async function staged(name: string, files: string[]): Promise<'split' | 'single' | string> {
  const st = layers(files);
  const ns = [...new Set(st.values())].sort((a, b) => a - b);
  if (ns.length < 2) return 'single';
  const mid = ns[Math.floor((ns.length - 1) / 2)];
  const lower = [...st].filter(([, n]) => n <= mid).map(([r]) => r).sort();
  const upper = [...st].filter(([, n]) => n > mid).map(([r]) => r).sort();
  const world = async (more: string): Promise<RoflSession> => {
    const s = await port.fresh();
    await s.loadFile(BOOT);
    for (const f of files) await s.loadFile(f);
    await s.add(more);
    return s;
  };
  const w = await world(asks([...lower, ...upper]));
  let want: string;
  try { await w.evaluate(); want = held(await w.stateText()); } finally { await w.close(); }
  const s0 = await world(asks(lower));
  const vol = path.join(tmp, 'lower.volume');
  try { await s0.evaluate(); await s0.keep(vol, true); } finally { await s0.close(); }
  const s = await port.open({ volumePath: vol });
  try {
    const r = await s.add(asks(upper));
    if (r.full === null || r.full === undefined) stageDeltas++;
    else stageFulls.push(`${name}: ${r.full}`);
    const again = ((await s.evaluate()).again ?? []).filter((x) => lower.includes(x));
    if (again.length) bad.push(`${name} (stages): the lower stage evaluated again: ${again.join(', ')}`);
    const got = held(await s.stateText());
    if (got === want) return 'split';
    fs.writeFileSync(path.join(tmp, `${name}.staged`), got);
    fs.writeFileSync(path.join(tmp, `${name}.whole`), want);
    const [a, b] = [got.split('\n'), want.split('\n')];
    const i = a.findIndex((l, j) => l !== b[j]);
    return `line ${i + 1}\n  staged: ${a[i]}\n  whole:  ${b[i]}`;
  } finally {
    await s.close();
    fs.rmSync(vol, { force: true });
  }
}
const stageFulls: string[] = [];
let [split, single, stageDeltas] = [0, 0, 0];
const reasons = new Map<string, number>();
let [checked, deltas, fulls, skipped] = [0, 0, 0, 0];
const bad: string[] = [];
try {
  for (const w0 of worlds()) {
    if (want.size && !want.has(w0.name)) continue;
    if (w0.together || w0.ticks || w0.budget || w0.cap || w0.space || w0.strata || w0.explain || w0.retract?.length || w0.oneEngine === 'ts') continue;
    const w = placed(w0);
    if (w.files.some((f) => !fs.existsSync(f) || expectedRefusal(f)) || belowFiles(w.files).length) continue;
    let fresh: string;
    try {
      fresh = execFileSync(LOAD, ['load', BOOT, ...w.files], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { continue; }
    try {
      const r = await staged(w.name, w.files);
      if (r === 'split') split++;
      else if (r === 'single') single++;
      else bad.push(`${w.name} (stages): ${r}`);
    } catch (e) { bad.push(`${w.name} (stages): ${(e as Error).message.split('\n')[0]}`); }
    const texts = w.files.map((f) => fs.readFileSync(f, 'utf8'));
    if (!texts.length) continue;
    let first: string[], rest: string[];
    if (texts.length > 1) {
      const k = Math.ceil(texts.length / 2);
      [first, rest] = [texts.slice(0, k), texts.slice(k)];
    } else {
      const h = halves(texts[0]);
      if (!h) { skipped++; continue; }
      [first, rest] = [[h[0]], [h[1]]];
    }
    const s = await port.fresh();
    try {
      await s.loadFile(BOOT);
      for (const t of first) await s.load(t);
      await s.evaluate();
      let ok = true;
      for (const t of rest) {
        let r: Record<string, unknown>;
        try {
          r = await port.send({ op: 'load', session: s.id, rofl: t });
        } catch { ok = false; break; }
        if (r.full === null || r.full === undefined) deltas++;
        else {
          fulls++;
          for (const why of String(r.full).split('; ')) reasons.set(why, (reasons.get(why) ?? 0) + 1);
        }
      }
      if (!ok) { skipped++; continue; }
      await s.evaluate();
      const got = held(await s.stateText());
      checked++;
      if (got !== held(fresh)) {
        const [a, b] = [got.split('\n'), held(fresh).split('\n')];
        const i = a.findIndex((l, j) => l !== b[j]);
        bad.push(`${w.name}: line ${i + 1}\n  delta: ${a[i]}\n  fresh: ${b[i]}`);
        fs.writeFileSync(path.join(tmp, `${w.name}.delta`), got);
        fs.writeFileSync(path.join(tmp, `${w.name}.fresh`), fresh);
      }
    } finally {
      await s.close();
    }
  }
} finally {
  await port.stop();
}
const rate = (n: number): string => `${((100 * n) / Math.max(1, deltas + fulls)).toFixed(0)}%`;
console.log(`${checked} worlds split and added to, ${skipped} skipped (a split that does not load), ${deltas} additions by delta (${rate(deltas)}), ${fulls} evaluated again (${rate(fulls)})`);
for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${why}`);
console.log(`${split} worlds evaluated in two stages, the lower kept as a volume and opened (${single} hold one layer), ${stageDeltas} upper stages by delta`);
for (const f of stageFulls) console.log(`  ${f}`);
if (bad.length) {
  console.log(`\n${bad.length} differ from the fresh world (states in ${tmp}):\n${bad.join('\n')}`);
  process.exit(1);
}
fs.rmSync(tmp, { recursive: true, force: true });
