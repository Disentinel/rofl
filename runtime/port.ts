// runtime/port.ts — THE RUST ENGINE, USED FROM NODE AS A LIBRARY.
//
// `src/api.ts` is the engine for small worlds; this is the client for the
// large one. The division is the owner's, 2026-09-09: "JS движок для мелких
// миров, rust для больших" — and the two are not interchangeable, because the
// JS engine is not built to reach where this one lives and this one has no
// `load(text)` for a program.
//
// WHY A CHILD PROCESS AND NOT A NATIVE ADDON. A napi build is a compiled
// artifact per node version and per platform; this is one `cargo build` and a
// client with no dependencies and no build step. The price is serialisation,
// and the price is affordable BECAUSE OF WHAT THE VERBS COST: the cheapest ask
// this surface has is 5.5 ms with its key bound, and a pipe round-trip is tens
// of microseconds. If a workload ever appears whose asks are dominated by the
// pipe, that is a measurement, and the addon can be written then — against
// this protocol.
//
// WHAT THIS CLIENT WILL NOT DO: pull the whole state through the pipe by
// default. `canonicalState` is one string and V8 caps a string at about
// 512 MB, which is exactly why the port is unjudged above roughly 3M facts.
// `state()` therefore writes to a path, and `stateText()` is separate and
// named so that reaching for it is a decision.
//
//   const port = await RoflPort.start();
//   const core = await port.fresh();
//   await core.loadFile('boot.rofl');
//   await core.loadFile('my-program.rofl');
//   const work = await core.fork();          // 128x cheaper than open
//   await work.assert('candidate(x).');
//   await work.evaluate();
//   const a = await work.ask('handled[main](F, K)');
//   a.rows           // [['f1', 'k1'], ...]
//   a.scanned        // what it cost, not what it returned
//   await port.stop();
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
export const DEFAULT_BIN = path.join(ROOT, 'rust/target/release/rofl-serve');

export interface Evaluated {
  /** A wall was hit and a `hole` in the store names the unfinished part. NOT
   *  an error: the answer stands and the margin is reported beside it. */
  partial: boolean;
  staged: number;
  steps: number;
  /** The join accumulator's high-water mark, IN ROWS — the same unit as
   *  `space`. Rows are not facts (0.507 rows per fact on the JS model) and
   *  reading one against the other is a category error made here once. */
  peakRows: number;
  space: number;
}

export interface Answer {
  /** Variable names in first-appearance order. A `_` is a column too. */
  vars: string[];
  rows: string[][];
  /** Whole matched facts in canonicalState's key form; only when asked for. */
  keys: string[] | null;
  /** The candidate superset the store handed back BEFORE filtering. This is
   *  the number that separates 5.5 ms from 12 469 ms — not `rows.length`. */
  scanned: number;
  /** True when an index served the ask, false when the relation was walked. */
  probed: boolean;
  micros: number;
}

export interface Ticked { advanced: boolean; quiescent: boolean; partial: boolean }

/** One world. Obtained from `open` or, far more cheaply, from `fork`. */
export class RoflSession {
  readonly port: RoflPort;
  readonly id: number;
  readonly facts: number;
  constructor(port: RoflPort, id: number, facts: number) {
    this.port = port;
    this.id = id;
    this.facts = facts;
  }

  /** A world of one's own. Nothing it does is visible to its parent. */
  async fork(): Promise<RoflSession> {
    const r = await this.port.send({ op: 'fork', session: this.id });
    return new RoflSession(this.port, r.session as number, r.facts as number);
  }

  /** Load a ROFL PROGRAM — facts and rules. Returns how many clauses were
   *  admitted; a refusal rejects with every diagnostic and leaves the world
   *  exactly as it was, so a program with three bad clauses reports all three
   *  and puts nothing in.
   *
   *  `who` is the author. A caller may not spell a `$` principal: the one way
   *  into the kernel's ring is `$kernel_authority(...)` written as the FIRST
   *  clause of the FIRST load, in the file itself, where a reader can see it. */
  load(rofl: string, who?: string): Promise<number> {
    return this.port.send({ op: 'load', session: this.id, rofl, who })
      .then((r) => r.admitted as number);
  }

  /** The same, reading the text from a path the ENGINE opens. A large program
   *  has no business going through a pipe and a JSON string escape when both
   *  ends can read a file. */
  loadFile(path: string, who?: string): Promise<number> {
    return this.port.send({ op: 'load', session: this.id, path, who })
      .then((r) => r.admitted as number);
  }

  /** Base facts, written as ROFL. Returns how many were NEW. What they add is
   *  first judged by the next WHOLE evaluation, never mid-round. */
  assert(rofl: string): Promise<number> {
    return this.port.send({ op: 'assert', session: this.id, rofl }).then((r) => r.added as number);
  }

  async evaluate(): Promise<Evaluated> {
    const r = await this.port.send({ op: 'evaluate', session: this.id });
    return r as unknown as Evaluated;
  }

  /** The boundary. Staged `@next` facts install here, and here is the only
   *  place a volume may be lifted. */
  async tick(): Promise<Ticked> {
    const r = await this.port.send({ op: 'tick', session: this.id });
    return r as unknown as Ticked;
  }

