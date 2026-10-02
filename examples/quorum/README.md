# QUORUM — how many agree, and who they are

Three things that are the same question and never look it. A news desk will not
run a claim until two independent sources carry it. A proof checker accepts a
step when every premise it needs is established. A replicated log calls an entry
committed when most of the cluster holds it. In each, "enough of them hold" is
the whole rule, and in each the usual way to write it is wrong in a way that
only shows in the field: two accounts of one forum counted as two voices, a
count that must be stored beside the premises it counts, a commit index the
leader reports and nobody checks.

`at_least(N, X : body)` is that rule. It holds when N distinct values of X
satisfy the body, and it is monotone: more facts never take a quorum away. So,
unlike a count, it may stand in the middle of its own recursion, and what is
counted is the projection, not the rows.

## 1. Belief, with independent witnesses

Two believed nodes from two different origins back a claim, and a believed
claim backs the next one (`examples/quorum/quorum.rofl`):

```
believed(X) :- vetted(X).
believed(X) :- claim(X), at_least(2, O : backs(S, X), believed(S), speaks_for(S, O)).
```

The projection is the origin `O`. The wire and the broadcaster are two; two
accounts of one forum are one, whatever they say. The data
(`quorum-data.rofl`) has eight claims:

| claim | backed by | origins | believed |
|---|---|---|---|
| c1 | the wire, the broadcaster | wire, bbc | yes |
| c2 | two forum accounts | forum | no |
| c3 | c1 and the wire | desk a, wire | yes |
| c4 | two forum accounts and the wire | forum, wire | yes |
| c5 | c3 and c4 | desk b, desk c | yes |
| c6 | c3 and c2 | desk b, and c2 is not believed | no |
| m1, m2 | each other, m1 and the wire, m2 and the broadcaster | one founded origin each | no |

The last row is the one a rule that counts cannot get right. `m1` and `m2`
hold each other up, and each has a founded backer. Counted together they are
two backers each and a belief, and each would hold the other up forever. The
quorum is read as a least fixpoint: a belief founds only on beliefs already
founded, so the circle believes nothing, and `whynot` says how far it got:

```
rofl-load --whynot "believed(m1)" boot.rofl examples/quorum/quorum.rofl examples/quorum/quorum-data.rofl
```
```
failed premise: at_least(2, ?O#0 : backs[main](?S#0,m1), believed[main](?S#0), speaks_for[main](?S#0,?O#0)) reached 1 of 2 [threshold]: #1 (wire) h=2
```

And `why` prints the quorum itself, the origins that were counted and the node
that voiced each, down to the vetted ones:

```
believed[main](c3)  <= r8cf15576 @tick 0
  claim[main](c3) [axiom]
  at_least(2, ?O : backs[main](?S,c3), believed[main](?S), speaks_for[main](?S,?O)) [quorum: the first 2 members]
    #1 (wire) h=2
      backs[main](w1,c3) [axiom]
      believed[main](w1)  <= r661c18ee @tick 0
      ...
    #2 (desk_a) h=4
      backs[main](c1,c3) [axiom]
      believed[main](c1)  <= r8cf15576 @tick 0
        ... the quorum of c1, the broadcaster and the wire
```

A quorum is a lower bound, so the proof is its first N members in a fixed order,
not every one; `c4` has three backers and its quorum is the wire and the first
forum account.

## 2. A proof by quorum, and the index walk it replaces

`examples/moot` and `examples/goof` need "every premise of this step holds", and
a universal over an open set written as `not` puts the rule in a negative cycle
with itself. They walk the premises by index instead: each premise is at a
place, the step says how many it has, and `ok_from(C, K)` means premises K to
the last all hold (`req_at`, `req_count` in moot, `needs` and `need_count` in
goof). The rule is the same two lines everywhere, and the data carries a
count that must be kept equal to the premises it counts. The same step with a
quorum as large as its premises:

```
needs(S, Q)    :- needs_at(S, _, Q).
premises(S, N) :- step(S, _), N is count(Q : needs(S, Q)).
proved(P) :- axiom(P).
proved(P) :- step(S, P), premises(S, N), at_least(N, Q : needs(S, Q), proved(Q)).
```

No place, no stored count: the number of premises is counted, and the step is
proved when that many of them are. (`needs_at` keeps its places here only so that
the walk can run beside it on the same facts; a world that never had them writes
`needs(S, Q)` as data.) The walk of those two examples is in the file too,
unchanged in shape:

```
walk(S, K1) :- need_count(S, N), K1 is N + 1.
walk(S, K)  :- needs_at(S, K, Q), walked(Q), K1 is K + 1, walk(S, K1).
walked(P)   :- axiom(P).
walked(P)   :- step(S, P), walk(S, 1).
```

On seven steps, one that needs nothing, one resting on a premise nobody
establishes and one resting on that one, the two prove the same propositions,
and the stated `need_count` equals the counted `premises` (a step that needs
nothing is a quorum of 0). An alarm holds both. This is the evidence that the
index walk is expressible; moot and goof were rewritten that way by `w_agg_retire_workarounds`, and each now states a theorem or a flag as one `at_least` over its counted premises.

