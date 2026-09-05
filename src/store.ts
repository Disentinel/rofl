// store.ts — fact store. Map-based, perspective-tagged, deterministic.
// The store is generic: it knows no relation names at all.

import { type Term, canonTerm, isGround, termToJson, termFromJson } from './unify.ts';

export type Scope = 'timeless' | 'tick';

export interface FactRec {
  key: string;
  rel: string;
  persp: string;
  args: Term[];
  scope: Scope;
  base: boolean;    // asserted (EDB / kernel-emitted) rather than rule-derived
  frozen: boolean;  // provenance from completed ticks; survives re-evaluation
}

export type PremRef =
  | { t: 'fact'; key: string }
  | { t: 'neg'; key: string }      // canonical key of the absent fact pattern
  | { t: 'bi'; desc: string };

export interface Witness { ruleId: string; tick: number; prems: PremRef[]; }

/** What one tick's standing evaluation cost and was allowed. `partial` is the
 *  same answer `partialEval` gives about the last evaluation; `budget` and
 *  `steps` are what a replay needs in order to reproduce a past tick rather
 *  than approximate it. See `Store.evalLog`. */
export interface EvalRecord { budget: number; steps: number; partial: boolean; }

/** The identity of a fact, and the only one the store has. Every fact carries
 *  one, in `facts`, in a key run, and again in `witnesses` and `firings`, so
 *  what a key costs is paid per fact several times over.
 *
 *  WHY THE JOIN AND NOT A TEMPLATE. Concatenation — `a + b`, and a template
 *  with substitutions, which compiles to the same thing — does not write a
 *  string, it records the intent to write one: the result is a tree of the
 *  fragments, each fragment kept alive by it. A join is handed all the pieces
 *  at once, adds up their lengths, and writes the characters into one flat
 *  sequence. The text is identical either way; what differs is what stays
 *  reachable afterwards. Measured on 40000 arity-1 facts: 96 bytes per
 *  14-character key built by concatenation against 46 built by join, and
 *  332 -> 296 bytes per fact in the live store, the difference between the
 *  two being the keys a Map has already flattened to hash them. `.slice()`
 *  reads as a copy and is not one — it measured 100 bytes, no better than
 *  the tree it was meant to collapse. */
export function factKey(rel: string, persp: string, args: Term[]): string {
  return [rel, '[', persp, '](', args.map(canonTerm).join(','), ')'].join('');
}

/** The keys of one relation in one perspective. `canon` is canonically
 *  ordered; `arrived` holds keys that have not been absorbed into it yet.
 *
 *  WHY THE SPLIT (performance-invariants.md, I1). Inserting one key at a time
 *  into a sorted array is free at the end and a memmove of the tail anywhere
 *  else, so the cost of a fact is decided by the ORDER facts arrive in.
 *  Derived facts arrive in rule-firing order, which is never key order, so the
 *  engine used to pay the memmove on every fact of the layer it generates most
 *  of. Arrivals are appended instead, and the run is put back in order once,
 *  for a batch, by `absorb`.
 *
 *  Nothing outside this file may hold either array: every reader goes through
 *  `absorb` first, so the sortedness `relPersp`/`relAll` promise is a property
 *  of the READ, not of a boundary a caller has to remember to cross. */
interface KeyRun {
  canon: string[];
  arrived: string[];
  /** Keys of facts holding a non-ground argument. An argument index answers
   *  by canonical VALUE, and a stored variable unifies with values it is not
   *  equal to, so such a fact belongs to no bucket and to every answer. The
   *  public surface cannot assert one (`addClause` and `conclude` both demand
   *  groundness); `Store.add` can, so the case is carried rather than assumed
   *  away. Empty in every program in this repository. */
  loose: string[];
  /** Argument indexes, keyed by BINDING PATTERN — the bitmask of argument
   *  positions a premise had already bound when it asked. Null until some
   *  premise asks for one, and dropped whole by any removal. */
  byPat: Map<number, Map<string, string[]>> | null;
  /** Keys added since the last fold into `byPat`. Only accumulated while
   *  `byPat` is live, so a store nobody indexes carries no cost at all. */
  staged: string[];
}

function newRun(): KeyRun {
  return { canon: [], arrived: [], loose: [], byPat: null, staged: [] };
}

/** How many facts one (relation, perspective) must hold before an argument
 *  index is worth building. Below it the scan an index replaces is shorter
 *  than the single pass that builds the index, and the fixpoint's own reads
 *  would pay for a structure they never amortise. */
