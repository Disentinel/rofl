# GOOF — Grothendieck Or Other Foundations

**One rule set. Nine books. The rules never name a foundation.**

The best advertisement for "rules separate, semantics separate" is not an
invented alien logic. It is real mathematics — foundations that living people
fought over for two thousand years, which from here look alien enough and are
nevertheless authentic: nothing has to be made up and nothing has to be bent to
fit.

Euclidean and hyperbolic geometry are *the same theorems derived from different
axiom sets*. That is exactly one rule set evaluated against different ledgers,
and it is why the perspective slot in this example holds a foundation:

```prolog
axiom[euclid](post5_unique).        -- Playfair: exactly one parallel
axiom[lobachevsky](post5_many).     -- at least two
axiom[riemann](post5_none).         -- none, and postulate 2 goes too
```

Both of the first two hold. Neither is an error. The books disagree, in the
strongest sense available — one proves `angle_sum_180`, the other proves the
angle sum is strictly less and *proportional to area* — and the engine holds
both without a special case, because they are entries in different ledgers.

## How to run

```sh
node --experimental-strip-types examples/goof/demo.ts        # the transcript below
node --experimental-strip-types --test test/example-goof.test.ts
```

`demo.ts` splits `goof.rofl` on its `-- @who X` markers and loads each book
under the identity of the person who published it, so `asserted_by` is the load
identity checked against `authority`. That is the whole forgery story: **who
wrote an axiom is not a column**.

## What it shows

| the spec asks for | where |
|---|---|
| one rule set, the axiomatics as a switch | `goof.rofl` §4, transcript §3 |
| three geometries; the angle sum as a function of area, derived | §4.4, transcript §7 |
| counting answers "how many lines through the point" | §4.3, transcript §4 |
| the polynomial shows a theorem's dependence on the fifth postulate | transcript §6 |
| constructive mode: `whynot` points at the reductio | transcript §8 |
| paraconsistent mode does not explode on a contradiction | §4.2, transcript §9 |
| the rules do not change by a symbol when the foundation changes | transcript §3, pinned by the test |
| knots untie above three dimensions | transcript §10 |

## The nine books

Each is a ledger. Each is one block of `axiom[G](...)` facts, written by the
person whose name the ledger carries.

```
  book          published  title                          axioms  theorems  derived
  euclid         -300      elements                           9        24       15
  solid          -300      elements_xi                        9        24       15
  saccheri       1733      euclides_vindicatus                8        18       10
  lobachevsky    1829      imaginary_geometry                 9        23       14
  schlafli       1852      vielfache_kontinuitaet             9        24       15
  riemann        1854      habilitation                       9        17        8
  frege          1893      grundgesetze                      10        37       27
  brouwer        1908      unreliability                      8        21       13
  dacosta        1963      calculs_inconsistants              9        28       19
```

The switch is measured rather than asserted. `only_in(G, H, A)` is an ordinary
derived relation — *A is an axiom of G that H does not hold* — and it says how
far apart two books are:

```
    euclid       vs lobachevsky   euclid only:  post5_unique                 lobachevsky only: post5_many
    euclid       vs riemann       euclid only:  post2_extend, post5_unique   riemann only:     post2_finite, post5_none
    euclid       vs saccheri      euclid only:  post5_unique                 saccheri only:    (none)
    euclid       vs brouwer       euclid only:  excluded_middle              brouwer only:     (none)
    solid        vs schlafli      solid only:   dim_space                    schlafli only:    dim_four
    frege        vs dacosta       frege only:   ex_falso                     dacosta only:     (none)
```

**Riemann differs by two lines, and that is not a defect in the story — it is
the story.** Elliptic geometry cannot merely deny the fifth postulate: a line on
a sphere is unbounded but *finite*, so postulate 2 goes as well. Section "which
axioms carry a theorem" below shows which theorems die of which change, and the
answer is not the one the textbook summary suggests.

## One rule set

