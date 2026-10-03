// hints.ts — the model's rules (for their reflection) + a run's statistics + hints.rofl, asked for rewrites.
//   node --experimental-strip-types hints.ts stats-24.rofl
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { MODEL_FILES } from '../../notebook/front.ts';
import { parseProgram } from '../../src/parser.ts';
import { ruleIdOf } from '../../src/reflect.ts';

const ROOT = '/home/user/rofl';
const statsFile = process.argv[2], modelPath = process.argv[3];
const model = modelPath ? fs.readFileSync(modelPath, 'utf8') : MODEL_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const text: Record<string, string> = {};
for (const c of parseProgram(model)) if (c.body.length) text[ruleIdOf(c)] = `${c.head.rel}(…) :- ${c.body.map((b: any) => b.t === 'pos' ? b.lit.rel : b.t === 'neg' ? 'not ' + b.lit.rel : b.t === 'bi' ? b.op : b.t).join(', ')}`;
const r = new Rofl({ space: 40_000_000, reuse: false });
const l = r.load(model + '\n' + fs.readFileSync(statsFile, 'utf8') + '\n' + fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'hints.rofl'), 'utf8'), { budget: 4_000_000_000 });
if (!l.ok) { console.error(l.diagnostics.slice(0, 8)); process.exit(1); }
const t = performance.now(); r.evaluate(4_000_000_000); console.log(`hints world evaluated in ${(performance.now() - t).toFixed(0)} ms`);
const rows = (q: string) => r.query(q).rows.map((x) => x.bindings as Record<string, string>);
const num = (s: string) => Number(s);
const show = (id: string) => text[id] ?? id;

console.log('\n== HINT A · lead with the delta: recursive rules whose prefix before the first recursive premise is more than half their work');
const A = rows('lead_with_delta(R, Lead, N, Prefix, Whole)').sort((a, b) => num(b.Prefix) - num(a.Prefix)).slice(0, 10);
for (const x of A) console.log(`  prefix ${x.Prefix.padStart(7)} of ${x.Whole.padStart(7)}  leads with ${x.Lead} (${x.N} rows)  ${show(x.R)}`);

console.log('\n== HINT C · shared prefixes of K premises (written order), by the width of the rules sharing them');
const C = rows('wide_prefix(R, K, W)').sort((a, b) => num(b.W) - num(a.W)).slice(0, 12);
for (const x of C) console.log(`  K=${x.K}  width ${x.W.padStart(7)}  ${show(x.R)}`);
console.log('  groups:', rows('prefix_group(K, N)').map((x) => `K=${x.K}: ${x.N} rules`).join('  '));

console.log('\n== HINT B · non-recursive rules fired by other rules\' rounds (fires, concluded)');
const B = rows('refired(R, F, C)').sort((a, b) => num(b.F) - num(a.F)).slice(0, 10);
for (const x of B) console.log(`  fired ${x.F.padStart(3)}  concluded ${x.C.padStart(6)}  ${show(x.R)}`);

console.log('\n== HINT D · products: a premise sharing no variable with the ones before it (count, and the widest)');
const D = rows('product_at(R, I, Rel, N)');
const widths = new Map(rows('rule_width(R, W)').map((x) => [x.R, num(x.W)]));
console.log(`  ${D.length} premises in ${new Set(D.map((x) => x.R)).size} rules`);
for (const x of [...D].sort((a, b) => (widths.get(b.R) ?? 0) - (widths.get(a.R) ?? 0)).slice(0, 6)) console.log(`  width ${String(widths.get(x.R) ?? 0).padStart(7)}  position ${x.I} ${x.Rel} (${x.N} rows)  ${show(x.R)}`);

console.log('\n== HINT E · closures materialised over their base');
for (const x of rows('closure_blowup(Rel, N, Base, B)')) console.log(`  ${x.Rel} ${x.N} rows over ${x.Base} ${x.B}`);
