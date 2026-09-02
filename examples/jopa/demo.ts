// examples/jopa/demo.ts -- JOPA: the standard of proof as a parameter of the
// semiring, not a constant in the rules.
//
//   node --experimental-strip-types examples/jopa/demo.ts
//
// Everything printed here is computed. The transcripts in README.md and
// page.html are this program's stdout, pasted.
//
// THIS IS A DEMONSTRATION OF A MECHANISM. The statute is synthetic, the case
// is invented, and none of it is legal advice.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import type { Witness } from '../../src/store.ts';
import {
  viterbiSemiring, logProbOf, clearsThreshold, renderLogProb,
  tropicalSemiring, unitFiringCost, provenanceSemiring, provenanceOf,
  type LogProb,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const STATUTE = read('examples', 'jopa', 'jopa.rofl');
export const CASE = read('examples', 'jopa', 'facts.rofl');
export const CALIBRATION = read('examples', 'jopa', 'calibration.rofl');

// The three claims in the case file.
export const ASH = 'c_ash';     // fire, arson alleged -- the two-standard case
export const REED = 'c_reed';   // storm, notice 41 days late
export const VALE = 'c_vale';   // subsidence, never an insured peril
export const OKORO = 'c_okoro'; // the same allegation on evidence that is not evidence

/** Load the world: the law, the case, and the modeller's own numbers, each
 *  under the writer that is allowed to write it. Getting `who` wrong is what
 *  `forged[audit]` is for, and the demo checks it is empty. */
export function world(): Rofl {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(STATUTE, { who: 'legislature' }), 'jopa.rofl');
  must(r.load(CASE, { who: 'tribunal_of_fact' }), 'facts.rofl');
  must(r.load(CALIBRATION, { who: 'modeller' }), 'calibration.rofl');
  return r;
}

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

// ---------------------------------------------------------------------------
// the weight hook: every number comes out of a fact
// ---------------------------------------------------------------------------

/** The last argument of a weighted premise, as a percentage. */
const PCT = /,(\d+)\)$/;

/** True for the two relations that carry a number into a derivation: an
 *  evidence weight found by the tribunal, and an inference strength chosen by
 *  the modeller. Nothing else weighs anything. */
const WEIGHTED = ['evidence[record](', 'strength[calibration]('];

/** A firing's confidence is the product of the weights NAMED IN ITS OWN
 *  PREMISES. No probability is written in this file: the hook reads the
 *  percentages out of the facts the rule fired on, so the numbers live in
 *  facts.rofl and calibration.rofl where a reader can change them. A firing
 *  with no weighted premise -- a date comparison, a definition lookup,
 *  conjunction of elements -- is `certain` and contributes nothing.
 *
 *  A weighted premise whose percentage will not parse THROWS. Silently
 *  reading it as `certain` would inflate every conclusion above it. */
export function weightOf(_key: string, w: Witness): LogProb {
  let acc: LogProb = viterbiSemiring.one;
  for (const p of w.prems) {
    if (p.t !== 'fact' || !WEIGHTED.some((pre) => p.key.startsWith(pre))) continue;
    const m = PCT.exec(p.key);
    if (!m) throw new Error(`weighted premise with no percentage: ${p.key}`);
    acc = viterbiSemiring.times(acc, logProbOf(Number(m[1]) / 100));
  }
  return acc;
}

/** The Viterbi fold: for every fact, the probability of its most probable
 *  derivation. ONE fold serves every standard of proof below. */
export function viterbiValues(r: Rofl): Map<string, LogProb> {
  const res = evaluateSemiring(r.store, viterbiSemiring, { weight: weightOf });
  if (!res.disciplineHeld) throw new Error('viterbi did not converge on this store');
  return res.value;
}

// ---------------------------------------------------------------------------
// the standards, read out of s.8 as data
// ---------------------------------------------------------------------------

export interface Standard { name: string; pct: number; section: string; question: string; }

/** s.8 as the caller sees it: which question is decided to which standard.
 *  Read from the store; no rule reads any of this. */
export function standards(r: Rofl): Standard[] {
  const out: Standard[] = [];
  for (const row of r.query('standard_for(Q, S, Sec)').rows) {
    const { Q, S, Sec } = row.bindings;
    const pct = r.query(`standard(${S}, N)`).rows[0]?.bindings.N;
    if (pct === undefined) throw new Error(`s.8 names a standard with no value: ${S}`);
    out.push({ name: S, pct: Number(pct), section: Sec, question: Q });
  }
  return out.sort((a, b) => a.pct - b.pct);
}

export const standardOf = (r: Rofl, question: string): Standard => {
  const s = standards(r).find((x) => x.question === question);
  if (!s) throw new Error(`no standard for ${question}`);
  return s;
};

