# DRIP — what goes dark if you delete this metric

*Data lineage in observability: dashboards, alerts and the series they stand on.*

A metric is renamed or deleted. Panels quietly empty and alerts stop firing.
That is not an error — it is an **absence** of data, so nothing turns red and
nobody notices. It is discovered on the day the alert was needed and did not
come.

The reverse question is the same question: before deleting a metric, nobody can
say what stands on it.

```
node --experimental-strip-types examples/drip/demo.ts
```

---

## Why this example is the strongest one in the set

Not because the reasoning is deeper. Because **extraction is deterministic at
both ends**.

| | source | how it is read |
|---|---|---|
| what people wrote | dashboard JSON, alert rules, recording rules | parse the JSON, pull metric names and label matchers out of the query text |
| what actually exists | the metrics store | `GET /api/v1/label/__name__/values`, then `/api/v1/series` |

Neither end needs a model, an expert, or a guess. Examples in this set
generally have a translation layer somewhere — a citation whose *kind* has to
be judged, a log line whose *meaning* has to be assigned — and that layer is
where they get expensive and arguable. Here there is no layer: both readers are
dumb, and both already exist in any observability stack.

**And the ground truth is free.** The prediction "this panel is empty" is
checked by opening the panel.

That is the claim this example is really making, and it is the reason to read
it before the others.

---

## The two ledgers

`drip.rofl` puts the two sources in two different books, and the kernel enforces
the separation:

```prolog
authority(repo,  dashboard_exporter).
authority(store, metrics_store).
imports(main, repo).
imports(main, store).
```

Facts about dashboards live in `[repo]`; facts about what exists live in
`[store]`; every conclusion lives in `[main]` and reads both through declared
imports. An exporter that would *like* a metric to exist cannot make it exist —
the attempt surfaces as a forgery, mechanically, with no code enforcing it:

```
  $ assert series[store]("wishful_thinking_total")  who=dashboard_exporter
  forged[audit] -> $fact(series,store,$cons("wishful_thinking_total",$nil))
  authority(store, Who) -> $kernel, metrics_store
```

That is not decoration. The whole value of this tool is that one side of the
comparison is not negotiable, and a perspective with a named writer is how the
kernel says so.

---

## 1. What is dark, and the named link

```
10 of 31 consumers resolve into nothing.

CONSUMER                  KIND   CAUSE                   LINK
al_canary_errors          alert  label value absent      http_requests_total{env="canary"}
p_canary_errors           panel  label value absent      http_requests_total{env="canary"}
p_canary_latency          panel  label value absent      http_request_duration_seconds{env="canary"}
al_payment_gw_errors      alert  metric absent           payment_gateway_errors_total
p_checkout_funnel         panel  metric absent           checkout_funnel_steps_total
p_payment_gw_errors       panel  metric absent           payment_gateway_errors_total
p_ingest_errors           panel  metric never existed    ingest_errors_totl
al_checkout_conv_drop     alert  recording rule broken   rr_checkout_conv -> job:checkout:conversion5m
p_checkout_conv           panel  recording rule broken   rr_checkout_conv -> job:checkout:conversion5m
slo_checkout_availability slo    recording rule broken   rr_checkout_conv -> job:checkout:conversion5m

4 of them are alerts or SLOs: al_canary_errors, al_checkout_conv_drop, al_payment_gw_errors, slo_checkout_availability.
A dark panel is visible to whoever opens the dashboard. A dark alert is
visible to nobody, until the day it was needed.
```

Four different structural causes, each with the link named. Not "no data".

---

## 2. `whynot` — the recursive chain

### The metric is not there

