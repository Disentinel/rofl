// examples/nope/demo.ts -- NOPE: whynot for access control, and the metrics
// no IAM tool reports.
//
//   node --experimental-strip-types examples/nope/demo.ts
//
// Everything printed here is computed. The transcripts in README.md and
// page.html are this program's stdout, pasted.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  countingSemiring, tropicalSemiring, unitFiringCost, provenanceSemiring,
  provenanceOf, renderCount, INFINITE, type Count,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const MODEL = read('examples', 'nope', 'nope.rofl');

// The three requests the demo asks about.
export const OBJ = '"arn:aws:s3:::prod-bucket/data.csv"';
export const GET = '"s3:GetObject"';
export const PUT = '"s3:PutObject"';
export const DEL = '"s3:DeleteObject"';

// ---------------------------------------------------------------------------
// small helpers over query results (bindings come back canonically rendered,
// so string equality is term equality and nothing needs parsing)

export function world(): Rofl {
  const r = new Rofl();
  must(r.load(BOOT), 'boot.rofl');
  must(r.load(MODEL), 'nope.rofl');
  return r;
}

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

/** Every tuple of a relation, as canonical strings. */
export function tuples(r: Rofl, rel: string, arity: number): string[][] {
  const vars = Array.from({ length: arity }, (_, i) => `X${i}`);
  const res = r.query(`${rel}(${vars.join(', ')})`);
  return res.rows.map((row) => vars.map((v) => row.bindings[v]));
}

/** `"s3:GetObject"` -> `s3:GetObject`; atoms pass through. */
export const unq = (s: string): string => (s.startsWith('"') ? JSON.parse(s) as string : s);

/** A cons chain, origin first: cons(b,cons(a,nil)) -> ['a', 'b']. */
export function chainOf(term: string): string[] {
  const out: string[] = [];
  let t = term;
  while (t.startsWith('cons(')) {
    const inner = t.slice(5, -1);
    let depth = 0, i = 0;
    for (; i < inner.length; i++) {
      const c = inner[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) break;
    }
    out.push(inner.slice(0, i));
    t = inner.slice(i + 1);
  }
  return out.reverse();
}

const factKeyOf = (rel: string, args: string[]) => `${rel}[main](${args.join(',')})`;
const banner = (s: string) => '\n' + s + '\n' + '='.repeat(s.length);

// ---------------------------------------------------------------------------
// the NOPE rendering: not "Access Denied", but which policy, at which level
// of the hierarchy, on which condition

interface Route { q: string; chain: string[]; holder: string; sid: string; }

export function grantRows(r: Rofl, p: string, a: string, res: string): Route[] {
  const q = r.query(`grant(${p}, Q, ${a}, ${res}, path(C, H, S))`);
  return q.rows.map((row) => ({
    q: row.bindings.Q, chain: chainOf(row.bindings.C),
    holder: row.bindings.H, sid: row.bindings.S,
  }));
}

export function routesOf(r: Rofl, p: string, a: string, res: string): Route[] {
  const q = r.query(`route(${p}, ${a}, ${res}, path(C, H, S))`);
  return q.rows.map((row) => {
    const chain = chainOf(row.bindings.C);
    return { q: chain[chain.length - 1], chain, holder: row.bindings.H, sid: row.bindings.S };
  }).sort((x, y) => x.chain.length - y.chain.length
    || (x.chain.join() < y.chain.join() ? -1 : x.chain.join() > y.chain.join() ? 1 : 0)
    || (x.sid < y.sid ? -1 : 1));
}

/** Every Deny that applies to one grant, with the level it came from. */
function denials(r: Rofl, p: string, q: string, a: string, res: string): { level: string; sid: string; depth: string }[] {
  const rows = r.query(`deny_at(${p}, ${q}, ${a}, ${res}, L, S)`).rows;
  return rows.map((row) => ({
    level: row.bindings.L,
    sid: row.bindings.S,
    depth: r.query(`level_depth(${row.bindings.L}, N)`).rows[0]?.bindings.N ?? '?',
  })).sort((x, y) => Number(x.depth) - Number(y.depth));
}

function statementText(r: Rofl, sid: string): string {
  const row = r.query(`statement(Pol, ${sid}, E, A, R)`).rows[0];
  if (!row) return `${sid} (implicit: no Allow in the boundary)`;
  const { Pol, E, A, R } = row.bindings;
  return `${E === 'allow' ? 'Allow' : 'Deny'} ${unq(A)} on ${unq(R)}  [${Pol} / ${sid}]`;
}

