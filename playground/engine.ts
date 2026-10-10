// What evaluates the model over the code, the costly world a run's cells stand on (Host.evaluated): the TypeScript engine here, which runs anywhere,
// the browser too; the Rust one in playground/rust.ts.
import type { Rofl } from '../src/api.ts';
import type { FactRec, Store } from '../src/store.ts';

export type EngineName = 'rust' | 'typescript';
export type Walls = { budget: number; space: number };
export interface Engine {
  readonly name: EngineName;
  /** `core`, the model `model` loaded and not evaluated, over the code's facts `code`, evaluated: a world whose store says `partialEval` when it was cut short. */
  evaluated(core: Rofl, model: string, code: string, walls: Walls): Rofl;
}

export const typescript: Engine = {
  name: 'typescript',
  evaluated(core, _model, code, { budget }) {
    const b = core.fork();
    const given = b.assert(code);
    if (!given.ok) throw new Error(`the code's facts were refused, so nothing was asked: ${given.diagnostics[0]}`);
    b.evaluate(budget);
    return b;
  },
};

/** The facts holding an atom anywhere in their terms, or a string: what a world kept elsewhere answers without its every fact read here.
 *  None for a world whose store is this engine's own, which a run reads whole. */
export type Holding = (term: { atom: string } | { string: string }, limit?: number) => FactRec[];
/** Whether a world's store is kept elsewhere, and answers `holding`. */
export const remote = (w: Rofl): boolean => 'holding' in w.store;
export const holding = (w: Rofl, term: { atom: string } | { string: string }, limit?: number): FactRec[] | undefined =>
  (w.store as Store & { holding?: Holding }).holding?.(term, limit);
