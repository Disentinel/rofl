// Rotation 1 (survivorship): are the NEGATIVE cycles' truncations in the core?
// truncation of a negative integer v at depth k is (2^k + v) i.e. v mod 2^k.
const T = t => (t % 2n === 0n) ? t / 2n : (3n * t + 1n) / 2n;
function undecided(k, r) {
  let t = r, a = 0n;
  for (let j = 1n; j <= k; j++) { a += t % 2n; t = T(t);
    if (2n ** j >= 3n ** a) return false; }
  return true;
}
for (const v of [-1n, -5n, -7n, -10n, -17n, -25n, -34n, -3n, -9n]) {
  let ok = true, firstFail = null;
  for (let k = 6n; k <= 40n; k++) {
    const r = ((v % (2n ** k)) + 2n ** k) % (2n ** k);
    if (!undecided(k, r)) { ok = false; firstFail = k; break; }
  }
  console.log(String(v).padStart(4), ok ? "IN CORE to depth 40" : "decided at depth " + firstFail);
}
