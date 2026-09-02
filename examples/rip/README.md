# RIP — Rest In Peace

**Why tasks die in a dead letter queue, and which ones will be next.**

A DLQ is a graveyard. Every system that talks to unreliable providers has one,
and nobody asks it the only question worth asking: *what do these tasks have in
common, and which class of task will land here tomorrow.*

This example answers that question about a synthetic order workflow —
reserve, charge, ship, with compensation — and the answer has **three**
categories, not two:

| category | states | meaning |
|---|---:|---|
| **settles** | 77 | there is a strategy: whatever the providers do, the books balance |
| **doomed** | 32 | the environment can *force* them not to. A bug to fix, not a task to retry |
| **dead letter** | 24 | neither is derivable. The play can go on for ever, so it depends on luck |

The third one is the product, and it is **not a value the engine computes**. It
is the complement of the fixpoint: the states for which neither "will get
through" nor "will not" can be derived. That is the population of the dead
letter queue, and this is the first example in the corpus that can say so.

## How to run

```sh
node --experimental-strip-types examples/rip/demo.ts        # the transcript below
node --experimental-strip-types --test test/example-rip.test.ts
```

## What it shows

| the spec asks for | where |
|---|---|
| a synthetic machine, non-idempotent stages, compensations | `rip.rofl` §2, transcript §2 |
| an environment model: success, failure, timeout, silence, failure *after* the effect | `rip.rofl` §2.1, transcript §2 |
| the AND/OR fixpoint, universal quantifier over the answers | `rip.rofl` §3, transcript §4 |
| three categories, the third marked as non-derivability | `rip.rofl` §3, transcript §4–6 |
| a failure simulator, empirical stuck states, cross-checked | `demo.ts`, transcript §10–11 |
| discrepancies discussed **by name** | transcript §11 |
| best-derivation as an executable test | transcript §8, pinned by the test |
| counting as a fragility metric | transcript §7 |

## The one property no other example has

Every other example in this repository accumulates facts monotonically. This
one alternates quantifiers:

> a state settles if there **exists** an action such that **all** of the
> environment's answers lead to states that settle.

A rule language has no universal quantifier over an open set, so the universal
is written as the negation of an existential — and that is the whole
difficulty:

```prolog
will_settle(S) :- settled(S).
will_settle(S) :- action(S, A), not risky(S, A).
risky(S, A)    :- respond(S, A, _, S2), not will_settle(S2).
```

`will_settle` depends on itself through **two** negations. The ordinary
phase-ordered evaluator is right to refuse that program: the stratum number
does not exist inside a negative cycle, and `boot.rofl`'s own rule for it
diverges trying to compute one. `semantics(well_founded).` swaps the phase
ordering for an alternating fixpoint, and the states the two limits disagree
about come back as `unknown(will_settle(S))`.

Both halves of that are checked. Delete the declaration and the same file is
**refused**, at every budget above 2 000 steps:

```
program rejected: unstratified[main](risky), unstratified[main](will_settle)
```

Keep it, and `unstratified/1` still reports the cycle — as *information about
the program* rather than a verdict on it. Those two relations are the AND and
the OR of the game. They are supposed to depend on each other through negation.

## The machine

```
  reachable states: 133      transitions: 389      slack: 2 misbehaviours
    reserve 7   charge 12   ship 23   verify 7   track 14   refund 23   release 19   fulfilled 8   cancelled 4   abandoned 16
```

A task is `w(At, T, D, R, C, Sh, F)`: where it is, how many attempts it has
spent, whether it is unsure, whether it holds a reservation, how many times
money has actually moved, how many parcels have actually gone out, and how much
misbehaviour the environment has left.

`At`, `T` and `D` are the workflow's own bookkeeping. **`R`, `C` and `Sh` are
the world, and the workflow is not told them** — that gap is the subject, and
§12 measures whether the answer depends on closing it.

### The five environment behaviours, and why each is a different behaviour

```
    stage     provider    idempotent  answers
    reserve   inventory   yes         fail, lost, ok, timeout
    charge    payments    NO          fail, lost, ok, timeout
    ship      carrier     NO          fail, lost, ok, silence, timeout
    verify    payments    NO          fail, ok, timeout
    track     carrier     NO          fail, ok, silence, timeout
    refund    payments    yes         fail, lost, ok, timeout
    release   inventory   yes         fail, lost, ok, timeout
```

Five names are only five behaviours if each leaves a different mark. From one
charge state:

```prolog
respond(w(charge,0,0,1,0,0,2), call, ok,      w(ship,  0,0,1,1,0,2)).  -- moved on, no doubt
respond(w(charge,0,0,1,0,0,2), call, fail,    w(charge,1,0,1,0,0,1)).  -- attempt spent, no doubt
respond(w(charge,0,0,1,0,0,2), call, timeout, w(charge,1,1,1,0,0,1)).  -- attempt spent, DOUBT
respond(w(charge,0,0,1,0,0,2), call, lost,    w(charge,1,1,1,1,0,1)).  -- the money moved
```

`timeout` and `lost` produce states with the **same observation** — same stage,
same attempt count, same doubt — and different worlds. That indistinguishability
is the entire example. `silence` is the fifth: nothing came back at all, no
attempt was consumed, the environment spent none of its budget, and the state is
unchanged except for the doubt. It is a genuine self-loop:

```prolog
respond(w(ship,0,1,1,1,0,2), call, silence, w(ship,0,1,1,1,0,2)).
```

### Idempotence is in the transitions, not in a label

`idempotent/1` is reporting only. What does the work is that an idempotent
stage's `ok` does not depend on what already landed:

```prolog
respond(w(reserve,1,1,1,0,0,1), call, ok, w(charge,0,0,1,0,0,1)).   -- still ONE reservation
respond(w(charge, 1,1,1,1,0,0), call, ok, w(ship,  0,0,1,2,0,0)).   -- TWO charges
```

Retrying a non-idempotent stage is not an edge back into the same state. It is
an edge into a **new** state with the side effect accumulated, and that is where
the adversarial structure comes from: the environment can answer `lost` after
the effect has landed but before anyone knows, and the retry then charges twice.

