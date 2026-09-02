# IFFY — the amendment, before it is enacted

There is a rule set in force and a corpus of past decisions taken under it.
Somebody proposes an amendment. **Which of those decisions come out
differently, and why each one?**

Today that question is answered by shipping to a canary and waiting for
complaints. It is literally a diff of two fixpoints over one set of facts.

**IFFY is a MODE, not a domain** — it says nothing about insurance or access
control — and it is demonstrated here on two corpora that share nothing with
each other. `examples/ditto` is the same mode applied to two revisions of code.
See [One mode, three applications](#one-mode-three-applications).

```
$ iffy --rules bill --against enacted
flipped: 49 of 288   (lost 43, gained 6)

  by clause:
    ed_notice21        28   of which that clause alone: 6
      s.5(e): the notice period is reduced from 30 days to 21
    ed_no_tip          21   of which that clause alone: 21
      s.6(4): an anonymous communication ceases to be evidence of presence
    ed_no_brigade      16   of which that clause alone: 0
      s.6(1): a fire authority report ceases to be evidence of causation
    ed_neighbour        6   of which that clause alone: 0
      s.6(3): a neighbour's statement becomes evidence of causation

  more than one clause implicated: 22
  by kind of cause: withdrawn=59  overridden=0  admitted=12  unblocked=0
```

Run it:

```
node --experimental-strip-types examples/iffy/demo.ts          # the whole thing
node --experimental-strip-types examples/iffy/demo.ts --cost   # §9 alone, in a cold process
node --experimental-strip-types --test test/example-iffy.test.ts
```

| file | what it is |
|---|---|
| `iffy.rofl` | the mode itself: arms, deltas, flips, causes, interactions, fragility, radius. Knows no domain. |
| `statute.rofl` | the adapter for `examples/jopa` — an amendment to a norm |
| `policy.rofl` | the adapter for `examples/nope` — a change to an access policy |
| `demo.ts` | the corpus, the draft, and the transcript this file quotes |
| `page.html` | the same thing for someone who has not read any of this |

## What it does not invent

**No new domain.** The spec forbids one and it was right to. Two corpora
already in this repository are used unchanged:

- **`examples/jopa`** — a synthetic statute, the Household Fire Indemnity Act
  2026, with four case files argued over in that example's README. IFFY reads
  its `insured_peril`, `notice_period` and `proves` tables as the amendable
  slice of the Act and re-decides every case under six proposed amendments.
- **`examples/nope`** — an AWS-shaped access model with an organization, an
  assume-role graph containing a cycle, Deny-overrides-Allow, a service control
  policy and a permission boundary. IFFY reads its statements, conditions,
  attachments, boundaries and SCP links as the amendable slice and re-decides
  every one of the 72 (principal, action, resource) questions.

`examples/moot` was the third candidate and was not used as a second corpus. Its flags are the
richest rule-as-data model of the three, but its decidability argument — the
one its README spends four pages on — turns on each clause constraining one
dimension of a finite product, and an amendment that adds a clause moves that
argument as well as the answer. IFFY would then be measuring a shift in what
MOOT can decide at all, not a shift in what it decides, which is a different
and much harder question. The two corpora chosen move only the answers.

**One thing IS added: cases.** `examples/jopa/facts.rofl` carries four cases.
Four cases cannot carry a denominator — "43 flipped" is not a measurement and
"43 of 288" is — so `demo.ts` adds one case file per combination of the three
things the Act distinguishes: the peril alleged (5 values), the delay in giving
notice (4), and what evidence the tribunal had (7 bundles). 140 cases,
enumerated and not sampled, in the same `[record]` ledger and the same shape.
Nothing is drawn from a distribution anybody would have to defend, and because
the grid is an enumeration, **which cases must flip under each amendment is
arithmetic**: `test/example-iffy.test.ts` does that arithmetic in TypeScript and
requires the engine to match it, rather than pinning whatever the last run
produced.

## One mode, three applications

**IFFY is a mode, not a domain, and `examples/ditto` is the same mode applied to
two revisions of code.** That was decided before either was built, in
`f_ditto_settles_iffy_and_closes_yak`: IFFY explicitly asked "separate example or
mode?", and the answer recorded was that it ships as a mode with DITTO as one of
its applications rather than as a neighbour of it. This example honours that. It
is not a thirteenth catalogue entry that happens to share machinery with a
twelfth; it is the mode itself, demonstrated twice, with DITTO as the third
application.

The mode is four steps: **fork the thing being changed, evaluate twice over the
same facts, diff the two fixpoints, and attribute each row of the difference to a
link.** What varies is what gets forked.

|  | `examples/ditto` | IFFY / `statute.rofl` | IFFY / `policy.rofl` |
|---|---|---|---|
| what is forked | the **code**, at two revisions | a **statute**, as enacted and as amended | an **access policy**, as deployed and as proposed |
| what is held once | nothing — both models are extracted | the case corpus: 144 claims | the organization, identities and role graph |
| the question | did the declared invariants survive? | which past claims decide differently? | who loses access, who gains? |
| the answer | held / violated, per invariant | flipped / steady / fragile, per past decision | flipped / steady / fragile, per past decision |
| lost redundancy | an invariant that lost a route | a claim that lost an independent proof | a grant that lost a route |
| the fork is | a **copy** — unavoidable | a **column** | a **column** |

The last row is the one worth reading twice, and it is the mode's own boundary
rather than a difference of taste. DITTO's two ledgers hold two genuinely
different fact sets, extracted twice from two trees, so the copy is not a design
choice — the facts really are different. IFFY's corpus is the *same* corpus in
both arms, so nothing needs copying at all. **Whether the fork can be a column or
has to be a copy is decided by the application, not by the mode**, and the
prediction in that same finding — that IFFY's cheap fork was what still blocked
DITTO (`f_fork_copies_the_whole_store`) — turned out not to apply: DITTO cannot
use a column, because its two sides are two different extractions.

### Was the second corpus cheaper than the first?

The lead's question, and the honest answer is *yes on the mode and no on the
restatement, and the interesting part is where it was not cheaper at all*.

| | statute adapter | policy adapter |
|---|---|---|
| the corpus's own evaluation rules | 12 | 36 |
| **mode surface** — `enacted_elem`, `question`, `support`, `verdict`, `uses`, `blocks` | **14 rules** | **17 rules** |
| corpus restatement — its rules, one column wider | 11 rules | 22 rules |

**The mode surface is nearly constant while the corpus triples.** That is the
"mode" claim in a number: what IFFY asks of an adapter does not grow with the
corpus. The restatement does grow, exactly in step with the corpus's own
evaluation layer, and it will not get cheaper with practice — a corpus with a
hundred evaluation rules costs a hundred restated ones. Every number in that
table is pinned by `test/example-iffy.test.ts`, which also checks the two
corpora are far enough apart in size for the comparison to mean anything: a
figure in prose that nothing checks goes stale silently.

Nothing else was rebuilt. The same `diff`, `causeGroups`, `interactions`,
`fragility`, `fragileByHand` and `cheapestAmendment` in `demo.ts` run against
both worlds unchanged, and `test/example-iffy.test.ts` parametrises over the two.

**And the second corpus was not free: it forced two rules into the kernel.**
`iffy.rofl` gained `because(A, Q, unblocked(Elem))` and its `cause_elem` row
because a NOPE amendment gains a conclusion by removing a *blocker*, which the
statute corpus cannot do — it has no defeating norm at all. `unexplained[audit]`
was non-empty twice on the policy corpus and never once on the statute corpus.

**That is the argument for two corpora, made empirically instead of
methodologically.** One corpus made the mode look complete when a quarter of its
cause vocabulary was unreachable and its absence was invisible. If IFFY had
shipped on JOPA alone, `overridden` and `unblocked` would not exist and nothing
in the example would have suggested they were missing.

## The fork, and the honest problem

### What the kernel does, measured

`store.clone()` is `snapshot()` to JSON and `restore()` back — a full deep copy
of every fact. That is not a defect: `excise` uses it, `excise` is exactly right,
and §8 of this example checks itself against it. It is the wrong price for a
search.

Measured here, `node examples/iffy/demo.ts --cost`, on this repository's own
corpora:

Three runs of `--cost`, each in a cold process, on an eight-core darwin laptop
that was carrying three other agents at the time:

| | statute corpus | policy corpus |
|---|---|---|
| the corpus as an ordinary store | 7,675 facts | 3,752 facts |
| what the store holds | jopa's statute, 144 case files, their evidence, and every fact the fixpoint derives from them — no arms, no IFFY | nope's organization, identities, the assume-role closure, the policy set, and the access fixpoint |
| `store.clone()` of it | 105–139 ms = **13.7–18.1 µs/fact** | 56–66 ms = **14.9–17.6 µs/fact** |
| a whole fork by clone (copy, amend, re-derive) | 368–427 ms | 198–246 ms |

**The subject of that rate matters more than the rate.** These are stores
carrying rules, derived facts, provenance and witnesses — not stores of bare
integer facts, which clone several times faster and are not what anybody forks.
A finding recorded earlier the same day put the cost at 3 µs/fact on such a bare
store and that figure should not be used for this; an independent measurement on
a differently-composed realistic store gave 21.7–22.5 µs/fact. This example
measured 13.7–18.1. All three realistic figures agree on the order of magnitude:
**tens of microseconds per fact, not units.** At 16 µs/fact a fork of a
100,000-fact store costs about 1.6 seconds for the copy alone, and a
thousand-fork search is most of an hour.

### What IFFY does instead, and what it costs

An arm of the comparison is a **term**, not a store: a name riding as an
ordinary column through the rules that read the rule set. The amendment is a
**delta** against the norms already there — `repeals(Ed, Elem)` and
`enacts(Ed, Elem)` — and the whole fork is four lines:

```prolog
repealed(A, Elem)   :- carries[draft](A, Ed), repeals[draft](Ed, Elem).
enacted_by(A, Elem) :- carries[draft](A, Ed), enacts[draft](Ed, Elem).
in_force(A, Elem)   :- arm[draft](A), enacted_elem(Elem), not repealed(A, Elem).
in_force(A, Elem)   :- enacted_by(A, Elem).
```

Every arm reads the same `enacted_elem` facts and the same case corpus. So:

| | statute corpus | policy corpus |
|---|---|---|
| one fork by clone copies | **7,675 facts** | **3,752 facts** |
| one more arm adds | **3,673 facts** | **1,538 facts** |
| ratio | **2.1×** | **2.4×** |
| the IFFY world before any arm | 16,541 facts | 11,934 facts |
| one more arm, in time | 130–173 ms | 76–91 ms |

**The fact counts are deterministic and identical on every run. The times are
not.** The three-run spreads above are the tight case; across the whole
afternoon the per-arm figure on the statute corpus has been measured at 42 ms
and at 237 ms, and a difference of two noisy measurements is noisier than
either. `demo.ts` prints the timings under that caveat, reports "below
this machine's noise floor" when the difference comes out non-positive, and
does a discarded warm-up build first — because measured cold, the k=0 world
paid for the JIT compiling the evaluator and the k=8 world did not, and the
per-arm cost came out **negative**. A fork that makes the program faster is not
a measurement of anything.

### The declared ceiling

On the statute corpus, at 3,673 facts and ~135 ms per arm:

| arms | facts | roughly |
|---|---|---|
| 9 (this demonstration) | 48,798 | 3.5 s |
| 16 (the full subset lattice over 4 clauses, §7) | 71,600 | 5 s |
| **100 — the declared limit** | **380,000** | **14 s** |
| 256 (a lattice over 8 clauses) | 950,000 | 35 s |
| 1,024 (a lattice over 10 clauses) | 3,800,000 | out |

**Time is not what binds; the fact count is.** Everything is in one store and
nothing is released, so the ceiling is memory. The demonstration is designed to
live inside it: tens of arms, never thousands. A full subset lattice is
affordable to k = 6 clauses and is already uncomfortable at k = 8.

**What would be needed for more.** Two things, and they are independent:

1. *Copy-on-write in the store*, so that a fork shares the relations no
   amendment touches. That is the pending kernel decision this example is
   evidence for. The arm column already delivers 2.1–2.4× on facts without it,
   which is the whole saving available from the modelling side; the rest has to
   come from the store.
2. *A bounded frontier instead of a full lattice* — a beam over subsets rather
   than all 2^k of them. That is a modelling change, needs no kernel work, and
   is available today. It is what anyone searching a large amendment space
   should do regardless, because 2^k is 2^k.

### And speed was never the argument

Two fixpoints in two stores can only be compared by a script. The diff has no
witnesses, no derivation tree, and nothing to ask `why` of. Two fixpoints in one
store make `flipped`, `because`, `joint_only`, `masked` and `fragile` ordinary
derived relations, each with a proof. The next section is the whole example, and
it is impossible across a clone at any price.

## Provenance of the difference

Not how many facts differ. Which conclusion moved, and which link moved it.

There are four kinds, and they are four kinds because they need four different
conversations with whoever drafted the amendment:

| cause | what happened |
|---|---|
| `withdrawn(Elem)` | the baseline leaned on `Elem`, and `Elem` is gone |
| `overridden(Elem)` | every premise still stands and a **newly enacted** norm defeats the conclusion |
| `admitted(Elem)` | a conclusion that did not hold now does, on a norm the amendment brought in |
| `unblocked(Elem)` | a conclusion that did not hold now does, because what blocked it is gone |

The two middle rows are the ones a support diff cannot produce. `overridden` is
the spec's "the decisive link changed": the conclusion is lost with nothing
withdrawn, so a tool that diffs supports reports it as *flipped, cause unknown*.

```
case g_018: fire, notice on day 25, a meteorological report and traces

  under enacted:  q_due  true
  under bill:     q_due  false
  the model says it flipped BECAUSE:
    withdrawn(notice_limit(30))
  attributed to: ed_notice21

  and the kernel, asked directly, names the same link:
    whynot amet[main](bill,g_018,notice_in_time):
      rule r00280332: amet[main](?A,?C,notice_in_time)@now :- in_force[main](?A,notice_limit(?Limit))@now, ...
        failed premise: 25 <= 21 [builtin fails]
```

The model's attribution and the kernel's `whynot` are two different
computations and the test requires them to name the same link.

And the policy corpus produces the row the statute cannot:

```
q_access(bob,"s3:PutObject","arn:aws:s3:::prod-bucket/data.csv")
  overridden by stmt(s_no_put,p_scp_prod,deny,"s3:PutObject","arn:aws:s3:::prod-bucket/*")
```

Nothing bob relied on was repealed. A Deny that did not exist now does.

### The audit that found its own author's gaps

`unexplained[audit](A, Q)` derives a flip that nothing explains. It cannot
happen while every amendable element is reachable through `enacted_elem` — which
is exactly why it is worth deriving. **It was non-empty twice while this example
was being written**, and both times it was right:

- repealing a **permission boundary's allow** loses a route whose support never
  mentioned the boundary, because a route survives a boundary by the *absence*
  of a deny. `policy.rofl` now names the boundary allow the route needed.
- detaching a **service control policy from an OU** lifts every Deny it carries
  while the statement text stays where it was. `policy.rofl` now treats the
  attachment as a blocking element in its own right.

`test/example-iffy.test.ts` deletes one `uses` rule from `statute.rofl` and
requires the audit to fire, so it stays a gate rather than becoming decoration.

## Interaction: what a canary cannot see in principle

A canary runs one world. These two rows need one world per clause and one for
the whole bill, which is affordable only because arms are columns.

**`joint_only`** — the case flips under the whole amendment and under no single
clause of it.

```
q_due(g_106) under each arm:      (subsidence, notice on day 41)
  enacted        false
  a_notice45     false      extending the notice period alone: the peril is still not insured
  a_subsidence   false      adding the peril alone: notice is still 11 days late
  relief         true
```

Five such cases in the statute corpus, and exactly one in the policy corpus:
`alice` gains write access to the production bucket only if the data_reader role
is granted the write **and** the service control policy is detached. Either
change alone is harmless. Both together are not.

**`masked`** — a clause flips the case on its own and the whole bill does not,
because another clause hides it. Ten in the statute corpus. This is the row that
detonates later: remove the masking clause in a tidy-up six months on, and the
flip arrives with nothing to point at.

## Held, and lost its spare

A conclusion that did not move and now stands on one leg instead of two. Not a
regression — a regression that has not happened yet.

```
a_no_brigade   fragile   9   hardened   0   supports lost   9   gained   0
a_neighbour    fragile   0   hardened  10   supports lost   0   gained  10
bill           fragile   6   hardened   0   supports lost  14   gained   7
```

Counted structurally: `support/3` carries the support's identity in a term, so
two supports are two facts. `test/example-iffy.test.ts` recomputes the same set
by set arithmetic in TypeScript, sharing none of the Datalog, and requires
agreement.

**Derivations are not supports**, and the counting semiring answers the first
question:

```
q_due(g_002):
  supports under enacted:      2
  supports under a_no_brigade: 1
  the verdict itself did not move: steady = true

  and the counting semiring, folded over the same conclusion, says
  4 and 1 DERIVATIONS.
```

Four, not two: a derivation count multiplies through every rule below the
conclusion, and two admissible reports each proving causation give two
derivations of `causation` and therefore four of the conclusion that consumes
it. A drafter needs the second number. `examples/ditto` reads lost redundancy
off the counting fold and is right to for its question; here the two quantities
are printed side by side rather than one being quietly used for the other.

## Excise: the blast radius, before the deletion

The inverse question. Not *what does my amendment break* but *what rests on
this, if I take it out*. `examples/oops` does something adjacent, but there the
refutation arrives from outside and is an event; here nothing has happened yet
and the deletion is a proposal like any other.

```
proposed: delete evidence[record](g_001_e0, fire_brigade_report, g_001, 95)
  radius as an arm, with the fact still in the store: 1   q_due(g_001)
  the kernel's own excise, which deep-copies and re-derives: 1   IDENTICAL
  supports lost without any verdict moving: 0
  the arm never touched the store: the fact is still there — true

proposed: delete evidence[record](g_002_e0, fire_brigade_report, g_002, 95)
  radius as an arm, with the fact still in the store: 0   (empty: radius_empty = true)
  the kernel's own excise, which deep-copies and re-derives: 0   IDENTICAL
  supports lost without any verdict moving: 1
```

An excision arm needs nothing new: it removes a corpus fact rather than a norm,
so the radius is the ordinary `lost/2`, restricted to that arm. **An empty blast
radius is not a free deletion** — the second row decides nothing differently and
takes a conclusion from two legs to one, which is the whole reason to compute
this before rather than after.

The kernel's own `excise` is the oracle. It deep-copies the store, removes the
fact, re-derives from scratch and diffs — sharing no reasoning with the arm. The
two answers must be the same set, and the test requires it. This is the positive
control for the entire example: a radius computed as an arm is a claim about an
arm until something outside the arm confirms it.

## The inverse query: the cheapest amendment that works

Not *what will my edit break* but *what is the smallest edit that gives the
outcome I want*. This is the one that turns the tool from a check into a
drafting instrument.

```
wanted: q_due(g_106)  — subsidence, notice on day 41
  currently: false
  search: 16 arms — the whole subset lattice over 4 clauses — in ONE store
  arms reaching it: 4

  cheapest, by the tropical fold over the support hypergraph:
    cost 5   x06   ed_notice45 + ed_subsidence
    cost 5   x07   ed_notice21 + ed_notice45 + ed_subsidence
    cost 5   x14   ed_neighbour + ed_notice45 + ed_subsidence

  cheapest, by adding up declared costs outside the engine:
    cost 5   x06   ed_notice45 + ed_subsidence
    cost 6   x07   ed_notice21 + ed_notice45 + ed_subsidence
    cost 7   x14   ed_neighbour + ed_notice45 + ed_subsidence
```

The cost of an edit rides on the base fact that puts it in an arm —
`carries[draft](Arm, Ed)` — and on nothing else. Min-plus over the support
hypergraph then values `achieves(Arm)` at the least total cost of the edits some
derivation of the target **actually used**, which is why arms x07 and x14 come
out at 5 by the fold and at 6 and 7 by the hand count: they carry clauses the
derivation never touched. The fold is answering "what did this need", the hand
count "what does this arm cost". The first is the drafter's question. Nothing in
`iffy.rofl` mentions a cost, exactly as nothing in `jopa.rofl` mentions a
standard of proof: the number belongs to the fold.

## Perspectives

Read `docs/choosing-perspectives.md` first; the slot is easy to misuse here.

Two ledgers, and the arm is not one of them:

- **the rule set as enacted** — whatever ledger the corpus keeps it in; the
  adapter reads it there and never writes it;
- **`[draft]`** — the amendment as drafted, `authority(draft, drafter)`, and
  nobody else may write it.

Those two genuinely disagree — the draft says a norm is repealed while the
enacted book still carries it — which is the litmus test for a ledger. "Under
which arm was this concluded" is **not** a third book: it is an attribute of a
conclusion of this program, so it is a column in `[main]`, exactly as
`examples/ditto` carries its `side`. The decisive difference from the
perspective-per-run anti-pattern is that arms are not runs — they are the
branches of one hypothesis, named in the draft, finite and listed.

`test/example-iffy.test.ts` loads the draft under `who=drafter`; an arm asserted
by anyone else comes out as `forged[audit]` from the kernel with no checking code
written.

## What could NOT be modelled

**An amendment that changes a rule.** IFFY's amendable vocabulary is the
rule-set data a corpus exposes — `insured_peril`, `notice_period`, `proves` in
the statute; statements, conditions, attachments, boundaries in the policy. An
amendment that rewrites `element_met(C, notice_in_time)` itself is not an
amendment in this sense; it is a new statute, and the comparison IFFY makes is
not the one you want for it. Nothing here detects the difference, and a
corpus whose norms live in rules rather than in facts cannot be forked this way
at all. That is a real limit on which corpora the mode reaches, and it is why
`examples/moot`, whose clause semantics live half in rules, was the awkward
third candidate.

**The cost of threading the column.** An adapter restates its corpus's
evaluation rules with one extra column: 8 of `jopa.rofl`'s 12 rules, and 16 of
`nope.rofl`'s 36. The restatement is checked — the baseline arm must reproduce the
corpus's own conclusions exactly, and the test pins that — but it is a
restatement, and if `nope.rofl` changes, `policy.rofl` has to follow. A kernel
that could parameterise an existing rule by a new column would remove this
entirely. It does not exist and this example does not pretend otherwise.

**A slot with at most one value.** The element vocabulary is flat, so
`notice_limit(30)` and `notice_limit(21)` are two elements rather than two values
of one. An arm carrying two amendments that each enact a period has both in
force and the longer one wins silently. `iffy.rofl` cannot see this — that
s.5(e) is a slot is a fact about the Act — so the constraint lives in
`statute.rofl` as `double_limit[audit]`, and the test builds such an arm and
requires it to fire. **Every corpus needs its own version of this rule**, and
nothing checks that its author wrote one.

**A repeal that causes a gain, in the tropical fold.** The cost of an edit rides
on the base fact that puts it in an arm, and that fact only appears in a
derivation through `enacts`. A repeal that gains a conclusion by removing a
blocker — `unblocked`, which happens on the policy corpus — contributes to the
Boolean answer and costs zero in the fold. The statute corpus has no such path,
so the numbers above are right; the policy corpus does, so a tropical search
there would under-price a detachment. Nothing detects this either.

**A canary's actual traffic.** IFFY re-decides the whole question set, which for
the policy corpus is every principal against every action against every resource
— including permissions nobody has exercised. That is deliberate and it is the
point: an unexercised permission the amendment turns on is exactly what a canary
never sees. But it is not the same thing as replaying a log, and the counts are
therefore counts over a *space*, not over *events*.

**Anything about whether the amendment is a good idea.** IFFY says which past
decisions move and on which link. Whether the new answers are better is a
question about the world, and this example has nothing to say about it.
