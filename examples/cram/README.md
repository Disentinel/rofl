# CRAM — a flight computer that must fit its own future in a box

**A program whose world is fixed, whose memory of that world is not, and the
two constructor flags that decide whether it can run for years.**

A probe is nine light-minutes out. Its store is whatever was bolted on before
launch. The mission is bounded — twenty-four sensors, four subsystems, eighteen
bus segments, and that is the whole craft, for ever. The RECORD of the mission
is not bounded: every completed tick leaves the kernel's account of which rule
concluded what, and that account grows with the clock and nothing else.

| after eight ticks | facts | provenance | everything else | firings |
|---|---:|---:|---:|---:|
| unpruned | 8206 | 6649 | 1557 | 17189 |
| `retainTicks: 2` | 3505 | 1948 | 1557 | 17189 |
| `retainTicks: 0` | 1699 | 142 | 1557 | 17189 |

The domain state of all three is **byte-identical** and so is the work. The
store is 4.8× smaller and not one derivable fact moved.

## How to run

```sh
node --experimental-strip-types examples/cram/demo.ts        # the transcript below
node --experimental-strip-types --test test/example-cram.test.ts
```

## Why this example exists

`retainTicks` and `reuse` were the two flags of the public API that **no
example ran** — measured by `npm run flagcheck`, which is the gate this example
was written against. Both are memory-and-work policies, and that is precisely
the class that hides from correctness gates: the goldens do not move because
the default path is untouched, the suite stays green because no test passes the
flag, and the kernel grep sees nothing new. A flag that nothing exercises
cannot go red.

The census found two more the same way — `naive` had been credited to
`examples/drip` and `examples/nope` by a text grep, where the word appears as
those demos' own `upstream_naive` and `access_naive` relations and never
reaches the kernel — so CRAM exercises four: `retainTicks`, `reuse`, `naive`
and `onFixpoint`.

## The one property no other example has

**Two policies, one predicate, and they cannot disagree.** A program whose
rules read `derived_by` can observe its own derivations from inside. For such a
program:

- **retention refuses.** Pruning would no longer evict a cache; it would change
  a derivable fact.
- **reuse refuses.** Every firing anywhere emits a provenance record, so a rule
  reading provenance is triggered by derivations everywhere and sits outside
  the dependency cone that reuse's fingerprint argument rests on.

Both read `Evaluation.readsProvenance`. `flight_log.rofl` is that program —
four rules, loaded on top of the same craft — and with it loaded the two runs
that differ by 4.8× without it become **the same store to the byte**, at 10.1×
the firings.

Transcript §8 performs the forbidden sweep by hand to show what the refusal is
protecting. The fact that moves is `quiet[log](T)` — "a tick in which nothing
was concluded", which for a probe is the failure worth catching. Pruned, it
does not go missing. **It goes true.** The store starts asserting that the
computer sat idle through ticks it worked through.

## What you give up, stated exactly

`retainTicks: n` keeps the current tick and `n` completed ones, so "which rule
concluded this, and when" is answerable for `T >= now - n` and for no earlier
`T`. What makes that expensive is not the missing rows but **how they are
missing**:

```
tick 2 happened, and 794 rules fired in it (the unpruned run says so).
asked of the pruned store:   derived_by(F, R, 2)     -> 0 rows, no error
asked about a tick that never happened: (F, R, 9999) -> 0 rows, no error
```

The store cannot distinguish "no rule concluded anything then" from "that was
before my window", and neither can the ground. What survives is the craft's own
domain memory — `latched[bus](Sub, T)` still names the tick a subsystem alarmed
on — and knowing *when* a subsystem latched is not knowing *which rule*
concluded it.

## The budget is a decision, not a setting

A box of B facts is spent on two things at once: how long the mission runs, and
how far back it can be asked. The model is

```
store(T, n) ≈ base + residual·T + n·prov
```

and it is not asserted — §9 predicts the `retainTicks: 2` run's store from the
other two runs and the prediction is **exact**, provenance and facts both.

## The limit this example found and does not fix

`retainTicks` bounds the provenance and **nothing else**. Under
`retainTicks: 0` the store still grows, by 116 facts a tick against 915
unpruned — 7.9× slower, and not zero. The residual is the kernel's assertion
ledger — `asserted_by`, `in_perspective`, `forged`, one triple per reading the
bus publishes — plus the current tick's own provenance, which itself grows
because the meta layer has a bigger ledger to chew on every tick.

So the flag buys a **factor**, not a bound. A mission in a fixed box still
ends; in a box of 100 000 facts it ends at tick 840 instead of tick 106. The
transcript's §9 table prices that in ticks, and this example has no API with
which to prune the ledger, so it reports the limit rather than working around
it.

## A note on the numbers

Every firing count here is a measurement of `src/` and `boot.rofl` as they
stood when the transcript was taken — digest `ee3693f08a33` below — and the
transcript prints that digest for exactly this reason. Paid for while writing
this: two runs of `demo.ts` twenty minutes apart reported `reuse` saving 1.75×
and then saving nothing at all, because an engine change had landed in between.
Neither number was wrong and neither was about this example.

