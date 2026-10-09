// The model over the code evaluated by the Rust engine (playground/engine.ts), the default wherever its binary is. The world stays in the engine and the host
// reads what it renders, a relation's rows, a fact, its firings, a cell, each when first asked: every answer, why and picture is then read by the TypeScript
// engine's own code from the Rust engine's world, so the two engines say the same thing, and a world of millions of facts never crosses the pipe whole.
import { accessSync, chmodSync, constants, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads';
import { Rofl } from '../src/api.ts';
import { typescript, type Engine, type EngineName, type Holding, type Walls } from './engine.ts';
import type { CellRec, FactRec, PremRef, Store, Witness } from '../src/store.ts';
import { termFromJson } from '../src/unify.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), EXE = process.platform === 'win32' ? '.exe' : '';
/** The Rust engine: the one a package carries in bin/, made executable if unpacking lost the bit, else this tree's build. */
export function rustBin(): string | undefined {
  const bin = [path.join(ROOT, 'bin', `rofl${EXE}`), path.join(ROOT, 'rust/target', process.env.ROFL_PROFILE || 'release', `rofl${EXE}`)].find(existsSync);
  if (bin && !EXE) try { accessSync(bin, constants.X_OK); } catch { try { chmodSync(bin, 0o755); } catch { return undefined; } }
  return bin;
}

/** The engine a name asks for; the Rust one only where its binary is, so `rust`, the default, is the TypeScript engine on a machine without it. */
export function engineOf(name: EngineName = 'rust'): Engine {
  const bin = name === 'rust' ? rustBin() : undefined;
  return bin ? new RustEngine(bin) : typescript;
}

/** `rofl serve` in a child process, spoken to synchronously: a request waits on a thread that holds the child. One child for every engine of a process. */
let engine: ((req: Record<string, unknown>) => Record<string, any>) | undefined;
function serve(bin: string) {
  if (engine) return engine;
  const { port1, port2 } = new MessageChannel(), flag = new Int32Array(new SharedArrayBuffer(4));
  new Worker(new URL('./rust-worker.ts', import.meta.url), { workerData: { port: port2, flag, bin }, transferList: [port2] }).unref();
  port1.unref();
  return engine = (req) => {
    Atomics.store(flag, 0, 0);
    port1.postMessage(req);
    Atomics.wait(flag, 0, 0);
    const r = receiveMessageOnPort(port1)!.message;
    if (!r.ok) throw new Error(`the Rust engine refused ${req.op}: ${r.error}`);
    return r;
  };
}

/** The model is loaded once and kept; each text of the code evaluates in a fork of it, kept until the next. */
export class RustEngine implements Engine {
  readonly name = 'rust';
  private call: (req: Record<string, unknown>) => Record<string, any>;
  private core?: { model: string; session: number };
  private world?: number;

  constructor(bin: string) { this.call = serve(bin); }

  evaluated(_core: Rofl, model: string, code: string, walls: Walls): Rofl {
    if (this.core?.model !== model) {
      if (this.core) this.call({ op: 'close', session: this.core.session });
      const s = this.call({ op: 'fresh', ...walls }).session;
      this.call({ op: 'load', session: s, rofl: model });
      this.core = { model, session: s };
    }
    if (this.world) this.call({ op: 'close', session: this.world });
    const session = this.world = this.call({ op: 'fork', session: this.core.session }).session;
    try { this.call({ op: 'assert', session, rofl: code }); } catch (e) { throw new Error(`the code's facts were refused, so nothing was asked: ${(e as Error).message}`); }
    const { partial } = this.call({ op: 'evaluate', session });
    const b = new Rofl({ space: walls.space, reuse: false });
    b.store = rustStore((req) => this.call({ ...req, session }), partial);
    return b;
  }
}

type Fact = FactRec & { key: string };
/** A premise as the reference spells it: a row the Rust engine keeps virtual is a fact there (canonicalState's `fact:`). */
const premOf = (p: any): PremRef => p.t === 'vrow' ? { t: 'fact', key: p.key } : p;
const factOf = (j: any): Fact => ({ key: j.key, rel: j.rel, persp: j.persp, args: j.args.map(termFromJson), scope: j.scope, base: j.base, frozen: j.frozen });

/** The reads a run makes of an evaluated world, answered by the Rust engine and kept: the surface why, whynot and a query read (playground/host.ts proofs). */
function rustStore(ask: (req: Record<string, unknown>) => Record<string, any>, partial: boolean): Store {
  const rows = new Map<string, Fact[]>(), facts = new Map<string, Fact | null>(), firings = new Map<string, Witness[]>(), cells = new Map<string, CellRec | undefined>();
  const relOf = (rel: string, persp?: string) => {
    const k = `${rel}[${persp ?? ''}`;
    if (!rows.has(k)) rows.set(k, ask({ op: 'rows', rel, ...(persp !== undefined && { persp }) }).facts.map(factOf));
    return rows.get(k)!;
  };
  const get = (key: string) => {
    if (!facts.has(key)) { const f = ask({ op: 'fact', key }).fact; facts.set(key, f ? factOf(f) : null); }
    return facts.get(key) ?? undefined;
  };
  const ranked = (key: string) => {
    if (!firings.has(key)) firings.set(key, ask({ op: 'firings', key }).firings.map((w: any) => ({ ruleId: w.ruleId, tick: w.tick, prems: w.prems.map(premOf) })));
    return firings.get(key)!;
  };
  const cell = (key: string) => {
    if (!cells.has(key)) {
      const c = ask({ op: 'cell', key }).cell;
      cells.set(key, c ? { key: c.key, rule: c.rule, at: c.at, tick: c.tick, keyTerms: c.keyTerms.map(termFromJson), op: c.op, height: c.height, desc: c.desc,
        value: typeof c.hole === 'string' ? { k: 'hole', reason: c.hole } : c.value != null ? { k: 'value', t: termFromJson(c.value) } : { k: 'empty' },
        members: c.members.map((m: any) => ({ proj: m.proj.map(termFromJson), value: termFromJson(m.value), height: m.height, prems: m.prems.map(premOf), others: (m.others ?? []).map((o: any[]) => o.map(premOf)) })),
        seals: c.sealed } : undefined);
    }
    return cells.get(key);
  };
  const store = {
    tick: 0, dirty: false, partialEval: partial, keepDead: true, ghosts: new Map(), dead: new Map(), firings: new Map(),
    cells: Object.assign(new Map(), { get: cell, has: (key: string) => !!cell(key) }),
    cellOf: cell,
    has: (key: string) => !!get(key),
    get, recAny: get,
    firingList: ranked, witnessesOf: ranked, firingsRanked: ranked,
    witnessOf: (key: string) => ranked(key)[0],
    supportCount: (key: string) => ranked(key).length,
    relAll: (rel: string) => relOf(rel),
    relPersp: (rel: string, persp: string) => relOf(rel, persp),
    relCount: (rel: string) => relOf(rel).length,
    indexed: () => true,
    argMatches: (rel: string, persp: string | null, _arity: number, pos: number[], vals: string[]) =>
      ask({ op: 'rows', rel, ...(persp !== null && { persp }), at: Object.fromEntries(pos.map((p, k) => [p, vals[k]])) }).facts.map(factOf),
    perspectivesOf: (rel: string) => ask({ op: 'books', rel }).books.sort(),
    holding: ((term, limit) => ask({ op: 'holding', ...term, limit }).facts.map(factOf)) satisfies Holding,
  };
  return store as unknown as Store;
}
