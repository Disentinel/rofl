# WTF — What The Fixpoint

Magic: the Gathering's layer system (Comprehensive Rules 613), as rules.

The domain needs no argument. Continuous effects are applied in **seven
layers** in a fixed order — copy, control, text, type, colour, abilities,
power/toughness — layer 7 is split again into **sublayers 7a–7d**, within a
sublayer the order is by **timestamp**, and on top of all of that,
**dependency can override timestamp**. Anyone who has played knows a single
pass does not compute this. Judges have been writing rulings about specific
interactions for twenty years, and rules engines are a famous graveyard on
exactly this code.

```
$ wtf grizzly
Grizzly Bears                     3/3

  printed                          2/2                           green  bear creature
  5  colour                 T600   +colour white                 OVERRIDDEN by a later setter
  5  colour                 T650   colour := blue                Cerulean Wisps: becomes blue
  7c modify power/toughness T100   +1/+1                         the lord ability

  => 3/3   blue   bear creature   p1   {}
```

The two things worth the trip are further down: **why the order inside a
layer was what it was** when dependency overrode timestamp, and a **count of
how many application orders give the same answer** — because a sublayer where
many orders give one answer is stable, and one where they don't is precisely
the configuration a judge gets asked about.

## What the kernel supplies, and what this file supplies

- **The seven layers are a candidate for strata — and this file constructs
  that, it does not inherit it.** A kernel stratum is a level forced by
  *negation*, derived by `boot.rofl` from the rule dependency graph. An MTG
  layer is an order the Comprehensive Rules *assert* — nobody derives it, the
  rulebook states it. The two coincide only where layer N's rules negate on
  layer N−1's **relation**, so every boundary here is written in one shape:

  ```
  lost_N(...) :- <layer N-1>(...), <it was replaced>.
  <layer N>   :- <layer N-1>(...), not lost_N(...).
  ```

  Writing `not anyset5(O)` instead — a fact about *effects* — is semantically
  identical and buys nothing, because it does not read the layer below.
  Measured on this program, in the transcript: `co3` at stratum 1, `co5` at
  **2** with the routed negation and at **1** without it, same answers both
  ways. The observed numbers are the evidence; the prose is not.
- **Timestamp order (613.7) is NOT stratification.** Stratification cannot
  order anything *inside* one level at all. `bef_ts` is one rule over integer
  timestamps that reads no layer state, and it sits at the bottom.
- **Dependency (613.8) is NOT stratification either.** It is a conditional
  reordering derived from the effects' own semantics — and it is derived, not
  declared. `dep_reason/3` implements the two operative clauses of 613.8a —
  *"applying the other would change … the existence of the first effect"* and
  *"… what it applies to"*. The second is computed by building the
  counterfactual state `hyp4` in which only the other effect has been applied,
  and comparing target sets. 613.8b's dependency-*loop* fallback is `loop4`,
  mutual reachability in the dependency graph — a strongly connected
  component, by transitive closure. Its own relations do form strata
  (`dep_reason=5 ≤ edep4=6 ≤ eta4=7 ≤ live4=8 ≤ ty4=9`), which is a fact about
  how it is *computed* — below the layer it reorders, so nothing had to
  schedule it — not about what it *is*.
- **State-based actions (704.5f) are a second fixpoint above the first.**
  A creature with toughness ≤ 0 leaves the battlefield, which removes the
  effects its abilities generated, which re-runs every layer, which can kill
  something else. `demo.ts` drives that outer loop by retracting `on_bf/1`.

### The layer boundaries, measured

Two relations `boot.rofl` derived. `stratum/2` is the level a negation forces;
`reach/2` is the direction of the rule-graph dependency, which is forced even
where no negation makes it a level.

```
layer         below            above       verdict
1  copy       printed_type=0   ty1=1       forced by negation
3  text       ty1=1            ty3=1       FLAT
4  type       ty3=1            ty4=9       forced by negation
1  copy       printed_color=0  co1=1       forced by negation
3  text       co1=1            co3=1       FLAT
5  colour     co3=1            co5=2       forced by negation
1  copy       printed_ability=0 ab1=1      forced by negation
3  text       ab1=1            ab3=2       forced by negation
4  CR 305.7   ab3=2            ab4=9       forced by negation
6  abilities  ab4=9            ab6=10      forced by negation
1  copy       printed_ctrl=0   ct1=0       FLAT
2  control    ct1=0            ct2=1       forced by negation
1  copy       printed_pt=0     bp1=1       forced by negation
7a CDA       bp1=1            pt7a=11     forced by negation
7b set       pt7a=11          pt7b=12     forced by negation
7c modify    pt7b=12          pt7c=12     FLAT
7d switch    pt7c=12          pt7d=13     forced by negation
```

**13 of 17 boundaries are levels the kernel derived. All 17 are one-way in
`reach/2`** — the rule graph forces the direction everywhere, whether or not
a negation turns it into a numbered level.

The four flat ones are reported, not explained away, and each is a fact about
the domain rather than a defect in the encoding:

- `ty1 → ty3` and `co1 → co3`: a text-changing effect rewrites **text**, never
  types or colours. `ty3(O, T) :- ty1(O, T).` is a literal alias — there is no
  removal, so there is no negation to route.
- `printed_ctrl → ct1`: a copy effect does not change who controls the object.
- `pt7b → pt7c`: layer 7c only **adds**. It overrides nothing, so no negation
  exists; the order is still forced, positively, and `reach(pt7c, pt7b)` holds
  while `reach(pt7b, pt7c)` does not.

The CR states a **total** order over seven layers. The kernel enforces the
order the rules actually require, as levels where a layer removes something
and as a one-way dependency everywhere else. That is the accurate claim, and
the transcript prints the numbers rather than asserting it.

## The disputed case

**Blood Moon and Urborg, Tomb of Yawgmoth.** Both effects apply in layer 4.

- Urborg, `T300`: each land is a Swamp in addition to its other land types.
- Yavimaya, `T350`: each land is a Forest in addition to its other land types.
- Blood Moon, `T700`: each nonbasic land's land subtype is set to Mountain.

