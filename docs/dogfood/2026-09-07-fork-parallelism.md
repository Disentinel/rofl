# The coarse grain: does putting independent forks on threads pay?

*2026-09-07 — findings `f_the_repo_has_no_thousand_fork_search_and_iffy_says_why`,
`f_allocation_not_cores_is_the_ceiling_on_fork_parallelism`,
`f_a_mutant_that_never_fires_reads_as_a_gate_that_is_blind`,
`f_the_fork_boundary_is_per_worker_not_per_branch`,
`f_the_structural_clone_made_the_recorded_fork_cost_stale`.*

`docs/performance-invariants.md` I4 says strata are sequential and parallelism
lives only inside one — structurally, not as an implementation gap. That leaves
the COARSE grain: a FORK is an independent world, so a search over many forks
needs no lock, no shared structure and no change to the engine, and it puts no
pressure at all on the determinism contract, because order within a world never
changes and the canonical witness never moves.

This is what that claim is worth, measured.

## 0. Conditions, because the numbers depend on them

```
Apple M4 Pro (Virtual) · 8 vCPUs, one performance level · 32 GB · node v24.13.0
```

A VIRTUAL machine: "8 cores" is 8 vCPUs and the hypervisor's own scheduling is a
variable nothing here can observe. Three other agents worked on this box
throughout and a quiet box is not a state one can wait for — the load average
ranged from 3.6 to 19.8 while these were taken. So:

- **Every A/B is PAIRED**: one sequential arm immediately before every parallel
  arm, in one process, in one sitting. A load level that drifts slowly relative
  to the pair spacing lands in both halves of a pair and cancels out of the
  ratio.
- **What is reported is the paired statistic** — how many of N pairs B beat A,
  and the distribution of the per-pair ratios — not the ratio of two medians.
- **Where a number can be a COUNT or a BYTE COUNT it is**, because those do not
  move with load at all. The crossover below is stated in *branch-equivalents*
  for exactly that reason: it is a ratio of two times taken in one sitting.
- **Every absolute names the load average it was taken under, in the same
  sentence.** None of them should be compared against a figure recorded on the
  4-core Xeon the older docs were measured on.

## 1. The workloads, and the premise that did not survive contact

The brief said "IFFY and DITTO search many branches". Measured against the code:

| site | branches on a realistic run | independent? | one branch |
|---|---|---|---|
| `examples/wtf/demo.ts:556` `runSweeps` | **41** (6 sublayers, `n!` orders each) | **yes** | restore + retract + load + fixpoint, ~85 ms |
| `examples/wtf/demo.ts:624` `sbaFixpoint` | ≤ 8 | **NO — sequential**: round n+1 is built from round n's world | a fixpoint each |
| `examples/npc/demo.ts:418` `lastDerivable` | 8 (one per tick snapshot) | yes, but no shared base — each restores a DIFFERENT snapshot | restore + one `holds` |
| `examples/nope/demo.ts:418` revocation drill | 3 | yes | retract + fixpoint |
| `examples/ditto/demo.ts:408` `repair` | **1** | n/a | fork + fixpoint |
| `examples/iffy` — the mode | **0** | n/a | — |
| `src/api.ts:870` `excise` | 1 per call | n/a | clone + fixpoint |

**IFFY does not fork.** Its arms are a COLUMN — `arm[draft](A)`,
`carries[draft](A, Ed)`, and four rules — so every arm lives in one world and
reads the same corpus. `examples/iffy/README.md` says why in its own numbers: a
fork by clone copies 7,675 facts where one more arm adds 3,673, a ratio of 2.1×,
and §9's single `forkByClone` exists to PRICE the fork rather than to use it.
The one place in this repository that had a many-arm search and thought about
the cost chose not to fork at all.

**So there is no thousand-fork search here to accelerate. The largest is 41.**
That is the honest headline and it is a statement about this repository, not
about the technique.

### The independence question, answered rather than assumed

For `runSweeps` — the only workload big enough to measure — the branches are
genuinely independent, and the check is specific rather than a glance:

- every branch starts from the SAME base snapshot (`leanBase()`), not from its
  predecessor's world;
- the loop's accumulators (`seen`, `seenNaive`, `mismatches`, `compared`) are
  written and never read back into a branch's computation;
- there is no bound, no best-so-far and no early exit — the sweep counts
  DISTINCT answers, so it must visit every order;
