// fold.ts — a proof as steps, by what each rule is about. The kernel's `why` walks every premise down to the facts it was given; this reads the
// same witnesses and folds them: a fact concluded in the same section as the fact above it joins that step, one from another section starts a
// step, a fact about one thing is a detail of the step above it, and a fact nothing concluded is counted as evidence.
import { parseLiteral } from '../src/parser.ts';
import { factKey, type Witness } from '../src/store.ts';
import { resolveBook } from '../src/reflect.ts';

export type Step = { concern: string; sentence: string; literal: string; details: string[]; missing: string[]; evidence: number; steps: Step[]; again?: boolean };
export type Proofs = { witnessOf(key: string): Witness | undefined; has(key: string): boolean };
export type FoldOpts = {
  /** the section a rule belongs to, `dataflow: construction`; '' for a fact nothing concluded */
  concernOf(ruleId: string, key: string): string;
  say(key: string): string;
  /** what counts as one thing, so a fact about at most one of them is a property rather than a step */
  entities: RegExp;
  /** sections whose facts are steps even when they are about one thing: the ones the person wrote */
  own?(concern: string): boolean;
};

/** The key of a ground literal as the store holds it. */
export function keyOf(literal: string): string {
  const l = resolveBook(parseLiteral(literal));
  return factKey(l.rel, (l.persp as { name: string }).name, l.args);
}

export function fold(store: Proofs, literal: string, o: FoldOpts): Step | string {
  let top: string;
  try { top = keyOf(literal); } catch (e) { return (e as Error).message; }
  if (!store.witnessOf(top)) return store.has(top) ? `${literal} is given, not derived` : `${literal} does not hold`;
  const concernOf = (key: string) => { const w = store.witnessOf(key); return w ? o.concernOf(w.ruleId, key) : ''; };
  const say = o.say;
  const shown = new Set<string>();
  const step = (key: string, path: Set<string>): Step => {
    const concern = concernOf(key);
    const st: Step = { concern, sentence: say(key), literal: key, details: [], missing: [], evidence: 0, steps: [] };
    if (shown.has(key)) { st.again = true; return st; }
    shown.add(key);
    let absorbing = false;
    const keys: string[] = [];
    const walk = (k: string) => {
      const w = store.witnessOf(k); if (!w || path.has(k)) return;
      path.add(k);
      for (const p of w.prems) {
        if (p.t === 'neg') { st.missing.push(say(p.key)); continue; }
        if (p.t === 'bi') { st.details.push(p.desc); continue; }
        const c = concernOf(p.key);
        if (!c) { st.evidence++; continue; }
        const one = (p.key.match(o.entities) ?? []).length <= 1 && !o.own?.(c);
        if (c === concern || one || absorbing) { if (!shown.has(p.key)) { shown.add(p.key); st.details.push(say(p.key)); keys.push(p.key); const was = absorbing; absorbing = one || was; walk(p.key); absorbing = was; } }
        else st.steps.push(step(p.key, path));
      }
      path.delete(k);
    };
    walk(key);
    // a value passed along reads as where it came from: `s points to class Store` rests on `new Store() points to class Store`, so the step says
    // `s points to new Store()`, and the model's own fact is its first detail
    const m = /^(\w+\[\w+\])\(([^,()]+),([^,()]+)\)$/.exec(key);
    if (m) {
      const from = [...st.steps.map((x) => x.literal), ...keys].map((k) => /^(\w+\[\w+\])\(([^,()]+),([^,()]+)\)$/.exec(k))
        .find((x) => x && x[1] === m[1] && x[3] === m[3] && x[2] !== m[2] && x[2] !== m[3]);
      if (from) { st.details.unshift(st.sentence); st.sentence = say(`${m[1]}(${m[2]},${from[2]})`); }
    }
    return st;
  };
  return step(top, new Set());
}
