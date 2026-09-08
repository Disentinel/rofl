// scanners/rule_shape_report.ts — RENDER the rule-shape model. Decides
// nothing: every number below is one query against rules/rule-shape.rofl,
// and each is printed with the query that produced it so it can be re-run and
// argued with.
//
//   npm run ruleshape
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Rofl } from '../src/api.ts';

const ROOT = join(import.meta.dirname, '..');
const r = new Rofl();
for (const f of ['boot.rofl', 'facts/rule-shape.rofl', 'rules/rule-shape.rofl']) {
  const res = r.load(readFileSync(join(ROOT, f), 'utf8'));
  if (!res.ok) { console.error(`${f} REJECTED:\n${res.diagnostics.join('\n')}`); process.exit(1); }
}
r.evaluate();

const n = (query: string) => r.query(query).rows.length;
const rows = (query: string) => r.query(query).rows.map((x) => (x as { bindings: Record<string, string> }).bindings);

const total = n('neg_site(S, _, _, _, _)');
const line = (label: string, query: string) => {
  const c = n(query);
  console.log(`  ${label.padEnd(34)}${String(c).padStart(5)}  ${(100 * c / total).toFixed(1).padStart(5)}%   ${query}`);
};

// The site id comes back as a rendered STRING TERM, quotes included, so it is
// its own query literal and must not be quoted again.
const site = (b: Record<string, string>) => b['S'];
const where = new Map<string, { rel: string; book: string; group: string }>();
for (const b of rows('neg_site(S, _, Rel, Book, Group)')) {
  where.set(b['S'], { rel: b['Rel'], book: b['Book'], group: b['Group'] });
}
const strip = (x: string | undefined) => (x ?? '?').replace(/^"|"$/g, '');

console.log(`\nNEGATIVE PREMISES IN THE TREE: ${total}\n`);
console.log('THE SHAPE — what a negation actually asks the store for');
line('point (every arg ground)', 'neg_point(S)');
line('prefix (some args ground)', 'neg_prefix(S)');
line('SCAN (nothing ground)', 'neg_unkeyed(S)');
line('  of the keyed: left-contiguous', 'neg_contiguous(S)');
line('  of the keyed: scattered mask', 'neg_scattered(S)');

console.log('\nTHE BLOCKERS — shapes that keep every book resident');
line('book is a variable', 'neg_book_free(S)');
line('pins everything (either)', 'pins_everything(S)');
line('shape is cold-safe', 'cold_ok_shape(S)');

console.log('\nDERIVED VERSUS BASE — is a lookup enough, or must rules run first');
line('site over a BASE relation', 'cold_safe(S)');
line('site over a DERIVED relation', 'needs_rules(S)');

// THE RESIDENCY VERDICT, per (relation, book) rather than per site, because
// residency is a property of the book and not of who reads it.
const nrel = n('neg_rel(R, B)');
const rline = (label: string, query: string) => {
  const c = n(query);
  console.log(`  ${label.padEnd(34)}${String(c).padStart(5)}  ${(100 * c / nrel).toFixed(1).padStart(5)}%   ${query}`);
};
console.log(`\nRESIDENCY — per negated (relation, book), ${nrel} of them`);
rline('cold: a lookup answers it', 'cold_lookup(R, B)');
rline('cold: derived inside its own book', 'cold_cached(R, B)');
rline('HOT: a writer reads outside it', 'must_be_hot(R, B)');
console.log(`\n  rules that stay inside their book  ${String(n('rule_self_contained(R, B)')).padStart(5)}   rule_self_contained(R, B)`);
console.log(`  rules that read another book      ${String(n('rule_leaves(R, B)')).padStart(5)}   rule_leaves(R, B)`);

const scans = rows('neg_unkeyed(S)');
if (scans.length > 0) {
  console.log(`\nTHE SCANS, every one of them — these are the rules a cold-book policy would have to change:`);
  for (const s of scans) {
    const at = where.get(site(s));
    console.log(`  ${strip(at?.rel).padEnd(20)} [${strip(at?.book).padEnd(8)}] ${strip(at?.group).padEnd(9)} ${strip(site(s))}`);
  }
}

const bookvars = rows('neg_book_free(S)');
if (bookvars.length > 0) {
  console.log(`\nNEGATIONS OVER A VARIABLE BOOK:`);
  for (const s of bookvars) {
    const at = where.get(site(s));
    console.log(`  ${strip(at?.rel).padEnd(20)} ${strip(at?.group).padEnd(9)} ${strip(site(s))}`);
  }
}

// PER GROUP, because the three populations are written to different
// constraints and one average hides both. `rules/` is the code-analysis pack —
// the closest thing in this tree to the workload the cold-book design is FOR —
// while `examples/` are demonstrations of reasoning, where almost everything is
// derived on purpose.
console.log('\nBY GROUP — the populations are not alike and an average would hide it');
console.log(`  ${'group'.padEnd(10)}${'sites'.padStart(6)}${'point'.padStart(7)}${'prefix'.padStart(7)}${'scan'.padStart(6)}${'bookvar'.padStart(8)}${'base'.padStart(6)}${'derived'.padStart(8)}`);
for (const g of ['kernel', 'examples', 'rules']) {
  // ONE LITERAL PER QUERY. `Rofl.query` answers a conjunction with zero rows
  // and no error, so the join is a rule (`g_*`) and this only counts.
  const q = (rel: string) => n(`${rel}(${JSON.stringify(g)}, S)`);
  const tot = q('g_site');
  if (tot === 0) continue;
  console.log(
    `  ${g.padEnd(10)}${String(tot).padStart(6)}${String(q('g_point')).padStart(7)}` +
    `${String(q('g_prefix')).padStart(7)}${String(q('g_scan')).padStart(6)}` +
    `${String(q('g_bookvar')).padStart(8)}${String(q('g_base')).padStart(6)}` +
    `${String(q('g_derived')).padStart(8)}`,
  );
}

console.log('\nRESIDENCY BY GROUP');
console.log(`  ${'group'.padEnd(10)}${'lookup'.padStart(8)}${'cached'.padStart(8)}${'HOT'.padStart(6)}`);
for (const g of ['kernel', 'examples', 'rules']) {
  const q = (rel: string) => n(`${rel}(${JSON.stringify(g)}, R, B)`);
  if (q('g_lookup') + q('g_cached') + q('g_hot') === 0) continue;
  console.log(`  ${g.padEnd(10)}${String(q('g_lookup')).padStart(8)}${String(q('g_cached')).padStart(8)}${String(q('g_hot')).padStart(6)}`);
}