## The gate the machine carries

An action with no answers would be **vacuously safe** — `risky` needs an answer
to fire — so an unanswerable action makes `will_settle` true for free. That is
a soundness hole in the *model*, not in the kernel, and `dangling/2` is the gate
that names it. It is empty in the baseline, and a gate that never fires is an
assumption with a gate's interface, so the demo makes it fire:

```
    limit(charge, 2)  ->  1 rows, e.g. A = call, S = w(charge,2,1,1,2,0,0)
```

A third charge has no `ok` successor, because the model caps the money counter
at two. The gate names the state rather than letting it read as safe.

## The three categories, and how the third one is earned

```
   category      states  what it means
   settles           77  a strategy exists: whatever the providers do, the
                         books balance in the end
   doomed            32  the environment can FORCE them not to. A bug to fix,
                         not a task to retry
   dead letter       24  neither is derivable. The play can go on for ever,
                         so it depends on luck
   total            133  and the three are disjoint and cover the machine
```

**Where the dead letters are:** all twenty-four at `ship` or `track`, and every
single one with the doubt flag set. A dispatch that may already have gone out,
and a carrier that has stopped answering. Nothing else in this machine is
undecidable.

**`doomed` does not mean "no route home".** Two of the thirty-two doomed states
still have a lucky sequence of answers that gets them to a settled terminal. A
run from one of them can finish perfectly well. What the verdict says is that a
provider *which wants it to fail* can make it fail — so the fix is the policy,
not another retry.

### The third value is a proper part, checked from both sides

An answer where nothing is ever unknown proves nothing, and neither does one
where everything is. So the undefined set is pinned as a proper, non-empty part
of the machine **and** against the same program with its cause removed:

```
    baseline                       24 dead letter    130 unknown rows
    carrier cannot go quiet         0 dead letter      0 unknown rows   (123 reachable states)
```

Take away the one behaviour that costs the environment nothing and there is no
infinite play left, so the alternation's two limits meet with nothing between
them. The negative cycle is still there — the declaration is still required —
and it simply has no consequences.

The other direction is the sharper one, because it could have gone either way.
Let the **payment gateway** go quiet as well:

```
    the payment gateway goes quiet too    24 dead letter    130 unknown rows   (137 reachable states)
```

Four more states in the machine and **not one more dead letter** — the same
twenty-four, not merely the same count. Silence alone is not the ingredient.
At the charge stage the workflow has somewhere else to go — abort into the
refund, or ask the gateway what happened — so the exists-quantifier finds a safe
move and never has to look at the silent one. At the shipping stage with the
doubt flag up there is no abort, and the probe inherits the same silence.
**Silence plus no alternative** is what makes a dead letter, and the two runs
separate the two ingredients.

### And it is not the budget

```
    budget 20 000     ok=true   unknown rows 0   hole budget_exhausted   partial true
    budget 20 000 000   ok=true   unknown rows 130   hole (none)   partial false
```

A run that was cut short is not a run that came back undecided. Two different
words for two different situations, which is the whole reason the third value
had to be *derived* rather than subtracted.

## Why is this one undefined

```
unknown[main](will_settle(w(ship,0,1,1,1,0,2)))  <= r70d8af2b @tick 0
  action[main](w(ship,0,1,1,1,0,2),call) [axiom]
  not risky[main](w(ship,0,1,1,1,0,2),call) [undefined]
    unknown[main](risky(w(ship,0,1,1,1,0,2),call))  <= r25915533 @tick 0
      respond[main](w(ship,0,1,1,1,0,2),call,fail,w(ship,1,1,1,1,0,1)) [axiom]
      not will_settle[main](w(ship,1,1,1,1,0,1)) [undefined]
        unknown[main](will_settle(w(ship,1,1,1,1,0,1)))  <= r70d8af2b @tick 0
          action[main](w(ship,1,1,1,1,0,1),call) [axiom]
          not risky[main](w(ship,1,1,1,1,0,1),call) [undefined]
            unknown[main](risky(w(ship,1,1,1,1,0,1),call))  <= r25915533 @tick 0
              respond[main](w(ship,1,1,1,1,0,1),call,fail,w(ship,2,1,1,1,0,0)) [axiom]
              not will_settle[main](w(ship,2,1,1,1,0,0)) [undefined]
                unknown[main](will_settle(w(ship,2,1,1,1,0,0)))  <= r70d8af2b @tick 0
                  action[main](w(ship,2,1,1,1,0,0),check) [axiom]
                  not risky[main](w(ship,2,1,1,1,0,0),check) [undefined]
                    unknown[main](risky(w(ship,2,1,1,1,0,0),check))  <= r25915533 @tick 0
                      respond[main](w(ship,2,1,1,1,0,0),check,none,w(track,2,1,1,1,0,0)) [axiom]
                      not will_settle[main](w(track,2,1,1,1,0,0)) [undefined]
                        unknown[main](will_settle(w(track,2,1,1,1,0,0)))  <= r70d8af2b @tick 0
                          action[main](w(track,2,1,1,1,0,0),call) [axiom]
                          not risky[main](w(track,2,1,1,1,0,0),call) [undefined]
                            unknown[main](risky(w(track,2,1,1,1,0,0),call))  <= r25915533 @tick 0
                              respond[main](w(track,2,1,1,1,0,0),call,silence,w(track,2,1,1,1,0,0)) [axiom]
                              not will_settle[main](w(track,2,1,1,1,0,0)) [undefined]
                                unknown[main](will_settle(w(track,2,1,1,1,0,0))) [cycle]
unfounded set: risky[main](w(ship,0,1,1,1,0,2),call), risky[main](w(ship,1,1,1,1,0,1),call), risky[main](w(ship,2,1,1,1,0,0),check), risky[main](w(track,2,1,1,1,0,0),call), will_settle[main](w(ship,0,1,1,1,0,2)), will_settle[main](w(ship,1,1,1,1,0,1)), will_settle[main](w(ship,2,1,1,1,0,0)), will_settle[main](w(track,2,1,1,1,0,0))
```

