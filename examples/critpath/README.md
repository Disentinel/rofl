# CRITICAL PATH — which chain is the long one

The release is slipping and somebody asks the question every project manager
and every security team asks in different words: which chain of things
decides the date? In a plan it is the longest path through the tasks that wait
for each other. In a network it is the cheapest run of exploits from the door
to the crown jewel. Both are one shape, a best value over paths, and in SQL
both are a recursive query that either lists every path or loops: put one
cycle in the graph (the web tier calls the API, the API calls the web tier)
and "all paths" has no last row.

What you want is one number per node and, when you ask, the chain that made it.
That is what an order lattice is:

```
lattice finish(T, max F).
finish(T, D) :- task(T, D).
finish(T, F) :- dep(T, P), finish(P, FP), task(T, D), F is FP + D.
```

`finish` keeps one row per task, the greatest. A longer path replaces the row,
a shorter one is dropped on arrival, and a task's finish is the best
contribution over everything it waits for. The rules are the plain recursion
you would write first; the declaration is what makes it terminate and what makes
`why` print the winner.

## The plan

Eleven tasks, durations in days (`examples/critpath/critpath-plan.rofl`): spec 3;
design 4 after spec; schema 2 after design; api 6 after schema and design;
ui 8 after design; auth 4 after spec; integ 3 after api, ui and auth; docs 2
after api; tests 4 and perf 3 after integ; release 1 after tests, perf and docs.

```
rofl load --why "finish(release,23)" boot.rofl examples/critpath/critpath.rofl examples/critpath/critpath-plan.rofl
```
```
finish[main](release,23) [lattice max: 1 member]
  #1 h=6 <= r7ba6bd15 @tick 0
    dep[main](release,tests) [axiom]
    finish[main](tests,22) [lattice max: 1 member]
      #1 h=5 <= r7ba6bd15 @tick 0
        dep[main](tests,integ) [axiom]
        finish[main](integ,18) [lattice max: 2 members]
          #1 h=4 <= r7ba6bd15 @tick 0
            dep[main](integ,ui) [axiom]
            finish[main](ui,15) [lattice max: 1 member]
            ...
```

The release is 23 days out and the path is the proof tree: release after tests,
tests after integ, and integ is `[lattice max: 2 members]`. Two members means
two ways to reach 18: ui finishes at 15 (design 7 + 8) and so does api (schema
9 + 6). The plan has two critical paths and a plain "the critical path" would
have hidden one of them. `--why-all` on the tie names both:

```
rofl load --why-all "finish(integ,18)" boot.rofl examples/critpath/critpath.rofl examples/critpath/critpath-plan.rofl
```
```
finish[main](integ,18) [lattice max: 2 members]
  #1 h=4 <= r7ba6bd15 @tick 0
    dep[main](integ,ui) [axiom]
    finish[main](ui,15) ...           (ui, design, spec)
  #2 h=5 <= r7ba6bd15 @tick 0
    dep[main](integ,api) [axiom]
    finish[main](api,15) ...          (api, schema, design, spec)
```

(Abbreviated, the dots are mine; `why-all` expands every member of the cell it is asked about, and
the cells below it show their canonical member, so ask at the tie.)

## Slack, and the way back

The longest path is half the answer: what is not on it can slip, and by how
much? A second lattice runs backwards from the end of the plan, `latest(T, min L)`:
the latest a task may finish without moving the release. Its first rule gives
every task the whole plan length as an upper bound, its second takes the
successor's latest minus the successor's duration, and the minimum is the
tightest successor. A critical task is one whose two numbers are equal:

```
slack(T, S)  :- finish(T, F), latest(T, L), S is L - F.
critical(T)  :- slack(T, 0).
```

| task | finish | slack |
|---|---|---|
| spec, design, schema, api, ui, integ, tests, release | 3, 7, 9, 15, 15, 18, 22, 23 | 0 |
| perf | 21 | 1 |
| docs | 17 | 5 |
| auth | 7 | 8 |

The plan's `length` is read from the closed `finish` with a plain `max`, and
`latest` reads it from outside its own recursion, which is allowed: a rule reads
a lattice from outside once the lattice is closed.

## The same shape on a network, with cycles

