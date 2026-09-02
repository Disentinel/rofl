// demo.ts — NPC: Non-Player Cognition.
//
//   node --experimental-strip-types examples/npc/demo.ts
//
// Nothing in the transcript is composed by hand; README.md and page.html
// paste this program's stdout. Every claim the transcript makes is checked a
// second time by something that is not the rules re-run:
//
//   the semiring's verdict     against the arithmetic done by hand from the
//                              drive table, and against a perturbation of one
//                              priority that flips the action while leaving
//                              the priority ORDER unchanged
//   the closed sense/act loop  against the SAME program with '@next' taken
//                              off the transition, which must still be
//                              refused (the positive control lives inside the
//                              probe, not beside it)
//   the learned rule           against the past: restored at tick 1 and
//                              re-derived, the hole has to be gone THERE
//   the rule-set diff          against `ruleIdOf` recomputed from the text
//   "last derivable at tick N" against the snapshot at N and the one after it
//   the throughput             against a second run with snapshots off

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { peelRounds } from '../../src/rounds.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import { parseProgram } from '../../src/parser.ts';
import { ruleIdOf } from '../../src/reflect.ts';
import {
  viterbiSemiring, logProbOf, probabilityOf, IMPOSSIBLE, type LogProb,
  countingSemiring, INFINITE, type Count,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const NPC = read('examples', 'npc', 'npc.rofl');

/** The demo's own bookkeeping budget, generous: it is not the agents'. */
const BUDGET = 4_000_000;

/** THE FRAME BUDGET, in rule firings, for one tick of ten agents. The domain
 *  meaning of the kernel's inference budget is the frame budget, and here
 *  they are the same number. §7 of the transcript spends less than a tick
 *  costs and shows what comes back. */
export const FRAME = 1_200;

// ===========================================================================
// THE YARD
// ===========================================================================

export interface Ent { id: string; kind: string; x: number; y: number; hp: number; }

/** Tick 1. Everything interesting in the transcript is a consequence of these
 *  ten lines and nothing is arranged later.
 *
 *  npc_1 and npc_5 are in range of each other with cart_3 between them, so
 *  npc_1 does not know an ally is bleeding two cells away — that is the fog of
 *  war, and §1 hands npc_1 the missing line to show what it costs.
 *  npc_3 CAN see npc_5, holds the intent to tend it, and has no rule for
 *  walking to it — that is the hole the agent later closes.
 *  npc_4 stands next to npc_8 — that is the pair the semiring arbitrates. */
export const START: Ent[] = [
  { id: 'npc_1',  kind: 'warden', x: 2, y: 4, hp: 100 },
  { id: 'npc_2',  kind: 'warden', x: 1, y: 5, hp: 100 },
  { id: 'npc_3',  kind: 'warden', x: 2, y: 5, hp: 100 },
  { id: 'npc_4',  kind: 'warden', x: 7, y: 2, hp: 100 },
  { id: 'npc_5',  kind: 'warden', x: 4, y: 5, hp:  55 },
  { id: 'npc_6',  kind: 'warden', x: 8, y: 4, hp: 100 },
  { id: 'npc_7',  kind: 'wolf',   x: 4, y: 2, hp:  90 },
  { id: 'npc_8',  kind: 'wolf',   x: 8, y: 2, hp:  90 },
  { id: 'npc_9',  kind: 'wolf',   x: 9, y: 5, hp:  90 },
  { id: 'npc_10', kind: 'wisp',   x: 1, y: 3, hp: 100 },
];

export const PROPS: { id: string; x: number; y: number }[] = [
  { id: 'crate_14', x: 3, y: 2 },
  { id: 'crate_15', x: 3, y: 3 },
  { id: 'cart_3',   x: 3, y: 4 },
];

export const WIDTH = 9;
export const HEIGHT = 5;

export const clone = (es: Ent[]): Ent[] => es.map((e) => ({ ...e }));

// ===========================================================================
// the store
// ===========================================================================

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`npc: ${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

/** boot.rofl + npc.rofl. boot.rofl is here for real work: it computes
 *  `stratum/2` over every rule, including one the agent writes at runtime,
 *  and its audits judge that rule the same way they judge the file. */
export function head(extra: string = ''): Rofl {
  const r = new Rofl();
  must(r.load(BOOT, { budget: BUDGET }), 'boot.rofl');
  must(r.load(NPC, { who: 'sim', budget: BUDGET }), 'npc.rofl');
  if (extra.trim() !== '') must(r.load(extra, { who: 'sim', budget: BUDGET }), 'the extra rules');
  return r;
}

/** What the simulator republishes every tick: positions and wounds, and
 *  nothing else. Everything static is carried by npc.rofl §2. */
export function publish(r: Rofl, ents: Ent[], budget: number = BUDGET): void {
  const text = ents.map((e) => `at[world](${e.id}, ${e.x}, ${e.y}). hp[world](${e.id}, ${e.hp}).`).join('\n');
  must(r.load(text, { who: 'sim', budget }), 'the roster');
}

export function rows(r: Rofl, q: string, budget: number = BUDGET): Record<string, string>[] {
  const res = r.query(q, { budget });
  if (res.error) throw new Error(`npc: query ${q}: ${res.error}`);
  return res.rows.map((x) => x.bindings);
}

export const col = (r: Rofl, q: string, v: string): string[] => rows(r, q).map((x) => x[v]);

// ===========================================================================
// FACT KEYS
//
// The Viterbi weight has to know the priority of the intent a firing
// concluded, and the only thing the fold hands it is the fact's key. A key
// is `rel[persp](a1,a2,...)` with terms that nest, so the arguments are split
// on top-level commas rather than by String.split.
// ===========================================================================

export interface Key { rel: string; persp: string; args: string[] }

export function parseKey(key: string): Key | null {
  const m = /^([a-z_][A-Za-z0-9_]*)\[([^\]]*)\]\(/.exec(key);
  if (!m || !key.endsWith(')')) return null;
  const inner = key.slice(m[0].length, -1);
  const args: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { args.push(inner.slice(start, i)); start = i + 1; }
  }
  if (inner.length > 0) args.push(inner.slice(start));
  return { rel: m[1], persp: m[2], args };
}

// ===========================================================================
// THE ARBITER
//
// One Viterbi fold over the support the kernel already recorded. The only
// domain knowledge in it is one line: a firing that concludes an intent
// carries that intent's priority as its factor. Everything else — which
// derivations exist, which premises they rest on, which of two routes to the
// same act is better — comes out of the store.
// ===========================================================================

/** The factor a firing contributes: the priority of the intent it concludes,
 *  as a probability, and 1 for every other rule in the program. */
export function intentWeight(key: string): LogProb {
  const k = parseKey(key);
  if (!k || k.rel !== 'intent' || k.args.length !== 3) return logProbOf(1);
  const p = Number(k.args[2]);
  return Number.isFinite(p) && p >= 0 && p <= 100 ? logProbOf(p / 100) : logProbOf(1);
}

export interface Fold {
  option: Map<string, LogProb>;   // option fact key -> best-derivation value
  rounds: number;
  converged: boolean;
  disciplineHeld: boolean;
  cyclic: number;
}

export function arbitrate(r: Rofl): Fold {
  const f = evaluateSemiring(r.store, viterbiSemiring, { weight: (key) => intentWeight(key) });
  const option = new Map<string, LogProb>();
  for (const [k, v] of f.value) if (k.startsWith('option[mind](')) option.set(k, v as LogProb);
  return {
    option, rounds: f.rounds, converged: f.converged,
    disciplineHeld: f.disciplineHeld, cyclic: f.cyclic,
  };
}

/** The fold's answer, collapsed to one score per (agent, act) by ⊕ = max —
 *  the semiring's own operator, not a host tie-break — and written back into
 *  the arbiter's ledger so that every verdict ABOUT it is a rule. */
export function scoreFacts(f: Fold): { text: string; best: Map<string, LogProb> } {
  const best = new Map<string, LogProb>();
  const seat = new Map<string, [string, string]>();
  for (const [key, v] of f.option) {
    const k = parseKey(key);
    if (!k || k.args.length !== 3) continue;
    const [agent, act] = k.args;
    const id = `${agent}|${act}`;
    const cur = best.get(id);
    if (cur === undefined || viterbiSemiring.plus(cur, v) !== cur) { best.set(id, v); seat.set(id, [agent, act]); }
  }
  const lines: string[] = [];
  for (const [id, v] of [...best.entries()].sort()) {
    const [agent, act] = seat.get(id)!;
    lines.push(`score[choice](${agent}, ${act}, ${v === IMPOSSIBLE ? -2_000_000_000 : Math.round(v as number)}).`);
  }
  return { text: lines.join('\n'), best };
}

/** One tick's deliberation: derive, fold, score, derive again. The second
 *  evaluation is what turns numbers into a decision, and it is rules. */
export function settle(r: Rofl, budget: number = BUDGET): { fold: Fold; scored: number; partial: boolean } {
  r.evaluate(budget);
  if (r.store.partialEval) return { fold: arbitrate(r), scored: 0, partial: true };
  const fold = arbitrate(r);
  const { text } = scoreFacts(fold);
  if (text !== '') must(r.assert(text, { who: 'arbiter' }), 'the scores');
  r.evaluate(budget);
  return { fold, scored: text === '' ? 0 : text.split('\n').length, partial: r.store.partialEval };
}

export interface Act { agent: string; act: string }

export const chosen = (r: Rofl): Act[] =>
  rows(r, 'does[mind](A, Act)').map((x) => ({ agent: x.A, act: x.Act }))
    .sort((a, b) => a.agent.localeCompare(b.agent));

// ===========================================================================
// THE PHYSICS
//
// The one part of the loop that is host code, and npc.rofl §2 says why. It is
// no longer forced: since a '@next' conclusion contributes no same-tick
// dependency edge, the kernel accepts the transition written as rules, and §2
// of the transcript measures that instead of the refusal it used to measure.
// The split is KEPT here anyway, and now on its own merits — deliberation may
// not read ground truth, which is this example's epistemic discipline, and
// the arithmetic of movement is host work exactly as in examples/loot.
// ===========================================================================

const DIRS: Record<string, [number, number]> = {
  north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0],
};

export const STRIKE_DAMAGE = 25;
export const TEND_HEAL = 40;

export interface Outcome { ents: Ent[]; events: string[] }

/** Apply one tick's actions. Agents move in id order; a move into a prop, off
 *  the grid, or into a cell somebody already holds or has just claimed simply
 *  does not happen and is recorded. */
export function physics(ents: Ent[], acts: Act[]): Outcome {
  const next = clone(ents);
  const by = new Map(next.map((e) => [e.id, e]));
  const events: string[] = [];
  const blockedCell = (x: number, y: number) =>
    x < 1 || x > WIDTH || y < 1 || y > HEIGHT || PROPS.some((p) => p.x === x && p.y === y);
  const taken = new Set(next.map((e) => `${e.x},${e.y}`));

  for (const { agent, act } of [...acts].sort((a, b) => a.agent.localeCompare(b.agent))) {
    const self = by.get(agent);
    if (!self) continue;
    const mv = /^move\((\w+)\)$/.exec(act);
    if (mv) {
      const d = DIRS[mv[1]];
      if (!d) continue;
      const nx = self.x + d[0], ny = self.y + d[1];
      if (blockedCell(nx, ny) || taken.has(`${nx},${ny}`)) {
        events.push(`${agent} tried ${act} and could not: ${blockedCell(nx, ny) ? 'a prop or the wall' : 'somebody is there'}`);
        continue;
      }
      taken.delete(`${self.x},${self.y}`);
      taken.add(`${nx},${ny}`);
      self.x = nx; self.y = ny;
      continue;
    }
    const st = /^strike\((\w+)\)$/.exec(act);
    if (st) {
      const t = by.get(st[1]);
      if (!t) continue;
      t.hp = Math.max(0, t.hp - STRIKE_DAMAGE);
      events.push(`${agent} struck ${t.id} (${t.hp} hp left)`);
      continue;
    }
    const td = /^tend\((\w+)\)$/.exec(act);
    if (td) {
      const t = by.get(td[1]);
      if (!t) continue;
      const before = t.hp;
      t.hp = Math.min(100, t.hp + TEND_HEAL);
      events.push(`${agent} tended ${t.id} (${before} -> ${t.hp} hp)`);
    }
  }
  const fallen = next.filter((e) => e.hp <= 0);
  for (const e of fallen) events.push(`${e.id} fell`);
  return { ents: next.filter((e) => e.hp > 0), events };
}

// ===========================================================================
// THE RUN
// ===========================================================================

export interface TickRecord {
  tick: number;
  ents: Ent[];                 // the state deliberated over
  acts: Act[];
  scores: { agent: string; act: string; v: LogProb }[];
  uncovered: { agent: string; reason: string; subject: string }[];
  ties: string[];
  events: string[];
  snapshot: string | null;
  ms: number;
  facts: number;
  derived: number;
}

export interface Sim {
  ticks: TickRecord[];
  ents: Ent[];                 // the state after the last tick
  ms: number;
  r: Rofl;                     // the head, left at the tick after the last
}

export interface RunOpts {
  ticks?: number;
  roster?: Ent[];
  extra?: string;              // rules the agent has written for itself
  snapshots?: boolean;
  budget?: number;
  prune?: boolean;             // drop completed-tick provenance (§12 measures it)
}

/** Drop the kernel's `derived_by` records for completed ticks. NOT the
 *  default: `advanceTick` freezes that relation on purpose, so a finished
 *  tick keeps the record of which rule concluded what. §12 runs the yard once
 *  with it and once without, because "the provenance table is the cost curve"
 *  is a claim that has to be measured from both sides rather than asserted
 *  from one.
 *
 *  Nothing in this example reads `derived_by`; `why` walks the witness table,
 *  which this leaves alone. A program that DID read it — examples/loot §5 —
 *  could not do this at all.
 *
 *  THE KERNEL NOW OFFERS THE SAME THING AS A POLICY, and it is strictly
 *  better than this: `new Rofl({ retainTicks: N })` keeps the current tick
 *  plus N completed ones, and refuses to prune at all for a program whose
 *  rules read `derived_by`, which is the gate this host-side sweep does not
 *  have. Measured here, ten agents, eight ticks, snapshots off, on one laptop
 *  at load average 3.2: this sweep 2013 ms, `retainTicks: 0` 1980 ms — the
 *  same run within noise — and the kernel path still holds the CURRENT tick's
 *  provenance (332 records against this sweep's zero). This function stays
 *  because §12's second row is a measurement of the store rather than of the
 *  policy, and because it is what a host had to do before the policy existed. */
export function pruneProvenance(r: Rofl): number {
  const keys: string[] = [];
  for (const f of r.store.facts.values()) if (f.rel === 'derived_by') keys.push(f.key);
  for (const k of keys) r.store.remove(k);
  return keys.length;
}

export function runSim(opts: RunOpts = {}): Sim {
  const n = opts.ticks ?? 12;
  const budget = opts.budget ?? BUDGET;
  const r = head(opts.extra ?? '');
  let ents = clone(opts.roster ?? START);
  const ticks: TickRecord[] = [];
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const tickStart = Date.now();
    publish(r, ents, budget);
    const { fold, partial } = settle(r, budget);
    const acts = partial ? [] : chosen(r);
    const uncovered = partial ? [] : rows(r, 'uncovered[audit](A, Reason, S)')
      .map((x) => ({ agent: x.A, reason: x.Reason, subject: x.S }));
    const ties = partial ? [] : rows(r, 'tie[audit](A, Act, Other)')
      .map((x) => `${x.A}: ${x.Act} / ${x.Other}`);
    const scores = [...fold.option.entries()].map(([k, v]) => {
      const p = parseKey(k)!;
      return { agent: p.args[0], act: p.args[1], v: v as LogProb };
    });
    const out = physics(ents, acts);
    ticks.push({
      tick: r.store.tick, ents: clone(ents), acts, scores, uncovered, ties,
      events: out.events,
      snapshot: (opts.snapshots ?? true) ? r.save() : null,
      ms: Date.now() - tickStart,
      facts: r.store.facts.size,
      derived: [...r.store.facts.values()].filter((f) => !f.base).length,
    });
    ents = out.ents;
    r.tickAdvance({ budget });
    if (opts.prune) pruneProvenance(r);
  }
  return { ticks, ents, ms: Date.now() - t0, r };
}

/** The store as it was at tick T, rebuilt from the snapshot. `Store.restore`
 *  comes back dirty, so the derived layer is RE-DERIVED rather than replayed
 *  — which is exactly what makes §8's "applied to the whole past" a claim
 *  about the rules and not about a log. */
export function restore(sim: Sim, tick: number, extra: string = ''): Rofl {
  const rec = sim.ticks.find((t) => t.tick === tick);
  if (!rec || rec.snapshot === null) throw new Error(`npc: no snapshot at tick ${tick}`);
  const r = Rofl.fromSnapshot(rec.snapshot);
  if (extra.trim() !== '') must(r.load(extra, { who: 'sim', budget: BUDGET }), 'the extra rules');
  return r;
}

/** The latest tick at which a literal was derivable, and the ticks either
 *  side of it. The kernel supplies the snapshots; the scan is host, and it is
 *  a scan of re-derivations, not of a log of what was printed. */
export function lastDerivable(sim: Sim, lit: string, extra: string = ''):
    { tick: number | null; held: number[]; missed: number[] } {
  const held: number[] = [], missed: number[] = [];
  for (const rec of sim.ticks) {
    if (rec.snapshot === null) continue;
    const r = Rofl.fromSnapshot(rec.snapshot);
    if (extra.trim() !== '') must(r.load(extra, { who: 'sim', budget: BUDGET }), 'the extra rules');
    (r.holds(lit) ? held : missed).push(rec.tick);
  }
  return { tick: held.length > 0 ? held[held.length - 1] : null, held, missed };
}

// ===========================================================================
// SELF-EXTENSION
// ===========================================================================

/** THE GENERATIVE STEP, AND IT IS NOT THE KERNEL'S.
 *
 *  Given holes of the shape `uncovered(A, no_action, tend(B))`, this returns
 *  one rule: if you mean to tend somebody you cannot reach, step towards
 *  where you last saw them. The template is a human's; choosing it is the
 *  part no fixpoint performs, and the spec says so in as many words.
 *
 *  What the kernel then guarantees is everything else: the rule is recorded
 *  as facts like any other, it is applied to the whole past on the next
 *  evaluation, the audits of boot.rofl judge it, and the diff of §9 names it.
 *  It does NOT guarantee that the rule is sensible — §8 checks that by
 *  running it, which is a different kind of claim.
 *
 *  Returns null when there is nothing to generalise from: three holes of one
 *  shape is the threshold, and a threshold met by one hole is not a
 *  generalisation. */
export function proposeRule(holes: { agent: string; reason: string; subject: string }[]):
    { text: string; from: string[] } | null {
  const tend = holes.filter((h) => h.reason === 'no_action' && /^tend\(/.test(h.subject));
  if (tend.length < 3) return null;
  return {
    from: [...new Set(tend.map((h) => `${h.agent} ${h.subject}`))].sort(),
    text: `
-- written by the agent at runtime, generalised from ${tend.length} holes of
-- the shape uncovered(A, no_action, tend(B)): an ally that cannot be reached
-- is one to walk towards, by the last place it was seen.
option[mind](A, move(D), tend(B)) :- intent[mind](A, tend(B), _),
                                     step_to[mind](A, D, X2, Y2),
                                     recalls[mind](A, B, _, BX, BY, _, _),
                                     gap[mind](A, B, D0),
                                     D1 is (X2 - BX) * (X2 - BX) + (Y2 - BY) * (Y2 - BY),
                                     D1 < D0.
`.trim() + '\n',
  };
}

/** The ids of every rule the store holds. Rules are facts, so a rule set is a
 *  query — and two rule sets are two queries, which is the whole of the diff.
 *
 *  RELATION TO examples/loot. LOOT diffs two EDITIONS OF A PACK by parsing
 *  two texts and hashing the clauses; this diffs two SNAPSHOTS OF ONE HEAD by
 *  reading `rule(R)` back out of the store. Same identity function
 *  (`ruleIdOf`, content-addressed), different source, and no machinery
 *  duplicated: the set difference is four lines because the kernel already
 *  did the hard half. LOOT's finding transfers unchanged and is not
 *  re-litigated here — a renamed variable is a different rule id, so a diff
 *  across a rename keeps nothing. §9 shows it once with a positive control
 *  and cites LOOT for the rest. */
export const ruleIds = (r: Rofl): Set<string> => new Set(col(r, 'rule(R)', 'R'));

export interface RuleDiff { added: string[]; removed: string[]; kept: number }

export function ruleSetDiff(before: Set<string>, after: Set<string>): RuleDiff {
  return {
    added: [...after].filter((x) => !before.has(x)).sort(),
    removed: [...before].filter((x) => !after.has(x)).sort(),
    kept: [...before].filter((x) => after.has(x)).length,
  };
}

// ===========================================================================
// THE LOOP THE KERNEL NOW CLOSES, AND THE ONE IT STILL WILL NOT
//
// This probe used to measure a REFUSAL: the world transition written as rules
// made the whole sense-decide-act cycle a negative dependency cycle, because
// stratification was computed on a graph that did not know a conclusion's
// tense. It does now — `not p` means "p is not derivable in THIS TICK", so a
// '@next' head contributes no same-tick edge — and the closed loop loads.
//
// So the probe is inverted and its control with it. Loading proves nothing on
// its own: a kernel that had simply stopped checking would also load it. The
// control is therefore the SAME transition with the temporal marker taken
// off. That program is a real same-tick cycle and must still be refused, and
// the difference between the two is one word. The open program stays as the
// third arm: it must load AND derive, or all three are about something else.
// ===========================================================================

const LOOP_CORE = `
authority(main, sim).
authority(world, sim).
at[world](npc_1, 1, 1) @init.
at[world](npc_7, 3, 1) @init.
saw[npc_1](E, X, Y) :- at[world](E, X, Y), E != npc_1.
knows[mind](A, E) :- saw[A](E, _, _).
does[mind](A, step) :- knows[mind](A, E), not settled[mind](A).
settled[mind](A) :- knows[mind](A, nothing).
`;

const LOOP_CLOSE = `
at[world](E, X2, Y) @next :- does[mind](E, step), at[world](E, X, Y), X2 is X + 1.
at[world](E, X, Y) @next :- at[world](E, X, Y), not does[mind](E, step).
`;

// The same two rules, '@next' removed. Now the transition really does write
// what deliberation reads, in one tick, and the cycle is real.
const LOOP_SAME_TICK = `
at[world](E, X2, Y) :- does[mind](E, step), at[world](E, X, Y), X2 is X + 1.
at[world](E, X, Y) :- at[world](E, X, Y), not does[mind](E, step).
`;

export interface LoopProbe {
  closedOk: boolean; closedDiag: string;
  openOk: boolean; openDiag: string;
  openDerives: string[];
  /** `at[world]` one tick after the closed loop ran: the loop having closed is
   *  worth nothing unless the world it computes is the right one. */
  moved: string[];
  /** The control: the same transition without '@next'. Must still be refused. */
  sameTickOk: boolean; sameTickDiag: string;
}

/** The loop probe's own budget. 400 was sized against a smaller `boot.rofl`
 *  and stopped being enough the day the meta-kernel gained the collection
 *  graph: the tick then needed 426 steps (bisected, not guessed), so
 *  `tickAdvance` refused to advance, emitted a hole, and the probe reported
 *  the UNMOVED world -- a correct refusal that reads exactly like a wrong
 *  answer. 800 is roughly twice the measured requirement, which is headroom
 *  for the next rule rather than a number chosen to pass today. */
export const LOOP_BUDGET = 800;

export function loopProbe(budget: number = LOOP_BUDGET): LoopProbe {
  const closed = new Rofl();
  must(closed.load(BOOT, { budget: BUDGET }), 'boot.rofl');
  const c = closed.load(LOOP_CORE + LOOP_CLOSE, { who: 'sim', budget });
  let moved: string[] = [];
  if (c.ok) {
    closed.tickAdvance({ budget });
    moved = closed.query('at[world](E, X, Y)').rows.map((x) => x.text);
  }
  const open = new Rofl();
  must(open.load(BOOT, { budget: BUDGET }), 'boot.rofl');
  const o = open.load(LOOP_CORE, { who: 'sim', budget });
  const same = new Rofl();
  must(same.load(BOOT, { budget: BUDGET }), 'boot.rofl');
  const t = same.load(LOOP_CORE + LOOP_SAME_TICK, { who: 'sim', budget });
  return {
    closedOk: c.ok, closedDiag: (c.diagnostics[0] ?? '').split('\n')[0],
    openOk: o.ok, openDiag: (o.diagnostics[0] ?? '').split('\n')[0],
    openDerives: o.ok ? open.query('does[mind](A, Act)').rows.map((x) => x.text) : [],
    moved,
    sameTickOk: t.ok, sameTickDiag: (t.diagnostics[0] ?? '').split('\n')[0],
  };
}

// ===========================================================================
// COUNTING ACROSS TICKS
//
// examples/loot reported the interaction and examples/oops measured it; this
// was the third case, and unlike theirs it could not be avoided, because tick
// restoration is one of the things NPC is for. It is settled: the fold is
// about ONE tick, so a carried fact is a given in the tick that reads it and
// the boundary edge is not walked. This probe is what measures that rather
// than assuming it — how many facts the counting semiring can put a finite
// number on before and after the clock moves, and how much of what is left
// belongs to the agent's own memory.
// ===========================================================================

export interface CountProbe {
  tick: number; finite: number; infinite: number; cyclic: number;
  /** INFINITE among the agent's own memory relations — the number the carry
   *  rule used to inflate, and the one that must now be zero. */
  memory: number;
  /** whatever is still INFINITE, whichever relation it belongs to. */
  sample: string[];
}

const MEMORY_RELS = ['saw[', 'does[', 'recalls['];

export function countProbe(r: Rofl): CountProbe {
  const f = evaluateSemiring(r.store, countingSemiring);
  let finite = 0, infinite = 0, memory = 0;
  const sample: string[] = [];
  for (const [k, v] of f.value) {
    if (k.startsWith('rule[') || k.startsWith('premise_') || k.startsWith('conclusion_')) continue;
    if ((v as Count) === INFINITE) {
      infinite++;
      if (MEMORY_RELS.some((p) => k.startsWith(p))) memory++;
      if (sample.length < 3) sample.push(k);
    } else finite++;
  }
  return { tick: r.store.tick, finite, infinite, cyclic: f.cyclic, memory, sample };
}

// ===========================================================================
// hygiene the whole transcript rests on
// ===========================================================================

export interface Hygiene {
  rules: number; allSafe: boolean; demandRels: number;
  unstratified: string[]; audits: Record<string, number>;
  strata: { rel: string; level: number }[];
}

export function hygiene(r: Rofl, watch: string[]): Hygiene {
  // THE SCHEDULE, off the peel. boot.rofl used to derive `stratum/2` and
  // `unstratified/1` and this read them out of the store; the ten rules that
  // did so were deleted once the evaluator started peeling its schedule off the
  // decoded rules instead. The round a relation settles in IS its level, and a
  // relation still standing when a round settles nothing IS unstratifiable —
  // the same two answers, now read from the schedule that was actually used.
  const ev = new Evaluation(r.store, { budget: BUDGET });
  const peel = peelRounds(ev.rules);
  const strata = peel.round;
  return {
    rules: ev.rules.length,
    allSafe: ev.rules.every((x) => x.safe),
    demandRels: ev.demandRels.size,
    unstratified: peel.stuck,
    audits: {
      malformed: rows(r, 'malformed[audit](R)').length,
      breach: rows(r, 'breach[audit](R)').length,
      leak: rows(r, 'leak[audit](A, B)').length,
      forged: rows(r, 'forged[audit](F)').length,
      unmoded: rows(r, 'unmoded[audit](R)').length,
      undefined_premise: rows(r, 'undefined_premise[audit](R, Rel)').length,
    },
    strata: watch.map((rel) => ({ rel, level: strata.get(rel) ?? -1 })),
  };
}

/** Firings a full re-evaluation of this store costs — the unit the frame
 *  budget is spent in. */
export function firings(r: Rofl, budget: number = BUDGET): number {
  const scratch = Rofl.fromSnapshot(r.save());
  scratch.store.dirty = true;
  const ev = new Evaluation(scratch.store, { budget });
  try { ev.run(); } catch { /* the count up to the wall is the answer */ }
  return ev.steps;
}

// ===========================================================================
// text visualisation
// ===========================================================================

const GLYPH: Record<string, string> = { warden: 'W', wolf: 'w', wisp: '*' };

export function render(ents: Ent[], mark: Record<string, string> = {}): string[] {
  const out: string[] = [];
  for (let y = HEIGHT; y >= 1; y--) {
    let line = `  y=${y} `;
    for (let x = 1; x <= WIDTH; x++) {
      const e = ents.find((z) => z.x === x && z.y === y);
      const p = PROPS.find((z) => z.x === x && z.y === y);
      const cell = e ? (mark[e.id] ?? (GLYPH[e.kind] + e.id.slice(4))) : p ? '##' : ' .';
      line += cell.padStart(3);
    }
    out.push(line);
  }
  out.push('       ' + Array.from({ length: WIDTH }, (_, i) => String(i + 1).padStart(3)).join(''));
  return out;
}

// ===========================================================================
// the transcript
// ===========================================================================

const W = 78;
const say = (s: string = '') => { console.log(s); };
const rule = (title: string) => { say(); say(('== ' + title + ' ').padEnd(W, '=')); };

/** Print at most `n` lines of a derivation and SAY how many were dropped. A
 *  `why` tree re-expands a premise every time it is used, so the tree under
 *  one intent runs to a couple of hundred lines; cutting it silently would be
 *  the one thing this repository is against. */
function clip(text: string, n: number, indent: string = '    '): void {
  const lines = text.split('\n');
  for (const l of lines.slice(0, n)) say(indent + l);
  if (lines.length > n) say(`${indent}[... ${lines.length - n} more lines: a premise used twice is expanded twice]`);
}

/** How long the yard runs. Ten agents for ten ticks is the size the spec
 *  asks for; §12 publishes what that costs and how the cost moves. */
export const TICKS = 8;

const STRATA_WATCH = [
  'spots', 'saw', 'recalls', 'foe', 'ally', 'intent', 'subgoal', 'option',
  'any_option', 'contender', 'preempted', 'does', 'uncovered', 'tie',
];

export function pct(v: LogProb): string {
  return v === IMPOSSIBLE ? 'impossible' : probabilityOf(v).toFixed(4);
}

/** One throughput measurement: the ticks and the wall clock of one run. */
export interface Bench { label: string; ms: number; ticks: TickRecord[] }

/** MEASURED FIRST, BEFORE ANYTHING ELSE IN THIS PROGRAM ALLOCATES.
 *
 *  Not fussiness: the same eight ticks measured after the rest of the
 *  transcript has built and retained three worlds and sixteen snapshots run
 *  THREE TIMES SLOWER in the same process, on the same machine, deriving the
 *  same facts. A throughput number taken at the end of a demo is a number
 *  about the demo's heap. So the benchmarks run on a cold heap, in one
 *  batch, and §12 prints what this returned. */
export function benchmarks(): Bench[] {
  const out: Bench[] = [];
  for (const [label, opts] of [
    ['snapshots off', { snapshots: false }],
    ['snapshots off, provenance pruned each tick', { snapshots: false, prune: true }],
    ['snapshots on', { snapshots: true }],
  ] as [string, RunOpts][]) {
    const run = runSim({ ticks: TICKS, ...opts });
    out.push({ label, ms: run.ms, ticks: run.ticks.map((t) => ({ ...t, snapshot: null })) });
  }
  return out;
}

function main(): void {
  const t0 = Date.now();
  const bench = benchmarks();
  const checks: string[] = [];
  const check = (what: string, ok: boolean) => {
    checks.push(`${ok ? 'AGREE   ' : 'DISAGREE'}  ${what}`);
    say(`  oracle: ${ok ? 'AGREE' : 'DISAGREE'} — ${what}`);
  };

  say('NPC — Non-Player Cognition.');
  say('ten agents in a walled yard. The engine is not asked a question about');
  say('them; it derives what each intends, decomposes it, arbitrates the');
  say('conflict with a semiring, and hands one act per agent to the simulator.');
  say();
  say(`grid     ${WIDTH} x ${HEIGHT}, ${PROPS.length} props`);
  say(`agents   ${START.length} (${START.filter((e) => e.kind === 'warden').length} wardens, `
    + `${START.filter((e) => e.kind === 'wolf').length} wolves, ${START.filter((e) => e.kind === 'wisp').length} wisp)`);
  say('acts     move(Dir), strike(E), tend(E), hold');
  say('rules    examples/npc/npc.rofl, loaded next to boot.rofl');

  // -- 0 ---------------------------------------------------------------------
  rule('0. hygiene: what the rest of this transcript rests on');
  const base = head();
  publish(base, START);
  base.evaluate(BUDGET);
  const hy = hygiene(base, STRATA_WATCH);
  say(`  ${hy.rules} rules loaded (boot.rofl + npc.rofl); every one range-restricted: ${hy.allSafe}`);
  say(`  relations evaluated by demand (top-down unfolding): ${hy.demandRels}`);
  say(`  unstratified: ${hy.unstratified.length === 0 ? '(none)' : hy.unstratified.join(' ')}`);
  say(`  boot.rofl's audits over NPC's own reflection: `
    + Object.entries(hy.audits).map(([k, n]) => `${k} ${n}`).join(', '));
  if (!hy.allSafe || hy.demandRels > 0 || hy.unstratified.length > 0) {
    throw new Error('npc: hygiene failed; the rest of the transcript is about a different program');
  }
  say();
  say('  a rule that reads one agent\'s journal and writes the shared book of');
  say('  deliberation crosses two ledgers, and the crossing is declared: the');
  say('  explicit head perspective emits bridge_decl, which is why leak is 0');
  say('  above rather than a number the reader has to forgive.');
  say();
  say('  the strata boot.rofl computed, not an order this file assumed:');
  for (const s of hy.strata) say(`    ${s.rel.padEnd(12)} ${s.level}`);

  // -- 1 ---------------------------------------------------------------------
  rule('1. the yard at tick 1');
  for (const line of render(START)) say(line);
  say();
  say('  W = warden, w = wolf, * = wisp, ## = a prop that blocks sight and feet');
  say();
  say('  npc_1 at (2,4) and npc_5 at (4,5) are within sight of each other, and');
  say('  cart_3 stands between them. npc_5 is bleeding. npc_1 does not know:');
  const seen1 = col(base, 'saw[npc_1](E, K, X, Y, B, T)', 'E').sort();
  say(`    npc_1's whole journal:   ${seen1.join(', ')}`);
  say(`    in_range npc_1 -> npc_5: ${base.holds('in_range[world](npc_1, npc_5, 4, 5)')}  (so it is not distance)`);
  say(`    in_sight npc_1 -> npc_5: ${base.holds('in_sight[mind](npc_1, npc_5)')}`);
  say(`    screened by:             ${col(base, 'screened[world](npc_1, npc_5, P)', 'P').join(', ')}`);
  say();
  say('  AND THE MISSING LINE IS WORTH SOMETHING. Give npc_1 that one sighting');
  say('  — one fact in its own journal, the world untouched — and re-derive:');
  const informed = head();
  publish(informed, START);
  must(informed.assert('saw[npc_1](npc_5, warden, 4, 5, hurt, 0).', { who: 'npc_1' }), 'the sighting');
  settle(informed);
  const blindIntents = col(base, 'intent[mind](npc_1, G, P)', 'G').sort();
  const seeingIntents = col(informed, 'intent[mind](npc_1, G, P)', 'G').sort();
  say(`    npc_1's intents without it: ${blindIntents.join(', ')}`);
  say(`    npc_1's intents with it:    ${seeingIntents.join(', ')}`);
  say(`    and a hole it did not have: `
    + rows(informed, 'uncovered[audit](npc_1, no_action, S)').map((x) => `uncovered(npc_1, no_action, ${x.S})`).join(', '));
  say('  the world is identical in both. The perspective is the whole');
  say('  difference, and the difference reaches all the way to a commitment.');
  check('one line in one agent\'s journal changes what that agent concludes, with the world unchanged',
    base.holds('in_range[world](npc_1, npc_5, 4, 5)')
    && !base.holds('in_sight[mind](npc_1, npc_5)')
    && col(base, 'screened[world](npc_1, npc_5, P)', 'P').includes('cart_3')
    && blindIntents.length < seeingIntents.length
    && rows(informed, 'uncovered[audit](npc_1, no_action, S)').length > 0);

  // -- 2 ---------------------------------------------------------------------
  rule('2. the loop the kernel would not close, and now does');
  say('the obvious way to write this example is to make the world transition');
  say('rules too — `at[world](..) @next :- does[mind](..)`. Then sensing reads');
  say('at[world], deliberation reads sensing through `not`, and the transition');
  say('writes at[world]. That used to be refused: stratification was computed');
  say('on a graph that did not know a conclusion\'s TENSE, so a loop acyclic in');
  say('TIME read as a negative cycle. `not p` now means "p is not derivable in');
  say('THIS TICK", and a @next head contributes no same-tick edge.');
  say();
  say('READ THE SECOND REFUSAL CLOSELY: it names FIVE relations where the old');
  say('one named two. The old refusal was `unstratified[main](at, does)` --');
  say('boot.rofl derived `unstratified/1` as the relations sitting ON the');
  say('negative cycle, and only those. The schedule is now peeled off the');
  say('decoded rules before anything fires, and a round that settles nothing');
  say('reports everything still standing: `at` and `does` are on the cycle,');
  say('and `knows`, `saw` and `settled` negate something that never settles,');
  say('so no round can ever contain them either. They are uncomputable for a');
  say('DERIVED reason rather than a structural one, and the old verdict was');
  say('silent about them -- it would have named two relations in a program');
  say('where five have no value. The price is on the other side: the refusal');
  say('no longer carries the `reach` trace that showed WHY, because there is');
  say('no `reach` any more. Wider answer, thinner explanation.');
  say();
  const lp = loopProbe();
  say(`  with the transition as @next rules:  load ok = ${lp.closedOk}  ${lp.closedDiag}`);
  say(`    and one tick later the world moved: ${lp.moved.join('; ')}`);
  say(`  the SAME transition without @next:   load ok = ${lp.sameTickOk}`);
  say(`    ${lp.sameTickDiag}`);
  say(`  the same program with no transition: load ok = ${lp.openOk}  ${lp.openDiag}`);
  say(`    and it derives: ${lp.openDerives.join('; ')}`);
  say();
  say('  the second line is the positive control, and it is one word away from');
  say('  the first: a kernel that had merely stopped checking would accept it');
  say('  too. The third is the other control — the arms must differ for a');
  say('  reason, not because all three failed for some fourth one.');
  check('the kernel closes the loop across a tick, still refuses it inside one, and the world it computes is right',
    lp.closedOk === true && lp.sameTickOk === false
    && /settled nothing while at, does, knows, saw, settled remained/.test(lp.sameTickDiag)
    && lp.openOk === true && lp.openDerives.length > 0
    && lp.moved.join('; ') === 'E = npc_1, X = 2, Y = 1; E = npc_7, X = 3, Y = 1');

  // -- 3 ---------------------------------------------------------------------
  rule('3. intents are facts, and a plan is a fixpoint');
  say('nothing here is a data structure inside an agent. A drive fires an');
  say('intent, an intent decomposes into a subgoal, a subgoal is an intent');
  say('again, and options are what an intent can reach. All of it is in the');
  say('store, so all of it has a derivation tree.');
  say();
  const it = rows(base, 'intent[mind](A, G, P)');
  say(`  ${it.length} intents at tick 1:`);
  for (const x of it) say(`    intent[mind](${x.A}, ${x.G}, ${x.P})`);
  say();
  say('  and the tree under one of them — the whole path from a drive in the');
  say('  table to a commitment to hit something:');
  clip(base.why('intent[mind](npc_4, drive_off(npc_8), 65)').text, 22);

  // -- 4 ---------------------------------------------------------------------
  rule('4. the conflict, and the semiring that resolves it');
  const { fold } = settle(base);
  say('npc_4 stands next to npc_8. Two intents reach an act, and they do not');
  say('agree. The arbiter is a Viterbi fold over the support the kernel');
  say('already recorded: one factor per decomposition step, ⊕ = max over');
  say('alternative derivations of the same act.');
  say();
  const four = [...fold.option.entries()].filter(([k]) => k.includes('(npc_4,')).sort();
  for (const [k, v] of four) {
    const p = parseKey(k)!;
    say(`    ${p.args[1].padEnd(14)} from ${p.args[2].padEnd(16)} ${pct(v)}`);
  }
  say();
  say('  by hand from the drive table: repel 65 reaches strike in TWO steps');
  say(`  (0.65 x 0.65 = ${(0.65 * 0.65).toFixed(4)}), hold_post 40 reaches hold in ONE (0.4000).`);
  say(`  chosen: ${chosen(base).filter((a) => a.agent === 'npc_4').map((a) => a.act).join(', ')}`);
  const strike4 = fold.option.get('option[mind](npc_4,strike(npc_8),drive_off(npc_8))');
  const hold4 = fold.option.get('option[mind](npc_4,hold,hold_post)');
  check('the fold reproduces the arithmetic of the drive table exactly',
    strike4 !== undefined && hold4 !== undefined
    && Math.abs(probabilityOf(strike4) - 0.4225) < 1e-4
    && Math.abs(probabilityOf(hold4) - 0.4) < 1e-4);
  say();
  say('  THE POINT, and it is not that 65 > 40. Drop repel to 62 — still far');
  say('  above hold_post, priority ORDER unchanged — and the act flips,');
  say('  because two steps of 0.62 are worth less than one of 0.40:');
  // a SECOND drive row for repel would be a second route and ⊕ = max would
  // keep the stronger one, which is the semiring behaving correctly and not
  // the experiment we want. So the one number is edited in the text.
  const SOFT_NPC = NPC.replace('drive[world](warden, repel,        65) @init.',
    'drive[world](warden, repel,        62) @init.');
  const soft2 = new Rofl();
  must(soft2.load(BOOT, { budget: BUDGET }), 'boot.rofl');
  must(soft2.load(SOFT_NPC, { who: 'sim', budget: BUDGET }), 'npc.rofl at repel 62');
  publish(soft2, START);
  const softFold = settle(soft2).fold;
  for (const [k, v] of [...softFold.option.entries()].filter(([k]) => k.includes('(npc_4,')).sort()) {
    const p = parseKey(k)!;
    say(`    ${p.args[1].padEnd(14)} from ${p.args[2].padEnd(16)} ${pct(v)}`);
  }
  say(`  chosen at repel 62: ${chosen(soft2).filter((a) => a.agent === 'npc_4').map((a) => a.act).join(', ')}`);
  const hard = chosen(base).find((a) => a.agent === 'npc_4')?.act;
  const softAct = chosen(soft2).find((a) => a.agent === 'npc_4')?.act;
  check('one priority moved from 65 to 62, the order unchanged, and the act flips',
    hard === 'strike(npc_8)' && softAct === 'hold');

  // -- 5 ---------------------------------------------------------------------
  rule('5. why, and why-not');
  say('the most hated question in game AI is "why did it not do the obvious');
  say('thing". A behaviour tree cannot answer it in principle — you can see');
  say('which node ran, never why another did not. Here it is a query.');
  say();
  const wn = base.whynot('does[mind](npc_4, hold)', { depth: 3 });
  for (const l of wn.text.split('\n')) say('  ' + l);
  say();
  say('  npc_3 can see npc_5 bleeding two cells away. Why is it not binding');
  say('  the wound? Not "which node ran" — which premise failed:');
  const wn2 = base.whynot('option[mind](npc_3, tend(npc_5), tend(npc_5))', { depth: 3 });
  clip(wn2.text, 14, '  ');
  say();
  say('  and the spec\'s own example: an ally in range, unseen, and the thing');
  say('  in the way is NAMED rather than reported as a false:');
  const wn3 = base.whynot('in_sight[mind](npc_1, npc_5)', { depth: 4 });
  clip(wn3.text, 16, '  ');
  check('whynot names the premise that failed and the prop that blocked it',
    /failed premise/.test(wn.text) && /failed premise/.test(wn2.text)
    && /cart_3/.test(wn3.text));

  // -- 6 ---------------------------------------------------------------------
  rule('6. the run');
  const sim = runSim({ ticks: TICKS });
  say(`  ${sim.ticks.length} ticks, ${sim.ms} ms`);
  say();
  for (const t of sim.ticks) {
    const acts = t.acts.map((a) => `${a.agent}:${a.act}`).join(' ');
    say(`  tick ${String(t.tick).padStart(2)}  ${acts}`);
    for (const e of t.events) say(`          ${e}`);
  }
  say();
  say('  the yard at the end:');
  for (const line of render(sim.ents)) say(line);

  // -- 7 ---------------------------------------------------------------------
  rule('7. the frame budget');
  const cost1 = firings(head(''), BUDGET);
  const full = head();
  publish(full, START);
  const costFull = firings(full);
  say(`  a full re-evaluation with nobody in the yard costs ${cost1} firings;`);
  say(`  with the ten agents in it at tick 1, ${costFull}.`);
  say();
  const coldTick = restore(sim, 3);
  const coldCost = firings(coldTick);
  say(`  a tick THOUGHT FROM COLD — a store restored at tick 3, whose derived`);
  say(`  layer has to be rebuilt from the base facts — costs ${coldCost}.`);
  say();
  const starved = restore(sim, 3);
  starved.evaluate(FRAME);
  const holeIds = rows(starved, 'hole(Id, budget_exhausted)').map((x) => x.Id);
  say(`  the same tick at a frame budget of ${FRAME} firings:`);
  say(`    partial: ${starved.store.partialEval}`);
  say(`    hole(Id, budget_exhausted): ${holeIds.join(', ') || '(none)'}`);
  say(`    and what it reached anyway:  ${rows(starved, 'saw[npc_4](E, K, X, Y, B, T)').length} sightings for npc_4, `
    + `${rows(starved, 'intent[mind](A, G, P)').length} intents, `
    + `${rows(starved, 'option[mind](A, Act, G)').length} options`);
  say();
  say('  the marker is a FACT and not a log line, so the next frame can read');
  say('  it. It cannot read it in the frame that wrote it — deriving');
  say('  thought_partial[audit] is itself a firing, and there were none left:');
  const partialMark0 = col(starved, 'thought_partial[audit](Id)', 'Id');
  starved.store.dirty = true;
  starved.evaluate(BUDGET);
  const partialMark1 = col(starved, 'thought_partial[audit](Id)', 'Id');
  say(`    thought_partial[audit] inside the exhausted frame: ${partialMark0.join(', ') || '(none)'}`);
  say(`    thought_partial[audit] on the next evaluation:     ${partialMark1.join(', ') || '(none)'}`);
  say();
  say('  and the partial answer is still an answer: what it reached is in the');
  say('  store and queryable, and the marker says the rest was not reached');
  say('  rather than that there was no rest.');
  check('an exhausted frame budget yields a marked partial answer, not a hang and not rubbish',
    holeIds.length > 0 && partialMark0.length === 0 && partialMark1.length > 0);

  // -- 8 ---------------------------------------------------------------------
  rule('8. the hole, and the rule the agent writes for it');
  const holes = sim.ticks.flatMap((t) => t.uncovered.map((u) => ({ ...u, tick: t.tick })));
  const noAction = holes.filter((h) => h.reason === 'no_action');
  say(`  ${holes.length} holes over ${sim.ticks.length} ticks, of two shapes:`);
  for (const reason of ['no_action', 'unclassified']) {
    const hs = holes.filter((h) => h.reason === reason);
    const who = [...new Set(hs.map((h) => `${h.agent} ${h.subject}`))].sort();
    say(`    ${reason.padEnd(14)} ${hs.length}  ${who.slice(0, 4).join(', ')}${who.length > 4 ? ', ...' : ''}`);
  }
  say();
  say('  an uncovered situation is a FACT, not a fallback. npc_3 can see npc_5');
  say('  bleeding two cells away, holds the subgoal tend(npc_5), and no rule in');
  say('  the file reaches an act for it — so it says so and does something else.');
  say();
  const prop = proposeRule(noAction);
  if (prop === null) throw new Error('npc: no rule proposed; the transcript below is about nothing');
  say('  generalised from:');
  for (const f of prop.from) say(`    ${f}`);
  say();
  for (const l of prop.text.trimEnd().split('\n')) say('    ' + l);
  say();
  say('  THE HONEST BOUNDARY. Choosing that template is a generative step and');
  say('  the kernel does not perform it. What the kernel guarantees is that the');
  say('  rule is recorded as facts like any other, applied to the WHOLE PAST on');
  say('  the next evaluation, judged by boot.rofl\'s audits, and diffable. It');
  say('  does not guarantee the rule is sensible. Same boundary as JOPA: the');
  say('  model proposes, the kernel answers for consequences.');
  say();
  say('  applied to the past — the store as it was at tick 1, re-derived with');
  say('  the new rule in it:');
  const past = restore(sim, 1, prop.text);
  past.evaluate(BUDGET);
  say(`    uncovered(npc_3, no_action, tend(npc_5)) at tick 1 before: ${sim.ticks[0].uncovered.some((u) => u.agent === 'npc_3' && u.reason === 'no_action')}`);
  say(`    ... and after:                                            ${past.holds('uncovered[audit](npc_3, no_action, tend(npc_5))')}`);
  say(`    options npc_3 now has for tend(npc_5): `
    + col(past, 'option[mind](npc_3, Act, tend(npc_5))', 'Act').join(', '));
  check('a rule written after the run closes the hole in the store of tick 1',
    sim.ticks[0].uncovered.some((u) => u.agent === 'npc_3' && u.reason === 'no_action')
    && !past.holds('uncovered[audit](npc_3, no_action, tend(npc_5))')
    && col(past, 'option[mind](npc_3, Act, tend(npc_5))', 'Act').length > 0);

  say();
  say(`  and what it does to behaviour — the same ${TICKS} ticks, same start:`);
  const learned = runSim({ ticks: TICKS, extra: prop.text });
  const before = sim.ticks.map((t) => t.acts.find((a) => a.agent === 'npc_3')?.act ?? '-');
  const after = learned.ticks.map((t) => t.acts.find((a) => a.agent === 'npc_3')?.act ?? '-');
  say(`    npc_3 before: ${before.join(' ')}`);
  say(`    npc_3 after:  ${after.join(' ')}`);
  const hpBefore = sim.ents.find((e) => e.id === 'npc_5')?.hp ?? 0;
  const hpAfter = learned.ents.find((e) => e.id === 'npc_5')?.hp ?? 0;
  say(`    npc_5's hp at the end: ${hpBefore} before, ${hpAfter} after`);
  const holesAfter = learned.ticks.flatMap((t) => t.uncovered).filter((u) => u.reason === 'no_action').length;
  say(`    no_action holes: ${noAction.length} before, ${holesAfter} after`);
  check('the new rule changes what the agent does and closes the holes it was generalised from',
    before.join(' ') !== after.join(' ') && holesAfter < noAction.length);

  // -- 9 ---------------------------------------------------------------------
  rule('9. the rule set, diffed');
  const b4 = ruleIds(restore(sim, 1));
  const aft = ruleIds(restore(sim, 1, prop.text));
  const d = ruleSetDiff(b4, aft);
  say(`  rules in the head at tick 1: ${b4.size}`);
  say(`  after the agent writes one:  ${aft.size}`);
  say(`  added:   ${d.added.join(', ') || '(none)'}`);
  say(`  removed: ${d.removed.join(', ') || '(none)'}`);
  say(`  kept:    ${d.kept}`);
  const byText = ruleIdOf(parseProgram(prop.text)[0]);
  say(`  and the id recomputed from the text alone: ${byText}`);
  check('the diff of two store snapshots names exactly the rule the text hashes to',
    d.added.length === 1 && d.removed.length === 0 && d.added[0] === byText);
  say();
  say('  examples/loot diffs two EDITIONS OF A PACK by hashing two texts; this');
  say('  diffs two SNAPSHOTS OF ONE HEAD by reading rule(R) out of the store.');
  say('  Same identity function, different source. LOOT\'s finding transfers');
  say('  and is not re-litigated: renaming a variable changes the id. Once,');
  say('  with a positive control, so that "no change" is a measurement:');
  const renamed = prop.text.replace(/\bD1\b/g, 'Z1').replace(/\bD0\b/g, 'Z0');
  const idRenamed = ruleIdOf(parseProgram(renamed)[0]);
  const reflowed = prop.text.replace(/\n\s+/g, ' ');
  const idReflowed = ruleIdOf(parseProgram(reflowed)[0]);
  say(`    same rule, two variables renamed:   ${idRenamed}  ${idRenamed === byText ? 'SAME' : 'DIFFERENT'}`);
  say(`    same rule, whitespace reflowed:     ${idReflowed}  ${idReflowed === byText ? 'SAME' : 'DIFFERENT'}`);
  check('a rename changes the rule id and a reflow does not — the control that makes the first half a measurement',
    idRenamed !== byText && idReflowed === byText);

  // -- 10 --------------------------------------------------------------------
  rule('10. time: restoring a tick, and when a thing was last derivable');
  const target = 'does[mind](npc_4, strike(npc_8))';
  const ld = lastDerivable(sim, target);
  say(`  ? ${target}`);
  say(`    held at ticks:     ${ld.held.join(', ') || '(never)'}`);
  say(`    did not hold at:   ${ld.missed.join(', ') || '(always)'}`);
  say(`    last derivable at: ${ld.tick ?? '(never)'}`);
  if (ld.tick !== null && ld.tick < sim.ticks[sim.ticks.length - 1].tick) {
    const after1 = restore(sim, ld.tick + 1);
    say(`    and at tick ${ld.tick + 1} the reason it stopped:`);
    for (const l of after1.whynot(target, { depth: 2 }).text.split('\n').slice(0, 8)) say('      ' + l);
  }
  say();
  say('  the restoration is not a replay of a log: Store.restore comes back');
  say('  dirty, so the derived layer is recomputed from the base facts. That is');
  say('  what lets §8 apply a rule written after the run to the store of tick 1.');
  const t3 = restore(sim, 3);
  say(`    store restored at tick 3: tick = ${t3.store.tick}, `
    + `${rows(t3, 'at[world](E, X, Y)').length} agents, `
    + `${rows(t3, 'saw[npc_3](E, K, X, Y, B, T)').length} entries in npc_3's journal`);
  check('a restored tick re-derives rather than replays, and the scan agrees with the run',
    t3.store.tick === 3 && ld.held.length > 0
    && ld.held.every((t) => sim.ticks.find((x) => x.tick === t)!.acts
      .some((a) => a.agent === 'npc_4' && a.act === 'strike(npc_8)')));

  // -- 11 --------------------------------------------------------------------
  rule('11. memory, and acting on a memory');
  const stale = sim.ticks.flatMap((t) =>
    rows(restore(sim, t.tick), 'stale[audit](A, E, Age)')
      .map((x) => ({ tick: t.tick, who: x.A, what: x.E, age: Number(x.Age) })));
  const worst = stale.filter((s) => s.age >= 3).slice(0, 6);
  say(`  ${stale.length} stale beliefs over the run (a belief whose sighting is older`);
  say('  than the current tick). The oldest of them:');
  for (const s of worst) say(`    tick ${s.tick}: ${s.who} still places ${s.what} where it was ${s.age} ticks ago`);
  say();
  say('  this is not a defect to be fixed. It is the only honest thing a fog of');
  say('  war can produce, and it is why `recalls` carries the tick it was');
  say('  stamped with rather than pretending to be the world.');

  // -- 12 --------------------------------------------------------------------
  rule('12. throughput, whatever it is');
  say('  measured at the TOP of this program, on a cold heap, before anything');
  say('  else allocated — and the reason for that is measured too, below.');
  say();
  for (const b of bench) {
    say(`  ${b.label.padEnd(44)} ${String(b.ms).padStart(7)} ms  `
      + `${(b.ms / b.ticks.length).toFixed(0).padStart(5)} ms/tick  `
      + `${(1000 * b.ticks.length / b.ms).toFixed(1)} ticks/s`);
  }
  const warm = bench[0];
  say();
  say('  AND IT IS NOT A CONSTANT, which the average hides. The first tick and');
  say('  the last are the numbers a frame budget would have to live with:');
  say();
  say(`  ${'tick'.padStart(6)}${'ms'.padStart(8)}${'ticks/s'.padStart(9)}${'facts'.padStart(9)}${'derived'.padStart(9)}`);
  for (const t of warm.ticks) {
    say(`  ${String(t.tick).padStart(6)}${String(t.ms).padStart(8)}`
      + `${(t.ms > 0 ? (1000 / t.ms).toFixed(1) : '-').padStart(9)}`
      + `${String(t.facts).padStart(9)}${String(t.derived).padStart(9)}`);
  }
  const bFirst = warm.ticks[0], bLast = warm.ticks[warm.ticks.length - 1];
  say();
  say(`  ${(1000 / bFirst.ms).toFixed(1)} ticks per second at the first tick, `
    + `${(1000 / bLast.ms).toFixed(1)} at tick ${bLast.tick}, ten agents throughout.`);
  say('  That is the honest headline and it is not a good number.');
  say();
  say('  WHERE THE FACTS COME FROM, since the answer is not the yard. What');
  say('  grows between tick 1 and tick 4, counted by relation:');
  const tallyAt = (r: Rofl) => {
    const m = new Map<string, number>();
    for (const f of r.store.facts.values()) m.set(f.rel, (m.get(f.rel) ?? 0) + 1);
    return m;
  };
  const g1 = tallyAt(restore(sim, 1));
  const g4 = tallyAt(restore(sim, Math.min(4, TICKS - 1)));
  const growth = new Map<string, number>();
  for (const [rel, n] of g4) growth.set(rel, n - (g1.get(rel) ?? 0));
  for (const [rel, d] of [...growth.entries()].filter(([, x]) => x > 0)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    say(`    ${rel.padEnd(16)} +${d}`);
  }
  say();
  say('  `derived_by` is the kernel\'s own provenance — one fact per firing —');
  say('  and `advanceTick` freezes it so a completed tick keeps its record.');
  say('  That is a deliberate guarantee and it is also the cost curve: every');
  say('  fold, the arbiter\'s included, walks the whole store. The second');
  say('  benchmark row is that claim measured from the other side: dropping the');
  say(`  provenance of completed ticks takes the run from ${bench[0].ms} ms to `
    + `${bench[1].ms} ms, a factor of ${(bench[0].ms / Math.max(1, bench[1].ms)).toFixed(2)}.`);
  say();
  say('  Which is the honest shape of the trade. Keeping the reasons is the');
  say('  point of the whole system, and keeping them is what makes tick 8 cost');
  say('  what tick 1 did not. A game would prune, and would then be a game');
  say('  that cannot say why its NPC did anything three seconds ago.');
  say();
  say('  AND THE METHOD, measured rather than asserted. The first row above was');
  say('  taken on a cold heap. Here is the identical run, taken now, after this');
  say('  transcript has built four worlds and retained sixteen snapshots:');
  const late = runSim({ ticks: TICKS, snapshots: false });
  say(`    same run, cold heap:  ${bench[0].ms} ms`);
  say(`    same run, right now:  ${late.ms} ms  (x${(late.ms / Math.max(1, bench[0].ms)).toFixed(2)})`);
  say('  a throughput number taken at the end of a demo is a number about the');
  say('  demo\'s heap. That is why the benchmark runs first.');
  check('pruning completed-tick provenance is measurably the cost curve, not a guess',
    bench[1].ms < bench[0].ms
    && bench[0].ticks[bench[0].ticks.length - 1].facts > 2 * bench[0].ticks[0].facts);

  // -- 13 --------------------------------------------------------------------
  rule('13. counting across ticks, and what a cycle is a cycle IN');
  const c0 = countProbe(head());
  const c3 = countProbe(restore(sim, 3));
  say('  a carry rule makes every carried fact its own support one tick back,');
  say('  and that self-loop used to meet the CLOSED counting semiring: star(one)');
  say('  is INFINITE, so past tick 0 the count of anything downstream of memory');
  say('  was "infinitely many" — a correct answer to a question nobody asked.');
  say('  The fold is about ONE tick now, on the same principle that fixed the');
  say('  meaning of `not p`: a fact that arrived over the boundary is a GIVEN');
  say('  in the tick that reads it, so the edge back is not walked.');
  say();
  say(`  ${'store'.padEnd(22)}${'finite'.padStart(9)}${'infinite'.padStart(10)}${'on a cycle'.padStart(12)}${'in memory'.padStart(11)}`);
  say(`  ${'tick 0, nobody in it'.padEnd(22)}${String(c0.finite).padStart(9)}${String(c0.infinite).padStart(10)}${String(c0.cyclic).padStart(12)}${String(c0.memory).padStart(11)}`);
  say(`  ${'tick 3 of the run'.padEnd(22)}${String(c3.finite).padStart(9)}${String(c3.infinite).padStart(10)}${String(c3.cyclic).padStart(12)}${String(c3.memory).padStart(11)}`);
  say(`  still INFINITE, e.g. ${c3.sample.join(', ') || '(nothing at all)'}`);
  say();
  say('  the clock no longer moves the last three columns, and the fold has not');
  say('  gone blind to cycles: what stays INFINITE is boot.rofl\'s own closure');
  say('  (reach/stratum), a cycle inside ONE tick, which is what the number is');
  say('  for. examples/oops now agrees fact for fact between its ticked store');
  say('  and its as-of one. NPC could not route around this — restoring a tick');
  say('  is one of the things it is for — and no longer has to.');
  check('the clock does not change what is countable, and what stays INFINITE is a cycle inside one tick',
    c0.infinite === c3.infinite && c0.cyclic === c3.cyclic && c3.infinite > 0
    && c0.memory === 0 && c3.memory === 0 && fold.converged && fold.disciplineHeld);

  // -- 14 --------------------------------------------------------------------
  rule('14. the oracles');
  let bad = 0;
  for (const c of checks) { say('  ' + c); if (c.startsWith('DISAGREE')) bad++; }
  say();
  say(`${checks.length - bad}/${checks.length} agree.`);
  say(`(${Date.now() - t0} ms)`);
  if (bad > 0) process.exitCode = 1;
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1]
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();
