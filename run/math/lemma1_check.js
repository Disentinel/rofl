// Lemma 1 finite part: for each k, for each k-decided class r mod 2^k, compute the
// exact threshold theta_r = d / (2^j - 3^a) at the FIRST decided j, where
// T^j(n) = (3^a n + d) / 2^j on the class. If n > theta_r then T^j(n) < n, i.e.
// n drops within j + a <= 2k full steps. M_k = max over decided classes of
// floor(theta_r) is the exact cutoff: the inclusion slow => undecided is PROVED
// for ALL n > M_k (unconditionally), with n <= M_k checkable directly.
for (const k of [5, 6, 7, 8]) {
  let maxTheta = -1, argmax = -1, checked = 0;
  for (let r = 0; r < 2 ** k; r++) {
    let v = r === 0 ? 2 ** k : r;
    let a = 0, d = 0;
    let decided = false;
    for (let j = 1; j <= k; j++) {
      // exact d recurrence alongside the trajectory of the representative
      if (v % 2 === 0) { v = v / 2; }             // d unchanged, a unchanged
      else { d = 3 * d + 2 ** (j - 1); v = (3 * v + 1) / 2; a++; }
      // invariant check: T^j(rep) == (3^a * rep0 + d) / 2^j exactly
      const rep0 = r === 0 ? 2 ** k : r;
      if (v * 2 ** j !== 3 ** a * rep0 + d) throw new Error(`invariant broke k=${k} r=${r} j=${j}`);
      if (3 ** a < 2 ** j) {
        const denom = 2 ** j - 3 ** a;
        const theta = Math.floor(d / denom);
        if (theta > maxTheta) { maxTheta = theta; argmax = r; }
        decided = true; checked++;
        break;
      }
    }
  }
  console.log(JSON.stringify({ k, decided_classes: checked, M: maxTheta, argmax_class: argmax }));
}
