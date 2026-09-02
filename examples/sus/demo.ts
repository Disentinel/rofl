// demo.ts — SUS: suspicion under semirings, end to end.
//
//   node --experimental-strip-types examples/sus/demo.ts
//
// Everything printed here is computed by the kernel from examples/sus/sus.rofl.
// Nothing in the transcript is composed by hand; README.md and page.html paste
// this program's stdout.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, tropicalSemiring, unitFiringCost, provenanceSemiring,
  provenanceOf, viterbiSemiring, logProbOf, probabilityOf, clearsThreshold,
  renderCount, renderLogProb, INFINITE, type Count, type LogProb,
} from '../../runtime/semirings.ts';
import type { FoldResult } from '../../src/semiring.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const MODEL = read('examples', 'sus', 'sus.rofl');

/** The round written into sus.rofl as the seed; `asOf` swaps it out. */
export const SEED_ROUND = 1;
export const LAST_ROUND = 6;

/** The standard of proof. A count is a measurement; a threshold on it is a
 *  POLICY, so it lives here and not in the rules — the same separation
 *  `clearsThreshold` makes for the Viterbi carrier. Three worlds in four. */
export const STANDARD = 0.75;

// ---------------------------------------------------------------------------
// loading: one section per writer
//
// `-- @who X` in sus.rofl is a comment to the parser and a section marker to
// this loader. Each player's entries are loaded under that player's identity,
// so `asserted_by` is the load identity checked against `authority` — never a
// column somebody could fill in with any name they liked. Section 3 of the
// transcript is that difference, measured.

export interface Section { who: string; text: string; }

export function sections(text: string): Section[] {
  const out: Section[] = [];
  let who = 'moderator';
  let buf: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^--\s*@who\s+([a-z_]+)\s*$/.exec(line);
    if (m) { out.push({ who, text: buf.join('\n') }); who = m[1]; buf = []; }
    else buf.push(line);
  }
  out.push({ who, text: buf.join('\n') });
  return out.filter((s) => s.text.trim().length > 0);
}

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

/** Loading boot plus ten sections costs about a second, and every arm below
 *  wants its own copy, so the loaded table is snapshotted once and restored
 *  per caller. `Store.restore` marks the store dirty, so a restored table
 *  still evaluates and still ticks. */
let TEMPLATE: string | null = null;

function build(): Rofl {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  for (const s of sections(MODEL)) must(r.load(s.text, { who: s.who }), `sus.rofl [@who ${s.who}]`);
  return r;
}

/** A table at round 1, ready to be run forward. */
export function world(): Rofl {
  if (TEMPLATE === null) TEMPLATE = build().save();
  return Rofl.fromSnapshot(TEMPLATE);
}

/** The same table evaluated directly AT a round, with no ticks run: the same
 *  ledgers, a different clock. "What did we know in round 3" as one query
 *  rather than a simulation.
 *
 *  It used to be more than a convenience: per examples/oops it was the ONLY
 *  store the semiring folds could be taken over, because the `@next` carry
 *  rules make every carried fact its own support one tick back and the CLOSED
 *  counting instance read that as "infinitely many". That is settled — the
 *  fold is about one tick, so a carried fact is a given in it — and section 9
 *  now measures the agreement rather than the trap. What as-of still cannot
 *  give you is what the ticked store DERIVED at a past tick; that is frozen
 *  provenance, and section 9 measures that too. */
const AS_OF = new Map<number, Rofl>();

export function asOf(round: number): Rofl {
  const hit = AS_OF.get(round);
  if (hit) return hit;
  const r = world();
  if (!r.retract(`now[public](${SEED_ROUND})`).ok) throw new Error('round seed not found');
  must(r.assert(`now[public](${round}).`, { who: 'moderator' }), `now(${round})`);
  r.evaluate();
  AS_OF.set(round, r);
  return r;
}

/** The table run forward one tick per round. */
export function simulateTo(round: number): Rofl {
  const r = world();
  r.run({ maxTicks: round - SEED_ROUND });
  r.evaluate();
  return r;
}

/** One run through all six rounds, recording at every tick boundary what an
 *  observer could see there. Running the ticks costs a full evaluation per
 *  round, so it is done once: the per-round stores are never rebuilt, and
 *  what the transcript needs from a past tick is taken at the tick. */
export interface TickTrace {
  facts: Map<number, string[]>;
  counts: Map<number, FoldResult<Count>>;
  final: Rofl;
}

let TRACE: TickTrace | null = null;

export function simulate(countAt: number[] = [3]): TickTrace {
  if (TRACE) return TRACE;
  const facts = new Map<number, string[]>();
  const perRound = new Map<number, FoldResult<Count>>();
  const r = world();
  const snap = (x: Rofl): void => {
    const round = Number(col(x, 'now[public](T)', 'T')[0]);
    if (facts.has(round)) return;
    facts.set(round, domainFacts(x));
    if (countAt.includes(round)) {
      perRound.set(round, evaluateSemiring(x.store, countingSemiring));
    }
  };
  r.run({ maxTicks: LAST_ROUND - SEED_ROUND, onBoundary: snap });
  r.evaluate();
  snap(r);
  TRACE = { facts, counts: perRound, final: r };
  return TRACE;
}

// ---------------------------------------------------------------------------
// small helpers over query results

export const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => x.bindings[v]);
export const pairs = (r: Rofl, q: string, a: string, b: string): [string, string][] =>
  r.query(q).rows.map((x) => [x.bindings[a], x.bindings[b]] as [string, string]);
