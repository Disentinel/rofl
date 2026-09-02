# HECK — contradiction as the objective function

Every system in this repository is built to reduce disagreement. This one is
built to increase it.

The Department of Standing Ordinances grants a petition only if the amended
codex carries **more** mutually exclusive prescriptions than the codex it
replaces. Making the rules agree is the offence. A clerk who tidies a
contradiction away has destroyed departmental property.

That is a joke, and it is also the sharpest available test of one thing in the
kernel. Every semiring instance ROFL shipped before this one converges over a
cycle because `⊗` moves a value in the direction `⊕` throws away — cost rises
and `min` prefers the low one, probability falls and `max` prefers the high
one. Here `⊗` raises the contradiction count and `⊕` prefers the raised one.
The two pull the **same way**, a cycle becomes a pump, and the only thing left
holding the fold down is a **ceiling**. So this example is where the `BOUNDED`
convergence discipline gets asked a question the other five instances never
posed.

```
HECK — contradiction as the objective function.
a change is APPROVED only if it makes the codex worse.

codex      24 ordinances, 6 acts, parsed into 123 facts
situation  petitioner:4 x hour:4 x venue:4 x writ:4 = 256 situations
rules      examples/heck/heck.rofl, loaded next to boot.rofl
```

## Run it

```
node --experimental-strip-types examples/heck/demo.ts
```

Everything quoted below is that program's stdout, pasted. The test suite
(`test/example-heck.test.ts`) runs the same code and pins the same output.

## The semiring is real, not a costume

| | |
|---|---|
| carrier | a measure of chaos: how many contradictions a reading drags in |
| `⊕` = **max** | of two readings of a paragraph, keep the more contradictory |
| `⊗` = **+** | contradiction accumulates along a chain of citations |
| zero | `REJECTED` — a change that reduces chaos |
| one | `0` — a change that alters nothing |

The inversion of `min` to `max` is the **only** difference from
`tropicalSemiring`, and it changes the behaviour of the system completely.
That is worth stating precisely, because "completely" is usually a figure of
speech and here it is a measurement: on the same data, with the same weights,
min-plus reaches a fixpoint in ten rounds and max-plus never reaches one at
all. The carrier decides the meaning while the rules stay exactly where they
are.

The instance lives in `runtime/semirings.ts` as `chaosSemiring(ceiling)`, next
to the other six, and it is held to the same eleven semiring laws over 300
seeded triples by `test/semiring.test.ts` — with `REJECTED` in the sample,
because a zero that the law run never sees is a zero nobody checked.

## Why the ceiling is the whole argument

The spec this example was built from argued convergence like this: a finite
predicate vocabulary admits only finitely many distinguishable contradictions,
so a fixpoint exists. The conclusion is right. **The argument does not reach
it**, and the gap is worth naming because it is the kind of gap that survives
review.

A finite vocabulary bounds a **set** of contradictions. It bounds their **sum**
only if the sets combined along a derivation are disjoint, and nothing makes
them disjoint. Two paragraphs can drag in the same quarrel by two routes, and
`⊗ = +` counts it twice.

So take the argument at its word and put the *set* in the carrier — carrier is
a set of contradiction ids, `⊗` is union, `⊕` is the larger set. Union is
idempotent, the vocabulary bounds it, and no ceiling is needed. That reading
is not a semiring: swept exhaustively over all 32768 subset triples of a
five-element vocabulary, left distributivity fails, e.g.

```
a = {c1}  b = {c1}  c = {c2}
a ⊗ (b ⊕ c) = {c1}       but      (a ⊗ b) ⊕ (a ⊗ c) = {c1, c2}
```

Which leaves exactly one way to keep both the arithmetic and the bound: put the
ceiling **in the carrier**, as saturating addition. The carrier is
`{REJECTED} ∪ {0..ceiling}`, of finite height `ceiling + 2`, and Kleene
iteration stabilises on it — cycles included. The ceiling in this demo is not
declared, it is computed: it is the cardinality of `clash/3`, the set of
distinguishable contradictions the codex actually admits.

`star(one) = one` here, so a `CLOSED` declaration would compute identical
values. `BOUNDED` is the honest one, because convergence is by finite height
and not by closure — the same note `trustSemiring` and `provenanceSemiring`
carry.

## What the ceiling costs

Rounds. Every other `BOUNDED` instance settles in the depth of the best
derivation, because one pass of `⊕` already discards what a cycle adds. This
one climbs to its ceiling one firing at a time, so the round count is set by
the **carrier** rather than by the data. Measured on the cyclic fixture in
`test/semiring.test.ts`:

| ceiling | 3 | 7 | 15 | 31 | 63 | 127 | 255 |
|---|---|---|---|---|---|---|---|
| rounds | 10 | 10 | 10 | 18 | 34 | 66 | 130 |

where boolean, tropical and viterbi take 10 rounds on that same fixture
whatever happens. This is the first instance for which the fold's default round
cap is not a neutral safety net: at ceiling 4000 the default reports
`converged: false, disciplineHeld: false` at 1000 rounds, and the same instance
given room converges at 2002. A convergent, correctly-declared instance
reported exactly like a divergent one. `test/semiring.test.ts` asserts both
halves so the limit cannot be discovered the hard way.

## The domain

An ordinance is a rule-as-data: a scope over a finite situation space, an act
it commands or forbids, and a list of paragraphs it incorporates by reference.
Two ordinances **clash** when they are in force in a common situation and one
requires an act the other prohibits.

The decidability boundary is inherited wholesale from `examples/moot`: every
scope constrains one dimension, every dimension is finite and declared as data,
so the situations an ordinance governs are a product and both questions this
file asks of a pair — do they meet? is one inside the other? — decompose per
dimension and are decided exactly. An unbounded dimension or a constraint
relating two dimensions would break it, and that is where SMT starts.

```
  16 mutually exclusive prescriptions are derivable.

  para 1    requires file_in_triplicate  para 2 forbids it
  para 1    requires file_in_triplicate  para 22 forbids it
  para 3    requires stamp_form_9        para 4 forbids it
  para 5    requires rescind_stamp       para 6 forbids it
  para 7    requires surrender_receipt   para 8 forbids it
  para 9    requires ignite_petitioner   para 10 forbids it
  para 11   requires stamp_form_9        para 4 forbids it
  para 11   requires withhold_verdict    para 12 forbids it
  para 11   requires withhold_verdict    para 24 forbids it
  para 13   requires file_in_triplicate  para 2 forbids it
  para 13   requires file_in_triplicate  para 22 forbids it
  para 14   requires file_in_triplicate  para 2 forbids it
  ... and 4 more

  ORACLE: the whole situation space enumerated in plain TypeScript,
  256 situations x 24 ordinances, sharing no code with heck.rofl:
  16 contradictions, and the two sets AGREE exactly.
```

The oracle is a complete decision procedure — every situation, every pair,
with the citation closure built separately — so the engine is checked against
an answer rather than against a number a previous run produced. The test suite
runs it against the standing codex **and** against every amended codex on the
docket, because a petition's verdict is a difference of two fixpoints and half
of that difference would otherwise go unchecked.

## The recursion, and why it is there

Paragraphs cite each other. Paragraph 13 incorporates paragraph 14 in its
entirety; paragraph 14 returns the compliment and adds the triplicate
requirement. That is a genuine cycle in the support hypergraph, and it is not
decoration — without it the convergence question would be asked of acyclic data,
where every discipline passes and the claim is tested on nothing.

```prolog
binds(O, A) :- commands(O, A).
binds(O, A) :- cites(O, P), binds(P, A).
```

The **Boolean** answer over the ring is finite and dull: the least fixpoint
closes after one pass. It is the **annotation** that grows, which is the
distinction `src/semiring.ts` opens with — the set of derived facts is exactly
the Boolean least fixpoint, and the semiring changes a fact's value, never
whether it holds.

## The demonic MOOT

`examples/moot` hunts clauses that decide nothing, to delete them. HECK hunts
paragraphs that **offend nobody**, to spoil them. Same five verdict shapes,
same operators, same stratification, opposite sign — which is the claim worth
demonstrating: reflection is parameterised along with everything else, and
nothing in the engine knows which way round a judgement runs.

| verdict | MOOT | HECK |
|---|---|---|
| `serene(O)` | `unreachable` — no context turns it on | party to no contradiction at all |
| `harmonised(O1, O2)` | `shadowed` — one clause contains another | two paragraphs in perfect agreement |
| `inert(O, D)` | dead clause — an empty scope | the same, and the one verdict whose sign does not flip |
| `redundant(O2, O1)` | `shadowed` — deleting it changes no decision | deleting it removes no contradiction |
| `placid(D, V)` | — | a whole REGION of the situation space at peace |