const MIN_INDEXED = 16;

/** At most this many binding patterns per (relation, perspective); past it a
 *  premise is answered by a scan. A pattern is a property of the RULES, not
 *  of the data — the distinct sets of positions a program's premises arrive
 *  with — so this bound is generous in practice and it is what stops a
 *  wide relation asked in every mode from carrying 2^arity indexes. */
const MAX_PATTERNS = 8;

/** Join canonical argument renderings into one bucket signature. Each part
 *  carries its own length, so no separator can be forged by a term's own
 *  rendering: a signature names exactly one tuple of values, whatever the
 *  strings and atoms inside it contain. */
function joinSig(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  // Collected and written once rather than accumulated with `+=`, for the
  // reason spelled out over `factKey`: a signature is retained as a bucket
  // key for as long as the index lives, so it is worth the flat form.
  const out: (string | number)[] = [];
  for (const p of parts) { out.push(p.length, ':', p); }
  return out.join('');
}

/** The bucket a fact belongs to under one binding pattern, or null when it
 *  belongs to none: the pattern names a position the fact does not have
 *  (a shorter fact, which the caller's arity check rejects anyway), or one
 *  holding a variable (which `loose` covers instead). */
function patSig(pos: number[], args: Term[]): string | null {
  const parts: string[] = [];
  for (const p of pos) {
    const a = args[p];
    if (a === undefined || !isGround(a)) return null;
    parts.push(canonTerm(a));
  }
  return joinSig(parts);
}

function bucketAdd(byVal: Map<string, string[]>, pos: number[], args: Term[], key: string): void {
  const sig = patSig(pos, args);
  if (sig === null) return;
  const bucket = byVal.get(sig);
  if (bucket) bucket.push(key);
  else byVal.set(sig, [key]);
}

/** The argument positions a pattern mask names, ascending. */
function maskPos(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; mask >>> i; i++) if ((mask >>> i) & 1) out.push(i);
  return out;
}

/** Every argument index of one run is dropped by any removal from it.
 *
 *  WHY DROP RATHER THAN UNPICK. Removals here are not one-offs: `clearDerived`
 *  and `advanceTick` take a whole layer at once, at an evaluation boundary,
 *  and a fixpoint that follows rebuilds each pattern in one pass over keys it
 *  is about to read anyway. Unpicking would have to find the key inside every
 *  bucket of every pattern, and a bucket that kept a dead key would answer a
 *  premise with a fact that is gone — a wrong candidate set, which no timing
 *  shows and every answer feels. */
function dropPatterns(run: KeyRun): void {
  run.byPat = null;
  if (run.staged.length > 0) run.staged.length = 0;
}

/** Above this many arrivals a linear merge beats inserting them one at a
 *  time. MEASURED on this machine, absorbing into a 64k run: one-at-a-time
 *  insertion moves tail elements with a native memmove, ~15× cheaper per
 *  element than the interpreted merge loop, so the merge only wins once a
 *  batch is large enough to amortise its full pass over the run. Below the
 *  threshold this is exactly what the store did before, which is why an
 *  access pattern that reads after every single write cannot regress. */
const MERGE_MIN = 24;

/** Put a run back in canonical order and return it. The one choke point:
 *  every read and every removal calls this before it looks at the keys. */
function absorb(run: KeyRun): string[] {
  const fresh = run.arrived;
  const m = fresh.length;
  if (m === 0) return run.canon;
  const old = run.canon;
  if (old.length === 0) {
    if (m > 1) fresh.sort();
    run.canon = fresh;
    run.arrived = [];   // `fresh` is the canonical order now; it is not reused
    return fresh;
  }
  // One arrival is the read-after-every-write pattern, and it must cost
  // exactly what the old one-at-a-time insertion cost — no sort, no batch
  // machinery, no allocation — or making the bulk case fast would have
  // bought it out of the pattern the engine's own reads produce.
  if (m === 1) {
    const k = fresh[0];
    fresh.length = 0;
    if (old[old.length - 1] < k) old.push(k);
    else old.splice(lowerBound(old, k), 0, k);
    return old;
  }
  fresh.sort();
  // the ascending case: arrivals all follow what is already there
  if (old[old.length - 1] < fresh[0]) {
    for (const k of fresh) old.push(k);
    fresh.length = 0;
    return old;
  }
  if (m < MERGE_MIN) {
    for (const k of fresh) old.splice(lowerBound(old, k), 0, k);
    fresh.length = 0;
    return old;
  }
  const out = new Array<string>(old.length + m);
  let i = 0, j = 0, o = 0;
  while (i < old.length && j < m) out[o++] = old[i] < fresh[j] ? old[i++] : fresh[j++];
  while (i < old.length) out[o++] = old[i++];
  while (j < m) out[o++] = fresh[j++];
  fresh.length = 0;
  run.canon = out;
  return out;
}

