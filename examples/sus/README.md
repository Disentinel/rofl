# SUS — suspicion under semirings

Eight players. Two of them are traitors. Everybody says things, and **some of
them are lying**.

This is the domain where a perspective is not a technical detail. In the other
examples in this directory a perspective is "different sources, different
opinions" — a way of keeping two readings apart. Here it *is* the subject:

- every player has their own, necessarily incomplete, set of observations;
- players make **claims**, not reports of fact, and a claim may be false by
  construction — that is what a traitor is for;
- two contradicting claims coexist **legally**, and the contradiction is the
  main signal rather than a data error to be resolved.

The kernel already models exactly this. Two contradicting assertions coexist
when their perspectives differ; who wrote a fact is the load identity checked
against `authority`, so an entry in somebody else's book surfaces as
`forged[audit]` with no enforcement code. The domain is not *illustrated by*
the perspective model — it is an instance of it, and the file says so in one
line each:

```prolog
said[pink](k5,  saw(green, electrical), 2, 2).   -- pink's book
said[green](k7, saw(green, cafeteria),  2, 2).   -- green's book
```

Both hold. Both are facts. Nothing was ranked, resolved or dropped. What the
engine derives from the pair is the finding:

```prolog
clash[case](k5, k7)  ->  at most one of pink and green is crew
```

## How to run

```sh
node --experimental-strip-types examples/sus/demo.ts       # the transcript below
node --experimental-strip-types --test test/example-sus.test.ts
```

The REPL loads a file under one identity, so it cannot reproduce the per-player
`authority` split; `demo.ts` splits `sus.rofl` on its `-- @who X` markers and
loads each player's entries under that player's name. That is the whole forgery
story: **who wrote a claim is not a column**.

## What it shows

| the spec asks for | where |
|---|---|
| claims as edges with `asserted_by`; false claims legal by the model | `sus.rofl` §2, transcript §3 |
| contradictions coexist and do not break the computation | transcript §3 |
| model counting over consistent worlds; the share of guilt as the metric | §4, §5 |
| rounds as ticks; the knowledge state at an arbitrary round | §9 |
| transitive marking of conclusions that rested on a withdrawn claim | §5 |
| `whynot` naming the claims you would have to declare false | §6 |
| most likely configuration under weights on claimants' reliability | §8 |

## The model in one page

A **world** is an assignment of the two traitor roles. C(8,2) = 28 of them,
generated rather than listed:

```prolog
world[worlds](w(A, B))         :- player[public](A, I), player[public](B, J), I < J.
traitor_in[worlds](w(A, B), A) :- world[worlds](w(A, B)).
crew_in[worlds](W, P)          :- world[worlds](W), player[public](P, _),
                                  not traitor_in[worlds](W, P).
```

One bridging assumption carries the whole model: **crew never lie, traitors
may**. Every consistency rule is a consequence of it, and each names the reason
it refuses a world, so a refutation is attributable rather than a bare Boolean:

```prolog
refuted_by[worlds](W, K) :- charge[case](K, P, Q, _), live[case](K),
                            crew_in[worlds](W, P), crew_in[worlds](W, Q).

refuted_by[worlds](W, clash(K1, K2)) :- conflict[case](K1, K2),
                                        claimant[case](K1, P1), claimant[case](K2, P2),
                                        crew_in[worlds](W, P1), crew_in[worlds](W, P2).

impossible[worlds](W)   :- refuted_by[worlds](W, _).
consistent[worlds](W)   :- world[worlds](W), not impossible[worlds](W).
guilty_in[worlds](P, W) :- consistent[worlds](W), traitor_in[worlds](W, P).
```

Four kinds of claim, and **one of them is deliberately worthless**:

| content | if the claimant is crew | |
|---|---|---|
| `saw(Q, Room)` | Q was in Room. | Bites only by contradicting another sighting. |
| `vouch(Q)` | Q completed a visual task, so Q is crew. | |
| `accuse(Q)` | Q killed or vented, so Q is a traitor. | |
| `alone` | I was doing tasks by myself. | **Nothing consumes it.** |

`alone` is the unfalsifiable claim every real table is full of. No rule reads
it, so it refutes no world, appears in no explanation, and excising it changes
nothing that matters — which the test asserts rather than asserting in prose.

## Counting is the metric, not a side mode

The share of consistent worlds in which a player is a traitor **is** model
counting, and it is the mathematically correct formalisation of what people at
the table do by eye. It is not computed by enumeration in TypeScript. It comes
out of one fold of `countingSemiring` over the support the Boolean engine
already recorded:

```prolog
outcome[case](guilty, P) :- guilty_in[worlds](P, W).   -- one derivation per guilty world
outcome[case](any, P)    :- consistent[worlds](W), player[public](P, _).
```

