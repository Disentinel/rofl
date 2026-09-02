# NPC — Non-Player Cognition

Ten agents in a walled yard at night. The engine is not asked a question about
them. **It runs them.** Every tick it derives what each one intends, decomposes
that into subgoals, proposes concrete acts, arbitrates the conflict with a
semiring, and hands one act per agent to the simulator.

Every other example here is a query: you ask, the engine answers. This one is a
loop the engine drives — and because a plan is a fixpoint rather than a
traversal, the plan has a derivation tree. That is the whole point. `why` works
on an act. `whynot` works on one that was not taken. Neither question has an
answer in a behaviour tree, a GOAP planner, or a utility AI, and the second one
is the most hated question in game AI.

Then the agent meets a situation no rule covers, says so as a **fact**, a rule
gets written for it at runtime, and the rule is applied to the whole recorded
past.

## How to run

```sh
node --experimental-strip-types examples/npc/demo.ts    # the transcript below
node --experimental-strip-types --test test/example-npc.test.ts
node --experimental-strip-types src/repl.ts examples/npc/npc.rofl
```

The REPL loads the rules with no agents in the yard, so it is the model without
the run. Publish a roster by hand and it wakes up:

```
? drive[world](K, G, P)
? rule(R)
```

## What it shows

| the spec asks for | where |
|---|---|
| intents as facts, goal decomposition by rules, plan as fixpoint | `npc.rofl` §6, transcript §3 |
| conflict resolved by a SEMIRING and not a priority `if` | `npc.rofl` §8 + `arbitrate()`, transcript §4 |
| `why` on any act, `whynot` on any unperformed one | transcript §5 |
| state restored at an arbitrary tick, "when was this last derivable" | transcript §10 |
| an uncovered situation gives an explicit HOLE, not a silent choice | `npc.rofl` §9, transcript §8 |
| a rule added at runtime, and a diff of the rule set | transcript §8 and §9 |
| a per-tick budget, partial inference marked | `npc.rofl` §10, transcript §7 |
| a perspective per agent; incomplete information changes the conclusion | `npc.rofl` §0 and §4, transcript §1 |
| measured throughput, published whatever it is | transcript §12 |

Two things it also shows that the spec did not ask for, because they were what
the domain turned out to cost:

- **the loop the kernel refused to close, and now closes** (§2) — the finding
  this example recorded, and the kernel change that answered it;
- **the provenance table is the cost curve** (§12) — measured from both sides.

## The three things this stands on, all already in the kernel

**Rules are facts.** `load` turns every clause into reflection facts and the
evaluator reads rules *only* from the store. So writing a rule at runtime is
asserting facts, the rule applies to the whole past on the next evaluation
because evaluation is a fixpoint and not an incremental patch, and diffing two
rule sets is `? rule(R)` twice.

**Rule identity is content-addressed.** `ruleIdOf` is `r` + fnv1a of the
canonical clause, so a diff is a set difference on hashes and nobody has to be
trusted about a version number.

**A perspective is a ledger.** `saw[npc_3](...)` and `saw[npc_7](...)` are
different facts because their perspectives differ. Two agents holding
incompatible pictures of the same yard is legal rather than a data error, and
nothing enforces the wall between them because **the wall is the ledger**.

## Perspectives here

`docs/choosing-perspectives.md` says a perspective is a ledger — a truth
context with a named list of who may write into it — never a status and never a
modality. Thirteen ledgers, of four kinds:

| ledger | what is in it | who may write |
|---|---|---|
| `[world]` | the yard as it is: positions, wounds, terrain, the clock | `authority(world, sim)`, plus the carry rules |
| `[npc_1]` … `[npc_10]` | one journal per agent: what it has seen, and when | that agent, and the sensing rules of §4 |
| `[mind]` | the book of deliberation: beliefs, intents, subgoals, options, acts | rules only |
| `[choice]` | the arbiter's book: one score per option | `authority(choice, arbiter)` — the fold, in host code |
| `[audit]` | verdicts about the run: holes, ties, staleness, partial thinking | rules only |

*"What npc_3 has observed"* is a ledger and it pays immediately. An agent that
writes into somebody else's journal is `forged[audit]`, mechanically, with no
enforcement code — the test does it on purpose and watches the audit fire.

*"Dangerous"* is **not** a ledger. `foe[mind](A, E)` is derived from what A
recalls plus the hostility table, and an entity can stop being a foe without
anything being re-filed.

*"Wounded"* is not one either. It is an argument — the band on a sighting —
because "npc_3 saw npc_5 bleeding at tick 0" and "npc_5 is at 95 hp now" are
both true and are about different things.

### One rule writes ten journals

```prolog
saw[A](E, K, X, Y, B, T) :- spots[world](A, E, X, Y),
                            kind[world](E, K), band[world](E, B), now[world](T).
saw[P](E, K, X, Y, B, T) @next :- saw[P](E, K, X, Y, B, T).
```

The head perspective is a **variable bound by the body**, and the agent's id and
the name of its ledger are deliberately the same atom — the idiom
`examples/loot` uses for `pack[P](P)`.

The carry rule is newly legal and it is worth saying why. `saw[P](..) @next :-
saw[P](..)` reads and writes the *same* perspective variable, and until today
that surfaced as `leak[audit]`: the audit recorded every variable perspective as
one wildcard, so a rule polymorphic in the ledger looked exactly like a rule
reading one ledger and writing another. `examples/sus` wrote its carry rules out
one per player to get round it, twenty lines of them. The kernel now records a
variable perspective **as itself** and `leak` excludes a flow whose two ends are
the same term, so a rule polymorphic in the ledger crosses no boundary and says
so. Ten journals, one line.

Nothing here takes that on trust. `leak[audit]` is 0 in the transcript's hygiene
section, and the test carries the positive control — a sighting stamped tick 0
is still in npc_3's journal after the clock moves, and npc_1's journal still
does not have it.

## The loop the kernel would not close, and now does

The obvious way to write this example is to make the world transition rules too:

```prolog
at[world](E, X2, Y) @next :- does[mind](E, move(east)), at[world](E, X, Y), X2 is X + 1.
```

It used not to load. Sensing reads `at[world]`; deliberation reads sensing
through `not` (freshest memory, best score, no better option); the transition
writes `at[world]`. That read as a negative dependency cycle, and **`@next` did
not help**, because stratification was computed on a graph that did not know a
conclusion's tense: `dep(A,B)` came from `concludes` and `premise_pos`, which
say nothing about time. The loop was acyclic in time and cyclic in the graph,
and the graph was what was checked. This example recorded that as a finding.

The finding has since been answered in the kernel. `not p` means *p is not
derivable in the CURRENT TICK's store*, so a rule whose head is `@next`
contributes no same-tick dependency edge — its conclusion is not derived in
this tick at all; it is staged and installed at the tick boundary as a base
fact of the next tick, which is why it also gets stratum 0 there. The kernel
emits `conclusion_tense(RuleId, now|next)` and `boot.rofl` reads it. The loop
above loads, and one tick later the world has moved.

What has NOT changed is the check. Take `@next` off those same two rules and
the transition really does write, in one tick, what deliberation reads in it:

```text
program rejected: unstratified[main](at), unstratified[main](does)
unstratified[main](at)  <= ...
  dep_neg[main](at,moves)  <= ...
  reach[main](moves,at)  <= ...
    ... dep[main](saw,at) ...
```

That is the whole content of the change: two programs one word apart, one
accepted and one refused, where before both were refused.

The simulator here still applies acts in host code and republishes `at`/`hp`
every tick — but that is now a choice rather than a wall. It is the same split
`examples/loot` makes for its fork diff (the arithmetic is host, every verdict
about it is a rule), and it is **exactly where the fog of war already said the
boundary was**. Deliberation may not read ground truth; that is the epistemic
discipline of the example, and it holds whether or not the kernel would permit
otherwise.