Everything after the `-- @rules` marker in `goof.rofl` is rules, and `[G]` is a
ledger variable: the same rule reads the book it writes into, whichever book
that is.

```prolog
thm[G](P) :- axiom[G](P).

holds_from[G](S, K1) :- foundation[G](_, _), need_count(S, N), K1 is N + 1.
holds_from[G](S, K)  :- needs(S, K, P), thm[G](P), K1 is K + 1, holds_from[G](S, K1).

thm[G](P) :- step(S, P), holds_from[G](S, 1).
```

That is the entire deduction engine: an axiom is a theorem, and a step whose
premises are all theorems concludes one. The premise walk by index is
`moot.rofl`'s device, and it is here for the same reason — "every premise of S
holds" is a universal over an open set, the obvious spelling puts the rule in a
negative cycle with itself, and walking the premises by index turns it into a
positive recursion the engine stratifies without complaint.

The claim "the rules do not change when the foundation does" is only worth
making if the alternative is on the table. The alternative is one copy of every
rule per book — which is what `examples/sus` and `examples/aka` do — and the
demo generates it from the same text and loads it:

```
  28 clauses after the @rules marker, 24 of them polymorphic in the ledger.
  the string "euclid" appears in them 4 times.

  substitute the ledger variable away — one copy per book, which is what an
  example that wants an empty audit has to do — and the rule set goes from
  28 clauses to 292. The rule that compares two books is copied once per
  PAIR:
     81x  only_in[main](G, H, A) :- axiom[G](A), foundation[H](_, _), not axiom[H](A).
      9x  thm[G](P) :- axiom[G](P).
      9x  holds_from[G](S, K1) :- foundation[G](_, _), need_count(S, N), K1 is N + 1.

  both programs loaded, and every domain fact compared:
    polymorphic: 1716 facts     expanded: 1716 facts     IDENTICAL
    leak[audit] rows — polymorphic: 0   expanded: 0
    rules not range-restricted, expanded: 0
```

(The four occurrences of "euclid" in the rule text are in comments.)

Both programs derive **exactly** the same 1716 domain facts. The trade is nine
copies of every rule — paid against the thesis, because a rule set with
`[euclid]` written into it *does* change when the foundation changes. It used
to cost an audit row as well; see "Where the kernel fought back" below for what
that row was and what removing it took.

## How many lines through the point miss the given line

Euclid's fifth postulate is about the **number**. Existence is neutral: I.31
proves that at least one parallel exists using no parallel axiom at all. Four
rules turn the axiom into witnesses, and the last one is the hyperbolic
construction — between any two distinct parallels lies another:

```prolog
parallel[G](sole)     :- thm[G](parallel_exists), axiom[G](post5_unique).
parallel[G](limit_a)  :- thm[G](parallel_exists), axiom[G](post5_many).
parallel[G](limit_b)  :- thm[G](parallel_exists), axiom[G](post5_many).
parallel[G](interior) :- parallel[G](X), parallel[G](Y), X != Y.
```

Nothing counts anything in TypeScript. The number is `countingSemiring` folded
over the support the Boolean run already recorded:

```
   book          exists?  witnesses                          derivations
   euclid        yes      sole                               1
   solid         yes      sole                               1
   saccheri      yes      (none)                             0
   lobachevsky   yes      interior, limit_a, limit_b         infinitely many
   schlafli      yes      sole                               1
   riemann       no       (none)                             0
   frege         yes      interior, limit_a, limit_b, sole   infinitely many
   brouwer       yes      sole                               1
   dacosta       yes      interior, limit_a, limit_b, sole   infinitely many
```

One, none, infinitely many — and the third is not a special case in the rules.
`interior` sits on a cycle of the support graph, because the construction feeds
on its own output, so the `CLOSED` counting semiring closes the cycle and
answers `INFINITE`. In Euclid the construction never fires: it needs two
*different* parallels and there is one.

