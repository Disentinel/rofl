# JOPA — Judgments Over Provenance Algebra

**The standard of proof as a parameter of the semiring, not a constant in the rules.**

> **This is a demonstration of a mechanism. It is not legal advice.** The
> statute is synthetic — invented for this example, modelled on no
> jurisdiction's wording. The case is invented. Nothing here decides
> anybody's claim, and no output of this program should be shown to anyone
> as if it did.

```
node --experimental-strip-types examples/jopa/demo.ts
node --experimental-strip-types --test test/example-jopa.test.ts
```

---

## What is NOT claimed

Logic programming for law is a trodden field. Catala, PROLEG, LegalRuleML,
Blawx, and the Sergot & Kowalski line back to the 1986 British Nationality Act
paper have been at it for forty years. "Datalog for statutes" is the twentieth
attempt at something, and this example does not make that claim, does not
compete on it, and would lose if it tried.

## What IS claimed — exactly one thing

In law the **same norm** is tested at **different standards of proof**:
balance of probabilities, clear and convincing evidence, beyond reasonable
doubt. These are not different norms. They are not different rules. They are
**one norm computed in a different algebra** — or, more precisely, the same
computation read against a different threshold.

Every legal-tech engine we know of either bakes the threshold into the rule
logic or handles it outside the engine entirely. Here the standard of proof is
a **table of facts no rule reads**, and switching it is an amendment to that
table. The mechanism:

- the Boolean fixpoint decides **derivability** — is the norm engaged at all;
- one fold of the **Viterbi semiring** over the support hypergraph the engine
  already recorded gives every conclusion the probability of its most probable
  derivation;
- a **standard of proof is a threshold on that value**, applied afterwards.

The rules are not touched between standards. Neither are the facts. The demo
prints the proof of that: move the standard and *every derived fact and every
annotation on it is identical*.

```
    before: exclusion at 75%  -> indemnity payable
    after:  exclusion at 50%  -> indemnity refused: the s.7 exclusion is made out

    derived facts identical:        true
    annotations on them identical:  true
```

The kernel machinery this rests on is `runtime/semirings.ts` (`viterbiSemiring`,
`logProbOf`, `clearsThreshold`) and `src/semiring.ts` (the fold). None of it is
in this directory; this example supplies a body of norms and nothing else.

---

## The domain

A synthetic **Household Fire Indemnity Act 2026**. Narrow on purpose — a whole
code would drown the example. Nine sections:

| | |
|---|---|
| s.2 | the insured perils: fire, storm, escape of water |
| s.4 | where the elements in s.5 are established, the insurer shall indemnify |
| s.5 | the five elements: cover in force, insured property, insured peril, causation, notice within 30 days |
| s.6 | what proves what: authority reports, physical traces, presence, and (s.6(4)) an anonymous communication is not evidence of any fact |
| s.7 | the exclusion: no indemnity where the loss was deliberately caused by the policyholder |
| s.8 | **the standards of proof** — (1) the elements, on the balance; (2) an allegation of deliberate loss, by clear and convincing evidence; (3) an offence under s.9, beyond reasonable doubt |
| s.9 | the offence: deliberately causing a loss and claiming on it |

The whole translation is **12 rules**. That number is the only defence this
example has (see *No oracle*, below), so it is checked in the test suite.

Four claims in the case file: a fire with an allegation of arson, a storm
claim notified 41 days late, and a subsidence claim under a policy that never
covered subsidence.

### Three ledgers, three writers

The perspective slot carries a **ledger** — whose book an entry is in — and
this example uses it for the distinction that matters most in law:

| ledger | holds | writer |
|---|---|---|
| `[main]` | the law | `legislature` |
| `[record]` | the facts of the case as found, **including the weight the tribunal put on each piece of evidence** | `tribunal_of_fact` |
| `[calibration]` | how much confidence survives an inference step | `modeller` |

The third exists to be distrusted. An evidence weight is a finding by someone
with a duty; the strength of the step from *"traces were found and he was
there"* to *"he did it deliberately"* is a number **the modeller picked**, and
it moves the answer as much as any evidence does. Giving it its own book with
its own writer means the kernel's `forged[audit]` catches it if it ever gets
asserted as though it were a finding — with no checking code written.

