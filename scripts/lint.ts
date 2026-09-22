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

  -- what a body reads that something loaded derives: its carriers
  base(Rel)        :- premise_pos(_, Rel), not concludes(_, Rel).
  body_rel(R, Rel)      :- premise_pos(R, Rel).
  body_rel(R, neg(Rel)) :- premise_neg(R, Rel).
  carrier(R, Rel)  :- concludes(R, H), premise_pos(R, Rel), not base(Rel), Rel != H.
  carrier(R, Rel)  :- concludes(R, H), premise_neg(R, Rel), not base(Rel), Rel != H.
  no_carrier(R)    :- concludes(R, _), not carrier(R, _).

  -- one head, two bodies with no carrier in common: several routes under one name
  shares(R1, R2)   :- carrier(R1, X), carrier(R2, X), R1 != R2.
  split(H, R1, R2) :- concludes(R1, H), concludes(R2, H), R1 != R2, carrier(R1, _), carrier(R2, _), not shares(R1, R2).
  split(H, R1, R2) :- concludes(R1, H), concludes(R2, H), carrier(R1, _), no_carrier(R2).
  several_routes(H) :- split(H, _, _).

  -- twins: two bodies of one head reading the same relations with the same polarity
  same_head(R1, R2) :- concludes(R1, H), concludes(R2, H), R1 != R2.
  differs(R1, R2)   :- same_head(R1, R2), body_rel(R1, X), not body_rel(R2, X).
  twin(H, R1, R2)   :- same_head(R1, R2), concludes(R1, H), not differs(R1, R2), not differs(R2, R1).
  has_twins(H)      :- twin(H, _, _).

  -- mirrors: two heads whose bodies agree except for the heads themselves
  mirror_cand(R1, R2)       :- carrier(R1, X), carrier(R2, X), concludes(R1, H1), concludes(R2, H2), H1 != H2.
  differs_off_heads(R1, R2) :- mirror_cand(R1, R2), body_rel(R1, X), not body_rel(R2, X),
                               not concludes(R1, X), not concludes(R2, X), not mirror_head(R1, X), not mirror_head(R2, X).
  mirror_head(R, neg(H))    :- concludes(R, H).
  mirror(H1, H2)            :- mirror_cand(R1, R2), concludes(R1, H1), concludes(R2, H2),
                               not differs_off_heads(R1, R2), not differs_off_heads(R2, R1).
`;
const MIN_BODIES = 5, MIN_PAIR = 5;

const files = process.argv.slice(2);
if (files.length === 0) { console.error('usage: npm run lint -- <file.rofl> ...'); process.exit(2); }

// what boot.rofl concludes on its own is reported only when a target file adds to it
const bootOnly = new Rofl();
bootOnly.load(readFileSync(BOOT, 'utf8'), 'boot.rofl');
bootOnly.evaluate();
const bootHeads = new Set((bootOnly.query('concludes(R, Rel)').rows as any[]).map((r) => String(r.bindings.Rel)));
const OWN = new Set(['has_body', 'pair_read', 'long_body', 'base', 'body_rel', 'carrier', 'no_carrier', 'shares', 'split', 'several_routes', 'same_head', 'differs', 'twin', 'has_twins', 'mirror_cand', 'differs_off_heads', 'mirror_head', 'mirror']);
const foreign = (rel: string) => bootHeads.has(rel) || OWN.has(rel);

const r = new Rofl();
r.load(readFileSync(BOOT, 'utf8'), 'boot.rofl');
for (const f of files) r.load(readFileSync(f, 'utf8'), f);
r.load(PROJECTIONS, 'lint.rofl');
const ev = r.evaluate(8_000_000) as { partial?: boolean };
const fold = evaluateSemiring(r.store, countingSemiring, { maxRounds: 200 });

const rows = (rel: string) => [...fold.value.entries()]
  .filter(([k, v]) => k.startsWith(rel + '[main](') && typeof v === 'bigint')
  .map(([k, v]) => ({ args: k.slice(rel.length + 7, -1).split(','), n: v as bigint }))
  .sort((a, b) => Number(b.n - a.n));

console.log(`lint over ${files.join(', ')} with boot.rofl${ev.partial ? ' (PARTIAL evaluation)' : ''}`);

const tables = rows('has_body').filter((x) => x.n >= MIN_BODIES && !foreign(x.args[0]));
console.log(`\nprobably a table: ${tables.length} heads with ${MIN_BODIES}+ bodies`);
for (const t of tables) console.log(`  ${t.args[0]}  ${t.n} bodies`);

const seen = new Set<string>();
const pairs = rows('pair_read').filter((x) => x.n >= MIN_PAIR).filter((x) => {
  const key = [...x.args].sort().join(' & ');
  if (seen.has(key)) return false; seen.add(key); return true;
});
console.log(`\nprobably needs a name: ${pairs.length} relation pairs read together by ${MIN_PAIR}+ rules`);
for (const p of pairs) console.log(`  ${[...p.args].sort().join(' & ')}  ${p.n} rules`);

const long = rows('long_body').filter((x) => !foreign(x.args[1]));
const arity = new Map<string, number>();
for (const row of r.query('has_premise(R, K)').rows as any[]) {
  const id = String(row.bindings.R), k = Number(row.bindings.K);
  arity.set(id, Math.max(arity.get(id) ?? 0, k));
}
console.log(`\nprobably hides a concept: ${long.length} bodies with 7+ conditions`);
for (const l of long) console.log(`  ${l.args[1]}  ${arity.get(l.args[0]) ?? '?'} conditions  (${l.args[0]})`);


const names = (q: string, k: string) => [...new Set((r.query(q).rows as any[]).map((x) => String(x.bindings[k])))].filter((n) => !foreign(n)).sort();
const bodies = new Map(rows('has_body').map((x) => [x.args[0], x.n]));
const routed = names('several_routes(H)', 'H').filter((h) => (bodies.get(h) ?? 0n) >= MIN_BODIES);
console.log(`\nprobably several routes under one name: ${routed.length} tables whose bodies share no derived relation`);
for (const h of routed) console.log(`  ${h}  ${bodies.get(h)} bodies`);

const twins = names('has_twins(H)', 'H');
console.log(`\nprobably one rule with an or: ${twins.length} heads with twin bodies, same relations, same polarity`);
for (const h of twins) console.log(`  ${h}`);

const seenM = new Set<string>();
const mirrors = (r.query('mirror(H1, H2)').rows as any[]).map((x) => [String(x.bindings.H1), String(x.bindings.H2)].sort().join(' ~ '))
  .filter((m) => { if (seenM.has(m)) return false; seenM.add(m); return !m.split(' ~ ').some(foreign); }).sort();
console.log(`\nprobably a pair or a case table: ${mirrors.length} head pairs whose bodies agree except for the heads`);
for (const m of mirrors) console.log(`  ${m}`);