**What the count counts.** It is a count of *derivations*, not of lines. The two
coincide here because each application of the construction exhibits a new line
strictly between two old ones — a fact about this construction, not about
counting in general, and it is the modelling assumption that carries the word
"infinitely many" from the algebra back to the geometry.

**The positive control.** An `INFINITE` that comes out of closing a cycle is a
claim about the support graph, and the way to test it is to refuse to close the
cycle: `depthBoundedCountingSemiring` counts derivations of height at most *n*.

```
    derivations of height at most      lobachevsky/interior        euclid/sole
      10                                       0                  1
      15                                     682                  1
      20                                  699050                  1
      25                               715827882                  1
```

One column grows without settling and the other is fixed by depth 10. The
`CLOSED` instance is not hiding a failure to converge; it is naming one.

Notice also `saccheri`: it proves a parallel exists and has no witnesses at all.
Neutral geometry knows there is one and cannot say how many. The model declines
to guess rather than defaulting to Euclid.

## Thirty years of Saccheri, answered by `whynot`

Girolamo Saccheri assumed the fifth postulate was a *theorem* of the other four
and spent his life hunting the contradiction that would prove it
(*Euclides ab omni naevo vindicatus*, 1733). His book is here as a ledger with
the four postulates and no parallel axiom at all.

```
whynot thm[saccheri](angle_sum_180):
  rule rac159495: thm[?G](?P)@now :- axiom[?G](?P)@now
    failed premise: axiom[saccheri](angle_sum_180)
  rule r7cb3920d: thm[?G](?P)@now :- explodes[?G](?P)@now
    failed premise: explodes[saccheri](angle_sum_180)
  rule r9749238b: thm[?G](?P)@now :- step[main](?S,?P)@now, holds_from[?G](?S,1)@now
    failed premise: holds_from[saccheri](s_playfair,1)
```

Three ways to conclude it, three failures — and the second one is the shape of
Saccheri's own programme: *if the book explodes, everything follows*. It does
not explode. Drill into the third:

```
whynot holds_from[saccheri](s_playfair,1):
  rule r1cadcdda: holds_from[?G](?S,?K)@now :- needs[main](?S,?K,?P)@now, thm[?G](?P)@now, ?K1 is +(?K,1), holds_from[?G](?S,?K1)@now
    failed premise: thm[saccheri](post5_unique)
      rule rac159495: thm[?G](?P)@now :- axiom[?G](?P)@now
        failed premise: axiom[saccheri](post5_unique)
          no rule concludes 'axiom' and no matching base fact exists
      rule r7cb3920d: thm[?G](?P)@now :- explodes[?G](?P)@now
        failed premise: explodes[saccheri](post5_unique)
          rule r6f42d5ca: explodes[?G](?P)@now :- clash[?G](?_$0,?_$1)@now, axiom[?G](ex_falso)@now, proposition[main](?P)@now
            failed premise: clash[saccheri](?_$0#3,?_$1#3)
              [depth limit 3 reached]
      rule r9749238b: thm[?G](?P)@now :- step[main](?S,?P)@now, holds_from[?G](?S,1)@now
        failed premise: step[main](?S#4,post5_unique)
          no rule concludes 'step' and no matching base fact exists
```

`post5_unique`. Beltrami settled it in 1868 by building a model; here it is a
finite failure with a demonstration attached.

## Which axioms carry a theorem

The provenance polynomial, projected onto the axioms of the book the theorem
was proved in. *Does this theorem need the fifth postulate* is one fold of a
semiring over the support the Boolean run already recorded:

```
   theorem                     book          needs, in every derivation
   pons_asinorum               euclid        post1_two_points post4_right_angles
   triangle_inequality         euclid        post1_two_points post4_right_angles
   exterior_angle              euclid        post1_two_points post2_extend post4_right_angles
   angle_sum_at_most_180       euclid        archimedes excluded_middle post1_two_points post2_extend post4_right_angles
   parallel_exists             euclid        post1_two_points post2_extend post3_circle post4_right_angles
   angle_sum_180               euclid        post1_two_points post2_extend post4_right_angles post5_unique
   pythagoras                  euclid        post1_two_points post2_extend post4_right_angles post5_unique
   aaa_congruence              lobachevsky   archimedes excluded_middle post1_two_points post2_extend post4_right_angles post5_many
   aaa_congruence              riemann       archimedes post1_two_points post2_finite post5_none
   every_knot_unties           frege         ex_falso post5_many post5_unique
```

Five of Euclid's fifteen derived theorems cannot be proved without the fifth
postulate — `angle_sum_180`, `pythagoras`, `rectangle_exists`,
`similar_triangles_exist`, `thales_semicircle` — and ten survive its removal.
The last row is the exploding book proving a four-dimensional theorem it has no
dimension axiom for, and naming exactly what it used to do so.

**The elliptic surprise.** Euclid I.16, the exterior angle theorem, rests on
postulate 2: its proof doubles a median, and on a sphere that construction runs
out of line. So the whole neutral tower above I.16 falls in Riemann's book:

```
    theorems Euclid has and Riemann does not: all_or_none, alternate_angles_parallel, angle_sum_180,
      angle_sum_at_most_180, exterior_angle, parallel_exists, pythagoras, rectangle_exists,
      similar_triangles_exist, thales_semicircle
    of those, the ones that never needed the fifth at all: all_or_none, alternate_angles_parallel,
      angle_sum_at_most_180, exterior_angle, parallel_exists
```

Five *neutral* theorems, lost to a change nobody counts as part of "the
parallel debate". Riemann pays for postulate 2, not for postulate 5 — which is
the sort of thing a person answers by reading proofs for a week and the engine
answers by folding a semiring.

## The angle sum as a function of area

`law[G](K)` is the defect coefficient, and it is **derived from which theorem
about the angle sum that book proved**, not asserted:

```prolog
law[G](0)  :- thm[G](angle_sum_180).
law[G](1)  :- thm[G](defect_proportional_to_area).
law[G](-1) :- thm[G](excess_proportional_to_area).

angle_sum[G](T, S) :- leaf(T, A), law[G](K), S is 180 - K * A.
angle_sum[G](T, S) :- cut(T, T1, T2), angle_sum[G](T1, S1), angle_sum[G](T2, S2),
                      S is S1 + S2 - 180.
```

The second rule uses no law at all. It is the additivity of the defect written
in degrees: the two angles at the foot of a cevian make a straight line, so the
sums of the parts overcount by exactly 180. It is a *neutral* theorem, and it
means every compound triangle gets its angle sum derived twice — once from its
own area, once from its parts — by routes sharing no rule.

```
   book          law         t_a/2      t_b/3   t_left/5  t_right/7 t_whole/12
   euclid            0         180        180        180        180        180
   solid             0         180        180        180        180        180
   saccheri                      —          —          —          —          —
   lobachevsky       1         178        177        175        173        168
   schlafli          0         180        180        180        180        180
   riemann          -1         182        183        185        187        192
   frege         -1,0,1    3 values   3 values   9 values   3 values  23 values
   brouwer           0         180        180        180        180        180
   dacosta         0,1     178/180    177/180   4 values    173/180   8 values
```

`saccheri` has no law and therefore no angle sum at all. That row is the model
declining to guess: **neutral geometry does not determine the angle sum**, and
an engine that answered 180 there would be wrong in a way no test would catch.

`angle_sum[euclid](t_whole, 180)` has 3 derivations by the counting semiring —
one from its own area, one for each way of composing it out of the cut tree —
and they agree. The gate that would notice if they did not is `disagree/3`, and
**it is not an assumption wearing a gate's clothes**: it fires, in the two books
that prove two contradictory angle-sum laws at once.

