// decision.ts — what a decision rests on, and what stands between it and clear.
//   node --experimental-strip-types books/decision.ts <book> [decision]
import { world } from './crawl.ts';
const [book, want] = process.argv.slice(2);
if (!book) throw new Error('usage: decision.ts <book> [decision]');
const r = world(book);
const q = (t: string) => r.query(t).rows.map((x) => x.bindings);
const text = new Map(q('edge_any(I, R, X, Y)').map((e) => [e.I, `${e.R}(${e.X}, ${e.Y.length > 90 ? e.Y.slice(0, 90) + '…' : e.Y})`]));
const vol = new Map(q('in_volume(I, V)').map((x) => [x.I, x.V]));
const depth = new Map(q('depth(I, N)').map((x) => [x.I, x.N]));
const disch = new Map(q('discharges(K, T)').map((x) => [x.K, x.T]));
for (const d of q('decision(D)').map((x) => x.D).filter((d) => !want || d === want)) {
  const state = q(`clear(${d})`).length ? 'CLEAR' : 'CONDITIONAL';
  console.log(`\n== ${d}: ${state}`);
  for (const c of q('claim(C)').map((x) => x.C)) {
    const g = q(`contested(${c})`).length ? 'contested' : q(`supported(${c})`).length ? 'supported' : q(`refuted(${c})`).length ? 'refuted' : 'unknown';
    console.log(`claim ${c}: ${g}`);
  }
  const ids = [...new Set(q(`rests_on(${d}, I)`).map((x) => x.I))].sort();
  for (const id of ids) {
    const st = q(`standing(${id}, K)`).map((x) => x.K);
    const acc = q(`accepted_doubt(${id}, K, W, R)`).map((x) => `${x.K} by ${x.W}`);
    console.log(`  ${id} [${vol.get(id)} d${depth.get(id)}] ${text.get(id)}`);
    for (const k of st) console.log(`      doubt ${k}  -> ${disch.get(k)}`);
    for (const a of acc) console.log(`      accepted ${a}`);
  }
}