## The transcript

Pasted verbatim from `node --experimental-strip-types examples/cram/demo.ts`.

```
CRAM — a flight computer that must fit its own future in a box.
  8 ticks, 4 bus packets a tick, node v22.22.0, load average 4.37 6.70 6.68
  measured against boot.rofl + src/ at digest ee3693f08a33

§1  THE CRAFT AND THE BOX

    tick   posture     facts     provenance   everything else
       0   safe        2417            608            1809
       1   science     3254           1376            1878
       2   science     4122           2170            1952
       3   science     5012           2988            2024
       4   safe        5930           3832            2098
       5   safe        6872           4701            2171
       6   science     7831           5591            2240
       7   science     8821           6507            2314

    the craft does not grow: 24 sensors, 4 subsystems, 18 bus segments,
    17 feed links — the same numbers at tick 7 as at launch, because that is the craft.
    the STORE grows: 2417 facts at tick 0, 8821 at tick 7.
  oracle: AGREE — the modelled craft is fixed while the store is not

§2  THE TWO LEAKS

    what grew between tick 1 and tick 7, per tick:

    relation                 tick  1   tick  7   per tick
    derived_by                 1376      6507      855.2
    in_perspective              189       333       24.0
    asserted_by                 187       331       24.0
    forged                      187       331       24.0
    dark                          0        18        3.0
    latched                       1         3        0.3
    over                          0         1        0.2
    tripped                       0         1        0.2
    fault                         0         1        0.2
    nominal                       4         3       -0.2

    915 facts a tick, of which 843 are provenance (92%). The rest is the
    kernel's ASSERTION LEDGER — `asserted_by`, `in_perspective`, `forged`, one
    triple per reading the bus publishes. Two leaks, and only one of them is what
    `retainTicks` is about. §3 measures what is left after the flag has done its
    work, because a flag that removes the larger term is not a flag that stops
    the store growing.

    AND THE LEAK ACCELERATES. The per-tick provenance is not a constant:
      768  794  818  844  869  890  916
    each tick mints more than the last, because the meta layer has a bigger
    ledger to chew on every tick. A straight line fitted to this reports a
    residual; the residual is the finding, not the noise.
  oracle: AGREE — provenance is the dominant term of the leak
  oracle: AGREE — and the per-tick provenance is strictly increasing, not constant

§3  THE POLICY: new Rofl({ retainTicks: n })

    run                     facts   provenance   everything else   firings
    unpruned                8206         6649              1557     17189
    retainTicks: 2          3505         1948              1557     17189
    retainTicks: 0          1699          142              1557     17189

    domain state, byte for byte: unpruned == retainTicks:2 == retainTicks:0 -> true
  oracle: AGREE — pruning the provenance changes nothing the program can conclude
  oracle: AGREE — and it changes nothing about the work either: same firings
  oracle: AGREE — POSITIVE CONTROL: the same comparison against a different run DIFFERS
    the box: 8206 facts unpruned, 1699 at retainTicks:0 — 4.8x, and the difference is entirely the past.

    WHAT IS LEFT. Under retainTicks: 0 the store still grows by 116 facts a tick:

    relation                 tick  1   tick  7   per tick
    derived_by                  768       916       24.7
    in_perspective              189       333       24.0
    asserted_by                 187       331       24.0
    forged                      187       331       24.0
    dark                          0        18        3.0
    latched                       1         3        0.3
    over                          0         1        0.2
    tripped                       0         1        0.2
    fault                         0         1        0.2
    nominal                       4         3       -0.2

    7.9x slower, and NOT zero. The flag bounds the provenance and
    nothing else; the assertion ledger of the readings is out of its reach and out
    of this example's reach too, since the host has no API here that prunes it.
    A mission in a fixed box therefore still ends — later, by that factor. §9
    prices it.
  oracle: AGREE — the residual leak is real and much smaller than the one the flag removes

§4  WHAT THE WORK COSTS: new Rofl({ reuse: false }) and { naive: true }

    reuse on      17189 firings,   2695 ms
    reuse off     30077 firings,   2745 ms   — 1.75x the work
  oracle: AGREE — reuse saves firings, exactly and reproducibly
  oracle: AGREE — and the answers do not move

    `naive` is the other half of the same dial, and the kernel's meter is BLIND to it:
  oracle: AGREE — naive and seminaive perform the IDENTICAL firings — steps cannot see the difference
  oracle: AGREE — and reach the identical answers
    over 3 runs of 5 ticks, reuse off, load average 4.37 6.70 6.68:
      naive: true   3077 / 2967 / 3051 ms   mean 3032
      naive: false  1317 / 1294 / 1324 ms   mean 1312
    2.31x on the clock, 1.00x in the budget. A step budget therefore does
    not bound this cost at all, and nothing in the store records that it was paid.
  oracle: AGREE — naive costs wall clock while spending the identical budget

§5  THE WINDOW: which ticks can still be asked about

    tick    unpruned   retainTicks:2   retainTicks:0
       0         608               0               0
       1         768               0               0
       2         794               0               0
       3         818               0               0
       4         844               0               0
       5         869               0               0
       6         890             890               0
       7         916             916               0
       8         914             914             914

    retainTicks: 2 at tick 8 answers about ticks 6, 7, 8 — the current one and the two before it.
    retainTicks: 0 answers about tick 8 and nothing else.
    THE ANSWER BREAKS AT n: "which rule concluded this, and when" is answerable
    for T >= now - n, and for no earlier T. At n = 2 and now = 8 that is T >= 6;
    the boundary freezes BEFORE it increments, so n counts completed ticks and the
    tick being entered is never a candidate — the window is n + 1 ticks wide.
  oracle: AGREE — every tick answers in the unpruned run — so the missing rows are pruning, not silence
  oracle: AGREE — retainTicks: 2 keeps exactly the current tick and the two before it
  oracle: AGREE — retainTicks: 0 keeps exactly the current tick

§6  THE SILENCE: what a pruned store says, and what it means

    tick 2 happened, and 794 rules fired in it (the unpruned run says so).
    asked of the pruned store:   derived_by(F, R, 2)     -> 0 rows, no error
    asked about a tick that never happened: (F, R, 9999) -> 0 rows, no error
    THE TWO ARE THE SAME ANSWER. The store cannot distinguish "no rule concluded
    anything then" from "that was before my window", and neither can the ground.
    What survives pruning is the craft's OWN memory — `latched[bus](Sub, T)` still
    names the tick a subsystem alarmed on, because that is a domain fact:
      attitude@4  power@0  power@5
    Knowing WHEN a subsystem latched is not knowing WHICH RULE concluded it.
  oracle: AGREE — a pruned tick and a tick that never happened are indistinguishable
  oracle: AGREE — but the domain's own record of the past survives the prune

§7  THE SECOND GATE: a program that reads its own provenance

    run                        facts   provenance   firings
    log, unpruned             10049         8419    172753
    log, retainTicks: 0       10049         8419    172753

    `retainTicks: 0` was asked for and NOTHING WAS PRUNED. flight_log.rofl reads
    `derived_by` in a rule body, so `Evaluation.readsProvenance` is true, and
    `Rofl.frozenRetention` returns undefined whatever the setting says.
    The same predicate turns reuse off: 172753 firings against 17189 without the log — 10.1x.
  oracle: AGREE — with the log loaded, retainTicks changes NOTHING: the two stores are identical
  oracle: AGREE — POSITIVE CONTROL: without the log, the same pair of settings DOES differ
  oracle: AGREE — the log program pays for reuse as well as for retention

§8  THE LIE THE GATE PREVENTS

    before the sweep:  active[log] = 0,1,2,3,4,5,6,7,8   quiet[log] = (none)
    swept 8268 completed-tick records by hand, the way a host had to before the policy
    after the sweep:   active[log] = 8   quiet[log] = 0,1,2,3,4,5,6,7

    `quiet[log](T)` did not go missing. It went TRUE. The store now asserts that
    the computer sat idle through ticks it worked through — a derivable fact
    changed, not a cache evicted. That is what the kernel refuses to do, and
    refusing it is why §7's two stores are the same size.
  oracle: AGREE — the sweep really removed something
  oracle: AGREE — a fact the program derives about its own past MOVED
  oracle: AGREE — and the movement is a falsehood being asserted, not an answer going missing

§9  THE BUDGET AS A DECISION, NOT A SETTING

    the model says: store(n) = store(0) + the last n+1 ticks of provenance.
    predicted for retainTicks:2 at tick 7, from the OTHER two runs:
      provenance 2675   facts 4989
    measured:
      provenance 2675   facts 4989
  oracle: AGREE — the store size of a third run is predicted exactly from two others

    So a box of B facts, with a residual leak of 116/tick and 916 per tick of
    provenance, is spent on two things at once — how long the mission runs, and
    how far back the ground can ask. At B = 100,000:

    window (retainTicks)      mission ends at tick
               0                       840
               1                       832
               2                       824
               4                       808
               8                       777
              32                       587
    unpruned                           106

    Read the column, not the flag: the box does not decide whether the craft
    runs, it decides HOW FAR BACK IT CAN BE ASKED. Keeping everything costs 87%
    of the mission; keeping the last eight ticks costs under one percent of it.
    And the answer breaks exactly where §5 said: at window n, "which rule
    concluded this" is answerable for T >= now - n and for no earlier T.
  oracle: AGREE — keeping everything costs most of the mission
  oracle: AGREE — and an eight-tick window costs almost none of it

§10  THE POLICY SURVIVES A REBOOT

    a probe reboots from a snapshot of the unpruned run: 7421 provenance records
    restored with { retainTicks: 0 }, one tick later: 142
    The flag is on the constructor and on `fromSnapshot`, so a resumed mission
    resumes its policy. A snapshot taken before the policy existed is not a
    trap: the first boundary after the reboot collects the whole backlog.
  oracle: AGREE — the restored store carried the old provenance in
  oracle: AGREE — and the first boundary under the policy dropped it

ORACLES: 28/28 agree.

total wall clock 35.7 s, load average at start 4.37 6.70 6.68
```
