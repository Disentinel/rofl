// demo.ts — BLEEP: distrust propagation as multiplication in a semiring.
//
//   node --experimental-strip-types examples/bleep/demo.ts
//
// Loads examples/bleep/bleep.rofl — a quarterly report whose numbers arrive
// through channels of differing trustworthiness — and folds a four-element
// lattice over the support hypergraph the kernel already recorded. Nothing
// in the rules propagates a label; ⊗ = min does it.
//
// What gets printed:
//   1. the redacted report      ████ where the value rests on something
//                               nobody checked, and the min that made it so
//   2. why    on a redacted value      which link is dirty
//   3. whynot on cleanliness           what must be confirmed to launder it
//   4. what gets laundered if I verify X   verification priority, derived
//   5. counting                        independent clean routes; 0 means
//                                      nothing in the model can launder it
//   6. the echo chamber                a real cycle, and why BOUNDED holds
//   7. before / after verifying one source
//
// The file exports its pieces so test/example-bleep.test.ts runs the same
// computations without re-running this transcript.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import type { Witness } from '../../src/store.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  trustSemiring, countingSemiring, renderTrust, renderCount,
  FORBIDDEN, DIRTY, DUBIOUS, CLEAN, type Trust, type Count,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');

export const BOOT = fs.readFileSync(path.join(ROOT, 'boot.rofl'), 'utf8');
export const BLEEP = fs.readFileSync(path.join(HERE, 'bleep.rofl'), 'utf8');

/** boot.rofl is loaded for the audit relations only — this model has no
 *  negation at all, so stratification never has anything to say. */
export function world(): Rofl {
  const r = new Rofl();
  const b = r.load(BOOT);
  if (!b.ok) throw new Error('bleep: boot failed\n' + b.diagnostics.join('\n'));
  const m = r.load(BLEEP);
  if (!m.ok) throw new Error('bleep: model failed\n' + m.diagnostics.join('\n'));
  return r;
}

// ---------------------------------------------------------------------------
// fact keys

/** `figure[main](returns,315000)` -> `figure`. */
export function relOf(key: string): string {
  return key.slice(0, key.indexOf('['));
}

/** `figure[main](returns,315000)` -> ['returns', '315000']. Every argument in
 *  this model is an atom or an integer, so no argument can contain a comma
 *  and splitting on one is exact. */
export function argsOf(key: string): string[] {
  const open = key.indexOf('(');
  const inner = key.slice(open + 1, key.length - 1);
  return inner === '' ? [] : inner.split(',');
}

export const keyOf = (rel: string, ...args: (string | number)[]): string =>
  `${rel}[main](${args.join(',')})`;

// ---------------------------------------------------------------------------
// THE EDGE LABEL
//
// This is the whole of BLEEP's domain input, and it is a function of a
// FIRING, never of a fact. `says(ops_chat, returns, 315000)` is a clean fact
// — the chat message exists and the record of it is not in doubt. What is in
// doubt is the step from "the channel said it" to "the number is 315000",
// and that step is a hyperedge. evaluateSemiring's `weight(key, witness)`
// hook is exactly that slot.

/** The declared trust of each channel, read out of the model. */
export function channelTrust(r: Rofl): Map<string, Trust> {
  const level: Record<string, Trust> = {
    clean: CLEAN, dubious: DUBIOUS, dirty: DIRTY, forbidden: FORBIDDEN,
  };
  const out = new Map<string, Trust>();
  for (const row of r.query('trust(S, L)').rows) {
    const l = level[row.bindings.L];
    if (l === undefined) throw new Error(`bleep: unknown trust level ${row.bindings.L}`);
    out.set(row.bindings.S, l);
  }
  return out;
}

/** Verification promotes a channel to `clean` — but never a forbidden one.
 *  An embargo is a permission, not a doubt, and no amount of checking lifts
 *  it. That is why `offers` below does not put such a channel on the list. */
export function trustOf(base: Map<string, Trust>, ch: string, verified: ReadonlySet<string>): Trust {
  const t = base.get(ch);
  if (t === undefined) throw new Error(`bleep: no trust declared for ${ch}`);
  if (t === FORBIDDEN) return FORBIDDEN;
  return verified.has(ch) ? CLEAN : t;
}

