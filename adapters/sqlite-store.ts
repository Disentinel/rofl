// sqlite-store.ts — a `FactStore` over an embedded SQLite database.
//
// WHY THIS FILE IS NOT IN src/. The kernel's occupied cell, as the landscape
// doc puts it, is "a zero-dependency kernel small enough to live inside an
// agent harness". The port (`FactStore`, in src/store.ts) is part of the
// kernel; every adapter is not. Moving this file into src/ would trade the
// property the port exists to protect.
//
// WHY node:sqlite AND NOT AN npm PACKAGE. It ships INSIDE Node 22 — no
// dependency, no native build, no install-time compilation — and its API is
// SYNCHRONOUS, which the evaluator requires: `matchPremise` cannot await.
// MEASURED on node 22.22: `require('node:sqlite')` works with NO FLAG at all;
// it prints an ExperimentalWarning and returns
// { DatabaseSync, StatementSync, constants, backup }. Note `backup` is a
// MODULE-level function returning a promise, so it is useless here — `clone`
// uses `VACUUM INTO`, which is synchronous.
//
// THE FOUR PROPERTIES THE PORT DEMANDS, and where each is met:
//  1. sorted keys      — `relPersp`/`relAll` sort in JS, not in SQL (see
//                        `sortKeys` for why SQL's order is not the same one).
//  2. seminaive lookup — `argMatches` hits an argument-column index.
//  3. no kernel dep    — this file is outside src/ and nothing in src/ imports it.
//  4. fork             — `clone` is `VACUUM INTO`; the cost is measured, not assumed.

import { DatabaseSync } from 'node:sqlite';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  type FactStore, type FactRec, type Witness, type PremRef, type Scope,
  type EvalRecord, factKey,
} from '../src/store.ts';
import { type Term, canonTerm, isGround, termToJson, termFromJson } from '../src/unify.ts';

/** How many argument positions get their own column. A premise binding a
 *  position beyond this is answered by a scan, exactly as the in-memory store
 *  declines past its own limits — an adapter may under-index, it may not
 *  under-answer. */
const NCOLS = 8;
/** Of those, how many carry an index. Positions past this are still FILTERED
 *  in SQL (so the answer stays a superset and never a subset); they just cost
 *  a partition scan rather than a seek. */
const NINDEXED = 3;

const COLS = Array.from({ length: NCOLS }, (_, i) => `a${i}`);

let cloneCounter = 0;

function tempPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rofl-sqlite-'));
  return path.join(dir, `store-${++cloneCounter}.db`);
}

/** Temporary directories this process created and has not removed.
 *
 *  WHY THIS EXISTS, and it is not hypothetical. A file-backed store has a
 *  lifetime the in-memory one never had, and `Rofl.load` FORKS ON EVERY CALL
 *  to hold a rollback copy which it then drops on the floor when the load
 *  succeeds — nothing tells the fork it is dead. MEASURED after one run of the
 *  conformance suite and the benchmarks: 174 abandoned directories under the
 *  system temp dir. The in-memory store had no such duty because the garbage
 *  collector was the whole of its cleanup, so this is a cost the port ADDS and
 *  the port has to pay rather than pass on.
 *
 *  Two nets, because either alone leaks. The registry reclaims a fork the
 *  moment the collector proves nobody holds it, which is what makes a long run
 *  survivable; the exit hook catches whatever is still live when the process
 *  ends. A caller that knows when a fork is finished should still call
 *  `close()` — that is immediate, and neither net is. */
const liveDirs = new Set<string>();

function forget(dir: string): void {
  liveDirs.delete(dir);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ }
}

const reaper = new FinalizationRegistry<{ dir: string; db: DatabaseSync }>((held) => {
  try { held.db.close(); } catch { /* already closed */ }
  forget(held.dir);
});

let exitHookInstalled = false;
function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on('exit', () => { for (const d of [...liveDirs]) forget(d); });
}

/** Canonical key order, in JS and not in SQL.
 *
 *  NOT A BELT-AND-BRACES SORT. SQLite's default TEXT collation is BINARY,
 *  which compares UTF-8 BYTES; JavaScript's `<` compares UTF-16 CODE UNITS.
 *  The two agree across the whole BMP and DISAGREE above it: a supplementary
 *  character (any emoji) is a surrogate pair in UTF-16, and surrogates sit at
 *  U+D800..U+DFFF, BELOW U+E000..U+FFFF — while its UTF-8 encoding sorts above
 *  every BMP character. So one emoji anywhere in a fact argument makes SQL's
 *  ORDER BY and `canonicalState`'s order differ, and the conformance oracle
 *  would report a difference that is really this. Sorting here costs one pass
 *  over an already-ordered array, which is where a comparison sort is cheapest.
 */
function sortKeys(keys: string[]): string[] { return keys.sort(); }

