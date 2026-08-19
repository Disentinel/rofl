// Phase 2 — seminaive + strata + perspectives + provenance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';
import { RESERVED, IFACE } from '../src/reflect.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');

// deterministic LCG for seeded random programs
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomProgram(seed: number): string {
  const rnd = lcg(seed || 1);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const rels = ['p0', 'p1', 'p2', 'p3'];
  const arity = new Map(rels.map((r) => [r, 1 + Math.floor(rnd() * 2)]));
  const consts = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
  const lines: string[] = [];
  const nFacts = 8 + Math.floor(rnd() * 12);
  for (let i = 0; i < nFacts; i++) {
    const rel = pick(rels);
    const args = Array.from({ length: arity.get(rel)! }, () => pick(consts));
    lines.push(`${rel}(${args.join(', ')}).`);
  }
  const nRules = 3 + Math.floor(rnd() * 5);
  for (let i = 0; i < nRules; i++) {
    const nPrems = 1 + Math.floor(rnd() * 3);
    const vars = ['X', 'Y', 'Z', 'W'];
    const bodyVars: string[] = [];
    const prems: string[] = [];
    for (let j = 0; j < nPrems; j++) {
      const rel = pick(rels);
      const args = Array.from({ length: arity.get(rel)! }, () => {
        if (rnd() < 0.7) { const v = pick(vars); bodyVars.push(v); return v; }
        return pick(consts);
      });
      prems.push(`${rel}(${args.join(', ')})`);
    }
    const headRel = pick(rels);
    const headArgs = Array.from({ length: arity.get(headRel)! }, () =>
      bodyVars.length && rnd() < 0.8 ? pick(bodyVars) : pick(consts));
    lines.push(`${headRel}(${headArgs.join(', ')}) :- ${prems.join(', ')}.`);
  }
  return lines.join('\n');
}

function domainFacts(r: Rofl): string[] {
  return r.factKeys().filter((k) => {
    const rel = r.store.get(k)!.rel;
    return !RESERVED.has(rel) && rel !== IFACE.stratum && rel !== IFACE.unstratified;
  });
}

test('differential: naive ≡ seminaive on 120 random seeded programs', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const prog = randomProgram(seed);
    const a = new Rofl({ naive: false });
    const b = new Rofl({ naive: true });
    assert.equal(a.load(prog).ok, true, `seed ${seed} seminaive load`);
    assert.equal(b.load(prog).ok, true, `seed ${seed} naive load`);
    assert.deepEqual(domainFacts(a), domainFacts(b), `seed ${seed} diverged`);
  }
});

test('why returns a derivation tree ending in EDB facts', () => {
  const r = new Rofl();
  r.load(`
    edge(a, b). edge(b, c).
    path(X, Y) :- edge(X, Y).
    path(X, Y) :- edge(X, Z), path(Z, Y).
  `);
  const w = r.why('path(a, c)');
  assert.equal(w.ok, true);
  const lines = w.text.split('\n');
  assert.match(lines[0], /^path\[main\]\(a,c\)\s+<= r[0-9a-f]{8} @tick 0$/);
  const leaves = lines.filter((l) => l.includes('[axiom]'));
  assert.ok(leaves.length >= 2, 'tree must bottom out in EDB axioms');
  for (const l of leaves) assert.match(l, /edge\[main\]/);
});

test('a rule reading a perspective it cannot see matches nothing', () => {
  const r = new Rofl();
  r.load(`
    secret[vault](s1).
    spy(X) :- secret[open](X).
    honest(X) :- secret[vault](X).
  `);
  assert.deepEqual(r.query('spy(X)').rows, []);
  assert.deepEqual(r.query('honest(X)').rows.map((x) => x.text), ['X = s1']);
});

test('negation executes in stratum order read from stratum/2 facts', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  assert.equal(r.load(`
    node(a). node(b). node(c).
    edge(a, b).
    linked(X) :- edge(X, Y).
    linked(Y) :- edge(X, Y).
    isolated(X) :- node(X), not linked(X).
  `).ok, true);
  assert.deepEqual(r.query('isolated(X)').rows.map((x) => x.text), ['X = c']);
  // the stratum assignment used by the engine comes from stratum/2 facts
  const stratumFacts = r.query('stratum(isolated, N)');
  const levels = stratumFacts.rows.map((x) => parseInt(x.bindings['N'], 10));
  assert.ok(levels.includes(1), 'boot rules must derive stratum(isolated, 1)');
  const plan = r.strataPlan();
  const iso = plan.find((p) => p.rel === 'isolated');
  assert.ok(iso, 'isolated rule present in plan');
  assert.equal(iso!.level, Math.max(...levels), 'engine level == max stratum fact');
});

test('without boot meta-rules there are no stratum facts and the plan says so', () => {
  const r = new Rofl();
  r.load(`
    node(a). edge(a, a).
    linked(X) :- edge(X, Y).
    isolated(X) :- node(X), not linked(X).
  `);
  const plan = r.strataPlan();
  assert.equal(plan.find((p) => p.rel === 'isolated')!.level, null);
});

test('unstratifiable program is rejected with a reach-trace diagnostic', () => {
  const r = new Rofl();
  assert.equal(r.load(BOOT).ok, true);
  const res = r.load(`
    e(1).
    p(X) :- e(X), not p(X).
  `, { budget: 5000 });
  assert.equal(res.ok, false);
  assert.match(res.diagnostics.join('\n'), /unstratified\[main\]\(p\)/);
  assert.match(res.diagnostics.join('\n'), /dep_neg/); // the demonstration
  // rollback: the offending program is gone, boot still fine
  assert.equal(r.holds('e(1)'), false);
  assert.deepEqual(r.query('unstratified(X)').rows, []);
});

test('provenance: derived_by facts are queryable and support counting works', () => {
  const r = new Rofl();
  r.load(`
    edge(a, b). edge2(a, b).
    path(X, Y) :- edge(X, Y).
    path(X, Y) :- edge2(X, Y).
  `);
  r.evaluate();
  const db = r.query('derived_by(F, R, T)');
  assert.ok(db.rows.length >= 2, 'derived_by facts present');
  assert.ok(db.rows.some((x) => x.bindings['F'].includes('path')), 'names the fact');
  // two distinct firings support path(a,b)
  assert.equal(r.store.supportCount('path[main](a,b)'), 2);
});