/** First position in a sorted array whose key is not less than `key`. */
function lowerBound(arr: string[], key: string): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < key) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** THE STORAGE PORT. Everything the kernel asks of a fact store, and nothing
 *  about how one is built. `Store` below is the reference implementation and
 *  the default; an adapter over a third-party engine lives OUTSIDE `src/`, so
 *  the kernel keeps the zero-dependency property that is its whole occupied
 *  cell. Which implementation is in play is the mode: constructing `Store` is
 *  `memory`, constructing an adapter is `external`. The flag itself lives with
 *  the adapters, because a kernel file may not hold identifier-shaped strings
 *  outside the documented vocabulary (scripts/kernel_grep.ts).
 *
 *  THE CONFORMANCE ORACLE IS THIS FILE. `Store` is the reference, so an
 *  adapter is correct exactly when it produces a byte-identical
 *  `canonicalState()` on the same program. Four properties that oracle rests
 *  on, each a consequence of the kernel's determinism rather than of taste:
 *
 *   1. `relPersp` and `relAll` answer in canonical KEY order. `canonicalState`
 *      and every golden capture rest on it.
 *   2. `allFacts` answers in ARRIVAL order, which is what the in-memory Map
 *      gives and what `assumptionOf` in the evaluator reads. An adapter needs
 *      a sequence column to reproduce it; sorting there is a silent
 *      divergence, not a tidier answer.
 *   3. `argMatches` may answer in ANY order and may over-answer: its one
 *      consumer unifies over the candidates and totally sorts what survives
 *      (see `matchPremise`). It may NOT under-answer.
 *   4. `clone` is a fork, not a view: writes to one must not reach the other.
 *
 *  NOT IN THE PORT, deliberately: `facts`, `witnesses` and `firings`. They are
 *  the in-memory store's own tables, and every kernel read of them has moved
 *  to the accessors below — so an adapter is free to have no such map at all.
 *  Two tests still reach for them through the concrete `Store`, which is why
 *  the fields remain public THERE and absent HERE.
 */
export interface FactStore {
  tick: number;
  dirty: boolean;
  partialEval: boolean;
  tickLog: string[];
  evalLog: Map<number, EvalRecord>;
  derivedKeys: Map<string, string>;
  derivedSchedule: string;

  add(rel: string, persp: string, args: Term[],
      opts: { scope: Scope; base: boolean; frozen?: boolean }): boolean;
  has(key: string): boolean;
  get(key: string): FactRec | undefined;
  remove(key: string): boolean;
  relPersp(rel: string, persp: string): FactRec[];
  relAll(rel: string): FactRec[];
  indexed(rel: string, persp: string | null): boolean;
  argMatches(rel: string, persp: string | null, arity: number,
             pos: number[], vals: string[]): FactRec[] | null;
  perspectivesOf(rel: string): string[];
  relCount(rel: string): number;
  clearDerived(keep?: (rec: FactRec) => boolean): void;
  support(key: string, sig: string, w: Witness): boolean;
  supportCount(key: string): number;
  witnessesOf(key: string): Witness[];
  noteEval(budget: number, steps: number, partial: boolean): void;
  evalOf(tick: number): EvalRecord | undefined;
  advanceTick(staged: { rel: string; persp: string; args: Term[] }[],
              keepFrozen?: (rec: FactRec) => boolean): void;
  canonicalState(): string;
  snapshot(): string;
  clone(): FactStore;

  /** The sealed surface: what the five direct field accesses used to be. */
  allFactKeys(): string[];
  allFacts(): FactRec[];
  factCount(): number;
  witnessOf(key: string): Witness | undefined;
  allWitnesses(): Map<string, Witness>;
}

export class Store implements FactStore {
  tick = 0;
  facts = new Map<string, FactRec>();
  witnesses = new Map<string, Witness>();       // fact key -> canonical (first) witness
  firings = new Map<string, Map<string, Witness>>(); // fact key -> firing signature -> witness
  tickLog: string[] = [];
  dirty = true;          // derived layer out of date w.r.t. base facts
  partialEval = false;   // last evaluation hit its budget

