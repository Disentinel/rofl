// TASK 2 — time. A program that stages `@next` and is advanced tick by tick.
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';
const R = new URL('../../', import.meta.url).pathname;
const r = new Rofl();
r.load(fs.readFileSync(R + 'boot.rofl', 'utf8'));
r.load(fs.readFileSync(R + 'examples/tm.rofl', 'utf8'));
for (let i = 0; i < 12; i++) { const a = r.tickAdvance(); if (a.quiescent || a.partial) break; }
console.log('cfg rows', r.query('cfg(S, T)').rows.length);
