// eta_k = u_k / 2^k, endTail_k / 2^k (the proved upper bound), per-step ratios.
const u = { 1:1,2:1,3:2,4:3,5:4,6:8,7:13,8:19,9:38,10:64,11:128,12:226,13:367,
  14:734,15:1295,16:2114,17:4228,18:7495,19:14990,20:27328 };
function chooseRow(k){const r=[1];for(let s=1;s<=k;s++)r[s]=r[s-1]*(k-s+1)/s;return r;}
for (const k of [8, 12, 16, 20]) {
  const eta = u[k] / 2 ** k;
  const row = chooseRow(k);
  let tail = 0; for (let s = 0; s <= k; s++) if (3 ** s > 2 ** k) tail += row[s];
  const tailD = tail / 2 ** k;
  console.log(`k=${k} eta=${eta.toFixed(5)} endTailDensity=${tailD.toFixed(5)} ratio_eta_per_step(from k-4)=${k>8?((u[k]/2**k)/(u[k-4]/2**(k-4)))**0.25:NaN}`);
}
// per-step eta ratio k=16..20 and LD heuristic rate
const r = ((u[20]/2**20)/(u[16]/2**16))**(1/4);
const gamma = Math.log(2)/Math.log(3);
const H = -(gamma*Math.log2(gamma) + (1-gamma)*Math.log2(1-gamma));
console.log('per-step eta ratio (k=16..20):', r.toFixed(4));
console.log('LD-heuristic asymptotic ratio 2^-(1-H(gamma)):', (2**-(1-H)).toFixed(4), '(gamma=log_3 2 =', gamma.toFixed(4), ', H =', H.toFixed(4), ')');
