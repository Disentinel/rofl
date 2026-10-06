// runtime/split.ts — THE SURFACE-SPLIT DRIVER (docs/surface-split.md, work item 4): a question over a corpus with only
// core + [surface] + the touched volumes resident.
//
// A file is a volume: the facts naming its node prefix. The core (model, question, the facts naming no file) is one
// evaluated world, CORE, which every volume's world forks. A volume is evaluated LOCALLY: its facts + the [surface]
// facts it SUBSCRIBES to, then it PUBLISHES the [surface] facts it concluded and is COOLED (its [code]/[flow]/[main]
// go to a signed volume file, `cool` by book; the world is closed) unless it stays among the `hot` most recent, whose
// worlds a later evaluation reaches by delta. The ingest is a fixpoint over the publications:
//
//   SUBSCRIPTION BY KEY. A surface fact is keyed by its first argument (a module path, a callee, an escaping node), and by the argument a rule joins on where it reads the relation through a later one.
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
import { EngineRefusal, type Evaluated, type RoflPort, type RoflSession } from './port.ts';

export const NODE = /\bn([0-9a-f]{16})_\d+/g;
const NODE_KEY = /^n([0-9a-f]{16})_\d+$/;
/** a node id or a string, as a fact key writes them */
const TERM = /\bn[0-9a-f]{16}_\d+|"(?:[^"\\]|\\.)*"/g;
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
   *  keys only; `nophase` publishes every relation from the start;
   *  `books` cools the books code, flow and main only */
  brk?: 'early' | 'narrow' | 'nophase' | 'books';
  /** the canonical state of each volume's world at every evaluation, for a gate */
  inspect?: (prefix: string, state: string) => void;
  log?: (line: string) => void;
}

interface Pub { keys: string[]; rel: string; pubs: Set<string> }
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
    published: number; inputs: number; inputsMax: number; inputsByRel: Record<string, number>; cooled: number; coldBytes: number; withdrawn: number;
    /** values at a joined later argument that no world can name (an integer, a compound): published, keyed by no volume */
    unkeyed: number };
  answers(): Promise<string[]>;
  /** the why of a fact in the resident world, the volumes on its chain lifted and cooled again */
  why(query: string): Promise<{ text: string; lifted: string[] }>;
  close(): Promise<void>;
}

/** The arguments of a fact key, `rel[book](A, B, ...)`, as written (a string, or a compound, may hold commas and parentheses). */
export function argsOf(fact: string): string[] {
  const out: string[] = [];
  let from = fact.indexOf('(') + 1;
  for (let i = from, d = 0; i < fact.length; i++) {
    const c = fact[i];
    if (c === '"') { for (i++; i < fact.length && fact[i] !== '"'; i++) if (fact[i] === '\\') i++; }
    else if (c === '(') d++;
    else if (c === ')' && d > 0) d--;
    else if (c === ',' && d === 0) { out.push(fact.slice(from, i).trim()); from = i + 1; }
    else if (c === ')') { out.push(fact.slice(from, i).trim()); break; }
  }
  return out;
}
/** A volume subscribes by a node id, a string or an atom, the names a world holds; a key of any other shape (an
 *  integer, a compound) could never be named, so the fact is refused rather than published to nobody. */
const NAMEABLE = /^(?:n[0-9a-f]{16}_\d+|"(?:[^"\\]|\\.)*"|[a-z_]\w*)$/;
export function keyOf(fact: string, at = 0): string {
  const key = argsOf(fact)[at] ?? '';
  if (!NAMEABLE.test(key)) {
    throw new Error(`a [surface] fact is keyed by a node, a string or an atom, so that a volume can subscribe to it; this one by its argument ${at + 1}, ${key.slice(0, 80)}: ${fact.slice(0, 200)}`);
  }
  return key;
}
export const relOf = (fact: string): string => fact.slice(0, fact.indexOf('('));

// ------------------------------------------------------------------ the program, from its reflection
type T = string | { f: string; a: T[] };
interface Lit { rel: string; book: T; args: T[] }
interface Rule { id: string; heads: Lit[]; prems: { t: T; raw: string }[] }
export interface Program { rules: Rule[]; books: Set<string>; relBooks: Map<string, Set<string>> }

