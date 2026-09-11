# Performance invariants (2026-08-30)

What this kernel costs, what the field costs, and which of the differences are
ours to fix. Every number here is either measured on this machine or carries a
citation; nothing is estimated. Where a figure is derived arithmetic rather than
published, it says so.

Measurements were taken on one laptop (4 cores) while other work was running, so
treat the absolute numbers as a **ceiling, not a floor** — the shapes and ratios
are the durable part.

---

## 1. Where this kernel actually is

Five axes, because "the engine is slow" is not actionable and each axis has a
different fix.

| axis | first measured | after the two kernel fixes below |
|---|---|---|
| raw insert, one relation | ~5 µs/fact to 32k, then a knee: 128k = 57 µs/fact (7.3 s) | **flat 1–3 µs/fact throughout; 128k = 181 ms (40×)** |
| arrival-order spread at 64k | ascending 132 ms · scrambled 505 · shuffled 716 (**5.4×**) | 131 · 112 · 92 — **the spread is gone** |
| first load of `examples/spat/` | 29.8 s | **6.6 s**; a further fact of a known relation **15–23 ms** |
| transitive closure | 160 nodes → 12 720 derived → 1.5 s | unchanged |
| **provenance weight** | **1× per derivation**, derivations per fact ≈ branching factor | unchanged |
| `boot.rofl` self-audit | quadratic in **relations**: 80 → 3292 `reach` → 434 ms | cached against the rule set |
| `store.clone()` | linear, 3–4 µs/fact | unchanged |

**The ceiling, on a realistic mix** (base facts + a self-join + recursion + negation):

```
 base   derived    total        before              after
  500    37 967   39 809     7.7 s /  39 MB     3.3 s / 39 MB
 2000   604 039  610 309   286.2 s / 861 MB   173.1 s / 551 MB
```

Throughput is now **3 500–12 000 derived facts per second**, and memory is
**1.1M facts/GB** (was 0.7M).

### The correction this forces, and it matters more than the win

Removing the insertion quadratic bought **40× on the isolated insert axis and
only ~2× end to end.** That is the useful result: at 610k facts, **insertion was
no longer the dominant cost** — the fixpoint iteration and the join evaluation
are. This document originally ranked buffer-and-merge first on the strength of a
5.4× arrival-order spread; the spread closed completely and the realistic
workload moved by less than half of what the axis suggested.

**Generalise it: an isolated axis measurement is an upper bound on the end-to-end
win, never an estimate of it.** The next ranked item should be chosen from a
profile of where the remaining 173 s actually goes, not from another axis.

### Two causes, and only one is ours

The blow-up from 40k to 610k derived facts is the **program's** doing: a self-join
is quadratic by nature and any engine would derive the same 610k facts. The
per-fact cost — now 82 µs at 40k and 284 µs at 610k, down from 193 and 469 — is
the **engine's**. Conflating them means demanding that the engine fix someone
else's algorithm.

### Two causes, and only one is ours

The blow-up from 40k to 610k derived facts is the **program's** doing: a self-join
is quadratic by nature and any engine would derive the same 610k facts. The
per-fact cost degrading from 193 µs to 469 µs is the **engine's**. Conflating them
means demanding that the engine fix someone else's algorithm.

---

## 2. Where the field is

