// TASK 1 — the smallest thing the language is for: load a program, evaluate it,
// ask it a question. Nothing else: no ticks, no snapshots, no explanations.
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';
const R = new URL('../../', import.meta.url).pathname;
const r = new Rofl();
r.load(fs.readFileSync(R + 'boot.rofl', 'utf8'));
r.load(fs.readFileSync(R + 'examples/sensors.rofl', 'utf8'));
r.evaluate();
const out = r.query('close(A, B)');
console.log('rows', out.rows.length);