/** The label of one derivation edge: min over the licences its premises
 *  carry. A firing whose premises carry none is a plain inference step and
 *  contributes `one` = clean — the arithmetic adds no doubt of its own.
 *
 *  Three licences exist in this model:
 *    says(S, …)          the step from "S said it" to "it is so"
 *    restates(S, …)      the step through an echo
 *    rule_of_thumb(…)    the estimate: doubt that lives in the STEP, since
 *                        both premises of that rule are clean facts */
export function edgeTrust(
  r: Rofl, verified: ReadonlySet<string> = new Set(),
): (key: string, w: Witness) => Trust {
  const base = channelTrust(r);
  return (_key: string, w: Witness): Trust => {
    let label: Trust = CLEAN;
    for (const p of w.prems) {
      if (p.t !== 'fact') continue;
      const rel = relOf(p.key);
      if (rel === 'says' || rel === 'restates') {
        label = trustSemiring.times(label, trustOf(base, argsOf(p.key)[0], verified));
      } else if (rel === 'rule_of_thumb') {
        label = trustSemiring.times(label, DUBIOUS);
      }
    }
    return label;
  };
}

/** The fold. Base facts keep the default `one` = clean: a record of what was
 *  said is not itself doubtful. */
export function trustFold(r: Rofl, verified: ReadonlySet<string> = new Set()) {
  return evaluateSemiring(r.store, trustSemiring, { weight: edgeTrust(r, verified) });
}

/** Independent CLEAN routes: the counting semiring with every non-clean edge
 *  annihilated, so a derivation counts only if every step on it is clean. */
export function cleanRouteFold(r: Rofl, verified: ReadonlySet<string> = new Set()) {
  const label = edgeTrust(r, verified);
  return evaluateSemiring(r.store, countingSemiring, {
    weight: (k, w) => (label(k, w) === CLEAN ? 1n : 0n),
  });
}

// ---------------------------------------------------------------------------
// one derivation edge, evaluated

export interface Route {
  w: Witness;
  label: Trust;               // the edge's own level
  prems: { key: string; value: Trust }[];
  value: Trust;               // label ⊗ ⊗ premises — what this route delivers
}

export function routesOf(
  r: Rofl, fold: Map<string, Trust>, label: (k: string, w: Witness) => Trust, key: string,
): Route[] {
  return r.store.witnessesOf(key).map((w) => {
    const l = label(key, w);
    const prems = w.prems.filter((p) => p.t === 'fact')
      .map((p) => ({ key: (p as { key: string }).key, value: fold.get((p as { key: string }).key) ?? FORBIDDEN }));
    let v: Trust = l;
    for (const p of prems) v = trustSemiring.times(v, p.value);
    return { w, label: l, prems, value: v };
  });
}

/** The route ⊕ actually chose: the best one, ties to the first in canonical
 *  firing order. */
export function bestRoute(rs: Route[]): Route | undefined {
  let best: Route | undefined;
  for (const rt of rs) if (best === undefined || rt.value > best.value) best = rt;
  return best;
}

// ---------------------------------------------------------------------------
// QUERY 1 — why is this value redacted: which link is dirty
//
// Descend the winning route at every step and take its worst part. Either
// the edge itself is the bottleneck — and then the edge names the channel,
// and the walk is over — or one of its premises is, and the walk goes on
// into that premise. What comes back is the chain of blame: the shortest
// honest answer to "which link is dirty and why".

export interface BlameStep {
  key: string;
  value: Trust;
  edge: Trust;
  /** the licence premise that set the edge's level, when the edge is the
   *  bottleneck; empty while the walk is still descending */
  licence: string;
}

export function blame(
  r: Rofl, fold: Map<string, Trust>, label: (k: string, w: Witness) => Trust, key: string,
): BlameStep[] {
  const out: BlameStep[] = [];
  const seen = new Set<string>();
  let cur = key;
  for (;;) {
    if (seen.has(cur)) return out;          // a cycle cannot be the culprit
    seen.add(cur);
    const value = fold.get(cur) ?? FORBIDDEN;
    const best = bestRoute(routesOf(r, fold, label, cur));
    if (best === undefined) {               // a base fact: the walk bottoms out
      out.push({ key: cur, value, edge: CLEAN, licence: '' });
      return out;
    }
    let worstPrem = best.prems[0];
    for (const p of best.prems) if (p.value < worstPrem.value) worstPrem = p;
    const premFloor = worstPrem === undefined ? CLEAN : worstPrem.value;
    if (best.label <= premFloor) {
      const licence = best.w.prems.find(
        (p) => p.t === 'fact' && ['says', 'restates', 'rule_of_thumb'].includes(relOf(p.key)));
      out.push({
        key: cur, value, edge: best.label,
        licence: licence && licence.t === 'fact' ? licence.key : '',
      });
      return out;
    }
    out.push({ key: cur, value, edge: best.label, licence: '' });
    cur = worstPrem.key;
  }
}