```
$ drip whynot p_payment_gw_errors    (the metric is not there)
  "Gateway errors by provider" on dash_payments
whynot consumer_live[main](p_payment_gw_errors):
  rule ra54d49c5: consumer_live[main](?C)@now :- consumer[main](?C)@now, query[repo](?Q,?C)@now, query_ok[main](?Q)@now
    failed premise: query_ok[main](q_pay_gw)
      rule rb134e973: query_ok[main](?Q)@now :- selector_count[repo](?Q,?N)@now, sl_ok[main](?Q,?N)@now
        failed premise: sl_ok[main](q_pay_gw,1)
          rule r7092752b: head does not unify
          rule r01d2e3fa: sl_ok[main](?Q,?N)@now :- selector_at[repo](?Q,?N,?S)@now, selector_ok[main](?S)@now, ?N1 is -(?N,1), sl_ok[main](?Q,?N1)@now
            failed premise: selector_ok[main](s_pay_gw)
              rule r3468ba50: selector_ok[main](?S)@now :- selector_metric[repo](?S,?M)@now, metric_ok[main](?M)@now, matchers_ok[main](?S)@now
                failed premise: metric_ok[main]("payment_gateway_errors_total")
                  rule r42f556b3: metric_ok[main](?M)@now :- records[repo](?R,?M)@now, rule_ok[main](?R)@now
                    failed premise: records[repo](?R#5,"payment_gateway_errors_total")
                      no rule concludes 'records' and no matching base fact exists
                  rule r0a7b57d4: metric_ok[main](?M)@now :- series[store](?M)@now, not recorded_metric[main](?M)@now
                    failed premise: series[store]("payment_gateway_errors_total")
                      no rule concludes 'series' and no matching base fact exists
```

### The metric is fine and a LABEL VALUE is gone

This is the case a name-matching tool gets wrong, and it is why labels are in
the model from the first line rather than added later. `http_requests_total` is
perfectly alive. The panel filters `{env="canary", status="5xx"}`, the canary
environment was decommissioned, and `env="canary"` no longer exists on any
series. `metric_ok` holds all the way down; `label_ok` does not:

```
                failed premise: matchers_ok[main](s_canary_err)
                  rule r50faab3f: matchers_ok[main](?S)@now :- matcher_count[repo](?S,?N)@now, ml_ok[main](?S,?N)@now
                    failed premise: ml_ok[main](s_canary_err,2)
                      rule r49dfc6b3: head does not unify
                      rule r9328ff57: ml_ok[main](?S,?N)@now :- matcher_at[repo](?S,?N,?K,?V)@now, selector_metric[repo](?S,?M)@now, label_ok[main](?M,?K,?V)@now, ?N1 is -(?N,1), ml_ok[main](?S,?N1)@now
                        failed premise: ml_ok[main](s_canary_err,1)
                          rule r49dfc6b3: head does not unify
                          rule r9328ff57: ml_ok[main](?S,?N)@now :- matcher_at[repo](?S,?N,?K,?V)@now, selector_metric[repo](?S,?M)@now, label_ok[main](?M,?K,?V)@now, ?N1 is -(?N,1), ml_ok[main](?S,?N1)@now
                            failed premise: label_ok[main]("http_requests_total","env","canary")
                              rule r2601336e: label_ok[main](?M,?K,?V)@now :- records[repo](?R,?M)@now, rule_ok[main](?R)@now, rule_label[repo](?R,?K,?V)@now
                                failed premise: records[repo](?R#10,"http_requests_total")
                                  no rule concludes 'records' and no matching base fact exists
                              rule r701b6967: label_ok[main](?M,?K,?V)@now :- series_label[store](?M,?K,?V)@now, not recorded_metric[main](?M)@now
                                failed premise: series_label[store]("http_requests_total","env","canary")
                                  no rule concludes 'series_label' and no matching base fact exists
```

### Four links up: a recording rule that stopped producing

The chain the tool exists for. Nobody deleted `job:checkout:conversion5m`. A
scrape target stopped writing `checkout_funnel_steps_total`; the recording rule
that reads it stopped producing; the metric it wrote aged out; a panel, a page
alert and an SLO went quiet. Each of those four links is a rule firing, and
`whynot` walks all of them:

```
                failed premise: metric_ok[main]("job:checkout:conversion5m")
                  rule r42f556b3: metric_ok[main](?M)@now :- records[repo](?R,?M)@now, rule_ok[main](?R)@now
                    failed premise: rule_ok[main](rr_checkout_conv)
                      rule r05a0ea8f: rule_ok[main](?R)@now :- recording_rule[repo](?R)@now, query[repo](?Q,?R)@now, query_ok[main](?Q)@now
                        failed premise: query_ok[main](q_rr_conv)
                          rule rb134e973: query_ok[main](?Q)@now :- selector_count[repo](?Q,?N)@now, sl_ok[main](?Q,?N)@now
                            failed premise: sl_ok[main](q_rr_conv,1)
                              rule r7092752b: head does not unify
                              rule r01d2e3fa: sl_ok[main](?Q,?N)@now :- selector_at[repo](?Q,?N,?S)@now, selector_ok[main](?S)@now, ?N1 is -(?N,1), sl_ok[main](?Q,?N1)@now
                                failed premise: selector_ok[main](s_rr_conv)
                                  rule r3468ba50: selector_ok[main](?S)@now :- selector_metric[repo](?S,?M)@now, metric_ok[main](?M)@now, matchers_ok[main](?S)@now
                                    failed premise: metric_ok[main]("checkout_funnel_steps_total")
                                      rule r42f556b3: metric_ok[main](?M)@now :- records[repo](?R,?M)@now, rule_ok[main](?R)@now
                                        failed premise: records[repo](?R#11,"checkout_funnel_steps_total")
                                          no rule concludes 'records' and no matching base fact exists
                                      rule r0a7b57d4: metric_ok[main](?M)@now :- series[store](?M)@now, not recorded_metric[main](?M)@now
                                        failed premise: series[store]("checkout_funnel_steps_total")
                                          no rule concludes 'series' and no matching base fact exists
                  rule r0a7b57d4: metric_ok[main](?M)@now :- series[store](?M)@now, not recorded_metric[main](?M)@now
                    failed premise: series[store]("job:checkout:conversion5m")
                      no rule concludes 'series' and no matching base fact exists
```

### It never resolved at all

A typo in a query, committed with the dashboard. The metric is in neither
snapshot, so it was never deleted — it was never there. A tool that only
compares "before" with "now" cannot tell those apart; this one can, and says so.

---

## 3. Blast radius: load-bearing against mention

`examples/oops` draws the distinction for citations — an argument that rests on
a retracted paper against one that names it in passing. Here it is the same
distinction and it is **computed rather than declared**: a consumer with a
second, resolving query that does not itself need the metric survives losing it.

```
A panel where the metric is the only source dies. A panel where it is one
line of six loses a line. examples/oops draws that distinction for citations;
here it is not declared in the data, it is computed.

$ drip blast kafka_consumer_lag
    goes dark : al_queue_backlog, p_kafka_lag
    degrades  : p_exec_health
    excise series[store]("kafka_consumer_lag") removed consumer_live: al_queue_backlog, p_kafka_lag
    ORACLE (derived vs re-evaluated): AGREE

$ drip blast db_connections_active
    goes dark : al_db_pool_exhaustion, p_capacity_headroom, p_db_conns, p_db_saturation
    degrades  : p_exec_health
    excise series[store]("db_connections_active") removed consumer_live: al_db_pool_exhaustion, p_capacity_headroom, p_db_conns, p_db_saturation
    ORACLE (derived vs re-evaluated): AGREE

$ drip blast http_requests_total
    goes dark : al_api_5xx, p_api_error_ratio, p_api_rps
    degrades  : p_exec_health
    excise series[store]("http_requests_total") removed consumer_live: al_api_5xx, p_api_error_ratio, p_api_rps
    ORACLE (derived vs re-evaluated): AGREE

$ drip blast queue_depth
    goes dark : p_load_index, p_queue_depth
    degrades  : -
    excise series[store]("queue_depth") removed consumer_live: p_load_index, p_queue_depth
    ORACLE (derived vs re-evaluated): AGREE

Two independent computations of the same set, 4 metrics: all AGREE.
The derived answer reads the rules; excise deletes the base fact and re-runs
the whole program. Neither knows about the other.

The metric already gone, both fates on one name — payment_gateway_errors_total:
    al_payment_gw_errors     DARK      (sole source)
    p_payment_gw_errors      DARK      (sole source)
    p_exec_health            DEGRADED  (1 of 6 lines; the other 5 still plot)
```