  /** What each tick's STANDING evaluation ran under, by tick.
   *
   *  WHY HERE. `partialEval` is where a reader already looks to ask "did this
   *  evaluation finish", and it answers with a boolean about the last one
   *  only. A past tick is reconstructable exactly — same program, same dated
   *  inputs, bit-identical fixpoint (docs/time-and-continuity.md, "Past
   *  states: stored, or reconstructed") — but ONLY if the replay is given the
   *  same budget: a tick cut short at 100_000 steps and replayed at 500_000
   *  derives more, and the replay disagrees with history while claiming to be
   *  it. So the number sits beside the boolean it completes, and carries the
   *  step count with it, which is what distinguishes a tick that stopped
   *  because it was finished from one that stopped because it ran out.
   *
   *  It is deliberately NOT in `canonicalState`: two stores agreeing on every
   *  fact and every witness must compare equal whatever their fixpoints cost
   *  to compute, which is the determinism claim `examples/oops` rests on. It
   *  IS in `snapshot`, because a replay starts from one.
   *
   *  No retention policy trims this. It is three numbers per tick against
   *  the ~2000 provenance facts per tick a policy exists to drop, and it is
   *  precisely what lets the dropped ones be rebuilt. */
  evalLog = new Map<number, EvalRecord>();

  /** Per-relation fingerprint of the inputs the last evaluation derived that
   *  relation from. The evaluator writes it and reads it back; the store only
   *  carries it, and drops it whenever the clock moves. Deliberately NOT part
   *  of `snapshot`: a restored store starts cold and recomputes. */
  derivedKeys = new Map<string, string>();

  /** The stratum table the last evaluation actually ran under, serialized.
   *  It is an input to every derivation and it is in NO relation's dependency
   *  cone: the kernel reads `stratum/2` to order its negation phases, and no
   *  rule reads it at all. Reuse is only sound while it holds still. */
  derivedSchedule = '';

  private idx = new Map<string, Map<string, KeyRun>>(); // rel -> persp -> keys

  /** Add a fact. Returns true if it was new. */
  add(rel: string, persp: string, args: Term[], opts: { scope: Scope; base: boolean; frozen?: boolean }): boolean {
    const key = factKey(rel, persp, args);
    const existing = this.facts.get(key);
    if (existing) {
      // base assertion wins over an earlier derived copy
      if (opts.base && !existing.base) existing.base = true;
      return false;
    }
    this.facts.set(key, { key, rel, persp, args, scope: opts.scope, base: opts.base, frozen: opts.frozen ?? false });
    let byP = this.idx.get(rel);
    if (!byP) { byP = new Map(); this.idx.set(rel, byP); }
    let run = byP.get(persp);
    if (!run) { run = newRun(); byP.set(persp, run); }
    // `facts` already rejected the duplicate, so this key is not in the run:
    // append, and let the next read pay for putting the batch back in order
    run.arrived.push(key);
    if (!args.every(isGround)) run.loose.push(key);
    else if (run.byPat) run.staged.push(key);
    return true;
  }

  has(key: string): boolean { return this.facts.has(key); }
  get(key: string): FactRec | undefined { return this.facts.get(key); }

  remove(key: string): boolean {
    const rec = this.facts.get(key);
    if (!rec) return false;
    this.facts.delete(key);
    this.witnesses.delete(key);
    this.firings.delete(key);
    const run = this.idx.get(rec.rel)?.get(rec.persp);
    if (run) {
      const arr = absorb(run);
      const i = lowerBound(arr, key);
      if (arr[i] === key) arr.splice(i, 1);
      dropPatterns(run);
      if (run.loose.length > 0) {
        const at = run.loose.indexOf(key);
        if (at >= 0) run.loose.splice(at, 1);
      }
    }
    return true;
  }

  /** Drop many facts in one pass. The mirror image of `add`: a whole derived
   *  layer leaves in the same non-key order it arrived in, and removing it a
   *  key at a time is the same memmove per fact that `add` no longer pays. */
  private removeMany(keys: string[]): void {
    if (keys.length === 0) return;
    const gone = new Set<string>();
    const touched = new Map<string, Set<string>>();  // rel -> perspectives
    for (const key of keys) {
      const rec = this.facts.get(key);
      if (!rec) continue;
      this.facts.delete(key);
      this.witnesses.delete(key);
      this.firings.delete(key);
      gone.add(key);
      let ps = touched.get(rec.rel);
      if (!ps) { ps = new Set(); touched.set(rec.rel, ps); }
      ps.add(rec.persp);
    }
    const stays = (k: string) => !gone.has(k);
    for (const [rel, ps] of touched) {
      const byP = this.idx.get(rel);
      if (!byP) continue;
      for (const p of ps) {
        const run = byP.get(p);
        if (!run) continue;
        // both halves keep their order under a filter, so neither needs a merge
        run.canon = run.canon.filter(stays);
        if (run.arrived.length > 0) run.arrived = run.arrived.filter(stays);
        dropPatterns(run);
        if (run.loose.length > 0) run.loose = run.loose.filter(stays);
      }
    }
  }

