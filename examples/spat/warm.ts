// warm.ts — WARM LAYERS (S3h, 2026-09-21): which relations a layer can change,
// decided statically by examples/warm/volatility.rofl over the kernel's book
// of the rules, and `spat volatility [<layer>]` to print it. Every CLI call
// rebuilds the world from nothing (3.6 s of CPU on the fixture week); a warm
// snapshot of the fixpoint below a layer is honest only for the relations
// that layer cannot take back — `stable` copied, `monotone` added to,
// `volatile` recomputed — and this is the census that says which is which.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Rofl } from '../../src/api.ts';
import { must, type Store } from './store.ts';

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