§2 of the transcript measures all of this, with the controls inside the probe:
the `@next` program must load *and move the world correctly*, the same program
without `@next` must still be refused, and the program with no transition at
all must load *and derive something*. An empty result is not a measurement, and
neither is an acceptance from a checker that has stopped checking.

## Intents, and why the plan has a tree

Nothing here is a data structure inside an agent:

```prolog
intent[mind](A, repel, P) :- kind[world](A, K), drive[world](K, repel, P),
                             alive[mind](A), foe[mind](A, F), adjacent[mind](A, F).

subgoal[mind](A, repel, drive_off(F)) :- intent[mind](A, repel, _),
                                         foe[mind](A, F), adjacent[mind](A, F).

intent[mind](A, G, P) :- subgoal[mind](A, Par, G), kind[world](A, K),
                         drive[world](K, Par, P).
```

A drive is a disposition; a subgoal is a commitment. `why` on the commitment
walks the whole path back to a row of the drive table and a position in the
world — including the sighting the belief rests on, and the tick it was stamped
with.

### The inheritance rule is written the awkward way on purpose

The obvious form is `intent(A,G,P) :- subgoal(A,Par,G), intent(A,Par,P)`. It is
wrong for the fold. The parent intent is then a premise of the child **twice** —
once directly and once inside the subgoal — and ⊗ over the premises of one
firing multiplies its factor in both times: 0.7 becomes 0.343 instead of 0.49.

That is not a bug in the semiring. Viterbi folds over derivation *trees*, and in
a tree a shared premise really does occur twice. Reading the constant out of the
drive table instead leaves exactly one occurrence, and then a score is the
product of one factor per decomposition step, which is what the example claims
it is.

## The conflict, and the semiring that resolves it

`score[choice](A, Act, V)` arrives from a Viterbi fold over the support the
kernel already recorded. The only domain knowledge in the whole arbiter is one
line: **a firing that concludes an intent carries that intent's priority as its
factor.** Which derivations exist, which premises they rest on, and which of two
routes to the same act is better all come out of the store.

Everything decided *about* those numbers is a rule:

```prolog
beaten[mind](A, V)      :- score[choice](A, _, V), score[choice](A, _, W), W > V.
contender[mind](A, Act) :- score[choice](A, Act, V), not beaten[mind](A, V).
does[mind](A, Act)      :- contender[mind](A, Act), not preempted[mind](A, Act).
```

so `whynot does[mind](npc_4, hold)` is an answer and not a stack trace.

### Why this is not "65 beats 40"

npc_4 stands next to a wolf. Two intents reach an act:

```text
    hold           from hold_post        0.4000
    strike(npc_8)  from drive_off(npc_8) 0.4225
```

`repel` at 65 reaches `strike` in TWO decomposition steps, so it scores
0.65 × 0.65. `hold_post` at 40 reaches `hold` in ONE, so it scores 0.40. The
warden fights, and barely.

Now move one number — repel from 65 to 62, still far above hold_post, **the
priority order completely unchanged** — and:

```text
    hold           from hold_post        0.4000
    strike(npc_8)  from drive_off(npc_8) 0.3844
```

The warden holds instead of fighting. Two steps of 0.62 are worth less than one
of 0.40. **No `if` in any language expresses that**, and no priority list
contains it: it is a fact about the shape of the derivation, not about the
ordering of the constants.

**Depth costs, and that is a real semantic commitment.** A deeply decomposed
plan under a strong drive can lose to a shallow one under a weak drive. A
designer has to know that, and it is the price of having the arbitration be an
algebra over the whole derivation rather than a comparison of two numbers.

### And where the semiring is indifferent, something else decides — out loud

Several steps run away from the same wolf equally well. The fold scores them
identically, because they *are* identical to it. A declared order over acts then
decides — help, else hit, else move, else stand — and every occasion it decided
anything is recorded:

```prolog
tie[audit](A, Act, Other) :- contender[mind](A, Act), contender[mind](A, Other),
                             act_ord[mind](Act, N), act_ord[mind](Other, M), N < M.
```

The order is a real commitment and not a formality. An agent standing beside the
ally it means to tend scores `tend(B)` and `move(D) towards B` identically, both
being one step off the same intent, and without "help before travel" it would
walk past the wound for ever. That is not hypothetical; it is what the first
version of this example did.

## whynot

The question a behaviour tree cannot answer in principle — you can see which
node ran, never why another did not.

**An act that was not chosen.** The answer is the arbitration:

```text
whynot does[mind](npc_4,hold):
  rule r96cd669a: does[mind](?A,?Act)@now :- contender[mind](?A,?Act)@now, not preempted[mind](?A,?Act)@now
    failed premise: contender[mind](npc_4,hold)
      rule rbddff3de: contender[mind](?A,?Act)@now :- score[choice](?A,?Act,?V)@now, not beaten[mind](?A,?V)@now
        failed premise: not beaten[mind](npc_4,-916291) -- blocked: beaten[mind](npc_4,-916291) holds
```

**An act nobody could reach.** npc_3 can see npc_5 bleeding two cells away and
does not bind the wound. Not "which node ran" — which premise failed, and by how
much:

```text
whynot option[mind](npc_3,tend(npc_5),tend(npc_5)):
  rule r13e81b69: option[mind](?A,tend(?B),tend(?B))@now :- intent[mind](?A,tend(?B),?_$0)@now, adjacent[mind](?A,?B)@now, in_sight[mind](?A,?B)@now
    failed premise: adjacent[mind](npc_3,npc_5)
      rule rabaa78a0: adjacent[mind](?A,?E)@now :- gap[mind](?A,?E,?D)@now, melee[world](?R)@now, ?D <= ?R
        failed premise: 4 <= 1 [builtin fails]
```

**And the spec's own example**, `line_of_sight = false, перекрыто props/crate_14`
— an ally in range, unseen, and the thing in the way NAMED rather than reported
as a `false`:

```text
whynot in_sight[mind](npc_1,npc_5):
  rule rd855e15c: in_sight[mind](?A,?E)@now :- recalls[mind](?A,?E,?_$0,?_$1,?_$2,?_$3,?T)@now, now[world](?T)@now
    failed premise: recalls[mind](npc_1,npc_5,?_$0#0,?_$1#0,?_$2#0,?_$3#0,?T#0)
      rule r693c2c00: recalls[mind](?A,?E,?K,?X,?Y,?B,?T)@now :- saw[?A](?E,?K,?X,?Y,?B,?T)@now, not outdated[mind](?A,?E,?T)@now
        failed premise: saw[npc_1](npc_5,?_$0#0,?_$1#0,?_$2#0,?_$3#0,?T#0)
          rule r92e1d2ea: saw[?A](?E,?K,?X,?Y,?B,?T)@now :- spots[world](?A,?E,?X,?Y)@now, kind[world](?E,?K)@now, band[world](?E,?B)@now, now[world](?T)@now
            failed premise: spots[world](npc_1,npc_5,?_$1#0,?_$2#0)
              rule ra4ebf83d: spots[world](?A,?E,?X,?Y)@now :- in_range[world](?A,?E,?X,?Y)@now, not screened[world](?A,?E,?_$0)@now
                failed premise: not screened[world](npc_1,npc_5,?_$0#3) -- blocked: screened[world](npc_1,npc_5,cart_3) holds
```

The rule ids in that block are content hashes of `npc.rofl`'s clauses, so
editing any of those rules forces the test — and this README, and the page — to
be redone. That is this example's own versioning claim applied to its own text.

`whynot` takes `depth` and `nodes`, and both announce themselves when they fire.
The test asks for a demonstration that is too shallow and one that is too narrow
and checks that each says which bound cut it. A truncation that does not say it
truncated is the failure mode this API is built against.

