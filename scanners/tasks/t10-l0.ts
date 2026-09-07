// TASK 10 — THE HOST AS L0 ALONE. No `Rofl.load`, no `query`, no text of the
// language anywhere: examples/ring1/l0.ts reads a DENSE program -- facts and
// one-fact rules -- and promotes it through the door, and the answers are read
// off the store as terms.
//
// What this task enters of src/parser.ts is what a host built on L0 would
// still have to carry. It is the measurement behind "could the parser live in
// ROFL": L0 is 138 code lines against the parser's 262, and everything above
// it -- the whole surface syntax -- is the grammar, in ROFL.
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';
import { loadDense } from '../../examples/ring1/l0.ts';
const ROOT = new URL('../../', import.meta.url).pathname;
const r = new Rofl({ reuse: false });
// the grammar, as facts a reviewer can diff rather than as an image
const g = loadDense(r, fs.readFileSync(ROOT + 'examples/ring1/l1.dense.rofl', 'utf8'));
// a program of its own, in the same dense form: no surface syntax is parsed
loadDense(r, 'edge(a, b).\nedge(b, c).\n'
  + 'r(r1, l(path, [v("X"), v("Y")]), [l(edge, [v("X"), v("Y")])]).\n'
  + 'r(r2, l(path, [v("X"), v("Z")]), [l(path, [v("X"), v("Y")]), l(edge, [v("Y"), v("Z")])]).\n');
r.evaluate();
console.log('dense grammar:', g.facts, 'facts', g.rules, 'rules');
console.log('path rows, read off the store:', r.store.relAll('path').length);
