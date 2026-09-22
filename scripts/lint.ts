// lint.ts — "probably needs a name", as a QUERY over the reflection.
//
//   npm run lint -- rules/js-dataflow.rofl [more .rofl files]
//
// The rules below only project; they decide nothing. The counting semiring is
// then folded over the support the store already recorded, and the number of
// derivations of `has_body(Rel)` is the number of distinct rules concluding
// Rel, because every rule is its own premise. That is how a count is had
// without an order on atoms and without an aggregate in the kernel: the
// Boolean fixpoint is untouched and the count's witness is the support graph.
// See f_atoms_have_no_order_so_rules_cannot_count_past_three.
//
// The fold counts DERIVATIONS, not tuples. The three projections here map
// distinct tuples one to one onto derivations; a projection that does not
// would count something else, and anything recursive would read INFINITE.
import { readFileSync } from 'node:fs';
import { Rofl } from '../src/api.ts';
import { evaluateSemiring } from '../src/semiring.ts';
import { countingSemiring } from '../runtime/semirings.ts';

const BOOT = new URL('../boot.rofl', import.meta.url);
const PROJECTIONS = `
  has_body(Rel)     :- concludes(R, Rel).
  pair_read(A, B)   :- premise_pos(R, A), premise_pos(R, B), A != B.
  long_body(R, Rel) :- has_premise(R, 7), concludes(R, Rel).
`;
const MIN_BODIES = 5, MIN_PAIR = 5;

const files = process.argv.slice(2);
if (files.length === 0) { console.error('usage: npm run lint -- <file.rofl> ...'); process.exit(2); }

// what boot.rofl concludes on its own is reported only when a target file adds to it
const bootOnly = new Rofl();
bootOnly.load(readFileSync(BOOT, 'utf8'), 'boot.rofl');
bootOnly.evaluate();
const bootHeads = new Set((bootOnly.query('concludes(R, Rel)').rows as any[]).map((r) => String(r.bindings.Rel)));

const r = new Rofl();
r.load(readFileSync(BOOT, 'utf8'), 'boot.rofl');
for (const f of files) r.load(readFileSync(f, 'utf8'), f);
r.load(PROJECTIONS, 'lint.rofl');
const ev = r.evaluate() as { partial?: boolean };
const fold = evaluateSemiring(r.store, countingSemiring, { maxRounds: 200 });

const rows = (rel: string) => [...fold.value.entries()]
  .filter(([k, v]) => k.startsWith(rel + '[main](') && typeof v === 'bigint')
  .map(([k, v]) => ({ args: k.slice(rel.length + 7, -1).split(','), n: v as bigint }))
  .sort((a, b) => Number(b.n - a.n));

console.log(`lint over ${files.join(', ')} with boot.rofl${ev.partial ? ' (PARTIAL evaluation)' : ''}`);

const tables = rows('has_body').filter((x) => x.n >= MIN_BODIES && !bootHeads.has(x.args[0]));
console.log(`\nprobably a table: ${tables.length} heads with ${MIN_BODIES}+ bodies`);
for (const t of tables) console.log(`  ${t.args[0]}  ${t.n} bodies`);

const seen = new Set<string>();
const pairs = rows('pair_read').filter((x) => x.n >= MIN_PAIR).filter((x) => {
  const key = [...x.args].sort().join(' & ');
  if (seen.has(key)) return false; seen.add(key); return true;
});
console.log(`\nprobably needs a name: ${pairs.length} relation pairs read together by ${MIN_PAIR}+ rules`);
for (const p of pairs) console.log(`  ${[...p.args].sort().join(' & ')}  ${p.n} rules`);

const long = rows('long_body').filter((x) => !bootHeads.has(x.args[1]));
const arity = new Map<string, number>();
for (const row of r.query('has_premise(R, K)').rows as any[]) {
  const id = String(row.bindings.R), k = Number(row.bindings.K);
  arity.set(id, Math.max(arity.get(id) ?? 0, k));
}
console.log(`\nprobably hides a concept: ${long.length} bodies with 7+ conditions`);
for (const l of long) console.log(`  ${l.args[1]}  ${arity.get(l.args[0]) ?? '?'} conditions  (${l.args[0]})`);