## The fog of war, and what one line is worth

npc_1 and npc_5 are within sight of each other with `cart_3` between them.
npc_5 is bleeding. npc_1 does not know:

```text
    npc_1's whole journal:   cart_3, crate_14, crate_15, npc_10, npc_2, npc_3
    in_range npc_1 -> npc_5: true  (so it is not distance)
    in_sight npc_1 -> npc_5: false
    screened by:             cart_3
```

Give npc_1 that one sighting — one fact in its own journal, the world untouched
— and re-derive:

```text
    npc_1's intents without it: hold_post
    npc_1's intents with it:    hold_post, tend(npc_5), tend_wounded
    and a hole it did not have: uncovered(npc_1, no_action, tend(npc_5))
```

Identical positions, identical wounds, in both. The perspective is the whole
difference and the difference reaches all the way to a commitment. That is
"почему он не отступил" answered with "в его перспективе противника там нет",
in the direction where it costs somebody blood.

### Line of sight is a bounding box, and that is a real approximation

A prop blocks A from E when it stands inside the rectangle spanned by the two
positions. Four rules, no derived geometry. It is coarser than a ray: two agents
diagonally opposite a crate are blocked here and would not be by Bresenham.

It is chosen because the alternative is a precomputed visibility table — 45
cells squared, two thousand facts of derived geometry, in an example whose point
is the traces. And it buys the thing the demonstration needs: the blocker is
**named**, so `whynot` says `cart_3` and not `false`.

## Memory, and acting on one

The journal is the only thing carried across ticks, and every entry is stamped:

```prolog
outdated[mind](A, E, T) :- saw[A](E,_,_,_,_,T), saw[A](E,_,_,_,_,T2), T2 > T.
recalls[mind](A, E, K, X, Y, B, T) :- saw[A](E,K,X,Y,B,T), not outdated[mind](A, E, T).
stale[audit](A, E, Age) :- recalls[mind](A, E, K, _, _, _, T), K != prop,
                           now[world](N), Age is N - T, Age > 0.
```

So an agent aims at where a wolf **was**, and `stale[audit]` says by how many
ticks. That is not a defect to be fixed; it is the only honest thing a fog of
war can produce, and it is why `recalls` carries its tick rather than pretending
to be the world. A prop never moves, so a memory of one is never counted stale
however old it is — which is also why an agent may navigate by its memory of
crates while it may not aim by its memory of wolves.

## The hole

A subgoal is a commitment to act. One that neither decomposes further nor
reaches a single option is a situation no rule covers, and the agent says so:

```prolog
uncovered[audit](A, no_action, G) :- subgoal[mind](A, _, G),
                                     not any_option[mind](A, G),
                                     not decomposed[mind](A, G).
```

npc_3 sees npc_5 bleeding two cells away, holds the subgoal `tend(npc_5)`, and
no rule in the file reaches an act for it. It does not fall through to a default
nobody wrote down, and it does not pick at random. It records
`uncovered(npc_3, no_action, tend(npc_5))` and holds its post — *on purpose*,
and the record says which purpose was abandoned.

A drive that simply does not apply is **not** a hole, or every agent would be
one every tick. `survive` with no threat in sight is dormant, not uncovered.

### The second hole is left open, and that is the point

`uncovered(A, unclassified, npc_10)`: the wisp is in no `hostile` row and no
`kin` row, so every warden that sees it lands here. It stays open for the whole
run and the agent never writes a rule for it.

One sighting of one thing is not a reason to write a rule. The restraint is the
same claim as the extension: what the kernel gives you is an honest record of
what is not covered, and *deciding which of those records is worth a rule is not
something a fixpoint does.*

## Self-extension, and the boundary stated as plainly as the spec states it

From ten holes of the shape `uncovered(A, no_action, tend(B))`, one rule:

```prolog
option[mind](A, move(D), tend(B)) :- intent[mind](A, tend(B), _),
                                     step_to[mind](A, D, X2, Y2),
                                     recalls[mind](A, B, _, BX, BY, _, _),
                                     gap[mind](A, B, D0),
                                     D1 is (X2 - BX) * (X2 - BX) + (Y2 - BY) * (Y2 - BY),
                                     D1 < D0.
```

*An ally you cannot reach is one to walk towards, by the last place you saw it.*

**Choosing that template is a generative step and the kernel does not perform
it.** `proposeRule` is a human's template with a threshold of three holes on it,
and the threshold is the only thing about it that is mechanical. What the kernel
guarantees is everything after: the rule is recorded as facts like any other, it
is applied to the **whole past** on the next evaluation, `boot.rofl`'s audits
judge it exactly as they judge the file, and it can be diffed. It does not
guarantee the rule is sensible. Same boundary as JOPA: **the model proposes, the
kernel answers for consequences.**

"Applied to the whole past" is not a figure of speech. `Store.restore` comes
back dirty, so a restored tick **re-derives** rather than replaying a log:

```text
    uncovered(npc_3, no_action, tend(npc_5)) at tick 1 before: true
    ... and after:                                            false
    options npc_3 now has for tend(npc_5): move(east)
```

And what it does to behaviour, same eight ticks, same start:

```text
    npc_3 before: hold hold hold hold hold hold hold hold
    npc_3 after:  move(east) tend(npc_5) hold hold hold hold hold hold
    npc_5's hp at the end: 55 before, 95 after
```

The last line is the one that matters: the ally is actually healed. The
extension reached the world, not just the store.

Two holes of the other shape survive — `uncovered(npc_7, no_action,
stalk(npc_4))`, a wolf standing on the exact spot where it last saw prey that is
no longer alive, with no step that decreases a distance already zero. The rule
was generalised from `tend` holes and closes `tend` holes. It does not
accidentally fix a different hole, and it is not claimed to.

## The rule-set diff, and how it relates to LOOT's

```text
  rules in the head at tick 1: 99
  after the agent writes one:  100
  added:   r9cdce170
  removed: (none)
  and the id recomputed from the text alone: r9cdce170
```

`examples/loot` diffs two **editions of a pack** by parsing two texts and
hashing the clauses. This diffs two **snapshots of one head** by reading
`rule(R)` back out of the store. Same identity function — `ruleIdOf`,
content-addressed — different source, and no machinery duplicated: the set
difference is four lines because the kernel already did the hard half.

LOOT's finding transfers unchanged and is **not** re-litigated here: renaming a
variable produces a different rule id, so a diff across a rename keeps nothing.
It is measured once, with the control that makes it a measurement:

```text
    same rule, two variables renamed:   r0c86a060  DIFFERENT
    same rule, whitespace reflowed:     r9cdce170  SAME
```

Without the second line the first proves nothing — a hash that changed could
have changed for any reason. See `examples/loot/README.md` for the rest,
including the half that reaches a conclusion somebody would act on.

## The frame budget

The kernel's inference budget and the domain's frame budget are the same thing,
one for one. This is the rare case where an abstract kernel primitive meets an
existing domain requirement exactly.

A tick thought from cold — a store restored at tick 3, whose derived layer has
to be rebuilt from the base facts — costs about 2700 firings here. Give it 1200:

```text
    partial: true
    hole(Id, budget_exhausted): $adhoc
    and what it reached anyway:  5 sightings for npc_4, 10 intents, 6 options
```

Not a hang, not rubbish, and not silence: a partial answer with a marker beside
it, and the partial conclusions still in the store and still queryable.

**The marker cannot be read in the frame that wrote it.** Deriving
`thought_partial[audit](Id) :- hole(Id, budget_exhausted)` is itself a firing,
and there were none left:

```text
    thought_partial[audit] inside the exhausted frame: (none)
    thought_partial[audit] on the next evaluation:     $adhoc
```

