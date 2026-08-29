// Rotation 3: condition core statistics on INTEGER VISIBILITY (the diagonal).
// At depth k (2^k >> N): core classes with representative r <= N contain a small integer.
// Compare their profile vs the full core: density, A-histogram location, residue balance.
const T = t => (t % 2 === 0) ? t / 2 : (3 * t + 1) / 2;
let classes = [{ r: 1, t: T(1), a: 1 }];   // track full residue r now
const pow3 = [1]; for (let i = 1; i <= 42; i++) pow3[i] = pow3[i-1] * 3;
for (let k = 1; k < 24; k++) {
  const twoK = Math.pow(2, k), next = [];
  for (const c of classes)
    for (const ch of [{ r: c.r, t: c.t }, { r: c.r + twoK, t: c.t + pow3[c.a] }]) {
      const a2 = c.a + ch.t % 2;
      if (Math.pow(2, k + 1) < pow3[a2]) next.push({ r: ch.r, t: T(ch.t), a: a2 });
    }
  classes = next;
}
const k = 24, u = classes.length, twoK = Math.pow(2, 24);
console.log("depth", k, " u_k =", u, " core density =", (u/twoK*100).toFixed(3) + "%");
for (const N of [1e4, 1e5, 1e6]) {
  const small = classes.filter(c => c.r <= N);
  const exp = u * N / twoK;
  // A-profile comparison: mean exponent a among small vs all
  const meanA = arr => arr.reduce((s,c)=>s+c.a,0)/arr.length;
  // residue balance mod 3
  const prof = [0,0,0]; for (const c of small) prof[c.r % 3]++;
  console.log("N=" + N.toExponential(0),
    " observed", small.length, " expected(uniform)", exp.toFixed(1),
    " ratio", (small.length/exp).toFixed(3),
    " meanA small", small.length ? meanA(small).toFixed(2) : "-",
    " meanA all", meanA(classes).toFixed(2),
    " mod3 profile", JSON.stringify(prof));
}
// and: how many of the small-r core classes contain an integer that has ALREADY dropped below itself?
// (class-undecidedness is one-sided: the integer may drop anyway)
let dropped = 0, never = [];
for (const c of classes.filter(c => c.r <= 1e6)) {
  let n = c.r, t = n, drops = false;
  for (let j = 0; j < 2000; j++) { t = T(t); if (t < n) { drops = true; break; } }
  if (drops) dropped++; else never.push(n);
}
console.log("small-r core classes whose representative integer drops anyway:", dropped,
  " never-dropped (within 2000 steps):", never.slice(0, 10));
