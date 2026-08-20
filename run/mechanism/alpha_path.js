// greedy alpha path, exact big-int arithmetic
const T = t => (t % 2n === 0n) ? t / 2n : (3n * t + 1n) / 2n;
// indU k r: compute A j r for j=1..k, check gates 2^j < 3^(A j)
function undecided(k, r) {
  let t = r, a = 0n;
  for (let j = 1n; j <= k; j++) {
    a += t % 2n; t = T(t);
    if (2n ** j >= 3n ** a) return false;
  }
  return true;
}
let r = 0n, out = [];
for (let k = 0n; k < 80n; k++) {
  const cand = r;                      // child 1: same residue
  const child2 = r + 2n ** k;
  r = undecided(k + 1n, cand) ? cand : child2;
  out.push(r);
}
console.log(out.map(String).join(" "));
