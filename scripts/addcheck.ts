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
// Rust release (rust/target/$ROFL_PROFILE/rofl serve and rofl load); the
// sessions run in one rofl serve, the worlds one at a time.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RoflPort } from '../runtime/port.ts';
import { worlds, placed, expectedRefusal, PROFILE } from './goldens.ts';
import { belowFiles } from './agg_select.ts';

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

const port = await RoflPort.start();
const reasons = new Map<string, number>();
let [checked, deltas, fulls, skipped] = [0, 0, 0, 0];
const bad: string[] = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'addcheck-'));
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
      const got = await s.stateText();
      checked++;
      if (got !== fresh) {
        const [a, b] = [got.split('\n'), fresh.split('\n')];
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
if (bad.length) {
  console.log(`\n${bad.length} differ from the fresh world (states in ${tmp}):\n${bad.join('\n')}`);
  process.exit(1);
}
fs.rmSync(tmp, { recursive: true, force: true });