interface Row {
  key: string; rel: string; persp: string; args: string;
  scope: string; base: number; frozen: number;
}

function recOf(r: Row): FactRec {
  return {
    key: r.key, rel: r.rel, persp: r.persp,
    args: (JSON.parse(r.args) as unknown[]).map(termFromJson),
    scope: r.scope as Scope,
    base: r.base !== 0,
    frozen: r.frozen !== 0,
  };
}

export class SqliteStore implements FactStore {
  // --- state the kernel keeps in the object rather than in the facts. Three
  // numbers, a string list and two small maps: one entry per TICK and one per
  // RELATION, never one per fact, so there is nothing here to push down.
  tick = 0;
  dirty = true;
  partialEval = false;
  tickLog: string[] = [];
  evalLog = new Map<number, EvalRecord>();
  derivedKeys = new Map<string, string>();
  derivedSchedule = '';

  readonly file: string;
  private db: DatabaseSync;
  private seq = 0;
  private wseq = 0;
  private fseq = 0;
  /** Whether a write transaction is standing.
   *
   *  WHY THE STORE OPENS ONE ITSELF. The kernel writes a fact at a time and
   *  has no notion of a batch, so every `add` would otherwise be its own
   *  transaction — and in SQLite a transaction is a WAL commit record, which
   *  is the dominant cost of a small insert. MEASURED on this machine, 50000
   *  arity-3 facts, load 15-21: 339.5 us/fact one transaction per row against
   *  96.6 us/fact for the same rows and the same schema inside ONE, a factor
   *  of 3.5 paid for nothing.
   *
   *  Safe without a batch API because there is ONE connection: reads inside an
   *  open write transaction see the uncommitted rows, so nothing observes a
   *  half-written store. It is committed before anything that cannot run
   *  inside a transaction (`VACUUM INTO`) and before the connection closes.
   *  What it gives up is durability across a crash mid-run, which is not a
   *  regression on a store whose reference implementation is a Map. */
  private txOpen = false;

  /** Prepared statements by SQL text. `prepare` PARSES AND PLANS, and
   *  `argMatches` builds its WHERE clause from the binding pattern it is
   *  handed, so a naive implementation re-parses on every premise the fixpoint
   *  evaluates. The number of distinct texts is bounded by the number of
   *  binding patterns the RULES use, which is small and fixed. */
  private stmts = new Map<string, ReturnType<DatabaseSync['prepare']>>();

  /** True once a fact holding a non-ground argument has been added. Such a
   *  fact belongs to no argument bucket and to EVERY answer, so it has to be
   *  unioned into every probe -- and doing that with `OR loose = 1` inside the
   *  same WHERE clause is what makes the argument index useless.
   *
   *  MEASURED, and this was a real defect rather than a precaution. With the
   *  OR in place, EXPLAIN QUERY PLAN degrades from
   *    SEARCH f USING COVERING INDEX (rel=? AND persp=? AND a0=?)
   *  to
   *    SEARCH f USING INDEX (rel=? AND persp=?)
   *  -- a seek to the relation followed by a SCAN of its whole partition. On
   *  2000 bound probes over 20000 facts in one relation that measured 15118
   *  us/probe against the in-memory store's 22 us/probe, a factor of 687, at
   *  load 6.4 on this machine. The seminaive front had degraded into exactly
   *  the scan the port's second constraint forbids, and no test saw it because
   *  the ANSWER was right. Splitting the loose facts into their own indexed
   *  query keeps the main probe on the covering index; the flag then skips
   *  even that query in every program in this repository, none of which can
   *  produce a loose fact.
   *
   *  Never cleared: a removal that takes the last loose fact costs one extra
   *  indexed lookup returning nothing. Wrong in the cheap direction. */
  private anyLoose = false;

  // prepared statements: preparing costs a parse, and these run per fact
  private sAdd!: ReturnType<DatabaseSync['prepare']>;
  private sGet!: ReturnType<DatabaseSync['prepare']>;
  private sHas!: ReturnType<DatabaseSync['prepare']>;
  private sDel!: ReturnType<DatabaseSync['prepare']>;
  private sSetBase!: ReturnType<DatabaseSync['prepare']>;

  /** Set only for a directory the ADAPTER created, so a caller who named a
   *  file keeps it: only what the adapter made does the adapter remove. */
  private ownDir: string | null;

  constructor(file?: string) {
    const own = file === undefined;
    this.file = file ?? tempPath();
    this.ownDir = own ? path.dirname(this.file) : null;
    this.db = new DatabaseSync(this.file);
    this.init();
    if (this.ownDir !== null) this.watchDir();
  }

  private watchDir(): void {
    if (this.ownDir === null) return;
    liveDirs.add(this.ownDir);
    installExitHook();
    reaper.register(this, { dir: this.ownDir, db: this.db }, this);
  }

