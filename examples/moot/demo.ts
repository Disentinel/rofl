// demo.ts — MOOT: proving which feature flags are dead.
//
//   node --experimental-strip-types examples/moot/demo.ts
//
// Nothing in the transcript is composed by hand; README.md and page.html
// paste this program's stdout. Every verdict the engine reaches is checked a
// second time by exhaustive enumeration of the declared context space, in
// plain TypeScript that shares no code with examples/moot/moot.rofl.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { peelRounds } from '../../src/rounds.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, tropicalSemiring, unitFiringCost, renderCount,
  provenanceSemiring, provenanceOf, type Count,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const MOOT = read('examples', 'moot', 'moot.rofl');

// ===========================================================================
// THE CONFIG
//
// Synthetic, and deliberately so: real flags from a real company are neither
// needed nor suitable. Fifty flags, of which a dozen are dead — each for a
// DIFFERENT structural reason, at least one per verdict, plus one that is
// dead in a way these rules deliberately do not claim to catch.
// ===========================================================================

export const CONFIG = `
# ---- the context space, declared. This IS the decidability boundary. ----
dim segment  free trial pro team enterprise internal
dim region   us ca br uk eu jp au in
dim version  1..12
dim bucket   0..9
dim channel  stable beta canary dev

# ---- the pathologies ----

flag payments_v2
  when region in us ca; region in eu uk

flag new_checkout
  when segment in pro team enterprise; region in us ca; version >= 7; needs payments_v2
  when channel is dev; channel is canary

flag wallet_topup
  when segment in pro team; needs new_checkout

flag loyalty_banner
  when segment in free trial; segment in trial pro; segment in free pro

flag eu_price_test
  when region in eu uk; version >= 9; version <= 4

flag ai_summaries
  when segment in pro team enterprise; channel in beta canary
  when segment is pro; region is us; channel is beta

flag bulk_export
  when segment is enterprise; version >= 5
  when segment is enterprise; version >= 5; needs data_lake

flag dark_mode
  when

flag express_checkout
  when segment in pro team enterprise; region in us ca uk

flag one_page_checkout
  when segment in team enterprise; bucket <= 4

exclusive express_checkout one_page_checkout

flag referral_widget
  when segment in free trial; needs growth_experiments
  when segment is pro; region in us br; needs growth_experiments

flag search_rerank
  when segment in free trial pro
  when segment in team enterprise internal

# ---- the other thirty-six, which are fine ----

flag growth_experiments
  when bucket <= 2
  when segment is internal

flag data_lake
  when segment in team enterprise
  when segment is internal

flag checkout_upsell
  when segment in pro team; region in us ca; bucket <= 3

flag saved_cards
  when segment notin free; version >= 4

flag apple_pay
  when region in us ca uk; version >= 6

flag google_pay
  when region notin jp; version >= 6

flag pix_payments
  when region is br

flag upi_payments
  when region is in

flag sepa_direct_debit
  when region in eu uk; segment notin free

flag three_ds_v2
  when region in eu uk; version >= 8
  when segment is internal

flag fraud_score_v3
  when bucket <= 1
  when segment is internal; channel notin stable

flag risk_manual_review
  when segment in enterprise internal; needs fraud_score_v3

flag address_autocomplete
  when version >= 5

flag guest_checkout
  when segment in free trial

flag subscription_pause
  when segment in pro team enterprise; version >= 9

flag seat_management
  when segment in team enterprise

flag sso_saml
  when segment is enterprise
  when segment is internal

flag scim_provisioning
  when segment is enterprise; version >= 10; needs sso_saml

flag audit_log_export
  when segment in enterprise internal; needs data_lake

flag usage_dashboard
  when segment notin free; version >= 7

flag cost_alerts
  when segment in team enterprise; needs usage_dashboard

flag new_nav
  when bucket <= 4; channel notin stable
  when segment is internal

flag command_palette
  when version >= 11
  when segment is internal

flag onboarding_v4
  when segment in free trial; bucket <= 5

flag empty_state_illustrations
  when channel in beta canary dev

flag keyboard_shortcuts
  when version >= 8; channel notin stable

flag inline_comments
  when segment in pro team enterprise; version >= 9

flag mention_notifications
  when segment notin free; needs inline_comments

flag realtime_presence
  when segment in team enterprise; version >= 11; bucket <= 6

flag offline_mode
  when channel is dev

flag telemetry_v2
  when version >= 3

flag crash_reporter
  when channel notin stable
  when segment is internal

flag slow_query_log
  when segment is internal

flag feature_usage_beacon
  when version >= 6; needs telemetry_v2

flag localized_pricing
  when region notin us; version >= 7

flag tax_engine_v2
  when region in eu uk ca; version >= 9

flag invoice_pdf_v3
  when segment notin free; version >= 8

flag dunning_emails
  when segment notin free; bucket <= 7

flag trial_extension
  when segment is trial; bucket <= 3

flag win_back_campaign
  when segment is free; region in us uk; bucket <= 2
`;

// ===========================================================================
// THE PARSER — config text to rules-as-data. No manual annotation: the flag
// file already IS the reflection, and this only re-spells it as facts.
// ===========================================================================

export type Op = 'eq' | 'ne' | 'ge' | 'le' | 'oneof' | 'noneof';

export interface Cond {
  id: string; dim: string; op: Op;
  k: string;            // canonical operand for eq/ne/ge/le, 'set' otherwise
  alts: string[];       // canonical members for oneof/noneof
  text: string;         // the config source line fragment, for the report
}

export interface Clause {
  id: string; flag: string; index: number;
  conds: Cond[]; needs: string[]; text: string;
}

export interface Dim { name: string; values: string[]; numeric: boolean; }

export interface Config {
  dims: Dim[];
  flags: string[];
  clauses: Clause[];
  byFlag: Map<string, Clause[]>;
  exclusives: [string, string][];
  cond: Map<string, Cond>;
  clause: Map<string, Clause>;
}

const flagId = (name: string) => `f_${name}`;
export const flagName = (id: string) => id.replace(/^f_/, '');

export function parseConfig(src: string): Config {
  const dims: Dim[] = [];
  const flags: string[] = [];
  const clauses: Clause[] = [];
  const exclusives: [string, string][] = [];
  let cur: string | null = null;

  for (const raw of src.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const [head, ...rest] = line.split(/\s+/);
    if (head === 'dim') {
      const name = rest[0];
      const spec = rest.slice(1);
      const range = spec.length === 1 ? /^(\d+)\.\.(\d+)$/.exec(spec[0]) : null;
      if (range) {
        const [lo, hi] = [Number(range[1]), Number(range[2])];
        const values: string[] = [];
        for (let v = lo; v <= hi; v++) values.push(String(v));
        dims.push({ name, values, numeric: true });
      } else {
        dims.push({ name, values: spec, numeric: false });
      }
    } else if (head === 'flag') {
      cur = rest[0];
      flags.push(flagId(cur));
    } else if (head === 'exclusive') {
      exclusives.push([flagId(rest[0]), flagId(rest[1])]);
    } else if (head === 'when') {
      if (cur === null) throw new Error(`moot: 'when' before any flag: ${line}`);
      const flag = cur;
      const index = (clauses.filter((c) => c.flag === flagId(flag)).length) + 1;
      const id = `c_${flag}_${index}`;
      const body = line.slice(4).trim();
      const parts = body === '' ? [] : body.split(';').map((s) => s.trim()).filter((s) => s !== '');
      const conds: Cond[] = [];
      const needs: string[] = [];
      parts.forEach((p, j) => {
        if (p.startsWith('needs ')) { needs.push(flagId(p.slice(6).trim())); return; }
        conds.push(parseCond(`l_${flag}_${index}_${j + 1}`, p, dims));
      });
      clauses.push({ id, flag: flagId(flag), index, conds, needs, text: body === '' ? '(no conditions)' : body });
    } else {
      throw new Error(`moot: unparsable config line: ${line}`);
    }
  }

  const byFlag = new Map<string, Clause[]>();
  for (const f of flags) byFlag.set(f, []);
  for (const c of clauses) byFlag.get(c.flag)!.push(c);
  const cond = new Map<string, Cond>();
  for (const c of clauses) for (const l of c.conds) cond.set(l.id, l);
  const clause = new Map<string, Clause>();
  for (const c of clauses) clause.set(c.id, c);
  return { dims, flags, clauses, byFlag, exclusives, cond, clause };
}

