# NOPE — `whynot` for access control

Not *"Access Denied"*, but **which policy, at which level of the hierarchy,
on which condition**. And then the question no IAM tool answers at all:
**how many independent paths grant this access** — because if there are six,
revoking one changes nothing, and that is why permission cleanups in large
organizations run for years without moving the number.

```sh
node --experimental-strip-types examples/nope/demo.ts
```

Files: [`nope.rofl`](nope.rofl) (the policy model, 134 clauses in 266 lines with the
commentary), [`demo.ts`](demo.ts) (the runner, the `nope` rendering, and the
oracle), [`page.html`](page.html) (the same idea at two levels of depth),
[`../../test/example-nope.test.ts`](../../test/example-nope.test.ts).

## What it shows

1. **A denial explained down to the condition.** `alice` is allowed
   `s3:GetObject` on `prod-bucket` by the `data_reader` role, and denied by
   an SCP two levels up the organization, on a tag condition she fails. The
   answer names the level, the policy, the statement, the condition and the
   tag value she actually has.
2. **Deny-overrides-Allow as stratified negation.** It is one negated
   premise. Nothing schedules it; `boot.rofl` computes `stratum/2` from the
   rule dependency graph as ordinary data and the engine reads it.
3. **The sprawl metric.** `bob` reaches `s3:PutObject` on the same bucket
   eight ways; two are cut by a permission boundary; **six independent
   routes survive**. The number is the counting semiring folded over the
   support hypergraph — the same fact the Boolean answer comes from.
4. **A real assume-role cycle that does not inflate the metric**, and the
   same question asked wrongly, which does.
5. **An oracle**: all 72 (principal, action, resource) triples decided a
   second time by a direct evaluation of the policy set, and compared on the
   verdict *and* the route count.

## The model

AWS-shaped, four levels of policy, small enough to read in one sitting:

| level | relation | in this model |
|---|---|---|
| 1 organization | `scp(Ou, Policy)` | `prod_ou` denies `s3:*` on `prod-bucket/*` unless `aws:PrincipalTag/env == prod` |
| 2 permission boundary | `boundary(Identity, Policy)` | `ci_runner` may only write to `artifacts/*` |
| 3 identity policy | `attached(Holder, Policy)` | users, the `developers` group, and four roles |
| 4 resource policy | `bucket_policy(Pattern, Policy)` | the bucket policy allows `bob` to `PutObject` and denies `DeleteObject` to everyone |

The assume-role graph contains a genuine cycle:

```
alice -> data_reader
bob   -> deployer, ci_runner
deployer <-> ci_runner            <== the cycle
ci_runner -> admin_legacy
```

Wildcards (`s3:*`, `arn:aws:s3:::prod-bucket/*`) are expanded into
`action_in/2` and `resource_in/2` facts. In a real tool the policy parser
emits those; here they are written out, because in ROFL the expansion is
data like everything else.

## Deny-overrides-Allow is not a priority rule

This is the sharpest thing in the example, and it is worth being precise
about. Access-control engines normally implement Deny precedence as a
*procedure*: gather all applicable statements, then apply an ordering
(explicit Deny beats Allow beats implicit Deny). The ordering is a hand-written
pass, and getting it wrong is the classic IAM engine bug.

Here it is one clause:

```prolog
route(P, A, R, Route) :- grant(P, Q, A, R, Route), not blocked(P, Q, A, R).
```

`not` in a Datalog with stratified negation *means* "after the layer that
concludes `blocked` has reached its fixpoint". The ordering is not coded; it
is derived. `boot.rofl` computes it with three ordinary rules —

```prolog
stratum(Rel, 0)   :- edb(Rel).
stratum(Rel, N)   :- dep_neg(Rel, Q), stratum(Q, M), N is M + 1.
stratum(Rel, N)   :- dep(Rel, Q), stratum(Q, N).
```

— and the kernel *reads* the resulting `stratum/2` facts. It contains no
stratification checker of its own. These are the values from an actual run
(`demo.ts` section 2; the engine takes the max per relation):

```
    stratum(has_cond,         max 0)   [all: 0]
    stratum(boundary_allows,  max 0)   [all: 0]
    stratum(applies,          max 1)   [all: 0, 1]
    stratum(grant,            max 1)   [all: 0, 1]
    stratum(deny_at,          max 1)   [all: 0, 1]
    stratum(blocked,          max 1)   [all: 0, 1]
    stratum(route,            max 2)   [all: 0, 1, 2]
    stratum(access,           max 2)   [all: 0, 1, 2]
    stratum(via,              max 0)   [all: 0]
    stratum(absent,           max 0)   [all: 0]

  the engine reads the max, and runs negation rules in that order:
    level 1  applies   (r8d9fd794)
    level 1  deny_at   (r5603ba6c)
    level 2  route     (ra5577d70)
```

