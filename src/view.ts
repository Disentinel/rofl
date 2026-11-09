// view.ts — A VIEW (`view step_in(S, X).`), the TypeScript side of rust/rofl/src/engine/view.rs: a relation whose
// rows are never stored. Every rule that reads it reads its rules' bodies in its place, unfolded before the rules are
// judged: one copy of the reader for each rule of the view, the view's variables renamed apart and its head unified
// with the premise. A negated read unfolds only where the view is one rule of one positive premise. Where it cannot
// unfold the view is rows, and `reasons` says why.

import { type Term, type Lit, type BodyElem, type Clause, type Subst, mkv, unify, resolve, elemVars, varsOf, annotateAggs, litsOf } from './unify.ts';
import { type DRule } from './reflect.ts';

const cmpJs = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface Unfolded { rules: DRule[]; changed: Set<string>; reasons: string[]; views: Map<string, Clause[]> }

export function unfoldViews(decl: Set<string>, rules: DRule[], isCell: (rel: string) => boolean, wellFounded: boolean): Unfolded {
  const out: Unfolded = { rules, changed: new Set(), reasons: [], views: new Map() };
  if (decl.size === 0) return out;
  const views = new Map<string, DRule[]>();
  for (const r of rules) if (decl.has(r.clause.head.rel)) { const e = views.get(r.clause.head.rel); if (e) e.push(r); else views.set(r.clause.head.rel, [r]); }
  for (const rel of [...decl].sort(cmpJs)) {
    const rs = views.get(rel);
    const why = rs === undefined ? 'it has no rule'
      : isCell(rel) ? 'it is a lattice'
      : wellFounded ? 'the world is well-founded'
      : rs.some((r) => r.clause.head.temporal !== 'now') ? 'a rule of it stages'
      : rs.some((r) => r.clause.body.some((b) => b.t === 'agg')) ? 'a rule of it aggregates'
      : null;
    if (why !== null) { out.reasons.push(`${rel}: ${why}`); views.delete(rel); }
  }
  const below = (rel: string): string[] => (views.get(rel) ?? []).flatMap((d) => d.clause.body.flatMap(litsOf).map((l) => l.rel)).filter((x) => views.has(x));
  const reach = (from: string): Set<string> => {
    const seen = new Set<string>([from]);
    const stack = [from];
    while (stack.length > 0) for (const x of below(stack.pop()!)) if (!seen.has(x)) { seen.add(x); stack.push(x); }
    return seen;
  };
  for (;;) {
    const refuse: [string, string][] = [];
    for (const rel of views.keys()) if (below(rel).some((x) => reach(x).has(rel))) refuse.push([rel, 'it reads itself']);
    for (const r of rules) for (const b of r.clause.body) {
      if (b.t === 'pos' && views.has(b.lit.rel) && b.lit.temporal !== 'now') refuse.push([b.lit.rel, 'a rule reads it in another tense']);
      else if (b.t === 'neg' && views.has(b.lit.rel)) {
        const ds = views.get(b.lit.rel)!;
        if (!(ds.length === 1 && ds[0].clause.body.length === 1 && ds[0].clause.body[0].t === 'pos') || b.lit.temporal !== 'now') refuse.push([b.lit.rel, 'a rule reads it negated and it is more than one literal']);
      } else if (b.t === 'agg') for (const l of b.body.flatMap(litsOf)) if (views.has(l.rel)) refuse.push([l.rel, 'an aggregate reads it']);
    }
    if (refuse.length === 0) break;
    refuse.sort((a, b) => cmpJs(a[0], b[0]));
    const seen = new Set<string>();
    for (const [rel, why] of refuse) if (!seen.has(rel)) { seen.add(rel); out.reasons.push(`${rel}: ${why}`); views.delete(rel); }
  }
  if (views.size === 0) return out;
  const rename = renameApart;
  out.rules = [];
  for (const rel of views.keys()) out.views.set(rel, []);
  for (const r of rules) {
    const into = views.has(r.clause.head.rel) ? null : out.rules;
    if (!r.clause.body.some((b) => (b.t === 'pos' || b.t === 'neg') && views.has(b.lit.rel))) { if (into) into.push(r); else out.views.get(r.clause.head.rel)!.push(r.clause); continue; }
    const done: Clause[] = [];
    const work: Clause[] = [r.clause];
    while (work.length > 0) {
      const c = work.pop()!;
      const i = c.body.findIndex((b) => (b.t === 'pos' || b.t === 'neg') && views.has(b.lit.rel));
      if (i < 0) { done.push(c); continue; }
      const p = c.body[i] as { t: 'pos' | 'neg'; lit: Lit };
      for (const d0 of [...views.get(p.lit.rel)!].reverse()) {
        const d = rename(d0.clause);
        let s: Subst | null = unify(p.lit.persp, d.head.persp, new Map());
        if (s !== null && p.lit.args.length === d.head.args.length) for (let k = 0; k < p.lit.args.length && s !== null; k++) s = unify(p.lit.args[k], d.head.args[k], s);
        if (s === null || p.lit.args.length !== d.head.args.length) continue;
        const inner: BodyElem[] = p.t === 'neg' ? [{ t: 'neg', lit: (d.body[0] as { lit: Lit }).lit }] : d.body;
        work.push(resolveClause({ head: c.head, body: [...c.body.slice(0, i), ...inner, ...c.body.slice(i + 1)] }, s));
      }
    }
    done.reverse();
    done.forEach((clause, k) => {
      clause = annotateAggs(clause);
      const id = k === 0 ? r.id : `${r.id}~${k}`;
      if (into === null) { out.views.get(r.clause.head.rel)!.push(clause); return; }
      out.changed.add(id);
      into.push({ id, clause, canon: `${r.canon}~view${k}` });
    });
  }
  return out;
}

let fresh = 0;

/** A clause with every variable renamed to one no other clause holds. */
export function renameApart(c: Clause): Clause {
  const vs = new Set<string>();
  for (const t of [...c.head.args, c.head.persp]) varsOf(t, vs);
  for (const b of c.body) elemVars(b, vs);
  const s: Subst = new Map([...vs].sort().map((x) => [x, mkv(`_$v${++fresh}`)] as [string, Term]));
  return resolveClause(c, s);
}

function resolveLit(l: Lit, s: Subst): Lit {
  return { ...l, persp: resolve(l.persp, s), args: l.args.map((a) => resolve(a, s)) };
}

function resolveElem(b: BodyElem, s: Subst): BodyElem {
  if (b.t === 'pos' || b.t === 'neg') return { t: b.t, lit: resolveLit(b.lit, s) };
  if (b.t === 'bi') return { ...b, l: resolve(b.l, s), r: resolve(b.r, s) };
  return { ...b, res: resolve(b.res, s), vals: b.vals.map((t) => resolve(t, s)), keys: b.keys.map((t) => resolve(t, s)), body: b.body.map((e) => resolveElem(e, s)) };
}

function resolveClause(c: Clause, s: Subst): Clause {
  return { head: resolveLit(c.head, s), body: c.body.map((b) => resolveElem(b, s)) };
}
