// tag.ts — SEMIRING TAGS IN THE KERNEL (docs/aggregates.md, "Tags, as
// built"); the TypeScript side of rust/rofl/src/tag.rs. `tag cost(A, C,
// tropical T).` keys a cell by the whole head, T its tag. `lower` rewrites
// the clause the engine runs, before safety.rofl judges it: an idempotent tag
// is the order lattice of its ⊕ and ⊗ a chain of `X is $alg(Acc, T)` steps;
// counting concludes a derivation `p@count(K..., $firing(Rule, Vars), N)`
// and the engine's rule `p@count` sums them per key.

import { type Term, type Lit, type BodyElem, type Clause, mka, mki, mkv, mkf, varsOf, elemVars, annotateAggs, litsOf } from './unify.ts';
import { type TagAlg, tagFromName, tagOrder, tagOne, tagTimesName } from './cell.ts';
import { type FactStore, factKey } from './store.ts';
import { V, KERNEL_PERSP, type DRule } from './reflect.ts';

/** The `(Rel, Arity, Op)` rows of a declaration relation, `lattice_decl` or
 *  `tag_decl`; a row of another shape is a sentence in `refused`. */
export function declRows(store: FactStore, rel: string, refused: string[]): [string, number, string][] {
  const out: [string, number, string][] = [];
  for (const f of store.relPersp(rel, KERNEL_PERSP)) {
    const a = f.args;
    if (a.length === 3 && a[0].k === 'a' && a[1].k === 'i' && Number(a[1].v) >= 1 && a[2].k === 'a') out.push([a[0].name, Number(a[1].v), a[2].name]);
    else refused.push(`${factKey(f.rel, f.persp, f.args)} declares nothing: a declaration is (relation, arity, operation), two atoms and an arity of one or more, the last argument the cell's value`);
  }
  return out;
}

export interface Tags {
  byRel: Map<string, [number, TagAlg]>;
  countRel: Map<string, string>;
  countOf: Map<string, string>;
  refused: string[];
}

export function readTags(store: FactStore, lattices: [string, number, string][]): Tags {
  const t: Tags = { byRel: new Map(), countRel: new Map(), countOf: new Map(), refused: [] };
  const decls = declRows(store, V.tag_decl, t.refused);
  decls.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  for (const [rel, n, algName] of decls) {
    const a = tagFromName(algName);
    if (a === null) {
      t.refused.push(`tag ${rel}: ${algName} is no algebra of a tag; one of tropical, viterbi, trust, counting`);
      continue;
    }
    const had = t.byRel.get(rel);
    if (had) {
      if (had[0] !== n || had[1] !== a) {
        t.refused.push(`tag ${rel}: it is declared twice, as ${had[1]} of ${had[0]} arguments and ${a} of ${n}: a relation has one algebra`);
      }
      continue;
    }
    if (lattices.some(([l]) => l === rel)) {
      t.refused.push(`tag ${rel}: it is declared a lattice too: a relation has one algebra`);
      continue;
    }
    t.byRel.set(rel, [n, a]);
    if (a === 'counting') {
      const c = `${rel}@count`;
      t.countRel.set(rel, c);
      t.countOf.set(c, rel);
    }
  }
  return t;
}

/** The order lattice each idempotent tag is, as `lattice_decl` rows. */
export function tagsAsLattices(t: Tags): [string, number, string][] {
  const out: [string, number, string][] = [];
  for (const [r, [n, a]] of t.byRel) {
    const op = tagOrder(a);
    if (op !== null) out.push([r, n, op]);
  }
  return out.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
}

export function tagAlgOf(t: Tags, l: Lit): TagAlg | null {
  const e = t.byRel.get(l.rel);
  return e && e[0] === l.args.length ? e[1] : null;
}

export interface Lowered { rules: DRule[]; changed: Set<string>; refused: [string, string][] }

