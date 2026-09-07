// probe.ts — WHAT EACH CORPUS CASE ACTUALLY NEEDS. Read-only over the JS
// reference; nothing under src/ is touched. Run:
//   node --experimental-strip-types rust/tools/probe.ts
import { Rofl } from '../../src/api.ts';
import { Store } from '../../src/store.ts';
import { Evaluation } from '../../src/engine.ts';
import { RoundEvaluation } from '../../src/rounds.ts';
import { decodeRules } from '../../src/reflect.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../../facts/port-corpus');
const names = fs.readdirSync(DIR).filter((f) => f.endsWith('.seed.json')).map((f) => f.replace('.seed.json', '')).sort();

const cols = ['case', 'facts', 'rules', 'unsafe', 'demand', 'neg', 'wf', 'next', 'prov', 'builtins', 'strops', 'partial', 'holes', 'bytesJS'];
console.log(cols.join('\t'));
for (const n of names) {
  const seed = fs.readFileSync(path.join(DIR, `${n}.seed.json`), 'utf8');
  const r = Rofl.fromSnapshot(seed);
  const ev = new RoundEvaluation(r.store, { budget: 1_000_000 }) as any;
  const rules = ev.rules;
  const ans = ev.answer;
  const builtins = new Set<string>(); const strops = new Set<string>();
  let next = 0;
  for (const ru of rules) {
    if (ru.clause.head.temporal === 'next') next++;
    for (const b of ru.clause.body) {
      if (b.t === 'bi') { builtins.add(b.op);
        const go = (t: any) => { if (t.k === 'f') { strops.add(t.name); t.args.forEach(go); } };
        go(b.l); go(b.r);
      }
    }
  }
  const out = r.evaluate(1_000_000);
  const holes = r.store.relAll('hole').length;
  const cs = r.store.canonicalState();
  const nf = r.store.factCount();
  console.log([n, nf, rules.length, ans.unsafe.size, ans.demandRels.size, ans.negRels.size,
    ev.wellFounded ? 'Y' : '', next, ans.readsProvenance ? 'Y' : '',
    [...builtins].sort().join(' '), [...strops].filter((x) => /^(str_|atom_of)/.test(x)).sort().join(' '),
    out.partial ? 'Y' : '', holes, cs.length].join('\t'));
}
