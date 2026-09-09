// THE HOST SIDE OF THE PARSE TIMING, SHAPED TO MATCH THE RUST SIDE EXACTLY.
//
// Read the header of `rust/rofl/src/bin/rofl_parse_bench.rs` first: these two
// files are one program written twice, and every discipline stated there is
// repeated here on purpose — files read before the clock, every file on every
// iteration in the same order, a checksum so nothing may be optimised away, the
// first pass discarded as warm-up, and the MEDIAN reported rather than the mean.
//
// The warm-up matters more on this side than on the other: V8 will interpret
// `parseProgram` before it compiles it, and a cold-JIT number against warm
// native code is a measurement of the warm-up and not of the parser.
//
//   node --experimental-strip-types scanners/parse_bench.ts <iters> <file>...
import * as fs from 'node:fs';
import { parseProgram } from '../src/parser.ts';

const argv = process.argv.slice(2);
const iters = Number(argv[0]);
const paths = argv.slice(1);
if (!Number.isFinite(iters) || iters < 1 || paths.length === 0) {
  console.error('usage: parse_bench.ts <iters> <file>...');
  process.exit(2);
}

const srcs = paths.map((p) => fs.readFileSync(p, 'utf8'));
const bytes = srcs.reduce((n, s) => n + Buffer.byteLength(s, 'utf8'), 0);

let refused = 0;
let sum = 0;
for (const s of srcs) {
  try { sum += parseProgram(s).length; } catch { refused += 1; }
}

const ms: number[] = [];
for (let i = 0; i < iters; i++) {
  const t0 = process.hrtime.bigint();
  for (const s of srcs) {
    try { sum += parseProgram(s).length; } catch { /* counted in warm-up */ }
  }
  ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
}
ms.sort((a, b) => a - b);
const med = ms[ms.length >> 1];
const f = (n: number) => n.toFixed(3);
console.log(
  `side=host files=${srcs.length} bytes=${bytes} iters=${iters} median_ms=${f(med)} ` +
  `min_ms=${f(ms[0])} max_ms=${f(ms[ms.length - 1])} ` +
  `ms_per_kib=${(med / (bytes / 1024)).toFixed(4)} refused=${refused} checksum=${sum}`,
);