Read it as a script and it is one: ship fails, ship fails again, the attempt
budget is gone so the workflow asks the carrier what happened, and the carrier
says nothing — for ever. The tree closes on `[cycle]` rather than walking the
loop, and names the **unfounded set**: the atoms whose only derivation needs to
assume themselves.

That is the difference between the third value and a leftover. A premise that
never settled prints `[undefined]`, not `[finite failure]`; a state that settles
explains itself the old way, through facts and finite failure, and names no
unfounded set at all.

**The third value is a value, and rules read it.** `dead_letter/1` is an
ordinary rule matching `unknown(will_settle(S))`, and the duality shows: for
every dead letter, `doomed` is undefined too. Neither direction is derivable,
which is what "depends on luck" means when it is said precisely.

## Counting: how many ways home, and one is fragile

`can_settle(S)` is true where *some* play from `S` ends with the books balanced
— luck, not strategy. The counting semiring folded over its support says how
many such plays there are, and **one** is the number that matters: a task with a
single route home dies the day that route stops being possible, and no test
fails when it does.

`w(charge,2,0,1,0,0,0)` is one of them — out of charge attempts, out of slack,
with exactly one sequence left: abort, refund, release.

Where a silence loop is on the way the count is *infinitely many*, and that is
checked as a divergence rather than asserted. Refuse to close the cycle and
count derivations of height at most *n*:

```
    height at most      w(ship,0,1,1,1,0,2)   a one-route state
       6                                       109                   1
       8                                       692                   1
      10                                      3426                   1
      12                                     14457                   1
```

One column grows without settling and the other does not. That is what an
unbounded number of derivations looks like from below, and it is the positive
control for the word INFINITE.

## Best derivation: a reproducing trace, and it executes

The tropical fold priced every derivation of `reached/1`. Walking down it and
choosing at each step the firing whose cost *is* that number reads the argmin
back out of the support the engine already recorded — not a search, and not a
story told about the answer afterwards. What comes out is a script:

```
    step  where                        the workflow   the provider
       1  w(reserve,0,0,0,0,0,2)       call           fail
       2  w(reserve,1,0,0,0,0,1)       call           ok
       3  w(charge,0,0,1,0,0,1)        call           lost
       4  w(charge,1,1,1,1,0,0)        call           ok
       5  w(ship,0,0,1,2,0,0)          call           ok
       6  w(fulfilled,0,0,0,2,1,0)
```

Read it in English: the inventory call fails once and succeeds on the retry;
the charge **lands and the answer is lost**; the workflow, believing nothing
happened, charges again; the parcel ships. The order is fulfilled and the
customer has paid twice, and nothing in the machine can bring the money back,
because the workflow never learned that the first charge landed.

`test/example-rip.test.ts` pins that script line for line and then **hands it to
the simulator**, which shares no transition code with the engine:

```
    replay -> w(fulfilled,0,0,0,2,1,0)   REPRODUCED — every step of the script exists in the simulator
    settled? false
```

The control matters as much as the result: a script with one answer altered is
*rejected* by the same replay, so "reproduced" is a measurement and not a
formality.

## The policy, one line at a time

Nothing below the `-- @machine` marker mentions a retry count. So a policy
change is a line, and what it is worth is a number:

```
    policy                              states  settles  doomed  dead letter
    baseline                               133       77      32           24
    no verify probe for the charge         126       65      37           24
    no probes at all                       108       65      41            2
    reserve may abort under doubt          137       85      28           24
    no stage needs certainty               160      101      44           15
    refund gets the forward budget         133       65      42           26
```

**Deleting `probe_of(charge, verify)` costs twelve states their guarantee**, and
every one of them is at the charge stage with the doubt flag set — the exact
states where a retry might charge twice. Asking the provider before repeating a
non-idempotent call is the defence, and the model says how much it is worth.

**And one line the other way.** `abort_needs_certainty(reserve)` — *only
compensate when you know where you stand* — sounds prudent and costs eight
states: four at the reserve stage itself, and four in the release it would have
aborted into.

```
      w(release,0,1,0,0,0,0)
      w(release,0,1,0,0,0,1)
      w(release,0,1,1,0,0,0)
      w(release,0,1,1,0,0,1)
      w(reserve,1,1,0,0,0,1)
      w(reserve,1,1,1,0,0,1)
      w(reserve,2,1,0,0,0,0)
      w(reserve,2,1,1,0,0,0)
```

Reserving is idempotent, so the doubt is harmless there and the rule is pure
loss. The policy has no idea which stages are idempotent. The model does.

## The fairness assumption, said out loud

An environment that may misbehave for ever defeats every workflow: it answers
`fail` to every attempt of every stage including the compensation, and then
nothing is guaranteed and the analysis says "no strategy exists" about a
perfectly healthy machine. The assumption real reliability work makes instead is
that providers *eventually* behave. That is a liveness property, and a finite
AND/OR fixpoint cannot express it.

What it can express is a bound: **`slack(2)` — the environment may misbehave at
most twice over the whole run.** It is strictly weaker than fairness and it is
the honest one, because it is a number the reader can move:

```
    slack   states   settles   doomed   dead letter   alternations
        0       14         9        3             2              5
        1       56        36       10            10              6
        2      133        77       32            24              8
        3      238       100       94            44             10
```

A more patient adversary reaches more of the machine and settles less of it.
Note the degenerate control at `slack(0)`: a provider that never misbehaves at
all **still leaves two dead letters**, because silence costs it nothing. Silence
is not misbehaviour, it is the absence of an answer — which is exactly why the
third category survives a bounded budget, and why it is the one pathology a
retry budget cannot buy its way out of.

## The oracle: every claim decided a second time

The machine is re-derived in plain TypeScript from the domain description — a
switch over stages, no rules, no engine — and the three regions are computed by
the two textbook attractors: the workflow's, a least fixpoint over *some action,
all answers*; and the environment's, a least fixpoint over *all actions, some
answer*. Neither is an alternating fixpoint, so the gap between them is an
independent prediction of what the engine must report as undefined.

