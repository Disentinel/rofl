// demo.ts — AKA: bridges between perspectives, end to end.
//
//   node --experimental-strip-types examples/aka/demo.ts
//
// Everything printed here is computed by the kernel from examples/aka/aka.rofl.
// Nothing in the transcript is composed by hand; README.md and page.html paste
// this program's stdout.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, viterbiSemiring, logProbOf, probabilityOf, clearsThreshold,
  provenanceSemiring, provenanceOf, renderCount, renderLogProb,
  INFINITE, type Count, type LogProb,
} from '../../runtime/semirings.ts';
import type { FoldResult } from '../../src/semiring.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const MODEL = read('examples', 'aka', 'aka.rofl');

/** The quarter written into aka.rofl as the seed; `asOf` swaps it out. */
export const SEED_QUARTER = 'q3';

/** THE STANDARD OF PROOF on a number that crossed a bridge. A policy, not a
 *  measurement, so it lives here and not in the rules — exactly as SUS keeps
 *  its three-worlds-in-four standard out of `sus.rofl`. "Clear and
 *  convincing": a total is reportable if the product of the confidences of
 *  every bridge it crossed clears 0.6. */
export const CERTAINTY_STANDARD = 0.6;

// ---------------------------------------------------------------------------
// loading: one section per writer
//
// `-- @who X` in aka.rofl is a comment to the parser and a section marker to
// this loader. Each author's mappings are loaded under that author's identity,
// so `asserted_by` is the load identity checked against `authority` — never a
// column somebody could fill in with any name they liked.

export interface Section { who: string; text: string; }

export function sections(text: string): Section[] {
  const out: Section[] = [];
  let who = 'analyst';
  let buf: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^--\s*@who\s+([a-z_]+)\s*$/.exec(line);
    if (m) { out.push({ who, text: buf.join('\n') }); who = m[1]; buf = []; }
    else buf.push(line);
  }
  out.push({ who, text: buf.join('\n') });
  return out.filter((s) => s.text.trim().length > 0);
}

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

/** Loading boot plus seven sections costs about a second, and every arm below
 *  wants its own copy, so the loaded table is snapshotted once and restored
 *  per caller. */
let TEMPLATE: string | null = null;

function build(): Rofl {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  for (const s of sections(MODEL)) must(r.load(s.text, { who: s.who }), `aka.rofl [@who ${s.who}]`);
  return r;
}

/** The books as shipped, at the seeded quarter. */
export function world(): Rofl {
  if (TEMPLATE === null) TEMPLATE = build().save();
  return Rofl.fromSnapshot(TEMPLATE);
}

/** The same books reconciled AT another quarter: the same ledgers, a different
 *  parameter. No ticks are ever run in this example — `@next` would put every
 *  carried fact on a support cycle and the counting semiring, which is the
 *  metric in section 6, would answer "infinitely many" for everything
 *  (examples/oops found this; examples/sus pays for it). */
const AS_OF = new Map<string, Rofl>();

export function asOf(quarter: string): Rofl {
  const hit = AS_OF.get(quarter);
  if (hit) return hit;
  const r = world();
  if (!r.retract(`quarter[main](${SEED_QUARTER})`).ok) throw new Error('quarter seed not found');
  must(r.assert(`quarter[main](${quarter}).`, { who: 'analyst' }), `quarter(${quarter})`);
  r.evaluate();
  AS_OF.set(quarter, r);
  return r;
}

/** The books with one bridge taken back by its author. */
export function withoutBridge(bridgeId: string, author: string): Rofl {
  const r = world();
  must(r.load(`withdrawn[${author}](${bridgeId}).`, { who: AUTHOR_WHO[author] }), `withdraw ${bridgeId}`);
  r.evaluate();
  return r;
}

export const AUTHOR_WHO: Record<string, string> = {
  integration: 'integration_team', finance: 'finance_ops', sales: 'sales_ops',
};

// ---------------------------------------------------------------------------
// small helpers over query results

/** `query` takes ONE literal, and a mistyped one comes back as an empty
 *  result with an `error` field rather than as a throw — which reads exactly
 *  like "no rows" and is how a transcript quietly becomes fiction. Every
 *  query in this file goes through here, and here it throws. */
export function ask(r: Rofl, q: string): Record<string, string>[] {
  const res = r.query(q);
  if (res.error) throw new Error(`query ${q}: ${res.error}`);
  return res.rows.map((x) => x.bindings);
}
export const col = (r: Rofl, q: string, v: string): string[] =>
  ask(r, q).map((x) => x[v]);
export const pairs = (r: Rofl, q: string, a: string, b: string): [string, string][] =>
  ask(r, q).map((x) => [x[a], x[b]] as [string, string]);
export const quarterOf = (r: Rofl): string => one(r, 'quarter[main](Q)', 'Q');
export const one = (r: Rofl, q: string, v: string): string => {
  const xs = col(r, q, v);
  if (xs.length !== 1) throw new Error(`${q}: expected exactly one row, got ${xs.length}`);
  return xs[0];
};
export const num = (r: Rofl, q: string, v: string): number => Number(one(r, q, v));
const list = (xs: string[]): string => (xs.length === 0 ? '(none)' : xs.join(', '));
const indent = (s: string, n: number) =>
  s.split('\n').map((l) => (l.length === 0 ? '' : ' '.repeat(n) + l)).join('\n');

export const money = (n: number): string => {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US')}`;
};
export const millions = (n: number): string =>
  `${n < 0 ? '-' : ''}${(Math.abs(n) / 1e6).toFixed(2)}M`;

/** Domain facts only: what a person reading these books can see. Kernel
 *  reflection, boot's audits and provenance are excluded. */
