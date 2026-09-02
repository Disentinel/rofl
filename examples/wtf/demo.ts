// examples/wtf/demo.ts -- WTF: the Magic: the Gathering layer system as a
// stratified fixpoint, with the three queries the example exists for.
//
//   node --experimental-strip-types examples/wtf/demo.ts
//
// Everything printed here is computed. The transcripts in README.md and
// page.html are this program's stdout, pasted.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { peelRounds, reachable, type Peel } from '../../src/rounds.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import { provenanceSemiring, provenanceOf, type Polynomial } from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const MODEL = read('examples', 'wtf', 'wtf.rofl');

/** Two removal spells resolved on top of the battlefield, to drive the
 *  state-based-action fixpoint. Kept out of wtf.rofl because they are a
 *  scenario, not the board: section 7 of the transcript adds them. */
export const SBA_PATCH = `
eff(e_grasp).      eff_layer(e_grasp, 73).      eff_ts(e_grasp, 1100).
eff_free(e_grasp). sel(e_grasp, only(archdruid)). does(e_grasp, mod_pt(-4, -4)).
eff_name(e_grasp, "Grasp of Darkness: -4/-4").   eord(e_grasp, 9).

eff(e_disfigure).  eff_layer(e_disfigure, 73).  eff_ts(e_disfigure, 1150).
eff_free(e_disfigure). sel(e_disfigure, only(grizzly)). does(e_disfigure, mod_pt(-2, -2)).
eff_name(e_disfigure, "Disfigure: -2/-2").       eord(e_disfigure, 10).
`;

/** The order the layers are applied in, as the CR numbers them. Nothing in
 *  wtf.rofl contains this list: it is here for PRINTING and for the
 *  independent oracle, which is allowed to know the rules it is checking. */
export const LAYERS = [10, 20, 30, 40, 50, 60, 71, 72, 73, 74];

// ---------------------------------------------------------------------------
// worlds

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

/** The full world: boot.rofl's meta-kernel plus the model. This is the one
 *  that audits itself -- and it is not optional. Without boot.rofl there are
 *  no stratum/2 facts, every negation rule runs in one final pass, and the
 *  answers are WRONG (test/example-wtf.test.ts pins that). */
export function world(): Rofl {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(MODEL), 'wtf.rofl');
  return r;
}

/** THE SAME WORLD ON THE OTHER EVALUATOR. Rounds are what `Rofl` runs by
 *  default: the phase order is peeled off the decoded rules before anything
 *  fires. `'strata'` is the original, which reads the order out of the
 *  `stratum/2` facts boot.rofl derives. Both are exercised HERE because this
 *  model carries fourteen layers — the deepest ordering in the corpus — so if
 *  the two schedulers can ever disagree, they disagree here first. */
export function stockWorld(): Rofl {
  const r = new Rofl({ evaluator: 'strata' });
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(MODEL), 'wtf.rofl');
  return r;
}

/** The model with NO meta-layer under it at all, on whichever evaluator. This
 *  is where the two part company: rounds still form the fourteen layers, the
 *  stratum table has nothing to read and every negation rule falls into one
 *  final pass. */
export function bareWorld(evaluator: 'rounds' | 'strata'): Rofl {
  const r = new Rofl({ evaluator });
  must(r.load(MODEL), 'wtf.rofl');
  return r;
}

let leanSnap: string | null = null;

/** The same model with NO meta-layer under it at all.
 *
 *  This used to carry the strata boot.rofl computed, as facts, because boot's
 *  own transitive closure over 200-odd rules cost seconds a run and the order
 *  sweep needs ~50 of them. There is nothing left to carry: the fourteen
 *  layers are peeled off the rules before anything fires, so the model alone
 *  is already ordered and the saving is the whole meta-layer rather than the
 *  closure inside it. What remains worth checking is that the audits boot.rofl
 *  still performs change no answer, which is what `leanAgrees()` measures. */
export function leanWorld(): Rofl {
  const r = new Rofl();
  must(r.load(MODEL), 'wtf.rofl');
  return r;
}

/** A snapshot of the lean world, so the sweep restores rather than reloads. */
function leanBase(): string {
  if (leanSnap === null) leanSnap = leanWorld().save();
  return leanSnap;
}

/** The ANSWER: a permanent's characteristics after all seven layers. The
 *  order sweep counts distinct values of exactly this, so the intermediate
 *  ordering relations (bef4, eta4, dead4) are deliberately NOT in it -- those
 *  change with every permutation by construction, and counting them would
 *  make every sublayer look order-dependent. */
export const ANSWER_RELS = ['pt', 'ty4', 'co5', 'ab6', 'ct2', 'lethal', 'swamps'];

export function digest(r: Rofl): string {
  return [...r.store.facts.values()]
    .filter((f) => ANSWER_RELS.includes(f.rel))
    .map((f) => f.key).sort().join('\n');
}

export function leanAgrees(): boolean {
  return digest(world()) === digest(leanWorld());
}

// ---------------------------------------------------------------------------
// the layer order as EVIDENCE, not as prose
//
// A kernel stratum is a level forced by NEGATION and derived by boot.rofl from
// the rule dependency graph. An MTG layer is an order the Comprehensive Rules
// ASSERT -- nobody derives it, the rulebook states it. The two coincide only
// where layer N's rules negate on layer N-1's RELATION, which is an obligation
// wtf.rofl discharges deliberately, one boundary at a time. Where a layer
// REMOVES nothing there is no negation to route and the boundary is flat --
// reported, not papered over.
//
// Both columns below are relations boot.rofl derived: `stratum/2` for the
// level, `reach/2` for the direction of the rule-graph dependency.

/** lo, hi, the layer that separates them, and why it is flat if it is. */
export const BOUNDARIES: [string, string, string, string][] = [
  ['printed_type', 'ty1', '1  copy', ''],
  ['ty1', 'ty3', '3  text', 'a text change rewrites TEXT, never types: ty3 is a literal alias'],
  ['ty3', 'ty4', '4  type', ''],
  ['printed_color', 'co1', '1  copy', ''],
  ['co1', 'co3', '3  text', 'same: a text change rewrites TEXT, never colours'],
  ['co3', 'co5', '5  colour', ''],
  ['printed_ability', 'ab1', '1  copy', ''],
  ['ab1', 'ab3', '3  text', ''],
  ['ab3', 'ab4', '4  CR 305.7', ''],
  ['ab4', 'ab6', '6  abilities', ''],
  ['printed_ctrl', 'ct1', '1  copy', 'a copy effect does not change who controls the object'],
  ['ct1', 'ct2', '2  control', ''],
  ['printed_pt', 'bp1', '1  copy', ''],
  ['bp1', 'pt7a', '7a CDA', ''],
  ['pt7a', 'pt7b', '7b set', ''],
  ['pt7b', 'pt7c', '7c modify', '7c only ADDS -- it overrides nothing, so there is no negation to route'],
  ['pt7c', 'pt7d', '7d switch', ''],
];

export interface Boundary {
  lo: string; hi: string; layer: string; flatWhy: string;
  loN: number; hiN: number; forced: boolean;
  oneWay: boolean;
  /** What the layer above NEGATES — its removals, as relation names. */
  removals: string[];
  /** ...and whether any of them ranges over the layer below. This is the
   *  property the two-line shape in wtf.rofl exists to discharge, and it is
   *  the one worth asserting: `forced` (the level number rose) is a fact about
   *  the SCHEDULE and it rose under the stratum table for reasons that had
   *  nothing to do with a removal. Under rounds it rises again for a third
   *  reason — every derived relation wakes at least one round after its base
   *  inputs — so the number gap was never the test. The removal is. */
  removalOverLo: boolean;
}

