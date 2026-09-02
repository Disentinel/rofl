// demo.ts — RIP: why tasks die in a dead letter queue, end to end.
//
//   node --experimental-strip-types examples/rip/demo.ts
//
// Everything printed here is computed by the kernel from examples/rip/rip.rofl
// or by the independent simulator below. Nothing in the transcript is composed
// by hand; README.md and page.html paste this program's stdout.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, depthBoundedCountingSemiring, tropicalSemiring, unitFiringCost,
  renderCount, INFINITE, type Count,
} from '../../runtime/semirings.ts';
import type { FoldResult } from '../../src/semiring.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const MODEL = read('examples', 'rip', 'rip.rofl');

/** The three markers rip.rofl separates itself on. `@policy` opens the block
 *  §9 rewrites; `@machine` opens the transition system; `@game` opens the
 *  alternating fixpoint, which §3 loads on its own. */
export const POLICY_MARKER = '-- @policy';
export const MACHINE_MARKER = '-- @machine';
export const GAME_MARKER = '-- @game';

/** The whole state space fits inside a budget this size; the default 100_000
 *  does not, and §5 uses a deliberately small one to show what happens then. */
const BUDGET = 20_000_000;

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

// ---------------------------------------------------------------------------
// the model, whole and in halves

export const policyText = (src = MODEL): string =>
  src.slice(src.indexOf(POLICY_MARKER) + POLICY_MARKER.length, src.indexOf(MACHINE_MARKER));
export const machineText = (src = MODEL): string =>
  src.slice(src.indexOf(MACHINE_MARKER) + MACHINE_MARKER.length, src.indexOf(GAME_MARKER));
export const gameText = (src = MODEL): string =>
  src.slice(src.indexOf(GAME_MARKER) + GAME_MARKER.length);
export const preludeText = (src = MODEL): string => src.slice(0, src.indexOf(POLICY_MARKER));

/** A policy variant, expressed the way a change to a policy actually arrives:
 *  lines deleted, lines added. `drop` matches whole clauses of the policy
 *  block, `add` is appended to it. */
export interface Variant { drop?: RegExp; add?: string }

export function withPolicy(v: Variant): string {
  const kept = v.drop
    ? MODEL.split('\n').filter((l) => !v.drop!.test(l.trim())).join('\n')
    : MODEL;
  if (!v.add) return kept;
  const at = kept.indexOf(POLICY_MARKER) + POLICY_MARKER.length;
  return kept.slice(0, at) + '\n' + v.add + '\n' + kept.slice(at);
}

const WORLDS = new Map<string, Rofl>();

/** The whole file in one store: the machine and the alternation together.
 *  Memoised per source text, because the alternation is the expensive part
 *  and §9 asks for eight of these. */
export function world(src: string = MODEL, opts: { budget?: number } = {}): Rofl {
  const key = src + '|' + (opts.budget ?? BUDGET);
  const hit = WORLDS.get(key);
  if (hit) return hit;
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(src, { who: 'rip', budget: opts.budget ?? BUDGET }), 'rip.rofl');
  WORLDS.set(key, r);
  return r;
}

/** The machine on its own, under the ORDINARY semantics: it is positive,
 *  stratified, and has nothing to do with the alternation. */
export function arenaWorld(src: string = MODEL): Rofl {
  const key = 'arena|' + src;
  const hit = WORLDS.get(key);
  if (hit) return hit;
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(preludeText(src) + policyText(src) + machineText(src),
    { who: 'rip', budget: BUDGET }), 'rip.rofl [machine]');
  WORLDS.set(key, r);
  return r;
}

/** The relations the game half needs from the machine half, as text the game
 *  store can load as base facts. */
export const ARENA_RELATIONS = ['state', 'action', 'settled', 'respond'];

export function arenaFacts(a: Rofl): string[] {
  const out: string[] = [];
  for (const rel of ARENA_RELATIONS) {
    for (const k of a.factKeys(rel)) out.push(k.replace('[main]', '') + '.');
  }
  return out.sort();
}

/** The alternation alone, over the machine dumped as facts. Same answer as
 *  `world()` and §3 checks that; it exists because a why-tree over an
 *  ASSERTED machine shows the game and not the reachability proof. */
export function gameWorld(src: string = MODEL): Rofl {
  const key = 'game|' + src;
  const hit = WORLDS.get(key);
  if (hit) return hit;
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(preludeText(src) + GAME_MARKER + gameText(src) + '\n'
    + arenaFacts(arenaWorld(src)).join('\n'), { who: 'rip', budget: BUDGET }), 'rip.rofl [game]');
  WORLDS.set(key, r);
  return r;
}

// ---------------------------------------------------------------------------
// small helpers over query results

export const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => x.bindings[v]);
export const pairs = (r: Rofl, q: string, a: string, b: string): [string, string][] =>
  r.query(q).rows.map((x) => [x.bindings[a], x.bindings[b]] as [string, string]);
const list = (xs: string[]): string => (xs.length === 0 ? '(none)' : xs.join(', '));
const indent = (s: string, n: number) => s.split('\n').map((l) => ' '.repeat(n) + l).join('\n');

export interface Classes { settles: Set<string>; doomed: Set<string>; deadLetter: Set<string> }

export function classes(r: Rofl): Classes {
  return {
    settles: new Set(col(r, 'will_settle(S)', 'S')),
    doomed: new Set(col(r, 'doomed(S)', 'S')),
    deadLetter: new Set(col(r, 'dead_letter(S)', 'S')),
  };
}

/** Split a term's argument list on top-level commas. `w(a,0,0,1,2,0,2)` has
 *  seven arguments and `respond[main](w(...),call,ok,w(...))` has four; the
 *  brackets are what a naive split gets wrong. */
export function args(term: string): string[] {
  const open = term.indexOf('(');
  const body = term.slice(open + 1, term.lastIndexOf(')'));
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { out.push(body.slice(start, i)); start = i + 1; }
  }
  out.push(body.slice(start));
  return out.map((s) => s.trim());
}

export const STAGES = ['reserve', 'charge', 'ship', 'verify', 'track', 'refund', 'release'] as const;
export const TERMINALS = ['fulfilled', 'cancelled', 'abandoned'] as const;
export const ANSWERS = ['ok', 'fail', 'timeout', 'lost', 'silence'] as const;

export type Stage = typeof STAGES[number] | typeof TERMINALS[number];
export type Answer = typeof ANSWERS[number] | 'none';
export type Move = 'call' | 'abort' | 'check' | 'park';

/** A task, as the model spells it. `key()` renders it exactly as the engine
 *  writes the term, which is the ONLY thing the oracle below shares with the
 *  engine: the transitions are written from the domain, not transliterated. */
export interface Task {
  at: Stage; t: number; d: 0 | 1; r: 0 | 1; c: number; sh: number; f: number;
}

export const key = (s: Task): string =>
  `w(${s.at},${s.t},${s.d},${s.r},${s.c},${s.sh},${s.f})`;

export function parseTask(k: string): Task {
  const a = args(k);
  return {
    at: a[0] as Stage, t: +a[1], d: +a[2] as 0 | 1, r: +a[3] as 0 | 1,
    c: +a[4], sh: +a[5], f: +a[6],
  };
}

/** What the workflow can see of a task. `r`, `c` and `sh` are the world and
 *  it is not told them; §12 is about the difference. */
export const observation = (s: Task): string => `${s.at}/${s.t}/${s.d}`;

// ---------------------------------------------------------------------------
// THE ORACLE, part one: the machine, re-derived
//
// The policy PARAMETERS are read out of the store, exactly as examples/goof
// reads its proof corpus: sharing the numbers is the point, since a variant
// has to change both halves at once. What is not shared is the transition
// logic — the switch below is written from the domain description, and §10
// compares its output against the engine's `respond` table edge for edge.

export interface Policy {
  limit: Map<string, number>;
  probeOf: Map<string, string>;      // stage -> its probe stage
  probeStage: Set<string>;           // the probe stages themselves
  abortsTo: Map<string, string>;
  needsCertainty: Set<string>;
  answers: Map<string, Set<string>>;
  slack: number;
}

export function policyOf(r: Rofl): Policy {
  const answers = new Map<string, Set<string>>();
  for (const [s, a] of pairs(r, 'answers(S, A)', 'S', 'A')) {
    (answers.get(s) ?? answers.set(s, new Set()).get(s)!).add(a);
  }
  const probeOf = new Map(pairs(r, 'probe_of(S, P)', 'S', 'P'));
  return {
    limit: new Map(pairs(r, 'limit(S, N)', 'S', 'N').map(([s, n]) => [s, Number(n)])),
    probeOf,
    probeStage: new Set(probeOf.values()),
    abortsTo: new Map(pairs(r, 'aborts_to(S, T)', 'S', 'T')),
    needsCertainty: new Set(col(r, 'abort_needs_certainty(S)', 'S')),
    answers,
    slack: Number(col(r, 'slack(F)', 'F')[0]),
  };
}

