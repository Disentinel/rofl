// What evaluates the model over the code, the costly world a run's cells stand on (Host.evaluated): the TypeScript engine here, which runs anywhere,
// the browser too; the Rust one in playground/rust.ts.
import type { Rofl } from '../src/api.ts';
import type { FactRec, Store } from '../src/store.ts';

export type EngineName = 'rust' | 'typescript';
/** The clock and the heap a run has left, which an engine that evaluates elsewhere keeps for itself. */
export type Limit = { ms?: number; bytes?: number };
/** A run's stop: true when the clock or the heap says so, and then `cause` says which. `left`: what remains of each; `said`: an engine stopped by one. */
export type Stop = (() => boolean) & { cause?: string; left?: () => Limit; said?: (by: 'clock' | 'heap') => void };
export type Walls = { budget: number; space: number; stop?: Stop };
export interface Engine {
  readonly name: EngineName;
  /** `core`, the model `model` loaded and not evaluated, over the code's facts `code`, evaluated: a world whose store says `partialEval` when it was cut short. */
  evaluated(core: Rofl, model: string, code: string, walls: Walls): Rofl;
  /** The same with the cells' texts loaded beside the code, in a world of its own; a text the engine refuses is said in `errors` at its place and left out. */
  withCells(core: Rofl, model: string, code: string, texts: string[], walls: Walls): { world: Rofl; errors: string[][] };
  /** A world this engine evaluated, with the base facts `lits` taken out and evaluated again, in a world of its own; a fact it cannot take out is said in `errors`. */
  excised(world: Rofl, lits: string[], walls: Walls): { world: Rofl; errors: string[] };
  /** A world this engine evaluated, asked `rels` besides what it asks: the rules the larger cone adds run over its store (docs/demand-cones.md). */
  asked(world: Rofl, rels: string[], walls: Walls): Rofl;
}

/** The facts that ask a world for `rels`: it then evaluates only the rules they reach (docs/demand-cones.md). */
export const asksOf = (rels: Iterable<string>): string => [...rels].map((r) => `asks(${r}).`).join('\n');

export const typescript: Engine = {
  name: 'typescript',
  evaluated(core, _model, code, { budget }) {
    const b = core.fork();
    const given = b.assert(code);
    if (!given.ok) throw new Error(`the code's facts were refused, so nothing was asked: ${given.diagnostics[0]}`);
    b.evaluate(budget);
    return b;
  },
  withCells(core, _model, code, texts, { budget }) {
    const f = core.fork(), errors: string[][] = texts.map(() => []);
    if (code) { const given = f.assert(code); if (!given.ok) throw new Error(`the code's facts were refused, so nothing was asked: ${given.diagnostics[0]}`); }
    // one load evaluates the whole model again, so the cells go in together; only when that is refused does each go in alone, to say which
    const all = texts.filter((x) => x.trim()).join('\n');
    if (all.trim() && !f.load(all, { budget }).ok) {
      texts.forEach((x, i) => { if (!x.trim()) return; const l = f.load(x, { budget }); if (!l.ok) errors[i].push(...l.diagnostics); });
    }
    f.evaluate(budget);
    return { world: f, errors };
  },
  excised(world, lits, { budget }) {
    const g = world.fork(), errors = lits.flatMap((l) => { const r = g.retract(l); return r.ok ? [] : [r.diagnostics[0]]; });
    g.evaluate(budget);
    return { world: g, errors };
  },
  asked(world, rels, { budget }) {
    const g = world.fork();
    g.assert(asksOf(rels));
    g.evaluate(budget);
    return g;
  },
};

/** The facts holding an atom anywhere in their terms, or a string: what a world kept elsewhere answers without its every fact read here.
 *  None for a world whose store is this engine's own, which a run reads whole. */
export type Holding = (term: { atom: string } | { string: string }, limit?: number) => FactRec[];
/** Whether a world's store is kept elsewhere, and answers `holding`. */
export const remote = (w: Rofl): boolean => 'holding' in w.store;
export const holding = (w: Rofl, term: { atom: string } | { string: string }, limit?: number): FactRec[] | undefined =>
  (w.store as Store & { holding?: Holding }).holding?.(term, limit);
