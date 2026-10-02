// lint.ts — "probably needs a name", as rules over the reflection.
//
//   npm run lint -- rules/js-dataflow.rofl [more .rofl files]
//   npm run lint -- --boot-heads      the facts examples/linter/corpus-boot-heads.rofl freezes
//
// The decisions are examples/linter/linter.rofl; this loads boot.rofl, the
// target and those rules, and prints what they conclude.
import { readFileSync } from 'node:fs';
import { Rofl } from '../src/api.ts';

const BOOT = new URL('../boot.rofl', import.meta.url);
const LINTER = new URL('../examples/linter/linter.rofl', import.meta.url);

const args = process.argv.slice(2);
const heads = (r: Rofl) => [...new Set((r.query('concludes(R, Rel)').rows as any[]).map((x) => String(x.bindings.Rel)))].sort();
const bootOnly = new Rofl();
bootOnly.load(readFileSync(BOOT, 'utf8'), { who: 'boot.rofl' });
bootOnly.evaluate();
const foreign = heads(bootOnly).map((h) => `foreign_head(${h}).`);
if (args[0] === '--boot-heads') { console.log(foreign.join('\n')); process.exit(0); }
if (args.length === 0) { console.error('usage: npm run lint -- <file.rofl> ...'); process.exit(2); }

const r = new Rofl();
r.load(readFileSync(BOOT, 'utf8'), { who: 'boot.rofl' });
for (const f of args) r.load(readFileSync(f, 'utf8'), { who: f });
r.load(readFileSync(LINTER, 'utf8'), { who: 'linter.rofl' });
r.load(foreign.join('\n'), { who: 'boot heads' });
const ev = r.evaluate(8_000_000) as { partial?: boolean };

const rows = (q: string) => (r.query(q).rows as any[]).map((x) => x.bindings as Record<string, string>);
const byCount = (a: { n: number; key: string }, b: { n: number; key: string }) => b.n - a.n || a.key.localeCompare(b.key);
const section = (title: string, lines: string[]) => { console.log(`\n${title}`); for (const l of lines) console.log(`  ${l}`); };
const MIN = Object.fromEntries(rows('lint_min(K, N)').map((x) => [x.K, x.N]));

console.log(`lint over ${args.join(', ')} with boot.rofl${ev.partial ? ' (PARTIAL evaluation)' : ''}`);

const tables = rows('probably_a_table(Rel, N)').map((x) => ({ n: Number(x.N), key: x.Rel })).sort(byCount);
section(`probably a table: ${tables.length} heads with ${MIN.table}+ bodies`, tables.map((t) => `${t.key}  ${t.n} bodies`));

const seen = new Set<string>();
const pairs = rows('probably_needs_a_name(A, B, N)').map((x) => ({ n: Number(x.N), key: [x.A, x.B].sort().join(' & ') }))
  .sort(byCount).filter((p) => !seen.has(p.key) && seen.add(p.key));
section(`probably needs a name: ${pairs.length} relation pairs read together by ${MIN.pair}+ rules`, pairs.map((p) => `${p.key}  ${p.n} rules`));

const long = rows('probably_hides_a_concept(R, Rel, N)').map((x) => ({ n: Number(x.N), key: x.Rel, id: x.R })).sort(byCount);
section(`probably hides a concept: ${long.length} bodies with ${MIN.long}+ conditions`, long.map((l) => `${l.key}  ${l.n} conditions  (${l.id})`));

const routed = rows('probably_several_routes(H, N)').map((x) => ({ n: Number(x.N), key: x.H })).sort((a, b) => a.key.localeCompare(b.key));
section(`probably several routes under one name: ${routed.length} tables whose bodies share no derived relation`, routed.map((h) => `${h.key}  ${h.n} bodies`));

const twins = rows('probably_one_rule_with_an_or(H)').map((x) => x.H).sort();
section(`probably one rule with an or: ${twins.length} heads with twin bodies, same relations, same polarity`, twins);

const seenM = new Set<string>();
const mirrors = rows('probably_a_pair_or_a_case_table(H1, H2)').map((x) => [x.H1, x.H2].sort().join(' ~ ')).sort().filter((m) => !seenM.has(m) && seenM.add(m));
section(`probably a pair or a case table: ${mirrors.length} head pairs whose bodies agree except for the heads`, mirrors);

const place = new Map(rows('lint_place(Rel, P)').map((x) => [x.Rel, Number(x.P)]));
const ways = rows('lint_ways(Rel, N)').map((x) => ({ n: Number(x.N), key: x.Rel })).filter((w) => w.n >= 2).sort((a, b) => place.get(a.key)! - place.get(b.key)! || a.key.localeCompare(b.key));
section(`ranked: ${ways.length} heads named by two or more findings`, ways.map((w) => `${place.get(w.key)}. ${w.key}  ${w.n} findings`));
