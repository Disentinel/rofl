// Independent validation of MY coupling transition table (cross-check vs agent A1 later).
// State (i, d): x = 3^i * s + d. Transitions driven by parity of s (and d):
//   d even, s odd : (i, (3d + 1 - 3^i)/2)
//   d even, s even: (i, d/2)
//   d odd,  s odd : (i-1, (d - 3^(i-1))/2)   [requires i >= 1; letters differ]
//   d odd,  s even: (i+1, (3d + 1)/2)         [letters differ]
// merge = (0,0); decouple = i=0 with d odd.
const T = t => (t % 2n === 0n) ? t / 2n : (3n * t + 1n) / 2n;
const pow3 = i => 3n ** BigInt(i);
let checked = 0, failures = 0, merges = 0, decouples = 0, alive = 0;
const mergeSteps = [];
for (let trial = 0; trial < 100000; trial++) {
  let s = 2n * BigInt(Math.floor(Math.random() * 1e12)) + 1n;   // random odd
  let x = 3n * s + 2n;
  let i = 1, d = 2n;
  for (let j = 0; j < 200; j++) {
    // invariant check
    if (x !== pow3(i) * s + d) { failures++; break; }
    checked++;
    if (i === 0 && d === 0n) { merges++; mergeSteps.push(j); break; }
    if (i === 0 && d % 2n !== 0n) { decouples++; break; }
    const sOdd = (s % 2n === 1n), dOdd = ((d % 2n + 2n) % 2n === 1n);
    // predicted next state
    let ni = i, nd;
    if (!dOdd && sOdd)       { nd = (3n * d + 1n - pow3(i)) / 2n; }
    else if (!dOdd && !sOdd) { nd = d / 2n; }
    else if (dOdd && sOdd)   { ni = i - 1; nd = (d - pow3(i - 1)) / 2n; }
    else                     { ni = i + 1; nd = (3n * d + 1n) / 2n; }
    s = T(s); x = T(x); i = ni; d = nd;
    if (j === 199) alive++;
  }
}
console.log("invariant checks:", checked, " FAILURES:", failures);
console.log("merges:", merges, " decouples:", decouples, " still coupled at 200:", alive);
if (mergeSteps.length) {
  mergeSteps.sort((a,b)=>a-b);
  console.log("merge time median:", mergeSteps[Math.floor(mergeSteps.length/2)],
    " p90:", mergeSteps[Math.floor(mergeSteps.length*0.9)]);
}
