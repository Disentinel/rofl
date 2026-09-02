// demo.ts — IFFY: the amendment, before it is enacted. End to end.
//
//   node --experimental-strip-types examples/iffy/demo.ts
//
// Everything printed is computed by the kernel from examples/iffy/iffy.rofl
// over examples/jopa (§1-§8) and examples/nope (§9), except §10, which is a
// stopwatch and says so. Nothing in the transcript is composed by hand;
// README.md and page.html paste this output.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, tropicalSemiring, renderCount, INFINITE, type Count,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const read = (...p: string[]): string => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const IFFY = read('examples', 'iffy', 'iffy.rofl');
export const STATUTE = read('examples', 'iffy', 'statute.rofl');
export const POLICY = read('examples', 'iffy', 'policy.rofl');
export const JOPA = read('examples', 'jopa', 'jopa.rofl');
export const JOPA_FACTS = read('examples', 'jopa', 'facts.rofl');
export const JOPA_CALIB = read('examples', 'jopa', 'calibration.rofl');
export const NOPE = read('examples', 'nope', 'nope.rofl');

function ok(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what}: ${res.diagnostics.join('; ')}`);
}

// ---------------------------------------------------------------------------
// THE CASE CORPUS
//
// examples/jopa/facts.rofl carries four cases, written by hand and argued over
// in that example's README: c_ash, c_reed, c_vale, c_okoro. They are the real
// corpus and they stay in it unchanged.
//
// Four cases cannot carry a denominator, and "43 flipped" is not a measurement
// while "43 of 288" is. So the grid below adds one case file per combination
// of the three things the Act distinguishes — the peril alleged, the delay in
// giving notice, and what evidence the tribunal had. It is an ENUMERATION, not
// a sample: nothing is drawn from a distribution anybody would have to defend,
// and every count in this file is a count over the whole grid.

export const PERILS = ['fire', 'storm', 'escape_of_water', 'subsidence', 'flood'] as const;
export const DELAYS = [8, 14, 25, 41] as const;
export const BUNDLES: readonly (readonly [string, readonly (readonly [string, number])[]])[] = [
  ['brig',     [['fire_brigade_report', 95]]],
  ['brig_eng', [['fire_brigade_report', 95], ['engineer_report', 88]]],
  ['brig_wit', [['fire_brigade_report', 95], ['neighbour_statement', 60]]],
  ['met_acc',  [['met_office_report', 90], ['accelerant_traces', 85], ['cctv_still', 92]]],
  ['eng_tip',  [['engineer_report', 88], ['accelerant_traces', 80], ['anonymous_tip', 0]]],
  ['acc_only', [['accelerant_traces', 85]]],
  ['wit_only', [['neighbour_statement', 60]]],
] as const;

/** The day of the loss, fixed for every generated case: the grid varies the
 *  DELAY, and a second free variable would make the cross-tabs unreadable
 *  without making them say anything more. */
export const LOSS_DAY = 100;

export interface GridCase { id: string; peril: string; delay: number; bundle: string; }

/** The grid, as a list, so a caller can look a case up by its coordinates
 *  rather than by counting rows in the generator. */
export const GRID: GridCase[] = (() => {
  const out: GridCase[] = [];
  let n = 0;
  for (const peril of PERILS) for (const delay of DELAYS) for (const [bundle] of BUNDLES) {
    out.push({ id: `g_${String(++n).padStart(3, '0')}`, peril, delay, bundle });
  }
  return out;
})();

export const caseOf = (peril: string, delay: number, bundle: string): string => {
  const c = GRID.find((g) => g.peril === peril && g.delay === delay && g.bundle === bundle);
  if (!c) throw new Error(`no such case in the grid: ${peril}/${delay}/${bundle}`);
  return c.id;
};

/** The generated case files, in the [record] ledger and in exactly the shape
 *  examples/jopa/facts.rofl uses. The tribunal of fact writes them; the
 *  extractor of an evidence weight is the same tribunal, and no rule here
 *  invents one. */
export function corpusFacts(): string {
  const out: string[] = [];
  const bundles = new Map(BUNDLES.map(([n, ev]) => [n, ev]));
  for (const g of GRID) {
    const pol = `p${g.id}`;
    out.push(
      `policy[record](${pol}, h${g.id}, "Case ${g.id}", 0, 364).`,
      `claim[record](${g.id}, ${pol}).`,
      `peril_alleged[record](${g.id}, ${g.peril}).`,
      `loss_of[record](${g.id}, "Case ${g.id}").`,
      `loss_day[record](${g.id}, ${LOSS_DAY}).`,
      `notice_day[record](${g.id}, ${LOSS_DAY + g.delay}).`,
      `claim_made[record](${g.id}, h${g.id}).`);
    bundles.get(g.bundle)!.forEach(([kind, w], i) =>
      out.push(`evidence[record](${g.id}_e${i}, ${kind}, ${g.id}, ${w}).`));
  }
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// THE DRAFT — six amendments to the Household Fire Indemnity Act 2026
//
// A MODIFICATION IS A REPEAL PLUS AN ENACTMENT. "The notice period becomes 21
// days" is two edits, and writing it as two is what lets §3 say which half of
// it each flipped case turned on.

export const AMENDMENTS = `
amendment[draft](ed_notice21).
amendment_note[draft](ed_notice21, "s.5(e): the notice period is reduced from 30 days to 21").
repeals[draft](ed_notice21, notice_limit(30)).
enacts[draft](ed_notice21, notice_limit(21)).
edit_cost[draft](ed_notice21, 1).

amendment[draft](ed_notice45).
amendment_note[draft](ed_notice45, "s.5(e): the notice period is extended from 30 days to 45").
repeals[draft](ed_notice45, notice_limit(30)).
enacts[draft](ed_notice45, notice_limit(45)).
edit_cost[draft](ed_notice45, 2).