```
    ? disagree[euclid](T, S1, S2)     -> 0 rows
    ? disagree[lobachevsky](T, S1, S2)-> 0 rows
    ? disagree[riemann](T, S1, S2)    -> 0 rows
    ? disagree[dacosta](T, S1, S2)    -> 37 rows
    ? disagree[frege](T, S1, S2)      -> 298 rows
```

**Similarity, derived rather than declared.** Two triangles of different area
can share their angles only if the sum does not depend on the area:

```
    euclid        similar pairs: 1   the two triangles can share their angles
    lobachevsky   similar pairs: 0   t_left (area 5) and t_whole (area 12) differ by 7 degrees
    riemann       similar pairs: 0   t_left (area 5) and t_whole (area 12) differ by 7 degrees
```

A triangle in a curved book knows its own size. The same statement is also
proved symbolically as `aaa_congruence`, through the corpus rather than through
arithmetic, in exactly the books where the arithmetic says it.

## Brouwer: the geometry untouched, the logic one line shorter

A logical principle is an axiom like any other, and a step that argues by
contradiction names it among its premises. Nothing in the rules knows what logic
is.

```prolog
step(s_sacc_leg, angle_sum_at_most_180).
needs(s_sacc_leg, 1, exterior_angle).
needs(s_sacc_leg, 2, archimedes).
needs(s_sacc_leg, 3, excluded_middle).
```

Remove `excluded_middle` from a book and exactly the theorems whose only proof
is a reductio stop being derivable:

```
    euclid only: excluded_middle
    theorems lost: all_or_none, angle_sum_at_most_180

  and the two that went are exactly the two the corpus marks as reductios:
    all_or_none              s_legendre2
    angle_sum_at_most_180    s_sacc_leg
```

`whynot holds_from[brouwer](s_sacc_leg, 1)` walks the premise chain and stops on
`thm[brouwer](excluded_middle)` — premise 3, the reductio, named.

**A limit, stated.** This is not intuitionistic geometry. A real constructive
treatment is subtler than "delete excluded middle and see what breaks": it
re-proves what it can with different arguments, and several classical theorems
have constructive proofs their textbook versions do not use. The claim this
model makes is narrower and exactly checkable: *a step whose proof uses a
principle the book does not hold is unavailable, and the corpus records which
steps those are.*

## Frege and da Costa: the same contradiction, one axiom apart

Both books hold `post5_unique` **and** `post5_many`. They differ by `ex_falso`.

```prolog
clash[G](A, B) :- thm[G](A), thm[G](B), opposes[main](A, B).
explodes[G](P) :- clash[G](_, _), axiom[G](ex_falso), proposition[main](P).
thm[G](P)      :- explodes[G](P).
```

```
    frege     ex_falso: true   clashes:  28   explodes:  37   theorems: 37 of 37 propositions
    dacosta   ex_falso: false  clashes:   8   explodes:   0   theorems: 28 of 37 propositions
```

The engine has **no ex falso rule of its own**. Explosion is written in the
model as an ordinary rule licensed by an ordinary axiom, so this is not "ROFL
happens not to explode" — it is a paraconsistent foundation and a classical one
run through the same rules, differing by one line. Frege's *Grundgesetze* is the
honest name for the second book: it was consistent-looking until Russell's
letter of 1902, and classical logic turned one contradiction into every
sentence.

What da Costa's book does with its contradiction is hold four angle sums at once
for the same triangle — 175, 177, 178, 180 degrees for `t_left` — and say so
through `disagree`, instead of picking a winner or refusing to answer.

## The trefoil

```
    euclid     dim_plane   -> trefoil unknottable
    solid      dim_space   -> trefoil knotted
    schlafli   dim_four    -> trefoil unties
```

`solid` and `schlafli` differ by that one axiom and nothing else. A knot is
knotted in three dimensions and unties in four (Wu 1958, Zeeman 1960: an
embedded circle in codimension three is isotopic to the unknot). "Obvious" turns
out to be a property of the book you grew up in — which is the dimension axis's
one contribution, and the spec is right that it is weaker than the geometry
axis: a parameter changes, not the logic.

