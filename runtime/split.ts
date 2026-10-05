// runtime/split.ts — THE SURFACE-SPLIT DRIVER (docs/surface-split.md, work item 4): a question over a corpus with only
// core + [surface] + the touched volumes resident.
//
// A file is a volume: the facts naming its node prefix. The core (model, question, the facts naming no file) is one
// evaluated world, CORE, which every volume's world forks. A volume is evaluated LOCALLY: its facts + the [surface]
// facts it SUBSCRIBES to, then it PUBLISHES the [surface] facts it concluded and is COOLED (its [code]/[flow]/[main]
// go to a signed volume file, `cool` by book; the world is closed) unless it stays among the `hot` most recent, whose
// worlds a later evaluation reaches by delta. The ingest is a fixpoint over the publications:
//
//   SUBSCRIPTION BY KEY. A surface fact is keyed by its first argument (a module path, a callee, an escaping node).
//   A volume reads the facts whose key is one of its own nodes or a name its world holds (`view`: the atoms and
//   strings of what it wrote); reading them may name more, so a volume's evaluation adds what its names reach, by
//   delta, until they reach nothing new. It is evaluated again only when a fact of a key it subscribed to moved.
//
//   PHASES, FOR THE INGEST-ORDER HAZARD. A negation (or an aggregate) over what [surface] reaches answers "no surface
//   says so YET", and a volume evaluated before the surface is complete concludes what the next round withdraws; a
//   publication resting on such a conclusion could hold itself up across volumes after its reason is gone. So every
//   relation gets a PHASE from the program (`phases`): the most negations over surface-reached relations on a path
//   from [surface] to it. A surface relation of phase k is published only once every phase below k is quiescent,
//   so within a phase publications only grow (monotone, a least fixpoint: a withdrawal is a defect and is said) and
//   every negation reads a complete surface. The answers are read only after the last phase: each volume's last
//   evaluation saw every fact of every key it reads.
//
//   THE RESIDENT WORLD. A second fork of CORE holds what stays: every publication, base (asserted by delta as it
//   arrives), and after the fixpoint the answers. The question's answers and its aggregates are asked there. A
//   `why` of an answer LIFTS volumes into it: the answer's volume is reheated (by delta), the facts it published lose
//   their base copy; a [surface] fact the why still shows as an axiom names the volumes that published it, which are
//   lifted in turn until the why rests on base facts of lifted volumes and core alone. Then each lifted volume is
//   cooled by book and the published facts are base again: the resident world is the one it was.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type RoflPort, type RoflSession } from './port.ts';

export const NODE = /\bn([0-9a-f]{16})_\d+/g;
const NODE_KEY = /^n([0-9a-f]{16})_\d+$/;
/** the books a cooled volume drops; [surface] is what stays */
export const COOLED_BOOKS = ['code', 'flow', 'main'];
/** the question's answers, read from the resident world */
export const ANSWER_RELS = ['side_effect_value', 'side_effect_site', 'side_effect_env'];

export interface Volume { prefix: string; file: string; text?: string; path?: string }
export interface DriveOpts {
  port: RoflPort;
  budget: number;
  space: number;
  /** the model's and the question's program texts, in load order */
  program: string[];
  /** the facts naming no file */
  core: string;
  volumes: Volume[];
  /** where cooled volumes go */
  dir: string;
  /** volumes whose worlds stay hot after their evaluation (0: every volume is cooled at once) */
  hot: number;
  /** planted faults: `early` answers from each volume's first evaluation; `narrow` subscribes a volume to its own
   *  keys only; `nophase` publishes every relation from the start */
  brk?: 'early' | 'narrow' | 'nophase';
  /** the canonical state of each volume's world at every evaluation, for a gate */
  inspect?: (prefix: string, state: string) => void;
  log?: (line: string) => void;
}

interface Pub { key: string; rel: string; pubs: Set<string> }
interface Vol {
  v: Volume;
  inputs: Set<string>;
  /** every name the volume's world held at any evaluation: a subscription never shrinks */
  names: Set<string>;
  published: Set<string>;
  answers: string[];
  firstAnswers: string[] | null;
  world: RoflSession | null;
  cold: string | null;
  evals: number;
}

export interface Driven {
  core: RoflSession;
  resident: RoflSession;
  /** published [surface] fact -> the volumes that publish it */
  surface: Map<string, Pub>;
  phases: Map<string, number>;
  stats: { evaluations: number; incremental: number; reheated: number; first: number; rounds: number[]; maxPhase: number;
    published: number; inputs: number; cooled: number; coldBytes: number; withdrawn: number };
  answers(): Promise<string[]>;
  /** the why of a fact in the resident world, the volumes on its chain lifted and cooled again */
  why(query: string): Promise<{ text: string; lifted: string[] }>;
  close(): Promise<void>;
}