function conditionText(r: Rofl, sid: string, principal: string): string | null {
  const row = r.query(`condition(${sid}, K, Op, V)`).rows[0];
  if (!row) return null;
  const { K, Op, V } = row.bindings;
  const held = r.query(`tag(${principal}, ${K}, W)`).rows[0]?.bindings.W;
  const op = Op === 'ne' ? '!=' : '==';
  return `condition ${unq(K)} ${op} ${unq(V)};  ${unq(principal)} has ${held === undefined ? '(no tag)' : unq(held)}`;
}

/** `nope <principal> <action> <resource>` -- the whole point of the example. */
export function nope(r: Rofl, p: string, a: string, res: string, counts?: Map<string, Count>): string {
  const out: string[] = [`$ nope ${unq(p)} ${unq(a)} ${unq(res)}`];
  const grants = grantRows(r, p, a, res);
  const routes = routesOf(r, p, a, res);
  const holds = routes.length > 0;

  if (holds) {
    const n = counts?.get(factKeyOf('access', [p, a, res]));
    out.push(`access present.  independent paths: ${n === undefined ? routes.length : renderCount(n)}`
      + `   (${grants.length} grants, ${grants.length - routes.length} cut by a Deny)`);
    out.push('');
    for (const rt of routes) {
      out.push(`  ${rt.chain.join(' -> ').padEnd(46)}${statementText(r, rt.sid)}`);
    }
  } else {
    out.push('access absent.');
    out.push('');
    if (grants.length === 0) {
      out.push('  no policy allows it at all: nothing to override.');
    }
    const cut: { level: string; depth: string }[] = [];
    for (const g of grants) {
      out.push(`  ${g.chain.join(' -> ')}`);
      out.push(`    ${g.holder} grants   ${statementText(r, g.sid)}`);
      for (const d of denials(r, p, g.q, a, res)) {
        out.push(`    but ${d.level} (level ${d.depth}) denies   ${statementText(r, d.sid)}`);
        const c = conditionText(r, d.sid, p);
        if (c) out.push(`       ${c}`);
        cut.push({ level: d.level, depth: d.depth });
      }
      out.push('');
    }
    if (cut.length > 0) {
      const top = cut.sort((x, y) => Number(x.depth) - Number(y.depth))[0];
      out.push(`  cutting link: ${top.level}, level ${top.depth} of 4 -- not the role.`);
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// THE ORACLE
//
// For a finite model, exhaustive enumeration is a COMPLETE oracle: walk every
// (principal, action, resource) triple and decide it by a direct, independent
// evaluation of the policy set -- plain TypeScript, a DFS over the assume-role
// graph with a visited set, no engine, no rules. Then compare, on every
// triple, both the verdict AND the number of independent routes.

interface Edb {
  identities: string[]; actions: string[]; resources: string[];
  assumes: Map<string, string[]>;
  groups: Map<string, string[]>;              // identity -> groups
  attached: Map<string, string[]>;            // holder -> policies
  statements: { pol: string; sid: string; eff: string; ap: string; rp: string }[];
  cond: Map<string, { k: string; op: string; v: string }>;
  tags: Map<string, string>;                  // "P|K" -> V
  actIn: Set<string>; resIn: Set<string>;     // "A|Pattern"
  acctOf: Map<string, string>;                // identity -> account
  ouOf: Map<string, string>;                  // account -> ou
  ouParent: Map<string, string>;
  scp: Map<string, string[]>;                 // ou -> policies
  boundary: Map<string, string>;              // identity -> policy
  bucket: [string, string][];                 // [resource pattern, policy]
  stmtPrincipal: Map<string, string>;         // sid -> principal
}

function readEdb(r: Rofl): Edb {
  const multi = (rows: string[][]): Map<string, string[]> => {
    const m = new Map<string, string[]>();
    for (const [k, v] of rows) (m.get(k) ?? m.set(k, []).get(k)!).push(v);
    return m;
  };
  const single = (rows: string[][]): Map<string, string> => new Map(rows.map(([k, v]) => [k, v]));
  return {
    identities: tuples(r, 'identity', 1).map((t) => t[0]),
    actions: tuples(r, 'action', 1).map((t) => t[0]),
    resources: tuples(r, 'resource', 1).map((t) => t[0]),
    assumes: multi(tuples(r, 'assumes', 2)),
    groups: multi(tuples(r, 'member_of', 2)),
    attached: multi(tuples(r, 'attached', 2)),
    statements: tuples(r, 'statement', 5).map(([pol, sid, eff, ap, rp]) => ({ pol, sid, eff, ap, rp })),
    cond: new Map(tuples(r, 'condition', 4).map(([sid, k, op, v]) => [sid, { k, op, v }])),
    tags: new Map(tuples(r, 'tag', 3).map(([p, k, v]) => [`${p}|${k}`, v])),
    actIn: new Set(tuples(r, 'action_in', 2).map(([a, p]) => `${a}|${p}`)),
    resIn: new Set(tuples(r, 'resource_in', 2).map(([a, p]) => `${a}|${p}`)),
    acctOf: single(tuples(r, 'in_account', 2)),
    ouOf: single(tuples(r, 'account', 2)),
    ouParent: single(tuples(r, 'ou_parent', 2)),
    scp: multi(tuples(r, 'scp', 2)),
    boundary: single(tuples(r, 'boundary', 2)),
    bucket: tuples(r, 'bucket_policy', 2).map(([bp, pol]) => [bp, pol] as [string, string]),
    stmtPrincipal: single(tuples(r, 'stmt_principal', 2)),
  };
}

class Oracle {
  e: Edb;
  constructor(e: Edb) { this.e = e; }

  private matches(s: { ap: string; rp: string }, a: string, res: string): boolean {
    return this.e.actIn.has(`${a}|${s.ap}`) && this.e.resIn.has(`${res}|${s.rp}`);
  }

  /** The model's `applies/2`: a statement with no Condition applies to all. */
  private applies(sid: string, principal: string): boolean {
    const c = this.e.cond.get(sid);
    if (!c) return true;
    const held = this.e.tags.get(`${principal}|${c.k}`);
    if (held === undefined) return false;
    return c.op === 'eq' ? held === c.v : held !== c.v;
  }

  private policiesOf(q: string): { holder: string; pol: string }[] {
    const out: { holder: string; pol: string }[] = [];
    for (const h of [q, ...(this.e.groups.get(q) ?? [])]) {
      for (const pol of this.e.attached.get(h) ?? []) out.push({ holder: h, pol });
    }
    return out;
  }

  private ouAncestors(q: string): string[] {
    const acct = this.e.acctOf.get(q);
    if (acct === undefined) return [];
    let ou = this.e.ouOf.get(acct);
    const out: string[] = [];
    while (ou !== undefined) { out.push(ou); ou = this.e.ouParent.get(ou); }
    return out;
  }

  /** Every Allow reachable by acting identity q, as (holder, sid). */
  allows(q: string, a: string, res: string): { holder: string; sid: string }[] {
    const out: { holder: string; sid: string }[] = [];
    for (const { holder, pol } of this.policiesOf(q)) {
      for (const s of this.e.statements) {
        if (s.pol === pol && s.eff === 'allow' && this.matches(s, a, res)) out.push({ holder, sid: s.sid });
      }
    }
    for (const [bp, pol] of this.e.bucket) {
      if (!this.e.resIn.has(`${res}|${bp}`)) continue;
      for (const s of this.e.statements) {
        if (s.pol !== pol || s.eff !== 'allow' || !this.matches(s, a, res)) continue;
        if (this.e.stmtPrincipal.get(s.sid) === q) out.push({ holder: pol, sid: s.sid });
      }
    }
    return out;
  }

  /** Every Deny that applies, with its level. Deny beats Allow, always. */
  denies(p: string, q: string, a: string, res: string): { level: string; sid: string }[] {
    const out: { level: string; sid: string }[] = [];
    for (const ou of this.ouAncestors(q)) {
      for (const pol of this.e.scp.get(ou) ?? []) {
        for (const s of this.e.statements) {
          if (s.pol === pol && s.eff === 'deny' && this.matches(s, a, res) && this.applies(s.sid, p)) {
            out.push({ level: 'scp', sid: s.sid });
          }
        }
      }
    }
    for (const { pol } of this.policiesOf(q)) {
      for (const s of this.e.statements) {
        if (s.pol === pol && s.eff === 'deny' && this.matches(s, a, res) && this.applies(s.sid, p)) {
          out.push({ level: 'identity_policy', sid: s.sid });
        }
      }
    }
    for (const [bp, pol] of this.e.bucket) {
      if (!this.e.resIn.has(`${res}|${bp}`)) continue;
      for (const s of this.e.statements) {
        if (s.pol === pol && s.eff === 'deny' && this.matches(s, a, res) && this.applies(s.sid, p)) {
          out.push({ level: 'resource_policy', sid: s.sid });
        }
      }
    }
    const bpol = this.e.boundary.get(q);
    if (bpol !== undefined) {
      const permitted = this.e.statements.some(
        (s) => s.pol === bpol && s.eff === 'allow' && this.matches(s, a, res));
      if (!permitted) out.push({ level: 'permission_boundary', sid: 'implicit' });
    }
    return out;
  }

  /** Simple paths from p over the assume-role graph -- a DFS with a visited
   *  set. This is the definition the counting metric has to agree with. */
  simplePaths(p: string): string[][] {
    const out: string[][] = [];
    const walk = (chain: string[]): void => {
      out.push([...chain]);
      const cur = chain[chain.length - 1];
      for (const nxt of this.e.assumes.get(cur) ?? []) {
        if (chain.includes(nxt)) continue;          // re-entry grants nothing new
        walk([...chain, nxt]);
      }
    };
    walk([p]);
    return out;
  }

  decide(p: string, a: string, res: string): { allowed: boolean; routes: number } {
    let routes = 0;
    for (const chain of this.simplePaths(p)) {
      const q = chain[chain.length - 1];
      const allows = this.allows(q, a, res).filter((x) => this.applies(x.sid, p));
      if (allows.length === 0) continue;            // no grant: nothing to cap
      if (this.denies(p, q, a, res).length > 0) continue;
      routes += allows.length;
    }
    return { allowed: routes > 0, routes };
  }
}

// ---------------------------------------------------------------------------

function main(): void {
  const t0 = Date.now();
  const r = world();

  console.log(banner('1. the model loads, and boot.rofl audits it'));
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)']) {
    console.log(`  ? ${audit.padEnd(24)} -> ${r.query(audit).rows.length} rows`);
  }
  // model hygiene: every rule materialises bottom-up. A rule that is not
  // range-restricted would be evaluated top-down instead, silently -- this
  // check is what caught the resource-policy Deny rule leaving the acting
  // identity unbound while this model was being written.
  const ev = new Evaluation(r.store);
  console.log(`  rules not range-restricted: ${ev.rules.filter((x) => !x.safe).length}`);
  console.log(`  relations evaluated top-down: ${ev.demandRels.size}`);
  console.log(`  facts in the store: ${r.factKeys().length}`);

  console.log(banner('2. Deny-overrides-Allow is not a priority rule; it is a stratum'));
  console.log(`
  route(P, A, R, Route) :- grant(P, Q, A, R, Route), not blocked(P, Q, A, R).

  That negated premise is the whole precedence rule. boot.rofl derives
  stratum/2 from the rule dependency graph as ordinary data, and the engine
  reads it: allow to fixpoint first, then the layer that may say "not".
  The stratum/2 facts this program produced:
`);
  const shown = ['has_cond', 'boundary_allows', 'applies', 'grant', 'deny_at',
    'blocked', 'route', 'access', 'via', 'absent'];
  for (const rel of shown) {
    const ns = r.query(`stratum(${rel}, N)`).rows.map((x) => Number(x.bindings.N));
    console.log(`    stratum(${rel},`.padEnd(30) + `max ${Math.max(...ns)})   [all: ${ns.join(', ')}]`);
  }
  console.log('\n  the engine reads the max, and runs negation rules in that order:');
  const plan = ev.strataPlan().filter((x) => shown.includes(x.rel));
  for (const p of [...plan].sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || (a.rel < b.rel ? -1 : 1))) {
    console.log(`    level ${p.level}  ${p.rel.padEnd(10)}(${p.rule})`);
  }

  console.log(banner('3. the denial: which policy, at which level, on which condition'));
  console.log(nope(r, 'alice', GET, OBJ));

  console.log(`
  A Deny anywhere wins, at any level. The bucket policy's unconditional
  Deny of s3:DeleteObject beats the admin role's Allow * on *:
`);
  console.log(nope(r, 'bob', DEL, OBJ));

  console.log('\n  and the raw engine answers behind the alice rendering:\n');
  console.log(indent(r.whynot(`access(alice, ${GET}, ${OBJ})`, { depth: 4, nodes: 40 }).text, 2));
  console.log('');
  console.log(indent(r.why(`blocked(alice, data_reader, ${GET}, ${OBJ})`).text, 2));

  console.log(banner('4. privilege sprawl: how many independent paths grant this?'));
  const counts = evaluateSemiring(r.store, countingSemiring);
  console.log(`  counting semiring over the support hypergraph: ${counts.rounds} rounds, `
    + `converged=${counts.converged}, discipline held=${counts.disciplineHeld}\n`);
  console.log(nope(r, 'bob', PUT, OBJ, counts.value));

  console.log('\n  the two grants that were cut, and by what:\n');
  for (const g of grantRows(r, 'bob', PUT, OBJ)) {
    const d = denials(r, 'bob', g.q, PUT, OBJ);
    if (d.length === 0) continue;
    console.log(`    ${g.chain.join(' -> ').padEnd(46)}${d.map((x) => `${x.level} (level ${x.depth})`).join(', ')}`);
  }
  console.log(`
  Note what the permission boundary on ci_runner does NOT do: it caps what
  ci_runner may do, and not what ci_runner may become. Both routes that pass
  THROUGH ci_runner on the way to admin_legacy survive it.`);

  console.log('\n  revocation drill -- take one grant away, ask again:\n');
  for (const revoke of ['member_of(bob, developers)', 'assumes(bob, deployer)',
    'attached(admin_legacy, p_admin)']) {
    const c = Rofl.fromSnapshot(r.save());
    const res = c.retract(revoke);
    if (!res.ok) throw new Error(`retract ${revoke}: ${res.diagnostics.join()}`);
    c.evaluate();
    const n = evaluateSemiring(c.store, countingSemiring).value.get(factKeyOf('access', ['bob', PUT, OBJ]));
    console.log(`    revoke ${revoke.padEnd(34)} -> access ${c.holds(`access(bob, ${PUT}, ${OBJ})`)}`
      + `, paths ${n === undefined ? 0 : renderCount(n)}`);
  }

  console.log(banner('5. the cycle: deployer <-> ci_runner, and why it changes nothing'));
  const kAccess = factKeyOf('access', ['bob', PUT, OBJ]);
  const kNaive = factKeyOf('access_naive', ['bob', PUT, OBJ]);
  console.log(`
  The role graph is cyclic. Asked as "routes in a graph" -- acts_as_naive,
  no chain in the fact -- the support hypergraph is cyclic too, and the
  counting semiring (CLOSED discipline, star supplies "unboundedly many")
  answers with the carrier's infinity. That is the engine being honest.
  Asked as "simple paths" -- via/3, chain in the fact -- every derivation
  extends the chain by one fresh identity, so nothing is cyclic and the
  answer is a number.
`);
  console.log(`    access[main](bob, s3:PutObject, prod-bucket/data.csv)        = ${renderCount(counts.value.get(kAccess)!)}`);
  console.log(`    access_naive[main](bob, s3:PutObject, prod-bucket/data.csv)  = ${renderCount(counts.value.get(kNaive)!)}`);
  const cyc = relsOnCycle(r, counts.value);
  console.log(`\n    relations with a fact on a cycle of the support hypergraph:`);
  console.log(`      simple-path formulation: ${cyc.simple.length === 0 ? '(none)' : cyc.simple.join(', ')}`);
  console.log(`      naive formulation:       ${cyc.naive.join(', ')}`);
  const bool = accessSets(r);
  console.log(`\n    and the two agree on the VERDICT everywhere: `
    + `${bool.same ? 'same fact set' : 'DISAGREE'} (${bool.n} access facts)`);

  console.log('\n  now close a second cycle: admin_legacy -> ci_runner.\n');
  const r2 = world();
  const before = routesOf(r2, 'bob', PUT, OBJ).length;
  must(r2.load('assumes(admin_legacy, ci_runner).'), 'extra edge');
  const after = routesOf(r2, 'bob', PUT, OBJ).length;
  const c2 = evaluateSemiring(r2.store, countingSemiring);
  console.log(`    surviving routes for bob before: ${before}   after: ${after}`);
  console.log(`    counted:  access = ${renderCount(c2.value.get(kAccess)!)}`
    + `,  access_naive = ${renderCount(c2.value.get(kNaive)!)}`);
  console.log(`    every path to admin_legacy already passes through ci_runner,`);
  console.log(`    so the new edge closes a cycle and creates no new way in.`);

  console.log(banner('6. the other questions the same fixpoint answers'));
  const trop = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });
  console.log(`  tropical (1 per rule firing): cheapest derivation of access = `
    + `${trop.value.get(kAccess)} firings -- the shortest route, computed, not searched for.`);
  const prov = evaluateSemiring(r.store, provenanceSemiring, { base: provenanceOf });
  const poly = prov.value.get(kAccess)!;
  console.log(`  provenance: ${poly.length} minimal source sets for that access -- one per`);
  console.log(`  independent route, each naming exactly the base facts it rests on. E.g.`);
  const smallest = [...poly].sort((a, b) => a.length - b.length)[0];
  for (const f of smallest) console.log(`      ${f}`);

  console.log(banner('7. the oracle: exhaustive enumeration'));
  const oc = oracleCheck(r, counts.value);
  console.log(`
  For a finite model, enumeration is a COMPLETE oracle. Every (principal,
  action, resource) triple is decided a second time by a direct evaluation
  of the policy set in plain TypeScript -- a DFS over the assume-role graph
  with a visited set, no engine, no rules -- and compared on BOTH the verdict
  and the number of independent routes.
`);
  console.log(`    principals x actions x resources = `
    + `${oc.principals} x ${oc.actions} x ${oc.resources} = ${oc.checked} triples`);
  console.log(`    verdict disagreements: ${oc.verdictMismatch}`);
  console.log(`    route-count disagreements: ${oc.countMismatch}`);
  for (const d of oc.disagreements.slice(0, 20)) console.log(d);
  console.log(`\n  (${Date.now() - t0} ms for everything above.)`);
  if (oc.verdictMismatch + oc.countMismatch > 0) process.exitCode = 1;
}

