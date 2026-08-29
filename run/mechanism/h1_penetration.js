// H1: pen(n) = number of ACCELERATED steps until the orbit first drops
// below n. Records over n <= LIMIT (only n ≡ 3 mod 4 can be deep).
// Counting/uniform-placement would allow pen ~ 20*log2(n); measure reality.
const LIMIT = 10_000_000;
const records = [];
let best = 0;
const THR = 4e15;
for (let n = 3; n <= LIMIT; n += 4) {
  let v = n, steps = 0, big = null;
  while (true) {
    if (big === null) {
      if (v % 2 === 0) v = v / 2; else v = (3 * v + 1) / 2;
      steps++;
      if (v < n) break;
      if (v > THR) big = BigInt(v);
    } else {
      if (big % 2n === 0n) big = big / 2n; else big = (3n * big + 1n) / 2n;
      steps++;
      if (big < BigInt(n)) break;
      if (big < BigInt(THR)) { v = Number(big); big = null; }
    }
  }
  if (steps > best) {
    best = steps;
    records.push({ n, pen: steps, ratio: +(steps / Math.log2(n)).toFixed(3) });
  }
}
console.log('records (n, accelerated pen, pen/log2 n):');
for (const r of records) console.log(`n=${r.n}  pen=${r.pen}  ratio=${r.ratio}`);
const last = records[records.length - 1];
console.log(`\nmax ratio over records: ${Math.max(...records.map(r => r.ratio))}`);
console.log(`tail ratio (last record): ${last.ratio}`);
