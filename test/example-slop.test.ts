// examples/slop — the SLOP demo, run as a test so it cannot rot.
//
// Every assertion here is the demo's own, on a smaller slice of the same
// real workbook: the recomputation against Excel's own cached values, the
// provenance tree down to a manual entry and a hardcoded constant, the
// interval enclosure, the ambiguity gate in both directions, and the
// circular model's convergence report.
//
// SIZE IS A REQUIREMENT, not an accident. The demo's headline closure is 231
// formula cells and takes ~20 s to reach fixpoint; the kernel's insert cost
// is superlinear in store size (finding f_store_index_insert_quadratic), so
// this suite runs the closure of ONE country row instead (196 formula cells
// against the demo's 231) and states the trade. The whole file is budgeted at
// well under the 300-second check-run limit; if it stops being, the slice
// shrinks, not the budget.
//
// The LibreOffice oracle is NOT run here. It costs 15 s per conversion and
// it is a property of the machine, not of the code; the demo runs it and
// says so when it is missing. What this file checks against is the second
// oracle, which is free: the values Excel itself cached in the file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MODEL, openModel, census, against, enclosed, restsOn, ambiguous, runCycle,
} from '../examples/slop/demo.ts';
import { compile, toScaled, SCALE, parseFormula } from '../examples/slop/formula.ts';
import { readWorkbook, unzip, colToNum, numToCol, translate } from '../examples/slop/xlsx.ts';
import { load, provenanceTree, show } from '../examples/slop/world.ts';
import { workbook, cells, closedForm, crc32, CONVERGING, DIVERGING } from '../examples/slop/revolver.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SLOP_TEXT = fs.readFileSync(path.join(ROOT, 'examples', 'slop', 'slop.rofl'), 'utf8');

/** A slice of the real model small enough to reach fixpoint quickly: the
 *  blended equity risk premium for one country, which still pulls in a
 *  VLOOKUP across sheets, a SUM over a range, an IF, a division, a manual
 *  entry and a constant typed into a formula. */
const SLICE = 'Cost of capital worksheet!K5';


const wb = openModel();
const em = compile(wb, { targets: [SLICE] });
const world = load(em.facts);

// ---------------------------------------------------------------------------
// the reader

test('the .xlsx is read with node:zlib and nothing else', () => {
  const parts = unzip(fs.readFileSync(MODEL));
  assert.ok(parts.has('xl/workbook.xml'), 'the archive holds a workbook part');
  assert.ok(parts.has('xl/sharedStrings.xml'));
  assert.equal(wb.sheets.length, 17);
  const c = census(wb);
  assert.equal(c.formulas, 1231);
  // the claim the choice of subset rests on: three functions cover the model
  assert.equal(c.fn.get('IF'), 295);
  assert.equal(c.fn.get('VLOOKUP'), 121);
  assert.equal(c.fn.get('SUM'), 17);
  const outside = [...c.fn].filter(([k]) => !['IF', 'VLOOKUP', 'SUM'].includes(k))
    .reduce((a, b) => a + b[1], 0);
  assert.equal(outside, 7, 'seven calls in 1231 formulas use anything else');
});

test('a shared formula is expanded by translating its relative references', () => {
  // <f t="shared" ref="D3:L3" si="0"> with master C3*(1+D2) at D3
  assert.equal(wb.byName.get('Valuation output')!.cells.get('E3')!.formula, 'D3*(1+E2)');
  assert.equal(wb.byName.get('Valuation output')!.cells.get('M3')!.formula, 'L3*(1+M2)');
  // a $ pins the part it precedes, and a string literal is stepped over
  assert.equal(translate('$B$29-(A1+B$2)*"C3"', 2, 3), '$B$29-(C4+D$2)*"C3"');
  assert.equal(numToCol(colToNum('AA')), 'AA');
});

test('decimal text becomes a scaled integer without a float in between', () => {
  assert.equal(toScaled('0.05'), 5_000_000);
  assert.equal(toScaled('4.9160000000000002E-2'), 4_916_000);
  assert.equal(toScaled('-21765.4'), -2_176_540_000_000);
  assert.equal(toScaled('0.000000005'), 1, 'half away from zero');
  assert.equal(toScaled('0.000000004'), 0);
  assert.equal(toScaled('not a number'), null);
});