  /** One ROFL literal: `handled[main](F, K)`, `edge(a, X)`, `p(X, X)`.
   *  The source language IS the query language. */
  async ask(query: string, opts: { keys?: boolean } = {}): Promise<Answer> {
    const r = await this.port.send({ op: 'ask', session: this.id, query, keys: opts.keys ?? false });
    return r as unknown as Answer;
  }

  /** COOL A VOLUME TO DISK: write its base facts out as ROFL and drop them.
   *
   *  A volume is a KEY PREFIX minted by the scanner — `scanners/js_ast.ts`
   *  exports `idPrefix(file)` — so residency is decided before anything is
   *  loaded, and no rule ever mentions a volume. The kernel's own books are
   *  excluded: `asserted_by` and `in_perspective` are what the kernel says
   *  ABOUT an assertion, and a reheat IS a fresh assertion that earns a fresh
   *  trail dated to the tick it actually happened on.
   *
   *  Reversible, and gated as such: `rust/rofl/tests/cool.rs` compares
   *  canonicalState before cooling and after reheating, byte for byte.
   *
   *  The caller records the act — `cooled[code](File, Path)` so the file stays
   *  INDEXED rather than returning to the frontier, and `hole($cold(File),
   *  cooled_to_disk)` so a question about the cold volume refuses instead of
   *  answering empty. */
  async cool(prefix: string, path: string): Promise<{ facts: number; bytes: number; path: string }> {
    const r = await this.port.send({ op: 'cool', session: this.id, prefix, path });
    return { facts: r.facts as number, bytes: r.bytes as number, path: r.path as string };
  }

  /** Cool MANY volumes in one pass over the world.
   *
   *  Cooling them one at a time walks the world once per volume, and the world
   *  is still shrinking as it goes — measured over 64 eslint files, that took
   *  cooling from 73 ms to 4 699 ms a tick while the work per tick was flat. */
  async coolMany(vols: { prefix: string; path: string }[]): Promise<{ facts: number; bytes: number; path: string }[]> {
    const r = await this.port.send({ op: 'cool_many', session: this.id, volumes: vols });
    return r.volumes as { facts: number; bytes: number; path: string }[];
  }

  /** COOL THE ASSERTION TRAIL: park `asserted_by` on disk and drop it.
   *
   *  It is half the world and two thirds of what a load writes — 41 722 rows
   *  against 43 078 base facts on 16 eslint files, and dropping it takes a load
   *  from 331 ms to 94 — and it is the layer nobody asks about until something
   *  is wrong. `sealed(assertions)` gets the same numbers more cheaply and
   *  never writes the information at all; this parks it.
   *
   *  Write `hole($cold(assertions), cooled_to_disk)` alongside, so a question
   *  about authorship REFUSES rather than answering empty. */
  async coolTrail(path: string): Promise<{ facts: number; bytes: number; path: string }> {
    const r = await this.port.send({ op: 'cool_trail', session: this.id, path });
    return { facts: r.facts as number, bytes: r.bytes as number, path: r.path as string };
  }

  /** Fetch the trail back. This goes PAST THE DOOR — `asserted_by` lives in
   *  `[$kernel]` and a program may not write a kernel ledger — and the header
   *  is what earns that: a file this engine did not write is refused, not
   *  translated. Same category as restoring a seed, not a new one. */
  async reheatTrail(path: string): Promise<number> {
    const r = await this.port.send({ op: 'reheat_trail', session: this.id, path });
    return r.restored as number;
  }

  /** Write canonicalState to a file. Deliberately not a string — see the
   *  module note on V8's cap and where the port stops being judged. */
  async state(outPath: string): Promise<number> {
    const r = await this.port.send({ op: 'state', session: this.id, path: outPath });
    return r.bytes as number;
  }

  /** The whole state as a string. Separate from `state` and named so that
   *  reaching for it is a decision rather than a default. */
  async stateText(): Promise<string> {
    const r = await this.port.send({ op: 'state', session: this.id });
    return r.state as string;
  }

  async factCount(): Promise<{ facts: number; tick: number }> {
    const r = await this.port.send({ op: 'facts', session: this.id });
    return { facts: r.facts as number, tick: r.tick as number };
  }

  close(): Promise<unknown> {
    return this.port.send({ op: 'close', session: this.id });
  }
}

export class RoflPort {
  private child: ChildProcessWithoutNullStreams;
  private rl: readline.Interface;
  private waiting = new Map<number, { ok: (v: Record<string, unknown>) => void; no: (e: Error) => void }>();
  private seq = 1;
  private dead: Error | null = null;
  private err = '';

  /** Every outstanding promise fails, and the reason is kept for later sends.
   *  A protocol whose failures are silent leaves the caller awaiting a promise
   *  that can never settle, which is strictly worse than the crash it came
   *  from — and worse than that is a LOST answer, because nothing crashed. */
  private fail(why: string): void {
    this.dead ??= new Error(`${why}${this.err ? `: ${this.err.trim()}` : ''}`);
    for (const w of this.waiting.values()) w.no(this.dead);
    this.waiting.clear();
  }

