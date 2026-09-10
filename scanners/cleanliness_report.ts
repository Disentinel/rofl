// scanners/cleanliness_report.ts — the table, rendered. Every number below is
// one query against `rules/cleanliness.rofl`; nothing is computed here.
//
// Run: npm run cleanliness

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PACKS = ['facts/depends.rofl', 'rules/depends.rofl', 'facts/cleanliness.rofl', 'rules/cleanliness.rofl'];

export function build(): Rofl {
  const r = new Rofl();
  for (const p of PACKS) {
    const res = r.load(fs.readFileSync(path.join(ROOT, p), 'utf8'), { who: 'scanner' });
    if (!res.ok) throw new Error(`${p}: ${res.diagnostics.join('; ')}`);
  }
  r.evaluate();
  return r;
}

const unq = (t: unknown): string => String(t).replace(/^"|"$/g, '');
export const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => unq(x.bindings[v])).sort();

export function report(r: Rofl): string[] {
  const L: string[] = ['# Cleanliness matrix', ''];
  const roles = col(r, 'role(R)', 'R');
  const cells = r.query('cell(R, D)').rows.map((x) => `${unq(x.bindings.R)} x ${unq(x.bindings.D)}`).sort();
  const open = r.query('open_cell[audit](P, D)').rows.map((x) => ({ p: unq(x.bindings.P), d: unq(x.bindings.D) }));
  const roleless = col(r, 'roleless[audit](P)', 'P');
  const vacant = r.query('vacant[audit](R, D)').rows.map((x) => `${unq(x.bindings.R)} x ${unq(x.bindings.D)}`);

  L.push(`${roles.length} roles, ${cells.length} occupied cells, ${r.query('owes(P, D)').rows.length} obligations.`);
  L.push('');

  // THE TWO STRUCTURAL AUDITS FIRST, because both mean the TABLE is wrong
  // rather than the tree. A queue computed over a table with gaps in it is a
  // number about the instrument.
  L.push(`roleless (the tree has a kind of thing this table does not know): ${roleless.length}`);
  for (const p of roleless) L.push(`    ${p}`);
  L.push(`vacant (a duty over a role nothing occupies): ${vacant.length}`);
  for (const c of vacant) L.push(`    ${c}`);
  L.push('');

  const byDuty = new Map<string, string[]>();
  for (const { p, d } of open) byDuty.set(d, [...(byDuty.get(d) ?? []), p]);
  L.push(`## The queue — ${open.length} open cells`);
  L.push('');
  for (const [d, ps] of [...byDuty].sort((a, b) => b[1].length - a[1].length)) {
    L.push(`### ${d} — ${ps.length}`);
    for (const p of ps.sort()) L.push(`    ${p}`);
    L.push('');
  }

  const unowned = r.query('unowned[audit](P, D)').rows.length;
  L.push(`owned: ${open.length - unowned}    unowned: ${unowned}`);
  L.push('');
  L.push(open.length === 0
    ? 'THE TABLE IS ANSWERED. Every artifact earns its place or is waived by name.'
    : 'NOT DONE. Each row above is one of: make it earn its place, waive it with a'
      + '\nreason from the closed list, or delete it. A cell is never closed by'
      + '\ndeleting the question.');
  return L;
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'cleanliness_report.ts';
if (isMain) console.log(report(build()).join('\n'));