Read that as the AWS evaluation order, computed rather than written down:

- **0** — the monotone layer: statements, wildcard expansion, who holds
  which policy, what a boundary permits, which chains exist.
- **1** — `applies` (a statement with no `Condition` block applies to
  everyone: `not has_cond`) and `deny_at` (a permission boundary is not an
  explicit Deny but the *absence* of an Allow: `not boundary_allows`).
- **2** — `route`, the only place where Allow meets Deny. It is strictly
  above every Deny rule, so every Deny is complete before any Allow survives.

Two consequences fall out for free. Adding a fifth policy level does not
change the precedence code, because there isn't any: add `deny_at` rules and
the stratum shifts by itself. And a policy model with circular negation is
*rejected at load* with a trace, instead of quietly picking an order.

## The counting metric, and why simple paths

The interesting question is not "does bob have access" but "in how many
independent ways". That is the privilege-sprawl number: with six, a
revocation ticket that removes one of them accomplishes nothing, and nobody
can see that from a Boolean simulator.

Assume-role chains form cycles, and **the number of routes through a cyclic
graph is infinite**. Counting must therefore be over *simple paths*:
re-entering a role grants no new privilege, so `A -> B -> A -> C` is not an
independent way to reach `C` beyond `A -> C`.

### What a high count means *here*

The count is the same arithmetic in every domain and its meaning is not.
Recorded as finding `f_counting_reads_oppositely_by_domain`: many derivations
can read as robust, as ambiguous, or as fragile depending on what is being
counted, so each example has to state the sign of its own metric.

**In NOPE, the count measures how robust the access is to revocation — and
robustness of a grant nobody intended is exactly the risk.** Six is not six
times as much access; it is one access that survives five separate
revocations. The number is a *remediation-cost* estimate, and a rising count
on an unwanted privilege is the alarm. (Contrast `examples/oops`, where
independent supports for a conclusion make the conclusion stronger, and the
same number is good news.)

`nope.rofl` puts the path **inside the fact**:

```prolog
via(P, P, cons(P, nil))  :- identity(P).
via(P, Q, cons(Q, C))    :- via(P, X, C), assumes(X, Q), absent(Q, C).
```

Every derivation extends the chain by one identity not already on it, so the
role graph may cycle all it likes while the **support hypergraph of `via`
stays acyclic** — and a cycle that is not in the support hypergraph cannot
inflate a fold over it. Chain membership (`absent/2`) is positive, not
negated: its term domain is generated by `chain_seen/1` from chains already
derived, which keeps the whole thing monotone recursion over terms and out of
any argument with the stratification checker.

### Which discipline, and why

`runtime/semirings.ts` declares BOUNDED / CLOSED / BOUNDED_UNFOLDING per
instance precisely so this choice has to be stated. **This example uses the
plain `countingSemiring` (CLOSED) and changes the MODEL, not the semiring.**

That is the important part. There were three ways to get a finite number:

- `depthBoundedCountingSemiring(n)` — counts derivations of height at most
  `n`. Rejected: it answers a *different question*, and its answer moves when
  you change `n`. "How many paths, up to length 4" is not the sprawl metric,
  and a metric with a knob on it is not one you can put in a report.
- Break the cycle in the input graph. Rejected: it is a lie about the
  organization, and the cycle is exactly the thing worth measuring.
- Encode the path in the fact. Chosen: the metric becomes *defined*, the
  discipline stays CLOSED and exact, and `INFINITE` remains available as a
  real answer for a question that really has no finite one.

The demo keeps the naive formulation alongside (`acts_as_naive`,
`access_naive`) to make the contrast auditable. Both produce **the same
access verdict on every triple** — walk-reachability and simple-path
reachability coincide — and the counts differ:

```
    access[main](bob, s3:PutObject, prod-bucket/data.csv)        = 6
    access_naive[main](bob, s3:PutObject, prod-bucket/data.csv)  = infinitely many

    relations with a fact on a cycle of the support hypergraph:
      simple-path formulation: (none)
      naive formulation:       access_naive, acts_as_naive, grant_naive, route_naive
```

`infinitely many` is not a bug and not an overflow: `INFINITE` is a member of
the counting carrier, `star(1) = INFINITE`, and every fact on a cycle of the
support graph is multiplied by it. The engine is answering the question it
was asked. It is just the wrong question for this domain.

### The cycle is itself a result

