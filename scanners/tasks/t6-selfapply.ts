// TASK 6 — self-application. The reflection read back as data: the audits over
// a program's own rules, and range restriction computed inside the language.
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';
const R = new URL('../../', import.meta.url).pathname;
const r = new Rofl();
r.load(fs.readFileSync(R + 'boot.rofl', 'utf8'));
r.load(fs.readFileSync(R + 'safety.rofl', 'utf8'));
r.load(fs.readFileSync(R + 'examples/sensors.rofl', 'utf8'));
r.evaluate();
for (const q of ['leak[audit](A, B)', 'breach[audit](Rr)', 'unsafe_rule(Rr)', 'demand_rel(Rel)']) {
  console.log(q, r.query(q).rows.length);
}
