// warm.ts — WARM LAYERS (S3h, 2026-09-21): which relations a layer can change,
// decided statically by examples/warm/volatility.rofl over the kernel's book
// of the rules, and `spat volatility [<layer>]` to print it. Every CLI call
// rebuilds the world from nothing (3.6 s of CPU on the fixture week); a warm
// snapshot of the fixpoint below a layer is honest only for the relations
// that layer cannot take back — `stable` copied, `monotone` added to,
// `volatile` recomputed — and this is the census that says which is which.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { Rofl } from '../../src/api.ts';
import type { Clause } from '../../src/unify.ts';
import { BOOT } from './spat.ts';
import { must, type Env, type Store } from './store.ts';
import { showClause, type Volume } from './volume.ts';

const WARM = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../warm');
export const VOLATILITY = fs.readFileSync(path.join(WARM, 'volatility.rofl'), 'utf8');
export const LAYERS = fs.readFileSync(path.join(WARM, 'spat-layers.rofl'), 'utf8');

export interface Volatility { layer: string; stable: string[]; monotone: string[]; volatile: Map<string, string[]>; facts: { stable: number; monotone: number; volatile: number; total: number } }
/** The classifier over the store's own rules, in a fork: per layer, the relations by class and the facts they hold. */
export function volatility(r: Rofl, layers?: string[]): Volatility[] {
  const f = r.fork();
  must(f.assert(`${VOLATILITY}\n${LAYERS}`), 'volatility.rofl');
  f.evaluate();
  const byRel = new Map<string, number>();
  for (const k of r.store.allFactKeys()) { const rel = k.slice(0, k.indexOf('[')); byRel.set(rel, (byRel.get(rel) ?? 0) + 1); }
  const sum = (ps: Iterable<string>): number => [...ps].reduce((a, p) => a + (byRel.get(p) ?? 0), 0);
  const names = (q: string): string[] => [...new Set(f.query(q).rows.map((x) => String(x.bindings.P)))].sort();
  return (layers ?? names('layer(P)')).map((layer) => {
    const volatile = new Map<string, string[]>();
    for (const x of f.query(`volatile(P, ${layer}, W)`).rows) { const p = String(x.bindings.P); if (!volatile.has(p)) volatile.set(p, []); volatile.get(p)!.push(String(x.bindings.W)); }
    const stable = names(`stable(P, ${layer})`); const monotone = names(`monotone(P, ${layer})`);
    return { layer, stable, monotone, volatile, facts: { stable: sum(stable), monotone: sum(monotone), volatile: sum(volatile.keys()), total: byRel.size === 0 ? 0 : [...byRel.values()].reduce((a, b) => a + b, 0) } };
  });
}

