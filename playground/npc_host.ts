// The NPC page's engine side: examples/npc/sim.ts driven one tick at a time, each tick kept as a snapshot so a question about it can be asked later.
import { Rofl } from '../src/api.ts';
import { Vocabulary } from '../src/say.ts';
import { head, publish, settle, chosen, rows, physics, clone, START, PROPS, WIDTH, HEIGHT, BUDGET, proposeRule, ruleIds, ruleSetDiff, type Ent, type Act } from '../examples/npc/sim.ts';
import { fold, type Step } from './fold.ts';
import { parseProgram } from '../src/parser.ts';
import { ruleIdOf } from '../src/reflect.ts';

export const NPC_FILES = { boot: ['boot.rofl', 'rules/self-audit.rofl'], npc: 'examples/npc/npc.rofl', phrases: 'examples/npc/phrases.rofl' };
const KEEP = 40;   // ticks whose snapshots are kept for questions about the past

export type Seen = { entity: string; kind: string; x: number; y: number; band: string; since: number; now: boolean };
export type Mind = {
  intents: { goal: string; priority: number; parent?: string }[];
  options: { act: string; goal: string; p: number | null; chosen: boolean }[];
  holes: { reason: string; subject: string }[];
  seen: Seen[];
  ties: string[];
};
export type Tick = { tick: number; ents: Ent[]; acts: Act[]; minds: Record<string, Mind>; events: string[]; holes: number; ms: number; facts: number; partial: boolean };

let boot = '', npc = '';
let vocab = new Vocabulary();
let concerns: Record<string, string> = {};
let r: Rofl;
let ents: Ent[] = [];
let learned = '';
let ticks: Tick[] = [];
const snaps = new Map<number, string>();
const holes: { agent: string; reason: string; subject: string }[] = [];

export function init(bootText: string, npcText: string, phraseText: string, concernMap: Record<string, string>) {
  boot = bootText; npc = npcText; concerns = concernMap;
  vocab = new Vocabulary(); vocab.addText(phraseText);
  return reset();
}

export function reset() {
  const t = performance.now();
  r = head(boot, npc, learned); ents = clone(START); ticks = []; snaps.clear(); holes.length = 0;
  return { width: WIDTH, height: HEIGHT, props: PROPS, ents, learned, ms: Math.round(performance.now() - t) };
}

const say = (lit: string) => (vocab.say(lit) ?? lit).replace(/ ,/g, ',').replace(/, in the \w+$/, '');
const p = (v: string) => Number(v) <= -2e9 ? 0 : Math.exp(Number(v) / 1e6);