## Writing in another man's book

```
  Lobachevsky writes the hyperbolic axiom into Euclid's book, and asks nobody:
    forged[audit] -> 1 row
      $fact(axiom,euclid,$cons(post5_many,$nil))
    authority(euclid, euclid) = true, authority(euclid, lobachevsky) = false
```

Nothing in `goof.rofl` mentions forgery. Who wrote a fact is the load identity
checked against `authority`; with the foundation as an argument column instead —
`thm(euclid, angle_sum_180)` — the same entry is a well-formed fact and no audit
in any kernel can see it. That column is the obvious first draft of this model
and it is the **mega-main anti-pattern**: it loses `forged`, it loses the audit
of cross-book reads, and it turns "the rules do not mention a foundation" into
a claim nobody can check, since the column is right there in every rule.

The forgery is not cosmetic. Euclid's book now contradicts itself, and it holds
`ex_falso`, so it proves all 37 propositions instead of 24.

## The oracle

```
  9 books x 37 propositions, decided once by the engine and once by a forward
  closure over the same corpus written in plain TypeScript — no engine, no rules,
  no shared code beyond reading the same base facts. Then every subset of every
  book's axioms is closed as well — 2^9 and 2^10 of them, which makes this a
  COMPLETE oracle for the provenance question rather than a sample.

    derivability decisions:        333   disagreements: 0
    axiom-necessity decisions:    1942   disagreements: 14  (14 of them conservative)
    axiom-sufficiency checks:      282   disagreements: 0
    minimal axiom sets, found / existing: 236 / 242
    angle-sum comparisons:          45   disagreements: 0
    parallel-witness decisions:     36   disagreements: 0
```

Because a book has nine or ten axioms, *every* subset can be closed, so the
question "which axioms is this theorem provable from, and which is it not
provable without" is decided exactly rather than sampled. This is the same
question two thousand years of mathematics asked about the fifth postulate.

### The one gap, and its size

The polynomial is **sound** everywhere: every axiom set it names really does
prove the theorem, 282 for 282. It is **incomplete** for 6 theorems, all of them
in `frege`, where 6 minimal axiom sets exist that no monomial names.

`provenanceSemiring` keeps at most `PROVENANCE_MAX_TERMS` = 32 monomials and
applies that cap *before* pruning supersets, so in a book where a short
contradiction proves everything, the short proof crowds out the long honest one.
The effect on the reading is one-directional and it is the safe direction: the
polynomial then says an axiom is *needed* when a proof avoiding it exists, never
the reverse. All 14 necessity disagreements are of that kind, and the test pins
both the count and the direction so the gap cannot grow silently.

This gap was found by the oracle, not by inspection. The first version of the
projection was also wrong — it collected `axiom[...]` facts from *any* book,
because a derivation by explosion passes through `proposition[main](P)`, which
is populated from whichever book names P first. The oracle reported that as a
minimality failure, and it was: the projection was wrong, not the polynomial.

## Where the kernel fought back

**A rule polymorphic in the ledger reported a leak — and no longer does.** The
reflection records `reads_from` and `writes_to` per rule, and a *variable*
perspective used to reduce to `$any` at both ends. `boot.rofl` then saw a flow
from `$any` into `$any`, could not see that the two were the same variable, and
reported:

```
  ? leak[audit](A, B)                  -> 1 row   A = $any, B = $any
```

There was no way to declare that bridge either: `bridge_decl` is kernel-emitted
only when the head perspective *differs* from the premise's, and `$any` is not
writable in the surface syntax. `examples/sus` and `examples/aka` met the same
limit and could write one rule per ledger instead. **GOOF cannot: one rule per
ledger is the thesis failing** — which is what made this the first place the
limit was load-bearing rather than inconvenient, and what got it repaired:

- `src/reflect.ts` records a variable perspective **as itself**, `$var("G")`, in
  the shape `reifyTerm` already gives a variable, instead of collapsing every
  variable to one `$any`. A rule uniform in the ledger now carries the *same*
  term at both ends, and two different ledger variables stay two terms.
- `boot.rofl`'s `leak` rule reads a flow whose two ends are one term as the
  identity it is (`A != B`). A named ledger got that from `sees(P, P)` already;
  a variable perspective has no `authority` fact and never will, so the audit
  states it.

That row is gone. Three others took its place when `boot.rofl` closed the flow
graph — see **Known open** below — and the demo still plants a *real* leak in
the same store, so that no row here is an alarm somebody switched off:

```
      leak[audit](euclid, main)       <- the planted one, still caught
      leak[audit](euclid, audit)      <- and the two walks it opens
      leak[audit](euclid, $var("G"))
```

The repair is discriminating, not a blanket exemption for variables: a rule that
reads `[G]` and writes a head with no bracket at all still reports
`leak[audit]($var("G"), main)`, because that head is `[main]` *without* the
explicit flag and declares nothing — which is the next scar, below.

**Every head that is not `[G]` must name `[main]` explicitly.** A head written
without brackets defaults to `[main]` *without* setting the explicit flag, the
kernel emits no `bridge_decl` for it, and `leak[audit]` fires on a rule that is
doing nothing wrong. Writing the bracket is the whole fix, and it is why
`proposition[main](P) :- axiom[G](P).` looks redundant and is not.

## Three crossings, one sentence

`boot.rofl` closes the flow graph transitively (`flows_to`), because a crossing
licensed hop by hop is not a licensed walk. Three walks follow here, and every
one of them has a ledger VARIABLE at an end:

```
  $var("G") -> audit          the pooled propositions reaching the audit ledger
  $var("H") -> audit          likewise, through only_in
  $var("H") -> $var("G")      one foundation's content reaching another's
```

Not one can be an `imports` fact. An import relates two **registered**
perspectives — ones with an `authority` fact — and a perspective variable has
none and never will, so `imports(audit, $var("G"))` is not a sentence this
language can write. For a while the answer was a paragraph here saying so,
which is not auditable, does not go stale loudly, and no check reads.

The answer is one line in `goof.rofl`:

```prolog
collects(main).
```

`collects(X)` declares that X deliberately gathers from ledgers it does not
name. It is true of `[main]` here for a reason that is half the thesis:
`proposition[main](P) :- axiom[G](P).` pools the axiom sets of all nine books
into ONE shared language, and `only_in[main](G, H, A)` reads a second book to
say what the first lacks. The declaration is checked, not decorative —
`collected[audit](main)` is derived only if the ledger actually gathered
something, and `test/example-goof.test.ts` asserts that row rather than
inferring the licence from an empty audit.

It is also narrow. `collects` licenses a crossing only where the SOURCE is not
a registered ledger, which is exactly the case `imports` cannot express. The
demo still plants `sneak(P) :- axiom[euclid](P).` in the same store, and
`[euclid]` is a registered book, so all three of its rows are reported:

```
      leak[audit](euclid, main)       <- the planted one, still caught
      leak[audit](euclid, audit)      <- and the two walks it opens
      leak[audit](euclid, $var("G"))
```

A declaration that silenced those would be an off switch wearing a
declaration's clothes.

### `$var("H") -> $var("G")` is real, and it is declared rather than fixed

That third row deserves its own answer, because this is the example whose whole
thesis is that the nine foundations are kept apart, and the row says one
foundation's content reaches another's.

It is real, and the file's own expansion proves it without any appeal to how a
variable perspective is reflected. `expandedWorld()` substitutes every ledger
variable away — 28 clauses become 292, and not a `$var` is left in the program
— and derives exactly the same domain facts. Its audit reports **81 rows**:
nine books, each reaching the other eight and `[audit]`. Those are the same
crossings, spelled out; `brouwer -> euclid` is a named fact about a program
with no polymorphism in it.