`examples/critpath/taint.rofl`, over `taint-hosts.rofl`: nine hosts, an attacker
cost on every hop, and two places to start, the open internet and a contractor with
a VPN account. The graph has three cycles: web and api, ci and phish, and the
triangle db, backup, admin.

```
lattice exploit(S, N, min C).
exploit(S, S, 0) :- source(S).
exploit(S, N, C) :- exploit(S, M, C0), edge(M, N, W), C is C0 + W.
```

The same two rules without the declaration are a plain reachability that carries
the cost, and on this network they have no last answer. Run with a budget of
20 000 steps they hold 13 111 `reach` rows and a `budget_exhausted` hole; the
lattice settles with 18, one per source and host. The cheapest chain from the
internet to the database:

```
rofl load --why "exploit(internet,db,12)" boot.rofl examples/critpath/taint.rofl examples/critpath/taint-hosts.rofl
```
```
exploit[main](internet,db,12) [lattice min: 1 member]
  #1 h=5 <= ra027dad5 @tick 0
    exploit[main](internet,admin,11) ...
      exploit[main](internet,ci,9) ...
        exploit[main](internet,phish,3) ...
          exploit[main](internet,internet,0) ...
          edge[main](internet,phish,3) [axiom]
        edge[main](phish,ci,6) [axiom]
      edge[main](ci,admin,2) [axiom]
    edge[main](admin,db,1) [axiom]
```

Phish, then CI, then the admin console, then the database: 3 + 6 + 2 + 1. It
never goes round a cycle (a lap costs), and not through the web tier, which is
5 and then 2 and then 6 for 13. The contractor's best chain to the same
database is 6. The exposure rule reads the closed lattice and asks the budget:

```
exposed(S, N, C) :- exploit(S, N, C), crown(N), budget(B), C <= B.
```

With a budget of 12 the internet reaches admin (11) and the database (12), the
contractor all three jewels.

## When someone says "surely 9 is possible"

`whynot` of a better value does not say no. It says what the cell holds and
every road that reaches it:

```
rofl load --whynot "exploit(internet,db,9)" boot.rofl examples/critpath/taint.rofl examples/critpath/taint-hosts.rofl
```
```
whynot exploit[main](internet,db,9):
  exploit[main](internet,db) is a lattice cell (min) holding 12 [lattice]
  9 would improve it, and no contribution reaches 9: 2 contributions, the best 12
    12 <= ra027dad5: exploit[main](internet,admin,11), edge[main](admin,db,1), 12 is +(11,1)
    13 <= ra027dad5: exploit[main](internet,api,7), edge[main](api,db,6), 13 is +(7,6)
```

The answer to "can the date be 20" is the same sentence the other way round:
`finish(release)` is a lattice cell (max) holding 23, 20 is not its value, and
the roads are 23 through tests, 22 through perf, 18 through docs.

## What the engine is made to get right

The proof world is `agg_critpath_demo`, over both programs, both data files and
`examples/checks/agg-critpath-demo-check.rofl`. Its alarms hold every finish, the
length, every slack, the critical set, all 18 costs and the five exposures
against an oracle computed from the two data files by a script (a memoised
longest path, a backward pass, Dijkstra), not by these rules; they hold that
there is one row per cell however many laps reached it, that `why` names the
edges of both critical chains and of the cheapest exploit and none of the
others, and that `whynot` says what the cell holds. They go red if a lattice
keeps the worse value, if a superseded value stays an answer, if a hole is
read as a value, or if `why` leaves out a member.

Run it: `npm test -- --world agg_critpath_demo`. The ledger cell is
`order_lattice` of `demo`, item `w_agg_demo_critical_path`.

## One limit

A cycle in the *plan* (b waits for c waits for b) is not a critical path, it is
a mistake, and a `max` over a positive cycle has no answer: every lap is longer.
The lattice does not hide it. Loaded with `b` and `c` waiting for each other,
the run ends at the budget and holds

```
hole[$kernel]($lattice(finish,main,0,$cons(b,$nil)),improving_cycle)
hole[$kernel]($lattice(finish,main,0,$cons(c,$nil)),improving_cycle)
```

while `finish(a, 1)`, which is upstream of the cycle, is still a row. The
engine names the cells that never settled and says why. A reachability rule on
`dep` (`cyc(T) :- dep(T, P), reaches(P, T)`) finds the offending tasks before
the date is read.