/** `spat volatility [<layer>]`: the count per class and the volatile relations with why, the nearest negation first. */
export function run(s: Store, rest: string[]): number {
  const vs = volatility(s.r, rest.length > 0 ? rest : undefined);
  if (vs.length === 0) { console.log('слоёв нет: layer_edb в examples/warm/spat-layers.rofl'); return 2; }
  for (const v of vs) {
    console.log(`слой ${v.layer}: стабильных ${v.stable.length} (${v.facts.stable} фактов) · монотонных ${v.monotone.length} (${v.facts.monotone}) · летучих ${v.volatile.size} (${v.facts.volatile}) — из ${v.stable.length + v.monotone.length + v.volatile.size} отношений, ${v.facts.total} фактов`);
    const why = (ws: string[]): string => { const own = ws.filter((w) => w.startsWith('not(')); return own.length > 0 ? own.sort().join(' ') : ws.sort().join(' '); };
    const rows = [...v.volatile].map(([p, ws]) => ({ p, own: ws.some((w) => w.startsWith('not(')), why: why(ws) })).sort((a, b) => Number(b.own) - Number(a.own) || (a.p < b.p ? -1 : 1));
    for (const x of rows) console.log(`  volatile(${x.p}, ${v.layer}, ${x.why})`);
    if (v.monotone.length > 0) console.log(`  монотонные: ${v.monotone.join(' ')}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// the snapshot of the lower layers — boot + the programme + the world + the users + the family's book, evaluated

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const sha = (s: string): string => createHash('sha1').update(s).digest('hex');
/** THE KERNEL'S FINGERPRINT: a snapshot is the fixpoint of a program under one engine, and an engine that changed
 *  is a different fixpoint. Every source of the kernel and its three programmes, hashed once per process. */
let kernelHash: string | undefined;
const kernel = (): string => {
  if (kernelHash === undefined) {
    const files = [...fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.ts')).sort().map((f) => path.join(ROOT, 'src', f)), ...['boot.rofl', 'policy.rofl', 'safety.rofl'].map((f) => path.join(ROOT, f))];
    kernelHash = sha(files.map((f) => `${path.basename(f)}\n${fs.readFileSync(f, 'utf8')}`).join('\n'));
  }
  return kernelHash;
};

export interface Lower { program: string; facts: string; rows: Clause[]; hh: Clause[]; }
/** Where a tenant's warm snapshots live: beside the volume, one file per header hash, a `.sha` beside each. */
export const warmDir = (e: Env): string => path.join(e.root, `${e.tenant}.warm`);
/** What the snapshot is a function of: the kernel, boot, the programme text, the loader's constant facts, every row of
 *  the world and users books, every fact and clause of the family's book — as text, in canonical order. */
export const header = (l: Lower): string => sha([kernel(), BOOT, l.program, l.facts, ...l.rows.map(showClause).sort(), ...l.hh.map(showClause).sort()].join('\n'));

/** THE LOWER LAYERS, WARM OR COLD. The snapshot named by the header is restored when its content hash holds; else the
 *  layers are built by `build`, evaluated, and saved for the next call — atomically, and never over a file that is
 *  being read. A corrupt file (its `.sha` does not match) is rejected and rewritten. Reuse is OFF on the restored
 *  store: measured 2026-09-21 on the fixture, the per-relation reuse plan costs more than the fixpoint it saves
 *  (882 ms against 215 ms), and a full re-derivation over the restored base is byte-identical to the cold path by
 *  construction. `SPAT_WARM_LOG=1` says which path was taken, on stderr. */
const held = new Map<string, Rofl>();
export function warmLower(e: Env, vol: Volume, l: Lower, build: (r: Rofl) => void): Rofl {
  const dir = warmDir(e); const h = header(l); const file = path.join(dir, `${h}.json`); const side = `${file}.sha`;
  const log = (m: string): void => { if (process.env.SPAT_WARM_LOG === '1') console.error(`warm: ${m}`); };
  void vol;
  // IN A LONG PROCESS (`spat serve`) the lower layers are held BASE-ONLY and forked per call — measured 2026-09-21: a
  // fork of the base store is 2 ms, of the evaluated one 30, and with reuse off the fixpoint over either is the same
  const keep = (r: Rofl): Rofl => { const b = new Rofl({ reuse: false }); must(b.load(BOOT), 'boot.rofl'); build(b); held.set(h, b); return r; };
  const have = held.get(h);
  if (have) { log(`held ${h.slice(0, 12)} — forked`); return have.fork(); }
  if (fs.existsSync(file) && fs.existsSync(side)) {
    const text = fs.readFileSync(file, 'utf8');
    if (sha(text) === fs.readFileSync(side, 'utf8').trim()) { log(`restored ${path.basename(file)} (${(text.length / 1e6).toFixed(1)} MB)`); return keep(Rofl.fromSnapshot(text, { reuse: false })); }
    log(`rejected ${path.basename(file)}: content hash moved — cold`);
  } else log(`no snapshot ${h.slice(0, 12)} — cold`);
  const r = new Rofl({ reuse: false });
  must(r.load(BOOT), 'boot.rofl');
  build(r);
  r.evaluate();
  const text = r.save();
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text); fs.writeFileSync(`${tmp}.sha`, sha(text));
  fs.renameSync(`${tmp}.sha`, side); fs.renameSync(tmp, file);
  log(`saved ${path.basename(file)} (${(text.length / 1e6).toFixed(1)} MB)`);
  return keep(r);
}