/** THE SCHEDULE, taken where it now lives. boot.rofl used to derive `stratum/2`
 *  and this function read it out of the store; the ten rules that did so were
 *  deleted when the evaluator started peeling its schedule off the decoded
 *  rules instead. The number is the same number — the round a relation settles
 *  in IS its stratum — and it is now read from the peel rather than from facts
 *  the program had to derive about itself first. A relation no rule mentions
 *  has no round, and -1 still means that. */
export function stratumOf(r: Rofl, rel: string): number {
  return peelOf(r).round.get(rel) ?? -1;
}

/** One peel per store, memoised: fourteen layers over 200-odd rules is cheap,
 *  but `boundaries()` asks for seventeen of them in a row. */
const peelCache = new WeakMap<Rofl, Peel>();
export function peelOf(r: Rofl): Peel {
  let p = peelCache.get(r);
  if (p === undefined) {
    p = peelRounds(new Evaluation(r.store, {}).rules);
    peelCache.set(r, p);
  }
  return p;
}

/** `reach/2`, over the same graph the peel is taken on. This is the closure
 *  boot.rofl used to publish; it is computed here, in the demo that asks the
 *  question, rather than by ten rules every program in the corpus had to carry. */
const reachCache = new WeakMap<Rofl, Map<string, Set<string>>>();
export function reachesFrom(r: Rofl, from: string, to: string): boolean {
  let m = reachCache.get(r);
  if (m === undefined) { m = reachable(peelOf(r)); reachCache.set(r, m); }
  return m.get(from)?.has(to) ?? false;
}

export function boundaries(r: Rofl): Boundary[] {
  const p = peelOf(r);
  return BOUNDARIES.map(([lo, hi, layer, flatWhy]) => {
    const loN = stratumOf(r, lo), hiN = stratumOf(r, hi);
    const removals = [...(p.deps.neg.get(hi) ?? [])].sort();
    return {
      lo, hi, layer, flatWhy, loN, hiN,
      forced: hiN > loN,
      oneWay: reachesFrom(r, hi, lo) && !reachesFrom(r, lo, hi),
      removals,
      removalOverLo: removals.some((q) => q === lo || reachesFrom(r, q, lo)),
    };
  });
}

/** The same program with ONE layer boundary written the other way: the
 *  negation moved off the layer below and onto a fact about effects. The two
 *  compute the same answers; only one of them is visible to the kernel as a
 *  level. This is the measurement behind the claim, and it is why the two-line
 *  shape in wtf.rofl is deliberate rather than decorative. */
export const WEAK_MODEL: string = (() => {
  const strong = 'lost5(O, C)     :- co3(O, C), anyset5(O).\n'
    + 'co5(O, C)       :- co3(O, C), not lost5(O, C).';
  const weak = 'co5(O, C)       :- co3(O, C), not anyset5(O).';
  if (!MODEL.includes(strong)) {
    throw new Error('the layer 5 boundary probe lost its anchor in wtf.rofl');
  }
  return MODEL.replace(strong, weak);
})();

export function boundaryProbe(): {
  co3: number; strong: number; weak: number; sameAnswers: boolean;
} {
  const strongW = world();
  const weakW = new Rofl();
  must(weakW.load(BOOT), 'boot.rofl');
  must(weakW.load(WEAK_MODEL), 'wtf.rofl (weak layer 5 boundary)');
  return {
    co3: stratumOf(strongW, 'co3'),
    strong: stratumOf(strongW, 'co5'),
    weak: stratumOf(weakW, 'co5'),
    sameAnswers: digest(strongW) === digest(weakW),
  };
}

// ---------------------------------------------------------------------------
// small helpers over query results

export function tuples(r: Rofl, rel: string, arity: number): string[][] {
  const vars = Array.from({ length: arity }, (_, i) => `X${i}`);
  const res = r.query(`${rel}(${vars.join(', ')})`);
  return res.rows.map((row) => vars.map((v) => row.bindings[v]));
}

/** `"Grizzly Bears"` -> `Grizzly Bears`; atoms pass through. */
export const unq = (s: string): string => (s.startsWith('"') ? JSON.parse(s) as string : s);

const one = (r: Rofl, q: string, v: string): string | undefined =>
  r.query(q).rows[0]?.bindings[v];

export const cardName = (r: Rofl, o: string): string =>
  unq(one(r, `card(${o}, N)`, 'N') ?? o);
export const effName = (r: Rofl, e: string): string =>
  unq(one(r, `eff_name(${e}, N)`, 'N') ?? e);
export const tsOf = (r: Rofl, e: string): number =>
  Number(one(r, `eff_ts(${e}, T)`, 'T'));
export const layerLabel = (r: Rofl, l: number): string =>
  unq(one(r, `layer_label(${l}, N)`, 'N') ?? String(l));

const banner = (s: string) => '\n' + s + '\n' + '='.repeat(s.length);
const sub = (s: string) => '\n' + s + '\n' + '-'.repeat(s.length);

/** The effects of one sublayer, in the order the rules put them in. Layer 4
 *  is ordered by `bef4` (dependency, then timestamp); every other sublayer by
 *  `bef_ts` (timestamp alone). */
export function orderOf(r: Rofl, layer: number): string[] {
  const rel = layer === 40 ? 'bef4' : 'bef_ts';
  const es = tuples(r, `lay${layerKey(layer)}`, 1).map((t) => t[0]);
  const pairs = new Set(r.query(`${rel}(A, B)`).rows.map((x) => `${x.bindings.A}|${x.bindings.B}`));
  return es.slice().sort((a, b) => (pairs.has(`${a}|${b}`) ? -1 : pairs.has(`${b}|${a}`) ? 1 : 0));
}

const layerKey = (l: number): string =>
  l === 10 ? '1' : l === 20 ? '2' : l === 30 ? '3' : l === 40 ? '4'
    : l === 50 ? '5' : l === 60 ? '6' : String(l);

// ---------------------------------------------------------------------------
// `wtf <permanent>` -- the derivation, layer by layer

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

function chars(r: Rofl, o: string): string {
  const ty = tuples(r, 'ty4', 2).filter((t) => t[0] === o).map((t) => t[1]).sort();
  const co = tuples(r, 'co5', 2).filter((t) => t[0] === o).map((t) => t[1]).sort();
  const ab = tuples(r, 'ab6', 2).filter((t) => t[0] === o).map((t) => t[1]).sort();
  const ct = one(r, `ct2(${o}, P)`, 'P') ?? '?';
  const p = r.query(`pt(${o}, P, T)`).rows[0];
  return [
    p ? `${p.bindings.P}/${p.bindings.T}` : '--',
    co.join(' ') || 'colourless',
    ty.join(' '),
    ct,
    ab.length ? '{' + ab.join(', ') + '}' : '{}',
  ].join('   ');
}

/** One line per effect that touched this permanent, with its LAYER and its
 *  TIMESTAMP, in application order -- and, where an effect was overridden or
 *  never applied at all, the reason. */
