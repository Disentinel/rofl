// TASK 4 — persistence. A store saved, restored, retracted from and excised.
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';
const R = new URL('../../', import.meta.url).pathname;
const r = new Rofl();
r.load(fs.readFileSync(R + 'boot.rofl', 'utf8'));
r.load(fs.readFileSync(R + 'examples/sensors.rofl', 'utf8'));
r.evaluate();
const saved = r.save();
const back = Rofl.fromSnapshot(saved);
back.evaluate();
console.log('restored rows', back.query('close(A, B)').rows.length);
console.log('same state', back.store.canonicalState() === r.store.canonicalState());
r.retract('reading(s1, 20, 1).');
r.evaluate();
console.log('after retract', r.query('close(A, B)').rows.length);