/** a reflected term as the engine prints it: `$lit(rel,book,$cons(A,$nil),$now)`, `$var("X")`, a string, an atom */
export function parseTerm(s: string): T {
  let i = 0;
  const term = (): T => {
    const b = i;
    if (s[i] === '"') { for (i++; i < s.length && s[i] !== '"'; i++) if (s[i] === '\\') i++; i++; return s.slice(b, i); }
    while (i < s.length && !',()'.includes(s[i])) i++;
    const f = s.slice(b, i);
    if (s[i] !== '(') return f;
    i++;
    const a: T[] = [];
    while (s[i] !== ')') {
      a.push(term());
      if (s[i] === ',') i++;
      else if (s[i] !== ')') throw new Error(`reflection: unreadable term at ${i}: ${s.slice(0, 200)}`);
    }
    i++;
    return { f, a };
  };
  const t = term();
  if (i !== s.length) throw new Error(`reflection: unreadable term at ${i}: ${s.slice(0, 200)}`);
  return t;
}
const list = (t: T): T[] => typeof t === 'object' && t.f === '$cons' ? [t.a[0], ...list(t.a[1])] : [];
const isVar = (t: T): t is { f: string; a: [string] } => typeof t === 'object' && t.f === '$var';
const varsOf = (t: T | T[], out = new Set<string>()): Set<string> => {
  if (Array.isArray(t)) for (const x of t) varsOf(x, out);
  else if (isVar(t)) out.add(t.a[0]);
  else if (typeof t === 'object') for (const x of t.a) varsOf(x, out);
  return out;
};
const litOf = (t: T): Lit | null => typeof t === 'object' && t.f === '$lit' ? { rel: t.a[0] as string, book: t.a[1], args: list(t.a[2]) } : null;
/** the literals a premise reads: itself, under a `not`, inside an aggregate; a `$lit` in the arguments is data */
const litsIn = (t: T, out: Lit[] = []): Lit[] => {
  const l = litOf(t);
  if (l) out.push(l);
  else if (typeof t === 'object' && t.f === '$not') litsIn(t.a[0], out);
  else if (typeof t === 'object' && t.f === '$agg') for (const x of list(t.a[t.a.length - 1])) litsIn(x, out);
  return out;
};
const PLAIN = /^\$?[a-z_]\w*$/;

export async function reflect(core: RoflSession): Promise<Program> {
  const rows = async (q: string) => {
    const a = await core.ask(q);
    if (a.partial) throw new Error(`${q}: the core world is partial, its reflection is incomplete`);
    return a.rows;
  };
  return programFrom(await rows('conclusion_lit(R, I, L)'), await rows('premise_lit(R, K, L)'));
}

/** The program from the rows of `conclusion_lit(R, I, L)` and `premise_lit(R, K, L)`. A literal whose book is neither a
 *  plain atom nor a variable is refused: an edge dropped for it would be a phase or a key silently wrong. */
export function programFrom(conclusions: string[][], premises: string[][]): Program {
  const rules = new Map<string, Rule>();
  const rule = (id: string) => rules.get(id) ?? (rules.set(id, { id, heads: [], prems: [] }), rules.get(id)!);
  for (const [r, , l] of conclusions) {
    const h = litOf(parseTerm(l));
    if (!h) throw new Error(`rule ${r}: a conclusion that is not a literal: ${l.slice(0, 200)}`);
    rule(r).heads.push(h);
  }
  for (const [r, , l] of premises) rule(r).prems.push({ t: parseTerm(l), raw: l });
  const books = new Set<string>(), relBooks = new Map<string, Set<string>>();
  for (const r of rules.values()) for (const l of [...r.heads, ...r.prems.flatMap((p) => litsIn(p.t))]) {
    if (typeof l.book === 'string') {
      if (!PLAIN.test(l.book)) throw new Error(`rule ${r.id}: the book of ${l.rel} is not a plain atom: ${l.book}`);
      books.add(l.book);
      if (!relBooks.has(l.rel)) relBooks.set(l.rel, new Set());
      relBooks.get(l.rel)!.add(l.book);
    } else if (!isVar(l.book)) throw new Error(`rule ${r.id}: the book of ${l.rel} is neither a plain atom nor a variable`);
  }
  return { rules: [...rules.values()], books, relBooks };
}