```
    states compared:                133   disagreements: 0
    transitions compared:           389   disagreements: 0
    settled terminals:                6   disagreements: 0
    verdicts compared:              133   disagreements: 0
    can_settle compared:            133   disagreements: 0
    states in two categories:         0   states in none: 0
```

The oracle's own positive control, because a comparison that cannot see a
difference agrees with anything: take a state whose guarantee rests on one
action and point one of that action's answers at a state the environment already
wins from —

```
    w(charge,2,0,1,0,0,0) keeps only `abort`; one answer now lands in w(abandoned,0,0,0,0,0,0)
    winning region 77 -> 72, and w(charge,2,0,1,0,0,0) is out of it.
```

## The simulator, and the discrepancies BY NAME

Three environments, every non-terminal state played from, a step cap of 60.
`random` and `flaky` draw from fixed distributions; `adversarial` is a fixed
malicious preference order — silence, then lost, then timeout, then fail, then
ok — which knows nothing about the analysis and is therefore evidence rather
than a restatement of it.

**A run that hits the cap is `capped`, and capped is its own category.** It is
the simulator's budget hole, and merging it into "failed" is exactly what would
hide the subject — the same distinction the kernel keeps between
`hole(Id, budget_exhausted)` and `unknown`.

```
    environment   settled   failed    capped    states capped
    random           10425      2175         0         0
    flaky            10269      2331         0         0
    adversarial         49         8        48        48
```

The comparison is a **derived relation in the model**, not a diff in TypeScript.
The simulator files its journal into its own ledger, `[sim]`, and `crosscheck/3`
joins it against `verdict/2`:

```
    agrees_forced_and_observed                    22 rows
    dead_letter_never_observed                    48 rows
    forced_but_never_seen                          4 rows
    policy_hangs_where_a_strategy_exists          20 rows
```

Four rows, four names, and the rest of this section is what each one is. **A
table of rates would say the two agree 94% of the time and destroy exactly what
the comparison is for.**

### 1. `dead_letter_never_observed` — 48 rows

Twenty-four dead letters, two non-adversarial environments, and **not one run
ever hung in any of them.** This is the discrepancy that justifies doing the
analysis at all, and it has an exact size:

```
    200 000 random runs -> 173100 settled, 26900 failed, 0 capped.
```

A random provider answers `silence` with weight 8 in 100 and the cap is 60
steps, so a hanging run needs a run of silences of probability around 1e-40. A
million runs will never see it; a billion will not either. The static answer
finds it without running anything.

Under the malicious provider the same twenty-four states hang on the first run.
The pathology is real. Sampling is the wrong instrument for it.

### 2. `policy_hangs_where_a_strategy_exists` — 20 rows

The model says a strategy exists and **the policy hangs in that state anyway**,
because it is not playing that strategy. Replaying the run step by step gives
the exact move where the two part company:

```
    state the run started from    parts company at              plays   certified
    w(charge,0,0,1,0,0,1)         w(ship,0,0,1,1,0,0)           call    abort
    w(ship,0,0,1,1,0,1)           w(ship,0,0,1,1,0,1)           call    abort
    w(ship,0,0,1,1,0,2)           w(ship,0,0,1,1,0,2)           call    abort
    w(ship,0,0,1,2,0,0)           w(ship,0,0,1,2,0,0)           call    abort
    w(ship,0,0,1,2,0,1)           w(ship,0,0,1,2,0,1)           call    abort
    w(ship,1,0,1,1,0,0)           w(ship,1,0,1,1,0,0)           call    abort
    w(ship,1,0,1,1,0,1)           w(ship,1,0,1,1,0,1)           call    abort
    w(ship,1,0,1,2,0,0)           w(ship,1,0,1,2,0,0)           call    abort
```

Eight distinct moves and every one of them is the same mistake: at the shipping
stage the policy calls the carrier, and the certificate says **do not** — cancel
the order instead, because a carrier that can go quiet cannot be made to
deliver. That is an unwelcome answer and it is the correct one, and no amount of
retrying discovers it.

This row is not a defect in the model and not a defect in the simulator. It is a
defect in the deployed policy, named per state, with the move to change.

### 3. `forced_but_never_seen` — 4 rows

The model says the environment *can* force failure; a random provider is not
trying to. Not a disagreement about the facts: `doomed` is a claim about an
adversary, and these four rows measure how far a benign provider is from being
one.

### 4. `agrees_forced_and_observed` — 22 rows

The agreement, kept as its own row on purpose. A comparison that can only report
trouble is not a comparison, and twenty-two states where the model said "the
environment can force this" and every single run failed are what the other three
rows have to be read against.

## Two books, and one writer each

The simulator's journal is a **ledger**, and it passes the litmus of
`docs/choosing-perspectives.md` without argument: the fixpoint and the simulator
can legitimately disagree about one state and neither entry is an error; the
book is observed rather than computed; it says whose entry this is, not how the
entry was obtained; and its writer is nameable and single.

```prolog
authority(sim, simulator).
imports(main, sim).
imports(audit, sim).
```

The obvious first draft — `outcome(simulator, S, capped)` with the source as an
argument column — loses all of that, and above all it loses `forged`. File a run
under the simulator's name as somebody else:

```
      $fact(sim_capped,sim,$cons(random,$cons(w(ship,0,1,1,1,0,2),$nil)))
```

Nothing in `rip.rofl` mentions forgery. Who filed a run is the load identity
checked against `authority`, not a column anybody could fill in.

The `leak[audit]` row is empty because two crossings are **declared**, not
because the audit is asleep. Plant a third source — an incident feed nobody
declared — and it appears, named:

```
      leak[audit](vendor, audit)
      leak[audit](vendor, main)
```

## Can the certified strategy be implemented

The fixpoint quantifies over actions per **state**, and a state carries what the
workflow cannot see. So the certificate it produces may branch on hidden
information, and a guarantee that needs information the workflow does not have
is not a guarantee any deployed policy can offer. The honest thing is to measure
it rather than hope:

```
    winning non-terminal states:              71
    distinct observations among them:         23
    observations with one action safe in every state:     23
    observations that need hidden information:             0
```

Zero — and that is a result rather than a relief. Every guarantee the fixpoint
certifies for this machine can be played by a workflow that knows only its own
stage, its own attempt counter, and whether it is unsure.

