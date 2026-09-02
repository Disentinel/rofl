// NOPE (examples/nope) -- the access decision, whynot naming the level and
// the condition that cut it, and the property the whole counting metric
// stands on: an assume-role CYCLE must not inflate the number of independent
// paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rofl } from '../src/api.ts';
import { Evaluation } from '../src/engine.ts';
import { peelRounds } from '../src/rounds.ts';
import { evaluateSemiring } from '../src/semiring.ts';
import { countingSemiring, INFINITE, type Count } from '../runtime/semirings.ts';
import {
  world, tuples, routesOf, grantRows, oracleCheck, GET, PUT, DEL, OBJ,
} from '../examples/nope/demo.ts';

// One evaluation shared by every read-only test: loading is the expensive
// part and none of these mutate the store.
let shared: Rofl | null = null;
const model = (): Rofl => (shared ??= world());

let sharedCounts: Map<string, Count> | null = null;
const counts = (): Map<string, Count> =>
  (sharedCounts ??= evaluateSemiring(model().store, countingSemiring).value);

const ACCESS_BOB_PUT = `access[main](bob,${PUT},${OBJ})`;
const NAIVE_BOB_PUT = `access_naive[main](bob,${PUT},${OBJ})`;

// ---------------------------------------------------------------------------
// the model itself

test('the model loads, boot audits it clean, and every rule materialises', () => {
  const r = model();
  for (const audit of ['unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
    'leak[audit](A, B)', 'forged[audit](F)', 'unmoded[audit](R)']) {
    assert.equal(r.query(audit).rows.length, 0, `${audit} must be empty`);
  }
  // A rule that is not range-restricted is evaluated top-down instead of
  // materialised, silently. Nothing here may be: the semiring fold reads the
  // support of materialised facts.
  const ev = new Evaluation(r.store);
  assert.deepEqual(ev.rules.filter((x) => !x.safe).map((x) => x.canon), []);
  assert.equal(ev.demandRels.size, 0);
});

// ---------------------------------------------------------------------------
// the decision, and the level that made it

test('deny overrides allow -- and the precedence is a level, not a priority rule', () => {
  const r = model();
  // The levels the evaluator SCHEDULED BY, peeled off the decoded rules. This
  // used to read `stratum/2` out of the store, which boot.rofl derived; those
  // ten rules were deleted once nothing read them. The order is the same order;
  // the numbers start one higher, because a round is a wave and everything a
  // rule concludes wakes in round 1 at the earliest, while a stratum was a
  // negation depth and could inherit 0 from base facts.
  const peel = peelRounds(new Evaluation(r.store).rules);
  const max = (rel: string): number => peel.round.get(rel) ?? -1;

  assert.equal(max('has_cond'), 1, 'no negation below it');
  assert.equal(max('boundary_allows'), 1);
  assert.equal(max('applies'), 2, 'reads `not has_cond`');
  assert.equal(max('deny_at'), 2, 'reads `not boundary_allows`');
  assert.equal(max('blocked'), 2);
  assert.equal(max('route'), 3, 'reads `not blocked`: strictly above every Deny');
  assert.equal(max('access'), 3);
  assert.ok(max('route') > max('blocked'),
    'allow runs to fixpoint before anything may say "not"');
  assert.equal(peel.stalled, false, 'positive control: the peel settled everything');

  // the decision itself: allowed by the role, cut by the SCP above it
  assert.equal(r.holds(`grant(alice, data_reader, ${GET}, ${OBJ}, X)`), true, 'the role allows');
  assert.equal(r.holds(`access(alice, ${GET}, ${OBJ})`), false, 'and the Deny wins');
  // and an unconditional Deny at the resource level beats Allow * on *
  assert.equal(r.holds(`grant(bob, admin_legacy, ${DEL}, ${OBJ}, X)`), true);
  assert.equal(r.holds(`access(bob, ${DEL}, ${OBJ})`), false);
});