```
  SERENE (4) — party to no contradiction at all, direct or inherited.
    para 17
      "A demon presenting at the Annex shall stamp Form 9."
    para 19
      "The damned shall file in triplicate at vespers."

  INERT (1) — governs no situation, so it cannot even be provoked.
    para 21: empty on hour
      "A petition received at sext shall be refused."

  PLACID (1) — a REGION of the situation space at peace. This is the
  verdict the department acts on: it names where to aim the next amendment.
    writ = sealed

  Every prohibition in the codex restates the sealed-writ exemption, so no
  prohibition runs against a sealed writ, so nothing contradicts anything
  there. Twenty-four paragraphs agreeing by accident is the worst thing the
  department has ever produced.
```

`placid` is the verdict that earns its place. It is not about a paragraph but
about a region, and it comes out of the codex's own drafting habit: every
prohibition carves out the sealed writ, so the sealed writ is where hell is at
peace. Nobody wrote that rule. The test suite strikes the exemption from all
eight prohibitions and checks that the verdict disappears, so the gate is known
to be able to say no.

`redundant` needed a guard `moot.rofl`'s `shadowed` does not have, and the
reason is instructive. An ordinance that only **prohibits** binds nothing at
all, so on MOOT's two guards every prohibition sitting inside a wider command
would be called redundant — which is exactly backwards, since a prohibition
inside a command is the contradiction the department exists to manufacture.
`bar_escape` is that third guard.

## The docket

A petition amends the codex: a new paragraph, and optionally a narrowing of a
standing one — which is how a petition can accidentally make peace. The host
evaluates the rules twice, once on the codex as it stands and once as amended,
and files both contradiction sets against the petition. The chancery decides on
the difference, which is why it needs no arithmetic: set difference is two
negations.

```prolog
manufactures(P, O1, O2, A) :- now_clash(P, O1, O2, A), not was_clash(P, O1, O2, A).
reconciles(P, O1, O2, A)   :- was_clash(P, O1, O2, A), not now_clash(P, O1, O2, A).

approved[chancery](P) :- petition(P), manufactures(P, _, _, _),
                         not reconciles(P, _, _, _).
```

Seven of ten petitions are granted, and the three refusals are three
**different** refusals — one makes peace and manufactures nothing, one
manufactures three contradictions and reconciles one, one changes nothing at
all. The demo fails loudly if the docket ever stops exercising all three.

**The standard is not "on balance", and that is a modelling decision rather
than an oversight.** `p_04` leaves the codex strictly worse — three
contradictions manufactured against one reconciled — and is refused anyway.
Making peace *anywhere* is the offence. Netting could be written instead, and
it would need arithmetic the difference-of-two-negations formulation does not:
counting, comparison, and a rule that can say "three is more than one". The
department does not net, so the rule does not either.

## whynot on a refusal

The petition worth asking about is the one whose only failing premise is the
reconciliation:

```
whynot approved[chancery](p_04):
  rule r494bb3c4: approved[chancery](?P)@now :- petition[main](?P)@now, manufactures[main](?P,?_$3,?_$4,?_$5)@now, not reconciles[main](?P,?_$6,?_$7,?_$8)@now
    failed premise: not reconciles[main](p_04,?_$6#0,?_$7#0,?_$8#0) -- blocked: reconciles[main](p_04,o_007,o_008,surrender_receipt) holds

  The guilt is named, not merely reported: `reconciles` holds, so the
  petition removed a contradiction the codex already had --
    para 7 required surrender_receipt, para 8 forbade it, and now neither does.
```

The tree names the paragraphs the petition made peace between — its guilt,
in the department's terms — rather than reporting that a premise failed.

## The minimal amendment, on the same facts

HECK's carrier maximises. Ask the opposite question of the same fixpoint, with
`tropicalSemiring` and nothing else changed, and the answer changes with the
carrier:

```
  p_02  no remedy: its offence is in the NARROWING, which no edit to its new paragraph can undo
  p_04  no remedy: its offence is in the NARROWING, which no edit to its new paragraph can undo
  p_06  also forbid surrender_receipt +1 contradiction(s), cheapest derivation 4 firings
```

Two of the three have no remedy, and the report says *why* rather than shrugging:
the candidate set is edits to the petition's own new paragraph, and a petition
whose offence lies in its narrowing of a standing paragraph cannot be repaired
from there. That is a stated limit of the search, not a claim about the
petitions.

## Where the codex can no longer be made worse