amendment[draft](ed_subsidence).
amendment_note[draft](ed_subsidence, "s.2: subsidence is added to the schedule of insured perils").
enacts[draft](ed_subsidence, peril(subsidence)).
edit_cost[draft](ed_subsidence, 3).

amendment[draft](ed_no_tip).
amendment_note[draft](ed_no_tip, "s.6(4): an anonymous communication ceases to be evidence of presence").
repeals[draft](ed_no_tip, admits(anonymous_tip, at_property)).
edit_cost[draft](ed_no_tip, 1).

amendment[draft](ed_no_brigade).
amendment_note[draft](ed_no_brigade, "s.6(1): a fire authority report ceases to be evidence of causation").
repeals[draft](ed_no_brigade, admits(fire_brigade_report, peril_caused_loss)).
edit_cost[draft](ed_no_brigade, 1).

amendment[draft](ed_neighbour).
amendment_note[draft](ed_neighbour, "s.6(3): a neighbour's statement becomes evidence of causation").
enacts[draft](ed_neighbour, admits(neighbour_statement, peril_caused_loss)).
edit_cost[draft](ed_neighbour, 2).
`;

/** The arms. `enacted` is the world as it stands; one arm per clause so §4 can
 *  ask what each clause does alone; two bills. The subset lattice for the
 *  tropical search in §8 is built separately by `latticeArms`. */
export const ARMS = `
arm[draft](enacted).      baseline[draft](enacted).
arm[draft](a_notice21).   carries[draft](a_notice21, ed_notice21).
arm[draft](a_notice45).   carries[draft](a_notice45, ed_notice45).
arm[draft](a_subsidence). carries[draft](a_subsidence, ed_subsidence).
arm[draft](a_no_tip).     carries[draft](a_no_tip, ed_no_tip).
arm[draft](a_no_brigade). carries[draft](a_no_brigade, ed_no_brigade).
arm[draft](a_neighbour).  carries[draft](a_neighbour, ed_neighbour).

arm[draft](bill).
carries[draft](bill, ed_notice21).   carries[draft](bill, ed_no_tip).
carries[draft](bill, ed_no_brigade). carries[draft](bill, ed_neighbour).

arm[draft](relief).
carries[draft](relief, ed_notice45). carries[draft](relief, ed_subsidence).
`;

export const BILL_CLAUSES = ['ed_notice21', 'ed_no_tip', 'ed_no_brigade', 'ed_neighbour'];
export const RELIEF_CLAUSES = ['ed_notice45', 'ed_subsidence'];

export interface StatuteOpts {
  draft?: string;      // a different set of amendments and arms
  extra?: string;      // more draft facts (excision arms, targets, lattice)
  omitGrid?: boolean;  // the four hand-written cases only
}

/** The world: boot's meta-kernel, jopa's statute, jopa's case files, the grid,
 *  IFFY and its statute adapter, and the draft under the drafter's hand. */
export function statuteWorld(opts: StatuteOpts = {}): Rofl {
  const r = new Rofl();
  ok(r.load(BOOT), 'boot.rofl');
  ok(r.load(JOPA), 'jopa.rofl');
  ok(r.load(JOPA_FACTS, { who: 'tribunal_of_fact' }), 'jopa facts');
  ok(r.load(JOPA_CALIB, { who: 'modeller' }), 'jopa calibration');
  if (!opts.omitGrid) ok(r.load(corpusFacts(), { who: 'tribunal_of_fact' }), 'grid');
  ok(r.load(IFFY), 'iffy.rofl');
  ok(r.load(STATUTE), 'statute.rofl');
  ok(r.load((opts.draft ?? AMENDMENTS + ARMS) + (opts.extra ?? ''), { who: 'drafter' }), 'draft');
  return r;
}

// ---------------------------------------------------------------------------
// THE POLICY DRAFT — six changes to the access model of examples/nope

export const POLICY_AMENDMENTS = `
amendment[draft](ed_scp_off).
amendment_note[draft](ed_scp_off, "detach the service control policy from the production OU").
repeals[draft](ed_scp_off, scp_at(prod_ou, p_scp_prod)).
edit_cost[draft](ed_scp_off, 3).

amendment[draft](ed_grant_reader).
amendment_note[draft](ed_grant_reader, "the data_reader role may write to the production bucket").
enacts[draft](ed_grant_reader, stmt(s_reader_put, p_data_reader, allow, "s3:PutObject", "arn:aws:s3:::prod-bucket/*")).
edit_cost[draft](ed_grant_reader, 1).

amendment[draft](ed_deny_put).
amendment_note[draft](ed_deny_put, "an organization-wide Deny on writing to the production bucket").
enacts[draft](ed_deny_put, stmt(s_no_put, p_scp_prod, deny, "s3:PutObject", "arn:aws:s3:::prod-bucket/*")).
edit_cost[draft](ed_deny_put, 1).

amendment[draft](ed_no_dev_write).
amendment_note[draft](ed_no_dev_write, "the developers group loses its write policy").
repeals[draft](ed_no_dev_write, attach(developers, p_dev_write)).
edit_cost[draft](ed_no_dev_write, 1).

amendment[draft](ed_wide_boundary).
amendment_note[draft](ed_wide_boundary, "ci_runner's permission boundary is widened to the production bucket").
enacts[draft](ed_wide_boundary, stmt(s_bound_prod, p_bound_ci, allow, "s3:PutObject", "arn:aws:s3:::prod-bucket/*")).
edit_cost[draft](ed_wide_boundary, 2).

amendment[draft](ed_narrow_admin).
amendment_note[draft](ed_narrow_admin, "the legacy admin policy is narrowed from everything to S3").
repeals[draft](ed_narrow_admin, stmt(s_admin_all, p_admin, allow, "*", "*")).
enacts[draft](ed_narrow_admin, stmt(s_admin_s3, p_admin, allow, "s3:*", "*")).
edit_cost[draft](ed_narrow_admin, 2).
`;

export const POLICY_ARMS = `
arm[draft](enacted).          baseline[draft](enacted).
arm[draft](a_scp_off).        carries[draft](a_scp_off, ed_scp_off).
arm[draft](a_grant_reader).   carries[draft](a_grant_reader, ed_grant_reader).
arm[draft](a_deny_put).       carries[draft](a_deny_put, ed_deny_put).
arm[draft](a_no_dev_write).   carries[draft](a_no_dev_write, ed_no_dev_write).
arm[draft](a_wide_boundary).  carries[draft](a_wide_boundary, ed_wide_boundary).
arm[draft](a_narrow_admin).   carries[draft](a_narrow_admin, ed_narrow_admin).