| system | documented scale | cost | source |
|---|---|---|---|
| Soufflé + Doop | 4.5–9M EDB → 13–27M IDB tuples | 12.3–29.6 s, 595–1124 MB, 8 threads on Xeon Gold 6130 | PAPER, arXiv 1907.05045 |
| Soufflé, hard limit | 2-object-sensitive analysis of real Java apps | **does not terminate in 48 h** on 640 GB | PAPER, arXiv 2503.05945 |
| Soufflé, graph analytics | livejournal, orkut fine; **arabic, twitter OOM** | 160 GB machine | PAPER, PVLDB 12(6) |
| DDlog | Doop | 23.4 GB resident vs Soufflé's 1.76 GB (**13.3×**) | PAPER, PPDP 2021 |
| Differential Dataflow | RMAT-1k (1000 nodes, 10k edges) | 37 s / 5492 MB vs Soufflé 0.19 s / 20 MB | PAPER, arXiv 2308.04214 |
| Glean | 2 922 Haskell packages | 470 s index, 0.8 GB DB; queries ~1 ms | BLOG, Marlow 2025 |
| CodeQL | tiers by LOC, not by facts | small <100K LOC / 8 GB · large >1M LOC / 64 GB | DOCS |
| LogicBlox | "5k rules, several TB" | excluded from later comparisons as uncompetitive | PAPER, SIGMOD 2015 |
| DuckDB recursive CTE | 1M edges | 4.05 s → 0.095 s after v2.0 keyed state | BLOG + SIGMOD 2025 |

The field's own scale ladder is **not** tuple counts. It is:

- **CodeQL, by lines of code** — the only crisp official tiering: small <100K, medium 100K–1M, large >1M.
- **Program analysis, by PRECISION** — context-insensitive → 1-obj-1-heap → 2-object-sensitive. The same input goes from ~22M to ~24M tuples between the first two, and from minutes to *never* at the third. **Precision is the exponent; input size is only the base.**
- **Workload shape** — "long-tail" (many fixpoint rounds each producing a trickle: CSDA/postgresql 720 rounds, Polonius 1 487), "deduction-heavy", "join-heavy". Graph analytics and program analysis explicitly **do not transfer**; that observation founded the RecStep paper.

No published "N facts per GB" rule of thumb exists. Derived arithmetic on the
Soufflé tables gives roughly **30–50M tuples/GB** for small-arity integer tuples,
20–33M with provenance on — that is our arithmetic, not a published guideline.

---

## 3. The provenance question, settled

This mattered most, because this kernel keeps provenance by construction and
"we are slow because we keep derivation trees" would have been a comfortable
excuse. **It is not true.**

The field has three design points, by measured cost:

| design | cost | ceiling |
|---|---|---|
| constant-size witness + lazy reconstruction (Soufflé) | **1.27× time, 1.45× space** | demonstrated at ~26M output tuples |
| shared circuit / DAG, not trees (ProvSQL) | **2–4× time** | per-query: 45.71M gates ends it |
| **eager full subproof per tuple** | **up to 100× memory at 2 000 tuples** | measured, then abandoned by everyone |

Soufflé buys 1.27× by storing **two integers** per tuple — the rule id and the
height of a minimal proof — and computing trees only when asked.

### Which one are we?

`Witness.prems` holds the direct children of a derivation, which *looks* like the
abandoned third row. Measured on graphs of rising density:

| shape | witnesses per answer |
|---|---|
| path | 1.00 |
| 2-out DAG | 1.93 → 1.97 |
| 3-out DAG | 2.80 → 2.90 |

The ratio equals the **branching factor and does not grow with n**. We do not hit
the 100× because `store.support()` deduplicates by firing signature and premises
are referenced **by key**: what is stored is a support **hypergraph** — one edge
per distinct derivation — not a proof **tree**, where every subtree is repeated
and the size explodes.

**INVARIANT P1.** Provenance costs one witness per distinct derivation, and
derivations per fact track the branching factor of the rule graph. It is linear
in derivations, never exponential.

**INVARIANT P2.** Provenance is therefore **not** the reason this engine is slow.
At 1–3× it sits in ProvSQL's regime and within one order of Soufflé's. Any future
argument that a performance problem is "the cost of keeping provenance" must be
measured against P1 before it is believed.

**The upgrade path, if provenance ever does become the constraint**, is Soufflé's:
store rule id plus minimal-proof height, reconstruct on demand. That trades
`why` from a lookup into a re-derivation — which is a real loss, because a
recorded witness is *a record of what happened* and a reconstruction is only *a
plausible account of it*. Do not make that trade to save 1.5×.

---

## 4. The invariants

### What must hold