The control, because a check that cannot say no says nothing: blind the workflow
further, let it see only which stage it is at, and the same check starts
objecting —

```
      observations: 6   needing information the workflow does not have: 1
        at charge     12 winning states, no single action safe in all of them
```

So the zero above is a measurement of a machine, not of a check that never
fires; and it is what makes §11's hanging runs a fact about the deployed policy
rather than about the certificate.

## One file, two constructions

`rip.rofl` is one program, and its machine half is stratified — it loads under
the ordinary semantics with no declaration at all. Only the game half needs the
alternation. So the same answer can be had two ways, and the demo builds both:

```
    whole file, one store:       77 settles   32 doomed   24 dead letter
    machine dumped, game alone:  77 settles   32 doomed   24 dead letter
    identical: true
```

The staged build exists for the why-tree above and not for speed. With the
machine **asserted**, a why-tree over the game shows the game. With the machine
derived, the same tree walks the reachability proof first — which is true, and
unreadable.

## Prior art, honestly

This is model checking. TLA+, SPIN, and games on graphs are a huge and mature
field, and no scientific novelty is claimed. The gap this fills is a **product**
gap: to apply TLA+ you have to rewrite your process in TLA+, which is why almost
nobody does. "Your existing state machine, no new language, the answer as a
derivation tree and a ready test case" is not new science; it is a missing tool.

The three-valued semantics is Van Gelder, Ross and Schlipf's well-founded
semantics, and the alternating fixpoint is Van Gelder's. What is this example's
own is only the observation that **the third value is the dead letter queue** —
that the states a workflow will get stuck in are exactly the ones for which
neither outcome is derivable, and that a rule engine which can say so hands you
the class rather than the incident.

## What could NOT be modelled

**Fairness.** The real assumption is "a provider that is called infinitely often
eventually answers", which is a liveness property over infinite plays — a
Streett or parity condition, not a reachability game. A Datalog AND/OR fixpoint
cannot express it. `slack(N)` is the finite approximation, every verdict in this
file is relative to it, and the sweep above is the only honest way to present
that.

**Probability.** Nothing here is a rate. The model says *possible* and
*forceable*; it never says *likely*. That is the right division of labour — the
simulator says likely, and §11 is precisely the place where "possible but
astronomically unlikely" turns out to be the finding — but it does mean this
analysis cannot rank two dead-letter classes by how many tasks will actually
land in them. The Viterbi semiring in `runtime/semirings.ts` could carry a
probability through the machine; it cannot carry one through the *alternation*,
because the third value is not a number.

**Imperfect information, properly.** The fixpoint chooses an action per state,
including states the workflow cannot tell apart. §12 measures whether that
mattered and finds it did not — for **this** machine, at **this** slack. That is
a measurement, not a theorem: a machine where the classes split would need a
genuine imperfect-information game, whose solution is exponential in the state
space and undecidable for the general infinite-horizon case.

**Unbounded counters.** Money and parcels are capped at two, attempts at three.
The cap merges "two" with "more than two", which is sound for a verdict that
only distinguishes "exactly one" from "not exactly one", and lossy for anything
that wants the actual count. `dangling/2` is what stops the cap from silently
becoming a hole in the analysis, and the demo makes it fire to prove it can.

**Time.** There is no clock. A retry budget stands in for a backoff schedule, and
a state that is one attempt from exhaustion is treated the same whether that
attempt comes in a second or a week. A DLQ in production is full of tasks that
timed out because a deadline passed, not because a counter ran out, and nothing
here can say that.

**Extracting the machine from real code.** The transitions here are written by
hand. Deriving them from an existing workflow implementation is the generative
step and the kernel does not do it — the same boundary JOPA meets translating a
statute and NPC meets generalising a hole: **the kernel guarantees consequences,
not translation.** It is softer here than anywhere else in the corpus, because
the translation is checkable: §10 re-derives the whole machine independently and
compares it transition by transition, and §11 runs it.

## The transcript

Real output of `node --experimental-strip-types examples/rip/demo.ts`, pasted
verbatim. Everything quoted above comes from it.

