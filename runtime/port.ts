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

  private constructor(bin: string) {
    this.child = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.rl = readline.createInterface({ input: this.child.stdout });
    this.rl.on('line', (line) => this.receive(line));
    // A child that dies with requests outstanding must REJECT them. A protocol
    // whose failures are silent leaves the caller awaiting a promise that can
    // never settle, which is worse than the crash it came from.
    let err = '';
    this.child.stderr.on('data', (b: Buffer) => { err += b.toString(); });
    const fail = (why: string): void => {
      this.dead ??= new Error(`${why}${err ? `: ${err.trim()}` : ''}`);
      for (const w of this.waiting.values()) w.no(this.dead);
      this.waiting.clear();
    };
    this.child.on('error', (e) => fail(`rofl-serve would not start (${e.message})`));
    this.child.on('exit', (code, sig) => fail(`rofl-serve exited (code ${code}, signal ${sig})`));
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
    catch { return; }
    const id = v.id as number;
    const w = this.waiting.get(id);
    if (!w) return;
    this.waiting.delete(id);
    if (v.ok === true) w.ok(v);
    else w.no(new Error(String(v.error ?? 'unknown engine error')));
  }

  send(req: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.dead) return Promise.reject(this.dead);
    const id = this.seq++;
    return new Promise((ok, no) => {
      this.waiting.set(id, { ok, no });
      this.child.stdin.write(`${JSON.stringify({ ...req, id })}\n`);
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
