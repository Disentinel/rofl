# BLEEP — the parts nobody checked, blacked out

A quarterly report whose numbers arrive through channels of differing
trustworthiness. Some conclusions print as numbers. Some print as `████`.

```
  gross_revenue       4 200 000   [clean]     clean
  returns                  ████   [dirty]     min(dirty, clean) = dirty
  cogs                1 900 000   [clean]     max(clean, clean) = clean
  payroll               620 000   [clean]     clean
  shipping              180 000   [clean]     max(clean, dubious) = clean
  fx_rate                  ▒▒▒▒   [dubious]   min(dubious, clean) = dubious
  headcount            ████████   [forbidden] min(forbidden, clean) = forbidden
  --------------------------------------------------------------------------
  net_revenue              ▒▒▒▒   [dubious]   max(dirty, dubious) = dubious
  opex                  800 000   [clean]     clean
  operating_profit         ▒▒▒▒   [dubious]   min(clean, dubious) = dubious
  margin_pct               ▒▒▒▒   [dubious]   min(clean, dubious) = dubious
  refund_rate              ████   [dirty]     min(clean, dirty) = dirty
  cogs_eur                 ▒▒▒▒   [dubious]   min(clean, dubious) = dubious
  revenue_per_head     ████████   [forbidden] min(clean, dubious, forbidden) = forbidden
```

Nothing in `bleep.rofl` computes that column. There is no `dirty/1`, no
`taint/2`, no propagation rule anywhere. The rules compute the report; the
levels are the VALUE of each fact under a four-element semiring folded over
the support hypergraph the kernel already recorded while computing it.

## Honestly, about novelty

**This is a classical label lattice, and there is no new idea in it.**
Bell–LaPadula, information-flow control, taint tracking, provenance labels:
a field roughly forty years old, with a large literature and industrial
tooling. Nothing here improves on any of it, and any claim that it does
would be false.

What is worth showing is narrower and true. Distrust propagation turns out
to be **multiplication in a semiring** — an instance of machinery this
repository already had, fifteen lines in `runtime/semirings.ts`, folded by
the same `evaluateSemiring` that does counting and provenance. In the
industrial tools it is a separate subsystem with its own analysis engine.
Here it is one more row in a table of instances, and it inherits the
convergence discipline, the property tests and the `why`/`whynot` machinery
without asking for anything of its own.

That is the entire claim. Not a better taint tracker: the observation that a
taint tracker is a semiring instance, demonstrated by being one.

## The semiring

Carrier: a four-level total order.

```
clean  >  dubious  >  dirty  >  forbidden
```

- **`⊗` = min along a chain.** A conclusion is never cleaner than its worst
  premise. One dirty ground contaminates everything derived from it, however
  many clean steps follow. This is what an ordinary pipeline does *not* do —
  there the label is lost at the first transformation, because the label
  lives beside the value instead of being an annotation the algebra carries.
- **`⊕` = max across alternatives.** If the same conclusion is also reachable
  by a cleaner route, the cleaner route wins. This is **laundering through
  independent derivation**, and it is correct semantics rather than a
  loophole: a dirty source stops being a problem the moment the result is
  independently confirmed.
- The identities fall out of the lattice. `one` = `clean` (an axiom costs
  nothing), `zero` = `forbidden`. And `zero` is *both* the additive identity
  and the annihilator, which says something worth saying out loud: **a fact
  whose every route is forbidden is annotated exactly like a fact with no
  route at all.** An embargoed source is algebraically no source.

`bleep.rofl` uses four levels because a report can act differently on four —
print it, print it with a caveat, black it out, refuse it — and a fifth would
buy nothing.

### Why BOUNDED

`runtime/semirings.ts` makes every instance declare its convergence
discipline, and say why the declaration is true. `trustSemiring` declares
**BOUNDED**, and the argument is a counting argument rather than an appeal:

> The carrier has FOUR elements, so any fact's value can change at most three
> times whatever the support graph does. Iteration starts every derived fact
> at `zero` = forbidden and only ever moves it up, and `one` = clean is the
> top, so no value can rise past it.

Cycles are therefore free. Contrast `countingSemiring`, which is CLOSED and
*needs* `star`: `⊕` = `+` has infinite height, so over a cycle the count
really does grow without bound, and "infinitely many" has to be a legal value
of the carrier rather than an overflow. Going round a cycle here can only
take `min` against something already seen, and the chain stops.

(`star(a)` = `one ⊕ a ⊕ a² ⊕ …` = `max(clean, a)` = `clean` = `one`, so a
CLOSED declaration would compute the same values. BOUNDED is the honest one,
because convergence is by finite height and not by closure. The same note
appears on `provenanceSemiring`, for the same reason.)