```
  round 3, every player, guilty worlds / consistent worlds:
    green   5/5  ####################  100%
    blue    1/5  ####................   20%
    pink    1/5  ####................   20%
    cyan    1/5  ####................   20%
    lime    1/5  ####................   20%
    black   1/5  ####................   20%
    red     0/5  ....................    0%
    white   0/5  ....................    0%
```

**The oracle.** 28 worlds x 6 rounds is 168 decisions, so exhaustive
enumeration is a *complete* oracle. Every world at every round is decided a
second time by a direct evaluation of the claim set in plain TypeScript — no
engine, no rules, no shared code beyond reading the same base facts — and
compared on the verdict *and* on the counting semiring's numbers:

```
    verdict disagreements:     0
    guilty-count disagreements: 0
    consistent worlds by round: r1=22  r2=9  r3=5  r4=5  r5=2  r6=1
```

## The demo: accuse in round 3, withdraw in round 5

The standard of proof is a **policy**, not a measurement, so it lives in
`demo.ts` and not in the rules: three consistent worlds in four.

```
   rd  worlds  green   share   verdict          what changed
    1      22      6     27%  no accusation    k1 k2 k3 k4 said
    2       9      5     56%  no accusation    k5 k7 k8 said; white killed
    3       5      5    100%  ACCUSE green     k6 k9 k10 k11 k12 said
    4       5      4     80%  ACCUSE green     k13 said; k10 withdrawn; black killed
    5       2      1     50%  no accusation    k5 unmasked; k9 unmasked; pink exposed traitor
    6       1      0      0%  no accusation    k14 k15 k16 said
```

Round 3 is the engine at its most confident and most wrong: green is a traitor
in **every** consistent world, and green is innocent. The model never pretended
otherwise — `w(pink,cyan)`, the true world, was ruled out by a mistaken
sighting, and the moment that sighting is withdrawn it comes back.

### Which link broke

The accusation of green is not one conclusion. It is three, one per accuser,
kept apart precisely so the engine can say which one failed:

```
  round 4:
    AT RISK  case_against(green,red)    every support gone: k10 (withdrawn)
    SHAKEN   ejection(green)            gone: k10   still standing: k5, k6, k9
    SHAKEN   finding(green)             gone: k10   still standing: k5, k6, k9

  round 5:
    AT RISK  case_against(green,pink)   every support gone: k5 (unmasked), k9 (unmasked)
    AT RISK  case_against(green,red)    every support gone: k10 (withdrawn)
    SHAKEN   ejection(green)            gone: k10, k5, k9   still standing: k6
    SHAKEN   finding(green)             gone: k10, k5, k9   still standing: k6
```

`ejection(green)` is the *decision the table took* in round 3. It is marked, not
rewritten, and the mark reaches it transitively:

```prolog
rests_on[case](case_against(Q, P), K)          :- points_at[case](Q, K), claimant[case](K, P).
rests_on[case](finding(Q), case_against(Q, P)) :- case_against[case](Q, P).
rests_on[case](ejection(Q), finding(Q))        :- ejected[public](Q, _), case_against[case](Q, _).
rests_on[case](X, Z)                           :- rests_on[case](X, Y), rests_on[case](Y, Z).
```

The support graph is built on `clash` and `stated`, never on `conflict` and
`live` — because the question is what the case *was built on*, and annulling a
claim must not quietly erase the fact that the case ever rested on it.

### The two annulments are not the same arithmetic

This is the finding this example did not expect to make.

- **Withdrawal.** Red takes back a mistaken sighting in round 4. Red may be
  crew, so red's word was load-bearing in every world where red is crew, and
  taking it back **restores worlds** — including `w(pink,cyan)`, the true one.
- **Unmasking.** Pink's card is shown in round 5 and pink's claims are annulled.
  This changes **no count at all**. In every world where pink is a traitor,
  pink's claims never constrained anything to begin with; the model had already
  priced the possibility that pink was lying. What prunes worlds is the reveal
  itself, not the annulment.

So the `annulled` / `at_risk` machinery here **explains** the change to a person
and does not compute it. Model counting does the annulment on its own, silently
and correctly, which is exactly why the explicit marking is worth having: the
table needs to be told that the decision it voted on in round 3 no longer
stands, and the count alone will not tell it.

The test pins it rather than the prose asserting it: every world that pink's
claims refute at round 4 is a world in which pink is crew.

## The price of an accusation

`whynot` is not "no". It is the **set of claims you would have to declare
false** for the accusation to become possible. Players do this intuitively and
badly; the engine names it:

