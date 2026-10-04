// aggeval.ts — THE EVALUATOR OF A PROGRAM WITH AGGREGATES (docs/aggregates.md,
// "The TypeScript engine, as built"): the body aggregates and their empty
// group, the order and join lattices with their widening, the threshold, the
// holistic aggregates, the semiring tags and subsumption, with their holes,
// shrugs, ticks and walls.
//
// It is rust/rofl/src/engine.rs, function for function, so that the two
// engines agree byte for byte on every aggregate proof world: the goldens pin
// one hash per world and both must reach it. `Rofl` runs it for a store that
// declares a lattice, a tag or a dominance rule, or reflects a rule with an
// aggregate or a join read (`storeHasAggregates`); every other program is run
// as a plain one (`plain`): planned with the cross-product hold and explained as
// the plain explainer always has, as the Rust engine does (`Eval::plain`).
//
// WHERE THE TWO DIFFER IN SHAPE AND NOT IN ANSWER: a fact's identity is its
// key string here and a `FactId` there, and wherever the Rust engine orders by
// `FactId` for determinism this orders by the key, which is the order the
// canonical state prints; a cell is named by its `$cell(...)` key text, which
// is unique per (rule, position, tick, key).

import {
  type Term, type Subst, type Lit, type BodyElem, type Clause, mka, mkf, mki, mks, mkv, canonTerm, canonVars,
  resolve, unify, unifyAll, walk, isGround, varsOf, elemVars, aggInnerVars, evalArith,
  type ArithFail, ARITH_UNBOUND, ARITH_TYPE, ARITH_ZERO, ARITH_OVERFLOW, TERM_MIN, TERM_MAX, type Int,
  DS_ANY_NAME,
} from './unify.ts';
import {
  type AggOp, type Val, type Sorted, Refused, IvFailed, TagFailed, opFromName, opClass, isJoin,
  dedupByProjection, opParams, opIdentity, lift, insert, finish, lower, holisticSorted, sortedOf, joinCanon, join,
  joinLeq, joinCarrierOf, setElems, setContains, ivBounds, mkIv, ivApply, type IvFn, IV_FNS, widenIv, narrowIv, NINF, PINF,
  tagFromTimesName, tagTimes, tagIdempotent, latAlg, quorum, AGG_OVERFLOW,
  type KeyAtom, rankCmp, keyDir, keyAtoms, sortedOfKeys, rankOf,
} from './cell.ts';
import { type Tags, readTags, tagsAsLattices, lowerTags, declRows } from './tag.ts';
import { Store, type FactStore, type FactRec, type PremRef, type Witness, type LatReg, type CellRec, type CellMember, factKey, premText,
  cellKeyText, cellValueText, sameKeys } from './store.ts';
import { parseLiteral } from './parser.ts';
import { litsOf, canonLitSets, canonSets as canonSetsT, UNKNOWN_VALUE, holdsUnknown, bindUnknown, unifyUnknown, unkParts, mkUnk, mkList, isLabeled, sameLabel } from './unify.ts';
import { regionDecide, newGroupValue, sureArgs, unsure, isUnsure, desure, LABEL_REGIONS } from './labeled.ts';
import {
  V, IFACE, ARITY, RESERVED, decodeRules, type DRule, factTerm, canonClause, encodeRule,
  sealedBodies, SEALED_PROVENANCE, KERNEL_PERSP, MAIN, isKernelLedger, atomTerm, list, unlist,
  wellFoundedDeclared, reifyTerm, reifyBodyElem, decodeDominances, type DomRule, evalStrOp, BUDGET_REASON, resolveBook,
  SPACE_REASON, RULE_HOLE, STR_TYPE, STR_INDEX, STR_SEP, ATOM_NAME, unAtomTerm,
} from './reflect.ts';
import { reasonOf, reasonText, causeText, shown } from './shrug.ts';
import { tarjan } from './scc.ts';
import { policyStore, planReuse, noReuse, reusedRec, digest53, type ReusePlan } from './reuse.ts';
import { SAFETY_DENSE } from './kernel-dense.ts';

// ---------------------------------------------------------------- halting

/** A wall, `budget_exhausted` or `space_exhausted`, and the rule holding the
 *  rows when the space wall was reached. */
export class Wall extends Error {
  reason: string; rule: string | null;
  constructor(reason: string, rule: string | null = null) { super(reason); this.reason = reason; this.rule = rule; }
}
/** A program rejected: the message, and a demonstration. */
export class Rejected extends Error {
  demo: string;
  constructor(msg: string, demo = '') { super(msg); this.demo = demo; }
}
/** A defect of this engine: never an answer. */
export class Bug extends Error {}
/** A descending pass has gathered what it came for (`narrowDescend`). */
export class Narrowed extends Error {}
/** the most descending passes narrowing makes after a widening */
const NARROW_PASSES = 4;

const MAX_DEPTH = 512;
const MAX_ALTERNATIONS = 256;
export const DEFAULT_SPACE = 500_000;
const POLICY_BUDGET = 20_000_000;

// ------------------------------------------------------------------ codes

export const CODE = {
  unbound: ARITH_UNBOUND, type: ARITH_TYPE, zero: ARITH_ZERO, strType: STR_TYPE, strIndex: STR_INDEX, strSep: STR_SEP,
  atomName: ATOM_NAME, overflow: ARITH_OVERFLOW, setType: 8, unbounded: 9, tagCarrier: 10,
} as const;

export function holeReasonOfCode(code: number): string {
  switch (code) {
    case CODE.zero: return 'arith_zero_divisor';
    case CODE.strType: return 'str_type_error';
    case CODE.strIndex: return 'str_index_error';
    case CODE.strSep: return 'str_empty_separator';
    case CODE.atomName: return 'atom_unwritable';
    case CODE.overflow: return 'arith_overflow';
    case CODE.setType: return 'set_type_error';
    case CODE.unbounded: return 'unbounded_members';
    case CODE.tagCarrier: return 'tag_off_carrier';
    default: return 'arith_type_error';
  }
}

// ------------------------------------------------------------------ types

type AggElem = BodyElem & { t: 'agg' };

/** A rank over a tuple, `rank(S1, S2 ; K1, desc(K2) : body)`: the subject is every value before the `;`, the members the keys. */
const rankTuple = (a: AggElem): boolean => a.op === 'rank' && a.keys.length > 0;
const aggParams = (a: AggElem): number => (rankTuple(a) ? a.vals.length : opParams(a.op as AggOp));
/** A rank's resolved projection with the `asc(..)` and `desc(..)` the source wrote taken off. */
const plainKeys = (a: AggElem, proj: Term[]): Term[] => {
  if (!rankTuple(a)) return proj;
  const at = proj.length - a.keys.length;
  return proj.map((t, i) => (i >= at && keyDir(a.keys[i - at])[1] && t.k === 'f' ? t.args[0] : t));
};
/** A rank over a tuple's directions and subject, or the fault reading it was. */
interface RankKey { desc: boolean[]; subject: KeyAtom[] | string }
const atomsOr = (ts: Term[]): KeyAtom[] | string => { try { return keyAtoms(ts); } catch (e) { if (!(e instanceof Refused)) throw e; return e.reason; } };

export interface ERule {
  id: string; clause: Clause; canon: string; safe: boolean; hasNeg: boolean;
  /** An aggregate in the body: stratified like a negation, fired once what it reads is closed. */
  hasAgg: boolean;
  /** A threshold in the body: monotone; its inner positive relations are triggers. */
  hasThr: boolean; thrRels: string[];
  /** The lattice relations it reads from outside their recursion: strict edges. */
  latticeOuter: string[];
  /** The lattice whose close decides this rule's faults. */
  latClose: string | null;
  posRels: string[]; hasDemandPrem: boolean;
  /** A demand premise unfolds into a rule that negates, aggregates or reads a lattice from outside: stratified like one. */
  demandStrict: boolean;
  triggerRels: string[]; plan: BodyElem[];
}

/** The round's delta: fact keys, and the same keys by relation. */
export interface Front { keys: Set<string>; byRel: Map<string, Set<string>> }
const newFront = (): Front => ({ keys: new Set(), byRel: new Map() });
function noteFront(f: Front, rel: string, id: string): void {
  f.keys.add(id);
  let s = f.byRel.get(rel);
  if (!s) { s = new Set(); f.byRel.set(rel, s); }
  s.add(id);
}
function mergeFront(into: Front, from: Front): void {
  for (const [rel, ks] of from.byRel) {
    let e = into.byRel.get(rel);
    if (!e) { e = new Set(); into.byRel.set(rel, e); }
    for (const k of ks) e.add(k);
  }
  for (const k of from.keys) into.keys.add(k);
}

interface Sol { s: Subst; prems: PremRef[] }

/** A lattice cell: relation, book, key (the head prefix). `id` names it. */
export interface LatKey { rel: string; persp: string; key: Term[]; id: string }
export const latKey = (rel: string, persp: string, key: Term[]): LatKey =>
  ({ rel, persp, key, id: `${rel}[${persp}](${key.map(canonTerm).join(',')})` });

/** What a hole leaves unknown: a cell's value, every tuple of a relation, or a tuple. */
export type Unknown =
  | { k: 'cell'; ck: LatKey; id: string }
  | { k: 'rel'; rel: string; id: string }
  | { k: 'tuple'; rel: string; persp: string; args: Term[]; id: string };
export const uCell = (ck: LatKey): Unknown => ({ k: 'cell', ck, id: 'c|' + ck.id });
export const uRel = (rel: string): Unknown => ({ k: 'rel', rel, id: 'r|' + rel });
export const uTuple = (rel: string, persp: string, args: Term[]): Unknown =>
  ({ k: 'tuple', rel, persp, args, id: 't|' + factKey(rel, persp, args) });
export const uRelOf = (u: Unknown): string => (u.k === 'cell' ? u.ck.rel : u.rel);

/** WHERE A SHRUG COMES FROM: an unknown, or the target of a hole row. */
type Node = { k: 'unk'; u: Unknown; id: string } | { k: 'hole'; t: Term; id: string };
/** One step of `why`'s walk (`renderTree`): a fact or a premise to render at an indent, a line written, or a fact
 *  leaving the path it is on. */
type WhyTask = { t: 'fact'; id: string; indent: number } | { t: 'prem'; pr: PremRef; indent: number }
  | { t: 'past'; pr: PremRef; at: number; indent: number } | { t: 'line'; line: string } | { t: 'unsee'; id: string };
const line = (l: string): WhyTask => ({ t: 'line', line: l });
const nUnk = (u: Unknown): Node => ({ k: 'unk', u, id: 'u:' + u.id });
const nHole = (t: Term): Node => ({ k: 'hole', t, id: 'h:' + canonTerm(t) });

/** A builtin that failed for an error in a rule a lattice decides, held until that lattice closes. */
interface LatFault { close: string; what: Unknown | null; rule: string | null; reason: string; facts: string[] }

/** What one dominance question answered. */
type DomV = { k: 'no' } | { k: 'yes'; rule: string } | { k: 'fault'; rule: string; reason: string } | { k: 'unknown'; u: Unknown; rule: string };

/** A SOLUTION A BODY AGGREGATE'S INNER BODY MIGHT HAVE over the unknown `u`: its group (`null` where left open), its
 *  projection (`null` where not known), and whether it passes an undecided negation. */
interface Possible { pat: (Term | null)[]; lab: ({ t: Term; ex: Term[] } | null)[]; proj: Term[] | null; sproj: Term[]; sure: boolean; neg: boolean; u: Unknown }

/** A group a labeled unknown leaves open in one position alone: the conclusion for a group no sealed group names is
 *  that unknown, not one that matches every group. */
const labeledOpen = (p: Possible): boolean => p.pat.filter((t) => t === null).length === 1 && p.pat.some((t, i) => t === null && p.lab[i] !== null);

/** A possible's group pattern as a key. */
const patKey = (pat: (Term | null)[]): string => pat.map((t) => (t === null ? '?' : canonTerm(t))).join('\u0001');

/** THE POSSIBLES BY GROUP (`PossIndex`, Rust): those whose group is known, by it, and those a position of which is
 *  open, which any group may hold. `at` is a group's own, in the order they were found. */
class PossIndex {
  private exact = new Map<string, number[]>();
  private open: number[] = [];
  private ps: Possible[];
  constructor(ps: Possible[]) {
    this.ps = ps;
    ps.forEach((p, n) => {
      if (p.pat.some((t) => t === null)) { this.open.push(n); return; }
      const k = patKey(p.pat);
      const xs = this.exact.get(k);
      if (xs === undefined) this.exact.set(k, [n]); else xs.push(n);
    });
  }
  exactAt(g: Term[]): number[] { return this.exact.get(patKey(g)) ?? []; }
  at(g: Term[]): Possible[] {
    const gk = g.map(canonTerm);
    const ns = [...this.exactAt(g), ...this.open.filter((n) => this.ps[n].pat.every((t, m) => t === null ? !(this.ps[n].lab[m]?.ex.some((x) => canonTerm(x) === gk[m])) : canonTerm(t) === gk[m]))];
    ns.sort((a, b) => a - b);
    return ns.map((n) => this.ps[n]);
  }
}

/** WHAT A BODY AGGREGATE LEFT UNDECIDED under one correlation, decided once (`reachMemoOf`) and read by every firing
 *  (`aggReachUndecided`): the possibles, each sealed group they change (its key terms) with the unknowns it rests on,
 *  and each group pattern a possible no sealed group names could make, with the unknowns that could make it. */
interface ReachMemo { ps: Possible[]; groups: [Term[], Unknown[], Term | null][]; unnamed: [(Term | null)[], (Term | null)[], Unknown[], Term | null][] }

/** A holistic group sealed once and shared. */
type HolShared = { k: 'open'; reason: string } | { k: 'groups'; groups: [Term[], string, Sorted | string][] };

interface Assumption { recs: Map<string, FactRec>; byRel: Map<string, FactRec[]> }

interface RuleAnswer {
  unsafeRules: Set<string>; demandRels: string[]; trigger: Map<string, string[]>; late: Set<string>;
  readsProvenance: boolean; aggRefused: [string, string][]; emptyZero: Set<string>; readsMembers: boolean;
  latticeRefused: [string, string][]; latticeOuter: Map<string, string[]>; readsLatticeMembers: boolean;
  readsDominated: boolean;
}
/** What safety.rofl said of a program, by a digest of everything it was asked (`safetyAnswer`). */
const safetyMemo = new Map<string, RuleAnswer>();
const SAFETY_MEMO_CAP = 64;
const emptyAnswer = (): RuleAnswer => ({
  unsafeRules: new Set(), demandRels: [], trigger: new Map(), late: new Set(), readsProvenance: false, aggRefused: [],
  emptyZero: new Set(), readsMembers: false, latticeRefused: [], latticeOuter: new Map(), readsLatticeMembers: false,
  readsDominated: false,
});

/** An aggregate element, planned once per rule: indices, not names. */
export interface AggPlan { op: AggOp; innerOrder: number[]; corr: number[]; group: number[]; rels: string[]; emptyZero: boolean }

/** A subsumptive relation: its key length and dominance rules, each planned with the two facts bound. */
export interface Sub { arity: number; keylen: number; doms: [DomRule, BodyElem[]][]; reads: string[] }

export interface StagedFact { rel: string; persp: string; args: Term[]; rule: string; prems: PremRef[] }
export interface TickOutcome { advanced: boolean; quiescent: boolean; partial: boolean }
export interface Outcome { partial: boolean; staged: number }

/** A component of relations taken by data: the relations, the round they are ranked in, and the aggregate elements
 *  `[rule, at]` whose correlations are released by layer. */
interface DsComp { rels: Set<string>; round: number; elems: [string, number][] }
/** A node of the data walk: a pattern over a relation of the component (`null` where nothing bound a position), or a
 *  correlation of one aggregate element. */
type DsNode = { k: 'p'; rel: string; args: (Term | null)[] } | { k: 'a'; rid: string; at: number; corr: Term[] };
/** A correlation the walk cannot key: a premise of the component binds it. */
class DsUnkeyed extends Error {
  rid: string;
  at: number;
  constructor(rid: string, at: number) { super('unkeyed'); this.rid = rid; this.at = at; }
}
/** One member of a threshold: a distinct projection tuple and every derivation of it. */
interface ThrMember { proj: Term[]; text: string; derivs: [string, PremRef[]][] }
/** One solution of an aggregate's inner body. */
interface Cand { proj: Term[]; prems: PremRef[]; sig: string }
interface ThrFocus { news: [number, Set<string>][]; byCorr: Map<string, (Term[] | null)[]>; wild: boolean }
interface ThrAcc { round: number; members: Map<string, ThrMember> }
type Sealed = { k: 'kept'; cells: string[] } | { k: 'ephemeral'; cells: [Term[], CellValue, number][] } | { k: 'open'; reason: string };

// -------------------------------------------------------------------- cells

export type CellValue = { k: 'value'; t: Term } | { k: 'empty' } | { k: 'hole'; reason: string };

export function aggRefusalText(reason: string, rel: string | null): string {
  switch (reason) {
    case 'sum_needs_key': return 'sum needs its projection key: sum(V ; K : body); without K two equal contributions would be one';
    case 'key_on_count': return 'count takes no key: the counted terms are the key, count(K1, K2 : body)';
    case 'key_on_idempotent': return 'min, max, or and and take no key: equal values merge anyway';
    case 'one_value': return 'this aggregate takes exactly one value';
    case 'count_needs_a_term': return 'count needs the terms it counts';
    case 'member_unbound': return "the aggregate's body does not bind every term it counts, sums or groups by";
    case 'unsafe': return 'the rule is not range-restricted, so its aggregate would be unfolded at a call site before its input is closed';
    case 'reads_live_kernel': return `an aggregate cannot read ${rel ?? 'that relation'}: the kernel writes it while the evaluation runs, so no round closes it`;
    case 'demand_head': return 'its aggregate would be unfolded at a call site (the rule concludes a demand-backed relation)';
    case 'key_on_threshold': return 'at_least takes no key: the counted terms are the key, at_least(N, K1, K2 : body)';
    case 'threshold_needs_a_term': return 'at_least needs the terms it counts';
    case 'holistic_needs_key': return 'median and quantile need their projection key: median(V ; K : body), quantile(P, V ; K : body); without K two equal values would be one member';
    case 'param_and_value': return 'quantile and rank take two terms before their body: quantile(P, V ; K : body), rank(S, V : body)';
    case 'rank_key_arity': return 'a rank over a tuple takes a key for every subject: rank(S1, S2 ; K1, desc(K2) : body)';
    case 'threshold_lattice': return 'a threshold may count only what no open lattice can still supersede or withdraw: it neither reads a lattice (or what rests on one) before that lattice closes, nor concludes one, nor sits inside one\'s recursion; read the lattice through a rule of its own, above it';
    case 'lattice_arity': return "it writes a lattice relation at an arity other than its declaration's";
    case 'lattice_two_algebras': return 'its head is a lattice of one operation and its value a body aggregate of another: a relation has one algebra';
    case 'lattice_negated': return "it negates a lattice relation inside that relation's recursion: a non-monotone read comes only from a higher stratum";
    case 'set_pattern': return `${setPatternReason('the value of its head')}; this head's relation is no join lattice`;
    case 'join_value_off_carrier': return "it reads a join lattice with a value no value of its carrier can match, so the literal could never hold: a union's value is `set(E, ...)`, a hull's `iv(Lo, Hi)` with Lo <= Hi, a bitor's an integer of [0, 2^60); the slot takes a variable, such a value, `set(T)` or `iv(A, B)` of variables and integers (`ninf` a low end, `inf` a high one)";
    case 'lattice_unwidened': return "it computes a hull's value from that hull's own value by an interval function (ivadd, ivsub, ivmul, ivmeet) inside its recursion, and no relation on that cycle declares a widening, so nothing bounds how often the value can grow: declare one, `lattice p(K, hull I) widen N.`";
    case 'order_nonmonotone': return "it reads a relation with a declared order inside its recursion, or concludes one, and is not monotone in that order: a value of an ordered relation may flow only into a value of a head that improves the same way (directly, or through X is V + E, V - E, E - V, min(V, E), max(V, E)) and into a comparison that stays true as the value improves (V < N for min, V > N for max); under pareto each value moves on its own, and under lex only the first value, strictly (+, - or a copy), may be compared, and each later value goes only into the value at its own place of a lex head whose first value is computed from the first one read";
    case 'lattice_nonmonotone': return "it reads a lattice relation inside its recursion and is not monotone in the value: the value may flow only into a lattice head's value (directly, or through X is V + E, V - E, E - V, min(V, E), max(V, E)) in the direction that head improves, or into a comparison that stays true as the value improves (D < N for min, D > N for max, B = true for or, B = false for and); a join's value (union, hull, bitor) only into a head of the same join or as S in `E in S` and `A subset S`, and a hull's through an interval function, X is ivadd(V, E), ivsub(V, E), ivsub(E, V), ivmul(V, K), ivmeet(V, E)";
    case 'tag_weight_reads_tag': return 'its head\'s tag is its weight, and the weight reads a tag of the body the engine multiplies in (⊗ through the body), so that tag would count twice: leave the head\'s tag a variable the body does not bind, and the engine writes the ⊗ of the body\'s tags (docs/aggregates.md, "Tags, as built")';
    case 'tag_arity': return "it writes or reads a tagged relation at an arity other than its declaration's";
    default: return `safety.rofl refused it (${reason})`;
  }
}

/** The refusal of a set written with a variable, in both engines' words. */
export function setPatternReason(set: string): string {
  return `${set} is a set written with a variable, so which spelling it has depends on what the variable is bound to, and it would match or be stored only in the order it is written: a set with a variable stands only as a join lattice's value in a head, as either side of \`subset\` and as the right of \`in\`; elsewhere name the set with a variable and read its members with \`in\``;
}

// --------------------------------------------------------------- planning

const tVars = (t: Term): string[] => [...varsOf(t)];

/** An aggregate's result and shared variables, or any other element's variables. */
function planVars(b: BodyElem): string[] {
  if (b.t === 'agg') {
    const vs = varsOf(b.res);
    for (const v of b.shared ?? []) vs.add(v);
    return [...vs];
  }
  return [...elemVars(b)];
}

/** THE PLANNER, over any body: a rule's, or an aggregate's inner one. Positive
 *  premises, builtins and aggregates keep their written place; a negation is
 *  held back until every variable it shares with the rest is bound. Returns
 *  the order, the first negation that never became ready, whether `mustBind`
 *  is ground under the plan, and what was bound. */
export function planOrder(mustBind: Term[], body: BodyElem[], preBound: string[], outside: string[], hold = false):
  { order: number[]; stuck: number | null; ground: boolean; bound: string[] } {
  const seenIn = new Map<string, number[]>();
  const note = (vs: string[], where: number) => {
    for (const v of vs) {
      let e = seenIn.get(v);
      if (!e) { e = []; seenIn.set(v, e); }
      if (!e.includes(where)) e.push(where);
    }
  };
  note(outside, -1);
  body.forEach((b, i) => note(planVars(b), i));
  const bound: string[] = [...preBound];
  const groundIn = (t: Term) => tVars(t).every((v) => bound.includes(v));
  const bindAll = (t: Term) => { for (const v of tVars(t)) if (!bound.includes(v)) bound.push(v); };
  const negReady = (l: Lit, i: number) => {
    const vs = new Set<string>();
    for (const a of l.args) varsOf(a, vs);
    varsOf(l.persp, vs);
    return [...vs].every((v) => bound.includes(v) || (() => { const s = seenIn.get(v)!; return s.length === 1 && s[0] === i; })());
  };
  const plan: number[] = [];
  const pending: number[] = [];
  const flush = () => {
    for (;;) {
      const at = pending.findIndex((j) => { const x = body[j]; return x.t === 'neg' && negReady(x.lit, j); });
      if (at < 0) break;
      plan.push(pending[at]);
      pending.splice(at, 1);
    }
  };
  // WITH `hold`, ONE POSITIVE MOVES: a literal sharing no variable with what is bound is a cross product where it stands,
  // and waits for something that binds one of its variables. A negation or a builtin is the barrier: what is held goes
  // in ahead of it in written order. A program with no aggregate is planned so (`AggEval.plain`).
  const held: number[] = [];
  const shares = (i: number): boolean => {
    const b = body[i];
    return b.t !== 'pos' || [...b.lit.args, b.lit.persp].some((t) => tVars(t).some((v) => bound.includes(v)));
  };
  const takePos = (i: number) => {
    const b = body[i] as BodyElem & { t: 'pos' };
    for (const a of b.lit.args) bindAll(a);
    bindAll(b.lit.persp);
    plan.push(i);
    flush();
  };
  body.forEach((b, i) => {
    if (b.t === 'pos') {
      if (hold && bound.length > 0 && !shares(i)) { held.push(i); return; }
      takePos(i);
      for (let at = held.findIndex(shares); at >= 0; at = held.findIndex(shares)) takePos(held.splice(at, 1)[0]);
      return;
    }
    while (held.length > 0) takePos(held.shift()!);
    if (b.t === 'neg') pending.push(i);
    else if (b.t === 'bi') {
      if (b.op === '=') { if (groundIn(b.l)) bindAll(b.r); else if (groundIn(b.r)) bindAll(b.l); }
      else if ((b.op === 'is' || b.op === 'in') && groundIn(b.r)) bindAll(b.l);
      plan.push(i);
    } else {
      bindAll(b.res);
      for (const v of b.shared ?? []) if (!bound.includes(v)) bound.push(v);
      plan.push(i);
    }
    flush();
  });
  while (held.length > 0) takePos(held.shift()!);
  return { order: plan, stuck: pending.length > 0 ? pending[0] : null, ground: mustBind.every(groundIn), bound };
}

export function planElems(mustBind: Term[], body: BodyElem[], preBound: string[], outside: string[], hold = false):
  { plan: BodyElem[]; stuck: number | null; ground: boolean; bound: string[] } {
  const r = planOrder(mustBind, body, preBound, outside, hold);
  return { plan: r.order.map((i) => body[i]), stuck: r.stuck, ground: r.ground, bound: r.bound };
}

export function planBodyAgg(c: Clause, hold = false): { plan: BodyElem[]; stuck: number | null; ground: boolean; bound: string[] } {
  const must = [...c.head.args, c.head.persp];
  const outside: string[] = [];
  for (const t of must) for (const v of varsOf(t)) if (!outside.includes(v)) outside.push(v);
  return planElems(must, c.body, [], outside, hold);
}

/** A RULE WHOSE FAULTS A LATTICE DECIDES runs each builtin that can fail after
 *  every premise it does not feed. */
export function sinkBuiltins(plan: BodyElem[]): BodyElem[] {
  const seen: string[] = [];
  let held: [BodyElem, string[], string[]][] = [];
  const out: BodyElem[] = [];
  for (const b of plan) {
    const vs = planVars(b);
    if (b.t === 'bi' && b.op !== '=' && b.op !== '!=') {
      const outs = vs.filter((x) => !seen.includes(x));
      seen.push(...outs);
      held.push([b, outs, vs]);
      continue;
    }
    const need = held.map(() => b.t === 'agg');
    const want = [...vs];
    for (;;) {
      let grew = false;
      held.forEach(([, outs, hv], i) => {
        if (!need[i] && outs.some((x) => want.includes(x))) { need[i] = true; want.push(...hv); grew = true; }
      });
      if (!grew) break;
    }
    const keep: [BodyElem, string[], string[]][] = [];
    held.forEach((x, i) => { if (need[i]) out.push(x[0]); else keep.push(x); });
    held = keep;
    for (const x of vs) if (!seen.includes(x)) seen.push(x);
    out.push(b);
  }
  for (const x of held) out.push(x[0]);
  return out;
}

export interface Peel {
  round: Map<string, number>; rounds: number; stalled: boolean; stuck: string[]; aggEdges: [string, string, string][];
  /** What each relation reads, positively and strictly; the strict edges a body aggregate wrote (`soft`), as
   *  `head\u0001read`; and `[rule, at]` of every element whose edge `demote` made positive. */
  pos: Map<string, Set<string>>; neg: Map<string, Set<string>>; soft: Set<string>; demoted: [string, number][];
  /** Per round, the relations that settled in it. */
  layers: string[][];
  /** The one-hop relation dependency graph the peel was taken over, keyed on the head. */
  deps: { pos: Map<string, Set<string>>; neg: Map<string, Set<string>> };
}

/** What a peel reads of a rule. */
export type PeelRule = Pick<ERule, 'id' | 'clause' | 'latticeOuter'>;

/** THE SCHEDULE of decoded rules, for every caller that asks which round a relation settles in or whether a program
 *  stratifies: the evaluator's own peel, with the aggregate edges and the lattices of the rules it is given. */
export function schedule(rules: { id: string; clause: Clause }[]): Peel {
  return peelRounds(rules.map((r) => ({ id: r.id, clause: r.clause, latticeOuter: [] })), [], []);
}

/** `dep`'s transitive closure: `reachable(peel).get(A)` holds every relation A depends on, at any number of hops. */
export function reachable(peel: Peel): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const oneHop = (rel: string): string[] => [...(peel.deps.pos.get(rel) ?? []), ...(peel.deps.neg.get(rel) ?? [])];
  for (const rel of peel.round.keys()) {
    const seen = new Set<string>();
    const stack = oneHop(rel);
    while (stack.length > 0) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...oneHop(x));
    }
    out.set(rel, seen);
  }
  return out;
}

const edgeKey = (a: string, b: string): string => `${a}\u0001${b}`;

/** `peel_rounds`: the round number IS the stratum number, and a stall is the
 *  rejection. An aggregate's edge is a negation's; a lattice read from outside
 *  its recursion is strict; what the kernel writes at a close sits above. `demote` holds the `head\u0001inner` pairs whose
 *  aggregate edge is positive instead: a component a data-level stratification takes (`dataDemotable`). */
export function peelRounds(rules: PeelRule[], lattices: string[], domEdges: [string, string][], demote: Set<string> = new Set()): Peel {
  const pos = new Map<string, Set<string>>(), neg = new Map<string, Set<string>>();
  const heads = new Set<string>();
  const aggEdges: [string, string, string][] = [];
  const soft = new Set<string>();
  const demoted: [string, number][] = [];
  const P = (h: string) => { let s = pos.get(h); if (!s) { s = new Set(); pos.set(h, s); } return s; };
  const N = (h: string) => { let s = neg.get(h); if (!s) { s = new Set(); neg.set(h, s); } return s; };
  const reflected = [V.agg_cell, V.agg_member, V.agg_member_prem, V.agg_sealed, V.hole];
  for (const r of rules) {
    if (r.clause.head.temporal === 'next') continue;
    const hrel = r.clause.head.rel;
    heads.add(hrel); P(hrel); N(hrel);
    for (const b of r.clause.body) {
      if (b.t === 'pos' && r.latticeOuter.includes(b.lit.rel)) N(hrel).add(b.lit.rel);
      else if (b.t === 'pos') P(hrel).add(b.lit.rel);
      else if (b.t === 'neg') N(hrel).add(b.lit.rel);
      else if (b.t === 'agg' && b.op === 'at_least') {
        for (const x of b.body) {
          if (x.t === 'pos') P(hrel).add(x.lit.rel);
          else if (x.t === 'neg') N(hrel).add(x.lit.rel);
        }
        for (const h of reflected) { heads.add(h); P(h); N(h).add(hrel); }
      } else if (b.t === 'agg') {
        for (const l of litsOf(b)) {
          for (const h of [hrel, ...reflected]) {
            heads.add(h); P(h);
            if (h === hrel && demote.has(edgeKey(hrel, l.rel))) {
              P(h).add(l.rel);
              if (!demoted.some((d) => d[0] === r.id && d[1] === b.at)) demoted.push([r.id, b.at!]);
              continue;
            }
            N(h).add(l.rel);
            if (h === hrel) soft.add(edgeKey(h, l.rel));
          }
          aggEdges.push([r.id, hrel, l.rel]);
        }
      }
    }
  }
  for (const [p, b] of domEdges) { heads.add(p); P(p); N(p).add(b); }
  if (lattices.length > 0) {
    for (const m of [V.lattice_member, V.lattice_member_prem, V.hole, V.dominated_by]) {
      heads.add(m); P(m); for (const l of lattices) N(m).add(l);
    }
    const reads = (h: string): string[] => [...(pos.get(h) ?? []), ...(neg.get(h) ?? [])];
    const grow = (seed: Set<string>, from: (h: string, set: Set<string>) => boolean): Set<string> => {
      const set = new Set(seed);
      for (;;) {
        const more = [...heads].filter((h) => !set.has(h) && from(h, set));
        if (more.length === 0) return set;
        for (const m of more) set.add(m);
      }
    };
    const holeReaders = grow(new Set([V.hole]), (h, set) => reads(h).some((x) => set.has(x)));
    const reached = grow(new Set(lattices), (h, set) => !holeReaders.has(h) && reads(h).some((x) => set.has(x)));
    for (const h of reached) if (!holeReaders.has(h)) N(V.hole).add(h);
  }
  const un = IFACE.unknown, sh = 'shrug';
  const readsIn = (h: string, set: Set<string>) => [...(pos.get(h) ?? []), ...(neg.get(h) ?? [])].some((x) => set.has(x));
  if ([...heads].some((h) => readsIn(h, new Set([un, sh])))) {
    const cone = new Set<string>([un, sh]);
    for (;;) {
      const more = [...heads].filter((h) => !cone.has(h) && readsIn(h, cone));
      if (more.length === 0) break;
      for (const m of more) cone.add(m);
    }
    const below = [...heads].filter((h) => !cone.has(h));
    for (const m of [un, sh]) { heads.add(m); P(m); for (const b of below) N(m).add(b); }
  }
  const all = new Set<string>(heads);
  for (const s of pos.values()) for (const x of s) all.add(x);
  for (const s of neg.values()) for (const x of s) all.add(x);
  const round = new Map<string, number>();
  const settled = new Set<string>();
  for (const rel of all) if (!heads.has(rel)) { settled.add(rel); round.set(rel, 0); }
  const layers: string[][] = [[...settled].sort()];
  const deps = { pos, neg };
  let n = 0;
  while (settled.size < all.size) {
    n++;
    let cand = new Set([...all].filter((rel) => !settled.has(rel) && [...(neg.get(rel) ?? [])].every((q) => settled.has(q))));
    for (;;) {
      const before = cand.size;
      const snap = new Set(cand);
      cand = new Set([...cand].filter((rel) => [...(pos.get(rel) ?? [])].every((q) => settled.has(q) || snap.has(q))));
      if (cand.size === before) break;
    }
    if (cand.size === 0) {
      return { round, rounds: n - 1, stalled: true, stuck: [...all].filter((r) => !settled.has(r)).sort(), aggEdges, pos, neg, soft, demoted, layers, deps };
    }
    for (const rel of cand) { settled.add(rel); round.set(rel, n); }
    layers.push([...cand].sort());
  }
  return { round, rounds: n, stalled: false, stuck: [], aggEdges, pos, neg, soft, demoted, layers, deps };
}

/** THE COMPONENTS A DATA-LEVEL STRATIFICATION MAY TAKE, from a peel that stalled (`data_demotable`): a strongly connected
 *  component of the relations it left with an aggregate's edge in it and no relation `barred` names. The aggregate edges
 *  inside such a component, and the components as sets of relations; peeled again with them demoted the component is one
 *  round, unless another strict edge of it (a negation, a dominance) keeps it stalled, and then the program is refused as
 *  it was. */
export function dataDemotable(p: Peel, barred: (rel: string) => boolean): [Set<string>, Set<string>[]] {
  const at = new Map(p.stuck.map((r, i) => [r, i]));
  const succ: number[][] = p.stuck.map(() => []);
  for (const [h, i] of at) {
    for (const set of [p.pos.get(h), p.neg.get(h)]) {
      if (set) for (const x of set) { const j = at.get(x); if (j !== undefined) succ[i].push(j); }
    }
  }
  const comp = tarjan(succ);
  const unclean = new Set<number>();
  for (const r of p.stuck) if (barred(r)) unclean.add(comp[at.get(r)!]);
  const inside = (e: string): number | null => {
    const [a, b] = e.split('\u0001');
    const x = at.get(a), y = at.get(b);
    return x !== undefined && y !== undefined && comp[x] === comp[y] ? comp[x] : null;
  };
  const out = new Set<string>();
  const comps = new Map<number, Set<string>>();
  for (const e of p.soft) {
    const c = inside(e);
    if (c === null || unclean.has(c)) continue;
    out.add(e);
    let m = comps.get(c);
    if (!m) { m = new Set(); comps.set(c, m); }
    for (const r of p.stuck) if (comp[at.get(r)!] === c) m.add(r);
  }
  return [out, [...comps.entries()].sort((x, y) => x[0] - y[0]).map((x) => x[1])];
}

function levelSplit(rules: ERule[], levelOf: (r: ERule) => number): [number, ERule[]][] {
  const levels: number[] = [];
  for (const r of rules) { const l = levelOf(r); if (!levels.includes(l)) levels.push(l); }
  levels.sort((a, b) => a - b);
  return levels.map((lv) => [lv, rules.filter((r) => levelOf(r) === lv)]);
}

function renameTerm(t: Term, n: number): Term {
  if (t.k === 'v') return mkv(`${t.name}#${n}`);
  if (t.k === 'f') return mkf(t.name, t.args.map((a) => renameTerm(a, n)));
  return t;
}
const renameLit = (l: Lit, n: number): Lit => ({ ...l, persp: renameTerm(l.persp, n), args: l.args.map((a) => renameTerm(a, n)) });
function renameBody(body: BodyElem[], n: number): BodyElem[] {
  return body.map((b): BodyElem => {
    if (b.t === 'pos' || b.t === 'neg') return { ...b, lit: renameLit(b.lit, n) };
    if (b.t === 'bi') return { ...b, l: renameTerm(b.l, n), r: renameTerm(b.r, n) };
    return { ...b, res: renameTerm(b.res, n), vals: b.vals.map((t) => renameTerm(t, n)), keys: b.keys.map((t) => renameTerm(t, n)),
      shared: (b.shared ?? []).map((v) => `${v}#${n}`), body: renameBody(b.body, n) };
  });
}

const factPrems = (prems: PremRef[]): string[] => prems.flatMap((p) => (p.t === 'fact' ? [p.key] : []));

/** The shape of an `is` right-hand side that safety.rofl reads for a lattice. */
function arithShape(t: Term): [string, Term, Term] | null {
  const atomic = (x: Term) => x.k === 'v' || x.k === 'i';
  if (atomic(t)) return ['is', t, t];
  if (t.k !== 'f') return null;
  const iv = IV_FNS.has(t.name);
  const operand = (x: Term) => atomic(x) || (iv && isGround(x));
  if (t.args.length !== 2 || !operand(t.args[0]) || !operand(t.args[1])) return null;
  return [t.name, t.args[0], t.args[1]];
}

function joinSlotOk(op: AggOp, t: Term): boolean {
  if (t.k === 'v') return true;
  if (isGround(t)) { try { joinCanon(op, t); return true; } catch { return false; } }
  const end = (x: Term, inf: string) => x.k === 'v' || x.k === 'i' || (x.k === 'a' && x.name === inf);
  if (op === 'union' && t.k === 'f') return t.name === 'set' && t.args.length === 1;
  if (op === 'hull' && t.k === 'f') return t.name === 'iv' && t.args.length === 2 && end(t.args[0], 'ninf') && end(t.args[1], 'inf');
  return false;
}

/** WHAT THE LOAD CANNOT DECIDE ABOUT A SET, since it needs the lattices. */
function setSpellingRefusals(rules: DRule[], lattices: [string, number, string][]): [string, string][] {
  const joinOf = (rel: string): AggOp | null => {
    const d = lattices.find(([p]) => p === rel);
    const op = d ? opFromName(d[2]) : null;
    return op !== null && isJoin(op) ? op : null;
  };
  const out: [string, string][] = [];
  for (const r of rules) {
    const head = r.clause.head;
    const t = head.args[head.args.length - 1];
    if (t !== undefined) {
      const open = setElems(t) !== null && t.args !== undefined && openSetAt(t) === t;
      if (open && joinOf(head.rel) === null) out.push([r.id, 'set_pattern']);
    }
    for (const l of r.clause.body.flatMap(litsOf)) {
      const op = joinOf(l.rel), last = l.args[l.args.length - 1];
      if (op === null || last === undefined) continue;
      if (!joinSlotOk(op, last)) { out.push([r.id, 'join_value_off_carrier']); break; }
    }
  }
  return out;
}

/** `open_set`: the first set in `t` written with a variable and more than one element. */
function openSetAt(t: Term): Term | null {
  if (t.k !== 'f') return null;
  if (t.name === 'set' && t.args.length > 1 && !isGround(t)) return t;
  for (const a of t.args) { const o = openSetAt(a); if (o) return o; }
  return null;
}

/** Every `lattice_widen[$kernel](Rel, N)` row. */
function latticeWidens(store: FactStore): [string, number][] {
  const out: [string, number][] = [];
  for (const f of store.relPersp(V.lattice_widen, KERNEL_PERSP)) {
    const a = f.args;
    if (a.length === 2 && a[0].k === 'a' && a[1].k === 'i' && BigInt(a[1].v) >= 0n) out.push([a[0].name, Number(a[1].v)]);
  }
  return out;
}

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const teq = (a: Term, b: Term): boolean => canonTerm(a) === canonTerm(b);
const tupleText = (ts: Term[]): string => `(${ts.map(canonTerm).join(',')})`;
const listKey = (ts: Term[]): string => ts.map(canonTerm).join('\u0001');

// the flags of a store row, as the Rust engine names them
const F_BASE = { scope: 'timeless', base: true } as const;
const F_TICK = { scope: 'tick', base: false } as const;
const F_BASE_TICK = { scope: 'tick', base: true } as const;
const F_BASE_FROZEN = { scope: 'timeless', base: true, frozen: true } as const;
const F_DRV = { scope: 'timeless', base: false } as const;
const F_FROZEN = { scope: 'timeless', base: false, frozen: true } as const;

const HOLE_ID_DEFAULT = mka('$adhoc');
/** What stands in a correlation's key for a group variable nothing bound (`dsBind`). */
const DS_ANY = mka(DS_ANY_NAME);
const rowKey = (r: Term[]): string => r.map(canonTerm).join('\u0000');
/** A premise as a firing's signature spells it (rust/rofl `write_sig`). */
export const sigOfPrem = (p: PremRef): string => (p.t === 'bi' ? 'b:' + p.desc : p.t + ':' + p.key);
export const firingSig = (rule: string, prems: PremRef[]): string => rule + prems.map((p) => '|' + sigOfPrem(p)).join('');

export type Mode = 'rounds' | 'strata';

export class AggEval {
  store: Store;
  budget: number;
  space = DEFAULT_SPACE;
  mode: Mode;
  naive = false;
  /** A PROGRAM WITH NO AGGREGATE CONSTRUCT is planned with the cross-product hold and explained as the plain explainer
   *  always has (rust/rofl `Eval::plain`); `forceAgg` holds it false whatever the program. */
  plain = false;
  forceAgg = false;
  private whyUnk: { index: Map<string, string>; hit: Set<string> } | null = null;
  /** Whether a later evaluation of the same world may keep the derived relations whose cone did not move (src/reuse.ts). */
  reuse = true;
  /** Asked every 4096 steps; true stops the evaluation as if its budget ran out. */
  stop: (() => boolean) | undefined = undefined;
  steps = 0;
  rows = 0;
  peakRows = 0;
  diags: string[] = [];
  rules: ERule[] = [];
  private ruleAt = new Map<string, number>();
  wellFounded = false;
  latticeImprovements = 0;
  holeId: Term = HOLE_ID_DEFAULT;
  demandRels: [string, ERule[]][] = [];
  private active: ERule[] = [];
  staged = new Map<string, StagedFact>();
  private stagedAlts = new Map<string, [string, PremRef[]][]>();
  stagedUnknown = new Map<string, [Unknown, boolean]>();
  private pastRows: Map<string, string[]> | null = null;
  /** What this `why` has written out in full, a fact (`f|`) or a cell (`c|`): a second reach is a reference, `[above]`. */
  /** Derivation heights, for the firing `why` shows of each fact; put back at every question. */
  private whyHeights = new Map<string, number>();
  private whyDone: { has(k: string): boolean; add(k: string): unknown; clear(): void } = new Set<string>();
  /** False writes the tree, every shared sub-goal in full: what scripts/why_dag.ts expands the references of an answer back to. */
  dag = true;
  /** The cells this `why` has met under each header text (`desc = value`), in order: a second cell under one header is told apart by `(cell 2)`. */
  private whyHeads = new Map<string, string[]>();
  pastWalks = 0;
  whyScans = 0;
  private aggPlans = new Map<string, AggPlan>();
  /** DATA-LEVEL STRATIFICATION: the components of the evaluation, the aggregate elements `rule|at` they hold, the
   *  correlations released so far (`dsKeys`, by name), and the elements whose component has run to its end, where a
   *  correlation never released is a defect. */
  private dsComps: DsComp[] = [];
  private dsElems = new Set<string>();
  private dsReleased = new Set<string>();
  private dsDone = new Set<string>();
  /** A firing a layer of a data-stratified component makes again, that concludes nothing new, is a step (`fireKeys`). */
  private dsCharge = false;
  /** The final firing of a data-stratified component concludes nothing the layers did not (`runDataLevel`). */
  private dsCheck = false;
  /** The correlations a layer released, and the element `fireKeys` is firing: an instance two of them release is fired by the first alone (`dsGate`). */
  private dsLayer = new Set<string>();
  private dsFiring: [string, number] | null = null;
  private dsKeys = new Map<string, { rid: string; at: number; corr: Term[] }>();
  lattices = new Map<string, [number, AggOp]>();
  private latticeRows: [string, number, string][] = [];
  private declRefused: string[] = [];
  tags: Tags = { byRel: new Map(), countRel: new Map(), countOf: new Map(), refused: [] };
  private tagChanged = new Set<string>();
  private tagRefused: [string, string][] = [];
  private carried = new Map<string, string>();
  private nextRules = new Set<string>();
  private latCur = new Map<string, string>();
  private latCurKey = new Map<string, LatKey>();
  subs = new Map<string, Sub>();
  private domRels = new Set<string>();
  private subCur = new Map<string, string[]>();
  private subSeen = new Map<string, Term[][]>();
  private subSeenSet = new Map<string, number>();
  private subBeaten = new Map<string, Term[]>();
  private subMemo = new Map<string, Map<string, DomV>>();
  private subGone = new Set<string>();
  private subByOf = new Map<string, Term[][]>();
  subBy = new Map<string, [string, string]>();
  private subParties = new Map<string, Term[]>();
  private conflictMarks = new Map<string, Term[]>();
  private joinRels = new Map<string, string>();
  private joinOf = new Map<string, string>();
  private joinContribs = new Map<string, string[]>();
  private joinChecked = new Set<string>();
  private latHoledRel = new Set<string>();
  private latImproved: string[] = [];
  private latDropped: string[] = [];
  private latSuperseded = new Set<string>();
  private latHistory = new Map<string, string[]>();
  private latStale = new Set<string>();
  private latClosed = new Set<string>();
  private latPending: LatFault[] = [];
  private widen = new Map<string, number>();
  private widenRec = new Set<string>();
  private widenTh = new Map<string, bigint[]>();
  private latSteps = new Map<string, number>();
  private latWidened = new Map<string, Term[][]>();
  private widenedMarks = new Map<string, [Term, Term[][], Term[][]]>();
  /** each widened cell with the value its widening closed on, before any narrowing */
  private widenedX = new Map<string, [LatKey, Term]>();
  /** A DESCENDING PASS in progress: the widened cells held at the values given, what the rules contribute from them, and the relations not closed yet. */
  private narrowing: { frozen: Map<string, Term>; fresh: Map<string, Term>; left: Set<string>; keys: Map<string, LatKey>; faulted: Set<string> } | null = null;
  /** what narrowing found for the widened cells of this evaluation: the value they closed on, the value narrowed to, and each step (before, the join of what the rules contribute from it, after) */
  private narrowOut = new Map<string, [Term, Term, Term[][]]>();
  private latUnknown = new Map<string, [Unknown, [Unknown, string] | null]>();
  private latWithdrawn: [string, string[], [string, string] | null][] = [];
  private latSpread = new Set<string>();
  private latUnknownRel = new Map<string, Unknown[]>();
  private latUnknownAt = new Map<string, Unknown[]>();
  private unknownAt = new Map<string, number[]>();
  private unknownAny = new Map<string, number[]>();
  /** Solutions a negation or a body aggregate could not decide: the rule, the element, the solution so far and the
   *  unknowns any of which leaves it undecided (the rest of the body is solved once for all of them). */
  private latUndecided: [string, number, Subst, Unknown[]][] = [];
  private latPlain = new Set<string>();
  private plainClosed = new Set<string>();
  private plainPending: [Unknown, boolean][] = [];
  private plainUndecided: [string, number, Subst, Term][] = [];
  private aggOpened = new Set<string>();
  /** The solutions the aggregate being sealed might have over unknowns (`aggPossibles`), for `sealCells`. */
  private aggReach: Possible[] = [];
  /** WHAT AN AGGREGATE LEFT UNDECIDED, per correlation, as its sealing decided it (`ReachMemo`); `cellReach` the
   *  unknowns each cell sealed a hole under rests on. */
  private reachMemo = new Map<string, ReachMemo>();
  private cellReach = new Map<string, Unknown[]>();
  /** The value a group an unknown moves has under each value of its label (`$by`), where the regions told it. */
  private cellCond = new Map<string, Term>();
  /** A group decided by regions: the labels its value is the same under every value of, as written. */
  private cellDecided = new Map<string, string>();
  /** A group whose regions passed the cap: how many there were, by its hole. */
  private regionsCapped = new Map<string, number>();
  private readsUnknown = false;
  private unknownCone = new Set<string>();
  private unknownStrict: Lit[] = [];
  private metaQueue: [Unknown, Unknown][] = [];
  private metaLate: string | null = null;
  private unkEdges: [Node, Node][] = [];
  private carrySrc: Node | null = null;
  private carryMore: Node[] = [];
  private holesNow: [Term, string][] = [];
  private holesMet = new Set<string>();
  private lastFaultRule: string | null = null;
  private wfsSkipCone = false;
  private wfsFixed: [string, Term][] = [];
  private strictNeg = false;
  private wallSpent: [string, number, number] | null = null;
  private shrugReaders = new Set<string>();
  private shrugSnap: Set<string> | null = null;
  private cycleGroups: Term[][] = [];
  private cycleOf = new Map<string, number>();
  private carryWall: [number, number];
  private undefAtoms: Map<string, Unknown[]> | null = null;
  /** The keys of the `unknown` rows this evaluation's alternating fixpoint wrote: a paradox each. Any other is a book's own word (`given`). */
  private wfsWritten = new Set<string>();
  private carrySteps = 0;
  private carryRows = 0;
  private carryBroken = false;
  private firing = false;
  private faultCount = 0;
  private lastFault: string | null = null;
  private aggMemo = new Map<string, string[]>();
  private holShared = new Map<string, HolShared>();
  private thrCells = new Map<string, string>();
  private thrOpen: [string, number][] = [];
  private thrAcc = new Map<string, ThrAcc>();
  private thrRound = 0;
  private thrFresh = new Set<string>();
  private thrFocus: Map<string, ThrFocus> | null = null;
  private heightMemo = new Map<string, number>();
  private roundOf = new Map<string, number>();
  /** Whether a run has planned its levels: `roundOf`, or under well-founded semantics the stratum table. */
  planned = false;
  private derivedRels = new Set<string>();
  private fault: string | null = null;
  private renameCounter = 0;
  private curFront: Front = newFront();
  private batch: ERule[] = [];
  private batchAt = 0;
  private liveFront: string[] = [];
  private demandHeads: Lit[] = [];
  /** The calls answered on demand being unfolded, as variant keys: a call met again inside its own unfolding would unfold forever. */
  private demandCalls: string[] = [];
  /** The relations answered on demand whose every answer is ground and whose every rule fires bottom-up (`demandClosedRels`). */
  private demandClosed = new Set<string>();
  /** Solutions below a call answered on demand that an unknown left undecided: each call up holes its head under them, as for a fault. */
  private demandUnknown = 0;
  /** The head `demandUnknown` last left unknown: what the call above it rests on. */
  private demandLast: Unknown | null = null;
  private assume: Assumption | null = null;
  private bootstrap: boolean;
  answer: RuleAnswer = emptyAnswer();
  private noProvenance = false;
  retainTicks: number | undefined = undefined;
  /** the citer index (`track_citers`): premise key -> facts with a firing citing it */
  private citers: Map<string, string[]> | null = null;

  constructor(store: Store, budget: number, mode: Mode, bootstrap = false) {
    this.store = store;
    store.keepDead = true;
    this.budget = budget;
    this.mode = mode;
    this.bootstrap = bootstrap;
    this.carryWall = [budget, DEFAULT_SPACE];
    this.prepare();
  }

  private fkey(rel: string, persp: string, args: Term[]): string { return factKey(rel, persp, args); }
  /** A record, live or ghost; a defect when there is none. */
  private rec(id: string): FactRec {
    const r = this.store.recAny(id);
    if (!r) throw new Bug(`no record for ${id}`);
    return r;
  }
  private alive(id: string): boolean { return this.store.has(id); }
  /** `store.add`, returning the fact's key. */
  private put(rel: string, persp: string, args: Term[], flags: { scope: 'timeless' | 'tick'; base: boolean; frozen?: boolean }): [boolean, string] {
    const isNew = this.store.add(rel, persp, args, flags);
    return [isNew, factKey(rel, persp, args)];
  }
  /** Record a firing (`store.support`), keeping the citer index. */
  private support(id: string, w: Witness): boolean {
    const isNew = this.store.support(id, firingSig(w.ruleId, w.prems), w);
    if (isNew && this.citers) {
      for (const p of w.prems) if (p.t === 'fact') {
        let e = this.citers.get(p.key);
        if (!e) { e = []; this.citers.set(p.key, e); }
        e.push(id);
      }
    }
    return isNew;
  }
  /** Mark one record dead and drop its firings (`retire`). */
  private retire(id: string): void {
    if (this.store.has(id)) this.store.remove(id);
  }
  private relAll(rel: string): string[] { return this.store.relAll(rel).map((r) => r.key); }
  private relPersp(rel: string, persp: string): string[] { return this.store.relPersp(rel, persp).map((r) => r.key); }

  // ------------------------------------------------------------- prepare

  /** Re-derive the prepared program from the store, after a load added rules. */
  reprepare(): void {
    const keep = this.diags;
    this.diags = [];
    this.prepare();
    const fresh = this.diags;
    this.diags = keep;
    for (const d of fresh) if (!this.diags.includes(d)) this.diags.push(d);
  }

  /** The relations whose facts are lattice cells, with their algebra, for the store to print (`Store.latRegs`): every lattice, tag
   *  and subsumptive relation, a join's contributions (`L@join`), and the derivations of a counting tag (`p@count`). */
  private registerLattices(rules: DRule[]): void {
    const regs: LatReg[] = [];
    for (const [rel, [, op]] of this.lattices) {
      const tag = this.tags.byRel.get(rel);
      const { alg, use } = latAlg(op, tag ? (tagIdempotent(tag[1]) ? 'idempotent' : 'counting') : null, isJoin(op) && this.widen.has(rel));
      const name = tag ? `tag:${tag[1]}` : op;
      const c = this.joinRels.get(rel);
      if (c !== undefined) regs.push({ rel: c, op: name, alg, use });
      regs.push({ rel, op: name, alg, use });
    }
    for (const [rel, c] of this.tags.countRel) {
      const tag = this.tags.byRel.get(rel);
      if (tag) regs.push({ rel: c, op: `tag:${tag[1]}`, ...latAlg('count', 'counting', false) });
    }
    this.store.latRegs = regs;
    this.store.tagRules = new Set(rules.filter((r) => this.tags.countRel.has(r.clause.head.rel)).map((r) => r.id));
  }

  private prepare(): void {
    this.wellFounded = wellFoundedDeclared(this.store);
    this.plain = !this.forceAgg && !this.bootstrap && !storeHasAggregates(this.store);
    this.noProvenance = sealedBodies(this.store).has(SEALED_PROVENANCE);
    const decoded = decodeRules(this.store);
    this.declRefused = [];
    const decls = declRows(this.store, V.lattice_decl, this.declRefused);
    this.tags = readTags(this.store, decls);
    const low = lowerTags(this.tags, decoded.rules);
    const rules = low.rules;
    this.tagChanged = low.changed;
    this.tagRefused = low.refused;
    this.latticeRows = [...decls, ...tagsAsLattices(this.tags)];
    this.lattices = new Map();
    for (const [r, n, op] of this.latticeRows) { const o = opFromName(op); if (o !== null) this.lattices.set(r, [n, o]); }
    const doms = this.bootstrap ? [] : decodeDominances(this.store, this.declRefused);
    this.subs.clear();
    this.domRels = new Set(doms.map((d) => d.rel));
    const byRel: [string, DomRule[]][] = [];
    for (const d of doms) {
      const e = byRel.find(([r]) => r === d.rel);
      if (e) e[1].push(d); else byRel.push([d.rel, [d]]);
    }
    for (const [rel, ds] of byRel) {
      const arity = ds[0].arity, keylen = ds[0].keylen;
      if (ds.some((d) => d.arity !== arity || d.keylen !== keylen) || this.lattices.has(rel) || this.tags.byRel.has(rel)) continue;
      const reads: string[] = [];
      const planned: [DomRule, BodyElem[]][] = [];
      for (const d of ds) {
        const bound: string[] = [];
        for (const t of [...d.lo.args, ...d.hi.args]) for (const v of varsOf(t)) if (!bound.includes(v)) bound.push(v);
        const { order } = planOrder([], d.body, bound, []);
        const plan = order.map((i) => d.body[i]);
        for (const l of d.body.flatMap(litsOf)) if (!reads.includes(l.rel)) reads.push(l.rel);
        planned.push([d, plan]);
      }
      this.lattices.set(rel, [arity, 'subsumption']);
      this.subs.set(rel, { arity, keylen, doms: planned, reads });
    }
    this.widen = new Map(latticeWidens(this.store).filter(([r]) => this.lattices.get(r)?.[1] === 'hull'));
    this.joinRels.clear();
    this.joinOf.clear();
    for (const [l, [, op]] of [...this.lattices].sort((a, b) => cmpStr(a[0], b[0]))) {
      if (!isJoin(op)) continue;
      this.joinRels.set(l, `${l}@join`);
      this.joinOf.set(`${l}@join`, l);
    }
    this.registerLattices(rules);
    this.diags.push(...decoded.diagnostics);
    this.answer = this.safetyAnswer(rules);
    if (this.noProvenance && this.answer.readsProvenance) {
      this.diags.push(`provenance is sealed; rules reading '${V.derived_by}' will match nothing`);
    }
    const kept: ERule[] = [];
    for (const r of rules) {
      if (RESERVED.has(r.clause.head.rel)) {
        this.diags.push(`rule ${r.id} concludes into a kernel relation; not executable`);
        continue;
      }
      kept.push(this.classify(r));
    }
    // `asks(Rel)`: only the rules whose heads reach an asked relation are activated, backwards through every premise; no asks means everything
    const cone = new Set<string>();
    for (const f of this.store.relAll(IFACE.asks)) if (f.args.length === ARITY.asks && f.args[0].k === 'a') cone.add(f.args[0].name);
    if (cone.size) {
      for (let n = -1; n !== cone.size;) { n = cone.size; for (const r of kept) if (cone.has(r.clause.head.rel)) for (const l of r.clause.body.flatMap(litsOf)) cone.add(l.rel); }
      kept.splice(0, kept.length, ...kept.filter((r) => cone.has(r.clause.head.rel)));
    }
    this.nextRules = new Set(kept.filter((r) => r.clause.head.temporal === 'next').map((r) => r.id));
    this.carried.clear();
    const carried = [...new Set(kept.filter((r) => r.clause.head.temporal === 'next' && this.isLatticeLit(r.clause.head.rel, r.clause.head.args.length))
      .map((r) => r.clause.head.rel))].sort(cmpStr);
    for (const l of carried) {
      const r = this.carryRule(l);
      this.carried.set((r.clause.body[0] as BodyElem & { t: 'pos' }).lit.rel, l);
      kept.push(r);
    }
    const byHead = new Map<string, number[]>();
    kept.forEach((r, i) => {
      if (r.clause.head.temporal === 'next') return;
      let e = byHead.get(r.clause.head.rel);
      if (!e) { e = []; byHead.set(r.clause.head.rel, e); }
      e.push(i);
    });
    const demand: [string, number[]][] = [];
    for (const rel of [...this.answer.demandRels].sort(cmpStr)) { const is = byHead.get(rel); if (is) demand.push([rel, is]); }
    const demandNames = demand.map(([r]) => r);
    const strict = new Set<string>();
    for (let grew = true; grew;) {
      grew = false;
      for (const [rel, is] of demand) {
        if (strict.has(rel)) continue;
        if (is.some((i) => { const r = kept[i]; return r.hasNeg || r.hasAgg || r.latticeOuter.length > 0 || r.posRels.some((x) => strict.has(x)); })) {
          strict.add(rel);
          grew = true;
        }
      }
    }
    for (const r of kept) {
      r.hasDemandPrem = r.posRels.some((x) => demandNames.includes(x));
      r.demandStrict = r.posRels.some((x) => strict.has(x));
      const trig: string[] = [];
      for (const p of r.posRels) {
        const xs = this.answer.trigger.get(p);
        for (const x of xs ?? [p]) if (!trig.includes(x)) trig.push(x);
      }
      r.triggerRels = trig;
    }
    this.aggPlans.clear();
    for (const r of kept) for (const b of r.clause.body) if (b.t === 'agg') this.aggPlans.set(`${r.id}|${b.at}`, this.aggPlan(r.id, r.clause, b));
    this.rules = kept;
    this.ruleAt = new Map(kept.map((r, i) => [r.id, i]));
    this.widenRec = this.widenBackEdges();
    this.widenTh = this.widenThresholds();
    this.demandRels = demand.map(([rel, is]) => [rel, is.map((i) => this.rules[i])]);
    this.demandClosed = this.demandClosedRels();
  }

  /** THE DEMAND RELATIONS WHOSE ANSWERS ARE ALL GROUND, and whose rules all fire bottom-up: a call met again inside its own
   *  unfolding reads the store. A position is ground when every variable of each rule's head there is bound by a positive
   *  premise at a ground position (any of a relation not answered on demand), or by `is` or `=` from ground ones; assumed
   *  of all and withdrawn where a rule falls short. */
  private demandClosedRels(): Set<string> {
    const ground = new Map<string, boolean[]>();
    for (const [rel, rs] of this.demandRels) {
      const n = rs[0].clause.head.args.length;
      const ok = rs.every((r) => r.clause.head.args.length === n && r.clause.head.persp.k === 'a');
      ground.set(rel, new Array<boolean>(n).fill(ok));
    }
    for (let changed = true; changed;) {
      changed = false;
      for (const [rel, rs] of this.demandRels) {
        const gr = ground.get(rel)!;
        for (const r of rs) {
          if (!gr.some((g) => g)) break;
          const bound = new Set<string>();
          for (let before = -1; bound.size !== before;) {
            before = bound.size;
            for (const b of r.clause.body) {
              if (b.t === 'pos') {
                const g = ground.get(b.lit.rel);
                b.lit.args.forEach((a, i) => { if (g === undefined || (g.length === b.lit.args.length && g[i])) varsOf(a, bound); });
                if (g === undefined) varsOf(b.lit.persp, bound);
              } else if (b.t === 'bi' && (b.op === 'is' || b.op === '=')) {
                for (const [from, to] of b.op === 'is' ? [[b.r, b.l]] : [[b.r, b.l], [b.l, b.r]]) {
                  if ([...varsOf(from)].every((v) => bound.has(v))) varsOf(to, bound);
                }
              }
            }
          }
          r.clause.head.args.forEach((a, j) => {
            if (gr[j] && ![...varsOf(a)].every((v) => bound.has(v))) { gr[j] = false; changed = true; }
          });
        }
      }
    }
    return new Set(this.demandRels.filter(([rel, rs]) => rs.every((r) => r.safe) && ground.get(rel)!.every((g) => g)).map(([rel]) => rel));
  }

  /** THE CARRY OF A LATTICE ACROSS A TICK: `L(K..., V) :- L@next(K..., V).` */
  private carryRule(l: string): ERule {
    const n = this.lattices.get(l)![0];
    const name = `${l}@next`;
    const book = mkv('B');
    const args: Term[] = [];
    for (let i = 0; i < n; i++) args.push(mkv(`X${i}`));
    const lit = (rel: string): Lit => ({ rel, persp: book, perspExplicit: true, args, temporal: 'now' });
    const clause: Clause = { head: lit(l), body: [{ t: 'pos', lit: lit(name) }] };
    return { id: name, canon: name, safe: true, hasNeg: false, hasAgg: false, hasThr: false, thrRels: [], latticeOuter: [],
      latClose: l, posRels: [name], hasDemandPrem: false, demandStrict: false, triggerRels: [], plan: [...clause.body], clause };
  }

  private classify(r: DRule): ERule {
    const pb = planBodyAgg(r.clause, this.plain);
    const safe = pb.stuck === null && !this.answer.unsafeRules.has(r.id);
    let hasNeg = false, hasAgg = false, hasThr = false;
    const thrRels: string[] = [], posRels: string[] = [];
    for (const b of pb.plan) {
      if (b.t === 'pos') posRels.push(b.lit.rel);
      else if (b.t === 'neg') hasNeg = true;
      else if (b.t === 'agg' && b.op === 'at_least') {
        hasThr = true;
        for (const x of b.body) {
          if (x.t === 'pos') { posRels.push(x.lit.rel); if (!thrRels.includes(x.lit.rel)) thrRels.push(x.lit.rel); }
          else if (x.t === 'neg') hasNeg = true;
        }
      } else if (b.t === 'agg') hasAgg = true;
    }
    const latticeOuter = [...(this.answer.latticeOuter.get(r.id) ?? [])];
    const head = r.clause.head;
    const lh = this.lattices.get(head.rel);
    const latClose = lh && head.temporal !== 'next' && head.args.length === lh[0] ? head.rel
      : posRels.find((p) => this.lattices.has(p) && !latticeOuter.includes(p)) ?? null;
    const plan = latClose !== null ? sinkBuiltins(pb.plan) : pb.plan;
    return { id: r.id, clause: r.clause, canon: r.canon, safe, hasNeg, hasAgg, hasThr, thrRels, latticeOuter, latClose, posRels,
      hasDemandPrem: false, demandStrict: false, triggerRels: [], plan };
  }

  /** Plan one aggregate element: its inner order, correlation and group, what it reads. */
  private aggPlan(rid: string, c: Clause, a: AggElem): AggPlan {
    const k = a.at! - 1;
    const before = planElems([], c.body.slice(0, k), [], []).bound;
    const shared = a.shared ?? [];
    const corr: number[] = [], group: number[] = [];
    shared.forEach((v, i) => (before.includes(v) ? corr : group).push(i));
    const innerOrder = planOrder([], a.body, before, []).order;
    const rels: string[] = [];
    for (const l of a.body.flatMap(litsOf)) if (!rels.includes(l.rel)) rels.push(l.rel);
    return { op: a.op as AggOp, innerOrder, corr, group, rels, emptyZero: this.answer.emptyZero.has(`${rid}|${a.at}`) };
  }

  /** ASK safety.rofl, in a store of its own, under the stock evaluator. */
  private safetyAnswer(rules: DRule[]): RuleAnswer {
    if (this.bootstrap || (rules.length === 0 && this.latticeRows.length === 0 && this.domRels.size === 0)) return emptyAnswer();
    // WHAT safety.rofl IS ASKED is a function of the reflected program alone: one program, asked once
    const keyed = [V.rule, V.premise_lit, V.conclusion_lit, V.has_premise, V.concludes, V.conclusion_tense, V.premise_pos, V.premise_neg,
      V.premise_agg, V.reserved, V.lattice_decl, V.tag_decl, V.lattice_widen, V.dominance, V.order_comp];
    const parts = [...rules.map((r) => r.id), JSON.stringify(this.latticeRows), ...this.tagRefused.flat()];
    for (const rel of keyed) for (const f of this.store.relAll(rel)) parts.push(f.key);
    const memoKey = digest53(parts.join('\n'));
    let answer = safetyMemo.get(memoKey);
    if (answer === undefined) {
      const asked = this.askSafety(rules);
      answer = asked.answer;
      if (asked.settled) {
        if (safetyMemo.size >= SAFETY_MEMO_CAP) safetyMemo.clear();
        safetyMemo.set(memoKey, answer);
      }
    }
    const byPair = (a: [string, string], b: [string, string]) => cmpStr(a[0], b[0]) || cmpStr(a[1], b[1]);
    return { ...answer, aggRefused: [...answer.aggRefused, ...setSpellingRefusals(rules, [...this.latticeRows]), ...this.tagRefused].sort(byPair) };
  }

  /** safety.rofl run over the reflection in a store of its own. */
  private askSafety(rules: DRule[]): { answer: RuleAnswer; settled: boolean } {
    const pol = policyStore(SAFETY_DENSE);
    const add = (rel: string, persp: string, args: Term[]) => pol.add(rel, persp, args, F_BASE);
    for (const rel of [V.premise_lit, V.conclusion_lit, V.has_premise, V.concludes, V.conclusion_tense, V.premise_pos,
      V.premise_neg, V.premise_agg, V.reserved, V.lattice_decl, V.lattice_widen, V.dominance, V.order_comp]) {
      for (const f of this.store.relAll(rel)) {
        const a0 = f.args[0];
        if (a0 !== undefined && a0.k === 'a' && this.tagChanged.has(a0.name) && rel !== V.lattice_decl) continue;
        add(rel, f.persp, f.args);
      }
    }
    const seeded = new Set<string>([V.premise_lit, V.conclusion_lit, V.has_premise, V.concludes, V.conclusion_tense,
      V.premise_pos, V.premise_neg, V.premise_agg]);
    for (const r of rules) {
      if (!this.tagChanged.has(r.id)) continue;
      const enc = encodeRule(r.clause);
      for (const f of enc.facts) {
        if (!seeded.has(f.rel)) continue;
        const args = [...f.args];
        if (args[0].k === 'a' && args[0].name === enc.id) args[0] = mka(r.id);
        add(f.rel, KERNEL_PERSP, args);
      }
    }
    for (const [rel, n, op] of tagsAsLattices(this.tags)) add(V.lattice_decl, KERNEL_PERSP, [mka(rel), mki(n), mka(op)]);
    const islot = (rid: Term, k: number, name: string, ts: Term[]) => {
      const vs: string[] = [];
      for (const t of ts) for (const v of varsOf(t)) if (!vs.includes(v)) vs.push(v);
      let i = 0;
      for (const v of vs) { i++; add(IFACE.premise_var, MAIN, [rid, mki(k), mka(name), mki(i), mks(v)]); }
      add(IFACE.slot_arity, MAIN, [rid, mki(k), mka(name), mki(i)]);
    };
    for (const r of rules) {
      const rid = mka(r.id);
      islot(rid, 0, 'head', [...r.clause.head.args, r.clause.head.persp]);
      r.clause.body.forEach((b, i) => {
        const k = i + 1;
        if (b.t === 'pos') islot(rid, k, 'pos', [...b.lit.args, b.lit.persp]);
        else if (b.t === 'bi') { islot(rid, k, 'left', [b.l]); islot(rid, k, 'right', [b.r]); }
        else if (b.t === 'agg') {
          const shared = (b.shared ?? []).map(mkv);
          islot(rid, k, 'agg', shared);
          islot(rid, k, 'agg_res', b.op === 'at_least' ? [] : [b.res]);
          const inner = mkf('$inner', [rid, mki(k)]);
          add('agg_inner', MAIN, [rid, mki(k), inner]);
          islot(inner, 0, 'head', [...b.vals, ...b.keys, ...shared]);
          b.body.forEach((x, j) => {
            const kj = mki(j + 1);
            add(V.has_premise, KERNEL_PERSP, [inner, kj]);
            add(V.premise_lit, KERNEL_PERSP, [inner, kj, reifyBodyElem(x)]);
            if (x.t === 'pos') islot(inner, j + 1, 'pos', [...x.lit.args, x.lit.persp]);
            else if (x.t === 'bi') { islot(inner, j + 1, 'left', [x.l]); islot(inner, j + 1, 'right', [x.r]); }
          });
        }
      });
    }
    const lattices = [...this.latticeRows];
    const subs: [string, number][] = [...this.subs].map(([r, x]) => [r, x.arity]);
    if (subs.length > 0) {
      const isSub = (rel: string) => subs.some(([p]) => p === rel);
      for (const r of rules) {
        const rid = mka(r.id);
        const head = r.clause.head;
        if (isSub(head.rel)) add('lit_arity', MAIN, [rid, mki(0), mka(head.rel), mki(head.args.length)]);
        r.clause.body.forEach((b, i) => {
          if ((b.t === 'pos' || b.t === 'neg') && isSub(b.lit.rel)) add('lit_arity', MAIN, [rid, mki(i + 1), mka(b.lit.rel), mki(b.lit.args.length)]);
        });
      }
    }
    // A DECLARED ORDER'S RELATIONS and how many values each compares
    const ords = new Map<string, number>();
    for (const f of this.store.relAll(V.order_comp)) {
      if (f.args[0]?.k === 'a') ords.set(f.args[0].name, (ords.get(f.args[0].name) ?? 0) + 1);
    }
    const oval = (rid: Term, k: number, i: number, x: string) => add(IFACE.premise_var, MAIN, [rid, mki(k), mka('oval'), mki(i), mks(x)]);
    if (lattices.length > 0 || ords.size > 0) {
      const isLat = (rel: string) => lattices.some(([p]) => p === rel);
      for (const r of rules) {
        const rid = mka(r.id);
        const head = r.clause.head;
        const hm = ords.get(head.rel);
        if (hm !== undefined) {
          const n = head.args.length;
          const key = head.args.slice(0, Math.max(0, n - hm)), comps = head.args.slice(Math.max(0, n - hm));
          islot(rid, 0, 'hkey', [...key, ...comps.filter((t) => t.k !== 'v'), head.persp]);
          comps.forEach((t, i) => { if (t.k === 'v') oval(rid, 0, i + 1, t.name); });
        }
        if (isLat(head.rel)) {
          const n = head.args.length;
          islot(rid, 0, 'hkey', [...head.args.slice(0, Math.max(0, n - 1)), head.persp]);
          const last = head.args[n - 1];
          islot(rid, 0, 'hval', last !== undefined && last.k === 'v' ? [last] : []);
          add('lit_arity', MAIN, [rid, mki(0), mka(head.rel), mki(n)]);
        }
        r.clause.body.forEach((b, i) => {
          const k = i + 1;
          if (b.t === 'neg') {
            islot(rid, k, 'neg', [...b.lit.args, b.lit.persp]);
            if (isLat(b.lit.rel)) add('lit_arity', MAIN, [rid, mki(k), mka(b.lit.rel), mki(b.lit.args.length)]);
          } else if (b.t === 'pos' && ords.has(b.lit.rel)) {
            const m = ords.get(b.lit.rel)!, n = b.lit.args.length;
            const key = b.lit.args.slice(0, Math.max(0, n - m)), comps = b.lit.args.slice(Math.max(0, n - m));
            islot(rid, k, 'lkey', [...key, b.lit.persp]);
            const seen = new Set<string>();
            for (const t of key) for (const v of varsOf(t)) seen.add(v);
            let bad = false;
            comps.forEach((t, i) => {
              if (t.k === 'v' && !seen.has(t.name)) { seen.add(t.name); oval(rid, k, i + 1, t.name); } else bad = true;
            });
            if (bad) add('order_bad_read', MAIN, [rid, mki(k)]);
          } else if (b.t === 'pos' && isLat(b.lit.rel)) {
            const n = b.lit.args.length;
            islot(rid, k, 'lkey', [...b.lit.args.slice(0, Math.max(0, n - 1)), b.lit.persp]);
            islot(rid, k, 'lval', n > 0 ? [b.lit.args[n - 1]] : []);
            add('lit_arity', MAIN, [rid, mki(k), mka(b.lit.rel), mki(n)]);
          } else if (b.t === 'bi' && b.op === 'is') {
            const sh = arithShape(b.r);
            if (sh !== null) add('premise_arith', MAIN, [rid, mki(k), reifyTerm(b.l), mks(sh[0]), reifyTerm(sh[1]), reifyTerm(sh[2])]);
          }
        });
      }
    }
    const sub = new AggEval(pol, POLICY_BUDGET, 'strata', true);
    let settled = true;
    try { sub.run(); } catch (e) { settled = false; this.diags.push(`safety.rofl did not settle: ${(e as Error).message}`); }
    const atoms = (rel: string): string[] => {
      const out: string[] = [];
      for (const f of pol.relAll(rel)) if (f.args[0]?.k === 'a' && !out.includes(f.args[0].name)) out.push(f.args[0].name);
      return out;
    };
    const pairs = (rel: string): [string, string][] => {
      const out: [string, string][] = [];
      for (const f of pol.relAll(rel)) if (f.args[0]?.k === 'a' && f.args[1]?.k === 'a') out.push([f.args[0].name, f.args[1].name]);
      return out;
    };
    const trigger = new Map<string, string[]>();
    for (const [a, b] of pairs(IFACE.trigger_of)) { let e = trigger.get(a); if (!e) { e = []; trigger.set(a, e); } if (!e.includes(b)) e.push(b); }
    const byPair = (a: [string, string], b: [string, string]) => cmpStr(a[0], b[0]) || cmpStr(a[1], b[1]);
    const aggRefused = pairs('agg_refused');
    const latticeRefused = pairs('lattice_refused').sort(byPair);
    const latticeOuter = new Map<string, string[]>();
    for (const [r, p] of pairs('lattice_outer')) { let e = latticeOuter.get(r); if (!e) { e = []; latticeOuter.set(r, e); } if (!e.includes(p)) e.push(p); }
    const emptyZero = new Set<string>();
    for (const f of pol.relAll('empty_zero')) if (f.args[0]?.k === 'a' && f.args[1]?.k === 'i') emptyZero.add(`${f.args[0].name}|${f.args[1].v}`);
    return { settled, answer: {
      unsafeRules: new Set(atoms(IFACE.unsafe_rule)), demandRels: atoms(IFACE.demand_rel), trigger, late: new Set(atoms(IFACE.late_rule)),
      readsProvenance: pol.relCount(IFACE.provenance_reader) > 0, aggRefused, emptyZero, readsMembers: pol.relCount('member_reader') > 0,
      latticeRefused, latticeOuter, readsLatticeMembers: pol.relCount('lattice_member_reader') > 0,
      readsDominated: pol.relCount('dominated_reader') > 0,
    } };
  }

  // ----------------------------------------------------------------- run

  /** An evaluation, and for a world whose widened cells settled, the descending pass that narrows them and the evaluation again with what it found. */
  run(): Outcome {
    this.peelCache = null;
    const plan = this.planReuse();
    // the hole rows the last evaluation of this tick wrote go with it (a hole is a base, frozen row, which clearDerived keeps)
    if (plan.hits.size === 0) this.store.dropEvalHoles();
    this.narrowOut.clear();
    let out = this.runPass(plan);
    if (out.partial || this.wellFounded || this.widenedX.size === 0) return out;
    // the widened result is an answer, narrowing only a tighter one: a descent that fails or an evaluation that closes a cell on another value leaves the first pass standing
    try {
      this.narrowDescend();
      out = this.runPass();
      if (out.partial) throw new Wall('budget_exhausted');
      for (const [id, [x]] of this.narrowOut) {
        const w = this.widenedX.get(id);
        if (w === undefined || !teq(w[1], x)) throw new Bug(`the widened cell ${id} closed on another value when evaluated again`);
      }
      return out;
    } catch (e) {
      if (!(e instanceof Wall || e instanceof Bug || e instanceof Rejected)) throw e;
      this.narrowing = null;
      this.narrowOut.clear();
      return this.runPass();
    }
  }

  /** The relations a later evaluation may keep: only a plain program's, whose rules a fingerprint of the cone can speak for. */
  private planReuse(): ReusePlan {
    if (!this.reuse || this.bootstrap || this.wellFounded || this.answer.readsProvenance || this.store.relCount(V.hole) > 0
      || storeHasAggregates(this.store)) return noReuse();
    return planReuse(this.store, this.rules, this.scheduleToken(), (pol) => { new AggEval(pol, POLICY_BUDGET, 'strata', true).run(); }, this.mode === 'strata');
  }

  /** The schedule this evaluation orders its negation phases by, written to the store for the next one's reuse gate to compare. */
  private scheduleToken(): string {
    const table = this.mode === 'rounds' ? this.peelOnce().round : this.readStrata();
    return [...table.keys()].sort().map((k) => k + ':' + table.get(k)).join('|');
  }

  private peelCache: Peel | null = null;
  private peelOnce(): Peel {
    if (this.peelCache === null) {
      const domEdges: [string, string][] = [...this.subs].flatMap(([p, x]) => x.reads.map((b): [string, string] => [p, b]));
      this.peelCache = peelRounds(this.rules, [...this.lattices.keys()], domEdges);
    }
    return this.peelCache;
  }

  private runPass(plan: ReusePlan = noReuse()): Outcome {
    this.clearDerived(plan);
    this.store.derivedSchedule = '';
    this.shrugReset();
    this.active = [];
    this.staged.clear();
    this.stagedAlts.clear();
    this.stagedUnknown.clear();
    this.steps = 0;
    this.rows = 0;
    this.peakRows = 0;
    this.carryWall = [this.budget, this.space];
    this.carrySteps = 0; this.carryRows = 0; this.carryBroken = false;
    let partial = false;
    if (this.wellFounded) {
      this.planned = true;
      let p = false;
      try { this.runWellFounded(); } catch (e) {
        if (!(e instanceof Wall)) throw e;
        this.wallHole(e.reason);
        p = true;
      }
      this.writeShrugs(p);
      this.store.dirty = false;
      this.store.partialEval = p;
      this.store.noteEval(this.budget, this.steps, p);
      return { partial: p, staged: p ? 0 : this.staged.size };
    }
    this.forgetCells();
    this.fault = null;
    this.derivedRels = new Set(this.rules.filter((r) => r.clause.head.temporal !== 'next').map((r) => r.clause.head.rel));
    this.refuseTags();
    this.refuseLattices();
    this.refuseAggregates();
    // A CELL CARRIED ACROSS A BOUNDARY is read as data in the tick it arrived in
    const now = this.store.tick;
    for (const c of [...this.store.cells.values()]) if (c.tick < now) this.reflectCell(c.key);
    this.curFront = newFront();
    this.latCur.clear(); this.latCurKey.clear();
    this.subCur.clear(); this.subSeen.clear(); this.subSeenSet.clear(); this.subBeaten.clear(); this.subMemo.clear();
    this.subGone.clear(); this.subBy.clear(); this.subByOf.clear(); this.subParties.clear(); this.conflictMarks.clear();
    this.joinContribs.clear(); this.joinChecked.clear(); this.latHoledRel.clear(); this.latSuperseded.clear();
    this.latHistory.clear(); this.latStale.clear();
    this.citers = this.lattices.size > 0 ? new Map() : null;
    this.latImproved = []; this.latDropped = []; this.latClosed.clear(); this.latPending = [];
    this.latSteps.clear(); this.latWidened.clear(); this.widenedMarks.clear(); this.widenedX.clear();
    this.latUnknown.clear(); this.latWithdrawn = []; this.latSpread.clear(); this.latUnknownRel.clear();
    this.latUnknownAt.clear(); this.unknownAt.clear(); this.unknownAny.clear(); this.latUndecided = [];
    this.latPlain.clear();
    this.plainPending = this.carriedUnknowns(this.store.tick);
    this.plainUndecided = []; this.aggOpened.clear(); this.plainClosed.clear();
    this.dsComps = []; this.dsElems.clear(); this.dsReleased.clear(); this.dsKeys.clear(); this.dsDone.clear();
    this.latticeImprovements = 0;
    this.seedNarrowing();
    // a relation served from the previous evaluation must not also be derived in this one: a second firing of the same rule would add a support the scratch run never had
    const safeRules = this.rules.filter((r) => r.safe && !plan.hits.has(r.clause.head.rel));
    const readers = new Set(this.shrugReaders);
    const compared = new Set([...this.subs].filter(([, x]) => x.reads.length > 0).map(([p]) => p));
    const stratified = (r: ERule) => readers.has(r.id) || (compared.has(r.clause.head.rel) && r.clause.head.temporal !== 'next')
      || r.hasNeg || r.hasAgg || r.latticeOuter.length > 0 || r.demandStrict;
    const mono = safeRules.filter((r) => !stratified(r));
    const stratRules = safeRules.filter(stratified);
    try {
      let levels: [number, ERule[]][] | null = null;
      if (this.mode === 'rounds') {
        const lats = [...this.lattices.keys()];
        const domEdges: [string, string][] = [...this.subs].flatMap(([p, x]) => x.reads.map((b): [string, string] => [p, b]));
        let peel = peelRounds(this.rules, lats, domEdges);
        // A COMPONENT WHOSE ONLY STRICT EDGES ARE AGGREGATES' may be stratified by its data: ranked as one round
        if (peel.stalled) peel = this.takeDataComponents(peel, lats, domEdges) ?? peel;
        if (peel.stalled) {
          const stuck = new Set(peel.stuck), deps = this.relDeps();
          for (const [rid, head, inner] of peel.aggEdges) {
            if (stuck.has(head) && stuck.has(inner) && reachesIn(deps, inner, head)) {
              const r = this.rules.find((x) => x.id === rid);
              const b = r?.clause.body.find((x) => x.t === 'agg' && litsOf(x).some((l) => l.rel === inner));
              const op = b && b.t === 'agg' ? b.op : 'an aggregate';
              throw new Rejected(`program rejected: ${op} in rule ${rid} reads ${inner}, which depends on the rule's own conclusion ${head}: an aggregate reads a closed relation; a recursive min/max is a lattice declaration (docs/aggregates.md)`);
            }
          }
          for (const [p, x] of [...this.subs].sort((a, b) => cmpStr(a[0], b[0]))) {
            const b = x.reads.find((b) => stuck.has(p) && stuck.has(b) && reachesIn(deps, b, p));
            if (b !== undefined) {
              throw new Rejected(`program rejected: the dominance of ${p} reads ${b}, which depends on ${p} itself: which of two values dominates is decided from relations closed below it (docs/aggregates.md, "Subsumption, as built")`);
            }
          }
          throw new Rejected(`program rejected: round ${peel.rounds + 1} settled nothing while ${peel.stuck.join(', ')} remained`);
        }
        this.roundOf = new Map(peel.round);
        this.planned = true;
        levels = levelSplit(stratRules, (r) => (r.clause.head.temporal === 'next' ? Infinity : peel.round.get(r.clause.head.rel) ?? Infinity));
      }
      const late = this.answer.late;
      const first = mono.filter((r) => !late.has(r.id));
      const second = mono.filter((r) => late.has(r.id));
      this.activate(first);
      if (this.mode === 'strata' && stratRules.length > 0) this.checkUnstratified();
      this.activate(second);
      if (levels === null) {
        const strat = this.readStrata();
        this.rankCounting(strat);
        const table = new Map(strat);
        this.rankUnknownCone(strat);
        this.checkAggStrata(strat, stratRules);
        this.checkLatticeStrata(strat, stratRules);
        this.checkUnrankedNegation(table, stratRules, mono);
        this.roundOf = new Map([...strat].map(([k, v]) => [k, Math.max(v, 0)]));
        this.planned = true;
        levels = levelSplit(stratRules, (r) => (r.clause.head.temporal === 'next' ? Infinity : strat.get(r.clause.head.rel) ?? Infinity));
      }
      for (const [lv, all] of levels) {
        this.closePlainRules(lv);
        this.plainFlush(lv);
        this.closeThresholdsBelow(lv, true);
        this.closeLatticesBelow(lv);
        // the rules that own an element a stratification by data took run last at their level, a layer at a time
        const ds = all.filter((r) => this.dsOwner(r)), rs = all.filter((r) => !this.dsOwner(r));
        if (this.shrugSnap === null && rs.some((r) => this.shrugReaders.has(r.id))) {
          const lateR = rs.filter((r) => this.shrugReaders.has(r.id)), early = rs.filter((r) => !this.shrugReaders.has(r.id));
          this.activate(early);
          this.poisonReaders(early);
          this.shrugSnapshot();
          this.activate(lateR);
          this.poisonReaders(lateR);
          this.runDataLevels(lv, ds);
          continue;
        }
        this.activate(rs);
        this.poisonReaders(rs);
        this.runDataLevels(lv, ds);
      }
      this.closePlainRules(Infinity);
      this.plainFlush(Infinity);
      for (;;) {
        this.closeThresholdsBelow(Infinity, true);
        this.closeLatticesBelow(Infinity);
        if (this.thrOpen.length === 0) break;
      }
    } catch (e) {
      this.dsElems.clear(); this.dsDone.clear();
      if (!(e instanceof Wall)) throw e;
      partial = true;
      this.wallHole(e.reason);
      const why = e.reason === BUDGET_REASON ? BUDGET_REASON : SPACE_REASON;
      this.latticeCut(why);
      this.withWallsLifted(() => this.closeThresholdsBelow(Infinity, false));
    }
    this.dsElems.clear(); this.dsDone.clear();
    this.settleStaged();
    this.writeShrugs(partial);
    this.store.dirty = false;
    this.store.partialEval = partial;
    this.store.noteEval(this.budget, this.steps, partial);
    // a partial layer is not a layer, and nothing derived while something was left unknown is one the next evaluation may keep
    if (!partial && plan.keys.size > 0 && this.stagedUnknown.size === 0 && this.store.relCount('shrug') === 0) {
      this.store.derivedKeys = plan.keys;
      this.store.derivedSchedule = this.scheduleToken();
    }
    return { partial, staged: this.staged.size };
  }

  // ------------------------------------------ data-level stratification

  /** The peel that ranks each component of a stalled one `dataDemotable` finds as a round, with the components recorded
   *  for the evaluation; null when there is no such component or the program stalls anyway. */
  private takeDataComponents(stalled: Peel, lats: string[], domEdges: [string, string][]): Peel | null {
    const barred = (rel: string): boolean => this.lattices.has(rel) || this.subs.has(rel) || this.carried.has(rel)
      || this.demandRels.some(([d]) => d === rel) || this.tags.countRel.has(rel) || [...this.tags.countRel.values()].includes(rel)
      || this.rules.some((r) => r.clause.head.rel === rel && (r.hasThr || r.latClose !== null || r.latticeOuter.length > 0));
    const [demote, comps] = dataDemotable(stalled, barred);
    if (demote.size === 0) return null;
    const again = peelRounds(this.rules, lats, domEdges, demote);
    if (again.stalled) return null;
    const least = (set: Set<string>): string => [...set].sort(cmpStr)[0];
    comps.sort((a, b) => cmpStr(least(a), least(b)));
    // two components of one round are run the one that reads the other last: what it reads is closed only when that one has run
    const deps = this.relDeps();
    const ordered: Set<string>[] = [];
    while (comps.length > 0) {
      const readsAnother = (i: number): boolean => comps.some((d, j) => j !== i && [...comps[i]].some((a) => [...d].some((b) => reachesIn(deps, a, b))));
      let first = comps.findIndex((_, i) => !readsAnother(i));
      if (first < 0) first = 0;
      ordered.push(...comps.splice(first, 1));
    }
    for (const rels of ordered) {
      let round = 0;
      for (const r of rels) { const n = again.round.get(r); if (n !== undefined) { round = n; break; } }
      const elems = again.demoted.filter(([rid]) => rels.has(this.ruleOf(rid)!.clause.head.rel));
      for (const [rid, at] of elems) this.dsElems.add(`${rid}|${at}`);
      this.dsComps.push({ rels, round, elems });
    }
    return again;
  }

  /** Whether the correlation `mk` of a data-stratified element may be read now: it has been released. */
  private dsGate(mk: string): boolean {
    if (this.dsFiring !== null && this.dsLayer.has(mk)) {
      const [r, a] = mk.split('|');
      if (r === this.dsFiring[0] && Number(a) < this.dsFiring[1]) return false;
    }
    if (this.dsReleased.has(mk)) return true;
    const [rid, at] = mk.split('|');
    if (this.dsDone.has(`${rid}|${at}`)) throw new Bug(`a correlation of ${rid} was met that the data walk never reached`);
    return false;
  }

  /** Whether `r` owns an element a data-level stratification took. */
  private dsOwner(r: ERule): boolean {
    return this.dsElems.size > 0 && r.clause.body.some((b) => b.t === 'agg' && this.dsElems.has(`${r.id}|${b.at}`));
  }

  /** The components ranked at `lv`, each run: the rules `rs` own their elements. */
  private runDataLevels(lv: number, rs: ERule[]): void {
    for (const c of this.dsComps.filter((x) => x.round === lv)) {
      this.runDataLevel(c, rs.filter((r) => c.rels.has(r.clause.head.rel)));
    }
  }

  private runDataLevel(comp: DsComp, rs: ERule[]): void {
    // fired with every correlation held: nothing seals, the rules are live
    this.activate(rs);
    for (const layer of this.dsLayers(comp)) {
      this.dsCarry(comp);
      const owners = rs.filter((r) => layer.some((k) => k.rid === r.id));
      for (const k of layer) { this.dsReleased.add(k.mk); this.dsKeys.set(k.mk, { rid: k.rid, at: k.at, corr: k.corr }); }
      this.dsLayer = new Set(layer.map((k) => k.mk));
      this.fireKeys(layer);
      this.dsLayer.clear();
      this.poisonReaders(owners);
    }
    this.dsCarry(comp);
    // from here to the end of the evaluation every correlation the rules meet was released: the walk reached them all, or it is a defect
    for (const [rid, at] of comp.elems) this.dsDone.add(`${rid}|${at}`);
    this.dsCheck = true;
    try { this.fireAll(rs); } finally { this.dsCheck = false; }
    this.dsVerify(comp);
  }

  /** The shared variables of `a` bound as the key `key` of a correlation says: the correlation, then each group a rule
   *  bound (`_` for one it did not). */
  private dsBind(a: AggElem, plan: AggPlan, key: Term[]): Subst | null {
    let s: Subst | null = new Map();
    plan.corr.forEach((ix, n) => { if (s !== null) s = unify(mkv(a.shared![ix]), key[n], s); });
    plan.group.forEach((ix, n) => { const t = key[plan.corr.length + n]; if (s !== null && t !== DS_ANY) s = unify(mkv(a.shared![ix]), t, s); });
    return s;
  }

  /** The rules of `keys` fired over the instances that read each correlation, the news propagated after: a group the
   *  rule binds is read by no firing that leaves the group open, so it is fired with the group bound. */
  private fireKeys(keys: { rid: string; at: number; corr: Term[] }[]): void {
    if (keys.length === 0) return;
    const owners: ERule[] = [];
    for (const k of keys) {
      const r = this.ruleOf(k.rid);
      if (!r) throw new Bug('a correlation of no rule');
      if (!owners.some((o) => o.id === r.id)) owners.push(r);
    }
    owners.sort((a, b) => cmpStr(a.canon, b.canon));
    this.curFront = newFront();
    const outer: [ERule[], number] = [this.batch, this.batchAt];
    this.batch = owners;
    this.dsCharge = true;
    try {
      owners.forEach((r, i) => {
        this.batchAt = i;
        const whole = [...this.dsElems].filter((e) => e.startsWith(`${r.id}|`)).every((e) => (this.aggPlans.get(e)?.group.length ?? 0) === 0);
        for (const k of keys.filter((x) => x.rid === r.id)) {
          const a = r.plan.find((b) => b.t === 'agg' && b.at === k.at) as AggElem | undefined;
          const plan = this.aggPlans.get(`${k.rid}|${k.at}`);
          if (!a || !plan) throw new Bug('a correlation of no element');
          const s0 = this.dsBind(a, plan, k.corr);
          this.dsFiring = whole ? [k.rid, k.at] : null;
          if (s0 !== null) this.fireRule(r, null, s0);
        }
      });
    } finally { this.dsCharge = false; this.dsFiring = null; }
    [this.batch, this.batchAt] = outer;
    const front = this.curFront;
    this.curFront = newFront();
    this.propagate(front);
    this.latticeSettle(false);
    const more = this.curFront;
    this.curFront = newFront();
    if (more.keys.size > 0) {
      this.propagate(more);
      this.latticeSettle(false);
    }
  }

  /** EVERY CELL SEALED IS THE CELL ITS INNER BODY GIVES NOW. A member that came after the seal, or a group, is a defect of
   *  the walk (an edge it did not see), never a quiet wrong value: each correlation is solved again, ephemeral, over the
   *  store as it stands, and must give the value the cell holds (a hole stands). */
  private dsVerify(comp: DsComp): void {
    const keys = [...this.dsKeys.entries()].filter(([, k]) => comp.elems.some((e) => e[0] === k.rid && e[1] === k.at))
      .sort((x, y) => cmpStr(x[1].rid, y[1].rid) || x[1].at - y[1].at || cmpStr(tupleText(x[1].corr), tupleText(y[1].corr)));
    const saved: [number, number, number, string | null, number, string | null, string | null] =
      [this.steps, this.rows, this.peakRows, this.fault, this.faultCount, this.lastFault, this.lastFaultRule];
    let bad: string | null = null;
    try {
      for (const [mk, k] of keys) {
        const held = this.aggMemo.get(mk);
        const r = this.ruleOf(k.rid);
        const a = r?.plan.find((b) => b.t === 'agg' && b.at === k.at) as AggElem | undefined;
        const plan = this.aggPlans.get(`${k.rid}|${k.at}`);
        if (held === undefined || !a || !plan) continue;
        const s = this.dsBind(a, plan, k.corr);
        if (s === null) continue;
        const now = this.sealCells(k.rid, a, plan, s, k.corr, 0, false);
        if (now.k !== 'ephemeral') continue;
        for (const [key, value] of now.cells) {
          const text = key.map(canonTerm).join(',');
          const cell = held.map((c) => this.store.cells.get(c)!).find((c) => c.keyTerms.map(canonTerm).join(',') === text);
          const ok = cell !== undefined && (cell.value.k === 'hole' || (cell.value.k === value.k && (value.k !== 'value' || (cell.value as { t: Term }).t === value.t || canonTerm((cell.value as { t: Term }).t) === canonTerm(value.t))));
          if (!ok && bad === null) bad = `the cell ${this.dsNodeText({ k: 'a', rid: k.rid, at: k.at, corr: k.corr })} changed after it sealed: the data walk missed an edge into it`;
        }
      }
    } finally {
      [this.steps, this.rows, this.peakRows, this.fault, this.faultCount, this.lastFault, this.lastFaultRule] = saved;
    }
    if (bad !== null) throw new Bug(bad);
  }

  /** What a hole in the component left unknown, carried before the next layer reads it: the component is closed as far
   *  as the carry is concerned. */
  private dsCarry(comp: DsComp): void {
    if (this.plainPending.length === 0 && this.plainUndecided.length === 0 && this.latUndecided.length === 0 && this.latSpread.size === 0) return;
    this.closePlainRules(comp.round + 1);
    this.plainFlush(comp.round + 1);
  }

  /** The element of a rule as the refusals name it: its head, its operation, and the first relation of the component it reads. */
  private dsElement(rid: string, at: number, comp: DsComp): [string, string, string] {
    const r = this.ruleOf(rid)!;
    const a = r.clause.body.find((b) => b.t === 'agg' && b.at === at) as AggElem | undefined;
    const inner = a ? (a.body.flatMap(litsOf).map((l) => l.rel).find((x) => comp.rels.has(x)) ?? '') : '';
    return [r.clause.head.rel, a ? a.op : 'an aggregate', inner];
  }

  private dsNodeText(n: DsNode): string {
    if (n.k === 'p') return `${n.rel}(${n.args.map((t) => (t === null ? '_' : canonTerm(t))).join(',')})`;
    const r = this.ruleOf(n.rid);
    const a = r?.clause.body.find((b) => b.t === 'agg' && b.at === n.at) as AggElem | undefined;
    return `${a ? a.op : 'an aggregate'}@${r ? r.clause.head.rel : ''}${tupleText(n.corr)}`;
  }

  private dsLayers(comp: DsComp): { rid: string; at: number; corr: Term[]; mk: string }[][] {
    try { return this.dsGraph(comp); } catch (e) {
      if (!(e instanceof DsUnkeyed)) throw e;
      const [head, op, inner] = this.dsElement(e.rid, e.at, comp);
      throw new Rejected(`program rejected: ${op} in rule ${e.rid} reads ${inner}, which depends on the rule's own conclusion ${head}: an aggregate reads a closed relation, and its correlation is bound by a relation of the component, so no cell of it can be named before the data is known (docs/aggregates.md, "Data-level stratification, as built")`);
    }
  }

  private dsGraph(comp: DsComp): { rid: string; at: number; corr: Term[]; mk: string }[][] {
    const rules = this.rules.filter((r) => r.safe && r.clause.head.temporal !== 'next' && comp.rels.has(r.clause.head.rel));
    const owners = rules.filter((r) => comp.elems.some((e) => e[0] === r.id));
    const nodes: DsNode[] = [], ids = new Map<string, number>(), succ: number[][] = [];
    const todo: number[] = [];
    const keyOf = (n: DsNode): string => (n.k === 'p'
      ? JSON.stringify([n.rel, ...n.args.map((t) => (t === null ? null : canonTerm(t)))])
      : `a|${n.rid}|${n.at}|${listKey(n.corr)}`);
    const idOf = (n: DsNode): number => {
      const k = keyOf(n);
      let i = ids.get(k);
      if (i === undefined) { i = nodes.length; ids.set(k, i); nodes.push(n); succ.push([]); todo.push(i); }
      return i;
    };
    for (const r of owners) {
      const out: DsNode[] = [];
      this.dsWalk(comp, r.id, r.plan, new Map(), out);
      for (const n of out) idOf(n);
    }
    while (todo.length > 0) {
      const i = todo.pop()!;
      const n = nodes[i];
      const out: DsNode[] = [];
      if (n.k === 'p') {
        for (const r of rules.filter((x) => x.clause.head.rel === n.rel)) {
          if (r.clause.head.args.length !== n.args.length) continue;
          let s: Subst | null = new Map();
          r.clause.head.args.forEach((a, j) => { const t = n.args[j]; if (t !== null && s !== null) s = unify(a, t, s); });
          if (s !== null) this.dsWalk(comp, r.id, r.plan, s, out);
        }
      } else {
        const r = this.ruleOf(n.rid);
        const a = r?.plan.find((b) => b.t === 'agg' && b.at === n.at) as AggElem | undefined;
        if (!a) throw new Bug('a correlation of no element');
        const plan = this.aggPlans.get(`${n.rid}|${n.at}`);
        if (!plan) throw new Bug('a correlation with no plan');
        const s = this.dsBind(a, plan, n.corr);
        const inner = plan.innerOrder.map((ix) => a.body[ix]);
        if (s !== null) this.dsWalk(comp, n.rid, inner, s, out);
      }
      const row: number[] = [];
      for (const m of out) { const j = idOf(m); if (!row.includes(j)) row.push(j); }
      succ[i] = row;
    }
    const n = nodes.length;
    const compOf = tarjan(succ);
    const size = new Map<number, number>();
    for (const c of compOf) size.set(c, (size.get(c) ?? 0) + 1);
    const isAgg = (i: number): boolean => nodes[i].k === 'a';
    // a cycle through a correlation is a cycle in the data
    const bad: number[] = [];
    for (let i = 0; i < n; i++) if (isAgg(i) && (size.get(compOf[i])! > 1 || succ[i].includes(i))) bad.push(i);
    if (bad.length > 0) {
      const text = (i: number): string => this.dsNodeText(nodes[i]);
      bad.sort((x, y) => cmpStr(text(x), text(y)));
      throw new Rejected(this.dsCycle(comp, nodes, succ, compOf, bad[0]));
    }
    // a layer is one more than the greatest reached without passing another correlation
    const ncomp = n === 0 ? 0 : Math.max(...compOf) + 1;
    const members: number[][] = Array.from({ length: ncomp }, () => []);
    for (let i = 0; i < n; i++) members[compOf[i]].push(i);
    const depth: number[] = new Array(ncomp).fill(0);
    for (let c = 0; c < ncomp; c++) {
      let d = 0;
      for (const i of members[c]) for (const j of succ[i]) {
        const k = compOf[j];
        if (k !== c) d = Math.max(d, depth[k] + (isAgg(j) ? 1 : 0));
      }
      depth[c] = d;
    }
    const layers: { rid: string; at: number; corr: Term[]; mk: string }[][] = [];
    // every correlation the walk met is released, a group the rule binds as well as the rule's own
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      if (nd.k !== 'a') continue;
      const d = depth[compOf[i]];
      while (layers.length <= d) layers.push([]);
      layers[d].push({ rid: nd.rid, at: nd.at, corr: nd.corr, mk: `${nd.rid}|${nd.at}|${listKey(nd.corr)}` });
    }
    for (const l of layers) l.sort((x, y) => cmpStr(x.rid, y.rid) || x.at - y.at || cmpStr(tupleText(x.corr), tupleText(y.corr)));
    return layers;
  }

  /** The refusal of a cycle: the old sentence, then the cycle as the data makes it, from the correlation named. */
  private dsCycle(comp: DsComp, nodes: DsNode[], succ: number[][], compOf: number[], at: number): string {
    const nd = nodes[at];
    if (nd.k !== 'a') throw new Bug('a cycle named by a pattern');
    const [head, op, inner] = this.dsElement(nd.rid, nd.at, comp);
    const text = (i: number): string => this.dsNodeText(nodes[i]);
    // the shortest way back, by edges in canonical order
    const prev = new Map<number, number>();
    const queue: number[] = [at];
    let last = at;
    bfs: while (queue.length > 0) {
      const x = queue.shift()!;
      const next = succ[x].filter((y) => compOf[y] === compOf[at]).sort((p, q) => cmpStr(text(p), text(q)));
      for (const y of next) {
        if (y === at) { last = x; break bfs; }
        if (!prev.has(y)) { prev.set(y, x); queue.push(y); }
      }
    }
    const path = [last];
    while (prev.has(path[path.length - 1])) path.push(prev.get(path[path.length - 1])!);
    path.reverse();
    const names = path.map(text);
    names.push(text(at));
    return `program rejected: ${op} in rule ${nd.rid} reads ${inner}, which depends on the rule's own conclusion ${head}: an aggregate reads a closed relation; in the data the cell reads itself: ${names.join(' -> ')}`;
  }

  /** Which of `body` is read next under `s`: a premise outside the component first, for it binds what the patterns after
   *  it name; then a builtin that can be decided; then the first, in the rule's plan. */
  private dsPick(comp: DsComp, body: BodyElem[], s: Subst): number {
    const closed = body.findIndex((b) => b.t === 'pos' && !comp.rels.has(b.lit.rel));
    if (closed >= 0) return closed;
    const bi = body.findIndex((b) => b.t === 'bi' && this.dsDecides(b.op, b.l, b.r, s));
    return bi >= 0 ? bi : 0;
  }

  /** The nodes the rest of `body` reads under `s`, pushed to `out`. */
  private dsWalk(comp: DsComp, rid: string, body: BodyElem[], s: Subst, out: DsNode[]): void {
    if (body.length === 0) return;
    const at = this.dsPick(comp, body, s);
    const b = body[at], rest = [...body.slice(0, at), ...body.slice(at + 1)];
    if (b.t === 'pos' && comp.rels.has(b.lit.rel)) {
      out.push({ k: 'p', rel: b.lit.rel, args: b.lit.args.map((a) => { const t = resolve(a, s); return isGround(t) ? t : null; }) });
      this.dsWalk(comp, rid, rest, s, out);
    } else if (b.t === 'pos' && this.demandRels.some(([d]) => d === b.lit.rel)) {
      // a relation read on demand is unfolded at the call, which the walk must not do: it binds nothing
      this.dsWalk(comp, rid, rest, s, out);
    } else if (b.t === 'pos') {
      for (const [s2] of this.matchPremise(b.lit, s, 0, null)) this.dsWalk(comp, rid, rest, s2, out);
    } else if (b.t === 'neg' && comp.rels.has(b.lit.rel)) {
      // a negation of what the component concludes reads it as a premise does: the cell waits for it
      out.push({ k: 'p', rel: b.lit.rel, args: b.lit.args.map((a) => { const t = resolve(a, s); return isGround(t) ? t : null; }) });
      this.dsWalk(comp, rid, rest, s, out);
    } else if (b.t === 'neg') {
      this.dsWalk(comp, rid, rest, s, out);
    } else if (b.t === 'bi') {
      for (const s2 of this.dsBuiltin(b.op, b.l, b.r, s)) this.dsWalk(comp, rid, rest, s2, out);
    } else if (b.op === 'at_least') {
      this.dsWalk(comp, rid, b.body, s, out);
      this.dsWalk(comp, rid, rest, s, out);
    } else {
      if (this.dsElems.has(`${rid}|${b.at}`)) {
        const plan = this.aggPlans.get(`${rid}|${b.at}`);
        if (!plan) throw new Bug('an aggregate with no plan');
        const corr: Term[] = [];
        for (const i of plan.corr) {
          const t = resolve(mkv(b.shared![i]), s);
          if (!isGround(t)) throw new DsUnkeyed(rid, b.at!);
          corr.push(t);
        }
        // a group the rule binds is a correlation of its own, any other is the whole
        for (const i of plan.group) {
          const t = resolve(mkv(b.shared![i]), s);
          corr.push(isGround(t) ? t : DS_ANY);
        }
        out.push({ k: 'a', rid, at: b.at!, corr });
      } else if (!litsOf(b).some((l) => comp.rels.has(l.rel))) {
        // an aggregate over closed relations only binds what the rest of the rule is keyed by
        for (const s2 of this.dsAggClosed(rid, b, s)) this.dsWalk(comp, rid, rest, s2, out);
        return;
      }
      this.dsWalk(comp, rid, rest, s, out);
    }
  }

  /** The solutions of an aggregate that reads closed relations only, under `s`, none of it kept. Nothing is bound when its
   *  correlation is not yet. */
  private dsAggClosed(rid: string, a: AggElem, s: Subst): Subst[] {
    const plan = this.aggPlans.get(`${rid}|${a.at}`);
    if (!plan) throw new Bug('an aggregate with no plan');
    for (const i of plan.corr) if (!isGround(resolve(mkv(a.shared![i]), s))) return [s];
    const saved: [number, number, number, string | null, number, string | null, string | null] =
      [this.steps, this.rows, this.peakRows, this.fault, this.faultCount, this.lastFault, this.lastFaultRule];
    try { return this.aggPremise(rid, a, s, 0, false).map(([s2]) => s2); } finally {
      [this.steps, this.rows, this.peakRows, this.fault, this.faultCount, this.lastFault, this.lastFaultRule] = saved;
    }
  }

  /** A builtin the walk can decide, decided: what it cannot, because a value of the component stands in it, holds. A
   *  fault it makes is no fault of the evaluation. */
  private dsBuiltin(op: string, l: Term, r: Term, s: Subst): Subst[] {
    if (!this.dsDecides(op, l, r, s)) return [s];
    const saved: [number, string | null, number, string | null, string | null] = [this.steps, this.fault, this.faultCount, this.lastFault, this.lastFaultRule];
    try { return this.evalBuiltins(op, l, r, s, null); } finally { [this.steps, this.fault, this.faultCount, this.lastFault, this.lastFaultRule] = saved; }
  }

  /** Whether the operands a builtin needs are known under `s`. */
  private dsDecides(op: string, l: Term, r: Term, s: Subst): boolean {
    const gl = isGround(resolve(l, s)), gr = isGround(resolve(r, s));
    return op === 'is' || op === 'in' ? gr : op === '=' ? true : gl && gr;
  }

  /** THE SHRUG MODEL, set up for one evaluation. */
  private shrugReset(): void {
    this.wallSpent = null;
    this.store.removeMany(this.relAll('shrug'));
    this.metaQueue = [];
    this.metaLate = null;
    this.unkEdges = [];
    this.carrySrc = null;
    this.holesNow = [];
    this.holesMet.clear();
    this.lastFaultRule = null;
    this.unknownStrict = [];
    this.wfsWritten.clear();
    const un = IFACE.unknown, sh = 'shrug';
    this.shrugSnap = null;
    this.cycleGroups = [];
    this.cycleOf.clear();
    // a relation answered on demand whose rules read shrug, directly or through another, unfolds that read into each rule that reads it
    const via = new Set([sh]);
    for (let grew = true; grew;) {
      grew = false;
      for (const [rel, rs] of this.demandRels) {
        if (!via.has(rel) && rs.some((r) => r.clause.body.flatMap(litsOf).some((l) => via.has(l.rel)))) { via.add(rel); grew = true; }
      }
    }
    this.shrugReaders = new Set(this.rules.filter((r) => r.clause.body.flatMap(litsOf).some((l) => via.has(l.rel))).map((r) => r.id));
    const cone = new Set<string>();
    for (const r of this.rules) {
      if (this.shrugReaders.has(r.id)) cone.add(r.clause.head.rel);
      for (const b of r.clause.body) {
        const strict = b.t === 'neg' || (b.t === 'agg' && b.op !== 'at_least');
        for (const l of litsOf(b)) {
          if (l.rel === un) {
            cone.add(r.clause.head.rel);
            if (strict) this.unknownStrict.push(l);
          }
        }
      }
    }
    this.readsUnknown = this.rules.some((r) => r.clause.body.flatMap(litsOf).some((l) => l.rel === un));
    if (this.shrugReaders.size > 0 && this.store.add(V.edb, MAIN, [mka(sh)], F_BASE)) this.rows++;
    if (this.readsUnknown && this.store.add(V.edb, MAIN, [mka(un)], F_BASE)) this.rows++;
    for (;;) {
      const more = this.rules.filter((r) => !cone.has(r.clause.head.rel)).filter((r) => r.clause.body.flatMap(litsOf).some((l) => cone.has(l.rel)))
        .map((r) => r.clause.head.rel);
      if (more.length === 0) break;
      for (const m of more) cone.add(m);
    }
    this.unknownCone = cone;
  }

  /** `unknown(A)` for an unknown A. */
  private metaOf(u: Unknown): Unknown {
    if (u.k === 'tuple') return uTuple(IFACE.unknown, u.persp, [atomTerm(u.rel, u.args)]);
    if (u.k === 'cell') {
      const n = this.lattices.get(u.ck.rel)?.[0] ?? u.ck.key.length + 1;
      const a = [...u.ck.key];
      while (a.length < Math.max(n, u.ck.key.length + 1)) a.push(UNKNOWN_VALUE);
      return uTuple(IFACE.unknown, u.ck.persp, [atomTerm(u.ck.rel, a)]);
    }
    return uRel(IFACE.unknown);
  }

  /** The `unknown(A)` shrugs of what was noted since the last call. */
  private takeMetas(level: Unknown[]): void {
    const q = this.metaQueue;
    this.metaQueue = [];
    for (const [m, from] of q) {
      if (this.metaLate === null && this.unknownCone.has(uRelOf(from))) {
        if (this.unknownStrict.some((l) => this.unknownBinds(l, m, new Map()) !== null)) this.metaLate = this.unknownText(from);
      }
      this.unkEdges.push([nUnk(m), nUnk(from)]);
      if (this.noteUnknown(m, null) && !this.unknownHolds(m)) {
        this.latPlain.add(m.id);
        if (!this.latSpread.has(m.id)) { this.latSpread.add(m.id); level.push(m); }
      }
    }
  }

  private ruleMarker(rule: string): Term { return mkf(RULE_HOLE, [mka(rule)]); }

  /** `u` is left out by the fault a builtin just met, in the rule it met it in. */
  private faultEdge(u: Unknown): void {
    if (this.lastFaultRule !== null) this.unkEdges.push([nUnk(u), nHole(this.ruleMarker(this.lastFaultRule))]);
  }

  private chargeHoleRow(): void {
    this.rows++;
    if (this.rows > this.peakRows) this.peakRows = this.rows;
  }

  private holeMet(target: Term, cause: string): boolean {
    const k = canonTerm(target) + '|' + cause;
    const fresh = !this.holesMet.has(k);
    this.holesMet.add(k);
    this.holesNow.push([target, cause]);
    if (cause === 'support_withdrawn') {
      if (this.carrySrc !== null) this.unkEdges.push([nHole(target), this.carrySrc]);
      for (const src of this.carryMore) this.unkEdges.push([nHole(target), src]);
    }
    return fresh;
  }

  /** THE SHRUG ROWS, written after every evaluation from what it met. */
  /** `cut`: a wall fell, so the rows are not final and what moved since the
   *  readers fired is the wall's, which its hole already says; no reader is
   *  refused over it. */
  private writeShrugs(cut: boolean): void {
    if (this.metaLate !== null) {
      const what = this.metaLate;
      this.metaLate = null;
      throw new Rejected(`program rejected: unknown is read under not or in an aggregate of ${what}, which itself reads unknown`,
        'a shrug of a relation that reads unknown arrives after its readers fired; read it positively, or from a world above');
    }
    const rows = this.shrugRows();
    const snap = cut ? null : this.shrugSnap;
    this.shrugSnap = null;
    if (snap !== null) {
      const readers = this.rules.filter((r) => this.shrugReaders.has(r.id));
      const now = new Set(rows.map(rowKey));
      const moved: Term[][] = rows.filter((r) => !snap.has(rowKey(r)));
      const gone = [...snap].filter((k) => !now.has(k)).sort(cmpStr).map((k) => this.snapRows.get(k)!);
      moved.push(...gone);
      for (const row of moved) {
        let readable = false;
        for (const r of readers) {
          r.plan.forEach((b, i) => {
            if (b.t !== 'pos' && b.t !== 'neg') return;
            if (b.lit.rel !== 'shrug' || b.lit.args.length !== 3) return;
            let s0: Subst | null = new Map();
            for (let j = 0; j < 3 && s0; j++) s0 = unify(b.lit.args[j], row[j], s0);
            if (s0 && this.poisonSolve(r, i, s0).length > 0) readable = true;
          });
        }
        if (readable) {
          const what = now.has(rowKey(row)) ? 'leaves without an answer' : 'answers after it read the shrug';
          throw new Rejected(`program rejected: shrug is read of ${canonTerm(row[0])}, which a rule that reads shrug ${what}`,
            'a rule reading shrug fires once the rest is settled; what it changes has no row it could have read');
        }
      }
    }
    this.putShrugs(rows);
  }
  private snapRows = new Map<string, Term[]>();

  /** The rows as they stand, written for the rules that read them. */
  private shrugSnapshot(): void {
    const rows = this.shrugRows();
    this.shrugSnap = new Set(rows.map(rowKey));
    this.snapRows = new Map(rows.map((r) => [rowKey(r), r]));
    this.putShrugs(rows);
  }

  private putShrugs(rows: Term[][]): void {
    this.store.removeMany(this.relAll('shrug'));
    for (const args of rows) this.store.add('shrug', KERNEL_PERSP, args, F_BASE_TICK);
  }

  /** A PARADOX IS A ROOT TOO: what a hole left out that rests on an atom the
   *  alternation left undefined names it. */
  private paradoxEdges(): void {
    if (this.latUnknown.size === 0) return;
    const targetOf = new Map<string, Term>();
    const byRel = new Map<string, Unknown[]>();
    for (const f of this.store.relAll(IFACE.unknown)) {
      const a = f.args;
      if (a.length !== 1) continue;
      let rel: string, args: Term[];
      if (a[0].k === 'f') { rel = a[0].name; args = a[0].args; } else if (a[0].k === 'a') { rel = a[0].name; args = []; } else continue;
      const target = f.persp === MAIN ? a[0] : mkf('in', [mka(f.persp), a[0]]);
      const u = uTuple(rel, f.persp, args);
      let e = byRel.get(rel);
      if (!e) { e = []; byRel.set(rel, e); }
      e.push(u);
      targetOf.set(u.id, target);
    }
    if (targetOf.size === 0) return;
    const carried = [...this.latUnknown.values()].map(([u]) => u)
      .filter((u) => u.k === 'tuple' && u.rel !== IFACE.unknown && !this.unknownHolds(u))
      .map((u): [string, Unknown] => [this.unknownText(u), u]).sort((a, b) => cmpStr(a[0], b[0]));
    const saved: [number, number, [number, number]] = [this.carrySteps, this.carryRows, this.carryWall];
    this.carryWall = [Infinity, Infinity];
    this.undefAtoms = byRel;
    try {
      for (const [, u] of carried) {
        for (const r of this.rules.filter((r) => r.safe && r.clause.head.rel === uRelOf(u) && r.clause.head.temporal !== 'next')) {
          const s0 = this.unknownBinds(r.clause.head, u, new Map());
          if (s0 === null) continue;
          for (const sol of this.poisonSolvePlan(r.plan, r.latticeOuter, Infinity, s0)) {
            for (const b of r.plan) {
              if (b.t !== 'pos' && b.t !== 'neg') continue;
              const lu = this.litUnknown(b.lit, sol);
              const t = targetOf.get(lu.id);
              if (t !== undefined) this.unkEdges.push([nUnk(u), nHole(t)]);
            }
          }
        }
      }
    } finally {
      this.undefAtoms = null;
      [this.carrySteps, this.carryRows, this.carryWall] = saved;
    }
  }

  /** Does `l` under `s` read an atom the alternation left undefined? */
  private readsUndefined(l: Lit, s: Subst): boolean {
    if (this.undefAtoms === null || !this.undefAtoms.has(l.rel)) return false;
    const lu = this.litUnknown(l, s);
    return this.undefAtoms.get(l.rel)!.some((u) => u.id === lu.id);
  }

  /** The shrug rows of what this evaluation met so far. */
  private shrugRows(): Term[][] {
    const edges0 = this.unkEdges.length;
    let err: unknown = null;
    try { this.paradoxEdges(); } catch (e) { err = e; }
    const rs = this.rootSets();
    this.unkEdges.length = edges0;
    if (err !== null) throw err;
    const rows: Term[][] = [];
    const inherited = mka('inherited');
    const roots = (n: Node): Term => mkf('from', [list(rs.of(n))]);
    const seenHoles = new Set<string>();
    const holes: [Term, string][] = this.holesNow.filter(([t, c]) => {
      const k = canonTerm(t) + '|' + c;
      if (seenHoles.has(k)) return false;
      seenHoles.add(k);
      return true;
    });
    for (const f of this.store.relPersp(V.hole, KERNEL_PERSP)) {
      const c = f.args[1];
      if (c === undefined || c.k !== 'a') continue;
      const k = canonTerm(f.args[0]) + '|' + c.name;
      if (reasonOf(c.name) === 'federation' && !seenHoles.has(k)) { seenHoles.add(k); holes.push([f.args[0], c.name]); }
    }
    for (const [target, cause] of holes) {
      const reason = reasonOf(cause);
      if (reason === undefined) throw new Bug(`the hole cause ${cause} is not declared in shrug.rofl`);
      let meta: Term;
      if (reason === 'inherited') {
        const node = nHole(target);
        if (target.k === 'f' && target.name === '$next' && !rs.hasParents(node)) {
          const t = target.args[2]?.k === 'i' ? Number(target.args[2].v) : 0;
          meta = mkf('earlier', [mki(t - 1)]);
        } else if (target.k === 'f' && target.name === '$below') meta = mka('below');
        else meta = roots(node);
      } else if (reason === 'budget' && cause === 'regions_capped') {
        meta = mkf('spent', [mka('regions'), mki(this.regionsCapped.get(canonTerm(target)) ?? 0), mki(LABEL_REGIONS)]);
      } else if (reason === 'budget') {
        const [kind, spent, limit] = this.wallSpent ?? (cause === 'space_exhausted' ? ['rows', this.space + 1, this.space] : ['steps', this.budget + 1, this.budget]);
        meta = mkf('spent', [mka(kind), mki(spent), mki(Math.min(limit, 2 ** 59 - 1))]);
      } else if (reason === 'divergence') {
        const g = this.cycleOf.get(canonTerm(target));
        meta = mkf('cycle', [list(g !== undefined ? this.cycleGroups[g] : [target])]);
      } else if (reason === 'widened') {
        const w = this.widenedMarks.get(canonTerm(target));
        if (!w) throw new Bug(`the widened hole ${this.shown(target)} kept no value`);
        meta = mkf('within', [w[0]]);
      } else if (reason === 'conflict') {
        const ps0 = this.conflictMarks.get(canonTerm(target));
        if (!ps0) throw new Bug(`the conflict hole ${this.shown(target)} kept no parties`);
        const ps = [...ps0].sort((a, b) => cmpStr(this.shown(a), this.shown(b)));
        const dedup = ps.filter((t, i) => i === 0 || !teq(t, ps[i - 1]));
        meta = mkf('parties', [list(dedup)]);
      } else if (reason === 'federation') {
        meta = mkf('at', [target.k === 'f' && target.args.length > 0 ? target.args[0] : target]);
      } else meta = mka(cause);
      rows.push([target, mka(reason), meta]);
    }
    const unks = [...this.latUnknown.values()].map(([u]) => u).filter((u) => !this.unknownHolds(u))
      .map((u): [string, Unknown] => [this.unknownText(u), u]).sort((a, b) => cmpStr(a[0], b[0]));
    for (const [, u] of unks) rows.push([this.shrugTarget(u), inherited, roots(nUnk(u))]);
    const undefined_ = this.store.relAll(IFACE.unknown);
    if (undefined_.length > 0) {
      let negCycles: NegCycles | null = null;
      let fedBelow: Set<string> | null = null;
      const paradox = mka('paradox');
      for (const f of undefined_) {
        const a = f.args;
        if (a.length !== 1) continue;
        const rel = a[0].k === 'f' ? a[0].name : a[0].k === 'a' ? a[0].name : null;
        if (rel === null) continue;
        const target = f.persp === MAIN ? a[0] : mkf('in', [mka(f.persp), a[0]]);
        const fed = f.base && (fedBelow ??= this.assertedBelow()).has(canonTerm(factTerm(IFACE.unknown, f.persp, a)));
        // asserted or concluded by a book of its own, and no alternation left it undefined: the book's word, not a paradox
        if (!fed && !this.wfsWritten.has(f.key)) { rows.push([target, mka('given'), mka(f.base ? 'stated' : 'concluded')]); continue; }
        let meta: Term;
        if (fed) meta = mka('below');
        else meta = mkf('cycle', [list((negCycles ??= this.negativeCycles()).of(rel).map(mka))]);
        rows.push([target, paradox, meta]);
      }
    }
    const paradoxT = new Set(rows.filter((r) => r[1].k === 'a' && (r[1].name === 'paradox' || r[1].name === 'given')).map((r) => canonTerm(r[0])));
    const seen = new Set<string>();
    return rows.filter((r) => {
      const k = rowKey(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return !(r[1].k === 'a' && r[1].name === 'inherited' && paradoxT.has(canonTerm(r[0])));
    });
  }

  /** THE ROOTS OF EVERY NODE AT ONCE: the carry's edges condensed into their components. */
  private rootSets(): RootSets {
    const index = new Map<string, number>();
    const nodes: Node[] = [];
    const parents: number[][] = [];
    const id = (n: Node): number => {
      let i = index.get(n.id);
      if (i === undefined) { i = nodes.length; index.set(n.id, i); nodes.push(n); parents.push([]); }
      return i;
    };
    for (const [c, p] of this.unkEdges) { const ci = id(c), pi = id(p); parents[ci].push(pi); }
    const comp = tarjan(parents);
    const ncomp = comp.length === 0 ? 0 : Math.max(...comp) + 1;
    const members: number[][] = Array.from({ length: ncomp }, () => []);
    comp.forEach((c, v) => members[c].push(v));
    const begun = new Set(this.holesNow.filter(([, c]) => c !== 'support_withdrawn').map(([t]) => canonTerm(t)));
    const sets: number[][] = [];
    members.forEach((ms, c) => {
      let roots: number[] = [];
      if (ms.length === 1 && parents[ms[0]].length === 0) {
        if (nodes[ms[0]].k === 'hole') roots.push(ms[0]);
      } else {
        for (const m of ms) for (const q of parents[m]) if (comp[q] !== c) roots.push(...sets[comp[q]]);
        roots = [...new Set(roots)].sort((a, b) => a - b);
        // a cycle nothing outside reached is self-supporting: its roots are the holes that began it (a fault), or failing those every hole it holds
        if (roots.length === 0) {
          const holes = ms.filter((m) => nodes[m].k === 'hole');
          const began = holes.filter((m) => begun.has(canonTerm((nodes[m] as { t: Term }).t)));
          roots = began.length > 0 ? began : holes;
        }
      }
      sets.push(roots);
    });
    const text = new Map<number, string>();
    for (const r of sets.flat()) { const n = nodes[r]; text.set(r, n.k === 'hole' ? canonTerm(n.t) : ''); }
    return new RootSets(index, nodes, parents, comp, sets, text);
  }

  /** An unknown as the target of its shrug row. */
  private shrugTarget(u: Unknown): Term {
    let rel: string, p: string, args: Term[];
    if (u.k === 'tuple') { rel = u.rel; p = u.persp; args = u.args; }
    else if (u.k === 'cell') {
      const n = this.lattices.get(u.ck.rel)?.[0] ?? u.ck.key.length + 1;
      args = [...u.ck.key];
      while (args.length < Math.max(n, u.ck.key.length + 1)) args.push(UNKNOWN_VALUE);
      rel = u.ck.rel; p = u.ck.persp;
    } else return mkf('every', [mka(u.rel)]);
    const at = atomTerm(rel, args);
    return p === MAIN ? at : mkf('in', [mka(p), at]);
  }

  /** The facts the world below fed this one, as `asserted_by` names them. */
  private assertedBelow(): Set<string> {
    const out = new Set<string>();
    for (const f of this.store.relPersp(V.asserted_by, KERNEL_PERSP)) {
      if (f.args.length === 3 && f.args[1].k === 'a' && f.args[1].name === 'below') out.add(canonTerm(f.args[0]));
    }
    return out;
  }

  /** THE NEGATIVE CYCLES of the rules' dependency graph. */
  private negativeCycles(): NegCycles {
    const idx = new Map<string, number>();
    const rels: string[] = [];
    const succ: number[][] = [];
    const neg: [number, number][] = [];
    const id = (r: string): number => {
      let i = idx.get(r);
      if (i === undefined) { i = rels.length; idx.set(r, i); rels.push(r); succ.push([]); }
      return i;
    };
    for (const r of this.rules) {
      const h = id(r.clause.head.rel);
      for (const b of r.clause.body) {
        let lits: [Lit, boolean][], strict: boolean;
        if (b.t === 'pos') { lits = [[b.lit, false]]; strict = false; }
        else if (b.t === 'neg') { lits = [[b.lit, true]]; strict = true; }
        else if (b.t === 'bi') continue;
        else {
          strict = b.op !== 'at_least';
          lits = b.body.flatMap((e) => litsOf(e).map((l): [Lit, boolean] => [l, e.t === 'neg']));
        }
        for (const [l, n] of lits) {
          const t = id(l.rel);
          succ[h].push(t);
          if (n || strict) neg.push([h, t]);
        }
      }
    }
    const comp = tarjan(succ);
    const negc = new Set<number>();
    for (const [h, t] of neg) if (comp[h] === comp[t]) negc.add(comp[h]);
    return new NegCycles(idx, rels, succ, comp, negc);
  }

  /** The world hole a wall writes. */
  private wallHole(reason: string): void {
    const why = reason === BUDGET_REASON ? BUDGET_REASON : SPACE_REASON;
    this.holeMet(this.holeId, why);
    // A PLAIN PROGRAM'S WALL HOLE IS DELIBERATELY NOT NOTED: this host evaluates on every load and names each load's wall
    // (hole($load(1), ...), hole($load(2), ...)), and budget_wall pins both
    const isNew = this.plain ? this.put(V.hole, KERNEL_PERSP, [this.holeId, mka(why)], F_BASE_FROZEN)[0] : this.evalHole([this.holeId, mka(why)]);
    if (isNew) this.chargeRow(null, false);
  }

  /** A RULE WHOSE AGGREGATE safety.rofl REFUSED IS A PROGRAM REJECTED. */
  private refuseAggregates(): void {
    const first = this.answer.aggRefused[0];
    if (first !== undefined) {
      const [rid, why] = first;
      let rel: string | null = null;
      if (why === 'reads_live_kernel') {
        const r = this.ruleOf(rid);
        if (r) {
          for (const l of r.clause.body.filter((b) => b.t === 'agg').flatMap(litsOf)) {
            if (['derived_by', 'hole', 'agg_cell', 'agg_member', 'agg_member_prem', 'agg_sealed'].includes(l.rel)) { rel = l.rel; break; }
          }
        }
      }
      throw new Rejected(`program rejected: rule ${rid}: ${aggRefusalText(why, rel)}`);
    }
    for (const r of this.rules) {
      if ((r.hasAgg || r.hasThr) && this.answer.demandRels.includes(r.clause.head.rel)) {
        throw new Rejected(`program rejected: rule ${r.id}: ${aggRefusalText('demand_head', null)}`);
      }
    }
  }

  // ------------------------------------------------------------ the tick

  ensure(): boolean {
    if (!this.store.dirty) return this.store.partialEval;
    return this.run().partial;
  }

  /** The staged next-tick facts in canonical key order. */
  stagedSorted(): [string, StagedFact][] {
    return [...this.staged.values()].map((f): [string, StagedFact] => [factKey(f.rel, f.persp, f.args), f]).sort((a, b) => cmpStr(a[0], b[0]));
  }

  private clearDerived(plan: ReusePlan = noReuse()): void {
    this.store.clearDerived(plan.hits.size === 0 ? undefined : (rec) => reusedRec(plan.hits, rec), (rec, w) => factKey(V.derived_by, KERNEL_PERSP, [factTerm(rec.rel, rec.persp, rec.args), mka(w.ruleId), mki(w.tick)]));
  }

  /** The predicate `advanceTick` prunes the frozen layer with, or none. */
  private frozenRetention(staged: [string, StagedFact][]): ((rec: FactRec) => boolean) | undefined {
    const n = this.retainTicks;
    if (n === undefined || this.answer.readsProvenance) return undefined;
    const oldest = this.store.tick + 1 - n;
    const cited = this.citedPast(staged);
    return (rec: FactRec) => {
      if (rec.rel !== V.derived_by) return true;
      const t = rec.args[2];
      if (t === undefined || t.k !== 'i') return true;
      const ti = Number(t.v);
      return ti >= oldest || cited.has(canonTerm(rec.args[0]) + '@' + ti);
    };
  }

  /** The facts, each with the tick it was read in, that something crossing the boundary cites from a past tick. */
  private citedPast(staged: [string, StagedFact][]): Set<string> {
    const now = this.store.tick;
    const firings: [string, string, number, PremRef[]][] = staged.map(([, f]) => [f.rel, f.rule, now + 1, f.prems]);
    for (const rec of this.store.allFacts()) {
      if (rec.scope === 'tick') continue;
      for (const w of this.store.firingList(rec.key).reverse()) firings.push([rec.rel, w.ruleId, w.tick, w.prems]);
    }
    const read = new Map<string, [string, number]>();
    const walked = new Set<string>();
    this.pastWalks = 0;
    for (const [rel, rule, t, prems] of firings) {
      const stagedF = this.stagedFiring(rel, rule, t, prems);
      for (const p of prems) {
        if (p.t === 'cell' && !walked.has(p.key)) {
          walked.add(p.key);
          const c = this.store.cells.get(p.key)!;
          for (const m of c.members) {
            this.pastWalks++;
            for (const q of [m.prems, ...m.others].flat()) if (q.t === 'fact') read.set(q.key + '@' + c.tick, [q.key, c.tick]);
          }
        } else if (p.t === 'fact' && stagedF) read.set(p.key + '@' + Math.max(0, t - 1), [p.key, Math.max(0, t - 1)]);
      }
    }
    const out = new Set<string>();
    for (const [f, t] of read.values()) {
      const r = this.rec(f);
      out.add(canonTerm(factTerm(r.rel, r.persp, r.args)) + '@' + t);
    }
    return out;
  }

  /** QUIESCENCE IS A COMPARISON OF SETS. */
  private quiescent(staged: [string, StagedFact][]): boolean {
    const cur = new Set(this.store.allFacts().filter((r) => r.base && r.scope === 'tick').map((r) => r.key));
    return cur.size === staged.length && staged.every(([k]) => cur.has(k));
  }

  private quiescentUnknown(next: [Unknown, boolean][]): boolean {
    const now = new Set(this.carriedUnknowns(this.store.tick).map(([u, p]) => u.id + '|' + p));
    return now.size === next.length && next.every(([u, p]) => now.has(u.id + '|' + p));
  }

  /** `Rofl.tickAdvance`: run the current tick to fixpoint, then advance if not quiescent. */
  tickAdvance(): TickOutcome {
    if (this.ensure()) return { advanced: false, quiescent: false, partial: true };
    const staged = this.stagedSorted();
    const certain = new Set(staged.map(([k]) => k));
    const unknown: [Unknown, boolean][] = [...this.stagedUnknown.values()]
      .filter(([u]) => !(u.k === 'tuple' && certain.has(factKey(u.rel, u.persp, u.args))));
    if (this.quiescent(staged) && this.quiescentUnknown(unknown)) return { advanced: false, quiescent: true, partial: false };
    const keep = this.frozenRetention(staged);
    this.store.advanceTick(staged.map(([, f]) => ({ rel: f.rel, persp: f.persp, args: f.args })), keep);
    const t = this.store.tick;
    this.store.tickLog.push(`tick ${t}: ${staged.length === 0 ? '(empty)' : staged.map(([k]) => k).join(' ')}`);
    unknown.sort((a, b) => cmpStr(this.unknownText(a[0]), this.unknownText(b[0])));
    for (const [u, plain] of unknown) this.store.add(V.hole, KERNEL_PERSP, this.nextHole(u, plain, t), F_BASE_FROZEN);
    this.stagedUnknown.clear();
    for (const [k, f] of staged) {
      this.store.dropFirings(k);
      this.support(k, { ruleId: f.rule, tick: t, prems: f.prems });
      this.store.add(V.derived_by, KERNEL_PERSP, [factTerm(f.rel, f.persp, f.args), mka(f.rule), mki(t)], F_FROZEN);
    }
    this.staged.clear();
    this.stagedAlts.clear();
    this.store.gcCells();
    return { advanced: true, quiescent: false, partial: false };
  }

  /** Under the stock evaluator a program whose table a rule pack says cannot be ordered is refused. */
  private checkUnstratified(): void {
    const keys = this.relAll(IFACE.unstratified).sort(cmpStr);
    if (keys.length > 0) throw new Rejected(`program rejected: ${keys.join(', ')}`);
  }

  /** THE STOCK EVALUATOR SEALS AN AGGREGATE ONLY WHERE ITS TABLE SAYS WHEN. */
  private checkAggStrata(strat: Map<string, number>, stratRules: ERule[]): void {
    for (const r of stratRules.filter((r) => r.hasAgg)) {
      const head = r.clause.head.rel;
      const at = r.clause.head.temporal === 'next' ? undefined : strat.get(head);
      for (const l of r.clause.body.filter((b) => b.t === 'agg').flatMap(litsOf)) {
        if (!this.derivedRels.has(l.rel)) continue;
        const i = strat.get(l.rel);
        const ok = at !== undefined && i !== undefined ? i < at : at === undefined && i !== undefined ? r.clause.head.temporal === 'next' : false;
        if (!ok) {
          const rank = (x: number | undefined) => (x === undefined ? 'no stratum row' : `stratum ${x}`);
          throw new Rejected(`program rejected: rule ${r.id}: the stock evaluator cannot seal its aggregate: it reads ${l.rel} (${rank(i)}) for ${head} (${rank(at)}); an aggregate's relation must be ranked strictly below its head (load rules/strata.rofl, or run the default evaluator)`);
        }
      }
    }
  }

  /** THE FINAL PASS HAS NO ORDER. Every rule the table does not rank fires there, once, in
   *  canonical order, so a negation of a relation another of them derives (or a plain rule
   *  derives from what they do) reads whatever the pass had reached. An unranked aggregate is
   *  already refused by `checkAggStrata`. Relations complete before the pass stay negatable. */
  private checkUnrankedNegation(strat: Map<string, number>, stratRules: ERule[], mono: ERule[]): void {
    const last = stratRules.filter((r) => r.clause.head.temporal === 'next' || !strat.has(r.clause.head.rel));
    const derived = new Set(last.filter((r) => r.clause.head.temporal !== 'next').map((r) => r.clause.head.rel));
    for (let grew = true; grew;) {
      grew = false;
      for (const r of mono) {
        if (r.clause.head.temporal === 'next' || derived.has(r.clause.head.rel)) continue;
        if (r.clause.body.flatMap(litsOf).some((l) => derived.has(l.rel))) { derived.add(r.clause.head.rel); grew = true; }
      }
    }
    const negated = (b: BodyElem): string[] => b.t === 'neg' ? [b.lit.rel] : b.t === 'agg' ? b.body.flatMap(negated) : [];
    const clashes: string[] = [];
    for (const r of last.filter((r) => r.hasNeg)) {
      for (const n of r.clause.body.flatMap(negated)) if (derived.has(n)) clashes.push(`${r.clause.head.rel} negates ${n}`);
    }
    if (clashes.length === 0) return;
    throw new Rejected(`program rejected: ${clashes.sort(cmpStr)[0]}, and neither is ranked by stratum/2; rank them (load rules/strata.rofl, or run the default evaluator)`);
  }

  /** WHAT READS `unknown` SITS ABOVE EVERYTHING ELSE under the stock evaluator too. */
  private rankUnknownCone(strat: Map<string, number>): void {
    if (this.unknownCone.size === 0) return;
    const below = [...strat].filter(([r]) => !this.unknownCone.has(r)).map(([, n]) => n);
    let top = (below.length > 0 ? Math.max(...below) : 0) + 1;
    const unranked = this.rules.filter((r) => r.clause.head.temporal !== 'next').map((r) => r.clause.head.rel)
      .filter((r) => !this.unknownCone.has(r) && !strat.has(r));
    if (unranked.length > 0) { for (const r of unranked) strat.set(r, top); top++; }
    for (const r of this.unknownCone) strat.set(r, (strat.get(r) ?? 0) + top);
    strat.set(IFACE.unknown, top);
    strat.set('shrug', top);
  }

  /** A COUNTING TAG'S DERIVATIONS under the stock evaluator. */
  private rankCounting(strat: Map<string, number>): void {
    if (this.tags.countRel.size === 0) return;
    for (const [k, n] of strat) strat.set(k, n * 2);
    for (const [p, c] of this.tags.countRel) { const n = strat.get(p); if (n !== undefined) strat.set(c, n - 1); }
  }

  private readStrata(): Map<string, number> {
    const out = new Map<string, number>();
    for (const f of this.store.relAll(IFACE.stratum)) {
      if (f.args.length !== 2 || f.args[0].k !== 'a' || f.args[1].k !== 'i') continue;
      const n = Number(f.args[1].v), rel = f.args[0].name;
      const e = out.get(rel);
      if (e === undefined || n > e) out.set(rel, n);
    }
    return out;
  }

  // ------------------------------------------------------- the fixpoint

  private activate(rules: ERule[]): void {
    if (rules.length === 0) return;
    const sorted = [...rules].sort((a, b) => cmpStr(a.canon, b.canon));
    this.active.push(...sorted);
    this.active.sort((a, b) => cmpStr(a.canon, b.canon));
    this.fireAll(sorted);
  }

  /** `rules` fired once, whole, in canonical order, and the news propagated. */
  private fireAll(rules: ERule[]): void {
    const sorted = [...rules].sort((a, b) => cmpStr(a.canon, b.canon));
    this.curFront = newFront();
    // on a wall the batch in progress is left standing: the cut reads what it had not fired
    const outer: [ERule[], number] = [this.batch, this.batchAt];
    this.batch = sorted;
    sorted.forEach((r, i) => {
      this.batchAt = i;
      this.fireRule(r, null);
    });
    [this.batch, this.batchAt] = outer;
    const front = this.curFront;
    this.curFront = newFront();
    this.propagate(front);
    this.latticeSettle(false);
    const more = this.curFront;
    this.curFront = newFront();
    if (more.keys.size > 0) {
      this.propagate(more);
      this.latticeSettle(false);
    }
  }

  private propagate(front: Front): void {
    // on a wall the front in progress is left standing: the cut reads it
    const outer = this.liveFront;
    {
      for (;;) {
        if (this.lattices.size > 0) {
          for (const f of [...front.keys]) if (!this.alive(f)) front.keys.delete(f);
          for (const [rel, ids] of [...front.byRel]) {
            for (const f of [...ids]) if (!this.alive(f)) ids.delete(f);
            if (ids.size === 0) front.byRel.delete(rel);
          }
        }
        if (front.keys.size === 0) break;
        const cur = front;
        this.liveFront = [...cur.byRel.keys()];
        this.curFront = newFront();
        this.thrRound++;
        this.thrFresh.clear();
        for (const r of [...this.active]) {
          if (this.naive) { this.fireRule(r, null); continue; }
          if (!r.triggerRels.some((rel) => cur.byRel.has(rel))) continue;
          if (r.hasDemandPrem) { this.fireRule(r, null); continue; }
          r.plan.forEach((b, i) => {
            if (b.t !== 'pos') return;
            const keys = cur.byRel.get(b.lit.rel);
            if (!keys) return;
            this.fireRule(r, [i, keys]);
          });
          if (r.thrRels.some((rel) => cur.byRel.has(rel))) {
            this.thrFocus = this.thrFocusOf(r, cur);
            try { this.fireRule(r, null); } finally { this.thrFocus = null; }
          }
        }
        front = this.curFront;
        this.curFront = newFront();
      }
    }
    this.liveFront = outer;
  }

  /** One firing of a rule: its conclusions join the round's front, `curFront`. */
  private fireRule(r: ERule, frontAt: [number, Set<string>] | null, s0: Subst = new Map()): void {
    const wasFiring = this.firing;
    this.firing = true;
    let sols: Sol[];
    try { sols = this.solveBody(r.plan, s0, 0, frontAt, r.id); } finally { this.firing = wasFiring; }
    for (const sol of sols) {
      if (this.lattices.size > 0 && sol.prems.some((p) => p.t === 'fact' && !this.alive(p.key))) continue;
      this.conclude(r, sol, this.curFront);
    }
  }

  private conclude(r: ERule, sol: Sol, out: Front): void {
    const head = r.clause.head;
    const perspT = walk(head.persp, sol.s);
    const args = perspT.k === 'a' ? head.args.map((a) => resolve(a, sol.s)) : [];
    if (perspT.k !== 'a' || !args.every(isGround)) {
      if (!this.demandRels.some(([x]) => x === head.rel)) {
        const msg = `rule ${r.id}: non-ground or open conclusion skipped (${head.rel})`;
        if (!this.diags.includes(msg)) this.diags.push(msg);
      }
      return;
    }
    const persp = perspT.name;
    if (isKernelLedger(persp)) {
      const msg = `rule ${r.id}: conclusion into kernel ledger [${persp}] refused (${head.rel})`;
      if (!this.diags.includes(msg)) this.diags.push(msg);
      return;
    }
    if (head.temporal === 'next') {
      let rel = head.rel;
      for (const [c, l] of this.carried) if (l === head.rel) { rel = c; break; }
      const k = this.fkey(rel, persp, args);
      const had = this.staged.get(k);
      if (had === undefined) {
        this.staged.set(k, { rel, persp, args, rule: r.id, prems: sol.prems });
        this.bumpSteps();
        this.chargeRow(r.id, true);
      } else if (this.lattices.size > 0) {
        let alts = this.stagedAlts.get(k);
        if (!alts) { alts = []; this.stagedAlts.set(k, alts); }
        const same = (ar: string, ap: PremRef[]) => ar === r.id && firingSig(ar, ap) === firingSig(r.id, sol.prems);
        if (!alts.some(([ar, ap]) => same(ar, ap)) && !same(had.rule, had.prems)) {
          alts.push([r.id, sol.prems]);
          this.bumpSteps();
        }
      }
      return;
    }
    const lat = this.lattices.get(head.rel);
    if (lat && isJoin(lat[1]) && args.length === lat[0]) {
      this.concludeJoin(r.id, head.rel, persp, args, lat[1], sol.prems, out);
      return;
    }
    let cell: LatKey | null = null;
    if (lat && args.length === lat[0]) {
      cell = lat[1] === 'subsumption' ? this.subAdmit(head.rel, persp, args, r.id) : this.latticeAdmit(head.rel, persp, args, lat[1], sol.prems);
      if (cell === null) return;
    }
    const [isNew, id] = this.put(head.rel, persp, args, F_TICK);
    if (cell !== null) {
      if (this.subs.has(head.rel)) {
        let front = this.subCur.get(cell.id);
        if (!front) { front = []; this.subCur.set(cell.id, front); }
        if (!front.includes(id)) front.push(id);
      } else {
        this.latCur.set(cell.id, id);
        this.latCurKey.set(cell.id, cell);
      }
    }
    const tick = this.store.tick;
    if (this.support(id, { ruleId: r.id, tick, prems: sol.prems })) {
      if (this.dsCheck) throw new Bug(`the layers of a component stratified by its data missed an instance of rule ${r.id}: it concludes ${head.rel} again, new`);
      this.bumpSteps();
      this.chargeRow(r.id, true);
      if (!this.noProvenance) {
        const [dbNew, dbid] = this.put(V.derived_by, KERNEL_PERSP, [factTerm(head.rel, persp, args), mka(r.id), mki(tick)], F_DRV);
        if (dbNew) noteFront(out, V.derived_by, dbid);
      }
    } else if (this.dsCharge) this.bumpSteps();
    if (isNew) noteFront(out, head.rel, id);
  }

  private bumpSteps(): void {
    this.steps++;
    if (this.steps > this.budget || (this.steps & 4095) === 0 && this.stop?.()) {
      this.wallSpent = ['steps', this.steps, this.budget];
      throw new Wall(BUDGET_REASON);
    }
  }

  private chargeRow(rule: string | null, enforce: boolean): void {
    this.rows++;
    if (this.rows > this.peakRows) this.peakRows = this.rows;
    if (enforce && this.rows > this.space) {
      this.wallSpent = ['rows', this.rows, this.space];
      this.arithHole(rule!, SPACE_REASON);
      throw new Wall(SPACE_REASON, rule);
    }
  }

  // --------------------------------------------------------- body solving

  private solveBody(body: BodyElem[], s0: Subst, depth: number, frontAt: [number, Set<string>] | null, ruleId: string | null): Sol[] {
    let acc: Sol[] = [{ s: s0, prems: [] }];
    let held = 0;
    try {
      for (let i = 0; i < body.length; i++) {
        const b = body[i];
        const next: Sol[] = [];
        for (const a of acc) {
          const now = this.rows + next.length;
          if (now > this.peakRows) this.peakRows = now;
          if (now > this.space) {
            this.wallSpent = ['rows', now, this.space];
            if (ruleId !== null) this.arithHole(ruleId, SPACE_REASON);
            throw new Wall(SPACE_REASON, ruleId);
          }
          if (b.t === 'pos') {
            const only = frontAt !== null && frontAt[0] === i ? frontAt[1] : null;
            const faults = this.faultCount, unknowns = this.demandUnknown;
            const found = this.matchPremise(b.lit, a.s, depth, only);
            this.demandBelow(depth, a.s, faults, unknowns);
            for (const [s2, r] of found) next.push({ s: s2, prems: [...a.prems, r] });
          } else if (b.t === 'neg') {
            const faults = this.faultCount, unknowns = this.demandUnknown;
            const holds = this.negHolds(b.lit, a.s, depth);
            const below = this.faultCount > faults || this.demandUnknown > unknowns;
            if (below && depth > 0 && this.firing) { this.demandBelow(depth, a.s, faults, unknowns); continue; }
            if (holds && this.strictNeg && this.latSpread.size > 0 && this.readUnknown(b.lit, a.s, true) !== null) continue;
            // UNFOLDED AT A CALL, a negation what a hole left unknown could decide leaves the call's head under it unknown, as a fault would
            if (holds && depth > 0 && this.firing && this.demandHeads.length > 0 && this.latSpread.size > 0) {
              const u = this.readUnknown(b.lit, a.s, true);
              if (u !== null) { this.demandUnknownAt(depth, a.s, u); continue; }
            }
            if (holds) {
              if (depth === 0 && this.firing && ruleId !== null && below) {
                const u = this.litUnknown(b.lit, a.s);
                if (this.faultCount === faults && this.demandLast !== null) this.unkEdges.push([nUnk(u), nUnk(this.demandLast)]);
                else this.faultEdge(u);
                this.latPlain.add(u.id);
                this.latUndecided.push([ruleId, i, a.s, [u]]);
                continue;
              }
              const read = this.undecidedRead(depth, ruleId, () => this.readUnknown(b.lit, a.s, true));
              this.carryCheck(0);
              if (read !== undefined && read !== null) { this.latUndecided.push([ruleId!, i, a.s, [read]]); continue; }
              next.push({ s: a.s, prems: [...a.prems, { t: 'neg', key: '' }] });
            }
          } else if (b.t === 'bi') {
            const faults = this.faultCount;
            const s2s = this.evalBuiltins(b.op, b.l, b.r, a.s, ruleId);
            for (const s2 of s2s) next.push({ s: s2, prems: [...a.prems, { t: 'bi', desc: '' }] });
            if (s2s.length === 0 && this.faultCount > faults && this.firing) {
              if (this.lattices.size > 0) this.latticeFault(ruleId, a.s, a.prems);
              if (depth === 0) this.plainFault(ruleId, a.s, b);
              this.demandFault(depth, a.s);
            }
          } else {
            if (ruleId === null) throw new Bug('an aggregate solved outside a rule');
            const rid = ruleId;
            let sols: [Subst, PremRef][];
            if (b.op === 'at_least') {
              if (depth === 0 && this.firing && this.latSpread.size > 0) {
                for (const [sg, u] of this.thrUncertain(rid, b, a.s)) this.latUndecided.push([rid, i, sg, [u]]);
                this.strictNeg = true;
                try { sols = this.thrPremise(rid, b, a.s, depth); } finally { this.strictNeg = false; }
              } else sols = this.thrPremise(rid, b, a.s, depth);
            } else {
              // what the aggregate leaves undecided is decided once per correlation, at the firing that first reads it
              // (`ReachMemo`), and read by every firing after
              const mk = `${rid}|${b.at}|${listKey(this.aggCorr(rid, b, a.s)[1])}`;
              // a correlation of a component stratified by data is read once the layer before it has sealed
              if (this.dsElems.size > 0 && this.dsElems.has(`${rid}|${b.at}`) && !this.dsGate(mk)) continue;
              const reads = this.undecidedRead(depth, ruleId, () => true) === true;
              const memo = reads ? this.reachMemo.get(mk) : undefined;
              const ps = reads && memo === undefined ? this.aggPossibles(rid, b, a.s) : [];
              const sealing = !this.aggMemo.has(mk);
              if (sealing) this.aggReach = memo !== undefined ? memo.ps : ps;
              try { sols = this.aggPremise(rid, b, a.s, depth, true); } finally { this.aggReach = []; }
              if (reads) {
                let m = memo;
                if (m === undefined) { m = this.reachMemoOf(rid, b, a.s, mk, ps, sealing); this.reachMemo.set(mk, m); }
                this.aggReachUndecided(rid, b, a.s, i, m);
              }
              if (depth === 0 && this.firing) this.plainAggHoles(rid, b, a.s, i);
            }
            for (const [s2, pr] of sols) next.push({ s: s2, prems: [...a.prems, pr] });
          }
        }
        const grew = next.length - (i === 0 ? 0 : acc.length);
        this.rows += grew;
        held += grew;
        if (this.rows > this.peakRows) this.peakRows = this.rows;
        acc = next;
        if (acc.length === 0) break;
      }
    } finally {
      this.rows -= held;
    }
    // a body of positive premises all met in the store has nothing to record: its premises are the facts themselves
    if (body.every((b) => b.t === 'pos') && acc.every((a) => a.prems.every((p) => p.t === 'fact'))) return acc;
    return acc.map((a) => ({ s: a.s, prems: a.prems.map((p, i) => this.recordPrem(body[i], p, a.s)) }));
  }

  private recordPrem(b: BodyElem, r: PremRef, s: Subst): PremRef {
    if (b.t === 'bi') {
      const cv = canonVars([resolve(b.l, s), resolve(b.r, s)]);
      return { t: 'bi', desc: `${canonTerm(cv[0])} ${b.op} ${canonTerm(cv[1])}` };
    }
    if (b.t === 'neg') return { t: 'neg', key: this.anonLitKey(b.lit, s) };
    if (b.t === 'pos' && r.t === 'bi') return { t: 'bi', desc: `open ${this.anonLitKey(b.lit, s)}` };
    return r;
  }

  // ---------------------------------------------------------- aggregates

  /** THE AGGREGATE ELEMENT: every cell the aggregate yields under `s`, each a
   *  solution binding its group variables and its result, with the cell as
   *  its one premise. `keep = false` is whynot's: an ephemeral cell. */
  private aggPremise(rid: string, a: AggElem, s: Subst, depth: number, keep: boolean): [Subst, PremRef][] {
    const [plan, corr] = this.aggCorr(rid, a, s);
    const mk = `${rid}|${a.at}|${listKey(corr)}`;
    let cells: string[];
    const memo = this.aggMemo.get(mk);
    if (memo !== undefined && keep) cells = memo;
    else {
      const sealed = this.sealCells(rid, a, plan, s, corr, depth, keep);
      if (sealed.k === 'kept') { this.aggMemo.set(mk, sealed.cells); cells = sealed.cells; }
      else if (sealed.k === 'ephemeral') {
        const out: [Subst, PremRef][] = [];
        for (const [key, value] of sealed.cells) {
          const s2 = this.bindCell(a, plan, s, key, value);
          if (s2 !== null) out.push([s2, { t: 'bi', desc: '' }]);
        }
        return out;
      } else return [];
    }
    const out: [Subst, PremRef][] = [];
    for (const c of cells) {
      const r = this.store.cells.get(c)!;
      const s2 = this.bindCell(a, plan, s, r.keyTerms, r.value);
      if (s2 !== null) out.push([s2, { t: 'cell', key: c }]);
    }
    return out;
  }

  /** The aggregate's plan and its correlation under `s`. */
  private aggCorr(rid: string, a: AggElem, s: Subst): [AggPlan, Term[]] {
    const plan = this.aggPlans.get(`${rid}|${a.at}`);
    if (!plan) throw new Bug(`no plan for the aggregate at ${a.at} of ${rid}`);
    const corr: Term[] = [];
    for (const i of plan.corr) {
      const t = resolve(mkv(a.shared![i]), s);
      if (!isGround(t)) throw new Bug(`a correlation variable of ${rid} is not bound`);
      corr.push(t);
    }
    // A GROUP IS A CORRELATION OF ITS OWN in a component stratified by its data: a group variable `s` binds is part of
    // the key, one it does not is `_` (`dsBind`)
    if (plan.group.length > 0 && this.dsElems.has(`${rid}|${a.at}`)) {
      for (const i of plan.group) {
        const t = resolve(mkv(a.shared![i]), s);
        corr.push(isGround(t) ? t : DS_ANY);
      }
    }
    return [plan, corr];
  }

  /** `s` with the group variables bound to a cell's key, or null. */
  private bindGroup(a: AggElem, plan: AggPlan, s: Subst, key: Term[]): Subst | null {
    let s2: Subst | null = s;
    for (const i of plan.group) { s2 = unify(mkv(a.shared![i]), key[i], s2); if (s2 === null) return null; }
    return s2;
  }

  /** A cell's solution: group bound to its key and result unified with its value. */
  private bindCell(a: AggElem, plan: AggPlan, s: Subst, key: Term[], value: CellValue): Subst | null {
    if (value.k !== 'value') return null;
    const s2 = this.bindGroup(a, plan, s, key);
    return s2 === null ? null : unify(a.res, value.t, s2);
  }

  /** NO CELL AT ALL for this correlation: a hole on its cell key, or for whynot the reason. */
  private openCorrelation(rid: string, a: AggElem, corr: Term[], keep: boolean, reason: string): Sealed {
    if (!keep) return { k: 'open', reason };
    const marker = mkf('$cell', [mka(rid), mki(a.at!), mki(this.store.tick), list(corr)]);
    this.cellHole(marker, reason);
    return { k: 'kept', cells: [] };
  }

  // ---------------------------------------------------------- thresholds

  /** THE THRESHOLD ELEMENT: every group of `s` that has reached N, bound, with its cell. */
  private thrPremise(rid: string, a: AggElem, s: Subst, depth: number): [Subst, PremRef][] {
    const [plan, corr] = this.aggCorr(rid, a, s);
    const needR = this.thrNeed(rid, a, s, corr, true);
    if (needR === null) return [];
    const [need, n] = needR;
    const f = this.thrFocus?.get(`${rid}|${a.at}`);
    let touched: [ThrFocus, Term[][]] | null = null;
    if (f !== undefined && !f.wild) {
      const gs0 = f.byCorr.get(listKey(corr));
      if (gs0 === undefined) return [];
      if (gs0.every((g) => g !== null)) {
        const gs = (gs0 as Term[][]).map((g): [string, Term[]] => [tupleText(g), g]).sort((x, y) => cmpStr(x[0], y[0]));
        touched = [f, gs.filter((g, i) => i === 0 || g[0] !== gs[i - 1][0]).map((g) => g[1])];
      }
    }
    if (touched === null) return this.thrFull(rid, a, plan, s, corr, need, n, depth);
    const [focus, gs] = touched;
    const out: [Subst, PremRef][] = [];
    for (const gkey of gs) {
      const shared = this.thrShared(a, plan, corr, gkey);
      const sg = this.bindGroup(a, plan, s, shared);
      if (sg === null) continue;
      const key = [...shared, n];
      const ck = `${rid}|${a.at}|${listKey(key)}`;
      const c = this.thrCells.get(ck);
      if (c !== undefined) {
        if (this.thrFresh.has(c)) out.push([sg, { t: 'cell', key: c }]);
        continue;
      }
      const ak = `${rid}|${a.at}|${listKey(shared)}`;
      const round = this.thrRound;
      const had = this.thrAcc.get(ak);
      let grown: [Term[], ThrMember[]][][];
      if (had !== undefined && had.round === round) grown = [];
      else if (had !== undefined) grown = focus.news.map(([k, keys]) => this.thrGroups(rid, a, plan, sg, depth, true, [k, keys])[0]);
      else {
        const full = this.thrGroups(rid, a, plan, sg, depth, true, null)[0];
        this.thrAcc.set(ak, { round, members: new Map() });
        grown = [full];
      }
      const acc = this.thrAcc.get(ak);
      if (!acc) throw new Bug('a threshold group lost its members');
      acc.round = round;
      for (const g of grown.flat()) for (const m of g[1]) { const k = listKey(m.proj); if (!acc.members.has(k)) acc.members.set(k, m); }
      if (acc.members.size < need) continue;
      const ms = [...acc.members.values()].sort((x, y) => cmpStr(x.text, y.text));
      const cid = this.thrReach(rid, a, plan, s, key, need, ms);
      out.push([sg, { t: 'cell', key: cid }]);
    }
    return out;
  }

  /** The threshold solved in full under `s`: every group, every member. */
  private thrFull(rid: string, a: AggElem, plan: AggPlan, s: Subst, corr: Term[], need: number, n: Term, depth: number): [Subst, PremRef][] {
    if (plan.group.length === 0) {
      const key = [...this.thrShared(a, plan, corr, []), n];
      const c = this.thrCells.get(`${rid}|${a.at}|${listKey(key)}`);
      if (c !== undefined) return [[s, { t: 'cell', key: c }]];
    }
    const groups = this.thrGroups(rid, a, plan, s, depth, true, null)[0];
    if (groups.length === 0 && plan.group.length === 0) groups.push([[], []]);
    const out: [Subst, PremRef][] = [];
    for (const [gkey, members] of groups) {
      const key = [...this.thrShared(a, plan, corr, gkey), n];
      let c = this.thrCells.get(`${rid}|${a.at}|${listKey(key)}`);
      if (c === undefined) {
        if (members.length < need) continue;
        c = this.thrReach(rid, a, plan, s, key, need, members);
      }
      const s2 = this.bindGroup(a, plan, s, key);
      if (s2 !== null) out.push([s2, { t: 'cell', key: c }]);
    }
    return out;
  }

  /** A group reaches N: its cell, with the first N members (by text) as its provisional Quorum. */
  private thrReach(rid: string, a: AggElem, plan: AggPlan, s: Subst, key: Term[], need: number, members: ThrMember[]): string {
    const tick = this.store.tick;
    const ckey = cellKeyOf(rid, a.at!, tick, key);
    if (this.store.cells.has(ckey)) throw new Bug(`${this.aggDesc(a, s)} reached twice in one evaluation`);
    for (let i = 0; i < need; i++) this.chargeRow(rid, true);
    const named = this.bindGroup(a, plan, s, key) ?? s;
    const desc = this.aggDesc(a, named);
    const provisional = members.slice(0, need).map((m) => ({ proj: m.proj, value: mki(1), height: 0, prems: m.derivs[0]?.[1] ?? [], others: m.derivs.slice(1).map((d) => d[1]) }));
    this.store.addCell({ key: ckey, rule: rid, at: a.at!, tick, keyTerms: key, op: 'at_least', value: { k: 'value', t: mka('true') },
      height: 0, desc, members: provisional, seals: [] });
    this.thrCells.set(`${rid}|${a.at}|${listKey(key)}`, ckey);
    this.thrOpen.push([ckey, need]);
    this.thrFresh.add(ckey);
    return ckey;
  }

  /** What the round's news touched inside `r`'s thresholds. */
  private thrFocusOf(r: ERule, cur: Front): Map<string, ThrFocus> {
    const out = new Map<string, ThrFocus>();
    for (const b of r.plan) {
      if (b.t !== 'agg' || b.op !== 'at_least') continue;
      const plan = this.aggPlans.get(`${r.id}|${b.at}`);
      if (!plan) throw new Bug('a threshold with no plan');
      const f: ThrFocus = { news: [], byCorr: new Map(), wild: false };
      plan.innerOrder.forEach((i, k) => {
        const x = b.body[i];
        if (x.t !== 'pos') return;
        const keys = cur.byRel.get(x.lit.rel);
        if (!keys) return;
        f.news.push([k, new Set(keys)]);
        const probe: BodyElem[] = [{ t: 'pos', lit: x.lit }];
        for (const j of plan.innerOrder) { const y = b.body[j]; if (j !== i && y.t === 'pos') probe.push({ t: 'pos', lit: y.lit }); }
        for (const sol of this.solveBody(probe, new Map(), 1, [0, keys], null)) {
          this.bumpSteps();
          const val = (ix: number[]): Term[] | null => {
            const ts = ix.map((j) => resolve(mkv(b.shared![j]), sol.s));
            return ts.every(isGround) ? ts : null;
          };
          const c = val(plan.corr), g = val(plan.group);
          if (c === null) f.wild = true;
          else {
            const k2 = listKey(c);
            let e = f.byCorr.get(k2);
            if (!e) { e = []; f.byCorr.set(k2, e); }
            e.push(g);
          }
        }
      });
      if (f.news.length > 0) out.set(`${r.id}|${b.at}`, f);
    }
    return out;
  }

  /** N under `s`, and N as written; anything else is `agg_type_error`, a hole. */
  private thrNeed(rid: string, a: AggElem, s: Subst, corr: Term[], keep: boolean): [number, Term] | null {
    const n = resolve(a.res, s);
    if (n.k === 'i') { const k = BigInt(n.v); return [k > 0n ? Number(k) : 0, n]; }
    this.openCorrelation(rid, a, [...corr, n], keep, 'agg_type_error');
    return null;
  }

  /** A THRESHOLD UNDER EVERY COMPLETION of what holes left out: per group, the
   *  certain members and how many it could have at most (null: not known). */
  private thrVerdicts(rid: string, a: AggElem, s0: Subst): [Subst, Set<string>, number | null, number][] {
    const plan = this.aggPlans.get(`${rid}|${a.at}`);
    if (!plan) return [];
    const nt = resolve(a.res, s0);
    if (nt.k !== 'i') return [];
    const n = BigInt(nt.v) > 0n ? Number(nt.v) : 0;
    const inner = plan.innerOrder.map((i) => a.body[i]);
    const outer = [...this.lattices.keys()];
    let base: Subst = new Map();
    for (const v of a.shared!) {
      const t = resolve(mkv(v), s0);
      if (isGround(t)) { const b = unify(mkv(v), t, base); if (b) base = b; }
    }
    const strict = this.strictNeg, firing = this.firing;
    this.strictNeg = true; this.firing = false;
    let known: Sol[];
    try { known = this.solveBody(inner, base, 1, null, null); } finally { this.strictNeg = strict; this.firing = firing; }
    const possible = this.poisonSolvePlan(inner, outer, Infinity, base);
    const shared = a.shared!.map(mkv);
    type Group = [string, Subst, Set<string>, Set<string> | null];
    const groups: Group[] = [];
    const at = (g: Term[]): number => {
      const k = listKey(g);
      const p = groups.findIndex((x) => x[0] === k);
      if (p >= 0) return p;
      let sg = base;
      a.shared!.forEach((v, i) => { const s2 = unify(mkv(v), g[i], sg); if (s2) sg = s2; });
      groups.push([k, sg, new Set(), new Set()]);
      return groups.length - 1;
    };
    for (const sol of known) {
      const g = shared.map((t) => resolve(t, sol.s));
      const proj = a.vals.map((t) => resolve(t, sol.s));
      groups[at(g)][2].add(listKey(proj));
    }
    let allOpen = false;
    for (const ps of possible) {
      const g = shared.map((t) => resolve(t, ps));
      const proj = a.vals.map((t) => resolve(t, ps));
      const open = (ts: Term[]) => ts.some((t) => !isGround(t) || holdsUnknown(t));
      if (open(g)) { allOpen = true; continue; }
      const wide = open(proj);
      const k = at(g);
      if (wide) groups[k][3] = null;
      else groups[k][3]?.add(listKey(proj));
    }
    if (allOpen) for (const x of groups) x[3] = null;
    else if (groups.length === 0) groups.push(['', base, new Set(), new Set()]);
    return groups.map(([, sg, kn, pos]) => {
      let upper: number | null = null;
      if (pos !== null) { const u = new Set(pos); for (const x of kn) u.add(x); upper = u.size; }
      return [sg, kn, upper, n];
    });
  }

  /** Is the threshold decided short under `s`, whatever the unknowns are? */
  private thrShort(rid: string, a: AggElem, s: Subst): boolean {
    const vs = this.thrVerdicts(rid, a, s);
    return vs.length > 0 && vs.every(([, known, upper, n]) => known.size < n && upper !== null && upper < n);
  }

  /** The groups under `s` a negation's unknown leaves neither reached nor short, with every unknown that could decide it. */
  private thrUncertain(rid: string, a: AggElem, s: Subst): [Subst, Unknown][] {
    if (!a.body.some((b) => b.t === 'neg' && this.latUnknownRel.has(b.lit.rel))) return [];
    const out: [Subst, Unknown][] = [];
    for (const [sg, known, upper, n] of this.thrVerdicts(rid, a, s)) {
      if (known.size >= n || (upper !== null && upper < n)) continue;
      for (const u of this.thrMemberUnknowns(rid, a, sg, known, true)) out.push([sg, u]);
    }
    return out;
  }

  /** Every unknown the undecided groups under `s` rest on. */
  private thrOpenUnknowns(rid: string, a: AggElem, s: Subst): Unknown[] {
    const out: Unknown[] = [];
    for (const [sg, known, upper, n] of this.thrVerdicts(rid, a, s)) {
      if (known.size >= n || (upper !== null && upper < n)) continue;
      for (const u of this.thrMemberUnknowns(rid, a, sg, known, false)) if (!out.some((x) => x.id === u.id)) out.push(u);
    }
    return out;
  }

  /** The unknowns the possible members of `sg` that are not `known` read. */
  private thrMemberUnknowns(rid: string, a: AggElem, sg: Subst, known: Set<string>, negsOnly: boolean): Unknown[] {
    const plan = this.aggPlans.get(`${rid}|${a.at}`);
    if (!plan) return [];
    const inner = plan.innerOrder.map((i) => a.body[i]);
    const outer = [...this.lattices.keys()];
    const out: Unknown[] = [];
    for (const ps of this.poisonSolvePlan(inner, outer, Infinity, sg)) {
      const proj = a.vals.map((t) => resolve(t, ps));
      if (known.has(listKey(proj))) continue;
      for (const b of inner) {
        let l: Lit, neg: boolean;
        if (b.t === 'neg') { l = b.lit; neg = true; } else if (b.t === 'pos' && !negsOnly) { l = b.lit; neg = false; } else continue;
        for (const u of this.unknownCands(l, ps)) {
          const spread = this.latSpread.has(u.id) || (!neg && this.latUnknown.has(u.id) && u.k !== 'tuple');
          if (spread && !out.some((x) => x.id === u.id) && this.unknownBinds(l, u, ps) !== null) out.push(u);
        }
      }
    }
    return out;
  }

  /** Every shared variable's value, in `shared` order. */
  private thrShared(a: AggElem, plan: AggPlan, corr: Term[], gkey: Term[]): Term[] {
    const key: Term[] = a.shared!.map(() => mki(0));
    plan.corr.forEach((i, n) => { key[i] = corr[n]; });
    plan.group.forEach((i, n) => { key[i] = gkey[n]; });
    return key;
  }

  /** The members of a threshold under `s`, by group, in key order. */
  private thrGroups(rid: string, a: AggElem, plan: AggPlan, s: Subst, depth: number, keep: boolean,
    frontAt: [number, Set<string>] | null): [[Term[], ThrMember[]][], string | null] {
    const [cands, dropped] = this.innerCands(rid, a, plan, s, depth, keep, frontAt, false);
    const groups: [Term[], ThrMember[]][] = [];
    for (const [group, cs] of cands) {
      const pidx = new Map<string, number>();
      const ms: ThrMember[] = [];
      for (const c of cs) {
        const pk = listKey(c.proj);
        let j = pidx.get(pk);
        if (j === undefined) { j = ms.length; pidx.set(pk, j); ms.push({ proj: c.proj, text: tupleText(c.proj), derivs: [] }); }
        ms[j].derivs.push([c.sig, c.prems]);
      }
      for (const m of ms) {
        m.derivs.sort((x, y) => cmpStr(x[0], y[0]));
        m.derivs = m.derivs.filter((d, i) => i === 0 || d[0] !== m.derivs[i - 1][0]);
      }
      ms.sort((x, y) => cmpStr(x.text, y.text));
      groups.push([group, ms]);
    }
    const keyed = groups.map((g): [string, [Term[], ThrMember[]]] => [tupleText(g[0]), g]).sort((x, y) => cmpStr(x[0], y[0]));
    return [keyed.map((x) => x[1]), dropped];
  }

  /** THE INNER BODY SOLVED, for every aggregate: one `Cand` per solution,
   *  grouped, groups in the order first seen, and the reason a member was
   *  lost for an error or left open. */
  private innerCands(rid: string, a: AggElem, plan: AggPlan, s: Subst, depth: number, keep: boolean,
    frontAt: [number, Set<string>] | null, hole: boolean): [[Term[], Cand[]][], string | null] {
    const inner = plan.innerOrder.map((i) => a.body[i]);
    const outer = this.fault;
    this.fault = null;
    let sols: Sol[];
    let fault: string | null;
    try {
      sols = this.solveBody(inner, s, depth + 1, frontAt, keep ? rid : null);
    } finally {
      fault = this.fault;
      this.fault = hole ? (outer ?? fault) : outer;
    }
    if (hole && fault !== null) return [[], fault];
    const back = new Array<number>(plan.innerOrder.length).fill(0);
    plan.innerOrder.forEach((i, k) => { back[i] = k; });
    const groups: [Term[], Cand[]][] = [];
    const gidx = new Map<string, number>();
    for (const sol of sols) {
      if (keep) { this.bumpSteps(); if (hole) this.chargeRow(rid, true); }
      const group = plan.group.map((i) => resolve(mkv(a.shared![i]), sol.s));
      const proj = plainKeys(a, [...a.vals.slice(aggParams(a)).map((t) => resolve(t, sol.s)), ...a.keys.map((t) => resolve(t, sol.s))]);
      if (![...group, ...proj].every(isGround)) {
        fault ??= 'agg_open_member';
        if (hole) return [[], fault];
        continue;
      }
      const prems = back.map((k) => sol.prems[k]);
      const sig = prems.map((p) => this.premText(p)).sort(cmpStr).join('; ');
      const gk = listKey(group);
      let g = gidx.get(gk);
      if (g === undefined) { g = groups.length; gidx.set(gk, g); groups.push([group, []]); }
      groups[g][1].push({ proj, prems, sig });
    }
    return [groups, fault];
  }

  /** CLOSE THE QUORUMS whose conclusion and input are closed before level `lv`. */
  private closeThresholdsBelow(lv: number, thenPropagate: boolean): void {
    if (this.thrOpen.length === 0) return;
    const closed = (rel: string) => { const r = this.roundOf.get(rel); return r !== undefined ? r < lv : !this.derivedRels.has(rel); };
    const due: [string, number][] = [], rest: [string, number][] = [];
    for (const [c, need] of [...this.thrOpen]) {
      const cr = this.store.cells.get(c)!;
      const plan = this.aggPlans.get(`${cr.rule}|${cr.at}`);
      if (!plan) throw new Bug('a quorum with no plan');
      const head = this.ruleOf(cr.rule)?.clause.head.rel;
      const ok = lv === Infinity || (head !== undefined && closed(head) && plan.rels.every(closed));
      (ok ? due : rest).push([c, need]);
    }
    if (due.length === 0) return;
    const all: ThrMember[][] = [];
    for (const [c] of due) {
      const r = this.store.cells.get(c)!;
      const er = this.ruleOf(r.rule);
      if (!er) throw new Bug("a quorum's rule is gone");
      const a = er.clause.body[r.at - 1];
      if (a === undefined || a.t !== 'agg') throw new Bug("a quorum's owner is no threshold");
      const plan = this.aggPlans.get(`${r.rule}|${r.at}`)!;
      let sub: Subst | null = new Map();
      a.shared!.forEach((v, i) => { sub = sub && unify(mkv(v), r.keyTerms[i], sub); });
      if (sub === null) throw new Bug("a quorum's key does not bind");
      const [groups] = this.thrGroups(r.rule, a, plan, sub, 0, true, null);
      all.push(groups[0]?.[1] ?? []);
    }
    const forbidden = new Set(rest.map((x) => x[0]));
    const prems = all.map((ms) => ms.map((m) => m.derivs.map((d) => d[1])));
    this.heightMemo.clear();
    const hs = this.quorumHeights(due, prems, forbidden, this.heightMemo);
    due.forEach(([c, need], i) => {
      const found: [number, number, number][] = [];
      all[i].forEach((_, j) => { const h = hs[i][j]; if (h !== null) found.push([j, h[0], h[1]]); });
      const pick = quorum(found.map(([j, h]) => [h, all[i][j].text]), need);
      if (pick === null) throw new Bug(`${this.store.cells.get(c)!.desc} was reached and has fewer than ${need} founded members when it closes`);
      const members = pick.map((k) => {
        const [j, h, d] = found[k];
        const m = all[i][j];
        return { proj: m.proj, value: mki(1), height: h, prems: m.derivs[d][1], others: m.derivs.filter((_, e) => e !== d).map((x) => x[1]) };
      });
      const height = members.reduce((x, m) => Math.max(x, m.height), 0);
      const cr = this.store.cells.get(c)!;
      cr.members = members;
      cr.height = height;
      this.reflectCell(c);
    });
    this.thrOpen = rest;
    if (thenPropagate) {
      const front = this.curFront;
      this.curFront = newFront();
      if (front.keys.size > 0) { this.propagate(front); this.latticeSettle(false); }
    }
  }

  /** Solve the inner body, bucket into groups and members, fold, and seal a cell per group. */
  private sealCells(rid: string, a: AggElem, plan: AggPlan, s: Subst, corr: Term[], depth: number, keep: boolean): Sealed {
    const op = plan.op;
    if (rankTuple(a) ? a.keys.length !== a.vals.length : a.vals.length <= opParams(op)) throw new Bug(`safety.rofl let ${op} through with no value after its first term`);
    const reach = keep ? this.aggReach : [];
    this.aggReach = [];
    const share = keep && reach.length === 0 ? this.holShareKey(rid, a, plan, corr) : null;
    const sh = share !== null ? this.holShared.get(share) : undefined;
    if (sh !== undefined) {
      if (sh.k === 'open') {
        this.aggOpened.add(`${rid}|${a.at}|${listKey(corr)}`);
        return this.openCorrelation(rid, a, corr, keep, sh.reason);
      }
      return this.sealShared(rid, a, plan, s, corr, sh.groups);
    }
    const [found, fault] = this.innerCands(rid, a, plan, s, depth, keep, null, true);
    if (fault !== null) {
      if (keep) this.aggOpened.add(`${rid}|${a.at}|${listKey(corr)}`);
      if (share !== null) this.holShared.set(share, { k: 'open', reason: fault });
      return this.openCorrelation(rid, a, corr, keep, fault);
    }
    const cands: Cand[] = [];
    const groups: [Term[], number[]][] = [];
    for (const [g, cs] of found) {
      groups.push([g, cs.map((_, i) => cands.length + i)]);
      cands.push(...cs);
    }
    const values = cands.map((c) => (op === 'count' ? mki(1) : c.proj[0]));
    if (groups.length === 0 && plan.group.length === 0) groups.push([[], []]);
    // A GROUP ONLY AN UNKNOWN COULD MAKE is a group of its own, with no member known
    const fresh: Term[][] = [];
    const had = new Set(groups.map(([x]) => listKey(x)));
    for (const p of reach) {
      if (p.pat.some((t) => t === null)) continue;
      const g = p.pat as Term[];
      const k = listKey(g);
      if (!had.has(k)) { had.add(k); fresh.push(g); }
    }
    fresh.sort((x, y) => cmpStr(tupleText(x), tupleText(y)));
    for (const g of fresh) groups.push([g, []]);
    // a group a narrower correlation of the element sealed already is its cell, listed here and not sealed again (`dsBind`)
    const reuse: string[] = [];
    if (keep && plan.group.length > 0 && this.dsElems.has(`${rid}|${a.at}`)) {
      for (let j = groups.length - 1; j >= 0; j--) {
        const ck = cellKeyOf(rid, a.at!, this.store.tick, this.thrShared(a, plan, corr, groups[j][0]));
        if (this.store.cells.has(ck)) { reuse.push(ck); groups.splice(j, 1); }
      }
    }
    const reached = new Map<number, Unknown[]>();
    const decided = new Map<number, string>();
    const conds = new Map<number, Term>();
    const capped = new Map<number, number>();
    const index = new PossIndex(reach);
    if (plan.emptyZero && plan.group.length > 0) throw new Bug('safety.rofl says empty-zero for a grouping aggregate');
    const dedup = dedupByProjection(op);
    const sealed: [Term[], CellRecNew][] = [];
    const sorts: [Term[], Sorted | string][] = [];
    for (const [gkey, idxs] of groups) {
      let reps: number[];
      const alts = new Map<number, number[]>();
      if (dedup) {
        const byProj = new Map<string, number>();
        const all = new Map<string, number[]>();
        for (const i of idxs) {
          const id = listKey(cands[i].proj);
          const j = byProj.get(id);
          if (j === undefined || cands[j].sig > cands[i].sig) byProj.set(id, i);
          (all.get(id) ?? all.set(id, []).get(id)!).push(i);
        }
        for (const [id, rep] of byProj) {
          const rest = all.get(id)!.filter((i) => cands[i].sig !== cands[rep].sig).sort((x, y) => cmpStr(cands[x].sig, cands[y].sig));
          alts.set(rep, rest.filter((i, e) => e === 0 || cands[i].sig !== cands[rest[e - 1]].sig));
        }
        reps = [...byProj.values()];
      } else {
        const bySig = new Map<string, number>();
        for (const i of idxs) if (!bySig.has(cands[i].sig)) bySig.set(cands[i].sig, i);
        reps = [...bySig.values()];
      }
      const hs = reps.map((i) => this.memberHeight(cands[i].prems));
      const keys = reps.map((i) => (dedup ? tupleText(cands[i].proj) : cands[i].sig));
      const order = reps.map((_, i) => i).sort((x, y) => hs[x] - hs[y] || cmpStr(keys[x], keys[y]));
      // A RANK OVER A TUPLE lists its members in the tuple's own order
      const rk = rankTuple(a);
      const rdesc = rk ? a.keys.map((t) => keyDir(t)[0]) : [];
      const katoms = rk ? reps.map((i) => atomsOr(cands[i].proj)) : [];
      if (rk && katoms.every((x) => typeof x !== 'string')) {
        order.sort((x, y) => rankCmp(rdesc, katoms[x] as KeyAtom[], katoms[y] as KeyAtom[]) || hs[x] - hs[y] || cmpStr(keys[x], keys[y]));
      }
      let acc: Val | null = null;
      let kept: number[] = [];
      let poison: string | null = null;
      const holistic = opClass(op) === 'holistic';
      if (holistic && rk) {
        const subject = atomsOr(a.vals.map((t) => resolve(t, s)));
        const bad = katoms.find((x) => typeof x === 'string') as string | undefined;
        const sorted: Sorted | string = bad !== undefined ? bad : sortedOfKeys(rdesc, katoms as KeyAtom[][]);
        if (typeof sorted === 'string') poison = sorted;
        else if (typeof subject === 'string') poison = subject;
        else acc = rankOf(sorted, subject);
        sorts.push([gkey, sorted]);
        kept = [...order];
      } else if (holistic) {
        let param: Val | null | string = null;
        if (opParams(op) !== 0) { const p = resolve(a.vals[0], s); param = p.k === 'i' ? { k: 'int', v: BigInt(p.v) } : 'agg_type_error'; }
        let sorted: Sorted | string;
        try { sorted = sortedOf(order.map((o) => lift(op, values[reps[o]]))); } catch (e) { if (!(e instanceof Refused)) throw e; sorted = e.reason; }
        if (typeof sorted === 'string') poison = sorted;
        else if (typeof param === 'string') poison = param;
        else { try { acc = holisticSorted(op, param, sorted); } catch (e) { if (!(e instanceof Refused)) throw e; poison = e.reason; } }
        sorts.push([gkey, sorted]);
        kept = [...order];
      } else {
        for (const o of order) {
          let x: Val;
          try { x = lift(op, values[reps[o]]); } catch (e) { if (!(e instanceof Refused)) throw e; poison = e.reason; break; }
          let st;
          try { st = insert(op, acc, x); } catch (e) { if (!(e instanceof Refused)) throw e; poison = e.reason; break; }
          if (st.k === 'improved') {
            acc = st.x;
            if (opClass(op) === 'idempotent_order') kept = [];
            kept.push(o);
          } else if (opClass(op) === 'invertible' || st.k === 'tied') kept.push(o);
        }
      }
      if (poison === null) { try { acc = finish(acc); } catch (e) { if (!(e instanceof Refused)) throw e; poison = e.reason; } }
      let value: CellValue;
      if (poison !== null) value = { k: 'hole', reason: poison };
      else if (acc !== null) value = { k: 'value', t: lower(acc) };
      else if (plan.emptyZero) value = { k: 'value', t: lower(opIdentity(op)!) };
      else value = { k: 'empty' };
      if (poison !== null) kept = [...order];
      // DECIDED UNDER EVERY COMPLETION, or a hole on this group alone
      if (reach.length > 0) {
        const mine = index.at(gkey);
        const us = this.reachOf(op, this.aggParam(a, s), this.rankKey(a, s), reps.map((i) => cands[i].proj), reps.map((i) => values[i]), value, mine);
        if (us.length > 0) {
          // where every unknown it rests on is a label and exists for certain, the group is decided by what each
          // value the labels could be gives it ("Labeled unknowns")
          const rg = this.rankKey(a, s) === null && (value.k === 'value' || value.k === 'empty') ? regionDecide(op, aggParams(a), gkey, reps.map((i) => cands[i].proj), reps.map((i) => values[i]), mine) : { k: 'no' as const };
          if (rg.k === 'decided') { value = { k: 'value', t: rg.v }; decided.set(sealed.length, rg.by); }
          else if (rg.k === 'cond') { value = { k: 'hole', reason: 'support_withdrawn' }; kept = [...order]; conds.set(sealed.length, rg.t); reached.set(sealed.length, us); }
          else if (rg.k === 'capped') { value = { k: 'hole', reason: 'regions_capped' }; kept = [...order]; capped.set(sealed.length, rg.n); }
          else { value = { k: 'hole', reason: 'support_withdrawn' }; kept = [...order]; reached.set(sealed.length, us); }
        }
      }
      const members: CellMemberNew[] = [];
      let height = 0;
      for (const o of kept) {
        const c = cands[reps[o]];
        height = Math.max(height, hs[o]);
        members.push({ proj: c.proj, value: values[reps[o]], height: hs[o], prems: c.prems, others: (alts.get(reps[o]) ?? []).map((i) => cands[i].prems) });
      }
      const key = this.thrShared(a, plan, corr, gkey);
      const seals: { rel: string; round: number }[] = [];
      for (const r of plan.rels) {
        const round = this.roundOf.get(r);
        if (round === undefined && this.derivedRels.has(r)) throw new Bug(`${r} is derived and has no round to be sealed at`);
        seals.push({ rel: r, round: round ?? 0 });
      }
      sealed.push([key, { rule: rid, at: a.at!, op, keyTerms: key, value, height, tick: this.store.tick, desc: this.aggDesc(a, s), members, seals }]);
    }
    if (!keep) return { k: 'ephemeral', cells: sealed.map(([k, c]) => [k, c.value, c.members.length]) };
    const ids: string[] = [];
    const carried: [Node | null, Node[]] = [this.carrySrc, this.carryMore];
    sealed.forEach(([, c], n) => {
      const ckey = cellKeyOf(c.rule, c.at, c.tick, c.keyTerms);
      if (this.store.cells.has(ckey)) throw new Bug(`${c.desc} sealed twice in one evaluation`);
      this.store.addCell({ key: ckey, ...c });
      const us = reached.get(n);
      [this.carrySrc, this.carryMore] = us === undefined ? [null, []] : [nUnk(us[0]), us.slice(1).map(nUnk)];
      if (c.value.k === 'hole') {
        const marker = cellMarker(c.rule, c.at, c.tick, c.keyTerms);
        this.cellHole(marker, c.value.reason);
        const k = capped.get(n);
        if (k !== undefined) this.regionsCapped.set(canonTerm(marker), k);
      }
      [this.carrySrc, this.carryMore] = [null, []];
      this.reflectCell(ckey);
      if (us !== undefined) this.cellReach.set(ckey, us);
      else if (decided.has(n)) { this.cellReach.set(ckey, []); this.cellDecided.set(ckey, decided.get(n)!); }
      const cd = conds.get(n);
      if (cd !== undefined) this.cellCond.set(ckey, cd);
      ids.push(ckey);
    });
    // a possible whose group is not known could make a group of any key it leaves open: a hole on the correlation
    const open: Unknown[] = [];
    for (const p of reach) if (p.pat.some((t) => t === null) && !labeledOpen(p) && !open.some((u) => u.id === p.u.id)) open.push(p.u);
    if (open.length > 0) {
      [this.carrySrc, this.carryMore] = [nUnk(open[0]), open.slice(1).map(nUnk)];
      this.openCorrelation(rid, a, corr, true, 'support_withdrawn');
    }
    [this.carrySrc, this.carryMore] = carried;
    if (share !== null) this.holShared.set(share, { k: 'groups', groups: sorts.map(([g, x], i): [Term[], string, Sorted | string] => [g, ids[i], x]) });
    ids.push(...reuse);
    return this.keyedCells(ids);
  }

  /** THE PERCENT OR SUBJECT OF A HOLISTIC AGGREGATE IS NO MEMBER: shared key. */
  private holShareKey(rid: string, a: AggElem, plan: AggPlan, corr: Term[]): string | null {
    if (opClass(plan.op) !== 'holistic' || opParams(plan.op) === 0) return null;
    const subject = a.vals.slice(0, aggParams(a));
    const names: string[] = [];
    for (const p of subject) { if (p.k !== 'v') return null; names.push(p.name); }
    const inner = new Set<string>();
    for (const t of [...a.vals.slice(aggParams(a)), ...a.keys]) varsOf(t, inner);
    for (const b of a.body) elemVars(b, inner);
    if (names.some((n) => inner.has(n))) return null;
    const ats = names.map((n) => plan.corr.findIndex((i) => a.shared![i] === n));
    if (ats.some((at) => at < 0)) return null;
    return `${rid}|${a.at}|${listKey(corr.filter((_, n) => !ats.includes(n)))}`;
  }

  /** A holistic aggregate under a new percent or subject, over groups already sealed. */
  private sealShared(rid: string, a: AggElem, plan: AggPlan, s: Subst, corr: Term[], gs: [Term[], string, Sorted | string][]): Sealed {
    const param = this.aggParam(a, s) as Val | string;
    const rkey = this.rankKey(a, s);
    const desc = this.aggDesc(a, s);
    const ids: string[] = [];
    for (const [gkey, like, sorted] of gs) {
      this.bumpSteps();
      let value: CellValue;
      if (typeof sorted === 'string') value = { k: 'hole', reason: sorted };
      else if (typeof param === 'string') value = { k: 'hole', reason: param };
      else if (rkey !== null) {
        if (typeof rkey.subject === 'string') value = { k: 'hole', reason: rkey.subject };
        else { const x = rankOf(sorted, rkey.subject); value = x === null ? { k: 'empty' } : { k: 'value', t: lower(x) }; }
      } else {
        try { const x = holisticSorted(plan.op, param, sorted); value = x === null ? { k: 'empty' } : { k: 'value', t: lower(x) }; }
        catch (e) { if (!(e instanceof Refused)) throw e; value = { k: 'hole', reason: e.reason }; }
      }
      const key = this.thrShared(a, plan, corr, gkey);
      const tick = this.store.tick;
      const ckey = cellKeyOf(rid, a.at!, tick, key);
      if (this.store.cells.has(ckey)) throw new Bug(`${desc} sealed twice in one evaluation`);
      const likeRec = this.store.cells.get(like)!;
      this.store.addCell({ key: ckey, rule: rid, at: a.at!, tick, keyTerms: key, op: plan.op, value, height: likeRec.height, desc,
        members: likeRec.members, seals: [...likeRec.seals] });
      if (value.k === 'hole') this.cellHole(cellMarker(rid, a.at!, tick, key), value.reason);
      this.reflectCell(ckey);
      ids.push(ckey);
    }
    return this.keyedCells(ids);
  }

  /** Cells in cell-key order. */
  private keyedCells(ids: string[]): Sealed { return { k: 'kept', cells: [...ids].sort(cmpStr) }; }

  /** 1 + the highest fact premise's height; a negation or a builtin is 0. */
  private memberHeight(prems: PremRef[]): number {
    const roots = factPrems(prems);
    const bad = this.heights(roots, this.heightMemo, null);
    if (bad !== null) throw new Bug(`${bad} has no well-founded height`);
    let h = 0;
    for (const p of prems) {
      if (p.t === 'fact') h = Math.max(h, this.heightMemo.get(p.key)!);
      else if (p.t === 'cell') h = Math.max(h, this.store.cells.get(p.key)!.height);
    }
    return h + 1;
  }

  /** A premise as a witness line spells it. */
  private premText(p: PremRef): string { return premText(p); }

  /** Every firing of a fact, newest first, as the Rust store walks them. */
  private firings(id: string): Witness[] { return this.store.firingList(id).reverse(); }

  /** DERIVATION HEIGHT over the firing graph reachable from `roots`: a base
   *  fact or one with no firing is 0, a firing 1 + its highest premise, a
   *  fact its LOWEST firing. `skip` leaves firings out. Returns a root that
   *  never became final, or null. */
  private heights(roots: string[], memo: Map<string, number>, skip: ((f: string, rule: string, ps: PremRef[]) => boolean) | null): string | null {
    const seen = new Set<string>();
    const order: string[] = [];
    const stack = roots.filter((f) => !memo.has(f));
    while (stack.length > 0) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      order.push(f);
      for (const w of this.firings(f)) {
        if (skip && skip(f, w.ruleId, w.prems)) continue;
        for (const p of w.prems) if (p.t === 'fact' && !memo.has(p.key) && !seen.has(p.key)) stack.push(p.key);
      }
    }
    if (order.length > 0) {
      const firings: { head: string; open: number; best: number }[] = [];
      const users = new Map<string, number[]>();
      const heap = new MinHeap();
      for (const f of order) {
        const rec = this.store.recAny(f);
        const ws = this.firings(f);
        if ((rec !== undefined && rec.base) || ws.length === 0) { heap.push(0, f); continue; }
        for (const w of ws) {
          if (skip && skip(f, w.ruleId, w.prems)) continue;
          let open = 0, best = 0;
          const idx = firings.length;
          for (const p of w.prems) {
            if (p.t === 'fact') {
              const hg = memo.get(p.key);
              if (hg !== undefined) best = Math.max(best, hg);
              else { open++; let u = users.get(p.key); if (!u) { u = []; users.set(p.key, u); } u.push(idx); }
            } else if (p.t === 'cell') best = Math.max(best, this.store.cells.get(p.key)!.height);
          }
          firings.push({ head: f, open, best });
          if (open === 0) heap.push(best + 1, f);
        }
      }
      for (;;) {
        const top = heap.pop();
        if (top === null) break;
        const [hgt, f] = top;
        if (memo.has(f)) continue;
        memo.set(f, hgt);
        const us = users.get(f);
        if (us) {
          users.delete(f);
          for (const i of us) {
            const fi = firings[i];
            fi.open--;
            fi.best = Math.max(fi.best, hgt);
            if (fi.open === 0 && !memo.has(fi.head)) heap.push(fi.best + 1, fi.head);
          }
        }
      }
    }
    return roots.find((r) => !memo.has(r)) ?? null;
  }

  /** HEIGHTS WITH QUORUMS STILL OPEN: the cells of `open` are nodes of the graph. */
  private quorumHeights(open: [string, number][], members: PremRef[][][][], forbidden: Set<string>, memo: Map<string, number>): ([number, number] | null)[][] {
    const at = new Map(open.map(([c], i) => [c, i]));
    const stack: string[] = [];
    for (const ps of members.flat().flat()) for (const p of ps) if (p.t === 'fact') stack.push(p.key);
    const seen = new Set<string>();
    const order: string[] = [];
    while (stack.length > 0) {
      const f = stack.pop()!;
      if (memo.has(f) || seen.has(f)) continue;
      seen.add(f);
      order.push(f);
      for (const w of this.firings(f)) {
        for (const p of w.prems) {
          if (p.t === 'fact' && !memo.has(p.key) && !seen.has(p.key)) stack.push(p.key);
          else if (p.t === 'cell' && forbidden.has(p.key) && !at.has(p.key)) throw new Bug(`${f} rests on a quorum that is not closing with it`);
        }
      }
    }
    const firings: { head: string; open: number; best: number }[] = [];
    const users = new Map<string, number[]>();
    const heap = new MinHeap();
    const add = (head: string, ps: PremRef[]) => {
      const idx = firings.length;
      let openN = 0, best = 0;
      for (const p of ps) {
        let dep: string | null = null;
        if (p.t === 'fact') { const hg = memo.get(p.key); if (hg !== undefined) best = Math.max(best, hg); else dep = 'F' + p.key; }
        else if (p.t === 'cell') { const i = at.get(p.key); if (i !== undefined) dep = 'C' + i; else best = Math.max(best, this.store.cells.get(p.key)!.height); }
        if (dep !== null) { openN++; let u = users.get(dep); if (!u) { u = []; users.set(dep, u); } u.push(idx); }
      }
      firings.push({ head, open: openN, best });
      if (openN === 0) heap.push(best + 1, head);
    };
    for (const f of order) {
      const rec = this.store.recAny(f);
      const ws = this.firings(f);
      if ((rec !== undefined && rec.base) || ws.length === 0) { heap.push(0, 'F' + f); continue; }
      for (const w of ws) add('F' + f, w.prems);
    }
    members.forEach((ms, i) => {
      ms.forEach((ds, j) => ds.forEach((ps, k) => add(`M${i}|${j}|${k}`, ps)));
      if (open[i][1] === 0) heap.push(0, 'C' + i);
    });
    const memberH: ([number, number] | null)[][] = members.map((ms) => ms.map(() => null));
    const cellH: (number | null)[] = open.map(() => null);
    const reached = open.map(() => 0);
    for (;;) {
      const top = heap.pop();
      if (top === null) break;
      const [hgt, node] = top;
      if (node[0] === 'F') {
        const f = node.slice(1);
        if (memo.has(f)) continue;
        memo.set(f, hgt);
      } else if (node[0] === 'M') {
        const [i, j, k] = node.slice(1).split('|').map(Number);
        if (memberH[i][j] !== null) continue;
        memberH[i][j] = [hgt, k];
        reached[i]++;
        if (reached[i] === open[i][1]) heap.push(hgt, 'C' + i);
        continue;
      } else {
        const i = Number(node.slice(1));
        if (cellH[i] !== null) continue;
        cellH[i] = hgt;
      }
      const us = users.get(node);
      if (us) {
        users.delete(node);
        for (const x of us) {
          const fi = firings[x];
          fi.open--;
          fi.best = Math.max(hgt, fi.best);
          if (fi.open === 0) heap.push(fi.best + 1, fi.head);
        }
      }
    }
    return memberH;
  }

  // ------------------------------------------------------- join lattices

  /** Every LatKey made, by its id. */
  private cks = new Map<string, LatKey>();
  private lk(rel: string, persp: string, key: Term[]): LatKey {
    const ck = latKey(rel, persp, key);
    const had = this.cks.get(ck.id);
    if (had) return had;
    this.cks.set(ck.id, ck);
    return ck;
  }
  private closedAfter(rel: string, what: string): Error {
    const msg = `the ${what} ${rel} received a contribution after it closed`;
    return this.mode === 'strata' ? new Rejected(`program rejected: ${msg}: the stratum table ranks it below a relation it reads`) : new Bug(msg);
  }

  /** A CONTRIBUTION TO A JOIN CELL: a fact of `L@join` with its firing, then folded into the cell. */
  private concludeJoin(rid: string, rel: string, persp: string, args0: Term[], op: AggOp, prems: PremRef[], out: Front): void {
    const args = [...args0];
    const n = args.length;
    const ck = this.lk(rel, persp, args.slice(0, n - 1));
    if (this.latClosed.has(rel)) throw this.closedAfter(rel, 'lattice');
    let c: Term;
    try { c = joinCanon(op, args[n - 1]); } catch (e) {
      if (!(e instanceof Refused)) throw e;
      this.latPending.push({ close: rel, what: uCell(ck), rule: null, reason: e.reason, facts: factPrems(prems) });
      return;
    }
    args[n - 1] = c;
    const nr = this.narrowing;
    if (nr !== null && nr.frozen.has(ck.id)) {
      const held = nr.fresh.get(ck.id);
      let f = c;
      if (held !== undefined) { try { f = join(op, held, c); } catch { throw new Bug(`a value outside the ${op} carrier reached the join`); } }
      nr.fresh.set(ck.id, f);
      return;
    }
    const crel = this.joinRels.get(rel)!;
    const [fresh, cid] = this.put(crel, persp, args, F_TICK);
    this.recordFiring(cid, rid, rid, prems, out);
    if (!fresh) return;
    let e = this.joinContribs.get(ck.id);
    if (!e) { e = []; this.joinContribs.set(ck.id, e); }
    e.push(cid);
    this.joinFold(ck, cid, c, op, rid, out);
  }

  /** ⊔ a new contribution into its cell. */
  private joinFold(ck: LatKey, cid: string, c: Term, op: AggOp, rid: string, out: Front): void {
    const crel = this.joinRels.get(ck.rel)!;
    let nv: Term, prems: PremRef[];
    const old = this.latCur.get(ck.id);
    if (old === undefined || !this.alive(old)) { nv = c; prems = [{ t: 'fact', key: cid }]; }
    else {
      const v = this.lastArg(old);
      if (this.joinLeqE(op, c, v)) return;
      let joined: Term;
      try { joined = join(op, v, c); } catch { throw new Bug(`a value outside the ${op} carrier reached the join`); }
      nv = this.widened(ck, rid, v, c, joined);
      prems = teq(nv, c) ? [{ t: 'fact', key: cid }] : [{ t: 'fact', key: old }, { t: 'fact', key: cid }];
      this.supersede(old, ck);
      this.latImproved.push(old);
      this.latticeImprovements++;
    }
    const [isNew, id] = this.put(ck.rel, ck.persp, [...ck.key, nv], F_TICK);
    this.latCur.set(ck.id, id);
    this.latCurKey.set(ck.id, ck);
    this.recordFiring(id, crel, rid, prems, out);
    if (isNew) noteFront(out, ck.rel, id);
  }

  private lastArg(id: string): Term { const a = this.rec(id).args; return a[a.length - 1]; }

  /** THE DECLARED WIDENING of a cell improving from `old` to `joined` by `c`. */
  private widened(ck: LatKey, rid: string, old: Term, c: Term, joined: Term): Term {
    const n = this.widen.get(ck.rel);
    if (n === undefined) return joined;
    if (!this.widenRec.has(rid)) return joined;
    const steps = this.latSteps.get(ck.id) ?? 0;
    const due = steps >= n;
    this.latSteps.set(ck.id, steps + 1);
    if (!due) return joined;
    const o = ivBounds(old), j = ivBounds(joined);
    if (o === null || j === null) throw new Bug('a value outside the hull carrier reached the join');
    const w = widenIv(o, j, this.widenTh.get(ck.rel));
    const wt = mkIv(w[0], w[1]);
    if (teq(wt, joined)) return joined;
    const first = !this.latWidened.has(ck.id);
    let e = this.latWidened.get(ck.id);
    if (!e) { e = []; this.latWidened.set(ck.id, e); }
    e.push([old, c, joined, wt]);
    if (first) this.latPending.push({ close: ck.rel, what: uCell(ck), rule: null, reason: 'widening_forced', facts: [] });
    return wt;
  }

  /** THE BACK EDGES OF A WIDENING: rules into a widened relation that read its own recursion. */
  private relDeps(reads: (r: ERule) => Iterable<string> = (r) => r.clause.body.flatMap((b) => litsOf(b).map((l) => l.rel))): Map<string, Set<string>> {
    const deps = new Map<string, Set<string>>();
    for (const r of this.rules) {
      if (r.clause.head.temporal === 'next') continue;
      let e = deps.get(r.clause.head.rel);
      if (!e) { e = new Set(); deps.set(r.clause.head.rel, e); }
      for (const x of reads(r)) e.add(x);
    }
    return deps;
  }

  /** THE THRESHOLDS OF A WIDENING: every integer written in a rule of the widened relation's recursion, ascending. */
  private widenThresholds(): Map<string, bigint[]> {
    const deps = this.relDeps(), out = new Map<string, bigint[]>();
    const walk = (t: Term, into: Set<bigint>): void => { if (t.k === 'i') into.add(BigInt(t.v)); else if (t.k === 'f') for (const a of t.args) walk(a, into); };
    const elem = (b: BodyElem, into: Set<bigint>): void => {
      if (b.t === 'pos' || b.t === 'neg') for (const a of b.lit.args) walk(a, into);
      else if (b.t === 'bi') { walk(b.l, into); walk(b.r, into); }
      else for (const x of b.body) elem(x, into);
    };
    for (const h of this.widen.keys()) {
      const ints = new Set<bigint>();
      for (const r of this.rules) {
        const g = r.clause.head.rel;
        if (r.clause.head.temporal === 'next' || !(g === h || (reachesIn(deps, g, h) && reachesIn(deps, h, g)))) continue;
        for (const b of r.clause.body) elem(b, ints);
      }
      out.set(h, [...ints].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return out;
  }

  private widenBackEdges(): Set<string> {
    const deps = this.relDeps();
    const reachesTo = (from: string, to: string): boolean => reachesIn(deps, from, to);
    const out = new Set<string>();
    for (const r of this.rules) {
      const h = r.clause.head.rel;
      if (r.clause.head.temporal === 'next' || !this.widen.has(h)) continue;
      if (r.clause.body.some((b) => litsOf(b).some((l) => reachesTo(l.rel, h)))) out.add(r.id);
    }
    return out;
  }

  /** THE DESCENDING PASS. The widening settled each widened cell on a post-fixpoint x. Each pass evaluates the world again with those cells held at their values and taking no contribution, so what every rule contributes to them is computed from x alone, and stops when their lattices come to close. An end the widening raised comes down to the join of those contributions where that is inside it, never below it; the others stay. The result is still a post-fixpoint, so still an enclosure of the least value. Passes repeat until nothing moves, at most NARROW_PASSES. */
  private narrowDescend(): void {
    type Cell = { ck: LatKey; x: Term; cur: [bigint, bigint]; raised: [boolean, boolean]; steps: Term[][] };
    const cells: Cell[] = [];
    for (const [ck, x] of this.widenedX.values()) {
      const cur = ivBounds(x);
      if (cur === null) continue;
      let raised: [boolean, boolean] = [false, false];
      for (const [, , joined, wide] of this.latWidened.get(ck.id) ?? []) {
        const j = ivBounds(joined), w = ivBounds(wide);
        if (j !== null && w !== null) raised = [raised[0] || w[0] !== j[0], raised[1] || w[1] !== j[1]];
      }
      cells.push({ ck, x, cur, raised, steps: [] });
    }
    for (let pass = 0; pass < NARROW_PASSES; pass++) {
      const frozen = new Map(cells.map((c): [string, Term] => [c.ck.id, mkIv(c.cur[0], c.cur[1])]));
      this.narrowing = { frozen, fresh: new Map(), left: new Set(cells.map((c) => c.ck.rel)), keys: new Map(cells.map((c): [string, LatKey] => [c.ck.id, c.ck])), faulted: new Set() };
      let gathered = false;
      try { this.runPass(); } catch (e) {
        if (!(e instanceof Narrowed)) { this.narrowing = null; throw e; }
        gathered = true;
      }
      const got = this.narrowing;
      this.narrowing = null;
      // a wall cut the pass: what was narrowed so far stands
      if (!gathered || got === null) break;
      let moved = false;
      for (const c of cells) {
        const f = got.fresh.get(c.ck.id);
        if (f === undefined || got.faulted.has(c.ck.rel)) continue;
        const fresh = ivBounds(f);
        if (fresh === null) continue;
        const next = narrowIv(c.cur, fresh, c.raised);
        if (next[0] !== c.cur[0] || next[1] !== c.cur[1]) {
          c.steps.push([mkIv(c.cur[0], c.cur[1]), f, mkIv(next[0], next[1])]);
          c.cur = next;
          moved = true;
        }
      }
      if (!moved) break;
    }
    for (const c of cells) if (c.steps.length > 0) this.narrowOut.set(c.ck.id, [c.x, mkIv(c.cur[0], c.cur[1]), c.steps]);
  }

  /** The widened cells of a descending pass stand in the store at their values, as the cells of a lattice do, so that the rules read them. */
  private seedNarrowing(): void {
    const nr = this.narrowing;
    if (nr === null) return;
    const out = newFront();
    for (const [id, x] of nr.frozen) {
      const ck = nr.keys.get(id)!;
      const [, fid] = this.put(ck.rel, ck.persp, [...ck.key, x], F_TICK);
      this.latCur.set(ck.id, fid);
      this.latCurKey.set(ck.id, ck);
      const crel = this.joinRels.get(ck.rel)!;
      this.recordFiring(fid, crel, crel, [], out);
    }
  }

  /** A descending pass has what it came for when every relation it holds a cell of is about to close: the contributions to them are all made. A rule that faulted on the way (`E in I` over a widened `[0,inf)`) contributed nothing, and what it would have is unknown: the cells of every relation in its recursion are left as they were. */
  private narrowGathered(due: string[]): void {
    const nr = this.narrowing;
    if (nr === null) return;
    for (const p of due) nr.left.delete(p);
    if (nr.left.size > 0) return;
    const met = this.latPending.filter((x) => x.reason !== 'widening_forced').map((x) => x.close);
    if (met.length > 0) {
      const deps = this.relDeps();
      for (const p of new Set([...nr.keys.values()].map((k) => k.rel))) {
        if (met.some((c) => c === p || reachesIn(deps, p, c))) nr.faulted.add(p);
      }
    }
    throw new Narrowed();
  }

  /** One firing of `id` by `rule`, with its step, its row and its `derived_by`. */
  private recordFiring(id: string, rule: string, charge: string, prems: PremRef[], out: Front): void {
    if (!this.support(id, { ruleId: rule, tick: this.store.tick, prems })) return;
    this.bumpSteps();
    this.chargeRow(charge, true);
    this.noteDerivedBy(id, rule, out);
  }

  /** The `derived_by` row of a firing of `id` by `rule` at this tick. */
  private noteDerivedBy(id: string, rule: string, out: Front): void {
    if (this.noProvenance) return;
    const rec = this.rec(id);
    const [isNew, dbid] = this.put(V.derived_by, KERNEL_PERSP, [factTerm(rec.rel, rec.persp, rec.args), mka(rule), mki(this.store.tick)], F_DRV);
    if (isNew) noteFront(out, V.derived_by, dbid);
  }

  /** Did every rule that contributed `x` from a superseded value contribute at least as much from values that stand? */
  private joinRefired(l: string, x: string): boolean {
    if (this.joinChecked.has(x)) return true;
    const rec = this.rec(x);
    const n = rec.args.length;
    const op = this.lattices.get(l)![1], cx = rec.args[n - 1];
    const ck = this.lk(l, rec.persp, rec.args.slice(0, n - 1));
    let open = [...new Set(this.firings(x).map((w) => w.ruleId))];
    for (const y of this.joinContributions(ck).reverse()) {
      if (open.length === 0) break;
      if (y === x) continue;
      const cy = this.lastArg(y);
      for (const w of this.firings(y)) {
        const k = open.indexOf(w.ruleId);
        if (k < 0) continue;
        if (!w.prems.some((p) => p.t === 'fact' && this.latSuperseded.has(p.key)) && this.joinLeqE(op, cx, cy)) open.splice(k, 1);
      }
    }
    if (open.length === 0) { this.joinChecked.add(x); return true; }
    open = open.filter((r) => !this.faultStands(r, ck));
    return open.length === 0;
  }

  /** Did a rule that fired `x` fault on firing again, from facts that all stand, into x's relation? */
  private faultedRefire(x: string): boolean {
    const rel = this.rec(x).rel;
    const rules = this.firings(x).map((w) => w.ruleId);
    return this.latPending.some((f) => f.rule !== null && rules.includes(f.rule) && f.what !== null && uRelOf(f.what) === rel
      && f.facts.every((g) => this.alive(g)));
  }

  /** Is a fault of `rule` pending on the cell `ck`, from a firing every fact of which stands? */
  private faultStands(rule: string, ck: LatKey): boolean {
    return this.latPending.some((x) => x.rule === rule
      && (x.what !== null && ((x.what.k === 'cell' && x.what.ck.id === ck.id) || (x.what.k === 'rel' && x.what.rel === ck.rel)))
      && x.facts.every((f) => this.alive(f)));
  }

  private joinLeqE(op: AggOp, a: Term, b: Term): boolean {
    try { return joinLeq(op, a, b); } catch { throw new Bug(`a value outside the ${op} carrier reached the join`); }
  }

  /** The contributions of a join cell that still stand. */
  private joinContributions(ck: LatKey): string[] { return (this.joinContribs.get(ck.id) ?? []).filter((f) => this.alive(f)); }

  /** What a Cover counts, of a contribution `c` to a cell holding `v`. */
  private coverAtoms(op: AggOp, c: Term, v: Term): Term[] {
    if (op === 'union') return setElems(c) ?? [];
    if (op === 'bitor') {
      const n = c.k === 'i' ? BigInt(c.v) : 0n;
      const out: Term[] = [];
      for (let b = 0; b < 60; b++) if (((n >> BigInt(b)) & 1n) === 1n) out.push(mki(b));
      return out;
    }
    const x = ivBounds(c) ?? [1n, 0n], y = ivBounds(v) ?? [0n, 0n];
    const out: Term[] = [];
    if (x[0] === y[0]) out.push(mki(0));
    if (x[1] === y[1]) out.push(mki(1));
    return out;
  }

  /** THE COVER OF EACH CELL of the closing join lattices `due`. */
  private joinCovers(due: string[]): void {
    const joins = due.filter((p) => this.joinRels.has(p)).sort(cmpStr);
    if (joins.length === 0) return;
    const cells: [string, string][] = [];
    for (const p of joins) for (const f of this.relAll(p)) cells.push([p, f]);
    cells.sort((a, b) => cmpStr(a[1], b[1]));
    const roots = cells.map((c) => c[1]);
    for (const [ckId, cs] of this.joinContribs) if (joins.includes(this.cks.get(ckId)!.rel)) roots.push(...cs.filter((f) => this.alive(f)));
    const memo = new Map<string, number>();
    this.heights(roots, memo, null);
    const plan: [string, string, string[]][] = [];
    for (const [p, f] of cells) {
      const op = this.lattices.get(p)![1], crel = this.joinRels.get(p)!;
      const rec = this.rec(f);
      const n = rec.args.length;
      const v = rec.args[n - 1];
      const ck = this.lk(p, rec.persp, rec.args.slice(0, n - 1));
      const hf = memo.get(f);
      if (hf === undefined) throw new Bug(`${f} has no well-founded height`);
      const order = this.joinContributions(ck).filter((c) => { const h = memo.get(c); return h !== undefined && h < hf; })
        .map((c): [number, string] => [memo.get(c)!, c]).sort((a, b) => a[0] - b[0] || cmpStr(a[1], b[1]));
      const want = this.coverAtoms(op, v, v);
      const count = new Map<string, number>();
      const chosen: [string, Term[]][] = [];
      if (want.length === 0 && order.length > 0) chosen.push([order[0][1], []]);
      for (const [, c] of order) {
        const cv = this.lastArg(c);
        if (!this.joinLeqE(op, cv, v)) throw new Bug(`${c} is not below its cell ${f}`);
        const atoms = this.coverAtoms(op, cv, v);
        if (want.length > 0 && atoms.some((a) => !count.has(canonTerm(a)))) {
          for (const a of atoms) count.set(canonTerm(a), (count.get(canonTerm(a)) ?? 0) + 1);
          chosen.push([c, atoms]);
        }
      }
      if (want.some((a) => !count.has(canonTerm(a))) || chosen.length === 0) throw new Bug(`${f}: the contributions below it do not join to it`);
      let i = 0;
      while (i < chosen.length && want.length > 0) {
        if (chosen[i][1].every((a) => count.get(canonTerm(a))! >= 2)) {
          for (const a of chosen[i][1]) count.set(canonTerm(a), count.get(canonTerm(a))! - 1);
          chosen.splice(i, 1);
        } else i++;
      }
      plan.push([f, crel, chosen.map(([c]) => c)]);
    }
    for (const [f, crel, cover] of plan) {
      for (const c of cover) {
        const hc = memo.get(c)!;
        for (const w of this.firings(c)) {
          const high = w.prems.some((p) => (p.t === 'fact' ? (memo.get(p.key) ?? Infinity) >= hc : p.t === 'cell' ? this.store.cells.get(p.key)!.height >= hc : false));
          if (high) {
            this.store.removeFiring(c, firingSig(w.ruleId, w.prems));
            if (!this.firings(c).some((x) => x.ruleId === w.ruleId)) this.retireDerivedBy(c, w.ruleId);
          }
        }
      }
      for (const w of this.firings(f)) this.store.removeFiring(f, firingSig(w.ruleId, w.prems));
      this.support(f, { ruleId: crel, tick: this.store.tick, prems: cover.map((c): PremRef => ({ t: 'fact', key: c })) });
      const front = newFront();
      this.noteDerivedBy(f, crel, front);
      mergeFront(this.curFront, front);
      this.heightMemo.delete(f);
    }
  }

  /** AFTER THE COVERS, what no cover and no standing fact reaches is dropped. */
  private joinGc(due: string[]): void {
    const joins = due.filter((p) => this.joinRels.has(p));
    if (joins.length === 0) return;
    const crels = new Set(joins.map((p) => this.joinRels.get(p)!));
    const nodes = new Set<string>();
    for (const [ckId, cs] of this.joinContribs) if (joins.includes(this.cks.get(ckId)!.rel)) for (const f of cs) if (this.alive(f)) nodes.add(f);
    for (const f of this.latSuperseded) if (joins.includes(this.rec(f).rel)) nodes.add(f);
    const marked = new Set<string>();
    const stack: string[] = [];
    for (const x of this.citersOf(nodes)) {
      const kept = (this.alive(x) && !crels.has(this.rec(x).rel)) || (this.latSuperseded.has(x) && !nodes.has(x));
      if (kept) stack.push(...this.factPremises(x).filter((g) => nodes.has(g)));
    }
    while (stack.length > 0) {
      const g = stack.pop()!;
      if (!marked.has(g)) { marked.add(g); stack.push(...this.factPremises(g).filter((q) => nodes.has(q))); }
    }
    const drop = [...nodes].filter((g) => !marked.has(g)).sort(cmpStr);
    for (const g of drop) {
      if (this.latSuperseded.delete(g)) this.store.dropFirings(g);
      else this.retireFact(g);
    }
    for (const [k, v] of [...this.latHistory]) {
      const kept = v.filter((f) => this.latSuperseded.has(f));
      if (kept.length === 0) this.latHistory.delete(k); else this.latHistory.set(k, kept);
    }
    for (const [k, v] of [...this.joinContribs]) {
      const kept = v.filter((f) => this.alive(f));
      if (kept.length === 0) this.joinContribs.delete(k); else this.joinContribs.set(k, kept);
    }
  }

  /** The facts with a firing that cites one of `of`, from the citer index. */
  private citersOf(of: Set<string>): string[] {
    if (!this.citers) return [];
    const out = new Set<string>();
    for (const g of of) for (const x of this.citers.get(g) ?? []) out.add(x);
    return [...out].sort(cmpStr);
  }

  /** The fact premises of every firing of `id`. */
  private factPremises(id: string): string[] { return this.firings(id).flatMap((w) => factPrems(w.prems)); }

  /** A contribution to a lattice cell: its cell to store it, null to drop it. */
  private latticeAdmit(rel: string, persp: string, args: Term[], op: AggOp, prems: PremRef[]): LatKey | null {
    const n = args.length;
    const ck = this.lk(rel, persp, args.slice(0, n - 1));
    if (this.latClosed.has(rel)) throw this.closedAfter(rel, 'lattice');
    let x: Val;
    try { x = lift(op, args[n - 1]); } catch (e) {
      if (!(e instanceof Refused)) throw e;
      this.latPending.push({ close: rel, what: uCell(ck), rule: null, reason: e.reason, facts: factPrems(prems) });
      return null;
    }
    const old = this.latCur.get(ck.id);
    if (old === undefined || !this.alive(old)) return ck;
    let ov: Val;
    try { ov = lift(op, this.rec(old).args[n - 1]); } catch { throw new Bug('a lattice cell holds a value outside its carrier'); }
    let st;
    try { st = insert(op, ov, x); } catch { throw new Bug('a lattice value in its carrier did not compare'); }
    if (st.k === 'unchanged') return null;
    if (st.k === 'tied') return ck;
    this.supersede(old, ck);
    this.latImproved.push(old);
    this.latticeImprovements++;
    return ck;
  }

  /** The length of the key of a cell of `rel` at `arity`. */
  private cellKeylen(rel: string, arity: number): number | null {
    const l = this.lattices.get(rel);
    if (!l || l[0] !== arity) return null;
    return l[1] === 'subsumption' ? this.subs.get(rel)!.keylen : l[0] - 1;
  }

  /** IS `lo` DOMINATED BY `hi`? */
  private dominated(rel: string, lo: Term[], hi: Term[]): DomV { return this.dominatedAs(rel, lo, hi, true); }

  private dominatedAs(rel: string, lo: Term[], hi: Term[], charge: boolean): DomV {
    const sub = this.subs.get(rel)!;
    let undecided: DomV | null = null;
    for (const [d, plan] of sub.doms) {
      if (charge) this.bumpSteps();
      let s: Subst | null = new Map();
      const pairs: [Term, Term][] = [...d.lo.args.map((t, i): [Term, Term] => [t, lo[i]]), ...d.hi.args.map((t, i): [Term, Term] => [t, hi[i]])];
      for (const [t, x] of pairs) { if (s === null) break; s = unify(t, x, s); }
      if (s === null) continue;
      if (this.latSpread.size > 0 || this.latPlain.size > 0) {
        for (const b of plan) {
          const neg = b.t === 'neg';
          for (const l of litsOf(b)) {
            const u = this.readUnknown(l, s, true);
            if (u !== null) {
              if (neg) return { k: 'unknown', u, rule: d.id };
              undecided ??= { k: 'unknown', u, rule: d.id };
            }
          }
        }
      }
      const saved: [string | null, number, string | null, string | null, boolean] = [this.fault, this.faultCount, this.lastFault, this.lastFaultRule, this.firing];
      this.firing = false;
      let sols: Sol[];
      let faulted: boolean, reason: string | null;
      try { sols = this.solveBody(plan, s, 0, null, null); } finally {
        faulted = this.faultCount > saved[1];
        reason = this.lastFault;
        [this.fault, this.faultCount, this.lastFault, this.lastFaultRule, this.firing] = saved;
      }
      if (sols.length > 0) return { k: 'yes', rule: d.id };
      if (faulted) undecided ??= { k: 'fault', reason: reason ?? 'arith_type_error', rule: d.id };
    }
    return undecided ?? { k: 'no' };
  }

  private subFact(rel: string, persp: string, args: Term[]): Term { return factTerm(rel, persp, args); }
  private subArgs(ck: LatKey, vals: Term[]): Term[] { return [...ck.key, ...vals]; }

  /** A CONFLICT: the cell's dominance is no strict partial order over its values. */
  private subConflict(ck: LatKey, cause: string, parties: Term[]): void {
    const known = this.subParties.has(ck.id);
    let ps = this.subParties.get(ck.id);
    if (!ps) { ps = []; this.subParties.set(ck.id, ps); }
    for (const p of parties) if (!ps.some((x) => teq(x, p))) ps.push(p);
    if (!known) this.latPending.push({ close: ck.rel, what: uCell(ck), rule: null, reason: cause, facts: [] });
  }

  /** A dominance question not answered: the cell is a hole when its relation closes. */
  private subUndecided(ck: LatKey, v: DomV): void {
    if (v.k === 'fault') this.latPending.push({ close: ck.rel, what: uCell(ck), rule: v.rule, reason: v.reason, facts: [] });
    else if (v.k === 'unknown') {
      const cu = uCell(ck);
      this.unkEdges.push([nUnk(cu), nUnk(v.u)]);
      if (!this.latUnknown.has(cu.id)) this.latUnknown.set(cu.id, [cu, [v.u, v.rule]]);
      this.latPending.push({ close: ck.rel, what: cu, rule: null, reason: 'support_withdrawn', facts: [] });
    }
  }

  /** THE INSERT OF A SUBSUMPTIVE CELL. */
  private subAdmit(rel: string, persp: string, args: Term[], rid: string): LatKey | null {
    const k = this.subs.get(rel)!.keylen;
    const ck = this.lk(rel, persp, args.slice(0, k));
    if (this.latClosed.has(rel)) {
      const msg = `the subsumptive relation ${rel} received a value after it closed`;
      throw this.mode === 'strata' ? new Rejected(`program rejected: ${msg}: the stratum table ranks it below a relation it reads`) : new Bug(msg);
    }
    const vals = args.slice(k);
    const [me, isNewVal] = this.subGiven(ck, vals);
    if (isNewVal) this.chargeRow(rid, true);
    const id = factKey(rel, persp, args);
    if (this.alive(id)) return ck;
    if (this.latSuperseded.has(id)) return null;
    const self = this.subDom(ck, [me, args], [me, args]);
    if (self.k === 'yes') {
      this.subConflict(ck, 'dominance_cycle', [this.subFact(rel, persp, args)]);
      return null;
    }
    this.subUndecided(ck, self);
    const standing = (this.subCur.get(ck.id) ?? []).filter((f) => this.alive(f)).map((s): [string, number, Term[]] => {
      const sargs = this.rec(s).args;
      return [s, this.subSeenSet.get(`${ck.id}|${listKey(sargs.slice(k))}`)!, sargs];
    });
    for (const [, si, sargs] of standing) {
      if (this.subDom(ck, [me, args], [si, sargs]).k === 'yes') {
        const bk = `${ck.id}|${listKey(vals)}`;
        if (!this.subBeaten.has(bk)) this.subBeaten.set(bk, sargs.slice(k));
        return null;
      }
    }
    for (const [s, si, sargs] of standing) {
      if (this.subDom(ck, [si, sargs], [me, args]).k === 'yes') {
        const bk = `${ck.id}|${listKey(sargs.slice(k))}`;
        if (!this.subBeaten.has(bk)) this.subBeaten.set(bk, vals);
        this.supersede(s, ck);
        this.latImproved.push(s);
        this.latticeImprovements++;
      }
    }
    const front = this.subCur.get(ck.id);
    if (front) this.subCur.set(ck.id, front.filter((f) => this.alive(f)));
    return ck;
  }

  /** Note a value given to a cell: its place in `subSeen`, and whether it is new. */
  private subGiven(ck: LatKey, vals: Term[]): [number, boolean] {
    const sv = `${ck.id}|${listKey(vals)}`;
    const i = this.subSeenSet.get(sv);
    if (i !== undefined) return [i, false];
    let seen = this.subSeen.get(ck.id);
    if (!seen) { seen = []; this.subSeen.set(ck.id, seen); }
    const n = seen.length;
    seen.push(vals);
    this.subSeenSet.set(sv, n);
    return [n, true];
  }

  /** `dominated` over two values of one cell, asked once an evaluation. */
  private subDom(ck: LatKey, lo: [number, Term[]], hi: [number, Term[]]): DomV {
    const m = this.subMemo.get(ck.id);
    const mk = `${lo[0]}|${hi[0]}`;
    const had = m?.get(mk);
    if (had !== undefined) return had;
    const v = this.dominated(ck.rel, lo[1], hi[1]);
    if (m) m.set(mk, v); else this.subMemo.set(ck.id, new Map([[mk, v]]));
    return v;
  }

  /** A value a better one replaced: no answer and no `derived_by`, its firings kept as the cell's history. */
  private supersede(old: string, ck: LatKey): void {
    if (!this.noProvenance) for (const r of [...new Set(this.firings(old).map((w) => w.ruleId))].sort(cmpStr)) this.retireDerivedBy(old, r);
    this.store.retireKeepingFirings(old);
    this.latSuperseded.add(old);
    let h = this.latHistory.get(ck.id);
    if (!h) { h = []; this.latHistory.set(ck.id, h); }
    h.push(old);
  }

  /** Retire a derived fact and the `derived_by` rows its firings wrote. */
  private retireFact(id: string): void {
    if (!this.noProvenance) for (const r of [...new Set(this.firings(id).map((w) => w.ruleId))].sort(cmpStr)) this.retireDerivedBy(id, r);
    this.retire(id);
  }

  private retireDerivedBy(id: string, rule: string): void {
    if (this.noProvenance) return;
    const rec = this.rec(id);
    const d = factKey(V.derived_by, KERNEL_PERSP, [factTerm(rec.rel, rec.persp, rec.args), mka(rule), mki(this.store.tick)]);
    if (this.alive(d)) this.retire(d);
  }

  /** NO VALUE FOR THIS CELL THIS TICK: its fact withdrawn, with the values it held, and a hole. */
  private holeLatticeCell(ck: LatKey, reason: string): Term {
    const cur = this.latCur.get(ck.id);
    const value = cur !== undefined && this.alive(cur) ? this.lastArg(cur) : null;
    if (cur !== undefined) {
      this.latCur.delete(ck.id);
      if (this.alive(cur)) { this.retireFact(cur); this.latDropped.push(cur); }
    }
    const front = this.subCur.get(ck.id) ?? [];
    this.subCur.delete(ck.id);
    for (const f of front) if (this.alive(f)) { this.retireFact(f); this.latDropped.push(f); }
    this.withdrawHistory(ck);
    this.withdrawContributions(ck);
    const marker = mkf('$lattice', [mka(ck.rel), mka(ck.persp), mki(this.store.tick), list(ck.key)]);
    if (reason === 'widening_forced' && value !== null) {
      this.widenedX.set(ck.id, [ck, value]);
      const no = this.narrowOut.get(ck.id);
      this.widenedMarks.set(canonTerm(marker), [no !== undefined ? no[1] : value, this.latWidened.get(ck.id) ?? [], no !== undefined ? no[2] : []]);
    }
    const ps = this.subParties.get(ck.id);
    if (ps !== undefined) { this.subParties.delete(ck.id); this.conflictMarks.set(canonTerm(marker), ps); }
    this.cellHole(marker, reason);
    this.latticeHoleEdges(nUnk(uCell(ck)), marker, reason);
    return marker;
  }

  /** A cell with no value has no history either. */
  private withdrawHistory(ck: LatKey): void {
    const h = this.latHistory.get(ck.id) ?? [];
    this.latHistory.delete(ck.id);
    for (const f of h) if (this.latSuperseded.delete(f)) { this.store.dropFirings(f); this.latDropped.push(f); }
  }

  /** A join cell with no value has no Cover: its contributions go with it. */
  private withdrawContributions(ck: LatKey): void {
    const cs = this.joinContribs.get(ck.id) ?? [];
    this.joinContribs.delete(ck.id);
    for (const c of cs) if (this.alive(c)) this.retireFact(c);
  }

  /** Every cell of a relation at once, when the key a failure belongs to is not known. */
  private holeLatticeRel(rel: string, reason: string): void {
    if (!this.latHoledRel.has(rel)) {
      this.latHoledRel.add(rel);
      for (const f of this.relAll(rel)) { this.retireFact(f); this.latDropped.push(f); }
      for (const k of [...this.latCur.keys()]) if (this.cks.get(k)!.rel === rel) this.latCur.delete(k);
      for (const k of [...this.subCur.keys()]) if (this.cks.get(k)!.rel === rel) this.subCur.delete(k);
      for (const k of [...this.latHistory.keys()]) if (this.cks.get(k)!.rel === rel) this.withdrawHistory(this.cks.get(k)!);
      for (const k of [...this.joinContribs.keys()]) if (this.cks.get(k)!.rel === rel) this.withdrawContributions(this.cks.get(k)!);
    }
    const marker = mkf('$lattice', [mka(rel)]);
    this.cellHole(marker, reason);
    this.latticeHoleEdges(nUnk(uRel(rel)), marker, reason);
  }

  /** A lattice's hole and what it leaves unknown rest on each other. */
  private latticeHoleEdges(u: Node, marker: Term, reason: string): void {
    this.unkEdges.push([u, nHole(marker)]);
    if (reason === 'support_withdrawn') this.unkEdges.push([nHole(marker), u]);
  }

  /** A builtin failed for an error in a rule a lattice decides, held until that lattice closes. */
  private latticeFault(ruleId: string | null, s: Subst, prems: PremRef[]): void {
    if (ruleId === null) return;
    const r = this.ruleOf(ruleId);
    if (!r || r.latClose === null) return;
    const reason = this.lastFault ?? 'arith_type_error';
    this.latPending.push({ close: r.latClose, what: this.conclusionUnknown(r, s), rule: ruleId, reason, facts: factPrems(prems) });
  }

  /** What a rule's conclusion under `s` is, as something unknown. */
  private conclusionUnknown(r: ERule, s: Subst): Unknown | null {
    const head = r.clause.head;
    if (head.temporal === 'next' || (this.isLatticeLit(head.rel, head.args.length) && this.latClosed.has(head.rel))) return null;
    return this.headUnknown(r, s);
  }

  /** A literal under `s` as something unknown. */
  private litUnknown(l: Lit, s: Subst): Unknown {
    const p = walk(l.persp, s);
    if (p.k !== 'a') return uRel(l.rel);
    const args = l.args.map((a) => resolve(a, s));
    const s2 = bindUnknown(args, new Map());
    if (s2 === null) return uRel(l.rel);
    return uTuple(l.rel, p.name, args.map((t) => resolve(t, s2)));
  }

  /** The head of `r` under `s` as something unknown, whatever its tick. */
  private headUnknown(r: ERule, s: Subst): Unknown | null {
    const head = r.clause.head;
    const persp = walk(head.persp, s);
    const kl = this.cellKeylen(head.rel, head.args.length);
    const n = kl ?? head.args.length;
    const key = head.args.slice(0, n).map((a) => resolve(a, s));
    if (persp.k !== 'a') return uRel(head.rel);
    if (kl === null) {
      const s2 = bindUnknown(key, new Map());
      if (s2 === null) return null;
      // what an undecided step reached may not exist, whatever its unknowns were
      return uTuple(head.rel, persp.name, key.map((t) => (isUnsure(s) ? desure(resolve(t, s2)) : resolve(t, s2))));
    }
    return key.every((t) => isGround(t) && !holdsUnknown(t)) ? uCell(this.lk(head.rel, persp.name, key)) : uRel(head.rel);
  }

  /** Remove every firing that cites one of `gone`: each fact that lost one, its rules, whether any is left, and the least cited. */
  private dropFiringsCiting(gone: Set<string>): [string, string[], boolean, string][] {
    const ids = this.citers !== null ? this.citersOf(gone) : [...this.store.firings.keys()].sort(cmpStr);
    const out: [string, string[], boolean, string][] = [];
    for (const id of ids) {
      const lost: string[] = [];
      let cited: string | null = null;
      for (const w of this.firings(id)) {
        const hit = w.prems.filter((p) => p.t === 'fact' && gone.has(p.key)).map((p) => (p as { key: string }).key).sort(cmpStr)[0];
        if (hit === undefined) continue;
        if (cited === null || hit < cited) cited = hit;
        this.store.removeFiring(id, firingSig(w.ruleId, w.prems));
        lost.push(w.ruleId);
      }
      if (lost.length > 0) out.push([id, lost, this.store.firings.has(id), cited!]);
    }
    return out;
  }

  /** Does some firing of `id` cite none of `stale`? */
  private firedWithout(id: string, stale: Set<string>): boolean {
    return this.firings(id).some((w) => !w.prems.some((p) => p.t === 'fact' && stale.has(p.key)));
  }

  /** Drop the firings of `id` that cite one of `stale`; their rules. */
  private dropFiringsOfCiting(id: string, stale: Set<string>): string[] {
    const lost: string[] = [];
    for (const w of this.firings(id)) {
      if (w.prems.some((p) => p.t === 'fact' && stale.has(p.key))) { this.store.removeFiring(id, firingSig(w.ruleId, w.prems)); lost.push(w.ruleId); }
    }
    return lost;
  }

  /** AFTER A FIXPOINT: a fact that read a value since improved on must also fire
   *  from the value that replaced it; every withdrawal is carried to what rested on it. */
  private latticeSettle(cut: boolean): void {
    if (this.latImproved.length === 0 && this.latDropped.length === 0) return;
    const improved = new Set(this.latImproved);
    this.latImproved = [];
    if (!cut) this.subWithdraw(improved);
    for (const x of this.citersOf(improved)) {
      if (!this.alive(x) || this.rec(x).base) continue;
      const xrel = this.rec(x).rel;
      if (this.joinRels.has(xrel)) continue;
      const l = this.joinOf.get(xrel);
      if (l !== undefined) {
        if (!cut && !this.firedWithout(x, this.latSuperseded) && !this.joinRefired(l, x)) {
          const msg = this.subNonmonotone(x);
          if (msg !== null) throw new Rejected(msg);
          throw new Bug(`${x} was contributed from a value since widened, and nothing at least as large was contributed from the value that replaced it: a consumer was not monotone`);
        }
        this.latStale.add(x);
        continue;
      }
      if (!cut && !this.firedWithout(x, this.latSuperseded) && !this.faultedRefire(x)) {
        const msg = this.subNonmonotone(x);
        if (msg !== null) throw new Rejected(msg);
        throw new Bug(`${x} lost every firing when a lattice cell improved: a consumer was not monotone`);
      }
      this.latStale.add(x);
    }
    let dropped = new Set(this.latDropped);
    this.latDropped = [];
    while (dropped.size > 0) {
      const left: string[] = [];
      const gone: string[] = [];
      const lost = new Map<string, [string[], string]>();
      for (const [f, rules, any, cited] of this.dropFiringsCiting(dropped)) {
        this.forgetRules(f, rules);
        (any ? left : gone).push(f);
        lost.set(f, [rules, cited]);
      }
      const roots = left.filter((f) => (this.alive(f) || this.latSuperseded.has(f)) && !this.rec(f).base);
      if (roots.length > 0) {
        const memo = new Map<string, number>();
        this.heights(roots, memo, null);
        gone.push(...roots.filter((f) => !memo.has(f)));
      }
      gone.sort(cmpStr);
      for (const f of gone) {
        let src: Node | null = null;
        if (this.alive(f) && !this.rec(f).base) {
          const l = lost.get(f);
          lost.delete(f);
          const rules = l ? [...l[0]] : [];
          const via: [string, string] | null = l && rules.length > 0 ? [l[1], rules[0]] : null;
          if (via) src = nUnk(this.unknownOf(via[0]));
          rules.push(...this.firings(f).map((w) => w.ruleId));
          this.latWithdrawn.push([f, rules, via]);
        }
        // the hole a withdrawn cell becomes rests on what it cited, not on whatever the carry last worked from
        const saved: [Node | null, Node[]] = [this.carrySrc, this.carryMore];
        this.carrySrc = src;
        this.carryMore = [];
        this.withdraw(f, 'support_withdrawn');
        [this.carrySrc, this.carryMore] = saved;
      }
      dropped = new Set(this.latDropped);
      this.latDropped = [];
    }
  }

  /** THE CONSEQUENCES OF A DOMINATED VALUE ARE WITHDRAWN. */
  private subWithdraw(improved: Set<string>): void {
    const dominated = new Set([...improved].filter((f) => this.subs.has(this.rec(f).rel)));
    if (dominated.size === 0) return;
    const region: string[] = [];
    const inRegion = new Set<string>();
    let frontier = dominated;
    while (frontier.size > 0) {
      const next = new Set<string>();
      for (const y of this.citersOf(frontier)) {
        if (!this.alive(y) || this.rec(y).base) continue;
        if (!inRegion.has(y)) { inRegion.add(y); region.push(y); next.add(y); }
      }
      frontier = next;
    }
    if (region.length === 0) return;
    region.sort(cmpStr);
    const stale = new Set([...this.latSuperseded].filter((f) => this.subs.has(this.rec(f).rel)));
    const cells = new Set([...this.lattices.keys(), ...this.joinOf.keys()]);
    const ups = new Map<string, Set<string>>();
    for (const y of region) for (const w of this.firings(y)) for (const p of w.prems) {
      if (p.t === 'fact' && stale.has(p.key) && !ups.has(p.key)) ups.set(p.key, this.subDominators(p.key));
    }
    const refired = (head: string, rule: string, ps: PremRef[]) => this.firings(head).some((w) => w.ruleId === rule && w.prems.length === ps.length
      && ps.every((p, i) => { const q = w.prems[i]; return p.t === 'fact' && stale.has(p.key) ? q.t === 'fact' && (ups.get(p.key)?.has(q.key) ?? false) : true; }));
    const memo = new Map<string, number>();
    this.heights(region, memo, (head, rule, ps) => !cells.has(this.rec(head).rel)
      && ps.some((p) => p.t === 'fact' && stale.has(p.key)) && !refired(head, rule, ps));
    const unfounded = region.filter((f) => !memo.has(f));
    if (unfounded.length === 0) return;
    const y = unfounded.find((f) => cells.has(this.rec(f).rel));
    if (y !== undefined) {
      throw new Rejected(`program rejected: ${y} rests only on what a dominated value concluded: a consumer inside the recursion is not monotone in the dominance (docs/aggregates.md, "Subsumption, as built")`);
    }
    const gone = new Set(unfounded);
    for (const x of unfounded) this.retireFact(x);
    for (const g of gone) this.subGone.add(g);
    for (const y2 of this.citersOf(gone)) {
      if (gone.has(y2) || this.rec(y2).base) continue;
      const rules = this.dropFiringsOfCiting(y2, gone);
      if (this.alive(y2)) this.forgetRules(y2, rules);
    }
  }

  /** The values that dominated `g`, transitively. */
  private subDominators(g: string): Set<string> {
    const rec = this.rec(g);
    const k = this.subs.get(rec.rel)!.keylen;
    const ck = this.lk(rec.rel, rec.persp, rec.args.slice(0, k));
    let v = rec.args.slice(k);
    const seen = new Set([listKey(v)]);
    const out = new Set<string>();
    for (;;) {
      const w = this.subBeaten.get(`${ck.id}|${listKey(v)}`);
      if (w === undefined || seen.has(listKey(w))) break;
      seen.add(listKey(w));
      const h = factKey(rec.rel, rec.persp, this.subArgs(ck, w));
      if (this.store.recAny(h) !== undefined) out.add(h);
      v = w;
    }
    return out;
  }

  /** A CONSUMER NOT MONOTONE IN A DOMINANCE, found on its data: the refusal, or null. */
  private subNonmonotone(x: string): string | null {
    for (const w of this.firings(x)) {
      for (const p of w.prems) {
        if (p.t !== 'fact') continue;
        const g = p.key;
        const rec = this.rec(g);
        if (!this.latSuperseded.has(g) || !this.subs.has(rec.rel)) continue;
        const k = this.subs.get(rec.rel)!.keylen;
        const ck = this.lk(rec.rel, rec.persp, rec.args.slice(0, k));
        const bv = this.subBeaten.get(`${ck.id}|${listKey(rec.args.slice(k))}`);
        const by = bv !== undefined ? factKey(rec.rel, rec.persp, this.subArgs(ck, bv)) : 'a value given later';
        return `program rejected: rule ${w.ruleId} is not monotone in the dominance of ${rec.rel}: it concluded ${x} from ${g}, which ${by} dominates, and nothing its rules concluded from what dominates it is ${x} or dominates it (docs/aggregates.md, "Subsumption, as built")`;
      }
    }
    return null;
  }

  /** Withdraw a fact whose support is gone. */
  private withdraw(f: string, reason: string): void {
    if (this.latSuperseded.delete(f)) { this.store.dropFirings(f); this.latDropped.push(f); return; }
    if (!this.alive(f) || this.rec(f).base) return;
    const rec = this.rec(f);
    const k = this.cellKeylen(rec.rel, rec.args.length);
    if (k !== null) {
      const ck = this.lk(rec.rel, rec.persp, rec.args.slice(0, k));
      if (this.latCur.get(ck.id) === f || (this.subCur.get(ck.id)?.includes(f) ?? false)) { this.holeLatticeCell(ck, reason); return; }
    }
    this.retireFact(f);
    this.latDropped.push(f);
  }

  /** The `derived_by` rows of the rules that no longer fire `f`. */
  private forgetRules(f: string, rules: string[]): void {
    for (const r of new Set(rules)) if (!this.firings(f).some((w) => w.ruleId === r)) this.retireDerivedBy(f, r);
  }

  /** Close every lattice relation settled below level `lv`. */
  private closeLatticesBelow(lv: number): void {
    if (this.lattices.size === 0) return;
    const due = [...this.lattices.keys()].filter((p) => !this.latClosed.has(p)).filter((p) => {
      const r = this.roundOf.get(p);
      return r !== undefined ? r < lv : lv === Infinity;
    }).sort(cmpStr);
    if (due.length === 0) return;
    this.narrowGathered(due);
    this.subCheck(due);
    this.applyLatticeHoles(due);
    this.joinCovers(due);
    this.settleStale(due);
    this.joinGc(due);
    const front = newFront();
    for (const p of due) { this.latClosed.add(p); this.closeLattice(p, front); }
    mergeFront(front, this.curFront);
    this.curFront = newFront();
    if (front.keys.size > 0) { this.propagate(front); this.latticeSettle(false); }
    this.poisonReaders([]);
  }

  /** THE FAULTS OF A CLOSING LATTICE, applied where every fact the failed derivation read still stands. */
  private applyLatticeHoles(rels: string[]): void { this.applyLatticeHolesAt(rels, false); }

  private applyLatticeHolesAt(rels: string[], cut: boolean): void {
    const pending = this.latPending;
    const mine = pending.filter((x) => rels.includes(x.close));
    this.latPending = pending.filter((x) => !rels.includes(x.close));
    const standing = mine.filter((x) => x.facts.every((f) => this.alive(f)));
    this.poison(this.applyFaults(standing), rels, cut);
  }

  /** Apply faults: the cells they hole are withdrawn, the rule holes written. */
  private applyFaults(faults0: LatFault[]): Unknown[] {
    const faulted = faults0.filter((x) => x.reason !== 'widening_forced').flatMap((x) => (x.what ? [x.what] : []));
    const faults = faults0.filter((x) => x.reason !== 'widening_forced' || !faulted.some((u) =>
      (u.k === 'cell' && x.what !== null && x.what.k === 'cell' && u.ck.id === x.what.ck.id) || (u.k === 'rel' && x.what !== null && u.rel === uRelOf(x.what))));
    const seeds: Unknown[] = [];
    for (const x of faults) {
      if (x.what !== null && x.what.k === 'cell') this.holeLatticeCell(x.what.ck, x.reason);
      else if (x.what !== null && x.what.k === 'rel' && this.lattices.has(x.what.rel)) this.holeLatticeRel(x.what.rel, x.reason);
      if (x.rule !== null) this.arithHole(x.rule, x.reason);
      if (x.what !== null) seeds.push(x.what);
    }
    return seeds;
  }

  /** WHAT A HOLE REACHES IS UNKNOWN TOO. */
  private poison(seeds: Unknown[], closing: string[], cut: boolean): void { this.poisonWith(seeds, [], closing, cut); }

  /** RULES FIRED AFTER A HOLE are solved against every unknown already carried. */
  private poisonReaders(readers: ERule[]): void {
    if (this.latUndecided.length === 0 && (readers.length === 0 || this.latSpread.size === 0)) return;
    this.carrying(() => { this.poisonWith([], readers, [], false); this.drainPoison(); });
  }

  /** The holes a carry wrote are news; what a firing on them cannot decide is carried on. */
  private drainPoison(): void {
    for (;;) {
      const more = this.curFront;
      this.curFront = newFront();
      if (more.keys.size > 0) { this.propagate(more); this.latticeSettle(false); }
      if (this.latUndecided.length === 0) return;
      this.poisonWith([], [], [], false);
    }
  }

  private poisonWith(seeds: Unknown[], readers: ERule[], closing: string[], cut: boolean): void {
    this.carrying(() => this.withWallsLifted(() => {
      const faults: [string | null, number, string | null] = [this.fault, this.faultCount, this.lastFault];
      try { this.poisonWalk(seeds, readers, closing, cut); } finally { [this.fault, this.faultCount, this.lastFault] = faults; }
    }));
  }

  /** `f`, a carry of unknowns: a wall inside it leaves what it would have reached not known. */
  private carrying<T>(f: () => T): T {
    try { return f(); } catch (e) { this.carryBroken = true; throw e; }
  }

  private carryCharge(width: number): void { this.carrySteps++; this.carryCheck(width); }

  private carryCheck(width: number): void {
    if (this.carrySteps > this.carryWall[0]) {
      this.wallSpent = ['steps', this.carrySteps, this.carryWall[0]];
      throw new Wall(BUDGET_REASON);
    }
    if (this.carryRows + width > this.carryWall[1]) {
      this.wallSpent = ['rows', this.carryRows + width, this.carryWall[1]];
      throw new Wall(SPACE_REASON);
    }
  }

  /** `f` with the walls lifted. */
  private withWallsLifted<T>(f: () => T): T {
    const walls: [number, number] = [this.budget, this.space];
    this.budget = Infinity; this.space = Infinity;
    try { return f(); } finally { [this.budget, this.space] = walls; }
  }

  private dominanceRel(rel: string): boolean { return this.domRels.has(rel); }
  private latWord(rel: string): string { return this.subs.has(rel) ? 'subsumptive relation' : 'lattice'; }
  private isLatticeLit(rel: string, arity: number): boolean { return this.lattices.get(rel)?.[0] === arity; }
  private isCellKey(rel: string, n: number): boolean {
    const l = this.lattices.get(rel);
    if (!l) return false;
    return l[1] === 'subsumption' ? this.subs.get(rel)!.keylen === n : l[0] === n + 1;
  }

  private noteUnknown(u: Unknown, via: [Unknown, string] | null): boolean {
    if (this.latUnknown.has(u.id)) return false;
    if (this.readsUnknown && uRelOf(u) !== IFACE.unknown) this.metaQueue.push([this.metaOf(u), u]);
    this.carryRows++;
    let lst = this.latUnknownRel.get(uRelOf(u));
    if (!lst) { lst = []; this.latUnknownRel.set(uRelOf(u), lst); }
    const seq = lst.length;
    lst.push(u);
    const at = (rel: string, i: number, t: Term) => {
      const k = `${rel}|${i}|${canonTerm(t)}`;
      let e = this.unknownAt.get(k);
      if (!e) { e = []; this.unknownAt.set(k, e); }
      e.push(seq);
    };
    if (u.k === 'tuple') u.args.forEach((a, i) => at(u.rel, i, holdsUnknown(a) ? UNKNOWN_VALUE : a));
    else if (u.k === 'cell') { u.ck.key.forEach((k, i) => at(u.ck.rel, i, k)); at(u.ck.rel, u.ck.key.length, UNKNOWN_VALUE); }
    else { let e = this.unknownAny.get(u.rel); if (!e) { e = []; this.unknownAny.set(u.rel, e); } e.push(seq); }
    if (u.k === 'cell') u.ck.key.forEach((k, i) => {
      const key = `${u.ck.rel}|${i}|${canonTerm(k)}`;
      let e = this.latUnknownAt.get(key);
      if (!e) { e = []; this.latUnknownAt.set(key, e); }
      e.push(u);
    });
    this.latUnknown.set(u.id, [u, via]);
    return true;
  }

  private poisonWalk(seeds: Unknown[], readers: ERule[], closing: string[], cut: boolean): void {
    const withdrawn = 'support_withdrawn';
    const level: Unknown[] = [];
    for (const u of seeds) {
      this.noteUnknown(u, null);
      if (!this.latSpread.has(u.id)) { this.latSpread.add(u.id); level.push(u); }
    }
    this.takeMetas(level);
    const reached: [Unknown, Unknown, string][] = [];
    if (readers.length > 0) {
      const levelIds = new Set(level.map((u) => u.id));
      const old = [...this.latSpread].filter((id) => !levelIds.has(id)).map((id) => this.latUnknown.get(id)![0])
        .map((u): [string, Unknown] => [this.unknownText(u), u]).sort((a, b) => cmpStr(a[0], b[0]));
      for (const [, u] of old) {
        this.carrySrc = nUnk(u);
        for (const [v, rule, from] of this.reachedFrom(u, readers)) reached.push([v, from, rule]);
      }
    }
    const und = this.latUndecided;
    this.latUndecided = [];
    for (const [rid, i, s, us] of und) {
      const r = this.ruleOf(rid);
      if (!r) continue;
      // the rest of the body once, for every unknown that leaves it undecided
      this.carrySrc = nUnk(us[0]);
      const sols = this.poisonSolve(r, i, s);
      for (const u of us) {
        this.carrySrc = nUnk(u);
        const plain = this.latPlain.has(u.id);
        const neg = plain && r.plan[i].t === 'neg';
        for (const s2 of sols) {
          const v = this.reachedConclusion(r, s2, plain);
          if (v !== null) {
            if (neg && !this.unknownHolds(v)) this.arithHole(rid, withdrawn);
            reached.push([v, u, rid]);
          }
        }
      }
    }
    for (const [v, u, rule] of reached) {
      this.carrySrc = nUnk(u);
      if (this.carry(v, u, rule, withdrawn, closing)) level.push(v);
    }
    this.takeMetas(level);
    for (;;) {
      while (level.length > 0) {
        const keyed = level.splice(0).map((u): [string, Unknown] => [this.unknownText(u), u]).sort((a, b) => cmpStr(a[0], b[0]));
        for (const [, u] of keyed) {
          this.carrySrc = nUnk(u);
          for (const [v, rule, from] of this.reachedFrom(u, null)) {
            this.carrySrc = nUnk(from);
            if (this.carry(v, from, rule, withdrawn, closing)) level.push(v);
          }
          this.carrySrc = nUnk(u);
        }
        this.takeMetas(level);
      }
      this.latticeSettle(cut);
      const gone = this.latWithdrawn;
      this.latWithdrawn = [];
      gone.sort((a, b) => cmpStr(a[0], b[0]));
      for (const [f, rules, cited] of gone) {
        const u = this.unknownOf(f);
        const via: [Unknown, string] | null = cited ? [this.unknownOf(cited[0]), cited[1]] : null;
        if (via) { this.unkEdges.push([nUnk(u), nUnk(via[0])]); this.carrySrc = nUnk(via[0]); } else this.carrySrc = null;
        this.noteUnknown(u, via);
        if (u.k === 'tuple') {
          const e = this.latUnknown.get(u.id);
          const rule = e && e[1] ? e[1][1] : rules[0];
          if (rule !== undefined) this.arithHole(rule, withdrawn);
        }
        const deplained = this.latPlain.delete(u.id);
        const fresh = !this.latSpread.has(u.id);
        this.latSpread.add(u.id);
        if (fresh || deplained) level.push(u);
      }
      this.takeMetas(level);
      if (level.length === 0) { this.carrySrc = null; return; }
    }
  }

  /** The plan a run used, for tests and reports, as the plain evaluators give it: each safe rule with a negation and
   *  the level its head closes at, the peel's round or the ranked stratum (under well-founded semantics the stratum
   *  table), `null` for a `@next` head or a head nothing ranks. */
  strataPlan(): { rule: string; rel: string; level: number | null }[] {
    if (!this.planned) throw new Error('strataPlan asks an aggregate evaluation that has not run');
    const at = this.wellFounded ? this.readStrata() : this.roundOf;
    return this.rules.filter((r) => r.safe && r.hasNeg).map((r) => ({
      rule: r.id,
      rel: r.clause.head.rel,
      level: r.clause.head.temporal === 'next' ? null : at.get(r.clause.head.rel) ?? null,
    }));
  }

  ruleOf(id: string): ERule | undefined { const i = this.ruleAt.get(id); return i === undefined ? undefined : this.rules[i]; }

  /** Does the tuple `u` names hold for certain, as a fact that stands? */
  private unknownHolds(u: Unknown): boolean { return u.k === 'tuple' && this.alive(factKey(u.rel, u.persp, u.args)); }

  private relLevel(rel: string): number {
    const r = this.roundOf.get(rel);
    if (r !== undefined) return r;
    return this.derivedRels.has(rel) ? Infinity : 0;
  }

  private ruleLevel(r: ERule): number { return r.clause.head.temporal === 'next' ? Infinity : this.relLevel(r.clause.head.rel); }

  /** RULES CLOSE, AND ONLY THEN DOES A PLAIN UNKNOWN REACH THEM. */
  private closePlainRules(lv: number): void {
    const fresh = this.rules.filter((r) => r.safe && !this.plainClosed.has(r.id) && (lv === Infinity || this.ruleLevel(r) < lv));
    for (const r of fresh) this.plainClosed.add(r.id);
    this.poisonReaders(fresh);
  }

  /** A fact as the unknown it is once withdrawn: its lattice cell, or its tuple. */
  private unknownOf(f: string): Unknown {
    const rec = this.rec(f);
    const l = this.joinOf.get(rec.rel);
    if (l !== undefined) return uCell(this.lk(l, rec.persp, rec.args.slice(0, rec.args.length - 1)));
    const k = this.cellKeylen(rec.rel, rec.args.length);
    return k !== null ? uCell(this.lk(rec.rel, rec.persp, rec.args.slice(0, k))) : uTuple(rec.rel, rec.persp, rec.args);
  }

  /** Record what an unknown conclusion withdraws; true if it is to be carried further now. */
  private markUnknown(u: Unknown, rule: string, reason: string, closing: string[]): boolean {
    if (u.k === 'cell' && closing.includes(u.ck.rel)) { this.holeLatticeCell(u.ck, reason); return true; }
    if (u.k === 'rel' && closing.includes(u.rel)) { this.holeLatticeRel(u.rel, reason); return true; }
    if ((u.k === 'cell' || u.k === 'rel') && this.lattices.has(uRelOf(u))) {
      this.latPending.push({ close: uRelOf(u), what: u, rule: null, reason, facts: [] });
      return false;
    }
    if (u.k === 'tuple' && this.unknownHolds(u)) return false;
    this.arithHole(rule, reason);
    return true;
  }

  /** Every conclusion a rule draws with `u` in place of one of its premises. */
  private reachedFrom(u: Unknown, only: ERule[] | null): [Unknown, string, Unknown][] {
    this.carryCheck(0);
    const rel = uRelOf(u);
    const plain = this.latPlain.has(u.id);
    const rules = only ?? [...this.active];
    const out: [Unknown, string, Unknown][] = [];
    for (const r of rules) {
      if (plain && only === null && !this.plainClosed.has(r.id)) continue;
      for (let i = 0; i < r.plan.length; i++) {
        const b = r.plan[i];
        let s0: Subst | null = null;
        if (b.t === 'pos' && b.lit.rel === rel) s0 = this.unknownBinds(b.lit, u, new Map());
        else if (b.t === 'agg' && b.op === 'at_least') {
          const found: Subst[] = [];
          for (const x of b.body) if (x.t === 'pos' && x.lit.rel === rel) { const s1 = this.unknownBinds(x.lit, u, new Map()); if (s1) found.push(s1); }
          for (const s1 of found) {
            for (const s of this.poisonSolve(r, i, s1)) {
              if (this.thrShort(r.id, b, s)) continue;
              const v = this.reachedConclusion(r, s, plain);
              if (v !== null) {
                for (const w of this.thrOpenUnknowns(r.id, b, s)) if (w.id !== u.id) out.push([v, r.id, w]);
                out.push([v, r.id, u]);
              }
            }
          }
          continue;
        } else if (b.t === 'neg' && this.latPlain.has(u.id)) s0 = null;
        else if ((b.t === 'neg' || b.t === 'agg') && rel === IFACE.unknown) s0 = null;
        // its correlations seal in the order of the data, after the carry of each layer
        else if (b.t === 'agg' && this.dsElems.has(`${r.id}|${b.at}`)) s0 = null;
        else if ((b.t === 'neg' || b.t === 'agg') && only === null && litsOf(b).some((l) => l.rel === rel)) {
          throw new Bug(`rule ${r.id} fired before ${this.unknownText(u)} was closed: a negation or an aggregate read it while a hole could still reach it`);
        }
        if (s0 === null) continue;
        for (const s of this.poisonSolve(r, i, s0)) {
          const v = this.reachedConclusion(r, s, plain);
          if (v !== null) out.push([v, r.id, u]);
        }
      }
    }
    return out;
  }

  /** What `r` concludes under `s`, reached from something unknown. */
  private reachedConclusion(r: ERule, s: Subst, plain: boolean): Unknown | null {
    if (r.clause.head.temporal === 'next') {
      this.arithHole(r.id, 'support_withdrawn');
      this.stageUnknown(r, s, plain);
      return null;
    }
    return this.conclusionUnknown(r, s);
  }

  /** A HOLE AT T REACHES T+1. */
  private stageUnknown(r: ERule, s: Subst, plain: boolean): void {
    const u = this.headUnknown(r, s);
    if (u === null) return;
    const e = this.stagedUnknown.get(u.id);
    if (e) e[1] = e[1] && plain; else this.stagedUnknown.set(u.id, [u, plain]);
  }

  /** A CONCLUSION STAGED FROM WHAT WAS WITHDRAWN SINCE. */
  private settleStaged(): void {
    if (this.lattices.size === 0) return;
    const dead = (ps: PremRef[]) => ps.some((p) => p.t === 'fact' && !this.alive(p.key));
    const keys = [...this.staged].filter(([, f]) => dead(f.prems)).map(([k]) => k).sort(cmpStr);
    for (const k of keys) {
      const alts = this.stagedAlts.get(k) ?? [];
      this.stagedAlts.delete(k);
      const knownFalse = (ps: PremRef[]) => ps.some((p) => p.t === 'fact' && (this.subGone.has(p.key)
        || (this.latSuperseded.has(p.key) && this.subs.has(this.rec(p.key).rel))));
      const f = this.staged.get(k)!;
      const unknown = !knownFalse(f.prems) || alts.some(([, ps]) => dead(ps) && !knownFalse(ps));
      const alt = alts.find(([, ps]) => !dead(ps));
      if (alt !== undefined) { f.rule = alt[0]; f.prems = alt[1]; continue; }
      this.staged.delete(k);
      if (unknown) {
        this.arithHole(f.rule, 'support_withdrawn');
        const l = this.carried.get(f.rel) ?? f.rel;
        const n = this.cellKeylen(l, f.args.length);
        const u = n !== null ? uCell(this.lk(l, f.persp, f.args.slice(0, n))) : uTuple(f.rel, f.persp, f.args);
        const e = this.stagedUnknown.get(u.id);
        if (e) e[1] = false; else this.stagedUnknown.set(u.id, [u, false]);
      }
    }
  }

  /** The row a boundary writes for an unknown staged into tick `tick`. */
  private nextHole(u: Unknown, plain: boolean, tick: number): Term[] {
    const any = mka('$any');
    let rel: string, persp: Term, args: Term;
    if (u.k === 'cell') { rel = u.ck.rel; persp = mka(u.ck.persp); args = list(u.ck.key); }
    else if (u.k === 'tuple') { rel = u.rel; persp = mka(u.persp); args = list(u.args); }
    else { rel = u.rel; persp = any; args = any; }
    return [mkf('$next', [mka(rel), persp, mki(tick), args]), mka(plain ? 'fault_left_out' : 'support_withdrawn')];
  }

  /** The unknowns a boundary carried into `tick`, read back from its `$next` holes. */
  private carriedUnknowns(tick: number): [Unknown, boolean][] {
    const holes = this.store.relAll(V.hole);
    const out: [Unknown, boolean][] = [];
    for (const h of holes) {
      const a = h.args;
      if (a.length < 2 || a[0].k !== 'f') continue;
      const fa = a[0].args;
      let rel: Term, p: Term, args: Term;
      if (a[0].name === '$below' && fa.length === 3) { rel = fa[0]; p = fa[1]; args = fa[2]; }
      else if (a[0].name === '$next' && fa.length === 4 && fa[2].k === 'i' && Number(fa[2].v) === tick) { rel = fa[0]; p = fa[1]; args = fa[3]; }
      else continue;
      if (rel.k !== 'a') continue;
      let u: Unknown;
      if (p.k === 'a' && p.name === '$any') u = uRel(rel.name);
      else {
        if (p.k !== 'a') continue;
        const xs = unlist(args);
        u = this.isCellKey(rel.name, xs.length) ? uCell(this.lk(rel.name, p.name, xs)) : uTuple(rel.name, p.name, xs);
      }
      this.unkEdges.push([nUnk(u), nHole(a[0])]);
      this.holesNow.push([a[0], a[1].k === 'a' ? a[1].name : V.hole]);
      out.push([u, a[1].k === 'a' && a[1].name === 'fault_left_out']);
    }
    return out;
  }

  /** Something unknown a literal could read under `s`, of those carried. */
  private readUnknown(l: Lit, s: Subst, plain: boolean): Unknown | null {
    for (const u of this.unknownCands(l, s)) {
      if (this.latSpread.has(u.id) && (plain || !this.latPlain.has(u.id)) && this.unknownBinds(l, u, s) !== null) return u;
    }
    return null;
  }

  /** The unknowns `l` could read under `s`, in the order they were noted. */
  private unknownCands(l: Lit, s: Subst): Unknown[] {
    const all = this.latUnknownRel.get(l.rel);
    if (all === undefined) return [];
    let best: [number, Term, number] | null = null;
    l.args.forEach((a, i) => {
      const t = resolve(a, s);
      if (!isGround(t) || holdsUnknown(t)) return;
      const n = [t, UNKNOWN_VALUE].reduce((x, k) => x + (this.unknownAt.get(`${l.rel}|${i}|${canonTerm(k)}`)?.length ?? 0), 0);
      if (best === null || n < best[2]) best = [i, t, n];
    });
    if (best === null) { this.carrySteps += all.length; return [...all]; }
    const [i, k] = best as [number, Term, number];
    const seqs = new Set<number>();
    for (const x of [k, UNKNOWN_VALUE]) for (const q of this.unknownAt.get(`${l.rel}|${i}|${canonTerm(x)}`) ?? []) seqs.add(q);
    for (const q of this.unknownAny.get(l.rel) ?? []) seqs.add(q);
    const sorted = [...seqs].sort((a, b) => a - b);
    this.carrySteps += sorted.length;
    return sorted.map((q) => all[q]);
  }

  /** `f`, where a firing's element may read something unknown. */
  private undecidedRead<T>(depth: number, ruleId: string | null, f: () => T): T | undefined {
    return depth === 0 && this.firing && ruleId !== null && this.latSpread.size > 0 ? f() : undefined;
  }

  /** Whether the tuple an unknown is exists in every completion: it holds a labeled value, and every one it holds is sure. */
  private sureUnknown(u: Unknown): boolean { return u.k === 'tuple' && sureArgs(u.args); }

  /** The aggregate's result variable bound to what the group's value is, unless it is bound already. */
  private bindResult(a: AggElem, s: Subst, v: Term | null): Subst {
    if (v === null || resolve(a.res, s).k !== 'v') return s;
    return unify(a.res, v, s) ?? s;
  }

  /** EVERY SOLUTION THE AGGREGATE'S INNER BODY MIGHT HAVE over something unknown under `s`, as its group and member. */
  private aggPossibles(rid: string, a: AggElem, s: Subst): Possible[] {
    const plan = this.aggPlans.get(`${rid}|${a.at}`);
    if (!plan) return [];
    const inner = plan.innerOrder.map((i) => a.body[i]);
    const outer = [...this.lattices.keys()];
    const out: Possible[] = [];
    const seen = new Set<string>();
    const known = (t: Term) => isGround(t) && !holdsUnknown(t);
    inner.forEach((b, k) => {
      if (b.t !== 'pos' && b.t !== 'neg') return;
      // a negation's variables nothing else reads: `not p(K, _)` is decided by any p(K, _)
      const free = new Set<string>();
      if (b.t === 'neg') {
        const elsewhere = new Set<string>(a.shared!);
        for (const t of [...a.vals, ...a.keys]) varsOf(t, elsewhere);
        inner.forEach((e, j) => { if (j !== k) elemVars(e, elsewhere); });
        for (const v of elemVars(b)) if (!elsewhere.has(v)) free.add(v);
      }
      for (const u of this.unknownCands(b.lit, s)) {
        if (!this.latSpread.has(u.id)) continue;
        const s00 = this.unknownBinds(b.lit, u, s);
        if (s00 === null) continue;
        const s0 = b.t !== 'neg' && this.sureUnknown(u) ? s00 : unsure(s00);
        for (const ps of this.poisonSolvePlan(inner, outer, k, s0)) {
          if (b.t === 'neg' && this.negDecided(b.lit, ps, free)) continue;
          const gt = plan.group.map((i) => resolve(mkv(a.shared![i]), ps));
          const pat = gt.map((t) => (known(t) ? t : null));
          const lab = gt.map((t) => { const up = known(t) ? null : unkParts(t); return up === null ? null : { t, ex: up.ex }; });
          const proj = plainKeys(a, [...a.vals.slice(aggParams(a)), ...a.keys].map((t) => resolve(t, ps)));
          const p: Possible = { pat, lab, sproj: proj, sure: !isUnsure(ps), proj: proj.every(known) ? proj : null, neg: b.t === 'neg', u };
          const id = `${pat.map((t) => (t === null ? '?' : canonTerm(t))).join('\u0001')}|${p.proj === null ? '?' : listKey(p.proj)}|${p.neg}|${u.id}`;
          if (!seen.has(id)) { seen.add(id); out.push(p); }
        }
      }
    });
    return out;
  }

  /** A NEGATION A FACT DECIDES under `ps`, its variables nothing else reads left open: the member it would take away is
   *  out in every completion. Undecided where an argument is not known, and asked only of a relation not answered on demand. */
  private negDecided(l: Lit, ps: Subst, free: Set<string>): boolean {
    if (this.demandRels.some(([r]) => r === l.rel)) return false;
    const s: Subst = new Map([...ps].filter(([k]) => !free.has(k)));
    if (walk(l.persp, s).k !== 'a') return false;
    for (const a of l.args) {
      const t = resolve(a, s);
      const vs = new Set<string>();
      varsOf(t, vs);
      if (holdsUnknown(t) || [...vs].some((v) => !free.has(v))) return false;
    }
    // `matchExists` answers whether the negation holds: nothing matches
    return !this.matchExists(l, s);
  }

  /** THE UNKNOWNS A GROUP DEPENDS ON, of those its possibles `ps` (its own, `PossIndex.at`) might add or take away:
   *  none when its value is the same under every completion. A fault every completion keeps stands (`faultCertain`).
   *  A member that might be out, or whose projection is not known, changes it; one whose projection a set already
   *  holds does not; the new ones are decided together by the kind's algebra, a sum by any not 0 (by any at all where
   *  it has no member yet), and a projection several unknowns could add rests on each of them (`reach_of`, Rust). */
  private reachOf(op: AggOp, param: Val | null | string, rk: RankKey | null, projs: Term[][], vals: Term[], value: CellValue, ps: Possible[]): Unknown[] {
    if (rk !== null) return this.reachOfRank(rk, projs, value, ps);
    const us: Unknown[] = [];
    const push = (u: Unknown) => { if (!us.some((x) => x.id === u.id)) us.push(u); };
    if (this.faultCertain(op, param, vals, value, ps)) return us;
    const liftOr = (t: Term): Val | string => { try { return lift(op, t); } catch (e) { if (!(e instanceof Refused)) throw e; return e.reason; } };
    // each new projection, with every unknown that could add it
    const fresh: [Val | string, Unknown[]][] = [];
    const held = new Set<string>(projs.map(listKey));
    const atProj = new Map<string, number>();
    for (const p of ps) {
      if (p.neg || p.proj === null) { push(p.u); continue; }
      if (dedupByProjection(op)) {
        const k = listKey(p.proj);
        if (held.has(k)) continue;
        const at = atProj.get(k);
        if (at !== undefined) { fresh[at][1].push(p.u); continue; }
        atProj.set(k, fresh.length);
      }
      fresh.push([liftOr(p.proj[0]), [p.u]]);
    }
    const now = value.k === 'value' ? liftOr(value.t) : null;
    let moved: [Val | string, Unknown[]][] = [];
    if (fresh.length === 0) moved = [];
    else if (op === 'sum' && value.k !== 'empty') moved = fresh.filter(([x]) => !(typeof x !== 'string' && x.k === 'int' && x.v === 0n));
    else if (opClass(op) === 'idempotent_order') {
      moved = now === null || typeof now === 'string' ? fresh : fresh.filter(([x]) => {
        if (typeof x === 'string') return true;
        try { return insert(op, now, x).k === 'improved'; } catch (e) { if (!(e instanceof Refused)) throw e; return true; }
      });
    } else if (opClass(op) === 'holistic') {
      const at = (extra: Val[]): Val | null | string => {
        try {
          if (typeof param === 'string') return param;
          return holisticSorted(op, param, sortedOf([...vals.map((t) => lift(op, t)), ...extra]));
        } catch (e) { if (!(e instanceof Refused)) throw e; return e.reason; }
      };
      const same = (x: Val | null | string, y: Val | null) =>
        typeof x !== 'string' && (x === null ? y === null : y !== null && x.k === y.k && x.v === y.v);
      const adds = fresh.map(([x]) => x);
      let stays = false;
      if (!adds.some((x) => typeof x === 'string')) {
        const xs = adds as Val[];
        if (op === 'rank' && now !== null && typeof now !== 'string') stays = same(at(xs), now);
        else if (op === 'rank' && value.k === 'empty') stays = same(at(xs), null);
        else if (now !== null && typeof now !== 'string') {
          const lt = (a: Val, b: Val) => a.k === 'int' && b.k === 'int' && a.v < b.v;
          stays = same(at(xs.filter((x) => lt(x, now))), now) && same(at(xs.filter((x) => lt(now, x))), now);
        }
      }
      moved = stays ? [] : fresh;
    } else moved = fresh;
    for (const [, xs] of moved) for (const u of xs) push(u);
    return us;
  }

  /** `reachOf` for a rank over a tuple: the group moves when adding every projection the possibles could add changes the
   *  subject's rank (a rank only grows as members are added, and a subject none of them is gains its place only by
   *  being added itself). */
  private reachOfRank(k: RankKey, projs: Term[][], value: CellValue, ps: Possible[]): Unknown[] {
    const us: Unknown[] = [];
    const push = (u: Unknown) => { if (!us.some((x) => x.id === u.id)) us.push(u); };
    const known = projs.map(atomsOr);
    if (value.k === 'hole' && value.reason === 'agg_type_error' && (known.some((x) => typeof x === 'string') || typeof k.subject === 'string')) return us;
    const fresh: [KeyAtom[] | string, Unknown[]][] = [];
    const held = new Set<string>(projs.map(listKey));
    const atProj = new Map<string, number>();
    for (const p of ps) {
      if (p.neg || p.proj === null) { push(p.u); continue; }
      const key = listKey(p.proj);
      if (held.has(key)) continue;
      const at = atProj.get(key);
      if (at !== undefined) {
        fresh[at][1].push(p.u);
        continue;
      }
      atProj.set(key, fresh.length);
      fresh.push([atomsOr(p.proj), [p.u]]);
    }
    const at = (extra: KeyAtom[][]): Val | null | string => {
      if (typeof k.subject === 'string') return k.subject;
      const bad = known.find((x) => typeof x === 'string') as string | undefined;
      if (bad !== undefined) return bad;
      return rankOf(sortedOfKeys(k.desc, [...(known as KeyAtom[][]), ...extra]), k.subject);
    };
    const adds = fresh.map(([x]) => x);
    let stays = false;
    if (!adds.some((x) => typeof x === 'string')) {
      const r = at(adds as KeyAtom[][]);
      if (value.k === 'value' && value.t.k === 'i') stays = typeof r !== 'string' && r !== null && r.k === 'int' && r.v === BigInt(value.t.v);
      else if (value.k === 'empty') stays = r === null;
    }
    if (!stays) for (const [, xs] of fresh) for (const u of xs) push(u);
    return us;
  }

  /** A FAULT EVERY COMPLETION KEEPS: the group's value is a hole no member its possibles add can mend, for the known
   *  members that faulted hold in every completion (`fault_certain`, Rust). */
  private faultCertain(op: AggOp, param: Val | null | string, vals: Term[], value: CellValue, ps: Possible[]): boolean {
    if (value.k !== 'hole') return false;
    const bad = (t: Term) => { try { lift(op, t); return false; } catch (e) { if (!(e instanceof Refused)) throw e; return true; } };
    if (value.reason === 'agg_type_error') return vals.some(bad) || (opClass(op) === 'holistic' && typeof param === 'string');
    if (value.reason !== AGG_OVERFLOW || op !== 'sum') return false;
    let total = 0n;
    for (const t of vals) {
      if (bad(t)) return false;
      const x = lift(op, t);
      if (x.k !== 'int') return false;
      total += x.v;
    }
    let [lo, hi] = [total, total];
    for (const p of ps) {
      if (p.proj === null || bad(p.proj[0])) return false;
      const x = lift(op, p.proj[0]);
      if (x.k !== 'int') return false;
      const n = x.v;
      const abs = n < 0n ? -n : n;
      if (p.neg) { lo -= abs; hi += abs; } else { if (n < 0n) lo += n; else hi += n; }
    }
    return hi < TERM_MIN || lo > TERM_MAX;
  }

  private rankKey(a: AggElem, s: Subst): RankKey | null {
    return rankTuple(a) ? { desc: a.keys.map((t) => keyDir(t)[0]), subject: atomsOr(a.vals.map((t) => resolve(t, s))) } : null;
  }

  /** Quantile's percent or rank's subject under `s`, as the fold reads it. */
  private aggParam(a: AggElem, s: Subst): Val | null | string {
    if (opParams(a.op as AggOp) === 0 || rankTuple(a)) return null;
    const p = resolve(a.vals[0], s);
    return p.k === 'i' ? { k: 'int', v: BigInt(p.v) } : 'agg_type_error';
  }

  /** WHAT THE AGGREGATE DID NOT DECIDE under the correlation `mk`, decided once: each sealed group an unknown could
   *  change, with the unknowns it rests on — as `sealCells` sealed it (`cellReach`) where this firing sealed it, else
   *  decided here over the value it was sealed with — and each group pattern of a possible no sealed group names. */
  private reachMemoOf(rid: string, a: AggElem, s: Subst, mk: string, ps: Possible[], sealedNow: boolean): ReachMemo {
    const [plan] = this.aggCorr(rid, a, s);
    const index = new PossIndex(ps);
    const named = ps.map(() => false);
    const groups: [Term[], Unknown[], Term | null][] = [];
    for (const c of this.aggMemo.get(mk) ?? []) {
      const r = this.store.cells.get(c)!;
      const g = plan.group.map((j) => r.keyTerms[j]);
      for (const n of index.exactAt(g)) named[n] = true;
      let us = this.cellReach.get(c);
      if (us === undefined) {
        if (sealedNow) continue;
        us = this.reachOf(r.op, this.aggParam(a, s), this.rankKey(a, s), r.members.map((m) => m.proj), r.members.map((m) => m.value), r.value, index.at(g));
      }
      if (us.length > 0) groups.push([r.keyTerms, us, this.cellCond.get(c) ?? null]);
    }
    // the groups sealed under this correlation, which a group an unknown makes is none of
    const sealed: Term[][] = (this.aggMemo.get(mk) ?? []).map((c) => { const r = this.store.cells.get(c)!; return plan.group.map((j) => r.keyTerms[j]); });
    const unnamed: [(Term | null)[], (Term | null)[], Unknown[], Term | null][] = [];
    const atPat = new Map<string, number>();
    const seen = new Set<string>();
    ps.forEach((p, n) => {
      const pk = patKey(p.pat);
      if (named[n] || seen.has(`${pk}|${p.u.id}`)) return;
      seen.add(`${pk}|${p.u.id}`);
      // a labeled position is the unknown, known not to be a group sealed
      const labs: (Term | null)[] = p.pat.map(() => null);
      if (labeledOpen(p)) {
        const at = p.pat.findIndex((t) => t === null);
        const own = p.lab[at];
        if (own !== null) {
          const up = unkParts(own.t)!;
          const ex = [...own.ex, ...sealed.filter((g) => p.pat.every((q, i) => q === null || canonTerm(q) === canonTerm(g[i]))).map((g) => g[at])];
          labs[at] = mkUnk(up.label, ex, up.sure);
        }
      }
      const k = `${pk}|${labs.map((t) => (t === null ? '?' : canonTerm(t))).join('\u0001')}`;
      const i = atPat.get(k);
      if (i !== undefined) unnamed[i][2].push(p.u);
      else { atPat.set(k, unnamed.length); unnamed.push([p.pat, labs, [p.u], null]); }
    });
    // the member count or total of a group an unknown makes, where it is the same under every completion
    if (this.rankKey(a, s) === null) for (const e of unnamed) e[3] = newGroupValue(a.op, aggParams(a), ps, e[0], e[1]);
    return { ps, groups, unnamed };
  }

  /** WHAT THE AGGREGATE DID NOT DECIDE under `s`, at every firing, from its correlation's `ReachMemo`. */
  private aggReachUndecided(rid: string, a: AggElem, s: Subst, i: number, m: ReachMemo): void {
    const plan = this.aggPlans.get(`${rid}|${a.at}`);
    if (!plan) return;
    for (const [key, us, cond] of m.groups) {
      const s2 = this.bindGroup(a, plan, s, key);
      if (s2 !== null) this.latUndecided.push([rid, i, this.bindResult(a, s2, cond), us]);
    }
    for (const [pat, labs, us, value] of m.unnamed) {
      let s2: Subst | null = s;
      plan.group.forEach((gi, n) => { const t = pat[n] ?? labs[n]; if (t !== null && s2 !== null) s2 = unify(mkv(a.shared![gi]), t, s2); });
      if (s2 !== null) this.latUndecided.push([rid, i, this.bindResult(a, s2, value), us]);
    }
  }

  /** A FAULT LEAVES A HEAD VARIABLE UNKNOWN, AND NAMES IT (`label_fault`, Rust): each head variable the failed solution
   *  left unbound is bound to a labeled unknown, the label the head with `_` where it is not known, the position and the
   *  firing (the rule and what its variables were). The tuple is Sure when the fault is the last thing the body asks. */
  private labelFault(r: ERule, s: Subst, at: BodyElem): Subst {
    const head = r.clause.head;
    const ra = head.args.map((a) => resolve(a, s));
    if (!ra.some((t) => t.k === 'v')) return s;
    const hd = mkf(head.rel, ra.map((t) => (t.k === 'v' ? UNKNOWN_VALUE : t)));
    const sure = this.lastFault === 'arith_overflow' && this.faultSure(r, s, at);
    // a tuple that exists is one unknown value for each firing; one that may not is judged as a possible, as every
    // unknown tuple is, and the firings that left the same head are one
    const bs = sure ? [...s].map(([v, t]) => [v, resolve(t, s)] as [string, Term]).sort((a, b) => cmpStr(a[0], b[0])) : [];
    const firing = mkList([mka(r.id), ...bs.map(([n, t]) => mkf('$b', [mka(n), t]))]);
    const out = new Map(s);
    ra.forEach((t, pos) => { if (t.k === 'v') out.set(t.name, mkUnk(mkf('$lbl', [hd, mki(pos), firing]), [], sure)); });
    return out;
  }

  /** Whether the fault is the last thing the body asks: its last element is the `is` that failed (`at`), and every other
   *  element's variables are bound, so nothing after the fault can fail (`fault_sure`, Rust). */
  private faultSure(r: ERule, s: Subst, at: BodyElem): boolean {
    const last = r.plan[r.plan.length - 1];
    if (last !== at || last === undefined || last.t !== 'bi' || last.op !== 'is') return false;
    if (resolve(last.l, s).k !== 'v' || !isGround(resolve(last.r, s))) return false;
    return r.plan.slice(0, -1).every((e) => [...elemVars(e)].every((v) => walk(mkv(v), s).k !== 'v'));
  }

  /** A builtin failed for an error in a rule no lattice decides: its conclusion under the failed solution is unknown. */
  private plainFault(ruleId: string | null, s: Subst, at: BodyElem): void {
    const r = ruleId === null ? undefined : this.ruleOf(ruleId);
    if (!r || r.latClose !== null) return;
    if (r.clause.head.temporal === 'next') { this.stageUnknown(r, s, true); return; }
    const u = this.conclusionUnknown(r, this.labelFault(r, s, at));
    if (u !== null) {
      this.narrowFeederFault(r.clause.head.rel);
      this.unkEdges.push([nUnk(u), nHole(this.ruleMarker(r.id))]);
      this.plainPending.push([u, true]);
    }
  }

  /** A PLAIN RULE THAT FAULTS IN A DESCENT: every widened cell that reads its conclusion's relation (through anything) is left as it was, for what the rule would have contributed is unknown; a rule that only reads what the cell concludes, from outside its recursion, is no reason. */
  private narrowFeederFault(head: string): void {
    const nr = this.narrowing;
    if (nr === null) return;
    const deps = this.relDeps();
    for (const p of new Set([...nr.keys.values()].map((k) => k.rel))) if (reachesIn(deps, p, head)) nr.faulted.add(p);
  }

  /** A FAULT BELOW A CALL ANSWERED ON DEMAND, in a firing. */
  private demandFault(depth: number, s: Subst): void {
    if (depth === 0 || !this.firing) return;
    const head = this.demandHeads[this.demandHeads.length - 1];
    if (head === undefined) return;
    const u = this.litUnknown(head, s);
    this.faultEdge(u);
    this.plainPending.push([u, true]);
  }

  /** A fault (`faults`) or an unknown (`unknowns`) met below a premise answered on demand leaves the call above it unknown under `s`. */
  private demandBelow(depth: number, s: Subst, faults: number, unknowns: number): void {
    if (this.faultCount > faults) this.demandFault(depth, s);
    else if (this.demandUnknown > unknowns) this.demandUnknownAt(depth, s, this.demandLast);
  }

  /** AN UNKNOWN BELOW A CALL ANSWERED ON DEMAND, in a firing: the call's head under `s` is unknown, reached from `from`, and so is each call up. */
  private demandUnknownAt(depth: number, s: Subst, from: Unknown | null): void {
    if (depth === 0 || !this.firing) return;
    const head = this.demandHeads[this.demandHeads.length - 1];
    if (head === undefined) return;
    const u = this.litUnknown(head, s);
    if (from !== null) this.unkEdges.push([nUnk(u), nUnk(from)]);
    this.plainPending.push([u, true]);
    this.demandLast = u;
    this.demandUnknown++;
  }

  /** The cells the body aggregate at element `i` holed under `s`. */
  private plainAggHoles(rid: string, a: AggElem, s: Subst, i: number): void {
    const [plan, corr] = this.aggCorr(rid, a, s);
    const mk = `${rid}|${a.at}|${listKey(corr)}`;
    if (this.aggOpened.has(mk)) {
      this.plainUndecided.push([rid, i, s, cellMarker(rid, a.at!, this.store.tick, corr)]);
      return;
    }
    for (const c of this.aggMemo.get(mk) ?? []) {
      const r = this.store.cells.get(c)!;
      // a group an unknown could change is carried from the unknown (`aggReachUndecided`)
      if (r.value.k !== 'hole' || r.value.reason === 'support_withdrawn') continue;
      const s2 = this.bindGroup(a, plan, s, r.keyTerms);
      if (s2 !== null) this.plainUndecided.push([rid, i, s2, cellMarker(r.rule, r.at, r.tick, r.keyTerms)]);
    }
  }

  /** CARRY WHAT PLAIN HOLES LEFT UNKNOWN before the rules of level `lv` fire. */
  private plainFlush(lv: number): void {
    if (this.plainPending.length === 0 && this.plainUndecided.length === 0) return;
    this.carrying(() => this.plainFlushAt(lv));
  }

  private plainFlushAt(lv: number): void {
    const closed = (rel: string) => lv === Infinity || this.relLevel(rel) < lv;
    const seeds: [Unknown, boolean][] = [];
    const keep: [string, number, Subst, Term][] = [];
    const und = this.plainUndecided;
    this.plainUndecided = [];
    for (const [rid, i, s, marker] of und) {
      const r = this.ruleOf(rid);
      if (!r) continue;
      if (!closed(r.clause.head.rel)) { keep.push([rid, i, s, marker]); continue; }
      this.carrySrc = nHole(marker);
      for (const s2 of this.poisonSolve(r, i, s)) {
        const v = this.reachedConclusion(r, s2, true);
        if (v !== null) { this.unkEdges.push([nUnk(v), nHole(marker)]); seeds.push([v, true]); }
      }
      this.carrySrc = null;
    }
    this.plainUndecided = keep;
    const pending = this.plainPending;
    this.plainPending = pending.filter(([u]) => !closed(uRelOf(u)));
    seeds.push(...pending.filter(([u]) => closed(uRelOf(u))));
    const fresh: Unknown[] = [];
    for (const [u, plain] of seeds) {
      if (this.latUnknown.has(u.id)) continue;
      if (u.k === 'tuple' && this.unknownHolds(u)) continue;
      if ((u.k === 'cell' || u.k === 'rel') && this.lattices.has(uRelOf(u))) {
        this.noteUnknown(u, null);
        this.latPending.push({ close: uRelOf(u), what: u, rule: null, reason: 'support_withdrawn', facts: [] });
        continue;
      }
      if (plain) this.latPlain.add(u.id);
      fresh.push(u);
    }
    if (fresh.length === 0) return;
    this.poisonWith(fresh, [], [], false);
    this.drainPoison();
  }

  /** `v`, reached from `from` by `rule`, noted as unknown; true if it is to be carried further now. */
  private carry(v: Unknown, from: Unknown, rule: string, reason: string, closing: string[]): boolean {
    this.unkEdges.push([nUnk(v), nUnk(from)]);
    const plain = this.latPlain.has(from.id);
    if (!this.noteUnknown(v, [from, rule])) {
      if (!plain && this.latPlain.delete(v.id)) {
        this.latUnknown.set(v.id, [v, [from, rule]]);
        return this.markUnknown(v, rule, reason, closing);
      }
      return false;
    }
    if (plain && (v.k === 'tuple' || v.k === 'rel') && !this.lattices.has(uRelOf(v))) {
      if (this.unknownHolds(v)) return false;
      this.latPlain.add(v.id);
      if (this.latSpread.has(v.id)) return false;
      this.latSpread.add(v.id);
      return true;
    }
    if (!this.markUnknown(v, rule, reason, closing)) return false;
    if (this.latSpread.has(v.id)) return false;
    this.latSpread.add(v.id);
    return true;
  }

  /** A literal read over an unknown: its key bound to the unknown's, every variable of its value the unknown value. */
  private unknownBinds(l: Lit, u: Unknown, s: Subst): Subst | null {
    if (u.k === 'cell') {
      const n = u.ck.key.length;
      if (this.cellKeylen(u.ck.rel, l.args.length) !== n) return null;
      let s2 = unify(l.persp, mka(u.ck.persp), s);
      for (let i = 0; s2 && i < n; i++) s2 = unify(l.args[i], u.ck.key[i], s2);
      return s2 && bindUnknown(l.args.slice(n), s2);
    }
    if (u.k === 'tuple') {
      if (l.args.length !== u.args.length) return null;
      let s2 = unify(l.persp, mka(u.persp), s);
      for (let i = 0; s2 && i < l.args.length; i++) s2 = unifyUnknown(l.args[i], u.args[i], s2);
      return s2;
    }
    if (this.isLatticeLit(u.rel, l.args.length)) return bindUnknown(l.args.slice(this.cellKeylen(u.rel, l.args.length)!), s);
    return s;
  }

  /** The lattice cell a literal names under `s`, when its key is bound. */
  private litCell(l: Lit, s: Subst): LatKey | null {
    const k = this.cellKeylen(l.rel, l.args.length);
    if (k === null) return null;
    const p = walk(l.persp, s);
    if (p.k !== 'a') return null;
    const key = l.args.slice(0, k).map((a) => resolve(a, s));
    return key.every(isGround) ? this.lk(l.rel, p.name, key) : null;
  }

  /** The body of `r` but its premise `skip`, over the facts that stand and the unknowns. */
  private poisonSolve(r: ERule, skip: number, s0: Subst): Subst[] { return this.poisonSolvePlan(r.plan, r.latticeOuter, skip, s0); }

  /** `poisonSolve` over a body, `outer` the lattices it reads from outside their recursion. */
  private poisonSolvePlan(plan: BodyElem[], outer: string[], skip: number, s0: Subst): Subst[] {
    let acc: Subst[] = [s0];
    for (let j = 0; j < plan.length; j++) {
      if (j === skip) continue;
      const b = plan[j];
      const next: Subst[] = [];
      for (const s of acc) {
        this.carryCharge(next.length);
        if (b.t === 'pos') {
          const lattice = this.isLatticeLit(b.lit.rel, b.lit.args.length) && !outer.includes(b.lit.rel);
          const whole = this.latUnknown.has(uRel(b.lit.rel).id);
          // an argument that holds the unknown matches anything, and what it matches is that value only in some
          // completions: a join on an unknown is not sure
          const wild: [number, Term][] = [];
          const l: Lit = { ...b.lit, args: b.lit.args.map((a, i) => { const t = resolve(a, s); if (!holdsUnknown(t)) return a; wild.push([i, t]); return mkv(`?unknown${j}_${i}`); }) };
          const joined = wild.length > 0;
          for (const [s2] of this.matchPremise(l, s, 0, null)) {
            if (lattice) {
              if (whole) continue;
              const ck = this.litCell(l, s2);
              if (ck !== null && this.latUnknown.has(uCell(ck).id)) continue;
            }
            next.push(joined ? unsure(s2) : s2);
          }
          let bound: [number, Term] | null = null;
          if (lattice) {
            const n = this.cellKeylen(l.rel, l.args.length)!;
            for (let i = 0; i < n; i++) { const t = resolve(l.args[i], s); if (isGround(t)) { bound = [i, t]; break; } }
          }
          const ckOpt = this.isLatticeLit(l.rel, l.args.length) ? this.litCell(l, s) : null;
          let cands: Unknown[];
          if (lattice && ckOpt !== null) cands = [uCell(ckOpt), uRel(l.rel)].filter((u) => this.latUnknown.has(u.id));
          else if (lattice && bound !== null) {
            cands = [...(this.latUnknownAt.get(`${l.rel}|${bound[0]}|${canonTerm(bound[1])}`) ?? [])];
            if (this.latUnknown.has(uRel(l.rel).id)) cands.push(uRel(l.rel));
          } else cands = this.unknownCands(l, s);
          for (const u of cands) {
            if (!lattice && !this.latSpread.has(u.id)) continue;
            if (lattice && u.k === 'tuple') continue;
            const s2 = this.unknownBinds(l, u, s);
            const same = !joined || (u.k === 'tuple' && wild.every(([i, t]) => i < u.args.length && (canonTerm(u.args[i]) === canonTerm(t) || sameLabel(t, u.args[i]))));
            if (s2 !== null) next.push(same && this.sureUnknown(u) ? s2 : unsure(s2));
          }
          for (const u of this.undefAtoms?.get(l.rel) ?? []) {
            const s2 = this.unknownBinds(l, u, s);
            if (s2 !== null) next.push(unsure(s2));
          }
        } else if (b.t === 'neg') {
          const args = b.lit.args.map((a) => resolve(a, s));
          const undecided = args.some((a) => holdsUnknown(a) || !isGround(a)) || this.readsUndefined(b.lit, s);
          if (undecided) next.push(unsure(s));
          else if (this.negHolds(b.lit, s, 0)) next.push(s);
        } else if (b.t === 'bi') {
          const lv = resolve(b.l, s), rv = resolve(b.r, s);
          const unknown = holdsUnknown(lv) || holdsUnknown(rv);
          const open = b.op === 'is' || b.op === 'in' ? !isGround(rv) : b.op === '=' ? false : !isGround(lv) || !isGround(rv);
          if (unknown || open) { const s2 = bindUnknown([b.l, b.r], s); if (s2 !== null) next.push(unsure(s2)); continue; }
          const faults = this.faultCount;
          const s2s = this.evalBuiltins(b.op, b.l, b.r, s, null);
          if (s2s.length === 0 && this.faultCount > faults) { const s2 = bindUnknown([b.l, b.r], s); if (s2 !== null) next.push(unsure(s2)); }
          next.push(...s2s);
        } else {
          const s2 = bindUnknown([b.res], s);
          if (s2 !== null) next.push(unsure(s2));
        }
      }
      this.carrySteps += next.length;
      this.carryCheck(next.length);
      acc = next;
      if (acc.length === 0) break;
    }
    return acc;
  }

  /** An unknown, as whynot and why name it: a labeled value as it is written (`unknownText` is the key they are ordered by). */
  unknownShown(u: Unknown): string {
    if (u.k !== 'tuple') return this.unknownText(u);
    const labeled = (t: Term): boolean => isLabeled(t) || (t.k === 'f' && t.args.some(labeled));
    return `${u.rel}[${u.persp}](${u.args.map((a) => (labeled(a) ? shown(a) : canonTerm(a).split('$unknown_value').join('_'))).join(',')})`;
  }

  /** An unknown, as whynot names it. */
  unknownText(u: Unknown): string {
    if (u.k === 'cell') return factKey(u.ck.rel, u.ck.persp, u.ck.key);
    if (u.k === 'tuple') return factKey(u.rel, u.persp, u.args).split('$unknown_value').join('_');
    return `every ${this.lattices.has(u.rel) ? 'cell' : 'tuple'} of ${u.rel}`;
  }

  /** THE FIRINGS THAT READ A VALUE SINCE IMPROVED ON, decided when their lattice closes. */
  private settleStale(due: string[]): void {
    const cand = [...this.latStale].filter((f) => this.alive(f)).sort(cmpStr);
    this.latStale.clear();
    const sup = this.latSuperseded;
    this.latSuperseded = new Set();
    const memo = new Map<string, number>();
    this.heights(cand, memo, (_f, _r, ps) => ps.some((p) => p.t === 'fact' && sup.has(p.key)));
    const keep: string[] = [];
    for (const f of cand) {
      if (memo.has(f)) this.forgetRules(f, this.dropFiringsOfCiting(f, sup));
      else keep.push(f);
    }
    const reach = new Set<string>();
    const stack = keep.flatMap((f) => this.factPremises(f));
    while (stack.length > 0) {
      const g = stack.pop()!;
      if (sup.has(g) && !reach.has(g)) { reach.add(g); stack.push(...this.factPremises(g)); }
    }
    for (const f of sup) {
      if (reach.has(f) || !due.includes(this.rec(f).rel)) this.latSuperseded.add(f);
      else this.store.dropFirings(f);
    }
    for (const [k, v] of [...this.latHistory]) {
      const kept = v.filter((f) => this.latSuperseded.has(f));
      if (kept.length === 0) this.latHistory.delete(k); else this.latHistory.set(k, kept);
    }
  }

  /** A firing's height: 1 + its highest premise. */
  private firingHeight(prems: PremRef[]): number {
    let h = 0;
    for (const p of prems) {
      if (p.t === 'fact') h = Math.max(h, this.heightMemo.get(p.key) ?? 0);
      else if (p.t === 'cell') h = Math.max(h, this.store.cells.get(p.key)!.height);
    }
    return h + 1;
  }

  /** A lattice fact's members, canonical: every firing by height, then rule, then signature. */
  private bestMembers(f: string): [number, string, number, PremRef[]][] {
    const bad = this.heights([f], this.heightMemo, null);
    if (bad !== null) throw new Bug(`${bad} has no well-founded height`);
    const ms = this.firings(f).map((w): [number, string, string, number, PremRef[]] =>
      [this.firingHeight(w.prems), w.ruleId, firingSig(w.ruleId, w.prems), w.tick, w.prems]);
    ms.sort((a, b) => a[0] - b[0] || cmpStr(a[1], b[1]) || cmpStr(a[2], b[2]));
    return ms.map(([h, r, , t, p]) => [h, r, t, p]);
  }

  /** The dominators of the derivation graph of `p`'s recursion. */
  private recursionDominators(p: string, facts: string[]): Dominators | null {
    const deps = this.relDeps((r) => r.posRels);
    const closure = (from: string): Set<string> => {
      const seen = new Set<string>();
      const stack = [from];
      while (stack.length > 0) { const x = stack.pop()!; if (!seen.has(x)) { seen.add(x); stack.push(...(deps.get(x) ?? [])); } }
      return seen;
    };
    const below = closure(p);
    const scc = new Set([...below].filter((r) => r === p || closure(r).has(p)));
    const nodes: string[] = [];
    const seen = new Set<string>();
    const stack = [...facts];
    while (stack.length > 0) {
      const g = stack.pop()!;
      if (!this.heightMemo.has(g) || !scc.has(this.rec(g).rel) || seen.has(g)) continue;
      seen.add(g);
      nodes.push(g);
      stack.push(...this.factPremises(g));
    }
    nodes.sort(cmpStr);
    return this.dominators(nodes, this.heightMemo);
  }

  /** DOMINATORS OF THE DERIVATION GRAPH over `nodes` (Cooper, Harvey and Kennedy). */
  private dominators(nodes: string[], height: Map<string, number>): Dominators | null {
    const at = new Map(nodes.map((f, i) => [f, i + 1]));
    const n = nodes.length + 1;
    const preds: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < nodes.length; i++) {
      for (const w of this.firings(nodes[i])) {
        let inside: number | null = null;
        let usable = true;
        for (const p of w.prems) {
          if (p.t !== 'fact') continue;
          if (!height.has(p.key)) { usable = false; break; }
          const j = at.get(p.key);
          if (j !== undefined) { if (inside !== null && inside !== j) return null; inside = j; }
        }
        if (usable) preds[i + 1].push(inside ?? 0);
      }
    }
    const succ: number[][] = Array.from({ length: n }, () => []);
    preds.forEach((ps, x) => { for (const p of ps) succ[p].push(x); });
    const post = new Array<number>(n).fill(-1);
    const order: number[] = [];
    const visited = new Array<boolean>(n).fill(false);
    const stack: [number, number][] = [[0, 0]];
    visited[0] = true;
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const x = top[0];
      if (top[1] < succ[x].length) {
        const y = succ[x][top[1]++];
        if (!visited[y]) { visited[y] = true; stack.push([y, 0]); }
      } else { post[x] = order.length; order.push(x); stack.pop(); }
    }
    const idom = new Array<number>(n).fill(-1);
    idom[0] = 0;
    let changed = true;
    while (changed) {
      changed = false;
      for (const x of [...order].reverse().slice(1)) {
        let nw = -1;
        for (const p of preds[x]) {
          if (idom[p] === -1) continue;
          if (nw === -1) nw = p;
          else {
            let a = p, b = nw;
            while (a !== b) {
              while (post[a] < post[b]) a = idom[a];
              while (post[b] < post[a]) b = idom[b];
            }
            nw = a;
          }
        }
        if (nw !== -1 && idom[x] !== nw) { idom[x] = nw; changed = true; }
      }
    }
    const kids: number[][] = Array.from({ length: n }, () => []);
    for (let x = 1; x < n; x++) if (idom[x] !== -1) kids[idom[x]].push(x);
    const tin = new Array<number>(n).fill(0), tout = new Array<number>(n).fill(0);
    let t = 0;
    const st: [number, number][] = [[0, 0]];
    while (st.length > 0) {
      const top = st[st.length - 1];
      const x = top[0];
      if (top[1] < kids[x].length) { const y = kids[x][top[1]++]; t++; tin[y] = t; st.push([y, 0]); }
      else { tout[x] = t; st.pop(); }
    }
    return new Dominators(at, tin, tout, idom.map((d) => d !== -1));
  }

  /** The premises of one firing of `g` that has `g`'s height. */
  private leastFiring(g: string, height: Map<string, number>): PremRef[] | null {
    const hg = height.get(g);
    if (hg === undefined) return null;
    for (const w of this.firings(g)) {
      let h = 0, known = true;
      for (const p of w.prems) {
        if (p.t === 'fact') { const hx = height.get(p.key); if (hx === undefined) known = false; else h = Math.max(h, hx); }
        else if (p.t === 'cell') h = Math.max(h, this.store.cells.get(p.key)!.height);
      }
      if (known && h + 1 === hg) return w.prems;
    }
    return null;
  }

  /** WHICH OF `qs` HAVE A DERIVATION THAT DOES NOT USE `f`. */
  private foundedWithout(f: string, qs: string[], height: Map<string, number>): Set<string> {
    const hf = height.get(f)!;
    const above = (g: string) => { const h = height.get(g); return h === undefined || h > hf; };
    const ok = new Set<string>();
    const slow: string[] = [];
    for (const q of qs) {
      const stack = [q];
      const seen = new Set<string>();
      let bad = false;
      while (stack.length > 0) {
        const g = stack.pop()!;
        if (g === f) { bad = true; break; }
        if (!above(g) || seen.has(g)) continue;
        seen.add(g);
        const ps = this.leastFiring(g, height);
        if (ps === null) { bad = true; break; }
        stack.push(...factPrems(ps));
      }
      if (bad) slow.push(q); else ok.add(q);
    }
    if (slow.length === 0) return ok;
    const region: string[] = [];
    const at = new Map<string, number>();
    const stack = [...slow];
    while (stack.length > 0) {
      const g = stack.pop()!;
      if (g === f || !above(g) || !height.has(g) || at.has(g)) continue;
      at.set(g, region.length);
      region.push(g);
      stack.push(...this.factPremises(g));
    }
    const open: [number, number][] = [];
    const users: number[][] = region.map(() => []);
    const queue: number[] = [];
    region.forEach((g, i) => {
      for (const w of this.firings(g)) {
        const need: number[] = [];
        let dead = false;
        for (const p of w.prems) {
          if (p.t !== 'fact') continue;
          if (p.key === f || !height.has(p.key)) { dead = true; break; }
          if (above(p.key)) need.push(at.get(p.key)!);
        }
        if (dead) continue;
        const k = open.length;
        open.push([i, need.length]);
        if (need.length === 0) queue.push(i);
        for (const j of need) users[j].push(k);
      }
    });
    const done = region.map(() => false);
    while (queue.length > 0) {
      const i = queue.pop()!;
      if (done[i]) continue;
      done[i] = true;
      for (const k of users[i]) { open[k][1]--; if (open[k][1] === 0 && !done[open[k][0]]) queue.push(open[k][0]); }
    }
    for (const q of slow) { const i = at.get(q); if (i !== undefined && done[i]) ok.add(q); }
    return ok;
  }

  private closeLattice(p: string, front: Front): void {
    const facts = this.relAll(p);
    const bad = this.heights(facts, this.heightMemo, null);
    if (bad !== null) throw new Bug(`${bad} has no well-founded height`);
    const doms = this.recursionDominators(p, facts);
    for (const f of [...facts].sort(cmpStr)) {
      const hf = this.heightMemo.get(f)!;
      const members = this.bestMembers(f);
      if (members.length > 1) {
        const hm = (q: string) => this.heightMemo.get(q) ?? Infinity;
        const high = [...new Set(members.flatMap((m) => m[3]).flatMap((q) => (q.t === 'fact' && q.key !== f && hm(q.key) > hf ? [q.key] : [])))].sort(cmpStr);
        const founded = doms !== null
          ? new Set(high.filter((q) => (doms.covers(q) ? doms.foundedWithout(f, q) : this.heightMemo.has(q))))
          : this.foundedWithout(f, high, this.heightMemo);
        for (const [, rule, , prems] of members) {
          const selfish = prems.some((q) => q.t === 'fact' && (q.key === f || (hm(q.key) > hf && !founded.has(q.key))));
          if (selfish) {
            this.store.removeFiring(f, firingSig(rule, prems));
            if (!this.firings(f).some((w) => w.ruleId === rule)) this.retireDerivedBy(f, rule);
          }
        }
      }
      if (this.answer.readsLatticeMembers && !this.noProvenance) {
        const rec = this.rec(f);
        const ft = factTerm(rec.rel, rec.persp, rec.args);
        const rows: [string, Term[]][] = [];
        this.bestMembers(f).forEach(([hgt, rule, , prems], i) => {
          const n = mki(i + 1);
          rows.push([V.lattice_member, [ft, n, mki(hgt), mka(rule)]]);
          for (const q of prems) rows.push([V.lattice_member_prem, [ft, n, this.premTerm(q)]]);
        });
        for (const [rel, args] of rows) {
          const [isNew, id] = this.put(rel, KERNEL_PERSP, args, F_TICK);
          if (isNew) { this.chargeRow(null, false); noteFront(front, rel, id); }
        }
      }
    }
    if (this.subs.has(p) && this.answer.readsDominated && !this.noProvenance) {
      const rows: [string, Term[]][] = [];
      for (const [sv, [f, rule]] of this.subBy) {
        const ckId = sv.slice(0, sv.indexOf('|'));
        const ck = this.cks.get(ckId)!;
        if (ck.rel !== p || !this.alive(f)) continue;
        const d = this.subByVals.get(sv)!;
        const dt = this.subFact(p, ck.persp, this.subArgs(ck, d));
        const rec = this.rec(f);
        rows.push([canonTerm(dt), [dt, this.subFact(rec.rel, rec.persp, rec.args), mka(rule)]]);
      }
      rows.sort((a, b) => cmpStr(a[0], b[0]));
      for (const [, args] of rows) {
        const [isNew, id] = this.put(V.dominated_by, KERNEL_PERSP, args, F_TICK);
        if (isNew) { this.chargeRow(null, false); noteFront(front, V.dominated_by, id); }
      }
    }
  }
  /** Each `subBy` entry's dominated values, by the same key. */
  private subByVals = new Map<string, Term[]>();

  /** THE ANTICHAIN, CHECKED AT THE CLOSE. */
  private subCheck(due: string[]): void {
    if (this.subs.size === 0) return;
    const cells = [...this.subSeen.keys()].map((id) => this.cks.get(id)!).filter((ck) => due.includes(ck.rel) && !this.latHoledRel.has(ck.rel))
      .map((ck): [string, LatKey] => [factKey(ck.rel, ck.persp, ck.key), ck]).sort((a, b) => cmpStr(a[0], b[0]));
    cells: for (const [, ck] of cells) {
      if (this.subParties.has(ck.id)) continue;
      const rel = ck.rel;
      const k = ck.key.length;
      const front = (this.subCur.get(ck.id) ?? []).filter((f) => this.alive(f)).sort(cmpStr).map((f): [string, number, Term[]] => {
        const a = this.rec(f).args;
        return [f, this.subSeenSet.get(`${ck.id}|${listKey(a.slice(k))}`)!, a];
      });
      const seen = [...(this.subSeen.get(ck.id) ?? [])];
      const parties: Term[] = [];
      const by: [Term[], string, string][] = [];
      for (let di = 0; di < seen.length; di++) {
        const d = seen[di];
        if (front.some(([, , a]) => listKey(a.slice(k)) === listKey(d))) continue;
        const dargs = this.subArgs(ck, d);
        let found = false;
        for (const [f, ai, aargs] of front) {
          const v = this.subDom(ck, [di, dargs], [ai, aargs]);
          if (v.k === 'yes') { by.push([d, f, v.rule]); found = true; break; }
          if (v.k !== 'no') { this.subUndecided(ck, v); continue cells; }
        }
        if (!found) {
          parties.push(this.subFact(rel, ck.persp, dargs));
          for (let xi = 0; xi < seen.length; xi++) {
            const xargs = this.subArgs(ck, seen[xi]);
            const v = this.subDom(ck, [di, dargs], [xi, xargs]);
            if (v.k === 'yes') parties.push(this.subFact(rel, ck.persp, xargs));
            else if (v.k !== 'no') { this.subUndecided(ck, v); continue cells; }
          }
        }
      }
      for (const [, ai, aargs] of front) {
        for (let di = 0; di < seen.length; di++) {
          const d = seen[di];
          if (listKey(aargs.slice(k)) === listKey(d)) continue;
          const dargs = this.subArgs(ck, d);
          const v = this.subDom(ck, [ai, aargs], [di, dargs]);
          if (v.k === 'yes') { parties.push(this.subFact(rel, ck.persp, aargs)); parties.push(this.subFact(rel, ck.persp, dargs)); }
          else if (v.k !== 'no') { this.subUndecided(ck, v); continue cells; }
        }
      }
      if (parties.length > 0) { this.subConflict(ck, 'dominance_intransitive', parties); continue; }
      for (const [d, f, r] of by) {
        let e = this.subByOf.get(f);
        if (!e) { e = []; this.subByOf.set(f, e); }
        e.push(d);
        const sv = `${ck.id}|${listKey(d)}`;
        this.subBy.set(sv, [f, r]);
        this.subByVals.set(sv, d);
      }
    }
  }

  /** A WALL leaves values that are not final: every open lattice is a hole with the wall's reason. */
  private latticeCut(reason: string): void {
    if (this.lattices.size === 0) return;
    this.carrySteps = 0; this.carryRows = 0;
    try {
      this.withWallsLifted(() => { this.closeSettled(); this.latticeCutOpen(reason); });
    } catch (e) {
      if (!(e instanceof Wall)) throw e;
      this.withWallsLifted(() => {
        for (const p of [...this.lattices.keys()].filter((p) => !this.latClosed.has(p)).sort(cmpStr)) this.holeLatticeRel(p, reason);
        this.latticeSettle(true);
      });
    }
  }

  /** A LATTICE THE WALL DID NOT REACH closes as it would have. */
  private closeSettled(): void {
    if (this.carryBroken) return;
    const unsettled = new Set<string>(this.liveFront);
    for (const k of this.curFront.byRel.keys()) unsettled.add(k);
    for (const r of this.batch.slice(this.batchAt)) unsettled.add(r.clause.head.rel);
    for (const [u] of this.plainPending) unsettled.add(uRelOf(u));
    const undecided = [...this.plainUndecided.map((x) => x[0]), ...this.latUndecided.map((x) => x[0])];
    for (const r of this.rules) if (undecided.includes(r.id)) unsettled.add(r.clause.head.rel);
    const active = new Set(this.active.map((r) => r.id));
    const reads = new Map<string, string[]>();
    for (const r of this.rules.filter((r) => r.safe)) {
      if (r.clause.head.temporal === 'next') continue;
      if (!active.has(r.id)) unsettled.add(r.clause.head.rel);
      let e = reads.get(r.clause.head.rel);
      if (!e) { e = []; reads.set(r.clause.head.rel, e); }
      for (const b of r.plan) for (const l of litsOf(b)) e.push(l.rel);
    }
    const settled: string[] = [];
    for (const p of [...this.lattices.keys()].filter((p) => !this.latClosed.has(p))) {
      const seen = new Set([p]);
      const todo = [p];
      let ok = true;
      while (todo.length > 0) {
        const q = todo.pop()!;
        if (unsettled.has(q)) { ok = false; break; }
        for (const x of reads.get(q) ?? []) if (!seen.has(x)) { seen.add(x); todo.push(x); }
      }
      if (ok) settled.push(p);
    }
    if (settled.length === 0) return;
    settled.sort(cmpStr);
    this.subCheck(settled);
    this.applyLatticeHolesAt(settled, true);
    this.joinCovers(settled);
    this.settleStale(settled);
    this.joinGc(settled);
    const front = newFront();
    for (const p of settled) { this.latClosed.add(p); this.closeLattice(p, front); }
  }

  private latticeCutOpen(reason: string): void {
    const open = [...this.lattices.keys()].filter((p) => !this.latClosed.has(p)).sort(cmpStr);
    const pending = this.latPending;
    this.latPending = [];
    const standing = pending.filter((x) => x.facts.every((f) => this.alive(f)))
      .map((x) => (x.reason === 'widening_forced' ? { ...x, reason } : x));
    const seeds = this.applyFaults(standing);
    this.latticeSettle(true);
    const cycling = this.improvingCycles(open);
    const groups = new Map<number, number>();
    for (const [ck, c] of cycling) {
      const marker = this.holeLatticeCell(ck, 'improving_cycle');
      let gi = groups.get(c);
      if (gi === undefined) { gi = this.cycleGroups.length; this.cycleGroups.push([]); groups.set(c, gi); }
      this.cycleGroups[gi].push(marker);
      this.cycleOf.set(canonTerm(marker), gi);
      seeds.push(uCell(ck));
    }
    this.poison(seeds, open, true);
    this.joinCovers(open);
    for (const p of open) this.cellHole(mkf('$lattice', [mka(p)]), reason);
  }

  /** THE CELLS ON AN IMPROVING CYCLE of the open lattices. */
  private improvingCycles(open: string[]): [LatKey, number][] {
    const roots: string[] = [];
    for (const p of open) roots.push(...this.relAll(p));
    for (const f of this.latSuperseded) if (open.includes(this.rec(f).rel)) roots.push(f);
    roots.sort(cmpStr);
    const ids = new Map<string, number>();
    const names: Unknown[] = [];
    const succ: number[][] = [];
    const node = (u: Unknown): number => {
      let i = ids.get(u.id);
      if (i === undefined) { i = names.length; ids.set(u.id, i); names.push(u); succ.push([]); }
      return i;
    };
    const seen = new Set<string>();
    const stack = roots;
    while (stack.length > 0) {
      const f = stack.pop()!;
      if (seen.has(f) || this.rec(f).base) continue;
      seen.add(f);
      const prems = this.cyclePrems(f);
      if (prems === null) continue;
      const t = node(this.unknownOf(f));
      for (const q of prems) {
        if (this.rec(q).base) continue;
        succ[node(this.unknownOf(q))].push(t);
        stack.push(q);
      }
    }
    const comp = tarjan(succ);
    const size = new Map<number, number>();
    for (const c of comp) size.set(c, (size.get(c) ?? 0) + 1);
    const out: [string, LatKey, number][] = [];
    names.forEach((n, i) => {
      if (n.k !== 'cell') return;
      const ck = n.ck;
      if (!open.includes(ck.rel) || !this.latHistory.has(ck.id)) return;
      if (this.joinRels.has(ck.rel)) return;
      if ((size.get(comp[i])! > 1 || succ[i].includes(i)) && this.reachedFromOwn(ck)) out.push([this.unknownText(n), ck, comp[i]]);
    });
    out.sort((a, b) => cmpStr(a[0], b[0]));
    return out.map((x) => [x[1], x[2]]);
  }

  /** The fact premises of the firing `f` was first concluded by. */
  private cyclePrems(f: string): string[] | null {
    const ws = this.store.firingList(f);
    return ws.length === 0 ? null : factPrems(ws[0].prems);
  }

  /** Was some value of the cell first concluded from an earlier value of its own? */
  private reachedFromOwn(ck: LatKey): boolean {
    const own = uCell(ck).id;
    const stack = [...(this.latHistory.get(ck.id) ?? [])];
    const cur = this.latCur.get(ck.id);
    if (cur !== undefined) stack.push(cur);
    stack.push(...(this.subCur.get(ck.id) ?? []));
    const seen = new Set<string>();
    while (stack.length > 0) {
      const f = stack.pop()!;
      if (seen.has(f) || this.rec(f).base) continue;
      seen.add(f);
      for (const q of this.cyclePrems(f) ?? []) {
        if (this.rec(q).base) continue;
        if (this.unknownOf(q).id === own) return true;
        stack.push(q);
      }
    }
    return false;
  }

  /** WHAT A TAG REFUSES: a second algebra, an asserted fact, counting inside its own recursion. */
  private refuseTags(): void {
    const reject = (m: string) => new Rejected(`program rejected: ${m}`);
    if (this.tags.refused.length > 0) throw reject(this.tags.refused[0]);
    const names = [...this.tags.byRel.keys()].sort(cmpStr);
    for (const p of names) {
      const alg = this.tags.byRel.get(p)![1];
      for (const r of this.store.relAll(p)) {
        if (r.base || r.frozen) throw reject(`${r.key} is asserted, but ${p} is tagged (${alg}): a tag holds what its rules conclude; assert the input into another relation and conclude it, its weight the head's tag`);
      }
    }
    for (const p of names) {
      const c = this.tags.countRel.get(p);
      if (c === undefined) continue;
      if (this.answer.demandRels.includes(c) || this.answer.demandRels.includes(p)) {
        throw reject(`tag ${p} (counting): a rule concluding it is not range-restricted, so its derivations would be unfolded at a call site`);
      }
    }
    const deps = this.relDeps();
    const inRecursion = (p: string) => this.rules.some((r) => r.clause.head.rel === p && r.clause.head.temporal !== 'next'
      && r.clause.body.flatMap(litsOf).some((l) => reachesIn(deps, l.rel, p)));
    const counting = names.find((p) => !tagIdempotent(this.tags.byRel.get(p)![1]) && inRecursion(p));
    if (counting !== undefined) {
      throw reject(`tag ${counting} (counting) is inside its own recursion: counting's ⊕ is not idempotent, so a count of derivations through a recursion need not settle (it is not p-stable); count over a relation closed below it, or tag it tropical, viterbi or trust`);
    }
  }

  private refuseLattices(): void {
    const reject = (m: string) => new Rejected(`program rejected: ${m}`);
    if (this.declRefused.length > 0) throw reject(this.declRefused[0]);
    const dom = this.answer.latticeRefused.find(([p]) => this.dominanceRel(p));
    if (dom !== undefined) {
      const text = dom[1] === 'two_algebras' ? 'it has dominance rules and is declared a lattice or a tag too; a relation has one algebra'
        : dom[1] === 'two_arities' ? 'its dominance rules compare its facts at two arities'
        : dom[1] === 'two_keys' ? 'its dominance rules read two keys: the prefix both facts share must be the same in every rule'
        : dom[1] === 'two_orders' ? 'its declarations order it two ways: a relation has one declared order, in one direction for each value'
        : dom[1] === 'order_and_rules' ? 'it has a declared order and dominance rules of its own: the declaration is its whole dominance, whose transitivity is by construction; write the rules or declare the order'
        : 'safety.rofl refused its dominance rules';
      throw reject(`subsumption ${dom[0]}: ${text}`);
    }
    const counted = [...this.tags.byRel.keys()].filter((p) => this.dominanceRel(p) && !this.subs.has(p)).sort(cmpStr);
    if (counted.length > 0) throw reject(`subsumption ${counted[0]}: it has dominance rules and is a tag too; a relation has one algebra`);
    const lr = this.answer.latticeRefused[0];
    if (lr !== undefined) {
      const text = lr[1] === 'not_idempotent' ? "a lattice's ⊕ must be idempotent (min, max, or, and; union, hull, bitor): count, sum, median, quantile and rank are body aggregates, stratified"
        : lr[1] === 'two_algebras' ? 'it is declared with two operations; a relation has one algebra'
        : lr[1] === 'two_arities' ? 'it is declared with two arities'
        : lr[1] === 'widen_not_hull' ? "a widening is declared for an interval hull only: a union's top is no set, a bitor has finite height, and an order lattice that never settles is an improving cycle"
        : lr[1] === 'two_widenings' ? 'it is declared with two widenings'
        : 'safety.rofl refused the declaration';
      throw reject(`lattice ${lr[0]}: ${text}`);
    }
    if (this.lattices.size === 0) return;
    const names = [...this.lattices.keys()].sort(cmpStr);
    for (const p of names) {
      for (const r of this.store.relAll(p)) {
        if (r.base || r.frozen) {
          throw reject(this.subs.has(p)
            ? `${r.key} is asserted, but ${p} is subsumptive: its cells hold the values its rules conclude that none dominates; assert the input into another relation and conclude it`
            : `${r.key} is asserted, but ${p} is a lattice (${this.lattices.get(p)![1]}): a lattice cell holds what its rules conclude; assert the input into another relation and conclude it`);
        }
      }
      if (this.answer.demandRels.includes(p)) throw reject(`${this.latWord(p)} ${p}: a rule concluding it is not range-restricted, so its cells would be unfolded at a call site`);
    }
    const r = this.rules.find((r) => this.answer.demandRels.includes(r.clause.head.rel) && r.clause.body.flatMap(litsOf).some((l) => this.lattices.has(l.rel)));
    if (r !== undefined) {
      const lat = r.clause.body.flatMap(litsOf).find((l) => this.lattices.has(l.rel))!.rel;
      throw reject(`rule ${r.id} reads the ${this.latWord(lat)} ${lat} and concludes ${r.clause.head.rel}, which is answered on demand (a rule concluding it is not range-restricted): it would be unfolded while the ${this.latWord(lat)} is still improving`);
    }
    if (this.answer.readsProvenance) {
      throw reject(`a rule reads ${V.derived_by} beside the ${this.latWord(names[0])} ${names[0]}: a cell that improves withdraws its old firings, so provenance read during the evaluation would change under the reader`);
    }
  }

  /** THE STOCK EVALUATOR CLOSES A LATTICE WHERE ITS TABLE SAYS. */
  private checkLatticeStrata(strat: Map<string, number>, stratRules: ERule[]): void {
    for (const p of [...this.lattices.keys()].filter((p) => this.derivedRels.has(p)).sort(cmpStr)) {
      if (!strat.has(p)) throw new Rejected(`program rejected: the stock evaluator cannot close the ${this.latWord(p)} ${p}: it has no stratum row (load rules/strata.rofl, or run the default evaluator)`);
    }
    for (const r of stratRules.filter((r) => r.latticeOuter.length > 0)) {
      const at = r.clause.head.temporal === 'next' ? Infinity : strat.get(r.clause.head.rel);
      for (const p of r.latticeOuter) {
        const i = strat.get(p);
        const ok = at !== undefined && i !== undefined ? i < at : !this.derivedRels.has(p);
        if (!ok) throw new Rejected(`program rejected: rule ${r.id}: the stock evaluator cannot order its read of the ${this.latWord(p)} ${p}: a rule reading it from outside its recursion must be ranked strictly above it (load rules/strata.rofl, or run the default evaluator)`);
      }
    }
  }

  /** The aggregate as written, the correlation substituted: `why`'s name for a cell. */
  private aggDesc(a: AggElem, s: Subst): string {
    const terms = (ts: Term[]) => ts.map((t) => canonTerm(resolve(t, s))).join(',');
    let out = `${a.op}(`;
    if (a.op === 'at_least') out += `${terms([a.res])}, `;
    out += terms(a.vals);
    if (a.keys.length > 0) out += ` ; ${terms(a.keys)}`;
    out += ' : ';
    out += a.body.map((b) => {
      if (b.t === 'pos') return this.resolvedLitKey(b.lit, s);
      if (b.t === 'neg') return 'not ' + this.resolvedLitKey(b.lit, s);
      if (b.t === 'bi') return `${canonTerm(resolve(b.l, s))} ${b.op} ${canonTerm(resolve(b.r, s))}`;
      return '(aggregate)';
    }).join(', ');
    return out + ')';
  }

  /** `hole($cell(...), Reason)`, written the way `arithHole` writes one. */
  private cellHole(marker: Term, reason: string): void {
    if (this.holeMet(marker, reason)) this.chargeHoleRow();
    const [isNew, id] = this.evalHolePut([marker, mka(reason)]);
    if (isNew) noteFront(this.curFront, V.hole, id);
  }

  /** A hole row of this evaluation (`Store.evalHoles`); true if it was new. */
  private evalHole(args: Term[]): boolean { return this.evalHolePut(args)[0]; }
  private evalHolePut(args: Term[]): [boolean, string] {
    const r = this.put(V.hole, KERNEL_PERSP, args, F_BASE_FROZEN);
    if (r[0]) this.store.evalHoles.push(r[1]);
    return r;
  }

  /** THE CELL AS FACTS, for rules to read. */
  private reflectCell(c: string): void {
    if (this.noProvenance) return;
    const r = this.store.cells.get(c)!;
    if (r.tick === this.store.tick && this.nextRules.has(r.rule)) return;
    const key = cellMarker(r.rule, r.at, r.tick, r.keyTerms);
    const rows: [string, Term[]][] = [];
    if (r.value.k === 'value') rows.push([V.agg_cell, [key, r.value.t, mki(r.height)]]);
    for (const x of r.seals) rows.push([V.agg_sealed, [key, mka(x.rel), mki(x.round)]]);
    if (this.answer.readsMembers) {
      r.members.forEach((m, i) => {
        const n = mki(i + 1);
        rows.push([V.agg_member, [key, n, list(m.proj), mki(m.height)]]);
        for (const p of m.prems) rows.push([V.agg_member_prem, [key, n, this.premTerm(p)]]);
      });
    }
    for (const [rel, args] of rows) {
      const [isNew, id] = this.put(rel, KERNEL_PERSP, args, F_TICK);
      if (isNew) { this.chargeRow(null, false); noteFront(this.curFront, rel, id); }
    }
  }

  /** A member's premise as a term. */
  private premTerm(p: PremRef): Term {
    if (p.t === 'fact') { const r = this.rec(p.key); return factTerm(r.rel, r.persp, r.args); }
    if (p.t === 'neg') return mkf('$neg', [mks(p.key)]);
    if (p.t === 'bi') return mkf('$bi', [mks(p.desc)]);
    const c = this.store.cells.get(p.key)!;
    return cellMarker(c.rule, c.at, c.tick, c.keyTerms);
  }

  resolvedLitKey(l: Lit, s: Subst): string {
    return `${l.rel}[${canonTerm(walk(l.persp, s))}](${l.args.map((a) => canonTerm(resolve(a, s))).join(',')})`;
  }

  anonLitKey(l: Lit, s: Subst): string {
    const cv = canonVars([walk(l.persp, s), ...l.args.map((a) => resolve(a, s))]);
    return `${l.rel}[${canonTerm(cv[0])}](${cv.slice(1).map(canonTerm).join(',')})`;
  }

  /** The facts of a premise's relation that agree with what is ground in it, when the store indexes it. */
  private indexProbe(l: Lit, s: Subst, persp: string | null): FactRec[] | null {
    if (!this.store.indexed(l.rel, persp)) return null;
    const pos: number[] = [], vals: string[] = [];
    l.args.forEach((a, i) => { const t = resolve(a, s); if (isGround(t)) { pos.push(i); vals.push(canonTerm(t)); } });
    if (pos.length === 0) return null;
    return this.store.argMatches(l.rel, persp, l.args.length, pos, vals);
  }

  private scanRel(rel: string, persp: string | null): FactRec[] {
    return persp !== null ? this.store.relPersp(rel, persp) : this.store.relAll(rel);
  }

  /** Matches for one positive premise: store facts plus demand unfolding. */
  matchPremise(l: Lit, s: Subst, depth: number, only: Set<string> | null): [Subst, PremRef][] {
    if (l.temporal === 'init' && this.store.tick !== 0) return [];
    const perspT = walk(l.persp, s);
    const persp = perspT.k === 'a' ? perspT.name : null;
    let cands: FactRec[];
    if (only !== null) {
      const narrow = this.indexProbe(l, s, persp);
      if (narrow !== null && narrow.length < only.size) cands = narrow.filter((f) => only.has(f.key));
      else {
        cands = [];
        for (const k of only) {
          const r = this.store.get(k);
          if (r !== undefined && r.rel === l.rel && (persp === null || r.persp === persp)) cands.push(r);
        }
      }
    } else {
      cands = this.indexProbe(l, s, persp) ?? this.scanRel(l.rel, persp);
    }
    const out: [Subst, PremRef][] = [];
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const fr of cands) {
      if (persp === null && isKernelLedger(fr.persp)) continue;
      const s2 = persp !== null ? s : unify(perspT, mka(fr.persp), s);
      if (s2 === null) continue;
      const s3 = unifyAll(l.args, fr.args, s2);
      if (s3 === null) continue;
      if (!seen.has(fr.key)) { seen.add(fr.key); keys.push(fr.key); out.push([s3, { t: 'fact', key: fr.key }]); }
    }
    const drs = this.demandRels.find(([r]) => r === l.rel);
    // A CALL MET AGAIN INSIDE ITS OWN UNFOLDING would unfold forever; of a relation whose answers are all in the store it reads only those
    const call = drs !== undefined && this.demandClosed.has(l.rel) ? this.anonLitKey(l, s) : null;
    if (drs !== undefined && !(call !== null && this.demandCalls.includes(call))) {
      if (call !== null) this.demandCalls.push(call);
      try {
        for (const dr of drs[1]) {
          for (const [ms, mref] of this.solveDemandRule(dr, l, s, depth)) {
            const dk = mref.t === 'fact' ? mref.key : this.resolvedLitKey(l, ms);
            if (!seen.has(dk)) { seen.add(dk); keys.push(dk); out.push([ms, mref]); }
          }
        }
      } finally { if (call !== null) this.demandCalls.pop(); }
    }
    // the answers in key order, which is the one a canonical witness is picked in: a store that holds them so is not sorted again
    let ordered = true;
    for (let i = 1; i < keys.length; i++) if (keys[i - 1] > keys[i]) { ordered = false; break; }
    if (ordered) return out;
    return keys.map((_, i) => i).sort((a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : 0)).map((i) => out[i]);
  }

  /** Top-down unfolding of a moded rule at a call site. */
  private solveDemandRule(r: ERule, call: Lit, s: Subst, depth: number): [Subst, PremRef][] {
    this.bumpSteps();
    if (depth > MAX_DEPTH) {
      this.wallSpent = ['depth', depth, MAX_DEPTH];
      throw new Wall(BUDGET_REASON);
    }
    const rn = this.renameClause(r.clause);
    const head = rn.head;
    if (head.rel !== call.rel || head.args.length !== call.args.length) return [];
    const s2 = unify(head.persp, walk(call.persp, s), s);
    if (s2 === null) return [];
    const s3 = unifyAll(head.args, call.args, s2);
    if (s3 === null) return [];
    this.demandHeads.push(head);
    let sols: Sol[];
    try { sols = this.solveBody(rn.body, s3, depth + 1, null, r.id); } finally { this.demandHeads.pop(); }
    const out: [Subst, PremRef][] = [];
    for (const sol of sols) {
      const persp = walk(head.persp, sol.s);
      const args = head.args.map((a) => resolve(a, sol.s));
      if (persp.k === 'a' && args.every(isGround)) {
        const [isNew, id] = this.put(call.rel, persp.name, args, F_TICK);
        const tick = this.store.tick;
        if (this.support(id, { ruleId: r.id, tick, prems: sol.prems })) {
          this.chargeRow(r.id, true);
          if (!this.noProvenance) this.store.add(V.derived_by, KERNEL_PERSP, [factTerm(call.rel, persp.name, args), mka(r.id), mki(tick)], F_DRV);
        }
        if (isNew) noteFront(this.curFront, call.rel, id);
        out.push([sol.s, { t: 'fact', key: id }]);
      } else out.push([sol.s, { t: 'bi', desc: `open ${this.resolvedLitKey(call, sol.s)}` }]);
    }
    return out;
  }

  private renameClause(c: Clause): Clause {
    const n = this.renameCounter++;
    return { ...c, head: renameLit(c.head, n), body: renameBody(c.body, n) };
  }

  /** `not p`: two-valued by default; against the round's frozen assumption under the alternation. */
  private negHolds(l: Lit, s: Subst, depth: number): boolean {
    if (this.assume === null) {
      if (!this.demandRels.some(([r]) => r === l.rel)) return this.matchExists(l, s);
      return this.matchPremise(l, s, depth, null).length === 0;
    }
    const asm = this.assume;
    if (l.temporal === 'init' && this.store.tick !== 0) return true;
    const perspT = walk(l.persp, s);
    for (const fr of asm.byRel.get(l.rel) ?? []) {
      if (fr.args.length !== l.args.length) continue;
      if (perspT.k !== 'a' && isKernelLedger(fr.persp)) continue;
      const s2 = perspT.k === 'a' ? (perspT.name === fr.persp ? s : null) : unify(perspT, mka(fr.persp), s);
      if (s2 === null) continue;
      if (unifyAll(l.args, fr.args, s2) !== null) return false;
    }
    return true;
  }

  private matchExists(l: Lit, s: Subst): boolean {
    if (l.temporal === 'init' && this.store.tick !== 0) return true;
    const perspT = walk(l.persp, s);
    const persp = perspT.k === 'a' ? perspT.name : null;
    const cands = this.indexProbe(l, s, persp) ?? this.scanRel(l.rel, persp);
    for (const fr of cands) {
      if (persp === null && isKernelLedger(fr.persp)) continue;
      const s2 = persp !== null ? s : unify(perspT, mka(fr.persp), s);
      if (s2 === null) continue;
      if (unifyAll(l.args, fr.args, s2) !== null) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ builtins

  evalBuiltin(op: string, l: Term, r: Term, s: Subst, ruleId: string | null): Subst | null {
    if (op === '=') return unify(l, r, s);
    if (op === '!=') {
      const lt = resolve(l, s), rt = resolve(r, s);
      if (!isGround(lt) || !isGround(rt)) return null;
      return canonTerm(lt) !== canonTerm(rt) ? s : null;
    }
    if (op === 'is') {
      const fail: ArithFail = { code: ARITH_UNBOUND };
      const iv = this.evalIv(r, s, fail);
      if (iv !== undefined) {
        if (iv === null) { this.builtinFailed(ruleId, fail.code); return null; }
        return unify(l, iv, s);
      }
      const so = evalStrOp(r, s, fail);
      let rv: Term | null;
      if (so === undefined) { const n = evalArithT(r, s, fail); rv = n === null ? null : mki(n); }
      else rv = so;
      if (rv === null) { this.builtinFailed(ruleId, fail.code); return null; }
      return unify(l, rv, s);
    }
    if (op === 'in' || op === 'subset') {
      const lt = resolve(l, s), rt = resolve(r, s);
      if (!isGround(lt) || !isGround(rt)) return null;
      const held = op === 'in' ? this.joinMember(lt, rt) : this.joinSubset(lt, rt);
      if (held === true) return s;
      if (held === false) return null;
      this.builtinFailed(ruleId, CODE.setType);
      return null;
    }
    const fail: ArithFail = { code: ARITH_UNBOUND };
    const side = (t: Term): Int | null => {
      fail.code = ARITH_UNBOUND;
      const so = evalStrOp(t, s, fail);
      if (so === undefined) return evalArithT(t, s, fail);
      if (so === null) return null;
      if (so.k === 'i') return so.v;
      fail.code = STR_TYPE;
      return null;
    };
    const lv = side(l);
    if (lv === null) { this.builtinFailed(ruleId, fail.code); return null; }
    const rv = side(r);
    if (rv === null) { this.builtinFailed(ruleId, fail.code); return null; }
    const a = BigInt(lv), b = BigInt(rv);
    const ok = op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : false;
    return ok ? s : null;
  }

  /** EVERY SOLUTION OF A BUILTIN: one or none, but for `E in S` with E not ground. */
  private evalBuiltins(op: string, l: Term, r: Term, s: Subst, ruleId: string | null): Subst[] {
    const one = (): Subst[] => { const x = this.evalBuiltin(op, l, r, s, ruleId); return x === null ? [] : [x]; };
    if (op !== 'in') return one();
    const lt = resolve(l, s), rt = resolve(r, s);
    if (!isGround(rt)) return [];
    if (isGround(lt)) return one();
    const out: Subst[] = [];
    const jr = this.joinRead(rt);
    if (jr === null) { this.builtinFailed(ruleId, CODE.setType); return out; }
    const [jop, sv] = jr;
    if (jop === 'union') {
      for (const x of setElems(sv)!) { const s2 = unify(lt, x, s); if (s2) out.push(s2); }
    } else if (jop === 'hull') {
      const [lo, hi] = ivBounds(sv)!;
      if (lo === NINF || hi === PINF) { this.builtinFailed(ruleId, CODE.unbounded); return out; }
      for (let n = lo; n <= hi; n++) {
        this.bumpSteps();
        const s2 = unify(lt, mki(n as Int), s);
        if (s2) out.push(s2);
      }
    } else {
      const n = BigInt((sv as { v: Int }).v);
      for (let b = 0; b < 60; b++) if (((n >> BigInt(b)) & 1n) === 1n) { const s2 = unify(lt, mki(b), s); if (s2) out.push(s2); }
    }
    return out;
  }

  /** AN INTERVAL FUNCTION on the right of `is`: undefined when the term is none,
   *  else its value, or null with `fail` set. */
  private evalIv(r: Term, s: Subst, fail: ArithFail): Term | null | undefined {
    const t = walk(r, s);
    if (t.k !== 'f' || !IV_FNS.has(t.name)) return undefined;
    if (t.args.length !== 2) { fail.code = ARITH_TYPE; return null; }
    const ends: [bigint, bigint][] = [];
    for (const a0 of t.args) {
      const a = resolve(a0, s);
      if (!isGround(a)) { fail.code = ARITH_UNBOUND; return null; }
      let e: [bigint, bigint] | null;
      if (a.k === 'i') e = [BigInt(a.v), BigInt(a.v)];
      else { const b = ivBounds(a); e = b !== null && b[0] <= b[1] ? b : null; }
      if (e === null) { fail.code = ARITH_TYPE; return null; }
      ends.push(e);
    }
    try {
      const v = ivApply(t.name as IvFn, ends[0], ends[1]);
      if (v === null) { fail.code = ARITH_UNBOUND; return null; }
      return mkIv(v[0], v[1]);
    } catch (e) {
      if (!(e instanceof IvFailed)) throw e;
      fail.code = e.fault === 'type' ? ARITH_TYPE : ARITH_OVERFLOW;
      return null;
    }
  }

  /** What the right side of `in` or `subset` reads, or null for no value of any carrier. */
  private joinRead(t: Term): [AggOp, Term] | null {
    const op = joinCarrierOf(t);
    if (op === null) return null;
    try { return [op, joinCanon(op, t)]; } catch { return null; }
  }

  /** `E in S` over ground terms. */
  private joinMember(e: Term, s: Term): boolean | null {
    const jr = this.joinRead(s);
    if (jr === null) return null;
    const [op, sv] = jr;
    if (op === 'union') return setContains(setElems(sv)!, e);
    if (op === 'hull') { const [lo, hi] = ivBounds(sv)!; return e.k === 'i' && lo <= BigInt(e.v) && BigInt(e.v) <= hi; }
    const bits = BigInt((sv as { v: Int }).v);
    if (e.k !== 'i') return false;
    const b = BigInt(e.v);
    return b >= 0n && b < 60n && ((bits >> b) & 1n) === 1n;
  }

  /** `A subset S` over ground terms of one carrier. */
  private joinSubset(a: Term, s: Term): boolean | null {
    const js = this.joinRead(s), ja = this.joinRead(a);
    if (js === null || ja === null || js[0] !== ja[0]) return null;
    try { return joinLeq(js[0], ja[1], js[1]); } catch { return null; }
  }

  /** A builtin that failed for an error, not for falsity. */
  private builtinFailed(ruleId: string | null, code: number): void {
    if (code === ARITH_UNBOUND) return;
    const reason = holeReasonOfCode(code);
    this.fault ??= reason;
    this.faultCount++;
    this.lastFault = reason;
    this.lastFaultRule = ruleId;
    if (ruleId !== null) {
      if (this.firing && this.rules.some((r) => r.id === ruleId && r.latClose !== null)) return;
      this.arithHole(ruleId, reason);
    }
  }

  private arithHole(ruleId: string, reason: string): void {
    const marker = this.ruleMarker(ruleId);
    if (this.holeMet(marker, reason)) this.chargeHoleRow();
    const [isNew, id] = this.evalHolePut([marker, mka(reason)]);
    if (isNew) noteFront(this.curFront, V.hole, id);
  }

  // ------------------------------------------ the alternating fixpoint

  private assumptionOf(): Assumption {
    const a: Assumption = { recs: new Map(), byRel: new Map() };
    for (const r of this.store.allFacts()) {
      const rec = { ...r };
      a.recs.set(r.key, rec);
      let e = a.byRel.get(r.rel);
      if (!e) { e = []; a.byRel.set(r.rel, e); }
      e.push(rec);
    }
    return a;
  }

  private roundRules(): ERule[] {
    return this.rules.filter((r) => r.safe && r.clause.head.rel !== IFACE.stratum)
      .filter((r) => !(this.wfsSkipCone && this.unknownCone.has(r.clause.head.rel)));
  }

  /** What an evaluation knows of the cells it sealed. */
  private forgetCells(): void {
    this.aggMemo.clear(); this.reachMemo.clear(); this.cellReach.clear(); this.cellCond.clear(); this.cellDecided.clear(); this.regionsCapped.clear(); this.holShared.clear(); this.thrCells.clear(); this.thrOpen = []; this.thrAcc.clear();
    this.thrFresh.clear(); this.heightMemo.clear();
  }

  private wfsRound(assume: Assumption): void {
    this.assume = assume;
    this.clearDerived();
    this.refixUnknowns();
    this.forgetCells();
    this.rows = 0;
    this.active = [];
    this.staged.clear();
    this.stagedAlts.clear();
    this.activate(this.roundRules());
  }

  /** WHAT A HOLE LEAVES OUT, UNDER THE ALTERNATING FIXPOINT, is a shrug. */
  private wfsUnknowns(assume: Assumption): void {
    const seeds = this.plainPending.map(([u]) => u).filter((u) => !this.unknownHolds(u));
    this.plainPending = [];
    if (seeds.length === 0 && this.latUndecided.length === 0) return;
    for (const u of seeds) this.latPlain.add(u.id);
    const before = this.assume;
    this.assume = assume;
    try { this.poisonWith(seeds, [], [], false); } finally { this.assume = before; this.latUndecided = []; }
  }

  /** A fresh carry for an alternation: nothing noted, every rule closed. */
  private wfsCarryReset(): void {
    this.latUnknown.clear(); this.latUnknownRel.clear(); this.latUnknownAt.clear(); this.unknownAt.clear();
    this.unknownAny.clear(); this.latSpread.clear(); this.latUndecided = []; this.latPlain.clear(); this.latWithdrawn = [];
    this.plainClosed = new Set(this.rules.filter((r) => r.safe).map((r) => r.id));
  }

  private runWellFounded(): void {
    const COMPOSE = 'evaluate the well-founded world below and feed its true and unknown rows to a stratified world that aggregates them (rofl-load --below)';
    const tagged = [...this.tags.byRel.keys()].sort(cmpStr)[0];
    if (tagged !== undefined) throw new Rejected(`program rejected: tag ${tagged} (${this.tags.byRel.get(tagged)![1]}) is not evaluated under well_founded semantics: a tag is a cell, and a cell merged under an assumption holds a value no model may have; ${COMPOSE}`);
    const sub = [...this.subs.keys()].sort(cmpStr)[0];
    if (sub !== undefined) throw new Rejected(`program rejected: subsumption ${sub} is not evaluated under well_founded semantics: a value dominated under an assumption is dropped for a fact no model may have; ${COMPOSE}`);
    const lat = [...this.lattices.keys()].filter((p) => !this.subs.has(p)).sort(cmpStr)[0];
    if (lat !== undefined) throw new Rejected(`program rejected: lattice ${lat} is not evaluated under well_founded semantics: a cell improved under an assumption holds a value no model may have; ${COMPOSE}`);
    for (const r of this.rules) for (const b of r.clause.body) {
      if (b.t === 'agg') throw new Rejected(`program rejected: ${b.op} is not evaluated under well_founded semantics (rule ${r.id}): a cell sealed under an assumption counts facts that may not hold; ${COMPOSE}`);
    }
    if (this.demandRels.length > 0) throw new Rejected(`program rejected: the alternating fixpoint cannot assume a demand-backed relation (${this.demandRels.map(([r]) => r).join(', ')})`);
    const concluded = new Set(this.rules.filter((r) => r.clause.head.temporal !== 'next').map((r) => r.clause.head.rel));
    // a rule reading no derived relation writes the table as data (boot.rofl's own ranks), and is not computing it
    if (this.rules.some((r) => r.clause.head.rel === IFACE.stratum && r.clause.body.flatMap(litsOf).some((l) => concluded.has(l.rel)))) {
      const msg = 'stratum/2 is not computed under well_founded semantics';
      if (!this.diags.includes(msg)) this.diags.push(msg);
    }
    if (this.store.add(V.edb, MAIN, [mka(IFACE.unknown)], F_BASE)) this.rows++;
    const twoLevels = this.unknownCone.size > 0;
    this.wfsSkipCone = twoLevels;
    this.wfsFixed = [];
    const [g1, w1, m1] = this.alternate(null);
    let gap = this.wfsGap(g1, m1);
    const wits = w1;
    if (twoLevels) {
      for (const [, , rec] of gap) this.wfsFixed.push([rec.persp, atomTerm(rec.rel, rec.args)]);
      if (this.shrugReaders.size > 0) { this.refixUnknowns(); this.shrugSnapshot(); }
      this.wfsSkipCone = false;
      const [g2, w2, m2] = this.alternate(m1);
      const known = new Set(gap.map((x) => x[1]));
      const more = this.wfsGap(g2, m2).filter((x) => !known.has(x[1]) && x[2].rel !== IFACE.unknown);
      for (const [, , rec] of more) {
        const u = uTuple(IFACE.unknown, rec.persp, [atomTerm(rec.rel, rec.args)]);
        const lits = this.rules.flatMap((r) => r.clause.body.flatMap(litsOf)).filter((l) => l.rel === IFACE.unknown);
        if (lits.some((l) => this.unknownBinds(l, u, new Map()) !== null)) {
          this.wfsFixed = [];
          throw new Rejected(`program rejected: unknown is read of ${rec.key}, which the level that reads unknown leaves undefined`,
            'unknown(A) of an atom whose rule reads unknown is not written until that rule is settled');
        }
      }
      for (const [, k] of more) { const w = w2.get(k); if (w) wits.set(k, w); }
      gap.push(...more);
      gap.sort((a, b) => cmpStr(a[0], b[0]));
      this.wfsFixed = [];
    }
    const undef = new Map<string, string>();
    for (const [, k, rec] of gap) undef.set(k, factKey(IFACE.unknown, rec.persp, [atomTerm(rec.rel, rec.args)]));
    if (this.rows + gap.length > this.space) {
      const blame = gap.length > 0 ? wits.get(gap[0][1])?.ruleId ?? null : null;
      this.wallSpent = ['rows', this.rows + gap.length, this.space];
      if (blame !== null) this.arithHole(blame, SPACE_REASON);
      throw new Wall(SPACE_REASON, blame);
    }
    const uids: string[] = [];
    for (const [, , rec] of gap) {
      this.rows++;
      const uid = this.put(IFACE.unknown, rec.persp, [atomTerm(rec.rel, rec.args)], F_TICK)[1];
      this.wfsWritten.add(uid);
      uids.push(uid);
    }
    gap.forEach(([, k], n) => {
      const w = wits.get(k);
      if (!w) return;
      const prems = w.prems.map((pr): PremRef => {
        if (pr.t !== 'fact') return pr;
        const u = undef.get(pr.key);
        return u !== undefined && this.alive(u) ? { t: 'fact', key: u } : pr;
      });
      if (this.alive(uids[n])) this.support(uids[n], { ruleId: w.ruleId, tick: this.store.tick, prems });
    });
  }

  /** The alternating fixpoint over `roundRules`, to its close. */
  private alternate(from: Assumption | null): [Assumption, Map<string, Witness>, Assumption] {
    const carried = this.carriedUnknowns(this.store.tick);
    const holes0 = new Set(this.relPersp(V.hole, KERNEL_PERSP));
    const edges0 = this.unkEdges.length, now0 = this.holesNow.length;
    let start = from;
    let restarted = false;
    let total = 0;
    for (;;) {
      const [generous, wits, mean, n] = this.alternateFrom(start, carried, total);
      total += n;
      const moved = !restarted || start === null || !sameKeys(start.recs, mean.recs);
      if (this.latUnknown.size === 0 || !moved) {
        this.diags.push(`well-founded fixpoint settled after ${total} alternation(s)`);
        return [generous, wits, mean];
      }
      this.store.removeMany(this.relPersp(V.hole, KERNEL_PERSP).filter((f) => !holes0.has(f)));
      this.unkEdges.length = edges0;
      this.holesNow.length = now0;
      this.holesMet = new Set(this.holesNow.map(([t, c]) => canonTerm(t) + '|' + c));
      start = mean;
      restarted = true;
    }
  }

  private alternateFrom(start: Assumption | null, carried: [Unknown, boolean][], done: number): [Assumption, Map<string, Witness>, Assumption, number] {
    this.clearDerived();
    this.refixUnknowns();
    let mean = start ?? this.assumptionOf();
    this.wfsCarryReset();
    let i = 0;
    for (;;) {
      this.plainPending = [...carried];
      const noted = this.latUnknown.size;
      this.wfsRound(mean);
      const generous = this.assumptionOf();
      const generousWits = this.allWitnesses();
      this.wfsUnknowns(mean);
      this.wfsRound(generous);
      this.wfsUnknowns(generous);
      const next = this.assumptionOf();
      const settled = sameKeys(next.recs, mean.recs) && this.latUnknown.size === noted;
      mean = next;
      if (settled) return [generous, generousWits, mean, i + 1];
      i++;
      if (done + i >= MAX_ALTERNATIONS) {
        this.wallSpent = ['alternations', done + i, MAX_ALTERNATIONS];
        throw new Wall(BUDGET_REASON);
      }
    }
  }

  /** The gap: what the two limits disagree about, sorted. */
  private wfsGap(generous: Assumption, mean: Assumption): [string, string, FactRec][] {
    const gap: [string, string, FactRec][] = [];
    for (const [k, rec] of generous.recs) {
      if (mean.recs.has(k) || RESERVED.has(rec.rel)) continue;
      gap.push([k, k, rec]);
    }
    return gap.sort((a, b) => cmpStr(a[0], b[0]));
  }

  /** The lower level's undefined atoms, fixed in the store for the upper level's rounds. */
  private refixUnknowns(): void {
    for (const [p, at] of this.wfsFixed) {
      this.store.add(IFACE.unknown, p, [at], F_TICK);
      this.wfsWritten.add(factKey(IFACE.unknown, p, [at]));
    }
  }

  private allWitnesses(): Map<string, Witness> {
    const out = new Map<string, Witness>();
    const memo = new Map<string, number>();
    for (const k of this.store.firings.keys()) { const w = this.store.witnessOf(k, memo); if (w) out.set(k, w); }
    return out;
  }

  // ------------------------------------------------------------- why

  /** `why`: the derivation tree of a fact that holds; `members` of an aggregate's printed. EVERY QUESTION RENAMES
   *  FROM ZERO, as src/api.ts explains a plain program on a fresh evaluation: the `#N` suffixes do not depend on
   *  what was asked before or what the evaluation renamed, and the counter is put back. */
  whyText(lit: Lit, members = WHY_MEMBERS, shown?: string): string {
    const saved = this.renameCounter;
    this.renameCounter = 0;
    try { return this.whyAt(lit, members, shown); } finally { this.renameCounter = saved; }
  }

  private whyAt(lit: Lit, members: number, shown?: string): string {
    const p = walk(lit.persp, new Map());
    if (p.k !== 'a' || !lit.args.every(isGround)) throw new Error('why needs a ground literal');
    const key = factKey(lit.rel, p.name, lit.args);
    if (!this.alive(key)) {
      const sh = this.shrugsOf(lit);
      if (sh.length > 0) {
        // a shrug is the answer to the aggregate evaluator, and the reason the plain one gives for not answering
        const text = sh.map(([f]) => this.shrugWhy(f)).join('\n');
        if (this.plain) throw new Error(text);
        return text;
      }
      throw new Error(`${key} does not hold; try: whynot ${this.plain ? shown ?? key : key}`);
    }
    this.pastRows = null;
    this.whyScans = 0;
    this.whyDone = this.dag ? new Set<string>() : { has: () => false, add: () => null, clear: () => undefined };
    this.whyHeads.clear();
    this.whyHeights.clear();
    this.whyUnk = this.plain ? this.unknownCtx() : null;
    const out = this.renderTree(key, { members, query: key });
    this.pastRows = null;
    // A `why` on an undefined atom answers with the tree AND the set the tree walked: the circular dependency that left it undefined, named.
    const u = this.whyUnk;
    this.whyUnk = null;
    return u !== null && lit.rel === IFACE.unknown && u.hit.size > 0 ? `${out}\nunfounded set: ${[...u.hit].sort().join(', ')}` : out;
  }

  /** The `unknown` rows the store holds, keyed by the atom each stands for; null in every two-valued world. */
  private unknownCtx(): { index: Map<string, string>; hit: Set<string> } | null {
    const rows = this.store.relAll(IFACE.unknown);
    if (rows.length === 0) return null;
    const index = new Map<string, string>();
    for (const f of rows) {
      if (f.args.length !== 1) continue;
      const at = unAtomTerm(f.args[0]);
      if (at) index.set(factKey(at.rel, f.persp, at.args), f.key);
    }
    return { index, hit: new Set() };
  }

  /** THE TREE, WALKED WITH A STACK OF ITS OWN: a derivation as deep as the store holds renders without a frame per
   *  level, and each line is written once. Every step pushes, in order, the lines and the premises it would have
   *  written and recursed into; they run in that order. */
  private renderTree(id: string, o: WhyOpts): string {
    const seen = new Set<string>(), lines: string[] = [], todo: WhyTask[] = [{ t: 'fact', id, indent: 0 }], next: WhyTask[] = [];
    for (let t = todo.pop(); t !== undefined; t = todo.pop()) {
      if (t.t === 'fact') this.renderWhy(t.id, t.indent, seen, o, next);
      else if (t.t === 'prem') this.renderPrem(t.pr, t.indent, o, next);
      else if (t.t === 'past') this.renderPast(t.pr, t.at, t.indent, o, next);
      else if (t.t === 'line') lines.push(t.line);
      else seen.delete(t.id);
      for (let i = next.length - 1; i >= 0; i--) todo.push(next[i]);
      next.length = 0;
    }
    return lines.join('\n');
  }

  private renderWhy(id: string, indent: number, seen: Set<string>, o: WhyOpts, next: WhyTask[]): void {
    const r = this.rec(id);
    const key = id;
    const pad = '  '.repeat(indent);
    if (seen.has(id)) { next.push(line(`${pad}${key} [cycle]`)); return; }
    // A FACT WRITTEN OUT ONCE IS REFERRED TO AFTER: the proof is a DAG, and what a leaf says is as short as a reference
    const lat = this.lattices.get(r.rel);
    const leaf = !this.subs.has(r.rel) && lat === undefined && !this.tags.countRel.has(r.rel) && (this.store.supportCount(id) === 0 || (this.alive(id) && r.base && this.whyWitness(id) === undefined));
    if (!leaf) {
      if (this.whyDone.has(`f|${id}`)) { next.push(line(`${pad}${key} [above]`)); return; }
      this.whyDone.add(`f|${id}`);
    }
    seen.add(id);
    if (this.subs.has(r.rel)) this.renderSub(id, key, indent, o, next);
    else if (lat !== undefined) this.renderLattice(id, key, lat[1], indent, o, next);
    else if (this.tags.countRel.has(r.rel)) this.renderCounting(id, key, indent, o, next);
    else {
      const w = this.whyWitness(id);
      if (w === undefined) {
        next.push(line(`${pad}${key} ${this.alive(id) && (this.plain || r.base) ? '[axiom]' : '[past tick]'}`));
      } else {
        next.push(line(`${pad}${key}  <= ${w.ruleId} @tick ${w.tick}`));
        if (this.whyUnk !== null && r.rel === IFACE.unknown && r.args.length === 1) {
          const at = unAtomTerm(r.args[0]);
          if (at) this.whyUnk.hit.add(factKey(at.rel, r.persp, at.args));
        }
        this.pushFiring(id, w, indent + 1, o, next);
      }
      // THE ASKED FACT'S OTHER FIRINGS: `why` says how many there are, `why all` writes each under its own line, after the one `why`
      // shows alone. A premise they share is a reference.
      if (indent === 0) {
        const rest = this.store.firingsRanked(id, this.whyHeights).slice(w === undefined ? 0 : 1);
        if (o.members === Infinity) {
          rest.forEach((x, k) => {
            next.push(line(`${pad}  #${k + 2} <= ${x.ruleId} @tick ${x.tick} [another derivation]`));
            this.pushFiring(id, x, indent + 2, o, next);
          });
        } else if (rest.length > 0) next.push(line(`${pad}  [${rest.length} more derivation${rest.length === 1 ? '' : 's'}: why all ${o.query}]`));
      }
    }
    // what it rests on is rendered before it leaves the path
    next.push({ t: 'unsee', id });
  }

  /** The firing `why` shows of a fact: the least height, then signature. A BASE FACT whose shown firing rests on the fact itself is its
   *  assertion: `handled` is asserted and derived from a claim derived from it, and the shortest proof of the claim is the assertion. A firing
   *  staged from an earlier tick reads that tick's fact, which is no circle. */
  private whyWitness(id: string): Witness | undefined {
    const w = this.store.witnessOf(id, this.whyHeights);
    if (w === undefined || !(this.alive(id) && this.rec(id).base) || this.stagedFiring(this.rec(id).rel, w.ruleId, w.tick, w.prems)) return w;
    const seen = new Set<string>(), stack = w.prems.flatMap((p) => (p.t === 'fact' ? [p.key] : []));
    for (let g = stack.pop(); g !== undefined; g = stack.pop()) {
      if (g === id) return undefined;
      if (seen.has(g)) continue;
      seen.add(g);
      for (const x of this.store.firingList(g)) for (const p of x.prems) if (p.t === 'fact') stack.push(p.key);
    }
    return w;
  }

  /** The premises of one firing of `id`, each at `indent`. */
  private pushFiring(id: string, w: Witness, indent: number, o: WhyOpts, next: WhyTask[]): void {
    const past = this.stagedFiring(this.rec(id).rel, w.ruleId, w.tick, w.prems);
    for (const pr of w.prems) {
      const at = Math.max(0, w.tick - 1);
      // the plain explainer writes a negation's demonstration when it reaches the firing, and its renaming suffixes count in that order
      if (this.plain && pr.t === 'neg') { if (past) this.renderPast(pr, at, indent, o, next); else this.renderPrem(pr, indent, o, next); }
      else if (this.plain && pr.t === 'bi') this.renderPrem(pr, indent, o, next);
      else next.push(past ? { t: 'past', pr, at, indent } : { t: 'prem', pr, indent });
    }
  }

  /** A LATTICE FACT IS ITS CELL: the value, and its members. */
  private renderLattice(id: string, key: string, op: AggOp, indent: number, o: WhyOpts, next: WhyTask[]): void {
    if (isJoin(op)) return this.renderJoin(id, key, op, indent, o, next);
    const pad = '  '.repeat(indent);
    let members: [number, string, number, PremRef[]][];
    try { members = this.bestMembers(id); } catch (e) { next.push(line(`${pad}${key} [${this.latLabel(this.rec(id).rel, op)}: Bug(${JSON.stringify((e as Error).message)})]`)); return; }
    const n = members.length;
    next.push(line(`${pad}${key} [${this.latLabel(this.rec(id).rel, op)}: ${n} member${n === 1 ? '' : 's'}${this.alive(id) ? '' : '; an earlier value, improved on since'}]`));
    this.renderMembers(members, indent, o, next);
  }

  /** A cell's members, as many as the query shows, each with its premises. */
  private renderMembers(members: [number, string, number, PremRef[]][], indent: number, o: WhyOpts, next: WhyTask[]): void {
    const pad = '  '.repeat(indent), n = members.length, limit = indent === 0 ? o.members : 1;
    for (let i = 0; i < n; i++) {
      if (i >= limit) { if (indent === 0) next.push(line(`${pad}  [${n - limit} more members: why all ${o.query}]`)); break; }
      const [hgt, rule, tick, prems] = members[i];
      next.push(line(`${pad}  #${i + 1} h=${hgt} <= ${rule} @tick ${tick}`));
      for (const pr of prems) next.push({ t: 'prem', pr, indent: indent + 2 });
    }
  }

  /** The front of a subsumptive cell, read from the store. */
  private subFront(rel: string, persp: string, key: Term[]): string[] {
    const k = listKey(key);
    return this.relPersp(rel, persp).filter((f) => listKey(this.rec(f).args.slice(0, key.length)) === k).sort(cmpStr);
  }

  /** A SUBSUMPTIVE FACT'S ANTICHAIN WITNESS. */
  private renderSub(id: string, key: string, indent: number, o: WhyOpts, next: WhyTask[]): void {
    const pad = '  '.repeat(indent);
    const rec = this.rec(id);
    const k = this.subs.get(rec.rel)!.keylen;
    const ck = this.lk(rec.rel, rec.persp, rec.args.slice(0, k));
    let members: [number, string, number, PremRef[]][];
    try { members = this.bestMembers(id); } catch (e) { next.push(line(`${pad}${key} [subsumption: Bug(${JSON.stringify((e as Error).message)})]`)); return; }
    const n = members.length;
    const live = this.alive(id);
    let place: string;
    if (live) {
      const front = this.subFront(rec.rel, rec.persp, rec.args.slice(0, k));
      place = `${front.indexOf(id) + 1} of ${front.length} in the front of its cell`;
    } else {
      const by = this.subBeaten.get(`${ck.id}|${listKey(rec.args.slice(k))}`);
      place = by !== undefined ? `an earlier value, dominated since by ${factKey(rec.rel, rec.persp, this.subArgs(ck, by))}` : 'an earlier value, dominated since';
    }
    next.push(line(`${pad}${key} [subsumption: ${n} member${n === 1 ? '' : 's'}; ${place}]`));
    this.renderMembers(members, indent, o, next);
    if (indent === 0 && live) {
      const beat: [string, string][] = [];
      for (const v of this.subByOf.get(id) ?? []) {
        const e = this.subBy.get(`${ck.id}|${listKey(v)}`);
        if (e === undefined || e[0] !== id) continue;
        beat.push([factKey(ck.rel, ck.persp, this.subArgs(ck, v)), e[1]]);
      }
      beat.sort((a, b) => cmpStr(a[0], b[0]));
      for (let i = 0; i < beat.length; i++) {
        if (i >= o.members) { next.push(line(`${pad}  [${beat.length - o.members} more values it dominates: why all ${o.query}]`)); break; }
        next.push(line(`${pad}  dominates ${beat[i][0]} by ${beat[i][1]}`));
      }
    }
  }

  /** "lattice min", or "tag tropical" for the order lattice a tag is. */
  private latLabel(rel: string, op: AggOp): string {
    if (op === 'subsumption') return 'subsumption';
    const t = this.tags.byRel.get(rel);
    return t !== undefined ? `tag ${t[1]}` : `lattice ${op}`;
  }

  /** A COUNTING TAG'S FACT IS THE SUM OF ITS DERIVATIONS. */
  private renderCounting(id: string, key: string, indent: number, o: WhyOpts, next: WhyTask[]): void {
    const pad = '  '.repeat(indent);
    const w = this.store.witnessOf(id, this.whyHeights);
    if (w === undefined) { next.push(line(`${pad}${key} [past tick]`)); return; }
    const cp = w.prems.find((p) => p.t === 'cell');
    if (cp === undefined) { next.push(line(`${pad}${key} [tag counting] <= ${w.ruleId} @tick ${w.tick}`)); return; }
    const c = cp.key;
    const members = this.store.cells.get(c)!.members;
    const n = members.length;
    next.push(line(`${pad}${key} [tag counting: the sum of ${n} derivation${n === 1 ? '' : 's'}] <= ${w.ruleId} @tick ${w.tick}`));
    const limit = indent === 0 ? o.members : 1;
    for (let i = 0; i < members.length; i++) {
      if (i >= limit) {
        next.push(line(indent === 0 ? `${pad}  [${n - limit} more derivations: why all ${o.query}]` : `${pad}  [${n - limit} more derivation${n - limit === 1 ? '' : 's'}]`));
        break;
      }
      const m = members[i];
      const f = m.prems.find((p) => p.t === 'fact');
      const vs = f !== undefined ? (() => { const a = this.rec(f.key).args; return canonTerm(a[a.length - 1]); })() : '';
      next.push(line(`${pad}  #${i + 1} x${vs} h=${m.height}`));
      for (const p of m.prems) this.renderMemberPrem(c, p, indent + 2, next);
    }
  }

  /** A JOIN FACT IS ITS COVER. */
  private renderJoin(id: string, key: string, op: AggOp, indent: number, o: WhyOpts, next: WhyTask[]): void {
    const pad = '  '.repeat(indent);
    const ws = this.firings(id);
    if (ws.length === 0) { next.push(line(`${pad}${key} [past tick]`)); return; }
    let best = ws[0];
    for (const w of ws.slice(1)) if (w.prems.length < best.prems.length || (w.prems.length === best.prems.length && w.tick < best.tick)) best = w;
    const facts = factPrems(best.prems);
    this.heights(facts, this.heightMemo, null);
    const live = this.alive(id);
    const n = live ? facts.length : facts.filter((f) => this.joinOf.has(this.rec(f).rel)).length;
    const what = live ? `a cover of ${n} contribution${n === 1 ? '' : 's'}`
      : best.prems.length === 2 ? 'an earlier value, improved on since: the join of the value before it and a contribution'
      : 'an earlier value, improved on since: its first contribution';
    next.push(line(`${pad}${key} [lattice ${op}: ${what}] <= ${best.ruleId} @tick ${best.tick}`));
    const limit = !live ? facts.length : indent === 0 ? o.members : 1;
    for (let i = 0; i < facts.length; i++) {
      const f = facts[i];
      if (i >= limit) {
        next.push(line(indent === 0 ? `${pad}  [${facts.length - limit} more contributions: why all ${o.query}]`
          : `${pad}  [${facts.length - limit} more contribution${facts.length - limit === 1 ? '' : 's'}]`));
        break;
      }
      next.push(line(`${pad}  #${i + 1} ${canonTerm(this.lastArg(f))} h=${this.heightMemo.get(f) ?? 0}`));
      next.push({ t: 'prem', pr: { t: 'fact', key: f }, indent: indent + 2 });
    }
  }

  /** A firing staged at the tick before its own, which read that tick. */
  private stagedFiring(rel: string, rule: string, tick: number, prems: PremRef[]): boolean {
    return this.nextRules.has(rule) || this.carried.has(rel) || prems.some((p) => p.t === 'cell' && this.store.cells.get(p.key)!.tick < tick);
  }

  /** A PREMISE READ IN A PAST TICK, named with the rules that derived it then. */
  private renderPast(pr: PremRef, t: number, indent: number, o: WhyOpts, next: WhyTask[]): void {
    const bare = pr.t === 'neg';
    if (pr.t === 'neg' && bare) {
      // a negated premise of a staged firing held in the tick it was read: the arrival tick's store says nothing
      // about it, so it is the bare claim, no demonstration
      next.push(line(`${'  '.repeat(indent)}not ${pr.key} [finite failure]`));
      return;
    }
    if (pr.t !== 'fact') { this.renderPrem(pr, indent, o, next); return; }
    // NAMED FROM ITS KEY: a fact of a tick that is over has no record here, the frozen derived_by rows are keyed by it
    if (this.pastRows === null) {
      const by = new Map<string, string[]>();
      for (const d of this.store.relAll(V.derived_by)) {
        this.whyScans++;
        const a = d.args;
        const f = a[0];
        if (a[1]?.k === 'a' && a[2]?.k === 'i' && f.k === 'f' && f.name === '$fact' && f.args.length === 3 && f.args[0].k === 'a' && f.args[1].k === 'a') {
          const k = factKey(f.args[0].name, f.args[1].name, unlist(f.args[2])) + '@' + a[2].v;
          let e = by.get(k);
          if (!e) { e = []; by.set(k, e); }
          e.push(a[1].name);
        }
      }
      this.pastRows = by;
    }
    const rules = [...(this.pastRows.get(pr.key + '@' + t) ?? [])].sort(cmpStr);
    const pad = '  '.repeat(indent);
    next.push(line(rules.length === 0 ? `${pad}${pr.key} [past tick]` : `${pad}${pr.key}  <= ${rules.join(', ')} @tick ${t} [past tick]`));
  }

  /** One premise of a firing, at `indent`. */
  private renderPrem(pr: PremRef, indent: number, o: WhyOpts, next: WhyTask[]): void {
    const pad = '  '.repeat(indent);
    if (pr.t === 'fact') { next.push({ t: 'fact', id: pr.key, indent }); return; }
    if (pr.t === 'neg') {
      // `not p` over an undefined p did not fail, it never settled: p's own row is the explanation
      const und = this.whyUnk?.index.get(pr.key);
      if (und !== undefined) {
        next.push(line(`${pad}not ${pr.key} [undefined]`), { t: 'fact', id: und, indent: indent + 1 });
        return;
      }
      next.push(line(`${pad}not ${pr.key} [finite failure]`));
      if (!pr.key.includes('?')) {
        const sub = this.negDemo(pr.key);
        if (sub !== null) { const p2 = '  '.repeat(indent + 1); next.push(line(sub.split('\n').map((l) => p2 + l).join('\n'))); }
      }
      return;
    }
    if (pr.t === 'bi') { next.push(line(`${pad}${pr.desc} [builtin]`)); return; }
    const r = this.store.cells.get(pr.key)!;
    const members = r.members;
    const n = members.length;
    const head = r.op === 'at_least' ? r.desc : `${r.desc} = ${cellValueText(r.value)}`;
    const id = this.whyCellId(head, pr.key);
    if (this.whyDone.has(`c|${pr.key}`)) {
      next.push(line(`${pad}${head} [above]${id}`));
      return;
    }
    this.whyDone.add(`c|${pr.key}`);
    if (r.op === 'at_least') {
      next.push(line(`${pad}${head} [quorum: the first ${n} member${n === 1 ? '' : 's'}]${id}`));
      for (let i = 0; i < n; i++) {
        if (i === o.members) { next.push(line(`${'  '.repeat(indent + 1)}[${n - o.members} more members: why all ${o.query}]`)); break; }
        const m = members[i];
        next.push(line(`${'  '.repeat(indent + 1)}#${i + 1} ${tupleText(m.proj)} h=${m.height}`));
        for (const p of m.prems) this.renderMemberPrem(pr.key, p, indent + 2, next);
        this.renderAltDerivations(pr.key, m, i, indent + 1, o, next);
      }
      return;
    }
    const by = this.cellDecided.get(pr.key);
    const what = by !== undefined ? `${n === 0 ? 'no member known' : `${n} known member${n === 1 ? '' : 's'}`}, the same under every value of ${by}` : n === 0 ? 'empty group' : `${n} member${n === 1 ? '' : 's'}`;
    next.push(line(`${pad}${head} [aggregate: ${what}, sealed ${r.seals.map((x) => `${x.rel}@${x.round}`).join(', ')}]${id}`));
    for (let i = 0; i < n; i++) {
      if (i >= o.members) { next.push(line(`${'  '.repeat(indent + 1)}[${n - o.members} more members: why all ${o.query}]`)); break; }
      const m = members[i];
      next.push(line(`${'  '.repeat(indent + 1)}#${i + 1} ${tupleText(m.proj)} h=${m.height}`));
      for (const p of m.prems) this.renderMemberPrem(pr.key, p, indent + 2, next);
      this.renderAltDerivations(pr.key, m, i, indent + 1, o, next);
    }
  }

  /** TWO CELLS CAN WRITE ONE HEADER (a description and a value name neither the tick it was sealed in nor the rule): the first met under a header is unmarked, a later one ends its lines `(cell N)`, and a reference to it too. */
  private whyCellId(head: string, c: string): string {
    let ids = this.whyHeads.get(head);
    if (ids === undefined) { ids = []; this.whyHeads.set(head, ids); }
    let at = ids.indexOf(c);
    if (at < 0) { ids.push(c); at = ids.length - 1; }
    return at === 0 ? '' : ` (cell ${at + 1})`;
  }

  /** `why all`: the member's other derivations, each under its own line, after the canonical one `why` shows alone. */
  private renderAltDerivations(c: string, m: CellMember, i: number, indent: number, o: WhyOpts, next: WhyTask[]): void {
    if (o.members !== Infinity) return;
    m.others.forEach((ps, k) => {
      next.push(line(`${'  '.repeat(indent)}#${i + 1}.${k + 2} ${tupleText(m.proj)} [another derivation]`));
      for (const p of ps) this.renderMemberPrem(c, p, indent + 1, next);
    });
  }

  /** A member's premise: of the present tick, or of the tick the cell was sealed in. */
  private renderMemberPrem(c: string, p: PremRef, indent: number, next: WhyTask[]): void {
    const t = this.store.cells.get(c)!.tick;
    next.push(t < this.store.tick ? { t: 'past', pr: p, at: t, indent } : { t: 'prem', pr: p, indent });
  }

  /** The demonstration `why` inlines under a negated premise: one step. */
  private negDemo(key: string): string | null {
    let lit: Lit;
    try { lit = this.parseLit(key); } catch { return null; }
    try { return this.whynotAt(lit, { maxDepth: 1, maxNodes: 64 })[1]; } catch (e) { if (e instanceof Wall || e instanceof Rejected || e instanceof Bug) return null; throw e; }
  }

  /** One literal, written as ROFL, lowered to what the evaluator runs. */
  parseLit(query: string): Lit {
    const l = canonLitSets(parseLiteral(query.trim().replace(/\.+$/, '')));
    const open = l.args.map(openSetAt).find((t) => t !== null);
    if (open) throw new Error(setPatternReason(canonTerm(open)));
    return resolveBook(l);
  }

  /** Every shrug row a literal could name, in key order, with the bindings it gives. */
  shrugsOf(lit: Lit): [string, Subst][] {
    const out: [string, string, Subst][] = [];
    for (const row of this.store.relPersp('shrug', KERNEL_PERSP)) {
      const t = row.args[0];
      let persp: string | null, at: Term;
      if (t.k === 'f' && t.name === 'in' && t.args.length === 2) { if (t.args[0].k !== 'a') continue; persp = t.args[0].name; at = t.args[1]; }
      else { persp = MAIN; at = t; }
      let rel: string, args: Term[] | null;
      if (at.k === 'a') { rel = at.name; args = []; }
      else if (at.k === 'f' && at.name === 'every') { if (at.args[0]?.k !== 'a') continue; rel = at.args[0].name; args = null; }
      else if (at.k === 'f') { rel = at.name; args = at.args; }
      else continue;
      if (rel !== lit.rel || rel.startsWith('$')) continue;
      if (args === null) persp = null;
      let s: Subst | null = persp !== null ? unify(lit.persp, mka(persp), new Map()) : new Map();
      if (args !== null) {
        if (args.length !== lit.args.length) continue;
        for (let i = 0; s && i < args.length; i++) s = unifyUnknown(lit.args[i], args[i], s);
      }
      if (s !== null) out.push([row.key, row.key, s]);
    }
    return out.sort((a, b) => cmpStr(a[0], b[0])).map(([, f, s]) => [f, s]);
  }

  /** A term as a reader writes it (src/shrug.ts, the same text). */
  shown(t: Term): string { return shown(t); }

  /** One shrug row as a line. */
  shrugLine(id: string): string {
    const [t, r, m] = this.rec(id).args;
    const reason = r.k === 'a' ? r.name : this.shown(r);
    const text = reasonText(reason) ?? '';
    const cause = m.k === 'a' ? causeText(m.name) : undefined;
    return cause !== undefined ? `${this.shown(t)} is a shrug: ${reason}, ${text}; ${this.shown(m)}, ${cause}`
      : `${this.shown(t)} is a shrug: ${reason}, ${text}; ${this.shown(m)}`;
  }

  /** WHY A SHRUG: its row, then each root target it rests on with its own row. */
  shrugWhy(id: string): string {
    const lines = [this.shrugLine(id)];
    const args = this.rec(id).args;
    lines.push(...this.widenedLines(args[0], '  '));
    const m = args[2];
    if (m.k === 'f' && m.name === 'from' && m.args.length === 1) {
      const rows = this.relPersp('shrug', KERNEL_PERSP);
      for (const root of unlist(m.args[0])) {
        const rk = canonTerm(root);
        for (const r of rows) if (canonTerm(this.rec(r).args[0]) === rk) lines.push(`  root ${this.shrugLine(r)}`);
        lines.push(...this.widenedLines(root, '    '));
        if (root.k === 'f' && root.name === RULE_HOLE && root.args[0]?.k === 'a') {
          const rule = this.ruleOf(root.args[0].name);
          if (rule) lines.push(`    ${rule.canon}`);
        }
      }
    }
    return lines.join('\n');
  }

  /** THE WIDENED WITNESS of a cell's hole. */
  private widenedLines(marker: Term, pad: string): string[] {
    const w = this.widenedMarks.get(canonTerm(marker));
    if (w === undefined) return [];
    const [val, steps, narrowed] = w;
    const n = marker.k === 'f' && marker.args[0]?.k === 'a' ? this.widen.get(marker.args[0].name) ?? 0 : 0;
    const out = [`${pad}[widened: after ${n} improvement${n === 1 ? '' : 's'} each end the join moved went to the next bound its rules write, or to its infinity; the least value lies within ${this.shown(val)}, which is an over-approximation of it]`];
    for (const [old, c, joined, wide] of steps) out.push(`${pad}  ${this.shown(old)} joined with ${this.shown(c)} is ${this.shown(joined)}, widened to ${this.shown(wide)}`);
    for (const [before, fresh, after] of narrowed) out.push(`${pad}  narrowed ${this.shown(before)} to ${this.shown(after)} by ${this.shown(fresh)}, the join of what its rules contribute from it`);
    return out;
  }

  // ----------------------------------------------------------- whynot

  /** `whynot`: the demonstration that a literal fails; `[holds, text]`. Renames from zero, as `whyText`. */
  whynotText(lit: Lit, b: { maxDepth: number; maxNodes: number }, shown?: string): [boolean, string] {
    const saved = this.renameCounter;
    this.renameCounter = 0;
    try { return this.whynotAt(lit, b, shown); } finally { this.renameCounter = saved; }
  }

  private whynotAt(lit: Lit, b: { maxDepth: number; maxNodes: number }, shown?: string): [boolean, string] {
    const ctx: WnCtx = { maxDepth: Math.max(1, b.maxDepth), maxNodes: Math.max(1, b.maxNodes), nodes: 0, path: new Set(), done: new Map<string, Set<number>>() };
    if (!this.dag) ctx.done.set = () => ctx.done;
    const s: Subst = new Map();
    const k = this.resolvedLitKey(lit, s);
    if (this.matchPremise(lit, s, 0, null).length > 0) return [true, `${this.plain ? shown ?? k : k} holds; nothing to demonstrate`];
    const lines = [`whynot ${k}:`];
    if (this.plain) {
      // the plain explainer knows no lattice, counting or unknown tuple
      const sh = this.shrugsOf(lit);
      if (sh.length > 0) {
        lines[0] = `whynot ${k}: no answer, a shrug`;
        for (const [f] of sh) lines.push(this.shrugWhy(f));
      }
      ctx.path.add(this.cycleKey(lit));
      lines.push(...this.explainTree(lit, ctx));
      return [false, lines.join('\n')];
    }
    const lat = this.whynotLattice(lit);
    if (lat !== null) { lines.push(...lat); return [false, lines.join('\n')]; }
    const cnt = this.whynotCounting(lit);
    if (cnt !== null) { lines.push(...cnt); return [false, lines.join('\n')]; }
    const path = this.whynotUnknown(lit);
    const sh = this.shrugsOf(lit);
    if (sh.length > 0) {
      lines[0] = `whynot ${k}: no answer, a shrug`;
      for (const [f] of sh) lines.push(this.shrugWhy(f));
    }
    if (path !== null) { lines.push(...path); return [false, lines.join('\n')]; }
    ctx.path.add(this.cycleKey(lit));
    for (const l of this.explainTree(lit, ctx)) lines.push(l);
    return [false, lines.join('\n')];
  }

  private whynotLattice(lit: Lit): string[] | null {
    if (this.subs.has(lit.rel)) return this.whynotSub(lit);
    const l = this.lattices.get(lit.rel);
    if (!l) return null;
    const [n, op] = l;
    const p = walk(lit.persp, new Map());
    if (p.k !== 'a' || lit.args.length !== n || !lit.args.every(isGround)) return null;
    const persp = p.name;
    const key = lit.args.slice(0, n - 1);
    const cell = factKey(lit.rel, persp, key);
    const markers = [mkf('$lattice', [mka(lit.rel), mka(persp), mki(this.store.tick), list(key)]), mkf('$lattice', [mka(lit.rel)])];
    const unknowns = [uCell(this.lk(lit.rel, persp, key)), uRel(lit.rel)];
    for (let i = 0; i < 2; i++) {
      const rs = this.holeReason(markers[i]);
      if (rs !== null) return [`  ${cell} has no value: hole(${rs}) [${this.latLabel(lit.rel, op)}]`, ...this.widenedLines(markers[i], '  '), ...this.unknownPath(unknowns[i])];
    }
    const vvar = mkv('?V');
    const probe: Lit = { ...lit, args: [...lit.args.slice(0, n - 1), vvar] };
    const m = this.matchPremise(probe, new Map(), 0, null)[0];
    if (m === undefined) return null;
    const held = resolve(vvar, m[0]);
    const hs = canonTerm(held), ws = canonTerm(lit.args[n - 1]);
    if (isJoin(op)) {
      const lines = [`  ${cell} is a lattice cell (${op}) holding ${hs} [lattice]`];
      const contribs = this.latticeContributions(lit.rel, persp, key, op);
      let below: boolean;
      try { below = this.joinLeqE(op, joinCanon(op, lit.args[n - 1]), held); } catch (e) {
        if (!(e instanceof Refused)) throw e;
        lines.push(`  ${ws} is no value of ${op}: agg_type_error`);
        return lines;
      }
      if (below) lines.push(`  ${ws} is not its value: ${op} joins every contribution, and they join to ${hs}`);
      else lines.push(`  ${ws} would widen it, and no contribution reaches it: ${contribs.length} contribution${contribs.length === 1 ? '' : 's'}, joined ${hs}`);
      contribs.some(([, text], i) => { if (i >= 8) { lines.push(`    [${contribs.length - 8} more contributions]`); return true; } lines.push(`    ${text}`); return false; });
      return lines;
    }
    let better = false;
    try { better = insert(op, lift(op, held), lift(op, lit.args[n - 1])).k === 'improved'; } catch { better = false; }
    const tag = this.tags.byRel.get(lit.rel);
    const lines = [tag !== undefined ? `  ${cell} is a tag cell (${tag[1]}) holding ${hs} [tag]` : `  ${cell} is a lattice cell (${op}) holding ${hs} [lattice]`];
    const contribs = this.latticeContributions(lit.rel, persp, key, op);
    if (better) lines.push(`  ${ws} would improve it, and no contribution reaches ${ws}: ${contribs.length} contribution${contribs.length === 1 ? '' : 's'}, the best ${hs}`);
    else lines.push(`  ${ws} is not its value: ${tag !== undefined ? tag[1] : op} keeps the best contribution, ${hs}`);
    contribs.some(([, text], i) => { if (i >= 8) { lines.push(`    [${contribs.length - 8} more contributions]`); return true; } lines.push(`    ${text}`); return false; });
    return lines;
  }

  private whynotSub(lit: Lit): string[] | null {
    const sub = this.subs.get(lit.rel)!;
    const p = walk(lit.persp, new Map());
    if (p.k !== 'a' || lit.args.length !== sub.arity || !lit.args.every(isGround)) return null;
    const persp = p.name;
    const k = sub.keylen;
    const key = lit.args.slice(0, k);
    const cell = factKey(lit.rel, persp, key);
    const markers = [mkf('$lattice', [mka(lit.rel), mka(persp), mki(this.store.tick), list(key)]), mkf('$lattice', [mka(lit.rel)])];
    const unknowns = [uCell(this.lk(lit.rel, persp, key)), uRel(lit.rel)];
    for (let i = 0; i < 2; i++) {
      const rs = this.holeReason(markers[i]);
      if (rs !== null) {
        const lines = [`  ${cell} has no value: hole(${rs}) [subsumption]`];
        const ps = this.conflictMarks.get(canonTerm(markers[i]));
        if (ps !== undefined) lines.push(`  its dominance is no order over ${ps.map((t) => this.shown(t)).sort(byteCmp).join(', ')}`);
        lines.push(...this.unknownPath(unknowns[i]));
        return lines;
      }
    }
    const front = this.subFront(lit.rel, persp, key);
    if (front.length === 0) return null;
    const ws = factKey(lit.rel, persp, lit.args);
    const lines = [`  ${cell} is a subsumption cell; its front is ${front.join(', ')}`];
    const ck = this.lk(lit.rel, persp, key);
    const given = this.subBy.get(`${ck.id}|${listKey(lit.args.slice(k))}`);
    if (given !== undefined && this.alive(given[0])) {
      const canon = sub.doms.find(([d]) => d.id === given[1])?.[0].canon ?? '';
      lines.push(`  ${ws} was given, and is dominated by ${given[0]}: ${given[1]} (${canon})`);
      return lines;
    }
    const asks: [string | null, boolean][] = [[null, true], ...front.map((f): [string, boolean] => [f, true]), ...front.map((f): [string, boolean] => [f, false])];
    let by: [string, string] | null = null, beats: [string, string] | null = null;
    for (const [f, lower] of asks) {
      const a = f === null ? lit.args : this.rec(f).args;
      if (lower && f !== null && by !== null) continue;
      const v = lower ? this.dominatedAs(lit.rel, lit.args, a, false) : this.dominatedAs(lit.rel, a, lit.args, false);
      const withT = f === null ? 'itself' : f;
      if (v.k === 'yes') {
        if (f === null) { lines.push(`  no rule gives ${ws}, and it dominates itself by ${v.rule}: given, its cell would be a conflict, dominance_cycle`); return lines; }
        if (lower) by = [f, v.rule]; else beats ??= [f, v.rule];
      } else if (v.k === 'fault') {
        lines.push(`  no rule gives ${ws}; given, its cell would be a hole, ${v.reason}: comparing it with ${withT} faults in ${v.rule}`);
        return lines;
      } else if (v.k === 'unknown') {
        lines.push(`  no rule gives ${ws}; given, its cell would not be known: comparing it with ${withT} in ${v.rule} reads ${this.unknownShown(v.u)}, which is not known`);
        return lines;
      }
    }
    if (by !== null) {
      const tail = beats !== null ? `, and it dominates ${beats[0]} by ${beats[1]}: given, its cell would be a conflict, dominance_intransitive` : '';
      lines.push(`  no rule gives ${ws}, and it would be dominated by ${by[0]}: ${by[1]}${tail}`);
      return lines;
    }
    const contribs = this.latticeContributions(lit.rel, persp, key, 'subsumption');
    lines.push(`  ${ws} would join the front, and no rule gives it: ${contribs.length} value${contribs.length === 1 ? '' : 's'} given at the key`);
    contribs.some(([, text], i) => { if (i >= 8) { lines.push(`    [${contribs.length - 8} more values]`); return true; } lines.push(`    ${text}`); return false; });
    return lines;
  }

  private whynotCounting(lit: Lit): string[] | null {
    const c = this.tags.countRel.get(lit.rel);
    if (c === undefined) return null;
    const n = this.tags.byRel.get(lit.rel)![0];
    const p = walk(lit.persp, new Map());
    if (p.k !== 'a' || lit.args.length !== n || !lit.args.every(isGround)) return null;
    const vvar = mkv('?V');
    const probe: Lit = { ...lit, args: [...lit.args.slice(0, n - 1), vvar] };
    const m = this.matchPremise(probe, new Map(), 0, null)[0];
    if (m === undefined) return null;
    const hs = canonTerm(resolve(vvar, m[0])), ws = canonTerm(lit.args[n - 1]);
    const cell = factKey(lit.rel, p.name, lit.args.slice(0, n - 1));
    const kk = listKey(lit.args.slice(0, n - 1));
    const derivs: string[] = [];
    for (const f of this.store.relPersp(c, p.name)) {
      if (listKey(f.args.slice(0, n - 1)) !== kk) continue;
      const w = this.store.witnessOf(f.key);
      derivs.push(`x${canonTerm(f.args[n])} by ${w !== undefined ? w.ruleId : 'a tick before'}`);
    }
    derivs.sort(byteCmp);
    const lines = [`  ${cell} is a tag cell (counting) holding ${hs} [tag]`,
      `  ${ws} is not its value: counting adds every derivation, and its ${derivs.length} derivation${derivs.length === 1 ? '' : 's'} add to ${hs}`];
    derivs.some((d, i) => { if (i >= 8) { lines.push(`    [${derivs.length - 8} more derivations]`); return true; } lines.push(`    ${d}`); return false; });
    return lines;
  }

  private whynotUnknown(lit: Lit): string[] | null {
    if (this.isLatticeLit(lit.rel, lit.args.length)) return null;
    const u = this.readUnknown(lit, new Map(), true);
    if (u === null) return null;
    if (this.latPlain.has(u.id) && this.latUnknown.get(u.id)?.[1] === null) return null;
    return [`  ${this.unknownShown(u)} is not known to hold`, ...this.unknownPath(u)];
  }

  /** The reason of the hole on `marker`, if there is one. */
  private holeReason(marker: Term): string | null {
    const rv = mkv('?R');
    const m = this.matchPremise({ rel: V.hole, persp: mka(KERNEL_PERSP), perspExplicit: true, args: [marker, rv], temporal: 'now' }, new Map(), 0, null)[0];
    return m === undefined ? null : canonTerm(resolve(rv, m[0]));
  }

  /** WHERE A WITHDRAWN CELL'S HOLE CAME FROM. */
  private unknownPath(u: Unknown): string[] {
    const lines: string[] = [];
    let cur = u;
    const seen = new Set<string>();
    for (;;) {
      const e = this.latUnknown.get(cur.id);
      if (e === undefined || e[1] === null) break;
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      const [from, rule] = e[1];
      let what: string;
      if (from.k === 'cell') {
        const r = this.holeReason(mkf('$lattice', [mka(from.ck.rel), mka(from.ck.persp), mki(this.store.tick), list(from.ck.key)]));
        what = r !== null ? `which has no value: hole(${r})` : 'whose value is not known';
      } else if (from.k === 'rel') {
        const r = this.holeReason(mkf('$lattice', [mka(from.rel)]));
        what = r !== null ? `hole(${r})` : 'none of them known';
      } else what = 'which is not known to hold';
      lines.push(`    reached by ${rule} from ${this.unknownShown(from)}, ${what}`);
      cur = from;
    }
    return lines;
  }

  /** Every contribution the rules of a lattice relation make at one key, best first. */
  private latticeContributions(rel: string, persp: string, key: Term[], op: AggOp): [Term, string][] {
    const rules = this.rules.filter((r) => r.clause.head.rel === rel && r.clause.head.temporal !== 'next');
    const out: [Val | null, Term, string][] = [];
    const arity = this.lattices.get(rel)?.[0] ?? key.length + 1;
    for (const r of rules) {
      const rn = this.renameClause(r.clause);
      if (rn.head.args.length !== arity) continue;
      if (rn.body.some((b) => b.t === 'agg')) { out.push([null, mka('false'), `? <= ${r.id}: (an aggregate in its body)`]); continue; }
      let s: Subst | null = unify(rn.head.persp, mka(persp), new Map());
      for (let i = 0; s && i < key.length; i++) s = unify(rn.head.args[i], key[i], s);
      if (s === null) continue;
      for (const sol of this.solveBody(planBodyAgg(rn, this.plain).plan, s, 0, null, null)) {
        const v = resolve(rn.head.args[key.length], sol.s);
        const vs = rn.head.args.slice(key.length).map((a) => canonTerm(resolve(a, sol.s))).join(', ');
        const prems = sol.prems.flatMap((p) => (p.t === 'fact' ? [p.key] : p.t === 'bi' ? [p.desc] : p.t === 'neg' ? [`not ${p.key}`] : []));
        let lv: Val | null = null;
        try { lv = lift(op, v); } catch { lv = null; }
        out.push([lv, v, `${vs} <= ${r.id}: ${prems.join(', ')}`]);
      }
    }
    const rank = (x: Val | null, y: Val | null): number => {
      if (x !== null && y !== null) {
        try { const st = insert(op, y, x); return st.k === 'improved' ? -1 : st.k === 'unchanged' ? 1 : 0; } catch { return 0; }
      }
      if (x !== null) return -1;
      if (y !== null) return 1;
      return 0;
    };
    out.sort((a, b) => rank(a[0], b[0]) || cmpStr(a[2], b[2]));
    const dedup = out.filter((x, i) => i === 0 || x[2] !== out[i - 1][2]);
    return dedup.map(([, v, t]) => [v, t]);
  }

  /** One node: for every rule that could conclude the literal, the failing premise instances, each followed in turn
   *  (`explainRule`), after the one before it has been followed down. */
  private explainFailure(lit: Lit, level: number, ctx: WnCtx, next: WnTask[]): void {
    ctx.nodes++;
    const pad = '  '.repeat(2 * level - 1);
    const rules = this.rules.filter((r) => r.clause.head.rel === lit.rel);
    if (rules.length === 0) { next.push({ t: 'line', line: `${pad}no rule concludes '${lit.rel}' and no matching base fact exists` }); return; }
    for (const r of rules) next.push({ t: 'rule', lit, r, level });
  }

  /** One rule that could conclude `lit`: its failing premise instances, each followed one level deeper. */
  private explainRule(lit: Lit, r: ERule, level: number, next: WnTask[]): void {
    const pad = '  '.repeat(2 * level - 1);
    const rn = this.renameClause(r.clause);
    let s: Subst | null = this.evalBuiltin('=', rn.head.persp, lit.persp, new Map(), null);
    const n = Math.min(rn.head.args.length, lit.args.length);
    for (let i = 0; s && i < n; i++) s = this.evalBuiltin('=', rn.head.args[i], lit.args[i], s, null);
    if (s === null || rn.head.args.length !== lit.args.length) { next.push({ t: 'line', line: `${pad}rule ${r.id}: head does not unify` }); return; }
    const failures = this.failingPremises(rn, s, r.id);
    next.push({ t: 'line', line: `${pad}rule ${r.id}: ${r.canon}` });
    const keys = [...failures.keys()].sort(cmpStr).slice(0, 12);
    if (keys.length === 0) next.push({ t: 'line', line: `${pad}  (no failing premise found within exploration bounds)` });
    for (const f of keys) {
      next.push({ t: 'line', line: `${pad}  failed premise: ${f}` });
      const sub = failures.get(f);
      if (sub) next.push({ t: 'deeper', lit: sub, level: level + 1 });
    }
  }

  /** Everything that makes the walk terminate: the cycle path, the depth cap, the node cap, each said in the output. */
  private explainDeeper(lit: Lit, level: number, ctx: WnCtx, next: WnTask[]): void {
    const pad = '  '.repeat(2 * level - 1);
    if (level > ctx.maxDepth) { if (ctx.maxDepth > 1) next.push({ t: 'line', line: `${pad}[depth limit ${ctx.maxDepth} reached]` }); return; }
    if (ctx.nodes >= ctx.maxNodes) { next.push({ t: 'line', line: `${pad}[node limit ${ctx.maxNodes} reached]` }); return; }
    const ck = this.cycleKey(lit);
    if (ctx.path.has(ck)) { next.push({ t: 'line', line: `${pad}${this.resolvedLitKey(lit, new Map())} [cycle]` }); return; }
    if (isGround(lit.persp) && lit.args.every(isGround)) {
      let at = ctx.done.get(ck);
      if (at !== undefined && at.has(level)) { next.push({ t: 'line', line: `${pad}${this.resolvedLitKey(lit, new Map())} [above]` }); return; }
      if (at === undefined) { at = new Set(); ctx.done.set(ck, at); }
      at.add(level);
    }
    ctx.path.add(ck);
    next.push({ t: 'failure', lit, level }, { t: 'unpath', ck });
  }

  /** THE DEMONSTRATION, WALKED WITH A STACK OF ITS OWN (as `renderTree` walks `why`): a failure as deep as the bounds
   *  allow takes no frame per level, and each line is written once. */
  private explainTree(lit: Lit, ctx: WnCtx): string[] {
    const lines: string[] = [], todo: WnTask[] = [{ t: 'failure', lit, level: 1 }], next: WnTask[] = [];
    for (let t = todo.pop(); t !== undefined; t = todo.pop()) {
      if (t.t === 'failure') this.explainFailure(t.lit, t.level, ctx, next);
      else if (t.t === 'rule') this.explainRule(t.lit, t.r, t.level, next);
      else if (t.t === 'deeper') this.explainDeeper(t.lit, t.level, ctx, next);
      else if (t.t === 'line') lines.push(t.line);
      else ctx.path.delete(t.ck);
      for (let i = next.length - 1; i >= 0; i--) todo.push(next[i]);
      next.length = 0;
    }
    return lines;
  }

  private failingPremises(rn: Clause, s0: Subst, rid: string): Map<string, Lit | null> {
    const out = new Map<string, Lit | null>();
    this.exploreBody(planBodyAgg(rn, this.plain).plan, 0, s0, out, { n: 0 }, rid);
    return out;
  }

  private exploreBody(body: BodyElem[], k: number, s: Subst, out: Map<string, Lit | null>, nodes: { n: number }, rule: string | null): void {
    nodes.n++;
    if (nodes.n > 2000 || k >= body.length) return;
    const put = (key: string, v: Lit | null) => { if (!out.has(key)) out.set(key, v); };
    const b = body[k];
    if (b.t === 'pos') {
      const mm = this.matchPremise(b.lit, s, 0, null);
      if (mm.length === 0) put(this.resolvedLitKey(b.lit, s), this.instantiate(b.lit, s));
      else for (const [s2] of mm.slice(0, 16)) this.exploreBody(body, k + 1, s2, out, nodes, rule);
    } else if (b.t === 'neg') {
      const mm = this.matchPremise(b.lit, s, 0, null);
      if (mm.length > 0) {
        const [s2, r] = mm[0];
        const wit = r.t === 'fact' ? r.key : this.resolvedLitKey(b.lit, s2);
        put(`not ${this.resolvedLitKey(b.lit, s)} -- blocked: ${wit} holds`, null);
      } else this.exploreBody(body, k + 1, s, out, nodes, rule);
    } else if (b.t === 'agg' && b.op === 'at_least') {
      if (rule === null) throw new Bug('an aggregate explored outside a rule');
      this.exploreThreshold(body, k, s, b, rule, out, nodes);
    } else if (b.t === 'agg') {
      if (rule === null) throw new Bug('an aggregate explored outside a rule');
      const desc = this.aggDesc(b, s);
      const mm = this.aggPremise(rule, b, s, 0, false);
      if (mm.length > 0) { for (const [s2] of mm.slice(0, 16)) this.exploreBody(body, k + 1, s2, out, nodes, rule); return; }
      const [plan, corr] = this.aggCorr(rule, b, s);
      const sealed = this.sealCells(rule, b, plan, s, corr, 0, false);
      if (sealed.k === 'open') { put(`${desc} has no value: hole(${sealed.reason}) [aggregate]`, null); return; }
      if (sealed.k === 'kept') throw new Bug('whynot stored a cell');
      const mine: [string, CellValue, number][] = [];
      for (const [key, value, n] of sealed.cells) if (this.bindGroup(b, plan, s, key) !== null) mine.push([tupleText(key), value, n]);
      mine.sort((x, y) => cmpStr(x[0], y[0]));
      const valued = mine.find(([, v]) => v.k === 'value')?.[1];
      const holed = mine.find(([, v]) => v.k === 'hole')?.[1];
      const unranked = mine.find(([, v, n]) => v.k === 'empty' && n > 0)?.[2];
      if (valued !== undefined && valued.k === 'value') put(`${desc} = ${canonTerm(valued.t)}, not ${canonTerm(resolve(b.res, s))} [aggregate]`, null);
      else if (holed !== undefined && holed.k === 'hole') put(`${desc} has no value: hole(${holed.reason}) [aggregate]`, null);
      else if (unranked !== undefined) put(`${desc} has no value: ${b.vals.slice(0, aggParams(b)).map((t) => canonTerm(resolve(t, s))).join(', ')} is not one of its ${unranked} distinct values [aggregate]`, null);
      else put(`${desc} has no value: empty group [aggregate]`, b.body.length === 1 && b.body[0].t === 'pos' ? this.instantiate(b.body[0].lit, s) : null);
    } else {
      const s2s = this.evalBuiltins(b.op, b.l, b.r, s, null);
      if (s2s.length > 0) for (const s2 of s2s.slice(0, 16)) this.exploreBody(body, k + 1, s2, out, nodes, rule);
      else put(`${canonTerm(resolve(b.l, s))} ${b.op} ${canonTerm(resolve(b.r, s))} [builtin fails]`, null);
    }
  }

  /** WHYNOT OF A THRESHOLD. */
  private exploreThreshold(body: BodyElem[], k: number, s: Subst, a: AggElem, rid: string, out: Map<string, Lit | null>, nodes: { n: number }): void {
    const put = (key: string, v: Lit | null) => { if (!out.has(key)) out.set(key, v); };
    const [plan, corr] = this.aggCorr(rid, a, s);
    const desc = this.aggDesc(a, s);
    const nr = resolve(a.res, s);
    if (nr.k !== 'i') { put(`${desc} has no value: hole(agg_type_error) [threshold]`, null); return; }
    const need = BigInt(nr.v) > 0n ? Number(nr.v) : 0;
    const [groups, dropped] = this.thrGroups(rid, a, plan, s, 0, false, null);
    if (groups.length === 0 && plan.group.length === 0) groups.push([[], []]);
    const reached: Subst[] = [];
    let best: [Term[], ThrMember[]] | null = null;
    for (const [gkey, ms] of groups) {
      const s2 = this.bindGroup(a, plan, s, this.thrShared(a, plan, corr, gkey));
      if (s2 === null) continue;
      if (ms.length >= need) reached.push(s2);
      else if (best === null || ms.length > best[1].length) best = [gkey, ms];
    }
    if (reached.length > 0) { for (const s2 of reached.slice(0, 16)) this.exploreBody(body, k + 1, s2, out, nodes, rid); return; }
    const [gkey, ms] = best ?? [[], []];
    const named = gkey.length === plan.group.length ? (this.bindGroup(a, plan, s, this.thrShared(a, plan, corr, gkey)) ?? s) : s;
    const d = this.aggDesc(a, named);
    const hs = ms.map((m, i): [number, number] => [Math.min(...m.derivs.map((x) => this.memberHeight(x[1]))), i]);
    const ranked = hs.map(([h, i]): [number, string] => [h, ms[i].text]);
    const order = quorum(ranked, ranked.length) ?? [];
    const listed = order.map((j, i) => `#${i + 1} ${ranked[j][1]} h=${ranked[j][0]}`);
    let line = `${d} reached ${ms.length} of ${need} [threshold]`;
    if (listed.length > 0) line += ': ' + listed.join(', ');
    if (dropped !== null) line += `; a member was dropped: hole(${dropped})`;
    put(line, ms.length === 0 && a.body.length === 1 && a.body[0].t === 'pos' ? this.instantiate(a.body[0].lit, named) : null);
  }

  private instantiate(l: Lit, s: Subst): Lit { return { ...l, persp: walk(l.persp, s), args: l.args.map((a) => resolve(a, s)) }; }

  /** The literal with its variables renumbered by first appearance. */
  private cycleKey(l: Lit): string {
    const seen = new Map<string, string>();
    const renumber = (t: Term): Term => {
      if (t.k === 'v') { let nm = seen.get(t.name); if (nm === undefined) { nm = `$${seen.size}`; seen.set(t.name, nm); } return mkv(nm); }
      if (t.k === 'f') return mkf(t.name, t.args.map(renumber));
      return t;
    };
    const p = renumber(l.persp);
    return `${l.rel}[${canonTerm(p)}](${l.args.map((a) => canonTerm(renumber(a))).join(',')})@${l.temporal}`;
  }
}

// ------------------------------------------------------------- helpers

export const WHY_MEMBERS = 5;
interface WhyOpts { members: number; query: string }
interface WnCtx {
  maxDepth: number; maxNodes: number; nodes: number; path: Set<string>;
  /** The ground literals demonstrated, with the levels each was written at: the depth below a level is what the demonstration shows, so one reached again at a level it was written at is referred to, at another it is written again. */
  done: Map<string, Set<number>>;
}
/** One step of `whynot`'s walk (`explainTree`). */
type WnTask = { t: 'failure'; lit: Lit; level: number } | { t: 'rule'; lit: Lit; r: ERule; level: number }
  | { t: 'deeper'; lit: Lit; level: number } | { t: 'line'; line: string } | { t: 'unpath'; ck: string };
type CellRecNew = Omit<CellRec, 'key'>;
type CellMemberNew = CellMember;

const cellKeyOf = cellKeyText;
/** `$cell(Rule, At, Tick, Key)` as a term. */
const cellMarker = (rule: string, at: number, tick: number, key: Term[]): Term => mkf('$cell', [mka(rule), mki(at), mki(tick), list(key)]);
/** Rust's `sort()` on strings: byte order, which is code-point order. UTF-16 order differs only where one unit is a
 *  surrogate, which stands for a code point above every unit that is not one. */
function byteCmp(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i), y = b.charCodeAt(i);
    if (x === y) continue;
    const sx = x >= 0xd800 && x <= 0xdfff, sy = y >= 0xd800 && y <= 0xdfff;
    return sx === sy ? x - y : sx ? 1 : -1;
  }
  return a.length - b.length;
}

/** Arithmetic as the Rust engine computes it, with a semiring tag's ⊗. */
function evalArithT(t0: Term, s: Subst, fail: ArithFail): Int | null {
  const t = walk(t0, s);
  if (t.k === 'f' && t.args.length === 2) {
    const alg = tagFromTimesName(t.name);
    if (alg !== null) {
      const xs: bigint[] = [];
      for (const a of t.args) {
        const w = walk(a, s);
        if (w.k === 'i') xs.push(BigInt(w.v));
        else if (w.k === 'v') { fail.code = ARITH_UNBOUND; return null; }
        else { fail.code = CODE.tagCarrier; return null; }
      }
      try { const r = tagTimes(alg, xs[0], xs[1]); return mki(r as Int).k === 'i' ? (mki(r as Int) as { v: Int }).v : null; } catch (e) {
        if (!(e instanceof TagFailed)) throw e;
        fail.code = e.fault === 'carrier' ? CODE.tagCarrier : ARITH_OVERFLOW;
        return null;
      }
    }
    if (hasTagCall(t)) {
      const l = evalArithT(t.args[0], s, fail);
      if (l === null) return null;
      const r = evalArithT(t.args[1], s, fail);
      if (r === null) return null;
      return evalArith(mkf(t.name, [mki(l), mki(r)]), new Map(), fail);
    }
  }
  return evalArith(t, s, fail);
}
const hasTagCall = (t: Term): boolean => t.k === 'f' && (tagFromTimesName(t.name) !== null || t.args.some(hasTagCall));


class RootSets {
  private index: Map<string, number>; private nodes: Node[]; private parents: number[][]; private comp: number[];
  private sets: number[][]; private text: Map<number, string>;
  constructor(index: Map<string, number>, nodes: Node[], parents: number[][], comp: number[], sets: number[][], text: Map<number, string>) {
    this.index = index; this.nodes = nodes; this.parents = parents; this.comp = comp; this.sets = sets; this.text = text;
  }
  hasParents(n: Node): boolean { const i = this.index.get(n.id); return i !== undefined && this.parents[i].length > 0; }
  /** The root targets `n` rests on, sorted by their text. */
  of(n: Node): Term[] {
    const i = this.index.get(n.id);
    if (i === undefined) return [];
    const rs = [...new Set(this.parents[i].flatMap((p) => this.sets[this.comp[p]]))].sort((a, b) => a - b);
    const keyed: [string, Term][] = [];
    for (const r of rs) { const nd = this.nodes[r]; if (nd.k === 'hole') keyed.push([this.text.get(r)!, nd.t]); }
    keyed.sort((a, b) => cmpStr(a[0], b[0]));
    return keyed.filter((x, j) => j === 0 || x[0] !== keyed[j - 1][0]).map((x) => x[1]);
  }
}

class NegCycles {
  private memo = new Map<string, string[]>();
  private idx: Map<string, number>; private rels: string[]; private succ: number[][]; private comp: number[]; private neg: Set<number>;
  constructor(idx: Map<string, number>, rels: string[], succ: number[][], comp: number[], neg: Set<number>) {
    this.idx = idx; this.rels = rels; this.succ = succ; this.comp = comp; this.neg = neg;
  }
  /** The relations `rel` rests on that lie on a negative cycle, sorted. */
  of(rel: string): string[] {
    const m = this.memo.get(rel);
    if (m) return m;
    const out: string[] = [];
    const start = this.idx.get(rel);
    if (start !== undefined) {
      const seen = new Array<boolean>(this.rels.length).fill(false);
      seen[start] = true;
      const todo = [start];
      while (todo.length > 0) {
        const x = todo.pop()!;
        if (this.neg.has(this.comp[x])) out.push(this.rels[x]);
        for (const y of this.succ[x]) if (!seen[y]) { seen[y] = true; todo.push(y); }
      }
    }
    out.sort(cmpStr);
    this.memo.set(rel, out);
    return out;
  }
}

class Dominators {
  private at: Map<string, number>; private tin: number[]; private tout: number[]; private reached: boolean[];
  constructor(at: Map<string, number>, tin: number[], tout: number[], reached: boolean[]) {
    this.at = at; this.tin = tin; this.tout = tout; this.reached = reached;
  }
  covers(q: string): boolean { return this.at.has(q); }
  /** Does `q` have a derivation that does not use `f`? */
  foundedWithout(f: string, q: string): boolean {
    const a = this.at.get(f), b = this.at.get(q);
    if (a === undefined || b === undefined) return false;
    return this.reached[b] && a !== b && !(this.reached[a] && this.tin[a] <= this.tin[b] && this.tout[b] <= this.tout[a]);
  }
}

/** A binary min-heap of (height, node), ties ordered as the Rust engine's
 *  derived order orders its nodes: a fact before a member before a cell, a
 *  member by (i, j, k). */
class MinHeap {
  private a: [number, string][] = [];
  private static rank(n: string): number { return n[0] === 'F' ? 0 : n[0] === 'M' ? 1 : n[0] === 'C' ? 2 : 0; }
  private static less(x: [number, string], y: [number, string]): boolean {
    if (x[0] !== y[0]) return x[0] < y[0];
    const rx = MinHeap.rank(x[1]), ry = MinHeap.rank(y[1]);
    if (rx !== ry) return rx < ry;
    if (x[1][0] === 'M' || x[1][0] === 'C') {
      const p = x[1].slice(1).split('|').map(Number), q = y[1].slice(1).split('|').map(Number);
      for (let i = 0; i < Math.min(p.length, q.length); i++) if (p[i] !== q[i]) return p[i] < q[i];
      return false;
    }
    return x[1] < y[1];
  }
  push(h: number, n: string): void {
    const a = this.a;
    a.push([h, n]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!MinHeap.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop(): [number, string] | null {
    const a = this.a;
    if (a.length === 0) return null;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && MinHeap.less(a[l], a[m])) m = l;
        if (r < a.length && MinHeap.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** Does the store declare a lattice, a tag or a dominance rule, or reflect a
 *  rule with an aggregate, a join read or an interval function? Then
 *  `AggEval` evaluates it. */
export function storeHasAggregates(store: FactStore): boolean {
  for (const rel of [V.lattice_decl, V.tag_decl, V.dominance, V.premise_agg]) if (store.relCount(rel) > 0) return true;
  for (const f of store.relAll(V.premise_lit)) if (f.args.length === 3 && termHasAgg(f.args[2])) return true;
  // a head that writes a set with a variable is a join's contribution, or a refusal only the lattices decide
  for (const f of store.relAll(V.conclusion_lit)) {
    const l = f.args[2];
    if (f.args.length === 3 && l?.k === 'f' && l.name === '$lit') {
      const args = unlist(l.args[2]);
      const last = args[args.length - 1];
      if (last !== undefined && last.k === 'f' && last.name === 'set' && last.args.length > 1 && !reifiedGround(last)) return true;
    }
  }
  return store instanceof Store && store.cells.size > 0;
}
const reifiedGround = (t: Term): boolean => !(t.k === 'f' && (t.name === '$var' || t.args.some((a) => !reifiedGround(a))));
function termHasAgg(t: Term): boolean {
  if (t.k !== 'f') return false;
  if (t.name === '$agg') return true;
  if (t.name === '$builtin' && t.args[0]?.k === 's') {
    const op = t.args[0].v;
    if (op === 'in' || op === 'subset') return true;
    const r = unlist(t.args[1])[1];
    if (op === 'is' && r !== undefined && r.k === 'f' && IV_FNS.has(r.name)) return true;
  }
  return false;
}

// ------------------------------------------------------------ the door
//
// THE LOAD DOOR OF A PROGRAM WITH AGGREGATES (rust/rofl/src/program.rs):
// pure functions of a clause, run before anything is written. The shape of
// an aggregate (a key on sum, none on count) is safety.rofl's judgement.

const srcTerm = (t: Term): string => (t.k === 'v' ? t.name : t.k === 'f' ? `${t.name}(${t.args.map(srcTerm).join(', ')})` : canonTerm(t));

/** `lattice dist(A, C, min D)` as a reader wrote it. */
export function declText(c: Clause): string {
  const n = c.head.args.length;
  if (c.ord) {
    const m = c.ord.length;
    return `${c.lattice} ${c.head.rel}(${c.head.args.map((t, k) => (k + m >= n ? `${c.ord![k + m - n]} ` : '') + srcTerm(t)).join(', ')})`;
  }
  const args = c.head.args.map((t, k) => (k + 1 === n && c.lattice ? `${c.lattice} ` : '') + srcTerm(t)).join(', ');
  return `${c.tag ? 'tag' : 'lattice'} ${c.head.rel}(${args})${c.widen !== undefined ? ` widen ${c.widen}` : ''}`;
}

/** `'@next' is not allowed in rule bodies`, for the outer body and an aggregate's alike. */
export function checkNextInBody(c: Clause): string | null {
  return c.body.flatMap(litsOf).some((l) => l.temporal === 'next') ? `rule ${canonClause(c)}: '@next' is not allowed in rule bodies` : null;
}

/** What would bind `v` in a later element. */
function binderOf(b: BodyElem, v: string): string | null {
  if (b.t === 'pos') return elemVars(b).has(v) ? `${b.lit.rel}/${b.lit.args.length}` : null;
  if (b.t === 'bi' && (b.op === '=' || b.op === 'is')) return elemVars(b).has(v) ? `'${b.op}'` : null;
  if (b.t === 'agg') {
    const vs = b.op === 'at_least' ? new Set<string>() : varsOf(b.res);
    for (const x of b.shared ?? []) vs.add(x);
    return vs.has(v) ? 'another aggregate' : null;
  }
  return null;
}

function stuckMessage(c: Clause, l: Lit, bound: string[]): string {
  const vs = new Set<string>();
  for (const a of l.args) varsOf(a, vs);
  varsOf(l.persp, vs);
  const names: string[] = [];
  for (const x of vs) {
    if (bound.includes(x)) continue;
    const n = x.startsWith('_$') ? '_' : x;
    if (!names.includes(n)) names.push(n);
  }
  const vars = names.join(', ');
  return `rule ${canonClause(c)}: no premise binds ${vars} before 'not ${l.rel}/${l.args.length}', so what the negation asks would depend on where it is written -- unbound it asks whether ANY such fact exists, bound it asks about that one. Bind ${vars} in a positive premise, or write '_' if the existential reading is what is meant.`;
}

/** `checkOrderable` over the planner that knows aggregates. */
export function checkOrderableAgg(c: Clause): string | null {
  const pb = planBodyAgg(c);
  if (pb.stuck === null || !pb.ground) return null;
  const b = c.body[pb.stuck];
  return b.t === 'neg' ? stuckMessage(c, b.lit, pb.bound) : null;
}

/** THE DOOR OF AN AGGREGATE. `c` is annotated (`annotateAggs`). */
/** A rank over a tuple reads its subject from outside, a constant or a variable bound before it, with no direction; each
 *  key is a variable or a constant, in `asc(..)` or `desc(..)` for its direction. */
function rankTupleDoor(a: AggElem, before: string[]): string | null {
  for (const p of a.vals) {
    if (keyDir(p)[1]) return `rank's subject has no direction, only its keys do: ${canonTerm(p)}`;
    const boundBefore = p.k === 'v' && before.includes(p.name);
    if (!boundBefore && p.k !== 'i' && p.k !== 'a' && p.k !== 's') return `rank's subject is a constant or a variable bound before it, not ${canonTerm(p)}`;
  }
  for (const k of a.keys) {
    const inner = keyDir(k)[1] && k.k === 'f' ? k.args[0] : k;
    if (inner.k === 'f') return `a rank key is a variable or a constant, in asc(..) or desc(..) for its direction, not ${canonTerm(k)}`;
  }
  return null;
}

export function checkAggregatesDoor(c: Clause): string | null {
  for (let k = 0; k < c.body.length; k++) {
    const a = c.body[k];
    if (a.t !== 'agg') continue;
    const before = planElems([], c.body.slice(0, k), [], []).bound;
    if (a.op === 'at_least') {
      const boundBefore = a.res.k === 'v' && before.includes(a.res.name);
      if (!boundBefore && a.res.k !== 'i') return `rule ${canonClause(c)}: at_least's threshold is an integer or a variable bound before it, not ${canonTerm(a.res)}`;
    } else if (a.res.k === 'f') return `rule ${canonClause(c)}: an aggregate's result is a variable or a constant`;
    const op = opFromName(a.op);
    if (op === 'rank' && a.keys.length > 0) {
      const why = rankTupleDoor(a, before);
      if (why !== null) return `rule ${canonClause(c)}: ${why}`;
    } else if (op !== null && opParams(op) === 1 && a.vals.length === 2) {
      const p = a.vals[0];
      const boundBefore = p.k === 'v' && before.includes(p.name);
      const what = op === 'quantile' ? "quantile's percent" : "rank's subject";
      if (!boundBefore && p.k !== 'i') return `rule ${canonClause(c)}: ${what} is an integer or a variable bound before it, not ${canonTerm(p)}`;
      if (op === 'quantile' && p.k === 'i' && (BigInt(p.v) < 0n || BigInt(p.v) > 100n)) return `rule ${canonClause(c)}: quantile's percent is an integer from 0 to 100, not ${canonTerm(p)}`;
    }
    if (a.res.k === 'v' && a.op !== 'at_least' && aggInnerVars(a).has(a.res.name)) {
      return `rule ${canonClause(c)}: '${a.res.name}' is the aggregate's result and also appears inside it`;
    }
    if (a.body.some((x) => x.t === 'agg')) return `rule ${canonClause(c)}: an aggregate inside an aggregate is not supported`;
    for (const v of a.shared ?? []) {
      if (before.includes(v)) continue;
      for (const later of c.body.slice(k + 1)) {
        const by = binderOf(later, v);
        if (by !== null) {
          return `rule ${canonClause(c)}: ${v} is bound by ${by} after the aggregate, so whether the aggregate is asked per ${v} or groups by ${v} would depend on where it is written; bind ${v} before the aggregate (an empty group then counts 0) or leave ${v} to the aggregate (only groups with members appear)`;
        }
      }
    }
    const outside = new Set<string>();
    for (const t of [...a.vals, ...a.keys]) varsOf(t, outside);
    for (const t of [...c.head.args, c.head.persp]) varsOf(t, outside);
    c.body.forEach((x, j) => { if (j !== k) elemVars(x, outside); });
    const pe = planElems([], a.body, before, [...outside]);
    if (pe.stuck !== null) {
      const x = a.body[pe.stuck];
      if (x.t === 'neg') return `${stuckMessage(c, x.lit, pe.bound)} inside the aggregate`;
    }
  }
  return null;
}

/** A SET HAS ONE SPELLING: a set with a variable stands only where the kernel canonicalises it. */
export function checkSetPatternsDoor(c: Clause): string | null {
  const n = c.head.args.length;
  let found: Term | null = null;
  c.head.args.some((a, i) => { found = i + 1 === n ? openSetBelowAt(a) : openSetAt(a); return found !== null; });
  if (found === null) found = bodyOpenSet(c.body);
  return found === null ? null : `rule ${canonClause(c)}: ${setPatternReason(canonTerm(found))}`;
}
function openSetBelowAt(t: Term): Term | null {
  const xs = setElems(t);
  if (xs === null) return openSetAt(t);
  for (const x of xs) { const o = openSetAt(x); if (o) return o; }
  return null;
}
function bodyOpenSet(body: BodyElem[]): Term | null {
  for (const b of body) {
    let o: Term | null = null;
    if (b.t === 'pos' || b.t === 'neg') { for (const a of b.lit.args) { o = openSetAt(a); if (o) break; } }
    else if (b.t === 'bi' && b.op === 'in') o = openSetAt(b.l) ?? openSetBelowAt(b.r);
    else if (b.t === 'bi' && b.op === 'subset') o = openSetBelowAt(b.l) ?? openSetBelowAt(b.r);
    else if (b.t === 'bi') o = openSetAt(b.l) ?? openSetAt(b.r);
    else {
      for (const t of [b.res, ...b.vals, ...b.keys]) { o = openSetAt(t); if (o) break; }
      o ??= bodyOpenSet(b.body);
    }
    if (o) return o;
  }
  return null;
}

/** A LATTICE (or tag) DECLARATION AT THE DOOR. */
export function checkLatticeDecl(c: Clause, arityOf: (rel: string) => number | undefined): string | null {
  const rel = c.head.rel;
  if (RESERVED.has(rel) || rel.startsWith('$') || arityOf(rel) !== undefined) return `${declText(c)}: '${rel}' is a kernel relation and cannot be ${c.tag ? 'tagged' : 'a lattice'}`;
  const seen: string[] = [];
  for (const a of c.head.args) {
    if (a.k !== 'v') return `${declText(c)}: a declaration's arguments are variables, the key and then the value`;
    if (seen.includes(a.name)) return `${declText(c)}: '${a.name}' is written twice; a declaration names each argument once`;
    seen.push(a.name);
  }
  return null;
}

/** A DECLARED ORDER AT THE DOOR (docs/aggregates.md, "Declared orders, as
 *  built"; `lower_order`, rust/rofl/src/program.rs): the refusal, or the
 *  dominance rules the order stands for as source text, one strict in each
 *  value. */
export function lowerOrder(c: Clause, arityOf: (rel: string) => number | undefined): string | string[] {
  const rel = c.head.rel, kind = c.lattice!, dirs = c.ord!;
  const what = declText(c);
  if (RESERVED.has(rel) || rel.startsWith('$') || arityOf(rel) !== undefined) return `${what}: '${rel}' is a kernel relation and cannot be ordered`;
  const names: string[] = [];
  for (const a of c.head.args) {
    if (a.k !== 'v') return `${what}: a declaration's arguments are variables, the key and then each value with its direction`;
    if (names.includes(a.name)) return `${what}: '${a.name}' is written twice; a declaration names each argument once`;
    names.push(a.name);
  }
  // a wildcard is a value no rule reads, and a name of its own in a rule
  const named = [...names];
  names.forEach((x, i) => { if (x.startsWith('_$')) { let y = `Any${i + 1}`; while (named.includes(y)) y += '_'; names[i] = y; } });
  const m = dirs.length, key = names.slice(0, names.length - m), lo = names.slice(names.length - m);
  const hi = lo.map((x) => { let y = `${x}_`; while (names.includes(y)) y += '_'; return y; });
  const fact = (vs: string[]) => `${rel}(${[...key, ...vs].join(', ')})`;
  const cmp = (i: number, strict: boolean) => `${hi[i]} ${dirs[i] === 'min' ? (strict ? '<' : '<=') : (strict ? '>' : '>=')} ${lo[i]}`;
  const out: string[] = [];
  for (let j = 0; j < m; j++) {
    const body: string[] = [];
    for (let i = 0; i < m; i++) {
      if (kind !== 'pareto' && i > j) continue;
      body.push(i === j ? cmp(i, true) : kind === 'pareto' ? cmp(i, false) : `${hi[i]} = ${lo[i]}`);
    }
    out.push(`${fact(lo)} <= ${fact(hi)} :- ${body.join(', ')}.`);
  }
  return out;
}

/** A DOMINANCE RULE AT THE DOOR: the refusal, or the rule's parts and key length. */
export function checkDominance(c: Clause, arityOf: (rel: string) => number | undefined):
  string | { lo: Lit; hi: Lit; body: BodyElem[]; k: number } {
  const rel = c.head.rel;
  const what = `dominance ${rel}`;
  const hi0 = c.dominator!;
  if (RESERVED.has(rel) || rel.startsWith('$') || arityOf(rel) !== undefined) return `${what}: '${rel}' is a kernel relation, and its facts are the kernel's to keep`;
  if (hi0.rel !== rel) return `${what}: a dominance rule compares two facts of one relation, and the right of \`<=\` is ${hi0.rel}`;
  if (c.head.args.length !== hi0.args.length) return `${what}: its two facts are written at two arities, ${c.head.args.length} and ${hi0.args.length}`;
  if (c.head.perspExplicit || hi0.perspExplicit) return `${what}: a dominance rule names the relation, not a book; it orders the facts of every book`;
  if (c.head.temporal !== 'now' || hi0.temporal !== 'now') return `${what}: a dominance rule compares facts that hold now; it takes no tense`;
  const lo = canonLitSets(c.head), hi = canonLitSets(hi0);
  const n = lo.args.length;
  if (![...lo.args, ...hi.args].every((t) => t.k === 'v')) return `${what}: a dominance rule's facts are written with variables, the key they share and then each one's values`;
  let k = 0;
  while (k < n && teq(lo.args[k], hi.args[k])) k++;
  if (k === n) return `${what}: the two facts are one: a dominance rule compares two values at one key, so the facts differ after the key`;
  const seen = lo.args.slice(0, k).map((t) => (t as { name: string }).name);
  for (const t of [...lo.args.slice(k), ...hi.args.slice(k)]) {
    const x = (t as { name: string }).name;
    if (seen.includes(x)) return `${what}: '${x}' is written twice; the key is the prefix both facts share, and each value after it is a variable of its own (compare them in the body: \`V1 = V2\`)`;
    seen.push(x);
  }
  const body = canonClauseSetsBody(c.body);
  if (body.some((b) => b.t === 'agg')) return `${what}: a dominance body folds no aggregate; conclude the count or the min in a rule of its own and read it`;
  if (body.flatMap(litsOf).some((l) => l.temporal !== 'now')) return `${what}: a dominance body reads facts that hold now; '@next' and '@init' are not read there`;
  if (body.flatMap(litsOf).some((l) => l.rel === rel)) return `${what}: its body reads ${rel} itself; which of two facts dominates is decided before either is kept, from the two facts and what lies below`;
  const sp = checkSetPatternsDoor({ head: lo, body });
  if (sp !== null) return sp;
  const { order, stuck } = planOrder([], body, seen, []);
  const bound = [...seen];
  let free: string[] | null = null;
  for (const i of order) {
    if (free !== null) break;
    const b = body[i];
    const unbound = (ts: string[]) => ts.filter((x) => !bound.includes(x));
    let binds: string[] | null = null, errv: string[] = [];
    if (b.t === 'pos') binds = b.lit.args.flatMap(tVars);
    else if (b.t === 'neg' || b.t === 'agg') binds = [];
    else {
      const lv = tVars(b.l), rv = tVars(b.r);
      const lu = unbound(lv), ru = unbound(rv);
      if ((b.op === 'is' || b.op === 'in') && ru.length === 0) binds = lv;
      else if (b.op === '=' && ru.length === 0) binds = lv;
      else if (b.op === '=' && lu.length === 0) binds = rv;
      else if (b.op === 'is' || b.op === 'in' || b.op === '=') errv = ru;
      else if (lu.length === 0 && ru.length === 0) binds = [];
      else errv = [...lu, ...ru];
    }
    if (binds !== null) { for (const x of binds) if (!bound.includes(x)) bound.push(x); }
    else free = errv;
  }
  if (free === null && stuck !== null) {
    const vs = new Set<string>();
    for (const l of litsOf(body[stuck])) for (const a of l.args) varsOf(a, vs);
    free = [...vs].filter((x) => !x.startsWith('_$'));
  }
  if (free !== null) {
    const names: string[] = [];
    for (const x of free) if (!bound.includes(x) && !names.includes(x)) names.push(x);
    return `${what}: its body uses ${names.length === 0 ? 'a variable' : names.join(', ')} bound neither by the two facts nor by a literal of the body before it`;
  }
  return { lo, hi, body, k };
}
function canonClauseSetsBody(body: BodyElem[]): BodyElem[] {
  return body.map((b): BodyElem => {
    if (b.t === 'pos' || b.t === 'neg') return { ...b, lit: canonLitSets(b.lit) };
    if (b.t === 'bi') return { ...b, l: canonSetsT(b.l), r: canonSetsT(b.r) };
    return { ...b, vals: b.vals.map(canonSetsT), keys: b.keys.map(canonSetsT), body: canonClauseSetsBody(b.body) };
  });
}

/** Whether `to` is reached from `from` over `deps`. */
function reachesIn(deps: Map<string, Set<string>>, from: string, to: string): boolean {
  const seen = new Set<string>(), stack = [from];
  while (stack.length > 0) {
    const x = stack.pop()!;
    if (x === to) return true;
    if (!seen.has(x)) { seen.add(x); stack.push(...(deps.get(x) ?? [])); }
  }
  return false;
}
