# Volumes: how a corpus stays cold, and where that knowledge is allowed to live

Set 2026-09-09, from measurement rather than from design. The owner touches ten
services out of seven hundred; the rest belong to other teams and other
languages. So the question that decides whether this engine is usable on a real
corpus is not "how fast is the fixpoint" but **"how little of the corpus has to
be resident to answer"**.

This document states what was measured, what it licenses, and — the part that
matters for every future rule — which layer is allowed to know about volumes at
all.

## The claim, and it is proven by execution

**A file is a sufficient volume for this model.** Every fact the model concludes
about a file can be concluded from that file alone plus a small always-hot core.

Not "mostly", not "for the cases we looked at". Over all 64 files of
`eslint/lib`, each evaluated in complete isolation and compared against the
64-file world:

```
volumes whose own fact set is IDENTICAL alone : 64
volumes that differ                           :  0
facts missing when the volume stands alone    :  0
facts INVENTED when the volume stands alone   :  0
```

Byte-identical sets, on the whole population.

### The gate has power, and that was measured too

A zero is worthless until the check is shown able to report something else.
Planted defect: withhold one base relation (`ast_attr`) from eight isolated
volumes. All eight went red, and in BOTH directions:

```
61 475 facts lost
   622 facts INVENTED
```

The invented ones are the finding. They were `unresolved_call`,
`frontier_at(_, s_unclassified)` and `shape` — the model announcing that it
could not resolve calls it resolves perfectly well when the data is present.

**That is the real hazard of partitioning a non-monotonic language, and it is
not "some answers go missing". A program starved of data does not fall silent;
it manufactures confident wrong answers,** because a negation with nothing to
contradict it succeeds. Any check on a partitioning scheme that only looks for
missing conclusions is checking the harmless half.

Re-run either half with `scanners/volume_locality.ts`, `--drop REL` for the
control.

## Why it holds — and the one thing that will break it

Two independent measurements say the same thing.

**Provenance.** Of 357 404 derived facts in the 16-file world, the number whose
support touches two files is **0**. Not few — none. Since every fact's immediate
support is single-file, the transitive support is too, by induction.

**Negation shape.** `scanners/rule_shape.ts` classifies every negation site by
what is bound when the plan reaches it. Of 523 sites, 512 are cold-safe, and the
dangerous shape — `not p(Z)` with nothing bound, "is p empty", which needs the
whole relation resident — occurs **three times, all three in `examples/`, none
in the kernel and none in `rules/`**. Every negation that actually runs is a
question about a KEY, and a key lives in one volume.

**The one crossing edge, named.** This holds because the model does not resolve
calls across module boundaries. All 193 `resolves` facts in that world join a
call to a function in the SAME file. When cross-module resolution lands it is
the only mechanism that will cross a volume — which is the best possible shape
for a design problem: everything is local except one thing, and that thing is
known by name.

The fixture `test/fixtures/js-volume/gamma.js` requires `alpha.js` on purpose.
When resolution crosses files, the volume gate should go red there first, and
that redness is the feature.

The repair, when it is needed, is not to keep more resident: it is a book of
resolutions over a **materialised export surface**. Export surfaces are small —
seven hundred services publish tens of thousands of facts against millions of
internals — so the hot set becomes core + touched volumes + all exports.

## The size of what must stay hot

Facts naming no file at all — vocabulary, rules as data, reflection — are the
irreducible core. It does not grow with the corpus:

| | 16 files | 64 files |
|---|---|---|
| facts | 853 567 | 2 968 422 |
| always-hot core | 23 683 | 31 046 |
| core as a share | 2.8% | **1.0%** |

The data grew 3.48x and the core grew 1.31x, because the core is the PROGRAM and
its reflection (`derived_by`, `premise_lit`, `premise_pos`, `verdict`) rather
than the subject. Extrapolated to `eslint/lib` entire: ten files of 388 resident
is core plus ten volumes, about **1.4% of the world**.

One volume evaluates alone in about a second. Volumes are uneven — 8.9x between
the median file and the largest — which is a scheduling problem, not a
correctness one.

## Where this knowledge is allowed to live

Three questions get conflated under the word "volume". They belong in three
different places and the separation is load-bearing.

| question | lives in | why it cannot live elsewhere |
|---|---|---|
| **which volume is this fact in?** | the KEY, minted by the scanner | residency is decided BEFORE anything is loaded; a derived answer needs the data to find the data |
| **what IS a volume here?** | a declaration of the scanner | only the scanner knows what a unit of source is: a file, a message, a commit |
| **which volumes are hot now?** | policy, outside model and scanner | the only genuinely dynamic part |

