// dp100.js — dominated-string DP to k = 100, exact BigInt.
// Outputs: u_k checkpoints; per-step eta-ratio windows (data for the
// lemma4_observed_rate_unproven flag); the exact doubling-failure ladder
// (k with a 3-power in (2^k, 2^(k+1))), its gap word, and w_k/u_k losses.
const K = 160;
// dp[s] = number of dominated strings of current length j with sum s
let dp = [1n]; // j = 0
const u = [1n];
const pow3 = [1n];
for (let i = 1; i <= K + 1; i++) pow3.push(pow3[i - 1] * 3n);
const failures = [];
for (let j = 1; j <= K; j++) {
  const p2 = 1n << BigInt(j);
  const next = new Array(j + 1).fill(0n);
  for (let s = 0; s <= j; s++) {
    if (pow3[s] > p2) {
      next[s] = (dp[s] ?? 0n) + (s > 0 ? (dp[s - 1] ?? 0n) : 0n);
    }
  }
  // w_{j-1} = 2*u_{j-1} - u_j  (loss at this extension step)
  const uj = next.reduce((a, b) => a + b, 0n);
  const w = 2n * u[j - 1] - uj;
  if (w > 0n) {
    // find the 3-power in (2^(j-1), 2^j)
    let a = 0;
    while (pow3[a] <= (1n << BigInt(j - 1))) a++;
    const inGap = pow3[a] < (1n << BigInt(j));
    failures.push({ k: j - 1, a, inGap, w: w.toString(), u_prev: u[j - 1].toString() });
  }
  dp = next;
  u.push(uj);
}
// checkpoints
for (const k of [20, 40, 60, 80, 100, 120, 140, 160]) {
  const eta = Number(u[k] * 10n ** 20n / (1n << BigInt(k))) / 1e20;
  console.log(`u_${k} = ${u[k]}  eta = ${eta.toExponential(3)}`);
}
// per-step ratio windows (geometric mean over the window)
for (const [a, b] of [[20, 40], [40, 60], [60, 80], [80, 100], [100, 130], [130, 160]]) {
  const ratio = Math.pow(Number(u[b] * 10n ** 15n / u[a]) / 1e15 / Math.pow(2, b - a), 1 / (b - a)) * 2;
  // eta_b/eta_a = (u_b/u_a)/2^(b-a); per-step = that^(1/(b-a))
  const per = Math.pow(Number(u[b] * 10n ** 15n / u[a]) / 1e15 / Math.pow(2, b - a), 1 / (b - a));
  console.log(`eta per-step ratio k=${a}..${b}: ${per.toFixed(5)}`);
}
// the ladder
console.log(`doubling failures (k such that u_{k+1} < 2 u_k): ${failures.length} of ${K}`);
const ks = failures.map(f => f.k);
console.log('failure ks:', ks.join(','));
const gaps = ks.slice(1).map((k, i) => k - ks[i]);
console.log('gap word  :', gaps.join(''));
// exact Beatty check: failure at k <=> exists a with 2^k < 3^a < 2^(k+1)
// <=> k = floor(a*log2(3)) for that a; verify positions match floor exactly.
let beattyOK = true;
let boundary = 0;
failures.forEach((f) => {
  if (f.k === 0) { boundary++; return; } // known k=0 boundary case: w_0=1, no 3-power in (1,2) — the Lean iff starts at k=1
  const lo = pow3[f.a];
  const kk = BigInt(f.k);
  if (!((1n << kk) < lo && lo < (1n << (kk + 1n)))) beattyOK = false;
});
console.log('every failure k>=1 brackets its 3-power exactly (2^k < 3^a < 2^{k+1}):', beattyOK, '| k=0 boundary cases:', boundary);
// least-squares fit: log eta_k = log c - alpha*log k + k*log r on k = 40..K
{
  const pts = [];
  for (let k = 40; k <= K; k++) {
    const eta = Number(u[k] * 10n ** 30n / (1n << BigInt(k))) / 1e30;
    pts.push([k, Math.log(k), Math.log(eta)]);
  }
  // design: [1, -logk, k] -> solve normal equations 3x3
  let S = [[0,0,0],[0,0,0],[0,0,0]], b = [0,0,0];
  for (const [k, lk, le] of pts) {
    const row = [1, -lk, k];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) S[i][j] += row[i]*row[j]; b[i] += row[i]*le; }
  }
  // gaussian elim
  for (let i = 0; i < 3; i++) {
    const p = S[i][i];
    for (let j = i; j < 3; j++) S[i][j] /= p; b[i] /= p;
    for (let r2 = 0; r2 < 3; r2++) if (r2 !== i) { const f = S[r2][i]; for (let j = i; j < 3; j++) S[r2][j] -= f*S[i][j]; b[r2] -= f*b[i]; }
  }
  console.log(`fit eta_k ~ c*k^-alpha*r^k on k=40..${K}: alpha = ${b[1].toFixed(3)}, r = ${Math.exp(b[2]).toFixed(5)}, c = ${Math.exp(b[0]).toFixed(3)}`);
}
// loss fractions at failures
const lossFracs = failures.slice(-5).map(f => (Number(BigInt(f.w) * 10n ** 6n / BigInt(f.u_prev)) / 1e6).toFixed(4));
console.log('w_k/u_k at last 5 failures:', lossFracs.join(', '));
// hypothesis test: eta_k * k / lambda^k -> const, lambda = 2^-(1-H(log_3 2))
{
  const g = Math.log(2) / Math.log(3);
  const H = -g * Math.log2(g) - (1 - g) * Math.log2(1 - g);
  const lam = Math.pow(2, -(1 - H));
  console.log(`lambda = 2^-(1-H) = ${lam.toFixed(6)} (H(log_3 2) = ${H.toFixed(6)})`);
  for (const k of [40, 80, 120, 160]) {
    const eta = Number(u[k] * 10n ** 30n / (1n << BigInt(k))) / 1e30;
    console.log(`k=${k}: eta*k/lambda^k = ${(eta * k / Math.pow(lam, k)).toFixed(4)}`);
  }
}
