// labeled.ts — LABELED UNKNOWNS (docs/aggregates.md, "Labeled unknowns"), the TypeScript twin of
// rust/rofl/src/engine/labeled.rs: what a fault leaves unknown has a name and a condition, and a group whose members
// rest on such names alone is decided by what each value the names could be gives it.
//
// A label is one unknown value; the values it can be told apart by are the constants the terms around it mention, and
// one class for all the rest, two labels sharing a class or not (a REGION is one assignment of every label to a
// constant or a class). A group's member count or total is folded over its known members and the possibles present in
// each region; the same in every region and it is the group's value, otherwise the value of the one label, region by
// region, is a `$by`. More regions than `LABEL_REGIONS` and the group is not decided.

import { labelText } from './shrug.ts';
import { type Term, canonTerm, mki, mkf, unkParts, byParts, mkUnk, mkList, holdsUnknown, TERM_MIN, TERM_MAX } from './unify.ts';

export const LABEL_REGIONS = 64;

/** A possible, as far as regions read it (`Possible` of aggeval.ts). */
export interface Poss {
  pat: (Term | null)[];
  lab: ({ t: Term; ex: Term[] } | null)[];
  proj: Term[] | null;
  sproj: Term[];
  sure: boolean;
  neg: boolean;
}

export type Regions = { k: 'no' } | { k: 'decided'; v: bigint; by: string } | { k: 'cond'; t: Term } | { k: 'capped'; n: number };

type Rv = { c: Term } | { class: number };

const key = (t: Term): string => `(${canonTerm(t)})`;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const asInt = (t: Term | undefined): bigint | null => (t !== undefined && t.k === 'i' ? BigInt(t.v) : null);
const inRange = (n: bigint): boolean => n >= TERM_MIN && n <= TERM_MAX;

const MARK = '$unsure';
/** The solution passed an undecided step, so what it gives may not exist. */
export const unsure = (s: Map<string, Term>): Map<string, Term> => (s.has(MARK) ? s : new Map(s).set(MARK, mki(1)));
export const isUnsure = (s: Map<string, Term>): boolean => s.has(MARK);

export function mkBy(label: Term, dflt: Term, cases: [Term, Term][], sure: boolean): Term {
  return mkf('$by', [label, dflt, mkList(cases.map(([c, v]) => mkf('c', [c, v]))), mki(sure ? 1 : 0)]);
}

/** A term whose tuple may not exist after all. */
export function desure(t: Term): Term {
  const u = unkParts(t);
  if (u !== null) return mkUnk(u.label, u.ex, false);
  const b = byParts(t);
  if (b !== null) return mkBy(b.label, b.dflt, b.cases, false);
  return t;
}

/** Whether the tuple with these arguments exists in every completion: it holds a labeled value, and every one it holds is sure. */
export function sureArgs(args: Term[]): boolean {
  let any = false;
  for (const a of args) {
    const u = unkParts(a);
    const b = u === null ? byParts(a) : null;
    const sure = u !== null ? u.sure : b !== null ? b.sure : undefined;
    if (sure === undefined) continue;
    if (!sure) return false;
    any = true;
  }
  return any;
}

const regionOk = (p: Poss): boolean =>
  p.sure && !p.neg && p.pat.every((t, i) => t !== null || p.lab[i] !== null) && p.sproj.every((t) => !holdsUnknown(t) || unkParts(t) !== null || byParts(t) !== null);

/** How many regions `nl` labels have over `nc` constants: each takes a constant, a class already used, or a new one. */
function countRegions(nl: number, nc: number): number {
  let g: number[] = new Array(nl + 2).fill(1);
  for (let j = 0; j < nl; j++) {
    const next: number[] = [];
    for (let k = 0; k <= nl; k++) next.push(Math.min(Number.MAX_SAFE_INTEGER, (nc + k) * g[k] + g[k + 1]));
    g = [...next, 1];
  }
  return g[0];
}

function regionList(nl: number, consts: Term[]): Rv[][] {
  const out: Rv[][] = [];
  const go = (classes: number, cur: Rv[]): void => {
    if (cur.length === nl) { out.push([...cur]); return; }
    for (const c of consts) { cur.push({ c }); go(classes, cur); cur.pop(); }
    for (let k = 0; k <= classes; k++) { cur.push({ class: k }); go(Math.max(classes, k + 1), cur); cur.pop(); }
  };
  go(0, []);
  return out;
}

/** A term in a region: a labeled value is the constant or the class its label has there, a `$by` the case that constant
 *  has, and `null` where the label is a value the occurrence is known not to be (the tuple that holds it is not there). */