**I1 — Insertion order, not the index, is the cost.** Measured at 64k facts into
the same structure: ascending keys 132 ms, integer arguments whose lexicographic
order is scrambled 505 ms, shuffled 716 ms. A 5.4× spread on identical data,
because `splice` at the end is free and `splice` into the middle is a memmove of
the tail. `clone()` is linear *only* because `restore()` replays a sorted
snapshot. **Derived facts arrive in rule-firing order, never key order, so the
engine is permanently in the bad case for the layer it generates most of.**
The fix is to buffer a round and merge sorted — not to replace the index.

**I2 — Self-audit cost tracks program size, not data size.** `boot.rofl`'s
`reach` is a transitive closure over the *relation* dependency graph: 80
relations → 3292 facts → 434 ms, quadratic. Every audit rides on it. This is the
price of the discipline, not of the domain, and it is paid on **every load**
while the rule set changes far less often than the data. Cache it against the
rule set; do not reimplement strata in the host, which would destroy the property
the design exists for.

**I3 — Loading is a first-class cost at scale, and everyone pays it.** Soufflé
takes 54 s to load a 1.2 GB input; FlowLog takes 4.6 s for the same. Tuple-at-a-time
insertion into an indexed structure is the shared bottleneck. Ours is the same
shape as Soufflé's and I1 is its specific form.

**I4 — Strata are sequential; parallelism lives only inside one.** That is
structural, not an implementation gap. And it is where the field's numbers stop
being impressive: Soufflé parallelises only the outermost join loop and reaches
**<25 % CPU on long-tail workloads, <50 % on Doop**; one measurement shows 7 %
improvement from 16 to 32 threads; another shows runtime *increasing* past 5
threads from synchronisation. RDFox saturates at ~12 cores. **Do not plan for
linear speedup from cores.**