Worth separating from the counting question, and the reason the demo prints
which relations sit on a support cycle rather than only printing the count:
**a cycle in an assume-role graph is a security finding in its own right.**
`deployer` and `ci_runner` can each assume the other, so compromising either
one is compromising both, and no privilege review that looks at roles one at a
time will see it. Detecting it is cheap — it is exactly the strongly-connected
component the semiring fold already computes to decide where `star` applies —
and reporting it costs nothing beyond deciding to.

The cycle test in `test/example-nope.test.ts` proves non-inflation directly:
closing a *second* cycle (`admin_legacy -> ci_runner`) leaves the count at 6,
because every route to `admin_legacy` already passes through `ci_runner` and
the new edge can only re-enter a role already on the chain.

## The oracle

**For a finite model, exhaustive enumeration is a complete oracle.** Section 7
of the demo walks every (principal, action, resource) triple and decides each
one a second time with a direct evaluation of the policy set in plain
TypeScript — a DFS over the assume-role graph with a visited set, no engine,
no rules, no shared code with `nope.rofl` beyond reading the same base facts.
It compares **both** the verdict and the number of independent routes.

```
    principals x actions x resources = 6 x 4 x 3 = 72 triples
    verdict disagreements: 0
    route-count disagreements: 0
```

Comparing the counts, not only the verdicts, is what makes this an oracle for
the *metric* and not just for the decision. If the two ever disagree, that is
the finding — the model does not get tuned until they match.

One check in the same spirit runs on the model itself: `demo.ts` asserts that
**no rule is outside range restriction** and no relation is evaluated
top-down. That check earned its place — it is what caught the resource-policy
Deny rule leaving the acting identity unbound while this example was being
written, which would have made `deny_at` a demand relation and put its facts
outside the fold.

## Limits of this model

Stated rather than discovered:

- **Session tags.** Conditions are evaluated against the *origin* principal
  of the chain, as if every `AssumeRole` passed session tags through. Real
  `aws:PrincipalTag` on a role session comes from the role's own tags unless
  `sts:TagSession` is used.
- **Null-key condition semantics.** AWS's `StringNotEquals` matches when the
  key is absent. Here a `ne` condition needs the tag to be present; every
  principal in the model carries `aws:PrincipalTag/env`, so the corner is
  never reached.
- **Wildcards are pre-expanded** into `action_in`/`resource_in`. There is no
  string matching in the kernel (integers and term equality only), and a
  policy parser is out of scope for this example. This *moves the why-boundary*
  (finding `f_no_string_builtins_moves_why_boundary`): a `why` tree bottoms out
  at `action_in("s3:GetObject", "s3:*")` as an axiom, not at the glob match
  that produced it. For this domain the boundary is in a defensible place —
  the expansion is mechanical and total, and the interesting reasoning is all
  above it — but it is a boundary, and it is where a bug in a real policy
  parser would hide from the explanation.
- **The permission-boundary Deny is grounded on an existing grant.** A
  boundary caps a grant; where nothing granted there is nothing to cap. The
  oracle mirrors this exactly.
- **No session policies, no ABAC beyond one tag key, no `NotAction`,
  `NotResource` or `Condition` operators other than `eq`/`ne`.** Each is more
  facts and more `applies` rules, not a new mechanism.
- **`tropical` here answers "shortest route"**, not the spec's
  least-privilege synthesis (the minimal permission set for a task list).
  That needs a task model, which this example does not have.

## The full transcript

Everything below is `node --experimental-strip-types examples/nope/demo.ts`,
verbatim. The wall-clock line at the end varies between runs; nothing else
does.