function inst(t: Term, labels: Term[], rg: Rv[]): Term | null | undefined {
  const u = unkParts(t);
  if (u !== null) {
    const at = labels.findIndex((x) => canonTerm(x) === canonTerm(u.label));
    if (at < 0) return undefined;
    const r = rg[at];
    if ('c' in r) return u.ex.some((x) => canonTerm(x) === canonTerm(r.c)) ? null : r.c;
    return mkf('$other', [mki(r.class)]);
  }
  const b = byParts(t);
  if (b !== null) {
    const at = labels.findIndex((x) => canonTerm(x) === canonTerm(b.label));
    if (at < 0) return undefined;
    const hit = b.cases.find(([k]) => caseMatches(k, labels, rg, at));
    return inst(hit?.[1] ?? b.dflt, labels, rg);
  }
  return t;
}

const sameRv = (a: Rv, b: Rv): boolean => ('c' in a ? 'c' in b && canonTerm(a.c) === canonTerm(b.c) : 'class' in b && a.class === b.class);

/** Whether the case keyed `k` of a `$by` on the label at `at` is the region's: a constant the label is, or another
 *  label it is equal to (the same constant, or the same class). */
function caseMatches(k: Term, labels: Term[], rg: Rv[], at: number): boolean {
  if (k.k === 'f' && k.name === '$lbl') {
    const j = labels.findIndex((x) => canonTerm(x) === canonTerm(k));
    return j >= 0 && sameRv(rg[j], rg[at]);
  }
  return sameRv(rg[at], { c: k });
}

/** The labels and constants a term names, a `$by` and what it holds too. */
function namesIn(t: Term, labels: Map<string, Term>, consts: Map<string, Term>): void {
  const u = unkParts(t);
  if (u !== null) { labels.set(key(u.label), u.label); for (const c of u.ex) consts.set(key(c), c); return; }
  const b = byParts(t);
  if (b === null) return;
  labels.set(key(b.label), b.label);
  for (const [k, v] of b.cases) {
    if (k.k === 'f' && k.name === '$lbl') labels.set(key(k), k); else consts.set(key(k), k);
    namesIn(v, labels, consts);
  }
  namesIn(b.dflt, labels, consts);
}

/** The value of the group as a table over the labels, `labels[i..]` still to be told, `idx` the regions the labels before
 *  them are the same in (`by_node`, Rust). */
function byNode(labels: Term[], regs: Rv[][], vs: bigint[], consts: Term[], i: number, idx: number[]): Term {
  if (i === labels.length) return mki(vs[idx[0]]);
  const cases: [Term, Term][] = [];
  for (const c of consts) {
    const sub = idx.filter((r) => sameRv(regs[r][i], { c }));
    if (sub.length > 0) cases.push([c, byNode(labels, regs, vs, consts, i + 1, sub)]);
  }
  // the classes the labels before it are in, each by the first label in it
  const classes: [number, number][] = [];
  regs[idx[0]].slice(0, i).forEach((rv, j) => { if ('class' in rv && !classes.some(([c]) => c === rv.class)) classes.push([rv.class, j]); });
  for (const [k, j] of classes) {
    const sub = idx.filter((r) => sameRv(regs[r][i], { class: k }));
    cases.push([labels[j], byNode(labels, regs, vs, consts, i + 1, sub)]);
  }
  const fresh: Rv = { class: classes.length };
  const dflt = byNode(labels, regs, vs, consts, i + 1, idx.filter((r) => sameRv(regs[r][i], fresh)));
  const dk = canonTerm(dflt);
  const kept = cases.filter(([, v]) => canonTerm(v) !== dk);
  return kept.length === 0 ? dflt : mkBy(labels[i], dflt, kept, true);
}

/** The group's member count or total in one region, over its known members and the possibles present there; `null`
 *  where it has no member. */
function regionValue(count: boolean, labels: Term[], rg: Rv[], gkey: Term[], projs: Term[][], vals: Term[], mine: Poss[]): bigint | null {
  const seen = new Set<string>();
  let total = 0n;
  for (let m = 0; m < projs.length; m++) {
    seen.add(projs[m].map(canonTerm).join('\u0001'));
    if (count) total += 1n; else { const v = asInt(vals[m]); if (v === null) return null; total += v; }
  }
  outer: for (const p of mine) {
    for (let i = 0; i < gkey.length; i++) {
      const t = p.pat[i];
      if (t !== null) { if (canonTerm(t) !== canonTerm(gkey[i])) continue outer; continue; }
      const l = p.lab[i];
      if (l === null) return null;
      const x = inst(l.t, labels, rg);
      if (x === undefined || x === null || canonTerm(x) !== canonTerm(gkey[i])) continue outer;
    }
    const pr: Term[] = [];
    for (const t of p.sproj) {
      const x = inst(t, labels, rg);
      if (x === undefined) return null;
      if (x === null) continue outer;
      pr.push(x);
    }
    const k = pr.map(canonTerm).join('\u0001');
    if (seen.has(k)) continue;
    if (count) total += 1n; else { const v = asInt(pr[0]); if (v === null) return null; total += v; }
    seen.add(k);
  }
  return seen.size > 0 && inRange(total) ? total : null;
}