**Every number in the model is a fact.** No probability appears in any rule,
and none appears in `demo.ts` except the `/ 100` that turns a percentage into
one. The weight hook reads each firing's confidence out of *that firing's own
premises*; a weighted premise it cannot parse throws rather than silently
reading as certain. The test proves the numbers are live by revising one and
watching the conclusion move.

---

## One set of facts, three standards, and the link where it breaks

Claim `c_ash`. Every element of s.5 is made out. The fight is over the s.7
exclusion, and the same allegation is before three different tribunals.

```
    s.8 as data:
      s8_1  claim_elements   balance_of_probabilities   50%
      s8_2  exclusion_s7     clear_and_convincing       75%
      s8_3  offence_s9       beyond_reasonable_doubt    95%

    deliberate_loss(c_ash)      = 0.7038    (the s.7 exclusion)
    offence_s9(k_ashby, c_ash)  = 0.7038    (the s.9 offence)

    s8_1  elements_met(c_ash)          0.9700  vs  50%  MADE OUT
    s8_2  deliberate_loss(c_ash)       0.7038  vs  75%  not made out
    s8_3  offence_s9(k_ashby, c_ash)   0.7038  vs  95%  not made out

    => indemnity payable
    => the prosecution under s.9 fails on the same facts and the same norms.
```

The offence adds no evidential step to the exclusion, so it is **literally the
same number** — decided differently only because a different threshold applies
to it. That identity is asserted in the test.

### And the other kind of failure, which a threshold alone would hide

There is a fourth claim in the case file. Against `c_okoro` the insurer
alleges exactly the same thing, the accelerant traces are just as good, and
the *only* thing putting the policyholder at the property is an unsigned
letter — which s.6(4) says is not evidence of any fact, so the tribunal
weighed it at 0.

```
    deliberate_loss(c_ash)      0.7038       1%:yes  50%:yes  75%:NO  95%:NO
    deliberate_loss(c_okoro)    impossible   1%:NO  50%:NO  75%:NO  95%:NO
```

Both allegations are **derivable**, and the Boolean reading lists both and
cannot tell them apart. One is not strong enough. The other **cannot be
established at any standard above zero**, and lowering the bar will never
rescue it: excluded evidence is not weak evidence.

The carrier keeps them apart because probability zero is an explicit **symbol**
in it and not a float that arithmetic produced — so it *annihilates* the chain
above it, where a weak number merely drags it down. The traces against Okoro
are perfectly good and the conclusion over them is still nothing:

```
    established(c_okoro,accelerant_used)  = 0.8000
    established(c_okoro,at_property)      = impossible
    deliberate_loss(c_okoro)              = impossible   <- one impossible premise, and the whole chain is impossible
```

The one place the two agree is at a standard of 0, which both clear — the
algebra saying out loud that a standard of 0 is not a standard. Everywhere
above zero they differ, and that is the difference between *"we could not
prove it"* and *"this could never have proved anything"*. In a decision about
somebody's property or liberty those are not the same sentence, which is why
nothing in this example casts the carrier to a number: a cast would flatten
exactly this distinction.

Now the part the example exists for. Not *"it fails beyond reasonable doubt"*
but **which link fails, and it is a different link at each standard**:

```
    0.7038  deliberate_loss(c_ash)   [50:yes  75:NO   95:NO ]
            s.7  No indemnity is payable where the loss was deliberately caused by the policyholder or with their connivance.
            rests on 90% -- inference strength s7_step, chosen by the modeller [calibration]
      0.9200  established(c_ash,at_property)   [50:yes  75:yes  95:NO ]
              s.6(3)  presence at the property may be proved by any admissible evidence;
              rests on 92% -- e_cam_07: still from the yard camera opposite the gate, timed 23:41 [record]
      0.8500  established(c_ash,accelerant_used)   [50:yes  75:yes  95:NO ]
              s.6(2)  physical traces recovered from the property are evidence of the manner in which a peril was brought about;
              rests on 85% -- e_lab_01: county forensic laboratory: petroleum distillate recovered from three floor samples [record]

    at 50% (balance_of_probabilities): nothing breaks -- the whole chain clears.
    at 75% (clear_and_convincing) the chain breaks at:
      deliberate_loss(c_ash) = 0.7038  -- the step under s.7
        what it rests on still clears: established(c_ash,at_property) = 0.9200
        what it rests on still clears: established(c_ash,accelerant_used) = 0.8500
    at 95% (beyond_reasonable_doubt) the chain breaks at:
      established(c_ash,at_property) = 0.9200  -- the step under s.6(3)
      established(c_ash,accelerant_used) = 0.8500  -- the step under s.6(2)
```

At the civil standard for allegations of deliberate loss, both findings of
fact stand and it is the **inference** from them that does not reach the line.
At the criminal standard the break has moved *down*: the laboratory report
does not itself reach 95%, and neither does the camera still.

The break is defined mechanically, not narrated: a node that does not clear
the standard although everything it rests on does. Values only fall as a
derivation is composed, so that is exactly the step at which confidence
dropped below the line.

---

## `whynot` — the other half, and the half people actually need

> "Your claim does not meet the requirements" is an **absent whynot, not an
> absent ground.**

The ground exists. It is a specific condition of a specific norm and a
specific fact, and a machine that decided the claim knows all three. Two
refusals, of two different shapes:

**A condition that failed.** `c_reed` — a storm claim, notified late:

```
    the element that failed: notice_in_time
    s.5(e)  notice of the loss was given within 30 days of it.
    the loss was on 11 April 2026; notice was given on 22 May 2026;
    that is 41 days, and s.5(e) allows 30.

    the demonstration, from the engine:
      whynot indemnity_due[main](c_reed):
        rule ra101652b: indemnity_due[main](?C)@now :- norm[main](s4)@now, elements_met[main](?C)@now
          failed premise: elements_met[main](c_reed)
            rule r6762f352: elements_met[main](?C)@now :- norm[main](s5)@now, element_met[main](?C,cover_in_force)@now, [... the other four elements ...]
              failed premise: element_met[main](c_reed,notice_in_time)
                [... four rules whose head does not unify ...]
                rule rd126d614: element_met[main](?C,notice_in_time)@now :- norm[main](s5_e)@now, notice_period[main](s5_e,?Limit)@now, loss_day[record](?C,?L)@now, notice_day[record](?C,?N)@now, ?Delay is -(?N,?L), ?Delay >= 0, ?Delay <= ?Limit
                  failed premise: 41 <= 30 [builtin fails]
```

(The two `[... ]` lines are the only edit: the full text is in the demo's
own output, and the rule ids are content hashes the engine assigned.)

**A fact that does not exist.** `c_vale` — subsidence:

```
              failed premise: element_met[main](c_vale,covered_peril)
                rule r76b7fa2c: element_met[main](?C,covered_peril)@now :- norm[main](s5_c)@now, peril_alleged[record](?C,?Peril)@now, insured_peril[main](?Peril)@now
                  failed premise: insured_peril[main](subsidence)
                    no rule concludes 'insured_peril' and no matching base fact exists
```

Both trees are produced by the kernel's recursive `whynot`, not composed by
the example. The rendered sentences above them are read back out of the same
model — the days, the limit, the list of insured perils.

---

## The role of the model, which is a thesis in its own right

1. a model translates the text of a norm into **rules as data**;
2. ROFL computes, and emits a **derivation tree with citations**;
3. a human checks **the translation**, not the conclusion.

Hallucination is then possible only at step 1. It is localised to a specific
rule, it sits next to the sentence it claims to translate, and it is checkable
by eye. The conclusion is iron by construction.

The positioning is **not "an LLM with explainability" but an LLM as a parser
in front of an auditable kernel.** In the first case the explanation is
generated after the fact and may diverge from the real cause. In the second
**the explanation *is* the cause** — the reasoned decision this demo prints is
the argmax backpointer of the fold, read back through the support the store
recorded. There is no second artefact that could disagree with it.

