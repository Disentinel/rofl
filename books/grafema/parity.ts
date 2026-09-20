// parity.ts — the parity table, counted over books/grafema/parity.rofl.
//   node --experimental-strip-types books/grafema/parity.ts
import { world } from '../crawl.ts';
const r = world('grafema');
const q = (t: string) => r.query(t).rows.map((x) => x.bindings);
const ctx = new Map(q('context(I, T)').map((x) => [x.I, x.T]));
const idOf = new Map(q('edge_any(I, offers, X, C)').map((x) => [`${x.X}|${x.C}`, x.I]));
for (const [a, b] of [['grafema', 'rofl'], ['rofl', 'grafema']]) {
  const par = q(`parity(${a}, ${b}, C)`).map((x) => x.C);
  const gap = q(`gap(${a}, ${b}, C)`).map((x) => x.C);
  console.log(`\n${a} -> ${b}: parity ${par.length} / ${par.length + gap.length}`);
  for (const c of par.sort()) { const t = ctx.get(idOf.get(`${a}|${c}`) ?? ''); console.log(`  = ${c}${t ? `   (${t})` : ''}`); }
  for (const c of gap.sort()) console.log(`  - ${c}`);
}
console.log('\nidle_equivalence:', q('idle_equivalence[audit](C, C2)').length);
