// FRAGMENT 02 — redefining success.
//
// TASK      verify the counting column of a semiring fold over a CYCLIC
//           crafting graph (petroleum cracking: heavy -> light -> petrol -> light).
// QUESTION  as first asked: "enumerate the derivations of craftable(light_oil)
//           and check the count against the fold."
//
// Writing that enumerator down is what killed it. The graph has a cycle, so
// the set of derivations is infinite: enumeration does not terminate, and no
// budget makes it terminate. The question was wrong. The one that replaced it
// — "can 'infinitely many' be DECIDED?" — is answered by twenty lines of
// Tarjan over the support hypergraph, below. The enumerator was never written.
//
// Section 3 is the correction that arrived with the answer, and it is why the
// rule was NOT kept: SCC membership means an infinite count only for a
// non-idempotent plus. Run over the kernel's own Boolean meta-layer the same
// scan cries wolf.
import { Rofl } from '../../../src/api.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

const CRAFT = `
raw(crude_oil). raw(coal).
recipe(heavy_oil,  cons(crude_oil, nil)).
recipe(light_oil,  cons(heavy_oil, cons(water, nil))).
recipe(heavy_oil,  cons(light_oil, cons(water, nil))).
recipe(petrol_gas, cons(light_oil, cons(water, nil))).
recipe(light_oil,  cons(petrol_gas, cons(water, nil))).
recipe(water,      nil).
suffix(L)      :- recipe(_, L).
suffix(T)      :- suffix(cons(_, T)).
ok(nil).
ok(cons(H, T)) :- suffix(cons(H, T)), craftable(H), ok(T).
craftable(I)   :- raw(I).
craftable(I)   :- recipe(I, L), ok(L).
`;

/** Facts that lie on a cycle of the support hypergraph — Tarjan, iterative
 *  nowhere, because the graph is small and the point is the definition. */
export function cyclicFacts(r: Rofl): Set<string> {
  const S = r.store;
  const succ = (k: string): string[] => {
    const out: string[] = [];
    for (const w of S.witnessesOf(k)) for (const p of w.prems) if (p.t === 'fact') out.push(p.key);
    return out;
  };
  const idx = new Map<string, number>(), low = new Map<string, number>();
  const onstk = new Set<string>(); const stk: string[] = [];
  const sccs: string[][] = []; let c = 0;
  const strong = (v: string): void => {
    idx.set(v, c); low.set(v, c); c++; stk.push(v); onstk.add(v);
    for (const w of succ(v)) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (onstk.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = []; let w: string;
      do { w = stk.pop()!; onstk.delete(w); comp.push(w); } while (w !== v);
      sccs.push(comp);
    }
  };
  for (const k of [...S.facts.keys()].sort()) if (!idx.has(k)) strong(k);
  return new Set(sccs.filter((c0) => c0.length > 1 || succ(c0[0]).includes(c0[0])).flat());
}

export function run(): string[] {
  const out: string[] = [];
  const r = new Rofl();
  r.load(fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8'));
  r.load(CRAFT);
  r.evaluate();

  // 1. the cheap check first: does `why` already say so? It does not.
  const text = r.why('craftable(light_oil)').text;
  out.push(`1. does why mark the cycle?  contains "[cycle]": ${text.includes('[cycle]')}`);
  out.push('   (the marker is a render guard; the tree follows one witness to an axiom)');

  const cyc = cyclicFacts(r);
  const craft = (inCycle: boolean) => [...r.store.facts.keys()]
    .filter((k) => k.startsWith('craftable') && cyc.has(k) === inCycle).sort()
    .map((k) => k.replace('[main]', '')).join(' ');
  out.push('');
  out.push('2. decided, not enumerated:');
  out.push(`   infinitely many derivations : ${craft(true)}`);
  out.push(`   finite, safe to report      : ${craft(false)}`);

  out.push('');
  out.push('3. PRECISION — the same scan over the kernel\'s own Boolean meta-layer:');
  // `reach` and `dep` were the two biggest entries here until boot.rofl stopped
  // carrying the ten rules that derived them; `flows_to` is the closure that
  // remains and it sits on a support cycle for exactly the same reason.
  for (const rel of ['flows_to', 'flow', 'sees', 'gathered']) {
    const all = [...r.store.facts.keys()].filter((k) => k.startsWith(rel + '['));
    if (!all.length) continue;
    const n = all.filter((k) => cyc.has(k)).length;
    out.push(`   ${rel.padEnd(9)} ${String(n).padStart(3)} of ${String(all.length).padStart(3)} facts sit on a support cycle` +
      (n ? '   <- harmless here, and the naive rule would condemn them' : ''));
  }
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  console.log(run().join('\n'));
}