The model contains a real cycle to test that on — see §6 of the transcript.

## The label is on the EDGE, not on the node

The spec insists on this and it survived contact with the kernel, in a form
worth stating precisely.

`says(ops_chat, returns, 315000)` is a **clean fact**. The chat message
exists; the record of what was said is not in doubt. What is doubtful is the
*step* from "the channel said it" to "the number is 315000". That step is a
hyperedge, and the level belongs to it.

`evaluateSemiring` has exactly that slot: `weight(key, witness)` is called
once per FIRING, and a firing is a hyperedge. `demo.ts` supplies it:

```ts
// three licences exist in this model; a firing carrying none is a plain
// inference step and contributes `one` = clean
says(S, …)          the step from "S said it" to "it is so"
restates(S, …)      the step through an echo
rule_of_thumb(…)    the estimate
```

Two consequences you can read off the transcript:

**The same fact, two edges, two labels.** `figure(shipping, 180000)` is
carried by a supplier's email (dubious) and by the carrier's invoice (clean).
Those are different hyperedges into the same fact, and `⊕` = max picks the
better one:

```

  shipping
    via says[main](carrier_invoice,shipping,180000)    min(clean, clean) = clean
    via says[main](vendor_email,shipping,180000)       min(dubious, clean) = dubious
  net_revenue
    via (no licence: a plain step)                     min(clean, clean, dirty) = dirty
    via rule_of_thumb[main](net_revenue,925)           min(dubious, clean, clean) = dubious
```

**Doubt with no premise to hang it on.** The second route to `net_revenue`
is a rule of thumb — returns have run at 7.5% of gross for three years — and
its premises are all clean. There is no *fact* to label; the doubt is in the
inference. An edge label holds it; a node label has nowhere to put it.

### Where the distinction is real and where it is not

Being exact about this, because it is easy to oversell: in a Datalog where
every step is licensed by a fact, node labels on those licence facts are
**expressively equivalent** for the value of derived facts. Labelling
`says(ops_chat, returns, 315000)` dirty as a node would give `figure` and
everything downstream the same annotation this fold gives them.

Two things are still lost by doing it that way, and they are why the edge
form is the right one:

1. **The record is corrupted to express doubt about the claim.** Under node
   labelling, `says(ops_chat, returns, 315000)` itself reads dirty — which
   is false. The chat message is a fact. The edge form keeps "what was said"
   certain and "what is so" doubtful, which is the distinction the whole
   domain turns on.
2. **Counterfactuals stop being cheap.** "What gets laundered if I verify
   ops_chat" is answered here by re-folding with a different label function
   over the *same store*. No assertion, no retraction, no re-derivation.
   With labels on nodes it is a store mutation and a new fixpoint per
   candidate.

The fold did not fight the model on any of this. `weight(key, witness)` is a
proper edge slot and it was enough. The one thing to know is that `base(key)`
is a *node* slot next to it, and mixing them is how the distinction quietly
gets lost.

## The four queries

### 1. `why` on a redacted value — which link is dirty

The kernel's derivation tree, and the same tree with the lattice folded over
it: descend the route `⊕` chose, take its worst part, repeat.

```
== 2. why: which link is dirty ===============================================
refund_rate prints as ████. The kernel's own derivation tree:

refund_rate[main](75)  <= r5e0a72f7 @tick 0
  figure[main](returns,315000)  <= r4b8d2a74 @tick 0
    says[main](ops_chat,returns,315000) [axiom]
  figure[main](gross_revenue,4200000)  <= r4b8d2a74 @tick 0
    says[main](billing_export,gross_revenue,4200000) [axiom]
  75 is /(*(315000,1000),4200000) [builtin]

and the same tree with the lattice folded over it, descending the route
(+) chose and taking its worst part at every step:

  refund_rate[main](75)                      dirty      worst premise below
  figure[main](returns,315000)               dirty      EDGE is dirty, licensed by says[main](ops_chat,returns,315000)

The chain ends on an edge, not on a fact, and that is the point: the fact
says(ops_chat, returns, 315000) is CLEAN — the message exists and the
record of it is not in doubt. The dirty thing is the step from "the chat
said it" to "returns are 315000".
```

The chain ends on an EDGE, and that is the whole point.

### 2. `whynot` on cleanliness — what must be confirmed to launder it

`clean_route(M, V)` is the structural precondition and nothing more: some
system of record carries this number directly. It is deliberately **not**
recursive — propagating along a derivation is `⊗`'s job, and writing it a
second time in the rules would be the separate subsystem this example exists
to avoid.