**I5 — Incremental maintenance costs 4–22× memory and frequently loses to full
re-evaluation.** Measured on Doop: elastic 245 s, Soufflé-counting 284 s, DDlog
467 s — against **304 s for non-incremental from scratch**. Counting and DDlog
both lost. Variance is the real story: one benchmark's DDlog update ranged 5 s to
213 s across update sets of comparable size. The Oxford group states the rule
plainly: *as the amount of deleted data grows, from-scratch gets easier while
incremental gets harder; there is always a crossover.* `LIMITS.md` still
declares no incremental maintenance — no delta is ever propagated, so none of
that memory is paid. **That is a defensible position, not a gap to apologise
for.** What it now also declares is per-relation reuse under an exact input
fingerprint, which is the other side of the crossover: a relation is recomputed
entirely or not at all, and the meta layer's `reach` is the case where "not at
all" is nearly always right because it is immune to data. `incremental ≡
scratch` is therefore no longer trivially true and is held by a test.

**I6 — Nobody spills to disk; the field OOMs instead.** Soufflé, RecStep, DDlog
and the GPU engines all report out-of-memory rather than degrading. BigDatalog
spills and pays for it: "variance surprisingly high due to data spilling", and it
could not finish past RMAT-8M. An out-of-core mode is therefore a *differentiator*
if built, not table stakes.

### What kills this engine, and at what size

| workload | current ceiling | what breaks first |
|---|---|---|
| one relation, bulk load | ~32k facts comfortable; 128k = 7.3 s | I1, insertion order |
| derived layer | ~40k total facts in ~8 s; 610k = 286 s | I1 plus per-fact degradation |
| program size | ~80 relations adds 434 ms per load | I2, meta-layer closure |
| memory | 861 MB at 610k facts ≈ **0.7M facts/GB** | vs the field's derived 30–50M/GB |
| forks (IFFY, DITTO) | 32k facts = 120 ms per branch | full JSON round-trip per clone |

That memory line is the widest gap in this document: **roughly 40–70× more memory
per fact than Soufflé**, on a JS object graph with string keys against a compiled
B-tree of integer tuples. It is the honest reason a 13.4M-edge corpus like Mathlib
does not fit, and no amount of index tuning closes it.

### What a production engine must withstand

Stated in the field's own tiers rather than invented ones:

- **Small — must be instant.** <100K LOC equivalent; ≤1M facts. Under a second, single-threaded. *We are at roughly 40k with 8 seconds. Two orders short.*
- **Medium — must be routine.** 100K–1M LOC; 1–30M facts, 16 GB. Soufflé's comfortable tier: 30M tuples in 12–30 s. *We do not reach this.*
- **Large — must not fall over.** >1M LOC; 30M+ facts, 64 GB. Where Soufflé itself starts to OOM on graph workloads.
- **The wall is precision, not size.** The 48-hour non-termination is a *2-object-sensitive analysis*, not a bigger input. An engine that answers richer questions on the same data dies before one that answers simple questions on more data.

---

## 5. Ordered work, with what each is worth

**Re-ranked 2026-09-07.** Items 1 and 2 have landed. Items 3, 4 and 5 were
ordered on a cost for `clone()` that the structural clone made stale by 55–150×
and on a motivating workload that turns out not to exist — see the two
corrections at the end of this document. The list below is the ordering those
measurements produce; the old numbering is kept in brackets so the change is
legible rather than silent.

1. ~~**Buffer-and-merge derived insertions (I1).**~~ **LANDED** — the
   arrival-order spread closed completely (see §1) and delivered about 2× end
   to end against 40× on its own axis.
2. ~~**Cache the meta-layer against the rule set (I2).**~~ **LANDED**, and
   since superseded: the schedule moved into the evaluator and `boot.rofl`'s
   `reach` is gone (see `LIMITS.md`).
3. **[was 4] Compact fact representation.** Interned names and perspectives,
   small-arity tuples as typed arrays rather than term objects, and a numeric
   fact identity in place of the string key. **This is now the only item on the
   list that more than one other thing waits on**, and that is what promotes
   it: it closes the 40–70×/fact memory gap; it raises the ceiling on fork
   parallelism, which is allocation-bound and not core-bound (measured: 5.74×
   on pure arithmetic, 3.78× on pure `JSON.parse`, 3.11× on a real fork
   search); and it is the precondition for sharing a base world through a
   `SharedArrayBuffer`, which holds bytes and cannot hold a graph of objects
   with string keys.
4. **[was 5] A storage port with an external backend.** Unchanged in reasoning:
   an external store cannot rescue a representation that is too heavy, so it
   follows the item above rather than preceding it.
5. **[was 3] Copy-on-write forks.** **Demoted, on three measurements.** The
   `clone()` figure it rested on predates the structural clone and is stale by
   55–150× (0.15–0.40 µs/fact re-measured, so a realistic 100k fork is on the
   order of 40 ms and not 2.2 s). Its stated motivation — "what IFFY and DITTO
   need to be usable at all" — does not survive a census: **IFFY does not
   fork.** Its arms are a column (`arm[draft](A)` is `edb`), all in one store
   and one fixpoint, and it is the one place here that priced a fork and chose
   against it. And a free clone buys almost nothing anyway: of an 88 ms fork
   branch, `fromSnapshot` is 17%, `clone()` is **1%**, the fixpoint is 80%.
   **What survives is the memory argument** — a structural clone is still a
   full copy in RAM, so N concurrent branches are N worlds — which is why
   `f_fork_copies_the_whole_store` stays open. Note also that a cheaper fork
   and a worker pool pull against each other: the smaller a branch, the larger
   the pool's fixed setup as a share of it.

Index selection and native compilation remain **premature here** for the reasons
below. Automatic index selection is worth up to 2× and 6× less memory *than
maximal indexing*; a well-engineered interpreter is only 2–6× off generated C++.

**Parallelism is no longer simply "premature"; it is measured, and it splits.**
Inside one fixpoint it is bounded by structure: strata are sequential, rounds
within a stratum are sequential, and one ring 1 clause carries 8 hard barriers
and 74 soft ones. Its ceiling is 4.47× on the join with unbounded cores — but
the parse's serial half (image restore plus the completion check) means a
*perfect* parallel fixpoint is **1.73× end to end**. Across independent worlds
it is real and needs no engine change: a worker pool over fork branches measures
**3.11× on 8 cores** — and, per item 3, is limited by allocation rather than by
cores or synchronisation. The largest such workload in this repository is the
test suite, not any demo.

---

## What is not known

- No published naive-vs-semi-naive comparison exists anywhere; the field assumes semi-naive and measures only the cost of its set-difference step.
- No Meta-published Glean scale figure beyond "billions of facts"; the only hard numbers are one author's Hackage post.
- No official CodeQL database sizes or build times; the 15 GB Firefox figure is an issue-tracker comment.
- No measured provenance overhead for Orchestra; the Green–Karvounarakis–Tannen semiring line is theory with no performance measurements.
- No stated reason for DDlog's discontinuation — only a README admitting the single-machine memory limit and a distributed version that never shipped.
- Our own numbers are single-machine, single-run, under load. They establish shapes and ratios; they are not a benchmark suite.

## Measured end-to-end, 2026-08-30, after the three kernel changes

Three changes landed against this document: the meta-layer cache, the
insertion buffer (`arrived` / `absorb`), and the argument index. Measured on
one realistic load-and-evaluate of 39,152 facts:

| | before | after |
|---|---|---|
| load + evaluate | 2326 ms | **606 ms** |
| `matchPremise` self time | 43.6% | 12.2% |
| `unify` self time | 18.3% | out of the top seven |
| full node suite | 117 s | **68 s** |

The profile is now **flat** — no function above 13%, and the largest single
entry is the garbage collector rather than any kernel routine. That is the
result worth reporting, more than the 3.8x: a dominant term means one fix is
available, and a flat profile means the next win has to come from a different
axis. Per I5 the remaining order of magnitude is in memory per fact, not in
the query path, and this profile is what confirms it rather than assumes it.

One caution carried forward from the insertion work, unchanged: **an isolated
axis measurement is an upper bound on the end-to-end win, never an estimate of
it.** The insertion buffer measured 40x on its own axis and delivered about 2x
end-to-end. The argument index measured 3.8x end-to-end because the axis it
fixed was the one the end-to-end path actually spent its time on — which was
known only because the profile was taken first.

## The ceiling re-measured, and what did not move

The recorded ceiling program, re-run after all three changes. Only the
500-base-fact size is comparable — see the caution below.

| | recorded | after |
|---|---|---|
| 500 base → derived | 39,809 in 7.7 s | 43,037 in **0.45 s** |
| per-fact cost | 193 µs, degrading to 469 µs with size | **9–10 µs, flat** |
| bytes per fact | 1411 | **1247** |
| facts per GB | 0.7M | 0.86M |

Two axes, two entirely different outcomes. Time improved about seventeenfold
and, more importantly, stopped degrading with store size. **Memory per fact
moved twelve percent.** Every speed fix left the representation exactly where
it was, which is what I5 said would happen — the remaining order of magnitude
is in bytes per fact and nothing in the query path reaches it.

**Caution, because this nearly became a false claim.** The 2000-base-fact size
is *not* comparable: recorded at 610,309 facts, re-measured at 193,037. The
arithmetic says the re-measurement is the self-consistent one — 50 groups of
40 give 78,000 `peer`, a 180-link chain gives 16,290 `reachable`, plus 2,000
`item` and 180 `link` is 96,470 answers, doubled by provenance is 192,940
against 193,037 observed. So the recorded figure came from a configuration
this program cannot produce, and the benchmark script does not preserve the
parameters that produced it. **A re-measurement must reproduce the original's
fact count before its timing may be compared to the original's.** Where it
does not, say so and compare only the sizes that match.

## The memory decision, in three tiers

Where the bytes actually are, measured by varying one factor at a time. An
arity-1 fact costs **332 bytes** in the store:

| part | bytes |
|---|---|
| the key string, e.g. `f[main](123)` | ~97 |
| the args array and its one Term object | ~106 |
| the FactRec object itself | ~64 |
| the Map entry and the index run | ~47 |

Measured marginals: **one more integer argument costs 61 bytes** where a typed
array slot costs 4. **46 extra characters of relation and perspective name cost
30 bytes per fact** — so the names are already shared by reference, and what
interning would reclaim is not the name text but the copy of it embedded in
every key string.

**That last number corrects the plan I5 implies.** Interning names and using
typed tuples attacks the 106-byte args and part of the key, landing a fact near
120–150 bytes: a factor of two to three. The gap to the field is forty. The
order of magnitude is *not* in interning.

The choice is therefore three tiers, cheapest first:

1. **Flatten the fact key.** `factKey` concatenates, and V8 concatenation makes
   a rope that retains its fragments: a fourteen-character key costs 97 bytes
   where the flat form costs 42. Measured in the live store, flattening every
   key reclaims **31 bytes per fact, 9.3%**. The fix is one function — build the
   key with a single `Array.join('')`, which allocates the whole result at once
   (measured: `+` 97 bytes, `.slice()` 92 and does not flatten, `join('')` 42).
   Identical string values, no behaviour change, no decision required.
2. **Intern names, typed tuples for small arity.** Contained to the store's
   internals. Expect 2–3×, not more.
3. **Columnar per-relation storage** — relations as typed-array columns with a
   numeric key. This is the only tier that approaches the field's numbers, and
   it rewrites the store: why-trees, witnesses, snapshots and perspectives all
   read the current shape.

Tier 1 is being done now. Tiers 2 and 3 are a decision, and they are decisions
of very different sizes — which is the point of separating them.

### Correction: the clone figure was taken on the cheapest possible fact

An earlier revision of this document put `store.clone()` at a flat 3 µs/fact and
concluded that the time argument for copy-on-write was dead. That figure came
from a bare store of single-integer facts. Re-measured against a realistic store
— rules, derived facts, provenance, witnesses:

| store | µs/fact to clone |
|---|---|
| bare, integer facts | 5.6 – 7.2 |
| realistic (rules, derivation, provenance) | **21.7 – 22.5** |

So a fork of a realistic 100k-fact store costs about **2.2 seconds**, not 0.34.
A thousand-fork search is half an hour, not thirty-five seconds. The time
argument for copy-on-write is **weakened, not dead**: the truth sits between the
original 8-second figure and the 0.34 that replaced it.

This is the same failure as the isolated-axis one above, one level down: **a
measurement's subject must match the claim's subject** — whether the mismatch is
one axis against the whole pipeline, or the simplest instance against a
realistic one. The correction came from an agent that was handed the wrong
number, measured 21.5 against it, and added a control in the same run rather
than reporting whichever figure was more convenient.


## Correction, 2026-09-07: the clone figures above predate the structural clone

Everything in "the clone figure was taken on the cheapest possible fact" — the
21.7–22.5 µs/fact, the 2.2 seconds for a realistic 100k-fact fork, the half hour
for a thousand-fork search, and the ranking of copy-on-write at §5 item 3 that
rests on them — was measured when `store.clone()` was `snapshot() → JSON →
restore()`. Commit `3cff6f4` replaced it with a **structural** copy that walks
the fact map directly (`src/store.ts:779`). A figure taken through the
serialising path is not a figure about this one.

Re-measured with a bare-store control in the same run (`npm run forkclone`), on
an 8-vCPU Apple M4 Pro (Virtual) at load average 8.9, on stores that carry
derived facts, witnesses and firings:

| store | facts (derived / witnesses) | `clone()` | save+restore | ratio |
|---|---|---|---|---|
| bare ground facts | 15,060 | 0.11 µs/fact | 3.04 µs/fact | 28.6× |
| bare ground facts | 120,060 | 0.26 | 3.48 | 13.6× |
| realistic | 7,504 (6,480 / 3,240) | **0.15** | 3.05 | 20.1× |
| realistic | 38,304 (36,080 / 18,040) | **0.40** | 3.56 | 9.0× |

A 4-core Xeon at 2.1 GHz against an 8-vCPU M4 Pro is worth a factor of a few;
the gap here is 55–150×. So a realistic 100k-fact fork is on the order of **40
ms** of clone, not 2.2 s — but note that the per-fact cost is **not flat**: it
rises 1.7–2.6× between 7.5k and 38k facts, so 40 ms is a floor rather than an
estimate.

**What this does to §5 item 3.** The TIME argument for copy-on-write is weak
again. The MEMORY argument is untouched — a structural clone is still a full
copy in RAM and bytes per fact is still the ceiling — which is where the
previously settled reading already said it belonged. And a stage split of a real
fork branch (`npm run forkstages`) says how much a free fork could be worth at
all: of an 88 ms branch, `Rofl.fromSnapshot` is 17%, one `store.clone()` is 1%,
and the fixpoint is 80%. A free fork moves that branch to about 75 ms.
**Item 3 should be re-ranked below the memory tiers.**

## The coarse grain, measured 2026-09-07: independent forks on worker threads

I4 says strata are sequential and parallelism lives only inside one. That leaves
the coarse grain — a FORK is an independent world — and it was measured rather
than assumed. Full account in
the fork-parallelism session (page deleted with docs/dogfood/, 2026-09-10); the load-bearing results:

- **There is no thousand-fork search in this repository.** The largest is
  test/kernel-arity.test.ts (gate removed 2026-09-11) at ~800 worlds; the largest that is both
  many-branch and expensive per branch is `examples/wtf`'s order sweep at 41.
  **IFFY does not fork at all** — its arms are a column in one world — and its
  own numbers say why (2.1× fewer facts per arm than per fork). Nothing in the
  repository prunes; two sites are sequential by construction
  (`examples/wtf/demo.ts:632`, `examples/loot/demo.ts:655`).
- **The boundary is cheap and it is per WORKER, not per branch**, because every
  branch of a fork search starts from the same world. 2.5 MB round-trips in
  0.32 ms; a branch descriptor in 0.037 ms; a 762 KB answer per branch is
  within the noise. Pool setup is the binding term, and stated
  load-independently it is **2.8–6.2 branch-equivalents**, so break-even is
  **N > ~7 branches** at P=8 and zero for a persistent pool.
- **Measured speedup on 8 vCPUs: 2.12× at 41 branches, 3.11× at 164, ~3.8×
  run-phase-only** — paired, B beat A in 6/6 pairs at each.
- **Where the rest went, with two controls on the same pool in the same
  sitting:** pure arithmetic 5.74×, pure allocation (`JSON.parse` of the same
  2.5 MB) 3.78×, the real search 3.11×. **The ceiling is allocation, not
  cores and not synchronisation** — the branches share nothing. That points at
  the memory tiers again: a compact fact representation would raise the parallel
  ceiling as a side effect.
- **Determinism was the gate, not a tradeoff**: `canonicalState()` per branch,
  byte for byte, against the sequential arm, plus the aggregate. Green
  throughout. Nine mutants, 6 killed; the three survivors are all blind spots of
  the instrument rather than of the pool — `canonicalState` sorts so arrival
  order is invisible; the gate compares answers so a worker's engine
  configuration is invisible; and a differential cannot see a common-mode fault
  in the task module both arms share.
- **No change to `src/`.** Worker orchestration is a host concern and lives in
  `runtime/fork_pool.ts` and `runtime/fork_worker.ts`.

## Correction, 2026-09-07: tier 2 is 1.02–1.13×, and the estimate above was taken on the synthetic fact

"The memory decision, in three tiers" prices tier 2 — *intern names and
perspectives, typed tuples for small arity* — at **2–3×**. Tier 2 was built and
measured. Full account was the tier-2-interning session page, deleted with docs/dogfood/; the
load-bearing results:

- **Interning the relation and perspective STRINGS measures exactly zero**, on
  all seven programs. The probe is not blind: de-sharing the same names costs
  **41–64 bytes per fact**, so the ceiling exists and the parser plus V8 were
  already sitting on it. This is the doc's own marginal — *46 extra characters
  of name cost 30 bytes per fact* — read forward.
- **What pays is one atom OBJECT per name**, in `mka` (`src/unify.ts`):
  **2.3–10.0%** of the live heap, paired and 21 of 21. Interning integers and
  strings adds 1.2–3.2% more and was not kept — their value space is the data's,
  and bounding it would bound how much of a corpus can be shared.
- **Hash-consing terms inside `Store.add` made every program 15–21% BIGGER.**
  Two causes worth carrying: the replaced term is still reachable from the
  parse, so the store adds rather than saves; and a table keyed by canonical
  renderings retains one string per distinct value, which for a functor is as
  long as the thing it indexes.
- **The 2–3× came from an arity-1 synthetic**, where args are 106 of 332 bytes.
  On real programs the boxed-`Term[]` argument representation retains
  **8.4–27.7%** of the live heap (188–345 B/fact, measured by replacing every
  fact's args with one shared empty array), so the whole of tier 2 done ideally
  — including a typed tuple, which cannot be built without changing
  `FactRec.args`'s TYPE — is about **1.4×**.

### The marginal byte, which is the number an extrapolation needs

A demo's average charges every fact a share of the program. The memory-scale rig (deleted with bench/, 2026-09-10)
measures one rule over a flat EDB at 20,000 and 40,000 base facts:

| | before | after |
|---|---|---|
| marginal per STORED fact | 638 B | **566 B** |
| marginal per BASE fact | 3191 B | **2831 B** |
| base facts in a 16 GB heap | 5.4M | **6.1M** |

Assumptions: heap only; this rule shape (one derived fact and one `derived_by`
row per base fact); pointer compression on, so a heap past 4 GB is a regime this
does not reach; no `retainTicks`.

### And 87% of what it saves is the `[$kernel]` book, not the data

Same program over data with all-distinct symbols (nothing shareable) versus a
hundred-symbol vocabulary: **72.1 B/fact saved on distinct data, 82.8 on
repeated** — so the data's own repetition is 13% of the saving and the program's
vocabulary plus the kernel book is 87%. The kernel book is 60% of the stored
facts on that program and 59–77% across five demos. **For a workload of enormous
data over a program of ordinary size, that is the worst possible split**, and it
points at a `derived_by` retention policy — a policy question, not a
representation one — as worth several times what interning is.

### Cost, and it is on the BUILD path

Paired A/B, load average 6.2–6.7: **build (load + evaluate) 0–8% slower**,
program-dependent (`spat` free, `goof` 7/8 pairs slower); **query unchanged** —
`mka` is called by the parser and the reflection, never by the matching path.
A suite re-raises a world about a thousand times a run, so that cost is real.

### What this does to §5 item 3 and to the Rust decision

Item 3 stays first — nothing else is ranked above it — but its **value is
1.02–1.13× measured and ~1.4× ideally, not 2–3×**, and it does not raise the
allocation ceiling on fork parallelism by anything like the amount §5 implies.
`f_js_is_the_prototype_rust_is_the_scale` is unaffected and better supported: the
remaining factor of forty is not reachable from inside this representation.

The coupling census that priced the port is `scanners/key_coupling.ts`
(`npm run keycoupling`). **153 sites in `src/`, of which 37 are semantic rather
than mechanical** — the places where the key's spelling and its lexicographic
collation are in the recorded answer. The sharpest is one line: `Store.witnessOf`
picks the LEAST firing signature, and a signature is built out of premise fact
KEYS, so the canonical witness of every derived fact is a function of how a key
is spelled. Order-independence of the whole record became a theorem at `e7932b1`
**over a fixed key spelling**. A native store with an integer fact id can be
byte-identical on `canonicalState` only if it carries that spelling as an
ORDERING FUNCTION it never materialises.