```
  $ sus -n green                  [round 6]
  green cannot be a traitor. Every one of the 7 worlds that would make them one is ruled out.

    w(green,cyan)    ruled out by reveal(pink)
    w(green,lime)    ruled out by reveal(pink)
    w(green,pink)    ruled out by clash(k14,k15), k16
    w(blue,green)    ruled out by clash(k14,k15), k16, reveal(pink)
    w(green,black)   ruled out by clash(k14,k15), k16, reveal(pink), victim(black)
    w(green,white)   ruled out by clash(k14,k15), k16, reveal(pink), victim(white)
    w(red,green)     ruled out by clash(k14,k15), k16, k3, reveal(pink)

    THE PRICE OF THE ACCUSATION. The cheapest route to "green did it" is
    w(green,cyan), and it costs 1 retraction. You must declare false:
      reveal(pink)       pink's card was shown

    If the game log stands, the cheapest route is w(green,pink) at 2 retractions: clash(k14,k15), k16.
```

It is one relation read from both ends:

```prolog
price[case](P, W, R)        :- world[worlds](W), traitor_in[worlds](W, P),
                               refuted_by[worlds](W, R).
incriminates[case](P, W, R) :- world[worlds](W), crew_in[worlds](W, P),
                               refuted_by[worlds](W, R).
```

`price` is simultaneously *what clears P* and *what you must retract to accuse
P*. Those are the same set; only the direction of reading differs.

## Best derivation: text a person could say out loud

Every line below is a query result. The only thing the renderer adds is word
order:

```
    "Of the 28 ways the two traitor cards could have been dealt, 21 would leave green innocent,
     and every one of those 21 is already dead. Here is what killed them —
     the lines overlap, because most of those worlds die several times over:
       15 of them, by itself  —  pink and green contradict each other (k5 vs k7), so this world's crew would have lied
       15 of them, by itself  —  cyan and green contradict each other (k6 vs k7), so this world's crew would have lied
       15 of them, by itself  —  green and red contradict each other (k7 vs k10), so this world's crew would have lied
       15 of them, by itself  —  green saw pink kill in round 2
       15 of them, by itself  —  pink saw green kill in round 2
     What is left is 5 worlds: w(blue,green), w(green,black), w(green,cyan), w(green,lime), w(green,pink).
     green is a traitor in all 5. That is 100%, and our standard is 75%."
```

## Viterbi: which of the possible worlds is the likely one

A world says who the traitors are; it does not say which of their claims were
lies. `lie(W, K)` is the part that *is* determined, and `stance` sorts every
claim in every consistent world into one of four boxes — `forced` (the claimant
is crew, so the claim is true by the crew axiom), `lied`, `spared` (a traitor
who happened not to lie here), `pending` (not yet said, or annulled). The fold's
per-firing weight hook prices the boxes from a per-player deceit prior, and the
scan chain in `sus.rofl` §8 visits every claim once per world so that the
product along one derivation is that world's score.

```
  round 5:
    w(pink,cyan)     score     0.2400    65.8% of the consistent mass
    w(green,pink)    score     0.1250    34.2% of the consistent mass
```

The most likely world at round 5 is the true one, three rounds after the engine
accused an innocent player. **The ranking never changes which worlds are
possible** — it is a prior on people laid over an answer the Boolean fixpoint
already fixed, and the test asserts the ranked set is exactly the consistent
set. The independence assumption is stated in the model rather than hidden: the
score is a product over claims, so it treats each claim's honesty as
independent given the roles, which is false of any table where liars coordinate.

## Time, and the trap that used to be in it

Rounds are ticks, and the ticked table agrees with the as-of table exactly, at
**every** round:

```
  5 ticks run, one per round. At every tick boundary, the
  domain facts the ticked table holds against the same round evaluated as-of:
    round 1: 1226 vs 1226 facts  IDENTICAL
    round 2: 1010 vs 1010 facts  IDENTICAL
    round 3: 1484 vs 1484 facts  IDENTICAL
    round 4: 1412 vs 1412 facts  IDENTICAL
    round 5: 1209 vs 1209 facts  IDENTICAL
    round 6: 1503 vs 1503 facts  IDENTICAL
```

And so do the counts — which is the half that used to fail:

```
  and now fold the counting semiring over each of them, at round 3:
    outcome[case](any,green)               as-of                5   ticked 5
    outcome[case](guilty,green)            as-of                5   ticked 5
    consistent[worlds](w(blue,green))      as-of                1   ticked 1

    facts on a cycle of the support graph: as-of 20, ticked 20.
    every domain fact at round 3, counted both ways: 1484 of 1484 agree.
```

### The rule this example taught, and its retirement

**The rule was: fold as-of, never over a ticked store.** It existed because a
`fact @next :- fact` carry rule makes every carried fact its own support one
tick back, and past tick 0 the `CLOSED` counting semiring answered "infinitely
many" for everything — while every Boolean answer stayed correct. Silent, total,
and fatal here specifically, because in SUS the count is not a bonus column, it
is the whole product: the suspicion share is a ratio of counted worlds.