test('whynot names the level, the policy and the condition that denied', () => {
  const r = model();
  const wn = r.whynot(`access(alice, ${GET}, ${OBJ})`, { depth: 4, nodes: 40 });
  assert.equal(wn.holds, false);
  // the cut is the negated premise of the Deny-overrides rule, and whynot
  // names the witness that blocks it
  assert.match(wn.text, /not blocked\[main\]\(alice,data_reader,/);
  assert.match(wn.text, /blocked: blocked\[main\]\(alice,data_reader,.*\) holds/);

  // and `why` on that witness is the level / policy / condition answer
  const why = r.why(`blocked(alice, data_reader, ${GET}, ${OBJ})`);
  assert.equal(why.ok, true);
  const iLevel = why.text.indexOf(',scp,s_scp_env_guard)');
  const iPolicy = why.text.indexOf('statement[main](p_scp_prod,s_scp_env_guard,deny,"s3:*"');
  const iCond = why.text.indexOf('condition[main](s_scp_env_guard,"aws:PrincipalTag/env",ne,"prod")');
  const iTag = why.text.indexOf('tag[main](alice,"aws:PrincipalTag/env","staging")');
  const iBuiltin = why.text.indexOf('"staging" != "prod" [builtin]');
  assert.ok(iLevel > 0, 'names the LEVEL: scp, not the role');
  assert.ok(iPolicy > iLevel, 'names the policy statement');
  assert.ok(iCond > iPolicy, 'names the condition');
  assert.ok(iTag > iCond, "names the principal's actual tag");
  assert.ok(iBuiltin > iTag, 'and bottoms out on the comparison that fired');
  // the OU is in the chain: the denial came from the organization, not the account
  assert.match(why.text, /scp\[main\]\(prod_ou,p_scp_prod\)/);
});

// ---------------------------------------------------------------------------
// the metric

test('the sprawl count is the number of independent routes, folded over the support', () => {
  const r = model();
  const routes = routesOf(r, 'bob', PUT, OBJ);
  const grants = grantRows(r, 'bob', PUT, OBJ);
  assert.equal(grants.length, 8, 'eight policy grants reach the request');
  assert.equal(routes.length, 6, 'two are cut by the permission boundary on ci_runner');
  assert.equal(counts().get(ACCESS_BOB_PUT), BigInt(routes.length),
    'the counting semiring agrees with the enumerated routes');

  // routes really are independent: revoke any one and access survives
  for (const revoke of ['member_of(bob, developers)', 'assumes(bob, deployer)',
    'attached(admin_legacy, p_admin)']) {
    const c = Rofl.fromSnapshot(r.save());
    assert.equal(c.retract(revoke).ok, true, revoke);
    c.evaluate();
    assert.equal(c.holds(`access(bob, ${PUT}, ${OBJ})`), true,
      `revoking ${revoke} alone must not remove access`);
    const n = evaluateSemiring(c.store, countingSemiring).value.get(ACCESS_BOB_PUT) as bigint;
    assert.ok(n < 6n && n > 0n, `${revoke}: fewer paths, still some (${n})`);
  }
});

test('the assume-role CYCLE does not inflate the path count', () => {
  const r = model();
  // the cycle is real, and it is in the role graph
  assert.equal(r.holds('assumes(deployer, ci_runner)'), true);
  assert.equal(r.holds('assumes(ci_runner, deployer)'), true);

  // asked as routes-in-a-graph, the support hypergraph is cyclic and the
  // CLOSED-discipline count says so: unboundedly many. That is honest, and
  // it is the wrong metric.
  assert.equal(counts().get(NAIVE_BOB_PUT), INFINITE);
  // asked as simple paths, the chain is in the fact, no support cycle exists,
  // and the answer is a number
  assert.equal(counts().get(ACCESS_BOB_PUT), 6n);
  for (const rel of ['via', 'absent', 'chain_seen', 'grant', 'route', 'access']) {
    for (const [k, v] of counts()) {
      if (k.startsWith(rel + '[')) {
        assert.notEqual(v, INFINITE, `${k} must not be on a support cycle`);
      }
    }
  }

  // both formulations agree on the VERDICT everywhere -- walk reachability
  // and simple-path reachability coincide; only the COUNT differs
  const a = tuples(r, 'access', 3).map((t) => t.join('|')).sort();
  const b = tuples(r, 'access_naive', 3).map((t) => t.join('|')).sort();
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);

  // and closing another cycle adds no path: every route to admin_legacy
  // already passes through ci_runner, so admin_legacy -> ci_runner can only
  // re-enter a role already on the chain.
  const r2 = world();
  assert.equal(routesOf(r2, 'bob', PUT, OBJ).length, 6);
  assert.equal(r2.load('assumes(admin_legacy, ci_runner).').ok, true);
  assert.equal(r2.holds('assumes(admin_legacy, ci_runner)'), true, 'the new edge is there');
  assert.equal(routesOf(r2, 'bob', PUT, OBJ).length, 6, 'and it changed nothing');
  const c2 = evaluateSemiring(r2.store, countingSemiring).value;
  assert.equal(c2.get(ACCESS_BOB_PUT), 6n, 'the count is unmoved by a new cycle');
  assert.equal(c2.get(NAIVE_BOB_PUT), INFINITE, 'while the naive metric stays useless');
});

// ---------------------------------------------------------------------------
// the oracle

test('exhaustive enumeration: engine and direct evaluation agree on every triple', () => {
  const r = model();
  const report = oracleCheck(r, counts());
  assert.equal(report.checked, report.principals * report.actions * report.resources);
  assert.equal(report.checked, 72, 'the whole request space of this model');
  assert.deepEqual(report.disagreements, []);
  assert.equal(report.verdictMismatch, 0);
  assert.equal(report.countMismatch, 0);
});