**The model must not mention volumes, and the strongest argument is the
measurement itself.** All 64 volumes agreed byte for byte while NO rule knows
that volumes exist. Locality here is an emergent property of the data, not
something the rules arranged. A rule that named a volume would stop being about
the domain and start being about storage, and could not be carried to another
layout.

**The volume must be readable from the key.** Today it already is, but by
accident: `scanners/js_ast.ts` mints node ids as `n<hash of path>_<counter>`, so
the file is a prefix of every id. The measurement above rests on that artefact.
Make it deliberate.

The vocabulary for this is already in the tree and under a different name:
`rules/rule-shape.rofl` classifies negations as `neg_point` versus
**`neg_prefix`** — a question about a point, or about a prefix. A volume IS a key
prefix. Nothing new has to be invented; something existing has to be named.

## Beyond source code

The granularity question — file? message? thread? channel? day? — has no general
answer, and that is the reason it must be a declaration rather than a rule.

But it is **empirical, and the instrument that answers it is the one above**.
Define the volume, run every volume in isolation, count facts missing and facts
invented. Zero on both means the granularity is sound. For code the answer is
"file" and it is proven. For a chat corpus a thread is plausibly local for "what
was discussed" and certainly not local for "who mentioned X" — and the difference
will appear as a number rather than as an opinion.

The hazard transfers verbatim. A starved volume in a chat model will not say "I
do not know"; it will conclude that nobody answered a message, because the reply
was in a volume nobody lifted.

## Lifting a volume: the tick boundary is required, not convenient

`src/engine.ts` holds an `Assumption` — the frozen record of what `not p` is
judged against — **for the duration of a round**. Lifting a volume mid-round
would answer some negations against a world without it and others against a
world with it: two assumptions inside one round, and the well-founded semantics
the alternating fixpoint provides no longer holds.

So a volume may be lifted at a tick boundary and nowhere else. This is a
statement about what the program MEANS, not about how it is scheduled.

For a computation that does not fit at all, the machinery already exists: budget
exhaustion emits a `hole` as a FACT, so the unfinished part names itself and can
be asked about. `space_exhausted` and `budget_exhausted` are deliberately
separate atoms because they demand opposite repairs — more room versus more
steps — and only the first is a case for materialising an intermediate and
continuing on the next tick.

## The aggregate: 205x smaller, and it is where cross-volume work belongs

A volume has an INTERIOR and an INTERFACE, and only the interface can ever
matter to another volume. Once a file's facts are extracted, the file is not
needed; once a volume's interface is derived, the volume is not needed either —
until somebody asks a question the interface cannot answer.

Measured on the 64-file world. The interface taken as what a file offers and
what it requires — its functions, their names, parameters, returns, call sites,
resolutions and frontiers:

| | facts | per file |
|---|---|---|
| a plausible interface | 14 464 | 226 |
| the whole world | 2 968 422 | 46 382 |

**0.49 per cent. Two hundred and five times smaller.** Extrapolated to eslint
entire — 1426 files — the interface of the whole corpus is about 322 000 facts,
which at the port's measured density is some 64 MB. The interface of an entire
codebase fits in memory with room to spare, and a question asked of it is an
index probe rather than a fixpoint.

**And what the discarded 99.5 per cent actually IS, which is the reason the
ratio is so favourable:**

```
derived_by       1 259 779    provenance
ast_within         500 532    a transitive closure
sees_binder        353 823    a transitive closure
asserted_by        148 668    provenance
in_perspective     148 668    provenance
```

Provenance is **52 per cent of the world** and the two transitive closures are
another 29. Eighty-one per cent of what a volume holds is trace and internal
reachability — by construction not interface material.

So the layering the measurements support is three deep, not two:

- **cold**: volume interiors, 99.5 per cent, on disk
- **hot**: the aggregate interface, 0.49 per cent, always resident
- **lifted on demand**: a volume, when its interior or its provenance is wanted

### Three conditions, and the third is a price rather than a check

**1. The interface's CONTENT must be derived from the rules, not chosen.** The
table above is a plausible guess and that is its weakness. The correct content
is exactly the relations read by rules whose premises span volumes — today an
empty set, because nothing crosses; when cross-module resolution lands, it is
whatever resolution reads. `scanners/rule_shape.ts` already computes
`rule_leaves(R, B)`, rules that read outside their own book, which is the same
shape of question. Deriving it once beats maintaining a list, for the reason
this repository has already paid for twice: a hand-written list reopens
silently the moment somebody adds a relation.