  /** All facts of a relation in one perspective, canonically sorted. */
  relPersp(rel: string, persp: string): FactRec[] {
    const run = this.idx.get(rel)?.get(persp);
    if (!run) return [];
    const arr = absorb(run);
    if (arr.length === 0) return [];
    return arr.map((k) => this.facts.get(k)!).filter(Boolean);
  }

  /** All facts of a relation across perspectives, canonically sorted. */
  relAll(rel: string): FactRec[] {
    const byP = this.idx.get(rel);
    if (!byP) return [];
    const persps = [...byP.keys()].sort();
    const out: FactRec[] = [];
    for (const p of persps) out.push(...this.relPersp(rel, p));
    return out;
  }

  /** Whether an argument index stands, or is worth building, for a relation.
   *
   *  Asked BEFORE the canonical probe values are rendered, because rendering
   *  them is work a relation too small to index would never repay — and a
   *  program can carry hundreds of small relations (examples/wtf/ carries
   *  193) that a premise reaches on every round. */
  indexed(rel: string, persp: string | null): boolean {
    const byP = this.idx.get(rel);
    if (!byP) return false;
    if (persp !== null) {
      const run = byP.get(persp);
      return !!run && (run.byPat !== null || run.canon.length + run.arrived.length >= MIN_INDEXED);
    }
    let n = 0;
    for (const run of byP.values()) {
      if (run.byPat) return true;
      n += run.canon.length + run.arrived.length;
    }
    return n >= MIN_INDEXED;
  }

  /** Facts of a relation that CAN match a premise whose arguments at the
   *  positions `pos` (ascending, all below `arity`) resolve to the canonical
   *  values `vals`. Null means the store declines and the caller must scan.
   *
   *  This is an ADDITION to the `(relation, perspective)` index, never a
   *  replacement: `relPersp`/`relAll` keep answering in canonical key order
   *  and everything that rests on that — `canonicalState`, the golden
   *  captures, witness ordering — is untouched. What comes back here is a
   *  candidate SUPERSET in no promised order, because its only consumer
   *  unifies over it and sorts what survives.
   *
   *  Superset, precisely: a stored fact whose argument at an indexed position
   *  is ground can only unify with a ground probe value it is EQUAL to, and
   *  equal ground terms have equal canonical renderings. Facts that are not
   *  ground there are in `loose` and are returned by every probe. */
  argMatches(rel: string, persp: string | null, arity: number,
             pos: number[], vals: string[]): FactRec[] | null {
    if (pos.length === 0) return null;
    const byP = this.idx.get(rel);
    if (!byP) return [];
    if (persp === null) {
      // an open perspective reads across all of them; a relation may be
      // indexed in one and too small in the next, so each answers for itself
      const out: FactRec[] = [];
      for (const p of [...byP.keys()].sort()) {
        const part = this.argMatches(rel, p, arity, pos, vals);
        if (part === null) out.push(...this.relPersp(rel, p));
        else out.push(...part);
      }
      return out;
    }
    const run = byP.get(persp);
    if (!run) return [];

    // Every argument bound: the premise names at most one fact and the fact
    // map already answers by key. Building a hash over all arguments would
    // only rebuild the map that is standing there.
    if (pos.length === arity) {
      const rec = this.facts.get(`${rel}[${persp}](${vals.join(',')})`);
      if (run.loose.length === 0) return rec ? [rec] : [];
      const out = rec ? [rec] : [];
      for (const k of run.loose) {
        const r = this.facts.get(k);
        if (r && r !== rec) out.push(r);
      }
      return out;
    }

    let mask = 0;
    for (const p of pos) {
      if (p > 30) return null;   // a pattern is a bitmask; wider is a scan
      mask |= 1 << p;
    }
    let byPat = run.byPat;
    if (!byPat) {
      if (run.canon.length + run.arrived.length < MIN_INDEXED) return null;
      byPat = new Map();
      run.byPat = byPat;
    }
    const known = byPat.get(mask);
    let byVal: Map<string, string[]>;
    if (known) {
      byVal = known;
      this.foldStaged(run);
    } else {
      if (byPat.size >= MAX_PATTERNS) return null;
      this.foldStaged(run);
      byVal = new Map();
      // built off the canonical run, so a fresh index's buckets are in key
      // order — one less way for two runs of the same program to differ
      for (const k of absorb(run)) {
        const rec = this.facts.get(k);
        if (rec) bucketAdd(byVal, pos, rec.args, k);
      }
      byPat.set(mask, byVal);
    }
    const hit = byVal.get(joinSig(vals));
    if (!hit) {
      if (run.loose.length === 0) return [];
      return run.loose.map((k) => this.facts.get(k)!).filter(Boolean);
    }
    const out = hit.map((k) => this.facts.get(k)!).filter(Boolean);
    if (run.loose.length > 0) {
      for (const k of run.loose) { const r = this.facts.get(k); if (r) out.push(r); }
    }
    return out;
  }