- the oracle it checks each branch against reads an immutable board plus a
  per-branch override.

`sbaFixpoint` in the same file is the counter-example and it is worth keeping in
view: round n+1 retracts what round n killed, so it is sequential by
construction. **A search that prunes or carries a bound is not this shape**, and
nothing in this repository currently has one — which means the "does it prune"
question has been answered for today's workloads and left open for tomorrow's.

## 2. The boundary, which is the deciding arithmetic

A `worker_threads` worker shares no JS object graph. What crosses is a
structured clone. Measured on the `examples/wtf` lean world — 6,834 facts, a
2,474 KB snapshot:

| what crosses | measured |
|---|---|
| the base snapshot, 2.5 MB string, main → worker → back | **0.32 ms** round trip |
| a branch descriptor, 33 B object, round trip | **0.037 ms** |
| worker spawn + `import src/api.ts` + `import examples/wtf/demo.ts` | 50 ms for one; 107 ms for eight in parallel |
| `Rofl.fromSnapshot` of the base, inside the worker | 13 ms alone; 65–80 ms each when eight do it at once |

*(load average 3.6–7.2 for that table)*

And on the other side of the ratio, one branch of `runSweeps` is **83–88 ms** at
load average 5–9. In counts, which do not move with the load: **1,466 distinct
rule firings** over a **6,794-fact** world, from a **155 B** descriptor, returning
**2,398 B** of digest.

**The base snapshot crosses ONCE PER WORKER, not once per branch**, because
every branch of a fork search starts from the same world. That is what makes the
arithmetic work: the 2.5 MB is amortised over the branches a worker takes, and
what is actually per-branch is a 33-byte descriptor in and the answer out.

### The answer side, measured rather than feared

The acceptance oracle returns `canonicalState()` — **762 KB per branch**, 31 MB
across the sweep. Running the whole A/B with that payload and again with only
the 2.4 KB digest:

```
                        P=1     P=2     P=4     P=6     P=8
with 762 KB oracle     0.90x   1.55x   2.37x   2.49x   2.28x
digest only            0.93x   1.56x   2.34x   2.37x   2.15x
```

Within the noise of the box. **A 762 KB answer per branch is not the limiter**,
and 41 of them is 31 MB crossing the boundary for free.

### The crossover, which is the deliverable

Two different crossovers, and conflating them is how this question gets answered
wrongly:

**Per branch.** The pool costs a branch about 0.04 ms of messaging (small
answer) to 1.3 ms (762 KB answer). A branch pays for itself once its own work
exceeds that by a margin worth having. At 85 ms a `runSweeps` branch clears it
by 65× even with the oracle attached, and by 2000× without. *Any branch that
runs a fixpoint at all clears this.* A branch that is only a `holds` query does
not, and `examples/npc`'s `lastDerivable` is exactly that shape.

**Per search, and this is the binding one.** Pool setup — spawn, module import,
one `fromSnapshot` per worker — is the real cost. Stated load-independently, as
a ratio of two times taken in the same sitting:

| workers | pool setup, in BRANCH-EQUIVALENTS | break-even at |
|---|---|---|
| 1 | 2.8 | — |
| 2 | 3.6 | N > 8 branches |
| 4 | 3.7 | N > 5 branches |
| 6 | 5.0 | N > 6 branches |
| 8 | 6.2 | **N > 7 branches** |

```
   break-even:   N  >  setup_in_branch_equivalents  x  P/(P-1)
```

To get within a factor of two of the plateau needs roughly 8× setup, i.e. ~50
branches. `runSweeps` at 41 sits right at that knee, which is why it measures
what it measures — and at 164 branches (the same sweep ×4) the setup falls from
32% of arm B to 18% and the speedup rises from 2.12× to 3.11×.

**With a PERSISTENT pool the setup term goes to zero** — it is paid once per
process, not once per search — and the crossover collapses to the per-branch
one. That is the number to quote for a host that forks repeatedly.

## 3. The prototype

- `runtime/fork_pool.ts` — `runForks(opts, branches)`: spawn P workers, hand each
  the base snapshot once, dispatch branches by depletion (not a static split),
  reassemble **by index**.
- `runtime/fork_worker.ts` — imports a task module named by the host and calls
  `setup(base)` once and `run(ctx, branch)` per branch.