**2. Negation must not reach into what was discarded.** Asking `not p(X)` for an
X whose volume is gone gives a WRONG answer, not a missing one. This is not
hypothetical: the planted defect above invented 622 facts by exactly this
mechanism. Safe only while no cross-volume rule negates over a discarded
relation, and that is statically checkable by the same classifier that found
the three scans.

**3. Provenance is 52 per cent of the world, and it is the half being thrown
away.** Keep only the aggregate and `why` for a cross-volume conclusion bottoms
out at the aggregate rather than at source. For a system whose identity is a
provenance hypergraph that is a real loss and should be stated as one.

It is RECOVERABLE rather than gone: the aggregate carries the reference, and
expanding a step is precisely the cold-volume lift. Provenance becomes lazy,
served by the mechanism that already has to exist. The kernel also already
carries the other half of this lever and no demo exercises it — `retainTicks`,
which prunes provenance at the tick boundary.

## Building the volumes: the parts are NOT cheaper than the whole

Stated because the opposite was predicted here, out loud, and measured false.

The expectation was that since the fixpoint is superlinear, evaluating N volumes
separately must beat evaluating one world of N files. Measured on 64 files of
eslint/lib, both arms in one process, back to back, after a warm-up:

```
ONE WORLD    32.37 s    2 968 422 facts
64 VOLUMES  190.17 s    4 231 326 facts summed
   of which loading the core 64 times    47.57 s
   of which asserting and evaluating    142.60 s

parts / whole              5.87x
parts minus core reloads   4.40x
```

**Nearly six times more expensive**, and the third column says why: the volumes
together hold 1.26 MILLION more facts than the single world. That is 64 copies
of the shared core — the vocabulary, the rules as data, the reflection, and
boot.rofl's own audits, re-derived once per volume.

The consequence for the design is concrete: **the core must be built once and
shared, not rebuilt per volume.** Without that, cold volumes pay 5.87x in time
for what they save in memory. With it, the per-volume price is the volume's own
subject and nothing else.

The memory result and the locality result are untouched by this — they were
measured separately and they stand. What is refuted is a claim made here an hour
earlier: that because volumes are independent, a corpus can be built as 1426
short independent evaluations *and that this would be better*. Independent, yes,
and proven. Cheaper, no.

## What differential Datalog did about this — and did not

Worth stating plainly, because the overlap is easy to assume and it is not there.

DDlog compiles Datalog to **differential dataflow**, and solves the axis of
**time**: given deltas of the input relations it emits deltas of the outputs
without recomputing from scratch. Its central data structure is the
*arrangement*, a shared indexed trace maintained across updates.

It does not solve the axis of **space**, and says so. The arrangements "are
responsible for the majority of memory consumption of a DDlog program", they are
in-memory LSM trees, and the project's own documentation states that DDlog "can
currently only operate on databases that completely fit the memory of a single
machine", with distribution listed as future work. The repository is archived.

Two consequences worth keeping straight:

1. **Incremental is not cold.** DDlog answers "ten of seven hundred changed"
   cheaply, but to know what a change invalidates it holds the whole maintained
   state. Cheap updates, expensive residency. What is measured here is the
   opposite: cheap residency, with the update story still unaddressed.
2. **Their partitioning is by JOIN KEY, for parallelism across workers.** That
   is orthogonal to partitioning by ORIGIN, and in fact hostile to it: hashing
   by join key smears one file across every worker, which is exactly what a cold
   store must not do.

The two are complementary. And the result above is the stronger precondition:
because a change to file F provably cannot invalidate anything outside F, an
incremental layer over these volumes has a partition an incremental engine
cannot derive for itself.

The classical Datalog answer to "compute only what is demanded" is the magic-set
/ demand transformation, and this kernel already has demand (moded) rules. That
is the same instinct arriving from the query side rather than the storage side,
and the two meet: demand says which volumes are touched, volumes say what may
stay on disk.

## How to falsify this

- `node --experimental-strip-types scanners/volume_locality.ts` — every volume
  of the portable fixture, alone, both directions.
- `--corpus ~/eslint-corpus/lib --files 64` — the measurement above.
- `--drop ast_attr` — the planted defect; the gate must go red, and must report
  INVENTED facts and not merely missing ones.

A single volume reporting a non-zero `invented` count is the end of this
document's claim, and the rule that caused it is named in the output.

Sources for the differential-datalog section: the project README and its
profiling documentation.