  /** Bring every live pattern of one run up to date with the facts added
   *  since the last fold. Patterns are folded outside the arrivals so a mask
   *  is decoded once per batch rather than once per fact. */
  private foldStaged(run: KeyRun): void {
    const st = run.staged;
    if (st.length === 0 || !run.byPat) return;
    for (const [mask, byVal] of run.byPat) {
      const pos = maskPos(mask);
      for (const k of st) {
        const rec = this.facts.get(k);
        if (rec) bucketAdd(byVal, pos, rec.args, k);
      }
    }
    st.length = 0;
  }

  perspectivesOf(rel: string): string[] {
    const byP = this.idx.get(rel);
    return byP ? [...byP.keys()].sort() : [];
  }

  relCount(rel: string): number {
    let n = 0;
    const byP = this.idx.get(rel);
    // a count is order-blind, so it is the one read that never absorbs
    if (byP) for (const run of byP.values()) n += run.canon.length + run.arrived.length;
    return n;
  }

  /** Drop the derived (non-base, non-frozen) layer before re-evaluation.
   *  `keep` names records the caller has proved a re-derivation would produce
   *  identically; everything it does not name goes, as before. */
  clearDerived(keep?: (rec: FactRec) => boolean): void {
    const toDrop: string[] = [];
    for (const rec of this.facts.values()) {
      if (!rec.base && !rec.frozen && !(keep && keep(rec))) toDrop.push(rec.key);
    }
    this.removeMany(toDrop);
    this.partialEval = false;
  }

  /** Record a firing supporting a fact. Every firing keeps its witness (the
   *  support hypergraph); `witnesses` keeps the first one, which is what a
   *  derivation tree renders. Returns true if this signature was new. */
  support(key: string, sig: string, w: Witness): boolean {
    let sigs = this.firings.get(key);
    if (!sigs) { sigs = new Map(); this.firings.set(key, sigs); }
    if (sigs.has(sig)) return false;
    sigs.set(sig, w);
    if (!this.witnesses.has(key)) this.witnesses.set(key, w);
    return true;
  }

  supportCount(key: string): number { return this.firings.get(key)?.size ?? 0; }

  /** Every witness supporting a fact, ordered by firing signature — the
   *  hypergraph edges into `key`. Order never depends on insertion. */
  witnessesOf(key: string): Witness[] {
    const sigs = this.firings.get(key);
    if (!sigs) return [];
    return [...sigs.keys()].sort().map((s) => sigs.get(s)!);
  }

  /** Record what the evaluation standing at the current tick ran under. A
   *  later evaluation of the same tick replaces it: the last one is the one
   *  that produced the state a replay has to reproduce. */
  noteEval(budget: number, steps: number, partial: boolean): void {
    this.evalLog.set(this.tick, { budget, steps, partial });
  }

  evalOf(tick: number): EvalRecord | undefined { return this.evalLog.get(tick); }