/** One condition. Atom values stay atoms, integer dimensions stay integers —
 *  the operand's TYPE is the dimension's, so `version >= 7` compares numbers
 *  and `segment is pro` compares atoms, and the kernel's integer-only
 *  comparison builtins are never handed an atom. */
function parseCond(id: string, text: string, dims: Dim[]): Cond {
  const tok = text.split(/\s+/);
  const dim = tok[0];
  if (!dims.some((d) => d.name === dim)) throw new Error(`moot: unknown dimension '${dim}' in '${text}'`);
  const opw = tok[1];
  const args = tok.slice(2);
  const mk = (op: Op, k: string, alts: string[]): Cond => ({ id, dim, op, k, alts, text });
  if (opw === 'is') return mk('eq', args[0], []);
  if (opw === 'not') return mk('ne', args[0], []);
  if (opw === '>=') return mk('ge', args[0], []);
  if (opw === '<=') return mk('le', args[0], []);
  if (opw === 'in') return mk('oneof', 'set', args);
  if (opw === 'notin') return mk('noneof', 'set', args);
  throw new Error(`moot: unknown operator '${opw}' in '${text}'`);
}

/** The config as ROFL facts. This is the whole translation: no rule is
 *  written here, only the reflection the config already carried. */
export function configFacts(cfg: Config): string {
  const out: string[] = [];
  for (const d of cfg.dims) {
    out.push(`dim(${d.name}).`);
    for (const v of d.values) out.push(`dom(${d.name}, ${v}).`);
  }
  for (const f of cfg.flags) out.push(`flag(${f}).`);
  for (const c of cfg.clauses) {
    out.push(`ordered(${c.flag}, ${c.id}, ${c.index}).`);
    out.push(`req_count(${c.id}, ${c.needs.length}).`);
    c.needs.forEach((g, i) => {
      out.push(`requires(${c.id}, ${g}).`);
      out.push(`req_at(${c.id}, ${i + 1}, ${g}).`);
    });
    for (const l of c.conds) {
      out.push(`cond_of(${c.id}, ${l.id}).`);
      out.push(`cond(${l.id}, ${l.dim}, ${l.op}, ${l.k}).`);
      for (const v of l.alts) out.push(`cond_alt(${l.id}, ${v}).`);
    }
  }
  for (const [a, b] of cfg.exclusives) out.push(`exclusive(${a}, ${b}).`);
  return out.join('\n') + '\n';
}

// ===========================================================================
// THE WORLD
// ===========================================================================

export const CFG = parseConfig(CONFIG);
export const FACTS = configFacts(CFG);

const BUDGET = 4_000_000;

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

/** boot.rofl + moot.rofl + the config, plus an optional context.
 *  boot.rofl is loaded for real work, not decoration: it computes `stratum/2`
 *  over MOOT's own reflection, and its audits judge MOOT's rules. */
export function world(ctx: Record<string, string> = {}): Rofl {
  const r = new Rofl();
  must(r.load(BOOT, { budget: BUDGET }), 'boot.rofl');
  must(r.load(MOOT, { budget: BUDGET }), 'moot.rofl');
  const ctxFacts = Object.entries(ctx).map(([d, v]) => `ctx(${d}, ${v}).`).join('\n');
  must(r.load(FACTS + ctxFacts + '\n', { budget: BUDGET }), 'the flag config');
  return r;
}

// ---------------------------------------------------------------------------
// query helpers. A conjunctive query is a parse error that arrives as `error`
// with zero rows, so every read goes through here and here it throws.

export function rows(r: Rofl, q: string): Record<string, string>[] {
  const res = r.query(q, { budget: BUDGET });
  if (res.error) throw new Error(`moot: query ${q}: ${res.error}`);
  if (res.partial) throw new Error(`moot: query ${q} hit the budget`);
  return res.rows.map((x) => x.bindings);
}

export const col = (r: Rofl, q: string, v: string): string[] => rows(r, q).map((x) => x[v]);

// ===========================================================================
// THE FIVE VERDICTS, read off the engine
// ===========================================================================

export interface Verdicts {
  unreachable: string[];
  shadowed: { flag: string; dead: string; by: string }[];
  tautological: { flag: string; clause: string }[];
  contradictory: { a: string; b: string; ca: string; cb: string }[];
  dependent: { flag: string; on: string }[];
}

export function verdicts(r: Rofl): Verdicts {
  return {
    unreachable: col(r, 'unreachable[audit](F)', 'F').sort(),
    shadowed: rows(r, 'shadowed[audit](F, C, C0)')
      .map((b) => ({ flag: b.F, dead: b.C, by: b.C0 }))
      .sort((x, y) => (x.dead < y.dead ? -1 : 1)),
    tautological: rows(r, 'tautological[audit](F, C)')
      .map((b) => ({ flag: b.F, clause: b.C }))
      .sort((x, y) => (x.clause < y.clause ? -1 : 1)),
    contradictory: rows(r, 'contradictory[audit](F, G, C1, C2)')
      .map((b) => ({ a: b.F, b: b.G, ca: b.C1, cb: b.C2 }))
      .sort((x, y) => (x.ca + x.cb < y.ca + y.cb ? -1 : 1)),
    dependent: rows(r, 'dependent[audit](F, G)')
      .map((b) => ({ flag: b.F, on: b.G }))
      .sort((x, y) => (x.flag + x.on < y.flag + y.on ? -1 : 1)),
  };
}

// ===========================================================================
// WHYNOT — why a flag cannot turn on, which condition, and what must change.
//
// The tree is the engine's. What this adds is the reading: which dimension of
// which clause came out empty, which conditions did it, and which single
// deletion would revive it. The search for the deletion is host arithmetic
// over the engine's `cond_admits/2` facts — v0 has no aggregation (LIMITS.md)
// — but every set it intersects was derived, not parsed.
// ===========================================================================

/** Per-condition admitted values, straight off the engine. */
export function condSets(r: Rofl): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const b of rows(r, 'cond_admits(L, V)')) {
    let s = out.get(b.L);
    if (!s) { s = new Set(); out.set(b.L, s); }
    s.add(b.V);
  }
  return out;
}

/** Per-clause, per-dimension admitted values, straight off the engine. */
export function admitSets(r: Rofl): Map<string, Map<string, Set<string>>> {
  const out = new Map<string, Map<string, Set<string>>>();
  for (const b of rows(r, 'admits(C, D, V)')) {
    let m = out.get(b.C);
    if (!m) { m = new Map(); out.set(b.C, m); }
    let s = m.get(b.D);
    if (!s) { s = new Set(); m.set(b.D, s); }
    s.add(b.V);
  }
  return out;
}

export interface DeadDim {
  dim: string;
  conds: Cond[];
  pair: [Cond, Cond] | null;   // a conflicting PAIR, when one exists
  repairs: Cond[];             // single deletions that make the dimension live
}

export interface ClauseDiagnosis {
  clause: Clause;
  emptyDims: DeadDim[];
  blockedBy: string[];         // required flags that are not live
}