export const sectionText = (r: Rofl, sec: string): string =>
  unq(r.query(`section_text(${sec}, T)`).rows[0]?.bindings.T ?? `"${sec}"`);

export const unq = (s: string): string => (s.startsWith('"') ? JSON.parse(s) as string : s);

// ---------------------------------------------------------------------------
// best derivation: the Viterbi backpointer, which is the reasoned decision
// ---------------------------------------------------------------------------

export interface Deriv {
  key: string;
  value: LogProb;
  section: string | null;     // the norm this step cites
  step: LogProb;              // the confidence of this step alone
  source: string | null;      // the evidence or calibration fact it rests on
  notes: string[];            // builtin and negated premises, verbatim
  children: Deriv[];
  cycle: boolean;
}

/** What one firing is worth: its own weight times the value of each premise.
 *  Exactly the product the fold takes a maximum over. */
export function firingValue(values: Map<string, LogProb>, key: string, w: Witness): LogProb {
  let prod = weightOf(key, w);
  for (const p of w.prems) {
    if (p.t === 'fact') prod = viterbiSemiring.times(prod, values.get(p.key) ?? viterbiSemiring.zero);
  }
  return prod;
}

/** Walk down the most probable derivation, choosing at each fact the firing
 *  whose product IS that fact's value. This is not a second algebra: it is
 *  the argmax the Viterbi fold already computed, read back through the
 *  support the store recorded. The tree it returns IS the explanation --
 *  not a story told about the answer afterwards. */
export function bestDerivation(
  r: Rofl, values: Map<string, LogProb>, key: string, seen = new Set<string>(),
): Deriv {
  const value = values.get(key) ?? viterbiSemiring.zero;
  const rec = r.store.get(key);
  const leaf = (): Deriv => ({
    key, value, section: null, step: viterbiSemiring.one,
    source: null, notes: [], children: [], cycle: false,
  });
  if (!rec) return leaf();
  if (seen.has(key)) return { ...leaf(), cycle: true };
  const live = r.store.witnessesOf(key).filter(
    (w) => w.prems.every((p) => p.t !== 'fact' || r.store.has(p.key)));
  if (rec.base || live.length === 0) return leaf();

  seen.add(key);
  let best: Witness | null = null;
  let bestVal: LogProb = viterbiSemiring.zero;
  for (const w of live) {
    const prod = firingValue(values, key, w);
    // strictly better under the semiring's own order; ties keep the first,
    // which is the store's canonical firing order and so is deterministic
    if (best === null || (prod !== bestVal && viterbiSemiring.plus(bestVal, prod) === prod)) {
      best = w; bestVal = prod;
    }
  }
  const w = best!;
  const out: Deriv = {
    key, value, section: null, step: weightOf(key, w),
    source: null, notes: [], children: [], cycle: false,
  };
  for (const p of w.prems) {
    if (p.t === 'neg') { out.notes.push(`not ${p.key} (finite failure: carries no annotation)`); continue; }
    if (p.t === 'bi') { out.notes.push(`${p.desc} (arithmetic: certain)`); continue; }
    if (p.key.startsWith('norm[main](')) { out.section = p.key.slice(11, -1); continue; }
    if (WEIGHTED.some((pre) => p.key.startsWith(pre))) { out.source = p.key; continue; }
    const child = bestDerivation(r, values, p.key, seen);
    if (child.children.length === 0 && r.store.get(p.key)?.base) out.notes.push(p.key);
    else out.children.push(child);
  }
  seen.delete(key);
  return out;
}

/** Every node of a derivation, conclusion first. */
export function nodesOf(d: Deriv): Deriv[] {
  return [d, ...d.children.flatMap(nodesOf)];
}

/** THE LINK WHERE THE CHAIN BREAKS at a given standard: the nodes that do
 *  not clear it although everything they rest on does. Values only fall as a
 *  derivation is composed, so a failing node whose premises all clear is the
 *  exact step at which the confidence dropped below the line -- and which
 *  step that is changes with the standard, which is the point. */