arm[draft](bill_open).
carries[draft](bill_open, ed_scp_off). carries[draft](bill_open, ed_grant_reader).

arm[draft](bill_guard).
carries[draft](bill_guard, ed_scp_off).      carries[draft](bill_guard, ed_grant_reader).
carries[draft](bill_guard, ed_deny_put).
`;

export function policyWorld(opts: { draft?: string; extra?: string } = {}): Rofl {
  const r = new Rofl();
  ok(r.load(BOOT), 'boot.rofl');
  ok(r.load(NOPE), 'nope.rofl');
  ok(r.load(IFFY), 'iffy.rofl');
  ok(r.load(POLICY), 'policy.rofl');
  ok(r.load((opts.draft ?? POLICY_AMENDMENTS + POLICY_ARMS) + (opts.extra ?? ''), { who: 'drafter' }), 'draft');
  return r;
}

// ---------------------------------------------------------------------------
// small readers

export const col = (r: Rofl, q: string, v: string): string[] =>
  r.query(q).rows.map((x) => x.bindings[v]);
export const n = (r: Rofl, q: string): number => r.query(q).rows.length;
export const bare = (s: string): string => (s.startsWith('"') ? s.slice(1, -1) : s);

/** A count keyed by one binding of a query, sorted by count then key. */
export function tally(r: Rofl, q: string, v: string): [string, number][] {
  const m = new Map<string, number>();
  for (const row of r.query(q).rows) m.set(row.bindings[v], (m.get(row.bindings[v]) ?? 0) + 1);
  return [...m].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
}

// ---------------------------------------------------------------------------
// hygiene, and the two controls
//
// A rule outside range restriction is evaluated top-down rather than
// materialised: the Boolean answers stay right and the SUPPORT HYPERGRAPH does
// not, so every count and every fold below would then describe a different
// fact set than the verdicts do. Checked, not assumed.

export interface Hygiene {
  rules: number; unsafe: string[]; unstratified: string[];
  audits: Record<string, number>; facts: number;
}

export const AUDIT_QUERIES: [string, string][] = [
  ['malformed', 'malformed[audit](R)'],
  ['breach', 'breach[audit](R)'],
  ['leak', 'leak[audit](A, B)'],
  ['forged', 'forged[audit](F)'],
  ['undefined_premise', 'undefined_premise[audit](R, Rel)'],
  ['vacuous_repeal', 'vacuous_repeal[audit](Ed, E)'],
  ['vacuous_enact', 'vacuous_enact[audit](Ed, E)'],
  ['idle_arm', 'idle_arm[audit](A)'],
  ['unexplained', 'unexplained[audit](A, Q)'],
];

/** The statute adapter's own audit: two notice periods in force at once.
 *  iffy.rofl cannot state it — that s.5(e) is a slot is a fact about the Act. */
export const STATUTE_AUDIT: [string, string] = ['double_limit', 'double_limit[audit](A, L1, L2)'];

export function hygiene(r: Rofl, extra: [string, string][] = []): Hygiene {
  const ev = new Evaluation(r.store, {});
  const audits: Record<string, number> = {};
  for (const [name, q] of [...AUDIT_QUERIES, ...extra]) audits[name] = r.query(q).rows.length;
  return {
    rules: ev.rules.length,
    unsafe: ev.rules.filter((x) => !x.safe).map((x) => x.id),
    unstratified: col(r, 'unstratified(X)', 'X'),
    audits,
    facts: r.store.facts.size,
  };
}

/** THE POSITIVE CONTROL FOR THE WHOLE EXAMPLE. The baseline arm is the world
 *  as it stands, so it must reproduce the corpus's OWN conclusions, computed
 *  by the corpus's own rules, which know nothing about arms. Two computations
 *  that share no reasoning; an arm that agrees with nothing is a claim about
 *  itself. Each entry is [what, from the corpus, from the baseline arm]. */
export function statuteControls(r: Rofl): [string, string[], string[]][] {
  const s = (xs: string[]) => [...xs].sort();
  return [
    ['s.4 indemnity due', s(col(r, 'indemnity_due(C)', 'C')),
      s(col(r, 'verdict(enacted, q_due(C))', 'C'))],
    ['s.7 deliberate loss', s(col(r, 'deliberate_loss(C)', 'C')),
      s(col(r, 'verdict(enacted, q_excl(C))', 'C'))],
    ['s.5 elements made out', s(col(r, 'elements_met(C)', 'C')),
      s(col(r, 'aelements(enacted, C)', 'C'))],
  ];
}

export function policyControls(r: Rofl): [string, string[], string[]][] {
  const trip = (q: string, a: string, b: string, c: string) =>
    r.query(q).rows.map((x) => `${x.bindings[a]}|${x.bindings[b]}|${x.bindings[c]}`).sort();
  return [
    ['access', trip('access(P, A, Rs)', 'P', 'A', 'Rs'),
      trip('verdict(enacted, q_access(P, A, Rs))', 'P', 'A', 'Rs')],
    ['routes', r.query('route(P, A, Rs, Route)').rows
      .map((x) => `${x.bindings.P}|${x.bindings.A}|${x.bindings.Rs}|${x.bindings.Route}`).sort(),
      r.query('support(enacted, q_access(P, A, Rs), Route)').rows
        .map((x) => `${x.bindings.P}|${x.bindings.A}|${x.bindings.Rs}|${x.bindings.Route}`).sort()],
  ];
}

// ---------------------------------------------------------------------------
// §2 the diff of two fixpoints

export interface Diff {
  arm: string; decided: number; verdicts: number;
  flipped: number; lost: number; gained: number;
  soleReason: [string, number][]; multiReason: number;
  byKind: Record<string, number>;
}

export function diff(r: Rofl, arm: string): Diff {
  const byKind: Record<string, number> = {};
  for (const k of ['withdrawn', 'overridden', 'admitted', 'unblocked']) {
    byKind[k] = n(r, `because(${arm}, Q, ${k}(E))`);
  }
  return {
    arm,
    decided: n(r, 'decided(Q)'),
    verdicts: n(r, `verdict(${arm}, Q)`),
    flipped: n(r, `flipped(${arm}, Q)`),
    lost: n(r, `lost(${arm}, Q)`),
    gained: n(r, `gained(${arm}, Q)`),
    soleReason: tally(r, `sole_reason(${arm}, Q, Ed)`, 'Ed'),
    multiReason: n(r, `multi_reason(${arm}, Q)`),
    byKind,
  };
}

/** The grouped report the spec asks for: which clause did it, how many, and
 *  how many of those the clause did on its own. */
export function causeGroups(r: Rofl, arm: string): { edit: string; flips: number; sole: number; note: string }[] {
  const notes = new Map(r.query('amendment_note[draft](Ed, T)').rows
    .map((x) => [x.bindings.Ed, bare(x.bindings.T)]));
  return tally(r, `attributed(${arm}, Q, Ed)`, 'Ed').map(([edit, flips]) => ({
    edit, flips, sole: n(r, `sole_reason(${arm}, Q, ${edit})`), note: notes.get(edit) ?? '',
  }));
}

// ---------------------------------------------------------------------------
// §4 interaction

export interface Interaction { jointOnly: string[]; masked: [string, string][]; }

export function interactions(r: Rofl, arm: string): Interaction {
  return {
    jointOnly: col(r, `joint_only(${arm}, Q)`, 'Q').sort(),
    masked: r.query(`masked(${arm}, Q, Ed)`).rows
      .map((x) => [x.bindings.Q, x.bindings.Ed] as [string, string]).sort(),
  };
}

// ---------------------------------------------------------------------------
// §5 fragility

export interface Fragility {
  fragile: string[]; hardened: string[]; supportLost: number; supportGained: number;
}

export function fragility(r: Rofl, arm: string): Fragility {
  return {
    fragile: col(r, `fragile(${arm}, Q)`, 'Q').sort(),
    hardened: col(r, `hardened(${arm}, Q)`, 'Q').sort(),
    supportLost: n(r, `support_lost(${arm}, Q, S)`),
    supportGained: n(r, `support_gained(${arm}, Q, S)`),
  };
}

/** THE SECOND METHOD. `fragile/2` is four Datalog rules; this is set
 *  arithmetic over the raw support facts in TypeScript, sharing none of that
 *  reasoning. They must agree, and the test requires it. */
export function fragileByHand(r: Rofl, arm: string, baseline = 'enacted'): string[] {
  const supports = (a: string): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>();
    for (const row of r.query(`support(${a}, Q, S)`).rows) {
      const q = row.bindings.Q;
      if (!m.has(q)) m.set(q, new Set());
      m.get(q)!.add(row.bindings.S);
    }
    return m;
  };
  const b = supports(baseline), a = supports(arm);
  const out: string[] = [];
  for (const [q, bs] of b) {
    const as = a.get(q);
    if (as && bs.size >= 2 && as.size === 1) out.push(q);
  }
  return out.sort();
}

/** DERIVATIONS ARE NOT SUPPORTS, and the counting semiring answers the first
 *  question. Folded over `verdict`, it multiplies through every rule under the
 *  conclusion; folded over nothing at all, it cannot tell a claim proved twice
 *  from a claim proved once by a longer chain. Printed beside the structural
 *  count so the difference is visible rather than argued. */
export function derivationCount(r: Rofl, arm: string, q: string): Count {
  const res = evaluateSemiring(r.store, countingSemiring, { maxRounds: 200 });
  return res.value.get(`verdict[main](${arm},${q})`) ?? 0n;
}

// ---------------------------------------------------------------------------
// §6 excise
//
// An excision arm removes one CORPUS fact — a piece of evidence — rather than
// a norm. The blast radius is then the ordinary `lost/2` of the kernel,
// restricted to that arm, and computed with the fact still in the store.

export const exciseArm = (arm: string, evidenceId: string): string =>
  `\narm[draft](${arm}).\nexcised[draft](${arm}, ev(${evidenceId})).\n`;

export function exciseRadius(r: Rofl, arm: string): string[] {
  return col(r, `radius(${arm}, Q)`, 'Q').sort();
}

/** THE ORACLE. The kernel's own `excise` deep-copies the store, removes the
 *  fact, re-derives from scratch and diffs. It shares no reasoning with the
 *  arm, and it is also the reason the clone exists and is right to. Restricted
 *  to the baseline arm's verdicts, the two answers must be the same set. */
export function exciseOracle(r: Rofl, factText: string, baseline = 'enacted'): string[] {
  const res = r.excise(factText);
  if (!res.ok) throw new Error(`excise ${factText}: ${res.error}`);
  const pat = new RegExp(`^verdict\\[main\\]\\(${baseline},(.*)\\)$`);
  return res.removed.map((k) => pat.exec(k)?.[1]).filter((x): x is string => !!x).sort();
}

// ---------------------------------------------------------------------------
// §7 the tropical question: the cheapest amendment reaching a wanted outcome
//
// The subset lattice over k clauses is 2^k arms — and it is 2^k ARMS, in one
// store and one fixpoint, not 2^k stores. That is the whole reason a search is
// affordable here; §10 prices it.

export function latticeArms(clauses: string[], prefix = 'x'): string {
  const out: string[] = [];
  for (let mask = 0; mask < (1 << clauses.length); mask++) {
    const name = `${prefix}${String(mask).padStart(2, '0')}`;
    out.push(`arm[draft](${name}).`);
    for (let i = 0; i < clauses.length; i++) {
      if (mask & (1 << i)) out.push(`carries[draft](${name}, ${clauses[i]}).`);
    }
    // an arm carrying nothing is the baseline over again; the audit says so,
    // so the empty subset is simply not built
    if (mask === 0) out.pop();
  }
  return '\n' + out.join('\n') + '\n';
}

export interface Minimal { arm: string; cost: number; clauses: string[]; }

/** THE TROPICAL FOLD. The cost of an edit rides on the BASE FACT that puts it
 *  in an arm — `carries[draft](Arm, Ed)` — and on nothing else; min-plus over
 *  the support hypergraph then values `achieves(Arm)` at the least total cost
 *  of the edits some derivation of the target actually used. Not the arm's
 *  declared cost: the edits it NEEDED, which is the answer a drafter wants and
 *  is strictly smaller. */
export function cheapestAmendment(r: Rofl): Minimal[] {
  const costs = new Map(r.query('edit_cost[draft](Ed, N)').rows
    .map((x) => [x.bindings.Ed, Number(x.bindings.N)]));
  const res = evaluateSemiring(r.store, tropicalSemiring, {
    maxRounds: 200,
    base: (key) => {
      const m = /^carries\[draft\]\([^,]+,([^)]+)\)$/.exec(key);
      return m ? (costs.get(m[1]) ?? 0) : 0;
    },
  });
  const out: Minimal[] = [];
  for (const arm of col(r, 'achieves(A)', 'A')) {
    const v = res.value.get(`achieves[main](${arm})`);
    if (v === undefined || !Number.isFinite(v)) continue;
    out.push({ arm, cost: v, clauses: col(r, `carries[draft](${arm}, Ed)`, 'Ed').sort() });
  }
  return out.sort((a, b) => (a.cost - b.cost) || (a.arm < b.arm ? -1 : 1));
}

/** The second method again: enumerate the arms that reach the target and add
 *  up their declared edit costs in TypeScript. This is an upper bound on the
 *  fold — it charges for every clause the arm carries, including the ones the
 *  derivation never touched — so the fold must be no larger, and the cheapest
 *  arm by either measure must be the same set of clauses. */
export function cheapestByHand(r: Rofl): Minimal[] {
  const costs = new Map(r.query('edit_cost[draft](Ed, N)').rows
    .map((x) => [x.bindings.Ed, Number(x.bindings.N)]));
  return col(r, 'achieves(A)', 'A').map((arm) => {
    const clauses = col(r, `carries[draft](${arm}, Ed)`, 'Ed').sort();
    return { arm, clauses, cost: clauses.reduce((s, e) => s + (costs.get(e) ?? 0), 0) };
  }).sort((a, b) => (a.cost - b.cost) || (a.arm < b.arm ? -1 : 1));
}

// ---------------------------------------------------------------------------
// §10 what a fork costs
//
// A stopwatch, not the kernel. Every number below is wall-clock on the machine
// that ran it and the report prints the machine's own numbers rather than
// quoting the ones in README.md.

export interface ForkCost {
  corpus: string;
  plainFacts: number; plainBuildMs: number;
  cloneMs: number; cloneUsPerFact: number; forkByCloneMs: number;
  // every *Facts field is deterministic; every *Ms field is a stopwatch on a
  // machine that was doing other things. printCosts says so out loud.
  armWorldFacts: number; perArmFacts: number; perArmMs: number;
}

const ms = (t0: bigint): number => Number(process.hrtime.bigint() - t0) / 1e6;

/** The fastest of REPEATS runs. See `armScaling` for why the minimum. */
function fastest(f: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < REPEATS; i++) {
    const t = process.hrtime.bigint();
    f();
    const el = ms(t);
    if (el < best) best = el;
  }
  return best;
}

/** Time a fork the way the kernel does it: snapshot the store to JSON, restore
 *  it, amend the copy, re-derive. `excise` does exactly this internally. */
export function forkByClone(build: () => Rofl, amend: (r: Rofl) => void, probe: string): { ms: number; rows: number } {
  const base = build();
  base.evaluate();
  const t0 = process.hrtime.bigint();
  const f = Rofl.fromSnapshot(base.save());
  amend(f);
  f.store.dirty = true;
  f.evaluate();
  const rows = f.query(probe).rows.length;
  return { ms: ms(t0), rows };
}

export function statuteForkCost(): ForkCost {
  const plain = (): Rofl => {
    const r = new Rofl();
    ok(r.load(BOOT), 'boot');
    ok(r.load(JOPA), 'jopa');
    ok(r.load(JOPA_FACTS, { who: 'tribunal_of_fact' }), 'facts');
    ok(r.load(JOPA_CALIB, { who: 'modeller' }), 'calib');
    ok(r.load(corpusFacts(), { who: 'tribunal_of_fact' }), 'grid');
    return r;
  };
  const t0 = process.hrtime.bigint();
  const base = plain();
  base.evaluate();
  const plainBuildMs = ms(t0);
  const cloneMs = fastest(() => { base.store.clone(); });
  const fc = { ms: fastest(() => forkByClone(plain, (f) => {
    f.retract('notice_period(s5_e, 30).');
    ok(f.assert('notice_period(s5_e, 21).'), 'amend');
  }, 'indemnity_due(C)')) };
  return {
    corpus: 'statute (examples/jopa)',
    plainFacts: base.store.facts.size, plainBuildMs,
    cloneMs, cloneUsPerFact: (cloneMs * 1000) / base.store.facts.size,
    forkByCloneMs: fc.ms,
    ...armScaling((k) => statuteWorld({ draft: AMENDMENTS + scaleArms(k, BILL_CLAUSES) })),
  };
}

export function policyForkCost(): ForkCost {
  const plain = (): Rofl => {
    const r = new Rofl();
    ok(r.load(BOOT), 'boot');
    ok(r.load(NOPE), 'nope');
    return r;
  };
  const t0 = process.hrtime.bigint();
  const base = plain();
  base.evaluate();
  const plainBuildMs = ms(t0);
  const cloneMs = fastest(() => { base.store.clone(); });
  const fc = { ms: fastest(() => forkByClone(plain, (f) => { f.retract('scp(prod_ou, p_scp_prod).'); }, 'access(P, A, Rs)')) };
  return {
    corpus: 'policy (examples/nope)',
    plainFacts: base.store.facts.size, plainBuildMs,
    cloneMs, cloneUsPerFact: (cloneMs * 1000) / base.store.facts.size,
    forkByCloneMs: fc.ms,
    ...armScaling((k) => policyWorld({ draft: POLICY_AMENDMENTS + scaleArms(k, ['ed_scp_off', 'ed_grant_reader', 'ed_deny_put', 'ed_no_dev_write']) })),
  };
}

const scaleArms = (k: number, edits: string[]): string => {
  const out = ['arm[draft](enacted).', 'baseline[draft](enacted).'];
  for (let i = 0; i < k; i++) out.push(`arm[draft](s_${i}). carries[draft](s_${i}, ${edits[i % edits.length]}).`);
  return '\n' + out.join('\n') + '\n';
};

/** The slope of the line through two arm counts. Two points, honestly: the
 *  measurement is a difference and calling it a fit would be dressing it up.
 *
 *  THE MINIMUM OF THE REPEATS, not the mean. A build can only be slower than
 *  the work it does — a garbage collection, a page fault, another process —
 *  never faster, so the noise is one-sided and the mean estimates the noise as
 *  much as the quantity. The minimum is the cleanest run that happened. */
export const REPEATS = 5;

function armScaling(build: (k: number) => Rofl): { armWorldFacts: number; perArmFacts: number; perArmMs: number } {
  const at = (k: number) => {
    let best = Infinity, facts = 0;
    for (let i = 0; i < REPEATS; i++) {
      const t = process.hrtime.bigint();
      const r = build(k);
      r.evaluate();
      const el = ms(t);
      if (el < best) best = el;
      facts = r.store.facts.size;
    }
    return { facts, ms: best };
  };
  // WARM FIRST. Measured cold, the k=0 world pays for the JIT compiling the
  // evaluator and the k=8 world does not, and the difference between them came
  // out NEGATIVE — a fork that makes the program faster, which is not a
  // measurement of anything. One discarded build of each end fixes the
  // ordering; the noise floor that remains is reported rather than hidden.
  build(0).evaluate();
  build(8).evaluate();
  const lo = at(0), hi = at(8);
  return {
    armWorldFacts: lo.facts,
    perArmFacts: Math.round((hi.facts - lo.facts) / 8),
    perArmMs: (hi.ms - lo.ms) / 8,
  };
}

// ---------------------------------------------------------------------------
// the transcript

const hr = (t: string): void => console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`);
const sub = (t: string): void => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 68 - t.length))}`);

function printHygiene(r: Rofl, what: string, extra: [string, string][] = []): void {
  const h = hygiene(r, extra);
  console.log(`${what}: ${h.rules} rules, ${h.facts} facts, ` +
    `${h.unsafe.length} outside range restriction, ${h.unstratified.length} unstratified`);
  console.log('  audits: ' + Object.entries(h.audits).map(([k, v]) => `${k}=${v}`).join('  '));
}

function printControls(rows: [string, string[], string[]][]): void {
  for (const [what, a, b] of rows) {
    const same = a.length === b.length && a.every((x, i) => x === b[i]);
    console.log(`  ${what.padEnd(24)} corpus ${String(a.length).padStart(4)}   baseline arm ${String(b.length).padStart(4)}   ${same ? 'IDENTICAL' : 'DIFFER'}`);
    if (!same) throw new Error(`control failed: ${what}`);
  }
}

export function main(): void {
  // MEASURED FIRST, PRINTED LAST. A stopwatch in the same process as eight
  // fixpoints measures the garbage collector as much as the fork, and the
  // numbers came out 2x high when this ran at the bottom. It runs here.
  const costs = [statuteForkCost(), policyForkCost()];

  hr('IFFY §1 — the fork, and what it does not copy');
  const r = statuteWorld();
  printHygiene(r, 'statute world', [STATUTE_AUDIT]);
  const arms = col(r, 'arm[draft](A)', 'A');
  console.log(`\narms: ${arms.length} (${arms.join(', ')})`);
  console.log(`cases in the corpus: ${n(r, 'acase(C)')}  (4 written by hand in examples/jopa, ${GRID.length} enumerated here)`);
  console.log(`questions re-decided per arm: ${n(r, 'decided(Q)')}`);
  console.log(`amendable elements read out of the Act: ${n(r, 'enacted_elem(E)')}`);
  console.log('  ' + col(r, 'enacted_elem(E)', 'E').sort().join('\n  '));
  console.log(`\ncopies of the case corpus in the store: 1`);
  console.log(`  evidence[record] facts: ${n(r, 'evidence[record](I, K, C, W)')}  ` +
    `— read by all ${arms.length} arms through one rule (statute.rofl aev/5)`);

  sub('the two controls');
  printControls(statuteControls(r));

  hr('IFFY §2 — the diff of two fixpoints');
  for (const a of ['bill', 'relief']) {
    const d = diff(r, a);
    console.log(`\n$ iffy --rules ${a} --against enacted`);
    console.log(`flipped: ${d.flipped} of ${d.decided}   (lost ${d.lost}, gained ${d.gained})`);
    console.log('\n  by clause:');
    for (const g of causeGroups(r, a)) {
      console.log(`    ${g.edit.padEnd(16)} ${String(g.flips).padStart(4)}   of which that clause alone: ${g.sole}`);
      console.log(`      ${g.note}`);
    }
    console.log(`\n  more than one clause implicated: ${d.multiReason}`);
    console.log('  by kind of cause: ' + Object.entries(d.byKind).map(([k, v]) => `${k}=${v}`).join('  '));
  }

  hr('IFFY §3 — provenance of the DIFFERENCE, one case at a time');
  const single = caseOf('fire', 25, 'met_acc');
  console.log(`\ncase ${single}: fire, notice on day 25, a meteorological report and traces\n`);
  console.log(`  under enacted:  q_due  ${r.holds(`verdict(enacted, q_due(${single}))`)}`);
  console.log(`  under bill:     q_due  ${r.holds(`verdict(bill, q_due(${single}))`)}`);
  console.log('  the model says it flipped BECAUSE:');
  for (const row of r.query(`because(bill, q_due(${single}), C)`).rows) console.log(`    ${row.bindings.C}`);
  console.log('  attributed to: ' + col(r, `attributed(bill, q_due(${single}), Ed)`, 'Ed').join(', '));
  console.log('\n  and the kernel, asked directly, names the same link:');
  console.log(r.whynot(`amet(bill, ${single}, notice_in_time)`, { depth: 2 }).text
    .split('\n').map((l) => '    ' + l).join('\n'));

  const both = caseOf('fire', 25, 'brig_eng');
  console.log(`\ncase ${both}: the same, with a fire authority report and an engineer's\n`);
  console.log('  because:');
  for (const row of r.query(`because(bill, q_due(${both}), C)`).rows) console.log(`    ${row.bindings.C}`);
  console.log(`  two clauses did it, independently: multi_reason = ${r.holds(`multi_reason(bill, q_due(${both}))`)}`);

  hr('IFFY §4 — interaction: what a canary cannot see');
  for (const a of ['relief', 'bill']) {
    const it = interactions(r, a);
    console.log(`\n${a}:`);
    console.log(`  flips only jointly (no single clause does it): ${it.jointOnly.length}`);
    for (const q of it.jointOnly.slice(0, 5)) console.log(`    ${q}`);
    console.log(`  a clause flips it and the bill hides that: ${it.masked.length}`);
    for (const [q, ed] of it.masked.slice(0, 5)) console.log(`    ${q}   masked ${ed}`);
  }
  const jq = interactions(r, 'relief').jointOnly[0];
  if (jq) {
    console.log(`\n  ${jq} under each arm:`);
    for (const a of ['enacted', 'a_notice45', 'a_subsidence', 'relief']) {
      console.log(`    ${a.padEnd(14)} ${r.holds(`verdict(${a}, ${jq})`)}`);
    }
  }

  hr('IFFY §5 — held, and lost its spare');
  for (const a of ['a_no_brigade', 'a_neighbour', 'bill']) {
    const f = fragility(r, a);
    console.log(`\n${a.padEnd(14)} fragile ${String(f.fragile.length).padStart(3)}   hardened ${String(f.hardened.length).padStart(3)}` +
      `   supports lost ${String(f.supportLost).padStart(3)}   gained ${String(f.supportGained).padStart(3)}`);
    const byHand = fragileByHand(r, a);
    const same = byHand.length === f.fragile.length && byHand.every((x, i) => x === f.fragile[i]);
    console.log(`  the same set computed by set arithmetic outside the engine: ${byHand.length}  ${same ? 'AGREE' : 'DISAGREE'}`);
    if (!same) throw new Error(`fragility disagrees on ${a}`);
  }
  const frag = fragility(r, 'a_no_brigade').fragile[0];
  if (frag) {
    console.log(`\n  ${frag}:`);
    console.log(`    supports under enacted:      ${n(r, `support(enacted, ${frag}, S)`)}`);
    console.log(`    supports under a_no_brigade: ${n(r, `support(a_no_brigade, ${frag}, S)`)}`);
    console.log(`    the verdict itself did not move: steady = ${r.holds(`steady(a_no_brigade, ${frag})`)}`);
    console.log(`\n    and the counting semiring, folded over the same conclusion, says`);
    console.log(`    ${renderCount(derivationCount(r, 'enacted', frag))} and ` +
      `${renderCount(derivationCount(r, 'a_no_brigade', frag))} DERIVATIONS. That is a different`);
    console.log(`    number and a different question: derivations multiply through every`);
    console.log(`    rule below, independent supports do not. A drafter needs the second.`);
  }

  hr('IFFY §6 — excise: the blast radius, before the deletion');
  const sole = caseOf('fire', 8, 'brig');       // the only proof of causation
  const spare = caseOf('fire', 8, 'brig_eng');  // one of two
  const rx = statuteWorld({ extra: exciseArm('cut_sole', `${sole}_e0`) + exciseArm('cut_spare', `${spare}_e0`) });
  for (const [arm, c] of [['cut_sole', sole], ['cut_spare', spare]] as [string, string][]) {
    const factText = `evidence[record](${c}_e0, fire_brigade_report, ${c}, 95)`;
    const radius = exciseRadius(rx, arm);
    const oracle = exciseOracle(rx, factText);
    const same = radius.length === oracle.length && radius.every((x, i) => x === oracle[i]);
    console.log(`\nproposed: delete ${factText}`);
    console.log(`  radius as an arm, with the fact still in the store: ${radius.length}` +
      (radius.length ? '   ' + radius.join(', ') : '   (empty: radius_empty = ' + rx.holds(`radius_empty(${arm})`) + ')'));
    console.log(`  the kernel's own excise, which deep-copies and re-derives: ${oracle.length}   ${same ? 'IDENTICAL' : 'DIFFER'}`);
    if (!same) throw new Error(`excise oracle disagrees on ${arm}`);
    console.log(`  supports lost without any verdict moving: ${n(rx, `support_lost(${arm}, Q, S)`)}`);
    console.log(`  the arm never touched the store: the fact is still there — ${rx.holds(factText)}`);
  }
  console.log('\nAN EMPTY BLAST RADIUS IS NOT A FREE DELETION, and the second row is the');
  console.log('whole reason to compute this before rather than after: nothing decided');
  console.log('differently, and a conclusion that stood on two legs now stands on one.');

  hr('IFFY §7 — the inverse question: the cheapest amendment that works');
  const wanted = caseOf('subsidence', 41, 'brig');
  const rt = statuteWorld({
    draft: AMENDMENTS + `arm[draft](enacted).\nbaseline[draft](enacted).\ntarget[draft](q_due(${wanted})).\n`
      + latticeArms(['ed_notice21', 'ed_notice45', 'ed_subsidence', 'ed_neighbour']),
  });
  console.log(`\nwanted: q_due(${wanted})  — subsidence, notice on day 41`);
  console.log(`  currently: ${rt.holds(`verdict(enacted, q_due(${wanted}))`)}`);
  console.log(`  search: ${n(rt, 'arm[draft](A)')} arms — the whole subset lattice over 4 clauses — in ONE store`);
  const cheap = cheapestAmendment(rt);
  const byHand = cheapestByHand(rt);
  console.log(`  arms reaching it: ${cheap.length}`);
  console.log('\n  cheapest, by the tropical fold over the support hypergraph:');
  for (const m of cheap.slice(0, 4)) console.log(`    cost ${m.cost}   ${m.arm}   ${m.clauses.join(' + ')}`);
  console.log('\n  cheapest, by adding up declared costs outside the engine:');
  for (const m of byHand.slice(0, 4)) console.log(`    cost ${m.cost}   ${m.arm}   ${m.clauses.join(' + ')}`);
  console.log(`\n  the fold charges only for the clauses the derivation USED, so it is` +
    `\n  never larger: ${cheap.every((m) => m.cost <= (byHand.find((h) => h.arm === m.arm)?.cost ?? Infinity)) ? 'holds on every arm' : 'VIOLATED'}`);

  hr('IFFY §8 — the same mode over a corpus that shares nothing with a statute');
  const p = policyWorld();
  printHygiene(p, 'policy world');
  sub('the control');
  printControls(policyControls(p));
  for (const a of ['a_narrow_admin', 'a_deny_put', 'bill_open', 'bill_guard']) {
    const d = diff(p, a);
    console.log(`\n${a.padEnd(16)} flipped ${String(d.flipped).padStart(3)} of ${d.decided}` +
      `   lost ${String(d.lost).padStart(3)}   gained ${String(d.gained).padStart(3)}` +
      `   fragile ${String(n(p, `fragile(${a}, Q)`)).padStart(3)}`);
    console.log('  cause kinds: ' + Object.entries(d.byKind).map(([k, v]) => `${k}=${v}`).join('  '));
  }
  console.log('\nTHE KIND THE STATUTE CANNOT PRODUCE — a conclusion lost with every premise');
  console.log('it ever rested on still standing, defeated by a norm that did not exist:');
  for (const row of p.query('because(a_deny_put, Q, overridden(E))').rows.slice(0, 2)) {
    console.log(`  ${row.bindings.Q}`);
    console.log(`    overridden by ${row.bindings.E}`);
  }
  console.log('\njoint_only: ' + interactions(p, 'bill_open').jointOnly.join(', '));
  const aq = interactions(p, 'bill_open').jointOnly[0];
  if (aq) for (const a of ['enacted', 'a_scp_off', 'a_grant_reader', 'bill_open']) {
    console.log(`  ${a.padEnd(16)} ${p.holds(`verdict(${a}, ${aq})`)}`);
  }
  console.log('masked in bill_guard: ' + interactions(p, 'bill_guard').masked.length);

  hr('IFFY §9 — what a fork costs, and the ceiling that follows');
  printCosts(costs);
}