export function diagnose(r: Rofl, cfg: Config, sets: Map<string, Set<string>>,
                         clause: Clause, liveFlags: Set<string>): ClauseDiagnosis {
  const emptyDims: DeadDim[] = [];
  for (const b of rows(r, `empty(${clause.id}, D)`)) {
    const dim = b.D;
    const conds = clause.conds.filter((l) => l.dim === dim);
    const pairRow = rows(r, `conflict(${clause.id}, ${dim}, L1, L2)`)[0];
    const pair: [Cond, Cond] | null = pairRow
      ? [cfg.cond.get(pairRow.L1)!, cfg.cond.get(pairRow.L2)!] : null;
    const repairs = conds.filter((drop) => {
      const rest = conds.filter((l) => l.id !== drop.id);
      if (rest.length === 0) return true;
      let acc = new Set(sets.get(rest[0].id) ?? []);
      for (const l of rest.slice(1)) acc = new Set([...acc].filter((v) => sets.get(l.id)?.has(v)));
      return acc.size > 0;
    });
    emptyDims.push({ dim, conds, pair, repairs });
  }
  const blockedBy = clause.needs.filter((g) => !liveFlags.has(g));
  return { clause, emptyDims, blockedBy };
}

export const liveSet = (r: Rofl): Set<string> => new Set(col(r, 'live(F)', 'F'));

// ===========================================================================
// BEST-DERIVATION — not "reachable" but a context, ready to paste into a test.
//
// A flag is on in a context when one of its clauses admits that context AND
// every flag that clause needs is itself on there. So a witness is a COALITION
// of clauses — one per flag in the requirement closure — whose per-dimension
// admitted sets all intersect. The search over coalitions is host code (v0 has
// no choice operator); the sets it intersects are the engine's `admits/3`, and
// the answer is handed straight back to the engine to prove.
// ===========================================================================

export interface Witness { ctx: Record<string, string>; coalition: string[]; }

export function findWitness(cfg: Config, adm: Map<string, Map<string, Set<string>>>,
                            usable: Set<string>, flag: string): Witness | null {
  const dims = cfg.dims.map((d) => d.name);

  const search = (flags: string[], chosen: string[]): string[] | null => {
    if (flags.length === 0) return chosen;
    const [f, ...restFlags] = flags;
    if (chosen.some((c) => cfg.clause.get(c)!.flag === f)) return search(restFlags, chosen);
    for (const c of cfg.byFlag.get(f) ?? []) {
      if (!usable.has(c.id)) continue;
      const next = [...chosen, c.id];
      if (!feasible(next)) continue;
      const got = search([...restFlags, ...cfg.clause.get(c.id)!.needs], next);
      if (got) return got;
    }
    return null;
  };

  const feasible = (cs: string[]): boolean =>
    dims.every((d) => intersect(cs, d).length > 0);

  const intersect = (cs: string[], d: string): string[] => {
    const dim = cfg.dims.find((x) => x.name === d)!;
    return dim.values.filter((v) => cs.every((c) => adm.get(c)?.get(d)?.has(v)));
  };

  const coalition = search([flag], []);
  if (!coalition) return null;
  const ctx: Record<string, string> = {};
  for (const d of dims) ctx[d] = intersect(coalition, d)[0];
  return { ctx, coalition: coalition.sort() };
}

export const renderCtx = (ctx: Record<string, string>): string =>
  Object.entries(ctx).map(([d, v]) => `${d}=${v}`).join(' ');

// ===========================================================================
// SEMIRINGS
// ===========================================================================

/** How many INDEPENDENT routes enable a flag: one per usable clause, times
 *  the routes of every flag it needs.
 *
 *  WHAT THE COUNT MEANS HERE (f_counting_reads_oppositely_by_domain asks every
 *  example to say it, because the same number reads in opposite directions
 *  across domains): in MOOT it is ROBUSTNESS, as in NOPE and OOPS, and not
 *  magnitude as in HUH. A flag with count 1 has exactly one way to be on, so
 *  the day that segment stops existing the flag silently dies and no test
 *  fails. A flag with count 3 survives losing two of them. It is not "how many
 *  users see it" — the count is over derivations, not contexts. */
export function routeCounts(r: Rofl): { count: Map<string, Count>; cyclic: number } {
  const fold = evaluateSemiring(r.store, countingSemiring, { maxRounds: 200 });
  const count = new Map<string, Count>();
  for (const [k, v] of fold.value) {
    const m = /^live\[main\]\((.*)\)$/.exec(k);
    if (m) count.set(m[1], v);
  }
  return { count, cyclic: fold.cyclic };
}

/** Firings on the cheapest derivation of `live(F)`. Under these rules a flag
 *  whose shortest enabling route passes through G gate flags costs exactly
 *  5G + 4 firings; the identity is checked, not assumed, and what it reports
 *  is GATE DEPTH — how many other flags must be on first. */
export function gateDepth(r: Rofl): Map<string, number> {
  const fold = evaluateSemiring(r.store, tropicalSemiring,
    { weight: unitFiringCost, maxRounds: 200 });
  const out = new Map<string, number>();
  for (const f of col(r, 'live(F)', 'F')) {
    const cost = fold.value.get(`live[main](${f})`);
    if (cost === undefined || cost === Infinity) continue;
    if ((cost - 4) % 5 !== 0) throw new Error(`moot: cost ${cost} for ${f} is not 5G + 4`);
    out.set(f, (cost - 4) / 5);
  }
  return out;
}

/** Which relations the cyclic facts of the support graph belong to. A cycle
 *  is a property of the DATA, not of the rules: `live/1` is recursive and its
 *  facts are acyclic here because the requirement graph of the config is a
 *  DAG, while boot.rofl's `reach/2` really does close a cycle over MOOT's own
 *  mutually recursive relations. The counting answer is finite for exactly the
 *  facts where that matters, and this reports which is which. */
export function cyclicByRelation(r: Rofl): Map<string, number> {
  const fold = evaluateSemiring(r.store, countingSemiring, { maxRounds: 200 });
  const out = new Map<string, number>();
  for (const [k, v] of fold.value) {
    if (v !== 0n && typeof v !== 'bigint') {
      const rel = k.slice(0, k.indexOf('['));
      out.set(rel, (out.get(rel) ?? 0) + 1);
    }
  }
  return out;
}

// ===========================================================================
// THE SELF-APPLICATION — MOOT pointed at a ROFL program's own rules.
//
// The mapping is not an analogy, it is the same structure read twice:
//
//   flag        := a relation
//   clause      := a rule concluding it, plus one condition-free clause when
//                  the store holds BASE facts for that relation
//   condition   := one body element of that rule, as a dimension over
//                  {yes, no} constrained to `yes`
//   requirement := a relation the rule reads POSITIVELY (a negated premise
//                  over an empty relation succeeds, so it gates nothing —
//                  the same reasoning boot.rofl's `undefined_premise` uses)
//
// Under that mapping the five verdicts read:
//
//   unreachable   the relation can never hold a fact — TRANSITIVELY, which is
//                 strictly more than boot's one-step `undefined_premise`
//   shadowed      one rule's body is a subset of another's with the same head,
//                 so the second concludes nothing the first did not. That is
//                 the entailment-between-bodies question, decided exactly by
//                 the same per-dimension containment
//   tautological  a rule with no premises: an axiom, or an input relation
//   dependent     every rule of this relation reads that one
//   contradictory NO ANALOGUE. It needs a declared `exclusive/2`, and a rule
//                 set declares no mutual exclusions. Four of the five transfer;
//                 saying which one does not is part of the answer.
//
// The verdict is about the program AS LOADED, facts included: a rule whose
// input relation is empty cannot fire in THIS store, and asserting the input
// revives it. demo.ts shows both halves of that.
// ===========================================================================