- `bench/fork_task_wtf.ts` — the `runSweeps` branch as such a task.
- `bench/fork_parallel.ts` — the interleaved A/B, the determinism gate, the
  mutant set.
- `bench/fork_control.ts` + `bench/fork_task_spin.ts` — the scaling control.

**Nothing in `src/` changed, and that is the design rather than an accident.**
A fork is already an independent world; `worker_threads` is a node facility and
a pool is a scheduling policy, so both belong beside `runtime/pair.ts`.
`npm run grepcheck` scans `src/` only and was never at risk.

## 4. Determinism: the gate, and what the mutant set says it covers

The gate is `canonicalState()` per branch, byte for byte, arm B against arm A,
plus the aggregate the demo actually reports (distinct answers per sublayer).
**It was GREEN on every run: 6/6 pairs at 164 branches, 3/3 at 41, 6/6 across
the worker sweep.** Results are reassembled by index, so which worker finishes
first cannot reach the caller.

One mutant is liveness; a set is coverage. Nine, each naming the constraint it
targets:

| | mutant | targets | |
|---|---|---|---|
| M1 | results reassembled in completion order | deterministic reassembly regardless of finish order | **killed** |
| M2 | one branch never comes back | every branch is answered | **killed** |
| M3 | a branch descriptor dispatched twice | each branch dispatched exactly once | **killed** |
| M4 | one fact different in one branch's world | the oracle is the whole world, not the digest | **killed** |
| M5 | every branch answered with branch 0's world | the descriptor reached the worker, not just the base | **killed** |
| M6 | the task shares mutable state across branches | **the fork contract itself** | **killed** |
| M7 | same facts, different ARRIVAL order | *nothing — `canonicalState` sorts* | **survived** |
| M8 | the worker builds worlds with `{ reuse: false }` | *nothing — the gate compares answers, not configurations* | **survived** |
| M9 | the same fault in BOTH arms (shared task module) | *nothing — a differential cannot see a common-mode fault* | **survived** |

**6 of 9 killed.** M1–M6 are injections of exactly the defect a broken pool
produces; M6 is a real leaky task run through both arms for real, and it is the
one that matters most, because sharing mutable state is the one thing a worker
cannot check about ITSELF — a worker cannot know it is one of eight.

The three survivors all came from asking **where the check is structurally
unable to look**, not what else could be broken — the question this
repository already records as the only one that produces survivors:

- **M7.** `canonicalState()` sorts by construction, so two worlds holding the
  same facts in a different *arrival* order are byte-identical to it. Measured,
  not argued: two stores loaded `p(1) p(2) p(3)` and `p(3) p(2) p(1)` differ in
  `allFacts()` and agree in `canonicalState()`. Arrival order is not decoration
  — `assumptionOf` reads it, and commit `3cff6f4` turned `clone` around
  specifically to preserve it. **Nothing in this pool can reorder arrivals**
  (each branch is one unchanged `fromSnapshot` plus one `load`), so the hole is
  not reached today. It *would* be reached by a pool that split ONE world's
  work — the shared-memory design this measurement is deliberately not about.
- **M8.** Nothing carries the host's `EvalOpts` across the boundary; the task
  module constructs its own `Rofl`. A worker running `{ reuse: false }` — or a
  different evaluator — is invisible to a differential on the result. That is
  safe exactly as far as those configurations are known to agree, which for
  reuse is pinned by `test/derived-reuse.test.ts` and for the two evaluators is
  *not* pinned everywhere (`LIMITS.md`, the stock-path corner).
- **M9.** Both arms share one task module by construction — that is what makes
  the A/B honest about the *thread* and blind about the *task*. Demonstrated:
  run both arms through the leaky task and they agree with each other while
  disagreeing with the truth. Only an oracle outside both arms closes it, and
  `examples/wtf` already has one (`simulate`).

### And one mutant reported SURVIVED without having run

The first version of `bench/fork_task_leaky.ts` wrote
`w.assert(\`seen_before(${n})\`)` **with no terminating dot**. The kernel refused
it — `line 1: expected ':-', got 'eof'` — and returned the refusal in a value
nobody read. So the leak leaked nothing, the arms matched, and the harness
printed `SURVIVED` beside `targets: the fork contract itself`. Read literally
that says *the determinism gate cannot see a schedule leak*, which is the exact
opposite of the truth. **A mutant that never fires is indistinguishable, in the
output, from a gate that cannot see it** — and it fails in the direction that
makes a gate look weaker than it is, which is the direction nobody
double-checks because it reads as caution. The file now asserts that it was
planted (`a.ok`, then `w.holds(...)`, throwing on either) before it is allowed
to report on the gate. Recorded as
`f_a_mutant_that_never_fires_reads_as_a_gate_that_is_blind`.