  /** Take responsibility for a directory the adapter made for this store but
   *  handed it by path.
   *
   *  WHY THIS IS SEPARATE, and it was a real leak rather than a tidiness
   *  point. `clone` creates the fork's directory itself and then constructs
   *  the fork FROM THAT PATH — which the constructor reads, correctly, as "the
   *  caller named a file, so the caller owns it". The fork was therefore the
   *  one store that registered no cleanup at all, and since `Rofl.load` forks
   *  on every call and drops the fork, the forks were the whole leak.
   *  MEASURED with three stores made and none closed: two directories
   *  reclaimed at exit, one left — and the one left was the clone. */
  private adoptDir(dir: string): void {
    this.ownDir = dir;
    this.watchDir();
  }

  /** A prepared statement for this text, parsed at most once. */
  private prep(sql: string): ReturnType<DatabaseSync['prepare']> {
    let st = this.stmts.get(sql);
    if (!st) { st = this.db.prepare(sql); this.stmts.set(sql, st); }
    return st;
  }

  private init(): void {
    const argCols = COLS.map((c) => `${c} TEXT`).join(', ');
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = OFF;
      CREATE TABLE IF NOT EXISTS f (
        key TEXT PRIMARY KEY, rel TEXT NOT NULL, persp TEXT NOT NULL,
        args TEXT NOT NULL, scope TEXT NOT NULL,
        base INTEGER NOT NULL, frozen INTEGER NOT NULL,
        loose INTEGER NOT NULL, seq INTEGER NOT NULL, ${argCols}
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS w (
        key TEXT PRIMARY KEY, ruleId TEXT NOT NULL, tick INTEGER NOT NULL,
        prems TEXT NOT NULL, seq INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS fi (
        key TEXT NOT NULL, sig TEXT NOT NULL, ruleId TEXT NOT NULL,
        tick INTEGER NOT NULL, prems TEXT NOT NULL, seq INTEGER NOT NULL,
        PRIMARY KEY (key, sig)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS f_rel ON f (rel, persp, key);
      CREATE INDEX IF NOT EXISTS f_seq ON f (seq);
      CREATE INDEX IF NOT EXISTS f_loose ON f (rel, persp) WHERE loose = 1;
      ${COLS.slice(0, NINDEXED).map((c) =>
        `CREATE INDEX IF NOT EXISTS f_${c} ON f (rel, persp, ${c});`).join('\n      ')}
    `);
    const ph = COLS.map(() => '?').join(', ');
    this.sAdd = this.db.prepare(
      `INSERT INTO f (key, rel, persp, args, scope, base, frozen, loose, seq, ${COLS.join(', ')})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${ph})`);
    this.sGet = this.db.prepare('SELECT key, rel, persp, args, scope, base, frozen FROM f WHERE key = ?');
    this.sHas = this.db.prepare('SELECT 1 FROM f WHERE key = ?');
    this.sDel = this.db.prepare('DELETE FROM f WHERE key = ?');
    this.sSetBase = this.db.prepare('UPDATE f SET base = 1 WHERE key = ?');
    const mx = this.db.prepare('SELECT MAX(seq) AS m FROM f').get() as unknown as { m: number | null };
    this.seq = mx?.m ?? 0;
    const mw = this.db.prepare('SELECT MAX(seq) AS m FROM w').get() as unknown as { m: number | null };
    this.wseq = mw?.m ?? 0;
    const mf = this.db.prepare('SELECT MAX(seq) AS m FROM fi').get() as unknown as { m: number | null };
    this.fseq = mf?.m ?? 0;
  }

  private beginTx(): void {
    if (!this.txOpen) { this.db.exec('BEGIN'); this.txOpen = true; }
  }

  /** Land everything written so far. Called before `VACUUM INTO` (which cannot
   *  run inside a transaction) and on `close`; a caller wanting the file to be
   *  readable by another process may call it too. */
  commit(): void {
    if (this.txOpen) { this.db.exec('COMMIT'); this.txOpen = false; }
  }

  // -------------------------------------------------------------------------
  // facts

  add(rel: string, persp: string, args: Term[],
      opts: { scope: Scope; base: boolean; frozen?: boolean }): boolean {
    this.beginTx();
    const key = factKey(rel, persp, args);
    // the flag only: fetching the args blob to answer "is it there" pulls the
    // widest column in the table in order to throw it away
    const existing = this.prep('SELECT base FROM f WHERE key = ?').get(key) as unknown as { base: number } | undefined;
    if (existing) {
      if (opts.base && existing.base === 0) this.sSetBase.run(key);
      return false;
    }
    const loose = args.every(isGround) ? 0 : 1;
    if (loose === 1) this.anyLoose = true;
    const cols: (string | null)[] = [];
    for (let i = 0; i < NCOLS; i++) {
      const a = args[i];
      cols.push(a !== undefined && isGround(a) ? canonTerm(a) : null);
    }
    this.sAdd.run(
      key, rel, persp, JSON.stringify(args.map(termToJson)), opts.scope,
      opts.base ? 1 : 0, (opts.frozen ?? false) ? 1 : 0, loose, ++this.seq,
      ...cols);
    return true;
  }

  has(key: string): boolean { return this.sHas.get(key) !== undefined; }

  get(key: string): FactRec | undefined {
    const r = this.sGet.get(key) as unknown as Row | undefined;
    return r ? recOf(r) : undefined;
  }

  remove(key: string): boolean {
    if (!this.has(key)) return false;
    this.beginTx();
    this.sDel.run(key);
    this.prep('DELETE FROM w WHERE key = ?').run(key);
    this.prep('DELETE FROM fi WHERE key = ?').run(key);
    return true;
  }

  private removeMany(keys: string[]): void {
    if (keys.length === 0) return;
    const df = this.prep('DELETE FROM f WHERE key = ?');
    const dw = this.prep('DELETE FROM w WHERE key = ?');
    const dfi = this.prep('DELETE FROM fi WHERE key = ?');
    this.beginTx();
    for (const k of keys) { df.run(k); dw.run(k); dfi.run(k); }
  }

  /** Canonically sorted, as the port requires: `canonicalState`, the golden
   *  captures and witness ordering all rest on this order. */
  relPersp(rel: string, persp: string): FactRec[] {
    const rows = this.prep(
      'SELECT key, rel, persp, args, scope, base, frozen FROM f WHERE rel = ? AND persp = ?')
      .all(rel, persp) as unknown as Row[];
    return this.ordered(rows);
  }

  relAll(rel: string): FactRec[] {
    const rows = this.prep(
      'SELECT key, rel, persp, args, scope, base, frozen FROM f WHERE rel = ?')
      .all(rel) as unknown as Row[];
    return this.ordered(rows);
  }

  /** Sort by key in JS (see `sortKeys`) and decode. Decoding after the sort,
   *  not before, so nothing is parsed that the order would not have kept. */
  private ordered(rows: Row[]): FactRec[] {
    if (rows.length === 0) return [];
    const byKey = new Map<string, Row>();
    for (const r of rows) byKey.set(r.key, r);
    return sortKeys([...byKey.keys()]).map((k) => recOf(byKey.get(k)!));
  }

  /** A backed store always has its index standing, so it never declines on
   *  size. Declining is not free of consequence and it is not a divergence
   *  either: the evaluator treats null as "scan", and a scan and an index
   *  answer with the same MATCHES because `matchPremise` totally sorts what
   *  survives unification. What changes is cost, not output. */
  indexed(rel: string, persp: string | null): boolean {
    const row = persp === null
      ? this.prep('SELECT 1 FROM f WHERE rel = ? LIMIT 1').get(rel)
      : this.prep('SELECT 1 FROM f WHERE rel = ? AND persp = ? LIMIT 1').get(rel, persp);
    return row !== undefined;
  }

  argMatches(rel: string, persp: string | null, arity: number,
             pos: number[], vals: string[]): FactRec[] | null {
    if (pos.length === 0) return null;
    for (const p of pos) if (p >= NCOLS) return null;   // wider than the columns: scan

    // Every argument bound names at most one fact, and the primary key already
    // answers by key — the same shortcut the in-memory store takes, for the
    // same reason. The loose facts still have to come with it.
    if (pos.length === arity && persp !== null) {
      const rec = this.get(`${rel}[${persp}](${vals.join(',')})`);
      if (!this.anyLoose) return rec ? [rec] : [];
      const loose = this.looseOf(rel, persp);
      if (loose.length === 0) return rec ? [rec] : [];
      const out = rec ? [rec] : [];
      for (const l of loose) if (!rec || l.key !== rec.key) out.push(l);
      return out;
    }

    const { sql, args } = this.probeSql(rel, persp, pos, vals);
    const rows = this.prep(sql).all(...args) as unknown as Row[];
    const out = rows.map(recOf);
    // The facts holding a variable, unioned in from their own partial index
    // rather than OR-ed into the clause above. A fact with a variable in it
    // unifies with values it is not equal to, so it belongs to no bucket and
    // to EVERY answer: dropping it would make this a SUBSET, the one thing an
    // argument index may never be. See `anyLoose` for what the OR form cost.
    if (this.anyLoose) {
      const lw = persp !== null ? 'rel = ? AND persp = ? AND loose = 1' : 'rel = ? AND loose = 1';
      const la = persp !== null ? [rel, persp] : [rel];
      const lrows = this.prep(`SELECT key, rel, persp, args, scope, base, frozen FROM f WHERE ${lw}`)
        .all(...la) as unknown as Row[];
      const seen = new Set(out.map((f) => f.key));
      for (const r of lrows) if (!seen.has(r.key)) out.push(recOf(r));
    }
    // Order is explicitly NOT promised here (see the port's property 3), so
    // this is the one read that does not pay for a sort.
    return out;
  }

  /** The probe query and its bindings, in one place so that what runs and what
   *  `probePlan` explains cannot drift apart. */
  private probeSql(rel: string, persp: string | null, pos: number[], vals: string[]):
      { sql: string; args: (string | null)[] } {
    const where: string[] = ['rel = ?'];
    const args: (string | null)[] = [rel];
    if (persp !== null) { where.push('persp = ?'); args.push(persp); }
    for (let i = 0; i < pos.length; i++) { where.push(`a${pos[i]} = ?`); args.push(vals[i]); }
    return { sql: `SELECT key, rel, persp, args, scope, base, frozen FROM f WHERE ${where.join(' AND ')}`, args };
  }

  /** How SQLite says it will answer a probe. Exposed because the difference
   *  between a seek and a scan is invisible to every correctness test — the
   *  answer is right either way — and a timing assertion for it would be a
   *  flake. The plan text is not.  */
  probePlan(rel: string, persp: string | null, pos: number[], vals: string[]): string[] {
    const { sql, args } = this.probeSql(rel, persp, pos, vals);
    return this.explain(sql, args);
  }

  /** How SQLite says it will answer any query against this store's schema.
   *  Present so that a test asserting "the probe does not scan" can also show
   *  that the assertion is CAPABLE of failing, by explaining the form that
   *  did scan. A gate with no demonstrated no is a assumption with an
   *  interface. */
  explain(sql: string, args: (string | null)[] = []): string[] {
    const rows = this.prep('EXPLAIN QUERY PLAN ' + sql).all(...args) as unknown as { detail: string }[];
    return rows.map((r) => r.detail);
  }

  private looseOf(rel: string, persp: string): FactRec[] {
    const rows = this.prep(
      'SELECT key, rel, persp, args, scope, base, frozen FROM f WHERE rel = ? AND persp = ? AND loose = 1')
      .all(rel, persp) as unknown as Row[];
    return rows.map(recOf);
  }

  perspectivesOf(rel: string): string[] {
    const rows = this.prep('SELECT DISTINCT persp FROM f WHERE rel = ?').all(rel) as unknown as { persp: string }[];
    return rows.map((r) => r.persp).sort();
  }

  relCount(rel: string): number {
    const r = this.prep('SELECT COUNT(*) AS n FROM f WHERE rel = ?').get(rel) as unknown as { n: number };
    return r.n;
  }

  clearDerived(keep?: (rec: FactRec) => boolean): void {
    const rows = this.prep(
      'SELECT key, rel, persp, args, scope, base, frozen FROM f WHERE base = 0 AND frozen = 0 ORDER BY seq')
      .all() as unknown as Row[];
    const drop: string[] = [];
    for (const r of rows) {
      if (keep) { const rec = recOf(r); if (keep(rec)) continue; }
      drop.push(r.key);
    }
    this.removeMany(drop);
    this.partialEval = false;
  }

  // -------------------------------------------------------------------------
  // provenance

  support(key: string, sig: string, w: Witness): boolean {
    this.beginTx();
    const had = this.prep('SELECT 1 FROM fi WHERE key = ? AND sig = ?').get(key, sig);
    if (had !== undefined) return false;
    this.prep('INSERT INTO fi (key, sig, ruleId, tick, prems, seq) VALUES (?, ?, ?, ?, ?, ?)')
      .run(key, sig, w.ruleId, w.tick, JSON.stringify(w.prems), ++this.fseq);
    const hasW = this.prep('SELECT 1 FROM w WHERE key = ?').get(key);
    if (hasW === undefined) {
      this.prep('INSERT INTO w (key, ruleId, tick, prems, seq) VALUES (?, ?, ?, ?, ?)')
        .run(key, w.ruleId, w.tick, JSON.stringify(w.prems), ++this.wseq);
    }
    return true;
  }

  supportCount(key: string): number {
    const r = this.prep('SELECT COUNT(*) AS n FROM fi WHERE key = ?').get(key) as unknown as { n: number };
    return r.n;
  }

  witnessesOf(key: string): Witness[] {
    const rows = this.prep('SELECT sig, ruleId, tick, prems FROM fi WHERE key = ?')
      .all(key) as unknown as { sig: string; ruleId: string; tick: number; prems: string }[];
    return rows
      .sort((a, b) => (a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0))
      .map((r) => ({ ruleId: r.ruleId, tick: r.tick, prems: JSON.parse(r.prems) as PremRef[] }));
  }

  witnessOf(key: string): Witness | undefined {
    const r = this.prep('SELECT ruleId, tick, prems FROM w WHERE key = ?').get(key) as
      { ruleId: string; tick: number; prems: string } | undefined;
    return r ? { ruleId: r.ruleId, tick: r.tick, prems: JSON.parse(r.prems) as PremRef[] } : undefined;
  }

  allWitnesses(): Map<string, Witness> {
    const rows = this.prep('SELECT key, ruleId, tick, prems FROM w ORDER BY seq')
      .all() as unknown as { key: string; ruleId: string; tick: number; prems: string }[];
    const out = new Map<string, Witness>();
    for (const r of rows) out.set(r.key, { ruleId: r.ruleId, tick: r.tick, prems: JSON.parse(r.prems) as PremRef[] });
    return out;
  }

  noteEval(budget: number, steps: number, partial: boolean): void {
    this.evalLog.set(this.tick, { budget, steps, partial });
  }

  evalOf(tick: number): EvalRecord | undefined { return this.evalLog.get(tick); }

  // -------------------------------------------------------------------------
  // sealed accessors

  /** Canonically sorted. */
  allFactKeys(): string[] {
    const rows = this.prep('SELECT key FROM f').all() as unknown as { key: string }[];
    return sortKeys(rows.map((r) => r.key));
  }

  /** ARRIVAL order — the property a Map gives for free and a table does not.
   *  `seq` is what buys it back: it is assigned on insert and never reused, so
   *  a fact removed and re-added moves to the end exactly as a Map key does. */
  allFacts(): FactRec[] {
    const rows = this.prep(
      'SELECT key, rel, persp, args, scope, base, frozen FROM f ORDER BY seq').all() as unknown as Row[];
    return rows.map(recOf);
  }

  factCount(): number {
    const r = this.prep('SELECT COUNT(*) AS n FROM f').get() as unknown as { n: number };
    return r.n;
  }

  // -------------------------------------------------------------------------
  // whole-table views. NOT part of `FactStore` — the kernel's five direct
  // field accesses were sealed behind the accessors above while this adapter
  // was being written, so nothing outside needs these. `snapshot` below still
  // finds `firings` convenient, and a caller debugging an adapter wants all
  // three. MATERIALISED, not held: each is a full pass over its table.

  get facts(): Map<string, FactRec> {
    const out = new Map<string, FactRec>();
    for (const rec of this.allFacts()) out.set(rec.key, rec);
    return out;
  }

  get witnesses(): Map<string, Witness> { return this.allWitnesses(); }

  get firings(): Map<string, Map<string, Witness>> {
    const rows = this.prep('SELECT key, sig, ruleId, tick, prems FROM fi ORDER BY seq')
      .all() as unknown as { key: string; sig: string; ruleId: string; tick: number; prems: string }[];
    const out = new Map<string, Map<string, Witness>>();
    for (const r of rows) {
      let m = out.get(r.key);
      if (!m) { m = new Map(); out.set(r.key, m); }
      m.set(r.sig, { ruleId: r.ruleId, tick: r.tick, prems: JSON.parse(r.prems) as PremRef[] });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // tick

  advanceTick(staged: { rel: string; persp: string; args: Term[] }[],
              keepFrozen?: (rec: FactRec) => boolean): void {
    const stale: string[] = [];
    const freeze: string[] = [];
    for (const r of this.prep(
      'SELECT key, rel, persp, args, scope, base, frozen FROM f WHERE base = 0 AND scope = ? ORDER BY seq')
      .all('timeless') as unknown as Row[]) {
      if (keepFrozen && !keepFrozen(recOf(r))) { stale.push(r.key); continue; }
      freeze.push(r.key);
    }
    const setFrozen = this.prep('UPDATE f SET frozen = 1 WHERE key = ?');
    this.beginTx();
    for (const k of freeze) setFrozen.run(k);

    const toDrop = (this.prep('SELECT key FROM f WHERE scope = ? ORDER BY seq')
      .all('tick') as unknown as { key: string }[]).map((r) => r.key);
    const keptWitnessKeys = new Set(staged.map((f) => factKey(f.rel, f.persp, f.args)));
    const heldW: [string, Witness][] = [];
    const heldF: [string, Map<string, Witness>][] = [];
    for (const k of toDrop) {
      if (!keptWitnessKeys.has(k)) continue;
      const w = this.witnessOf(k);
      const sigs = this.firingsOf(k);
      if (w) heldW.push([k, w]);
      if (sigs) heldF.push([k, sigs]);
    }
    this.removeMany(toDrop);
    for (const [k, w] of heldW) {
      this.prep('INSERT OR REPLACE INTO w (key, ruleId, tick, prems, seq) VALUES (?, ?, ?, ?, ?)')
        .run(k, w.ruleId, w.tick, JSON.stringify(w.prems), ++this.wseq);
    }
    for (const [k, sigs] of heldF) {
      for (const [sig, w] of sigs) {
        this.prep('INSERT OR REPLACE INTO fi (key, sig, ruleId, tick, prems, seq) VALUES (?, ?, ?, ?, ?, ?)')
          .run(k, sig, w.ruleId, w.tick, JSON.stringify(w.prems), ++this.fseq);
      }
    }
    if (stale.length > 0) this.removeMany(stale);
    this.tick++;
    for (const f of staged) this.add(f.rel, f.persp, f.args, { scope: 'tick', base: true });
    this.dirty = true;
    this.derivedKeys.clear();
    this.derivedSchedule = '';
  }

  private firingsOf(key: string): Map<string, Witness> | undefined {
    const rows = this.prep('SELECT sig, ruleId, tick, prems FROM fi WHERE key = ? ORDER BY seq')
      .all(key) as unknown as { sig: string; ruleId: string; tick: number; prems: string }[];
    if (rows.length === 0) return undefined;
    const m = new Map<string, Witness>();
    for (const r of rows) m.set(r.sig, { ruleId: r.ruleId, tick: r.tick, prems: JSON.parse(r.prems) as PremRef[] });
    return m;
  }

  // -------------------------------------------------------------------------
  // serialization

  canonicalState(): string {
    const lines: string[] = [`tick ${this.tick}`];
    for (const k of this.allFactKeys()) {
      const r = this.get(k)!;
      lines.push(`${k} ${r.scope} ${r.base ? 'base' : 'drv'}${r.frozen ? ' frozen' : ''} support=${this.supportCount(k)}`);
    }
    const wits = this.allWitnesses();
    for (const k of sortKeys([...wits.keys()])) {
      const w = wits.get(k)!;
      lines.push(`wit ${k} <- ${w.ruleId}@${w.tick} [${w.prems.map((p) => p.t + ':' + (p.t === 'bi' ? p.desc : p.key)).join('; ')}]`);
    }
    lines.push(...this.tickLog);
    return lines.join('\n');
  }

  snapshot(): string {
    const facts = this.allFactKeys().map((k) => {
      const r = this.get(k)!;
      return { rel: r.rel, persp: r.persp, args: r.args.map(termToJson), scope: r.scope, base: r.base, frozen: r.frozen };
    });
    const wits0 = this.allWitnesses();
    const wits = sortKeys([...wits0.keys()]).map((k) => {
      const w = wits0.get(k)!;
      return { key: k, ruleId: w.ruleId, tick: w.tick, prems: w.prems };
    });
    const fi = this.firings;
    const firings = sortKeys([...fi.keys()]).map((k) => {
      const sigs = fi.get(k)!;
      return {
        key: k,
        sup: sortKeys([...sigs.keys()]).map((sig) => {
          const w = sigs.get(sig)!;
          return { sig, ruleId: w.ruleId, tick: w.tick, prems: w.prems };
        }),
      };
    });
    const evals = [...this.evalLog.keys()].sort((a, b) => a - b)
      .map((t) => ({ tick: t, ...this.evalLog.get(t)! }));
    return JSON.stringify({ tick: this.tick, facts, wits, firings, tickLog: this.tickLog, evals });
  }

  static restore(json: string, file?: string): SqliteStore {
    const d = JSON.parse(json);
    const s = new SqliteStore(file);
    s.tick = d.tick;
    s.tickLog = d.tickLog ?? [];
    for (const f of d.facts) {
      s.add(f.rel, f.persp, (f.args as unknown[]).map(termFromJson),
        { scope: f.scope, base: f.base, frozen: f.frozen });
    }
    for (const w of d.wits ?? []) {
      s.db.prepare('INSERT OR REPLACE INTO w (key, ruleId, tick, prems, seq) VALUES (?, ?, ?, ?, ?)')
        .run(w.key, w.ruleId, w.tick, JSON.stringify(w.prems), ++s.wseq);
    }
    for (const f of d.firings ?? []) {
      for (const e of f.sup ?? []) {
        s.db.prepare('INSERT OR REPLACE INTO fi (key, sig, ruleId, tick, prems, seq) VALUES (?, ?, ?, ?, ?, ?)')
          .run(f.key, e.sig, e.ruleId, e.tick, JSON.stringify(e.prems), ++s.fseq);
      }
    }
    for (const e of d.evals ?? []) s.evalLog.set(e.tick, { budget: e.budget, steps: e.steps, partial: e.partial });
    s.dirty = true;
    return s;
  }

  /** A fork.
   *
   *  `VACUUM INTO` copies the whole database — pages, indexes and all — inside
   *  SQLite, synchronously, without a round trip through JSON and without
   *  building a single JavaScript object. That is the operation the in-memory
   *  store cannot have: its `clone` is snapshot -> parse -> re-add, and every
   *  fact is rebuilt term by term on the way through.
   *
   *  ONE CORRECTION IS NOT OPTIONAL. `Store.clone` goes through `restore`,
   *  which re-adds facts in SORTED KEY ORDER, so a cloned in-memory store's
   *  arrival order is key order and not the original's. A page copy preserves
   *  `seq` instead, so the clone would disagree with the reference about
   *  `allFacts()` — which the evaluator reads. Renumbering by key restores it.
   *  Cheap, and invisible until something reads arrival order, which is
   *  precisely the kind of divergence the conformance oracle exists to catch. */
  clone(opts: { renumber?: boolean } = {}): SqliteStore {
    this.commit();          // VACUUM cannot run inside a transaction
    const dest = tempPath();
    this.db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    const s = new SqliteStore(dest);
    s.adoptDir(path.dirname(dest));
    if (opts.renumber !== false) this.renumberByKey(s);
    s.tick = this.tick;
    s.tickLog = [...this.tickLog];
    s.evalLog = new Map(this.evalLog);
    s.derivedKeys = new Map(this.derivedKeys);
    s.derivedSchedule = this.derivedSchedule;
    s.dirty = true;              // as `restore` leaves it
    s.partialEval = false;       // as a fresh store starts
    return s;
  }

  /** Put a fork's arrival order back into key order, which is what the
   *  reference store's own fork has.
   *
   *  WHY IT IS NEEDED AT ALL. `Store.clone` goes through `restore`, which
   *  re-adds every fact in SORTED KEY ORDER, so a cloned in-memory store's
   *  arrival order IS key order and not the original's. A page copy preserves
   *  `seq`, so without this the fork disagrees with the reference about
   *  `allFacts()`.
   *
   *  WHAT IT COSTS, and the number decides something. MEASURED on this
   *  machine, 200000 arity-2 facts, load ~6: `VACUUM INTO` alone is 583 ms =
   *  2.92 us/fact, which BEATS the in-memory clone's 7.1 us/fact by 2.4x —
   *  the port's fourth constraint, met. This renumbering is 3242 ms = 16.21
   *  us/fact on top, 78% of the fork, and it turns a 2.4x win into a 2.9x
   *  loss (20.7 us/fact as shipped).
   *
   *  SO WHY IS IT STILL THE DEFAULT. Because what it buys is a contract and
   *  what it costs is only speed, and the two are not comparable by me. The
   *  arrival order it restores is, as far as this repository can tell,
   *  UNOBSERVABLE: mutant M3 in test/store-conformance.test.ts sorts
   *  `allFacts` and the end-to-end oracle agrees anyway, on a stratified
   *  program and on a well-founded one, because `negHolds` reads that array as
   *  an existence check. But "no current path reads it" is a fact about today's
   *  evaluator, not a property of the port, and an adapter that quietly
   *  diverges from the reference on a property nobody is watching is exactly
   *  the failure the conformance oracle exists to prevent. `clone({ renumber:
   *  false })` is the documented opt-out, with both numbers attached.
   *
   *  THROUGH A TEMP TABLE, and the first version was not: `UPDATE f SET seq =
   *  (SELECT n FROM (SELECT ... ROW_NUMBER() ...) WHERE k = f.key)` re-runs the
   *  whole window computation for EVERY row. MEASURED at load 15-20, that form
   *  took 3.4 s at 2000 facts, 9.3 s at 4000 and 31 s at 8000 — the per-fact
   *  cost rising as the store grew, which is the shape of a quadratic. */
  private renumberByKey(s: SqliteStore): void {
    s.db.exec(`
      CREATE TEMP TABLE ord (k TEXT PRIMARY KEY, n INTEGER);
      INSERT INTO ord SELECT key, ROW_NUMBER() OVER (ORDER BY key) FROM f;
      UPDATE f SET seq = (SELECT n FROM ord WHERE ord.k = f.key);
      DROP TABLE ord;
      CREATE TEMP TABLE ordw (k TEXT PRIMARY KEY, n INTEGER);
      INSERT INTO ordw SELECT key, ROW_NUMBER() OVER (ORDER BY key) FROM w;
      UPDATE w SET seq = (SELECT n FROM ordw WHERE ordw.k = w.key);
      DROP TABLE ordw;
    `);
    const mx = s.db.prepare('SELECT MAX(seq) AS m FROM f').get() as unknown as { m: number | null };
    s.seq = mx?.m ?? 0;
    const mw = s.db.prepare('SELECT MAX(seq) AS m FROM w').get() as unknown as { m: number | null };
    s.wseq = mw?.m ?? 0;
  }

  /** Close the connection and remove the backing file. A clone leaves one
   *  behind per fork; `load` forks on every call, so a long-running host has
   *  to say when a fork is done with. The in-memory store had no such duty and
   *  this is the honest price of a file. */
  close(): void {
    try { this.commit(); } catch { /* nothing standing */ }
    try { this.db.close(); } catch { /* already closed */ }
    if (this.ownDir !== null) { reaper.unregister(this); forget(this.ownDir); }
  }
}