/** The first argument of a fact key, `rel[book](A, ...)`, as written. */
export function keyOf(fact: string): string {
  let i = fact.indexOf('(') + 1;
  const s = i;
  if (fact[i] === '"') {
    for (i++; i < fact.length && fact[i] !== '"'; i++) if (fact[i] === '\\') i++;
    return fact.slice(s, i + 1);
  }
  for (let d = 0; i < fact.length; i++) {
    const c = fact[i];
    if (c === '(') d++;
    else if (c === ')') { if (d === 0) break; d--; }
    else if (c === ',' && d === 0) break;
  }
  return fact.slice(s, i);
}
export const relOf = (fact: string): string => fact.slice(0, fact.indexOf('('));

/** PHASES from the program's reflection: a relation's phase is the most negations (or aggregates) over relations
 *  [surface] reaches on a path from [surface] to it; a relation [surface] does not reach is phase 0. */
export async function phases(core: RoflSession): Promise<Map<string, number>> {
  const lits = (l: string): string[] => [...l.matchAll(/\$lit\(([^,()]+),([^,()]+),/g)].map((m) => `${m[1]}[${m[2]}]`);
  const heads = new Map<string, string>();
  for (const [r, , l] of (await core.ask('conclusion_lit(R, I, L)')).rows) heads.set(r, lits(l)[0]);
  const edges: { from: string; to: string; neg: boolean }[] = [];
  for (const [r, , l] of (await core.ask('premise_lit(R, K, L)')).rows) {
    const to = heads.get(r);
    if (!to) continue;
    const neg = !l.startsWith('$lit(');
    for (const from of lits(l)) edges.push({ from, to, neg });
  }
  const reached = new Set<string>();
  for (const e of edges) if (e.from.endsWith('[surface]')) reached.add(e.from);
  for (let moved = true; moved;) {
    moved = false;
    for (const e of edges) if (reached.has(e.from) && !reached.has(e.to)) { reached.add(e.to); moved = true; }
  }
  const ph = new Map<string, number>();
  const at = (r: string) => ph.get(r) ?? 0;
  for (let round = 0, moved = true; moved; round++) {
    if (round > 200) throw new Error('the phases do not settle: a negation over [surface] on a cycle');
    moved = false;
    for (const e of edges) {
      const p = at(e.from) + (e.neg && reached.has(e.from) ? 1 : 0);
      if (p > at(e.to)) { ph.set(e.to, p); moved = true; }
    }
  }
  return ph;
}

export async function drive(o: DriveOpts): Promise<Driven> {
  const log = o.log ?? (() => {});
  fs.mkdirSync(o.dir, { recursive: true });
  const core = await o.port.fresh(o.budget, { space: o.space });
  for (const t of o.program) await core.load(t);
  if (o.core.trim()) await core.assert(o.core);
  await core.evaluate();
  const ph = await phases(core);
  const phaseOf = (rel: string) => o.brk === 'nophase' ? 0 : ph.get(`${rel}`) ?? 0;
  const maxPhase = Math.max(0, ...[...ph].filter(([r]) => r.endsWith('[surface]')).map(([, p]) => o.brk === 'nophase' ? 0 : p));
  const resident = await core.fork();
  let rStale = false;
  const pin = async (fs_: string[]) => { if (fs_.length && (await resident.add(fs_.map((f) => `${f}.`).join('\n'))).full !== null) rStale = true; };
  // the relations of the volumes' facts are declared in the resident world: cold there, not undefined
  const baseRels = new Set<string>();
  for (const v of o.volumes) {
    for (const m of (v.text ?? fs.readFileSync(v.path!, 'utf8')).matchAll(/^([a-z_][\w]*)\[/gm)) baseRels.add(m[1]);
  }
  await resident.load([...baseRels].sort().map((r) => `edb(${r}).`).join('\n'));
  await resident.evaluate();

  const vols = new Map<string, Vol>(o.volumes.map((v) => [v.prefix, {
    v, inputs: new Set(), names: new Set(), published: new Set(), answers: [], firstAnswers: null, world: null, cold: null, evals: 0,
  }]));
  const order = o.volumes.map((v) => v.prefix);
  const surface = new Map<string, Pub>();
  const byKey = new Map<string, Set<string>>();
  const subs = new Map<string, Set<string>>();
  const stats = { evaluations: 0, incremental: 0, reheated: 0, first: 0, rounds: [] as number[], maxPhase, published: 0,
    inputs: 0, cooled: 0, coldBytes: 0, withdrawn: 0 };
  let phase = 0;
  const visible = (f: string) => phaseOf(relOf(f)) <= phase;
  const hot: string[] = [];
  const dirty = new Set<string>();
  const ownerOf = (key: string) => NODE_KEY.exec(key)?.[1];
  const touch = (key: string, except: string) => {
    for (const q of subs.get(key) ?? []) if (q !== except) dirty.add(q);
    const own = ownerOf(key);
    if (own && own !== except && vols.has(own)) dirty.add(own);
  };

  /** the surface facts a volume reads: of a key it names or owns, visible, published by another volume */
  const wanted = (p: string, names: Iterable<string>): Set<string> => {
    const out = new Set<string>();
    const take = (key: string) => {
      for (const f of byKey.get(key) ?? []) {
        const s = surface.get(f)!;
        if (visible(f) && [...s.pubs].some((q) => q !== p)) out.add(f);
      }
    };
    if (o.brk !== 'narrow') for (const n of names) take(n);
    for (const key of ownKeys.get(p) ?? []) take(key);
    return out;
  };
  const ownKeys = new Map<string, Set<string>>();

  async function cool(p: string): Promise<void> {
    const v = vols.get(p)!;
    if (!v.world) return;
    const file = path.join(o.dir, `${p}.rofl`);
    const c = await v.world.cool(`n${p}_`, file, COOLED_BOOKS);
    stats.cooled++;
    stats.coldBytes += c.bytes;
    v.cold = file;
    await v.world.close();
    v.world = null;
  }

  async function evaluate(p: string): Promise<void> {
    const v = vols.get(p)!;
    stats.evaluations++;
    v.evals++;
    let w = v.world;
    let stale = false;
    const addFacts = async (text: string) => { if ((await w!.add(text)).full !== null) stale = true; };
    if (w) {
      stats.incremental++;
      hot.splice(hot.indexOf(p), 1);
    } else {
      w = await core.fork();
      if (v.cold) { stale = !(await w.reheat(v.cold)).evaluated; stats.reheated++; }
      else { await addFacts(v.v.text ?? fs.readFileSync(v.v.path!, 'utf8')); stats.first++; }
      v.inputs = new Set();
    }
    // subscriptions by key: what the volume's names reach, by delta, until they reach nothing new. A fact leaves
    // the inputs only when no other volume publishes it any more.
    const look = async () => {
      if (stale) { await w!.evaluate(); stale = false; }
      const r = await w!.view(`n${p}_`, ['surface'], ANSWER_RELS);
      for (const n of r.names) if (!v.names.has(n)) {
        v.names.add(n);
        if (!subs.has(n)) subs.set(n, new Set());
        subs.get(n)!.add(p);
      }
      return r;
    };
    const tl = performance.now();
    let view = await look();
    log(`    first look ${Math.round(performance.now() - tl)} ms`);
    for (;;) {
      const want = wanted(p, v.names);
      const add = [...want].filter((f) => !v.inputs.has(f)), del = [...v.inputs].filter((f) => !want.has(f));
      if (!add.length && !del.length) break;
      for (const f of del) await w.retract(f);
      const ta = performance.now();
      if (add.length) await addFacts(add.map((f) => `${f}.`).join("\n"));
      log(`    +${add.length} -${del.length} inputs, assert ${Math.round(performance.now() - ta)} ms`);
      v.inputs = want;
      view = await look();
    }
    if (o.inspect) o.inspect(p, await w.stateText());
    const answers = new Set(ANSWER_RELS);
    v.answers = view.facts.filter((f) => answers.has(relOf(f).replace(/\[main\]$/, "")));
    v.firstAnswers ??= v.answers;
    const mine = new Set(view.facts.filter((f) => /^[^(]*\[surface\]\(/.test(f) && !v.inputs.has(f)));
    // the publication's change: what is new, what is withdrawn
    const added: string[] = [], gone: string[] = [];
    for (const f of mine) if (!v.published.has(f)) {
      let s = surface.get(f);
      if (!s) {
        s = { key: keyOf(f), rel: relOf(f), pubs: new Set() };
        surface.set(f, s);
        if (!byKey.has(s.key)) byKey.set(s.key, new Set());
        byKey.get(s.key)!.add(f);
        const own = ownerOf(s.key);
        if (own) { if (!ownKeys.has(own)) ownKeys.set(own, new Set()); ownKeys.get(own)!.add(s.key); }
      }
      s.pubs.add(p);
      if (s.pubs.size === 1) added.push(f);
    }
    for (const f of v.published) if (!mine.has(f)) {
      const s = surface.get(f)!;
      s.pubs.delete(p);
      if (s.pubs.size === 0) gone.push(f);
    }
    v.published = mine;
    // within a phase what is published only grows: a withdrawal is counted, and the gate reads the count
    stats.withdrawn += gone.filter(visible).length;
    for (const f of [...added, ...gone]) if (visible(f)) touch(surface.get(f)!.key, p);
    const now = added.filter(visible);
    await pin(now);
    for (const f of gone) {
      if (visible(f)) await resident.retract(f);
      surface.delete(f);
      byKey.get(keyOf(f))?.delete(f);
    }
    v.world = w;
    hot.push(p);
    while (hot.length > o.hot) await cool(hot.shift()!);
  }

  for (const p of order) dirty.add(p);
  for (phase = 0; phase <= maxPhase; phase++) {
    if (phase > 0) {
      // what was withheld is published now; whoever reads its key is evaluated again
      const now = [...surface.keys()].filter((f) => phaseOf(relOf(f)) === phase);
      for (const f of now) { const s = surface.get(f)!; touch(s.key, s.pubs.size === 1 ? [...s.pubs][0] : ''); }
      await pin(now);
    }
    let rounds = 0;
    while (dirty.size) {
      rounds++;
      if (rounds > 50) throw new Error(`phase ${phase}: the surface does not settle after 50 rounds`);
      for (const p of order) {
        if (!dirty.has(p)) continue;
        dirty.delete(p);
        const t = performance.now();
        await evaluate(p);
        log(`  eval ${p} (${vols.get(p)!.v.file}) ${Math.round(performance.now() - t)} ms, inputs ${vols.get(p)!.inputs.size}, published ${vols.get(p)!.published.size}`);
      }
    }
    stats.rounds.push(rounds);
    log(`phase ${phase}: ${rounds} rounds, ${stats.evaluations} evaluations so far, surface ${surface.size}`);
  }
  for (const p of [...hot]) await cool(p);
  hot.length = 0;
  stats.published = surface.size;
  stats.inputs = [...vols.values()].reduce((a, v) => a + v.inputs.size, 0);

  // the answers, once: the resident world holds them from here on
  const answerFacts = new Set<string>();
  for (const v of vols.values()) for (const f of (o.brk === 'early' ? v.firstAnswers ?? [] : v.answers)) answerFacts.add(f);
  if (answerFacts.size) await resident.assert([...answerFacts].map((f) => `${f}.`).join('\n'));
  await resident.evaluate();
  const answerPubs = new Map<string, Set<string>>();
  for (const [p, v] of vols) for (const f of v.answers) {
    if (!answerPubs.has(f)) answerPubs.set(f, new Set());
    answerPubs.get(f)!.add(p);
  }

  async function why(query: string): Promise<{ text: string; lifted: string[] }> {
    const lifted = new Set<string>(), unpinned: string[] = [];
    let text = '';
    try {
    for (let i = 0; ; i++) {
      if (i > 200) throw new Error(`why ${query}: the lift does not settle`);
      if (rStale) { await resident.evaluate(); rStale = false; }
      text = await resident.why(query);
      // a fact the resident world holds as published shows as an axiom: its publishers are lifted, its base copy goes
      const pinned: string[] = [];
      for (const line of text.split('\n')) {
        const m = /^\s*([a-z_$][\w$]*\[[^\]]*\]\(.*\)) \[axiom\]$/.exec(line);
        if (m && !unpinned.includes(m[1]) && !pinned.includes(m[1]) && (surface.has(m[1]) || answerPubs.has(m[1]))) pinned.push(m[1]);
      }
      if (!pinned.length) break;
      for (const f of pinned) {
        for (const q of surface.get(f)?.pubs ?? answerPubs.get(f) ?? []) if (!lifted.has(q)) {
          lifted.add(q);
          if (!(await resident.reheat(vols.get(q)!.cold!)).evaluated) rStale = true;
        }
        unpinned.push(f);
        await resident.retract(f);
      }
    }
    log(`    why ${query.slice(0, 70)}: ${text.split('\n').length} lines, ${lifted.size} lifted, ${unpinned.length} unpinned`);
    } catch (e) {
      text = `refused: ${(e as Error).message}`;
    }
    // back to the resident set: the published facts base again, the lifted volumes cooled by book
    await pin(unpinned);
    for (const p of lifted) {
      const f = path.join(o.dir, `${p}.why.rofl`);
      await resident.cool(`n${p}_`, f, ['code', 'flow']);
      fs.rmSync(f);
    }
    await resident.evaluate();
    rStale = false;
    return { text, lifted: [...lifted] };
  }

  return {
    core, resident, surface, phases: ph, stats,
    answers: async () => {
      const out: string[] = [];
      for (const r of ANSWER_RELS) {
        const a = await resident.ask(`${r}(${r === 'side_effect_value' ? 'S, F, V' : r === 'side_effect_site' ? 'S, F' : 'V, K'})`, { keys: true });
        out.push(...a.keys!);
      }
      return out.sort();
    },
    why,
    close: async () => { await resident.close(); await core.close(); },
  };
}
