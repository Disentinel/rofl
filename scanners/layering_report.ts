// scanners/layering_report.ts — the engine/library boundary, rendered.
// Every number is one query against `rules/layering.rofl`.
//
// Run: npm run layering

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PACKS = ['facts/depends.rofl', 'rules/depends.rofl', 'facts/layering.rofl', 'rules/layering.rofl'];

// THE DEFAULT LOAD BUDGET DOES NOT COVER THIS PROGRAM and the first run said
// so honestly — `hole($load(4), budget_exhausted)`, with `side` at 17 of 75 and
// `harness` at zero. Every downstream count was then a number about the budget.
// Raised here rather than papered over, and the run asserts it left no hole.
const BUDGET = 80_000_000;

export function build(): Rofl {
  const r = new Rofl();
  for (const p of PACKS) {
    const res = r.load(fs.readFileSync(path.join(ROOT, p), 'utf8'), { who: 'scanner', budget: BUDGET });
    if (!res.ok) throw new Error(`${p}: ${res.diagnostics.join('; ')}`);
  }
  // `evaluate` TAKES A POSITIONAL NUMBER, not an options object — unlike
  // `load`, three lines up, which takes `{ who, budget }`. Passing
  // `{ budget }` here type-checks nowhere and the runtime took it in silence;
  // only `tsc` said so. Two entry points on one class, two shapes, one of them
  // silently ignoring what it is handed.
  r.evaluate(BUDGET);
  return r;
}

const unq = (t: unknown): string => String(t).replace(/^"|"$/g, '');
export const pairs = (r: Rofl, q: string): string[] =>
  r.query(q).rows.map((x) => `${unq(x.bindings.A ?? x.bindings.H)} -> ${unq(x.bindings.B ?? x.bindings.L)}`).sort();
export const n = (r: Rofl, q: string): number => r.query(q).rows.length;

export function report(r: Rofl): string[] {
  const L: string[] = ['# The engine / library boundary', ''];
  const holes = r.query('hole(Q, W)').rows;
  if (holes.length) L.push(`!! ${holes.length} hole(s) — every number below is about the budget, not the tree`, '');

  L.push(`engine  ${String(n(r, 'side(P, engine)')).padStart(4)}    src/, adapters/, rust/, boot+policy+safety`);
  L.push(`library ${String(n(r, 'side(P, library)')).padStart(4)}    everything a library_decl claims`);
  L.push(`harness ${String(n(r, 'side(P, harness)')).padStart(4)}    gates, docs, ledgers, demos, rigs`);
  L.push('');
  L.push(`crossings (library -> engine): ${n(r, 'crossing(A, B)')}`);
  L.push('');

  const deep = pairs(r, 'deep_crossing[audit](A, B)');
  L.push(`## deep_crossing — ${deep.length}`);
  L.push('A library entering the engine somewhere other than its declared surface.');
  for (const d of deep) L.push(`    ${d}`);
  L.push('');

  const inv = pairs(r, 'inversion[audit](A, B)');
  L.push(`## inversion — ${inv.length}`);
  L.push('THE ONE THAT MATTERS MORE: the engine knowing about a library.');
  for (const d of inv) L.push(`    ${d}`);
  L.push('');

  for (const lib of r.query('library_decl(N, P)').rows.map((x) => unq(x.bindings.N))
    .filter((v, i, a) => a.indexOf(v) === i)) {
    const mv = r.query(`moves_with[audit](H, ${lib})`).rows.map((x) => unq(x.bindings.H)).sort();
    L.push(`## harness that would move with \`${lib}\` — ${mv.length}`);
    for (const m of mv) L.push(`    ${m}`);
    L.push('');
  }
  return L;
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'layering_report.ts';
if (isMain) console.log(report(build()).join('\n'));