/** One tick: publish the yard, deliberate, choose, keep the store as it was, move the world, advance. */
export function step(): Tick {
  const t = performance.now();
  publish(r, ents);
  const { partial } = settle(r);
  const acts = partial ? [] : chosen(r);
  const minds: Record<string, Mind> = {};
  const mind = (a: string) => (minds[a] ??= { intents: [], options: [], holes: [], seen: [], ties: [] });
  for (const e of ents) mind(e.id);
  const parent = new Map(rows(r, 'subgoal[mind](A, P, G)').map((x) => [`${x.A}|${x.G}`, x.P]));
  for (const x of rows(r, 'intent[mind](A, G, P)')) mind(x.A).intents.push({ goal: x.G, priority: Number(x.P), parent: parent.get(`${x.A}|${x.G}`) });
  const score = new Map(rows(r, 'score[choice](A, Act, V)').map((x) => [`${x.A}|${x.Act}`, x.V]));
  const does = new Set(acts.map((a) => `${a.agent}|${a.act}`));
  for (const x of rows(r, 'option[mind](A, Act, G)')) { const k = `${x.A}|${x.Act}`; mind(x.A).options.push({ act: x.Act, goal: x.G, p: score.has(k) ? p(score.get(k)!) : null, chosen: does.has(k) }); }
  const sees = new Set(rows(r, 'in_sight[mind](A, E)').map((x) => `${x.A}|${x.E}`));
  for (const x of rows(r, 'recalls[mind](A, E, K, X, Y, B, T)')) if (x.K !== 'prop') mind(x.A).seen.push({ entity: x.E, kind: x.K, x: Number(x.X), y: Number(x.Y), band: x.B, since: Number(x.T), now: sees.has(`${x.A}|${x.E}`) });
  let holeCount = 0;
  for (const x of rows(r, 'uncovered[audit](A, R, S)')) { mind(x.A).holes.push({ reason: x.R, subject: x.S }); holes.push({ agent: x.A, reason: x.R, subject: x.S }); holeCount++; }
  for (const x of rows(r, 'tie[audit](A, Act, O)')) mind(x.A).ties.push(`${x.Act} / ${x.O}`);
  for (const m of Object.values(minds)) { m.intents.sort((a, b) => b.priority - a.priority); m.options.sort((a, b) => (b.p ?? -1) - (a.p ?? -1)); }
  const tick = r.store.tick;
  snaps.set(tick, r.save()); snaps.delete(tick - KEEP);
  const out = physics(ents, acts);
  const rec: Tick = { tick, ents: clone(ents), acts, minds, events: out.events, holes: holeCount, ms: 0, facts: r.store.facts.size, partial };
  ents = out.ents;
  r.tickAdvance({ budget: BUDGET });
  rec.ms = Math.round(performance.now() - t);
  ticks.push(rec);
  return rec;
}

function at(tick: number, extra = ''): Rofl {
  const s = snaps.get(tick); if (!s) throw new Error(`tick ${tick} is no longer kept`);
  const past = Rofl.fromSnapshot(s);
  if (extra.trim()) { const l = past.load(extra, { who: 'sim', budget: BUDGET }); if (!l.ok) throw new Error(l.diagnostics.join('\n')); }
  past.evaluate(BUDGET);
  return past;
}

/** `why` on a fact of a past tick, folded by the section of npc.rofl each rule sits in. */
export function why(tick: number, literal: string): Step | string {
  const past = at(tick);
  return fold(past.store, literal, {
    concernOf: (rid) => concerns[rid] ?? '',
    say,
    entities: /\b(?:npc|crate|cart)_\d+\b/g,
    own: (c) => c.startsWith('learned'),
  });
}

/** `whynot` on a fact of a past tick: the premise that failed, in sentences. */
export function whynot(tick: number, literal: string): string {
  // the rules whose head could not even match are noise: every rule of the relation is listed, and only one had a chance
  return vocab.sayAll(at(tick).whynot(literal, { depth: 3 }).text).replace(/ ,/g, ',').split('\n').filter((l) => !/head does not unify/.test(l)).join('\n');
}

/** The rule the agents propose from the holes they have recorded so far, once there are enough of one shape. */
export function propose() { return proposeRule(holes); }

/** Take a rule into the head from the next tick on; the rule-set diff says what changed. */
export function learn(text: string) {
  const before = ruleIds(r);
  const l = r.load(text, { who: 'sim', budget: BUDGET });
  if (!l.ok) return { ok: false, diagnostics: l.diagnostics };
  learned += '\n' + text;
  for (const c of parseProgram(text)) if (c.body.length) concerns[ruleIdOf(c)] = 'learned: the rule the agents wrote';
  return { ok: true, diff: ruleSetDiff(before, ruleIds(r)) };
}

/** The holes of a past tick with and without what was learned since: a rule is a fact about every tick, not only the next one. */
export function past(tick: number) {
  const q = (x: Rofl) => rows(x, 'uncovered[audit](A, no_action, S)').map((h) => say(`uncovered[audit](${h.A}, no_action, ${h.S})`));
  return { tick, before: q(at(tick)), after: learned.trim() ? q(at(tick, learned)) : null };
}