```
1. the model loads, and boot.rofl audits it
===========================================
  ? unstratified(X)          -> 0 rows
  ? malformed[audit](R)      -> 0 rows
  ? breach[audit](R)         -> 0 rows
  ? leak[audit](A, B)        -> 0 rows
  ? forged[audit](F)         -> 0 rows
  ? unmoded[audit](R)        -> 0 rows
  rules not range-restricted: 0
  relations evaluated top-down: 0
  facts in the store: 3707

2. Deny-overrides-Allow is not a priority rule; it is a stratum
===============================================================

  route(P, A, R, Route) :- grant(P, Q, A, R, Route), not blocked(P, Q, A, R).

  That negated premise is the whole precedence rule. boot.rofl derives
  stratum/2 from the rule dependency graph as ordinary data, and the engine
  reads it: allow to fixpoint first, then the layer that may say "not".
  The stratum/2 facts this program produced:

    stratum(has_cond,         max 0)   [all: 0]
    stratum(boundary_allows,  max 0)   [all: 0]
    stratum(applies,          max 1)   [all: 0, 1]
    stratum(grant,            max 1)   [all: 0, 1]
    stratum(deny_at,          max 1)   [all: 0, 1]
    stratum(blocked,          max 1)   [all: 0, 1]
    stratum(route,            max 2)   [all: 0, 1, 2]
    stratum(access,           max 2)   [all: 0, 1, 2]
    stratum(via,              max 0)   [all: 0]
    stratum(absent,           max 0)   [all: 0]

  the engine reads the max, and runs negation rules in that order:
    level 1  applies   (r8d9fd794)
    level 1  deny_at   (r5603ba6c)
    level 2  route     (ra5577d70)

3. the denial: which policy, at which level, on which condition
===============================================================
$ nope alice s3:GetObject arn:aws:s3:::prod-bucket/data.csv
access absent.

  alice -> data_reader
    data_reader grants   Allow s3:GetObject on arn:aws:s3:::prod-bucket/*  [p_data_reader / s_read_prod]
    but scp (level 1) denies   Deny s3:* on arn:aws:s3:::prod-bucket/*  [p_scp_prod / s_scp_env_guard]
       condition aws:PrincipalTag/env != prod;  alice has staging

  cutting link: scp, level 1 of 4 -- not the role.

  A Deny anywhere wins, at any level. The bucket policy's unconditional
  Deny of s3:DeleteObject beats the admin role's Allow * on *:

$ nope bob s3:DeleteObject arn:aws:s3:::prod-bucket/data.csv
access absent.

  bob -> ci_runner -> admin_legacy
    admin_legacy grants   Allow * on *  [p_admin / s_admin_all]
    but resource_policy (level 4) denies   Deny s3:DeleteObject on arn:aws:s3:::prod-bucket/*  [p_bucket / s_bucket_no_delete]

  bob -> deployer -> ci_runner -> admin_legacy
    admin_legacy grants   Allow * on *  [p_admin / s_admin_all]
    but resource_policy (level 4) denies   Deny s3:DeleteObject on arn:aws:s3:::prod-bucket/*  [p_bucket / s_bucket_no_delete]

  cutting link: resource_policy, level 4 of 4 -- not the role.

  and the raw engine answers behind the alice rendering:

  whynot access[main](alice,"s3:GetObject","arn:aws:s3:::prod-bucket/data.csv"):
    rule r754f415e: access[main](?P,?A,?R)@now :- route[main](?P,?A,?R,?_$1)@now
      failed premise: route[main](alice,"s3:GetObject","arn:aws:s3:::prod-bucket/data.csv",?_$1#0)
        rule ra5577d70: route[main](?P,?A,?R,?Route)@now :- grant[main](?P,?Q,?A,?R,?Route)@now, not blocked[main](?P,?Q,?A,?R)@now
          failed premise: not blocked[main](alice,data_reader,"s3:GetObject","arn:aws:s3:::prod-bucket/data.csv") -- blocked: blocked[main](alice,data_reader,"s3:GetObject","arn:aws:s3:::prod-bucket/data.csv") holds

  blocked[main](alice,data_reader,"s3:GetObject","arn:aws:s3:::prod-bucket/data.csv")  <= r9fcbe645 @tick 0
    deny_at[main](alice,data_reader,"s3:GetObject","arn:aws:s3:::prod-bucket/data.csv",scp,s_scp_env_guard)  <= r57c41837 @tick 0
      in_account[main](data_reader,a_prod)  <= r062f1bc9 @tick 0
        role[main](data_reader,a_prod) [axiom]
      governs[main](a_prod,prod_ou)  <= r45f38871 @tick 0
        account[main](a_prod,prod_ou) [axiom]
        ou_ancestor[main](prod_ou,prod_ou)  <= rf8dbd792 @tick 0
          ou[main](prod_ou) [axiom]
      scp[main](prod_ou,p_scp_prod) [axiom]
      statement[main](p_scp_prod,s_scp_env_guard,deny,"s3:*","arn:aws:s3:::prod-bucket/*") [axiom]
      action_in[main]("s3:GetObject","s3:*") [axiom]
      resource_in[main]("arn:aws:s3:::prod-bucket/data.csv","arn:aws:s3:::prod-bucket/*") [axiom]
      applies[main](s_scp_env_guard,alice)  <= r34a6c028 @tick 0
        condition[main](s_scp_env_guard,"aws:PrincipalTag/env",ne,"prod") [axiom]
        tag[main](alice,"aws:PrincipalTag/env","staging") [axiom]
        "staging" != "prod" [builtin]

4. privilege sprawl: how many independent paths grant this?
===========================================================
  counting semiring over the support hypergraph: 15 rounds, converged=true, discipline held=true

$ nope bob s3:PutObject arn:aws:s3:::prod-bucket/data.csv
access present.  independent paths: 6   (8 grants, 2 cut by a Deny)

  bob                                           Allow s3:PutObject on arn:aws:s3:::prod-bucket/*  [p_bucket / s_bucket_bob]
  bob                                           Allow s3:PutObject on arn:aws:s3:::prod-bucket/*  [p_dev_write / s_dev_put]
  bob -> deployer                               Allow s3:PutObject on arn:aws:s3:::prod-bucket/*  [p_deploy / s_put_prod]
  bob -> ci_runner -> admin_legacy              Allow * on *  [p_admin / s_admin_all]
  bob -> ci_runner -> deployer                  Allow s3:PutObject on arn:aws:s3:::prod-bucket/*  [p_deploy / s_put_prod]
  bob -> deployer -> ci_runner -> admin_legacy  Allow * on *  [p_admin / s_admin_all]

  the two grants that were cut, and by what:

    bob -> ci_runner                              permission_boundary (level 2)
    bob -> deployer -> ci_runner                  permission_boundary (level 2)

  Note what the permission boundary on ci_runner does NOT do: it caps what
  ci_runner may do, and not what ci_runner may become. Both routes that pass
  THROUGH ci_runner on the way to admin_legacy survive it.

  revocation drill -- take one grant away, ask again:

    revoke member_of(bob, developers)         -> access true, paths 5
    revoke assumes(bob, deployer)             -> access true, paths 4
    revoke attached(admin_legacy, p_admin)    -> access true, paths 4

5. the cycle: deployer <-> ci_runner, and why it changes nothing
================================================================

  The role graph is cyclic. Asked as "routes in a graph" -- acts_as_naive,
  no chain in the fact -- the support hypergraph is cyclic too, and the
  counting semiring (CLOSED discipline, star supplies "unboundedly many")
  answers with the carrier's infinity. That is the engine being honest.
  Asked as "simple paths" -- via/3, chain in the fact -- every derivation
  extends the chain by one fresh identity, so nothing is cyclic and the
  answer is a number.

    access[main](bob, s3:PutObject, prod-bucket/data.csv)        = 6
    access_naive[main](bob, s3:PutObject, prod-bucket/data.csv)  = infinitely many

    relations with a fact on a cycle of the support hypergraph:
      simple-path formulation: (none)
      naive formulation:       access_naive, acts_as_naive, grant_naive, route_naive

    and the two agree on the VERDICT everywhere: same fact set (45 access facts)

  now close a second cycle: admin_legacy -> ci_runner.

    surviving routes for bob before: 6   after: 6
    counted:  access = 6,  access_naive = infinitely many
    every path to admin_legacy already passes through ci_runner,
    so the new edge closes a cycle and creates no new way in.

6. the other questions the same fixpoint answers
================================================
  tropical (1 per rule firing): cheapest derivation of access = 8 firings -- the shortest route, computed, not searched for.
  provenance: 6 minimal source sets for that access -- one per
  independent route, each naming exactly the base facts it rests on. E.g.
      action_in[main]("s3:PutObject","s3:PutObject")
      attached[main](developers,p_dev_write)
      member_of[main](bob,developers)
      resource_in[main]("arn:aws:s3:::prod-bucket/data.csv","arn:aws:s3:::prod-bucket/*")
      statement[main](p_dev_write,s_dev_put,allow,"s3:PutObject","arn:aws:s3:::prod-bucket/*")
      user[main](bob,a_prod)

7. the oracle: exhaustive enumeration
=====================================

  For a finite model, enumeration is a COMPLETE oracle. Every (principal,
  action, resource) triple is decided a second time by a direct evaluation
  of the policy set in plain TypeScript -- a DFS over the assume-role graph
  with a visited set, no engine, no rules -- and compared on BOTH the verdict
  and the number of independent routes.

    principals x actions x resources = 6 x 4 x 3 = 72 triples
    verdict disagreements: 0
    route-count disagreements: 0

  (4603 ms for everything above.)
```

## Five questions, one fixpoint

The Boolean answer and the sprawl count come from **the same fact**,
`access(bob, "s3:PutObject", …)`, folded with a different semiring over the
support the engine already recorded. Nothing is re-derived, and no query
language is extended:

| semiring | question | answer here |
|---|---|---|
| Boolean | is there access? | yes |
| counting | how many independent ways? | 6 |
| tropical | what is the shortest route? | 8 rule firings |
| provenance | which policies jointly produce it? | 6 minimal source sets |

Every IAM simulator on the market, AWS's included, is the first row.