## 5. What it is worth, and where the rest went

**The headline, paired, on 8 vCPUs:**

| search | pairs where B beat A | ratios | median |
|---|---|---|---|
| 41 branches (the real `runSweeps`) | 6/6 | 1.98–2.21 | **2.12×** |
| 41 branches, second sweep, lighter load | 5/5 | 2.23–2.42 | **2.34×** |
| 164 branches (the same sweep ×4) | 6/6 | 2.52–3.15 | **3.11×** |
| 164 branches, run phase only (persistent pool) | — | 3.7–3.8 | **~3.8×** |

The worker-count sweep, run twice at different load levels — the second is the
reproduction, not a replacement, and both are printed because the agreement
between them is the claim:

```
  sweep 1, 6 pairs each, load avg 3.7-6.6      sweep 2, 5 pairs each, load avg 5.0
  P= 1: 0/6 pairs, 0.86-0.94 (med 0.89x)       P= 1: 0/5 pairs, 0.88-0.93 (med 0.90x)
  P= 2: 6/6 pairs, 1.54-1.59 (med 1.57x)       P= 2: 5/5 pairs, 1.53-1.72 (med 1.60x)
  P= 4: 6/6 pairs, 2.12-2.62 (med 2.30x)       P= 4: 5/5 pairs, 2.30-2.45 (med 2.37x)
  P= 6: 6/6 pairs, 2.21-2.40 (med 2.38x)       P= 6: 5/5 pairs, 2.43-2.58 (med 2.54x)
  P= 8: 6/6 pairs, 1.98-2.21 (med 2.12x)       P= 8: 5/5 pairs, 2.23-2.42 (med 2.34x)
```

**P=1 is the pool's own overhead, and it is 10%**: one worker is consistently
*slower* than no worker, 0/6 and 0/5 pairs, which is the honest floor. The
sweep also says the pool saturates at P=6 and gets slightly worse at P=8 — eight
workers on eight vCPUs leaves nothing for the main thread.

**So it is 3.1× on 8 cores, not 8×, and here is where the rest went** — measured
with two controls on the same pool, at the same worker counts, interleaved,
within minutes of each other:

| workload on 8 workers | speedup | what it isolates |
|---|---|---|
| pure arithmetic, no allocation | **5.74×** | what this box gives at all |
| `JSON.parse` of the same 2.5 MB base, nothing else | **3.78×** | what ALLOCATION gives |
| the real fork search, 164 branches | **3.11×** | the workload |

**A speedup below the core count means either the workload does not
parallelise or the box does not, and one control cannot tell them apart.** Two
can. The box gives 5.74×; allocation alone gives 3.78×; and a fork branch is
dominated by allocation — 17% of it is `Rofl.fromSnapshot` parsing 2.5 MB and
building 6,834 facts, and the 80% that is the fixpoint allocates throughout.
Eight of those at once queue for memory bandwidth and for the allocator.

So of the missing 5×: about **2.2×** is the allocation ceiling this box imposes
on this shape, about **0.5×** is pool setup at 41 branches (a persistent pool
removes it), and the rest is tail imbalance — 41 branches over 8 workers is 5.1
each and the tail is one whole branch.

**Nothing here is synchronisation.** The branches share nothing. I4's "do not
plan for linear speedup from cores" is right, and the reason on this workload is
the memory system, which points at the same place the memory tiers do: a compact
fact representation would raise the parallel ceiling as a side effect.

## 6. What one branch is made of, and what that does to copy-on-write

`npm run forkstages`, load average 8.9:

```
  WHOLE BRANCH                         88.3 ms  100%
    Rofl.fromSnapshot(base)            14.6 ms   17%   what a worker pays that a same-process fork need not
    retract x4                          1.4 ms    2%
    load + fixpoint                    70.8 ms   80%   the work itself
    canonicalState + digest             2.3 ms    3%   the GATE, not the workload

  one store.clone() of that world       1.0 ms    1%   what a copy-on-write fork would replace
```