That is the right shape for the domain — a frame that ran out cannot also
report that it ran out; the *next* frame reads the record and can decide to
think less — but it is a thing to know, and nothing in the kernel says it.

## Throughput, published whatever it is

Ten agents, eight ticks. **2.8 ticks per second at the first tick, 1.3 at tick
seven.** That is not a good number and it is the number.

```text
  snapshots off                                   4571 ms    571 ms/tick  1.8 ticks/s
  snapshots off, provenance pruned each tick      2575 ms    322 ms/tick  3.1 ticks/s
  snapshots on                                    4604 ms    576 ms/tick  1.7 ticks/s

    tick      ms  ticks/s    facts  derived
       0     363      2.8     5022     3187
       1     422      2.4     6950     5051
       2     545      1.8     9066     7094
       3     480      2.1    11205     9175
       4     564      1.8    13161    11097
       5     676      1.5    15412    13308
       6     681      1.5    17627    15487
       7     789      1.3    19977    17798
```

(One run, one machine. The shape is stable across runs; the millisecond is not.
Snapshots are free within the noise, which is worth knowing on its own — saving
the whole store every tick costs nothing measurable next to the tick.)

### Three things in that table, and only one of them is the yard

**It is not a constant.** The average hides a factor of two between the first
tick and the eighth. A frame budget has to live with the last row, not the mean.

**The growth is not the yard.** Ten agents on a 9×5 grid produce about a hundred
new sightings per tick. The store grows by two thousand facts per tick. Counted
by relation, between tick 1 and tick 4:

```text
    derived_by       +5966
    saw              +103
    outdated         +99
    asserted_by      +29
    in_perspective   +29
```

`derived_by` is the kernel's own provenance — one fact per firing — and
`advanceTick` freezes it so that a completed tick keeps the record of which rule
concluded what. That is a deliberate guarantee, and it is also the entire cost
curve: every fold, the arbiter's included, walks the whole store.

**Measured from the other side rather than argued.** The second benchmark row
prunes completed-tick provenance in host code and re-runs the identical eight
ticks: 2575 ms against 4571, a factor of 1.8, with the two runs ending in
provably the same world state (the test checks that, or it would be comparing
two different simulations).

Which is the honest shape of the trade, and it is not a defect to be dismissed.
Keeping the reasons is the point of the whole system. Keeping them is what makes
tick 8 cost twice what tick 1 did. A game would prune, and would then be a game
that cannot say why its NPC did anything three seconds ago — which is exactly
the thing this example exists to make possible.

Anyone reproducing this: **measure first, on a cold heap.** The identical eight
ticks measured at the end of the transcript, after four worlds and sixteen
snapshots have been built and retained, run measurably slower in the same
process on the same machine. The demo measures that too, and prints both, rather
than asserting the methodology.

## Counting across ticks — the third case, and the one that settled it

`examples/oops` measured why and `examples/loot` reported it. A carry rule makes
every carried fact its own support one tick back; that self-loop met the CLOSED
counting semiring, whose `star(one)` is INFINITE; so past tick 0 the count of
anything downstream of memory was "infinitely many".

LOOT could avoid it by rebuilding worlds instead of using ticks. **NPC could
not** — restoring a tick is one of the things it is for — and that is what made
it the case that had to be decided rather than routed around. It was decided the
way `not p` was: **the fold is about one tick**, so a fact that arrived over the
boundary is a *given* in the tick that reads it, count one, and the fold does
not walk a support edge recorded by a rule whose head is `@next`. Measured here
rather than assumed, before and after:

```text
  store                    finite  infinite  on a cycle  in memory
  tick 0, nobody in it       2785       233          26          0
  tick 3, before            9144      1137         186        185
  tick 3, after            10048       233          26          0
```

The clock no longer moves the last three columns. The control is the column that
did **not** go to zero: 233 facts are still INFINITE at both ticks, and they are
`reach`/`stratum` — boot.rofl's own closure, which is a cycle inside a single
tick and correctly countless (`f_boot_rofl_is_itself_cyclic`). A fold that had
merely stopped seeing cycles would have taken those with it.

This example still arbitrates with Viterbi, which is BOUNDED and converges over
exactly the same cycles — a fact the test checks by folding both instances over
the *same* restored store and requiring `cyclic > 0` for the comparison to mean
anything. That is now a choice about what Viterbi answers, not a way around the
counting instance.

## Findings

### `@next` does not break a negative dependency cycle — SETTLED

*As recorded:* stratification was computed from `concludes`/`premise_pos`,
which carry no temporal marker, so a sense→decide→act→world loop that is
perfectly acyclic in time was a negative cycle in the graph and the program was
refused. The refusal itself was exemplary — a demonstration, not a hang — but
the consequence for this domain was total: **the world transition could not be
rules**, and any simulation with deliberation in it met the same wall.

*As settled:* the semantics question this raised — what `not p` means when `p`
is concluded only `@next` — was decided as **"not derivable in the current
tick's store"**. Under it a `@next`-headed rule contributes no same-tick
dependency edge and its conclusion relation takes stratum 0, which is also what
a fact arriving at the tick boundary IS: base for the tick that sees it. The
kernel carries the head's tense as `conclusion_tense(RuleId, Tense)`, a new
reserved relation, because the marker otherwise lives only inside the reified
`$lit` of `conclusion_lit` where no rule can reach it. `boot.rofl` reads it in
`dep`/`dep_neg` and in one new `stratum` rule.

The probe in `loopProbe()` stayed, inverted: it now measures the acceptance,
and its control is the same transition with `@next` removed, which must still
be refused.

### Two declarations, and both had to be carried across the tick

`boot.rofl` closes the flow graph transitively (`flows_to`), because a crossing
licensed hop by hop is not a licensed walk. Two walks surfaced here, and they
needed two different sentences.

`[choice] -> [mind] -> [audit]` is an ordinary import: `imports(audit, choice)`.
`tie[audit]` is a verdict about the arbiter's scores, and a verdict that could
not read what it judges would be worth nothing.

`$var("A") -> [mind] -> [audit]` could not be an import at all. One rule fills
`[mind]` from ten journals — the sensing rules read `saw[A](..)` under the
agent VARIABLE — and `imports` relates two **registered** perspectives while
`$var("A")` has no `authority` fact. `collects(mind)` is the sentence that
says it, at the ledger that gathers. `test/example-npc.test.ts` asserts
`collected[audit](mind)`, so the empty leak row is a result and not an
assumption.

**Both lines had to be carried across the tick boundary, and finding that out
cost a tick.** A plain `imports(audit, choice).` is tick-scoped: `addClause`
gives a fact `scope: 'timeless'` only when its relation is RESERVED, and
neither `imports` nor `collects` is kernel vocabulary. So the declarations were
dropped at the first tick boundary while `authority(choice, arbiter)` right
beside them — reserved — survived, and `leak[audit](choice, audit)` came back
at tick 1 with nothing in the file changed. `@init` does not help: the loader
decides scope by reservedness and never looks at the tense. The remedy is the
one this file already uses for everything else that persists — carry rules in
§2, where the block exists to say persistence is a rule and nothing is implicit:

```prolog
imports(P, Q)              @next :- imports(P, Q).
collects(X)                @next :- collects(X).
```

That the topology of the ledgers needs carrying like a crate in the yard is a
fact about the kernel worth knowing before writing any ticking program with an
`imports` or `collects` fact in it.

**And the meta-kernel got heavier, which the loop probe measured for us.**
`loopProbe` ran on a budget of 400 steps, sized against a smaller `boot.rofl`.
With the collection graph added the tick needs 426 (bisected, not guessed), so
`tickAdvance` refused to advance, emitted a hole, and the probe reported the
UNMOVED world — a correct refusal that reads exactly like a wrong answer. The
budget is now `LOOP_BUDGET = 800`, roughly twice the measured requirement.

