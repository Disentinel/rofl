// untyped.ts — which one-letter variables nothing in their rule types.
//
//   npm run untyped -- rules/js-*.rofl        (needs rust/target/release/rofl-render)
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Rofl } from '../src/api.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const argv = process.argv.slice(2);
if (!argv.length) { console.error('usage: npm run untyped -- <rules.rofl...>'); process.exit(2); }

const facts = execFileSync(`${ROOT}rust/target/release/rofl-render`, ['--facts', ...argv], { maxBuffer: 1 << 28 }).toString();
const vocab = readFileSync(`${ROOT}facts/js-phrases.rofl`, 'utf8');
// the typed positions of every signed or phrased relation
// the arities each relation is used with: a signature types one arity, and a name used with two is reported
const arities = new Map<string, Set<number>>();
{ const seen = new Map<string, number>();
  for (const m of facts.matchAll(/^arg[vasnf]\((r\d+), (\d+), (\d+), /gm)) { const k = `${m[1]}/${m[2]}`; seen.set(k, Math.max(seen.get(k) ?? 0, Number(m[3]) + 1)); }
  const relOf = new Map<string, string>();
  for (const m of facts.matchAll(/^head\((r\d+), (\w+)\)/gm)) relOf.set(`${m[1]}/0`, m[2]);
  for (const m of facts.matchAll(/^lit\((r\d+), (\d+), (\w+), /gm)) relOf.set(`${m[1]}/${m[2]}`, m[3]);
  for (const [k, n] of seen) { const rel = relOf.get(k); if (rel) (arities.get(rel) ?? arities.set(rel, new Set()).get(rel)!).add(n); }
}
const sigArity = new Map<string, number[]>();
const signed: string[] = [];
const MARKERS = new Set(['of', 'in', 'at', 'for', 'by', 'to', 'from', 'with', 'on', 'than', 'as', 'under', 'is', 'holds', 'holding', 'are', 'since', 'into', 'between', 'only', 'split', 'because', 'against', 'through', 'replaced', 'named', 'being', 'over', 'after', 'before', 'within', 'among', 'the']);
for (const m of vocab.matchAll(/^sig\((\w+), "([^"]+)"\)/gm)) {
  const text = m[2]; const args = text.slice(text.indexOf('(') + 1, -1).split(',').map((a) => a.trim());
  sigArity.set(m[1], [...(sigArity.get(m[1]) ?? []), args.length]);
  args.forEach((a, k) => { const toks = a.split(/\s+/); const last = toks.pop()!; const pos = last.includes(':') ? Number(last.split(':')[1]) : k; const noun = toks.filter((t) => !MARKERS.has(t)).join(' '); if (noun) signed.push(`signed(${m[1]}, ${args.length}, ${pos}, ${JSON.stringify(noun)}).`); });
}
for (const m of vocab.matchAll(/^phrase\((\w+), "([^"]+)"\)/gm)) {
  let k = 0;
  let top = -1;
  const holes: [number, string][] = [];
  for (const h of m[2].matchAll(/<([^>]+)>/g)) { const inner = h[1]; if (inner.includes('=')) { top = Math.max(top, Number(inner.split('=')[0])); continue; } const [a, b] = inner.includes(':') ? inner.split(':') : [String(k++), inner]; top = Math.max(top, Number(a)); holes.push([Number(a), b.trim()]); }
  for (const [a, b] of holes) signed.push(`signed(${m[1]}, ${top + 1}, ${a}, ${JSON.stringify(b)}).`);
  sigArity.set(m[1], [...(sigArity.get(m[1]) ?? []), top + 1]);
}
const signedRels = [...sigArity.entries()].flatMap(([r, as]) => [...new Set(as)].map((a) => `signed_rel(${r}, ${a}).`));
const guards = [...vocab.matchAll(/^noun_guard\(\w+, "[^"]+"\)\./gm)].map((m) => m[0]).join('\n');
const boot = readFileSync(`${ROOT}boot.rofl`, 'utf8');
const r = new Rofl();
const res: any = r.load([boot, readFileSync(`${ROOT}rules/untyped.rofl`, 'utf8'), 'edb(noun_guard).\n' + guards, [...new Set(signed)].join('\n'), signedRels.join('\n'), facts].join('\n'), { budget: 200_000_000 });
if (!res.ok) { console.error(res.diagnostics.slice(0, 3).join('\n')); process.exit(1); }
const rows = (q: string) => (r.query(q).rows as any[]).map((x) => x.bindings);
const clean = (x: any) => String(x).replace(/^"|"$/g, '');
const letters = rows('letter(R, V)').length, untyped = rows('untyped(R, V)'), weak = rows('only_a_node(R, V)').length, long = rows('untyped_long(R, V)').length;
console.log(`one-letter variables: ${letters}; untyped ${untyped.length} (${(100 * untyped.length / letters).toFixed(0)}%), typed only as a node ${weak}; longer names untyped ${long}`);
const byVar = new Map<string, number>(); for (const b of untyped) byVar.set(clean(b.V), (byVar.get(clean(b.V)) ?? 0) + 1);
console.log('by letter: ' + [...byVar].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join(', '));
const means = new Map<string, Set<string>>(); for (const b of rows('letter_means(V, N)')) { const s = means.get(clean(b.V)) ?? new Set(); s.add(clean(b.N)); means.set(clean(b.V), s); }
console.log('\none letter, many types: ' + [...means].filter(([, s]) => s.size > 1).sort((a, b) => b[1].size - a[1].size).map(([v, s]) => `${v} = ${[...s].sort().join('/')}`).join('; '));
const inSigned = rows('untyped_own(Rel, R, V)'), inUnsigned = rows('untyped_debt(Rel, R, V)');
console.log(`\nuntyped letters in a rule that reads or concludes an unsigned relation (the vocabulary's debt): ${inUnsigned.length}; in a rule where every relation is signed (the rule's own): ${inSigned.length}`);
const unsignedArity = rows('unsigned_arity(Rel, A)');
if (unsignedArity.length) console.log('a signed name used with an arity no signature covers: ' + unsignedArity.map((x) => `${x.Rel}/${x.A}`).join(', '));
const bySigned = new Map<string, Set<string>>(); for (const b of [...inSigned, ...inUnsigned]) { const s = bySigned.get(String(b.Rel)) ?? new Set(); s.add(clean(b.V)); bySigned.set(String(b.Rel), s); }
const debtRels = new Set(inUnsigned.map((b) => String(b.Rel)));
const docs = readdirSync(`${ROOT}docs/js`).filter((f: string) => f.endsWith('.md')).map((f: string) => readFileSync(`${ROOT}docs/js/${f}`, 'utf8')).join('\n');
for (const [rel, vs] of [...bySigned].sort((a, b) => b[1].size - a[1].size).slice(0, 25)) {
  const line = new RegExp(`^<a id="${rel}"></a>(.*)$`, 'm').exec(docs);
  console.log(`  ${rel.padEnd(24)} ${[...vs].sort().join(' ').padEnd(6)} ${(debtRels.has(rel) ? 'debt' : 'own').padEnd(5)} ${line ? line[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').slice(0, 110) : ''}`);
}
const byRel = new Map<string, Set<string>>(); for (const b of rows('untyped_in(Rel, R, V)')) { const s = byRel.get(String(b.Rel)) ?? new Set(); s.add(clean(b.V)); byRel.set(String(b.Rel), s); }
console.log(`\nrelations with an untyped letter in a rule: ${byRel.size}`);