// ---------------------------------------------------------------------------
// QUERY 3 — what gets laundered if I verify source X
//
// The inverse query, and the practical one: it says which single check to
// perform to clean the most conclusions. Nothing is asserted into the store
// and no rule changes — verification is a change to the LABELS, and the
// labels live on the edges, so one re-fold answers it. That is the payoff of
// keeping them off the nodes.

export interface Offer {
  channel: string;
  was: Trust;
  /** facts whose level strictly improves, in sorted key order */
  improved: string[];
  /** of those, the ones that reach `clean` */
  cleaned: string[];
  /** the printed report's own lines that reach `clean`, in report order —
   *  the number a person acts on */
  reportCleaned: string[];
}

/** Channels a check could actually move: the doubted ones. A clean channel
 *  has nothing to confirm and a forbidden one is not a doubt. */
export function offers(r: Rofl): string[] {
  const base = channelTrust(r);
  return [...base].filter(([, t]) => t === DIRTY || t === DUBIOUS)
    .map(([c]) => c).sort();
}

export function launderingPriority(
  r: Rofl, before: Map<string, Trust>, verified: ReadonlySet<string> = new Set(),
): Offer[] {
  const base = channelTrust(r);
  const rows = reportRows(r, before);
  const out: Offer[] = [];
  for (const ch of offers(r)) {
    if (verified.has(ch)) continue;
    const after = trustFold(r, new Set([...verified, ch])).value;
    const improved: string[] = [];
    const cleaned: string[] = [];
    for (const [k, v] of after) {
      const was = before.get(k) ?? FORBIDDEN;
      if (v > was) {
        improved.push(k);
        if (v === CLEAN) cleaned.push(k);
      }
    }
    const reportCleaned = rows
      .filter((row) => row.trust !== CLEAN && (after.get(row.key) ?? FORBIDDEN) === CLEAN)
      .map((row) => row.label);
    out.push({ channel: ch, was: base.get(ch)!, improved, cleaned, reportCleaned });
  }
  // most report lines cleaned first; the channel name breaks ties, so the
  // ranking is a function of the data alone
  return out.sort((a, b) => b.reportCleaned.length - a.reportCleaned.length
    || b.cleaned.length - a.cleaned.length
    || (a.channel < b.channel ? -1 : 1));
}

// ---------------------------------------------------------------------------
// the report, redacted

/** The rows of the printed report, in reading order: the inputs the channels
 *  carry, then what the report computes from them. */
export const INPUTS = ['gross_revenue', 'returns', 'cogs', 'payroll', 'shipping',
  'fx_rate', 'headcount'];
export const DERIVED = ['net_revenue', 'opex', 'operating_profit', 'margin_pct',
  'refund_rate', 'cogs_eur', 'revenue_per_head'];

export interface Row { label: string; key: string; value: string; trust: Trust; }

export function reportRows(r: Rofl, fold: Map<string, Trust>): Row[] {
  const rows: Row[] = [];
  for (const m of INPUTS) {
    const hit = r.query(`figure(${m}, V)`).rows;
    if (hit.length !== 1) throw new Error(`bleep: ${m} has ${hit.length} figures`);
    const key = keyOf('figure', m, hit[0].bindings.V);
    rows.push({ label: m, key, value: hit[0].bindings.V, trust: fold.get(key) ?? FORBIDDEN });
  }
  for (const rel of DERIVED) {
    const hit = r.query(`${rel}(N)`).rows;
    if (hit.length !== 1) throw new Error(`bleep: ${rel} has ${hit.length} values`);
    const key = keyOf(rel, hit[0].bindings.N);
    rows.push({ label: rel, key, value: hit[0].bindings.N, trust: fold.get(key) ?? FORBIDDEN });
  }
  return rows;
}

/** The display. Not an error message and not a warning: the value is simply
 *  not shown, and the level says why. Anyone who reads one of these
 *  understands provenance without further explanation. */
export const BLOCK: Record<Trust, string> = {
  [CLEAN]: '', [DUBIOUS]: '▒▒▒▒',
  [DIRTY]: '████', [FORBIDDEN]: '████████',
};