  /** End the current tick: freeze provenance, drop tick-scoped facts,
   *  install the staged next-tick base facts, advance the clock.
   *
   *  `keepFrozen`, when given, is asked about every record on the frozen
   *  layer — including records frozen by EARLIER ticks, so that one can age
   *  out — and everything it rejects is dropped instead of kept. Without it
   *  nothing is dropped, which is what this has always done. The store knows
   *  what none of those records mean: the policy is the caller's, and it
   *  lives in `src/api.ts` beside the evaluator predicate it depends on. */
  advanceTick(staged: { rel: string; persp: string; args: Term[] }[],
              keepFrozen?: (rec: FactRec) => boolean): void {
    const stale: string[] = [];
    for (const rec of this.facts.values()) {
      if (rec.base || rec.scope !== 'timeless') continue;
      if (keepFrozen && !keepFrozen(rec)) { stale.push(rec.key); continue; }
      rec.frozen = true;
    }
    const toDrop: string[] = [];
    for (const rec of this.facts.values()) if (rec.scope === 'tick') toDrop.push(rec.key);
    // Provenance a staged fact re-enters the next tick with is read out
    // before the drop and put back after it, in the same order as before:
    // removal takes the witness with the fact, and a batch removal is still
    // a removal.
    const keptWitnessKeys = new Set(staged.map((f) => factKey(f.rel, f.persp, f.args)));
    const heldW: [string, Witness][] = [];
    const heldF: [string, Map<string, Witness>][] = [];
    for (const k of toDrop) {
      if (!keptWitnessKeys.has(k)) continue;
      const w = this.witnesses.get(k);
      const f = this.firings.get(k);
      if (w) heldW.push([k, w]);
      if (f) heldF.push([k, f]);
    }
    this.removeMany(toDrop);
    for (const [k, w] of heldW) this.witnesses.set(k, w);
    for (const [k, f] of heldF) this.firings.set(k, f);
    // A separate batch, and disjoint from the one above: nothing on the frozen
    // layer is tick-scoped, so no staged fact's witness is at risk here.
    if (stale.length > 0) this.removeMany(stale);
    this.tick++;
    for (const f of staged) this.add(f.rel, f.persp, f.args, { scope: 'tick', base: true });
    this.dirty = true;
    // Every derived fact just dropped, and every witness the next evaluation
    // writes carries the new clock. Nothing derived survives a tick boundary,
    // so nothing about the previous tick may be reused across one.
    this.derivedKeys.clear();
    this.derivedSchedule = '';
  }

  /** Every fact key, canonically sorted. What `[...facts.keys()].sort()` was
   *  at three call sites, and the same string-by-string order, so nothing
   *  that rested on it moves. */
  allFactKeys(): string[] { return [...this.facts.keys()].sort(); }

  /** Every fact record, in ARRIVAL order — the order a Map hands back, which
   *  is what the evaluator's assumption pass has always seen. Deliberately
   *  NOT sorted: sorting here would be a behaviour change disguised as a
   *  tidy-up, and it is the property an adapter is most likely to lose. */
  allFacts(): FactRec[] { return [...this.facts.values()]; }

  factCount(): number { return this.facts.size; }

  /** The canonical (first) witness of a fact, or none. */
  witnessOf(key: string): Witness | undefined { return this.witnesses.get(key); }

  /** A detached copy of the whole witness table. A copy rather than the map
   *  itself, because the caller keeps it across a `clearDerived` that empties
   *  the live one. */
  allWitnesses(): Map<string, Witness> { return new Map(this.witnesses); }

  /** Canonical serialization of everything an observer can distinguish. */
  canonicalState(): string {
    const keys = [...this.facts.keys()].sort();
    const lines: string[] = [`tick ${this.tick}`];
    for (const k of keys) {
      const r = this.facts.get(k)!;
      lines.push(`${k} ${r.scope} ${r.base ? 'base' : 'drv'}${r.frozen ? ' frozen' : ''} support=${this.supportCount(k)}`);
    }
    const wkeys = [...this.witnesses.keys()].sort();
    for (const k of wkeys) {
      const w = this.witnesses.get(k)!;
      lines.push(`wit ${k} <- ${w.ruleId}@${w.tick} [${w.prems.map((p) => p.t + ':' + (p.t === 'bi' ? p.desc : p.key)).join('; ')}]`);
    }
    lines.push(...this.tickLog);
    return lines.join('\n');
  }