```
RIP — Rest In Peace: why tasks die in a dead letter queue, and which are next.

── 1. the model loads, and boot.rofl audits it ───────────────────────────
  ? malformed[audit](R)                -> 0 rows
  ? breach[audit](R)                   -> 0 rows
  ? leak[audit](A, B)                  -> 0 rows
  ? forged[audit](F)                   -> 0 rows
  ? unmoded[audit](R)                  -> 0 rows
  ? undefined_premise[audit](R, Rel)   -> 0 rows
  ? unstratified(X)                  -> risky, will_settle
    AND THAT IS THE POINT, not a warning to silence. Under the alternation the
    cycle is INFORMATION about the program rather than a verdict on it: the two
    relations named are the AND and the OR of the game, and they are supposed to
    depend on each other through negation.
  rules not range-restricted: 0
  relations evaluated top-down: 0
  facts in the store: 6646
  ledgers: audit, sim

  Two crossings are declared here and both are exercised, so the empty row above
  is a declaration doing its job and not an audit switched off. Plant a THIRD
  source — an incident feed nobody declared — and the row appears, named:
      leak[audit](vendor, audit)
      leak[audit](vendor, main)
  It disappears when the rule is removed, and it would disappear as soon as
  somebody wrote `imports(main, vendor)` — which is the sentence the audit is
  asking for rather than an obstacle to route around.

── 2. the machine, and the gate that says no ─────────────────────────────
  reachable states: 133      transitions: 389      slack: 2 misbehaviours
    reserve 7   charge 12   ship 23   verify 7   track 14   refund 23   release 19   fulfilled 8   cancelled 4   abandoned 16

  what the environment may answer, per stage:
    stage     provider    idempotent  answers
    reserve   inventory   yes         fail, lost, ok, timeout
    charge    payments    NO          fail, lost, ok, timeout
    ship      carrier     NO          fail, lost, ok, silence, timeout
    verify    payments    NO          fail, ok, timeout
    track     carrier     NO          fail, ok, silence, timeout
    refund    payments    yes         fail, lost, ok, timeout
    release   inventory   yes         fail, lost, ok, timeout

  Only the carrier can go quiet, and `lost` is missing from the two probes
  because a read has no effect to lose. Those are claims about the world, and
  section 5 is what happens when the first one is withdrawn.

  ? dangling(S, A)  -> 0 rows. An action with no answer would be
  VACUOUSLY safe — `risky` needs an answer to fire — so this is a soundness
  hole in the MODEL, and a gate that never fires is an assumption with a
  gate's interface. Raise the charge budget past what the counter can hold:
    limit(charge, 2)  ->  1 rows, e.g. A = call, S = w(charge,2,1,1,2,0,0)
    a third charge has no `ok` successor, because the model caps the counter at
    two — and the gate names the states rather than letting them read as safe.

── 3. one file, two constructions, one answer ────────────────────────────
  rip.rofl is one program and the machine half is stratified: it loads under the
  ordinary semantics with no declaration at all. Only the game half needs the
  alternation. So the same answer can be had two ways, and both are built here:
    whole file, one store:       77 settles   32 doomed   24 dead letter
    machine dumped, game alone:  77 settles   32 doomed   24 dead letter
    identical: true

  The staged build exists for section 6 and not for speed: with the machine
  ASSERTED, a why-tree over the game shows the game. With the machine derived,
  the same tree walks the reachability proof first, which is true and unreadable.

── 4. three categories, and the third is the complement of the fixpoint ──
   category      states  what it means
   settles           77  a strategy exists: whatever the providers do, the
                         books balance in the end
   doomed            32  the environment can FORCE them not to. A bug to fix,
                         not a task to retry
   dead letter       24  neither is derivable. The play can go on for ever,
                         so it depends on luck
   total            133  and the three are disjoint and cover the machine

  WHERE THE DEAD LETTERS ARE, and they are all in one place:
    ship 12   track 12
    every one of them at the carrier, every one of them with the doubt flag set.
    A dispatch that may already have gone out, and a provider that has stopped
    answering. Nothing else in this machine is undecidable.

  and the doomed states are not "no route home" — they are "no strategy":
    2 of the 32 doomed states still have a lucky route to a settled
    terminal. w(reserve,1,1,0,0,0,1), w(reserve,1,1,1,0,0,1)
    A run from one of them can finish perfectly well. What the verdict says is
    that a provider which wants it to fail can make it fail, so the fix is the
    policy and not another retry.

── 5. the third value is EARNED, from both sides ─────────────────────────
  An answer where nothing is ever unknown proves nothing, and neither does one
  where everything is. The undefined set has to be a PROPER, NON-EMPTY part of
  the machine, and it has to move when its cause moves.

    baseline                       24 dead letter    130 unknown rows
    carrier cannot go quiet         0 dead letter      0 unknown rows   (123 reachable states)
      -> 91 settles, 32 doomed, and the program is two-valued. Take away the
      one behaviour that costs the environment nothing and there is no infinite
      play left, so the alternation's two limits meet with nothing between them.
      The negative cycle is still there — the declaration is still required —
      and it simply has no consequences.

    the payment gateway goes quiet too    24 dead letter    130 unknown rows   (137 reachable states)
      -> 81 settles, 32 doomed, and the dead letter set does NOT grow.
      Which is the sharper half of the claim: silence alone is not enough.
      At the charge stage the workflow has somewhere else to go — abort into the
      refund, or ask the gateway what happened — so the exists-quantifier finds a
      safe move and never has to look at the silent one. At the shipping stage
      with the doubt flag up there is no abort, and the probe inherits the same
      silence. SILENCE PLUS NO ALTERNATIVE is what makes a dead letter, and the
      two rows above separate the two ingredients.

  AND IT IS NOT THE BUDGET. A run that is cut short reports a hole and claims no
  unknowns at all, which is the other thing "nothing came back" could mean:
    budget 20 000     ok=true   unknown rows 0   hole budget_exhausted   partial true
    budget 20 000 000   ok=true   unknown rows 130   hole (none)   partial false
    Two different words for two different situations, which is the whole reason
    the third value had to be derived rather than subtracted.

── 6. why is this one undefined ──────────────────────────────────────────
  $ why unknown(will_settle(w(ship,0,1,1,1,0,2)))
    unknown[main](will_settle(w(ship,0,1,1,1,0,2)))  <= r70d8af2b @tick 0
      action[main](w(ship,0,1,1,1,0,2),call) [axiom]
      not risky[main](w(ship,0,1,1,1,0,2),call) [undefined]
        unknown[main](risky(w(ship,0,1,1,1,0,2),call))  <= r25915533 @tick 0
          respond[main](w(ship,0,1,1,1,0,2),call,fail,w(ship,1,1,1,1,0,1)) [axiom]
          not will_settle[main](w(ship,1,1,1,1,0,1)) [undefined]
            unknown[main](will_settle(w(ship,1,1,1,1,0,1)))  <= r70d8af2b @tick 0
              action[main](w(ship,1,1,1,1,0,1),call) [axiom]
              not risky[main](w(ship,1,1,1,1,0,1),call) [undefined]
                unknown[main](risky(w(ship,1,1,1,1,0,1),call))  <= r25915533 @tick 0
                  respond[main](w(ship,1,1,1,1,0,1),call,fail,w(ship,2,1,1,1,0,0)) [axiom]
                  not will_settle[main](w(ship,2,1,1,1,0,0)) [undefined]
                    unknown[main](will_settle(w(ship,2,1,1,1,0,0)))  <= r70d8af2b @tick 0
                      action[main](w(ship,2,1,1,1,0,0),check) [axiom]
                      not risky[main](w(ship,2,1,1,1,0,0),check) [undefined]
                        unknown[main](risky(w(ship,2,1,1,1,0,0),check))  <= r25915533 @tick 0
                          respond[main](w(ship,2,1,1,1,0,0),check,none,w(track,2,1,1,1,0,0)) [axiom]
                          not will_settle[main](w(track,2,1,1,1,0,0)) [undefined]
                            unknown[main](will_settle(w(track,2,1,1,1,0,0)))  <= r70d8af2b @tick 0
                              action[main](w(track,2,1,1,1,0,0),call) [axiom]
                              not risky[main](w(track,2,1,1,1,0,0),call) [undefined]
                                unknown[main](risky(w(track,2,1,1,1,0,0),call))  <= r25915533 @tick 0
                                  respond[main](w(track,2,1,1,1,0,0),call,silence,w(track,2,1,1,1,0,0)) [axiom]
                                  not will_settle[main](w(track,2,1,1,1,0,0)) [undefined]
                                    unknown[main](will_settle(w(track,2,1,1,1,0,0))) [cycle]
    unfounded set: risky[main](w(ship,0,1,1,1,0,2),call), risky[main](w(ship,1,1,1,1,0,1),call), risky[main](w(ship,2,1,1,1,0,0),check), risky[main](w(track,2,1,1,1,0,0),call), will_settle[main](w(ship,0,1,1,1,0,2)), will_settle[main](w(ship,1,1,1,1,0,1)), will_settle[main](w(ship,2,1,1,1,0,0)), will_settle[main](w(track,2,1,1,1,0,0))

  Read it as a script and it is one: ship fails, ship fails again, the attempt
  budget is gone so the workflow asks the carrier what happened, and the carrier
  says nothing — for ever. The tree closes on [cycle] rather than walking the
  loop, and names the unfounded set, which is the set of atoms whose only
  derivation needs to assume itself. That is what the third value IS.

  the control, in the same store: a state that settles explains itself the old
  way, through facts and finite failure, and names no unfounded set.
    why will_settle(w(charge,0,0,1,0,0,1))  ->  6 lines, unfounded set: none, [undefined]: absent

── 7. counting: how many ways home, and one is fragile ───────────────────
  `can_settle(S)` is true where SOME play from S ends settled — luck, not
  strategy. Counting its derivations says how many such plays there are.

    states with exactly ONE route home: 30
      w(charge,2,0,1,0,0,0)
      w(charge,2,1,1,0,0,0)
      w(charge,2,1,1,2,0,0)
      w(refund,0,0,1,0,0,0)
      w(refund,0,0,1,1,0,0)
      w(refund,0,0,1,2,0,0)
    One route means one sequence of provider answers. The day that sequence
    stops being possible the task dies, and no test fails when it does.

    states with a finite count above one: 17
    states with infinitely many: 50

  INFINITE is a divergence and not a fold that gave up, and the way to check
  that is to refuse to close the cycle — count derivations of height at most n:

    height at most      w(ship,0,1,1,1,0,2)   a one-route state
       6                                       109                   1
       8                                       692                   1
      10                                      3426                   1
      12                                     14457                   1
    One column grows without settling and the other does not. That is what an
    unbounded number of derivations looks like from below, and it is the
    positive control for the word INFINITE.

── 8. best derivation: a reproducing trace, and it executes ──────────────
  The shortest way to reach w(fulfilled,0,0,0,2,1,0),
  which is a fulfilled order that was charged twice. The tropical fold priced
  every derivation of `reached/1`; this is the argmin read back out of the
  support the engine already recorded, not a search this file ran.

    step  where                        the workflow   the provider
       1  w(reserve,0,0,0,0,0,2)       call           fail
       2  w(reserve,1,0,0,0,0,1)       call           ok
       3  w(charge,0,0,1,0,0,1)        call           lost
       4  w(charge,1,1,1,1,0,0)        call           ok
       5  w(ship,0,0,1,2,0,0)          call           ok
       6  w(fulfilled,0,0,0,2,1,0)

  handed to the simulator, which shares no code with the engine:
    replay -> w(fulfilled,0,0,0,2,1,0)   REPRODUCED — every step of the script exists in the simulator
    settled? false. Two charges, one parcel: the money is
    gone twice and nothing in the machine can bring it back, because the
    workflow never learned that the first charge landed.

  and the same for a dead letter, w(ship,0,1,1,1,0,2):
    call/ok  ->  call/ok  ->  call/silence
    replay -> w(ship,0,1,1,1,0,2)   (reproduced)
    From there the carrier only has to stay quiet. No further failure is needed
    and none is possible: silence costs the environment nothing.

── 9. the policy, one line at a time ─────────────────────────────────────
  Nothing below the @machine marker mentions a retry count. So a policy change
  is a line, and what it is worth is a number.

    policy                              states  settles  doomed  dead letter
    baseline                               133       77      32           24
    no verify probe for the charge         126       65      37           24
    no probes at all                       108       65      41            2
    reserve may abort under doubt          137       85      28           24
    no stage needs certainty               160      101      44           15
    refund gets the forward budget         133       65      42           26

  ONE LINE. Deleting probe_of(charge, verify) costs 12 states their guarantee:
      w(charge,1,1,1,0,0,1)
      w(charge,1,1,1,1,0,1)
      w(charge,2,1,1,0,0,0)
      w(charge,2,1,1,1,0,0)
      w(charge,2,1,1,2,0,0)
  Every one of them is at the charge stage with the doubt flag set — the exact
  states where a retry might charge twice. Asking before retrying is what a
  non-idempotent stage needs, and the model says how much it is worth.

  AND ONE LINE THE OTHER WAY. "Only compensate when you know where you stand"
  sounds prudent and costs 8 states — 4 at the reserve stage itself and
  4 in the release it would have aborted into:
      w(release,0,1,0,0,0,0)
      w(release,0,1,0,0,0,1)
      w(release,0,1,1,0,0,0)
      w(release,0,1,1,0,0,1)
      w(reserve,1,1,0,0,0,1)
      w(reserve,1,1,1,0,0,1)
      w(reserve,2,1,0,0,0,0)
      w(reserve,2,1,1,0,0,0)
  Reserving is idempotent, so the doubt is harmless there and the rule is pure
  loss. The policy has no idea which stages are idempotent; the model does.

  and the fairness assumption, swept, because every verdict above is relative
  to it and a number in a file is not an assumption anybody can see:

    slack   states   settles   doomed   dead letter   alternations
        0       14         9        3             2              5
        1       56        36       10            10              6
        2      133        77       32            24              8
        3      238       100       94            44             10
    A more patient adversary reaches more of the machine and settles less of it.
    Nothing here is a probability, and the sweep is the honest way to say so.

── 10. the oracle: every state decided a second time ─────────────────────

  The machine is re-derived in plain TypeScript from the domain description —
  a switch over stages, no rules, no engine — and the three regions are computed
  by the two textbook attractors: the workflow's, which is a least fixpoint over
  "some action, all answers", and the environment's, which is a least fixpoint
  over "all actions, some answer". Neither is an alternating fixpoint. The gap
  between them has to be exactly what the engine reports as undefined.

    states compared:                133   disagreements: 0
    transitions compared:           389   disagreements: 0
    settled terminals:                6   disagreements: 0
    verdicts compared:              133   disagreements: 0
    can_settle compared:            133   disagreements: 0
    states in two categories:         0   states in none: 0

  The oracle's own positive control, because a comparison that cannot see a
  difference agrees with anything. Take a state whose guarantee rests on ONE
  action, and point one of that action's answers at a state the environment
  already wins from:
    w(charge,2,0,1,0,0,0) keeps only `abort`; one answer now lands in w(abandoned,0,0,0,0,0,0)
    winning region 77 -> 72, and w(charge,2,0,1,0,0,0) is out of it.

── 11. the simulator, and the disagreements BY NAME ──────────────────────
  3 environments x 124 non-terminal states.
  random and flaky draw from a fixed distribution, 120 runs each; adversarial
  is deterministic and needs one. Step cap 60: a run that hits it is CAPPED,
  which is the simulator's own budget hole and is neither a success nor a
  failure. Merging it into either is exactly what would hide the subject.

    environment   settled   failed    capped    states capped
    random           10425      2175         0         0
    flaky            10269      2331         0         0
    adversarial         49         8        48        48

  and the sweep the spec asks for in the millions, from the initial state only:
    200 000 random runs -> 173100 settled, 26900 failed, 0 capped.
    ZERO capped, and that number is the finding rather than a disappointment.
    A random provider answers `silence` with probability 8 in 100 and the cap is
    60 steps, so the run that hangs needs a run of silences whose probability is
    around 1e-40. A million runs will never see it. The static answer finds it
    without running anything, and THAT is what the static analysis is for.

  the four disagreements, named, one row per state:
    agrees_forced_and_observed                    22 rows
    dead_letter_never_observed                    48 rows
    forced_but_never_seen                          4 rows
    policy_hangs_where_a_strategy_exists          20 rows

  POLICY HANGS WHERE A STRATEGY EXISTS — 20 rows, and it is the important one.
  The model says these states have a strategy; the policy in the simulator hangs
  in them anyway, because it is not playing that strategy. Replaying the run
  step by step gives the exact move where the two part company:

    state the run started from    parts company at              plays   certified
    w(charge,0,0,1,0,0,1)         w(ship,0,0,1,1,0,0)           call    abort
    w(ship,0,0,1,1,0,1)           w(ship,0,0,1,1,0,1)           call    abort
    w(ship,0,0,1,1,0,2)           w(ship,0,0,1,1,0,2)           call    abort
    w(ship,0,0,1,2,0,0)           w(ship,0,0,1,2,0,0)           call    abort
    w(ship,0,0,1,2,0,1)           w(ship,0,0,1,2,0,1)           call    abort
    w(ship,1,0,1,1,0,0)           w(ship,1,0,1,1,0,0)           call    abort
    w(ship,1,0,1,1,0,1)           w(ship,1,0,1,1,0,1)           call    abort
    w(ship,1,0,1,2,0,0)           w(ship,1,0,1,2,0,0)           call    abort

  8 distinct moves, and every one of them is the same mistake: at the
  shipping stage the policy calls the carrier, and the certificate says do not —
  cancel the order instead, because a carrier that can go quiet cannot be made
  to deliver. That is an unwelcome answer and it is the correct one, and no
  amount of retrying discovers it.

  DEAD LETTER NEVER OBSERVED — 48 rows, and every one of them is under a
  non-adversarial provider:
    flaky            24 states the runs never saw hang
    random           24 states the runs never saw hang
  The pathology is real and no amount of random testing reaches it. Under the
  malicious provider the same states hang on the first run.

  FORCED BUT NEVER SEEN — 4 rows. The model says the environment CAN force
  failure; a random provider is not trying to. Not a defect in either: `doomed`
  is a statement about an adversary, and these rows are the measurement of how
  far a benign provider is from being one.

  and the forgery, since the journal is a book with one writer:
    a run filed under the simulator's name by somebody else ->
      $fact(sim_capped,sim,$cons(random,$cons(w(ship,0,1,1,1,0,2),$nil)))
    Nothing in rip.rofl mentions forgery. WHO filed a run is the load identity
    checked against `authority`, not a column anybody could fill in.

── 12. can the certified strategy be implemented ─────────────────────────
  The fixpoint quantifies over actions per STATE, and a state carries what the
  workflow cannot see — whether the money moved, whether the parcel went. So the
  certificate may branch on hidden information, and the honest thing is to say
  by how much rather than to hope.

    winning non-terminal states:              71
    distinct observations among them:         23
    observations with one action safe in every state:     23
    observations that need hidden information:             0

    Zero, and that is a result rather than a relief: every guarantee the
    fixpoint certifies for this machine can be played by a workflow that knows
    only its own stage, its own attempt counter and whether it is unsure. The
    hidden state never has to be branched on — a class of states that look
    alike always has one action that is safe in all of them.

    THE CONTROL, because a check that cannot say no says nothing. Blind the
    workflow further — let it see only which stage it is at, and not how many
    attempts it has spent or whether it is unsure — and the same check must
    start objecting:
      observations: 6   needing information the workflow does not have: 1
        at charge     12 winning states, no single action safe in all of them
      So the zero above is the measurement of a machine, not of a check that
      never fires — and it is what makes section 11's hanging runs a fact about
      the deployed policy rather than about the certificate.

(61133 ms for everything above.)
```