const list = (xs: string[]): string => (xs.length === 0 ? '(none)' : xs.join(', '));
const indent = (s: string, n: number) => s.split('\n').map((l) => ' '.repeat(n) + l).join('\n');

/** Domain facts only: what an observer of this table can see. Kernel
 *  reflection, boot's audits and provenance are excluded. */
const DOMAIN = /^(said|claim|claimant|sighting|vouching|charge|stated|live|annulled|clash|conflict|dead|world|traitor_in|crew_in|refuted_by|elsewhere|impossible|consistent|guilty_in|outcome|price|clears|incriminates|points_at|case_against|rests_on|leaf|gone|standing|at_risk|shaken|lie|stance|scanned|weighed|now|player|kill|exposed|ejected|withdrawn)\[/;
export const domainFacts = (r: Rofl): string[] =>
  r.factKeys().filter((k) => DOMAIN.test(k)).sort();

export const PLAYERS = ['red', 'blue', 'green', 'pink', 'cyan', 'lime', 'white', 'black'];

// ---------------------------------------------------------------------------
// rendering a claim the way a person would say it

export interface ClaimRow { id: string; by: string; content: string; about: string; at: string; }

export function claims(r: Rofl): ClaimRow[] {
  return r.query('said[P](K, C, About, At)').rows
    .map((x) => ({
      id: x.bindings.K, by: x.bindings.P, content: x.bindings.C,
      about: x.bindings.About, at: x.bindings.At,
    }))
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/** `saw(green,electrical)` -> `saw green in electrical`. The content is a
 *  term, so this is decoding a canonical rendering, not parsing prose. */
export function say(content: string, about: string): string {
  const m = /^([a-z_]+)\((.*)\)$/.exec(content);
  if (!m) return content === 'alone' ? `was doing tasks alone in round ${about}` : content;
  const args = m[2].split(',');
  if (m[1] === 'saw') return `saw ${args[0]} in ${args[1]} in round ${about}`;
  if (m[1] === 'vouch') return `watched ${args[0]} finish a visual task in round ${about}`;
  if (m[1] === 'accuse') return `saw ${args[0]} kill in round ${about}`;
  return content;
}

export const claimLine = (c: ClaimRow): string =>
  `${c.id.padEnd(4)} ${c.by.padEnd(6)} said in r${c.at}: ${say(c.content, c.about)}`;

// ---------------------------------------------------------------------------
// the metric: model counting over the support hypergraph
//
// `outcome(guilty, P)` has one derivation per consistent world in which P is
// a traitor; `outcome(any, P)` has one per consistent world. Their ratio is
// the suspicion. Both come out of ONE fold of the counting semiring over the
// support the Boolean engine already recorded — nothing is re-derived, and
// the query language is not extended.

export interface Suspicion { player: string; guilty: bigint; total: bigint; share: number; }

const COUNTS = new WeakMap<Rofl, FoldResult<Count>>();

/** One counting fold per store, kept: every arm below asks it something. */
export function counting(r: Rofl): FoldResult<Count> {
  let v = COUNTS.get(r);
  if (!v) { v = evaluateSemiring(r.store, countingSemiring); COUNTS.set(r, v); }
  return v;
}

export function suspicion(r: Rofl): Suspicion[] {
  const value = counting(r).value;
  const num = (k: string): bigint => {
    const v = value.get(k);
    if (v === INFINITE) throw new Error(`${k} counted INFINITE: a support cycle, not a world count`);
    return v ?? 0n;
  };
  return PLAYERS.map((p) => {
    const guilty = num(`outcome[case](guilty,${p})`);
    const total = num(`outcome[case](any,${p})`);
    return { player: p, guilty, total, share: total === 0n ? 0 : Number(guilty) / Number(total) };
  });
}

export const shareOf = (r: Rofl, p: string): Suspicion =>
  suspicion(r).find((s) => s.player === p)!;

// ---------------------------------------------------------------------------
// `sus --explain <player>`

export function explain(r: Rofl, target: string): string {
  const s = shareOf(r, target);
  const round = col(r, 'now[public](T)', 'T')[0];
  const out: string[] = [`$ sus --explain ${target}          [round ${round}]`];
  const pct = s.total === 0n ? 0 : 100 - (Number(s.guilty) / Number(s.total)) * 100;
  out.push(`${target} is clean in ${pct.toFixed(0)}% of the worlds still standing`);
  out.push('');
  out.push(`  consistent worlds:            ${s.total}   of 28`);
  out.push(`  worlds where ${target} is a traitor: ${String(s.guilty).padStart(2)}`);
  out.push('');
  const byClaim = new Map<string, string[]>();
  for (const [w, reason] of pairs(r, `price[case](${target}, W, R)`, 'W', 'R')) {
    (byClaim.get(reason) ?? byClaim.set(reason, []).get(reason)!).push(w);
  }
  if (byClaim.size === 0) {
    out.push(`  nothing rules out a world in which ${target} is a traitor.`);
    return out.join('\n');
  }
  out.push(s.guilty === s.total
    ? '  what has cleared them so far, and how many guilty worlds each reason removed:'
    : '  what clears them, and how many guilty worlds each reason removes:');
  const claimOf = new Map(claims(r).map((c) => [c.id, c]));
  for (const [reason, ws] of [...byClaim.entries()]
    .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) {
    const c = claimOf.get(reason);
    const text = c ? `${c.by} said in r${c.at}: ${say(c.content, c.about)}` : reasonText(r, reason);
    out.push(`    ${String(ws.length).padStart(2)}  ${reason.padEnd(18)} ${text}`);
    out.push(`        rules out ${ws.sort().slice(0, 4).join(', ')}`
      + (ws.length > 4 ? ` and ${ws.length - 4} more` : ''));
  }
  const surviving = col(r, `guilty_in[worlds](${target}, W)`, 'W');
  out.push('');
  out.push(`  the ${surviving.length} world${surviving.length === 1 ? '' : 's'} `
    + `where ${target} is still a traitor: ${list(surviving)}`);
  return out.join('\n');
}

/** A refutation reason that is not a claim id: the game log speaking, or a
 *  pair of claims that cannot both stand. */
export function reasonText(r: Rofl, reason: string): string {
  const m = /^([a-z_]+)\((.*)\)$/.exec(reason);
  if (!m) return reason;
  const a = m[2].split(',');
  if (m[1] === 'victim') return `${a[0]} was murdered, and traitors do not murder each other`;
  if (m[1] === 'reveal') return `${a[0]}'s card was shown`;
  if (m[1] === 'clash') {
    const p1 = col(r, `claimant[case](${a[0]}, P)`, 'P')[0];
    const p2 = col(r, `claimant[case](${a[1]}, P)`, 'P')[0];
    return `${p1} and ${p2} contradict each other (${a[0]} vs ${a[1]}), so this world's crew would have lied`;
  }
  if (m[1] === 'nobody_there') return `nobody was left in ${a[0]} in round ${a[1]} to do the killing`;
  return reason;
}

// ---------------------------------------------------------------------------
// `sus -n <player>`: the price of an accusation
//
// For every world in which the target is a traitor, the reasons that rule it
// out. To accuse the target anyway you must declare at least one reason false
// in at least one of those worlds — and the CHEAPEST such set is the price.

export interface Price { world: string; blockers: string[]; }

export function priceOf(r: Rofl, target: string): Price[] {
  const by = new Map<string, string[]>();
  for (const [w, reason] of pairs(r, `price[case](${target}, W, R)`, 'W', 'R')) {
    (by.get(w) ?? by.set(w, []).get(w)!).push(reason);
  }
  return [...by.entries()].map(([w, blockers]) => ({ world: w, blockers: blockers.sort() }))
    .sort((a, b) => a.blockers.length - b.blockers.length || (a.world < b.world ? -1 : 1));
}

export function whynot(r: Rofl, target: string): string {
  const s = shareOf(r, target);
  const round = col(r, 'now[public](T)', 'T')[0];
  const out: string[] = [`$ sus -n ${target}                  [round ${round}]`];
  if (s.guilty > 0n) {
    out.push(`${target} CAN be a traitor: ${s.guilty} of ${s.total} consistent worlds say so.`);
    return out.join('\n');
  }
  out.push(`${target} cannot be a traitor. Every one of the `
    + `${priceOf(r, target).length} worlds that would make them one is ruled out.`);
  out.push('');
  const claimOf = new Map(claims(r).map((c) => [c.id, c]));
  for (const p of priceOf(r, target)) {
    out.push(`  ${p.world.padEnd(16)} ruled out by ${list(p.blockers)}`);
  }
  const all = priceOf(r, target);
  const cheapest = all[0];
  out.push('');
  out.push(`  THE PRICE OF THE ACCUSATION. The cheapest route to "${target} did it" is`);
  out.push(`  ${cheapest.world}, and it costs ${cheapest.blockers.length} `
    + `${cheapest.blockers.length === 1 ? 'retraction' : 'retractions'}. You must declare false:`);
  for (const b of cheapest.blockers) {
    const c = claimOf.get(b);
    out.push(`    ${b.padEnd(18)} ${c ? `${c.by}'s word: ${say(c.content, c.about)}` : reasonText(r, b)}`);
  }
  // and the same question asked of the players only: calling the game log a
  // lie is always available and always uninteresting.
  const isClaim = (b: string) => claimOf.has(b) || b.startsWith('clash(');
  const playersOnly = all.filter((p) => p.blockers.every(isClaim))[0];
  if (playersOnly && playersOnly.world !== cheapest.world) {
    out.push('');
    out.push(`  If the game log stands, the cheapest route is ${playersOnly.world} at `
      + `${playersOnly.blockers.length} retractions: ${list(playersOnly.blockers)}.`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// the Viterbi arm: which consistent world is most likely
//
// Every claim in every consistent world sits in exactly one `stance` box, and
// the fold's per-firing weight hook prices the box: a lie costs deceit(P), a
// traitor who happened not to lie costs 1 - deceit(P), a crew claim and a
// claim not yet made cost nothing. The scan chain in sus.rofl §8 visits every
// claim once per world, so the product along that one derivation is the
// world's score.

export interface Ranked { world: string; score: LogProb; probability: number; }

export function ranking(r: Rofl): Ranked[] {
  const deceit = new Map(pairs(r, 'deceit[public](P, D)', 'P', 'D')
    .map(([p, d]) => [p, Number(d) / 100]));
  const claimant = new Map(pairs(r, 'claimant[case](K, P)', 'K', 'P'));
  const certain = logProbOf(1);
  const w = new Map<string, LogProb>();
  for (const row of r.query('stance[worlds](W, K, S)').rows) {
    const { W, K, S } = row.bindings;
    const d = deceit.get(claimant.get(K)!) ?? 0.5;
    const p = S === 'lied' ? d : S === 'spared' ? 1 - d : 1;
    w.set(`stance[worlds](${W},${K},${S})`, logProbOf(p));
  }
  const fold = evaluateSemiring(r.store, viterbiSemiring,
    { weight: (key) => w.get(key) ?? certain });
  const out: Ranked[] = [];
  for (const world of col(r, 'consistent[worlds](W)', 'W')) {
    const v = fold.value.get(`weighed[worlds](${world})`);
    if (v === undefined) throw new Error(`no weighed fact for ${world}`);
    out.push({ world, score: v, probability: probabilityOf(v) });
  }
  const mass = out.reduce((a, x) => a + x.probability, 0);
  return out.map((x) => ({ ...x, probability: mass === 0 ? 0 : x.probability / mass }))
    .sort((a, b) => b.probability - a.probability);
}

// ---------------------------------------------------------------------------
// THE ORACLE
//
// 28 worlds x 6 rounds is 168 decisions, so exhaustive enumeration is a
// COMPLETE oracle. Every world at every round is decided a second time by a
// direct evaluation of the claim set in plain TypeScript — no engine, no
// rules, no shared code beyond reading the same base facts — and compared on
// the verdict AND on the counting semiring's guilty/total numbers.

interface OClaim { id: string; by: string; kind: string; who: string; room: string; about: number; at: number; }

interface Edb {
  players: string[];
  claims: OClaim[];
  kills: [string, string, number][];
  exposed: [string, string, number][];
  withdrawn: [string, number][];
}

export function readEdb(r: Rofl): Edb {
  const cs: OClaim[] = [];
  for (const row of r.query('said[P](K, C, About, At)').rows) {
    const { P, K, C, About, At } = row.bindings;
    const m = /^([a-z_]+)\((.*)\)$/.exec(C);
    const args = m ? m[2].split(',') : [];
    cs.push({
      id: K, by: P, kind: m ? m[1] : C,
      who: args[0] ?? '', room: args[1] ?? '',
      about: Number(About), at: Number(At),
    });
  }
  return {
    players: r.query('player[public](P, I)').rows
      .sort((a, b) => Number(a.bindings.I) - Number(b.bindings.I)).map((x) => x.bindings.P),
    claims: cs,
    kills: r.query('kill[public](V, R, T)').rows
      .map((x) => [x.bindings.V, x.bindings.R, Number(x.bindings.T)] as [string, string, number]),
    exposed: r.query('exposed[public](P, Ro, T)').rows
      .map((x) => [x.bindings.P, x.bindings.Ro, Number(x.bindings.T)] as [string, string, number]),
    withdrawn: r.query('withdrawn[public](K, T)').rows
      .map((x) => [x.bindings.K, Number(x.bindings.T)] as [string, number]),
  };
}

/** All C(8,2) = 28 role assignments, in the same order the rules generate. */
export function allWorlds(players: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) out.push([players[i], players[j]]);
  }
  return out;
}

class Oracle {
  e: Edb;
  constructor(e: Edb) { this.e = e; }

  private annulled(c: OClaim, now: number): boolean {
    if (this.e.withdrawn.some(([id, t]) => id === c.id && t <= now)) return true;
    return this.e.exposed.some(([p, role, t]) => role === 'traitor' && p === c.by && t <= now);
  }

  live(now: number): OClaim[] {
    return this.e.claims.filter((c) => c.at <= now && !this.annulled(c, now));
  }

  /** Is this assignment of the two traitor roles consistent with everything
   *  said and shown by round `now`? Written from the game's rules, not from
   *  sus.rofl: crew never lie, traitors may, victims are crew. */
  consistent(W: [string, string], now: number): boolean {
    const traitor = (p: string) => W[0] === p || W[1] === p;
    const crew = (p: string) => !traitor(p);
    for (const [v, , t] of this.e.kills) if (t <= now && traitor(v)) return false;
    for (const [p, role, t] of this.e.exposed) {
      if (t > now) continue;
      if (role === 'traitor' && !traitor(p)) return false;
      if (role === 'crew' && !crew(p)) return false;
    }
    const live = this.live(now);
    for (const c of live) {
      if (c.kind === 'accuse' && crew(c.by) && !traitor(c.who)) return false;
      if (c.kind === 'vouch' && crew(c.by) && !crew(c.who)) return false;
    }
    const saws = live.filter((c) => c.kind === 'saw');
    for (const a of saws) {
      for (const b of saws) {
        if (a.id === b.id) continue;
        if (a.who === b.who && a.about === b.about && a.room !== b.room
          && crew(a.by) && crew(b.by)) return false;
      }
    }
    for (const [v, room, t] of this.e.kills) {
      if (t > now) continue;
      for (const s of saws) {
        if (s.who === v && s.about === t && s.room !== room && crew(s.by)) return false;
      }
      const alibied = (x: string) => saws.some(
        (s) => s.who === x && s.about === t && s.room !== room && crew(s.by));
      if (alibied(W[0]) && alibied(W[1])) return false;
    }
    return true;
  }
}

export interface OracleReport {
  rounds: number; worlds: number; decisions: number;
  verdictMismatch: number; countMismatch: number; disagreements: string[];
  perRound: { round: number; consistent: number }[];
}

export function oracleCheck(rounds: number[]): OracleReport {
  const out: OracleReport = {
    rounds: rounds.length, worlds: 0, decisions: 0,
    verdictMismatch: 0, countMismatch: 0, disagreements: [], perRound: [],
  };
  for (const now of rounds) {
    const r = asOf(now);
    const edb = readEdb(r);
    const oracle = new Oracle(edb);
    const ws = allWorlds(edb.players);
    out.worlds = ws.length;
    const good: [string, string][] = [];
    for (const w of ws) {
      out.decisions++;
      const want = oracle.consistent(w, now);
      const got = r.holds(`consistent[worlds](w(${w[0]}, ${w[1]}))`);
      if (want) good.push(w);
      if (want !== got) {
        out.verdictMismatch++;
        out.disagreements.push(`  VERDICT round ${now} w(${w.join(',')}): engine=${got} oracle=${want}`);
      }
    }
    out.perRound.push({ round: now, consistent: good.length });
    const engine = suspicion(r);
    for (const p of edb.players) {
      const wantGuilty = good.filter((w) => w[0] === p || w[1] === p).length;
      const s = engine.find((x) => x.player === p)!;
      if (Number(s.guilty) !== wantGuilty || Number(s.total) !== good.length) {
        out.countMismatch++;
        out.disagreements.push(`  COUNT round ${now} ${p}: engine=${s.guilty}/${s.total} `
          + `oracle=${wantGuilty}/${good.length}`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

const rule = (t: string) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`);

function main(): void {
  const t0 = Date.now();
  console.log('SUS — eight players, two traitors, sixteen claims, and nobody who has to be believed.');

  // -- 1. the model loads ---------------------------------------------------
  const r3 = asOf(3);
  rule('1. the model loads, and boot.rofl audits it');
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)',
    'undefined_premise[audit](R, Rel)']) {
    console.log(`  ? ${audit.padEnd(34)} -> ${r3.query(audit).rows.length} rows`);
  }
  const ev = new Evaluation(r3.store);
  console.log(`  rules not range-restricted: ${ev.rules.filter((x) => !x.safe).length}`);
  console.log(`  relations evaluated top-down: ${ev.demandRels.size}`);
  console.log(`  facts in the store: ${r3.factKeys().length}`);
  console.log(`  ledgers: ${list(col(r3, 'perspective(P)', 'P').filter((p) => p !== 'main'))}`);

  // -- 2. the table ---------------------------------------------------------
  rule('2. the table');
  const full = asOf(LAST_ROUND);
  console.log(`  ${PLAYERS.length} players, ${allWorlds(PLAYERS).length} ways to place the two `
    + `traitors, ${claims(full).length} claims in `
    + `${new Set(claims(full).map((c) => c.by)).size} ledgers over ${LAST_ROUND} rounds.`);
  console.log('');
  for (const c of claims(full)) console.log(`    ${claimLine(c)}`);
  console.log('');
  console.log('  the game log, which is not a claim:');
  for (const [v, t] of pairs(full, 'kill[public](V, R, T)', 'V', 'T')) {
    const room = col(full, `kill[public](${v}, R, ${t})`, 'R')[0];
    console.log(`    r${t}  ${v} found dead in ${room}`);
  }
  for (const [p, t] of pairs(full, 'ejected[public](P, T)', 'P', 'T')) {
    console.log(`    r${t}  ${p} voted out, card not shown`);
  }
  for (const [p, ro] of pairs(full, 'exposed[public](P, Ro, T)', 'P', 'Ro')) {
    const t = col(full, `exposed[public](${p}, ${ro}, T)`, 'T')[0];
    console.log(`    r${t}  ${p} exposed: ${ro.toUpperCase()}`);
  }

  // -- 3. contradiction is legal, and forgery is not ------------------------
  rule('3. two contradicting claims, and neither is an error');
  console.log('  the same relation, the same subject and the same round — and they cannot');
  console.log('  both be true. Different ledgers, so both are facts:\n');
  for (const k of ['k5', 'k7']) {
    const c = claims(full).find((x) => x.id === k)!;
    console.log(`    said[${c.by}](${k}, ${c.content}, ${c.about}, ${c.at})`);
  }
  console.log(`\n    both hold:      ${full.holds('said[pink](k5, saw(green, electrical), 2, 2)')} `
    + `and ${full.holds('said[green](k7, saw(green, cafeteria), 2, 2)')}`);
  console.log(`    the store has both keys, and nothing was resolved, ranked or dropped.`);
  console.log(`    what the engine derives from the pair is the SIGNAL:`);
  for (const [a, b] of pairs(full, 'clash[case](K1, K2)', 'K1', 'K2')) {
    console.log(`      clash(${a}, ${b})  ->  at most one of `
      + `${col(full, `claimant[case](${a}, P)`, 'P')[0]} and `
      + `${col(full, `claimant[case](${b}, P)`, 'P')[0]} is crew`);
  }
  console.log('\n  and WHO wrote a claim is the load identity, not a column:');
  const forger = world();
  must(forger.load('said[green](k99, saw(pink, reactor), 2, 6) @init.', { who: 'pink' }), 'forgery');
  const forged = col(forger, 'forged[audit](F)', 'F');
  console.log(`    pink writes one entry into green's book, and asks nobody:`);
  console.log(`      forged[audit] -> ${forged.length} row${forged.length === 1 ? '' : 's'}`);
  for (const f of forged) console.log(`        ${f}`);
  console.log(`    the same forgery in a single ledger with a "claimed_by" column is`);
  console.log(`    a well-formed fact, and no audit in any kernel can see it.`);

  // -- 4. counting is the metric --------------------------------------------
  rule('4. counting IS the suspicion metric');
  const fold3 = counting(r3);
  console.log(`  counting semiring over the support hypergraph: ${fold3.rounds} rounds, `
    + `converged=${fold3.converged}, discipline held=${fold3.disciplineHeld}\n`);
  console.log('  round 3, every player, guilty worlds / consistent worlds:');
  for (const s of [...suspicion(r3)].sort((a, b) => b.share - a.share)) {
    const bar = '#'.repeat(Math.round(s.share * 20)).padEnd(20, '.');
    console.log(`    ${s.player.padEnd(6)} ${String(s.guilty).padStart(2)}/${s.total}  `
      + `${bar}  ${(s.share * 100).toFixed(0).padStart(3)}%`);
  }
  console.log('');
  console.log(indent(explain(r3, 'green'), 2));

  // -- 5. the arc -----------------------------------------------------------
  rule('5. the arc: accuse in round 3, withdraw in round 5');
  console.log(`  standard of proof: ${(STANDARD * 100).toFixed(0)}% of the consistent worlds.\n`);
  const rounds = [1, 2, 3, 4, 5, 6];
  const stores = new Map(rounds.map((n) => [n, asOf(n)]));
  console.log('   rd  worlds  green   share   verdict          what changed');
  for (const n of rounds) {
    const r = stores.get(n)!;
    const s = shareOf(r, 'green');
    const said = claims(r).filter((c) => Number(c.at) === n).map((c) => c.id);
    const ann = pairs(r, 'annulled[case](K, R)', 'K', 'R')
      .filter(([k]) => {
        const prev = stores.get(n - 1);
        return !prev || !prev.holds(`annulled[case](${k}, _)`);
      });
    const events: string[] = [];
    if (said.length) events.push(`${said.join(' ')} said`);
    for (const [k, why] of ann) events.push(`${k} ${why}`);
    for (const [v, t] of pairs(r, 'kill[public](V, R, T)', 'V', 'T')) {
      if (Number(t) === n) events.push(`${v} killed`);
    }
    for (const [p, ro] of pairs(r, 'exposed[public](P, Ro, T)', 'P', 'Ro')) {
      if (Number(col(r, `exposed[public](${p}, ${ro}, T)`, 'T')[0]) === n) events.push(`${p} exposed ${ro}`);
    }
    const verdict = s.share >= STANDARD ? 'ACCUSE green' : 'no accusation';
    console.log(`   ${String(n).padStart(2)}  ${String(s.total).padStart(6)}  `
      + `${String(s.guilty).padStart(5)}  ${(s.share * 100).toFixed(0).padStart(5)}%  `
      + `${verdict.padEnd(16)} ${events.join('; ')}`);
  }

  rule('   ... and which link broke');
  const r4 = stores.get(4)!;
  const r5 = stores.get(5)!;
  const claimOf = new Map(claims(full).map((c) => [c.id, c]));
  for (const [label, r] of [['round 4', r4], ['round 5', r5]] as [string, Rofl][]) {
    console.log(`\n  ${label}:`);
    const collapsed = col(r, 'at_risk[case](X)', 'X');
    const partial = col(r, 'shaken[case](X)', 'X');
    for (const x of collapsed) {
      const leaves = col(r, `leaf[case](${x}, K)`, 'K').sort();
      const why = leaves.map((k) => `${k} (${col(r, `annulled[case](${k}, R)`, 'R')[0]})`);
      console.log(`    AT RISK  ${x.padEnd(26)} every support gone: ${list(why)}`);
    }
    for (const x of partial) {
      const leaves = col(r, `leaf[case](${x}, K)`, 'K').sort();
      const dead = leaves.filter((k) => r.holds(`annulled[case](${k}, _)`));
      const alive = leaves.filter((k) => !r.holds(`annulled[case](${k}, _)`));
      console.log(`    SHAKEN   ${x.padEnd(26)} gone: ${list(dead)}   still standing: ${list(alive)}`);
    }
  }
  console.log('\n  the accusation of green was built out of three separate cases, and the');
  console.log('  engine keeps them apart so it can say which one failed:');
  for (const p of col(full, 'case_against[case](green, P)', 'P').sort()) {
    const ks = col(full, `rests_on[case](case_against(green, ${p}), K)`, 'K')
      .filter((k) => full.holds(`claim[case](${k}, _, _, _)`)).sort();
    const state = full.holds(`at_risk[case](case_against(green, ${p}))`) ? 'COLLAPSED'
      : full.holds(`shaken[case](case_against(green, ${p}))`) ? 'shaken' : 'stands';
    console.log(`    ${`case_against(green, ${p})`.padEnd(26)} ${state.padEnd(10)} `
      + ks.map((k) => `${k}: ${claimOf.get(k)!.by} ${say(claimOf.get(k)!.content, claimOf.get(k)!.about)}`).join('; '));
  }
  console.log('\n  the ejection of green in round 3 is marked, not rewritten:');
  console.log(`    at_risk(ejection(green)) = ${r5.holds('at_risk[case](ejection(green))')}   `
    + `shaken(ejection(green)) = ${r5.holds('shaken[case](ejection(green))')}`);
  console.log(`    and the mark reached it through: `
    + `${list(col(r5, 'rests_on[case](ejection(green), X)', 'X').filter((x) => !x.startsWith('k')))}`);

  console.log('');
  console.log(indent(explain(r5, 'green'), 2));
  console.log('');
  console.log('  what still keeps green in the frame at round 5 is not the accusation the');
  console.log('  table voted on. It is one sighting by cyan, who has not been asked anything:');
  for (const k of col(r5, 'points_at[case](green, K)', 'K').sort()) {
    const c = claimOf.get(k)!;
    const state = r5.holds(`annulled[case](${k}, _)`)
      ? `annulled (${col(r5, `annulled[case](${k}, R)`, 'R')[0]})` : 'standing';
    console.log(`    ${k.padEnd(4)} ${c.by.padEnd(6)} ${state.padEnd(22)} ${say(c.content, c.about)}`);
  }

  console.log('\n  the two annulments are not the same arithmetic:');
  const w3 = new Set(col(stores.get(3)!, 'consistent[worlds](W)', 'W'));
  const w4 = col(r4, 'consistent[worlds](W)', 'W');
  const restored = w4.filter((w) => !w3.has(w));
  console.log(`    WITHDRAWAL (k10, round 4). red may be crew, so red's sighting was`);
  console.log('      load-bearing while it stood. Taking it back RESTORES worlds the table');
  console.log(`      had ruled out: ${list(restored)} — which is the true one.`);
  console.log('    UNMASKING (k5, k9, round 5). The count had already priced the possibility');
  console.log('      that pink was lying: in every world where pink is a traitor those claims');
  console.log('      constrained nothing to begin with. Annulment here EXPLAINS the change to');
  console.log('      a person; it does not compute it. What prunes worlds is the reveal.');

  // -- 6. whynot ------------------------------------------------------------
  rule('6. whynot, and the price of an accusation');
  const r6 = stores.get(6)!;
  console.log(indent(whynot(r6, 'green'), 2));
  console.log('');
  console.log(indent(whynot(r6, 'red'), 2));
  console.log('\n  and the raw engine answer under the rendering:\n');
  console.log(indent(r6.whynot('guilty_in[worlds](green, w(green, lime))',
    { depth: 4, nodes: 24 }).text, 4));

  // -- 7. the chain ---------------------------------------------------------
  rule('7. the accusation chain — text you could say out loud');
  console.log('  $ why refuted_by[worlds](w(blue, cyan), k9)      [round 3]');
  console.log(indent(r3.why('refuted_by[worlds](w(blue, cyan), k9)').text, 4));
  const prov = evaluateSemiring(r3.store, provenanceSemiring, { base: provenanceOf });
  const trop = evaluateSemiring(r3.store, tropicalSemiring, { weight: unitFiringCost });
  console.log('\n  provenance: the base facts a single refutation rests on —');
  const poly = prov.value.get('refuted_by[worlds](w(blue,cyan),k9)') ?? [];
  for (const m of poly) for (const f of m) console.log(`      ${f}`);
  console.log(`\n  tropical: the cheapest derivation of guilty_in(green, w(blue,green)) costs `
    + `${trop.value.get('guilty_in[worlds](green,w(blue,green))')} rule firings.`);
  console.log('\n  put together, in the order a person would say it:\n');
  for (const line of accusationText(r3, 'green')) console.log(`    ${line}`);

  // -- 8. viterbi -----------------------------------------------------------
  rule('8. which consistent world is the most likely one');
  console.log('  deceit priors — how boldly each player lies WHEN a traitor:');
  console.log('    ' + pairs(full, 'deceit[public](P, D)', 'P', 'D')
    .sort((a, b) => Number(b[1]) - Number(a[1])).map(([p, d]) => `${p} ${d}%`).join('   '));
  for (const [label, r] of [['round 3', r3], ['round 5', r5]] as [string, Rofl][]) {
    console.log(`\n  ${label}:`);
    for (const x of ranking(r)) {
      console.log(`    ${x.world.padEnd(16)} score ${renderLogProb(x.score).padStart(10)}   `
        + `${(x.probability * 100).toFixed(1).padStart(5)}% of the consistent mass`);
    }
  }
  const top5 = ranking(r5)[0];
  console.log(`\n  the most likely world at round 5 is ${top5.world}, and it is the true one —`);
  console.log('  three rounds after the engine, reasoning correctly, accused an innocent player.');
  console.log(`  the score is a LIKELIHOOD, not a posterior: clearsThreshold(score, 0.5) = `
    + `${clearsThreshold(top5.score, 0.5)}`);
  console.log('  answers "is this story itself likelier than a coin flip", which is a different');
  console.log(`  question from the ${(top5.probability * 100).toFixed(1)}% share of the surviving mass above.`);
  console.log('  The ranking never changes which worlds are POSSIBLE. It is a prior on people');
  console.log('  laid over an answer the Boolean fixpoint already fixed.');

  // -- 9. time --------------------------------------------------------------
  rule('9. time: as-of, ticks, and the trap between them');
  const trace = simulate([3]);
  console.log(`  ${trace.final.store.tick} ticks run, one per round. At every tick boundary, the`);
  console.log('  domain facts the ticked table holds against the same round evaluated as-of:');
  for (const n of rounds) {
    const a = domainFacts(stores.get(n)!);
    const b = trace.facts.get(n)!;
    console.log(`    round ${n}: ${String(a.length).padStart(4)} vs ${String(b.length).padStart(4)} facts  `
      + `${JSON.stringify(a) === JSON.stringify(b) ? 'IDENTICAL' : 'DIFFERENT'}`);
  }
  const cSim = trace.counts.get(3)!;
  const cAsOf = counting(stores.get(3)!);
  console.log('\n  and now fold the counting semiring over each of them, at round 3:');
  for (const key of ['outcome[case](any,green)', 'outcome[case](guilty,green)',
    'consistent[worlds](w(blue,green))']) {
    console.log(`    ${key.padEnd(38)} as-of ${renderCount(cAsOf.value.get(key) ?? 0n).padStart(16)}`
      + `   ticked ${renderCount(cSim.value.get(key) ?? 0n)}`);
  }
  console.log(`\n    facts on a cycle of the support graph: as-of ${cAsOf.cyclic}, ticked ${cSim.cyclic}.`);
  const same = domainFacts(stores.get(3)!)
    .filter((k) => cAsOf.value.get(k) === cSim.value.get(k)).length;
  console.log(`    every domain fact at round 3, counted both ways: ${same} of ${domainFacts(stores.get(3)!).length} agree.`);
  console.log('    A `fact @next :- fact` carry rule makes every carried fact its own support');
  console.log('    one tick back, and past tick 0 EVERY count used to read "infinitely many"');
  console.log('    while every Boolean answer stayed right — silent, total, and fatal to an');
  console.log('    example whose whole product is a count. THE RULE THIS EXAMPLE TAUGHT —');
  console.log('    "fold as-of, never over a ticked store" — IS RETIRED, and not by a');
  console.log('    workaround: on 2026-08-30 `not p` was decided to mean "not derivable in');
  console.log('    the CURRENT tick\'s store", and the same argument narrows the fold, so a');
  console.log('    fact that arrived over the boundary is a given in the tick that reads it.');
  console.log('    (examples/oops found it, examples/npc could not route around it, and SUS');
  console.log('    is where it would have cost the most.) As-of remains the simpler store to');
  console.log('    reason about, and it is still the only way to ask what could have been');
  console.log('    ASKED at a past round — which is the next paragraph.');
  console.log('\n  what a past tick DOES still answer, from frozen provenance:');
  const sim6 = trace.final;
  for (const t of [2, 4]) {
    const derived = sim6.query(`derived_by(F, R, ${t})`).rows.map((x) => x.bindings.F)
      .filter((f) => f.startsWith('$fact(refuted_by,'));
    console.log(`    tick ${t}: ${derived.length} refuted_by facts were derived, still on record now.`);
  }
  console.log(`    at tick ${sim6.store.tick} the consistent set is: `
    + `${list(col(sim6, 'consistent[worlds](W)', 'W'))}`);
  console.log('    Note what this is NOT: "the knowledge state at round 4" is not a query.');
  console.log('    Tick-scoped facts are dropped at the boundary; what survives is the frozen');
  console.log('    derived_by record, which answers what WAS derived, never what could have');
  console.log('    been asked. asOf(4) answers the second question, and it is a different');
  console.log('    store rather than a view of this one.');

  // -- 10. the oracle -------------------------------------------------------
  rule('10. the oracle: every world at every round, decided twice');
  const oc = oracleCheck(rounds);
  console.log(`
  ${oc.worlds} role assignments x ${oc.rounds} rounds = ${oc.decisions} decisions, each taken
  once by the engine and once by a direct evaluation of the claim set in plain
  TypeScript — no engine, no rules, no shared code beyond reading the same base
  facts — and compared on the verdict AND on the counting semiring's numbers.
`);
  console.log(`    verdict disagreements:     ${oc.verdictMismatch}`);
  console.log(`    guilty-count disagreements: ${oc.countMismatch}`);
  console.log(`    consistent worlds by round: `
    + oc.perRound.map((x) => `r${x.round}=${x.consistent}`).join('  '));
  for (const d of oc.disagreements.slice(0, 20)) console.log(d);
  console.log(`\n(${Date.now() - t0} ms for everything above.)`);
  if (oc.verdictMismatch + oc.countMismatch > 0) process.exitCode = 1;
}

/** The accusation as a person would deliver it. Every line is a query; the
 *  only thing this function adds is the word order. */
export function accusationText(r: Rofl, target: string): string[] {
  const s = shareOf(r, target);
  const claimOf = new Map(claims(r).map((c) => [c.id, c]));
  const innocent = new Set(pairs(r, `incriminates[case](${target}, W, R)`, 'W', 'R').map(([w]) => w));
  const byReason = new Map<string, number>();
  for (const [, reason] of pairs(r, `incriminates[case](${target}, W, R)`, 'W', 'R')) {
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  const out: string[] = [];
  out.push(`"Of the 28 ways the two traitor cards could have been dealt, `
    + `${innocent.size} would leave ${target} innocent,`);
  out.push(` and every one of those ${innocent.size} is already dead. Here is what killed them —`);
  out.push(` the lines overlap, because most of those worlds die several times over:`);
  for (const [reason, n] of [...byReason.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5)) {
    const c = claimOf.get(reason);
    const text = c ? `${c.by} ${say(c.content, c.about)}` : reasonText(r, reason);
    out.push(`   ${String(n).padStart(2)} of them, by itself  —  ${text}`);
  }
  const left = col(r, `guilty_in[worlds](${target}, W)`, 'W');
  out.push(` What is left is ${left.length} world${left.length === 1 ? '' : 's'}: `
    + `${list(left)}.`);
  out.push(` ${target} is a traitor in ${left.length === 1 ? 'it' : 'all ' + left.length}. `
    + `That is ${(s.share * 100).toFixed(0)}%, and our standard is `
    + `${(STANDARD * 100).toFixed(0)}%."`);
  return out;
}

const realPath = (p: string) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && realPath(path.resolve(process.argv[1])) === realPath(new URL(import.meta.url).pathname)) {
  main();
}