The `ORACLE` line is two independent computations of the same set. The derived
answer reads the rules (`goes_dark`); `excise` deletes the base fact
`series[store]("...")` and re-runs the whole program from scratch, and the diff
is the blast radius. Neither knows about the other.

**This is where the model was wrong, and the oracle is what caught it.** The
first version had a single `feeds` relation for both kinds of edge. It predicted
that deleting `queue_depth` would darken `p_capacity_headroom`, and it does not:
the only route between them runs through a rule that reads
`svc:capacity:headroom`'s *already-written samples*. That is a real lineage edge
— delete the metric and the history is gone — but not an availability edge, so
the rule keeps evaluating. Two out of four metrics disagreed. The fix was two
relations, not one:

```prolog
feeds_now(In, Out)  :- records[repo](R, Out), query[repo](Q, R), query_uses(Q, In).
feeds_past(In, Out) :- records[repo](R, Out), past_input[repo](R, In).
```

`needs` walks `feeds_now` and answers "what breaks it". `depends` walks both and
answers "where did this number come from". The dead-series audit wants the
second: a metric read only for its history is still read.

---

## 4. Counting is the fragility metric

```
independently resolving queries per consumer:

  al_canary_errors              0   DARK
  al_checkout_conv_drop         0   DARK
  al_payment_gw_errors          0   DARK
  p_canary_errors               0   DARK
  p_canary_latency              0   DARK
  p_checkout_conv               0   DARK
  p_checkout_funnel             0   DARK
  p_ingest_errors               0   DARK
  p_payment_gw_errors           0   DARK
  slo_checkout_availability     0   DARK
  al_api_5xx                    1   single point of failure
  al_db_pool_exhaustion         1   single point of failure
  al_queue_backlog              1   single point of failure
  p_api_error_ratio             1   single point of failure
  p_api_latency                 1   single point of failure
  p_api_rps                     1   single point of failure
  p_capacity_headroom           1   single point of failure
  p_checkout_orders             1   single point of failure
  p_db_conns                    1   single point of failure
  p_db_latency                  1   single point of failure
  p_db_saturation               1   single point of failure
  p_goroutines                  1   single point of failure
  p_ingest_rate                 1   single point of failure
  p_kafka_lag                   1   single point of failure
  p_latency_ewma                1   single point of failure
  p_load_index                  1   single point of failure
  p_memory                      1   single point of failure
  p_payment_attempts            1   single point of failure
  p_queue_depth                 1   single point of failure
  slo_api_latency               1   single point of failure
  p_exec_health                 5   survives losing one source

20 consumers have exactly one source. That is not a defect —
it is what "this panel is a single point of failure" looks like when it
is computed rather than felt. The SAME count means the opposite in other
domains (many routes to a privilege is sprawl, not robustness), so the
reading belongs to this example and is stated here on purpose.
(fold converged: true; 243 facts lie on a cycle of the support graph.)
```

`f_counting_reads_oppositely_by_domain` is the finding this obeys: the identical
count means **robustness** in NOPE and OOPS, **ambiguity** in AKA,
**launderability** in BLEEP. Here it means fragility, and saying so is part of
shipping the number.

The count is exact — one derivation per independently resolving query — and that
is a design decision in `drip.rofl` rather than luck. See "What fought back".

---

## 5. Simple paths, and the cycle that makes them necessary

The lineage graph is acyclic except where recording rules read each other's
output. Three edges make it cyclic here: `rr_latency_ewma` smooths its own
previous samples, and `rr_load_index` / `rr_capacity_headroom` read each other's.
All three are ordinary Prometheus, not pathology.

