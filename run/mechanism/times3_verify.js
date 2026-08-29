// Verify at depth 20 and 24; test the odd-backward-branch closure exactly;
// check trivial explanations for 3S ∩ S = 0.
const T = t => (t % 2 === 0) ? t / 2 : (3 * t + 1) / 2;
const pow3 = [1]; for (let i = 1; i <= 42; i++) pow3[i] = pow3[i-1] * 3;
function coreSet(K) {
  let classes = [{ r: 1, t: T(1), a: 1 }];
  for (let k = 1; k < K; k++) {
    const twoK = Math.pow(2, k), next = [];
    for (const c of classes)
      for (const ch of [{ r: c.r, t: c.t }, { r: c.r + twoK, t: c.t + pow3[c.a] }]) {
        const a2 = c.a + ch.t % 2;
        if (Math.pow(2, k + 1) < pow3[a2]) next.push({ r: ch.r, t: T(ch.t), a: a2 });
      }
    classes = next;
  }
  return new Set(classes.map(c => c.r));
}
for (const K of [20, 24]) {
  const M = Math.pow(2, K), S = coreSet(K);
  const u = S.size;
  let h3 = 0, mult3 = 0;
  for (const r of S) { if (S.has((3*r) % M)) h3++; if (r % 3 === 0) mult3++; }
  console.log("K=" + K, "u=" + u, " |3S∩S|=" + h3, " core multiples of 3:", mult3,
    "(" + (mult3/u*100).toFixed(1) + "% — so 3S∩S=0 is NOT from absence of 3|r)");
  // odd backward branch closure: c in S, c ≡ 2 mod 3 → (2c−1)/3 in S? (mod M: needs exact division)
  let tot = 0, hit = 0;
  for (const c of S) if (c % 3 === 2) { tot++; const x = (2*c - 1) / 3;
    if (Number.isInteger(x) && S.has(x % M)) hit++; }
  console.log("   odd-backward-branch (2c-1)/3 integer-cases: closure", hit + "/" + tot,
    "(" + (hit/tot*100).toFixed(1) + "%)");
  // does S contain r and (2r+1) both -> then also chains? measure chain depth distribution quickly
  let h2 = 0; for (const r of S) if (S.has((2*r+1) % M)) h2++;
  console.log("   |(2S+1)∩S| =", h2, "(" + (h2/u*100).toFixed(1) + "%)");
}