import { decodeRules, ruleIdOf } from '../../src/reflect.ts';
import { canonBodyElem, canonLit } from '../../src/reflect.ts';
import { parseProgram } from '../../src/parser.ts';

export interface SelfEncoding {
  facts: string;
  dimText: Map<string, string>;     // p3 -> the premise, as written
  clauseText: Map<string, string>;  // rule id -> the rule, canonically
  clauseHead: Map<string, string>;  // rule id -> the relation it concludes
  rules: number;
  dims: number;
  flags: number;
}

/** Encode the rules of `sources` — as loaded into `r` — as a MOOT config. */
export function encodeProgram(r: Rofl, sources: string[]): SelfEncoding {
  const wanted = new Set<string>();
  for (const src of sources) {
    for (const c of parseProgram(src)) if (c.body.length > 0) wanted.add(ruleIdOf(c));
  }
  const decoded = decodeRules(r.store).rules.filter((d) => wanted.has(d.id));

  const baseRels = new Set<string>();
  for (const f of r.store.facts.values()) if (f.base) baseRels.add(f.rel);

  const dimOf = new Map<string, string>();      // premise text -> dim id
  const dimText = new Map<string, string>();
  const clauseText = new Map<string, string>();
  const clauseHead = new Map<string, string>();
  const rels = new Set<string>();
  const byRel = new Map<string, string[]>();

  for (const d of decoded) {
    const rel = d.clause.head.rel;
    rels.add(rel);
    clauseText.set(d.id, d.canon);
    clauseHead.set(d.id, rel);
    let arr = byRel.get(rel);
    if (!arr) { arr = []; byRel.set(rel, arr); }
    arr.push(d.id);
    for (const b of d.clause.body) {
      const text = canonBodyElem(b);
      if (!dimOf.has(text)) {
        const id = `p${dimOf.size + 1}`;
        dimOf.set(text, id);
        dimText.set(id, text);
      }
      if (b.t === 'pos') rels.add(b.lit.rel);
    }
  }
  for (const rel of baseRels) if (byRel.has(rel) || rels.has(rel)) rels.add(rel);

  const out: string[] = [];
  for (const [text, id] of dimOf) {
    out.push(`dim(${id}).`);
    out.push(`dom(${id}, yes).`);
    out.push(`dom(${id}, no).`);
  }
  void dimText;
  for (const rel of [...rels].sort()) out.push(`flag(${rel}).`);
  for (const rel of [...rels].sort()) {
    let i = 0;
    for (const id of (byRel.get(rel) ?? [])) {
      i++;
      const d = decoded.find((x) => x.id === id)!;
      out.push(`ordered(${rel}, ${id}, ${i}).`);
      const needs = [...new Set(d.clause.body.filter((b) => b.t === 'pos')
        .map((b) => (b as { lit: { rel: string } }).lit.rel))]
        .filter((x) => rels.has(x));
      out.push(`req_count(${id}, ${needs.length}).`);
      needs.forEach((g, k) => {
        out.push(`requires(${id}, ${g}).`);
        out.push(`req_at(${id}, ${k + 1}, ${g}).`);
      });
      d.clause.body.forEach((b, k) => {
        const dim = dimOf.get(canonBodyElem(b))!;
        out.push(`cond_of(${id}, ${id}_${k + 1}).`);
        out.push(`cond(${id}_${k + 1}, ${dim}, eq, yes).`);
      });
    }
    if (baseRels.has(rel)) {
      i++;
      out.push(`ordered(${rel}, base_${rel}, ${i}).`);
      out.push(`req_count(base_${rel}, 0).`);
    }
  }
  return {
    facts: out.join('\n') + '\n',
    dimText, clauseText, clauseHead,
    rules: decoded.length, dims: dimOf.size, flags: rels.size,
  };
}

/** A second analyzer world, whose config IS the first world's rule set. */
export function selfWorld(enc: SelfEncoding): Rofl {
  const r = new Rofl();
  must(r.load(BOOT, { budget: BUDGET }), 'boot.rofl');
  must(r.load(MOOT, { budget: BUDGET }), 'moot.rofl');
  must(r.load(enc.facts, { budget: BUDGET }), 'the encoded rule set');
  return r;
}

/** Rules that can never fire in the store they were encoded from. */
export function deadRules(r: Rofl, enc: SelfEncoding): { rule: string; rel: string }[] {
  const usable = new Set(col(r, 'usable(C)', 'C'));
  return [...enc.clauseText.keys()].filter((id) => !usable.has(id)).sort()
    .map((id) => ({ rule: id, rel: enc.clauseHead.get(id)! }));
}

// ===========================================================================
// THE ORACLE — exhaustive enumeration of the declared context space.
//
// Plain TypeScript. It shares the parsed config with the engine and NOTHING
// else: no rule, no derived relation, no semiring. Because every dimension is
// finite and declared, and every condition constrains one dimension, walking
// the whole product decides every question this file asks — it is a COMPLETE
// oracle, not a sample. That completeness is exactly what stops at the
// boundary moot.rofl names: an unbounded dimension has no product to walk, and
// a constraint relating two dimensions makes the walk itself the wrong shape.
// ===========================================================================

/** Does one condition admit one value? The engine's answer to this lives in
 *  moot.rofl's six `cond_admits` rules; this is the independent second one. */
export function oracleAdmits(c: Cond, v: string): boolean {
  switch (c.op) {
    case 'eq': return v === c.k;
    case 'ne': return v !== c.k;
    case 'ge': return Number(v) >= Number(c.k);
    case 'le': return Number(v) <= Number(c.k);
    case 'oneof': return c.alts.includes(v);
    case 'noneof': return !c.alts.includes(v);
  }
}

export interface OracleTables {
  contexts: number;
  /** clause id -> bitmap over contexts: the conditions match (requirements ignored) */
  condMatch: Map<string, Uint8Array>;
  /** clause id -> bitmap: the clause actually FIRES (conditions + requirements) */
  fires: Map<string, Uint8Array>;
  /** flag id -> bitmap: the flag is on */
  on: Map<string, Uint8Array>;
  onCount: Map<string, number>;
}

export function enumerate(cfg: Config): OracleTables {
  const dims = cfg.dims;
  const total = dims.reduce((n, d) => n * d.values.length, 1);
  const condMatch = new Map<string, Uint8Array>();
  const fires = new Map<string, Uint8Array>();
  const on = new Map<string, Uint8Array>();
  for (const c of cfg.clauses) {
    condMatch.set(c.id, new Uint8Array(total));
    fires.set(c.id, new Uint8Array(total));
  }
  for (const f of cfg.flags) on.set(f, new Uint8Array(total));

  const value: string[] = new Array(dims.length);
  for (let ix = 0; ix < total; ix++) {
    let rest = ix;
    for (let d = dims.length - 1; d >= 0; d--) {
      value[d] = dims[d].values[rest % dims[d].values.length];
      rest = Math.floor(rest / dims[d].values.length);
    }
    const byDim: Record<string, string> = {};
    dims.forEach((d, i) => { byDim[d.name] = value[i]; });

    for (const c of cfg.clauses) {
      condMatch.get(c.id)![ix] = c.conds.every((l) => oracleAdmits(l, byDim[l.dim])) ? 1 : 0;
    }
    // requirement closure: monotone, so iterate to a fixpoint
    for (;;) {
      let grew = false;
      for (const c of cfg.clauses) {
        if (fires.get(c.id)![ix] === 1) continue;
        if (condMatch.get(c.id)![ix] !== 1) continue;
        if (!c.needs.every((g) => on.get(g)![ix] === 1)) continue;
        fires.get(c.id)![ix] = 1;
        on.get(c.flag)![ix] = 1;
        grew = true;
      }
      if (!grew) break;
    }
  }
  const onCount = new Map<string, number>();
  for (const f of cfg.flags) {
    let n = 0;
    const b = on.get(f)!;
    for (let i = 0; i < total; i++) n += b[i];
    onCount.set(f, n);
  }
  return { contexts: total, condMatch, fires, on, onCount };
}