```
  ceiling            16 distinguishable contradictions (the extension of clash/3)
  facts on a cycle   46 (paragraphs 13/14 and 15/16 cite each other)
  rounds             20
  converged          true
  discipline held    true

    para 13   16 contradictions
    para 14   16 contradictions
    para 15   16 contradictions
    para 16   16 contradictions
    para 11   2 contradictions
    para 1    1 contradiction

  4 paragraphs stand at the ceiling: para 13, para 14, para 15, para 16.
  THE CODEX HAS NOWHERE TO GROW HERE. HELL HAS REACHED MAXIMUM ENTROPY.
  These paragraphs already drag in every contradiction the vocabulary
  admits; no further reading of them can be made to say more.
```

This is the limit of growth **computed**, not declared. The four paragraphs at
the ceiling are exactly the two citation rings: they hold almost nothing of
their own and inherit everything, so every contradiction in the codex is
reachable from them by some reading, and no further reading can be made to say
more. The paragraphs off the rings sit strictly below.

And the control, in the same run, because a convergence claim with no
divergence beside it is untested:

```
  THE CEILING IS THE WHOLE ARGUMENT, and here is the control. Take it away —
  the same carrier, the same weights, the same data, times no longer clamped —
  and the citation ring is a pump:

    converged        false
    discipline held  false
    stopped at       40 rounds (the caller's cap, not a fixpoint)
    highest value    38 at 40 rounds, 78 at 80
                     — measured twice, so "still climbing" is not a guess
```

The fold reports a false declaration rather than hanging, which is what
`src/semiring.ts` promises for a `BOUNDED` instance that does not stabilise.
"Still climbing" is measured at two round counts rather than asserted from one,
because a single value stopped at a cap is consistent with both a slow
convergence and a divergence, and only the second measurement tells them apart.

A cycle alone is not enough to pump, either, and the suite separates the two:
cut the citation ring and 38 facts are **still** on a cycle — `boot.rofl`'s own
audit rules are mutually recursive — but the uncapped fold converges there in
ten rounds, because the weight hook charges nothing to go round them. It takes
a cycle *and* a weight that charges on it.

## What could NOT be modelled

- **Deontic logic proper.** Nothing here has permission, obligation as a
  modality, or defeasible override. `commands` and `forbids` are two ordinary
  relations, and "O1 overrides O2" — the thing every real codex actually uses
  to resolve a conflict — has no representation at all. A real legal system
  would call most of these sixteen contradictions *resolved* by seniority,
  specificity, or a later enactment. HECK calls them assets, which is funny
  precisely because it is the wrong answer for the right domain.

- **Netting.** See above: the chancery cannot say "three is more than one".
  The formulation buys its whynot tree by staying inside two negations, and
  pays for it by being unable to compare magnitudes.

- **Contradictions that are not act-level.** Two ordinances that mandate
  incompatible *deadlines*, or an ordinance that requires a form no other
  ordinance permits to exist, are contradictions no rule here can see. The
  vocabulary of contradiction is `(commander, forbidder, act)` triples and
  nothing else — which, conveniently, is also why the ceiling is computable.

- **The DNF gap, inherited from MOOT.** A paragraph whose scopes are
  individually partial but jointly total is not detected, because tautology in
  disjunctive normal form does not decompose per dimension the way emptiness
  and containment do. HECK has one scope per ordinance, so the gap does not
  arise here — it would the moment an ordinance were allowed alternative
  scopes.

- **Whether hell converges globally.** The demo reports where the codex has
  stopped being able to grow *given this vocabulary*. It says nothing about a
  department that keeps inventing new acts, which is what a growing vocabulary
  means: the ceiling moves, and the fixpoint with it. The finiteness is a
  hypothesis about the vocabulary, and the moment the vocabulary is allowed to
  grow, the whole convergence argument goes with it. Stated, not smuggled.

## Hygiene

```
  unstratified(X)                    -> empty
  malformed[audit](R)                -> empty
  breach[audit](R)                   -> empty
  leak[audit](A, B)                  -> empty
  forged[audit](F)                   -> empty
  undefined_premise[audit](R, Rel)   -> empty
```

Checked before anything else, not assumed. Every rule is range-restricted and
nothing is unstratifiable — if a rule were unsafe the engine would unfold it
top-down at call sites and the semiring fold would run over a different fact
set than the verdicts describe.

`[audit]` and `[chancery]` are **derived ledgers** in the sense of
`docs/choosing-perspectives.md`: books of conclusions reached under a named
discipline, whose only writers are the rules that head into them. `approved` is
computed, never asserted — it is not a status smuggled into the perspective
slot. Both heads read `[main]` and write elsewhere, so the kernel emits a
`bridge_decl` for each and `leak[audit]` stays empty; the test asserts the
bridges exist rather than inferring their existence from the absence of a leak.