CR 305.7: changing a land's subtype to a basic land type *also removes the
abilities that came from its rules text*. Urborg and Yavimaya are nonbasic
lands. So applying Blood Moon would remove the very abilities that generate
their layer 4 effects — which is 613.8a clause (b), "the existence of the
first effect". Both depend on Blood Moon; by 613.8b Blood Moon applies first;
and the timestamps say the exact opposite.

The documented ruling (Felix Ramon M. Capule III, *"Blood Moon, Progenitor of
Dependency"*, Judges of Southeast Asia, 24 January 2019,
<https://blogs.magicjudges.org/searegion/2019/01/24/blood-moon-progenitor-of-dependency/>):

> "Hence no matter which order they enter the battlefield, we always apply
> Blood Moon first."

`wtf.rofl` gets there, and the derivation is in the transcript below: the
`why` tree for `bef4(e_bloodmoon, e_urborg)` bottoms out on `kills_ability`,
on `sel(e_bloodmoon, nonbasic_lands)`, and on Urborg being a land that is not
basic — that is, on 613.8a's own words.

The consequence is not confined to layer 4. With dependency the basic Forest
is **not** a Swamp and its controller has **one** Swamp; under timestamp order
it is a Forest Swamp and they have **two**. Nightmare's power and toughness
are a characteristic-defining ability counting Swamps, applied in layer 7a, so
the ruling decides the size of a creature three layers up: 2/2, not 3/3.

## The three queries

### `why <permanent>`

The derivation, one line per effect that touched it, each naming its **layer**
and its **timestamp**, in application order, with the reason wherever an
effect was overridden or never applied at all.

### `whynot` — "why is this creature not 4/4"

Grizzly Bears is 3/3. The missing `+1/+1` is Honor of the Pure, which wants a
white creature; the creature is blue, because in **layer 5** the Wisps set the
colour at `T650` after Painter's Servant added white at `T600`, and CR 613.7
gives it to the later timestamp (CR 613.8 does not rescue it — the `p5_dep`
probe is empty, so nothing in layer 5 depends on anything else in it).

"What would have to differ" is not left as an assertion. The demo makes that
exact change — swap the two timestamps — re-runs, and prints `3/3 -> 4/4`.

### `counting` — how many orders give the same answer

Every permutation of a sublayer's timestamps is a distinct application order.
The sweep re-runs the whole layer computation under each one and counts the
**distinct final boards**. One outcome over many orders means the interaction
is stable; more than one means the answer turns on which effect happened
first, and that is the configuration rulings get written about.

**What the count means here**, stated because the same-shaped metric reads in
opposite directions across the examples in this repo: WTF's count is *not* a
count of derivations, and the counting semiring does not produce it. **One is
the good answer.** One outcome over many orders means the interaction is stable
and nobody has to ask who arrived first; more than one marks a question the
rules leave to the timestamp. That is a sixth reading to add to robustness
(NOPE, OOPS), ambiguity (AKA), launderability (BLEEP), fragility (SPAT) and
magnitude (HUH): **order-sensitivity**, where larger is worse.

The table is in the transcript. The headline: **layer 4 gives one outcome over
all six orders — and the timestamp-only pipeline in section 12 of `wtf.rofl`
gives four.** The dependency rule is what collapses an order-dependent
configuration into a stable one, and the sweep demonstrates that instead of
asserting it. Layer 7c comes back stable for a different reason (integer
addition commutes); layers 5 and 6 come back order-dependent, correctly.

## The oracle

Stated plainly, because a demo that checks itself against itself checks
nothing.

1. **An independent implementation of CR 613**, `simulate()` in `demo.ts`: the
   obvious sequential layer walk in plain TypeScript, with 613.8a's dependency
   test done by cloning the board, applying the other effect and comparing,
   and 613.8b's scheduler written as the greedy loop the rule describes. It is
   **stricter** than `wtf.rofl` in one respect: it re-evaluates each effect's
   target set at the moment that effect is applied, where the rules read it
   off the previous layer. It agrees with the rules on **every board and every
   layer 4 order the sweep produces** — 42 boards, 41 orders, zero
   disagreements.
2. **The Comprehensive Rules' own worked examples**, which state their answers
   as numbers, reproduced on this battlefield: CR 613.4d Example 1 (a 1/3
   given +0/+1, switched, then given +5/+0) must be **4/6**, and CR 613.5
   Example 2 (Gray Ogre, a +1/+1 counter, +4/+4, +0/+2, then "becomes 0/1")
   must be **5/8**. Both come out.
3. **The documented judge ruling** above.

**Not run: an actual rules engine.** Java is installed on the machine this was
built on, but Forge and XMage are interactive game clients with no scriptable
"evaluate this board" entry point; building a game inside one to read layer
results out of it was out of scope. Saying so is better than implying an
engine was consulted.

## How to run it

```sh
node --experimental-strip-types examples/wtf/demo.ts
node --experimental-strip-types --test test/example-wtf.test.ts
```

No arguments, no build step, no dependencies.

## What this does *not* do

The corpus is 24 formalised effects over 17 permanents, chosen to cover all
seven layers, both CR worked examples and one real dependency. Completeness of
the rules is explicitly not a goal. Beyond that, the honest boundaries — each
one is a relation in section 13 of `wtf.rofl` that must be empty, and the
test asserts it, so none of these is a hidden assumption:

- **Target sets are read off the previous layer**, not re-evaluated after each
  same-layer effect. `unsound4/1` is the check: an effect whose target set
  shifts under a same-layer effect applied before it, and which is not dead
  anyway. Empty here. A dependency *loop* in which target sets genuinely move
  is outside this encoding; the loop machinery (613.8b's fallback) is present
  and exercised, but the corpus has no such loop, and `loop4` is empty.
- **`dead4` reads one level deep**: it asks whether an earlier same-layer
  effect removed a source's abilities, without asking whether that killer
  itself survived. `kill_chain4/1` is the check. Empty here.
- **`bef4` must be a strict total order** or every "the last one wins" rule
  above it is meaningless. `unordered4`, `cyclic4` and `intrans4` check
  antisymmetry, totality and transitivity. All empty.
- **The sublayers ordered by timestamp alone must have no dependency to
  miss.** `p5_dep`, `p6_dep` and `p72_dep` over-approximate 613.8a — an effect
  can only depend on another if that other writes a characteristic its
  selector reads, or removes its source's abilities. An empty
  over-approximation is a proof the exact relation is empty.
- **No two effects in one sublayer share a timestamp** (`ts_tie`). CR 613.7m
  breaks such ties in turn order, which is not modelled.
- Card names are identifiers. No card text is reproduced; the effects are the
  formalised continuous effects and nothing else.

## Where the kernel fought back

Three places, and the first is the one worth reading.

**1. `max` over a transitive closure — 613.8b's scheduler.** The rule says a
dependent effect "waits to apply until just after all of those effects have
been applied", which is a greedy topological sort keyed on timestamp. v0 has
no aggregation, and the natural encoding —

```
eta(E, X) :- edep(E, B), eta(B, Y), X is Y + 1.
eta(E, T) :- cand(E, T), not lower(E, T).
```

— puts a negation *inside* a recursion and `unstratified/1` rejects it, which
is correct: that program has no least fixpoint to compute. The way through is
to split it. Compute the dependency closure `anc4` **positively** first, then
take the maximum over the finished set with a single negation on top:

```
cts4(E, T)  :- lay4(E), eff_ts(E, T).
cts4(E, T)  :- anc4(E, B), eff_ts(B, T).
low4(E, T)  :- cts4(E, T), cts4(E, T2), T2 > T.
eta4(E, T)  :- cts4(E, T), not low4(E, T).
```

`eta4` is the largest timestamp among an effect and its dependency ancestors,
and sorting by `(eta4, timestamp)` reproduces the greedy walk exactly — the
oracle checks that claim on all 41 orders the sweep produces, and it holds.
The kernel did not make this expressible for free; it made the *unsound*
version inexpressible, which is a different and better thing.

**2. Sequential application inside one layer is not expressible at all.**
Datalog stratification is per-relation, so a step-indexed state
(`st(K+1, …) :- st(K, …), not cleared(K+1, …)`) is a negative cycle on
`st` however the index behaves. Distinct relation names per layer break the
cycle — which is why the state is `ty1/ty3/ty4`, `ab1/ab3/ab4/ab6` and not
`ty(Layer, …)`. Within a layer the trick is that "last writer wins" needs an
*order*, not a *walk*: `clob4(O, E) :- setter4(O, _, F), bef4(E, F)`. It works,
and the price is the audit relations above: the encoding is exact under
conditions the corpus satisfies and the tests check, rather than exact
unconditionally.

**3. Counting orders is not the counting semiring.** The spec's table says
"how many different application orders give the same result", and the
counting semiring counts **derivations**, which is a different number. So the
sweep does the honest thing: it enumerates the orders and re-runs the
computation, and the reported number is the count of distinct boards. The
counting semiring is not used to fake it. (`@next` ticks are not used either —
timestamps here are ordinary integer arguments.)

**The oracle found a real bug, which is the only reason to build one.**
`hits4` and `kills_ability` originally read `lay4(E)` without `eff_live(E)`:
correct for the base board, and wrong the moment a source leaves the
battlefield. A Blood Moon in the graveyard still removed Urborg's ability, and
the rules answered 2/2 for a creature the independent implementation made 6/6.
Fifteen passing tests did not see it, because they all asked about boards where
every source was on the battlefield. The differential test that *changes* the
board did. The fix is one premise per rule, and the reason it has to be
`eff_live` and not `live4` is written next to it — `live4` is three relations
further down and asking there would close the loop.

Two costs worth recording as measurements rather than impressions:

- **`boot.rofl`'s meta-layer dominates**. This program is ~200 rules; with
  `boot.rofl` loaded an evaluation costs seconds and materialises ~16 000
  facts, of which `reach` alone is ~3 400 and `derived_by` ~6 400. Without it,
  ~0.15 s and ~6 400 facts. The order sweep re-evaluates ~40 times, so it runs
  in a "lean" world: the strata are computed **once** by `boot.rofl` and
  carried in as facts, which is sound because a stratum is a property of the
  *rules* and the sweep changes only timestamps. `leanAgrees()` checks the two
  worlds agree fact for fact, and the test asserts it — a cache without that
  check is where correctness goes to die.
- **`boot.rofl` is load-bearing for this program, not an audit bolted on.**
  Loaded without it there are no `stratum/2` facts, every negation rule runs in
  a single final pass (LIMITS.md), and the answers are simply wrong — Urborg's
  dead effect applies, `eta4` never rises, Blood Moon loses. The test pins that
  too, because "the audit is optional" is exactly the kind of thing that gets
  believed until someone checks.

## The transcript

Real output of `node --experimental-strip-types examples/wtf/demo.ts`, pasted
unedited.

```
WTF -- What The Fixpoint
the Magic: the Gathering layer system (CR 613) as a stratified fixpoint

1. the layer order: what the kernel derived, and what it did not
================================================================

CR 613 has THREE ordering mechanisms and only the first is stratification.
Calling the other two strata would be a false claim about the kernel:

  (1) the seven layers          candidate for strata -- measured below
  (2) timestamps inside a layer NOT strata. Stratification cannot order
                                anything INSIDE one level at all. `bef_ts`
                                is ordinary computation over integers.
  (3) dependency overriding (2) NOT strata. It is a conditional reordering
                                derived from the effects' own semantics.
                                Its own relations are internally stratified,
                                which is a fact about how it is COMPUTED,
                                not about what it IS.

And (1) is not free either. A kernel stratum is a level forced by NEGATION;
an MTG layer is an order the rulebook ASSERTS. They coincide only where
layer N's rules negate on layer N-1's RELATION. wtf.rofl discharges that
deliberately -- every boundary is written

    lost_N(...) :- <layer N-1>(...), <it was replaced>.
    <layer N>   :- <layer N-1>(...), not lost_N(...).

Two relations boot.rofl derived, as evidence. `stratum/2` is the level;
`reach/2` is the direction of the rule-graph dependency, which is forced
even where no negation makes it a level.

  layer         below              above       verdict
  1  copy       printed_type=0     ty1=1       forced by negation
  3  text       ty1=1              ty3=1       FLAT
  4  type       ty3=1              ty4=9       forced by negation
  1  copy       printed_color=0    co1=1       forced by negation
  3  text       co1=1              co3=1       FLAT
  5  colour     co3=1              co5=2       forced by negation
  1  copy       printed_ability=0  ab1=1       forced by negation
  3  text       ab1=1              ab3=2       forced by negation
  4  CR 305.7   ab3=2              ab4=9       forced by negation
  6  abilities  ab4=9              ab6=10      forced by negation
  1  copy       printed_ctrl=0     ct1=0       FLAT
  2  control    ct1=0              ct2=1       forced by negation
  1  copy       printed_pt=0       bp1=1       forced by negation
  7a CDA        bp1=1              pt7a=11     forced by negation
  7b set        pt7a=11            pt7b=12     forced by negation
  7c modify     pt7b=12            pt7c=12     FLAT
  7d switch     pt7c=12            pt7d=13     forced by negation

  13 of 17 boundaries are levels the kernel derived.
  all 17 of 17 are one-way in reach/2:
  the rule graph forces the direction everywhere, whether or not a
  negation turns it into a numbered level.

  the flat ones, and why -- these are reported, not explained away:
    ty1 -> ty3          a text change rewrites TEXT, never types: ty3 is a literal alias
    co1 -> co3          same: a text change rewrites TEXT, never colours
    printed_ctrl -> ct1 a copy effect does not change who controls the object
    pt7b -> pt7c        7c only ADDS -- it overrides nothing, so there is no negation to route

  A negation that does NOT range over the layer below is semantically
  identical and buys nothing. Measured on this program, layer 5, both ways:
    co3 sits at stratum 1
    co5 :- co3, not lost5(O, C)   ->  stratum 2   (lost5 ranges over co3)
    co5 :- co3, not anyset5(O)    ->  stratum 1   (anyset5 is about EFFECTS)
    the two programs compute the same answers: true
  So the claim "the kernel derived the layer order" is worth exactly as
  much as the encoding that earns it, and no more.

  where the dependency system sits -- note this is mechanism (3) being
  COMPUTED below the layer it reorders, not (3) being stratification:
    dep_reason=5  <=  edep4=6  <=  eta4=7  <=  bef4=7  <=  live4=8  <=  ty4=9

  the plan the engine actually ran (levels of the rules that use `not`):
    ct2 at 1, ty4 at 9, ab6 at 10, pt7b at 12, pt7d at 13

  audits, all required empty:
    unstratified(X)                   0
    undefined_premise[audit](R, Rel)  0
    unordered4(A, B)                  0
    cyclic4(A, B)                     0
    intrans4(A, B, C)                 0
    kill_chain4(B)                    0
    unsound4(A)                       0
    p5_dep(A, B)                      0
    p6_dep(A, B)                      0
    p72_dep(A, B)                     0
    ts_tie(A, B)                      0
    rules not range-restricted        0
    demand-evaluated relations        0

2. why: the derivation of a permanent's characteristics
=======================================================

$ wtf grizzly
Grizzly Bears                     3/3

  printed                          2/2                           green  bear creature
  5  colour                 T600   +colour white                 OVERRIDDEN by a later setter
  5  colour                 T650   colour := blue                Cerulean Wisps: becomes blue
  7c modify power/toughness T100   +1/+1                         the lord ability

  => 3/3   blue   bear creature   p1   {}

$ wtf clone1
Clone                             4/4

  printed                          2/2                           colourless  creature shapeshifter
  1  copy                   T100   copies Grizzly Bears          Clone enters as a copy
  5  colour                 T600   +colour white                 Painter's Servant: everything is white too
  7c modify power/toughness T100   +1/+1                         the lord ability
  7c modify power/toughness T250   +1/+1                         Honor of the Pure: white creatures +1/+1

  => 4/4   green white   bear creature   p1   {}

$ wtf nightmare
Nightmare                         2/2

  printed                          no p/t                        black  creature horse
  5  colour                 T600   +colour white                 Painter's Servant: everything is white too
  7a CDA power/toughness    T50    p/t := 1/1                    Nightmare: p/t = Swamps you control (reads the answer layer 4 gave)
  7c modify power/toughness T250   +1/+1                         Honor of the Pure: white creatures +1/+1

  => 2/2   black white   creature horse   p1   {cda_swamps}

$ wtf gray_ogre
Gray Ogre                         5/8

  printed                          2/2                           red  creature ogre
  5  colour                 T600   +colour white                 Painter's Servant: everything is white too
  7b set power/toughness    T1000  p/t := 0/1                    becomes 0/1
  7c modify power/toughness T500   +1/+1                         a +1/+1 counter
  7c modify power/toughness T600   +4/+4                         +4/+4
  7c modify power/toughness T700   +0/+2                         +0/+2

  => 5/8   red white   creature ogre   p2   {}

$ wtf oracle
Sea Gate Oracle                   4/6

  printed                          1/3                           blue  creature human
  5  colour                 T600   +colour white                 Painter's Servant: everything is white too
  7c modify power/toughness T110   +0/+1                         +0/+1
  7c modify power/toughness T300   +5/+0                         +5/+0
  7d switch power/toughness T200   switch p/t                    Twisted Image: switch p/t

  => 4/6   blue white   creature human   p2   {etb_draw}

$ wtf mongrel
Wild Mongrel                      11/11

  printed                          2/2                           green  creature dog
  2  control                T900   controller := p2              Act of Treason: gain control
  5  colour                 T600   +colour white                 Painter's Servant: everything is white too
  6  abilities              T200   +ability flying               REMOVED by a later timestamp
  6  abilities              T400   -ability flying               Colossus Hammer: loses flying
  6  abilities              T900   +ability haste                REMOVED by a later timestamp
  6  abilities              T950   -ability discard_pump         Turn to Frog: loses all abilities
  6  abilities              T950   -ability flying               Turn to Frog: loses all abilities
  6  abilities              T950   -ability haste                Turn to Frog: loses all abilities
  7b set power/toughness    T950   p/t := 1/1                    Turn to Frog: becomes 1/1
  7c modify power/toughness T400   +10/+10                       Colossus Hammer: +10/+10

  => 11/11   green white   creature dog   p2   {}

$ wtf forest1
Forest                            (not a creature)

  printed                          no p/t                        colourless  basic forest land
  4  type                   T300   (would apply)                 NEVER APPLIES: Blood Moon: nonbasic lands are Mountains removed the ability generating it
  4  type                   T350   (would apply)                 NEVER APPLIES: Blood Moon: nonbasic lands are Mountains removed the ability generating it
  5  colour                 T600   +colour white                 Painter's Servant: everything is white too

  => --   white   basic forest land   p1   {}

$ wtf urborg
Urborg, Tomb of Yawgmoth          (not a creature)

  printed                          no p/t                        colourless  land legendary
  4  type                   T700   land type := mountain         Blood Moon: nonbasic lands are Mountains (+ CR 305.7: rules-text abilities go)
  4  type                   T300   (would apply)                 NEVER APPLIES: Blood Moon: nonbasic lands are Mountains removed the ability generating it
  4  type                   T350   (would apply)                 NEVER APPLIES: Blood Moon: nonbasic lands are Mountains removed the ability generating it
  5  colour                 T600   +colour white                 Painter's Servant: everything is white too

  => --   white   land legendary mountain   p1   {}

3. the disputed case: Blood Moon and Urborg, Tomb of Yawgmoth
=============================================================

The documented ruling (Felix Ramon M. Capule III, "Blood Moon, Progenitor
of Dependency", Judges of Southeast Asia, 24 January 2019):

    "Hence no matter which order they enter the battlefield, we always
     apply Blood Moon first."

layer 4 holds three effects. Their timestamps:
    T300   Urborg: each land is a Swamp
    T350   Yavimaya: each land is a Forest
    T700   Blood Moon: nonbasic lands are Mountains

CR 613.8a, applied to every ordered pair -- derived, not declared:
    Urborg: each land is a Swamp
      depends on Blood Moon: nonbasic lands are Mountains   [clause: existence]
    Yavimaya: each land is a Forest
      depends on Blood Moon: nonbasic lands are Mountains   [clause: existence]

CR 613.8b: the dependent effects wait. Application order:
    T700  ->  T300  ->  T350
    Blood Moon: nonbasic lands are Mountains
    -> Urborg: each land is a Swamp
    -> Yavimaya: each land is a Forest

Timestamp order would have been:
    T300  ->  T350  ->  T700

The sorting key the rules compute (eta = the largest timestamp among an
effect and its dependency ancestors -- CR 613.8b as a key, not a loop):
    eta 700   ts 700   Blood Moon: nonbasic lands are Mountains
    eta 700   ts 300   Urborg: each land is a Swamp
    eta 700   ts 350   Yavimaya: each land is a Forest

Effects that therefore never apply: Urborg: each land is a Swamp; Yavimaya: each land is a Forest


and the consequence, three layers up
------------------------------------

  the basic Forest is        basic forest land
  under timestamp order      basic forest land swamp
  Swamps p1 controls         1   (timestamp order: 2)
  Nightmare's p/t is a CDA reading that count in layer 7a: 2/2


why the order was what it was -- the kernel's own tree
------------------------------------------------------

bef4[main](e_bloodmoon,e_urborg)  <= r9fd50b1e @tick 0
  eta4[main](e_bloodmoon,700)  <= r2dc7df56 @tick 0
    cts4[main](e_bloodmoon,700)  <= r43ec379f @tick 0
      lay4[main](e_bloodmoon)  <= r7cbd7325 @tick 0
        eff_layer[main](e_bloodmoon,40) [axiom]
      eff_ts[main](e_bloodmoon,700) [axiom]
    not low4[main](e_bloodmoon,700) [finite failure]
      whynot low4[main](e_bloodmoon,700):
        rule rc6128089: low4[main](?E,?T)@now :- cts4[main](?E,?T)@now, cts4[main](?E,?T2)@now, ?T2 > ?T
          failed premise: 700 > 700 [builtin fails]
  eta4[main](e_urborg,700)  <= r2dc7df56 @tick 0
    cts4[main](e_urborg,700)  <= r1039a971 @tick 0
      anc4[main](e_urborg,e_bloodmoon)  <= r187536c0 @tick 0
        edep4[main](e_urborg,e_bloodmoon)  <= r9373230f @tick 0
          depends4[main](e_urborg,e_bloodmoon)  <= rd61ff2e6 @tick 0
            dep_reason[main](e_urborg,e_bloodmoon,existence)  <= r4c9976a1 @tick 0
              lay4[main](e_urborg)  <= r7cbd7325 @tick 0
                eff_layer[main](e_urborg,40) [axiom]
              eff_src[main](e_urborg,urborg) [axiom]
              kills_ability[main](e_bloodmoon,urborg)  <= r9180e2cd @tick 0
                lay4[main](e_bloodmoon)  <= r7cbd7325 @tick 0
                  eff_layer[main](e_bloodmoon,40) [axiom]
                eff_live[main](e_bloodmoon)  <= r45199372 @tick 0
                  eff_src[main](e_bloodmoon,blood_moon) [axiom]
                  on_bf[main](blood_moon) [axiom]
                does[main](e_bloodmoon,set_land_type(mountain)) [axiom]
                hits4[main](e_bloodmoon,urborg)  <= rd701c078 @tick 0
                  lay4[main](e_bloodmoon)  <= r7cbd7325 @tick 0
                    eff_layer[main](e_bloodmoon,40) [axiom]
                  eff_live[main](e_bloodmoon)  <= r45199372 @tick 0
                    eff_src[main](e_bloodmoon,blood_moon) [axiom]
                    on_bf[main](blood_moon) [axiom]
                  sel[main](e_bloodmoon,nonbasic_lands) [axiom]
                  ty3[main](urborg,land)  <= r8d3ece90 @tick 0
                    ty1[main](urborg,land)  <= r487f3bc4 @tick 0
                      on_bf[main](urborg) [axiom]
                      printed_type[main](urborg,land) [axiom]
                      not copied[main](urborg) [finite failure]
                        whynot copied[main](urborg):
                          rule ra6f1ad6f: copied[main](?O)@now :- copy_src[main](?O,?_$1)@now
                            failed premise: copy_src[main](urborg,?_$1#1)
                  not ty3[main](urborg,basic) [finite failure]
                    whynot ty3[main](urborg,basic):
                      rule r8d3ece90: ty3[main](?O,?T)@now :- ty1[main](?O,?T)@now
                        failed premise: ty1[main](urborg,basic)
              e_urborg != e_bloodmoon [builtin]
              cda_ok[main](e_urborg,e_bloodmoon)  <= r283146ce @tick 0
                eff[main](e_urborg) [axiom]
                eff[main](e_bloodmoon) [axiom]
                not cda[main](e_urborg) [finite failure]
                  whynot cda[main](e_urborg):
                    no rule concludes 'cda' and no matching base fact exists
                not cda[main](e_bloodmoon) [finite failure]
                  whynot cda[main](e_bloodmoon):
                    no rule concludes 'cda' and no matching base fact exists
          not loop4[main](e_urborg,e_bloodmoon) [finite failure]
            whynot loop4[main](e_urborg,e_bloodmoon):
              rule r52f3533f: loop4[main](?A,?B)@now :- reach4[main](?A,?B)@now, reach4[main](?B,?A)@now
                failed premise: reach4[main](e_bloodmoon,e_urborg)
      eff_ts[main](e_bloodmoon,700) [axiom]
    not low4[main](e_urborg,700) [finite failure]
      whynot low4[main](e_urborg,700):
        rule rc6128089: low4[main](?E,?T)@now :- cts4[main](?E,?T)@now, cts4[main](?E,?T2)@now, ?T2 > ?T
          failed premise: 300 > 700 [builtin fails]
          failed premise: 700 > 700 [builtin fails]
  anc4[main](e_urborg,e_bloodmoon)  <= r187536c0 @tick 0
    edep4[main](e_urborg,e_bloodmoon)  <= r9373230f @tick 0
      depends4[main](e_urborg,e_bloodmoon)  <= rd61ff2e6 @tick 0
        dep_reason[main](e_urborg,e_bloodmoon,existence)  <= r4c9976a1 @tick 0
          lay4[main](e_urborg)  <= r7cbd7325 @tick 0
            eff_layer[main](e_urborg,40) [axiom]
          eff_src[main](e_urborg,urborg) [axiom]
          kills_ability[main](e_bloodmoon,urborg)  <= r9180e2cd @tick 0
            lay4[main](e_bloodmoon)  <= r7cbd7325 @tick 0
              eff_layer[main](e_bloodmoon,40) [axiom]
            eff_live[main](e_bloodmoon)  <= r45199372 @tick 0
              eff_src[main](e_bloodmoon,blood_moon) [axiom]
              on_bf[main](blood_moon) [axiom]
            does[main](e_bloodmoon,set_land_type(mountain)) [axiom]
            hits4[main](e_bloodmoon,urborg)  <= rd701c078 @tick 0
              lay4[main](e_bloodmoon)  <= r7cbd7325 @tick 0
                eff_layer[main](e_bloodmoon,40) [axiom]
              eff_live[main](e_bloodmoon)  <= r45199372 @tick 0
                eff_src[main](e_bloodmoon,blood_moon) [axiom]
                on_bf[main](blood_moon) [axiom]
              sel[main](e_bloodmoon,nonbasic_lands) [axiom]
              ty3[main](urborg,land)  <= r8d3ece90 @tick 0
                ty1[main](urborg,land)  <= r487f3bc4 @tick 0
                  on_bf[main](urborg) [axiom]
                  printed_type[main](urborg,land) [axiom]
                  not copied[main](urborg) [finite failure]
                    whynot copied[main](urborg):
                      rule ra6f1ad6f: copied[main](?O)@now :- copy_src[main](?O,?_$1)@now
                        failed premise: copy_src[main](urborg,?_$1#5)
              not ty3[main](urborg,basic) [finite failure]
                whynot ty3[main](urborg,basic):
                  rule r8d3ece90: ty3[main](?O,?T)@now :- ty1[main](?O,?T)@now
                    failed premise: ty1[main](urborg,basic)
          e_urborg != e_bloodmoon [builtin]
          cda_ok[main](e_urborg,e_bloodmoon)  <= r283146ce @tick 0
            eff[main](e_urborg) [axiom]
            eff[main](e_bloodmoon) [axiom]
            not cda[main](e_urborg) [finite failure]
              whynot cda[main](e_urborg):
                no rule concludes 'cda' and no matching base fact exists
            not cda[main](e_bloodmoon) [finite failure]
              whynot cda[main](e_bloodmoon):
                no rule concludes 'cda' and no matching base fact exists
      not loop4[main](e_urborg,e_bloodmoon) [finite failure]
        whynot loop4[main](e_urborg,e_bloodmoon):
          rule r52f3533f: loop4[main](?A,?B)@now :- reach4[main](?A,?B)@now, reach4[main](?B,?A)@now
            failed premise: reach4[main](e_bloodmoon,e_urborg)


and the question the other way round
------------------------------------

whynot ty4[main](forest1,swamp):
  rule r3138be4c: ty4[main](?O,?T)@now :- adder4[main](?O,?T,?E)@now, not clob4[main](?O,?E)@now
    failed premise: adder4[main](forest1,swamp,?E#0)
      rule r6aad27a0: adder4[main](?O,?T,?E)@now :- live4[main](?E)@now, does[main](?E,add_type(?T))@now, hits4[main](?E,?O)@now
        failed premise: does[main](e_bloodmoon,add_type(swamp))
          [depth limit 2 reached]
  rule r8c9a0b3d: ty4[main](?O,?T)@now :- setter4[main](?O,?T,?E)@now, not clob4[main](?O,?E)@now
    failed premise: setter4[main](forest1,swamp,?E#2)
      rule r774899e4: setter4[main](?O,?T,?E)@now :- live4[main](?E)@now, does[main](?E,set_land_type(?T))@now, hits4[main](?E,?O)@now
        failed premise: does[main](e_bloodmoon,set_land_type(swamp))
          [depth limit 2 reached]
  rule r69f0ec0c: ty4[main](?O,?T)@now :- ty3[main](?O,?T)@now, land_type[main](?T)@now, not lost4[main](?O,?T)@now
    failed premise: ty3[main](forest1,swamp)
      rule r8d3ece90: ty3[main](?O,?T)@now :- ty1[main](?O,?T)@now
        failed premise: ty1[main](forest1,swamp)
          [depth limit 2 reached]
  rule r20fd114d: ty4[main](?O,?T)@now :- ty3[main](?O,?T)@now, not land_type[main](?T)@now
    failed premise: ty3[main](forest1,swamp)
      rule r8d3ece90: ty3[main](?O,?T)@now :- ty1[main](?O,?T)@now
        failed premise: ty1[main](forest1,swamp)
          [depth limit 2 reached]

4. whynot: why is Grizzly Bears not 4/4
=======================================

$ wtf -n grizzly 4/4

  it is 3/3, not 4/4.

  the missing +1/+1 is Honor of the Pure: white creatures +1/+1.
  it wants colour white; grizzly's colour after layer 5 is blue.

  layer 5 DID add white at T600 (Painter's Servant: everything is white too),
  but T650 (Cerulean Wisps: becomes blue) SET the colour to blue, and a later timestamp in the same layer wins
  (CR 613.7 -- and CR 613.8 does not apply: p5_dep is empty, so
  nothing in layer 5 depends on anything else in layer 5).

  what would have to differ: T650 < T600, or Cerulean Wisps: becomes blue absent.

  making that change and re-running: 3/3 -> 4/4


the kernel's own demonstration
------------------------------

whynot mod73[main](grizzly,e_honor,1,1):
  rule rb9e6e291: mod73[main](?O,?E,?DP,?DT)@now :- hits73[main](?E,?O)@now, anthem_eff[main](?E,?S)@now, ab6[main](?S,anthem(?_$1,?DP,?DT))@now
    failed premise: hits73[main](e_honor,grizzly)
      rule rb3eddda0: hits73[main](?E,?O)@now :- live73[main](?E)@now, anthem_eff[main](?E,?S)@now, ab6[main](?S,anthem(?C,?_$2,?_$3))@now, ty4[main](?O,creature)@now, co5[main](?O,?C)@now, ct2[main](?O,?Pl)@now, ct2[main](?S,?Pl)@now
        failed premise: co5[main](grizzly,white)
          rule r39ea5fd3: co5[main](?O,?C)@now :- addcol5[main](?O,?C,?E)@now, not clob5[main](?O,?E)@now
            failed premise: not clob5[main](grizzly,e_painter) -- blocked: clob5[main](grizzly,e_painter) holds
          rule r6f7397be: co5[main](?O,?C)@now :- co3[main](?O,?C)@now, not lost5[main](?O,?C)@now
            failed premise: co3[main](grizzly,white)
              [depth limit 3 reached]
          rule r2d6a0244: co5[main](?O,?C)@now :- setcol5[main](?O,?C,?E)@now, not clob5[main](?O,?E)@now
            failed premise: setcol5[main](grizzly,white,?E#4)
              [depth limit 3 reached]
      rule rc822e888: hits73[main](?E,?O)@now :- live73[main](?E)@now, lord_eff[main](?E,?S)@now, ab6[main](?S,lord(?ST,?_$2,?_$3))@now, ty4[main](?O,?ST)@now, ?O != ?S, ct2[main](?O,?Pl)@now, ct2[main](?S,?Pl)@now
        failed premise: lord_eff[main](e_honor,?S#5)
          no rule concludes 'lord_eff' and no matching base fact exists
      rule rbde0de9d: hits73[main](?E,?O)@now :- live73[main](?E)@now, sel[main](?E,only(?O))@now, on_bf[main](?O)@now
        failed premise: sel[main](e_honor,only(grizzly))
          no rule concludes 'sel' and no matching base fact exists
  rule r8a2c04dd: mod73[main](?O,?E,?DP,?DT)@now :- hits73[main](?E,?O)@now, does[main](?E,mod_pt(?DP,?DT))@now
    failed premise: hits73[main](e_honor,grizzly)
      rule rb3eddda0: hits73[main](?E,?O)@now :- live73[main](?E)@now, anthem_eff[main](?E,?S)@now, ab6[main](?S,anthem(?C,?_$2,?_$3))@now, ty4[main](?O,creature)@now, co5[main](?O,?C)@now, ct2[main](?O,?Pl)@now, ct2[main](?S,?Pl)@now
        failed premise: co5[main](grizzly,white)
          rule r39ea5fd3: co5[main](?O,?C)@now :- addcol5[main](?O,?C,?E)@now, not clob5[main](?O,?E)@now
            failed premise: not clob5[main](grizzly,e_painter) -- blocked: clob5[main](grizzly,e_painter) holds
          rule r6f7397be: co5[main](?O,?C)@now :- co3[main](?O,?C)@now, not lost5[main](?O,?C)@now
            failed premise: co3[main](grizzly,white)
              [depth limit 3 reached]
          rule r2d6a0244: co5[main](?O,?C)@now :- setcol5[main](?O,?C,?E)@now, not clob5[main](?O,?E)@now
            failed premise: setcol5[main](grizzly,white,?E#11)
              [depth limit 3 reached]
      rule rc822e888: hits73[main](?E,?O)@now :- live73[main](?E)@now, lord_eff[main](?E,?S)@now, ab6[main](?S,lord(?ST,?_$2,?_$3))@now, ty4[main](?O,?ST)@now, ?O != ?S, ct2[main](?O,?Pl)@now, ct2[main](?S,?Pl)@now
        failed premise: lord_eff[main](e_honor,?S#12)
          no rule concludes 'lord_eff' and no matching base fact exists
      rule rbde0de9d: hits73[main](?E,?O)@now :- live73[main](?E)@now, sel[main](?E,only(?O))@now, on_bf[main](?O)@now
        failed premise: sel[main](e_honor,only(grizzly))
          no rule concludes 'sel' and no matching base fact exists
  rule rdc6e284d: mod73[main](?O,?E,?DP,?DT)@now :- hits73[main](?E,?O)@now, lord_eff[main](?E,?S)@now, ab6[main](?S,lord(?_$1,?DP,?DT))@now
    failed premise: hits73[main](e_honor,grizzly)
      rule rb3eddda0: hits73[main](?E,?O)@now :- live73[main](?E)@now, anthem_eff[main](?E,?S)@now, ab6[main](?S,anthem(?C,?_$2,?_$3))@now, ty4[main](?O,creature)@now, co5[main](?O,?C)@now, ct2[main](?O,?Pl)@now, ct2[main](?S,?Pl)@now
        failed premise: co5[main](grizzly,white)
          rule r39ea5fd3: co5[main](?O,?C)@now :- addcol5[main](?O,?C,?E)@now, not clob5[main](?O,?E)@now
            failed premise: not clob5[main](grizzly,e_painter) -- blocked: clob5[main](grizzly,e_painter) holds
          rule r6f7397be: co5[main](?O,?C)@now :- co3[main](?O,?C)@now, not lost5[main](?O,?C)@now
            failed premise: co3[main](grizzly,white)
              [depth limit 3 reached]
          rule r2d6a0244: co5[main](?O,?C)@now :- setcol5[main](?O,?C,?E)@now, not clob5[main](?O,?E)@now
            failed premise: setcol5[main](grizzly,white,?E#18)
              [depth limit 3 reached]
      rule rc822e888: hits73[main](?E,?O)@now :- live73[main](?E)@now, lord_eff[main](?E,?S)@now, ab6[main](?S,lord(?ST,?_$2,?_$3))@now, ty4[main](?O,?ST)@now, ?O != ?S, ct2[main](?O,?Pl)@now, ct2[main](?S,?Pl)@now
        failed premise: lord_eff[main](e_honor,?S#19)
          no rule concludes 'lord_eff' and no matching base fact exists
      rule rbde0de9d: hits73[main](?E,?O)@now :- live73[main](?E)@now, sel[main](?E,only(?O))@now, on_bf[main](?O)@now
        failed premise: sel[main](e_honor,only(grizzly))
          no rule concludes 'sel' and no matching base fact exists

5. which permanents jointly determine that 3/3
==============================================

  discipline held: true   facts on a support cycle: 184
  minimal source sets: 1, the smallest with 24 base facts.
  the ones that name a permanent or an effect:
    does[main](e_evolution,text_change(elf,bear))
    eff_free[main](e_evolution)
    eff_layer[main](e_archdruid,73)
    eff_layer[main](e_evolution,30)
    eff_src[main](e_archdruid,archdruid)
    on_bf[main](archdruid)
    on_bf[main](grizzly)
    printed_ability[main](archdruid,lord(elf,1,1))
    printed_ctrl[main](archdruid,p1)
    printed_ctrl[main](grizzly,p1)
    printed_pt[main](grizzly,2,2)
    printed_type[main](grizzly,bear)
    printed_type[main](grizzly,creature)
    sel[main](e_evolution,only(archdruid))

  and 9 bookkeeping facts (eord/nmod). Those are honest: v0 has no
  aggregation, so layer 7c's sum is a fold that walks every slot of a
  declared enumeration, and a slot it walked past really is part of the
  derivation. The size of a provenance term is a property of how the
  question had to be asked, not only of the answer.

6. counting: how many application orders give the same answer
=============================================================

  lean world agrees with the full world fact for fact: true

  sublayer                                effects  orders  outcomes  verdict
  4  type                                 3        6       1         stable
  5  colour                               2        2       2         ORDER-DEPENDENT
  6  abilities                            4        24      4         ORDER-DEPENDENT
  7b set power/toughness                  2        2       1         stable
  7c modify power/toughness [gray_ogre]   3        6       1         stable
  7d switch power/toughness               1        1       1         stable

  layer 4 under the SAME 6 orders, read off the timestamp-only
  pipeline in section 12 of wtf.rofl: 4 distinct outcomes.

  So the dependency rule is not decoration. Layer 4 is the sublayer whose
  answer would turn on which land entered first; CR 613.8 is what makes it
  one answer instead of many, and the sweep is what shows that rather than
  asserting it. The sublayers that still come back ORDER-DEPENDENT are the
  ones where the rules really do let the timestamp decide -- which is where
  a judge gets asked which permanent hit the table first.

7. state-based actions: the fixpoint above the layer system
===========================================================

  Two removal spells resolve. CR 704.5f puts a creature with toughness
  0 or less into its graveyard, which removes the effects its abilities
  generated, which re-runs every layer, which can kill something else.

  round 1:
    archdruid -1/-1
    clone1 4/4
    gray_ogre 5/8
    grizzly 1/1
    mongrel 11/11
    nightmare 2/2
    oracle 4/6
    painter 2/4
    lethal (CR 704.5f): archdruid
  round 2:
    clone1 3/3
    gray_ogre 5/8
    grizzly 0/0
    mongrel 11/11
    nightmare 2/2
    oracle 4/6
    painter 2/4
    lethal (CR 704.5f): grizzly
  round 3:
    clone1 3/3
    gray_ogre 5/8
    mongrel 11/11
    nightmare 2/2
    oracle 4/6
    painter 2/4
    lethal (CR 704.5f): (none) -- quiescent

  the outer fixpoint took 3 rounds; a single pass would have
  stopped after the first and reported the wrong board.

8. the oracle
=============

  (a) An independent implementation of CR 613 in plain TypeScript
      (simulate() in this file): the obvious sequential layer walk, with
      613.8a's dependency test done by cloning the board, applying the
      other effect, and comparing -- and target sets re-evaluated at the
      moment each effect is applied, which is STRICTER than the rules in
      wtf.rofl, where they are read off the previous layer.

      boards compared (base + every sweep permutation): 42
      disagreements:                                    0
      layer 4 ORDERS compared:                          41
      order disagreements:                              0

  (b) The Comprehensive Rules' own worked examples, which state their
      answers, reproduced on this battlefield:

      ok   CR 613.4d Example 1 (1/3, +0/+1, switch, +5/+0)
           rules say 4/6; wtf.rofl computes 4/6
      ok   CR 613.5 Example 2 (2/2, +1/+1 counter, +4/+4, +0/+2, becomes 0/1)
           rules say 5/8; wtf.rofl computes 5/8

  (c) The documented judge ruling in section 3.

  NOT run: an actual rules engine. Java is present on this machine, but
  Forge and XMage are interactive game clients with no scriptable
  "evaluate this board" entry point; constructing a game to read layer
  results out of one was out of scope here. Said plainly rather than
  implied.
```