// ---------------------------------------------------------------------------
// the recomputation, against the oracle in the file

test('the recomputation matches the values Excel cached, to the carrier unit', () => {
  const report = against(world, wb, em.compiled);
  assert.ok(report.compared >= 20, `the slice must compare something: ${report.compared}`);
  assert.deepEqual(report.missing, [], 'every formula cell in the slice got a value');
  // one carrier unit is 1e-8 of a sheet value, and this sheet is denominated
  // in millions of dollars, so a unit here IS a cent
  assert.ok((report.worst?.units ?? 0) <= 4,
    `worst deviation ${report.worst?.units} units at ${report.worst?.cell}`);
  assert.ok(report.exact >= report.compared - 4,
    `${report.exact} of ${report.compared} exact`);
});

test('the interval run ENCLOSES the oracle, rather than being close to it', () => {
  const enc = enclosed(world, wb, em.compiled);
  assert.ok(enc.checked >= 20, `something must be checked: ${enc.checked}`);
  assert.deepEqual(enc.escaped, [], 'no cell escaped its own enclosure');
  assert.equal(enc.inside, enc.checked);
});

test('a declared span comes out as a range, in one pass, on untouched formulas', () => {
  const slice = compile(wb, { targets: ['Valuation output!C3'] });
  const point = load(slice.facts);
  const before = Number(point.query('value("Valuation output!C3", V)').rows[0].bindings['V']);
  const spanned = load(slice.facts, `span("Input sheet!B26", ${toScaled('0.03')}, ${toScaled('0.07')}).`);
  const iv = spanned.query('ivalue("Valuation output!C3", L, H)').rows[0].bindings;
  const lo = Number(iv['L']), hi = Number(iv['H']);
  assert.ok(lo < before && before < hi, `${lo} < ${before} < ${hi}`);
  // C3 = B3*(1+C2): revenue 21765.4 grown by between 3% and 7%
  assert.ok(Math.abs(lo - toScaled('22418.362')!) < SCALE, `low end ${show(lo)}`);
  assert.ok(Math.abs(hi - toScaled('23288.978')!) < SCALE, `high end ${show(hi)}`);
});

// ---------------------------------------------------------------------------
// the display that is the product

test('the provenance tree reaches a manual entry and a hardcoded constant', () => {
  const tree = provenanceTree(world, SLICE, { depth: 6, children: 4 });
  const lines = tree.split('\n');
  assert.equal(lines[0], 'Cost of capital worksheet!K5 = 0.03830277  <- =IF(J5=0,0,I5*J5)');
  assert.ok(tree.includes('Cost of capital worksheet!H5 = 193636   [MANUAL ENTRY'),
    'the revenue somebody typed in is named as one');
  assert.ok(tree.includes('[A CONSTANT TYPED INTO THE FORMULA]'),
    'and so is the constant inside the IF');
  assert.ok(tree.includes('via VLOOKUP into Country equity risk premiums!A5:D196'));
  assert.ok(tree.includes('Country equity risk premiums!D189 = 0.0446'),
    'the tree walks THROUGH the lookup into the rate table');
  assert.ok(tree.includes('Country equity risk premiums!B1 = 0.0423   [MANUAL ENTRY'),
    'and bottoms out at whoever typed the rate in');
  assert.ok(tree.includes('[BLANK CELL, read as zero]'),
    'a blank cell inside a SUM range is named, not silently skipped');
});

test('only the branch of an IF that fired is in the tree', () => {
  // K5 = IF(J5=0, 0, I5*J5). J5 is not zero, so the constant 0 is the
  // COMPARISON's operand and the true branch never fired: I5 and J5 are in
  // the tree, and no witness mentions the true branch's own node.
  const tree = provenanceTree(world, SLICE, { depth: 2 });
  assert.ok(tree.includes('Cost of capital worksheet!I5'));
  assert.ok(tree.includes('Cost of capital worksheet!J5'));
  const why = world.why('value("Cost of capital worksheet!K5", 3830277)').text;
  assert.ok(why.includes('!= 0 [builtin]'), 'the guard that chose the branch is recorded');
});

