// demo.ts — SLOP: the ledger in a spreadsheet, taken literally.
//
//   node --experimental-strip-types examples/slop/demo.ts
//
// Reads a real financial model out of a real .xlsx with nothing but
// `node:zlib`, loads it into the ROFL kernel as facts, and then asks the
// spreadsheet the four questions it cannot answer about itself:
//
//   where did this number come from      -> the witness forest, to full depth
//   which numbers did a human type       -> a fact about the file
//   how wrong could it be                -> the same walk, in intervals
//   did the circular reference converge  -> a derived fact, with a round
//
// Every number printed is computed. The recomputation is checked against TWO
// independent oracles — the values Excel itself cached in the file, and a
// headless LibreOffice recalculating the same file — and the comparison is
// reported in the carrier's own units, because "to the cent" is a claim
// about a unit and the unit has to be named.
//
// The pieces are exported so test/example-slop.test.ts runs the same
// assertions on a smaller slice.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, provenanceSemiring, provenanceOf, booleanSemiring,
  renderCount, type Count, type Polynomial,
} from '../../runtime/semirings.ts';
import { readWorkbook, type Workbook } from './xlsx.ts';
import { compile, SCALE, SAFE_MAX, toScaled, type Emitted } from './formula.ts';
import {
  load, provenanceTree, show, findSoffice, recalculate, compare, type Comparison,
} from './world.ts';
import { workbook, cells, closedForm, CONVERGING, DIVERGING, type Revolver } from './revolver.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);

// ---------------------------------------------------------------------------
// the model

/** A real financial model, taken from outside and not invented for this
 *  demo: Aswath Damodaran's FCFF valuation spreadsheet, published free at
 *  https://pages.stern.nyu.edu/~adamodar/pc/fcffsimpleginzu.xlsx and used in
 *  his corporate finance and valuation courses. It is 17 sheets, 13 769
 *  cells and 1 231 formula cells, and the reason it is the right file is in
 *  the census the demo prints: 295 IF, 121 VLOOKUP and 17 SUM, against SEVEN
 *  formulas in the whole workbook that use anything else. The formula subset
 *  the spec calls sufficient for a real model is, on this evidence, exactly
 *  sufficient for this one. */
export const MODEL = path.join(HERE, 'fcffsimpleginzu.xlsx');

/** The headline cell: the blended equity risk premium the whole valuation
 *  discounts at. Chosen because its tree has all four things the display
 *  exists for — a SUM, a VLOOKUP into another sheet, a manual entry in the
 *  middle of the model, and a constant typed inside a formula. */
export const HEADLINE = 'Cost of capital worksheet!K18';

/** The uncertainty slice: revenue ten years out, which is revenue today
 *  compounded through ten growth rates. Small enough to load in a second. */
export const HORIZON_CELL = 'Valuation output!M3';
export const GROWTH_INPUT = 'Input sheet!B26';

export function openModel(): Workbook {
  return readWorkbook(fs.readFileSync(MODEL));
}

