// TASK 8 — provenance as an algebra. The same recorded support folded over a
// semiring instead of over truth: shortest path rather than yes or no.
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import { tropicalSemiring } from '../../runtime/semirings.ts';
const R = new URL('../../', import.meta.url).pathname;
const r = new Rofl();
r.load(fs.readFileSync(R + 'boot.rofl', 'utf8'));
r.load(fs.readFileSync(R + 'examples/blam/blam.rofl', 'utf8'));
r.evaluate();
const out = evaluateSemiring(r.store, tropicalSemiring, { weight: () => 1 });
console.log('semiring values', out.value.size, 'rounds', out.rounds, 'converged', out.converged, 'cyclic', out.cyclic);