  snapshot(): string {
    const facts = [...this.facts.keys()].sort().map((k) => {
      const r = this.facts.get(k)!;
      return { rel: r.rel, persp: r.persp, args: r.args.map(termToJson), scope: r.scope, base: r.base, frozen: r.frozen };
    });
    const wits = [...this.witnesses.keys()].sort().map((k) => {
      const w = this.witnesses.get(k)!;
      return { key: k, ruleId: w.ruleId, tick: w.tick, prems: w.prems };
    });
    const firings = [...this.firings.keys()].sort().map((k) => {
      const sigs = this.firings.get(k)!;
      return {
        key: k,
        sup: [...sigs.keys()].sort().map((sig) => {
          const w = sigs.get(sig)!;
          return { sig, ruleId: w.ruleId, tick: w.tick, prems: w.prems };
        }),
      };
    });
    const evals = [...this.evalLog.keys()].sort((a, b) => a - b)
      .map((t) => ({ tick: t, ...this.evalLog.get(t)! }));
    return JSON.stringify({ tick: this.tick, facts, wits, firings, tickLog: this.tickLog, evals });
  }

  static restore(json: string): Store {
    const d = JSON.parse(json);
    const s = new Store();
    s.tick = d.tick;
    s.tickLog = d.tickLog ?? [];
    for (const f of d.facts) {
      s.add(f.rel, f.persp, f.args.map(termFromJson), { scope: f.scope, base: f.base, frozen: f.frozen });
    }
    for (const w of d.wits ?? []) s.witnesses.set(w.key, { ruleId: w.ruleId, tick: w.tick, prems: w.prems });
    for (const f of d.firings ?? []) {
      const sigs = new Map<string, Witness>();
      for (const e of f.sup ?? []) sigs.set(e.sig, { ruleId: e.ruleId, tick: e.tick, prems: e.prems });
      s.firings.set(f.key, sigs);
    }
    for (const e of d.evals ?? []) {
      s.evalLog.set(e.tick, { budget: e.budget, steps: e.steps, partial: e.partial });
    }
    s.dirty = true;
    return s;
  }

  /** Deep copy (used for load rollback and excise). The copy is fact-for-fact
   *  the original, so the fingerprints that describe it carry over — that is
   *  what lets excise re-evaluate only the cone its subtraction touches.
   *
   *  STRUCTURAL, NOT SERIALISED. This was `Store.restore(this.snapshot())`
   *  until it was measured: a copy taken to be thrown away went out through
   *  JSON.stringify and came back through JSON.parse plus a re-`add` of every
   *  fact, which rebuilds every key and every run. `Rofl.load` takes one of
   *  these on EVERY load, only to keep it in case a clause is rejected, and it
   *  was 13 ms of a 108 ms parse in examples/ring1.
   *
   *  WHAT IS COPIED AND WHY. A `FactRec` is copied rather than shared because
   *  `add` mutates `base` in place on an existing record — a base assertion
   *  overriding a derived copy — so a shared record would let a write to one
   *  store reach the other, which is exactly what a rollback backup must not
   *  allow. A `Witness` is never mutated after it is built, so the Maps that
   *  hold them are rebuilt and the witnesses themselves are shared. Argument
   *  indexes are dropped rather than copied, as the serialising copy also
   *  dropped them: `byPat` is rebuilt on demand and a copy nobody reads from
   *  would pay for a structure it never amortises.
   *
   *  `dirty` is set rather than carried, which is what `restore` did. */
  clone(): Store {
    const s = new Store();
    s.tick = this.tick;
    s.tickLog = [...this.tickLog];
    for (const [k, w] of this.witnesses) s.witnesses.set(k, w);
    for (const [k, sigs] of this.firings) s.firings.set(k, new Map(sigs));
    for (const [t, e] of this.evalLog) s.evalLog.set(t, { ...e });
    // IN KEY ORDER, which is what `restore` did by re-adding a sorted
    // snapshot, and what test/store-conformance.test.ts pins as the shape of a
    // fork — the SQLite port pays 2.9x per fact to renumber its rows into it.
    // The runs are filled the way `add` fills them, arrivals unabsorbed, so
    // this copy is the serialising one fact for fact and run for run.
    const loose = new Set<string>();
    for (const byP of this.idx.values()) for (const run of byP.values()) {
      for (const k of run.loose) loose.add(k);
    }
    for (const k of [...this.facts.keys()].sort()) {
      const r = this.facts.get(k)!;
      s.facts.set(k, { ...r });
      let byP = s.idx.get(r.rel);
      if (!byP) { byP = new Map(); s.idx.set(r.rel, byP); }
      let run = byP.get(r.persp);
      if (!run) { run = newRun(); byP.set(r.persp, run); }
      run.arrived.push(k);
      if (loose.has(k)) run.loose.push(k);
    }
    s.derivedKeys = new Map(this.derivedKeys);
    s.derivedSchedule = this.derivedSchedule;
    s.dirty = true;
    return s;
  }
}