export interface OracleReport {
  principals: number; actions: number; resources: number; checked: number;
  verdictMismatch: number; countMismatch: number; disagreements: string[];
}

/** Enumerate every (principal, action, resource) triple, decide it twice --
 *  once by the engine, once by the independent evaluator above -- and compare
 *  the verdict AND the number of independent routes. A disagreement is the
 *  finding; the model is never tuned to make one go away. */
export function oracleCheck(r: Rofl, counts: Map<string, Count>): OracleReport {
  const edb = readEdb(r);
  const oracle = new Oracle(edb);
  const out: OracleReport = {
    principals: edb.identities.length, actions: edb.actions.length,
    resources: edb.resources.length, checked: 0,
    verdictMismatch: 0, countMismatch: 0, disagreements: [],
  };
  for (const p of edb.identities) {
    for (const a of edb.actions) {
      for (const res of edb.resources) {
        out.checked++;
        const want = oracle.decide(p, a, res);
        const got = r.holds(`access(${p}, ${a}, ${res})`);
        const n = counts.get(factKeyOf('access', [p, a, res]));
        const gotN = n === INFINITE ? -1 : n === undefined ? 0 : Number(n);
        if (got !== want.allowed) {
          out.verdictMismatch++;
          out.disagreements.push(`  VERDICT ${p} ${unq(a)} ${unq(res)}: engine=${got} oracle=${want.allowed}`);
        }
        if (gotN !== want.routes) {
          out.countMismatch++;
          out.disagreements.push(`  COUNT   ${p} ${unq(a)} ${unq(res)}: engine=${gotN} oracle=${want.routes}`);
        }
      }
    }
  }
  return out;
}

