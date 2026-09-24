// sim.ts — the NPC yard with no file in it: the roster, the store, the arbiter, the physics and the rule the agent proposes.
// examples/npc/demo.ts reads the files and prints the transcript; the playground runs this in a browser.
import { Rofl } from '../../src/api.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import { viterbiSemiring, logProbOf, IMPOSSIBLE, type LogProb } from '../../runtime/semirings.ts';

/** The demo's own bookkeeping budget, generous: it is not the agents'. */
export const BUDGET = 4_000_000;

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

export function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`npc: ${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

/** boot.rofl + npc.rofl, given as text so this runs where no file can be read. boot.rofl is here for real work: it computes
 *  `stratum/2` over every rule, including one the agent writes at runtime,
 *  and its audits judge that rule the same way they judge the file. */
export function head(boot: string, npc: string, extra: string = ''): Rofl {
  const r = new Rofl();
  must(r.load(boot, { budget: BUDGET }), 'boot.rofl');
  must(r.load(npc, { who: 'sim', budget: BUDGET }), 'npc.rofl');
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