/** A rule's literals may name their book by a variable (the closure of a `tree` is written for every book). Each
 *  assignment of the books the relations hold to those variables is one reading of the rule. */
function readings(p: Program, r: Rule): Map<string, string>[] {
  const dom = new Map<string, string[]>();
  for (const l of [...r.heads, ...r.prems.flatMap((x) => litsIn(x.t))]) if (isVar(l.book)) {
    const mine = [...p.relBooks.get(l.rel) ?? []], name = l.book.a[0];
    const now = dom.has(name) ? dom.get(name)!.filter((b) => mine.includes(b)) : mine;
    if (!now.length) throw new Error(`rule ${r.id}: the book variable ${name} of ${l.rel} names no book the program holds`);
    dom.set(name, now);
  }
  let out: Map<string, string>[] = [new Map()];
  for (const [name, bs] of dom) out = out.flatMap((m) => bs.map((b) => new Map(m).set(name, b)));
  return out;
}
const bookIn = (l: Lit, as: Map<string, string>): string => typeof l.book === 'string' ? l.book : as.get((l.book as { a: [string] }).a[0])!;
const keyIn = (l: Lit, as: Map<string, string>) => `${l.rel}[${bookIn(l, as)}]`;

interface Edge { from: string; to: string; neg: boolean }
function edgesOf(p: Program): Edge[] {
  const edges: Edge[] = [];
  for (const r of p.rules) for (const as of readings(p, r)) for (const h of r.heads) {
    for (const x of r.prems) for (const l of litsIn(x.t)) edges.push({ from: keyIn(l, as), to: keyIn(h, as), neg: !litOf(x.t) });
  }
  return edges;
}
/** the relations [surface] reaches */
function reachedFrom(edges: Edge[]): Set<string> {
  const reached = new Set<string>();
  for (const e of edges) if (e.from.endsWith('[surface]')) reached.add(e.from);
  for (let moved = true; moved;) {
    moved = false;
    for (const e of edges) if (reached.has(e.from) && !reached.has(e.to)) { reached.add(e.to); moved = true; }
  }
  return reached;
}

/** PHASES from the program's reflection: a relation's phase is the most negations (or aggregates) over relations
 *  [surface] reaches on a path from [surface] to it; a relation [surface] does not reach is phase 0. */
export function phases(p: Program): Map<string, number> {
  const edges = edgesOf(p), reached = reachedFrom(edges);
  const ph = new Map<string, number>();
  const at = (r: string) => ph.get(r) ?? 0;
  for (let round = 0, moved = true; moved; round++) {
    if (round > 200) throw new Error('the phases do not settle: a negation over [surface] on a cycle');
    moved = false;
    for (const e of edges) {
      const k = at(e.from) + (e.neg && reached.has(e.from) ? 1 : 0);
      if (k > at(e.to)) { ph.set(e.to, k); moved = true; }
    }
  }
  return ph;
}

/** The property the phases are for, read off the reflection again, whatever the model: no premise reads a relation of
 *  a higher phase than its conclusion, a negation or aggregate over what [surface] reaches reads a strictly lower one,
 *  and every phase above 0 is held by some premise (the phases are the least that holds). */
export function phaseFaults(p: Program, ph: Map<string, number>): string[] {
  const edges = edgesOf(p), reached = reachedFrom(edges), at = (r: string) => ph.get(r) ?? 0;
  const need = (e: Edge) => at(e.from) + (e.neg && reached.has(e.from) ? 1 : 0);
  const out = edges.filter((e) => at(e.to) < need(e)).map((e) => `${e.to} (phase ${at(e.to)}) reads ${e.neg ? 'under a negation or aggregate ' : ''}${e.from} (phase ${at(e.from)})`);
  for (const [r, k] of ph) if (k > 0 && !edges.some((e) => e.to === r && need(e) === k)) out.push(`${r} is phase ${k} and no premise puts it there`);
  return out;
}