/** Which relations have a fact on a cycle of the live support hypergraph.
 *  A CLOSED-discipline count of INFINITE is exactly that condition. */
export function relsOnCycle(r: Rofl, value: Map<string, Count>): { simple: string[]; naive: string[] } {
  const mine = new Set(['via', 'absent', 'chain_seen', 'grant', 'route', 'access']);
  const naiveRels = new Set(['acts_as_naive', 'grant_naive', 'route_naive', 'access_naive']);
  const hit = new Set<string>();
  for (const [k, v] of value) if (v === INFINITE) hit.add(k.slice(0, k.indexOf('[')));
  return {
    simple: [...mine].filter((x) => hit.has(x)).sort(),
    naive: [...naiveRels].filter((x) => hit.has(x)).sort(),
  };
}

/** The simple-path and the walk formulation must agree on the verdict. */
export function accessSets(r: Rofl): { same: boolean; n: number } {
  const a = tuples(r, 'access', 3).map((t) => t.join('|')).sort();
  const b = tuples(r, 'access_naive', 3).map((t) => t.join('|')).sort();
  return { same: a.length === b.length && a.every((x, i) => x === b[i]), n: a.length };
}

const indent = (s: string, n: number) => s.split('\n').map((l) => ' '.repeat(n) + l).join('\n');

const realPath = (p: string) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && realPath(path.resolve(process.argv[1])) === realPath(new URL(import.meta.url).pathname)) {
  main();
}