export function breakFrontier(d: Deriv, pct: number): Deriv[] {
  const out: Deriv[] = [];
  const walk = (n: Deriv): void => {
    const clears = clearsThreshold(n.value, pct / 100);
    if (!clears && n.children.every((c) => clearsThreshold(c.value, pct / 100))) out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(d);
  return out;
}

export interface Route { value: LogProb; source: string | null; }

/** Every firing of one fact, with what each is worth and the weighted premise
 *  it rests on. `plus` takes the maximum of these; this is the list it saw. */
export function routeValues(r: Rofl, values: Map<string, LogProb>, key: string): Route[] {
  const weighted = (w: Witness): string | null => {
    for (const p of w.prems) {
      if (p.t === 'fact' && WEIGHTED.some((pre) => p.key.startsWith(pre))) return p.key;
    }
    return null;
  };
  // the array is annotated rather than inferred from the literals: `IMPOSSIBLE`
  // is a `unique symbol`, and a fresh object literal widens it to `symbol`
  const out: Route[] = [];
  for (const w of r.store.witnessesOf(key)) {
    if (!w.prems.every((p) => p.t !== 'fact' || r.store.has(p.key))) continue;
    out.push({ value: firingValue(values, key, w), source: weighted(w) });
  }
  out.sort((a, b) => (a.value === b.value ? 0
    : viterbiSemiring.plus(a.value, b.value) === a.value ? -1 : 1));
  return out;
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

const banner = (s: string) => '\n' + s + '\n' + '='.repeat(s.length);

/** `deliberate_loss[main](c_ash)` -> `deliberate_loss(c_ash)`. */
export const plain = (key: string): string => key.replace(/\[[a-z_]+\]/, '');

export function renderDeriv(r: Rofl, d: Deriv, pcts: number[] = [], indent = 0): string[] {
  const pad = '  '.repeat(indent);
  const marks = pcts.map((p) => (clearsThreshold(d.value, p / 100) ? `${p}:yes` : `${p}:NO `)).join('  ');
  const lines = [`${pad}${renderLogProb(d.value).padEnd(7)} ${plain(d.key)}${marks ? '   [' + marks + ']' : ''}`];
  if (d.cycle) lines.push(`${pad}        [cycle]`);
  if (d.section) lines.push(`${pad}        ${sectionText(r, d.section)}`);
  if (d.source) lines.push(`${pad}        rests on ${renderSource(r, d.source)}`);
  for (const n of d.notes) lines.push(`${pad}        ${plain(n)}`);
  for (const c of d.children) lines.push(...renderDeriv(r, c, pcts, indent + 1));
  return lines;
}

/** An evidence or calibration fact, as a sentence. */
export function renderSource(r: Rofl, key: string): string {
  if (key.startsWith('strength[calibration](')) {
    const [tag, pct] = key.slice(22, -1).split(',');
    return `${pct}% -- inference strength ${tag}, chosen by the modeller [calibration]`;
  }
  const [id, , , pct] = key.slice(17, -1).split(',');
  const note = r.query(`evidence_note[record](${id}, T)`).rows[0]?.bindings.T;
  return `${pct}% -- ${id}: ${note ? unq(note) : '(no note)'} [record]`;
}

export const dayLabel = (r: Rofl, d: string): string =>
  unq(r.query(`day_label[record](${d}, L)`).rows[0]?.bindings.L ?? `"day ${d}"`);

// ---------------------------------------------------------------------------
// the decision, composed from the two readings at their two standards
// ---------------------------------------------------------------------------

export interface Decision {
  claim: string;
  elementsValue: LogProb; elementsStd: Standard; elementsMade: boolean;
  exclusionValue: LogProb; exclusionStd: Standard; exclusionMade: boolean;
  offenceValue: LogProb; offenceStd: Standard; offenceMade: boolean;
  outcome: string;
}

export const kElements = (c: string) => `elements_met[main](${c})`;
export const kExclusion = (c: string) => `deliberate_loss[main](${c})`;
export const kOffence = (p: string, c: string) => `offence_s9[main](${p},${c})`;

/** The claimant proves the elements to the standard in s.8(1); the insurer
 *  proves the exclusion to the DIFFERENT standard in s.8(2). Two standards in
 *  one decision, which is why a threshold baked into the rules could not
 *  express this statute at all. */
export function decide(r: Rofl, values: Map<string, LogProb>, claim: string, holder: string): Decision {
  const z = viterbiSemiring.zero;
  const el = standardOf(r, 'claim_elements');
  const ex = standardOf(r, 'exclusion_s7');
  const of = standardOf(r, 'offence_s9');
  const elementsValue = values.get(kElements(claim)) ?? z;
  const exclusionValue = values.get(kExclusion(claim)) ?? z;
  const offenceValue = values.get(kOffence(holder, claim)) ?? z;
  const elementsMade = clearsThreshold(elementsValue, el.pct / 100);
  const exclusionMade = clearsThreshold(exclusionValue, ex.pct / 100);
  const offenceMade = clearsThreshold(offenceValue, of.pct / 100);
  return {
    claim, elementsValue, elementsStd: el, elementsMade,
    exclusionValue, exclusionStd: ex, exclusionMade,
    offenceValue, offenceStd: of, offenceMade,
    outcome: !elementsMade ? 'claim fails: the elements of s.5 are not made out'
      : exclusionMade ? 'indemnity refused: the s.7 exclusion is made out'
        : 'indemnity payable',
  };
}

// ---------------------------------------------------------------------------
// whynot: the refusal letter nobody ever gets
// ---------------------------------------------------------------------------

/** The whynot tree, rendered as the sentence a refusal is supposed to be:
 *  the norm, the condition, and the fact that is missing. Everything in it
 *  is read back out of the model -- nothing is a template string about a
 *  claim the engine did not actually decide. */
export function refusal(r: Rofl, claim: string): string[] {
  const wn = r.whynot(`indemnity_due(${claim})`, { depth: 5, nodes: 60 });
  if (wn.holds) return [`indemnity_due(${claim}) holds: nothing was refused`];
  const missing = r.query(`element_missing(${claim}, E)`).rows.map((x) => x.bindings.E);
  const out: string[] = [];
  for (const e of missing) {
    const sec = ELEMENT_SECTION[e];
    out.push(`  the element that failed: ${e}`);
    out.push(`  ${sectionText(r, sec)}`);
    out.push(...elementDetail(r, claim, e).map((l) => '  ' + l));
  }
  out.push('');
  out.push('  the demonstration, from the engine:');
  out.push(...wn.text.split('\n').map((l) => '    ' + l));
  return out;
}

/** s.5's element names to the subsection each is defined in. The table is in
 *  the statute file too (`element_of`); this is the display half. */
const ELEMENT_SECTION: Record<string, string> = {
  cover_in_force: 's5_a', insured_property: 's5_b', covered_peril: 's5_c',
  causation: 's5_d', notice_in_time: 's5_e',
};

function elementDetail(r: Rofl, claim: string, element: string): string[] {
  if (element === 'notice_in_time') {
    const l = r.query(`loss_day[record](${claim}, D)`).rows[0]?.bindings.D ?? '?';
    const n = r.query(`notice_day[record](${claim}, D)`).rows[0]?.bindings.D ?? '?';
    const limit = r.query('notice_period(s5_e, N)').rows[0]?.bindings.N ?? '?';
    return [`the loss was on ${dayLabel(r, l)}; notice was given on ${dayLabel(r, n)};`,
      `that is ${Number(n) - Number(l)} days, and s.5(e) allows ${limit}.`];
  }
  if (element === 'covered_peril') {
    const p = r.query(`peril_alleged[record](${claim}, P)`).rows[0]?.bindings.P ?? '?';
    const perils = r.query('insured_peril(P)').rows.map((x) => x.bindings.P);
    return [`the peril alleged is ${p}; s.2 makes ${perils.join(', ')} insured perils,`,
      `and there is no fact anywhere in the model making ${p} one.`];
  }
  return ['(no further detail rendered for this element)'];
}

// ---------------------------------------------------------------------------
// the mechanical checks -- what CAN be verified without a lawyer
// ---------------------------------------------------------------------------

export interface Checks {
  audits: { name: string; rows: number }[];
  unsafeRules: string[];
  demandRels: number;
  standardReadByRules: string[];      // rules that read the standard tables
  monotonicityBreaks: string[];       // clears a higher standard but not a lower one
  uncitedConclusions: string[];       // a derivation that passes through no norm
  operative: number;                  // conclusions checked for citation
}

/** The relations this example draws conclusions in. */
export const OPERATIVE = ['established', 'element_met', 'elements_met', 'elements_met_closed',
  'indemnity_due', 'deliberate_loss', 'offence_s9'];

/** The tables that hold the standard of proof. No rule may read them: that
 *  is the whole claim, and it is checked here through the kernel's OWN
 *  reflection of the rules rather than by grepping the file. */
export const STANDARD_TABLES = ['standard', 'standard_for', 'question_of'];

export function mechanicalChecks(r: Rofl, values: Map<string, LogProb>): Checks {
  const audits = ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)',
    'undefined_premise[audit](R, Rel)']
    .map((name) => ({ name, rows: r.query(name).rows.length }));

  const ev = new Evaluation(r.store);
  const unsafeRules = ev.rules.filter((x) => !x.safe).map((x) => x.canon);

  const standardReadByRules: string[] = [];
  for (const t of STANDARD_TABLES) {
    for (const rel of ['premise_pos', 'premise_neg', 'concludes']) {
      for (const row of r.query(`${rel}(R, ${t})`).rows) {
        standardReadByRules.push(`${rel}(${row.bindings.R}, ${t})`);
      }
    }
  }

  // a higher standard must never be cleared by something a lower one refuses
  const ladder = standards(r).map((s) => s.pct).sort((a, b) => a - b);
  const monotonicityBreaks: string[] = [];
  for (const [k, v] of values) {
    for (let i = 1; i < ladder.length; i++) {
      if (clearsThreshold(v, ladder[i] / 100) && !clearsThreshold(v, ladder[i - 1] / 100)) {
        monotonicityBreaks.push(`${k}: clears ${ladder[i]} but not ${ladder[i - 1]}`);
      }
    }
  }

  // every derivation of an operative conclusion passes through a cited norm
  const prov = evaluateSemiring(r.store, provenanceSemiring, { base: provenanceOf }).value;
  const uncitedConclusions: string[] = [];
  let operative = 0;
  for (const [k, poly] of prov) {
    if (!OPERATIVE.some((rel) => k.startsWith(rel + '['))) continue;
    operative++;
    for (const mono of poly) {
      if (!mono.some((f) => f.startsWith('norm[main]('))) uncitedConclusions.push(`${k} <= ${mono.join(' + ')}`);
    }
  }
  return {
    audits, unsafeRules, demandRels: ev.demandRels.size, standardReadByRules,
    monotonicityBreaks, uncitedConclusions, operative,
  };
}