**A free fork would move a branch from 88 ms to about 75 ms.** That is the whole
of what copy-on-write is worth to this workload, and it is a 15% cut of a term
that is not the limiter.

### The recorded fork cost is stale, and the reason is nameable

`docs/performance-invariants.md` puts `store.clone()` at **21.7–22.5 µs/fact** on
a realistic store and ranks copy-on-write third on the strength of it. Every
figure in that line was measured when `clone()` was `snapshot() → JSON →
restore()`. Commit `3cff6f4` replaced it with a **structural** copy that walks
the fact map directly (`src/store.ts:779`), and a figure taken through the
serialising path is not a figure about this one.

Re-measured with a bare-store control in the same run (`npm run forkclone`,
load average 8.9), on stores that really do carry derived facts, witnesses and
firings:

| store | facts (derived / witnesses) | `clone()` | save+restore | ratio |
|---|---|---|---|---|
| bare ground facts | 15,060 | 0.11 µs/fact | 3.04 µs/fact | 28.6× |
| bare ground facts | 120,060 | 0.26 | 3.48 | 13.6× |
| realistic | 7,504 (6,480 / 3,240) | **0.15** | 3.05 | 20.1× |
| realistic | 38,304 (36,080 / 18,040) | **0.40** | 3.56 | 9.0× |

A 4-core Xeon against an 8-vCPU M4 Pro is worth a factor of a few; the gap here
is 55–150×. **So the doc's "2.2 seconds for a realistic 100k-fact fork" and
"half an hour for a thousand-fork search" should not be quoted.** A realistic
100k-fact fork is on the order of **40 ms** of clone.

Three cautions, because this line of reasoning has been wrong three times
already (`f_fork_copies_the_whole_store` → `f_fork_time_argument_died_with_the_insert_fix`
→ `f_i_measured_the_cheapest_fact_and_generalised`):

1. The **memory** argument for copy-on-write is untouched. A structural clone is
   still a full copy in RAM, and bytes per fact is still the ceiling.
2. The per-fact cost is **not flat** — it rises 1.7–2.6× between 7.5k and 38k
   facts. Extrapolating 100k from the 7.5k figure underestimates; 40 ms is a
   floor.
3. The right-hand column is what a WORKER must pay, because a worker cannot be
   handed an object graph — and that is the boundary's real price. It is **per
   worker**, not per branch.

## 7. What would make this worth building for real

It already pays where it is used, and the honest size of the prize is small,
because the searches here are small:

- **`examples/wtf`'s order sweep**: 3.5 s → 1.5 s at load average 5.0 on 8
  workers. Real, and about two seconds.
- **The tests are the bigger fork workload than the demos.**
  `test/kernel-arity.test.ts` builds ~800 independent worlds, `phase2` 240,
  `phase4` 100, `rofl-safety` and `rule-answers` 70 each. Those are all
  embarrassingly parallel by the census, all well past the 7-branch crossover,
  and node already parallelises the suite by FILE — which is exactly why the
  suite is tail-bound on its longest single file. A pool INSIDE the longest
  test files is the one place in this repository where this technique has
  several seconds to win, and it needs no engine change.
- **What would make it worth more**: a search with hundreds of branches. The
  design pressure for one was real and was resolved the other way — IFFY chose
  an arm column over a fork, and that decision stands on its own numbers
  (2.1× fewer facts per arm than per fork) regardless of threads.
- **What would NOT make it worth more**: a cheaper fork. Copy-on-write cuts the
  17% that is `fromSnapshot`, which makes each branch cheaper and therefore
  makes the pool's fixed setup a LARGER share. The two moves pull against each
  other.

## 8. What is not known

- Whether the allocation ceiling is memory bandwidth, the V8 allocator, or the
  hypervisor. The control separates allocation from arithmetic; it does not
  separate those three. **Unverified.**
- Whether a `SharedArrayBuffer` layout would help. It cannot be tested without
  the columnar representation (tier 3), and nothing here measures it.
- Whether the pool composes with the sibling's `Rofl.fork()` (restore once,
  clone per branch). It should — the task module would call `store.clone()`
  where it now calls `fromSnapshot` — but **that composition is unbuilt and
  unmeasured here.**
- Every absolute in this document was taken on a virtual machine under a load
  average between 3.6 and 19.8, stated per figure. The ratios and the paired
  statistics are the durable part.