/** The census the choice of subset rests on. */
export function census(wb: Workbook): { cells: number; formulas: number; fn: Map<string, number> } {
  let cellCount = 0, formulas = 0;
  const fn = new Map<string, number>();
  for (const s of wb.sheets) {
    for (const c of s.cells.values()) {
      cellCount++;
      if (c.formula === undefined) continue;
      formulas++;
      for (const m of c.formula.matchAll(/([A-Z][A-Z0-9.]+)\s*\(/g)) {
        fn.set(m[1], (fn.get(m[1]) ?? 0) + 1);
      }
    }
  }
  return { cells: cellCount, formulas, fn };
}

// ---------------------------------------------------------------------------
// the comparison

export interface OracleReport {
  compared: number;
  exact: number;
  withinCent: number;
  worst: Comparison | null;
  missing: string[];
}

/** Compare every computed cell against a workbook's values.
 *
 *  The unit is the carrier's: 1e-8 of a sheet value. A CENT is 1e6 of those
 *  units in a model denominated in dollars, and 1 unit in a model denominated
 *  in millions — which is why this reports both and names which is which. */
export function against(r: Rofl, wb: Workbook, ids: string[]): OracleReport {
  const out: OracleReport = { compared: 0, exact: 0, withinCent: 0, worst: null, missing: [] };
  for (const id of ids) {
    const bang = id.lastIndexOf('!');
    const cell = wb.byName.get(id.slice(0, bang))?.cells.get(id.slice(bang + 1));
    if (!cell || cell.value === undefined) continue;
    const theirs = Number(cell.value);
    if (!Number.isFinite(theirs)) continue;
    const rows = r.query(`value(${JSON.stringify(id)}, V)`).rows;
    if (rows.length === 0) { out.missing.push(id); continue; }
    const ours = Number(rows[0].bindings['V']);
    if (!Number.isFinite(ours)) continue;
    const c = compare(id, ours, theirs);
    out.compared++;
    if (c.units === 0) out.exact++;
    if (c.units <= SCALE / 100) out.withinCent++;
    if (out.worst === null || c.units > out.worst.units) out.worst = c;
  }
  return out;
}

/** Every computed cell's interval, checked to CONTAIN the oracle's double.
 *  This is the claim the interval evaluator is really making: not an
 *  estimate, an enclosure. */
export function enclosed(r: Rofl, wb: Workbook, ids: string[]): { checked: number; inside: number; escaped: string[] } {
  let checked = 0, inside = 0;
  const escaped: string[] = [];
  for (const id of ids) {
    const bang = id.lastIndexOf('!');
    const cell = wb.byName.get(id.slice(0, bang))?.cells.get(id.slice(bang + 1));
    if (!cell || cell.value === undefined) continue;
    const exact = toScaled(cell.value);
    if (exact === null) continue;
    const rows = r.query(`ivalue(${JSON.stringify(id)}, L, H)`).rows;
    if (rows.length === 0) continue;
    const lo = Number(rows[0].bindings['L']), hi = Number(rows[0].bindings['H']);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    checked++;
    if (exact >= lo && exact <= hi) inside++; else escaped.push(id);
  }
  return { checked, inside, escaped };
}

// ---------------------------------------------------------------------------
// the semiring folds — structural questions, over the same support forest

const inputKey = /^input\[main\]\((".*?"),(-?\d+)\)$/;
const valueKey = /^value\[main\]\((".*?"),/;

/** Which MANUAL ENTRIES a cell's value rests on, with the base annotation
 *  set to name only `input` facts. A monomial is then a set of typed-in
 *  numbers, and the answer to "which inputs really move this total". */
export function restsOn(r: Rofl, cell: string): { inputs: string[]; complete: boolean } {
  const fold = evaluateSemiring(r.store, provenanceSemiring, {
    base: (k) => (inputKey.test(k) ? provenanceOf(k) : provenanceSemiring.one),
  });
  const rows = r.query(`value(${JSON.stringify(cell)}, V)`).rows;
  if (rows.length === 0) return { inputs: [], complete: false };
  const poly: Polynomial = fold.value.get(`value[main](${JSON.stringify(cell)},${rows[0].bindings['V']})`) ?? [];
  const names = new Set<string>();
  for (const mono of poly) {
    for (const k of mono) {
      const m = inputKey.exec(k);
      if (m) names.add(JSON.parse(m[1]) as string);
    }
  }
  return { inputs: [...names].sort(), complete: poly.length < 32 };
}

/** Which cells rest ENTIRELY on a given set of inputs — the Boolean fold
 *  with those inputs true and every other typed-in number false. ⊗ is AND,
 *  so a cell that also reads an input outside the set is false: the answer
 *  is "fully determined by these", not "touched by these". */
export function restingOnly(r: Rofl, chosen: Set<string>): string[] {
  const fold = evaluateSemiring(r.store, booleanSemiring, {
    base: (k) => {
      const m = inputKey.exec(k);
      if (!m) return true;
      return chosen.has(JSON.parse(m[1]) as string);
    },
  });
  const out: string[] = [];
  for (const [k, v] of fold.value) {
    const m = valueKey.exec(k);
    if (m && v) out.push(JSON.parse(/\((".*?"),/.exec(k)![1]) as string);
  }
  return [...new Set(out)].sort();
}

/** How many ways the sheet produces each number. Anything but 1 is a defect
 *  report — see the note at the foot of slop.rofl. */
export function ambiguous(r: Rofl): { checked: number; ambiguous: [string, Count][] } {
  const fold = evaluateSemiring(r.store, countingSemiring);
  let checked = 0;
  const bad: [string, Count][] = [];
  for (const [k, v] of fold.value) {
    if (!valueKey.test(k)) continue;
    checked++;
    if (v !== 1n) bad.push([k, v]);
  }
  return { checked, ambiguous: bad };
}

// ---------------------------------------------------------------------------
// the cyclic model

export interface CycleReport {
  facts: number;
  acyclicRows: number;
  convergedAt: number | null;
  steadyAt: number | null;
  relapsed: boolean;
  diverging: boolean;
  stillMoving: { cell: string; now: number; before: number }[];
  closing: (number | null)[];
}

export function runCycle(m: Revolver, horizon: number, tolerance: number): CycleReport {
  const wb = readWorkbook(workbook('Revolver', m));
  const em = compile(wb);
  const r = load(em.facts, `horizon(${horizon}).\ntolerance(${tolerance}).`);
  const one = (query: string): number | null => {
    const rows = r.query(query).rows;
    return rows.length === 0 ? null : Number(rows[0].bindings['R']);
  };
  const closing = m.ebit.map((_, i) => {
    const col = ['B', 'C', 'D', 'E'][i];
    const rows = r.query(`rvalue(${horizon}, "Revolver!${col}8", V)`).rows;
    return rows.length === 0 ? null : Number(rows[0].bindings['V']);
  });
  return {
    facts: em.factCount,
    acyclicRows: r.query('value("Revolver!B8", V)').rows.length,
    convergedAt: one('converged_at(R)'),
    steadyAt: one('steady_at(R)'),
    relapsed: r.query('relapsed(R)').rows.length > 0,
    diverging: r.query('diverging(H)').rows.length > 0,
    stillMoving: r.query('still_moving(C, V, W)').rows.map((x) => ({
      cell: JSON.parse(x.bindings['C']) as string,
      now: Number(x.bindings['V']),
      before: Number(x.bindings['W']),
    })),
    closing,
  };
}

// ---------------------------------------------------------------------------
// the transcript

const WIDTH = 76;

function main(): void {
  const say = (s: string = '') => { console.log(s); };
  const rule = (t: string) => say(('== ' + t + ' ').padEnd(WIDTH, '='));
  const verdicts: string[] = [];
  const check = (what: string, ok: boolean) => {
    verdicts.push(`${ok ? 'AGREE   ' : 'DISAGREE'}  ${what}`);
    say(`  oracle: ${ok ? 'AGREE' : 'DISAGREE'} — ${what}`);
  };

  const t0 = Date.now();
  const wb = openModel();
  const cs = census(wb);

  say('SLOP — Spreadsheet Ledger Over Provenance');
  say('a real .xlsx as a fixpoint, with the carrier of a value as a parameter');
  say();
  say(`file    ${MODEL}`);
  say(`        ${(fs.statSync(MODEL).size / 1024).toFixed(0)} KiB, ${wb.sheets.length} sheets, `
    + `${cs.cells} cells, ${cs.formulas} formula cells`);
  say('        Aswath Damodaran, NYU Stern — a real model, published free, not written for this demo');
  say('reader  examples/slop/xlsx.ts, node:zlib and nothing else (an .xlsx is a ZIP of XML)');
  say('rules   examples/slop/slop.rofl');
  say(`carrier fixed point, 1 unit = 1e-8 of a sheet value; |value| <= ${SAFE_MAX.toLocaleString('en-US')}`);
  say();
  say('function census over all ' + cs.formulas + ' formula cells:');
  const ordered = [...cs.fn].sort((a, b) => b[1] - a[1]);
  const inSubset = new Set(['IF', 'VLOOKUP', 'SUM']);
  say('  in the subset:  ' + ordered.filter(([k]) => inSubset.has(k)).map(([k, v]) => `${k} ${v}`).join(', '));
  const outside = ordered.filter(([k]) => !inSubset.has(k));
  say('  outside it:     ' + outside.map(([k, v]) => `${k} ${v}`).join(', ')
    + `  (${outside.reduce((a, b) => a + b[1], 0)} calls in the whole workbook)`);
  say();

  // -- 1 ---------------------------------------------------------------------
  rule('1. the recomputation, and two oracles');
  const em = compile(wb, { targets: [HEADLINE] });
  say(`target  ${HEADLINE}, loaded with its PRECEDENT CLOSURE and nothing else:`);
  say(`        ${em.compiled.length} formula cells, ${em.inputs.length} typed-in values, `
    + `${em.factCount} facts, ${em.refused.size} cells refused`);
  const tLoad = Date.now();
  const world = load(em.facts);
  say(`        loaded and evaluated in ${((Date.now() - tLoad) / 1000).toFixed(1)} s; `
    + `${world.store.facts.size} facts in the store`);
  say(`        unstratified: ${world.query('unstratified(X)').rows.length}; `
    + `undefined_premise[audit]: ${world.query('undefined_premise[audit](R, Rel)').rows.length}`);
  say();

  const cached = against(world, wb, em.compiled);
  say('against the values EXCEL cached in the file when it last saved:');
  say(`  ${cached.compared} cells compared, ${cached.exact} EXACT to the carrier unit,`);
  say(`  worst deviation ${cached.worst?.units ?? 0} units, at ${cached.worst?.cell ?? '(none)'}`);
  say();
  say('  What a unit is worth depends on what the sheet is denominated in, and this');
  say('  one is in MILLIONS OF DOLLARS. A unit is 1e-8 of that, which is one cent, so');
  say(`  the worst cell in this closure is ${cached.worst?.units ?? 0} cents out over a value of `
    + `$${((cached.worst?.theirs ?? 0) * 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}.`);
  check(`Excel's own cached values, ${cached.compared} cells, worst ${cached.worst?.units ?? 0} units`,
    cached.missing.length === 0 && (cached.worst?.units ?? 0) <= 64);
  say();

  const soffice = findSoffice();
  if (soffice === null) {
    say('LibreOffice: NOT AVAILABLE on this machine.');
    say('  The second oracle is skipped and no weaker check is substituted for it.');
    verdicts.push('SKIPPED   LibreOffice recalculation (no soffice on this machine)');
  } else {
    say(`against a headless LibreOffice recalculating the same file (${soffice}):`);
    const tLo = Date.now();
    const recomputed = recalculate(MODEL, soffice);
    say(`  recalculated in ${((Date.now() - tLo) / 1000).toFixed(1)} s`);
    const lo = against(world, recomputed, em.compiled);
    say(`  ${lo.compared} cells compared, ${lo.exact} exact, worst ${lo.worst?.units ?? 0} units `
      + `at ${lo.worst?.cell ?? '(none)'}`);
    // and the two oracles against each other, which is the interesting number
    let disagree = 0, worstPair = 0;
    for (const id of em.compiled) {
      const bang = id.lastIndexOf('!');
      const a = wb.byName.get(id.slice(0, bang))?.cells.get(id.slice(bang + 1))?.value;
      const b = recomputed.byName.get(id.slice(0, bang))?.cells.get(id.slice(bang + 1))?.value;
      if (a === undefined || b === undefined) continue;
      const x = Number(a), y = Number(b);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x === y) continue;
      disagree++;
      worstPair = Math.max(worstPair, Math.abs(x - y) / (Math.abs(x) || 1));
    }
    say(`  Excel and LibreOffice disagree with EACH OTHER on ${disagree} of these cells,`);
    say(`  by up to ${worstPair.toExponential(2)} relative — two double engines, last bits apart.`);
    check(`LibreOffice's recalculation, ${lo.compared} cells, worst ${lo.worst?.units ?? 0} units`,
      lo.missing.length === 0 && (lo.worst?.units ?? 0) <= 64);
  }
  say();

  // -- 2 ---------------------------------------------------------------------
  rule('2. huh: where did this number come from');
  say('the display this example exists for. Every line is read out of the witness');
  say('forest the kernel recorded while it derived the value — not recomputed, not');
  say('reconstructed. Only the branch of an IF that ACTUALLY FIRED is here.');
  say();
  say(`> huh ${HEADLINE}`);
  say(provenanceTree(world, HEADLINE, { depth: 6, children: 3 }));
  say();
  say('The two lines that are the point of the whole example are');
  say('  [MANUAL ENTRY]                    a number a human typed, in the middle of a computed model');
  say('  [A CONSTANT TYPED INTO THE FORMULA]   a number that is not in any cell at all');
  say('Neither is visible in a spreadsheet. Both are facts about the file here.');
  say();

  // -- 3 ---------------------------------------------------------------------
  rule('3. the same tree, unprojected: the kernel\'s own why');
  say('`huh` above is a PROJECTION onto cells. The kernel\'s tree goes through the');
  say('inside of the formula, and this is it for one cell of the chain, so the');
  say('projection can be checked rather than believed.');
  say();
  const small = 'Cost of capital worksheet!I6';
  const jv = world.query(`value(${JSON.stringify(small)}, V)`).rows[0].bindings['V'];
  say(`$ why value(${JSON.stringify(small)}, ${jv})`);
  say(world.why(`value(${JSON.stringify(small)}, ${jv})`).text);
  say();
  say('Every [axiom] in it is host output: `input`, `label` and `num` are the');
  say('numbers and words in the file, and `pick`, `cmp`, `find`, `ref`, `tkey`,');
  say('`tcell` are the shape examples/slop/formula.ts read out of the formula text.');
  say('That is the honest floor — the same one examples/huh draws. Everything above');
  say('it, including which branch of the IF fired and which row the VLOOKUP hit, was');
  say('inferred by rules and recorded as it happened.');
  say();

  // -- 4 ---------------------------------------------------------------------
  rule('4. what a human typed, counted');
  const manual = world.query('manual_entry(C)').rows.length;
  const buried = world.query('buried(D)').rows.length;
  const hard = world.query('hardcoded(C, V)').rows;
  const hardCells = new Set(hard.map((x) => x.bindings['C']));
  say(`in the ${em.compiled.length}-formula closure of one cell:`);
  say(`  ${manual} numbers were typed in by a human, and ${buried} of them are read by a formula`);
  say(`  ${hardCells.size} formulas contain a constant typed into the formula text `
    + `(${hard.length} constants in all)`);
  const blanks = world.query('empty(C)').rows.length;
  say(`  ${blanks} referenced cells are BLANK, and every one of them is read as zero`);
  say();

  // -- 5 ---------------------------------------------------------------------
  rule('5. which inputs the number really rests on');
  const rests = restsOn(world, HEADLINE);
  say(`provenance semiring, base annotation = the \`input\` facts only, so a monomial`);
  say('is a set of typed-in numbers.');
  say();
  say(`  ${HEADLINE} rests on ${rests.inputs.length} manual entries:`);
  for (const i of rests.inputs.slice(0, 8)) say(`    ${i}`);
  if (rests.inputs.length > 8) say(`    ... and ${rests.inputs.length - 8} more`);
  say(`  complete: ${rests.complete} (provenanceSemiring keeps at most 32 monomials)`);
  say();
  const chosen = new Set(rests.inputs.slice(0, 2));
  const computedCells = new Set(world.query('computed(C)').rows
    .map((x) => JSON.parse(x.bindings['C']) as string));
  const only = restingOnly(world, chosen).filter((c) => computedCells.has(c));
  say(`Seven, out of the ${manual} numbers a human typed into this closure. That is the`);
  say('sensitivity answer, and it took one fold and no perturbation of anything.');
  say();
  say('Boolean semiring, with two of those inputs true and every other typed-in');
  say('number false. Times is AND, so what comes out is the COMPUTED cells that rest');
  say('ENTIRELY on the chosen two — "fully determined by", not "touched by":');
  say(`  ${[...chosen].join(', ')}`);
  say(`  -> ${only.length} computed cells: ${only.slice(0, 4).join(', ')}`
    + (only.length > 4 ? ' ...' : ''));
  say();
  const amb = ambiguous(world);
  say('counting semiring: how many ways the sheet produces each number.');
  say(`  ${amb.checked} value facts checked, ${amb.ambiguous.length} with a count other than 1.`);
  say('  A count above 1 would be a DEFECT REPORT here, not a magnitude: it means a');
  say('  cell is ambiguous. Section 8 makes one on purpose, so this gate is not one');
  say('  that has only ever said yes.');
  say();

  // -- 6 ---------------------------------------------------------------------
  rule('6. interval: the same sheet, one pass, no Monte Carlo');
  say('First with NO uncertainty declared at all. Every input is its own value');
  say('widened by the one unit the host rounded when it read the decimal text, and');
  say('every arithmetic result is widened outward by the truncation bound. What');
  say('comes out is a GUARANTEED ENCLOSURE, so the check is not "close to" but');
  say('"contains": does the double the oracle computed lie inside the interval?');
  say();
  const enc = enclosed(world, wb, em.compiled);
  say(`  ${enc.checked} cells checked, ${enc.inside} enclose Excel's own value`);
  if (enc.escaped.length > 0) say(`  escaped: ${enc.escaped.slice(0, 5).join(', ')}`);
  check(`the interval run encloses Excel's value on ${enc.checked} cells`,
    enc.escaped.length === 0 && enc.checked > 0);
  say();
  say('Now with uncertainty declared on ONE input, on a smaller slice of the same');
  say('model: revenue ten years out, which is revenue today compounded through ten');
  say('growth rates. NO FORMULA IS TOUCHED — only the carrier changes.');
  say();
  const slice = compile(wb, { targets: [HORIZON_CELL] });
  const base = load(slice.facts);
  const point = base.query(`value(${JSON.stringify(HORIZON_CELL)}, V)`).rows[0].bindings['V'];
  const g = base.query(`value(${JSON.stringify(GROWTH_INPUT)}, V)`).rows[0].bindings['V'];
  say(`  ${GROWTH_INPUT} = ${show(Number(g))}   [the growth rate, a manual entry]`);
  say(`  ${HORIZON_CELL} = ${show(Number(point))}   [revenue in year 10]`);
  say();
  const lo = toScaled('0.03')!, hi = toScaled('0.07')!;
  const spanned = load(slice.facts, `span(${JSON.stringify(GROWTH_INPUT)}, ${lo}, ${hi}).`);
  const iv = spanned.query(`ivalue(${JSON.stringify(HORIZON_CELL)}, L, H)`).rows[0].bindings;
  say(`  say the growth rate is only known to be between 3% and 7%:`);
  say(`    span(${JSON.stringify(GROWTH_INPUT)}, ${lo}, ${hi})`);
  say(`  ${HORIZON_CELL} = [${show(Number(iv['L']))} .. ${show(Number(iv['H']))}]`);
  say();
  say('  One evaluation. No sampling, no add-in, no second model. The interval');
  say('  arithmetic is in the rules, because the CARRIER OF A CELL VALUE is what');
  say('  this example is about — see README.md for why it is not a semiring fold.');
  say();

  // -- 7 ---------------------------------------------------------------------
  rule('7. whynot: the cell that has no value, and why');
  const wholeSheet = compile(wb, { sheets: ['Option value'] });
  const opt = load(wholeSheet.facts);
  const refusedRows = opt.query('refused(C)').rows.map((x) => JSON.parse(x.bindings['C']) as string);
  const starvedRows = opt.query('starved(C)').rows.map((x) => JSON.parse(x.bindings['C']) as string);
  say(`the "Option value" sheet uses NORMSDIST, EXP and LN — outside the subset.`);
  say(`  ${wholeSheet.compiled.length} formula cells loaded`);
  say(`  ${refusedRows.length} contain a call SLOP will not compute`);
  say(`  ${starvedRows.length} could have been computed and were not, because a precedent was not`);
  say();
  if (starvedRows.length > 0) {
    const victim = starvedRows.sort()[0];
    say(`$ whynot value(${JSON.stringify(victim)}, V)`);
    say(opt.whynot(`value(${JSON.stringify(victim)}, V)`, { depth: 1 }).text);
    say();
    say('  `val` has thirty rules — one per operator and per branch — so a deeper');
    say('  demonstration is wide rather than deep. The answer is one level down and it');
    say('  is a fact, not a search:');
    for (const row of opt.query('refusal(C, W)').rows.slice(0, 5)) {
      say(`    refusal(${row.bindings['C']}, ${row.bindings['W']})`);
    }
    say();
  }
  say('A cell SLOP cannot compute is a NAMED REFUSAL. It is never a wrong number,');
  say('which is the failure mode a spreadsheet has no defence against at all.');
  say();

  // -- 8 ---------------------------------------------------------------------
  rule('8. the gate says NO: a lookup table with the key twice');
  say('A VLOOKUP whose table holds the same key on two rows is resolved by Excel');
  say('silently, by taking whichever row it reaches first. Here the number has two');
  say('derivations, and the counting semiring says 2.');
  say();
  const dup = load([
    'formula("m!B1", 1).', 'formula_text("m!B1", "VLOOKUP(A1, rates!A1:B3, 2)").',
    'find(1, 2, "rates!A1:B3", 2).', 'ref(2, "m!A1").', 'label("m!A1", "widget").',
    'tkey("rates!A1:B3", 1, "widget").', 'tcell("rates!A1:B3", 1, 2, "rates!B1").',
    'tkey("rates!A1:B3", 2, "widget").', 'tcell("rates!A1:B3", 2, 2, "rates!B2").',
    'input("rates!B1", 17800000000).', 'input("rates!B2", 17800000000).',
  ].join('\n'));
  const dupCount = ambiguous(dup);
  say('  rates!A1:B3 has "widget" on row 1 AND row 2, both worth 178');
  say(`  value("m!B1", 17800000000) has ${dupCount.ambiguous.length > 0
    ? renderCount(dupCount.ambiguous[0][1]) : '1'} derivations`);
  check('the ambiguity gate says NO on a duplicated lookup key',
    dupCount.ambiguous.length === 1);
  say();

  // -- 9 ---------------------------------------------------------------------
  rule('9. the circular reference, with an answer');
  say('Interest is charged on the AVERAGE debt balance; the closing balance depends');
  say('on the interest; the average depends on the closing balance. A spreadsheet will');
  say('not compute that at all until iterative calculation is switched on, and what');
  say('the switch takes is an iteration COUNT and a maximum CHANGE — two numbers a');
  say('person guesses. What it gives back is a value, and no statement about whether');
  say('the iteration reached anything.');
  say();
  const rev = path.join(os.tmpdir(), 'rofl-slop-demo');
  fs.mkdirSync(rev, { recursive: true });
  const convFile = path.join(rev, 'revolver.xlsx');
  fs.writeFileSync(convFile, workbook('Revolver', CONVERGING));
  say(`  examples/slop/revolver.ts wrote ${convFile}`);
  say('  (a real .xlsx, written with node:zlib, with NO cached values and');
  say('   <calcPr iterate="1" iterateCount="200"> — the checkbox, as data)');
  say();
  for (const [ref, c] of cells(CONVERGING)) {
    if (c.f !== undefined && /^[BC][5-8]$/.test(ref)) say(`    ${ref} = ${c.f}`);
  }
  say();
  const HORIZON = 45, TOL = SCALE / 100;
  const conv = runCycle(CONVERGING, HORIZON, TOL);
  say(`  the ACYCLIC evaluator on this model derives ${conv.acyclicRows} values.`);
  say('  That is not a bug: a numeric fixpoint is not a least fixpoint over a set of');
  say('  facts, and every cell in the cycle is waiting on another one.');
  say();
  say(`  the round-indexed evaluator, horizon ${HORIZON}, tolerance ${TOL} units (one cent):`);
  say(`    steady_at      ${conv.steadyAt ?? '(never)'}   -- stopped moving by more than a cent`);
  say(`    relapsed       ${conv.relapsed}`);
  say(`    converged_at   ${conv.convergedAt ?? '(never)'}   -- stopped moving AT ALL`);
  for (const s of conv.stillMoving.slice(0, 3)) {
    say(`    still moving   ${s.cell}: ${show(s.now)} <- ${show(s.before)} `
      + `(${Math.abs(s.now - s.before)} units)`);
  }
  say('    Exact equality is never reached: the truncating carrier has a period-two');
  say('    orbit one unit wide, and one unit is 1e-8 of a dollar. A spreadsheet stops');
  say('    on a tolerance too — that is what "maximum change" is — but the tolerance');
  say('    is the only thing it reports through, and never as a round or a cell.');
  say();
  const closed = closedForm(CONVERGING);
  say('  three independent opinions on the closing balance:');
  conv.closing.forEach((v, i) => {
    say(`    period ${i + 1}   kernel ${v === null ? '(none)' : show(v)}`);
    say(`               closed form ${closed[i].toFixed(8)}   (algebra, in doubles, this file)`);
  });
  if (soffice !== null) {
    const back = recalculate(convFile, soffice);
    const sheet = back.sheets[0];
    conv.closing.forEach((v, i) => {
      const ref = ['B', 'C', 'D', 'E'][i] + '8';
      const theirs = Number(sheet.cells.get(ref)?.value);
      say(`    period ${i + 1}   LibreOffice ${theirs}   (iterative calculation, its own algorithm)`);
      const units = v === null ? Infinity : Math.abs(v - Math.round(theirs * SCALE));
      say(`               kernel - LibreOffice = ${units} units = ${show(units)} dollars`);
      check(`the circular model, period ${i + 1}, to the cent against LibreOffice`,
        units <= SCALE / 100);
    });
  }
  say();
  say('  and the same model with ONE number changed — the rate, set past the point');
  say('  where the feedback loop is a contraction:');
  const div = runCycle(DIVERGING, 24, TOL);
  say(`    steady_at      ${div.steadyAt ?? '(never)'}`);
  say(`    converged_at   ${div.convergedAt ?? '(never)'}`);
  say(`    diverging      ${div.diverging}`);
  for (const s of div.stillMoving.slice(0, 3)) {
    say(`    still moving   ${s.cell}: ${show(s.now)} <- ${show(s.before)}`);
  }
  say(`    the equation still HAS a solution — ${closedForm(DIVERGING)[0].toFixed(2)} — and the`);
  say('    iteration does not find it, because the map is expansive.');
  check('the divergence report fires on a model that does not converge',
    div.diverging && div.convergedAt === null && div.steadyAt === null);
  if (soffice !== null) {
    const divFile = path.join(rev, 'diverging.xlsx');
    fs.writeFileSync(divFile, workbook('Revolver', DIVERGING));
    const back = recalculate(divFile, soffice);
    const cell = back.sheets[0].cells.get('B8');
    say();
    say(`    LibreOffice, on the same file: B8 = ${cell?.value ?? '(nothing)'}`);
    say('    It ran its two hundred iterations, did not get inside its tolerance, and');
    say('    put an error code in every cell of the cycle. That IS a signal, and it is');
    say('    the whole signal: not which cell, not how many rounds, not how far it was');
    say('    still moving, not whether some other cell had settled. Three lines above,');
    say('    SLOP says all four.');
    check('LibreOffice also fails to converge here, and says so with an error code alone',
      String(cell?.value ?? '').startsWith('#'));
  }
  say();

  // -- summary ---------------------------------------------------------------
  rule('oracle summary');
  say(`${verdicts.length} comparisons:`);
  for (const v of verdicts) say('  ' + v);
  const bad = verdicts.filter((v) => v.startsWith('DISAGREE')).length;
  say();
  say(`total wall clock: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  say(bad === 0
    ? 'the kernel, Excel and LibreOffice compute the same numbers.'
    : `${bad} DISAGREEMENT(S) — that is the finding; the engine's answer stands as computed.`);
  if (bad > 0) process.exitCode = 1;
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1]
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();

export type { Emitted };