export function wtfSteps(r: Rofl, o: string): string[] {
  const out: string[] = [];
  const line = (l: number, ts: number | null, what: string, note: string) =>
    out.push(`  ${pad(layerLabel(r, l), 26)}${pad(ts === null ? '' : 'T' + ts, 7)}`
      + pad(what, 30) + note);

  for (const layer of LAYERS) {
    for (const e of orderOf(r, layer)) {
      const ts = tsOf(r, e);
      const nm = effName(r, e);
      if (layer === 10) {
        const s = one(r, `copy_src(${o}, S)`, 'S');
        if (s && r.holds(`hits1(${e}, ${o})`)) line(10, ts, `copies ${cardName(r, s)}`, nm);
      } else if (layer === 20) {
        if (r.holds(`ctl2(${o}, P, ${e})`)) {
          const p = one(r, `ctl2(${o}, P, ${e})`, 'P')!;
          line(20, ts, `controller := ${p}`,
            r.holds(`overctl2(${o}, ${e})`) ? 'OVERRIDDEN by a later timestamp' : nm);
        }
      } else if (layer === 30) {
        const row = r.query(`tc3(${o}, W1, W2)`).rows[0];
        if (row && r.holds(`hits3(${e}, ${o})`)) {
          line(30, ts, `text: ${row.bindings.W1} -> ${row.bindings.W2}`, nm);
        }
      } else if (layer === 40) {
        for (const t of r.query(`adder4(${o}, T, ${e})`).rows) {
          line(40, ts, `+type ${t.bindings.T}`,
            r.holds(`clob4(${o}, ${e})`) ? 'OVERRIDDEN by a later setter' : nm);
        }
        for (const t of r.query(`setter4(${o}, T, ${e})`).rows) {
          line(40, ts, `land type := ${t.bindings.T}`,
            r.holds(`clob4(${o}, ${e})`) ? 'OVERRIDDEN by a later setter'
              : nm + ' (+ CR 305.7: rules-text abilities go)');
        }
        if (r.holds(`hits4(${e}, ${o})`) && r.holds(`dead4(${e})`)) {
          const s = one(r, `eff_src(${e}, S)`, 'S');
          const b = s ? one(r, `kills_ability(B, ${s})`, 'B') : undefined;
          line(40, ts, '(would apply)',
            `NEVER APPLIES: ${b ? effName(r, b) : '?'} removed the ability generating it`);
        }
      } else if (layer === 50) {
        for (const c of r.query(`addcol5(${o}, C, ${e})`).rows) {
          line(50, ts, `+colour ${c.bindings.C}`,
            r.holds(`clob5(${o}, ${e})`) ? 'OVERRIDDEN by a later setter' : nm);
        }
        for (const c of r.query(`setcol5(${o}, C, ${e})`).rows) {
          line(50, ts, `colour := ${c.bindings.C}`,
            r.holds(`clob5(${o}, ${e})`) ? 'OVERRIDDEN by a later setter' : nm);
        }
      } else if (layer === 60) {
        for (const a of r.query(`src6(${o}, A, ${e})`).rows) {
          line(60, ts, `+ability ${a.bindings.A}`,
            r.holds(`gone6(${o}, ${a.bindings.A}, ${e})`) ? 'REMOVED by a later timestamp' : nm);
        }
        for (const a of r.query(`kill6(${o}, A, ${e})`).rows) {
          line(60, ts, `-ability ${a.bindings.A}`, nm);
        }
      } else if (layer === 71) {
        const row = r.query(`cda_pt(${o}, P, T)`).rows[0];
        if (row && r.holds(`sel(${e}, self(${o}))`)) {
          line(71, ts, `p/t := ${row.bindings.P}/${row.bindings.T}`,
            nm + ' (reads the answer layer 4 gave)');
        }
      } else if (layer === 72) {
        for (const s of r.query(`set72(${o}, P, T, ${e})`).rows) {
          line(72, ts, `p/t := ${s.bindings.P}/${s.bindings.T}`,
            r.holds(`clob72(${o}, ${e})`) ? 'OVERRIDDEN by a later timestamp' : nm);
        }
      } else if (layer === 73) {
        for (const m of r.query(`mod73(${o}, ${e}, DP, DT)`).rows) {
          const dp = Number(m.bindings.DP), dt = Number(m.bindings.DT);
          line(73, ts, `${dp >= 0 ? '+' : ''}${dp}/${dt >= 0 ? '+' : ''}${dt}`, nm);
        }
      } else if (layer === 74) {
        if (r.holds(`sw74(${o}, ${e})`)) line(74, ts, 'switch p/t', nm);
      }
    }
  }
  return out;
}