**It was retired on 2026-08-30, by a decision rather than a workaround.** `not p`
was settled to mean "p is not derivable in the CURRENT tick's store", and the
same argument narrows the fold: "in how many ways is this true" is a question
about the current tick, so a fact that arrived over the boundary is a *given* in
it, count one, and the support edge back across the boundary is not walked. See
`docs/time-and-continuity.md` and `src/semiring.ts`. `examples/oops` measured the
mechanism, `examples/npc` was the case that could not route around it, and
`examples/yak` fragment 05 is the probe that found it.

**Measured here rather than assumed, because SUS is where the as-of machinery
was built.** Ticked against as-of, at all six rounds, over every domain fact:
1226, 1010, 1484, 1412, 1209 and 1503 facts, and the counting fold agrees on
every one of them; `cyclic` is 20 in both stores at every round. At round 3 the
other three instances agree too — tropical, provenance and Viterbi differ on 0
of 1484. The distribution has shape (at round 3: 1367 facts count 1, 41 count 3,
38 count 2, 15 count 5, 8 count 4), so the agreement is not the degenerate kind
a fold that walked nothing would also produce. The test asserts this per round,
which is what the old test asserted in the opposite direction.

**What as-of is still for.** It is the simpler store to reason about, and "what
did we know in round 3" is one query instead of a simulation. And it remains the
only way to ask what *could have been asked* at a past round: tick-scoped facts
are dropped at the boundary, so the ticked store answers what was *derived* then
(frozen `derived_by`) and not what was derivable. That distinction is unaffected
by any of this — it is about dropped facts, not about the fold.

What a past tick *does* still answer is the frozen `derived_by` record: what was
derived at tick 4, still on the books now. What it does not answer is *what
could have been asked* at tick 4 — tick-scoped facts are dropped at the
boundary. `asOf(4)` answers that second question, and it is a different store
rather than a view of this one.

## Where the kernel fought back

Two things, both recorded here because the file's shape is the scar.

**A carry rule with a variable perspective leaks.** The natural way to carry
sixteen claims across a tick is one rule:

```prolog
said[P](K, C, A, T) @next :- said[P](K, C, A, T).      -- DO NOT
```

The audit reduces a variable perspective to `$any` at both ends, sees a flow
from `$any` into `$any`, and — since `bridge_decl` is only emitted when the head
perspective differs from the premise's — reports `leak[audit]($any, $any)`.
There is no way to declare that bridge: `$any` is not writable in the surface
syntax. The fix is eight rules, one per ledger, and it is also the more honest
statement: each book carries itself.

**A crossing that no `imports` fact can express — and the one that can.**
`boot.rofl` now closes the flow graph transitively (`flows_to`), because a
crossing licensed hop by hop is not a licensed walk. This model has such a
walk: the rules that collect testimony (`claim`, `charge`, `sighting`,
`vouching`) read a speaker's book under the variable perspective `[P]` and
write `[case]`, and the deduction rules read `[case]` and write `[worlds]`.
Each hop declares its bridge; the walk `[P] -> [case] -> [worlds]` declares
nothing.

It cannot be an `imports` fact. An import relates two **registered**
perspectives — ones with an `authority` fact — and `$var("P")` has neither and
never will. `sus.rofl` says it the one way it can be said:

```prolog
collects(case).
```

`[case]` deliberately gathers from ledgers it does not name; collecting what
each player said, with the speaker relocated from the perspective slot into an
ordinary argument, is what the case file IS. The declaration goes on `[case]`
and not on `[worlds]`, because `[case]` is the ledger that gathers — declare it
at the reader instead and every further reader of `[case]` needs its own copy
of a sentence that is false about it. The hops out of `[case]` stay subject to
the ordinary audit, and an undeclared one would still be a leak.
`test/example-sus.test.ts` asserts `collected[audit](case)`, so the empty leak
row is a result rather than an assumption.

**Atoms do not compare.** `player(A), player(B), A < B` binds nothing: the
comparison builtins are arithmetic. Generating the 28 unordered pairs therefore
needs an integer index on `player/2` to break the symmetry — visible in the
model as `player[public](red, 1)`.

## The data

Synthetic and hand-built. There is no public corpus of social-deduction
transcripts annotated with ground-truth roles *and* with every claim timestamped
by the round it was made and the round it is about, and scraping one would not
help: the value here is in a scenario arranged so that the engine crosses a
standard of proof and then falls back under it, which is a thing you construct,
not a thing you find. The ground truth is that **pink and cyan are the
traitors**; every crew claim in the file is true in that world and every traitor
claim is checked to be consistent with it. The oracle in `demo.ts` never sees
that ground truth — it re-derives consistency from the claims alone, exactly as
the rules do.
