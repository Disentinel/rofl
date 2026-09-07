// TASK 3 — explanation. Why a fact holds, and why one does not.
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';
const R = new URL('../../', import.meta.url).pathname;
const r = new Rofl();
r.load(fs.readFileSync(R + 'boot.rofl', 'utf8'));
r.load(fs.readFileSync(R + 'examples/sensors.rofl', 'utf8'));
r.evaluate();
const rows = r.query('close(A, B)').rows;
console.log('why', JSON.stringify(r.why(`close[main](${rows[0].bindings.A},${rows[0].bindings.B})`)).length > 0);
console.log('whynot', JSON.stringify(r.whynot('close[main](nowhere, nowhere)')).length > 0);
