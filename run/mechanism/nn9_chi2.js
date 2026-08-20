// chi^2 of the core's residue profile vs multinomial null, mod 3 and mod 9.
// null: E[chi^2] = df = m-1 (2 for mod 3, 8 for mod 9).
const T = t => (t % 2 === 0) ? t / 2 : (3 * t + 1) / 2;
let classes = [{ r9: 1, t: T(1), a: 1 }];
const pow3 = [1]; for (let i = 1; i <= 40; i++) pow3[i] = pow3[i-1] * 3;
const chi = (prof) => { const m = prof.length, mean = prof.reduce((a,b)=>a+b,0)/m;
  return prof.reduce((s,x)=>s+(x-mean)*(x-mean),0)/mean; };
console.log("k   u_k      chi2_mod3(null=2)  chi2_mod9(null=8)  crossing?");
const rows3 = [], rows9 = [];
for (let k = 1; k <= 26; k++) {
  const p9 = new Array(9).fill(0), p3 = new Array(3).fill(0);
  for (const c of classes) { p9[c.r9]++; p3[c.r9 % 3]++; }
  // crossing at depth k->k+1: exists a with 2^(k+1) < 3^a < 2^(k+2)? relevant kick marker:
  // a crossing depth k is one where some 3^a lies in (2^k, 2^(k+1))
  let crossing = false;
  for (let a = 0; a <= 40; a++) if (Math.pow(2,k) < pow3[a] && pow3[a] < Math.pow(2,k+1)) crossing = true;
  if (k >= 8) { rows3.push(chi(p3)); rows9.push(chi(p9));
    console.log(String(k).padStart(2), String(classes.length).padStart(9),
      chi(p3).toFixed(3).padStart(12), chi(p9).toFixed(3).padStart(16), crossing ? "   X" : ""); }
  if (k === 26) break;
  const twoK = Math.pow(2, k) % 9, gatePow = Math.pow(2, k + 1), next = [];
  for (const c of classes)
    for (const ch of [{ r9: c.r9, t: c.t }, { r9: (c.r9 + twoK) % 9, t: c.t + pow3[c.a] }]) {
      const a2 = c.a + ch.t % 2;
      if (gatePow < pow3[a2]) next.push({ r9: ch.r9, t: T(ch.t), a: a2 });
    }
  classes = next;
}
const avg = a => a.reduce((x,y)=>x+y,0)/a.length;
console.log("\nmean chi2 mod3 over k=8..26:", avg(rows3).toFixed(3), "(null 2.0, suppression x" + (2/avg(rows3)).toFixed(1) + ")");
console.log("mean chi2 mod9 over k=8..26:", avg(rows9).toFixed(3), "(null 8.0, suppression x" + (8/avg(rows9)).toFixed(1) + ")");