That is what the `norm(S)` premise on every operative rule is for. It is not
decoration: it puts the citation *inside* the derivation, so the provenance
semiring reports it as a source and the test can assert mechanically that **no
conclusion is reachable without passing through a cited norm**.

---

## The five readings of one fixpoint

| semiring | what it answers here |
|---|---|
| **Boolean** | is the norm engaged at all — is there a derivation |
| **Viterbi + threshold** | does this element pass at **this** standard of proof |
| **Tropical** | the shortest route through the statute (3 norm applications for the exclusion, 7 for the claim) |
| **Provenance** | which norms and which facts jointly produced the conclusion — 3 minimal source sets, each naming its sections |
| **Best derivation** | the reasoned decision, with citations |

Two notes where this diverges from the obvious reading, both worth having:

**Best-derivation is not a fifth instance.** It is the argmax backpointer over
the Viterbi fold. Naming it a separate semiring would suggest a second
computation that could disagree with the first; there isn't one.

**Provenance and Viterbi disagree about the anonymous letter, and both are
right.** s.6(4) says an anonymous communication is not evidence of any fact,
so the tribunal weighed it at 0. Provenance still reports that route — it *is*
a derivation. Viterbi holds it as `impossible` and it wins no maximum:

```
    established(c_ash,at_property) = 0.9200
    every route to it, and what each is worth:
      0.9200      evidence(e_cam_07,cctv_still,c_ash,92)
      0.6000      evidence(e_wit_04,neighbour_statement,c_ash,60)
      impossible  evidence(e_tip_11,anonymous_tip,c_ash,0)
```

"Derivable" and "proved" are two different words, and the gap between them is
what a standard of proof is for.

---

## Where the kernel fought back

Three findings from building this, all of them kept in the model rather than
worked around.

### 1. A negated premise cannot be put to a standard of proof

This is the big one. `s.4` could have been written the short way:

```prolog
indemnity_due(C) :- elements_met(C), not deliberate_loss(C).
```

Same Boolean answer, and it destroys the example. **A negated premise is
settled in the Boolean fixpoint, which runs before any semiring is chosen.**
The exclusion would then be in or out at derivability — a 51%-probable
allegation of arson defeating the claim as completely as a confession — and
s.8(2), which puts a *higher* standard on the exclusion than s.8(1) puts on
the claim, could not be stated at all.

So the exclusion is a **positive conclusion with its own annotation**, and the
decision procedure composes the two readings at their two standards. That is
also, as it happens, how the burden of proof actually works: the claimant
proves the elements, the insurer proves the exclusion, and they are not proved
to the same degree. A kernel limitation pushed the model toward the more
faithful legal structure.

The general form of it is already recorded in this repository as
`f_provenance_is_blind_through_negation` — *"any verdict phrased as X unless Y
loses provenance the same way"*. JOPA is that finding with the sign flipped:
here the loss is not of provenance but of the ability to apply a standard of
proof at all, which is worse, because the annotation does not come back empty.
It comes back **confidently wrong**.

The model ships the demonstration. `s.5` is in it twice — as a conjunction of
its five elements, and as *"no element is missing"* with the element list as
data (which is genuinely the nicer translation: amending the statute becomes a
fact rather than a rule edit). They agree on every claim:

```
    elements_met(c_ash)         = 0.9700   (the five elements, multiplied)
    elements_met_closed(c_ash)  = 1.000   (nothing is missing -- and a finite failure carries no annotation)
```

The second says the claim is **certain**. It is not; it rests on a fire
brigade report the tribunal put at 97%. So: *whether a norm can be tested at a
standard of proof depends on how the norm was written down* — which is not a
property anyone would expect a translation to have to preserve, and is now a
rule this domain has to follow.

### 2. Where the standard applies is a second parameter, and the algebra does not supply it

The fold multiplies along a derivation, so a standard applied to a composite
conclusion is applied to the product of its parts. Five elements at 90% give a
composite of 59%. A lawyer would say each element is proved on the balance and
the claim succeeds; the fold says the claim stands at 59%.