/** SUBSCRIPTION BY KEY: a surface fact is keyed by its first argument, and by the first argument a rule JOINS ON where
 *  some rule reads the relation through a later one (`sx_cjs[surface](_, N)` is read by N): a volume reads the facts of
 *  the keys it names. A joined argument is a variable that occurs again in the rule (the head, another premise, another
 *  argument). A premise none of whose arguments is joined (wildcards, lone variables, constants) reads every fact of the
 *  relation, which no subscription can serve: refused, naming the rule. Returns, by relation, the argument positions a
 *  fact is keyed by besides the first. Necessary, not sufficient: that the joined key is one the volume names is what
 *  the parity gate shows. */
export function checkKeys(p: Program): Map<string, number[]> {
  const bad: string[] = [];
  const keyed = new Map<string, Set<number>>();
  const count = (t: T | T[], out = new Map<string, number>()): Map<string, number> => {
    if (Array.isArray(t)) for (const x of t) count(x, out);
    else if (isVar(t)) out.set(t.a[0], (out.get(t.a[0]) ?? 0) + 1);
    else if (typeof t === 'object') for (const x of t.a) count(x, out);
    return out;
  };
  for (const r of p.rules) {
    const uses = count([...r.prems.map((x) => x.t), ...r.heads.map((h) => h.args)]);
    for (const as of readings(p, r)) for (const x of r.prems) for (const l of litsIn(x.t)) {
      if (bookIn(l, as) !== 'surface') continue;
      const at = l.args.findIndex((a) => isVar(a) && uses.get(a.a[0])! >= 2);
      if (at < 0) {
        bad.push(`rule ${r.id} (concluding ${r.heads.map((h) => keyIn(h, as)).join(', ')}) reads ${keyIn(l, as)} through no joined argument: ${x.raw.slice(0, 200)}`);
        continue;
      }
      if (!keyed.has(keyIn(l, as))) keyed.set(keyIn(l, as), new Set());
      keyed.get(keyIn(l, as))!.add(at);
    }
  }
  if (bad.length) throw new Error(`the program reads the [surface] with no key to subscribe by:\n  ${[...new Set(bad)].slice(0, 8).join('\n  ')}`);
  return new Map([...keyed].map(([k, v]) => [k, [...v].filter((i) => i > 0).sort()]));
}

/** a refused text, with the line it names */
const said = (text: string) => (e: Error): never => {
  const n = Number(/line (\d+)/.exec(e.message)?.[1] ?? 0);
  throw new Error(`${e.message}${n ? `: ${text.split('\n')[n - 1]?.slice(0, 300)}` : ''}`);
};

