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
let ok=0, skipped:string[]=[];
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
  for (const x of r.query('passenger[audit](R, V)').rows) {
    const rel = r.query(`concludes(${unq(x.bindings.R)}, Rel)`).rows.map(y=>unq(y.bindings.Rel))[0] ?? '?';
    hits.push({pack:p,kind:'пассажир',what:`${rel}  (${unq(x.bindings.V)})`});
  }
}
console.log(`пакетов проанализировано: ${ok}, пропущено: ${skipped.length}`);
if (skipped.length) console.log('  пропущены:', skipped.slice(0,6).join(', '));
console.log(`\nНАЙДЕНО: ${hits.length}`);
for (const h of hits) console.log(`  ${h.kind.padEnd(10)} ${h.what.padEnd(34)} ${h.pack}`);
