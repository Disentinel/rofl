// First-drop horizon: for n = 3 mod 4 up to N, the maximum number of FULL steps
// until the orbit first falls below n (the quantity the run's sdist/fdist
// horizons chase). Computed exactly; overflow-guarded.
for (const N of [199, 999, 9999, 99999]) {
  let maxSteps = 0, argmax = 0, maxVal = 0n;
  for (let n = 3; n <= N; n += 4) {
    let v = BigInt(n); let j = 0;
    while (v >= BigInt(n)) {
      v = v % 2n === 0n ? v / 2n : 3n * v + 1n;
      j++;
      if (v > maxVal) maxVal = v;
      if (j > 5000) throw new Error('runaway at ' + n);
    }
    if (j > maxSteps) { maxSteps = j; argmax = n; }
  }
  console.log(JSON.stringify({ N, max_first_drop_steps: maxSteps, argmax, max_value_seen: maxVal.toString() }));
}