/** How many rules the statute translates to, counted through the kernel's own
 *  reflection of them rather than by grepping the file for `:-` -- which
 *  would also count the one in the comment explaining what NOT to write. */
export function ruleCount(r: Rofl): number {
  const ids = new Set<string>();
  for (const rel of [...OPERATIVE, 'element_missing']) {
    for (const row of r.query(`concludes(R, ${rel})`).rows) ids.add(row.bindings.R);
  }
  return ids.size;
}

/** Move ONE fact of s.8 -- the standard the exclusion is proved to -- and
 *  decide the same case again. Returns both decisions and the proof that the
 *  fixpoint did not move: every derived fact, and every annotation on it, is
 *  identical. Only the number the conclusion had to clear changed. */
export function regimeFlip(r: Rofl, to: string): {
  before: Decision; after: Decision; derivedIdentical: boolean; annotationsIdentical: boolean;
} {
  const values = viterbiValues(r);
  const before = decide(r, values, ASH, 'k_ashby');
  const c = Rofl.fromSnapshot(r.save());
  const old = c.query('standard_for(exclusion_s7, S, Sec)').rows[0].bindings;
  if (!c.retract(`standard_for(exclusion_s7, ${old.S}, ${old.Sec})`).ok) throw new Error('retract failed');
  must(c.assert(`standard_for(exclusion_s7, ${to}, ${old.Sec}).`, { who: 'legislature' }), 's.8(2) amendment');
  c.evaluate();
  const after = decide(c, viterbiValues(c), ASH, 'k_ashby');

  const derived = (x: Rofl) => [...x.store.facts.values()]
    .filter((f) => !f.base && OPERATIVE.some((rel) => f.rel === rel)).map((f) => f.key).sort();
  const a = derived(r); const b = derived(c);
  const v2 = viterbiValues(c);
  return {
    before, after,
    derivedIdentical: a.length === b.length && a.every((k, i) => k === b[i]),
    annotationsIdentical: a.every((k) => values.get(k) === v2.get(k)),
  };
}

