const T = t => (t % 2n === 0n) ? t / 2n : (3n * t + 1n) / 2n;
function Aof(k, r) { let t = r, a = 0n; for (let j = 0n; j < k; j++) { a += t % 2n; t = T(t); } return [a, null]; }
function bit(k, r) { let t = r; for (let j = 0n; j < k; j++) t = T(t); return t % 2n; }
let r = 0n, word = [];
for (let k = 0n; k < 40n; k++) {
  const [a] = Aof(k, r);
  const crit = 3n ** a <= 2n ** (k + 1n);
  const b = bit(k, r);
  const takeSelf = crit ? (b === 1n) : (b === 0n);
  r = takeSelf ? r : r + 2n ** k;
  word.push(crit ? 1 : 0);
}
console.log("stair truncations parity word (Sturmian of log2 3):", word.join(""));
console.log("final truncation:", r.toString());
