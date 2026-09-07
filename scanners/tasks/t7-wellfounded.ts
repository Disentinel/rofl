// TASK 7 — the third truth value. A program that declares the alternating
// fixpoint and leaves atoms undefined rather than answering true or false.
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';
const R = new URL('../../', import.meta.url).pathname;
const r = new Rofl();
r.load(fs.readFileSync(R + 'boot.rofl', 'utf8'));
r.load('semantics(well_founded).\n'
  + 'move(a, b).\nmove(b, a).\nmove(b, c).\n'
  + 'win(X) :- move(X, Y), not win(Y).\n');
r.evaluate();
console.log('win', r.query('win(X)').rows.length, 'unknown', r.query('unknown(A)').rows.length);
