// u_k for k = 1..40 via TWO independent implementations (BigInt exact):
// (1) forward DP over (sum s) rows; (2) memoized recursion on (j, s) written
// against the recurrence directly. Also checks Lemma 2's doubling criterion
// (u doubles iff no 3-power in (2^k, 2^{k+1})) across the whole range.
const K = 40;
const P3 = [1n]; for (let i = 1; i <= K + 2; i++) P3[i] = P3[i - 1] * 3n;
const P2 = [1n]; for (let i = 1; i <= K + 2; i++) P2[i] = P2[i - 1] * 2n;
// impl 1: forward DP
function forward() {
  let D = new Map([[0, 1n]]);
  const u = [1n];
  for (let j = 1; j <= K; j++) {
    const N = new Map();
    for (const [s, c] of D) for (const p of [0, 1]) {
      const s2 = s + p;
      if (P3[s2] > P2[j]) N.set(s2, (N.get(s2) ?? 0n) + c);
    }
    D = N;
    u[j] = [...D.values()].reduce((a, b) => a + b, 0n);
  }
  return u;
}
// impl 2: memoized recursion, counting strings by remaining choices
// g(j, s) = # dominated length-j strings with sum s (top-down)
const memo = new Map();
function g(j, s) {
  if (s < 0 || s > j) return 0n;
  if (j > 0 && P3[s] <= P2[j]) return 0n; // not dominated at j
  if (j === 0) return s === 0 ? 1n : 0n;
  const key = j * 100 + s;
  if (memo.has(key)) return memo.get(key);
  const v = g(j - 1, s) + g(j - 1, s - 1);
  memo.set(key, v);
  return v;
}
function topdown() {
  const u = [1n];
  for (let j = 1; j <= K; j++) {
    let t = 0n;
    for (let s = 0; s <= j; s++) t += g(j, s);
    u[j] = t;
  }
  return u;
}
const a = forward(), b = topdown();
let ok = true;
for (let k = 1; k <= K; k++) if (a[k] !== b[k]) { ok = false; console.log('MISMATCH k=' + k); }
// doubling criterion check
let critOk = true;
for (let k = 1; k < K; k++) {
  const doubles = a[k + 1] === 2n * a[k];
  const gapEmpty = !P3.some((p) => p > P2[k] && p < P2[k + 1]);
  if (doubles !== gapEmpty) { critOk = false; console.log('CRITERION FAILS k=' + k); }
}
console.log('impls agree:', ok, '| doubling criterion holds k=1..39:', critOk);
console.log('u_30 =', a[30].toString(), ' u_40 =', a[40].toString());
console.log('eta_40 =', (Number(a[40]) / 2 ** 40).toExponential(3),
  '| per-step eta ratio k=36..40:', ((Number(a[40]) / 2 ** 40) / (Number(a[36]) / 2 ** 36)) ** 0.25);
