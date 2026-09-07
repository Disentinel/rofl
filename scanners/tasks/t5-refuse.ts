// TASK 5 — refusal. The programs the language must say no to, and the holes it
// must leave when it runs out of budget or hits an arithmetic error.
import * as fs from 'node:fs';
import { Rofl } from '../../src/api.ts';
const R = new URL('../../', import.meta.url).pathname;
const BOOT = fs.readFileSync(R + 'boot.rofl', 'utf8');
for (const [what, prog] of [
  ['unstratified', 'p(1).\nq(X) :- p(X), not r(X).\nr(X) :- p(X), not q(X).\n'],
  ['reserved head', 'p(1).\nconcludes(a, b) :- p(_).\n'],
  ['arith type error', 'p(a).\nq(X, Y) :- p(X), Y is X + 1.\n'],
  ['unorderable negation', 'e(x).\np(X) :- e(X), not t(Y), Y = Z.\n'],
] as const) {
  const r = new Rofl();
  r.load(BOOT);
  const res = r.load(prog);
  console.log(what, res.ok ? 'accepted' : 'refused');
}
const tiny = new Rofl();
tiny.load(BOOT);
tiny.load('n(0).\nn(Y) :- n(X), Y is X + 1.\n', { budget: 500 });
console.log('holes', tiny.query('hole(H, R, Why)').rows.length > 0);