/** §9 on its own. `node examples/iffy/demo.ts --cost` runs only this, in a
 *  process that has built nothing else, which is the only way these numbers
 *  mean anything: eight fixpoints earlier in the same heap measured the
 *  garbage collector as much as the fork and came out roughly twice as high.
 *  README.md quotes a run of THIS entry point and says so. */
export function printCosts(costs: ForkCost[] = [statuteForkCost(), policyForkCost()]): void {
  for (const c of costs) {
    console.log(`\n${c.corpus}`);
    console.log('  WHAT A FORK COSTS IN FACTS — deterministic, identical on every run:');
    console.log(`    one fork by clone copies the whole store:  ${String(c.plainFacts).padStart(7)} facts`);
    console.log(`    one more arm adds:                         ${String(c.perArmFacts).padStart(7)} facts` +
      `   (${(c.plainFacts / c.perArmFacts).toFixed(1)}x smaller)`);
    console.log(`    the IFFY world before any arm:             ${String(c.armWorldFacts).padStart(7)} facts` +
      `   — the price of admission, paid once`);
    console.log('  WHAT IT COSTS IN TIME — fastest of ' + REPEATS + ' runs, and see the caveat below:');
    console.log(`    store.clone() of the corpus:               ${c.cloneMs.toFixed(0).padStart(5)} ms   = ${c.cloneUsPerFact.toFixed(1)} us/fact`);
    console.log(`    a whole fork by clone (copy+amend+derive): ${c.forkByCloneMs.toFixed(0).padStart(5)} ms`);
    console.log(`    one more arm:                              ${c.perArmMs > 2
      ? c.perArmMs.toFixed(0).padStart(5) + ' ms'
      : 'below this machine\'s noise floor (' + c.perArmMs.toFixed(0) + ' ms)'}`);
  }
  console.log('\nTHE CAVEAT, AND IT IS NOT A SMALL ONE. The time figures move by a factor of');
  console.log('several between runs of this same command on a loaded machine — the per-arm');
  console.log('cost has been measured at 42 ms and at 237 ms on the statute corpus within an');
  console.log('hour. A difference of two noisy measurements is noisier than either, so the');
  console.log('ratio printed from them is not a number this example is willing to defend.');
  console.log('The FACT COUNTS above do not move at all. They are what the argument rests on,');
  console.log('and the argument for arms was never mainly about speed: see README.md.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--cost')) printCosts(); else main();
}
