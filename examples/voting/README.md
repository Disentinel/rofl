# VOTING — who could have changed it

Twenty-one people vote for a name for the new service. Eight pick `a`, seven
`b`, six `c`, and `a` wins. Then somebody notices that `c` is the second choice
of nearly everybody, that all twenty-one rank `a` below `c`, and
that one voter, v17, stayed home for the first draft. Was the result an
accident of who showed up?

That is the thing a plain `GROUP BY` cannot say. Counting one way is easy;
counting three ways and asking which ballots each answer hangs on is what
this world does, over one fact per ballot:

```
ballot(Election, Voter, First, Second, Third, Fourth).
```

## The data

Election `e1`: three blocs over candidates `a b c d`. Eight voters (v10 to v17)
rank `a c b d`, seven (v1 to v7) rank `b c a d`, six (v8, v9, v18 to v21) rank
`c b a d`. Nobody puts `d` first. Election `e2` is the Condorcet cycle, three
voters, `a b c`, `b c a`, `c a b`, with `d` last on each.

## Three ways to count

```
votes(E, C, N)   :- election(E), cand(C), N is count(V : rank(E, V, C, 1)).
points(E, C, S)  :- election(E), cand(C), ncand(K), S is sum(P ; V : rank(E, V, C, R), P is K - R).
pair(E, X, Y, N) :- election(E), cand(X), cand(Y), X != Y, N is count(V : prefers(E, V, X, Y)).
```

- **Plurality** counts first places. `d` has none, and reads `votes(e1, d, 0)`:
  the candidate is bound from outside the count, so an empty group is a row at
  zero, not a row that is missing and not a candidate that quietly drops out.
- **Borda** gives a place the number of candidates below it. The sum is keyed by
  the voter, `sum(P ; V : ...)`: twenty-one voters giving `d` zero are
  twenty-one members, and eight voters giving `a` 3 points are 24, not 3.
- **Condorcet** counts every pair of candidates and takes the one nobody beats.

A tie is not a pick. The winners are every candidate that holds the best count,
so a tie is several rows, and `e2` shows it:

| | e1 | e2 |
|---|---|---|
| plurality | a (8, 7, 6, 0) | a, b, c (1, 1, 1, 0) |
| Borda | c (37, 41, 48, 0) | a, b, c (6, 6, 6, 0) |
| Condorcet | c | nobody: a cycle |

The three methods disagree on `e1`: plurality crowns the candidate that
every voter ranks below `c`.

## Who could have moved it

`pivotal(E, V)` recounts the plurality with one voter's first place left out,
for every voter, and compares the set of winners. In `e1` the eight `a` voters
are pivotal and nobody else is: one fewer `a` makes it 7 to 7, a tie of
`{a, b}`; one fewer `b` or `c` leaves `a` winning.

The same question can be put to the engine as it stands, without a rule for it:
`excise` takes one ballot out of the world and prints what changed.

```
rofl-load --excise "ballot(e1,v17,a,c,b,d)" boot.rofl examples/voting/voting.rofl examples/voting/voting-ballots.rofl
```
```
- ballot[main](e1,v17,a,c,b,d)
- best[main](e1,8)
- votes[main](e1,a,8)
+ best[main](e1,7)
+ plurality[main](e1,b)
+ votes[main](e1,a,7)
```

(Filtered to the ballot and the plurality rows; `plurality(e1,a)` is not on the
list: `a` is still a winner, now beside `b`.) Without v17 the winner is the
set `{a, b}`. The Borda and Condorcet winners do not move: no `borda` or
`condorcet` row is on the list, though Borda's points do, 37 41 48 becoming
34 40 46. A bloc `b` voter, v1, moves nothing but its own count:

```
rofl-load --excise "ballot(e1,v1,b,c,a,d)" ...
- ballot[main](e1,v1,b,c,a,d)
- votes[main](e1,b,7)
+ votes[main](e1,b,6)
```

The pivotal set the rule computes and the excise the engine does agree on
v17 and v1, and the same is asserted for the whole electorate by the proof
world below (`vc_pivotal`).

## Why `a` won

`rofl-load --why "plurality(e1,a)" ...` shows the winner, its count, and the
members of the count, each with the ballot it came from:

```
plurality[main](e1,a)  <= rf4120aab @tick 0
  votes[main](e1,a,8)  <= r1679e53b @tick 0
    election[main](e1) [axiom]
    cand[main](a) [axiom]
    count(?V : rank[main](e1,?V,a,1)) = 8 [aggregate: 8 members, sealed rank@1]
      #1 (v10) h=2
        rank[main](e1,v10,a,1)  <= r1304dff4 @tick 0
          ballot[main](e1,v10,a,c,b,d) [axiom]
      #2 (v11) h=2
      ...
```

(`--why-all` prints all eight.)

## What the engine is made to get right

The proof world is `agg_voting_demo`, over the rules, the ballots and
`examples/checks/agg-voting-demo-check.rofl`. Its alarms hold the counts, the
points, all twelve pair counts for each election, the winners and the pivotal
voters against an oracle written by a script from the ballots and not by these
rules. They go red if an empty group is not zero, if a sum collapses equal
points, if a tie loses a member, or if a `why` leaves out a voter.

Run it: `npm test -- --world agg_voting_demo`. The ledger cell is `empty_group`
of `demo`, item `w_agg_demo_voting`.
