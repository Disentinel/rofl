// scripts/derivations.ts — THE CONFORMANCE CONTRACT, as consequences of
// derivation rather than as bytes.
//
// `canonicalState()` compares three things at once: which facts hold, which
// derivations produced them, and HOW THE STORE SPELLS AND ORDERS ITS KEYS. The
// third is not a consequence of a program; it is a property of one engine's
// representation, and holding a second engine to it costs real design --
// a total order over facts by spelling, which is exactly what a columnar store
// that spills to disk cannot maintain cheaply.
//
// So the contract for a second engine is this dump, and the difference from
// `canonicalState` is deliberate in both directions:
//
//   STRONGER on provenance. `canonicalState` records ONE witness per fact --
//   the least firing signature -- and a count. This records the WHOLE support
//   hypergraph: every firing of every fact. Which derivations exist is a
//   consequence of the program; which one an engine renders first is not.
//
//   WEAKER on presentation. Nothing here depends on the order a store keeps
//   its facts in, or on a key's collation. The dump is sorted AT EXPORT, once,
//   by the comparator below -- so the ordering is the reader's, not a per-fact
//   invariant the writer must carry.
//
// A key is still SPELLED here, because two engines need a common name for the
// same fact and the canonical rendering is the one both already agree on. That
// is a naming for comparison, not a storage or ordering requirement: an engine
// may materialise a key only when asked for this dump and never otherwise.
//
// usage: node --experimental-strip-types scripts/derivations.ts <seed.json> [--ticks N]

import type { FactStore } from '../src/store.ts';
import { sigOf } from '../src/engine.ts';

/** Every consequence of deriving this store, as text a second engine can be
 *  held to. Sorted at export; the store's own order is not read. */
export function derivations(store: FactStore): string {
  const lines: string[] = [`tick ${store.tick}`];
  for (const k of [...store.allFactKeys()].sort()) {
    const r = store.get(k)!;
    lines.push(`f ${k} ${r.scope} ${r.base ? 'base' : 'drv'}${r.frozen ? ' frozen' : ''}`);
    // THE WHOLE HYPERGRAPH, one line per firing, sorted by signature. A rule
    // id and a premise list is what a derivation IS; the order they arrived in
    // is what it is not.
    const sigs = store.witnessesOf(k).map((w) => `${w.ruleId}|${w.prems.map(sigOf).join('|')}`);
    for (const s of sigs.sort()) lines.push(`  d ${s}`);
  }
  for (const t of [...store.tickLog].sort()) lines.push(`t ${t}`);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const { Rofl } = await import('../src/api.ts');
  const fs = await import('node:fs');
  const argv = process.argv.slice(2);
  const seed = argv.find((a) => !a.startsWith('--'));
  const ti = argv.indexOf('--ticks');
  const ticks = ti >= 0 ? Number(argv[ti + 1]) : 0;
  if (!seed) { console.error('usage: derivations.ts <seed.json> [--ticks N]'); process.exit(2); }
  const r = Rofl.fromSnapshot(fs.readFileSync(seed, 'utf8'));
  if (ticks > 0) for (let i = 0; i < ticks; i++) r.tickAdvance();
  else r.evaluate();
  process.stdout.write(derivations(r.store) + '\n');
}
