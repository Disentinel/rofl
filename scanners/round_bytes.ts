// scanners/round_bytes.ts — WHAT WOULD CROSS A REMOTED BOUNDARY, PER ROUND.
//
// `scanners/store_boundary.ts` counts the calls and concludes the current seam
// is not remotable at any latency worth having. That is a negative result and
// it leaves the positive one unstated: IF the boundary moved from "give me the
// candidate facts" to "evaluate this round over your data", what would cross,
// and how much of it?
//
// A semi-naive round is a barrier (src/engine.ts:1178): round N+1's front is
// exactly what round N derived. So a round is the natural unit of a pushed-down
// evaluation, and the thing that crosses is the FRONT — the delta, per
// relation — going down, and the derived tuples coming back. Both are countable
// without changing any of it: the evaluator installs a NEW `FrontInfo` object
// per round (engine.ts:1217), so object identity is the round number, and
// `FrontInfo.byRel` is the delta already grouped the way a pushdown would ship
// it.
//
// TWO WIDTHS, because the answer should not depend on a guess about the wire.
//   wide  — the canonical key string, which is what the current boundary would
//           have to send: it is the identity the engine holds.
//   tight — 4 bytes of relation, 4 of perspective, 4 per argument: what an
//           interned columnar frame costs, and the floor.
//
// usage: node --experimental-strip-types scanners/round_bytes.ts [world ...]
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const R = join(import.meta.dirname, '..') + '/';

interface FrontLike { keys: Set<string>; byRel: Map<string, Set<string>> }

const WORLDS: Record<string, string[]> = {
  sensors: ['examples/sensors.rofl'],
  spat: readdirSync(R + 'examples/spat').filter((x) => x.endsWith('.rofl')).sort().map((x) => 'examples/spat/' + x),
  wtf: readdirSync(R + 'examples/wtf').filter((x) => x.endsWith('.rofl')).sort().map((x) => 'examples/wtf/' + x),
  goof: readdirSync(R + 'examples/goof').filter((x) => x.endsWith('.rofl')).sort().map((x) => 'examples/goof/' + x),
};

/** 4 bytes of relation id, 4 of perspective, 4 per ground argument. The
 *  arity is read off the key's own comma count, which over-counts a functor
 *  argument and so keeps this an UPPER bound on the tight width too. */
function tight(key: string): number {
  const open = key.indexOf('](');
  const inner = key.slice(open + 2, key.length - 1);
  const arity = inner.length === 0 ? 0 : inner.split(',').length;
  return 8 + 4 * arity;
}

function measure(name: string, files: string[]) {
  const proto = Evaluation.prototype as unknown as Record<string, any>;
  const orig = { fireRule: proto.fireRule, matchPremise: proto.matchPremise, conclude: proto.conclude };
  // Every front object the evaluator installs, in the order it installs them.
  // Round N's INPUT is the object installed by round N-1 (engine.ts:1217).
  const fronts: FrontLike[] = [];
  const seen = new Set<unknown>();
  const rowsRead: number[] = [];   // candidate rows the store handed back, per round
  let ri = -1;
  const note = (f: unknown) => {
    if (f && !seen.has(f)) { seen.add(f); fronts.push(f as FrontLike); ri = fronts.length - 1; rowsRead.push(0); }
    else if (f) ri = fronts.indexOf(f as FrontLike);
  };
  proto.fireRule = function (this: any, ...a: any[]) { note(this.curFront); return orig.fireRule.apply(this, a); };
  proto.matchPremise = function (this: any, ...a: any[]) {
    note(this.curFront);
    const out = orig.matchPremise.apply(this, a);
    if (ri >= 0 && Array.isArray(out)) rowsRead[ri] += out.length;
    return out;
  };
  proto.conclude = function (this: any, ...a: any[]) { note(this.curFront); return orig.conclude.apply(this, a); };

  let facts = 0;
  try {
    const r = new Rofl({ reuse: false });
    r.load(readFileSync(R + 'boot.rofl', 'utf8'));
    for (const f of files) r.load(readFileSync(R + f, 'utf8'));
    r.evaluate();
    facts = r.store.allFactKeys().length;
  } finally { Object.assign(proto, orig); }

  const live = fronts.filter((f) => f.keys.size > 0);
  let wide = 0, narrow = 0, rels = 0, maxFront = 0;
  const sizes: number[] = [];
  for (const f of live) {
    let w = 0, n = 0;
    for (const k of f.keys) { w += k.length + 2; n += tight(k); }
    wide += w; narrow += n; rels += f.byRel.size;
    sizes.push(f.keys.size);
    if (f.keys.size > maxFront) maxFront = f.keys.size;
  }
  sizes.sort((a, b) => a - b);
  const q = (p: number) => (sizes.length ? sizes[Math.min(sizes.length - 1, Math.floor(p * sizes.length))] : 0);
  const totalRows = rowsRead.reduce((a, b) => a + b, 0);
  const n = live.length || 1;
  console.log(`\n== ${name}: ${facts} facts, ${live.length} non-empty rounds`);
  console.log(`   front size            : median ${q(0.5)}  p90 ${q(0.9)}  max ${maxFront}  total ${sizes.reduce((a, b) => a + b, 0)}`);
  console.log(`   relations per front   : ${(rels / n).toFixed(1)} mean`);
  console.log(`   PUSHDOWN, per round   : wide ${(wide / n).toFixed(0)} B   tight ${(narrow / n).toFixed(0)} B`);
  console.log(`   PUSHDOWN, whole eval  : wide ${(wide / 1024).toFixed(1)} KB  tight ${(narrow / 1024).toFixed(1)} KB`);
  console.log(`   CURRENT BOUNDARY      : ${totalRows} candidate rows shipped one call at a time`);
  console.log(`   ratio rows/front      : ${(totalRows / Math.max(1, sizes.reduce((a, b) => a + b, 0))).toFixed(1)}x`);
}

const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const name of want.length ? want : Object.keys(WORLDS)) {
  if (!WORLDS[name]) { console.error(`unknown world ${name}`); continue; }
  measure(name, WORLDS[name]);
}