export function redact(value: string, t: Trust): string {
  return t === CLEAN ? group(value) : BLOCK[t];
}

/** 4200000 -> 4 200 000. Thin grouping, no locale. */
export function group(n: string): string {
  const neg = n.startsWith('-');
  const d = neg ? n.slice(1) : n;
  let out = '';
  for (let i = 0; i < d.length; i++) {
    if (i > 0 && (d.length - i) % 3 === 0) out += ' ';
    out += d[i];
  }
  return (neg ? '-' : '') + out;
}

/** `min(clean, dirty) = dirty` — the arithmetic that produced a row, written
 *  out. For a fact with more than one route, the ⊕ that chose between them
 *  is written out too. */
export function explain(
  r: Rofl, fold: Map<string, Trust>, label: (k: string, w: Witness) => Trust, key: string,
): string {
  const rs = routesOf(r, fold, label, key);
  if (rs.length === 0) return 'axiom';
  if (rs.length === 1) {
    const uniq = [...new Set([renderTrust(rs[0].label), ...rs[0].prems.map((p) => renderTrust(p.value))])];
    // every part of the route at the same level: the min says nothing to read
    return uniq.length === 1 ? uniq[0] : `min(${uniq.join(', ')}) = ${renderTrust(rs[0].value)}`;
  }
  // more than one route: the interesting operator is the ⊕ between them, and
  // routeBreakdown prints the ⊗ inside each when a reader wants it
  return `max(${rs.map((rt) => renderTrust(rt.value)).join(', ')}) `
    + `= ${renderTrust(bestRoute(rs)!.value)}`;
}

/** The ⊗ inside each route into one fact, one line per hyperedge. This is
 *  where "the same fact, two different edges" is visible as text. */
export function routeBreakdown(
  r: Rofl, fold: Map<string, Trust>, label: (k: string, w: Witness) => Trust, key: string,
): string[] {
  return routesOf(r, fold, label, key).map((rt) => {
    const licence = rt.w.prems.find(
      (p) => p.t === 'fact' && ['says', 'restates', 'rule_of_thumb'].includes(relOf(p.key)));
    const via = licence && licence.t === 'fact' ? licence.key : '(no licence: a plain step)';
    const terms = [renderTrust(rt.label), ...rt.prems.map((p) => renderTrust(p.value))];
    return `    via ${via.padEnd(46)} min(${terms.join(', ')}) = ${renderTrust(rt.value)}`;
  });
}

