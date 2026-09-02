// demo.ts — CRAM: a flight computer that must fit its own future in a box.
//
//   node --experimental-strip-types examples/cram/demo.ts
//
// Nothing in the transcript is composed by hand; README.md pastes this
// program's stdout. Every claim it makes is checked a second time by something
// that is not the rules re-run:
//
//   the store is smaller        against the DOMAIN state of both runs compared
//                               byte for byte — pruning that changed an answer
//                               would show up there, and the comparison is
//                               shown able to report a difference
//   the leak is linear          against a slope measured over the run, not
//                               against a constant chosen to fit
//   the window                  against the SAME tick in the unpruned run,
//                               which is what tells "pruned" from "never fired"
//   the second gate             against the same pair of runs on the program
//                               WITHOUT the provenance-reading rules, where the
//                               two stores do differ
//   the lie the gate prevents   by performing the forbidden sweep by hand on a
//                               copy and reading the answer that moves
//   the cost of reuse           in the kernel's own step counter, which is
//                               exact — and the cost of `naive`, which that
//                               counter cannot see at all, in wall clock over
//                               three runs with the load average printed
//
// WHY THIS EXAMPLE EXISTS. `retainTicks` and `reuse` were the two flags of the
// public API that no example ran (`npm run flagcheck`). Both are memory and
// work policies, which is exactly the class that hides from correctness gates:
// the goldens do not move, the suite stays green, and a flag nothing exercises
// cannot go red.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const CRAM = read('examples', 'cram', 'cram.rofl');
export const LOG = read('examples', 'cram', 'flight_log.rofl');

/** The demo's own bookkeeping budget, generous: it is not the craft's. */
export const BUDGET = 4_000_000;

/** How long the mission runs in the transcript. Eight ticks is enough to see
 *  the slope and to have a window with an inside and an outside. */
export const TICKS = 8;

/** The naive/seminaive pair runs shorter and three times, because it is the
 *  one measurement here made in wall clock rather than in firings. */
export const REPS = 3;
export const REP_TICKS = 5;

/** Sensors per bus packet, and packets per tick. Four evaluations a tick is
 *  what gives `reuse` anything to keep: see cram.rofl §2. */
export const PER_PACKET = 6;
export const PACKETS = 4;