### Completed-tick provenance is unbounded, and it is the cost curve

*As recorded:* `advanceTick` freezes `derived_by` so a finished tick keeps its
record. Over eight ticks that is 2000 facts per tick, dwarfing everything the
domain produces, and it doubles the per-tick cost between the first tick and the
eighth. Measured from both sides in §12. Not a defect — the guarantee is the
product — but a long-running host needs a pruning policy, and the kernel offers
none. A program that *reads* `derived_by` in a rule (as `examples/loot` §5 does)
cannot prune at all.

*As settled:* the kernel offers one, and this example is the diagnosis it was
built from. `new Rofl({ retainTicks: N })` keeps the current tick's provenance
plus N completed ticks; `retainTicks` unset is the default and keeps everything,
byte for byte, because frozen provenance is reconstructable *in principle*
(determinism plus dated assertions — `docs/time-and-continuity.md`) and the
replay machinery does not exist yet. The second half of the finding survives as
a gate rather than as a caveat: a program whose rules read `derived_by` keeps
its provenance whatever the setting says, decided by the same predicate that
turns derived-relation reuse off, so retention and reuse cannot disagree about
one program. Re-measured on this yard — ten agents, eight ticks, snapshots off,
one laptop at load average 3.2, a separate process per configuration so each
starts on a cold heap:

```text
  default (keep everything)     2927 ms   366 ms/tick   236 ms at tick 0 -> 531 at tick 7
  retainTicks: 0                1980 ms   248 ms/tick   220 ms at tick 0 -> 249 at tick 7
  retainTicks: 2                2345 ms   293 ms/tick
  host-side sweep (§12's row)   2013 ms   252 ms/tick
```

The flat column is the point: what the policy removes is not a constant, it is
the slope. The control is that `retainTicks: 0` still ends holding 332
provenance records — the current tick's — where the host-side sweep ends with
zero, so this is provenance being *bounded* rather than provenance being gone.

### The budget marker is invisible to the frame that earns it

`hole(Id, budget_exhausted)` is written when the budget runs out, and any rule
that reads it needs a firing that is no longer available. So `thought_partial`
is always one evaluation behind. Correct, and worth knowing before designing
anything that reacts to its own partiality.

### A tie between two acts is not the same kind of thing as a conflict

The semiring resolves conflict. It cannot resolve indifference, and pretending
otherwise would be putting a priority `if` back in through the side door. The
declared act order plus `tie[audit]` is the honest form, but it means that an
example claiming "conflict is resolved by a semiring" must also say, out loud,
that *some* decisions are made by a total order the modeller wrote down. This one
does, and the count of them is in the transcript.

## What could not be modelled

**The world transition, as rules.** The first finding above. It is the largest
thing missing and it is not a matter of effort.

**Anything an agent knows about another agent's position as an obstacle.**
`step_to` avoids props the agent has *seen* and knows nothing about other
agents, so an agent plans into an occupied cell and the physics refuses. Adding
it is four lines and it was left out deliberately: with memories in it, an agent
would refuse a cell that a stale sighting says is occupied and is not, which is
a better model and a much worse transcript. The refusals are printed, so the gap
is visible rather than hidden.

**Fractions.** hp is an integer 0–100 and sight is a squared radius because the
kernel's `is` is integer-only — `3 / 2` truncates to 1. The spec's own example
has `hp = 0.34`, and there is no way to write that. Nothing here needed it, and
a domain that did (probabilities as data rather than as semiring weights, a
continuous cost surface) would need a rational or fixed-point layer the kernel
does not have.

**True line of sight.** Bounding-box occlusion, discussed above. A ray needs
either a per-cell visibility table or arithmetic the kernel cannot do.

**Learning anything other than an option rule.** `proposeRule` fills one
template. Generalising the *shape* of a rule from holes — noticing that the
missing premise is a distance comparison rather than a visibility one — is
program synthesis, and the spec is explicit that the kernel does not do the
generative half. What is here is the honest half: the record of what was not
covered, and the guarantee about what happens once a rule exists.

**Any claim that the learned rule is good.** It is checked by running it and
seeing npc_5 healed. That is evidence about this yard and this roster and
nothing more. A rule that helped here and is terrible in general would pass
every check in this example, and the README saying so is the only guard against
reading the demonstration as more than it is.

**Concurrency between the agents' deliberations.** All ten think in one
fixpoint, so they see the same tick and cannot interleave. Two agents planning
to enter the same cell both derive the move and the simulator arbitrates, which
is a real difference from a game loop where the first one there wins.

## The transcript

Real output of `node --experimental-strip-types examples/npc/demo.ts`, pasted
verbatim.

