// The invariance-gap probe: does the core have ANY x3-compatible structure?
// S_k = core classes at depth k (subset of Z/2^k). Multiplication by 3 is a
// bijection of Z/2^k. Measure |3S ∩ S|/|S| vs the random-set null (= density).
// Also test the affine relatives 3r+1, 3r+2, and the halving relation.
const T = t => (t % 2 === 0) ? t / 2 : (3 * t + 1) / 2;
let classes = [{ r: 1, t: T(1), a: 1 }];
const pow3 = [1]; for (let i = 1; i <= 42; i++) pow3[i] = pow3[i-1] * 3;
const K = 22;
for (let k = 1; k < K; k++) {
  const twoK = Math.pow(2, k), next = [];
  for (const c of classes)
    for (const ch of [{ r: c.r, t: c.t }, { r: c.r + twoK, t: c.t + pow3[c.a] }]) {
      const a2 = c.a + ch.t % 2;
      if (Math.pow(2, k + 1) < pow3[a2]) next.push({ r: ch.r, t: T(ch.t), a: a2 });
    }
  classes = next;
}
const M = Math.pow(2, K), S = new Set(classes.map(c => c.r));
const u = S.size, density = u / M;
console.log("depth", K, " u =", u, " density =", (density*100).toFixed(3) + "%  (null overlap fraction)");
for (const [name, f] of [
  ["3r      ", r => (3*r) % M],
  ["3r+1    ", r => (3*r+1) % M],
  ["3r+2    ", r => (3*r+2) % M],
  ["r*inv3  ", null],  // computed below via multiplying set by 3 the other way
  ["r+1     ", r => (r+1) % M],
  ["2r      ", r => (2*r) % M],
  ["2r+1    ", r => (2*r+1) % M],
]) {
  if (!f) continue;
  let hit = 0;
  for (const r of S) if (S.has(f(r))) hit++;
  console.log(name, "overlap", (hit/u*100).toFixed(3) + "%", " ratio vs null", (hit/u/density).toFixed(2));
}
// the map r -> (r-1)/3 when 3 | r-1 (inverse odd branch direction):
let hit3 = 0, tot3 = 0;
for (const r of S) if ((r % 3) === 1) { tot3++; const q = ((r - 1) / 3) % M; if (S.has(q)) hit3++; }
console.log("(r-1)/3 on r≡1 mod 3: overlap", (hit3/tot3*100).toFixed(3) + "%", " ratio vs null", (hit3/tot3/density).toFixed(2));
