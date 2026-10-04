// labeled.ts — LABELED UNKNOWNS (docs/aggregates.md, "Labeled unknowns"), the TypeScript twin of
// rust/rofl/src/engine/labeled.rs: what a fault leaves unknown has a name and a condition, and a group whose members
// rest on such names alone is decided by what each value the names could be gives it.
//
// A label is one unknown value; the values it can be told apart by are the constants the terms around it mention, and
// one class for all the rest, two labels sharing a class or not (a REGION is one assignment of every label to a
// constant or a class). A group's member count or total is folded over its known members and the possibles present in
// each region; the same in every region and it is the group's value, otherwise the value of the one label, region by
// region, is a `$by`. More regions than `LABEL_REGIONS` and the group is not decided.

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

export type Regions = { k: 'no' } | { k: 'decided'; v: bigint } | { k: 'cond'; t: Term } | { k: 'capped'; n: number };

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
    const r = rg[at];
    if ('c' in r) return b.cases.find(([k]) => canonTerm(k) === canonTerm(r.c))?.[1] ?? b.dflt;
    return b.dflt;
  }
  return t;
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
    for (const t of occs) {
      const u = unkParts(t);
      const b = u === null ? byParts(t) : null;
      if (u !== null) { labelsAt.set(key(u.label), u.label); for (const c of u.ex) constAt.set(key(c), c); }
      else if (b !== null) { labelsAt.set(key(b.label), b.label); for (const [c] of b.cases) constAt.set(key(c), c); }
    }
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
  if (vs.every((v) => v === vs[0])) return { k: 'decided', v: vs[0] };
  if (labels.length !== 1) return no;
  const d = vs[vs.length - 1];
  const cases: [Term, Term][] = [];
  regs.forEach((r, i) => { const x = r[0]; if ('c' in x && vs[i] !== d) cases.push([x.c, mki(vs[i])]); });
  return { k: 'cond', t: mkBy(labels[0], mki(d), cases, true) };
}

/** The member count or total of the group an unknown makes, where every possible that could make a group no sealed
 *  group names is this one's and exists in every completion, with its projection known (`new_group_value`, Rust). */
export function newGroupValue(op: string, params: number, ps: Poss[], pat: (Term | null)[], labs: (Term | null)[]): Term | null {
  if ((op !== 'count' && op !== 'sum') || params !== 0 || pat.filter((t) => t === null).length !== 1) return null;
  const at = pat.findIndex((t) => t === null);
  const own = labs[at] === null ? null : unkParts(labs[at]!);
  if (own === null) return null;
  const patKey = pat.map((t) => (t === null ? '?' : canonTerm(t))).join('\u0001');
  const seen = new Set<string>();
  let total = 0n;
  for (const p of ps) {
    if (p.pat.every((t) => t !== null)) continue;
    const occ = p.lab[at];
    if (occ === null) return null;
    const ou = unkParts(occ.t);
    if (p.pat.map((t) => (t === null ? '?' : canonTerm(t))).join('\u0001') !== patKey || !p.sure || p.neg || ou === null || canonTerm(ou.label) !== canonTerm(own.label)) return null;
    if (p.proj === null) return null;
    const k = p.proj.map(canonTerm).join('\u0001');
    if (!seen.has(k)) {
      if (op === 'count') total += 1n; else { const v = asInt(p.proj[0]); if (v === null) return null; total += v; }
      seen.add(k);
    }
  }
  return seen.size > 0 && inRange(total) ? mki(total) : null;
}