const subset = (a: Uint8Array, b: Uint8Array): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] === 1 && b[i] !== 1) return false;
  return true;
};
const nonEmpty = (a: Uint8Array): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] === 1) return true;
  return false;
};
const intersects = (a: Uint8Array, b: Uint8Array): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] === 1 && b[i] === 1) return true;
  return false;
};

export interface OracleCheck {
  what: string;
  claims: number;          // engine verdicts confirmed
  wrong: string[];         // engine verdicts the enumeration refutes
  missed: string[];        // cases the enumeration finds and the rules do not
}

export function oracleCheck(cfg: Config, t: OracleTables, v: Verdicts): {
  contexts: number; evaluations: number; checks: OracleCheck[];
} {
  const checks: OracleCheck[] = [];

  // 1. unreachable: on in NO context. Sound AND complete both ways.
  {
    const truth = cfg.flags.filter((f) => t.onCount.get(f) === 0).sort();
    const claimed = new Set(v.unreachable);
    checks.push({
      what: 'unreachable(F): F is off in every context',
      claims: v.unreachable.length,
      wrong: v.unreachable.filter((f) => t.onCount.get(f)! > 0)
        .map((f) => `${flagName(f)} is on in ${t.onCount.get(f)} contexts`),
      missed: truth.filter((f) => !claimed.has(f)).map(flagName),
    });
  }

  // 2. shadowed: every context where the dead clause fires, the other fires.
  {
    const wrong: string[] = [];
    for (const s of v.shadowed) {
      const dead = t.fires.get(s.dead)!, by = t.fires.get(s.by)!;
      if (!subset(dead, by)) wrong.push(`${s.dead} fires somewhere ${s.by} does not`);
      if (!nonEmpty(t.condMatch.get(s.dead)!)) wrong.push(`${s.dead} matches no context at all`);
    }
    const claimed = new Set(v.shadowed.map((s) => s.dead + '<' + s.by));
    const missed: string[] = [];
    for (const [flag, cs] of cfg.byFlag) {
      void flag;
      for (const a of cs) for (const b of cs) {
        if (a.index >= b.index) continue;
        if (!nonEmpty(t.condMatch.get(b.id)!)) continue;
        if (subset(t.fires.get(b.id)!, t.fires.get(a.id)!) && !claimed.has(b.id + '<' + a.id)) {
          missed.push(`${b.id} is subsumed by ${a.id}`);
        }
      }
    }
    checks.push({
      what: 'shadowed(F, C, C0): C fires only where C0 does',
      claims: v.shadowed.length, wrong, missed,
    });
  }

  // 3. tautological: the clause fires in EVERY context. The completeness gap
  // is the interesting half — a flag on everywhere with no total clause.
  {
    const wrong: string[] = [];
    for (const s of v.tautological) {
      const b = t.fires.get(s.clause)!;
      let n = 0;
      for (let i = 0; i < b.length; i++) n += b[i];
      if (n !== t.contexts) wrong.push(`${s.clause} fires in ${n} of ${t.contexts} contexts`);
    }
    const claimedFlags = new Set(v.tautological.map((s) => s.flag));
    const missed = cfg.flags
      .filter((f) => t.onCount.get(f) === t.contexts && !claimedFlags.has(f))
      .map((f) => `${flagName(f)} is on in all ${t.contexts} contexts, by a UNION of partial clauses`);
    checks.push({
      what: 'tautological(F, C): C fires in every context',
      claims: v.tautological.length, wrong, missed,
    });
  }

  // 4. contradictory: some context has both flags on.
  {
    const wrong: string[] = [];
    for (const s of v.contradictory) {
      if (!intersects(t.on.get(s.a)!, t.on.get(s.b)!)) {
        wrong.push(`${flagName(s.a)} and ${flagName(s.b)} are never on together`);
      }
    }
    const claimed = new Set(v.contradictory.map((s) => s.a + '|' + s.b));
    const missed = cfg.exclusives
      .filter(([a, b]) => intersects(t.on.get(a)!, t.on.get(b)!) && !claimed.has(a + '|' + b))
      .map(([a, b]) => `${flagName(a)} and ${flagName(b)} overlap`);
    checks.push({
      what: 'contradictory(F, G): both on in some context',
      claims: v.contradictory.length, wrong, missed,
    });
  }

  // 5. dependent: wherever F is on, G is on, and F is on somewhere.
  {
    const wrong: string[] = [];
    for (const s of v.dependent) {
      if (!subset(t.on.get(s.flag)!, t.on.get(s.on)!)) {
        wrong.push(`${flagName(s.flag)} is on somewhere ${flagName(s.on)} is not`);
      }
      if (t.onCount.get(s.flag) === 0) wrong.push(`${flagName(s.flag)} is never on`);
    }
    const claimed = new Set(v.dependent.map((s) => s.flag + '|' + s.on));
    const missed: string[] = [];
    for (const [f, cs] of cfg.byFlag) {
      if (t.onCount.get(f) === 0) continue;
      const gs = new Set(cs.flatMap((c) => c.needs));
      for (const g of gs) {
        if (subset(t.on.get(f)!, t.on.get(g)!) && !claimed.has(f + '|' + g)) {
          missed.push(`${flagName(f)} is on only where ${flagName(g)} is`);
        }
      }
    }
    checks.push({
      what: 'dependent(F, G): F is on only where G is',
      claims: v.dependent.length, wrong, missed,
    });
  }

  return {
    contexts: t.contexts,
    evaluations: t.contexts * cfg.flags.length,
    checks,
  };
}

// ===========================================================================
// hygiene the whole transcript rests on
// ===========================================================================

export interface Hygiene {
  rules: number; allSafe: boolean; demandRels: number;
  unstratified: string[]; audits: Record<string, number>;
  strata: { rel: string; level: number }[];
}

/** Every rule range-restricted, nothing demand-evaluated, nothing
 *  unstratifiable, every boot audit empty. If a rule were unsafe the engine
 *  would unfold it top-down at call sites and the semiring folds below would
 *  run over a different fact set than the verdicts describe — so this is
 *  checked, not assumed. */
export function hygiene(r: Rofl, watch: string[]): Hygiene {
  // THE SCHEDULE, off the peel. boot.rofl used to derive `stratum/2` and
  // `unstratified/1` and this read them out of the store; the ten rules that
  // did so were deleted once the evaluator started peeling its schedule off the
  // decoded rules instead. The round a relation settles in IS its level, and a
  // relation still standing when a round settles nothing IS unstratifiable —
  // the same two answers, now read from the schedule that was actually used.
  const ev = new Evaluation(r.store, { budget: BUDGET });
  const peel = peelRounds(ev.rules);
  const strata = peel.round;
  return {
    rules: ev.rules.length,
    allSafe: ev.rules.every((x) => x.safe),
    demandRels: ev.demandRels.size,
    unstratified: peel.stuck,
    audits: {
      malformed: rows(r, 'malformed[audit](R)').length,
      breach: rows(r, 'breach[audit](R)').length,
      leak: rows(r, 'leak[audit](A, B)').length,
      forged: rows(r, 'forged[audit](F)').length,
      unmoded: rows(r, 'unmoded[audit](R)').length,
      undefined_premise: rows(r, 'undefined_premise[audit](R, Rel)').length,
    },
    strata: watch.map((rel) => ({ rel, level: strata.get(rel) ?? -1 })),
  };
}

// ===========================================================================
// the transcript
// ===========================================================================