export function lowerTags(tags: Tags, rules: DRule[]): Lowered {
  const out: Lowered = { rules: [], changed: new Set(), refused: [] };
  if (tags.byRel.size === 0) { out.rules = rules; return out; }
  const counted: string[] = [];
  for (const r0 of rules) {
    const lits = [r0.clause.head, ...r0.clause.body.flatMap(litsOf)];
    if (lits.some((l) => { const e = tags.byRel.get(l.rel); return e !== undefined && e[0] !== l.args.length; })) {
      out.refused.push([r0.id, 'tag_arity']);
      out.rules.push(r0);
      continue;
    }
    const alg = tagAlgOf(tags, r0.clause.head);
    if (alg === null) { out.rules.push(r0); continue; }
    const head0 = r0.clause.head;
    const n = head0.args.length;
    const slot = head0.args[n - 1];
    const factors: Term[] = [];
    for (const b of r0.clause.body) if (b.t === 'pos' && tagAlgOf(tags, b.lit) === alg) factors.push(b.lit.args[b.lit.args.length - 1]);
    const bodyVars = new Set<string>();
    for (const b of r0.clause.body) elemVars(b, bodyVars);
    const weight = slot.k === 'v' && !bodyVars.has(slot.name) ? null : slot;
    if (weight !== null && readsFactor(r0.clause.body, factors, weight)) {
      out.refused.push([r0.id, 'tag_weight_reads_tag']);
      out.rules.push(r0);
      continue;
    }
    const fv = alg === 'counting' ? firingVars(r0.clause.body) : [];
    let acc: Term = mki(tagOne(alg));
    let k = 0;
    const body = [...r0.clause.body];
    for (const f of [...(weight ? [weight] : []), ...factors]) {
      k++;
      const x = mkv(`$t${k}`);
      body.push({ t: 'bi', op: 'is', l: x, r: mkf(tagTimesName(alg), [acc, f]) });
      acc = x;
    }
    let head: Lit;
    if (alg === 'counting') {
      const c = tags.countRel.get(head0.rel)!;
      const firing = mkf('$firing', [mka(r0.id), ...fv.map(mkv)]);
      const args = [...head0.args];
      args[n - 1] = firing;
      args.push(acc);
      head = { ...head0, rel: c, args };
      if (!counted.includes(c)) counted.push(c);
    } else {
      const args = [...head0.args];
      args[n - 1] = acc;
      head = { ...head0, args };
    }
    out.changed.add(r0.id);
    out.rules.push({ id: r0.id, clause: { head, body }, canon: r0.canon });
  }
  counted.sort();
  for (const c of counted) {
    const p = tags.countOf.get(c)!;
    const n = tags.byRel.get(p)![0];
    const book = mkv('B');
    const keys: Term[] = [];
    for (let i = 0; i < n - 1; i++) keys.push(mkv(`X${i}`));
    const f = mkv('F'), val = mkv('V'), total = mkv('N');
    const lit = (rel: string, args: Term[]): Lit => ({ rel, persp: book, perspExplicit: true, args, temporal: 'now' });
    const clause: Clause = annotateAggs({
      head: lit(p, [...keys, total]),
      body: [{ t: 'agg', op: 'sum', res: total, vals: [val], keys: [f], body: [{ t: 'pos', lit: lit(c, [...keys, f, val]) }] }],
    });
    out.changed.add(c);
    out.rules.push({ id: c, clause, canon: c });
  }
  return out;
}

/** What tells one derivation from another: every variable the body binds. */
function firingVars(body: BodyElem[]): string[] {
  const fv = new Set<string>();
  for (const b of body) {
    if (b.t === 'pos' || b.t === 'bi') elemVars(b, fv);
    else if (b.t === 'agg') { varsOf(b.res, fv); for (const x of b.shared ?? []) fv.add(x); }
  }
  return [...fv];
}

/** Does the weight read a tag it multiplies, directly or through `is` and `=`? */
function readsFactor(body: BodyElem[], factors: Term[], w: Term): boolean {
  const taint = new Set<string>();
  for (const f of factors) varsOf(f, taint);
  for (;;) {
    const before = taint.size;
    for (const b of body) {
      if (b.t !== 'bi' || (b.op !== 'is' && b.op !== '=')) continue;
      const lv = [...varsOf(b.l)], rv = [...varsOf(b.r)];
      const fromR = rv.some((x) => taint.has(x)), fromL = b.op === '=' && lv.some((x) => taint.has(x));
      if (fromR) for (const x of lv) taint.add(x);
      if (fromL) for (const x of rv) taint.add(x);
    }
    if (taint.size === before) break;
  }
  return [...varsOf(w)].some((x) => taint.has(x));
}