  private constructor(bin: string) {
    this.child = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.rl = readline.createInterface({ input: this.child.stdout });
    this.rl.on('line', (line) => this.receive(line));
    // A child that dies with requests outstanding must REJECT them. A protocol
    // whose failures are silent leaves the caller awaiting a promise that can
    // never settle, which is worse than the crash it came from.
    this.child.stderr.on('data', (b: Buffer) => { this.err += b.toString(); });
    this.child.on('error', (e) => this.fail(`rofl-serve would not start (${e.message})`));
    this.child.on('exit', (code, sig) => this.fail(`rofl-serve exited (code ${code}, signal ${sig})`));
  }

  /** Start the engine. `bin` defaults to the release build in this tree; a
   *  missing binary is reported as a missing BUILD, because that is the actual
   *  repair and `ENOENT` is not. */
  static async start(bin: string = DEFAULT_BIN): Promise<RoflPort> {
    if (!fs.existsSync(bin)) {
      throw new Error(`no engine at ${bin} — build it with: cargo build --release --bin rofl-serve`);
    }
    return new RoflPort(bin);
  }

  private receive(line: string): void {
    let v: Record<string, unknown>;
    try { v = JSON.parse(line) as Record<string, unknown>; }
    catch (e) {
      // A LINE THAT WILL NOT PARSE USED TO BE DROPPED HERE, and the caller
      // then waited for a reply that had already arrived and been thrown away.
      // Both processes go idle — the engine blocked in `read` waiting for the
      // next request, node blocked in `kevent` waiting for the answer to the
      // last — and nothing says so. It is the same defect this client's own
      // gate was built to catch on the OTHER path: a dead child rejects every
      // outstanding promise, and a lost MESSAGE did not.
      //
      // Rejecting everything outstanding is deliberately blunt. The id is in
      // the line that would not parse, so there is no way to know whose answer
      // this was, and a protocol that cannot say which request died must say
      // that all of them might have.
      this.fail(`unreadable answer from the engine (${(e as Error).message}): `
        + `${line.length} bytes starting ${JSON.stringify(line.slice(0, 120))}`);
      return;
    }
    const id = v.id as number;
    const w = this.waiting.get(id);
    if (!w) {
      // AN ANSWER NOBODY IS WAITING FOR was dropped here in silence, which is
      // the same defect as the unparseable line above wearing a different hat:
      // if the ids ever desync, every later request waits forever and nothing
      // says why. It is reported rather than repaired, because an answer to a
      // request this client did not make means the two sides disagree about
      // what has been asked, and continuing would be guessing.
      // AND IT CARRIES WHAT THE ENGINE SAID. `id: null` is what a request the
      // engine could not even parse comes back as — the id was inside the text
      // that failed — so without the engine's own message this failure reports
      // that something went wrong and destroys the only evidence of what.
      this.fail(`an answer arrived for request ${id}, which is not outstanding `
        + `(waiting on ${[...this.waiting.keys()].join(', ') || 'nothing'}). `
        + `The engine said: ${JSON.stringify(v).slice(0, 400)}`);
      return;
    }
    this.waiting.delete(id);
    if (process.env.ROFL_PORT_TRACE) process.stderr.write(`<- ${id} ${line.length}B\n`);
    if (v.ok === true) w.ok(v);
    else w.no(new Error(String(v.error ?? 'unknown engine error')));
  }

  send(req: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.dead) return Promise.reject(this.dead);
    const id = this.seq++;
    return new Promise((ok, no) => {
      this.waiting.set(id, { ok, no });
      const line = `${JSON.stringify({ ...req, id })}\n`;
      if (process.env.ROFL_PORT_TRACE) {
        process.stderr.write(`-> ${id} ${String(req.op)} ${line.length}B\n`);
      }
      // A WRITE THAT FAILS MUST NOT BE SILENT EITHER. `write` reports an error
      // through the callback, and without it a broken pipe leaves the caller
      // waiting on an answer to a request that never left.
      this.child.stdin.write(line, (e) => { if (e) this.fail(`write failed: ${e.message}`); });
    });
  }

  /** An EMPTY world with the kernel's bootstrap tables and nothing else —
   *  `new Rofl()`. With `load` beside it a caller never needs a seed, and
   *  therefore never needs the TypeScript kernel at all. */
  async fresh(budget?: number): Promise<RoflSession> {
    const r = await this.send({ op: 'fresh', budget });
    return new RoflSession(this, r.session as number, r.facts as number);
  }

  /** Build the core from a snapshot. Expensive; fork it after that. */
  async open(opts: { seedPath?: string; seed?: string; budget?: number }): Promise<RoflSession> {
    const r = await this.send({ op: 'open', ...opts });
    return new RoflSession(this, r.session as number, r.facts as number);
  }

  async stop(): Promise<void> {
    this.child.stdin.end();
    await new Promise<void>((r) => {
      if (this.child.exitCode !== null) return r();
      this.child.once('exit', () => r());
    });
    this.rl.close();
  }
}