/** THE GROUP `gkey` BY REGIONS, of a count or a sum whose possibles `mine` all exist in every completion and rest on
 *  labels alone (`region_decide`, Rust). */
export function regionDecide(op: string, params: number, gkey: Term[], projs: Term[][], vals: Term[], mine: Poss[]): Regions {
  const no: Regions = { k: 'no' };
  if ((op !== 'count' && op !== 'sum') || params !== 0 || mine.length === 0 || !mine.every(regionOk)) return no;
  const labelsAt = new Map<string, Term>();
  const constAt = new Map<string, Term>();
  for (const c of gkey) constAt.set(key(c), c);
  for (const p of mine) {
    const occs = [...p.lab.flatMap((l) => (l === null ? [] : [l.t])), ...p.sproj];
    for (const t of occs) namesIn(t, labelsAt, constAt);
  }
  const labels = [...labelsAt.entries()].sort((x, y) => cmp(x[0], y[0])).map(([, t]) => t);
  const consts = [...constAt.entries()].sort((x, y) => cmp(x[0], y[0])).map(([, t]) => t);
  if (labels.length === 0) return no;
  const n = countRegions(labels.length, consts.length);
  if (n > LABEL_REGIONS) return { k: 'capped', n };
  const regs = regionList(labels.length, consts);
  const vs: bigint[] = [];
  for (const rg of regs) {
    const v = regionValue(op === 'count', labels, rg, gkey, projs, vals, mine);
    if (v === null) return no;
    vs.push(v);
  }
  if (vs.every((v) => v === vs[0])) return { k: 'decided', v: vs[0], by: labels.map((l) => `_[${labelText(l)}]`).join(', ') };
  return { k: 'cond', t: byNode(labels, regs, vs, consts, 0, regs.map((_, i) => i)) };
}

/** The member count or total of the group an unknown makes, where every possible that could make a group no sealed
 *  group names exists in every completion and has its projection known: the members of this label's own, and those of
 *  each other label that is this one's value too, a table over those labels (`new_group_value`, Rust). */
export function newGroupValue(op: string, params: number, ps: Poss[], pat: (Term | null)[], labs: (Term | null)[]): Term | null {
  if ((op !== 'count' && op !== 'sum') || params !== 0 || pat.filter((t) => t === null).length !== 1) return null;
  const at = pat.findIndex((t) => t === null);
  const own = labs[at] === null ? null : unkParts(labs[at]!);
  if (own === null) return null;
  const patKey = pat.map((t) => (t === null ? '?' : canonTerm(t))).join('\u0001');
  const ownProjs: Term[][] = [];
  const others = new Map<string, { label: Term; projs: Term[][] }>();
  const has = (xs: Term[][], p: Term[]): boolean => xs.some((x) => x.map(canonTerm).join('\u0001') === p.map(canonTerm).join('\u0001'));
  for (const p of ps) {
    if (p.pat.every((t) => t !== null)) continue;
    const occ = p.lab[at];
    if (occ === null) return null;
    const ou = unkParts(occ.t);
    if (ou === null) return null;
    if (p.pat.map((t) => (t === null ? '?' : canonTerm(t))).join('\u0001') !== patKey || !p.sure || p.neg) return null;
    if (p.proj === null) return null;
    let into: Term[][];
    if (canonTerm(ou.label) === canonTerm(own.label)) into = ownProjs;
    else {
      const k = key(ou.label);
      if (!others.has(k)) others.set(k, { label: ou.label, projs: [] });
      into = others.get(k)!.projs;
    }
    if (!has(into, p.proj)) into.push(p.proj);
  }
  if (ownProjs.length === 0 || others.size > 6) return null;
  const sorted = [...others.entries()].sort((x, y) => cmp(x[0], y[0])).map(([, v]) => v);
  const node = (j: number, acc: Term[][]): Term | null => {
    if (j === sorted.length) {
      let total = 0n;
      if (op === 'count') total = BigInt(acc.length);
      else for (const p of acc) { const v = asInt(p[0]); if (v === null) return null; total += v; }
      return inRange(total) ? mki(total) : null;
    }
    const without = node(j + 1, acc);
    if (without === null) return null;
    const withP = [...acc];
    for (const p of sorted[j].projs) if (!has(withP, p)) withP.push(p);
    const w = node(j + 1, withP);
    if (w === null) return null;
    if (canonTerm(w) === canonTerm(without)) return without;
    return mkBy(sorted[j].label, without, [[own.label, w]], true);
  };
  return node(0, ownProjs);
}