```
== 3. whynot: what must be confirmed to launder it ===========================
`clean_route(M, V)` is the structural precondition: some system of record
carries this number directly. Ask why it fails for the dirty input.

$ whynot clean_route(returns, 315000)
whynot clean_route[main](returns,315000):
  rule r3f0bfd8e: clean_route[main](?M,?V)@now :- says[main](?S,?M,?V)@now, trust[main](?S,clean)@now
    failed premise: trust[main](ops_chat,clean)
      no rule concludes 'trust' and no matching base fact exists

The failing premise is the whole answer: trust(ops_chat, clean) is what is
missing. Confirm ops_chat, or find a system of record that carries 315000.

And the contrast that shows corroboration is not the same as cleanliness:
  shipping   carried by 2 channel(s) — carrier_invoice, vendor_email — clean_route holds, level clean
  headcount  carried by 1 channel(s) — hr_embargo — clean_route FAILS, level forbidden
```

The failing premise is the answer. And the two lines underneath are the
lesson that stops corroboration being mistaken for cleanliness: `headcount`
is carried by a channel and still has no clean route, while two *dirty*
channels agreeing would give two dirty edges and `max(dirty, dirty)` is
still dirty.

### 3. What gets laundered if I verify source X — the inverse query

The most practical of the four. It says **which single check to perform** to
clean the most conclusions: verification priority, derived rather than
guessed.

```
== 4. what gets laundered if I verify source X ===============================
The inverse query, and the practical one. Nothing is asserted and no rule
changes: verification moves an EDGE LABEL, so one re-fold answers it. This
is verification priority, derived rather than guessed.

  verify ops_chat (dirty)       -> 5 report line(s) clean, 6 facts in all
       returns, net_revenue, operating_profit, margin_pct, refund_rate
  verify vendor_email (dubious) -> 2 report line(s) clean, 4 facts in all
       fx_rate, cogs_eur

Do ops_chat first: 5 lines against 2. And note what is NOT
on vendor_email's list. It carries fx_rate, shipping, yet
confirming it cleans nothing for shipping — shipping already has a second,
clean carrier, so there is nothing left there to launder. Nobody guessed
that; it fell out of the fold.

A forbidden channel is not on this list at all. An embargo is a permission,
not a doubt, and no amount of checking lifts it.
```

Note the result that nobody put in: `vendor_email` carries `shipping`, and
confirming it cleans nothing for `shipping`, because `shipping` already has a
second clean carrier. Effort spent there buys zero. That fell out of the
fold.

A forbidden channel is not on the list at all. An embargo is a permission,
not a doubt, and no amount of checking lifts it — `trustOf` refuses to
promote it and `offers` never proposes it.

### 4. `counting` — how many independent clean routes

The counting semiring with every non-clean edge annihilated, so a derivation
is counted only if every step of it is clean.

```
== 5. counting: how many independent clean routes ============================
The counting semiring with every non-clean edge annihilated, so a
derivation is counted only if every step of it is clean.

  gross_revenue        1   clean
  returns              0   dirty
  cogs                 2   clean
  payroll              1   clean
  shipping             1   clean
  fx_rate              0   dubious
  headcount            0   forbidden
  net_revenue          0   dubious
  opex                 1   clean
  operating_profit     0   dubious
  margin_pct           0   dubious
  refund_rate          0   dirty
  cogs_eur             0   dubious
  revenue_per_head     0   forbidden

The count reads a FIFTH way across this example set. In NOPE and OOPS it
is robustness, in AKA ambiguity, in SPAT fragility; here it is
LAUNDERABILITY. Zero means there is nothing in the model to launder with,
and a human has to go and check a source. The number is the same metric
every time; which of the five it means belongs to the instance.
```

**Which reading of the count applies here.** The project records this as a
finding (`f_counting_reads_oppositely_by_domain`): the same metric reads in
different directions by domain, and an instance that ships the number bare
invites a tool to report robustness where it should report ambiguity. Across
this example set it now reads five ways — robustness (NOPE, OOPS), ambiguity
(AKA), fragility (SPAT), and **launderability** here. Zero clean routes means
there is nothing in the model to launder with and a human has to go and check
a source. The interpretation belongs to the instance, not to the metric.

## The echo chamber, and the BOUNDED claim on real data

`ops_chat` and `vendor_email` each restate the other. `stands_behind` therefore
rests on itself through the loop — a cycle of the *support hypergraph*, not of
the rules only, which is the kind that actually breaks folds.