const DOMAIN = /^(account|entity|invoice|inv_no|rows|customer|cust_no|booked|maps|withdrawn|bridge|retracted|target|mapped_acct|unmapped_acct|corroborated|split|disputed|link|live_link|route|paths|carried|ambiguous|in_quarter|unmapped|attributed|loose|tag|counts|tagged|at|scan|total|gap|reconciles|short|over|would_close|proposed|sharpen|add_bridge|residual|refuted_bridge|conclusion|crossed|crossing|within_one_book|declared_amb|declared_attr|rests_on|leaf|gone|standing|at_risk|shaken|quarter)\[/;
export const domainFacts = (r: Rofl): string[] =>
  r.factKeys().filter((k) => DOMAIN.test(k)).sort();

// ---------------------------------------------------------------------------
// `aka trace revenue_<quarter> --from billing --to crm`

export interface Trace {
  quarter: string;
  billing: number;         // every invoice in the quarter
  attributed: number;      // landed on exactly one customer
  ambiguous: number;       // more than one candidate customer
  unmapped: number;        // no candidate at all
  crmBooked: number;       // the CRM's own reported total
  invoices: number;
  ambiguousInvoices: string[];
  unmappedInvoices: string[];
  bridges: number;         // live bridges the quarter's money crossed
  authors: string[];
  underPolicy: number;     // attributed + ambiguous resolved by best confidence
}

export function trace(r: Rofl): Trace {
  const quarter = quarterOf(r);
  const t = (tag: string) => num(r, `total[recon](${tag}, S)`, 'S');
  const crossed = new Set(col(r, 'crossed[recon](_, B, _, _)', 'B'));
  const authors = [...new Set(col(r, 'crossed[recon](_, _, X, _)', 'X'))].sort();
  const attributed = t('attributed');
  const ambiguous = t('ambiguous');
  return {
    quarter,
    billing: t('billing'), attributed, ambiguous, unmapped: t('unmapped'),
    crmBooked: t('crm_booked'),
    invoices: col(r, 'in_quarter[recon](I)', 'I').length,
    ambiguousInvoices: col(r, 'ambiguous[recon](I)', 'I'),
    unmappedInvoices: col(r, 'unmapped[recon](I)', 'I'),
    bridges: crossed.size, authors,
    underPolicy: attributed + ambiguous,
  };
}

export function traceText(r: Rofl): string {
  const t = trace(r);
  const out: string[] = [`$ aka trace revenue_${t.quarter} --from billing --to crm`];
  out.push(millions(t.billing));
  out.push('');
  out.push(`  within billing: ${millions(t.billing)}   [${t.invoices} invoices, `
    + `${money(t.billing)}, no mapping involved]`);
  out.push(`  bridge invoice.account -> crm.customer`);
  const authors = new Map<string, string[]>();
  for (const [b, x] of pairs(r, 'crossed[recon](_, B, X, _)', 'B', 'X')) {
    if (!authors.has(x)) authors.set(x, []);
    if (!authors.get(x)!.includes(b)) authors.get(x)!.push(b);
  }
  for (const a of [...authors.keys()].sort()) {
    const bs = authors.get(a)!.sort();
    const confs = bs.map((b) => `${b} ${(num(r, `bridge[recon](${b}, _, _, _, Conf)`, 'Conf') / 100).toFixed(2)}`);
    out.push(`    author: ${a}, confidence ${confs.join('  ')}`);
  }
  out.push(`    ${t.ambiguousInvoices.length} invoices map ambiguously (2+ candidates): `
    + `${t.ambiguousInvoices.join(' ')}`);
  out.push(`  in crm: ${millions(t.attributed)} — ${millions(t.ambiguous)} ambiguous, `
    + `${millions(t.unmapped)} maps to nothing`);
  out.push('');
  out.push(`  result marked: crossed a perspective boundary — ${t.bridges} bridge assertions`);
  out.push(`  of one mapping kind, by ${t.authors.length} authors (${list(t.authors)}).`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// the reconciliation

export interface Recon { customer: string; attributed: number; booked: number; gap: number; }

export function reconciliation(r: Rofl): Recon[] {
  const q = quarterOf(r);
  return col(r, 'customer[crm](C, _)', 'C').map((c) => ({
    customer: c,
    attributed: num(r, `total[recon](cust(${c}), S)`, 'S'),
    booked: num(r, `booked[crm](${c}, S, ${q})`, 'S'),
    gap: num(r, `gap[recon](${c}, G)`, 'G'),
  })).sort((a, b) => a.gap - b.gap || (a.customer < b.customer ? -1 : 1));
}

// ---------------------------------------------------------------------------
// the mark: which numbers crossed a boundary, and how sure the crossing is
//
// The Viterbi carrier holds the confidence of a whole derivation. Every
// firing that consumes a live bridge is weighted by that bridge's author's
// confidence; everything else is certain. So a total derived inside the
// billing book alone scores 1.000, and a total that crossed four bridges
// scores the product of their four confidences. The independence assumption
// is stated rather than hidden: the score treats each mapping as right or
// wrong independently of the others, which is false when one author's whole
// mapping table is built on the same misunderstanding.

export interface Certainty {
  node: string; value: number; score: LogProb; bridges: string[]; books: string[];
}

/** Which LEDGERS a conclusion's base facts live in, read off the provenance
 *  semiring rather than asserted: the minimal source set of a fact names its
 *  base facts, and a base fact key carries its own perspective. */
export function booksOf(r: Rofl, key: string): string[] {
  const p = provenanceFold(r).value.get(key) ?? [];
  const out = new Set<string>();
  for (const m of p) for (const f of m) {
    const b = /^[a-z_]+\[([a-z_]+)\]/.exec(f);
    if (b) out.add(b[1]);
  }
  return [...out].sort();
}

const PROV = new WeakMap<Rofl, FoldResult<readonly (readonly string[])[]>>();
export function provenanceFold(r: Rofl): FoldResult<readonly (readonly string[])[]> {
  let v = PROV.get(r);
  if (!v) { v = evaluateSemiring(r.store, provenanceSemiring, { base: provenanceOf }); PROV.set(r, v); }
  return v;
}

const VIT = new WeakMap<Rofl, FoldResult<LogProb>>();

export function certaintyFold(r: Rofl): FoldResult<LogProb> {
  let v = VIT.get(r);
  if (v) return v;
  const certain = logProbOf(1);
  const w = new Map<string, LogProb>();
  const conf = new Map(pairs(r, 'bridge[recon](B, _, _, _, Conf)', 'B', 'Conf')
    .map(([b, c]) => [b, Number(c) / 100]));
  for (const row of r.query('live_link[recon](I, C, B)').rows) {
    const { I, C, B } = row.bindings;
    w.set(`live_link[recon](${I},${C},${B})`, logProbOf(conf.get(B)!));
  }
  v = evaluateSemiring(r.store, viterbiSemiring, { weight: (key) => w.get(key) ?? certain });
  VIT.set(r, v);
  return v;
}

export function certaintyOf(r: Rofl, key: string): LogProb {
  const v = certaintyFold(r).value.get(key);
  if (v === undefined) throw new Error(`no such fact for the Viterbi fold: ${key}`);
  return v;
}

export function certainties(r: Rofl): Certainty[] {
  const out: Certainty[] = [];
  for (const [tag, s] of pairs(r, 'total[recon](T, S)', 'T', 'S')) {
    if (tag.startsWith('loose(')) continue;
    const node = `total(${tag})`;
    const bridges = [...new Set(col(r, `crossed[recon](${node}, B, _, _)`, 'B'))].sort();
    const key = `total[recon](${tag},${s})`;
    const score = certaintyOf(r, key);
    out.push({ node, value: Number(s), score, bridges, books: booksOf(r, key) });
  }
  return out.sort((a, b) => probabilityOf(a.score) - probabilityOf(b.score)
    || (a.node < b.node ? -1 : 1));
}

// ---------------------------------------------------------------------------
// counting: the same number, read two opposite ways
//
// `paths(Inv)` has one derivation per live mapping path the invoice has.
// `route(Inv, C)` has one derivation per bridge that lands it on C. The pair
// is the whole point: two paths to ONE customer is corroboration, two paths
// to TWO customers is ambiguity, and the count alone does not tell them
// apart. What tells them apart is `ambiguous`, which the rules derive.

export interface Ambiguity {
  invoice: string; amount: number; paths: Count; targets: string[];
  reading: 'unmapped' | 'the only reading' | 'corroborated' | 'AMBIGUOUS';
}

const COUNTS = new WeakMap<Rofl, FoldResult<Count>>();

export function counting(r: Rofl): FoldResult<Count> {
  let v = COUNTS.get(r);
  if (!v) { v = evaluateSemiring(r.store, countingSemiring); COUNTS.set(r, v); }
  return v;
}

export function ambiguities(r: Rofl): Ambiguity[] {
  const value = counting(r).value;
  return col(r, 'in_quarter[recon](I)', 'I').map((inv) => {
    const paths = value.get(`paths[recon](${inv})`) ?? 0n;
    const targets = col(r, `route[recon](${inv}, C)`, 'C').sort();
    const amb = r.holds(`ambiguous[recon](${inv})`);
    const reading = targets.length === 0 ? 'unmapped' as const
      : amb ? 'AMBIGUOUS' as const
      : paths === 1n ? 'the only reading' as const
      : 'corroborated' as const;
    return {
      invoice: inv, amount: num(r, `invoice[billing](${inv}, _, A, _)`, 'A'),
      paths, targets, reading,
    };
  });
}

/** No DOMAIN fact may lie on a support cycle, or the counts above are about
 *  the shape of the rule set rather than about the mappings. Checked rather
 *  than assumed: boot.rofl's own `reach` closure IS cyclic here (this program
 *  has recursive relations), and the fold reports those as INFINITE. */
export function infiniteDomainFacts(r: Rofl): string[] {
  const value = counting(r).value;
  return domainFacts(r).filter((k) => value.get(k) === INFINITE);
}

// ---------------------------------------------------------------------------
// `aka -n <customer>`: not "the data does not match" but a list of bridges

export interface Whynot {
  customer: string; attributed: number; booked: number; gap: number;
  proposals: { account: string; amount: number; kind: 'sharpen' | 'add'; bridge?: string;
               retracted?: boolean; rival?: string }[];
}

export function whynotOf(r: Rofl, c: string): Whynot {
  const rec = reconciliation(r).find((x) => x.customer === c)!;
  const proposals = col(r, `would_close[recon](${c}, A)`, 'A').map((a) => {
    const bridge = col(r, `sharpen[recon](${c}, ${a}, B)`, 'B')[0];
    const rival = col(r, `target[recon](${a}, X)`, 'X').filter((x) => x !== c).sort().join(', ');
    return {
      account: a, amount: num(r, `total[recon](loose(${a}), S)`, 'S'),
      kind: bridge ? 'sharpen' as const : 'add' as const,
      bridge, retracted: bridge ? r.holds(`retracted[recon](${bridge})`) : undefined,
      rival: rival || undefined,
    };
  });
  return { customer: c, attributed: rec.attributed, booked: rec.booked, gap: rec.gap, proposals };
}

export function whynotText(r: Rofl, c: string): string {
  const w = whynotOf(r, c);
  const out: string[] = [`$ aka -n ${c}`];
  if (w.gap === 0) {
    out.push(`${c} reconciles: ${money(w.attributed)} in billing, ${money(w.booked)} in crm.`);
    return out.join('\n');
  }
  const dir = w.gap < 0 ? 'short' : 'over';
  out.push(`${c} does not reconcile. billing says ${money(w.attributed)}, `
    + `crm says ${money(w.booked)} — ${dir} by ${money(Math.abs(w.gap))}.`);
  out.push('');
  if (w.proposals.length === 0) {
    out.push('  no account holds unattributed money equal to the shortfall.');
    out.push('  no single bridge closes this; the difference is elsewhere.');
    return out.join('\n');
  }
  out.push('  the mapping that would close it:');
  for (const p of w.proposals) {
    if (p.kind === 'add') {
      out.push(`    ADD      ${p.account} -> ${c}`);
      out.push(`             ${p.account} holds ${money(p.amount)} that maps to nothing at all,`);
      out.push(`             and ${money(p.amount)} is exactly what ${c} is ${dir}. Nobody has`);
      out.push(`             ever asserted a mapping for this account.`);
    } else {
      out.push(`    SHARPEN  ${p.account} -> ${c}   (bridge ${p.bridge}`
        + `${p.retracted ? ', WITHDRAWN by its author' : ''})`);
      out.push(`             ${p.account} holds ${money(p.amount)} the engine refused to`);
      out.push(`             attribute, because ${p.bridge} is not the only candidate: `
        + `${p.rival} also claims it.`);
      out.push(`             Settling that one ambiguity in ${c}'s favour closes the gap exactly.`);
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// the naive baseline: string matching between the two ontologies
//
// Not a straw man — it gets most of the accounts right. It is here because
// what it CANNOT do is the argument for bridges: it has no author, no
// confidence, nothing to dispute and nothing to withdraw, and where it is
// wrong it is silently wrong.

export interface Naive { account: string; matches: string[]; }

export function naiveMatch(r: Rofl): Naive[] {
  const customers = col(r, 'customer[crm](C, _)', 'C');
  return col(r, 'account[billing](A, _)', 'A').map((a) => ({
    account: a,
    matches: [...new Set(col(r, `entity[billing](${a}, E)`, 'E')
      .flatMap((e) => customers.filter((c) => e.startsWith(c + '_'))))].sort(),
  }));
}

// ---------------------------------------------------------------------------
// THE ORACLE
//
// Both systems' own reported totals are hard numbers: a reconciliation either
// closes or it does not, and by how much. Every classification, every
// per-customer gap and every headline total is decided a second time by a
// direct computation over the same base facts in plain TypeScript — no
// engine, no rules, no shared code beyond reading the ledgers — and compared.

interface Edb {
  invoices: { id: string; account: string; amount: number; quarter: string }[];
  accounts: string[];
  customers: string[];
  booked: { customer: string; amount: number; quarter: string }[];
  bridges: { id: string; author: string; account: string; customer: string; conf: number }[];
  retracted: string[];
}

export function readEdb(r: Rofl): Edb {
  return {
    invoices: r.query('invoice[billing](I, A, Amt, Q)').rows.map((x) => ({
      id: x.bindings.I, account: x.bindings.A,
      amount: Number(x.bindings.Amt), quarter: x.bindings.Q,
    })),
    accounts: col(r, 'account[billing](A, _)', 'A'),
    customers: col(r, 'customer[crm](C, _)', 'C'),
    booked: r.query('booked[crm](C, Amt, Q)').rows.map((x) => ({
      customer: x.bindings.C, amount: Number(x.bindings.Amt), quarter: x.bindings.Q,
    })),
    bridges: r.query('bridge[recon](B, X, A, C, Conf)').rows.map((x) => ({
      id: x.bindings.B, author: x.bindings.X, account: x.bindings.A,
      customer: x.bindings.C, conf: Number(x.bindings.Conf),
    })),
    retracted: col(r, 'retracted[recon](B)', 'B'),
  };
}

export interface OracleView {
  classify: Map<string, string>;        // invoice -> customer | '$ambiguous' | '$unmapped'
  perCustomer: Map<string, number>;     // attributed
  gap: Map<string, number>;
  totals: Map<string, number>;
  residual: number;
}

/** The whole reconciliation, recomputed from the base facts alone. */
export function oracleView(e: Edb, quarter: string): OracleView {
  const live = e.bridges.filter((b) => !e.retracted.includes(b.id));
  const targetsOf = (account: string): string[] =>
    [...new Set(live.filter((b) => b.account === account).map((b) => b.customer))].sort();
  const invs = e.invoices.filter((i) => i.quarter === quarter);
  const classify = new Map<string, string>();
  for (const i of invs) {
    const ts = targetsOf(i.account);
    classify.set(i.id, ts.length === 0 ? '$unmapped' : ts.length > 1 ? '$ambiguous' : ts[0]);
  }
  const perCustomer = new Map(e.customers.map((c) => [c, 0]));
  let ambiguous = 0, unmapped = 0, attributed = 0;
  for (const i of invs) {
    const k = classify.get(i.id)!;
    if (k === '$ambiguous') ambiguous += i.amount;
    else if (k === '$unmapped') unmapped += i.amount;
    else { attributed += i.amount; perCustomer.set(k, (perCustomer.get(k) ?? 0) + i.amount); }
  }
  const booked = new Map(e.customers.map((c) =>
    [c, e.booked.filter((b) => b.customer === c && b.quarter === quarter)
      .reduce((a, b) => a + b.amount, 0)]));
  const gap = new Map(e.customers.map((c) => [c, perCustomer.get(c)! - booked.get(c)!]));
  // loose money per account, and the shortfalls it could close
  const loose = new Map(e.accounts.map((a) => [a, invs
    .filter((i) => i.account === a && classify.get(i.id)!.startsWith('$'))
    .reduce((s, i) => s + i.amount, 0)]));
  const shortfalls = e.customers.filter((c) => gap.get(c)! < 0).map((c) => -gap.get(c)!);
  const proposed = new Set([...loose.entries()]
    .filter(([, s]) => s > 0 && shortfalls.includes(s)).map(([a]) => a));
  const residual = [...loose.entries()]
    .filter(([a, s]) => s > 0 && !proposed.has(a)).reduce((x, [, s]) => x + s, 0);
  return {
    classify, perCustomer, gap, residual,
    totals: new Map<string, number>([
      ['billing', invs.reduce((a, i) => a + i.amount, 0)],
      ['attributed', attributed], ['ambiguous', ambiguous], ['unmapped', unmapped],
      ['crm_booked', [...booked.values()].reduce((a, b) => a + b, 0)],
    ]),
  };
}

export interface OracleReport {
  decisions: number; mismatches: string[];
  arms: { arm: string; quarter: string; billing: number; crm: number; residual: number }[];
}

/** Every arm the transcript reports, checked. `arms` names each world the
 *  oracle re-decided, so the sample size below is a count of real decisions
 *  rather than of assertions. */
export function oracleCheck(): OracleReport {
  const out: OracleReport = { decisions: 0, mismatches: [], arms: [] };
  const worlds: [string, Rofl, string][] = [
    ['as shipped', asOf('q3'), 'q3'],
    ['as shipped', asOf('q2'), 'q2'],
    ['b2 withdrawn', withoutBridge('b2', 'integration'), 'q3'],
  ];
  for (const [arm, r, quarter] of worlds) {
    const e = readEdb(r);
    const o = oracleView(e, quarter);
    const bad = (what: string, got: unknown, want: unknown) => {
      out.mismatches.push(`  ${arm} ${quarter} ${what}: engine=${got} oracle=${want}`);
    };
    for (const [inv, want] of o.classify) {
      out.decisions++;
      const got = r.holds(`ambiguous[recon](${inv})`) ? '$ambiguous'
        : r.holds(`unmapped[recon](${inv})`) ? '$unmapped'
        : col(r, `attributed[recon](${inv}, C)`, 'C')[0] ?? '$none';
      if (got !== want) bad(`classify ${inv}`, got, want);
    }
    for (const [c, want] of o.perCustomer) {
      out.decisions++;
      const got = num(r, `total[recon](cust(${c}), S)`, 'S');
      if (got !== want) bad(`total ${c}`, got, want);
      out.decisions++;
      const wantGap = o.gap.get(c)!;
      const gotGap = num(r, `gap[recon](${c}, G)`, 'G');
      if (gotGap !== wantGap) bad(`gap ${c}`, gotGap, wantGap);
    }
    for (const [tag, want] of o.totals) {
      out.decisions++;
      const got = num(r, `total[recon](${tag}, S)`, 'S');
      if (got !== want) bad(`total ${tag}`, got, want);
    }
    // THE IDENTITY the whole example turns on: the two systems' headline
    // difference is exactly the money no bridge can absorb.
    out.decisions++;
    const engineResidual = pairs(r, 'residual[recon](A, S)', 'A', 'S')
      .reduce((a, [, s]) => a + Number(s), 0);
    if (engineResidual !== o.residual) bad('residual', engineResidual, o.residual);
    out.decisions++;
    const headline = o.totals.get('billing')! - o.totals.get('crm_booked')!;
    if (headline !== o.residual) {
      bad('billing - crm == residual', headline, o.residual);
    }
    out.arms.push({ arm, quarter, billing: o.totals.get('billing')!,
      crm: o.totals.get('crm_booked')!, residual: o.residual });
  }
  return out;
}

// ---------------------------------------------------------------------------

const rule = (t: string) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`);

function main(): void {
  const t0 = Date.now();
  console.log('AKA — two ontologies over one stream of money, and the seam between them.');

  const r = asOf('q3');

  // -- 1. the model loads ---------------------------------------------------
  rule('1. the model loads, and boot.rofl audits it');
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)',
    'undefined_premise[audit](R, Rel)']) {
    console.log(`  ? ${audit.padEnd(34)} -> ${r.query(audit).rows.length} rows`);
  }
  const ev = new Evaluation(r.store);
  console.log(`  rules not range-restricted: ${ev.rules.filter((x) => !x.safe).length}`);
  console.log(`  relations evaluated top-down: ${ev.demandRels.size}`);
  console.log(`  facts in the store: ${r.factKeys().length}`);
  console.log(`  ledgers: ${list(col(r, 'perspective(P)', 'P').filter((p) => p !== 'main'))}`);

  // -- 2. two ontologies ----------------------------------------------------
  rule('2. two books, and why one is not a renaming of the other');
  console.log(`  billing:  ${col(r, 'account[billing](A, _)', 'A').length} accounts, `
    + `${col(r, 'entity[billing](_, E)', 'E').length} legal entities, `
    + `${col(r, 'invoice[billing](I, _, _, _)', 'I').length} invoices. It has never heard of a customer.`);
  console.log(`  crm:      ${col(r, 'customer[crm](C, _)', 'C').length} customers with booked revenue. `
    + `It has never heard of an account.\n`);
  for (const a of col(r, 'account[billing](A, _)', 'A')) {
    const ents = col(r, `entity[billing](${a}, E)`, 'E').sort();
    const q3 = pairs(r, `invoice[billing](I, ${a}, Amt, ${quarterOf(r)})`, 'I', 'Amt');
    const sum = q3.reduce((x, [, amt]) => x + Number(amt), 0);
    console.log(`    ${a.padEnd(16)} ${String(q3.length).padStart(2)} inv  `
      + `${money(sum).padStart(10)}   entities: ${ents.join(' + ')}`);
  }
  console.log('');
  console.log('  one customer, several accounts:  '
    + `northwind <- ${list(col(r, 'target[recon](A, northwind)', 'A').sort())}`);
  const splitRow = r.query('split[recon](A, C1, C2)').rows[0];
  console.log(`  one account, several customers:  ${splitRow.bindings.A} -> `
    + `${splitRow.bindings.C1} and ${splitRow.bindings.C2} (a reseller account)`);
  console.log(`  accounts in no crm at all:       ${list(col(r, 'unmapped_acct[recon](A)', 'A'))}`);
  console.log(`  customers with nothing attributed: `
    + list(reconciliation(r).filter((x) => x.attributed === 0 && x.booked > 0).map((x) => x.customer)));

  console.log('\n  the baseline this replaces — match the entity name against the customer id:');
  const naive = naiveMatch(r);
  const exact = naive.filter((n) => n.matches.length === 1);
  console.log(`    ${exact.length} of ${naive.length} accounts resolve to exactly one customer, `
    + `${naive.filter((n) => n.matches.length > 1).length} to more than one, `
    + `${naive.filter((n) => n.matches.length === 0).length} to none.`);
  for (const n of naive) {
    console.log(`      ${n.account.padEnd(16)} -> ${n.matches.length === 0 ? '(nothing)' : n.matches.join(' | ')}`);
  }
  console.log('    It gets most of them right. What it cannot do is the whole argument:');
  console.log('    it has no author, no confidence, nothing to dispute and nothing to');
  console.log('    withdraw — and where it is wrong (acct_adv_a) it is silently wrong.');

  // -- 3. a bridge is an assertion ------------------------------------------
  rule('3. a bridge is an assertion: author, confidence, and a ledger of its own');
  console.log('  every mapping, in its author\'s own book:\n');
  for (const [b, x] of pairs(r, 'bridge[recon](B, X, _, _, _)', 'B', 'X')
    .sort((a, c) => (a[0] < c[0] ? -1 : 1))) {
    const a = one(r, `bridge[recon](${b}, _, A, _, _)`, 'A');
    const c = one(r, `bridge[recon](${b}, _, _, C, _)`, 'C');
    const conf = num(r, `bridge[recon](${b}, _, _, _, Conf)`, 'Conf');
    console.log(`    ${b.padEnd(3)} maps[${x}](${a}, ${c})`.padEnd(56)
      + `confidence ${(conf / 100).toFixed(2)}`);
  }
  console.log('\n  two authors, the same account, DIFFERENT customers — and both stand:');
  for (const row of r.query('disputed[recon](A, C1, C2)').rows) {
    const { A, C1, C2 } = row.bindings;
    for (const c of [C1, C2]) {
      const b = one(r, `bridge[recon](B, _, ${A}, ${c}, _)`, 'B');
      const x = one(r, `bridge[recon](${b}, X, _, _, _)`, 'X');
      const conf = num(r, `bridge[recon](${b}, _, _, _, Conf)`, 'Conf');
      console.log(`    maps[${x}](${b}, ${A}, ${c}, ${conf})`);
    }
    console.log(`    both hold. Nothing was ranked, resolved or dropped — different ledgers,`);
    console.log(`    so ${A} has two candidate customers and the money on it is held back.`);
  }
  console.log('\n  and the three shapes a bridge set takes, all derived, none asserted:');
  for (const [a, c] of pairs(r, 'corroborated[recon](A, C)', 'A', 'C')) {
    console.log(`    CORROBORATED  ${a} -> ${c}, by two authors independently`);
  }
  for (const row of r.query('split[recon](A, C1, C2)').rows) {
    console.log(`    SPLIT         ${row.bindings.A} -> ${row.bindings.C1} and ${row.bindings.C2}, `
      + 'by ONE author: the account really does cover both');
  }
  for (const row of r.query('disputed[recon](A, C1, C2)').rows) {
    console.log(`    DISPUTED      ${row.bindings.A} -> ${row.bindings.C1} or ${row.bindings.C2}, `
      + 'by two authors who disagree');
  }

  console.log('\n  who wrote a mapping is the load identity, not a column:');
  const forger = world();
  must(forger.load('withdrawn[integration](b9).', { who: 'finance_ops' }), 'forgery');
  const forged = col(forger, 'forged[audit](F)', 'F');
  console.log('    finance_ops withdraws the integration team\'s bridge, and asks nobody:');
  console.log(`      forged[audit] -> ${forged.length} row${forged.length === 1 ? '' : 's'}`);
  for (const f of forged) console.log(`        ${f}`);
  console.log('    The same forgery in one mapping table with an "author" column is a');
  console.log('    well-formed row, and no audit in any kernel can see it.');

  // -- 4. the trace ---------------------------------------------------------
  rule('4. the trace: 1.42M goes in, and less comes out');
  console.log(indent(traceText(r), 2));
  const t = trace(r);
  console.log('');
  console.log(`  ${millions(t.billing)} = ${millions(t.attributed)} attributed `
    + `+ ${millions(t.ambiguous)} ambiguous + ${millions(t.unmapped)} unmapped, exactly.`);
  console.log(`  A policy that resolved every ambiguity by picking the confident candidate`);
  console.log(`  would report ${millions(t.underPolicy)} instead. That policy is not in the rules,`);
  console.log(`  and section 8 shows the money refusing it.\n`);
  console.log('  and the reconciliation, customer by customer:\n');
  console.log('    customer     billing->crm        crm booked          gap  verdict');
  for (const x of reconciliation(r)) {
    console.log(`    ${x.customer.padEnd(12)} ${money(x.attributed).padStart(12)} `
      + `${money(x.booked).padStart(17)} ${money(x.gap).padStart(12)}  `
      + (x.gap === 0 ? 'closes' : 'DOES NOT CLOSE'));
  }
  console.log(`\n    billing ${money(t.billing)} vs crm ${money(t.crmBooked)}: `
    + `${money(t.billing - t.crmBooked)} apart.`);
  const residual = pairs(r, 'residual[recon](A, S)', 'A', 'S');
  console.log(`    and the difference is not a mystery. It is exactly the money no bridge`);
  console.log(`    can absorb: ${residual.map(([a, s]) => `${a} ${money(Number(s))}`).join(' + ')}`);
  console.log(`    = ${money(residual.reduce((a, [, s]) => a + Number(s), 0))}.`);

  // -- 5. the mark ----------------------------------------------------------
  rule('5. the mark: a number that crossed a boundary must not look like one that did not');
  console.log('  Viterbi over the bridge confidences. A total derived inside one book scores');
  console.log('  1.000; a total that crossed bridges scores the product of their confidences.\n');
  console.log('    conclusion              value       certainty  crossed              source books');
  for (const c of certainties(r)) {
    const marked = c.bridges.length === 0 ? 'nothing'
      : `${c.bridges.join(' ')}`;
    console.log(`    ${c.node.padEnd(22)} ${money(c.value).padStart(11)}  `
      + `${renderLogProb(c.score).padStart(9)}  ${marked.padEnd(20)} `
      + `${c.books.map((b) => `[${b}]`).join(' ')}`);
  }
  console.log('\n  The "crossed" column is written by a rule in aka.rofl §9; the certainty is');
  console.log('  a fold over the support graph and the source books come out of the provenance');
  console.log('  semiring. Nothing here agrees by construction: the first draft of §9 marked');
  console.log('  the per-customer totals and forgot total(attributed) and total(ambiguous),');
  console.log('  and the fold is what caught it. The test now pins the two against each other.');
  console.log(`\n  standard of proof on a crossed number: ${CERTAINTY_STANDARD.toFixed(2)}. Which totals clear it:`);
  for (const c of certainties(r).filter((x) => x.bridges.length > 0)) {
    console.log(`    ${c.node.padEnd(22)} ${clearsThreshold(c.score, CERTAINTY_STANDARD) ? 'clears' : 'DOES NOT CLEAR'}`);
  }
  console.log('\n  northwind is the one that fails, and it fails because of b2 (acct_nw_eu,');
  console.log('  confidence 0.80) — the weakest bridge carrying real money. Section 7 is the');
  console.log('  integration team withdrawing exactly that bridge, three sections later.');
  console.log('\n  THE TRAP IN THIS TABLE. total(unmapped) scores 1.000 and crosses nothing,');
  console.log('  and it is the number in the whole report most sensitive to the bridge set:');
  const unmappedKey = `total[recon](unmapped,${num(r, 'total[recon](unmapped, S)', 'S')})`;
  const mono = (provenanceFold(r).value.get(unmappedKey) ?? [[]])[0] ?? [];
  console.log(`    provenance of ${unmappedKey}:`);
  console.log(`      ${mono.length} base facts, of which ${mono.filter((k) => k.startsWith('maps[')).length} are bridges.`);
  console.log('    It rests on the ABSENCE of a bridge, finite failure carries no annotation,');
  console.log('    so no mark can reach it. The tool has to say this in words. (Known:');
  console.log('    f_provenance_blind_to_negation.)');

  // -- 6. counting ----------------------------------------------------------
  rule('6. counting: the same number, read in opposite directions');
  const fold = counting(r);
  console.log(`  counting semiring over the support hypergraph: ${fold.rounds} rounds, `
    + `converged=${fold.converged}, discipline held=${fold.disciplineHeld}`);
  console.log(`  facts on a support cycle: ${fold.cyclic}, and every one of them is boot.rofl's`);
  console.log(`  own relation-reachability closure — this program has recursive relations.`);
  console.log(`  domain facts counted INFINITE: ${infiniteDomainFacts(r).length}. No ticks are run here.\n`);
  console.log('    invoice   amount     paths  lands on                 reading');
  for (const a of ambiguities(r)) {
    console.log(`    ${a.invoice.padEnd(9)} ${money(a.amount).padStart(9)} `
      + `${renderCount(a.paths).padStart(6)}  ${(a.targets.join(', ') || '(nothing)').padEnd(22)} ${a.reading}`);
  }
  console.log('\n  inv_05 and inv_08 both have TWO mapping paths. Read the numbers alone and');
  console.log('  they are the same fact. inv_05\'s two paths land on ONE customer — that is');
  console.log('  corroboration, and it is reassuring. inv_08\'s two land on TWO — that is');
  console.log('  ambiguity, and it is a defect. The metric is identical; only the domain');
  console.log('  fixes its sign, and here the domain fixes it PER RELATION:');
  console.log(`    count route[recon](inv_05, contoso)  = `
    + `${renderCount(fold.value.get('route[recon](inv_05,contoso)') ?? 0n)}   authors who agree`);
  console.log(`    count paths[recon](inv_08)           = `
    + `${renderCount(fold.value.get('paths[recon](inv_08)') ?? 0n)}   customers it could be`);

  // -- 7. withdrawal --------------------------------------------------------
  rule('7. withdrawing a bridge: marked, not silently rewritten');
  const rw = withoutBridge('b2', 'integration');
  console.log('  $ integration_team: withdrawn[integration](b2).   -- acct_nw_eu is not northwind\n');
  const tw = trace(rw);
  console.log(`    money that no longer maps: ${money(t.unmapped)} -> ${money(tw.unmapped)}`);
  console.log(`    northwind\'s total:         ${money(num(r, 'total[recon](cust(northwind), S)', 'S'))}`
    + ` -> ${money(num(rw, 'total[recon](cust(northwind), S)', 'S'))}`);
  console.log(`    northwind\'s gap:           ${money(num(r, 'gap[recon](northwind, G)', 'G'))}`
    + ` -> ${money(num(rw, 'gap[recon](northwind, G)', 'G'))}`);
  console.log('');
  for (const x of col(rw, 'at_risk[recon](X)', 'X')) {
    const leaves = col(rw, `leaf[recon](${x}, B)`, 'B').sort();
    console.log(`    AT RISK  ${x.padEnd(34)} every support gone: ${list(leaves)}`);
  }
  for (const x of col(rw, 'shaken[recon](X)', 'X')) {
    const leaves = col(rw, `leaf[recon](${x}, B)`, 'B').sort();
    const dead = leaves.filter((b) => rw.holds(`retracted[recon](${b})`));
    const alive = leaves.filter((b) => !rw.holds(`retracted[recon](${b})`));
    console.log(`    SHAKEN   ${x.padEnd(34)} gone: ${list(dead)}   still standing: ${list(alive)}`);
  }
  console.log('');
  console.log('  the mark reaches the CONCLUSION the finance team acts on, transitively:');
  console.log(`    rests_on(reconciliation(northwind), b2) = `
    + `${rw.holds('rests_on[recon](reconciliation(northwind), b2)')}`);
  console.log(`    shaken(reconciliation(northwind))       = `
    + `${rw.holds('shaken[recon](reconciliation(northwind))')}`);
  console.log('  The support graph is drawn on `link`, which survives the retraction, and');
  console.log('  not on `attributed`, which does not. A support that has already vanished');
  console.log('  cannot be marked — it has taken the record with it.');

  console.log('\n  and the same withdrawal as an EXCISION, which erases instead of marking:');
  const rx = asOf('q3');
  const ex = rx.excise('maps[integration](b2, acct_nw_eu, northwind, 80)');
  console.log(`    $ excise maps[integration](b2, acct_nw_eu, northwind, 80)`);
  console.log(`      ${ex.removed.length} facts removed, ${ex.added.length} added`);
  console.log(`      removed: ${ex.removed.filter((k) => /^(total\[recon\]\(cust|gap)/.test(k)).join(', ')}`);
  console.log(`      added:   ${ex.added.filter((k) => /^(total\[recon\]\(cust|gap|unmapped)/.test(k)).join(', ')}`);
  console.log('    Excision is the counterfactual: what would we believe if this mapping had');
  console.log('    never been asserted. Withdrawal is the history: it was asserted, it was');
  console.log('    acted on, and it has been taken back. The tool needs both and they are');
  console.log('    not the same operation.');

  // -- 8. whynot ------------------------------------------------------------
  rule('8. whynot: not "the data does not match" but a list of missing bridges');
  for (const c of ['tailspin', 'litware', 'northwind']) {
    console.log(indent(whynotText(r, c), 2));
    console.log('');
  }
  console.log('  and the two the arithmetic REFUSES to propose:');
  for (const [b, c] of pairs(r, 'refuted_bridge[recon](B, C)', 'B', 'C')) {
    const a = one(r, `bridge[recon](${b}, _, A, _, _)`, 'A');
    const x = one(r, `bridge[recon](${b}, X, _, _, _)`, 'X');
    const conf = num(r, `bridge[recon](${b}, _, _, _, Conf)`, 'Conf');
    const booked = reconciliation(r).find((y) => y.customer === c)!.booked;
    console.log(`    ${b}  maps[${x}](${a}, ${c}) at confidence ${(conf / 100).toFixed(2)} — REFUTED:`);
    console.log(`        ${c} ${booked === 0 ? 'books nothing at all this quarter'
      : `books ${money(booked)} and billing already accounts for every dollar of it`},`);
    console.log(`        so it cannot absorb ${a}'s ${money(num(r, `total[recon](loose(${a}), S)`, 'S'))} `
      + `without breaking a total that balances.`);
  }
  console.log('    Both candidates for acct_adv_a are refuted, by the money, at 0.85 and 0.70');
  console.log('    confidence. A confidence is a number its author chose. The reconciliation');
  console.log('    is not, and it overrules both.');
  console.log('\n  the kernel\'s own whynot underneath the rendering:\n');
  console.log(indent(r.whynot('reconciles[recon](tailspin)', { depth: 2 }).text, 4));

  // -- 9. the kernel's bridges ----------------------------------------------
  rule('9. the kernel\'s bridges, which are a different thing with the same name');
  console.log('  A `bridge_decl` is emitted when a RULE reads one ledger and writes another.');
  console.log('  It licenses the class of crossing; `maps` licenses one entity to stand for');
  console.log('  another. Both are needed, and the kernel supplies only the first:\n');
  const decls = new Map<string, number>();
  for (const [from, to] of pairs(r, 'bridge_decl(R, F, T)', 'F', 'T')) {
    decls.set(`${from} -> ${to}`, (decls.get(`${from} -> ${to}`) ?? 0) + 1);
  }
  for (const [k, n] of [...decls.entries()].sort()) {
    console.log(`    ${k.padEnd(24)} ${n} rule${n === 1 ? '' : 's'}`);
  }
  console.log(`\n  data bridges in the same model: `
    + `${col(r, 'bridge[recon](B, _, _, _, _)', 'B').length} entity mappings by `
    + `${new Set(col(r, 'bridge[recon](_, X, _, _, _)', 'X')).size} authors.`);
  console.log('  The kernel has nothing to say about any of them. It cannot: which account');
  console.log('  is which customer is not a property of the rule set.');
  console.log('\n  and the audit that makes the first kind real — one rule with an implicit');
  console.log('  head perspective, reading [billing] and writing [main]:');
  const leaky = world();
  must(leaky.load('shadow(Inv, A) :- invoice[billing](Inv, A, _, _).', { who: 'analyst' }), 'leak');
  console.log(`    $ shadow(Inv, A) :- invoice[billing](Inv, A, _, _).`);
  for (const [a, b] of pairs(leaky, 'leak[audit](A, B)', 'A', 'B')) {
    console.log(`      leak[audit](${a}, ${b})   -- an undeclared crossing, and nobody wrote a check for it`);
  }
  console.log('    Naming the head perspective is the whole fix, and it is what every rule');
  console.log('    in aka.rofl does.');

  // -- 10. as of another quarter -------------------------------------------
  rule('10. the same books, the quarter before');
  const q2 = asOf('q2');
  const t2 = trace(q2);
  console.log(`  swap quarter[main](q3) for quarter[main](q2) and evaluate once:\n`);
  console.log(`    billing ${money(t2.billing)}, crm ${money(t2.crmBooked)}, `
    + `ambiguous ${money(t2.ambiguous)}, unmapped ${money(t2.unmapped)}`);
  console.log(`    every customer reconciles: `
    + `${reconciliation(q2).every((x) => x.gap === 0)}`);
  console.log('    Q2 closes. The same rules, the same bridges, the same two ontologies —');
  console.log('    what changed is which accounts were invoiced. The quarter that does not');
  console.log('    close is the one where a reseller account and a ghost account were.');

  // -- 11. the oracle -------------------------------------------------------
  rule('11. the oracle: every classification, gap and total, decided twice');
  const oc = oracleCheck();
  console.log(`
  Both systems' own reported totals are hard numbers, so a reconciliation
  either closes or it does not, and by how much. Every invoice classification,
  every per-customer gap, every headline total and the residual identity is
  decided once by the engine and once by a direct computation over the same
  base facts in plain TypeScript — no engine, no rules, no shared code.
`);
  console.log(`    decisions compared:  ${oc.decisions}`);
  console.log(`    disagreements:       ${oc.mismatches.length}`);
  for (const m of oc.mismatches.slice(0, 20)) console.log(m);
  console.log('');
  console.log('    arm            quarter   billing        crm       residual   identity');
  for (const a of oc.arms) {
    console.log(`    ${a.arm.padEnd(14)} ${a.quarter.padEnd(9)} ${money(a.billing).padStart(10)} `
      + `${money(a.crm).padStart(10)} ${money(a.residual).padStart(12)}   `
      + `${a.billing - a.crm === a.residual ? 'holds' : 'BROKEN'}`);
  }
  console.log('\n    billing - crm == the money no bridge can absorb. That identity is the');
  console.log('    whole claim of the example, and it is checked in three different worlds.');

  console.log(`\n(${Date.now() - t0} ms for everything above.)`);
  if (oc.mismatches.length > 0) process.exitCode = 1;
}

const realPath = (p: string) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && realPath(path.resolve(process.argv[1])) === realPath(new URL(import.meta.url).pathname)) {
  main();
}
