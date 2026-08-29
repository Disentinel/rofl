// Per-class test: does the coupling walk EXACTLY predict w(3r+2) from w(r),
// and does the flip-survival criterion exactly characterize 3r+2 ∈ S?
const T = t => (t % 2 === 0) ? t / 2 : (3 * t + 1) / 2;
const pow3i = [1]; for (let i = 1; i <= 42; i++) pow3i[i] = pow3i[i-1] * 3;
const K = 20;
// build core with words
let classes = [{ r: 1, t: T(1), a: 1 }];
for (let k = 1; k < K; k++) {
  const twoK = Math.pow(2, k), next = [];
  for (const c of classes)
    for (const ch of [{ r: c.r, t: c.t }, { r: c.r + twoK, t: c.t + pow3i[c.a] }]) {
      const a2 = c.a + ch.t % 2;
      if (Math.pow(2, k + 1) < pow3i[a2]) next.push({ r: ch.r, t: T(ch.t), a: a2 });
    }
  classes = next;
}
const S = new Set(classes.map(c => c.r));
const M = Math.pow(2, K);
const word = (n, len) => { const w = []; let t = n; for (let j = 0; j < len; j++) { w.push(t % 2); t = T(t); } return w; };
const dominated = w => { let a = 0; for (let j = 0; j < w.length; j++) { a += w[j]; if (Math.pow(2, j+1) >= pow3i[a]) return false; } return true; };
// walk-predict w(3r+2) from w(r): state (i,d), letter_x = (letter_s + d%2) % 2
function predictWord(ws) {
  let i = 1, d = 2, out = [];
  for (const ls of ws) {
    if (i === 0 && d === 0) { out.push(ls); continue; }          // merged
    const dOdd = ((d % 2) + 2) % 2 === 1;
    out.push((ls + (dOdd ? 1 : 0)) % 2);
    if (i === 0 && dOdd) { return { out, decoupled: out.length }; } // decouple: can't predict further
    if (!dOdd && ls === 1)      d = (3*d + 1 - pow3i[i]) / 2;
    else if (!dOdd && ls === 0) d = d / 2;
    else if (dOdd && ls === 1)  { i = i - 1; d = (d - pow3i[i]) / 2; }
    else                        { i = i + 1; d = (3*d + 1) / 2; }
  }
  return { out, decoupled: null };
}
let match = 0, mismatch = 0, decoupleCases = 0;
let inS = 0, predIn = 0, agreeMembership = 0, checked = 0;
for (const c of classes) {
  const ws = word(c.r, K);
  const actual = word((3 * c.r + 2) % M, K);
  const { out, decoupled } = predictWord(ws);
  const lim = decoupled === null ? K : decoupled;
  let ok = true;
  for (let j = 0; j < lim; j++) if (out[j] !== actual[j]) ok = false;
  if (decoupled !== null) { decoupleCases++; continue; }  // walk can't predict past decouple
  ok ? match++ : mismatch++;
  // membership prediction from predicted word
  checked++;
  const act = S.has((3 * c.r + 2) % M);
  const pred = dominated(out);
  if (act) inS++;
  if (pred) predIn++;
  if (act === pred) agreeMembership++;
}
console.log("classes:", classes.length, " walk-decoupled (excluded):", decoupleCases);
console.log("word prediction: match", match, " MISMATCH", mismatch);
console.log("membership: actual-in-S", inS, " predicted-in-S", predIn,
  " agreement", agreeMembership + "/" + checked, "(" + (agreeMembership/checked*100).toFixed(2) + "%)");