```
38 lineage pairs, identical Boolean answer both ways.
12 of them are reached through the three past-sample edges:

  METRIC                          REACHES                   SIMPLE  NAIVE
  db_connections_active           svc:capacity:headroom     1       infinitely many
  db_connections_active           svc:load:index            1       infinitely many
  http_request_duration_seconds   svc:latency:ewma          1       infinitely many
  job:db:saturation               svc:capacity:headroom     1       infinitely many
  job:db:saturation               svc:load:index            1       infinitely many
  queue_depth                     svc:capacity:headroom     1       infinitely many
  queue_depth                     svc:load:index            1       infinitely many
  svc:capacity:headroom           svc:capacity:headroom     1       infinitely many
  svc:capacity:headroom           svc:load:index            1       infinitely many
  svc:latency:ewma                svc:latency:ewma          1       infinitely many
  svc:load:index                  svc:capacity:headroom     1       infinitely many
  svc:load:index                  svc:load:index            1       infinitely many

rr_latency_ewma reads its own output; rr_load_index and rr_capacity_headroom
read each other's. Walking that graph, every trip round a cycle is another
derivation, so the count is INFINITE — the engine being honest about a
question nobody wanted asked. Carrying the visited chain inside the fact
makes a repeat impossible, and the count becomes the number of simple paths.
(38 paths in total; examples/nope does this with role chains.)
```

`examples/nope` solved exactly this for assume-role chains, and the technique is
its: **put the path inside the fact**.

```prolog
lineage(Top, Top, cons(Top, nil)) :- metric(Top).
lineage(Top, M, cons(M, P))       :- lineage(Top, X, P), feeds(M, X), absent(M, P).
```

`absent` is positive, not a negation — the chain domain is generated by
`chain_seen` from the chains already derived, so this is ordinary monotone
recursion over terms and the stratification checker never has to be argued with.
`depthBoundedCountingSemiring` would have answered a *different question*
(derivations of height at most N) and would have needed a depth nobody could
justify; this answers the question that was asked.

One thing worth stating because it is not obvious: `lineage` is rooted at a
**metric**, not at a query. The root is then recoverable from the path, so each
path has exactly one derivation. Rooting it at the query gives the same set of
paths and multiplies every count by the number of queries that happen to share
a root.

---

## 6. Dead series — the reverse query nobody runs

```
5 of 21 stored metrics influence nothing at all:

  cdn_cache_hits_total              scraped, read by nobody
  job:legacy:batch_rate             written by rr_legacy_batch, read by nobody
  legacy_batch_runs_total           scraped, read by nobody
  payments_gateway_errors_total     scraped, read by nobody
  tls_cert_expiry_seconds           scraped, read by nobody

and 1 recording rule computes one of them every interval: rr_legacy_batch.
Not "rarely queried" by request statistics: PROVABLY influencing nothing,
by either kind of edge. Somebody is paying to store and compute these.
```

Not "rarely queried" by request statistics — **provably influencing nothing**.
This is `examples/moot`'s dead-rule audit pointed at data instead of rules, and
it is the query most likely to pay for itself, because storage is billed
monthly.

Note `payments_gateway_errors_total` in that list: the metric that *appeared*.
Nobody has migrated a dashboard to the new name yet, so by the model's own
definition it is dead — which is exactly the evidence that raises the rename
hypothesis to its top tier.

---

## 7. Rename is a hypothesis, and it stays one

An old metric vanished and a new one appeared with the same shape. That is a
**guess**. It is offered as one:

```
between 2026-08-16 and 2026-08-30:
  vanished: checkout_funnel_steps_total, job:checkout:conversion5m, payment_gateway_errors_total
  appeared: payments_gateway_errors_total

payment_gateway_errors_total
  -> payments_gateway_errors_total     confidence 0.8600  (HYPOTHESIS, not a conclusion)
     shape_only           0.5500
     shape_and_job        0.7400
     shape_job_orphan     0.8600

the vanished metrics for which NO hypothesis is offered, and why not:
  checkout_funnel_steps_total       shape mismatch against payments_gateway_errors_total
  job:checkout:conversion5m         written by rr_checkout_conv; a rule stopped producing, not a rename
Rejecting a pairing matters as much as offering one: a tool that guesses
a rename for every deletion is a tool nobody reads twice.

Why it cannot quietly harden into a conclusion, from the kernel's own rule
dependency graph rather than from a promise in a comment:
  reach(consumer_dark,  renamed_to) -> empty
  reach(consumer_live,  renamed_to) -> empty
  reach(metric_ok,      renamed_to) -> empty
  reach(goes_dark,      renamed_to) -> empty
  reach(dead_series,    renamed_to) -> empty
```