// ---------------------------------------------------------------------------
// the transcript
// ---------------------------------------------------------------------------

function main(): void {
  const t0 = Date.now();
  const r = world();
  const values = viterbiValues(r);

  console.log(`JOPA -- the standard of proof as a parameter of the semiring`);
  console.log(`A SYNTHETIC statute, an invented case. A demonstration of a mechanism,`);
  console.log(`not legal advice, and it decides nobody's claim.`);

  console.log(banner('0. what is loaded, and who wrote it'));
  const chk = mechanicalChecks(r, values);
  console.log(`  jopa.rofl        the law                     [main]        who=legislature`);
  console.log(`  facts.rofl       three claims, as found      [record]      who=tribunal_of_fact`);
  console.log(`  calibration.rofl one inference strength      [calibration] who=modeller`);
  console.log('');
  for (const a of chk.audits) console.log(`  ${a.name.padEnd(34)} ${a.rows === 0 ? 'empty' : `${a.rows} ROWS`}`);
  console.log(`  ${'rules not range-restricted'.padEnd(34)} ${chk.unsafeRules.length === 0 ? 'none' : chk.unsafeRules.join('; ')}`);
  console.log(`  ${'relations evaluated top-down'.padEnd(34)} ${chk.demandRels}`);

  console.log(banner('1. the Boolean reading: what the norms make arguable'));
  console.log(`
  The first question is not how sure anyone is. It is whether the norm is
  engaged at all -- whether there is a derivation. That is the plain fixpoint,
  and no standard of proof enters it.
`);
  for (const q of ['elements_met(C)', 'indemnity_due(C)', 'deliberate_loss(C)', 'offence_s9(P, C)']) {
    const rows = r.query(q).rows.map((x) => x.text);
    console.log(`    ${q.padEnd(22)} ${rows.length === 0 ? '(nothing)' : rows.join(' ; ')}`);
  }
  console.log(`
  So the allegation of arson is ARGUABLE: a derivation exists. Whether it is
  MADE OUT is a different question, and the Boolean reading cannot answer it.
  Nor can it tell the camera still from the anonymous letter -- both derive
  established(c_ash, at_property), and one of them is worth nothing.`);

  console.log(banner('2. the annotated reading: one number, three standards'));
  const excl = values.get(kExclusion(ASH))!;
  const offc = values.get(kOffence('k_ashby', ASH))!;
  console.log(`
  ONE fold of the Viterbi semiring over the support the engine already
  recorded. The rules are untouched; the facts are untouched; s.8 is a table
  of numbers no rule reads. What follows is that one fold, read at each of
  the three standards s.8 names.
`);
  console.log(`    s.8 as data:`);
  for (const s of standards(r)) {
    console.log(`      ${s.section}  ${s.question.padEnd(16)} ${s.name.padEnd(26)} ${s.pct}%`);
  }
  console.log(`
    deliberate_loss(c_ash)      = ${renderLogProb(excl)}    (the s.7 exclusion)
    offence_s9(k_ashby, c_ash)  = ${renderLogProb(offc)}    (the s.9 offence)
`);
  console.log(`  The same number, because the offence adds no evidential step to the`);
  console.log(`  exclusion -- and it is decided differently in the two proceedings:\n`);
  for (const s of standards(r)) {
    const v = s.question === 'claim_elements' ? values.get(kElements(ASH))!
      : s.question === 'offence_s9' ? offc : excl;
    const target = s.question === 'claim_elements' ? 'elements_met(c_ash)'
      : s.question === 'offence_s9' ? 'offence_s9(k_ashby, c_ash)' : 'deliberate_loss(c_ash)';
    console.log(`    ${s.section}  ${target.padEnd(28)} ${renderLogProb(v)}  vs ${String(s.pct).padStart(3)}%  `
      + `${clearsThreshold(v, s.pct / 100) ? 'MADE OUT' : 'not made out'}`);
  }
  const d = decide(r, values, ASH, 'k_ashby');
  console.log(`\n    => ${d.outcome}`);
  console.log(`    => the prosecution under s.9 fails on the same facts and the same norms.`);

  console.log(`
  AND THE OTHER KIND OF FAILURE, which a threshold alone would hide. Claim
  c_okoro: the insurer alleges exactly the same thing, the traces are there,
  and the ONLY thing putting the policyholder at the property is an unsigned
  letter -- which s.6(4) says is not evidence of any fact, so the tribunal
  weighed it at 0.
`);
  const okoro = values.get(kExclusion(OKORO))!;
  const ladder = [1, ...standards(r).map((s) => s.pct)];
  const row = (label: string, v: LogProb) => `    ${label.padEnd(28)}${renderLogProb(v).padEnd(13)}`
    + ladder.map((p) => `${p}%:${clearsThreshold(v, p / 100) ? 'yes' : 'NO'}`).join('  ');
  console.log(row('deliberate_loss(c_ash)', excl));
  console.log(row('deliberate_loss(c_okoro)', okoro));
  console.log(`
  Both are DERIVABLE -- the Boolean reading above lists both, and cannot tell
  them apart. One is an allegation that is not strong enough. The other cannot
  be established at ANY standard above zero, and lowering the standard will
  never rescue it: excluded evidence is not weak evidence.

  The carrier keeps the two apart because probability zero is an explicit
  SYMBOL in it and not a float that arithmetic produced. \`impossible\`
  annihilates the chain above it, where a weak number merely drags it down --
  and notice that the traces against Okoro are perfectly good:
`);
  console.log(`    established(c_okoro,accelerant_used)  = `
    + `${renderLogProb(values.get(`established[main](${OKORO},accelerant_used)`)!)}`);
  console.log(`    established(c_okoro,at_property)      = `
    + `${renderLogProb(values.get(`established[main](${OKORO},at_property)`)!)}`);
  console.log(`    deliberate_loss(c_okoro)              = ${renderLogProb(okoro)}`
    + `   <- one impossible premise, and the whole chain is impossible`);
  console.log(`
  A cast that flattened the carrier to a number would lose exactly this. It is
  the difference between "we could not prove it" and "this could never have
  proved anything", and in a decision about somebody's property or liberty
  those are not the same sentence.`);

  console.log(banner('3. where the chain breaks -- and it is a different link at each standard'));
  const tree = bestDerivation(r, values, kExclusion(ASH));
  const pcts = standards(r).map((s) => s.pct);
  console.log(`
  Walking the most probable derivation of the exclusion, with each step read
  at all three standards at once:
`);
  for (const l of renderDeriv(r, tree, pcts)) console.log('    ' + l);
  console.log('');
  for (const s of standards(r)) {
    const front = breakFrontier(tree, s.pct);
    if (front.length === 0) {
      console.log(`    at ${s.pct}% (${s.name}): nothing breaks -- the whole chain clears.`);
      continue;
    }
    console.log(`    at ${s.pct}% (${s.name}) the chain breaks at:`);
    for (const n of front) {
      console.log(`      ${plain(n.key)} = ${renderLogProb(n.value)}`
        + (n.section ? `  -- the step under ${sectionText(r, n.section).split(' ')[0]}` : ''));
      for (const c of n.children) {
        console.log(`        what it rests on still clears: ${plain(c.key)} = ${renderLogProb(c.value)}`);
      }
      if (n.source) console.log(`        and it rests directly on ${renderSource(r, n.source)}`);
    }
  }
  console.log(`
  That is the sentence the example exists for. Not "it fails beyond reasonable
  doubt" but: the inference from traces and presence to a deliberate act
  stands at 0.70, which is enough for the insurer's refusal and not enough for
  a conviction -- and under the criminal standard the break has moved further
  down, to the laboratory report itself.`);

  console.log(banner('4. the reasoned decision, with citations'));
  console.log(`
  The same tree with the statute text attached. This is not an explanation
  generated after the fact: it IS the computation, printed.
`);
  console.log(`    DECISION -- claim ${ASH}, policyholder k_ashby`);
  console.log(`    proceeding: civil claim on the policy`);
  console.log(`    standard for the exclusion: ${d.exclusionStd.name} (${d.exclusionStd.pct}%), ${d.exclusionStd.section}`);
  console.log('');
  for (const l of renderDeriv(r, tree)) console.log('    ' + l);
  console.log('');
  console.log(`    ${sectionText(r, 's8_2')}`);
  console.log(`    The allegation stands at ${renderLogProb(d.exclusionValue)}. It does not reach ${d.exclusionStd.pct}%.`);
  console.log(`    ${sectionText(r, 's4')}`);
  console.log(`    The elements of s.5 stand at ${renderLogProb(d.elementsValue)} against a standard of ${d.elementsStd.pct}%.`);
  console.log(`    ORDER: ${d.outcome}.`);

  console.log(banner('5. change one fact of s.8; the case changes; no rule is touched'));
  const flip = regimeFlip(r, 'balance_of_probabilities');
  console.log(`
  s.8(2) says an allegation of deliberate loss needs clear and convincing
  evidence. Suppose a jurisdiction where it does not -- where the exclusion is
  proved like anything else in a civil claim. That is ONE fact:

    standard_for(exclusion_s7, clear_and_convincing,     s8_2).
    standard_for(exclusion_s7, balance_of_probabilities, s8_2).
`);
  console.log(`    before: exclusion at ${flip.before.exclusionStd.pct}%  -> ${flip.before.outcome}`);
  console.log(`    after:  exclusion at ${flip.after.exclusionStd.pct}%  -> ${flip.after.outcome}`);
  console.log(`
    derived facts identical:        ${flip.derivedIdentical}
    annotations on them identical:  ${flip.annotationsIdentical}
`);
  console.log(`  Nothing was recomputed differently. The fixpoint did not move and neither`);
  console.log(`  did a single annotation: the standard of proof is not in the model at all,`);
  console.log(`  it is a threshold applied to the model. A rule of the form`);
  console.log(`  \`refuse(C) :- deliberate_loss(C), confidence(C, X), X >= 75\` would have`);
  console.log(`  required editing the logic of the norm to state the same amendment.`);

  console.log(banner('6. whynot -- why the other two claims were refused'));
  console.log(`
  "Your claim does not meet the requirements" is an absent whynot, not an
  absent ground. The ground exists; it is a specific condition of a specific
  norm and a specific fact. Here it is, for two refusals of different shapes.
`);
  for (const c of [REED, VALE]) {
    console.log(`  $ whynot indemnity_due(${c})\n`);
    for (const l of refusal(r, c)) console.log('  ' + l);
    console.log('');
  }

  console.log(banner('7. the other readings of the same fixpoint'));
  const trop = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });
  const prov = evaluateSemiring(r.store, provenanceSemiring, { base: provenanceOf });
  const kx = kExclusion(ASH);
  console.log(`
  TROPICAL (1 per rule firing) -- the shortest route through the statute:
    ${plain(kx)} is ${trop.value.get(kx)} norm applications from the case file.
    ${plain(kElements(ASH))} is ${trop.value.get(kElements(ASH))}.

  PROVENANCE -- which facts and which norms jointly produced the conclusion.
  Every monomial is one independent route; every one of them names the norms
  it passed through, because every operative rule has \`norm(S)\` as a premise:
`);
  const poly = prov.value.get(kx)!;
  console.log(`    ${plain(kx)}: ${poly.length} minimal source sets`);
  const shortest = [...poly].sort((a, b) => a.length - b.length)[0];
  for (const f of shortest) console.log(`      ${plain(f)}`);
  console.log(`
  AND WHAT PROVENANCE CANNOT SEE. One of those ${poly.length} routes goes through the
  anonymous letter, which s.6(4) says is not evidence of any fact. Provenance
  reports it, correctly: it IS a derivation. The tribunal weighed it at 0, so
  the Viterbi carrier holds it as \`impossible\`, and it wins no maximum:
`);
  const kAt = `established[main](${ASH},at_property)`;
  console.log(`    ${plain(kAt)} = ${renderLogProb(values.get(kAt)!)}`);
  console.log(`    every route to it, and what each is worth:`);
  for (const rt of routeValues(r, values, kAt)) {
    console.log(`      ${renderLogProb(rt.value).padEnd(11)} ${plain(rt.source ?? '(no weighted premise)')}`);
  }
  console.log(`
  Two readings of one word. "Derivable" and "proved" are not the same, and the
  gap between them is exactly what a standard of proof is for.

  AND THE OTHER HALF OF THAT WARNING. s.5 is in this model twice: once as a
  conjunction of its five elements, once as "no element is missing", with the
  element list as data. They agree on every claim, and only one of them can be
  put to a standard of proof at all:
`);
  console.log(`    elements_met(c_ash)         = ${renderLogProb(values.get(kElements(ASH))!)}   `
    + `(the five elements, multiplied)`);
  console.log(`    elements_met_closed(c_ash)  = ${renderLogProb(values.get(`elements_met_closed[main](${ASH})`)!)}   `
    + `(nothing is missing -- and a finite failure carries no annotation)`);
  console.log(`
  The second reading says the claim is CERTAIN. It is not; it rests on a fire
  brigade report the tribunal put at 97%. Whether a norm can be tested at a
  standard of proof turns out to depend on how the norm was written down.`);

  console.log(banner('8. what this demonstration does NOT establish'));
  console.log(`
  Every other example in this repository can be checked against something
  executable. This one cannot: the correctness of a legal translation is
  checkable only by a lawyer, and no oracle was invented to pretend otherwise.

  WHAT WAS CHECKED MECHANICALLY, and is checked again in the test suite:
`);
  console.log(`    the kernel's audits, all empty                    ${chk.audits.every((a) => a.rows === 0)}`);
  console.log(`    no rule reads the standard tables ${JSON.stringify(STANDARD_TABLES)}`);
  console.log(`      rules found reading them:                      ${chk.standardReadByRules.length}`);
  console.log(`    a higher standard is never cleared where a lower one is refused`);
  console.log(`      violations over all ${values.size} annotated facts:        ${chk.monotonicityBreaks.length}`);
  console.log(`    every derivation of an operative conclusion cites a norm`);
  console.log(`      conclusions checked: ${chk.operative}, uncited: ${chk.uncitedConclusions.length}`);
  console.log(`
  WHAT IS NOT ESTABLISHED, and cannot be by anything in this directory:

    - that the translation is faithful. The statute is synthetic, so there is
      nothing to be faithful TO; against a real statute this is exactly the
      step a human must audit, and the only defence offered is that the
      translation is ${ruleCount(r)} rules long and can be read in full.
    - that the evidence weights are calibrated. 92% for a camera still is a
      number a tribunal would have to justify; here it is invented.
    - that multiplying along a chain is the right way to combine evidence.
      It assumes independence, and traces plus presence are not independent.
    - that MAX across routes is right. Corroboration does not accumulate in
      this algebra: two independent 60% witnesses give 60%, not more. Law
      thinks corroboration matters; Viterbi cannot express that.
    - that the standard belongs on the composite rather than element by
      element. Multiply five elements at 90% and the composite is 59%; a
      lawyer would say each element is proved. That is a real dispute in
      evidence law and the algebra does not settle it -- it only makes the
      choice explicit and movable.
`);
  console.log(`  (${Date.now() - t0} ms for everything above.)`);

  const bad = chk.audits.filter((a) => a.rows > 0).length + chk.unsafeRules.length
    + chk.standardReadByRules.length + chk.monotonicityBreaks.length + chk.uncitedConclusions.length;
  if (bad > 0) { console.error(`\nFAILED: ${bad} mechanical check(s)`); process.exitCode = 1; }
}

const realPath = (p: string) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && realPath(path.resolve(process.argv[1])) === realPath(new URL(import.meta.url).pathname)) {
  main();
}