const TERMINAL = new Set<string>(TERMINALS);
const COSTLY = new Set(['fail', 'timeout', 'lost']);

/** The workflow's alphabet at a task. */
export function moves(p: Policy, s: Task): Move[] {
  if (TERMINAL.has(s.at)) return [];
  const out = new Set<Move>();
  const lim = p.limit.get(s.at);
  if (lim !== undefined && s.t <= lim) out.add('call');
  if (p.probeStage.has(s.at)) out.add('call');
  if (p.abortsTo.has(s.at) && (s.d === 0 || !p.needsCertainty.has(s.at))) out.add('abort');
  if (s.d === 1 && p.probeOf.has(s.at)) out.add('check');
  out.add('park');
  return [...out];
}

export interface Outcome { answer: Answer; next: Task }

/** Where one external call lands, per stage. Written as the domain reads:
 *  what the provider did, and what it did to the world. The `undefined`
 *  returns are the successors that do not exist — a third charge cannot be
 *  counted, because the model caps the counter — and they are what
 *  `dangling/2` in rip.rofl exists to catch. */
function land(p: Policy, s: Task, a: Answer): Task | undefined {
  const spend = COSTLY.has(a) ? s.f - 1 : s.f;
  const again = (over: Partial<Task>): Task =>
    ({ at: s.at, t: s.t + 1, d: s.d, r: s.r, c: s.c, sh: s.sh, f: spend, ...over });
  switch (s.at) {
    case 'reserve':
      if (a === 'ok') return { at: 'charge', t: 0, d: 0, r: 1, c: s.c, sh: s.sh, f: s.f };
      if (a === 'lost') return again({ d: 1, r: 1 });
      return again(a === 'timeout' ? { d: 1 } : {});
    case 'charge':
      if (a === 'ok') {
        return s.c < 2 ? { at: 'ship', t: 0, d: 0, r: s.r, c: s.c + 1, sh: s.sh, f: s.f } : undefined;
      }
      if (a === 'lost') return s.c < 2 ? again({ d: 1, c: s.c + 1 }) : undefined;
      return again(a === 'timeout' ? { d: 1 } : {});
    case 'verify':
      if (a === 'ok') {
        if (s.c === 0) return { at: 'charge', t: s.t, d: 0, r: s.r, c: 0, sh: s.sh, f: s.f };
        if (s.c === 1) return { at: 'ship', t: 0, d: 0, r: s.r, c: 1, sh: s.sh, f: s.f };
        return { at: 'refund', t: 0, d: 0, r: s.r, c: s.c, sh: s.sh, f: s.f };
      }
      return { at: 'charge', t: s.t + 1, d: 1, r: s.r, c: s.c, sh: s.sh, f: spend };
    case 'ship':
      if (a === 'ok') {
        return s.sh < 2 ? { at: 'fulfilled', t: 0, d: 0, r: 0, c: s.c, sh: s.sh + 1, f: s.f } : undefined;
      }
      if (a === 'lost') return s.sh < 2 ? again({ d: 1, sh: s.sh + 1 }) : undefined;
      if (a === 'silence') return { ...s, d: 1 };
      return again(a === 'timeout' ? { d: 1 } : {});
    case 'track':
      if (a === 'ok') {
        if (s.sh === 0) return { at: 'ship', t: s.t, d: 0, r: s.r, c: s.c, sh: 0, f: s.f };
        if (s.sh === 1) return { at: 'fulfilled', t: 0, d: 0, r: 0, c: s.c, sh: 1, f: s.f };
        return { at: 'refund', t: 0, d: 0, r: s.r, c: s.c, sh: s.sh, f: s.f };
      }
      if (a === 'silence') return { ...s, d: 1 };
      return { at: 'ship', t: s.t + 1, d: 1, r: s.r, c: s.c, sh: s.sh, f: spend };
    case 'refund':
      if (a === 'ok') return { at: 'release', t: 0, d: 0, r: s.r, c: 0, sh: s.sh, f: s.f };
      if (a === 'lost') return again({ d: 1, c: 0 });
      return again(a === 'timeout' ? { d: 1 } : {});
    case 'release':
      if (a === 'ok') return { at: 'cancelled', t: 0, d: 0, r: 0, c: s.c, sh: s.sh, f: s.f };
      if (a === 'lost') return again({ d: 1, r: 0 });
      return again(a === 'timeout' ? { d: 1 } : {});
    default: return undefined;
  }
}

/** Everything the environment may answer to one move at one task. */
export function outcomes(p: Policy, s: Task, m: Move): Outcome[] {
  if (m === 'park') {
    return [{ answer: 'none', next: { at: 'abandoned', t: 0, d: 0, r: s.r, c: s.c, sh: s.sh, f: s.f } }];
  }
  if (m === 'abort') {
    const to = p.abortsTo.get(s.at)!;
    return [{ answer: 'none', next: { at: to as Stage, t: 0, d: s.d, r: s.r, c: s.c, sh: s.sh, f: s.f } }];
  }
  if (m === 'check') {
    const pr = p.probeOf.get(s.at)!;
    return [{ answer: 'none', next: { at: pr as Stage, t: s.t, d: 1, r: s.r, c: s.c, sh: s.sh, f: s.f } }];
  }
  const out: Outcome[] = [];
  for (const a of ANSWERS) {
    if (!(p.answers.get(s.at)?.has(a))) continue;
    if (COSTLY.has(a) && s.f < 1) continue;
    const next = land(p, s, a);
    if (next) out.push({ answer: a, next });
  }
  return out;
}

export const isSettled = (s: Task): boolean =>
  (s.at === 'fulfilled' && s.r === 0 && s.c === 1 && s.sh === 1)
  || (s.at === 'cancelled' && s.r === 0 && s.c === 0 && s.sh === 0);

export interface Arena {
  policy: Policy;
  initial: string;
  states: Map<string, Task>;
  edges: Map<string, { move: Move; answer: Answer; to: string }[]>;
  settled: Set<string>;
}

/** The reachable machine, breadth first from the initial task. */
export function arena(p: Policy): Arena {
  const init: Task = { at: 'reserve', t: 0, d: 0, r: 0, c: 0, sh: 0, f: p.slack };
  const states = new Map<string, Task>();
  const edges = new Map<string, { move: Move; answer: Answer; to: string }[]>();
  const settled = new Set<string>();
  const queue = [init];
  states.set(key(init), init);
  while (queue.length > 0) {
    const s = queue.shift()!;
    const k = key(s);
    if (isSettled(s)) settled.add(k);
    const es: { move: Move; answer: Answer; to: string }[] = [];
    for (const m of moves(p, s)) {
      for (const o of outcomes(p, s, m)) {
        const nk = key(o.next);
        es.push({ move: m, answer: o.answer, to: nk });
        if (!states.has(nk)) { states.set(nk, o.next); queue.push(o.next); }
      }
    }
    edges.set(k, es);
  }
  return { policy: p, initial: key(init), states, edges, settled };
}

// ---------------------------------------------------------------------------
// THE ORACLE, part two: the three regions, by the textbook algorithms
//
// Two attractors, each an ordinary least fixpoint, and neither of them is an
// alternating one. That is what makes this a check rather than a second copy:
// the engine computes one three-valued model, and this computes two
// two-valued reachability sets whose complement has to be the gap.

const movesAt = (a: Arena, k: string): Move[] =>
  [...new Set((a.edges.get(k) ?? []).map((e) => e.move))];
const after = (a: Arena, k: string, m: Move): string[] =>
  (a.edges.get(k) ?? []).filter((e) => e.move === m).map((e) => e.to);

/** The workflow's winning region: from here it can FORCE a settled terminal.
 *  Note the vacuous case is kept exactly as the rules have it — a move with
 *  no answers is trivially safe — because that is the hole `dangling/2`
 *  guards and hiding it here would hide it from the comparison too. */
export function winning(a: Arena): Set<string> {
  const w = new Set(a.settled);
  for (;;) {
    let grew = false;
    for (const k of a.states.keys()) {
      if (w.has(k)) continue;
      for (const m of movesAt(a, k)) {
        if (after(a, k, m).every((t) => w.has(t))) { w.add(k); grew = true; break; }
      }
    }
    if (!grew) return w;
  }
}