// ===========================================================================
// THE MISSION
// ===========================================================================

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`cram: ${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

export interface Opts { naive?: boolean; reuse?: boolean; retainTicks?: number }

/** boot.rofl + cram.rofl, and the flight log when the ground asked for it.
 *
 *  boot.rofl is here for real work — its audits judge these rules — and it is
 *  also the only rule-shaped layer in the program, which makes it the only
 *  thing `reuse` has to keep. MEASURED at kernel digest ee3693f08a33, eight ticks:
 *  without boot.rofl loaded, reuse on and reuse off spend the identical 5638
 *  firings, because every relation the craft declares is a function of
 *  `reading` and `reading` moves every packet.
 *  A demo of `reuse` that did not load boot.rofl would measure zero and
 *  conclude the flag does nothing. */
export function head(opts: Opts = {}, withLog = false): Rofl {
  const r = new Rofl(opts);
  must(r.load(BOOT, { budget: BUDGET }), 'boot.rofl');
  must(r.load(CRAM, { who: 'craft', budget: BUDGET }), 'cram.rofl');
  if (withLog) must(r.load(LOG, { who: 'ground', budget: BUDGET }), 'flight_log.rofl');
  return r;
}

/** The bus schedule: reproducible arithmetic, not a recording. Every sensor is
 *  read every tick, in four packets of six, and the values walk so that the
 *  craft is mostly doing science and occasionally drops to `safe` — at these
 *  constants, zero or one sensor is out of limits on any given tick and the
 *  critical ones trip at ticks 0, 4 and 5 of the first eight.
 *
 *  CHOSEN, not found: a schedule where every tick alarms measures a craft on
 *  fire, and a craft on fire is a special case. The leak this example is about
 *  is the same either way — that is §4's point about the carry rules — but a
 *  transcript that never shows `science` cannot show that it is the same. */
export function packet(tick: number, p: number): string {
  const out: string[] = [];
  for (let i = p * PER_PACKET; i < (p + 1) * PER_PACKET; i++) {
    out.push(`reading[bus](s${i}, ${40 + ((i * 5 + tick * 11) % 27)}).`);
  }
  return out.join(' ');
}

/** One sample of the gauge, taken AT FIXPOINT and before the world advances —
 *  which is the only moment the tick's own derived layer still exists. This is
 *  what `onFixpoint` is for, and taking the sample after `tickAdvance` instead
 *  would measure a different store and quietly call it the same one. */
export interface Sample {
  tick: number; facts: number; prov: number; domain: number; posture: string;
  /** How many facts of each relation the store holds at this boundary. One
   *  pass over the store per tick, which is what turns "the store grows" into
   *  "these four relations grow and the rest do not". */
  rels: Record<string, number>;
}

export interface Run {
  r: Rofl;
  label: string;
  samples: Sample[];
  /** Firings, summed over every evaluation of the run. The kernel's own meter:
   *  `store.evalOf` records the last evaluation of each tick, so it is read
   *  after each one and accumulated rather than read once at the end. */
  steps: number;
  ms: number;
  facts: number;
  prov: number;
}

export function runCraft(opts: Opts = {}, ticks = TICKS, withLog = false, label = ''): Run {
  const r = head(opts, withLog);
  if (withLog) {
    must(r.load(Array.from({ length: ticks + 1 }, (_, t) => `tick_no[log](${t}).`).join(' '),
      { who: 'ground', budget: BUDGET }), 'the ground\'s tick roster');
  }
  const samples: Sample[] = [];
  let steps = 0;
  let seen: unknown = null;
  const meter = () => {
    const cur = r.store.evalOf(r.store.tick);
    if (cur && cur !== seen) { steps += cur.steps; seen = cur; }
  };
  const t0 = Date.now();
  for (let t = 0; t < ticks; t++) {
    for (let p = 0; p < PACKETS; p++) {
      must(r.load(packet(t, p), { who: 'bus', budget: BUDGET }), `packet ${p} of tick ${t}`);
      const q = r.query('posture[bus](P)', { budget: BUDGET });
      if (q.error) throw new Error(`cram: posture: ${q.error}`);
      meter();
    }
    r.tickAdvance({
      budget: BUDGET,
      onFixpoint: (x) => {
        meter();
        const prov = x.store.relCount('derived_by');
        const posture = x.query('posture[bus](P)', { budget: BUDGET }).rows.map((row) => row.bindings.P).join('/');
        const rels: Record<string, number> = {};
        for (const f of x.store.allFacts()) rels[f.rel] = (rels[f.rel] ?? 0) + 1;
        samples.push({ tick: x.store.tick, facts: x.store.factCount(), prov, domain: x.store.factCount() - prov, posture, rels });
      },
    });
    meter();
  }
  return {
    r, label, samples, steps, ms: Date.now() - t0,
    facts: r.store.factCount(), prov: r.store.relCount('derived_by'),
  };
}

// ===========================================================================
// THE INSTRUMENTS
// ===========================================================================

/** Every fact that is NOT provenance, canonically ordered. Two runs that agree
 *  here agree about everything the program can conclude; the provenance is the
 *  only thing a retention policy is allowed to touch. A string rather than a
 *  count, because a count agrees by accident. */
export function domainState(r: Rofl): string {
  return r.store.allFacts().filter((f) => f.rel !== 'derived_by').map((f) => f.key).sort().join('\n');
}

/** Which completed ticks the store can still be asked about, and how many
 *  records each answer rests on. The question is put to the HOST query
 *  surface, not to a rule: `readsProvenance` reads the loaded rules, so asking
 *  from outside leaves the policy exactly as it was. */
export function window(r: Rofl, upTo: number): { tick: number; rows: number }[] {
  const out: { tick: number; rows: number }[] = [];
  for (let t = 0; t <= upTo; t++) {
    const q = r.query(`derived_by(F, R, ${t})`, { budget: BUDGET });
    if (q.error) throw new Error(`cram: window at ${t}: ${q.error}`);
    out.push({ tick: t, rows: q.rows.length });
  }
  return out;
}

/** THE FORBIDDEN SWEEP, performed by hand so that §8 can show what the
 *  kernel's refusal is protecting. Drops every completed-tick provenance
 *  record straight out of the store — which is what a host had to do before
 *  the policy existed, and what the policy declines to do for a program that
 *  reads `derived_by`. Returns how many records went. */
export function sweepProvenance(r: Rofl): number {
  const doomed: string[] = [];
  for (const f of r.store.allFacts()) {
    if (f.rel !== 'derived_by') continue;
    const t = f.args[2];
    if (t.k === 'i' && t.v < r.store.tick) doomed.push(f.key);
  }
  for (const k of doomed) r.store.remove(k);
  r.store.dirty = true;
  return doomed.length;
}

/** How many facts each tick added to the store, and how many of those were
 *  provenance. Increments rather than a fitted line, because the fitted line
 *  turned out to be the wrong model: MEASURED below, the increments are not
 *  constant, they RISE. A least-squares slope would have reported that as a
 *  residual and invited someone to widen the tolerance until it passed. */
export function increments(samples: Sample[]): { tick: number; facts: number; prov: number }[] {
  const out: { tick: number; facts: number; prov: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    out.push({
      tick: samples[i].tick,
      facts: samples[i].facts - samples[i - 1].facts,
      prov: samples[i].prov - samples[i - 1].prov,
    });
  }
  return out;
}

/** The mean of the increments after the first, which is the warm-up: at tick 0
 *  nothing has been carried forward yet and the store is not yet the store it
 *  will be. */
export const meanOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Which relations grew between two boundaries, largest first. This is what
 *  turns "the store grows" into a claim about named relations — and it is how
 *  the assertion ledger was found, which no flag in this example bounds. */
export function growth(from: Sample, to: Sample): { rel: string; from: number; to: number; per: number }[] {
  const span = to.tick - from.tick;
  return Object.keys(to.rels)
    .map((rel) => ({ rel, from: from.rels[rel] ?? 0, to: to.rels[rel], per: (to.rels[rel] - (from.rels[rel] ?? 0)) / span }))
    .filter((x) => x.per !== 0)
    .sort((a, b) => b.per - a.per);
}

/** THE EXCHANGE RATE. A box of B facts is spent on two things at once: how
 *  LONG the mission runs and how FAR BACK it can be asked about.
 *
 *  With `retainTicks: n` the store holds, at tick T, roughly
 *
 *      base + residual * T + n * prov
 *
 *  where `residual` is what leaks even under the policy (measured: the
 *  kernel's assertion ledger, ~100 facts a tick here) and `prov` is one tick
 *  of provenance (~1000). So the mission ends at
 *
 *      T = (B - base - n * prov) / residual
 *
 *  and the window is n. Unpruned is the n = T case, and it is why the same box
 *  buys ten times fewer ticks. The model is not asserted: demo.ts §9 predicts
 *  one run's store from two others and the prediction is exact. */
export function exchange(box: number, base: number, residual: number, prov: number, windows: number[]):
    { window: number; ticks: number }[] {
  return windows.map((n) => ({ window: n, ticks: Math.max(0, Math.floor((box - base - n * prov) / residual)) }));
}

// ===========================================================================
// THE TRANSCRIPT
// ===========================================================================

const lines: string[] = [];
export function say(s = ''): void { lines.push(s); console.log(s); }
const n = (x: number, w: number) => String(x).padStart(w);
const pad = (s: string, w: number) => s.padEnd(w);

export interface Check { ok: boolean; what: string }
export const checks: Check[] = [];
function check(what: string, ok: boolean): void {
  checks.push({ ok, what });
  say(`  oracle: ${ok ? 'AGREE' : 'DISAGREE'} — ${what}`);
}

/** WHICH KERNEL PRODUCED THESE NUMBERS. Every firing count below is a
 *  measurement of `src/` and `boot.rofl` as they stood when the transcript was
 *  taken, and both move. PAID FOR while writing this: two runs of this file
 *  twenty minutes apart reported `reuse` saving 1.75x and then saving nothing
 *  at all, because a change to the engine had landed in between and a change
 *  to boot.rofl landed after. Neither number was wrong and neither was about
 *  this example. A transcript without this line invites the reader to compare
 *  two measurements of different things. */
function kernelDigest(): string {
  const h = createHash('sha256');
  h.update(BOOT);
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).sort()) {
    if (f.endsWith('.ts')) h.update(read('src', f));
  }
  return h.digest('hex').slice(0, 12);
}

function main(): void {
  const load = os.loadavg().map((x) => x.toFixed(2)).join(' ');
  say('CRAM — a flight computer that must fit its own future in a box.');
  say(`  ${TICKS} ticks, ${PACKETS} bus packets a tick, node ${process.version}, load average ${load}`);
  say(`  measured against boot.rofl + src/ at digest ${kernelDigest()}`);
  say();

  // -------------------------------------------------------------------------
  // THE THREE RUNS, AND THEIR DOMAIN STATE READ BEFORE ANYTHING ASKS A
  // QUESTION. Paid for while writing this: `tickAdvance` leaves the store
  // dirty, so the first query after the last boundary BUILDS the next tick's
  // derived layer. §1 asks the craft four questions about itself; asking them
  // of one run and not the others made three identical stores compare unequal,
  // and the disagreement was in the instrument.
  const base = runCraft({}, TICKS, false, 'unpruned');
  const keep2 = runCraft({ retainTicks: 2 }, TICKS, false, 'retainTicks: 2');
  const keep0 = runCraft({ retainTicks: 0 }, TICKS, false, 'retainTicks: 0');
  const dBase = domainState(base.r), dKeep2 = domainState(keep2.r), dKeep0 = domainState(keep0.r);

  say('§1  THE CRAFT AND THE BOX');
  say();
  say('    tick   posture     facts     provenance   everything else');
  for (const s of base.samples) {
    say(`    ${n(s.tick, 4)}   ${pad(s.posture, 10)}${n(s.facts, 6)}${n(s.prov, 15)}${n(s.domain, 16)}`);
  }
  const craft = (q: string) => base.r.query(q, { budget: BUDGET }).rows.length;
  say();
  say(`    the craft does not grow: ${craft('sensor[bus](S, Sub)')} sensors, `
    + `${craft('subsystem[bus](Sub)')} subsystems, ${craft('segment[bus](G)')} bus segments,`);
  say(`    ${craft('feeds[bus](A, B)')} feed links — the same numbers at tick ${base.samples[base.samples.length - 1].tick} `
    + 'as at launch, because that is the craft.');
  say(`    the STORE grows: ${base.samples[0].facts} facts at tick ${base.samples[0].tick}, `
    + `${base.samples[base.samples.length - 1].facts} at tick ${base.samples[base.samples.length - 1].tick}.`);
  check('the modelled craft is fixed while the store is not',
    craft('sensor[bus](S, Sub)') === 24 && base.facts > base.samples[0].facts * 3);
  say();

  // -------------------------------------------------------------------------
  say('§2  THE TWO LEAKS');
  say();
  const inc = increments(base.samples);
  const first = base.samples[1], last = base.samples[base.samples.length - 1];
  say('    what grew between tick ' + first.tick + ' and tick ' + last.tick + ', per tick:');
  say();
  say('    relation                 tick ' + n(first.tick, 2) + '   tick ' + n(last.tick, 2) + '   per tick');
  for (const g of growth(first, last)) {
    say(`    ${pad(g.rel, 24)}${n(g.from, 7)}${n(g.to, 10)}${g.per.toFixed(1).padStart(11)}`);
  }
  const perFacts = meanOf(inc.map((x) => x.facts)), perProv = meanOf(inc.map((x) => x.prov));
  say();
  say(`    ${perFacts.toFixed(0)} facts a tick, of which ${perProv.toFixed(0)} are provenance `
    + `(${(100 * perProv / perFacts).toFixed(0)}%). The rest is the`);
  say('    kernel\'s ASSERTION LEDGER — `asserted_by`, `in_perspective`, `forged`, one');
  say('    triple per reading the bus publishes. Two leaks, and only one of them is what');
  say('    `retainTicks` is about. §3 measures what is left after the flag has done its');
  say('    work, because a flag that removes the larger term is not a flag that stops');
  say('    the store growing.');
  say();
  say('    AND THE LEAK ACCELERATES. The per-tick provenance is not a constant:');
  say(`      ${inc.map((x) => x.prov).join('  ')}`);
  say('    each tick mints more than the last, because the meta layer has a bigger');
  say('    ledger to chew on every tick. A straight line fitted to this reports a');
  say('    residual; the residual is the finding, not the noise.');
  check('provenance is the dominant term of the leak', perProv > perFacts * 0.8);
  check('and the per-tick provenance is strictly increasing, not constant',
    inc.every((x, i) => i === 0 || x.prov > inc[i - 1].prov));
  say();

  // -------------------------------------------------------------------------
  say('§3  THE POLICY: new Rofl({ retainTicks: n })');
  say();
  say('    run                     facts   provenance   everything else   firings');
  for (const run of [base, keep2, keep0]) {
    const d = run.facts - run.prov;
    say(`    ${pad(run.label, 20)}${n(run.facts, 8)}${n(run.prov, 13)}${n(d, 18)}${n(run.steps, 10)}`);
  }
  say();
  say(`    domain state, byte for byte: unpruned == retainTicks:2 == retainTicks:0 -> `
    + `${dBase === dKeep2 && dBase === dKeep0}`);
  check('pruning the provenance changes nothing the program can conclude',
    dBase === dKeep2 && dBase === dKeep0);
  check('and it changes nothing about the work either: same firings',
    base.steps === keep2.steps && base.steps === keep0.steps);
  // The comparison must be able to report a difference, or the equality above
  // is a fact about the comparison rather than about the policy.
  const other = runCraft({}, TICKS - 1, false, 'a shorter mission');
  check('POSITIVE CONTROL: the same comparison against a different run DIFFERS',
    domainState(other.r) !== dBase);
  say(`    the box: ${base.facts} facts unpruned, ${keep0.facts} at retainTicks:0 `
    + `— ${(base.facts / keep0.facts).toFixed(1)}x, and the difference is entirely the past.`);
  say();
  const incKeep0 = increments(keep0.samples);
  const residual = meanOf(incKeep0.map((x) => x.facts));
  say(`    WHAT IS LEFT. Under retainTicks: 0 the store still grows by `
    + `${residual.toFixed(0)} facts a tick:`);
  say();
  say('    relation                 tick ' + n(keep0.samples[1].tick, 2) + '   tick '
    + n(keep0.samples[keep0.samples.length - 1].tick, 2) + '   per tick');
  for (const g of growth(keep0.samples[1], keep0.samples[keep0.samples.length - 1])) {
    say(`    ${pad(g.rel, 24)}${n(g.from, 7)}${n(g.to, 10)}${g.per.toFixed(1).padStart(11)}`);
  }
  say();
  say(`    ${(perFacts / residual).toFixed(1)}x slower, and NOT zero. The flag bounds the provenance and`);
  say('    nothing else; the assertion ledger of the readings is out of its reach and out');
  say('    of this example\'s reach too, since the host has no API here that prunes it.');
  say('    A mission in a fixed box therefore still ends — later, by that factor. §9');
  say('    prices it.');
  check('the residual leak is real and much smaller than the one the flag removes',
    residual > 0 && residual < perFacts / 5);
  say();

  // -------------------------------------------------------------------------
  say('§4  WHAT THE WORK COSTS: new Rofl({ reuse: false }) and { naive: true }');
  say();
  const scratch = runCraft({ reuse: false }, TICKS, false, 'reuse: false');
  say(`    reuse on   ${n(base.steps, 8)} firings, ${n(base.ms, 6)} ms`);
  say(`    reuse off  ${n(scratch.steps, 8)} firings, ${n(scratch.ms, 6)} ms   `
    + `— ${(scratch.steps / base.steps).toFixed(2)}x the work`);
  check('reuse saves firings, exactly and reproducibly', scratch.steps > base.steps);
  check('and the answers do not move', domainState(scratch.r) === dBase);
  say();
  say('    `naive` is the other half of the same dial, and the kernel\'s meter is BLIND to it:');
  const reps: { naive: number; semi: number }[] = [];
  for (let i = 0; i < REPS; i++) {
    const a = runCraft({ naive: true, reuse: false }, REP_TICKS, false, 'naive');
    const b = runCraft({ naive: false, reuse: false }, REP_TICKS, false, 'seminaive');
    reps.push({ naive: a.ms, semi: b.ms });
    if (i === 0) {
      check('naive and seminaive perform the IDENTICAL firings — steps cannot see the difference',
        a.steps === b.steps);
      check('and reach the identical answers', domainState(a.r) === domainState(b.r));
    }
  }
  const mN = reps.reduce((x, y) => x + y.naive, 0) / REPS, mS = reps.reduce((x, y) => x + y.semi, 0) / REPS;
  say(`    over ${REPS} runs of ${REP_TICKS} ticks, reuse off, load average ${load}:`);
  say(`      naive: true   ${reps.map((x) => x.naive).join(' / ')} ms   mean ${mN.toFixed(0)}`);
  say(`      naive: false  ${reps.map((x) => x.semi).join(' / ')} ms   mean ${mS.toFixed(0)}`);
  say(`    ${(mN / mS).toFixed(2)}x on the clock, 1.00x in the budget. A step budget therefore does`);
  say('    not bound this cost at all, and nothing in the store records that it was paid.');
  check('naive costs wall clock while spending the identical budget', mN > mS);
  say();

  // -------------------------------------------------------------------------
  say('§5  THE WINDOW: which ticks can still be asked about');
  say();
  const wBase = window(base.r, TICKS), wKeep2 = window(keep2.r, TICKS), wKeep0 = window(keep0.r, TICKS);
  say('    tick    unpruned   retainTicks:2   retainTicks:0');
  for (let t = 0; t <= TICKS; t++) {
    say(`    ${n(t, 4)}${n(wBase[t].rows, 12)}${n(wKeep2[t].rows, 16)}${n(wKeep0[t].rows, 16)}`);
  }
  const live2 = wKeep2.filter((x) => x.rows > 0).map((x) => x.tick);
  const live0 = wKeep0.filter((x) => x.rows > 0).map((x) => x.tick);
  say();
  say(`    retainTicks: 2 at tick ${keep2.r.store.tick} answers about ticks ${live2.join(', ')} — `
    + 'the current one and the two before it.');
  say(`    retainTicks: 0 answers about tick ${live0.join(', ')} and nothing else.`);
  const now = keep2.r.store.tick;
  say('    THE ANSWER BREAKS AT n: "which rule concluded this, and when" is answerable');
  say(`    for T >= now - n, and for no earlier T. At n = 2 and now = ${now} that is T >= ${now - 2};`);
  say('    the boundary freezes BEFORE it increments, so n counts completed ticks and the');
  say('    tick being entered is never a candidate — the window is n + 1 ticks wide.');
  check('every tick answers in the unpruned run — so the missing rows are pruning, not silence',
    wBase.slice(0, TICKS).every((x) => x.rows > 0));
  check('retainTicks: 2 keeps exactly the current tick and the two before it',
    live2.join(',') === [now - 2, now - 1, now].join(','));
  check('retainTicks: 0 keeps exactly the current tick', live0.join(',') === String(now));
  say();

  // -------------------------------------------------------------------------
  say('§6  THE SILENCE: what a pruned store says, and what it means');
  say();
  const gone = keep0.r.query(`derived_by(F, R, 2)`, { budget: BUDGET });
  const never = keep0.r.query(`derived_by(F, R, 9999)`, { budget: BUDGET });
  say(`    tick 2 happened, and ${wBase[2].rows} rules fired in it (the unpruned run says so).`);
  say(`    asked of the pruned store:   derived_by(F, R, 2)     -> ${gone.rows.length} rows, no error`);
  say(`    asked about a tick that never happened: (F, R, 9999) -> ${never.rows.length} rows, no error`);
  say('    THE TWO ARE THE SAME ANSWER. The store cannot distinguish "no rule concluded');
  say('    anything then" from "that was before my window", and neither can the ground.');
  say('    What survives pruning is the craft\'s OWN memory — `latched[bus](Sub, T)` still');
  say('    names the tick a subsystem alarmed on, because that is a domain fact:');
  const latched = keep0.r.query('latched[bus](Sub, T)', { budget: BUDGET });
  say(`      ${latched.rows.map((x) => `${x.bindings.Sub}@${x.bindings.T}`).join('  ') || '(none this run)'}`);
  say('    Knowing WHEN a subsystem latched is not knowing WHICH RULE concluded it.');
  check('a pruned tick and a tick that never happened are indistinguishable',
    gone.rows.length === never.rows.length && gone.rows.length === 0 && !gone.error && !never.error);
  check('but the domain\'s own record of the past survives the prune',
    latched.rows.length > 0);
  say();

  // -------------------------------------------------------------------------
  say('§7  THE SECOND GATE: a program that reads its own provenance');
  say();
  const logBase = runCraft({}, TICKS, true, 'log, unpruned');
  const logKeep = runCraft({ retainTicks: 0 }, TICKS, true, 'log, retainTicks: 0');
  say('    run                        facts   provenance   firings');
  for (const run of [logBase, logKeep]) {
    say(`    ${pad(run.label, 24)}${n(run.facts, 7)}${n(run.prov, 13)}${n(run.steps, 10)}`);
  }
  say();
  say('    `retainTicks: 0` was asked for and NOTHING WAS PRUNED. flight_log.rofl reads');
  say('    `derived_by` in a rule body, so `Evaluation.readsProvenance` is true, and');
  say('    `Rofl.frozenRetention` returns undefined whatever the setting says.');
  say(`    The same predicate turns reuse off: ${logBase.steps} firings against `
    + `${base.steps} without the log — ${(logBase.steps / base.steps).toFixed(1)}x.`);
  check('with the log loaded, retainTicks changes NOTHING: the two stores are identical',
    logBase.facts === logKeep.facts && logBase.prov === logKeep.prov);
  check('POSITIVE CONTROL: without the log, the same pair of settings DOES differ',
    base.facts !== keep0.facts);
  check('the log program pays for reuse as well as for retention', logBase.steps > base.steps);
  say();

  // -------------------------------------------------------------------------
  say('§8  THE LIE THE GATE PREVENTS');
  say();
  const before = logBase.r.query('active[log](T)', { budget: BUDGET }).rows.map((x) => x.bindings.T);
  const quietBefore = logBase.r.query('quiet[log](T)', { budget: BUDGET }).rows.map((x) => x.bindings.T);
  const dropped = sweepProvenance(logBase.r);
  const after = logBase.r.query('active[log](T)', { budget: BUDGET }).rows.map((x) => x.bindings.T);
  const quietAfter = logBase.r.query('quiet[log](T)', { budget: BUDGET }).rows.map((x) => x.bindings.T);
  say(`    before the sweep:  active[log] = ${before.join(',')}   quiet[log] = ${quietBefore.join(',') || '(none)'}`);
  say(`    swept ${dropped} completed-tick records by hand, the way a host had to before the policy`);
  say(`    after the sweep:   active[log] = ${after.join(',')}   quiet[log] = ${quietAfter.join(',') || '(none)'}`);
  say();
  say('    `quiet[log](T)` did not go missing. It went TRUE. The store now asserts that');
  say('    the computer sat idle through ticks it worked through — a derivable fact');
  say('    changed, not a cache evicted. That is what the kernel refuses to do, and');
  say('    refusing it is why §7\'s two stores are the same size.');
  check('the sweep really removed something', dropped > 0);
  check('a fact the program derives about its own past MOVED', before.length !== after.length);
  check('and the movement is a falsehood being asserted, not an answer going missing',
    quietAfter.length > quietBefore.length);
  say();

  // -------------------------------------------------------------------------
  say('§9  THE BUDGET AS A DECISION, NOT A SETTING');
  say();
  // The model first, and then a run it did not see. `retainTicks: 2` holds the
  // current tick and the two before it, so its provenance should be exactly
  // the last three per-tick increments of the UNPRUNED run — a number computed
  // from a different store, not from this one.
  const provInc = [base.samples[0].prov, ...increments(base.samples).map((x) => x.prov)];
  const lastIdx = base.samples.length - 1;
  const predictedProv = provInc[lastIdx] + provInc[lastIdx - 1] + provInc[lastIdx - 2];
  const actualProv = keep2.samples[lastIdx].prov;
  const predictedFacts = keep0.samples[lastIdx].facts + (predictedProv - keep0.samples[lastIdx].prov);
  const actualFacts = keep2.samples[lastIdx].facts;
  say(`    the model says: store(n) = store(0) + the last n+1 ticks of provenance.`);
  say(`    predicted for retainTicks:2 at tick ${base.samples[lastIdx].tick}, from the OTHER two runs:`);
  say(`      provenance ${predictedProv}   facts ${predictedFacts}`);
  say(`    measured:`);
  say(`      provenance ${actualProv}   facts ${actualFacts}`);
  check('the store size of a third run is predicted exactly from two others',
    predictedProv === actualProv && predictedFacts === actualFacts);
  say();
  const B = 100_000;
  const provPer = provInc[lastIdx];
  const base0 = keep0.samples[lastIdx].facts - residual * base.samples[lastIdx].tick;
  say(`    So a box of B facts, with a residual leak of ${residual.toFixed(0)}/tick and `
    + `${provPer} per tick of`);
  say('    provenance, is spent on two things at once — how long the mission runs, and');
  say(`    how far back the ground can ask. At B = ${B.toLocaleString('en-US')}:`);
  say();
  say('    window (retainTicks)      mission ends at tick');
  for (const row of exchange(B, base0, residual, provPer, [0, 1, 2, 4, 8, 32])) {
    say(`    ${n(row.window, 12)}${n(row.ticks, 26)}`);
  }
  const unprunedLife = Math.floor((B - base.samples[lastIdx].facts + perFacts * base.samples[lastIdx].tick) / perFacts);
  say(`    ${pad('unpruned', 12)}${n(unprunedLife, 26)}`);
  say();
  say('    Read the column, not the flag: the box does not decide whether the craft');
  say(`    runs, it decides HOW FAR BACK IT CAN BE ASKED. Keeping everything costs `
    + `${(100 - 100 * unprunedLife / exchange(B, base0, residual, provPer, [0])[0].ticks).toFixed(0)}%`);
  say('    of the mission; keeping the last eight ticks costs under one percent of it.');
  say('    And the answer breaks exactly where §5 said: at window n, "which rule');
  say('    concluded this" is answerable for T >= now - n and for no earlier T.');
  check('keeping everything costs most of the mission', unprunedLife * 5 < exchange(B, base0, residual, provPer, [0])[0].ticks);
  check('and an eight-tick window costs almost none of it',
    exchange(B, base0, residual, provPer, [8])[0].ticks > exchange(B, base0, residual, provPer, [0])[0].ticks * 0.9);
  say();

  // -------------------------------------------------------------------------
  say('§10  THE POLICY SURVIVES A REBOOT');
  say();
  const saved = base.r.save();
  const rebooted = Rofl.fromSnapshot(saved, { retainTicks: 0 });
  const provAtReboot = rebooted.store.relCount('derived_by');
  must(rebooted.load(packet(TICKS, 0), { who: 'bus', budget: BUDGET }), 'the first packet after reboot');
  rebooted.query('posture[bus](P)', { budget: BUDGET });
  rebooted.tickAdvance({ budget: BUDGET });
  const provAfter = rebooted.store.relCount('derived_by');
  say(`    a probe reboots from a snapshot of the unpruned run: ${provAtReboot} provenance records`);
  say(`    restored with { retainTicks: 0 }, one tick later: ${provAfter}`);
  say('    The flag is on the constructor and on `fromSnapshot`, so a resumed mission');
  say('    resumes its policy. A snapshot taken before the policy existed is not a');
  say('    trap: the first boundary after the reboot collects the whole backlog.');
  check('the restored store carried the old provenance in', provAtReboot > 1000);
  check('and the first boundary under the policy dropped it', provAfter < provAtReboot / 4);
  say();

  // -------------------------------------------------------------------------
  const bad = checks.filter((c) => !c.ok);
  say(`ORACLES: ${checks.length - bad.length}/${checks.length} agree.`);
  for (const c of bad) say(`  DISAGREE — ${c.what}`);
  say();
  say(`total wall clock ${((Date.now() - T0) / 1000).toFixed(1)} s, load average at start ${load}`);
  if (bad.length > 0) process.exitCode = 1;
}

const T0 = Date.now();
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(HERE, 'demo.ts');
if (isMain) main();

export { lines };