## 3. Raft: a commit that the logs do not support

An entry is committed when a majority of the cluster holds it, with the one
subtlety of the Raft paper (section 5.4.2): a leader counts replicas only for an
entry of its own term, and an entry of an older term commits only when a later
entry of the current term does. The majority is half the cluster plus one,
counted below it:

```
size(C, N)        :- cluster(C), N is count(S : member(C, S)).
majority(C, Q)    :- size(C, N), Q is N / 2 + 1.
holds(C, S, I)    :- match(C, S, M), entry(C, I, _), I <= M.
on_majority(C, I) :- entry(C, I, _), majority(C, Q), at_least(Q, S : holds(C, S, I)).
counted(C, I)     :- entry(C, I, T), term(C, T), on_majority(C, I).
committed(C, I)   :- counted(C, J), entry(C, I, _), I <= J.
```

`prod` is five servers in term 3 and a log of seven entries held by seven, seven,
five, four and none. Entry 5, of term 3, is on three servers and is counted;
6 and 7 are on two. Committed are entries 1 to 5, and the leader reports 5.

The property that must never fail is the other half, and it is the one the
rules exist to state. A leader reports a commit index; the logs either support it
or they do not:

```
unsafe_commit(C, J, no_majority) :- reported(C, J), not on_majority(C, J).
unsafe_commit(C, J, old_term)    :- reported(C, J), on_majority(C, J), not committed(C, J).
```

In a running system that is one line, `alarm(unsafe_commit).`, and the cluster
stays green by never needing it. A rule that has never fired is a rule nobody
has seen work, so the data holds two **drills**, logs corrupted on purpose:

- `lag`: three servers, the leader reports entry 3 and only the leader holds it.
  `why` shows the reason in one line: `reached 1 of 2 [threshold]: #1 (a1)`.
- `old`: five servers in term 4, the leader reports entry 2, of term 2, held by
  three of the five (a majority, so a count of replicas would pass it) while the
  only entry of term 4 is on one server. Nothing is counted, so nothing is
  committed, and the alarm is `old_term`: the entry can still be overwritten.

```
rofl-load --why "unsafe_commit(old,2,old_term)" boot.rofl examples/quorum/quorum.rofl examples/quorum/quorum-data.rofl
```
```
unsafe_commit[main](old,2,old_term)  <= r0dd62093 @tick 0
  reported[main](old,2) [axiom]
  on_majority[main](old,2)  <= rbecfe752 @tick 0
    ... at_least(3, ?S : holds[main](old,?S,2)) [quorum: the first 3 members]  (o1, o2, o3)
  not committed[main](old,2) [finite failure]
    whynot committed[main](old,2):
      rule r0b59461f: committed[main](?C,?I)@now :- counted[main](?C,?J)@now, entry[main](?C,?I,?_$0)@now, ?I <= ?J
        failed premise: counted[main](old,?J#0)
```

The proof world holds the alarm to the drills: it is red if `unsafe_commit` holds
for any cluster that was not corrupted, and red if either drill is quiet.

## The same three, in sentences

`examples/quorum/quorum-says.rofl.md` states them the way the question is asked
and the reader lowers them to the same rules:

```
A node X is credited either:
1. if X is vetted;
2. if X is a claim and at least 2 of O such that (S backs X and S is credited and S speaks for O).

A step S has N premises if S concludes some proposition and exactly N of Q such that (S requires Q).

A proposition P is established either:
1. if P is an axiom;
2. if S concludes P, S has N premises and at least N of Q such that (S requires Q and Q is established).

An entry I of a cluster C is on a majority if C has the entry I from some term, C needs Q servers and at least Q of S such that (S holds the entry I of C).
```

`exactly N of Q such that (...)` with N in the conclusion is the count (0 for a
step with none), `at least N of Q such that (...)` is `at_least`, and recursion
through either is allowed or refused as in rules: `at least` is, `at most` and
`exactly` are not. The proof world loads the sentences beside the rules and
holds each answer of the one to the other.

## What the engine is made to get right

The proof world is `agg_quorum_demo`, over the rules, the data, the sentences and
`examples/checks/agg-quorum-demo-check.rofl`. Its oracle is a script that shares
nothing with the rules: a fixpoint over sets of origins, a fixpoint over premise
sets, a replica count per entry. The alarms hold the beliefs, the proofs, the
walk, the counted entries, the committed ones, the unsafe reports and their kind
against it, the rules against the sentences, and the drills to their alarm, and
that `why` and `whynot` name the origins and the servers a quorum was counted
over. They go red if a quorum is one short, if a recursive quorum does not fire
on a belief that arrives late, if a step with no premises is not proved, or if
`why` names the wrong members.

Run it: `npm test -- --world agg_quorum_demo`. The ledger cells are `threshold`
and `sugar` of `demo`, item `w_agg_demo_quorum`.
