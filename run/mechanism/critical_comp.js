// Composition of the CRITICAL set at each crossing depth:
// (a) chi2 of criticals' mod-3 profile vs uniform (null df=2)
// (b) MI(parity; residue mod 3) within criticals (vs permutation null)
// (c) kick decomposition: dying-child residue imbalance, and which source explains it.
const T = t => (t % 2 === 0) ? t / 2 : (3 * t + 1) / 2;
let classes = [{ r9: 1, t: T(1), a: 1 }];
const pow3 = [1]; for (let i = 1; i <= 42; i++) pow3[i] = pow3[i-1] * 3;
const log2 = Math.log2;
console.log("k    #crit  chi2_crit(df2)  MI_bits      MI_null_est   |kick| (L1 of dying imbalance)");
for (let k = 1; k <= 26; k++) {
  const gatePow = Math.pow(2, k + 1);
  // critical at depth k: undecided with 3^a <= 2^(k+1)
  const crit = classes.filter(c => pow3[c.a] <= gatePow);
  if (crit.length >= 30) {
    // joint table: residue mod 3 x parity of t
    const tab = [[0,0],[0,0],[0,0]];
    for (const c of crit) tab[c.r9 % 3][c.t % 2]++;
    const n = crit.length;
    const rows = tab.map(r => r[0] + r[1]);
    const cols = [tab[0][0]+tab[1][0]+tab[2][0], tab[0][1]+tab[1][1]+tab[2][1]];
    // chi2 of rows vs uniform
    const mean = n / 3;
    const chi2 = rows.reduce((s,x) => s + (x-mean)*(x-mean), 0) / mean;
    // MI in bits
    let mi = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      if (tab[i][j] > 0) mi += (tab[i][j]/n) * log2( (tab[i][j]/n) / ((rows[i]/n)*(cols[j]/n)) );
    }
    // finite-sample null MI approx: (df)/(2 ln2 n) = (3-1)(2-1)/(2 ln2 n)
    const miNull = 2 / (2 * Math.LN2 * n);
    // dying children: for critical class, the EVEN child dies. Even child is r if t even, else r+2^k.
    const twoK3 = Math.pow(2, k) % 3;
    const dying = [0,0,0];
    for (const c of crit) {
      const dr = (c.t % 2 === 0) ? (c.r9 % 3) : ((c.r9 + twoK3) % 3);
      dying[dr]++;
    }
    const dmean = n / 3;
    const kickL1 = dying.reduce((s,x) => s + Math.abs(x - dmean), 0);
    console.log(String(k).padStart(2), String(n).padStart(7), chi2.toFixed(3).padStart(12),
      mi.toFixed(6).padStart(12), miNull.toFixed(6).padStart(12), kickL1.toFixed(1).padStart(10),
      " dying:", JSON.stringify(dying), " rows:", JSON.stringify(rows));
  }
  if (k === 26) break;
  const twoK = Math.pow(2, k) % 9, next = [];
  for (const c of classes)
    for (const ch of [{ r9: c.r9, t: c.t }, { r9: (c.r9 + twoK) % 9, t: c.t + pow3[c.a] }]) {
      const a2 = c.a + ch.t % 2;
      if (Math.pow(2, k+1) < pow3[a2]) next.push({ r9: ch.r9, t: T(ch.t), a: a2 });
    }
  classes = next;
}