Three tiers of evidence, each a separate derivation, and the Viterbi semiring
takes the **best** one rather than the product — confidence is the strongest
evidence available, not what is left after multiplying the weakest. The weights
ride on the *firing*, so the ledger never carries a number nobody measured.

The guarantee that it does not quietly harden into a conclusion is structural,
and it is checked against the kernel's own rule dependency graph rather than
against a promise in a comment. `reach(Rel, renamed_to)` is empty for every
relation the program concludes, and `test/example-drip.test.ts` deletes the
rename evidence outright and asserts that not one verdict moves.

Rejecting a pairing matters as much as offering one. `checkout_funnel_steps_total`
also vanished and has the same *type* as the metric that appeared; the label key
sets differ, so no hypothesis is offered for it at all.

---

## 8. What this does NOT answer

Stated in the tool's own output, not only here:

```
Structural causes only. The model covers:
  + label_value_absent
  + metric_absent
  + recording_rule_broken
  + recording_rule_deleted
A panel can be empty for reasons this program cannot see, and does not
claim to have ruled out:
  - collector_down
  - dashboard_time_range
  - retention_expired
  - scrape_permission_denied
  - service_not_writing

So "structurally fine" is the strongest verdict available here, and the
21 live consumers carry that verdict and no stronger one.

One more limit, measured rather than asserted: dead_series holds BECAUSE
nothing watches the metric, and finite failure carries no annotation, so
  provenance of dead_series("cdn_cache_hits_total") = series[store]("cdn_cache_hits_total")
names the presence, never the absence (f_provenance_is_blind_through_negation).
```

"Structurally fine" is the strongest verdict available, and the live consumers
carry that verdict and no stronger one. A tool that answered "the panel is fine"
would be lying about four causes it cannot see.

---

## 9. The oracle

An independent re-resolution of every consumer against the live series list, in
plain TypeScript, sharing only the base facts — it reads the EDB relations back
out of the store and never touches a derived one. It is a worklist and two
loops, written the way somebody would write it in an afternoon, because that is
what makes it a check rather than a second reading of the same program.

```
sample: 31 consumers x 21 live series = 651 consumer/series pairs;
        23 of those consumers are panels;
        45 selectors and 49 matchers re-resolved by hand;
        10 probes taken to attribute the dark ones.

engine dark set (10): al_canary_errors, al_checkout_conv_drop, al_payment_gw_errors, p_canary_errors, p_canary_latency, p_checkout_conv, p_checkout_funnel, p_ingest_errors, p_payment_gw_errors, slo_checkout_availability
oracle dark set (10): al_canary_errors, al_checkout_conv_drop, al_payment_gw_errors, p_canary_errors, p_canary_latency, p_checkout_conv, p_checkout_funnel, p_ingest_errors, p_payment_gw_errors, slo_checkout_availability
VERDICT: AGREE, consumer for consumer
and the ATTRIBUTION agrees for 10/10.
The one thing the oracle cannot say is "never existed": it never reads the
previous snapshot, so it stops at "absent" where the engine goes one step
further. That is a difference in what was asked, not in what was computed.

(world built in 6829 ms; 22423 ms total)
```

---

## The data

Synthetic, and it should be. Real dashboards from anyone's company are neither
needed nor suitable: the shapes that matter are structural, and a real export
would drown them in three hundred panels of noise while adding nothing to the
argument.

```
[repo]  10 dashboards, 23 panels, 6 alerts, 2 SLOs, 7 recording rules
        43 queries, 45 selectors, 49 label matchers
[store] 21 series at 2026-08-30, 23 at 2026-08-16, 41 label values
Both sides parse out of JSON. There is no model, no expert and no guess
anywhere in the extraction — which is what makes this example cheap.
```

Deliberately planted: one metric **deleted** (`checkout_funnel_steps_total`,
which also breaks a recording rule and therefore an SLO), one **renamed**
(`payment_gateway_errors_total` → `payments_gateway_errors_total`), one **label
value** gone (`env="canary"` on two metrics), one metric that **never existed**
(a typo committed with the dashboard), three **dead** scraped metrics and one
dead recorded one, and three past-sample edges that make the lineage graph
cyclic.

---

## What fought back

Three things, and all three changed the model rather than being worked around.

### Negation cannot express "all of them" here