test('the marks are facts about the file, not a guess', () => {
  const manual = world.query('manual_entry(C)').rows.map((x) => x.bindings['C']);
  assert.ok(manual.includes('"Cost of capital worksheet!H5"'));
  const hard = world.query('hardcoded(C, V)').rows;
  assert.ok(hard.length > 0, 'the slice contains a constant typed into a formula');
  const blanks = world.query('empty(C)').rows;
  assert.ok(blanks.length > 0, 'and a blank cell that a range reads as zero');
});

// ---------------------------------------------------------------------------
// which inputs really move it

test('the provenance semiring names the inputs the total rests on, and no others', () => {
  const rests = restsOn(world, SLICE);
  assert.equal(rests.complete, true, 'the polynomial fits under the 32-monomial cap');
  assert.deepEqual(rests.inputs, [
    'Cost of capital worksheet!H16',
    'Cost of capital worksheet!H5',
    'Cost of capital worksheet!H6',
    'Country equity risk premiums!B1',
    'Country equity risk premiums!E189',
  ]);
  const manual = world.query('manual_entry(C)').rows.length;
  assert.ok(manual > rests.inputs.length * 4,
    `five of ${manual} typed-in numbers move this cell; that is the sensitivity answer`);
});

// ---------------------------------------------------------------------------
// the ambiguity gate, in BOTH directions
//
// A gate that has only ever said yes is an assumption wearing a gate's
// interface, so both halves are here.

test('a well-formed sheet produces every number exactly one way', () => {
  const amb = ambiguous(world);
  assert.ok(amb.checked >= 20);
  assert.deepEqual(amb.ambiguous, []);
});

test('the gate says NO when a lookup table holds the same key twice', () => {
  const dup = load([
    'formula("m!B1", 1).', 'find(1, 2, "rates!A1:B3", 2).', 'ref(2, "m!A1").',
    'label("m!A1", "widget").',
    'tkey("rates!A1:B3", 1, "widget").', 'tcell("rates!A1:B3", 1, 2, "rates!B1").',
    'tkey("rates!A1:B3", 2, "widget").', 'tcell("rates!A1:B3", 2, 2, "rates!B2").',
    'input("rates!B1", 17800000000).', 'input("rates!B2", 17800000000).',
  ].join('\n'));
  const amb = ambiguous(dup);
  assert.equal(amb.ambiguous.length, 1, 'exactly one cell is ambiguous');
  assert.equal(amb.ambiguous[0][1], 2n, 'and it has two derivations, not one');
});

// ---------------------------------------------------------------------------
// what SLOP refuses, and says so

test('a formula outside the subset is a named refusal, never a wrong number', () => {
  const opt = load(compile(wb, { sheets: ['Option value'] }).facts);
  const refusals = opt.query('refusal(C, W)').rows.map((x) => JSON.parse(x.bindings['W']) as string);
  assert.ok(refusals.length > 0);
  assert.ok(refusals.some((w) => w === 'LN()'), `the reason is named: ${refusals.join(', ')}`);
  assert.ok(refusals.some((w) => w === 'exponentiation (^)'));
  // and a cell that only lost a precedent is a different answer
  const starved = opt.query('starved(C)').rows;
  const refused = opt.query('refused(C)').rows;
  assert.ok(starved.length > 0 && refused.length > 0);
  assert.equal(starved.some((s) => refused.some((r) => r.bindings['C'] === s.bindings['C'])), false,
    'the two answers do not overlap');
});

// ---------------------------------------------------------------------------
// the writer, and the circular model

test('the .xlsx writer produces an archive this repository\'s reader can read', () => {
  const bytes = workbook('Revolver', CONVERGING);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926, 'the CRC-32 is the standard one');
  const back = readWorkbook(bytes);
  assert.equal(back.sheets.length, 1);
  assert.equal(back.sheets[0].cells.get('B5')!.formula, '(B3+B8)/2');
  assert.equal(back.sheets[0].cells.get('B3')!.value, '4000000');
  assert.equal(back.sheets[0].cells.get('A3')!.value, 'Opening debt');
  // no cached values: anything a spreadsheet shows for this file, it computed
  assert.equal(back.sheets[0].cells.get('B5')!.value, undefined);
  assert.ok([...cells(CONVERGING).values()].some((c) => c.f === '(B3+B8)/2'));
});