```text
NPC — Non-Player Cognition.
ten agents in a walled yard. The engine is not asked a question about
them; it derives what each intends, decomposes it, arbitrates the
conflict with a semiring, and hands one act per agent to the simulator.

grid     9 x 5, 3 props
agents   10 (6 wardens, 3 wolves, 1 wisp)
acts     move(Dir), strike(E), tend(E), hold
rules    examples/npc/npc.rofl, loaded next to boot.rofl

== 0. hygiene: what the rest of this transcript rests on =====================
  99 rules loaded (boot.rofl + npc.rofl); every one range-restricted: true
  relations evaluated by demand (top-down unfolding): 0
  unstratified: (none)
  boot.rofl's audits over NPC's own reflection: malformed 0, breach 0, leak 0, forged 0, unmoded 0, undefined_premise 0

  a rule that reads one agent's journal and writes the shared book of
  deliberation crosses two ledgers, and the crossing is declared: the
  explicit head perspective emits bridge_decl, which is why leak is 0
  above rather than a number the reader has to forgive.

  the strata boot.rofl computed, not an order this file assumed:
    spots        1
    saw          1
    recalls      2
    foe          2
    ally         2
    intent       2
    subgoal      2
    option       3
    any_option   3
    contender    1
    preempted    1
    does         2
    uncovered    4
    tie          1

== 1. the yard at tick 1 =====================================================
  y=5  W2 W3  . W5  .  .  .  . w9
  y=4   . W1 ##  .  .  .  . W6  .
  y=3 *10  . ##  .  .  .  .  .  .
  y=2   .  . ## w7  .  . W4 w8  .
  y=1   .  .  .  .  .  .  .  .  .
         1  2  3  4  5  6  7  8  9

  W = warden, w = wolf, * = wisp, ## = a prop that blocks sight and feet

  npc_1 at (2,4) and npc_5 at (4,5) are within sight of each other, and
  cart_3 stands between them. npc_5 is bleeding. npc_1 does not know:
    npc_1's whole journal:   cart_3, crate_14, crate_15, npc_10, npc_2, npc_3
    in_range npc_1 -> npc_5: true  (so it is not distance)
    in_sight npc_1 -> npc_5: false
    screened by:             cart_3

  AND THE MISSING LINE IS WORTH SOMETHING. Give npc_1 that one sighting
  — one fact in its own journal, the world untouched — and re-derive:
    npc_1's intents without it: hold_post
    npc_1's intents with it:    hold_post, tend(npc_5), tend_wounded
    and a hole it did not have: uncovered(npc_1, no_action, tend(npc_5))
  the world is identical in both. The perspective is the whole
  difference, and the difference reaches all the way to a commitment.
  oracle: AGREE — one line in one agent's journal changes what that agent concludes, with the world unchanged

== 2. the loop the kernel would not close, and now does ======================
the obvious way to write this example is to make the world transition
rules too — `at[world](..) @next :- does[mind](..)`. Then sensing reads
at[world], deliberation reads sensing through `not`, and the transition
writes at[world]. That used to be refused: stratification was computed
on a graph that did not know a conclusion's TENSE, so a loop acyclic in
TIME read as a negative cycle. `not p` now means "p is not derivable in
THIS TICK", and a @next head contributes no same-tick edge.

  with the transition as @next rules:  load ok = true  
    and one tick later the world moved: E = npc_1, X = 2, Y = 1; E = npc_7, X = 3, Y = 1
  the SAME transition without @next:   load ok = false
    program rejected: unstratified[main](at), unstratified[main](does)
  the same program with no transition: load ok = true  
    and it derives: A = npc_1, Act = step

  the second line is the positive control, and it is one word away from
  the first: a kernel that had merely stopped checking would accept it
  too. The third is the other control — the arms must differ for a
  reason, not because all three failed for some fourth one.
  oracle: AGREE — the kernel closes the loop across a tick, still refuses it inside one, and the world it computes is right

== 3. intents are facts, and a plan is a fixpoint ============================
nothing here is a data structure inside an agent. A drive fires an
intent, an intent decomposes into a subgoal, a subgoal is an intent
again, and options are what an intent can reach. All of it is in the
store, so all of it has a derivation tree.

  20 intents at tick 1:
    intent[mind](npc_1, hold_post, 40)
    intent[mind](npc_10, drift, 10)
    intent[mind](npc_2, hold_post, 40)
    intent[mind](npc_3, hold_post, 40)
    intent[mind](npc_3, tend(npc_5), 70)
    intent[mind](npc_3, tend_wounded, 70)
    intent[mind](npc_4, drive_off(npc_8), 65)
    intent[mind](npc_4, hold_post, 40)
    intent[mind](npc_4, repel, 65)
    intent[mind](npc_5, hold_post, 40)
    intent[mind](npc_5, survive, 90)
    intent[mind](npc_6, hold_post, 40)
    intent[mind](npc_7, prowl, 20)
    intent[mind](npc_8, hunt, 80)
    intent[mind](npc_8, prowl, 20)
    intent[mind](npc_8, stalk(npc_4), 80)
    intent[mind](npc_8, stalk(npc_6), 80)
    intent[mind](npc_9, hunt, 80)
    intent[mind](npc_9, prowl, 20)
    intent[mind](npc_9, stalk(npc_6), 80)

  and the tree under one of them — the whole path from a drive in the
  table to a commitment to hit something:
    intent[mind](npc_4,drive_off(npc_8),65)  <= rf0022047 @tick 0
      subgoal[mind](npc_4,repel,drive_off(npc_8))  <= r8e9f7189 @tick 0
        intent[mind](npc_4,repel,65)  <= r98c1bebb @tick 0
          kind[world](npc_4,warden) [axiom]
          drive[world](warden,repel,65) [axiom]
          alive[mind](npc_4)  <= re30f15d7 @tick 0
            hp[world](npc_4,100) [axiom]
            100 > 0 [builtin]
          foe[mind](npc_4,npc_8)  <= r60334f52 @tick 0
            recalls[mind](npc_4,npc_8,wolf,8,2,hale,0)  <= r693c2c00 @tick 0
              saw[npc_4](npc_8,wolf,8,2,hale,0)  <= r92e1d2ea @tick 0
                spots[world](npc_4,npc_8,8,2)  <= ra4ebf83d @tick 0
                  in_range[world](npc_4,npc_8,8,2)  <= r42a89034 @tick 0
                    at[world](npc_4,7,2) [axiom]
                    at[world](npc_8,8,2) [axiom]
                    npc_4 != npc_8 [builtin]
                    sight[world](5) [axiom]
                    1 is +(*(-(8,7),-(8,7)),*(-(2,2),-(2,2))) [builtin]
                    1 <= 5 [builtin]
                  not screened[world](npc_4,npc_8,?0) [finite failure]
                kind[world](npc_8,wolf) [axiom]
                band[world](npc_8,hale)  <= r2120b832 @tick 0
    [... 94 more lines: a premise used twice is expanded twice]

== 4. the conflict, and the semiring that resolves it ========================
npc_4 stands next to npc_8. Two intents reach an act, and they do not
agree. The arbiter is a Viterbi fold over the support the kernel
already recorded: one factor per decomposition step, ⊕ = max over
alternative derivations of the same act.

    hold           from hold_post        0.4000
    strike(npc_8)  from drive_off(npc_8) 0.4225

  by hand from the drive table: repel 65 reaches strike in TWO steps
  (0.65 x 0.65 = 0.4225), hold_post 40 reaches hold in ONE (0.4000).
  chosen: strike(npc_8)
  oracle: AGREE — the fold reproduces the arithmetic of the drive table exactly

  THE POINT, and it is not that 65 > 40. Drop repel to 62 — still far
  above hold_post, priority ORDER unchanged — and the act flips,
  because two steps of 0.62 are worth less than one of 0.40:
    hold           from hold_post        0.4000
    strike(npc_8)  from drive_off(npc_8) 0.3844
  chosen at repel 62: hold
  oracle: AGREE — one priority moved from 65 to 62, the order unchanged, and the act flips

== 5. why, and why-not =======================================================
the most hated question in game AI is "why did it not do the obvious
thing". A behaviour tree cannot answer it in principle — you can see
which node ran, never why another did not. Here it is a query.

  whynot does[mind](npc_4,hold):
    rule r96cd669a: does[mind](?A,?Act)@now :- contender[mind](?A,?Act)@now, not preempted[mind](?A,?Act)@now
      failed premise: contender[mind](npc_4,hold)
        rule rbddff3de: contender[mind](?A,?Act)@now :- score[choice](?A,?Act,?V)@now, not beaten[mind](?A,?V)@now
          failed premise: not beaten[mind](npc_4,-916291) -- blocked: beaten[mind](npc_4,-916291) holds

  npc_3 can see npc_5 bleeding two cells away. Why is it not binding
  the wound? Not "which node ran" — which premise failed:
  whynot option[mind](npc_3,tend(npc_5),tend(npc_5)):
    rule r14f2c6fe: head does not unify
    rule r711dc729: head does not unify
    rule r9f03dfa8: head does not unify
    rule r6c3ca98d: head does not unify
    rule r81e6a4f6: head does not unify
    rule rc0f9db84: head does not unify
    rule r07feb580: head does not unify
    rule r13e81b69: option[mind](?A,tend(?B),tend(?B))@now :- intent[mind](?A,tend(?B),?_$0)@now, adjacent[mind](?A,?B)@now, in_sight[mind](?A,?B)@now
      failed premise: adjacent[mind](npc_3,npc_5)
        rule rabaa78a0: adjacent[mind](?A,?E)@now :- gap[mind](?A,?E,?D)@now, melee[world](?R)@now, ?D <= ?R
          failed premise: 4 <= 1 [builtin fails]

  and the spec's own example: an ally in range, unseen, and the thing
  in the way is NAMED rather than reported as a false:
  whynot in_sight[mind](npc_1,npc_5):
    rule rd855e15c: in_sight[mind](?A,?E)@now :- recalls[mind](?A,?E,?_$0,?_$1,?_$2,?_$3,?T)@now, now[world](?T)@now
      failed premise: recalls[mind](npc_1,npc_5,?_$0#0,?_$1#0,?_$2#0,?_$3#0,?T#0)
        rule r693c2c00: recalls[mind](?A,?E,?K,?X,?Y,?B,?T)@now :- saw[?A](?E,?K,?X,?Y,?B,?T)@now, not outdated[mind](?A,?E,?T)@now
          failed premise: saw[npc_1](npc_5,?_$0#0,?_$1#0,?_$2#0,?_$3#0,?T#0)
            rule r92e1d2ea: saw[?A](?E,?K,?X,?Y,?B,?T)@now :- spots[world](?A,?E,?X,?Y)@now, kind[world](?E,?K)@now, band[world](?E,?B)@now, now[world](?T)@now
              failed premise: spots[world](npc_1,npc_5,?_$1#0,?_$2#0)
                rule ra4ebf83d: spots[world](?A,?E,?X,?Y)@now :- in_range[world](?A,?E,?X,?Y)@now, not screened[world](?A,?E,?_$0)@now
                  failed premise: not screened[world](npc_1,npc_5,?_$0#3) -- blocked: screened[world](npc_1,npc_5,cart_3) holds
            rule r3e678ef4: saw[?A](?P,prop,?X,?Y,hale,?T)@now :- prop_in_range[world](?A,?P,?X,?Y)@now, now[world](?T)@now
              failed premise: prop_in_range[world](npc_1,npc_5,?_$1#0,?_$2#0)
                rule ra6f949c2: prop_in_range[world](?A,?P,?X,?Y)@now :- at[world](?A,?AX,?AY)@now, prop[world](?P,?X,?Y)@now, sight[world](?R)@now, ?D is +(*(-(?X,?AX),-(?X,?AX)),*(-(?Y,?AY),-(?Y,?AY))), ?D <= ?R
                  failed premise: prop[world](npc_5,?_$1#0,?_$2#0)
                    [depth limit 4 reached]
            rule rb95904f9: saw[?P](?E,?K,?X,?Y,?B,?T)@next :- saw[?P](?E,?K,?X,?Y,?B,?T)@now
              failed premise: saw[npc_1](npc_5,?_$0#0,?_$1#0,?_$2#0,?_$3#0,?T#0)
  [... 1 more lines: a premise used twice is expanded twice]
  oracle: AGREE — whynot names the premise that failed and the prop that blocked it

== 6. the run ================================================================
  8 ticks, 4773 ms

  tick  0  npc_1:hold npc_10:move(east) npc_2:hold npc_3:hold npc_4:strike(npc_8) npc_5:hold npc_6:hold npc_7:move(east) npc_8:strike(npc_4) npc_9:move(west)
          npc_4 struck npc_8 (65 hp left)
          npc_8 struck npc_4 (75 hp left)
  tick  1  npc_1:hold npc_10:move(west) npc_2:hold npc_3:hold npc_4:strike(npc_8) npc_5:hold npc_6:strike(npc_9) npc_7:move(east) npc_8:strike(npc_4) npc_9:strike(npc_6)
          npc_4 struck npc_8 (40 hp left)
          npc_6 struck npc_9 (65 hp left)
          npc_8 struck npc_4 (50 hp left)
          npc_9 struck npc_6 (75 hp left)
  tick  2  npc_1:hold npc_10:move(east) npc_2:hold npc_3:hold npc_4:move(east) npc_5:hold npc_6:strike(npc_9) npc_7:strike(npc_4) npc_8:move(east) npc_9:strike(npc_6)
          npc_4 tried move(east) and could not: somebody is there
          npc_6 struck npc_9 (40 hp left)
          npc_7 struck npc_4 (25 hp left)
          npc_9 struck npc_6 (50 hp left)
  tick  3  npc_1:hold npc_10:move(west) npc_2:hold npc_3:hold npc_4:move(east) npc_5:hold npc_6:move(east) npc_7:strike(npc_4) npc_8:move(north) npc_9:move(east)
          npc_7 struck npc_4 (0 hp left)
          npc_4 fell
  tick  4  npc_1:hold npc_10:move(east) npc_2:hold npc_3:hold npc_5:hold npc_6:move(west) npc_7:move(east) npc_8:move(west) npc_9:move(west)
  tick  5  npc_1:hold npc_10:move(west) npc_2:hold npc_3:hold npc_5:hold npc_6:move(east) npc_7:move(east) npc_8:move(east) npc_9:move(east)
  tick  6  npc_1:hold npc_10:move(east) npc_2:hold npc_3:hold npc_5:hold npc_6:move(west) npc_7:move(east) npc_8:move(west) npc_9:move(west)
  tick  7  npc_1:hold npc_10:move(west) npc_2:hold npc_3:hold npc_5:hold npc_6:move(east) npc_7:move(west) npc_8:move(east) npc_9:move(east)

  the yard at the end:
  y=5  W2 W3  . W5  .  .  .  . w9
  y=4   . W1 ##  .  .  .  .  . W6
  y=3 *10  . ##  .  .  .  .  . w8
  y=2   .  . ##  .  .  .  . w7  .
  y=1   .  .  .  .  .  .  .  .  .
         1  2  3  4  5  6  7  8  9

== 7. the frame budget =======================================================
  a full re-evaluation with nobody in the yard costs 1849 firings;
  with the ten agents in it at tick 1, 2401.

  a tick THOUGHT FROM COLD — a store restored at tick 3, whose derived
  layer has to be rebuilt from the base facts — costs 2920.

  the same tick at a frame budget of 1200 firings:
    partial: true
    hole(Id, budget_exhausted): $adhoc
    and what it reached anyway:  8 sightings for npc_4, 10 intents, 6 options

  the marker is a FACT and not a log line, so the next frame can read
  it. It cannot read it in the frame that wrote it — deriving
  thought_partial[audit] is itself a firing, and there were none left:
    thought_partial[audit] inside the exhausted frame: (none)
    thought_partial[audit] on the next evaluation:     $adhoc

  and the partial answer is still an answer: what it reached is in the
  store and queryable, and the marker says the rest was not reached
  rather than that there was no rest.
  oracle: AGREE — an exhausted frame budget yields a marked partial answer, not a hang and not rubbish

== 8. the hole, and the rule the agent writes for it =========================
  64 holes over 8 ticks, of two shapes:
    no_action      16  npc_3 tend(npc_5), npc_4 tend(npc_6), npc_6 tend(npc_4), npc_7 stalk(npc_4)
    unclassified   48  npc_1 npc_10, npc_10 npc_1, npc_10 npc_2, npc_10 npc_3, ...

  an uncovered situation is a FACT, not a fallback. npc_3 can see npc_5
  bleeding two cells away, holds the subgoal tend(npc_5), and no rule in
  the file reaches an act for it — so it says so and does something else.

  generalised from:
    npc_3 tend(npc_5)
    npc_4 tend(npc_6)
    npc_6 tend(npc_4)

    -- written by the agent at runtime, generalised from 15 holes of
    -- the shape uncovered(A, no_action, tend(B)): an ally that cannot be reached
    -- is one to walk towards, by the last place it was seen.
    option[mind](A, move(D), tend(B)) :- intent[mind](A, tend(B), _),
                                         step_to[mind](A, D, X2, Y2),
                                         recalls[mind](A, B, _, BX, BY, _, _),
                                         gap[mind](A, B, D0),
                                         D1 is (X2 - BX) * (X2 - BX) + (Y2 - BY) * (Y2 - BY),
                                         D1 < D0.

  THE HONEST BOUNDARY. Choosing that template is a generative step and
  the kernel does not perform it. What the kernel guarantees is that the
  rule is recorded as facts like any other, applied to the WHOLE PAST on
  the next evaluation, judged by boot.rofl's audits, and diffable. It
  does not guarantee the rule is sensible. Same boundary as JOPA: the
  model proposes, the kernel answers for consequences.

  applied to the past — the store as it was at tick 1, re-derived with
  the new rule in it:
    uncovered(npc_3, no_action, tend(npc_5)) at tick 1 before: true
    ... and after:                                            false
    options npc_3 now has for tend(npc_5): move(east)
  oracle: AGREE — a rule written after the run closes the hole in the store of tick 1

  and what it does to behaviour — the same 8 ticks, same start:
    npc_3 before: hold hold hold hold hold hold hold hold
    npc_3 after:  move(east) tend(npc_5) hold hold hold hold hold hold
    npc_5's hp at the end: 55 before, 95 after
    no_action holes: 16 before, 1 after
  oracle: AGREE — the new rule changes what the agent does and closes the holes it was generalised from

== 9. the rule set, diffed ===================================================
  rules in the head at tick 1: 99
  after the agent writes one:  100
  added:   r9cdce170
  removed: (none)
  kept:    99
  and the id recomputed from the text alone: r9cdce170
  oracle: AGREE — the diff of two store snapshots names exactly the rule the text hashes to

  examples/loot diffs two EDITIONS OF A PACK by hashing two texts; this
  diffs two SNAPSHOTS OF ONE HEAD by reading rule(R) out of the store.
  Same identity function, different source. LOOT's finding transfers
  and is not re-litigated: renaming a variable changes the id. Once,
  with a positive control, so that "no change" is a measurement:
    same rule, two variables renamed:   r0c86a060  DIFFERENT
    same rule, whitespace reflowed:     r9cdce170  SAME
  oracle: AGREE — a rename changes the rule id and a reflow does not — the control that makes the first half a measurement

== 10. time: restoring a tick, and when a thing was last derivable ===========
  ? does[mind](npc_4, strike(npc_8))
    held at ticks:     0, 1
    did not hold at:   2, 3, 4, 5, 6, 7
    last derivable at: 1
    and at tick 2 the reason it stopped:
      whynot does[mind](npc_4,strike(npc_8)):
        rule r96cd669a: does[mind](?A,?Act)@now :- contender[mind](?A,?Act)@now, not preempted[mind](?A,?Act)@now
          failed premise: contender[mind](npc_4,strike(npc_8))
            rule rbddff3de: contender[mind](?A,?Act)@now :- score[choice](?A,?Act,?V)@now, not beaten[mind](?A,?V)@now
              failed premise: not beaten[mind](npc_4,-861566) -- blocked: beaten[mind](npc_4,-861566) holds

  the restoration is not a replay of a log: Store.restore comes back
  dirty, so the derived layer is recomputed from the base facts. That is
  what lets §8 apply a rule written after the run to the store of tick 1.
    store restored at tick 3: tick = 3, 10 agents, 24 entries in npc_3's journal
  oracle: AGREE — a restored tick re-derives rather than replays, and the scan agrees with the run

== 11. memory, and acting on a memory ========================================
  28 stale beliefs over the run (a belief whose sighting is older
  than the current tick). The oldest of them:
    tick 6: npc_4 still places npc_6 where it was 3 ticks ago
    tick 6: npc_4 still places npc_7 where it was 3 ticks ago
    tick 6: npc_4 still places npc_8 where it was 3 ticks ago
    tick 6: npc_6 still places npc_4 where it was 3 ticks ago
    tick 6: npc_7 still places npc_4 where it was 3 ticks ago
    tick 6: npc_8 still places npc_4 where it was 3 ticks ago

  this is not a defect to be fixed. It is the only honest thing a fog of
  war can produce, and it is why `recalls` carries the tick it was
  stamped with rather than pretending to be the world.

== 12. throughput, whatever it is ============================================
  measured at the TOP of this program, on a cold heap, before anything
  else allocated — and the reason for that is measured too, below.

  snapshots off                                   4571 ms    571 ms/tick  1.8 ticks/s
  snapshots off, provenance pruned each tick      2575 ms    322 ms/tick  3.1 ticks/s
  snapshots on                                    4604 ms    576 ms/tick  1.7 ticks/s

  AND IT IS NOT A CONSTANT, which the average hides. The first tick and
  the last are the numbers a frame budget would have to live with:

    tick      ms  ticks/s    facts  derived
       0     363      2.8     5022     3187
       1     422      2.4     6950     5051
       2     545      1.8     9066     7094
       3     480      2.1    11205     9175
       4     564      1.8    13161    11097
       5     676      1.5    15412    13308
       6     681      1.5    17627    15487
       7     789      1.3    19977    17798

  2.8 ticks per second at the first tick, 1.3 at tick 7, ten agents throughout.
  That is the honest headline and it is not a good number.

  WHERE THE FACTS COME FROM, since the answer is not the yard. What
  grows between tick 1 and tick 4, counted by relation:
    derived_by       +5963
    saw              +103
    outdated         +99
    asserted_by      +29
    in_perspective   +29

  `derived_by` is the kernel's own provenance — one fact per firing —
  and `advanceTick` freezes it so a completed tick keeps its record.
  That is a deliberate guarantee and it is also the cost curve: every
  fold, the arbiter's included, walks the whole store. The second
  benchmark row is that claim measured from the other side: dropping the
  provenance of completed ticks takes the run from 4571 ms to 2575 ms, a factor of 1.78.

  Which is the honest shape of the trade. Keeping the reasons is the
  point of the whole system, and keeping them is what makes tick 8 cost
  what tick 1 did not. A game would prune, and would then be a game
  that cannot say why its NPC did anything three seconds ago.

  AND THE METHOD, measured rather than asserted. The first row above was
  taken on a cold heap. Here is the identical run, taken now, after this
  transcript has built four worlds and retained sixteen snapshots:
    same run, cold heap:  4571 ms
    same run, right now:  4589 ms  (x1.00)
  a throughput number taken at the end of a demo is a number about the
  demo's heap. That is why the benchmark runs first.
  oracle: AGREE — pruning completed-tick provenance is measurably the cost curve, not a guess

== 13. counting across ticks, and what a cycle is a cycle IN =================
  a carry rule makes every carried fact its own support one tick back,
  and that self-loop used to meet the CLOSED counting semiring: star(one)
  is INFINITE, so past tick 0 the count of anything downstream of memory
  was "infinitely many" — a correct answer to a question nobody asked.
  The fold is about ONE tick now, on the same principle that fixed the
  meaning of `not p`: a fact that arrived over the boundary is a GIVEN
  in the tick that reads it, so the edge back is not walked.

  store                    finite  infinite  on a cycle  in memory
  tick 0, nobody in it       2785       233          26          0
  tick 3 of the run         10048       233          26          0
  still INFINITE, e.g. reach[main](any_option,adjacent), reach[main](any_option,alarm), reach[main](any_option,alive)

  the clock no longer moves the last three columns, and the fold has not
  gone blind to cycles: what stays INFINITE is boot.rofl's own closure
  (reach/stratum), a cycle inside ONE tick, which is what the number is
  for. examples/oops now agrees fact for fact between its ticked store
  and its as-of one. NPC could not route around this — restoring a tick
  is one of the things it is for — and no longer has to.
  oracle: AGREE — the clock does not change what is countable, and what stays INFINITE is a cycle inside one tick

== 14. the oracles ===========================================================
  AGREE     one line in one agent's journal changes what that agent concludes, with the world unchanged
  AGREE     the kernel refuses the closed sense-act loop and accepts the same program opened
  AGREE     the fold reproduces the arithmetic of the drive table exactly
  AGREE     one priority moved from 65 to 62, the order unchanged, and the act flips
  AGREE     whynot names the premise that failed and the prop that blocked it
  AGREE     an exhausted frame budget yields a marked partial answer, not a hang and not rubbish
  AGREE     a rule written after the run closes the hole in the store of tick 1
  AGREE     the new rule changes what the agent does and closes the holes it was generalised from
  AGREE     the diff of two store snapshots names exactly the rule the text hashes to
  AGREE     a rename changes the rule id and a reflow does not — the control that makes the first half a measurement
  AGREE     a restored tick re-derives rather than replays, and the scan agrees with the run
  AGREE     pruning completed-tick provenance is measurably the cost curve, not a guess
  AGREE     the clock does not change what is countable, and what stays INFINITE is a cycle inside one tick

13/13 agree.
(37837 ms)
```