export function wtfReport(r: Rofl, o: string): string {
  const out = [`$ wtf ${o}`];
  const p = r.query(`pt(${o}, P, T)`).rows[0];
  out.push(`${pad(cardName(r, o), 34)}${p ? p.bindings.P + '/' + p.bindings.T : '(not a creature)'}`);
  out.push('');
  const bp = r.query(`bp1(${o}, P, T)`).rows[0];
  const printedTy = tuples(r, 'printed_type', 2).filter((t) => t[0] === o).map((t) => t[1]).sort();
  const printedCo = tuples(r, 'printed_color', 2).filter((t) => t[0] === o).map((t) => t[1]).sort();
  out.push(`  ${pad('printed', 26)}${pad('', 7)}`
    + pad(bp ? `${bp.bindings.P}/${bp.bindings.T}` : 'no p/t', 30)
    + `${printedCo.join(' ') || 'colourless'}  ${printedTy.join(' ')}`);
  out.push(...wtfSteps(r, o));
  out.push('');
  out.push(`  => ${chars(r, o)}`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// the dependency, and why the order was what it was

export function dependencyReport(r: Rofl): string {
  const out: string[] = [];
  const order = orderOf(r, 40);
  out.push('layer 4 holds three effects. Their timestamps:');
  for (const e of tuples(r, 'lay4', 1).map((t) => t[0]).sort((a, b) => tsOf(r, a) - tsOf(r, b))) {
    out.push(`    T${pad(String(tsOf(r, e)), 6)}${effName(r, e)}`);
  }
  out.push('');
  out.push('CR 613.8a, applied to every ordered pair -- derived, not declared:');
  const deps = r.query('dep_reason(A, B, R)').rows;
  if (deps.length === 0) out.push('    (no dependency)');
  for (const d of deps) {
    const { A, B, R } = d.bindings;
    out.push(`    ${effName(r, A)}`);
    out.push(`      depends on ${effName(r, B)}   [clause: ${R}]`);
  }
  out.push('');
  out.push(`CR 613.8b: the dependent effects wait. Application order:`);
  out.push('    ' + order.map((e) => `T${tsOf(r, e)}`).join('  ->  '));
  out.push('    ' + order.map((e) => effName(r, e)).join('\n    -> '));
  out.push('');
  out.push('Timestamp order would have been:');
  const naive = tuples(r, 'lay4', 1).map((t) => t[0]).sort((a, b) => tsOf(r, a) - tsOf(r, b));
  out.push('    ' + naive.map((e) => `T${tsOf(r, e)}`).join('  ->  '));
  out.push('');
  out.push('The sorting key the rules compute (eta = the largest timestamp among an');
  out.push('effect and its dependency ancestors -- CR 613.8b as a key, not a loop):');
  for (const e of order) out.push(`    eta ${pad(one(r, `eta4(${e}, T)`, 'T')!, 6)}ts ${pad(String(tsOf(r, e)), 6)}${effName(r, e)}`);
  out.push('');
  const dead = tuples(r, 'dead4', 1).map((t) => t[0]);
  out.push(`Effects that therefore never apply: ${dead.map((e) => effName(r, e)).join('; ') || '(none)'}`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// whynot

/** "why is Grizzly Bears not 4/4" -- the layer that overrode, the timestamp
 *  that did it, and what would have to differ. The last part is not asserted:
 *  `counterfactual` below makes exactly that change and reports the result. */
export function whynotFourFour(r: Rofl): string {
  const out: string[] = ['$ wtf -n grizzly 4/4', ''];
  const p = r.query('pt(grizzly, P, T)').rows[0];
  out.push(`  it is ${p.bindings.P}/${p.bindings.T}, not 4/4.`);
  out.push('');
  // which layer 7c effect is one +1/+1 short
  const anthems = r.query('anthem_eff(E, S)').rows;
  for (const a of anthems) {
    const { E, S } = a.bindings;
    const ab = r.query(`ab6(${S}, anthem(C, DP, DT))`).rows[0];
    if (!ab) continue;
    const { C, DP, DT } = ab.bindings;
    if (r.holds(`mod73(grizzly, ${E}, ${DP}, ${DT})`)) continue;
    out.push(`  the missing +${DP}/+${DT} is ${effName(r, E)}.`);
    out.push(`  it wants colour ${C}; grizzly's colour after layer 5 is `
      + (tuples(r, 'co5', 2).filter((t) => t[0] === 'grizzly').map((t) => t[1]).join(' ') || 'colourless') + '.');
    // and the layer 5 story
    const adds = r.query(`addcol5(grizzly, ${C}, E)`).rows;
    for (const ad of adds) {
      const E2 = ad.bindings.E;
      out.push('');
      out.push(`  layer 5 DID add ${C} at T${tsOf(r, E2)} (${effName(r, E2)}),`);
      const setters = r.query('setcol5(grizzly, C2, F)').rows;
      for (const st of setters) {
        const F = st.bindings.F;
        if (!r.holds(`bef_ts(${E2}, ${F})`)) continue;
        out.push(`  but T${tsOf(r, F)} (${effName(r, F)}) SET the colour to `
          + `${st.bindings.C2}, and a later timestamp in the same layer wins`);
        out.push(`  (CR 613.7 -- and CR 613.8 does not apply: p5_dep is empty, so`);
        out.push(`  nothing in layer 5 depends on anything else in layer 5).`);
        out.push('');
        out.push(`  what would have to differ: T${tsOf(r, F)} < T${tsOf(r, E2)}, or `
          + `${effName(r, F)} absent.`);
      }
    }
  }
  return out.join('\n');
}

/** Make the change whynot named, and report what actually happens. */
export function counterfactual(): { before: string; after: string } {
  const a = leanWorld();
  const before = a.query('pt(grizzly, P, T)').rows[0];
  const b = leanWorld();
  // swap the two layer 5 timestamps: the Wisps become the older effect
  b.retract('eff_ts(e_wisps, 650)');
  b.retract('eff_ts(e_painter, 600)');
  must(b.load('eff_ts(e_wisps, 600).\neff_ts(e_painter, 650).'), 'swap');
  const after = b.query('pt(grizzly, P, T)').rows[0];
  return {
    before: `${before.bindings.P}/${before.bindings.T}`,
    after: `${after.bindings.P}/${after.bindings.T}`,
  };
}

// ---------------------------------------------------------------------------
// counting: how many application orders give the same answer

export interface Sweep {
  layer: number;
  scope: string | null;
  effects: string[];
  orders: number;
  outcomes: number;
  naiveOutcomes: number | null;
  verdict: string;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i++) {
    const rest = xs.slice(0, i).concat(xs.slice(i + 1));
    for (const p of permutations(rest)) out.push([xs[i], ...p]);
  }
  return out;
}

/** Effects of one sublayer, optionally narrowed to those that reach one
 *  permanent (layer 7c has eight, and 8! runs is not a demo). */
export function sweepSet(r: Rofl, layer: number, scope: string | null): string[] {
  const all = tuples(r, `lay${layerKey(layer)}`, 1).map((t) => t[0]);
  if (scope === null) return all.sort();
  return all.filter((e) => r.holds(`hits${layer === 40 ? '4' : layerKey(layer)}(${e}, ${scope})`)).sort();
}

/** The sublayers the counting mode sweeps, and how each is scoped. Layer 7c
 *  holds eight effects and 8! runs is not a demo, so it is scoped to the
 *  permanent whose three modifiers actually meet. */
export const SWEEPS: [number, string | null][] = [
  [40, null], [50, null], [60, null], [72, null], [73, 'gray_ogre'], [74, null],
];

/** Re-run the whole layer computation under every permutation of one
 *  sublayer's timestamps, count the DISTINCT answers -- and, in the same
 *  pass, check each board and each layer 4 order against the independent
 *  implementation in `simulate`. One outcome over many orders means the
 *  interaction is stable; more than one means the result depends on the
 *  order, and that is the configuration judges write rulings about. */
export function runSweeps(): { sweeps: Sweep[]; oracle: OracleReport } {
  const base = leanWorld();
  const board = readBoard(base);
  const origTs = new Map(board.effs.map((e) => [e.id, e.ts] as const));
  const snap = leanBase();
  const sweeps: Sweep[] = [];
  const mismatches: string[] = [];
  const orderMismatches: string[] = [];
  let compared = 1, orderChecks = 0;
  if (oracleDigest(board) !== kernelDigest(base)) mismatches.push('base board');

  for (const [layer, scope] of SWEEPS) {
    const es = sweepSet(base, layer, scope);
    const stamps = es.map((e) => origTs.get(e)!).sort((a, b) => a - b);
    const seen = new Set<string>();
    const seenNaive = new Set<string>();
    const perms = permutations(es);
    for (const p of perms) {
      const w = Rofl.fromSnapshot(snap);
      for (const e of es) w.retract(`eff_ts(${e}, ${origTs.get(e)})`);
      must(w.load(p.map((e, i) => `eff_ts(${e}, ${stamps[i]}).`).join('\n')), 'permute');
      seen.add(digest(w));
      seenNaive.add(tuples(w, 'ty4n', 2).map((t) => t.join('|')).sort().join('\n')
        + '\n' + tuples(w, 'swamps_n', 2).map((t) => t.join('|')).sort().join('\n'));

      const over = new Map<string, number>(p.map((e, i) => [e, stamps[i]] as const));
      compared++;
      if (oracleDigest(board, over) !== kernelDigest(w)) {
        mismatches.push(`layer ${layer}${scope ? '/' + scope : ''}: ${p.join(',')}`);
      }
      orderChecks++;
      const simOrder = simulate(board, over).orders.get(40)!.join(',');
      const kernOrder = orderOf(w, 40).join(',');
      if (simOrder !== kernOrder) {
        orderMismatches.push(`layer 4 under ${p.join(',')}: rules ${kernOrder}, oracle ${simOrder}`);
      }
    }
    sweeps.push({
      layer, scope, effects: es, orders: perms.length, outcomes: seen.size,
      naiveOutcomes: layer === 40 ? seenNaive.size : null,
      verdict: seen.size === 1 ? 'stable' : 'ORDER-DEPENDENT',
    });
  }

  const pt = (o: string) => {
    const x = base.query(`pt(${o}, P, T)`).rows[0];
    return x ? `${x.bindings.P}/${x.bindings.T}` : '(none)';
  };
  const crExamples = [
    { name: 'CR 613.4d Example 1 (1/3, +0/+1, switch, +5/+0)', want: '4/6', got: pt('oracle') },
    { name: 'CR 613.5 Example 2 (2/2, +1/+1 counter, +4/+4, +0/+2, becomes 0/1)',
      want: '5/8', got: pt('gray_ogre') },
  ].map((x) => ({ ...x, ok: x.want === x.got }));

  return { sweeps, oracle: { compared, mismatches, orderChecks, orderMismatches, crExamples } };
}

// ---------------------------------------------------------------------------
// state-based actions: a second fixpoint, above the layer computation

export interface SbaRound { round: number; died: string[]; sizes: string[]; }

/** CR 704.5f. Retract on_bf/1 for every creature with toughness 0 or less,
 *  re-run the whole layer computation, repeat until nothing is lethal. The
 *  round count is the height of this outer fixpoint; it is greater than one
 *  exactly when a death removes an effect that was keeping something else
 *  alive. */
export function sbaFixpoint(): { rounds: SbaRound[]; final: Rofl } {
  let r = leanWorld();
  must(r.load(SBA_PATCH), 'sba patch');
  const rounds: SbaRound[] = [];
  for (let n = 1; n <= 8; n++) {
    const sizes = tuples(r, 'pt', 3).sort().map((t) => `${t[0]} ${t[1]}/${t[2]}`);
    const died = tuples(r, 'lethal', 1).map((t) => t[0]).sort();
    rounds.push({ round: n, died, sizes });
    if (died.length === 0) break;
    const next = Rofl.fromSnapshot(r.save());
    for (const d of died) next.retract(`on_bf(${d})`);
    next.evaluate();
    r = next;
  }
  return { rounds, final: r };
}

// ---------------------------------------------------------------------------
// the oracle: an independent implementation of CR 613, in plain TypeScript

interface OEff {
  id: string; layer: number; ts: number; src: string | null; cda: boolean;
  sel: string; act: string; lordOf: string | null; anthemOf: string | null;
}

interface OObj {
  id: string; types: Set<string>; colors: Set<string>; abilities: Set<string>;
  ctrl: string; base: [number, number] | null; pt: [number, number] | null;
}

const fnArgs = (t: string): string[] => {
  const i = t.indexOf('(');
  if (i < 0) return [];
  const inner = t.slice(i + 1, -1);
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let j = 0; j < inner.length; j++) {
    const c = inner[j];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(inner.slice(start, j)); start = j + 1; }
  }
  out.push(inner.slice(start));
  return out.map((s) => s.trim());
};
const fnName = (t: string): string => (t.includes('(') ? t.slice(0, t.indexOf('(')) : t);

/** Read the BOARD out of the store -- the facts are the input data, shared by
 *  construction. What is independent is everything below: the layer walk, the
 *  613.8 dependency test and the 613.8b scheduler are written here from the
 *  rule text, not from wtf.rofl. */
export function readBoard(r: Rofl) {
  const onBf = tuples(r, 'on_bf', 1).map((t) => t[0]);
  const printedType = tuples(r, 'printed_type', 2);
  const printedColor = tuples(r, 'printed_color', 2);
  const printedAbility = tuples(r, 'printed_ability', 2);
  const printedPt = tuples(r, 'printed_pt', 3);
  const printedCtrl = tuples(r, 'printed_ctrl', 2);
  const landTypes = new Set(tuples(r, 'land_type', 1).map((t) => t[0]));
  const lordOf = new Map(tuples(r, 'lord_eff', 2).map((t) => [t[0], t[1]] as const));
  const anthemOf = new Map(tuples(r, 'anthem_eff', 2).map((t) => [t[0], t[1]] as const));
  const sel = new Map(tuples(r, 'sel', 2).map((t) => [t[0], t[1]] as const));
  const does = new Map(tuples(r, 'does', 2).map((t) => [t[0], t[1]] as const));
  const cdaSet = new Set(tuples(r, 'cda', 1).map((t) => t[0]));
  const src = new Map(tuples(r, 'eff_src', 2).map((t) => [t[0], t[1]] as const));
  const effs: OEff[] = tuples(r, 'eff', 1).map((t) => t[0]).map((id) => ({
    id,
    layer: Number(one(r, `eff_layer(${id}, L)`, 'L')),
    ts: tsOf(r, id),
    src: src.get(id) ?? null,
    cda: cdaSet.has(id),
    sel: sel.get(id) ?? '',
    act: does.get(id) ?? '',
    lordOf: lordOf.get(id) ?? null,
    anthemOf: anthemOf.get(id) ?? null,
  }));
  return { onBf, printedType, printedColor, printedAbility, printedPt, printedCtrl,
    landTypes, effs, cntOrd: tuples(r, 'cnt_ord', 2).map((t) => t[0]) };
}

type Board = ReturnType<typeof readBoard>;

function initObjs(b: Board): Map<string, OObj> {
  const m = new Map<string, OObj>();
  for (const id of b.onBf) {
    m.set(id, {
      id,
      types: new Set(b.printedType.filter((t) => t[0] === id).map((t) => t[1])),
      colors: new Set(b.printedColor.filter((t) => t[0] === id).map((t) => t[1])),
      abilities: new Set(b.printedAbility.filter((t) => t[0] === id).map((t) => t[1])),
      ctrl: b.printedCtrl.find((t) => t[0] === id)![1],
      base: (() => {
        const p = b.printedPt.find((t) => t[0] === id);
        return p ? [Number(p[1]), Number(p[2])] as [number, number] : null;
      })(),
      pt: null,
    });
  }
  return m;
}

/** CR 613: the whole layer walk, done the obvious sequential way. */
export function simulate(b: Board, tsOverride: Map<string, number> = new Map()):
    { objs: Map<string, OObj>; orders: Map<number, string[]> } {
  const objs = initObjs(b);
  const cleared = new Set<string>();
  const orders = new Map<number, string[]>();
  const ts = (e: OEff) => tsOverride.get(e.id) ?? e.ts;

  const targets = (e: OEff, w: Map<string, OObj>): Set<string> => {
    const out = new Set<string>();
    const k = fnName(e.sel);
    if (k === 'only' || k === 'self') { const o = fnArgs(e.sel)[0]; if (w.has(o)) out.add(o); return out; }
    if (k === 'all_perms') { for (const o of w.keys()) out.add(o); return out; }
    if (k === 'all_lands') { for (const o of w.values()) if (o.types.has('land')) out.add(o.id); return out; }
    if (k === 'nonbasic_lands') {
      for (const o of w.values()) if (o.types.has('land') && !o.types.has('basic')) out.add(o.id);
      return out;
    }
    if (e.lordOf) {
      const s = w.get(e.lordOf);
      const ab = s && [...s.abilities].find((a) => fnName(a) === 'lord');
      if (!s || !ab) return out;
      const st = fnArgs(ab)[0];
      for (const o of w.values()) if (o.id !== s.id && o.types.has(st) && o.ctrl === s.ctrl) out.add(o.id);
      return out;
    }
    if (e.anthemOf) {
      const s = w.get(e.anthemOf);
      const ab = s && [...s.abilities].find((a) => fnName(a) === 'anthem');
      if (!s || !ab) return out;
      const c = fnArgs(ab)[0];
      for (const o of w.values()) {
        if (o.types.has('creature') && o.colors.has(c) && o.ctrl === s.ctrl) out.add(o.id);
      }
      return out;
    }
    return out;
  };

  const exists = (e: OEff, w: Map<string, OObj>): boolean => {
    if (e.src === null) return true;
    if (!w.has(e.src)) return false;
    if (cleared.has(e.src)) return false;
    if (e.lordOf) return [...w.get(e.lordOf)!.abilities].some((a) => fnName(a) === 'lord');
    if (e.anthemOf) return [...w.get(e.anthemOf)!.abilities].some((a) => fnName(a) === 'anthem');
    return true;
  };

  const swampsOf = (pl: string, w: Map<string, OObj>): number =>
    b.cntOrd.filter((o) => w.get(o)?.types.has('swamp') && w.get(o)!.ctrl === pl).length;

  const apply = (e: OEff, w: Map<string, OObj>, clr: Set<string>): void => {
    const kind = fnName(e.act);
    const args = fnArgs(e.act);
    for (const id of targets(e, w)) {
      const o = w.get(id)!;
      if (kind === 'copy') {
        const s = args[0];
        o.types = new Set(b.printedType.filter((t) => t[0] === s).map((t) => t[1]));
        o.colors = new Set(b.printedColor.filter((t) => t[0] === s).map((t) => t[1]));
        o.abilities = new Set(b.printedAbility.filter((t) => t[0] === s).map((t) => t[1]));
        const p = b.printedPt.find((t) => t[0] === s);
        o.base = p ? [Number(p[1]), Number(p[2])] : null;
      } else if (kind === 'control') { o.ctrl = args[0]; }
      else if (kind === 'text_change') {
        o.abilities = new Set([...o.abilities].map((a) => {
          if (fnName(a) !== 'lord') return a;
          const aa = fnArgs(a);
          return aa[0] === args[0] ? `lord(${args[1]},${aa[1]},${aa[2]})` : a;
        }));
      } else if (kind === 'add_type') { o.types.add(args[0]); }
      else if (kind === 'set_land_type') {
        for (const t of [...o.types]) if (b.landTypes.has(t)) o.types.delete(t);
        o.types.add(args[0]);
        o.abilities.clear();                       // CR 305.7
        clr.add(o.id);
      } else if (kind === 'add_color') { o.colors.add(args[0]); }
      else if (kind === 'set_color') { o.colors = new Set([args[0]]); }
      else if (kind === 'gain') { o.abilities.add(args[0]); }
      else if (kind === 'lose') { o.abilities.delete(args[0]); }
      else if (kind === 'lose_all_abilities') { o.abilities.clear(); clr.add(o.id); }
      else if (kind === 'cda_swamps') { o.pt = [swampsOf(o.ctrl, w), swampsOf(o.ctrl, w)]; }
      else if (kind === 'set_pt') { o.pt = [Number(args[0]), Number(args[1])]; }
      else if (kind === 'mod_pt' && o.pt) {
        o.pt = [o.pt[0] + Number(args[0]), o.pt[1] + Number(args[1])];
      } else if (kind === 'switch_pt' && o.pt) { o.pt = [o.pt[1], o.pt[0]]; }
      else if (e.lordOf || e.anthemOf) {
        const s = w.get(e.lordOf ?? e.anthemOf!)!;
        const ab = [...s.abilities].find((a) => fnName(a) === (e.lordOf ? 'lord' : 'anthem'))!;
        const aa = fnArgs(ab);
        if (o.pt) o.pt = [o.pt[0] + Number(aa[1]), o.pt[1] + Number(aa[2])];
      }
    }
  };

  /** CR 613.8a, straight from the rule: clone the world, apply B, and see
   *  whether A's existence or A's target set moved. */
  const dependsOn = (a: OEff, bb: OEff, w: Map<string, OObj>): boolean => {
    if (a.id === bb.id) return false;
    if (a.cda !== bb.cda) return false;                       // clause (c)
    const w2 = new Map<string, OObj>();
    for (const [k, v] of w) {
      w2.set(k, { ...v, types: new Set(v.types), colors: new Set(v.colors),
        abilities: new Set(v.abilities), base: v.base ? [...v.base] as [number, number] : null,
        pt: v.pt ? [...v.pt] as [number, number] : null });
    }
    const clr2 = new Set(cleared);
    if (exists(bb, w2)) apply(bb, w2, clr2);
    const existedBefore = exists(a, w);
    const savedCleared = new Set(cleared);
    for (const c of clr2) cleared.add(c);
    const existsAfter = exists(a, w2);
    const t1 = [...targets(a, w)].sort().join(',');
    const t2 = [...targets(a, w2)].sort().join(',');
    cleared.clear();
    for (const c of savedCleared) cleared.add(c);
    return (existedBefore && !existsAfter) || t1 !== t2;
  };

  for (const layer of LAYERS) {
    if (layer === 71) {
      // layer 7a starts the power/toughness pass from the copiable values
      for (const o of objs.values()) o.pt = o.base ? [o.base[0], o.base[1]] : null;
    }
    const remaining = b.effs.filter((e) => e.layer === layer);
    const applied: string[] = [];
    while (remaining.length > 0) {
      let ready = remaining.filter((a) => !remaining.some((bb) => dependsOn(a, bb, objs)));
      // CR 613.8b, last sentence: a dependency loop falls back to timestamp
      if (ready.length === 0) ready = remaining.slice();
      ready.sort((x, y) => ts(x) - ts(y) || (x.id < y.id ? -1 : 1));
      const pick = ready[0];
      remaining.splice(remaining.indexOf(pick), 1);
      applied.push(pick.id);
      if (exists(pick, objs)) apply(pick, objs, cleared);
    }
    orders.set(layer, applied);
  }
  return { objs, orders };
}

/** The oracle's answer, in the same shape the rules produce. */
export function oracleDigest(b: Board, tsOverride?: Map<string, number>): string {
  const { objs } = simulate(b, tsOverride);
  const lines: string[] = [];
  for (const o of [...objs.values()].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    for (const t of [...o.types].sort()) lines.push(`ty4[main](${o.id},${t})`);
    for (const c of [...o.colors].sort()) lines.push(`co5[main](${o.id},${c})`);
    for (const a of [...o.abilities].sort()) lines.push(`ab6[main](${o.id},${a})`);
    lines.push(`ct2[main](${o.id},${o.ctrl})`);
    if (o.pt && o.types.has('creature')) lines.push(`pt[main](${o.id},${o.pt[0]},${o.pt[1]})`);
  }
  return lines.sort().join('\n');
}

export function kernelDigest(r: Rofl): string {
  return [...r.store.facts.values()]
    .filter((f) => ['ty4', 'co5', 'ab6', 'ct2', 'pt'].includes(f.rel))
    .map((f) => f.key).sort().join('\n');
}

export function oracleMatches(r: Rofl): boolean {
  const b = readBoard(r);
  return oracleDigest(b) === kernelDigest(r);
}

export interface OracleReport {
  compared: number; mismatches: string[];
  orderChecks: number; orderMismatches: string[];
  crExamples: { name: string; want: string; got: string; ok: boolean }[];
}

// ---------------------------------------------------------------------------
// main

function main(): void {
  const r = world();
  const out: string[] = [];
  const say = (s: string) => out.push(s);

  say('WTF -- What The Fixpoint');
  say('the Magic: the Gathering layer system (CR 613) as a stratified fixpoint');

  // ---- 1. the layer order, as evidence --------------------------------
  say(banner('1. the layer order: what the kernel derived, and what it did not'));
  say('');
  say('CR 613 has THREE ordering mechanisms and only the first is stratification.');
  say('Calling the other two strata would be a false claim about the kernel:');
  say('');
  say('  (1) the seven layers          candidate for strata -- measured below');
  say('  (2) timestamps inside a layer NOT strata. Stratification cannot order');
  say('                                anything INSIDE one level at all. `bef_ts`');
  say('                                is ordinary computation over integers.');
  say('  (3) dependency overriding (2) NOT strata. It is a conditional reordering');
  say('                                derived from the effects\' own semantics.');
  say('                                Its own relations are internally stratified,');
  say('                                which is a fact about how it is COMPUTED,');
  say('                                not about what it IS.');
  say('');
  say('And (1) is not free either. A kernel stratum is a level forced by NEGATION;');
  say('an MTG layer is an order the rulebook ASSERTS. They coincide only where');
  say('layer N\'s rules negate on layer N-1\'s RELATION. wtf.rofl discharges that');
  say('deliberately -- every boundary is written');
  say('');
  say('    lost_N(...) :- <layer N-1>(...), <it was replaced>.');
  say('    <layer N>   :- <layer N-1>(...), not lost_N(...).');
  say('');
  say('Two readings of the rule graph, as evidence. The ROUND a relation settles');
  say('in is its level; REACHABILITY in that same graph is the direction of the');
  say('dependency, which is forced even where no negation makes it a level. Both');
  say('are peeled off the decoded rules (src/rounds.ts). boot.rofl used to derive');
  say('them as `stratum/2` and `reach/2`, and those ten rules were deleted once');
  say('nothing read them: a program no longer has to describe itself to be run.');
  say('');
  const bs = boundaries(r);
  say('  ' + pad('layer', 14) + pad('below', 19) + pad('above', 12) + 'verdict');
  for (const b of bs) {
    const verdict = b.removalOverLo ? 'removes over the layer below'
      : b.removals.length > 0 ? `removes ${b.removals.join('/')} -- not the layer below`
        : 'FLAT -- nothing removed';
    say('  ' + pad(b.layer, 14) + pad(`${b.lo}=${b.loN}`, 19) + pad(`${b.hi}=${b.hiN}`, 12)
      + verdict
      + (b.oneWay ? '' : '   (and the dependency is NOT one-way -- that would be a defect)'));
  }
  const strong = bs.filter((b) => b.removalOverLo).length;
  const weak = bs.filter((b) => b.removals.length > 0 && !b.removalOverLo).length;
  say('');
  say(`  ${strong} of ${bs.length} boundaries remove something the layer below produced;`);
  say(`  ${weak} more remove the copy mark, which is about the OBJECT and not about`);
  say('  the layer below -- levels for the weaker reason, reported separately.');
  say(`  ${bs.filter((b) => b.forced).length} of ${bs.length} rose a level in the schedule, but a level gap is not the`);
  say('  test: under rounds every derived relation wakes after its base inputs.');
  say(`  all ${bs.filter((b) => b.oneWay).length} of ${bs.length} are one-way in the dependency graph:`);
  say('  the rule graph forces the direction everywhere, whether or not a');
  say('  negation turns it into a numbered level.');
  say('');
  say('  the flat ones, and why -- these are reported, not explained away:');
  for (const b of bs.filter((x) => x.removals.length === 0)) {
    say(`    ${pad(b.lo + ' -> ' + b.hi, 20)}${b.flatWhy}`);
  }
  say('');
  say('  A negation that does NOT range over the layer below is semantically');
  say('  identical and buys nothing. Measured on this program, layer 5, both ways:');
  const probe = boundaryProbe();
  say(`    co3 sits at stratum ${probe.co3}`);
  say(`    co5 :- co3, not lost5(O, C)   ->  stratum ${probe.strong}   (lost5 ranges over co3)`);
  say(`    co5 :- co3, not anyset5(O)    ->  stratum ${probe.weak}   (anyset5 is about EFFECTS)`);
  say(`    the two programs compute the same answers: ${probe.sameAnswers}`);
  say('  So the claim "the kernel derived the layer order" is worth exactly as');
  say('  much as the encoding that earns it, and no more.');
  say('');
  say('  where the dependency system sits -- note this is mechanism (3) being');
  say('  COMPUTED below the layer it reorders, not (3) being stratification:');
  say('    ' + ['dep_reason', 'edep4', 'eta4', 'bef4', 'live4', 'ty4']
    .map((rel) => `${rel}=${stratumOf(r, rel)}`).join('  <=  '));
  say('');
  const lv = (rel: string) => stratumOf(r, rel);
  say('  the plan the engine actually ran (the round each negating head woke in):');
  say(`    ct2 at ${lv('ct2')}, ty4 at ${lv('ty4')}, ab6 at ${lv('ab6')}, `
    + `pt7b at ${lv('pt7b')}, pt7d at ${lv('pt7d')}`);
  say('');
  say('  audits, all required empty:');
  for (const a of ['undefined_premise[audit](R, Rel)', 'unordered4(A, B)',
    'cyclic4(A, B)', 'intrans4(A, B, C)', 'kill_chain4(B)', 'unsound4(A)',
    'p5_dep(A, B)', 'p6_dep(A, B)', 'p72_dep(A, B)', 'ts_tie(A, B)']) {
    say(`    ${pad(a, 34)}${r.query(a).rows.length}`);
  }
  const ev = new Evaluation(r.store);
  say(`    ${pad('rules not range-restricted', 34)}${ev.rules.filter((x) => !x.safe).length}`);
  say(`    ${pad('demand-evaluated relations', 34)}${ev.demandRels.size}`);

  say('');
  say('  the two schedulers, on the deepest model in the corpus:');
  const stock = stockWorld();
  say(`    ${pad('same store, rounds vs stratum table', 40)}`
    + `${r.store.canonicalState() === stock.store.canonicalState()}`);
  say('  and with boot.rofl taken away, which is where they part:');
  for (const which of ['rounds', 'strata'] as const) {
    const b2 = bareWorld(which);
    say(`    ${pad(which, 40)}live4(e_urborg)=${b2.holds('live4(e_urborg)')}  `
      + `eta4(e_urborg,700)=${b2.holds('eta4(e_urborg, 700)')}  `
      + `stratum rows=${b2.query('stratum(Rel, N)').rows.length}`);
  }

  // ---- 2. why -------------------------------------------------------
  say(banner('2. why: the derivation of a permanent\'s characteristics'));
  for (const o of ['grizzly', 'clone1', 'nightmare', 'gray_ogre', 'oracle', 'mongrel',
    'forest1', 'urborg']) {
    say('');
    say(wtfReport(r, o));
  }

  // ---- 3. the disputed case -------------------------------------------
  say(banner('3. the disputed case: Blood Moon and Urborg, Tomb of Yawgmoth'));
  say('');
  say('The documented ruling (Felix Ramon M. Capule III, "Blood Moon, Progenitor');
  say('of Dependency", Judges of Southeast Asia, 24 January 2019):');
  say('');
  say('    "Hence no matter which order they enter the battlefield, we always');
  say('     apply Blood Moon first."');
  say('');
  say(dependencyReport(r));
  say('');
  say(sub('and the consequence, three layers up'));
  say('');
  const fs4 = tuples(r, 'ty4', 2).filter((t) => t[0] === 'forest1').map((t) => t[1]).sort();
  const fs4n = tuples(r, 'ty4n', 2).filter((t) => t[0] === 'forest1').map((t) => t[1]).sort();
  say(`  the basic Forest is        ${fs4.join(' ')}`);
  say(`  under timestamp order      ${fs4n.join(' ')}`);
  say(`  Swamps p1 controls         ${one(r, 'swamps(p1, N)', 'N')}`
    + `   (timestamp order: ${one(r, 'swamps_n(p1, N)', 'N')})`);
  const nm = r.query('pt(nightmare, P, T)').rows[0];
  say(`  Nightmare's p/t is a CDA reading that count in layer 7a: `
    + `${nm.bindings.P}/${nm.bindings.T}`);
  say('');
  say(sub('why the order was what it was -- the kernel\'s own tree'));
  say('');
  say(r.why('bef4(e_bloodmoon, e_urborg)').text);
  say('');
  say(sub('and the question the other way round'));
  say('');
  say(r.whynot('ty4(forest1, swamp)', { depth: 2, nodes: 24 }).text);

  // ---- 4. whynot ------------------------------------------------------
  say(banner('4. whynot: why is Grizzly Bears not 4/4'));
  say('');
  say(whynotFourFour(r));
  say('');
  const cf = counterfactual();
  say(`  making that change and re-running: ${cf.before} -> ${cf.after}`);
  say('');
  say(sub('the kernel\'s own demonstration'));
  say('');
  say(r.whynot('mod73(grizzly, e_honor, 1, 1)', { depth: 3, nodes: 30 }).text);

  // ---- 5. provenance --------------------------------------------------
  say(banner('5. which permanents jointly determine that 3/3'));
  say('');
  const prov = evaluateSemiring(r.store, provenanceSemiring, { base: provenanceOf });
  const poly = prov.value.get('pt[main](grizzly,3,3)') as Polynomial | undefined;
  say(`  discipline held: ${prov.disciplineHeld}   facts on a support cycle: ${prov.cyclic}`);
  if (poly) {
    say(`  minimal source sets: ${poly.length}, the smallest with ${poly[0].length} base facts.`);
    say('  the ones that name a permanent or an effect:');
    for (const k of poly[0].filter((x) => /^(eff_|sel|does|printed_|on_bf)/.test(x)).sort()) {
      say(`    ${k}`);
    }
    const book = poly[0].filter((x) => /^(eord|nmod)/.test(x));
    say('');
    say(`  and ${book.length} bookkeeping facts (eord/nmod). Those are honest: v0 has no`);
    say('  aggregation, so layer 7c\'s sum is a fold that walks every slot of a');
    say('  declared enumeration, and a slot it walked past really is part of the');
    say('  derivation. The size of a provenance term is a property of how the');
    say('  question had to be asked, not only of the answer.');
  }

  // ---- 6. counting ----------------------------------------------------
  say(banner('6. counting: how many application orders give the same answer'));
  say('');
  say(`  lean world agrees with the full world fact for fact: ${leanAgrees()}`);
  say('');
  say('  ' + pad('sublayer', 40) + pad('effects', 9) + pad('orders', 8)
    + pad('outcomes', 10) + 'verdict');
  const { sweeps, oracle: rep } = runSweeps();
  for (const s of sweeps) {
    say('  ' + pad(layerLabel(r, s.layer) + (s.scope ? ` [${s.scope}]` : ''), 40)
      + pad(String(s.effects.length), 9) + pad(String(s.orders), 8)
      + pad(String(s.outcomes), 10) + s.verdict);
  }
  const l4 = sweeps.find((s) => s.layer === 40)!;
  say('');
  say(`  layer 4 under the SAME ${l4.orders} orders, read off the timestamp-only`);
  say(`  pipeline in section 12 of wtf.rofl: ${l4.naiveOutcomes} distinct outcomes.`);
  say('');
  say('  So the dependency rule is not decoration. Layer 4 is the sublayer whose');
  say('  answer would turn on which land entered first; CR 613.8 is what makes it');
  say('  one answer instead of many, and the sweep is what shows that rather than');
  say('  asserting it. The sublayers that still come back ORDER-DEPENDENT are the');
  say('  ones where the rules really do let the timestamp decide -- which is where');
  say('  a judge gets asked which permanent hit the table first.');

  // ---- 7. state-based actions -----------------------------------------
  say(banner('7. state-based actions: the fixpoint above the layer system'));
  say('');
  say('  Two removal spells resolve. CR 704.5f puts a creature with toughness');
  say('  0 or less into its graveyard, which removes the effects its abilities');
  say('  generated, which re-runs every layer, which can kill something else.');
  say('');
  const { rounds } = sbaFixpoint();
  for (const rd of rounds) {
    say(`  round ${rd.round}:`);
    for (const s of rd.sizes) say(`    ${s}`);
    say(`    lethal (CR 704.5f): ${rd.died.join(', ') || '(none) -- quiescent'}`);
  }
  say('');
  say(`  the outer fixpoint took ${rounds.length} rounds; a single pass would have`);
  say('  stopped after the first and reported the wrong board.');

  // ---- 8. the oracle --------------------------------------------------
  say(banner('8. the oracle'));
  say('');
  say('  (a) An independent implementation of CR 613 in plain TypeScript');
  say('      (simulate() in this file): the obvious sequential layer walk, with');
  say('      613.8a\'s dependency test done by cloning the board, applying the');
  say('      other effect, and comparing -- and target sets re-evaluated at the');
  say('      moment each effect is applied, which is STRICTER than the rules in');
  say('      wtf.rofl, where they are read off the previous layer.');
  say('');
  say(`      boards compared (base + every sweep permutation): ${rep.compared}`);
  say(`      disagreements:                                    ${rep.mismatches.length}`);
  say(`      layer 4 ORDERS compared:                          ${rep.orderChecks}`);
  say(`      order disagreements:                              ${rep.orderMismatches.length}`);
  for (const m of rep.mismatches.slice(0, 5)) say(`        ${m}`);
  for (const m of rep.orderMismatches.slice(0, 5)) say(`        ${m}`);
  say('');
  say('  (b) The Comprehensive Rules\' own worked examples, which state their');
  say('      answers, reproduced on this battlefield:');
  say('');
  for (const c of rep.crExamples) {
    say(`      ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}`);
    say(`           rules say ${c.want}; wtf.rofl computes ${c.got}`);
  }
  say('');
  say('  (c) The documented judge ruling in section 3.');
  say('');
  say('  NOT run: an actual rules engine. Java is present on this machine, but');
  say('  Forge and XMage are interactive game clients with no scriptable');
  say('  "evaluate this board" entry point; constructing a game to read layer');
  say('  results out of one was out of scope here. Said plainly rather than');
  say('  implied.');

  console.log(out.join('\n'));
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1] &&
  real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();