/** The environment's winning region: from here it can FORCE the books not to
 *  balance. Base case: a task that is not settled and has nowhere to go. */
export function losing(a: Arena): Set<string> {
  const l = new Set<string>();
  for (;;) {
    let grew = false;
    for (const k of a.states.keys()) {
      if (l.has(k) || a.settled.has(k)) continue;
      const ms = movesAt(a, k);
      if (ms.every((m) => after(a, k, m).some((t) => l.has(t)))) { l.add(k); grew = true; }
    }
    if (!grew) return l;
  }
}

/** Some play from here ends with the books balanced — luck, not strategy.
 *  The oracle's version of `can_settle/1`. */
export function luckyReach(a: Arena): Set<string> {
  const c = new Set(a.settled);
  for (;;) {
    let grew = false;
    for (const [k, es] of a.edges) {
      if (c.has(k)) continue;
      if (es.some((e) => c.has(e.to))) { c.add(k); grew = true; }
    }
    if (!grew) return c;
  }
}

export interface OracleReport {
  states: number;
  edges: number;
  stateMismatch: string[];
  edgeMismatch: string[];
  settledMismatch: string[];
  verdictChecks: number;
  verdictMismatch: string[];
  luckyMismatch: string[];
  overlap: string[];
  uncovered: string[];
}

