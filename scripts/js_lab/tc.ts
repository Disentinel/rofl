// tc.ts — ast_within as a sparse-matrix closure over the seed's ast_in facts, timed three ways.
//   node --experimental-strip-types tc.ts seeds/opt-40.seed.json
import * as fs from 'node:fs';
const seed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ids = new Map<string, number>(); const id = (s: string) => { let i = ids.get(s); if (i === undefined) { i = ids.size; ids.set(s, i); } return i; };
const edges: [number, number][] = []; // ast_in(C, P): C inside P
const seenE = new Set<string>(); for (const f of seed.facts) if (f.rel === 'ast_child') { const k = f.args[3].name + ' ' + f.args[0].name; if (!seenE.has(k)) { seenE.add(k); edges.push([id(f.args[3].name), id(f.args[0].name)]); } }
const n = ids.size; console.log(`ast_in rows ${edges.length}, nodes ${n}`);
// CSR: parent -> children (ast_within(P, C) walks down from P)
const deg = new Int32Array(n + 1); for (const [c, p] of edges) deg[p + 1]++; for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
const kids = new Int32Array(edges.length); const fill = deg.slice(0, n); for (const [c, p] of edges) kids[fill[p]++] = c;
// 1. tree-aware: every node's ancestor chain (the output is the work)
let t = performance.now(); const parent = new Int32Array(n).fill(-1); for (const [c, p] of edges) parent[c] = p;
let rows = 0; for (let c = 0; c < n; c++) for (let p = parent[c]; p >= 0; p = parent[p]) rows++;
console.log(`tree walk       rows ${rows}  ${(performance.now() - t).toFixed(1)} ms`);
// 2. generic semi-naive: delta(P, X) join ast_in(C, X) -> (P, C), dedup by bitset per P (a sparse boolean matrix product, row by row)
t = performance.now(); let rows2 = 0;
const seen = new Uint8Array(n);
for (let p = 0; p < n; p++) { // row p of the closure = BFS down from p
  let frontier = Array.from(kids.subarray(deg[p], deg[p + 1])); const touched: number[] = [];
  while (frontier.length) { const next: number[] = []; for (const x of frontier) { if (seen[x]) continue; seen[x] = 1; touched.push(x); rows2++; for (let k = deg[x]; k < deg[x + 1]; k++) next.push(kids[k]); } frontier = next; }
  for (const x of touched) seen[x] = 0;
}
console.log(`row-wise BFS    rows ${rows2}  ${(performance.now() - t).toFixed(1)} ms`);
// 3. the engine's shape: a hash set of pairs, rounds of delta join, no tree knowledge
t = performance.now(); let all = new Set<number>(); let delta: [number, number][] = edges.map(([c, p]) => [p, c]); for (const [p, c] of delta) all.add(p * n + c);
let round = 0; while (delta.length) { round++; const nd: [number, number][] = []; for (const [p, x] of delta) for (let k = deg[x]; k < deg[x + 1]; k++) { const c = kids[k], key = p * n + c; if (!all.has(key)) { all.add(key); nd.push([p, c]); } } delta = nd; }
console.log(`hashed rounds   rows ${all.size}  rounds ${round}  ${(performance.now() - t).toFixed(1)} ms`);
