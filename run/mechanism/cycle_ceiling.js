// Where does the 2^71-floor cycle exclusion actually stop?
const ok = (j, a) => {  // condition from excl_table with j = j0+1
  const A = 2n ** BigInt(j) * 3n ** BigInt(a);
  const B = 2n ** 71n * (2n ** BigInt(a) * (2n ** BigInt(j) - 3n ** BigInt(a))) + 2n ** BigInt(j) * 2n ** BigInt(a);
  return A < B;
};
outer:
for (let j = 1; j <= 400; j++) {
  for (let a = 0; a <= j; a++) {
    if (3n ** BigInt(a) < 2n ** BigInt(j)) {
      if (!ok(j, a)) { console.log("first failure at length j =", j, "with a =", a); break outer; }
    }
  }
}