/** Which channels a fact's derivation rests on, for the source column. */
export function sourcesOf(r: Rofl, key: string): string[] {
  const out = new Set<string>();
  const seen = new Set<string>();
  const walk = (k: string) => {
    if (seen.has(k)) return;
    seen.add(k);
    const rel = relOf(k);
    if (rel === 'says' || rel === 'restates') { out.add(argsOf(k)[0]); return; }
    if (rel === 'rule_of_thumb') { out.add('rule of thumb'); return; }
    for (const w of r.store.witnessesOf(k)) {
      for (const p of w.prems) if (p.t === 'fact') walk(p.key);
    }
  };
  walk(key);
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// the transcript

const WIDTH = 78;

function renderReport(
  r: Rofl, fold: Map<string, Trust>, label: (k: string, w: Witness) => Trust,
): string {
  const rows = reportRows(r, fold);
  const out: string[] = [];
  for (const row of rows) {
    if (row.label === DERIVED[0]) out.push('  ' + '-'.repeat(WIDTH - 4));
    out.push('  ' + row.label.padEnd(18)
      + redact(row.value, row.trust).padStart(11) + '   '
      + `[${renderTrust(row.trust)}]`.padEnd(12)
      + explain(r, fold, label, row.key));
  }
  return out.join('\n');
}

function main(): void {
  const say = (s: string = '') => { console.log(s); };
  const rule = (title: string) => say(('== ' + title + ' ').padEnd(WIDTH, '='));

  const r = world();
  const label = edgeTrust(r);
  const fold = trustFold(r);
  const value = fold.value;

  say('BLEEP — distrust propagation as multiplication in a semiring');
  say();
  say('model   examples/bleep/bleep.rofl — a quarterly report');
  say(`facts   ${r.store.relCount('says')} channel claims, ${r.store.facts.size} facts in `
  + `the store with boot.rofl's reflection layer`);
  say('carrier clean > dubious > dirty > forbidden, four elements');
  say('        (X) = min along a chain, (+) = max across alternatives');
  say(`fold    ${fold.rounds} rounds, converged=${fold.converged}, `
    + `disciplineHeld=${fold.disciplineHeld}, ${fold.cyclic} facts on a cycle`);
  say();
  say('Nothing in bleep.rofl carries a level. The rules compute the report;');
  say('the levels are the value of each fact under the lattice, folded over the');
  say('support hypergraph the kernel recorded while computing it.');
  say();

  // -- 1 --------------------------------------------------------------------
  rule('1. the report, as it may be shown');
  say('Not an error. The value is not printed because it rests on something');
  say('nobody checked, and the right-hand column is the arithmetic that says so.');
  say();
  say(renderReport(r, value, label));
  say();
  const rows = reportRows(r, value);
  const byLabel = new Map(rows.map((x) => [x.label, x]));
  say('Two of those rows have MORE THAN ONE EDGE into them, and the column above');
  say('only shows what max chose. The edges themselves:');
  say();
  for (const m of ['shipping', 'net_revenue']) {
    say(`  ${m}`);
    for (const l of routeBreakdown(r, value, label, byLabel.get(m)!.key)) say(l);
  }
  say();
  say('shipping is laundering: two channels carry the same number, one of them a');
  say('system of record, so max takes the clean route and the figure prints.');
  say('net_revenue is the other half of the same story — its exact route runs');
  say('through a chat message and is dirty, its rule-of-thumb route runs through');
  say('clean inputs but an inexact STEP and is dubious, and max keeps the better.');
  say();
  say('headcount is not doubted, it is EMBARGOED, and forbidden is the semiring');
  say('zero: a fact whose every route is forbidden is annotated exactly like a');
  say('fact with no route at all. That is also the veto — an action resting on');
  say('this basis has no admissible derivation, which is a fact about the algebra');
  say('and not a heuristic about the text.');
  say();

  // -- 2 --------------------------------------------------------------------
  rule('2. why: which link is dirty');
  const target = byLabel.get('refund_rate')!;
  say(`refund_rate prints as ${BLOCK[target.trust]}. The kernel's own derivation tree:`);
  say();
  say(r.why(`refund_rate(${target.value})`).text);
  say();
  say('and the same tree with the lattice folded over it, descending the route');
  say('(+) chose and taking its worst part at every step:');
  say();
  for (const step of blame(r, value, label, target.key)) {
    const tail = step.licence === ''
      ? `worst premise below`
      : `EDGE is ${renderTrust(step.edge)}, licensed by ${step.licence}`;
    say(`  ${step.key.padEnd(42)} ${renderTrust(step.value).padEnd(10)} ${tail}`);
  }
  say();
  say('The chain ends on an edge, not on a fact, and that is the point: the fact');
  say('says(ops_chat, returns, 315000) is CLEAN — the message exists and the');
  say('record of it is not in doubt. The dirty thing is the step from "the chat');
  say('said it" to "returns are 315000".');
  say();

  // -- 3 --------------------------------------------------------------------
  rule('3. whynot: what must be confirmed to launder it');
  say('`clean_route(M, V)` is the structural precondition: some system of record');
  say('carries this number directly. Ask why it fails for the dirty input.');
  say();
  const returns = byLabel.get('returns')!;
  say(`$ whynot clean_route(returns, ${returns.value})`);
  const wn = r.whynot(`clean_route(returns, ${returns.value})`, { depth: 3, nodes: 24 });
  say(wn.text);
  say();
  say('The failing premise is the whole answer: trust(ops_chat, clean) is what is');
  say('missing. Confirm ops_chat, or find a system of record that carries 315000.');
  say();
  say('And the contrast that shows corroboration is not the same as cleanliness:');
  for (const m of ['shipping', 'headcount']) {
    const row = byLabel.get(m)!;
    const carriers = sourcesOf(r, row.key);
    say(`  ${m.padEnd(10)} carried by ${carriers.length} channel(s) — ${carriers.join(', ')}`
      + ` — clean_route ${r.holds(`clean_route(${m}, ${row.value})`) ? 'holds' : 'FAILS'}`
      + `, level ${renderTrust(row.trust)}`);
  }
  say();

  // -- 4 --------------------------------------------------------------------
  rule('4. what gets laundered if I verify source X');
  say('The inverse query, and the practical one. Nothing is asserted and no rule');
  say('changes: verification moves an EDGE LABEL, so one re-fold answers it. This');
  say('is verification priority, derived rather than guessed.');
  say();
  const ranking = launderingPriority(r, value);
  for (const o of ranking) {
    say(`  ${`verify ${o.channel} (${renderTrust(o.was)})`.padEnd(30)}`
      + `-> ${o.reportCleaned.length} report line(s) clean,`
      + ` ${o.cleaned.length} facts in all`);
    say(`       ${o.reportCleaned.join(', ')}`);
  }
  say();
  const [first, second] = ranking;
  const carries = (ch: string) => r.query(`says(${ch}, M, _)`).rows
    .map((x) => x.bindings.M).sort().join(', ');
  say(`Do ${first.channel} first: ${first.reportCleaned.length} lines against`
    + ` ${second.reportCleaned.length}. And note what is NOT`);
  say(`on ${second.channel}'s list. It carries ${carries(second.channel)}, yet`);
  say('confirming it cleans nothing for shipping — shipping already has a second,');
  say('clean carrier, so there is nothing left there to launder. Nobody guessed');
  say('that; it fell out of the fold.');
  say();
  say('A forbidden channel is not on this list at all. An embargo is a permission,');
  say('not a doubt, and no amount of checking lifts it.');
  say();

  // -- 5 --------------------------------------------------------------------
  rule('5. counting: how many independent clean routes');
  say('The counting semiring with every non-clean edge annihilated, so a');
  say('derivation is counted only if every step of it is clean.');
  say();
  const routes = cleanRouteFold(r).value;
  for (const row of rows) {
    say(`  ${row.label.padEnd(18)}${renderCount(routes.get(row.key) ?? 0n).padStart(4)}`
      + `   ${renderTrust(row.trust)}`);
  }
  say();
  say('The count reads a FIFTH way across this example set. In NOPE and OOPS it');
  say('is robustness, in AKA ambiguity, in SPAT fragility; here it is');
  say('LAUNDERABILITY. Zero means there is nothing in the model to launder with,');
  say('and a human has to go and check a source. The number is the same metric');
  say('every time; which of the five it means belongs to the instance.');
  say();

  // -- 6 --------------------------------------------------------------------
  rule('6. the echo chamber: a real cycle, and why BOUNDED holds');
  say('ops_chat and vendor_email each restate the other, so stands_behind rests on');
  say('itself through the loop. That is a cycle of the support hypergraph, not of');
  say('the rules only:');
  say();
  const echoKey = keyOf('stands_behind', 'ops_chat', 'shipping', '180000');
  const counts = evaluateSemiring(r.store, countingSemiring).value;
  say(`  counting   ${echoKey}`);
  say(`             ${renderCount(counts.get(echoKey)!)} — arithmetically right,`
    + ' epistemically absurd');
  say(`  trust      ${renderTrust(value.get(echoKey)!)} — the loop adds nothing,`
    + ' because going round it');
  say('             can only take min against a value already seen');
  say();
  say(`The fold declared BOUNDED and stopped after ${fold.rounds} rounds with`);
  say(`${fold.cyclic} facts on a cycle and disciplineHeld=${fold.disciplineHeld}. `
    + 'No closure operator, no depth');
  say('cap: a four-element lattice has finite height and every value starts at');
  say('forbidden and only ever rises, so the chain has nowhere to run.');
  say();

  // -- 7 --------------------------------------------------------------------
  rule('7. before and after one verification');
  const winner = ranking[0].channel;
  say(`$ verify ${winner}`);
  say();
  const after = trustFold(r, new Set([winner])).value;
  say(renderReport(r, after, edgeTrust(r, new Set([winner]))));
  say();
  const moved = rows.filter((row) => (after.get(row.key) ?? FORBIDDEN) > row.trust);
  say(`${moved.length} report line(s) moved on one reconciliation:`);
  for (const row of moved) {
    say(`  ${row.label.padEnd(18)}${renderTrust(row.trust)} -> `
      + renderTrust(after.get(row.key)!));
  }
  const stuck = rows.filter((row) => (after.get(row.key) ?? FORBIDDEN) !== CLEAN);
  say();
  say(`still not clean: ${stuck.map((x) => x.label).join(', ')}. The first two need`);
  say('the vendor, and the last two rest on the embargoed headcount, which no');
  say('reconciliation reaches. One check moved five lines; the next one moves two.');
  say();
  say('='.repeat(WIDTH));
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1]
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();