const WIDTH = 78;
const STRATA_WATCH = [
  'cond_admits', 'rejects', 'admits', 'empty', 'usable', 'live',
  'unreachable', 'shadowed', 'tautological', 'contradictory', 'dependent',
];

export function wrap(items: string[], indent: string, width: number = WIDTH): string[] {
  const out: string[] = [];
  let line = indent;
  for (const it of items) {
    if (line !== indent && line.length + 1 + it.length > width) { out.push(line); line = indent; }
    line += (line === indent ? '' : ' ') + it;
  }
  if (line !== indent) out.push(line);
  return out;
}

function main(): void {
  const t0 = Date.now();
  const say = (s: string = '') => { console.log(s); };
  const rule = (title: string) => { say(); say(('== ' + title + ' ').padEnd(WIDTH, '=')); };
  const verdictLog: string[] = [];
  const check = (what: string, ok: boolean) => {
    verdictLog.push(`${ok ? 'AGREE   ' : 'DISAGREE'}  ${what}`);
    say(`  oracle: ${ok ? 'AGREE' : 'DISAGREE'} — ${what}`);
  };

  const r = world();
  const v = verdicts(r);
  const live = liveSet(r);
  const usable = new Set(col(r, 'usable(C)', 'C'));
  const sets = condSets(r);
  const adm = admitSets(r);
  const space = CFG.dims.reduce((n, d) => n * d.values.length, 1);

  say('MOOT — proving which feature flags are dead.');
  say('not "we saw no traffic": proofs about the structure of the conditions.');
  say();
  say(`config   ${CFG.flags.length} flags, ${CFG.clauses.length} clauses, ${CFG.cond.size} conditions, `
    + `${CFG.exclusives.length} exclusion, parsed into ${FACTS.trim().split('\n').length} facts`);
  say(`context  ${CFG.dims.map((d) => `${d.name}:${d.values.length}`).join(' x ')} = `
    + `${space.toLocaleString('en-US')} contexts`);
  say(`rules    examples/moot/moot.rofl, loaded next to boot.rofl`);

  // -- 0 -------------------------------------------------------------------
  rule('0. hygiene: what the rest of this transcript rests on');
  const hy = hygiene(r, STRATA_WATCH);
  say(`  ${hy.rules} rules loaded (boot.rofl + moot.rofl); every one range-restricted: ${hy.allSafe}`);
  say(`  relations evaluated by demand (top-down unfolding): ${hy.demandRels}`);
  say(`  unstratified: ${hy.unstratified.length === 0 ? '(none)' : hy.unstratified.join(' ')}`);
  say(`  boot.rofl's audits over MOOT's own reflection: `
    + Object.entries(hy.audits).map(([k, n]) => `${k} ${n}`).join(', '));
  say();
  say('  the strata boot.rofl computed for MOOT, from the rule dependency graph.');
  say('  Every verdict below negates something, so this is the ordering that makes');
  say('  them mean anything — read off stratum/2, not assumed:');
  for (const s of hy.strata) say(`    stratum(${s.rel},`.padEnd(30) + `${s.level})`);
  if (!hy.allSafe || hy.demandRels > 0 || hy.unstratified.length > 0) {
    throw new Error('moot: hygiene failed; the rest of the transcript would be about a different program');
  }

  // -- 1 -------------------------------------------------------------------
  rule('1. the five verdicts');
  const dead = new Set(v.unreachable);
  say(`${CFG.flags.length} flags in. ${dead.size} of them can never be on, `
    + `under any of the ${space.toLocaleString('en-US')} contexts:`);
  for (const f of v.unreachable) {
    const cs = CFG.byFlag.get(f)!;
    const why = cs.map((c) => {
      const d = diagnose(r, CFG, sets, c, live);
      if (d.emptyDims.length > 0) return `${d.emptyDims[0].dim} empty`;
      if (d.blockedBy.length > 0) return `needs ${flagName(d.blockedBy[0])}`;
      return '?';
    });
    say(`  unreachable   ${flagName(f).padEnd(16)} ${cs.length} clause(s): ${why.join(' | ')}`);
  }
  say();
  for (const s of v.shadowed) {
    say(`  shadowed      ${flagName(s.flag).padEnd(16)} ${s.dead} is contained in ${s.by}`);
    say(`                ${' '.repeat(16)} "${CFG.clause.get(s.dead)!.text}"`);
    say(`                ${' '.repeat(16)} inside "${CFG.clause.get(s.by)!.text}"`);
  }
  for (const s of v.tautological) {
    say(`  tautological  ${flagName(s.flag).padEnd(16)} ${s.clause} constrains nothing and needs nothing`);
  }
  for (const s of v.contradictory) {
    say(`  contradictory ${flagName(s.a)} and ${flagName(s.b)} are declared exclusive, and`);
    say(`                ${s.ca} overlaps ${s.cb}`);
  }
  say();
  say(`  dependent     ${v.dependent.length} flags cannot be enabled by their own condition at all:`);
  for (const l of wrap(v.dependent.map((s) => `${flagName(s.flag)}->${flagName(s.on)}`), '                ')) say(l);
  say();
  say('  A flag audit that counts requests would call most of these healthy: they');
  say('  have no traffic because they have no reachable context, which reads exactly');
  say('  like a flag nobody happens to have hit yet. The difference is a proof.');

  // -- 2 -------------------------------------------------------------------
  const FOCUS = 'f_new_checkout';
  rule(`2. whynot ${flagName(FOCUS)} — the question people answer with a canary`);
  say('$ moot -n new_checkout');
  say();
  say(r.whynot(`live(${FOCUS})`, { depth: 8, nodes: 96 }).text);
  say();
  say('read it as a sentence. new_checkout has two clauses and BOTH are dead, for');
  say('two different reasons, and the tree names both:');
  for (const c of CFG.byFlag.get(FOCUS)!) {
    const d = diagnose(r, CFG, sets, c, live);
    say();
    say(`  ${c.id}:  ${c.text}`);
    for (const g of d.blockedBy) {
      say(`    needs ${flagName(g)}, and ${flagName(g)} is itself unreachable —`);
      const gc = CFG.byFlag.get(g)![0];
      const gd = diagnose(r, CFG, sets, gc, live);
      const e = gd.emptyDims[0];
      say(`      ${gc.id}: ${gc.text}`);
      say(`      dimension '${e.dim}' is empty: `
        + (e.pair ? `"${e.pair[0].text}" and "${e.pair[1].text}" share no value` : 'no single pair does it'));
    }
    for (const e of d.emptyDims) {
      say(`    dimension '${e.dim}' admits nothing: `
        + (e.pair ? `"${e.pair[0].text}" and "${e.pair[1].text}" share no value` : 'no single pair does it'));
      say(`    to revive it, delete one of: ${e.repairs.map((x) => `"${x.text}"`).join(', ') || '(no single deletion suffices)'}`);
    }
  }
  say();
  say('and that is the whole answer: which condition, at which clause, and what');
  say('would have to change. Nobody had to ship it to a canary to find out.');

  // -- 3 -------------------------------------------------------------------
  const THREE = 'f_loyalty_banner';
  rule('3. the emptiness that no PAIR of conditions explains');
  const lb = CFG.byFlag.get(THREE)![0];
  const lbd = diagnose(r, CFG, sets, lb, live);
  say(`  ${flagName(THREE)}:  ${lb.text}`);
  say();
  for (const l of lb.conds) say(`    "${l.text}" admits {${[...(sets.get(l.id) ?? [])].sort().join(', ')}}`);
  say();
  say('  every PAIR of them intersects. All three together do not, and');
  say(`  conflict/4 correctly names no pair: ${lbd.emptyDims[0].pair === null}`);
  say('  `empty(C, D)` is the proof — the intersection itself, not a pairwise');
  say('  approximation of it. A linter that looks for contradicting pairs misses');
  say('  this flag, and this is the commonest way a segment list goes empty:');
  say('  three people each narrowed it once.');

  // -- 4 -------------------------------------------------------------------
  rule('4. best-derivation: not "reachable" but a context you can paste');
  const TARGETS = ['f_scim_provisioning', 'f_win_back_campaign', 'f_realtime_presence'];
  for (const f of TARGETS) {
    const w = findWitness(CFG, adm, usable, f);
    if (!w) { say(`  ${flagName(f)}: no witness`); continue; }
    say(`  ${flagName(f).padEnd(20)} ${renderCtx(w.ctx)}`);
    say(`  ${' '.repeat(20)} via ${w.coalition.join(' + ')}`);
  }
  const target = TARGETS[0];
  const wit = findWitness(CFG, adm, usable, target)!;
  say();
  say(`the engine is handed the first one back as ctx/2 facts and asked to prove it:`);
  say(`$ ctx(${Object.entries(wit.ctx).map(([d, x]) => `${d}, ${x}`).join(').  ctx(')}).`);
  const wr = world(wit.ctx);
  const onHere = new Set(col(wr, 'flag_on(F)', 'F'));
  say(`$ why flag_on(${target})`);
  say(wr.why(`flag_on(${target})`).text);
  say();
  say(`the tree bottoms out in admits/3 — the same per-dimension sets the audits`);
  say(`used — and in the requirement chain: scim_provisioning needs sso_saml, and`);
  say(`sso_saml is on in the same context. ${onHere.size} of ${CFG.flags.length} flags are on there.`);
  check(`the witness context turns ${flagName(target)} on`, onHere.has(target));

  // -- 5 -------------------------------------------------------------------
  rule('5. how fragile is a flag, and how deep is it gated (semirings)');
  const { count, cyclic } = routeCounts(r);
  const depth = gateDepth(r);
  const byCount = [...count.entries()].filter(([f]) => live.has(f))
    .sort((a, b) => Number(b[1] as bigint) - Number(a[1] as bigint) || (a[0] < b[0] ? -1 : 1));
  const fragile = byCount.filter(([, n]) => n === 1n);
  say(`counting over the support hypergraph: how many INDEPENDENT routes enable`);
  say(`each flag. ${fragile.length} of the ${live.size} live flags have exactly one:`);
  for (const l of wrap(fragile.map(([f]) => flagName(f)), '  ')) say(l);
  say();
  const plural = byCount.filter(([, n]) => n !== 1n);
  say('one route means one segment list, one version window, one gate flag. The');
  say(`day that segment stops existing the flag dies and no test fails. The ${plural.length}`);
  say('with more than one route survive losing one:');
  for (const [f, n] of plural) say(`  ${flagName(f).padEnd(24)} ${renderCount(n)}`);
  say();
  say('IN THIS DOMAIN THE COUNT IS ROBUSTNESS, not magnitude: it counts derivations');
  say('of live/1, never contexts or users. Two routes are two ways to be switched');
  say('on, the way two policies are two ways to be allowed in NOPE — not two log');
  say('lines, the way they are in HUH.');
  say();
  const cyc = cyclicByRelation(r);
  say(`the fold reports cyclic: ${cyclic} facts on a cycle of the support graph, all of`);
  say(`them in ${[...cyc.keys()].sort().join(', ')} — boot.rofl's transitive closure over MOOT's own`);
  say('mutually recursive relations (live -> usable -> ok_from -> live). NO flag fact');
  say('is on a cycle, because the requirement graph of this config is a DAG, which is');
  say('why every count above is a finite number rather than "infinitely many".');
  say(`  flag facts on a cycle: ${cyc.get('live') ?? 0}`);
  say();
  say('tropical (min-plus, 1 per firing) on the same graph gives GATE DEPTH: how');
  say('many other flags must already be on. The identity cost = 5G + 4 is checked,');
  say('not assumed — gateDepth() throws if a cost is not of that form.');
  const byDepth = new Map<number, string[]>();
  for (const [f, d] of depth) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(flagName(f));
  }
  for (const d of [...byDepth.keys()].sort()) {
    say(`  depth ${d}   ${byDepth.get(d)!.length} flags`
      + (d > 0 ? `   ${byDepth.get(d)!.sort().join(' ')}` : ''));
  }
  say();
  const prov = provenanceOfConditions(r);
  say('and one thing the semirings do NOT give here, measured rather than argued:');
  say(`provenance folded with the ${prov.condFacts} cond/4 facts as the base annotation puts`);
  say(`${prov.inLive} of them in the polynomial of live/1. Zero, and necessarily zero: liveness`);
  say('rests on `not dead_clause`, and a negated premise contributes the');
  say('multiplicative identity because finite failure carries no annotation');
  say('(src/semiring.ts says so in its header). An audit built on universal');
  say('quantification is exactly the shape that provenance cannot follow. The');
  say('per-condition answer comes from cond_admits/2 and empty/2 instead, which is');
  say('what section 2 printed.');

  // -- 6 -------------------------------------------------------------------
  rule('6. the engine pointed at boot.rofl — rules-as-data judging rules');
  const encB = encodeProgram(r, [BOOT]);
  say('boot.rofl is the meta-kernel: its rules, over the REFLECTION of a loaded');
  say('program, condemn that program. MOOT is the same faculty pointed at a domain.');
  say('So point MOOT at boot.rofl. The mapping is not an analogy — it is the same');
  say('structure read twice:');
  say();
  say('   flag := a relation      clause := a rule concluding it');
  say('   condition := one body element, over {yes, no}');
  say('   requirement := a relation the rule reads POSITIVELY');
  say();
  say(`  ${encB.rules} rules encoded as clauses over ${encB.dims} dimensions, ${encB.flags} relations as flags`);
  const sB = selfWorld(encB);
  const vB = verdicts(sB);
  const deadB = deadRules(sB, encB);
  say();
  say(`  unreachable relations: ${vB.unreachable.join(' ') || '(none)'}`);
  say(`  rules that can never fire in this store: ${deadB.length}`);
  for (const d of deadB) say(`    ${d.rule}  ${encB.clauseText.get(d.rule)}`);
  say(`  shadowed rule pairs: ${vB.shadowed.length === 0 ? '(none — no rule body of boot.rofl is a subset of a sibling)' : ''}`);
  for (const s of vB.shadowed) say(`    ${s.dead} inside ${s.by}`);
  say();
  say('READ THAT SECOND LINE. `forged[audit]` is boot.rofl\'s forgery audit: a fact');
  say('whose author is not an authority for the perspective it landed in. It reads');
  say('`asserted_by`, which the kernel emits only when an assert names a `who` —');
  say('and nothing in this store does. So the audit CANNOT FIRE. It has been');
  say('answering "clean" to every program in this repository, and it would answer');
  say('"clean" to a forged fact too. That is not a bug in the rule; it is a rule');
  say('with no input, and it is invisible to every test that asserts the audit is');
  say('empty. MOOT proves it in one query.');
  say();
  say('the same for `sees`: two of its three rules read `imports`, which boot.rofl');
  say('declares edb and nothing populates, so visibility here is reflexive only and');
  say('the `leak` audit is weaker than its text suggests. Both findings are about');
  say('the program AS LOADED, facts included — which is the correct reading, and it');
  say('is testable: give the input and watch the verdict flip.');
  say();
  const rAuth = world();
  must(rAuth.assert(`dim(${CFG.dims[0].name}).`, { who: 'release_captain' }), 'authored assert');
  rAuth.evaluate(BUDGET);
  const encB2 = encodeProgram(rAuth, [BOOT]);
  const sB2 = selfWorld(encB2);
  const vB2 = verdicts(sB2);
  const deadB2 = deadRules(sB2, encB2);
  say(`  $ assert dim(${CFG.dims[0].name}).   who = release_captain`);
  say(`  unreachable relations: ${vB2.unreachable.join(' ') || '(none)'}`);
  say(`  rules that can never fire: ${deadB2.length}`
    + ` — ${deadB2.map((d) => `${d.rule} (${d.rel})`).join(', ') || '(none)'}`);
  say(`  and boot.rofl's forgery audit, which could not fire a moment ago, now says:`);
  for (const b of rows(rAuth, 'forged[audit](F)')) say(`    forged[audit](${b.F})`);
  say(`  release_captain is not an authority for [main], so the first fact it ever`);
  say(`  authored is the first thing the audit catches. One assert moved the verdict`);
  say(`  from "cannot fire" to a finding.`);
  check('boot.rofl\'s forged/1 is unreachable until asserted_by is populated',
    vB.unreachable.includes('forged') && !vB2.unreachable.includes('forged'));

  // -- 7 -------------------------------------------------------------------
  rule('7. the engine pointed at ITSELF');
  const encM = encodeProgram(r, [MOOT]);
  say(`  ${encM.rules} rules of moot.rofl encoded as clauses over ${encM.dims} dimensions`);
  const sM = selfWorld(encM);
  const vM = verdicts(sM);
  const deadM = deadRules(sM, encM);
  say();
  say(`  unreachable relations: ${vM.unreachable.join(' ') || '(none)'}`);
  say(`  rules that can never fire in this store: ${deadM.length}`);
  for (const d of deadM) say(`    ${d.rule}  ${encM.clauseText.get(d.rule)}`);
  say(`  shadowed rule pairs: ${vM.shadowed.length}`
    + (vM.shadowed.length === 0 ? '  — and that is the honest answer.' : ''));
  for (const s of vM.shadowed) say(`    ${s.dead} inside ${s.by}`);
  say();
  say('MOOT finds its OWN evaluator layer dead: `ctx/2` is the one input a caller');
  say('supplies per query, and in a world where nobody asked about a context there');
  say('is none, so ctx_dim_ok/2 cannot fire and nothing downstream of it can. The');
  say('same verdict, on the same rules, in the world of section 4 — where a witness');
  say('context WAS asserted:');
  const encM2 = encodeProgram(wr, [MOOT]);
  const sM2 = selfWorld(encM2);
  say(`  unreachable relations: ${verdicts(sM2).unreachable.join(' ') || '(none)'}`);
  say();
  say('nothing was planted. `shadowed` came back empty for both programs, and empty');
  say('is what gets printed: no rule body in boot.rofl or moot.rofl is a subset of a');
  say('sibling with the same head. The six cond_admits rules are the near miss —');
  say('same premise RELATIONS, different operands — and they are correctly NOT');
  say('condemned, because the dimensions are premises as written, not relation names.');
  check('the self-application finds moot.rofl\'s evaluator layer dead without a context',
    vM.unreachable.includes('ctx_dim_ok') && !verdicts(sM2).unreachable.includes('ctx_dim_ok'));

  // -- 8 -------------------------------------------------------------------
  rule('8. the oracle: every context, enumerated');
  const tbl = enumerate(CFG);
  const res = oracleCheck(CFG, tbl, v);
  say('the same questions decided a second time, by walking the whole declared');
  say('context space in plain TypeScript that shares no rule with the engine.');
  say('Because every dimension is finite and every condition constrains exactly');
  say('one of them, that walk is a COMPLETE oracle and not a sample:');
  say();
  say(`  ${res.contexts.toLocaleString('en-US')} contexts x ${CFG.flags.length} flags = `
    + `${res.evaluations.toLocaleString('en-US')} evaluations`);
  say();
  for (const c of res.checks) {
    say(`  ${String(c.claims).padStart(2)} claims   ${c.what}`);
    say(`             refuted: ${c.wrong.length === 0 ? 'none' : ''}`);
    for (const w of c.wrong) say(`               ${w}`);
    if (c.missed.length > 0) {
      say(`             found by enumeration and NOT claimed by the rules:`);
      for (const m of c.missed) say(`               ${m}`);
    }
    check(c.what, c.wrong.length === 0);
  }
  say();
  say('the two gaps are the point of the section, not an embarrassment:');
  say();
  say('  search_rerank is on in every one of the 23,040 contexts, and no single');
  say('  clause of it is total: two partial segment lists cover the space between');
  say('  them. DNF tautology does not decompose per dimension the way emptiness and');
  say('  containment do (it is co-NP-hard in general), so tautological/2 does not');
  say('  claim it. Enumeration finds it because enumeration does not decompose.');
  say();
  say('  bulk_export is on only where data_lake is, and yet is NOT dependent on it:');
  say('  its first clause never asks for data_lake. The implication is an ACCIDENT');
  say('  of the two condition sets, not a contract, and it evaporates the moment');
  say('  either is edited. dependent/2 reports the contract; the enumeration reports');
  say('  today\'s coincidence. Which one you want is a real question — and the');
  say('  actionable one is the contract.');

  // -- 9 -------------------------------------------------------------------
  rule('9. where this stops');
  say('every dimension is FINITE and DECLARED (dim/1, dom/2), and every condition');
  say('constrains exactly one of them. Those two hypotheses carry the whole file:');
  say('the contexts a clause admits are then a PRODUCT of per-dimension sets, so');
  say('satisfiability and containment both decompose, and enumeration decides');
  say('everything. Neither hypothesis is about the operators — `version >= 7` is a');
  say('comparison and stays inside them, because on a finite domain it denotes a');
  say('finite set that moot.rofl enumerates with an ordinary rule.');
  say();
  say('what breaks it:');
  say('  * an UNBOUNDED dimension (a timestamp, a float): no product to walk, and');
  say('    the oracle stops being complete;');
  say('  * a constraint RELATING two dimensions (bucket < version * 8): contexts(C)');
  say('    is no longer a product, so (1) and (2) both fail and per-dimension');
  say('    emptiness is neither sound nor complete for the clause;');
  say('  * a hash function over the user id, which is what a real percentage');
  say('    rollout is: `bucket` here is the OUTPUT of that hash, declared as a');
  say('    dimension, and MOOT reasons about the bucket, never about the hash.');
  say('past those, the answers need SMT and stop being complete. That is a real');
  say('boundary, stated here rather than discovered by a reader.');

  // -- summary -------------------------------------------------------------
  rule('summary');
  say(`${verdictLog.length} checks against an independent enumeration of the whole context space:`);
  for (const x of verdictLog) say('  ' + x);
  const bad = verdictLog.filter((x) => x.startsWith('DISAGREE')).length;
  say();
  say(bad === 0
    ? 'no verdict the rules reached is refuted by walking all 23,040 contexts.'
    : `${bad} DISAGREEMENT(S) — that is the finding; the engine's answer stands as computed.`);
  say(`(${Date.now() - t0} ms)`);
  if (bad > 0) process.exitCode = 1;
}

/** Provenance folded with the config's conditions as the base annotation.
 *  Reported as a measurement, because the answer is zero and the reason is
 *  structural: `live/1` rests on a negation, and finite failure carries no
 *  annotation. */
export function provenanceOfConditions(r: Rofl): { condFacts: number; inLive: number } {
  const isCond = (key: string) => key.startsWith('cond[main](');
  const fold = evaluateSemiring(r.store, provenanceSemiring, {
    base: (key) => (isCond(key) ? provenanceOf(key) : provenanceSemiring.one),
    maxRounds: 200,
  });
  let inLive = 0;
  for (const [k, poly] of fold.value) {
    if (!k.startsWith('live[main](')) continue;
    for (const m of poly) for (const t of m) if (isCond(t)) inLive++;
  }
  return { condFacts: r.store.relCount('cond'), inLive };
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1]
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();