export async function drive(o: DriveOpts): Promise<Driven> {
  const log = o.log ?? (() => {});
  fs.mkdirSync(o.dir, { recursive: true });
  const core = await o.port.fresh(o.budget, { space: o.space });
  for (const t of o.program) await core.load(t).catch(said(t));
  if (o.core.trim()) await core.assert(o.core).catch(said(o.core));
  // the driver answers from whole evaluations only: a wall that cut one is a refusal, never an answer
  const whole = (what: string, e: Evaluated): void => {
    if (e.partial) throw new Error(`${what}: the evaluation is partial, a wall cut it (budget ${o.budget}, space ${o.space})`);
  };
  whole('the core world', await core.evaluate());
  const program = await reflect(core);
  const keyPos = checkKeys(program);
  const ph = phases(program);
  const faults = phaseFaults(program, ph);
  if (faults.length) throw new Error(`the phases do not hold on the program's reflection:\n  ${faults.slice(0, 8).join('\n  ')}`);
  // every book but [surface] is cooled with a volume (code, flow, main, and whatever else the program writes in), the
  // kernel's own ledgers aside; the resident world keeps its answers in main, so a lifted volume leaves that one
  const cooled = o.brk === 'books' ? ['code', 'flow', 'main'] : [...new Set([...program.books, 'main'])].filter((b) => b !== 'surface' && !b.startsWith('$')).sort();
  const liftBooks = o.brk === 'books' ? ['code', 'flow'] : cooled.filter((b) => b !== 'main');
  const phaseOf = (rel: string) => o.brk === 'nophase' ? 0 : ph.get(`${rel}`) ?? 0;
  const maxPhase = Math.max(0, ...[...ph].filter(([r]) => r.endsWith('[surface]')).map(([, p]) => o.brk === 'nophase' ? 0 : p));
  const resident = await core.fork();
  let rStale = false;
  // the resident world is whole when asking it says so: a delta evaluation that met a wall leaves it partial
  const intact = async (what: string) => {
    const a = await resident.ask(`${ANSWER_RELS[1]}(S, F)`);
    if (a.partial) throw new Error(`${what}: the resident world is partial, a wall cut its evaluation (budget ${o.budget}, space ${o.space})`);
  };
  const pin = async (fs_: string[]) => {
    const text = fs_.map((f) => `${f}.`).join('\n');
    if (fs_.length && (await resident.add(text).catch(said(text))).full !== null) rStale = true;
  };
  // the relations of the volumes' facts are declared in the resident world: cold there, not undefined
  const baseRels = new Set<string>();
  for (const v of o.volumes) {
    const text = v.text ?? fs.readFileSync(v.path!, 'utf8');
    for (const m of text.matchAll(/^([a-z_][\w]*)\[/gm)) baseRels.add(m[1]);
    if (/^[a-z_]\w*\[surface\]\(/m.test(text)) throw new Error(`the volume of ${v.file} holds a base fact in [surface], which a cooled volume would forget`);
  }
  await resident.load([...baseRels].sort().map((r) => `edb(${r}).`).join('\n'));
  whole('the resident world', await resident.evaluate());

  const vols = new Map<string, Vol>(o.volumes.map((v) => [v.prefix, {
    v, inputs: new Set(), names: new Set(), published: new Set(), answers: [], firstAnswers: null, world: null, cold: null, evals: 0,
  }]));
  const order = o.volumes.map((v) => v.prefix);
  const surface = new Map<string, Pub>();
  const byKey = new Map<string, Set<string>>();
  const subs = new Map<string, Set<string>>();
  const stats = { evaluations: 0, incremental: 0, reheated: 0, first: 0, rounds: [] as number[], maxPhase, published: 0,
    inputs: 0, inputsMax: 0, inputsByRel: {} as Record<string, number>, cooled: 0, coldBytes: 0, withdrawn: 0, unkeyed: 0 };
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
  // A fact read is mirrored into the volume, so the names it holds are the volume's too: they are followed here in
  // one step, rather than one evaluation of the volume per hop.
  const wanted = (p: string, names: Iterable<string>): Set<string> => {
    const out = new Set<string>(), seen = new Set<string>();
    const todo = [...(o.brk === 'narrow' ? [] : names), ...(ownKeys.get(p) ?? [])];
    while (todo.length) {
      const key = todo.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const f of byKey.get(key) ?? []) {
        const s = surface.get(f)!;
        if (out.has(f) || !visible(f) || ![...s.pubs].some((q) => q !== p)) continue;
        out.add(f);
        if (o.brk !== 'narrow') for (const m of f.matchAll(TERM)) if (!seen.has(m[0])) todo.push(m[0]);
      }
    }
    return out;
  };
  const ownKeys = new Map<string, Set<string>>();

  async function cool(p: string): Promise<void> {
    const v = vols.get(p)!;
    if (!v.world) return;
    const file = path.join(o.dir, `${p}.rofl`);
    const c = await v.world.cool(`n${p}_`, file, cooled);
    if (c.books.main) throw new Error(`the volume of ${v.v.file} holds ${c.books.main} base facts in [main], where the resident world keeps its answers: they could not be told apart when the volume is lifted`);
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
    const addFacts = async (text: string) => { if ((await w!.add(text).catch(said(text))).full !== null) stale = true; };
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
      if (stale) { whole(`the volume of ${v.v.file}`, await w!.evaluate()); stale = false; }
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
        const rel = relOf(f);
        // the first argument is the key and must be nameable; a later one a rule joins on is a key where its value can be
        // named, and an integer or a compound there is counted (`unkeyed`): no volume's world names it, so it reads it by no key
        const later = (keyPos.get(rel) ?? []).map((at) => argsOf(f)[at]).filter((k) => NAMEABLE.test(k) || (stats.unkeyed++, false));
        s = { keys: [...new Set([keyOf(f), ...later])], rel, pubs: new Set() };
        surface.set(f, s);
        for (const k of s.keys) {
          if (!byKey.has(k)) byKey.set(k, new Set());
          byKey.get(k)!.add(f);
          const own = ownerOf(k);
          if (own) { if (!ownKeys.has(own)) ownKeys.set(own, new Set()); ownKeys.get(own)!.add(k); }
        }
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
    for (const f of [...added, ...gone]) if (visible(f)) for (const k of surface.get(f)!.keys) touch(k, p);
    const now = added.filter(visible);
    await pin(now);
    for (const f of gone) {
      if (visible(f)) await resident.retract(f);
      for (const k of surface.get(f)!.keys) byKey.get(k)?.delete(f);
      surface.delete(f);
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
      for (const f of now) { const s = surface.get(f)!; for (const k of s.keys) touch(k, s.pubs.size === 1 ? [...s.pubs][0] : ''); }
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
  for (const v of vols.values()) {
    stats.inputsMax = Math.max(stats.inputsMax, v.inputs.size);
    for (const f of v.inputs) stats.inputsByRel[relOf(f)] = (stats.inputsByRel[relOf(f)] ?? 0) + 1;
  }

  // the answers, once: the resident world holds them from here on
  const answerFacts = new Set<string>();
  for (const v of vols.values()) for (const f of (o.brk === 'early' ? v.firstAnswers ?? [] : v.answers)) answerFacts.add(f);
  if (answerFacts.size) await resident.assert([...answerFacts].map((f) => `${f}.`).join('\n'));
  whole('the resident world', await resident.evaluate());
  const answerPubs = new Map<string, Set<string>>();
  for (const [p, v] of vols) for (const f of v.answers) {
    if (!answerPubs.has(f)) answerPubs.set(f, new Set());
    answerPubs.get(f)!.add(p);
  }

  async function why(query: string): Promise<{ text: string; lifted: string[] }> {
    const lifted = new Set<string>(), unpinned: string[] = [];
    let text = '';
    for (let i = 0; ; i++) {
      if (i > 200) throw new Error(`why ${query}: the lift does not settle`);
      if (rStale) { whole('the resident world', await resident.evaluate()); rStale = false; }
      await intact(`why ${query}`);
      // only the engine's refusal of the question is an answer; a failed protocol, a refused reheat are thrown
      try { text = await resident.why(query); } catch (e) {
        if (!(e instanceof EngineRefusal)) throw e;
        text = `refused: ${e.message}`;
        break;
      }
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
    // back to the resident set: the published facts base again, the lifted volumes cooled by book
    await pin(unpinned);
    for (const p of lifted) {
      const f = path.join(o.dir, `${p}.why.rofl`);
      await resident.cool(`n${p}_`, f, liftBooks, ['main']);
      fs.rmSync(f);
    }
    whole('the resident world', await resident.evaluate());
    rStale = false;
    return { text, lifted: [...lifted] };
  }

  return {
    core, resident, surface, phases: ph, stats,
    answers: async () => {
      const out: string[] = [];
      for (const r of ANSWER_RELS) {
        const a = await resident.ask(`${r}(${r === 'side_effect_value' ? 'S, F, V' : r === 'side_effect_site' ? 'S, F' : 'V, K'})`, { keys: true });
        if (a.partial) throw new Error(`${r}: the resident world is partial, a wall cut its evaluation`);
        out.push(...a.keys!);
      }
      return out.sort();
    },
    why,
    close: async () => { await resident.close(); await core.close(); },
  };
}