"Every selector of this query resolves" and "every matcher of this selector
holds" are universals. The obvious form is a negation:

```prolog
query_broken(Q) :- sel_in(Q, S), not selector_ok(S).
query_ok(Q)     :- query[repo](Q, _), not query_broken(Q).
```

That program does not load. Recording rules make the consumer graph **recursive**
— `query_ok` → `metric_ok` → `rule_ok` → `query_ok` — so the negation sits
inside its own cycle and the stratification checker rejects it, correctly. The
universal has to be **positive**, and walking a list is how you write a positive
universal.

`examples/nope` walks a cons list. `drip.rofl` walks an **index**, which is the
same idea with one extra property, and that property turned out to matter:

```prolog
ml_ok(S, 0) :- selector_metric[repo](S, _).
ml_ok(S, N) :- matcher_at[repo](S, N, K, V), selector_metric[repo](S, M),
               label_ok(M, K, V), N1 is N - 1, ml_ok(S, N1).
```

### The counting semiring counts derivation TREES, and helper relations inflate them

The first version used cons lists, guarded by `mlist(L) :- selector_matchers(_, L)`
so the recursion would not generate every cell over every metric. But the term
`cons(kv("job","api"), nil)` is *shared* by thirteen selectors, so `mlist` had
thirteen derivations, and every count downstream multiplied by it. The fragility
of a one-source panel came out as **14**, and `p_capacity_headroom` — three
recording rules deep, squaring at each level — came out as **30,474,952,704**.

The Boolean answers were perfectly correct the whole time. This is the same
shape as `f_counting_breaks_under_ticks` and
`f_rename_leaks_into_the_firing_signature`: the verdict stays right while the
annotation describes a different world, which is exactly what makes it invisible
to behavioural tests.

An index has no shared sub-term, so every step is single-derivation and the
count is exact. `test/example-drip.test.ts` pins that as a property rather than
a number: every fact of `metric`, `sl_ok`, `ml_ok`, `matchers_ok`, `selector_ok`
and `query_ok` must have exactly one derivation, and the fragility of each
consumer must equal the number of its queries that resolve.

The general lesson is worth stating outside this example: **a counting fold is
only meaningful if every relation on the path to the counted one has a single
derivation.** Nothing in the semiring layer says so, and nothing warns you.

### Lineage and availability are not the same edge

Covered in section 3. The excise oracle disagreed on two metrics out of four,
and the disagreement was the model's, not the engine's. It is recorded here
rather than quietly fixed because the mistake is the natural one: "what does
this stand on" and "what breaks it" feel like one question and are two.

---

## Where the transcript is thinner than the claim

- **`@next` is not used at all.** The two snapshots are two ledgers of
  observation, not two ticks: nothing is being simulated forward, two dumps are
  being compared. That also sidesteps `f_counting_breaks_under_ticks` entirely,
  which is a reason to prefer the formulation and not only a convenience.
- **A recorded metric is answered for by its rule, not by the store.** A metric
  whose recording rule broke last week may still be in the store until retention
  expires; this model calls it gone the moment the rule breaks. Early rather than
  wrong, and it keeps one derivation per metric instead of two.
- **`whynot` prints a renaming artefact.** `records[repo](?R#10, ...)` — the
  clause-renaming counter leaks into the printed premise. Cosmetic here, and it
  is the display half of `f_rename_leaks_into_the_firing_signature`.
- **Provenance cannot see through the dead-series verdict.** `dead_series` holds
  *because* nothing watches the metric, finite failure carries no annotation, and
  so the provenance fold names the presence and never the absence. Printed in the
  demo's own output rather than left in a comment
  (`f_provenance_is_blind_through_negation`).

---

## The files

| file | what it is |
|---|---|
| `drip.rofl` | the two ledgers, the data and 76 rules (882 lines) |
| `demo.ts` | the transcript above, plus the oracle |
| `page.html` | the same argument at two levels, self-contained |
| `test/example-drip.test.ts` | 21 tests, 13.5 s of CPU (15 s wall on a quiet box) |

`npm test` runs the suite; `node --experimental-strip-types examples/drip/demo.ts`
runs the transcript.
