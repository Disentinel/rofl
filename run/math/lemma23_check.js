// Lemma 3: u_k = # binary strings p_1..p_k with 3^{s_j} > 2^j for all j<=k
// (s_j = partial sum). Pure lattice DP — a THIRD independent computation of u_k,
// with no trajectory simulation. Exact integer arithmetic only (3^s, 2^j fit
// in float53 for k<=20; comparisons exact).
// Lemma 2: u_{k+1} = 2*u_k - w_k, where w_k = # dominated length-k strings with
// 3^{s_k} < 2^{k+1}; and the 1-extension ALWAYS survives since
// 3^{s+1} = 3*3^s > 3*2^k > 2^{k+1}. Doubling u_{k+1} = 2u_k iff no power of 3
// lies in (2^k, 2^{k+1}) — at most one can (powers of 3 are 3x apart).
const P3 = [1]; for (let i = 1; i <= 21; i++) P3[i] = P3[i - 1] * 3;
const K = 20;
// D[j] = Map s -> count of dominated length-j strings with sum s
let D = new Map([[0, 1]]);
const u = [1]; // u_0 = 1 (empty string vacuously dominated)
const w = [];
const table = { 4: 3, 5: 4, 6: 8, 7: 13, 8: 19, 9: 38, 10: 64, 11: 128, 12: 226,
  13: 367, 14: 734, 15: 1295, 16: 2114, 17: 4228, 18: 7495, 19: 14990, 20: 27328 };
let ok = true;
for (let j = 1; j <= K; j++) {
  const N = new Map();
  for (const [s, c] of D) {
    for (const p of [0, 1]) {
      const s2 = s + p;
      if (P3[s2] > 2 ** j) N.set(s2, (N.get(s2) ?? 0) + c); // dominated at j
    }
  }
  D = N;
  u[j] = [...D.values()].reduce((a, b) => a + b, 0);
  w[j] = [...D.entries()].filter(([s]) => P3[s] < 2 ** (j + 1)).reduce((a, [, c]) => a + c, 0);
  const expect = table[j];
  const cls = expect !== undefined ? (u[j] === expect ? 'MATCH' : `MISMATCH(exp ${expect})`) : '';
  if (expect !== undefined && u[j] !== expect) ok = false;
  const pow3InGap = P3.some((p) => p > 2 ** j && p < 2 ** (j + 1));
  console.log(`k=${j} u=${u[j]} w=${w[j]} ${cls} pow3_in_gap=${pow3InGap}`);
}
// Lemma 2 identity check across all k
for (let j = 1; j < K; j++) {
  if (u[j + 1] !== 2 * u[j] - w[j]) { console.log(`IDENTITY FAILS at k=${j}`); ok = false; }
}
console.log(ok ? 'ALL CHECKS PASS: DP==classification (k=4..20), u_{k+1}=2u_k-w_k (k=1..19)'
               : 'CHECK FAILURES ABOVE');
