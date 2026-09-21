// decision.ts — what a decision rests on, by side, and what stands between it and clear.
//   node --experimental-strip-types books/decision.ts <book> [decision]
import { world } from './crawl.ts';
const [book, want] = process.argv.slice(2);
if (!book) throw new Error('usage: decision.ts <book> [decision]');
const r = world(book);
const q = (t: string) => r.query(t).rows.map((x) => x.bindings);
const text = new Map(q('edge_any(I, R, X, Y)').map((e) => [e.I, `${e.R}(${e.X}, ${e.Y.length > 80 ? e.Y.slice(0, 80) + '…' : e.Y})`]));
const vol = new Map(q('in_volume(I, V)').map((x) => [x.I, x.V]));
const depth = new Map(q('depth(I, N)').map((x) => [x.I, x.N]));
const disch = new Map(q('discharges(K, T)').map((x) => [x.K, x.T]));
const src = new Map<string, string[]>();
for (const e of q('evidence(I, S, L)')) src.set(e.I, [...(src.get(e.I) ?? []), e.S]);
const has = (t: string) => q(t).length > 0;

function edge(id: string): void {
  console.log(`    ${id} [${vol.get(id)} d${depth.get(id)}] ${text.get(id)}`);
  for (const k of q(`standing(${id}, K)`).map((x) => x.K)) console.log(`        doubt ${k}  -> ${disch.get(k)}`);
  for (const a of q(`accepted_doubt(${id}, K, W, R)`)) console.log(`        accepted ${a.K} by ${a.W}, round ${a.R}`);
}
function side(title: string, ids: string[]): void {
  const sources = [...new Set(ids.flatMap((i) => src.get(i) ?? []))];
  console.log(`  ${title}: ${ids.length} edge${ids.length === 1 ? '' : 's'} from ${sources.length} source${sources.length === 1 ? '' : 's'}${sources.length ? ` (${sources.join(', ')})` : ''}`);
  for (const id of ids) edge(id);
}

for (const d of q('decision(D)').map((x) => x.D).filter((d) => !want || d === want)) {
  const state = has(`clear(${d})`) ? 'CLEAR' : 'CONDITIONAL';
  const asked = q(`edge_any(_, depends_on, ${d}, Q)`).map((x) => x.Q);
  const roles = asked.flatMap((qq) => q(`asks_as(${qq}, R)`).map((x) => x.R));
  console.log(`\n== ${d}: ${state}${roles.length ? `  (asked as ${roles.join(', ')})` : ''}`);
  for (const g of q(`grounded_outside(${d}, W)`)) console.log(`  grounded outside the book: ${g.W}`);
  const rests = new Set(q(`rests_on(${d}, I)`).map((x) => x.I));
  for (const c of q(`decides_on(${d}, C)`).map((x) => x.C)) {
    const grade = has(`contested(${c})`) ? 'contested' : has(`supported(${c})`) ? 'supported' : has(`refuted(${c})`) ? 'refuted' : 'unknown';
    console.log(`  claim ${c}: ${grade}`);
    const live = (id: string) => !has(`stale(${id})`) && !has(`withdrawn(${id}, _)`) && Number(depth.get(id)) > 0;
    const sup = q(`supports(I, ${c})`).map((x) => x.I).filter((i) => rests.has(i)).sort();
    const ref = q(`refutes(I, ${c})`).map((x) => x.I).filter((i) => rests.has(i)).sort();
    side('FOR', sup.filter(live));
    side('AGAINST', ref.filter(live));
    const out = [...sup, ...ref].filter((i) => !live(i));
    if (out.length) { console.log(`  OUT (depth 0, stale or withdrawn): ${out.length}`); for (const id of out) edge(id); }
    const neutral = q(`neutral(I, ${c})`).map((x) => x.I);
    if (neutral.length) console.log(`  neutral: ${neutral.join(', ')}`);
  }
  const blocking = new Map<string, number>();
  for (const id of rests) for (const k of q(`standing(${id}, K)`).map((x) => x.K)) if (has(`blocks(${k})`) || (k === 'single_source' && has(`conditional(${d})`))) blocking.set(k, (blocking.get(k) ?? 0) + 1);
  if (state === 'CONDITIONAL') console.log(`  blocking: ${[...blocking].map(([k, n]) => `${k} x${n} -> ${disch.get(k)}`).join('; ') || 'nothing standing'}`);
}
