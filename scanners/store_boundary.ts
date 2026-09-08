// scanners/store_boundary.ts — HOW CHATTY IS THE STORE BOUNDARY?
//
// `FactStore` is already the seam between compute and data: the SQLite adapter
// proves an engine can run over a store it does not own. Whether that seam can
// be moved ACROSS A PROCESS is a different question, and it is arithmetic
// rather than architecture -- it is decided by how many times the evaluator
// crosses it and how much it carries each time.
//
// HOW CHATTY IS THE STORE BOUNDARY? It decides whether compute can be
// separated from data at all: a call per premise match cannot cross a network,
// a batched one can. Counted by wrapping the prototype for one run and
// restoring it, so src/ carries no counter (the scanners/eval_cost.ts pattern).
import { Rofl } from '../src/api.ts';
import { Store } from '../src/store.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const R = join(import.meta.dirname, '..') + '/';
const METHODS = ['add','has','get','remove','relPersp','relAll','indexed','argMatches',
  'perspectivesOf','relCount','clearDerived','support','supportCount','witnessesOf',
  'allFactKeys','allFacts','factCount','witnessOf','allWitnesses','snapshot','clone'] as const;

function measure(files: string[]) {
  const counts: Record<string, number> = {};
  const rowsOut: Record<string, number> = {};   // FactRecs crossing the boundary
  const orig: Record<string, any> = {};
  for (const m of METHODS) {
    const p = (Store.prototype as any)[m];
    if (typeof p !== 'function') continue;
    orig[m] = p;
    (Store.prototype as any)[m] = function (...a: any[]) {
      counts[m] = (counts[m] ?? 0) + 1;
      const r = p.apply(this, a);
      if (Array.isArray(r)) rowsOut[m] = (rowsOut[m] ?? 0) + r.length;
      return r;
    };
  }
  try {
    const r = new Rofl(); r.load(readFileSync(R + 'boot.rofl', 'utf8'));
    for (const f of files) r.load(readFileSync(R + f, 'utf8'));
    r.evaluate();
    return { counts, rowsOut, facts: r.store.allFactKeys().length };
  } finally { for (const m of Object.keys(orig)) (Store.prototype as any)[m] = orig[m]; }
}

for (const [name, files] of [
  ['sensors', ['examples/sensors.rofl']],
  ['spat', readdirSync(R + 'examples/spat').filter(x=>x.endsWith('.rofl')).sort().map(x=>'examples/spat/'+x)],
  ['wtf', readdirSync(R + 'examples/wtf').filter(x=>x.endsWith('.rofl')).sort().map(x=>'examples/wtf/'+x)],
] as [string,string[]][]) {
  const { counts, rowsOut, facts } = measure(files);
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  console.log(`\n${name}  ${facts} facts   ${total} store calls   ${(total/facts).toFixed(1)} calls/fact`);
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  for (const [m,n] of top) {
    const rows = rowsOut[m] ? `  ${rowsOut[m]} rows (${(rowsOut[m]/n).toFixed(1)}/call)` : '';
    console.log(`   ${m.padEnd(16)}${String(n).padStart(9)}${rows}`);
  }
}