```
== 6. the echo chamber: a real cycle, and why BOUNDED holds ==================
ops_chat and vendor_email each restate the other, so stands_behind rests on
itself through the loop. That is a cycle of the support hypergraph, not of
the rules only:

  counting   stands_behind[main](ops_chat,shipping,180000)
             infinitely many — arithmetically right, epistemically absurd
  trust      dirty — the loop adds nothing, because going round it
             can only take min against a value already seen

The fold declared BOUNDED and stopped after 5 rounds with
16 facts on a cycle and disciplineHeld=true. No closure operator, no depth
cap: a four-element lattice has finite height and every value starts at
forbidden and only ever rises, so the chain has nowhere to run.
```

Mutual confirmation is not independent confirmation, and the lattice says so
without being told: the loop adds nothing because going round it can only take
`min` against a value already seen. `test/example-bleep.test.ts` also runs a
fixture where *every* fact is on the cycle, and checks that a round cap far
below any runaway gives byte-identical values.

## Before and after one verification

```
== 7. before and after one verification ======================================
$ verify ops_chat

  gross_revenue       4 200 000   [clean]     clean
  returns               315 000   [clean]     clean
  cogs                1 900 000   [clean]     max(clean, clean) = clean
  payroll               620 000   [clean]     clean
  shipping              180 000   [clean]     max(clean, dubious) = clean
  fx_rate                  ▒▒▒▒   [dubious]   min(dubious, clean) = dubious
  headcount            ████████   [forbidden] min(forbidden, clean) = forbidden
  --------------------------------------------------------------------------
  net_revenue         3 885 000   [clean]     max(clean, dubious) = clean
  opex                  800 000   [clean]     clean
  operating_profit    1 185 000   [clean]     clean
  margin_pct                 28   [clean]     clean
  refund_rate                75   [clean]     clean
  cogs_eur                 ▒▒▒▒   [dubious]   min(clean, dubious) = dubious
  revenue_per_head     ████████   [forbidden] min(clean, forbidden) = forbidden

5 report line(s) moved on one reconciliation:
  returns           dirty -> clean
  net_revenue       dubious -> clean
  operating_profit  dubious -> clean
  margin_pct        dubious -> clean
  refund_rate       dirty -> clean

still not clean: fx_rate, headcount, cogs_eur, revenue_per_head. The first two need
the vendor, and the last two rest on the embargoed headcount, which no
reconciliation reaches. One check moved five lines; the next one moves two.
```

One reconciliation, five report lines. That is what the inverse query was
for.

## The veto

The spec asks for a veto on actions resting on dirty ground, stitched to the
same mechanics AFK uses for effects. There is no separate check to write:
`revenue_per_head` is **Boolean-derivable** — the engine derives
`revenue_per_head(60703)` and `holds` returns true — and its annotation is
`forbidden`, which is the semiring zero. An action gated on a clean basis
reads the annotation, and "no admissible derivation" and "no derivation" are
literally the same value. The veto is a fact about the algebra rather than a
heuristic about the text; there is nothing to tune and nothing to evade.

## How to run it

```
node --experimental-strip-types examples/bleep/demo.ts
node --experimental-strip-types --test test/example-bleep.test.ts
```

Everything quoted above is pasted output from a real run. Nothing on this
page was composed by hand.

## What this does NOT do

- **No inference of trust.** `trust/2` is declared per channel, by a human.
  Deciding that a chat message is hearsay is a judgement, not a computation,
  and pretending otherwise would be the interesting-looking mistake.
- **The levels of the four channels do not vary by metric.** A real system
  would want `trust(Channel, Metric, Level)` — billing is authoritative for
  revenue and a manual paste for returns. That is a wider licence relation
  and no change at all to the algebra.
- **No string or float arithmetic** (LIMITS.md). The report's numbers are
  integers, the FX conversion is `× 92 / 100`, and `margin_pct` truncates.
- **No `@next` ticks.** A carry rule makes every carried fact its own
  support one tick back; harmless for a BOUNDED instance and confusing for a
  reader, so the whole model is evaluated at tick 0 (as in `examples/spat`).
- **`whynot` is single-step on abduction** (LIMITS.md). It names the missing
  premise; it does not search for sets of facts whose addition would launder
  a conclusion. Query 3 does that job for the one move that matters —
  verifying a channel — by re-folding, not by abduction.

## Files

- `bleep.rofl` — the model: channels, claims, the report, the echo chamber.
- `demo.ts` — the runnable transcript; also the module the test imports.
- `page.html` — the same story at two levels, self-contained.
- `../../runtime/semirings.ts` — `trustSemiring`, next to the others.
- `../../test/example-bleep.test.ts` — the laws over the whole carrier, and
  the domain assertions.
