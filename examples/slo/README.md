# SLO — a page you can argue with

The pager went off at 3am for a four-minute blip that was over before anyone
woke up. Last week the pager did not go off for an outage that ate half the
month's error budget, because no single five-minute window looked bad enough.
You tuned the threshold and it got worse in the other direction.

The fix is old (the multi-window, multi-burn-rate alert in the Google SRE
workbook): page when the budget is burning too fast over a **long** window
(the trouble is real) **and** over a **short** one (it is still going on).
What is usually missing is the part after the page fires: *which requests*
burned the budget, and *would a looser SLO have paged at all?* Those are
questions about a derivation, and a rule engine can answer them.

Here the alert is seven rules (`slo.rofl`) over requests as facts. The windows,
the burn factors and the contracts are facts too, so a ticket tier is two more
rows and a new SLO is one.

## The shape

```
req(Id, Service, Minute, Weight)     a read weighs 1, a write 4
failed(Id)   lat(Id, Milliseconds)
slo(Service, Contract, PerMille)     failures allowed per thousand requests
burn_window(Tier, long|short, Minutes)    burn_factor(Tier, Factor)
```

The budget a service is held to is the strictest of its contracts, a `min`.
The load in a window is a `sum`, keyed by the request, so two requests of the
same weight are both counted and a write weighs four:

```
slo_budget(S, B) :- svc(S), B is min(P : slo(S, _, P)).
bad_w(S, Now, Len, B) :- eval_at(Now), svc(S), burn_window(_, _, Len), Lo is Now - Len,
                         B is sum(W ; R : req(R, S, T, W), failed(R), T > Lo, T <= Now).
```

There is no float and no division. A window is burning when
`bad * 1000 >= factor * budget * all`, in per-mille, by cross-multiplication.
The page is the conjunction, and the latency side is a `quantile`:

```
alert(Tier, S, Now) :- burning(Tier, long, S, Now), burning(Tier, short, S, Now).
p99(S, Now, P) :- ..., P is quantile(99, Ms ; R : req(R, S, T, _), lat(R, Ms), T > Lo, T <= Now).
```

## The data

132 requests, minutes 1 to 24 (the windows are scaled to this: page = 14x over
12 and 2 minutes, ticket = 2x over 24 and 6). Three services at the budget of
1%:

- `api` blips at minutes 9 to 12 (every request fails), is clean again, and goes down at 21.
- `pay` is down from minute 15.
- `search` has one failed request, in the last minute.

The two moments asked are 14 and 24. What it must say:

| service, minute | long window | short window | page |
|---|---|---|---|
| api, 14 | 20 of 60 = 33% | 0 of 10 | no, the blip is over |
| api, 24 | 24 of 60 = 40% | 10 of 10 | **page** |
| pay, 24 | 40 of 48 = 83% | 8 of 8 | **page** |
| search, 24 | 1 of 36 = 2.8% | 1 of 6 = 17% | no, one failed request is not an outage |

A single window would have paged api at 14 (the blip) and search at 24 (the
spike). `alarm`s in `examples/checks/agg-slo-demo-check.rofl` hold each row,
the sums against numbers a script computed from the timeline, the p99s by
nearest rank, and the two "burns in one window, no page" cases by name.

## Why did it page

```
rofl-load --why-all "bad_w(api,24,12,24)" boot.rofl examples/slo/slo.rofl examples/slo/slo-requests.rofl
```
```
bad_w[main](api,24,12,24)  <= rce851e17 @tick 0
  sum(?W ; ?R : req[main](?R,api,?T,?W), failed[main](?R), ?T > 12, ?T <= 24) = 24 [aggregate: 9 members, sealed req@0, failed@0]
    #1 (1,a21a) h=1
    #2 (1,a22a) h=1
    #3 (1,a23a) h=1
    #4 (1,a24a) h=1
    #5 (4,a18b) h=1
    #6 (4,a21b) h=1
    #7 (4,a22b) h=1
    #8 (4,a23b) h=1
    #9 (4,a24b) h=1
```

(The lines under each member, the `req` and `failed` facts it stands on, are
left out here.) These are the nine requests that make 24: a stray failed write
at 18 and the outage from 21. Nothing from the blip at 9 to 12 is in it.
`--why "alert(page,api,24)"` prints the whole tree above it: both windows, the
factor, the budget and the contract it came from.

## Would a looser SLO still page

The `slo` rows are facts, so the question is `excise`. Take the gold contract
away from api, which leaves the 5% base contract, and ask what changes:

```
rofl-load --excise "slo(api,gold,10)" boot.rofl examples/slo/slo.rofl examples/slo/slo-requests.rofl
```
```
- alert[main](page,api,24)
- burning[main](page,long,api,14)
- burning[main](page,long,api,24)
- slo[main](api,gold,10)
- slo_budget[main](api,10)
+ slo_budget[main](api,50)
```

The page goes. At 5% a page needs 70% of the long window failing and api had
40%; the ticket (2x) is untouched, which is why nothing about it is listed.
The same for pay:

```
rofl-load --excise "slo(pay,gold,10)" boot.rofl examples/slo/slo.rofl examples/slo/slo-requests.rofl
```
```
- slo[main](pay,gold,10)
- slo_budget[main](pay,10)
+ slo_budget[main](pay,50)
```

The budget moved and no alert did: pay was at 83%, it pages under either SLO.
The decision "can we relax api to 95%" is now read off the diff, with the
minutes it would have cost you, and the world holds the same answer by hand
(`slc_loose_*`), so an engine that excised wrongly, or a `min` that kept the
wrong contract, turns an alarm red.

## What the engine is made to get right

- the sum keyed by the request: a write of 4 and four reads of 1 are different
  loads, and two requests of the same weight are two (`sum_by_value` breaks it);
- a window edge is exact: `T > Lo, T <= Now`, a request at the edge is in one
  window and not the next;
- the p99 is nearest rank (`quantile_floor` breaks it, and an outlier decides the
  p99 of 36 requests by design);
- an empty window is a `0` sum, so a service with no traffic is not burning
  (`A > 0` is there for the 0 = 0 case).

Run it: `npm test -- --world agg_slo_demo`. The ledger cells are `sum` and
`holistic` of `demo` (`facts/agg.rofl`, `w_agg_demo_slo`).