test('the acyclic evaluator is SILENT on a circular sheet, and that is correct', () => {
  const conv = runCycle(CONVERGING, 4, SCALE / 100);
  assert.equal(conv.acyclicRows, 0,
    'a numeric fixpoint is not a least fixpoint over a set of facts');
});

test('the circular model converges, and the round is a derived fact', () => {
  const HORIZON = 45;
  const conv = runCycle(CONVERGING, HORIZON, SCALE / 100);
  assert.equal(conv.steadyAt, 29, 'it stopped moving by more than a cent at round 29');
  assert.equal(conv.relapsed, false, 'and did not leave the tolerance again');
  // exact equality is never reached: the truncating carrier has a period-two
  // orbit one unit wide. That is reported, not hidden.
  assert.equal(conv.convergedAt, null);
  assert.equal(conv.stillMoving.length, 1);
  assert.equal(Math.abs(conv.stillMoving[0].now - conv.stillMoving[0].before), 1,
    'and the residual is ONE carrier unit: 1e-8 of a dollar');
  // the answer itself, against algebra done in doubles outside the kernel
  const closed = closedForm(CONVERGING);
  conv.closing.forEach((v, i) => {
    assert.ok(v !== null);
    const units = Math.abs(v! - Math.round(closed[i] * SCALE));
    assert.ok(units <= SCALE / 100, `period ${i + 1} is ${units} units from the closed form`);
  });
});

test('and when it does NOT converge, that is the answer, with the cell named', () => {
  const div = runCycle(DIVERGING, 24, SCALE / 100);
  assert.equal(div.convergedAt, null);
  assert.equal(div.steadyAt, null);
  assert.equal(div.diverging, true);
  assert.ok(div.stillMoving.length >= 3, 'and it names what was still moving');
  assert.ok(div.stillMoving.some((s) => s.cell === 'Revolver!B8'));
});

// ---------------------------------------------------------------------------
// the program itself

test('every rule is range-restricted, nothing is demand-backed, negation is stratified', () => {
  assert.equal(world.query('unstratified(X)').rows.length, 0);
  assert.equal(world.query('undefined_premise[audit](R, Rel)').rows.length, 0,
    'every relation a rule reads is concluded by something or declared edb');
  // the two properties the brief asks to be asserted rather than assumed
  const ev = (world as unknown as {
    prepared(n: number): { rules: { safe: boolean }[]; demandRels: Set<string> };
  }).prepared(100_000);
  const own = SLOP_TEXT.split('\n').filter((l) => l.includes(':-') && !l.trimStart().startsWith('--'));
  assert.ok(own.length > 100, `slop.rofl is a large program: ${own.length} rules`);
  assert.equal(ev.rules.every((r) => r.safe), true, 'every rule is range-restricted');
  assert.equal(ev.demandRels.size, 0, 'and nothing falls back to demand evaluation');
});

test('the rules file declares every host-supplied relation as edb', () => {
  const text = SLOP_TEXT;
  for (const rel of ['formula', 'input', 'label', 'empty', 'num', 'lit_text', 'ref',
    'plus', 'minus', 'times', 'over', 'negate', 'cmp', 'pick', 'sum_head', 'sum_item',
    'sum_last', 'find', 'tkey', 'tcell', 'outside_subset', 'span', 'horizon', 'tolerance']) {
    assert.ok(text.includes(`edb(${rel}).`), `edb(${rel}) is declared`);
  }
  // not because the carry idiom would poison the fold any more — it would not,
  // the fold is about one tick — but because a round here is a coordinate in the
  // data rather than a moment the model lives through
  assert.equal(/@next/.test(text), false, 'no @next: the round index is an argument');
});

test('a formula outside the subset parses to a NAMED refusal, not an exception', () => {
  assert.deepEqual(parseFormula('NORMSDIST(A1)', 's'), { k: 'unsupported', what: 'NORMSDIST()' });
  assert.deepEqual(parseFormula('A1^2', 's'), { k: 'unsupported', what: 'exponentiation (^)' });
  assert.deepEqual(parseFormula('A1&"x"', 's'), { k: 'unsupported', what: 'string concatenation (&)' });
  // and the subset itself parses
  const t = parseFormula("IF(H5>0,H5/$H$18,)", 'Cost of capital worksheet');
  assert.equal(t.k, 'if');
});