The route is two rules:

```prolog
  only_in[main](G, H, A) :- axiom[G](A), foundation[H](_, _), not axiom[H](A).
  explodes[G](P)         :- clash[G](_, _), axiom[G](ex_falso), proposition[main](P).
```

and the pooling rule is where the content actually crosses. It carries, today,
in this file: `[frege]` explodes, and `dim_four`, `dim_space`, `post2_finite`
and `post5_none` — axioms of other books, of none of frege's — are theorems of
`[frege]`.

So: **declare, not fix.** GOOF models nine axiom sets over ONE language;
`proposition[main]` is the explicit place the language is pooled, and explosion
ranging over it is what *ex falso quodlibet* means. Declaring it is not
dishonest — it is the model stating what it does. What would have been
dishonest is the previous answer, a paragraph saying the row is a known false
positive; it was not a false positive, and calling it one was the error.

The expansion cannot make the same declaration, and that is the trade this
example measures in a second currency. Every source in the expanded program is
a named book, so `collects` does not apply to it at all and the honest
declaration there is **72 `imports` facts**. Expansion multiplies rules by ten
and turns one true sentence about `[main]` into seventy-two about pairs of
books.

**`whynot` explains every rule that could conclude the literal, including the
explosion.** The first draft folded explosion into the `thm` rule directly, and
every failed proof in every book then came back with an enumeration of every
pair of theorems that failed to contradict each other. Giving the phenomenon its
own relation (`explodes/1`) turns that branch into one line — "the book does not
explode" — without changing a single derived fact. **The shape of the
demonstration is part of the model's design**, not a property of the engine you
have to accept.

## The corpus, and what it is not

Twenty-seven proof steps, each a real theorem with its real dependencies:
Euclid I.4, I.5, I.16, I.20, I.27, I.31, I.47; Saccheri–Legendre; Legendre's
second theorem; the additivity of the defect; Playfair's axiom; the hyperbolic
and elliptic angle-sum laws; AAA congruence in both non-Euclidean branches. The
dependencies are the ones the classical proofs actually use — that I.16 needs
unbounded lines, and therefore fails on a sphere, is the load-bearing fact of
the elliptic section.

The corpus is a *hand-built abstraction of the proofs*, not a formalisation of
them. Each step is one fact saying "this theorem follows from these"; nothing
here checks that it does. What the model computes exactly is everything
downstream of that: which theorems each axiom set yields, which axioms each
theorem needs, how many parallels, what the angle sum is, and what a book does
with a contradiction. A full formalisation is Tarski's axioms in a proof
assistant, and it is a different project.

**Not modelled, and named rather than quietly avoided:**

- *p-adic and modular foundations.* The spec lists them; they change the
  arithmetic under a geometry rather than its axioms, and the engine's `is` is
  integer-only, so a p-adic valuation would have to be a table of facts. That is
  a different example, not a section of this one.
- *Taxicab geometry*, which the spec suggests for the tropical semiring. The
  tropical fold here prices the cheapest *derivation* in rule firings
  (`thm[euclid](pythagoras)` costs 26), which is the standard reading; a metric
  axis would need points and coordinates, and this model has neither.
- *Grothendieck*, who is in the name and not in the file. Topoi are the honest
  version of "one rule set, different foundations" — a topos *is* a universe
  with its own internal logic, and the internal logic of a sheaf topos is
  intuitionistic for reasons this example only gestures at. Nine ledgers of
  axioms are a toy beside that.

**No novelty is claimed.** Intuitionistic Datalog and paraconsistent logics are
old fields, and reverse mathematics has asked "which axioms does this theorem
need" as a discipline since the 1970s. What is being demonstrated is that a
general-purpose rule engine with ledgers and semirings answers those questions
without knowing anything about geometry, and that the answers survive a complete
oracle.