That is the **conjunction problem**, a genuine and unsettled dispute in
evidence law, and no semiring resolves it. What the mechanism does buy is that
the choice becomes **explicit and movable**: the element list is data
(`element_of/2`), the values are per-fact, and applying the standard
element-by-element instead of to the composite is a change in the caller, not
in the rules. It still has to be *chosen*, and this demo chooses composite,
and says so.

### 3. Attribution is per load, so a ledger boundary is a file boundary

`load(text, { who })` tags everything in one text with one asserter. Three
writers therefore means three files — which is why this example ships
`jopa.rofl`, `facts.rofl` and `calibration.rofl` rather than two files. Not a
defect; worth knowing before designing a ledger split.

---

## No oracle — and this example does not pretend otherwise

Every other example in this repository can be checked against something
executable: a shell pipe, an IAM simulator, a spreadsheet, exhaustive
enumeration. **JOPA cannot.** The correctness of a legal translation is
checkable only by a lawyer. That is the reason this example stands last in the
set — because it lacks an oracle, not because it is hard.

No oracle was invented to paper over that. Two things partially substitute for
one:

- **the translation is small enough to read in full** — 12 rules and one page
  of statute text, side by side in `jopa.rofl`;
- **every conclusion carries a tree back to the norm it rests on**, so a
  lawyer can audit the *translation* cheaply, one rule against one sentence,
  even though no machine can.

### What IS checked mechanically (`test/example-jopa.test.ts`, 19 tests, ~2.3 s)

- the kernel's seven audits are empty; every rule is range-restricted;
  nothing is evaluated top-down;
- **no rule reads a standard of proof** — checked through the kernel's own
  reflection of the rules (`premise_pos`, `premise_neg`, `concludes` over the
  `standard`, `standard_for` and `question_of` tables), not by grepping a file;
- **moving the standard moves nothing**: the same derived facts with the same
  annotations, and only the verdict changes;
- **a higher standard is never cleared where a lower one is refused**, over
  every annotated fact in the store;
- **no conclusion is reachable without passing through a cited norm**, via the
  provenance semiring over every operative conclusion;
- **`impossible` is not merely improbable**: a weak conclusion fails only the
  higher standards and clears some positive one, while an impossible conclusion
  fails *every* standard down to 1e-9 — and both clear a standard of 0, because
  a standard of 0 is not a standard;
- the weights are live: revise a finding of fact and the conclusion moves;
- three **mutation tests** violate the standing green model by hand — a
  threshold smuggled into a rule, a conclusion that cites no norm, a weight the
  hook cannot read — and each is caught. A check that has never failed has not
  been shown to work.

### What is NOT established, and cannot be by anything in this directory

- **that the translation is faithful.** The statute is synthetic, so there is
  nothing to be faithful *to*. Against a real statute this is exactly the step
  a human must audit.
- **that the evidence weights are calibrated.** 92% for a camera still is a
  number a tribunal would have to justify. Here it is invented.
- **that multiplying along a chain is the right way to combine evidence.** It
  assumes independence; traces and presence are not independent.
- **that `max` across routes is right.** Corroboration does not accumulate in
  this algebra: two independent 60% witnesses are worth 60%, not more. Law
  thinks corroboration matters. Viterbi cannot say so. (There is a test that
  asserts this limitation rather than hiding it.)
- **that the standard belongs on the composite** rather than element by
  element — see *Where the kernel fought back*, item 2.
- **anything at all about any real jurisdiction.** This is a mechanism.

---

## Files

| | |
|---|---|
| `jopa.rofl` | the synthetic statute as rules-as-data, with its own text for citation |
| `facts.rofl` | one case file — three claims, as a tribunal found them, `[record]` |
| `calibration.rofl` | one inference strength, `[calibration]`, the number to distrust |
| `demo.ts` | the runnable transcript; every figure on this page is its stdout |
| `page.html` | the same story at two levels, plain and engineer |
| `../../test/example-jopa.test.ts` | 19 tests, including three mutations |

Every transcript above is pasted output from a real run. Nothing on this page
was composed by hand.
