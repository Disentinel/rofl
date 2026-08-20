// Cross-process determinism probe at run scale (~70k facts):
// path A: rebuild from .rofl sources; path B: restore the gzipped snapshot and
// RE-EVALUATE from its base facts (untrusted restore). Both canonical states
// must be bit-identical. Mode selected by argv[2] so each path runs in its own
// OS process.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import { Rofl } from '/home/user/rofl/src/api.ts';
const ROOT = '/home/user/rofl';
const RUN = path.join(ROOT, 'run');
const mode = process.argv[2];
let r: Rofl;
if (mode === 'sources') {
  r = new Rofl();
  const sources = [
    path.join(ROOT, 'boot.rofl'),
    path.join(RUN, 'audit-v0.2.rofl'),
    path.join(RUN, 'collatz-models.rofl'),
    ...fs.readdirSync(path.join(RUN, 'rounds')).filter((f) => f.endsWith('.rofl')).sort()
      .map((f) => path.join(RUN, 'rounds', f)),
  ];
  for (const f of sources) {
    const res = r.load(fs.readFileSync(f, 'utf8'), { budget: 30_000_000, defer: true });
    if (!res.ok) { console.error('REJECT'); process.exit(2); }
  }
} else {
  const gz = fs.readFileSync(path.join(RUN, 'state', 'latest.json.gz'));
  r = Rofl.fromSnapshot(zlib.gunzipSync(gz).toString('utf8')); // untrusted: dirty
}
r.evaluate(30_000_000);
const state = r.store.canonicalState();
console.log(mode, crypto.createHash('sha256').update(state).digest('hex'), r.store.facts.size);