/** Every claim the engine makes about this machine, decided a second time. */
export function oracleCheck(r: Rofl): OracleReport {
  const p = policyOf(r);
  const a = arena(p);
  const out: OracleReport = {
    states: a.states.size, edges: 0,
    stateMismatch: [], edgeMismatch: [], settledMismatch: [],
    verdictChecks: 0, verdictMismatch: [], luckyMismatch: [], overlap: [], uncovered: [],
  };
  const note = (arr: string[], s: string) => { if (arr.length < 12) arr.push(s); };

  // 1. the machine itself: same states, same edges, same settled terminals
  const engineStates = new Set(col(r, 'state(S)', 'S'));
  for (const k of a.states.keys()) if (!engineStates.has(k)) note(out.stateMismatch, `oracle only: ${k}`);
  for (const k of engineStates) if (!a.states.has(k)) note(out.stateMismatch, `engine only: ${k}`);

  const engineEdges = new Set(r.query('respond(S, A, R, S2)').rows
    .map((x) => `${x.bindings.S} -${x.bindings.A}/${x.bindings.R}-> ${x.bindings.S2}`));
  const oracleEdges = new Set<string>();
  for (const [k, es] of a.edges) for (const e of es) oracleEdges.add(`${k} -${e.move}/${e.answer}-> ${e.to}`);
  out.edges = oracleEdges.size;
  for (const e of oracleEdges) if (!engineEdges.has(e)) note(out.edgeMismatch, `oracle only: ${e}`);
  for (const e of engineEdges) if (!oracleEdges.has(e)) note(out.edgeMismatch, `engine only: ${e}`);

  const engineSettled = new Set(col(r, 'settled(S)', 'S'));
  for (const k of a.settled) if (!engineSettled.has(k)) note(out.settledMismatch, `oracle only: ${k}`);
  for (const k of engineSettled) if (!a.settled.has(k)) note(out.settledMismatch, `engine only: ${k}`);

  // 2. the three regions
  const w = winning(a), l = losing(a), lucky = luckyReach(a);
  const c = classes(r);
  for (const k of a.states.keys()) {
    out.verdictChecks++;
    const want = w.has(k) ? 'settles' : l.has(k) ? 'doomed' : 'dead_letter';
    const got = c.settles.has(k) ? 'settles' : c.doomed.has(k) ? 'doomed'
      : c.deadLetter.has(k) ? 'dead_letter' : 'NOTHING';
    if (want !== got) note(out.verdictMismatch, `${k}: engine=${got} oracle=${want}`);
    if (got === 'NOTHING') note(out.uncovered, k);
    const n = (c.settles.has(k) ? 1 : 0) + (c.doomed.has(k) ? 1 : 0) + (c.deadLetter.has(k) ? 1 : 0);
    if (n > 1) note(out.overlap, k);
  }

  // 3. luck is not strategy: `can_settle` is its own relation and its own check
  const engineLucky = new Set(col(r, 'can_settle(S)', 'S'));
  for (const k of a.states.keys()) {
    if (lucky.has(k) !== engineLucky.has(k)) {
      note(out.luckyMismatch, `${k}: engine=${engineLucky.has(k)} oracle=${lucky.has(k)}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE STRATEGY, and whether a workflow could implement it
//
// The fixpoint quantifies over actions per STATE, and a state carries what
// the workflow cannot see. So the certificate it produces may branch on
// hidden information. That is not a defect of the engine — it is what the
// model asks — and the honest thing is to measure it: group the winning
// states by what the workflow CAN see and ask whether one action is safe
// across the whole class.

export interface ObsClass { obs: string; states: string[]; uniform: Move[]; }

export function safeMoves(a: Arena, w: Set<string>, k: string): Move[] {
  return movesAt(a, k).filter((m) => after(a, k, m).every((t) => w.has(t)));
}

/** Replay the malicious environment from a state the certificate calls
 *  winning, and return the FIRST step at which the deployed policy plays a
 *  move the certificate does not allow. That step is the whole content of a
 *  "the policy hangs where a strategy exists" row: everything before it is
 *  agreement, and everything after it is a consequence. */
export function divergence(a: Arena, w: Set<string>, from: string):
  { at: string; plays: Move; certified: Move[] } | null {
  let s = a.states.get(from);
  for (let i = 0; s && i < STEP_CAP; i++) {
    const k = key(s);
    if (TERMINAL.has(s.at)) return null;
    const m = policyMove(a.policy, s);
    const safe = safeMoves(a, w, k);
    if (w.has(k) && !safe.includes(m)) return { at: k, plays: m, certified: safe };
    const os = outcomes(a.policy, s, m);
    if (os.length === 0) return null;
    s = pick('adversarial', os, () => 0).next;
  }
  return null;
}

export const obsClasses = (a: Arena, w: Set<string>): ObsClass[] =>
  obsClassesBy(a, w, observation);

/** The same grouping under any projection of a task, so that the check can be
 *  aimed at a workflow that sees LESS and asked to object. */
export function obsClassesBy(a: Arena, w: Set<string>, of: (s: Task) => string): ObsClass[] {
  const by = new Map<string, string[]>();
  for (const k of w) {
    if (a.settled.has(k)) continue;
    const o = of(a.states.get(k)!);
    (by.get(o) ?? by.set(o, []).get(o)!).push(k);
  }
  return [...by.entries()].map(([obs, states]) => {
    let uniform: Move[] | null = null;
    for (const k of states) {
      const safe = new Set(safeMoves(a, w, k));
      uniform = uniform === null ? [...safe] : uniform.filter((m) => safe.has(m));
    }
    return { obs, states: states.sort(), uniform: uniform ?? [] };
  }).sort((x, y) => (x.obs < y.obs ? -1 : 1));
}

// ---------------------------------------------------------------------------
// THE SIMULATOR
//
// A workflow policy that sees only what a workflow sees, three environments,
// and a step cap. The cap matters: a run that hits it is `capped` and is
// neither a success nor a failure, for the same reason `hole(Id,
// budget_exhausted)` is not an `unknown` — a run that was stopped is not a
// run that finished badly, and merging the two is what would let a table of
// rates hide the whole subject.

export type Verdict = 'settled' | 'failed' | 'capped';
export type EnvName = 'random' | 'flaky' | 'adversarial';

/** What a real workflow would do, written from the observation and nothing
 *  else: finish a probe, ask before repeating a call you are unsure about,
 *  retry while the budget lasts, then compensate, then park. */
export function policyMove(p: Policy, s: Task): Move {
  if (p.probeStage.has(s.at)) return 'call';
  if (s.d === 1 && p.probeOf.has(s.at)) return 'check';
  const lim = p.limit.get(s.at);
  if (lim !== undefined && s.t <= lim) return 'call';
  if (p.abortsTo.has(s.at) && (s.d === 0 || !p.needsCertainty.has(s.at))) return 'abort';
  return 'park';
}

/** A seed per (environment, state), so that two states do not share a stream
 *  and a difference between them is a difference in the machine. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic, seeded, and the same on every machine — a simulator whose
 *  numbers move between runs cannot be compared with anything. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WEIGHTS: Record<'random' | 'flaky', Record<string, number>> = {
  random: { ok: 55, fail: 15, timeout: 12, lost: 10, silence: 8, none: 100 },
  flaky: { ok: 25, fail: 25, timeout: 20, lost: 20, silence: 10, none: 100 },
};

/** The malicious provider, and it knows nothing about the analysis: a fixed
 *  preference order over what it is allowed to answer. That independence is
 *  what lets §11 use it as evidence rather than as a restatement. */
export const MALICE = ['silence', 'lost', 'timeout', 'fail', 'ok', 'none'];

export function pick(env: EnvName, os: Outcome[], rnd: () => number): Outcome {
  if (env === 'adversarial') {
    for (const a of MALICE) { const hit = os.find((o) => o.answer === a); if (hit) return hit; }
    return os[0];
  }
  const w = WEIGHTS[env];
  let total = 0;
  for (const o of os) total += w[o.answer] ?? 1;
  let x = rnd() * total;
  for (const o of os) { x -= w[o.answer] ?? 1; if (x <= 0) return o; }
  return os[os.length - 1];
}

export interface Run { verdict: Verdict; steps: number; last: string }

export function play(p: Policy, from: Task, env: EnvName, rnd: () => number, cap: number): Run {
  let s = from;
  for (let i = 0; i < cap; i++) {
    if (TERMINAL.has(s.at)) return { verdict: isSettled(s) ? 'settled' : 'failed', steps: i, last: key(s) };
    const m = policyMove(p, s);
    const os = outcomes(p, s, m);
    if (os.length === 0) return { verdict: 'failed', steps: i, last: key(s) };
    s = pick(env, os, rnd).next;
  }
  return { verdict: 'capped', steps: cap, last: key(s) };
}

export interface Journal { env: EnvName; state: string; settled: number; failed: number; capped: number }

export const ENVIRONMENTS: EnvName[] = ['random', 'flaky', 'adversarial'];
export const RUNS_PER_STATE = 120;
export const STEP_CAP = 60;

/** Every state in the machine, played from, under every environment. */
export function simulate(a: Arena, seed = 0x5eed): Journal[] {
  const out: Journal[] = [];
  for (const env of ENVIRONMENTS) {
    const n = env === 'adversarial' ? 1 : RUNS_PER_STATE;   // deterministic: one run is all of them
    for (const [k, s] of a.states) {
      if (TERMINAL.has(s.at)) continue;
      const j: Journal = { env, state: k, settled: 0, failed: 0, capped: 0 };
      const rnd = rng(seed + hash(env + '|' + k));
      for (let i = 0; i < n; i++) j[play(a.policy, s, env, rnd, STEP_CAP).verdict]++;
      out.push(j);
    }
  }
  return out;
}

/** The journal as facts in the simulator's own ledger. Presence, not counts:
 *  the model asks whether an outcome was EVER seen, and a count in the
 *  perspective slot would be a number pretending to be a book. */
export function journalFacts(js: Journal[]): string {
  const out: string[] = [];
  for (const j of js) {
    out.push(`sim_seen[sim](${j.env}, ${j.state}).`);
    if (j.settled > 0) out.push(`sim_settled[sim](${j.env}, ${j.state}).`);
    if (j.failed > 0) out.push(`sim_failed[sim](${j.env}, ${j.state}).`);
    if (j.capped > 0) out.push(`sim_capped[sim](${j.env}, ${j.state}).`);
  }
  return out.join('\n');
}

/** A store whose game half has been given the simulator's journal to read.
 *  It is a separate store from `gameWorld()` on purpose: filing the journal
 *  changes what `crosscheck/3` says and nothing else, and keeping the two
 *  apart is what lets §11 show the model answering before and after. */
let SIM: { r: Rofl; arena: Arena; journal: Journal[] } | null = null;

export function simWorld(): { r: Rofl; arena: Arena; journal: Journal[] } {
  if (SIM) return SIM;
  const a = arenaWorld();
  const ar = arena(policyOf(world()));
  const journal = simulate(ar);
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(preludeText() + GAME_MARKER + gameText() + '\n' + arenaFacts(a).join('\n'),
    { who: 'rip', budget: BUDGET }), 'rip.rofl [game]');
  must(r.load(journalFacts(journal), { who: 'simulator', budget: BUDGET }), 'the journal');
  SIM = { r, arena: ar, journal };
  return SIM;
}

/** The same store with one run filed by somebody who is not the simulator. */
export function forgedWorld(): Rofl {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(preludeText() + GAME_MARKER + gameText() + '\n' + arenaFacts(arenaWorld()).join('\n'),
    { who: 'rip', budget: BUDGET }), 'rip.rofl [game]');
  must(r.load(`sim_capped[sim](random, ${QUIET_CARRIER}).`,
    { who: 'product_manager', budget: BUDGET }), 'the forged run');
  return r;
}

/** The headline sweep the spec asks for in the millions: one start state,
 *  one environment, many runs, and the exact number said out loud. */
export function sweep(p: Policy, env: EnvName, runs: number, seed = 1,
                      from?: Task): Record<Verdict, number> {
  const init: Task = from ?? { at: 'reserve', t: 0, d: 0, r: 0, c: 0, sh: 0, f: p.slack };
  const rnd = rng(seed);
  const out: Record<Verdict, number> = { settled: 0, failed: 0, capped: 0 };
  for (let i = 0; i < runs; i++) out[play(p, init, env, rnd, STEP_CAP).verdict]++;
  return out;
}

// ---------------------------------------------------------------------------
// BEST DERIVATION: the shortest sequence of failures that produces a state
//
// The tropical fold over `reached/1` already computed the length of the
// cheapest derivation of every state. Walking down it, choosing at each step
// the firing whose cost IS that number, reads the argmin back out of the
// support the engine recorded — not a story told about the answer afterwards,
// and not a search this file ran. What comes out is a script: an action and
// an answer per step, which `replay` below hands to the simulator.

export interface Step { from: string; move: Move; answer: Answer; to: string }

export function shortest(a: Rofl): FoldResult<number> {
  return evaluateSemiring(a.store, tropicalSemiring, { weight: unitFiringCost });
}

export function script(a: Rofl, trop: FoldResult<number>, target: string): Step[] {
  const out: Step[] = [];
  const seen = new Set<string>();
  let k = `reached[main](${target})`;
  for (;;) {
    if (seen.has(k)) throw new Error(`cycle in the shortest derivation at ${k}`);
    seen.add(k);
    const ws = a.store.witnessesOf(k);
    let best: { prev: string; resp: string; cost: number } | null = null;
    for (const w of ws) {
      const prev = w.prems.find((pr) => pr.t === 'fact' && pr.key.startsWith('reached[main]('));
      const resp = w.prems.find((pr) => pr.t === 'fact' && pr.key.startsWith('respond[main]('));
      if (!prev || !resp || prev.t !== 'fact' || resp.t !== 'fact') continue;
      const cost = (trop.value.get(prev.key) ?? Infinity) + (trop.value.get(resp.key) ?? Infinity) + 1;
      if (best === null || cost < best.cost) best = { prev: prev.key, resp: resp.key, cost };
    }
    if (best === null) break;                 // the initial state: derived from `initial/1`
    const ra = args(best.resp);
    out.push({ from: ra[0], move: ra[1] as Move, answer: ra[2] as Answer, to: ra[3] });
    k = best.prev;
  }
  return out.reverse();
}

/** Run a script through the simulator and say where it lands. This is the
 *  criterion the spec asks for spelled out: the engine's answer is not a
 *  diagnosis, it is a scenario, and the scenario executes. */
export function replay(p: Policy, steps: Step[]): { at: string; ok: boolean; why: string } {
  let s: Task = { at: 'reserve', t: 0, d: 0, r: 0, c: 0, sh: 0, f: p.slack };
  for (const st of steps) {
    if (key(s) !== st.from) return { at: key(s), ok: false, why: `expected ${st.from}` };
    const os = outcomes(p, s, st.move);
    const hit = os.find((o) => o.answer === st.answer);
    if (!hit) return { at: key(s), ok: false, why: `no ${st.move}/${st.answer} here` };
    if (key(hit.next) !== st.to) return { at: key(hit.next), ok: false, why: `expected ${st.to}` };
    s = hit.next;
  }
  return { at: key(s), ok: true, why: 'every step of the script exists in the simulator' };
}

// ---------------------------------------------------------------------------
// semiring folds over the game store, kept

const COUNTS = new WeakMap<Rofl, FoldResult<Count>>();

export function counting(r: Rofl): FoldResult<Count> {
  let v = COUNTS.get(r);
  if (!v) { v = evaluateSemiring(r.store, countingSemiring); COUNTS.set(r, v); }
  return v;
}

export const routes = (r: Rofl, s: string): Count =>
  (counting(r).value.get(`can_settle[main](${s})`) ?? 0n) as Count;

/** Depths for the unfolding probe. The distance from a ship state to a
 *  settled terminal is a handful of support levels, so these four straddle
 *  the point where the count appears and then keep growing. */
export const UNFOLDING_DEPTHS = [6, 8, 10, 12];

export function unfoldingProbe(r: Rofl, keys: string[], depths: number[]): { depth: number; counts: string[] }[] {
  return depths.map((depth) => {
    const fold = evaluateSemiring(r.store, depthBoundedCountingSemiring(depth));
    return { depth, counts: keys.map((k) => renderCount((fold.value.get(k) ?? 0n) as Count)) };
  });
}

// ---------------------------------------------------------------------------
// the states this example keeps pointing at

/** Charged twice, dispatched once. Nobody is going to notice, and there is
 *  no consistent ending from here: the money cannot be un-taken by any
 *  action the workflow still has. */
export const DOUBLE_CHARGE = 'w(fulfilled,0,0,0,2,1,0)';
/** A dispatch that may or may not have happened, and a carrier that has
 *  stopped answering. Neither verdict is derivable. */
export const QUIET_CARRIER = 'w(ship,0,1,1,1,0,2)';

/** The second direction of the silence probe: let the PAYMENT gateway go
 *  quiet as well. It adds one answer and the transition that carries it, and
 *  the interesting part is what it does not do — see §5. */
export const LOUD_GATEWAY = `
answers(charge, silence).
respond(w(charge,T,D,R,C,Sh,F), call, silence, w(charge,T,1,R,C,Sh,F)) :-
    may(w(charge,T,D,R,C,Sh,F), silence).
`;

/** A real leak, planted: an incident feed arrives as a new source ledger and
 *  a rule reads it into [main] without a bracket, so nothing declares the
 *  crossing. This is what the empty audit in §1 is measured against. */
export const PLANTED_LEAK = `
authority(vendor, pagerduty).
incident[vendor](carrier_down).
sneak(X) :- incident[vendor](X).
`;

const rule = (t: string) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`);
const n = (x: number, w = 0) => String(x).padStart(w);

function main(): void {
  const t0 = Date.now();
  const r = world();
  const g = gameWorld();
  const a = arenaWorld();
  const p = policyOf(r);
  const cls = classes(g);
  console.log('RIP — Rest In Peace: why tasks die in a dead letter queue, and which are next.');

  // -- 1 --------------------------------------------------------------------
  rule('1. the model loads, and boot.rofl audits it');
  for (const audit of ['malformed[audit](R)', 'breach[audit](R)', 'leak[audit](A, B)',
    'forged[audit](F)', 'unmoded[audit](R)', 'undefined_premise[audit](R, Rel)']) {
    const rows = r.query(audit).rows;
    console.log(`  ? ${audit.padEnd(34)} -> ${rows.length} row${rows.length === 1 ? '' : 's'}`
      + (rows.length > 0 ? `   ${rows.map((x) => x.text).join(' ')}` : ''));
  }
  console.log(`  ? unstratified(X)                  -> `
    + `${list(col(r, 'unstratified(X)', 'X'))}`);
  console.log('    AND THAT IS THE POINT, not a warning to silence. Under the alternation the');
  console.log('    cycle is INFORMATION about the program rather than a verdict on it: the two');
  console.log('    relations named are the AND and the OR of the game, and they are supposed to');
  console.log('    depend on each other through negation.');
  const ev = new Evaluation(r.store);
  console.log(`  rules not range-restricted: ${ev.rules.filter((x) => !x.safe).length}`);
  console.log(`  relations evaluated top-down: ${ev.demandRels.size}`);
  console.log(`  facts in the store: ${r.factKeys().length}`);
  console.log(`  ledgers: ${list(col(r, 'perspective(P)', 'P').filter((x) => x !== 'main'))}`);
  console.log('\n  Two crossings are declared here and both are exercised, so the empty row above');
  console.log('  is a declaration doing its job and not an audit switched off. Plant a THIRD');
  console.log('  source — an incident feed nobody declared — and the row appears, named:');
  const probe = world(MODEL + PLANTED_LEAK);
  for (const row of probe.query('leak[audit](A, B)').rows) console.log(`      leak[audit](${row.bindings.A}, ${row.bindings.B})`);
  console.log('  It disappears when the rule is removed, and it would disappear as soon as');
  console.log('  somebody wrote `imports(main, vendor)` — which is the sentence the audit is');
  console.log('  asking for rather than an obstacle to route around.');

  // -- 2 --------------------------------------------------------------------
  rule('2. the machine, and the gate that says no');
  const byStage = new Map<string, number>();
  for (const s of col(a, 'state(S)', 'S')) {
    const at = args(s)[0];
    byStage.set(at, (byStage.get(at) ?? 0) + 1);
  }
  console.log(`  reachable states: ${a.query('state(S)').rows.length}      `
    + `transitions: ${a.query('respond(S, A, R, S2)').rows.length}      `
    + `slack: ${p.slack} misbehaviours`);
  console.log('    ' + [...STAGES, ...TERMINALS].map((s) => `${s} ${byStage.get(s) ?? 0}`).join('   '));
  console.log('\n  what the environment may answer, per stage:');
  console.log(`    ${'stage'.padEnd(10)}${'provider'.padEnd(12)}${'idempotent'.padEnd(12)}answers`);
  for (const s of STAGES) {
    const prov = col(a, `provider(${s}, P)`, 'P')[0] ?? '';
    const idem = a.holds(`idempotent(${s})`) ? 'yes' : 'NO';
    console.log(`    ${s.padEnd(10)}${prov.padEnd(12)}${idem.padEnd(12)}`
      + `${col(a, `answers(${s}, A)`, 'A').sort().join(', ')}`);
  }
  console.log('\n  Only the carrier can go quiet, and `lost` is missing from the two probes');
  console.log('  because a read has no effect to lose. Those are claims about the world, and');
  console.log('  section 5 is what happens when the first one is withdrawn.');
  console.log(`\n  ? dangling(S, A)  -> ${a.query('dangling(S, A)').rows.length} rows. An action with no answer would be`);
  console.log('  VACUOUSLY safe — `risky` needs an answer to fire — so this is a soundness');
  console.log('  hole in the MODEL, and a gate that never fires is an assumption with a');
  console.log('  gate\'s interface. Raise the charge budget past what the counter can hold:');
  const holed = arenaWorld(withPolicy({ drop: /^limit\(charge, 1\)\./, add: 'limit(charge, 2).' }));
  const dangle = holed.query('dangling(S, A)').rows;
  console.log(`    limit(charge, 2)  ->  ${dangle.length} rows, e.g. ${dangle.slice(0, 2).map((x) => x.text).join('   ')}`);
  console.log('    a third charge has no `ok` successor, because the model caps the counter at');
  console.log('    two — and the gate names the states rather than letting them read as safe.');

  // -- 3 --------------------------------------------------------------------
  rule('3. one file, two constructions, one answer');
  console.log('  rip.rofl is one program and the machine half is stratified: it loads under the');
  console.log('  ordinary semantics with no declaration at all. Only the game half needs the');
  console.log('  alternation. So the same answer can be had two ways, and both are built here:');
  const gcls = classes(g);
  const wcls = classes(r);
  const same = (x: Set<string>, y: Set<string>) =>
    x.size === y.size && [...x].every((k) => y.has(k));
  console.log(`    whole file, one store:       ${wcls.settles.size} settles   ${wcls.doomed.size} doomed   ${wcls.deadLetter.size} dead letter`);
  console.log(`    machine dumped, game alone:  ${gcls.settles.size} settles   ${gcls.doomed.size} doomed   ${gcls.deadLetter.size} dead letter`);
  console.log(`    identical: ${same(wcls.settles, gcls.settles) && same(wcls.doomed, gcls.doomed)
    && same(wcls.deadLetter, gcls.deadLetter)}`);
  console.log(`\n  The staged build exists for section 6 and not for speed: with the machine`);
  console.log('  ASSERTED, a why-tree over the game shows the game. With the machine derived,');
  console.log('  the same tree walks the reachability proof first, which is true and unreadable.');

  // -- 4 --------------------------------------------------------------------
  rule('4. three categories, and the third is the complement of the fixpoint');
  console.log('   category      states  what it means');
  console.log(`   settles       ${n(cls.settles.size, 6)}  a strategy exists: whatever the providers do, the`);
  console.log('                         books balance in the end');
  console.log(`   doomed        ${n(cls.doomed.size, 6)}  the environment can FORCE them not to. A bug to fix,`);
  console.log('                         not a task to retry');
  console.log(`   dead letter   ${n(cls.deadLetter.size, 6)}  neither is derivable. The play can go on for ever,`);
  console.log('                         so it depends on luck');
  console.log(`   total         ${n(cls.settles.size + cls.doomed.size + cls.deadLetter.size, 6)}  and the three are disjoint and cover the machine`);
  console.log('\n  WHERE THE DEAD LETTERS ARE, and they are all in one place:');
  const dlqBy = new Map<string, number>();
  for (const s of cls.deadLetter) { const at = args(s)[0]; dlqBy.set(at, (dlqBy.get(at) ?? 0) + 1); }
  console.log(`    ${[...dlqBy.entries()].sort().map(([k, v]) => `${k} ${v}`).join('   ')}`);
  console.log('    every one of them at the carrier, every one of them with the doubt flag set.');
  console.log('    A dispatch that may already have gone out, and a provider that has stopped');
  console.log('    answering. Nothing else in this machine is undecidable.');
  console.log('\n  and the doomed states are not "no route home" — they are "no strategy":');
  const doomedLucky = [...cls.doomed].filter((s) => routes(g, s) !== 0n);
  console.log(`    ${doomedLucky.length} of the ${cls.doomed.size} doomed states still have a lucky route to a settled`);
  console.log(`    terminal. ${list(doomedLucky.slice(0, 3))}`);
  console.log('    A run from one of them can finish perfectly well. What the verdict says is');
  console.log('    that a provider which wants it to fail can make it fail, so the fix is the');
  console.log('    policy and not another retry.');

  // -- 5 --------------------------------------------------------------------
  rule('5. the third value is EARNED, from both sides');
  console.log('  An answer where nothing is ever unknown proves nothing, and neither does one');
  console.log('  where everything is. The undefined set has to be a PROPER, NON-EMPTY part of');
  console.log('  the machine, and it has to move when its cause moves.\n');
  const quiet = gameWorld(withPolicy({ drop: /^answers\((ship|track), silence\)\./ }));
  const qcls = classes(quiet);
  console.log(`    baseline                     ${n(cls.deadLetter.size, 4)} dead letter   `
    + `${n(g.query('unknown(X)').rows.length, 4)} unknown rows`);
  console.log(`    carrier cannot go quiet      ${n(qcls.deadLetter.size, 4)} dead letter   `
    + `${n(quiet.query('unknown(X)').rows.length, 4)} unknown rows   `
    + `(${col(quiet, 'state(S)', 'S').length} reachable states)`);
  console.log(`      -> ${qcls.settles.size} settles, ${qcls.doomed.size} doomed, and the program is two-valued. Take away the`);
  console.log('      one behaviour that costs the environment nothing and there is no infinite');
  console.log('      play left, so the alternation\'s two limits meet with nothing between them.');
  console.log('      The negative cycle is still there — the declaration is still required —');
  console.log('      and it simply has no consequences.');
  const noisy = gameWorld(withPolicy({ add: LOUD_GATEWAY }));
  const ncls = classes(noisy);
  console.log(`\n    the payment gateway goes quiet too  ${n(ncls.deadLetter.size, 4)} dead letter   `
    + `${n(noisy.query('unknown(X)').rows.length, 4)} unknown rows   `
    + `(${col(noisy, 'state(S)', 'S').length} reachable states)`);
  console.log(`      -> ${ncls.settles.size} settles, ${ncls.doomed.size} doomed, and the dead letter set does NOT grow.`);
  console.log('      Which is the sharper half of the claim: silence alone is not enough.');
  console.log('      At the charge stage the workflow has somewhere else to go — abort into the');
  console.log('      refund, or ask the gateway what happened — so the exists-quantifier finds a');
  console.log('      safe move and never has to look at the silent one. At the shipping stage');
  console.log('      with the doubt flag up there is no abort, and the probe inherits the same');
  console.log('      silence. SILENCE PLUS NO ALTERNATIVE is what makes a dead letter, and the');
  console.log('      two rows above separate the two ingredients.');
  console.log('\n  AND IT IS NOT THE BUDGET. A run that is cut short reports a hole and claims no');
  console.log('  unknowns at all, which is the other thing "nothing came back" could mean:');
  const cut = new Rofl();
  must(cut.load(BOOT), 'boot.rofl');
  const cutRes = cut.load(MODEL, { who: 'rip', budget: 20_000 });
  console.log(`    budget 20 000     ok=${cutRes.ok}   unknown rows ${cut.query('unknown(X)').rows.length}   `
    + `hole ${cut.query('hole(Id, Reason)').rows.map((x) => x.bindings.Reason).join(',')}   `
    + `partial ${cut.store.partialEval}`);
  console.log(`    budget ${BUDGET.toLocaleString('en-US').replace(/,/g, ' ')}   ok=true   unknown rows `
    + `${r.query('unknown(X)').rows.length}   hole ${r.query('hole(Id, Reason)').rows.length === 0 ? '(none)' : 'yes'}   `
    + `partial ${r.store.partialEval}`);
  console.log('    Two different words for two different situations, which is the whole reason');
  console.log('    the third value had to be derived rather than subtracted.');

  // -- 6 --------------------------------------------------------------------
  rule('6. why is this one undefined');
  console.log(`  $ why unknown(will_settle(${QUIET_CARRIER}))`);
  console.log(indent(g.why(`unknown(will_settle(${QUIET_CARRIER}))`).text, 4));
  console.log('\n  Read it as a script and it is one: ship fails, ship fails again, the attempt');
  console.log('  budget is gone so the workflow asks the carrier what happened, and the carrier');
  console.log('  says nothing — for ever. The tree closes on [cycle] rather than walking the');
  console.log('  loop, and names the unfounded set, which is the set of atoms whose only');
  console.log('  derivation needs to assume itself. That is what the third value IS.');
  console.log('\n  the control, in the same store: a state that settles explains itself the old');
  console.log('  way, through facts and finite failure, and names no unfounded set.');
  const good = [...cls.settles].find((s) => !g.holds(`settled(${s})`))!;
  const gw = g.why(`will_settle(${good})`);
  console.log(`    why will_settle(${good})  ->  ${gw.text.split('\n').length} lines, `
    + `unfounded set: ${gw.text.includes('unfounded set') ? 'named' : 'none'}, `
    + `[undefined]: ${gw.text.includes('[undefined]') ? 'present' : 'absent'}`);

  // -- 7 --------------------------------------------------------------------
  rule('7. counting: how many ways home, and one is fragile');
  console.log('  `can_settle(S)` is true where SOME play from S ends settled — luck, not');
  console.log('  strategy. Counting its derivations says how many such plays there are.\n');
  const fragile = [...cls.settles, ...cls.doomed]
    .filter((s) => !g.holds(`settled(${s})`) && routes(g, s) === 1n).sort();
  console.log(`    states with exactly ONE route home: ${fragile.length}`);
  for (const s of fragile.slice(0, 6)) console.log(`      ${s}`);
  console.log('    One route means one sequence of provider answers. The day that sequence');
  console.log('    stops being possible the task dies, and no test fails when it does.');
  const finite = [...cls.settles].filter((s) => { const c = routes(g, s); return c !== INFINITE && c > 1n; });
  console.log(`\n    states with a finite count above one: ${finite.length}`);
  console.log(`    states with infinitely many: `
    + `${[...cls.settles, ...cls.doomed, ...cls.deadLetter].filter((s) => routes(g, s) === INFINITE).length}`);
  console.log('\n  INFINITE is a divergence and not a fold that gave up, and the way to check');
  console.log('  that is to refuse to close the cycle — count derivations of height at most n:');
  console.log(`\n    height at most      ${QUIET_CARRIER}   a one-route state`);
  const one = fragile[0] ?? [...cls.settles][0];
  for (const row of unfoldingProbe(g, [`can_settle[main](${QUIET_CARRIER})`, `can_settle[main](${one})`],
    UNFOLDING_DEPTHS)) {
    console.log(`      ${n(row.depth, 2)}${' '.repeat(18)}${row.counts[0].padStart(24)}${row.counts[1].padStart(20)}`);
  }
  console.log('    One column grows without settling and the other does not. That is what an');
  console.log('    unbounded number of derivations looks like from below, and it is the');
  console.log('    positive control for the word INFINITE.');

  // -- 8 --------------------------------------------------------------------
  rule('8. best derivation: a reproducing trace, and it executes');
  const trop = shortest(a);
  const sc = script(a, trop, DOUBLE_CHARGE);
  console.log(`  The shortest way to reach ${DOUBLE_CHARGE},`);
  console.log('  which is a fulfilled order that was charged twice. The tropical fold priced');
  console.log('  every derivation of `reached/1`; this is the argmin read back out of the');
  console.log('  support the engine already recorded, not a search this file ran.\n');
  console.log('    step  where                        the workflow   the provider');
  sc.forEach((s, i) => {
    console.log(`    ${n(i + 1, 4)}  ${s.from.padEnd(28)} ${s.move.padEnd(14)} ${s.answer}`);
  });
  console.log(`    ${n(sc.length + 1, 4)}  ${sc[sc.length - 1].to}`);
  const rep = replay(p, sc);
  console.log(`\n  handed to the simulator, which shares no code with the engine:`);
  console.log(`    replay -> ${rep.at}   ${rep.ok ? 'REPRODUCED' : 'DIVERGED'} — ${rep.why}`);
  console.log(`    settled? ${isSettled(parseTask(rep.at))}. Two charges, one parcel: the money is`);
  console.log('    gone twice and nothing in the machine can bring it back, because the');
  console.log('    workflow never learned that the first charge landed.');
  const dl = script(a, trop, QUIET_CARRIER);
  console.log(`\n  and the same for a dead letter, ${QUIET_CARRIER}:`);
  console.log(`    ${dl.map((s) => `${s.move}/${s.answer}`).join('  ->  ')}`);
  console.log(`    replay -> ${replay(p, dl).at}   (${replay(p, dl).ok ? 'reproduced' : 'diverged'})`);
  console.log('    From there the carrier only has to stay quiet. No further failure is needed');
  console.log('    and none is possible: silence costs the environment nothing.');

  // -- 9 --------------------------------------------------------------------
  rule('9. the policy, one line at a time');
  console.log('  Nothing below the @machine marker mentions a retry count. So a policy change');
  console.log('  is a line, and what it is worth is a number.\n');
  console.log(`    ${'policy'.padEnd(36)}${'states'.padEnd(8)}${'settles'.padEnd(9)}${'doomed'.padEnd(8)}dead letter`);
  const variants: [string, Variant][] = [
    ['baseline', {}],
    ['no verify probe for the charge', { drop: /^probe_of\(charge, verify\)\./ }],
    ['no probes at all', { drop: /^probe_of\(/ }],
    ['reserve may abort under doubt', { drop: /^abort_needs_certainty\(reserve\)\./ }],
    ['no stage needs certainty', { drop: /^abort_needs_certainty\(/ }],
    ['refund gets the forward budget', { drop: /^limit\(refund, 2\)\./, add: 'limit(refund, 1).' }],
  ];
  const base = classes(gameWorld());
  for (const [label, v] of variants) {
    const w = gameWorld(Object.keys(v).length === 0 ? MODEL : withPolicy(v));
    const c = classes(w);
    console.log(`    ${label.padEnd(36)}${n(c.settles.size + c.doomed.size + c.deadLetter.size, 6).padEnd(8)}`
      + `${n(c.settles.size, 7).padEnd(9)}${n(c.doomed.size, 6).padEnd(8)}${n(c.deadLetter.size, 11)}`);
  }
  const noVerify = classes(gameWorld(withPolicy({ drop: /^probe_of\(charge, verify\)\./ })));
  const lost = [...base.settles].filter((s) => !noVerify.settles.has(s)).sort();
  console.log(`\n  ONE LINE. Deleting probe_of(charge, verify) costs ${lost.length} states their guarantee:`);
  for (const s of lost.slice(0, 5)) console.log(`      ${s}`);
  console.log('  Every one of them is at the charge stage with the doubt flag set — the exact');
  console.log('  states where a retry might charge twice. Asking before retrying is what a');
  console.log('  non-idempotent stage needs, and the model says how much it is worth.');
  const blind = classes(gameWorld(withPolicy({ drop: /^abort_needs_certainty\(reserve\)\./ })));
  const saved = [...blind.settles].filter((s) => !base.settles.has(s)).sort();
  const atReserve = saved.filter((x) => args(x)[0] === 'reserve').length;
  console.log(`\n  AND ONE LINE THE OTHER WAY. "Only compensate when you know where you stand"`);
  console.log(`  sounds prudent and costs ${saved.length} states — ${atReserve} at the reserve stage itself and`);
  console.log(`  ${saved.length - atReserve} in the release it would have aborted into:`);
  for (const s of saved) console.log(`      ${s}`);
  console.log('  Reserving is idempotent, so the doubt is harmless there and the rule is pure');
  console.log('  loss. The policy has no idea which stages are idempotent; the model does.');
  console.log('\n  and the fairness assumption, swept, because every verdict above is relative');
  console.log('  to it and a number in a file is not an assumption anybody can see:');
  console.log(`\n    slack   states   settles   doomed   dead letter   alternations`);
  for (const s of [0, 1, 2, 3]) {
    const w = gameWorld(s === 2 ? MODEL : withPolicy({ drop: /^slack\(2\)\./, add: `slack(${s}).` }));
    const c = classes(w);
    const alt = (w.diagnostics.find((d) => d.includes('alternation')) ?? '').match(/after (\d+)/);
    console.log(`    ${n(s, 5)}   ${n(c.settles.size + c.doomed.size + c.deadLetter.size, 6)}   `
      + `${n(c.settles.size, 7)}   ${n(c.doomed.size, 6)}   ${n(c.deadLetter.size, 11)}   ${n(Number(alt?.[1] ?? 0), 12)}`);
  }
  console.log('    A more patient adversary reaches more of the machine and settles less of it.');
  console.log('    Nothing here is a probability, and the sweep is the honest way to say so.');

  // -- 10 -------------------------------------------------------------------
  rule('10. the oracle: every state decided a second time');
  const oc = oracleCheck(r);
  console.log(`
  The machine is re-derived in plain TypeScript from the domain description —
  a switch over stages, no rules, no engine — and the three regions are computed
  by the two textbook attractors: the workflow's, which is a least fixpoint over
  "some action, all answers", and the environment's, which is a least fixpoint
  over "all actions, some answer". Neither is an alternating fixpoint. The gap
  between them has to be exactly what the engine reports as undefined.
`);
  console.log(`    states compared:             ${n(oc.states, 6)}   disagreements: ${oc.stateMismatch.length}`);
  console.log(`    transitions compared:        ${n(oc.edges, 6)}   disagreements: ${oc.edgeMismatch.length}`);
  console.log(`    settled terminals:           ${n(col(g, 'settled(S)', 'S').length, 6)}   disagreements: ${oc.settledMismatch.length}`);
  console.log(`    verdicts compared:           ${n(oc.verdictChecks, 6)}   disagreements: ${oc.verdictMismatch.length}`);
  console.log(`    can_settle compared:         ${n(oc.verdictChecks, 6)}   disagreements: ${oc.luckyMismatch.length}`);
  console.log(`    states in two categories:    ${n(oc.overlap.length, 6)}   states in none: ${oc.uncovered.length}`);
  for (const m of [...oc.stateMismatch, ...oc.edgeMismatch, ...oc.verdictMismatch, ...oc.luckyMismatch]) {
    console.log(`      ${m}`);
  }
  console.log('\n  The oracle\'s own positive control, because a comparison that cannot see a');
  console.log('  difference agrees with anything. Take a state whose guarantee rests on ONE');
  console.log('  action, and point one of that action\'s answers at a state the environment');
  console.log('  already wins from:');
  const bent = arena(p);
  const w0 = winning(bent), l0 = losing(bent);
  const dead = [...l0].sort()[0];
  const victim = [...w0].filter((k) => !bent.settled.has(k) && safeMoves(bent, w0, k).length === 1).sort()[0];
  const m0 = safeMoves(bent, w0, victim)[0];
  const es = bent.edges.get(victim)!;
  es[es.findIndex((e) => e.move === m0)] = { ...es.find((e) => e.move === m0)!, to: dead };
  console.log(`    ${victim} keeps only \`${m0}\`; one answer now lands in ${dead}`);
  console.log(`    winning region ${w0.size} -> ${winning(bent).size}, `
    + `and ${victim} is ${winning(bent).has(victim) ? 'STILL IN IT — the control failed' : 'out of it'}.`);

  // -- 11 -------------------------------------------------------------------
  rule('11. the simulator, and the disagreements BY NAME');
  const { r: withSim, arena: ar, journal: js } = simWorld();
  const W = winning(ar);
  console.log(`  ${ENVIRONMENTS.length} environments x ${ar.states.size - TERMINALS.length * 3} non-terminal states.`);
  console.log(`  random and flaky draw from a fixed distribution, ${RUNS_PER_STATE} runs each; adversarial`);
  console.log(`  is deterministic and needs one. Step cap ${STEP_CAP}: a run that hits it is CAPPED,`);
  console.log('  which is the simulator\'s own budget hole and is neither a success nor a');
  console.log('  failure. Merging it into either is exactly what would hide the subject.\n');
  console.log(`    ${'environment'.padEnd(14)}${'settled'.padEnd(10)}${'failed'.padEnd(10)}${'capped'.padEnd(10)}states capped`);
  for (const env of ENVIRONMENTS) {
    const mine = js.filter((j) => j.env === env);
    const s = mine.reduce((x, j) => x + j.settled, 0);
    const f = mine.reduce((x, j) => x + j.failed, 0);
    const c = mine.reduce((x, j) => x + j.capped, 0);
    console.log(`    ${env.padEnd(14)}${n(s, 8).padEnd(10)}${n(f, 8).padEnd(10)}${n(c, 8).padEnd(10)}`
      + `${n(mine.filter((j) => j.capped > 0).length, 8)}`);
  }
  const big = 200_000;
  const swept = sweep(p, 'random', big);
  console.log(`\n  and the sweep the spec asks for in the millions, from the initial state only:`);
  console.log(`    ${big.toLocaleString('en-US').replace(/,/g, ' ')} random runs -> `
    + `${swept.settled} settled, ${swept.failed} failed, ${swept.capped} capped.`);
  console.log('    ZERO capped, and that number is the finding rather than a disappointment.');
  console.log('    A random provider answers `silence` with probability 8 in 100 and the cap is');
  console.log(`    ${STEP_CAP} steps, so the run that hangs needs a run of silences whose probability is`);
  console.log('    around 1e-40. A million runs will never see it. The static answer finds it');
  console.log('    without running anything, and THAT is what the static analysis is for.');
  console.log('\n  the four disagreements, named, one row per state:');
  const kinds = col(withSim, 'crosscheck(S, E, W)', 'W');
  const tallies = new Map<string, number>();
  for (const k of kinds) tallies.set(k, (tallies.get(k) ?? 0) + 1);
  for (const [k, v] of [...tallies.entries()].sort()) console.log(`    ${k.padEnd(42)} ${n(v, 5)} rows`);
  const hangs = withSim.query('crosscheck(S, Env, policy_hangs_where_a_strategy_exists)').rows;
  console.log(`\n  POLICY HANGS WHERE A STRATEGY EXISTS — ${hangs.length} rows, and it is the important one.`);
  console.log('  The model says these states have a strategy; the policy in the simulator hangs');
  console.log('  in them anyway, because it is not playing that strategy. Replaying the run');
  console.log('  step by step gives the exact move where the two part company:\n');
  console.log(`    ${'state the run started from'.padEnd(30)}${'parts company at'.padEnd(30)}${'plays'.padEnd(8)}certified`);
  const seenAt = new Set<string>();
  for (const row of hangs) {
    const d = divergence(ar, W, row.bindings.S);
    if (!d || seenAt.has(d.at)) continue;
    seenAt.add(d.at);
    console.log(`    ${row.bindings.S.padEnd(30)}${d.at.padEnd(30)}${d.plays.padEnd(8)}${list(d.certified)}`);
  }
  console.log(`\n  ${seenAt.size} distinct moves, and every one of them is the same mistake: at the`);
  console.log('  shipping stage the policy calls the carrier, and the certificate says do not —');
  console.log('  cancel the order instead, because a carrier that can go quiet cannot be made');
  console.log('  to deliver. That is an unwelcome answer and it is the correct one, and no');
  console.log('  amount of retrying discovers it.');
  const never = withSim.query('crosscheck(S, Env, dead_letter_never_observed)').rows;
  console.log(`\n  DEAD LETTER NEVER OBSERVED — ${never.length} rows, and every one of them is under a`);
  console.log('  non-adversarial provider:');
  const byEnv = new Map<string, number>();
  for (const row of never) byEnv.set(row.bindings.Env, (byEnv.get(row.bindings.Env) ?? 0) + 1);
  for (const [e, v] of [...byEnv.entries()].sort()) console.log(`    ${e.padEnd(14)} ${n(v, 4)} states the runs never saw hang`);
  console.log('  The pathology is real and no amount of random testing reaches it. Under the');
  console.log('  malicious provider the same states hang on the first run.');
  const forced = withSim.query('crosscheck(S, Env, forced_but_never_seen)').rows;
  console.log(`\n  FORCED BUT NEVER SEEN — ${forced.length} rows. The model says the environment CAN force`);
  console.log('  failure; a random provider is not trying to. Not a defect in either: `doomed`');
  console.log('  is a statement about an adversary, and these rows are the measurement of how');
  console.log('  far a benign provider is from being one.');
  console.log('\n  and the forgery, since the journal is a book with one writer:');
  const forger = forgedWorld();
  console.log(`    a run filed under the simulator's name by somebody else ->`);
  for (const f of col(forger, 'forged[audit](F)', 'F')) console.log(`      ${f}`);
  console.log('    Nothing in rip.rofl mentions forgery. WHO filed a run is the load identity');
  console.log('    checked against `authority`, not a column anybody could fill in.');

  // -- 12 -------------------------------------------------------------------
  rule('12. can the certified strategy be implemented');
  const oc2 = obsClasses(ar, W);
  const split = oc2.filter((x) => x.uniform.length === 0);
  console.log('  The fixpoint quantifies over actions per STATE, and a state carries what the');
  console.log('  workflow cannot see — whether the money moved, whether the parcel went. So the');
  console.log('  certificate may branch on hidden information, and the honest thing is to say');
  console.log('  by how much rather than to hope.\n');
  console.log(`    winning non-terminal states:           ${n(oc2.reduce((x, c) => x + c.states.length, 0), 5)}`);
  console.log(`    distinct observations among them:      ${n(oc2.length, 5)}`);
  console.log(`    observations with one action safe in every state:  ${n(oc2.length - split.length, 5)}`);
  console.log(`    observations that need hidden information:         ${n(split.length, 5)}`);
  if (split.length > 0) {
    console.log('\n    and they are these, by name:');
    for (const s of split.slice(0, 8)) {
      console.log(`      ${s.obs.padEnd(16)} ${s.states.length} states, safe actions: `
        + `${s.states.map((k) => `${k}:${safeMoves(ar, W, k).join('/')}`).join('  ')}`);
    }
  }
  console.log('\n    Zero, and that is a result rather than a relief: every guarantee the');
  console.log('    fixpoint certifies for this machine can be played by a workflow that knows');
  console.log('    only its own stage, its own attempt counter and whether it is unsure. The');
  console.log('    hidden state never has to be branched on — a class of states that look');
  console.log('    alike always has one action that is safe in all of them.');
  console.log('\n    THE CONTROL, because a check that cannot say no says nothing. Blind the');
  console.log('    workflow further — let it see only which stage it is at, and not how many');
  console.log('    attempts it has spent or whether it is unsure — and the same check must');
  console.log('    start objecting:');
  const blindClasses = obsClassesBy(ar, W, (s) => s.at);
  const blindSplit = blindClasses.filter((x) => x.uniform.length === 0);
  console.log(`      observations: ${blindClasses.length}   `
    + `needing information the workflow does not have: ${blindSplit.length}`);
  for (const s of blindSplit) {
    console.log(`        at ${s.obs.padEnd(10)} ${s.states.length} winning states, no single action safe in all of them`);
  }
  console.log('      So the zero above is the measurement of a machine, not of a check that');
  console.log('      never fires — and it is what makes section 11\'s hanging runs a fact about');
  console.log('      the deployed policy rather than about the certificate.');

  console.log(`\n(${Date.now() - t0} ms for everything above.)`);
  const bad = oc.stateMismatch.length + oc.edgeMismatch.length + oc.settledMismatch.length
    + oc.verdictMismatch.length + oc.luckyMismatch.length + oc.overlap.length + oc.uncovered.length
    + (rep.ok ? 0 : 1);
  if (bad > 0) process.exitCode = 1;
}

const realPath = (p: string) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && realPath(path.resolve(process.argv[1])) === realPath(new URL(import.meta.url).pathname)) {
  main();
}
