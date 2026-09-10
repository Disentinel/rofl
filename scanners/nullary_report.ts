// scanners/nullary_report.ts — WHICH RULES ARE PROPOSITIONS WEARING A SUBJECT?
//
// Loads every rule pack in turn beside `rules/nullary.rofl` and reports what
// that model derives. Nothing is computed here; every row is one query.
//
// A pack at a time and not all at once, because the analysis is over the
// REFLECTION of the rules in the store, and one store holding every pack would
// answer about the union rather than about each.
//
// Run: npm run nullary

import { Rofl } from '../src/api.ts';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const unq=(t:unknown)=>String(t).replace(/^"|"$/g,'');
const packs = execFileSync('git',['ls-files','rules/*.rofl','rules/*/*.rofl','boot.rofl','policy.rofl','safety.rofl'],
  {cwd: ROOT, encoding:'utf8'}).split('\n').filter(Boolean);
const NUL = fs.readFileSync(ROOT + '/rules/nullary.rofl','utf8');
const hits: {pack:string; kind:string; what:string}[] = [];
let ok=0, skipped:string[]=[]; const opaque:string[]=[];
for (const p of packs) {
  if (p === 'rules/nullary.rofl') continue;
  const r = new Rofl();
  const a = r.load(fs.readFileSync(ROOT + '/'+p,'utf8'), {who:'s',budget:40_000_000});
  if (!a.ok) { skipped.push(p); continue; }
  const b = r.load(NUL, {who:'s',budget:40_000_000});
  if (!b.ok) { skipped.push(p+' (nullary)'); continue; }
  try { r.evaluate(40_000_000); } catch { skipped.push(p+' (eval)'); continue; }
  ok++;
  for (const x of r.query('dressed_constant[audit](Rel)').rows) hits.push({pack:p,kind:'константа',what:unq(x.bindings.Rel)});
  // THE BLIND SPOT, COUNTED. `rules/nullary.rofl` names `$fact` and cannot name
  // an arbitrary user functor, so a head like `p($pair(X, Y))` reads as
  // constant. The model cannot find those — a rule would have to destructure a
  // term it does not name — but the HOST can look at the printed term, and a
  // stated limit with a number beside it is a limit somebody can act on.
  for (const x of r.query('const_head(R)').rows) {
    const id = unq(x.bindings.R);
    const args = r.query(`head_args(${id}, A)`).rows.map((y) => String(y.bindings.A))[0] ?? '';
    if (args.includes('$var(')) opaque.push(`${p}  ${args}`);
  }
  // THE VERDICT IS PER RULE AND NOT PER VARIABLE. `passenger[audit]` names one
  // droppable variable; a rule wants a nullary head only when EVERY variable in
  // its head is droppable, which is `all_passengers`. Reporting the passengers
  // instead put `share(R, P)` on the queue for `R` alone, where dropping `R`
  // narrows the relation rather than emptying its head.
  for (const x of r.query('all_passengers(R)').rows) {
    const id = unq(x.bindings.R);
    const rel = r.query(`concludes(${id}, Rel)`).rows.map(y=>unq(y.bindings.Rel))[0] ?? '?';
    const vs = r.query(`passenger[audit](${id}, V)`).rows.map(y=>unq(y.bindings.V)).sort();
    hits.push({pack:p,kind:'пассажир',what:`${rel}  (${vs.join(', ')})`});
  }
}
console.log(`пакетов проанализировано: ${ok}, пропущено: ${skipped.length}`);
if (skipped.length) console.log('  пропущены:', skipped.slice(0,6).join(', '));
console.log(`головы с переменной внутри незнакомого функтора (слепое пятно): ${opaque.length}`);
for (const o of opaque) console.log(`  ${o}`);
console.log(`\nНАЙДЕНО: ${hits.length}`);
for (const h of hits) console.log(`  ${h.kind.padEnd(10)} ${h.what.padEnd(34)} ${h.pack}`);
